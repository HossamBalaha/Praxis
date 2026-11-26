"use client";

import * as React from "react";
import Ansi from "ansi-to-react";
import {Button} from "@/components/ui/button";
import {
    ArrowDown,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Loader2,
    Plus,
    RotateCcw,
    Search,
    Square,
    TerminalSquare,
    Trash2,
    X,
} from "lucide-react";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
// term-text — pure helpers for the scrollback FIND bar (match offsets
// over the ANSI-laden buffer). term-links — the URL LINK segmentation
// of the raw buffer (http(s) AND scheme-less www.); rendering layers
// it into clickable anchors below (TerminalScrollback).
import {findScrollbackMatches, type TermLinkSegment,} from "@/lib/term-text";
import {splitTerminalLinks, terminalLinkHref} from "@/lib/term-links";
import {loadWorkspaceSession, saveWorkspaceSession,} from "@/lib/workspace-session";
// Perf HUD — counts every render of the terminal panel into the
// per-panel registry (Settings → Editor → performance HUD).
import {reportPanelRender} from "@/lib/perf-metrics";

interface TermSessionInfo {
    id: string;
    kind: "shell" | "python";
    cwd: string;
    shell: string;
}

interface TerminalPanelProps {
    /** The project root shown as the default working directory. */
    projectRoot?: string;
    /** Show the panel (drives connecting on visibility). */
    active: boolean;
}

/** Cap on rendered output — the head is trimmed beyond this. */
const MAX_RENDERED = 120_000;

/** — persisted command history (survives reloads). */
const HISTORY_KEY = `${STORAGE_PREFIX}-term-history`;
const HISTORY_CAP = 500;

/** (5) after a submitted command's output has been quiet for this long,
 *  the client-side "a foreground command is running" tracker presumes
 *  the prompt returned (streaming commands: pip / git / builds print
 *  continuously while they run). Commands that never printed anything
 *  keep the flag — there is no completion signal for a piped shell. */
const RUNNING_QUIET_MS = 1500;

/** SGR escape codes — stripped when copying the scrollback. */
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function loadHistory(): string[] {
    try {
        const raw = window.localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
            return parsed.slice(-HISTORY_CAP);
        }
    } catch {
        /* ignore */
    }
    return [];
}

function saveHistory(h: string[]): void {
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_CAP)));
    } catch {
        /* quota exceeded — ignore */
    }
}

/**
 * Integrated terminal panel — persistent shell / Python REPL sessions
 * streamed over SSE from /api/term.
 *
 * No PTY: the server spawns cmd.exe / $SHELL / `python -i` with pipes,
 * and this panel renders its OWN prompt line, so the dependency-free
 * approach works identically on Windows, macOS and Linux, under both
 * the Node and Bun standalone servers. Output is rendered with
 * ansi-to-react so colors survive.
 *
 * "the terminal needs to be more advanced":
 * • local echo — submitted lines are echoed with a colored prompt
 * ($ / >>>), because piped shells never echo piped stdin
 * • readline-style line editing — Ctrl+A/E (home/end), Ctrl+U/K
 * (kill line halves), Ctrl+W (kill word), Ctrl+L (clear screen —
 * also wipes the SERVER backlog via action "clear" so the SSE
 * replay stays consistent), Ctrl+D (EOF byte for the REPL),
 * Ctrl+C (SIGINT via the signal action — including an EMPTY input
 * line while a foreground command is presumed running; an idle
 * piped shell is spared because SIGINT kills it)
 * • Ctrl+R reverse history search with an inline (reverse-i-search)
 * banner — Enter runs the match, Esc cancels, Ctrl+R steps older
 * • history with draft preservation (↑/↓ keep the unsent line),
 * deduplicated and persisted to localStorage across reloads
 * • session buffer reset on switch — the server REPLAY used to be
 * appended onto the previous session's scrollback (bug fix)
 * • copy-scrollback button (strips ANSI codes), restart button when
 * a session exits, per-session close (×) chips, scroll-to-bottom
 * floating button when the view is scrolled up
 *
 * Limitations (by design, documented in the README): no full-screen
 * TUI apps (vim/less), no interactive stdin prompts beyond line input
 * — it's for pip / git / quick REPL work.
 */
