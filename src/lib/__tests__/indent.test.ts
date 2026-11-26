/**
 * indent.test.ts — unit tests for src/lib/indent.ts.
 *
 * Covers every export of the indentation-settings engine:
 *   - constants (CANONICAL_INDENT_STEP, DEFAULT_INDENT_SETTINGS)
 *   - indentUnitOf — unit string incl. clamping/rounding of bad widths
 *   - getIndentSettings — duck-typed settings extraction
 *   - reindent — canonical 4-space → target conversion (levels, remainders,
 *     blank/whitespace-only lines, no trailing newline, canonical pass-through)
 *   - isReindentableFile — .py / .pyw detection
 *   - detectIndentUnit — tab detection, most-common width, tie → smaller
 *   - autoIndent — arbitrary source unit → target unit conversion
 *   - reindentPython — the syntactic re-indenter: over-indented bodies are
 *     pulled back onto the block-structure grid, multi-line strings stay
 *     verbatim, comments snap to the open-block grid, continuations keep
 *     relative alignment, tab sources are converted.
 *
 * All expectations were derived by hand from the implementation; edge cases
 * (empty strings, tabs vs spaces, missing trailing newline) are included.
 */
import {describe, expect, it} from "vitest";
import {
    autoIndent,
    CANONICAL_INDENT_STEP,
    DEFAULT_INDENT_SETTINGS,
    detectIndentUnit,
    getIndentSettings,
    type IndentSettings,
    indentUnitOf,
    isReindentableFile,
    reindent,
    reindentPython,
} from "@/lib/indent";

const SPACES_2: IndentSettings = {style: "spaces", width: 2};
const SPACES_4: IndentSettings = {style: "spaces", width: 4};
const SPACES_8: IndentSettings = {style: "spaces", width: 8};
const TABS: IndentSettings = {style: "tab", width: 4};

describe("constants", () => {
    it("templates are authored with a 4-space canonical step", () => {
        expect(CANONICAL_INDENT_STEP).toBe(4);
    });

    it("default settings are 2 spaces", () => {
        expect(DEFAULT_INDENT_SETTINGS).toEqual({style: "spaces", width: 2});
    });
});

describe("indentUnitOf", () => {
    it("returns a literal tab for the tab style (width ignored)", () => {
        expect(indentUnitOf(TABS)).toBe("\t");
        expect(indentUnitOf({style: "tab", width: 99})).toBe("\t");
    });

    it("returns the configured number of spaces", () => {
        expect(indentUnitOf(SPACES_2)).toBe("  ");
        expect(indentUnitOf(SPACES_4)).toBe("    ");
        expect(indentUnitOf(SPACES_8)).toBe("        ");
    });

    it("clamps widths into the 1..8 range", () => {
        expect(indentUnitOf({style: "spaces", width: 0})).toBe(" ");
        expect(indentUnitOf({style: "spaces", width: -3})).toBe(" ");
        expect(indentUnitOf({style: "spaces", width: 100})).toBe("        ");
    });

    it("rounds fractional widths and falls back to 2 for non-finite", () => {
        expect(indentUnitOf({style: "spaces", width: 3.4})).toBe("   ");
        expect(indentUnitOf({style: "spaces", width: 3.6})).toBe("    ");
        expect(indentUnitOf({style: "spaces", width: Number.NaN})).toBe("  ");
        expect(indentUnitOf({style: "spaces", width: Number.POSITIVE_INFINITY})).toBe("  ");
    });
});

describe("getIndentSettings", () => {
    it("returns the 2-space default for an empty settings object", () => {
        expect(getIndentSettings({})).toEqual({style: "spaces", width: 2});
    });

    it("maps indentStyle/editorIndentWidth onto the bundle", () => {
        expect(getIndentSettings({indentStyle: "tab"})).toEqual({style: "tab", width: 2});
        expect(getIndentSettings({indentStyle: "spaces", editorIndentWidth: 4})).toEqual({
            style: "spaces",
            width: 4,
        });
        expect(getIndentSettings({editorIndentWidth: 8})).toEqual({style: "spaces", width: 8});
    });

    it("only the exact string 'tab' selects tabs; anything else is spaces", () => {
        expect(getIndentSettings({indentStyle: "bogus" as never})).toEqual({style: "spaces", width: 2});
    });

    it("non-positive / non-finite widths fall back to the default width", () => {
        expect(getIndentSettings({editorIndentWidth: 0})).toEqual({style: "spaces", width: 2});
        expect(getIndentSettings({editorIndentWidth: -5})).toEqual({style: "spaces", width: 2});
        expect(getIndentSettings({editorIndentWidth: Number.NaN})).toEqual({style: "spaces", width: 2});
    });
});

