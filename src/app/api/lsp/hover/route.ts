import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";
import {type LspRequestBody, resolveLspDocument} from "@/lib/lsp-request";
import {mapHover} from "@/lib/lsp-mapping";

/**
 * POST /api/lsp/hover
 *
 * A typed hover at a position. Body:
 *   { folder, file, content, line, col, interpreter? }
 *
 * `content` is the client's CURRENT buffer (unsaved edits included);
 * the route force-syncs the document to that text BEFORE the hover, so
 * the answer always reflects what the user sees. line/col are 1-based
 * (the app's convention; the manager converts to LSP's 0-based).
 *
 * Response: { ok, available, hover: { title, body? } | null }
 * `hover: null` means "nothing known here" — the caller keeps the
 * regex-symbol hover card it already rendered.
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
        return NextResponse.json({ok: true, available: false, hover: null});
    }
    // The raw hover result (null on timeout — the caller's fallback).
    const raw = await manager.hover({uri: resolved.doc.uri, text: body.content}, line, col);
    // The mapped card (null when nothing usable came back).
    const hover = mapHover(raw);
    // The answer.
    return NextResponse.json({ok: true, available: true, hover});
}
