import {NextResponse} from "next/server";
import {getPyrightLspManager} from "@/lib/pyright-lsp";
import {joinScriptPath, type LspRequestBody, readLineSnippet, resolveLspDocument, slugify} from "@/lib/lsp-request";
import {mapPrepareRename, mapRenameEdits} from "@/lib/lsp-mapping";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/lsp/rename
 *
 * Semantic project-wide rename (F2) in two phases. Body:
 *   { folder, file, content, line, col, interpreter? }             — phase 1
 *   { ..., mode: "apply", newName: "valid_identifier" }            — phase 2
 *
 * Phase 1 (prepare): asks textDocument/prepareRename. Response:
 *   { ok, available, supported, placeholder?, line?, col?, endCol? }
 *   supported:false → the caret is not on a renameable symbol → the
 *   client falls back to the word-boundary rename flow.
 *
 * Phase 2 (apply): asks textDocument/rename and maps the WorkspaceEdit
 * into the rename-preview dialog's row shape — EXACT (line, col,
 * endCol) edits, no word matching. Response:
 *   { ok, available, supported, source: "pyright", name, files,
 *     totalOccurrences }
 *   files: [{ folder, folderSlug, file, fileSlug, path, isPython,
 *             occurrences: [{ line, col, endCol, snippet, context:
 *             "code", defSite }] }]
 *   — `path` matches /api/file-write's fileName (nested files work);
 *     the dialog applies them with applyExactRenames.
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
        return NextResponse.json({ok: true, available: false, supported: false});
    }
    // The shared document handle.
    const doc = {uri: resolved.doc.uri, text: body.content};

    // ── Phase 1: prepare ─────────────────────────────────────────────
    if (body.mode !== "apply") {
        // Ask the server whether the position is renameable.
        const prepRaw = await manager.prepareRename(doc, line, col);
        // Map it (null → not renameable here).
        const prep = mapPrepareRename(prepRaw);
        // The phase-1 answer.
        if (!prep) {
            return NextResponse.json({ok: true, available: true, supported: false});
        }
        return NextResponse.json({
            ok: true,
            available: true,
            supported: true,
            placeholder: prep.placeholder,
            line: prep.line,
            col: prep.col,
            endCol: prep.endCol
        });
    }

    // ── Phase 2: apply (rename + preview) ────────────────────────────
    // The new name must be a valid identifier.
    const newName = typeof body.newName === "string" ? body.newName.trim() : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
        return NextResponse.json({ok: false, error: "newName must be a valid identifier."}, {status: 400});
    }
    // Ask the server for the edit set.
    const editRaw = await manager.rename(doc, line, col, newName);
    // The snippet reader the mapping calls per row.
    const snippetAt = async (folderName: string, fileName: string, atLine: number) => readLineSnippet(joinScriptPath(folderName, fileName), atLine);
    // Map to the dialog's rows (null when nothing in-project changed).
    const mapped = await mapRenameEdits(editRaw, getScriptsRoot(), slugify, {
        fileName: resolved.doc.fileName,
        line
    }, snippetAt);
    // Nothing renameable / all edits external.
    if (!mapped) {
        return NextResponse.json({ok: true, available: true, supported: false});
    }
    // Enrich to the dialog's exact PreviewFile shape.
    const files = await Promise.all(
        mapped.files.map(async (f) => ({
            folder: f.folderName,
            folderSlug: f.folderSlug,
            file: f.fileName,
            fileSlug: f.fileSlug,
            // The write path (what /api/file-write wants as fileName).
            path: f.fileName,
            isPython: f.isPython,
            occurrences: await Promise.all(
                f.occurrences.map(async (o) => ({
                    line: o.line,
                    col: o.col,
                    endCol: o.endCol,
                    snippet: o.snippet || (await readLineSnippet(joinScriptPath(f.folderName, f.fileName), o.line)),
                    // LSP edits are semantic (code) positions by construction.
                    context: "code" as const,
                    defSite: o.defSite,
                }))
            ),
        }))
    );
    // The phase-2 answer.
    return NextResponse.json({
        ok: true,
        available: true,
        supported: true,
        source: "pyright",
        name: newName,
        files,
        totalOccurrences: mapped.totalOccurrences
    });
}
