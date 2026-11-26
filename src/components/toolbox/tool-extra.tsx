"use client";

/**
 * tool-extra.tsx — the additional Developer-Toolbox tools that lift
 * every TEXT category to the 30-tool minimum.
 *
 * Every tool here rides the SAME makeTextTool factory the six newer
 * categories use (toolbox/tool-factory.tsx): a declared offline,
 * synchronous (or async WebCrypto) transform + the shared
 * three-pane input / options / output layout. No network, no new npm
 * dependencies.
 *
 * Exports (one array per category, appended to the registry in
 * dev-toolbox.tsx):
 * EXTRA_CONVERTER_TOOLS EXTRA_ENCODER_TOOLS EXTRA_TEXT_TOOLS
 * EXTRA_GENERATOR_TOOLS EXTRA_HASH_TOOLS EXTRA_COLOR_TOOLS
 * EXTRA_URL_TOOLS EXTRA_TIME_TOOLS EXTRA_REFERENCE_TOOLS
 * EXTRA_DATA_TOOLS EXTRA_FORMAT_TOOLS EXTRA_SECURITY_TOOLS
 * EXTRA_VALIDATE_TOOLS EXTRA_TEXTANALYSIS_TOOLS
 */

import {makeTextTool, parsePairs, roundTo} from "@/components/toolbox/tool-factory";
import {parseCsv} from "@/lib/csv-io";
import {md5 as md5Hex} from "@/lib/md5";

/* ══════════════════════════════════════════════════════════════════
 *  shared helpers (pure, offline)
 * ══════════════════════════════════════════════════════════════════ */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const B45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const B62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function bytesToUtf8(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

function utf8ToBytes(text: string): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(text);
}

function bytesToHex(bytes: Uint8Array): string {
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

/** Generic base-N decode (digits only, ignores separators). */
function decodeBaseN(text: string, alphabet: string): bigint {
    const base = BigInt(alphabet.length);
    let acc = 0n;
    for (const ch of text.replace(/\s+/g, "")) {
        const v = alphabet.indexOf(ch);
        if (v < 0) throw new Error(`Character "${ch}" is not in this alphabet.`);
        acc = acc * base + BigInt(v);
    }
    return acc;
}

/** Generic base-N encode of a bigint. */
function encodeBaseN(value: bigint, alphabet: string): string {
    if (value < 0n) throw new Error("Negative values cannot be encoded.");
    const base = BigInt(alphabet.length);
    if (value === 0n) return alphabet[0];
    let out = "";
    let v = value;
    while (v > 0n) {
        out = alphabet[Number(v % base)] + out;
        v /= base;
    }
    return out;
}

/* ══════════════════════════════════════════════════════════════════
 *  CONVERTERS — 24 additional (6 → 30)
 * ══════════════════════════════════════════════════════════════════ */

const ONES = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", " thousand", " million", " billion", " trillion", " quadrillion"];

function numberToWords(n: number): string {
    if (!Number.isFinite(n)) return String(n);
    if (n < 0) return "minus " + numberToWords(-n);
    if (!Number.isInteger(n)) {
        const [i, f] = String(n).split(".");
        return `${numberToWords(Number(i))} point ${f.split("").map((d) => ONES[Number(d)]).join(" ")}`;
    }
    if (n < 20) return ONES[n];
    if (n < 100)
        return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
    if (n < 1000)
        return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + numberToWords(n % 100) : ""}`;
    const groups: number[] = [];
    let rest = Math.floor(n);
    do {
        groups.push(rest % 1000);
        rest = Math.floor(rest / 1000);
    } while (rest > 0);
    let out = "";
    for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i] === 0) continue;
        out += (out ? " " : "") + numberToWords(groups[i]) + SCALES[i];
    }
    return out || "zero";
}

const WORD_VALUE: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
    forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const WORD_SCALE: Record<string, number> = {
    hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
};

function wordsToNumber(text: string): string {
    const tokens = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "—";
    let total = 0;
    let current = 0;
    let ok = true;
    for (const t of tokens) {
        if (t in WORD_VALUE) current += WORD_VALUE[t];
        else if (t === "and") continue;
        else if (t in WORD_SCALE) {
            const s = WORD_SCALE[t];
            if (s === 100) current = (current || 1) * 100;
            else {
                total += (current || 1) * s;
                current = 0;
            }
        } else {
            ok = false;
        }
    }
    total += current;
    return ok ? String(total) : `${total} (unknown words ignored — spell the number out in English)`;
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

/** Split a single CSV line honoring double-quoted cells. */
function splitCsvLine(line: string, delim = ","): string[] {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else inQ = !inQ;
        } else if (c === delim && !inQ) {
            cells.push(cur);
            cur = "";
        } else cur += c;
    }
    cells.push(cur);
    return cells;
}

/* ══════════════════════════════════════════════════════════════════
 *  CONVERTERS — 24 additional (6 → 30)
 * ══════════════════════════════════════════════════════════════════ */

export const EXTRA_CONVERTER_TOOLS = [
    makeTextTool({
        id: "x-num-words",
        label: "Number ⇄ English Words",
        description: "Turn 1234 into “one thousand two hundred thirty-four” and back (spelled-out English, up to quadrillions).",
        sample: "1234",
        transform: (input) => {
            const t = input.trim();
            if (/^-?\d+(\.\d+)?$/.test(t)) return numberToWords(Number(t));
            return wordsToNumber(t);
        },
        note: "Type a number to spell it out; type the spelled-out words to parse it back.",
    }),
    makeTextTool({
        id: "x-temp",
        label: "Temperature ⇄ C / F / K / °R",
        description: "One temperature in all four scales — Celsius, Fahrenheit, Kelvin and Rankine.",
        sample: "100 C",
        transform: (input) => {
            const m = /^(-?\d+(?:\.\d+)?)\s*(c|celsius|f|fahrenheit|k|kelvin|r|rankine)?$/i.exec(input.trim());
            if (!m) return "Format: <value> <C|F|K|R> — e.g. “100 C” or “72 F”.";
            const v = Number(m[1]);
            const unit = (m[2] ?? "c").toLowerCase();
            let c: number;
            if (unit.startsWith("c")) c = v;
            else if (unit.startsWith("f")) c = ((v - 32) * 5) / 9;
            else if (unit.startsWith("k")) c = v - 273.15;
            else c = ((v - 491.67) * 5) / 9;
            return [
                `Celsius     : ${roundTo(c, 2)} °C`,
                `Fahrenheit  : ${roundTo((c * 9) / 5 + 32, 2)} °F`,
                `Kelvin      : ${roundTo(c + 273.15, 2)} K`,
                `Rankine     : ${roundTo((c + 273.15) * 1.8, 2)} °R`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-pct-fraction",
        label: "Percent / Fraction / Ratio",
        description: "One value as percent, reduced fraction and ratio — 0.125 ⇄ 12.5% ⇄ 1/8 ⇄ 1:8.",
        sample: "0.125",
        transform: (input) => {
            const t = input.trim();
            let num: number;
            let denom = 1;
            const mFrac = /^(-?\d+)\s*\/\s*(\d+)$/.test(t) ? /^(-?\d+)\s*\/\s*(\d+)$/.exec(t) : null;
            const mPct = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(t);
            const mRatio = /^(-?\d+)\s*:\s*(\d+)$/.exec(t);
            if (mFrac) {
                num = Number(mFrac[1]);
                denom = Number(mFrac[2]);
            } else if (mPct) num = Number(mPct[1]) / 100;
            else if (mRatio) {
                num = Number(mRatio[1]);
                denom = Number(mRatio[2]);
            } else num = Number(t);
            if (!Number.isFinite(num)) return "Paste 0.125, 12.5%, 1/8 or 1:8.";
            if (denom === 0) return "The denominator cannot be 0.";
            const pct = (num / denom) * 100;
            const total = Math.round(denom);
            const fnNum = Math.round((num / denom) * total);
            const gg = gcd(Math.abs(fnNum || total), total || 1) || 1;
            return [
                `Percent : ${roundTo(pct, 4)}%`,
                `Fraction: ${fnNum / gg}/${total / gg}`,
                `Ratio   : ${roundTo(num / denom, 4)} : 1  (or ${fnNum / gg}:${total / gg})`,
                `Decimal : ${roundTo(num / denom, 6)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-angle",
        label: "Angle ⇄ deg / rad / grad / turns",
        description: "An angle in degrees, radians, gradians and full turns at once.",
        sample: "90",
        transform: (input) => {
            const m = /^(-?\d+(?:\.\d+)?)\s*(deg|rad|grad|turn)?$/.exec(input.trim());
            if (!m) return "Format: <value> <deg|rad|grad|turn> — e.g. 90 or 1.5708 rad.";
            const v = Number(m[1]);
            const unit = (m[2] ?? "deg").toLowerCase();
            let deg: number;
            if (unit.startsWith("deg")) deg = v;
            else if (unit.startsWith("rad")) deg = (v * 180) / Math.PI;
            else if (unit.startsWith("grad")) deg = v * 0.9;
            else deg = v * 360;
            return [
                `Degrees : ${roundTo(deg, 4)}°`,
                `Radians : ${roundTo((deg * Math.PI) / 180, 6)}`,
                `Gradians: ${roundTo(deg / 0.9, 4)}`,
                `Turns   : ${roundTo(deg / 360, 6)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-delim-swap",
        label: "CSV ⇄ TSV / Delimiter Swap",
        description: "Re-delimit tabular text between comma / tab / semicolon / pipe — quoted cells survive the swap.",
        sample: 'name,"notes, with comma"\nalpha,"quoted"',
        transform: (input, opts) => {
            const from = String(opts.from || "auto");
            const to = String(opts.to || "tab");
            let delim: string;
            if (from === "auto") {
                const counts: Record<string, number> = {",": 0, "\t": 0, ";": 0, "|": 0};
                for (const ch of input) if (ch in counts) counts[ch]++;
                delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
            } else delim = from === "comma" ? "," : from === "semicolon" ? ";" : from === "pipe" ? "|" : "\t";
            const outDelim = to === "tab" ? "\t" : to === "comma" ? "," : to === "semicolon" ? ";" : "|";
            const lines = input.replace(/\r\n/g, "\n").split("\n");
            return lines
                .filter((l) => l.trim().length > 0)
                .map((l) => splitCsvLine(l, delim).map((c) => c.replace(/"/g, '""')).map((c) => (c.includes(outDelim) ? `"${c}"` : c)).join(outDelim))
                .join("\n");
        },
        options: [
            {
                key: "from",
                label: "Input delimiter",
                kind: "select",
                choices: [["auto", "Auto-detect"], ["comma", "Comma"], ["tab", "Tab"], ["semicolon", "Semicolon"], ["pipe", "Pipe"]],
                default: "auto"
            },
            {
                key: "to",
                label: "Output delimiter",
                kind: "select",
                choices: [["tab", "Tab"], ["comma", "Comma"], ["semicolon", "Semicolon"], ["pipe", "Pipe"]],
                default: "tab"
            },
        ],
    }),
    makeTextTool({
        id: "x-csv-jsonl",
        label: "CSV → JSON Lines",
        description: "Header row + data rows → one JSON object per line (JSONL / NDJSON).",
        sample: "name,score\nalice,9\nbob,11",
        transform: (input) => {
            // RFC-4180 parse (quoted fields with embedded commas/newlines
            // stay ONE cell) — the old line-splitter tore quoted multi-line
            // fields into phantom rows.
            const table = parseCsv(input.replace(/\r\n/g, "\n"));
            if (table.rows.length < 1) return "—";
            const header = table.rows[0].map((h, i) => h.trim() || `col_${i + 1}`);
            const out = table.rows.slice(1).map((cells) => {
                const obj: Record<string, string> = {};
                header.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
                return JSON.stringify(obj);
            });
            return out.join("\n") || "(no data rows)";
        },
    }),
    makeTextTool({
        id: "x-jsonl-array",
        label: "JSON Lines → JSON Array",
        description: "Pack an NDJSON stream into one pretty JSON array (and pretty-print each row).",
        sample: '{"a":1}\n{"a":2}',
        transform: (input) => {
            const rows: unknown[] = [];
            for (const l of input.split(/\r?\n/)) {
                if (!l.trim()) continue;
                rows.push(JSON.parse(l));
            }
            if (rows.length === 0) return "—";
            return JSON.stringify(rows, null, 2);
        },
    }),
    makeTextTool({
        id: "x-query-json",
        label: "Query String ⇄ JSON",
        description: "URL-encoded query params ⇄ a JSON object (arrays for repeated keys, URL-decoded values).",
        sample: "page=2&tag=red&tag=blue&sort=desc",
        transform: (input) => {
            const t = input.trim().replace(/^[?#]/, "");
            if (t.startsWith("{")) {
                try {
                    const obj = JSON.parse(t) as Record<string, string | string[]>;
                    const params = new URLSearchParams();
                    for (const [k, v] of Object.entries(obj)) {
                        if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
                        else params.append(k, String(v));
                    }
                    return params.toString();
                } catch (e) {
                    return `Invalid JSON: ${(e as Error).message}`;
                }
            }
            const params = new URLSearchParams(t);
            const obj: Record<string, string | string[]> = {};
            for (const key of new Set(params.keys())) {
                const all = params.getAll(key);
                obj[key] = all.length > 1 ? all : all[0];
            }
            return JSON.stringify(obj, null, 2);
        },
    }),
    makeTextTool({
        id: "x-html-table-csv",
        label: "HTML Table ⇄ CSV",
        description: "Extract rows/cells from pasted <table> markup into CSV — or build a minimal <table> from CSV.",
        sample: "<table><tr><td>a</td><td>b</td></tr></table>",
        transform: (input, opts) => {
            const mode = String(opts.mode || "auto");
            const isHtml = /<t[dhr]|<table/i.test(input);
            const htmlToCsv = mode === "htmlToCsv" || (mode === "auto" && isHtml);
            if (htmlToCsv) {
                const rows: string[][] = [];
                const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let rm: RegExpExecArray | null;
                while ((rm = rowRe.exec(input)) !== null) {
                    const cells: string[] = [];
                    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
                    let cm: RegExpExecArray | null;
                    while ((cm = cellRe.exec(rm[1])) !== null) {
                        cells.push(
                            cm[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
                        );
                    }
                    if (cells.length > 0) rows.push(cells);
                }
                if (rows.length === 0) return "No <tr>/<td> rows found.";
                const width = Math.max(...rows.map((r) => r.length));
                return rows.map((r) => r.map((c) => (c.includes(",") ? `"${c.replace(/"/g, '""')}"` : c)).join(",") + (r.length < width ? ",".repeat(width - r.length) : "")).join("\n");
            }
            const lines = input.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
            if (lines.length === 0) return "—";
            const body = lines
                .map((l) => {
                    const cells = splitCsvLine(l).map((c) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
                    return `      <tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
                })
                .join("\n");
            return `<table>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
        },
        options: [
            {
                key: "mode",
                label: "Direction",
                kind: "select",
                choices: [["auto", "Auto"], ["htmlToCsv", "HTML → CSV"], ["csvToHtml", "CSV → HTML"]],
                default: "auto"
            },
        ],
    }),
    makeTextTool({
        id: "x-sql-ddl-ts",
        label: "SQL CREATE TABLE → TypeScript",
        description: "A CREATE TABLE statement becomes a TypeScript interface (nullable columns become `T | null`).",
        sample: "CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  age INTEGER,\n  created_at TIMESTAMP\n);",
        transform: (input) => {
            const nameM = /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?([\w.]+)["'`]?/i.exec(input);
            if (!nameM) return "Paste a CREATE TABLE statement.";
            const rawName = nameM[1].split(".").pop() ?? nameM[1];
            const typeName = rawName.replace(/(^|_)(\w)/g, (_, p1: string, p2: string) => p1 ? p2.toUpperCase() : p2.toUpperCase()).replace(/^./, (c) => c.toUpperCase()).replace(/_/g, "");
            const bodyMatch = /\(([\s\S]*)\)/.exec(input);
            if (!bodyMatch) return "No column list found.";
            const body = bodyMatch[1];
            const typeMap: Record<string, string> = {
                int: "number", integer: "number", bigint: "number", smallint: "number", tinyint: "number",
                decimal: "number", numeric: "number", float: "number", double: "number", real: "number",
                boolean: "boolean", bool: "boolean",
                date: "string", datetime: "string", timestamp: "string", time: "string",
                text: "string", varchar: "string", char: "string", uuid: "string", json: "unknown", blob: "string",
            };
            const lines = body
                .split(/\r?\n/)
                .map((l) => l.trim().replace(/,$/, ""))
                .filter((l) => l && !/^(primary\s+key|foreign\s+key|constraint|unique|check|key)\b/i.test(l));
            const fields = lines.map((l) => {
                const m = /^["'`]?(\w+)["'`]?\s+([\w(]+)/i.exec(l);
                if (!m) return null;
                const col = m[1];
                const sqlType = m[2].toLowerCase();
                const ts = typeMap[sqlType] ?? "string";
                const nullable = !/\bnot\s+null\b/i.test(l) && !/primary\s+key/i.test(l);
                return `  ${col}: ${ts}${nullable ? " | null" : ""};`;
            });
            return `export interface ${typeName} {\n${fields.filter(Boolean).join("\n")}\n}`;
        },
    }),
    makeTextTool({
        id: "x-frontmatter-split",
        label: "Front-Matter ⇄ Markdown Body",
        description: "Split a `--- YAML ---` front-matter block from its Markdown body, or rebuild the file from both parts.",
        sample: "---\ntitle: Hello\n---\n\n# Body",
        transform: (input, opts) => {
            const mode = String(opts.mode || "split");
            if (mode === "split") {
                const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(input);
                if (!m) return "No `---` front-matter block found at the top.";
                return `── front matter ──\n${m[1].trim()}\n\n── body (${(m[2] || "").split(/\r?\n/).length} lines) ──\n${(m[2] ?? "").trim()}`;
            }
            // join: text before a blank separator line = YAML, after = body
            const parts = input.split(/\n-{3,}\n/);
            if (parts.length < 2) return "Paste the YAML, then a line of --- , then the body.";
            const yaml = parts[0].trim();
            const body = parts.slice(1).join("\n---\n").trim();
            return `---\n${yaml}\n---\n\n${body}`;
        },
        options: [
            {
                key: "mode",
                label: "Direction",
                kind: "select",
                choices: [["split", "Split file"], ["join", "YAML + body → file"]],
                default: "split"
            },
        ],
    }),
    makeTextTool({
        id: "x-mac-formats",
        label: "MAC Address Formats",
        description: "One MAC address in colon / hyphen / dot / Cisco and bare forms.",
        sample: "00:1A:2B:3C:4D:5E",
        transform: (input) => {
            const hex = input.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
            if (!/^[0-9a-f]{12}$/.test(hex)) return "Paste 12 hex digits (any common MAC format).";
            const pairs = [0, 2, 4, 6, 8, 10].map((i) => hex.slice(i, i + 2));
            return [
                `Colon : ${pairs.join(":")}`,
                `Hyphen: ${pairs.join("-")}`,
                `Dotted: ${[0, 1, 2].map((g) => pairs.slice(g * 2, g * 2 + 2).join("")).join(".")}`,
                `Bare  : ${hex}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-ini-json",
        label: "INI ⇄ JSON",
        description: "INI sections + keys ⇄ a nested JSON object (and back).",
        sample: "[owner]\nname = Alice\n\n[server]\nport = 8080\ndebug = true",
        transform: (input, opts) => {
            const toIni = String(opts.direction || "ini2json") === "json2ini";
            if (toIni) {
                let obj: Record<string, unknown>;
                try {
                    obj = JSON.parse(input.trim()) as Record<string, unknown>;
                } catch (e) {
                    return `Invalid JSON: ${(e as Error).message}`;
                }
                const out: string[] = [];
                for (const [k, v] of Object.entries(obj)) {
                    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                        out.push(`[${k}]`);
                        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out.push(`${k2} = ${JSON.stringify(v2)}`);
                        out.push("");
                    } else out.push(`${k} = ${JSON.stringify(v)}`);
                }
                return out.join("\n").trim();
            }
            const lines = input.replace(/\r\n/g, "\n").split("\n");
            const root: Record<string, unknown> = {};
            let section: Record<string, unknown> | null = null;
            for (const raw of lines) {
                const line = raw.trim();
                if (!line || line.startsWith(";") || line.startsWith("#")) continue;
                const sec = /^\[(.+)\]$/.exec(line);
                if (sec) {
                    section = {};
                    root[sec[1]] = section;
                    continue;
                }
                const kv = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
                if (kv) {
                    let val: unknown = kv[2].trim();
                    const bare = String(val);
                    if (bare.startsWith('"') && bare.endsWith('"')) val = bare.slice(1, -1);
                    else if (/^-?\d+(\.\d+)?$/.test(bare)) val = Number(bare);
                    else if (/^(true|false)$/i.test(bare)) val = bare.toLowerCase() === "true";
                    (section ?? root)[kv[1].trim()] = val;
                }
            }
            return JSON.stringify(root, null, 2);
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["ini2json", "INI → JSON"], ["json2ini", "JSON → INI"]],
                default: "ini2json"
            },
        ],
    }),
    makeTextTool({
        id: "x-csv-sql-insert",
        label: "CSV → SQL INSERTs",
        description: "Header + rows become parameterized INSERT statements (quoted strings, NULL for empties).",
        sample: "id,name\n1,alpha\n,beta",
        transform: (input, opts) => {
            const table = String(opts.table || "imported").replace(/[^A-Za-z0-9_]/g, "");
            const lines = input.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
            if (lines.length < 2) return "Need a header row and at least one data row.";
            const header = splitCsvLine(lines[0]).map((h) => h.trim() || "col");
            const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
            return lines
                .slice(1)
                .map((l) => {
                    const cells = splitCsvLine(l);
                    const values = header.map((_, i) => {
                        const c = (cells[i] ?? "").trim();
                        if (c === "") return "NULL";
                        if (/^-?\d+(\.\d+)?$/.test(c)) return c;
                        return q(c);
                    });
                    return `INSERT INTO ${table} (${header.join(", ")})\nVALUES (${values.join(", ")});`;
                })
                .join("\n");
        },
        options: [{
            key: "table",
            label: "Table name",
            kind: "select",
            choices: [["imported", "imported"]],
            default: "imported"
        }],
    }),
    makeTextTool({
        id: "x-sci-notation",
        label: "Scientific ⇄ Engineering Notation",
        description: "A number in scientific (1.23e4), engineering (12.3×10³) and plain comma forms.",
        sample: "1.234e7",
        transform: (input) => {
            const n = Number(input.trim());
            if (!Number.isFinite(n)) return "Paste a number (1.23e4, 0.00045, 1234567).";
            const sci = n.toExponential(4).replace(/e\+?/, " × 10^");
            const exp = Math.floor(Math.log10(Math.abs(n) || 1));
            const engExp = Math.floor(exp / 3) * 3;
            const mant = n / Math.pow(10, engExp);
            const sup = String(engExp).replace(/[0-9]/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]);
            return [
                `Scientific : ${sci}`,
                `Engineering: ${roundTo(mant, 4)} × 10${sup}`,
                `Plain      : ${n.toLocaleString("en-US")}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-geo-dms",
        label: "Latitude / Longitude ⇄ D·M·S",
        description: "Decimal degrees ⇄ degrees / minutes / seconds with hemisphere letters.",
        sample: "48.8584, 2.2945",
        transform: (input) => {
            const parts = input.split(/[,\s;]+/).map(Number).filter((n) => Number.isFinite(n));
            if (parts.length < 1) return "Paste 48.8584, 2.2945 (or a DMS pair).";
            const dms = (deg: number, pos: string, neg: string) => {
                const h = deg < 0 ? neg : pos;
                const a = Math.abs(deg);
                const d = Math.floor(a);
                const mFull = (a - d) * 60;
                const m = Math.floor(mFull);
                const s = (mFull - m) * 60;
                return `${h} ${d}° ${m}' ${roundTo(s, 3)}"`;
            };
            if (/^\s*\d+\s*°/.test(input)) {
                const nums = input.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
                if (nums.length >= 6) {
                    const lat = nums[0] + nums[1] / 60 + nums[2] / 3600;
                    const lon = nums[3] + nums[4] / 60 + nums[5] / 3600;
                    return `Decimal: ${roundTo(lat, 6)}, ${roundTo(lon, 6)}`;
                }
            }
            const [lat, lon] = parts;
            return [
                `Latitude : ${dms(lat, "N", "S")}`,
                `Longitude: ${dms(lon, "E", "W")}`,
                `Decimal : ${roundTo(lat, 6)}, ${roundTo(lon, 6)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-datauri-split",
        label: "Data URL ⇄ MIME + Base64 body",
        description: "Split a data: URL into its MIME type + base64 payload (and rebuild one from the parts).",
        sample: "data:image/png;base64,iVBORw0KGgo=",
        transform: (input) => {
            const t = input.trim();
            const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(t);
            if (m) {
                const body = m[3];
                let decoded = "";
                if (m[2]) {
                    try {
                        decoded = atob(body.replace(/\s/g, ""));
                    } catch {
                        decoded = "(payload is not decodable text)";
                    }
                } else decoded = decodeURIComponent(body);
                return [
                    `MIME     : ${m[1]}`,
                    `Encoding : ${m[2] ? "base64" : "URL-encoded"}`,
                    `Body len : ${body.length} chars`,
                    `Decoded  : ${decoded.slice(0, 400)}${decoded.length > 400 ? "…" : ""}`,
                ].join("\n");
            }
            const lines = t.split(/\r?\n/).filter(Boolean);
            if (lines.length >= 2) return `data:${lines[0].trim()};base64,${lines[1].replace(/\s/g, "")}`;
            return "Paste a data: URL, or a MIME line + a base64 line to join.";
        },
    }),
    makeTextTool({
        id: "x-text-html",
        label: "Plain Text ⇄ HTML Paragraphs",
        description: "Wrap plain text lines into <p> paragraphs (blank-line separated) — or strip tags back to text.",
        sample: "First paragraph.\n\nSecond line here.",
        transform: (input, opts) => {
            const toHtml = String(opts.direction || "toHtml") === "toHtml";
            if (toHtml) {
                const blocks = input.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
                if (blocks.length === 0) return "—";
                return blocks
                    .map((b) => `<p>${b.split("\n").join("<br>\n  ")}</p>`)
                    .join("\n");
            }
            return input
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n\n")
                .replace(/<[^>]+>/g, "")
                .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
                .trim();
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toHtml", "Text → HTML"], ["toText", "HTML → text"]],
                default: "toHtml"
            },
        ],
    }),
    makeTextTool({
        id: "x-width-swap",
        label: "Halfwidth ⇄ Fullwidth",
        description: "Convert ASCII-range characters to their fullwidth CJK twins (０-ＦＦ) and back — the classic IME artifact fix.",
        sample: "ABC 123",
        transform: (input, opts) => {
            const toFull = String(opts.direction || "toFull") === "toFull";
            if (toFull) {
                return input.replace(/[\x20-\x7E]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
            }
            return input.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, " ");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toFull", "→ Fullwidth"], ["toHalf", "→ Halfwidth"]],
                default: "toFull"
            },
        ],
    }),
    makeTextTool({
        id: "x-unicode-norm",
        label: "Unicode Normalization (NFC/NFD/NFKC/NFKD)",
        description: "One text through all four Unicode normal forms — canonical, compatibility, composed and decomposed.",
        sample: "café",
        transform: (input) => {
            const forms = ["NFC", "NFD", "NFKC", "NFKD"] as const;
            return forms
                .map((f) => {
                    const out = input.normalize(f);
                    return `${f}: ${out}\n     ${[...out].map((c) => `U+${c.codePointAt(0)!.toString(16).padStart(4, "0").toUpperCase()}`).join(" ")}`;
                })
                .join("\n");
        },
    }),
    makeTextTool({
        id: "x-bin-text",
        label: "Text ⇄ Binary (UTF-8 0/1)",
        description: "Encode text as space-separated UTF-8 bits — and decode a bit stream back to text.",
        sample: "Hi",
        transform: (input, opts) => {
            const encode = String(opts.direction || "encode") === "encode";
            if (encode) {
                return [...utf8ToBytes(input)].map((b) => b.toString(2).padStart(8, "0")).join(" ");
            }
            const bits = input.replace(/[^01]/g, "");
            if (bits.length % 8 !== 0) return `${bits.length % 8} leftover bit(s) — paste full 8-bit groups.`;
            const bytes = new Uint8Array(bits.length / 8);
            for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
            return bytesToUtf8(bytes);
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → bits"], ["decode", "Bits → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-logfmt-json",
        label: "Logfmt ⇄ JSON",
        description: "key=value log lines (logfmt) ⇄ JSON objects per line.",
        sample: "level=info msg=started dur=42",
        transform: (input, opts) => {
            const toJson = String(opts.direction || "toJson") === "toJson";
            const parseLogfmt = (line: string): Record<string, string | number | boolean> => {
                const out: Record<string, string | number | boolean> = {};
                const re = /(\w+)=(?:"([^"]*)"|([^\s]+))/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(line)) !== null) {
                    const v = m[2] ?? m[3] ?? "";
                    if (/^-?\d+(\.\d+)?$/.test(v)) out[m[1]] = Number(v);
                    else if (v === "true" || v === "false") out[m[1]] = v === "true";
                    else out[m[1]] = v;
                }
                return out;
            };
            if (toJson) {
                return input
                    .split(/\r?\n/)
                    .filter((l) => l.trim())
                    .map((l) => JSON.stringify(parseLogfmt(l)))
                    .join("\n") || "—";
            }
            return input
                .split(/\r?\n/)
                .filter((l) => l.trim())
                .map((l) => {
                    try {
                        const obj = JSON.parse(l) as Record<string, unknown>;
                        return Object.entries(obj)
                            .map(([k, v]) => `${k}=${typeof v === "string" && /\s/.test(v) ? `"${v}"` : String(v)}`)
                            .join(" ");
                    } catch {
                        return l;
                    }
                })
                .join("\n") || "—";
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toJson", "logfmt → JSON"], ["toLogfmt", "JSON → logfmt"]],
                default: "toJson"
            },
        ],
    }),
    makeTextTool({
        id: "x-json-case",
        label: "JSON Key Case (deep)",
        description: "Rename EVERY object key (at any depth) between snake_case / camelCase / kebab-case / PascalCase.",
        sample: '{"user_name": {"first_name": "Ada"}}',
        transform: (input, opts) => {
            const style = String(opts.style || "camel");
            let obj: unknown;
            try {
                obj = JSON.parse(input);
            } catch (e) {
                return `Invalid JSON: ${(e as Error).message}`;
            }
            const toWords = (key: string): string[] => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_\-.]+/).filter(Boolean);
            const convert = (k: string): string => {
                const w = toWords(k).map((x) => x.toLowerCase());
                if (style === "camel") return w.map((x, i) => (i === 0 ? x : x[0].toUpperCase() + x.slice(1))).join("");
                if (style === "pascal") return w.map((x) => x[0].toUpperCase() + x.slice(1)).join("");
                if (style === "kebab") return w.join("-");
                return w.join("_");
            };
            const walk = (node: unknown): unknown => {
                if (Array.isArray(node)) return node.map(walk);
                if (node && typeof node === "object") {
                    const out: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[convert(k)] = walk(v);
                    return out;
                }
                return node;
            };
            return JSON.stringify(walk(obj), null, 2);
        },
        options: [
            {
                key: "style",
                label: "Target case",
                kind: "select",
                choices: [["camel", "camelCase"], ["snake", "snake_case"], ["kebab", "kebab-case"], ["pascal", "PascalCase"]],
                default: "camel"
            },
        ],
    }),
    makeTextTool({
        id: "x-custom-base",
        label: "Custom-Alphabet Base",
        description: "Convert integers with YOUR alphabet (any base ≥ 2, e.g. hexadecimal without letters you dislike).",
        sample: "2026\n0123456789abcdef",
        transform: (input, opts) => {
            const dir = String(opts.direction || "toCustom");
            const alphabet = String(opts.alphabet || "").replace(/\s+/g, "").replace(/(.)\1+/g, "$1");
            if (alphabet.length < 2) return "Provide an alphabet of ≥ 2 unique characters (options above).";
            if (dir === "toCustom") {
                const n = Number(input.trim());
                if (!Number.isInteger(n) || n < 0) return "Paste a non-negative integer.";
                return `${encodeBaseN(BigInt(n), alphabet)}\n(base ${alphabet.length})`;
            }
            return `${decodeBaseN(input.trim(), alphabet).toString()}\n(base ${alphabet.length})`;
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toCustom", "Number → custom"], ["fromCustom", "Custom → number"]],
                default: "toCustom"
            },
            {
                key: "alphabet",
                label: "Alphabet",
                kind: "select",
                choices: [["0123456789abcdef", "hex-ish (16)"], ["0123456789abcdefghijklmnopqrstuvwxyz", "base36"], ["abcdefghij", "base10 letters"]],
                default: "0123456789abcdef"
            },
        ],
        note: "The alphabet presets are editable starting points — paste your own in the input below the chosen preset.",
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  ENCODERS — 25 additional (5 → 30)
 * ══════════════════════════════════════════════════════════════════ */

/** Base32 encode (RFC 4648-style alphabet, no padding). */
function base32Encode(bytes: Uint8Array, alphabet: string): string {
    let out = "";
    let bits = 0;
    let acc = 0;
    for (const b of bytes) {
        acc = (acc << 8) | b;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += alphabet[(acc >>> bits) & 31];
        }
    }
    if (bits > 0) out += alphabet[(acc << (5 - bits)) & 31];
    return out;
}

function base32Decode(text: string, alphabet: string): Uint8Array {
    const clean = text.toUpperCase().replace(new RegExp(`[^${alphabet}]`, "g"), "");
    let acc = 0;
    let bits = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const v = alphabet.indexOf(ch);
        if (v < 0) continue;
        acc = (acc << 5) | v;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out.push((acc >>> bits) & 0xff);
        }
    }
    return new Uint8Array(out);
}

/** Base45 (RFC 9285 alphabet) encode of UTF-8 bytes. */
function base45Encode(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 >= bytes.length) {
            const n = bytes[i];
            out += B45_ALPHABET[n % 45] + B45_ALPHABET[Math.floor(n / 45)];
        } else {
            const n = bytes[i] * 256 + bytes[i + 1];
            out +=
                B45_ALPHABET[Math.floor(n / 2025)] +
                B45_ALPHABET[Math.floor(n / 45) % 45] +
                B45_ALPHABET[n % 45];
        }
    }
    return out;
}

function base45Decode(text: string): Uint8Array {
    const clean = text.replace(/[^0-9A-Za-z $%*+./:-]/g, "");
    const vals = clean.split("").map((c) => B45_ALPHABET.indexOf(c));
    if (vals.some((v) => v < 0)) throw new Error("Character outside the Base45 alphabet.");
    const out: number[] = [];
    for (let i = 0; i < vals.length; i += 3) {
        const chunk = vals.slice(i, i + 3);
        if (chunk.length < 2) throw new Error("Truncated Base45 group.");
        if (chunk.length === 2) {
            const n = chunk[0] + chunk[1] * 45;
            out.push(n % 256);
            if (Math.floor(n / 256) > 0) out.push(Math.floor(n / 256));
        } else {
            const n = chunk[0] + chunk[1] * 45 + chunk[2] * 2025;
            out.push(Math.floor(n / 256));
            out.push(n % 256);
        }
    }
    return new Uint8Array(out);
}

const BRAILLE_MAP: Record<string, string> = {
    a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛", h: "⠓",
    i: "⠊", j: "⠚", k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕", p: "⠏",
    q: "⠟", r: "⠗", s: "⠎", t: "⠞", u: "⠥", v: "⠧", w: "⠺", x: "⠭",
    y: "⠽", z: "⠵",
    "1": "⠼⠁", "2": "⠼⠃", "3": "⠼⠉", "4": "⠼⠙", "5": "⠼⠑",
    "6": "⠼⠋", "7": "⠼⠛", "8": "⠼⠓", "9": "⠼⠊", "0": "⠼⠚",
};
const BRAILLE_REVERSE: Record<string, string> = {};
for (const [k, v] of Object.entries(BRAILLE_MAP)) {
    if (!(v in BRAILLE_REVERSE)) BRAILLE_REVERSE[v] = k;
}

const FOLD_MAP: Record<string, string> = {
    á: "a", à: "a", â: "a", ä: "a", ã: "a", å: "a", ā: "a", ă: "a", ą: "a",
    é: "e", è: "e", ê: "e", ë: "e", ē: "e", ĕ: "e", ę: "e", ė: "e",
    í: "i", ì: "i", î: "i", ï: "i", ī: "i", ĭ: "i", į: "i", ı: "i",
    ó: "o", ò: "o", ô: "o", ö: "o", õ: "o", ő: "o", ø: "o",
    ú: "u", ù: "u", û: "u", ü: "u", ũ: "u", ū: "u", ŭ: "u", ů: "u",
    ý: "y", ÿ: "y", ĉ: "c", ċ: "c", č: "c", ď: "d", đ: "d", ĝ: "g",
    ġ: "g", ğ: "g", ĥ: "h", ħ: "h", ĵ: "j", ķ: "k", ĺ: "l", ľ: "l",
    ŀ: "l", ł: "l", ń: "n", ň: "n", ŉ: "n", ŋ: "n", ř: "r", ŕ: "r",
    ś: "s", ŝ: "s", š: "s", ş: "s", ť: "t", ţ: "t", ŵ: "w", ź: "z",
    ż: "z", ž: "z", ç: "c", ñ: "n", ð: "d", þ: "th",
    "Á": "A", "À": "A", "Â": "A", "Ä": "A", "Ã": "A", "Å": "A", "Ā": "A", "Ă": "A", "Ą": "A",
    "É": "E", "È": "E", "Ê": "E", "Ë": "E", "Ē": "E", "Ĕ": "E", "Ę": "E", "Ė": "E",
    "Í": "I", "Ì": "I", "Î": "I", "Ï": "I", "Ī": "I", "Ĭ": "I", "Į": "I", "İ": "I",
    "Ó": "O", "Ò": "O", "Ô": "O", "Ö": "O", "Õ": "O", "Ő": "O", "Ø": "O",
    "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U", "Ũ": "U", "Ū": "U", "Ŭ": "U", "Ů": "U",
    "Ý": "Y", "Ÿ": "Y", "Č": "C", "Ć": "C", "Ď": "D", "Đ": "D", "Ĝ": "G",
    "Ğ": "G", "Ĥ": "H", "Ĵ": "J", "Ķ": "K", "Ĺ": "L", "Ľ": "L", "Ł": "L",
    "Ń": "N", "Ň": "N", "Ř": "R", "Ŕ": "R", "Ś": "S", "Š": "S", "Ş": "S",
    "Ť": "T", "Ţ": "T", "Ŵ": "W", "Ź": "Z", "Ż": "Z", "Ž": "Z", "Ç": "C", "Ñ": "N", "Ð": "D", "Þ": "TH",
};

/** Ascii85 encode (Adobe-style, <~ ~> wrapper off by default). */
function ascii85Encode(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 4) {
        const b0 = bytes[i] ?? 0;
        const b1 = bytes[i + 1] ?? 0;
        const b2 = bytes[i + 2] ?? 0;
        const b3 = bytes[i + 3] ?? 0;
        const n = ((b0 * 256 + b1) * 256 + b2) * 256 + b3;
        const partial = i + 4 > bytes.length ? bytes.length - i : 4;
        const c = (x: number) => String.fromCharCode(x + 33);
        if (b0 === 0 && b1 === 0 && b2 === 0 && b3 === 0 && partial === 4) {
            out += "z";
            continue;
        }
        let group = c(Math.floor(n / 85 ** 4));
        group += c(Math.floor(n / 85 ** 3) % 85);
        if (partial >= 2) group += c(Math.floor(n / 85 ** 2) % 85);
        if (partial >= 3) group += c(Math.floor(n / 85) % 85);
        if (partial >= 4) group += c(n % 85);
        out += group;
    }
    return out;
}

function ascii85Decode(text: string): Uint8Array {
    const clean = text.replace(/<\~|\~>/g, "").replace(/\s/g, "");
    // "z" is the shorthand for four zero bytes.
    const expanded = clean.replace(/z/g, "!!!!!");
    const out: number[] = [];
    for (let i = 0; i < expanded.length; i += 5) {
        const chunk = expanded.slice(i, i + 5);
        let n = 0;
        for (const ch of chunk) {
            const v = ch.charCodeAt(0) - 33;
            if (v < 0 || v > 84) throw new Error(`Bad Ascii85 char: ${ch}`);
            n = n * 85 + v;
        }
        // A group of k chars encodes k-1 bytes (k = 2..5).
        const byteCount = chunk.length - 1;
        const bytes = [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
        for (let b = 0; b < byteCount; b++) out.push(bytes[b]);
    }
    return new Uint8Array(out);
}

export const EXTRA_ENCODER_TOOLS = [
    makeTextTool({
        id: "x-base32",
        label: "Base32 ⇄ text (RFC 4648)",
        description: "Standard Base32 (A-Z2-7) encode/decode of UTF-8 text — no padding, case-insensitive decode.",
        sample: "hello",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) return bytesToUtf8(base32Decode(input, B32_ALPHABET));
            return base32Encode(utf8ToBytes(input), B32_ALPHABET);
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → Base32"], ["decode", "Base32 → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-base45",
        label: "Base45 ⇄ text (RFC 9285)",
        description: "The Base45 codec from QR-driven EU digital COVID certificates — encode and decode.",
        sample: "hello",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) return bytesToUtf8(base45Decode(input));
            return base45Encode(utf8ToBytes(input));
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → Base45"], ["decode", "Base45 → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-crockford32",
        label: "Crockford Base32 ⇄ number",
        description: "Douglas Crockford's human-error-resistant Base32 (no I/L/O/U) for integers — encode and decode.",
        sample: "123456789",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) return decodeBaseN(input.trim().toUpperCase().replace(/O/g, "0"), CROCKFORD_ALPHABET).toString();
            return encodeBaseN(BigInt(input.trim()), CROCKFORD_ALPHABET);
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Number → Crockford"], ["decode", "Crockford → number"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-hex-text",
        label: "Hex ⇄ text (UTF-8 bytes)",
        description: "UTF-8 text as a hex byte stream — and back. Tolerant of spaces, colons and 0x prefixes.",
        sample: "68 69",
        transform: (input, opts) => {
            const decode = String(opts.direction || "decode") === "decode";
            if (decode) return bytesToUtf8(hexToBytes(input));
            return bytesToHex(utf8ToBytes(input)).replace(/(..)/g, "$1 ").trim();
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["decode", "Hex → text"], ["encode", "Text → hex"]],
                default: "decode"
            },
        ],
    }),
    makeTextTool({
        id: "x-octal-text",
        label: "Octal ⇄ text (byte codes)",
        description: "Text ⇄ octal byte codes (\\157\\156 style) — the classic C-string escape form.",
        sample: "150 151",
        transform: (input, opts) => {
            const decode = String(opts.direction || "decode") === "decode";
            if (decode) {
                const codes = input.match(/[0-7]{1,3}/g) ?? [];
                return bytesToUtf8(new Uint8Array(codes.map((c) => parseInt(c, 8))));
            }
            return [...utf8ToBytes(input)].map((b) => "\\" + b.toString(8).padStart(3, "0")).join("");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["decode", "Octal → text"], ["encode", "Text → octal"]],
                default: "decode"
            },
        ],
    }),
    makeTextTool({
        id: "x-ascii85",
        label: "Ascii85 ⇄ text",
        description: "Ascii85 (base85) encode/decode — 5 printable characters per 4 bytes, zero-runs collapse to “z”.",
        sample: "hello world",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) return bytesToUtf8(ascii85Decode(input));
            return ascii85Encode(utf8ToBytes(input));
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → Ascii85"], ["decode", "Ascii85 → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-b64url",
        label: "Base64url ⇄ text",
        description: "URL-safe Base64 ( - and _ instead of + and /) — the JWT / filename-safe variant.",
        sample: "hello",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                const std = input.replace(/-/g, "+").replace(/_/g, "/");
                const bytes = Uint8Array.from(atob(std), (c) => c.charCodeAt(0));
                return bytesToUtf8(bytes);
            }
            const b64 = btoa(String.fromCharCode(...utf8ToBytes(input)));
            return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → Base64url"], ["decode", "Base64url → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-b64hex",
        label: "Base64 ⇄ Hex (cross-codec)",
        description: "Convert a Base64 payload to hex and back — no text roundtrip, byte-exact.",
        sample: "aGVsbG8=",
        transform: (input, opts) => {
            const toHex = String(opts.direction || "toHex") === "toHex";
            if (toHex) {
                const t = input.trim();
                return bytesToHex(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
            }
            const bytes = hexToBytes(input);
            return btoa(String.fromCharCode(...bytes));
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toHex", "Base64 → Hex"], ["toB64", "Hex → Base64"]],
                default: "toHex"
            },
        ],
    }),
    makeTextTool({
        id: "x-braille",
        label: "Braille ⇄ text (grade 1)",
        description: "Latin letters and digits ⇄ Unicode Braille patterns (one cell per character, grade 1).",
        sample: "abc 123",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                let out = "";
                let num = false;
                for (const cell of input) {
                    if (cell === "⠼") {
                        num = true;
                        continue;
                    }
                    const mapped = BRAILLE_REVERSE[cell] ?? (cell === " " ? " " : "");
                    if (mapped) out += num ? mapped : mapped.toUpperCase() === mapped && mapped.length === 1 ? mapped.toLowerCase() : mapped;
                    if (cell === " ") num = false;
                }
                return out;
            }
            return input.toLowerCase().split("").map((c) => BRAILLE_MAP[c] ?? (/\s/.test(c) ? c : "")).join("");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → Braille"], ["decode", "Braille → text"]],
                default: "encode"
            },
        ],
        note: "Grade 1 only — one cell per letter. Numbers use the ⠼ (number sign) prefix.",
    }),
    makeTextTool({
        id: "x-ncr",
        label: "Numeric Character Refs ⇄ text",
        description: "&#104;&#105; style numeric entities (decimal or hex) ⇄ the characters they name.",
        sample: "&#104;&#x69;",
        transform: (input, opts) => {
            const decode = String(opts.direction || "decode") === "decode";
            if (decode) {
                return input.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex: string, dec: string) =>
                    String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec))
                );
            }
            return [...input].map((c) => `&#${c.codePointAt(0)!};`).join("");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["decode", "NCR → text"], ["encode", "Text → NCR"]],
                default: "decode"
            },
        ],
    }),
    makeTextTool({
        id: "x-leet",
        label: "Leetspeak ⇄ text",
        description: "h3ll0 w0rld — the classic leet letter substitutions, both directions.",
        sample: "hello world",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                return input.replace(/[4@]/g, "a").replace(/[3]/g, "e").replace(/[1!]/g, "i").replace(/[0]/g, "o").replace(/[5]/g, "s").replace(/[7]/g, "t").replace(/[8]/g, "b").replace(/\+/g, "g");
            }
            return input.replace(/a/gi, "4").replace(/e/gi, "3").replace(/i/gi, "1").replace(/o/gi, "0").replace(/s/gi, "5").replace(/t/gi, "7").replace(/b/gi, "8");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → leet"], ["decode", "Leet → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-piglatin",
        label: "Pig Latin",
        description: "Translate English words into Pig Latin ( consonant clusters move + “ay”).",
        sample: "hello world",
        transform: (input) => {
            return input
                .toLowerCase()
                .split(/(\s+)/)
                .map((w) => {
                    if (!/[a-z]/.test(w)) return w;
                    const m = /^([^aeiouy]*)([a-z]+)$/i.exec(w.replace(/[^a-z]/g, ""));
                    if (!m) return w;
                    const [lead, rest] = [m[1], m[2]];
                    return (lead ? rest : w.replace(/[^a-z]/g, "")) + lead + "ay";
                })
                .join("");
        },
    }),
    makeTextTool({
        id: "x-runlength",
        label: "Run-Length ⇄ text",
        description: "Classic RLE codec — aaaaabbb → 5a3b (count-min for runs ≥ 2) and back.",
        sample: "aaaaabbbcc",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                return input.replace(/(\d+)(.)/g, (_, n: string, ch: string) => ch.repeat(Number(n)));
            }
            return input.replace(/(.)\1+/g, (run, ch: string) => `${run.length}${ch}`);
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → RLE"], ["decode", "RLE → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-gray-code",
        label: "Gray Code ⇄ Binary",
        description: "Binary reflected Gray code ⇄ plain binary — one bit flips per step.",
        sample: "101",
        transform: (input, opts) => {
            const decode = String(opts.direction || "toGray") === "fromGray";
            const bits = input.replace(/[^01]/g, "");
            if (!bits) return "Paste a binary number.";
            if (decode) {
                let out = bits[0];
                for (let i = 1; i < bits.length; i++) out += String(Number(bits[i]) ^ Number(out[out.length - 1]));
                return `binary: ${out}`;
            }
            let out = bits[0];
            for (let i = 1; i < bits.length; i++) out += String(Number(bits[i]) ^ Number(bits[i - 1]));
            return `gray: ${out}`;
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toGray", "Binary → Gray"], ["fromGray", "Gray → binary"]],
                default: "toGray"
            },
        ],
    }),
    makeTextTool({
        id: "x-quoted-printable",
        label: "Quoted-Printable ⇄ text",
        description: "The MIME Quoted-Printable codec (RFC 2045, =XX escapes and soft line breaks).",
        sample: "h=65llo",
        transform: (input, opts) => {
            const decode = String(opts.direction || "decode") === "decode";
            if (decode) {
                return input
                    .replace(/=\r?\n/g, "")
                    .replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
            }
            return Array.from(utf8ToBytes(input))
                .map((b) => (b === 61 || b < 33 || b > 126 ? "=" + b.toString(16).toUpperCase().padStart(2, "0") : String.fromCharCode(b)))
                .join("")
                .replace(/(.{75})(?=.)/g, "$1=\n");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["decode", "QP → text"], ["encode", "Text → QP"]],
                default: "decode"
            },
        ],
    }),
    makeTextTool({
        id: "x-tapcode",
        label: "Tap Code (Polybius 5×5)",
        description: "Letters → coordinate taps (I/J share a cell) — the classic prisoner's knock code.",
        sample: "hello",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            const grid = "abcde".split("").flatMap((r, ri) => "abcde".split("").map((_, ci) => [r, ri + 1, ci + 1]));
            void grid;
            const pos = (ch: string): [number, number] | null => {
                const c = ch.toLowerCase();
                const idx = "abcdefghiklmnopqrstuvwxyz".indexOf(c); // I/J merged
                return idx < 0 ? null : [Math.floor(idx / 5) + 1, (idx % 5) + 1];
            };
            const at = (r: number, c: number): string => "abcdefghiklmnopqrstuvwxyz"[(r - 1) * 5 + (c - 1)];
            if (decode) {
                const nums = (input.match(/\d/g) ?? []).map(Number);
                const pairs: string[] = [];
                for (let i = 0; i + 1 < nums.length; i += 2) {
                    const r = nums[i];
                    const c = nums[i + 1];
                    if (r < 1 || r > 5 || c < 1 || c > 5) return "Digits must be 1-5 in row/column pairs.";
                    pairs.push(at(r, c).toUpperCase());
                }
                return pairs.join("");
            }
            return input
                .toLowerCase()
                .split("")
                .map((ch) => {
                    const p = pos(ch);
                    if (!p) return /\s/.test(ch) ? "  " : "";
                    return `${p[0]} ${p[1]}`;
                })
                .join(" ")
                .trim();
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → taps"], ["decode", "Taps → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-a1z26",
        label: "A1Z26 (letters ⇄ positions)",
        description: "a=1 … z=26 — letters ⇄ their alphabet positions (hyphen-separated).",
        sample: "8-5-12-12-15",
        transform: (input, opts) => {
            const decode = String(opts.direction || "decode") === "decode";
            if (decode) {
                return input
                    .split(/[-\s,]+/)
                    .filter(Boolean)
                    .map((n) => {
                        const v = Number(n);
                        return v >= 1 && v <= 26 ? "abcdefghijklmnopqrstuvwxyz"[v - 1] : "?";
                    })
                    .join("");
            }
            return input.toLowerCase().replace(/[^a-z]/g, "").split("").map((c) => c.charCodeAt(0) - 96).join("-");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["decode", "Positions → text"], ["encode", "Text → positions"]],
                default: "decode"
            },
        ],
    }),
    makeTextTool({
        id: "x-bcd",
        label: "BCD ⇄ decimal",
        description: "Binary-coded decimal — each digit becomes 4 bits, and back.",
        sample: "123",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                const bits = input.replace(/[^01]/g, "");
                if (bits.length % 4 !== 0) return "BCD needs 4-bit groups.";
                let out = "";
                for (let i = 0; i < bits.length; i += 4) {
                    const v = parseInt(bits.slice(i, i + 4), 2);
                    if (v > 9) return `Nibble ${bits.slice(i, i + 4)} is not a BCD digit.`;
                    out += v;
                }
                return out;
            }
            return input.replace(/[^0-9]/g, "").split("").map((d) => Number(d).toString(2).padStart(4, "0")).join(" ");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Decimal → BCD"], ["decode", "BCD → decimal"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-varint",
        label: "LEB128 Varint ⇄ number",
        description: "Protocol Buffers' base-128 varints (each byte carries 7 bits, MSB = more) ⇄ decimal.",
        sample: "300",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                const bytes = input.replace(/[^0-9]/g, "").match(/\d{1,3}/g) ?? [];
                let value = 0n;
                let shift = 0n;
                for (const b of bytes.map(Number)) {
                    value |= BigInt(b & 0x7f) << shift;
                    if ((b & 0x80) === 0) break;
                    shift += 7n;
                }
                return value.toString();
            }
            let n = BigInt(input.trim());
            if (n < 0n) return "Varints encode non-negative integers.";
            const out: number[] = [];
            do {
                let b = Number(n & 0x7fn);
                n >>= 7n;
                if (n > 0n) b |= 0x80;
                out.push(b);
            } while (n > 0n);
            return out.map((b) => b.toString().padStart(3, "0")).join(" ");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Number → varint"], ["decode", "Varint → number"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-base62",
        label: "Base62 ⇄ number",
        description: "0-9A-Za-z base-62 integers — the URL-shortener ID alphabet.",
        sample: "123456789",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) return decodeBaseN(input.trim(), B62_ALPHABET).toString();
            return encodeBaseN(BigInt(input.trim()), B62_ALPHABET);
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Number → Base62"], ["decode", "Base62 → number"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-csv-escape",
        label: "CSV Cell Escaping ⇄ raw",
        description: "RFC 4180 quoting — wrap cells with commas/quotes in doubled quotes, or strip the quotes back.",
        sample: 'has, comma',
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                return input.replace(/^"([\s\S]*)"$/s, (_, body: string) => body.replace(/""/g, '"'));
            }
            return input.includes(",") || input.includes('"') ? `"${input.replace(/"/g, '""')}"` : input;
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Raw → quoted"], ["decode", "Quoted → raw"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-cdata",
        label: "CDATA Wrap / Unwrap",
        description: "Wrap text in an XML <![CDATA[ … ]]> section — or extract the payload back out.",
        sample: "1 < 2 & 3 > 2",
        transform: (input, opts) => {
            const unwrap = String(opts.direction || "wrap") === "unwrap";
            if (unwrap) {
                const m = /<!\[CDATA\[([\s\S]*)\]\]>/g;
                const found = [...input.matchAll(m)].map((x) => x[1]);
                return found.length ? found.join("\n") : "No CDATA section found.";
            }
            return `<![CDATA[\n${input}\n]]>`;
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["wrap", "Wrap in CDATA"], ["unwrap", "Extract CDATA"]],
                default: "wrap"
            },
        ],
    }),
    makeTextTool({
        id: "x-utf16-units",
        label: "UTF-16 Units ⇄ text",
        description: "The exact UTF-16 code units of the text (surrogate pairs visible) — and back from \\uXXXX pairs.",
        sample: "a😀b",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            if (decode) {
                const units = input.match(/\\u[0-9a-f]{4}/gi) ?? [];
                return units.map((u) => String.fromCharCode(parseInt(u.slice(2), 16))).join("");
            }
            const units: string[] = [];
            for (let i = 0; i < input.length; i++) {
                units.push("\\u" + input.charCodeAt(i).toString(16).padStart(4, "0"));
            }
            return units.join(" ");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encode", "Text → \\uXXXX"], ["decode", "\\uXXXX → text"]],
                default: "encode"
            },
        ],
    }),
    makeTextTool({
        id: "x-fold-ascii",
        label: "Fold Accents → ASCII",
        description: "é→e, ü→u — strip Latin diacritics down to plain ASCII (classic search-index folding).",
        sample: "café über naïve",
        transform: (input, opts) => {
            const restore = String(opts.direction || "fold") === "restore";
            if (restore) return "Folding is one-way — keep the original text for the accented form.";
            let out = "";
            for (const ch of input) out += FOLD_MAP[ch] ?? ch;
            return out.normalize("NFD").replace(/[\u0300-\u036f]/g, (m) => FOLD_MAP[m] ?? "");
        },
        options: [
            {key: "direction", label: "Mode", kind: "select", choices: [["fold", "Fold to ASCII"]], default: "fold"},
        ],
    }),
    makeTextTool({
        id: "x-shell-quote",
        label: "Shell Quote ⇄ raw",
        description: "POSIX shell quoting — make a string safe for sh (single-quote wrapping, ' escape trick).",
        sample: "it's 42",
        transform: (input, opts) => {
            const decode = String(opts.direction || "quote") === "unquote";
            if (decode) {
                return input
                    .replace(/'((?:[^']|'\\''|'\\'')*)'/g, (_, body: string) => body.replace(/'\\''|'\\''/g, "'"))
                    .replace(/"([\s\S]*)"/, (_, b: string) => b);
            }
            return "'" + input.replace(/'/g, "'\\''") + "'";
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["quote", "Raw → shell-safe"], ["unquote", "Shell → raw"]],
                default: "quote"
            },
        ],
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  TEXT — 16 additional (14 → 30)
 * ══════════════════════════════════════════════════════════════════ */

