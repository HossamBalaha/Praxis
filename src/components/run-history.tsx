"use client";

import * as React from "react";
import {
    ChevronRight,
    CircleCheck,
    CircleX,
    Clock,
    Download,
    History,
    Play,
    RotateCcw,
    Trash2,
    Trophy,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,} from "@/components/ui/sheet";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {loadSettings} from "@/lib/settings";

export interface HistoryEntry {
    /** Unique id (timestamp + random). */
    id: string;
    /** ISO timestamp of when the run started. */
    startedAt: number;
    /** Folder display name. */
    folder: string;
    /** File display name. */
    file: string;
    /** Outcome of the run. */
    ok: boolean;
    /** Exit code (or -1 if killed/failed to start). */
    exitCode: number;
    /** Run duration in ms. */
    durationMs: number;
    /** Captured stdout. */
    stdout: string;
    /** Captured stderr. */
    stderr: string;
    /** Captured figure URLs. */
    figures: { url: string; name: string }[];
    /** Was the output truncated? */
    truncated: boolean;
    /** Was the run killed (timeout / stop)? */
    killed: boolean;
    /** ── RERUN CONTEXT (optional; recorded by the run launcher so the
     *  rerun affordance can relaunch the EXACT same run) ──
     *  Older entries simply lack these fields — the rerun then falls back
     *  to resolving the file by its display name (exactly what selecting
     *  an entry does today), so the feature degrades gracefully instead
     *  of breaking. All fields are optional so saveHistory keeps
     *  accepting every historical entry shape. */
    /** The folder's URL-safe slug (the `folder` field is a display name
     *  only — slugs are how the app actually addresses files). */
    folderSlug?: string;
    /** The file's URL-safe slug. */
    fileSlug?: string;
    /** The interpreter the run used (Settings → pythonInterpreter at
     *  run time) so a rerun hits the SAME env even after a settings
     *  change. */
    interpreter?: string;
    /** The CLI args the run was launched with (the Run args input,
     *  whitespace-split — the app's own run path takes an array). */
    args?: string[];
}

const STORAGE_KEY = `${STORAGE_PREFIX}.run-history`;
const DEFAULT_MAX_ENTRIES = 25;

/**
 * Resolve the configured max-history-entries at call time. Reads the
 * live settings so that a user changing the limit in Settings is
 * honored immediately on the next load/save. Falls back to the
 * default if settings can't be read or the value is invalid.
 */
function getMaxEntries(): number {
    try {
        const s = loadSettings().historyMaxEntries;
        return typeof s === "number" && s >= 1 ? s : DEFAULT_MAX_ENTRIES;
    } catch {
        return DEFAULT_MAX_ENTRIES;
    }
}

/** Load history from localStorage; newest first. */
export function loadHistory(): HistoryEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as HistoryEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(0, getMaxEntries());
    } catch {
        return [];
    }
}

/** Per-field cap for persisted stdout/stderr: the full
 *  output used to be embedded in every localStorage entry, so a couple
 *  of large runs pushed the whole history over localStorage's ~5 MB
 *  quota — after which every write threw and was silently dropped, and
 *  run history quietly stopped persisting. */
const MAX_PERSISTED_OUTPUT_CHARS = 100_000;
const OUTPUT_TRIM_NOTE = "\n…[output trimmed for history storage]";

function trimEntryForPersist(e: HistoryEntry): HistoryEntry {
    const stdoutTooLong = (e.stdout?.length ?? 0) > MAX_PERSISTED_OUTPUT_CHARS;
    const stderrTooLong = (e.stderr?.length ?? 0) > MAX_PERSISTED_OUTPUT_CHARS;
    if (!stdoutTooLong && !stderrTooLong) return e;
    return {
        ...e,
        stdout: stdoutTooLong
            ? e.stdout.slice(0, MAX_PERSISTED_OUTPUT_CHARS) + OUTPUT_TRIM_NOTE
            : e.stdout,
        stderr: stderrTooLong
            ? e.stderr.slice(0, MAX_PERSISTED_OUTPUT_CHARS) + OUTPUT_TRIM_NOTE
            : e.stderr,
    };
}

