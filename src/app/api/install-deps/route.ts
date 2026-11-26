import {type ChildProcess, spawn} from "node:child_process";
import path from "node:path";
import {deslugify, findRequirementsTxt,} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/install-deps
 *
 * Body: { folder }
 *
 * If the folder folder contains a `requirements.txt`, runs
 * `pip install -r requirements.txt` using the detected Python
 * interpreter. Streams output as SSE so the UI can show install
 * progress live.
 *
 * Response: SSE stream
 *   data: {"type":"stdout","text":"..."}
 *   data: {"type":"stderr","text":"..."}
 *   data: {"type":"end","ok":true,"exitCode":0,"durationMs":123}
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 min cap

export async function POST(request: Request) {
    let body: { folder?: string };
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({error: "Invalid JSON body."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }
    const {folder} = body;
    if (!folder) {
        return new Response(
            JSON.stringify({error: "Body must include 'folder'."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }
    const folderName = deslugify(folder);
    if (!folderName) {
        return new Response(
            JSON.stringify({error: "Invalid folder slug."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    const reqPath = await findRequirementsTxt(folder);
    if (!reqPath) {
        return new Response(
            JSON.stringify({
                error: `No requirements.txt found in folder "${folderName}".`,
            }),
            {status: 404, headers: {"Content-Type": "application/json"}}
        );
    }
    const baseName = path.basename(reqPath);
    if (baseName !== "requirements.txt") {
        return new Response(
            JSON.stringify({
                ok: false,
                error: `Only requirements.txt is supported. Found ${baseName}.`,
            }),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    const interpreter = await findInterpreter();
    const started = Date.now();

    let child: ChildProcess | undefined;
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            // guarded send — on a client disconnect the old
            // enqueue threw out of the close/error handlers, skipping
            // controller.close and leaving the stream dangling.
            let streamClosed = false;
            const send = (obj: Record<string, unknown>) => {
                if (streamClosed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                } catch {
                    streamClosed = true;
                }
            };

            send({type: "start", interpreter, requirementsFile: reqPath});

            let killed = false;
            // cap the accumulated output — pip can be
            // extremely chatty and the route used to stream every byte with
            // no limit. After the cap the stream is truncated with a note.
            const MAX_OUTPUT_BYTES = 2_000_000; // 2 MB
            let totalBytes = 0;
            let truncated = false;
            const handleChunk = (streamName: "stdout" | "stderr", c: Buffer) => {
                if (truncated) return;
                totalBytes += c.length;
                if (totalBytes > MAX_OUTPUT_BYTES) {
                    truncated = true;
                    send({
                        type: "stderr",
                        text: "\n[statcomp] install output truncated at 2 MB.\n",
                    });
                    return;
                }
                send({type: streamName, text: c.toString("utf-8")});
            };

            // Run `pip install -r requirements.txt`.
            child = spawn(
                interpreter,
                ["-m", "pip", "install", "-r", reqPath],
                {cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"]}
            );
            const proc = child; // local const so callbacks see a narrowed type

            const timeoutHandle = setTimeout(() => {
                killed = true;
                try {
                    proc.kill("SIGKILL");
                } catch { /* */
                }
            }, TIMEOUT_MS);

            proc.stdout?.on("data", (c: Buffer) => handleChunk("stdout", c));
            proc.stderr?.on("data", (c: Buffer) => handleChunk("stderr", c));

            proc.on("close", (code) => {
                clearTimeout(timeoutHandle);
                send({
                    type: "end",
                    ok: !killed && code === 0,
                    exitCode: code ?? -1,
                    durationMs: Date.now() - started,
                    killed,
                    truncated,
                });
                try {
                    controller.close();
                } catch { /* already closed */
                }
            });
            proc.on("error", (err) => {
                clearTimeout(timeoutHandle);
                send({
                    type: "end",
                    ok: false,
                    error: err.message,
                    durationMs: Date.now() - started,
                });
                try {
                    controller.close();
                } catch { /* already closed */
                }
            });
        },
        cancel() {
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
