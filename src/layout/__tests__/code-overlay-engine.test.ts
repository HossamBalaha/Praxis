/**
 * Unit tests for the code viewer's overlay/windowing engine
 * (src/layout/code-overlay-engine.ts) — the arithmetic extracted from
 * code-viewer.tsx, pinned against the exact scroll/row semantics the
 * component used inline.
 */
import {describe, expect, it} from "vitest";
import {
    buildRawLineToViewRow,
    buildViewRowPrefix,
    gutterDigitCount,
    gutterMinWidthOf,
    lineInOverlayWindow,
    lineTopOf,
    OVERLAY_WINDOW_HYSTERESIS,
    OVERLAY_WINDOW_MARGIN,
    overlayWindowChanged,
    overlayWindowFromScroll,
    viewRowTopOf,
    windowedOverlayRange,
} from "@/layout/code-overlay-engine";
import type {PythonSymbol} from "@/lib/python-symbols";

function sym(partial: Partial<PythonSymbol> & {
    line: number;
    type: PythonSymbol["type"];
    name: string
}): PythonSymbol {
    return {
        endLine: partial.endLine ?? partial.line,
        indent: partial.indent ?? 0,
        args: partial.args,
        docstring: partial.docstring,
        ...partial,
    } as PythonSymbol;
}

describe("overlayWindowFromScroll", () => {
    it("derives the ±margin line window around the visible range", () => {
        // scrollTop 0, 600px viewport, 24px rows, 16px top pad:
        // first = max(1, floor((0−16)/24) − 40) = 1; last = ceil(600/24) + 40 = 65.
        const w = overlayWindowFromScroll(0, 600, 24, 16);
        expect(w).toEqual({first: 1, last: 65});
    });

    it("clamps the first line at 1 even for negative scroll offsets", () => {
        expect(overlayWindowFromScroll(-500, 600, 24, 16)!.first).toBe(1);
    });

    it("advances the window as the user scrolls down", () => {
        // first = floor((2400−16)/24) − 40 = 99 − 40 = 59; last = ceil(3000/24) + 40 = 165.
        const w = overlayWindowFromScroll(2400, 600, 24, 16);
        expect(w).toEqual({first: 59, last: 165});
    });

    it("honors a custom margin", () => {
        const w = overlayWindowFromScroll(0, 600, 24, 16, 10);
        expect(w).toEqual({first: 1, last: 35});
    });

    it("returns null while the row height is unknown or non-positive", () => {
        expect(overlayWindowFromScroll(0, 600, 0, 16)).toBeNull();
        expect(overlayWindowFromScroll(0, 600, -3, 16)).toBeNull();
    });

    it("defaults the margin to OVERLAY_WINDOW_MARGIN (40)", () => {
        expect(OVERLAY_WINDOW_MARGIN).toBe(40);
        const w = overlayWindowFromScroll(0, 24, 24, 0);
        expect(w).toEqual({first: 1, last: Math.ceil(24 / 24) + 40});
    });
});

describe("overlayWindowChanged (hysteresis)", () => {
    it("keeps the old window while both edges drifted less than the hysteresis", () => {
        const prev = {first: 1, last: 65};
        expect(overlayWindowChanged({first: 5, last: 60}, prev)).toBe(false);
        expect(overlayWindowChanged({first: 1, last: 65}, prev)).toBe(false);
    });

    it("commits when either edge moved at least the hysteresis", () => {
        const prev = {first: 1, last: 65};
        expect(overlayWindowChanged({first: 21, last: 65}, prev)).toBe(true);
        expect(overlayWindowChanged({first: 1, last: 85}, prev)).toBe(true);
    });

    it("defaults the hysteresis to OVERLAY_WINDOW_HYSTERESIS (20)", () => {
        expect(OVERLAY_WINDOW_HYSTERESIS).toBe(20);
        const prev = {first: 1, last: 65};
        expect(overlayWindowChanged({first: 21, last: 65}, prev)).toBe(true);
        expect(overlayWindowChanged({first: 20, last: 65}, prev)).toBe(false);
    });
});

describe("lineInOverlayWindow", () => {
    it("is inclusive on both edges", () => {
        expect(lineInOverlayWindow(1, 1, 65)).toBe(true);
        expect(lineInOverlayWindow(65, 1, 65)).toBe(true);
        expect(lineInOverlayWindow(66, 1, 65)).toBe(false);
        expect(lineInOverlayWindow(0, 1, 65)).toBe(false);
    });
});

describe("lineTopOf", () => {
    it("is (row − 1) row heights plus the top pad", () => {
        expect(lineTopOf(1, 24, 16)).toBe(16);
        expect(lineTopOf(3, 24, 16)).toBe(64);
        expect(lineTopOf(1, 20, 0)).toBe(0);
    });
});

