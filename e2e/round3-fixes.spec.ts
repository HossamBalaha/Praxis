/**
 * Praxis — Round 3 fix verification (serial e2e).
 *
 * Three regressions from the Round 3 audit, each proven from the UI
 * with real geometry reads (not source greps):
 *
 *   1. Show-less preview — the collapsed ("Show less") code preview
 *      must share ONE clip between the text and the overlays: the
 *      scrollport pins overflow hidden, scrollHeight === clientHeight,
 *      scrollTop stays 0 and NO nested <pre> may compute a scrollable
 *      overflow (the old nested react-syntax-highlighter <pre> painted
 *      its own vertical scrollbar and scrolled the words under the
 *      fixed squiggle overlays).
 *
 *   2. Split-pane gutters — a FUNCTIONAL resize handle must sit
 *      between EVERY adjacent pane pair: with 3 panes, dragging the
 *      2↔3 gutter grows pane 2, shrinks pane 3 and leaves pane 1
 *      untouched (the old static 1px divider could not be dragged at
 *      all past the first gutter).
 *
 *   3. Untitled API client — Tools ▸ API Client must open an
 *      in-memory Untitled-N.http tab and write NOTHING to disk until
 *      an explicit Save As picks folder + name (the old command
 *      POSTed requests.http straight into the active folder).
 *
 * Reuses the smoke spec's conventions: tutorial-gated app load,
 * role/aria locators, /api/folders + /api/code for targets.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/* Stable tutorial-spotlight hook (src/components/tutorial.tsx STEPS). */
const SIDEBAR = "[data-tutorial=\"sidebar\"]";

/* The view-mode code scrollport (code-viewer.tsx: role="region",
 * aria-label="Code viewport — …"). */
const CODE_VIEWPORT = "[role=\"region\"][aria-label^=\"Code viewport\"]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** File entry as returned by GET /api/folders. */
interface ApiFile {
  name?: string;
  slug?: string;
  kind?: string;
}

/** Folder entry as returned by GET /api/folders. */
interface ApiFolder {
  name?: string;
  slug?: string;
  isRoot?: boolean;
  files?: ApiFile[];
}

/** True when the file lives at the TOP LEVEL of its folder — slugs
 *  are base64-encoded RELATIVE PATHS, so decode before checking for a
 *  "/" (a raw base64 string never contains one). */
function slugIsTopLevel(slug: string | undefined): boolean {
  try {
    const decoded = Buffer.from(slug ?? "", "base64").toString("utf-8");
    return !(decoded.includes("/") || decoded.startsWith("."));
  } catch {
    return false;
  }
}

async function fetchFolders(request: APIRequestContext): Promise<ApiFolder[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await request.get("/api/folders");
      expect(res.ok(), "GET /api/folders should respond 2xx").toBeTruthy();
      const json = (await res.json()) as { folders?: ApiFolder[] };
      return json.folders ?? [];
    } catch {
      // A cold dev server resets sockets while the route first
      // compiles — back off briefly and retry.
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw new Error("GET /api/folders kept resetting — the dev server never warmed up.");
}

/** Fetch one file's text via /api/code (used to pick a LONG file). */
async function fetchCode(request: APIRequestContext, folderSlug: string, fileSlug: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await request.get(`/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`);
      if (!res.ok()) return null;
      const json = (await res.json()) as { content?: string };
      return typeof json.content === "string" ? json.content : null;
    } catch {
      // A cold dev server can reset the socket while the route first
      // compiles — back off briefly and retry.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return null;
}

/** Seed the tutorial gate away, then load the app shell. */
async function loadApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("praxis.tutorial-done", "1");
    } catch {
      /* Storage blocked — the overlay treats that as done anyway. */
    }
  });
  await page.goto("/", { timeout: 60_000 });
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible({ timeout: 30_000 });
}

/** Open a file through the Explorer sidebar (expands the folder first). */
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
  await expect(page.locator(CODE_VIEWPORT)).toBeVisible({ timeout: 30_000 });
}

/** Every .http/.rest file name currently on disk, sorted (change
 *  detector for the untitled-tab test — NOTHING may be written). */
