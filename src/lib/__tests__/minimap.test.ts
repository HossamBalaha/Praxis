/**
 * minimap.test.ts — unit tests for the pure minimap math
 * (src/lib/minimap.ts) behind the FileViewer's edit-surface rail.
 */
import {describe, expect, it} from "vitest";
import {
    indentBucketOf,
    MINIMAP_MAX_LINES,
    minimapLineStats,
    minimapLineY,
    minimapScrollTargetForRatio,
    minimapShouldRender,
    minimapViewportRect,
} from "../minimap";

describe("minimapShouldRender", () => {
    it("renders for any buffer within the line cap", () => {
        expect(minimapShouldRender(1)).toBe(true);
        expect(minimapShouldRender(500)).toBe(true);
        expect(minimapShouldRender(MINIMAP_MAX_LINES)).toBe(true);
    });
    it("skips buffers past the cap (static note instead)", () => {
        expect(minimapShouldRender(MINIMAP_MAX_LINES + 1)).toBe(false);
        expect(minimapShouldRender(100_000)).toBe(false);
    });
});

describe("indentBucketOf (leading-whitespace → 3 gray tones)", () => {
    it("flush lines are bucket 0", () => {
        expect(indentBucketOf("def f():")).toBe(0);
        expect(indentBucketOf("  x = 1")).toBe(0); // 2 columns
        expect(indentBucketOf("   y")).toBe(0); // 3 columns
        expect(indentBucketOf("")).toBe(0);
    });
    it("one level (4–7 columns) is bucket 1 — spaces OR tabs", () => {
        expect(indentBucketOf("    x = 1")).toBe(1); // 4 spaces
        expect(indentBucketOf("\tx")).toBe(1); // 1 tab = 4 columns
        expect(indentBucketOf("\t a")).toBe(1); // 5 columns
        expect(indentBucketOf("       z")).toBe(1); // 7 columns
    });
    it("deep (8+ columns) is bucket 2", () => {
        expect(indentBucketOf("        deep")).toBe(2); // 8 spaces
        expect(indentBucketOf("\t\tvalue")).toBe(2); // 2 tabs
        expect(indentBucketOf("\t    mixed")).toBe(2); // 4+4 columns
    });
    it("stops scanning at the first code character", () => {
        // whitespace AFTER code never counts.
        expect(indentBucketOf("x = 1    ")).toBe(0);
        expect(indentBucketOf("if a\tb:")).toBe(0);
    });
});

describe("minimapLineY (1px per line, squeezed beyond rail height)", () => {
    it("is exactly the line index while the buffer fits the rail", () => {
        expect(minimapLineY(0, 10, 100)).toBe(0);
        expect(minimapLineY(9, 10, 100)).toBe(9);
        expect(minimapLineY(99, 100, 100)).toBe(99);
    });
    it("squeezes proportionally when there are more lines than pixels", () => {
        expect(minimapLineY(0, 200, 100)).toBe(0);
        expect(minimapLineY(100, 200, 100)).toBe(50);
        expect(minimapLineY(199, 200, 100)).toBe(99); // clamped to the last row
    });
    it("degenerates safely on empty geometry", () => {
        expect(minimapLineY(5, 0, 100)).toBe(0);
        expect(minimapLineY(5, 10, 0)).toBe(0);
    });
});

describe("minimapViewportRect (the translucent indicator)", () => {
    it("fills the rail (pinned at the top) when nothing can scroll", () => {
        const r = minimapViewportRect({scrollTop: 0, scrollHeight: 400, clientHeight: 400}, 200);
        expect(r.top).toBe(0);
        expect(r.height).toBe(200);
    });
    it("maps the visible share of the content to the rail height", () => {
        // 100px viewport over 400px content → a quarter of the rail.
        const r = minimapViewportRect({scrollTop: 0, scrollHeight: 400, clientHeight: 100}, 200);
        expect(r.height).toBeCloseTo(50, 5);
        expect(r.top).toBe(0);
    });
    it("advances proportionally with scrollTop and clamps at the bottom", () => {
        const half = minimapViewportRect({scrollTop: 150, scrollHeight: 400, clientHeight: 100}, 200);
        expect(half.height).toBeCloseTo(50, 5);
        // scrollable = 300; scrollTop/scrollable = 0.5 → top = 0.5 * (200-50)
        expect(half.top).toBeCloseTo(75, 5);
        const end = minimapViewportRect({scrollTop: 300, scrollHeight: 400, clientHeight: 100}, 200);
        expect(end.top).toBeCloseTo(150, 5); // 200 - 50
        const past = minimapViewportRect({scrollTop: 9999, scrollHeight: 400, clientHeight: 100}, 200);
        expect(past.top).toBeCloseTo(150, 5); // clamped
    });
    it("never lets the handle vanish (min 8px)", () => {
        const tiny = minimapViewportRect({scrollTop: 0, scrollHeight: 1_000_000, clientHeight: 10}, 100);
        expect(tiny.height).toBe(8);
    });
});

describe("minimapScrollTargetForRatio (click / drag → scrollTop)", () => {
    it("centers the viewport on the clicked ratio", () => {
        // Halfway down a 400px doc with a 100px viewport → 150.
        expect(minimapScrollTargetForRatio(0.5, {scrollHeight: 400, clientHeight: 100})).toBe(150);
    });
    it("clamps to [0, scrollable]", () => {
        expect(minimapScrollTargetForRatio(0, {scrollHeight: 400, clientHeight: 100})).toBe(0);
        expect(minimapScrollTargetForRatio(-1, {scrollHeight: 400, clientHeight: 100})).toBe(0);
        expect(minimapScrollTargetForRatio(1, {scrollHeight: 400, clientHeight: 100})).toBe(300);
        expect(minimapScrollTargetForRatio(2, {scrollHeight: 400, clientHeight: 100})).toBe(300);
    });
    it("non-scrollable containers stay at 0", () => {
        expect(minimapScrollTargetForRatio(0.7, {scrollHeight: 100, clientHeight: 100})).toBe(0);
    });
});

describe("minimapLineStats (per-line density inputs)", () => {
    it("splits on newlines and buckets + trims each line", () => {
        const stats = minimapLineStats("top\n  two\n    deep\n");
        expect(stats).toEqual([
            {bucket: 0, length: 3},
            {bucket: 0, length: 3}, // 2 leading spaces → bucket 0, len "two"
            {bucket: 1, length: 4}, // 4 leading spaces → bucket 1, len "deep"
            {bucket: 0, length: 0}, // trailing newline's empty line
        ]);
    });
    it("tabs count toward the bucket but not the bar length", () => {
        const stats = minimapLineStats("\tvalue");
        expect(stats[0].bucket).toBe(1);
        expect(stats[0].length).toBe(5);
    });
    it("trailing whitespace still paints bar width (only leading trims)", () => {
        const stats = minimapLineStats("abc   ");
        expect(stats[0].length).toBe(6);
    });
});
