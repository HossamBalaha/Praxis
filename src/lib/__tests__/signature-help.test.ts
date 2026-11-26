/**
 * signature-help.test.ts — unit tests for src/lib/signature-help.ts
 * (the scanner extracted from code-viewer.tsx in Phase 3).
 *
 * Fixture convention: a literal `|` marks the caret's index in the
 * source string (the caret sits ON the marker, i.e. `pos` = the
 * marker's index); def symbols carry the line their def sits on, and
 * resolution is only offered for defs on lines BEFORE the call — so
 * call fixtures live on a later line than their defs.
 *
 * Proves the popup's decision ladder:
 *   - caret inside a call → the callee, its args and the ACTIVE
 *     argument index
 *   - string literals and nested brackets never advance the argument
 *   - the LAST def before the call line wins (redefinition aware)
 *   - builtins resolve when no local def exists
 *   - no enclosing paren / unknown callee / non-identifier callees → null
 */
import {describe, expect, it} from "vitest";
import {BUILTIN_SIGS, resolveSignatureHelp} from "@/lib/signature-help";
import type {PythonSymbol} from "@/lib/python-symbols";

/** A def symbol helper for the resolution tests. */
function defSym(name: string, line: number, args?: string, docstring?: string): PythonSymbol {
    return {name, type: "function", line, indent: 0, args, docstring};
}

describe("resolveSignatureHelp", () => {
    it("resolves the callee and the active argument inside a call", () => {
        // A def on line 1, the call on line 3, caret after the "2".
        const src = "def compute(x, y):\n    pass\nresult = compute(1, 2)";
        // The caret sits just after the "2" (offset 49).
        const r = resolveSignatureHelp(src, 49, [defSym("compute", 1, "x, y", "Adds two numbers.")]);
        // The callee + signature; the comma after `1` advanced to arg 1.
        expect(r).toMatchObject({name: "compute", args: "x, y", activeArg: 1, line: 3, col: 22});
        // The docstring resolved from the def.
        expect(r!.docstring).toBe("Adds two numbers.");
    });

    it("resolves dotted callees to their final segment", () => {
        // math.sqrt(4) on line 3; a local `sqrt` def (line 1) backs the
        // lookup so the dotted mechanics are observable.
        const src = "def sqrt(x):\n    pass\ny = math.sqrt(4)";
        // The caret after the 4 (offset 37).
        const r = resolveSignatureHelp(src, 37, [defSym("sqrt", 1, "x")]);
        // The dotted name is kept; the lookup used "sqrt" (its args won).
        expect(r).toMatchObject({name: "math.sqrt", args: "x"});
    });

    it("skips commas inside strings and nested brackets", () => {
        // A first argument containing a comma inside a string, then a
        // bracketed comma, then the caret after the third argument.
        const src = 'def f(a, b, c):\n    pass\nf("a,b", [1, 2], 3)';
        // The caret after the 3 (offset 43).
        const r = resolveSignatureHelp(src, 43, [defSym("f", 1, "a, b, c")]);
        // Only the two top-level commas advanced the count.
        expect(r!.activeArg).toBe(2);
        // A caret inside the string argument (right after the "b").
        const inString = src.indexOf("a,b") + 3;
        // Still the first argument.
        const r2 = resolveSignatureHelp(src, inString, [defSym("f", 1, "a, b")]);
        expect(r2!.activeArg).toBe(0);
    });

    it("prefers the LAST def before the call line (redefinition aware)", () => {
        // Two defs of the same name before the call, one AFTER it.
        const src = [
            "def f(a):",
            "    pass",
            "def f(b, c):",
            "    pass",
            "f(1, 2|)",
            "def f(z):",
            "    pass",
        ].join("\n");
        // The caret after "2".
        const r = resolveSignatureHelp(src, src.indexOf("2|") + 1, [
            defSym("f", 1, "a"),
            defSym("f", 3, "b, c"),
            defSym("f", 6, "z"),
        ]);
        // The SECOND def's signature won (the latest before line 5).
        expect(r!.args).toBe("b, c");
    });

    it("falls back to the builtin table", () => {
        // len(items|
        const src = "n = len(items|)";
        // The caret inside the call.
        const r = resolveSignatureHelp(src, 13, []);
        // The builtin resolved.
        expect(r).toMatchObject({name: "len", args: BUILTIN_SIGS.len!.args});
        expect(r!.docstring).toBe(BUILTIN_SIGS.len!.docstring);
    });

    it("returns null outside a call, for unknown callees, and for non-identifiers", () => {
        // No call at all.
        expect(resolveSignatureHelp("x = 1|", 5, [])).toBeNull();
        // A call of an unknown name.
        expect(resolveSignatureHelp("mystery(1|)", 10, [])).toBeNull();
        // A non-identifier callee (an operator).
        expect(resolveSignatureHelp("a = (1 + 2)|", 11, [])).toBeNull();
    });

    it("reports the call's line and the caret's 1-based column on later lines", () => {
        // A multi-line buffer with the call on line 3.
        const src = "import os\n\nvalue = round(\n    3.14159,\n    2|)\n";
        // The caret sits on the `|` marker (offset 44), right after the "2".
        const caret = src.indexOf("2|") + 1;
        // Resolve against the builtin table.
        const r = resolveSignatureHelp(src, caret, []);
        // The call opened on line 3.
        expect(r!.line).toBe(3);
        // The caret column on ITS line (1-based): 5 characters precede it
        // ("    2") → column 6, the position a real editor reports.
        expect(r!.col).toBe(6);
        // The second argument is active.
        expect(r!.activeArg).toBe(1);
    });
});
