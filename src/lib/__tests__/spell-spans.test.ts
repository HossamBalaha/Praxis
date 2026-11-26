/**
 * spell-spans.test.ts — unit tests for src/lib/spell-spans.ts.
 *
 * Covers the Python comment/string scanner:
 *   - scanPyCommentStringSpans — # comments, single/double-quoted
 *     strings, triple-quoted strings (multi-line + unterminated),
 *     escapes, `#` INSIDE strings stays text, quotes inside comments
 *     stay text;
 *   - lineStartOffsets;
 *   - spellIssuesInPyProse — the gate that keeps only issues inside
 *     comment/string spans (word fully inside the span).
 */
import {describe, expect, it} from "vitest";
import {lineStartOffsets, scanPyCommentStringSpans, spellIssuesInPyProse,} from "@/lib/spell-spans";

/** 1-indexed col of a substring (hand-rolled to keep tests honest). */
const colOf = (line: string, word: string) => line.indexOf(word) + 1;

describe("scanPyCommentStringSpans", () => {
    it("returns nothing for pure code", () => {
        expect(scanPyCommentStringSpans("x = 1\ny = x + 2\n")).toEqual([]);
    });

    it("captures a full-line comment", () => {
        const src = "# a coment here\nx = 1";
        expect(scanPyCommentStringSpans(src)).toEqual([
            {start: 0, end: 15, kind: "comment"},
        ]);
    });

    it("captures a trailing comment after code", () => {
        const src = "x = 1  # inline coment";
        expect(scanPyCommentStringSpans(src)).toEqual([
            {start: 7, end: src.length, kind: "comment"},
        ]);
    });

    it("captures single- and double-quoted strings", () => {
        const src = `a = "helllo wrld" ; b = 'another oen'`;
        const spans = scanPyCommentStringSpans(src);
        expect(spans.map((s) => s.kind)).toEqual(["string", "string"]);
        expect(src.slice(spans[0].start, spans[0].end)).toBe(`"helllo wrld"`);
        expect(src.slice(spans[1].start, spans[1].end)).toBe(`'another oen'`);
    });

    it("honors triple-quoted strings across lines", () => {
        const src = '"""\nfirst line\nsecond line\n"""\nx = 1';
        const spans = scanPyCommentStringSpans(src);
        expect(spans).toEqual([{start: 0, end: 30, kind: "string"}]);
        expect(src.slice(0, 30)).toBe('"""\nfirst line\nsecond line\n"""');
    });

    it("treats a hash inside a triple-quoted string as text", () => {
        const src = '"""a # not a coment"""\nx = 1';
        const spans = scanPyCommentStringSpans(src);
        expect(spans).toHaveLength(1);
        expect(spans[0].kind).toBe("string");
        expect(spans[0].end).toBe(22);
    });

    it("treats quotes inside a comment as text (no string span)", () => {
        const src = `# don't panic about "quotes" here\nx = 1`;
        const spans = scanPyCommentStringSpans(src);
        expect(spans).toHaveLength(1);
        expect(spans[0].kind).toBe("comment");
        expect(spans[0].end).toBe(33);
        expect(src.slice(0, 33)).toBe(`# don't panic about "quotes" here`);
    });

    it("skips escaped quotes inside single-line strings", () => {
        // A real backslash before the quote — the string spans the whole
        // literal instead of ending at the first quote. (BS is built from
        // a char code so the test source itself needs no escaping.)
        const BS = String.fromCharCode(92);
        const src = `'it${BS}'s a "test"'`;
        const spans = scanPyCommentStringSpans(src);
        expect(spans).toHaveLength(1);
        expect(src.slice(spans[0].start, spans[0].end)).toBe(src);
    });

    it("an unterminated string runs to the end of its line", () => {
        const src = `x = "open string\ny = 1`;
        const spans = scanPyCommentStringSpans(src);
        expect(spans).toHaveLength(1);
        expect(src.slice(spans[0].start, spans[0].end)).toBe('"open string');
    });

    it("never produces an empty span", () => {
        for (const src of ["", "#", '""', "''", "''''''", "#\n", '"\n']) {
            for (const s of scanPyCommentStringSpans(src)) {
                expect(s.end).toBeGreaterThan(s.start);
            }
        }
    });

    it("scans a raw-prefixed triple-quoted string body", () => {
        const src = "s = r'''no\\escape'''\n";
        const spans = scanPyCommentStringSpans(src);
        expect(spans).toHaveLength(1);
        expect(src.slice(spans[0].start, spans[0].end)).toBe(`'''no\\escape'''`);
    });
});

describe("lineStartOffsets", () => {
    it("line 1 starts at 0 and every newline opens the next line", () => {
        expect(lineStartOffsets("ab\ncd\nef")).toEqual([0, 3, 6]);
        expect(lineStartOffsets("")).toEqual([0]);
        expect(lineStartOffsets("no newline")).toEqual([0]);
    });
});

describe("spellIssuesInPyProse", () => {
    const line1 = "# coment with a mispelled word";
    const line2 = "x = 1";
    const line3 = 'msg = "another mispelled thign"';
    const line4 = "totaly_in_code = 2";
    const src = [line1, line2, line3, line4].join("\n");

    it("keeps issues inside comments and strings", () => {
        const issues = [
            {word: "coment", line: 1, col: colOf(line1, "coment")},
            {word: "mispelled", line: 1, col: colOf(line1, "mispelled")},
            {word: "mispelled", line: 3, col: colOf(line3, "mispelled")},
            {word: "thign", line: 3, col: colOf(line3, "thign")},
        ];
        expect(spellIssuesInPyProse(issues, src)).toEqual(issues);
    });

    it("drops issues in code", () => {
        const issues = [
            {word: "totaly", line: 4, col: colOf(line4, "totaly")},
        ];
        expect(spellIssuesInPyProse(issues, src)).toEqual([]);
    });

    it("drops a word that straddles the string's closing quote", () => {
        // A word starting AT the closing quote is not prose.
        const issues = [{word: "quote", line: 3, col: line3.length}];
        expect(spellIssuesInPyProse(issues, src)).toEqual([]);
    });

    it("handles an empty issue list without scanning", () => {
        expect(spellIssuesInPyProse([], src)).toEqual([]);
    });

    it("drops everything when the source has no prose", () => {
        const issues = [{word: "x", line: 1, col: 1}];
        expect(spellIssuesInPyProse(issues, "x = 1\ny = 2")).toEqual([]);
    });

    it("ignores issues with out-of-range lines", () => {
        const issues = [{word: "coment", line: 99, col: 3}];
        expect(spellIssuesInPyProse(issues, src)).toEqual([]);
    });
});
