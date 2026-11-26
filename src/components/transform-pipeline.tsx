"use client";

import * as React from "react";
import {Download, Filter, Loader2, Plus, Save, Trash2, Workflow} from "lucide-react";
import {Dialog, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ResizableDialogContent} from "@/components/ui/resizable-dialog";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {parseCsv, separatorForExt, stringifyCsv} from "@/lib/csv-io";
import {fileUrlFor, takePrefetched} from "@/lib/prefetch";

/**
 * chain filter / sort /
 * select / rename / group-by / pivot / join steps over the current
 * CSV with a live preview, then download the result as CSV or save it
 * back into the project as a new file. Everything runs client-side on
 * the loaded table — the join pulls a second CSV from the same folder.
 */

type FilterOp = "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "missing";
type Step =
    | { id: string; kind: "filter"; column: string; op: FilterOp; value: string }
    | { id: string; kind: "sort"; column: string; dir: "asc" | "desc" }
    | { id: string; kind: "select"; columns: string[] }
    | { id: string; kind: "rename"; from: string; to: string }
    | { id: string; kind: "group"; by: string; agg: "count" | "sum" | "mean" | "min" | "max"; column: string }
    | { id: string; kind: "pivot"; row: string; column: string; value: string }
    | { id: string; kind: "join"; fileSlug: string; fileName: string; leftKey: string; rightKey: string };

interface TransformPipelineProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** Every CSV/TSV in the same folder (for the join step). */
    siblingCsvs: Array<{ fileSlug: string; fileName: string }>;
}

let stepSeq = 0;
const nextId = () => `s${++stepSeq}`;

function toNumber(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.NaN;
}

