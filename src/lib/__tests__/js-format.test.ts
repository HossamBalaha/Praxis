/**
 * tests — the six new registry languages' re-indenters, the
 * JS quote normalizer, and the extended run-language table.
 */
import {describe, expect, it} from "vitest";
import {
    convertJsQuotes,
    formatJs,
    reindentJulia,
    reindentKotlin,
    reindentLua,
    reindentPerl,
    reindentRust,
    reindentSwift,
} from "@/lib/code-format";
import {isRunnableKind, RUN_LANGUAGE_BY_KIND, runLanguageForKind} from "@/lib/run-languages";

describe(": Lua re-indent", () => {
    it("indents function/for/if blocks and dedents at end", () => {
        const src = `local function f(t)\nif #t < 2 then\nreturn t\nend\nfor i = 1, 3 do\nprint(i)\nend\nreturn 0\nend\nprint("done")\n`;
        expect(reindentLua(src, {indentWidth: 2})).toBe(
            `local function f(t)\n  if #t < 2 then\n    return t\n  end\n  for i = 1, 3 do\n    print(i)\n  end\n  return 0\nend\nprint("done")\n`
        );
    });

    it("keeps one-line if/then/end blocks level and handles repeat/until", () => {
        const src = `if x then return 1 end\nrepeat\nprint("tick")\nuntil done\n`;
        expect(reindentLua(src, {indentWidth: 2})).toBe(
            `if x then return 1 end\nrepeat\n  print("tick")\nuntil done\n`
        );
    });

    it("prints else/elseif at the opener's level", () => {
        const src = `if a then\nprint(1)\nelseif b then\nprint(2)\nelse\nprint(3)\nend\n`;
        expect(reindentLua(src, {indentWidth: 2})).toBe(
            `if a then\n  print(1)\nelseif b then\n  print(2)\nelse\n  print(3)\nend\n`
        );
    });

    it("freezes -- comments and keeps strings intact", () => {
        const src = `-- top comment\nlocal s = "if then end"\nif true then\nprint(s)\nend\n`;
        expect(reindentLua(src, {indentWidth: 2})).toBe(
            `-- top comment\nlocal s = "if then end"\nif true then\n  print(s)\nend\n`
        );
    });
});

describe(": Julia re-indent", () => {
    it("indents module/function/if and dedents at end", () => {
        const src = `module Demo\nfunction greet(name)\nif name == ""\nreturn "hi"\nelse\nreturn name\nend\nend\nend\n`;
        expect(reindentJulia(src, {indentWidth: 4})).toBe(
            `module Demo\n    function greet(name)\n        if name == ""\n            return "hi"\n        else\n            return name\n        end\n    end\nend\n`
        );
    });

    it("indents mutable struct bodies and freezes triple strings", () => {
        const src = `mutable struct P\nx::Int\nend\nconst text = """\nfrozen line\n"""\nprintln(text)\n`;
        expect(reindentJulia(src, {indentWidth: 2})).toBe(
            `mutable struct P\n  x::Int\nend\nconst text = """\nfrozen line\n"""\nprintln(text)\n`
        );
    });
});

describe(": curly-family re-indenters", () => {
    it("perl re-indents sub blocks with # comments", () => {
        const src = `sub f {\nmy ($n) = @_;\nif ($n) {\nreturn 1;\n}\nreturn 0;\n}\n`;
        expect(reindentPerl(src, {indentWidth: 4})).toBe(
            `sub f {\n    my ($n) = @_;\n    if ($n) {\n        return 1;\n    }\n    return 0;\n}\n`
        );
    });

    it("rust re-indents fn/if blocks", () => {
        const src = `fn main() {\nlet x = 1;\nif x > 0 {\nprintln!("pos");\n}\n}\n`;
        expect(reindentRust(src, {indentWidth: 4})).toBe(
            `fn main() {\n    let x = 1;\n    if x > 0 {\n        println!("pos");\n    }\n}\n`
        );
    });

    it("kotlin re-indents fun/forEach blocks", () => {
        const src = `fun main() {\nval items = listOf(1, 2)\nitems.forEach { n ->\nprintln(n)\n}\n}\n`;
        expect(reindentKotlin(src, {indentWidth: 4})).toBe(
            `fun main() {\n    val items = listOf(1, 2)\n    items.forEach { n ->\n        println(n)\n    }\n}\n`
        );
    });

    it("swift re-indents func/for blocks", () => {
        const src = `func total(_ nums: [Int]) -> Int {\nvar sum = 0\nfor n in nums {\nsum += n\n}\nreturn sum\n}\n`;
        expect(reindentSwift(src, {indentWidth: 4})).toBe(
            `func total(_ nums: [Int]) -> Int {\n    var sum = 0\n    for n in nums {\n        sum += n\n    }\n    return sum\n}\n`
        );
    });
});

describe(": JS quote normalization", () => {
    it("converts single to double when safe", () => {
        expect(convertJsQuotes(`const a = 'x';\nconst b = "y";\n`, "double")).toBe(
            `const a = "x";\nconst b = "y";\n`
        );
    });

    it("skips strings containing the target quote or escapes", () => {
        const src = `const tricky = 'has "double" inside';\nconst esc = 'a\\'b';\nconst clean = 'ok';\n`;
        expect(convertJsQuotes(src, "double")).toBe(
            `const tricky = 'has "double" inside';\nconst esc = 'a\\'b';\nconst clean = "ok";\n`
        );
    });

    it("never touches template literals, comments or regex contents", () => {
        const src = "const tpl = `keep 'me'`;\n// comment 'not touched'\nconst re = /'quoted'/;\nconst plain = 'swap me';\n";
        expect(convertJsQuotes(src, "double")).toBe(
            "const tpl = `keep 'me'`;\n// comment 'not touched'\nconst re = /'quoted'/;\nconst plain = \"swap me\";\n"
        );
    });

    it("formatJs applies quoteStyle end-to-end", () => {
        const out = formatJs("const a = 'x';\n", {quoteStyle: "double"});
        expect(out).toBe('const a = "x";\n');
        const kept = formatJs("const a = 'x';\n", {quoteStyle: "keep"});
        expect(kept).toBe("const a = 'x';\n");
    });
});

describe(": the run-language table", () => {
    it("marks the six new kinds runnable with their language ids", () => {
        expect(RUN_LANGUAGE_BY_KIND.lua).toBe("lua");
        expect(RUN_LANGUAGE_BY_KIND.perl).toBe("perl");
        expect(RUN_LANGUAGE_BY_KIND.rust).toBe("rust");
        expect(RUN_LANGUAGE_BY_KIND.julia).toBe("julia");
        expect(RUN_LANGUAGE_BY_KIND.kotlin).toBe("kotlin");
        expect(RUN_LANGUAGE_BY_KIND.swift).toBe("swift");
        expect(isRunnableKind("lua")).toBe(true);
        expect(runLanguageForKind("rust")).toBe("rust");
    });

    it("keeps the pre-existing kinds runnable", () => {
        for (const kind of [
            "python", "javascript", "typescript", "matlab", "r", "shell",
            "java", "c", "cpp", "ruby", "php", "go",
        ]) {
            expect(isRunnableKind(kind)).toBe(true);
        }
        expect(isRunnableKind("markdown")).toBe(false);
        expect(isRunnableKind(undefined)).toBe(false);
    });
});
