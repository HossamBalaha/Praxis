/**
 * editor-geometry.test.ts — unit tests for src/lib/editor-geometry.ts.
 *
 * Covers the overlay-positioning math:
 *   - visualColumnOf / pixelXOfColumn — tab stops advance to the next
 *  multiple of tabSize
 *   - wrapColumnCount — the wrap column from a px width + char width;
 *   - splitWrapSegments — logical lines split into visual segments
 *  at the wrap column
 *   - visualPositionOf — (row, col) for a logical column on a wrapped
 *     line;
 *   - wrappedRowCount — total visual rows.
 *
 * The split-pane share-math tests that used to live here moved with
 * the code to src/layout/__tests__/split-pane-engine.test.ts (Phase 2
 * extraction), where they run alongside the full transition suite.
 */
import {describe, expect, it} from "vitest";
import {
    pixelXOfColumn,
    splitWrapSegments,
    visualColumnOf,
    visualPositionOf,
    wrapColumnCount,
    wrappedRowCount,
} from "@/lib/editor-geometry";

describe("visualColumnOf (tab stops)", () => {
    it("plain spaces map 1:1", () => {
        expect(visualColumnOf("    x", 4, 4)).toBe(4);
    });

    it("a tab at column 0 with tabSize 4 advances to column 4", () => {
        expect(visualColumnOf("\tx", 1, 4)).toBe(4);
        expect(visualColumnOf("\tx", 2, 4)).toBe(5);
    });

    it("a tab mid-line advances to the NEXT multiple of the tab size", () => {
        // "ab\tc": a=1, b=2, tab at col 2 → 4, c → 5.
        expect(visualColumnOf("ab\tc", 3, 4)).toBe(4);
        expect(visualColumnOf("ab\tc", 4, 4)).toBe(5);
    });

    it("tabSize 8: one leading tab is a full 8-wide stop", () => {
        expect(visualColumnOf("\tx", 1, 8)).toBe(8);
    });

    it("clamps the logical col to the line length", () => {
        expect(visualColumnOf("abc", 99, 4)).toBe(3);
        expect(visualColumnOf("", 5, 4)).toBe(0);
    });

    it("pixel math multiplies the visual column by the char width", () => {
        // tab (col 4) + 3 chars → visual col 7 → 7 × 8px.
        expect(pixelXOfColumn("\tabc", 4, 4, 8)).toBe(56);
    });
});

describe("wrapColumnCount", () => {
    it("divides the usable width by the char width", () => {
        expect(wrapColumnCount(800, 8)).toBe(100);
    });

    it("subtracts reserved columns", () => {
        expect(wrapColumnCount(800, 8, 4)).toBe(96);
    });

    it("never returns 0 and treats 0 width / char as unwrapped", () => {
        expect(wrapColumnCount(4, 8)).toBe(1);
        expect(wrapColumnCount(0, 8)).toBe(Infinity);
        expect(wrapColumnCount(800, 0)).toBe(Infinity);
    });
});

describe("splitWrapSegments", () => {
    it("a short line is a single row-0 segment", () => {
        expect(splitWrapSegments("hello", 20, 4)).toEqual([{row: 0, start: 0, end: 5}]);
    });

    it("an empty line is a single empty segment", () => {
        expect(splitWrapSegments("", 20, 4)).toEqual([{row: 0, start: 0, end: 0}]);
    });

    it("a 10-char line at wrapCols 4 splits into 3 segments", () => {
        expect(splitWrapSegments("0123456789", 4, 4)).toEqual([
            {row: 0, start: 0, end: 4},
            {row: 1, start: 4, end: 8},
            {row: 2, start: 8, end: 10},
        ]);
    });

    it("a wrap that lands exactly on the line end makes no phantom row", () => {
        expect(splitWrapSegments("01234567", 4, 4)).toEqual([
            {row: 0, start: 0, end: 4},
            {row: 1, start: 4, end: 8},
        ]);
    });

    it("tabs count as multiple cells when splitting", () => {
        // "\tab" = 4 + 2 cells; wrapCols 4 → the tab alone fills row 0.
        expect(splitWrapSegments("\tab", 4, 4)).toEqual([
            {row: 0, start: 0, end: 1},
            {row: 1, start: 1, end: 3},
        ]);
    });

    it("Infinity wrapCols returns the unwrapped single segment", () => {
        expect(splitWrapSegments("a long line", Infinity, 4)).toEqual([
            {row: 0, start: 0, end: 11},
        ]);
    });
});

describe("visualPositionOf", () => {
    const line = "0123456789"; // 10 chars

    it("before wrap: row 0 and col = logical col", () => {
        expect(visualPositionOf(line, 3, 4, 20)).toEqual({row: 0, col: 3});
    });

    it("after one wrap: col 6 lands on row 1 at col 2", () => {
        expect(visualPositionOf(line, 6, 4, 4)).toEqual({row: 1, col: 2});
    });

    it("tab-aware inside the segment", () => {
        // "\tabc": tab → 4 cells, then a,b,c. col 3 (the 'c') → 4+3=7…
        expect(visualPositionOf("\tabc", 4, 4, 20)).toEqual({row: 0, col: 7});
    });
});

describe("wrappedRowCount", () => {
    it("unwrapped lines are 1 row", () => {
        expect(wrappedRowCount("0123456789", 4, Infinity)).toBe(1);
    });

    it("10 chars at 4 cols = 3 rows", () => {
        expect(wrappedRowCount("0123456789", 4, 4)).toBe(3);
    });

    it("8 chars at 4 cols = exactly 2 rows (no phantom)", () => {
        expect(wrappedRowCount("01234567", 4, 4)).toBe(2);
    });

    it("tabs multiply the row count too", () => {
        // two tabs = 8 cells at tabSize 4 → 2 rows at wrapCols 4.
        expect(wrappedRowCount("\t\t", 4, 4)).toBe(2);
    });
});

/* ─── split-pane size math (Round 3) ─────────────────────────────────
 * The gutter drag between ADJACENT split panes must move width between
 * exactly that pair (all other panes untouched), never collapse a pane
 * below the floor, and keep the whole group summing to ~100. */
