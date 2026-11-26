import {NextResponse} from "next/server";
import fsSync from "node:fs";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * GET /api/health
 *
 * Token-exempt liveness probe (see src/proxy.ts). Returns whether the
 * scripts root is readable — enough for a Docker healthcheck or an
 * uptime monitor without exposing anything sensitive or requiring
 * the access token.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    let scriptsOk = false;
    try {
        scriptsOk = fsSync.statSync(getScriptsRoot()).isDirectory();
    } catch {
        scriptsOk = false;
    }
    return NextResponse.json({
        ok: true,
        scriptsRootReadable: scriptsOk,
        uptimeSec: Math.round(process.uptime()),
    });
}
