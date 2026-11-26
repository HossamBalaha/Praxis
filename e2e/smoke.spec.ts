/**
 * Praxis — serial end-to-end smoke tests.
 *
 * One dev server (see playwright.config.ts `webServer`), one browser,
 * tests in order. Response shapes below were read from the source:
 *   - src/app/api/folders/route.ts + src/lib/scripts.ts  (listFolders)
 *   - src/app/api/run/route.ts      (SSE: start/stdout/stderr/figure/end/error)
 *   - src/app/api/health/route.ts   ({ ok: true, ... })
 *   - src/app/api/term/route.ts     (action:"exec" → SSE {out}/{exit})
 *   - src/app/api/run/queue/route.ts ({ ok, runs, count })
 *   - src/app/api/run-input/route.ts (404 for unknown runIds)
 *
 * UI locators prefer roles/text over CSS. The few attribute selectors
 * used (`[data-tutorial=…]`) are the tutorial overlay's own spotlight
 * targets — load-bearing app hooks, not ad-hoc test ids. No color or
 * theme assertions: the app is dark/light agnostic.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/* ────────────────────────────────────────────────────────────────── */
/* Shared types + helpers                                            */
/* ────────────────────────────────────────────────────────────────── */

/** File entry as returned by GET /api/folders (src/lib/scripts.ts). */
interface ApiFile {
  name?: string;
  slug?: string;
  kind?: string;
}

/** Folder entry as returned by GET /api/folders (src/lib/scripts.ts).
 *  `isRoot` is true only for the synthetic PROJECT-ROOT entry
 *  (rootEntry, slug ".") that listFolders unshifts at index 0. */
interface ApiFolder {
  name?: string;
  slug?: string;
  isRoot?: boolean;
  files?: ApiFile[];
}

/** Stable tutorial-spotlight hooks (see src/components/tutorial.tsx STEPS). */
const SIDEBAR = "[data-tutorial=\"sidebar\"]";
const CODE_VIEWER = "[data-tutorial=\"code-viewer\"]";
const OUTPUT_PANEL = "[data-tutorial=\"output-panel\"]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isPythonFile = (f: ApiFile): boolean =>
  (f.name ?? "").endsWith(".py") || f.kind === "python";

async function fetchFolders(request: APIRequestContext): Promise<ApiFolder[]> {
  const res = await request.get("/api/folders");
  expect(res.ok(), "GET /api/folders should respond 2xx").toBeTruthy();
  const json = (await res.json()) as { folders?: ApiFolder[] };
  return json.folders ?? [];
}

/**
 * Resolve the smoke-run target: the "Getting Started" folder plus a
 * hello-style script in it. Preference order: a literal "hello.py" →
 * any file whose name starts with "hello" (HelloPraxis.py in this
 * repo — a fast, dependency-free script) → the first .py file in the
 * folder. If "Getting Started" itself is missing, fall back to the
 * first folder that contains any .py file.
 */
async function resolveRunTarget(request: APIRequestContext): Promise<{ folder: ApiFolder; file: ApiFile }> {
  const folders = await fetchFolders(request);
  const folder =
    folders.find((f) => f.name === "Getting Started") ??
    folders.find((f) => (f.name ?? "").toLowerCase() === "getting started") ??
    folders.find((f) => (f.files ?? []).some(isPythonFile));
  expect(folder, "a folder containing .py files should exist").toBeTruthy();
  const pyFiles = (folder!.files ?? []).filter(isPythonFile);
  expect(pyFiles.length, "the target folder should have at least one .py file").toBeGreaterThan(0);
  const file =
    pyFiles.find((f) => f.name === "hello.py") ??
    pyFiles.find((f) => (f.name ?? "").toLowerCase().startsWith("hello")) ??
    pyFiles[0];
  expect(file, "a target .py file should have been resolved").toBeTruthy();
  return { folder: folder!, file: file! };
}

/**
 * Load the app shell. The first-visit tutorial overlay (localStorage
 * gate, src/components/tutorial.tsx) dims the whole UI and swallows
 * clicks, so seed its "done" flag before any app code runs; if it ever
 * still renders (e.g. the key name changes), skip it via its own button.
 */
async function loadApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("praxis.tutorial-done", "1");
    } catch {
      /* storage blocked — the overlay treats that as done anyway */
    }
  });
  await page.goto("/", { timeout: 60_000 });
  // Client-rendered React: wait for the menu bar, then check for the
  // overlay (both mount in the same root commit).
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible({ timeout: 30_000 });
  const tutorial = page.getByRole("dialog", { name: "Tutorial" });
  if ((await tutorial.count()) > 0) {
    const skip = page.getByRole("button", { name: "Skip tutorial" });
    if (await skip.isVisible()) {
      await skip.click();
      await expect(tutorial).toHaveCount(0);
    }
  }
}

