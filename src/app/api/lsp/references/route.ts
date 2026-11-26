import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";
import {joinScriptPath, type LspRequestBody, readLineSnippet, resolveLspDocument, slugify} from "@/lib/lsp-request";
import {mapReferenceLocations} from "@/lib/lsp-mapping";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/lsp/references
 *
 * Semantic find-references (⇧F12). Body:
 *   { folder, file, content, line, col, interpreter? }
 *
 * Response: { ok, available, hits }
 *   hits: ReferenceHit[] — the SAME shape /api/full-text-search feeds
 *   the peek-references popup and the Find Usages dialog
 *   ({ folder, folderSlug, file, fileSlug, line, snippet }), so the
 *   popup consumes LSP results and text-search results identically.
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
        return NextResponse.json({ok: true, available: false, hits: []});
    }
    // The raw references result.
    const raw = await manager.references({uri: resolved.doc.uri, text: body.content}, line, col);
    // The mapped rows (external locations dropped).
    const rows = mapReferenceLocations(raw, getScriptsRoot(), slugify);
    // Enrich each row with its line's text (the popup shows snippets).
    const hits = await Promise.all(
        rows.map(async (row) => ({
            folder: row.folderName,
            folderSlug: row.folderSlug,
            file: row.fileName,
            fileSlug: row.fileSlug,
            line: row.line,
            snippet: await readLineSnippet(joinScriptPath(row.folderName, row.fileName), row.line),
        }))
    );
    // The answer.
    return NextResponse.json({ok: true, available: true, hits});
}