/** Apply the pipeline to {headers, rows}; returns the transformed table. */
function applySteps(
    base: { headers: string[]; rows: string[][] },
    steps: Step[],
    joinTables: Map<string, { headers: string[]; rows: string[][] }>
): { headers: string[]; rows: string[][]; note?: string } {
    let {headers, rows} = base;
    for (const step of steps) {
        switch (step.kind) {
            case "filter": {
                const idx = headers.indexOf(step.column);
                if (idx >= 0) {
                    rows = rows.filter((r) => {
                        const cell = (r[idx] ?? "").trim();
                        const cellNum = toNumber(cell);
                        const valNum = toNumber(step.value);
                        switch (step.op) {
                            case "==":
                                return cellNum === valNum && cell !== "" ? true : cell === step.value;
                            case "!=":
                                return cellNum === valNum && cell !== "" ? false : cell !== step.value;
                            case ">":
                                return Number.isFinite(cellNum) && cellNum > valNum;
                            case "<":
                                return Number.isFinite(cellNum) && cellNum < valNum;
                            case ">=":
                                return Number.isFinite(cellNum) && cellNum >= valNum;
                            case "<=":
                                return Number.isFinite(cellNum) && cellNum <= valNum;
                            case "contains":
                                return cell.toLowerCase().includes(step.value.toLowerCase());
                            case "missing":
                                return cell === "" || cell === "NaN" || cell === "None" || cell === "null";
                        }
                    });
                }
                break;
            }
            case "sort": {
                const idx = headers.indexOf(step.column);
                if (idx >= 0) {
                    const dir = step.dir === "asc" ? 1 : -1;
                    rows = [...rows].sort((a, b) => {
                        const av = a[idx] ?? "";
                        const bv = b[idx] ?? "";
                        const an = toNumber(av);
                        const bn = toNumber(bv);
                        if (Number.isFinite(an) && Number.isFinite(bn) && av.trim() !== "" && bv.trim() !== "") return (an - bn) * dir;
                        return av.localeCompare(bv) * dir;
                    });
                }
                break;
            }
            case "select": {
                const idxs = step.columns.map((c) => headers.indexOf(c)).filter((i) => i >= 0);
                if (idxs.length > 0) {
                    headers = idxs.map((i) => headers[i]);
                    rows = rows.map((r) => idxs.map((i) => r[i] ?? ""));
                }
                break;
            }
            case "rename": {
                const idx = headers.indexOf(step.from);
                if (idx >= 0 && step.to.trim()) {
                    headers = headers.map((h) => (h === step.from ? step.to.trim() : h));
                }
                break;
            }
            case "group": {
                const byIdx = headers.indexOf(step.by);
                const colIdx = headers.indexOf(step.column);
                if (byIdx >= 0) {
                    const groups = new Map<string, string[]>();
                    for (const r of rows) {
                        const key = r[byIdx] ?? "";
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)!.push(r[colIdx] ?? "");
                    }
                    const aggCol = step.agg === "count" ? `count(${step.by})` : `${step.agg}(${step.column})`;
                    headers = [step.by, aggCol];
                    rows = [...groups.entries()].map(([key, vals]) => {
                        const nums = vals.map(toNumber).filter((n) => Number.isFinite(n));
                        let out: string;
                        switch (step.agg) {
                            case "count":
                                out = String(vals.length);
                                break;
                            case "sum":
                                out = String(nums.reduce((a, b) => a + b, 0));
                                break;
                            case "mean":
                                out = nums.length > 0 ? String(nums.reduce((a, b) => a + b, 0) / nums.length) : "";
                                break;
                            case "min":
                                out = nums.length > 0 ? String(Math.min(...nums)) : "";
                                break;
                            case "max":
                                out = nums.length > 0 ? String(Math.max(...nums)) : "";
                                break;
                        }
                        return [key, out];
                    });
                }
                break;
            }
            case "pivot": {
                const rowIdx = headers.indexOf(step.row);
                const colIdx = headers.indexOf(step.column);
                const valIdx = headers.indexOf(step.value);
                if (rowIdx >= 0 && colIdx >= 0 && valIdx >= 0) {
                    const colKeys: string[] = [];
                    for (const r of rows) {
                        const c = r[colIdx] ?? "";
                        if (!colKeys.includes(c)) colKeys.push(c);
                    }
                    const grouped = new Map<string, string[]>();
                    for (const r of rows) {
                        const key = r[rowIdx] ?? "";
                        if (!grouped.has(key)) grouped.set(key, colKeys.map(() => ""));
                        const gi = colKeys.indexOf(r[colIdx] ?? "");
                        if (gi >= 0) grouped.get(key)![gi] = r[valIdx] ?? "";
                    }
                    headers = [step.row, ...colKeys];
                    rows = [...grouped.entries()].map(([k, vals]) => [k, ...vals]);
                }
                break;
            }
            case "join": {
                const right = joinTables.get(step.fileSlug);
                const li = headers.indexOf(step.leftKey);
                if (right && li >= 0) {
                    const ri = right.headers.indexOf(step.rightKey);
                    if (ri >= 0) {
                        const rightBy = new Map<string, string[]>();
                        for (const r of right.rows) rightBy.set(r[ri] ?? "", r);
                        const rightCols = right.headers.filter((h, i) => i !== ri && !headers.includes(h));
                        const newHeaders = [...headers, ...rightCols];
                        rows = rows.map((r) => {
                            const match = rightBy.get(r[li] ?? "");
                            const extra = rightCols.map((c) => {
                                const idx = right.headers.indexOf(c);
                                return match ? (match[idx] ?? "") : "";
                            });
                            return [...r, ...extra];
                        });
                        headers = newHeaders;
                    }
                }
                break;
            }
        }
    }
    return {headers, rows};
}

