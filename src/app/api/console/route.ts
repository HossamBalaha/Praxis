import {NextRequest, NextResponse} from "next/server";
import path from "node:path";
import fs from "node:fs";
import {
    type ConsoleSession,
    getConsoleSession,
    killConsoleSession,
    pruneConsoleSessions,
    startConsoleSession,
} from "@/lib/console-sessions";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/console (— the persistent Python console)
 *
 * Body / actions:
 *   { action: "start", cwd?: string, interpreter?: string }
 *       → { ok, id, interpreter }          spawns a new kernel session
 *   { action: "exec", id, code, mode?: "eval"|"exec", timeoutSeconds? }
 *       → SSE stream of the submission's events (stdout / stderr /
 *         figure / end), then the stream closes. One submission at a
 *         time per session — concurrent execs get a 409.
 *   { action: "inspect", id|session, expr?: string, deep?: number }
 *       → { ok, vars | var | error }        ONE kernel round-trip in
 *                                         the guarded INSPECT mode —
 *                                         never evaluates user code
 *   { action: "tasks", id|session }
 *       → { ok, tasks: [{ id, name, state, awaiting?, stack? }], note? }
 *                                         asyncio introspection of the
 *                                         namespace (best-effort — the
 *                                         kernel is synchronous)
 *   { action: "restart", id?, cwd?, interpreter? }
 *       → { ok, id }                        kills the old session (if
 *                                           any), starts a fresh one
 *   { action: "status", id } → { ok, alive }
 *   { action: "stop", id }   → { ok }       kill the session
 *
 * The SSE events intentionally use the SAME shape as /api/run events
 * (start / stdout / stderr / figure / end) so the client-side
 * rendering logic mirrors the Output panel's, plus an `end.variables`
 * snapshot for the console's Vars view.
 *
 * A stuck submission cannot be interrupted from inside Python, so the
 * exec watchdog KILLS the whole session at the timeout and reports
 * died:true — the client shows a notice and auto-starts a fresh
 * session on the next submission.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TIMEOUT_MS = 60_000;
const TIMEOUT_LIMIT_MS = 600_000;

/** Resolve + validate the requested working directory (console cwd).
 * also accepts a project-relative FOLDER SLUG (the form
 *  the notebook view has) — resolved against getScriptsRoot. */
function bodyCwd(body: ConsoleBody): string {
    if (typeof body.folder === "string" && body.folder) {
        const folderName = deslugify(body.folder);
        if (folderName) {
            const abs = path.join(getScriptsRoot(), folderName);
            try {
                if (fs.statSync(abs).isDirectory()) return abs;
            } catch {
                /* fall through */
            }
        }
    }
    return resolveCwd(typeof body.cwd === "string" ? body.cwd : undefined);
}

function resolveCwd(requested?: string): string {
    if (!requested || typeof requested !== "string") return getScriptsRoot();
    const abs = path.resolve(requested);
    try {
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) return abs;
    } catch {
        /* fall through */
    }
    return getScriptsRoot();
}

interface ConsoleBody {
    action?: unknown;
    id?: unknown;
    code?: unknown;
    mode?: unknown;
    cwd?: unknown;
    /** project folder SLUG — notebook kernels pass this so
     *  cells run with the notebook's folder as cwd. */
    folder?: unknown;
    /** INSPECT mode: guarded dotted/index path like "a.b[0]" or "df". */
    expr?: unknown;
    /** INSPECT mode: >0 attaches up to 20 children of the target. */
    deep?: unknown;
    /** alias for `id` — the inspect/tasks contract names it `session`. */
    session?: unknown;
    interpreter?: unknown;
    timeoutSeconds?: unknown;
}

