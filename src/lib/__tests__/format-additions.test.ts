/**
 * Tests for the Formatting additions:
 * - Python / JS quote-style DEFAULTS are "double" — Auto-format
 * converts print('a') → print("a") (the literal example).
 * - Markdown bullet-marker normalization (formatMarkdownBulletChar).
 * - HTML attribute-quote normalization (formatHtmlAttrQuotes).
 * - pascalCaseLabel: trim + dotted tokens stay verbatim.
 */
import {describe, expect, it} from "vitest";
import {
    applyFormatPostProcessors,
    collapseBlankRuns,
    convertIndentStyle,
    hygieneFrozenRanges,
    trimTrailingWhitespace,
} from "@/lib/format-post";
import {DEFAULT_SETTINGS} from "@/lib/settings";
import {formatMarkdown, reindentMarkdown} from "@/lib/md-format";
import {formatHtml, normalizeHtmlAttrQuotes} from "@/lib/html-format";
import {formatJs} from "@/lib/code-format";
import {pascalCaseLabel} from "@/lib/examples-data/_helpers";

describe("quote-style defaults", () => {
    it("DEFAULT_SETTINGS normalize single quotes to double for Python", () => {
        expect(DEFAULT_SETTINGS.formatPyQuoteStyle).toBe("double");
        expect(DEFAULT_SETTINGS.formatJsQuoteStyle).toBe("double");
    });

    it("Auto-format converts print('a') → print(\"a\")", () => {
        const out = applyFormatPostProcessors("x = 'a'\nprint('a')\n", DEFAULT_SETTINGS, "demo.py");
        expect(out).toBe('x = "a"\nprint("a")\n');
    });

    it("strings that would need re-escaping stay single", () => {
        const src = "msg = 'she said \"hi\"'\n";
        const out = applyFormatPostProcessors(src, DEFAULT_SETTINGS, "demo.py");
        expect(out).toContain("'she said \"hi\"'");
    });

    it("triple-quoted docstrings and comments stay verbatim", () => {
        const src = '"""docs\'n\'things"""\n# not a \'string\'\n';
        const out = applyFormatPostProcessors(src, DEFAULT_SETTINGS, "demo.py");
        expect(out).toBe('"""docs\'n\'things"""\n# not a \'string\'\n');
    });

    it("formatJs converts const a = 'x' → const a = \"x\" with the default", () => {
        const out = formatJs("const a = 'x';\n", {
            quoteStyle: DEFAULT_SETTINGS.formatJsQuoteStyle,
        });
        expect(out).toContain('const a = "x";');
    });
});

describe("formatMarkdown bulletChar", () => {
    it("rewrites * items to - items by default", () => {
        const out = formatMarkdown("* one\n* two\n", {finalNewline: false, formatTables: false});
        expect(out).toBe("- one\n- two");
    });

    it("rewrites - items to * items when configured", () => {
        const out = formatMarkdown("- one\n- two\n", {
            finalNewline: false,
            formatTables: false,
            bulletChar: "*",
        });
        expect(out).toBe("* one\n* two");
    });

    it("never touches emphasis, horizontal rules, or fenced code", () => {
        const src = "*emphasis* text\n\n***\n\n```md\n* frozen item\n```\n";
        const out = formatMarkdown(src, {finalNewline: false, formatTables: false});
        expect(out).toContain("*emphasis* text");
        expect(out).toContain("***");
        expect(out).toContain("* frozen item");
    });

    it("the indent-only twin never rewrites markers", () => {
        const out = reindentMarkdown("* one\n", {finalNewline: false});
        expect(out.trim()).toBe("* one");
    });
});

describe("formatHtml attrQuotes", () => {
    it("normalizes single-quoted attribute values when enabled", () => {
        const out = formatHtml("<a href='x.html' class='btn'>Hi</a>\n", 2, "double");
        expect(out).toContain('<a href="x.html" class="btn">Hi</a>');
    });

    it("keeps the author's quotes when keep (default)", () => {
        const out = formatHtml("<a href='x.html'>Hi</a>\n", 2);
        expect(out).toContain("<a href='x.html'>Hi</a>");
    });

    it("values containing a double quote stay single-quoted", () => {
        const tag = normalizeHtmlAttrQuotes("<span title='say \"hi\"'>x</span>");
        expect(tag).toBe("<span title='say \"hi\"'>x</span>");
    });

    it("script contents are never touched", () => {
        const src = "<script>const s = 'single';</script>\n";
        const out = formatHtml(src, 2, "double");
        expect(out).toContain("const s = 'single';");
    });
});

describe("pascalCaseLabel", () => {
    it("trims stray whitespace", () => {
        expect(pascalCaseLabel(" defer stack")).toBe("Defer Stack");
    });

    it("keeps dotted tokens (file names / qualified names) verbatim", () => {
        expect(pascalCaseLabel("nn.Module skeleton")).toBe("nn.Module Skeleton");
        expect(pascalCaseLabel("setup.py")).toBe("setup.py");
    });

    it("Pascal-cases plain words and hyphenated compounds", () => {
        expect(pascalCaseLabel("argparse with preset argv")).toBe("Argparse With Preset Argv");
        expect(pascalCaseLabel("real-time clock")).toBe("Real-Time Clock");
    });

    it("keeps ALL-CAPS acronyms", () => {
        expect(pascalCaseLabel("csv join")).toBe("Csv Join");
        expect(pascalCaseLabel("3D scatter")).toBe("3D Scatter");
    });
});

