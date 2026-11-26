"use client";

import * as React from "react";
import {
    Copy,
    Database,
    Download,
    FileDown,
    History,
    Lightbulb,
    Loader2,
    PackageX,
    Play,
    Rows3,
    Timer,
    Trash2,
    Wand2,
} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Skeleton} from "@/components/ui/skeleton";
import {Textarea} from "@/components/ui/textarea";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,} from "@/components/ui/dropdown-menu";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {configuredInterpreter, interpreterQuery} from "@/lib/settings";

/**
 * the DuckDB SQL workbench — schema chips + SQL editor + read-only
 * results grid over /api/duckdb-query, for analytical files
 * (.parquet / .csv / .feather). Mirrors the SQLite workbench layout:
 * header (icon + file + engine badge), editor with Run (Ctrl/Cmd+Enter),
 * results table (zebra, mono cells, sticky header, horizontal scroll),
 * and a query history in localStorage.
 */

interface DuckDBWorkbenchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
}

interface SchemaColumn {
    name: string;
    type: string;
    sample: string;
}

interface SchemaInfo {
    table: string;
    columns: SchemaColumn[];
    rowCountApprox: number | null;
}

interface QueryResult {
    columns: string[];
    rows: unknown[][];
    totalNoticed?: number;
    truncated?: boolean;
    elapsedMs?: number;
}

/** Failure payload — `missing` marks the duckdb-not-installed case. */
interface RunFailure {
    error: string;
    missing?: string;
    hint?: string;
}

/** localStorage history of the last 8 queries (newest first). */
const HISTORY_KEY = `${STORAGE_PREFIX}.duckdb.history`;
const HISTORY_MAX = 8;

function loadHistory(): string[] {
    try {
        const raw = window.localStorage.getItem(HISTORY_KEY);
        return raw ? (JSON.parse(raw) as string[]).slice(0, HISTORY_MAX) : [];
    } catch {
        return [];
    }
}

function saveHistory(queries: string[]): void {
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(queries.slice(0, HISTORY_MAX)));
    } catch {
        /* quota — ignore */
    }
}

/** Mirrors the server's safe_name() so the default query can be seeded
 *  before the schema round-trip completes (ASCII-only guess; corrected
 *  from the GET response once it lands). */
function guessTableName(fileName: string): string {
    const stem = fileName.replace(/\.[^.]+$/, "");
    const cleaned = stem.replace(/[^0-9A-Za-z]/g, "_");
    if (!cleaned) return "t";
    if (/[0-9]/.test(cleaned[0])) return `t_${cleaned}`;
    return cleaned;
}

// ─── naive SQL formatter (pure, in-file) ─────────────────────────────

/** Words uppercased as whole words (clause starters included so the
 *  lowercase input also feeds the newline pass below). */
const KEYWORD_SET = new Set([
    "SELECT", "DISTINCT", "AS", "AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE",
    "BETWEEN", "CASE", "WHEN", "THEN", "ELSE", "END", "BY", "ON", "WITH",
    "COUNT", "SUM", "AVG", "MIN", "MAX", "OVER", "ASC", "DESC", "USING",
    "FROM", "WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "OFFSET", "UNION",
    "ALL", "FULL", "OUTER", "LEFT", "RIGHT", "INNER", "CROSS", "JOIN",
]);
/** Clause starters that get a newline before them. */
const CLAUSE_RE = /\b(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|UNION ALL|UNION|FULL OUTER JOIN|FULL JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|CROSS JOIN|JOIN)\b/g;

/** Naive keyword-uppercase + clause-newline formatter. No real parser —
 *  quoted literals are masked first so their contents are never
 *  rewritten. Good enough for readability, never a full pretty-printer. */
function formatSql(input: string): string {
    if (!input.trim()) return input;
    const quoted: string[] = [];
    let text = input.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, (m) => {
        quoted.push(m);
        return `\u0000${quoted.length - 1}\u0000`;
    });
    text = text.replace(/\s+/g, " ").trim();
    // uppercase whole words that are keywords
    text = text.replace(/[A-Za-z_]+/g, (word) => {
        const up = word.toUpperCase();
        return KEYWORD_SET.has(up) ? up : word;
    });
    // newline before major clauses (the leading one is trimmed below)
    text = text.replace(CLAUSE_RE, (m) => `\n${m}`);
    text = text.replace(/^\n+/, "");
    // restore the masked literals verbatim
    return text.replace(/\u0000(\d+)\u0000/g, (m, i) => quoted[Number(i)] ?? m);
}

// ─── export helpers (pure, in-file) ─────────────────────────────────

function csvQuote(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns: string[], rows: unknown[][]): string {
    return [columns.map(csvQuote).join(","), ...rows.map((r) => r.map(csvQuote).join(","))].join("\n");
}