describe("buildRawLineToViewRow", () => {
    it("returns an empty map (identity) when folding is off or nothing is folded", () => {
        const symbols = [sym({line: 1, type: "function", name: "f", endLine: 3})];
        expect(buildRawLineToViewRow("a\nb\nc", symbols, new Set(), true)).toEqual(new Map());
        expect(buildRawLineToViewRow("a\nb\nc", symbols, new Set([1]), false)).toEqual(new Map());
    });

    it("maps folded bodies to 0 and bumps a placeholder row after the def line", () => {
        // f spans lines 2–4 (folded): raw 2 → row 2, raw 3–4 → 0, raw 5 → 4
        // (rows 1,2,3,placeholder,then 5 maps past the placeholder).
        const symbols = [sym({line: 2, type: "function", name: "f", endLine: 4})];
        const code = "x = 1\ndef f():\n    a = 1\n    b = 2\ny = 2";
        const map = buildRawLineToViewRow(code, symbols, new Set([2]), true);
        expect(map.get(1)).toBe(1);
        expect(map.get(2)).toBe(2);
        expect(map.get(3)).toBe(0);
        expect(map.get(4)).toBe(0);
        expect(map.get(5)).toBe(4);
    });

    it("keeps rows contiguous when the folded symbol is at the top", () => {
        const symbols = [sym({line: 1, type: "class", name: "C", endLine: 2})];
        const code = "class C:\n    x = 1\nplain";
        const map = buildRawLineToViewRow(code, symbols, new Set([1]), true);
        expect(map.get(1)).toBe(1);
        expect(map.get(2)).toBe(0);
        expect(map.get(3)).toBe(3);
    });
});

describe("viewRowTopOf", () => {
    const ctxBase = {
        rawLineToViewRow: new Map<number, number>(),
        collapsedView: false,
        collapsedLineCount: 8,
        mountedRowLimit: Number.POSITIVE_INFINITY,
        rowHeight: 24,
        codeTop: 16,
    };

    it("identity-maps lines when nothing is folded (empty map)", () => {
        expect(viewRowTopOf(3, ctxBase)).toBe(64);
    });

    it("returns null for rows hidden under a fold (mapped to 0)", () => {
        const ctx = {...ctxBase, rawLineToViewRow: new Map([[3, 0]])};
        expect(viewRowTopOf(3, ctx)).toBeNull();
    });

    it("returns null past the collapsed preview's cut while collapsed", () => {
        const ctx = {...ctxBase, collapsedView: true, collapsedLineCount: 8};
        expect(viewRowTopOf(8, ctx)).toBe(16 + 7 * 24);
        expect(viewRowTopOf(9, ctx)).toBeNull();
    });

    it("still positions rows past the cut while EXPANDED", () => {
        const ctx = {...ctxBase, collapsedView: false, collapsedLineCount: 8};
        expect(viewRowTopOf(9, ctx)).toBe(16 + 8 * 24);
    });

    it("returns null past the progressive-render frontier", () => {
        const ctx = {...ctxBase, mountedRowLimit: 200};
        expect(viewRowTopOf(199, ctx)).toBe(16 + 198 * 24);
        expect(viewRowTopOf(200, ctx)).toBeNull();
    });

    it("maps through the fold map when one exists", () => {
        const ctx = {...ctxBase, rawLineToViewRow: new Map([[9, 4]])};
        expect(viewRowTopOf(9, ctx)).toBe(16 + 3 * 24);
    });
});

describe("buildViewRowPrefix", () => {
    it("returns null when wrapping is off or no marks need offsets", () => {
        expect(buildViewRowPrefix(["aaaa"], false, 80, 4, true)).toBeNull();
        expect(buildViewRowPrefix(["aaaa"], true, 80, 4, false)).toBeNull();
        expect(buildViewRowPrefix(["aaaa"], true, Number.NaN, 4, true)).toBeNull();
    });

    it("accumulates each line's wrapped-row surplus", () => {
        // tabSize 4, wrapCols 8: a 12-char line wraps to 2 rows (+1), a
        // 4-char line stays 1 row (+0).
        const prefix = buildViewRowPrefix(["aaaa".repeat(3), "abcd", "efgh"], true, 8, 4, true)!;
        expect(prefix).not.toBeNull();
        expect(prefix[0]).toBe(0);
        expect(prefix[1]).toBe(1);
        expect(prefix[2]).toBe(1);
    });
});

describe("windowedOverlayRange", () => {
    it("clamps the ±margin window to the node array", () => {
        const r = windowedOverlayRange(1, 65, 40, 500)!;
        expect(r).not.toBeNull();
        expect(r.firstIdx).toBe(0);
        expect(r.lastIdx).toBe(105);
        expect(r.spacer).toBeNull();
    });

    it("builds the newline spacer for the hidden rows above the window", () => {
        const r = windowedOverlayRange(100, 165, 40, 500)!;
        expect(r.firstIdx).toBe(59);
        expect(r.spacer).toBe("\n".repeat(58));
        expect(r.lastIdx).toBe(205);
    });

    it("returns null when the window is empty (no nodes mounted)", () => {
        expect(windowedOverlayRange(1, 65, 40, 0)).toBeNull();
    });
});

describe("gutter sizing", () => {
    it("counts the digits of the widest line number", () => {
        expect(gutterDigitCount(1)).toBe(1);
        expect(gutterDigitCount(9)).toBe(1);
        expect(gutterDigitCount(99)).toBe(2);
        expect(gutterDigitCount(100)).toBe(3);
        expect(gutterDigitCount(1000)).toBe(4);
        expect(gutterDigitCount(0)).toBe(1); // Degenerate input stays 1.
    });

    it("sizes the minWidth from the widest number (the alignment fix)", () => {
        expect(gutterMinWidthOf(99)).toBe("max(2.5em, 2ch + 1.2em)");
        expect(gutterMinWidthOf(100)).toBe("max(2.5em, 3ch + 1.2em)");
        expect(gutterMinWidthOf(1)).toBe("max(2.5em, 1ch + 1.2em)");
    });
});
