"use client";

import * as React from "react";
import type {LucideIcon} from "lucide-react";
import {
    Activity,
    AlertTriangle,
    Ban,
    Braces,
    ChevronDown,
    ChevronRight,
    Circle,
    Copy,
    Grid3x3,
    Hash,
    LineChart,
    List,
    Loader2,
    Package,
    Pin,
    RefreshCw,
    Search,
    SquareFunction,
    Table2,
    Terminal,
    Type,
    X,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {Switch} from "@/components/ui/switch";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {queueConsoleRun} from "@/lib/pending-console-run";
import {fetchVariableGrid, type VariableGridPayload,} from "@/lib/console-variable-grid";

/**
 * VariableExplorer — the live KERNEL NAMESPACE rail for the console
 * session (embedded as a panel body in a TabsContent).
 *
 * ▸ toolbar: manual Refresh + an auto-refresh switch polling the
 *   namespace every 2s (ONLY while `active` and the switch is on —
 *   the interval is cleared in the effect cleanup, and every 5th tick
 *   also re-evaluates the pinned watches so /api/console stays under
 *   its rate limit) + a client-side filter.
 * ▸ WATCH: pin-managed expressions (input + ×), each showing its
 *   current preview; clicking one drills into it. Persisted per file
 *   in localStorage.
 * ▸ LIST: live variables via POST /api/console {action:"inspect"} —
 *   kind chip (icon + color), mono name, type · shape · len, preview.
 *   Click a row → drill-down detail pane ({action:"inspect", expr,
 *   deep}) with a clickable breadcrumb (Home / df / columns / 0) and
 *   nested members as an indented tree with the same chips.
 * ▸ per-row actions: Copy repr, Plot (canPlot only — dispatches the
 *   console panel's `praxis:console-run` window event with a
 *   matplotlib one-liner) and Run in console (same event, repr print).
 * ▸ footer Tasks chip: POST {action:"tasks"} on open, rendering the
 *   kernel's async task tree (state, awaiting, stack) collapsible.
 *
 * Every fetch has skeleton rows; a null session shows the centered
 * "attach" empty state.
 */

/** Mirrors the /api/console inspect payload (console agent's contract). */
interface ConsoleVar {
    name: string;
    kind: string;
    type: string;
    shape?: string;
    preview: string;
    len?: number;
    keys?: string[];
    canPlot: boolean;
    sample?: number[];
    children?: ConsoleVar[];
}

/** Mirrors the /api/console tasks payload. */
interface ConsoleTask {
    id: string;
    name: string;
    state: string;
    awaiting?: string;
    stack?: string[];
}

interface InspectResponse {
    ok: boolean;
    vars?: ConsoleVar[];
    var?: ConsoleVar;
    error?: string;
}

interface TasksResponse {
    ok: boolean;
    tasks?: ConsoleTask[];
    error?: string;
}

/* ─── Pure helpers ─────────────────────────────────────────────────── */

/** Icon + color per variable kind (fallback: muted Circle). Colors are
 *  the codebase palette — no blue/indigo. */
function kindVisual(kind: string): { Icon: LucideIcon; cls: string } {
    const k = (kind ?? "").toLowerCase();
    if (k.includes("dataframe") || k.includes("series")) return {
        Icon: Table2,
        cls: "text-emerald-600 dark:text-emerald-400"
    };
    if (k.includes("ndarray") || k.includes("tensor")) return {
        Icon: Grid3x3,
        cls: "text-amber-600 dark:text-amber-400"
    };
    if (k.includes("figure") || k.includes("plot") || k.includes("axes")) return {
        Icon: LineChart,
        cls: "text-emerald-600 dark:text-emerald-400"
    };
    if (k.includes("list") || k.includes("tuple") || k.includes("set")) return {
        Icon: List,
        cls: "text-teal-600 dark:text-teal-400"
    };
    if (k.includes("dict") || k.includes("mapping")) return {
        Icon: Braces,
        cls: "text-fuchsia-600 dark:text-fuchsia-400"
    };
    if (k.includes("func")) return {Icon: SquareFunction, cls: "text-purple-600 dark:text-purple-400"};
    if (k.includes("str")) return {Icon: Type, cls: "text-lime-700 dark:text-lime-400"};
    if (k.includes("bool")) return {Icon: Activity, cls: "text-rose-600 dark:text-rose-400"};
    if (k.includes("int") || k.includes("float") || k.includes("number")) return {
        Icon: Hash,
        cls: "text-orange-600 dark:text-orange-400"
    };
    if (k.includes("module")) return {Icon: Package, cls: "text-muted-foreground"};
    if (k.includes("none")) return {Icon: Ban, cls: "text-muted-foreground"};
    return {Icon: Circle, cls: "text-muted-foreground"};
}

/** Child access expression for one drill step — indices as [i],
 *  identifier-like keys as .key, other keys as ["quoted"]
 *  (JSON.stringify emits a valid Python literal for the common cases). */
function childExpr(parentExpr: string, name: string): string {
    if (/^-?\d+$/.test(name)) return `${parentExpr}[${name}]`;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `${parentExpr}.${name}`;
    return `${parentExpr}[${JSON.stringify(name)}]`;
}

/** The matplotlib one-liner dispatched for Plot. The kernel-side
 *  sample the inspector already captured is always numeric, so it is
 *  plotted literally when present; otherwise the live expression is
 *  passed to plt.plot. */
function plotCodeFor(expr: string, v: ConsoleVar): string {
    if (Array.isArray(v.sample) && v.sample.length > 0 && v.sample.every((x) => Number.isFinite(x))) {
        return `import matplotlib.pyplot as plt; plt.plot(${JSON.stringify(v.sample)}); plt.show()`;
    }
    return `import matplotlib.pyplot as plt; plt.plot(${expr}); plt.show()`;
}

/** Hand code to the console panel — routed through the durable
 * pending-console-run store (queueConsoleRun) so the submission
 * survives even when the Console panel is not mounted yet: the store
 * drains on the panel's next mount instead of firing a lost window
 * event (the same first-run-empty fix the toolbar Run-in-console
 * path got). */
function runInConsole(code: string, fileName: string): void {
    try {
        queueConsoleRun(code, fileName);
    } catch {
        /* older browsers / no window */
    }
}

/** Color for an asyncio task state badge. */
function taskStateClass(state: string): string {
    const s = state.toLowerCase();
    if (s.includes("finish") || s.includes("done")) return "text-muted-foreground";
    if (s.includes("cancel")) return "text-red-600 dark:text-red-400";
    if (s.includes("pend")) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
}

/* ─── Small presentational pieces ──────────────────────────────────── */

function KindChip({kind}: { kind: string }) {
    const {Icon, cls} = kindVisual(kind);
    return (
        <span
            className="inline-flex shrink-0 items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
            title={`kind: ${kind}`}
        >
      <Icon className={cn("size-3", cls)} aria-hidden="true"/>
      <span className="max-w-24 truncate">{kind}</span>
    </span>
    );
}

/** Per-row actions — Copy repr / Grid (tabular kinds — the page's
 *  VariableGridDialogHost claims PRAXIS_OPEN_VARIABLE_GRID) / Plot
 *  (canPlot) / Run in console. Hidden until hover but always
 *  focusable (focus-within) for keyboards. */
function VarRowActions({
                           expr,
                           v,
                           fileName,
                           onCopy,
                           onOpenGrid,
                           gridBusy,
                       }: {
    expr: string;
    v: ConsoleVar;
    fileName: string;
    onCopy: (v: ConsoleVar) => void;
    /** Open this variable in the DataFrame/grid viewer (tabular kinds). */
    onOpenGrid?: (expr: string) => void;
    /** True while THIS row's grid fetch is in flight. */
    gridBusy?: boolean;
}) {
    /* The kernel makes the final call (anything not table-like comes
     * back as an error toast) — the row only offers the action for
     * kinds that can plausibly serialize to a grid. */
    const gridable =
        /dataframe|series|ndarray|matrix|array|tensor|dict|list|set/i.test(v.kind) ||
        Boolean(v.shape);
    return (
        <span
            className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={(e) => {
              e.stopPropagation();
              onCopy(v);
          }}
          aria-label={`Copy repr of ${v.name}`}
          title="Copy repr"
      >
        <Copy className="size-3"/>
      </Button>
            {gridable && onOpenGrid && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={gridBusy}
                    onClick={(e) => {
                        e.stopPropagation();
                        void onOpenGrid(expr);
                    }}
                    aria-label={`Open ${v.name} in the DataFrame viewer`}
                    title="Open in DataFrame viewer (grid)"
                >
                    {gridBusy ? (
                        <Loader2 className="size-3 animate-spin"/>
                    ) : (
                        <Table2 className="size-3"/>
                    )}
                </Button>
            )}
            {v.canPlot && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={(e) => {
                        e.stopPropagation();
                        runInConsole(plotCodeFor(expr, v), fileName);
                    }}
                    aria-label={`Plot ${v.name} in the console`}
                    title="Plot in the console"
                >
                    <LineChart className="size-3"/>
                </Button>
            )}
            <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={(e) => {
                    e.stopPropagation();
                    runInConsole(`print(repr(${expr}))`, fileName);
                }}
                aria-label={`Print ${v.name} in the console`}
                title="Run in the console"
            >
        <Terminal className="size-3"/>
      </Button>
    </span>
    );
}

