/**
 * lsp-request.ts — the shared body parsing + file resolution behind the
 * /api/lsp/* routes.
 *
 * Every LSP route receives (folderSlug, fileSlug, content, …) from the
 * client. This module turns that into the (uri, absPath) pairing the
 * sidecar manager speaks, through the SAME path-traversal-guarded
 * resolver every other file route uses (lib/scripts.ts) — a crafted
 * slug can no more escape the scripts root through the LSP routes than
 * through /api/code.
 *
 * Also hosts the bounded line-snippet reader both the references and
 * rename routes use to enrich their rows (the dialogs show the line's
 * text next to every hit).
 */

import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {getScriptsRoot, resolveScriptPath, slugify} from "@/lib/scripts";

/** A resolved document reference (what the routes hand the manager). */
export interface LspDocumentRef {
    /** The file:// uri the LSP speaks. */
    uri: string;
    /** The absolute, traversal-checked path. */
    absPath: string;
    /** The display folder name. */
    folderName: string;
    /** The display file name (relative path inside the folder). */
    fileName: string;
}

/** The parsed body every LSP route accepts (all fields optional here). */
export interface LspRequestBody {
    folder?: unknown;
    file?: unknown;
    content?: unknown;
    line?: unknown;
    col?: unknown;
    newName?: unknown;
    mode?: unknown;
    interpreter?: unknown;
    close?: unknown;
}

/** A missing file's absPath for the snippet reader (cache-free). */
const SNIPPET_MAX_BYTES = 2_000_000;

/**
 * Resolve the (folderSlug, fileSlug) from a request body to a
 * traversal-checked LSP document reference. Returns an error string
 * for every malformed input — routes answer 400 with it verbatim.
 */
export async function resolveLspDocument(body: unknown): Promise<{ error: string } | { doc: LspDocumentRef }> {
    // The body must be an object.
    if (!body || typeof body !== "object") {
        return {error: "Body must be a JSON object."};
    }
    // Narrow it.
    const b = body as LspRequestBody;
    // The folder slug.
    if (typeof b.folder !== "string" || !b.folder) {
        return {error: "Body must include a 'folder' slug."};
    }
    // The file slug.
    if (typeof b.file !== "string" || !b.file) {
        return {error: "Body must include a 'file' slug."};
    }
    // Resolve through the shared, traversal-guarded resolver (Python
    // files only — the sidecar is a Python language server).
    const resolved = await resolveScriptPath(b.folder, b.file);
    // Unknown / non-Python / escaping paths all land here.
    if (!resolved) {
        return {error: "File not found inside python_scripts/."};
    }
    // The complete reference.
    return {
        doc: {
            uri: pathToFileURL(resolved.absPath).href,
            absPath: resolved.absPath,
            folderName: resolved.folderName,
            fileName: resolved.fileName,
        },
    };
}

/**
 * Read one line of a file as a display snippet (trimmed, capped).
 * Returns "" on any failure — a snippet is cosmetic, never fatal.
 */
export async function readLineSnippet(absPath: string, line: number): Promise<string> {
    try {
        // Read the whole file (bounded by the caller's file-size discipline).
        const stat = await fs.stat(absPath);
        // Oversized files are skipped rather than read.
        if (!stat.isFile() || stat.size > SNIPPET_MAX_BYTES) return "";
        // Read it.
        const content = await fs.readFile(absPath, "utf-8");
        // The requested line (1-based).
        const text = content.split("\n")[line - 1];
        // Trim + cap for the row display.
        return (text ?? "").trim().slice(0, 200);
    } catch {
        // Any failure — an empty snippet.
        return "";
    }
}

/** The absolute path for a (folderName, fileName) pair INSIDE the root. */
export function joinScriptPath(folderName: string, fileName: string): string {
    // Join against the live scripts root.
    return path.join(getScriptsRoot(), folderName, ...fileName.split("/"));
}

/** Re-export so the routes can build response slugs without extra imports. */
export {slugify};
