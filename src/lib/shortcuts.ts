/**
 * Keyboard shortcuts configuration — single source of truth shared by:
 * - The Settings dialog's "Shortcuts" tab (re-binding UI)
 * - The Help → Keyboard shortcuts dialog (display)
 * - use-keyboard-shortcuts.ts / code-viewer.tsx (TODO: read custom bindings)
 *
 * Each shortcut has a stable `id` used as the localStorage key for
 * custom bindings. The `keys` field is the default binding in display
 * form (using macOS symbols: ⌘ ⇧ ⌥ ↵). Custom bindings are persisted
 * in localStorage under `${STORAGE_PREFIX}-custom-shortcuts` as a
 * `{ [id]: keys }` map.
 *
 * The live keyboard handlers in use-keyboard-shortcuts.ts call
 * `matchesShortcut(e, id)` which reads the effective binding (custom
 * if present, else default) and checks whether the event matches.
 * the editor-only shortcuts in code-viewer.tsx ALSO
 * route through matchesShortcut — rebinding them in Settings →
 * Shortcuts takes effect immediately.
 */
import {STORAGE_PREFIX} from "@/lib/config";

export interface ShortcutItem {
    /** Stable identifier (e.g. "file.save") — used as the localStorage key. */
    id: string;
    /** Default binding in display form, e.g. "⌘S". */
    keys: string;
    /** Human description of what the shortcut does. */
    action: string;
}

