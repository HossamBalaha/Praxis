"use client";

import * as React from "react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
// one-click "pip install <module>" next to ModuleNotFoundError entries.
import {missingModuleFrom, PipInstallButton} from "@/components/pip-install-button";
// console-table — the conservative pandas-DataFrame detector + parsers
// (text grids / pandas HTML) behind the styled table rendering (3d).
import {type ConsoleTable, detectDataFrameOutput, parseDataFrameHtml, parseDataFrameText,} from "@/lib/console-table";
// console-magics — the client-side magic parsing / unknown-magic hint
// (3+4), the persisted-history array ops (2) and the plain pandas text
// repr parser wired as the THIRD table detector (3).
import {
    appendConsoleHistory,
    CONSOLE_HISTORY_CAP,
    CONSOLE_MAGIC_HELP,
    parseConsoleMagic,
    parseDataFrameRepr,
    unknownMagicHint,
} from "@/lib/console-magics";
import {STORAGE_PREFIX} from "@/lib/config";
// perf HUD (G23) — report SSE throughput so the HUD's stream row has
// real numbers instead of a permanent zero, and count every render of
// the console panel into the per-panel registry.
import {noteSseBytes, reportPanelRender} from "@/lib/perf-metrics";
import {loadWorkspaceSession, saveWorkspaceSession} from "@/lib/workspace-session";
import {acknowledgePendingConsoleRun, takePendingConsoleRun,} from "@/lib/pending-console-run";
// "open in grid" — fetches a namespace object's data from the live
// kernel through /api/console/variable (console-variable-grid) and the
// read-only grid viewer dialog it feeds (variable-grid-dialog).
import {
    fetchVariableGrid,
    simplePathExpr,
    tableLikeReprHint,
    type VariableGridPayload,
} from "@/lib/console-variable-grid";
import {VariableGridDialog} from "@/components/variable-grid-dialog";
import {
    ChevronDown,
    ChevronRight,
    Circle,
    Download,
    FileSpreadsheet,
    Loader2,
    Play,
    RotateCw,
    Square,
    SquareTerminal,
    Trash2,
    X,
} from "lucide-react";

interface ConsoleEntry {
    id: number;
    kind: "in" | "out" | "err" | "sys" | "figure";
    text?: string;
    /** submission counter for the In [N] prompt (3b) — set on "in"
     *  entries by the kernel-counter mirror in submit(). */
    exec?: number;
    /** figure entries */
    url?: string;
    name?: string;
}

interface ConsoleVariable {
    name: string;
    type: string;
    value: string;
}

interface ConsolePanelProps {
    /** Only the ACTIVE tab should focus/scroll — but the panel stays
     *  mounted (forceMount) so the session + scrollback survive. */
    active: boolean;
    /** The live source of the current file (edit buffer when editing,
     *  the on-disk content otherwise) — "Run file" sends THIS. */
    getActiveSource?: () => string | null;
    fileName?: string;
    /** Manual interpreter override from Settings → Python. */
    interpreter?: string;
    /** Per-submission timeout (Settings → Python). */
    timeoutSeconds?: number;
    /** "Open in grid" router: when provided, grid payloads are handed to
     *  the host INSTEAD of the panel's built-in dialog (the host can open
     * them in a tab surface of its own). The PRAXIS_OPEN_VARIABLE_GRID
     * CustomEvent fires either way — see openVariableGrid. */
    onOpenVariableGrid?: (payload: VariableGridPayload) => void;
}

let entrySeq = 0;

function nextEntryId(): number {
    entrySeq += 1;
    return entrySeq;
}

/* ------------------------------------------------------------------ */
/*  Persisted input history (2) + the pending queue (1)                */
/* ------------------------------------------------------------------ */

/** localStorage key for the console's up-arrow recall list — same
 * STORAGE_PREFIX convention as the terminal panel's history. */
const CONSOLE_HISTORY_KEY = `${STORAGE_PREFIX}-console-history`;

function loadConsoleHistory(): string[] {
    try {
        const raw = window.localStorage.getItem(CONSOLE_HISTORY_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            return parsed.slice(-CONSOLE_HISTORY_CAP);
        }
    } catch {
        /* corrupt / unavailable — start fresh */
    }
    return [];
}

function saveConsoleHistory(h: string[]): void {
    try {
        window.localStorage.setItem(
            CONSOLE_HISTORY_KEY,
            JSON.stringify(h.slice(-CONSOLE_HISTORY_CAP))
        );
    } catch {
        /* quota exceeded — history stays session-only */
    }
}

/** (1) how many lines may wait in the pending queue — beyond this the
 *  OLDEST is dropped (with a toast) so a stuck submission can't pile
 *  up unbounded work. */
const QUEUE_CAP = 8;

/** Chip label for one queued line — its first line (files/`Run file`
 *  submissions can be long), with an ellipsis marker when there is
 *  more below. */
function queueChipLabel(line: string): string {
    const first = line.split("\n")[0].trim();
    return (first === "" ? "(empty)" : first.slice(0, 48)) + (line.includes("\n") ? " …" : "");
}

/**
 * the persistent Python console ("Console mode").
 *
 * A Jupyter-style REPL in the bottom panel: submissions execute in a
 * long-lived server-side kernel, so variables, imports and figures
 * persist across submissions (`data = pd.read_csv(...)` once, then
 * keep working with `data`). Enter submits (⇧Enter for a newline), ↑/↓
 * walk the input history — PERSISTED to localStorage, so the recall
 * list survives reloads — "Run file" pipes the whole current file
 * through the same session, and matplotlib figures render inline.
 *
 * While the kernel is BUSY the input stays usable: typed lines QUEUE
 * (cap 8, chips above the input, each cancellable) and auto-run when
 * the kernel goes idle; the In[N] counter is assigned at ACTUAL
 * submission time, so numbering stays sequential. The session
 * auto-restarts (with a notice) after it dies — timeout, crash, or
 * server restart. A Vars section lists the namespace after every
 * submission.
 *
 * Submissions are numbered Jupyter-style — In [N] on the echoed input,
 * Out [N] on the kernel's result lines — with the counter mirroring
 * the kernel's per-session seq (reset on restart, re-synced from the
 * stream's start event). DataFrame-shaped outputs (conservative
 * detection, see console-table + console-magics) render as compact
 * styled tables (3d) instead of raw preformatted text — and every
 * table-like result that maps back to a resolvable namespace object
 * grows an "open in grid" affordance that fetches the LIVE data from
 * the kernel (/api/console/variable) and shows it in the app's grid
 * viewer (the .csv/.xlsx one) — or hands it to the host through
 * onOpenVariableGrid / the PRAXIS_OPEN_VARIABLE_GRID event.
 */