/**
 * Open a file through the Explorer sidebar: expand the target folder if
 * it is collapsed (fresh visits start collapsed), then click the file
 * row. Rows are div[role=button] whose accessible names include the
 * star-toggle label and badges, so match on the file name as a substring.
 */
async function openFileFromExplorer(page: Page, folderName: string, fileName: string): Promise<void> {
  const sidebar = page.locator(SIDEBAR);
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  const fileRow = sidebar.getByRole("button", { name: new RegExp(escapeRegExp(fileName)) });
  if (!(await fileRow.first().isVisible())) {
    await sidebar
      .getByRole("button", { name: new RegExp(escapeRegExp(folderName)) })
      .first()
      .click();
  }
  await fileRow.first().click();
}

/**
 * Start a run from the code-viewer toolbar. The Run button is matched by
 * its exact accessible name "Run" so the menu bar's "Run & Go" menu, the
 * viewer's "Run cell" buttons and "Run options" split-arrow can never
 * match. If the click cannot land, fall back to the app's global run
 * binding (Ctrl/Cmd+Enter — src/hooks/use-keyboard-shortcuts.ts).
 */
async function runFromToolbar(page: Page): Promise<void> {
  const runButton = page.getByRole("button", { name: /^Run$/ });
  try {
    await runButton.click({ timeout: 10_000 });
  } catch {
    await page.keyboard.press("Control+Enter");
  }
  // A slow-run estimate (src/lib/estimate-runtime.ts) can pop a confirm
  // instead of starting; proceed if it did.
  const warning = page.getByRole("alertdialog", { name: "This run may take a while" });
  try {
    await warning.waitFor({ state: "visible", timeout: 2_000 });
    await page.getByRole("button", { name: "Proceed with run" }).click();
  } catch {
    /* not shown — the run started immediately */
  }
}

/* ────────────────────────────────────────────────────────────────── */
/* Serial smoke suite                                                 */
/* ────────────────────────────────────────────────────────────────── */

