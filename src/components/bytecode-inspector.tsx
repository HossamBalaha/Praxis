"use client";

import * as React from "react";
import {AlertTriangle, ChevronDown, ChevronUp, CircleSlash, Copy, Cpu, RefreshCw} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * BytecodeInspector — the CPython disassembly dialog: SOURCE (left)
 * and BYTECODE (right) panes kept in sync through a single
 * "current line" state.
 *
 * ▸ bytecode rows (offset | opname | arg) are GROUPED per source
 *   line, each group headed by the line it belongs to;
 * ▸ clicking a row highlights its source line and vice versa; both
 *   panes auto-scroll to the active line;
 * ▸ Prev / Next step through the source lines that have bytecode;
 * ▸ a function select (top-level defs parsed client-side — a small
 *   pure scanner, no python-symbols import) narrows the
 *   disassembly to one symbol via &symbol=;
 * ▸ DIFF MODE: when a compare target exists (an explicit
 *   `compareCode` prop, or an edited buffer that differs from
 *   `savedCode`), the request carries &compareCode= and the toggle
 *   renders the returned diff array — changed instructions amber,
 *   unchanged dimmed, previous values struck through;
 * ▸ copy buttons snapshot either pane to the clipboard.
 *
 * Data comes from GET /api/disasm (folder + file + optional symbol /
 * code / compareCode).
 */

interface SourceRow {
    line: number;
    text: string;
}

interface BytecodeRow {
    offset: number;
    line: number | null;
    opname: string;
    arg: string;
}

interface DiffRow {
    offset: number;
    opname: string;
    arg: string;
    changed: boolean;
    before?: string;
}

interface DisasmData {
    source: SourceRow[];
    bytecode: BytecodeRow[];
    /** Present only when the request carried compareCode. */
    diff: DiffRow[] | null;
}

// ─── response validation (unknown → typed) ──────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function strOrEmpty(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function parseDisasmResponse(json: unknown): { data?: DisasmData; error?: string } {
    const r = asRecord(json);
    if (!r) return {error: "Malformed response"};
    if (r.ok !== true) {
        return {error: typeof r.error === "string" ? r.error : "Disassembly failed"};
    }
    const source: SourceRow[] = Array.isArray(r.source)
        ? r.source
            .map((s): SourceRow | null => {
                const rec = asRecord(s);
                if (!rec || typeof rec.line !== "number" || typeof rec.text !== "string") return null;
                return {line: rec.line, text: rec.text};
            })
            .filter((s): s is SourceRow => s !== null)
        : [];
    const bytecode: BytecodeRow[] = Array.isArray(r.bytecode)
        ? r.bytecode
            .map((b): BytecodeRow | null => {
                const rec = asRecord(b);
                if (!rec || typeof rec.offset !== "number" || typeof rec.opname !== "string") return null;
                return {
                    offset: rec.offset,
                    line: typeof rec.line === "number" ? rec.line : null,
                    opname: rec.opname,
                    arg: strOrEmpty(rec.arg),
                };
            })
            .filter((b): b is BytecodeRow => b !== null)
        : [];
    const diff: DiffRow[] | null = Array.isArray(r.diff)
        ? r.diff
            .map((d): DiffRow | null => {
                const rec = asRecord(d);
                if (!rec || typeof rec.offset !== "number" || typeof rec.opname !== "string") return null;
                return {
                    offset: rec.offset,
                    opname: rec.opname,
                    arg: strOrEmpty(rec.arg),
                    changed: rec.changed === true,
                    before: typeof rec.before === "string" ? rec.before : undefined,
                };
            })
            .filter((d): d is DiffRow => d !== null)
        : null;
    return {data: {source, bytecode, diff}};
}

// ─── client-side top-level def scan (pure, tiny) ────────────────────

/** Top-level `def` / `async def` names at column 0 — feeds the symbol select. */
function parseTopLevelDefs(source: string | undefined): Array<{ name: string; line: number }> {
    if (source === undefined) return [];
    const out: Array<{ name: string; line: number }> = [];
    const re = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s/.test(line)) continue; // indented → method / nested, not top-level
        const m = re.exec(line);
        if (m) out.push({name: m[1], line: i + 1});
    }
    return out;
}

/** Sentinel for the "whole module" select option — Radix needs non-empty values. */
const WHOLE_MODULE = "__module__";

