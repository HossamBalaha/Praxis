import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";
import {type LspRequestBody, resolveLspDocument} from "@/lib/lsp-request";

/**
 * POST /api/lsp/document
 *
 * The document-sync entry point. Body:
 *   { folder, file, content?, close?, interpreter? }
 *
 * - First post for a file (with content) → textDocument/didOpen.
 * - Later posts with changed content → textDocument/didChange, COALESCED
 *   server-side (~120 ms) so a burst of keystrokes produces ONE
 *   notification — the request-side half of the debouncing contract.
 * - { close: true } → textDocument/didClose (tab switch / unmount).
 * - `interpreter` keys the server instance: a CHANGED path restarts
 *   the sidecar against the new environment (the client passes the
 *   configured Python interpreter).
 *
 * The FIRST call lazily starts the sidecar; when pyright is not
 * installed the route answers ok + available:false (HTTP 200) so the
 * client silently keeps its fallbacks — a missing pyright is a feature
 * downgrade, never an error.
 *
 * Response: { ok, available, state, reason, generation, serverVersion }
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
    // Resolve the (slug) pair to a traversal-checked document.
    const resolved = await resolveLspDocument(body);
    // Malformed input → the exact error.
    if ("error" in resolved) {
        return NextResponse.json({ok: false, error: resolved.error}, {status: 400});
    }
    // The sidecar manager.
    const manager = getPyrightLspManager();
    // The optional configured interpreter.
    const interpreter = typeof body.interpreter === "string" && body.interpreter.trim() ? body.interpreter.trim() : undefined;
    // Start / restart against the requested interpreter.
    const usable = await manager.ensure(interpreter);
    // The not-installed / given-up case — the documented fallback.
    if (!usable) {
        const status = manager.getStatus();
        return NextResponse.json({
            ok: true,
            available: false,
            state: status.state,
            reason: status.reason,
            generation: status.generation,
            serverVersion: status.serverVersion
        });
    }
    // A close request.
    if (body.close === true) {
        // Close it on the server.
        manager.closeDocument(resolved.doc.uri);
    } else {
        // The document text must be a string.
        if (typeof body.content !== "string") {
            return NextResponse.json({ok: false, error: "Body must include 'content' (or close:true)."}, {status: 400});
        }
        // Sync (didOpen on first sight; coalesced didChange after).
        manager.syncDocument({uri: resolved.doc.uri, text: body.content});
    }
    // The post-sync snapshot.
    const status = manager.getStatus();
    return NextResponse.json({
        ok: true,
        available: true,
        state: status.state,
        reason: status.reason,
        generation: status.generation,
        serverVersion: status.serverVersion
    });
}