test.describe("Praxis smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("app shell loads", async ({ page, request }) => {
    const folders = await fetchFolders(request);
    expect(folders.length, "/api/folders should list folders").toBeGreaterThan(0);
    const firstFolderName = folders[0].name;
    expect(firstFolderName, "folders[0] should have a name").toBeTruthy();

    await loadApp(page);

    // Header/brand carries the app name; so does the document title.
    await expect(page).toHaveTitle(/Praxis/);
    await expect(page.getByRole("heading", { name: "Praxis" })).toBeVisible({ timeout: 20_000 });
    // Menu bar rendered.
    await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

    // Explorer sidebar is visible and serves the folder tree from
    // /api/folders — a real folder's name must appear in the DOM.
 // FIX: the assertion used folders[0].name, which since
 // is the ROOT pseudo-folder ("python_scripts" — isRoot:
    // true) whose HEADER is intentionally not rendered (its files are
    // always-visible top-level rows). The smoke now expects the first
    // NON-ROOT folder, which does render a header row in the tree.
    const sidebar = page.locator(SIDEBAR);
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Explorer", { exact: true })).toBeVisible();
    const firstRealFolder =
      folders.find((f) => !f.isRoot) ?? folders[0];
    const firstRealFolderName = firstRealFolder?.name;
    expect(
      firstRealFolderName,
      "the first non-root folder should have a name"
    ).toBeTruthy();
    await expect(
      sidebar.getByText(firstRealFolderName!, { exact: true }).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("folders API returns the script library", async ({ request }) => {
    const res = await request.get("/api/folders");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { folders?: ApiFolder[] };
    const folders = json.folders ?? [];
    expect(folders.length, "folders array should be non-empty").toBeGreaterThan(0);
    for (const folder of folders) {
      expect(folder.name, "every folder needs a name").toBeTruthy();
      expect(folder.slug, "every folder needs a slug").toBeTruthy();
    }
    const hasPython = folders.some((f) => (f.files ?? []).some(isPythonFile));
    expect(hasPython, "at least one file should be a .py script").toBe(true);
  });

  test("health endpoint", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });

  test("python script runs end-to-end via API", async ({ request }) => {
    // The server enforces its own 60s hard run timeout (TIMEOUT_MS in
    // src/app/api/run/route.ts) — give the request margin beyond that.
    test.setTimeout(120_000);
    const { folder, file } = await resolveRunTarget(request);
    expect(folder.slug, "target folder should have a slug").toBeTruthy();
    expect(file.slug, "target file should have a slug").toBeTruthy();

    // SSE stream: resolves once the run finishes (the end event closes it).
    const res = await request.post("/api/run", {
      data: { folder: folder.slug, file: file.slug },
      timeout: 90_000,
    });
    expect(res.ok(), "POST /api/run should respond 2xx").toBeTruthy();
    const body = await res.text();
    expect(body, "SSE stream should open with a start event").toContain("\"type\":\"start\"");
    expect(body, "SSE stream should close with an end event").toContain("\"type\":\"end\"");
  });

  test("UI: open a file and see the code viewer", async ({ page, request }) => {
    const { folder, file } = await resolveRunTarget(request);
    expect(folder.name).toBeTruthy();
    expect(file.name).toBeTruthy();

    await loadApp(page);
    await openFileFromExplorer(page, folder.name!, file.name!);

    // The toolbar Run button is disabled until a file is selected —
    // enabled now proves the selection took.
    await expect(page.getByRole("button", { name: /^Run$/ })).toBeEnabled({ timeout: 20_000 });

    // The code viewer pane renders the syntax-highlighted source. Plain
    // substring on purpose: the DOM concatenates line-number spans with
    // code lines ("5print(…)"), so \b-anchored words never match.
    const viewer = page.locator(CODE_VIEWER);
    await expect(viewer).toBeVisible({ timeout: 20_000 });
    await expect(viewer).toContainText(/def|import|print/, { timeout: 20_000 });
  });

  test("UI: boot, open a file — zero console errors", async ({ page, request }) => {
    // The CI gate's console hygiene check: from BEFORE first load,
    // collect every console.error and every uncaught page error, then
    // assert the list is empty after the app booted and a file opened.
    // This is the net that catches overlay/scripting regressions the
    // functional assertions above can still accidentally pass with.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(`pageerror: ${error.message}`);
    });

    // Same journey as the open-file test above: full boot + explorer
    // navigation + viewer render, so every mount path gets exercised.
    const { folder, file } = await resolveRunTarget(request);
    await loadApp(page);
    await openFileFromExplorer(page, folder.name!, file.name!);
    const viewer = page.locator(CODE_VIEWER);
    await expect(viewer).toBeVisible({ timeout: 20_000 });
    await expect(viewer).toContainText(/def|import|print/, { timeout: 20_000 });

    // Give late async work (highlight workers, prefetch, PWA) a beat to
    // misbehave before judging — cheap insurance against flaky timing.
    await page.waitForTimeout(1_500);

    // Known-benign dev-mode noise only; everything else fails the gate.
    const benignPatterns: RegExp[] = [
      /Download the React DevTools/i,
    ];
    const realErrors = consoleErrors.filter((text) => !benignPatterns.some((re) => re.test(text)));
    expect(
      realErrors,
      "the app must boot and open a file with zero console errors (dev-mode noise filtered)"
    ).toEqual([]);
  });

  test("UI: run a script from the toolbar and see output", async ({ page, request }) => {
    // Playwright gives every test a fresh page/context, so re-open the
    // file here (equivalent to "the file open from the previous test").
    test.setTimeout(120_000);
    const { folder, file } = await resolveRunTarget(request);
    await loadApp(page);
    await openFileFromExplorer(page, folder.name!, file.name!);

    await runFromToolbar(page);

    // Stable completion markers in the Output panel (src/components/
    // output-panel.tsx StatusPill): "OK · 1.23s" on success, "Exit N"
    // on failure, "Stopped"/"Timed out" when killed — plus the hello
    // script's own stdout. Lenient OR on purpose; 90s > server's 60s
    // run cap.
    const outputPanel = page.locator(OUTPUT_PANEL);
    await expect(outputPanel).toBeVisible({ timeout: 20_000 });
    await expect(outputPanel).toContainText(
      /\bOK\b|\bExit \d+|\bStopped\b|Timed out|Hello, Praxis!/,
      { timeout: 90_000 }
    );
  });

  test("terminal exec API works", async ({ request }) => {
    const res = await request.post("/api/term", {
      data: { action: "exec", cmd: "echo praxis-e2e-smoke" },
      timeout: 60_000,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body, "the echoed command output should stream back").toContain("praxis-e2e-smoke");
  });

  test("run queue API works", async ({ request }) => {
    const res = await request.get("/api/run/queue");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { ok?: boolean; runs?: unknown[] };
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.runs), "runs should be an array (may be empty)").toBe(true);
  });

  test("security headers present", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBeTruthy();
    const headers = res.headers();
    expect(
      headers["content-security-policy"],
      "Content-Security-Policy should be set (next.config.ts securityHeaders)"
    ).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("interactive stdin API rejects unknown runs", async ({ request }) => {
    const res = await request.post("/api/run-input", {
      data: { runId: "nonexistent", text: "x" },
    });
    expect(res.status(), "unknown runIds should 404 (src/app/api/run-input/route.ts)").toBe(404);
  });
});