function toJsonObjectArray(columns: string[], rows: unknown[][]): string {
    const objects = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
    return JSON.stringify(objects, null, 2);
}

function downloadTextBlob(fileName: string, text: string, mime: string): void {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

export function DuckDBWorkbench({open, onOpenChange, folderSlug, fileSlug, fileName}: DuckDBWorkbenchProps) {
    const {toast} = useToast();
    const [schema, setSchema] = React.useState<SchemaInfo | null>(null);
    const [schemaError, setSchemaError] = React.useState<string | null>(null);
    const [schemaMissing, setSchemaMissing] = React.useState(false);
    const [sql, setSql] = React.useState("");
    const [result, setResult] = React.useState<QueryResult | null>(null);
    const [failure, setFailure] = React.useState<RunFailure | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [history, setHistory] = React.useState<string[]>([]);
    /** the default query injected after the schema loads — replaced on a
     *  file switch unless the user typed something of their own. */
    const defaultSqlRef = React.useRef("");

    React.useEffect(() => {
        if (open) setHistory(loadHistory());
    }, [open]);

    // Schema inference whenever the dialog opens for a new file.
    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setSchema(null);
        setSchemaError(null);
        setSchemaMissing(false);
        setResult(null);
        setFailure(null);
        defaultSqlRef.current = "";
        setSql("");
        void (async () => {
            try {
                const res = await fetch(
                    `/api/duckdb-query?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}${interpreterQuery()}`
                );
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || json.ok !== true) {
                    if (json.missing) setSchemaMissing(true);
                    setSchemaError(json.error ?? json.hint ?? `HTTP ${res.status}`);
                    setSchema({table: guessTableName(fileName), columns: [], rowCountApprox: null});
                } else {
                    const info: SchemaInfo = {
                        table: typeof json.table === "string" ? json.table : guessTableName(fileName),
                        columns: Array.isArray(json.columns) ? (json.columns as SchemaColumn[]) : [],
                        rowCountApprox: typeof json.rowCountApprox === "number" ? json.rowCountApprox : null,
                    };
                    setSchema(info);
                    const d = `SELECT *\nFROM "${info.table}"\nLIMIT 100`;
                    defaultSqlRef.current = d;
                    setSql(d);
                }
            } catch (err) {
                if (!cancelled) setSchemaError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, fileSlug, fileName]);

    const runQuery = async (text?: string) => {
        const statement = (text ?? sql).trim();
        if (!statement || busy) return;
        setBusy(true);
        setFailure(null);
        setResult(null);
        try {
            const res = await fetch("/api/duckdb-query", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    sql: statement,
                    interpreter: configuredInterpreter(),
                }),
            });
            const json = await res.json();
            if (!res.ok || json.ok !== true) {
                setFailure({
                    error: json.error ?? json.hint ?? `HTTP ${res.status}`,
                    missing: json.missing,
                    hint: json.hint,
                });
            } else {
                setResult({
                    columns: (json.columns ?? []) as string[],
                    rows: (json.rows ?? []) as unknown[][],
                    totalNoticed: typeof json.totalNoticed === "number" ? json.totalNoticed : undefined,
                    truncated: json.truncated === true,
                    elapsedMs: typeof json.elapsedMs === "number" ? json.elapsedMs : undefined,
                });
                const next = [statement, ...history.filter((q) => q !== statement)].slice(0, HISTORY_MAX);
                setHistory(next);
                saveHistory(next);
            }
        } catch (err) {
            setFailure({error: (err as Error).message});
        } finally {
            setBusy(false);
        }
    };

    const copyText = async (text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({title: `${what} copied`});
        } catch {
            toast({title: "Copy failed", description: "Clipboard is unavailable.", variant: "destructive"});
        }
    };

    /** 3 quick examples referencing the inferred table (post-schema). */
    const examples = React.useMemo(() => {
        const table = schema?.table;
        if (!table) return [] as Array<{ label: string; sql: string }>;
        const firstCol = schema.columns[0]?.name ? `"${schema.columns[0].name}"` : null;
        const list: Array<{ label: string; sql: string }> = [
            {label: "Preview rows", sql: `SELECT *\nFROM "${table}"\nLIMIT 100`},
            {label: "Row count", sql: `SELECT COUNT(*) AS row_count\nFROM "${table}"`},
        ];
        if (firstCol) {
            list.push({
                label: "Top values",
                sql: `SELECT ${firstCol}, COUNT(*) AS n\nFROM "${table}"\nGROUP BY ${firstCol}\nORDER BY n DESC\nLIMIT 20`,
            });
        }
        return list;
    }, [schema]);

    const csvBaseName = `${fileName.replace(/\.[^.]+$/, "")}-query.csv`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col overflow-hidden gap-3">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 flex-wrap">
                        <Database className="size-4 text-emerald-500"/>
                        DuckDB Workbench — {fileName}
                        <Badge className="text-[10px] gap-1" variant="secondary">
                            <Database className="size-3"/> DuckDB
                        </Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Full analytical SQL (joins, window functions, CTEs) over the file loaded as table{" "}
                        <code className="font-mono text-[11px]">{schema ? `"${schema.table}"` : "…"}</code>
                        {schema?.rowCountApprox != null && (
                            <> · ~{schema.rowCountApprox.toLocaleString()} rows</>
                        )}
                        .
                    </DialogDescription>
                </DialogHeader>

                {/* scrollable body — the dialog frame itself never scrolls */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3" role="main"
                     aria-label="DuckDB workbench body">
                    {/* ── schema chip row (fetched on open; skeleton while loading) */}
                    <div
                        className="flex flex-wrap items-center gap-1.5 min-h-8"
                        aria-label="Inferred schema"
                        data-testid="duckdb-schema"
                    >
                        {schema === null && !schemaError && (
                            <>
                                <Skeleton className="h-6 w-24 rounded-md"/>
                                <Skeleton className="h-6 w-28 rounded-md"/>
                                <Skeleton className="h-6 w-20 rounded-md"/>
                                <Skeleton className="h-6 w-24 rounded-md"/>
                            </>
                        )}
                        {schemaError && !schemaMissing && (
                            <p className="text-xs text-red-600 dark:text-red-400">{schemaError}</p>
                        )}
                        {schemaMissing && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">Schema unavailable — duckdb is not
                                installed.</p>
                        )}
                        {schema?.columns.map((c) => (
                            <Badge
                                key={c.name}
                                variant="outline"
                                className="text-[10px] font-mono gap-1 max-w-56"
                                title={c.sample ? `sample: ${c.sample}` : `column ${c.name} (${c.type})`}
                            >
                                <span className="font-semibold truncate">{c.name}</span>
                                <span className="opacity-60 truncate">{c.type}</span>
                            </Badge>
                        ))}
                        {schema && schema.columns.length === 0 && !schemaError && (
                            <p className="text-xs text-muted-foreground">No columns inferred.</p>
                        )}
                    </div>

                    {/* ── missing-package card (schema load caught it too) */}
                    {schemaMissing && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3" role="alert">
                            <div className="flex items-center gap-2 flex-wrap">
                                <PackageX className="size-4 text-red-500 shrink-0"/>
                                <p className="text-xs text-muted-foreground flex-1 min-w-40">
                                    duckdb is not installed in the selected Python environment. Run:
                                </p>
                                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded select-all">pip
                                    install duckdb</code>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px] gap-1"
                                    onClick={() => void copyText("pip install duckdb", "Install command")}
                                    aria-label="Copy pip install duckdb"
                                >
                                    <Copy className="size-3"/> Copy
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── SQL editor */}
                    <Textarea
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                e.preventDefault();
                                void runQuery();
                            }
                        }}
                        placeholder={"SELECT *\nFROM …"}
                        aria-label="SQL statement"
                        className="min-h-[120px] font-mono text-[13px] bg-muted/30 resize-y"
                        spellCheck={false}
                    />

                    {/* ── editor toolbar: run / format / examples */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy || !sql.trim()}
                                onClick={() => void runQuery()}>
                            {busy ? <Loader2 className="size-3 animate-spin"/> : <Play className="size-3"/>}
                            Run (Ctrl+↵)
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            disabled={!sql.trim()}
                            onClick={() => {
                                setSql(formatSql(sql));
                                toast({title: "Formatted", description: "Naive keyword uppercase + clause newlines."});
                            }}
                            title="Uppercase keywords and newline before major clauses"
                        >
                            <Wand2 className="size-3"/> Format
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                                        disabled={examples.length === 0}>
                                    <Lightbulb className="size-3"/> Examples
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-2" align="start">
                                <p className="text-xs text-muted-foreground mb-1.5 px-1">Quick queries on table <span
                                    className="font-mono">{schema?.table}</span></p>
                                <div className="space-y-1">
                                    {examples.map((ex) => (
                                        <button
                                            key={ex.label}
                                            type="button"
                                            className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
                                            onClick={() => {
                                                setSql(ex.sql);
                                                toast({
                                                    title: "Example loaded",
                                                    description: `${ex.label} — press Run (Ctrl+↵).`
                                                });
                                            }}
                                        >
                                            <span className="block text-xs font-medium">{ex.label}</span>
                                            <span
                                                className="block text-[10px] font-mono text-muted-foreground truncate">{ex.sql.replace(/\n/g, " ")}</span>
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* ── error card + missing-package hint */}
                    {failure && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 space-y-2" role="alert">
                            <p className="text-xs text-red-600 dark:text-red-400 break-words font-mono">{failure.error}</p>
                            {failure.missing && (
                                <div className="rounded-md border bg-background/60 p-2 flex items-center gap-2">
                                    <PackageX className="size-4 text-red-500 shrink-0"/>
                                    <p className="text-xs text-muted-foreground flex-1">
                                        The Python interpreter needs the duckdb package. Run:
                                    </p>
                                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded select-all">pip
                                        install duckdb</code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-2 text-[10px] gap-1"
                                        onClick={() => void copyText("pip install duckdb", "Install command")}
                                        aria-label="Copy pip install duckdb"
                                    >
                                        <Copy className="size-3"/> Copy
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── results (read-only grid) */}
                    {busy && (
                        <div className="rounded-md border p-3 space-y-2" aria-busy="true" aria-label="Query running">
                            <Skeleton className="h-5 w-40"/>
                            <Skeleton className="h-4 w-full"/>
                            <Skeleton className="h-4 w-5/6"/>
                            <Skeleton className="h-4 w-4/6"/>
                        </div>
                    )}
                    {!busy && result && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="secondary" className="text-[10px] gap-1" title="Rows returned">
                                    <Rows3 className="size-3"/>
                                    {result.rows.length.toLocaleString()}
                                    {result.totalNoticed !== undefined && result.totalNoticed > result.rows.length
                                        ? ` of ~${result.totalNoticed.toLocaleString()}`
                                        : ""}
                                    {result.truncated ? " (capped at 1000)" : ""}
                                </Badge>
                                {result.elapsedMs !== undefined && (
                                    <Badge variant="outline" className="text-[10px] gap-1"
                                           title="Server-side elapsed time">
                                        <Timer className="size-3"/> {result.elapsedMs} ms
                                    </Badge>
                                )}
                                <div className="flex-1"/>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                                                disabled={result.rows.length === 0}>
                                            <Download className="size-3"/> Export
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={() => void copyText(toCsv(result.columns, result.rows), "CSV")}>
                                            <Copy className="size-3.5"/> Copy as CSV
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => void copyText(toJsonObjectArray(result.columns, result.rows), "JSON")}>
                                            <Copy className="size-3.5"/> Copy as JSON
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => downloadTextBlob(csvBaseName, toCsv(result.columns, result.rows), "text/csv")}>
                                            <FileDown className="size-3.5"/> Download .csv
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <div className="rounded-md border overflow-auto max-h-[32vh]">
                                {result.columns.length === 0 ? (
                                    <p className="text-xs text-muted-foreground p-3">Statement executed — no result
                                        set.</p>
                                ) : (
                                    <table className="w-full text-[13px] font-mono" role="grid"
                                           aria-rowcount={result.rows.length} aria-label="Query results">
                                        <thead className="sticky top-0 bg-muted">
                                        <tr className="[&>th]:border-b" role="row">
                                            <th className="w-10 text-right font-normal text-muted-foreground px-2 py-1 border-b whitespace-nowrap"
                                                aria-label="Row index">#
                                            </th>
                                            {result.columns.map((c) => (
                                                <th key={c} role="columnheader"
                                                    className="text-left font-medium px-2 py-1 border-b whitespace-nowrap">{c}</th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {result.rows.map((row, i) => (
                                            <tr key={i} role="row" aria-rowindex={i + 1}
                                                className={cn(i % 2 === 1 && "bg-muted/30")}>
                                                <td className="text-right text-muted-foreground tabular-nums select-none px-2 py-1 border-b border-border/40"
                                                    aria-label={`Row ${i + 1}`}>{i + 1}</td>
                                                {row.map((cell, j) => (
                                                    <td key={j} role="gridcell"
                                                        className="px-2 py-1 border-b border-border/40 whitespace-nowrap font-mono text-[13px]"
                                                        title={cell === null ? "NULL" : String(cell)}>
                                                        {cell === null ? <span
                                                            className="text-muted-foreground italic">NULL</span> : String(cell)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── history (last 8 queries, click to refill the editor) */}
                    {history.length > 0 && (
                        <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground flex items-center gap-1.5">
                                <History className="size-3"/> Recent queries ({history.length})
                            </summary>
                            <ul className="pl-3 space-y-1 py-1">
                                {history.slice(0, HISTORY_MAX).map((q) => (
                                    <li key={q} className="flex items-center gap-1.5 group">
                                        <button
                                            type="button"
                                            className="text-left font-mono text-[13px] hover:text-emerald-600 dark:hover:text-emerald-400 truncate flex-1"
                                            onClick={() => setSql(q)}
                                            title={q}
                                        >
                                            {q.slice(0, 90)}
                                        </button>
                                        <button
                                            type="button"
                                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"
                                            onClick={() => {
                                                const next = history.filter((h) => h !== q);
                                                setHistory(next);
                                                saveHistory(next);
                                            }}
                                            aria-label="Remove this query from history"
                                            title="Remove from history"
                                        >
                                            <Trash2 className="size-3"/>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
