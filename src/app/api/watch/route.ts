import {NextRequest} from "next/server";
import fs from "node:fs";
import {resolveScriptPath} from "@/lib/scripts";

/**
 * POST /api/watch (Server-Sent Events stream)
 *
 * Body: { folder: <slug>, file: <slug> }
 *
 * Watches the currently selected Python script for filesystem changes and
 * streams an SSE event when the file is modified. Used by the client to
 * implement auto-rerun-on-save: when the user (or an external editor)
 * writes to the file, the server emits a `{type:"changed"}` event so the
 * UI can re-execute the script automatically.
 *
 * Events emitted (one per SSE message):
 * data: {"type":"watching"}\n\n
 * Emitted immediately on connect, before fs.watch is set up.
 * data: {"type":"changed","folder":"<display>","file":"<display>"}\n\n
 * Emitted (debounced 500 ms) every time the file is modified.
 * data: {"type":"timeout"}\n\n
 * Emitted after the 5-minute max watch time, then the stream closes.
 *
 * The watcher is closed when the client disconnects (ReadableStream
 * `cancel`) so we never leak an fs.watch handle past the connection.
 */
export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

const MAX_WATCH_MS = 5 * 60 * 1000; // 5 min cap
const DEBOUNCE_MS = 500;

export async function POST(request: NextRequest) {
    let body: { folder?: string; file?: string };
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({error: "Invalid JSON body."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    const {folder, file} = body;
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

    const encoder = new TextEncoder();
    let watcher: fs.FSWatcher | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (obj: Record<string, unknown>) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
                    );
                } catch {
                    // Controller already closed — swallow.
                }
            };

            const cleanup = () => {
                if (closed) return;
                closed = true;
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
                if (watcher) {
                    try {
                        watcher.close();
                    } catch { /* already closed */
                    }
                    watcher = null;
                }
                try {
                    controller.close();
                } catch { /* already closed */
                }
            };

            // Acknowledge the connection so the client knows we're listening.
            send({type: "watching"});

            try {
                watcher = fs.watch(resolved.absPath, {persistent: true}, (eventType) => {
                    // Both 'change' and 'rename' can indicate the file was written.
                    // Some editors (vim, emacs) write atomically by rename, so we
                    // treat either as a candidate "changed" signal.
                    if (eventType !== "change" && eventType !== "rename") return;

                    // Debounce: coalesce bursts of write events into a single
                    // notification so the client doesn't kick off 5 reruns when
                    // the editor writes 5 chunks.
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        debounceTimer = null;

                        // On 'rename' the watch may have been invalidated (the inode
                        // was replaced). Best-effort: re-arm the watcher so future
                        // changes still fire.
                        if (watcher) {
                            try {
                                watcher.close();
                            } catch { /* ignore */
                            }
                        }
                        try {
                            watcher = fs.watch(resolved.absPath, {persistent: true}, () => {
                                if (debounceTimer) clearTimeout(debounceTimer);
                                debounceTimer = setTimeout(() => {
                                    debounceTimer = null;
                                    send({
                                        type: "changed",
                                        folder: resolved.folderName,
                                        file: resolved.fileName,
                                    });
                                }, DEBOUNCE_MS);
                            });
                            watcher.on("error", () => {
                                send({
                                    type: "error",
                                    message: "Watch failed: file may have been removed.",
                                });
                                cleanup();
                            });
                        } catch {
                            // File was removed — can't re-arm. Close gracefully.
                            send({type: "error", message: "File no longer exists."});
                            cleanup();
                            return;
                        }

                        send({
                            type: "changed",
                            folder: resolved.folderName,
                            file: resolved.fileName,
                        });
                    }, DEBOUNCE_MS);
                });

                watcher.on("error", () => {
                    send({
                        type: "error",
                        message: "Watch failed: file may have been removed.",
                    });
                    cleanup();
                });
            } catch (err) {
                send({
                    type: "error",
                    message: `Failed to watch file: ${(err as Error).message}`,
                });
                cleanup();
                return;
            }

            // Hard 5-minute cap so a forgotten tab doesn't keep a watcher
            // open forever. The client can re-establish the watch by
            // reconnecting.
            timeoutHandle = setTimeout(() => {
                send({type: "timeout"});
                cleanup();
            }, MAX_WATCH_MS);
        },
        cancel() {
            // Client disconnected — tear down everything.
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
            }
            if (watcher) {
                try {
                    watcher.close();
                } catch { /* already closed */
                }
                watcher = null;
            }
            closed = true;
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
