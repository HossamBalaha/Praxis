/**
 * csv-formula.test.ts — unit tests for src/lib/csv-formula.ts.
 *
 * Covers the arithmetic grammar (precedence, parens, unary minus),
 * cell references (A1 style incl. multi-letter columns + case
 * insensitivity), ranges inside SUM/AVG/MIN/MAX/COUNT, scalar helper
 * functions (ABS/ROUND/SQRT), nested formula cells, cycle detection,
 * division by zero, out-of-grid refs, unknown functions, and the
 * full-grid display matrix (evaluateGrid).
 */
import {describe, expect, it} from "vitest";
import {colIndexToLetters, evaluateCell, evaluateFormula, evaluateGrid, hasCircularReference,} from "@/lib/csv-formula";

const GRID = {
    headers: ["Item", "Qty", "Price"],
    rows: [
        ["Widget", "4", "2.50"],
        ["Gadget", "2", "10"],
        ["Gizmo", "7", "1.5"],
        ["Empty", "", ""],
    ],
};

describe("arithmetic", () => {
    it("respects operator precedence and parentheses", () => {
        expect(evaluateFormula("1+2*3", GRID)).toEqual({value: 7});
        expect(evaluateFormula("(1+2)*3", GRID)).toEqual({value: 9});
        expect(evaluateFormula("2*(3+4)/7", GRID)).toEqual({value: 2});
        expect(evaluateFormula("10-2-3", GRID)).toEqual({value: 5});
    });

    it("supports unary minus and plus", () => {
        expect(evaluateFormula("-5+3", GRID)).toEqual({value: -2});
        expect(evaluateFormula("+-5", GRID)).toEqual({value: -5});
        expect(evaluateFormula("2*-3", GRID)).toEqual({value: -6});
    });

    it("parses decimals and exponent notation", () => {
        expect(evaluateFormula("0.1+0.2", GRID)).toEqual({value: 0.30000000000000004});
        expect(evaluateFormula("1e2+1", GRID)).toEqual({value: 101});
        expect(evaluateFormula(".5*4", GRID)).toEqual({value: 2});
    });

    it("tolerates whitespace between tokens", () => {
        expect(evaluateFormula(" 1 +   2 ", GRID)).toEqual({value: 3});
    });

    it("rejects malformed input as #VALUE!", () => {
        expect(evaluateFormula("1+", GRID)).toEqual({error: "#VALUE!"});
        expect(evaluateFormula("(1+2", GRID)).toEqual({error: "#VALUE!"});
        expect(evaluateFormula("1 $ 2", GRID)).toEqual({error: "#VALUE!"});
        expect(evaluateFormula("SUM(1,2", GRID)).toEqual({error: "#VALUE!"});
        expect(evaluateFormula("1 2", GRID)).toEqual({error: "#VALUE!"}); // trailing junk
    });

    it("reports division by zero as #DIV/0!", () => {
        expect(evaluateFormula("1/0", GRID)).toEqual({error: "#DIV/0!"});
        expect(evaluateFormula("5/(3-3)", GRID)).toEqual({error: "#DIV/0!"});
    });
});

describe("cell references", () => {
    it("reads A1-style refs (column letters + 1-based data row)", () => {
        // B1 = Qty of the first data row = 4; C1 = 2.50.
        expect(evaluateFormula("B1*C1", GRID)).toEqual({value: 10});
        expect(evaluateFormula("b2*c2", GRID)).toEqual({value: 20}); // case-insensitive
    });

    it("supports multi-letter columns (AA = column 27)", () => {
        const wide = {headers: [], rows: [Array.from({length: 30}, (_, i) => String(i + 1))]};
        expect(evaluateFormula("AA1", wide)).toEqual({value: 27});
        expect(evaluateFormula("AB1", wide)).toEqual({value: 28});
        expect(colIndexToLetters(26)).toBe("AA");
        expect(colIndexToLetters(0)).toBe("A");
    });

    it("treats empty cells as 0 and blanks as 0 in scalar refs", () => {
        // B4 / C4 are the empty row.
        expect(evaluateFormula("B4+C4", GRID)).toEqual({value: 0});
    });

    it("text cells are #VALUE! in scalar arithmetic", () => {
        expect(evaluateFormula("A1+1", GRID)).toEqual({error: "#VALUE!"});
    });

    it("out-of-grid references are #REF!", () => {
        expect(evaluateFormula("B99", GRID)).toEqual({error: "#REF!"});
        expect(evaluateFormula("D1", GRID)).toEqual({error: "#REF!"}); // beyond last column
    });

    it("accepts numbers written with thousands separators", () => {
        const g = {headers: ["a"], rows: [["1,250"], ["3,750"]]};
        expect(evaluateFormula("A1+A2", g)).toEqual({value: 5000});
    });
});

