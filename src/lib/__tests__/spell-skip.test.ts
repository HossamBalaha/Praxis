/**
 * spell-skip.test.ts — unit tests for src/lib/spell-skip.ts.
 *
 * Covers the HTML/CSS markup keyword skip-list
 *   - isMarkupWord — case-insensitive membership, non-markup words
 *     are NOT skipped;
 *   - filterMarkupSpellIssues — misspelling lists shed their markup
 *     entries and keep real prose issues.
 */
import {describe, expect, it} from "vitest";
import {filterMarkupSpellIssues, isMarkupWord, MARKUP_SKIP_WORDS} from "@/lib/spell-skip";

describe("isMarkupWord", () => {
    it("recognizes common HTML tags case-insensitively", () => {
        for (const w of ["div", "DIV", "Span", "tbody", "figcaption", "datalist"]) {
            expect(isMarkupWord(w)).toBe(true);
        }
    });

    it("recognizes common HTML attributes", () => {
        for (const w of ["href", "srcset", "colspan", "aria", "crossorigin"]) {
            expect(isMarkupWord(w)).toBe(true);
        }
    });

    it("recognizes common CSS properties + values", () => {
        // (The API reports letter RUNS, so hyphenated CSS names arrive as
        // their parts — border + radius — and both are listed.)
        for (const w of ["background", "border", "radius", "serif", "sans", "keyframes", "important"]) {
            expect(isMarkupWord(w)).toBe(true);
        }
    });

    it("does not swallow real English words", () => {
        for (const w of ["teh", "coment", "wrld", "hello", "dictionary", "misspelled"]) {
            expect(isMarkupWord(w)).toBe(false);
        }
    });

    it("the skip list meets the plan's size bar (>= 140 words)", () => {
        expect(MARKUP_SKIP_WORDS.size).toBeGreaterThanOrEqual(140);
    });
});

describe("filterMarkupSpellIssues", () => {
    it("drops markup keywords, keeps prose issues and extra fields", () => {
        const issues = [
            {word: "div", line: 1, col: 4},
            {word: "teh", line: 2, col: 8},
            {word: "sans", line: 3, col: 12},
            {word: "coment", line: 4, col: 2},
        ];
        const out = filterMarkupSpellIssues(issues);
        expect(out).toEqual([
            {word: "teh", line: 2, col: 8},
            {word: "coment", line: 4, col: 2},
        ]);
    });

    it("empty lists pass through", () => {
        expect(filterMarkupSpellIssues([])).toEqual([]);
    });
});
