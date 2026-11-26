"use client";

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";
import {useToast} from "@/hooks/use-toast";
import {STORAGE_PREFIX} from "@/lib/config";
import {ChevronDown, ListTodo, Loader2, Play, RefreshCw, Square, Star, X,} from "lucide-react";

/**
 * TasksPanelContent — the bottom panel's Tasks tab body.
 *
 * Scans the active folder for task definitions (GET /api/tasks?folder=…):
 * npm scripts, Makefile targets, justfile recipes and pyproject entries.
 * Rows show the source, the name, the command, a Pin star (persisted in
 * localStorage — pinned tasks float to the top), the run status and a
 * Run/Stop button. Running a task POSTs /api/tasks and consumes its SSE
 * stream into a per-run OUTPUT channel: a small closable tab strip (max
 * 6) over a mono scrollable pane that auto-scrolls unless the user
 * scrolled up (then a "follow" chip brings it back).
 */

/* ── API shapes (mirror of src/app/api/tasks/route.ts) ───────────── */

type TaskSource = "npm" | "make" | "just" | "pyproject" | "package";

interface TaskDef {
    id: string;
    name: string;
    source: TaskSource;
    command: string;
    cwd?: string;
}

interface TaskRoots {
    hasPackage: boolean;
    hasMake: boolean;
    hasJust: boolean;
    hasPyproject: boolean;
}

/* ── local state shapes ──────────────────────────────────────────── */

type TaskStatus =
    | { phase: "idle" }
    | { phase: "running" }
    | { phase: "ok" }
    | { phase: "failed"; code: number | null }
    | { phase: "stopped" };

type ChannelStatus = "running" | "ok" | "failed" | "stopped";

interface OutputChannel {
    key: string;
    taskId: string;
    name: string;
    source: TaskSource;
    status: ChannelStatus;
    exitCode: number | null;
    /** Log lines — the last element may be a partial line. */
    lines: string[];
    /** Output arrived while the user was scrolled up. */
    hasNew: boolean;
}

/* ── constants ───────────────────────────────────────────────────── */

const PINNED_KEY = `${STORAGE_PREFIX}.tasks.pinned`;
const MAX_CHANNELS = 6;
const MAX_CHANNEL_CHARS = 200_000;

const SOURCE_META: Record<TaskSource, { label: string; dot: string; title: string }> = {
    npm: {label: "npm", dot: "bg-rose-500", title: "package.json script"},
    make: {label: "make", dot: "bg-amber-500", title: "Makefile target"},
    just: {label: "just", dot: "bg-teal-500", title: "justfile recipe"},
    package: {label: "pkg", dot: "bg-fuchsia-500", title: "pyproject [project.scripts] entry"},
    pyproject: {label: "praxis", dot: "bg-violet-500", title: "pyproject [tool.praxis.tasks] entry"},
};
// Unknown sources (server grew a new one) degrade gracefully.
const FALLBACK_META = {label: "task", dot: "bg-muted-foreground", title: "task definition"};

/* ── small presentational helpers ────────────────────────────────── */

function StatusBadge({status}: { status: TaskStatus }) {
    const base =
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium";
    switch (status.phase) {
        case "running":
            return (
                <span className={cn(base, "text-emerald-600 dark:text-emerald-400")} title="Task is running">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500"/>
          running
        </span>
            );
        case "ok":
            return (
                <span className={cn(base, "text-emerald-600 dark:text-emerald-400")} title="Exited with code 0">
          ok
        </span>
            );
        case "failed":
            return (
                <span
                    className={cn(base, "text-red-600 dark:text-red-400")}
                    title={status.code === null ? "Exited without a code" : `Exited with code ${status.code}`}
                >
          failed{status.code !== null ? ` (${status.code})` : ""}
        </span>
            );
        case "stopped":
            return (
                <span className={cn(base, "text-amber-600 dark:text-amber-400")} title="Stopped by the user">
          stopped
        </span>
            );
        default:
            return (
                <span className={cn(base, "text-muted-foreground")} title="Never ran in this session">
          idle
        </span>
            );
    }
}

