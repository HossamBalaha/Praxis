import {type ChildProcess, spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {findInterpreter} from "@/lib/python-interpreter";
import {CONSOLE_KERNEL_PY} from "@/lib/console-kernel";
import {RUN_TMP_ROOT} from "@/lib/scripts";

/**
 * server-side state for the persistent Python console,
 * shared by the /api/console route actions.
 *
 * A session is one long-lived `python -u kernel.py` process whose
 * stdin/stdout speak the JSON-lines protocol defined in
 * console-kernel.ts. Only ONE submission may be in flight per session
 * (`busy`); its events are routed through `onLine` to the SSE response
 * of the exec request.
 *
 * Sessions live on globalThis (survives dev-mode module reloads, same
 * pattern as term-sessions.ts), are capped (MAX_SESSIONS), and are
 * pruned after IDLE_TTL_MS without any request. The kernel script is
 * written once per process to the OS temp dir and reused.
 */

export interface ConsoleVariables {
    name: string;
    type: string;
    value: string;
}

export interface ConsoleSession {
    id: string;
    child: ChildProcess;
    cwd: string;
    interpreter: string;
    figDir: string;
    createdAt: number;
    lastUsedAt: number;
    closed: boolean;
    /** True while a submission is executing (one at a time). */
    busy: boolean;
    /** Monotonic submission counter — the protocol's `id`. */
    seq: number;
    /** The in-flight exec's line handler (set by /api/console exec). */
    onLine: ((obj: Record<string, unknown>) => void) | null;
}

interface ConsoleRegistry {
    sessions: Map<string, ConsoleSession>;
    kernelPath: string | null;
}

const GLOBAL_KEY = "__praxis_console_registry__";

const MAX_SESSIONS = 3;
/** Idle TTL — a session with no request for this long is killed. */
export const IDLE_TTL_MS = 20 * 60_000;

function getRegistry(): ConsoleRegistry {
    const g = globalThis as unknown as { [k: string]: unknown };
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {sessions: new Map(), kernelPath: null} as ConsoleRegistry;
    }
    return g[GLOBAL_KEY] as ConsoleRegistry;
}

/** Write the kernel script once per process; reuse afterwards. */
function kernelPath(): string {
    const reg = getRegistry();
    if (reg.kernelPath && fs.existsSync(reg.kernelPath)) return reg.kernelPath;
    // Same RUN_TMP_ROOT the docker-compose volume mounts — the kernel
    // script rides the existing persistent tmp infrastructure.
    const dir = path.join(RUN_TMP_ROOT, "_console-kernel");
    fs.mkdirSync(dir, {recursive: true});
    const p = path.join(dir, "kernel.py");
    fs.writeFileSync(p, CONSOLE_KERNEL_PY, "utf-8");
    reg.kernelPath = p;
    return p;
}

export function getConsoleSession(id: string): ConsoleSession | undefined {
    return getRegistry().sessions.get(id);
}

/** Kill + forget a session (safe to call twice). */
export function killConsoleSession(s: ConsoleSession): void {
    if (!s.closed) {
        s.closed = true;
        try {
            s.child.kill("SIGKILL");
        } catch { /* already dead */
        }
    }
    getRegistry().sessions.delete(s.id);
}

/** Prune dead + idle sessions; enforce the hard session cap. */
export function pruneConsoleSessions(): void {
    const reg = getRegistry();
    const now = Date.now();
    for (const s of [...reg.sessions.values()]) {
        if (s.closed || now - s.lastUsedAt > IDLE_TTL_MS) {
            killConsoleSession(s);
        }
    }
    while (reg.sessions.size > MAX_SESSIONS) {
        const oldest = [...reg.sessions.values()].sort(
            (a, b) => a.lastUsedAt - b.lastUsedAt
        )[0];
        if (!oldest) break;
        killConsoleSession(oldest);
    }
}

/** Spawn a new persistent console session. */
export async function startConsoleSession(
    cwd: string,
    interpreterOverride?: string
): Promise<ConsoleSession | { error: string }> {
    const interpreter = await findInterpreter(interpreterOverride);
    const id = randomUUID();
    // Figures land in the SAME run-tmp tree the /api/figure route
    // already serves from (RUN_TMP_ROOT/<id>/<name>) — zero new
    // file-serving code, and the 24 h sweep cleans up after us.
    const figDir = path.join(RUN_TMP_ROOT, id);
    try {
        fs.mkdirSync(figDir, {recursive: true});
    } catch {
        return {error: "Could not create the console figure directory."};
    }

    let child: ChildProcess;
    try {
        child = spawn(interpreter, ["-u", kernelPath()], {
            cwd,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                PYTHONIOENCODING: "utf-8",
                MPLBACKEND: "Agg",
                PRAXIS_CONSOLE_FIG_DIR: figDir,
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
    } catch (err) {
        return {error: `Failed to launch ${interpreter}: ${(err as Error).message}`};
    }

    const session: ConsoleSession = {
        id,
        child,
        cwd,
        interpreter,
        figDir,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        closed: false,
        busy: false,
        seq: 0,
        onLine: null,
    };

    // ── stdout: line-buffered JSON protocol dispatch ────────────────
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let obj: Record<string, unknown>;
            try {
                obj = JSON.parse(line) as Record<string, unknown>;
            } catch {
                continue; // non-protocol noise — ignore
            }
            session.onLine?.(obj);
        }
    });
    // Kernel errors (tracebacks from the protocol itself) surface as an
    // end event for the in-flight submission, then close the session.
    child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        if (session.busy && session.onLine) {
            session.onLine({
                id: session.seq,
                event: "stderr",
                text: `[kernel] ${text}`,
            });
        }
    });
    child.on("error", (err) => {
        session.closed = true;
        session.onLine?.({
            id: session.seq,
            event: "end",
            ok: false,
            error: `Kernel process error: ${err.message}`,
            figures: [],
            variables: [],
            died: true,
        });
        getRegistry().sessions.delete(session.id);
    });
    child.on("close", (code) => {
        if (session.closed) return;
        session.closed = true;
        session.onLine?.({
            id: session.seq,
            event: "end",
            ok: false,
            error: `The console session ended (exit code ${code ?? "unknown"}).`,
            figures: [],
            variables: [],
            died: true,
        });
        getRegistry().sessions.delete(session.id);
    });

    getRegistry().sessions.set(id, session);
    pruneConsoleSessions();
    return session;
}
