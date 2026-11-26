import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {
    clearTermHistory,
    EXEC_TIMEOUT_MS,
    getTermSession,
    isWindows,
    killChildGroup,
    listTermSessions,
    pruneTermSessions,
    resolveCwd,
    shellCommand,
    signalTermSession,
    sseResponse,
    startTermSession,
} from "@/lib/term-sessions";

/**
 * POST /api/term — the integrated terminal's control endpoint.
 *
 *   { action: "start", kind: "shell"|"python", cwd? }
 *       → { ok, id, kind, cwd, shell }   (then GET /api/term/stream?id=…)
 *   { action: "write", id, input }
 *       → writes to the session's stdin (commands, REPL lines)
 *   { action: "kill", id }
 *       → terminates the session
 * { action: "clear", id }
 *       → wipes the session's output backlog (Ctrl+L), so the SSE
 *         replay after a re-attach stays consistent with the cleared
 *         client scrollback
 *   { action: "exec", cmd, cwd? }
 *       → ONE-SHOT command streamed back as SSE (out chunks + exit)
 *
 * Sessions are persistent child processes (cmd.exe / $SHELL, or
 * `python -i` for the REPL) registered in the shared lib registry so
 * /api/term/stream can attach to them. No PTY is involved — the
 * client renders its own prompt line — which keeps the feature
 * dependency-free and working under both the Node and Bun standalone
 * servers. Localhost IDE: same local trust level as /api/run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let body: {
        action?: string;
        kind?: string;
        cwd?: string;
        cmd?: string;
        id?: string;
        input?: string;
        signal?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    // ─── List live sessions ────────────────────────────────────────
    // Session-restore support: the client persists terminal session
    // ids across page reloads (the server sessions themselves survive
    // the reload); "list" lets it validate which ids are still alive
    // before re-attaching. No child handles are exposed — ids + labels
    // + liveness only.
    if (body.action === "list") {
        const shellLabel = shellCommand().label;
        const live = listTermSessions().map((s) => ({
            id: s.id,
            kind: s.kind,
            cwd: s.cwd,
            shell: s.kind === "shell" ? shellLabel : "python",
            closed: s.closed,
            exitCode: s.exitCode,
            createdAt: s.createdAt,
        }));
        return NextResponse.json({sessions: live});
    }

    // ─── One-shot exec → SSE stream ────────────────────────────────
    if (body.action === "exec") {
        const cmd = (body.cmd ?? "").trim();
        if (!cmd) {
            return NextResponse.json({error: "Empty command."}, {status: 400});
        }
        const cwd = resolveCwd(body.cwd);
        const shell = shellCommand();
        const args = isWindows() ? ["/c", cmd] : ["-c", cmd];
        let child;
        try {
            // detached (POSIX): own process group so the timeout/abort kill
            // below takes out the command the shell is running, not just the
            // shell (which would orphan it).
            child = spawn(shell.cmd, args, {cwd, env: process.env, detached: !isWindows()});
        } catch (err) {
            return NextResponse.json(
                {error: `Failed to launch shell: ${(err as Error).message}`},
                {status: 500}
            );
        }
        const started = Date.now();
        const timeout = setTimeout(() => {
            killChildGroup(child);
        }, EXEC_TIMEOUT_MS);
        return sseResponse((send, done) => {
            const onData = (c: Buffer) => send(JSON.stringify({out: c.toString("utf-8")}));
            child.stdout?.on("data", onData);
            child.stderr?.on("data", onData);
            child.on("error", (err) => {
                send(JSON.stringify({error: err.message}));
            });
            child.on("close", (code) => {
                clearTimeout(timeout);
                send(JSON.stringify({exit: code, durationMs: Date.now() - started}));
                done();
            });
            return () => {
                clearTimeout(timeout);
                killChildGroup(child);
            };
        });
    }

    // ─── Write to a session's stdin ────────────────────────────────
    if (body.action === "write") {
        const session = getTermSession(body.id ?? "");
        if (!session) {
            return NextResponse.json({error: "Unknown session id."}, {status: 404});
        }
        if (session.closed) {
            return NextResponse.json({error: "Session has exited."}, {status: 409});
        }
        const input = typeof body.input === "string" ? body.input : "";
        if (!input) {
            return NextResponse.json({error: "Empty input."}, {status: 400});
        }
        try {
            session.child.stdin?.write(input);
        } catch {
            return NextResponse.json({error: "Write failed."}, {status: 500});
        }
        return NextResponse.json({ok: true});
    }

    // ─── Clear a session's scrollback (Ctrl+L) ──────────
    if (body.action === "clear") {
        const session = getTermSession(body.id ?? "");
        if (!session) {
            return NextResponse.json({error: "Unknown session id."}, {status: 404});
        }
        clearTermHistory(session);
        return NextResponse.json({ok: true});
    }

    // ─── Signal a session (Ctrl+C) ───────────────────────
    if (body.action === "signal") {
        const session = getTermSession(body.id ?? "");
        if (!session) {
            return NextResponse.json({error: "Unknown session id."}, {status: 404});
        }
        if (session.closed) {
            return NextResponse.json({error: "Session has exited."}, {status: 409});
        }
        const sig = body.signal === "SIGTERM" ? "SIGTERM" : "SIGINT";
        // Group-wide signal (see signalTermSession): SIGINT cancels the
        // running foreground command the way Ctrl+C does in a real terminal
        // — the shell AND its foreground child both receive it, the session
        // survives. SIGTERM is the harder stop for stubborn processes.
        signalTermSession(session, sig);
        return NextResponse.json({ok: true, signal: sig});
    }

    // ─── Kill a session ────────────────────────────────────────────
    if (body.action === "kill") {
        const session = getTermSession(body.id ?? "");
        if (!session) {
            return NextResponse.json({error: "Unknown session id."}, {status: 404});
        }
        try {
            if (!session.closed) signalTermSession(session, "SIGTERM");
        } catch {
            /* ignore */
        }
        return NextResponse.json({ok: true});
    }

    // ─── Start a session (default action) ──────────────────────────
    pruneTermSessions();
    const kind: "shell" | "python" =
        body.kind === "python" ? "python" : "shell";
    const cwd = resolveCwd(body.cwd);
    const session = await startTermSession(kind, cwd);
    if ("error" in session) {
        return NextResponse.json({error: session.error}, {status: 500});
    }
    return NextResponse.json({
        ok: true,
        id: session.id,
        kind: session.kind,
        cwd: session.cwd,
        shell: kind === "python" ? "python" : shellCommand().label,
    });
}
