import {type ChildProcess, spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * Shared state for the integrated terminal's persistent sessions —
 * used by BOTH /api/term (POST: start / write / kill / exec) and
 * /api/term/stream (GET: the SSE reader), which is why it lives in a
 * lib module instead of inside one route file.
 */
export interface TermSession {
    id: string;
    kind: "shell" | "python";
    child: ChildProcess;
    /** POSIX: spawned detached, so the child leads its OWN process group —
     *  group-wide signals then reach foreground commands (real Ctrl+C
     *  semantics) without touching the Next.js server's group. */
    detached: boolean;
    cwd: string;
    createdAt: number;
    closed: boolean;
    exitCode: number | null;
    /** Output backlog (capped) replayed when an SSE reader connects. */
    history: string[];
    listeners: Set<(payload: string) => void>;
}

const sessions = new Map<string, TermSession>();
const MAX_SESSIONS = 4;
const MAX_HISTORY_CHARS = 200_000;
export const SESSION_TTL_MS = 30 * 60_000;
/** Hard silence cap for one-shot exec (12 min). */
export const EXEC_TIMEOUT_MS = 12 * 60_000;

export function getTermSession(id: string): TermSession | undefined {
    return sessions.get(id);
}

/** All live sessions (pruned first) — the /api/term "list" action and
 *  the client's session-restore validation. Child handles stay inside
 *  this module; callers get the session objects but must not spawn or
 *  write through them outside the route's own helpers. */
export function listTermSessions(): TermSession[] {
    pruneTermSessions();
    return [...sessions.values()];
}

export function isWindows(): boolean {
    return process.platform === "win32";
}

export function shellCommand(): { cmd: string; args: string[]; label: string } {
    if (isWindows()) {
        const comspec = process.env.Comspec ?? "cmd.exe";
        return {cmd: comspec, args: ["/Q"], label: "cmd"};
    }
    const shell = process.env.SHELL && fs.existsSync(process.env.SHELL)
        ? process.env.SHELL
        : "/bin/sh";
    return {cmd: shell, args: [], label: path.basename(shell)};
}

/** Resolve + validate the requested working directory. */
export function resolveCwd(requested?: string): string {
    const fallback = getScriptsRoot();
    if (!requested || typeof requested !== "string") return fallback;
    const abs = path.resolve(requested);
    try {
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) return abs;
    } catch {
        /* fall through */
    }
    return fallback;
}

export function pushToSession(s: TermSession, chunk: string): void {
    s.history.push(chunk);
    let total = s.history.reduce((n, c) => n + c.length, 0);
    while (total > MAX_HISTORY_CHARS && s.history.length > 1) {
        total -= s.history[0].length;
        s.history.shift();
    }
    const payload = JSON.stringify({out: chunk});
    for (const l of s.listeners) {
        try {
            l(payload);
        } catch {
            /* listener went away — ignore */
        }
    }
}

export function closeTermSession(s: TermSession, code: number | null): void {
    if (s.closed) return;
    s.closed = true;
    s.exitCode = code;
    const payload = JSON.stringify({exit: code});
    for (const l of s.listeners) {
        try {
            l(payload);
        } catch {
            /* ignore */
        }
    }
}

/** — wipe a session's output backlog (Ctrl+L in the client).
 *  Clearing the SERVER history too keeps the SSE replay consistent:
 *  a re-attaching reader would otherwise resurrect the "cleared"
 *  scrollback. */
export function clearTermHistory(s: TermSession): void {
    s.history.length = 0;
}

/** Signal the session's whole process GROUP (POSIX) — the shell AND any
 *  foreground command it is currently running, exactly like Ctrl+C in a
 *  real terminal. A pid-only kill (the old behavior) never reached the
 *  foreground child because non-interactive bash does not forward
 *  SIGINT while waiting on a job — it just swallows it. Falls back to
 *  signaling the child alone on Windows / when the group is gone. */
export function signalTermSession(s: TermSession, sig: NodeJS.Signals): void {
    const pid = s.child.pid;
    if (!pid) return;
    if (!isWindows() && s.detached) {
        try {
            process.kill(-pid, sig);
            return;
        } catch {
            /* group already reaped, or platform refused — fall through */
        }
    }
    try {
        s.child.kill(sig);
    } catch {
        /* already dead — the close event follows */
    }
}