function RootBadge({label, title}: { label: string; title: string }) {
    return (
        <span
            className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            title={title}
        >
      {label}
    </span>
    );
}

function channelDot(status: ChannelStatus): string {
    switch (status) {
        case "running":
            return "size-1.5 animate-pulse rounded-full bg-emerald-500";
        case "failed":
            return "size-1.5 rounded-full bg-red-500"; // persists after the run ends
        case "stopped":
            return "size-1.5 rounded-full bg-amber-500";
        default:
            return "size-1.5 rounded-full bg-emerald-600/70";
    }
}

/** Exit-state label for a channel's tooltip. */
function channelTitle(c: OutputChannel): string {
    const state =
        c.status === "running" ? "running"
            : c.status === "ok" ? `exited 0`
                : c.status === "stopped" ? "stopped"
                    : c.exitCode === null ? "failed (no code)" : `failed (${c.exitCode})`;
    return `Output of ${c.name} — ${state}`;
}

/* ── the panel ───────────────────────────────────────────────────── */

export function TasksPanelContent({
                                      folderSlug,
                                      folderName,
                                  }: {
    folderSlug: string;
    folderName: string;
}) {
    const {toast} = useToast();
    const [tasks, setTasks] = React.useState<TaskDef[] | null>(null);
    const [roots, setRoots] = React.useState<TaskRoots | null>(null);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [refreshing, setRefreshing] = React.useState(false);
    const [pinned, setPinned] = React.useState<Set<string>>(new Set());
    const [pinnedOnly, setPinnedOnly] = React.useState(false);
    const [statuses, setStatuses] = React.useState<Record<string, TaskStatus>>({});
    const [channels, setChannels] = React.useState<OutputChannel[]>([]);
    const [activeChannel, setActiveChannel] = React.useState<string | null>(null);
    const [follow, setFollow] = React.useState<Record<string, boolean>>({});
    const controllers = React.useRef(new Map<string, AbortController>());
    const runSeq = React.useRef(0);
    const followRef = React.useRef<Record<string, boolean>>({});
    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    /* ── load the task definitions ──────────────────────────────────── */

    const load = React.useCallback(
        async (silent = false) => {
            if (!silent) setRefreshing(true);
            try {
                const res = await fetch(
                    `/api/tasks?folder=${encodeURIComponent(folderSlug)}`,
                    {cache: "no-store"}
                );
                const data = (await res.json()) as {
                    ok?: boolean;
                    tasks?: TaskDef[];
                    roots?: TaskRoots;
                    error?: string;
                };
                if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                const list = Array.isArray(data.tasks) ? data.tasks : [];
                setTasks(
                    list.filter(
                        (t) =>
                            typeof t?.id === "string" &&
                            typeof t?.name === "string" &&
                            typeof t?.command === "string"
                    )
                );
                setRoots(
                    data.roots ?? {
                        hasPackage: false,
                        hasMake: false,
                        hasJust: false,
                        hasPyproject: false,
                    }
                );
                setLoadError(null);
            } catch (err) {
                setTasks([]);
                setLoadError((err as Error).message);
                if (!silent) {
                    toast({
                        title: "Could not load tasks",
                        description: (err as Error).message,
                        variant: "destructive",
                    });
                }
            } finally {
                setRefreshing(false);
            }
        },
        [folderSlug, toast]
    );

    React.useEffect(() => {
        setTasks(null);
        setRoots(null);
        setLoadError(null);
        setStatuses({});
        setChannels([]);
        setActiveChannel(null);
        void load();
    }, [load, folderSlug]);

    /* ── "Run Task…" from a task file's right-click menu ──────────────
       * The Explorer dispatches praxis:open-tasks {file} on
       * package.json / Makefile / justfile / pyproject.toml; the page
       * opens this panel, and once the task list for the folder is
       * loaded the file's FIRST matching task auto-runs (one click from
       * the file straight to a streaming output channel). */
    const pendingTaskFileRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        const onOpenTasks = (e: Event) => {
            const d = (e as CustomEvent).detail as { file?: string } | undefined;
            pendingTaskFileRef.current =
                typeof d?.file === "string" ? d.file.toLowerCase() : null;
        };
        window.addEventListener("praxis:open-tasks", onOpenTasks);
        return () => window.removeEventListener("praxis:open-tasks", onOpenTasks);
    }, []);
    React.useEffect(() => {
        const want = pendingTaskFileRef.current;
        if (!want || !tasks) return;
        pendingTaskFileRef.current = null;
        const sourcesFor: Record<string, TaskSource[]> = {
            "package.json": ["npm"],
            "makefile": ["make"],
            "justfile": ["just"],
            "pyproject.toml": ["package", "pyproject"],
        };
        const wanted = sourcesFor[want] ?? [];
        const matched = tasks.find((t) => wanted.includes(t.source));
        if (matched) {
            void runTask(matched);
            toast({title: `Task started: ${matched.name}`, description: matched.command});
        } else {
            toast({
                title: "No task found in that file",
                description: "The Tasks panel below lists every task it detected in this folder.",
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks]);

    // Abort in-flight runs when the folder changes or the panel unmounts.
    React.useEffect(() => {
        const map = controllers.current;
        return () => {
            for (const ctrl of map.values()) ctrl.abort();
            map.clear();
        };
    }, [folderSlug]);

    // Pinned ids hydrate from localStorage after mount (SSR-safe).
    React.useEffect(() => {
        try {
            const raw = window.localStorage.getItem(PINNED_KEY);
            const parsed: unknown = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) {
                setPinned(new Set(parsed.filter((x): x is string => typeof x === "string")));
            }
        } catch {
            /* corrupt list — start fresh */
        }
    }, []);

    const togglePin = (task: TaskDef) => {
        setPinned((prev) => {
            const next = new Set(prev);
            if (next.has(task.id)) next.delete(task.id);
            else next.add(task.id);
            try {
                window.localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
            } catch {
                /* quota — the pin still applies for this session */
            }
            return next;
        });
    };

    /* ── output channel plumbing ──────────────────────────────────── */

    const appendLines = (key: string, text: string) => {
        setChannels((prev) =>
            prev.map((c) => {
                if (c.key !== key) return c;
                const lines = [...c.lines];
                const last = lines.pop() ?? "";
                const merged = last + text;
                for (const piece of merged.split("\n")) lines.push(piece);
                // Cap the scrollback so long-running tasks cannot grow unbounded.
                let total = 0;
                for (const l of lines) total += l.length;
                while (total > MAX_CHANNEL_CHARS && lines.length > 1) {
                    total -= lines[0].length;
                    lines.shift();
                }
                return {
                    ...c,
                    lines,
                    hasNew: c.hasNew || followRef.current[key] === false,
                };
            })
        );
    };

    const setFollowFor = (key: string, value: boolean) => {
        followRef.current[key] = value;
        setFollow((prev) => ({...prev, [key]: value}));
        if (value) {
            setChannels((prev) =>
                prev.map((c) => (c.key === key ? {...c, hasNew: false} : c))
            );
        }
    };

    // Auto-scroll the pane to the bottom on new output while following.
    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el || !activeChannel) return;
        if (followRef.current[activeChannel]) el.scrollTop = el.scrollHeight;
    }, [channels, activeChannel]);

    const onPaneScroll = () => {
        const el = scrollRef.current;
        if (!el || !activeChannel) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
        if (atBottom !== !!followRef.current[activeChannel]) {
            setFollowFor(activeChannel, atBottom);
        }
    };

    const closeChannel = (key: string) => {
        const idx = channels.findIndex((c) => c.key === key);
        if (idx === -1) return;
        const target = channels[idx];
        // Closing a running channel stops its fetch (and the server kills the child).
        if (target.status === "running") {
            controllers.current.get(target.taskId)?.abort();
        }
        const next = channels.filter((c) => c.key !== key);
        setChannels(next);
        delete followRef.current[key];
        if (activeChannel === key) {
            const fallback = next[Math.min(idx, next.length - 1)];
            setActiveChannel(fallback ? fallback.key : null);
        }
    };

    /* ── run / stop ───────────────────────────────────────────────── */

    const runTask = async (task: TaskDef) => {
        if (statuses[task.id]?.phase === "running") return;
        const key = `${task.id}#${++runSeq.current}`;
        const ctrl = new AbortController();
        controllers.current.set(task.id, ctrl);
        followRef.current[key] = true;
        setStatuses((prev) => ({...prev, [task.id]: {phase: "running"}}));
        setChannels((prev) => {
            // One channel per task — re-runs replace the previous one.
            let next = prev.filter((c) => c.taskId !== task.id);
            if (next.length >= MAX_CHANNELS) {
                // Evict the oldest finished channel; if all run, the oldest overall.
                let evict = next.findIndex((c) => c.status !== "running");
                if (evict === -1) evict = 0;
                next = next.filter((_, i) => i !== evict);
            }
            next.push({
                key,
                taskId: task.id,
                name: task.name,
                source: task.source,
                status: "running",
                exitCode: null,
                lines: [`$ ${task.command}${task.cwd ? `  (in ${task.cwd})` : ""}`],
                hasNew: false,
            });
            return next;
        });
        setActiveChannel(key);

        const patchChannel = (updater: (c: OutputChannel) => OutputChannel) =>
            setChannels((prev) => prev.map((c) => (c.key === key ? updater(c) : c)));

        try {
            const res = await fetch("/api/tasks", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    command: task.command,
                    cwd: task.cwd,
                }),
                signal: ctrl.signal,
            });
            if (!res.ok || !res.body) {
                let message = `HTTP ${res.status}`;
                try {
                    const data = (await res.json()) as { error?: string };
                    if (data.error) message = data.error;
                } catch {
                    /* keep the HTTP status message */
                }
                throw new Error(message);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";
                for (const part of parts) {
                    for (const line of part.split("\n")) {
                        if (!line.startsWith("data: ")) continue;
                        let evt: Record<string, unknown>;
                        try {
                            evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
                        } catch {
                            continue;
                        }
                        if (evt.kind === "out" && typeof evt.text === "string") {
                            appendLines(key, evt.text);
                        } else if (evt.kind === "exit") {
                            const code = typeof evt.code === "number" ? evt.code : null;
                            patchChannel((c) => ({
                                ...c,
                                status: code === 0 ? "ok" : "failed",
                                exitCode: code,
                            }));
                            setStatuses((prev) => ({
                                ...prev,
                                [task.id]: code === 0 ? {phase: "ok"} : {phase: "failed", code},
                            }));
                        }
                    }
                }
            }
            // The server closed the stream without an exit event (abrupt exit).
            patchChannel((c) =>
                c.status === "running" ? {...c, status: "failed", exitCode: null} : c
            );
            setStatuses((prev) =>
                prev[task.id]?.phase === "running"
                    ? {...prev, [task.id]: {phase: "failed", code: null}}
                    : prev
            );
        } catch (err) {
            if (
                err instanceof DOMException &&
                err.name === "AbortError"
            ) {
                // Stop button — the server kills the process group on stream cancel.
                appendLines(key, "\n[stopped by user]\n");
                patchChannel((c) => ({...c, status: "stopped", exitCode: null}));
                setStatuses((prev) => ({...prev, [task.id]: {phase: "stopped"}}));
            } else {
                const message = (err as Error).message;
                appendLines(key, `\n[error] ${message}\n`);
                patchChannel((c) => ({...c, status: "failed", exitCode: null}));
                setStatuses((prev) => ({
                    ...prev,
                    [task.id]: {phase: "failed", code: null},
                }));
                toast({
                    title: `Task "${task.name}" failed`,
                    description: message,
                    variant: "destructive",
                });
            }
        } finally {
            controllers.current.delete(task.id);
        }
    };

    const stopTask = (task: TaskDef) => {
        controllers.current.get(task.id)?.abort();
    };

    /* ── derived list ──────────────────────────────────────────────── */

    const visible = React.useMemo(() => {
        if (tasks === null) return null;
        const list = pinnedOnly ? tasks.filter((t) => pinned.has(t.id)) : tasks;
        // Pinned tasks float to the top; the rest keep scan order (sort is stable).
        return [...list].sort(
            (a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id))
        );
    }, [tasks, pinned, pinnedOnly]);

    const active = channels.find((c) => c.key === activeChannel) ?? null;

    /* ── render ───────────────────────────────────────────────────── */

    return (
        <div className="flex flex-col gap-2 p-3" aria-label={`Tasks in ${folderName}`}>
            {/* header row: refresh + detected sources + pinned filter */}
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1 text-xs"
                    onClick={() => void load()}
                    disabled={refreshing}
                    title="Rescan the folder for task definitions"
                    aria-label="Rescan tasks"
                >
                    {refreshing ? (
                        <Loader2 className="size-3.5 animate-spin"/>
                    ) : (
                        <RefreshCw className="size-3.5"/>
                    )}
                    Refresh
                </Button>
                {roots && (
                    <div className="flex flex-wrap items-center gap-1">
                        {roots.hasPackage && (
                            <RootBadge label="npm scripts" title="package.json detected"/>
                        )}
                        {roots.hasMake && <RootBadge label="Makefile" title="Makefile detected"/>}
                        {roots.hasJust && (
                            <RootBadge label="justfile" title="justfile detected"/>
                        )}
                        {roots.hasPyproject && (
                            <RootBadge label="pyproject" title="pyproject.toml detected"/>
                        )}
                    </div>
                )}
                <div className="ml-auto flex items-center gap-1">
                    <Button
                        variant={pinnedOnly ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setPinnedOnly((v) => !v)}
                        aria-pressed={pinnedOnly}
                        title="Show only pinned tasks"
                    >
                        <Star className={cn("size-3.5", pinnedOnly && "fill-current")}/>
                        Pinned
                    </Button>
                </div>
            </div>

            {/* skeletons while the scan runs */}
            {tasks === null && (
                <div className="flex flex-col gap-2" aria-label="Loading tasks">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-9 w-full"/>
                    ))}
                </div>
            )}

            {/* load error */}
            {loadError && (
                <div
                    className="flex items-center justify-between gap-2 rounded-md border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    <span className="min-w-0 flex-1 break-words">{loadError}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-xs underline"
                        onClick={() => void load()}
                    >
                        Retry
                    </Button>
                </div>
            )}

            {/* task list */}
            {visible !== null && visible.length > 0 && (
                <ul
                    className="max-h-96 divide-y divide-border/60 overflow-y-auto rounded-md border [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
                    aria-label="Task list"
                >
                    {visible.map((task) => {
                        const meta = SOURCE_META[task.source] ?? FALLBACK_META;
                        const status = statuses[task.id] ?? {phase: "idle"};
                        const isPinned = pinned.has(task.id);
                        return (
                            <li
                                key={task.id}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                            >
                <span
                    className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground"
                    title={meta.title}
                >
                  <span className={cn("size-1.5 rounded-full", meta.dot)}/>
                    {meta.label}
                </span>
                                <span
                                    className="shrink-0 max-w-40 truncate font-mono text-xs"
                                    title={task.name}
                                >
                  {task.name}
                </span>
                                <span
                                    className="hidden min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground sm:inline"
                                    title={`${task.command}${task.cwd ? ` (in ${task.cwd})` : ""}`}
                                >
                  {task.command}
                </span>
                                <StatusBadge status={status}/>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 shrink-0 text-muted-foreground hover:text-amber-500"
                                    onClick={() => togglePin(task)}
                                    aria-label={`${isPinned ? "Unpin" : "Pin"} ${task.name}`}
                                    title={isPinned ? "Unpin this task" : "Pin this task to the top"}
                                >
                                    <Star
                                        className={cn(
                                            "size-3.5",
                                            isPinned && "fill-amber-400 text-amber-500"
                                        )}
                                    />
                                </Button>
                                {status.phase === "running" ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 shrink-0 gap-1 text-xs text-red-600 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
                                        onClick={() => stopTask(task)}
                                        aria-label={`Stop ${task.name}`}
                                        title="Stop the running task"
                                    >
                                        <Square className="size-3.5"/>
                                        Stop
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 shrink-0 gap-1 text-xs"
                                        onClick={() => void runTask(task)}
                                        aria-label={`Run ${task.name}`}
                                        title={`Run: ${task.command}`}
                                    >
                                        <Play className="size-3.5"/>
                                        Run
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* empty states */}
            {visible !== null && visible.length === 0 && (
                <div className="flex items-center justify-center p-4">
                    <div className="max-w-md rounded-lg border bg-card p-6 text-center text-xs text-muted-foreground">
                        <ListTodo className="mx-auto size-5 opacity-40"/>
                        {pinnedOnly ? (
                            <>
                                <p className="pt-2 font-medium text-foreground">
                                    No pinned tasks
                                </p>
                                <p className="pt-1">
                                    Click the star next to a task to keep it at the top of this list.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="pt-2 font-medium text-foreground">
                                    No tasks detected in {folderName}
                                </p>
                                <p className="pt-1">Praxis looks for:</p>
                                <ul className="list-inside list-disc space-y-0.5 pt-1 text-left">
                                    <li>package.json — the scripts table (npm run …)</li>
                                    <li>Makefile — targets (make …)</li>
                                    <li>justfile — recipes (just …)</li>
                                    <li>pyproject.toml — [project.scripts] and [tool.praxis.tasks]</li>
                                </ul>
                                <p className="pt-2">
                                    Create a package.json with a scripts block, or a Makefile, in
                                    this folder — then hit Refresh.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* output channels */}
            {channels.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <div
                        className="flex flex-wrap items-center gap-1"
                        role="tablist"
                        aria-label="Task output channels"
                    >
                        {channels.map((c) => {
                            const isActive = c.key === activeChannel;
                            return (
                                <div
                                    key={c.key}
                                    role="tab"
                                    aria-selected={isActive}
                                    title={channelTitle(c)}
                                    className={cn(
                                        "flex items-center rounded-md border",
                                        isActive
                                            ? "border-border bg-accent"
                                            : "border-transparent hover:bg-accent/50"
                                    )}
                                >
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
                                        onClick={() => setActiveChannel(c.key)}
                                        aria-label={`Show output of ${c.name}`}
                                    >
                                        <span className={channelDot(c.status)} aria-hidden="true"/>
                                        <span className="max-w-32 truncate font-mono">{c.name}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="px-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
                                        onClick={() => closeChannel(c.key)}
                                        aria-label={`Close output of ${c.name}`}
                                        title="Close this output channel"
                                    >
                                        <X className="size-3"/>
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {active && (
                        <div className="relative">
                            <div
                                ref={scrollRef}
                                onScroll={onPaneScroll}
                                className="max-h-64 min-h-24 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
                                aria-live="polite"
                                aria-label={`Output of ${active.name}`}
                            >
                                {active.lines.map((line, i) => (
                                    <div key={i} className="whitespace-pre-wrap break-all">
                                        {line.length ? line : "\u00A0"}
                                    </div>
                                ))}
                            </div>
                            {follow[active.key] === false && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFollowFor(active.key, true);
                                        // Scroll on the next frame so the state lands first.
                                        window.requestAnimationFrame(() => {
                                            const el = scrollRef.current;
                                            if (el) el.scrollTop = el.scrollHeight;
                                        });
                                    }}
                                    className={cn(
                                        "absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-[10px] font-medium shadow-sm transition-colors hover:bg-accent",
                                        active.hasNew && "border-amber-500/50 text-amber-600 dark:text-amber-400"
                                    )}
                                    aria-label="Jump back to the newest output"
                                    title="Scroll back to the newest output"
                                >
                                    <ChevronDown className="size-3"/>
                                    follow{active.hasNew ? " (new)" : ""}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
