import {describe, expect, it} from "vitest";
import {
    applyFormatPostProcessors,
    collapseBlankRuns,
    normalizeLineEndings,
    normalizePythonQuotes,
    pyNormalizeBooleans,
    pySpaceAfterComma,
    trimTrailingWhitespace,
} from "@/lib/format-post";

describe("normalizePythonQuotes", () => {
    it("converts plain single quotes to double", () => {
        expect(normalizePythonQuotes("x = 'a'\n", "double")).toBe('x = "a"\n');
    });
    it("converts double to single when asked", () => {
        expect(normalizePythonQuotes('x = "a"\n', "single")).toBe("x = 'a'\n");
    });
    it("keeps strings that contain the target quote", () => {
        expect(normalizePythonQuotes(`x = 'say "hi"'\n`, "double")).toBe(`x = 'say "hi"'\n`);
    });
    it("keeps strings with backslash escapes", () => {
        expect(normalizePythonQuotes("x = 'a\\\\b'\n", "double")).toBe("x = 'a\\\\b'\n");
    });
    it("never touches comments", () => {
        expect(normalizePythonQuotes("# don't touch\n", "double")).toBe("# don't touch\n");
    });
    it("never touches triple-quoted docstrings", () => {
        const src = '"""keep \'as is\'"""\n';
        expect(normalizePythonQuotes(src, "double")).toBe(src);
    });
    it("converts f-strings with their prefix intact", () => {
        expect(normalizePythonQuotes("x = f'{name}'\n", "double")).toBe('x = f"{name}"\n');
    });
    it("leaves code around strings untouched", () => {
        expect(normalizePythonQuotes("d['k'] = 'v'\n", "double")).toBe('d["k"] = "v"\n');
    });
    it("keep mode is a no-op", () => {
        expect(normalizePythonQuotes("x = 'a'\n", "keep")).toBe("x = 'a'\n");
        expect(normalizePythonQuotes("x = 'a'\n", undefined)).toBe("x = 'a'\n");
    });
});

describe("hygiene passes", () => {
    it("trims trailing whitespace but PRESERVES CR line endings", () => {
        // "a " → "a" (space before \r\n goes); the \r itself STAYS (a CRLF
        // file with "keep" endings must survive the trim); mid-line tabs
        // are not trailing; "c  " → "c".
        expect(trimTrailingWhitespace("a \tb\r\nc  \n")).toBe("a \tb\r\nc\n");
        expect(trimTrailingWhitespace("a \r\nb  \r\n")).toBe("a\r\nb\r\n");
        expect(trimTrailingWhitespace("x  ")).toBe("x");
    });
    it("collapses blank runs to the max kept", () => {
        expect(collapseBlankRuns("a\n\n\n\nb", 1)).toBe("a\n\nb");
        expect(collapseBlankRuns("a\n\n\n\nb", 2)).toBe("a\n\n\nb");
    });
    it("removes leading blanks entirely", () => {
        expect(collapseBlankRuns("\n\n\na\n", 1)).toBe("a\n");
    });
    it("preserves the trailing final newline, not a blank run", () => {
        expect(collapseBlankRuns("a\n\n", 1)).toBe("a\n");
        expect(collapseBlankRuns("a\n\n\n", 1)).toBe("a\n");
    });
    it("pySpaceAfterComma adds the space after commas only in code", () => {
        expect(pySpaceAfterComma("f(a,b)\n")).toBe("f(a, b)\n");
        expect(pySpaceAfterComma("f(a ,b)\n")).toBe("f(a, b)\n");
        expect(pySpaceAfterComma("t = (x,)\n")).toBe("t = (x,)\n");
        expect(pySpaceAfterComma("s = 'a,b'\n")).toBe("s = 'a,b'\n");
    });
    it("pyNormalizeBooleans fixes casing in code only", () => {
        expect(pyNormalizeBooleans("x = true\ny = 'false'\n")).toBe("x = True\ny = 'false'\n");
    });
    it("normalizeLineEndings converts as configured", () => {
        expect(normalizeLineEndings("a\r\nb\r\n", "lf")).toBe("a\nb\n");
        expect(normalizeLineEndings("a\nb\n", "crlf")).toBe("a\r\nb\r\n");
        expect(normalizeLineEndings("a\r\nb\n", "keep")).toBe("a\r\nb\n");
    });
});

describe("applyFormatPostProcessors end-to-end", () => {
    it("x = 'a' → x = \"a\"", () => {
        const out = applyFormatPostProcessors(
            "x = 'a'\n",
            {formatPyQuoteStyle: "double", formatPySpaceAfterComma: false, formatPyNormalizeBooleans: false},
            "cell.py"
        );
        expect(out).toBe('x = "a"\n');
    });
    it("hygiene defaults trim + collapse + final newline", () => {
        const out = applyFormatPostProcessors(
            "a  \n\n\n\nb\n\n\n",
            {formatPyQuoteStyle: "keep", formatPySpaceAfterComma: false, formatPyNormalizeBooleans: false},
            "t.py"
        );
        expect(out).toBe("a\n\nb\n");
    });
    it("line endings run last (crlf)", () => {
        const out = applyFormatPostProcessors(
            "x = 'a'\n",
            {
                formatPyQuoteStyle: "double",
                formatNormalizeLineEndings: "crlf",
                formatPySpaceAfterComma: false,
                formatPyNormalizeBooleans: false,
            },
            "t.py"
        );
        expect(out).toBe('x = "a"\r\n');
    });
    it("non-Python files skip the Python passes", () => {
        const out = applyFormatPostProcessors(
            "x = 'a'\n",
            {formatPyQuoteStyle: "double", formatPySpaceAfterComma: true, formatPyNormalizeBooleans: true},
            "t.md"
        );
        expect(out).toBe("x = 'a'\n");
    });
});
