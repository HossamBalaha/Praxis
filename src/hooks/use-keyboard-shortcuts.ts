"use client";

import * as React from "react";
import {matchesShortcut} from "@/lib/shortcuts";

/**
 * useKeyboardShortcuts
 *
 * Wires up the global keyboard shortcuts:
 * Ctrl/Cmd+K → open the search dialog
 * Ctrl/Cmd+P → open the search dialog (VSCode "quick open" convention)
 * Ctrl/Cmd+H → open the run history drawer
 * Ctrl/Cmd+/ → open the snippet palette
 * Ctrl/Cmd+Enter → run the currently selected script
 * Ctrl/Cmd+, → open the Settings dialog
 * Ctrl/Cmd+B → toggle the file-tree sidebar (desktop) / drawer (mobile)
 * Ctrl/Cmd+J → toggle the bottom Output/Diagnostics/Notes panel
 * Ctrl/Cmd+Shift+R → refresh the folder tree from disk
 * (avoid clobbering the browser's Cmd+R reload)
 * Ctrl/Cmd+Shift+P → open the command palette (handled separately in page.tsx)
 * Ctrl/Cmd+Shift+T → reopen last closed tab (handled separately in page.tsx)
 * Ctrl/Cmd+. → stop the running script (if any)
 * Ctrl/Cmd+S → save the current file (via the CodeViewer imperative ref)
 * Ctrl/Cmd+Shift+F → format the current file (black/ruff, via the ref)
 * Ctrl/Cmd+Alt+S → save all open tabs
 * Ctrl/Cmd+Alt+F → open find-and-replace (via the ref)
 *
 * NOTE: ⌘⇧T is intentionally NOT bound here to avoid a double-fire
 * conflict with the editor's "reopen closed tab" handler in page.tsx.
 * The theme toggle has no global shortcut — use the Tools menu or the
 * right-edge theme button.
 *
 * Modifier handling respects both Mac (Cmd) and Windows/Linux (Ctrl).
 * Shortcuts are disabled while the user is typing in a text field,
 * including Ctrl/Cmd+Enter (the global run binding used to
 * fire from inside any focused textarea — while the AI chat, commit
 * dialog and search dialog were typing there, one ⌘↵ both submitted
 * the dialog AND started a run). The stdin box keeps ⌘↵-to-run via
 * its own local handler in page.tsx. Save/format still target the
 * editor textarea and fire while it's focused.
 */
interface ShortcutHandlers {
    onOpenSearch: () => void;
    onOpenHistory: () => void;
    onOpenSnippets?: () => void;
    onRun: () => void;
    onOpenSettings: () => void;
    onToggleSidebar?: () => void;
    onToggleBottomPanel?: () => void;
    onToggleAiChat?: () => void;
    onRefresh?: () => void;
    onStop?: () => void;
    canStop?: boolean;
    onSave?: () => void;
    onSaveAll?: () => void;
    onFormat?: () => void;
    onReplace?: () => void;
    // code font zoom (⌘= / ⌘- / ⌘0)…
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomReset?: () => void;
    // …and editor-tab switching (⌘PageUp/Down + Alt+1…9).
    onNextTab?: () => void;
    onPrevTab?: () => void;
    onTabByIndex?: (n: number) => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
    // Keep a ref to the latest handlers so we don't re-bind the listener
    // every render.
    const ref = React.useRef(handlers);
    React.useEffect(() => {
        ref.current = handlers;
    }, [handlers]);

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            // ── Alt+1…9 → jump straight to editor tab N (9 =
            //    the LAST tab, browser convention). Checked BEFORE the ⌘
            //    gate below (Alt-modified keys carry no Ctrl/Meta). Resolved
            //    via e.code so macOS's special-character Alt combos can't
            //    spoof the digit, and it works on every keyboard layout.
            if (
                e.altKey &&
                !e.metaKey &&
                !e.ctrlKey &&
                !e.shiftKey &&
                !e.repeat &&
                /^Digit[1-9]$/.test(e.code) &&
                ref.current.onTabByIndex
            ) {
                e.preventDefault();
                ref.current.onTabByIndex(Number(e.code.slice(5)));
                return;
            }

            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            if (e.repeat) return;

