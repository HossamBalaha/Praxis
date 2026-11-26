import {NextRequest} from "next/server";
import path from "node:path";
import {type ChildProcess, spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {realpathSync} from "node:fs";
import {resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/debug — pdb over SSE with TRUE step control.
 *
 * Two POST shapes share this route:
 *
 * 1. START a session (the response is a Server-Sent Events stream):
 *
 *    { folder, file, breakpoints?: number[], stdin?: string, interpreter?: string }
 *
 *    Runs `python -u -m pdb <script>`, sets the breakpoints and CONTINUES.
 *    When the debugger stops (breakpoint hit, or a step command), the
 *    stream emits a `stopped` event and the session WAITS — it does NOT
 *    auto-continue. Advancing the session happens through shape 2.
 *
 * 2. ADVANCE a session (the response is plain JSON):
 *
 *    { sessionId: <string>, command: "continue" | "next" | "step" | "return" | "quit" }
 *
 *    Maps to the pdb commands c / n / s / r / q, delivered to the paused
 *    child. Only valid while the session is STOPPED (HTTP 409 otherwise)
 *    — a command while the script is mid-run would interleave with pdb's
 *    own prompt protocol and corrupt the stream.
 *
 * 2b. SELECT A STACK FRAME (plain JSON):
 *
 *    { sessionId: <string>, frame: <bottom-up stack index> }
 *
 *    pdb switches frames with `up`/`down`, so the route computes the
 *    delta from the current frame and sends repeated commands, then
 *    re-captures the stack (`w`), the new frame's locals and every
 *    watch, and emits a `frame` event on the SSE stream with the same
 *    payload shape as `stopped`. Only valid while STOPPED (409 else).
 *
 * 2c. SET WATCH EXPRESSIONS (plain JSON):
 *
 *    { sessionId: <string>, watch: ["expr", ...] }
 *
 *    Replaces the session's watch list (each expression is evaluated
 *    with pdb's `p (expr)` at every subsequent stop and rides the
 *    `stopped`/`frame` events as `watches`). While the session is
 *    parked at a stop the new list is evaluated immediately and the
 *    values are returned in the JSON response; mid-run it simply
 *    applies from the next stop.
 *
 * SSE events (one JSON object per message):
 *   data: {"type":"start","sessionId":…,"interpreter":…,"folder":…,"file":…,"breakpoints":[…]}
 *   data: {"type":"stdout","text":…}          — raw pdb/script output, live
 *   data: {"type":"stderr","text":…}
 *   data: {"type":"stopped","line":5,"frame":"<module>","file":"script.py","locals":"{'x': 1,…}",
 *          "stack":[{"index":0,"function":"<module>","file":"script.py","line":12,"current":false},…],
 *          "currentFrame":2,"watches":[{"expression":"x+1","value":"2"}]}
 *     — stack/currentFrame/watches are OPTIONAL additions (older clients
 *       ignore them); `stack` is ordered bottom-up (index 0 = oldest frame,
 *       last = innermost), `currentFrame` is the bottom-up index of pdb's
 *       selected frame. `file` per frame is a basename (or a synthetic
 *       pdb name like "<string>") with the true on-disk casing — pdb
 *       lowercases paths on Windows, which canonifyPdbPath() undoes.
 *   data: {"type":"frame", …same shape as stopped…}
 *     — emitted after a frame-selection POST; clients that don't know the
 *       event simply ignore it (backward compatible by design).
 *   data: {"type":"resumed","command":"next"} — a POST command was applied
 *   data: {"type":"timeout","message":…}
 *   data: {"type":"error","message":…}
 *   data: {"type":"end","exitCode":0,"killed":false}
 *
 * ── Session registry ───────────────────────────────────────────────
 *
 * Sessions live in a module-level Map keyed by sessionId (surfaced in the
 * `start` event). The local, single-user IDE runs one server process, so
 * the map is the natural meeting point between the SSE stream (producer)
 * and the command POSTs (consumer). Registry entries are removed on:
 * process exit, client disconnect (the stream's cancel()), the `quit`
 * command, and every timeout below.
 *
 * ── Robustness ─────────────────────────────────────────────────────
 *
 * - TOTAL_TIMEOUT_MS: hard cap on a whole session (script + waiting).
 * - IDLE_TIMEOUT_MS: cap on sitting at a stop with no user command —
 *   auto-quits so a forgotten paused pdb can't hold the child forever
 *   (the old route auto-continued, so its 120 s cap was enough; pausing
 *   needs an idle-specific one).
 * - Client disconnect (SSE cancel) kills the child immediately.
 * - MAX_STOPS guards a pathological stop-loop (a breakpoint inside a
 *   `while True:` with step spam).
 * - The pending-output buffer is tail-capped so a chatty script can't
 *   grow it unboundedly.
 * - Windows: the child is spawned with an ARGUMENT ARRAY (never a shell
 *   string) and every path goes through node:path — no POSIX-only APIs.
 *   child.kill("SIGKILL"/"SIGTERM") is safe cross-platform: Node maps
 *   signals to TerminateProcess on Windows. pdb's `w` output arrives
 *   LOWERCASED there (bdb's canonic() applies os.path.normcase), so
 *   frame files are re-cased against the disk before emission — see
 *   canonifyPdbPath().
 */

export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

/** Hard cap on the TOTAL lifetime of one debug session (run + pauses). */
const TOTAL_TIMEOUT_MS = 10 * 60_000;
/** Cap on waiting for a step command while paused at a stop. */
const IDLE_TIMEOUT_MS = 5 * 60_000;
/** Cap on the pending pdb output buffer (keep the TAIL — prompt
 *  detection is endsWith-based). */
const MAX_PENDING_OUTPUT_CHARS = 1_000_000;
/** Guard against a pathological stop loop (breakpoint in a hot loop). */
const MAX_STOPS = 1000;

const PDB_PROMPT = "(Pdb) ";

/** The step commands the UI's pdb control bar sends. */
type DebugCommand = "continue" | "next" | "step" | "return" | "quit";

/** pdb's own command for each UI action. */
const PDB_COMMANDS: Record<DebugCommand, string> = {
    continue: "c",
    next: "n",
    step: "s",
    return: "r",
    quit: "q",
};

/** End-of-program markers pdb prints (lower-cased before matching). */
const PROGRAM_END_MARKERS = [
    "the program finished",
    "the program exited",
    "will be restarted",
    "post mortem",
];

/**
 * Parse a stop location out of pdb's response: a line like
 * `> /abs/path/script.py(5)<module>()`. Returns the 1-indexed line and
 * the frame (function) name, or null when the response isn't a stop.
 */
function parseStop(resp: string): { line: number; frame: string } | null {
    // The frame name sits between (line) and the trailing "()" — e.g.
    // "<module>", "run_analysis", or "Foo.method". [^\n()] covers all of
    // them; a missing frame (weird pdb builds) degrades to "<unknown>".
    const m = /^> [^\n]+\((\d+)\)([^\n()]*)\(\)/m.exec(resp);
    if (!m) return null;
    const line = parseInt(m[1], 10);
    if (!Number.isFinite(line) || line < 1) return null;
    const frame = (m[2] ?? "").trim() || "<unknown>";
    return {line, frame};
}

/** True when pdb's response says the program is done (or post-mortem). */
function isProgramEnd(resp: string): boolean {
    const lower = resp.toLowerCase();
    return PROGRAM_END_MARKERS.some((marker) => lower.includes(marker));
}

/* ── Call-stack + watch helpers (exported for unit tests) ─────────── */

/** One frame of the pdb call stack, as parsed from `where` output. */
export interface PdbFrame {
    /** Bottom-up index: 0 = oldest frame (usually "<module>"), last = innermost. */
    index: number;
    /** Function name as pdb prints it, e.g. "inner", "<module>", "run". */
    function: string;
    /** File as pdb printed it — usually an absolute path; normalized to a
     *  basename (or a synthetic name like "<string>") when emitted, with
     *  the true on-disk casing restored (pdb lowercases on Windows). */
    file: string;
    /** 1-indexed line inside that file. */
    line: number;
    /** True when this is pdb's SELECTED frame (the `>` marker in `w` output). */
    current: boolean;
}

/** One evaluated watch expression from a stop. */
export interface PdbWatchValue {
    expression: string;
    /** pdb's `p (expr)` output on success. */
    value?: string;
    /** Error text when the expression failed (pdb's `*** …` prefix stripped). */
    error?: string;
}

/**
 * Parse pdb's `w`/`where` output into an ordered stack. pdb prints the
 * OLDEST frame first and marks the selected frame with a `>` prefix;
 * every frame line looks like `  /abs/path/file.py(12)func()` (synthetic
 * frames use names like `<string>`). `->` source lines and prompts never
 * match the frame grammar. Returns bottom-up frames plus the selected
 * frame's index, or null when nothing parseable came back (older/newer
 * pdb builds — the panel then simply hides the stack list).
 */
export function parsePdbWhere(resp: string): { frames: PdbFrame[]; current: number } | null {
    const frames: PdbFrame[] = [];
    for (const rawLine of resp.split("\n")) {
        // `>` prefix = selected frame, two spaces = every other frame.
        const m = /^([> ])\s*(.+?)\((\d+)\)([^\n()]*?)\(\)\s*$/.exec(rawLine);
        if (!m) continue;
        const line = parseInt(m[3], 10);
        if (!Number.isFinite(line) || line < 1) continue;
        frames.push({
            index: frames.length,
            function: (m[4] ?? "").trim() || "<unknown>",
            file: m[2],
            line,
            current: m[1] === ">",
        });
    }
    if (frames.length === 0) return null;
    let current = frames.findIndex((f) => f.current);
    if (current < 0) {
        // No `>` marker (shouldn't happen) — the innermost frame is the
        // sensible fallback.
        current = frames.length - 1;
        frames[current].current = true;
    }
    return {frames, current};
}

/** Basename of a pdb-printed file path (handles both separators and
 *  keeps synthetic names like "<string>" intact). */
function fileBase(p: string): string {
    const norm = p.replace(/\\/g, "/");
    const idx = norm.lastIndexOf("/");
    return idx >= 0 ? norm.slice(idx + 1) : p;
}

/** realpathSync.native results, cached per pdb-printed path (stdlib
 *  frames repeat at every stop; the cache keeps re-casing free). */
const pdbPathCaseCache = new Map<string, string>();

function realpathNativeCached(p: string): string {
    const hit = pdbPathCaseCache.get(p);
    if (hit !== undefined) return hit;
    // Soft cap: distinct frame files are few, but a long-lived server
    // must not grow this without bound across many debug sessions.
    if (pdbPathCaseCache.size > 1024) pdbPathCaseCache.clear();
    const real = realpathSync.native(p);
    pdbPathCaseCache.set(p, real);
    return real;
}

/**
 * Restore the true on-disk casing of a pdb-printed file path. pdb runs
 * every frame filename through bdb's canonic() — abspath() plus
 * os.path.normcase() — and normcase LOWERCASES the whole path on
 * Windows (it is the identity on POSIX), so `w` output there says
 * `d:\…\smokestack.py` even when the file on disk is `SmokeStack.py`,
 * and the wire contract ("basename of the real file") breaks.
 * realpathSync.native resolves through the OS (NTFS lookups are
 * case-insensitive) and returns the REAL casing of every component.
 * Synthetic pdb names ("<string>", "<stdin>") never touch the fs, and
 * a path that no longer exists passes through as pdb printed it.
 * `realpath`/`platform` are injectable so the Windows branch is
 * unit-testable from POSIX CI.
 */
export function canonifyPdbPath(
    raw: string,
    realpath: (p: string) => string = realpathNativeCached,
    platform: NodeJS.Platform = process.platform
): string {
    if (platform !== "win32") return raw; // normcase is a no-op on POSIX
    if (!raw || raw.startsWith("<")) return raw; // synthetic pdb frame name
    try {
        return realpath(raw);
    } catch {
        return raw; // deleted/renamed since pdb printed it — keep pdb's text
    }
}

/** Normalize parsed `w` frames for the wire: pdb-printed absolute path
 *  → true-case basename (full paths would leak absolute home dirs
 *  into the UI; lowercased ones would lie about the file's name). */
function stackFramesForWire(
    parsed: { frames: PdbFrame[]; current: number }
): { frames: PdbFrame[]; current: number } {
    return {
        frames: parsed.frames.map((f) => ({
            ...f,
            file: fileBase(canonifyPdbPath(f.file)),
        })),
        current: parsed.current,
    };
}

/**
 * Sanitize a client-provided watch list: strings only, newlines
 * flattened (a newline could smuggle a second pdb command into the
 * `p (…)` write), trimmed, de-duplicated, capped at 32 entries of
 * 200 characters each. Anything else comes back as [].
 */
export function sanitizeWatchExpressions(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const out: string[] = [];
    for (const raw of input) {
        if (typeof raw !== "string") continue;
        const expr = raw.replace(/[\r\n]+/g, " ").trim();
        if (!expr || expr.length > 200) continue;
        if (!out.includes(expr)) out.push(expr);
        if (out.length >= 32) break;
    }
    return out;
}

/* ── The registry + the minimal session surface commands can touch ── */

interface PdbSession {
    id: string;
    folderName: string;
    fileName: string;
    /** True between a `stopped` event and the next command. */
    readonly paused: boolean;

    /**
     * Deliver a UI command to the paused session. Returns false when the
     * session isn't actually parked at a stop (the caller answers 409) —
     * a mid-run command would interleave with pdb's prompt round-trip.
     * Also false while an inspection (frame switch / watch evaluation) is
     * using the prompt channel.
     */
    deliverCommand(cmd: DebugCommand): boolean;

    /**
     * Select a stack frame: sends pdb `up`/`down` repeated for the delta,
     * then re-captures stack + locals + watches and emits a `frame` SSE
     * event. Only valid while parked at a stop ({ok:false} otherwise).
     */
    switchFrame(target: number): Promise<{ ok: boolean; error?: string }>;

    /**
     * Replace the session's watch list. While parked, the new list is
     * evaluated immediately and returned; mid-run it applies from the
     * next stop.
     */
    setWatches(exprs: string[]): Promise<{
        ok: boolean;
        error?: string;
        values?: PdbWatchValue[];
    }>;

    /** Kill + clear timers + registry removal. Idempotent. */
    dispose(reason: "total" | "idle" | "disconnect" | "exit"): void;
}

/** Module-level registry: sessionId → live session. */
const sessions = new Map<string, PdbSession>();

export async function POST(request: NextRequest) {
    let body: {
        folder?: string;
        file?: string;
        breakpoints?: number[];
        stdin?: string;
        interpreter?: string;
        sessionId?: string;
        command?: string;
        /** Target bottom-up stack index (frame-selection POST shape). */
        frame?: unknown;
        /** Watch expressions to evaluate at every stop (start + set shapes). */
        watch?: unknown;
    };
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({error: "Invalid JSON body."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    // ── Shape 2: advance / inspect an existing session ────────────────
    if (typeof body.sessionId === "string" && body.sessionId) {
        return handleCommand(body.sessionId, body);
    }

    // ── Shape 1: start a new session (SSE response) ───────────────────
    const {folder, file, breakpoints, stdin} = body;
    if (!folder || !file) {
        return new Response(
            JSON.stringify({
                error: "Body must include 'folder' and 'file' slugs.",
            }),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    const resolved = await resolveScriptPath(folder, file);
    if (!resolved) {
        return new Response(
            JSON.stringify({error: "File not found inside python_scripts/."}),
            {status: 404, headers: {"Content-Type": "application/json"}}
        );
    }

    // Validate breakpoints (must be positive integers, ascending).
    const bps = (breakpoints ?? [])
        .filter((n) => Number.isInteger(n) && n > 0)
        .sort((a, b) => a - b);

    const interpreter = await findInterpreter(body.interpreter);
    const encoder = new TextEncoder();
    const sessionId = randomUUID();
    let child: ChildProcess | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            const send = (obj: Record<string, unknown>) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
                    );
                } catch {
                    // Controller closed — swallow.
                }
            };

            // ── pdb stdin/stdout protocol state ─────────────────────────
            // Single-waiter promise: at most one prompt wait is outstanding
            // at a time; when pdb emits `(Pdb) `, the waiter resolves with
            // everything printed since the last prompt.
            let pendingOutput = "";
            let currentWaiter: ((text: string) => void) | null = null;
            let currentWaiterReject: ((err: Error) => void) | null = null;
            let processExited = false;
            let killed = false;
            let finalized = false;
            /** The outstanding "paused, waiting for a user command" waiter. */
            let commandWaiter: ((cmd: DebugCommand) => void) | null = null;
            /** True between a `stopped` event and the next command. */
            let paused = false;
            let totalTimer: ReturnType<typeof setTimeout> | null = null;
            let idleTimer: ReturnType<typeof setTimeout> | null = null;

            // ── Call-stack + watch session state ─────────────────────────
            /** Live watch expressions (updated via the watch POST shape). */
            let watchExprs: string[] = sanitizeWatchExpressions(body.watch);
            /** Last parsed `where` stack (frames basename-normalized, bottom-up). */
            let lastStack: { frames: PdbFrame[]; current: number } | null = null;
            /** Bottom-up index of pdb's currently selected frame. */
            let curFrameIndex: number | null = null;
            /** True while an inspection (frame switch / watch evaluation) is
             *  using the pdb prompt channel. The driver is parked at its
             *  commandWaiter then — deliverCommand refuses step commands and
             *  the idle timer re-arms so a quit can't interleave with it. */
            let inspecting = false;

            const waitForPrompt = (): Promise<string> => {
                return new Promise<string>((resolve, reject) => {
                    if (processExited) {
                        reject(new Error("pdb process exited before prompt."));
                        return;
                    }
                    // Prompt already pending in the buffer (rare) → resolve now.
                    if (pendingOutput.endsWith(PDB_PROMPT)) {
                        const response = pendingOutput.slice(0, -PDB_PROMPT.length);
                        pendingOutput = "";
                        resolve(response);
                        return;
                    }
                    currentWaiter = resolve;
                    currentWaiterReject = reject;
                });
            };

            const sendCommand = (cmd: string): Promise<string> => {
                if (processExited) {
                    return Promise.reject(new Error("pdb process exited."));
                }
                try {
                    child?.stdin?.write(cmd + "\n");
                } catch (err) {
                    return Promise.reject(err as Error);
                }
                return waitForPrompt();
            };

            const flushPromptIfReady = () => {
                if (!currentWaiter) return;
                if (!pendingOutput.endsWith(PDB_PROMPT)) return;
                const response = pendingOutput.slice(0, -PDB_PROMPT.length);
                pendingOutput = "";
                const w = currentWaiter;
                currentWaiter = null;
                currentWaiterReject = null;
                w(response);
            };

            const finalize = (exitCode: number | null) => {
                if (finalized) return;
                finalized = true;
                // Resolve any pending waiter with what we have so it doesn't
                // hang forever.
                if (currentWaiter) {
                    const w = currentWaiter;
                    currentWaiter = null;
                    currentWaiterReject = null;
                    w(pendingOutput);
                    pendingOutput = "";
                }
                // Same for a paused command wait: resolve with quit so the
                // driver loop exits instead of leaking the promise.
                if (commandWaiter) {
                    const w = commandWaiter;
                    commandWaiter = null;
                    w("quit");
                }
                send({
                    type: "end",
                    exitCode: exitCode ?? (killed ? -1 : 0),
                    killed,
                });
                try {
                    controller.close();
                } catch { /* already closed */
                }
                closed = true;
            };

            const clearTimers = () => {
                if (totalTimer) {
                    clearTimeout(totalTimer);
                    totalTimer = null;
                }
                if (idleTimer) {
                    clearTimeout(idleTimer);
                    idleTimer = null;
                }
            };
            const dispose = (reason: "total" | "idle" | "disconnect" | "exit") => {
                clearTimers();
                if (!processExited) {
                    // Only mark killed when WE ended it — a natural exit keeps
                    // the honest exit code on the `end` event.
                    killed = reason !== "exit";
                    try {
                        child?.kill("SIGKILL");
                    } catch { /* already dead */
                    }
                }
                sessions.delete(sessionId);
            };

            /** Arm the pause-idle timer: auto-quit the paused session when
             *  no command arrives within IDLE_TIMEOUT_MS. */
            const armIdleTimer = () => {
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    // Never quit mid-inspection — resolving the command waiter
                    // now would race the inspection's prompt wait. Re-arm and
                    // quit on the next tick instead.
                    if (inspecting) {
                        armIdleTimer();
                        return;
                    }
                    send({
                        type: "timeout",
                        message: `No debugger command for ${Math.round(IDLE_TIMEOUT_MS / 1000)}s — quitting the paused session.`,
                    });
                    if (commandWaiter) {
                        const w = commandWaiter;
                        commandWaiter = null;
                        w("quit");
                    }
                }, IDLE_TIMEOUT_MS);
            };

            /* ── Inspections (run while the driver is parked at a stop) ──
             *
             * While the driver awaits its commandWaiter, pdb itself is
             * parked at a prompt, so the session may freely talk to the
             * prompt channel (sendCommand) to inspect state WITHOUT
             * advancing execution: `w` (stack), `p locals()` and `p (expr)`
             * (watches), `up`/`down` (frame selection). Exactly one
             * inspection runs at a time (`inspecting` serializes against
             * both the step commands and other inspections). */

            /** Evaluate every watch in the CURRENT frame via `p (expr)`. */
            const evaluateWatches = async (): Promise<PdbWatchValue[]> => {
                const out: PdbWatchValue[] = [];
                for (const expr of watchExprs) {
                    try {
                        const resp = await sendCommand(`p (${expr})`);
                        const text = resp.replace(/\n+$/, "").trim();
                        if (text.startsWith("***")) {
                            // pdb's own error echo, e.g. `*** NameError: name 'a' is not defined`.
                            out.push({expression: expr, error: text.replace(/^\*\*\*\s*/, "")});
                        } else {
                            out.push({expression: expr, value: text});
                        }
                    } catch (err) {
                        out.push({expression: expr, error: (err as Error).message});
                    }
                }
                return out;
            };

            /** Capture stack + locals for the CURRENTLY selected frame via
             *  `w` + `p locals()` (used by switchFrame; failures degrade). */
            const captureFrameContext = async (): Promise<{
                stack: { frames: PdbFrame[]; current: number } | null;
                locals: string;
            }> => {
                let stack: { frames: PdbFrame[]; current: number } | null = null;
                try {
                    const parsed = parsePdbWhere(await sendCommand("w"));
                    // Normalize files to true-case basenames for the wire (full
                    // paths leak absolute home dirs into the UI; pdb lowercases
                    // them on Windows).
                    stack = parsed ? stackFramesForWire(parsed) : null;
                } catch {
                    // Stack unavailable this stop — the event simply omits it.
                }
                let localsText = "";
                try {
                    localsText = (await sendCommand("p locals()")).replace(/\n+$/, "").trim();
                } catch (err) {
                    localsText = `<error capturing locals: ${(err as Error).message}>`;
                }
                return {stack, locals: localsText};
            };

            /** Select a stack frame (bottom-up index): `up`/`down` repeated
             *  for the delta, then re-capture stack + locals + watches and
             *  emit a `frame` SSE event with the refreshed stop snapshot. */
            const switchFrame = async (
                target: number
            ): Promise<{ ok: boolean; error?: string }> => {
                if (!paused || !commandWaiter) {
                    return {
                        ok: false,
                        error: "The debugger is not stopped at a breakpoint right now.",
                    };
                }
                if (inspecting) {
                    return {ok: false, error: "The debugger is busy capturing the frame."};
                }
                if (lastStack === null || curFrameIndex === null) {
                    return {ok: false, error: "No call stack is available at this stop."};
                }
                if (
                    !Number.isInteger(target) ||
                    target < 0 ||
                    target >= lastStack.frames.length
                ) {
                    return {
                        ok: false,
                        error: `Frame index out of range (0..${lastStack.frames.length - 1}).`,
                    };
                }
                if (target === curFrameIndex) return {ok: true};

                inspecting = true;
                try {
                    // Bottom-up indexing: `up` walks toward the OLDER frames
                    // (index decreases), `down` back toward the innermost one.
                    const delta = curFrameIndex - target;
                    const cmd = delta > 0 ? "up" : "down";
                    let lastResp = "";
                    for (let i = 0; i < Math.abs(delta); i++) {
                        try {
                            lastResp = await sendCommand(cmd);
                        } catch {
                            return {ok: false, error: "Frame switch failed while talking to pdb."};
                        }
                    }

                    // Refresh the whole stop snapshot for the new frame.
                    const {stack, locals} = await captureFrameContext();
                    const watches = await evaluateWatches();

                    let line: number | null = null;
                    let fn: string | null = null;
                    let file: string | null = null;
                    if (stack) {
                        const sel = stack.frames[stack.current];
                        line = sel.line;
                        fn = sel.function;
                        file = sel.file;
                        lastStack = stack;
                        curFrameIndex = stack.current;
                    } else {
                        // `w` failed — fall back to the last up/down response and
                        // the target frame's recorded location.
                        const hit = parseStop(lastResp);
                        const fallback = lastStack.frames[target];
                        line = hit ? hit.line : fallback.line;
                        fn = hit ? hit.frame : fallback.function;
                        file = fallback.file;
                        curFrameIndex = target;
                        lastStack = {
                            frames: lastStack.frames.map((f, i) => ({
                                ...f,
                                current: i === target,
                            })),
                            current: target,
                        };
                    }

                    // Same payload shape as `stopped` (new event type — old
                    // clients simply don't know it).
                    send({
                        type: "frame",
                        sessionId,
                        line,
                        frame: fn,
                        file: file ?? resolved.fileName,
                        locals,
                        ...(lastStack ? {stack: lastStack.frames, currentFrame: lastStack.current} : {}),
                        ...(watches.length > 0 ? {watches} : {}),
                    });
                    return {ok: true};
                } finally {
                    inspecting = false;
                }
            };

            /** Replace the watch list; evaluate immediately when parked so
             *  the POST response can paint values without waiting for the
             *  next stop. */
            const setWatches = async (
                exprs: string[]
            ): Promise<{ ok: boolean; error?: string; values?: PdbWatchValue[] }> => {
                watchExprs = exprs;
                if (!paused || !commandWaiter || inspecting) {
                    // Mid-run (or busy) — the list applies from the next stop.
                    return {ok: true};
                }
                inspecting = true;
                try {
                    return {ok: true, values: await evaluateWatches()};
                } finally {
                    inspecting = false;
                }
            };

            const session: PdbSession = {
                id: sessionId,
                folderName: resolved.folderName,
                fileName: resolved.fileName,
                get paused() {
                    return paused;
                },
                deliverCommand(cmd: DebugCommand): boolean {
                    // Only meaningful while parked at a stop AND the driver is
                    // actually waiting (a stop that's still capturing locals has
                    // no waiter yet — the UI can't click that fast, but a stray
                    // double-click could). An in-flight inspection owns the
                    // prompt channel and would garble a concurrent step command.
                    if (!paused || !commandWaiter || inspecting) return false;
                    const w = commandWaiter;
                    commandWaiter = null;
                    w(cmd);
                    return true;
                },
                switchFrame,
                setWatches,
                dispose,
            };

            send({
                type: "start",
                sessionId,
                interpreter,
                folder: resolved.folderName,
                file: resolved.fileName,
                breakpoints: bps,
            });

            try {
                child = spawn(
                    interpreter,
                    // ARGUMENT ARRAY — never a shell string. This is the Windows
                    // contract: no shell parsing, no quoting pitfalls.
                    ["-u", "-m", "pdb", resolved.absPath],
                    {
                        cwd: path.dirname(resolved.absPath),
                        env: {
                            ...process.env,
                            PYTHONUNBUFFERED: "1",
                            PYTHONIOENCODING: "utf-8",
                        },
                        stdio: ["pipe", "pipe", "pipe"],
                    }
                );
            } catch (err) {
                send({
                    type: "error",
                    message: `Failed to launch ${interpreter}: ${(err as Error).message}`,
                });
                send({type: "end", exitCode: -1, killed: false});
                try {
                    controller.close();
                } catch { /* */
                }
                closed = true;
                return;
            }

            // Register the session so the command POSTs can reach it.
            sessions.set(sessionId, session);

            totalTimer = setTimeout(() => {
                send({
                    type: "timeout",
                    message: `Debug session exceeded ${Math.round(TOTAL_TIMEOUT_MS / 1000)}s.`,
                });
                killed = true;
                try {
                    child?.kill("SIGKILL");
                } catch { /* already dead */
                }
                // The child's close handler finalizes the stream.
            }, TOTAL_TIMEOUT_MS);

            child.stdout?.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                // Stream everything pdb prints as a stdout event so the UI can
                // show the raw pdb interaction in real time.
                send({type: "stdout", text});
                // Tail-cap the pending buffer — a script whose output outruns
                // pdb's prompt used to grow it unboundedly (and re-emit it in
                // full on the next prompt).
                pendingOutput += text;
                if (pendingOutput.length > MAX_PENDING_OUTPUT_CHARS) {
                    pendingOutput =
                        pendingOutput.slice(-MAX_PENDING_OUTPUT_CHARS);
                }
                flushPromptIfReady();
            });

            child.stderr?.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                send({type: "stderr", text});
            });

            child.on("close", (code) => {
                processExited = true;
                dispose("exit");
                finalize(code);
            });

            child.on("error", (err) => {
                processExited = true;
                dispose("exit");
                send({type: "error", message: err.message});
                finalize(null);
            });

            // ── Drive the pdb session ───────────────────────────────────
            // All session logic is async; we don't await it here because
            // start must return immediately so the SSE stream can begin.
            void (async () => {
                try {
                    // Wait for pdb's initial prompt (it prints the script's
                    // first line and a `(Pdb) ` prompt before running anything).
                    await waitForPrompt();

                    // Set breakpoints via `b <absPath>:<line>`.
                    for (const line of bps) {
                        try {
                            await sendCommand(`b ${resolved.absPath}:${line}`);
                        } catch (err) {
                            send({
                                type: "stderr",
                                text: `[statcomp] failed to set breakpoint at line ${line}: ${(err as Error).message}\n`,
                            });
                        }
                    }

                    // Send the initial `c` (continue). If the user supplied
                    // stdin, append it to the same write so the script's
                    // input calls can read it right after pdb consumes `c\n`.
                    // pdb reads commands line-by-line so the `c\n` is consumed
                    // first; the rest stays in the OS pipe buffer for the script.
                    if (processExited) return;
                    try {
                        if (typeof stdin === "string" && stdin.length > 0) {
                            const trailer = stdin.endsWith("\n") ? "" : "\n";
                            child?.stdin?.write(`c\n${stdin}${trailer}`);
                        } else {
                            child?.stdin?.write("c\n");
                        }
                    } catch (err) {
                        send({
                            type: "error",
                            message: `Failed to write to pdb stdin: ${(err as Error).message}`,
                        });
                        return;
                    }

                    // Wait for the next prompt — a breakpoint hit or program end.
                    let resp = await waitForPrompt();

                    // Loop: PAUSE at each stop and wait for a UI command
                    // (continue | next | step | return | quit). Bail on
                    // end-of-program or the MAX_STOPS guard.
                    for (let stops = 0; stops < MAX_STOPS; stops++) {
                        if (isProgramEnd(resp)) break;

                        const hit = parseStop(resp);
                        if (!hit) {
                            // Not a stop (a pdb info message) — continue to the next
                            // real stop.
                            try {
                                resp = await sendCommand("c");
                            } catch {
                                break;
                            }
                            continue;
                        }

                        // Capture locals via pdb's `p` command.
                        let localsText = "";
                        try {
                            const localsResp = await sendCommand("p locals()");
                            localsText = localsResp.replace(/\n+$/, "").trim();
                        } catch (err) {
                            localsText = `<error capturing locals: ${(err as Error).message}>`;
                        }

                        // Capture the call stack via `w` (bottom-up frames + the
                        // selected-frame marker) so the panel can render — and
                        // switch — frames. Frames carry true-case basename files.
                        try {
                            const parsed = parsePdbWhere(await sendCommand("w"));
                            lastStack = parsed ? stackFramesForWire(parsed) : null;
                        } catch {
                            lastStack = null;
                        }
                        curFrameIndex = lastStack ? lastStack.current : null;

                        // Evaluate every watch in the (fresh) selected frame.
                        const watchValues =
                            watchExprs.length > 0 ? await evaluateWatches() : [];

                        // THE STOP: emit and wait for the user's next command.
                        // `stack`/`currentFrame`/`watches` are OPTIONAL additions —
                        // clients that predate them keep working unchanged.
                        send({
                            type: "stopped",
                            sessionId,
                            line: hit.line,
                            frame: hit.frame,
                            file: resolved.fileName,
                            locals: localsText,
                            ...(lastStack ? {stack: lastStack.frames, currentFrame: lastStack.current} : {}),
                            ...(watchValues.length > 0 ? {watches: watchValues} : {}),
                        });
                        paused = true;
                        armIdleTimer();
                        const cmd = await new Promise<DebugCommand>((resolve) => {
                            commandWaiter = resolve;
                        });
                        commandWaiter = null;
                        if (idleTimer) clearTimeout(idleTimer);
                        idleTimer = null;
                        paused = false;

                        if (cmd === "quit") break;

                        send({type: "resumed", sessionId, command: cmd});
                        try {
                            resp = await sendCommand(PDB_COMMANDS[cmd]);
                        } catch {
                            break;
                        }
                    }

                    // Quit pdb. If the program already exited, `q` may fail to
                    // get a prompt — fine, the close handler will fire.
                    try {
                        await sendCommand("q");
                    } catch {
                        // Process exited before we could quit — fine.
                    }
                } catch (err) {
                    if (!processExited) {
                        send({
                            type: "error",
                            message: `Debug session error: ${(err as Error).message}`,
                        });
                    }
                } finally {
                    // Best-effort cleanup. The close handler will finalize.
                    clearTimers();
                    sessions.delete(sessionId);
                    try {
                        if (!processExited) child?.kill("SIGTERM");
                    } catch { /* */
                    }
                }
            })();
        },
        cancel() {
            // Client disconnected — kill the child so we don't leak a Python
            // process running under pdb for up to the total cap. The registry
            // entry is dropped by dispose; the child's close handler
            // finalizes the stream.
            const s = sessions.get(sessionId);
            if (s) {
                s.dispose("disconnect");
                return;
            }
            try {
                child?.kill("SIGKILL");
            } catch { /* already dead */
            }
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

/* ── Command dispatch (shape 2) ──────────────────────────────────── */

const VALID_COMMANDS: ReadonlySet<string> = new Set([
    "continue",
    "next",
    "step",
    "return",
    "quit",
]);

function json(obj: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {"Content-Type": "application/json"},
    });
}

