import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {type ChildProcess, spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createRunTmpDir, deslugify, getScriptsRoot, listFigures, listFolders, slugify,} from "@/lib/scripts";
import {wrapScript} from "@/lib/python-prelude";
import {findInterpreter} from "@/lib/python-interpreter";
import {runMeta, runningChildren, stopRequested} from "@/lib/run-registry";
// the timeout-marker line — byte-identical to the one /api/run stamps
// (sniffed downstream by src/lib/run-format.ts's isTimeoutRun).
import {runTimeoutMarkerLine} from "@/lib/run-format";
// the batch runs EVERY runnable language — python keeps its
// full pipeline; every other kind routes through the runtime registry
// (node / tsx / MATLAB / Octave / Rscript / bash / java / gcc / g++ /
// ruby / php / go), same as POST /api/run.
import {runLanguageForFile} from "@/lib/run-languages";
import {resolveLanguageRun} from "@/lib/language-runtimes";
// platform-aware inline `-c` limit — Windows caps the whole
// CreateProcess command line at 32 767 chars (ENAMETOOLONG /
// uv_spawn error); large wrapped scripts run from a temp file instead.
import {MAX_INLINE_SCRIPT_BYTES} from "@/lib/spawn-limits";

/**
 * POST /api/run-all (Server-Sent Events stream)
 *
 * Body: { folder: <slug>, sub?: <relative subfolder> }
 *
 * this route used to run every.py file in the
 * folder strictly sequentially and return ONE unbuffered JSON response
 * after the last file finished — the dynamic probe measured 40.6 s of
 * blank waiting for twenty ~2 s scripts, the batch could not be stopped,
 * and the children were never registered with /api/stop. It then:
 * - streams per-file results as SSE events (file-start / file-end),
 * so the batch dialog fills in progressively like /api/run does;
 * - registers each child in the shared run registry under the batch
 * runId AND a per-file runId, so /api/stop can cancel the batch;
 * - caps the folder size (a runaway 500-file folder can no longer
 * hold the connection open for hours).
 *
 *: the batch no longer filters to.py — EVERY runnable file in
 * the folder runs, each with its own language runtime:
 * -.py keeps the full Python pipeline (prelude, figure capture,
 * variables/dataframes written into the run temp dir);
 * -.js /.ts /.m /.R /.sh /.java /.c /.cpp /.rb /.php /.go
 * resolve a RUNTIME PLAN through the registry — a missing runtime
 * marks just THAT file failed with the install hint (the batch
 * keeps going), C/C++ compile first and stream the compiler's
 * diagnostics on failure.
 *
 * Events emitted:
 * data: {"type":"start","batchId":"...","folder":"...","total":N}
 * data: {"type":"file-start","file":"...","index":i,"total":N}
 * data: {"type":"file-end","result":{...BatchResult...}}
 * data: {"type":"end","totalMs":N,"passCount":N,"failCount":N,"stopped":bool}
 * data: {"type":"error","message":"..."} (bad request / not found)
 *
 * Each per-file child ALSO registers runMeta (label = the file, kind
 * "run-all", truthful startedAt) so the Run Queue (/api/run/queue)
 * shows real rows instead of "Background run" / startedAt 0 — and a
 * per-file hard timeout now stamps the SAME stderr marker /api/run
 * uses (plus a timedOut flag on the result), so downstream history
 * shows "Timed out" instead of the misleading "Stopped".
 */
export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

const MAX_OUTPUT_BYTES = 200_000; // 200 KB per file (batch is more tolerant)
const TIMEOUT_MS = 60_000;
/** Hard cap on batch size. */
const MAX_BATCH_FILES = 50;

