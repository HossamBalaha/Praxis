"use client";

import * as React from "react";
import {Circle, Columns, Crosshair, FileCode2, Pin, Rows2, X} from "lucide-react";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {STORAGE_PREFIX} from "@/lib/config";
import {useMiddleMousePan} from "@/lib/middle-pan";
// Perf HUD — counts every render of the tab bar into the per-panel
// registry (Settings → Editor → performance HUD).
import {reportPanelRender} from "@/lib/perf-metrics";

export interface EditorTab {
    id: string;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    folderName: string;
    /** Whether this tab has been run and is currently "dirty" (unsaved). */
    dirty?: boolean;
    /** Whether this tab has a run result (ok/fail). */
    runOk?: boolean | null;
    /** Round 3 — an UNTITLED in-memory draft (e.g. the API client's
     *  Untitled-1.http). Its slugs are empty strings, its content lives
     *  in a page-level draft map (never on disk), and ⌘S opens a Save-As
     *  dialog instead of writing anywhere. Untitled tabs are excluded
     *  from split targets and from the persisted session. */
    untitled?: boolean;
}

/** One independent split-pane view: the file a pane shows. */
export interface SplitTarget {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    folderName: string;
}

/** Detail carried by the split-editor events. `targets` is the
 *  multi-selected tabs IN CLICK ORDER (first clicked → first pane) —
 *  page.tsx opens one independent pane per target. Without targets,
 *  the page picks the most recent OTHER tab (or the open file when
 *  only one exists). */
export interface SplitEditorDetail {
    orientation?: "right" | "down";
    targets?: SplitTarget[];
}

interface EditorTabsProps {
    tabs: EditorTab[];
    activeTabId: string | null;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    /** Context-menu action: reveal the tab's file in the file-tree sidebar. */
    onRevealInExplorer?: (tab: EditorTab) => void;
    /** Context-menu action: close every tab except the given one. */
    onCloseOthers?: (keepId: string) => void;
    /** Context-menu action: close all tabs. */
    onCloseAll?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Persisted tab order + pinned-tab ids (localStorage).              */
/* ------------------------------------------------------------------ */
const TAB_ORDER_KEY = `${STORAGE_PREFIX}-tab-order`;
const PINNED_TABS_KEY = `${STORAGE_PREFIX}-pinned-tabs`;

/** Custom event dispatched when a split editor
 * (Ctrl+\ or the "Split" button). page.tsx listens and renders the
 * second pane — EditorTabs only fires the event. */
export const SPLIT_EDITOR_EVENT = "praxis:split-editor";
/** split DOWN variant — the second pane stacks below
 *  instead of beside (editor-tabs button + View menu dispatch it). */
export const SPLIT_EDITOR_DOWN_EVENT = "praxis:split-editor-down";

function readStoredTabOrder(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(TAB_ORDER_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            return parsed;
        }
    } catch {
        /* ignore malformed JSON */
    }
    return [];
}

function writeStoredTabOrder(order: string[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
    } catch {
        /* ignore quota / private-mode errors */
    }
}

function readPinnedTabIds(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(PINNED_TABS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            return parsed;
        }
    } catch {
        /* ignore malformed JSON */
    }
    return [];
}

function writePinnedTabIds(ids: string[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(PINNED_TABS_KEY, JSON.stringify(ids));
    } catch {
        /* ignore quota / private-mode errors */
    }
}

/** Dispatch the split-editor event — page.tsx renders the panes. */
function dispatchSplitEditor(orientation: "right" | "down", targets?: SplitTarget[]): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(SPLIT_EDITOR_EVENT, {detail: {orientation, targets} satisfies SplitEditorDetail})
    );
}

/**
 * VSCode-style multi-tab editor bar. Shows one tab per open script.
 * Click to switch, middle-click or × to close.
 *
 * Tabs can be dragged left/right to reorder (persisted), pinned to the
 * far left (icon-only, can't be closed — persisted), and split into a
 * second editor pane via Ctrl+\ or the "Split" button.
 */
