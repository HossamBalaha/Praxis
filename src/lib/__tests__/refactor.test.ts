/**
 * refactor.test.ts — unit tests for src/lib/refactor.ts.
 *
 * Deterministic, AI-free text refactors used by the editor's context menu.
 * Covered:
 * - dedent: common-prefix removal, ragged indents, no indent at all,
 * blank lines, mixed tabs/spaces, trailing-newline behavior, empty input
 * - lineStarts: offset table incl. empty string
 * - isIdentifier: valid/invalid Python identifier names
 * - extractFunction: exact expected outputs (def inserted at the start of
 * the selection's first line with the selection's indent, body dedented
 * and re-indented by 4 spaces, blank line, then the original leading
 * text + the call) for (A) a whole-line top-level selection, (B) an
 * indented whole-line selection, (C) a mid-line top-level selection;
 * caret position; rejection cases
 * - extractVariable: single-line assignment above, indented variant,
 * selection trimming, multiline rejection + explicit opt-in; rejections
 *
 * NOTE ON A SOURCE BUG (asserted as-is, source NOT modified): in
 * extractFunction the body lines are prefixed with a hardcoded 4 spaces —
 * the `unit` variable computed from the selection's indent is dead code.
 * For a selection indented by 4+ spaces (case B) the body therefore lands
 * at the SAME indent as the def header, which is not valid Python. The
 * exact expected strings below document the current behavior; the top-level
 * cases (A, C) are unaffected and produce valid output.
 */
import {describe, expect, it} from "vitest";
import {dedent, extractFunction, extractVariable, isIdentifier, lineStarts,} from "@/lib/refactor";

describe("dedent", () => {
    it("removes the common leading whitespace from all lines", () => {
        expect(dedent("    a\n    b")).toBe("a\nb");
        expect(dedent("\ta\n\tb")).toBe("a\nb");
    });

    it("uses the SHALLOWEST indent for ragged blocks (textwrap.dedent semantics)", () => {
        expect(dedent("    a\n        b")).toBe("a\n    b");
        expect(dedent("        a\n    b")).toBe("    a\nb");
    });

    it("returns the text unchanged when no line is indented", () => {
        expect(dedent("a\nb")).toBe("a\nb");
        // …including preserving a trailing newline (nothing to strip).
        expect(dedent("a\nb\n")).toBe("a\nb\n");
    });

    it("ignores blank lines when computing the common prefix", () => {
        expect(dedent("    a\n\n    b")).toBe("a\n\nb");
    });

    it("drops a single trailing newline when it actually dedents", () => {
        expect(dedent("    a\n    b\n")).toBe("a\nb");
    });

    it("returns the text unchanged when leading whitespace is inconsistent (no common prefix)", () => {
        expect(dedent("  a\n\tb")).toBe("  a\n\tb");
    });

    it("handles empty and newline-only input", () => {
        expect(dedent("")).toBe("");
        expect(dedent("\n")).toBe("\n");
    });
});

describe("lineStarts", () => {
    it("returns the 0-indexed start offset of every line", () => {
        expect(lineStarts("ab\ncd")).toEqual([0, 3]);
        expect(lineStarts("a\nb\nc")).toEqual([0, 2, 4]);
    });

    it("returns [0] for empty and single-line input", () => {
        expect(lineStarts("")).toEqual([0]);
        expect(lineStarts("x")).toEqual([0]);
    });
});

describe("isIdentifier", () => {
    it("accepts valid Python identifiers", () => {
        for (const name of ["foo", "Foo", "_private", "_x1", "a1_b2", "____"]) {
            expect(isIdentifier(name)).toBe(true);
        }
    });

    it("rejects invalid identifiers", () => {
        for (const name of ["", "1bad", "with space", "a-b", "a.b", "a b", "Ünicode", "x!"]) {
            expect(isIdentifier(name)).toBe(false);
        }
    });

    it("rejects Python keywords (keyword names would emit invalid Python)", () => {
        for (const name of ["def", "class", "return", "lambda", "yield", "None", "True", "False"]) {
            expect(isIdentifier(name)).toBe(false);
        }
        // Non-keyword look-alikes still pass.
        expect(isIdentifier("classify")).toBe(true);
        expect(isIdentifier("define")).toBe(true);
    });
});

