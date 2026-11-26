"use client";

import * as React from "react";
import {
    Activity,
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    Terminal,
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {Skeleton} from "@/components/ui/skeleton";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";

/**
 * AsyncTaskPanel — the live asyncio inspector for the persistent console
 * kernel (bottom panel ▸ Async tab).
 *
 * Data source: POST /api/console { action: "tasks", session } → the kernel's
 * _collect_tasks() walk (asyncio.all_tasks() + get_coro()/get_stack()
 * introspection). The same payload feeds the Variables rail's footer chip;
 * this dedicated tab adds polling, filtering and the swallowed-cancellation
 * highlight.
 *
 * Layout mirrors the other bottom-panel rails (Tasks / Variables): a toolbar
 * (auto-refresh switch + refresh button + state filter chips), then one
 * collapsible row per task — state badge, mono name, "awaiting <chain>"
 * chip, and the task's stack. Cancelled tasks carry a warning icon and
 * border (a task that ended cancelled may have swallowed CancelledError).
 * A null console session shows the centered "attach" empty state.
 */

/** Mirrors the /api/console tasks payload (console kernel contract). */
interface ConsoleTask {
    id: string;
    name: string;
    state: string;
    awaiting?: string;
    stack?: string[];
}

interface TasksResponse {
    ok: boolean;
    tasks?: ConsoleTask[];
    note?: string;
    error?: string;
}

const POLL_MS = 4000;

function taskStateClass(state: string): string {
    const s = (state ?? "").toLowerCase();
    if (s.includes("finish") || s.includes("done")) return "text-muted-foreground";
    if (s.includes("cancel")) return "text-red-600 dark:text-red-400";
    if (s.includes("pend")) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
}

export function AsyncTaskPanel({
                                   active,
                                   consoleSessionId,
                               }: {
    /** True while the Async tab is the visible bottom-panel tab. */
    active: boolean;
    /** Live kernel session id; null → the attach empty state. */
    consoleSessionId: string | null;
}) {
    const [tasks, setTasks] = React.useState<ConsoleTask[] | null>(null);
    const [note, setNote] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [auto, setAuto] = React.useState(true);
    const [filter, setFilter] = React.useState<"all" | "pending" | "cancelled">("all");
    const [openIds, setOpenIds] = React.useState<Set<string>>(new Set());
    const busyRef = React.useRef(false);

    const refresh = React.useCallback(async () => {
        if (!consoleSessionId || busyRef.current) return;
        busyRef.current = true;
        setLoading(true);
        try {
            const res = await fetch("/api/console", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "tasks", session: consoleSessionId}),
            });
            const data = (await res.json()) as TasksResponse;
            if (!res.ok || !data.ok) {
                setError(data.error ?? `HTTP ${res.status}`);
            } else {
                setTasks(data.tasks ?? []);
                setNote(data.note ?? null);
                setError(null);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            busyRef.current = false;
            setLoading(false);
        }
    }, [consoleSessionId]);

    /* One fetch when the tab becomes visible with a session attached; poll
     * only while visible + auto (a background tab must not spam the kernel). */
    React.useEffect(() => {
        if (!active || !consoleSessionId) return;
        void refresh();
        if (!auto) return;
        const t = window.setInterval(() => void refresh(), POLL_MS);
        return () => window.clearInterval(t);
    }, [active, auto, consoleSessionId, refresh]);

    const visible = React.useMemo(() => {
        if (!tasks) return [];
        if (filter === "pending") return tasks.filter((t) => t.state.toLowerCase().includes("pend"));
        if (filter === "cancelled") return tasks.filter((t) => t.state.toLowerCase().includes("cancel"));
        return tasks;
    }, [tasks, filter]);

    const cancelledCount = tasks?.filter((t) => t.state.toLowerCase().includes("cancel")).length ?? 0;
    const pendingCount = tasks?.filter((t) => t.state.toLowerCase().includes("pend")).length ?? 0;

    const toggle = (id: string) =>
        setOpenIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    if (!consoleSessionId) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-sm rounded-lg border bg-muted/20 p-6 text-center">
                    <Terminal className="mx-auto size-8 text-muted-foreground" aria-hidden="true"/>
                    <p className="mt-3 text-sm font-medium">No console session attached</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Run a cell in the Console panel (Run ▸ Run in Console) to start the persistent kernel —
                        the Async tab then lists every asyncio task it hosts, live.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* toolbar */}
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
                <Activity className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true"/>
                <span className="text-xs font-semibold">Async tasks</span>
                <span className="truncate font-mono text-[10px] text-muted-foreground" title={consoleSessionId}>
          session {consoleSessionId.slice(0, 8)}
        </span>
                <div className="ml-auto flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Switch checked={auto} onCheckedChange={setAuto} aria-label="Auto-refresh async tasks"/>
                        auto {POLL_MS / 1000}s
                    </label>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[10px]"
                        onClick={() => void refresh()}
                        disabled={loading}
                        title="Refresh the task list now"
                    >
                        {loading ? <Loader2 className="size-3 animate-spin"/> : <RefreshCw className="size-3"/>}
                        Refresh
                    </Button>
                </div>
            </div>

            {/* filter chips */}
            <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/10 px-3 py-1.5">
                {(["all", "pending", "cancelled"] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                            filter === f
                                ? "border-foreground/30 bg-foreground/10 text-foreground"
                                : "border-transparent text-muted-foreground hover:bg-foreground/5"
                        )}
                    >
                        {f === "all" ? `All ${tasks?.length ?? 0}` : f === "pending" ? `Pending ${pendingCount}` : `Cancelled ${cancelledCount}`}
                    </button>
                ))}
                {auto && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            {active ? <Play className="size-2.5 text-emerald-600 dark:text-emerald-400"/> :
                <Pause className="size-2.5"/>}
                        polling {POLL_MS / 1000}s
          </span>
                )}
            </div>

            {/* list */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {error ? (
                    <p className="px-1 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
                ) : tasks === null && loading ? (
                    <div className="space-y-1.5" aria-label="Loading async tasks">
                        {Array.from({length: 4}, (_, i) => (
                            <Skeleton key={i} className="h-10 w-full rounded"/>
                        ))}
                    </div>
                ) : visible.length > 0 ? (
                    <div className="space-y-1" role="tree" aria-label="Asyncio task tree">
                        {visible.map((t) => {
                            const open = openIds.has(t.id) || t.stack === undefined;
                            const cancelled = t.state.toLowerCase().includes("cancel");
                            return (
                                <Collapsible key={t.id} open={open} onOpenChange={() => toggle(t.id)}>
                                    <div
                                        className={cn(
                                            "rounded border px-2 py-1.5",
                                            cancelled ? "border-red-300 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20" : "bg-muted/20"
                                        )}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" size="sm" className="size-5 p-0"
                                                        aria-label={`Toggle stack for ${t.name}`}>
                                                    {open ? <ChevronDown className="size-3"/> :
                                                        <ChevronRight className="size-3"/>}
                                                </Button>
                                            </CollapsibleTrigger>
                                            <Badge variant="outline"
                                                   className={cn("shrink-0 px-1 text-[9px]", taskStateClass(t.state))}>
                                                {t.state}
                                            </Badge>
                                            <span className="truncate font-mono text-[11px]" title={t.name}>
                        {t.name}
                      </span>
                                            {cancelled && (
                                                <AlertTriangle
                                                    className="size-3 shrink-0 text-red-600 dark:text-red-400"
                                                    aria-label="Task ended cancelled — check it did not swallow CancelledError"
                                                />
                                            )}
                                            {t.awaiting && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-auto shrink-0 px-1 text-[9px] text-fuchsia-600 dark:text-fuchsia-400"
                                                    title={`awaiting ${t.awaiting}`}
                                                >
                                                    awaiting
                                                </Badge>
                                            )}
                                        </div>
                                        {t.awaiting && (
                                            <p className="mt-0.5 truncate pl-6 font-mono text-[9px] text-muted-foreground"
                                               title={t.awaiting}>
                                                {t.awaiting}
                                            </p>
                                        )}
                                        <CollapsibleContent>
                                            {t.stack && t.stack.length > 0 ? (
                                                <pre
                                                    className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/30 p-1.5 pl-6 font-mono text-[9px] leading-3.5 text-muted-foreground">
                          {t.stack.join("\n")}
                        </pre>
                                            ) : (
                                                <p className="pl-6 pt-1 text-[9px] text-muted-foreground">No suspended
                                                    stack frames.</p>
                                            )}
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <p className="max-w-sm text-center text-xs text-muted-foreground">
                            No asyncio tasks in the kernel right now.
                            {note ? <span className="mt-1 block text-[10px]">{note}</span> : null}
                        </p>
                    </div>
                )}
            </div>

            {/* footer note */}
            <div className="shrink-0 border-t px-3 py-1 text-[10px] text-muted-foreground">
                {note ?? `${tasks?.length ?? 0} task(s) · ${pendingCount} pending · ${cancelledCount} cancelled`} —
                kernel bridge:
                asyncio.all_tasks() + get_stack()/get_coro(), polled every {POLL_MS / 1000}s while visible.
            </div>
        </div>
    );
}
