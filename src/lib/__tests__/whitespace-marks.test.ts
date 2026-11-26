/**
 * Unit tests for the whitespace-overlay segmentation
 * (src/lib/whitespace-marks.ts) — extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {whitespaceMarksForLine} from "@/lib/whitespace-marks";

describe("whitespaceMarksForLine", () => {
    it("splits leading whitespace, body and trailing whitespace", () => {
        const m = whitespaceMarksForLine("    x = 1   ");
        expect(m).toEqual({leading: "    ", body: "x = 1", trailing: "   ", hasEol: true});
    });

    it("treats tabs as whitespace in both runs", () => {
        const m = whitespaceMarksForLine("\t\tvalue\t");
        expect(m).toEqual({leading: "\t\t", body: "value", trailing: "\t", hasEol: true});
    });

    it("yields an empty body for blank lines (and no end-of-line mark when the line is empty)", () => {
        expect(whitespaceMarksForLine("")).toEqual({leading: "", body: "", trailing: "", hasEol: false});
        const blanks = whitespaceMarksForLine("   ");
        expect(blanks).toEqual({leading: "   ", body: "", trailing: "", hasEol: true});
    });

    it("leaves clean lines untouched (no trailing run)", () => {
        expect(whitespaceMarksForLine("x = 1")).toEqual({leading: "", body: "x = 1", trailing: "", hasEol: true});
    });

    it("never moves interior whitespace into the runs", () => {
        const m = whitespaceMarksForLine("a b c");
        expect(m.body).toBe("a b c");
        expect(m.leading).toBe("");
        expect(m.trailing).toBe("");
    });
});
