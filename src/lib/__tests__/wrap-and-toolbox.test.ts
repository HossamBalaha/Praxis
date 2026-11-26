/**
 * Tests for the all-language prose-wrap format pass (wrapProseLines /
 * format-any) and the Developer-Toolbox registry shape: 20 categories,
 * EVERY category at or above the 30-tool minimum (the "the minimum is
 * 30" requirement, guarded so drift fails the suite).
 */

import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {wrapProseLines} from "../format-post";
import {formatAnySource} from "../format-any";
import {DEFAULT_SETTINGS} from "../settings";
import {DATA_TOOLS} from "@/components/toolbox/tool-data";
import {MATH_TOOLS} from "@/components/toolbox/tool-math";
import {FORMAT_TOOLS} from "@/components/toolbox/tool-format";
import {SECURITY_TOOLS} from "@/components/toolbox/tool-security";
import {VALIDATE_TOOLS} from "@/components/toolbox/tool-validate";
import {TEXTANALYSIS_TOOLS} from "@/components/toolbox/tool-textanalysis";
import {
    EXTRA_COLOR_TOOLS,
    EXTRA_CONVERTER_TOOLS,
    EXTRA_DATA_TOOLS,
    EXTRA_ENCODER_TOOLS,
    EXTRA_FORMAT_TOOLS,
    EXTRA_GENERATOR_TOOLS,
    EXTRA_HASH_TOOLS,
    EXTRA_REFERENCE_TOOLS,
    EXTRA_SECURITY_TOOLS,
    EXTRA_TEXT_TOOLS,
    EXTRA_TEXTANALYSIS_TOOLS,
    EXTRA_TIME_TOOLS,
    EXTRA_URL_TOOLS,
    EXTRA_VALIDATE_TOOLS,
} from "@/components/toolbox/tool-extra";

/* ─── wrapProseLines ───────────────────────────────────────────── */

describe("wrapProseLines", () => {
    it("wraps a long prose paragraph at the column", () => {
        const words = Array.from({length: 30}, (_, i) => `word${i}`).join(" ");
        const out = wrapProseLines(words, 40);
        const lines = out.split("\n");
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) expect(line.length).toBeLessThanOrEqual(41); // 40 + safety
        // nothing lost: joining gives the same word sequence
        expect(out.split(/\s+/).join(" ")).toBe(words);
    });

    it("keeps a single short line untouched (nothing to wrap)", () => {
        const src = "short line that fits";
        expect(wrapProseLines(src, 80)).toBe(src);
    });

    it("never touches fenced code blocks (frozen ranges)", () => {
        const inner = "x".repeat(200);
        const src = `text before the fence\n\n\`\`\`\n${inner}\n\`\`\`\n\nmore text after`;
        const out = wrapProseLines(src, 40);
        // the 200-char code line survives verbatim
        expect(out).toContain(inner);
        // the prose around it IS wrapped
        expect(out.split("\n").some((l) => l.length > 60 && !l.startsWith("x".repeat(50)))).toBe(false);
    });

    it("wraps list items with the marker indented under continuation lines", () => {
        const src = "- " + Array.from({length: 20}, (_, i) => `item${i}`).join(" ");
        const out = wrapProseLines(src, 40);
        const lines = out.split("\n");
        expect(lines[0].startsWith("- item")).toBe(true);
        expect(lines[1].startsWith("  item")).toBe(true);
        for (const line of lines) expect(line.length).toBeLessThanOrEqual(41);
    });

    it("passes tables and headings through unchanged", () => {
        const src = "| a | b |\n| --- | --- |\n| 1 | 2 |\n# A Heading That Is Quite Long Indeed";
        expect(wrapProseLines(src, 20)).toBe(src);
    });

    it("re-joins a wrapped paragraph from hard-wrapped input", () => {
        const src = "alpha beta gamma\ndelta epsilon zeta\n\nsecond paragraph";
        const out = wrapProseLines(src, 26);
        // the two hard-wrapped lines merge into one flowing paragraph
        expect(out.split("\n")[0]).toBe("alpha beta gamma delta");
        expect(out).toContain("\nsecond paragraph");
    });
});

/* ─── the format-any wrap integration ───────────────────────────── */

describe("formatAnySource wrap option", () => {
    it("applies the wrap pass to markdown when formatWrapProse is on", () => {
        const long = Array.from({length: 30}, (_, i) => `word${i}`).join(" ");
        const src = `# Heading\n\n${long}\n`;
        const wrapped = formatAnySource("markdown", "format", src, {
            ...DEFAULT_SETTINGS,
            formatWrapProse: true,
            formatWrapColumn: 40,
        });
        expect(wrapped.split("\n").some((l) => l.length > 45)).toBe(false);
        expect(wrapped.startsWith("# Heading")).toBe(true);
    });

    it("leaves prose alone when the switch is off (default)", () => {
        const long = Array.from({length: 30}, (_, i) => `word${i}`).join(" ");
        const out = formatAnySource("markdown", "format", `${long}\n`, DEFAULT_SETTINGS);
        expect(out).toContain(long);
    });

    it("never wraps code languages even with the switch on", () => {
        const line = "const x = " + Array.from({length: 40}, () => "1").join(" + ") + ";";
        const out = formatAnySource("javascript", "format", line, {
            ...DEFAULT_SETTINGS,
            formatWrapProse: true,
            formatWrapColumn: 40,
        });
        expect(out.replace(/\s+/g, "")).toContain(line.replace(/\s+/g, ""));
    });
});

