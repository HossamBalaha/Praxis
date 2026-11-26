/**
 * symbol-matching.test.ts — unit tests for src/lib/symbol-matching.ts.
 *
 * Covers the three layers the project-wide rename relies on:
 *   - isPythonSourceFile: bare names + nested forward-slash paths
 *   - findWholeWordMatches: exact-case, whole-word boundary rules
 *   - findSymbolOccurrences: Python comment/string classification
 *     (code vs comment vs string, via the spell-scanner spans),
 *     def/class site detection (via the python-symbols index), line/col
 *     mapping, and the non-Python "text" fallback
 *   - applyOccurrences: right-to-left splicing, overlap tolerance,
 *     no-op on empty input
 *   - defaultOccurrenceSelected / summarizeOccurrences defaults
 */
import {describe, expect, it} from "vitest";
import {
    applyOccurrences,
    defaultOccurrenceSelected,
    findSymbolOccurrences,
    findWholeWordMatches,
    isPythonSourceFile,
    summarizeOccurrences,
} from "@/lib/symbol-matching";

describe("isPythonSourceFile", () => {
    it("accepts .py and .pyw basenames", () => {
        expect(isPythonSourceFile("utils.py")).toBe(true);
        expect(isPythonSourceFile("GUI.pyw")).toBe(true);
        expect(isPythonSourceFile("PY.PY")).toBe(true);
    });

    it("accepts nested forward-slash relative paths", () => {
        expect(isPythonSourceFile("LevelOne/LevelTwo/LevelTwoScript.py")).toBe(true);
        expect(isPythonSourceFile("LevelOne/LevelTwo/notes.md")).toBe(false);
    });

    it("rejects non-Python and degenerate inputs", () => {
        expect(isPythonSourceFile("notes.md")).toBe(false);
        expect(isPythonSourceFile("script.js")).toBe(false);
        expect(isPythonSourceFile("")).toBe(false);
    });
});

describe("findWholeWordMatches", () => {
    it("matches only whole-word, exact-case occurrences", () => {
        const src = "total totalizer Total total_x obj.total total";
        const m = findWholeWordMatches(src, "total");
        // totalizer / Total / total_x are excluded. `obj.total` IS a
        // candidate: the dot delimits the word — an attribute ACCESS the
        // rename preview surfaces (and the user can uncheck), which is
        // exactly the behavior a symbol rename should have.
        expect(m).toEqual([
            {start: 0, end: 5},
            {start: 34, end: 39},
            {start: 40, end: 45},
        ]);
    });

    it("matches at both string edges without boundary chars", () => {
        expect(findWholeWordMatches("total", "total")).toEqual([{start: 0, end: 5}]);
        expect(findWholeWordMatches("totalx", "total")).toEqual([]);
        expect(findWholeWordMatches("xtotal", "total")).toEqual([]);
    });

    it("returns [] for empty inputs", () => {
        expect(findWholeWordMatches("", "total")).toEqual([]);
        expect(findWholeWordMatches("abc", "")).toEqual([]);
    });
});

