/**
 * a tiny external store for the Footer's LIVE editor
 * indicators (cursor position + selection size).
 *
 * Why: these values change on EVERY keystroke / caret move. When they
 * lived in `page.tsx` state, each update re-rendered the entire IDE page
 * (sidebar tree, output panel, editor, …) — a 6,700-line component —
 * which was a major contributor to the "editing in the editor is very
 * slow like lagging" report. With the store, only the small Footer chip
 * that displays them re-renders; the page tree is untouched while typing.
 *
 * Consumers read via `useSyncExternalStore(footerStore.subscribe,
 * footerStore.getCursor)` — the snapshot objects are kept referentially
 * stable (only replaced when a value actually changes) so React doesn't
 * loop.
 */

export interface FooterCursorPos {
    line: number;
    col: number;
}

export interface FooterSelectionInfo {
    chars: number;
    lines: number;
}

/** word / character counts for the open file — written by
 * page.tsx whenever the loaded code content changes (and by the
 * editor after saves), read by the Footer's counts chip. Kept in the
 * same external store so count updates never re-render the page. */
export interface FooterCounts {
    words: number;
    chars: number;
    readingMinutes: number;
}

let cursorPos: FooterCursorPos | null = null;
let selectionInfo: FooterSelectionInfo | null = null;
let counts: FooterCounts | null = null;
const listeners = new Set<() => void>();

const emit = () => {
    for (const listener of listeners) listener();
};

export const footerStore = {
    /** Update the cursor position (no-op + no emit when unchanged). */
    setCursor(line: number, col: number) {
        if (cursorPos && cursorPos.line === line && cursorPos.col === col) return;
        cursorPos = {line, col};
        emit();
    },
    /** Update the selection info (null when nothing is selected). */
    setSelection(chars: number, lines: number) {
        const next: FooterSelectionInfo | null = chars > 0 ? {chars, lines} : null;
        if (prevIsEqual(selectionInfo, next)) return;
        selectionInfo = next;
        emit();
    },
    /** Clear both indicators (called when the active file changes). */
    clear() {
        if (cursorPos === null && selectionInfo === null) return;
        cursorPos = null;
        selectionInfo = null;
        emit();
    },
    /** update the word/char counts (no-op + no emit when
     * unchanged). null clears them (file closed / non-text file). */
    setCounts(next: FooterCounts | null) {
        if (
            (next === null && counts === null) ||
            (next && counts && next.words === counts.words && next.chars === counts.chars)
        ) {
            return;
        }
        counts = next;
        emit();
    },
    /** useSyncExternalStore subscription. */
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    getCursor: () => cursorPos,
    getSelection: () => selectionInfo,
    getCounts: () => counts,
};

function prevIsEqual(
    a: FooterSelectionInfo | null,
    b: FooterSelectionInfo | null
): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.chars === b.chars && a.lines === b.lines;
}
