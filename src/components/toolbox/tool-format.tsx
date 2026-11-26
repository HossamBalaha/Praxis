"use client";

/**
 * tool-format.tsx — the "Formatters" toolbox category (base tools;
 * the registry's boosts keep the category ≥ 30 — see dev-toolbox.tsx).
 * The first twelve ride the REAL offline formatter engines
 * (lib/format-any — the same passes the editor's right-click uses),
 * with a settings override line so a tool run can pin its own knobs;
 * the rest are classic text-shape formatters. All offline.
 */

import {makeTextTool, type TextToolSpec} from "./tool-factory";
import {formatAnySource} from "@/lib/format-any";
import {DEFAULT_SETTINGS} from "@/lib/settings";
import {wrapProseLines} from "@/lib/format-post";
import {getIndentSettings, reindentPython} from "@/lib/indent";

/** Apply a formatter pass; a leading `# opts: key=value,…` line
 * overrides settings (booleans / numbers) for this run only. */
function formatWith(kind: string, mode: "format" | "indent", src: string, extra?: Partial<Record<string, unknown>>): string {
    const s = {...DEFAULT_SETTINGS, ...(extra ?? {})} as typeof DEFAULT_SETTINGS;
    let source = src;
    const first = source.split("\n", 1)[0]?.trim() ?? "";
    if (first.startsWith("# opts:")) {
        for (const pair of first.slice(7).split(",")) {
            const m = pair.trim().match(/^([\w]+)=(.+)$/);
            if (!m) continue;
            const key = m[1] as keyof typeof s;
            const raw = m[2].trim();
            const value = raw === "true" ? true : raw === "false" ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
            (s as unknown as Record<string, unknown>)[key] = value;
        }
        source = source.slice(first.length).replace(/^\r?\n/, "");
    }
    return formatAnySource(kind, mode, source, s);
}

