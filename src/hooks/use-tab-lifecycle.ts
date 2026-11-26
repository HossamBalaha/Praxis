"use client";
/**
 * use-tab-lifecycle — the React wiring for editor-tab dirty state,
 * untitled drafts and save-to-disk routing.
 *
 * Phase 2 extraction: this hook owns the STATE and the I/O (the draft
 * map, the Save As picker, the file-create fetch), while every
 * DECISION is delegated to the pure rules in src/lib/tab-lifecycle.ts
 * (100% branch-covered by __tests__/tab-lifecycle.test.ts). page.tsx
 * consumes the hook and stays out of the lifecycle business.
 *
 * WHAT LIVES HERE (and only here):
 *   - the untitled draft counter + text map (refs — the workbench
 *     pushes serialized edits in without re-render round trips);
 *   - the Save As picker state (open flag, folder, name);
 *   - Tools ▸ API Client: gating + draft creation;
 *   - the Save As confirmation: write to disk, swap the draft tab for
 *     a real file tab, refresh the tree;
 *   - draft garbage collection: a draft's text survives while its tab
 *     is open OR parked in the reopen history, then is freed.
 */
import * as React from "react";
import type {EditorTab} from "@/components/editor-tabs";
import {
    draftTabFor,
    evictDeadDrafts,
    isHttpWorkbenchSurface,
    liveDraftIds,
    nextUntitledDraft,
    normalizeSaveAsName,
    realTabFor,
    swapDraftForRealTab,
    UNTITLED_HTTP_TEMPLATE,
} from "@/lib/tab-lifecycle";

/** The toast shape the page's toaster accepts (structural — no import cycle). */
export interface LifecycleToast {
    title: string;
    description?: string;
    variant?: "default" | "destructive" | "success";
}

/** The page surface the hook needs injected (all already page state). */
export interface UseTabLifecycleDeps {
    /** The open editor tabs (the draft tab lives among them). */
    openTabs: EditorTab[];
    /** The active tab id. */
    activeTabId: string | null;
    /** Recently-closed tabs (drafts parked here keep their text). */
    closedTabHistory: EditorTab[];
    /** The folder listing (Save As destinations + display names). */
    folders: Array<{ slug: string; name: string }>;
    /** Tab list setter. */
    setOpenTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
    /** Active tab setter. */
    setActiveTabId: (id: string) => void;
    /** Tree selection setters (Save As points them at the new file). */
    setSelectedFolderSlug: (slug: string) => void;
    setSelectedFileSlug: (slug: string) => void;
    /** Blank-editor flag setter (opening a draft clears the blank state). */
    setEditorBlank: (blank: boolean) => void;
    /** Folder tree refresher (called after the Save As write). */
    refreshFolders: () => Promise<unknown>;
    /** The page toaster. */
    toast: (toast: LifecycleToast) => void;
}

/** Everything the page needs back from the hook. */
export interface UseTabLifecycleResult {
    /** The active untitled draft tab (null when a real file / nothing is open). */
    activeUntitledTab: EditorTab | null;
    /** The draft text for a tab id (the template for an unknown id). */
    draftTextFor: (tabId: string) => string;
    /** Live-sync a draft's text (the workbench's onSourceChange). */
    setDraftText: (tabId: string, text: string) => void;
    /** Tools ▸ API Client: gating + create the next untitled draft. */
    openApiClientDraft: () => void;
    /** Open the Save As picker seeded for an untitled draft (⌘S routing). */
    openSaveAsPicker: (tab: EditorTab, selectedFolderSlug: string) => void;
    /** Confirm the Save As picker: write to disk and swap in the real tab. */
    confirmUntitledSave: () => Promise<void>;
    /** The Save As picker state (null = closed). */
    untitledSaveDialog: { tabId: string; fileName: string } | null;
    /** Setter pair the picker fields bind to. */
    setUntitledSaveDialog: React.Dispatch<React.SetStateAction<{ tabId: string; fileName: string } | null>>;
    untitledSaveFolder: string;
    setUntitledSaveFolder: (slug: string) => void;
    untitledSaveName: string;
    setUntitledSaveName: (name: string) => void;
}