export async function POST(request: NextRequest) {
    let body: ConsoleBody;
    try {
        body = (await request.json()) as ConsoleBody;
    } catch {
        return NextResponse.json(
            {ok: false, error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const action = typeof body.action === "string" ? body.action : "";
    pruneConsoleSessions();

    // ── start ────────────────────────────────────────────────────────
    if (action === "start") {
        const cwd = bodyCwd(body);
        const session = await startConsoleSession(
            cwd,
            typeof body.interpreter === "string" && body.interpreter
                ? body.interpreter
                : undefined
        );
        if ("error" in session) {
            return NextResponse.json({ok: false, error: session.error}, {status: 500});
        }
        return NextResponse.json({
            ok: true,
            id: session.id,
            interpreter: session.interpreter,
        });
    }

    // ── restart ──────────────────────────────────────────────────────
    if (action === "restart") {
        if (typeof body.id === "string" && body.id) {
            const old = getConsoleSession(body.id);
            if (old) killConsoleSession(old);
        }
        const cwd = bodyCwd(body);
        const session = await startConsoleSession(
            cwd,
            typeof body.interpreter === "string" && body.interpreter
                ? body.interpreter
                : undefined
        );
        if ("error" in session) {
            return NextResponse.json({ok: false, error: session.error}, {status: 500});
        }
        return NextResponse.json({
            ok: true,
            id: session.id,
            interpreter: session.interpreter,
            restarted: true,
        });
    }

    // ── status / stop ────────────────────────────────────────────────
    if (action === "status" || action === "stop") {
        if (typeof body.id !== "string" || !body.id) {
            return NextResponse.json({ok: false, error: "Missing session id."}, {status: 400});
        }
        const session = getConsoleSession(body.id);
        if (action === "stop") {
            if (session) killConsoleSession(session);
            return NextResponse.json({ok: true});
        }
        return NextResponse.json({ok: true, alive: !!session && !session.closed});
    }

    // ── interrupt ─────────────────────────────────────────
    // Ctrl+C for the console. Sends SIGINT to the kernel process:
    //   • while a submission runs → KeyboardInterrupt inside exec,
    //     reported as a normal error result; the SESSION SURVIVES
    //   • while idle → swallowed by the kernel's readline guard
    // This replaces the old story where the only way out of a stuck
    // submission was the watchdog KILLING the whole session.
    if (action === "interrupt") {
        if (typeof body.id !== "string" || !body.id) {
            return NextResponse.json({ok: false, error: "Missing session id."}, {status: 400});
        }
        const session = getConsoleSession(body.id);
        if (!session || session.closed) {
            return NextResponse.json({ok: false, error: "The console session has ended."}, {status: 410});
        }
        try {
            session.child.kill("SIGINT");
            session.lastUsedAt = Date.now();
            return NextResponse.json({ok: true, interrupted: session.busy});
        } catch (err) {
            return NextResponse.json(
                {ok: false, error: `Failed to signal the kernel: ${(err as Error).message}`},
                {status: 500}
            );
        }
    }

    // ── inspect / tasks (ONE kernel round-trip, plain JSON) ─────────
    // Both are NON-code kernel modes: the route writes the payload to
    // the kernel stdin and waits for the single matching `kind` reply,
    // mirroring how exec routes protocol lines through session.onLine —
    // but resolving a promise instead of an SSE stream. The same
    // one-submission-at-a-time rule applies (busy → 409).
    if (action === "inspect" || action === "tasks") {
        const id =
            typeof body.id === "string" && body.id
                ? body.id
                : typeof body.session === "string" && body.session
                    ? body.session
                    : "";
        if (!id) {
            return NextResponse.json(
                {ok: false, error: "Missing session id."},
                {status: 400}
            );
        }
        const session: ConsoleSession | undefined = getConsoleSession(id);
        if (!session || session.closed) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "The console session has ended — it restarts on the next submission.",
                    dead: true,
                },
                {status: 410}
            );
        }
        if (session.busy) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "A submission is still running in this console — wait for it to finish or restart the session.",
                },
                {status: 409}
            );
        }

        const kind: "inspect" | "tasks" = action === "inspect" ? "inspect" : "tasks";
        const payload: Record<string, unknown> = {mode: kind};
        if (action === "inspect") {
            if (typeof body.expr === "string" && body.expr) {
                payload.expr = body.expr;
            }
            payload.deep =
                typeof body.deep === "number" &&
                Number.isInteger(body.deep) &&
                body.deep > 0
                    ? Math.min(body.deep, 5)
                    : 0;
        }

        session.seq += 1;
        session.busy = true;
        session.lastUsedAt = Date.now();
        const seq = session.seq;

        // Watchdog: a repr that hangs (locked display, giant object) cannot
        // be interrupted from Python — kill the whole session at the
        // timeout, exactly like a stuck exec submission.
        const reply = await new Promise<Record<string, unknown> | null>(
            (resolve) => {
                let watchdog: ReturnType<typeof setTimeout> | null = null;
                const finish = (obj: Record<string, unknown> | null) => {
                    if (watchdog) clearTimeout(watchdog);
                    session.onLine = null;
                    resolve(obj);
                };
                session.onLine = (obj) => {
                    if (obj.id === seq && obj.kind === kind) {
                        finish(obj);
                    } else if (obj.event === "exit") {
                        session.closed = true;
                        finish(null);
                    } else if (obj.event === "end") {
                        // Kernel/session death — console-sessions.ts synthesizes
                        // an `end` event on close; nothing will ever answer us.
                        finish(null);
                    }
                };
                watchdog = setTimeout(() => {
                    killConsoleSession(session);
                    finish(null);
                }, DEFAULT_TIMEOUT_MS);
                try {
                    const line = JSON.stringify({id: seq, ...payload}) + "\n";
                    session.child.stdin?.write(line, "utf-8");
                } catch {
                    finish(null);
                }
            }
        );

        session.busy = false;
        session.lastUsedAt = Date.now();

        if (!reply) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "The kernel did not answer in time — the session was killed and restarts on the next submission.",
                    died: true,
                },
                {status: 500}
            );
        }
        if (typeof reply.error === "string") {
            return NextResponse.json({ok: false, error: reply.error});
        }
        if (kind === "inspect") {
            if (Array.isArray(reply.vars)) {
                return NextResponse.json({ok: true, vars: reply.vars});
            }
            if (reply.var && typeof reply.var === "object") {
                return NextResponse.json({ok: true, var: reply.var});
            }
            return NextResponse.json({ok: true, vars: []});
        }
        return NextResponse.json({
            ok: true,
            tasks: Array.isArray(reply.tasks) ? reply.tasks : [],
            note: typeof reply.note === "string" ? reply.note : undefined,
        });
    }

    // ── exec (SSE) ───────────────────────────────────────────────────
    if (action === "exec") {
        const id = typeof body.id === "string" ? body.id : "";
        const code = typeof body.code === "string" ? body.code : "";
        const mode = body.mode === "exec" ? "exec" : "eval";
        if (!id || !code.trim()) {
            return NextResponse.json(
                {ok: false, error: "Missing session id or empty code."},
                {status: 400}
            );
        }
        const session: ConsoleSession | undefined = getConsoleSession(id);
        if (!session || session.closed) {
            return NextResponse.json(
                {ok: false, error: "The console session has ended — it restarts on the next submission.", dead: true},
                {status: 410}
            );
        }
        if (session.busy) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "A submission is still running in this console — wait for it to finish or restart the session."
                },
                {status: 409}
            );
        }

        const timeoutMs = Math.min(
            typeof body.timeoutSeconds === "number" && body.timeoutSeconds > 0
                ? body.timeoutSeconds * 1000
                : DEFAULT_TIMEOUT_MS,
            TIMEOUT_LIMIT_MS
        );

        session.seq += 1;
        session.busy = true;
        session.lastUsedAt = Date.now();
        const seq = session.seq;
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            start(controller) {
                let finished = false;
                let watchdog: ReturnType<typeof setTimeout> | null = null;

                const send = (obj: Record<string, unknown>) => {
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                    } catch {
                        /* client disconnected */
                    }
                };

                send({
                    type: "start",
                    runId: session.id,
                    submission: seq,
                    interpreter: session.interpreter,
                });

                const finish = (endObj: Record<string, unknown>) => {
                    if (finished) return;
                    finished = true;
                    if (watchdog) clearTimeout(watchdog);
                    session.busy = false;
                    session.onLine = null;
                    session.lastUsedAt = Date.now();
                    send(endObj);
                    try {
                        controller.close();
                    } catch { /* already closed */
                    }
                };

                // Route protocol lines for THIS submission to the SSE stream.
                session.onLine = (obj) => {
                    const evt = obj.event as string | undefined;
                    if (obj.id !== seq && evt !== "exit") return;
                    if (evt === "stdout" || evt === "stderr") {
                        send({type: evt, text: obj.text as string});
                    } else if (evt === "figure") {
                        send({
                            type: "figure",
                            name: obj.name as string,
                            url: `/api/figure/${encodeURIComponent(session.id)}/${encodeURIComponent(obj.name as string)}`,
                        });
                    } else if (evt === "end") {
                        send({
                            type: "end",
                            ok: !!obj.ok,
                            error: (obj.error as string | null) ?? null,
                            died: !!obj.died,
                            figures: obj.figures ?? [],
                            variables: obj.variables ?? [],
                            runId: session.id,
                            submission: seq,
                        });
                        finish({type: "end", ok: !!obj.ok}); // stream terminator
                    } else if (evt === "exit") {
                        session.closed = true;
                    }
                };

                // Watchdog: a stuck submission kills the whole session.
                watchdog = setTimeout(() => {
                    send({
                        type: "stderr",
                        text: `\n[console] submission exceeded ${Math.round(timeoutMs / 1000)} s — the session was killed (a stuck exec cannot be interrupted).\n`,
                    });
                    killConsoleSession(session);
                    finish({
                        type: "end",
                        ok: false,
                        error: "Console submission timed out.",
                        died: true,
                        figures: [],
                        variables: [],
                    });
                }, timeoutMs);

                // Feed the submission to the kernel.
                try {
                    const payload = JSON.stringify({id: seq, code, mode}) + "\n";
                    session.child.stdin?.write(payload, "utf-8");
                } catch {
                    finish({
                        type: "end",
                        ok: false,
                        error: "The console kernel is not accepting input — restart the session.",
                        died: true,
                        figures: [],
                        variables: [],
                    });
                }
            },
            cancel() {
                // Client disconnected mid-submission. The kernel itself keeps
                // running (state persistence is the whole point) — the next
                // status/exec call re-attaches. Just detach the line handler.
                session.busy = false;
                session.onLine = null;
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    }

    return NextResponse.json(
        {ok: false, error: "Unknown action. Use start | exec | inspect | tasks | interrupt | restart | status | stop."},
        {status: 400}
    );
}
