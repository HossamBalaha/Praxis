/**
 * Unit tests for the fold-to-view math (src/lib/fold-view.ts) — the
 * display-text builder, placeholder rows and fold-key mapper
 * extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {buildFoldedView, buildFoldKeyMapper, foldPlaceholderLine,} from "@/lib/fold-view";
import type {PythonSymbol} from "@/lib/python-symbols";

function sym(
    line: number,
    endLine: number,
    type: PythonSymbol["type"],
    name: string,
    args?: string
): PythonSymbol {
    return {line, endLine, type, name, args, indent: 0} as PythonSymbol;
}

describe("buildFoldedView", () => {
    it("returns the source unchanged when folding is off or nothing is folded", () => {
        const code = "def f():\n    return 1\n";
        const symbols = [sym(1, 2, "function", "f")];
        expect(buildFoldedView(code, symbols, new Set(), true)).toBe(code);
        expect(buildFoldedView(code, symbols, new Set([1]), false)).toBe(code);
    });

    it("drops the folded body and renders one placeholder after the def line", () => {
        const code = "x = 1\ndef f():\n    a = 1\n    b = 2\ny = 2";
        const symbols = [sym(2, 4, "function", "f", "x")];
        const out = buildFoldedView(code, symbols, new Set([2]), true);
        const rows = out.split("\n");
        expect(rows).toHaveLength(4);
        expect(rows[0]).toBe("x = 1");
        expect(rows[1]).toBe("def f():");
        expect(rows[2]).toContain("# ▸ def f(x) … (2 lines hidden — click to expand)");
        expect(rows[3]).toBe("y = 2");
    });

    it("keeps multiple folded symbols in one pass", () => {
        const code = "def a():\n    1\ndef b():\n    2\n";
        const symbols = [sym(1, 2, "function", "a"), sym(3, 4, "function", "b")];
        const out = buildFoldedView(code, symbols, new Set([1, 3]), true);
        const rows = out.split("\n");
        // def a, placeholder, def b, placeholder + the phantom trailing row.
        expect(rows).toHaveLength(5);
        expect(rows[1]).toContain("# ▸ def a()");
        expect(rows[3]).toContain("# ▸ def b()");
        expect(rows[4]).toBe("");
    });

    it("only folds symbols whose def line is actually folded", () => {
        const code = "def a():\n    1\ndef b():\n    2\n";
        const symbols = [sym(1, 2, "function", "a"), sym(3, 4, "function", "b")];
        const out = buildFoldedView(code, symbols, new Set([3]), true);
        expect(out).toContain("    1");
        expect(out).not.toContain("    2");
    });
});

describe("foldPlaceholderLine", () => {
    it("echoes functions with their args", () => {
        expect(foldPlaceholderLine(sym(1, 10, "function", "compute", "a, b"))).toBe(
            "    # ▸ def compute(a, b) … (9 lines hidden — click to expand)"
        );
    });

    it("echoes methods like functions and classes by name only", () => {
        expect(foldPlaceholderLine(sym(1, 5, "method", "run", "self"))).toContain("# ▸ def run(self)");
        expect(foldPlaceholderLine(sym(1, 5, "class", "Config"))).toContain("# ▸ class Config");
    });

    it("maps the remaining symbol kinds to readable labels", () => {
        expect(foldPlaceholderLine(sym(1, 3, "loop", "for"))).toContain("# ▸ loop for");
        expect(foldPlaceholderLine(sym(1, 3, "conditional", "if"))).toContain("# ▸ if/elif if");
        expect(foldPlaceholderLine(sym(1, 3, "try", "try"))).toContain("# ▸ try try");
        expect(foldPlaceholderLine(sym(1, 3, "with", "with"))).toContain("# ▸ with with");
        expect(foldPlaceholderLine(sym(1, 3, "else", "else"))).toContain("# ▸ else else");
        expect(foldPlaceholderLine(sym(1, 3, "except", "except"))).toContain("# ▸ except except");
        expect(foldPlaceholderLine(sym(1, 3, "finally", "finally"))).toContain("# ▸ finally finally");
    });

    it("caps a long symbol name at 60 chars", () => {
        const long = "n".repeat(80);
        const line = foldPlaceholderLine(sym(1, 3, "class", long));
        expect(line).toContain(long.slice(0, 60));
        expect(line).not.toContain(long);
    });
});

describe("buildFoldKeyMapper", () => {
    it("keys unique names as type:name (folds survive line shifts)", () => {
        const mapper = buildFoldKeyMapper([sym(1, 2, "function", "f"), sym(5, 6, "class", "C")]);
        expect(mapper(sym(1, 2, "function", "f"))).toBe("function:f");
        expect(mapper(sym(5, 6, "class", "C"))).toBe("class:C");
    });

    it("disambiguates repeated type:name pairs with the line number", () => {
        const mapper = buildFoldKeyMapper([
            sym(10, 12, "else", "else"),
            sym(42, 44, "else", "else"),
        ]);
        expect(mapper(sym(10, 12, "else", "else"))).toBe("else:else#10");
        expect(mapper(sym(42, 44, "else", "else"))).toBe("else:else#42");
    });

    it("counts per type:name, not per name (same name, different types stay unique)", () => {
        const mapper = buildFoldKeyMapper([sym(1, 2, "function", "x"), sym(5, 6, "class", "x")]);
        expect(mapper(sym(1, 2, "function", "x"))).toBe("function:x");
        expect(mapper(sym(5, 6, "class", "x"))).toBe("class:x");
    });
});