/** The tab-lifecycle hook — see the module doc above for ownership. */
export function useTabLifecycle(deps: UseTabLifecycleDeps): UseTabLifecycleResult {
    // Destructure once; the hook body only reads these.
    const {
        openTabs,
        activeTabId,
        closedTabHistory,
        folders,
        setOpenTabs,
        setActiveTabId,
        setSelectedFolderSlug,
        setSelectedFileSlug,
        setEditorBlank,
        refreshFolders,
        toast,
    } = deps;

    /* The draft counter — 0-based, incremented BEFORE use, so the first
     * draft is Untitled-1.http. */
    const untitledHttpCounterRef = React.useRef(0);
    /* Draft text per untitled tab id — a ref, not state: the workbench
     * pushes every serialized edit into it via setDraftText without a
     * re-render round trip, and the active pane reads it at render time. */
    const untitledHttpDraftsRef = React.useRef<Record<string, string>>({});
    /* The Save As destination picker state (null = closed). */
    const [untitledSaveDialog, setUntitledSaveDialog] = React.useState<{
        tabId: string;
        fileName: string
    } | null>(null);
    /* Destination fields of that picker — folder slug + file name. */
    const [untitledSaveFolder, setUntitledSaveFolder] = React.useState("");
    const [untitledSaveName, setUntitledSaveName] = React.useState("");

    /* The active untitled tab (null when a real file / no file is open) —
     * drives the render branch that mounts the draft workbench. */
    const activeUntitledTab = React.useMemo(
        () => (activeTabId ? openTabs.find((t) => t.id === activeTabId && t.untitled) ?? null : null),
        [openTabs, activeTabId]
    );

    /* Draft garbage collection: a draft lives while its tab is open OR
     * while it sits in the reopen history (Ctrl/Cmd+Shift+T can bring it
     * back with its edits); once fully forgotten the text is freed. The
     * eviction RULE is pure (lib/tab-lifecycle.ts); this effect just
     * applies it whenever either list changes. */
    React.useEffect(() => {
        // Compute the survivors and swap the ref in place (the render reads
        // through draftTextFor, so no state update is needed).
        untitledHttpDraftsRef.current = evictDeadDrafts(
            untitledHttpDraftsRef.current,
            liveDraftIds(openTabs, closedTabHistory)
        );
    }, [openTabs, closedTabHistory]);

    /** The draft text for a tab id (the template for an unknown id). */
    const draftTextFor = React.useCallback(
        (tabId: string): string => {
            // Unknown ids fall back to the template (a draft evicted mid-read).
            return untitledHttpDraftsRef.current[tabId] ?? UNTITLED_HTTP_TEMPLATE;
        },
        []
    );

    /** Live-sync a draft's text (the workbench's onSourceChange). */
    const setDraftText = React.useCallback((tabId: string, text: string) => {
        // Ref write only — no re-render for every keystroke.
        untitledHttpDraftsRef.current[tabId] = text;
    }, []);

    /** Tools ▸ API Client: gating + create the next untitled draft. */
    const openApiClientDraft = React.useCallback(() => {
        // The active tab decides the gating branch.
        const active = openTabs.find((t) => t.id === activeTabId);
        if (active) {
            // A real .http/.rest file is fully the client's surface already.
            if (isHttpWorkbenchSurface(active.fileName)) {
                toast({
                    title: "The API client is open",
                    description: `${active.fileName} is showing in the API client workbench.`
                });
                return;
            }
            // An untitled draft is already the in-memory client.
            if (active.untitled) {
                toast({
                    title: "The API client is open",
                    description: `${active.fileName} is an in-memory draft — Save As writes it where you choose.`
                });
                return;
            }
        }
        // Name and seed the next draft (Untitled-1.http, then Untitled-2.http).
        untitledHttpCounterRef.current += 1;
        const {tabId, fileName} = nextUntitledDraft(untitledHttpCounterRef.current);
        // The draft starts from the shared template and lives ONLY in memory.
        untitledHttpDraftsRef.current[tabId] = UNTITLED_HTTP_TEMPLATE;
        // The tab: empty slugs (no disk file), a dirty dot (never saved), the untitled flag.
        const newTab = draftTabFor(tabId, fileName);
        // Append + activate in one go; clearing the slugs keeps the stale
        // selection (the previously open file) out of the draft pane.
        setOpenTabs((prev) => (prev.some((t) => t.id === tabId) ? prev : [...prev, newTab]));
        setActiveTabId(tabId);
        setEditorBlank(false);
        setSelectedFolderSlug("");
        setSelectedFileSlug("");
        toast({
            title: "Untitled API client draft",
            description: "Working in memory only — press ⌘S or Save As… to pick where it lives on disk."
        });
    }, [openTabs, activeTabId, setOpenTabs, setActiveTabId, setEditorBlank, setSelectedFolderSlug, setSelectedFileSlug, toast]);

    /** Open the Save As picker seeded for an untitled draft (⌘S routing). */
    const openSaveAsPicker = React.useCallback(
        (tab: EditorTab, selectedFolderSlug: string) => {
            // Seed the picker: the current folder when one is open, else the
            // first folder; the name starts from the historical default.
            setUntitledSaveFolder(selectedFolderSlug || folders[0]?.slug || "");
            setUntitledSaveName("requests.http");
            setUntitledSaveDialog({tabId: tab.id, fileName: tab.fileName});
        },
        [folders]
    );

    /** Confirm the Save As picker: write to disk and swap in the real tab. */
    const confirmUntitledSave = React.useCallback(async () => {
        // Nothing to do when the picker was closed before the click landed.
        if (!untitledSaveDialog) {
            return;
        }
        // Normalize the file name: trim, force a .http/.rest suffix (pure rule).
        const name = normalizeSaveAsName(untitledSaveName);
        // An empty name is a no-op — the dialog stays open for a retry.
        if (name === "") {
            return;
        }
        // Resolve the destination folder (the picked one, else the first).
        const folderSlug = untitledSaveFolder || folders[0]?.slug || "";
        if (!folderSlug) {
            toast({
                title: "No folder to save into",
                description: "Open a project folder first, then Save As again.",
                variant: "destructive"
            });
            return;
        }
        // The draft text as of RIGHT NOW (the workbench kept it synced live).
        const content = untitledHttpDraftsRef.current[untitledSaveDialog.tabId] ?? UNTITLED_HTTP_TEMPLATE;
        try {
            // Create the file on disk — the ONLY write this flow ever performs.
            const res = await fetch("/api/file-create", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, fileName: name, content}),
            });
            const data = await res.json() as { ok?: boolean; slug?: string; error?: string };
            if (!res.ok || !data.ok || !data.slug) throw new Error(data.error ?? `HTTP ${res.status}`);
            // Refresh the tree so the new file is visible and selectable.
            await refreshFolders();
            // The folder's display name for the new tab + the toast.
            const folderName = folders.find((f) => f.slug === folderSlug)?.name ?? "";
            // The real tab replacing the draft (standard id/slug shape).
            const realTab = realTabFor(folderSlug, data.slug, name, folderName);
            // Swap in place; dedupe against an already-open tab of the same file.
            setOpenTabs((prev) => swapDraftForRealTab(prev, untitledSaveDialog.tabId, realTab));
            // Activate + select the real file; drop the in-memory draft.
            setActiveTabId(realTab.id);
            setSelectedFolderSlug(folderSlug);
            setSelectedFileSlug(data.slug);
            setEditorBlank(false);
            delete untitledHttpDraftsRef.current[untitledSaveDialog.tabId];
            setUntitledSaveDialog(null);
            toast({title: "Draft saved", description: `${name} written to "${folderName}".`, variant: "success"});
        } catch (err) {
            toast({title: "Could not save the draft", description: (err as Error).message, variant: "destructive"});
        }
    }, [untitledSaveDialog, untitledSaveFolder, untitledSaveName, folders, refreshFolders, setOpenTabs, setActiveTabId, setSelectedFolderSlug, setSelectedFileSlug, setEditorBlank, toast]);

    // The full public surface of the hook.
    return {
        activeUntitledTab,
        draftTextFor,
        setDraftText,
        openApiClientDraft,
        openSaveAsPicker,
        confirmUntitledSave,
        untitledSaveDialog,
        setUntitledSaveDialog,
        untitledSaveFolder,
        setUntitledSaveFolder,
        untitledSaveName,
        setUntitledSaveName,
    };
}
