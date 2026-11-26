"use client";

import * as React from "react";
import {AnimatePresence, motion} from "framer-motion";
import {
    Bug,
    ChevronLeft,
    Crosshair,
    Eye,
    History,
    Loader2,
    Pause,
    Play,
    RotateCcw,
    Search,
    TriangleAlert,
    X,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {configuredInterpreter} from "@/lib/settings";
import {diffLocals, type LocalDiff} from "@/lib/trace-format";

/**
 * the TIME-TRAVEL DEBUGGER run mode — the engineering twin of the tutor:
 * same POST /api/time-travel recording, but the body is a timeline
 * scrubber with per-kind event ticks, a variables-at-this-point table
 * with per-step diff badges (via diffLocals), watchpoint histories,
 * time breakpoints that stop playback, backward jumps and a
 * "what changed" quick search.
 */

/* ── backend contract (defensively normalized) ──────────────────── */

export type TraceEventKind = "line" | "call" | "return" | "exception";

export interface TimeTravelEvent {
    line: number;
    event: TraceEventKind;
    locals: Record<string, string>;
    func?: string;
}

export interface TimeTravelTrace {
    ok: boolean;
    fileName: string;
    totalEvents: number;
    capped: boolean;
    stdout: Array<{ afterEvent: number; text: string }>;
    events: TimeTravelEvent[];
    error?: string;
}

function normalizeTrace(raw: unknown): TimeTravelTrace {
    const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const rawEvents = Array.isArray(obj.events) ? obj.events : [];
    const events: TimeTravelEvent[] = rawEvents.map((e): TimeTravelEvent => {
        const ev = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
        const kind = ev.event;
        const locals: Record<string, string> = {};
        if (typeof ev.locals === "object" && ev.locals !== null) {
            for (const [k, v] of Object.entries(ev.locals as Record<string, unknown>)) {
                locals[k] = typeof v === "string" ? v : String(v);
            }
        }
        return {
            line: typeof ev.line === "number" && Number.isFinite(ev.line) ? Math.max(0, Math.floor(ev.line)) : 0,
            event: kind === "call" || kind === "return" || kind === "exception" ? kind : "line",
            locals,
            func: typeof ev.func === "string" ? ev.func : undefined,
        };
    });
    const rawStdout = Array.isArray(obj.stdout) ? obj.stdout : [];
    const stdout = rawStdout
        .map((d): { afterEvent: number; text: string } | null => {
            if (typeof d === "object" && d !== null) {
                const dd = d as Record<string, unknown>;
                if (typeof dd.text === "string") {
                    return {afterEvent: typeof dd.afterEvent === "number" ? dd.afterEvent : 0, text: dd.text};
                }
            }
            return null;
        })
        .filter((d): d is { afterEvent: number; text: string } => d !== null);
    return {
        ok: obj.ok === true,
        fileName: typeof obj.fileName === "string" ? obj.fileName : "",
        totalEvents: typeof obj.totalEvents === "number" ? obj.totalEvents : events.length,
        capped: obj.capped === true,
        stdout,
        events,
        error: typeof obj.error === "string" ? obj.error : undefined,
    };
}

/* ── small helpers ─────────────────────────────────────────────── */

const EMPTY_EVENTS: TimeTravelEvent[] = [];

function isDunder(name: string): boolean {
    return name.length > 4 && name.startsWith("__") && name.endsWith("__");
}

function truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

/* ── timeline ticks (pure) ──────────────────────────────────────── */

interface TimelineTick {
    at: number;
    kind: TraceEventKind;
}

/** Key markers for the scrubber track: call / return / exception events.
 * Traces can hold thousands of events, so ticks are bucketed into at most
 * `maxTicks` slots — an exception tick outranks a call, which outranks a
 * return, so a red marker is never hidden by a quieter one in the same slot. */
function computeTicks(events: TimeTravelEvent[], maxTicks: number): TimelineTick[] {
    const n = events.length;
    if (n < 2) return [];
    const slots = Math.min(maxTicks, n);
    const rank = (k: TraceEventKind): number => (k === "exception" ? 3 : k === "call" ? 2 : 1);
    const bySlot = new Map<number, TimelineTick>();
    for (let j = 0; j < n; j++) {
        const k = events[j]!.event;
        if (k === "line") continue;
        const slot = Math.min(slots - 1, Math.floor((j / (n - 1)) * slots));
        const cur = bySlot.get(slot);
        if (cur === undefined || rank(k) > rank(cur.kind)) bySlot.set(slot, {at: j, kind: k});
    }
    return [...bySlot.values()];
}

const TICK_COLOR: Record<TraceEventKind, string> = {
    call: "bg-emerald-500",
    return: "bg-amber-500",
    exception: "bg-red-500",
    line: "bg-muted-foreground/40",
};

/* ── watchpoint history (pure) ──────────────────────────────────── */

interface WatchChange {
    at: number;
    from?: string;
    to: string;
}

/** Every step at which `name` changed value. The last-seen value persists
 * across events where the name is not live (it may live in another frame),
 * so the history reads like the variable's real timeline. */
function watchHistory(events: TimeTravelEvent[], name: string): WatchChange[] {
    const out: WatchChange[] = [];
    if (!name) return out;
    let last: string | undefined;
    for (let j = 0; j < events.length; j++) {
        const v = events[j]!.locals[name];
        if (v === undefined) continue;
        if (last === undefined || v !== last) out.push({at: j, from: last, to: v});
        last = v;
    }
    return out;
}

/* ── custom scrollbar styling (matches the app's thin rails) ─────── */

const SCROLLBAR =
    " [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent";

/* ── the panel ──────────────────────────────────────────────────── */

export interface TimeTravelDebuggerProps {
    active: boolean;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    code?: string;
    onGoToLine?: (line: number) => void;
}

interface VarRow {
    name: string;
    value: string;
    op?: LocalDiff;
}

const KIND_BADGE: Record<TraceEventKind, string> = {
    call: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    return: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    exception: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
    line: "",
};

export function TimeTravelDebugger({
                                       active,
                                       folderSlug,
                                       fileSlug,
                                       fileName,
                                       code,
                                       onGoToLine
                                   }: TimeTravelDebuggerProps) {
    const {toast} = useToast();
    const [trace, setTrace] = React.useState<TimeTravelTrace | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [step, setStep] = React.useState(0);
    const [playing, setPlaying] = React.useState(false);
    const [markers, setMarkers] = React.useState<number[]>([]);
    const [watches, setWatches] = React.useState<string[]>([]);
    const [watchInput, setWatchInput] = React.useState("");
    const [query, setQuery] = React.useState("");

    // a different file must never replay the previous file's recording
    React.useEffect(() => {
        setTrace(null);
        setError(null);
        setStep(0);
        setPlaying(false);
        setMarkers([]);
        setWatches([]);
        setQuery("");
    }, [folderSlug, fileSlug]);

    const events = trace?.events ?? EMPTY_EVENTS;
    const total = events.length;
    const idx = total > 0 ? Math.min(step, total - 1) : 0;
    const ev = total > 0 ? events[idx] : undefined;
    const prevEv = idx > 0 ? events[idx - 1] : undefined;
    const srcLines = React.useMemo(() => (code ?? "").split(/\r?\n/), [code]);
    const lineText = ev && ev.line >= 1 ? srcLines[ev.line - 1]?.trim() : undefined;

    const ticks = React.useMemo(() => computeTicks(events, 420), [events]);
    const markerSet = React.useMemo(() => new Set(markers), [markers]);
    const markerKey = markers.join(",");

    // variables at the scrubbed step + per-step diff badges vs the previous step
    const diffs = React.useMemo(
        () => (ev ? diffLocals(prevEv ? prevEv.locals : {}, ev.locals) : []),
        [ev, prevEv]
    );
    const varRows = React.useMemo(() => {
        if (!ev) return [] as VarRow[];
        const seen = new Set<string>();
        const rows: VarRow[] = [];
        for (const d of diffs) {
            if (isDunder(d.name)) continue;
            seen.add(d.name);
            rows.push({name: d.name, value: d.op === "removed" ? d.from ?? "" : d.to ?? "", op: d});
        }
        rows.sort((a, b) => a.name.localeCompare(b.name));
        const rest: VarRow[] = [];
        for (const [name, value] of Object.entries(ev.locals)) {
            if (isDunder(name) || seen.has(name)) continue;
            rest.push({name, value});
        }
        rest.sort((a, b) => a.name.localeCompare(b.name));
        return [...rows, ...rest];
    }, [ev, diffs]);

    const watchData = React.useMemo(
        () => watches.map((w) => ({name: w, changes: watchHistory(events, w)})),
        [watches, events]
    );

    const queryName = query.trim();
    const searchResults = React.useMemo(
        () => (queryName ? watchHistory(events, queryName) : []),
        [queryName, events]
    );

    const record = React.useCallback(async (): Promise<void> => {
        setBusy(true);
        setError(null);
        setPlaying(false);
        try {
            const interpreter = configuredInterpreter();
            const res = await fetch("/api/time-travel", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    ...(code ? {code} : {}),
                    ...(interpreter ? {interpreter} : {}),
                }),
            });
            const json: unknown = await res.json().catch(() => null);
            const normalized = normalizeTrace(json);
            if (!res.ok || !normalized.ok) {
                setError(normalized.error ?? `HTTP ${res.status}`);
                setTrace(null);
                toast({
                    title: "Recording failed",
                    description: normalized.error ?? `The tracer could not record ${fileName} (HTTP ${res.status}).`,
                    variant: "destructive",
                });
            } else {
                setTrace(normalized);
                setStep(0);
                setMarkers([]);
                toast({
                    title: "Run recorded",
                    description:
                        normalized.events.length > 0
                            ? `${normalized.events.length} events captured — scrub the timeline below.`
                            : "The run produced no traceable events.",
                });
            }
        } catch (err) {
            const message = (err as Error).message;
            setError(message);
            setTrace(null);
            toast({title: "Recording failed", description: message, variant: "destructive"});
        } finally {
            setBusy(false);
        }
    }, [folderSlug, fileSlug, code, fileName, toast]);

    // playback at 800ms — stops when it ARRIVES at a time breakpoint
    React.useEffect(() => {
        if (!playing || total < 2) return;
        if (idx >= total - 1) {
            setPlaying(false);
            return;
        }
        const next = idx + 1;
        const t = window.setTimeout(() => {
            setStep(next);
            if (markerSet.has(next)) setPlaying(false);
        }, 800);
        return () => window.clearTimeout(t);
        // markerKey (not the Set) is the dependency — a stable string identity
    }, [playing, idx, total, markerSet, markerKey]);

    const togglePlay = () => {
        if (total < 2) return;
        if (!playing && idx >= total - 1) setStep(0); // replay from the top
        setPlaying((p) => !p);
    };

    const toggleMarkerAt = (i: number) => {
        setMarkers((prev) => (prev.includes(i) ? prev.filter((m) => m !== i) : [...prev, i].sort((a, b) => a - b)));
    };

    /** Clicking the gutter-ish strip drops/removes a marker at the event
     * proportional to the click position (keyboard users use the button). */
    const stripClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (total < 1) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
        toggleMarkerAt(Math.max(0, Math.min(total - 1, Math.round(frac * (total - 1)))));
    };

    const jumpBack = (kind: TraceEventKind) => {
        for (let j = idx - 1; j >= 0; j--) {
            if (events[j]?.event === kind) {
                setStep(j);
                return;
            }
        }
    };
    const hasBack = (kind: TraceEventKind): boolean => {
        for (let j = idx - 1; j >= 0; j--) if (events[j]?.event === kind) return true;
        return false;
    };

    const addWatch = () => {
        const name = watchInput.trim();
        if (!name) return;
        if (!watches.includes(name)) setWatches((prev) => [...prev, name].slice(0, 8));
        setWatchInput("");
    };

    const pct = total > 1 ? (idx / (total - 1)) * 100 : 0;
    const tickPct = (at: number) => (total > 1 ? (at / (total - 1)) * 100 : 0);

    /* ── render ──────────────────────────────────────────────────── */

    const recordButton = (label: string) => (
        <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => void record()}>
            {busy ? <Loader2 className="size-3 animate-spin"/> : <RotateCcw className="size-3"/>}
            {label}
        </Button>
    );

    const changeRow = (c: WatchChange, keyPrefix: string) => (
        <button
            type="button"
            key={`${keyPrefix}-${c.at}`}
            onClick={() => setStep(c.at)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={`Jump to step ${c.at + 1} where the value became ${truncate(c.to, 20)}`}
        >
            <span className="shrink-0 text-foreground/70">{c.at + 1}</span>
            <span className="truncate">
        {c.from !== undefined ? `${truncate(c.from, 12)} → ${truncate(c.to, 12)}` : `set to ${truncate(c.to, 12)}`}
      </span>
        </button>
    );

    const watchHistoryBlock = (name: string, changes: WatchChange[]) => {
        const denom = Math.max(1, total - 1);
        const shown = changes.slice(-6);
        const hidden = changes.length - shown.length;
        return (
            <div key={name} className="space-y-1.5 rounded-md border bg-muted/20 p-2">
                <div className="flex items-center gap-1.5">
                    <History className="size-3 text-muted-foreground" aria-hidden/>
                    <span className="font-mono text-xs text-foreground">{name}</span>
                    <span className="text-[9px] text-muted-foreground">
            {changes.length === 0 ? "not seen in this recording" : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
          </span>
                    <button
                        type="button"
                        className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Stop watching ${name}`}
                        onClick={() => setWatches((prev) => prev.filter((w) => w !== name))}
                    >
                        <X className="size-3"/>
                    </button>
                </div>
                {/* sparkline-ish strip: a dot at each change position on the timeline */}
                <div className="relative h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {shown.map((c) => (
                        <span
                            key={c.at}
                            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500"
                            style={{left: `${(c.at / denom) * 100}%`}}
                        />
                    ))}
                </div>
                {shown.length > 0 && (
                    <div className={cn("max-h-24 overflow-y-auto", SCROLLBAR.trim())}>
                        {hidden > 0 && (
                            <p className="px-1.5 py-0.5 text-[9px] text-muted-foreground">+{hidden} earlier
                                change{hidden === 1 ? "" : "s"} not shown</p>
                        )}
                        {shown.map((c) => changeRow(c, name))}
                    </div>
                )}
            </div>
        );
    };

    let body: React.ReactNode;
    if (busy) {
        body = (
            <div className="flex flex-1 min-h-0 flex-col gap-3 p-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden/>
                    Recording the run — the tracer executes {fileName} and captures every event…
                </div>
                <Skeleton className="h-8 w-2/3 rounded-md"/>
                <Skeleton className="h-6 w-full rounded-md"/>
                <Skeleton className="h-40 w-full rounded-md"/>
                <Skeleton className="h-24 w-full rounded-md"/>
            </div>
        );
    } else if (error) {
        body = (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="max-w-md rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400"
                   role="alert">
                    {error}
                </p>
                {recordButton("Try again")}
            </div>
        );
    } else if (!trace) {
        body = (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="rounded-full bg-muted/60 p-3">
                    <Bug className="size-5 text-red-500" aria-hidden/>
                </div>
                <p className="text-sm font-semibold">Time-travel debugger</p>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Record a run once, then travel to any event — inspect the variables, watch a name across
                    the whole timeline, and drop breakpoints in time. Nothing re-runs; every state is already recorded.
                </p>
                {recordButton("Record a run")}
            </div>
        );
    } else if (total === 0) {
        body = (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    The recording finished with 0 events — nothing traceable executed in this run.
                </p>
                {recordButton("Re-record")}
            </div>
        );
    } else {
        body = (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
                    {/* left — the event under the scrubber + its variables */}
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            {ev && (
                                <>
                                    <Badge
                                        variant={ev.event === "line" ? "secondary" : "outline"}
                                        className={cn("text-[10px]", KIND_BADGE[ev.event].trim() || undefined)}
                                    >
                                        {ev.event}
                                    </Badge>
                                    {ev.func && (
                                        <Badge variant="secondary"
                                               className="max-w-[180px] truncate font-mono text-[10px] font-normal"
                                               title={ev.func}>
                                            {ev.func}
                                        </Badge>
                                    )}
                                    <span className="font-mono text-xs text-muted-foreground">line {ev.line}</span>
                                </>
                            )}
                            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {diffs.filter((d) => d.op === "added" && !isDunder(d.name)).length} added ·{" "}
                                {diffs.filter((d) => d.op === "changed" && !isDunder(d.name)).length} changed ·{" "}
                                {diffs.filter((d) => d.op === "removed" && !isDunder(d.name)).length} removed
              </span>
                        </div>

                        {/* current source line — click jumps the editor */}
                        {ev &&
                            (onGoToLine ? (
                                <button
                                    type="button"
                                    onClick={() => onGoToLine(ev.line)}
                                    className="group flex w-full items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/70"
                                    aria-label={`Jump to line ${ev.line} in the editor`}
                                >
                                    <span
                                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">L{ev.line}</span>
                                    <span className="flex-1 truncate font-mono text-xs text-foreground">
                    {lineText || "(source line unavailable)"}
                  </span>
                                    <span
                                        className="text-[9px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">jump</span>
                                </button>
                            ) : (
                                <div
                                    className="flex w-full items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                                    <span
                                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">L{ev.line}</span>
                                    <span className="flex-1 truncate font-mono text-xs text-foreground">
                    {lineText || "(source line unavailable)"}
                  </span>
                                </div>
                            ))}

                        {/* variables at this point + diff badges */}
                        <div className="overflow-hidden rounded-md border">
                            <div className="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5">
                                <Eye className="size-3 text-muted-foreground" aria-hidden/>
                                <span
                                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Variables at event {idx + 1}
                </span>
                            </div>
                            <div className={cn("max-h-72 overflow-y-auto", SCROLLBAR.trim())}>
                                {varRows.length === 0 ? (
                                    <p className="p-3 text-xs text-muted-foreground">No locals at this event.</p>
                                ) : (
                                    <table className="w-full text-xs" role="grid" aria-rowcount={varRows.length}>
                                        <thead className="sticky top-0 bg-muted">
                                        <tr className="[&>th]:border-b" role="row">
                                            <th className="px-2 py-1 text-left font-medium whitespace-nowrap"
                                                role="columnheader" scope="col">Variable
                                            </th>
                                            <th className="px-2 py-1 text-left font-medium" role="columnheader"
                                                scope="col">Value
                                            </th>
                                            <th className="px-2 py-1 text-left font-medium whitespace-nowrap"
                                                role="columnheader" scope="col">
                                                {idx > 0 ? `Diff vs step ${idx}` : "Diff (initial)"}
                                            </th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {varRows.map((r) => (
                                            <tr key={r.name} className="[&>td]:border-b" role="row">
                                                <td className="px-2 py-1 font-mono text-foreground whitespace-nowrap"
                                                    role="cell">{r.name}</td>
                                                <td className="max-w-0 truncate px-2 py-1 font-mono text-muted-foreground"
                                                    role="cell" title={r.value}>
                                                    {r.value || "—"}
                                                </td>
                                                <td className="px-2 py-1 whitespace-nowrap" role="cell">
                                                    {r.op?.op === "added" && (
                                                        <Badge variant="outline"
                                                               className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-600 dark:text-emerald-400">
                                                            added
                                                        </Badge>
                                                    )}
                                                    {r.op?.op === "removed" && (
                                                        <Badge variant="outline"
                                                               className="border-red-500/30 bg-red-500/10 text-[9px] text-red-600 dark:text-red-400">
                                                            removed
                                                        </Badge>
                                                    )}
                                                    {r.op?.op === "changed" && (
                                                        <Badge
                                                            variant="outline"
                                                            className="max-w-[160px] border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-600 dark:text-amber-400"
                                                            title={`${r.op.from} → ${r.op.to}`}
                                                        >
                                                            {truncate(r.op.from ?? "", 10)} → {truncate(r.op.to ?? "", 10)}
                                                        </Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* right — watchpoints + what-changed quick search */}
                    <div className="min-w-0 space-y-3">
                        <div className="space-y-2.5 rounded-md border p-3">
                            <div className="flex items-center gap-1.5">
                                <Eye className="size-3.5 text-muted-foreground" aria-hidden/>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Watchpoints</p>
                            </div>
                            <form
                                className="flex gap-1.5"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    addWatch();
                                }}
                            >
                                <Input
                                    value={watchInput}
                                    onChange={(e) => setWatchInput(e.target.value)}
                                    placeholder="variable name, e.g. total"
                                    className="h-7 font-mono text-xs"
                                    aria-label="Add a watchpoint — a variable name to track across the timeline"
                                />
                                <Button type="submit" size="sm" variant="outline" className="h-7 shrink-0 text-xs">
                                    Watch
                                </Button>
                            </form>
                            {watchData.length === 0 ? (
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                    No watchpoints yet — add a name to see every step where it changed.
                                </p>
                            ) : (
                                <div
                                    className="space-y-2">{watchData.map((w) => watchHistoryBlock(w.name, w.changes))}</div>
                            )}
                        </div>

                        <div className="space-y-2 rounded-md border p-3">
                            <div className="flex items-center gap-1.5">
                                <Search className="size-3.5 text-muted-foreground" aria-hidden/>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What
                                    changed</p>
                            </div>
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && searchResults.length > 0) {
                                        setStep(searchResults[0]!.at);
                                    }
                                }}
                                placeholder="type a variable name…"
                                className="h-7 font-mono text-xs"
                                aria-label="Quick search — find the steps where a variable changed"
                            />
                            <AnimatePresence initial={false}>
                                {queryName && (
                                    <motion.div
                                        key="results"
                                        initial={{opacity: 0, y: -4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        transition={{duration: 0.15}}
                                        className="space-y-1"
                                    >
                                        {searchResults.length === 0 ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                No recorded change for <span className="font-mono">{queryName}</span> —
                                                it never appears in this trace.
                                            </p>
                                        ) : (
                                            <>
                                                <p className="px-1.5 text-[9px] text-muted-foreground">
                                                    {searchResults.length} change{searchResults.length === 1 ? "" : "s"} —
                                                    latest 6 shown
                                                </p>
                                                {searchResults.slice(-6).map((c) => changeRow(c, "q"))}
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section
            aria-label={`Time-travel debugger for ${fileName}`}
            className={cn("flex h-full min-h-0 flex-col", active ? "flex" : "hidden")}
        >
            {/* header row */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2 pt-3">
                <Bug className="size-4 text-red-500" aria-hidden/>
                <p className="text-sm font-semibold">Time-travel debugger</p>
                <Badge variant="secondary" className="max-w-[220px] truncate text-[10px] font-normal" title={fileName}>
                    {fileName}
                </Badge>
                {trace && (
                    <Badge variant="outline" className="text-[10px]">
                        {total} events
                    </Badge>
                )}
                {trace?.capped && (
                    <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                        title={`The tracer stopped after ${trace.totalEvents} events — the tail of the run was not recorded.`}
                    >
                        <TriangleAlert className="size-3" aria-hidden/>
                        capped at {trace.totalEvents} events
                    </Badge>
                )}
                {trace && <div className="ml-auto">{recordButton("Re-record")}</div>}
            </div>

            {/* timeline scrubber + transport — shown once a recording exists */}
            {trace && total > 0 && (
                <div className="shrink-0 space-y-1.5 px-4 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label={playing ? "Pause playback" : "Play — stops at time breakpoints"}
                            disabled={total < 2}
                            onClick={togglePlay}
                        >
                            {playing ? <Pause className="size-3.5"/> : <Play className="size-3.5"/>}
                        </Button>
                        <span className="flex items-center gap-1">
              <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-0.5 text-[11px]"
                  disabled={!hasBack("line")}
                  onClick={() => jumpBack("line")}
                  aria-label="Jump backward to the previous line event"
                  title="Jump backward to the previous line event"
              >
                <ChevronLeft className="size-3"/>
                Line
              </Button>
              <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-0.5 text-[11px]"
                  disabled={!hasBack("call")}
                  onClick={() => jumpBack("call")}
                  aria-label="Jump backward to the previous call event"
                  title="Jump backward to the previous call event"
              >
                <ChevronLeft className="size-3"/>
                Call
              </Button>
              <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-0.5 text-[11px]"
                  disabled={!hasBack("return")}
                  onClick={() => jumpBack("return")}
                  aria-label="Jump backward to the previous return event"
                  title="Jump backward to the previous return event"
              >
                <ChevronLeft className="size-3"/>
                Return
              </Button>
            </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-[11px]"
                            onClick={() => toggleMarkerAt(idx)}
                            aria-label="Toggle a time breakpoint at the current event"
                            title="Toggle a time breakpoint at the current event"
                        >
                            <Crosshair className="size-3"/>
                            {markerSet.has(idx) ? "Remove break" : "+ break here"}
                        </Button>
                        {markers.length > 0 && (
                            <Badge variant="outline"
                                   className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
                                {markers.length} time breakpoint{markers.length === 1 ? "" : "s"}
                            </Badge>
                        )}
                        <span className="ml-auto whitespace-nowrap font-mono text-xs text-muted-foreground"
                              aria-live="polite">
              Event {idx + 1} / {total}
            </span>
                    </div>

                    {/* the scrub track: progress fill + colored event ticks + thumb */}
                    <div className="relative h-7" role="group" aria-label="Event timeline scrubber">
                        <div
                            className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
                            <div className="absolute inset-y-0 left-0 bg-emerald-600/25" style={{width: `${pct}%`}}
                                 aria-hidden/>
                            {ticks.map((t) => (
                                <span
                                    key={t.at}
                                    className={cn("absolute top-0 bottom-0 w-[2px] opacity-70", TICK_COLOR[t.kind])}
                                    style={{left: `${tickPct(t.at)}%`}}
                                    aria-hidden
                                />
                            ))}
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={Math.max(0, total - 1)}
                            value={idx}
                            onChange={(e) => setStep(Number(e.target.value))}
                            className="absolute inset-x-0 top-0 h-7 w-full cursor-pointer appearance-none bg-transparent
                [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-emerald-600 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-emerald-600"
                            aria-label="Scrub through recorded events"
                            aria-valuetext={`Event ${idx + 1} of ${total}`}
                        />
                    </div>

                    {/* gutter-ish strip: click to drop/remove a time breakpoint */}
                    <div
                        role="button"
                        tabIndex={0}
                        className="relative h-4 cursor-pointer rounded-sm transition-colors hover:bg-muted/50"
                        aria-label={`Breakpoint strip — click anywhere to drop a time breakpoint${markers.length ? `, ${markers.length} set` : ""}`}
                        title="Click to drop (or remove) a time breakpoint at that event"
                        onClick={stripClick}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleMarkerAt(idx);
                            }
                        }}
                    >
                        <div className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden/>
                        {markers.map((m) => (
                            <button
                                key={m}
                                type="button"
                                className="absolute top-0.5 h-3 w-2.5 -translate-x-1/2 rounded-[2px] bg-amber-500 transition-colors hover:bg-amber-600"
                                style={{left: `${tickPct(m)}%`}}
                                aria-label={`Time breakpoint at event ${m + 1} — click to remove`}
                                title={`Breakpoint at event ${m + 1} — click to remove`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMarkerAt(m);
                                }}
                            />
                        ))}
                        {markers.length === 0 && total > 1 && (
                            <span
                                className="pointer-events-none absolute right-0 top-1 text-[9px] text-muted-foreground">
                click to drop a time breakpoint
              </span>
                        )}
                    </div>
                </div>
            )}

            {body}
        </section>
    );
}
