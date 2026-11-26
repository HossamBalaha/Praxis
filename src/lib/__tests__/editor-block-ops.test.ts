/**
 * Unit tests for the pure edit-mode block operations
 * (src/lib/editor-block-ops.ts) — the line utilities extracted from
 * code-viewer.tsx, pinned to the exact selection semantics the
 * textarea callbacks used inline.
 */
import {describe, expect, it} from "vitest";
import {
    centeredTextareaScrollTop,
    convertIdentifierCase,
    deleteLinesBlock,
    duplicateLinesBlock,
    escapeRegExpLiteral,
    expandRangeToWord,
    joinLinesBlock,
    lineIndexOfOffset,
    lineNumberAtOffset,
    lineTextAt,
    newlineCountBefore,
    offsetBeforeLine,
    replaceAllLiteral,
    reverseLines,
    runSelectionText,
    shuffleLines,
    sortLinesBlock,
    splitLinesBlock,
    surroundRange,
    togglePythonComments,
    transformLinesBlock,
    trimTrailingWhitespace,
    uniqueLines,
    wordRangeAround,
} from "@/lib/editor-block-ops";

const SRC = "import os\n\n\ndef f(x):\n    return x + 1\n\ny = f(2)\n";

/** Offset of the start of line `n` (1-based) in SRC. */
function offsetOfLine(n: number): number {
    return SRC.split("\n").slice(0, n - 1).join("\n").length + (n > 1 ? 1 : 0);
}

describe("offset geometry", () => {
    it("maps offsets to 0-based and 1-based line indexes", () => {
        expect(lineIndexOfOffset(SRC, 0)).toBe(0);
        expect(lineNumberAtOffset(SRC, 0)).toBe(1);
        const line4 = offsetOfLine(4);
        expect(lineIndexOfOffset(SRC, line4)).toBe(3);
        expect(lineNumberAtOffset(SRC, line4)).toBe(4);
    });

    it("counts newlines before an offset", () => {
        expect(newlineCountBefore(SRC, 0)).toBe(0);
        // SRC has 8 split-elements (trailing newline) → 7 "\n" chars total.
        expect(newlineCountBefore(SRC, SRC.length)).toBe(7);
    });

    it("computes the offset where a line starts", () => {
        const lines = SRC.split("\n");
        expect(offsetBeforeLine(lines, 0)).toBe(0);
        expect(offsetBeforeLine(lines, 1)).toBe(lines[0].length + 1);
        expect(offsetBeforeLine(lines, 2)).toBe(lines.slice(0, 2).join("\n").length + 1);
    });

    it("centers a textarea scroll target with the 16px top inset", () => {
        expect(centeredTextareaScrollTop(0, 24, 600)).toBe(0);
        // 16 + 240 − 300 is negative — clamped to 0 like the original.
        expect(centeredTextareaScrollTop(10, 24, 600)).toBe(0);
        expect(centeredTextareaScrollTop(30, 24, 600)).toBe(16 + 720 - 300);
    });
});

describe("togglePythonComments", () => {
    it("comments every non-blank selected line at its indent", () => {
        const src = "a = 1\n\nb = 2\n";
        const edit = togglePythonComments(src, 0, src.length)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("# a = 1\n\n# b = 2\n");
        expect(edit.selStart).toBe(0);
        // Selecting through the trailing newline includes the phantom last
        // (empty) line in the block — the selection covers it too.
        expect(edit.selEnd).toBe("# a = 1\n\n# b = 2\n".length);
    });

    it("uncomments, stripping the hash and at most ONE following space", () => {
        const src = "# a = 1\n#   b = 2\n";
        const edit = togglePythonComments(src, 0, src.length)!;
        expect(edit).not.toBeNull();
        // The original regex drops `#[ \t]?` only — two of the three
        // spaces after the hash survive.
        expect(edit.content).toBe("a = 1\n  b = 2\n");
    });

    it("keeps the indent before the hash when commenting", () => {
        const src = "def f():\n    return 1\n";
        const edit = togglePythonComments(src, 0, src.length)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("# def f():\n    # return 1\n");
        const back = togglePythonComments(edit.content, 0, edit.content.length)!;
        expect(back.content).toBe(src);
    });

    it("returns null when the toggle changes nothing (all blanks)", () => {
        expect(togglePythonComments("\n\n", 0, 2)).toBeNull();
    });

    it("keeps the surrounding lines intact and re-selects the block", () => {
        const src = "keep\na = 1\nkeep2\n";
        const start = src.indexOf("a = 1");
        const edit = togglePythonComments(src, start, start + 5)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("keep\n# a = 1\nkeep2\n");
        expect(edit.selStart).toBe(start);
        expect(edit.selEnd).toBe(start + "# a = 1".length);
    });
});

