/**
 * Unit tests for the breakpoint-list helpers
 * (src/lib/breakpoint-list.ts) — extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {
    breakpointListKey,
    EDIT_GUTTER_BREAKPOINT_PX,
    sanitizeBreakpointList,
    VIEW_GUTTER_BREAKPOINT_PX,
} from "@/lib/breakpoint-list";

describe("sanitizeBreakpointList", () => {
    it("keeps unique positive integers, ascending", () => {
        expect(sanitizeBreakpointList([5, 1, 3, 1, 5])).toEqual([1, 3, 5]);
    });

    it("drops zero, negatives, non-integers and non-numbers", () => {
        expect(sanitizeBreakpointList([0, -2, 2.5, NaN, 3, 7])).toEqual([3, 7]);
    });

    it("returns [] for missing or non-array input", () => {
        expect(sanitizeBreakpointList(undefined)).toEqual([]);
        expect(sanitizeBreakpointList(null)).toEqual([]);
        expect(sanitizeBreakpointList("1,2" as unknown as number[])).toEqual([]);
    });
});

describe("breakpointListKey", () => {
    it("is a content key: same lines, same key — regardless of order or dupes", () => {
        expect(breakpointListKey([3, 1, 3])).toBe(breakpointListKey([1, 3]));
        expect(breakpointListKey([1, 3])).toBe("1,3");
    });

    it("distinguishes different line sets", () => {
        expect(breakpointListKey([1])).not.toBe(breakpointListKey([2]));
        expect(breakpointListKey([])).toBe("");
    });
});

describe("gutter strip widths", () => {
    it("keeps the reserved-zone constants the gutters are sized against", () => {
        expect(EDIT_GUTTER_BREAKPOINT_PX).toBe(12);
        expect(VIEW_GUTTER_BREAKPOINT_PX).toBe(10);
    });
});
