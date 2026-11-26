/**
 * Unit tests for the rainbow-bracket scan
 * (src/lib/rainbow-brackets.ts) — the pure half of the overlay
 * builder extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {RAINBOW_BRACKET_COLORS, RAINBOW_MAX_BRACKETS, scanRainbowMarks,} from "@/lib/rainbow-brackets";

const C = RAINBOW_BRACKET_COLORS;

describe("scanRainbowMarks", () => {
    it("returns null for sources with no brackets", () => {
        expect(scanRainbowMarks("plain text\nno brackets here")).toBeNull();
        expect(scanRainbowMarks("")).toBeNull();
    });

    it("colors an opener by its nesting depth and its closer to match", () => {
        // "f(g(1))": f(0), ((1), g(2), ((3), 1(4), )(5), )(6).
        const marks = scanRainbowMarks("f(g(1))")!;
        expect(marks).not.toBeNull();
        const line = marks[0];
        expect(line.get(1)).toMatchObject({ch: "(", color: C[0], guide: false});
        expect(line.get(3)).toMatchObject({ch: "(", color: C[1], guide: false});
        expect(line.get(5)).toMatchObject({ch: ")", color: C[1], guide: false});
        expect(line.get(6)).toMatchObject({ch: ")", color: C[0], guide: false});
    });

    it("tints unmatched closers with the neutral hint", () => {
        const marks = scanRainbowMarks("x)")!;
        expect(marks[0].get(1)).toMatchObject({ch: ")", color: "#9ca3af", guide: false});
    });

    it("draws a pair guide at the opening column across multi-line pairs", () => {
        // The opener '(' of "def f(" sits at column 5 — its own glyph is
        // there (guide: false); the GUIDES start on the line AFTER it.
        const src = "def f(\n    x\n):\n    pass";
        const marks = scanRainbowMarks(src)!;
        expect(marks[0].get(5)).toMatchObject({ch: "(", guide: false});
        expect(marks[1].get(5)).toMatchObject({ch: "│", guide: true});
        expect(marks[2].get(5)).toMatchObject({ch: "│", guide: true});
    });

    it("never lets a guide overwrite a real bracket on the same column", () => {
        // The outer '(' opens at column 1; line 1's OWN '(' lands on the
        // same column — the real bracket wins over the pair guide.
        const src = "a(\nb(1)\n)";
        const marks = scanRainbowMarks(src)!;
        expect(marks[1].get(1)!.ch).toBe("(");
        expect(marks[1].get(1)!.guide).toBe(false);
    });

    it("tracks all three bracket kinds independently", () => {
        const marks = scanRainbowMarks("a[b{c}]")!;
        const line = marks[0];
        expect(line.get(1)).toMatchObject({ch: "[", color: C[0]});
        expect(line.get(3)).toMatchObject({ch: "{", color: C[1]});
        expect(line.get(5)).toMatchObject({ch: "}", color: C[1]});
        expect(line.get(6)).toMatchObject({ch: "]", color: C[0]});
    });

    it("returns null above the bracket budget", () => {
        const many = "(".repeat(RAINBOW_MAX_BRACKETS + 1);
        expect(scanRainbowMarks(many)).toBeNull();
        // Exactly at the budget still scans.
        expect(scanRainbowMarks("(".repeat(RAINBOW_MAX_BRACKETS))).not.toBeNull();
    });

    it("wraps the depth color around after the full palette", () => {
        const src = "((((((("; // Depths 0..6 — depth 6 wraps to C[0].
        const marks = scanRainbowMarks(src)!;
        expect(marks[0].get(6)!.color).toBe(C[6 % C.length]);
    });
});
