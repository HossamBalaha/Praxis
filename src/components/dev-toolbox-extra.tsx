"use client";

/**
 * Six additional Developer-Toolbox tools — all offline, synchronous, no new npm dependencies:
 *
 * ▸ XML ⇄ JSON (Converters) — parse XML to JSON and back.
 * ▸ Text Wrap / Reflow (Text) — hard-wrap paragraphs to a width.
 * ▸ Word Frequency (Text) — top-N words with counts + share.
 * ▸ Char Diff (Text) — character-level diff of two texts.
 * ▸ Unicode Inspector (Reference) — code point / UTF-8 byte table.
 * ▸ Luhn Validator (Reference) — card / IMEI / INN checksum state.
 *
 * Registered in dev-toolbox.tsx's TOOLS array.
 */

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";

const area =
    "font-mono text-xs min-h-[110px] w-full rounded-md border bg-muted/30 p-2 focus-visible:ring-1 whitespace-pre-wrap";

function Out({label, text, minH = 60}: { label: string; text: string; minH?: number }) {
    return (
        <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <pre className={cn(area, "whitespace-pre-wrap break-all")} style={{minHeight: minH}}>
        {text || "—"}
      </pre>
        </div>
    );
}

/* ── XML ⇄ JSON ─────────────────────────────────────────────────── */

/** Minimal offline XML parser → JSON tree (elements, attributes,
 *  text; comments/PIs skipped). No dependencies. */
function parseXmlToJson(xml: string): unknown {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) {
        throw new Error("Invalid XML — check the markup (the browser parser rejected it).");
    }
    const conv = (el: Element): unknown => {
        const out: Record<string, unknown> = {};
        for (const attr of Array.from(el.attributes)) out[`@${attr.name}`] = attr.value;
        const kids = Array.from(el.childNodes).filter(
            (n): n is Element => n.nodeType === 1
        );
        const text = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => (n.textContent ?? "").trim())
            .filter(Boolean)
            .join(" ");
        if (text) out["#text"] = text;
        for (const kid of kids) {
            const val = conv(kid);
            const existing = out[kid.nodeName];
            if (existing === undefined) out[kid.nodeName] = val;
            else if (Array.isArray(existing)) (existing as unknown[]).push(val);
            else out[kid.nodeName] = [existing, val];
        }
        return out;
    };
    const root = doc.documentElement;
    return {[root.nodeName]: conv(root)};
}

/** JSON tree → indented XML (the ⇄ twin of the parser above). */
function jsonToXml(value: unknown, rootName = "root"): string {
    const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const lines: string[] = [];
    const walk = (node: unknown, name: string, depth: number, forceAttr?: Record<string, string>) => {
        const pad = "  ".repeat(depth);
        if (node === null || node === undefined) {
            lines.push(`${pad}<${name}${forceAttr ?? ""}/> `);
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) walk(item, name, depth);
            return;
        }
        if (typeof node !== "object") {
            lines.push(`${pad}<${name}>${esc(String(node))}</${name}>`);
            return;
        }
        const obj = node as Record<string, unknown>;
        const attrs = Object.entries(obj)
            .filter(([k]) => k.startsWith("@"))
            .map(([k, v]) => ` ${esc(k.slice(1))}="${esc(String(v))}"`)
            .join("");
        const text = typeof obj["#text"] === "string" ? String(obj["#text"]) : "";
        const children = Object.entries(obj).filter(([k]) => !k.startsWith("@") && k !== "#text");
        if (!children.length && !text) {
            lines.push(`${pad}<${name}${attrs}/>`);
            return;
        }
        if (!children.length) {
            lines.push(`${pad}<${name}${attrs}>${esc(text)}</${name}>`);
            return;
        }
        lines.push(`${pad}<${name}${attrs}>${text ? esc(text) : ""}`);
        for (const [k, v] of children) walk(v, k === "#text" ? "text" : k, depth + 1);
        lines.push(`${pad}</${name}>`);
    };
    walk(value, rootName, 0);
    return lines.join("\n").replace(/ \/>/g, "/>");
}