describe("functions and ranges", () => {
    it("SUM over a range and over scalars", () => {
        expect(evaluateFormula("SUM(B1:B3)", GRID)).toEqual({value: 13});
        expect(evaluateFormula("SUM(1,2,3)", GRID)).toEqual({value: 6});
        expect(evaluateFormula("SUM(B1:B3, 10)", GRID)).toEqual({value: 23});
    });

    it("AVG / AVERAGE ignore text and blank cells", () => {
        // Column B rows 1-4: 4, 2, 7, "" → AVG = 13/3.
        expect(evaluateFormula("AVG(B1:B4)", GRID)).toEqual({value: 13 / 3});
        expect(evaluateFormula("AVERAGE(B1:B4)", GRID)).toEqual({value: 13 / 3});
    });

    it("MIN / MAX over ranges", () => {
        expect(evaluateFormula("MIN(C1:C3)", GRID)).toEqual({value: 1.5});
        expect(evaluateFormula("MAX(C1:C3)", GRID)).toEqual({value: 10});
        expect(evaluateFormula("MIN(B1:B4)", GRID)).toEqual({value: 2});
    });

    it("COUNT counts numeric cells only", () => {
        expect(evaluateFormula("COUNT(B1:B4)", GRID)).toEqual({value: 3});
        expect(evaluateFormula("COUNT(A1:B4)", GRID)).toEqual({value: 3}); // labels skipped
    });

    it("reverse-written ranges are normalized (B3:B1 === B1:B3)", () => {
        expect(evaluateFormula("SUM(B3:B1)", GRID)).toEqual({value: 13});
    });

    it("two-dimensional ranges expand across columns", () => {
        // B1:C3 = {4,2.5,2,10,7,1.5} → SUM 27, COUNT 6.
        expect(evaluateFormula("SUM(B1:C3)", GRID)).toEqual({value: 27});
        expect(evaluateFormula("COUNT(B1:C3)", GRID)).toEqual({value: 6});
    });

    it("scalar helpers ABS / ROUND / SQRT", () => {
        expect(evaluateFormula("ABS(0-B1)", GRID)).toEqual({value: 4});
        expect(evaluateFormula("ROUND(2.567, 2)", GRID)).toEqual({value: 2.57});
        expect(evaluateFormula("ROUND(2.567)", GRID)).toEqual({value: 3});
        expect(evaluateFormula("SQRT(16)", GRID)).toEqual({value: 4});
        expect(evaluateFormula("SQRT(0-1)", GRID)).toEqual({error: "#NUM!"});
    });

    it("unknown function names are #NAME?", () => {
        expect(evaluateFormula("IF(1,2,3)", GRID)).toEqual({error: "#NAME?"});
        expect(evaluateFormula("EVIL()", GRID)).toEqual({error: "#NAME?"});
    });

    it("bare ranges outside functions are #VALUE!", () => {
        expect(evaluateFormula("B1:B3", GRID)).toEqual({error: "#VALUE!"});
    });

    it("aggregates of nothing are #NUM!", () => {
        expect(evaluateFormula("AVG(A4:B4)", GRID)).toEqual({error: "#NUM!"});
    });
});

describe("nested formula cells + cycles", () => {
    it("a referenced formula cell is evaluated recursively", () => {
        const g = {
            headers: ["a", "b"],
            rows: [
                ["1", "2"],
                ["=A1+B1", "=A2*2"], // A2 = 1+2 = 3, B2 = A2*2 = 6
            ],
        };
        expect(evaluateFormula("B2", g)).toEqual({value: 6});
        expect(evaluateFormula("A2+B2", g)).toEqual({value: 9});
    });

    it("self-reference and mutual reference are #CIRC!", () => {
        const self = {headers: ["a"], rows: [["=A1+1"]]};
        expect(evaluateCell("=A1+1", self)).toEqual({error: "#CIRC!"});
        const mutual = {
            headers: ["a", "b"],
            rows: [["=B1+1", "=A1+1"]],
        };
        expect(evaluateCell("=B1+1", mutual)).toEqual({error: "#CIRC!"});
        expect(hasCircularReference(mutual)).toBe(true);
        expect(hasCircularReference(GRID)).toBe(false);
    });

    it("a formula error inside a referenced cell propagates", () => {
        const g = {headers: ["a"], rows: [["=1/0"]]};
        expect(evaluateFormula("A1+1", g)).toEqual({error: "#DIV/0!"});
    });
});

describe("evaluateCell + evaluateGrid", () => {
    it("evaluateCell returns null for non-formulas", () => {
        expect(evaluateCell("4", GRID)).toBeNull();
        expect(evaluateCell("", GRID)).toBeNull();
        expect(evaluateCell("plain text", GRID)).toBeNull();
        expect(evaluateCell("=", GRID)).toBeNull(); // lone '=' is plain text
    });

    it("evaluateGrid renders values, errors, and plain text", () => {
        const g = {
            headers: ["a", "b"],
            rows: [
                ["1", "2"],
                ["=A1+B1", "=1/0"],
                ["total", "=SUM(A1:B1)"],
            ],
        };
        expect(evaluateGrid(g)).toEqual([
            ["1", "2"],
            ["3", "#DIV/0!"],
            ["total", "3"],
        ]);
    });

    it("evaluateGrid trims float noise (0.1+0.2 → 0.3)", () => {
        const g = {headers: ["v"], rows: [["=0.1+0.2"]]};
        expect(evaluateGrid(g)).toEqual([["0.3"]]);
    });

    it("formulas are never executed as anything but math (safety)", () => {
        // The grammar has no way to express code — these all fail to parse.
        expect(evaluateCell("=alert(1)", GRID)).toEqual({error: "#NAME?"});
        expect(evaluateCell("=process", GRID)).toEqual({error: "#NAME?"});
        expect(evaluateCell("=window.x", GRID)).toEqual({error: "#NAME?"});
        expect(evaluateCell("=1;DELETE FROM t", GRID)).toEqual({error: "#VALUE!"});
    });
});