describe("findSymbolOccurrences (Python)", () => {
    const SRC = [
        "def total(a, b):",
        "    return a + b",
        "",
        "result = total(1, 2)",
        "total_copies = 3  # total mentioned in a comment",
        'log = "total was here"',
        "class total:",
        "    pass",
    ].join("\n");

    it("classifies code, comment and string occurrences", () => {
        const occs = findSymbolOccurrences(SRC, "total", "mod.py");
        expect(occs).toHaveLength(5);
        // def site (line 1), call site (line 4), comment (line 5), string
        // (line 6), class site (line 7) — total_copies is a longer
        // identifier, excluded.
        const contexts = occs.map((o) => o.context);
        expect(contexts).toEqual(["code", "code", "comment", "string", "code"]);
        expect(occs.map((o) => o.line)).toEqual([1, 4, 5, 6, 7]);
    });

    it("marks def and class declaration sites", () => {
        const occs = findSymbolOccurrences(SRC, "total", "mod.py");
        expect(occs[0].defSite).toBe(true);   // def total(
        expect(occs[1].defSite).toBe(false);   // call site
        expect(occs[4].defSite).toBe(true);    // class total:
    });

    it("computes 1-based line and column of each occurrence", () => {
        const occs = findSymbolOccurrences(SRC, "total", "mod.py");
        const call = occs[1];
        expect(call.line).toBe(4);
        expect(call.col).toBe(10); // "result = total(1, 2)" → col of 'total'
        expect(call.lineText).toBe("result = total(1, 2)");
        const cmt = occs[2];
        expect(cmt.line).toBe(5);
        expect(cmt.col).toBe(21); // after "# "
    });

    it("a name in args but not the declared name is NOT a def site", () => {
        const occs = findSymbolOccurrences("def foo(foo=foo):\n    pass", "foo", "x.py");
        expect(occs).toHaveLength(3);
        expect(occs[0].defSite).toBe(true);   // the declared name
        expect(occs[1].defSite).toBe(false);  // default value
        expect(occs[2].defSite).toBe(false);  // default expression
    });

    it("honors triple-quoted strings spanning lines", () => {
        const src = '"""total\ntotal\n"""\ntotal';
        const occs = findSymbolOccurrences(src, "total", "x.py");
        // The two inside the docstring are string; the last one is code.
        expect(occs.map((o) => o.context)).toEqual(["string", "string", "code"]);
    });

    it("honors async def declaration sites", () => {
        const occs = findSymbolOccurrences("async def fetch():\n    fetch()", "fetch", "x.py");
        expect(occs[0].defSite).toBe(true);
        expect(occs[1].defSite).toBe(false);
    });
});

describe("findSymbolOccurrences (non-Python)", () => {
    it("uses exact-case whole-word matching with context text", () => {
        const occs = findSymbolOccurrences("total and Total but not total_x", "total", "notes.md");
        expect(occs).toHaveLength(1);
        expect(occs[0].context).toBe("text");
        expect(occs[0].defSite).toBe(false);
        expect(occs[0].line).toBe(1);
        expect(occs[0].col).toBe(1);
    });
});

describe("applyOccurrences", () => {
    it("replaces exactly the given occurrences", () => {
        const src = "a total b total c total";
        const occs = findSymbolOccurrences(src, "total", "x.py");
        // Replace only the FIRST occurrence.
        const out = applyOccurrences(src, [occs[0]], "sum");
        expect(out).toBe("a sum b total c total");
        // Replace ALL.
        expect(applyOccurrences(src, occs, "sum")).toBe("a sum b sum c sum");
    });

    it("returns the source unchanged for an empty occurrence list", () => {
        expect(applyOccurrences("x = 1", [], "y")).toBe("x = 1");
    });

    it("tolerates overlapping/out-of-range entries by skipping them", () => {
        const src = "ab";
        const out = applyOccurrences(src, [
            {start: 0, end: 1},
            {start: 0, end: 2},
            {start: 99, end: 100},
        ], "X");
        // Only the FIRST (right-most, non-overlapping) edit applies.
        expect(out).toBe("Xb");
    });
});

describe("defaultOccurrenceSelected + summarizeOccurrences", () => {
    it("code/text default ON, comment/string default OFF", () => {
        expect(defaultOccurrenceSelected({context: "code"})).toBe(true);
        expect(defaultOccurrenceSelected({context: "text"})).toBe(true);
        expect(defaultOccurrenceSelected({context: "comment"})).toBe(false);
        expect(defaultOccurrenceSelected({context: "string"})).toBe(false);
    });

    it("summarizes by context and counts def sites", () => {
        const occs = findSymbolOccurrences(
            "def total():\n    # total\n    return 'total' + total()",
            "total",
            "x.py",
        );
        const sum = summarizeOccurrences(occs);
        expect(sum).toEqual({code: 2, comment: 1, string: 1, text: 0, defSites: 1});
    });
});