export function XmlJsonTool() {
    const [input, setInput] = React.useState(
        '<config name="demo">\n  <server host="127.0.0.1" port="8000"/>\n  <paths>\n    <path>/tmp</path>\n    <path>/var</path>\n  </paths>\n</config>'
    );
    const [mode, setMode] = React.useState<"xml2json" | "json2xml">("xml2json");
    const [rootName, setRootName] = React.useState("root");
    const [out, setOut] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        try {
            if (mode === "xml2json") {
                setOut(JSON.stringify(parseXmlToJson(input), null, 2));
                setError(null);
            } else {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(input);
                } catch {
                    throw new Error("Invalid JSON — paste a JSON tree (see the ⇄ button to flip).");
                }
                setOut(jsonToXml(parsed, rootName || "root"));
                setError(null);
            }
        } catch (err) {
            setOut("");
            setError((err as Error).message);
        }
    }, [input, mode, rootName]);

    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border overflow-hidden">
                    <Button
                        variant={mode === "xml2json" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 rounded-none px-3 text-xs"
                        onClick={() => setMode("xml2json")}
                    >
                        XML → JSON
                    </Button>
                    <Button
                        variant={mode === "json2xml" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 rounded-none px-3 text-xs"
                        onClick={() => setMode("json2xml")}
                    >
                        JSON → XML
                    </Button>
                </div>
                {mode === "json2xml" && (
                    <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">Root</Label>
                        <Input
                            value={rootName}
                            onChange={(e) => setRootName(e.target.value)}
                            className="h-7 w-24 font-mono text-xs"
                            aria-label="Root element name"
                        />
                    </div>
                )}
            </div>
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                wrap="off"
                className={area}
                aria-label="XML or JSON input"
            />
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <Out label={mode === "xml2json" ? "JSON (attributes as @keys)" : "XML"} text={out} minH={140}/>
        </div>
    );
}

/* ── Text Wrap / Reflow ─────────────────────────────────────────── */

export function WrapTool() {
    const [input, setInput] = React.useState(
        "The Praxis IDE packs a viewer, an editor, a runner and a toolbox into one offline app. Paste any paragraph and reflow it to the width you want — words stay intact, only the line breaks move."
    );
    const [width, setWidth] = React.useState(72);
    const [hard, setHard] = React.useState(true);

    const out = React.useMemo(() => {
        const paragraphs = input.replace(/\r\n/g, "\n").split(/\n{2,}/);
        return paragraphs
            .map((para) => {
                const words = para.split(/\s+/).filter(Boolean);
                const lines: string[] = [];
                let line = "";
                for (const w of words) {
                    if (line && (line + " " + w).length > width) {
                        lines.push(line);
                        line = w;
                    } else line = line ? `${line} ${w}` : w;
                }
                if (line) lines.push(line);
                return lines.join("\n");
            })
            .join("\n\n");
    }, [input, width]);

    const truncated = React.useMemo(() => {
        if (!hard) return "";
        const longWords = input.split(/\s+/).filter((w) => w.length > width);
        if (!longWords.length) return "";
        return `Long words left intact (longest ${Math.max(...longWords.map((w) => w.length))} chars > width ${width}).`;
    }, [input, width, hard]);

    return (
        <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Width</Label>
                <Input
                    type="number"
                    min={20}
                    max={200}
                    value={width}
                    onChange={(e) => setWidth(Math.min(200, Math.max(20, parseInt(e.target.value || "72", 10) || 72)))}
                    className="h-8 w-20 font-mono text-xs"
                    aria-label="Wrap width in characters"
                />
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setHard(!hard)}>
                    {hard ? "Keep Long Words" : "Break Long Words"}
                </Button>
            </div>
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                wrap="soft"
                className={area}
                aria-label="Text to reflow"
            />
            <Out label={`Reflowed to ${width} columns`} text={out} minH={110}/>
            {truncated && <p className="text-[11px] text-muted-foreground">{truncated}</p>}
        </div>
    );
}

