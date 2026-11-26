/**
 * py-imports.test.ts — unit tests for src/lib/py-imports.ts.
 *
 * Covers the ModuleNotFoundError text scanner (single/double quotes,
 * dotted submodules, several errors in one output, non-error text)
 * and the import-statement scanner (plain/from/aliased imports,
 * dotted targets, relative imports, parenthesized continuations,
 * comments and docstrings must be ignored) plus the stdlib allowlist
 * filter and the pip-name guard.
 */
import {describe, expect, it} from "vitest";
import {
    allMissingModules,
    isStdlibModule,
    isValidPipName,
    missingModuleFrom,
    parsePythonImports,
    suggestMissingImports,
} from "@/lib/py-imports";

describe("missingModuleFrom (run-output scanner)", () => {
    it("extracts the module from a canonical traceback", () => {
        expect(missingModuleFrom("ModuleNotFoundError: No module named 'numpy'")).toBe("numpy");
        expect(missingModuleFrom('ImportError: No module named "pandas"')).toBe("pandas");
    });

    it("finds the error inside full traceback text", () => {
        const tb = [
            "Traceback (most recent call last):",
            '  File "script.py", line 1, in <module>',
            "    import requests",
            "ModuleNotFoundError: No module named 'requests'",
        ].join("\n");
        expect(missingModuleFrom(tb)).toBe("requests");
    });

    it("installs the TOP-LEVEL package of a dotted import", () => {
        expect(missingModuleFrom("No module named 'sklearn.model_selection'")).toBe("sklearn");
    });

    it("collects every distinct missing module in order", () => {
        const out = allMissingModules(
            "No module named 'numpy'\n...No module named 'numpy'\nNo module named 'scipy.stats'"
        );
        expect(out).toEqual(["numpy", "scipy"]);
    });

    it("returns null for non-matching text", () => {
        expect(missingModuleFrom("SyntaxError: invalid syntax")).toBeNull();
        expect(missingModuleFrom("")).toBeNull();
        expect(missingModuleFrom("ModuleNotFoundError-ish prose")).toBeNull();
        expect(allMissingModules("all good")).toEqual([]);
    });
});

describe("parsePythonImports (statement scanner)", () => {
    it("collects plain, aliased, and comma-separated imports", () => {
        const imps = parsePythonImports("import os\nimport numpy as np, pandas\n");
        expect(imps.map((i) => i.module)).toEqual(["os", "numpy", "pandas"]);
        expect(imps.every((i) => i.kind === "import")).toBe(true);
        expect(imps[1].lineno).toBe(2);
    });

    it("reduces from-import targets to the top-level module", () => {
        const imps = parsePythonImports("from sklearn.model_selection import train_test_split\n");
        expect(imps).toEqual([
            {module: "sklearn", lineno: 1, kind: "from", relative: false},
        ]);
    });

    it("marks relative imports and keeps them out of install lists", () => {
        const imps = parsePythonImports("from . import sibling\nfrom ..pkg import x\n");
        expect(imps).toHaveLength(2);
        expect(imps.every((i) => i.relative)).toBe(true);
        expect(suggestMissingImports("from . import sibling\nfrom ..pkg import x\n")).toEqual([]);
    });

    it("consumes parenthesized multi-line from-imports", () => {
        const src = [
            "from matplotlib import (",
            "    pyplot,",
            "    cm,",
            ")",
            "import json",
        ].join("\n");
        const imps = parsePythonImports(src);
        expect(imps.map((i) => i.module)).toEqual(["matplotlib", "json"]);
        // The continuation lines are consumed — json lands on line 5.
        expect(imps[1].lineno).toBe(5);
    });

    it("ignores comments", () => {
        const imps = parsePythonImports("# import flask\nimport os  # import django\n");
        expect(imps.map((i) => i.module)).toEqual(["os"]);
    });

    it("ignores triple-quoted docstrings (single and multi-line)", () => {
        const src = [
            '"""',
            "Docs that say import torch for GPU support.",
            '"""',
            "import math",
            "def f():",
            "    '''inner: import seaborn here'''",
            "    return 1",
            "import csv",
        ].join("\n");
        expect(parsePythonImports(src).map((i) => i.module)).toEqual(["math", "csv"]);
    });

    it("handles a hash inside a string literal without dropping the line", () => {
        const src = 'x = "not # a comment"\nimport arrow\n';
        expect(parsePythonImports(src).map((i) => i.module)).toEqual(["arrow"]);
    });

    it("never throws on odd input", () => {
        expect(parsePythonImports("")).toEqual([]);
        expect(parsePythonImports("import\nfrom import\n=import 3")).toEqual([]);
    });
});

describe("suggestMissingImports (heuristic allowlist filter)", () => {
    it("flags non-stdlib imports, skips stdlib ones", () => {
        const src = [
            "import os, sys",
            "import numpy",
            "from sklearn.model_selection import train_test_split",
            "import pandas as pd",
        ].join("\n");
        expect(suggestMissingImports(src)).toEqual([
            {module: "numpy", lineno: 2},
            {module: "sklearn", lineno: 3},
            {module: "pandas", lineno: 4},
        ]);
    });

    it("deduplicates repeated imports (first line wins)", () => {
        const src = "import requests\nimport requests\nfrom requests import get\n";
        expect(suggestMissingImports(src)).toEqual([{module: "requests", lineno: 1}]);
    });

    it("knows the stdlib allowlist", () => {
        for (const m of ["os", "sys", "json", "csv", "pathlib", "statistics", "zoneinfo"]) {
            expect(isStdlibModule(m)).toBe(true);
        }
        for (const m of ["numpy", "pandas", "flask", "torch"]) {
            expect(isStdlibModule(m)).toBe(false);
        }
    });

    it("keeps __future__ out of the suggestions", () => {
        expect(suggestMissingImports("from __future__ import annotations\n")).toEqual([]);
    });
});

describe("isValidPipName (injection guard)", () => {
    it("accepts ordinary package names", () => {
        for (const n of ["numpy", "scikit-learn", "Pillow", "typing_extensions", "a.b"]) {
            expect(isValidPipName(n)).toBe(true);
        }
    });

    it("rejects flags, shell metacharacters, and empties", () => {
        for (const n of ["--no-deps", "-r", "", "a;b", "a|b", "$(x)", "a b", "../etc", "a\nb"]) {
            expect(isValidPipName(n)).toBe(false);
        }
    });
});