describe("duplicateLinesBlock", () => {
    it("duplicates the selected block below itself and selects the copy", () => {
        const src = "a\nb\nc\n";
        const start = src.indexOf("b");
        const edit = duplicateLinesBlock(src, start, start + 1);
        expect(edit.content).toBe("a\nb\nb\nc\n");
        expect(edit.selStart).toBe(src.indexOf("b") + 2);
        expect(edit.selEnd).toBe(src.indexOf("b") + 3);
    });

    it("duplicates a multi-line selection as one contiguous copy", () => {
        const src = "a\nb\nc\nd\n";
        const start = src.indexOf("b");
        const end = src.indexOf("c") + 1;
        const edit = duplicateLinesBlock(src, start, end);
        expect(edit.content).toBe("a\nb\nc\nb\nc\nd\n");
    });
});

describe("deleteLinesBlock", () => {
    it("deletes the selected lines and parks the caret where the block was", () => {
        const src = "a\nb\nc\n";
        const start = src.indexOf("b");
        const edit = deleteLinesBlock(src, start, start + 1)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("a\nc\n");
        expect(edit.selStart).toBe(2);
        expect(edit.selEnd).toBe(2);
    });

    it("refuses to delete the only line of a one-line buffer", () => {
        expect(deleteLinesBlock("only", 0, 0)).toBeNull();
    });
});

describe("joinLinesBlock", () => {
    it("joins the caret's line with the next (trimmed halves, one space)", () => {
        const src = "alpha\nbeta\n";
        const start = src.indexOf("alpha");
        const edit = joinLinesBlock(src, start, start)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("alpha beta\n");
        expect(edit.selEnd).toBe("alpha beta".length);
    });

    it("joins a multi-line selection into one line", () => {
        const src = "a\nb\nc\n";
        const start = src.indexOf("a");
        const end = src.indexOf("c") + 1;
        const edit = joinLinesBlock(src, start, end)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("a b c\n");
    });

    it("returns null on the last line with nothing to join", () => {
        // No trailing newline — with one, the phantom empty line makes the
        // join succeed (original behavior, preserved).
        const src = "a\nlast";
        const start = src.indexOf("last");
        expect(joinLinesBlock(src, start, start)).toBeNull();
    });
});

describe("splitLinesBlock", () => {
    it("splits the block at commas into trimmed one-item lines", () => {
        const src = "x = [1, 2, 3]\n";
        const edit = splitLinesBlock(src, 0, src.length)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("x = [1\n2\n3]\n");
    });

    it("returns null when there is no comma to split on", () => {
        expect(splitLinesBlock("plain line\n", 0, 10)).toBeNull();
    });
});

describe("sortLinesBlock", () => {
    it("sorts case-insensitively on the trimmed text", () => {
        const src = "banana\nApple\ncherry";
        const edit = sortLinesBlock(src, 0, src.length)!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("Apple\nbanana\ncherry");
    });

    it("returns null for a single-line selection or an already-sorted block", () => {
        expect(sortLinesBlock("a\nb\n", 0, 1)).toBeNull();
        expect(sortLinesBlock("a\nb", 0, 3)).toBeNull();
    });
});

