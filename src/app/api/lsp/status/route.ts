import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";

/**
 * GET /api/lsp/status
 *
 * A PURE snapshot of the pyright sidecar's lifecycle — this route never
 * spawns anything, so polling it is free. The client uses it to decide
 * whether LSP features (hover, F12, F2, live diagnostics) are offered
 * or the regex/AST-lite fallbacks stay in charge.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     state: "stopped" | "starting" | "ready" | "failed" | "unavailable",
 *     ready: boolean, available: boolean,
 *     reason: string | null,
 *     serverVersion: string | null,   // pyright's own version
 *     pythonPath: string | null,
 *     generation: number,             // bumped per (re)start
 *     restarts: number, startedAt: number | null,
 *     processAlive: boolean
 *   }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    // The process-wide sidecar manager.
    const manager = getPyrightLspManager();
    // The pure snapshot.
    return NextResponse.json({ok: true, ...manager.getStatus()});
}
