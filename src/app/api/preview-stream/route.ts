import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * GET /api/preview-stream?folder=<slug> (Server-Sent Events stream)
 *
 * Live-reload watcher for the preview iframe. While the client stays
 * connected, the folder folder is re-scanned every 700 ms and reduced
 * to a digest (relative file name + mtimeMs + size, recursively, with
 * dot-entries and node_modules skipped). When the digest CHANGES
 * against the previous tick, one reload event is emitted:
 *
 *   data: {"kind":"reload"}\n\n
 *
 * The digest computed on the FIRST 700 ms tick is the baseline — no
 * event fires for it, so a save that happened between the HTML fetch
 * and the watcher connect never double-reloads.
 *
 * Heartbeat `: ping` every 15 s keeps proxies from buffering/closing
 * the idle stream. Hard cap: the stream lives at most 30 minutes, then
 * closes — the client EventSource auto-reconnects.
 *
 * Cleanup runs on ReadableStream cancel AND on request.signal abort so
 * a navigating iframe never leaks a polling loop.
 */

export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

const POLL_MS = 700;
const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 30 * 60 * 1000;
/** Depth cap for the recursive digest walk — the preview targets web
 *  project folders, not the filesystem at large. */
const MAX_WALK_DEPTH = 8;

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cheap recursive listing digest: every file under the folder (below
 * dot-dirs and node_modules, which never affect the preview) contributes
 * "relPath:mtimeMs:size". The parts are sorted, so the digest is
 * readdir-order independent and only changes when a file's name, mtime
 * or size actually changes.
 */
async function computeFolderDigest(folderDir: string): Promise<string> {
    const parts: string[] = [];
    const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
        if (depth > MAX_WALK_DEPTH) return;
        let entries: import("node:fs").Dirent[];
        try {
            entries = await fs.readdir(dir, {withFileTypes: true});
        } catch {
            return; // vanished mid-walk — the next tick re-hashes reality
        }
        for (const entry of entries) {
            // Dot-entries (.praxis settings churn) and dependency trees only
            // add stat noise — the preview never renders them.
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const entryPath = path.join(dir, entry.name);
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            try {
                const stat = await fs.stat(entryPath);
                parts.push(`${relPath}:${stat.mtimeMs}:${stat.size}`);
                if (stat.isDirectory()) {
                    await walk(entryPath, relPath, depth + 1);
                }
            } catch {
                /* vanished between readdir and stat — skip */
            }
        }
    };
    await walk(folderDir, "", 0);
    parts.sort();
    return parts.join("|");
}

export async function GET(request: NextRequest) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    if (!folderSlug) {
        return NextResponse.json(
            {error: "Missing 'folder' query parameter."},
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

    // ── Path resolution + containment guard (copied from /api/file) ──
    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, folderDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Path traversal blocked."},
            {status: 400}
        );
    }

    try {
        const stat = await fs.stat(folderDir);
        if (!stat.isDirectory()) {
            return NextResponse.json(
                {error: "Not a folder."},
                {status: 404}
            );
        }
    } catch {
        return NextResponse.json(
            {error: "Folder not found."},
            {status: 404}
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            let stopped = false;
            let lastDigest: string | null = null;

            const send = (obj: Record<string, unknown>) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
                    );
                } catch {
                    closed = true;
                }
            };
            const ping = () => {
                if (closed) return;
                try {
                    // SSE comment line — keeps intermediaries from timing the
                    // stream out; EventSource clients ignore it silently.
                    controller.enqueue(encoder.encode(": ping\n\n"));
                } catch {
                    closed = true;
                }
            };

            const heartbeat = setInterval(ping, HEARTBEAT_MS);
            const cap = setTimeout(() => {
                // Hard lifetime cap — close so the client reconnects with a
                // fresh watcher (and so a forgotten tab can't poll forever).
                cleanup();
            }, MAX_STREAM_MS);

            const cleanup = () => {
                if (closed) return;
                closed = true;
                stopped = true;
                clearInterval(heartbeat);
                clearTimeout(cap);
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            };

            // Store cleanup on the controller so `cancel` can use it (same
            // pattern as /api/watch-dir).
            (controller as unknown as { _cleanup?: () => void })._cleanup = cleanup;

            // Client disconnect via the request signal (route handler
            // equivalent of the ReadableStream cancel path).
            request.signal.addEventListener("abort", cleanup);

            // ── Poll loop ────────────────────────────────────────────────
            // Ticks are chained with sleep(), never overlapping: a slow stat
            // walk on a big folder simply delays the next tick instead of
            // piling up concurrent walks.
            void (async () => {
                while (!stopped) {
                    await sleep(POLL_MS);
                    if (stopped) break;
                    try {
                        const digest = await computeFolderDigest(folderDir);
                        if (lastDigest === null) {
                            // First tick establishes the baseline — by contract no
                            // event fires for the state the HTML was served from.
                            lastDigest = digest;
                        } else if (digest !== lastDigest) {
                            lastDigest = digest;
                            send({kind: "reload"});
                        } else {
                            lastDigest = digest;
                        }
                    } catch {
                        /* transient fs error — keep watching */
                    }
                }
            })();
        },
        cancel(controller) {
            const c = controller as unknown as { _cleanup?: () => void };
            if (c._cleanup) c._cleanup();
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
