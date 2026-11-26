/**
 * tab-lifecycle — the pure rules behind editor-tab dirty state,
 * untitled drafts and save-to-disk routing.
 *
 * OWNERSHIP (Phase 2 extraction): every DECISION about the tab
 * lifecycle lives here as pure functions — what makes a tab a
 * workbench surface, how drafts are named and evicted, how ⌘S routes
 * between Save-As / FileViewer-save / CodeViewer-save, and when a tab
 * switch must be guarded by the unsaved-changes dialog. The React
 * wiring (state, refs, toasts, fetches) lives in
 * src/hooks/use-tab-lifecycle.ts, which calls these rules; page.tsx
 * calls the hook. No React, no DOM, no fetch here — 100% of this
 * module's branches are unit-tested in __tests__/tab-lifecycle.test.ts.
 *
 * THE CORE SEMANTIC (the Round 3 bug class this module protects):
 * UNTITLED DRAFTS ARE MEMORY-ONLY. Nothing writes to disk without an
 * explicit Save As picking a destination; conversely, an untitled draft
 * NEVER blocks a tab switch (its edits are live-synced into the draft
 * map, so leaving loses nothing) and NEVER routes ⌘S into an editor
 * that is not mounted.
 */
import type {EditorTab} from "@/components/editor-tabs";

/** The seed text of a fresh untitled API-client draft (in-memory only). */
export const UNTITLED_HTTP_TEMPLATE =
    "### Praxis API client — edit and Send (Ctrl+Enter)\n" +
    "### Variables come from the environment picker ({{host}}).\n" +
    "\n" +
    "GET {{host}}/api/health\n" +
    "Accept: application/json\n" +
    "\n" +
    "###\n" +
    "\n" +
    "POST {{host}}/api/echo\n" +
    "Content-Type: application/json\n" +
    "\n" +
    "{\n" +
    "  \"hello\": \"praxis\"\n" +
    "}\n";

/** The default file name the Save-As picker starts from. */
export const SAVE_AS_DEFAULT_NAME = "requests.http";

/** True when a file name is the API client's own surface (.http/.rest). */
export function isHttpWorkbenchSurface(fileName: string): boolean {
    // The two REST-request extensions the workbench renders.
    return /\.(http|rest)$/i.test(fileName);
}

/**
 * The next untitled draft identity for a counter value.
 *
 * Counters start at 1 with the page's draft counter (0-based ref,
 * incremented first): `nextUntitledDraft(1)` is Untitled-1.http /
 * untitled-http-1.
 */
export function nextUntitledDraft(counter: number): { tabId: string; fileName: string } {
    // The stable id scheme the draft map and reopen history key on.
    return {tabId: `untitled-http-${counter}`, fileName: `Untitled-${counter}.http`};
}

/**
 * Normalize a Save-As file name: trim, and force a .http/.rest suffix.
 *
 * An empty result means "not a name yet" — the caller keeps the picker
 * open for a retry (never invents a name the user did not see).
 */
export function normalizeSaveAsName(raw: string): string {
    // Trim whitespace first; empty stays empty (retry, not invention).
    const trimmed = raw.trim();
    // An empty name is returned as-is so the caller can detect the retry.
    if (trimmed === "") {
        return "";
    }
    // Force one of the workbench extensions when none was given.
    if (!isHttpWorkbenchSurface(trimmed)) {
        return `${trimmed}.http`;
    }
    return trimmed;
}

/**
 * The EditorTab shape for a fresh untitled draft.
 *
 * Empty slugs (no disk file), a dirty dot (never saved), and the
 * untitled flag that routes ⌘S to Save As and exempts the tab from
 * switch guards and split targets.
 */
export function draftTabFor(tabId: string, fileName: string): EditorTab {
    // The full untitled tab shape in one place.
    return {
        id: tabId,
        folderSlug: "",
        fileSlug: "",
        fileName,
        folderName: "API Client",
        dirty: true,
        runOk: null,
        untitled: true,
    };
}

/** The EditorTab shape for a real, on-disk file (post Save-As / open). */
export function realTabFor(
    folderSlug: string,
    fileSlug: string,
    fileName: string,
    folderName: string
): EditorTab {
    // The standard id/slug shape the rest of the app keys on.
    return {
        id: `${folderSlug}/${fileSlug}`,
        folderSlug,
        fileSlug,
        fileName,
        folderName,
        dirty: false,
        runOk: null,
    };
}

/**
 * Replace a draft tab with its saved real tab, in place, deduped.
 *
 * If a tab for the same real file is ALREADY open, the duplicate (the
 * former draft position) drops out — the tab list never shows the same
 * file twice.
 */
export function swapDraftForRealTab(
    tabs: EditorTab[],
    draftTabId: string,
    realTab: EditorTab
): EditorTab[] {
    // Swap the draft slot for the real tab.
    const replaced = tabs.map((t) => (t.id === draftTabId ? realTab : t));
    // First occurrence wins on duplicate ids (the dedupe).
    return replaced.filter((t, i) => replaced.findIndex((x) => x.id === t.id) === i);
}

/**
 * The draft ids that still need their text: open untitled tabs plus
 * untitled tabs parked in the reopen history (Ctrl/Cmd+Shift+T can
 * bring those back WITH their edits).
 */
