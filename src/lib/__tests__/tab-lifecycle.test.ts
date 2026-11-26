/**
 * tab-lifecycle tests — every branch of the pure tab-lifecycle rules:
 * workbench-surface detection, draft naming, Save-As name
 * normalization, tab shapes, the draft↔real tab swap, draft
 * eviction, ⌘S save routing and the tab-switch guard.
 *
 * The companion React wiring (src/hooks/use-tab-lifecycle.ts) is a
 * thin shell over these rules — its correctness is the rules' plus the
 * typechecker's.
 */
import {describe, expect, it} from "vitest";
import {
    CLOSED_TAB_HISTORY_CAP,
    draftTabFor,
    evictDeadDrafts,
    isHttpWorkbenchSurface,
    liveDraftIds,
    nextActiveAfterClose,
    nextUntitledDraft,
    normalizeSaveAsName,
    pushClosedTab,
    realTabFor,
    routeSaveIntent,
    SAVE_AS_DEFAULT_NAME,
    saveAsDefaults,
    shouldConfirmClose,
    shouldGuardTabSwitch,
    swapDraftForRealTab,
    UNTITLED_HTTP_TEMPLATE,
} from "../tab-lifecycle";
import type {EditorTab} from "@/components/editor-tabs";

/** A real (on-disk) tab stand-in. */
function realTab(id: string, fileName: string, dirty = false): EditorTab {
    // The minimal standard shape.
    return {id, folderSlug: "folder", fileSlug: id, fileName, folderName: "Folder", dirty, runOk: null};
}

/** An untitled draft tab stand-in. */
function draftTab(id: string): EditorTab {
    // The untitled shape: empty slugs, flagged.
    return {
        id,
        folderSlug: "",
        fileSlug: "",
        fileName: "Untitled-1.http",
        folderName: "API Client",
        dirty: true,
        runOk: null,
        untitled: true
    };
}

describe("UNTITLED_HTTP_TEMPLATE", () => {
    it("seeds a usable two-request document", () => {
        // The template must be immediately runnable in the workbench.
        expect(UNTITLED_HTTP_TEMPLATE).toContain("GET {{host}}/api/health");
        expect(UNTITLED_HTTP_TEMPLATE).toContain("POST {{host}}/api/echo");
    });
});

describe("isHttpWorkbenchSurface", () => {
    it("accepts the .http and .rest extensions at any case", () => {
        // The two REST-request extensions the workbench renders.
        expect(isHttpWorkbenchSurface("requests.http")).toBe(true);
        expect(isHttpWorkbenchSurface("API.REST")).toBe(true);
        expect(isHttpWorkbenchSurface("draft.Http")).toBe(true);
    });

    it("rejects everything else", () => {
        // No extension, other extensions, or a mere substring do not count.
        expect(isHttpWorkbenchSurface("main.py")).toBe(false);
        expect(isHttpWorkbenchSurface("notes")).toBe(false);
        expect(isHttpWorkbenchSurface("http.txt")).toBe(false);
    });
});

describe("nextUntitledDraft", () => {
    it("numbers ids and names from the counter", () => {
        // The first draft is Untitled-1.http / untitled-http-1.
        expect(nextUntitledDraft(1)).toEqual({tabId: "untitled-http-1", fileName: "Untitled-1.http"});
        // And the seventh keeps the same scheme.
        expect(nextUntitledDraft(7)).toEqual({tabId: "untitled-http-7", fileName: "Untitled-7.http"});
    });
});

describe("normalizeSaveAsName", () => {
    it("trims and returns empty as empty (a retry, not an invention)", () => {
        // An empty name must stay empty so the picker waits for input.
        expect(normalizeSaveAsName("")).toBe("");
        expect(normalizeSaveAsName("   ")).toBe("");
    });

    it("forces a .http suffix when none was given", () => {
        // Bare names gain the default workbench extension.
        expect(normalizeSaveAsName("  api-tests ")).toBe("api-tests.http");
    });

    it("keeps an explicit .http or .rest suffix untouched", () => {
        // A user-chosen extension (any case) is respected.
        expect(normalizeSaveAsName("suite.rest")).toBe("suite.rest");
        expect(normalizeSaveAsName("Suite.HTTP")).toBe("Suite.HTTP");
    });
});