async function httpFilesOnDisk(request: APIRequestContext): Promise<string[]> {
  const folders = await fetchFolders(request);
  const names: string[] = [];
  for (const folder of folders) {
    for (const file of folder.files ?? []) {
      if (/\.(http|rest)$/i.test(file.name ?? "")) {
        names.push(`${folder.name}/${file.name}`);
      }
    }
  }
  return names.sort();
}

/* ─── 1. Show-less preview geometry. ─ */
test.describe.serial("Round 3 — regression verification", () => {
  test("Show Less: one shared clip, zero scrollbars, overlays glued to the words", async ({ page, request }) => {
    // A cold dev server compiles routes on demand — allow twice the
    // suite default so first-boot compile never counts as a failure.
    test.setTimeout(120_000);
    // A viewport short enough that even a mid-size file is collapsible
    // (the collapsedLineCount floor is 8 rows — the very geometry the
    // nested-scrollbar bug lived in).
    await page.setViewportSize({ width: 1280, height: 520 });
    await loadApp(page);

    // Resolve a Python file with 30+ lines from a top-level folder.
    // Only TOP-LEVEL files qualify — the explorer helper expands one
    // folder level, and nested slugs ("Long Files/…") are not reachable
    // through it.
    const folders = await fetchFolders(request);
    let target: { folder: ApiFolder; file: ApiFile } | null = null;
    for (const folder of folders) {
      for (const file of folder.files ?? []) {
        if ((file.name ?? "").endsWith(".py") || file.kind === "python") {
          if (!slugIsTopLevel(file.slug)) {
            continue;
          }
          const code = await fetchCode(request, folder.slug ?? "", file.slug ?? "");
          if (code && code.split("\n").length >= 30) {
            target = { folder, file };
            break;
          }
        }
      }
      // A target was found — stop scanning folders.
      if (target) {
        break;
      }
    }
    expect(target, "a Python file with 30+ lines should exist").toBeTruthy();
    const { folder, file } = target!;

    // Open it (files open in the collapsed Show-less preview by default).
    await openFileFromExplorer(page, folder.name ?? "", file.name ?? "");
    const viewport = page.locator(CODE_VIEWPORT).first();
    await expect(viewport).toBeVisible({ timeout: 30_000 });

    // Force the collapsed state if a prior setting expanded it: the pill
    // reads "Show less" ONLY when expanded.
    const pill = page.getByRole("button", { name: /Show full code|Show less/ }).first();
    await expect(pill).toBeVisible({ timeout: 30_000 });
    if ((await pill.innerText()).includes("Show less")) {
      await pill.click();
    }

    // Geometry proof, polled to let the ResizeObserver measurement land:
    // the scrollport must be fully at rest and clipped.
    await expect
      .poll(
        async () =>
          viewport.evaluate((el) => ({
            overflowX: window.getComputedStyle(el).overflowX,
            overflowY: window.getComputedStyle(el).overflowY,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
          })),
        { timeout: 8_000 }
      )
      .toEqual(expect.objectContaining({
        overflowY: "hidden",
        scrollHeight: expect.any(Number),
      }));
    const geometry = await viewport.evaluate((el) => ({
      overflowY: window.getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    }));
    // The exact acceptance from the audit: scrollHeight === clientHeight
    // (no scroll possible ⇒ no scrollbar can render).
    expect(geometry.scrollHeight).toBe(geometry.clientHeight);
    expect(geometry.scrollTop).toBe(0);
    expect(geometry.overflowY).toBe("hidden");

    // The nested-scrollbar kill: NO <pre> inside the clip may compute a
    // scrollable overflow on either axis (the detachment vector — the
    // old theme <pre> computed overflow-y auto under its capped height).
    const preOverflows = await viewport.evaluate((el) =>
      Array.from(el.querySelectorAll("pre")).map((pre) => {
        const cs = window.getComputedStyle(pre);
        return { overflowX: cs.overflowX, overflowY: cs.overflowY };
      })
    );
    expect(preOverflows.length, "the code <pre> should be inside the viewport").toBeGreaterThan(0);
    for (const [index, pre] of preOverflows.entries()) {
      expect([pre.overflowX], `pre #${index} overflow-x must not be scrollable`).not.toContain("auto");
      expect([pre.overflowX], `pre #${index} overflow-x must not be scrollable`).not.toContain("scroll");
      expect([pre.overflowY], `pre #${index} overflow-y must not be scrollable`).not.toContain("auto");
      expect([pre.overflowY], `pre #${index} overflow-y must not be scrollable`).not.toContain("scroll");
    }

    // Wheel over the clipped preview must NOT move the words (the
    // overlays stay glued because nothing can scroll at all).
    await viewport.click({ position: { x: 200, y: 100 } });
    await page.mouse.wheel(0, 600);
    const scrollTopAfterWheel = await viewport.evaluate((el) => el.scrollTop);
    expect(scrollTopAfterWheel).toBe(0);
  });

  /* ─── 2. Split gutters between ALL adjacent panes. ─ */
  test("Split panes: every adjacent pair has a draggable, keyboard-resizable gutter", async ({ page, request }) => {
    // Same cold-boot allowance as the first test.
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadApp(page);

    // Resolve three openable Python files from one folder for the
    // panes — top-level files only (no nested "/" slugs: the explorer
    // helper expands a single folder level).
    const folders = await fetchFolders(request);
    const seedFolder =
      folders.find((f) => (f.files ?? []).filter((x) => (x.name ?? "").endsWith(".py") && slugIsTopLevel(x.slug)).length >= 3) ??
      folders.find((f) => (f.files ?? []).some((x) => (x.name ?? "").endsWith(".py")));
    expect(seedFolder, "a folder with 3+ Python files should exist").toBeTruthy();
    const pyFiles = (seedFolder!.files ?? []).filter((f) => (f.name ?? "").endsWith(".py") && slugIsTopLevel(f.slug)).slice(0, 3);
    expect(pyFiles.length).toBe(3);

    // Open ONE file so the main editor area (and the split row) renders.
    await openFileFromExplorer(page, seedFolder!.name ?? "", pyFiles[0].name ?? "");

    // Dispatch the app's own split contract with three explicit targets
    // (the same payload the tab bar's multi-select Split sends).
    await page.evaluate((targets) => {
      window.dispatchEvent(new CustomEvent("praxis:split-editor", { detail: { targets } }));
    }, pyFiles.map((f) => ({
      folderSlug: seedFolder!.slug,
      fileSlug: f.slug,
      fileName: f.name,
      folderName: seedFolder!.name,
    })));

    // Three panes must be live, each with a functional gutter AFTER it.
    const panes = page.locator("[data-split-pane]");
    await expect(panes).toHaveCount(3, { timeout: 15_000 });

    // The audit's exact complaint: a working handle BETWEEN panes 2..n.
    const gutter23 = page.getByRole("separator", { name: "Resize split panes 2 and 3" });
    await expect(gutter23).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize split panes 1 and 2" })).toBeVisible();

    // Widths before the drag (flex-basis shares in px).
    const widthsBefore = await panes.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).getBoundingClientRect().width)
    );

    // Drag the 2↔3 gutter right by ~30px — large enough to prove the
    // pair moved, small enough to stay clear of pane 3's 10% floor so
    // the keyboard step below has headroom (a drag to the floor makes
    // +2% a CORRECT no-op — the clamp, not a bug).
    const box = await gutter23.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2, { steps: 10 });
    await page.mouse.up();

    // Widths after: pane 2 GREW, pane 3 SHRANK, pane 1 UNTOUCHED —
    // the pair-sum invariant from lib/editor-geometry.ts.
    const widthsAfter = await panes.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).getBoundingClientRect().width)
    );
    expect(widthsAfter[1]).toBeGreaterThan(widthsBefore[1] + 15);
    expect(widthsAfter[2]).toBeLessThan(widthsBefore[2] - 15);
    expect(Math.abs(widthsAfter[0] - widthsBefore[0])).toBeLessThan(2);

    // Keyboard resize: arrows move the share by ±2% with the same clamps.
    const valuenowBefore = await gutter23.getAttribute("aria-valuenow");
    await gutter23.focus();
    await page.keyboard.press("ArrowLeft");
    const valuenowAfter = await gutter23.getAttribute("aria-valuenow");
    expect(Number(valuenowAfter)).toBeGreaterThan(Number(valuenowBefore));
  });

  /* ─── 3. Untitled API client draft — nothing on disk until Save As. ─ */
  test("API Client: untitled in-memory tab, Save As writes it where chosen", async ({ page, request }) => {
    // Same cold-boot allowance as the first test.
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadApp(page);

    // Self-heal: drop any e2e-round3.http left behind by a previous
    // (failed) run so the baseline below is clean and re-runs are
    // deterministic.
    for (const folder of await fetchFolders(request)) {
      for (const file of folder.files ?? []) {
        if (file.name === "e2e-round3.http") {
          await request.post("/api/file-delete", { data: { folder: folder.slug, file: file.slug } });
        }
      }
    }

    // Baseline: every .http/.rest currently on disk.
    const beforeFiles = await httpFilesOnDisk(request);

    // Tools ▸ API Client (.http)… — the menu path a user takes. Radix
    // menubar triggers can swallow the first click while the deferred
    // header is still settling, so verify the item is actually open
    // before clicking it, retrying the trigger a couple of times.
    const toolsTrigger = page.locator("[role=\"menuitem\"][title^=\"Tools menu\"]");
    const apiItem = page.getByRole("menuitem", { name: /API Client \(\.http\)/ });
    for (let attempt = 0; attempt < 3; attempt++) {
      await toolsTrigger.hover();
      await toolsTrigger.click();
      if (await apiItem.isVisible().catch(() => false)) {
        break;
      }
      // The trigger click landed before the menubar was ready — close
      // any half-open state and try again.
      await page.keyboard.press("Escape");
    }
    await expect(apiItem).toBeVisible({ timeout: 10_000 });
    await apiItem.click();

    // The untitled draft TAB exists and is active.
    const draftTab = page.getByRole("button", { name: /Untitled-1\.http/ }).first();
    await expect(draftTab).toBeVisible({ timeout: 15_000 });
    // The workbench mounted against the in-memory draft.
    await expect(page.locator("[aria-label=\"API client workbench — Untitled-1.http\"]")).toBeVisible({ timeout: 15_000 });

    // NOTHING was written to disk by just opening the client.
    const afterOpenFiles = await httpFilesOnDisk(request);
    expect(afterOpenFiles).toEqual(beforeFiles);

    // ⌘S / Ctrl+S routes the draft to the Save As picker (the audit's
    // requirement: Save must ask WHERE, never write silently).
    await page.keyboard.press("Control+s");
    const picker = page.getByRole("dialog", { name: "Save As…" });
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();

    // The draft header's own Save As… opens the picker again; save with
    // a chosen name into the first folder.
    await page.locator("button[title^=\"Pick a folder and file name\"]").click();
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await picker.locator("#untitled-save-name").fill("e2e-round3.http");
    await picker.getByRole("button", { name: "Save" }).click();

    // The draft became a REAL tab of the saved file.
    await expect(page.getByRole("button", { name: /e2e-round3\.http/ }).first()).toBeVisible({ timeout: 15_000 });

    // Exactly ONE new .http file is on disk — the explicit save.
    await expect.poll(async () => httpFilesOnDisk(request), { timeout: 15_000 }).toEqual([...beforeFiles, expect.any(String)] as string[]);
    const afterFiles = await httpFilesOnDisk(request);
    expect(afterFiles.filter((name) => name.endsWith("e2e-round3.http")).length).toBe(1);

    // Cleanup: remove the file created by the explicit save (the delete
    // route takes folder + file SLUGS, deslugged server-side).
    const folders = await fetchFolders(request);
    const owner = folders.find((f) => (f.files ?? []).some((x) => x.name === "e2e-round3.http"));
    expect(owner, "the saved draft's folder should be listed").toBeTruthy();
    const savedSlug = (owner!.files ?? []).find((x) => x.name === "e2e-round3.http")?.slug ?? "";
    expect(savedSlug, "the saved draft's slug should resolve").toBeTruthy();
    const res = await request.post("/api/file-delete", {
      data: { folder: owner!.slug, file: savedSlug },
    });
    expect(res.ok(), "the cleanup delete should succeed").toBeTruthy();
  });
});
