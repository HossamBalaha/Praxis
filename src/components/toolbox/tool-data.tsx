"use client";

/**
 * tool-data.tsx — the "Data & Tables" toolbox category (base tools;
 * the registry's boosts keep the category ≥ 30 — see dev-toolbox.tsx).
 * Real CSV/TSV/JSON table transforms on top of lib/csv-io's quoted
 * parser + lib/jsonpath. All offline.
 */

import {makeTextTool, type TextToolSpec} from "./tool-factory";
import {parseCsv, stringifyCsv} from "@/lib/csv-io";
import {queryJsonPath} from "@/lib/jsonpath";

/** The tool specs — dev-toolbox.tsx registers them. */
export const DATA_TOOLS: TextToolSpec[] = [
    {
        id: "csv-json",
        label: "CSV → JSON",
        description: "Quoted-aware CSV parsed into a JSON array of row objects (header keys) — the classic hand-off.",
        sample: 'name,score\ntaylor,91\nnova,87',
        transform: (input) => {
            const t = parseCsv(input.trim());
            if (t.rows.length === 0) return "[]";
            const header = t.headers.map((h) => h.trim());
            const objects = t.rows.map((r) => {
                const o: Record<string, string> = {};
                header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
                return o;
            });
            return JSON.stringify(objects, null, 2);
        },
        note: "Empty lines are skipped; every value stays a string (add the JSON tools below to type-coerce).",
    },
    {
        id: "json-csv",
        label: "JSON (array of objects) → CSV",
        description: "A JSON array of objects becomes a quoted CSV with the union of keys as the header.",
        sample: '[{"name":"taylor","score":91},{"name":"nova","score":87}]',
        transform: (input) => {
            const data = JSON.parse(input);
            if (!Array.isArray(data) || data.length === 0) return "Error: expected a non-empty JSON array.";
            const keys: string[] = [];
            for (const row of data) {
                if (typeof row !== "object" || row === null) return "Error: every element must be an object.";
                for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
            }
            const lines = [keys.join(",")];
            for (const row of data) {
                const cells = keys.map((k) => {
                    const v = (row as Record<string, unknown>)[k];
                    return v === undefined ? "" : String(v ?? "");
                });
                lines.push(cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","));
            }
            return lines.join("\n");
        },
    },
    {
        id: "csv-tsv",
        label: "CSV ⇄ TSV",
        description: "Convert between comma and tab delimited tables (quoted fields handled).",
        sample: 'a,b\n"x,1",2',
        options: [
            {
                key: "dir",
                label: "Direction",
                kind: "select",
                choices: [["csv2tsv", "CSV → TSV"], ["tsv2csv", "TSV → CSV"]],
                default: "csv2tsv"
            },
        ],
        transform: (input, o) => {
            const toTsv = o.dir !== "tsv2csv";
            const t = parseCsv(input.trim(), toTsv ? "," : "\t");
            return stringifyCsv(t, toTsv ? "\t" : ",");
        },
    },
    {
        id: "csv-query",
        label: "CSV Filter Rows",
        description: "Keep only the rows whose column passes a comparison (=, !=, >, <, >=, <=, contains, starts, ends, empty, notempty).",
        sample: "name,score\ntaylor,91\nnova,87\nmilan,60",
        transform: (input) => {
            // col/val arrive via the hidden inputs trick below; defaults to
            // the interactive line at the top of the input: "# filter: col op value"
            const t = parseCsv(input.trim());
            let filter: { col: string; op: string; val: string } | null = null;
            const rows: string[][] = [];
            for (const r of t.rows) {
                const first = (r[0] ?? "").trim();
                if (first.startsWith("# filter:")) {
                    const m = first.slice(8).trim().match(/^(\S+)\s+(\S+)\s+(.*)$/);
                    if (m) filter = {col: m[1], op: m[2], val: m[3]};
                    continue;
                }
                rows.push(r);
            }
            if (!filter) {
                return "Error: add a first line like  # filter: score > 80  (or # filter: name contains tay) — then the rows.";
            }
            const idx = /^#?(\d+)$/.test(filter.col)
                ? parseInt(filter.col, 10)
                : t.headers.findIndex((h) => h.trim() === filter!.col);
            if (idx < 0) return `Error: column "${filter.col}" not in the header (${t.headers.join(", ")}).`;
            const kept = rows.filter((r) => {
                const cell = (r[idx] ?? "").trim();
                const val = filter!.val;
                const cn = Number(cell);
                const vn = Number(val);
                switch (filter!.op) {
                    case "=":
                        return cell === val;
                    case "!=":
                        return cell !== val;
                    case ">":
                        return Number.isFinite(cn) && Number.isFinite(vn) && cn > vn;
                    case "<":
                        return Number.isFinite(cn) && Number.isFinite(vn) && cn < vn;
                    case ">=":
                        return Number.isFinite(cn) && Number.isFinite(vn) && cn >= vn;
                    case "<=":
                        return Number.isFinite(cn) && Number.isFinite(vn) && cn <= vn;
                    case "contains":
                        return cell.toLowerCase().includes(val.toLowerCase());
                    case "starts":
                        return cell.toLowerCase().startsWith(val.toLowerCase());
                    case "ends":
                        return cell.toLowerCase().endsWith(val.toLowerCase());
                    case "empty":
                        return cell === "";
                    case "notempty":
                        return cell !== "";
                    default:
                        return false;
                }
            });
            const out = [t.headers].concat(kept);
            return stringifyCsv({headers: out[0], rows: out.slice(1)});
        },
        note: "The filter is the FIRST line of the input: `# filter: score >= 80`. Column can be a name or a 0-based #. The filter line never lands in the output.",
    },
    {
        id: "csv-sort",
        label: "CSV Sort Rows",
        description: "Sort the rows by one column — numeric when the column parses as numbers, else lexicographic; optional reverse.",
        sample: "name,score\ntaylor,91\nnova,87\nmilan,60",
        options: [{key: "desc", label: "Descending", kind: "toggle"}],
        transform: (input, o) => {
            const t = parseCsv(input.trim());
            const lines = t.rows.filter((r) => (r[0] ?? "").trim().startsWith("# sort:") ? false : true);
            let col = 0;
            for (const r of t.rows) {
                const first = (r[0] ?? "").trim();
                if (first.startsWith("# sort:")) {
                    const want = first.slice(7).trim();
                    const i = t.headers.findIndex((h) => h.trim() === want);
                    col = i >= 0 ? i : /^#?\d+$/.test(want) ? parseInt(want, 10) : 0;
                }
            }
            const desc = o.desc === true;
            const rows = lines.slice().sort((a, b) => {
                const av = (a[col] ?? "").trim();
                const bv = (b[col] ?? "").trim();
                const an = Number(av);
                const bn = Number(bv);
                const numeric = av !== "" && bv !== "" && Number.isFinite(an) && Number.isFinite(bn);
                const cmp = numeric ? an - bn : av.localeCompare(bv, undefined, {numeric: true, sensitivity: "base"});
                return desc ? -cmp : cmp;
            });
            return stringifyCsv({headers: t.headers, rows});
        },
        note: "Optional first line `# sort: score` picks the column (name or 0-based #); default = column 0.",
    },
    {
        id: "csv-unique",
        label: "CSV Unique Rows",
        description: "Drop duplicate rows (first occurrence wins); optionally key on selected columns only.",
        sample: "a,b\n1,x\n1,x\n2,y",
        transform: (input) => {
            const t = parseCsv(input.trim());
            const seen = new Set<string>();
            const rows: string[][] = [];
            for (const r of t.rows) {
                const key = r.map((c) => c.trim()).join("\u0000");
                if (!seen.has(key)) {
                    seen.add(key);
                    rows.push(r);
                }
            }
            return stringifyCsv({headers: t.headers, rows});
        },
    },
    {
        id: "csv-columns",
        label: "CSV Select Columns",
        description: "Keep (or drop) the named columns, in the order you list them.",
        sample: "name,score,city\ntaylor,91,cairo\nnova,87,tokyo",
        transform: (input) => {
            const t = parseCsv(input.trim());
            const first = t.rows[0]?.[0]?.trim() ?? "";
            if (!first.startsWith("# columns:")) {
                return "Error: add a first line like  # columns: name, score  (or # columns: -city to drop one).";
            }
            const spec = first.slice(10).trim();
            const drop = spec.startsWith("-");
            const wanted = spec.replace(/^-/, "").split(",").map((s) => s.trim()).filter(Boolean);
            const idx = wanted.map((w) => (/^\d+$/.test(w) ? parseInt(w, 10) : t.headers.findIndex((h) => h.trim() === w)));
            const bad = wanted.filter((w, i) => idx[i] === undefined || idx[i]! < 0);
            if (bad.length > 0) return `Error: unknown column(s): ${bad.join(", ")}`;
            const keep = t.headers.map((_, i) => i).filter((i) => (drop ? !idx.includes(i) : idx.includes(i)));
            const order = drop ? keep : idx as number[];
            const header = order.map((i) => t.headers[i]);
            const rows = t.rows.map((r) => order.map((i) => r[i] ?? ""));
            return stringifyCsv({headers: header, rows});
        },
        note: "The column list is the FIRST input line: `# columns: name, city` reorders too; `# columns: -score` drops.",
    },
    {
        id: "csv-rename",
        label: "CSV Rename Columns",
        description: "Rename headers with old=new pairs on the first line.",
        sample: "name,score\ntaylor,91",
        transform: (input) => {
            const t = parseCsv(input.trim());
            const first = t.rows[0]?.[0]?.trim() ?? "";
            if (!first.startsWith("# rename:")) {
                return "Error: add a first line like  # rename: score=points,name=player";
            }
            const renames = new Map<string, string>();
            for (const pair of first.slice(9).split(",")) {
                const m = pair.trim().match(/^([^=]+)=(.*)$/);
                if (m) renames.set(m[1].trim(), m[2].trim());
            }
            const header = t.headers.map((h) => renames.get(h.trim()) ?? h);
            return stringifyCsv({headers: header, rows: t.rows});
        },
    },
    {
        id: "csv-transpose",
        label: "CSV Transpose",
        description: "Rows become columns and columns become rows.",
        sample: "a,b\n1,2\n3,4",
        transform: (input) => {
            const t = parseCsv(input.trim());
            const width = Math.max(t.headers.length, ...t.rows.map((r) => r.length));
            const out: string[][] = [];
            for (let c = 0; c < width; c++) {
                out.push([(t.headers[c] ?? ""), ...t.rows.map((r) => r[c] ?? "")]);
            }
            return stringifyCsv({headers: out[0], rows: out.slice(1)});
        },
    },
    {
        id: "csv-stats",
        label: "CSV Column Stats",
        description: "Per-column count / min / max / mean / sum for the numeric columns (non-numeric cells skipped).",
        sample: "name,score\na,10\nb,20\nc,30",
        transform: (input) => {
            const t = parseCsv(input.trim());
            const lines = ["column,count,min,max,sum,mean"];
            for (let c = 0; c < t.headers.length; c++) {
                const nums = t.rows.map((r) => Number((r[c] ?? "").trim())).filter((n) => Number.isFinite(n));
                if (nums.length === 0) continue;
                const sum = nums.reduce((a, b) => a + b, 0);
                lines.push(`${t.headers[c].trim()},${nums.length},${Math.min(...nums)},${Math.max(...nums)},${sum},${(sum / nums.length).toFixed(3)}`);
            }
            return lines.join("\n");
        },
    },
    {
        id: "csv-join",
        label: "CSV Join (key lookup)",
        description: "Left-join two CSVs on a key column — paste the LEFT table, then a `# join:` line, then the RIGHT table.",
        sample: "id,name\n1,taylor\n2,nova\n# join:\nid,city\n1,cairo\n3,lima",
        transform: (input) => {
            const parts = input.split(/\n?# join:\s*\n?/);
            if (parts.length !== 2) return "Error: paste the left table, a lone `# join:` line, then the right table.";
            const left = parseCsv(parts[0].trim());
            const right = parseCsv(parts[1].trim());
            if (left.rows.length === 0 || right.rows.length === 0) return "Error: both tables need a header + rows.";
            const keyL = 0;
            const keyR = 0;
            const map = new Map<string, string[]>();
            for (const r of right.rows) map.set((r[keyR] ?? "").trim(), r);
            const header = [...left.headers, ...right.headers.slice(1).map((h, i) => `${h || `r${i + 1}`}`)];
            const rows = left.rows.map((r) => {
                const hit = map.get((r[keyL] ?? "").trim());
                return [...r, ...(hit ? hit.slice(1) : right.headers.slice(1).map(() => ""))];
            });
            return stringifyCsv({headers: header, rows});
        },
        note: "Join key = column 0 of each table (left rows without a match keep empty cells — a true LEFT join).",
    },
    {
        id: "csv-numbers",
        label: "CSV Add Row Numbers",
        description: "Prepend a row index column (1-based, stable through quoted fields).",
        sample: "a\nx\ny",
        transform: (input) => {
            const t = parseCsv(input.trim());
            const header = ["#", ...t.headers];
            const rows = t.rows.map((r, i) => [String(i + 1), ...r]);
            return stringifyCsv({headers: header, rows});
        },
    },
    {
        id: "csv-fill",
        label: "CSV Fill Empty Cells",
        description: "Replace every empty cell with a value (default —), so exports stop showing blanks.",
        sample: "a,b\n1,\n,4",
        transform: (input) => {
            const t = parseCsv(input.trim());
            let fill = "—";
            for (const r of t.rows) {
                const first = (r[0] ?? "").trim();
                if (first.startsWith("# fill:")) fill = first.slice(7).trim();
            }
            const rows = t.rows.map((r) => r.map((c) => (c.trim() === "" ? fill : c)));
            return stringifyCsv({headers: t.headers, rows});
        },
        note: "Override the fill value with a first line `# fill: NULL`.",
    },
    {
        id: "json-flatten",
        label: "JSON Flatten",
        description: "Nested objects/arrays become dot-path keys — {a:{b:1}} → {\"a.b\":1}. Leaf values only.",
        sample: '{"user":{"name":"taylor","tags":["a","b"]}}',
        transform: (input) => {
            const data = JSON.parse(input);
            const flat: Record<string, unknown> = {};
            const walk = (node: unknown, prefix: string) => {
                if (Array.isArray(node)) {
                    if (node.length === 0) flat[prefix] = [];
                    node.forEach((v, i) => walk(v, prefix ? `${prefix}.${i}` : String(i)));
                } else if (typeof node === "object" && node !== null) {
                    for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
                } else {
                    flat[prefix || "value"] = node;
                }
            };
            walk(data, "");
            return JSON.stringify(flat, null, 2);
        },
    },
    {
        id: "json-unflatten",
        label: "JSON Unflatten",
        description: "Dot-path keys rebuild the nested object — the flatten twin.",
        sample: '{"user.name":"taylor","user.tags.0":"a"}',
        transform: (input) => {
            const data = JSON.parse(input);
            if (typeof data !== "object" || data === null || Array.isArray(data)) {
                return "Error: expected a flat JSON object.";
            }
            const root: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(data)) {
                const parts = k.split(".");
                let node: Record<string, unknown> | unknown[] = root;
                for (let i = 0; i < parts.length - 1; i++) {
                    const p = parts[i];
                    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
                    const container = (node as Record<string, unknown>);
                    const existing = container[p];
                    if (existing === undefined || typeof existing !== "object") {
                        container[p] = nextIsIndex ? ([] as unknown[]) : ({} as Record<string, unknown>);
                    }
                    node = container[p] as Record<string, unknown> | unknown[];
                }
                const last = parts[parts.length - 1];
                if (Array.isArray(node)) (node as unknown[])[Number(last)] = v;
                else (node as Record<string, unknown>)[last] = v;
            }
            return JSON.stringify(root, null, 2);
        },
    },
    {
        id: "json-query",
        label: "JSONPath Query",
        description: "Run a JSONPath expression against the pasted JSON — matches print one per line.",
        sample: '$..name\n{"users":[{"name":"taylor"},{"name":"nova"}]}',
        transform: (input) => {
            const nl = input.indexOf("\n");
            const expr = nl > 0 ? input.slice(0, nl).trim() : "$";
            const jsonText = nl > 0 ? input.slice(nl + 1).trim() : input.trim();
            const data = JSON.parse(jsonText);
            const matches = queryJsonPath(data, expr);
            if (matches.length === 0) return "No matches.";
            return matches
                .map((m) => `${m.path}\t${typeof m.value === "object" ? JSON.stringify(m.value) : String(m.value)}`)
                .join("\n");
        },
        note: "First line = the expression ($.a.b, $..name, $[0].id …), the rest = the JSON.",
    },
    {
        id: "json-pick",
        label: "JSON Pick Keys",
        description: "Keep only the chosen top-level keys (or keys of every array element).",
        sample: 'pick: name, score\n{"name":"taylor","score":91,"extra":"drop me"}',
        transform: (input) => {
            const nl = input.indexOf("\n");
            const first = (nl > 0 ? input.slice(0, nl) : "").trim();
            if (!/^pick:/i.test(first)) {
                return "Error: first line `pick: key1, key2`, then the JSON.";
            }
            const wanted = first.slice(5).split(",").map((s) => s.trim()).filter(Boolean);
            const data = JSON.parse(nl > 0 ? input.slice(nl + 1) : "");
            const pickFrom = (o: unknown): unknown => {
                if (Array.isArray(o)) return o.map(pickFrom);
                if (typeof o === "object" && o !== null) {
                    const out: Record<string, unknown> = {};
                    for (const k of wanted) if (k in (o as Record<string, unknown>)) out[k] = (o as Record<string, unknown>)[k];
                    return out;
                }
                return o;
            };
            return JSON.stringify(pickFrom(data), null, 2);
        },
    },
    {
        id: "json-dedupe",
        label: "JSON Deduplicate Array",
        description: "Remove duplicate entries from a JSON array (deep-equal comparison).",
        sample: '[1,1,{"a":1},{"a":1},2]',
        transform: (input) => {
            const data = JSON.parse(input);
            if (!Array.isArray(data)) return "Error: expected a JSON array.";
            const seen: string[] = [];
            const out: unknown[] = [];
            for (const item of data) {
                const key = JSON.stringify(item);
                if (!seen.includes(key)) {
                    seen.push(key);
                    out.push(item);
                }
            }
            return JSON.stringify(out, null, 2);
        },
    },
    {
        id: "json-typify",
        label: "JSON Type-Coerce Strings",
        description: "Stringified numbers / booleans / null become real types — CSV hand-offs become query-ready.",
        sample: '{"n":"42","b":"true","z":"null","s":"text"}',
        transform: (input) => {
            const coerce = (v: unknown): unknown => {
                if (typeof v === "string") {
                    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v.trim()) && v.trim() !== "") return Number(v);
                    if (v.trim() === "true") return true;
                    if (v.trim() === "false") return false;
                    if (v.trim() === "null") return null;
                    return v;
                }
                if (Array.isArray(v)) return v.map(coerce);
                if (typeof v === "object" && v !== null) {
                    const out: Record<string, unknown> = {};
                    for (const [k, val] of Object.entries(v)) out[k] = coerce(val);
                    return out;
                }
                return v;
            };
            return JSON.stringify(coerce(JSON.parse(input)), null, 2);
        },
    },
    {
        id: "json-to-lines",
        label: "JSON Array → Lines",
        description: "Each element of a JSON array (or object values) becomes one line — stringify leaves.",
        sample: '["a",{"b":1},2]',
        transform: (input) => {
            const data = JSON.parse(input);
            if (Array.isArray(data)) return data.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("\n");
            if (typeof data === "object" && data !== null) return Object.values(data).map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("\n");
            return "Error: expected a JSON array or object.";
        },
    },
    {
        id: "lines-to-json",
        label: "Lines → JSON Array",
        description: "One value per line becomes a JSON array (optionally split each line on a separator into an object).",
        sample: "a,b\nx,y",
        options: [{
            key: "sep",
            label: "Split on",
            kind: "select",
            choices: [["", "whole line"], [",", "comma → object"], ["\\t", "tab → object"]],
            default: ""
        }],
        transform: (input, o) => {
            // NOTE: no tab-mangling here. The old code ran
            // `.replace(/\t/g, o.sep === "\\t" ? "\t" : l)` — when the split
            // was NOT tab mode it replaced EVERY TAB IN THE LINE WITH THE
            // ENTIRE LINE ("l"), exploding tab-containing input into
            // garbage. Lines pass through verbatim; the separator splits.
            const lines = input.split(/\r?\n/).filter((l) => l.trim() !== "");
            const sep = o.sep === "," ? "," : o.sep === "\\t" ? "\t" : "";
            if (!sep) return JSON.stringify(lines, null, 2);
            if (lines.length < 2) return JSON.stringify(lines.slice(1), null, 2);
            const keys = lines[0].split(sep).map((s) => s.trim());
            return JSON.stringify(
                lines.slice(1).map((l) => {
                    const cells = l.split(sep);
                    const obj: Record<string, string> = {};
                    keys.forEach((k, i) => (obj[k || `col_${i + 1}`] = (cells[i] ?? "").trim()));
                    return obj;
                }),
                null,
                2
            );
        },
        note: "With a separator, the FIRST line is the header and the rest become objects.",
    },
    {
        id: "csv-swap-delim",
        label: "Delimiter Swap (custom)",
        description: "Convert any single-character delimiter (semicolon, pipe, caret…) to CSV or TSV.",
        sample: "a;b\n1;2",
        options: [{
            key: "to",
            label: "Output",
            kind: "select",
            choices: [["csv", "CSV (comma)"], ["tsv", "TSV (tab)"]],
            default: "csv"
        }],
        transform: (input, o) => {
            const t = parseCsv(input.trim(), ";");
            return stringifyCsv(t, o.to === "tsv" ? "\t" : ",");
        },
        note: "Input delimiter: semicolon (;). Pipe and caret convert by pre-replacing them below—copy, swap, paste back.",
    },
    {
        id: "csv-extract-col",
        label: "CSV Extract One Column",
        description: "Print a single column's values as plain lines (quotes removed).",
        sample: "name,score\ntaylor,91",
        transform: (input) => {
            const t = parseCsv(input.trim());
            let col = 0;
            for (const r of t.rows) {
                const first = (r[0] ?? "").trim();
                if (first.startsWith("# col:")) {
                    const want = first.slice(6).trim();
                    const i = t.headers.findIndex((h) => h.trim() === want);
                    col = i >= 0 ? i : /^\d+$/.test(want) ? parseInt(want, 10) : 0;
                }
            }
            return t.rows.map((r) => (r[col] ?? "").trim()).filter((v) => v !== "" || true).join("\n");
        },
        note: "Optional first line `# col: score` picks the column (name or 0-based #); default = column 0.",
    },
    {
        id: "table-align",
        label: "Align Text Columns",
        description: "Whitespace-separated rows become a space-aligned table — eyeball diffs of columnar text.",
        sample: "name score\ntaylor 91\nnova 87",
        transform: (input) => {
            const rows = input.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => l.trim().split(/\s+/));
            const width = Math.max(...rows.map((r) => r.length));
            const widths: number[] = [];
            for (let c = 0; c < width; c++) widths[c] = Math.max(0, ...rows.map((r) => (r[c] ?? "").length));
            return rows.map((r) => r.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd()).join("\n");
        },
    },
    {
        id: "md-extract-tables",
        label: "Extract Markdown Tables",
        description: "Pull every pipe table out of a Markdown document as CSV.",
        sample: "# doc\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\ntext",
        transform: (input) => {
            const out: string[] = [];
            let table: string[][] | null = null;
            const flush = () => {
                if (table && table.length > 1) {
                    const cells = table.map((r) => r.map((c) => c.trim()));
                    out.push(stringifyCsv({headers: cells[0], rows: cells.slice(2)}));
                }
                table = null;
            };
            for (const line of input.split(/\r?\n/)) {
                if (line.includes("|") && line.trim() !== "") {
                    const row = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|");
                    (table ??= []).push(row);
                } else flush();
            }
            flush();
            return out.length > 0 ? out.join("\n\n") : "No tables found.";
        },
    },
    {
        id: "csv-header-case",
        label: "CSV Header Case",
        description: "Normalize header casing — snake_case, camelCase, kebab-case or Title Case.",
        sample: "Full Name,score\nTaylor,91",
        options: [{
            key: "style",
            label: "Style",
            kind: "select",
            choices: [["snake", "snake_case"], ["camel", "camelCase"], ["kebab", "kebab-case"], ["title", "Title Case"]],
            default: "snake"
        }],
        transform: (input, o) => {
            const t = parseCsv(input.trim());
            const toWords = (h: string) => h.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_-]+/).filter(Boolean);
            const header = t.headers.map((h) => {
                const words = toWords(h);
                switch (o.style) {
                    case "snake":
                        return words.map((w) => w.toLowerCase()).join("_");
                    case "kebab":
                        return words.map((w) => w.toLowerCase()).join("-");
                    case "title":
                        return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                    default:
                        return words
                            .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
                            .join("");
                }
            });
            return stringifyCsv({headers: header, rows: t.rows});
        },
    },
    {
        id: "tsv-clean",
        label: "TSV Trim & Quote",
        description: "Strip surrounding quotes + trailing whitespace from every TSV field (spreadsheet paste cleanup).",
        sample: '"a"\t"b"\n"1 "\t2',
        transform: (input) => {
            return input
                .split(/\r?\n/)
                .map((l) => l.split("\t").map((c) => c.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"')).join("\t"))
                .join("\n");
        },
    },
    {
        id: "csv-preview-limit",
        label: "CSV Head / Tail Rows",
        description: "Keep the first or last N data rows (header always stays) — quick previews of huge exports.",
        sample: "a\n1\n2\n3\n4",
        options: [
            {
                key: "side",
                label: "Keep",
                kind: "select",
                choices: [["head", "first N"], ["tail", "last N"]],
                default: "head"
            },
            {
                key: "n",
                label: "N",
                kind: "select",
                choices: [["5", "5"], ["10", "10"], ["25", "25"], ["50", "50"], ["100", "100"]],
                default: "10"
            },
        ],
        transform: (input, o) => {
            const t = parseCsv(input.trim());
            const n = parseInt(String(o.n), 10) || 10;
            const rows = o.side === "tail" ? t.rows.slice(-n) : t.rows.slice(0, n);
            return stringifyCsv({headers: t.headers, rows});
        },
    },
];

/** Registry entries: one component per spec (the factory renders it). */
export const DATA_TOOL_ENTRIES = DATA_TOOLS.map((spec) => ({spec, component: makeTextTool(spec)}));