export function ConsolePanel({
                                 active,
                                 getActiveSource,
                                 fileName,
                                 interpreter,
                                 timeoutSeconds,
                                 onOpenVariableGrid,
                             }: ConsolePanelProps) {
    // Count THIS render into the Perf HUD's per-panel registry.
    reportPanelRender("Console");
    const {toast} = useToast();
    const [sessionId, setSessionId] = React.useState<string | null>(null);
    // ── SESSION RESTORE: the server's console kernel SURVIVES a page
    //    reload (module-level sessions); the client used to forget the
    //    id and start a fresh kernel on every F5. Validate the stored
    //    id with a "status" ping and adopt it when still alive.
    //    The in-flight ping is ALSO stashed in sessionCheckRef — the
    //    first submission awaits it (bounded) before deciding to spawn
    //    a NEW kernel, so a restored session is adopted instead of
    //    raced (the "first run starts a second kernel, then the ping
    //    overwrites the session id mid-run" hole).
    const sessionCheckRef = React.useRef<Promise<void> | null>(null);
    React.useEffect(() => {
        const stored = loadWorkspaceSession()?.consoleSessionId;
        if (!stored) return;
        let cancelled = false;
        const check = (async () => {
            try {
                const res = await fetch("/api/console", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "status", id: stored}),
                });
                const data = (await res.json()) as { ok?: boolean; alive?: boolean };
                // Adopt only when nothing else owns a session by now — a
                // submission that already started (or restarted) a kernel
                // must not be overwritten by the stale stored id.
                if (!cancelled && data.ok && data.alive && !sessionIdRef.current) {
                    setSessionId(stored);
                    sessionIdRef.current = stored;
                }
            } catch {
                /* server down — a fresh session starts on first use */
            }
        })();
        sessionCheckRef.current = check;
        return () => {
            cancelled = true;
        };
    }, []);
    const [busy, setBusy] = React.useState(false);
    const [dead, setDead] = React.useState(false);
    const [entries, setEntries] = React.useState<ConsoleEntry[]>([]);
    const [variables, setVariables] = React.useState<ConsoleVariable[] | null>(null);
    const [showVars, setShowVars] = React.useState(true);
    const [input, setInput] = React.useState("");
    const [history, setHistory] = React.useState<string[]>([]);
    const [historyIdx, setHistoryIdx] = React.useState<number | null>(null);
    const [draft, setDraft] = React.useState("");
    // (1) lines submitted while the kernel was busy — they run when the
    // kernel goes idle (see submit's finally block). Mirrored in a ref
    // so the drain + the cap logic never read a stale closure.
    const [queue, setQueue] = React.useState<string[]>([]);

    // ── "Open in grid" state: the payload currently shown in the
    //    built-in grid dialog (the fallback viewer — the host may take
    //    over via onOpenVariableGrid or the PRAXIS_OPEN_VARIABLE_GRID
    //    event, in which case this stays null), plus the expression
    //    whose data is being fetched right now (drives the affordance's
    //    spinner so a slow frame can't be double-clicked into two
    //    fetches).
    const [gridDialog, setGridDialog] = React.useState<VariableGridPayload | null>(null);
    const [gridFetching, setGridFetching] = React.useState<string | null>(null);

    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
    const sessionIdRef = React.useRef<string | null>(null);
    // (1) the busy MIRROR — submit gates on this REF, not the state, so
    // rapid Enter presses can't race past a not-yet-committed setBusy
    // (two submissions would 409 or leak a second session).
    const busyRef = React.useRef(false);
    const queueRef = React.useRef<string[]>([]);
    // (2) history mirror — append/persist reads this, never a stale
    // closure (the same pattern the terminal panel uses).
    const historyRef = React.useRef<string[]>([]);
    // ── "Open in grid" bookkeeping: In[N] text by submission number, so
    //    an Out[N] table can resolve back to the expression that printed
    //    it (the same N the kernel stamps). MEMOIZED on `entries` — the
    //    map is only rebuilt when the scrollback actually changes, never
    //    per keystroke (the input's state changes re-render this component
    //    on every key).
    const inByExec = React.useMemo(() => {
        const m = new Map<number, string>();
        for (const e of entries) {
            if (e.kind === "in" && typeof e.exec === "number") m.set(e.exec, e.text ?? "");
        }
        return m;
    }, [entries]);
    // ── Execution counter (3b): mirrors the kernel's per-session
    // submission counter (route: session.seq → kernel _rid → the Out[N]
    // its result print stamps). Incremented per submission, RESET on
    // every session (re)start (a fresh kernel restarts at 1, exactly
    // like Jupyter after a kernel restart), and re-synced from the
    // stream's "start" event — the route stamps it with `submission` —
    // when a failed submission counted locally but never reached the
    // kernel.
    const execCountRef = React.useRef(0);
    React.useEffect(() => {
        sessionIdRef.current = sessionId;
        if (!sessionId) return;
        const snap = loadWorkspaceSession();
        saveWorkspaceSession({
            ...(snap ?? {
                version: 1, openTabs: [], activeTab: null, splitPane: null,
                dirtyBuffers: {}, terminalSessions: [], consoleSessionId: null, savedAt: 0,
            }),
            consoleSessionId: sessionId,
        });
    }, [sessionId]);

    // (2) hydrate the up-arrow recall list from localStorage on mount —
    // persisted older entries + this session's entries, merged (the
    // consecutive-duplicate collapse + cap live in appendConsoleHistory,
    // which every submission funnels through).
    React.useEffect(() => {
        const stored = loadConsoleHistory();
        historyRef.current = stored;
        setHistory(stored);
    }, []);

    // Auto-scroll to the latest entry while pinned to the bottom.
    const pinnedRef = React.useRef(true);
    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    React.useEffect(() => {
        if (pinnedRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries]);

    // Focus the input when the tab becomes active.
    React.useEffect(() => {
        if (active) inputRef.current?.focus();
    }, [active]);

    /* PERF: COALESCED streaming flush — the SSE loop used to call this
     * for EVERY stdout/stderr chunk (one setState + O(n) array copy per
     * chunk, easily dozens per second). Chunks now land in a buffer and
     * ONE timer (60 ms, the terminal's cadence) applies them in a
     * single setState; consecutive out/err runs even MERGE into one
     * entry per kind so long prints render as one block. "end" /
     * "figure" / error entries flush immediately (order preserved —
     * the buffer always drains before an immediate entry is applied). */
    const entryBufRef = React.useRef<Omit<ConsoleEntry, "id">[]>([]);
    const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const drainBuf = React.useCallback(() => {
        flushTimerRef.current = null;
        const buffered = entryBufRef.current;
        if (buffered.length === 0) return;
        entryBufRef.current = [];
        // Merge consecutive same-kind TEXT runs into single entries —
        // fewer DOM rows for the same output.
        const merged: Omit<ConsoleEntry, "id">[] = [];
        for (const e of buffered) {
            const last = merged[merged.length - 1];
            if (
                last &&
                (e.kind === "out" || e.kind === "err") &&
                last.kind === e.kind &&
                typeof last.text === "string" &&
                typeof e.text === "string"
            ) {
                last.text += e.text;
            } else {
                merged.push({...e});
            }
        }
        setEntries((prev) => {
            const next = [...prev, ...merged.map((e) => ({...e, id: nextEntryId()}))];
            return next.length > 800 ? next.slice(next.length - 800) : next;
        });
    }, []);
    const pushEntries = React.useCallback(
        (es: Omit<ConsoleEntry, "id">[]) => {
            if (es.length === 0) return;
            // Streamed text buffers; structural entries (figures, errors,
            // session markers) must NOT wait — drain the buffer first so
            // ordering is exact.
            const isText = es.every((e) => e.kind === "out" || e.kind === "err");
            if (isText) {
                entryBufRef.current.push(...es);
                if (flushTimerRef.current) return;
                flushTimerRef.current = setTimeout(drainBuf, 60);
                return;
            }
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current);
                drainBuf();
            }
            setEntries((prev) => {
                const next = [...prev, ...es.map((e) => ({...e, id: nextEntryId()}))];
                return next.length > 800 ? next.slice(next.length - 800) : next;
            });
        },
        [drainBuf]
    );
    // Never leave a pending flush behind on unmount.
    React.useEffect(() => {
        return () => {
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        };
    }, []);

    /** Start (or restart) the kernel session. */
    const ensureSession = React.useCallback(
        async (restart: boolean): Promise<string | null> => {
            try {
                const res = await fetch("/api/console", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        action: restart ? "restart" : "start",
                        id: sessionIdRef.current ?? undefined,
                        interpreter: interpreter || undefined,
                    }),
                });
                const data = (await res.json()) as
                    | { ok: true; id: string; interpreter?: string }
                    | { ok: false; error: string };
                if (!data.ok) {
                    toast({title: "Console", description: data.error, variant: "destructive"});
                    return null;
                }
                setSessionId(data.id);
                sessionIdRef.current = data.id;
                setDead(false);
                // Fresh kernel session: its submission counter (and the Out[N]
                // stamps it prints) restarts at 1 — mirror that client-side.
                execCountRef.current = 0;
                return data.id;
            } catch {
                toast({title: "Console", description: "Network error.", variant: "destructive"});
                return null;
            }
        },
        [interpreter, toast]
    );

    /** (1) drop every pending queued line (optionally with a sys note) —
     *  used when the session dies or restarts: queued lines were meant
     *  for the namespace that just vanished. */
    const clearQueue = React.useCallback((note?: string) => {
        if (queueRef.current.length > 0 || note) {
            queueRef.current = [];
            setQueue([]);
        }
        if (note) pushEntries([{kind: "sys", text: note}]);
    }, [pushEntries]);

    /** (1) append one line to the pending queue — the OLDEST is dropped
     *  (with a toast) beyond QUEUE_CAP. */
    const enqueue = React.useCallback((code: string) => {
        let next = [...queueRef.current, code];
        if (next.length > QUEUE_CAP) {
            const dropped = next[0];
            next = next.slice(next.length - QUEUE_CAP);
            toast({
                title: "Console queue is full",
                description: `Oldest queued line dropped: ${queueChipLabel(dropped)}`,
                variant: "destructive",
            });
        }
        queueRef.current = next;
        setQueue(next);
    }, [toast]);

    /** Execute one submission in the session, streaming its events. If
     *  the kernel is already busy the line is QUEUED (1) — it runs
     *  automatically as soon as the kernel goes idle — instead of being
     *  silently dropped. Unknown magics never reach the kernel: they get
     *  the client-side hint (3). */
    const submit = React.useCallback(
        async (code: string) => {
            if (!code.trim()) return;
            // (3) friendly hint for unknown % / %% commands — cheaper and
            // kinder than shipping them to Python for a SyntaxError, and it
            // doesn't burn an In[N] slot. (Known magics pass through to the
            // kernel, which executes them — see console-kernel.)
            const parsed = parseConsoleMagic(code);
            if (parsed.unknown) {
                pushEntries([{kind: "sys", text: unknownMagicHint(parsed.token)}]);
                return;
            }
            if (busyRef.current) {
                enqueue(code);
                return;
            }
            // busyRef goes up SYNCHRONOUSLY — before any await — so a second
            // Enter during e.g. the session-start fetch queues instead of
            // racing a second concurrent submission.
            busyRef.current = true;
            setBusy(true);
            try {
                let sid = sessionIdRef.current;
                if (!sid) {
                    // ── SESSION-READY HANDSHAKE ──
                    // If the mount-time stored-session ping is (or was) in
                    // flight, let it settle FIRST (bounded — a slow server must
                    // not stall the first run forever): a still-alive restored
                    // kernel is adopted instead of spawning a duplicate, and
                    // the ping can never overwrite the session mid-run.
                    const check = sessionCheckRef.current;
                    if (check) {
                        try {
                            await Promise.race([
                                check,
                                new Promise<void>((resolve) => setTimeout(resolve, 1500)),
                            ]);
                        } catch {
                            /* adoption is best-effort — fall through to restart */
                        }
                        sid = sessionIdRef.current;
                    }
                }
                if (!sid || dead) {
                    sid = await ensureSession(true);
                    if (!sid) return;
                    pushEntries([
                        {
                            kind: "sys",
                            text: dead
                                ? "— session restarted (previous state was lost) —"
                                : "— new console session started —",
                        },
                    ]);
                    setVariables(null);
                }
                // (3b) label the submission with the mirrored kernel counter —
                // assigned HERE, at ACTUAL submission time, so queued lines
                // number sequentially (1).
                const n = execCountRef.current + 1;
                execCountRef.current = n;
                pushEntries([{kind: "in", text: code, exec: n}]);
                try {
                    const res = await fetch("/api/console", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            action: "exec",
                            id: sid,
                            code,
                            mode: "eval",
                            timeoutSeconds,
                        }),
                    });
                    if (!res.ok || !res.body) {
                        const data = (await res.json().catch(() => null)) as
                            | { error?: string; dead?: boolean }
                            | null;
                        if (data?.dead) {
                            setSessionId(null);
                            sessionIdRef.current = null;
                            setDead(true);
                            clearQueue(
                                queueRef.current.length > 0
                                    ? `— ${queueRef.current.length} queued line(s) dropped (the session died) —`
                                    : undefined
                            );
                        }
                        pushEntries([{kind: "err", text: data?.error ?? `HTTP ${res.status}.`}]);
                        return;
                    }
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        noteSseBytes(value?.byteLength ?? 0);
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
                                if (evt.type === "start") {
                                    // Re-sync the mirrored counter with the route's authoritative
                                    // `submission` stamp (the kernel's own seq — the same N
                                    // its Out[N] print uses) and re-label the In row when
                                    // they drifted: a submission that failed before
                                    // reaching the kernel (network error / 409 / 410)
                                    // counted locally anyway. Serialized submissions (the
                                    // queue waits its turn) guarantee the last In row is
                                    // THIS submission's echo — patch it in place.
                                    const n = evt.submission;
                                    if (typeof n === "number" && n > 0 && n !== execCountRef.current) {
                                        execCountRef.current = n;
                                        setEntries((prev) => {
                                            for (let i = prev.length - 1; i >= 0; i--) {
                                                if (prev[i].kind === "in") {
                                                    if (prev[i].exec === n) return prev;
                                                    const next = prev.slice();
                                                    next[i] = {...prev[i], exec: n};
                                                    return next;
                                                }
                                            }
                                            return prev;
                                        });
                                    }
                                } else if (evt.type === "stdout") {
                                    const text = evt.text as string;
                                    if (text) pushEntries([{kind: "out", text}]);
                                } else if (evt.type === "stderr") {
                                    const text = evt.text as string;
                                    if (text) pushEntries([{kind: "err", text}]);
                                } else if (evt.type === "figure") {
                                    pushEntries([
                                        {kind: "figure", url: evt.url as string, name: evt.name as string},
                                    ]);
                                } else if (evt.type === "end") {
                                    if (evt.error) {
                                        pushEntries([{kind: "err", text: evt.error as string}]);
                                    }
                                    setVariables((evt.variables as ConsoleVariable[]) ?? null);
                                    if (evt.died) {
                                        const dropped = queueRef.current.length;
                                        setSessionId(null);
                                        sessionIdRef.current = null;
                                        setDead(true);
                                        if (dropped > 0) {
                                            clearQueue(`— ${dropped} queued line(s) dropped (the session died) —`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    pushEntries([{kind: "err", text: "Network error during the submission."}]);
                }
            } finally {
                busyRef.current = false;
                setBusy(false);
                // (1) busy→idle: auto-submit the head of the pending queue. The
                // In[N] counter is assigned inside submit at ACTUAL submission
                // time, so numbering stays sequential for queued lines.
                const q = queueRef.current;
                if (q.length > 0) {
                    const head = q[0];
                    queueRef.current = q.slice(1);
                    setQueue(queueRef.current);
                    void submitRef.current(head);
                }
            }
        },
        [dead, ensureSession, pushEntries, timeoutSeconds, enqueue, clearQueue]
    );

    // Self-reference for the queue drain: the finally block must call
    // the CURRENT submit (fresh dead/timeout closures), not the stale
    // one this render's function object captured.
    const submitRef = React.useRef(submit);
    submitRef.current = submit;

    const submitInput = React.useCallback(() => {
        const code = input;
        if (!code.trim()) return;
        // (3) immediate friendly hint for unknown magics — they neither
        // run nor queue.
        const parsed = parseConsoleMagic(code);
        if (parsed.unknown) {
            pushEntries([{kind: "sys", text: unknownMagicHint(parsed.token)}]);
            setInput("");
            return;
        }
        setInput("");
        // (2) every submitted user line lands in the PERSISTED history
        // (consecutive repeats collapse, capped to CONSOLE_HISTORY_CAP) —
        // including lines that queue while the kernel is busy.
        const nextHistory = appendConsoleHistory(historyRef.current, code);
        if (nextHistory !== historyRef.current) {
            historyRef.current = nextHistory;
            setHistory(nextHistory);
            saveConsoleHistory(nextHistory);
        }
        setHistoryIdx(null);
        setDraft("");
        // While busy this QUEUES (submit routes into enqueue); the draft
        // clears either way — the line is visible as a cancellable chip.
        void submit(code);
    }, [input, pushEntries, submit]);

    // "Run in console" from the Run menu / the Run options
    // dropdown — the page switches to this tab and queues the code
    // (the LIVE edit buffer) for this panel to execute. Lives AFTER the
    // submit/pushEntries definitions (its dep array reads them directly).
    React.useEffect(() => {
        const onConsoleRun = (e: Event) => {
            const d = (e as CustomEvent).detail as { code?: string; fileName?: string } | undefined;
            const code = typeof d?.code === "string" ? d.code : "";
            if (!code.trim()) return;
            // Claim (peek) the durable payload; the ACK below retires it
            // once THIS panel owns the run, so a later remount (python ↔
            // non-python file switch) can't re-run the same payload.
            void takePendingConsoleRun();
            pushEntries([
                {
                    kind: "sys",
                    text: `— running ${d?.fileName ?? "the current file"} in the console${busyRef.current ? " (queued)" : ""} —`
                },
            ]);
            void submit(code);
            acknowledgePendingConsoleRun();
        };
        window.addEventListener("praxis:console-run", onConsoleRun);
        return () => window.removeEventListener("praxis:console-run", onConsoleRun);
    }, [submit, pushEntries]);

    // FIRST-RUN FIX: the event above is one-shot — a click that OPENED
    // this panel dispatched it before the listener existed, so the
    // first "Run in console" showed an empty panel. The page now ALSO
    // writes the payload to the durable store; drain it on mount so
    // the first invocation runs the moment the panel appears. The
    // payload is CLAIMED (not consumed) and ACKed right after submit
    // takes ownership — submit's synchronous prefix raises the busy
    // flag (or enqueues the line while a submission streams), so a
    // StrictMode remount can neither lose nor double-run the payload.
    React.useEffect(() => {
        const pending = takePendingConsoleRun();
        if (!pending || !pending.code.trim()) return;
        pushEntries([
            {
                kind: "sys",
                text: `— running ${pending.fileName ?? "the current file"} in the console${busyRef.current ? " (queued)" : ""} —`
            },
        ]);
        void submit(pending.code);
        acknowledgePendingConsoleRun();
        // Drain once on mount — the event listener above covers
        // everything that happens while mounted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runFile = React.useCallback(() => {
        const src = getActiveSource?.();
        if (!src || !src.trim()) return;
        pushEntries([
            {
                kind: "sys",
                text: `— running ${fileName ?? "the current file"} in the console${busyRef.current ? " (queued)" : ""} —`
            },
        ]);
        void submit(src);
    }, [getActiveSource, fileName, pushEntries, submit]);

    const restart = React.useCallback(async () => {
        if (busy) return;
        // Queued lines were meant for the namespace being wiped — drop
        // them (a fresh kernel restarts at In[1]).
        clearQueue();
        await ensureSession(true);
        setVariables(null);
        pushEntries([{kind: "sys", text: "— session restarted (namespace cleared) —"}]);
    }, [busy, ensureSession, pushEntries, clearQueue]);

    /* ── "Open in grid" (the console → grid viewer bridge). Fetches the
     *  LIVE object behind a guarded namespace expression through
     *  /api/console/variable, then routes the payload THREE ways, in
     *  order: (1) the onOpenVariableGrid prop when the host provided one
     *  (its viewer wins — the panel never opens its own), (2) the
     *  PRAXIS_OPEN_VARIABLE_GRID CustomEvent ({columns, rows, title, ...}
     *  detail — a page-level listener that calls preventDefault() claims
     *  the payload, e.g. <VariableGridDialogHost />), (3) the panel's own
     *  VariableGridDialog as the zero-wiring fallback. Every failure
     *  (kernel dead, object not serializable, payload too large, kernel
     *  busy, network) degrades to a toast — the panel itself never
     *  breaks. */
    const openVariableGrid = React.useCallback(
        async (expr: string) => {
            if (!expr.trim()) return;
            if (gridFetching) return; // one fetch at a time (spinner is busy)
            const sid = sessionIdRef.current;
            if (!sid || dead) {
                toast({
                    title: "Console",
                    description:
                        "No live console session — run a submission first, then open the grid.",
                    variant: "destructive",
                });
                return;
            }
            setGridFetching(expr);
            try {
                const data = await fetchVariableGrid(sid, expr);
                const payload: VariableGridPayload = {...data, title: expr, expr};
                let handled = false;
                if (onOpenVariableGrid) {
                    onOpenVariableGrid(payload);
                    handled = true;
                }
                const evt = new CustomEvent("PRAXIS_OPEN_VARIABLE_GRID", {
                    detail: payload,
                    cancelable: true,
                });
                window.dispatchEvent(evt);
                if (!handled && !evt.defaultPrevented) setGridDialog(payload);
            } catch (err) {
                toast({
                    title: "Could not open the grid",
                    description: err instanceof Error ? err.message : "Network error.",
                    variant: "destructive",
                });
            } finally {
                setGridFetching(null);
            }
        },
        [dead, gridFetching, onOpenVariableGrid, toast]
    );

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            submitInput();
            return;
        }
        if (e.key === "ArrowUp" && !e.shiftKey) {
            // History walk — only when the caret is on the FIRST line and no
            // selection, so multi-line editing stays usable.
            const ta = e.currentTarget;
            const atFirstLine = ta.selectionStart === ta.selectionEnd &&
                (ta.selectionStart === 0 || input[ta.selectionStart - 1] === "\n");
            if (atFirstLine && history.length > 0) {
                e.preventDefault();
                if (historyIdx == null) {
                    setDraft(input);
                    setHistoryIdx(history.length - 1);
                    setInput(history[history.length - 1]);
                } else if (historyIdx > 0) {
                    setHistoryIdx(historyIdx - 1);
                    setInput(history[historyIdx - 1]);
                }
            }
            return;
        }
        if (e.key === "ArrowDown" && !e.shiftKey) {
            const ta = e.currentTarget;
            const atLastLine =
                ta.selectionStart === ta.selectionEnd &&
                (ta.selectionEnd === input.length || input[ta.selectionEnd] === "\n");
            if (atLastLine && historyIdx != null) {
                e.preventDefault();
                if (historyIdx < history.length - 1) {
                    setHistoryIdx(historyIdx + 1);
                    setInput(history[historyIdx + 1]);
                } else {
                    setHistoryIdx(null);
                    setInput(draft);
                }
            }
        }
    };

    const statusColor = busy
        ? "text-amber-500"
        : sessionId && !dead
            ? "text-emerald-500"
            : "text-muted-foreground/50";
    const statusTitle = busy
        ? "A submission is running — typed lines queue and run when it finishes"
        : sessionId && !dead
            ? "Session alive — state persists across submissions"
            : "No session yet — it starts with your first submission";

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* ── Session bar ─────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b text-[10px] text-muted-foreground">
                <Circle className={"size-2 fill-current " + statusColor} aria-hidden/>
                <span className="font-mono" title={statusTitle}>
          {sessionId && !dead
              ? `console · ${sessionId.slice(0, 8)}`
              : "console · no session"}
        </span>
                <span className="text-muted-foreground/60 truncate hidden sm:inline">
          persistent namespace — state survives every submission
        </span>
                <span className="flex-1"/>
                {fileName && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 gap-1 text-[10px]"
                        onClick={runFile}
                        disabled={busy}
                        title={`Run ${fileName} in this console (same namespace — imports and variables persist)`}
                    >
                        <Play className="size-3"/>
                        Run file
                    </Button>
                )}
                {/* Ctrl+C for the console — SIGINT the kernel.
            A running submission gets a KeyboardInterrupt (reported as a
            normal error result) and the SESSION SURVIVES; the old way
            out of a stuck submission was the watchdog killing it. */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px]"
                    onClick={() =>
                        void (async () => {
                            if (!sessionId) return;
                            try {
                                const res = await fetch("/api/console", {
                                    method: "POST",
                                    headers: {"Content-Type": "application/json"},
                                    body: JSON.stringify({action: "interrupt", id: sessionId}),
                                });
                                const data = await res.json();
                                if (data?.ok) {
                                    setEntries((prev) => [
                                        ...prev,
                                        {id: nextEntryId(), kind: "sys", text: "[console] interrupt sent (SIGINT)\n"},
                                    ]);
                                }
                            } catch {
                                /* the submission's stream reports the outcome */
                            }
                        })()
                    }
                    disabled={!sessionId || dead}
                    title="Interrupt (Ctrl+C) — cancel the running submission; the session survives"
                >
                    <Square className="size-3"/>
                    Interrupt
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px]"
                    onClick={() => void restart()}
                    disabled={busy}
                    title="Restart the kernel — clears the namespace and figure history"
                >
                    <RotateCw className="size-3"/>
                    Restart
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px]"
                    onClick={() => setEntries([])}
                    title="Clear the console scrollback (the session state is kept)"
                >
                    <Trash2 className="size-3"/>
                    Clear
                </Button>
            </div>

            {/* ── Scrollback ──────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5 font-mono text-[11px] leading-relaxed"
                 ref={scrollRef} onScroll={onScroll}>
                {entries.length === 0 ? (
                    // left-aligned like the Output panel's empty
                    // state — bottom-panel content sits
                    // "to the left, not in the center".
                    <p className="text-muted-foreground/70 text-[10px] font-sans py-3 text-left">
                        <SquareTerminal className="size-3.5 inline-block mr-1 -mt-0.5"/>
                        Console mode — a persistent Python session. Type code below (Enter to run,
                        ⇧Enter for a newline); variables, imports and figures survive every
                        submission. <code className="font-mono">input()</code> is unavailable, and a
                        submission that exceeds the run timeout kills the session.{" "}
                        {/* the client-side %help copy (console-magics) rides along as
                the hover tooltip — the kernel prints the same list for
                %help submissions. */}
                        <span title={CONSOLE_MAGIC_HELP}
                              className="cursor-help underline decoration-dotted underline-offset-2">
              Magics: %time, %who, %%timeit, %%capture…
            </span>{" "}
                        — hover for the list, or run <code className="font-mono">%help</code>.
                    </p>
                ) : (
                    entries.map((e) => {
                        if (e.kind === "figure") {
                            return (
                                <div key={e.id} className="my-1.5 flex items-start gap-2">
                                    <img
                                        src={e.url}
                                        alt={e.name}
                                        className="max-w-full max-h-56 rounded border bg-background"
                                    />
                                    <a
                                        href={e.url}
                                        download={e.name}
                                        className="text-[9px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 shrink-0"
                                        title={`Download ${e.name}`}
                                    >
                                        <Download className="size-3"/>
                                    </a>
                                </div>
                            );
                        }
                        if (e.kind === "in") {
                            return (
                                <div key={e.id}
                                     className="whitespace-pre-wrap break-words text-sky-600 dark:text-sky-400">
                                    {/* Jupyter-style In [N]: prompt (3b) — N mirrors the
                      kernel's submission counter, so it matches the
                      Out[N] the kernel stamps on result lines. */}
                                    <span className="select-none text-muted-foreground">In [{e.exec ?? 0}]: </span>
                                    {e.text}
                                </div>
                            );
                        }
                        if (e.kind === "err") {
                            // ModuleNotFoundError entries get the one-click pip
                            // install button next to the message ("when a module is
                            // not found, add a button automatically next to it").
                            const missing = missingModuleFrom(e.text ?? "");
                            return (
                                <div key={e.id}
                                     className="whitespace-pre-wrap break-words text-red-600 dark:text-red-400">
                                    {e.text}
                                    {missing && (
                                        <div className="not-italic mt-1">
                                            <PipInstallButton
                                                module={missing}
                                                onInstalled={() => {
                                                    toast({
                                                        title: `${missing} installed`,
                                                        description: "Retry the import — the console session picks the module up immediately.",
                                                    });
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        if (e.kind === "sys") {
                            return (
                                <div key={e.id}
                                     className="whitespace-pre-wrap break-words italic text-muted-foreground/70 text-[10px]">
                                    {e.text}
                                </div>
                            );
                        }
                        // "out" (fallthrough): the kernel stamps its eval results with an
                        // "Out[N]: " prefix (console-kernel) — peel it off for the
                        // same Jupyter prompt styling as In, then render the body as
                        // a compact DataFrame table when it conservatively parses as
                        // one (3d) — three detectors now: pandas HTML, the
                        // Columns:+dashes grid (console-table) and the plain pandas
                        // text repr (console-magics, 3); everything else stays raw
                        // preformatted text.
                        //
                        // "Open in grid": when the table-like body maps back to a
                        // SIMPLE PATH expression (the In[N] that produced this
                        // Out[N] — df, results[0], cfg["x"]), the block grows the
                        // affordance that fetches the LIVE object through
                        // /api/console/variable. Non-path inputs (df.head()) skip it
                        // — the kernel's guarded resolver cannot re-run them — but
                        // the underlying object stays reachable from the Vars list.
                        const outText = e.text ?? "";
                        const outPrompt = /^Out\[(\d+)\]: /.exec(outText);
                        const body = outPrompt ? outText.slice(outPrompt[0].length) : outText;
                        const dfTable = dataFrameTableFor(body);
                        const tableGridExpr = outPrompt
                            ? simplePathExpr(inByExec.get(Number(outPrompt[1])) ?? "")
                            : null;
                        // For the RAW-text branch the affordance ALSO requires the
                        // body itself to look table-like (a dict / list-of-dicts
                        // repr...) — plain values never grow the button. The hint
                        // only runs when the DataFrame parsers already declined.
                        const rawTableLike = !dfTable && tableLikeReprHint(body);
                        if (dfTable) {
                            return (
                                <div key={e.id} className="my-1">
                                    {outPrompt && (
                                        <span className="select-none text-muted-foreground">{outPrompt[0]}</span>
                                    )}
                                    <ConsoleDataFrameTable table={dfTable.table} footer={dfTable.footer}/>
                                    {tableGridExpr && (
                                        <OpenInGridButton
                                            expr={tableGridExpr}
                                            busy={gridFetching === tableGridExpr}
                                            onClick={() => void openVariableGrid(tableGridExpr)}
                                        />
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div key={e.id} className="whitespace-pre-wrap break-words text-foreground/90">
                                {outPrompt && (
                                    <span className="select-none text-muted-foreground">{outPrompt[0]}</span>
                                )}
                                {body}
                                {rawTableLike && tableGridExpr && (
                                    <OpenInGridButton
                                        expr={tableGridExpr}
                                        busy={gridFetching === tableGridExpr}
                                        onClick={() => void openVariableGrid(tableGridExpr)}
                                    />
                                )}
                            </div>
                        );
                    })
                )}

                {/* ── Vars ─────────────────────────────────────────────── */}
                {variables && variables.length > 0 && (
                    <div className="mt-2 border rounded">
                        <button
                            type="button"
                            className="w-full flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent/50"
                            onClick={() => setShowVars((v) => !v)}
                            aria-expanded={showVars}
                        >
                            {showVars ? <ChevronDown className="size-3"/> : <ChevronRight className="size-3"/>}
                            Vars · {variables.length}
                            <span className="text-muted-foreground/60">— namespace snapshot</span>
                        </button>
                        {showVars && (
                            <div className="px-2 pb-1.5 max-h-40 overflow-y-auto">
                                {variables.map((v) => (
                                    <div key={v.name} className="flex gap-2 items-baseline">
                                        <span className="text-purple-600 dark:text-purple-400 shrink-0">{v.name}</span>
                                        <span className="text-muted-foreground/60 text-[9px] shrink-0">{v.type}</span>
                                        {/* "open in grid" — table-shaped variables (DataFrame,
                        dict, list…) offer the live grid without needing a
                        simple-path In[N] echo; the expr IS the name. */}
                                        {GRID_VAR_TYPES.has(v.type) && (
                                            <button
                                                type="button"
                                                className="text-[9px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-0.5 shrink-0"
                                                aria-label={`Open ${v.name} in the grid viewer`}
                                                title={`Open ${v.name} in the grid viewer — fetches the live value from the kernel (first 2,000 rows × 100 columns)`}
                                                onClick={() => void openVariableGrid(v.name)}
                                            >
                                                {gridFetching === v.name ? (
                                                    <Loader2 className="size-2.5 animate-spin" aria-hidden/>
                                                ) : (
                                                    <FileSpreadsheet className="size-2.5" aria-hidden/>
                                                )}
                                                grid
                                            </button>
                                        )}
                                        <span className="truncate" title={v.value}>
                      {v.value || (v.type === "module" ? "<module>" : v.type === "function" ? "<function>" : "")}
                    </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── (1) Pending queue chips — lines queued while the kernel was
          busy. The head auto-submits when the kernel goes idle; each
          chip is cancellable with the x. —──────────────────── */}
            {queue.length > 0 && (
                <div className="shrink-0 border-t px-2 py-1 flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto">
          <span className="text-[9px] text-muted-foreground/70 select-none shrink-0"
                title="Lines waiting for the kernel to go idle — they run in order">
            queued · runs when idle
          </span>
                    {queue.map((line, i) => {
                        const label = queueChipLabel(line);
                        return (
                            <span
                                key={`${i}-${label}`}
                                className="inline-flex items-center gap-1 max-w-64 rounded border bg-muted/40 pl-1.5 pr-0.5 py-0.5 font-mono text-[10px] text-foreground/80"
                                title={line}
                            >
                <span className="truncate">{label}</span>
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={`Remove queued line: ${label}`}
                    title="Remove this queued line"
                    onClick={() => {
                        const next = queueRef.current.filter((_, j) => j !== i);
                        queueRef.current = next;
                        setQueue(next);
                    }}
                >
                  <X className="size-2.5" aria-hidden/>
                </button>
              </span>
                        );
                    })}
                </div>
            )}

            {/* ── Input ───────────────────────────────────────────────── */}
            <div className="shrink-0 border-t px-2 py-1.5 flex items-start gap-1.5">
        <span className="font-mono text-[11px] text-emerald-500 select-none pt-0.5" aria-hidden>
          &gt;&gt;&gt;
        </span>
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={Math.min(6, Math.max(1, input.split("\n").length))}
                    placeholder={
                        busy
                            ? "running… — Enter queues the line; it runs when the kernel is idle"
                            : "Python code — Enter runs, ⇧Enter adds a line, ↑/↓ history"
                    }
                    className="flex-1 resize-none bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground/50 max-h-24"
                    aria-label="Console input"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                />
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px] shrink-0"
                    onClick={submitInput}
                    disabled={!input.trim()}
                    title={
                        busy
                            ? "Queue the line — it runs automatically when the kernel is idle (Enter)"
                            : "Run in the persistent console (Enter)"
                    }
                >
                    <Play className="size-3"/>
                    {busy ? "Queue" : "Run"}
                </Button>
            </div>

            {/* ── "Open in grid" fallback viewer — only reached when NEITHER
          the onOpenVariableGrid prop NOR a PRAXIS_OPEN_VARIABLE_GRID
          listener claimed the payload (see openVariableGrid). A Dialog,
          so it portals out of the bottom-panel overflow anyway. */}
            <VariableGridDialog
                open={gridDialog !== null}
                onOpenChange={(o) => {
                    if (!o) setGridDialog(null);
                }}
                data={gridDialog}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  "Open in grid" affordance pieces                                     */
/* ------------------------------------------------------------------ */

/** Variables whose type(value).__name__ maps to a kernel-serializable
 *  table shape (see _grid_payload in console-kernel) — these get the
 *  tiny grid button in the Vars list. Anything else can still be
 *  opened from a simple-path Out[N] echo when its repr parses as a
 *  table. */
const GRID_VAR_TYPES = new Set([
    "DataFrame",
    "Series",
    "ndarray",
    "dict",
    "list",
    "tuple",
    "set",
]);

/** The small "open in grid" affordance under a table-like result —
 *  same visual family as the figure row's download link (9px,
 *  muted, foreground on hover) so the scrollback stays quiet while
 *  the action stays discoverable. */
function OpenInGridButton({
                              expr,
                              busy,
                              onClick,
                          }: {
    expr: string;
    busy: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="mt-0.5 text-[9px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-0.5 align-baseline"
            aria-label={`Open ${expr} in the grid viewer`}
            title={`Open ${expr} in the grid viewer — fetches the live value from the kernel (first 2,000 rows × 100 columns)`}
            onClick={onClick}
        >
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden/> :
                <FileSpreadsheet className="size-3" aria-hidden/>}
            open in grid
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  DataFrame table rendering (3d)                                       */

/* ------------------------------------------------------------------ */

/** Detect + parse a DataFrame-shaped output body — null when the block
 *  is not conservatively DataFrame-like. THREE detectors, in order (3):
 *  the pandas HTML output and the Columns:+dashes text grid
 *  (console-table — see there for those two shapes), then the plain
 *  pandas text repr (console-magics' parseDataFrameRepr: 2+-space
 *  separated columns, RangeIndex or named-index rows, optional
 *  [N rows x M columns] footer). The repr parser's columns include
 *  the leading index-column slot, so it is sliced off for the shared
 *  ConsoleTable shape; its shape note rides along as the footer. */
function dataFrameTableFor(body: string): { table: ConsoleTable; footer?: string } | null {
    const kind = detectDataFrameOutput(body);
    if (kind) {
        const table = kind === "html" ? parseDataFrameHtml(body) : parseDataFrameText(body);
        return table ? {table} : null;
    }
    const repr = parseDataFrameRepr(body);
    if (repr) {
        return {
            table: {columns: repr.columns.slice(1), rows: repr.rows},
            footer: repr.shapeNote,
        };
    }
    return null;
}

/** Row cap for the rendered table — a giant to_html() dump (no
 *  display.max_rows truncation) must not flood the panel. */
const MAX_TABLE_ROWS = 500;

/** Compact styled table for DataFrame-shaped output blocks: sticky
 *  header row, monospace cells, horizontal scroll (nowrap cells in an
 *  overflow-auto wrapper) and subtle borders + zebra rows. The leading
 *  cell of every row is the pandas INDEX column (muted, empty header).
 *  `footer` — the repr parser's `[N rows x M columns]` note — renders
 *  under the table like pandas' own trailing line. */
function ConsoleDataFrameTable({table, footer}: { table: ConsoleTable; footer?: string }) {
    const shown = table.rows.slice(0, MAX_TABLE_ROWS);
    const hidden = table.rows.length - shown.length;
    return (
        <div className="my-1 max-h-64 overflow-auto rounded border bg-background">
            <table className="border-collapse font-mono text-[10px]">
                <thead>
                <tr>
                    {/* the empty index-column slot, like the pandas grid */}
                    <th
                        scope="col"
                        className="sticky top-0 z-10 bg-muted px-1.5 py-0.5 text-left font-medium text-muted-foreground border-b whitespace-nowrap"
                        aria-label="index"
                    />
                    {table.columns.map((c, j) => (
                        <th
                            key={`${c}-${j}`}
                            scope="col"
                            className="sticky top-0 z-10 bg-muted px-1.5 py-0.5 text-left font-medium border-b whitespace-nowrap"
                        >
                            {c}
                        </th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {shown.map((row, i) => (
                    <tr key={i} className="even:bg-muted/25">
                        <td className="px-1.5 py-0.5 text-muted-foreground whitespace-nowrap">
                            {row[0] ?? ""}
                        </td>
                        {table.columns.map((_, j) => (
                            <td key={j} className="px-1.5 py-0.5 whitespace-nowrap">
                                {row[j + 1] ?? ""}
                            </td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
            {hidden > 0 && (
                <p className="px-1.5 py-0.5 text-[9px] text-muted-foreground/70">
                    +{hidden} more rows (truncated — print the value to see the rest)
                </p>
            )}
            {footer && (
                <p className="px-1.5 py-0.5 text-[9px] text-muted-foreground/70">{footer}</p>
            )}
        </div>
    );
}