/* ── Word Frequency ─────────────────────────────────────────────── */

export function WordFreqTool() {
    const [input, setInput] = React.useState(
        "the quick brown fox jumps over the lazy dog — the dog barks and the fox runs, the fox runs fast"
    );
    const [top, setTop] = React.useState(15);
    const [caseFold, setCaseFold] = React.useState(true);

    const stats = React.useMemo(() => {
        const words = input
            .replace(/\r\n/g, "\n")
            .split(/[^A-Za-z0-9'’_-]+/)
            .filter(Boolean)
            .map((w) => (caseFold ? w.toLowerCase() : w));
        const counts = new Map<string, number>();
        for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
        const total = words.length;
        const unique = counts.size;
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const max = sorted[0]?.[1] ?? 1;
        const rows = sorted
            .slice(0, top)
            .map(([w, n], i) => {
                const pad = String(i + 1).padStart(2);
                const bar = "█".repeat(Math.max(1, Math.round((n / max) * 24)));
                return `${pad}  ${String(n).padStart(4)}  ${(n / total * 100).toFixed(1).padStart(5)}%  ${bar}  ${w}`;
            })
            .join("\n");
        const header = `${total} words · ${unique} unique · top ${Math.min(top, unique)}:\n`;
        return {header, rows, total, unique};
    }, [input, top, caseFold]);

    return (
        <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Top</Label>
                <Input
                    type="number"
                    min={5}
                    max={100}
                    value={top}
                    onChange={(e) => setTop(Math.min(100, Math.max(5, parseInt(e.target.value || "15", 10) || 15)))}
                    className="h-8 w-20 font-mono text-xs"
                    aria-label="Number of top words"
                />
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCaseFold(!caseFold)}>
                    {caseFold ? "Case-Folded" : "Case-Sensitive"}
                </Button>
            </div>
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                wrap="soft"
                className={area}
                aria-label="Text to count"
            />
            <Out label={`${stats.total} words · ${stats.unique} unique`} text={stats.header + stats.rows} minH={110}/>
        </div>
    );
}

/* ── Char Diff ───────────────────────────────────────────────────── */

export function CharDiffTool() {
    const [a, setA] = React.useState("The quick brown fox");
    const [b, setB] = React.useState("The quick BR0WN fox!");
    const [ignoreCase, setIgnoreCase] = React.useState(false);

    const out = React.useMemo(() => {
        const left = ignoreCase ? a.toLowerCase() : a;
        const right = ignoreCase ? b.toLowerCase() : b;
        // Common prefix / suffix trim, then a marker for the differing core.
        let s = 0;
        while (s < left.length && s < right.length && left[s] === right[s]) s++;
        let e = 0;
        while (
            e < left.length - s && e < right.length - s &&
            left[left.length - 1 - e] === right[right.length - 1 - e]
            ) e++;
        const coreA = a.slice(s, a.length - e);
        const coreB = b.slice(s, b.length - e);
        const same = coreA === coreB;
        const lines = [
            `same : ${s} lead + ${e} trail chars`,
            `diff : ${same ? "none — identical" : `${coreA.length} vs ${coreB.length} chars`}`,
            "",
            `A core: ${same ? "—" : JSON.stringify(coreA)}`,
            `B core: ${same ? "—" : JSON.stringify(coreB)}`,
            "",
            `A: ${JSON.stringify(a)}`,
            `B: ${JSON.stringify(b)}`,
            same ? "texts match" : "texts differ in the marked cores above",
        ];
        return lines.join("\n");
    }, [a, b, ignoreCase]);

    return (
        <div className="space-y-3 py-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIgnoreCase(!ignoreCase)}>
                {ignoreCase ? "Ignoring Case" : "Case-Sensitive"}
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Text A</Label>
                    <Textarea value={a} onChange={(e) => setA(e.target.value)} wrap="soft"
                              className={cn(area, "min-h-[70px]")} aria-label="Text A"/>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Text B</Label>
                    <Textarea value={b} onChange={(e) => setB(e.target.value)} wrap="soft"
                              className={cn(area, "min-h-[70px]")} aria-label="Text B"/>
                </div>
            </div>
            <Out label="Character-level diff" text={out} minH={90}/>
        </div>
    );
}

/* ── Unicode Inspector ──────────────────────────────────────────── */

export function UnicodeTool() {
    const [input, setInput] = React.useState("Praxis — Λ → 你好");
    const [offset, setOffset] = React.useState(0);

    const stats = React.useMemo(() => {
        const chars = Array.from(input);
        const slice = chars.slice(offset, offset + 12);
        const lines = slice
            .map((ch) => {
                const cp = ch.codePointAt(0) ?? 0;
                const utf8: number[] = [];
                for (const b of new TextEncoder().encode(ch)) utf8.push(b);
                const esc =
                    cp <= 0x1f || cp === 0x7f
                        ? "control"
                        : `U+${cp.toString(16).toUpperCase().padStart(4, "0")}${cp > 0xffff ? " (surrogate pair)" : ""}`;
                return (
                    `${JSON.stringify(ch).padEnd(8)} ${esc.padEnd(14)} dec:${String(cp).padStart(7)}  ` +
                    `UTF-8: ${utf8.map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ")}  ` +
                    `bytes:${utf8.length}`
                );
            })
            .join("\n");
        const totalCps = chars.reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
        return {lines, chars: chars.length, cps: totalCps, bytes: new TextEncoder().encode(input).length};
    }, [input, offset]);

    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={input}
                onChange={(e) => {
                    setInput(e.target.value);
                    setOffset(0);
                }}
                wrap="soft"
                className={area}
                aria-label="Text to inspect"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - 12))}>
                    ‹ Prev
                </Button>
                <span className="font-mono">
          {offset}–{Math.min(offset + 12, stats.chars)} / {stats.chars} chars · {stats.cps} code points · {stats.bytes} UTF-8 bytes
        </span>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset + 12 >= stats.chars}
                        onClick={() => setOffset(offset + 12)}>
                    Next ›
                </Button>
            </div>
            <Out label="Code points (12 per page)" text={stats.lines} minH={90}/>
        </div>
    );
}