/* ─── the Developer-Toolbox registry shape ──────────────────────── */

describe("Developer Toolbox registry", () => {
    const newCats: Array<[string, Array<unknown>]> = [
        ["Data & Tables", DATA_TOOLS],
        ["Math & Calc", MATH_TOOLS],
        ["Formatters", FORMAT_TOOLS],
        ["Security", SECURITY_TOOLS],
        ["Validators", VALIDATE_TOOLS],
        ["Text Analysis", TEXTANALYSIS_TOOLS],
    ];
    const newTotal = newCats.reduce((a, [, list]) => a + list.length, 0);

    it("declares exactly 163 new tools across exactly 6 new categories", () => {
        expect(newCats.length).toBe(6);
        expect(newTotal).toBe(163);
        for (const [name, list] of newCats) {
            expect(list.length, `${name} count`).toBeGreaterThan(20);
        }
    });

    it("has unique ids across every new category (no dropdown collisions)", () => {
        const ids = newCats.flatMap(([, list]) =>
            (list as Array<{ id: string }>).map((t) => t.id)
        );
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("keeps every category at or above the 30-tool minimum (20 categories)", () => {
        const source = readFileSync(
            resolve(__dirname, "../../components/dev-toolbox.tsx"),
            "utf-8"
        );
        const start = source.indexOf("const TOOLS: ToolDef[] = [");
        const end = source.indexOf("\n];", start);
        const body = source.slice(start, end);

        /* 1. literal entries — one tool per `{ id, label, category }` row. */
        const literals = Array.from(body.matchAll(/\{ id: "([^"]+)", label: "([^"]+)", category: "([^"]+)"/g));
        const perCategory = new Map<string, number>();
        const bump = (cat: string, n: number) => perCategory.set(cat, (perCategory.get(cat) ?? 0) + n);
        for (const m of literals) bump(m[3], 1);

        /* 2. the EXTRA_* boosts — imported arrays spread over their
         * category (one tool per component). */
        const extras: Record<string, number> = {
            Converters: EXTRA_CONVERTER_TOOLS.length,
            Encoders: EXTRA_ENCODER_TOOLS.length,
            Text: EXTRA_TEXT_TOOLS.length,
            Generators: EXTRA_GENERATOR_TOOLS.length,
            "Hash & Crypto": EXTRA_HASH_TOOLS.length,
            Color: EXTRA_COLOR_TOOLS.length,
            "URL & Network": EXTRA_URL_TOOLS.length,
            Time: EXTRA_TIME_TOOLS.length,
            Reference: EXTRA_REFERENCE_TOOLS.length,
            "Data & Tables": EXTRA_DATA_TOOLS.length,
            Formatters: EXTRA_FORMAT_TOOLS.length,
            Security: EXTRA_SECURITY_TOOLS.length,
            Validators: EXTRA_VALIDATE_TOOLS.length,
            "Text Analysis": EXTRA_TEXTANALYSIS_TOOLS.length,
        };
        for (const [cat, n] of Object.entries(extras)) {
            bump(cat, n);
        }

        /* 3. the six spec-module spreads (their sizes are imported above
         * as newCats — one per entry). */
        const spreadCategory: Record<string, string> = {};
        for (const m of body.matchAll(/\.\.\s*(\w+_TOOL_ENTRIES)\.map\(\(e\) => \(\{[\s\S]*?category: "([^"]+)"/g)) {
            spreadCategory[m[2]] = m[1];
        }
        for (const [cat, entryName] of Object.entries(spreadCategory)) {
            const list = newCats.find(([name]) => name === cat)?.[1];
            expect(list, `spread ${entryName} must map to a known category`).toBeDefined();
            bump(cat, list!.length);
        }

        /* 4. the inline media tuples — audio fx (aud-fx-…), pdf stamps +
         * page ops (pdf-…) and the image-text family (img-…) registered
         * through their engines. */
        bump("Audio Studio", (body.match(/\["aud-fx-/g) ?? []).length);
        bump("PDF Studio", (body.match(/\["pdf-(?:footer|header|bates|date|corner-date|conf|draft|dup|odd|even|keep-first|keep-last|drop-third|blank-each|rot-odd)"/g) ?? []).length);
        bump("Image → Text", (body.match(/\["img-(?:ascii|palette|hist|info|durl|tag|cssbg|srcset|favicon)/g) ?? []).length);

        /* The guarantee: 20 categories, EVERY one ≥ 30 tools, ≥ 600 total. */
        expect(perCategory.size + newCats.length - newCats.filter(([c]) => perCategory.has(c)).length).toBe(20);
        const totalTools = [...perCategory.values()].reduce((a, b) => a + b, 0);
        expect(totalTools).toBeGreaterThanOrEqual(600);
        for (const [cat, count] of perCategory) {
            expect(count, `${cat} must reach the 30-tool minimum`).toBeGreaterThanOrEqual(30);
        }
        // and the six spec-module categories are registered exactly once each
        for (const [name] of newCats) {
            expect(body, `category ${name} registered`).toContain(`category: "${name}"`);
        }
    });
});
