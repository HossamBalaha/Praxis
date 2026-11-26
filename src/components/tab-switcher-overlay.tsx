"use client";

/**
 * tab-switcher-overlay.tsx — the VS Code-style Ctrl+Tab tab switcher.
 *
 * Two exports:
 *   · <TabSwitcherOverlay /> — the CONTROLLED chrome: while `open`, an
 *     overlay lists `files` in the parent's order (MRU in practice)
 *     with the highlighted row, keyboard-driven and focus-trapped:
 *       Tab / Shift+Tab (and arrows) move the highlight,
 *       Enter or mouse click commits the switch,
 *       releasing Ctrl/Cmd commits the highlighted row,
 *       Esc or a backdrop click cancels,
 *       typing anything pops up a tiny fuzzy filter box.
 *   · useTabSwitcherKeys() — the Ctrl/Tab STATE MACHINE the page needs
 *     (~10-line wiring; see the wiring notes at the bottom of this
 *     file): opens on Ctrl+Tab (with the browser caveats the app's
 *     legacy cycler documented — plain Ctrl+Tab only reaches the page
 *     in fullscreen/PWA installs; Ctrl+Alt+Tab is the always-working
 *     twin), snapshots the MRU list at open time (cycling must NOT
 *     reorder history — the page's mruCycleGuard philosophy), and
 *     commits through the caller's callback.
 *
 * Key ownership is strictly split so nothing double-fires:
 *   · the HOOK owns the window keydown that OPENS the switcher (the
 *     overlay isn't mounted yet at that moment) and the window blur
 *     safety net;
 *   · the OVERLAY owns every key while open (its root is focused — the
 *     filter input is the single tabbable element, which is what makes
 *     the Tab focus-trap work), including the Ctrl/Cmd key-release
 *     commit.
 */

import * as React from "react";
import {AnimatePresence, motion} from "framer-motion";
import {FileCode2} from "lucide-react";
import {cn} from "@/lib/utils";
import {useStableEvent} from "@/lib/use-stable-event";
import {clampIndex, fuzzyMatch, initialSwitcherIndex, wrapIndex} from "@/lib/tab-filter";

// ── controlled overlay ────────────────────────────────────────────────

/** One open tab as shown in the switcher. `icon` lets the caller pass a
 *  kind-aware icon; a generic file icon is used when omitted. */
export interface SwitcherFile {
    id: string;
    label: string;
    dirty?: boolean;
    icon?: React.ReactNode;
}

export interface TabSwitcherOverlayProps {
    open: boolean;
    /** Tabs in the order the caller wants shown (MRU order in practice). */
    files: SwitcherFile[];
    /** Index into `files` the switcher highlights when it OPENS (the
     *  transient highlight is internal — see the header). */
    activeIndex: number;
    /** Commit the switch: receives the index into the ORIGINAL `files`
     *  array (filtering never changes what the index refers to). */
    onSelect: (index: number) => void;
    /** Cancel (Esc / backdrop). */
    onClose: () => void;
    className?: string;
}