            const target = e.target as HTMLElement | null;
            const isTyping =
                !!target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable);

            // ── Use the customizable shortcut bindings via matchesShortcut.
            // This reads the effective binding (custom if the user
            //    rebound it in Settings → Shortcuts, else the default) and
            //    checks whether the event matches. Falls back gracefully if
            //    a shortcut ID isn't in the config.

            // view.searchScripts — open search palette (⌘K).
            if (matchesShortcut(e, "view.searchScripts")) {
                if (isTyping) return;
                e.preventDefault();
                ref.current.onOpenSearch();
                return;
            }

            // view.history — open run history drawer (⌘⇧H). Previously bound
            // to ⌘H which hijacks macOS's system-wide "Hide Application"
            // shortcut. Routed through matchesShortcut so users can rebind
            // it via Settings → Shortcuts (the old hardcoded check bypassed
            // the customizable bindings system).
            if (matchesShortcut(e, "view.toggleHistory")) {
                if (isTyping) return;
                e.preventDefault();
                ref.current.onOpenHistory();
                return;
            }

            // nav.snippets — open snippet palette (⌘⇧S by default).
            // this used to be a HARDCODED ⌘/ check that collided
            // with editor.toggleComment's ⌘/ (the double-bind) and bypassed
            // the customizable bindings system — it now routes through
            // matchesShortcut like every other binding.
            if (matchesShortcut(e, "nav.snippets")) {
                if (isTyping) return;
                if (ref.current.onOpenSnippets) {
                    e.preventDefault();
                    ref.current.onOpenSnippets();
                    return;
                }
            }

            // file.settings — open Settings dialog (⌘,).
            if (matchesShortcut(e, "file.settings")) {
                if (isTyping) return;
                e.preventDefault();
                ref.current.onOpenSettings();
                return;
            }

            // view.toggleSidebar — toggle the file-tree sidebar (⌘B).
            if (matchesShortcut(e, "view.toggleSidebar")) {
                if (isTyping) return;
                if (ref.current.onToggleSidebar) {
                    e.preventDefault();
                    ref.current.onToggleSidebar();
                    return;
                }
            }

            // view.toggleBottomPanel — toggle the bottom panel (⌘J).
            if (matchesShortcut(e, "view.toggleBottomPanel")) {
                if (isTyping) return;
                if (ref.current.onToggleBottomPanel) {
                    e.preventDefault();
                    ref.current.onToggleBottomPanel();
                    return;
                }
            }

            // view.toggleAiChat — toggle the AI chat sidebar (⌘⇧L).
            if (matchesShortcut(e, "view.toggleAiChat")) {
                if (isTyping) return;
                if (ref.current.onToggleAiChat) {
                    e.preventDefault();
                    ref.current.onToggleAiChat();
                    return;
                }
            }

            // view.refreshTree — refresh the folder tree (⌘⇧R).
            if (matchesShortcut(e, "view.refreshTree")) {
                if (isTyping) return;
                if (ref.current.onRefresh) {
                    e.preventDefault();
                    ref.current.onRefresh();
                    return;
                }
            }

            // view.zoomIn / view.zoomOut / view.zoomReset — font zoom + tab switching.
            // ⌘= / ⌘- / ⌘0 adjust the CODE font size (the same setting the
            // View menu and Settings → Editor drive, 10–20 px). Deliberately
            // NOT gated behind isTyping: zooming while the caret sits in the
            // editor textarea is the normal VS Code flow, and the combos have
            // no in-textarea meaning to clobber.
            if (matchesShortcut(e, "view.zoomIn")) {
                e.preventDefault();
                ref.current.onZoomIn?.();
                return;
            }
            if (matchesShortcut(e, "view.zoomOut")) {
                e.preventDefault();
                ref.current.onZoomOut?.();
                return;
            }
            if (matchesShortcut(e, "view.zoomReset")) {
                e.preventDefault();
                ref.current.onZoomReset?.();
                return;
            }

            // nav.nextTab / nav.prevTab — ⌘PageDown / ⌘PageUp
            // cycle the editor tabs. Also not isTyping-gated (VS Code switches
            // tabs from inside the editor too; the browser reserves these
            // combos for tab switching, which we intentionally override).
            if (matchesShortcut(e, "nav.nextTab")) {
                if (ref.current.onNextTab) {
                    e.preventDefault();
                    ref.current.onNextTab();
                    return;
                }
            }
            if (matchesShortcut(e, "nav.prevTab")) {
                if (ref.current.onPrevTab) {
                    e.preventDefault();
                    ref.current.onPrevTab();
                    return;
                }
            }

            // run.stop — stop the running script (⌘.). Not in config —
            // hardcoded fallback.
            if (mod && !e.shiftKey && !e.altKey && e.key === ".") {
                if (isTyping) return;
                if (ref.current.onStop && ref.current.canStop) {
                    e.preventDefault();
                    ref.current.onStop();
                    return;
                }
            }

            // file.save — save the current file (⌘S).
            if (matchesShortcut(e, "file.save")) {
                if (target && target.tagName === "TEXTAREA") {
                    if (ref.current.onSave) {
                        e.preventDefault();
                        ref.current.onSave();
                        return;
                    }
                }
                if (!isTyping && ref.current.onSave) {
                    e.preventDefault();
                    ref.current.onSave();
                    return;
                }
            }

            // file.saveAll — save all open tabs (⌘⌥S).
            if (matchesShortcut(e, "file.saveAll")) {
                if (isTyping) return;
                if (ref.current.onSaveAll) {
                    e.preventDefault();
                    ref.current.onSaveAll();
                    return;
                }
            }

            // edit.format — format the current file (⌘⇧F).
            if (matchesShortcut(e, "edit.format")) {
                if (target && target.tagName === "TEXTAREA") {
                    if (ref.current.onFormat) {
                        e.preventDefault();
                        ref.current.onFormat();
                        return;
                    }
                }
                if (!isTyping && ref.current.onFormat) {
                    e.preventDefault();
                    ref.current.onFormat();
                    return;
                }
            }

            // edit.replace — find and replace (⌘⌥F).
            if (matchesShortcut(e, "edit.replace")) {
                if (isTyping) return;
                if (ref.current.onReplace) {
                    e.preventDefault();
                    ref.current.onReplace();
                    return;
                }
            }

            // run.run — run the current script (⌘↵). Not in config —
            // hardcoded fallback.
            // gated behind isTyping like every other global
            // shortcut — pressing ⌘↵ while typing in the chat input, commit
            // message or search box must submit THAT component, not also
            // start a script run.
            if (mod && !e.shiftKey && !e.altKey && e.key === "Enter") {
                if (isTyping) return;
                e.preventDefault();
                ref.current.onRun();
                return;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
}