export interface ShortcutGroup {
    group: string;
    items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        group: "File",
        items: [
            {id: "file.save", keys: "⌘S", action: "Save the current file"},
            {id: "file.saveAll", keys: "⌘⌥S", action: "Save all open tabs"},
            {id: "file.settings", keys: "⌘,", action: "Open Settings"},
        ],
    },
    {
        group: "Edit",
        items: [
            {id: "edit.undo", keys: "⌘Z", action: "Undo"},
            {id: "edit.redo", keys: "⌘⇧Z", action: "Redo"},
            {id: "edit.cut", keys: "⌘X", action: "Cut"},
            {id: "edit.copy", keys: "⌘C", action: "Copy"},
            {id: "edit.paste", keys: "⌘V", action: "Paste"},
            {id: "edit.find", keys: "⌘F", action: "Find in current file"},
            {id: "edit.replace", keys: "⌘⌥F", action: "Replace in current file"},
            {id: "edit.format", keys: "⌘⇧F", action: "Format document (black/ruff)"},
            {
                id: "edit.acceptCompletion",
                keys: "Tab",
                action: "Accept AI completion suggestion (when shown) / insert indent"
            },
            {id: "edit.dismiss", keys: "Esc", action: "Dismiss AI suggestion / find bar / dialogs"},
        ],
    },
    {
        group: "View",
        items: [
            {id: "view.toggleSidebar", keys: "⌘B", action: "Toggle the file-tree sidebar"},
            {id: "view.toggleBottomPanel", keys: "⌘J", action: "Toggle the bottom Output/Diagnostics/Notes panel"},
            {id: "view.toggleAiChat", keys: "⌘⇧L", action: "Toggle the AI chat assistant sidebar"},
            {id: "view.searchScripts", keys: "⌘K", action: "Search scripts"},
            {id: "view.refreshTree", keys: "⌘⇧R", action: "Refresh project"},
            {id: "view.zoomIn", keys: "⌘=", action: "Increase code font size"},
            {id: "view.zoomOut", keys: "⌘-", action: "Decrease code font size"},
            // reset joined the pair (⌘0) + Ctrl+wheel zoom is a
            // pointer gesture, not a key combo — documented in the action text.
            {id: "view.zoomReset", keys: "⌘0", action: "Reset code font size to the default (Ctrl+wheel also zooms)"},
            {id: "view.distractionFree", keys: "⇧F11", action: "Toggle distraction-free mode"},
            {id: "view.fullscreen", keys: "F11", action: "Toggle browser fullscreen (View ▸ Fullscreen)"},
            {id: "view.toggleTerminal", keys: "⌘`", action: "Toggle the integrated Terminal panel"},
        ],
    },
    {
        group: "Editor (in-editor only)",
        items: [
            {id: "editor.gotoSymbol", keys: "⌘R", action: "Goto symbol palette (jump to def/class/block)"},
            {
                id: "editor.gotoDeclaration",
                keys: "⌘⇧B",
                action: "Go-to-declaration (search project for def/class <symbol>)"
            },
            // ─── additional go-to-def / references bindings ─────
            // F12 / ⇧F12 are ADDITIONAL defaults — the ⌘⇧B (declaration) and
            // ⌥F7 (usages) bindings above keep working; both routes dispatch
            // the same window events, so rebinding either pair in Settings →
            // Shortcuts moves the action to the new combo immediately.
            {
                id: "editor.gotoDef",
                keys: "F12",
                action: "Go to definition (VS Code binding — same action as ⌘⇧B; also Ctrl/Cmd+click a word)"
            },
            {
                id: "editor.findReferences",
                keys: "⇧F12",
                action: "Find references — opens the peek references popup at the caret (same data as ⌥F7)"
            },
            {id: "editor.findUsages", keys: "⌥F7", action: "Find usages (every occurrence across the project)"},
            {id: "editor.rename", keys: "⇧F6", action: "Rename refactor (word-boundary replace across files)"},
            {id: "editor.quickFix", keys: "⌥↵", action: "Quick fixes / intention actions"},
            {
                id: "editor.selectNextOccurrence",
                keys: "⌘D",
                action: "Stack the next occurrence onto the caret set — true multi-caret editing; Esc collapses"
            },
            {id: "editor.toggleBookmark", keys: "⌘F2", action: "Toggle a bookmark on the current line"},
            {id: "editor.nextBookmark", keys: "F2", action: "Jump to next bookmark"},
            {id: "editor.prevBookmark", keys: "⇧F2", action: "Jump to previous bookmark"},
            {id: "editor.swapLineUp", keys: "⌘⇧↑", action: "Swap the current line up"},
            {id: "editor.swapLineDown", keys: "⌘⇧↓", action: "Swap the current line down"},
            // ─── new editor actions (context menu + rebindable) ──
            {id: "editor.toggleComment", keys: "⌘/", action: "Toggle # comment on the selected lines"},
            {id: "editor.duplicateLine", keys: "⇧⌥↓", action: "Duplicate the current line (or each selected line)"},
            {
                id: "editor.runSelection",
                keys: "⌘⇧↵",
                action: "Run the selected lines in Python (selection or current line)"
            },
        ],
    },
    {
        group: "Run",
        items: [
            {id: "run.runScript", keys: "⌘↵", action: "Run the current script"},
            {id: "run.stop", keys: "⌘.", action: "Stop the running script"},
            {id: "run.runCell", keys: "⇧↵", action: "Run the # %% code cell containing the caret"},
        ],
    },
    {
        group: "AI",
        items: [
            // NOTE: the AI chat toggle is NOT bound here — view.toggleAiChat
            // (⌘⇧L, View group) owns it; a second ai.toggleChat entry on the
            // same combo was a double-bind (one of the two was removed).
            {
                id: "ai.triggerCompletion",
                keys: "⌥\\",
                action: "Force an AI code-completion fetch (when completion is enabled)"
            },
        ],
    },
    {
        group: "Navigation",
        items: [
            {id: "nav.commandPalette", keys: "⌘⇧P", action: "Open the command palette"},
            {id: "view.toggleHistory", keys: "⌘⇧H", action: "Open run history"},
            {id: "nav.snippets", keys: "⌘⇧S", action: "Open snippet palette (⌘/ toggles comments inside the editor)"},
            {id: "nav.reopenClosedTab", keys: "⌘⇧T", action: "Reopen last closed tab"},
            {
                id: "nav.gotoSymbolInProject",
                keys: "⌘T",
                action: "Go to Symbol in project (search every def/class across folders)"
            },
            // editor-tab cycling + direct tab jumps (Alt+N is a
            // fixed binding resolved via e.code — rebinding is not offered).
            {id: "nav.nextTab", keys: "⌘PageDown", action: "Switch to the next editor tab"},
            {id: "nav.prevTab", keys: "⌘PageUp", action: "Switch to the previous editor tab"},
            {id: "nav.tabByIndex", keys: "⌥1…⌥9", action: "Switch to editor tab 1–9 (9 = last tab) — fixed binding"},
        ],
    },
];

const STORAGE_KEY = `${STORAGE_PREFIX}-custom-shortcuts`;

/** Load the custom-shortcut bindings map from localStorage. */
export function loadCustomShortcuts(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, string>;
        }
        return {};
    } catch {
        return {};
    }
}

/** Persist the custom-shortcut bindings map to localStorage. */
export function saveCustomShortcuts(map: Record<string, string>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota exceeded — ignore */
    }
}

/** Look up the default `keys` string for a given shortcut id. */
export function defaultShortcutKeys(id: string): string | undefined {
    for (const g of SHORTCUT_GROUPS) {
        for (const it of g.items) {
            if (it.id === id) return it.keys;
        }
    }
    return undefined;
}

/**
 * Returns the effective binding (custom if present, else default) for
 * the given shortcut id. Reads localStorage on each call — fine for
 * dialog rendering, but prefer `loadCustomShortcuts` + a local
 * lookup if calling in a hot path.
 */
