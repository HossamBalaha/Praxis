/**
 * Breakpoint-list helpers for the code viewer's debugger gutter
 * (src/components/code-viewer.tsx) and the debugger panel — the
 * canonical normalization both sides share.
 *
 * Zero React, zero DOM (see __tests__/breakpoint-list.test.ts).
 */

/** The breakpoint strip's width in the EDIT-mode line-number gutter —
 *  exactly the gutter's 12px paddingLeft (the reserved zone LEFT of
 *  the digits; nothing else renders there). Clicks with x > this
 *  never toggle (the digits themselves stay clickable-clean). */
export const EDIT_GUTTER_BREAKPOINT_PX = 12;

/** The breakpoint strip's width in VIEW mode — the very left edge of
 *  the fold-gutter padding. Chevron BUTTONS sit on top of this zone
 *  on symbol lines and stop propagation, so they never lose clicks to
 *  the breakpoint toggle; the strip is only ACTIVE when a reserved
 *  gutter exists at all (codeFolding or the blame gutter reserves the
 *  space). */
export const VIEW_GUTTER_BREAKPOINT_PX = 10;

/**
 * Normalize a breakpoint list into the canonical form the editor +
 * debugger share: unique positive integers, ascending.
 */
export function sanitizeBreakpointList(list?: readonly number[] | null): number[] {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.filter((n) => Number.isInteger(n) && n > 0))].sort(
        (a, b) => a - b
    );
}

/**
 * Content-comparison key for the breakpoints prop — two lists with
 * the same lines must NOT re-seed the internal state (a parent that
 * re-renders with an identical inline array would otherwise fight the
 * gutter's internal toggles).
 */
export function breakpointListKey(list?: readonly number[] | null): string {
    return sanitizeBreakpointList(list).join(",");
}