/* ── Luhn Validator ──────────────────────────────────────────────── */

export function LuhnTool() {
    const [input, setInput] = React.useState("4539 1488 0343 6467");

    const out = React.useMemo(() => {
        const cleaned = input.replace(/[\s-]/g, "");
        if (!/^\d*$/.test(cleaned) || !cleaned) {
            return {ok: false, text: "Digits only (spaces and dashes are ignored)."};
        }
        let sum = 0;
        let alt = false;
        for (let i = cleaned.length - 1; i >= 0; i--) {
            let d = cleaned.charCodeAt(i) - 48;
            if (alt) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
            alt = !alt;
        }
        const ok = sum % 10 === 0;
        const kind = /^4/.test(cleaned) ? "Visa pattern" : /^5[1-5]/.test(cleaned) ? "Mastercard pattern" : /^3[47]/.test(cleaned) ? "Amex pattern" : /^6/.test(cleaned) ? "Discover/IMEI pattern" : "unknown issuer";
        return {
            ok,
            text: `Luhn checksum: ${ok ? "VALID ✓" : "INVALID ✗"}\nSum: ${sum} (mod 10 = ${sum % 10})\nLength: ${cleaned.length} digits\nPattern: ${kind}\n\nLuhn covers credit cards, IMEI and some national ID numbers — validity of the CHECKSUM, not of the account.`,
        };
    }, [input]);

    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                wrap="soft"
                className={area}
                aria-label="Number to check"
            />
            <Out label="Luhn check" text={out.text} minH={80}/>
        </div>
    );
}
