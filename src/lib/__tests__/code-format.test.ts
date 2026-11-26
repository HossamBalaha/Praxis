import {describe, expect, it} from "vitest";
import {
    applyJsSpacing,
    formatC,
    formatJava,
    formatJs,
    reindentGo,
    reindentJs,
    reindentPhp,
    reindentR,
    reindentRuby,
    reindentShell,
} from "@/lib/code-format";

describe("reindentJs", () => {
    it("indents nested functions from brace depth", () => {
        const src = [
            "function main() {",
            "const x = 1;",
            "if (x) {",
            "console.log(x);",
            "}",
            "}",
        ].join("\n");
        expect(reindentJs(src)).toBe(
            [
                "function main() {",
                "  const x = 1;",
                "  if (x) {",
                "    console.log(x);",
                "  }",
                "}",
                "",
            ].join("\n")
        );
    });

    it("callback body indents one level under the statement (prettier-style)", () => {
        // Convention change: a call paren whose line ALSO opened
        // the arrow's `{` no longer adds its own indent level — the block
        // brace absorbs the continuation, so the body sits one level
        // under the statement (what Prettier / VSCode print) instead of
        // the old two-level jsbeautifier drift.
        const src = "a(() => {\nreturn 1;\n});\n";
        expect(reindentJs(src)).toBe("a(() => {\n  return 1;\n});\n");
    });

    it("plain multi-line calls still indent their continuation lines", () => {
        // No brace on the opener's line → the paren keeps counting.
        const src = "foo(\n1,\n2\n);\n";
        expect(reindentJs(src)).toBe("foo(\n  1,\n  2\n);\n");
    });

    it("freezes template literals verbatim (multi-line + ${} braces)", () => {
        const src = "const s = `a ${\n{nested: [1,2]}\n} b`;\n";
        expect(reindentJs(src)).toBe(src);
    });

    it("freezes strings containing braces", () => {
        const src = 'const s = "{ not a block }";\n';
        expect(reindentJs(src)).toBe(src);
    });

    it("keeps switch/case at prettier levels (case one under switch)", () => {
        const src = [
            "switch (x) {",
            "case 1:",
            "f();",
            "break;",
            "default:",
            "g();",
            "}",
        ].join("\n");
        expect(reindentJs(src)).toBe(
            [
                "switch (x) {",
                "  case 1:",
                "    f();",
                "    break;",
                "  default:",
                "    g();",
                "}",
                "",
            ].join("\n")
        );
    });

    it("does not treat a regex's contents as code", () => {
        const src = "const re = /[{(]/g;\n";
        expect(reindentJs(src)).toBe(src);
    });

    it("handles TS generics without confusing them for blocks", () => {
        const src = "const x: Map<string, number> = new Map();\nif (x) {\ny();\n}\n";
        expect(reindentJs(src)).toBe(
            "const x: Map<string, number> = new Map();\nif (x) {\n  y();\n}\n"
        );
    });
});

describe("applyJsSpacing", () => {
    it("spaces calls tight, keywords loose, commas followed", () => {
        expect(applyJsSpacing("foo( 1,2 )")).toBe("foo(1, 2)");
        expect(applyJsSpacing("if(x)y();")).toBe("if (x) y();");
        expect(applyJsSpacing("const a={b:1,c:2};")).toBe("const a = { b: 1, c: 2 };");
    });
    it("keeps member chains and unary signs tight", () => {
        expect(applyJsSpacing("a . b . c")).toBe("a.b.c");
        expect(applyJsSpacing("a ?. b")).toBe("a?.b");
        expect(applyJsSpacing("x = - 1")).toBe("x = -1");
        expect(applyJsSpacing("f( - 1 )")).toBe("f(-1)");
    });
    it("does not break strings, templates or comments", () => {
        expect(applyJsSpacing(`s = "a,b"`)).toBe(`s = "a,b"`);
        expect(applyJsSpacing("s = `x${y}z`")).toBe("s = `x${y}z`");
        expect(applyJsSpacing("a = 1 // done, really")).toBe("a = 1 // done, really");
    });
    it("ternary colon spaced, object colon tight", () => {
        expect(applyJsSpacing("x = a ?b:c;")).toBe("x = a ? b : c;");
        expect(applyJsSpacing("const o = {a:1};")).toBe("const o = { a: 1 };");
    });
    it("TS annotation / return-type colons tight, string keys tight", () => {
        expect(applyJsSpacing("function f(src : string) : Token[] {}")).toBe("function f(src: string): Token[] {}");
        expect(applyJsSpacing("const out : Token[] = [];")).toBe("const out: Token[] = [];");
        expect(applyJsSpacing(`const o = {"k": 1};`)).toBe(`const o = { "k": 1 };`);
    });
    it("ternary colon after values/parens still spaced", () => {
        expect(applyJsSpacing("x = (a) ? b : c;")).toBe("x = (a) ? b : c;");
        expect(applyJsSpacing(`x = a ? "s" : "t";`)).toBe(`x = a ? "s" : "t";`);
    });
    it("`++` merges and stays postfix-tight", () => {
        expect(applyJsSpacing("state.clicks ++;")).toBe("state.clicks++;");
        expect(applyJsSpacing("for(let i=0;i<n;i ++){}")).toBe("for (let i = 0; i < n; i++) {}");
    });
    it("array literals spaced after `=`, keywords and commas", () => {
        expect(applyJsSpacing("const a=[1,2];")).toBe("const a = [1, 2];");
        expect(applyJsSpacing("function f(){return [1]}")).toBe("function f() { return [1] }");
        expect(applyJsSpacing("f(1,[2])")).toBe("f(1, [2])");
        expect(applyJsSpacing("arr[0]")).toBe("arr[0]");
        expect(applyJsSpacing("f()[0]")).toBe("f()[0]");
    });
    it("comma before an arrow-function paren gets its space", () => {
        expect(applyJsSpacing('on("click",()=>1)')).toBe('on("click", () => 1)');
    });
});