/** Terminate a session: group SIGTERM first so foreground children die
 *  with their shell (a pid-only SIGTERM orphans them). */
function killTermTree(s: TermSession): void {
    signalTermSession(s, "SIGTERM");
}

/** Group-signal a RAW one-shot child (the exec path spawns `bash -c …`
 *  detached on POSIX for the same reason sessions are). Same fallback
 *  ladder as signalTermSession. */
export function killChildGroup(child: ChildProcess, sig: NodeJS.Signals = "SIGTERM"): void {
    const pid = child.pid;
    if (!pid) return;
    if (!isWindows()) {
        try {
            process.kill(-pid, sig);
            return;
        } catch {
            /* group gone — fall through */
        }
    }
    try {
        child.kill(sig);
    } catch {
        /* already dead */
    }
}

/** Prune closed/expired sessions; hard-cap concurrent sessions. */
export function pruneTermSessions(): void {
    const now = Date.now();
    for (const [id, s] of sessions) {
        if (now - s.createdAt > SESSION_TTL_MS || (s.closed && s.listeners.size === 0)) {
            try {
                if (!s.closed) killTermTree(s);
            } catch {
                /* ignore */
            }
            sessions.delete(id);
        }
    }
    while (sessions.size > MAX_SESSIONS) {
        const oldest = [...sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
        if (!oldest) break;
        try {
            if (!oldest.closed) killTermTree(oldest);
        } catch {
            /* ignore */
        }
        sessions.delete(oldest.id);
    }
}

/** Spawn a new persistent session and register it. */
export async function startTermSession(
    kind: "shell" | "python",
    cwd: string
): Promise<TermSession | { error: string }> {
    let cmd: string;
    let args: string[];
    let label: string;
    if (kind === "python") {
        const interpreter = await findInterpreter();
        cmd = interpreter;
        args = ["-i"];
        label = "python";
    } else {
        const shell = shellCommand();
        cmd = shell.cmd;
        args = shell.args;
        label = shell.label;
    }

    let child: ChildProcess;
    const detached = !isWindows();
    try {
        // detached (POSIX): the session leads its own process group so a
        // group signal reaches foreground commands without ever hitting the
        // dev server itself. Windows has no process groups — plain spawn.
        child = spawn(/* turbopackIgnore: true */ cmd, args, {
            cwd,
            env: process.env,
            detached,
        });
    } catch (err) {
        return {error: `Failed to launch ${label}: ${(err as Error).message}`};
    }

    const session: TermSession = {
        id: randomUUID(),
        kind,
        child,
        detached,
        cwd,
        createdAt: Date.now(),
        closed: false,
        exitCode: null,
        history: [],
        listeners: new Set(),
    };
    sessions.set(session.id, session);

    // POSIX shell sessions: install a no-op SIGINT trap so a GROUP-wide
    // Ctrl+C (signalTermSession) interrupts the foreground command but
    // leaves the shell itself alive — verified empirically: without the
    // trap, non-interactive bash (no TTY → no job control) dies with the
    // command; with `trap 'true' INT` it catches the signal, the child
    // (default disposition) dies, and the session keeps executing. The
    // trap is silent ('true' prints nothing) and does not affect SIGTERM,
    // which still terminates the session on kill/prune.
    if (kind === "shell" && detached) {
        try {
            session.child.stdin?.write("trap 'true' INT\n");
        } catch {
            /* stdin closed instantly — session will error out anyway */
        }
    }

    child.stdout?.on("data", (c: Buffer) => pushToSession(session, c.toString("utf-8")));
    child.stderr?.on("data", (c: Buffer) => pushToSession(session, c.toString("utf-8")));
    child.on("error", (err) => pushToSession(session, `\n[spawn error] ${err.message}\n`));
    child.on("close", (code) => closeTermSession(session, code));

    return session;
}

/** Wrap a source/cleanup pair into a standard SSE Response. */
export function sseResponse(
    source: (send: (data: string) => void, done: () => void) => () => void
): Response {
    const encoder = new TextEncoder();
    let cleanup: () => void = () => {
    };
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (data: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    /* stream closed — ignore */
                }
            };
            cleanup = source(send, () => {
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            });
        },
        cancel() {
            cleanup();
        },
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
