import {NextResponse} from "next/server";
import {openStdins, runMeta, runningChildren} from "@/lib/run-registry";

/**
 * GET /api/run/queue (— the Run Queue dashboard)
 *
 * Lists every run currently executing on the server (the same registry
 * /api/stop uses), with the display metadata registered by the run
 * routes. The client polls this while the Run Queue panel is open.
 *
 * Response: {
 *   ok: true,
 *   runs: Array<{
 *     runId: string,
 *     label: string,          // "Folder/file.py" or "Run all — Folder"
 *     kind: "run"|"run-all"|"debug"|"test"|"profile",
 *     startedAt: number,      // epoch ms
 *     durationMs: number,     // server-side elapsed
 *     pid?: number,
 *     interpreter?: string,
 *     interactive: boolean,   // stdin is open (accepts /api/run-input)
 *     alive: boolean,         // process handle still present
 *   }>,
 *   count: number,
 * }
 *
 * Note: runs whose SSE stream is still attached but whose process has
 * exited report alive:false for a moment until finalize cleans up —
 * the UI shows those as "finishing".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const runs = [...runningChildren.entries()].map(([runId, child]) => {
        const meta = runMeta.get(runId);
        return {
            runId,
            label: meta?.label ?? "Background run",
            kind: meta?.kind ?? ("run" as const),
            startedAt: meta?.startedAt ?? 0,
            durationMs: meta ? Date.now() - meta.startedAt : 0,
            pid: meta?.pid ?? child.pid ?? undefined,
            interpreter: meta?.interpreter,
            interactive: openStdins.has(runId),
            alive: child.exitCode === null && child.signalCode === null,
        };
    });
    // Oldest first — matches how a queue reads.
    runs.sort((a, b) => a.startedAt - b.startedAt);
    return NextResponse.json({ok: true, runs, count: runs.length});
}