interface BatchResult {
    file: string;
    fileSlug: string;
    runId: string;
    ok: boolean;
    exitCode: number;
    durationMs: number;
    stdout: string;
    stderr: string;
    truncated: boolean;
    killed: boolean;
    /** True when THIS file died by the batch's hard timeout (not by a
     * user stop) — the explicit flag the client's history/cache copies,
     * alongside the stderr marker below. */
    timedOut: boolean;
    figures: string[];
    figureUrls: { url: string; name: string }[];
    stdoutBytes: number;
    stderrBytes: number;
    interpreter?: string;
    /** which language runtime ran (or tried to run) the file. */
    language?: string;
}

/** Shared spawn-and-collect machinery for the batch: registers the
 * child under the per-file AND batch ids, caps output, kills at the
 * timeout. `launch` builds the ChildProcess (python -c / temp file /
 * runtime plan command). `meta` carries the display info for the Run
 * Queue (label + interpreter) — see the runMeta.set below. */
function collectChild(
    runId: string,
    batchId: string,
    started: number,
    meta: { label: string; interpreter?: string },
    launch: () => ChildProcess,
    onStdout: (text: string) => void,
    onStderr: (text: string) => void
): Promise<{ code: number | null; killed: boolean; truncated: boolean; timedOut: boolean }> {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let killed = false;
    let timedOut = false;
    return new Promise((resolve) => {
        let child: ChildProcess;
        try {
            child = launch();
        } catch (err) {
            // Spawn-level failure (ENOENT etc.) — surfaces as stderr via the
            // caller's onStderr hook.
            onStderr(`Failed to launch: ${(err as Error).message}\n`);
            resolve({code: -1, killed, truncated, timedOut});
            return;
        }
        // register the child under BOTH ids so /api/stop
        // (which knows the batch id) and any per-file lookup can cancel it.
        runningChildren.set(runId, child);
        runningChildren.set(batchId, child);
        // (Run Queue): batch children used to register ONLY the
        // child process, so /api/run/queue listed them as label "Background
        // run", kind "run", startedAt 0 → durationMs 0. Mirror api/run/
        // route.ts:165 — truthful label, kind "run-all" (the registry kind
        // that existed but was never assigned) and the accurate startedAt.
        runMeta.set(runId, {
            label: meta.label,
            kind: "run-all",
            startedAt: started,
            pid: child.pid,
            ...(meta.interpreter ? {interpreter: meta.interpreter} : {}),
        });
        const timeoutHandle = setTimeout(() => {
            killed = true;
            timedOut = true;
            // Stopped vs Timed out: the batch's hard 60 s
            // SIGKILL used to emit NO marker, so the client could not tell a
            // timeout from a stop and the history showed "Stopped". Stamp
            // the SAME stderr line /api/run stamps right before the kill —
            // flushed through the caller's onStderr accumulator, so it lands
            // in this file's BatchResult.stderr (the per-file SSE "end"
            // payload) — plus the explicit timedOut flag on the result.
            onStderr(runTimeoutMarkerLine(TIMEOUT_MS));
            try {
                child.kill("SIGKILL");
            } catch { /* dead */
            }
        }, TIMEOUT_MS);
        const cleanup = () => {
            clearTimeout(timeoutHandle);
            runningChildren.delete(runId);
            // mirror api/run/route.ts's finalize cleanup — the meta entry must
            // not outlive the child (the Run Queue would list a dead run).
            runMeta.delete(runId);
            // NOTE: the batchId entry is deleted by the batch loop when the
            // whole batch finishes (the next file re-registers it).
        };
        child.stdout?.on("data", (chunk: Buffer) => {
            const text = chunk.toString("utf-8");
            stdoutBytes += Buffer.byteLength(text, "utf-8");
            if (stdoutBytes > MAX_OUTPUT_BYTES) {
                truncated = true;
                return;
            }
            onStdout(text);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString("utf-8");
            stderrBytes += Buffer.byteLength(text, "utf-8");
            if (stderrBytes > MAX_OUTPUT_BYTES) {
                truncated = true;
                return;
            }
            onStderr(text);
        });
        child.on("close", (code) => {
            cleanup();
            resolve({code, killed, truncated, timedOut});
        });
        child.on("error", (err: Error) => {
            cleanup();
            onStderr(`Failed to launch: ${err.message}\n`);
            resolve({code: -1, killed, truncated, timedOut});
        });
    });
}