describe("reindent (canonical 4-space → target)", () => {
    it("converts 4-space levels to 2-space levels", () => {
        expect(reindent("def f():\n    pass", SPACES_2)).toBe("def f():\n  pass");
        expect(reindent("def f():\n    if a:\n        return 1", SPACES_2)).toBe(
            "def f():\n  if a:\n    return 1"
        );
    });

    it("converts 4-space levels to tabs", () => {
        expect(reindent("def f():\n    pass", TABS)).toBe("def f():\n\tpass");
        expect(reindent("def f():\n        pass", TABS)).toBe("def f():\n\t\tpass");
    });

    it("converts to 8-space levels", () => {
        // Level 1 (4 canonical spaces) → one 8-space unit.
        expect(reindent("def f():\n    pass", SPACES_8)).toBe("def f():\n        pass");
        // Level 2 (8 canonical spaces) → two 8-space units = 16 spaces.
        expect(reindent("def f():\n        pass", SPACES_8)).toBe("def f():\n                pass");
    });

    it("returns the input unchanged when the target IS the canonical form", () => {
        const weird = "  this is not canonical at all";
        expect(reindent(weird, SPACES_4)).toBe(weird);
    });

    it("preserves remainder spaces (alignment continuations) verbatim", () => {
        // 6 leading spaces = 1 level + 2 remainder → 2 (unit) + 2 (rest) = 4 spaces.
        expect(reindent("      x", SPACES_2)).toBe("    x");
        // 5 leading spaces = 1 level + 1 remainder.
        expect(reindent("     x", SPACES_2)).toBe("   x");
    });

    it("collapses whitespace-only lines to empty", () => {
        expect(reindent("def f():\n    \n    pass", SPACES_2)).toBe("def f():\n\n  pass");
    });

    it("works without a trailing newline and does not add one", () => {
        expect(reindent("def f():\n    pass", SPACES_2)).toBe("def f():\n  pass");
        expect(reindent("def f():\n    pass\n", SPACES_2)).toBe("def f():\n  pass\n");
    });

    it("leaves unindented and tab-indented lines alone (only space leads are canonical)", () => {
        // A tab lead is not matched by the space-lead regex → line passes through.
        expect(reindent("\tprint(1)", SPACES_2)).toBe("\tprint(1)");
        expect(reindent("x = 1", SPACES_2)).toBe("x = 1");
    });

    it("handles the empty string", () => {
        expect(reindent("", SPACES_2)).toBe("");
        expect(reindent("", TABS)).toBe("");
    });
});

describe("isReindentableFile", () => {
    it("accepts .py and .pyw (case-insensitive)", () => {
        expect(isReindentableFile("script.py")).toBe(true);
        expect(isReindentableFile("script.PY")).toBe(true);
        expect(isReindentableFile("script.pyw")).toBe(true);
        expect(isReindentableFile("folder/script.Pyw")).toBe(true);
    });

    it("rejects non-Python files", () => {
        expect(isReindentableFile("notes.md")).toBe(false);
        expect(isReindentableFile("Makefile")).toBe(false);
        expect(isReindentableFile("config.yaml")).toBe(false);
        expect(isReindentableFile("script.pyi")).toBe(false);
        expect(isReindentableFile("py")).toBe(false);
    });
});

describe("detectIndentUnit", () => {
    it("defaults to 4 spaces when nothing is indented (incl. empty input)", () => {
        expect(detectIndentUnit("")).toEqual({style: "spaces", width: 4});
        expect(detectIndentUnit("x = 1\ny = 2")).toEqual({style: "spaces", width: 4});
    });

    it("detects a tab-indented source from a single tab-led line", () => {
        expect(detectIndentUnit("x = 1\n\tprint(1)")).toEqual({style: "tab", width: 1});
    });

    it("picks the most common leading-space run", () => {
        expect(detectIndentUnit("if a:\n  b\n  c")).toEqual({style: "spaces", width: 2});
        expect(detectIndentUnit("if a:\n    b\n    c\n        d")).toEqual({style: "spaces", width: 4});
    });

    it("breaks ties toward the smaller width", () => {
        // One 2-space line and one 4-space line — the smaller wins.
        expect(detectIndentUnit("if a:\n  b\nx = 1\n    y")).toEqual({style: "spaces", width: 2});
    });

    it("clamps the detected width into 1..8", () => {
        // A single 16-space lead (16 > 8 → clamped to 8).
        expect(detectIndentUnit("x:\n                y")).toEqual({style: "spaces", width: 8});
    });
});

