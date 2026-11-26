/**
 * tab-filter.ts — pure helpers for the Ctrl+Tab tab-switcher overlay
 * (src/components/tab-switcher-overlay.tsx).
 *
 *   · fuzzyMatch — a tiny subsequence scorer (case-insensitive; bonuses
 *     for consecutive hits and word-boundary starts). Good enough for
 *     file-name-sized lists and cheap enough to run per keystroke over
 *     dozens of tabs, with zero dependencies.
 *   · initialSwitcherIndex — VS Code semantics: opening the switcher
 *     preselects the entry AFTER the active one in the MRU list (the
 *     most-recently-used OTHER tab), wrapping.
 *
 * DOM-free and unit-tested (src/lib/__tests__/tab-filter.test.ts).
 */

/** Word-boundary-ish separators for the label-start bonus. */
const BOUNDARY = /[\s._\-\\/,:]/;

/**
 * Score how well `text` fuzzily matches `query` (subsequence match,
 * case-insensitive). Returns null when the query's characters don't
 * all appear in order; higher is better. An empty query matches
 * everything with score 0 (the unfiltered list case).
 */
export function fuzzyMatch(query: string, text: string): number | null {
    if (!query) return 0;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let qi = 0;
    let score = 0;
    let lastHit = -2;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] !== q[qi]) continue;
        score += 1;
        if (ti === lastHit + 1) score += 2; // consecutive-run bonus
        if (ti === 0 || BOUNDARY.test(t[ti - 1])) score += 3; // boundary bonus
        lastHit = ti;
        qi++;
    }
    return qi === q.length ? score : null;
}

/**
 * The index the switcher should highlight when it OPENS: the entry
 * after the active tab in MRU order (wrapping), so the very first
 * Ctrl+Tab lands on the most-recently-used OTHER tab — the common
 * "flip back" gesture. Falls back to the first entry.
 */
export function initialSwitcherIndex(mruIds: string[], activeId: string | null): number {
    if (mruIds.length <= 1) return 0;
    const idx = activeId == null ? -1 : mruIds.indexOf(activeId);
    if (idx < 0) return 0;
    return (idx + 1) % mruIds.length;
}

/** Wrap an index into [0, len) for list navigation; -1 for empty lists. */
export function wrapIndex(index: number, len: number): number {
    if (len <= 0) return -1;
    return ((index % len) + len) % len;
}

/** Clamp an index into [0, len-1]; -1 for empty lists. */
export function clampIndex(index: number, len: number): number {
    if (len <= 0) return -1;
    return Math.max(0, Math.min(len - 1, index));
}
