/**
 * The code viewer's overlay/windowing engine — the pure math behind
 * the absolutely-positioned overlay marks (squiggles, spell chips,
 * fold chevrons, find rects, heatmap strips, the rainbow-bracket
 * window) in src/components/code-viewer.tsx.
 *
 * The div-based view-mode overlays used to render for EVERY line of
 * the file — on a 5,000-line file that is thousands of
 * absolutely-positioned nodes participating in every layout. The
 * viewer now tracks the VISIBLE line window (scrollTop → line range,
 * ±margin lines) and only nodes inside it are mounted; hysteresis
 * (commit only when the window moved enough) plus rAF throttling keep
 * that to a couple of re-renders per scroll GESTURE.
 *
 * Everything here is pure: no React, no DOM, no globals — the scroll
 * listener, the ResizeObserver and the state live in the component;
 * these functions own the arithmetic (see
 * __tests__/code-overlay-engine.test.ts).
 */
import type {PythonSymbol} from "@/lib/python-symbols";
import {wrappedRowCount} from "@/lib/editor-geometry";

/** Lines of look-above/look-below margin around the visible range. */
export const OVERLAY_WINDOW_MARGIN = 40;

/** Commit a new window only when an edge moved at least this many
 *  lines — keeps scroll gestures from re-rendering per frame. */
export const OVERLAY_WINDOW_HYSTERESIS = 20;

/** The visible 1-based line window [first, last] of an overlay. */
export interface OverlayWindow {
    first: number;
    last: number;
}

/**
 * Derive the visible line window from the scroll container's metrics.
 * Returns null while the row height is unknown or non-positive (the
 * caller keeps its previous window — measuring is still in flight).
 */
export function overlayWindowFromScroll(
    scrollTop: number,
    clientHeight: number,
    rowHeight: number,
    codeTop: number,
    margin: number = OVERLAY_WINDOW_MARGIN
): OverlayWindow | null {
    if (rowHeight <= 0) return null;
    const first = Math.max(1, Math.floor((scrollTop - codeTop) / rowHeight) - margin);
    const last = Math.ceil((scrollTop + clientHeight) / rowHeight) + margin;
    return {first, last: Math.max(last, first)};
}

/**
 * Hysteresis gate: true when `next` differs from `prev` by at least
 * `hysteresis` lines on EITHER edge (the moment to commit the new
 * window and re-render). Small drifts keep the old window.
 */
export function overlayWindowChanged(
    next: OverlayWindow,
    prev: OverlayWindow,
    hysteresis: number = OVERLAY_WINDOW_HYSTERESIS
): boolean {
    return (
        Math.abs(next.first - prev.first) >= hysteresis ||
        Math.abs(next.last - prev.last) >= hysteresis
    );
}

/** True when a 1-based line sits inside the window (inclusive). */
export function lineInOverlayWindow(
    line: number,
    first: number,
    last: number
): boolean {
    return line >= first && line <= last;
}

/**
 * The y position of a 1-based display row: (row − 1) measured row
 * heights plus the measured top padding. Pure sibling of the
 * component's `lineTop` callback.
 */
export function lineTopOf(row: number, rowHeight: number, codeTop: number): number {
    return (row - 1) * rowHeight + codeTop;
}

/**
 * Map raw 1-based code lines to 1-based DISPLAY rows (the rows
 * `visibleCode` actually renders): folded bodies are hidden (mapped
 * to 0) and each folded symbol's def line is followed by one
 * placeholder row. An empty map means the identity mapping (nothing
 * folded, or folding off) — exactly the component's original
 * shortcut.
 */
export function buildRawLineToViewRow(
    code: string,
    symbols: PythonSymbol[],
    foldedLines: ReadonlySet<number>,
    codeFolding: boolean
): Map<number, number> {
    const map = new Map<number, number>();
    if (!codeFolding || foldedLines.size === 0) return map;
    let row = 0;
    const allLines = code.split("\n");
    for (let i = 0; i < allLines.length; i++) {
        const lineNum = i + 1;
        let isFolded = false;
        for (const sym of symbols) {
            if (foldedLines.has(sym.line) && lineNum > sym.line && lineNum <= (sym.endLine ?? sym.line)) {
                isFolded = true;
                break;
            }
        }
        if (isFolded) {
            map.set(lineNum, 0);
            continue;
        }
        row += 1;
        map.set(lineNum, row);
        // The placeholder row a folded symbol's def line renders next.
        for (const sym of symbols) {
            if (foldedLines.has(sym.line) && lineNum === sym.line) row += 1;
        }
    }
    return map;
}