export function EditorTabs({
                               tabs,
                               activeTabId,
                               onSelectTab,
                               onCloseTab,
                               onRevealInExplorer,
                               onCloseOthers,
                               onCloseAll,
                           }: EditorTabsProps) {
    // Count THIS render into the Perf HUD's per-panel registry (the same
    // one-shot call code-viewer's "Editor" row uses).
    reportPanelRender("EditorTabs");
    // Persisted tab ordering — array of tab IDs in the preferred
    // visual order. Tabs not in this list are appended at the end.
    const [tabOrder, setTabOrder] = React.useState<string[]>([]);
    // Persisted pinned tab IDs — pinned tabs go to the far left and
    // render icon-only. Stored as an array (in pin order).
    const [pinnedTabIds, setPinnedTabIds] = React.useState<string[]>([]);

    // Load persisted order + pinned ids once on mount (client-only,
    // after hydration, to avoid SSR/client mismatch).
    React.useEffect(() => {
        setTabOrder(readStoredTabOrder());
        setPinnedTabIds(readPinnedTabIds());
    }, []);

    // Drag state. The ref gives event handlers synchronous access to the
    // dragged id (closures can be stale on the very first dragover);
    // the state mirrors it so render can show the dragged tab as dimmed.
    const draggedTabIdRef = React.useRef<string | null>(null);
    const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null);
    const [dragOverTabId, setDragOverTabId] = React.useState<string | null>(null);
    const [dropSide, setDropSide] = React.useState<"left" | "right">("left");

    // ── Multi-select for splitting ─────────────────────────────────
    // Ctrl/Cmd+Click toggles a tab in/out of the selection; Shift+Click
    // selects the range from the last-clicked tab. Selected tabs feed the
    // Split button (one independent pane per selected file, in CLICK
    // ORDER — the first tab you selected lands in the first pane, the
    // second in the second, and so on). A plain click clears the
    // selection and switches, as always.
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    /** Selected tab ids in the order they were clicked — drives the
     *  pane assignment so “select A, then B” splits A left / B right. */
    const [selectionOrder, setSelectionOrder] = React.useState<string[]>([]);
    const lastClickedRef = React.useRef<string | null>(null);
    const selectionForSplit = React.useMemo(() => {
        const byId = new Map(tabs.map((t) => [t.id, t]));
        const ordered: EditorTab[] = [];
        for (const id of selectionOrder) {
            const t = byId.get(id);
            if (t && selectedIds.has(id)) ordered.push(t);
        }
        /* Round 3 — untitled in-memory drafts carry no real slugs, so they
         * can never back a split pane; filter them OUT of the dispatch
         * payload (page.tsx would otherwise silently fall back to another
         * file when ONLY untitled tabs were selected). */
        return ordered
            .filter((t) => !!t.folderSlug && !!t.fileSlug)
            .map((t) => ({
                folderSlug: t.folderSlug,
                fileSlug: t.fileSlug,
                fileName: t.fileName,
                folderName: t.folderName,
            }));
    }, [selectedIds, selectionOrder, tabs]);
    const liveTabIds = React.useMemo(() => tabs.map((t) => t.id), [tabs]);

    // Scroll the active tab into view whenever it changes. Without this,
    // opening a tab via the search dialog or "Reopen closed tab" leaves
    // the active tab scrolled off-screen (the tab bar uses horizontal
    // scroll, so the user sees no indication of which tab is active).
    const activeTabRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        if (!activeTabId) return;
        const el = activeTabRef.current;
        if (!el) return;
        // requestAnimationFrame so the tab has laid out before we scroll.
        const raf = requestAnimationFrame(() => {
            el.scrollIntoView({inline: "nearest", block: "nearest"});
        });
        return () => cancelAnimationFrame(raf);
    }, [activeTabId]);

    // ── Git-diff focus wiring ─────────────────────────────────────────
    // The GitDiffPanel listens for `praxis:git-diff-active`
    // ({ folderSlug, fileSlug }) to focus the active file's diff, but
    // nothing ever dispatched it (only the explorer's
    // `praxis:open-git-diff` fired). Every EditorTab carries its file's
    // slugs, so the tab bar is the natural focus trigger: when the
    // ACTIVE tab changes, tell the diff panel which file is now in
    // focus. Skipped for non-file tabs (missing slugs) and the initial
    // mount (the panel starts in list mode); debounced so rapid tab
    // switching doesn't spam the panel's resolveActive lookup.
    const lastDiffActiveIdRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!activeTabId) return;
        if (lastDiffActiveIdRef.current === null) {
            // First run (mount) — record without dispatching.
            lastDiffActiveIdRef.current = activeTabId;
            return;
        }
        if (lastDiffActiveIdRef.current === activeTabId) return;
        lastDiffActiveIdRef.current = activeTabId;
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab || !tab.folderSlug || !tab.fileSlug) return; // non-file tab
        const timer = setTimeout(() => {
            window.dispatchEvent(
                new CustomEvent("praxis:git-diff-active", {
                    detail: {folderSlug: tab.folderSlug, fileSlug: tab.fileSlug},
                })
            );
        }, 250);
        return () => clearTimeout(timer);
    }, [activeTabId, tabs]);

    // Prune stale IDs from persisted order/pinned whenever the open-tab
    // set changes (closes, navigations, etc.). New tab IDs are appended
    // at the end so they appear after existing tabs.
    React.useEffect(() => {
        if (tabOrder.length === 0 && pinnedTabIds.length === 0) return;
        const live = new Set(liveTabIds);
        let orderChanged = false;
        const nextOrder: string[] = [];
        for (const id of tabOrder) {
            if (live.has(id)) {
                nextOrder.push(id);
            } else {
                orderChanged = true;
            }
        }
        for (const id of liveTabIds) {
            if (!nextOrder.includes(id)) {
                nextOrder.push(id);
                orderChanged = true;
            }
        }
        if (orderChanged) {
            setTabOrder(nextOrder);
            writeStoredTabOrder(nextOrder);
        }
        const nextPinned = pinnedTabIds.filter((id) => live.has(id));
        if (nextPinned.length !== pinnedTabIds.length) {
            setPinnedTabIds(nextPinned);
            writePinnedTabIds(nextPinned);
        }
    }, [liveTabIds, tabOrder, pinnedTabIds]);

    // Ctrl+\ / Cmd+\ → split editor (with the current multi-selection).
    React.useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && (e.key === "\\" || e.key === "|")) {
                e.preventDefault();
                dispatchSplitEditor("right", selectionRef.current);
            }
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    // Keep a ref of the live selection for the keyboard shortcut.
    const selectionRef = React.useRef<SplitTarget[]>([]);
    React.useEffect(() => {
        selectionRef.current = selectionForSplit;
    }, [selectionForSplit]);

    // Wheel / middle-click-drag panning for the tabs strip — the SAME
    // interaction the settings dialog's section strips use
    // (useMiddleMousePan). Callback ref: the strip mounts/unmounts with
    // the first tab, which a plain useRef cannot follow. Called BEFORE
    // the early return below — hooks must run unconditionally.
    const tabsStripPanRef = useMiddleMousePan<HTMLDivElement>();

    if (tabs.length === 0) return null;

    // Compute display order: pinned tabs first (in stored pin order),
    // then non-pinned tabs in stored order, then any tabs not present in
    // the stored order (appended in prop order).
    const pinnedSet = new Set(pinnedTabIds);
    const orderedIds: string[] = (() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const id of pinnedTabIds) {
            if (!seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
        }
        for (const id of tabOrder) {
            if (!seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
        }
        for (const id of liveTabIds) {
            if (!seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
        }
        return out;
    })();

    const tabById = new Map(tabs.map((t) => [t.id, t]));
    const displayTabs: EditorTab[] = orderedIds
        .map((id) => tabById.get(id))
        .filter((t): t is EditorTab => Boolean(t));

    function handleDragStart(e: React.DragEvent, id: string) {
        draggedTabIdRef.current = id;
        setDraggedTabId(id);
        e.dataTransfer.effectAllowed = "move";
        // Some browsers refuse to start a drag without data set.
        try {
            e.dataTransfer.setData("text/plain", id);
        } catch {
            /* ignore */
        }
    }

    function handleDragOver(e: React.DragEvent, id: string) {
        if (!draggedTabIdRef.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Decide left vs. right insertion based on cursor position
        // relative to the hovered tab's horizontal center.
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        setDragOverTabId(id);
        setDropSide(isLeft ? "left" : "right");
    }

    function handleDrop(e: React.DragEvent, targetId: string) {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = draggedTabIdRef.current;
        draggedTabIdRef.current = null;
        setDraggedTabId(null);
        setDragOverTabId(null);
        if (!draggedId || draggedId === targetId) return;

        const order = displayTabs.map((t) => t.id);
        const withoutDragged = order.filter((id) => id !== draggedId);
        let targetIdx = withoutDragged.indexOf(targetId);
        if (targetIdx === -1) return;
        if (dropSide === "right") targetIdx += 1;
        withoutDragged.splice(targetIdx, 0, draggedId);

        setTabOrder(withoutDragged);
        writeStoredTabOrder(withoutDragged);
        // Active tab stays active — onSelectTab is not called and
        // activeTabId is owned by page.tsx, untouched here.
    }

    function handleDragEnd() {
        draggedTabIdRef.current = null;
        setDraggedTabId(null);
        setDragOverTabId(null);
    }

    function togglePin(id: string) {
        setPinnedTabIds((prev) => {
            const next = prev.includes(id)
                ? prev.filter((p) => p !== id)
                : [...prev, id];
            writePinnedTabIds(next);
            return next;
        });
    }

    return (
        /* The bar is a TWO-REGION row: a scrollable tabs strip (min-w-0,
         * overflow-x-auto) plus a FIXED control cluster pinned to the
         * right edge. The Split buttons used to live INSIDE the tab
         * scroll region, so with many open tabs they scrolled out of
         * sight exactly when they were needed; now the tabs scroll
         * (and can wrap visually behind the cluster's edge) while the
         * Split controls stay reachable at all times. */
        <div className="flex items-stretch border-b bg-muted/20 shrink-0">
            <div
                ref={tabsStripPanRef}
                className="flex items-stretch overflow-x-auto min-w-0 flex-1 pb-1 [scrollbar-width:thin]"
                title="Scroll the tabs left/right — mouse wheel, middle-click drag, or Shift+wheel"
            >
                {displayTabs.map((tab) => {
                    const isActive = tab.id === activeTabId;
                    const isPinned = pinnedSet.has(tab.id);
                    const isDragOver = dragOverTabId === tab.id;
                    const isDragged = draggedTabId === tab.id;
                    const isSelected = selectedIds.has(tab.id);
                    return (
                        <ContextMenu key={tab.id}>
                            <ContextMenuTrigger asChild>
                                <div
                                    ref={isActive ? activeTabRef : undefined}
                                    role="button"
                                    tabIndex={0}
                                    // Pinned tabs are not draggable (they're locked to the
                                    // far left); they also don't accept drops.
                                    draggable={!isPinned}
                                    onDragStart={(e) => handleDragStart(e, tab.id)}
                                    onDragOver={(e) => {
                                        if (isPinned) return;
                                        handleDragOver(e, tab.id);
                                    }}
                                    onDrop={(e) => {
                                        if (isPinned) return;
                                        handleDrop(e, tab.id);
                                    }}
                                    onDragEnd={handleDragEnd}
                                    onClick={(e) => {
                                        // Ctrl/Cmd+Click toggles multi-select (for splitting);
                                        // Shift+Click selects the range from the last click.
                                        if (e.ctrlKey || e.metaKey) {
                                            e.preventDefault();
                                            lastClickedRef.current = tab.id;
                                            setSelectedIds((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(tab.id)) next.delete(tab.id);
                                                else next.add(tab.id);
                                                return next;
                                            });
                                            // Track click order: appending on select, removing on
                                            // deselect — the split panes follow THIS order.
                                            setSelectionOrder((prev) =>
                                                prev.includes(tab.id) ? prev.filter((x) => x !== tab.id) : [...prev, tab.id]
                                            );
                                            return;
                                        }
                                        if (e.shiftKey && lastClickedRef.current) {
                                            const order = displayTabs.map((t) => t.id);
                                            const a = order.indexOf(lastClickedRef.current);
                                            const b = order.indexOf(tab.id);
                                            if (a !== -1 && b !== -1) {
                                                const [from, to] = a < b ? [a, b] : [b, a];
                                                setSelectedIds(new Set(order.slice(from, to + 1)));
                                                setSelectionOrder(order.slice(from, to + 1));
                                                return;
                                            }
                                        }
                                        lastClickedRef.current = tab.id;
                                        if (selectedIds.size > 0) {
                                            setSelectedIds(new Set());
                                            setSelectionOrder([]);
                                        }
                                        onSelectTab(tab.id);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onSelectTab(tab.id);
                                        }
                                    }}
                                    onMouseDown={(e) => {
                                        // Middle-click closes the tab (VSCode convention) —
                                        // but not for pinned tabs (they can't be closed).
                                        if (e.button === 1 && !isPinned) {
                                            e.preventDefault();
                                            onCloseTab(tab.id);
                                        }
                                    }}
                                    className={cn(
                                        "group flex items-center gap-1.5 py-1.5 text-xs border-r cursor-pointer transition-colors shrink-0",
                                        isPinned ? "pl-2 pr-2" : "pl-3 pr-1.5",
                                        isActive
                                            ? "bg-background text-foreground border-b-2 border-b-emerald-500"
                                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
                                        isSelected && "ring-1 ring-emerald-500/70 ring-inset bg-emerald-500/10",
                                        isDragged && "opacity-50",
                                        // Drop indicator: a thick emerald border on the side
                                        // the dragged tab will be inserted.
                                        isDragOver && dropSide === "left" && "border-l-2 border-l-emerald-500",
                                        isDragOver && dropSide === "right" && "border-r-2 border-r-emerald-500"
                                    )}
                                    title={
                                        isPinned
                                            ? `${tab.fileName} (pinned) — click to switch`
                                            : isSelected
                                                ? `${tab.fileName} — selected for splitting (Ctrl/Cmd+click to toggle)`
                                                : `${tab.fileName} — click to switch, middle-click or × to close${tab.dirty ? " (unsaved changes)" : ""} — Ctrl/Cmd+click to select for splitting`
                                    }
                                >
                                    {/* Run status dot */}
                                    {tab.runOk === true && (
                                        <Circle className="size-2 fill-emerald-500 text-emerald-500 shrink-0"/>
                                    )}
                                    {tab.runOk === false && (
                                        <Circle className="size-2 fill-red-500 text-red-500 shrink-0"/>
                                    )}
                                    <FileCode2
                                        className={cn(
                                            "size-3.5 shrink-0",
                                            isActive ? "text-emerald-500" : "text-muted-foreground"
                                        )}
                                    />
                                    {/* Pinned tabs still show the file name (the user
* asked for this — hiding the name made it hard to
* identify which file is pinned). The pin icon is
* shown to indicate the pinned state. */}
                                    <span className="truncate max-w-[140px]">{tab.fileName}</span>
                                    {tab.dirty && (
                                        <span
                                            className="size-1.5 rounded-full bg-amber-500 shrink-0"
                                            role="img"
                                            aria-label="Unsaved changes"
                                        />
                                    )}
                                    {isPinned ? (
                                        // Pinned tab: pin icon (filled, click to unpin).
                                        // No close button — pinned tabs can't be closed.
                                        // Always visible (not hover-gated) so touch + keyboard
                                        // users can reach it.
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                togglePin(tab.id);
                                            }}
                                            className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-opacity focus-visible:opacity-100"
                                            aria-label={`Unpin ${tab.fileName}`}
                                            title={`Unpin ${tab.fileName}`}
                                        >
                                            <Pin className="size-3 fill-current text-emerald-500"/>
                                        </button>
                                    ) : (
                                        <>
                                            {/* Pin button — always visible on the active tab,
otherwise shown on hover OR focus-within so
touch + keyboard users can reach it. */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    togglePin(tab.id);
                                                }}
                                                className={cn(
                                                    "shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-opacity",
                                                    isActive
                                                        ? "opacity-100"
                                                        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                                                )}
                                                aria-label={`Pin ${tab.fileName}`}
                                                title={`Pin ${tab.fileName}`}
                                            >
                                                <Pin className="size-3 text-muted-foreground"/>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCloseTab(tab.id);
                                                }}
                                                className={cn(
                                                    "shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-opacity",
                                                    isActive
                                                        ? "opacity-100"
                                                        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                                                )}
                                                aria-label={`Close ${tab.fileName}`}
                                                title={`Close ${tab.fileName}`}
                                            >
                                                <X className="size-3"/>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-56">
                                <ContextMenuItem onClick={() => onSelectTab(tab.id)} className="gap-2 cursor-pointer">
                                    <FileCode2 className="size-3.5 text-emerald-500"/>
                                    <span>Open</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => togglePin(tab.id)}
                                    className="gap-2 cursor-pointer"
                                >
                                    <Pin className="size-3.5 text-muted-foreground"/>
                                    <span>{isPinned ? "Unpin tab" : "Pin tab"}</span>
                                </ContextMenuItem>
                                {onRevealInExplorer && (
                                    <ContextMenuItem onClick={() => onRevealInExplorer(tab)}
                                                     className="gap-2 cursor-pointer">
                                        <Crosshair className="size-3.5 text-muted-foreground"/>
                                        <span>Reveal In Explorer</span>
                                    </ContextMenuItem>
                                )}
                                {/* ── Split ▸ — open this tab (or every multi-selected
                  tab) in its own split pane, right or down. */}
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Open this file — or every multi-selected tab — in split panes">
                                        <Columns className="size-3.5 text-muted-foreground"/>
                                        <span className="flex-1">Split</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        {selectedIds.size > 1 ? (
                                            <>
                                                <ContextMenuItem
                                                    onClick={() => dispatchSplitEditor("right", selectionForSplit)}
                                                    className="gap-2 cursor-pointer"
                                                    title={`One pane per selected tab, side by side (${selectedIds.size} selected, in click order)`}
                                                >
                                                    <Columns className="size-3.5 text-emerald-500"/>
                                                    <span>Split {selectedIds.size} selected right</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() =>
                                                        window.dispatchEvent(
                                                            new CustomEvent(SPLIT_EDITOR_DOWN_EVENT, {
                                                                detail: {
                                                                    orientation: "down",
                                                                    targets: selectionForSplit,
                                                                } satisfies SplitEditorDetail,
                                                            })
                                                        )
                                                    }
                                                    className="gap-2 cursor-pointer"
                                                    title={`One pane per selected tab, stacked below (${selectedIds.size} selected, in click order)`}
                                                >
                                                    <Rows2 className="size-3.5 text-emerald-500"/>
                                                    <span>Split {selectedIds.size} selected down</span>
                                                </ContextMenuItem>
                                            </>
                                        ) : (
                                            <>
                                                {/* Round 3 — an untitled draft has no disk file to
                          mirror into a pane, so the single-tab Split items
                          are hidden for it (the multi-selected branch above
                          already dropped untitled tabs from its payload). */}
                                                {!!tab.folderSlug && !!tab.fileSlug && (
                                                    <>
                                                        <ContextMenuItem
                                                            onClick={() =>
                                                                dispatchSplitEditor("right", [
                                                                    {
                                                                        folderSlug: tab.folderSlug,
                                                                        fileSlug: tab.fileSlug,
                                                                        fileName: tab.fileName,
                                                                        folderName: tab.folderName
                                                                    },
                                                                ])
                                                            }
                                                            className="gap-2 cursor-pointer"
                                                            title="Open this file in a pane beside the editor (Ctrl+\)"
                                                        >
                                                            <Columns className="size-3.5 text-emerald-500"/>
                                                            <span>Split editor right</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem
                                                            onClick={() =>
                                                                window.dispatchEvent(
                                                                    new CustomEvent(SPLIT_EDITOR_DOWN_EVENT, {
                                                                        detail: {
                                                                            orientation: "down",
                                                                            targets: [
                                                                                {
                                                                                    folderSlug: tab.folderSlug,
                                                                                    fileSlug: tab.fileSlug,
                                                                                    fileName: tab.fileName,
                                                                                    folderName: tab.folderName
                                                                                },
                                                                            ],
                                                                        } satisfies SplitEditorDetail,
                                                                    })
                                                                )
                                                            }
                                                            className="gap-2 cursor-pointer"
                                                            title="Open this file in a pane below the editor"
                                                        >
                                                            <Rows2 className="size-3.5 text-emerald-500"/>
                                                            <span>Split editor down</span>
                                                        </ContextMenuItem>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {selectedIds.size > 1 && (
                                            <>
                                                <ContextMenuSeparator/>
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        setSelectedIds(new Set());
                                                        setSelectionOrder([]);
                                                        onSelectTab(tab.id);
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Drop the multi-selection and return to a single active tab"
                                                >
                                                    <X className="size-3.5 text-muted-foreground"/>
                                                    <span>Clear selection ({selectedIds.size})</span>
                                                </ContextMenuItem>
                                            </>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                                {/* ── Close ▸ — this tab / others / all. ── */}
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Close this tab, the others, or all of them">
                                        <X className="size-3.5 text-muted-foreground"/>
                                        <span className="flex-1">Close</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-52">
                                        <ContextMenuItem
                                            onClick={() => {
                                                if (!isPinned) onCloseTab(tab.id);
                                            }}
                                            disabled={isPinned}
                                            className="gap-2 cursor-pointer"
                                        >
                                            <X className="size-3.5 text-muted-foreground"/>
                                            <span>{isPinned ? "Close (pinned)" : "Close"}</span>
                                        </ContextMenuItem>
                                        {onCloseOthers && (
                                            <ContextMenuItem onClick={() => onCloseOthers(tab.id)}
                                                             className="gap-2 cursor-pointer">
                                                <X className="size-3.5 text-muted-foreground"/>
                                                <span>Close Others</span>
                                            </ContextMenuItem>
                                        )}
                                        {onCloseAll && (
                                            <ContextMenuItem onClick={onCloseAll} className="gap-2 cursor-pointer">
                                                <X className="size-3.5 text-muted-foreground"/>
                                                <span>Close All</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            </ContextMenuContent>
                        </ContextMenu>
                    );
                })}
            </div>
            {/* Split editor buttons — the FIXED right cluster. With tabs
       * multi-selected (Ctrl/Cmd+click), Split opens ONE pane per
       * selected file; without a selection the page opens the most
       * recent OTHER tab, falling back to the open file. */}
            <div className="flex items-center gap-1 pl-1.5 pr-1 border-l bg-muted/30 sticky right-0 shrink-0">
                {selectedIds.size > 0 && (
                    <span className="mr-1 text-[10px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            {selectionForSplit.length} selected
          </span>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatchSplitEditor("right", selectionForSplit.length ? selectionForSplit : undefined)}
                    className="h-7 px-2 text-xs text-muted-foreground gap-1"
                    aria-label="Split editor right"
                    title="Split editor right (Ctrl+\) — one pane per multi-selected tab, else the most recent other file"
                >
                    <Columns className="size-3.5"/>
                    <span className="hidden sm:inline">Split</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                        window.dispatchEvent(
                            new CustomEvent(SPLIT_EDITOR_DOWN_EVENT, {
                                detail: {
                                    orientation: "down",
                                    targets: selectionForSplit.length ? selectionForSplit : undefined,
                                } satisfies SplitEditorDetail,
                            })
                        )
                    }
                    className="h-7 px-2 text-xs text-muted-foreground gap-1"
                    aria-label="Split editor down"
                    title="Split editor down — stack panes below (one per multi-selected tab)"
                >
                    <Rows2 className="size-3.5"/>
                    <span className="hidden lg:inline">Split Down</span>
                </Button>
            </div>
        </div>
    );
}