export function liveDraftIds(openTabs: EditorTab[], closedTabHistory: EditorTab[]): Set<string> {
    // Collected ids — one pass over each list.
    const live = new Set<string>();
    for (const tab of openTabs) {
        if (tab.untitled) {
            live.add(tab.id);
        }
    }
    for (const tab of closedTabHistory) {
        if (tab.untitled) {
            live.add(tab.id);
        }
    }
    return live;
}

/**
 * Drop every draft text no live id claims anymore.
 *
 * A draft freed here (tab closed AND evicted from the reopen history)
 * is gone for good — its memory is reclaimed.
 */
export function evictDeadDrafts(
    drafts: Record<string, string>,
    live: Set<string>
): Record<string, string> {
    // Build the survivor map; mutate nothing the caller still holds.
    const next: Record<string, string> = {};
    for (const key of Object.keys(drafts)) {
        if (live.has(key)) {
            next[key] = drafts[key];
        }
    }
    return next;
}

/** Where a ⌘S / File ▸ Save press must go. */
export type SaveRoute =
/** An untitled draft is active — open the Save As destination picker. */
    | "open-save-as"
    /** A non-Python file is active — the FileViewer flushes on the
     *  praxis:file-viewer-save window event. */
    | "file-viewer"
    /** Python (or nothing trackable) is active — the CodeViewer's own
     *  save path (a no-op when no viewer is mounted). */
    | "code-viewer";

/**
 * Route a save intent from the ACTIVE tab + the tracked file kind.
 *
 * THE routing rule (Round 3): an untitled draft has no disk file and
 * no mounted editor, so ⌘S must open Save As — never dispatch a save
 * into a viewer that is not there. Real files route by kind: non-Python
 * kinds go through the FileViewer event round-trip, Python through the
 * CodeViewer ref.
 */
export function routeSaveIntent(activeTab: EditorTab | null, fileKind: string | null): SaveRoute {
    // Untitled drafts always route to Save As, whatever the kind says.
    if (activeTab?.untitled) {
        return "open-save-as";
    }
    // A tracked non-Python kind owns the FileViewer save path.
    if (fileKind && fileKind !== "python") {
        return "file-viewer";
    }
    // Python — or nothing mounted to track — lands on the CodeViewer.
    return "code-viewer";
}

/**
 * Whether switching AWAY from the current tab must ask first.
 *
 * An untitled draft NEVER guards (its edits are live-synced into the
 * draft map — leaving loses nothing, and ⌘S Save As stays available on
 * return). A real dirty tab, or the direct viewer-dirty mirror (which
 * covers kinds whose tab fell outside the tab cap), does guard.
 */
export function shouldGuardTabSwitch(
    currentTab: EditorTab | null | undefined,
    viewerDirty: boolean
): boolean {
    // A dirty REAL tab guards; a dirty UNTITLED draft does not.
    if (currentTab?.dirty && !currentTab.untitled) {
        return true;
    }
    // The viewer's own dirty mirror guards even without a tab flag.
    return viewerDirty;
}

/**
 * Seed values for the Save As picker.
 *
 * Folder: the currently selected one, else the first folder; name: the
 * historical default. Both are starting points — the user picks the
 * real destination in the dialog.
 */
export function saveAsDefaults(
    selectedFolderSlug: string,
    firstFolderSlug: string
): { folder: string; name: string } {
    // Prefer the open folder; fall back to the first folder in the tree.
    return {folder: selectedFolderSlug || firstFolderSlug, name: SAVE_AS_DEFAULT_NAME};
}

/** How many closed tabs the reopen history (Ctrl/Cmd+Shift+T) keeps. */
export const CLOSED_TAB_HISTORY_CAP = 10;

/**
 * The tab to activate after closing `closedIndex` — the right
 * neighbour, else the left one, else null (the LAST tab just closed).
 *
 * Both close paths (direct and confirm-after-dialog) must land on the
 * SAME neighbour — this rule is why they cannot drift apart again.
 */
export function nextActiveAfterClose(tabs: EditorTab[], closedIndex: number): EditorTab | null {
    // An out-of-range index closes nothing.
    if (closedIndex < 0 || closedIndex >= tabs.length) {
        return null;
    }
    // Right neighbour first, then the left one.
    return tabs[closedIndex + 1] ?? tabs[closedIndex - 1] ?? null;
}

/**
 * Push a closed tab onto the reopen history: newest-first, capped.
 *
 * The cap bounds memory; the draft GC keeps text for any untitled
 * entries that survive inside it.
 */
export function pushClosedTab(history: EditorTab[], closed: EditorTab): EditorTab[] {
    // Newest first, one occurrence, capped at CLOSED_TAB_HISTORY_CAP.
    return [closed, ...history.filter((t) => t.id !== closed.id)].slice(0, CLOSED_TAB_HISTORY_CAP);
}

/**
 * Whether closing this tab must confirm first.
 *
 * A dirty tab with the confirmCloseUnsavedTab setting on asks; an
 * untitled draft is dirty by definition (never saved), so closing one
 * asks while the setting is on — its edits are recoverable from the
 * reopen history, but the user still gets the choice.
 */
export function shouldConfirmClose(tab: EditorTab, confirmSetting: boolean): boolean {
    // Both conditions must hold: the tab is dirty AND the user wants asks.
    return !!tab.dirty && confirmSetting;
}
