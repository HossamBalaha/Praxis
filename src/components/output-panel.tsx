"use client";

import * as React from "react";
import {AnimatePresence, motion} from "framer-motion";
import Ansi from "ansi-to-react";
import {
    ArrowDownToLine,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleCheck,
    CircleX,
    Clock,
    Copy,
    Crosshair,
    Database,
    Download,
    Eraser,
    ExternalLink,
    Eye,
    FileCode2,
    FileDown,
    FileSpreadsheet,
    FolderSearch,
    FoldVertical,
    GitCompare,
    History,
    Image as ImageIcon,
    Loader2,
    MoreHorizontal,
    MousePointerClick,
    Palette,
    Percent,
    Pin,
    Search,
    Sparkles,
    Square,
    Terminal,
    TriangleAlert,
    WrapText,
    X,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// right-click menu on the output body (VS Code terminal /
// JetBrains console parity).
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {Button} from "@/components/ui/button";
import {Collapsible, CollapsibleContent,} from "@/components/ui/collapsible";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {loadSettings} from "@/lib/settings";
// Perf HUD — counts every render of the output panel into the
// per-panel registry (Settings → Editor → performance HUD).
import {reportPanelRender} from "@/lib/perf-metrics";
// run-format — pure helpers for the live elapsed readout, the
// timeout-vs-stop pill distinction and the dynamic truncation notice.
import {formatByteCap, formatElapsedRun, isTimeoutRun} from "@/lib/run-format";
import {AskAiButton} from "@/components/ask-ai-button";
// one-click "pip install <module>" — surfaces next to the traceback
// whenever the run died on ModuleNotFoundError.
import {missingModuleFrom, PipInstallButton} from "@/components/pip-install-button";
// Proactive run-output hints — missing data files the script itself
// reported + `pip install …` suggestions it printed (Section 6).
import {detectMissingDataFiles, suggestPipInstalls} from "@/lib/run-output-hints";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";

/**
 * Memoized Ansi renderer — only re-parses the ANSI escape sequences
 * when the `text` prop actually changes. The bare `<Ansi>` component
 * re-parses on every parent render, which is O(n) per SSE chunk during
 * streaming (O(n²) total for a long run). This wrapper decouples the
 * parse from the rest of the panel's render cycle.
 */
const MemoizedAnsi = React.memo(function MemoizedAnsi({
                                                          text,
                                                          useClasses,
                                                      }: {
    text: string;
    useClasses?: boolean;
}) {
    return <Ansi useClasses={useClasses}>{text}</Ansi>;
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */

/* ------------------------------------------------------------------ */
export interface Figure {
    url: string;
    name: string;
    /** — mpld3 HTML companion (zoom/pan) when mpld3 is
     *  installed; undefined otherwise. Served by the same /api/figure
     *  route (content-type text/html). */
    interactiveUrl?: string;
}

export interface DataFrameCapture {
    url: string;
    name: string;
    dfName?: string;
    shape?: number[];
    dtype?: string;
}

export interface VariableEntry {
    name: string;
    type: string;
    repr: string;
}

export interface CoverageMap {
    [fileName: string]: number[];
}

export interface RunResult {
    ok: boolean;
    exitCode?: number;
    stdout: string;
    stderr: string;
    truncated?: boolean;
    error?: string;
    durationMs?: number;
    interpreter?: string;
    killed?: boolean;
    /** True when the run died by the server-side hard timeout (not
     * a user stop) — carried by the end event's timedOut flag; the
     * stderr-marker sniff (isTimeoutRun) is the backwards-compatible
     * detection path for older/cached results. */
    timedOut?: boolean;
    figures?: Figure[];
    dataframes?: DataFrameCapture[];
    variables?: VariableEntry[];
    coverage?: CoverageMap;
    tests?: string[];
    /** True while the SSE stream is still flowing. */
    isStreaming?: boolean;
    /** When this result was cached (ms since epoch). */
    cachedAt?: number;
}

interface OutputPanelProps {
    /** Latest run result, or null if nothing has been run yet. */
    result: RunResult | null;
    /** True while a run is in flight (SSE stream open). */
    isRunning: boolean;
    /** The file that this output belongs to. */
    fileName?: string;
    /** Run ID of the in-flight stream (used by the stop button). */
    runId?: string | null;
    /** Called when the user clicks Stop. */
    onStop?: (runId: string) => void;
    /** Optional previous result of the same script (for diff view). */
    previousResult?: RunResult | null;
    /** Called when the user clicks "Export as Markdown". */
    onExportMd?: () => void;
    /** Called when the user clicks "Export as Jupyter notebook". */
    onExportIpynb?: () => void;
    /** Called when the user clicks "Export as standalone HTML". */
    onExportHtml?: () => void;
    /** Slugs needed to build export bodies (folder + file). */
    folderSlug?: string;
    fileSlug?: string;
    /** Called when the user pins/unpins the current result as a diff baseline. */
    onPinBaseline?: (result: RunResult | null) => void;
    /** True when a baseline is pinned. */
    isPinned?: boolean;
    /** AI endpoints from settings (for the "Ask AI" button on failed runs). */
    aiEndpoints?: Array<{ name: string; url: string; enabled: boolean }>;
    /** Source code of the current script (for AI questions). */
    sourceCode?: string;
    /** File name of the current script (for AI questions). */
    scriptFileName?: string;
    /** Coverage fail-under threshold (Settings → Testing) — the coverage
     *  tab computes the main file's statement % and marks it red below
     *  this. 0 = off. */
    coverageFailUnder?: number;
    /** Branch coverage switch (Settings → Testing) — when on, the
     *  coverage tab lists the main file's UNEXECUTED branch-decision
     *  lines (if/elif/while/for/except arms) as clickable jumps. */
    coverageBranch?: boolean;
    /** Custom AI question template from settings. */
    aiQuestionTemplate?: string;
    /** Show the search/filter box at the top of the output .
     *  Defaults to `true` so existing callers keep the search box. */
    outputSearchEnabled?: boolean;
    /** Auto-fold runs of 3+ identical stdout lines . When `false`,
     *  raw stdout is rendered verbatim. Defaults to
     *  `true` so existing callers keep the collapsible behavior. */
    collapsibleOutput?: boolean;
    /** where the Text/Figures/Tables/Vars/Coverage/Tests
     * tab strip sits — "top" (in the header row, the default) or
     * "left" (a vertical rail beside the body). */
    tabsPosition?: "top" | "left";
    /** soft-wrap the output body. On = long lines wrap
     *  (whitespace-pre-wrap, the historical behavior); off = lines stay
     *  on one row with a horizontal scrollbar (JetBrains "Use Soft
     *  Wraps" toggle, default on). Driven by Settings → Editor → Output. */
    outputWordWrap?: boolean;
    /** max LINES of stdout/stderr the panel RENDERS per run
     *  (older lines drop from the display with a notice; copy/export
     *  still use the full output). 0 = no limit. */
    outputBufferLimit?: number;
    /** the background-run groups MOVED OUT of this panel into
     * the bottom panel's dedicated "Background Runs" tab — Output stays
     * PURE for the run of the open file. The props
     * (backgroundRuns / onDismissBackgroundRun / onStopBackgroundRun)
     * are GONE; page.tsx renders <BackgroundRunGroup> itself. */
    /** deep-link token — increments when the user clicks
     * the browser notification for THIS run. On change the panel
     * scrolls its body to the bottom (the finished run's output) and
     * briefly flashes the summary header so the arrival is obvious. */
    focusRunToken?: number;
    /** send a line to the RUNNING script's stdin
     *  (interactive runs — input answered live). Present only while
     *  the primary run streams and it was started interactively. */
    onSendStdin?: (text: string) => Promise<void> | void;
    /** close the running script's stdin (EOF). */
    onSendStdinEof?: () => Promise<void> | void;
    /** "Explain this traceback" — opens the in-app AI
     *  chat with the failed run's stderr + tail of stdout preloaded. */
    onExplainTraceback?: (question: string) => void;
    /** Opens the folder's data-files browser — wired by the page so the
     *  run-hints bar's "missing data files" notice offers the one-click
     *  path to preview / manage them. */
    onOpenDataFiles?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Output themes                                                      */

/* ------------------------------------------------------------------ */
export interface OutputTheme {
    id: string;
    label: string;
    swatch: string;
    panelClass: string;
    headerBorderClass: string;
    labelClass: string;
    subtitleClass: string;
    stdoutClass: string;
    stderrClass: string;
    stderrErrorClass: string;
    mutedClass: string;
    emptyClass: string;
    runningClass: string;
    /** Status pill colours — theme-aware so they're visible on any background. */
    successClass: string;
    errorClass: string;
    warningClass: string;
    infoClass: string;
    /** Figure caption background + text. */
    figCaptionClass: string;
    /** Diff line colours. */
    diffAddClass: string;
    diffDelClass: string;
}

const THEMES: OutputTheme[] = [
    {
        id: "midnight",
        label: "Midnight",
        swatch: "bg-[#0d1117] border-zinc-700",
        panelClass: "bg-[oklch(0.18_0.005_220)]",
        headerBorderClass: "border-foreground/10",
        labelClass: "text-zinc-100",
        subtitleClass: "text-zinc-500",
        stdoutClass: "text-zinc-100",
        stderrClass: "text-amber-300/80",
        stderrErrorClass: "text-red-300",
        mutedClass: "text-zinc-500",
        emptyClass: "text-zinc-500",
        runningClass: "text-zinc-400",
        successClass: "text-emerald-400 bg-emerald-500/10",
        errorClass: "text-red-400 bg-red-500/10",
        warningClass: "text-amber-400 bg-amber-500/10",
        infoClass: "text-cyan-400 bg-cyan-500/10",
        figCaptionClass: "text-zinc-400 bg-black/30",
        diffAddClass: "bg-emerald-500/10 text-emerald-300",
        diffDelClass: "bg-red-500/10 text-red-300",
    },
    {
        id: "daylight",
        label: "Daylight",
        swatch: "bg-[#fafafa] border-zinc-300",
        panelClass: "bg-[oklch(0.985_0.002_220)]",
        headerBorderClass: "border-zinc-200",
        labelClass: "text-zinc-900",
        subtitleClass: "text-zinc-500",
        stdoutClass: "text-zinc-900",
        stderrClass: "text-amber-700",
        stderrErrorClass: "text-red-700",
        mutedClass: "text-zinc-400",
        emptyClass: "text-zinc-500",
        runningClass: "text-zinc-600",
        successClass: "text-emerald-700 bg-emerald-500/15",
        errorClass: "text-red-700 bg-red-500/15",
        warningClass: "text-amber-700 bg-amber-500/15",
        infoClass: "text-cyan-700 bg-cyan-500/15",
        figCaptionClass: "text-zinc-600 bg-zinc-100",
        diffAddClass: "bg-emerald-500/10 text-emerald-800",
        diffDelClass: "bg-red-500/10 text-red-800",
    },
    {
        id: "dracula",
        label: "Dracula",
        swatch: "bg-[#282a36] border-fuchsia-500/40",
        panelClass: "bg-[#282a36]",
        headerBorderClass: "border-foreground/10",
        labelClass: "text-fuchsia-200",
        subtitleClass: "text-zinc-400",
        stdoutClass: "text-[#f8f8f2]",
        stderrClass: "text-[#ffb86c]",
        stderrErrorClass: "text-[#ff5555]",
        mutedClass: "text-zinc-500",
        emptyClass: "text-zinc-500",
        runningClass: "text-[#bd93f9]",
        successClass: "text-[#50fa7b] bg-[#50fa7b]/15",
        errorClass: "text-[#ff5555] bg-[#ff5555]/15",
        warningClass: "text-[#ffb86c] bg-[#ffb86c]/15",
        infoClass: "text-[#8be9fd] bg-[#8be9fd]/15",
        figCaptionClass: "text-zinc-400 bg-black/30",
        diffAddClass: "bg-[#50fa7b]/10 text-[#50fa7b]",
        diffDelClass: "bg-[#ff5555]/10 text-[#ff5555]",
    },
    {
        id: "solarized-dark",
        label: "Solarized Dark",
        swatch: "bg-[#002b36] border-cyan-500/40",
        panelClass: "bg-[#002b36]",
        headerBorderClass: "border-foreground/10",
        labelClass: "text-[#2aa198]",
        subtitleClass: "text-[#586e75]",
        stdoutClass: "text-[#93a1a1]",
        stderrClass: "text-[#b58900]",
        stderrErrorClass: "text-[#dc322f]",
        mutedClass: "text-[#586e75]",
        emptyClass: "text-[#586e75]",
        runningClass: "text-[#268bd2]",
        successClass: "text-[#859900] bg-[#859900]/15",
        errorClass: "text-[#dc322f] bg-[#dc322f]/15",
        warningClass: "text-[#b58900] bg-[#b58900]/15",
        infoClass: "text-[#268bd2] bg-[#268bd2]/15",
        figCaptionClass: "text-[#586e75] bg-black/30",
        diffAddClass: "bg-[#859900]/10 text-[#859900]",
        diffDelClass: "bg-[#dc322f]/10 text-[#dc322f]",
    },
    {
        id: "solarized-light",
        label: "Solarized Light",
        swatch: "bg-[#fdf6e3] border-amber-700/40",
        panelClass: "bg-[#fdf6e3]",
        headerBorderClass: "border-zinc-300",
        labelClass: "text-[#2aa198]",
        subtitleClass: "text-[#93a1a1]",
        stdoutClass: "text-[#073642]",
        stderrClass: "text-[#b58900]",
        stderrErrorClass: "text-[#dc322f]",
        mutedClass: "text-[#93a1a1]",
        emptyClass: "text-[#93a1a1]",
        runningClass: "text-[#268bd2]",
        successClass: "text-[#859900] bg-[#859900]/15",
        errorClass: "text-[#dc322f] bg-[#dc322f]/15",
        warningClass: "text-[#b58900] bg-[#b58900]/15",
        infoClass: "text-[#268bd2] bg-[#268bd2]/15",
        figCaptionClass: "text-[#93a1a1] bg-[#eee8d5]",
        diffAddClass: "bg-[#859900]/10 text-[#859900]",
        diffDelClass: "bg-[#dc322f]/10 text-[#dc322f]",
    },
    {
        id: "monokai",
        label: "Monokai",
        swatch: "bg-[#272822] border-pink-500/40",
        panelClass: "bg-[#272822]",
        headerBorderClass: "border-foreground/10",
        labelClass: "text-[#a6e22e]",
        subtitleClass: "text-[#75715e]",
        stdoutClass: "text-[#f8f8f2]",
        stderrClass: "text-[#e6db74]",
        stderrErrorClass: "text-[#f92672]",
        mutedClass: "text-[#75715e]",
        emptyClass: "text-[#75715e]",
        runningClass: "text-[#66d9ef]",
        successClass: "text-[#a6e22e] bg-[#a6e22e]/15",
        errorClass: "text-[#f92672] bg-[#f92672]/15",
        warningClass: "text-[#e6db74] bg-[#e6db74]/15",
        infoClass: "text-[#66d9ef] bg-[#66d9ef]/15",
        figCaptionClass: "text-[#75715e] bg-black/30",
        diffAddClass: "bg-[#a6e22e]/10 text-[#a6e22e]",
        diffDelClass: "bg-[#f92672]/10 text-[#f92672]",
    },
    {
        id: "matrix",
        label: "Matrix",
        swatch: "bg-black border-emerald-500/60",
        panelClass: "bg-black",
        headerBorderClass: "border-emerald-500/20",
        labelClass: "text-emerald-400",
        subtitleClass: "text-emerald-700",
        stdoutClass: "text-emerald-300",
        stderrClass: "text-amber-400",
        stderrErrorClass: "text-red-500",
        mutedClass: "text-emerald-700",
        emptyClass: "text-emerald-700",
        runningClass: "text-emerald-500",
        successClass: "text-emerald-300 bg-emerald-500/15",
        errorClass: "text-red-400 bg-red-500/15",
        warningClass: "text-amber-400 bg-amber-500/15",
        infoClass: "text-emerald-400 bg-emerald-500/10",
        figCaptionClass: "text-emerald-700 bg-black/50",
        diffAddClass: "bg-emerald-500/10 text-emerald-300",
        diffDelClass: "bg-red-500/10 text-red-400",
    },
    {
        id: "github-dark",
        label: "GitHub Dark",
        swatch: "bg-[#0d1117] border-blue-500/40",
        panelClass: "bg-[#0d1117]",
        headerBorderClass: "border-[#30363d]",
        labelClass: "text-[#58a6ff]",
        subtitleClass: "text-[#8b949e]",
        stdoutClass: "text-[#c9d1d9]",
        stderrClass: "text-[#d29922]",
        stderrErrorClass: "text-[#f85149]",
        mutedClass: "text-[#8b949e]",
        emptyClass: "text-[#8b949e]",
        runningClass: "text-[#58a6ff]",
        successClass: "text-[#3fb950] bg-[#3fb950]/15",
        errorClass: "text-[#f85149] bg-[#f85149]/15",
        warningClass: "text-[#d29922] bg-[#d29922]/15",
        infoClass: "text-[#58a6ff] bg-[#58a6ff]/15",
        figCaptionClass: "text-[#8b949e] bg-black/30",
        diffAddClass: "bg-[#3fb950]/10 text-[#3fb950]",
        diffDelClass: "bg-[#f85149]/10 text-[#f85149]",
    },
];

const DEFAULT_THEME_ID = "midnight";
const STORAGE_KEY = `${STORAGE_PREFIX}.output-theme`;

function loadSavedThemeId(): string {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved && THEMES.some((t) => t.id === saved)) return saved;
    } catch {
        /* ignore */
    }
    // Fall back to the `defaultOutputTheme` setting.
    try {
        const cfg = loadSettings().defaultOutputTheme;
        if (cfg && cfg !== "follow" && THEMES.some((t) => t.id === cfg)) return cfg;
    } catch {
        /* ignore */
    }
    return DEFAULT_THEME_ID;
}

/* ------------------------------------------------------------------ */
/* — background run group (parallel runs) */

/* ------------------------------------------------------------------ */

/** One demoted run: header (status, file, duration/exit, stop,
 * dismiss) + a collapsible, capped stdout/stderr preview. The group
 * keeps updating while the SSE reader streams into it.
 * EXPORTED — the group now renders in the bottom panel's
 * dedicated "Background Runs" TAB (page.tsx) instead of being
 * squeezed into the Output panel's header (the "keep the
 * output pure for running the scripts" ask). */
export function BackgroundRunGroup({
                                       run,
                                       onDismiss,
                                       onStop,
                                   }: {
    run: {
        key: string;
        folderName: string;
        fileName: string;
        runId: string | null;
        result: RunResult;
        startedAt: number;
    };
    onDismiss?: (key: string) => void;
    onStop?: (runId: string) => void;
}) {
    const [open, setOpen] = React.useState(true);
    const r = run.result;
    const streaming = !!r.isStreaming;
    // (bonus): a background group that died by the server-side
    // hard timeout used to render only the red dot + "exit -1" — exactly
    // like a crash. Reuse the same timeout-vs-stop detection the Output
    // panel's status pill uses (explicit timedOut flag first, then the
    // stderr-marker sniff) and show a "Timed out" mini-pill instead.
    const groupTimedOut =
        !streaming && !!r.killed &&
        (!!r.timedOut || isTimeoutRun(r.stderr, r.error));
    // Cap the preview — the run history + the ✕ keep full output
    // reachable, the group is a live glance, not a second full panel.
    const PREVIEW_CHARS = 4000;
    const preview =
        (r.stderr.trim() ? r.stderr : r.stdout).length > PREVIEW_CHARS
            ? (r.stderr.trim() ? r.stderr : r.stdout).slice(0, PREVIEW_CHARS) +
            "\n… (preview truncated — open the Run history for the full output)"
            : r.stderr.trim() || r.stdout;
    return (
        <div className="rounded-md border overflow-hidden bg-muted/20">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 text-[10px]">
        <span
            className={
                "size-1.5 rounded-full shrink-0 " +
                (streaming
                    ? "bg-amber-500 animate-pulse"
                    : r.ok
                        ? "bg-emerald-500"
                        : "bg-red-500")
            }
            aria-hidden
        />
                <span className="font-medium truncate" title={`${run.folderName}/${run.fileName}`}>
          {run.fileName || "run"}
                    {run.folderName && (
                        <span className="text-muted-foreground/70 font-normal"> · {run.folderName}</span>
                    )}
        </span>
                {!streaming && (
                    groupTimedOut ? (
                        <span
                            className="shrink-0 tabular-nums text-amber-600 dark:text-amber-400"
                            title="Killed by the hard run timeout (not a user stop)"
                        >
              Timed out
                            {typeof r.durationMs === "number" ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
                    ) : (
                        <span
                            className={
                                "shrink-0 tabular-nums " +
                                (r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
                            }
                        >
              {r.ok ? "exit 0" : `exit ${r.exitCode ?? "?"}`}
                            {typeof r.durationMs === "number" ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
                    )
                )}
                <span className="flex-1"/>
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground px-1"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-label={open ? "Collapse this background run" : "Expand this background run"}
                    title={open ? "Collapse" : "Expand"}
                >
                    {open ? <ChevronDown className="size-3"/> : <ChevronRight className="size-3"/>}
                </button>
                {streaming && run.runId && onStop && (
                    <button
                        type="button"
                        className="text-red-500 hover:text-red-600 px-1"
                        onClick={() => onStop(run.runId as string)}
                        aria-label="Stop this background run"
                        title="Stop this background run"
                    >
                        <Square className="size-3"/>
                    </button>
                )}
                {onDismiss && (
                    <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground px-1"
                        onClick={() => onDismiss(run.key)}
                        aria-label="Dismiss this background run"
                        title="Dismiss this group"
                    >
                        <X className="size-3"/>
                    </button>
                )}
            </div>
            {open && (
                <pre
                    className="px-2 py-1 max-h-32 overflow-y-auto font-mono text-[10px] whitespace-pre-wrap break-words text-foreground/80">
          {preview || (streaming ? "…" : "(no output)")}
        </pre>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Stdout segmentation + search helpers                              */
/* ------------------------------------------------------------------ */

/** A single piece of preprocessed stdout. "line" segments are rendered
 *  verbatim; "identical" segments collapse a run of 3+ identical lines
 *  into a clickable row. */
type Segment =
    | { type: "line"; text: string; lineNum: number }
    | { type: "identical"; count: number; text: string; startLine: number; key: number };

/** Split stdout into segments, grouping runs of 3+ identical consecutive
 *  lines into a single "identical" segment. `lineNum` / `startLine` are
 *  1-based to match editor conventions. */
function buildStdoutSegments(stdout: string): Segment[] {
    if (!stdout) return [];
    const lines = stdout.split("\n");
    const segments: Segment[] = [];
    let i = 0;
    let segKey = 0;
    while (i < lines.length) {
        const cur = lines[i];
        let j = i + 1;
        while (j < lines.length && lines[j] === cur) j++;
        const run = j - i;
        if (run >= 3) {
            segments.push({
                type: "identical",
                count: run,
                text: cur,
                startLine: i + 1,
                key: segKey++,
            });
        } else {
            for (let k = i; k < j; k++) {
                segments.push({type: "line", text: lines[k], lineNum: k + 1});
            }
        }
        i = j;
    }
    return segments;
}

/** Render preprocessed stdout segments. Consecutive "line" segments are
 *  merged into a single `<Ansi>` block so cross-line ANSI color state is
 *  preserved (matches the original single-block rendering). "identical"
 *  segments become a clickable row that expands to reveal the repeated
 *  lines. */
function renderStdoutBlocks(
    segments: Segment[],
    expandedSections: Set<number>,
    setExpandedSections: React.Dispatch<React.SetStateAction<Set<number>>>,
    theme: OutputTheme
): React.ReactNode {
    const blocks: React.ReactNode[] = [];
    const textBuf: string[] = [];
    let blockIdx = 0;
    //  — output virtualization. Each emitted block gets
    // the `cv-line` class (content-visibility: auto + an intrinsic-size
    // estimate, defined in globals.css). The browser then skips layout+
    // paint for offscreen blocks, so a 20,000-line stdout scrolls as
    // smoothly as a 200-line one while the DOM stays complete (copy /
    // export / Ctrl+F unaffected). Blocks are capped at CV_CHUNK lines
    // so the virtualization granularity is fine enough to matter.
    const CV_CHUNK = 250;
    const flush = () => {
        while (textBuf.length > 0) {
            const chunk = textBuf.splice(0, CV_CHUNK);
            blocks.push(
                <div className="cv-line" key={`t-${blockIdx++}`}>
                    <Ansi useClasses={false}>{chunk.join("\n")}</Ansi>
                </div>
            );
        }
    };

    for (const seg of segments) {
        if (seg.type === "line") {
            textBuf.push(seg.text);
        } else {
            flush();
            const expanded = expandedSections.has(seg.key);
            blocks.push(
                <div key={`s-${seg.key}`} className="my-1 cv-line">
                    <button
                        type="button"
                        onClick={() =>
                            setExpandedSections((prev) => {
                                const next = new Set(prev);
                                if (next.has(seg.key)) next.delete(seg.key);
                                else next.add(seg.key);
                                return next;
                            })
                        }
                        className={cn(
                            "w-full text-left text-[11px] px-2 py-1 rounded font-mono",
                            "bg-foreground/5 hover:bg-foreground/10 border border-foreground/10",
                            theme.subtitleClass
                        )}
                        aria-expanded={expanded}
                        title={expanded ? "Click to collapse" : "Click to expand"}
                    >
                        <ChevronDown
                            className={cn(
                                "size-3 inline mr-1 align-middle transition-transform",
                                expanded && "rotate-180"
                            )}
                        />
                        [ {seg.count} identical lines:{" "}
                        <span className="font-mono">
              {seg.text || "(empty line)"}
            </span>{" "}
                        ]
                    </button>
                    {expanded && (
                        <div className="pl-3 pt-1">
                            <Ansi useClasses={false}>
                                {Array.from({length: seg.count}, () => seg.text).join("\n")}
                            </Ansi>
                        </div>
                    )}
                </div>
            );
        }
    }
    flush();
    return blocks;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
// memoized. The page re-renders on every footer
// cursor update and every editor keystroke; OutputPanel's props are
// all stable across those renders (handler props are useCallback'd in
// the page, result only changes during runs), so React.memo now skips
// the whole output tree — including the per-render derived-string work
// below — unless a run actually progresses or the selection changes.
export const OutputPanel = React.memo(function OutputPanel({
                                                               result,
                                                               isRunning,
                                                               fileName,
                                                               runId,
                                                               onStop,
                                                               previousResult,
                                                               onExportMd,
                                                               onExportIpynb,
                                                               onExportHtml,
                                                               folderSlug,
                                                               fileSlug,
                                                               onPinBaseline,
                                                               isPinned,
                                                               aiEndpoints,
                                                               sourceCode,
                                                               scriptFileName,
                                                               coverageFailUnder = 0,
                                                               coverageBranch = false,
                                                               aiQuestionTemplate,
                                                               outputSearchEnabled = true,
                                                               collapsibleOutput = true,
                                                               tabsPosition = "top",
                                                               outputWordWrap = true,
                                                               outputBufferLimit = 0,
                                                               focusRunToken,
                                                               onSendStdin,
                                                               onSendStdinEof,
                                                               onExplainTraceback,
                                                               onOpenDataFiles,
                                                           }: OutputPanelProps) {
    // Count THIS render into the Perf HUD's per-panel registry — the
    // memo boundary above only SKIPS renders; this line measures what
    // actually gets through (the HUD's real per-panel render counts).
    reportPanelRender("Output");
    const [themeId, setThemeId] = React.useState<string>(DEFAULT_THEME_ID);
    const {toast} = useToast();

    /* ── PROACTIVE RUN HINTS ──────────────
* Parsed from the FINISHED run's own output — a script that
* pre-flights its data files prints "missing: X.csv" lines, and a
* degraded run prints the exact "pip install a b c" command it
* wants. Both become actionable buttons right under the output.
* Hidden while the stream is still flowing (the output is still
* growing) and re-derived per result. */
    const missingDataFiles = React.useMemo(() => {
        if (!result || isRunning) return [];
        return detectMissingDataFiles(`${result.stdout}\n${result.stderr}`);
    }, [result, isRunning]);
    const pipSuggestions = React.useMemo(() => {
        if (!result || isRunning) return [];
        return suggestPipInstalls(`${result.stderr}\n${result.stdout}`);
    }, [result, isRunning]);
    const [mounted, setMounted] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [showDiff, setShowDiff] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<
        "output" | "figures" | "dataframes" | "variables" | "coverage" | "tests"
    >("output");
    const [lightboxFigure, setLightboxFigure] = React.useState<Figure | null>(null);
    // "size" sort is unreachable from the UI (only name+time are
    // exposed); keep the type narrow so dead branches are not modeled.
    const [figureSort, setFigureSort] = React.useState<"name" | "time">("name");
    const [bodyHeight, setBodyHeight] = React.useState(400); // px, drag-resizable

    // Output search/filter and collapsible identical-line
    // runs. Both states live here in OutputPanel so they
    // persist across re-renders while stdout streams in.
    const [outputSearch, setOutputSearch] = React.useState("");
    // Debounce the output search so rapid typing doesn't re-split +
    // re-filter all stdout/stderr lines on every keystroke. For a run
    // with 50,000 lines of stdout this is O(n) per keystroke —
    // useDeferredValue moves it to a lower-priority render.
    const deferredOutputSearch = React.useDeferredValue(outputSearch);
    const [expandedSections, setExpandedSections] = React.useState<Set<number>>(
        new Set()
    );

    // Clear-output (display only) + auto-scroll toggle + stream filter.
    // `displayCleared` hides the rendered stdout/stderr WITHOUT touching
    // the parent's runResult or the run history — it resets when a new
    // run starts, the run finishes, or the selected file changes.
    const [displayCleared, setDisplayCleared] = React.useState(false);
    const [autoScroll, setAutoScroll] = React.useState(true);

    //  — interactive stdin: the draft line + the last
    // write result (for the inline "sent"/error hint). Reset per run.
    const [stdinDraft, setStdinDraft] = React.useState("");
    const [stdinNote, setStdinNote] = React.useState<string | null>(null);
    const stdinNoteTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendStdinLine = async (eof = false) => {
        const text = stdinDraft;
        if (!eof && !text.trim()) return;
        try {
            if (eof) await onSendStdinEof?.();
            else await onSendStdin?.(text);
            setStdinNote(eof ? "EOF sent" : "sent");
            setStdinDraft("");
        } catch (err) {
            setStdinNote((err as Error).message || "failed");
        }
        if (stdinNoteTimer.current) clearTimeout(stdinNoteTimer.current);
        stdinNoteTimer.current = setTimeout(() => setStdinNote(null), 2500);
    };
    // ─── output context-menu toggles (declared early — the
    // segmentation memo below reads foldOn). Local overrides of the
    // outputWordWrap / collapsibleOutput props; persistent defaults live
    // in Settings → Editor → Output.
    const [wrapOverride, setWrapOverride] = React.useState<boolean | null>(null);
    const [foldOverride, setFoldOverride] = React.useState<boolean | null>(null);
    const wrapOn = wrapOverride ?? outputWordWrap;
    const foldOn = foldOverride ?? collapsibleOutput;

    const [streamFilter, setStreamFilter] = React.useState<
        "all" | "stdout" | "stderr"
    >("all");
    const outputScrollRef = React.useRef<HTMLDivElement>(null);
    const prevRunningRef = React.useRef(false);
    const prevFileRef = React.useRef(fileName);

    // notification deep-link — the token increments when
    // the user clicks the browser notification for the finished run.
    // Scroll the body to the bottom (newest output) and flash the
    // summary header for ~1.2s so the arrival is unmistakable.
    const [flashHeader, setFlashHeader] = React.useState(false);
    React.useEffect(() => {
        if (focusRunToken === undefined || focusRunToken === 0) return;
        setActiveTab("output");
        const el = outputScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        setFlashHeader(true);
        const t = window.setTimeout(() => setFlashHeader(false), 1200);
        return () => window.clearTimeout(t);
    }, [focusRunToken]);

    // Auto-switch to the Figures tab when a finished run produces figures.
    React.useEffect(() => {
        if (result?.figures && result.figures.length > 0 && !isRunning) {
            setActiveTab("figures");
        } else if (!result?.figures?.length) {
            setActiveTab("output");
        }
    }, [result, isRunning]);

    // After hydration, load the saved theme. Avoids SSR mismatch.
    React.useEffect(() => {
        setThemeId(loadSavedThemeId());
        setMounted(true);
    }, []);

    // Reset the "display cleared" flag when a new run starts, the current
    // run finishes, or the selected file changes — so cleared output is
    // automatically restored for the next run / file (Clear-button feature).
    React.useEffect(() => {
        const newRunStarted = !prevRunningRef.current && isRunning;
        const runFinished = prevRunningRef.current && !isRunning;
        if (newRunStarted || runFinished) setDisplayCleared(false);
        prevRunningRef.current = isRunning;
    }, [isRunning]);

    React.useEffect(() => {
        if (prevFileRef.current !== fileName) {
            setDisplayCleared(false);
            prevFileRef.current = fileName;
        }
    }, [fileName]);

    // Auto-scroll the output panel to the bottom when new streaming output
    // arrives, or when a run finishes — but only while autoScroll is on.
    // When off, the panel respects the manual scroll position.
    React.useEffect(() => {
        if (!autoScroll) return;
        const el = outputScrollRef.current;
        if (!el) return;
        requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
    }, [result?.stdout, result?.stderr, isRunning, autoScroll]);

    const theme = React.useMemo(
        () => THEMES.find((t) => t.id === themeId) ?? THEMES[0],
        [themeId]
    );

    const handleThemeChange = (id: string) => {
        setThemeId(id);
        try {
            window.localStorage.setItem(STORAGE_KEY, id);
        } catch {
            /* ignore */
        }
    };

    // the derived strings are memoized on `result` so
    // they are recomputed only when a run actually progresses — not on
    // every parent re-render (cursor moves, editor keystrokes) as before.
    const hasOutput = React.useMemo(
        () => !!result && (!!result.stdout.trim() || !!result.stderr.trim()),
        [result]
    );
    const stderrOnly = React.useMemo(
        () => !!result && !result.ok && !result.stdout.trim() && !!result.stderr.trim(),
        [result]
    );

    const fullOutput = React.useMemo(
        () =>
            result
                ? (result.stdout.trimEnd() +
                    (result.stderr.trimEnd()
                        ? (result.stdout.trim() ? "\n\n--- stderr ---\n" : "") +
                        result.stderr.trimEnd()
                        : ""))
                    .trim()
                : "",
        [result]
    );

    // The byte-cap label for the truncation notice (1d): read from the
    // SAME Settings → Advanced maxOutputBytes the run request forwards
    // (page.tsx sends it as the run's maxOutputBytes body field). The
    // notice used to hard-code "2 MB" even when the user had raised or
    // lowered the cap. Falls back to the historical 2 MB default when
    // unset/unreadable; formatted with the same phrasing the server's
    // stderr line uses so the pill and the stream agree.
    // (stale label): this memo used [] deps, so changing the
    // cap in Settings mid-session kept rendering the STALE value until
    // the panel remounted. Every settings writer broadcasts the
    // `praxis:settings-saved` window event (same channel code-viewer /
    // file-viewer / data-file-browser use); a nonce bumped by that event
    // re-keys the memo so the label updates live.
    const [settingsNonce, setSettingsNonce] = React.useState(0);
    React.useEffect(() => {
        const onSettingsSaved = () => setSettingsNonce((n) => n + 1);
        window.addEventListener("praxis:settings-saved", onSettingsSaved);
        return () => window.removeEventListener("praxis:settings-saved", onSettingsSaved);
    }, []);
    const truncationCapLabel = React.useMemo(() => {
        void settingsNonce; // re-read trigger only
        try {
            const cap = loadSettings().maxOutputBytes;
            return formatByteCap(
                typeof cap === "number" && cap > 1024 ? cap : 2_000_000
            );
        } catch {
            return formatByteCap(2_000_000);
        }
    }, [settingsNonce]);

    /* ----------------------------------------------------------------
   *  Stdout search + segmentation
   * -------------------------------------------------------------- */

    // Use the same trimmed text the original <pre> rendered so line numbers
    // line up with what the user sees in a normal run.
    // outputBufferLimit caps how many lines are RENDERED —
    // huge runs stay responsive; a notice shows what was dropped
    // (copy/export still use the full text via fullOutput).
    const applyRenderLimit = React.useCallback(
        (text: string): string => {
            if (outputBufferLimit <= 0) return text;
            const lines = text.split("\n");
            if (lines.length <= outputBufferLimit) return text;
            const dropped = lines.length - outputBufferLimit;
            return `… ${dropped.toLocaleString()} earlier line${dropped === 1 ? "" : "s"} hidden (Settings → Editor → Output render limit) …\n` + lines.slice(-outputBufferLimit).join("\n");
        },
        [outputBufferLimit]
    );
    const stdoutText = React.useMemo(
        () => applyRenderLimit(result?.stdout?.trimEnd() ?? ""),
        [result?.stdout, applyRenderLimit]
    );
    const stderrText = React.useMemo(
        () => applyRenderLimit(result?.stderr?.trimEnd() ?? ""),
        [result?.stderr, applyRenderLimit]
    );

    const totalStdoutLines = React.useMemo(
        () => (stdoutText ? stdoutText.split("\n").length : 0),
        [stdoutText]
    );

    // When the user types in the search box, compute the subset of stdout
    // lines that match (case-insensitive substring). Returns null when the
    // search is empty (or the search box is disabled) so the segmented view
    // is used instead.
    const filteredStdoutLines = React.useMemo<
        { lineNum: number; text: string }[] | null
    >(() => {
        if (!outputSearchEnabled) return null;
        const q = deferredOutputSearch.trim().toLowerCase();
        if (!q || !stdoutText) return null;
        return stdoutText
            .split("\n")
            .map((text, idx) => ({lineNum: idx + 1, text}))
            .filter((l) => l.text.toLowerCase().includes(q));
    }, [stdoutText, deferredOutputSearch, outputSearchEnabled]);

    // Same idea as `filteredStdoutLines`, but for stderr — used by the
    // stream-filter "stderr" chip + the toolbar match count.
    const totalStderrLines = React.useMemo(
        () => (stderrText ? stderrText.split("\n").length : 0),
        [stderrText]
    );

    const filteredStderrLines = React.useMemo<
        { lineNum: number; text: string }[] | null
    >(() => {
        if (!outputSearchEnabled) return null;
        const q = deferredOutputSearch.trim().toLowerCase();
        if (!q || !stderrText) return null;
        return stderrText
            .split("\n")
            .map((text, idx) => ({lineNum: idx + 1, text}))
            .filter((l) => l.text.toLowerCase().includes(q));
    }, [stderrText, deferredOutputSearch, outputSearchEnabled]);

    // Pre-segment stdout into collapsible runs of identical lines. Only
    // computed when the search box is empty (or disabled) and
    // `collapsibleOutput` is enabled — when searching we show flat numbered
    // lines instead, and when collapsibleOutput is off we render the raw
    // stdout verbatim.
    const stdoutSegments = React.useMemo<Segment[]>(
        () => {
            if (!stdoutText || !foldOn) return [];
            if (outputSearchEnabled && outputSearch.trim()) return [];
            // skip segmentation while the run is still
            // streaming — it was recomputed over the whole buffer on every
            // SSE chunk (quadratic total work for a run near the 2 MB cap).
            // The raw stream renders verbatim while running; segments are
            // built once when the run finishes.
            if (isRunning) return [];
            return buildStdoutSegments(stdoutText);
        },
        [stdoutText, outputSearch, outputSearchEnabled, foldOn, isRunning]
    );

    const handleCopy = async () => {
        if (!fullOutput) return;
        try {
            await navigator.clipboard.writeText(fullOutput);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard blocked */
        }
    };

    // Ctrl/Cmd+C inside the output body with NOTHING
    // selected copies the whole output AND notifies —
    // an explicit feedback loop. Reuses handleCopy's clipboard logic.
    const handleCopyAll = async () => {
        if (!fullOutput) return;
        try {
            await navigator.clipboard.writeText(fullOutput);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast({
                title: "Output copied",
                description: `${fullOutput.length.toLocaleString()} characters copied to the clipboard.`,
                variant: "success",
            });
        } catch {
            toast({
                title: "Clipboard blocked",
                description: "The browser denied clipboard access — select the text and copy manually.",
                variant: "destructive",
            });
        }
    };

    // Clear the displayed stdout/stderr only — the parent's runResult
    // and run history are untouched. Re-running / switching files restores
    // the real output (see the reset effects above).
    const handleClear = () => {
        setDisplayCleared(true);
    };

    // ─── output context-menu state + actions ────────────
    // Word-wrap + fold-runs are PROPS from settings; the right-click
    // toggles apply a local override for this panel until reload (the
    // persistent defaults live in Settings → Editor → Output).
    const outputSearchInputRef = React.useRef<HTMLInputElement | null>(null);

    /** Save the whole run (header + stdout + stderr) as a .txt file. */
    const handleSaveOutputFile = () => {
        if (!result || (!fullOutput && !result.error)) {
            toast({title: "Nothing to save — run a script first.", variant: "destructive"});
            return;
        }
        const lines: string[] = [];
        lines.push(`# Praxis run output`);
        if (fileName) lines.push(`# File: ${fileName}`);
        if (result.interpreter) lines.push(`# Interpreter: ${result.interpreter}`);
        if (typeof result.durationMs === "number") lines.push(`# Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
        if (typeof result.exitCode === "number") lines.push(`# Exit code: ${result.exitCode}`);
        lines.push(`# Saved: ${new Date().toLocaleString()}`, "");
        lines.push(fullOutput || String(result.error ?? ""));
        const blob = new Blob([lines.join("\n")], {type: "text/plain;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(fileName ?? "run").replace(/\.[A-Za-z0-9]+$/, "")}-output.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast({title: "Output saved", description: `${a.download} downloaded.`, variant: "success"});
    };

    /** Scroll the output body to the very bottom ("Scroll to the end"). */
    const handleJumpToLatest = () => {
        const el = outputScrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    };

    /** Focus the in-panel output search (Ctrl+F feel, from the menu). */
    const handleFocusOutputSearch = () => {
        if (!outputSearchEnabled) return;
        const el = outputSearchInputRef.current;
        if (el) {
            el.focus();
            el.select();
        }
    };

    const handleStop = () => {
        // call even before the runId arrives — the page routes
        // through the selection-aware stopper, which aborts the in-flight
        // fetch when no child exists yet.
        if (onStop) onStop(runId ?? "");
    };

    // ── the waiting-for-input heuristic state ──────────────
    // PERF: the 600 ms quiet-check runs in a ref and only flips a
    // boolean through setState when the RESULT changes (hint on/off) —
    // the old always-ticking `nowTick` state re-rendered the whole
    // panel ~1.7×/s for the entire run duration just to evaluate this
    // one expression. `lastOutputAtRef` stamps every streamed chunk.
    const [awaitingInputHint, setAwaitingInputHint] = React.useState(false);
    const lastOutputAtRef = React.useRef(Date.now());
    const lastStreamCharRef = React.useRef("");
    const hintDepsRef = React.useRef({can: false, running: false});
    hintDepsRef.current = {can: !!onSendStdin, running: isRunning};
    React.useEffect(() => {
        lastOutputAtRef.current = Date.now();
        lastStreamCharRef.current = (result?.stdout ?? "").slice(-1);
    }, [result?.stdout, result?.stderr]);
    React.useEffect(() => {
        if (!isRunning) {
            setAwaitingInputHint(false);
            return;
        }
        const t = setInterval(() => {
            const {can} = hintDepsRef.current;
            const quiet = Date.now() - lastOutputAtRef.current > 1400;
            const last = lastStreamCharRef.current;
            const next = can && quiet && last !== "" && last !== "\n";
            setAwaitingInputHint((prev) => (prev === next ? prev : next));
        }, 600);
        return () => clearInterval(t);
    }, [isRunning]);

    // live elapsed clock for the RUNNING body view (1a) — the
    // pill runs its own instance; this one feeds the "Running script…"
    // header row. Both restart on a new runId/file.
    const runningElapsedMs = useRunElapsed(isRunning, (runId ?? fileName) ?? undefined);

    const onServer = !mounted;
    const activeTheme = onServer ? THEMES[0] : theme;

    const hasFigures = !!result?.figures && result.figures.length > 0;
    const hasDataframes = !!result?.dataframes && result.dataframes.length > 0;
    const hasVariables = !!result?.variables && result.variables.length > 0;
    const hasCoverage = !!result?.coverage && Object.keys(result.coverage).length > 0;
    const hasTests = !!result?.tests && result.tests.length > 0;
    const hasDiff =
        !!previousResult &&
        !!result &&
        previousResult.stdout !== result.stdout &&
        !isRunning;
    const isCached = !!result?.cachedAt;
    // A run restored from the output cache is still a REAL
    // result with full stdout — blocking its export (the old !isCached
    // term) made the Export buttons permanently dead after a reload.
    const canExport =
        !!folderSlug && !!fileSlug && !!result && !isRunning;

    return (
        <div
            className={cn(
                "rounded-xl border overflow-hidden bg-card/60 backdrop-blur-sm",
                "border-border",
                // the panel is a column [merged header] + [body
                // row]. With tabsPosition "left" the body row becomes
                // [vertical tab rail | scroll body] — the tabs-on-the-left
                // layout, configurable in Settings. The card ALWAYS fills the
                // available height now (the old content-sized card left the
                // unused white space under a short run — the vertical auto-fit
                // report).
                "flex flex-col flex-1 min-h-0"
            )}
        >
            {/* ─── ONE compact header row ────────────────────
Identity + status + view tabs + actions merged into ONE row
(earlier designs stacked two or three rows here); merging
minimizes the vertical space while keeping the UI/UX intact.
flex-wrap keeps it graceful on narrow
panels. In "left" tab mode the tab strip moves out of this
row into a vertical rail beside the body. */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 shrink-0">
                    <Terminal className="size-4 shrink-0 text-foreground"/>
                    <span className="text-sm font-medium text-foreground">
            Output
          </span>
                    {fileName && (
                        <span className="text-xs truncate max-w-[28vw] text-muted-foreground">
              · {fileName}
            </span>
                    )}
                    {/* Cached pill — inline in the header row */}
                    {isCached && result?.cachedAt && (
                        <span
                            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400">
              <History className="size-2.5"/>
                            {formatRelativeCached(result.cachedAt)}
            </span>
                    )}
                    <StatusPill result={result} isRunning={isRunning} theme={activeTheme} runKey={runId ?? fileName}/>
                </div>
                {tabsPosition === "top" && (hasFigures || hasDataframes || hasVariables || hasCoverage || hasTests) && (
                    <span aria-hidden="true" className="w-px h-5 bg-border shrink-0 hidden sm:block"/>
                )}
                {/* the background-run groups LEFT this panel — they
              render in the bottom panel's dedicated "Background Runs"
              tab now (page.tsx), so Output stays pure for the open
              file's run ("keep the output pure for running the scripts"). */}
                {/* Tab switcher when there are figures / dataframes / variables / coverage / tests.
 with tabsPosition "top" it renders inline
              (unchanged behavior); with "left" it renders as the
              vertical rail below — see the body row. */}
                {/* the tab strip is NO LONGER hidden while the run streams
              (1c): the run route now emits figure/dataframe events as each
              artifact stabilizes, so the Figures/Tables tabs appear (with
              live counts) the moment the first one lands mid-run. Clicking
              one shows the streaming tab content — see the body branch
              reorder below. */}
                {tabsPosition === "top" && (hasFigures || hasDataframes || hasVariables || hasCoverage || hasTests) && (
                    <div role="tablist" aria-label="Output views"
                         className="flex items-center gap-1 mr-1 rounded-md bg-foreground/5 p-0.5 flex-wrap">
                        <TabButton
                            active={activeTab === "output"}
                            onClick={() => setActiveTab("output")}
                            className="text-foreground"
                            title="Output tab — stdout / stderr text from the script"
                        >
                            <Terminal className="size-3"/>
                            Text
                        </TabButton>
                        {hasFigures && (
                            <TabButton
                                active={activeTab === "figures"}
                                onClick={() => setActiveTab("figures")}
                                className="text-foreground"
                                title="Figures tab — matplotlib charts captured during the run"
                            >
                                <ImageIcon className="size-3"/>
                                Figures ({result?.figures?.length})
                            </TabButton>
                        )}
                        {hasDataframes && (
                            <TabButton
                                active={activeTab === "dataframes"}
                                onClick={() => setActiveTab("dataframes")}
                                className="text-foreground"
                                title="Tables tab — pandas DataFrames printed by the script"
                            >
                                <Database className="size-3"/>
                                Tables ({result?.dataframes?.length})
                            </TabButton>
                        )}
                        {hasVariables && (
                            <TabButton
                                active={activeTab === "variables"}
                                onClick={() => setActiveTab("variables")}
                                className="text-foreground"
                                title="Variables tab — final values of variables in the script's __main__ namespace"
                            >
                                <Eye className="size-3"/>
                                Vars ({result?.variables?.length})
                            </TabButton>
                        )}
                        {hasCoverage && (
                            <TabButton
                                active={activeTab === "coverage"}
                                onClick={() => setActiveTab("coverage")}
                                className="text-foreground"
                                title="Coverage tab — which lines were executed (green) vs unexecuted (red)"
                            >
                                <Crosshair className="size-3"/>
                                Coverage
                            </TabButton>
                        )}
                        {hasTests && (
                            <TabButton
                                active={activeTab === "tests"}
                                onClick={() => setActiveTab("tests")}
                                className="text-foreground"
                                title="Tests tab — pytest test discovery results (pass / fail / skip)"
                            >
                                <CheckCircle2 className="size-3"/>
                                Tests ({result?.tests?.length})
                            </TabButton>
                        )}
                    </div>
                )}

                {/* Ask AI button — shown after every finished run, even with
              zero enabled external endpoints: the integrated Praxis
              chat is always the target (showWithoutEndpoints), so the
              menu simply drops its external section when none are
              enabled instead of hiding the button. */}
                {aiEndpoints && result && !isRunning && (
                    <AskAiButton
                        question={
                            aiQuestionTemplate
                                ? aiQuestionTemplate
                                    .replace(/\{script_name\}/g, scriptFileName ?? fileName ?? "script.py")
                                    .replace(/\{source_code\}/g, sourceCode ? `\`\`\`python\n${sourceCode.slice(0, 3000)}\n\`\`\`` : "(not available)")
                                    .replace(/\{output\}/g, result.stderr.trim() || result.stdout.trim() || "(no output)")
                                    .replace(/\{error_or_success\}/g, result.ok
                                        ? "It ran successfully and produced this output:"
                                        : `It failed with exit code ${result.exitCode ?? "?"}. Here's the error:`)
                                    .replace(/\{question\}/g, result.ok
                                        ? "Can you explain what this script does and suggest improvements?"
                                        : "What's wrong and how do I fix it?")
                                : `I'm running a Python script called "${scriptFileName ?? fileName ?? "script.py"}".\n\n${
                                    result.ok
                                        ? "It ran successfully and produced this output:"
                                        : `It failed with exit code ${result.exitCode ?? "?"}. Here's the error:`
                                }\n\n${result.stderr.trim() || result.stdout.trim() || "(no output)"}\n\n${
                                    sourceCode ? `Here's the source code:\n\n\`\`\`python\n${sourceCode.slice(0, 3000)}\n\`\`\`` : ""
                                }\n\n${
                                    result.ok ? "Can you explain what this script does and suggest improvements?" : "What's wrong and how do I fix it?"
                                }`
                        }
                        endpoints={aiEndpoints}
                        label={result.ok ? "Ask AI" : "Ask AI about error"}
                        icon={result.ok ? "sparkles" : "alert"}
                        variant="ghost"
                        size="sm"
                        showWithoutEndpoints
                    />
                )}

                {/* ─── toolbar de-cascade ─────────────────────────
              The old header rendered up to a dozen labeled controls in
              one long row ("the options in the output are too many
              cascaded next to each other"). Export / Diff / Pin /
              theme / auto-scroll now live in the single ⋯ More menu at
              the end of the row; Copy and Clear are icon-only with
              tooltips. Only the things you touch on EVERY run stay
              inline: the view tabs, Ask AI, search + stream filter,
              Copy, Clear, Stop, More. */}

                {/* Output search + stream filter chips.
              The search input lives in the toolbar so it's always reachable
              regardless of which tab is active; the three chips filter the
              displayed output by stream. Search + filter compose (both
              must match). Matching lines are wrapped in <mark> in the body. */}
                {outputSearchEnabled !== false && (
                    <div className="flex items-center gap-1.5">
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/>
                            <Input
                                type="text"
                                ref={outputSearchInputRef}
                                value={outputSearch}
                                onChange={(e) => setOutputSearch(e.target.value)}
                                placeholder="Search output…"
                                aria-label="Search output lines"
                                className="h-8 w-[120px] sm:w-[160px] text-xs pl-7"
                            />
                        </div>
                        <div className="flex items-center gap-0.5 rounded-md bg-foreground/5 p-0.5">
                            {(["all", "stdout", "stderr"] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStreamFilter(s)}
                                    aria-pressed={streamFilter === s}
                                    title={`Show ${s === "all" ? "all output" : `${s} only`}`}
                                    className={cn(
                                        "px-2 py-0.5 text-[11px] rounded transition-colors capitalize",
                                        streamFilter === s
                                            ? "bg-foreground/15 text-foreground"
                                            : "text-muted-foreground hover:bg-foreground/5"
                                    )}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                        {outputSearch.trim() && (
                            <span
                                className={cn(
                                    "whitespace-nowrap text-[11px]",
                                    activeTheme.subtitleClass
                                )}
                            >
                  {(filteredStdoutLines?.length ?? 0) +
                      (filteredStderrLines?.length ?? 0)}{" "}
                                of {totalStdoutLines + totalStderrLines} lines
                </span>
                        )}
                    </div>
                )}

                {/* ─── More menu — Diff / Pin / Export / theme /
              auto-scroll live here instead of cascading inline. See the
              de-cascade comment above. */}

                {/* Copy button — icon-only ( de-cascade; tooltip +
              aria-label keep it accessible). */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!hasOutput || isRunning}
                    className="h-8 w-8 px-0 hover:bg-foreground/5"
                    aria-label="Copy output to clipboard"
                    title="Copy output to clipboard"
                >
                    {copied ? (
                        <Check className="size-3.5 text-emerald-400"/>
                    ) : (
                        <Copy className="size-3.5"/>
                    )}
                </Button>

                {/* Clear output display — icon-only ( de-cascade).
              Visual only, does NOT affect the parent's runResult or the
              run history. Re-running the script or selecting a new file
              restores the real output. */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    disabled={!hasOutput || displayCleared}
                    aria-label="Clear output display"
                    title="Clear output display (visual only — re-run to restore)"
                    className="h-8 w-8 px-0 hover:bg-foreground/5"
                >
                    <Eraser className="size-3.5"/>
                </Button>

                {/* Stop button (only while running) */}
                {isRunning && onStop && runId && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStop}
                        className="h-8 gap-1.5 text-xs hover:bg-red-500/10 text-red-400"
                        aria-label="Stop running script"
                        title="Stop running script"
                    >
                        <Square className="size-3.5 fill-current"/>
                        Stop
                    </Button>
                )}

                {/* ─── the ⋯ More menu ─────────────────────────────
              Everything that used to cascade inline: Diff, Pin baseline,
              the three exports, the output theme picker and the
              auto-scroll toggle. One compact icon button at the end of
              the row; state-y items render as checkbox items so their
              on/off state is visible without extra toolbar space. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 hover:bg-foreground/5"
                            aria-label="More output options"
                            title="More — diff, pin baseline, export, theme, auto-scroll"
                        >
                            <MoreHorizontal className="size-3.5"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                        {/* Auto-scroll toggle */}
                        <DropdownMenuCheckboxItem
                            checked={autoScroll}
                            onCheckedChange={() => setAutoScroll((v) => !v)}
                            className="gap-2 cursor-pointer"
                            title={
                                autoScroll
                                    ? "Auto-scroll to bottom on new output (click to pause)"
                                    : "Auto-scroll paused — panel stays at your position (click to resume)"
                            }
                        >
                            <ArrowDownToLine className="size-3.5"/>
                            <span className="flex-1">Auto-Scroll</span>
                        </DropdownMenuCheckboxItem>
                        {/* Diff toggle — auto-switches to the output tab so the
diff is actually visible. */}
                        {hasDiff && (
                            <DropdownMenuCheckboxItem
                                checked={showDiff}
                                onCheckedChange={() => {
                                    setShowDiff((v) => !v);
                                    setActiveTab("output");
                                }}
                                className="gap-2 cursor-pointer"
                                title="Compare with previous run"
                            >
                                <GitCompare className="size-3.5"/>
                                <span className="flex-1">Diff Vs Previous Run</span>
                            </DropdownMenuCheckboxItem>
                        )}
                        {/* Pin as diff baseline */}
                        {onPinBaseline && result && !isRunning && !isCached && (
                            <DropdownMenuCheckboxItem
                                checked={isPinned}
                                onCheckedChange={() => onPinBaseline(isPinned ? null : result)}
                                className="gap-2 cursor-pointer"
                                title={
                                    isPinned
                                        ? "Unpin baseline (click to clear)"
                                        : "Pin this run as the diff baseline"
                                }
                            >
                                <Pin className={cn("size-3.5", isPinned && "text-amber-400 fill-amber-400")}/>
                                <span
                                    className="flex-1">{isPinned ? "Pinned as baseline" : "Pin as diff baseline"}</span>
                            </DropdownMenuCheckboxItem>
                        )}
                        {/* Export submenu */}
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                                className="gap-2 cursor-pointer"
                                disabled={!canExport}
                                title="Export code + output + figures"
                            >
                                <Download className="size-3.5"/>
                                <span className="flex-1">Export As…</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-52">
                                <DropdownMenuItem
                                    onClick={onExportMd}
                                    disabled={!onExportMd}
                                    className="gap-2 cursor-pointer"
                                    title="Export code + output + figures as Markdown"
                                >
                                    <FileCode2 className="size-3.5"/>
                                    <span className="flex-1">Markdown (.md)</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={onExportIpynb}
                                    disabled={!onExportIpynb}
                                    className="gap-2 cursor-pointer"
                                    title="Export as .ipynb (with cell markers)"
                                >
                                    <Download className="size-3.5"/>
                                    <span className="flex-1">Notebook (.ipynb)</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={onExportHtml}
                                    disabled={!onExportHtml}
                                    className="gap-2 cursor-pointer"
                                    title="Export as self-contained HTML (with base64 figures)"
                                >
                                    <Download className="size-3.5"/>
                                    <span className="flex-1">HTML (.html)</span>
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        {/* Output theme submenu (moved from the inline Select) */}
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                                    title="Color theme for the output body">
                                <Palette className="size-3.5"/>
                                <span className="flex-1">Output Theme</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="max-h-72 overflow-y-auto w-52">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">Output
                                    theme</DropdownMenuLabel>
                                <DropdownMenuRadioGroup value={themeId} onValueChange={handleThemeChange}>
                                    {THEMES.map((t) => (
                                        <DropdownMenuRadioItem key={t.id} value={t.id} className="gap-2 cursor-pointer">
                                            <span className={cn("size-3 rounded-full border shrink-0", t.swatch)}/>
                                            <span>{t.label}</span>
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    </DropdownMenuContent>
                </DropdownMenu>

            </div>

            {/* Drag-resize handle — uses pointer events (covers mouse + touch),
          adds separator semantics + keyboard arrow-key support, and
          resets the body cursor on a blur/visibilitychange fallback so
          a drag interrupted by the browser context menu doesn't leave
          the cursor stuck. */}
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize output panel"
                aria-valuenow={bodyHeight}
                aria-valuemin={150}
                aria-valuemax={800}
                tabIndex={0}
                className="h-1 cursor-row-resize bg-border/40 hover:bg-emerald-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                onPointerDown={(e) => {
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    const startY = e.clientY;
                    const startHeight = bodyHeight;
                    const onMove = (ev: PointerEvent) => {
                        const delta = startY - ev.clientY;
                        const next = Math.max(150, Math.min(800, startHeight + delta));
                        setBodyHeight(next);
                    };
                    // onUp doubles as the blur/visibilitychange
                    // fallback and removes EVERY listener it installed. The old
                    // code removed only the pointer listeners on pointer-up and
                    // left the visibilitychange/blur pair behind — one pair
                    // accumulated per drag until the next blur fired them all at
                    // once. (Same pattern as the page's sidebar drag handle.)
                    const onUp = () => {
                        try {
                            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        } catch { /* capture already released */
                        }
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                        document.body.style.cursor = "";
                        document.body.style.userSelect = "";
                        document.removeEventListener("visibilitychange", onUp);
                        window.removeEventListener("blur", onUp);
                    };
                    // Also reset on visibilitychange/blur so a drag interrupted
                    // by Alt+Tab or the browser context menu doesn't leave the
                    // cursor stuck (onUp is idempotent).
                    document.addEventListener("visibilitychange", onUp);
                    window.addEventListener("blur", onUp);
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                    document.body.style.cursor = "row-resize";
                    document.body.style.userSelect = "none";
                }}
                onKeyDown={(e) => {
                    // Keyboard resize — 16px per arrow press.
                    if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setBodyHeight((h) => Math.min(800, h + 16));
                    } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setBodyHeight((h) => Math.max(150, h - 16));
                    }
                }}
            />

            {/* ─── body row — [vertical tab rail | body] when
          tabsPosition is "left", else the plain body (the strip stays
          in the header). ─────────────────────────────────────────── */}
            <div className={cn("flex min-h-0", tabsPosition === "left" ? "flex-1" : "contents")}>
                {tabsPosition === "left" && (hasFigures || hasDataframes || hasVariables || hasCoverage || hasTests) && (
                    <div role="tablist" aria-orientation="vertical" aria-label="Output views"
                         className="flex flex-col gap-0.5 p-1 border-r bg-muted/20 shrink-0">
                        <TabButton
                            active={activeTab === "output"}
                            onClick={() => setActiveTab("output")}
                            className="text-foreground justify-start"
                            title="Output tab — stdout / stderr text from the script"
                        >
                            <Terminal className="size-3"/>
                            Text
                        </TabButton>
                        {hasFigures && (
                            <TabButton
                                active={activeTab === "figures"}
                                onClick={() => setActiveTab("figures")}
                                className="text-foreground justify-start"
                                title="Figures tab — matplotlib charts captured during the run"
                            >
                                <ImageIcon className="size-3"/>
                                Figures ({result?.figures?.length})
                            </TabButton>
                        )}
                        {hasDataframes && (
                            <TabButton
                                active={activeTab === "dataframes"}
                                onClick={() => setActiveTab("dataframes")}
                                className="text-foreground justify-start"
                                title="Tables tab — pandas DataFrames printed by the script"
                            >
                                <Database className="size-3"/>
                                Tables ({result?.dataframes?.length})
                            </TabButton>
                        )}
                        {hasVariables && (
                            <TabButton
                                active={activeTab === "variables"}
                                onClick={() => setActiveTab("variables")}
                                className="text-foreground justify-start"
                                title="Variables tab — final values of variables in the script's __main__ namespace"
                            >
                                <Eye className="size-3"/>
                                Vars ({result?.variables?.length})
                            </TabButton>
                        )}
                        {hasCoverage && (
                            <TabButton
                                active={activeTab === "coverage"}
                                onClick={() => setActiveTab("coverage")}
                                className="text-foreground justify-start"
                                title="Coverage tab — which lines were executed (green) vs unexecuted (red)"
                            >
                                <Crosshair className="size-3"/>
                                Coverage
                            </TabButton>
                        )}
                        {hasTests && (
                            <TabButton
                                active={activeTab === "tests"}
                                onClick={() => setActiveTab("tests")}
                                className="text-foreground justify-start"
                                title="Tests tab — pytest test discovery results (pass / fail / skip)"
                            >
                                <CheckCircle2 className="size-3"/>
                                Tests ({result?.tests?.length})
                            </TabButton>
                        )}
                    </div>
                )}
                {/* Body — uses the output theme's background + text colors.
 focusable + Ctrl/Cmd+C copies the output when
          nothing is selected (and toasts that it did). */}
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div
                            ref={outputScrollRef}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
                                    // With an active text selection inside the panel, let the
                                    // browser copy it natively.
                                    const sel = window.getSelection?.();
                                    if (sel && !sel.isCollapsed) return;
                                    if (!hasOutput || displayCleared) return;
                                    e.preventDefault();
                                    void handleCopyAll();
                                }
                            }}
                            className={cn(
                                "overflow-auto outline-none transition-shadow",
                                activeTheme.panelClass,
                                tabsPosition === "left" && "flex-1 min-w-0",
                                // notification deep-link arrival flash.
                                flashHeader && "ring-2 ring-primary/70 shadow-[0_0_18px_-4px] shadow-primary/40"
                            )}
                            style={{maxHeight: tabsPosition === "left" ? undefined : `${bodyHeight}px`}}
                        >
                            <AnimatePresence mode="wait">
                                {/* ── body branch order (1c): the FIGURES/TABLES/VARS/… tab views
              come FIRST so they render EVEN WHILE the run streams — the
              run route now delivers figure/dataframe events as each
              artifact stabilizes, and page.tsx already accumulates them
              into result.figures/dataframes mid-run. While activeTab is
              "output" (the default — the auto-switch effect resets it at
              every new run start) nothing changes: the running view below
              renders exactly as before. */}
                                {activeTab === "figures" && hasFigures ? (
                                    <motion.div
                                        key="figures"
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        className="p-4"
                                    >
                                        <FigureGrid
                                            figures={result!.figures!}
                                            sort={figureSort}
                                            onSort={setFigureSort}
                                            onLightbox={setLightboxFigure}
                                            theme={activeTheme}
                                        />
                                    </motion.div>
                                ) : activeTab === "tests" && hasTests ? (
                                    <motion.div
                                        key="tests"
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        className="p-4"
                                    >
                                        <TestsView tests={result!.tests!} theme={activeTheme}/>
                                    </motion.div>
                                ) : activeTab === "dataframes" && hasDataframes ? (
                                    <motion.div
                                        key="dataframes"
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        className="p-4 space-y-4"
                                    >
                                        {result!.dataframes!.map((df) => (
                                            <DataFrameView key={df.url} df={df} theme={activeTheme}/>
                                        ))}
                                    </motion.div>
                                ) : activeTab === "variables" && hasVariables ? (
                                    <motion.div
                                        key="variables"
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        className="p-4"
                                    >
                                        <VariableInspector
                                            variables={result!.variables!}
                                            theme={activeTheme}
                                        />
                                    </motion.div>
                                ) : activeTab === "coverage" && hasCoverage ? (
                                    <motion.div
                                        key="coverage"
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        className="p-4"
                                    >
                                        <CoverageView
                                            coverage={result!.coverage!}
                                            theme={activeTheme}
                                            sourceCode={sourceCode}
                                            failUnder={coverageFailUnder}
                                            branchCoverage={coverageBranch}
                                        />
                                    </motion.div>
                                ) : isRunning ? (
                                    <motion.div
                                        key="running"
                                        initial={{opacity: 0}}
                                        animate={{opacity: 1}}
                                        exit={{opacity: 0}}
                                        className={cn(
                                            "px-4 py-6",
                                            activeTheme.runningClass
                                        )}
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            <Loader2 className="size-4 animate-spin"/>
                                            <span className="text-sm font-mono">Running script…</span>
                                            {/* live elapsed readout (1a) — mirrors the pill's
                    ticking clock so the timing is visible next to the
                    streaming output too. */}
                                            {runningElapsedMs != null && (
                                                <span
                                                    className="text-xs font-mono tabular-nums opacity-70"
                                                    title="Elapsed time since this run started"
                                                >
                    {formatElapsedRun(runningElapsedMs)}
                  </span>
                                            )}
                                            {/* interactive-input heuristic — the stream has
                    been quiet for >1.4 s AND the last stdout character is
                    not a newline (the classic input() prompt shape:
                    Python echoes the prompt then blocks). A soft amber
                    hint, never a hard claim. */}
                                            {awaitingInputHint && (
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 dark:text-amber-400 shrink-0"
                                                    title="The script looks like it is waiting for input() — type a line in the stdin box below and press Enter (or send EOF to end it)"
                                                >
                    waiting for input
                  </span>
                                            )}
                                            <ResourceMonitor runId={runId} theme={activeTheme}/>
                                            <button
                                                onClick={handleStop}
                                                className="ml-auto text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                            >
                                                Stop
                                            </button>
                                        </div>
                                        {/* Live-streamed output during the run. When displayCleared
is true (user clicked Clear), hide the streaming text
until the run finishes; a small notice is shown instead. */}
                                        {hasOutput && !displayCleared && (
                                            <pre className={cn(
                                                wrapOn ? "font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words" : "font-mono text-[0.8125rem] leading-relaxed whitespace-pre",
                                                activeTheme.stdoutClass
                                            )}>
                  <MemoizedAnsi text={result?.stdout ?? ""}/>
                                                {result?.stderr?.trim() && (
                                                    <>
                                                        {"\n"}
                                                        <span className={cn(
                                                            result.ok
                                                                ? activeTheme.stderrClass
                                                                : activeTheme.stderrErrorClass
                                                        )}>
                        <MemoizedAnsi text={result.stderr}/>
                      </span>
                                                    </>
                                                )}
                </pre>
                                        )}
                                        {displayCleared && (
                                            <p className={cn("text-xs italic mt-2", activeTheme.mutedClass)}>
                                                Output cleared (display only). New output will appear when
                                                the run completes.
                                            </p>
                                        )}

                                        {/* mid-run figure previews (1c): the run route streams figure
                  events as each captured PNG stabilizes; this thumbnail
                  rail surfaces them WITHOUT leaving the live output view
                  (the Figures tab shows the full grid — click View). */}
                                        {hasFigures && !displayCleared && (
                                            <div className="mt-3 pt-3 border-t border-foreground/10">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <ImageIcon className="size-3.5"/>
                                                    <span className={cn("text-xs", activeTheme.subtitleClass)}>
                      {result?.figures?.length ?? 0}{" "}
                                                        {(result?.figures?.length ?? 0) === 1 ? "figure" : "figures"} captured so far
                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-2 gap-1 text-[10px]"
                                                        onClick={() => setActiveTab("figures")}
                                                        title="Open the Figures tab — the grid updates as more figures stream in"
                                                    >
                                                        <ImageIcon className="size-3"/>
                                                        View
                                                    </Button>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-1">
                                                    {result?.figures?.slice(-8).map((f) => (
                                                        <img
                                                            key={f.url}
                                                            src={f.url}
                                                            alt={f.name}
                                                            className="h-16 w-auto rounded border border-foreground/10 bg-white object-contain shrink-0"
                                                            loading="lazy"
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Interactive stdin row.
This row used to live in the FINISHED-output branch
below, where its `isRunning &&` condition was
permanently false (the finished branch only renders
once the run is over) — dead code: input prompts
could never be answered live. It now lives HERE, in
the live streaming view, where it belongs. Enter
sends the line; the EOF button closes the script's
stdin so sys.stdin.read/input loops end.: the row used to be a borderless transparent
input that blended into the output — it is now a
COLORIZED input block: a sky/cyan-tinted card with a
solid left accent bar, the "stdin ▸" badge in solid
sky, and the TYPED text in cyan so the input
reads visually distinct from the script's stdout. */}
                                        {onSendStdin && (
                                            <form
                                                className={cn(
                                                    "mt-3 pt-3 border-t border-sky-500/40 rounded-md flex items-center gap-2 px-2 py-1.5",
                                                    "bg-sky-500/10 dark:bg-sky-500/15 border-l-4 border-l-sky-500"
                                                )}
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    void sendStdinLine(false);
                                                }}
                                            >
                  <span
                      className={cn(
                          "text-[10px] font-mono font-bold select-none shrink-0 rounded px-1.5 py-0.5",
                          "bg-sky-600 text-white dark:bg-sky-500 dark:text-sky-950"
                      )}
                      title="Your input goes to the running script's stdin — Enter sends the line"
                  >
                    stdin ▸
                  </span>
                                                <input
                                                    value={stdinDraft}
                                                    onChange={(e) => setStdinDraft(e.target.value)}
                                                    placeholder="Type a line for the running script's input() and press Enter…"
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                    className={cn(
                                                        "flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-xs px-1 py-0.5 focus:ring-0",
                                                        "text-cyan-700 dark:text-cyan-300 placeholder:text-sky-600/60 dark:placeholder:text-sky-400/60 font-semibold"
                                                    )}
                                                />
                                                {stdinNote && (
                                                    <span
                                                        className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 shrink-0">{stdinNote}</span>
                                                )}
                                                {onSendStdinEof && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void sendStdinLine(true)}
                                                        className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-sky-600/60 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20"
                                                        title="Send end-of-file (Ctrl+D) — closes the script's stdin"
                                                    >
                                                        EOF
                                                    </button>
                                                )}
                                                <button
                                                    type="submit"
                                                    disabled={!stdinDraft.trim()}
                                                    className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 dark:bg-sky-500 dark:text-sky-950 dark:hover:bg-sky-400"
                                                    title="Send the line to the running script"
                                                >
                                                    Send
                                                </button>
                                            </form>
                                        )}
                                    </motion.div>
                                ) : !result ? (
                                    <motion.div
                                        key="empty"
                                        initial={{opacity: 0}}
                                        animate={{opacity: 1}}
                                        exit={{opacity: 0}}
                                        /* left-aligned like a terminal prompt — the
output, terminal, etc. read left-aligned,
not centered; the old text-center + mx-auto
icon made the empty panel look centered. */
                                        className="px-4 py-6 text-left"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Terminal className={cn("size-4 shrink-0", activeTheme.emptyClass)}/>
                                            <span className={cn("text-sm", activeTheme.emptyClass)}>No output yet</span>
                                        </div>
                                        <p className={cn("text-sm flex items-center gap-1 flex-wrap", activeTheme.emptyClass)}>
                                            Press{" "}
                                            <kbd
                                                className={cn(
                                                    "px-1.5 py-0.5 rounded text-xs font-mono bg-foreground/5",
                                                    activeTheme.labelClass
                                                )}
                                            >
                                                Run
                                            </kbd>{" "}
                                            to execute this script and see its output here.
                                        </p>
                                        <p className={cn("text-xs mt-1.5", activeTheme.mutedClass)}>
                                            Tip: <kbd
                                            className="px-1 py-0.5 rounded text-[10px] font-mono bg-foreground/5">Ctrl+Enter</kbd> runs
                                            the current script
                                        </p>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="output"
                                        initial={{opacity: 0, y: 4}}
                                        animate={{opacity: 1, y: 0}}
                                        exit={{opacity: 0}}
                                        className="px-4 py-3"
                                    >
                                        {displayCleared ? (
                                            <p
                                                className={cn(
                                                    "text-sm font-mono italic",
                                                    activeTheme.mutedClass
                                                )}
                                            >
                                                Output cleared (display only). Re-run the script or
                                                select another file to restore.
                                            </p>
                                        ) : hasOutput ? (
                                            <>
                                                {/* Diff view (collapsible) */}
                                                {hasDiff && (
                                                    <Collapsible
                                                        open={showDiff}
                                                        onOpenChange={setShowDiff}
                                                        className="mb-3"
                                                    >
                                                        <CollapsibleContent>
                                                            <DiffView
                                                                oldText={previousResult!.stdout}
                                                                newText={result.stdout}
                                                                theme={activeTheme}
                                                            />
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                )}

                                                {/* Stdout block — hidden when the stream filter is set to
                      "stderr". When a search query is active, matching lines
                      are filtered and wrapped in <mark> for emphasis. */}
                                                {(streamFilter === "all" || streamFilter === "stdout") &&
                                                    result.stdout.trim() && (
                                                        <pre
                                                            className={cn(
                                                                wrapOn ? "font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words" : "font-mono text-[0.8125rem] leading-relaxed whitespace-pre",
                                                                stderrOnly
                                                                    ? activeTheme.stderrErrorClass
                                                                    : activeTheme.stdoutClass
                                                            )}
                                                        >
                        {outputSearchEnabled !== false &&
                        outputSearch.trim() ? (
                            filteredStdoutLines &&
                            filteredStdoutLines.length > 0 ? (
                                filteredStdoutLines.map((l) => (
                                    <div key={l.lineNum} className="cv-line">
                                <span
                                    className={cn(
                                        "mr-2 inline-block min-w-[3ch] select-none text-right tabular-nums",
                                        activeTheme.subtitleClass
                                    )}
                                >
                                  {l.lineNum}
                                </span>
                                        <mark className="rounded-sm bg-amber-400/30 px-0.5">
                                            <Ansi useClasses={false}>
                                                {l.text || "\u00A0"}
                                            </Ansi>
                                        </mark>
                                    </div>
                                ))
                            ) : (
                                <span
                                    className={cn("italic", activeTheme.mutedClass)}
                                >
                              No stdout lines match &ldquo;{outputSearch.trim()}&rdquo;.
                            </span>
                            )
                        ) : collapsibleOutput !== false ? (
                            renderStdoutBlocks(
                                stdoutSegments,
                                expandedSections,
                                setExpandedSections,
                                activeTheme
                            )
                        ) : (
                            // collapsibleOutput === false — render raw stdout
                            // verbatim.
                            <MemoizedAnsi text={stdoutText} useClasses={false}/>
                        )}
                      </pre>
                                                    )}

                                                {/* Stderr block — hidden when the stream filter is set to
                      "stdout". Applies the same search + <mark> highlight. */}
                                                {(streamFilter === "all" || streamFilter === "stderr") &&
                                                    result.stderr.trim() && (
                                                        <pre
                                                            className={cn(
                                                                wrapOn ? "font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words" : "font-mono text-[0.8125rem] leading-relaxed whitespace-pre",
                                                                result.ok
                                                                    ? activeTheme.stderrClass
                                                                    : activeTheme.stderrErrorClass,
                                                                result.stdout.trim() &&
                                                                streamFilter === "all" &&
                                                                cn("mt-2 pt-2 border-t", activeTheme.headerBorderClass)
                                                            )}
                                                        >
                        {outputSearchEnabled !== false &&
                        outputSearch.trim() ? (
                            filteredStderrLines &&
                            filteredStderrLines.length > 0 ? (
                                filteredStderrLines.map((l) => (
                                    <div key={l.lineNum} className="cv-line">
                                <span
                                    className={cn(
                                        "mr-2 inline-block min-w-[3ch] select-none text-right tabular-nums",
                                        activeTheme.subtitleClass
                                    )}
                                >
                                  {l.lineNum}
                                </span>
                                        <mark className="rounded-sm bg-amber-400/30 px-0.5">
                                            <Ansi useClasses={false}>
                                                {l.text || "\u00A0"}
                                            </Ansi>
                                        </mark>
                                    </div>
                                ))
                            ) : (
                                <span
                                    className={cn("italic", activeTheme.mutedClass)}
                                >
                              No stderr lines match &ldquo;{outputSearch.trim()}&rdquo;.
                            </span>
                            )
                        ) : (
                            <MemoizedAnsi text={result.stderr.trimEnd()} useClasses={false}/>
                        )}
                      </pre>
                                                    )}

                                                {/* "No matches in the selected stream" notice — shown when
                      the active stream filter + search query yield nothing. */}
                                                {outputSearchEnabled !== false &&
                                                    outputSearch.trim() &&
                                                    streamFilter !== "all" &&
                                                    ((streamFilter === "stdout" &&
                                                            (!result.stdout.trim() ||
                                                                (filteredStdoutLines?.length ?? 0) === 0)) ||
                                                        (streamFilter === "stderr" &&
                                                            (!result.stderr.trim() ||
                                                                (filteredStderrLines?.length ?? 0) === 0))) && (
                                                        <p
                                                            className={cn(
                                                                "text-xs italic mt-2",
                                                                activeTheme.mutedClass
                                                            )}
                                                        >
                                                            No {streamFilter} output
                                                            matches &ldquo;{outputSearch.trim()}&rdquo;.
                                                        </p>
                                                    )}

                                                {result.truncated && (
                                                    <div
                                                        className={cn(
                                                            "mt-2 flex items-center gap-2 text-xs",
                                                            activeTheme.stderrClass
                                                        )}
                                                        title={`Output was capped at ${truncationCapLabel} per stream (Settings → Advanced → Max output bytes). The stderr stream shows the exact cut point.`}
                                                    >
                                                        <TriangleAlert className="size-3.5"/>
                                                        {/* dynamic cap (1d): the number follows the
                          CONFIGURED maxOutputBytes setting (the same value
                          the run request forwards) instead of the old
                          hard-coded "2 MB". Gutter-coverage mapping for the
                          truncated region would need the editor gutter
                          (code-viewer.tsx — owned by another agent), so the
                          notice stays textual. */}
                                                        Output truncated at {truncationCapLabel}.
                                                    </div>
                                                )}
                                                {hasFigures && (
                                                    <div className="mt-3 pt-3 border-t border-foreground/10">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setActiveTab("figures")}
                                                            className="h-7 gap-1.5 text-xs"
                                                        >
                                                            <ImageIcon className="size-3.5"/>
                                                            View {result.figures!.length} figure
                                                            {result.figures!.length === 1 ? "" : "s"}
                                                            <ChevronDown className="size-3 rotate-[-90deg]"/>
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* ── PROACTIVE RUN HINTS ──
A script that pre-flights its data files prints
"missing: SensorReadings.csv" lines; a degraded run
prints the exact "pip install pandas openpyxl
pyarrow" command it wants. Both become actionable
buttons right under the output — the missing files
get the folder's data-files browser, the pip line
gets a one-click install of exactly those packages. */}
                                                {(missingDataFiles.length > 0 || pipSuggestions.length > 0) && (
                                                    <div className="mt-3 pt-3 border-t border-foreground/10 space-y-2">
                                                        {missingDataFiles.length > 0 && (
                                                            <div
                                                                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                                                <p className="flex items-center gap-1.5 text-xs font-medium">
                                                                    <FileSpreadsheet
                                                                        className="size-3.5 shrink-0 text-amber-500"/>
                                                                    The run reported {missingDataFiles.length} missing
                                                                    data file
                                                                    {missingDataFiles.length === 1 ? "" : "s"}:
                                                                </p>
                                                                <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground break-all">
                                                                    {missingDataFiles.join("  ·  ")}
                                                                </p>
                                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                    {onOpenDataFiles ? (
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-7 gap-1.5 text-xs"
                                                                            onClick={onOpenDataFiles}
                                                                            title="Open the folder's data-files browser — preview any of them, or check what actually exists on disk"
                                                                        >
                                                                            <FolderSearch className="size-3.5"/>
                                                                            Open data-files browser
                                                                        </Button>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {pipSuggestions.map((s) => (
                                                            <div
                                                                key={s.packages}
                                                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
                                                            >
                                                                <p className="flex flex-wrap items-center gap-2 text-xs">
                                                                    <span className="font-medium">The output suggests installing:</span>
                                                                    <span
                                                                        className="font-mono text-[10px] text-muted-foreground">{s.packages}</span>
                                                                </p>
                                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                    <PipInstallButton
                                                                        module={s.packages}
                                                                        label={`Install ${s.packages}`}
                                                                        onInstalled={() => {
                                                                            toast({
                                                                                title: "Packages installed",
                                                                                description: `${s.packages} — run the script again for the full behavior.`,
                                                                            });
                                                                        }}
                                                                    />
                                                                    <span
                                                                        title={s.raw}
                                                                        className="max-w-full truncate font-mono text-[10px] text-muted-foreground"
                                                                    >
                              {s.raw}
                            </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* "Explain this traceback" — one
                      click opens the in-app AI chat with the failed
                      run's stderr (and a stdout tail for context)
                      preloaded. Easier to spot than the header "Ask AI
                      about error" button when you're already reading
                      the traceback. */}
                                                {!result.ok &&
                                                    result.stderr.trim() &&
                                                    !isRunning && (
                                                        <div
                                                            className="mt-3 pt-3 border-t border-foreground/10 flex flex-wrap items-center gap-2">
                                                            {/* ModuleNotFoundError? Offer the one-click pip
                            install of the missing module right here. */}
                                                            {(() => {
                                                                const missing = missingModuleFrom(result.stderr);
                                                                return missing ? (
                                                                    <PipInstallButton
                                                                        module={missing}
                                                                        onInstalled={() => {
                                                                            toast({
                                                                                title: `${missing} installed`,
                                                                                description: "Run the script again — the import should resolve now.",
                                                                            });
                                                                        }}
                                                                    />
                                                                ) : null;
                                                            })()}
                                                            {onExplainTraceback && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        const tb = result.stderr.trim().split("\n");
                                                                        onExplainTraceback(
                                                                            `This Python script failed with a traceback:\n\n\`\`\`\n${tb.slice(-40).join("\n")}\n\`\`\`\n\n${
                                                                                result.stdout.trim()
                                                                                    ? `Last stdout before the crash:\n\`\`\`\n${result.stdout.trim().split("\n").slice(-10).join("\n")}\n\`\`\`\n\n`
                                                                                    : ""
                                                                            }Explain what caused the error step by step, then give the corrected code.`
                                                                        );
                                                                    }}
                                                                    className="h-7 gap-1.5 text-xs"
                                                                    title="Open the AI chat with this traceback preloaded"
                                                                >
                                                                    <Sparkles className="size-3.5"/>
                                                                    Explain this traceback
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                            </>
                                        ) : (
                                            <p className={cn(
                                                "text-sm font-mono italic",
                                                activeTheme.mutedClass
                                            )}>
                                                (script produced no output)
                                                {hasFigures && " — but see the Figures tab →"}
                                            </p>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </ContextMenuTrigger>

                    {/* output right-click menu — Copy/Save, Find, Word wrap
(JetBrains "Use Soft Wraps"), Jump to latest + auto-scroll
("Scroll to the end"), fold runs ("Fold Lines Like This",
simplified), and Clear. Mirrors the toolbar but discoverable
where the pointer already is. */}
                    <ContextMenuContent className="w-60">
                        <ContextMenuLabel className="text-[10px] text-muted-foreground truncate">
                            Output{fileName ? ` — ${fileName}` : ""}
                        </ContextMenuLabel>
                        <ContextMenuSeparator/>
                        {outputSearchEnabled && (
                            <ContextMenuItem
                                onClick={handleFocusOutputSearch}
                                className="gap-2 cursor-pointer"
                                title="Focus the output search box — matches are highlighted with line numbers"
                            >
                                <Search className="size-3.5 text-sky-500 shrink-0"/>
                                <span className="flex-1">Find In Output…</span>
                            </ContextMenuItem>
                        )}
                        {/* ── Clipboard ▸ — copy / save the output. ── */}
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                   title="Copy the output or save it to a file">
                                <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                <span className="flex-1">Clipboard</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-60">
                                <ContextMenuItem
                                    onClick={() => void handleCopyAll()}
                                    disabled={!hasOutput || displayCleared}
                                    className="gap-2 cursor-pointer"
                                    title="Copy the whole run output (stdout + stderr) to the clipboard"
                                >
                                    <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                    <span className="flex-1">Copy All</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={handleSaveOutputFile}
                                    disabled={!hasOutput && !result?.error}
                                    className="gap-2 cursor-pointer"
                                    title="Save the run output (with a header: file, interpreter, duration, exit code) as a .txt file"
                                >
                                    <FileDown className="size-3.5 text-purple-500 shrink-0"/>
                                    <span className="flex-1">Save Output To File…</span>
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        {/* ── View ▸ — wrap, fold, jump, auto-scroll. ── */}
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                   title="Word wrap, folding, jumping, and auto-scroll options">
                                <WrapText className="size-3.5 text-muted-foreground shrink-0"/>
                                <span className="flex-1">View</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-60">
                                <ContextMenuItem
                                    onClick={() => setWrapOverride(!wrapOn)}
                                    className="gap-2 cursor-pointer"
                                    title={wrapOn ? "Turn soft-wrap OFF — long lines get a horizontal scrollbar instead" : "Turn soft-wrap ON — long lines wrap onto the next row"}
                                >
                                    <WrapText
                                        className={cn("size-3.5 shrink-0", wrapOn ? "text-emerald-500" : "text-muted-foreground")}/>
                                    <span className="flex-1">Word Wrap</span>
                                    {wrapOn && <Check className="size-3.5 text-emerald-500 shrink-0"/>}
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => setFoldOverride(!foldOn)}
                                    className="gap-2 cursor-pointer"
                                    title={foldOn ? "Stop folding runs of identical output lines — show every line" : "Fold runs of 3+ identical output lines into one summary line"}
                                >
                                    <FoldVertical
                                        className={cn("size-3.5 shrink-0", foldOn ? "text-emerald-500" : "text-muted-foreground")}/>
                                    <span className="flex-1">Fold Identical Lines</span>
                                    {foldOn && <Check className="size-3.5 text-emerald-500 shrink-0"/>}
                                </ContextMenuItem>
                                <ContextMenuSeparator/>
                                <ContextMenuItem
                                    onClick={handleJumpToLatest}
                                    className="gap-2 cursor-pointer"
                                    title="Scroll to the very bottom of the output"
                                >
                                    <ArrowDownToLine className="size-3.5 text-sky-500 shrink-0"/>
                                    <span className="flex-1">Jump To Latest</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => setAutoScroll(!autoScroll)}
                                    className="gap-2 cursor-pointer"
                                    title={autoScroll ? "Stop auto-scrolling while new output streams in" : "Keep the output scrolled to the bottom as new output streams in"}
                                >
                                    <ArrowDownToLine
                                        className={cn("size-3.5 shrink-0", autoScroll ? "text-emerald-500" : "text-muted-foreground")}/>
                                    <span className="flex-1">Auto-Scroll On New Output</span>
                                    {autoScroll && <Check className="size-3.5 text-emerald-500 shrink-0"/>}
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator/>
                        <ContextMenuItem
                            onClick={handleClear}
                            disabled={!hasOutput || displayCleared}
                            className="gap-2 cursor-pointer"
                            title="Clear the displayed output (visual only — re-run or switch files to restore)"
                        >
                            <Eraser className="size-3.5 text-muted-foreground shrink-0"/>
                            <span className="flex-1">Clear Output</span>
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>

            </div>

            {/* Lightbox overlay for fullscreen figure viewing */}
            <AnimatePresence>
                {lightboxFigure && (
                    <Lightbox
                        figure={lightboxFigure}
                        onClose={() => setLightboxFigure(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
});

/* ------------------------------------------------------------------ */
/*  Tab button                                                         */
/* ------------------------------------------------------------------ */
// Plain-button tab with proper tab semantics (role="tab", aria-selected)
// so screen readers announce it as a tab control. The parent container
// should have role="tablist". Arrow-key navigation between tabs is
// handled by the parent (the browser's default Tab key navigation
// moves focus between tabs; arrow keys are a nice-to-have we skip here
// since the tabs are few + the user can Tab between them).
function TabButton({
                       active,
                       onClick,
                       children,
                       className,
                       title,
                   }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    title?: string;
}) {
    return (
        <button
            role="tab"
            aria-selected={active}
            onClick={onClick}
            title={title}
            className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded-sm transition-colors",
                active ? "bg-foreground/15" : "hover:bg-foreground/5",
                className
            )}
        >
            {children}
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  Figure grid                                                        */

/* ------------------------------------------------------------------ */
function FigureGrid({
                        figures,
                        sort,
                        onSort,
                        onLightbox,
                        theme,
                    }: {
    figures: Figure[];
    sort: "name" | "time";
    onSort: (s: "name" | "time") => void;
    onLightbox: (f: Figure) => void;
    /** Output theme — used for the figure caption styling. */
    theme: OutputTheme;
}) {
    // per-figure interactive (mpld3) mode. Keyed by figure
    // url; when on, the card renders the zoom/pan HTML companion in a
    // sandboxed iframe instead of the static PNG.
    const [interactiveOn, setInteractiveOn] = React.useState<
        Record<string, boolean>
    >({});
    const sorted = React.useMemo(() => {
        const list = [...figures];
        if (sort === "name") {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }
        // "time" preserves capture order (ascending index = capture order)
        return list;
    }, [figures, sort]);

    return (
        <div className="space-y-3">
            {/* Sort controls */}
            <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground mr-1">Sort:</span>
                {(["name", "time"] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => onSort(s)}
                        className={cn(
                            "px-2 py-0.5 rounded",
                            sort === s
                                ? "bg-foreground/15 text-zinc-100"
                                : "text-zinc-500 hover:bg-foreground/5"
                        )}
                    >
                        {s === "name" ? "Name" : "Capture order"}
                    </button>
                ))}
                <span className="ml-auto text-muted-foreground">
          {figures.length} figure{figures.length === 1 ? "" : "s"}
        </span>
                <button
                    onClick={async () => {
                        // Download all figures by fetching each one and opening
                        // a download link. We can't easily zip them client-side
                        // without a zip library, so we open each in sequence with
                        // a small delay to avoid browser popup blocking.
                        for (const f of figures) {
                            const a = document.createElement("a");
                            a.href = f.url;
                            a.download = f.name;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            await new Promise((r) => setTimeout(r, 200));
                        }
                    }}
                    className="px-2 py-0.5 rounded text-emerald-400 hover:bg-foreground/5 flex items-center gap-1"
                    title="Download all figures"
                >
                    <Download className="size-3"/>
                    Download all
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sorted.map((f, i) => {
                    const isVideo = /\.(mp4|webm|mov)$/i.test(f.name);
                    const isAnim = /\.gif$/i.test(f.name);
                    const iOn = !!f.interactiveUrl && !!interactiveOn[f.url];
                    return (
                        <figure
                            key={f.url}
                            className="rounded-lg overflow-hidden border border-foreground/10 bg-foreground/5"
                        >
                            {/* div[role=button] instead of <button> — a <video
                  controls> is interactive content and cannot nest
                  inside a button (valid HTML / no hydration error). */}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => !iOn && onLightbox(f)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        if (!iOn) onLightbox(f);
                                    }
                                }}
                                className={cn(
                                    "w-full block bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    iOn ? "" : "cursor-zoom-in"
                                )}
                                title={iOn ? "Interactive mode — drag to pan, scroll to zoom" : "Click to open fullscreen"}
                            >
                                {iOn && f.interactiveUrl ? (
                                    <iframe
                                        src={f.interactiveUrl}
                                        title={`${f.name} — interactive`}
                                        sandbox="allow-scripts"
                                        className="w-full h-[340px] block bg-white"
                                    />
                                ) : isVideo ? (
                                    <video
                                        src={f.url}
                                        controls
                                        className="w-full h-auto block bg-black"
                                        preload="metadata"
                                    />
                                ) : (
                                    <img
                                        src={f.url}
                                        alt={f.name}
                                        className="w-full h-auto block bg-white"
                                        loading="lazy"
                                    />
                                )}
                            </div>
                            <figcaption
                                className={cn("px-3 py-2 text-xs flex items-center gap-2", theme.figCaptionClass)}>
                                <ImageIcon className="size-3"/>
                                {isAnim && <span className="text-[9px] text-cyan-400">ANIM</span>}
                                {isVideo && <span className="text-[9px] text-purple-400">VIDEO</span>}
                                <span className="truncate flex-1">{f.name}</span>
                                {f.interactiveUrl && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setInteractiveOn((prev) => ({
                                                ...prev,
                                                [f.url]: !prev[f.url],
                                            }))
                                        }
                                        className={cn(
                                            "inline-flex items-center gap-0.5 hover:underline",
                                            iOn ? "text-cyan-400" : "text-cyan-400/70"
                                        )}
                                        title={
                                            iOn
                                                ? "Switch back to the static PNG"
                                                : "Switch to the interactive (mpld3) version — drag to pan, scroll to zoom"
                                        }
                                    >
                                        <MousePointerClick className="size-3"/>
                                        {iOn ? "Static" : "Interactive"}
                                    </button>
                                )}
                                <a
                                    href={f.url}
                                    download={f.name}
                                    className="inline-flex items-center gap-0.5 text-emerald-400 hover:underline"
                                    title={isVideo ? "Download video" : "Download figure"}
                                >
                                    <Download className="size-3"/>
                                    {isVideo ? "Download video" : "download"}
                                </a>
                                <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-emerald-400 hover:underline"
                                    title="Open in new tab"
                                >
                                    <ExternalLink className="size-3"/>
                                    Open in new tab
                                </a>
                                <span className="text-zinc-600">#{i + 1}</span>
                            </figcaption>
                        </figure>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Lightbox — fullscreen figure overlay with zoom                     */

/* ------------------------------------------------------------------ */
function Lightbox({
                      figure,
                      onClose,
                  }: {
    figure: Figure | null;
    onClose: () => void;
}) {
    React.useEffect(() => {
        if (!figure) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [figure, onClose]);

    if (!figure) return null;

    const isVideo = /\.(mp4|webm|mov)$/i.test(figure.name);

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 size-10 rounded-full bg-foreground/10 hover:bg-foreground/50 flex items-center justify-center text-white"
                aria-label="Close lightbox"
            >
                <X className="size-5"/>
            </button>
            <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3">
                {isVideo ? (
                    <video
                        src={figure.url}
                        controls
                        autoPlay
                        className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
                    />
                ) : (
                    <img
                        src={figure.url}
                        alt={figure.name}
                        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    />
                )}
                <p className="text-sm text-white/70 font-mono">{figure.name}</p>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  DataFrame view                                                     */

/* ------------------------------------------------------------------ */
/** Parsed grid data for the interactive DataFrame viewer. */
interface DfGrid {
    columns: string[];
    rows: string[][];
}

/** Parse a captured pandas HTML repr into a plain grid. The repr's
 *  thead th elements are the columns; tbody tr > td are the rows (the
 *  pandas index rides as the FIRST column when present). Runs in the
 *  browser with DOMParser — no server round-trip, no XSS (never
 *  innerHTML'd back; the grid renders through React text nodes). */
function parseDfHtml(html: string): DfGrid | null {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const table = doc.querySelector("table");
        if (!table) return null;
        const headCells = [...table.querySelectorAll("thead th")].map(
            (th) => th.textContent?.trim() ?? ""
        );
        const bodyRows = [...table.querySelectorAll("tbody tr")].map((tr) =>
            [...tr.querySelectorAll("th, td")].map((td) => td.textContent?.trim() ?? "")
        );
        if (headCells.length === 0 && bodyRows.length === 0) return null;
        // Index-less frames: pad the column list when rows are wider.
        const width = Math.max(headCells.length, ...(bodyRows.map((r) => r.length).length ? bodyRows.map((r) => r.length) : [0]));
        const columns =
            headCells.length >= width
                ? headCells
                : ["", ...headCells]; // the blank pandas index corner cell
        return {columns, rows: bodyRows};
    } catch {
        return null;
    }
}

/** CSV-quote one cell (RFC 4180-ish). */
function csvCell(v: string): string {
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function DataFrameView({
                           df,
                           theme,
                       }: {
    df: DataFrameCapture;
    theme: OutputTheme;
}) {
    // ── INTERACTIVE GRID (the "missing half of the Python data story"):
    //    the captured pandas HTML repr is parsed client-side into a grid
    //    with CLICK-TO-SORT columns, a substring FILTER row, and a
    //    one-click CSV export. Falls back to the original iframe when
    //    parsing yields nothing (non-tabular reprs).
    const [grid, setGrid] = React.useState<DfGrid | null>(null);
    const [gridFailed, setGridFailed] = React.useState(false);
    const [sortCol, setSortCol] = React.useState<number | null>(null);
    const [sortAsc, setSortAsc] = React.useState(true);
    const [filter, setFilter] = React.useState("");
    React.useEffect(() => {
        let alive = true;
        setGrid(null);
        setGridFailed(false);
        fetch(df.url)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((html) => {
                if (!alive) return;
                const parsed = parseDfHtml(html);
                if (parsed) setGrid(parsed);
                else setGridFailed(true);
            })
            .catch(() => {
                if (alive) setGridFailed(true);
            });
        return () => {
            alive = false;
        };
    }, [df.url]);

    const shownRows = React.useMemo(() => {
        if (!grid) return [];
        let rows = grid.rows;
        const q = filter.trim().toLowerCase();
        if (q) rows = rows.filter((r) => r.some((c) => c.toLowerCase().includes(q)));
        if (sortCol !== null) {
            const numeric = rows.length > 0 && rows.every((r) => r[sortCol] === "" || !Number.isNaN(Number(r[sortCol]?.replace(/[,]/g, ""))));
            rows = [...rows].sort((a, b) => {
                const av = a[sortCol] ?? "";
                const bv = b[sortCol] ?? "";
                if (numeric && av !== "" && bv !== "") {
                    const an = Number(av.replace(/[,]/g, ""));
                    const bn = Number(bv.replace(/[,]/g, ""));
                    return sortAsc ? an - bn : bn - an;
                }
                return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
            });
        }
        return rows;
    }, [grid, filter, sortCol, sortAsc]);

    const exportCsv = () => {
        if (!grid) return;
        const lines = [
            grid.columns.map(csvCell).join(","),
            ...shownRows.map((r) => r.map(csvCell).join(",")),
        ];
        const blob = new Blob([lines.join("\n")], {type: "text/csv;charset=utf-8"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${((df.dfName ?? df.name) || "dataframe").replace(/[^\w.-]+/g, "_")}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    return (
        <div className="rounded-lg border border-foreground/10 overflow-hidden">
            <div className={cn(
                "px-3 py-1.5 text-xs font-medium border-b border-foreground/10 bg-foreground/5 flex items-center gap-2",
                theme.labelClass
            )}>
                <Database className="size-3"/>
                <span className="truncate">{df.dfName ?? df.name}</span>
                {df.dtype && (
                    <span className={cn("text-[10px]", theme.subtitleClass)}>
            {df.dtype}
                        {df.shape && df.shape.length > 0 ? ` · ${df.shape.join(" × ")}` : ""}
          </span>
                )}
                {grid && (
                    <span className="ml-auto flex items-center gap-1.5">
            <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter rows…"
                aria-label={`Filter ${df.dfName ?? df.name} rows`}
                className="h-6 w-36 rounded border border-foreground/15 bg-background/80 px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
            />
            <button
                type="button"
                onClick={exportCsv}
                title="Export the visible (filtered + sorted) rows as CSV"
                className="h-6 rounded border border-foreground/15 bg-background/80 px-2 text-[11px] hover:bg-accent"
            >
              CSV
            </button>
          </span>
                )}
            </div>
            {grid ? (
                <div className="max-h-96 overflow-auto bg-white text-neutral-900">
                    <table className="w-full text-xs font-mono border-collapse">
                        <thead className="sticky top-0 bg-neutral-100 text-neutral-700">
                        <tr>
                            {grid.columns.map((c, i) => (
                                <th
                                    key={`dfc-${i}`}
                                    onClick={() => {
                                        if (sortCol === i) setSortAsc((v) => !v);
                                        else {
                                            setSortCol(i);
                                            setSortAsc(true);
                                        }
                                    }}
                                    className="cursor-pointer select-none whitespace-nowrap border-b border-neutral-300 px-2 py-1 text-left hover:bg-neutral-200"
                                    title={`Sort by ${c || "(index)"} — click again to reverse`}
                                >
                                    {c || "(index)"}
                                    {sortCol === i && <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody>
                        {shownRows.slice(0, 500).map((r, ri) => (
                            <tr key={`dfr-${ri}`} className="odd:bg-neutral-50/60">
                                {r.map((cell, ci) => (
                                    <td
                                        key={`dfr-${ri}-${ci}`}
                                        className={cn(
                                            "whitespace-nowrap border-b border-neutral-200 px-2 py-1",
                                            ci === 0 && "text-neutral-500",
                                            !Number.isNaN(Number(cell.replace(/,/g, ""))) && cell !== "" && "text-right tabular-nums"
                                        )}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {shownRows.length > 500 && (
                        <p className="border-t border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px] text-neutral-500">
                            Showing the first 500 of {shownRows.toLocaleString()} rows — the CSV export carries all of
                            them.
                        </p>
                    )}
                </div>
            ) : (
                <div className="bg-white max-h-96 overflow-auto">
                    {!gridFailed && (
                        <div className="flex h-40 items-center justify-center text-xs text-neutral-400">
                            Parsing table…
                        </div>
                    )}
                    {gridFailed && (
                        <iframe
                            src={df.url}
                            title={df.name}
                            className="w-full h-96 border-0 bg-white"
                            sandbox="allow-same-origin"
                        />
                    )}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Variable inspector                                                 */

/* ------------------------------------------------------------------ */
function VariableInspector({
                               variables,
                               theme,
                           }: {
    variables: VariableEntry[];
    theme: OutputTheme;
}) {
    return (
        <div className="rounded-md border border-foreground/10 overflow-hidden">
            <div className={cn(
                "px-3 py-1.5 text-xs font-medium border-b border-foreground/10 bg-foreground/5",
                theme.labelClass
            )}>
                {variables.length} variables in __main__ namespace
            </div>
            <table className="w-full text-xs font-mono">
                <thead className={cn("bg-foreground/5 sticky top-0", theme.subtitleClass)}>
                <tr>
                    <th className="text-left px-3 py-1.5">name</th>
                    <th className="text-left px-3 py-1.5">type</th>
                    <th className="text-left px-3 py-1.5">repr (truncated)</th>
                </tr>
                </thead>
                <tbody>
                {variables.map((v) => (
                    <tr key={v.name} className="border-t border-foreground/10">
                        <td className={cn("px-3 py-1.5", theme.labelClass)}>{v.name}</td>
                        <td className={cn("px-3 py-1.5", theme.subtitleClass)}>{v.type}</td>
                        <td className={cn("px-3 py-1.5 break-all", theme.stdoutClass)}>{v.repr}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Coverage view                                                      */

/* ------------------------------------------------------------------ */
function CoverageView({
                          coverage,
                          theme,
                          sourceCode,
                          failUnder = 0,
                          branchCoverage = false,
                      }: {
    coverage: CoverageMap;
    theme: OutputTheme;
    /** The main file's source — enables the statement % + the uncovered
     *  jump list for the file that just ran. */
    sourceCode?: string;
    /** Settings → Testing: mark the % red below this. 0 = off. */
    failUnder?: number;
    /** Settings → Testing: also list unexecuted branch-decision lines. */
    branchCoverage?: boolean;
}) {
    const files = Object.entries(coverage);
    const totalLines = files.reduce((n, [, lines]) => n + lines.length, 0);
    const {toast} = useToast();

    /* ── Main-file statement % + uncovered jumps ── the trace records
   *  executed LINE numbers; statement coverage = executed non-blank /
   *  non-comment source lines of the file that just ran (the page
   *  passes its source). Without the source (e.g. an imported module
   *  entry) the row keeps the plain executed-line count. */
    const mainFile = files.find(([name]) => sourceCode && (name === files[0]?.[0]));
    const mainCovered = mainFile ? new Set(mainFile[1]) : null;
    const sourceLines = React.useMemo(
        () => (typeof sourceCode === "string" ? sourceCode.split("\n") : []),
        [sourceCode]
    );
    const statementTotals = React.useMemo(() => {
        const executable = sourceLines
            .map((l, i) => ({l, n: i + 1}))
            .filter(({l}) => {
                const t = l.trim();
                return t.length > 0 && !t.startsWith("#");
            });
        return executable;
    }, [sourceLines]);
    const branchLines = React.useMemo(
        () =>
            statementTotals
                .filter(({l}) => /^\s*(if|elif|while|for|except|case)\b/.test(l))
                .map(({n}) => n),
        [statementTotals]
    );
    const coveredStatementCount =
        mainCovered && statementTotals.length > 0
            ? statementTotals.filter(({n}) => mainCovered.has(n)).length
            : null;
    const statementPct =
        coveredStatementCount !== null && statementTotals.length > 0
            ? Math.round((coveredStatementCount / statementTotals.length) * 100)
            : null;
    const belowThreshold =
        statementPct !== null && failUnder > 0 && statementPct < failUnder;
    const uncoveredStatements =
        mainCovered && statementTotals.length > 0
            ? statementTotals.filter(({n}) => !mainCovered.has(n)).map(({n}) => n)
            : [];
    const uncoveredBranches =
        mainCovered && branchCoverage
            ? branchLines.filter((n) => !mainCovered.has(n))
            : [];

    const jumpTo = (line: number) => {
        window.dispatchEvent(new CustomEvent("praxis:goto-line", {detail: {line}}));
    };

    return (
        <div className="space-y-3">
            <div className={cn("text-xs", theme.subtitleClass)}>
                {totalLines} lines executed across {files.length} file(s).
            </div>

            {/* ── Statement % + fail-under verdict (main file) ── */}
            {statementPct !== null && (
                <div
                    className={cn(
                        "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2",
                        belowThreshold
                            ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}
                    title={
                        belowThreshold
                            ? `Statement coverage ${statementPct}% is below the configured fail-under threshold (${failUnder}%).`
                            : `Statement coverage of the file that ran: ${coveredStatementCount}/${statementTotals.length} executable lines.`
                    }
                >
                    <Percent className="size-3.5"/>
                    <span className="text-xs font-medium tabular-nums">
            {statementPct}% statement coverage
          </span>
                    <span className="text-[10px] opacity-80">
            {coveredStatementCount}/{statementTotals.length} executable lines
          </span>
                    {belowThreshold && (
                        <span className="text-[10px] font-medium">
              below the fail-under threshold ({failUnder}%)
            </span>
                    )}
                    {uncoveredStatements.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                jumpTo(uncoveredStatements[0]);
                                toast({
                                    title: "Jumped to the first uncovered line",
                                    description: `${uncoveredStatements.length} uncovered line(s) — the gutter marks them dim red.`,
                                });
                            }}
                            className="ml-auto text-[10px] underline underline-offset-2 hover:opacity-80"
                        >
                            jump to first uncovered ({uncoveredStatements.length})
                        </button>
                    )}
                </div>
            )}

            {/* ── Branch-decision lines (Settings → Testing → branch coverage) ── */}
            {branchCoverage && uncoveredBranches.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1">
                        Unexecuted branch-decision lines (if / elif / while / for / except / case):
                    </div>
                    <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                        {uncoveredBranches.slice(0, 60).map((ln) => (
                            <button
                                key={ln}
                                type="button"
                                onClick={() => jumpTo(ln)}
                                className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 transition-colors"
                                title={`Jump to line ${ln} — this branch decision never executed`}
                            >
                                L{ln}
                            </button>
                        ))}
                        {uncoveredBranches.length > 60 && (
                            <span className="text-amber-600/70 dark:text-amber-400/70 px-1">
                +{uncoveredBranches.length - 60} more…
              </span>
                        )}
                    </div>
                </div>
            )}

            {files.map(([filename, lines]) => (
                <div key={filename} className="rounded-md border border-foreground/10 overflow-hidden">
                    <div className={cn(
                        "px-3 py-1.5 text-xs font-medium border-b border-foreground/10 bg-foreground/5",
                        theme.labelClass
                    )}>
                        {filename} · {lines.length} lines covered
                    </div>
                    <div
                        className={cn("p-3 font-mono text-[11px] grid grid-cols-8 sm:grid-cols-12 gap-0.5", theme.stdoutClass)}>
                        {lines.slice(0, 600).map((ln, i) => (
                            <span
                                key={i}
                                className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300"
                                title={`Line ${ln} executed`}
                            >
                {ln}
              </span>
                        ))}
                        {lines.length > 600 && (
                            <span className={cn("col-span-full mt-1 text-[11px]", theme.subtitleClass)}>
                + {lines.length - 600} more lines…
              </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Cached timestamp formatter                                         */

/* ------------------------------------------------------------------ */
function formatRelativeCached(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Resource monitor — polls /api/stats while a run is in flight      */

/* ------------------------------------------------------------------ */
function ResourceMonitor({
                             runId,
                             theme,
                         }: {
    runId?: string | null;
    theme: OutputTheme;
}) {
    const [stats, setStats] = React.useState<{
        cpuPercent: number;
        rssMb: number;
        running: boolean;
    } | null>(null);

    React.useEffect(() => {
        if (!runId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        // a single transient network error used to stop
        // the polling loop permanently (`catch → return`) — the CPU/RSS
        // chip froze at its last value for the rest of the run. Retry with
        // a small consecutive-failure cap instead; only give up after
        // several failures in a row (the run has likely ended).
        let consecutiveFailures = 0;
        const poll = async () => {
            try {
                const res = await fetch(`/api/stats?runId=${encodeURIComponent(runId)}`);
                const data = await res.json();
                if (!cancelled) {
                    consecutiveFailures = 0;
                    setStats({
                        cpuPercent: data.cpuPercent ?? 0,
                        rssMb: data.rssMb ?? 0,
                        running: !!data.running,
                    });
                    // Stop polling once the server reports the run is no longer
                    // active. Without this the component polls forever even
                    // after the script exits.
                    if (!data.running) return;
                }
            } catch {
                consecutiveFailures++;
                if (consecutiveFailures >= 5) return; // give up quietly
            }
            if (!cancelled) {
                timer = setTimeout(poll, 1000);
            }
        };
        poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [runId]);

    if (!stats || stats.cpuPercent === 0 && stats.rssMb === 0) return null;

    return (
        <span className={cn(
            "flex items-center gap-2 text-[10px] font-mono px-2 py-0.5 rounded-full",
            "bg-foreground/5",
            theme.subtitleClass
        )}>
      <span title="CPU usage">CPU {stats.cpuPercent.toFixed(1)}%</span>
      <span className="text-muted-foreground/40">·</span>
      <span title="Resident memory">RSS {stats.rssMb.toFixed(1)} MB</span>
    </span>
    );
}

/* ------------------------------------------------------------------ */
/*  Diff view                                                           */

/* ------------------------------------------------------------------ */
function DiffView({
                      oldText,
                      newText,
                      theme,
                  }: {
    oldText: string;
    newText: string;
    theme: OutputTheme;
}) {
    const diff = React.useMemo(
        () => computeLineDiff(oldText, newText),
        [oldText, newText]
    );

    return (
        <div className="rounded-lg border border-foreground/10 overflow-hidden">
            <div className={cn(
                "px-3 py-1.5 text-xs font-medium border-b border-foreground/10 bg-foreground/5",
                theme.labelClass
            )}>
                Diff vs previous run
            </div>
            <pre className="font-mono text-[0.8125rem] leading-relaxed p-3 max-h-72 overflow-auto">
        {diff.map((line, i) => (
            <div
                key={i}
                className={cn(
                    line.type === "add" && theme.diffAddClass,
                    line.type === "del" && theme.diffDelClass,
                    line.type === "ctx" && theme.stdoutClass
                )}
            >
            <span className="inline-block w-4 text-muted-foreground select-none">
              {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
            </span>
                {line.text || "\u00A0"}
            </div>
        ))}
      </pre>
        </div>
    );
}

type DiffLine = { type: "add" | "del" | "ctx"; text: string };

/** Hard cap on diff input size: the O(n×m) LCS table
 * allocates on the order of 2.5 billion cells for two 50,000-line
 * outputs — freezing or crashing the tab the moment the user clicks
 * Diff. Above this many lines per side we diff the tails (the part
 * that actually changes between runs) and say so. */
const MAX_DIFF_LINES = 3000;

/** Simple LCS-based line diff. Returns aligned lines with add/del/context markers. */
function computeLineDiff(a: string, b: string): DiffLine[] {
    let linesA = a.split("\n");
    let linesB = b.split("\n");

    let truncationNote: DiffLine | null = null;
    if (linesA.length > MAX_DIFF_LINES || linesB.length > MAX_DIFF_LINES) {
        truncationNote = {
            type: "ctx",
            text: `[diff input capped — comparing the last ${MAX_DIFF_LINES} lines of each output]`,
        };
        linesA = linesA.slice(-MAX_DIFF_LINES);
        linesB = linesB.slice(-MAX_DIFF_LINES);
    }

    const n = linesA.length;
    const m = linesB.length;

    // Build LCS table.
    const dp: number[][] = Array.from({length: n + 1}, () =>
        Array(m + 1).fill(0)
    );
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            if (linesA[i] === linesB[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    // Backtrack to produce the diff.
    const out: DiffLine[] = [];
    if (truncationNote) out.push(truncationNote);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (linesA[i] === linesB[j]) {
            out.push({type: "ctx", text: linesA[i]});
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({type: "del", text: linesA[i]});
            i++;
        } else {
            out.push({type: "add", text: linesB[j]});
            j++;
        }
    }
    while (i < n) out.push({type: "del", text: linesA[i++]});
    while (j < m) out.push({type: "add", text: linesB[j++]});

    // Trim long unchanged runs to keep the diff readable.
    // (The total context count is computed ONCE — it used to be an
    // out.filter(...) inside the loop, another quadratic term.)
    const totalCtx = out.reduce((acc, l) => (l.type === "ctx" ? acc + 1 : acc), 0);
    const trimmed: DiffLine[] = [];
    let ctxRun = 0;
    for (const l of out) {
        if (l.type === "ctx") {
            ctxRun++;
            if (ctxRun <= 3 || ctxRun === totalCtx) {
                // keep first 3 and last 1 context lines per run
                trimmed.push(l);
            } else if (ctxRun === 4) {
                trimmed.push({type: "ctx", text: "..."});
            }
        } else {
            ctxRun = 0;
            trimmed.push(l);
        }
    }
    return trimmed;
}

/* ------------------------------------------------------------------ */
/*  Tests view — renders the test_* functions discovered by the prelude */

/* ------------------------------------------------------------------ */
function TestsView({
                       tests,
                       theme,
                   }: {
    tests: string[];
    theme: OutputTheme;
}) {
    return (
        <div className="space-y-2">
            <div className={cn("text-xs flex items-center gap-2", theme.subtitleClass)}>
                <CheckCircle2 className="size-3.5"/>
                <span>{tests.length} test function{tests.length === 1 ? "" : "s"} discovered in the last run.</span>
            </div>
            <ul className="space-y-1">
                {tests.map((name) => (
                    <li
                        key={name}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-xs",
                            theme.labelClass,
                            "bg-foreground/5"
                        )}
                    >
                        <CheckCircle2 className="size-3.5 text-emerald-500"/>
                        {name}
                    </li>
                ))}
            </ul>
            <p className={cn("text-[11px] mt-2", theme.mutedClass)}>
                These are top-level <code>def test_*</code> functions found in the
                script. Use the <strong>Test</strong> tab in the Diagnostics panel
                below to actually run them with pytest.
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Live elapsed-time readout                                          */

/* ------------------------------------------------------------------ */
/** Ticks once per second while `active` is true, restarting from zero
 *  whenever `key` changes (a new runId / file = a new run). Returns
 *  null while inactive so callers render nothing. The clock is LOCAL
 *  — the SSE start event's timestamp never reaches this component —
 *  so a mid-run remount restarts the count; the server's authoritative
 *  durationMs still lands in the finished pill. */
function useRunElapsed(
    active: boolean,
    key: string | number | undefined
): number | null {
    const [elapsedMs, setElapsedMs] = React.useState<number | null>(null);
    const startedAtRef = React.useRef(0);
    const keyRef = React.useRef<string | number | undefined>(undefined);
    React.useEffect(() => {
        if (!active) {
            startedAtRef.current = 0;
            keyRef.current = key;
            setElapsedMs(null);
            return;
        }
        if (keyRef.current !== key || !startedAtRef.current) {
            startedAtRef.current = Date.now();
            keyRef.current = key;
        }
        setElapsedMs(Date.now() - startedAtRef.current);
        const t = setInterval(() => {
            setElapsedMs(Date.now() - startedAtRef.current);
        }, 1000);
        return () => clearInterval(t);
    }, [active, key]);
    return elapsedMs;
}

/* ------------------------------------------------------------------ */
/*  Status pill                                                        */

/* ------------------------------------------------------------------ */
function StatusPill({
                        result,
                        isRunning,
                        theme,
                        runKey,
                    }: {
    result: RunResult | null;
    isRunning: boolean;
    theme: OutputTheme;
    /** Identifies the current run (runId when known, else the file name)
     *  so the live elapsed clock restarts on every new run. */
    runKey?: string | null;
}) {
    // Live elapsed readout (1a) — hook must run unconditionally at the
    // top of the component; it self-disables (returns null) when the run
    // is not active. mm:ss under an hour, h:mm:ss above.
    const elapsedMs = useRunElapsed(isRunning, runKey ?? undefined);
    // Pull a short interpreter label (e.g. "py3.11") out of the full
    // path so it can be shown next to the duration.
    const interpLabel = (() => {
        if (!result?.interpreter) return null;
        const base = result.interpreter.split(/[\\/]/).pop() ?? result.interpreter;
        // "python3.11" / "python3" / "python.exe" → "py3.11" / "py3" / "py"
        const m = base.match(/^python(?:3?\.?(\d+(?:\.\d+)?)?)?/i);
        if (m) {
            const ver = m[1];
            return ver ? `py${ver}` : (base.toLowerCase().startsWith("python3") ? "py3" : "py");
        }
        return base;
    })();

    if (isRunning) {
        return (
            <span
                className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", theme.infoClass)}>
        <Loader2 className="size-3 animate-spin"/>
        Running
                {elapsedMs != null && (
                    <span
                        className={cn("font-normal ml-1 tabular-nums", theme.subtitleClass)}
                        title="Elapsed time since this run started"
                    >
            {formatElapsedRun(elapsedMs)}
          </span>
                )}
      </span>
        );
    }
    if (!result) {
        return (
            <span className={cn(
                "text-xs font-medium bg-foreground/5 px-2.5 py-1 rounded-full",
                theme.subtitleClass
            )}>
        idle
      </span>
        );
    }
    if (result.killed || result.error === "timeout") {
        // Timeout vs user stop (1b): the run route now stamps a
        // "[praxis] run timed out after N s" stderr marker when the hard
        // timeout fires (a user Stop sends no marker), so this branch can
        // finally tell them apart. The old `killed ? "Stopped" : "Timed
        // out"` could NEVER show "Timed out" — both the timeout and the
        // user stop set killed:true, and result.error was never "timeout".
        const timedOut =
            !!result.timedOut || isTimeoutRun(result.stderr, result.error);
        return (
            <span
                className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", theme.warningClass)}>
        <Clock className="size-3"/>
                {timedOut ? "Timed out" : "Stopped"}
                {typeof result.durationMs === "number" && (
                    <span className={cn("font-normal ml-1", theme.subtitleClass)}>
            · {(result.durationMs / 1000).toFixed(2)}s
          </span>
                )}
      </span>
        );
    }
    if (result.ok) {
        return (
            <span
                className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", theme.successClass)}>
        <CircleCheck className="size-3"/>
        OK
                {typeof result.durationMs === "number" && (
                    <span className={cn("font-normal ml-1", theme.subtitleClass)}>
            · {(result.durationMs / 1000).toFixed(2)}s
          </span>
                )}
                {interpLabel && (
                    <span className={cn("font-normal ml-0.5", theme.subtitleClass)}>· {interpLabel}</span>
                )}
      </span>
        );
    }
    return (
        <span
            className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full", theme.errorClass)}>
      <CircleX className="size-3"/>
      Exit {result.exitCode ?? "?"}
            {typeof result.durationMs === "number" && (
                <span className={cn("font-normal ml-1", theme.subtitleClass)}>
          · {(result.durationMs / 1000).toFixed(2)}s
        </span>
            )}
            {interpLabel && (
                <span className={cn("font-normal ml-0.5", theme.subtitleClass)}>· {interpLabel}</span>
            )}
    </span>
    );
}
