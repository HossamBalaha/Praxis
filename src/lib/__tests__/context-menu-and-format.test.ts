import {describe, expect, it} from "vitest";
import {CANONICAL_MENU_ORDER, LANGUAGE_INTROS, menuGroupsForKind, SEPARATOR_BEFORE,} from "../context-menu-spec";
import {FORMATTABLE_KINDS, formattableKindFor} from "../formattable-kinds";
import {formatAnySource} from "../format-any";
import {DEFAULT_SETTINGS} from "../settings";
import {terminalRunCommandFor} from "../run-languages";
import {
    commentTokenFor,
    deleteLines,
    duplicateLines,
    joinLines,
    moveLines,
    reorderLines,
    toggleComment,
    trimTrailingWhitespaceAll,
} from "../line-ops";

/* ── the canonical menu spec ───────────────────────────────────── */

describe("context-menu-spec", () => {
    it("keeps a stable canonical order per surface", () => {
        expect(CANONICAL_MENU_ORDER.explorer[0]).toBe("open");
        expect(CANONICAL_MENU_ORDER.explorer).toContain("format");
        expect(CANONICAL_MENU_ORDER["editor-edit"][0]).toBe("navigate");
        expect(CANONICAL_MENU_ORDER["editor-edit"]).toEqual(
            CANONICAL_MENU_ORDER["editor-edit"].filter((g, i, a) => a.indexOf(g) === i)
        );
        expect(CANONICAL_MENU_ORDER["editor-view"][0]).toBe("run");
    });

    it("gives every runnable language a Run group", () => {
        for (const kind of ["python", "javascript", "matlab", "r", "shell", "go", "elixir", "graphql"]) {
            const groups = menuGroupsForKind(kind, "explorer");
            if (kind === "graphql") {
                expect(groups).not.toContain("run"); // a query language — nothing to run
            } else {
                expect(groups).toContain("run");
            }
        }
    });

    it("gives every formattable language a Format group — and ONLY those", () => {
        for (const kind of ["python", "markdown", "yaml", "css", "sql", "javascript", "zig", "fsharp"]) {
            expect(menuGroupsForKind(kind, "explorer")).toContain("format");
        }
        for (const kind of ["text", "csv", "image", "pdf", "log", "ipynb"]) {
            expect(menuGroupsForKind(kind, "explorer")).not.toContain("format");
        }
    });

    it("never re-orders groups between languages — only removes", () => {
        const lua = menuGroupsForKind("lua", "explorer");
        const md = menuGroupsForKind("markdown", "explorer");
        const order = CANONICAL_MENU_ORDER.explorer;
        const rank = (g: string) => order.indexOf(g as never);
        const sortedLua = [...lua].sort((a, b) => rank(a) - rank(b));
        const sortedMd = [...md].sort((a, b) => rank(a) - rank(b));
        expect(lua).toEqual(sortedLua);
        expect(md).toEqual(sortedMd);
    });

    it("gives the AI group to every runnable language — including R and Shell (drift fix)", () => {
        // The AI / Refactor / Explain options are present for ALL runnable
        // languages (r / shell / js / c / ruby …) — gated by the ONE
        // canAiCode capability, so Explorer and both editor surfaces
        // agree through the shared renderer.
        for (const kind of ["python", "javascript", "typescript", "r", "shell", "c", "cpp", "ruby", "go", "java", "matlab"]) {
            expect(menuGroupsForKind(kind, "explorer")).toContain("ai");
            expect(menuGroupsForKind(kind, "editor-edit")).toContain("ai");
            expect(menuGroupsForKind(kind, "editor-view")).toContain("ai");
            expect(menuGroupsForKind(kind, "editor-edit")).toContain("refactor");
        }
        // non-code kinds never get the AI group
        for (const kind of ["markdown", "text", "csv", "image", "pdf"]) {
            expect(menuGroupsForKind(kind, "explorer")).not.toContain("ai");
        }
    });

    it("keeps the canonical separators between the same groups on every surface", () => {
        // The Python VIEW mode layout is the master: one divider before
        // the Clipboard group; the explorer adds the destructive break
        // before Delete. All four call sites render these — never their
        // own ad-hoc dividers.
        expect(SEPARATOR_BEFORE["editor-view"]).toContain("clipboard");
        expect(SEPARATOR_BEFORE["editor-edit"]).toContain("clipboard");
        expect(SEPARATOR_BEFORE.explorer).toContain("clipboard");
        expect(SEPARATOR_BEFORE.explorer).toContain("delete");
    });

    it("derives an extension-aware terminal command per language (Run In Terminal drift fix)", () => {
        // Run In Terminal matches FILE EXTENSIONS — never a blanket
        // python3 for every runnable kind.
        expect(terminalRunCommandFor("python", "main.py")).toBe('python3 "main.py"');
        expect(terminalRunCommandFor("javascript", "app.js")).toBe('node "app.js"');
        expect(terminalRunCommandFor("r", "stats.R")).toBe('Rscript "stats.R"');
        expect(terminalRunCommandFor("shell", "build.sh")).toBe('bash "build.sh"');
        expect(terminalRunCommandFor("ruby", "parse.rb")).toBe('ruby "parse.rb"');
        expect(terminalRunCommandFor(undefined, "x.txt")).toBeUndefined();
    });

    it("has a one-line intro for every registry language", () => {
        const covered = new Set<string>(["python", ...FORMATTABLE_KINDS.map((k) => k.kind)]);
        // every runtime language that runs but has no formatter (none today)
        for (const lang of ["python", "javascript", "typescript", "matlab", "r", "shell", "java", "c", "cpp", "ruby", "php", "go", "lua", "perl", "rust", "julia", "kotlin", "swift", "powershell", "batch", "zig", "dart", "groovy", "scala", "elixir", "haskell", "erlang", "clojure", "ocaml", "fsharp", "graphql"]) {
            expect(typeof LANGUAGE_INTROS[lang]).toBe("string");
            expect(LANGUAGE_INTROS[lang].length).toBeGreaterThan(10);
            expect(covered.has(lang) || lang === "python").toBe(true);
        }
    });
});