/** Run a single file, emitting its BatchResult. Registers the child in
 *  the run registry (per-file runId) so /api/stop can kill it.
 * `language` routes python → the prelude pipeline; every
 *  other language → the runtime registry (resolveLanguageRun). */
async function runOne(
    folderName: string,
    fileName: string,
    batchId: string,
    language: string
): Promise<BatchResult> {
    const absPath = path.join(getScriptsRoot(), folderName, fileName);
    const userSource = await fs.readFile(absPath, "utf-8");
    const runId = randomUUID();
    const runTmpDir = await createRunTmpDir(runId);
    const started = Date.now();
    let stdoutBuf = "";
    let stderrBuf = "";

    const base = (over: Partial<BatchResult> = {}): BatchResult => ({
        file: fileName,
        fileSlug: slugify(fileName),
        runId,
        ok: false,
        exitCode: -1,
        durationMs: Date.now() - started,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        truncated: false,
        killed: false,
        timedOut: false,
        figures: [],
        figureUrls: [],
        stdoutBytes: Buffer.byteLength(stdoutBuf, "utf-8"),
        stderrBytes: Buffer.byteLength(stderrBuf, "utf-8"),
        language,
        ...over,
    });

    // ── the NON-PYTHON languages (runtime registry) ─────────
    if (language !== "python") {
        const cwd = path.dirname(absPath);
        const resolvedRun = await resolveLanguageRun(language, absPath, [], cwd, runTmpDir);
        if (!resolvedRun.plan) {
            // Missing runtime — THIS file fails with the install hint; the
            // batch keeps going so the hint is visible per file.
            return base({
                stderr: `${resolvedRun.installHint ?? `No runtime found for language "${language}".`}\n`,
                interpreter: language,
            });
        }
        const plan = resolvedRun.plan;

        // C / C++: compile first; the compiler's diagnostics stream into
        // the file's stderr on failure.
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
                return base({
                    stderr: stderrBuf + (compileResult.output || "compilation failed") + "\n",
                    interpreter: plan.command
                });
            }
        }

        const command = plan.runCompiled ? plan.runCompiled.command : plan.command;
        const argv = plan.runCompiled ? plan.runCompiled.argv : plan.argv;
        const outcome = await collectChild(
            runId,
            batchId,
            started,
            // Run Queue display meta — label = folder/file (mirrors
            // api/run/route.ts:165), interpreter = the resolved command.
            {label: `${folderName}/${fileName}`, interpreter: command},
            () => spawn(command, argv, {cwd, env: {...process.env}, stdio: ["ignore", "pipe", "pipe"]}),
            (t) => {
                stdoutBuf += t;
            },
            (t) => {
                stderrBuf += t;
            }
        );
        return base({
            ok: !outcome.killed && outcome.code === 0,
            exitCode: outcome.code ?? (outcome.killed ? -1 : 0),
            killed: outcome.killed,
            truncated: outcome.truncated,
            timedOut: outcome.timedOut,
            interpreter: command,
        });
    }

    // ── The Python pipeline (unchanged) ───────────────────────────────
    const wrapped = wrapScript(userSource, runTmpDir, {
        inspectVariables: true,
        captureDataframes: true,
        // Real path → __file__ / tracebacks point at the actual file.
        scriptPath: absPath,
    });
    const interpreter = await findInterpreter();

    // platform-aware `-c` guard — Windows caps the whole
    // CreateProcess command line at 32 767 chars, so an oversized
    // wrapped script (prelude alone is ~11.5 KB) fails with
    // ENAMETOOLONG / uv_spawn. Large payloads run from a temp file.
    let argv: string[];
    if (Buffer.byteLength(wrapped, "utf-8") <= MAX_INLINE_SCRIPT_BYTES) {
        argv = ["-c", wrapped];
    } else {
        const scriptPath = path.join(runTmpDir, "__wrapped_script__.py");
        await fs.writeFile(scriptPath, wrapped, "utf-8");
        argv = [scriptPath];
    }

    const outcome = await collectChild(
        runId,
        batchId,
        started,
        // Run Queue display meta — label = folder/file (mirrors
        // api/run/route.ts:703), interpreter = the Python interpreter.
        {label: `${folderName}/${fileName}`, interpreter},
        () =>
            spawn(interpreter, argv, {
                cwd: path.dirname(absPath),
                env: {
                    ...process.env,
                    MPLBACKEND: "Agg",
                    PYTHONUNBUFFERED: "1",
                    PYTHONIOENCODING: "utf-8",
                    STATCOMP_RUN_TMP_DIR: runTmpDir,
                    STATCOMP_RUN_ID: runId,
                },
                stdio: ["ignore", "pipe", "pipe"],
            }),
        (t) => {
            stdoutBuf += t;
        },
        (t) => {
            stderrBuf += t;
        }
    );

    const figures = await listFigures(runTmpDir);
    const figureUrls = figures.map((name) => ({
        url: `/api/figure/${encodeURIComponent(runId)}/${encodeURIComponent(name)}`,
        name,
    }));
    return {
        file: fileName,
        fileSlug: slugify(fileName),
        runId,
        ok: !outcome.killed && outcome.code === 0,
        exitCode: outcome.code ?? (outcome.killed ? -1 : 0),
        durationMs: Date.now() - started,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        truncated: outcome.truncated,
        killed: outcome.killed,
        timedOut: outcome.timedOut,
        figures,
        figureUrls,
        stdoutBytes: Buffer.byteLength(stdoutBuf, "utf-8"),
        stderrBytes: Buffer.byteLength(stderrBuf, "utf-8"),
        interpreter,
        language: "python",
    };
}