describe("formatJs", () => {
    it("reindents AND normalizes spacing (the full beautify)", () => {
        const src = "function f(){\nif(a){\nreturn a+1;\n}\n}\n";
        expect(formatJs(src)).toBe(
            ["function f() {", "  if (a) {", "    return a + 1;", "  }", "}", ""].join("\n")
        );
    });
    it("block-comment interiors (JSDoc) are frozen verbatim", () => {
        // Interior ` * text` lines and the star-slash closer must never be
        // re-spaced by the code rules (the regex-after-opener catch).
        const src = [
            "/** Header — docs with  odd   spacing.",
            " * Auto-format keeps me EXACTLY as typed:",
            " *   - arrows → stay, dots.stay, / slashes stay",
            " */",
            "const x=1;",
        ].join("\n");
        expect(formatJs(src)).toBe(
            [
                "/** Header — docs with  odd   spacing.",
                " * Auto-format keeps me EXACTLY as typed:",
                " *   - arrows → stay, dots.stay, / slashes stay",
                " */",
                "const x = 1;",
                "",
            ].join("\n")
        );
    });
    it("division after a closer is not a regex (no depth drift)", () => {
        // `(now - start)/ms` used to swallow the line as one fake regex —
        // the closing parens were skipped and every following line drifted
        // one indent level deeper.
        const src = ["const t = Math.min(1,(now-start)/ms);", "el.textContent = String(t)", "return t;", ""].join("\n");
        expect(formatJs(src)).toBe(
            ["const t = Math.min(1, (now - start) / ms);", "el.textContent = String(t)", "return t;", ""].join("\n")
        );
    });
    it("operator spacing can be turned off (settings toggle)", () => {
        const src = "function f(){\nreturn a+1;\n}\n";
        expect(formatJs(src, {operatorSpacing: false})).toBe(
            "function f(){\n  return a+1;\n}\n"
        );
    });
    it("collapses 2+ blank lines to one", () => {
        expect(formatJs("a();\n\n\n\nb();\n")).toBe("a();\n\nb();\n");
    });
});

describe("family variants", () => {
    it("java: braces + generics", () => {
        const src = "class A {\nvoid run(){\nint x=1;\n}\n}\n";
        expect(formatJava(src)).toBe(
            "class A {\n  void run() {\n    int x = 1;\n  }\n}\n"
        );
    });
    it("c: preprocessor + braces (format == spacing + indent)", () => {
        const src = "int main(){\nprintf(\"hi\");\nreturn 0;\n}\n";
        expect(formatC(src)).toBe(
            'int main() {\n  printf("hi");\n  return 0;\n}\n'
        );
    });
    it("r: # comments survive, braces drive depth", () => {
        const src = "f <- function(x) {\n# a comment\nif (x > 1) {\nreturn(2)\n}\n}\n";
        expect(reindentR(src)).toBe(
            "f <- function(x) {\n  # a comment\n  if (x > 1) {\n    return(2)\n  }\n}\n"
        );
    });
});