async function handleCommand(
    sessionId: string,
    body: { command?: unknown; frame?: unknown; watch?: unknown }
): Promise<Response> {
    const session = sessions.get(sessionId);
    if (!session) {
        return json(
            {ok: false, error: "Unknown or finished debug session."},
            404
        );
    }

    // ── Frame selection shape: { sessionId, frame: <bottom-up index> } ──
    if (body.frame !== undefined) {
        if (typeof body.frame !== "number" || !Number.isInteger(body.frame)) {
            return json(
                {ok: false, error: "'frame' must be an integer stack index."},
                400
            );
        }
        const result = await session.switchFrame(body.frame);
        if (!result.ok) {
            return json({ok: false, error: result.error}, 409);
        }
        // The refreshed stop snapshot arrives on the SSE stream as a
        // `frame` event; the JSON response just acknowledges the switch.
        return json({ok: true, sessionId, frame: body.frame}, 200);
    }

    // ── Watch shape: { sessionId, watch: ["expr", ...] } ──────────────
    if (body.watch !== undefined) {
        const exprs = sanitizeWatchExpressions(body.watch);
        const result = await session.setWatches(exprs);
        if (!result.ok) {
            return json({ok: false, error: result.error}, 409);
        }
        // `values` only while parked at a stop — mid-run the list simply
        // applies from the next stop (the client shows the expressions,
        // values fill in when the next `stopped` event lands).
        return json(
            {
                ok: true,
                sessionId,
                watch: exprs,
                ...(result.values && result.values.length > 0
                    ? {values: result.values}
                    : {}),
            },
            200
        );
    }

    // ── Step-command shape (unchanged) ────────────────────────────────
    const command = body.command;
    if (typeof command !== "string" || !VALID_COMMANDS.has(command)) {
        return json(
            {
                ok: false,
                error: `Invalid command. Use one of: ${[...VALID_COMMANDS].join(", ")}.`,
            },
            400
        );
    }
    if (!session.deliverCommand(command as DebugCommand)) {
        return json(
            {
                ok: false,
                error: "The debugger is not stopped at a breakpoint right now.",
            },
            409
        );
    }
    return json({ok: true, sessionId, command}, 200);
}
