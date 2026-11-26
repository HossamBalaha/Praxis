import {NextRequest} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {type ChildProcess, spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createRunTmpDir, listFigures, readRunMetadata, resolveScriptPath,} from "@/lib/scripts";
import {wrapScript} from "@/lib/python-prelude";
import {findInterpreter} from "@/lib/python-interpreter";
import {openStdins, runMeta, runningChildren, stdinTimeoutResets, stopRequested} from "@/lib/run-registry";
// the non-Python language runtimes (node / tsx / MATLAB /
// Octave / Rscript / bash / java / gcc / g++ / ruby / php / go).
import {resolveLanguageRun} from "@/lib/language-runtimes";
// platform-aware inline `-c` payload limit — Windows caps the
// whole CreateProcess command line at 32 767 chars, so scripts beyond
// ~28 KB must run from a temp file there
// uv_spawn). Linux keeps the 100 KB MAX_ARG_STRLEN guard.
import {MAX_INLINE_SCRIPT_BYTES} from "@/lib/spawn-limits";

/**
 * POST /api/run  (Server-Sent Events stream)
 *
 * Body: { folder: <slug>, file: <slug>, stdin?: string }
 *
 * Executes the requested Python file with the system Python interpreter
 * and streams stdout + stderr back as SSE events so the UI updates in
 * real time. A hard timeout (default 60 s) is enforced so a runaway
 * script cannot hang the UI.
 *
 * The script is wrapped in a small prelude that captures matplotlib
 * figures into a per-run temp directory; the final event lists the
 * figure URLs so the UI can render them inline.
 *
 * Events emitted (one per SSE message):
 *   data: {"type":"start","runId":"...","interpreter":"python3"}\n\n
 *   data: {"type":"stdout","text":"..."}\n\n
 *   data: {"type":"stderr","text":"..."}\n\n
 *   data: {"type":"figure","url":"/api/figure/...","name":"figure_001.png"}\n\n
 *   data: {"type":"end","ok":true,"exitCode":0,"durationMs":123,"figures":[...]}\n\n
 *   data: {"type":"error","message":"..."}\n\n  (spawn-level failure)
 *
 * The runId is also registered in a global Map of running PIDs so
 * /api/stop can kill it on demand.
 */
export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

const MAX_OUTPUT_BYTES = 2_000_000; // 2 MB default stdout/stderr cap (per stream)
const MAX_OUTPUT_BYTES_LIMIT = 16_000_000; // client overrides may not exceed this
const TIMEOUT_MS = 60_000; // hard kill at 60s default
const TIMEOUT_LIMIT_MS = 600_000; // client overrides may not exceed 10 min
const STOP_CHECK_MS = 250; // how often to flush accumulated output
// Mid-run artifact polling (figure/dataframe streaming): the prelude
// writes each file the moment the script saves it, so a ~750 ms readdir
// pass is enough to surface figures long before process exit. The
// double-poll size-stability check below needs at least one interval
// to confirm a file is complete, so shorter values just burn cycles.
const ARTIFACT_POLL_MS = 750;
// Artifacts worth streaming mid-run: prelude figure captures (PNG/JPG/
// GIF/SVG/WebP) and DataFrame HTML reprs. The variables.json metadata
// stays exit-only (the prelude writes it in atexit).
const RUN_ARTIFACT_RE = /^(?:figure_\d+\.(?:png|jpg|jpeg|svg|gif|webp)|dataframe_\d+\.html)$/i;

/** Environment keys a client may never inject: they can
 * hijack the dynamic linker or interpreter startup of any child we
 * spawn. Everything else is the own process to configure. */
const BLOCKED_ENV_KEYS = /^(?:LD_|DYLD_)|^(?:PYTHONHOME|PYTHONSTARTUP)$/;

/** see src/lib/spawn-limits.ts — Windows caps the entire
 * CreateProcess command line at 32 767 chars, so the inline `-c`
 * payload must stay far smaller there than on Linux (the old fixed
 * 100 KB guard spawned fine on Linux and failed with ENAMETOOLONG /
 * uv_spawn on Windows). Larger scripts run from a temp file inside
 * the run dir on BOTH platforms. */
const ARGV_SCRIPT_LIMIT_BYTES = MAX_INLINE_SCRIPT_BYTES;