// ─── skeletons ──────────────────────────────────────────────────────

function SourceSkeleton() {
    const widths = ["62%", "84%", "45%", "71%", "90%", "38%", "77%", "56%", "68%", "49%"];
    return (
        <div className="space-y-2 p-3" aria-hidden="true">
            {widths.map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-8 shrink-0"/>
                    <Skeleton className="h-3" style={{width: w}}/>
                </div>
            ))}
        </div>
    );
}

function BytecodeSkeleton() {
    return (
        <div className="space-y-2 p-3" aria-hidden="true">
            {[0, 1, 2].map((g) => (
                <div key={g} className="space-y-2">
                    <Skeleton className="h-3.5 w-28"/>
                    {[0, 1, 2, 3].map((r) => (
                        <div key={r} className="flex items-center gap-3">
                            <Skeleton className="h-3 w-10 shrink-0"/>
                            <Skeleton className="h-3 w-24 shrink-0"/>
                            <Skeleton className="h-3 flex-1" style={{maxWidth: `${40 + ((g * 13 + r * 29) % 50)}%`}}/>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function PaneMessage({icon, text, error}: { icon: React.ReactNode; text: string; error?: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center gap-1.5 py-12 px-8 text-center">
            <span className={cn("size-5", error ? "text-red-500/70" : "text-muted-foreground/50")}>{icon}</span>
            <p className={cn("text-xs", error ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{text}</p>
        </div>
    );
}

// ─── component ──────────────────────────────────────────────────────

export function BytecodeInspector({
                                      open,
                                      onOpenChange,
                                      folderSlug,
                                      fileSlug,
                                      fileName,
                                      code,
                                      compareCode,
                                      savedCode,
                                  }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** Live editor buffer — disassembled when present (falls back to savedCode). */
    code?: string;
    /** Explicit compare target for the diff mode. */
    compareCode?: string;
    /** Last saved buffer — the implicit diff baseline when the buffer is edited. */
    savedCode?: string;
}) {
    const {toast} = useToast();
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [data, setData] = React.useState<DisasmData | null>(null);
    const [reloadNonce, setReloadNonce] = React.useState(0);
    const [symbol, setSymbol] = React.useState("");
    const [showDiff, setShowDiff] = React.useState(false);
    const [activeLine, setActiveLine] = React.useState<number | null>(null);

    const sourcePaneRef = React.useRef<HTMLDivElement | null>(null);
    const bytecodePaneRef = React.useRef<HTMLDivElement | null>(null);

    // The function list parses from the LOCAL buffer (code ?? savedCode)
    // so the select is populated before the first response arrives.
    const defs = React.useMemo(() => parseTopLevelDefs(code ?? savedCode), [code, savedCode]);

    // ── fetch — code = edited buffer (fallback saved); compareCode =
    //    explicit prop, or the saved buffer when the edited one differs. ──
    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({folder: folderSlug, file: fileSlug});
        if (symbol !== "") qs.set("symbol", symbol);
        const effectiveCode = code ?? savedCode;
        if (effectiveCode !== undefined) qs.set("code", effectiveCode);
        const effectiveCompare =
            compareCode ??
            (code !== undefined && savedCode !== undefined && code !== savedCode ? savedCode : undefined);
        if (effectiveCompare !== undefined) qs.set("compareCode", effectiveCompare);
        void (async () => {
            try {
                const res = await fetch(`/api/disasm?${qs.toString()}`, {cache: "no-store"});
                const json: unknown = await res.json();
                if (cancelled) return;
                const parsed = parseDisasmResponse(json);
                if (!res.ok || parsed.error !== undefined) {
                    setError(parsed.error ?? `HTTP ${res.status}`);
                    setData(null);
                } else {
                    const d = parsed.data;
                    setData(d ?? null);
                    setShowDiff(false);
                    // Land the current line on the first mapped group (no forced scroll).
                    setActiveLine(d ? (d.bytecode.find((b) => b.line !== null)?.line ?? null) : null);
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, folderSlug, fileSlug, symbol, code, savedCode, compareCode, reloadNonce]);

    // File switch → drop the stale symbol pick and current line.
    React.useEffect(() => {
        setSymbol("");
        setActiveLine(null);
    }, [folderSlug, fileSlug]);

    React.useEffect(() => {
        if (open) {
            setShowDiff(false);
            setActiveLine(null);
        }
    }, [open]);

    // ── grouping + line stepping ──
    const groups = React.useMemo(() => {
        const byLine = new Map<number, BytecodeRow[]>();
        const unmapped: BytecodeRow[] = [];
        for (const b of data?.bytecode ?? []) {
            if (b.line === null) unmapped.push(b);
            else {
                const list = byLine.get(b.line);
                if (list) list.push(b);
                else byLine.set(b.line, [b]);
            }
        }
        const ordered: Array<{ line: number | null; rows: BytecodeRow[] }> = [...byLine.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([line, rows]) => ({line, rows}));
        if (unmapped.length > 0) ordered.push({line: null, rows: unmapped});
        return ordered;
    }, [data]);

    const mappedLines = React.useMemo(
        () =>
            [...new Set((data?.bytecode ?? []).map((b) => b.line).filter((l): l is number => l !== null))].sort(
                (a, b) => a - b
            ),
        [data]
    );

    /** Set the synced current line and scroll both panes to it. */
    const selectLine = (line: number, scroll: boolean) => {
        setActiveLine(line);
        if (!scroll) return;
        requestAnimationFrame(() => {
            sourcePaneRef.current
                ?.querySelector(`[data-l="${line}"]`)
                ?.scrollIntoView({block: "center", behavior: "smooth"});
            bytecodePaneRef.current
                ?.querySelector(`[data-g="${line}"]`)
                ?.scrollIntoView({block: "center", behavior: "smooth"});
        });
    };

    const stepLine = (dir: 1 | -1) => {
        if (mappedLines.length === 0) return;
        const idx = activeLine === null ? -1 : mappedLines.indexOf(activeLine);
        const next =
            idx === -1
                ? dir === 1
                    ? mappedLines[0]
                    : mappedLines[mappedLines.length - 1]
                : mappedLines[Math.min(mappedLines.length - 1, Math.max(0, idx + dir))];
        if (next !== undefined) selectLine(next, true);
    };

    // ── copy panes ──
    const copyPane = async (text: string, label: string) => {
        if (text.length === 0) return;
        try {
            await navigator.clipboard.writeText(text);
            toast({title: `${label} copied`});
        } catch (err) {
            toast({
                title: `Could not copy the ${label.toLowerCase()}`,
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    };

    const sourceText = data ? data.source.map((s) => `${String(s.line).padStart(5)}  ${s.text}`).join("\n") : "";
    const bytecodeText = data
        ? (showDiff && data.diff
                ? data.diff.map((d) => `${String(d.offset).padStart(6)}  ${d.opname}${d.arg ? `  ${d.arg}` : ""}${d.before ? `  (was: ${d.before})` : ""}`)
                : data.bytecode.map((b) => `${String(b.offset).padStart(6)}  ${b.opname}${b.arg ? `  ${b.arg}` : ""}`)
        ).join("\n")
        : "";

    const diffRows = showDiff && data?.diff ? data.diff : null;
    const changedCount = data?.diff ? data.diff.filter((d) => d.changed).length : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Cpu className="size-4 text-amber-500"/>
                        Bytecode inspector — {fileName}
                    </DialogTitle>
                    <DialogDescription>
                        CPython disassembly synced with the source — click a row or a line to move the current line in
                        both panes.
                    </DialogDescription>
                </DialogHeader>

                {/* toolbar — symbol select, counts, current line, prev/next, refresh */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Select
                        value={symbol === "" ? WHOLE_MODULE : symbol}
                        onValueChange={(v) => setSymbol(v === WHOLE_MODULE ? "" : v)}
                    >
                        <SelectTrigger
                            size="sm"
                            className="h-8 text-xs font-mono w-44"
                            aria-label="Disassemble a single function"
                            title="Top-level defs parsed from the buffer — pick one to disassemble only that symbol"
                        >
                            <SelectValue placeholder="Whole module"/>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={WHOLE_MODULE} className="text-xs">
                                Whole module
                            </SelectItem>
                            {defs.map((d) => (
                                <SelectItem key={d.name} value={d.name} className="text-xs font-mono">
                                    {d.name}
                                    <span className="text-[10px] text-muted-foreground"> L{d.line}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {data && !loading && (
                        <>
                            <Badge variant="secondary" className="text-[10px] shrink-0" title="Instructions returned">
                                {data.bytecode.length} insns
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] shrink-0" title="Source lines returned">
                                {data.source.length} lines
                            </Badge>
                        </>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-muted-foreground" aria-live="polite">
              line {activeLine ?? "—"}
            </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1 shrink-0"
                            onClick={() => stepLine(-1)}
                            disabled={mappedLines.length === 0}
                            title="Jump to the previous source line that has bytecode"
                            aria-label="Previous line with bytecode"
                        >
                            <ChevronUp className="size-3.5"/> Prev
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1 shrink-0"
                            onClick={() => stepLine(1)}
                            disabled={mappedLines.length === 0}
                            title="Jump to the next source line that has bytecode"
                            aria-label="Next line with bytecode"
                        >
                            <ChevronDown className="size-3.5"/> Next
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs shrink-0"
                            onClick={() => setReloadNonce((n) => n + 1)}
                            disabled={loading}
                            title="Re-disassemble"
                            aria-label="Refresh the disassembly"
                        >
                            <RefreshCw className="size-3.5"/>
                        </Button>
                    </div>
                </div>

                {/* diff toggle — only when the backend produced a diff array */}
                {data?.diff && data.diff.length > 0 && (
                    <label
                        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium cursor-pointer select-none self-start"
                        title="Compare the edited buffer's bytecode against the saved buffer"
                    >
                        <input
                            type="checkbox"
                            checked={showDiff}
                            onChange={(e) => setShowDiff(e.target.checked)}
                            className="size-3 accent-amber-500"
                            aria-label="Show bytecode diff"
                        />
                        <span className={showDiff ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
              Show bytecode diff · {changedCount} changed
            </span>
                    </label>
                )}

                {/* body — source | bytecode */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1.25fr] gap-3 flex-1 min-h-0">
                    {/* LEFT — source */}
                    <div className="rounded-md border flex flex-col min-h-0 overflow-hidden">
                        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5 shrink-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-6 px-1.5 text-[10px] gap-1"
                                onClick={() => void copyPane(sourceText, "Source pane")}
                                disabled={sourceText.length === 0}
                                title="Copy the source pane (with line numbers)"
                                aria-label="Copy the source pane"
                            >
                                <Copy className="size-3"/> Copy
                            </Button>
                        </div>
                        <div
                            ref={sourcePaneRef}
                            aria-busy={loading}
                            aria-label="Disassembled source"
                            className="flex-1 min-h-0 overflow-auto max-h-[48vh] font-mono text-xs py-2"
                        >
                            {loading ? (
                                <SourceSkeleton/>
                            ) : error ? (
                                <PaneMessage icon={<AlertTriangle className="size-5"/>} text={error} error/>
                            ) : (data?.source.length ?? 0) === 0 ? (
                                <PaneMessage icon={<CircleSlash className="size-5"/>}
                                             text="No source lines were returned."/>
                            ) : (
                                (data?.source ?? []).map((s) => (
                                    <button
                                        key={s.line}
                                        type="button"
                                        data-l={s.line}
                                        onClick={() => selectLine(s.line, true)}
                                        aria-label={`Source line ${s.line}`}
                                        title={`Line ${s.line} — click to focus its bytecode group`}
                                        className={cn(
                                            "flex w-full items-start gap-2 px-2 py-0.5 text-left hover:bg-muted/50",
                                            s.line === activeLine && "bg-emerald-500/20"
                                        )}
                                    >
                    <span className="w-9 shrink-0 select-none text-right tabular-nums text-muted-foreground">
                      {s.line}
                    </span>
                                        <span
                                            className="min-w-0 flex-1 whitespace-pre-wrap break-all">{s.text.length > 0 ? s.text : " "}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* RIGHT — bytecode (grouped) or diff */}
                    <div className="rounded-md border flex flex-col min-h-0 overflow-hidden">
                        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5 shrink-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {diffRows ? "Bytecode diff" : "Bytecode"}
                            </p>
                            {diffRows && (
                                <Badge variant="outline"
                                       className="text-[9px] border-amber-500/30 text-amber-700 dark:text-amber-300">
                                    edited vs saved
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-6 px-1.5 text-[10px] gap-1"
                                onClick={() => void copyPane(bytecodeText, diffRows ? "Diff pane" : "Bytecode pane")}
                                disabled={bytecodeText.length === 0}
                                title="Copy the bytecode pane"
                                aria-label="Copy the bytecode pane"
                            >
                                <Copy className="size-3"/> Copy
                            </Button>
                        </div>
                        <div
                            ref={bytecodePaneRef}
                            aria-busy={loading}
                            aria-label="Bytecode instructions grouped by source line"
                            className="flex-1 min-h-0 overflow-auto max-h-[48vh] font-mono text-xs py-1"
                        >
                            {loading ? (
                                <BytecodeSkeleton/>
                            ) : error ? (
                                <PaneMessage icon={<AlertTriangle className="size-5"/>} text={error} error/>
                            ) : diffRows ? (
                                diffRows.length === 0 ? (
                                    <PaneMessage icon={<CircleSlash className="size-5"/>}
                                                 text="The diff is empty — the buffers compile identically."/>
                                ) : (
                                    diffRows.map((d) => (
                                        <div
                                            key={d.offset}
                                            aria-label={`Offset ${d.offset}: ${d.opname}${d.arg ? ` ${d.arg}` : ""}${d.changed ? " (changed)" : ""}`}
                                            className={cn(
                                                "flex w-full items-baseline gap-3 px-2 py-0.5",
                                                d.changed ? "bg-amber-500/15" : "opacity-45"
                                            )}
                                        >
                                            <span
                                                className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{d.offset}</span>
                                            <span
                                                className={cn(
                                                    "w-32 shrink-0 truncate font-medium",
                                                    d.changed && "text-amber-700 dark:text-amber-300"
                                                )}
                                            >
                        {d.opname}
                      </span>
                                            <span className="min-w-0 flex-1 truncate">
                        {d.changed && d.before !== undefined && d.before !== "" && (
                            <span className="mr-1.5 text-muted-foreground/70 line-through" title="Previous value">
                            {d.before}
                          </span>
                        )}
                                                {d.arg}
                      </span>
                                        </div>
                                    ))
                                )
                            ) : (data?.bytecode.length ?? 0) === 0 ? (
                                <PaneMessage icon={<CircleSlash className="size-5"/>}
                                             text="No bytecode was returned — pick another symbol or refresh."/>
                            ) : (
                                groups.map((g) => (
                                    <div key={g.line ?? "unmapped"} data-g={g.line ?? "unmapped"}>
                                        <div
                                            className={cn(
                                                "sticky top-0 z-10 flex items-center gap-2 border-b bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground",
                                                g.line !== null && g.line === activeLine && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                            )}
                                        >
                                            <span
                                                className="font-mono">{g.line !== null ? `L${g.line}` : "unmapped"}</span>
                                            <span className="font-normal opacity-70">
                        {g.line !== null ? `${g.rows.length} instruction${g.rows.length === 1 ? "" : "s"}` : "module constants"}
                      </span>
                                        </div>
                                        {g.rows.map((b) => (
                                            <button
                                                key={b.offset}
                                                type="button"
                                                onClick={() => (b.line === null ? undefined : selectLine(b.line, true))}
                                                aria-label={`Offset ${b.offset}: ${b.opname}${b.arg ? ` ${b.arg}` : ""}`}
                                                title={
                                                    b.line === null
                                                        ? "Not mapped to a source line"
                                                        : `L${b.line} → offset ${b.offset} — click to focus that source line`
                                                }
                                                className={cn(
                                                    "flex w-full items-baseline gap-3 px-2 py-0.5 text-left hover:bg-muted/50",
                                                    b.line !== null && b.line === activeLine && "bg-emerald-500/10"
                                                )}
                                            >
                                                <span
                                                    className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{b.offset}</span>
                                                <span className="w-32 shrink-0 truncate font-medium">{b.opname}</span>
                                                <span
                                                    className="min-w-0 flex-1 truncate text-muted-foreground">{b.arg}</span>
                                            </button>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="text-[10px] text-muted-foreground">
                    offset · opname · arg — rows grouped under the source line they compile from. Amber rows differ from
                    the saved buffer; struck-through text is the previous value.
                </div>
            </DialogContent>
        </Dialog>
    );
}
