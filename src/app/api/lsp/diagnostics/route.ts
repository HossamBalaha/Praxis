import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";
import {type LspRequestBody, resolveLspDocument} from "@/lib/lsp-request";
import {mapDiagnostics} from "@/lib/lsp-mapping";

/**
 * GET /api/lsp/diagnostics?folder=<slug>&file=<slug>
 *
 * The PULL side of live diagnostics: the sidecar pushes
 * textDocument/publishDiagnostics to the manager (which caches the
 * latest per file); this route maps the cache into the app's
 * Diagnostic shape — the SAME { line, col, severity, message } rows
 * the ruff live-lint path renders as squiggles, so the viewer merges
 * both sources without knowing where they came from.
 *
 * `version` is a per-file monotonic counter; the client re-renders
 * only when it changes (poll responses are cheap by construction).
 *
 * Response: { ok, available, diagnostics, version }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    // The query parameters.
    const {searchParams} = new URL(request.url);
    // Build the resolver input from the slugs.
    const body: LspRequestBody = {folder: searchParams.get("folder") ?? "", file: searchParams.get("file") ?? ""};
    // Resolve the document.
    const resolved = await resolveLspDocument(body);
    // Malformed input.
    if ("error" in resolved) {
        return NextResponse.json({ok: false, error: resolved.error}, {status: 400});
    }
    // The sidecar manager.
    const manager = getPyrightLspManager();
    // The cached diagnostics for this uri (null = nothing published yet).
    const cached = manager.getDiagnostics(resolved.doc.uri);
    // The mapped rows (empty when nothing arrived).
    const diagnostics = cached ? mapDiagnostics(cached.diagnostics) : [];
    // The answer.
    return NextResponse.json({ok: true, available: true, diagnostics, version: cached?.version ?? 0});
}