function formatBytes(n: number): string {
    if (n >= 1_000_000) {
        const mb = n / 1_000_000;
        return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(n / 1000))} KB`;
}

/**
 * the generic (non-Python) run stream: the SAME SSE event
 * shape (start / stdout / stderr / error / end), stop registry,
 * timeout and output caps as the Python path, minus the python-only
 * extras (prelude, figures, variables, coverage, dataframes).
 */
function genericRunStream(cfg: {
    command: string;
    argv: string[];
    cwd: string;
    language: string;
    folderName: string;
    fileName: string;
    runId: string;
    stdin?: string;
    interactive: boolean;
    env?: Record<string, string>;
    args: string[];
    timeoutMs: number;
    maxOutputBytes: number;
    note?: string;
}): Response {
    const encoder = new TextEncoder();
    // Hoisted so the ReadableStream's cancel can reach the child.
    let child: ChildProcess | undefined;
    const stream = new ReadableStream({
        start(controller) {
            let finalized = false;
            let streamClosed = false;
            const send = (obj: Record<string, unknown>) => {
                if (streamClosed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                } catch {
                    streamClosed = true;
                }
            };

            const started = Date.now();
            send({
                type: "start",
                runId: cfg.runId,
                interpreter: cfg.command,
                folder: cfg.folderName,
                file: cfg.fileName,
                startedAt: started,
            });

            const childEnv = {
                ...process.env,
                ...(cfg.env && typeof cfg.env === "object"
                    ? Object.fromEntries(
                        Object.entries(cfg.env).filter(
                            ([k, v]) => typeof v === "string" && !BLOCKED_ENV_KEYS.test(k)
                        )
                    )
                    : {}),
            };

            try {
                child = spawn(cfg.command, cfg.argv, {
                    cwd: cfg.cwd,
                    env: childEnv,
                    stdio: ["pipe", "pipe", "pipe"],
                });
            } catch (err) {
                send({type: "error", message: `Failed to launch ${cfg.command}: ${(err as Error).message}`});
                send({type: "end", ok: false, exitCode: -1, durationMs: 0, figures: [], runId: cfg.runId});
                try {
                    controller.close();
                } catch { /* already closed */
                }
                return;
            }

            const proc = child;
            if (!proc) return;
            runningChildren.set(cfg.runId, proc);
            runMeta.set(cfg.runId, {
                label: `${cfg.folderName}/${cfg.fileName}`,
                kind: "run",
                startedAt: started,
                pid: proc.pid,
                interpreter: cfg.command,
            });

            // stdin: write any supplied text, then keep open for interactive
            // runs (the /api/run-input route can answer prompts live).
            if (typeof cfg.stdin === "string" && cfg.stdin.length > 0) {
                try {
                    proc.stdin?.write(cfg.stdin);
                    if (!cfg.stdin.endsWith("\n")) proc.stdin?.write("\n");
                } catch { /* ignore */
                }
            }
            if (cfg.interactive && proc.stdin) {
                openStdins.set(cfg.runId, proc.stdin);
                proc.stdin.on("error", () => openStdins.delete(cfg.runId));
            } else {
                try {
                    proc.stdin?.end();
                } catch { /* ignore */
                }
            }

            let pendingStdout = "";
            let pendingStderr = "";
            let stdoutTotal = 0;
            let stderrTotal = 0;
            let truncated = false;
            let killed = false;
            let flushTimer: ReturnType<typeof setTimeout> | null = null;
            const scheduleFlush = () => {
                if (flushTimer) return;
                flushTimer = setTimeout(() => {
                    flushTimer = null;
                    if (pendingStdout) {
                        send({type: "stdout", text: pendingStdout});
                        pendingStdout = "";
                    }
                    if (pendingStderr) {
                        send({type: "stderr", text: pendingStderr});
                        pendingStderr = "";
                    }
                }, STOP_CHECK_MS);
            };
            const capHit = (which: "stdout" | "stderr", text: string) => {
                if (truncated) return true;
                const bytes = Buffer.byteLength(text, "utf-8");
                if (which === "stdout") stdoutTotal += bytes;
                else stderrTotal += bytes;
                const total = which === "stdout" ? stdoutTotal : stderrTotal;
                if (total > cfg.maxOutputBytes) {
                    truncated = true;
                    send({
                        type: "stderr",
                        text: `\n[praxis] output truncated at ${formatBytes(cfg.maxOutputBytes)}.\n`
                    });
                    return true;
                }
                return false;
            };

            proc.stdout?.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                if (capHit("stdout", text)) return;
                pendingStdout += text;
                scheduleFlush();
            });
            proc.stderr?.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                if (capHit("stderr", text)) return;
                pendingStderr += text;
                scheduleFlush();
            });

            const timeoutHandle = setTimeout(() => {
                killed = true;
                // WHY the run died: the end event's `killed` flag is true
                // for BOTH a hard timeout and a user stop, so the client could
                // never tell them apart (the old "Timed out" pill branch was
                // dead). This stderr marker — sniffed by src/lib/run-format.ts
                // — is what lets the Output panel show "Timed out" while a
                // user stop keeps showing "Stopped".
                send({
                    type: "stderr",
                    text: `\n[praxis] run timed out after ${Math.round(cfg.timeoutMs / 1000)} s — the process was killed (hard timeout).\n`,
                });
                try {
                    child?.kill("SIGKILL");
                } catch { /* already dead */
                }
            }, cfg.timeoutMs);
            /* — interactive runs stay alive while the user keeps
           answering: every /api/run-input write re-arms this kill timer
           (a full fresh timeout window per answer), so a script blocked
           at input is never cut off mid-conversation. An abandoned
           session is still reaped after one idle window. */
            if (cfg.interactive) {
                stdinTimeoutResets.set(cfg.runId, () => {
                    clearTimeout(timeoutHandle);
                    timeoutHandle.refresh();
                });
            }

            const finalize = (code: number | null) => {
                if (finalized) return;
                finalized = true;
                clearTimeout(timeoutHandle);
                stdinTimeoutResets.delete(cfg.runId);
                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
                if (pendingStdout) {
                    send({type: "stdout", text: pendingStdout});
                    pendingStdout = "";
                }
                if (pendingStderr) {
                    send({type: "stderr", text: pendingStderr});
                    pendingStderr = "";
                }
                const wasStopped = stopRequested.has(cfg.runId);
                const finalKilled = killed || wasStopped;
                send({
                    type: "end",
                    ok: !finalKilled && code === 0,
                    exitCode: code ?? (finalKilled ? -1 : 0),
                    durationMs: Date.now() - started,
                    truncated,
                    killed: finalKilled,
                    // explicit timeout flag (the timeout marker above is
                    // the backwards-compatible channel the current client reads;
                    // this field lets future consumers skip the sniff).
                    timedOut: killed && !wasStopped,
                    interpreter: cfg.command,
                    figures: [],
                    stdoutBytes: stdoutTotal,
                    stderrBytes: stderrTotal,
                    runId: cfg.runId,
                });
                runningChildren.delete(cfg.runId);
                stopRequested.delete(cfg.runId);
                runMeta.delete(cfg.runId);
                openStdins.delete(cfg.runId);
                try {
                    controller.close();
                } catch { /* already closed */
                }
            };

            proc.on("close", (code) => finalize(code));
            proc.on("error", (err) => {
                const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
                send({
                    type: "error",
                    message: isNotFound
                        ? `"${cfg.command}" was not found on PATH — install it to run ${cfg.language} files.`
                        : `Failed to launch ${cfg.command}: ${err.message}`,
                });
                finalize(null);
            });
        },
        cancel() {
            try {
                child?.kill("SIGKILL");
            } catch { /* already dead */
            }
            runningChildren.delete(cfg.runId);
            stopRequested.delete(cfg.runId);
            runMeta.delete(cfg.runId);
            openStdins.delete(cfg.runId);
            stdinTimeoutResets.delete(cfg.runId);
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

export async function POST(request: NextRequest) {
    let body: {
        folder?: string;
        file?: string;
        stdin?: string;
        /** Extra argv to pass to the script (sys.argv[1:]). */
        args?: string[];
        /** Extra environment variables to set for this run only. */
        env?: Record<string, string>;
        /** If true, install a sys.settrace hook and write coverage.json. */
        traceCoverage?: boolean;
        /** If true, write variables.json at exit. */
        inspectVariables?: boolean;
        /** If true, capture printed DataFrames as HTML files. */
        captureDataframes?: boolean;
        /** If set, run only the cells in this 1-indexed inclusive range. */
        runCell?: { start: number; end: number };
        /** if set, run this raw source INSTEAD of the file's
         *  on-disk contents — the editor's "Run Selection in Python"
         *  action. folder/file still identify the file (cwd, history,
         *  output labeling) but the executed code is exactly this string. */
        code?: string;
        /** Manual interpreter path override (from Settings). */
        interpreter?: string;
        /** Hard timeout in seconds; defaults to 60. */
        runTimeoutSeconds?: number;
        /** Max total stdout+stderr bytes; defaults to 2_000_000. */
        maxOutputBytes?: number;
        /** — keep the child's stdin OPEN after any pre-supplied
         *  stdin is written, so /api/run-input can answer input calls
         *  while the script is running. The hard timeout above still
         *  applies; a run that ends with stdin open simply exits. */
        interactive?: boolean;
        /** — the language to run this file with. Defaults to
         *  "python" (the legacy behavior); "javascript" | "typescript" |
         *  "matlab" | "r" | "shell" | "java" | "c" | "cpp" route through
         *  the runtime registry (resolveLanguageRun). */
        language?: string;
    };
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({error: "Invalid JSON body."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    // Allow callers to override the hard timeout and output cap per-run,
    // clamped to server-side ceilings (the old code trusted
    // client values with no upper bound — a single request could ask for
    // a multi-day timeout or an unbounded output buffer).
    const effectiveTimeoutMs = Math.min(
        body.runTimeoutSeconds && body.runTimeoutSeconds > 0
            ? body.runTimeoutSeconds * 1000
            : TIMEOUT_MS,
        TIMEOUT_LIMIT_MS
    );
    const effectiveMaxBytes = Math.min(
        body.maxOutputBytes && body.maxOutputBytes > 1024
            ? body.maxOutputBytes
            : MAX_OUTPUT_BYTES,
        MAX_OUTPUT_BYTES_LIMIT
    );

    const {folder, file, stdin} = body;
    if (!folder || !file) {
        return new Response(
            JSON.stringify({
                error: "Body must include 'folder' and 'file' slugs.",
            }),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    // when the caller supplies raw `code` (Run Selection /
    // notebook cells) the on-disk file is NOT executed — it only provides
    // cwd + identity. Non-.py files (e.g. .ipynb) are therefore allowed
    // in that mode; plain file runs stay .py-only.
    const resolved = await resolveScriptPath(folder, file, {
        // non-Python languages accept every file kind (.js /
        // .ts / .m / .R / .sh / .java / .c / .cpp); Run Selection still
        // needs anyKind for its raw `code` (e.g. notebook cells).
        anyKind:
            (typeof body.language === "string" && body.language !== "" && body.language !== "python") ||
            (typeof body.code === "string" && body.code.length > 0),
    });
    if (!resolved) {
        return new Response(
            JSON.stringify({error: "File not found inside python_scripts/."}),
            {status: 404, headers: {"Content-Type": "application/json"}}
        );
    }

    // Re-read the file in case it was removed between the slug check and execution.
    let userSource: string;
    try {
        userSource = await fs.readFile(resolved.absPath, "utf-8");
    } catch {
        return new Response(
            JSON.stringify({error: "File vanished before execution."}),
            {status: 404, headers: {"Content-Type": "application/json"}}
        );
    }

    const runId = randomUUID();
    const runTmpDir = await createRunTmpDir(runId);

    // ── non-Python languages ──────────────────────────────
    // Everything below the python path (prelude, figure capture,
    // variable inspection) is python-only; other languages resolve a
    // RUNTIME PLAN (node / tsx / matlab -batch / octave / Rscript /
    // bash / java / gcc+run / g+++run / ruby / php / go run) and share
    // the exact same SSE + stop + timeout + output-cap machinery.
    const language = typeof body.language === "string" && body.language !== "" ? body.language : "python";
    if (language !== "python") {
        const runArgs = Array.isArray(body.args) ? body.args : [];
        const cwd = path.dirname(resolved.absPath);
        const resolvedRun = await resolveLanguageRun(language, resolved.absPath, runArgs, cwd, runTmpDir);

        if (!resolvedRun.plan) {
            // Missing runtime — a friendly SSE stream (error + end) so the
            // Output panel shows the install hint instead of a raw 500.
            const hint = resolvedRun.installHint ?? `No runtime found for language "${language}".`;
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    const send = (obj: Record<string, unknown>) => {
                        try {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                        } catch { /* client gone */
                        }
                    };
                    send({
                        type: "start",
                        runId,
                        interpreter: language,
                        folder: resolved.folderName,
                        file: resolved.fileName,
                        startedAt: Date.now()
                    });
                    send({type: "error", message: hint});
                    send({type: "end", ok: false, exitCode: -1, durationMs: 0, figures: [], runId});
                    try {
                        controller.close();
                    } catch { /* already closed */
                    }
                },
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    "X-Accel-Buffering": "no",
                },
            });
        }

        const plan = resolvedRun.plan;
        // C / C++: compile first; stream the compiler's diagnostics, then
        // run the artifact with the shared child machinery.
        if (plan.compile && plan.runCompiled) {
            const compileResult = await new Promise<{ ok: boolean; output: string }>((resolveP) => {
                let out = "";
                try {
                    const cc = spawn(plan.compile!.command, plan.compile!.argv, {
                        cwd,
                        stdio: ["ignore", "pipe", "pipe"]
                    });
                    cc.stdout?.on("data", (d: Buffer) => (out += d.toString()));
                    cc.stderr?.on("data", (d: Buffer) => (out += d.toString()));
                    cc.on("error", (err) => resolveP({ok: false, output: out + String(err.message)}));
                    cc.on("close", (code) => resolveP({ok: code === 0, output: out}));
                } catch (err) {
                    resolveP({ok: false, output: String((err as Error).message)});
                }
            });
            if (!compileResult.ok) {
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    start(controller) {
                        const send = (obj: Record<string, unknown>) => {
                            try {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                            } catch { /* client gone */
                            }
                        };
                        send({
                            type: "start",
                            runId,
                            interpreter: plan.command,
                            folder: resolved.folderName,
                            file: resolved.fileName,
                            startedAt: Date.now()
                        });
                        send({type: "stderr", text: compileResult.output || "compilation failed"});
                        send({type: "end", ok: false, exitCode: 1, durationMs: 0, figures: [], runId});
                        try {
                            controller.close();
                        } catch { /* already closed */
                        }
                    },
                });
                return new Response(stream, {
                    headers: {
                        "Content-Type": "text/event-stream; charset=utf-8",
                        "Cache-Control": "no-cache, no-transform",
                        "X-Accel-Buffering": "no",
                    },
                });
            }
        }

        // The generic child: plan.command + plan.argv with the SAME SSE
        // writer below (the python path shares this block by constructing
        // the same `spawnCommand`/`spawnArgv` locals).
        const genericCommand = plan.runCompiled ? plan.runCompiled.command : plan.command;
        const genericArgv = plan.runCompiled ? plan.runCompiled.argv : plan.argv;
        return genericRunStream({
            command: genericCommand,
            argv: genericArgv,
            cwd,
            language,
            folderName: resolved.folderName,
            fileName: resolved.fileName,
            runId,
            stdin: typeof stdin === "string" ? stdin : undefined,
            // STDIN TRUTHINESS: non-Python runs used to
            // default interactive to TRUE (`body.interactive !== false`), so
            // every bare /api/run call kept the child's stdin OPEN — a node
            // or bash script reading stdin would then hang until the hard
            // timeout. The Python path below only keeps stdin open when the
            // body explicitly says `interactive: true`; non-Python now
            // matches that truthiness. (The app's own runner always sends an
            // explicit boolean, so its behavior is unchanged.)
            interactive: body.interactive === true,
            env: body.env,
            args: runArgs,
            timeoutMs: effectiveTimeoutMs,
            maxOutputBytes: effectiveMaxBytes,
            note: resolvedRun.note,
        });
    }

    const interpreter = await findInterpreter(body.interpreter);

    // If running only a single cell, slice the source to those lines.
    let effectiveSource = userSource;
    if (typeof body.code === "string" && body.code.length > 0) {
        // Run Selection — the client sends the exact text to
        // execute (the editor's current selection). Takes precedence over
        // runCell (they're never combined by the UI).
        effectiveSource = body.code;
    } else if (body.runCell) {
        const lines = userSource.split("\n");
        const start = Math.max(0, body.runCell.start - 1);
        const end = Math.min(lines.length, body.runCell.end);
        effectiveSource = lines.slice(start, end).join("\n");
    }

    const wrapped = wrapScript(effectiveSource, runTmpDir, {
        traceCoverage: body.traceCoverage,
        inspectVariables: body.inspectVariables,
        captureDataframes: body.captureDataframes,
        // Real path on disk → __file__, sys.argv[0] and tracebacks behave
        // exactly like a local `python file.py` run (Path(__file__) works).
        scriptPath: resolved.absPath,
    });

    // Build argv: pass extra args if any, so the script can read them via sys.argv.
    // scripts larger than ~100 KB would exceed Linux's
    // per-argument limit (MAX_ARG_STRLEN, 128 KiB) and fail to spawn with
    // E2BIG — run them from a temp file instead. (This also keeps the
    // source out of `ps` output for the common case.)
    let argv: string[];
    if (Buffer.byteLength(wrapped, "utf-8") <= ARGV_SCRIPT_LIMIT_BYTES) {
        argv = ["-c", wrapped];
    } else {
        const scriptPath = path.join(runTmpDir, "__wrapped_script__.py");
        await fs.writeFile(scriptPath, wrapped, "utf-8");
        argv = [scriptPath];
    }
    if (body.args && body.args.length > 0) {
        argv.push(...body.args);
    }
    const started = Date.now();
    let stdoutBuf = "";
    let stderrBuf = "";
    let truncated = false;
    let killed = false;

    // Hoisted into POST scope so the ReadableStream's cancel handler can
    // reach it — sibling methods on the options object do not share scope.
    let child: ChildProcess | undefined;
    // Mid-run artifact streaming stopper — assigned inside the
    // stream's start() below, invoked from finalize() AND cancel() so a
    // disconnected client can never leave the readdir poll loop running
    // against a dead run dir.
    let stopArtifactPolling: () => void = () => { /* assigned in start() */
    };
    const encoder = new TextEncoder();
    // Figure SSE event builder — shared by the mid-run artifact poller
    // and the exit-time sweep in finalize: the PNG URL plus, when an
    // mpld3 HTML companion sits next to it, the interactiveUrl. One
    // implementation feeds both the streaming and the final write.
    const figureEvent = async (
        fig: string
    ): Promise<Record<string, unknown>> => {
        let interactiveUrl: string | undefined;
        try {
            const html = fig.replace(/\.[^.]+$/, ".html");
            await fs.access(path.join(runTmpDir, html));
            interactiveUrl = `/api/figure/${encodeURIComponent(runId)}/${encodeURIComponent(html)}`;
        } catch {
            /* no mpld3 companion — static PNG only */
        }
        return {
            type: "figure",
            name: fig,
            url: `/api/figure/${encodeURIComponent(runId)}/${encodeURIComponent(fig)}`,
            interactiveUrl,
        };
    };
    const stream = new ReadableStream({
        start(controller) {
            // Per-run effective values, shadowing the module-level defaults.
            const timeoutMs = effectiveTimeoutMs;
            const maxOutputBytes = effectiveMaxBytes;
            let finalized = false;
            // Set when an enqueue fails (client disconnected mid-run). Every
            // later send becomes a no-op instead of throwing — the old code
            // let the throw escape finalize, skipping registry cleanup and
            // leaking the dead runId.
            let streamClosed = false;

            const send = (obj: Record<string, unknown>) => {
                if (streamClosed) return;
                try {
                    const line = `data: ${JSON.stringify(obj)}\n\n`;
                    controller.enqueue(encoder.encode(line));
                } catch {
                    streamClosed = true;
                }
            };

            send({
                type: "start",
                runId,
                interpreter,
                folder: resolved.folderName,
                file: resolved.fileName,
                startedAt: started,
            });

            try {
                child = spawn(interpreter, argv, {
                    cwd: path.dirname(resolved.absPath),
                    env: {
                        ...process.env,
                        // Headless matplotlib + unbuffered output.
                        MPLBACKEND: "Agg",
                        PYTHONUNBUFFERED: "1",
                        PYTHONIOENCODING: "utf-8",
                        // Tell the script where it can write figures (also read by prelude).
                        STATCOMP_RUN_TMP_DIR: runTmpDir,
                        STATCOMP_RUN_ID: runId,
                        // Merge in any user-supplied env vars (override existing),
                        // minus keys that can hijack the dynamic linker or the
                        // interpreter startup of the child.
                        ...(body.env && typeof body.env === "object"
                            ? Object.fromEntries(
                                Object.entries(body.env).filter(
                                    ([k, v]) =>
                                        typeof v === "string" && !BLOCKED_ENV_KEYS.test(k)
                                )
                            )
                            : {}),
                    },
                    stdio: ["pipe", "pipe", "pipe"],
                });
            } catch (err) {
                send({
                    type: "error",
                    message: `Failed to launch ${interpreter}: ${(err as Error).message}`,
                });
                send({type: "end", ok: false, durationMs: 0, figures: []});
                controller.close();
                return;
            }

            runningChildren.set(runId, child);
            runMeta.set(runId, {
                label: `${resolved.folderName}/${resolved.fileName}`,
                kind: "run",
                startedAt: started,
                pid: child.pid,
                interpreter,
            });

            // Write any stdin the caller supplied, then close stdin so the
            // script's input calls don't block forever — UNLESS the run is
            // interactive: then the stream stays open and
            // /api/run-input can answer input prompts live while the SSE
            // stream shows the script's output.
            if (typeof stdin === "string" && stdin.length > 0) {
                try {
                    child.stdin?.write(stdin);
                    if (!stdin.endsWith("\n")) child.stdin?.write("\n");
                } catch {
                    /* ignore */
                }
            }
            if (body.interactive && child.stdin) {
                openStdins.set(runId, child.stdin);
                child.stdin.on("error", () => {
                    /* EPIPE when the script exits while we hold stdin open */
                    openStdins.delete(runId);
                });
            } else {
                try {
                    child.stdin?.end();
                } catch {
                    /* ignore */
                }
            }

            // Accumulate output and flush every STOP_CHECK_MS so we don't spam
            // the SSE channel with one event per byte but still feel live.
            let pendingStdout = "";
            let pendingStderr = "";
            let flushTimer: ReturnType<typeof setTimeout> | null = null;

            /* ── mid-run figure + dataframe streaming ───────────────
                    The prelude writes each figure/dataframe file the MOMENT the
                    script saves it (plt.show / savefig / print(df)); the SSE
                    events used to wait for process exit. Poll the run tmp dir
                    while the child runs and emit each NEW artifact as its own
                    event so the Output panel's Figures/Tables tabs update as the
                    chunks arrive. Safety: an artifact is only emitted once its
                    size is STABLE across two consecutive polls — savefig writes
                    in one shot, so an unchanged size means the payload is
                    complete and we never stream a half-written file. Variables
                    stay exit-delivered (the prelude dumps variables.json in
                    atexit, so there is nothing to poll before then). */
            const emittedFigures = new Set<string>();
            const emittedDataframes = new Set<string>();
            const artifactSizes = new Map<string, number>();
            let artifactPolling = true;
            let artifactPollTimer: ReturnType<typeof setTimeout> | null = null;
            const pollArtifacts = async (): Promise<void> => {
                if (!artifactPolling) return;
                try {
                    const entries = await fs.readdir(runTmpDir, {withFileTypes: true});
                    const names: string[] = [];
                    for (const e of entries) {
                        if (e.isFile() && RUN_ARTIFACT_RE.test(e.name)) names.push(e.name);
                    }
                    const stable: string[] = [];
                    for (const name of names) {
                        try {
                            const st = await fs.stat(path.join(runTmpDir, name));
                            const prev = artifactSizes.get(name);
                            artifactSizes.set(name, st.size);
                            if (prev === st.size && st.size > 0) stable.push(name);
                        } catch {
                            /* raced with a sweep — ignore this pass */
                        }
                    }
                    stable.sort();
                    for (const name of stable) {
                        // `finalized` is checked per item: finalize() flips it
                        // before its own figure sweep, and the set is updated
                        // BEFORE the send, so the poller and finalize can never
                        // double-emit the same file regardless of interleaving.
                        if (finalized) break;
                        if (/\.html$/i.test(name)) {
                            if (emittedDataframes.has(name)) continue;
                            emittedDataframes.add(name);
                            // metadata is partial mid-run (the rich shape/dtype
                            // index lands in dataframes.json at exit); the table is
                            // fully renderable from the HTML itself.
                            send({
                                type: "dataframe",
                                name,
                                url: `/api/figure/${encodeURIComponent(runId)}/${encodeURIComponent(name)}`,
                                dfName: "DataFrame",
                                dtype: "DataFrame",
                            });
                        } else {
                            if (emittedFigures.has(name)) continue;
                            emittedFigures.add(name);
                            send(await figureEvent(name));
                        }
                    }
                } catch {
                    /* run dir vanished (failed/swept run) — poll quietly on */
                }
                if (artifactPolling) {
                    artifactPollTimer = setTimeout(() => {
                        void pollArtifacts();
                    }, ARTIFACT_POLL_MS);
                }
            };
            stopArtifactPolling = () => {
                artifactPolling = false;
                if (artifactPollTimer) {
                    clearTimeout(artifactPollTimer);
                    artifactPollTimer = null;
                }
            };
            void pollArtifacts();

            const scheduleFlush = () => {
                if (flushTimer) return;
                flushTimer = setTimeout(() => {
                    flushTimer = null;
                    if (pendingStdout) {
                        send({type: "stdout", text: pendingStdout});
                        stdoutBuf += pendingStdout;
                        pendingStdout = "";
                    }
                    if (pendingStderr) {
                        send({type: "stderr", text: pendingStderr});
                        stderrBuf += pendingStderr;
                        pendingStderr = "";
                    }
                }, STOP_CHECK_MS);
            };

            // byte totals are tracked incrementally instead
            // of re-measuring `cur + incoming` on every chunk (that
            // re-concatenation made the check O(n²) against the 2 MB cap).
            let stdoutTotalBytes = 0;
            let stderrTotalBytes = 0;
            const checkTruncate = (which: "stdout" | "stderr", incoming: string) => {
                if (truncated) return true;
                const bytes = Buffer.byteLength(incoming, "utf-8");
                if (which === "stdout") stdoutTotalBytes += bytes;
                else stderrTotalBytes += bytes;
                const total = which === "stdout" ? stdoutTotalBytes : stderrTotalBytes;
                if (total > maxOutputBytes) {
                    truncated = true;
                    send({
                        type: "stderr",
                        text: `\n[statcomp] output truncated at ${formatBytes(maxOutputBytes)}.\n`,
                    });
                    return true;
                }
                return false;
            };

            child.stdout?.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                if (checkTruncate("stdout", text)) return;
                pendingStdout += text;
                scheduleFlush();
            });
            child.stderr?.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                if (checkTruncate("stderr", text)) return;
                pendingStderr += text;
                scheduleFlush();
            });

            const timeoutHandle = setTimeout(() => {
                killed = true;
                // WHY the run died — same marker as the generic (non-Python)
                // path above: the end event's killed flag is true for both a
                // timeout and a user stop, so this stderr line is the channel
                // the Output panel sniffs (src/lib/run-format.ts) to show the
                // "Timed out" pill instead of the misleading "Stopped".
                send({
                    type: "stderr",
                    text: `\n[praxis] run timed out after ${Math.round(timeoutMs / 1000)} s — the process was killed (hard timeout).\n`,
                });
                try {
                    child?.kill("SIGKILL");
                } catch { /* already dead */
                }
            }, timeoutMs);
            /* — same interactive keeps-alive as the non-Python
                    path: every /api/run-input write re-arms this kill timer, so a
                    Python script waiting at input() is never killed mid-quiz by
                    the 60 s default. Abandoned sessions are still reaped after
                    one idle window. */
            if (body.interactive) {
                stdinTimeoutResets.set(runId, () => {
                    timeoutHandle.refresh();
                });
            }

            const finalize = async (code: number | null) => {
                if (finalized) return;
                finalized = true;
                // stop the mid-run artifact poller first — its per-item
                // `finalized` check keeps an in-flight pass from emitting after
                // this point, and clearing the timer stops the next pass.
                stopArtifactPolling();
                clearTimeout(timeoutHandle);
                stdinTimeoutResets.delete(runId);
                if (flushTimer) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
                // Final flush.
                if (pendingStdout) {
                    send({type: "stdout", text: pendingStdout});
                    stdoutBuf += pendingStdout;
                    pendingStdout = "";
                }
                if (pendingStderr) {
                    send({type: "stderr", text: pendingStderr});
                    stderrBuf += pendingStderr;
                    pendingStderr = "";
                }

                // Collect figures.
                let figures: string[] = [];
                try {
                    figures = await listFigures(runTmpDir);
                } catch {
                    /* ignore */
                }
                // the mid-run poller already streamed most of these —
                // skip the ones it emitted so the client never sees the same
                // figure event twice (the page appends events blindly).
                for (const fig of figures) {
                    if (emittedFigures.has(fig)) continue;
                    send(await figureEvent(fig));
                }

                const durationMs = Date.now() - started;
                // If the user explicitly stopped this run, mark it as killed even
                // if the script exited cleanly (SIGTERM lets Python run atexit
                // handlers and exit 0).
                const wasStopped = stopRequested.has(runId);
                const finalKilled = killed || wasStopped;
                const ok = !finalKilled && code === 0;

                // Read optional metadata files the prelude may have written.
                let variables: unknown[] | null = null;
                let coverage: Record<string, number[]> | null = null;
                let dataframes: Array<{
                    html_file: string;
                    name: string;
                    shape: number[];
                    dtype: string;
                }> | null = null;
                let tests: string[] | null = null;
                try {
                    const [v, c, d, t] = await Promise.all([
                        readRunMetadata<unknown[]>(runId, "variables.json"),
                        readRunMetadata<Record<string, number[]>>(runId, "coverage.json"),
                        readRunMetadata<Array<{
                            html_file: string;
                            name: string;
                            shape: number[];
                            dtype: string;
                        }>>(runId, "dataframes.json"),
                        readRunMetadata<string[]>(runId, "tests.json"),
                    ]);
                    variables = v;
                    coverage = c;
                    dataframes = d;
                    tests = t;
                } catch {
                    /* ignore */
                }

                // Surface DataFrame captures as figure-like events so the UI can
                // render them in the Figures tab.
                if (dataframes) {
                    for (const df of dataframes) {
                        // mid-run streamed already (partial metadata) — the
                        // client keeps the streamed event, so re-sending here would
                        // duplicate the table.
                        if (emittedDataframes.has(df.html_file)) continue;
                        send({
                            type: "dataframe",
                            name: df.html_file,
                            url: `/api/figure/${encodeURIComponent(runId)}/${encodeURIComponent(df.html_file)}`,
                            dfName: df.name,
                            shape: df.shape,
                            dtype: df.dtype,
                        });
                    }
                }

                send({
                    type: "end",
                    ok,
                    exitCode: code ?? (finalKilled ? -1 : 0),
                    durationMs,
                    truncated,
                    killed: finalKilled,
                    // explicit timeout flag (the stderr marker above is the
                    // backwards-compatible channel the current client reads;
                    // this field lets future consumers skip the sniff).
                    timedOut: killed && !wasStopped,
                    interpreter,
                    figures,
                    variables: variables ?? undefined,
                    coverage: coverage ?? undefined,
                    dataframes: dataframes ?? undefined,
                    tests: tests ?? undefined,
                    stdoutBytes: stdoutTotalBytes,
                    stderrBytes: stderrTotalBytes,
                    runId,
                });
                runningChildren.delete(runId);
                stopRequested.delete(runId);
                runMeta.delete(runId);
                openStdins.delete(runId);
                stdinTimeoutResets.delete(runId);
                try {
                    controller.close();
                } catch { /* already closed */
                }
            };

            child.on("close", (code) => {
                finalize(code).catch(() => {
                    // finalize is fully guarded; this is belt-and-braces so a
                    // rejected cleanup promise can never surface as an
                    // unhandled rejection.
                    runningChildren.delete(runId);
                    stopRequested.delete(runId);
                    runMeta.delete(runId);
                    openStdins.delete(runId);
                    stdinTimeoutResets.delete(runId);
                });
            });
            child.on("error", async (err) => {
                clearTimeout(timeoutHandle);
                const isNotFound =
                    (err as NodeJS.ErrnoException).code === "ENOENT";
                const message = isNotFound
                    ? `Python interpreter "${interpreter}" was not found on PATH. Install Python or set the right interpreter.`
                    : `Failed to launch ${interpreter}: ${err.message}`;
                send({type: "error", message});
                await finalize(null);
            });
        },
        cancel() {
            // Client disconnected — kill the child if still running so we don't
            // leak a Python process for up to 60s after the user left.
            try {
                child?.kill("SIGKILL");
            } catch { /* already dead */
            }
            // Also stop the mid-run artifact poller — the run dir may outlive
            // the stream, but nobody is listening anymore.
            stopArtifactPolling();
            // The child's close event will run finalize for full cleanup, but
            // if anything goes wrong before that fires, make sure the runId
            // never leaks in the registry (the probe run showed the
            // dead runId staying registered after a mid-run disconnect).
            runningChildren.delete(runId);
            stopRequested.delete(runId);
            runMeta.delete(runId);
            openStdins.delete(runId);
            stdinTimeoutResets.delete(runId);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Disable Next.js's response buffering for SSE.
            "X-Accel-Buffering": "no",
        },
    });
}