describe("extractFunction", () => {
    // ── Case A: whole-line, top-level selection ─────────────────────────
    const srcA = 'print("start")\nprint("hello")\nprint("bye")\nprint("end")';

    it("A: extracts whole top-level lines — def above, call in place, blank line between", () => {
        const edit = extractFunction(srcA, {start: 15, end: 42}, "newfn");
        expect(edit).not.toBeNull();
        expect(edit!.source).toBe(
            'print("start")\n' +
            "def newfn():\n" +
            '    print("hello")\n' +
            '    print("bye")\n' +
            "\n" +
            "newfn()\n" +
            'print("end")'
        );
        // The def is inserted at the start of the selection's first line; the
        // body was dedented and re-indented by 4 spaces; a blank line separates
        // def from the call; the call replaces the selection.
    });

    it("A: caret lands between the call's parentheses (argument position)", () => {
        const edit = extractFunction(srcA, {start: 15, end: 42}, "newfn")!;
        expect(edit.caret).toBe(71);
        expect(edit.source[edit.caret]).toBe(")");
        expect(edit.source.slice(edit.caret - 6, edit.caret)).toBe("newfn(");
    });

    // ── Case B: whole-line, INDENTED selection ──────────────────────────
    const srcB = "def main():\n    x = 1\n    y = x + 2\n    print(y)\n    return y";

    it("B: inserts a nested def with the body one unit deeper (edge-case fix)", () => {
        const edit = extractFunction(srcB, {start: 22, end: 35}, "extracted");
        expect(edit).not.toBeNull();
        // the body line is now indent + one unit deeper than
        // the def header, so the emitted block IS valid Python.
        expect(edit!.source).toBe(
            "def main():\n" +
            "    x = 1\n" +
            "    def extracted():\n" +
            "        y = x + 2\n" +
            "\n" +
            "    extracted()\n" +
            "    print(y)\n" +
            "    return y"
        );
        // Caret: just before the closing paren of the call.
        expect(edit!.source.slice(edit!.caret - "extracted(".length, edit!.caret)).toBe("extracted(");
        expect(edit!.source[edit!.caret]).toBe(")");
    });

    // ── Case C: mid-line, top-level selection ───────────────────────────
    const srcC = "total = price * qty\nprint(total)";

    it("C: keeps the original leading text before the call", () => {
        const edit = extractFunction(srcC, {start: 8, end: 19}, "calc");
        expect(edit).not.toBeNull();
        expect(edit!.source).toBe(
            "def calc():\n" +
            "    price * qty\n" +
            "\n" +
            "total = calc()\n" +
            "print(total)"
        );
        expect(edit!.caret).toBe(42);
        expect(edit!.source[edit!.caret]).toBe(")");
        expect(edit!.source.slice(edit!.caret - 5, edit!.caret)).toBe("calc(");
    });

    it("C: the produced code is valid Python for the top-level cases", () => {
        const edit = extractFunction(srcC, {start: 8, end: 19}, "calc")!;
        // def header at column 0, body strictly indented under it, call on its
        // own original line — the structural sanity of cases A and C.
        const lines = edit.source.split("\n");
        expect(lines[0].startsWith("def calc():")).toBe(true);
        expect(lines[1].startsWith("    price * qty")).toBe(true);
        expect(lines[2]).toBe("");
        expect(lines[3]).toBe("total = calc()");
    });

    it("rejects an empty or reversed selection", () => {
        expect(extractFunction("x = 1", {start: 0, end: 0}, "f")).toBeNull();
        expect(extractFunction("x = 1", {start: 4, end: 0}, "f")).toBeNull();
    });

    it("rejects whitespace-only selections", () => {
        // Selects the newline between two statements → nothing to extract.
        expect(extractFunction("x = 1\n\ny = 2", {start: 5, end: 6}, "f")).toBeNull();
    });

    it("rejects invalid function names", () => {
        expect(extractFunction("x = 1", {start: 0, end: 4}, "1bad")).toBeNull();
        expect(extractFunction("x = 1", {start: 0, end: 4}, "with space")).toBeNull();
        expect(extractFunction("x = 1", {start: 0, end: 4}, "")).toBeNull();
    });
});

describe("extractVariable", () => {
    it("assigns the trimmed selection on the line above and replaces it with the name", () => {
        const src = "total = a + b + c\nprint(total)";
        const edit = extractVariable(src, {start: 8, end: 17}, "s");
        expect(edit).not.toBeNull();
        expect(edit!.source).toBe("s = a + b + c\ntotal = s\nprint(total)");
        // Caret sits right after the inserted variable name at the use site.
        expect(edit!.caret).toBe(23);
        expect(edit!.source[edit!.caret - 1]).toBe("s");
    });

    it("respects the line's own indentation for the assignment", () => {
        const src = "def f():\n    x = 1 + 2\n";
        const edit = extractVariable(src, {start: 17, end: 22}, "val");
        expect(edit!.source).toBe("def f():\n    val = 1 + 2\n    x = val\n");
        expect(edit!.caret).toBe(36);
        expect(edit!.source.slice(edit!.caret - 3, edit!.caret)).toBe("val");
    });

    it("trims surrounding whitespace off the selected expression", () => {
        // Selection is " 1 + 2 " (inside the parens, spaces included).
        const edit = extractVariable("x = ( 1 + 2 )", {start: 5, end: 12}, "v");
        expect(edit!.source).toBe("v = 1 + 2\nx = (v)");
        expect(edit!.caret).toBe(16);
    });

    it("rejects multiline selections unless allowMultiline is set", () => {
        const src = "a = 1\nb = 2";
        // "1\nb" spans two lines.
        expect(extractVariable(src, {start: 4, end: 7}, "x")).toBeNull();
        const edit = extractVariable(src, {start: 4, end: 7}, "x", true);
        expect(edit).not.toBeNull();
        expect(edit!.source).toBe("x = 1\nb\na = x = 2");
    });

    it("rejects an empty or reversed selection", () => {
        expect(extractVariable("x = 1", {start: 2, end: 2}, "v")).toBeNull();
        expect(extractVariable("x = 1", {start: 4, end: 2}, "v")).toBeNull();
    });

    it("rejects whitespace-only selections", () => {
        expect(extractVariable("x =   ", {start: 4, end: 6}, "v")).toBeNull();
    });

    it("rejects invalid variable names", () => {
        expect(extractVariable("x = 1", {start: 0, end: 4}, "1bad")).toBeNull();
        expect(extractVariable("x = 1", {start: 0, end: 4}, "with space")).toBeNull();
        expect(extractVariable("x = 1", {start: 0, end: 4}, "")).toBeNull();
    });
});
