import {describe, expect, it} from "vitest";
import {formatCss, reindentSql, reindentYaml} from "@/lib/misc-format";

describe("reindentYaml", () => {
    it("snaps odd indentation to the detected unit", () => {
        const src = "name: app\nserver:\n   port: 8080\n   host: local\n";
        const out = reindentYaml(src, {indentWidth: 2});
        expect(out).toBe("name: app\nserver:\n  port: 8080\n  host: local\n");
    });
    it("freezes block scalar bodies verbatim", () => {
        const src = "description: |\n      keep   this\n        exactly\nenabled: true\n";
        const out = reindentYaml(src, {indentWidth: 2});
        expect(out).toContain("description: |\n      keep   this\n        exactly\n");
        expect(out).toContain("enabled: true");
    });
    it("keeps already-clean 2-space YAML stable", () => {
        const src = "a: 1\nlist:\n  - one\n  - two\n";
        expect(reindentYaml(src)).toBe(src);
    });
});

describe("formatCss", () => {
    it("puts one declaration per line with normalized spacing", () => {
        const src = ".card{color:red;padding:8px 12px;}";
        const out = formatCss(src, {indentWidth: 2});
        expect(out).toBe(".card {\n  color: red;\n  padding: 8px 12px;\n}\n");
    });
    it("indents nested @media blocks and preserves comments", () => {
        const src = "@media print{ /* quiet */ body{margin:0} }";
        const out = formatCss(src, {indentWidth: 2});
        expect(out).toContain("@media print {");
        expect(out).toContain("/* quiet */");
        expect(out).toContain("  body {\n    margin: 0;\n  }");
    });
    it("keeps strings with braces/semicolons intact", () => {
        const src = 'a::after{content:"{x;y}"}';
        const out = formatCss(src);
        expect(out).toContain('content: "{x;y}";');
    });
});

describe("reindentSql", () => {
    it("breaks major clauses onto their own lines", () => {
        const src = "select id, name from users where id = 5 and active = 1;";
        const out = reindentSql(src, {indentWidth: 2});
        expect(out).toBe(
            [
                "select id,",
                "  name",
                "  from users",
                "  where id = 5",
                "    and active = 1;",
                "",
            ].join("\n")
        );
    });
    it("splits statements and re-attaches the semicolons", () => {
        const src = "create table a (id int); create table b (id int);";
        const out = reindentSql(src);
        expect(out).toContain("create table a (id int);\n\ncreate table b (id int);");
    });
    it("never breaks quoted strings", () => {
        const src = "insert into t values ('a;b', 'c');";
        const out = reindentSql(src);
        expect(out).toContain("'a;b'");
        expect(out).not.toContain("'a;\nb'");
    });
});
