/**
 * python-symbols.test.ts — unit tests for src/lib/python-symbols.ts.
 *
 * The lightweight regex-based symbol parser powers the symbol palette and
 * the code viewer's folding. Covered:
 *   - parsePythonSymbols on a synthetic file containing: a top-level def
 *     with a multi-line docstring, a class with a docstring and space- and
 *     tab-indented methods, a nested for/if inside the def — asserting the
 *     name / type / line / indent / args / docstring / endLine fields
 *   - tab expansion in the indent field (a tab counts as 4 columns)
 *   - method vs function classification (a def inside a def is NOT a method)
 *   - async def support
 *   - try/except/finally block symbols
 *   - empty / comment-only sources
 *   - formatSymbol for a function with args, a method, a class, and a
 *     block statement (the full stripped line is the display text)
 */
import {describe, expect, it} from "vitest";
import {formatSymbol, parsePythonSymbols} from "@/lib/python-symbols";

const SYNTHETIC = [
    '"""Module docstring."""',
    "import os",
    "",
    "def top_level(a, b=2):",
    '    """Does something.',
    "",
    "    More details.",
    '    """',
    "    for i in range(10):",
    "        if i % 2 == 0:",
    "            print(i)",
    "    return a + b",
    "",
    "class Greeter:",
    '    """Greets people."""',
    "    def hello(self, name):",
    '        return f"Hello {name}"',
    "\tdef tabby(self):",
    "\t\tpass",
].join("\n");

describe("parsePythonSymbols", () => {
    const symbols = parsePythonSymbols(SYNTHETIC);

    it("returns symbols in source order", () => {
        expect(symbols.map((s) => s.name)).toEqual([
            "top_level",
            "for i in range(10):",
            "if i % 2 == 0:",
            "Greeter",
            "hello",
            "tabby",
        ]);
    });

    it("parses a top-level def with args, docstring, line and indent", () => {
        const fn = symbols[0];
        expect(fn).toMatchObject({
            name: "top_level",
            type: "function",
            line: 4,
            indent: 0,
            args: "a, b=2",
            docstring: "Does something.",
        });
        // The block ends right before the class on line 14 (1-indexed 13).
        expect(fn.endLine).toBe(13);
    });

    it("parses the class and classifies its defs as methods", () => {
        const cls = symbols.find((s) => s.name === "Greeter")!;
        expect(cls).toMatchObject({
            name: "Greeter",
            type: "class",
            line: 14,
            indent: 0,
            docstring: "Greets people.",
        });
        // The class block extends to the end of the file.
        expect(cls.endLine).toBe(19);
    });

    it("classifies space-indented methods with their args", () => {
        const hello = symbols.find((s) => s.name === "hello")!;
        expect(hello).toMatchObject({
            type: "method",
            line: 16,
            indent: 4,
            args: "self, name",
        });
        // hello's block ends right before the tabby def (line 18 → endLine 17).
        expect(hello.endLine).toBe(17);
        // No docstring — the first following line is a return statement.
        expect(hello.docstring).toBeUndefined();
    });

    it("expands tabs in the indent field (tab = 4 columns)", () => {
        const tabby = symbols.find((s) => s.name === "tabby")!;
        expect(tabby).toMatchObject({
            type: "method",
            line: 18,
            indent: 4, // one literal tab → 4 space units
            args: "self",
        });
        expect(tabby.docstring).toBeUndefined();
    });

    it("surfaces nested loops and conditionals with full-line names", () => {
        const loop = symbols.find((s) => s.type === "loop")!;
        expect(loop).toMatchObject({
            name: "for i in range(10):",
            type: "loop",
            line: 9,
            indent: 4,
        });
        // The for block ends before `return a + b` on line 12 (→ endLine 11).
        expect(loop.endLine).toBe(11);

        const cond = symbols.find((s) => s.type === "conditional")!;
        expect(cond).toMatchObject({
            name: "if i % 2 == 0:",
            type: "conditional",
            line: 10,
            indent: 8,
        });
    });

    it("does not treat the module docstring or imports as symbols", () => {
        expect(symbols.some((s) => s.name.includes("Module docstring"))).toBe(false);
        expect(symbols.some((s) => s.name === "os")).toBe(false);
    });

    it("returns [] for empty and comment-only sources", () => {
        expect(parsePythonSymbols("")).toEqual([]);
        expect(parsePythonSymbols("# a comment\n# another")).toEqual([]);
    });

    it("a def nested inside a def is a function, NOT a method (no class ancestor)", () => {
        const syms = parsePythonSymbols("def outer():\n    def inner():\n        pass");
        expect(syms).toHaveLength(2);
        expect(syms[0]).toMatchObject({name: "outer", type: "function", indent: 0});
        expect(syms[1]).toMatchObject({name: "inner", type: "function", indent: 4, args: ""});
    });

    it("supports async def", () => {
        const syms = parsePythonSymbols("async def fetch():\n    pass");
        expect(syms).toHaveLength(1);
        expect(syms[0]).toMatchObject({name: "fetch", type: "function", line: 1, indent: 0});
    });

    it("parses try / except / finally blocks", () => {
        const syms = parsePythonSymbols(
            "try:\n    pass\nexcept ValueError:\n    pass\nfinally:\n    pass"
        );
        expect(syms.map((s) => s.type)).toEqual(["try", "except", "finally"]);
        expect(syms[1].name).toBe("except ValueError:");
    });

    it("skips defs written as string content (regex anchored to line start)", () => {
        const syms = parsePythonSymbols('x = "def not_a_def():"');
        expect(syms).toEqual([]);
    });
});

describe("formatSymbol", () => {
    it("formats a function with its argument list", () => {
        expect(
            formatSymbol({name: "top_level", type: "function", line: 4, indent: 0, args: "a, b=2"})
        ).toBe("def top_level(a, b=2)");
    });

    it("formats a method the same way as a function", () => {
        expect(
            formatSymbol({name: "hello", type: "method", line: 16, indent: 4, args: "self, name"})
        ).toBe("def hello(self, name)");
    });

    it("omits the parens content when args is undefined", () => {
        expect(formatSymbol({name: "noargs", type: "function", line: 1, indent: 0})).toBe(
            "def noargs()"
        );
    });

    it("formats classes without parens", () => {
        expect(formatSymbol({name: "Greeter", type: "class", line: 14, indent: 0})).toBe(
            "class Greeter"
        );
    });

    it("returns the full stripped line for block statements", () => {
        expect(formatSymbol({name: "for i in range(10):", type: "loop", line: 9, indent: 4})).toBe(
            "for i in range(10):"
        );
        expect(formatSymbol({name: "try:", type: "try", line: 1, indent: 0})).toBe("try:");
    });
});
