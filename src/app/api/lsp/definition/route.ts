import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";
import {type LspRequestBody, resolveLspDocument, slugify} from "@/lib/lsp-request";
import {mapDefinition} from "@/lib/lsp-mapping";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/lsp/definition
 *
 * True go-to-definition (F12). Body:
 *   { folder, file, content, line, col, interpreter? }
 *
 * Response: { ok, available, targets, externalCount }
 *   targets: [{ folderName, fileName, folderSlug, fileSlug, line, col }]
 *     — in-project definition sites, 1-based, ready for the page's
 *       guardedSelectFile + jumpToLine flow.
 *   externalCount: number
 *     — locations that resolved OUTSIDE the project (stdlib,
 *       site-packages). The UI says "definition is in numpy" instead
 *       of jumping nowhere.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    // Parse the body defensively.
    let body: LspRequestBody;
    try {
        body = (await request.json()) as LspRequestBody;
    } catch {
        return NextResponse.json({ok: false, error: "Invalid JSON body."}, {status: 400});
    }
    // Resolve the document.
    const resolved = await resolveLspDocument(body);
    // Malformed input.
    if ("error" in resolved) {
        return NextResponse.json({ok: false, error: resolved.error}, {status: 400});
    }
    // The position must be a 1-based (line, col).
    const line = Number(body.line);
    const col = Number(body.col);
    if (!Number.isFinite(line) || line < 1 || !Number.isFinite(col) || col < 1) {
        return NextResponse.json({ok: false, error: "Body must include 1-based 'line' and 'col'."}, {status: 400});
    }
    // The current buffer text.
    if (typeof body.content !== "string") {
        return NextResponse.json({ok: false, error: "Body must include 'content'."}, {status: 400});
    }
    // The sidecar manager.
    const manager = getPyrightLspManager();
    // Ensure the sidecar against the configured interpreter.
    const interpreter = typeof body.interpreter === "string" && body.interpreter.trim() ? body.interpreter.trim() : undefined;
    const usable = await manager.ensure(interpreter);
    // The fallback case.
    if (!usable) {
        return NextResponse.json({ok: true, available: false, targets: [], externalCount: 0});
    }
    // The raw definition result.
    const raw = await manager.definition({uri: resolved.doc.uri, text: body.content}, line, col);
    // The mapped targets (locations outside the project are counted).
    const mapped = mapDefinition(raw, getScriptsRoot(), slugify);
    // The answer.
    return NextResponse.json({ok: true, available: true, targets: mapped.targets, externalCount: mapped.externalCount});
}