export function TransformPipeline({
                                      open,
                                      onOpenChange,
                                      folderSlug,
                                      fileSlug,
                                      fileName,
                                      siblingCsvs
                                  }: TransformPipelineProps) {
    const {toast} = useToast();
    const [text, setText] = React.useState<string | null>(null);
    const [joinTexts, setJoinTexts] = React.useState<Map<string, string>>(new Map());
    const [steps, setSteps] = React.useState<Step[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [saveName, setSaveName] = React.useState("");

    React.useEffect(() => {
        if (!open) {
            setSteps([]);
            setSaveName("");
            return;
        }
        let cancelled = false;
        setText(null);
        setError(null);
        void (async () => {
            try {
                const url = fileUrlFor(folderSlug, fileSlug);
                const res = await (takePrefetched(url) ?? fetch(url));
                // /api/file returns RAW bytes — res.json threw
                // "JSON.parse: unexpected character…" on every CSV/TSV.
                const body = await res.text();
                if (cancelled) return;
                if (!res.ok) setError(`HTTP ${res.status}`);
                else setText(body);
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, fileSlug]);

    // TSV files split on tabs, and the exported file keeps
    //  the source separator.
    const sep = React.useMemo(
        () => separatorForExt(fileName.slice(fileName.lastIndexOf("."))),
        [fileName]
    );
    const base = React.useMemo(() => (text ? parseCsv(text, sep) : null), [text, sep]);
    const joinTables = React.useMemo(() => {
        const map = new Map<string, { headers: string[]; rows: string[][] }>();
        for (const [slug, t] of joinTexts) map.set(slug, parseCsv(t, sep));
        return map;
    }, [joinTexts, sep]);

    // Lazily fetch a sibling CSV the first time a join step picks it.
    const ensureJoinTable = async (slug: string) => {
        if (joinTexts.has(slug)) return;
        try {
            const url = fileUrlFor(folderSlug, slug);
            const res = await (takePrefetched(url) ?? fetch(url));
            // raw text, not JSON.
            const body = await res.text();
            if (res.ok) {
                setJoinTexts((prev) => new Map(prev).set(slug, body));
            }
        } catch {
            /* the join just won't match — leave empty */
        }
    };

    const result = React.useMemo(
        () => (base ? applySteps(base, steps, joinTables) : null),
        [base, steps, joinTables]
    );

    const update = (id: string, patch: Partial<Step>) => {
        setSteps((prev) => prev.map((s) => (s.id === id ? ({...s, ...patch} as Step) : s)));
    };

    const downloadCsv = () => {
        if (!result) return;
        const csv = stringifyCsv({headers: result.headers, rows: result.rows}, sep);
        const blob = new Blob([csv], {type: sep === "\t" ? "text/tab-separated-values;charset=utf-8" : "text/csv;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName.replace(/\.[^.]+$/, "")}-transformed${sep === "\t" ? ".tsv" : ".csv"}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const saveToProject = async () => {
        if (!result) return;
        const ext = sep === "\t" ? ".tsv" : ".csv";
        const name = (saveName || `${fileName.replace(/\.[^.]+$/, "")}-transformed${ext}`).trim();
        const csv = stringifyCsv({headers: result.headers, rows: result.rows}, sep);
        try {
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, files: [{name, content: csv, encoding: "utf-8"}]}),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            toast({
                title: `Saved ${name}`,
                description: "The transformed table is now in the folder.",
                variant: "success"
            });
        } catch (err) {
            toast({title: "Save failed", description: (err as Error).message, variant: "destructive"});
        }
    };

    const headers = base?.headers ?? [];
    const stepIcon = (kind: Step["kind"]) => {
        switch (kind) {
            case "filter":
                return <Filter className="size-3.5"/>;
            default:
                return <Workflow className="size-3.5"/>;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* — defaultH ≥ 9000 means FIT THE VIEWPORT (88dvh
at mount); the later drags persist per dialog id, so
the next open starts at that size. */}
            <ResizableDialogContent id="transform-pipeline" defaultW={1280} defaultH={9999} className="overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Workflow className="size-4 text-emerald-500"/>
                        Transform Pipeline — {fileName}
                    </DialogTitle>
                    <DialogDescription>
                        Chain steps over the loaded table with a live preview; download the result or save it into
                        the project.
                    </DialogDescription>
                </DialogHeader>

                {error &&
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{error}</p>}
                {!base && !error && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-6">
                        <Loader2 className="size-3.5 animate-spin"/> Reading {fileName}…
                    </div>
                )}

                {base && (
                    <div className="space-y-3">
                        {/* add-step row */}
                        <div className="flex flex-wrap gap-1.5">
                            {(["filter", "sort", "select", "rename", "group", "pivot"] as const).map((kind) => (
                                <Button
                                    key={kind}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 text-[11px]"
                                    onClick={() => {
                                        const column = headers[0] ?? "";
                                        const col2 = headers[1] ?? headers[0] ?? "";
                                        if (kind === "filter") setSteps((p) => [...p, {
                                            id: nextId(),
                                            kind,
                                            column,
                                            op: "==",
                                            value: ""
                                        }]);
                                        if (kind === "sort") setSteps((p) => [...p, {
                                            id: nextId(),
                                            kind,
                                            column,
                                            dir: "asc"
                                        }]);
                                        if (kind === "select") setSteps((p) => [...p, {
                                            id: nextId(),
                                            kind,
                                            columns: headers.slice(0, 2)
                                        }]);
                                        if (kind === "rename") setSteps((p) => [...p, {
                                            id: nextId(),
                                            kind,
                                            from: col2,
                                            to: `${col2}New`
                                        }]);
                                        if (kind === "group") setSteps((p) => [...p, {
                                            id: nextId(),
                                            kind,
                                            by: column,
                                            agg: "count",
                                            column: col2
                                        }]);
                                        if (kind === "pivot") setSteps((p) => [...p, {
                                            id: nextId(),
                                            kind,
                                            row: column,
                                            column: col2,
                                            value: headers[2] ?? col2
                                        }]);
                                    }}
                                >
                                    <Plus className="size-3"/>
                                    {kind === "group" ? "group-by" : kind}
                                </Button>
                            ))}
                            {siblingCsvs.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 text-[11px]"
                                    onClick={() => {
                                        const sib = siblingCsvs.find((s) => s.fileSlug !== fileSlug);
                                        if (sib) {
                                            setSteps((p) => [...p, {
                                                id: nextId(),
                                                kind: "join",
                                                fileSlug: sib.fileSlug,
                                                fileName: sib.fileName,
                                                leftKey: headers[0] ?? "",
                                                rightKey: ""
                                            }]);
                                            void ensureJoinTable(sib.fileSlug);
                                        }
                                    }}
                                >
                                    <Plus className="size-3"/>
                                    join
                                </Button>
                            )}
                        </div>

                        {/* steps */}
                        {steps.length === 0 && (
                            <p className="text-xs text-muted-foreground">No steps yet — add one above. The preview shows
                                the raw table.</p>
                        )}
                        <div className="space-y-1.5">
                            {steps.map((s, i) => (
                                <div key={s.id}
                                     className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                    {stepIcon(s.kind)}
                      {i + 1}.
                  </span>
                                    {s.kind === "filter" && (
                                        <>
                                            <select value={s.column}
                                                    onChange={(e) => update(s.id, {column: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <select value={s.op}
                                                    onChange={(e) => update(s.id, {op: e.target.value as FilterOp})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {["==", "!=", ">", "<", ">=", "<=", "contains", "missing"].map((o) =>
                                                    <option key={o} value={o}>{o}</option>)}
                                            </select>
                                            {s.op !== "missing" && (
                                                <Input value={s.value}
                                                       onChange={(e) => update(s.id, {value: e.target.value})}
                                                       className="h-7 w-28 text-xs" placeholder="value"/>
                                            )}
                                        </>
                                    )}
                                    {s.kind === "sort" && (
                                        <>
                                            <select value={s.column}
                                                    onChange={(e) => update(s.id, {column: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <Button size="sm" variant={s.dir === "asc" ? "default" : "outline"}
                                                    className="h-7 text-[11px] px-2"
                                                    onClick={() => update(s.id, {dir: s.dir === "asc" ? "desc" : "asc"})}>
                                                {s.dir === "asc" ? "ascending" : "descending"}
                                            </Button>
                                        </>
                                    )}
                                    {s.kind === "select" && (
                                        <div className="flex flex-wrap gap-1">
                                            {headers.map((h) => (
                                                <button
                                                    key={h}
                                                    type="button"
                                                    className={cn("rounded border px-1.5 h-7 text-[11px]", s.columns.includes(h) ? "bg-emerald-500/15 border-emerald-500/50" : "opacity-60")}
                                                    onClick={() => update(s.id, {columns: s.columns.includes(h) ? s.columns.filter((c) => c !== h) : [...s.columns, h]})}
                                                >
                                                    {h}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {s.kind === "rename" && (
                                        <>
                                            <select value={s.from}
                                                    onChange={(e) => update(s.id, {from: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <span className="opacity-50">→</span>
                                            <Input value={s.to} onChange={(e) => update(s.id, {to: e.target.value})}
                                                   className="h-7 w-32 text-xs"/>
                                        </>
                                    )}
                                    {s.kind === "group" && (
                                        <>
                                            <span className="opacity-60">by</span>
                                            <select value={s.by} onChange={(e) => update(s.id, {by: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <select value={s.agg}
                                                    onChange={(e) => update(s.id, {agg: e.target.value as "count" | "sum" | "mean" | "min" | "max"})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {["count", "sum", "mean", "min", "max"].map((a) => <option key={a}
                                                                                                           value={a}>{a}</option>)}
                                            </select>
                                            {s.agg !== "count" && (
                                                <select value={s.column}
                                                        onChange={(e) => update(s.id, {column: e.target.value})}
                                                        className="h-7 rounded border bg-background px-1">
                                                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            )}
                                        </>
                                    )}
                                    {s.kind === "pivot" && (
                                        <>
                                            <Label className="text-[11px]">rows</Label>
                                            <select value={s.row} onChange={(e) => update(s.id, {row: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <Label className="text-[11px]">cols</Label>
                                            <select value={s.column}
                                                    onChange={(e) => update(s.id, {column: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <Label className="text-[11px]">vals</Label>
                                            <select value={s.value}
                                                    onChange={(e) => update(s.id, {value: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                        </>
                                    )}
                                    {s.kind === "join" && (
                                        <>
                                            <select
                                                value={s.fileSlug}
                                                onChange={(e) => {
                                                    const slug = e.target.value;
                                                    const sib = siblingCsvs.find((x) => x.fileSlug === slug);
                                                    update(s.id, {fileSlug: slug, fileName: sib?.fileName ?? slug});
                                                    void ensureJoinTable(slug);
                                                }}
                                                className="h-7 rounded border bg-background px-1"
                                            >
                                                {siblingCsvs.map((x) => <option key={x.fileSlug}
                                                                                value={x.fileSlug}>{x.fileName}</option>)}
                                            </select>
                                            <select value={s.leftKey}
                                                    onChange={(e) => update(s.id, {leftKey: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <span className="opacity-50">=</span>
                                            <select value={s.rightKey}
                                                    onChange={(e) => update(s.id, {rightKey: e.target.value})}
                                                    className="h-7 rounded border bg-background px-1">
                                                <option value="">pick key…</option>
                                                {(joinTables.get(s.fileSlug)?.headers ?? []).map((h) => <option key={h}
                                                                                                                value={h}>{h}</option>)}
                                            </select>
                                        </>
                                    )}
                                    <Button size="sm" variant="ghost" className="h-7 ml-auto px-1.5"
                                            onClick={() => setSteps((p) => p.filter((x) => x.id !== s.id))}
                                            title="Remove step">
                                        <Trash2 className="size-3"/>
                                    </Button>
                                </div>
                            ))}
                        </div>

                        {/* live preview */}
                        {result && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground">
                                    Preview — {result.rows.length.toLocaleString()} row(s)
                                    × {result.headers.length} column(s)
                                    {result.rows.length > 50 ? " (first 50 shown)" : ""}
                                </p>
                                <div className="rounded-md border overflow-auto max-h-64">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-muted">
                                        <tr>
                                            {result.headers.map((h) => (
                                                <th key={h}
                                                    className="text-left font-medium px-2 py-1 border-b whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {result.rows.slice(0, 50).map((row, i) => (
                                            <tr key={i} className={cn(i % 2 === 1 && "bg-muted/30")}>
                                                {row.map((cell, j) => (
                                                    <td key={j}
                                                        className="px-2 py-1 border-b border-border/40 whitespace-nowrap font-mono text-[11px]">{cell}</td>
                                                ))}
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={downloadCsv}>
                                <Download className="size-3"/>
                                Download CSV
                            </Button>
                            <Input
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                placeholder={`${fileName.replace(/\.[^.]+$/, "")}-transformed.csv`}
                                className="h-8 w-52 text-xs"
                            />
                            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void saveToProject()}>
                                <Save className="size-3"/>
                                Save to project
                            </Button>
                        </div>
                    </div>
                )}
            </ResizableDialogContent>
        </Dialog>
    );
}
