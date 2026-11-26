import {describe, expect, it} from "vitest";
import {formatMatlab, reindentMatlab} from "@/lib/matlab-format";

describe("reindentMatlab", () => {
    it("indents function/if/for/while blocks with `end` closers", () => {
        const src = [
            "function out = f(x)",
            "if x > 1",
            "out = 2;",
            "else",
            "out = 3;",
            "end",
            "end",
        ].join("\n");
        expect(reindentMatlab(src)).toBe(
            [
                "function out = f(x)",
                "  if x > 1",
                "    out = 2;",
                "  else",
                "    out = 3;",
                "  end",
                "end",
                "",
            ].join("\n")
        );
    });

    it("peers (else/elseif/case/otherwise/catch) sit at the opener level", () => {
        const src = ["switch n", "case 1", "disp(1)", "otherwise", "disp(2)", "end"].join("\n");
        expect(reindentMatlab(src)).toBe(
            ["switch n", "  case 1", "    disp(1)", "  otherwise", "    disp(2)", "end", ""].join("\n")
        );
    });

    it("never treats indexing `end` as a block closer", () => {
        const src = "a = arr(end, 2);\nb = arr(end-1);\n";
        expect(reindentMatlab(src)).toBe(src);
    });

    it("keeps `...` continuations one step deeper than the body", () => {
        const src = ["total = 1 + ...", "2 + ...", "3;", "x = total;"].join("\n");
        expect(reindentMatlab(src)).toBe(
            ["total = 1 + ...", "  2 + ...", "  3;", "x = total;", ""].join("\n")
        );
    });

    it("handles classdef/properties/methods nesting", () => {
        const src = [
            "classdef Point",
            "properties",
            "x",
            "y",
            "end",
            "methods",
            "function p = Point(x, y)",
            "p.x = x;",
            "end",
            "end",
            "end",
        ].join("\n");
        expect(reindentMatlab(src)).toBe(
            [
                "classdef Point",
                "  properties",
                "    x",
                "    y",
                "  end",
                "  methods",
                "    function p = Point(x, y)",
                "      p.x = x;",
                "    end",
                "  end",
                "end",
                "",
            ].join("\n")
        );
    });

    it("old-style multi-function files (no end) do not drift", () => {
        const src = [
            "function a()",
            "disp(1);",
            "function b()",
            "disp(2);",
        ].join("\n");
        expect(reindentMatlab(src)).toBe(
            ["function a()", "  disp(1);", "function b()", "  disp(2);", ""].join("\n")
        );
    });

    it("comment lines keep their alignment and are not re-leveled", () => {
        const src = "if x % trailing\n% standalone comment\ny = 1;\nend\n";
        expect(reindentMatlab(src)).toBe(
            "if x % trailing\n% standalone comment\n  y = 1;\nend\n"
        );
    });
});

describe("formatMatlab", () => {
    it("normalizes spacing: commas, assignments, comments", () => {
        const src = "z=zeros( 3 ,3 );x=1;% tight\n";
        expect(formatMatlab(src)).toBe("z = zeros(3, 3); x = 1; % tight\n");
    });
    it("keeps transpose tight and strings frozen", () => {
        const src = "v = [1 2 3]';\ns = 'a,b';\n";
        expect(formatMatlab(src)).toBe("v = [1 2 3]';\ns = 'a,b';\n");
    });
    it("reindents AND spaces in one pass", () => {
        const src = ["function r = f(x)", "if x>0", "r=x*2;", "else", "r=-1;", "end", "end"].join("\n");
        expect(formatMatlab(src)).toBe(
            [
                "function r = f(x)",
                "  if x > 0",
                "    r = x * 2;",
                "  else",
                "    r = -1;",
                "  end",
                "end",
                "",
            ].join("\n")
        );
    });
    it("paren after an operator is spaced; colon binds tight", () => {
        // `t = (0:n - 1)' / 10` — the assignment paren gets its space, the
        // range colon is tight on both sides, and an operator after a
        // transpose is binary (spaced).
        expect(formatMatlab("t =(0: n - 1)'/ 10;\n")).toBe("t = (0:n - 1)' / 10;\n");
        // Call parens after words stay tight (the common case).
        expect(formatMatlab("x=sin( pi );\n")).toBe("x = sin(pi);\n");
    });
});
