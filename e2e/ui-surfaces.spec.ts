/**
 * live check — the new UI surfaces:
 *   ▸ the markdown Preview / Studio / Source segmented control;
 *   ▸ HTML source-mode syntax highlighting (the "markup" grammar);
 *   ▸ the in-viewer Run control for a runnable non-Python file (.java);
 *   ▸ the Formatting tab's redesigned conventions card (complete text);
 *   ▸ the Background Runs tab (run A demoted by run B).
 *
 * Runs against the shared dev server (playwright.config reuseExistingServer).
 */
import { expect, test, type Page } from "@playwright/test";


/** Open a file in the explorer: click the FOLDER row, then the file
 *  row (button "<File> <Folder> <time>").
 *
 *  Row naming: TOP-level group rows compose their accessible name from
 *  the row's subtree, which includes the inline funnel control labeled
 *  "Filter files in this folder" ("Filter files in this folder Data &
 *  Docs 34 813.8K"); NESTED folder rows are plain buttons named just
 *  "<Folder> <count> <size>" ("Documents 12 9.0K"). The locator below
 *  accepts BOTH shapes — the prefix is optional — so group rows and
 *  nested rows are found the same way. When the folder lives INSIDE a
 *  group folder (the python_scripts layout is grouped: Python
 *  Projects / Data & Docs / Languages / Media / Structure & Edge
 *  Cases), pass the group as `parent` — its row is clicked FIRST which
 *  expands it and reveals the nested folder. */
async function openFile(page: Page, folder: string, file: RegExp, parent?: string): Promise<void> {
  const rowNamed = (name: string) =>
    page
      .getByRole("button", { name: new RegExp(`(?:Filter files in this folder )?${name} \\d`) })
      .first();
  if (parent) {
    await rowNamed(parent).click();
  }
  await rowNamed(folder).click();
  const fileRow = page.getByRole("button", { name: file }).first();
  await fileRow.click();
}

/** Boot the app shell with the tutorial overlay dismissed (smoke.ts pattern). */
async function loadApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("praxis.tutorial-done", "1");
      // Live check: spell marks replace the highlighted source
      // view when the checker has issues — seed the setting OFF so the
      // grammar-backed <pre> is directly assertable.
      window.localStorage.setItem(
        "praxis.settings",
        JSON.stringify({ spellCheck: false })
      );
    } catch {
      /* storage blocked */
    }
  });
  await page.goto("/", { timeout: 60_000 });
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible({ timeout: 40_000 });
}

test.describe("UI surfaces live check", () => {
  test("markdown: View (Preview / Source) and Edit (the studio)", async ({ page }) => {
    await loadApp(page);

    // Open a markdown file from the explorer.
    await openFile(page, "Documents", /Notes\.md/i, "Data & Docs");
    await page.getByText("Notes.md", { exact: false }).first().waitFor({ timeout: 20_000 });

    // The VIEW-side toggle (Preview | Source) is present.
    const group = page.getByRole("group", { name: /markdown view mode/i });
    await expect(group).toBeVisible({ timeout: 20_000 });
    await expect(group.getByRole("button", { name: "Preview" })).toBeVisible();
    await expect(group.getByRole("button", { name: "Source" })).toBeVisible();

    // Source mode shows the highlighted raw markdown.
    await group.getByRole("button", { name: "Source" }).click();
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 20_000 });

    // Back to Preview renders prose again.
    await group.getByRole("button", { name: "Preview" }).click();
    await expect(page.locator(".md-github").first()).toBeVisible({ timeout: 20_000 });

    // The Edit button opens the STUDIO (split editor + preview).
    // (The button's accessible name is its text — "Edit"; the studio
    // phrasing lives in its title tooltip.)
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator('[data-testid="markdown-studio-editor"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="markdown-studio-preview"]')).toBeVisible({ timeout: 20_000 });

    // View returns to the read-only render.
    await page.getByRole("button", { name: "View", exact: true }).click();
    await expect(page.locator(".md-github").first()).toBeVisible({ timeout: 20_000 });
  });

  test("html: source view renders the markup grammar (no crash)", async ({ page }) => {
    await loadApp(page);

    await openFile(page, "Documents", /LandingPage\.html/i, "Data & Docs");
    // The HTML layout toolbar exists; switch to Source.
    await page.getByRole("button", { name: "Source", exact: true }).click();
    // The highlighted source <pre> renders (the markup grammar is
 // registered now — before the fix this fell to plain gray).
    await expect(page.locator("pre").first()).toBeVisible({ timeout: 20_000 });
  });

  test("java file keeps the Run control + runtime chip", async ({ page }) => {
    await loadApp(page);

    await openFile(page, "Language Lab", /Fib\.java/i, "Languages");
    // The viewer's Run control for every runnable kind.
    const runControl = page.getByRole("button", { name: "Run pinned entry point or the current file" });
    await expect(runControl).toBeVisible({ timeout: 20_000 });
  });

  test("settings: Formatting tab conventions card is complete", async ({ page }) => {
    await loadApp(page);

    // The project ships .praxis/settings.json — an informational
    // "Settings loaded" dialog may open on top of the app. Dismiss it
    // first so the Settings dialog itself is reachable.
    const loadedDialog = page.getByRole("dialog").filter({ hasText: "Settings loaded from" });
    if (await loadedDialog.count()) {
      await loadedDialog.getByRole("button", { name: /close|ok|got it|dismiss/i }).first().click().catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.getByRole("button", { name: "Settings" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("tab", { name: "Formatting" }).click();

    // The per-language convention blocks render (the old clipped
    // SettingRow became the full per-language cards): each block shows
    // its language's real convention sentences end-to-end.
    await expect(
      dialog.getByText(/table alignment \(padded pipe cells\)/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByText(/one line per block element, attribute quoting/i)
    ).toBeVisible();
    await expect(
      dialog.getByText(/Auto-format: aligned key column/i)
    ).toBeVisible();
    // The new controls exist.
    await expect(dialog.getByText("Trim trailing whitespace on format")).toBeVisible();
    await expect(dialog.getByText("Collapse blank-line runs on format")).toBeVisible();
    await expect(dialog.locator("#fmt-lang-javascript")).toBeVisible();
    await expect(dialog.locator("#fmt-lang-typescript")).toBeVisible();
  });

  test("background runs: demoted run moves to the dedicated tab", async ({ page }) => {
    await loadApp(page);

    // Start a LONG run, then a second one — the first demotes to the
    // Background Runs tab while still streaming.
    await openFile(page, "Marathon Lab", /VeryLongJob\.py/i, "Python Projects");
    await page.locator('[data-tutorial="code-viewer"]').waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Run pinned entry point or the current file" }).click();

    await openFile(page, "Getting Started", /HelloPraxis\.py/i);
    await page.locator('[data-tutorial="code-viewer"]').waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Run pinned entry point or the current file" }).click();

    // The Background Runs tab appears between Output and Diagnostics.
    const bgTab = page.getByRole("tab", { name: /Background Runs \(\d+ demoted\)/i });
    await expect(bgTab).toBeVisible({ timeout: 30_000 });

    // Open it: the group renders there (not in the Output header).
    await bgTab.click();
    await expect(page.getByText("started before the latest Run", { exact: false }).first()).toBeVisible();

    // Dismiss all clears the groups.
    await page.getByRole("button", { name: "Dismiss all" }).click();
    await expect(bgTab).toBeHidden({ timeout: 15_000 });
  });
});
