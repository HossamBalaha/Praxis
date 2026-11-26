import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {resolveFigurePath} from "@/lib/scripts";

/**
 * GET /api/figure/<runId>/<figureName>
 *
 * Serves any file produced during a run that lives in the run temp dir:
 *   - matplotlib figures (.png, .jpg, .svg, .gif, .webp)
 *   - matplotlib animations (.mp4, .gif saved by animation.save)
 *   - DataFrame HTML captures (.html)
 *   - anything else the prelude writes
 *
 * Files live under RUN_TMP_ROOT/<runId>/ and are validated to stay
 * there — no path traversal possible.
 *
 * Content-Type is guessed from the extension. PDFs are not supported
 * (browsers can't inline them without a viewer).
 */
const CONTENT_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".html": "text/html; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json; charset=utf-8",
};

export async function GET(
    _request: Request,
    {params}: { params: Promise<{ runId: string; figureName: string }> }
) {
    const {runId, figureName} = await params;
    const absPath = await resolveFigurePath(runId, figureName);
    if (!absPath) {
        return NextResponse.json(
            {error: "Figure not found."},
            {status: 404}
        );
    }

    try {
        const data = await fs.readFile(absPath);
        const ext = path.extname(figureName).toLowerCase();
        const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
        // Cache for an hour — files are immutable per runId.
        return new Response(new Uint8Array(data), {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600, immutable",
            },
        });
    } catch {
        return NextResponse.json(
            {error: "Figure file vanished."},
            {status: 404}
        );
    }
}
