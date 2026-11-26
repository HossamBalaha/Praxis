/**
 * variable-grid-filter.test.ts — unit tests for the variable-grid
 * dialog's per-column filter row predicate
 * (src/lib/console-variable-grid.ts → matchesCellFilter / isMissingValue).
 *
 * Grammar under test:
 *   ""                → matches everything;
 *   "missing"/"null"/"nan" → missing cells only;
 *   ">N" ">=" "<" "<=" "=" → numeric comparison (non-numeric cells never
 *                            satisfy one);
 *   "A..B"            → inclusive numeric range;
 *   anything else     → case-insensitive substring on the display text.
 */
import {describe, expect, it} from "vitest";
import {isMissingValue, matchesCellFilter,} from "@/lib/console-variable-grid";

describe("isMissingValue", () => {
    it("null / undefined / empty-string cells are missing", () => {
        expect(isMissingValue(null)).toBe(true);
        expect(isMissingValue(undefined)).toBe(true);
        expect(isMissingValue("")).toBe(true);
    });
    it("0, false, NaN as a value, and text are NOT missing", () => {
        expect(isMissingValue(0)).toBe(false);
        expect(isMissingValue(false)).toBe(false);
        expect(isMissingValue("x")).toBe(false);
    });
});

describe("empty query matches everything", () => {
    it("'' and whitespace-only queries are no-ops", () => {
        expect(matchesCellFilter(5, "")).toBe(true);
        expect(matchesCellFilter(null, "   ")).toBe(true);
        expect(matchesCellFilter("anything", " \t ")).toBe(true);
    });
});

describe("substring matching (case-insensitive, display text)", () => {
    it("matches case-insensitively", () => {
        expect(matchesCellFilter("Hello", "ell")).toBe(true);
        expect(matchesCellFilter("Hello", "ELL")).toBe(true);
        expect(matchesCellFilter("Hello", "hallo")).toBe(false);
    });
    it("booleans match their display text True/False", () => {
        expect(matchesCellFilter(true, "true")).toBe(true);
        expect(matchesCellFilter(false, "False")).toBe(true);
        expect(matchesCellFilter(true, "false")).toBe(false);
    });
    it("missing cells never match a non-empty substring", () => {
        expect(matchesCellFilter(null, "a")).toBe(false);
        expect(matchesCellFilter(undefined, "a")).toBe(false);
    });
    it("numbers fall back to substring on their string form", () => {
        expect(matchesCellFilter(1024, "02")).toBe(true);
        expect(matchesCellFilter(1024, "99")).toBe(false);
    });
});

describe("missing-only keywords", () => {
    it("'missing' / 'null' / 'nan' match missing cells (case-insensitive)", () => {
        for (const q of ["missing", "NULL", "NaN", "Missing"]) {
            expect(matchesCellFilter(null, q)).toBe(true);
            expect(matchesCellFilter(undefined, q)).toBe(true);
            expect(matchesCellFilter("", q)).toBe(true);
        }
    });
    it("non-missing cells do not match the keyword", () => {
        expect(matchesCellFilter(5, "missing")).toBe(false);
        expect(matchesCellFilter("nan", "missing")).toBe(false);
    });
});

describe("numeric comparators", () => {
    it("> and >=", () => {
        expect(matchesCellFilter(10, ">9")).toBe(true);
        expect(matchesCellFilter(10, ">10")).toBe(false);
        expect(matchesCellFilter(10, ">=10")).toBe(true);
    });
    it("< and <= (negative bounds included)", () => {
        expect(matchesCellFilter(-3, "<0")).toBe(true);
        expect(matchesCellFilter(-3, "<=-3")).toBe(true);
        expect(matchesCellFilter(-3, "<-3")).toBe(false);
    });
    it("= is numeric equality", () => {
        expect(matchesCellFilter(42, "=42")).toBe(true);
        expect(matchesCellFilter(42, "=43")).toBe(false);
        expect(matchesCellFilter(4.5, "= 4.5")).toBe(true);
    });
    it("whitespace around the operator is tolerated", () => {
        expect(matchesCellFilter(7, " >= 7 ")).toBe(true);
    });
    it("numeric strings parse; text cells never satisfy a comparator", () => {
        expect(matchesCellFilter("12.5", ">12")).toBe(true);
        expect(matchesCellFilter("12.5", ">12.0")).toBe(true);
        expect(matchesCellFilter("abc", ">1")).toBe(false);
        expect(matchesCellFilter(null, ">1")).toBe(false);
        expect(matchesCellFilter(true, ">0")).toBe(false);
    });
    it("NaN / Infinity numbers never satisfy a numeric query", () => {
        expect(matchesCellFilter(Number.NaN, ">1")).toBe(false);
        expect(matchesCellFilter(Number.POSITIVE_INFINITY, ">1")).toBe(false);
    });
});

describe("inclusive numeric ranges", () => {
    it("A..B includes both bounds", () => {
        expect(matchesCellFilter(10, "10..20")).toBe(true);
        expect(matchesCellFilter(20, "10..20")).toBe(true);
        expect(matchesCellFilter(15, "10..20")).toBe(true);
        expect(matchesCellFilter(9, "10..20")).toBe(false);
        expect(matchesCellFilter(21, "10..20")).toBe(false);
    });
    it("negative and decimal bounds", () => {
        expect(matchesCellFilter(-2, "-3..-1")).toBe(true);
        expect(matchesCellFilter(1.75, "1.5..2.5")).toBe(true);
        expect(matchesCellFilter(2.6, "1.5..2.5")).toBe(false);
    });
    it("whitespace around .. is tolerated", () => {
        expect(matchesCellFilter(12, " 10 .. 20 ")).toBe(true);
    });
    it("non-numeric cells never satisfy a range", () => {
        expect(matchesCellFilter("abc", "1..9")).toBe(false);
        expect(matchesCellFilter(null, "1..9")).toBe(false);
    });
    it("a dotted-numeric cell stays a substring match; a range query stays numeric", () => {
        expect(matchesCellFilter("v1.2.3", "1.2")).toBe(true);
        // "1.2..3" parses as the numeric range 1.2–3, so the TEXT cell
        // "v1.2.3" fails it (only numeric cells satisfy ranges).
        expect(matchesCellFilter("v1.2.3", "1.2..3")).toBe(false);
        expect(matchesCellFilter(1.5, "1.2..3")).toBe(true);
    });
});

describe("grid-shaped row filtering (the dialog's per-column loop)", () => {
    const rows: unknown[][] = [
        ["ada", 30, true],
        ["bob", null, false],
        ["carol", 15, null],
    ];
    it("a substring + a comparator filter combine column-wise", () => {
        const keep = rows.filter(
            (r) => matchesCellFilter(r[0], "a") && matchesCellFilter(r[1], ">18")
        );
        expect(keep).toEqual([["ada", 30, true]]);
    });
    it("the missing keyword isolates rows missing a column", () => {
        const keep = rows.filter((r) => matchesCellFilter(r[1], "missing"));
        expect(keep).toEqual([["bob", null, false]]);
    });
});
