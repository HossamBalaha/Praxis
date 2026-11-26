"use client";

import * as React from "react";
import {
    Activity,
    AlertTriangle,
    Check,
    FileText,
    Loader2,
    Locate,
    RefreshCw,
    RotateCcw,
    Sparkles,
    TextQuote,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * DocstringStudio — two tabs over one dialog:
 *
 * GENERATE: pick a def/class (a small PURE parser in this file —
 * deliberately NOT imported from lib/python-symbols), see the parsed
 * signature, preview a generated docstring in the caller's chosen
 * style (google / numpy / sphinx) covering params / returns / raises
 * gleaned heuristically from the body, edit it live, optionally
 * "AI enrich" the argument descriptions through the host-supplied
 * onEnrichWithAI callback, then Apply to file — the new source (with
 * the docstring inserted at the right indentation, replacing an
 * existing one when present) is handed back through onApplyDocstring.
 *
 * COVERAGE REPORT: GET /api/docstring-coverage?folder=… → per-file
 * coverage bars + pct badges, the overall stat, and the missing
 * symbols list whose Jump button dispatches the `praxis:goto-line`
 * window event the editor listens for.
 */

type DocStyle = "google" | "numpy" | "sphinx";

// ─── the pure Python symbol parser (client-side, in-file) ───────────

interface PyParam {
    name: string;
    annotation: string | null;
    hasDefault: boolean;
    kind: "positional" | "vararg" | "kwvar";
}

interface PySymbol {
    /** Stable key — `${line}:${name}`. */
    key: string;
    name: string;
    /** Qualified label — "Class.method" for methods, plain name at top level. */
    qualName: string;
    kind: "def" | "async def" | "class";
    /** 1-based header start line. */
    line: number;
    /** 1-based line holding the header's terminating `:`. */
    headerEndLine: number;
    indent: number;
    indentStr: string;
    /** Leading whitespace of the first non-blank body line (fallback: +1 step). */
    bodyIndentStr: string;
    /** Full raw header (multi-line signatures joined to one line). */
    signature: string;
    params: PyParam[];
    isMethod: boolean;
    returnsAnnotation: string | null;
    /** `return <expr>` / `yield <expr>` seen in the body. */
    returnsValue: boolean;
    /** Unique exception names raised in the body (docstring lines skipped). */
    raises: string[];
    hasDocstring: boolean;
    /** 1-based inclusive range of the existing docstring (for replacement). */
    docRange: { start: number; end: number } | null;
    existingDocstring: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function numOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Leading-whitespace measurement with tabs expanded to 4 spaces. */
function indentParts(raw: string): { indentStr: string; indent: number } {
    const m = /^[\t ]*/.exec(raw);
    const indentStr = m ? m[0] : "";
    return {indentStr, indent: indentStr.replace(/\t/g, "    ").length};
}

/** 1-based line holding the header's `:` (paren/quote-aware scanner). */
function scanHeaderEnd(lines: string[], startIdx: number): number {
    let depth = 0;
    for (let j = startIdx; j < lines.length; j++) {
        const line = lines[j];
        let inStr: string | null = null;
        for (let c = 0; c < line.length; c++) {
            const ch = line[c];
            if (inStr !== null) {
                if (ch === inStr) inStr = null;
                continue;
            }
            if (ch === '"' || ch === "'") {
                inStr = ch;
                continue;
            }
            if (ch === "#") break; // comment tail — never part of the header
            if (ch === "(" || ch === "[" || ch === "{") {
                depth++;
                continue;
            }
            if (ch === ")" || ch === "]" || ch === "}") {
                depth--;
                continue;
            }
            if (ch === ":" && depth === 0) return j + 1;
        }
    }
    return startIdx + 1; // unterminated header — treat the first line as it
}

/** Text between the first `(` and its matching `)` (quote-aware). */
function extractParenInner(headerRaw: string, openIdx: number): string {
    let depth = 0;
    let inStr: string | null = null;
    for (let i = openIdx; i < headerRaw.length; i++) {
        const ch = headerRaw[i];
        if (inStr !== null) {
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inStr = ch;
            continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") {
            depth--;
            if (depth === 0) return headerRaw.slice(openIdx + 1, i);
        }
    }
    return headerRaw.slice(openIdx + 1);
}

/** Split a parameter list on TOP-LEVEL commas (nesting / strings respected). */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    let inStr: string | null = null;
    for (const ch of text) {
        if (inStr !== null) {
            cur += ch;
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inStr = ch;
            cur += ch;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") {
            depth++;
            cur += ch;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            depth--;
            cur += ch;
            continue;
        }
        if (ch === "," && depth === 0) {
            parts.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    if (cur.trim().length > 0) parts.push(cur);
    return parts;
}

function parseParams(inner: string): PyParam[] {
    const params: PyParam[] = [];
    for (const part of splitTopLevel(inner)) {
        const t = part.trim();
        if (t.length === 0) continue;
        if (t === "*" || t === "/") continue; // keyword-only / positional-only markers
        let kind: PyParam["kind"] = "positional";
        let body = t;
        if (body.startsWith("**")) {
            kind = "kwvar";
            body = body.slice(2).trim();
        } else if (body.startsWith("*")) {
            kind = "vararg";
            body = body.slice(1).trim();
        }
        // name : annotation = default (annotation and default both optional)
        const pm = /^([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*(?:=(.+))?$/.exec(body);
        if (!pm) continue;
        params.push({
            name: pm[1],
            annotation: pm[2] !== undefined ? pm[2].trim() : null,
            hasDefault: pm[3] !== undefined,
            kind,
        });
    }
    return params;
}

/** Parse every def/class in the buffer — the studio's symbol list. */
function parsePySymbols(source: string): PySymbol[] {
    const lines = source.split("\n");
    const out: PySymbol[] = [];
    const classStack: Array<{ name: string; indent: number }> = [];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("@")) continue;

        const m = /^(\s*)(async\s+def|def|class)\s+([A-Za-z_]\w*)/.exec(raw);
        if (!m) continue;
        const {indentStr, indent} = indentParts(raw);
        // Any symbol at this (or lower) indent closes the enclosing classes.
        while (classStack.length > 0 && classStack[classStack.length - 1].indent >= indent) classStack.pop();

        const kind: PySymbol["kind"] = m[2] === "class" ? "class" : m[2] === "async def" ? "async def" : "def";
        const name = m[3];
        const qualName = classStack.length > 0 ? `${classStack.map((c) => c.name).join(".")}.${name}` : name;
        if (kind === "class") classStack.push({name, indent});

        const headerEndLine = scanHeaderEnd(lines, i);
        const signature = lines
            .slice(i, headerEndLine)
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .join(" ");

        // ── params + return annotation (defs only) ──
        let params: PyParam[] = [];
        let returnsAnnotation: string | null = null;
        if (kind !== "class") {
            const headerRaw = lines.slice(i, headerEndLine).join("\n");
            const open = headerRaw.indexOf("(");
            if (open >= 0) params = parseParams(extractParenInner(headerRaw, open));
            const rm = /\)\s*->\s*(.+?)\s*:\s*$/.exec(signature);
            if (rm) returnsAnnotation = rm[1];
        }
        const first = params[0];
        const isMethod = kind !== "class" && (first?.name === "self" || first?.name === "cls");

        // ── body bounds: until the next non-blank line at indent <= header ──
        const bodyStartIdx = headerEndLine; // headerEndLine is 1-based == index AFTER the header
        let bodyEndIdx = lines.length;
        for (let j = bodyStartIdx; j < lines.length; j++) {
            const t = lines[j].trim();
            if (t.length === 0) continue;
            if (indentParts(lines[j]).indent <= indent) {
                bodyEndIdx = j;
                break;
            }
        }

        let bodyIndentStr = `${indentStr}    `;
        for (let j = bodyStartIdx; j < bodyEndIdx; j++) {
            if (lines[j].trim().length === 0) continue;
            const bi = /^[\t ]*/.exec(lines[j]);
            bodyIndentStr = bi ? bi[0] : `${indentStr}    `;
            break;
        }
        if (bodyIndentStr.length <= indentStr.length) bodyIndentStr = `${indentStr}    `;

        // ── existing docstring (first body statement being a string literal) ──
        let hasDocstring = false;
        let docRange: { start: number; end: number } | null = null;
        let existingDocstring: string | null = null;
        for (let j = bodyStartIdx; j < bodyEndIdx; j++) {
            const t = lines[j].trim();
            if (t.length === 0 || t.startsWith("#")) continue;
            const q = t.startsWith('"""') ? '"""' : t.startsWith("'''") ? "'''" : null;
            if (q !== null) {
                hasDocstring = true;
                const startLine1 = j + 1;
                let endLine1 = j + 1;
                const rest = t.slice(q.length);
                const closeIdx = rest.indexOf(q);
                if (closeIdx >= 0) {
                    // One-liner docstring.
                    existingDocstring = rest.slice(0, closeIdx).trim();
                } else {
                    // The first line's remainder (after the opening quotes) leads
                    // the collected body — the old version dropped the first line.
                    const collected: string[] = [rest];
                    for (let k = j + 1; k < bodyEndIdx; k++) {
                        collected.push(lines[k]);
                        if (lines[k].indexOf(q) >= 0) {
                            endLine1 = k + 1;
                            break;
                        }
                    }
                    existingDocstring = collected.join("\n").replace(/\s*("""|''')\s*$/, "").trim();
                }
                docRange = {start: startLine1, end: endLine1};
            }
            break; // only the first statement decides
        }

        // ── heuristic body scan: raises + returns (docstring lines skipped) ──
        const raises: string[] = [];
        let returnsValue = false;
        for (let j = bodyStartIdx; j < bodyEndIdx; j++) {
            const lineNo1 = j + 1;
            if (docRange && lineNo1 >= docRange.start && lineNo1 <= docRange.end) continue;
            const t = lines[j].trim();
            if (t.startsWith("#")) continue;
            const rm = /^raise\s+([A-Za-z_][\w.]*)/.exec(t);
            if (rm && !raises.includes(rm[1])) raises.push(rm[1]);
            if (/^return\s+\S/.test(t) || /^yield\s+\S/.test(t)) returnsValue = true;
        }

        out.push({
            key: `${i + 1}:${qualName}`,
            name,
            qualName,
            kind,
            line: i + 1,
            headerEndLine,
            indent,
            indentStr,
            bodyIndentStr,
            signature,
            params,
            isMethod,
            returnsAnnotation,
            returnsValue,
            raises,
            hasDocstring,
            docRange,
            existingDocstring,
        });
    }
    return out;
}

// ─── docstring generation (three styles) ────────────────────────────

interface GenOpts {
    /** Overrides the summary line (defaults to the name / existing first line). */
    summary?: string;
    /** AI-supplied argument descriptions keyed by param name. */
    descriptions?: Map<string, string>;
}

function defaultSummary(sym: PySymbol): string {
    if (sym.existingDocstring !== null) {
        const first = sym.existingDocstring.split("\n").find((l) => l.trim().length > 0);
        if (first !== undefined) return first.trim();
    }
    const words = sym.name.replace(/^_+|_+$/g, "").split("_").filter(Boolean).join(" ");
    const capped = words.length > 0 ? `${words[0].toUpperCase()}${words.slice(1)}` : sym.name;
    return sym.kind === "class" ? `${capped} object.` : `${capped}.`;
}

function paramDesc(name: string, descriptions?: Map<string, string>): string {
    return descriptions?.get(name) ?? `Description of ${name}.`;
}

function returnsDesc(): string {
    return "Description of the return value.";
}

function raiseDesc(): string {
    return "If the operation cannot proceed.";
}

/** Build the docstring body (no outer quotes, no base indent) for the style. */
function generateDocstring(sym: PySymbol, style: DocStyle, opts: GenOpts = {}): string {
    const summary = opts.summary ?? defaultSummary(sym);
    // self / cls never appear in method docstrings.
    const docParams = sym.isMethod
        ? sym.params.filter((p) => p.name !== "self" && p.name !== "cls")
        : sym.params;
    // `-> None` with no returned value → the Returns section is omitted
    // (Google/Numpy style convention) — everything else keeps it.
    const noneOnly =
        sym.returnsAnnotation !== null && /^None\b/.test(sym.returnsAnnotation) && !sym.returnsValue;
    const showReturns =
        sym.kind !== "class" && !noneOnly && (sym.returnsValue || sym.returnsAnnotation !== null);

    const lines: string[] = [summary, ""];
    if (style === "google") {
        if (docParams.length > 0) {
            lines.push(
                "Args:",
                ...docParams.map(
                    (p) => `    ${p.name}${p.annotation ? ` (${p.annotation})` : ""}: ${paramDesc(p.name, opts.descriptions)}`
                ),
                ""
            );
        }
        if (showReturns) {
            lines.push("Returns:", `    ${sym.returnsAnnotation ? `${sym.returnsAnnotation}: ` : ""}${returnsDesc()}`, "");
        }
        if (sym.raises.length > 0) {
            lines.push("Raises:", ...sym.raises.map((e) => `    ${e}: ${raiseDesc()}`), "");
        }
    } else if (style === "numpy") {
        if (docParams.length > 0) {
            lines.push("Parameters", "----------");
            for (const p of docParams) {
                lines.push(p.annotation ? `${p.name} : ${p.annotation}` : p.name);
                lines.push(`    ${paramDesc(p.name, opts.descriptions)}`);
            }
            lines.push("");
        }
        if (showReturns) {
            lines.push("Returns", "-------", sym.returnsAnnotation ?? "value", `    ${returnsDesc()}`, "");
        }
        if (sym.raises.length > 0) {
            lines.push("Raises", "------");
            for (const e of sym.raises) {
                lines.push(e, `    ${raiseDesc()}`);
            }
            lines.push("");
        }
    } else {
        // sphinx
        for (const p of docParams) {
            lines.push(`:param ${p.name}: ${paramDesc(p.name, opts.descriptions)}`);
            if (p.annotation) lines.push(`:type ${p.name}: ${p.annotation}`);
        }
        if (showReturns) {
            lines.push(`:returns: ${returnsDesc()}`);
            if (sym.returnsAnnotation) lines.push(`:rtype: ${sym.returnsAnnotation}`);
        }
        for (const e of sym.raises) {
            lines.push(`:raises ${e}: ${raiseDesc()}`);
        }
        lines.push("");
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
}

/**
 * Pull "name: description" (or em-dash) pairs out of the AI's reply.
 * No recognizable pairs → the host returned a full docstring verbatim.
 */
function parseParamDescriptions(text: string, paramNames: string[]): Map<string, string> {
    const out = new Map<string, string>();
    const allowed = new Set(paramNames);
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim().replace(/^[-*•]\s*/, "");
        const m = /^`?([A-Za-z_]\w*)`?\s*[:\u2013\u2014]\s+(.+)$/.exec(line);
        if (m && allowed.has(m[1])) out.set(m[1], m[2].trim());
    }
    return out;
}

// ─── coverage contract ───────────────────────────────────────────────

interface CoverageMissing {
    name: string;
    kind: string;
    line: number;
}

interface CoverageFile {
    file: string;
    total: number;
    documented: number;
    pct: number;
    missing: CoverageMissing[];
}

interface CoverageData {
    files: CoverageFile[];
    overall: { total: number; documented: number; pct: number };
}

function parseCoverageResponse(json: unknown): { data?: CoverageData; error?: string } {
    const r = asRecord(json);
    if (!r) return {error: "Malformed response"};
    if (r.ok !== true) {
        return {error: typeof r.error === "string" ? r.error : "Coverage scan failed"};
    }
    const files: CoverageFile[] = Array.isArray(r.files)
        ? r.files
            .map((f): CoverageFile | null => {
                const rec = asRecord(f);
                if (!rec || typeof rec.file !== "string") return null;
                const missing: CoverageMissing[] = Array.isArray(rec.missing)
                    ? rec.missing
                        .map((m): CoverageMissing | null => {
                            const mr = asRecord(m);
                            if (!mr || typeof mr.name !== "string") return null;
                            return {
                                name: mr.name,
                                kind: typeof mr.kind === "string" ? mr.kind : "",
                                line: numOr(mr.line, 0),
                            };
                        })
                        .filter((m): m is CoverageMissing => m !== null)
                    : [];
                return {
                    file: rec.file,
                    total: numOr(rec.total, 0),
                    documented: numOr(rec.documented, 0),
                    pct: numOr(rec.pct, 0),
                    missing,
                };
            })
            .filter((f): f is CoverageFile => f !== null)
        : [];
    const overallRec = asRecord(r.overall);
    const overall = {
        total: numOr(overallRec?.total, 0),
        documented: numOr(overallRec?.documented, 0),
        pct: numOr(overallRec?.pct, 0),
    };
    return {data: {files, overall}};
}

// ─── small shared UI bits ────────────────────────────────────────────

function pctBadge(pct: number): string {
    return pct >= 80
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : pct >= 50
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-red-500/15 text-red-700 dark:text-red-300";
}

function pctBar(pct: number): string {
    return pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
}

function clampPct(pct: number): number {
    return Math.max(0, Math.min(100, Math.round(pct)));
}

function CoverageSkeleton() {
    return (
        <div className="space-y-3" aria-hidden="true">
            <div className="rounded-md border p-4 flex items-center gap-4">
                <Skeleton className="h-8 w-14 shrink-0"/>
                <Skeleton className="h-2 flex-1"/>
                <Skeleton className="h-3 w-28 shrink-0"/>
            </div>
            <div className="rounded-md border divide-y divide-border/60">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="px-3 py-2.5 space-y-2">
                        <Skeleton className="h-3.5" style={{width: `${46 + ((i * 13) % 40)}%`}}/>
                        <Skeleton className="h-1.5 w-full"/>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── component ──────────────────────────────────────────────────────

export function DocstringStudio({
                                    open,
                                    onOpenChange,
                                    folderSlug,
                                    fileName,
                                    code,
                                    style,
                                    onApplyDocstring,
                                    onEnrichWithAI,
                                }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folderSlug: string;
    /** Accepted for signature parity with the other workbench dialogs — the
     * coverage endpoint is folder-scoped and generation works from the buffer,
     * so nothing needs the file slug yet (reserved for per-file operations). */
    fileSlug: string;
    fileName: string;
    code?: string;
    style: DocStyle;
    onApplyDocstring: (newCode: string) => void;
    onEnrichWithAI: (funcName: string, signature: string) => Promise<string>;
}) {
    const {toast} = useToast();
    const [tab, setTab] = React.useState<"generate" | "coverage">("generate");
    const [symbolKey, setSymbolKey] = React.useState<string | null>(null);
    const [preview, setPreview] = React.useState("");
    const [aiBusy, setAiBusy] = React.useState(false);
    const [coverage, setCoverage] = React.useState<CoverageData | null>(null);
    const [coverageLoading, setCoverageLoading] = React.useState(false);
    const [coverageError, setCoverageError] = React.useState<string | null>(null);
    const [coverageNonce, setCoverageNonce] = React.useState(0);

    const symbols = React.useMemo(() => (code !== undefined ? parsePySymbols(code) : []), [code]);
    const current = React.useMemo(
        () => symbols.find((s) => s.key === symbolKey) ?? null,
        [symbols, symbolKey]
    );

    // Keep a valid selection (file switch / apply shifted the keys).
    React.useEffect(() => {
        if (symbols.length === 0) {
            if (symbolKey !== null) setSymbolKey(null);
            return;
        }
        if (symbolKey === null || !symbols.some((s) => s.key === symbolKey)) {
            setSymbolKey(symbols[0].key);
        }
    }, [symbols, symbolKey]);

    // Fresh open → reset the transient state.
    React.useEffect(() => {
        if (open) {
            setSymbolKey(null);
            setPreview("");
            setAiBusy(false);
            setTab("generate");
        }
    }, [open]);

    // Symbol / style switch → regenerate the preview from the analysis.
    React.useEffect(() => {
        setPreview(current ? generateDocstring(current, style) : "");
        setAiBusy(false);
    }, [current, style]);

    // ── coverage fetch (only while its tab is showing) ──
    React.useEffect(() => {
        if (!open || tab !== "coverage") return;
        let cancelled = false;
        setCoverageLoading(true);
        setCoverageError(null);
        void (async () => {
            try {
                const res = await fetch(
                    `/api/docstring-coverage?folder=${encodeURIComponent(folderSlug)}`,
                    {cache: "no-store"}
                );
                const json: unknown = await res.json();
                if (cancelled) return;
                const parsed = parseCoverageResponse(json);
                if (!res.ok || parsed.error !== undefined || !parsed.data) {
                    setCoverageError(parsed.error ?? `HTTP ${res.status}`);
                    setCoverage(null);
                } else {
                    setCoverage(parsed.data);
                }
            } catch (err) {
                if (!cancelled) setCoverageError((err as Error).message);
            } finally {
                if (!cancelled) setCoverageLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, tab, folderSlug, coverageNonce]);

    // ── AI enrich — host supplies the call; pairs merge, full text drops in ──
    const enrich = async () => {
        if (!current || aiBusy) return;
        setAiBusy(true);
        try {
            const ai = await onEnrichWithAI(current.name, current.signature);
            const text = typeof ai === "string" ? ai : "";
            if (text.trim().length === 0) {
                toast({title: "AI enrich returned no text", variant: "warning"});
                return;
            }
            const pairs = parseParamDescriptions(
                text,
                current.params.map((p) => p.name)
            );
            if (pairs.size === 0) {
                // No recognizable pairs — the host sent a full docstring: use verbatim.
                setPreview(text.trim());
            } else {
                // Deterministic regeneration keeps all three styles consistent.
                setPreview(generateDocstring(current, style, {descriptions: pairs}));
            }
        } catch (err) {
            toast({
                title: "AI enrich failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setAiBusy(false);
        }
    };

    // ── apply: build the new source with the docstring inserted / replaced ──
    const apply = () => {
        if (code === undefined) {
            toast({
                title: "Cannot apply the docstring",
                description: "No editor buffer — open the file first.",
                variant: "destructive",
            });
            return;
        }
        if (!current) {
            toast({title: "Pick a symbol first", variant: "warning"});
            return;
        }
        const body = preview.trim();
        if (body.length === 0) {
            toast({title: "The docstring preview is empty", variant: "warning"});
            return;
        }
        // One indent step under the def (the body's own indent when deeper).
        const indentStr =
            current.bodyIndentStr.length > current.indentStr.length ? current.bodyIndentStr : `${current.indentStr}    `;
        const docLines = body.split("\n");
        const newDoc = [
            `${indentStr}"""${docLines[0]}`,
            ...docLines.slice(1).map((l) => (l.trim().length > 0 ? `${indentStr}${l}` : "")),
            `${indentStr}"""`,
        ];
        const all = code.split("\n");
        if (current.hasDocstring && current.docRange) {
            // Replace the existing docstring's whole line range.
            all.splice(current.docRange.start - 1, current.docRange.end - current.docRange.start + 1, ...newDoc);
        } else {
            // Insert right after the def/class header.
            all.splice(current.headerEndLine, 0, ...newDoc);
        }
        onApplyDocstring(all.join("\n"));
        toast({
            title: "Docstring applied",
            description: `${current.qualName} — ${style} style${current.hasDocstring ? " (replaced the existing docstring)" : ""}.`,
        });
    };

    /** The editor's goto-line listener gets the line through this event. */
    const jumpToLine = (line: number) => {
        try {
            window.dispatchEvent(new CustomEvent("praxis:goto-line", {detail: {line}}));
        } catch {
            /* older browsers */
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <TextQuote className="size-4 text-violet-500"/>
                        Docstring studio — {fileName}
                    </DialogTitle>
                    <DialogDescription>
                        Generate {style}-style docstrings from parsed signatures, enrich argument descriptions with AI,
                        and audit project-wide coverage.
                    </DialogDescription>
                </DialogHeader>

                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v === "coverage" ? "coverage" : "generate")}
                    className="flex flex-col min-h-0 flex-1 gap-3"
                >
                    <TabsList className="self-start">
                        <TabsTrigger value="generate" className="text-xs gap-1.5">
                            <FileText className="size-3.5"/> Generate
                        </TabsTrigger>
                        <TabsTrigger value="coverage" className="text-xs gap-1.5">
                            <Activity className="size-3.5"/> Coverage report
                        </TabsTrigger>
                    </TabsList>

                    {/* ── GENERATE tab ── */}
                    <TabsContent value="generate" className="flex flex-col gap-3 min-h-0">
                        {symbols.length === 0 ? (
                            <div
                                className="rounded-md border flex flex-col items-center justify-center gap-1.5 py-12 px-8 text-center">
                                <TextQuote className="size-5 text-muted-foreground/50"/>
                                <p className="text-xs text-muted-foreground">
                                    {code === undefined
                                        ? "No editor buffer — open a Python file to generate docstrings."
                                        : "No defs or classes found in this file."}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* symbol pick + style badge */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Select value={symbolKey ?? undefined} onValueChange={setSymbolKey}>
                                        <SelectTrigger
                                            size="sm"
                                            className="h-8 text-xs font-mono flex-1 min-w-52"
                                            aria-label="Pick a def or class"
                                        >
                                            <SelectValue placeholder="Pick a def or class…"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {symbols.map((s) => (
                                                <SelectItem key={s.key} value={s.key} className="text-xs font-mono">
                          <span className={cn(s.kind === "class" && "text-amber-600 dark:text-amber-300")}>
                            {s.kind}
                          </span>{" "}
                                                    {s.qualName}
                                                    <span
                                                        className="text-[10px] text-muted-foreground"> L{s.line}</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Badge variant="secondary" className="text-[10px] shrink-0">
                                        {symbols.length} symbols
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] shrink-0">
                                        {style} style
                                    </Badge>
                                </div>

                                {/* parsed signature */}
                                {current && (
                                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                                        <pre
                                            className="whitespace-pre-wrap break-all font-mono text-xs">{current.signature}</pre>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            <Badge variant="secondary" className="text-[9px]">
                                                {current.isMethod ? "method" : current.kind}
                                            </Badge>
                                            {current.params.length > 0 && (
                                                <Badge variant="secondary" className="text-[9px]">
                                                    {current.params.length} param{current.params.length === 1 ? "" : "s"}
                                                </Badge>
                                            )}
                                            {current.returnsAnnotation !== null && (
                                                <Badge variant="outline"
                                                       className="text-[9px]">→ {current.returnsAnnotation}</Badge>
                                            )}
                                            {current.returnsValue && (
                                                <Badge variant="outline" className="text-[9px]">returns a value</Badge>
                                            )}
                                            {current.raises.length > 0 && (
                                                <Badge variant="outline"
                                                       className="text-[9px] border-amber-500/30 text-amber-700 dark:text-amber-300">
                                                    raises {current.raises.length}
                                                </Badge>
                                            )}
                                            {current.hasDocstring && (
                                                <Badge variant="outline"
                                                       className="text-[9px] border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                                                    existing docstring
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* preview + actions */}
                                <div className="flex flex-col gap-1.5">
                                    <label
                                        htmlFor="docstring-preview"
                                        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                                    >
                                        Generated docstring preview
                                    </label>
                                    <textarea
                                        id="docstring-preview"
                                        value={preview}
                                        onChange={(e) => setPreview(e.target.value)}
                                        className="h-44 w-full rounded-md border bg-muted/30 p-3 font-mono text-xs resize-y focus-visible:outline-none focus-visible:ring-1"
                                        aria-label="Docstring preview — editable"
                                        spellCheck={false}
                                        placeholder="Pick a symbol to generate its docstring…"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs gap-1"
                                            onClick={() => current && setPreview(generateDocstring(current, style))}
                                            disabled={!current}
                                            title="Re-roll the docstring from the parsed analysis (discards edits)"
                                        >
                                            <RotateCcw className="size-3.5"/> Regenerate
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs gap-1"
                                            onClick={() => void enrich()}
                                            disabled={!current || aiBusy}
                                            title="Fill argument descriptions through the host's AI call and merge them into the preview"
                                        >
                                            {aiBusy ? (
                                                <Loader2 className="size-3.5 animate-spin"/>
                                            ) : (
                                                <Sparkles className="size-3.5"/>
                                            )}
                                            AI enrich
                                        </Button>
                                        <div className="flex-1"/>
                                        <Button
                                            size="sm"
                                            className="h-8 text-xs gap-1"
                                            onClick={apply}
                                            disabled={!current || code === undefined || preview.trim().length === 0}
                                            title={
                                                current?.hasDocstring
                                                    ? "Replace the existing docstring in the buffer via onApplyDocstring"
                                                    : "Insert the docstring under the def (correctly indented) via onApplyDocstring"
                                            }
                                        >
                                            <Check className="size-3.5"/> Apply to file
                                        </Button>
                                    </div>
                                    {code !== undefined && (
                                        <p className="text-[10px] text-muted-foreground">
                                            Apply builds the new source and hands it to the host through
                                            onApplyDocstring — AI enrich
                                            merges "name: description" pairs into every style.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* ── COVERAGE tab ── */}
                    <TabsContent value="coverage" className="flex flex-col gap-3 min-h-0">
                        {coverageLoading ? (
                            <CoverageSkeleton/>
                        ) : coverageError !== null ? (
                            <div
                                className="rounded-md border flex flex-col items-center justify-center gap-1.5 py-12 px-8 text-center">
                                <AlertTriangle className="size-5 text-red-500/70"/>
                                <p className="text-xs text-red-600 dark:text-red-400">{coverageError}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    onClick={() => setCoverageNonce((n) => n + 1)}
                                >
                                    <RefreshCw className="size-3.5"/> Retry
                                </Button>
                            </div>
                        ) : !coverage || coverage.files.length === 0 ? (
                            <div
                                className="rounded-md border flex flex-col items-center justify-center gap-1.5 py-12 px-8 text-center">
                                <Activity className="size-5 text-muted-foreground/50"/>
                                <p className="text-xs text-muted-foreground">
                                    No Python files with symbols found in this project.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* overall stat */}
                                <div
                                    className="rounded-md border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <div className="shrink-0">
                                        <p className="text-2xl font-semibold leading-none tabular-nums">
                                            {coverage.overall.pct}%
                                        </p>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">overall</p>
                                    </div>
                                    <div
                                        className="flex-1 min-w-40 h-2 rounded-full bg-muted overflow-hidden"
                                        role="progressbar"
                                        aria-label="Overall docstring coverage"
                                        aria-valuenow={clampPct(coverage.overall.pct)}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                    >
                                        <div
                                            className={cn("h-full rounded-full", pctBar(coverage.overall.pct))}
                                            style={{width: `${clampPct(coverage.overall.pct)}%`}}
                                        />
                                    </div>
                                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {coverage.overall.documented} / {coverage.overall.total} documented
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs gap-1 shrink-0"
                                        onClick={() => setCoverageNonce((n) => n + 1)}
                                        title="Re-scan the project's docstrings"
                                    >
                                        <RefreshCw className="size-3.5"/> Refresh
                                    </Button>
                                </div>

                                {/* per-file bars + missing lists */}
                                <div
                                    className="rounded-md border divide-y divide-border/60 max-h-[42vh] overflow-y-auto"
                                    aria-label="Per-file docstring coverage"
                                >
                                    {coverage.files.map((f) => (
                                        <div key={f.file} className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate font-mono text-xs" title={f.file}>
                          {f.file}
                        </span>
                                                <span
                                                    className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {f.documented}/{f.total}
                        </span>
                                                <span
                                                    className={cn(
                                                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                                                        pctBadge(f.pct)
                                                    )}
                                                >
                          {f.pct}%
                        </span>
                                            </div>
                                            <div
                                                className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"
                                                role="progressbar"
                                                aria-label={`Coverage for ${f.file}`}
                                                aria-valuenow={clampPct(f.pct)}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                            >
                                                <div
                                                    className={cn("h-full rounded-full", pctBar(f.pct))}
                                                    style={{width: `${clampPct(f.pct)}%`}}
                                                />
                                            </div>
                                            {f.missing.length > 0 && (
                                                <details className="mt-1.5">
                                                    <summary
                                                        className="cursor-pointer select-none text-[10px] text-muted-foreground">
                                                        missing {f.missing.length}
                                                    </summary>
                                                    <ul className="mt-1 space-y-0.5 pl-1">
                                                        {f.missing.map((ms) => (
                                                            <li
                                                                key={`${ms.name}-${ms.line}`}
                                                                className="flex items-center gap-2 py-0.5"
                                                            >
                                                                <span
                                                                    className="min-w-0 truncate font-mono text-[11px]">{ms.name}</span>
                                                                <span
                                                                    className="shrink-0 rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">
                                  {ms.kind}
                                </span>
                                                                <span
                                                                    className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                  L{ms.line}
                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 shrink-0 px-1.5 text-[10px] gap-1"
                                                                    onClick={() => jumpToLine(ms.line)}
                                                                    title={`Jump to line ${ms.line}`}
                                                                    aria-label={`Jump to line ${ms.line} for ${ms.name}`}
                                                                >
                                                                    <Locate className="size-3"/> Jump
                                                                </Button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </details>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
