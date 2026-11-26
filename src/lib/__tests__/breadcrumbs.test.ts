/**
 * breadcrumbs.test.ts — unit tests for src/lib/breadcrumbs.ts.
 *
 * Covered: the indent-stack derivation of the symbol path (module >
 * class > function) from the shared parsePythonSymbols index:
 *   · caret inside a class method → module › class › method()
 *   · caret inside a top-level def → module › fn()
 *   · caret above the first definition → module only
 *   · a later same-indent def pops the earlier one (stack discipline)
 *   · nested def-in-def chains both frames
 *   · block symbols (for/if/try…) never enter the path
 *   · tab-indented methods (indent in SPACE units after expansion)
 *   · null caretLine / empty symbol list → module-only bar
 *   · moduleCrumb basenames for Windows backslash paths
 */
import {describe, expect, it} from "vitest";
import {parsePythonSymbols} from "@/lib/python-symbols";
import {moduleCrumb, symbolPathAtLine} from "@/lib/breadcrumbs";

const SYNTHETIC = [
    '"""Module docstring."""',
    "import os",
    "",
    "def top_level(a, b=2):",
    "    for i in range(10):",
    "        print(i)",
    "    return a + b",
    "",
    "class Greeter:",
    "    def hello(self, name):",
    "        return f'Hello {name}'",
    "    def goodbye(self):",
    "        return 'bye'",
    "",
    "def bottom_level():",
    "    def inner():",
    "        pass",
    "    return inner()",
].join("\n");

describe("symbolPathAtLine", () => {
    const symbols = parsePythonSymbols(SYNTHETIC);

    it("shows only the module above the first definition", () => {
        const path = symbolPathAtLine(symbols, 2, "app.py");
        expect(path.map((c) => c.label)).toEqual(["app.py"]);
    });

    it("wraps a top-level function (block statements excluded)", () => {
        // Line 5 is the `for` INSIDE top_level — the for/prints must not
        // enter the path; only module › top_level().
        const path = symbolPathAtLine(symbols, 5, "app.py");
        expect(path.map((c) => c.label)).toEqual(["app.py", "top_level()"]);
    });

    it("wraps a class method with the class in between", () => {
        const path = symbolPathAtLine(symbols, 11, "app.py");
        expect(path.map((c) => c.label)).toEqual(["app.py", "Greeter", "hello()"]);
        expect(path.map((c) => c.kind)).toEqual(["module", "class", "method"]);
        // Crumbs jump to the DEFINITION line, not the caret line.
        expect(path[2].line).toBe(10);
    });

    it("switches to the later method inside the same class", () => {
        const path = symbolPathAtLine(symbols, 13, "app.py");
        expect(path.map((c) => c.label)).toEqual(["app.py", "Greeter", "goodbye()"]);
    });

    it("pops the class when a later top-level def starts", () => {
        // Line 15 is the `def bottom_level():` line itself — the caret is
        // ON the def, which counts as inside it (line <= caretLine).
        const path = symbolPathAtLine(symbols, 15, "app.py");
        expect(path.map((c) => c.label)).toEqual(["app.py", "bottom_level()"]);
    });

    it("keeps nested def-in-def frames", () => {
        const path = symbolPathAtLine(symbols, 17, "app.py");
        expect(path.map((c) => c.label)).toEqual([
            "app.py",
            "bottom_level()",
            "inner()",
        ]);
    });

    it("carries the underlying symbol for callback consumers", () => {
        const path = symbolPathAtLine(symbols, 11, "app.py");
        expect(path[2].symbol?.name).toBe("hello");
        expect(path[0].symbol).toBeUndefined();
    });

    it("returns module-only for a null/zero caret line", () => {
        expect(symbolPathAtLine(symbols, null, "app.py").map((c) => c.label)).toEqual(["app.py"]);
        expect(symbolPathAtLine(symbols, 0, "app.py").map((c) => c.label)).toEqual(["app.py"]);
    });

    it("returns [] with no file name to anchor on", () => {
        expect(symbolPathAtLine(symbols, 11, undefined)).toEqual([]);
        expect(symbolPathAtLine(symbols, 11, "  ")).toEqual([]);
    });

    it("sorts an unsorted symbol list before the stack walk", () => {
        const shuffled = [...symbols].reverse();
        const path = symbolPathAtLine(shuffled, 11, "app.py");
        expect(path.map((c) => c.label)).toEqual(["app.py", "Greeter", "hello()"]);
    });

    it("handles tab-indented classes and methods (indent in space units)", () => {
        const tabby = parsePythonSymbols(
            ["class T:", "\tdef m(self):", "\t\tpass"].join("\n")
        );
        const path = symbolPathAtLine(tabby, 3, "t.py");
        expect(path.map((c) => c.label)).toEqual(["t.py", "T", "m()"]);
    });
});

describe("moduleCrumb", () => {
    it("takes the basename across both separators", () => {
        expect(moduleCrumb("demo.py")?.label).toBe("demo.py");
        expect(moduleCrumb("F:\\Praxis\\demo.py")?.label).toBe("demo.py");
        expect(moduleCrumb("/home/u/demo.py")?.label).toBe("demo.py");
    });
    it("returns null without a usable name", () => {
        expect(moduleCrumb(undefined)).toBeNull();
        expect(moduleCrumb("")).toBeNull();
        expect(moduleCrumb("   ")).toBeNull();
    });
});
