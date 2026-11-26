/**
 * minimap.ts — the PURE math behind the FileViewer's edit-surface
 * minimap (the slim right-rail canvas next to the auto-growing edit
 * textarea). Everything here is layout-free and unit-tested; the
 * component in file-viewer.tsx owns the canvas, the pointer events
 * and the scroll-container reads.
 *
 * Density model (cheap on purpose — no tokenization):
 *   · one canvas pixel row per buffer line when the line count fits
 *     the rail's height; taller-than-rail buffers squeeze
 *     proportionally (line → floor(i·H/lineCount)),
 *   · each line's bar is gray-coded by its LEADING-WHITESPACE bucket
 *     (0 / 1 / 2+ indent levels → three gray tones), so the block
 *     structure of the file reads at a glance,
 *   · bar width follows the line's trimmed length (capped by the
 *     component to the rail's width).
 *
 * Buffers over {@link MINIMAP_MAX_LINES} lines skip the minimap
 * entirely (the rail shows a static note) — walking 8k+ lines per
 * keystroke would cost more than the overview is worth.
 */

/** Buffers longer than this (in LINES) render no minimap at all. */
export const MINIMAP_MAX_LINES = 8000;

/** Is a buffer of `lineCount` lines small enough to minimap? */
export function minimapShouldRender(lineCount: number): boolean {
    return lineCount > 0 && lineCount <= MINIMAP_MAX_LINES;
}

/**
 * The leading-whitespace bucket of a line → 3 gray tones.
 * A tab counts as `tabWidth` columns (default 4). 0–3 columns →
 * bucket 0 (flush), 4–7 → bucket 1 (one level), 8+ → bucket 2
 * (deep). Stops scanning at the first non-whitespace char.
 */
export function indentBucketOf(line: string, tabWidth = 4): 0 | 1 | 2 {
    let cols = 0;
    for (let i = 0; i < line.length; i++) {
        const ch = line.charCodeAt(i);
        if (ch === 32) cols += 1; // space
        else if (ch === 9) cols += tabWidth; // tab
        else break;
    }
    if (cols <= 3) return 0;
    if (cols <= 7) return 1;
    return 2;
}

/**
 * The canvas pixel row for buffer line `lineIndex` (0-based) in a rail
 * `height` px tall. Exact 1px-per-line while the line count fits the
 * height; proportional squeeze beyond that (clamped to the last row so
 * the final line is always drawn).
 */
export function minimapLineY(lineIndex: number, lineCount: number, height: number): number {
    if (height <= 0 || lineCount <= 0) return 0;
    if (lineCount <= height) return lineIndex;
    return Math.min(height - 1, Math.floor((lineIndex * height) / lineCount));
}

/**
 * The translucent viewport-indicator rectangle for a scroll container
 * with the given geometry, mapped into a rail `height` px tall.
 * `top` is in rail pixels; the height is proportional to the visible
 * share of the content (min 8px so the handle never vanishes).
 * A non-scrollable container pins the full-height rect at the top.
 */
export function minimapViewportRect(
    geo: { scrollTop: number; scrollHeight: number; clientHeight: number },
    height: number
): { top: number; height: number } {
    if (height <= 0 || geo.scrollHeight <= 0) return {top: 0, height: 0};
    const scrollable = Math.max(0, geo.scrollHeight - geo.clientHeight);
    const h = Math.max(8, (geo.clientHeight / geo.scrollHeight) * height);
    const clampedH = Math.min(h, height);
    const top =
        scrollable > 0 ? (geo.scrollTop / scrollable) * (height - clampedH) : 0;
    return {top: Math.max(0, Math.min(height - clampedH, top)), height: clampedH};
}

/**
 * Map a click/drag position on the rail (as a 0..1 ratio of the rail
 * height) to the scroll container's target scrollTop — the viewport
 * CENTERS on the clicked ratio, clamped to the scrollable range.
 * Non-scrollable containers stay at 0.
 */
export function minimapScrollTargetForRatio(
    ratio: number,
    geo: { scrollHeight: number; clientHeight: number }
): number {
    const scrollable = Math.max(0, geo.scrollHeight - geo.clientHeight);
    if (scrollable <= 0) return 0;
    const raw = ratio * geo.scrollHeight - geo.clientHeight / 2;
    return Math.max(0, Math.min(scrollable, Math.round(raw)));
}

/** Per-line density inputs: indent bucket + trimmed line length. */
export interface MinimapLineStat {
    bucket: 0 | 1 | 2;
    /** Length of the line WITHOUT leading whitespace (0 = blank). */
    length: number;
}

/**
 * Compute the per-line stats for the whole buffer (one pass, no
 * allocation beyond the result array). `text.split("\n")` semantics —
 * a trailing newline yields a final empty line, matching the line
 * count the gutter and the 8000-line cap use.
 */
export function minimapLineStats(text: string): MinimapLineStat[] {
    const lines = text.split("\n");
    const out: MinimapLineStat[] = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        out[i] = {bucket: indentBucketOf(line), length: leadingTrimmedLength(line)};
    }
    return out;
}

/** Length of the line minus its LEADING whitespace (module-private —
 *  only the leading side shortens the bar; trailing spaces never
 *  pushed pixels anyway, but the intent stays explicit + testable). */
function leadingTrimmedLength(line: string): number {
    let start = 0;
    while (start < line.length) {
        const ch = line.charCodeAt(start);
        if (ch === 32 || ch === 9) start++;
        else break;
    }
    return line.length - start;
}
