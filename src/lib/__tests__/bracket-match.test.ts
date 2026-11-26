/**
 * bracket-match.test.ts — unit tests for src/lib/bracket-match.ts.
 *
 * Covers the stack-based pair scanner (strings skipped naively):
 *   - findBracketPair — caret on the opener / on the closer / next to
 *     either side; nesting; mismatched closers; brackets inside
 *     strings are ignored;
 *   - findOccurrences — the selection-occurrence highlight's offsets,
 *     whole-word matching for identifier-ish needles.
 */
import {describe, expect, it} from "vitest";
import {findBracketPair, findOccurrences} from "@/lib/bracket-match";

describe("findBracketPair", () => {
    it("finds the pair when the caret is on the opener", () => {
        const src = "fn(a + (b * c))";
        // outer '(' at 2 with its closer at 14; inner pair (7, 13).
        expect(findBracketPair(src, 2)).toEqual({
            openOffset: 2,
            closeOffset: 14,
            bracket: "(",
        });
        expect(findBracketPair(src, 7)).toEqual({
            openOffset: 7,
            closeOffset: 13,
            bracket: "(",
        });
    });

    it("finds the pair when the caret is on the closer", () => {
        const src = "fn(a + (b * c))";
        expect(findBracketPair(src, 13)).toEqual({
            openOffset: 7,
            closeOffset: 13,
            bracket: "(",
        });
        expect(findBracketPair(src, 14)).toEqual({
            openOffset: 2,
            closeOffset: 14,
            bracket: "(",
        });
    });

    it("matches nesting, not the first closer", () => {
        const src = "(a(b)c)";
        expect(findBracketPair(src, 2)).toEqual({
            openOffset: 2,
            closeOffset: 4,
            bracket: "(",
        });
        expect(findBracketPair(src, 0)).toEqual({
            openOffset: 0,
            closeOffset: 6,
            bracket: "(",
        });
        // The caret NEXT to the outer opener (on the 'a') still pairs it.
        expect(findBracketPair(src, 1)).toEqual({
            openOffset: 0,
            closeOffset: 6,
            bracket: "(",
        });
    });

    it("square + curly brackets pair with their own kind", () => {
        expect(findBracketPair("[1, [2]]", 1)).toEqual({
            openOffset: 0,
            closeOffset: 7,
            bracket: "[",
        });
        expect(findBracketPair("{a: [1]}", 1)).toEqual({
            openOffset: 0,
            closeOffset: 7,
            bracket: "{",
        });
    });

    it("caret just AFTER a closer and just BEFORE an opener still match", () => {
        const src = "call(x)";
        expect(findBracketPair(src, 7)).toEqual({
            openOffset: 4,
            closeOffset: 6,
            bracket: "(",
        });
        expect(findBracketPair(src, 3)).toEqual({
            openOffset: 4,
            closeOffset: 6,
            bracket: "(",
        });
    });

    it("returns null away from any bracket", () => {
        expect(findBracketPair("plain text", 5)).toBeNull();
        expect(findBracketPair("", 0)).toBeNull();
    });

    it("brackets inside single/double-quoted strings are ignored", () => {
        const src = `x = "(" + [1]`;
        // The '(' inside the string is skipped; the [ ] pair is real.
        expect(findBracketPair(src, 12)).toEqual({
            openOffset: 10,
            closeOffset: 12,
            bracket: "[",
        });
        // A caret on the in-string '(' finds nothing.
        expect(findBracketPair(src, 5)).toBeNull();
    });

    it("escaped quotes do not end the string", () => {
        const src = `s = "a\\"(b" ; f()`;
        // The '(' inside the string must not pair; f() pairs at 15/16.
        expect(findBracketPair(src, 16)).toEqual({
            openOffset: 15,
            closeOffset: 16,
            bracket: "(",
        });
    });

    it("a mismatched closer is simply skipped", () => {
        // ")" with no opener — no pair, no crash.
        expect(findBracketPair(")", 0)).toBeNull();
    });
});

describe("findOccurrences", () => {
    it("finds every whole-word occurrence of an identifier", () => {
        const src = "cat catalog cat";
        expect(findOccurrences(src, "cat")).toEqual([0, 12]);
    });

    it("plain substring needles match without word boundaries", () => {
        expect(findOccurrences("cat catalog cat", "catalog")).toEqual([4]);
        // Not identifier-ish (the '=') — every hit counts, boundaries off.
        expect(findOccurrences("x=1; y=1", "=1")).toEqual([1, 6]);
    });

    it("caps the result", () => {
        const out = findOccurrences("ab ".repeat(50).trim(), "ab", 10);
        expect(out).toHaveLength(10);
    });

    it("empty needle returns nothing", () => {
        expect(findOccurrences("anything", "")).toEqual([]);
    });
});