const STOPWORDS = new Set(
    ("a about above after again all am an and any are as at be because been before being below between both but by " +
        "can did do does doing down during each few for from further had has have having he her here hers herself him " +
        "himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only " +
        "or other our ours ourselves out over own same she should so some such than that the their theirs them " +
        "themselves then there these they this those through to too under until up very was we were what when where " +
        "which while who whom why will with you your yours yourself yourselves").split(" ")
);

const LIGATURES: ReadonlyArray<readonly [string, string]> = [
    ["!=", "≠"], ["<=", "≤"], [">=", "≥"], ["->", "→"], ["=>", "⇒"], ["::", "∷"],
    ["==", "≟"], ["!=", "≠"], ["<>", "≠"], [":=", "≔"], ["..", "‥"], ["//", "⁄"],
];

export const EXTRA_TEXT_TOOLS = [
    makeTextTool({
        id: "x-column-cut",
        label: "Extract Column",
        description: "Pick one column out of delimited lines (1-based; negative counts from the end).",
        sample: "alice,9,cairo\nbob,11,rome",
        transform: (input, opts) => {
            const col = Number(opts.col || 1);
            const delimRaw = String(opts.delim || "comma");
            const delim = delimRaw === "tab" ? "\t" : delimRaw === "semicolon" ? ";" : delimRaw === "pipe" ? "|" : delimRaw === "space" ? " " : ",";
            return input
                .split(/\r?\n/)
                .filter((l) => l.trim())
                .map((l) => {
                    const cells = delim === " " ? l.trim().split(/\s+/) : splitCsvLine(l, delim);
                    const idx = col > 0 ? col - 1 : cells.length + col;
                    return cells[idx] ?? "";
                })
                .join("\n");
        },
        options: [
            {
                key: "delim",
                label: "Delimiter",
                kind: "select",
                choices: [["comma", "Comma"], ["tab", "Tab"], ["semicolon", "Semicolon"], ["pipe", "Pipe"], ["space", "Spaces"]],
                default: "comma"
            },
            {
                key: "col",
                label: "Column",
                kind: "select",
                choices: [["1", "1"], ["2", "2"], ["3", "3"], ["-1", "last (-1)"], ["-2", "second-last (-2)"]],
                default: "1"
            },
        ],
    }),
    makeTextTool({
        id: "x-join-lines",
        label: "Join Lines",
        description: "Merge every line into one — with a custom separator (comma, space, “ | ”, AND / OR…).",
        sample: "alpha\nbeta\ngamma",
        transform: (input, opts) => {
            const sep = String(opts.sep === "comma" ? ", " : opts.sep === "space" ? " " : opts.sep === "nl" ? "\\n" : opts.sep === "and" ? " AND " : opts.sep === "or" ? " OR " : " | ");
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (lines.length === 0) return "—";
            const joined = lines.join(sep);
            if (opts.quote === true) return lines.map((l) => `"${l}"`).join(sep);
            return joined;
        },
        options: [
            {
                key: "sep",
                label: "Separator",
                kind: "select",
                choices: [["comma", ", (comma+space)"], ["space", "space"], ["pipe", " | "], ["and", " AND "], ["or", " OR "], ["nl", "\\n (literal)"]],
                default: "comma"
            },
            {key: "quote", label: 'Wrap each in ""', kind: "toggle", default: false},
        ],
    }),
    makeTextTool({
        id: "x-pad-lines",
        label: "Pad Lines",
        description: "Left/right/center or zero-pad every line to the width of the longest line.",
        sample: "a\nbb\nccc",
        transform: (input, opts) => {
            const mode = String(opts.mode || "left");
            return input.split(/\r?\n/).map((l) => {
                const width = Math.max(...input.split(/\r?\n/).map((x) => x.length));
                if (mode === "zero") return l.padStart(width, "0");
                if (mode === "right") return l.padEnd(width, " ");
                if (mode === "center") {
                    const left = Math.floor((width - l.length) / 2);
                    return " ".repeat(left) + l + " ".repeat(width - l.length - left);
                }
                return l.padStart(width, " ");
            }).join("\n");
        },
        options: [
            {
                key: "mode",
                label: "Alignment",
                kind: "select",
                choices: [["left", "Left-pad"], ["right", "Right-pad"], ["center", "Center"], ["zero", "Zero-pad"]],
                default: "left"
            },
        ],
    }),
    makeTextTool({
        id: "x-truncate",
        label: "Truncate (smart ellipsis)",
        description: "Cut text at a width on a word boundary (… appended), never splitting a word.",
        sample: "The quick brown fox jumps over the lazy dog",
        transform: (input, opts) => {
            const width = Number(opts.width || 40);
            const t = input.replace(/\s+/g, " ").trim();
            if (t.length <= width) return t;
            const cut = t.slice(0, width - 1);
            const lastSpace = cut.lastIndexOf(" ");
            return (lastSpace > width * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
        },
        options: [
            {
                key: "width",
                label: "Max width",
                kind: "select",
                choices: [["40", "40"], ["60", "60"], ["80", "80"], ["120", "120"], ["160", "160"]],
                default: "80"
            },
        ],
    }),
    makeTextTool({
        id: "x-quotes-swap",
        label: "Smart Quotes ⇄ Straight",
        description: "Typographic “”‘’ ⇄ plain \"' quotes — fix pasted prose or prettify plain text.",
        sample: 'He said “ok” — it’s fine',
        transform: (input, opts) => {
            const toSmart = String(opts.direction || "toStraight") === "toSmart";
            if (toSmart) {
                return input
                    .replace(/"([^"]*)"/g, "“$1”")
                    .replace(/'([^']*)'/g, "‘$1’")
                    .replace(/\.\.\./g, "…")
                    .replace(/--/g, "—");
            }
            return input.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/—/g, "--").replace(/–/g, "-");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toStraight", "Smart → straight"], ["toSmart", "Straight → smart"]],
                default: "toStraight"
            },
        ],
    }),
    makeTextTool({
        id: "x-ligature-swap",
        label: "Ligatures ⇄ ASCII",
        description: "≠ → !=, ≤ → <= — convert programming ligature glyphs back to their source pairs (and the reverse).",
        sample: "a ≠ b ≤ c -> d",
        transform: (input, opts) => {
            const toAscii = String(opts.direction || "toAscii") === "toAscii";
            if (toAscii) {
                let out = input;
                for (const [ascii, glyph] of LIGATURES) out = out.split(glyph).join(ascii);
                return out;
            }
            let out = input;
            for (const [ascii, glyph] of LIGATURES) out = out.split(ascii).join(glyph);
            return out;
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["toAscii", "Glyphs → ASCII"], ["toSmart", "ASCII → glyphs"]],
                default: "toAscii"
            },
        ],
    }),
    makeTextTool({
        id: "x-blank-collapse",
        label: "Collapse Blank Lines",
        description: "2+ consecutive blank lines become one — the universal paste-cleanup pass.",
        sample: "a\n\n\n\nb",
        transform: (input, opts) => {
            const max = Number(opts.max || 1);
            const keep = "\n".repeat(Math.max(1, max));
            const out = input
                .replace(/\r\n/g, "\n")
                .replace(/([ \t]*\n){3,}/g, (m) => "\n" + keep) // runs of blank lines
                .replace(/\n{2,}/g, (m) => (m === "\n" ? m : keep + "\n"));
            return out.replace(/^\n+/, "").replace(/\n+$/, "\n");
        },
        options: [
            {
                key: "max",
                label: "Blank lines kept",
                kind: "select",
                choices: [["1", "1"], ["2", "2"], ["3", "3"]],
                default: "1"
            },
        ],
    }),
    makeTextTool({
        id: "x-indent-shift",
        label: "Indent / Outdent Lines",
        description: "Add or remove N indent characters at the start of every non-empty line.",
        sample: "a\n  b\nc",
        transform: (input, opts) => {
            const count = Number(opts.count || 2);
            const unit = String(opts.unit || "space") === "tab" ? "\t" : " ";
            const remove = String(opts.direction || "indent") === "outdent";
            const pad = unit.repeat(count);
            return input
                .split(/\r?\n/)
                .map((l) => {
                    if (!l.trim()) return l;
                    if (remove) return l.replace(new RegExp(`^(${unit === "\t" ? "\\t" : " "}){1,${count}}`), "");
                    return pad + l;
                })
                .join("\n");
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["indent", "Indent (+)"], ["outdent", "Outdent (−)"]],
                default: "indent"
            },
            {
                key: "unit",
                label: "Character",
                kind: "select",
                choices: [["space", "Spaces"], ["tab", "Tabs"]],
                default: "space"
            },
            {
                key: "count",
                label: "How many",
                kind: "select",
                choices: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["8", "8"]],
                default: "2"
            },
        ],
    }),
    makeTextTool({
        id: "x-strip-comments",
        label: "Strip Line Comments",
        description: "Remove comment lines (and optional trailing comments) using the language's line-comment token.",
        sample: "# a comment\nprint(1)  # trailing",
        transform: (input, opts) => {
            const token = String(opts.token || "#");
            const keepTrailing = opts.keepTrailing === true;
            const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return input
                .split(/\r?\n/)
                .filter((l) => !new RegExp(`^\\s*${esc}`).test(l))
                .map((l) => (keepTrailing ? l : l.replace(new RegExp(`\\s*${esc}.*$`), "")))
                .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
                .join("\n");
        },
        options: [
            {
                key: "token",
                label: "Comment token",
                kind: "select",
                choices: [["#", "# (python/ruby)"], ["//", "// (js/java/c)"], ["--", "-- (sql/haskell/lua)"], [";", "; (ini/asm)"], ["%", "% (matlab/latex)"]],
                default: "#"
            },
            {key: "keepTrailing", label: "Keep trailing comments", kind: "toggle", default: false},
        ],
    }),
    makeTextTool({
        id: "x-extract-strings",
        label: "Extract String Literals",
        description: "Pull every quoted string literal out of code — one per line, quotes stripped.",
        sample: 'const a = "one"; /* "two" */ call(\'three\')',
        transform: (input) => {
            const found: string[] = [];
            const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(input)) !== null) found.push(m[1] ?? m[2] ?? "");
            return found.length ? found.join("\n") : "No string literals found.";
        },
    }),
    makeTextTool({
        id: "x-extract-matches",
        label: "Extract URLs / Emails / Numbers",
        description: "Regex-extract every URL, email address or number from the text — one match per line.",
        sample: "Contact a@b.co or https://x.dev/y at 42",
        transform: (input, opts) => {
            const kind = String(opts.kind || "url");
            let re: RegExp;
            if (kind === "email") re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
            else if (kind === "number") re = /-?\b\d+(?:\.\d+)?\b/g;
            else if (kind === "hex") re = /#?[0-9a-fA-F]{6}\b|0x[0-9a-fA-F]+/g;
            else if (kind === "dates") re = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/g;
            else re = /(?:https?:\/\/|www\.)[^\s<>"')]+/g;
            const found = input.match(re) ?? [];
            const unique = opts.unique !== false;
            const list = unique ? [...new Set(found)] : found;
            return list.length ? list.join("\n") : `No ${kind} matches.`;
        },
        options: [
            {
                key: "kind",
                label: "Extract",
                kind: "select",
                choices: [["url", "URLs"], ["email", "Emails"], ["number", "Numbers"], ["hex", "Hex colors / 0x"], ["dates", "ISO dates"]],
                default: "url"
            },
            {key: "unique", label: "Deduplicate", kind: "toggle", default: true},
        ],
    }),
    makeTextTool({
        id: "x-extract-md-links",
        label: "Extract Markdown Links",
        description: "Every [text](url) pair in a Markdown document — as text⇥URL lines or a plain URL list.",
        sample: "[Docs](https://example.com/docs)",
        transform: (input, opts) => {
            const style = String(opts.style || "pairs");
            const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
            const rows: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(input)) !== null) {
                rows.push(style === "pairs" ? `${m[1]}\t${m[2]}` : style === "urls" ? m[2] : `${m[1] || "(no text)"} → ${m[2]}${m[3] ? ` “${m[3]}”` : ""}`);
            }
            return rows.length ? rows.join("\n") : "No markdown links found.";
        },
        options: [
            {
                key: "style",
                label: "Output",
                kind: "select",
                choices: [["pairs", "text⇥URL"], ["urls", "URLs only"], ["readable", "text → URL"]],
                default: "pairs"
            },
        ],
    }),
    makeTextTool({
        id: "x-ngrams",
        label: "N-grams (word / char)",
        description: "Word or character n-grams with counts — the linguistic workhorse (bigrams, trigrams…).",
        sample: "the quick brown fox",
        transform: (input, opts) => {
            const n = Number(opts.n || 2);
            const unit = String(opts.unit || "word");
            const items = unit === "char" ? [...input.replace(/\s+/g, " ")] : input.toLowerCase().match(/\S+/g) ?? [];
            const grams = new Map<string, number>();
            for (let i = 0; i + n <= items.length; i++) {
                const g = items.slice(i, i + n).join(unit === "char" ? "" : " ");
                grams.set(g, (grams.get(g) ?? 0) + 1);
            }
            const sorted = [...grams.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            if (sorted.length === 0) return `Need at least ${n} ${unit}s.`;
            return sorted.map(([g, c]) => `${String(c).padStart(4)}  ${g}`).join("\n");
        },
        options: [
            {
                key: "unit",
                label: "Unit",
                kind: "select",
                choices: [["word", "Words"], ["char", "Characters"]],
                default: "word"
            },
            {
                key: "n",
                label: "N",
                kind: "select",
                choices: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]],
                default: "2"
            },
        ],
    }),
    makeTextTool({
        id: "x-sentence-split",
        description: "Split prose into sentences — abbreviation-aware (Mr., Dr., e.g.) and number-aware.",
        label: "Sentence Splitter",
        sample: "Mr. Smith arrived. He paid 4.50 and left. Easy!",
        transform: (input) => {
            const guarded = input
                .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|e\.g|i\.e)\./gi, (m) => m.replace(".", "\u0000"))
                .replace(/(\d)\.(\d)/g, "$1\u0000$2");
            const sentences = guarded
                .split(/(?<=[.!?])\s+/)
                .map((s) => s.replace(/\u0000/g, ".").trim())
                .filter(Boolean);
            return sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
        },
    }),
    makeTextTool({
        id: "x-transpose",
        label: "Transpose Table",
        description: "Rows become columns and columns become rows for whitespace/CSV-aligned table text.",
        sample: "a b c\n1 2 3\nx y z",
        transform: (input, opts) => {
            const delim = String(opts.delim || "space") === "tab" ? "\t" : String(opts.delim) === "comma" ? "," : " ";
            const rows = input
                .split(/\r?\n/)
                .filter((l) => l.trim())
                .map((l) => (delim === " " ? l.trim().split(/\s+/) : splitCsvLine(l, delim)));
            if (rows.length === 0) return "—";
            const width = Math.max(...rows.map((r) => r.length));
            const out: string[][] = [];
            for (let c = 0; c < width; c++) out.push(rows.map((r) => r[c] ?? ""));
            return out.map((r) => r.join(delim === " " ? " " : delim)).join("\n");
        },
        options: [
            {
                key: "delim",
                label: "Delimiter",
                kind: "select",
                choices: [["space", "Spaces"], ["tab", "Tab"], ["comma", "Comma"]],
                default: "space"
            },
        ],
    }),
    makeTextTool({
        id: "x-stopword-filter",
        label: "Stopword Filter",
        description: "Strip the ~120 common English stopwords — what remains is the content vocabulary.",
        sample: "The quick brown fox jumps over the lazy dog",
        transform: (input, opts) => {
            const keepCase = opts.keepCase === true;
            const words = input.split(/\b/);
            const out: string[] = [];
            for (const w of words) {
                if (/^[A-Za-z]+$/.test(w)) {
                    if (STOPWORDS.has(w.toLowerCase()) && opts.mode !== "only") continue;
                    if (opts.mode === "only" && !STOPWORDS.has(w.toLowerCase())) continue;
                }
                out.push(w);
            }
            let text = out.join("");
            if (!keepCase) text = text.replace(/\s+/g, " ").trim();
            const kept = text.match(/[A-Za-z]+/g) ?? [];
            return `${text}\n\n(${kept.length} words kept)`;
        },
        options: [
            {
                key: "mode",
                label: "Mode",
                kind: "select",
                choices: [["remove", "Remove stopwords"], ["only", "Keep ONLY stopwords"]],
                default: "remove"
            },
            {key: "keepCase", label: "Preserve spacing", kind: "toggle", default: false},
        ],
    }),
    makeTextTool({
        id: "x-number-lines",
        label: "Number Lines",
        description: "Prefix every line with its number (1., 01., or LINENO: — padded to the file's width).",
        sample: "first\nsecond",
        transform: (input, opts) => {
            const style = String(opts.style || "dot");
            const lines = input.split(/\r?\n/);
            const width = String(lines.length).length;
            return lines
                .map((l, i) => {
                    const num = String(i + 1).padStart(opts.pad === true ? width : 0, "0");
                    if (style === "colon") return `${num}: ${l}`;
                    if (style === "arrow") return `${num} → ${l}`;
                    return `${num}. ${l}`;
                })
                .join("\n");
        },
        options: [
            {
                key: "style",
                label: "Style",
                kind: "select",
                choices: [["dot", "1. "], ["colon", "1: "], ["arrow", "1 → "]],
                default: "dot"
            },
            {key: "pad", label: "Zero-pad to width", kind: "toggle", default: false},
        ],
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  GENERATORS — 21 additional (9 → 30)
 * ══════════════════════════════════════════════════════════════════ */

const UUID_NS_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID_NS_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const UUID_NS_OID = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";
const UUID_NS_X500 = "6ba7b814-9dad-11d1-80b4-00c04fd430c8";

async function sha1Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-1", utf8ToBytes(text));
    return bytesToHex(new Uint8Array(digest));
}

function hexToUuidShape(hex: string, version: number): string {
    const h = hex.toLowerCase();
    return [
        h.slice(0, 8),
        h.slice(8, 12),
        version.toString(16) + h.slice(13, 16),
        ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
        h.slice(20, 32),
    ].join("-");
}

const CRON_PRESETS: ReadonlyArray<readonly [string, string]> = [
    ["* * * * *", "Every minute"],
    ["*/5 * * * *", "Every 5 minutes"],
    ["0 * * * *", "Every hour"],
    ["30 2 * * *", "Daily at 02:30"],
    ["0 9 * * 1-5", "Weekdays at 09:00"],
    ["0 0 1 * *", "Monthly on the 1st"],
    ["0 12 * * 0", "Sundays at noon"],
    ["0 0 1 1 *", "Yearly (Jan 1st)"],
    ["0 */2 * * *", "Every 2 hours"],
    ["15 14 1 * 6", "1st of the month at 14:15 if a Saturday"],
];

const UA_PRESETS: ReadonlyArray<readonly [string, string]> = [
    ["chrome-win", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"],
    ["chrome-mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"],
    ["chrome-linux", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"],
    ["firefox-win", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"],
    ["firefox-mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0"],
    ["safari-mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"],
    ["edge-win", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"],
    ["bot", "Mozilla/5.0 (compatible; praxis-test/1.0; +https://example.com/bot)"],
];

const WORDS_BANK = (
    "anchor amber apple arrow autumn azure basket beacon breeze bridge bronze butter cactus canyon cedar chorus " +
    "clover cobalt coral cosmos cotton crater crimson crystal dawn delta desert dolphin ember emerald falcon " +
    "feather fjord flint forest fossil galaxy garnet glacier granite harbor hazel horizon island ivory jasper " +
    "jungle kelp lagoon lantern lava lemon lilac linen lotus luminous mango maple marble meadow mesa mist " +
    "morning moss nebula nectar nickel noble ocean onyx opal orbit orchid otter oasis pebble pepper pine " +
    "planet plum polar prairie quartz quiet rainy raven reef ripple river robin rose rustic sage sand sapphire " +
    "scarlet seafoam sequoia shadow silver slate solar spruce stone storm summit sunset sylvan tea teal thistle " +
    "thunder timber topaz tourmaline tulip tundra twilight umber valley vanilla velvet verbena violet walnut " +
    "willow winter wisteria zephyr"
).split(" ");

export const EXTRA_GENERATOR_TOOLS = [
    makeTextTool({
        id: "x-uuid-named",
        label: "UUID v3 / v5 (namespaced)",
        description: "Deterministic namespaced UUIDs — MD5 (v3) or SHA-1 (v5) of a name under the standard namespaces.",
        sample: "example.com",
        transform: async (input, opts) => {
            const version = String(opts.version || "5");
            const nsName = String(opts.ns || "dns");
            const ns =
                nsName === "url" ? UUID_NS_URL : nsName === "oid" ? UUID_NS_OID : nsName === "x500" ? UUID_NS_X500 : UUID_NS_DNS;
            const nsHex = ns.replace(/-/g, "");
            const name = input.trim();
            if (!name) return "Paste the name (e.g. example.com).";
            const hashHex = version === "5" ? await sha1Hex(nsHex + name) : md5Hex(nsHex + name);
            return `${version === "5" ? "v5" : "v3"} : ${hexToUuidShape(hashHex, Number(version))}\nns : ${nsName} (${ns})\nname: ${name}`;
        },
        options: [
            {
                key: "version",
                label: "Version",
                kind: "select",
                choices: [["5", "v5 (SHA-1)"], ["3", "v3 (MD5)"]],
                default: "5"
            },
            {
                key: "ns",
                label: "Namespace",
                kind: "select",
                choices: [["dns", "DNS"], ["url", "URL"], ["oid", "OID"], ["x500", "X500"]],
                default: "dns"
            },
        ],
    }),
    makeTextTool({
        id: "x-ksuid",
        label: "KSUID Batch",
        description: "K-Sortable Unique IDs — 4-byte timestamp + 16 random bytes, base62-encoded (24 chars, no dashes).",
        sample: "5",
        transform: (input) => {
            const count = Math.min(100, Math.max(1, Number(input.trim()) || 5));
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const bytes = new Uint8Array(20);
                const now = Math.floor(Date.now() / 1000);
                new Uint8Array(new Uint32Array([now]).buffer).forEach((b, j) => (bytes[j] = b));
                crypto.getRandomValues(bytes.subarray(4));
                out.push(encodeBaseN(bytesToBigint(bytes), B62_ALPHABET).padStart(27, "0"));
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-xid",
        label: "Mongo ObjectId Batch",
        description: "ObjectId-style 24-hex IDs — 4-byte timestamp + 5 random bytes + 3-byte counter (sortable by creation time).",
        sample: "5",
        transform: (input) => {
            const count = Math.min(100, Math.max(1, Number(input.trim()) || 5));
            const now = Math.floor(Date.now() / 1000);
            const out: string[] = [];
            let counter = Math.floor(Math.random() * 0xffffff);
            for (let i = 0; i < count; i++) {
                counter = (counter + 1) & 0xffffff;
                const bytes = new Uint8Array(12);
                bytes[0] = (now >>> 24) & 0xff;
                bytes[1] = (now >>> 16) & 0xff;
                bytes[2] = (now >>> 8) & 0xff;
                bytes[3] = now & 0xff;
                crypto.getRandomValues(bytes.subarray(4, 9));
                bytes[9] = (counter >>> 16) & 0xff;
                bytes[10] = (counter >>> 8) & 0xff;
                bytes[11] = counter & 0xff;
                out.push(bytesToHex(bytes));
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-snowflake",
        label: "Snowflake ID (64-bit)",
        description: "Twitter-style snowflakes: 41-bit ms timestamp + 10-bit machine + 12-bit sequence — as BigInt decimals.",
        sample: "5",
        transform: (input) => {
            const count = Math.min(100, Math.max(1, Number(input.trim()) || 5));
            const machine = Math.floor(Math.random() * 1023);
            let seq = Math.floor(Math.random() * 4095);
            const epoch = 1288834974657n;
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const ts = BigInt(Date.now());
                seq = (seq + 1) & 0xfff;
                const id = ((ts - epoch) << 22n) | (BigInt(machine) << 12n) | BigInt(seq);
                out.push(id.toString());
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-shortid-custom",
        label: "Short ID (custom alphabet)",
        description: "Random short IDs from your alphabet & length — the URL-shortener primitive.",
        sample: "8",
        transform: (input, opts) => {
            const count = Math.min(50, Math.max(1, Number(input.trim()) || 5));
            const alphabet = String(opts.alphabet || "0123456789abcdefghijklmnopqrstuvwxyz");
            const length = Number(opts.length || 8);
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const bytes = new Uint8Array(length);
                crypto.getRandomValues(bytes);
                out.push([...bytes].map((b) => alphabet[b % alphabet.length]).join(""));
            }
            return out.join("\n");
        },
        options: [
            {
                key: "alphabet",
                label: "Alphabet",
                kind: "select",
                choices: [["0123456789abcdefghijklmnopqrstuvwxyz", "base36"], ["abcdefghjkmnpqrstvwxyz23456789", "no-lookalikes"], ["0123456789abcdef", "hex"]],
                default: "0123456789abcdefghijklmnopqrstuvwxyz"
            },
            {
                key: "length",
                label: "Length",
                kind: "select",
                choices: [["6", "6"], ["8", "8"], ["10", "10"], ["12", "12"]],
                default: "8"
            },
        ],
    }),
    makeTextTool({
        id: "x-mnemo-pass",
        label: "Pronounceable Passwords",
        description: "Consonant-vowel patterns (cvcvc + digits + symbol) — passwords you can say out loud.",
        sample: "5",
        transform: (input, opts) => {
            const count = Math.min(50, Math.max(1, Number(input.trim()) || 5));
            const symbols = String(opts.symbols === false ? "" : "!@#$%^&*");
            const cons = "bcdfghjklmnpqrstvwxz";
            const vowels = "aeiou";
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                let w = "";
                for (let s = 0; s < 3; s++) w += cons[Math.floor(Math.random() * cons.length)] + vowels[Math.floor(Math.random() * vowels.length)];
                w += String(Math.floor(Math.random() * 90) + 10);
                if (symbols) w += symbols[Math.floor(Math.random() * symbols.length)];
                out.push(w);
            }
            return out.join("\n");
        },
        options: [{key: "symbols", label: "Add a symbol", kind: "toggle", default: true}],
    }),
    makeTextTool({
        id: "x-serial-gen",
        label: "Serial Numbers (XXXX-XXXX)",
        description: "Grouped serial keys — hex or base36 groups with your chosen group size and count.",
        sample: "5",
        transform: (input, opts) => {
            const count = Math.min(100, Math.max(1, Number(input.trim()) || 5));
            const groups = Number(opts.groups || 4);
            const mode = String(opts.mode || "hex");
            const alphabet = mode === "hex" ? "0123456789ABCDEF" : "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const parts: string[] = [];
                for (let g = 0; g < groups; g++) {
                    const bytes = new Uint8Array(4);
                    crypto.getRandomValues(bytes);
                    parts.push([...bytes].map((b) => alphabet[b % alphabet.length]).join("").slice(0, 4));
                }
                out.push(parts.join("-"));
            }
            return out.join("\n");
        },
        options: [
            {
                key: "groups",
                label: "Groups",
                kind: "select",
                choices: [["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]],
                default: "4"
            },
            {
                key: "mode",
                label: "Alphabet",
                kind: "select",
                choices: [["hex", "Hex (0-9A-F)"], ["base32ish", "Base32-ish (no I/L/O/U)"]],
                default: "hex"
            },
        ],
    }),
    makeTextTool({
        id: "x-license-key",
        label: "License Keys (XXXXX-XXXXX-…)",
        description: "5×5 license keys with the Crockford-ish alphabet — readable, typo-resistant keys.",
        sample: "5",
        transform: (input) => {
            const count = Math.min(100, Math.max(1, Number(input.trim()) || 5));
            const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const groups: string[] = [];
                for (let g = 0; g < 5; g++) {
                    const bytes = new Uint8Array(5);
                    crypto.getRandomValues(bytes);
                    groups.push([...bytes].map((b) => alphabet[b % alphabet.length]).join(""));
                }
                out.push(groups.join("-"));
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-int-batch",
        label: "Random Integers Batch",
        description: "N random integers in a range (inclusive) — the test-fixture primitive.",
        sample: "1 100 10",
        transform: (input, opts) => {
            const parts = input.trim().split(/\s+/).map(Number);
            let min = Number.isFinite(parts[0]) ? parts[0] : 1;
            let max = Number.isFinite(parts[1]) ? parts[1] : 100;
            const count = Math.min(500, Math.max(1, Number.isFinite(parts[2]) ? parts[2] : Number(opts.count || 10)));
            if (max < min) [min, max] = [max, min];
            const unique = opts.unique === true;
            const out: number[] = [];
            if (unique) {
                const pool: number[] = [];
                for (let v = min; v <= max; v++) pool.push(v);
                for (let i = 0; i < count && pool.length > 0; i++) {
                    out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
                }
            } else {
                for (let i = 0; i < count; i++) out.push(min + Math.floor(Math.random() * (max - min + 1)));
            }
            return out.join("\n");
        },
        options: [
            {key: "unique", label: "No repeats", kind: "toggle", default: false},
            {
                key: "count",
                label: "Count (if not in input)",
                kind: "select",
                choices: [["10", "10"], ["25", "25"], ["50", "50"], ["100", "100"]],
                default: "10"
            },
        ],
    }),
    makeTextTool({
        id: "x-float-batch",
        label: "Random Decimals Batch",
        description: "N random decimals in a range, printed at a fixed number of decimal places.",
        sample: "0 1 10",
        transform: (input, opts) => {
            const parts = input.trim().split(/\s+/).map(Number);
            const min = Number.isFinite(parts[0]) ? parts[0] : 0;
            const max = Number.isFinite(parts[1]) ? parts[1] : 1;
            const count = Math.min(500, Math.max(1, Number.isFinite(parts[2]) ? parts[2] : 10));
            const dp = Number(opts.dp || 2);
            const out: string[] = [];
            for (let i = 0; i < count; i++) out.push(roundTo(min + Math.random() * (max - min), dp));
            return out.join("\n");
        },
        options: [{
            key: "dp",
            label: "Decimals",
            kind: "select",
            choices: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["6", "6"]],
            default: "2"
        }],
    }),
    makeTextTool({
        id: "x-date-batch",
        label: "Random Date Batch",
        description: "N random ISO dates inside a range (inclusive), dates only or with times.",
        sample: "2024-01-01 2024-12-31 10",
        transform: (input, opts) => {
            const withTime = opts.withTime === true;
            const parts = input.trim().split(/\s+/);
            const start = Date.parse(parts[0] || "2024-01-01");
            const end = Date.parse(parts[1] || "2024-12-31");
            const count = Math.min(500, Math.max(1, Number(parts[2]) || 10));
            if (Number.isNaN(start) || Number.isNaN(end)) return "Format: 2024-01-01 2024-12-31 10";
            const lo = Math.min(start, end);
            const hi = Math.max(start, end);
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const d = new Date(lo + Math.random() * (hi - lo));
                const iso = d.toISOString();
                out.push(withTime ? iso : iso.slice(0, 10));
            }
            return out.sort().join("\n");
        },
        options: [{key: "withTime", label: "Include time", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-ip-batch",
        label: "Random IPv4 Batch",
        description: "N random IPv4 addresses — private RFC1918 ranges or fully random.",
        sample: "10",
        transform: (input, opts) => {
            const count = Math.min(500, Math.max(1, Number(input.trim()) || 10));
            const privateOnly = String(opts.range || "private") === "private";
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                let a = 1 + Math.floor(Math.random() * 223);
                if (privateOnly) {
                    const net = [10, 172, 192][Math.floor(Math.random() * 3)];
                    if (net === 10) out.push(`10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 253)}`);
                    else if (net === 172) out.push(`172.${16 + Math.floor(Math.random() * 16)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 253)}`);
                    else out.push(`192.168.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 253)}`);
                    continue;
                }
                if (a === 10 || a === 127) a++;
                out.push(`${a}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 253)}`);
            }
            return out.join("\n");
        },
        options: [{
            key: "range",
            label: "Range",
            kind: "select",
            choices: [["private", "Private (RFC1918)"], ["any", "Any public-ish"]],
            default: "private"
        }],
    }),
    makeTextTool({
        id: "x-mac-batch",
        label: "Random MAC Address Batch",
        description: "N locally-administered MAC addresses (the locally-administered bit set, unicast).",
        sample: "10",
        transform: (input, opts) => {
            const count = Math.min(500, Math.max(1, Number(input.trim()) || 10));
            const style = String(opts.style || "colon");
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const bytes = new Uint8Array(6);
                crypto.getRandomValues(bytes);
                bytes[0] = (bytes[0] | 0x02) & 0xfe; // locally administered, unicast
                const hex = bytesToHex(bytes);
                const pairs = [0, 2, 4, 6, 8, 10].map((k) => hex.slice(k, k + 2));
                out.push(style === "hyphen" ? pairs.join("-") : style === "dot" ? [0, 1, 2].map((g) => pairs.slice(g * 2, g * 2 + 2).join("")).join(".") : pairs.join(":"));
            }
            return out.join("\n");
        },
        options: [{
            key: "style",
            label: "Style",
            kind: "select",
            choices: [["colon", "aa:bb:cc:dd:ee:ff"], ["hyphen", "aa-bb-cc-dd-ee-ff"], ["dot", "aabb.ccdd.eeff"]],
            default: "colon"
        }],
    }),
    makeTextTool({
        id: "x-ua-batch",
        label: "User-Agent Strings",
        description: "A rotating set of real-shape browser user-agent strings (Chrome / Firefox / Safari / Edge / bot).",
        sample: "5",
        transform: (input) => {
            const count = Math.min(20, Math.max(1, Number(input.trim()) || 5));
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                out.push(UA_PRESETS[Math.floor(Math.random() * UA_PRESETS.length)][1]);
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-cron-pick",
        label: "Cron Preset Picker",
        description: "The standard schedule presets with their expressions — copy the one you need.",
        transform: () => CRON_PRESETS.map(([expr, what]) => `${expr.padEnd(14)} ${what}`).join("\n"),
    }),
    makeTextTool({
        id: "x-branch-name",
        label: "Git Branch Name Builder",
        description: "Ticket + description → a clean git branch name (feat/fix/chore + kebab-case).",
        sample: "PRX-123 Add login flow",
        transform: (input, opts) => {
            const type = String(opts.type || "feat");
            const t = input.trim().replace(/\s+/g, " ");
            if (!t) return "Paste: “PRX-123 Add login flow”";
            const m = /^([A-Za-z]+-?\d+)\s+(.*)$/.exec(t);
            const ticket = m ? m[1].toUpperCase() : "";
            const words = (m ? m[2] : t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").filter(Boolean);
            const name = [ticket.toLowerCase(), ...words].filter(Boolean).join("-");
            return `${type}/${name}`;
        },
        options: [{
            key: "type",
            label: "Type",
            kind: "select",
            choices: [["feat", "feat/"], ["fix", "fix/"], ["chore", "chore/"], ["docs", "docs/"], ["refactor", "refactor/"]],
            default: "feat"
        }],
    }),
    makeTextTool({
        id: "x-commit-gen",
        label: "Conventional Commit Builder",
        description: "Assemble a Conventional Commits message (type(scope): subject + body + footer).",
        sample: "feat: add login flow\n\nUses the new auth client.\n\nRefs: PRX-123",
        transform: (input) => {
            const [first, ...rest] = input.split(/\r?\n/);
            const subject = (first || "").trim();
            const m = /^(\w+)(?:\(([\w./-]+)\))?!?:\s*(.*)$/.exec(subject);
            if (!m) {
                return [
                    "Format: type(scope)?: subject",
                    "",
                    "Paste your subject line, then an optional body after a blank line.",
                    "",
                    "types: feat fix docs style refactor perf test build ci chore revert",
                ].join("\n");
            }
            const body = rest.join("\n").trim();
            const header = `${m[1]}${m[2] ? `(${m[2]})` : ""}: ${m[3]}`;
            const len = header.length;
            return `${len <= 72 ? "✓" : "✗"} header ${len}/72 chars\n${header}${body ? `\n\n${body}` : ""}`;
        },
    }),
    makeTextTool({
        id: "x-ci-stubs",
        label: "CI Config Stubs",
        description: "Skeleton YAML for GitHub Actions / GitLab CI / docker-compose — the starting points.",
        transform: (input, opts) => {
            const which = String(opts.which || "actions");
            if (which === "gitlab") {
                return ["stages: [test, build]", "", "test-job:", "  stage: test", "  image: node:22", "  script:", "    - bun install", "    - bun run test:unit", "", "build-job:", "  stage: build", "  script:", "    - bun run build", "  artifacts:", "    paths:", "      - dist/"].join("\n");
            }
            if (which === "compose") {
                return ["services:", "  app:", "    build: .", "    ports:", "      - \"3000:3000\"", "    environment:", "      - NODE_ENV=production", "    restart: unless-stopped", "", "  db:", "    image: postgres:16", "    environment:", "      - POSTGRES_PASSWORD=change-me", "    volumes:", "      - pgdata:/var/lib/postgresql/data", "", "volumes:", "  pgdata:"].join("\n");
            }
            return ["name: CI", "", "on:", "  push:", "    branches: [main]", "  pull_request:", "", "jobs:", "  test:", "    runs-on: ubuntu-latest", "    steps:", "      - uses: actions/checkout@v4", "      - uses: oven-sh/setup-bun@v2", "        with:", "          bun-version: latest", "      - run: bun install --frozen-lockfile", "      - run: bun run check"].join("\n");
        },
        options: [{
            key: "which",
            label: "Stub",
            kind: "select",
            choices: [["actions", "GitHub Actions"], ["gitlab", "GitLab CI"], ["compose", "docker-compose"]],
            default: "actions"
        }],
    }),
    makeTextTool({
        id: "x-json-schema-gen",
        label: "JSON Sample → JSON Schema",
        description: "Infer a JSON Schema (draft-07 style) from a sample document — types, arrays, required keys.",
        sample: '{"name": "Ada", "age": 36, "tags": ["x"], "active": true}',
        transform: (input) => {
            let obj: unknown;
            try {
                obj = JSON.parse(input);
            } catch (e) {
                return `Invalid JSON: ${(e as Error).message}`;
            }
            const toSchema = (node: unknown): unknown => {
                if (node === null) return {type: "null"};
                if (Array.isArray(node)) {
                    return {type: "array", items: node.length ? toSchema(node[0]) : {}};
                }
                switch (typeof node) {
                    case "string":
                        return {type: "string"};
                    case "number":
                        return Number.isInteger(node) ? {type: "integer"} : {type: "number"};
                    case "boolean":
                        return {type: "boolean"};
                    case "object": {
                        const props: Record<string, unknown> = {};
                        for (const [k, v] of Object.entries(node)) props[k] = toSchema(v);
                        return {
                            type: "object",
                            properties: props,
                            required: Object.keys(props),
                        };
                    }
                    default:
                        return {};
                }
            };
            return JSON.stringify(
                {$schema: "http://json-schema.org/draft-07/schema#", ...(toSchema(obj) as Record<string, unknown>)},
                null,
                2
            );
        },
    }),
    makeTextTool({
        id: "x-unicode-stress",
        label: "Unicode Stress Test Data",
        description: "A ready-made battery of edge cases: combining marks, RTL, CJK, emoji ZWJ, zero-width and controls.",
        transform: () => {
            const lines: string[] = [
                "combining : e\u0301\u0327 (e + 2 marks)",
                "zwj family: \uD83D\uDC68‍\uD83D\uDC69‍\uD83D\uDC67 (ZWJ joined)",
                "flag emoji: 🇩🇪 (regional indicators)",
                "rtl arabic: مرحبا بالعالم",
                "rtl + numbers: سطر 1 سطر 2 ٠١٢٣",
                "cjk: 汉字漢字中文日本語",
                "cjk width: ＡＢＣ１２３ (fullwidth) vs ABC123",
                "zero-width: a\u200Bb\u200Bc (has ZWSP)",
                "bidi marks: ‪LTR override‬ and \u202Ereversed\u202C",
                "nbsp: a\u00A0b (non-breaking space)",
                "line sep: a\u2028b (U+2028)",
                "surrogate: \uD83D\uDE00 vs lone \uD83D",
                "byte-order-mark: \uFEFFstart of line",
                "combining + cjk: ᄀᆞ (hangul jamo)",
                "digits: ٠١٢٣ ۱۲ Ⅲ ½ ٣",
                "controls: \u0007bell \u001Bescape (shown raw)",
            ];
            return lines.join("\n");
        },
    }),
    makeTextTool({
        id: "x-ws-stress",
        label: "Whitespace Stress Test Data",
        description: "Tabs, runs of spaces, mixed indent, trailing whitespace, CRLF — for editor/parser testing.",
        transform: () => {
            return [
                "tab-indent:\tvalue",
                "space4:     value",
                "mixed: \t value",
                "trailing:   ",
                "crlf: line ending",
                "nbsp: a\u00A0b",
                "thin: a\u2009b (thin space)",
                "hair: a\u200Ab (hair space)",
                "indent ladder:",
                "\tlevel1",
                "\t\tlevel2",
                "\t\t\tlevel3",
                "    space-level2",
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-test-data",
        label: "Typed Test Data (CSV)",
        description: "Generate a CSV fixture from a column spec — name, email, int, float, date, bool, uuid, pick.",
        sample: "name,email,int 0 100,float 0 1,bool,uuid",
        transform: (input) => {
            const specs = input.split(/\r?\n/).filter(Boolean).flatMap((l) => l.split(/[;,]\s*/)).filter(Boolean);
            if (specs.length === 0) return "Paste columns: name email \"int 0 100\" bool uuid";
            const header = specs.map((s) => s.split(/\s+/)[0]);
            const rows: string[] = [];
            const rowCount = 10;
            for (let r = 0; r < rowCount; r++) {
                const cells: string[] = [];
                for (const spec of specs) {
                    const parts = spec.split(/\s+/);
                    const kind = parts[0].toLowerCase();
                    if (kind === "name") cells.push(WORDS_BANK[Math.floor(Math.random() * WORDS_BANK.length)].replace(/^\w/, (c) => c.toUpperCase()));
                    else if (kind === "email") cells.push(`${WORDS_BANK[Math.floor(Math.random() * WORDS_BANK.length)]}${r}@example.com`);
                    else if (kind === "int") {
                        const lo = Number(parts[1] ?? 0);
                        const hi = Number(parts[2] ?? 100);
                        cells.push(String(Math.floor(lo + Math.random() * (hi - lo))));
                    } else if (kind === "float") {
                        const lo = Number(parts[1] ?? 0);
                        const hi = Number(parts[2] ?? 1);
                        cells.push(roundTo(lo + Math.random() * (hi - lo), 2));
                    } else if (kind === "bool") cells.push(Math.random() < 0.5 ? "true" : "false");
                    else if (kind === "uuid") {
                        const bytes = new Uint8Array(16);
                        crypto.getRandomValues(bytes);
                        bytes[6] = (bytes[6] & 0x0f) | 0x40;
                        bytes[8] = (bytes[8] & 0x3f) | 0x80;
                        cells.push(hexToUuidShape(bytesToHex(bytes), 4));
                    } else if (kind === "date") cells.push(new Date(Date.now() - Math.random() * 365 * 864e5).toISOString().slice(0, 10));
                    else cells.push(`${kind}-${r}`);
                }
                rows.push(cells.join(","));
            }
            return [header.join(","), ...rows].join("\n");
        },
    }),
];

function bytesToBigint(bytes: Uint8Array): bigint {
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return v;
}

/* ══════════════════════════════════════════════════════════════════
 *  HASH & CRYPTO — 25 additional (5 → 30)
 * ══════════════════════════════════════════════════════════════════ */

async function subtleDigest(name: string, text: string): Promise<string> {
    const digest = await crypto.subtle.digest(name, utf8ToBytes(text));
    return bytesToHex(new Uint8Array(digest));
}

/** CRC-16/XMODEM (polynomial 0x1021, init 0, bitwise — table-free). */
function crc16Xmodem(bytes: Uint8Array): string {
    let crc = 0;
    for (const b of bytes) {
        crc ^= b << 8;
        for (let i = 0; i < 8; i++) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).padStart(4, "0");
}

/** Adler-32 (RFC 1950). */
function adler32(bytes: Uint8Array): string {
    let a = 1;
    let b = 0;
    for (const x of bytes) {
        a = (a + x) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a).toString(16).padStart(8, "0");
}

/** FNV-1 / FNV-1a (32 and 64-bit, BigInt for 64). */
function fnv1a32(bytes: Uint8Array): string {
    let h = 0x811c9dc5;
    for (const b of bytes) {
        h ^= b;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

function fnv1a64(bytes: Uint8Array): string {
    let h = 0xcbf29ce484222325n;
    for (const b of bytes) {
        h ^= BigInt(b);
        h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, "0");
}

function fnv1_32(bytes: Uint8Array): string {
    let h = 0x811c9dc5;
    for (const b of bytes) {
        h = Math.imul(h, 0x01000193) >>> 0;
        h ^= b;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** The classic string hashes. */
function djb2(bytes: Uint8Array): string {
    let h = 5381;
    for (const b of bytes) h = (Math.imul(h, 33) + b) >>> 0;
    return h.toString(16).padStart(8, "0");
}

function sdbm(bytes: Uint8Array): string {
    let h = 0;
    for (const b of bytes) h = (b + Math.imul(h, 65599) + Math.imul(h, 98304)) >>> 0;
    return h.toString(16).padStart(8, "0");
}

function elfHash(bytes: Uint8Array): string {
    let h = 0;
    for (const b of bytes) {
        h = (h << 4) + b;
        const g = h & 0xf0000000;
        if (g) h ^= g >>> 24;
        h = (h & ~g) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

function javaHash(text: string): string {
    let h = 0;
    for (const c of text) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    return String(h);
}

/** MurmurHash3 (x86 32-bit) for UTF-8 bytes. */
function murmur3_32(bytes: Uint8Array, seed = 0): string {
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    const r1 = 15;
    const r2 = 13;
    const m = 5;
    const n = 0xe6546b64;
    let h = seed;
    const len = bytes.length;
    const blocks = Math.floor(len / 4);
    const mul32 = (a: number, b: number) => Math.imul(a, b) >>> 0;
    for (let i = 0; i < blocks; i++) {
        const k =
            bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24);
        let kk = mul32(k, c1);
        kk = (kk << r1) | (kk >>> (32 - r1));
        kk = mul32(kk, c2);
        h ^= kk;
        h = ((h << r2) | (h >>> (32 - r2))) >>> 0;
        h = (mul32(h, m) + n) >>> 0;
    }
    let k = 0;
    const tail = bytes.subarray(blocks * 4);
    if (tail.length > 0) {
        for (let i = 0; i < tail.length; i++) k |= tail[i] << (i * 8);
        k = mul32(k, c1);
        k = (k << r1) | (k >>> (32 - r1));
        k = mul32(k, c2);
        h ^= k;
    }
    h ^= len;
    h ^= h >>> 16;
    h = mul32(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = mul32(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** Splitmix64 — 64-bit mixer usable as a hash and a seeded PRNG step. */
function splitmix64(input: bigint): bigint {
    let z = (input + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return z ^ (z >> 31n);
}

/** SimHash 64-bit of a text (token bigrams → fingerprint). */
function simhash64(text: string): string {
    const tokens = text.toLowerCase().match(/\S+/g) ?? [];
    if (tokens.length === 0) return "0".repeat(16);
    const feats = new Map<string, number>();
    for (let i = 0; i < tokens.length; i++) {
        const t = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : tokens[i];
        feats.set(t, (feats.get(t) ?? 0) + 1);
    }
    const bits = new Array<number>(64).fill(0);
    for (const [t, w] of feats) {
        const h = BigInt("0x" + fnv1a64(utf8ToBytes(t)));
        for (let b = 0; b < 64; b++) bits[b] += (h >> BigInt(b)) & 1n ? w : -w;
    }
    let out = 0n;
    for (let b = 0; b < 64; b++) if (bits[b] > 0) out |= 1n << BigInt(b);
    return out.toString(16).padStart(16, "0");
}

/** Sum-style legacy checksums. */
function legacyChecksums(bytes: Uint8Array): string {
    let sum8 = 0;
    let sum16 = 0;
    let xor8 = 0;
    for (const b of bytes) {
        sum8 = (sum8 + b) & 0xff;
        sum16 = (sum16 + b) & 0xffff;
        xor8 ^= b;
    }
    return `sum8 : ${sum8.toString(16).padStart(2, "0")} (${sum8})\nsum16: ${sum16.toString(16).padStart(4, "0")} (${sum16})\nxor8 : ${xor8.toString(16).padStart(2, "0")} (${xor8})`;
}

async function pemKeyPair(alg: RsaHashedKeyGenParams | EcKeyGenParams): Promise<{
    publicPem: string;
    privatePem: string;
    jwkKid: string
}> {
    const pair = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const kid = await subtleDigest("SHA-256", b64(spki));
    return {
        publicPem: `-----BEGIN PUBLIC KEY-----\n${b64(spki).replace(/(.{64})/g, "$1\n")}\n-----END PUBLIC KEY-----`,
        privatePem: `-----BEGIN PRIVATE KEY-----\n${b64(pkcs8).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----`,
        jwkKid: kid,
    };
}

async function wpaPsk(ssid: string, passphrase: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", utf8ToBytes(passphrase), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        {name: "PBKDF2", salt: utf8ToBytes(ssid), iterations: 4096, hash: "SHA-1"},
        key,
        256
    );
    return bytesToHex(new Uint8Array(bits));
}

export const EXTRA_HASH_TOOLS = [
    makeTextTool({
        id: "x-digest-convert",
        label: "Digest Hex ⇄ Base64",
        description: "Convert a hash/encryption digest between hex and base64 (and base64url) — byte-exact.",
        sample: "5d41402abc4b2a76b9719d911017c592",
        transform: (input, opts) => {
            const to = String(opts.to || "base64");
            const hex = input.trim().replace(/^(0x)?/i, "").replace(/[\s:]/g, "");
            const bytes = hexToBytes(hex);
            if (to === "hex") return bytesToHex(Uint8Array.from(atob(input.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
            const b64 = btoa(String.fromCharCode(...bytes));
            if (to === "base64url") return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            return b64;
        },
        options: [
            {
                key: "to",
                label: "To",
                kind: "select",
                choices: [["base64", "Hex → Base64"], ["base64url", "Hex → Base64url"], ["hex", "Base64 → Hex"]],
                default: "base64"
            },
        ],
    }),
    makeTextTool({
        id: "x-crc16",
        label: "CRC-16 / XMODEM",
        description: "The classic CRC-16 checksum (poly 0x1021, init 0) used by XMODEM and many protocols.",
        sample: "hello",
        transform: (input) => crc16Xmodem(utf8ToBytes(input)),
    }),
    makeTextTool({
        id: "x-adler32",
        label: "Adler-32",
        description: "The zlib Adler-32 checksum (RFC 1950) — fast, weak, but a real classic.",
        sample: "hello",
        transform: (input) => adler32(utf8ToBytes(input)),
    }),
    makeTextTool({
        id: "x-fnv",
        label: "FNV-1 / FNV-1a (32 & 64)",
        description: "The Fowler-Noll-Vo non-cryptographic hashes — 1 and 1a variants in both widths.",
        sample: "hello",
        transform: (input) => {
            const bytes = utf8ToBytes(input);
            return [
                `FNV-1a 32 : ${fnv1a32(bytes)}`,
                `FNV-1a 64 : ${fnv1a64(bytes)}`,
                `FNV-1  32 : ${fnv1_32(bytes)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-classic-hashes",
        label: "Classic String Hashes",
        description: "djb2 / sdbm / ELF / Java hashCode for the same string — the table everyone reaches for.",
        sample: "hello",
        transform: (input) => {
            const bytes = utf8ToBytes(input);
            return [
                `djb2        : ${djb2(bytes)}`,
                `sdbm        : ${sdbm(bytes)}`,
                `elf (PJW)   : ${elfHash(bytes)}`,
                `Java hash  : ${javaHash(input)}`,
                `MurmurHash3: ${murmur3_32(bytes)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-murmur3",
        label: "MurmurHash3 (x86 32-bit)",
        description: "The MurmurHash3 32-bit hash with a configurable seed — bucketing favorite.",
        sample: "hello",
        transform: (input, opts) => {
            const seed = parseInt(String(opts.seed || "0"), 10) || 0;
            return murmur3_32(utf8ToBytes(input), seed >>> 0);
        },
        options: [{
            key: "seed",
            label: "Seed",
            kind: "select",
            choices: [["0", "0"], ["1", "1"], ["42", "42"], ["31337", "31337"]],
            default: "0"
        }],
    }),
    makeTextTool({
        id: "x-splitmix64",
        label: "Splitmix64 Mixer",
        description: "The SplitMix64 finalizer — mix a number to a well-distributed 64-bit value (also a PRNG step).",
        sample: "1",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            return lines
                .map((l) => {
                    const n = BigInt(/^-?\d+$/.test(l) ? l : "0x" + l.replace(/^0x/i, ""));
                    return `${l} → ${splitmix64(n & 0xffffffffffffffffn).toString(16)}`;
                })
                .join("\n") || "—";
        },
    }),
    makeTextTool({
        id: "x-simhash",
        label: "SimHash (64-bit)",
        description: "The near-duplicate document fingerprint — order-insensitive: same content rearranged, same hash.",
        sample: "the quick brown fox jumps over the lazy dog",
        transform: (input) => {
            const h = simhash64(input);
            const bin = BigInt("0x" + h).toString(2).padStart(64, "0");
            return `${h}\n${bin}`;
        },
    }),
    makeTextTool({
        id: "x-sum-checks",
        label: "Legacy Sum Checksums",
        description: "sum8 / sum16 / xor8 — the checksums used by ROM tools and simple protocols.",
        sample: "hello",
        transform: (input) => legacyChecksums(utf8ToBytes(input)),
    }),
    makeTextTool({
        id: "x-byte-entropy",
        label: "Byte Entropy + Chi-Square",
        description: "Shannon entropy (bits/byte) and a chi-square uniformity score of the input's bytes.",
        sample: "aabbcceeddffgg",
        transform: (input) => {
            const bytes = utf8ToBytes(input);
            if (bytes.length === 0) return "—";
            const counts = new Array(256).fill(0);
            for (const b of bytes) counts[b]++;
            let h = 0;
            for (const c of counts) {
                if (c === 0) continue;
                const p = c / bytes.length;
                h -= p * Math.log2(p);
            }
            const expected = bytes.length / 256;
            let chi = 0;
            for (const c of counts) chi += ((c - expected) ** 2) / (expected || 1);
            return [
                `length      : ${bytes.length} bytes`,
                `entropy     : ${roundTo(h, 4)} bits/byte (max 8)`,
                `unique bytes: ${counts.filter((c) => c > 0).length} / 256`,
                `chi-square  : ${roundTo(chi, 2)} (uniform ≈ ${roundTo(255, 0)}±smaller)`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-hash-compare",
        label: "Hash Two Inputs Side-By-Side",
        description: "Two texts, every WebCrypto digest side by side — see exactly which bit of input changes what.",
        sample: "hello\nhallo",
        transform: async (input) => {
            const lines = input.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length < 2) return "Paste two lines: the two inputs to compare.";
            const [a, b] = lines;
            const algs = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
            const out = ["        " + a.slice(0, 20).padEnd(22) + b.slice(0, 20)];
            for (const alg of algs) {
                const ha = await subtleDigest(alg, a);
                const hb = await subtleDigest(alg, b);
                out.push(`${alg.padEnd(8)} ${ha}`);
                out.push(`${"".padEnd(8)} ${hb}`);
            }
            out.push(`MD5      ${md5Hex(a)}`);
            out.push(`${"".padEnd(8)} ${md5Hex(b)}`);
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-avalanche",
        label: "Hash Avalanche Demo",
        description: "Flip ONE input character and watch all four digests change completely — diffusion made visible.",
        sample: "hello",
        transform: async (input) => {
            const a = input.trim() || "hello";
            const flippedChar = String.fromCharCode(a.charCodeAt(0) ^ 1);
            const b = flippedChar + a.slice(1);
            const algs = ["SHA-256", "SHA-512"];
            const out = [`a: ${a}`, `b: ${b}  (first char flipped)`];
            for (const alg of algs) {
                const ha = await subtleDigest(alg, a);
                const hb = await subtleDigest(alg, b);
                let diff = 0;
                for (let i = 0; i < ha.length; i += 2) {
                    const xa = parseInt(ha.slice(i, i + 2), 16);
                    const xb = parseInt(hb.slice(i, i + 2), 16);
                    diff += ((xa ^ xb).toString(2).match(/1/g) ?? []).length;
                }
                out.push(`${alg}: ${ha.slice(0, 32)}…`);
                out.push(`${alg}: ${hb.slice(0, 32)}…`);
                out.push(`   differing bits: ${diff}/${(ha.length / 2) * 8}`);
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-merkle",
        label: "Merkle Root (SHA-256)",
        description: "Line-per-leaf → the SHA-256 Merkle root with the full proof path of the first leaf.",
        sample: "a\nb\nc\nd",
        transform: async (input) => {
            const leaves = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (leaves.length === 0) return "—";
            const hashOf = async (hex: string) => {
                const digest = await crypto.subtle.digest("SHA-256", hexToBytes(hex));
                return bytesToHex(new Uint8Array(digest));
            };
            let level = await Promise.all(leaves.map((l) => subtleDigest("SHA-256", l)));
            const levels: string[][] = [level];
            while (level.length > 1) {
                const next: string[] = [];
                for (let i = 0; i < level.length; i += 2) {
                    const l = level[i];
                    const r = level[i + 1] ?? level[i]; // duplicate the last leaf on odd counts
                    next.push(await hashOf(l + r));
                }
                level = next;
                levels.push(level);
            }
            return [
                ...levels.map((lv, i) => `level ${i}: ${lv.join(" ").slice(0, 400)}`),
                `root     : ${level[0]}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-pow-mini",
        label: "Mini Proof-of-Work",
        description: "Find a nonce whose sha256(header+nonce) has N leading zero bits — the mining loop, miniature.",
        sample: "block-42",
        transform: async (input, opts) => {
            const zeroBits = Math.min(20, Math.max(4, Number(opts.bits || 12)));
            const header = input.trim() || "block";
            const started = Date.now();
            const targetHexZeros = Math.ceil(zeroBits / 4);
            let nonce = 0;
            for (; ;) {
                const digest = await subtleDigest("SHA-256", header + ":" + nonce);
                if (digest.startsWith("0".repeat(targetHexZeros)) && (zeroBits % 4 === 0 || parseInt(digest.slice(targetHexZeros, targetHexZeros + 1), 16) < 1 << (4 - (zeroBits % 4)))) {
                    const ms = Date.now() - started;
                    return `header: ${header}\nnonce : ${nonce}\nhash  : ${digest}\nwork  : ${nonce + 1} tries in ${ms} ms`;
                }
                nonce++;
                if (nonce > 4_000_000) return "Gave up after 4,000,000 tries — lower the difficulty.";
            }
        },
        options: [{
            key: "bits",
            label: "Leading zero bits",
            kind: "select",
            choices: [["8", "8 (easy)"], ["12", "12"], ["16", "16"], ["20", "20 (slow)"]],
            default: "12"
        }],
    }),
    makeTextTool({
        id: "x-rsa-keygen",
        label: "RSA Key Pair (PEM)",
        description: "Generate an RSA-2048/3072 signing key pair and export both PEMs + a SHA-256 key fingerprint.",
        sample: "my-key",
        transform: async (input, opts) => {
            const bits = Number(opts.bits || 2048);
            const pair = await pemKeyPair({
                name: "RSASSA-PKCS1-v1_5",
                modulusLength: bits,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            });
            return `label: ${input.trim() || "(unnamed)"}\nRSA-${bits}\n\n${pair.publicPem}\n\n${pair.privatePem}\n\nSHA-256 fingerprint: ${pair.jwkKid}`;
        },
        options: [{
            key: "bits",
            label: "Modulus",
            kind: "select",
            choices: [["2048", "2048"], ["3072", "3072"], ["4096", "4096 (slow)"]],
            default: "2048"
        }],
        note: "The private key never leaves this page — it is generated in the browser and only in the output pane.",
    }),
    makeTextTool({
        id: "x-ecdsa-keygen",
        label: "ECDSA P-256 Key Pair (PEM)",
        description: "Generate an ECDSA P-256 key pair (signing) with both PEMs + the SHA-256 fingerprint.",
        transform: async () => {
            const pair = await pemKeyPair({name: "ECDSA", namedCurve: "P-256"});
            return `${pair.publicPem}\n\n${pair.privatePem}\n\nSHA-256 fingerprint: ${pair.jwkKid}`;
        },
        note: "Generated in the browser — nothing is uploaded.",
    }),
    makeTextTool({
        id: "x-ssh-fingerprint",
        label: "PEM Public Key Fingerprint",
        description: "SHA-256 / SHA-1 fingerprints of a pasted PEM public key — the ssh-keygen -lf style output.",
        sample: "-----BEGIN PUBLIC KEY-----",
        transform: async (input) => {
            const b64 = input.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s/g, "");
            if (!b64) return "Paste a PEM PUBLIC KEY block.";
            try {
                const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const sha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", der)));
                const sha1 = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-1", der)));
                const b64sha = btoa(String.fromCharCode(...hexToBytes(sha256))).replace(/=+$/, "");
                return `SHA256:${b64sha}\nSHA256 (hex): ${sha256}\nSHA1 (hex)  : ${sha1}`;
            } catch {
                return "That PEM body is not valid base64.";
            }
        },
    }),
    makeTextTool({
        id: "x-wpa-psk",
        label: "WPA2 PSK (PBKDF2)",
        description: "The 256-bit WPA2 pairwise master key derived from passphrase + SSID (PBKDF2-SHA1, 4096 rounds).",
        sample: "MyHomeNet\ncorrect horse battery",
        transform: async (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (lines.length < 2) return "Line 1: the SSID. Line 2: the passphrase (8-63 chars).";
            const [ssid, pass] = lines;
            if (pass.length < 8 || pass.length > 63) return "The passphrase must be 8-63 characters.";
            const psk = await wpaPsk(ssid, pass);
            return `SSID: ${ssid}\nPSK : ${psk}`;
        },
    }),
    makeTextTool({
        id: "x-api-signer",
        label: "HMAC-SHA256 Request Signature",
        description: "Build a signed request line — method, path, timestamp and body digested with your secret via HMAC.",
        sample: "GET\n/api/users\n1700000000",
        transform: async (input, opts) => {
            const lines = input.split(/\r?\n/).map((l) => l.replace(/^\s+|\s+$/g, "")).filter(Boolean);
            const secret = String(opts.secret || "change-me");
            if (lines.length < 2) return "Line 1: METHOD\nLine 2: path\nLine 3: timestamp (optional)\nLine 4+: body (optional)";
            const method = lines[0].toUpperCase();
            const path = lines[1];
            const ts = lines[2] ?? String(Math.floor(Date.now() / 1000));
            const body = lines.slice(3).join("\n");
            const bodyHash = lines.length > 3 ? await subtleDigest("SHA-256", body) : "";
            const stringToSign = [method, path, ts, bodyHash].join("\n");
            const key = await crypto.subtle.importKey("raw", utf8ToBytes(secret), {
                name: "HMAC",
                hash: "SHA-256"
            }, false, ["sign"]);
            const sig = await crypto.subtle.sign("HMAC", key, utf8ToBytes(stringToSign));
            const sigHex = bytesToHex(new Uint8Array(sig));
            return [
                `string-to-sign:`,
                stringToSign,
                ``,
                `signature: ${sigHex}`,
                ``,
                `headers:`,
                `X-Signature: ${sigHex}`,
                `X-Timestamp: ${ts}`,
            ].join("\n");
        },
        options: [{
            key: "secret",
            label: "Secret",
            kind: "select",
            choices: [["change-me", "change-me"]],
            default: "change-me"
        }],
    }),
    makeTextTool({
        id: "x-hex-xor",
        label: "XOR Two Hex Strings",
        description: "Byte-wise XOR of two equal-length hex strings — the cryptanalysis primitive.",
        sample: "deadbeef\ncafebabe",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.replace(/[^0-9a-fA-F]/g, "")).filter(Boolean);
            if (lines.length < 2) return "Two hex lines, equal length.";
            const [a, b] = lines;
            if (a.length !== b.length) return `Lengths differ (${a.length} vs ${b.length} hex chars).`;
            let out = "";
            for (let i = 0; i < a.length; i += 2) {
                out += (parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16)).toString(16).padStart(2, "0");
            }
            return out;
        },
    }),
    makeTextTool({
        id: "x-sha1",
        label: "SHA-1",
        description: "The WebCrypto SHA-1 digest of the text (hex, 40 chars) — legacy compatibility.",
        sample: "hello",
        transform: (input) => subtleDigest("SHA-1", input),
    }),
    makeTextTool({
        id: "x-sha384",
        label: "SHA-384",
        description: "The WebCrypto SHA-384 digest (hex, 96 chars).",
        sample: "hello",
        transform: (input) => subtleDigest("SHA-384", input),
    }),
    makeTextTool({
        id: "x-sha512",
        label: "SHA-512 / SHA-512/256-style",
        description: "The WebCrypto SHA-512 digest (hex, 128 chars).",
        sample: "hello",
        transform: (input) => subtleDigest("SHA-512", input),
    }),
    makeTextTool({
        id: "x-hmac-any",
        label: "HMAC (SHA-1 / 384 / 512)",
        description: "Keyed HMAC digests beyond SHA-256 — pick the hash, paste the secret, get the hex MAC.",
        sample: "hello",
        transform: async (input, opts) => {
            const alg = String(opts.hash || "SHA-1");
            const secret = String(opts.secret || "change-me");
            const key = await crypto.subtle.importKey("raw", utf8ToBytes(secret), {
                name: "HMAC",
                hash: alg
            }, false, ["sign"]);
            const mac = await crypto.subtle.sign("HMAC", key, utf8ToBytes(input));
            return bytesToHex(new Uint8Array(mac));
        },
        options: [
            {
                key: "hash",
                label: "Hash",
                kind: "select",
                choices: [["SHA-1", "SHA-1"], ["SHA-384", "SHA-384"], ["SHA-512", "SHA-512"]],
                default: "SHA-1"
            },
            {
                key: "secret",
                label: "Secret",
                kind: "select",
                choices: [["change-me", "change-me"]],
                default: "change-me"
            },
        ],
    }),
    makeTextTool({
        id: "x-bcrypt-salt",
        label: "bcrypt Salt Format Builder",
        description: "A valid bcrypt salt string (2b, cost, 22 base64 chars) — the format token for your own hasher.",
        sample: "12",
        transform: (input, opts) => {
            const cost = Math.min(15, Math.max(4, Number(input.trim()) || 12));
            const alphabet = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            const bytes = new Uint8Array(22);
            crypto.getRandomValues(bytes);
            const salt = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
            return `$2b$${String(cost).padStart(2, "0")}$${salt}`;
        },
        options: [{
            key: "note",
            label: "Format only",
            kind: "select",
            choices: [["", "generates the format token (not a hash)"]],
            default: ""
        }],
    }),
    makeTextTool({
        id: "x-random-bytes-hex",
        label: "Random Bytes (hex / base64)",
        description: "Cryptographically random bytes in hex or base64 — keys, IVs, nonces.",
        sample: "32",
        transform: (input, opts) => {
            const n = Math.min(1024, Math.max(1, Number(input.trim()) || 32));
            const bytes = new Uint8Array(n);
            crypto.getRandomValues(bytes);
            const out = String(opts.format || "hex") === "base64" ? btoa(String.fromCharCode(...bytes)) : bytesToHex(bytes);
            return `${n} bytes\n\n${out}`;
        },
        options: [{
            key: "format",
            label: "Format",
            kind: "select",
            choices: [["hex", "Hex"], ["base64", "Base64"]],
            default: "hex"
        }],
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  COLOR — 26 additional (4 → 30)
 * ══════════════════════════════════════════════════════════════════ */

function parseHexColor(hex: string): number[] | null {
    const m = /^#?([0-9a-f]{3,8})$/i.exec(hex.trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").slice(0, 3).map((c) => c + c).join("");
    if (h.length !== 6) return null;
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function rgbToHsl(..._rgb: number[]): [number, number, number] {
    const [r, g, b] = _rgb;
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l * 100];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
    return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const sat = s / 100;
    const lig = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n: number) => lig - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, max === 0 ? 0 : (d / max) * 100, (max / 255) * 100];
}

/** Linear sRGB → CIE XYZ → LAB (D65). */
function rgbToLab(..._rgb: number[]): [number, number, number] {
    const lin = (c: number) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const [R, G, B] = [lin(_rgb[0]), lin(_rgb[1]), lin(_rgb[2])];
    const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Oklab conversion (Björn Ottosson's matrices). */
function srgbToOklab(..._rgb: number[]): [number, number, number] {
    const lin = (c: number) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const [R, G, B] = [lin(_rgb[0]), lin(_rgb[1]), lin(_rgb[2])];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883074617 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabToSrgb(L: number, a: number, b: number): [number, number, number] | null {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1056133587 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const L3 = l_ ** 3;
    const M3 = m_ ** 3;
    const S3 = s_ ** 3;
    const lin = (x: number) => {
        const c = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
        return Math.round(Math.max(0, Math.min(255, c * 255)));
    };
    const r = lin(4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3);
    const g = lin(-1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3);
    const bch = lin(-0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3);
    if (r < 0 || r > 255 || g < 0 || g > 255 || bch < 0 || bch > 255) return null;
    return [r, g, bch];
}

function relLuminance(r: number, g: number, b: number): number {
    const lin = (c: number) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: number[], b: number[]): number {
    const la = relLuminance(a[0], a[1], a[2]);
    const lb = relLuminance(b[0], b[1], b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHex(...rgb: number[]): string {
    return "#" + [rgb[0], rgb[1], rgb[2]].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}

export const EXTRA_COLOR_TOOLS = [
    makeTextTool({
        id: "x-color-formats",
        label: "One Color, Every Format",
        description: "A hex color as HSL, HSV, LAB, Oklab, CMYK, YUV, luminance and CSS strings.",
        sample: "#3498db",
        transform: (input) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color (#3498db).";
            const [r, g, b] = rgb;
            const [h, s, l] = rgbToHsl(r, g, b);
            const [hv, sv, v] = rgbToHsv(r, g, b);
            const [L, A, B] = rgbToLab(r, g, b);
            const k = 1 - Math.max(r / 255, g / 255, b / 255);
            const c = 1 - r / 255 - k;
            const m = 1 - g / 255 - k;
            const y = 1 - b / 255 - k;
            const yuv = [r * 0.299 + g * 0.587 + b * 0.114, r * -0.147 + g * -0.289 + b * 0.436, r * 0.615 + g * -0.515 + b * -0.1];
            const ok = srgbToOklab(r, g, b);
            return [
                `HEX      : ${rgbToHex(r, g, b)}`,
                `RGB      : rgb(${r}, ${g}, ${b})`,
                `HSL      : hsl(${roundTo(h, 0)}, ${roundTo(s, 0)}%, ${roundTo(l, 0)}%)`,
                `HSV      : hsv(${roundTo(hv, 0)}, ${roundTo(sv, 0)}%, ${roundTo(v, 0)}%)`,
                `LAB      : lab(${roundTo(L, 1)} ${roundTo(A, 1)} ${roundTo(B, 1)})`,
                `Oklab    : oklab(${roundTo(ok[0] * 100, 1)}% ${roundTo(ok[1], 3)} ${roundTo(ok[2], 3)})`,
                `CMYK     : cmyk(${roundTo(c * 100, 0)}%, ${roundTo(m * 100, 0)}%, ${roundTo(y * 100, 0)}%, ${roundTo(k * 100, 0)}%)`,
                `YUV      : yuv(${roundTo(yuv[0], 3)} ${roundTo(yuv[1], 3)} ${roundTo(yuv[2], 3)})`,
                `Luminance: ${roundTo(relLuminance(r, g, b), 4)} (0-1)`,
                `vs white : ${roundTo(contrastRatio(rgb, [255, 255, 255]), 2)}:1`,
                `vs black : ${roundTo(contrastRatio(rgb, [0, 0, 0]), 2)}:1`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-harmony",
        label: "Color Harmonies",
        description: "Complement, split-complement, triadic, tetradic and analogous neighbors of one color.",
        sample: "#3498db",
        transform: (input, opts) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const [h, s, l] = rgbToHsl(...rgb);
            const at = (dh: number, ds = s, dl = l) => rgbToHex(...hslToRgb((h + dh + 360) % 360, Math.max(0, Math.min(100, ds)), Math.max(0, Math.min(100, dl))));
            const block = (name: string, dh: number) => `── ${name}\n${at(0)}  base\n${at(dh)}\n${at(-dh)}`;
            return [
                block("complementary (split ±30)", 180) + `\n${at(180, s, l)}`,
                block("triadic", 120),
                block("analogous", 30),
                block("tetradic", 90) + `\n${at(180)}`,
                `── lighter / darker\n${at(0, s, Math.min(100, l + 12))}\n${at(0, s, Math.max(0, l - 12))}`,
            ].join("\n\n");
        },
        options: [{key: "note", label: "", kind: "select", choices: [["", "all families at once"]], default: ""}],
    }),
    makeTextTool({
        id: "x-scale",
        label: "Tint / Shade Scale",
        description: "A 10-step tint (toward white) and shade (toward black) ladder for one color.",
        sample: "#3498db",
        transform: (input) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const [r, g, b] = rgb;
            const mixTo = (target: number[], t: number) => rgbToHex(r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t);
            const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
            return (
                "tints (→ white):\n" +
                steps.map((t, i) => `${String(100 - i * 10).padStart(3)}  ${mixTo([255, 255, 255], t)}`).join("\n") +
                "\n\nshades (→ black):\n" +
                steps.map((t, i) => `${String(i * 10).padStart(3)}  ${mixTo([0, 0, 0], t)}`).join("\n")
            );
        },
    }),
    makeTextTool({
        id: "x-hue-ramp",
        label: "Hue Ramp (N stops)",
        description: "Evenly spaced hues around the wheel at a fixed saturation/lightness — the rainbow sampler.",
        sample: "#3498db",
        transform: (input, opts) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const [h, s, l] = rgbToHsl(...rgb);
            const n = Math.min(24, Math.max(3, Number(opts.n || 12)));
            const out: string[] = [];
            for (let i = 0; i < n; i++) {
                const hh = (h + (i * 360) / n) % 360;
                out.push(`${String(i + 1).padStart(2)}  ${rgbToHex(...hslToRgb(hh, s, l))}  hsl(${roundTo(hh, 0)}, ${roundTo(s, 0)}, ${roundTo(l, 0)})`);
            }
            return out.join("\n");
        },
        options: [{
            key: "n",
            label: "Stops",
            kind: "select",
            choices: [["6", "6"], ["12", "12"], ["18", "18"], ["24", "24"]],
            default: "12"
        }],
    }),
    makeTextTool({
        id: "x-grayscale-formulas",
        label: "Grayscale Formulas Compared",
        description: "Luma 601, luma 709, luminance, average and desaturate — five takes on “gray” for one color.",
        sample: "#3498db",
        transform: (input) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const [r, g, b] = rgb;
            const g601 = 0.299 * r + 0.587 * g + 0.114 * b;
            const g709 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const avg = (r + g + b) / 3;
            const [, s, l] = rgbToHsl(r, g, b);
            const desat = hslToRgb(0, 0, l);
            return [
                `Rec.601 luma : ${rgbToHex(g601, g601, g601)}`,
                `Rec.709 luma : ${rgbToHex(g709, g709, g709)}`,
                `Luminance(Y'): ${rgbToHex(relLuminance(r, g, b) * 255, relLuminance(r, g, b) * 255, relLuminance(r, g, b) * 255)}`,
                `Average      : ${rgbToHex(avg, avg, avg)}`,
                `Desaturate(HSL, lightness ${roundTo(l, 0)}%): ${rgbToHex(...desat)}`,
                `Input sat    : ${roundTo(s, 0)}%`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-kelvin-color",
        label: "Kelvin → RGB approximation",
        description: "Color temperature (1000-40000 K) → sRGB approximation (Tanner Helland's approximation).",
        sample: "6500",
        transform: (input) => {
            const kelvin = Number(input.trim());
            if (!Number.isFinite(kelvin) || kelvin < 1000 || kelvin > 40000) return "Paste a Kelvin value between 1000 and 40000.";
            const t = kelvin / 100;
            let r: number;
            let g: number;
            let b: number;
            if (t <= 66) {
                r = 255;
                g = 99.4708025861 * Math.log(t) - 161.1195681661;
            } else {
                r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
                g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
            }
            if (t >= 66) b = 255;
            else if (t <= 19) b = 0;
            else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
            return `${kelvin} K ≈ ${rgbToHex(r, g, b)}  rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        },
    }),
    makeTextTool({
        id: "x-blend",
        label: "Alpha Blend Over Background",
        description: "A translucent color over a background — the exact composited result color.",
        sample: "#ff0000 0.4\n#ffffff",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const m1 = /^#?([0-9a-f]{3,8})(?:\s+([\d.]+))?$/i.exec(lines[0] ?? "");
            const bg = parseHexColor(lines[1] ?? "#ffffff") ?? [255, 255, 255];
            if (!m1) return "Line 1: hex + alpha (0-1). Line 2: background hex.";
            const fg = parseHexColor(m1[1])!;
            const alpha = m1[2] !== undefined ? Math.max(0, Math.min(1, Number(m1[2]))) : 1;
            const out = [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha));
            return `fg ${rgbToHex(...fg)} @ α=${alpha}\nbg ${rgbToHex(...bg)}\n→  ${rgbToHex(...out)}  rgb(${Math.round(out[0])}, ${Math.round(out[1])}, ${Math.round(out[2])})`;
        },
    }),
    makeTextTool({
        id: "x-mix",
        label: "Mix Two Colors (t 0-1)",
        description: "Linear interpolation between two hex colors at t — the gradient midpoint machine.",
        sample: "#000000\n#ffffff\n0.5",
        transform: (input, opts) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const a = parseHexColor(lines[0] ?? "");
            const b = parseHexColor(lines[1] ?? "");
            if (!a || !b) return "Line 1 + line 2: two hex colors. Line 3: t (0-1).";
            const t = Math.max(0, Math.min(1, Number(lines[2] ?? opts.t ?? 0.5)));
            const steps = Number(opts.steps || 1);
            const out: string[] = [];
            const count = steps > 1 ? steps : 1;
            for (let i = 0; i < count; i++) {
                const tt = steps > 1 ? i / (count - 1) : t;
                out.push(`${roundTo(tt, 2)}  ${rgbToHex(a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt)}`);
            }
            return out.join("\n");
        },
        options: [
            {
                key: "t",
                label: "t (single)",
                kind: "select",
                choices: [["0.25", "0.25"], ["0.5", "0.5"], ["0.75", "0.75"]],
                default: "0.5"
            },
            {
                key: "steps",
                label: "Or N steps",
                kind: "select",
                choices: [["1", "1 (just t)"], ["5", "5"], ["11", "11"]],
                default: "1"
            },
        ],
    }),
    makeTextTool({
        id: "x-color-distance",
        label: "Color Distance (ΔE)",
        description: "CIE76 ΔE in Lab space + a plain RGB Euclidean distance between two colors.",
        sample: "#ff0000\n#ff8000",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const a = parseHexColor(lines[0] ?? "");
            const b = parseHexColor(lines[1] ?? "");
            if (!a || !b) return "Two hex colors, one per line.";
            const la = rgbToLab(...a);
            const lb = rgbToLab(...b);
            const de76 = Math.sqrt((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (la[2] - lb[2]) ** 2);
            const drgb = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
            const verdict = de76 < 1 ? "imperceptible" : de76 < 2.3 ? "just noticeable" : de76 < 10 ? "clearly different" : "far apart";
            return `ΔE76 : ${roundTo(de76, 2)}  (${verdict})\nRGB Δ: ${roundTo(drgb, 2)} / 441.67 max`;
        },
    }),
    makeTextTool({
        id: "x-oklch",
        label: "OKLCH ⇄ RGB",
        description: "The perceptually-uniform OKLCH space ⇄ sRGB — CSS Color 4's new best friend.",
        sample: "oklch(70% 0.1 250)",
        transform: (input, opts) => {
            const t = input.trim();
            if (t.startsWith("#")) {
                const rgb = parseHexColor(t);
                if (!rgb) return "Paste #hex or oklch(L C H).";
                const [L, a, b] = srgbToOklab(...rgb);
                const C = Math.sqrt(a * a + b * b);
                const H = (Math.atan2(b, a) * 180) / Math.PI;
                return `oklch(${roundTo(L * 100, 1)}% ${roundTo(C, 3)} ${roundTo((H + 360) % 360, 1)})`;
            }
            const m = /^oklch\(\s*([\d.]+)(?:%)?\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*\)$/i.exec(t);
            if (!m) return "Paste #hex or oklch(70% 0.1 250).";
            const L = Number(m[1]) / (String(m[1]).includes(".") && Number(m[1]) > 1 ? 100 : 1);
            const normL = Number(m[1]) <= 1 ? Number(m[1]) : Number(m[1]) / 100;
            const C = Number(m[2]);
            const H = Number(m[3]);
            const hRad = (H * Math.PI) / 180;
            const a = Math.cos(hRad) * C;
            const b = Math.sin(hRad) * C;
            const rgb = oklabToSrgb(normL, a, b);
            if (!rgb) return `oklch(${normL}, ${C}, ${H}) is OUT of the sRGB gamut (no RGB equivalent).`;
            void L;
            return `${rgbToHex(...rgb)}  rgb(${rgb.join(", ")})`;
        },
        options: [{key: "note", label: "", kind: "select", choices: [["", "both directions"]], default: ""}],
    }),
    makeTextTool({
        id: "x-cvd-sim",
        label: "Colorblind Simulation",
        description: "Simulate deuteranopia / protanopia / tritanopia (Brettel-style channel reduction approximation).",
        sample: "#e74c3c",
        transform: (input, opts) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const kind = String(opts.kind || "deuteranopia");
            // Machado-style approximations as channel mixes (severity 1.0).
            let out: [number, number, number];
            if (kind === "protanopia") out = [rgb[0] * 0.567 + rgb[1] * 0.433 + rgb[2] * 0, rgb[0] * 0.558 + rgb[1] * 0.442, rgb[0] * 0 + rgb[1] * 0.242 + rgb[2] * 0.758];
            else if (kind === "tritanopia") out = [rgb[0] * 0.95 + rgb[1] * 0.05, rgb[0] * 0 + rgb[1] * 0.433 + rgb[2] * 0.567, rgb[0] * 0 + rgb[1] * 0.475 + rgb[2] * 0.525];
            else out = [rgb[0] * 0.367 + rgb[1] * 0.633, rgb[0] * 0.633 + rgb[1] * 0.367, rgb[1] * 0.326 + rgb[2] * 0.674];
            return `original : ${rgbToHex(...rgb)}\n${kind.padEnd(9)}: ${rgbToHex(...out)}`;
        },
        options: [{
            key: "kind",
            label: "Type",
            kind: "select",
            choices: [["deuteranopia", "deuteranopia (red-green)"], ["protanopia", "protanopia (red-green)"], ["tritanopia", "tritanopia (blue-yellow)"]],
            default: "deuteranopia"
        }],
    }),
    makeTextTool({
        id: "x-xterm256",
        label: "Nearest xterm-256 Color",
        description: "The 256-color terminal palette index + cube coordinates nearest to a color (Euclidean in RGB).",
        sample: "#3498db",
        transform: (input) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const levels = [0, 95, 135, 175, 215, 255];
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let i = 16; i < 256; i++) {
                let cand: number[];
                if (i < 232) {
                    const c = i - 16;
                    cand = [levels[Math.floor(c / 36)], levels[Math.floor((c % 36) / 6)], levels[c % 6]];
                } else {
                    const g = (i - 232) * 10 + 8;
                    cand = [g, g, g];
                }
                const d = (cand[0] - rgb[0]) ** 2 + (cand[1] - rgb[1]) ** 2 + (cand[2] - rgb[2]) ** 2;
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            const name = bestIdx < 232 ? `cube ${(bestIdx - 16)}` : `grayscale ramp`;
            const near =
                bestIdx < 232
                    ? [levels[Math.floor((bestIdx - 16) / 36)], levels[Math.floor(((bestIdx - 16) % 36) / 6)], levels[(bestIdx - 16) % 6]]
                    : [(bestIdx - 232) * 10 + 8, (bestIdx - 232) * 10 + 8, (bestIdx - 232) * 10 + 8];
            return `index : ${bestIdx} (${bestIdx < 16 ? "base palette" : name})\nANSI  : \\x1b[38;5;${bestIdx}m\nnear  : ${rgbToHex(...near)}`;
        },
    }),
    makeTextTool({
        id: "x-ansi-color",
        label: "ANSI Color Escapes",
        description: "Wrap hex colors into 24-bit (truecolor) / 256-color / 16-color ANSI escape sequences.",
        sample: "#3498db",
        transform: (input, opts) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const mode = String(opts.mode || "truecolor");
            if (mode === "truecolor") return `\\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
            if (mode === "256") {
                const levels = [0, 95, 135, 175, 215, 255];
                let best = 0;
                let bd = Infinity;
                for (let i = 0; i < 256; i++) {
                    let cand: number[];
                    if (i < 16) cand = [0, 0, 0];
                    else if (i < 232) {
                        const c = i - 16;
                        cand = [levels[Math.floor(c / 36)], levels[Math.floor((c % 36) / 6)], levels[c % 6]];
                    } else {
                        const g = (i - 232) * 10 + 8;
                        cand = [g, g, g];
                    }
                    const d = (cand[0] - rgb[0]) ** 2 + (cand[1] - rgb[1]) ** 2 + (cand[2] - rgb[2]) ** 2;
                    if (d < bd) {
                        bd = d;
                        best = i;
                    }
                }
                return `\\x1b[38;5;${best}m`;
            }
            // nearest of the 8 basics
            const basics: ReadonlyArray<readonly [string, number[]]> = [
                ["black", [0, 0, 0]], ["red", [205, 0, 0]], ["green", [0, 205, 0]], ["yellow", [205, 205, 0]],
                ["blue", [0, 0, 238]], ["magenta", [205, 0, 205]], ["cyan", [0, 205, 205]], ["white", [229, 229, 229]],
            ];
            let best = basics[0];
            let bd = Infinity;
            for (const c of basics) {
                const d = (c[1][0] - rgb[0]) ** 2 + (c[1][1] - rgb[1]) ** 2 + (c[1][2] - rgb[2]) ** 2;
                if (d < bd) {
                    bd = d;
                    best = c;
                }
            }
            return `nearest basic: ${best[0]} → \\x1b[0;3${basics.findIndex((c) => c === best)}m`;
        },
        options: [{
            key: "mode",
            label: "Mode",
            kind: "select",
            choices: [["truecolor", "24-bit truecolor"], ["256", "256-color"], ["16", "nearest basic"]],
            default: "truecolor"
        }],
    }),
    makeTextTool({
        id: "x-palette-gen",
        label: "Palette Generator (harmonious N)",
        description: "N colors that always work together — spaced hues, paired lightness, in hex + HSL.",
        sample: "5",
        transform: (input, opts) => {
            const n = Math.min(12, Math.max(2, Number(input.trim()) || 5));
            const base = Math.random() * 360;
            const scheme = String(opts.scheme || "analogous");
            const out: string[] = [];
            for (let i = 0; i < n; i++) {
                const step = scheme === "complementary" ? (i % 2) * 180 + (i / n) * 20 : scheme === "triadic" ? (i % 3) * 120 + i * 4 : i * (360 / n);
                const h = (base + step) % 360;
                const l = 62 - (i % 2) * 14 + (Math.random() * 6 - 3);
                const s = 62 - (i % 3) * 8;
                out.push(`${rgbToHex(...hslToRgb(h, s, l))}  hsl(${roundTo(h, 0)}, ${roundTo(s, 0)}, ${roundTo(l, 0)})`);
            }
            return out.join("\n");
        },
        options: [{
            key: "scheme",
            label: "Scheme",
            kind: "select",
            choices: [["analogous", "analogous sweep"], ["complementary", "complementary pairs"], ["triadic", "triadic rotation"]],
            default: "analogous"
        }],
    }),
    makeTextTool({
        id: "x-palette-sort",
        label: "Palette Sort / Flip",
        description: "A list of hex colors sorted by hue, lightness or luminance (descending/ascending).",
        sample: "#ff0000\n#00ff00\n#0000ff",
        transform: (input, opts) => {
            const colors = input.split(/[\s,;\n]+/).map((c) => parseHexColor(c)).filter((c): c is number[] => c !== null);
            if (colors.length === 0) return "Paste hex colors (space, comma or line separated).";
            const key = String(opts.key || "hue");
            const desc = opts.asc !== true;
            const keyed = colors.map((c) => {
                if (key === "lightness") return {c, k: rgbToHsl(c[0], c[1], c[2])[2]};
                if (key === "luminance") return {c, k: relLuminance(c[0], c[1], c[2])};
                return {c, k: rgbToHsl(c[0], c[1], c[2])[0]};
            });
            keyed.sort((a, b) => (desc ? b.k - a.k : a.k - b.k));
            return keyed.map((x) => rgbToHex(...x.c) + (key === "hue" ? `  h≈${roundTo(x.k, 0)}` : key === "lightness" ? `  l≈${roundTo(x.k, 0)}%` : `  Y≈${roundTo(x.k, 3)}`)).join("\n");
        },
        options: [
            {
                key: "key",
                label: "Sort by",
                kind: "select",
                choices: [["hue", "Hue"], ["lightness", "Lightness"], ["luminance", "Luminance"]],
                default: "hue"
            },
            {key: "asc", label: "Ascending", kind: "toggle", default: false},
        ],
    }),
    makeTextTool({
        id: "x-palette-stats",
        label: "Palette Stats",
        description: "Mean / spread / min / max contrast of a pasted palette — is it cohesive or chaos?",
        sample: "#3498db\n#e74c3c\n#2c3e50",
        transform: (input) => {
            const colors = input.split(/[\s,;\n]+/).map((c) => parseHexColor(c)).filter((c): c is number[] => c !== null);
            if (colors.length < 2) return "Paste at least two hex colors.";
            const labs = colors.map((c) => rgbToLab(c[0], c[1], c[2]));
            const mean = [0, 1, 2].map((i) => labs.reduce((s, l) => s + l[i], 0) / labs.length);
            const spread = Math.sqrt(labs.reduce((s, l) => s + (l[0] - mean[0]) ** 2 + (l[1] - mean[1]) ** 2 + (l[2] - mean[2]) ** 2, 0) / labs.length);
            let bestPair: string = "";
            let worstPair: string = "";
            let best = Infinity;
            let worst = -1;
            for (let i = 0; i < colors.length; i++) {
                for (let j = i + 1; j < colors.length; j++) {
                    const de = Math.sqrt((labs[i][0] - labs[j][0]) ** 2 + (labs[i][1] - labs[j][1]) ** 2 + (labs[i][2] - labs[j][2]) ** 2);
                    const pair = `${rgbToHex(...colors[i])} ↔ ${rgbToHex(...colors[j])}`;
                    if (de < best) {
                        best = de;
                        bestPair = pair;
                    }
                    if (de > worst) {
                        worst = de;
                        worstPair = pair;
                    }
                }
            }
            const luminances = colors.map((c) => relLuminance(c[0], c[1], c[2]));
            return [
                `colors        : ${colors.length}`,
                `mean Lab L    : ${roundTo(mean[0], 1)} (a ${roundTo(mean[1], 1)}, b ${roundTo(mean[2], 1)})`,
                `Lab spread σ  : ${roundTo(spread, 2)}`,
                `closest pair  : ${bestPair} (ΔE ${roundTo(best, 1)})`,
                `farthest pair : ${worstPair} (ΔE ${roundTo(worst, 1)})`,
                `luminance     : ${roundTo(Math.min(...luminances), 3)} … ${roundTo(Math.max(...luminances), 3)}`,
                `same-family   : ${best < 10 ? "likely (closest ΔE < 10)" : "mixed (closest ΔE ≥ 10)"}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-cmyk",
        label: "RGB ⇄ CMYK",
        description: "Naive RGB ⇄ CMYK conversion (the standard 0-R/K formulas).",
        sample: "#3498db",
        transform: (input, opts) => {
            const toCmyk = String(opts.direction || "toCmyk") === "toCmyk";
            if (toCmyk) {
                const rgb = parseHexColor(input);
                if (!rgb) return "Paste #hex (to CMYK) or 4 percentages (to RGB).";
                const [r, g, b] = rgb;
                const k = 1 - Math.max(r / 255, g / 255, b / 255);
                if (k === 1) return "cmyk(0% 0% 0% 100%)  (pure black)";
                const c = (1 - r / 255 - k) / (1 - k);
                const m = (1 - g / 255 - k) / (1 - k);
                const y = (1 - b / 255 - k) / (1 - k);
                return `cmyk(${roundTo(c * 100, 1)}%, ${roundTo(m * 100, 1)}%, ${roundTo(y * 100, 1)}%, ${roundTo(k * 100, 1)}%)`;
            }
            const nums = input.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
            if (nums.length < 3) return "Paste 3-4 CMYK percentages (0-100).";
            const [c, m, y, k] = [nums[0] / 100, nums[1] / 100, nums[2] / 100, (nums[3] ?? 0) / 100];
            const r = 255 * (1 - Math.min(1, c * (1 - k) + k));
            const g = 255 * (1 - Math.min(1, m * (1 - k) + k));
            const b = 255 * (1 - Math.min(1, y * (1 - k) + k));
            return `${rgbToHex(r, g, b)}  rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        },
        options: [{
            key: "direction",
            label: "Direction",
            kind: "select",
            choices: [["toCmyk", "RGB → CMYK"], ["toRgb", "CMYK → RGB"]],
            default: "toCmyk"
        }],
    }),
    makeTextTool({
        id: "x-yuv",
        label: "RGB ⇄ YUV (BT.601)",
        description: "The classic SDTV YUV conversion — luma and the two chroma channels.",
        sample: "#3498db",
        transform: (input, opts) => {
            const toYuv = String(opts.direction || "toYuv") === "toYuv";
            if (toYuv) {
                const rgb = parseHexColor(input);
                if (!rgb) return "Paste #hex (to YUV) or three YUV values (to RGB).";
                const [r, g, b] = rgb.map((x) => x / 255);
                const y = 0.299 * r + 0.587 * g + 0.114 * b;
                const u = -0.147 * r - 0.289 * g + 0.436 * b;
                const v = 0.615 * r - 0.515 * g - 0.1 * b;
                return `Y ${roundTo(y, 4)}  U ${roundTo(u, 4)}  V ${roundTo(v, 4)}`;
            }
            const nums = input.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
            if (nums.length < 3) return "Paste Y U V (0-1 range).";
            const [y, u, v] = nums;
            const r = y + 1.14 * v;
            const g = y - 0.395 * u - 0.581 * v;
            const b = y + 2.033 * u;
            return `${rgbToHex(r * 255, g * 255, b * 255)}  rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        },
        options: [{
            key: "direction",
            label: "Direction",
            kind: "select",
            choices: [["toYuv", "RGB → YUV"], ["toRgb", "YUV → RGB"]],
            default: "toYuv"
        }],
    }),
    makeTextTool({
        id: "x-packed-color",
        label: "Packed Color Integer ⇄ Hex",
        description: "0xRRGGBB integers ⇄ hex strings — including the 0x-prefixed and decimal forms.",
        sample: "344761",
        transform: (input, opts) => {
            const toHex = String(opts.direction || "toHex") === "toHex";
            if (toHex) {
                const t = input.trim();
                const n = parseInt(t.startsWith("0x") ? t.slice(2) : t, t.startsWith("0x") ? 16 : 10);
                if (!Number.isFinite(n)) return "Paste an integer (344761) or 0x53f2.";
                return rgbToHex((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff) + `  (decimal ${n})`;
            }
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color to pack.";
            const n = ((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) >>> 0;
            return `decimal: ${n}\nhex     : 0x${n.toString(16).padStart(6, "0")}`;
        },
        options: [{
            key: "direction",
            label: "Direction",
            kind: "select",
            choices: [["toHex", "Integer → hex"], ["toPacked", "Hex → integer"]],
            default: "toHex"
        }],
    }),
    makeTextTool({
        id: "x-argb-swap",
        label: "ARGB ⇄ RGBA (byte order)",
        description: "Android-style 0xAARRGGBB ⇄ web-style #RRGGBBAA — the two alpha placements.",
        sample: "#ff3498db80",
        transform: (input, opts) => {
            const toArgb = String(opts.direction || "toArgb") === "toArgb";
            const t = input.trim().replace(/^#/, "");
            if (toArgb) {
                if (!/^[0-9a-f]{8}$/i.test(t)) return "Paste #RRGGBBAA (8 digits).";
                const rgb = t.slice(0, 6);
                const a = t.slice(6, 8);
                return `#AARRGGBB: ${a}${rgb}  (0x${a}${rgb})`;
            }
            if (!/^[0-9a-f]{8}$/i.test(t)) return "Paste #AARRGGBB (8 digits).";
            const a = t.slice(0, 2);
            const rgb = t.slice(2, 8);
            return `#RRGGBBAA: ${rgb}${a}`;
        },
        options: [{
            key: "direction",
            label: "Direction",
            kind: "select",
            choices: [["toArgb", "RGBA → ARGB"], ["toRgba", "ARGB → RGBA"]],
            default: "toArgb"
        }],
    }),
    makeTextTool({
        id: "x-websafe",
        label: "Web-Safe Palette",
        description: "The classic 216-color websafe list (6×6×6 cube) — hex + index, with nearest matching.",
        sample: "#3498db",
        transform: (input, opts) => {
            const levels = [0, 51, 102, 153, 204, 255];
            const list = opts.list === true;
            const all: string[] = [];
            for (const r of levels) for (const g of levels) for (const b of levels) all.push(rgbToHex(r, g, b));
            if (list) return all.join(" ");
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color (or switch the option to list the whole palette).";
            const nearest = all.reduce((best, hex) => {
                const c = parseHexColor(hex)!;
                const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
                return d < best.d ? {hex, d} : best;
            }, {hex: all[0], d: Infinity});
            const idx = all.indexOf(nearest.hex);
            return `nearest websafe: ${nearest.hex} (index ${idx} of 216)\nΔRGB distance: ${roundTo(Math.sqrt(nearest.d), 1)}`;
        },
        options: [{key: "list", label: "List all 216", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-gray-ramp",
        label: "Gray Ramp (24 steps)",
        description: "An even grayscale ramp from #000000 to #ffffff — the calibration ladder.",
        transform: () => {
            const out: string[] = [];
            for (let i = 0; i < 24; i++) {
                const v = Math.round((i * 255) / 23);
                out.push(`${String(v).padStart(3)}  ${rgbToHex(v, v, v)}`);
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-sepia-matrix",
        label: "Sepia / Vintage Values",
        description: "The exact output RGB when a color runs through the classic sepia / vintage filter matrices.",
        sample: "#3498db",
        transform: (input, opts) => {
            const rgb = parseHexColor(input);
            if (!rgb) return "Paste a hex color.";
            const [r, g, b] = rgb;
            const mode = String(opts.mode || "sepia");
            if (mode === "vintage") {
                const r2 = r * 0.9 + g * 0.05 + b * 0.05;
                const g2 = r * 0.02 + g * 0.9 + b * 0.08;
                const b2 = r * 0.02 + g * 0.18 + b * 0.8;
                return `vintage: ${rgbToHex(r2, g2, b2)}`;
            }
            const r2 = r * 0.393 + g * 0.769 + b * 0.189;
            const g2 = r * 0.349 + g * 0.686 + b * 0.168;
            const b2 = r * 0.272 + g * 0.534 + b * 0.131;
            return `sepia: ${rgbToHex(r2, g2, b2)}`;
        },
        options: [{
            key: "mode",
            label: "Filter",
            kind: "select",
            choices: [["sepia", "Sepia"], ["vintage", "Vintage warm"]],
            default: "sepia"
        }],
    }),
    makeTextTool({
        id: "x-duotone",
        label: "Duotone Mapping",
        description: "Map a color's lightness between a dark and a light anchor — the print-style duotone transform.",
        sample: "#3498db\n#1a0651\n#ffca85",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const rgb = parseHexColor(lines[0] ?? "");
            const dark = parseHexColor(lines[1] ?? "") ?? [26, 6, 81];
            const light = parseHexColor(lines[2] ?? "") ?? [255, 202, 133];
            if (!rgb) return "Line 1: the color. Line 2: dark anchor. Line 3: light anchor.";
            const [, , l] = rgbToHsl(...rgb);
            const t = l / 100;
            const out = [0, 1, 2].map((i) => dark[i] + (light[i] - dark[i]) * t);
            return `duotone(${rgbToHex(...dark)} → ${rgbToHex(...light)}) @ l=${roundTo(l, 0)}%\n→ ${rgbToHex(...out)}`;
        },
    }),
    makeTextTool({
        id: "x-a11y-matrix",
        label: "Contrast Matrix (AA/AAA)",
        description: "One foreground against a list of backgrounds — WCAG AA/AAA verdicts for normal and large text.",
        sample: "#333333\n#ffffff\n#f5f5f5\n#3498db",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const fg = parseHexColor(lines[0] ?? "");
            if (!fg) return "Line 1: the foreground color. Lines 2+: backgrounds.";
            const bgs = lines.slice(1).map((l) => parseHexColor(l)).filter((c): c is number[] => c !== null);
            if (bgs.length === 0) return "Add one or more background colors (one per line).";
            const grade = (ratio: number) =>
                `${ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "FAIL"}`;
            return bgs
                .map((bg) => {
                    const ratio = contrastRatio(fg, bg);
                    return `${rgbToHex(...bg)}  ${roundTo(ratio, 2)}:1  ${grade(ratio)}${ratio < 3 ? " (even large text fails)" : `  · large-text AA needs 3:1, AAA 4.5:1, normal AA 4.5:1, AAA 7:1`}`;
                })
                .join("\n");
        },
    }),
    makeTextTool({
        id: "x-wavelength",
        label: "Hue ⇄ Wavelength (approx)",
        description: "A rough visible-spectrum mapping between hue angle and light wavelength (380-780 nm) — orientation only.",
        sample: "240",
        transform: (input) => {
            const t = input.trim();
            if (/^#/.test(t)) {
                const rgb = parseHexColor(t);
                if (!rgb) return "Paste #hex or a hue angle (0-360).";
                const [h] = rgbToHsl(...rgb);
                return `hue ${roundTo(h, 0)} ≈ ${roundTo(620 - (h / 360) * 240, 0)} nm`;
            }
            const hue = Number(t);
            if (!Number.isFinite(hue)) return "Paste a hue angle (0-360) or a wavelength in nm.";
            if (hue > 380) {
                // treat as wavelength
                return `≈ hue ${roundTo(((620 - hue) / 240) * 360 + 360, 0)}`;
            }
            return `≈ ${roundTo(620 - (hue / 360) * 240, 0)} nm (violet 380 → red 620)`;
        },
        note: "A psychological mapping, not physics — hue and wavelength are not linearly related.",
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  URL & NETWORK — 28 additional (2 → 30)
 * ══════════════════════════════════════════════════════════════════ */

const IPV4_RE = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;

function parseIpv4(text: string): number | null {
    const m = IPV4_RE.exec(text.trim());
    if (!m) return null;
    const parts = [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), Number(m[4] ?? 0)];
    if (parts.some((p) => p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIpv4(n: number): string {
    return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

function parseCidr(text: string): { ip: number; prefix: number } | null {
    const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(text.trim());
    if (!m) return null;
    const ip = parseIpv4(m[1]);
    const prefix = Number(m[2]);
    if (ip === null || prefix > 32) return null;
    return {ip, prefix};
}

function cidrToRange(ip: number, prefix: number): { first: number; last: number } {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const first = (ip & mask) >>> 0;
    const last = (first | (~mask >>> 0)) >>> 0;
    return {first, last};
}

function maskOf(prefix: number): string {
    return intToIpv4(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
}

/** Expand an IPv6 address to 8 full 4-hex-digit groups. */
function expandIpv6(text: string): string | null {
    const t = text.trim().toLowerCase();
    if (!/^[0-9a-f:]+$/.test(t) || !t.includes(":")) return null;
    const [head, tail] = t.split("::");
    const headGroups = head ? head.split(":").filter(Boolean) : [];
    const tailGroups = tail !== undefined ? (tail ? tail.split(":").filter(Boolean) : []) : null;
    if (tailGroups === null) {
        // no :: present — must be exactly 8 groups
        const groups = t.split(":");
        if (groups.length !== 8 || groups.some((g) => g.length > 4)) return null;
        return groups.map((g) => g.padStart(4, "0")).join(":");
    }
    const total = headGroups.length + tailGroups.length;
    if (total > 7) return null;
    const missing = 8 - total;
    const groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
    if (groups.length !== 8 || groups.some((g) => g.length > 4)) return null;
    return groups.map((g) => g.padStart(4, "0")).join(":");
}

/** Compress an IPv6 to its shortest RFC 5952-ish form. */
function compressIpv6(text: string): string | null {
    const full = expandIpv6(text);
    if (!full) return null;
    const groups = full.split(":").map((g) => g.replace(/^0+(?=.)/, ""));
    // find the longest run of zero groups (length ≥ 2)
    let bestStart = -1;
    let bestLen = 1;
    let i = 0;
    while (i < 8) {
        if (groups[i] === "0") {
            let j = i;
            while (j < 8 && groups[j] === "0") j++;
            if (j - i > bestLen) {
                bestLen = j - i;
                bestStart = i;
            }
            i = j;
        } else i++;
    }
    if (bestStart >= 0 && bestLen >= 2) {
        const head = groups.slice(0, bestStart).join(":");
        const tail = groups.slice(bestStart + bestLen).join(":");
        return `${head}::${tail}`;
    }
    return groups.join(":");
}

const PORTS_TABLE: ReadonlyArray<readonly [string, string]> = [
    ["20 / 21", "FTP (data / control)"],
    ["22", "SSH / SFTP"],
    ["23", "Telnet"],
    ["25", "SMTP"],
    ["53", "DNS (TCP + UDP)"],
    ["67 / 68", "DHCP (server / client)"],
    ["69", "TFTP (UDP)"],
    ["80", "HTTP"],
    ["88", "Kerberos"],
    ["110", "POP3"],
    ["111", "RPC / portmap"],
    ["119", "NNTP"],
    ["123", "NTP (UDP)"],
    ["135-139", "NetBIOS / SMB over NetBIOS"],
    ["143", "IMAP"],
    ["161 / 162", "SNMP (agent / trap)"],
    ["179", "BGP"],
    ["389", "LDAP"],
    ["443", "HTTPS / HTTP-over-TLS"],
    ["445", "SMB over TCP"],
    ["465", "SMTPS"],
    ["500", "IPsec IKE (UDP)"],
    ["514", "Syslog (UDP)"],
    ["515", "LPD printing"],
    ["587", "SMTP submission (STARTTLS)"],
    ["631", "IPP / CUPS printing"],
    ["636", "LDAPS"],
    ["873", "rsync"],
    ["993", "IMAPS"],
    ["995", "POP3S"],
    ["1080", "SOCKS proxy"],
    ["1194", "OpenVPN"],
    ["1521", "Oracle DB"],
    ["2049", "NFS"],
    ["2083 / 2087 / 2096", "cPanel-style HTTPS services"],
    ["3306", "MySQL / MariaDB"],
    ["3389", "RDP"],
    ["5432", "PostgreSQL"],
    ["5439", "Google Meet media relay"],
    ["5900", "VNC (display :0)"],
    ["6379", "Redis"],
    ["6660-6669", "IRC"],
    ["8080", "HTTP alt / proxies"],
    ["8443", "HTTPS alt"],
    ["9001", "LogMeIn / CS:Source"],
    ["9200", "Elasticsearch HTTP"],
    ["11211", "Memcached"],
    ["27017", "MongoDB"],
    ["32400", "Plex"],
    ["5432-5434", "PostgreSQL family"],
    ["25565", "Minecraft"],
];

export const EXTRA_URL_TOOLS = [
    makeTextTool({
        id: "x-ip-int",
        label: "IPv4 ⇄ 32-bit Integer",
        description: "Dotted-quad IPv4 ⇄ its unsigned 32-bit integer (both decimal and hex).",
        sample: "192.168.1.1",
        transform: (input) => {
            const t = input.trim();
            if (/^\d+$/.test(t) || /^0x[0-9a-f]+$/i.test(t)) {
                const n = t.startsWith("0x") ? parseInt(t.slice(2), 16) : Number(t);
                if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return "Paste an integer from 0 to 4294967295.";
                return intToIpv4(n >>> 0);
            }
            const ip = parseIpv4(t);
            if (ip === null) return "Paste an IPv4 address or a 32-bit integer.";
            return `${ip} (decimal)\n0x${ip.toString(16).padStart(8, "0")} (hex)\n${ip.toString(2).padStart(32, "0")} (binary)`;
        },
    }),
    makeTextTool({
        id: "x-ipv6-expand",
        label: "IPv6 Expand",
        description: "Compressed IPv6 (with ::) → the full 8-group, 4-digit form.",
        sample: "2001:db8::1",
        transform: (input) => expandIpv6(input) ?? "Paste an IPv6 address (e.g. 2001:db8::1).",
    }),
    makeTextTool({
        id: "x-ipv6-compress",
        label: "IPv6 Compress",
        description: "A full IPv6 → the shortest form (leading zeros stripped, longest zero run becomes ::).",
        sample: "2001:0db8:0000:0000:0000:0000:0000:0001",
        transform: (input) => compressIpv6(input) ?? "Paste an IPv6 address.",
    }),
    makeTextTool({
        id: "x-ipv6-mapped",
        label: "IPv4 ⇄ IPv6-mapped",
        description: "IPv4 ⇄ the ::ffff:0:0/96 IPv6-mapped representation (and the 6to4 / v4-compatible form).",
        sample: "192.168.1.1",
        transform: (input, opts) => {
            const mode = String(opts.mode || "mapped");
            const t = input.trim();
            if (t.includes(":")) {
                const full = expandIpv6(t);
                if (!full) return "Paste an IPv4 address or an IPv6-mapped address.";
                if (full.startsWith("0000:0000:0000:0000:0000:ffff:")) {
                    const hex = full.slice(30).split(":").map((h) => parseInt(h, 16));
                    return intToIpv4((hex[0] << 16) | hex[1]);
                }
                return "Not an IPv6-mapped (::ffff:…) address.";
            }
            const ip = parseIpv4(t);
            if (ip === null) return "Paste an IPv4 address or an IPv6-mapped address.";
            const hex = [
                (ip >>> 16) & 0xffff,
                ip & 0xffff,
            ]
                .map((x) => x.toString(16).padStart(4, "0"))
                .join(":");
            if (mode === "compatible") return `::${hex}`;
            return `::ffff:${hex}`;
        },
        options: [{
            key: "mode",
            label: "Form",
            kind: "select",
            choices: [["mapped", "::ffff: (mapped)"], ["compatible", ":: (v4-compatible, historic)"]],
            default: "mapped"
        }],
    }),
    makeTextTool({
        id: "x-cidr-merge",
        label: "CIDR Merge / Aggregate",
        description: "Merge a list of CIDRs — adjacent and contained blocks collapse into supernets.",
        sample: "10.0.4.0/24\n10.0.5.0/24\n10.0.6.0/24\n192.168.1.0/26\n192.168.1.64/26",
        transform: (input) => {
            const blocks = input
                .split(/[\s,]+/)
                .map((s) => parseCidr(s))
                .filter((b): b is { ip: number; prefix: number } => b !== null);
            if (blocks.length === 0) return "Paste CIDRs (one per line or space separated).";
            const ranges = blocks
                .map((b) => ({...cidrToRange(b.ip, b.prefix), prefix: b.prefix}))
                .sort((a, b) => a.first - b.first || a.last - b.last);
            // remove contained ranges
            const deduped: Array<{ first: number; last: number; prefix: number }> = [];
            for (const r of ranges) {
                const prev = deduped[deduped.length - 1];
                if (prev && r.first >= prev.first && r.last <= prev.last) continue;
                deduped.push(r);
            }
            // merge adjacent supernets repeatedly
            let merged = true;
            let list = [...deduped];
            while (merged) {
                merged = false;
                const out: typeof list = [];
                for (let i = 0; i < list.length; i++) {
                    const cur = list[i];
                    const next = list[i + 1];
                    if (next && cur.prefix === next.prefix && cur.prefix > 0) {
                        const mask = cur.prefix === 0 ? 0 : (0xffffffff << (32 - cur.prefix)) >>> 0;
                        const superMask = (0xffffffff << (33 - cur.prefix)) >>> 0;
                        const superBase = (cur.first & superMask) >>> 0;
                        const nextSuper = (next.first & superMask) >>> 0;
                        const aligned = (cur.first & mask) === cur.first;
                        void mask;
                        if (aligned && superBase === nextSuper && nextSuper + ((~superMask >>> 0) >>> 0) >= next.last) {
                            out.push({first: superBase, last: superBase + (~superMask >>> 0), prefix: cur.prefix - 1});
                            merged = true;
                            i++;
                            continue;
                        }
                    }
                    out.push(cur);
                }
                list = out;
            }
            return list.map((r) => `${intToIpv4(r.first)}/${r.prefix}`).join("\n");
        },
    }),
    makeTextTool({
        id: "x-netmask-wildcard",
        label: "Netmask ⇄ Wildcard ⇄ CIDR",
        description: "One subnet in netmask, wildcard (inverse), CIDR and host-count forms.",
        sample: "10.0.0.0/24",
        transform: (input) => {
            let ip: number | null = null;
            let prefix: number | null = null;
            if (input.includes("/")) {
                const cidr = parseCidr(input);
                if (!cidr) return "Paste 10.0.0.0/24, 255.255.255.0, or 0.0.0.255.";
                ip = cidr.ip;
                prefix = cidr.prefix;
            } else {
                const maybe = parseIpv4(input.trim());
                if (maybe === null) return "Paste 10.0.0.0/24, 255.255.255.0, or 0.0.0.255.";
                ip = maybe;
                if ((maybe & (maybe + 1)) === 0) prefix = 32 - Math.log2((~maybe >>> 0) + 1);
                else if ((maybe & (maybe - 1)) === 0) prefix = 32 - Math.log2((~maybe >>> 0) >>> 0 || 1);
            }
            if (prefix === null || ip === null) return "That is not a contiguous mask.";
            const mask = maskOf(prefix);
            const wildcard = intToIpv4(~(0xffffffff << (32 - prefix)) >>> 0);
            const hosts = prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
            return [
                `network  : ${intToIpv4(ip & ((0xffffffff << (32 - prefix)) >>> 0))}`,
                `netmask  : ${mask}`,
                `wildcard : ${wildcard}`,
                `CIDR     : ${intToIpv4(ip)}/${prefix}`,
                `hosts    : ${hosts.toLocaleString()}${prefix < 31 ? " (usable)" : ""}`,
                `broadcast: ${prefix === 0 ? "255.255.255.255" : intToIpv4((ip | (~(0xffffffff << (32 - prefix)) >>> 0)) >>> 0)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-ip-range-cidr",
        label: "IP Range ⇄ CIDR List",
        description: "A first-last range ⇄ the exact list of CIDRs covering it (and back).",
        sample: "10.0.0.1 10.0.0.99",
        transform: (input) => {
            const parts = input.trim().split(/[\s-]+/);
            const first = parseIpv4(parts[0] ?? "");
            const last = parseIpv4(parts[1] ?? "");
            if (first === null || last === null) return "Paste: 10.0.0.1 10.0.0.99 (or a CIDR list).";
            if (/\/\d/.test(input)) {
                const blocks = input
                    .split(/[\s,]+/)
                    .map((s) => parseCidr(s))
                    .filter((b): b is { ip: number; prefix: number } => b !== null)
                    .map((b) => cidrToRange(b.ip, b.prefix));
                if (blocks.length === 0) return "—";
                return [
                    `first: ${intToIpv4(Math.min(...blocks.map((r) => r.first)))}`,
                    `last : ${intToIpv4(Math.max(...blocks.map((r) => r.last)))}`,
                ].join("\n");
            }
            if (last < first) return "The last IP precedes the first.";
            const out: string[] = [];
            let cur = first;
            while (cur <= last) {
                // the largest block that starts at cur and fits in the range
                let prefix = 32;
                while (prefix > 0) {
                    const size = 2 ** (32 - prefix);
                    const mask = (0xffffffff << (32 - prefix)) >>> 0;
                    if ((cur & mask) === cur && cur + size - 1 <= last) {
                        // also don't undercut the block boundary
                        const superMask = (0xffffffff << (33 - prefix)) >>> 0;
                        if ((cur & superMask) !== cur || cur + size * 2 - 1 > last) break;
                        prefix--;
                    } else break;
                }
                const size = 2 ** (32 - prefix);
                out.push(`${intToIpv4(cur)}/${prefix}`);
                cur += size;
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-ip-classify",
        label: "IPv4 Classifier",
        description: "What kind of address is this? private / loopback / link-local / multicast / reserved / public + its historic class.",
        sample: "192.168.1.1",
        transform: (input) => {
            const ip = parseIpv4(input.trim());
            if (ip === null) return "Paste an IPv4 address.";
            const o1 = (ip >>> 24) & 0xff;
            const tags: string[] = [];
            if (o1 === 10) tags.push("private (RFC1918 10/8)");
            if (o1 === 172 && ((ip >>> 16) & 0xff) >= 16 && ((ip >>> 16) & 0xff) <= 31) tags.push("private (RFC1918 172.16/12)");
            if (o1 === 192 && ((ip >>> 16) & 0xff) === 168) tags.push("private (RFC1918 192.168/16)");
            if (o1 === 127) tags.push("loopback (127/8)");
            if (o1 === 169 && ((ip >>> 16) & 0xff) === 254) tags.push("link-local (APIPA 169.254/16)");
            if (o1 >= 224 && o1 <= 239) tags.push("multicast (224/4)");
            if (o1 >= 240) tags.push("reserved (240/4)");
            if (o1 === 100 && ((ip >>> 16) & 0xff) >= 64 && ((ip >>> 16) & 0xff) <= 127) tags.push("CGNAT shared (100.64/10)");
            if (o1 === 0) tags.push("this-network (0/8)");
            if (o1 === 255) tags.push("broadcast");
            if (tags.length === 0) tags.push("public (global unicast)");
            const klass = o1 < 128 ? "A" : o1 < 192 ? "B" : o1 < 224 ? "C" : o1 < 240 ? "D (multicast)" : "E";
            return `${intToIpv4(ip)}\nclass    : ${klass} (historic)\ncategory : ${tags.join(", ")}`;
        },
    }),
    makeTextTool({
        id: "x-ip-binary",
        label: "IPv4 ⇄ Binary",
        description: "Each octet as 8 bits — the subnetting chalkboard view.",
        sample: "10.1.2.3",
        transform: (input) => {
            const ip = parseIpv4(input.trim());
            if (ip === null) return "Paste an IPv4 address.";
            const octets = [(ip >>> 24) & 0xff, (ip >>> 16) & 0xff, (ip >>> 8) & 0xff, ip & 0xff];
            const bins = octets.map((o) => o.toString(2).padStart(8, "0"));
            return `${bins.join(" ")}\n${bins.join(".")}`;
        },
    }),
    makeTextTool({
        id: "x-vlsm-split",
        label: "Subnet Splitter (VLSM)",
        description: "Split a base CIDR into N equal subnets — network / range / broadcast per child.",
        sample: "192.168.0.0/24 4",
        transform: (input) => {
            const m = /^(\d+\.\d+\.\d+\.\d+\/\d+)\s+(\d+)$/.exec(input.trim());
            if (!m) return "Paste: 192.168.0.0/24 4 (split into 4).";
            const base = parseCidr(m[1]);
            const count = Number(m[2]);
            if (!base || count < 1 || !Number.isInteger(Math.log2(count))) return "The count must be a power of two (2, 4, 8, …).";
            const newPrefix = base.prefix + Math.log2(count);
            if (newPrefix > 32) return "That split is finer than /32.";
            const size = 2 ** (32 - newPrefix);
            const {first} = cidrToRange(base.ip, base.prefix);
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                const net = first + i * size;
                out.push(
                    `${intToIpv4(net)}/${newPrefix}  ${intToIpv4(net)} – ${intToIpv4(net + size - 1)}${newPrefix < 31 ? `  bc ${intToIpv4(net + size - 1)}` : ""}`
                );
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-eui64",
        label: "MAC ⇄ IPv6 Link-Local (EUI-64)",
        description: "Derive the fe80:: link-local address from a MAC (insert ff:fe, flip the universal/local bit).",
        sample: "00:1a:2b:3c:4d:5e",
        transform: (input) => {
            const hex = input.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
            if (!/^[0-9a-f]{12}$/.test(hex)) return "Paste a MAC address.";
            const bytes = [0, 2, 4, 6, 8, 10].map((i) => parseInt(hex.slice(i, i + 2), 16));
            bytes[0] ^= 0x02; // flip the U/L bit
            const eui = [bytes[0], bytes[1], bytes[2], 0xff, 0xfe, bytes[3], bytes[4], bytes[5]]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(":");
            return `EUI-64  : ${eui}\nlink-local: fe80::${eui.replace(/:/g, "").replace(/(.{4})(?=.)/g, "$1:").toLowerCase()}`;
        },
    }),
    makeTextTool({
        id: "x-reverse-dns",
        label: "Reverse DNS Names",
        description: "Build the in-addr.arpa / ip6.arpa reverse lookup names for an IP.",
        sample: "192.168.1.10",
        transform: (input) => {
            const t = input.trim();
            if (!t.includes(":")) {
                const ip = parseIpv4(t);
                if (ip === null) return "Paste an IPv4 or IPv6 address.";
                const octets = [(ip >>> 24) & 0xff, (ip >>> 16) & 0xff, (ip >>> 8) & 0xff, ip & 0xff];
                return `${[...octets].reverse().join(".")}.in-addr.arpa`;
            }
            const full = expandIpv6(t);
            if (!full) return "Paste an IPv4 or IPv6 address.";
            const nibbles = full.replace(/:/g, "").split("").reverse().join(".");
            return `${nibbles}.ip6.arpa`;
        },
    }),
    makeTextTool({
        id: "x-url-join",
        label: "URL Builder (join parts)",
        description: "Scheme / host / port / path / query keys → one assembled absolute URL.",
        sample: "https\nexample.com\n8080\n/api/users\npage=2 tag=red",
        transform: (input) => {
            const [scheme = "https", host = "", port = "", path = "", query = ""] = input.split(/\r?\n/).map((l) => l.trim());
            if (!host) return "Line 1: scheme · Line 2: host · Line 3: port · Line 4: path · Line 5+: query pairs";
            const params = parsePairs(query);
            const search = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
            const normScheme = scheme.replace(/:$/, "");
            const portPart = port && !((normScheme === "http" && port === "80") || (normScheme === "https" && port === "443")) ? `:${port}` : "";
            const normPath = path.startsWith("/") ? path : path ? `/${path}` : "/";
            return `${normScheme}://${host.toLowerCase()}${portPart}${normPath}${search ? `?${search}` : ""}`;
        },
    }),
    makeTextTool({
        id: "x-query-styles",
        label: "Query Param Styles",
        description: "Convert a URL's query string between the array syntaxes: repeated, a[], a[0], and comma-packed.",
        sample: "https://x.dev/items?tag=red&tag=blue&page=2",
        transform: (input, opts) => {
            const style = String(opts.style || "repeated");
            const qIndex = input.indexOf("?");
            const base = qIndex >= 0 ? input.slice(0, qIndex) : "";
            const params = new URLSearchParams(qIndex >= 0 ? input.slice(qIndex + 1) : input);
            const pairs: Array<[string, string]> = [];
            for (const key of new Set(params.keys())) {
                const all = params.getAll(key);
                all.forEach((v) => pairs.push([key, v]));
            }
            const out = pairs
                .map(([k, v]) => {
                    const isMulti = pairs.filter((p) => p[0] === k).length > 1;
                    if (!isMulti) return `${k}=${v}`;
                    if (style === "bracket") return `${k}[]=${v}`;
                    if (style === "indexed") return `${k}[${pairs.filter((p) => p[0] === k).findIndex((p) => p[1] === v && p[0] === k)}]=${v}`;
                    if (style === "comma") return `${k}=${pairs.filter((p) => p[0] === k).map((p) => p[1]).join(",")}`;
                    return `${k}=${v}`;
                })
                .filter((x, i, arr) => arr.indexOf(x) === i);
            return `${base}${out.length ? "?" : ""}${out.join("&")}`;
        },
        options: [
            {
                key: "style",
                label: "Target style",
                kind: "select",
                choices: [["repeated", "repeated keys"], ["bracket", "key[]"], ["indexed", "key[0]"], ["comma", "comma-packed"]],
                default: "repeated"
            },
        ],
    }),
    makeTextTool({
        id: "x-user-agent-parse",
        label: "User-Agent Parser",
        description: "A best-effort offline parse: browser family+version, OS family, and device class from a UA string.",
        sample: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        transform: (input) => {
            const ua = input.trim();
            if (!ua) return "—";
            const out: string[] = [];
            const browsers: ReadonlyArray<readonly [string, RegExp]> = [
                ["Edg", /Edg\/(\d+)/], ["OPR", /OPR\/(\d+)/], ["SamsungBrowser", /SamsungBrowser\/(\d+)/],
                ["Firefox", /Firefox\/(\d+)/], ["Chrome", /Chrome\/(\d+)/], ["Safari", /Version\/(\d+).*Safari/],
                ["MSIE", /MSIE (\d+)/], [" Trident", /Trident\/(\d+)/],
            ];
            for (const [name, re] of browsers) {
                const m = re.exec(ua);
                if (m) {
                    out.push(`browser: ${name.trim()} ${m[1]}`);
                    break;
                }
            }
            const os: ReadonlyArray<readonly [string, RegExp]> = [
                ["Windows 10/11", /Windows NT 10\.0/], ["Windows (older)", /Windows NT ([\d.]+)/],
                ["macOS", /Macintosh; Intel Mac OS X ([\d_.]+)/], ["Android", /Android ([\d.]+)/],
                ["iOS", /(iPhone|iPad).*OS ([\d_]+)/], ["Linux (desktop)", /(?:X11; )?Linux/], ["CrOS", /CrOS/],
            ];
            for (const [name, re] of os) {
                const m = re.exec(ua);
                if (m) {
                    out.push(`os     : ${name}${m[1] && /[\d]/.test(m[1]) ? ` ${m[1].replace(/_/g, ".")}` : ""}`);
                    break;
                }
            }
            if (/bot|crawl|spider|slurp|preview|monitor/i.test(ua)) out.push("device : bot / crawler");
            else if (/Mobile|Android(?!.*Chrome\/)|iPhone|iPad/i.test(ua)) out.push("device : mobile / tablet");
            else out.push("device : desktop");
            if (/Gecko\/\d+/.test(ua) && !/like Gecko/.test(ua)) out.push("engine : Gecko (plain)");
            else if (/AppleWebKit/.test(ua)) out.push("engine : WebKit (KHTML, like Gecko)");
            return out.length ? out.join("\n") : "Unrecognized user-agent string.";
        },
    }),
    makeTextTool({
        id: "x-robots-txt",
        label: "robots.txt Builder",
        description: "Assemble a robots.txt from allow / disallow paths, crawl-delay and sitemap lines.",
        sample: "Disallow /admin\nDisallow /private/\nAllow /public",
        transform: (input, opts) => {
            const agent = String(opts.agent || "*");
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const disallow: string[] = [];
            const allow: string[] = [];
            for (const l of lines) {
                const m = /^(allow|disallow)\s+(\/\S*)$/i.exec(l);
                if (!m) continue;
                (m[1].toLowerCase() === "allow" ? allow : disallow).push(m[2]);
            }
            const out = ["# generated by the Developer Toolbox", "", `User-agent: ${agent}`];
            for (const d of disallow) out.push(`Disallow: ${d}`);
            for (const a of allow) out.push(`Allow: ${a}`);
            if (opts.crawlDelay === true) out.push("Crawl-delay: 10");
            if (opts.sitemap === true) out.push("", "Sitemap: https://example.com/sitemap.xml");
            return out.join("\n");
        },
        options: [
            {
                key: "agent",
                label: "User-agent",
                kind: "select",
                choices: [["*", "* (all)"], ["Googlebot", "Googlebot"], ["Bingbot", "Bingbot"], ["GPTBot", "GPTBot"]],
                default: "*"
            },
            {key: "crawlDelay", label: "Add Crawl-delay", kind: "toggle", default: false},
            {key: "sitemap", label: "Add Sitemap line", kind: "toggle", default: false},
        ],
    }),
    makeTextTool({
        id: "x-sitemap-xml",
        label: "sitemap.xml Builder",
        description: "A list of URLs → a valid sitemap.xml (with optional lastmod / changefreq / priority).",
        sample: "https://example.com/\nhttps://example.com/about 2024-06-01 weekly 0.8",
        transform: (input) => {
            const urls = input
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => {
                    const [loc, lastmod, freq, prio] = l.split(/\s+/);
                    return [
                        "  <url>",
                        `    <loc>${loc}</loc>`,
                        lastmod && /^\d{4}-\d{2}-\d{2}/.test(lastmod) ? `    <lastmod>${lastmod}</lastmod>` : "",
                        freq && /^(always|hourly|daily|weekly|monthly|yearly|never)$/i.test(freq) ? `    <changefreq>${freq.toLowerCase()}</changefreq>` : "",
                        prio && /^\d(\.\d)?$/.test(prio) ? `    <priority>${prio}</priority>` : "",
                        "  </url>",
                    ].filter(Boolean).join("\n");
                });
            if (urls.length === 0) return "Paste URLs (one per line; optional: lastmod changefreq priority).";
            return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
        },
    }),
    makeTextTool({
        id: "x-cors-builder",
        label: "CORS Headers Builder",
        description: "Pick the origin / methods / headers / credentials → the exact response headers to set.",
        sample: "https://app.example.com",
        transform: (input, opts) => {
            const origin = input.trim() || "*";
            const methods = String(opts.methods || "GET, POST");
            const headers = String(opts.headers || "Content-Type, Authorization");
            const creds = opts.credentials === true;
            const out = [
                `Access-Control-Allow-Origin: ${origin === "*" && creds ? "(choose a specific origin — * is not allowed with credentials)" : origin}`,
                `Access-Control-Allow-Methods: ${methods}`,
                `Access-Control-Allow-Headers: ${headers}`,
            ];
            if (creds) out.push("Access-Control-Allow-Credentials: true");
            if (String(opts.maxage || "86400") !== "0") out.push(`Access-Control-Max-Age: ${String(opts.maxage || "86400")}`);
            out.push("Vary: Origin");
            return out.join("\n");
        },
        options: [
            {
                key: "methods",
                label: "Methods",
                kind: "select",
                choices: [["GET, POST", "GET, POST"], ["GET, POST, PUT, PATCH", "GET, POST, PUT, PATCH"], ["GET, POST, PUT, PATCH, DELETE, OPTIONS", "everything"]],
                default: "GET, POST"
            },
            {
                key: "headers",
                label: "Request headers",
                kind: "select",
                choices: [["Content-Type, Authorization", "Content-Type, Authorization"], ["Content-Type", "Content-Type only"]],
                default: "Content-Type, Authorization"
            },
            {key: "credentials", label: "Allow credentials", kind: "toggle", default: false},
            {
                key: "maxage",
                label: "Max-Age",
                kind: "select",
                choices: [["600", "600"], ["3600", "3600"], ["86400", "86400"]],
                default: "86400"
            },
        ],
    }),
    makeTextTool({
        id: "x-ws-url",
        label: "HTTP ⇄ WebSocket URL",
        description: "Turn an http(s) page URL into ws(s) (with port, path and subprotocol), and back.",
        sample: "https://example.com/chat?room=7",
        transform: (input, opts) => {
            const t = input.trim();
            const sub = String(opts.sub || "");
            if (/^wss?:/i.test(t)) {
                const url = new URL(t);
                const scheme = url.protocol === "wss:" ? "https" : "http";
                return `${scheme}://${url.host}${url.pathname}${url.search}`;
            }
            try {
                const url = new URL(t);
                const scheme = url.protocol === "https:" ? "wss" : "ws";
                return `${scheme}://${url.host}${url.pathname}${url.search}${sub ? `\nsubprotocol: ${sub}` : ""}`;
            } catch {
                return "Paste a full absolute URL.";
            }
        },
        options: [{
            key: "sub",
            label: "Subprotocol",
            kind: "select",
            choices: [["", "none"], ["json", "json"], ["mqtt", "mqtt"]],
            default: ""
        }],
    }),
    makeTextTool({
        id: "x-htaccess-redirects",
        label: ".htaccess Redirect Builder",
        description: "old → new path pairs become Apache Redirect lines (301/302, with or without RewriteEngine).",
        sample: "/old-page /new-page\n/about-old /about",
        transform: (input, opts) => {
            const code = String(opts.code || "301");
            const pairs = parsePairs(input.replace(/\t/g, " "));
            const rows = pairs.map(([from, to]) => `${from} ${to}`);
            const parsed = input
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => l.split(/\s+/));
            void rows;
            if (parsed.length === 0) return "Paste one “old new” pair per line.";
            if (String(opts.mode || "redirect") === "rewrite") {
                return [
                    "RewriteEngine On",
                    ...parsed.map(([from, to]) => `RewriteRule ^${from.replace(/^\//, "")}$ ${to.startsWith("/") ? to : `/${to}`} [R=${code},L]`),
                ].join("\n");
            }
            return parsed.map(([from, to]) => `Redirect ${code} ${from} ${to.startsWith("/") ? to : `/${to}`}`).join("\n");
        },
        options: [
            {
                key: "code",
                label: "Status",
                kind: "select",
                choices: [["301", "301 permanent"], ["302", "302 temporary"], ["308", "308 permanent (method-preserving)"]],
                default: "301"
            },
            {
                key: "mode",
                label: "Style",
                kind: "select",
                choices: [["redirect", "Redirect lines"], ["rewrite", "RewriteRule (regex)"]],
                default: "redirect"
            },
        ],
    }),
    makeTextTool({
        id: "x-curl-builder",
        label: "curl Command Builder",
        description: "A request as fields (method / URL / headers / body) → a ready curl command with proper quoting.",
        sample: "POST https://api.example.com/items\nContent-Type: application/json\n{\"name\": \"alpha\"}",
        transform: (input, opts) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim());
            const first = lines[0] ?? "";
            const m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)?\s+(\S+)$/i.exec(first.replace(/\s+/g, " "));
            if (!m) return "Line 1: METHOD URL. Line 2+: header: value lines. Last line: the body (optional).";
            const method = (m[1] ?? "GET").toUpperCase();
            const url = m[2];
            const rest = lines.slice(1);
            let body = "";
            const headers: string[] = [];
            for (const l of rest) {
                const hm = /^([\w-]+):\s*(.*)$/.exec(l);
                if (hm) headers.push(hm[1]);
                else if (l) body = rest.slice(rest.indexOf(l)).join("\n");
            }
            const parts = ["curl"];
            if (method !== "GET") parts.push("-X " + method);
            parts.push(`'${url}'`);
            for (const h of headers) {
                const line = rest.find((l) => l.startsWith(h + ":")) ?? "";
                parts.push(`-H '${line}'`);
            }
            if (body) parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
            if (opts.include === true) parts.push("-i");
            if (opts.verbose === true) parts.push("-v");
            if (String(opts.follow || "no") === "yes") parts.push("-L");
            if (String(opts.insecure || "no") === "yes") parts.push("-k");
            return parts.join(" \\\n  ");
        },
        options: [
            {key: "include", label: "-i (show headers)", kind: "toggle", default: false},
            {key: "verbose", label: "-v (verbose)", kind: "toggle", default: false},
            {
                key: "follow",
                label: "-L (follow redirects)",
                kind: "select",
                choices: [["no", "off"], ["yes", "on"]],
                default: "no"
            },
            {
                key: "insecure",
                label: "-k (skip TLS verify)",
                kind: "select",
                choices: [["no", "off"], ["yes", "on"]],
                default: "no"
            },
        ],
    }),
    makeTextTool({
        id: "x-http-raw",
        label: "Raw HTTP/1.1 Request",
        description: "Build the exact wire text of an HTTP/1.1 request (request line + headers + blank line + body).",
        sample: "POST https://example.com/api\nAccept: application/json\n{\"a\":1}",
        transform: (input) => {
            const lines = input.split(/\r?\n/);
            const first = lines[0].trim();
            const m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)?\s+(\S+)$/i.exec(first.replace(/\s+/g, " "));
            if (!m) return "Line 1: METHOD URL. Then header lines. Then the body after a blank line.";
            const method = (m[1] ?? "GET").toUpperCase();
            let url: URL;
            try {
                url = new URL(m[2]);
            } catch {
                return "The URL must be absolute (https://host/path).";
            }
            const headers: string[] = [];
            let bodyStart = lines.length;
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) {
                    bodyStart = i + 1;
                    break;
                }
                headers.push(lines[i].trim());
            }
            const body = lines.slice(bodyStart).join("\n");
            const hasHost = headers.some((h) => /^host:/i.test(h));
            const req = [
                `${method} ${url.pathname}${url.search || ""} HTTP/1.1`,
                ...(hasHost ? [] : [`Host: ${url.host}`]),
                ...headers,
                ...(body && !headers.some((h) => /^content-length:/i.test(h)) ? [`Content-Length: ${utf8ToBytes(body).length}`] : []),
                "",
                body,
            ];
            return req.join("\r\n");
        },
    }),
    makeTextTool({
        id: "x-url-lint",
        label: "URL Linter",
        description: "Offline URL checks: scheme, host case, unsafe chars, double slashes, empty params, trailing junk.",
        sample: "HTTP://Example.COM//a/./b?&&tag=red#",
        transform: (input) => {
            const t = input.trim();
            if (!t) return "—";
            const issues: string[] = [];
            let url: URL | null = null;
            try {
                url = new URL(t);
            } catch {
                return "Not a parsable absolute URL (needs scheme + host).";
            }
            if (url.protocol !== "https:" && url.protocol !== "http:") issues.push(`scheme "${url.protocol}" is unusual for web links`);
            if (/HTTP:\/\//.test(t) || /HTTPS:\/\//.test(t)) issues.push("scheme should be lowercase (http/https)");
            if (url.hostname !== url.hostname.toLowerCase()) issues.push("host has uppercase letters");
            if (/\/\//.test(url.pathname)) issues.push("double slash in the path");
            if (/\./.test(url.pathname)) issues.push("single-dot path segments (./) — normalize");
            if (/[{}|\\^`"<>\s]/.test(url.href)) issues.push("unsafe characters in the URL");
            const params = [...url.searchParams.entries()];
            if (params.some((p) => p[0] === "" || p[1] === "")) issues.push("empty parameter name or value");
            const dupKeys = params.map((p) => p[0]).filter((k, i, a) => a.indexOf(k) !== i);
            if (dupKeys.length) issues.push(`repeated parameter keys: ${[...new Set(dupKeys)].join(", ")}`);
            if (url.hash === "#") issues.push("empty fragment (#)");
            return issues.length ? issues.map((s, i) => `${i + 1}. ${s}`).join("\n") + `\n\nnormalized: ${url.href}` : `✓ looks clean\n${url.href}`;
        },
    }),
    makeTextTool({
        id: "x-url-md-links",
        label: "URLs → Markdown Links",
        description: "A list of bare URLs → markdown links with title-cased, humanized link text.",
        sample: "https://example.com/about-us\nhttps://dev.example.com/api/v2",
        transform: (input) => {
            const urls = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (urls.length === 0) return "Paste URLs, one per line.";
            return urls
                .map((raw) => {
                    try {
                        const url = new URL(raw);
                        const label = decodeURIComponent(url.pathname)
                            .split("/")
                            .filter((p) => p && !/^\d+$/.test(p))
                            .join(" · ")
                            .replace(/[-_]+/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase()) || url.hostname;
                        return `[${label}](${raw})`;
                    } catch {
                        return raw;
                    }
                })
                .join("\n");
        },
    }),
    makeTextTool({
        id: "x-git-url",
        label: "Git Clone URL Normalizer",
        description: "SSH / HTTPS / git:// forms of the same repository — convert between them.",
        sample: "git@github.com:user/repo.git",
        transform: (input) => {
            const t = input.trim();
            const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/i.exec(t);
            if (ssh) return `https://${ssh[1]}/${ssh[2]}.git`;
            const https = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(t);
            if (https) return `git@${https[1]}:${https[2]}/${https[3]}.git`;
            const gitProto = /^git:\/\/([^/]+)\/(.+?)(?:\.git)?$/i.exec(t);
            if (gitProto) return `https://${gitProto[1]}/${gitProto[2]}.git`;
            return "Paste one of: git@host:user/repo.git · https://host/user/repo.git · git://host/user/repo";
        },
    }),
    makeTextTool({
        id: "x-dns-zone",
        label: "DNS Zone Snippet Builder",
        description: "A host → IP / cname / mail line becomes A / AAAA / CNAME / MX / TXT records in zone-file syntax.",
        sample: "www 10.0.0.5\nalias www\nmail 10.0.0.9\n@ TXT v=spf1 -all",
        transform: (input, opts) => {
            const origin = String(opts.origin || "example.com.");
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const out: string[] = [`; zone fragment for ${origin}`, `@ IN SOA ns1.${origin} hostmaster.${origin} (`, "  1 ; serial", "  7200 ; refresh", "  3600 ; retry", "  1209600 ; expire", "  3600 ) ; minimum", ""];
            for (const l of lines) {
                const m = /^(\S+)\s+(\S+)(?:\s+(\S+))?$/.exec(l.replace(/\t/g, " ").replace(/\s+/g, " "));
                if (!m) continue;
                const [name, second, third] = m.slice(1) as [string, string, string | undefined];
                if (/^\d+\.\d+\.\d+\.\d+$/.test(second)) out.push(`${name === "@" ? "@" : name} IN A ${second}`);
                else if (second === "www" || (third && /^[\d.]+$/.test(third))) out.push(`${name} IN CNAME ${second}`);
                else if (/^[0-9a-f:]+$/i.test(second)) out.push(`${name} IN AAAA ${second}`);
                else if (second === "TXT" || /^v=/.test(second)) out.push(`${name} IN TXT "${(second === "TXT" ? third : second) ?? second}"`);
                else out.push(`; could not classify: ${l}`);
            }
            out.push("", `@ IN NS ns1.${origin}`, `@ IN NS ns2.${origin}`);
            return out.join("\n");
        },
        options: [{
            key: "origin",
            label: "Zone origin",
            kind: "select",
            choices: [["example.com.", "example.com."], ["internal.", "internal."], ["localhost.", "localhost."]],
            default: "example.com."
        }],
    }),
    makeTextTool({
        id: "x-auth-header",
        label: "Authorization Header Builder",
        description: "Bearer / Basic / API-key header values — the exact string to send (base64 done for Basic).",
        sample: "Bearer",
        transform: (input, opts) => {
            const kind = String(opts.kind || "bearer");
            const t = input.trim();
            if (kind === "bearer") return `Authorization: Bearer ${t || "<token>"}`;
            if (kind === "basic") {
                const parts = t.split(/[:\n]/);
                if (parts.length < 2) return "Paste: username:password for Basic, or a token for Bearer.";
                return `Authorization: Basic ${btoa(`${parts[0]}:${parts.slice(1).join(":")}`)}`;
            }
            if (kind === "apikey") return `X-API-Key: ${t || "<key>"}`;
            return `X-Auth-Token: ${t || "<token>"}`;
        },
        options: [
            {
                key: "kind",
                label: "Scheme",
                kind: "select",
                choices: [["bearer", "Bearer"], ["basic", "Basic (user:pass)"], ["apikey", "X-API-Key"], ["token", "X-Auth-Token"]],
                default: "bearer"
            },
        ],
    }),
    makeTextTool({
        id: "x-port-ref",
        label: "Common Ports ⇄ Service",
        description: "The well-known TCP/UDP port table — paste a number to look it up, or read the whole table.",
        sample: "443",
        transform: (input, opts) => {
            const t = input.trim();
            if (t && opts.list !== true) {
                const hits = PORTS_TABLE.filter(([p]) => p.split(/[\s/-]+/).some((x) => x === t || (x.includes("-") && Number(t) >= Number(x.split("-")[0]) && Number(t) <= Number(x.split("-")[1]))));
                if (hits.length) return hits.map(([p, s]) => `${p.padEnd(22)} ${s}`).join("\n");
                const n = Number(t);
                if (Number.isInteger(n) && n >= 0 && n <= 65535) {
                    const reg = n < 1024 ? "registered/well-known range (<1024)" : n < 49152 ? "registered range (1024-49151)" : "dynamic/private range";
                    return `No entry in the built-in list.\n${n} sits in the ${reg}.`;
                }
                return "Paste a port number (0-65535) or switch List on.";
            }
            return PORTS_TABLE.map(([p, s]) => `${p.padEnd(22)} ${s}`).join("\n");
        },
        options: [{key: "list", label: "List the whole table", kind: "toggle", default: false}],
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  TIME — 27 additional (3 → 30)
 * ══════════════════════════════════════════════════════════════════ */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

function parseDateSafe(text: string): Date | null {
    const t = text.trim();
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : t);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO-8601 duration ⇄ total seconds. */
function parseIsoDuration(text: string): number | null {
    const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text.trim());
    if (!m || m.slice(1).every((x) => x === undefined)) return null;
    const [y, mo, w, d, h, mi, s] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
    return y * 365.25 * 86400 + mo * 30.4375 * 86400 + w * 7 * 86400 + d * 86400 + h * 3600 + mi * 60 + s;
}

function secondsToIsoDuration(totalSeconds: number): string {
    let t = Math.abs(totalSeconds);
    const d = Math.floor(t / 86400);
    t -= d * 86400;
    const h = Math.floor(t / 3600);
    t -= h * 3600;
    const m = Math.floor(t / 60);
    t -= m * 60;
    const s = Math.round(t * 1000) / 1000;
    const parts = ["P"];
    if (d) parts.push(`${d}D`);
    if (h || m || s) parts.push("T");
    if (h) parts.push(`${h}H`);
    if (m) parts.push(`${m}M`);
    if (s) parts.push(`${s}S`);
    if (parts.length === 1) parts.push("T0S");
    return parts.join("") + (totalSeconds < 0 ? " (negative)" : "");
}

/** Julian Day Number for a UTC date. */
function toJulianDay(d: Date): number {
    return d.getTime() / 86400000 + 2440587.5;
}

function fromJulianDay(jdn: number): Date {
    return new Date((jdn - 2440587.5) * 86400000);
}

/** ISO-8601 week number. */
function isoWeek(d: Date): { year: number; week: number; weekday: string } {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
    const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
    return {year: date.getUTCFullYear(), week, weekday: WEEKDAYS[dayNum]};
}

/** Gaussian Easter algorithm for a year. */
function easterFor(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

/** Moon phase (0 = new, 0.5 = full) for a date. */
function moonPhase(d: Date): { phase: number; name: string; illum: string } {
    const synodic = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14); // known new moon
    const days = (d.getTime() - ref) / 86400000;
    const phase = ((days / synodic) % 1 + 1) % 1;
    const names = [
        "new moon", "waxing crescent", "first quarter", "waxing gibbous",
        "full moon", "waning gibbous", "last quarter", "waning crescent",
    ];
    const idx = Math.floor((phase * 8 + 0.5) % 8);
    const illum = roundTo((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100, 1);
    return {phase, name: names[idx], illum: `${illum}%`};
}

const TZ_ABBRS: ReadonlyArray<readonly [string, string, number]> = [
    ["UTC", "Coordinated Universal Time", 0],
    ["GMT", "Greenwich Mean Time", 0],
    ["UCT", "Coordinated Universal Time (alt)", 0],
    ["CET", "Central European Time (standard)", 60],
    ["CEST", "Central European Summer Time", 120],
    ["EET", "Eastern European Time (standard)", 120],
    ["EEST", "Eastern European Summer Time", 180],
    ["BST", "British Summer Time", 60],
    ["IST", "India Standard Time", 330],
    ["CCT", "China Coast Time / CST (Asia)", 480],
    ["JST", "Japan Standard Time", 540],
    ["KST", "Korea Standard Time", 540],
    ["AWST", "Australian Western Standard Time", 480],
    ["ACST", "Australian Central Standard Time", 570],
    ["AEST", "Australian Eastern Standard Time", 600],
    ["AEDT", "Australian Eastern Daylight Time", 660],
    ["NZST", "New Zealand Standard Time", 720],
    ["NZDT", "New Zealand Daylight Time", 780],
    ["EST", "Eastern Time (US standard)", -300],
    ["EDT", "Eastern Time (US daylight)", -240],
    ["CST", "Central Time (US standard)", -360],
    ["CDT", "Central Time (US daylight)", -300],
    ["MST", "Mountain Time (US standard)", -420],
    ["MDT", "Mountain Time (US daylight)", -360],
    ["PST", "Pacific Time (US standard)", -480],
    ["PDT", "Pacific Time (US daylight)", -420],
    ["AKST", "Alaska Standard Time", -540],
    ["AKDT", "Alaska Daylight Time", -480],
    ["HST", "Hawaii Standard Time", -600],
    ["HAST", "Hawaii-Aleutian Standard Time", -600],
    ["AST", "Atlantic Time (standard)", -240],
    ["ADT", "Atlantic Daylight Time", -180],
    ["NST", "Newfoundland Standard Time", -210],
    ["NDT", "Newfoundland Daylight Time", -150],
    ["BRT", "Brasília Time", -180],
    ["CLT", "Chile Time (standard)", -240],
    ["CLST", "Chile Summer Time", -180],
    ["CAT", "Central Africa Time", 120],
    ["WAT", "West Africa Time", 60],
    ["SAST", "South Africa Standard Time", 120],
    ["EAT", "East Africa Time", 180],
    ["MSK", "Moscow Time", 180],
    ["GST", "Gulf Standard Time", 240],
    ["IRKT", "Irkutsk Time", 480],
    ["ICT", "Indochina Time", 420],
    ["WIB", "Western Indonesia Time", 420],
    ["TAHT", "Tahiti Time", -600],
];

function fmtOffset(min: number): string {
    const sign = min < 0 ? "-" : "+";
    const abs = Math.abs(min);
    return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export const EXTRA_TIME_TOOLS = [
    makeTextTool({
        id: "x-iso-duration",
        label: "ISO-8601 Duration ⇄ Seconds",
        description: "PT1H30M ⇄ 5400 — parse and build ISO-8601 durations (weeks / days / hours / minutes / seconds).",
        sample: "PT1H30M",
        transform: (input) => {
            const t = input.trim();
            if (/^[Pp]/.test(t)) {
                const secs = parseIsoDuration(t.toUpperCase());
                if (secs === null) return "That is not a valid ISO-8601 duration (P…T…).";
                return `${roundTo(secs, 3)} seconds\n${roundTo(secs / 60, 2)} minutes\n${roundTo(secs / 3600, 3)} hours\n${roundTo(secs / 86400, 3)} days`;
            }
            const secs = Number(t);
            if (!Number.isFinite(secs)) return "Paste PT1H30M or a number of seconds.";
            return secondsToIsoDuration(secs);
        },
    }),
    makeTextTool({
        id: "x-excel-date",
        label: "Excel Serial Date ⇄ Date",
        description: "Excel/LibreOffice date serials ⇄ ISO dates (the 1900 leap-year bug handled).",
        sample: "45000",
        transform: (input) => {
            const t = input.trim();
            if (/^\d+(\.\d+)?$/.test(t)) {
                const serial = Number(t);
                // Excel's day 1 = 1900-01-01; the fake Feb 29 1900 shifts serials ≥ 61.
                const ms = (serial - (serial >= 61 ? 1 : 0) - 25569) * 86400000;
                return new Date(ms).toISOString();
            }
            const d = parseDateSafe(t);
            if (!d) return "Paste an Excel serial number or an ISO date.";
            const serial = Math.floor(d.getTime() / 86400000) + 25569 + (d.getTime() / 86400000 + 25569 >= 61 ? 1 : 0);
            return `${serial} (Excel serial)\n${roundTo(d.getTime() / 86400000 + 2440587.5, 3)} (Julian Day Number)`;
        },
    }),
    makeTextTool({
        id: "x-business-days",
        label: "Add Business Days",
        description: "A date + N business days (Mon-Fri) → the landing date, weekends skipped.",
        sample: "2024-06-03\n10",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const d = parseDateSafe(lines[0] ?? "");
            const n = Number(lines[1] ?? 0);
            if (!d || !Number.isInteger(n)) return "Line 1: a date. Line 2: whole business days (can be negative).";
            const cur = new Date(d);
            const step = n >= 0 ? 1 : -1;
            let left = Math.abs(n);
            while (left > 0) {
                cur.setUTCDate(cur.getUTCDate() + step);
                const day = cur.getUTCDay();
                if (day !== 0 && day !== 6) left--;
            }
            return `${cur.toISOString().slice(0, 10)} (${WEEKDAYS[(cur.getUTCDay() + 6) % 7]})`;
        },
    }),
    makeTextTool({
        id: "x-workweek-between",
        label: "Business Days Between",
        description: "Two dates → business days between them (weekends excluded, inclusive ends optional).",
        sample: "2024-06-03\n2024-06-14",
        transform: (input, opts) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const a = parseDateSafe(lines[0] ?? "");
            const b = parseDateSafe(lines[1] ?? "");
            if (!a || !b) return "Two dates, one per line.";
            const inclusive = opts.inclusive === true;
            const lo = Math.min(a.getTime(), b.getTime());
            const hi = Math.max(a.getTime(), b.getTime());
            let days = 0;
            for (let t = lo; t <= hi; t += 86400000) {
                const day = new Date(t).getUTCDay();
                if (day !== 0 && day !== 6) days++;
            }
            const total = Math.round((hi - lo) / 86400000) + 1;
            return `calendar days : ${total}\nbusiness days : ${inclusive ? days : Math.max(0, days - 2)} (inclusive; −2 for both ends exclusive)\nweekend days  : ${total - days}`;
        },
        options: [{key: "inclusive", label: "Count end days", kind: "toggle", default: true}],
    }),
    makeTextTool({
        id: "x-age",
        label: "Age Calculator",
        description: "A birth date → years / months / days elapsed, plus the next birthday countdown.",
        sample: "1994-06-15",
        transform: (input) => {
            const b = parseDateSafe(input);
            if (!b) return "Paste a birth date.";
            const now = new Date();
            let years = now.getUTCFullYear() - b.getUTCFullYear();
            let months = now.getUTCMonth() - b.getUTCMonth();
            let days = now.getUTCDate() - b.getUTCDate();
            if (days < 0) {
                months--;
                days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
            }
            if (months < 0) {
                years--;
                months += 12;
            }
            const next = new Date(Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
            if (next.getTime() < now.getTime()) next.setUTCFullYear(now.getUTCFullYear() + 1);
            const daysTo = Math.ceil((next.getTime() - now.getTime()) / 86400000);
            return [
                `age      : ${years} years, ${months} months, ${days} days`,
                `total    : ${Math.floor((now.getTime() - b.getTime()) / 86400000)} days (${roundTo((now.getTime() - b.getTime()) / 86400000 / 365.25, 1)} years)`,
                `born on  : ${WEEKDAYS[(b.getUTCDay() + 6) % 7]}`,
                `birthday: in ${daysTo} day${daysTo === 1 ? "" : "s"} (${next.toISOString().slice(0, 10)})`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-zoned",
        label: "Time Zone Offset Converter",
        description: "A UTC timestamp → the same instant in ±HH:MM offsets (or a fixed-offset instant back to UTC).",
        sample: "2024-06-01T12:00:00Z",
        transform: (input, opts) => {
            const d = parseDateSafe(input);
            if (!d) return "Paste an ISO date-time (…Z or with an offset).";
            const zones: Array<readonly [string, number]> =
                String(opts.zones || "common") === "common"
                    ? [["UTC", 0], ["New York (EST)", -300], ["Los Angeles (PST)", -480], ["London (GMT)", 0], ["Berlin (CET)", 60], ["Moscow (MSK)", 180], ["Dubai (GST)", 240], ["Kolkata (IST)", 330], ["Beijing (CCT)", 480], ["Tokyo (JST)", 540], ["Sydney (AEST)", 600]]
                    : [["UTC", 0], ["+05:30", 330], ["-08:00", -480], ["+09:00", 540], ["-05:00", -300], ["+02:00", 120]];
            return zones
                .map(([name, off]) => {
                    const local = new Date(d.getTime() + off * 60000);
                    return `${name.padEnd(18)} ${local.toISOString().slice(0, 19).replace("T", " ")} ${fmtOffset(off)}`;
                })
                .join("\n");
        },
        options: [{
            key: "zones",
            label: "Zone set",
            kind: "select",
            choices: [["common", "Common cities (standard time)"], ["offsets", "Raw offsets"]],
            default: "common"
        }],
        note: "Standard-time offsets only (no DST) — a quick reference, not a tz database.",
    }),
    makeTextTool({
        id: "x-quarter",
        label: "Quarter / Fiscal Labeler",
        description: "A date → its calendar quarter and shifted fiscal quarter (Q starts in Jan / Apr / Jul / Oct).",
        sample: "2024-06-15",
        transform: (input, opts) => {
            const d = parseDateSafe(input);
            if (!d) return "Paste a date.";
            const shift = Number(String(opts.start || "jan").replace(/^[a-z]+/, (m) => String(["jan", "apr", "jul", "oct"].indexOf(m)))) || 0;
            const q = Math.floor((((d.getUTCMonth() + 12 - shift * 3) % 12) / 3)) + 1;
            const fy = d.getUTCFullYear() + (shift > 0 && d.getUTCMonth() < shift * 3 ? 1 : 0);
            return `calendar : Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}\nfiscal   : Q${q} FY${fy} (year starts ${["January", "April", "July", "October"][shift]})`;
        },
        options: [{
            key: "start",
            label: "FY starts",
            kind: "select",
            choices: [["jan", "January"], ["apr", "April"], ["jul", "July"], ["oct", "October"]],
            default: "jan"
        }],
    }),
    makeTextTool({
        id: "x-quarter-boundaries",
        label: "Quarter Boundaries",
        description: "A year + quarter → its first and last day, week count and midpoint.",
        sample: "2024 2",
        transform: (input) => {
            const m = /^(\d{4})\s*[-Q\s]*(\d)$/.exec(input.trim().replace(/Q/gi, " ").replace(/\s+/g, " "));
            if (!m) return "Paste: 2024 2 (or 2024-Q2).";
            const year = Number(m[1]);
            const q = Number(m[2]);
            const startMonth = (q - 1) * 3;
            const start = new Date(Date.UTC(year, startMonth, 1));
            const end = new Date(Date.UTC(year, startMonth + 3, 0));
            return [
                `Q${q} ${year}`,
                `first day: ${start.toISOString().slice(0, 10)} (${WEEKDAYS[(start.getUTCDay() + 6) % 7]})`,
                `last day : ${end.toISOString().slice(0, 10)} (${WEEKDAYS[(end.getUTCDay() + 6) % 7]})`,
                `length   : ${Math.round((end.getTime() - start.getTime()) / 86400000) + 1} days`,
                `midpoint : ${new Date((start.getTime() + end.getTime()) / 2).toISOString().slice(0, 10)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-week-number",
        label: "ISO Week Date ⇄ Calendar Date",
        description: "A date → its ISO-8601 week (2024-W23-5) — and a week date back to the calendar.",
        sample: "2024-06-05",
        transform: (input) => {
            const t = input.trim();
            if (/^\d{4}-W\d{1,2}(-\d)?$/.test(t)) {
                const [year, week, day = "1"] = t.replace("W", "").split("-");
                const jan4 = new Date(Date.UTC(Number(year), 0, 4));
                const jan4Day = (jan4.getUTCDay() + 6) % 7;
                const week1Mon = new Date(jan4);
                week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day);
                const target = new Date(week1Mon);
                target.setUTCDate(target.getUTCDate() + (Number(week) - 1) * 7 + (Number(day) - 1));
                return `${target.toISOString().slice(0, 10)} (${WEEKDAYS[(target.getUTCDay() + 6) % 7]})`;
            }
            const d = parseDateSafe(t);
            if (!d) return "Paste 2024-06-05 or 2024-W23-5.";
            const {year, week, weekday} = isoWeek(d);
            return `${year}-W${pad2(week)} (${weekday})\n${year}-W${pad2(week)}-${(d.getUTCDay() + 6) % 7 + 1}`;
        },
    }),
    makeTextTool({
        id: "x-calendar-grid",
        label: "Month Calendar (text)",
        description: "A plain-text one-month calendar grid — the shell `cal` look, Monday or Sunday first.",
        sample: "2024 6",
        transform: (input, opts) => {
            const m = /^(\d{4})\s+(\d{1,2})$/.exec(input.trim());
            if (!m) return "Paste: 2024 6 (year month).";
            const year = Number(m[1]);
            const month = Number(m[2]);
            if (month < 1 || month > 12) return "Month 1-12.";
            const mondayFirst = String(opts.first || "mon") === "mon";
            const headers = mondayFirst ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
            const first = new Date(Date.UTC(year, month - 1, 1));
            const lead = mondayFirst ? (first.getUTCDay() + 6) % 7 : first.getUTCDay();
            const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
            const cells = [...Array(lead).fill("  "), ...Array.from({length: last}, (_, i) => String(i + 1).padStart(2, "0"))];
            const rows: string[] = [];
            for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join("  "));
            return [`${MONTHS[month - 1]} ${year}`, headers.join("  "), ...rows].join("\n");
        },
        options: [{
            key: "first",
            label: "Week starts",
            kind: "select",
            choices: [["mon", "Monday"], ["sun", "Sunday"]],
            default: "mon"
        }],
    }),
    makeTextTool({
        id: "x-delta-between",
        label: "Delta Between Dates",
        description: "Two date-times → the human delta plus totals in every unit (ms → years).",
        sample: "2024-01-01T00:00:00Z\n2024-06-15T12:30:00Z",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const a = parseDateSafe(lines[0] ?? "");
            const b = parseDateSafe(lines[1] ?? "");
            if (!a || !b) return "Two date-times, one per line.";
            const ms = Math.abs(b.getTime() - a.getTime());
            const totalSec = ms / 1000;
            let y: number;
            let mo: number;
            let d: number;
            let h: number;
            let mi: number;
            let s: number;
            y = Math.floor(totalSec / 31557600);
            mo = Math.floor((totalSec - y * 31557600) / 2629800);
            d = Math.floor((totalSec - y * 31557600 - mo * 2629800) / 86400);
            h = Math.floor((totalSec - y * 31557600 - mo * 2629800 - d * 86400) / 3600);
            mi = Math.floor((totalSec - y * 31557600 - mo * 2629800 - d * 86400 - h * 3600) / 60);
            s = Math.floor(totalSec % 60);
            return [
                `human  : ${y}y ${mo}mo ${d}d ${h}h ${mi}m ${s}s`,
                `years  : ${roundTo(totalSec / 31557600, 4)}`,
                `months : ${roundTo(totalSec / 2629800, 3)}`,
                `weeks  : ${roundTo(totalSec / 604800, 3)}`,
                `days   : ${roundTo(totalSec / 86400, 3)}`,
                `hours  : ${roundTo(totalSec / 3600, 2)}`,
                `minutes: ${roundTo(totalSec / 60, 2)}`,
                `seconds: ${roundTo(totalSec, 0)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-cron-next",
        label: "Cron: Next Runs",
        description: "Evaluate a 5-field cron expression and list its next N run times (UTC).",
        sample: "*/15 9-17 * * 1-5",
        transform: (input, opts) => {
            const fields = input.trim().split(/\s+/);
            if (fields.length !== 5) return "Paste 5 fields: minute hour dom month dow.";
            const matchers = fields.map((f, i) => {
                const limits = [59, 23, 31, 12, 7];
                const vals = new Set<number>();
                for (const part of f.split(",")) {
                    const stepM = /^(\*|\d+(?:-\d+)?)\/(\d+)$/.exec(part);
                    const rangeM = /^(\d+)-(\d+)$/.exec(part);
                    if (stepM) {
                        const step = Number(stepM[2]);
                        const lo = stepM[1] === "*" ? 0 : Number(stepM[1]);
                        const hi = stepM[1] === "*" ? limits[i] : Number(stepM[1]);
                        for (let v = lo; v <= hi; v += step) vals.add(v);
                    } else if (rangeM) {
                        for (let v = Number(rangeM[1]); v <= Number(rangeM[2]); v++) vals.add(v);
                    } else if (part === "*") {
                        for (let v = i === 2 ? 1 : i === 3 ? 1 : 0; v <= limits[i]; v++) vals.add(v);
                    } else {
                        const v = Number(part);
                        if (Number.isInteger(v)) vals.add(v === 7 && i === 4 ? 0 : v);
                    }
                }
                return vals;
            });
            const next = (from: Date): Date | null => {
                const d = new Date(from.getTime());
                d.setUTCSeconds(0, 0);
                for (let guard = 0; guard < 400 * 24 * 60; guard++) {
                    d.setUTCMinutes(d.getUTCMinutes() + 1);
                    const minute = d.getUTCMinutes();
                    if (!matchers[0].has(minute)) {
                        d.setUTCMinutes(59);
                        continue;
                    }
                    if (!matchers[1].has(d.getUTCHours())) {
                        d.setUTCHours(23, 59);
                        continue;
                    }
                    if (!matchers[2].has(d.getUTCDate()) || !matchers[3].has(d.getUTCMonth() + 1)) {
                        d.setUTCDate(31);
                        d.setUTCHours(23, 59);
                        continue;
                    }
                    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
                    if (!matchers[4].has(dow)) {
                        d.setUTCDate(d.getUTCDate() + 1);
                        d.setUTCHours(0, 0);
                        continue;
                    }
                    return d;
                }
                return null;
            };
            const count = Math.min(10, Math.max(1, Number(opts.count || 5)));
            const out: string[] = [];
            let cur = new Date();
            for (let i = 0; i < count; i++) {
                const t = next(cur);
                if (!t) return "No upcoming run found within the search window.";
                out.push(`${t.toISOString().slice(0, 19).replace("T", " ")} UTC (${WEEKDAYS[(t.getUTCDay() + 6) % 7]})`);
                cur = t;
            }
            return out.join("\n");
        },
        options: [{
            key: "count",
            label: "How many",
            kind: "select",
            choices: [["3", "3"], ["5", "5"], ["10", "10"]],
            default: "5"
        }],
        note: "Five-field cron, UTC, no month/day-name aliases, no special strings (@daily, L, W …).",
    }),
    makeTextTool({
        id: "x-cron-explain",
        label: "Cron → Plain English",
        description: "A 5-field cron expression explained field by field, then as one sentence.",
        sample: "30 2 * * 1-5",
        transform: (input) => {
            const fields = input.trim().split(/\s+/);
            if (fields.length !== 5) return "Paste 5 fields: minute hour dom month dow.";
            const names = ["minute", "hour", "day-of-month", "month", "day-of-week"];
            const explain = (field: string, i: number): string => {
                if (field === "*") return i === 4 ? "every day of the week" : i === 2 ? "every day of the month" : i === 3 ? "every month" : `every ${names[i]}`;
                if (/^\*\/(\d+)$/.test(field)) return `every ${Number(/^\*\/(\d+)$/.exec(field)![1])} ${names[i]}s`;
                if (/^\d+\/\d+$/.test(field)) {
                    const [start, step] = field.split("/").map(Number);
                    return `${names[i]}s ${start} to ${i === 0 ? 59 : i === 1 ? 23 : i === 2 ? 31 : i === 3 ? 12 : 7}, every ${step}`;
                }
                if (/^\d+-\d+$/.test(field)) {
                    const [a, b] = field.split("-").map(Number);
                    const label = i === 4 ? (x: number) => WEEKDAYS[(x + 6) % 7] : (x: number) => String(x);
                    return `${names[i]}s ${label(a)} through ${label(b)}`;
                }
                if (field.includes(",")) {
                    const vals = field.split(",").map((v) => (i === 4 ? WEEKDAYS[(Number(v) + 6) % 7] : v));
                    return `${names[i]}s ${vals.join(", ")}`;
                }
                return `${names[i]} ${i === 4 ? WEEKDAYS[(Number(field) + 6) % 7] : field}`;
            };
            return [
                `${input.trim()}`,
                ...fields.map((f, i) => `  ${names[i].padEnd(15)} ${explain(f, i)}`),
                "",
                `→ Runs when the ${explain(fields[0], 0)}, ${explain(fields[1], 1)}, ${explain(fields[2], 2)}, ${explain(fields[3], 3)} and ${explain(fields[4], 4)} all match.`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-tz-abbr",
        label: "Time Zone Abbreviations",
        description: "The fixed-offset abbreviation table — look one up (EST, IST, JST…) or list them all.",
        sample: "IST",
        transform: (input, opts) => {
            const t = input.trim().toUpperCase();
            if (t && opts.list !== true) {
                const hits = TZ_ABBRS.filter(([abbr]) => abbr === t);
                if (hits.length) return hits.map(([abbr, name, min]) => `${abbr} = ${name} (${fmtOffset(min)})`).join("\n");
                return `No abbreviation "${t}" in the table — switch List on to see the ${TZ_ABBRS.length} known ones.`;
            }
            return TZ_ABBRS.map(([abbr, name, min]) => `${abbr.padEnd(6)} ${fmtOffset(min).padEnd(7)} ${name}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-julian-day",
        label: "Julian Day Number ⇄ Date",
        description: "The continuous Julian Day count astronomers use ⇄ UTC date-time.",
        sample: "2460466.5",
        transform: (input) => {
            const t = input.trim();
            if (/^\d+(\.\d+)?$/.test(t)) {
                const d = fromJulianDay(Number(t));
                return `${d.toISOString()}\n(${WEEKDAYS[(d.getUTCDay() + 6) % 7]})`;
            }
            const d = parseDateSafe(t);
            if (!d) return "Paste a Julian Day Number or an ISO date-time.";
            return `${roundTo(toJulianDay(d), 3)} (JDN)`;
        },
    }),
    makeTextTool({
        id: "x-moon-phase",
        label: "Moon Phase",
        description: "The moon's phase for a date — name, illumination and days into the cycle.",
        sample: "2024-06-05",
        transform: (input) => {
            const d = parseDateSafe(input);
            if (!d) return "Paste a date.";
            const {phase, name, illum} = moonPhase(d);
            return `${name}\nillumination: ${illum}\ncycle day  : ${roundTo(phase * 29.530588853, 1)} of 29.53\nage        : ${roundTo(phase, 3)} of the cycle`;
        },
    }),
    makeTextTool({
        id: "x-easter-date",
        label: "Easter Sunday (Western)",
        description: "The Western Easter date for a year — via the Gaussian computation.",
        sample: "2024",
        transform: (input) => {
            const year = Number(input.trim());
            if (!Number.isInteger(year) || year < 1583 || year > 9999) return "Paste a year (1583+).";
            const e = easterFor(year);
            const goodFriday = new Date(e);
            goodFriday.setUTCDate(e.getUTCDate() - 2);
            const pentecost = new Date(e);
            pentecost.setUTCDate(e.getUTCDate() + 49);
            return [
                `Easter Sunday    : ${e.toISOString().slice(0, 10)} (${WEEKDAYS[(e.getUTCDay() + 6) % 7]})`,
                `Good Friday      : ${goodFriday.toISOString().slice(0, 10)}`,
                `Ascension (+39d) : ${new Date(e.getTime() + 39 * 86400000).toISOString().slice(0, 10)}`,
                `Pentecost (+49d) : ${pentecost.toISOString().slice(0, 10)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-leap-years",
        label: "Leap Year Checker / List",
        description: "Is this year a leap year? Plus every leap year in a range.",
        sample: "2024",
        transform: (input) => {
            const parts = input.trim().split(/\s+[-–]\s*|\s*-\s*/);
            if (parts.length >= 2 && Number.isInteger(Number(parts[0])) && Number.isInteger(Number(parts[1]))) {
                let a = Number(parts[0]);
                let b = Number(parts[1]);
                if (b < a) [a, b] = [b, a];
                const list: number[] = [];
                for (let y = a; y <= b; y++) if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) list.push(y);
                return `Leap years ${a}–${b}: ${list.length}\n${list.join(", ")}`;
            }
            const year = Number(input.trim());
            if (!Number.isInteger(year)) return "Paste a year (2024) or a range (2000 2030).";
            const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
            return `${year} is ${isLeap ? "a leap year (366 days)" : "NOT a leap year (365 days)"}\nnext leap: ${(() => {
                let y = year + 1;
                while (!((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) y++;
                return y;
            })()}`;
        },
    }),
    makeTextTool({
        id: "x-era",
        label: "Century / Decade Labeler",
        description: "A year → its century, decade label, generation-ish cohort and ordinal.",
        sample: "1994",
        transform: (input) => {
            const year = Number(input.trim());
            if (!Number.isInteger(year)) return "Paste a year.";
            const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][((n % 100) - 20) % 10] ?? "th"}`;
            const century = Math.floor((year - 1) / 100) + 1;
            const decade = Math.floor(year / 10) * 10;
            return [
                `century : ${ordinal(century)} (${year} ${(year - 1) % 100 + 1}% through it)`,
                `decade  : the ${String(decade).slice(-2)}s`,
                `millennium: ${Math.floor((year - 1) / 1000) + 1}`,
                `as ordinal: year ${ordinal(year)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-clock24",
        label: "12h ⇄ 24h Clock",
        description: "7:30 PM ⇄ 19:30 — parse and convert clock times both ways (seconds optional).",
        sample: "7:30 pm",
        transform: (input) => {
            const t = input.trim().toLowerCase();
            const m12 = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)$/.exec(t);
            if (m12) {
                let h = Number(m12[1]);
                const mi = Number(m12[2] ?? 0);
                const s = Number(m12[3] ?? 0);
                if (m12[4] === "pm" && h !== 12) h += 12;
                if (m12[4] === "am" && h === 12) h = 0;
                return `${pad2(h)}:${pad2(mi)}${s ? ":" + pad2(s) : ""}`;
            }
            const m24 = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
            if (m24) {
                let h = Number(m24[1]);
                const mi = Number(m24[2]);
                const s = m24[3] ? Number(m24[3]) : null;
                const ampm = h >= 12 ? "PM" : "AM";
                const h12 = h % 12 === 0 ? 12 : h % 12;
                return `${h12}:${pad2(mi)}${s !== null ? ":" + pad2(s) : ""} ${ampm}`;
            }
            return "Paste 7:30 pm or 19:30.";
        },
    }),
    makeTextTool({
        id: "x-timecard",
        label: "Weekly Hours ⇄ Decimal",
        description: "Mon-Sun hours:minutes rows → total hours in HH:MM and decimal (and per-day deltas).",
        sample: "8:30\n8:00\n9:15\n7:45\n8:00\n0:00\n0:00",
        transform: (input) => {
            const rows = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (rows.length === 0) return "Paste hours per line (8:30) — Mon..Sun by convention.";
            const toMin = (l: string): number => {
                const m = /^(\d{1,2}):(\d{2})$/.exec(l);
                return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
            };
            const mins = rows.map(toMin);
            const total = mins.reduce((a, b) => a + b, 0);
            return [
                `days    : ${mins.length}`,
                `total   : ${Math.floor(total / 60)}:${pad2(total % 60)}`,
                `decimal : ${roundTo(total / 60, 2)} hours`,
                `vs 40h  : ${total >= 2400 ? "+" : ""}${roundTo((total - 2400) / 60, 2)} hours`,
                rows.length === 7 ? `avg/day : ${roundTo(total / 7 / 60, 2)} h` : "",
            ].filter(Boolean).join("\n");
        },
    }),
    makeTextTool({
        id: "x-meeting-window",
        label: "Meeting Window Finder",
        description: "Several UTC offsets → the shared working-hours overlap (09:00-17:00 local at every place).",
        sample: "-5 0 +2",
        transform: (input) => {
            const offs = input.split(/[\s,]+/).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n !== 0 || n === 0);
            if (offs.length < 2) return "Paste UTC offsets in hours: -5 0 +2 (one per location).";
            const hourOffsets = offs.map((o) => Math.round(o * 60));
            const fits = (utcHour: number, min = 9, max = 17): boolean =>
                hourOffsets.every((m) => {
                    const local = (utcHour * 60 + m) % 1440;
                    const h = ((local / 60) % 24 + 24) % 24;
                    return h >= min && h < max;
                });
            const windows: string[] = [];
            let start: number | null = null;
            for (let h = 0; h <= 24; h++) {
                const ok = h < 24 && fits(h);
                if (ok && start === null) start = h;
                if (!ok && start !== null) {
                    windows.push(`${pad2(start)}:00 – ${pad2(h)}:00 UTC`);
                    start = null;
                }
            }
            const locals = hourOffsets.map((m) => `  ${fmtOffset(m).padEnd(7)} local 09:00 = ${pad2(((9 * 60 - m) / 60 + 24) % 24)}:00 UTC`);
            return [
                ...(windows.length ? `shared 09-17 windows:\n${windows.join("\n")}` : "no hour satisfies 09:00-17:00 local at every offset"),
                "",
                ...locals,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-date-math",
        label: "Date Math",
        description: "A date ± N days / weeks / months / years — all four results at once.",
        sample: "2024-06-15\n21",
        transform: (input) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const d = parseDateSafe(lines[0] ?? "");
            const n = Number(lines[1] ?? 0);
            if (!d || !Number.isFinite(n)) return "Line 1: a date. Line 2: N (negative allowed).";
            const shift = (ms: number) => new Date(d.getTime() + ms).toISOString().slice(0, 10);
            const addMonths = (k: number) => {
                const out = new Date(d);
                out.setUTCMonth(out.getUTCMonth() + k);
                return out.toISOString().slice(0, 10);
            };
            return [
                `days  : ${shift(n * 86400000)}`,
                `weeks : ${shift(n * 7 * 86400000)}`,
                `months: ${addMonths(n)}`,
                `years : ${addMonths(n * 12)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-date-chunks",
        label: "Date Range → Chunks",
        description: "Split a date range into N equal chunks (iso date boundaries + day counts).",
        sample: "2024-01-01 2024-12-31 4",
        transform: (input) => {
            const parts = input.trim().split(/\s+/);
            const a = parseDateSafe(parts[0] ?? "");
            const b = parseDateSafe(parts[1] ?? "");
            const n = Number(parts[2] ?? 0);
            if (!a || !b || !Number.isInteger(n) || n < 1) return "Paste: 2024-01-01 2024-12-31 4";
            const total = b.getTime() - a.getTime();
            const out: string[] = [];
            for (let i = 0; i < n; i++) {
                const lo = new Date(a.getTime() + (total * i) / n);
                const hi = new Date(a.getTime() + (total * (i + 1)) / n);
                out.push(`${lo.toISOString().slice(0, 10)} → ${hi.toISOString().slice(0, 10)}  (${Math.round((hi.getTime() - lo.getTime()) / 86400000)} days)`);
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-strftime-demo",
        label: "Date Pattern Playground",
        description: "strftime-style tokens rendered live against a date — %Y-%m-%d %H:%M:%S explained token by token.",
        sample: "2024-06-05T14:03:09Z\n%Y-%m-%d %H:%M",
        transform: (input) => {
            const lines = input.split(/\r?\n/);
            const d = parseDateSafe(lines[0] ?? "");
            const pattern = (lines[1] ?? "%Y-%m-%d %H:%M:%S").trim();
            if (!d) return "Line 1: a date-time. Line 2: the pattern (or leave for a demo).";
            const token = (t: string): string => {
                switch (t) {
                    case "Y":
                        return String(d.getUTCFullYear());
                    case "y":
                        return String(d.getUTCFullYear() % 100).padStart(2, "0");
                    case "m":
                        return pad2(d.getUTCMonth() + 1);
                    case "d":
                        return pad2(d.getUTCDate());
                    case "e":
                        return String(d.getUTCDate());
                    case "H":
                        return pad2(d.getUTCHours());
                    case "M":
                        return pad2(d.getUTCMinutes());
                    case "S":
                        return pad2(d.getUTCSeconds());
                    case "j":
                        return String(Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000)).padStart(3, "0");
                    case "p":
                        return d.getUTCHours() < 12 ? "AM" : "PM";
                    case "I":
                        return pad2(d.getUTCHours() % 12 === 0 ? 12 : d.getUTCHours() % 12);
                    case "a":
                        return WEEKDAYS[(d.getUTCDay() + 6) % 7].slice(0, 3);
                    case "A":
                        return WEEKDAYS[(d.getUTCDay() + 6) % 7];
                    case "b":
                    case "h":
                        return MONTHS[d.getUTCMonth()].slice(0, 3);
                    case "B":
                        return MONTHS[d.getUTCMonth()];
                    case "u":
                        return String((d.getUTCDay() + 6) % 7 + 1);
                    case "w":
                        return String(d.getUTCDay());
                    case "n":
                        return "\n";
                    case "t":
                        return "\t";
                    case "%":
                        return "%";
                    default:
                        return `<%${t}:unsupported>`;
                }
            };
            let render = "";
            const re = /%(.)/g;
            let m: RegExpExecArray | null;
            const legend: string[] = [];
            while ((m = re.exec(pattern)) !== null) {
                render += token(m[1]);
                if (m[1] !== "%" && m[1] !== "n" && m[1] !== "t") legend.push(`%${m[1]} → ${token(m[1]) === "\n" ? "\\n" : token(m[1])}`);
            }
            return `${render}\n\n${legend.join("\n")}`;
        },
    }),
    makeTextTool({
        id: "x-decimal-time",
        label: "Decimal / Metric Time",
        description: "A clock time in decimal time (10h/day, 100min/h, 100s/min) and metric watch style (beats).",
        sample: "14:36",
        transform: (input) => {
            const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(input.trim());
            if (!m) return "Paste a 24h time (14:36) or 12h with am/pm.";
            const total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
            const daySec = 86400;
            const decDay = total / daySec;
            const dHours = Math.floor(decDay * 10);
            const dMin = Math.floor((decDay * 10 - dHours) * 100);
            const dSec = Math.floor(((decDay * 10 - dHours) * 100 - dMin) * 100);
            const beats = Math.floor(decDay * 1000);
            return [
                `decimal time: ${dHours}h ${dMin}m ${dSec}s (10h clock)`,
                `as “hours”  : ${roundTo(decDay * 10, 4)} / 10`,
                `swatch beats: @${String(beats).padStart(3, "0")} (BMT, UTC+1 based → treat as UTC here)`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-splits",
        label: "Stopwatch Splits → Laps",
        description: "Cumulative split timestamps → per-lap deltas, ranked fastest/slowest.",
        sample: "10.2\n20.9\n30.5\n41.0",
        transform: (input) => {
            const splits = input.split(/\r?\n|,\s*/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
            if (splits.length < 2) return "Paste cumulative split times, one per line.";
            const laps: Array<{ i: number; t: number }> = [];
            for (let i = 0; i < splits.length; i++) {
                laps.push({i: i + 1, t: (splits[i] - (splits[i - 1] ?? 0))});
            }
            const sorted = [...laps].sort((a, b) => a.t - b.t);
            const fastest = sorted[0];
            const slowest = sorted[sorted.length - 1];
            return [
                ...laps.map((l) => `lap ${String(l.i).padStart(2)}: ${roundTo(l.t, 2)}s`),
                `total : ${roundTo(splits[splits.length - 1], 2)}s`,
                `avg   : ${roundTo(splits[splits.length - 1] / laps.length, 2)}s`,
                `fast  : lap ${fastest.i} (${roundTo(fastest.t, 2)}s)`,
                `slow  : lap ${slowest.i} (${roundTo(slowest.t, 2)}s)`,
            ].join("\n");
        },
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  REFERENCE — 22 additional (8 → 30)
 * ══════════════════════════════════════════════════════════════════ */

const GREEK: ReadonlyArray<readonly [string, string, string]> = [
    ["α", "alpha", "A"], ["β", "beta", "B"], ["γ", "gamma", "C"], ["δ", "delta", "D"],
    ["ε", "epsilon", "E"], ["ζ", "zeta", "F"], ["η", "eta", "H"], ["θ", "theta", "I"],
    ["ι", "iota", "J"], ["κ", "kappa", "K"], ["λ", "lambda", "L"], ["μ", "mu", "M"],
    ["ν", "nu", "N"], ["ξ", "xi", "X"], ["ο", "omicron", "O"], ["π", "pi", "P"],
    ["ρ", "rho", "R"], ["σ", "sigma", "S"], ["τ", "tau", "T"], ["υ", "upsilon", "U"],
    ["φ", "phi", "PH"], ["χ", "chi", "C"], ["ψ", "psi", "PS"], ["ω", "omega", "OM"],
];

const KEY_CODES: ReadonlyArray<readonly [string, string]> = [
    ["Space", " "], ["Enter", "↵"], ["Tab", "⇥"], ["Backspace", "⌫"], ["Shift", "⇧"],
    ["Control", "⌃"], ["Alt / Option", "⌥"], ["Meta / Cmd", "⌘"], ["Escape", "Esc"],
    ["ArrowUp / Down / Left / Right", "↑ ↓ ← →"], ["Home / End", "Home / End"],
    ["PageUp / PageDown", "PgUp / PgDn"], ["Delete", "Del"], ["Insert", "Ins"],
    ["CapsLock", "⇪"], ["F1 … F12", "function row"], ["Digit0 … Digit9", "0-9 row"],
    ["KeyA … KeyZ", "letters"], ["Comma", ","], ["Period", "."], ["Slash", "/"],
    ["Backslash", "\\"], ["Semicolon", ";"], ["Quote", "'"], ["Backquote", "`"],
    ["BracketLeft / BracketRight", "[ ]"], ["Minus", "-"], ["Equal", "="],
    ["Numpad0 … Numpad9", "keypad digits"], ["NumpadEnter", "keypad ↵"],
    ["NumpadAdd / Subtract / Multiply / Divide", "keypad + - × ÷"], ["NumpadDecimal", "keypad ."],
];

const GITMOJI: ReadonlyArray<readonly [string, string]> = [
    ["🎨", "improve structure / format of code"],
    ["⚡️", "improve performance"],
    ["🔥", "remove code or files"],
    ["🐛", "fix a bug"],
    ["🚑️", "critical hotfix"],
    ["✨", "introduce new features"],
    ["📝", "docs / documentation"],
    ["🚀", "deploy / CI stuff"],
    ["💄", "add or update UI / styles"],
    ["🎉", "begin a project"],
    ["✅", "add / update / pass tests"],
    ["🔒️", "fix security issues"],
    ["🔐", "add or update secrets"],
    ["🔖", "release / version tags"],
    ["🚨", "fix compiler / linter warnings"],
    ["🚧", "work in progress"],
    ["💚", "fix CI build"],
    ["⬇️", "add or update dependencies (down)"],
    ["⬆️", "add or update dependencies (up)"],
    ["📌", "pin dependencies to versions"],
    ["👷", "add or update CI build system"],
    ["📈", "add or update analytics / metrics"],
    ["♻️", "refactor code"],
    ["➕", "add a dependency"],
    ["➖", "remove a dependency"],
    ["🔧", "add or update configuration files"],
    ["🔨", "add or update development scripts"],
    ["🌐", "internationalization / localization"],
    ["✏️", "fix typos"],
    ["💩", "write bad code that needs to be improved"],
    ["⏪️", "revert changes"],
    ["🔀", "merge branches"],
    ["📦️", "add or update compiled files / packages"],
    ["👽️", "update code due to external API changes"],
    ["🚚", "move or rename resources"],
    ["📄", "add or update license"],
    ["💥", "introduce breaking changes"],
    ["🍱", "add or update assets"],
    ["♿️", "improve accessibility"],
    ["💡", "add or update comments in source"],
    ["🍻", "write code drunkenly"],
];

const COMMIT_TYPES: ReadonlyArray<readonly [string, string]> = [
    ["feat", "a new feature (triggers a MINOR bump)"],
    ["fix", "a bug fix (triggers a PATCH bump)"],
    ["docs", "documentation only"],
    ["style", "formatting / whitespace / semicolons — no code meaning"],
    ["refactor", "code change that neither fixes nor adds"],
    ["perf", "code change that improves performance"],
    ["test", "adding or correcting tests"],
    ["build", "changes to the build system or external deps"],
    ["ci", "CI pipeline / scripts changes"],
    ["chore", "maintenance — no production code change"],
    ["revert", "revert a previous commit"],
];

const CALLING_CODES: ReadonlyArray<readonly [string, string]> = [
    ["+1", "United States / Canada (NANP)"], ["+7", "Russia / Kazakhstan"], ["+20", "Egypt"],
    ["+27", "South Africa"], ["+30", "Greece"], ["+31", "Netherlands"], ["+32", "Belgium"],
    ["+33", "France"], ["+34", "Spain"], ["+36", "Hungary"], ["+39", "Italy"],
    ["+40", "Romania"], ["+41", "Switzerland"], ["+43", "Austria"], ["+44", "United Kingdom"],
    ["+45", "Denmark"], ["+46", "Sweden"], ["+47", "Norway"], ["+48", "Poland"],
    ["+49", "Germany"], ["+52", "Mexico"], ["+53", "Cuba"], ["+54", "Argentina"],
    ["+55", "Brazil"], ["+56", "Chile"], ["+57", "Colombia"], ["+58", "Venezuela"],
    ["+60", "Malaysia"], ["+61", "Australia"], ["+62", "Indonesia"], ["+63", "Philippines"],
    ["+64", "New Zealand"], ["+65", "Singapore"], ["+66", "Thailand"], ["+81", "Japan"],
    ["+82", "South Korea"], ["+84", "Vietnam"], ["+86", "China"], ["+90", "Türkiye"],
    ["+91", "India"], ["+92", "Pakistan"], ["+93", "Afghanistan"], ["+94", "Sri Lanka"],
    ["+98", "Iran"], ["+212", "Morocco"], ["+213", "Algeria"], ["+216", "Tunisia"],
    ["+218", "Libya"], ["+220", "Gambia"], ["+233", "Ghana"], ["+234", "Nigeria"],
    ["+254", "Kenya"], ["+255", "Tanzania"], ["+256", "Uganda"], ["+260", "Zambia"],
    ["+263", "Zimbabwe"], ["+351", "Portugal"], ["+352", "Luxembourg"], ["+353", "Ireland"],
    ["+355", "Albania"], ["+358", "Finland"], ["+359", "Bulgaria"], ["+370", "Lithuania"],
    ["+371", "Latvia"], ["+372", "Estonia"], ["+375", "Belarus"], ["+380", "Ukraine"],
    ["+385", "Croatia"], ["+386", "Slovenia"], ["+387", "Bosnia & Herzegovina"],
    ["+389", "North Macedonia"], ["+420", "Czechia"], ["+421", "Slovakia"], ["+505", "Nicaragua"],
    ["+506", "Costa Rica"], ["+507", "Panama"], ["+509", "Haiti"], ["+595", "Paraguay"],
    ["+598", "Uruguay"], ["+673", "Brunei"], ["+679", "Fiji"], ["+960", "Maldives"],
    ["+961", "Lebanon"], ["+962", "Jordan"], ["+963", "Syria"], ["+964", "Iraq"],
    ["+965", "Kuwait"], ["+966", "Saudi Arabia"], ["+967", "Yemen"], ["+971", "UAE"],
    ["+972", "Israel"], ["+973", "Bahrain"], ["+974", "Qatar"], ["+977", "Nepal"],
    ["+994", "Azerbaijan"], ["+995", "Georgia"], ["+998", "Uzbekistan"],
];

const CURRENCIES: ReadonlyArray<readonly [string, string, string]> = [
    ["USD", "US Dollar", "$"], ["EUR", "Euro", "€"], ["GBP", "Pound Sterling", "£"],
    ["JPY", "Japanese Yen", "¥"], ["CNY", "Chinese Yuan (Renminbi)", "¥"],
    ["CHF", "Swiss Franc", "Fr"], ["CAD", "Canadian Dollar", "$"], ["AUD", "Australian Dollar", "$"],
    ["NZD", "New Zealand Dollar", "$"], ["SEK", "Swedish Krona", "kr"], ["NOK", "Norwegian Krone", "kr"],
    ["DKK", "Danish Krone", "kr"], ["ISK", "Icelandic Króna", "kr"], ["PLN", "Polish Złoty", "zł"],
    ["CZK", "Czech Koruna", "Kč"], ["HUF", "Hungarian Forint", "Ft"], ["RON", "Romanian Leu", "lei"],
    ["BGN", "Bulgarian Lev", "лв"], ["TRY", "Turkish Lira", "₺"], ["RUB", "Russian Ruble", "₽"],
    ["UAH", "Ukrainian Hryvnia", "₴"], ["ILS", "Israeli New Shekel", "₪"],
    ["EGP", "Egyptian Pound", "£E"], ["ZAR", "South African Rand", "R"], ["NGN", "Nigerian Naira", "₦"],
    ["GHS", "Ghanaian Cedi", "₵"], ["KES", "Kenyan Shilling", "KSh"], ["TZS", "Tanzanian Shilling", "TSh"],
    ["INR", "Indian Rupee", "₹"], ["PKR", "Pakistani Rupee", "₨"], ["BDT", "Bangladeshi Taka", "৳"],
    ["LKR", "Sri Lankan Rupee", "Rs"], ["NPR", "Nepalese Rupee", "₨"], ["AFN", "Afghan Afghani", "؋"],
    ["KRW", "South Korean Won", "₩"], ["VND", "Vietnamese Dong", "₫"], ["THB", "Thai Baht", "฿"],
    ["MYR", "Malaysian Ringgit", "RM"], ["SGD", "Singapore Dollar", "S$"], ["IDR", "Indonesian Rupiah", "Rp"],
    ["PHP", "Philippine Peso", "₱"], ["HKD", "Hong Kong Dollar", "HK$"], ["MOP", "Macanese Pataca", "MOP$"],
    ["BRL", "Brazilian Real", "R$"], ["MXN", "Mexican Peso", "$"], ["ARS", "Argentine Peso", "$"],
    ["CLP", "Chilean Peso", "$"], ["COP", "Colombian Peso", "$"], ["PEN", "Peruvian Sol", "S/"],
    ["UYU", "Uruguayan Peso", "$U"], ["AED", "UAE Dirham", "د.إ"], ["SAR", "Saudi Riyal", "﷼"],
    ["QAR", "Qatari Riyal", "﷼"], ["KWD", "Kuwaiti Dinar", "د.ك"], ["BHD", "Bahraini Dinar", ".د.ب"],
    ["OMR", "Omani Rial", "﷼"], ["JOD", "Jordanian Dinar", "د.ا"], ["LBP", "Lebanese Pound", "ل.ل"],
    ["IQD", "Iraqi Dinar", "ع.د"], ["IRR", "Iranian Rial", "﷼"], ["MAD", "Moroccan Dirham", "د.م."],
    ["DZD", "Algerian Dinar", "د.ج"], ["TND", "Tunisian Dinar", "د.ت"], ["LYD", "Libyan Dinar", "ل.د"],
    ["ETB", "Ethiopian Birr", "Br"], ["XOF", "West African CFA Franc", "CFA"],
    ["XAF", "Central African CFA Franc", "FCFA"], ["KZT", "Kazakhstani Tenge", "₸"],
    ["UZS", "Uzbekistani Som", "лв"], ["AZN", "Azerbaijani Manat", "₼"], ["GEL", "Georgian Lari", "₾"],
    ["AMD", "Armenian Dram", "֏"], ["BYN", "Belarusian Ruble", "Br"],
];

const LANG_CODES: ReadonlyArray<readonly [string, string]> = [
    ["en", "English"], ["ar", "Arabic"], ["zh", "Chinese"], ["es", "Spanish"], ["fr", "French"],
    ["de", "German"], ["ru", "Russian"], ["ja", "Japanese"], ["ko", "Korean"], ["it", "Italian"],
    ["pt", "Portuguese"], ["hi", "Hindi"], ["bn", "Bengali"], ["ur", "Urdu"], ["tr", "Turkish"],
    ["fa", "Persian (Farsi)"], ["he", "Hebrew"], ["id", "Indonesian"], ["ms", "Malay"],
    ["th", "Thai"], ["vi", "Vietnamese"], ["pl", "Polish"], ["uk", "Ukrainian"], ["nl", "Dutch"],
    ["sv", "Swedish"], ["no", "Norwegian"], ["da", "Danish"], ["fi", "Finnish"], ["is", "Icelandic"],
    ["el", "Greek"], ["cs", "Czech"], ["sk", "Slovak"], ["hu", "Hungarian"], ["ro", "Romanian"],
    ["bg", "Bulgarian"], ["sr", "Serbian"], ["hr", "Croatian"], ["sl", "Slovenian"], ["mk", "Macedonian"],
    ["sq", "Albanian"], ["lt", "Lithuanian"], ["lv", "Latvian"], ["et", "Estonian"], ["ka", "Georgian"],
    ["hy", "Armenian"], ["az", "Azerbaijani"], ["kk", "Kazakh"], ["uz", "Uzbek"], ["ky", "Kyrgyz"],
    ["tg", "Tajik"], ["tk", "Turkmen"], ["mn", "Mongolian"], ["ne", "Nepali"], ["si", "Sinhala"],
    ["ta", "Tamil"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"], ["mr", "Marathi"],
    ["gu", "Gujarati"], ["pa", "Punjabi"], ["or", "Odia"], ["am", "Amharic"], ["sw", "Swahili"],
    ["ha", "Hausa"], ["yo", "Yoruba"], ["ig", "Igbo"], ["zu", "Zulu"], ["xh", "Xhosa"],
    ["af", "Afrikaans"], ["so", "Somali"], ["ti", "Tigrinya"], ["rw", "Kinyarwanda"], ["mg", "Malagasy"],
    ["my", "Burmese"], ["km", "Khmer"], ["lo", "Lao"], ["tl", "Filipino (Tagalog)"], ["eu", "Basque"],
    ["ca", "Catalan"], ["gl", "Galician"], ["ga", "Irish"], ["cy", "Welsh"], ["gd", "Scottish Gaelic"],
    ["br", "Breton"], ["lb", "Luxembourgish"], ["mt", "Maltese"], ["fo", "Faroese"], ["yi", "Yiddish"],
    ["la", "Latin"], ["eo", "Esperanto"], ["ku", "Kurdish"], ["ps", "Pashto"], ["sd", "Sindhi"],
];

const HTTP_VERBS: ReadonlyArray<readonly [string, string, string]> = [
    ["GET", "read", "safe + idempotent — no body expected, cacheable"],
    ["HEAD", "read metadata", "like GET without the body — existence / size checks"],
    ["POST", "create / process", "neither safe nor idempotent — new resources / actions"],
    ["PUT", "replace", "idempotent — the whole target state is sent"],
    ["PATCH", "partial update", "not required to be idempotent — send a diff"],
    ["DELETE", "remove", "idempotent — deleting again is the same state"],
    ["OPTIONS", "discover capabilities", "safe + idempotent — CORS preflights use it"],
    ["TRACE", "echo the request", "diagnostic — disabled on most servers"],
    ["CONNECT", "tunnel", "proxy / TLS upgrade — not for normal resources"],
];

const COMMON_HEADERS: ReadonlyArray<readonly [string, string, string]> = [
    ["Host", "request", "the origin server's host + port"],
    ["User-Agent", "request", "the client software signature"],
    ["Accept", "request", "preferred media types (MIME weights)"],
    ["Accept-Encoding", "request", "acceptable compression (gzip, br…)"],
    ["Accept-Language", "request", "preferred natural languages"],
    ["Authorization", "request", "credentials — Bearer / Basic / scheme tokens"],
    ["Cookie", "request", "the stored cookie pairs"],
    ["Content-Type", "both", "the body's media type + charset"],
    ["Content-Length", "both", "the body size in bytes"],
    ["Content-Encoding", "response", "how the body is compressed"],
    ["Cache-Control", "both", "caching directives (max-age, no-store…)"],
    ["ETag", "response", "the version fingerprint for conditional requests"],
    ["If-None-Match", "request", "revalidate with an earlier ETag"],
    ["Last-Modified", "response", "the origin's last change timestamp"],
    ["If-Modified-Since", "request", "revalidate with a timestamp"],
    ["Location", "response", "the redirect / created-resource target"],
    ["Set-Cookie", "response", "server-side cookie assignment"],
    ["Strict-Transport-Security", "response", "HTTPS-only policy (HSTS)"],
    ["Access-Control-Allow-Origin", "response", "which origins may read the response (CORS)"],
    ["Retry-After", "response", "how long the client should wait"],
    ["X-Forwarded-For", "request", "the original client IP behind proxies"],
    ["Transfer-Encoding", "both", "chunked streaming framing"],
    ["Referer", "request", "the page that linked here (historical spelling)"],
    ["Origin", "request", "the scheme + host of the sender"],
];

const SQL_KEYWORDS = (
    "ADD ALL ALTER AND ANY AS ASC BEGIN BETWEEN BY CASE CAST CHECK COLLATE COLUMN COMMIT " +
    "CONSTRAINT CREATE CROSS CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER " +
    "DEFAULT DELETE DESC DISTINCT DROP ELSE END ESCAPE EXCEPT EXISTS FOREIGN FROM FULL " +
    "GROUP HAVING IF IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT LIKE LIMIT " +
    "NATURAL NOT NULL OFFSET ON OR ORDER OUTER PRIMARY REFERENCES ROLLBACK SELECT SET " +
    "SOME TABLE THEN TRANSACTION UNION UNIQUE UPDATE USER VALUES VIEW WHEN WHERE WITH"
).split(" ");

const PY_BUILTINS = (
    "abs aiter all anext any bin bool bytearray bytes callable chr classmethod complex " +
    "delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals " +
    "hasattr hash help hex id input int isinstance issubclass iter len list locals map max " +
    "memoryview min next object oct open ord pow print property range repr reversed round set " +
    "setattr slice sorted staticmethod str sum super tuple type vars zip"
).split(" ");

const PY_MAGIC: ReadonlyArray<readonly [string, string]> = [
    ["__name__", "module name (\"__main__\" when run directly)"],
    ["__file__", "module's file path"],
    ["__doc__", "the module/class docstring"],
    ["__init__", "constructor"],
    ["__new__", "instance creation (classmethod)"],
    ["__del__", "finalizer (not a reliable destructor)"],
    ["__repr__", "the unambiguous developer repr"],
    ["__str__", "the readable str() form"],
    ["__len__", "len() support"],
    ["__eq__ / __ne__ / __lt__ / __le__ / __gt__ / __ge__", "comparisons"],
    ["__hash__", "hash() (must agree with __eq__)"],
    ["__bool__", "truthiness"],
    ["__call__", "making instances callable"],
    ["__getattr__ / __getattribute__ / __setattr__", "attribute interception"],
    ["__getitem__ / __setitem__ / __delitem__", "subscript support"],
    ["__iter__ / __next__", "iteration protocol"],
    ["__enter__ / __exit__", "with-statement context"],
    ["__add__ / __sub__ / __mul__ / __truediv__", "arithmetic operators"],
    ["__contains__", "the `in` operator"],
    ["__class__ / __bases__ / __mro__", "type introspection"],
    ["__all__", "module's public export list"],
    ["__version__", "convention: the package version"],
    ["__main__", "the \"run directly\" module name"],
];

const POSIX_SIGNALS: ReadonlyArray<readonly [number, string, string]> = [
    [1, "SIGHUP", "terminal line hung up (also: daemons reload)"],
    [2, "SIGINT", "interrupt (Ctrl+C)"],
    [3, "SIGQUIT", "quit + core dump (Ctrl+\\)"],
    [4, "SIGILL", "illegal instruction"],
    [5, "SIGTRAP", "trace/breakpoint trap"],
    [6, "SIGABRT", "abort (assert, raise in C)"],
    [7, "SIGBUS", "bus error (bad alignment/addressing)"],
    [8, "SIGFPE", "floating-point exception (also int div by 0)"],
    [9, "SIGKILL", "kill — cannot be caught or ignored"],
    [10, "SIGUSR1", "user-defined 1"],
    [11, "SIGSEGV", "invalid memory reference"],
    [12, "SIGUSR2", "user-defined 2"],
    [13, "SIGPIPE", "write to a pipe with no reader"],
    [14, "SIGALRM", "timer expired (alarm)"],
    [15, "SIGTERM", "polite termination (default kill)"],
    [16, "SIGSTKFLT", "stack fault (x86 rarely used)"],
    [17, "SIGCHLD", "child stopped or exited"],
    [18, "SIGCONT", "continue if stopped"],
    [19, "SIGSTOP", "stop — cannot be caught"],
    [20, "SIGTSTP", "keyboard stop (Ctrl+Z)"],
    [21, "SIGTTIN", "background read from tty"],
    [22, "SIGTTOU", "background write to tty"],
    [23, "SIGURG", "urgent socket condition"],
    [24, "SIGXCPU", "CPU time limit exceeded"],
    [25, "SIGXFSZ", "file size limit exceeded"],
    [26, "SIGVTALRM", "virtual timer expired"],
    [27, "SIGPROF", "profiling timer expired"],
    [28, "SIGWINCH", "window resize"],
    [29, "SIGIO", "I/O now possible (async)"],
    [30, "SIGPWR", "power failure (battery)"],
    [31, "SIGSYS", "bad syscall argument"],
];

const MAGIC_BYTES: ReadonlyArray<readonly [string, string]> = [
    ["89 50 4E 47 0D 0A 1A 0A", "PNG image"],
    ["FF D8 FF", "JPEG image"],
    ["47 49 46 38 (37 61 | 39 61)", "GIF87a / GIF89a"],
    ["42 4D", "Windows BMP"],
    ["25 50 44 46 2D", "PDF (%PDF-)"],
    ["50 4B 03 04", "ZIP (also .docx/.xlsx/.jar/.apk)"],
    ["1F 8B", "GZIP"],
    ["FD 37 7A 58 5A 00", "XZ"],
    ["37 7A BC AF 27 1C", "7-Zip"],
    ["52 61 72 21 1A 07", "RAR"],
    ["7F 45 4C 46", "ELF executable/library"],
    ["4D 5A", "DOS/Windows executable (MZ)"],
    ["CA FE BA BE", "Java class file"],
    ["ED AB EE DB", "RPM package"],
    ["D0 CF 11 E0 A1 B1 1A E1", "legacy MS Office (CFB)"],
    ["25 21 50 53", "PostScript (%!PS)"],
    ["00 61 73 6D", "WebAssembly module"],
    ["53 51 4C 69 74 65 20 66 6F 72 6D 61 74", "SQLite database"],
    ["53 50 00", "IBM SPSS data"],
    ["4C 5A", "LZMA (alone)"],
    ["75 73 74 61 72", "tar archive (ustar at offset 257)"],
    ["4D 53 43 46", "Microsoft Cabinet"],
];

const ASCII_CTRL: ReadonlyArray<readonly [number, string, string]> = [
    [0, "NUL", "end of string / padding"],
    [1, "SOH", "start of heading"],
    [2, "STX", "start of text"],
    [3, "ETX", "end of text (Ctrl+C echo in terminals)"],
    [4, "EOT", "end of transmission"],
    [5, "ENQ", "enquiry (trigger a reply)"],
    [6, "ACK", "acknowledge"],
    [7, "BEL", "bell / beep"],
    [8, "BS", "backspace"],
    [9, "HT", "horizontal tab"],
    [10, "LF", "line feed (\\n)"],
    [11, "VT", "vertical tab"],
    [12, "FF", "form feed (page break)"],
    [13, "CR", "carriage return (\\r)"],
    [14, "SO", "shift out (alt charset)"],
    [15, "SI", "shift in"],
    [16, "DLE", "data link escape"],
    [17, "DC1", "device control 1 (XON)"],
    [18, "DC2", "device control 2"],
    [19, "DC3", "device control 3 (XOFF)"],
    [20, "DC4", "device control 4"],
    [21, "NAK", "negative acknowledge"],
    [22, "SYN", "synchronous idle"],
    [23, "ETB", "end of transmission block"],
    [24, "CAN", "cancel"],
    [25, "EM", "end of medium"],
    [26, "SUB", "substitute (Ctrl+Z EOF on DOS)"],
    [27, "ESC", "escape"],
    [28, "FS", "file separator"],
    [29, "GS", "group separator"],
    [30, "RS", "record separator"],
    [31, "US", "unit separator"],
    [127, "DEL", "delete / rubout"],
];

const HTML_ENTITIES: ReadonlyArray<readonly [string, string]> = [
    ["&amp;", "&"], ["&lt;", "<"], ["&gt;", ">"], ["&quot;", '"'], ["&apos;", "'"],
    ["&nbsp;", "non-breaking space (U+00A0)"], ["&copy;", "©"], ["&reg;", "®"],
    ["&trade;", "™"], ["&hellip;", "…"], ["&mdash;", "—"], ["&ndash;", "–"],
    ["&lsquo;", "‘"], ["&rsquo;", "’"], ["&ldquo;", "“"], ["&rdquo;", "”"],
    ["&bull;", "•"], ["&middot;", "·"], ["&deg;", "°"], ["&plusmn;", "±"],
    ["&times;", "×"], ["&divide;", "÷"], ["&micro;", "µ"], ["&para;", "¶"],
    ["&sect;", "§"], ["&dagger;", "†"], ["&Dagger;", "‡"], ["&prime;", "′"],
    ["&euro;", "€"], ["&pound;", "£"], ["&yen;", "¥"], ["&cent;", "¢"],
    ["&aacute;", "á"], ["&eacute;", "é"], ["&iacute;", "í"], ["&oacute;", "ó"], ["&uacute;", "ú"],
    ["&ntilde;", "ñ"], ["&ccedil;", "ç"], ["&agrave;", "à"], ["&szlig;", "ß"],
    ["&alpha;", "α"], ["&beta;", "β"], ["&gamma;", "γ"], ["&pi;", "π"], ["&infin;", "∞"],
    ["&ne;", "≠"], ["&le;", "≤"], ["&ge;", "≥"], ["&sum;", "∑"], ["&radic;", "√"],
];

const REGEX_CHEATS: ReadonlyArray<readonly [string, string]> = [
    [".", "any character (except line breaks, unless the s flag)"],
    ["\\d \\D", "digit / non-digit"],
    ["\\w \\W", "word char [A-Za-z0-9_] / its negation"],
    ["\\s \\S", "whitespace / non-whitespace"],
    ["\\b \\B", "word boundary / not a boundary"],
    ["[abc] [^abc]", "character class / negated class"],
    ["[a-z0-9_]", "a range class"],
    ["^ $", "start / end (of line with m flag)"],
    ["( )", "capture group"],
    ["(?: )", "non-capturing group"],
    ["(?<name> )", "named group"],
    ["(?= ) (?! )", "lookahead / negative lookahead"],
    ["(?<= ) (?<! )", "lookbehind / negative lookbehind"],
    ["* + ?", "0+ / 1+ / 0-or-1 repetitions"],
    ["{2} {2,} {2,5}", "exact / at-least / bounded repetitions"],
    ["|", "alternation"],
    ["\\1 $1", "backreference / replacement capture"],
    ["a*? a+?", "lazy (non-greedy) repetition"],
    ["(?i) / i flag", "case-insensitive"],
    ["x flag", "free-spacing mode (JS: verbose via build)"],
];

const PRINTF_TOKENS: ReadonlyArray<readonly [string, string]> = [
    ["%d / %i", "signed integer"],
    ["%u", "unsigned integer (C)"],
    ["%f", "float (fixed 6 decimals default)"],
    ["%e / %E", "scientific notation"],
    ["%g / %G", "shortest of %f / %e"],
    ["%s", "string"],
    ["%c", "single character"],
    ["%x / %X", "hex integer (lower / upper)"],
    ["%o", "octal integer"],
    ["%p", "pointer address (C)"],
    ["%%", "a literal percent sign"],
    ["%5d", "width 5, right-aligned"],
    ["%-5d", "width 5, left-aligned"],
    ["%.2f", "precision 2 after the dot"],
    ["%08.3f", "zero-padded width 8, precision 3"],
    ["%+d", "always show the sign"],
    ["% d", "space for positive numbers"],
    ["%*d", "width from an argument (C)"],
    ["%hhd / %hd / %ld / %lld", "char / short / long / long-long size"],
    ["%zu", "size_t"],
];

export const EXTRA_REFERENCE_TOOLS = [
    makeTextTool({
        id: "x-codepoint-table",
        label: "Code Point Table",
        description: "Every character of the input with its code point, UTF-8 bytes and HTML / JS escapes.",
        sample: "Aé",
        transform: (input) => {
            return [...input]
                .map((ch) => {
                    const cp = ch.codePointAt(0)!;
                    const bytes = [...utf8ToBytes(ch)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
                    return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}  ${bytes.padEnd(11)}  &#${cp};  \\u${cp.toString(16).padStart(4, "0")}  ${cp === 0x20 ? "␠" : ch}`;
                })
                .join("\n");
        },
    }),
    makeTextTool({
        id: "x-ascii-table",
        label: "ASCII Table (printable)",
        description: "The 95 printable ASCII characters — dec / hex / oct / char in one grid.",
        transform: () => {
            const rows: string[] = ["dec  hex  oct  chr", "─".repeat(20)];
            for (let c = 32; c <= 126; c++) {
                rows.push(`${String(c).padStart(3)}  0x${c.toString(16).toUpperCase().padStart(2, "0")}  ${c.toString(8).padStart(3)}  ${c === 32 ? "␠" : String.fromCharCode(c)}`);
            }
            return rows.join("\n");
        },
    }),
    makeTextTool({
        id: "x-ascii-control",
        label: "ASCII Control Codes (C0)",
        description: "The 33 control characters — mnemonics and what they actually do.",
        transform: () => ASCII_CTRL.map(([n, name, what]) => `${String(n).padStart(3)}  ${name.padEnd(4)} ${what}`).join("\n"),
    }),
    makeTextTool({
        id: "x-key-codes",
        label: "Keyboard event.code Table",
        description: "DOM KeyboardEvent.code names ⇄ the keys they represent.",
        transform: () => KEY_CODES.map(([code, key]) => `${code.padEnd(36)} ${key}`).join("\n"),
    }),
    makeTextTool({
        id: "x-greek",
        label: "Greek Alphabet",
        description: "Lower + upper Greek letters with their Latin equivalents and names.",
        transform: () =>
            GREEK.map(([lower, name, latin]) => {
                const upper = lower.toUpperCase();
                return `${lower} ${upper}  ${name.padEnd(8)} = ${latin}`;
            }).join("\n"),
    }),
    makeTextTool({
        id: "x-gitmoji",
        label: "Gitmoji List",
        description: "The gitmoji convention — emoji, and the commit meaning behind each.",
        transform: () => GITMOJI.map(([e, what]) => `${e}  ${what}`).join("\n"),
    }),
    makeTextTool({
        id: "x-commit-conventions",
        label: "Conventional Commit Types",
        description: "The canonical type list with meanings — plus a one-shot validator for your header.",
        sample: "feat: add login",
        transform: (input) => {
            const table = COMMIT_TYPES.map(([t, d]) => `${t.padEnd(9)} ${d}`).join("\n");
            const header = input.trim();
            if (!header || header.split("\n").length > 1) return table;
            const m = /^(\w+)(?:\(([\w./-]+)\))?!?:\s*(.*)$/.exec(header);
            if (!m) return `${table}\n\n“${header}” — ✗ not type(scope)?: subject`;
            const ok = COMMIT_TYPES.some(([t]) => t === m[1]);
            return `${table}\n\n“${header}” — ${ok ? "✓ valid type" : `✗ unknown type “${m[1]}”`}`;
        },
    }),
    makeTextTool({
        id: "x-calling-codes",
        label: "Country Calling Codes",
        description: "ITU telephone calling codes — look one up or browse the table.",
        sample: "+20",
        transform: (input, opts) => {
            const t = input.trim();
            if (t && opts.list !== true) {
                const hits = CALLING_CODES.filter(([c]) => c === t);
                if (hits.length) return hits.map(([c, country]) => `${c} — ${country}`).join("\n");
                return `No code ${t} in the table — switch List on to browse all ${CALLING_CODES.length}.`;
            }
            return CALLING_CODES.map(([c, country]) => `${c.padEnd(6)} ${country}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-currency-codes",
        label: "ISO-4217 Currency Codes",
        description: "Currency codes with names and symbols — lookup or full table.",
        sample: "EGP",
        transform: (input, opts) => {
            const t = input.trim().toUpperCase();
            if (t && opts.list !== true) {
                const hits = CURRENCIES.filter(([c]) => c === t);
                if (hits.length) return hits.map(([c, name, sym]) => `${c} — ${name} (${sym})`).join("\n");
                return `No currency “${t}” in the table (switch List on for all ${CURRENCIES.length}).`;
            }
            return CURRENCIES.map(([c, name, sym]) => `${c.padEnd(4)} ${name.padEnd(30)} ${sym}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-language-codes",
        label: "ISO-639-1 Language Codes",
        description: "Two-letter language codes ⇄ language names — lookup or browse.",
        sample: "ar",
        transform: (input, opts) => {
            const t = input.trim().toLowerCase();
            if (t && opts.list !== true) {
                const byCode = LANG_CODES.filter(([c]) => c === t);
                if (byCode.length) return byCode.map(([c, name]) => `${c} — ${name}`).join("\n");
                const byName = LANG_CODES.filter(([, name]) => name.toLowerCase().includes(t));
                if (byName.length) return byName.map(([c, name]) => `${c} — ${name}`).join("\n");
                return `Nothing matches “${t}” — switch List on for all ${LANG_CODES.length}.`;
            }
            return LANG_CODES.map(([c, name]) => `${c.padEnd(4)} ${name}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-locale-id",
        label: "Unicode Locale ID ⇄ Parts",
        description: "Parse en-US-POSIX / ar-EG-u-nu-latn style locale ids (and reassemble one).",
        sample: "ar-EG-u-nu-latn",
        transform: (input) => {
            const t = input.trim();
            if (t.includes("=")) {
                const parts = parsePairs(t.replace(/\n/g, ";"));
                const obj: Record<string, string> = {};
                for (const [k, v] of parts) obj[k] = v;
                const lang = obj.language || "en";
                const region = obj.region ? `-${obj.region}` : "";
                const script = obj.script ? `-${obj.script}` : "";
                const ext = obj.extension ? `-u-${obj.extension}` : "";
                const variant = obj.variant ? `-${obj.variant}` : "";
                return `${lang}${script}${region}${variant}${ext}`;
            }
            const m = /^([a-z]{2,3})(?:[-_]([A-Za-z]{4}))?(?:[-_]([A-Z]{2}|\d{3}))?(?:-([A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))?(?:-u-((?:[\w-]+(?:-\w+)?)?))?$/i.exec(t.replace(/_/g, "-"));
            if (!m) return "Paste a locale like en-US, ar-EG-u-nu-latn, or key=value lines.";
            const [language, script, region, variant, extension] = m.slice(1);
            return [
                `language : ${language?.toLowerCase() ?? "—"}`,
                `script   : ${script ?? "—"}`,
                `region   : ${region?.toUpperCase() ?? "—"}`,
                `variant  : ${variant ?? "—"}`,
                `extension: -u-${extension ?? "—"}`,
                "",
                `Intl check: ${(() => {
                    try {
                        new Intl.Locale(t);
                        return "valid Intl.Locale";
                    } catch {
                        return "not accepted by Intl.Locale";
                    }
                })()}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-html-entities-ref",
        label: "Named HTML Entities",
        description: "The common named entities table — what they render and when to use them.",
        transform: () => HTML_ENTITIES.map(([e, meaning]) => `${e.padEnd(10)} → ${meaning}`).join("\n"),
    }),
    makeTextTool({
        id: "x-css-units",
        label: "CSS Length Units (px ⇄ rem ⇄ em ⇄ %)",
        description: "Convert one length across px / rem / em / pt / % at your root font size and context.",
        sample: "16\n24px",
        transform: (input, opts) => {
            const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const root = Number(opts.root || 16);
            const t = lines[lines.length - 1] ?? "";
            const m = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|pt)$/i.exec(t);
            if (!m) return `Paste a length like 24px (last line). Root: ${root}px.`;
            const v = Number(m[1]);
            const unit = m[2].toLowerCase();
            const px = unit === "px" ? v : unit === "rem" ? v * root : unit === "em" ? v * root : unit === "pt" ? (v * 96) / 72 : (v / 100) * root;
            return [
                `px  : ${roundTo(px, 3)}`,
                `rem : ${roundTo(px / root, 4)}  (root ${root}px)`,
                `em  : ${roundTo(px / root, 4)}  (assumes 1em = root)`,
                `pt  : ${roundTo((px * 72) / 96, 3)}  (CSS 96dpi)`,
                `%   : ${roundTo((px / root) * 100, 3)}  (of the root)`,
                `ch  : ≈ ${roundTo(px / (root * 0.5), 2)}  (1ch ≈ “0” width)`,
            ].join("\n");
        },
        options: [{
            key: "root",
            label: "Root font size",
            kind: "select",
            choices: [["14", "14px"], ["16", "16px"], ["18", "18px"], ["20", "20px"]],
            default: "16"
        }],
    }),
    makeTextTool({
        id: "x-http-verbs",
        label: "HTTP Verbs Reference",
        description: "The request methods with their safety / idempotency semantics.",
        transform: () => HTTP_VERBS.map(([v, use, semantics]) => `${v.padEnd(9)} ${use.padEnd(20)} ${semantics}`).join("\n"),
    }),
    makeTextTool({
        id: "x-http-headers-ref",
        label: "Common HTTP Headers",
        description: "Request/response headers with what they do — lookup or the full list.",
        sample: "etag",
        transform: (input, opts) => {
            const t = input.trim().toLowerCase();
            if (t && opts.list !== true) {
                const hits = COMMON_HEADERS.filter(([h]) => h.toLowerCase().includes(t));
                if (hits.length) return hits.map(([h, dir, what]) => `${h.padEnd(28)} ${dir.padEnd(9)} ${what}`).join("\n");
                return `No header matches “${t}” — switch List on.`;
            }
            return COMMON_HEADERS.map(([h, dir, what]) => `${h.padEnd(28)} ${dir.padEnd(9)} ${what}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-rest-planner",
        label: "REST Route Planner",
        description: "A resource list → the conventional CRUD route table (verbs + paths).",
        sample: "users\nposts\ncomments",
        transform: (input) => {
            const resources = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.toLowerCase());
            if (resources.length === 0) return "Paste resource names (users, posts…), one per line.";
            const row = (verb: string, path: string, what: string) => `${verb.padEnd(7)} ${path.padEnd(34)} ${what}`;
            const out: string[] = [];
            for (const r of resources) {
                const single = r.replace(/s$/, "");
                out.push(`── ${r}`);
                out.push(row("GET", `/${r}`, "list"));
                out.push(row("GET", `/${r}/:${single}Id`, "read one"));
                out.push(row("POST", `/${r}`, "create"));
                out.push(row("PUT", `/${r}/:${single}Id`, "replace"));
                out.push(row("PATCH", `/${r}/:${single}Id`, "partial update"));
                out.push(row("DELETE", `/${r}/:${single}Id`, "remove"));
            }
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-sql-keywords",
        label: "SQL Reserved Words",
        description: "The core SQL reserved keyword list — check a name before you use it as an identifier.",
        sample: "user",
        transform: (input, opts) => {
            const t = input.trim().toLowerCase();
            if (t && opts.list !== true) {
                if (SQL_KEYWORDS.includes(t.toUpperCase())) return `“${t}” IS a reserved word — quote it ("${t}") or pick another name.`;
                return `“${t}” is not in the core reserved list.`;
            }
            return `${SQL_KEYWORDS.length} core keywords:\n${SQL_KEYWORDS.join(" ")}`;
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-python-builtins",
        label: "Python Builtins",
        description: "The builtin functions list — check a name before shadowing it with a variable.",
        sample: "list",
        transform: (input, opts) => {
            const t = input.trim().toLowerCase();
            if (t && opts.list !== true) {
                if (PY_BUILTINS.includes(t)) return `“${t}” IS a builtin — shadowing it hides the original (list = [1] does exactly that).`;
                return `“${t}” is not a builtin.`;
            }
            return `${PY_BUILTINS.length} builtins:\n${PY_BUILTINS.join(" ")}`;
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-python-magic",
        label: "Python Dunder Reference",
        description: "The __magic__ attributes every Python programmer should recognize.",
        transform: () => PY_MAGIC.map(([name, what]) => `${name.padEnd(46)} ${what}`).join("\n"),
    }),
    makeTextTool({
        id: "x-posix-signals",
        label: "POSIX Signals Table",
        description: "Signals 1-31 with names and meanings — lookup or the whole table.",
        sample: "9",
        transform: (input, opts) => {
            const t = input.trim();
            if (t && opts.list !== true) {
                const n = Number(t);
                const hits = POSIX_SIGNALS.filter(([num]) => (Number.isInteger(n) ? num === n : false));
                const byName = POSIX_SIGNALS.filter(([, name]) => name.toUpperCase() === t.toUpperCase());
                const found = hits.length ? hits : byName;
                if (found.length) return found.map(([num, name, what]) => `${num}\t${name}\t${what}`).join("\n");
                return "Paste a signal number (1-31) or name (SIGTERM).";
            }
            return POSIX_SIGNALS.map(([num, name, what]) => `${String(num).padStart(2)}  ${name.padEnd(10)} ${what}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-exit-codes",
        label: "Exit Code Conventions",
        description: "The sysexits.h codes and the common CLI conventions (0 = success, 1-2 = usage…).",
        transform: () => {
            const rows: ReadonlyArray<readonly [string, string]> = [
                ["0", "success"],
                ["1", "generic failure (the catch-all)"],
                ["2", "misuse of a shell builtin / usage error"],
                ["126", "command found but not executable"],
                ["127", "command not found"],
                ["128+N", "terminated by signal N (128+9 for SIGKILL = 137)"],
                ["64", "EX_USAGE — command used incorrectly"],
                ["65", "EX_DATAERR — input data incorrect"],
                ["66", "EX_NOINPUT — input file absent"],
                ["67", "EX_NOUSER — addressee unknown"],
                ["68", "EX_NOHOST — host name unknown"],
                ["69", "EX_UNAVAILABLE — service unavailable"],
                ["70", "EX_SOFTWARE — internal software error"],
                ["71", "EX_OSERR — OS error (fork failed…)"],
                ["72", "EX_OSFILE — critical OS file missing"],
                ["73", "EX_CANTCREAT — output file cannot be created"],
                ["74", "EX_IOERR — input/output error"],
                ["75", "EX_TEMPFAIL — temporary failure (retry later)"],
                ["76", "EX_PROTOCOL — protocol exchange illegal"],
                ["77", "EX_NOPERM — permission denied"],
                ["78", "EX_CONFIG — configuration error"],
                ["130", "terminated by SIGINT (Ctrl+C = 128+2)"],
            ];
            return rows.map(([c, what]) => `${c.padEnd(9)} ${what}`).join("\n");
        },
    }),
    makeTextTool({
        id: "x-magic-bytes",
        label: "File Magic Bytes",
        description: "The famous file signatures — the hex prefix that identifies a format.",
        sample: "50 4B",
        transform: (input, opts) => {
            const t = input.trim().toUpperCase().replace(/[^0-9A-F ]/g, "");
            if (t && opts.list !== true) {
                const hits = MAGIC_BYTES.filter(([hex]) => hex.toUpperCase().includes(t.replace(/\s+/g, " ")));
                if (hits.length) return hits.map(([hex, what]) => `${hex.padEnd(28)} ${what}`).join("\n");
                return `No known signature matches ${t} — switch List on for the table.`;
            }
            return MAGIC_BYTES.map(([hex, what]) => `${hex.padEnd(28)} ${what}`).join("\n");
        },
        options: [{key: "list", label: "List all", kind: "toggle", default: false}],
    }),
    makeTextTool({
        id: "x-regex-cheats",
        label: "Regex Cheat Sheet",
        description: "The token reference — every construct with one line of what it does.",
        transform: () => REGEX_CHEATS.map(([t, what]) => `${t.padEnd(20)} ${what}`).join("\n"),
    }),
    makeTextTool({
        id: "x-printf-ref",
        label: "printf Format Tokens",
        description: "The printf/scanf format specifiers — widths, precisions and length modifiers.",
        transform: () => PRINTF_TOKENS.map(([t, what]) => `${t.padEnd(20)} ${what}`).join("\n"),
    }),
];

/* ══════════════════════════════════════════════════════════════════
 *  The five small shortfalls: Data & Tables (+1 → 30),
 *  Formatters (+3 → 30), Security (+1 → 30), Validators (+4 → 30),
 *  Text Analysis (+3 → 30)
 * ══════════════════════════════════════════════════════════════════ */

export const EXTRA_DATA_TOOLS = [
    makeTextTool({
        id: "x-csv-stats",
        label: "CSV Column Stats",
        description: "Every column with its inferred type, min/max, distinct count and empty count — the instant data profile.",
        sample: "name,score\nalice,9\nbob,11\n,4",
        transform: (input) => {
            const lines = input.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
            if (lines.length < 2) return "Paste a header row + data rows.";
            const header = splitCsvLine(lines[0]);
            const rows = lines.slice(1).map((l) => splitCsvLine(l));
            const out: string[] = ["column          type      min/max (numeric)   distinct  empty"];
            header.forEach((h, i) => {
                const cells = rows.map((r) => (r[i] ?? "").trim());
                const empty = cells.filter((c) => c === "").length;
                const distinct = new Set(cells.filter(Boolean)).size;
                const nums = cells.filter((c) => /^-?\d+(\.\d+)?$/.test(c)).map(Number);
                const type = empty + nums.length === cells.length && nums.length > 0 ? (nums.every((n) => Number.isInteger(n)) ? "integer" : "number") : cells.every((c) => /^(true|false)$/i.test(c)) && cells.length > 0 ? "boolean" : "text";
                const range = nums.length ? `${Math.min(...nums)} … ${Math.max(...nums)}` : "—";
                out.push(`${(h || `col_${i + 1}`).padEnd(16)}${type.padEnd(10)}${range.padEnd(21)}${String(distinct).padEnd(10)}${empty}`);
            });
            out.push(`\nrows: ${rows.length}`);
            return out.join("\n");
        },
    }),
    makeTextTool({
        id: "x-md-table-csv",
        label: "Markdown Table → CSV",
        description: "A GitHub-flavored pipe table → clean CSV (alignment row dropped, cells unescaped).",
        sample: "| a | b |\n|---|---|\n| 1 | 2 |",
        transform: (input) => {
            const rows = input
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.startsWith("|"))
                .map((l) =>
                    l
                        .replace(/^\||\|$/g, "")
                        .split("|")
                        .map((c) => c.trim().replace(/\\\|/g, "|").replace(/^`|`$/g, ""))
                );
            if (rows.length === 0) return "Paste a markdown pipe table.";
            const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
            return body.map((r) => r.map((c) => (c.includes(",") ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
        },
    }),
];

export const EXTRA_FORMAT_TOOLS = [
    makeTextTool({
        id: "x-sql-case",
        label: "SQL Keyword Casing",
        description: "Upper- or lower-cases the reserved keywords in a query while leaving identifiers and strings untouched.",
        sample: "select name, total from orders where total > 5;",
        transform: (input, opts) => {
            const upper = String(opts.case || "upper") === "upper";
            const re = new RegExp(`\\b(${SQL_KEYWORDS.join("|")})\\b`, "gi");
            return input.replace(re, (kw) => (upper ? kw.toUpperCase() : kw.toLowerCase()));
        },
        options: [{
            key: "case",
            label: "Direction",
            kind: "select",
            choices: [["upper", "UPPERCASE keywords"], ["lower", "lowercase keywords"]],
            default: "upper"
        }],
        note: "Uses the core reserved-word list from the Reference tab — string literals pass through untouched.",
    }),
    makeTextTool({
        id: "x-fixed-width",
        label: "Fixed-Width Column Layout",
        description: "Delimited rows → a padded fixed-width table (every column aligned to its widest cell).",
        sample: "name,score\nalice,9.25\nbob,101",
        transform: (input, opts) => {
            const delim = String(opts.delim || "comma") === "tab" ? "\t" : ",";
            const rows = input
                .split(/\r?\n/)
                .filter((l) => l.trim())
                .map((l) => splitCsvLine(l, delim).map((c) => c.trim()));
            if (rows.length === 0) return "—";
            const width = Math.max(...rows.map((r) => r.length));
            const colW: number[] = [];
            for (let c = 0; c < width; c++) colW.push(Math.max(...rows.map((r) => (r[c] ?? "").length), 3));
            return rows.map((r) => r.map((c, i) => c.padEnd(colW[i])).join("  ")).join("\n");
        },
        options: [{
            key: "delim",
            label: "Delimiter",
            kind: "select",
            choices: [["comma", "Comma"], ["tab", "Tab"]],
            default: "comma"
        }],
    }),
    makeTextTool({
        id: "x-numsep",
        label: "Thousands Separators ⇄ Bare",
        description: "1,234,567 ⇄ 1234567 — add or remove digit grouping in every number in the text.",
        sample: "Total 1234567 and 0.9876543",
        transform: (input, opts) => {
            const mode = String(opts.mode || "add");
            if (mode === "remove") return input.replace(/(\d),(?=\d{3}\b)/g, "$1");
            return input.replace(/\b\d{4,}\b/g, (n) => Number(n).toLocaleString("en-US"));
        },
        options: [{
            key: "mode",
            label: "Mode",
            kind: "select",
            choices: [["add", "Add separators"], ["remove", "Remove separators"]],
            default: "add"
        }],
    }),
    makeTextTool({
        id: "x-decimals-align",
        label: "Align Decimal Columns",
        description: "A list of numbers → aligned at the decimal point (dots stack, widths matched).",
        sample: "1.5\n22.375\n0.12\n300",
        transform: (input) => {
            const nums = input.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n));
            if (nums.length === 0) return "Paste numbers (any separator).";
            const strs = nums.map((n) => String(n));
            const [intW, decW] = [
                Math.max(...strs.map((s) => s.split(".")[0].length)),
                Math.max(...strs.map((s) => (s.split(".")[1] ?? "").length)),
            ];
            return strs
                .map((s) => {
                    const [i, d = ""] = s.split(".");
                    return `${i.padStart(intW)}.${(d + "0".repeat(decW)).slice(0, Math.max(decW, 1))}`;
                })
                .join("\n");
        },
    }),
];

export const EXTRA_SECURITY_TOOLS = [
    makeTextTool({
        id: "x-book-cipher",
        label: "Book Cipher (word index)",
        description: "Encode a message as word-index coordinates against a shared key text — decode needs the same book.",
        sample: "meet at noon\nthe quick brown fox jumps over the lazy dog and meets at noon near the bridge",
        transform: (input, opts) => {
            const decode = String(opts.direction || "encode") === "decode";
            const [message, book] = input.split(/\r?\n/).filter(Boolean);
            if (!message) return "Line 1: the message. Line 2: the key text (the “book”).";
            const words = (book ?? "").toLowerCase().match(/\S+/g) ?? [];
            if (words.length === 0) return "The second line (the key text) is empty.";
            const index = new Map<string, number[]>();
            words.forEach((w, i) => {
                const list = index.get(w) ?? [];
                list.push(i + 1);
                index.set(w, list);
            });
            if (decode) {
                return (message.match(/\d+/g) ?? [])
                    .map((n) => words[Number(n) - 1] ?? "?")
                    .join(" ");
            }
            // encode: each MESSAGE word → the index of its (next) occurrence in the book
            const used = new Map<string, number>();
            const out: string[] = [];
            for (const w of message.toLowerCase().match(/\S+/g) ?? []) {
                const occurrences = index.get(w);
                if (!occurrences) {
                    out.push(`(${w}:not-in-book)`);
                    continue;
                }
                const n = (used.get(w) ?? 0) % occurrences.length;
                used.set(w, n + 1);
                out.push(String(occurrences[n]));
            }
            return out.join(" ");
        },
        options: [{
            key: "direction",
            label: "Direction",
            kind: "select",
            choices: [["encode", "Message → indexes"], ["decode", "Indexes → message"]],
            default: "encode"
        }],
        note: "Each message word maps to its successive occurrence in the key text — decode needs the same book.",
    }),
    makeTextTool({
        id: "x-affine-cipher",
        label: "Affine Cipher",
        description: "The (ax + b) mod 26 cipher — encrypt or decrypt with your key pair (a must be coprime with 26).",
        sample: "HELLO",
        transform: (input, opts) => {
            const a = Number(opts.a || 5);
            const b = Number(opts.b || 8);
            if (gcd(a, 26) !== 1) return `a=${a} is not coprime with 26 — pick 1,3,5,7,9,11,15,17,19,21,23 or 25.`;
            const aInv = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25].find((x) => (a * x) % 26 === 1)!;
            const decrypt = String(opts.direction || "encrypt") === "decrypt";
            return input.replace(/[a-z]/gi, (ch) => {
                const isUpper = ch === ch.toUpperCase();
                const base = isUpper ? 65 : 97;
                const x = ch.charCodeAt(0) - base;
                const y = decrypt ? (aInv * ((x - b + 26) % 26)) % 26 : (a * x + b) % 26;
                return String.fromCharCode(base + y);
            });
        },
        options: [
            {
                key: "direction",
                label: "Direction",
                kind: "select",
                choices: [["encrypt", "Encrypt"], ["decrypt", "Decrypt"]],
                default: "encrypt"
            },
            {
                key: "a",
                label: "a (coprime)",
                kind: "select",
                choices: [["5", "5"], ["7", "7"], ["11", "11"], ["15", "15"], ["17", "17"], ["21", "21"]],
                default: "5"
            },
            {
                key: "b",
                label: "b (shift)",
                kind: "select",
                choices: [["8", "8"], ["3", "3"], ["13", "13"], ["19", "19"]],
                default: "8"
            },
        ],
    }),
];

export const EXTRA_VALIDATE_TOOLS = [
    makeTextTool({
        id: "x-email-check",
        label: "Email Validator (deep)",
        description: "RFC-lite syntax + length limits + common-provider quirks — the exact reason explained.",
        sample: "user.name+tag@sub.example.com",
        transform: (input) => {
            const t = input.trim();
            if (t.includes("\n")) return "One address at a time.";
            const issues: string[] = [];
            if (t.length > 254) issues.push("longer than the 254-char address limit");
            const m = /^([^@\s]+)@([^@\s]+)$/.exec(t);
            if (!m) return "✗ not local@domain — an @ (and only one) is required with no spaces.";
            const [local, domain] = m.slice(1) as [string, string];
            if (local.length > 64) issues.push("local part longer than 64 chars");
            if (domain.length > 253) issues.push("domain longer than 253 chars");
            if (!local) issues.push("empty local part");
            if (local.startsWith(".")) issues.push("local part starts with a dot");
            if (local.endsWith(".")) issues.push("local part ends with a dot");
            if (local.includes("..")) issues.push("consecutive dots in the local part");
            if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) issues.push("invalid characters in the local part");
            if (!/^[A-Za-z0-9.-]+$/.test(domain)) issues.push("invalid characters in the domain");
            if (!domain.includes(".")) issues.push("domain has no dot (no TLD)");
            if (domain.startsWith("-") || domain.endsWith("-")) issues.push("domain label starts/ends with a hyphen");
            const labels = domain.split(".");
            if (labels.some((l) => l.length === 0 || l.length > 63)) issues.push("domain label length out of 1-63");
            const tld = labels[labels.length - 1];
            if (tld && tld.length < 2) issues.push("TLD too short");
            if (/^(gmail|googlemail)\.com$/i.test(domain) && /[A-Z]/.test(local)) issues.push("Gmail treats dots and case loosely — plus-addressing (+tag) is safe");
            if (issues.length) return issues.map((s, i) => `${i + 1}. ${s}`).join("\n") + `\n\n${t} — ✗`;
            return `${t} — ✓ structurally valid\nlocal : ${local.length} chars\ndomain: ${domain}`;
        },
    }),
    makeTextTool({
        id: "x-card-brand",
        label: "Card Brand Detector",
        description: "A card number → its IIN brand (Visa / Mastercard / Amex / Discover / JCB…) + length expectations.",
        sample: "4111111111111111",
        transform: (input) => {
            const digits = input.replace(/\D/g, "");
            if (digits.length < 6) return "Paste a card number (any separators are fine).";
            const first = Number(digits[0]);
            const two = Number(digits.slice(0, 2));
            const four = Number(digits.slice(0, 4));
            let brand = "unknown";
            let lengths = "";
            if (first === 4) {
                brand = "Visa";
                lengths = "13, 16 or 19 digits";
            } else if ((two >= 51 && two <= 55) || (two >= 22 && two <= 27)) {
                brand = "Mastercard";
                lengths = "16 digits";
            } else if (two === 34 || two === 37) {
                brand = "American Express";
                lengths = "15 digits";
            } else if (four === 6011 || two === 65 || (four >= 622126 && four <= 622925)) {
                brand = "Discover";
                lengths = "16 or 19 digits";
            } else if (two >= 35 && two <= 39) {
                brand = "JCB";
                lengths = "16-19 digits";
            } else if (four === 3095 || (two >= 36 && two <= 38) || two === 39) {
                brand = "Diners Club / Carte Blanche";
                lengths = "14-19 digits";
            } else if (four === 6065) {
                brand = "RuPay";
                lengths = "16 digits";
            }
            const luhnOk = (() => {
                let sum = 0;
                let dbl = false;
                for (let i = digits.length - 1; i >= 0; i--) {
                    let d = Number(digits[i]);
                    if (dbl) {
                        d *= 2;
                        if (d > 9) d -= 9;
                    }
                    sum += d;
                    dbl = !dbl;
                }
                return sum % 10 === 0;
            })();
            return `digits : ${digits.length}\nbrand  : ${brand}${lengths ? ` (${lengths})` : ""}\nluhn   : ${luhnOk ? "checksum VALID" : "checksum INVALID"}`;
        },
        note: "Brand detection by IIN ranges; the Luhn checksum is computed locally — no number leaves the page.",
    }),
    makeTextTool({
        id: "x-hex-color-check",
        label: "Hex Color Validator",
        description: "Check and normalize #RGB / #RGBA / #RRGGBB / #RRGGBBAA — with the error explained.",
        sample: "#3498",
        transform: (input) => {
            const t = input.trim();
            if (!t.startsWith("#")) return `${t} — a hex color starts with “#”.`;
            const hex = t.slice(1);
            if (!/^[0-9a-fA-F]+$/.test(hex)) return `#${hex} — non-hex characters present.`;
            if (hex.length === 3 || hex.length === 4) {
                const expanded = hex.split("").map((c) => c + c).join("");
                return `✓ valid #${hex.length === 3 ? "RGB" : "RGBA"} — expanded: #${expanded.toLowerCase()}`;
            }
            if (hex.length === 6 || hex.length === 8) {
                return `✓ valid #${hex.length === 6 ? "RRGGBB" : "RRGGBBAA"} — normalized: #${hex.toLowerCase()}`;
            }
            return `#${hex} — ${hex.length} hex digits is not one of 3, 4, 6 or 8.`;
        },
    }),
    makeTextTool({
        id: "x-cron-check",
        label: "Cron Field Validator",
        description: "Validate each of the 5 cron fields — ranges, steps and lists checked with the exact problem.",
        sample: "*/15 25 * * 1-5",
        transform: (input) => {
            const fields = input.trim().split(/\s+/);
            if (fields.length !== 5) return `Expected 5 fields, found ${fields.length}.`;
            const names = ["minute", "hour", "day-of-month", "month", "day-of-week"];
            const limits = [59, 23, 31, 12, 7];
            const issues: string[] = [];
            fields.forEach((f, i) => {
                const limit = limits[i];
                for (const part of f.split(",")) {
                    const stepM = /^(\*|\d+(?:-\d+)?)\/(\d+)$/.exec(part);
                    const rangeM = /^(\d+)-(\d+)$/.exec(part);
                    if (stepM) {
                        const hi = stepM[1] === "*" ? limit : Number(stepM[1]);
                        if (hi > limit) issues.push(`${names[i]} “${part}”: base exceeds ${limit}`);
                        if (Number(stepM[2]) < 1 || (stepM[1] !== "*" && Number(stepM[2]) > limit)) issues.push(`${names[i]} “${part}”: step out of range`);
                    } else if (rangeM) {
                        if (Number(rangeM[1]) > Number(rangeM[2])) issues.push(`${names[i]} “${part}”: reversed range`);
                        if (Number(rangeM[2]) > limit) issues.push(`${names[i]} “${part}”: exceeds ${limit}`);
                    } else if (part === "*") {
                        void 0;
                    } else if (/^\d+$/.test(part)) {
                        const v = Number(part);
                        const min = i === 2 || i === 3 ? 1 : 0;
                        if (v < min || v > limit) issues.push(`${names[i]} “${part}”: outside ${min}-${limit}`);
                    } else {
                        issues.push(`${names[i]} “${part}”: not a number, range, list or */n step`);
                    }
                }
            });
            return issues.length ? issues.map((s, i) => `${i + 1}. ${s}`).join("\n") : `✓ every field is valid (${input.trim()})`;
        },
    }),
    makeTextTool({
        id: "x-ip-validate",
        label: "IPv4 / CIDR Validator",
        description: "Check IPs and CIDRs — octets, range, mask alignment (the network bits actually zeroed).",
        sample: "10.0.0.1/24",
        transform: (input) => {
            const t = input.trim();
            const results = t.split(/[\s,;]+/).filter(Boolean).map((item) => {
                if (item.includes("/")) {
                    const cidr = parseCidr(item);
                    if (!cidr) return `${item} — malformed CIDR`;
                    const mask = cidr.prefix === 0 ? 0 : (0xffffffff << (32 - cidr.prefix)) >>> 0;
                    const aligned = (cidr.ip & mask) === cidr.ip;
                    return `${item} — ${aligned ? "✓ valid, host bits are zero" : `✗ not aligned: network should be ${intToIpv4(cidr.ip & mask)}/${cidr.prefix}`}`;
                }
                const ip = parseIpv4(item);
                return ip === null ? `${item} — invalid octet(s)` : `${item} — ✓ valid IPv4`;
            });
            return results.join("\n");
        },
    }),
];

export const EXTRA_TEXTANALYSIS_TOOLS = [
    makeTextTool({
        id: "x-reading-time",
        label: "Reading Time Table",
        description: "The word count projected onto 100 / 200 / 300 wpm reading and speaking paces.",
        sample: "Paste a paragraph here and see how long it takes to read at each pace.",
        transform: (input) => {
            const words = input.trim().split(/\s+/).filter(Boolean).length;
            if (words === 0) return "—";
            const pace = (wpm: number) => {
                const mins = words / wpm;
                const m = Math.floor(mins);
                const s = Math.round((mins - m) * 60);
                return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
            };
            return [
                `words : ${words.toLocaleString()}`,
                `chars : ${input.length.toLocaleString()}`,
                ``,
                `reading  ~200 wpm : ${pace(200)}  (average adult)`,
                `slow    ~100 wpm : ${pace(100)}`,
                `skimming ~300 wpm: ${pace(300)}`,
                `speech  ~140 wpm : ${pace(140)}  (presentation pace)`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-line-histogram",
        label: "Line Length Histogram",
        description: "How the line lengths distribute — buckets, max / mean / mode, and the >80-flagged lines.",
        sample: "a\nlonger line here\nmuch much longer line goes here for sure ok",
        transform: (input) => {
            const lens = input.split(/\r?\n/).map((l) => l.length);
            if (lens.length === 0) return "—";
            const max = Math.max(...lens);
            const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
            const buckets = [0, 0, 0, 0, 0, 0];
            const labels = ["1-20", "21-40", "41-60", "61-80", "81-100", ">100"];
            for (const l of lens) buckets[Math.min(5, Math.floor(l / 20))] = buckets[Math.min(5, Math.floor(l / 20))] + 1;
            const bar = (n: number) => "#".repeat(Math.round((n / lens.length) * 40));
            return [
                `lines : ${lens.length}`,
                `max   : ${max}`,
                `mean  : ${roundTo(mean, 1)}`,
                `over 80 cols: ${lens.filter((l) => l > 80).length} line(s)`,
                "",
                ...labels.map((lb, i) => `${lb.padEnd(7)} ${String(buckets[i]).padStart(3)} ${bar(buckets[i])}`),
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-readability",
        label: "Readability (Flesch)",
        description: "Flesch Reading Ease and Flesch-Kincaid Grade — with the syllable count they derive from.",
        sample: "The cat sat on the mat. It was warm.",
        transform: (input) => {
            const sentences = (input.match(/[.!?]+/g) ?? []).length || 1;
            const words = input.toLowerCase().match(/[a-z]+/g) ?? [];
            if (words.length === 0) return "—";
            const syllable = (w: string): number => {
                let s = w.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, "").replace(/^y/, "");
                const m = s.match(/[aeiouy]{1,2}/g);
                return Math.max(1, m ? m.length : 1);
            };
            const syl = words.reduce((a, w) => a + syllable(w), 0);
            const ease = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
            const grade = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
            const band =
                ease >= 90 ? "5th grade — very easy" :
                    ease >= 80 ? "6th grade — easy" :
                        ease >= 70 ? "7th grade — fairly easy" :
                            ease >= 60 ? "8th-9th grade — plain English" :
                                ease >= 50 ? "10th-12th grade — fairly difficult" :
                                    ease >= 30 ? "college — difficult" :
                                        "college graduate — very difficult";
            return [
                `sentences : ${sentences}`,
                `words     : ${words.length}`,
                `syllables : ${syl} (${roundTo(syl / words.length, 2)} per word)`,
                `Flesch RE : ${roundTo(ease, 1)} — ${band}`,
                `FK grade  : ${roundTo(grade, 1)}`,
            ].join("\n");
        },
    }),
    makeTextTool({
        id: "x-letter-freq",
        label: "Letter Frequency",
        description: "The classic letter frequency table (plus the top digits) — counts, per-mille and a bar.",
        sample: "the quick brown fox jumps over the lazy dog",
        transform: (input) => {
            const text = input.toLowerCase();
            const letters: Record<string, number> = {};
            let total = 0;
            for (const c of text) {
                if (/[a-z]/.test(c)) {
                    letters[c] = (letters[c] ?? 0) + 1;
                    total++;
                }
            }
            if (total === 0) return "No letters found.";
            const sorted = Object.entries(letters).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            const top = sorted[0][1];
            return sorted
                .map(([c, n]) => `${c}  ${String(n).padStart(5)}  ${roundTo((n / total) * 1000, 1).padStart(6)}‰  ${"█".repeat(Math.max(1, Math.round((n / top) * 30)))}`)
                .join("\n");
        },
    }),
];
