import {NextRequest, NextResponse} from "next/server";
import {openStdins, runningChildren, stdinTimeoutResets} from "@/lib/run-registry";

/**
 * POST /api/run-input (— interactive stdin)
 *
 * Body:
 * { runId: string, text: string } → write a line to the run's stdin
 * { runId: string, eof: true } → close the run's stdin (EOF)
 *
 * Only works for runs started with { interactive: true } — every other
 * run's stdin is closed at spawn time. A newline is appended to `text`
 * when missing so input returns immediately, matching what a user
 * typing in a terminal does.
 *
 * Responses: { ok: true, wrote: n } | { ok: false, error } with 404 for
 * an unknown/finished run and 409 for a non-interactive run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    let body: { runId?: string; text?: string; eof?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const runId = body.runId ?? "";
    if (!runId) {
        return NextResponse.json(
            {error: "Body must include 'runId'."},
            {status: 400}
        );
    }

    const stdin = openStdins.get(runId);
    if (!stdin) {
        // Distinguish "run is over" from "run never accepted input".
        if (!runningChildren.has(runId)) {
            return NextResponse.json(
                {ok: false, error: "No running process with that runId."},
                {status: 404}
            );
        }
        return NextResponse.json(
            {
                ok: false,
                error:
                    "This run was not started in interactive mode — its stdin is already closed.",
            },
            {status: 409}
        );
    }

    if (body.eof) {
        try {
            openStdins.delete(runId);
            stdin.end();
            return NextResponse.json({ok: true, eof: true});
        } catch (err) {
            return NextResponse.json(
                {ok: false, error: `Could not close stdin: ${(err as Error).message}`},
                {status: 500}
            );
        }
    }

    const text = typeof body.text === "string" ? body.text : "";
    if (!text) {
        return NextResponse.json(
            {error: "Body must include 'text' (or 'eof': true)."},
            {status: 400}
        );
    }

    const line = text.endsWith("\n") ? text : text + "\n";
    try {
        stdin.write(line);
        // activity keeps the run alive: every answered prompt
        // re-arms the run's hard-kill timer (a fresh full timeout window),
        // so interactive input sessions never die mid-conversation from
        // the idle timeout. EOF needs no reset (it ends the script itself).
        try {
            stdinTimeoutResets.get(runId)?.();
        } catch { /* run already finalized */
        }
        return NextResponse.json({ok: true, wrote: line.length});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: `Write failed: ${(err as Error).message}`},
            {status: 500}
        );
    }
}