export function getEffectiveShortcut(id: string): string {
    const customs = loadCustomShortcuts();
    if (customs[id]) return customs[id];
    return defaultShortcutKeys(id) ?? "";
}

/**
 * Convert a KeyboardEvent into a display-form combo string (e.g.
 * "⌘⇧P"). Returns `null` if the event was for a bare modifier press
 * (Shift / Control / Alt / Meta alone) — callers should keep listening
 * in that case. Escape returns the literal string "Escape" so the
 * caller can special-case it (cancel recording).
 */
export function keyEventToCombo(e: KeyboardEvent): string | null {
    if (e.key === "Escape") return "Escape";
    // Bare modifier press — wait for the actual key.
    if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;

    const parts: string[] = [];
    // Treat both Cmd (macOS) and Ctrl (Win/Linux) as ⌘ for display,
    // matching the rest of the app's shortcut notation.
    if (e.metaKey || e.ctrlKey) parts.push("⌘");
    if (e.altKey) parts.push("⌥");
    if (e.shiftKey) parts.push("⇧");

    let keyLabel: string;
    switch (e.key) {
        case "Enter":
            keyLabel = "↵";
            break;
        case " ":
            keyLabel = "Space";
            break;
        case "Tab":
            keyLabel = "Tab";
            break;
        case "ArrowUp":
            keyLabel = "↑";
            break;
        case "ArrowDown":
            keyLabel = "↓";
            break;
        case "ArrowLeft":
            keyLabel = "←";
            break;
        case "ArrowRight":
            keyLabel = "→";
            break;
        case "Backspace":
            keyLabel = "⌫";
            break;
        case "Delete":
            keyLabel = "⌦";
            break;
        default:
            if (e.key.length === 1) {
                keyLabel = e.key.toUpperCase();
            } else {
                keyLabel = e.key;
            }
    }
    parts.push(keyLabel);
    return parts.join("");
}

/**
 * Parse a display-form combo string (e.g. "⌘⇧F") into criteria that
 * can be matched against a KeyboardEvent. Returns an object with:
 *   - mod: true if ⌘ is present (matches Ctrl OR Meta)
 *   - alt: true if ⌥ is present
 *   - shift: true if ⇧ is present
 *   - key: the main key label (e.g. "F", "S", "↵", "Tab", "Escape")
 */
function parseCombo(combo: string): { mod: boolean; alt: boolean; shift: boolean; key: string } {
    let mod = false, alt = false, shift = false;
    let rest = combo;
    while (rest.length > 0) {
        if (rest.startsWith("⌘")) {
            mod = true;
            rest = rest.slice(1);
        } else if (rest.startsWith("⌥")) {
            alt = true;
            rest = rest.slice(1);
        } else if (rest.startsWith("⇧")) {
            shift = true;
            rest = rest.slice(1);
        } else break;
    }
    return {mod, alt, shift, key: rest};
}

/**
 * Check whether a KeyboardEvent matches a display-form combo string
 * (e.g. "⌘S", "⌘⇧F", "⌘↵"). The ⌘ symbol matches BOTH Ctrl and Meta
 * (so the same binding works on macOS and Windows/Linux).
 */
export function matchesKeyCombo(e: KeyboardEvent, combo: string): boolean {
    const c = parseCombo(combo);
    // Modifier checks.
    const eMod = e.metaKey || e.ctrlKey;
    if (c.mod !== eMod) return false;
    if (c.alt !== e.altKey) return false;
    if (c.shift !== e.shiftKey) return false;
    // Key check — compare case-insensitively for single-char keys.
    const expectedKey = c.key;
    // Map display symbols back to KeyboardEvent.key values.
    const keyMap: Record<string, string[]> = {
        "↵": ["Enter"],
        "Tab": ["Tab"],
        "Space": [" "],
        "↑": ["ArrowUp"],
        "↓": ["ArrowDown"],
        "←": ["ArrowLeft"],
        "→": ["ArrowRight"],
        "⌫": ["Backspace"],
        "⌦": ["Delete"],
        "Escape": ["Escape"],
    };
    if (keyMap[expectedKey]) {
        return keyMap[expectedKey].includes(e.key);
    }
    // Single-char keys: compare case-insensitively.
    if (expectedKey.length === 1) {
        return e.key.toUpperCase() === expectedKey.toUpperCase();
    }
    // Multi-char keys (e.g. "F11"): compare directly.
    return e.key === expectedKey;
}

/**
 * Check whether a KeyboardEvent matches the EFFECTIVE binding for the
 * given shortcut ID (custom if present, else default). Use this in
 * keyboard handlers instead of hardcoded key checks.
 */
export function matchesShortcut(e: KeyboardEvent, id: string): boolean {
    const combo = getEffectiveShortcut(id);
    if (!combo) return false;
    return matchesKeyCombo(e, combo);
}