/** Inputs of {@link viewRowTopOf} — the viewer's measured geometry. */
export interface ViewRowTopContext {
    /** Raw line → display row map from {@link buildRawLineToViewRow}. */
    rawLineToViewRow: Map<number, number>;
    /** True while the collapsed Show-less preview is showing. */
    collapsedView: boolean;
    /** Rows the collapsed preview renders. */
    collapsedLineCount: number;
    /** First NOT-yet-mounted display row (progressive rendering). */
    mountedRowLimit: number;
    /** Measured row height in px. */
    rowHeight: number;
    /** Measured top padding of the code body in px. */
    codeTop: number;
}

/**
 * The y of a raw line's DISPLAY row, or null when the row is not
 * rendered — hidden under a fold (row 0), past the collapse cut, or
 * past the progressive-render frontier. Callers skip the mark instead
 * of drawing it in the void (the old bug: chips for lines 9+ floated
 * in the white space below the 8 rendered rows).
 */
export function viewRowTopOf(rawLine: number, ctx: ViewRowTopContext): number | null {
    const map = ctx.rawLineToViewRow;
    const row = map.size ? (map.get(rawLine) ?? 0) : rawLine;
    if (row <= 0) return null; // Hidden under a fold.
    if (ctx.collapsedView && row > ctx.collapsedLineCount) return null; // Past the preview cut.
    if (row >= ctx.mountedRowLimit) return null; // Past the progressive-render frontier.
    return lineTopOf(row, ctx.rowHeight, ctx.codeTop);
}

/**
 * Extra visual rows contributed by soft wrapping: prefix[i] = the
 * wrapped-row surplus of lines[0..i). While wrapping is on, every
 * logical line renders as several visual rows and each FOLLOWING line
 * shifts down by the extras — a spell chip on line N then lands at
 * lineTop(N) + prefix[N-1]*rowH + chipRow*rowH. Null when wrapping is
 * off or no marks need the offsets.
 */
export function buildViewRowPrefix(
    lines: string[],
    wordWrap: boolean,
    wrapCols: number,
    tabSize: number,
    hasWrappedMarks: boolean
): number[] | null {
    if (!wordWrap || !Number.isFinite(wrapCols) || !hasWrappedMarks) return null;
    const out: number[] = new Array(lines.length).fill(0);
    let extra = 0;
    for (let i = 0; i < lines.length; i++) {
        out[i] = extra;
        extra += wrappedRowCount(lines[i], tabSize, wrapCols) - 1;
    }
    return out;
}

/** A windowed slice of a per-line overlay: bounds + the
 *  position-preserving newline spacer above the window. */
export interface WindowedOverlayRange {
    /** First mounted 0-based index (inclusive). */
    firstIdx: number;
    /** Last mounted 0-based index (inclusive). */
    lastIdx: number;
    /** Newlines standing in for the hidden rows above, or null. */
    spacer: string | null;
}

/**
 * The windowed render bounds for a per-line node array (the rainbow
 * overlay): clamp the ±margin window to the array, and compute the
 * newline spacer that keeps the mounted slice at its exact vertical
 * position (near-zero DOM cost for the hidden rows). Null when the
 * window is empty.
 */
export function windowedOverlayRange(
    first: number,
    last: number,
    margin: number,
    nodeCount: number
): WindowedOverlayRange | null {
    const firstIdx = Math.max(0, Math.min(first - 1 - margin, nodeCount));
    const lastIdx = Math.min(nodeCount - 1, last + margin);
    if (lastIdx < firstIdx) return null;
    const spacer = firstIdx > 0 ? "\n".repeat(firstIdx - 1) : null;
    return {firstIdx, lastIdx, spacer};
}

/** Digit count of a file's last line number (1 for files ≤ 9 lines). */
export function gutterDigitCount(totalLines: number): number {
    return Math.max(1, String(Math.max(1, totalLines)).length);
}

/**
 * The line-number gutter's minWidth CSS value, sized from the WIDEST
 * number in the file. react-syntax-highlighter sizes each span as
 * max(minWidth, natural); with a fixed 2.5em minWidth, files past line
 * 99 grew the span by ~0.4em and shifted THOSE lines' code right
 * while the overlays kept ONE measured left offset — sizing from the
 * widest number keeps every row's code column identical.
 */
export function gutterMinWidthOf(totalLines: number): string {
    const digits = gutterDigitCount(totalLines);
    return `max(2.5em, ${digits}ch + 1.2em)`;
}
