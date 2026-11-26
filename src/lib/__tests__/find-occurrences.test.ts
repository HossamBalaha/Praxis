/**
 * Unit tests for the find/replace match math
 * (src/lib/find-occurrences.ts) — extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {displayedRowsText, findMatchesIn, viewFindOccurrences,} from "@/lib/find-occurrences";

describe("findMatchesIn", () => {
    it("matches nothing for an empty query", () => {
        expect(findMatchesIn("abc", "", false)).toEqual([]);
    });

    it("finds every case-insensitive literal occurrence", () => {
        expect(findMatchesIn("Foo foo bar", "foo", false)).toEqual([
            {start: 0, end: 3},
            {start: 4, end: 7},
        ]);
    });

    it("advances past whole matches (no overlapping hits)", () => {
        expect(findMatchesIn("aaaa", "aa", false)).toEqual([
            {start: 0, end: 2},
            {start: 2, end: 4},
        ]);
    });

    it("regex mode compiles globally + case-insensitively", () => {
        expect(findMatchesIn("a1b22c333", "\\d+", true)).toEqual([
            {start: 1, end: 2},
            {start: 3, end: 5},
            {start: 6, end: 9},
        ]);
    });

    it("regex zero-width matches advance one char instead of looping", () => {
        const m = findMatchesIn("abc", "x?", true);
        // Zero-width matches at 0,1,2,3 — the guard keeps it finite.
        expect(m.length).toBe(4);
        expect(m.every((x) => x.start === x.end)).toBe(true);
    });

    it("invalid regex patterns match nothing", () => {
        expect(findMatchesIn("abc", "([", true)).toEqual([]);
    });
});

describe("displayedRowsText", () => {
    it("shows the whole visible code while expanded (or when the file cannot collapse)", () => {
        const code = "a\nb\nc\nd";
        expect(displayedRowsText(code, true, true, 2)).toBe(code);
        expect(displayedRowsText(code, false, false, 2)).toBe(code);
    });

    it("cuts at the collapse rows while the Show-less preview is showing", () => {
        expect(displayedRowsText("a\nb\nc\nd", false, true, 2)).toBe("a\nb");
    });
});

describe("viewFindOccurrences", () => {
    it("matches per display row, several hits per line counting separately", () => {
        const rows = "alpha beta alpha\nother\nalpha";
        expect(viewFindOccurrences(rows, "alpha")).toEqual([
            {row: 1, start: 0, end: 5},
            {row: 1, start: 11, end: 16},
            {row: 3, start: 0, end: 5},
        ]);
    });

    it("is case-insensitive and trims the query", () => {
        expect(viewFindOccurrences("ABC", " abc ")).toEqual([{row: 1, start: 0, end: 3}]);
    });

    it("matches nothing for an empty/blank query", () => {
        expect(viewFindOccurrences("abc", "")).toEqual([]);
        expect(viewFindOccurrences("abc", "   ")).toEqual([]);
    });

    it("never matches across rows (row-scoped scanning)", () => {
        expect(viewFindOccurrences("ab\ncd", "abc")).toEqual([]);
    });
});
