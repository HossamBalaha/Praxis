/**
 * editor-geometry.ts — tab-stop + soft-wrap geometry for overlays.
 *
 * Overlays that paint at a (line, col) — spell chips, bracket-pair
 * marks, occurrence highlights — map a LOGICAL column to a pixel x
 * with `x = col * charWidth`. That formula assumes every glyph is one
 * cell, which breaks twice:
 *
 *   1. TABS: a tab advances the caret to the next multiple of
 *      tabSize, so a tab-indented line's chip drifts right of the
 *  glyph. `visualColumnOf` walks the line and expands
 *      tabs to tab stops.
 *   2. SOFT WRAP: when the editor wraps, a logical line renders as
 *      several visual rows; the chip must land on the correct one
 *  — "segment-aware positioning"). `visualPositionOf`
 *      splits the line into wrap-width segments and offsets the row.
 *
 * Pure module — unit-tested in __tests__/editor-geometry.test.ts.
 *
 * (The split-pane share math that used to live here moved to
 * src/layout/split-pane-engine.ts in the Phase 2 extraction, with its
 * own dedicated test suite.)
 */

/** Visual column of a LOGICAL column on one line, tabs expanded.
 *
 * Chars before `logicalCol` are laid out on the tab grid; the returned
 * column is where the caret/glyph actually renders. A tab jumps to
 * the next multiple of `tabSize` (the textarea's CSS tab-size). */
export function visualColumnOf(lineText: string, logicalCol: number, tabSize: number): number {
    const n = Math.min(lineText.length, Math.max(0, logicalCol));
    const t = Math.max(1, tabSize);
    let col = 0;
    for (let i = 0; i < n; i++) {
        if (lineText[i] === "\t") {
            col += t - (col % t);
        } else {
            col += 1;
        }
    }
    return col;
}

/** Pixel x of a logical column (tab-aware) — charWidth per visual cell. */
export function pixelXOfColumn(
    lineText: string,
    logicalCol: number,
    tabSize: number,
    charWidth: number
): number {
    return visualColumnOf(lineText, logicalCol, tabSize) * charWidth;
}

/** How many visual columns fit before soft-wrap cuts the line. */
export function wrapColumnCount(
    usableWidthPx: number,
    charWidth: number,
    /** Chars already reserved on every row (gutter/padding in columns). */
    reservedCols = 0
): number {
    if (charWidth <= 0 || usableWidthPx <= 0) return Infinity;
    return Math.max(1, Math.floor(usableWidthPx / charWidth) - Math.max(0, reservedCols));
}

/** One visual row of a wrapped logical line. */
export interface WrapSegment {
    /** 0-based visual row (0 = the first physical row of the line). */
    row: number;
    /** Logical col (index into lineText) where this segment starts. */
    start: number;
    /** Logical col where it ends (exclusive). */
    end: number;
}

/** Split a logical line into visual segments at the wrap column.
 *
 * Character-grid approximation of the textarea's soft wrap: each
 * segment holds up to `wrapCols` visual cells (tabs expanded), then
 * the row breaks. The browser wraps at word boundaries when it can —
 * this grid is the plan's stated approximation and keeps chips on
 * the correct ROW, which is what fixes the suspended underlines. */
export function splitWrapSegments(
    lineText: string,
    wrapCols: number,
    tabSize: number
): WrapSegment[] {
    const width = Math.max(1, Math.min(wrapCols, Infinity));
    if (!Number.isFinite(width)) {
        return [{row: 0, start: 0, end: lineText.length}];
    }
    const segs: WrapSegment[] = [];
    const t = Math.max(1, tabSize);
    let row = 0;
    let segStart = 0;
    let col = 0;
    for (let i = 0; i < lineText.length; i++) {
        col += lineText[i] === "\t" ? t - (col % t) : 1;
        if (col >= width) {
            // The char at i is the LAST one that still fits on this row.
            segs.push({row, start: segStart, end: i + 1});
            row++;
            segStart = i + 1;
            col = 0;
        }
    }
    // The tail segment — only when it has content (a wrap that lands
    // exactly on the line's end must NOT mint a phantom extra row).
    if (segs.length === 0 || segStart < lineText.length) {
        segs.push({row, start: segStart, end: lineText.length});
    }
    return segs;
}

/** Visual (row, col) of a logical column on a wrapped line. */
export function visualPositionOf(
    lineText: string,
    logicalCol: number,
    tabSize: number,
    wrapCols: number
): { row: number; col: number } {
    const segs = splitWrapSegments(lineText, wrapCols, tabSize);
    const n = Math.max(0, Math.min(lineText.length, logicalCol));
    for (const s of segs) {
        if (n >= s.start && n <= s.end) {
            return {row: s.row, col: visualColumnOf(lineText.slice(s.start, n), n - s.start, tabSize)};
        }
    }
    const last = segs[segs.length - 1];
    return {row: last.row, col: visualColumnOf(lineText.slice(last.start), n - last.start, tabSize)};
}

/** Total visual rows a logical line occupies when wrapped. */
export function wrappedRowCount(lineText: string, tabSize: number, wrapCols: number): number {
    if (!Number.isFinite(wrapCols)) return 1;
    const segs = splitWrapSegments(lineText, wrapCols, tabSize);
    return segs[segs.length - 1].row + 1;
}