export async function POST(request: Request) {
    let body: { folder?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const {folder: folderSlug} = body;
    if (!folderSlug) {
        return NextResponse.json(
            {error: "Body must include 'folder'."},
            {status: 400}
        );
    }

    const folderName = deslugify(folderSlug);
    if (!folderName) {
        return NextResponse.json(
            {error: "Invalid folder slug."},
            {status: 400}
        );
    }

    // Find the folder in the live filesystem.
    const folders = await listFolders();
    const folder = folders.find(
        (c) => c.slug === folderSlug || c.name === folderName
    );
    if (!folder) {
        return NextResponse.json(
            {error: `Folder "${folderName}" not found.`},
            {status: 404}
        );
    }
    if (folder.files.length === 0) {
        return NextResponse.json({
            folder: folder.name,
            folderSlug: slugify(folder.name),
            results: [],
            totalMs: 0,
            passCount: 0,
            failCount: 0,
            message: "Folder is empty.",
        });
    }
    //
    // main folder — same options, just nested"): an optional `sub` (a
    // relative folder path INSIDE the folder) scopes the batch to that
    // SUBFOLDER only — files in the folder root, sibling subfolders and
    // deeper descendants of other branches are excluded. Sanitized with
    // the same guard /api/folder-delete uses.
    const cleanSub = (body.sub ?? "").trim();
    if (cleanSub && (
        cleanSub.includes("..") || cleanSub.includes("\\") ||
        cleanSub.startsWith("/") || cleanSub.endsWith("/") ||
        cleanSub.split("/").some((seg) => !seg || seg.startsWith("."))
    )) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    //
    // work"): the batch takes EVERY runnable file — python keeps the
    // legacy `.py`/`.pyw` name fallback for entries with an unknown kind,
    // and each non-python kind resolves through the shared
    // runLanguageForFile table (the SAME one the Run button, the tree
    // badges and the confirm dialog use, so all counts agree). A folder
    // holding many kinds of files still only runs the runnable ones — a
    // PDF or a .csv is skipped exactly like before.
    // with `sub` set, only the runnable files INSIDE that
    // subfolder (directly or in deeper descendants) are kept.
    const runnableFiles = folder.files.filter(
        (f) =>
            runLanguageForFile(f.kind, f.name) !== undefined &&
            (!cleanSub ||
                (f.dir ?? "") === cleanSub ||
                (f.dir ?? "").startsWith(cleanSub + "/"))
    );
    if (runnableFiles.length === 0) {
        return NextResponse.json({
            folder: folder.name,
            folderSlug: slugify(folder.name),
            ...(cleanSub ? {sub: cleanSub} : {}),
            results: [],
            totalMs: 0,
            passCount: 0,
            failCount: 0,
            message: cleanSub
                ? `No runnable scripts in "${cleanSub}".`
                : "No runnable scripts in this folder.",
        });
    }
    // cap the batch size — an oversized folder used to
    // hold a single unbuffered response open for hours.
    if (runnableFiles.length > MAX_BATCH_FILES) {
        return NextResponse.json(
            {
                error: `Folder has ${runnableFiles.length} runnable scripts; the batch limit is ${MAX_BATCH_FILES}. Run them in smaller groups.`,
            },
            {status: 413}
        );
    }

    const batchId = randomUUID();
    const started = Date.now();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let streamClosed = false;
            const send = (obj: Record<string, unknown>) => {
                if (streamClosed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                } catch {
                    streamClosed = true;
                }
            };

            send({
                type: "start",
                batchId,
                folder: folder.name,
                folderSlug: slugify(folder.name),
                ...(cleanSub ? {sub: cleanSub} : {}),
                total: runnableFiles.length,
            });

            // (Run Queue): the batchId is registered in
            // runningChildren for every per-file child, but carried NO meta —
            // the queue row showed "Background run" / startedAt 0. Give the
            // batch its own truthful entry (the label shape /api/run/queue
            // documents: "Run all — Folder"), cleaned up when the batch ends
            // or the stream cancels.
            runMeta.set(batchId, {
                label: `Run all — ${folder.name}${cleanSub ? `/${cleanSub}` : ""}`,
                kind: "run-all",
                startedAt: started,
            });

            const results: BatchResult[] = [];
            for (let i = 0; i < runnableFiles.length; i++) {
                const file = runnableFiles[i];
                // Stop requested for the batch → stop scheduling new files and
                // kill the current child.
                if (stopRequested.has(batchId)) break;
                send({type: "file-start", file: file.name, index: i, total: runnableFiles.length});
                // nested files carry their relative path in
                // `path` (their `name` is just the basename) — resolving via
                // the basename used to ENOENT on every subfolder file.
                const language = runLanguageForFile(file.kind, file.name) ?? "python";
                const result = await runOne(folder.name, file.path ?? file.name, batchId, language);
                results.push(result);
                send({type: "file-end", result});
            }

            const stopped = stopRequested.has(batchId);
            runningChildren.delete(batchId);
            runMeta.delete(batchId);
            stopRequested.delete(batchId);

            send({
                type: "end",
                totalMs: Date.now() - started,
                passCount: results.filter((r) => r.ok).length,
                failCount: results.filter((r) => !r.ok).length,
                stopped,
                results,
            });
            try {
                controller.close();
            } catch { /* already closed */
            }
        },
        cancel() {
            // Client disconnected — kill whichever child is running under the
            // batch id and drop the registry entries.
            const child = runningChildren.get(batchId);
            try {
                child?.kill("SIGKILL");
            } catch { /* dead */
            }
            runningChildren.delete(batchId);
            runMeta.delete(batchId);
            stopRequested.add(batchId); // stops the loop from scheduling more
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Disable proxy buffering for SSE.
            "X-Accel-Buffering": "no",
        },
    });
}