/* ── the added Formatting controls, applied correctly ────────────── */

describe("added formatter controls", () => {
    it("formatTabWidth default is 4 and lands in DEFAULT_SETTINGS", () => {
        expect(DEFAULT_SETTINGS.formatTabWidth).toBe(4);
        expect(DEFAULT_SETTINGS.formatMarkdownHeadingSpace).toBe(true);
        expect(DEFAULT_SETTINGS.formatJsBracketSpacing).toBe(true);
        expect(DEFAULT_SETTINGS.formatSqlKeywordCase).toBe("keep");
        expect(DEFAULT_SETTINGS.formatHtmlLowercaseTags).toBe(true);
        expect(DEFAULT_SETTINGS.formatHygieneSkipFences).toBe(true);
    });

    it("convertIndentStyle uses the TAB width (not the indent width)", () => {
        // 8 leading spaces with tabWidth 4 → two tabs; with width 2 → four tabs.
        const four = convertIndentStyle("        x = 1\n", "tabs", 4);
        expect(four).toBe("\t\tx = 1\n");
        const eight = convertIndentStyle("        x = 1\n", "tabs", 8);
        expect(eight).toBe("\tx = 1\n");
        // expanding a tab honors the stop too.
        const expanded = convertIndentStyle("\tx\n", "spaces", 4);
        expect(expanded).toBe("    x\n");
    });

    it("trimTrailingWhitespace skips frozen (fenced) line ranges", () => {
        const src = "keep   \n```js\nsample   \n\n\ninside   \n```\nafter   \n";
        const frozen = hygieneFrozenRanges(src, "markdown");
        // The fence spans lines 1..6 inclusive (0-based [1,7)).
        expect(frozen).toContainEqual([1, 7]);
        const out = trimTrailingWhitespace(src, frozen);
        expect(out.startsWith("keep\n")).toBe(true);
        expect(out).toContain("sample   \n");
        expect(out).toContain("inside   \n");
        expect(out.endsWith("after\n")).toBe(true);
    });

    it("collapseBlankRuns keeps blank runs INSIDE frozen regions verbatim", () => {
        const src = "a\n```js\nx\n\n\n\ny\n```\nb\n\n\n\nc\n";
        const frozen = hygieneFrozenRanges(src, "markdown");
        const out = collapseBlankRuns(src, 1, frozen);
        // The 3-blank run inside the fence survives; outside it collapses.
        expect(out).toContain("x\n\n\n\ny");
        expect(out).toContain("b\n\nc");
    });

    it("hygieneFrozenRanges finds HTML script/pre bodies", () => {
        const src = "<div>\n<script>\nvar a = 1;\n</script>\n</div>\n";
        const frozen = hygieneFrozenRanges(src, "html");
        expect(frozen.length).toBeGreaterThan(0);
    });

    it("applyFormatPostProcessors honors formatHygieneSkipFences", () => {
        const md = "text\n\n```js\nsample   \n\n\n\nmore   \n```\n";
        const guarded = applyFormatPostProcessors(
            md,
            {...DEFAULT_SETTINGS, formatHygieneSkipFences: true},
            "demo.md",
            "markdown"
        );
        expect(guarded).toContain("sample   \n\n\n\nmore   \n");
        const unguarded = applyFormatPostProcessors(
            md,
            {...DEFAULT_SETTINGS, formatHygieneSkipFences: false},
            "demo.md",
            "markdown"
        );
        expect(unguarded).toContain("sample\n\nmore\n");
    });

    it("Markdown heading spacing is optional", () => {
        const on = formatMarkdown("intro\n# Head\n", {
            finalNewline: false,
            formatTables: false,
            headingSpace: true,
        });
        expect(on).toBe("intro\n\n# Head");
        const off = formatMarkdown("intro\n# Head\n", {
            finalNewline: false,
            formatTables: false,
            headingSpace: false,
        });
        expect(off).toBe("intro\n# Head");
    });

    it("JS bracket spacing toggles { a: 1 } ↔ {a: 1}", () => {
        const on = formatJs("const o = {a: 1};\n", {bracketSpacing: true});
        expect(on).toContain("{ a: 1 }");
        const off = formatJs("const o = { a: 1 };\n", {bracketSpacing: false});
        expect(off).toContain("{a: 1}");
    });

    it("HTML lowercase tags normalizes names but keeps camel-case SVG attrs", () => {
        const out = formatHtml('<DIV CLASS="x">Hi</DIV>\n<svg viewBox="0 0 1 1"></svg>\n', 2, "keep", true);
        expect(out.toLowerCase()).toContain('<div class="x">hi</div>');
        expect(out).toContain("viewBox");
    });

    it("HTML lowercaseTags=false keeps the authored case", () => {
        const out = formatHtml('<DIV>Hi</DIV>\n', 2, "keep", false);
        expect(out).toContain("<DIV>");
    });
});