describe("transformLinesBlock", () => {
    it("splices the transformed block back and re-selects it", () => {
        const src = "x\n1\n2\ny\n";
        const start = src.indexOf("1");
        const end = src.indexOf("2") + 1;
        const edit = transformLinesBlock(src, start, end, (b) => [...b].reverse())!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("x\n2\n1\ny\n");
        expect(edit.selStart).toBe(start);
        expect(edit.selEnd).toBe(start + 3);
    });

    it("returns null for single-line selections and no-op transforms", () => {
        expect(transformLinesBlock("a\n", 0, 1, (b) => b)).toBeNull();
        expect(transformLinesBlock("a\nb\n", 0, 3, (b) => b)).toBeNull();
    });
});

describe("unique / reverse / shuffle", () => {
    it("uniqueLines keeps the first occurrence (compared trimmed)", () => {
        expect(uniqueLines(["a", "  a ", "b", "a", "b"])).toEqual(["a", "b"]);
        expect(uniqueLines(["", " ", "x"])).toEqual(["", "x"]);
    });

    it("reverseLines returns a reversed copy", () => {
        const b = ["a", "b", "c"];
        expect(reverseLines(b)).toEqual(["c", "b", "a"]);
        expect(b).toEqual(["a", "b", "c"]);
    });

    it("shuffleLines permutes the input with an injectable rng", () => {
        const out = shuffleLines(["a", "b", "c", "d"], () => 0);
        expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
        // rng() = 0 always swaps with index 0: d,a→ swap(3,0)=dcba… trace
        // swaps (3,0) then (2,0) then (1,0) → b,c,d,a.
        expect(out).toEqual(["b", "c", "d", "a"]);
    });
});

describe("trimTrailingWhitespace", () => {
    it("strips trailing spaces and tabs per line, keeping structure", () => {
        expect(trimTrailingWhitespace("a \t \nb\t\nc")).toBe("a\nb\nc");
    });
});

describe("wordRangeAround / expandRangeToWord", () => {
    it("returns the live selection as-is", () => {
        const r = wordRangeAround("hello world", 0, 5);
        expect(r).toEqual({start: 0, end: 5, text: "hello"});
    });

    it("expands a caret to the identifier around it", () => {
        expect(wordRangeAround("foo_bar(baz)", 3, 3)).toEqual({start: 0, end: 7, text: "foo_bar"});
        expect(wordRangeAround("foo_bar(baz)", 10, 10)).toEqual({start: 8, end: 11, text: "baz"});
    });

    it("includes $ in identifiers", () => {
        expect(wordRangeAround("const $x = 1", 7, 7)).toEqual({start: 6, end: 8, text: "$x"});
    });

    it("returns null only when BOTH neighbors are non-word characters", () => {
        // A caret right after a word still expands backward onto it.
        expect(wordRangeAround("foo bar", 3, 3)).toEqual({start: 0, end: 3, text: "foo"});
        // Between two words separated by one space, either side is grabbed.
        expect(wordRangeAround("foo  bar", 4, 4)).toBeNull();
    });

    it("expandRangeToWord keeps real selections and expands collapsed carets", () => {
        expect(expandRangeToWord("abc def", 0, 3)).toEqual({start: 0, end: 3});
        expect(expandRangeToWord("abc def", 4, 4)).toEqual({start: 4, end: 7});
        // At a single-space boundary the word BEFORE the caret wins.
        expect(expandRangeToWord("abc def", 3, 3)).toEqual({start: 0, end: 3});
        expect(expandRangeToWord("abc  def", 4, 4)).toBeNull();
    });
});