/** Persist history to localStorage. */
export function saveHistory(entries: HistoryEntry[]) {
    if (typeof window === "undefined") return;
    const max = getMaxEntries();
    const trimmed = entries.slice(0, max).map(trimEntryForPersist);
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        // quota exceeded even after per-entry trimming.
        // Drop the oldest entries progressively until it fits, instead of
        // silently discarding the whole write (entries are newest-first, so
        // slice(0, n) keeps the newest n).
        for (let n = trimmed.length - 1; n > 0; n--) {
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, n)));
                return;
            } catch { /* still too big — keep trimming */
            }
        }
        // Even a single entry doesn't fit — clear rather than keep stale data.
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */
        }
    }
}

interface RunHistoryProps {
    entries: HistoryEntry[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (entry: HistoryEntry) => void;
    onClear: () => void;
    /** Re-run one entry with its recorded interpreter/args — the
     *  prop-based wiring for the rerun affordance (every entry row gets
     *  a small play button). Called AFTER the PRAXIS_RERUN_RUN window
     *  event has been dispatched, so EITHER wiring works on its own:
     *  pass the prop, or listen for the event, or both. Optional — the
     *  rows stay functional without it (the event still fires). */
    onRerun?: (entry: HistoryEntry) => void;
}

/** The window event every rerun dispatches (detail: the FULL entry,
 *  including the recorded folderSlug/fileSlug/interpreter/args when
 *  the launcher filled them). Page-level code can listen for it with
 *  a plain addEventListener — no prop plumbing required. */
export const RERUN_EVENT_NAME = "PRAXIS_RERUN_RUN";

/**
 * Slide-in drawer showing the last N runs. Each entry is clickable to
 * re-open that run's stdout/stderr/figures in the main output panel
 * without re-running the script.
 *
 * Built on the shadcn Sheet primitive (Radix Dialog) so it gets
 * proper dialog semantics (role="dialog", aria-modal, focus trap,
 * Escape-to-close, focus restoration) for free — the previous
 * hand-rolled motion.aside had none of these.
 */
export function RunHistory({
                               entries,
                               open,
                               onOpenChange,
                               onSelect,
                               onClear,
                               onRerun,
                           }: RunHistoryProps) {
    const maxEntries = getMaxEntries();

    /** Re-launch one history entry with its recorded run context. Two
     *  independent channels fire so either wiring works: the window
     *  event (PRAXIS_RERUN_RUN — the same event-bus pattern the app's
     *  praxis:export / praxis:file-saved dispatches use) and the onRerun
     *  prop. The drawer intentionally STAYS OPEN on a rerun — the run
     *  streams into the output panel and the user may want to fire
     *  several reruns in a row. */
    const handleRerun = React.useCallback(
        (entry: HistoryEntry) => {
            window.dispatchEvent(
                new CustomEvent<HistoryEntry>(RERUN_EVENT_NAME, {detail: entry})
            );
            onRerun?.(entry);
        },
        [onRerun]
    );

    /** Export the history to a CSV file (file, ok, exitCode, durationMs,
     *  startedAt, folder, killed, truncated). Mirrors the BatchDialog's
     *  CSV export pattern. */
    const handleExportCsv = React.useCallback(() => {
        const headers = [
            "file",
            "folder",
            "ok",
            "exitCode",
            "durationMs",
            "startedAt",
            "killed",
            "truncated",
        ];
        const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const rows = entries.map((e) =>
            [
                escape(e.file),
                escape(e.folder),
                String(e.ok),
                String(e.exitCode),
                String(e.durationMs),
                new Date(e.startedAt).toISOString(),
                String(e.killed),
                String(e.truncated),
            ].join(",")
        );
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `praxis-run-history-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, [entries]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:w-[420px] sm:max-w-none p-0 gap-0 flex flex-col"
                aria-describedby="run-history-desc"
            >
                <SheetHeader className="px-4 py-3 border-b shrink-0 space-y-1 pr-10">
                    <div className="flex items-center gap-2 min-w-0">
                        <History className="size-4 shrink-0 text-emerald-500"/>
                        <SheetTitle className="text-sm font-semibold truncate">
                            Run history
                        </SheetTitle>
                        <span className="text-xs text-muted-foreground">
              ({entries.length})
            </span>
                    </div>
                    <SheetDescription id="run-history-desc" className="sr-only">
                        Past script runs. Click an entry to re-open its output.
                    </SheetDescription>
                </SheetHeader>

                {/* Toolbar — Export + Clear buttons. */}
                <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleExportCsv}
                        disabled={entries.length === 0}
                        className="h-8 gap-1.5 text-xs"
                        aria-label="Export run history as CSV"
                        title="Export run history as CSV"
                    >
                        <Download className="size-3.5"/>
                        Export CSV
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        disabled={entries.length === 0}
                        className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                        aria-label="Clear all history"
                        title="Clear all history"
                    >
                        <Trash2 className="size-3.5"/>
                        Clear
                    </Button>
                </div>

                <ScrollArea className="flex-1">
                    {entries.length === 0 ? (
                        // left-aligned, terminal-style.
                        <div className="px-4 py-6 text-left">
                            <div className="flex items-center gap-2 mb-2">
                                <History className="size-4 text-muted-foreground/40"/>
                                <span className="text-sm text-muted-foreground">No runs yet.</span>
                            </div>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                                Click <strong>Run</strong> on any script — your last{" "}
                                {maxEntries} runs will appear here.
                            </p>
                        </div>
                    ) : (
                        <div>
                            {/* Top-5 most-run leaderboard */}
                            <MostRunLeaderboard entries={entries} onSelect={onSelect}/>
                            <ul className="divide-y border-t">
                                {entries.map((e) => (
                                    /* Each history entry: the row body (click = re-open the
                                     * recorded output) + its own RERUN affordance (the play
                                     * button re-launches the same file with the recorded
                                     * interpreter/args via the app's normal run path). The
                                     * play button is a SIBLING of the row button — a button
                                     * must never nest inside another button (invalid HTML,
                                     * broken focus/AT behavior), so the row became a flex
                                     * pair instead of a single w-full button. */
                                    <li key={e.id} className="flex items-center gap-1">
                                        <button
                                            onClick={() => onSelect(e)}
                                            className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-start gap-3 group"
                                        >
                                            <StatusIcon entry={e}/>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                    {e.file}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {e.folder}
                                                </p>
                                                <div
                                                    className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                                                    <span>{formatRelative(e.startedAt)}</span>
                                                    <span>·</span>
                                                    <span>{(e.durationMs / 1000).toFixed(2)}s</span>
                                                    {e.exitCode !== 0 && (
                                                        <Badge variant="outline"
                                                               className="text-[9px] font-mono text-red-500 border-red-500/40 px-1 py-0">
                                                            exit {e.exitCode}
                                                        </Badge>
                                                    )}
                                                    {e.killed && (
                                                        <>
                                                            <span>·</span>
                                                            <span className="text-amber-500">killed</span>
                                                        </>
                                                    )}
                                                    {e.truncated && (
                                                        <>
                                                            <span>·</span>
                                                            <span className="text-amber-500">truncated</span>
                                                        </>
                                                    )}
                                                    {e.figures.length > 0 && (
                                                        <>
                                                            <span>·</span>
                                                            <span>
                              {e.figures.length} fig
                                                                {e.figures.length === 1 ? "" : "s"}
                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight
                                                className="size-4 text-muted-foreground/40 group-hover:text-emerald-500 shrink-0 mt-1"/>
                                        </button>
                                        {/* RERUN affordance — dispatches PRAXIS_RERUN_RUN with
                   * the full entry and calls onRerun when provided.
                   * Entries recorded before the rerun context fields
                   * existed get an honest tooltip (the run context is
                   * missing — the app resolves the file by name). */}
                                        <div className="shrink-0 pr-3">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn("size-8 rounded-full")}
                                                aria-label={`Re-run ${e.file}`}
                                                title={
                                                    e.folderSlug && e.fileSlug
                                                        ? `Re-run ${e.file} with the recorded interpreter${e.args && e.args.length > 0 ? ` and ${e.args.join(" ")} arguments` : " (no CLI args were recorded)"}`
                                                        : `Re-run ${e.file} (older entry — no recorded run context; the app resolves the file by name)`
                                                }
                                                onClick={() => handleRerun(e)}
                                            >
                                                <Play className="size-3.5 text-emerald-600 dark:text-emerald-400"/>
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

function StatusIcon({entry}: { entry: HistoryEntry }) {
    if (entry.killed) {
        return <Clock className="size-4 mt-0.5 text-amber-500 shrink-0"/>;
    }
    if (entry.ok) {
        return <CircleCheck className="size-4 mt-0.5 text-emerald-500 shrink-0"/>;
    }
    return <CircleX className="size-4 mt-0.5 text-red-500 shrink-0"/>;
}

function formatRelative(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 60_000) return "just now";
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
}

/** Small toolbar button that opens the history drawer. */
export function HistoryButton({
                                  onClick,
                                  count,
                              }: {
    onClick: () => void;
    count: number;
}) {
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className="size-9 rounded-full relative"
            aria-label="Open run history"
            title="Run history"
        >
            <RotateCcw className="size-4"/>
            {count > 0 && (
                <span
                    className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-medium flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
            )}
        </Button>
    );
}

/* ------------------------------------------------------------------ */
/*  Most-run leaderboard                                               */

/* ------------------------------------------------------------------ */
/**
 * Aggregates history entries by file name and shows the top 5 most-run
 * scripts at the top of the history drawer. Clicking a row loads the
 * most recent run of that script.
 */
function MostRunLeaderboard({
                                entries,
                                onSelect,
                            }: {
    entries: HistoryEntry[];
    onSelect: (entry: HistoryEntry) => void;
}) {
    const leaderboard = React.useMemo(() => {
        const counts = new Map<string, { file: string; folder: string; count: number; lastRun: HistoryEntry }>();
        for (const e of entries) {
            const key = `${e.folder}/${e.file}`;
            const existing = counts.get(key);
            if (existing) {
                existing.count++;
                if (e.startedAt > existing.lastRun.startedAt) {
                    existing.lastRun = e;
                }
            } else {
                counts.set(key, {
                    file: e.file,
                    folder: e.folder,
                    count: 1,
                    lastRun: e,
                });
            }
        }
        return Array.from(counts.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [entries]);

    if (leaderboard.length === 0) return null;

    return (
        <div className="px-4 py-3 bg-muted/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Trophy className="size-3"/>
                Most-run scripts
            </p>
            <div className="space-y-1">
                {leaderboard.map((item, i) => (
                    <button
                        key={`${item.folder}/${item.file}`}
                        onClick={() => onSelect(item.lastRun)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-accent/40 flex items-center gap-2 text-xs group"
                    >
            <span className={
                      i === 0 ? "text-amber-500 font-bold w-4" :
                          i === 1 ? "text-zinc-400 font-bold w-4" :
                              i === 2 ? "text-orange-700 font-bold w-4" :
                                  "text-muted-foreground w-4"
                  }>
              {i + 1}
            </span>
                        <span
                            className="truncate flex-1 font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
              {item.file}
            </span>
                        <Badge variant="secondary" className="text-[9px] px-1.5">
                            ×{item.count}
                        </Badge>
                    </button>
                ))}
            </div>
        </div>
    );
}
