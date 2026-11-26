import {NextResponse} from "next/server";
import {runningChildren, stopRequested} from "@/lib/run-registry";

/**
 * POST /api/stop
 *
 * Body: { runId: string }
 *
 * Kills the running Python child process identified by runId (the runId
 * is sent in the first SSE event from /api/run). Returns ok=true if a
 * matching process was found and signalled, ok=false otherwise.
 *
 * We also add the runId to a `stopRequested` set so the run handler
 * knows to report `killed: true` even if SIGTERM lets the child exit
 * cleanly with code 0 (Python's default SIGTERM behavior).
 */
export async function POST(request: Request) {
    let body: { runId?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {runId} = body;
    if (!runId) {
        return NextResponse.json(
            {error: "Body must include 'runId'."},
            {status: 400}
        );
    }

    const child = runningChildren.get(runId);
    if (!child) {
        return NextResponse.json(
            {ok: false, error: "No running process with that runId."},
            {status: 404}
        );
    }

    // Mark as stop-requested so the run handler reports killed=true.
    stopRequested.add(runId);

    try {
        // SIGTERM first so the script can clean up; SIGKILL after a beat
        // if it's still alive.
        child.kill("SIGTERM");
        setTimeout(() => {
            try {
                if (child.exitCode === null && child.signalCode === null) {
                    child.kill("SIGKILL");
                }
            } catch {
                /* already dead */
            }
        }, 1500);
        return NextResponse.json({ok: true, runId, signal: "SIGTERM"});
    } catch (err) {
        stopRequested.delete(runId);
        return NextResponse.json(
            {ok: false, error: `Failed to kill process: ${(err as Error).message}`},
            {status: 500}
        );
    }
}