describe("draftTabFor / realTabFor (tab shapes)", () => {
    it("shapes an untitled draft: empty slugs, dirty, flagged", () => {
        // The draft never points at disk.
        const tab = draftTabFor("untitled-http-2", "Untitled-2.http");
        expect(tab).toMatchObject({
            id: "untitled-http-2",
            folderSlug: "",
            fileSlug: "",
            fileName: "Untitled-2.http",
            folderName: "API Client",
            dirty: true,
            untitled: true,
        });
    });

    it("shapes a real file tab: standard id, clean", () => {
        // The saved tab keys on folder/file slugs and is NOT flagged untitled.
        const tab = realTabFor("folder", "slug", "requests.http", "Folder");
        expect(tab).toMatchObject({
            id: "folder/slug",
            folderSlug: "folder",
            fileSlug: "slug",
            fileName: "requests.http",
            dirty: false,
        });
        expect(tab.untitled).toBeFalsy();
    });
});

describe("swapDraftForRealTab", () => {
    it("replaces the draft slot in place", () => {
        // The draft becomes the real tab at the SAME position.
        const tabs = [realTab("a/main.py", "main.py"), draftTab("untitled-http-1")];
        const real = realTabFor("folder", "slug", "requests.http", "Folder");
        const next = swapDraftForRealTab(tabs, "untitled-http-1", real);
        expect(next.map((t) => t.id)).toEqual(["a/main.py", "folder/slug"]);
    });

    it("dedupes when the same real file is already open elsewhere", () => {
        // Saving a draft onto an already-open file collapses the pair.
        const real = realTabFor("folder", "slug", "requests.http", "Folder");
        const tabs = [draftTab("untitled-http-1"), realTab("other/x.py", "x.py"), real];
        const next = swapDraftForRealTab(tabs, "untitled-http-1", real);
        // One occurrence of folder/slug, the draft gone, x.py intact.
        expect(next.filter((t) => t.id === "folder/slug")).toHaveLength(1);
        expect(next.some((t) => t.id === "untitled-http-1")).toBe(false);
        expect(next.some((t) => t.id === "other/x.py")).toBe(true);
    });
});

describe("liveDraftIds + evictDeadDrafts (draft GC)", () => {
    it("collects untitled ids from open tabs AND reopen history only", () => {
        // Real tabs never claim draft text.
        const live = liveDraftIds(
            [draftTab("untitled-http-1"), realTab("folder/slug", "requests.http")],
            [draftTab("untitled-http-9"), realTab("other/x.py", "x.py")]
        );
        expect(live.has("untitled-http-1")).toBe(true);
        expect(live.has("untitled-http-9")).toBe(true);
        expect(live.size).toBe(2);
    });

    it("frees every draft no live id claims", () => {
        // The evicted draft's memory is reclaimed for good.
        const drafts = {"untitled-http-1": "A", "untitled-http-2": "B", "untitled-http-3": "C"};
        const next = evictDeadDrafts(drafts, new Set(["untitled-http-2"]));
        expect(next).toEqual({"untitled-http-2": "B"});
    });

    it("handles empty maps and full survival", () => {
        // Edge cases: nothing to free, and nothing to keep.
        expect(evictDeadDrafts({}, new Set(["x"]))).toEqual({});
        const drafts = {"untitled-http-1": "A"};
        expect(evictDeadDrafts(drafts, new Set(["untitled-http-1"]))).toEqual(drafts);
    });
});

describe("routeSaveIntent (the ⌘S router)", () => {
    it("always routes an untitled draft to Save As", () => {
        // No disk file, no mounted editor — Save As is the only sane target.
        expect(routeSaveIntent(draftTab("untitled-http-1"), "python")).toBe("open-save-as");
        expect(routeSaveIntent(draftTab("untitled-http-1"), null)).toBe("open-save-as");
    });

    it("routes non-Python kinds through the FileViewer event", () => {
        // The FileViewer flushes on praxis:file-viewer-save.
        expect(routeSaveIntent(realTab("a/x.md", "x.md", true), "markdown")).toBe("file-viewer");
        expect(routeSaveIntent(realTab("a/x.md", "x.md"), "json")).toBe("file-viewer");
    });

    it("routes Python — and untracked/no tabs — to the CodeViewer path", () => {
        // The CodeViewer's save is a safe no-op when nothing is mounted.
        expect(routeSaveIntent(realTab("a/main.py", "main.py", true), "python")).toBe("code-viewer");
        expect(routeSaveIntent(realTab("a/main.py", "main.py"), null)).toBe("code-viewer");
        expect(routeSaveIntent(null, null)).toBe("code-viewer");
    });
});

