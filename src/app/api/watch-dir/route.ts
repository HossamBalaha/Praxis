import {NextRequest} from "next/server";
import fs from "node:fs";
import path from "node:path";
import {getScriptsRoot, invalidateFoldersCache} from "@/lib/scripts";

/**
 * POST /api/watch-dir (Server-Sent Events stream)
 *
 * Watches the entire getScriptsRoot directory tree for filesystem changes
 * (file added / removed / renamed / modified). When any change is
 * detected, the server emits a `{type:"changed"}` SSE event so the
 * client can refresh the folder tree.
 *
 * This is the "Explorer auto-refresh" feature — when the user (or an
 * external editor) modifies the project folder structure outside the
 * app, the sidebar stays in sync without requiring a manual Refresh
 * click.
 *
 * Events emitted (one per SSE message):
 * data: {"type":"watching"}\n\n
 * Emitted immediately on connect, before fs.watch is set up.
 * data: {"type":"changed"}\n\n
 * Emitted (debounced 800 ms) every time any file/folder under
 * getScriptsRoot is added, removed, or renamed.
 * data: {"type":"timeout"}\n\n
 * Emitted after the 10-minute max watch time, then the stream
 * closes. The client should reconnect.
 *
 * The watcher is closed when the client disconnects (ReadableStream
 * `cancel`) so we never leak an fs.watch handle past the connection.
 *
 * NOTE: fs.watch is recursive on most platforms (Node 20+ uses
 * `recursive: true` on Linux/macOS/Windows). If the platform doesn't
 * support recursive watching, we fall back to watching each folder
 * subdirectory individually.
 */
export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

const MAX_WATCH_MS = 10 * 60 * 1000; // 10 min cap
const DEBOUNCE_MS = 800;

export async function POST(_request: NextRequest) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            let closed = false;
            const send = (obj: unknown) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                } catch {
                    closed = true;
                }
            };
            // Signal that the watcher is starting.
            send({type: "watching"});

            // Debounce: collect change events and emit a single "changed"
            // event after DEBOUNCE_MS of quiet. This prevents a burst of
            // events (e.g., from a git checkout) from causing many
            // consecutive refresh requests.
            let debounceTimer: ReturnType<typeof setTimeout> | null = null;
            const fireChange = () => {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    send({type: "changed"});
                }, DEBOUNCE_MS);
            };

            // Set up the filesystem watchers. Try recursive first; if the
            // platform doesn't support it, fall back to per-folder watching.
            // every watcher callback also drops the
            // listFolders cache, so the next /api/folders after ANY write
            // (from this app or an external editor) is a fresh scan.
            const watchers: fs.FSWatcher[] = [];
            const tryWatch = (dir: string, recursive: boolean): boolean => {
                try {
                    const w = fs.watch(dir, {recursive}, () => {
                        invalidateFoldersCache();
                        fireChange();
                    });
                    w.on("error", () => { /* ignore — watcher died */
                    });
                    watchers.push(w);
                    return true;
                } catch {
                    return false;
                }
            };

            // Try recursive watch of the scripts root.
            const rootOk = tryWatch(getScriptsRoot(), true);
            // If recursive didn't work (some platforms), fall back to
            // per-folder watching.
            if (!rootOk) {
                try {
                    const entries = fs.readdirSync(getScriptsRoot(), {withFileTypes: true});
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            tryWatch(path.join(getScriptsRoot(), entry.name), false);
                        }
                    }
                } catch { /* root dir doesn't exist or unreadable */
                }
            }

            // Max watch time — close the stream after MAX_WATCH_MS so the
            // client reconnects (gets a fresh watcher + handles any new
            // folder subdirectories that were created after connect).
            const timeout = setTimeout(() => {
                send({type: "timeout"});
                cleanup();
            }, MAX_WATCH_MS);

            const cleanup = () => {
                if (closed) return;
                closed = true;
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
                clearTimeout(timeout);
                for (const w of watchers) {
                    try {
                        w.close();
                    } catch { /* ignore */
                    }
                }
                watchers.length = 0;
                try {
                    controller.close();
                } catch { /* already closed */
                }
            };

            // Store cleanup on the controller so `cancel` can use it.
            (controller as unknown as { _cleanup?: () => void })._cleanup = cleanup;
        },
        cancel(controller) {
            const c = controller as unknown as { _cleanup?: () => void };
            if (c._cleanup) c._cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Disable proxy buffering (nginx, Cloudflare, etc.).
            "X-Accel-Buffering": "no",
        },
    });
}