export function TerminalPanel({projectRoot, active}: TerminalPanelProps) {
    // Count THIS render into the Perf HUD's per-panel registry.
    reportPanelRender("Terminal");
    const [sessions, setSessions] = React.useState<TermSessionInfo[]>([]);
    // ── SESSION RESTORE: the server's terminal sessions SURVIVE a page
    //    reload (module-level map + 30 min TTL) — only the client used
    //    to forget their ids. On mount, re-attach to the sessions the
    //    workspace snapshot remembers (validated against /api/term
    //    action:"list" so dead ids are dropped instead of showing a
    //    "conn lost" chip forever).
    const restoredRef = React.useRef(false);
    React.useEffect(() => {
        if (restoredRef.current) return;
        restoredRef.current = true;
        const stored = loadWorkspaceSession()?.terminalSessions ?? [];
        if (stored.length === 0) return;
        let alive = false;
        (async () => {
            try {
                const res = await fetch("/api/term", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: "list"}),
                });
                if (!res.ok) return;
                const data = (await res.json()) as {
                    sessions?: Array<{
                        id: string;
                        kind: "shell" | "python";
                        cwd: string;
                        shell: string;
                        closed: boolean
                    }>;
                };
                const live = new Set((data.sessions ?? []).filter((s) => !s.closed).map((s) => s.id));
                const stillLive = stored.filter((s) => live.has(s.id));
                if (stillLive.length === 0) return;
                setSessions(stillLive.map((s) => ({id: s.id, kind: s.kind, cwd: s.cwd, shell: s.shell})));
                setActiveId(stillLive[0].id);
                activeIdRef.current = stillLive[0].id;
                alive = true;
            } catch {
                /* offline / server down — start clean like before */
            }
        })();
        return () => {
            alive = false;
        };
    }, []);
    // ── Persist the live session list (debounced) for the next reload.
    React.useEffect(() => {
        if (sessions.length === 0) return;
        const snap = loadWorkspaceSession();
        saveWorkspaceSession({
            ...(snap ?? {
                version: 1, openTabs: [], activeTab: null, splitPane: null,
                dirtyBuffers: {}, terminalSessions: [], consoleSessionId: null, savedAt: 0,
            }),
            terminalSessions: sessions.map((s) => ({id: s.id, kind: s.kind, cwd: s.cwd, shell: s.shell})),
        });
    }, [sessions]);
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [starting, setStarting] = React.useState(false);
    const [lines, setLines] = React.useState("");
    const [input, setInput] = React.useState("");
    const [exited, setExited] = React.useState<number | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [stick, setStick] = React.useState(true);
    // Reverse-i-search state — { on, q (query), i (match index, 0 = newest) }.
    const [search, setSearch] = React.useState<{ on: boolean; q: string; i: number }>({
        on: false,
        q: "",
        i: 0,
    });
    // ── scrollback FIND bar (Ctrl+Shift+F): case-insensitive
    // substring matches over the ANSI-STRIPPED text, next/prev stepping,
    // the current hit highlighted in place (a <mark> in the rendered
    // stream) and scrolled to. `i` is the match index; the query is
    // deferred so keystrokes don't re-scan a 120 k-char buffer on the
    // hot path.
    const [find, setFind] = React.useState<{ on: boolean; q: string; i: number }>({
        on: false,
        q: "",
        i: 0,
    });
    const findInputRef = React.useRef<HTMLInputElement | null>(null);
    const deferredFindQ = React.useDeferredValue(find.q);

    const historyRef = React.useRef<string[]>([]);
    const historyIdxRef = React.useRef(-1);
    /** The unsent input line, preserved while navigating history. */
    const draftRef = React.useRef("");
    // (5) client-side "a foreground command is (probably) running" for
    // the ACTIVE session. The server spawns NON-INTERACTIVE shells with
    // pipes — they never print a prompt — so completion is not directly
    // observable; the tracker is set when a line is submitted, and
    // cleared when the session exits/switches, when the user submits an
    // EMPTY line (the "I'm at the prompt" gesture), or when the
    // command's output goes quiet for RUNNING_QUIET_MS. It only feeds
    // the Ctrl+C decision (see onInputKeyDown).
    const runningRef = React.useRef(false);
    const runningQuietTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const armRunningQuiet = React.useCallback(() => {
        if (!runningRef.current) return;
        if (runningQuietTimerRef.current) clearTimeout(runningQuietTimerRef.current);
        runningQuietTimerRef.current = setTimeout(() => {
            runningQuietTimerRef.current = null;
            runningRef.current = false;
        }, RUNNING_QUIET_MS);
    }, []);
    const clearRunning = React.useCallback(() => {
        runningRef.current = false;
        if (runningQuietTimerRef.current) {
            clearTimeout(runningQuietTimerRef.current);
            runningQuietTimerRef.current = null;
        }
    }, []);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const stickBottomRef = React.useRef(true);
    const activeIdRef = React.useRef<string | null>(null);
    const sessionsRef = React.useRef<TermSessionInfo[]>([]);
    const esRef = React.useRef<EventSource | null>(null);
    const bufRef = React.useRef("");
    /** Header line stamped by startSession, consumed by the attach effect. */
    const pendingHeaderRef = React.useRef("");
    const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const startedOnceRef = React.useRef(false);

    activeIdRef.current = activeId;
    sessionsRef.current = sessions;

    // ─── Batched output flush: SSE chunks can arrive in bursts; render
    // at most every 60 ms so typing-heavy REPL output stays smooth.
    const scheduleFlush = React.useCallback(() => {
        if (flushTimerRef.current) return;
        flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            const next = bufRef.current;
            if (next.length > MAX_RENDERED) {
                bufRef.current = next.slice(next.length - MAX_RENDERED);
            }
            setLines(bufRef.current);
        }, 60);
    }, []);

    // ─── Persisted history: load once on mount.
    React.useEffect(() => {
        historyRef.current = loadHistory();
    }, []);

    // ─── Auto-start a shell session the first time the panel shows.
    React.useEffect(() => {
        if (active && !startedOnceRef.current && sessions.length === 0) {
            startedOnceRef.current = true;
            void startSession("shell");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, sessions.length]);

    // ─── Attach the SSE stream for the active session. the
    // buffer is RESET first — the server replays the session's full
    // history on connect, which used to be appended onto the PREVIOUS
    // session's scrollback when switching sessions.
    React.useEffect(() => {
        esRef.current?.close();
        esRef.current = null;
        // (5) the running tracker belongs to the ACTIVE session — a fresh
        // attach (session switch / restart) starts it clean.
        clearRunning();
        if (!activeId) {
            bufRef.current = "";
            setLines("");
            return;
        }
        bufRef.current = pendingHeaderRef.current;
        pendingHeaderRef.current = "";
        setLines(bufRef.current);
        const es = new EventSource(`/api/term/stream?id=${encodeURIComponent(activeId)}`);
        esRef.current = es;
        es.onmessage = (ev: MessageEvent<string>) => {
            if (!ev.data) return; // keep-alive comment
            try {
                const msg = JSON.parse(ev.data) as { out?: string; exit?: number };
                if (typeof msg.out === "string") {
                    bufRef.current += msg.out;
                    scheduleFlush();
                    // (5) live output while a command is presumed running — the
                    // quiet timer decides when the prompt has come back.
                    armRunningQuiet();
                }
                if (typeof msg.exit === "number") {
                    setExited(msg.exit);
                    clearRunning();
                    bufRef.current += `\n[process exited with code ${msg.exit}]\n`;
                    scheduleFlush();
                }
            } catch {
                /* malformed event — ignore */
            }
        };
        // (6) a successful (re)connect clears a TRANSIENT "conn lost"
        // sentinel — but never a real exit code, which came from the
        // session itself (EventSource auto-reconnects in the background).
        es.onopen = () => {
            setExited((prev) => (prev === -1 ? null : prev));
        };
        es.onerror = () => {
            // (6) Stream dropped (server restart / session gone / network).
            // The old handler rendered this as "exit 0" — success-looking
            // fiction. -1 is the distinct CONNECTION-LOST sentinel: it shows
            // a "conn lost" chip (not an exit code) and disables the input
            // until a reconnect (onopen) or a genuine exit event resolves
            // the real state.
            if (activeIdRef.current === activeId) {
                setExited((prev) => prev ?? -1);
            }
        };
        return () => {
            es.close();
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            if (runningQuietTimerRef.current) {
                clearTimeout(runningQuietTimerRef.current);
                runningQuietTimerRef.current = null;
            }
        };
    }, [activeId, scheduleFlush, clearRunning, armRunningQuiet]);

    // Keep the view pinned to the bottom while the user hasn't scrolled up.
    React.useEffect(() => {
        const el = scrollRef.current;
        if (el && stickBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [lines]);

    /** startSession gained an optional cwd OVERRIDE — the
     *  "Open in Terminal" context-menu action (folders, subfolders and
     *  files) resolves the target's absolute path and starts a shell
     *  session right there (or `cd`s an existing session — see the
     *  praxis:term-cd listener below). */
    const startSession = React.useCallback(
        async (kind: "shell" | "python", cwdOverride?: string) => {
            setStarting(true);
            try {
                const res = await fetch("/api/term", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        action: "start",
                        kind,
                        cwd: cwdOverride || projectRoot,
                    }),
                });
                const data = await res.json();
                if (!res.ok) {
                    bufRef.current += `\n[error] ${data.error ?? `HTTP ${res.status}`}\n`;
                    scheduleFlush();
                    return;
                }
                const info: TermSessionInfo = {
                    id: data.id,
                    kind: data.kind,
                    cwd: data.cwd,
                    shell: data.shell,
                };
                pendingHeaderRef.current = `[${info.kind === "python" ? "python" : info.shell} in ${info.cwd}]\n`;
                setSessions((prev) => [...prev, info]);
                setActiveId(info.id);
                setExited(null);
                scheduleFlush();
                requestAnimationFrame(() => inputRef.current?.focus());
            } finally {
                setStarting(false);
            }
        },
        [projectRoot, scheduleFlush]
    );

    const killActive = React.useCallback(async () => {
        if (!activeId) return;
        await fetch("/api/term", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "kill", id: activeId}),
        }).catch(() => undefined);
    }, [activeId]);

    /** — kill + remove one session chip; activates a sibling. */
    const closeSession = React.useCallback(async (id: string) => {
        await fetch("/api/term", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "kill", id}),
        }).catch(() => undefined);
        const rest = sessionsRef.current.filter((s) => s.id !== id);
        setSessions(rest);
        if (activeIdRef.current === id) {
            if (rest.length > 0) {
                setActiveId(rest[rest.length - 1].id);
                setExited(null);
            } else {
                setActiveId(null);
                setExited(null);
            }
        }
    }, []);

    const sendInput = React.useCallback(
        async (text: string) => {
            // Fix: read the active id from the REF, not the closure.
            // The "Run in Terminal" flow queues its command ~600ms after
            // startSession resolves; the captured submit/sendInput still saw
            // the PREVIOUS render's activeId (null for the first session) and
            // silently dropped the write — the command echoed locally but
            // never reached the shell.
            const id = activeIdRef.current;
            if (!id || exited !== null) return;
            await fetch("/api/term", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "write", id, input: text}),
            }).catch(() => undefined);
        },
        [exited]
    );

    // ── SIGINT/SIGTERM for the active session (2a) ──
    // /api/term has had an `action:"signal"` branch for a while, but
    // NOTHING ever called it — the Ctrl+C handler below wrote the raw
    // \x03 byte into the session's stdin instead, which with piped
    // (non-PTY) sessions is just data: it never interrupts anything and
    // merely litters the shell's input line. This finally fires the
    // signal path.
    const sendSignal = React.useCallback(
        async (signal: "SIGINT" | "SIGTERM") => {
            const id = activeIdRef.current;
            if (!id || exited !== null) return;
            await fetch("/api/term", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "signal", id, signal}),
            }).catch(() => undefined);
        },
        [exited]
    );

    const activeSession = sessions.find((s) => s.id === activeId) ?? null;

    // ── scrollback find matches + the current hit's absolute range ──
    // Computed against the RAW buffer (with ANSI codes) so the highlight
    // can slice the raw stream; matching itself runs on the stripped text
    // (a query for "0" must not hit the digits inside color escapes).
    const findMatches = React.useMemo(
        () => (find.on ? findScrollbackMatches(lines, deferredFindQ) : []),
        [find.on, lines, deferredFindQ]
    );
    const currentFindMatch =
        findMatches.length > 0
            ? findMatches[Math.min(find.i, findMatches.length - 1)]
            : null;
    const currentHit = currentFindMatch
        ? {
            start: currentFindMatch.bufOffset + currentFindMatch.rawStart,
            end: currentFindMatch.bufOffset + currentFindMatch.rawEnd,
        }
        : null;
    // URL segmentation of the raw buffer — memoized per flush.
    const linkSegments = React.useMemo(() => splitTerminalLinks(lines), [lines]);

    const findNext = React.useCallback(() => {
        if (findMatches.length === 0) return;
        setFind((f) => ({...f, i: (f.i + 1) % findMatches.length}));
    }, [findMatches.length]);
    const findPrev = React.useCallback(() => {
        if (findMatches.length === 0) return;
        setFind((f) => ({...f, i: (f.i - 1 + findMatches.length) % findMatches.length}));
    }, [findMatches.length]);
    const openFind = React.useCallback(() => {
        setFind({on: true, q: "", i: 0});
        requestAnimationFrame(() => findInputRef.current?.focus());
    }, []);
    const closeFind = React.useCallback(() => {
        setFind({on: false, q: "", i: 0});
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    // Scroll the CURRENT find hit to the middle of the scrollback —
    // the hit renders as a real <mark> element, so its offsetTop (the
    // container is position:relative) is exact even across wrapped
    // lines; no row-height estimation needed.
    React.useEffect(() => {
        if (!find.on || !currentHit) return;
        const container = scrollRef.current;
        const mark = container?.querySelector<HTMLElement>("mark[data-term-find-hit]");
        if (container && mark) {
            container.scrollTop = Math.max(0, mark.offsetTop - container.clientHeight / 2);
            // Scrolled away from the bottom — drop the stick so new output
            // doesn't yank the view off the match.
            stickBottomRef.current = false;
            setStick(false);
        }
    }, [find.on, find.i, deferredFindQ, currentHit]);

    /** — local echo: piped shells never echo stdin, so the
     *  transcript would show bare output. Echo the submitted line with a
     *  colored prompt. (Client-side only: a session re-attach replays the
     *  raw server history, so echo lines don't survive a switch.) */
    const echoCommand = React.useCallback(
        (cmd: string) => {
            const p = activeSession?.kind === "python" ? "\x1b[32m>>>\x1b[0m " : "\x1b[36m$\x1b[0m ";
            bufRef.current += `${p}\x1b[1m${cmd}\x1b[0m\n`;
            scheduleFlush();
        },
        [activeSession, scheduleFlush]
    );

    /* — scrollback find is ANSI-aware on both ends: the
      *  matches are computed over the stripped text (see term-text.ts)
      *  while the highlighted <mark> slices the RAW buffer, so colors
      *  inside the hit survive. */
    const findTotal = findMatches.length;
    const findCurrent = findTotal > 0 ? Math.min(find.i, findTotal - 1) + 1 : 0;

    const submit = React.useCallback(
        (value: string, opts?: { skipHistory?: boolean }) => {
            historyIdxRef.current = -1;
            draftRef.current = "";
            setInput("");
            setSearch({on: false, q: "", i: 0});
            if (!value.trim()) {
                // Still send a bare newline so the REPL advances. An EMPTY
                // Enter is also the "I'm at the prompt" gesture (5) — it
                // clears the running tracker, so a later empty-input Ctrl+C
                // stays cosmetic instead of SIGINTing a session that is idle
                // at its prompt.
                clearRunning();
                void sendInput("\n");
                return;
            }
            // (5) a foreground command is now (presumed) running — a piped
            // shell prints no prompt, so Ctrl+C while the input is EMPTY must
            // still fire the signal (see onInputKeyDown).
            runningRef.current = true;
            if (runningQuietTimerRef.current) {
                clearTimeout(runningQuietTimerRef.current);
                runningQuietTimerRef.current = null;
            }
            if (!opts?.skipHistory) {
                const h = historyRef.current;
                if (h[h.length - 1] !== value) {
                    h.push(value);
                    saveHistory(h);
                }
            }
            echoCommand(value);
            void sendInput(value + "\n");
        },
        [echoCommand, sendInput, clearRunning]
    );

    // ─── "Open in Terminal" ──────────────────────────────────
    /** The Explorer's Open-in-Terminal action dispatches
     *  praxis:term-cd { cwd } (the page switches to the Terminal tab).
     *  Here: with a live SHELL session, `cd` into the directory (quoted —
     *  paths may contain spaces); without one, start a fresh shell
     *  session rooted there. A python REPL session is left alone — cd is
     *  a shell concept — and a new shell session is started instead.
     *  RACE GUARD: claiming startedOnceRef BEFORE the async start keeps
     *  the auto-start effect (which fires when the page switches this
     *  tab active a tick later, while sessions state is still empty)
     *  from spawning a SECOND default-cwd session. */
    React.useEffect(() => {
        const onTermCd = (e: Event) => {
            const cwd = (e as CustomEvent).detail?.cwd;
            // optional `command` — "Run in Terminal" (the file
            // right-click action) cds to the directory and then executes the
            // command (e.g. `python3 "QuickSort.py"`) in the shell session,
            // exactly like typing it. When no shell session exists yet, the
            // command rides the fresh session's startup queue below.
            const command = (e as CustomEvent).detail?.command;
            if (typeof cwd !== "string" || !cwd.trim()) return;
            const session = sessionsRef.current.find((s) => s.id === activeIdRef.current);
            if (session && session.kind === "shell" && exited === null) {
                submit(`cd "${cwd}"`, {skipHistory: true});
                if (typeof command === "string" && command.trim()) {
                    // A tick later so the cd lands in the SAME session first.
                    setTimeout(() => submit(command, {skipHistory: true}), 120);
                }
                // Keep the rendered prompt label in sync with the shell's new
                // working directory (the label shows the session's creation cwd
                // otherwise — typed `cd`s update it too, see submit usage note).
                setSessions((prev) => prev.map((s) => (s.id === activeIdRef.current ? {...s, cwd} : s)));
                requestAnimationFrame(() => inputRef.current?.focus());
            } else {
                startedOnceRef.current = true;
                void startSession("shell", cwd).then(() => {
                    if (typeof command === "string" && command.trim()) {
                        // Fresh shell: give the process + its SSE stream a beat to
                        // come up before the command rides in.
                        setTimeout(() => submit(command, {skipHistory: true}), 600);
                    }
                });
            }
        };
        window.addEventListener("praxis:term-cd", onTermCd);
        return () => window.removeEventListener("praxis:term-cd", onTermCd);
    }, [exited, submit, startSession]);

    /** — Ctrl+L: clear the client scrollback AND the server
     *  backlog so a later re-attach doesn't resurrect it. */
    const clearScreen = React.useCallback(async () => {
        bufRef.current = "";
        setLines("");
        if (activeIdRef.current) {
            await fetch("/api/term", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "clear", id: activeIdRef.current}),
            }).catch(() => undefined);
        }
    }, []);

    /** the menubar's View ▸ Clear terminal item pops the same
     *  clearScreen as the panel's trash button / Ctrl+L. */
    React.useEffect(() => {
        const onClear = () => void clearScreen();
        window.addEventListener("praxis:term-clear", onClear);
        return () => window.removeEventListener("praxis:term-clear", onClear);
    }, [clearScreen]);

    /** the Terminal menu's commands — new sessions,
     *  clear / kill / kill-all, send-selection and focus. Same events the
     *  navbar dispatches; `active` gates focus to the visible panel. */
    React.useEffect(() => {
        const onCommand = (e: Event) => {
            const detail = (e as CustomEvent).detail as
                | { command: string; text?: string }
                | undefined;
            const cmd = detail?.command;
            if (!cmd) return;
            if (cmd === "new-shell") {
                void startSession("shell");
            } else if (cmd === "new-python") {
                void startSession("python");
            } else if (cmd === "clear") {
                void clearScreen();
            } else if (cmd === "kill-active") {
                if (activeIdRef.current) void closeSession(activeIdRef.current);
            } else if (cmd === "kill-all") {
                for (const s of sessionsRef.current) void closeSession(s.id);
            } else if (cmd === "send-selection") {
                const text = (detail.text ?? "").trim();
                if (text) void sendInput(text.endsWith("\n") ? text : `${text}\n`);
            } else if (cmd === "focus") {
                if (active) requestAnimationFrame(() => inputRef.current?.focus());
            }
        };
        window.addEventListener("praxis:terminal-command", onCommand);
        return () => window.removeEventListener("praxis:terminal-command", onCommand);
    }, [startSession, clearScreen, closeSession, sendInput, active]);

    /** Reverse-i-search matches, newest-first. */
    const searchMatches = React.useMemo(() => {
        if (!search.on) return [] as string[];
        const q = search.q.toLowerCase();
        return historyRef.current
            .slice()
            .reverse()
            .filter((h) => h.toLowerCase().includes(q));
    }, [search.on, search.q]);

    const currentMatch = searchMatches.length > 0 ? searchMatches[Math.min(search.i, searchMatches.length - 1)] : null;

    const scrollToBottom = React.useCallback(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        stickBottomRef.current = true;
        setStick(true);
    }, []);

    const copyScrollback = React.useCallback(async () => {
        const plain = lines.replace(ANSI_RE, "");
        try {
            await navigator.clipboard.writeText(plain);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            /* clipboard denied — ignore */
        }
    }, [lines]);

    // Readline-style line editing. All operate on the native
    // input's caret so the user sees exactly what a terminal would do.
    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const el = inputRef.current;
        const caret = el?.selectionStart ?? input.length;
        const end = el?.selectionEnd ?? input.length;

        // ── Reverse-i-search mode (Ctrl+R) ─────────────────────────────
        if (search.on) {
            if (e.key === "Enter") {
                e.preventDefault();
                if (currentMatch != null) submit(currentMatch);
                else setSearch({on: false, q: "", i: 0});
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setSearch({on: false, q: "", i: 0});
                setInput(draftRef.current);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
                e.preventDefault();
                setSearch((s) => ({...s, i: Math.min(s.i + 1, Math.max(0, searchMatches.length - 1))}));
                return;
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                return;
            }
            // Everything else falls through to the input (query editing) —
            // reset the match index on any query change via onChange below.
            return;
        }

        if (e.key === "Enter") {
            e.preventDefault();
            submit(input);
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            const h = historyRef.current;
            if (h.length === 0) return;
            if (historyIdxRef.current === -1) {
                draftRef.current = input;
                historyIdxRef.current = h.length - 1;
            } else {
                historyIdxRef.current = Math.max(0, historyIdxRef.current - 1);
            }
            const value = h[historyIdxRef.current] ?? "";
            setInput(value);
            requestAnimationFrame(() => el?.setSelectionRange(value.length, value.length));
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const h = historyRef.current;
            if (historyIdxRef.current === -1) return;
            historyIdxRef.current += 1;
            if (historyIdxRef.current >= h.length) {
                historyIdxRef.current = -1;
                setInput(draftRef.current);
            } else {
                const value = h[historyIdxRef.current] ?? "";
                setInput(value);
                requestAnimationFrame(() => el?.setSelectionRange(value.length, value.length));
            }
            return;
        }

        // ── Control keys (readline emulation) ──────────────────────────
        if (e.ctrlKey || e.metaKey) {
            const k = e.key.toLowerCase();
            // Ctrl+Shift+F — open the scrollback find bar (2b). The app's
            // global Ctrl+Shift+F (format file) ignores keystrokes from an
            // <input>, so the terminal owns the combo while its input is
            // focused.
            if (k === "f" && e.shiftKey) {
                e.preventDefault();
                openFind();
                return;
            }
            // Ctrl+C — send a REAL SIGINT to the session via /api/term's
            // signal action (2a). The old handler wrote the raw \x03 byte
            // into the session's stdin — with piped (non-PTY) sessions that
            // byte is just input data; it never interrupts the foreground
            // process and only dirties the shell's input line. The local
            // "^C" echo stays as the tty-style visual and the pending line is
            // cleared exactly like the line discipline would.
            //
            // (5) The guard used to skip the signal whenever the input was
            // EMPTY on a shell session — but the #1 Ctrl+C use is
            // interrupting the RUNNING foreground command, exactly when the
            // input line IS empty. Now the client-side tracker decides: fire
            // the SIGINT whenever it believes a command is running. The
            // idle-at-prompt guard survives for the genuinely idle case
            // (empty input + nothing running) as tty semantics — Ctrl+C at
            // an idle prompt clears the line rather than signaling. Server
            // side, /api/term signals the session's whole PROCESS GROUP
            // (sessions spawn detached) and the shell runs `trap 'true' INT`,
            // so the foreground command dies while the session survives —
            // verified empirically; a python session's kernel takes the
            // signal as a KeyboardInterrupt and the prompt returns.
            if (k === "c" && !e.shiftKey) {
                e.preventDefault();
                const hasLine = input.length > 0;
                const isPython = activeSession?.kind === "python";
                if (hasLine || isPython || runningRef.current) void sendSignal("SIGINT");
                bufRef.current += "^C\n";
                scheduleFlush();
                setInput("");
                setSearch({on: false, q: "", i: 0});
                return;
            }
            // Ctrl+D — EOF byte (exits the Python REPL).
            if (k === "d") {
                e.preventDefault();
                if (!input) {
                    void sendInput("\x04");
                    bufRef.current += "^D\n";
                    scheduleFlush();
                }
                return;
            }
            // Ctrl+L — clear screen (client + server backlog).
            if (k === "l") {
                e.preventDefault();
                void clearScreen();
                return;
            }
            // Ctrl+A / Ctrl+E — home / end.
            if (k === "a") {
                e.preventDefault();
                el?.setSelectionRange(0, 0);
                return;
            }
            if (k === "e") {
                e.preventDefault();
                const len = input.length;
                el?.setSelectionRange(len, len);
                return;
            }
            // Ctrl+U — kill from line start to the caret.
            if (k === "u") {
                e.preventDefault();
                setInput(input.slice(Math.min(caret, end)));
                requestAnimationFrame(() => el?.setSelectionRange(0, 0));
                return;
            }
            // Ctrl+K — kill from the caret to the line end.
            if (k === "k") {
                e.preventDefault();
                setInput(input.slice(0, Math.min(caret, end)));
                requestAnimationFrame(() => el?.setSelectionRange(input.length, input.length));
                return;
            }
            // Ctrl+W — kill the word before the caret.
            if (k === "w") {
                e.preventDefault();
                let i = Math.min(caret, end);
                while (i > 0 && input[i - 1] === " ") i -= 1;
                while (i > 0 && input[i - 1] !== " ") i -= 1;
                setInput(input.slice(0, i) + input.slice(Math.min(caret, end)));
                requestAnimationFrame(() => el?.setSelectionRange(i, i));
                return;
            }
            // Ctrl+R — enter reverse-i-search.
            if (k === "r") {
                e.preventDefault();
                draftRef.current = input;
                setSearch({on: true, q: input, i: 0});
                return;
            }
        }
    };

    return (
        <div
            className="h-full flex flex-col overflow-hidden bg-zinc-950"
            data-tutorial="terminal-panel"
            onClick={() => {
                // Click anywhere in the terminal focuses the input line.
                if (document.activeElement !== inputRef.current && exited === null && activeId) {
                    inputRef.current?.focus();
                }
            }}
        >
            {/* Session toolbar */}
            <div
                className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-900/60 shrink-0 flex-wrap">
                <TerminalSquare className="size-3.5 text-zinc-400"/>
                <span className="text-xs font-medium text-zinc-200">Terminal</span>
                {sessions.map((s, i) => (
                    <div
                        key={s.id}
                        role="tab"
                        aria-selected={s.id === activeId}
                        onClick={() => {
                            setActiveId(s.id);
                            setExited(null);
                        }}
                        className={cn(
                            "group flex items-center h-6 pl-2 pr-1 rounded-md text-[10px] font-medium transition-colors cursor-default",
                            s.id === activeId ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800"
                        )}
                        title={`${s.kind === "python" ? "Python REPL" : s.shell} — ${s.cwd}`}
                    >
            <span>
              {s.kind === "python" ? "python" : s.shell} {i + 1}
            </span>
                        {s.id === activeId && exited !== null && (
                            <span className="ml-1 size-1.5 rounded-full bg-rose-500" title="exited"/>
                        )}
                        <button
                            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-200"
                            onClick={(ev) => {
                                ev.stopPropagation();
                                void closeSession(s.id);
                            }}
                            aria-label={`Close ${s.kind === "python" ? "Python" : s.shell} session ${i + 1}`}
                            title="Kill and remove this session"
                        >
                            <X className="size-2.5"/>
                        </button>
                    </div>
                ))}
                <div className="flex-1"/>
                {exited !== null && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void startSession(activeSession?.kind ?? "shell")}
                        disabled={starting}
                        className="h-6 px-2 gap-1 text-[10px] text-emerald-300 hover:bg-zinc-800 hover:text-emerald-200"
                        title="Start a fresh session of the same kind"
                    >
                        {starting ? <Loader2 className="size-3 animate-spin"/> : <RotateCcw className="size-3"/>}
                        Restart
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void startSession("shell")}
                    disabled={starting}
                    className="h-6 px-2 gap-1 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Start a new shell session"
                >
                    {starting ? <Loader2 className="size-3 animate-spin"/> : <Plus className="size-3"/>}
                    Shell
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void startSession("python")}
                    disabled={starting}
                    className="h-6 px-2 gap-1 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Start a Python REPL session (python -i)"
                >
                    {starting ? <Loader2 className="size-3 animate-spin"/> : <Plus className="size-3"/>}
                    Python
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={openFind}
                    className="h-6 px-2 gap-1 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Find in the scrollback (Ctrl+Shift+F) — case-insensitive substring, Enter / Shift+Enter steps through matches"
                >
                    <Search className="size-3"/>
                    Find
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyScrollback()}
                    disabled={!lines}
                    className="h-6 px-2 gap-1 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Copy the scrollback (ANSI codes stripped)"
                >
                    {copied ? <Check className="size-3 text-emerald-400"/> : <Copy className="size-3"/>}
                    {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void clearScreen()}
                    className="h-6 px-2 gap-1 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Clear the scrollback (Ctrl+L) — also wipes the server replay backlog"
                >
                    <Trash2 className="size-3"/>
                    Clear
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void killActive()}
                    disabled={!activeId || exited !== null}
                    className="h-6 px-2 gap-1 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Terminate the active session"
                >
                    <Square className="size-3"/>
                    Kill
                </Button>
            </div>

            {/* Output scrollback */}
            <div
                ref={scrollRef}
                onScroll={(e) => {
                    const el = e.currentTarget;
                    const stuck = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                    stickBottomRef.current = stuck;
                    setStick(stuck);
                }}
                className="relative flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words"
            >
                {/* whitespace-pre-wrap — newlines in the PTY
            scrollback were collapsing into spaces (the container used
            normal white-space flow), so `print("a\n\nb")` and command
            output ran together on one line. pre-wrap keeps the line
            breaks AND still wraps over-long lines; break-words keeps a
            single 500-char token from stretching the panel. */}
                {/* The scrollback renders through TerminalScrollback (2c):
            http(s) and www. URLs become clickable links (target _blank,
            rel noreferrer) and the CURRENT find hit is wrapped in a
            <mark> whose offsetTop drives the find bar's scroll. */}
                <TerminalScrollback segments={linkSegments} hit={find.on ? currentHit : null}/>
                {/* Scroll-to-bottom — shown while the view is scrolled up. */}
                {!stick && (
                    <button
                        onClick={scrollToBottom}
                        className="sticky bottom-2 ml-auto flex items-center gap-1 h-6 px-2 rounded-md bg-zinc-800/95 border border-zinc-700 text-[10px] text-zinc-200 hover:bg-zinc-700 shadow-lg"
                        title="Scroll to the latest output"
                    >
                        <ArrowDown className="size-3"/>
                        Latest
                    </button>
                )}
            </div>

            {/* Scrollback find bar (Ctrl+Shift+F / the Find button) — sits
          between the scrollback and the input line. Enter = next,
          Shift+Enter = prev, Esc closes and returns focus to the input. */}
            {find.on && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/60 shrink-0">
                    <Search className="size-3.5 text-zinc-400 shrink-0" aria-hidden/>
                    <input
                        ref={findInputRef}
                        value={find.q}
                        onChange={(e) => setFind((f) => ({...f, q: e.target.value, i: 0}))}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                closeFind();
                            } else if (e.key === "Enter") {
                                e.preventDefault();
                                if (e.shiftKey) findPrev();
                                else findNext();
                            } else if (e.key === "F3") {
                                e.preventDefault();
                                findNext();
                            }
                        }}
                        placeholder="Find in scrollback…"
                        spellCheck={false}
                        autoComplete="off"
                        aria-label="Find in terminal scrollback"
                        className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[11px] text-zinc-100 placeholder:text-zinc-600"
                    />
                    <span
                        className="text-[10px] tabular-nums text-zinc-400 shrink-0 select-none"
                        aria-live="polite"
                        title={`${findTotal} match${findTotal === 1 ? "" : "es"} in the scrollback`}
                    >
            {findCurrent} / {findTotal}
          </span>
                    <button
                        type="button"
                        onClick={findPrev}
                        disabled={findTotal === 0}
                        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded p-0.5 disabled:opacity-40"
                        aria-label="Previous match"
                        title="Previous match (Shift+Enter)"
                    >
                        <ChevronUp className="size-3.5"/>
                    </button>
                    <button
                        type="button"
                        onClick={findNext}
                        disabled={findTotal === 0}
                        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded p-0.5 disabled:opacity-40"
                        aria-label="Next match"
                        title="Next match (Enter)"
                    >
                        <ChevronDown className="size-3.5"/>
                    </button>
                    <button
                        type="button"
                        onClick={closeFind}
                        className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded p-0.5"
                        aria-label="Close find bar"
                        title="Close (Esc)"
                    >
                        <X className="size-3.5"/>
                    </button>
                </div>
            )}

            {/* Reverse-i-search banner (Ctrl+R) */}
            {search.on && (
                <div
                    className="px-3 py-1 border-t border-amber-500/30 bg-amber-500/10 shrink-0 font-mono text-[10px] text-amber-200 truncate">
                    {currentMatch != null ? (
                        <>
                            <span className="opacity-70">(reverse-i-search)</span>`{search.q}`:{" "}
                            <span className="text-amber-100">{currentMatch}</span>
                        </>
                    ) : (
                        <>
                            <span className="opacity-70">(failed reverse-i-search)</span>`{search.q}`
                        </>
                    )}
                    <span className="ml-2 opacity-60">Enter = run · Ctrl+R = older · Esc = cancel</span>
                </div>
            )}

            {/* Input line */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/60 shrink-0">
                {exited === null ? (
                    <span className="font-mono text-[11px] shrink-0 select-none" aria-hidden>
            {activeSession?.kind === "python" ? (
                <span className="text-emerald-400">&gt;&gt;&gt;</span>
            ) : (
                <span className="text-sky-400">$</span>
            )}
          </span>
                ) : exited === -1 ? (
                    // (6) the distinct connection-lost state — NOT a fake exit
                    // code. Amber like a warning, with the recovery hint on
                    // hover; matched to the size/style of the exit chip.
                    <span
                        className="text-[10px] text-amber-400 shrink-0 font-mono"
                        title="The event stream dropped (server restart / network) — the session may or may not still be alive. Restart above (or start a new Shell / Python) to continue."
                    >
            conn lost
          </span>
                ) : (
                    <span className="text-[10px] text-rose-400 shrink-0 font-mono">exit {exited}</span>
                )}
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        if (search.on) setSearch((s) => ({...s, q: e.target.value, i: 0}));
                    }}
                    onKeyDown={onInputKeyDown}
                    disabled={!activeId || exited !== null}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={
                        exited !== null
                            ? exited === -1
                                ? "Connection lost — Restart above (or start a new Shell / Python)"
                                : "Session exited — Restart above (or start a new Shell / Python)"
                            : activeSession?.kind === "python"
                                ? "Python REPL — expressions, statements, help()… (↑ history · Ctrl+R search)"
                                : "Type a command… (↑ history · Ctrl+R search · Ctrl+L clear · Ctrl+Shift+F find · Ctrl+C interrupt)"
                    }
                    className="flex-1 bg-transparent outline-none font-mono text-[11px] text-zinc-100 placeholder:text-zinc-600"
                    aria-label="Terminal input"
                />
                {activeSession && (
                    <span className="text-[9px] text-zinc-500 truncate max-w-[40%]" title={activeSession.cwd}>
            {activeSession.cwd}
          </span>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Scrollback rendering — URL links + find-hit highlight              */

/* ------------------------------------------------------------------ */

/** Renders the terminal scrollback as alternating plain / URL segments
 *  (2c) and, while the find bar is open, wraps the CURRENT match in a
 *  <mark> (2b).
 *
 *  • Plain pieces go through the shared Ansi pass exactly like the old
 *    single-block render; splitting into per-link pieces is free
 *    because URLs are rare.
 *  • URLs render as anchors (target _blank, rel "noopener noreferrer")
 *    with the linkified styling; scheme-less www. links navigate via
 *    the https:// form (terminalLinkHref — a bare www… href would be
 *    resolved as a relative path). ANSI escapes can never be swallowed
 *    into a URL because the detector excludes control bytes.
 *  • When the find hit overlaps a segment, the segment is split into
 *    head / marked / tail. For a URL piece the anchor is dropped for
 *    that one hit (a partial href would navigate somewhere wrong) —
 *    the text still shows, just marked. The <mark> carries
 *    data-term-find-hit so the find bar's scroll effect can locate it
 *    by offsetTop (the scroll container is position:relative). */
function TerminalScrollback({
                                segments,
                                hit,
                            }: {
    /** URL-segmented raw buffer (see splitTerminalLinks). */
    segments: TermLinkSegment[];
    /** Absolute [start, end) range of the current find hit in the raw
     *  buffer, or null when the find bar is closed / no match. */
    hit: { start: number; end: number } | null;
}) {
    return (
        <>
            {segments.map((seg, i) => {
                const segStart = seg.start;
                const segEnd = seg.start + seg.text.length;
                const overlaps =
                    !!hit && hit.start < segEnd && hit.end > segStart;
                if (!overlaps) {
                    return seg.isUrl ? (
                        <a
                            key={i}
                            href={terminalLinkHref(seg.text)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300"
                            title={seg.text}
                        >
                            {seg.text}
                        </a>
                    ) : (
                        <Ansi key={i} useClasses={false}>
                            {seg.text}
                        </Ansi>
                    );
                }
                const s = Math.max(segStart, hit!.start) - segStart;
                const e = Math.min(segEnd, hit!.end) - segStart;
                return (
                    <React.Fragment key={i}>
                        {s > 0 && (
                            <Ansi useClasses={false}>{seg.text.slice(0, s)}</Ansi>
                        )}
                        <mark
                            data-term-find-hit
                            className="rounded-sm bg-amber-400/40 text-zinc-100 ring-1 ring-amber-400/60"
                        >
                            {seg.isUrl ? (
                                seg.text.slice(s, e)
                            ) : (
                                <Ansi useClasses={false}>{seg.text.slice(s, e)}</Ansi>
                            )}
                        </mark>
                        {e < seg.text.length && (
                            <Ansi useClasses={false}>{seg.text.slice(e)}</Ansi>
                        )}
                    </React.Fragment>
                );
            })}
        </>
    );
}