/* ─── Component ────────────────────────────────────────────────────── */

export function VariableExplorer({
                                     active,
                                     folderSlug,
                                     fileSlug,
                                     fileName,
                                     consoleSessionId,
                                     interpreter,
                                 }: {
    /** True while this rail's tab is the visible one — auto-refresh only
     *  polls while active. */
    active: boolean;
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** Live kernel session to inspect; null → the "attach" empty state. */
    consoleSessionId: string | null;
    /** Optional interpreter path (shown in the attached caption). */
    interpreter?: string;
}) {
    const {toast} = useToast();
    const [vars, setVars] = React.useState<ConsoleVar[] | null>(null);
    const [refreshing, setRefreshing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [filter, setFilter] = React.useState("");
    const [auto, setAuto] = React.useState(false);
    // pinned watch expressions + their latest preview
    const [watches, setWatches] = React.useState<string[]>([]);
    const [watchDraft, setWatchDraft] = React.useState("");
    const [watchPreviews, setWatchPreviews] = React.useState<Record<string, { text: string; error: boolean }>>({});
    // drill-down state: breadcrumb path + the member being inspected
    const [path, setPath] = React.useState<Array<{ label: string; expr: string }>>([]);
    const [detail, setDetail] = React.useState<ConsoleVar | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [detailError, setDetailError] = React.useState<string | null>(null);
    // async tasks footer
    const [tasksOpen, setTasksOpen] = React.useState(false);
    const [tasks, setTasks] = React.useState<ConsoleTask[] | null>(null);
    const [tasksLoading, setTasksLoading] = React.useState(false);
    const [tasksError, setTasksError] = React.useState<string | null>(null);

    // guards: one list cycle at a time / latest drill wins / latest watches
    const busyRef = React.useRef(false);
    const detailSeqRef = React.useRef(0);
    const watchesRef = React.useRef<string[]>([]);
    const tickRef = React.useRef(0);
    React.useEffect(() => {
        watchesRef.current = watches;
    }, [watches]);

    /* Watch pins persist per file (folder+file key under STORAGE_PREFIX). */
    const watchKey = React.useMemo(
        () => `${STORAGE_PREFIX}.var-watch.${encodeURIComponent(folderSlug)}.${encodeURIComponent(fileSlug)}`,
        [folderSlug, fileSlug]
    );
    React.useEffect(() => {
        let list: string[] = [];
        try {
            const raw = window.localStorage.getItem(watchKey);
            const parsed: unknown = JSON.parse(raw ?? "[]");
            if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
                list = parsed as string[];
            }
        } catch {
            /* corrupt — start empty */
        }
        setWatches(list);
        setWatchPreviews({});
    }, [watchKey]);
    // Persist from the mutation handlers only (not an effect): an effect
    // saving on mount would clobber the just-loaded pins with [].
    const persistWatches = (list: string[]) => {
        try {
            window.localStorage.setItem(watchKey, JSON.stringify(list));
        } catch {
            /* storage quota / private mode */
        }
    };

    /** POST /api/console inspect action — never rejects. */
    const inspect = React.useCallback(
        async (payload: { session: string; expr?: string; deep?: number }): Promise<InspectResponse> => {
            try {
                const res = await fetch("/api/console", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "inspect", ...payload}),
                });
                const data = (await res.json()) as InspectResponse;
                if (!res.ok) return {ok: false, error: data.error ?? `HTTP ${res.status}`};
                return data;
            } catch (err) {
                return {ok: false, error: (err as Error).message};
            }
        },
        []
    );

    /** One namespace refresh cycle (guarded — auto + manual + mount all
     *  funnel through here, so overlapping cycles never stack). */
    const refresh = React.useCallback(async () => {
        if (!consoleSessionId || busyRef.current) return;
        busyRef.current = true;
        setRefreshing(true);
        try {
            const data = await inspect({session: consoleSessionId});
            if (data.ok && data.vars) {
                setVars(data.vars);
                setError(null);
            } else {
                setError(data.error ?? "The kernel did not respond.");
            }
        } finally {
            busyRef.current = false;
            setRefreshing(false);
        }
    }, [consoleSessionId, inspect]);

    /** Re-evaluate every pinned watch (sequential — gentle on the
     *  /api/console rate limit). */
    const refreshWatches = React.useCallback(async () => {
        const session = consoleSessionId;
        if (!session) return;
        for (const expr of [...watchesRef.current]) {
            const data = await inspect({session, expr});
            setWatchPreviews((prev) => ({
                ...prev,
                [expr]: data.ok
                    ? {text: data.var?.preview ?? "—", error: false}
                    : {text: data.error ?? "error", error: true},
            }));
        }
    }, [consoleSessionId, inspect]);

    /** Inspect one expression for the drill-down pane (stale responses
     *  from a superseded click are dropped via the sequence counter). */
    const fetchDetail = React.useCallback(
        async (expr: string) => {
            if (!consoleSessionId) return;
            const seq = ++detailSeqRef.current;
            setDetailLoading(true);
            setDetailError(null);
            const data = await inspect({session: consoleSessionId, expr, deep: 2});
            if (detailSeqRef.current !== seq) return;
            setDetailLoading(false);
            if (data.ok && data.var) {
                setDetail(data.var);
            } else {
                setDetail(null);
                setDetailError(data.error ?? "Could not inspect this member.");
            }
        },
        [consoleSessionId, inspect]
    );

    const drillTo = (label: string, expr: string) => {
        setPath((prev) => [...prev, {label, expr}]);
        void fetchDetail(expr);
    };

    /** Breadcrumb segment click: -1 = Home (back to the list). */
    const jumpTo = (index: number) => {
        if (index < 0) {
            detailSeqRef.current++;
            setPath([]);
            setDetail(null);
            setDetailError(null);
            setDetailLoading(false);
            return;
        }
        const target = path[index];
        if (!target) return;
        setPath(path.slice(0, index + 1));
        void fetchDetail(target.expr);
    };

    /* Session change → the namespace is different: drop stale vars,
     * drill state and previews, then fetch the fresh snapshot. */
    React.useEffect(() => {
        setPath([]);
        setDetail(null);
        setDetailError(null);
        setVars(null);
        setWatchPreviews({});
        if (consoleSessionId) void refresh();
    }, [consoleSessionId, refresh]);

    /* Becoming the visible tab again → catch up immediately. */
    React.useEffect(() => {
        if (active && consoleSessionId) void refresh();
    }, [active, consoleSessionId, refresh]);

    /* Auto-refresh: a 2s interval ONLY while active + switch on + a
     * session exists; cleanup always clears it. Every 5th tick also
     * re-evaluates the watches (~10s) to stay under the /api/console
     * rate limit. */
    React.useEffect(() => {
        if (!active || !auto || !consoleSessionId) return;
        const id = window.setInterval(() => {
            tickRef.current += 1;
            void refresh().then(() => {
                if (tickRef.current % 5 === 0) void refreshWatches();
            });
        }, 2000);
        return () => window.clearInterval(id);
    }, [active, auto, consoleSessionId, refresh, refreshWatches]);

    /** POST /api/console {action:"tasks"} — fetched on footer open. */
    const fetchTasks = React.useCallback(async () => {
        setTasksLoading(true);
        setTasksError(null);
        try {
            const res = await fetch("/api/console", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "tasks"}),
            });
            const data = (await res.json()) as TasksResponse;
            if (data.ok && data.tasks) setTasks(data.tasks);
            else setTasksError(data.error ?? `HTTP ${res.status}`);
        } catch (err) {
            setTasksError((err as Error).message);
        } finally {
            setTasksLoading(false);
        }
    }, []);

    const onTasksOpen = (o: boolean) => {
        setTasksOpen(o);
        if (o) void fetchTasks();
    };

    const addWatch = (raw: string) => {
        const expr = raw.trim();
        if (!expr || watches.includes(expr)) return;
        const next = [...watches, expr];
        setWatches(next);
        persistWatches(next);
        setWatchDraft("");
        // evaluate the new pin immediately
        if (consoleSessionId) {
            void inspect({session: consoleSessionId, expr}).then((data) =>
                setWatchPreviews((prev) => ({
                    ...prev,
                    [expr]: data.ok
                        ? {text: data.var?.preview ?? "—", error: false}
                        : {text: data.error ?? "error", error: true},
                }))
            );
        }
    };

    const removeWatch = (expr: string) => {
        const next = watches.filter((w) => w !== expr);
        setWatches(next);
        persistWatches(next);
        setWatchPreviews((prev) => {
            const copy = {...prev};
            delete copy[expr];
            return copy;
        });
    };

    const copyText = (label: string, value: string) => {
        void navigator.clipboard?.writeText(value).then(() =>
            toast({title: `${label} copied`, variant: "success"})
        );
    };
    const copyRepr = (v: ConsoleVar) => copyText(`Repr of ${v.name}`, v.preview);

    /* ── Open a variable in the DataFrame/grid viewer ───────────────────
     * Fetches the tabular serialization from the live kernel session
     * (the same POST /api/console/variable the console panel uses) and
     * dispatches PRAXIS_OPEN_VARIABLE_GRID — the page-level
     * <VariableGridDialogHost /> claims it and mounts the grid dialog.
     * One fetch at a time (the clicked row shows its spinner); every
     * failure surfaces as a toast. */
    const [gridExpr, setGridExpr] = React.useState<string | null>(null);
    const openInGrid = React.useCallback(
        async (expr: string) => {
            if (!expr.trim() || gridExpr) return;
            const sid = consoleSessionId;
            if (!sid) {
                toast({
                    title: "Variables",
                    description:
                        "No live console session attached — run a submission first.",
                    variant: "destructive",
                });
                return;
            }
            setGridExpr(expr);
            try {
                const data = await fetchVariableGrid(sid, expr);
                const payload: VariableGridPayload = {...data, title: expr, expr};
                const evt = new CustomEvent("PRAXIS_OPEN_VARIABLE_GRID", {
                    detail: payload,
                    cancelable: true,
                });
                window.dispatchEvent(evt);
                if (!evt.defaultPrevented) {
                    toast({
                        title: "Grid viewer",
                        description: "No grid host is mounted — open the Console panel and retry.",
                        variant: "destructive",
                    });
                }
            } catch (err) {
                toast({
                    title: "Could not open the grid",
                    description: err instanceof Error ? err.message : "Network error.",
                    variant: "destructive",
                });
            } finally {
                setGridExpr(null);
            }
        },
        [consoleSessionId, gridExpr, toast]
    );

    const manualRefresh = () => {
        void refresh().then(() => void refreshWatches());
        if (tasksOpen) void fetchTasks();
    };

    const shownVars = React.useMemo(() => {
        const list = vars ?? [];
        const q = filter.trim().toLowerCase();
        if (!q) return list;
        return list.filter((v) =>
            [v.name, v.type, v.kind, v.shape ?? "", v.preview].some((s) => s.toLowerCase().includes(q))
        );
    }, [vars, filter]);

    /** One drill tree node — children (when the deep fetch returned them)
     *  render indented beneath; clicking any node drills into it. */
    const renderVarNode = (node: ConsoleVar, expr: string, depth: number): React.ReactNode => {
        const nodeExpr = childExpr(expr, node.name);
        return (
            <div key={`${expr}|${node.name}`}>
                <div
                    role="button"
                    tabIndex={0}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-0.5 hover:bg-accent/40"
                    style={{paddingLeft: 8 + depth * 14}}
                    onClick={() => drillTo(node.name, nodeExpr)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            drillTo(node.name, nodeExpr);
                        }
                    }}
                    aria-label={`Inspect ${node.name}`}
                >
                    <KindChip kind={node.kind}/>
                    <span className="shrink-0 truncate font-mono text-[11px] text-purple-600 dark:text-purple-400"
                          title={node.name}>
            {node.name}
          </span>
                    <span className="shrink-0 text-[9px] text-muted-foreground">
            {node.type}
                        {node.shape ? ` · ${node.shape}` : ""}
          </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-foreground/70" title={node.preview}>
            {node.preview}
          </span>
                    <VarRowActions
                        expr={nodeExpr}
                        v={node}
                        fileName={fileName}
                        onCopy={copyRepr}
                        onOpenGrid={openInGrid}
                        gridBusy={gridExpr === nodeExpr}
                    />
                </div>
                {node.children?.map((c) => renderVarNode(c, nodeExpr, depth + 1))}
            </div>
        );
    };

    const attached = Boolean(consoleSessionId);

    return (
        <div className="flex h-full min-h-0 flex-col text-xs">
            {/* ── toolbar: refresh + auto toggle + filter ── */}
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={manualRefresh}
                    disabled={!attached || refreshing}
                    title="Refresh the namespace now"
                >
                    {refreshing ? <Loader2 className="size-3.5 animate-spin"/> : <RefreshCw className="size-3.5"/>}
                    Refresh
                </Button>
                <span className="flex select-none items-center gap-1.5 text-[10px] text-muted-foreground">
          <Switch id="varx-auto" checked={auto} onCheckedChange={setAuto} disabled={!attached}/>
          <label htmlFor="varx-auto" className="cursor-pointer"
                 title="Poll the namespace every 2 seconds while this tab is visible">
            auto 2s
          </label>
        </span>
                <div className="flex min-w-28 flex-1 items-center gap-1.5">
                    <Search className="size-3 shrink-0 text-muted-foreground" aria-hidden="true"/>
                    <Input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter variables…"
                        className="h-7 text-xs"
                        aria-label="Filter kernel variables"
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* ── status caption ── */}
            <div className="flex items-baseline gap-2 border-b px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="truncate" title={fileName}>
          {fileName}
        </span>
                <span className="ml-auto shrink-0 font-mono" title={consoleSessionId ?? undefined}>
          {consoleSessionId
              ? `attached · ${consoleSessionId.slice(0, 8)}${interpreter ? ` · ${interpreter}` : ""}`
              : "not attached"}
        </span>
            </div>

            {!attached ? (
                /* ── no session: centered empty state ── */
                <div className="flex flex-1 items-center justify-center px-6 py-10">
                    <div className="flex max-w-64 flex-col items-center gap-2 text-center text-muted-foreground">
                        <Terminal className="size-5 opacity-40" aria-hidden="true"/>
                        <p>
                            No console session yet — run a file in the console or open a notebook cell to attach.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── pinned watch list ── */}
                    <div className="space-y-1.5 border-b px-3 py-2">
                        <div
                            className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                            <Pin className="size-3" aria-hidden="true"/>
                            WATCH
                            <span className="text-[9px] text-muted-foreground/70">
                {watches.length} pinned
              </span>
                        </div>
                        <div className="flex gap-1.5">
                            <Input
                                value={watchDraft}
                                onChange={(e) => setWatchDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addWatch(watchDraft);
                                    }
                                }}
                                placeholder="Pin an expression — e.g. df.shape"
                                className="h-7 font-mono text-[11px]"
                                aria-label="Watch expression to pin"
                                spellCheck={false}
                            />
                            <Button
                                size="sm"
                                className="h-7 shrink-0 gap-1 text-xs"
                                onClick={() => addWatch(watchDraft)}
                                disabled={!watchDraft.trim() || watches.includes(watchDraft.trim())}
                                title="Pin this expression to the watch list"
                            >
                                <Pin className="size-3"/> Pin
                            </Button>
                        </div>
                        {watches.length === 0 ? (
                            <p className="py-0.5 text-[10px] text-muted-foreground/70">
                                Pin expressions (len(x), df.shape, total) to track them here.
                            </p>
                        ) : (
                            <ul className="space-y-1" aria-label="Pinned watch expressions">
                                {watches.map((w) => {
                                    const preview = watchPreviews[w];
                                    return (
                                        <li
                                            key={w}
                                            className="group flex items-center gap-1.5 rounded border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]"
                                        >
                                            <button
                                                type="button"
                                                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                                                onClick={() => drillTo(w, w)}
                                                title={`Inspect ${w}`}
                                                aria-label={`Inspect watch ${w}`}
                                            >
                                                <span className="shrink-0 text-foreground/85">{w}</span>
                                                <span
                                                    className={cn(
                                                        "truncate text-muted-foreground",
                                                        preview?.error && "text-red-600 dark:text-red-400"
                                                    )}
                                                    title={preview?.text ?? "not evaluated yet"}
                                                >
                          {preview ? preview.text : "…"}
                        </span>
                                            </button>
                                            <button
                                                type="button"
                                                className="shrink-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                                                onClick={() => removeWatch(w)}
                                                aria-label={`Remove watch ${w}`}
                                                title="Remove this pin"
                                            >
                                                <X className="size-2.5" aria-hidden="true"/>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* ── main body: list or drill-down detail ── */}
                    {path.length === 0 ? (
                        <div className="min-h-0 flex-1 overflow-y-auto" role="region" aria-label="Kernel variables">
                            {refreshing && vars === null ? (
                                <div className="space-y-1.5 px-3 py-2" aria-label="Loading variables">
                                    {Array.from({length: 6}, (_, i) => (
                                        <Skeleton key={i} className="h-7 w-full rounded"/>
                                    ))}
                                </div>
                            ) : error && vars === null ? (
                                <div
                                    className="flex items-start gap-2 px-3 py-2 text-[10px] text-red-600 dark:text-red-400">
                                    <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true"/>
                                    <span className="break-words">{error}</span>
                                </div>
                            ) : vars === null ? (
                                <p className="px-3 py-2 text-muted-foreground">No snapshot yet — press Refresh.</p>
                            ) : shownVars.length === 0 ? (
                                <div
                                    className="flex flex-col items-center gap-1.5 px-6 py-10 text-center text-muted-foreground">
                                    {filter.trim() ? (
                                        <p>No variable matches “{filter.trim()}”.</p>
                                    ) : (
                                        <>
                                            <Terminal className="size-4 opacity-40" aria-hidden="true"/>
                                            <p>The namespace is empty — run some code in the console first.</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {error && (
                                        <div
                                            className="flex items-center gap-2 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-600 dark:text-red-400">
                                            <AlertTriangle className="size-3 shrink-0" aria-hidden="true"/>
                                            <span className="truncate">{error}</span>
                                        </div>
                                    )}
                                    <ul className="divide-y divide-border/60" role="list" aria-label="Kernel variables">
                                        {shownVars.map((v) => (
                                            <li
                                                key={v.name}
                                                role="button"
                                                tabIndex={0}
                                                className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent/40"
                                                onClick={() => drillTo(v.name, v.name)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        drillTo(v.name, v.name);
                                                    }
                                                }}
                                                aria-label={`Inspect variable ${v.name}`}
                                            >
                                                <KindChip kind={v.kind}/>
                                                <span
                                                    className="shrink-0 max-w-32 truncate font-mono text-xs text-purple-600 dark:text-purple-400"
                                                    title={v.name}
                                                >
                          {v.name}
                        </span>
                                                <span className="shrink-0 text-[9px] text-muted-foreground">
                          {v.type}
                                                    {v.shape ? ` · ${v.shape}` : ""}
                                                    {v.len !== undefined ? ` · len ${v.len}` : ""}
                        </span>
                                                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70"
                                                      title={v.preview}>
                          {v.preview}
                        </span>
                                                <VarRowActions
                                                    expr={v.name}
                                                    v={v}
                                                    fileName={fileName}
                                                    onCopy={copyRepr}
                                                    onOpenGrid={openInGrid}
                                                    gridBusy={gridExpr === v.name}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    ) : (
                        /* ── drill-down detail pane ── */
                        <div className="flex min-h-0 flex-1 flex-col">
                            {/* breadcrumb: Home / df / columns / 0 */}
                            <nav
                                aria-label="Variable path"
                                className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5 text-[10px]"
                            >
                                <button
                                    type="button"
                                    className="rounded px-1.5 py-0.5 font-medium hover:bg-accent/50"
                                    onClick={() => jumpTo(-1)}
                                    aria-label="Back to the variable list"
                                >
                                    Home
                                </button>
                                {path.map((seg, i) => (
                                    <React.Fragment key={`${i}-${seg.expr}`}>
                                        <span className="select-none text-muted-foreground/60"
                                              aria-hidden="true">/</span>
                                        <button
                                            type="button"
                                            className={cn(
                                                "max-w-28 truncate rounded px-1.5 py-0.5 font-mono hover:bg-accent/50",
                                                i === path.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"
                                            )}
                                            onClick={() => jumpTo(i)}
                                            title={seg.expr}
                                        >
                                            {seg.label}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </nav>

                            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                                {detailLoading ? (
                                    <div className="space-y-1.5" aria-label="Loading variable detail">
                                        <Skeleton className="h-6 w-1/2 rounded"/>
                                        <Skeleton className="h-4 w-1/3 rounded"/>
                                        <Skeleton className="h-16 w-full rounded"/>
                                        {Array.from({length: 3}, (_, i) => (
                                            <Skeleton key={i} className="h-5 w-full rounded"/>
                                        ))}
                                    </div>
                                ) : detailError ? (
                                    <div className="flex items-start gap-2 text-[10px] text-red-600 dark:text-red-400">
                                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true"/>
                                        <span className="break-words">{detailError}</span>
                                    </div>
                                ) : detail ? (
                                    <>
                                        {/* the member itself */}
                                        <div className="flex items-center gap-2 py-1">
                                            <KindChip kind={detail.kind}/>
                                            <span
                                                className="truncate font-mono text-xs text-purple-600 dark:text-purple-400">
                        {detail.name}
                      </span>
                                            <span className="shrink-0 text-[9px] text-muted-foreground">
                        {detail.type}
                                                {detail.shape ? ` · ${detail.shape}` : ""}
                                                {detail.len !== undefined ? ` · len ${detail.len}` : ""}
                      </span>
                                            <VarRowActions
                                                expr={path.length > 0 ? path[path.length - 1].expr : detail.name}
                                                v={detail}
                                                fileName={fileName}
                                                onCopy={copyRepr}
                                                onOpenGrid={openInGrid}
                                                gridBusy={
                                                    gridExpr ===
                                                    (path.length > 0 ? path[path.length - 1].expr : detail.name)
                                                }
                                            />
                                        </div>
                                        {detail.preview && (
                                            <pre
                                                className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded border bg-muted/20 p-2 font-mono text-[10px] leading-4">
                        {detail.preview}
                      </pre>
                                        )}
                                        {detail.keys && detail.keys.length > 0 && (
                                            <p className="truncate px-1 py-1 font-mono text-[9px] text-muted-foreground"
                                               title={detail.keys.join(", ")}>
                                                keys · {detail.keys.slice(0, 12).join(", ")}
                                                {detail.keys.length > 12 ? ` … +${detail.keys.length - 12}` : ""}
                                            </p>
                                        )}
                                        {/* nested members as an indented tree */}
                                        {detail.children && detail.children.length > 0 ? (
                                            <div className="mt-1 space-y-0.5" role="tree" aria-label="Nested members">
                                                {detail.children.map((c) => renderVarNode(c, path.length > 0 ? path[path.length - 1].expr : detail.name, 0))}
                                            </div>
                                        ) : (
                                            <p className="px-1 pt-2 text-[10px] text-muted-foreground">
                                                No nested members returned — the value is a leaf.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="py-2 text-muted-foreground">Nothing inspected yet.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── footer: async tasks chip (fetches on open) ── */}
                    <div className="border-t">
                        <Collapsible open={tasksOpen} onOpenChange={onTasksOpen}>
                            <div className="flex items-center gap-2 px-3 py-1.5">
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                                        aria-expanded={tasksOpen}
                                        title="Asyncio tasks running in the kernel"
                                    >
                                        {tasksOpen ? <ChevronDown className="size-3"/> :
                                            <ChevronRight className="size-3"/>}
                                        Tasks
                                        {tasks && tasks.length > 0 && (
                                            <Badge variant="outline" className="px-1 text-[9px]">
                                                {tasks.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </CollapsibleTrigger>
                                {tasksLoading &&
                                  <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true"/>}
                            </div>
                            <CollapsibleContent>
                                <div className="max-h-40 space-y-1 overflow-y-auto px-3 pb-2">
                                    {tasksError ? (
                                        <p className="text-[10px] text-red-600 dark:text-red-400">{tasksError}</p>
                                    ) : tasksLoading ? (
                                        <div className="space-y-1" aria-label="Loading async tasks">
                                            {Array.from({length: 3}, (_, i) => (
                                                <Skeleton key={i} className="h-8 w-full rounded"/>
                                            ))}
                                        </div>
                                    ) : tasks && tasks.length > 0 ? (
                                        tasks.map((t) => (
                                            <div key={t.id}
                                                 className="rounded border bg-muted/20 px-2 py-1 text-[10px]">
                                                <div className="flex items-center gap-1.5">
                                                    <Badge variant="outline"
                                                           className={cn("shrink-0 px-1 text-[8px]", taskStateClass(t.state))}>
                                                        {t.state}
                                                    </Badge>
                                                    <span className="truncate font-mono" title={t.name}>
                            {t.name}
                          </span>
                                                    {t.awaiting && (
                                                        <Badge
                                                            variant="outline"
                                                            className="ml-auto shrink-0 px-1 text-[8px] text-fuchsia-600 dark:text-fuchsia-400"
                                                            title={`awaiting ${t.awaiting}`}
                                                        >
                                                            awaiting
                                                        </Badge>
                                                    )}
                                                </div>
                                                {t.stack && t.stack.length > 0 && (
                                                    <pre
                                                        className="mt-0.5 max-h-16 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-3.5 text-muted-foreground">
                            {t.stack.join("\n")}
                          </pre>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="py-1 text-[10px] text-muted-foreground">No pending asyncio
                                            tasks.</p>
                                    )}
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </>
            )}
        </div>
    );
}