export const FORMAT_TOOLS: TextToolSpec[] = [
    {
        id: "fmt-json",
        label: "Beautify JSON",
        description: "Re-stringify JSON at a chosen indent — the viewer's own JSON engine.",
        sample: '{"name":"praxis","tools":[1,2,3]}',
        options: [{
            key: "indent",
            label: "Indent",
            kind: "select",
            choices: [["2", "2 spaces"], ["4", "4 spaces"], ["8", "8 spaces"]],
            default: "2"
        }],
        transform: (input, o) => formatWith("json", "format", input, {formatIndentWidth: parseInt(String(o.indent), 10)}),
        note: "Optional first line `# opts: formatJsonSortKeys=true` sorts the keys; `# opts: formatFinalNewline=false` drops the trailing newline.",
    },
    {
        id: "fmt-minify-json",
        label: "Minify JSON",
        description: "Strip every byte of JSON whitespace — the compact one-liner.",
        sample: '{\n  "a": 1,\n  "b": [2]\n}',
        transform: (input) => JSON.stringify(JSON.parse(input)),
    },
    {
        id: "fmt-yaml",
        label: "Re-indent YAML",
        description: "Snap YAML indentation to the configured unit; block scalars (| and >) stay untouched.",
        sample: "a:\n  b: 1\n   c: 2",
        options: [{
            key: "indent",
            label: "Indent",
            kind: "select",
            choices: [["2", "2 spaces"], ["4", "4 spaces"]],
            default: "2"
        }],
        transform: (input, o) => formatWith("yaml", "format", input, {formatIndentWidth: parseInt(String(o.indent), 10)}),
    },
    {
        id: "fmt-toml",
        label: "Format TOML",
        description: "Aligned key column, blank line before each [table], normalized arrays.",
        sample: "[tool]\nname='x'\nversion=1",
        transform: (input) => formatWith("toml", "format", input),
        note: "Optional first line `# opts: formatTomlAlignEquals=false` turns the = alignment off.",
    },
    {
        id: "fmt-css",
        label: "Beautify CSS",
        description: "One declaration per line, nested blocks at the configured indent.",
        sample: "body{margin:0;color:#111}",
        options: [{
            key: "indent",
            label: "Indent",
            kind: "select",
            choices: [["2", "2 spaces"], ["4", "4 spaces"]],
            default: "2"
        }],
        transform: (input, o) => formatWith("css", "format", input, {formatIndentWidth: parseInt(String(o.indent), 10)}),
    },
    {
        id: "fmt-minify-css",
        label: "Minify CSS",
        description: "Collapse a stylesheet — comments, runs of whitespace and trailing semicolons out.",
        sample: "body {\n  /* reset */\n  margin: 0;\n  color: #111111;\n}",
        transform: (input) =>
            input
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\s+/g, " ")
                .replace(/\s*([{};:,>])\s*/g, "$1")
                .replace(/;}/g, "}")
                .trim(),
    },
    {
        id: "fmt-html",
        label: "Beautify HTML",
        description: "The HTML beautifier — one line per block element, attribute quoting, optional tag lowercasing.",
        sample: "<div class=x><p>hi</p></div>",
        options: [
            {
                key: "indent",
                label: "Indent",
                kind: "select",
                choices: [["2", "2 spaces"], ["4", "4 spaces"]],
                default: "2"
            },
            {key: "lower", label: "Lowercase tags", kind: "toggle", default: true},
        ],
        transform: (input, o) =>
            formatWith("html", "format", input, {
                formatIndentWidth: parseInt(String(o.indent), 10),
                formatHtmlLowercaseTags: o.lower === true,
            }),
        note: "script / pre / style / textarea bodies stay byte-for-byte.",
    },
    {
        id: "fmt-minify-html",
        label: "Minify HTML (safe)",
        description: "Collapse inter-tag whitespace and strip comments — attribute values keep their spacing.",
        sample: "<div>\n  <!-- c -->\n  <p> hi </p>\n</div>",
        transform: (input) =>
            input
                .replace(/<!--[\s\S]*?-->/g, "")
                .replace(/>\s+</g, "><")
                .replace(/\s{2,}/g, " ")
                .trim(),
    },
    {
        id: "fmt-js",
        label: "Beautify JS / TS",
        description: "Brace re-indent + operator/bracket spacing + quote normalization — strings and comments frozen.",
        sample: "const x={a:1,b:[2,3]};",
        options: [
            {
                key: "indent",
                label: "Indent",
                kind: "select",
                choices: [["2", "2 spaces"], ["4", "4 spaces"]],
                default: "2"
            },
            {
                key: "quotes",
                label: "Quotes",
                kind: "select",
                choices: [["double", "' → \""], ["single", "\" → '"], ["keep", "keep"]],
                default: "double"
            },
        ],
        transform: (input, o) =>
            formatWith("javascript", "format", input, {
                formatIndentWidth: parseInt(String(o.indent), 10),
                formatJsQuoteStyle: o.quotes as "double" | "single" | "keep",
            }),
        note: "Paste TS/JSX too — same engine; the TS-specific grammar isn't needed for the beautify pass.",
    },
    {
        id: "fmt-sql",
        label: "Re-indent SQL",
        description: "Clauses on their own lines, subqueries indented — plus optional keyword UPPERCASING.",
        sample: "select a, b from t where x > 1 order by a",
        options: [{
            key: "case",
            label: "Keywords",
            kind: "select",
            choices: [["upper", "UPPERCASE"], ["lower", "lowercase"], ["keep", "keep"]],
            default: "upper"
        }],
        transform: (input, o) =>
            formatWith("sql", "format", input, {
                formatSqlKeywordCase: o.case === "upper" ? "upper" : o.case === "lower" ? "lower" : "keep",
            }),
    },
    {
        id: "fmt-markdown",
        label: "Format Markdown",
        description: "Table alignment, list re-indent, heading spacing, bullet normalization — fences untouched.",
        sample: "# t\n* a\n* b\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
        transform: (input) => formatWith("markdown", "format", input),
        note: "Optional first line `# opts: formatMarkdownBulletChar=*` etc. pins the passes.",
    },
    {
        id: "fmt-matlab",
        label: "Re-indent MATLAB",
        description: "Keyword-block re-indent (else / elseif / case at the opener's level, classdef nesting).",
        sample: "if x\ny\nelse\nz\nend",
        transform: (input) => formatWith("matlab", "indent", input),
    },
    {
        id: "fmt-java",
        label: "Re-indent Java",
        description: "Brace-driven re-indent for Java sources.",
        sample: "class A { void b() { if (x) { y(); } } }",
        transform: (input) => formatWith("java", "indent", input),
    },
    {
        id: "fmt-c",
        label: "Re-indent C / C++",
        description: "Brace + keyword re-indent; preprocessor lines keep their column.",
        sample: "int main(){\nif(x){y();\n}\nreturn 0;}",
        transform: (input) => formatWith("c", "indent", input),
    },
    {
        id: "fmt-python-family",
        label: "Re-indent Python-like Blocks",
        description: "The editor's own Python re-indent engine (lib/indent) — snap leading whitespace to block structure.",
        sample: "def f():\n x = 1\n  return x",
        transform: (input) => reindentPython(input, getIndentSettings(DEFAULT_SETTINGS)),
        note: "Pure re-indent only — black/ruff keep their own pipeline in the editor.",
    },
    {
        id: "fmt-shell",
        label: "Re-indent Shell",
        description: "if / then / fi, case / esac structure re-indent; heredoc bodies frozen.",
        sample: "if x\nthen\ny\nfi",
        transform: (input) => formatWith("shell", "indent", input),
    },
    {
        id: "fmt-ruby",
        label: "Re-indent Ruby",
        description: "end-blocks + trailing do drive the layout.",
        sample: "def f\n if x\n y\n end\nend",
        transform: (input) => formatWith("ruby", "indent", input),
    },
    {
        id: "fmt-go",
        label: "Re-indent Go",
        description: "Brace-driven re-indent; raw strings stay frozen.",
        sample: "func main() {\nif x {\ny()\n}\n}",
        transform: (input) => formatWith("go", "indent", input),
    },
    {
        id: "fmt-rust",
        label: "Re-indent Rust",
        description: "Brace-driven re-indent for Rust sources.",
        sample: "fn main() {\n if x {\n y();\n }\n}",
        transform: (input) => formatWith("rust", "indent", input),
    },
    {
        id: "fmt-powershell",
        label: "Re-indent PowerShell",
        description: "Brace + parenthesized block re-indent; # comments and here-strings frozen.",
        sample: "if (x) {\ny\n} else {\nz\n}",
        transform: (input) => formatWith("powershell", "indent", input),
    },
    {
        id: "fmt-batch",
        label: "Re-indent Batch",
        description: "`( … )` block re-indent with :labels pinned to column 0.",
        sample: "if x (\n echo a\n) else (\n echo b\n)",
        transform: (input) => formatWith("batch", "indent", input),
    },
    {
        id: "fmt-indent-convert",
        label: "Tabs ⇄ Spaces",
        description: "Convert leading tabs to spaces (or the reverse) at a chosen tab width — whole-file.",
        sample: "\tlevel one\n\t\tlevel two",
        options: [
            {
                key: "dir",
                label: "Direction",
                kind: "select",
                choices: [["t2s", "Tabs → Spaces"], ["s2t", "Spaces → Tabs"]],
                default: "t2s"
            },
            {
                key: "width",
                label: "Tab width",
                kind: "select",
                choices: [["2", "2"], ["4", "4"], ["8", "8"]],
                default: "4"
            },
        ],
        transform: (input, o) => {
            const w = parseInt(String(o.width), 10) || 4;
            if (o.dir === "s2t") {
                return input.replace(new RegExp(`^( {${w}})+`, "gm"), (m) => "\t".repeat(m.length / w));
            }
            return input.replace(/^([\t]*)/gm, (tabs) => " ".repeat(tabs.length * w));
        },
    },
    {
        id: "fmt-line-endings",
        label: "Line Endings ⇄",
        description: "Normalize LF / CRLF / CR — pick the target and the whole text converts.",
        sample: "a\nb",
        options: [{
            key: "to",
            label: "Target",
            kind: "select",
            choices: [["lf", "LF (Unix)"], ["crlf", "CRLF (Windows)"], ["cr", "CR (classic Mac)"]],
            default: "lf"
        }],
        transform: (input, o) => {
            const norm = input.replace(/\r\n?/g, "\n");
            if (o.to === "crlf") return norm.replace(/\n/g, "\r\n");
            if (o.to === "cr") return norm.replace(/\n/g, "\r");
            return norm;
        },
    },
    {
        id: "fmt-trim-blank",
        label: "Trim Whitespace & Blanks",
        description: "Trim trailing whitespace per line, collapse blank-line runs, strip leading blank lines.",
        sample: "a  \n\n\n\nb\n",
        options: [
            {key: "trail", label: "Trailing spaces", kind: "toggle", default: true},
            {
                key: "blanks",
                label: "Collapse blanks to",
                kind: "select",
                choices: [["1", "1"], ["2", "2"], ["0", "none (keep)"]],
                default: "1"
            },
        ],
        transform: (input, o) => {
            let out = o.trail === true ? input.replace(/[ \t]+(?=\r?\n)/g, "").replace(/[ \t]+$/g, "") : input;
            const keep = parseInt(String(o.blanks), 10);
            if (!Number.isNaN(keep) && keep > 0) {
                out = out.replace(new RegExp(`(?:\\r?\\n){${keep + 1},}`, "g"), () => "\n".repeat(keep));
            }
            return out.replace(/^(?:\r?\n)+/, "");
        },
    },
    {
        id: "fmt-wrap",
        label: "Hard-Wrap Prose",
        description: "Re-flow prose at a column (the same wrapProseLines pass the editor's Auto-format uses).",
        sample: "This is a long paragraph that would look much better wrapped at a fixed column so diffs and narrow screens both read cleanly.",
        options: [{
            key: "width",
            label: "Column",
            kind: "select",
            choices: [["60", "60"], ["72", "72"], ["80", "80"], ["100", "100"], ["120", "120"]],
            default: "80"
        }],
        transform: (input, o) => wrapProseLines(input, parseInt(String(o.width), 10)),
        note: "Paragraphs join and re-wrap; list items wrap under their marker; indented blocks pass through.",
    },
    {
        id: "fmt-quote-lines",
        label: "Quote Every Line",
        description: "Wrap each line in quotes with a chosen separator — the shell-argument / SQL-IN helper.",
        sample: "a\nb\nc",
        options: [
            {
                key: "quote",
                label: "Quote",
                kind: "select",
                choices: [["double", "\""], ["single", "'"], ["back", "`"], ["none", "none"]],
                default: "double"
            },
            {
                key: "sep",
                label: "Join",
                kind: "select",
                choices: [["comma", ", "], ["space", " "], ["nl", "newline"], ["and", ", + final and"]],
                default: "comma"
            },
        ],
        transform: (input, o) => {
            const q = o.quote === "double" ? '"' : o.quote === "single" ? "'" : o.quote === "back" ? "`" : "";
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => `${q}${l.replace(new RegExp(q === '"' ? '"' : q === "'" ? "'" : "`", "g"), (m) => m + m)}${q}`);
            if (o.sep === "nl") return lines.join("\n");
            if (o.sep === "space") return lines.join(" ");
            if (o.sep === "and") return lines.length > 1 ? `${lines.slice(0, -1).join(", ")} and ${lines[lines.length - 1]}` : lines.join("");
            return lines.join(", ");
        },
    },
];

/** Registry entries: one component per spec (the factory renders it). */
export const FORMAT_TOOL_ENTRIES = FORMAT_TOOLS.map((spec) => ({spec, component: makeTextTool(spec)}));