describe("autoIndent (arbitrary source → target)", () => {
    it("converts a 4-space source to 2-space target", () => {
        expect(autoIndent("def f():\n    pass", SPACES_2)).toBe("def f():\n  pass");
    });

    it("converts a 2-space source to a 4-space target", () => {
        expect(autoIndent("if a:\n  b", SPACES_4)).toBe("if a:\n    b");
    });

    it("converts a tab source to spaces", () => {
        expect(autoIndent("\tprint(1)", SPACES_2)).toBe("  print(1)");
        expect(autoIndent("def f():\n\t\tpass", SPACES_4)).toBe("def f():\n        pass");
    });

    it("converts a space source to tabs", () => {
        expect(autoIndent("def f():\n    pass", TABS)).toBe("def f():\n\tpass");
    });

    it("returns the input unchanged when source and target units match", () => {
        expect(autoIndent("if a:\n  b", SPACES_2)).toBe("if a:\n  b");
        expect(autoIndent("\tx", TABS)).toBe("\tx");
    });

    it("preserves partial-level spaces (alignment) as remainder spaces", () => {
        // Source unit 4; a 6-space lead = 1 unit + 2 remainder → 2-space target
        // renders "  " + "  " = 4 spaces before c.
        expect(autoIndent("if a:\n    b\n      c", SPACES_2)).toBe("if a:\n  b\n    c");
    });

    it("collapses whitespace-only lines to empty", () => {
        expect(autoIndent("if a:\n  b\n  \n  c", SPACES_4)).toBe("if a:\n    b\n\n    c");
    });

    it("handles the empty string", () => {
        expect(autoIndent("", SPACES_2)).toBe("");
    });
});

describe("reindentPython (syntactic block-structure re-indent)", () => {
    it("pulls an over-indented body back onto the structural grid", () => {
        // The requirement behind body manually indented 8 spaces
        // under a top-level def must land at exactly one target level.
        expect(
            reindentPython('def f():\n        print("a")\n        print("b")\nprint("c")', SPACES_2)
        ).toBe('def f():\n  print("a")\n  print("b")\nprint("c")');
    });

    it("converts a well-formed 4-space file to 2 spaces level by level", () => {
        expect(
            reindentPython(
                "class A:\n    def m(self):\n        if x:\n            return 1\n        return 2",
                SPACES_2
            )
        ).toBe("class A:\n  def m(self):\n    if x:\n      return 1\n    return 2");
    });

    it("emits the interior of multi-line strings VERBATIM (string value is sacred)", () => {
        // The closing quotes keep their original column because that leading
        // whitespace is part of the string's VALUE ("""\n    keep\n      me\n    """).
        expect(
            reindentPython('def f():\n    """\n    keep\n      me\n    """\n    pass', SPACES_2)
        ).toBe('def f():\n  """\n    keep\n      me\n    """\n  pass');
    });

    it("snaps standalone comments onto the open-block grid (clamped)", () => {
        expect(
            reindentPython(
                "def f():\n    # comment at level 1\n    pass\n# top comment",
                SPACES_2
            )
        ).toBe("def f():\n  # comment at level 1\n  pass\n# top comment");
    });

    it("keeps bracket-continuation lines in their RELATIVE alignment", () => {
        expect(reindentPython("def f():\n    x = [\n        1,\n    ]", SPACES_2)).toBe(
            "def f():\n  x = [\n      1,\n  ]"
        );
    });

    it("converts a tab-indented source to the configured spaces", () => {
        expect(reindentPython('def f():\n\tprint("a")', SPACES_2)).toBe('def f():\n  print("a")');
    });

    it("blank lines collapse to empty and no trailing newline is invented", () => {
        expect(reindentPython("def f():\n    pass\n\n\nprint('done')", SPACES_2)).toBe(
            "def f():\n  pass\n\n\nprint('done')"
        );
    });

    it("handles the empty string", () => {
        expect(reindentPython("", SPACES_2)).toBe("");
        expect(reindentPython("", TABS)).toBe("");
    });

    it("does not treat a colon inside a string or comment as a block opener", () => {
        const src = 'def f():\n    s = "not: a header"\n    # comment: with colon\n    pass';
        expect(reindentPython(src, SPACES_2)).toBe(
            'def f():\n  s = "not: a header"\n  # comment: with colon\n  pass'
        );
    });
});