describe("shouldGuardTabSwitch (the unsaved-changes guard)", () => {
    it("guards a dirty REAL tab", () => {
        // Unsaved edits on a real file must ask before switching.
        expect(shouldGuardTabSwitch(realTab("a/main.py", "main.py", true), false)).toBe(true);
    });

    it("never guards an untitled draft (edits are live-synced)", () => {
        // The Round 3 rule: leaving a draft loses nothing.
        expect(shouldGuardTabSwitch(draftTab("untitled-http-1"), false)).toBe(false);
    });

    it("guards on the viewer-dirty mirror even without a tab flag", () => {
        // Kinds whose tab fell outside the tab cap still guard.
        expect(shouldGuardTabSwitch(realTab("a/x.md", "x.md"), true)).toBe(true);
        expect(shouldGuardTabSwitch(null, true)).toBe(true);
    });

    it("lets a clean switch through", () => {
        // Nothing dirty — switch immediately.
        expect(shouldGuardTabSwitch(realTab("a/x.md", "x.md"), false)).toBe(false);
        expect(shouldGuardTabSwitch(null, false)).toBe(false);
        expect(shouldGuardTabSwitch(undefined, false)).toBe(false);
    });
});

describe("saveAsDefaults", () => {
    it("prefers the open folder and the historical default name", () => {
        // The picker opens on sensible starting values the user can change.
        expect(saveAsDefaults("my-folder", "first-folder")).toEqual({folder: "my-folder", name: SAVE_AS_DEFAULT_NAME});
    });

    it("falls back to the first folder when none is selected", () => {
        // With no folder open, the first folder in the tree is the seed.
        expect(saveAsDefaults("", "first-folder")).toEqual({folder: "first-folder", name: "requests.http"});
        expect(saveAsDefaults("", "")).toEqual({folder: "", name: "requests.http"});
    });
});

describe("nextActiveAfterClose (the close-neighbour rule)", () => {
    it("prefers the RIGHT neighbour, then the left one", () => {
        // Closing a middle tab activates the tab that shifts into its slot.
        const tabs = [realTab("a", "a.py"), realTab("b", "b.py"), realTab("c", "c.py")];
        expect(nextActiveAfterClose(tabs, 1)?.id).toBe("c");
        // Closing the LAST tab falls back to its left neighbour.
        expect(nextActiveAfterClose(tabs, 2)?.id).toBe("b");
        // Closing the FIRST tab with only two panes picks the survivor.
        expect(nextActiveAfterClose(tabs.slice(0, 2), 0)?.id).toBe("b");
    });

    it("returns null only when the LAST tab just closed", () => {
        // The single-tab group empties — the blank view takes over.
        expect(nextActiveAfterClose([realTab("a", "a.py")], 0)).toBeNull();
    });

    it("returns null for out-of-range indices", () => {
        // A bad index closes nothing and activates nothing.
        expect(nextActiveAfterClose([], 0)).toBeNull();
        expect(nextActiveAfterClose([realTab("a", "a.py")], -1)).toBeNull();
        expect(nextActiveAfterClose([realTab("a", "a.py")], 5)).toBeNull();
    });
});

describe("pushClosedTab (the reopen history)", () => {
    it("pushes newest-first", () => {
        // Ctrl/Cmd+Shift+T pops the most recently closed tab first.
        const a = realTab("a", "a.py");
        const b = realTab("b", "b.py");
        expect(pushClosedTab([a], b).map((t) => t.id)).toEqual(["b", "a"]);
    });

    it("caps the history at CLOSED_TAB_HISTORY_CAP entries", () => {
        // The history bounds memory.
        const many = Array.from({length: 15}, (_, i) => realTab(`t${i}`, `t${i}.py`));
        const next = pushClosedTab(many.slice(0, 10), many[10]);
        expect(next).toHaveLength(CLOSED_TAB_HISTORY_CAP);
        expect(next[0].id).toBe("t10");
    });

    it("dedupes a re-closed tab instead of duplicating it", () => {
        // Close, reopen, close again MOVES the entry to the front.
        const a = realTab("a", "a.py");
        const next = pushClosedTab([a, realTab("b", "b.py")], a);
        expect(next.filter((t) => t.id === "a")).toHaveLength(1);
        expect(next[0].id).toBe("a");
    });
});

describe("shouldConfirmClose", () => {
    it("asks only when the tab is dirty AND the setting is on", () => {
        // Both conditions must hold.
        expect(shouldConfirmClose(realTab("a", "a.py", true), true)).toBe(true);
        expect(shouldConfirmClose(realTab("a", "a.py", true), false)).toBe(false);
        expect(shouldConfirmClose(realTab("a", "a.py", false), true)).toBe(false);
        expect(shouldConfirmClose(realTab("a", "a.py", false), false)).toBe(false);
    });

    it("asks for an untitled draft while the setting is on (never saved)", () => {
        // A draft is dirty by definition — its close still asks.
        expect(shouldConfirmClose(draftTab("untitled-http-1"), true)).toBe(true);
        expect(shouldConfirmClose(draftTab("untitled-http-1"), false)).toBe(false);
    });
});