describe("surroundRange", () => {
    it("wraps a selection and lands the caret inside the delimiters", () => {
        const edit = surroundRange("say hi now", 4, 6, "quotes")!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe('say "hi" now');
        expect(edit.selStart).toBe(5);
        expect(edit.selEnd).toBe(7);
    });

    it("expands to the word at the caret when nothing is selected", () => {
        const edit = surroundRange("x = word;", 5, 5, "brackets")!;
        expect(edit).not.toBeNull();
        expect(edit.content).toBe("x = [word];");
    });

    it("covers all four delimiter pairs", () => {
        expect(surroundRange("ab", 0, 2, "parens")!.content).toBe("(ab)");
        expect(surroundRange("ab", 0, 2, "brackets")!.content).toBe("[ab]");
        expect(surroundRange("ab", 0, 2, "braces")!.content).toBe("{ab}");
        expect(surroundRange("ab", 0, 2, "quotes")!.content).toBe('"ab"');
    });

    it("returns null when there is no word to wrap", () => {
        // Offset 2 sits between the two spaces — nothing to grab on either side.
        expect(surroundRange("a  b", 2, 2, "parens")).toBeNull();
    });
});

describe("convertIdentifierCase", () => {
    it("handles the simple whole-word styles", () => {
        expect(convertIdentifierCase("abc", "upper")).toBe("ABC");
        expect(convertIdentifierCase("ABC", "lower")).toBe("abc");
        expect(convertIdentifierCase("hello world", "title")).toBe("Hello World");
    });

    it("splits camelCase on case boundaries and rejoins per style", () => {
        expect(convertIdentifierCase("fooBarBaz", "snake")).toBe("foo_bar_baz");
        expect(convertIdentifierCase("fooBarBaz", "kebab")).toBe("foo-bar-baz");
        expect(convertIdentifierCase("fooBarBaz", "constant")).toBe("FOO_BAR_BAZ");
        expect(convertIdentifierCase("foo bar baz", "pascal")).toBe("FooBarBaz");
        expect(convertIdentifierCase("Foo bar baz", "camel")).toBe("fooBarBaz");
    });

    it("handles consecutive capitals (HTTPResponse → http_response)", () => {
        expect(convertIdentifierCase("HTTPResponse", "snake")).toBe("http_response");
    });

    it("returns null for no-op conversions and word-less identifiers", () => {
        expect(convertIdentifierCase("abc", "lower")).toBeNull();
        expect(convertIdentifierCase("___", "snake")).toBeNull();
        expect(convertIdentifierCase("", "upper")).toBeNull();
    });
});

describe("lineTextAt / runSelectionText", () => {
    it("extracts the full line containing the offset", () => {
        expect(lineTextAt(SRC, 0)).toBe("import os");
        // SRC's line 5 is the indented return (lines 2–3 are blank).
        expect(lineTextAt(SRC, offsetOfLine(5))).toBe("    return x + 1");
        // The offset AT the final newline still belongs to the line it ends.
        expect(lineTextAt(SRC, SRC.length - 1)).toBe("y = f(2)");
    });

    it("runs the selection when one exists, else the caret's line (trimmed)", () => {
        const start = SRC.indexOf("return");
        expect(runSelectionText(SRC, start, start + 6)).toBe("return");
        expect(runSelectionText(SRC, start, start)).toBe("return x + 1");
        expect(runSelectionText(SRC, offsetOfLine(2), offsetOfLine(2))).toBe("");
    });
});

describe("literal replace", () => {
    it("escapes regex metacharacters", () => {
        expect(escapeRegExpLiteral("a.b*c")).toBe("a\\.b\\*c");
        expect(escapeRegExpLiteral("(x) [y] {z}")).toBe("\\(x\\) \\[y\\] \\{z\\}");
    });

    it("replaces every case-insensitive literal occurrence", () => {
        expect(replaceAllLiteral("Foo foo FOO", "foo", "bar")).toBe("bar bar bar");
        expect(replaceAllLiteral("a.b axb", "a.b", "X")).toBe("X axb");
    });
});