/* ── the shared formatter engine ───────────────────────────────── */

describe("formatAnySource", () => {
    // DEFAULT_SETTINGS is a full Settings object — pass it through as-is.
    const s = {...DEFAULT_SETTINGS};

    it("formats JSON (indenting IS formatting)", () => {
        // The engine closes every file with a final newline by default
        // (the formatFinalNewline hygiene switch) — the \n is expected.
        expect(formatAnySource("json", "format", '{"a":1}', s)).toBe('{\n  "a": 1\n}\n');
    });

    it("re-indents YAML without touching block scalars", () => {
        const src = "a:\n  b: 1\n";
        expect(formatAnySource("yaml", "indent", src, s)).toBe(src);
    });

    it("beautifies CSS", () => {
        expect(formatAnySource("css", "format", "a{color:red;}", s)).toBe("a {\n  color: red;\n}\n");
    });

    it("runs the JS pass (braces + spacing)", () => {
        const out = formatAnySource("javascript", "format", "function f( a ){return  a;}", s);
        expect(out).toContain("function f(a) {");
    });

    it("covers every registry kind without throwing", () => {
        for (const k of FORMATTABLE_KINDS) {
            expect(formattableKindFor(k.kind)?.kind).toBe(k.kind);
            const out = formatAnySource(k.kind, "indent", "x\n", s);
            expect(typeof out).toBe("string");
        }
    });
});

/* ── the generic line ops ──────────────────────────────────────── */

describe("line-ops", () => {
    it("toggles comments with the right token", () => {
        expect(commentTokenFor("python")).toBe("#");
        expect(commentTokenFor("matlab")).toBe("%");
        expect(commentTokenFor("sql")).toBe("--");
        expect(commentTokenFor("json")).toBeUndefined();
        const src = "x = 1\n";
        const out = toggleComment(src, {start: 0, end: 0}, "#");
        expect(out.text).toBe("# x = 1\n");
        const back = toggleComment(out.text, {start: 0, end: out.text.length}, "#");
        expect(back.text).toBe(src);
    });

    it("duplicates lines", () => {
        const out = duplicateLines("a\nb\n", {start: 3, end: 3});
        expect(out.text).toBe("a\nb\nb\n");
    });

    it("moves lines up and down", () => {
        expect(moveLines("a\nb\n", {start: 3, end: 3}, -1).text).toBe("b\na\n");
        expect(moveLines("a\nb\n", {start: 0, end: 0}, 1).text).toBe("b\na\n");
    });

    it("deletes lines", () => {
        expect(deleteLines("a\nb\nc\n", {start: 0, end: 1}).text).toBe("b\nc\n");
    });

    it("joins lines", () => {
        expect(joinLines("a\nb\nc\n", {start: 0, end: 5}).text).toBe("a b c\n");
    });

    it("sorts / uniques / reverses lines", () => {
        expect(reorderLines("b\na\n", {start: 0, end: 3}, "sort").text).toBe("a\nb\n");
        expect(reorderLines("a\na\nb\n", {start: 0, end: 5}, "unique").text).toBe("a\nb\n");
        expect(reorderLines("a\nb\n", {start: 0, end: 3}, "reverse").text).toBe("b\na\n");
    });

    it("trims trailing whitespace", () => {
        expect(trimTrailingWhitespaceAll("a  \nb\t\n")).toBe("a\nb\n");
    });
});
