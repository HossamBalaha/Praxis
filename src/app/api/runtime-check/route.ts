import {NextRequest, NextResponse} from "next/server";
import {clearRuntimeCache, getRuntimeStatuses} from "@/lib/language-runtimes";

/**
 * GET /api/runtime-check
 *
 * which non-Python language runtimes are installed on this
 * machine (node / tsx / MATLAB / Octave / Rscript / bash / java / gcc /
 * g++ / ruby / php / go / lua / perl / rustc / julia / kotlin / swift)?
 * Cached 60 s server-side; the Settings → Python → "Other language
 * runtimes" panel and the Run button's missing-runtime toast both read
 * this.
 *
 * `?fresh=1` (the panel's "Check again" button) drops the
 * server-side cache first so the re-check actually re-probes every
 * runtime instead of replaying the 60 s cached answer — the click used
 * to return identical data instantly, looking like it did nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const fresh = request.nextUrl.searchParams.get("fresh") === "1";
        if (fresh) clearRuntimeCache();
        const runtimes = await getRuntimeStatuses();
        return NextResponse.json({ok: true, runtimes, fresh});
    } catch (err) {
        return NextResponse.json(
            {ok: false, error: (err as Error).message, runtimes: []},
            {status: 500}
        );
    }
}
