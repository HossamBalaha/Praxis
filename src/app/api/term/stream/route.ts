import {NextResponse} from "next/server";
import {getTermSession, sseResponse} from "@/lib/term-sessions";

/**
 * GET /api/term/stream?id=<sessionId>
 *
 * Attaches to a terminal session as an SSE reader: replays the
 * session's output history (capped ~200 KB) and then streams live
 * stdout/stderr chunks plus the final exit event. The reader can
 * disconnect and re-attach at any time (e.g. after a panel
 * re-render) without losing output — the backlog covers the gap.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const session = getTermSession(id);
    if (!session) {
        return NextResponse.json({error: "Unknown session id."}, {status: 404});
    }
    return sseResponse((send, done) => {
        // Backlog first — a re-attaching reader catches up here.
        for (const chunk of session.history) {
            send(JSON.stringify({out: chunk}));
        }
        if (session.closed) {
            send(JSON.stringify({exit: session.exitCode}));
            done();
            return () => {
            };
        }
        const listener = (payload: string) => send(payload);
        session.listeners.add(listener);
        // Keep-alive comment every 20 s so proxies don't idle the stream.
        const keepAlive = setInterval(() => {
            try {
                send("");
            } catch {
                /* ignore */
            }
        }, 20_000);
        return () => {
            clearInterval(keepAlive);
            session.listeners.delete(listener);
        };
    });
}
