/**
 * The "Show Less" clip engine — pure geometry for the code viewer's
 * collapsed preview (src/components/code-viewer.tsx).
 *
 * The collapsed preview used to cut at a FIXED 8 lines / 220px no
 * matter how tall the viewer pane was. A ResizeObserver now feeds the
 * ACTUAL viewport height into these helpers, and the row count / clip
 * height derive from the MEASURED metrics so font-size, line-height
 * and the output↔editor resizer are all honored live.
 *
 * Every function here is pure: numbers in, numbers out, zero React
 * and zero DOM (the observer and the maxHeight style stay in the
 * component; see the tests in __tests__/clip-math.test.ts).
 */

/** Historical fallback: rows shown before the viewport is measured. */
export const COLLAPSED_LINE_COUNT = 8;

/** Historical fallback clip height (px) before measurement. */
export const COLLAPSED_FALLBACK_CLIP_PX = 220;

/** Bottom budget subtracted from the viewport BEFORE dividing into
 *  rows — the clip must fit ENTIRELY inside the viewport (top pad +
 *  rows + bottom pad), or the collapsed preview leaves a few px of
 *  vertical scroll behind. That leftover sliver made the overlays
 *  (spell zigzags, squiggles) appear glued to the screen while the
 *  words moved. */
export const CLIP_BOTTOM_BUDGET_PX = 20;

/** The <pre>'s bottom padding (px) included in the clip height. */
export const CLIP_PRE_BOTTOM_PAD_PX = 16;

/** Largest scroll leftover (px) the show-full trim is allowed to hide
 *  inside the <pre>'s bottom padding — anything larger is real
 *  content and must stay scrollable. */
export const VIEW_PAD_TRIM_MAX_PX = 16;

/**
 * How many rows fit the VISIBLE viewer height — never fewer than the
 * historical 8-line preview, and only as many as FIT (no scroll for a
 * pane that shows 30 rows). Zero viewport height (not measured yet)
 * keeps the historical fallback.
 */
export function collapsedRowCount(
    viewportHeight: number,
    measuredLineHeight: number,
    measuredCodeTop: number
): number {
    if (!viewportHeight) return COLLAPSED_LINE_COUNT;
    const rowH = Math.max(1, measuredLineHeight);
    const usable = Math.max(0, viewportHeight - measuredCodeTop - CLIP_BOTTOM_BUDGET_PX);
    return Math.max(COLLAPSED_LINE_COUNT, Math.floor(usable / rowH));
}

/**
 * Collapsed-state clip height in px — the measured top padding plus
 * exactly `rowCount` rows plus the <pre>'s bottom pad, CLAMPED to the
 * viewport height so the collapsed preview never scrolls. Falls back
 * to the historical fixed 220px until the viewport is measured.
 *
 * The viewport cap is FLOORED: the ResizeObserver's contentRect can be
 * fractional while clientHeight rounds, and a clip a fraction of a px
 * taller than the viewport would leave a sub-pixel scroll behind in
 * the collapsed state.
 */
export function collapsedClipHeight(
    viewportHeight: number,
    measuredCodeTop: number,
    rowCount: number,
    measuredLineHeight: number
): number {
    if (!viewportHeight) return COLLAPSED_FALLBACK_CLIP_PX;
    const content = Math.round(
        measuredCodeTop +
        rowCount * Math.max(1, measuredLineHeight) +
        CLIP_PRE_BOTTOM_PAD_PX
    );
    return Math.min(Math.floor(viewportHeight), content);
}

/**
 * True when the file has MORE rows than the collapsed preview can fit
 * — the state where Show-less must CLIP and the container must LOCK.
 * Any overflow at all clips: the old `+ 2` slack left files that
 * overflow by 1–2 lines with a 1–2-line vertical scroll sliver in
 * Show-less mode (the "code scrolls a bit above and a bit below"
 * jank).
 */
export function isFileCollapsible(totalLines: number, rowCount: number): boolean {
    return totalLines > rowCount;
}

/**
 * The show-full tiny-scroll trim: in EXPANDED view mode a file that
 * overflows the viewport by only a few px shows a vertical scrollbar
 * whose whole travel is ~0.1 cm — pure noise. When the leftover fits
 * inside the <pre>'s bottom padding, trim exactly that many px (ceil —
 * the padding is integer) so scrollHeight === clientHeight. Larger
 * overflows are REAL content — untouched (0).
 */
export function viewPadTrimFor(leftoverScrollHeight: number): number {
    if (leftoverScrollHeight > 0 && leftoverScrollHeight <= VIEW_PAD_TRIM_MAX_PX) {
        return Math.ceil(leftoverScrollHeight);
    }
    return 0;
}

/**
 * The first `rowCount` lines of `text`, joined WITHOUT a trailing
 * newline (the find matcher's view of the collapsed preview — rows
 * map 1:1 to what is rendered on screen).
 */
export function firstRowsOf(text: string, rowCount: number): string {
    return text.split("\n").slice(0, rowCount).join("\n");
}

/**
 * The collapsed preview's source text: the first `rowCount` lines
 * plus ONE trailing newline, mirroring how the expanded <pre> always
 * ends its last row with a line break (keeps the clip height math
 * and the rendered rows identical between the two states).
 */
export function collapsedPreviewText(text: string, rowCount: number): string {
    return firstRowsOf(text, rowCount) + "\n";
}