describe("reindentShell", () => {
    it("indents if/then/fi and for/do/done blocks", () => {
        const src = [
            "if [ -f x ]; then",
            "echo one",
            "else",
            "echo two",
            "fi",
            "for i in 1 2; do",
            "echo $i",
            "done",
        ].join("\n");
        expect(reindentShell(src)).toBe(
            [
                "if [ -f x ]; then",
                "  echo one",
                "else",
                "  echo two",
                "fi",
                "for i in 1 2; do",
                "  echo $i",
                "done",
                "",
            ].join("\n")
        );
    });
    it("indents case patterns and esac", () => {
        const src = ["case $x in", "a)", "echo A;;", "esac"].join("\n");
        expect(reindentShell(src)).toBe(
            ["case $x in", "  a)", "    echo A;;", "esac", ""].join("\n")
        );
    });
    it("freezes heredoc bodies verbatim", () => {
        const src = [
            "cat <<EOF",
            "   weird   spacing",
            "   stays",
            "EOF",
            "echo done",
        ].join("\n");
        expect(reindentShell(src)).toBe(src + "\n");
    });
    it("keeps function braces as blocks", () => {
        const src = ["greet() {", "echo hi", "}", "greet"].join("\n");
        expect(reindentShell(src)).toBe(
            ["greet() {", "  echo hi", "}", "greet", ""].join("\n")
        );
    });
});

// ─── ruby / php / go ───────────────────────────────────────

describe("reindentRuby", () => {
    it("indents end-blocks and trailing do loops", () => {
        const src = [
            "def greet(name)",
            "msg = \"hi #{name}\"",
            "if name.length > 3",
            "msg += \"!\"",
            "else",
            "msg = msg.upcase",
            "end",
            "msg",
            "end",
            "[1, 2].each do |n|",
            "puts n",
            "end",
        ].join("\n");
        expect(reindentRuby(src)).toBe(
            [
                "def greet(name)",
                "  msg = \"hi #{name}\"",
                "  if name.length > 3",
                "    msg += \"!\"",
                "  else",
                "    msg = msg.upcase",
                "  end",
                "  msg",
                "end",
                "[1, 2].each do |n|",
                "  puts n",
                "end",
                "",
            ].join("\n")
        );
    });
    it("treats trailing if as a modifier, not a block", () => {
        const src = 'puts "big" if value > 10\nreturn nil unless ok\n';
        expect(reindentRuby(src)).toBe(
            'puts "big" if value > 10\nreturn nil unless ok\n'
        );
    });
    it("tracks bracket pairs for hash literals", () => {
        const src = [
            "data = {",
            "name: \"ada\",",
            "roles: [\"admin\", \"dev\"],",
            "}",
            "p data",
        ].join("\n");
        expect(reindentRuby(src)).toBe(
            [
                "data = {",
                "  name: \"ada\",",
                "  roles: [\"admin\", \"dev\"],",
                "}",
                "p data",
                "",
            ].join("\n")
        );
    });
});

describe("reindentPhp", () => {
    it("re-indents brace blocks", () => {
        const src = [
            "<?php",
            "function greet($name) {",
            "$msg = \"hi $name\";",
            "if (strlen($name) > 3) {",
            "$msg .= \"!\";",
            "}",
            "return $msg;",
            "}",
            "?>",
        ].join("\n");
        expect(reindentPhp(src)).toBe(
            [
                "<?php",
                "function greet($name) {",
                "  $msg = \"hi $name\";",
                "  if (strlen($name) > 3) {",
                "    $msg .= \"!\";",
                "  }",
                "  return $msg;",
                "}",
                "?>",
                "",
            ].join("\n")
        );
    });
});

describe("reindentGo", () => {
    it("re-indents funcs and keeps raw strings intact", () => {
        const src = [
            "package main",
            "import \"fmt\"",
            "func main() {",
            "for i := 0; i < 3; i++ {",
            "fmt.Println(\"tick\", i)",
            "}",
            "s := `raw",
            "string`",
            "fmt.Println(s)",
            "}",
        ].join("\n");
        expect(reindentGo(src)).toBe(
            [
                "package main",
                "import \"fmt\"",
                "func main() {",
                "  for i := 0; i < 3; i++ {",
                "    fmt.Println(\"tick\", i)",
                "  }",
                "  s := `raw",
                "string`",
                "  fmt.Println(s)",
                "}",
                "",
            ].join("\n")
        );
    });
});