export function TabSwitcherOverlay({
                                       open,
                                       files,
                                       activeIndex,
                                       onSelect,
                                       onClose,
                                       className,
                                   }: TabSwitcherOverlayProps) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const openRef = React.useRef(false);
    openRef.current = open;

    /** Transient highlight — index into the FILTERED list; the original
     *  files-array index rides along on each row (see `filtered`). */
    const [cursor, setCursor] = React.useState(0);
    const [query, setQuery] = React.useState("");

    // Reset on every open transition: cursor from the controlled prop,
    // filter cleared. (The hook sets activeIndex at open time, so one
    // effect keyed on `open` covers both.)
    React.useEffect(() => {
        if (open) {
            setCursor(clampIndex(activeIndex, files.length));
            setQuery("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // The single tabbable element: focus it while open — that's what
    // traps focus inside the overlay (Tab is intercepted at the root) and
    // what makes "type to filter" work before the box is visible.
    React.useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => inputRef.current?.focus({preventScroll: true}), 0);
        return () => window.clearTimeout(t);
    }, [open]);

    const filtered = React.useMemo(() => {
        if (!query) return files.map((file, index) => ({file, index}));
        const scored: Array<{ file: SwitcherFile; index: number; score: number }> = [];
        files.forEach((file, index) => {
            const score = fuzzyMatch(query, file.label);
            if (score !== null) scored.push({file, index, score});
        });
        // Best match first when filtering; ties keep MRU order (stable sort).
        scored.sort((a, b) => b.score - a.score);
        return scored.map(({file, index}) => ({file, index}));
    }, [files, query]);

    // A new filter re-anchors the highlight on the best match.
    React.useEffect(() => {
        setCursor((c) => clampIndex(c, filtered.length));
    }, [filtered.length]);

    const commitCursor = React.useCallback(() => {
        const row = filtered[cursor];
        if (!row) return;
        onSelect(row.index);
        onClose();
    }, [filtered, cursor, onSelect, onClose]);

    const onKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                commitCursor();
                return;
            }
            const forward = e.key === "Tab" ? !e.shiftKey : e.key === "ArrowDown" || e.key === "ArrowRight";
            const backward = e.key === "Tab" ? e.shiftKey : e.key === "ArrowUp" || e.key === "ArrowLeft";
            if (forward || backward) {
                // Focus trap + selection move in one: the default Tab action
                // (moving focus out of the overlay) must never run.
                e.preventDefault();
                setCursor((c) => wrapIndex(c + (forward ? 1 : -1), filtered.length));
                return;
            }
            // Printable characters seed the filter. When the input is ALREADY
            // the event target its own onChange handles the keystroke —
            // intercepting here would double-append.
            const target = e.target as HTMLElement | null;
            if (
                e.key.length === 1 &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                target !== inputRef.current
            ) {
                e.preventDefault();
                setQuery((q) => q + e.key);
                inputRef.current?.focus({preventScroll: true});
            }
        },
        [filtered.length, commitCursor, onClose]
    );

    // Releasing the modifier commits the highlighted row — the VS Code
    // gesture. (Works via bubbling: focus lives inside the overlay.)
    const onKeyUp = React.useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Control" || e.key === "Meta") {
                e.preventDefault();
                commitCursor();
            }
        },
        [commitCursor]
    );

    // Focus trap: anything that moves focus out of the overlay (except
    // our own closing) is pulled back on the next frame.
    const onBlur = React.useCallback((e: React.FocusEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        window.requestAnimationFrame(() => {
            if (openRef.current) inputRef.current?.focus({preventScroll: true});
        });
    }, []);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    exit={{opacity: 0}}
                    transition={{duration: 0.12}}
                    className={cn(
                        "fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-background/20 backdrop-blur-[1px]",
                        className
                    )}
                    onMouseDown={onClose}
                    role="presentation"
                >
                    <motion.div
                        initial={{opacity: 0, y: -10, scale: 0.98}}
                        animate={{opacity: 1, y: 0, scale: 1}}
                        exit={{opacity: 0, y: -6, scale: 0.98}}
                        transition={{duration: 0.12}}
                        ref={rootRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Switch tab"
                        className="w-[min(460px,92vw)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
                        onKeyDown={onKeyDown}
                        onKeyUp={onKeyUp}
                        onBlur={onBlur}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* Tiny fuzzy filter box — collapsed until the user types
                (a keystroke focuses + feeds it; see onKeyDown). */}
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter…"
                            aria-label="Filter open tabs"
                            spellCheck={false}
                            autoComplete="off"
                            className={cn(
                                "w-full bg-transparent font-mono outline-none transition-all",
                                query
                                    ? "h-7 border-b px-2.5 text-xs opacity-100"
                                    : "pointer-events-none h-0 border-0 p-0 opacity-0"
                            )}
                        />
                        <ul
                            role="listbox"
                            aria-label="Open tabs, most recently used first"
                            className="max-h-80 overflow-y-auto py-1"
                        >
                            {filtered.length === 0 && (
                                <li className="px-3 py-3 text-xs text-muted-foreground">
                                    No tabs match “{query}”.
                                </li>
                            )}
                            {filtered.map((row, i) => {
                                const selected = i === cursor;
                                return (
                                    <li
                                        key={row.file.id}
                                        role="option"
                                        aria-selected={selected}
                                        onMouseEnter={() => setCursor(i)}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            onSelect(row.index);
                                            onClose();
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 text-xs font-mono cursor-pointer",
                                            selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                                        )}
                                    >
                    <span className="shrink-0 text-muted-foreground">
                      {row.file.icon ?? <FileCode2 className="size-3.5"/>}
                    </span>
                                        <span className="truncate">{row.file.label}</span>
                                        {row.file.dirty && (
                                            <span
                                                className="size-1.5 shrink-0 rounded-full bg-amber-500"
                                                title="Unsaved changes"
                                            />
                                        )}
                                        {selected && (
                                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        Enter
                      </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground select-none">
                            Tab next · Shift+Tab back · Enter or release Ctrl to open · Esc cancels
                            {query && " · typing filters"}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ── key state machine hook ────────────────────────────────────────────

export interface UseTabSwitcherKeysOptions {
    /** The MRU-ordered open tabs, read at OPEN time (fresh on every open,
     *  never captured stale in the listener). */
    getFiles: () => SwitcherFile[];
    /** The active tab id (initial highlight = the entry after it). */
    getActiveId?: () => string | null;
    /** Commit the switch (e.g. performTabSwitch(file.id, { fromMruCycle: true })). */
    commit: (file: SwitcherFile) => void;
    /** Extra gate — return true to ignore the shortcut (e.g. a modal is open). */
    enabled?: () => boolean;
}

export interface TabSwitcherController {
    open: boolean;
    files: SwitcherFile[];
    activeIndex: number;
    onSelect: (index: number) => void;
    onClose: () => void;
    /** Imperative open (menu integration, if ever needed). */
    openSwitcher: () => void;
}

/**
 * Manages the Ctrl/Tab switcher lifecycle so page.tsx can wire the whole
 * feature in ~10 lines (see the bottom of this file). While the overlay
 * is open the OVERLAY owns all keys (it is focused); this hook only
 * opens on the window keydown and closes on window blur (a lost keyup
 * must not strand a modal overlay).
 */
export function useTabSwitcherKeys({
                                       getFiles,
                                       getActiveId,
                                       commit,
                                       enabled,
                                   }: UseTabSwitcherKeysOptions): TabSwitcherController {
    const [open, setOpen] = React.useState(false);
    const [files, setFiles] = React.useState<SwitcherFile[]>([]);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const openRef = React.useRef(false);
    openRef.current = open;
    const filesRef = React.useRef<SwitcherFile[]>([]);
    filesRef.current = files;

    const openSwitcher = useStableEvent(() => {
        if (enabled && !enabled()) return;
        const list = getFiles();
        if (list.length === 0) return;
        // Snapshot the MRU list: cycling must not reorder the history, and
        // mid-cycle tab mutations (a close elsewhere) can't corrupt the
        // switcher's index math.
        const activeId = getActiveId?.() ?? null;
        const ids = list.map((f) => f.id);
        setFiles(list);
        setActiveIndex(initialSwitcherIndex(ids, activeId));
        setOpen(true);
    });

    const close = useStableEvent(() => setOpen(false));

    const onSelect = useStableEvent((index: number) => {
        const file = filesRef.current[index];
        if (file) commit(file);
        setOpen(false);
    });

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (openRef.current) return; // the overlay owns keys while open
            if (e.key !== "Tab") return;
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.shiftKey) return; // Shift+Tab is an in-overlay move only
            // Same condition the app's legacy MRU cycler used: browsers
            // reserve plain Ctrl+Tab for their own tab strip unless the app
            // is fullscreen / installed (PWA); Ctrl+Alt+Tab (and Cmd+Tab on
            // macOS where it isn't OS-reserved) always reaches the page.
            if (!(e.altKey || !e.ctrlKey || document.fullscreenElement != null)) return;
            const t = e.target as HTMLElement | null;
            const typing =
                !!t &&
                (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
            if (typing) return;
            e.preventDefault();
            openSwitcher();
        };
        // A window blur can swallow the Ctrl keyup (user cmd-Tab'd away) —
        // never strand an open modal overlay.
        const onBlur = () => {
            if (openRef.current) close();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("blur", onBlur);
        };
    }, [openSwitcher, close]);

    return {open, files, activeIndex, onSelect, onClose: close, openSwitcher};
}

/*
 * ── WIRING (page.tsx — the lead owns it) ──────────────────────────────
 *
 * 1) Import:
 *    import { TabSwitcherOverlay, useTabSwitcherKeys } from "@/components/tab-switcher-overlay";
 *
 * 2) Near the other tab-switcher refs (grep: tabMruRef / tabsStateRef /
 *    performTabSwitchRef — all already exist):
 *
 *    const tabSwitcher = useTabSwitcherKeys({
 *      getFiles: () => {
 *        const { openTabs, activeTabId } = tabsStateRef.current;
 *        const mru = tabMruRef.current.length
 *          ? tabMruRef.current
 *          : openTabs.map((t) => t.id);
 *        const byId = new Map(openTabs.map((t) => [t.id, t]));
 *        return mru
 *          .map((id) => byId.get(id))
 *          .filter((t): t is NonNullable<typeof t> => Boolean(t))
 *          .map((t) => ({ id: t.id, label: t.fileName, dirty: t.dirty }));
 *      },
 *      getActiveId: () => tabsStateRef.current.activeTabId,
 *      commit: (file) => performTabSwitchRef.current(file.id, { fromMruCycle: true }),
 *    });
 *
 * 3) Render next to the other top-level overlays (grep:
 *    "<SymbolPalette" — mount beside it):
 *
 *    <TabSwitcherOverlay {...tabSwitcher} />
 *
 * 4) REMOVE the legacy direct-cycle block in the window keydown handler
 *    (grep: "MRU QUICK" — the `if (e.key === "Tab" && (e.ctrlKey ||
 *    e.metaKey)…)` body that calls performTabSwitchRef directly), or it
 *    will double-step: the hook opens the overlay; the overlay's own
 *    Tab handling takes over from there.
 *
 * 5) NOTE (out of scope here — you own page.tsx keydown wiring):
 *    Alt+Left / Alt+Right navigate the EDITOR HISTORY back/forward —
 *    suggested wiring: keep a back-stack of {folderSlug, fileSlug, line}
 *    pushed on guardedSelectFile + jumpToLine, pop on the arrow keys.
 */
