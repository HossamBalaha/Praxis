import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot, listFolders} from "@/lib/scripts";
import {findSymbolOccurrences, isPythonSourceFile, type OccurrenceContext,} from "@/lib/symbol-matching";

/**
 * GET /api/rename-preview?name=<identifier>
 *
 * Server-side, whole-project occurrence scan for the rename preview
 * dialog. This exists because the previous rename flow discovered
 * candidate files through /api/full-text-search, which (a) caps at 100
 * LINE hits — a file with many occurrences could crowd out other files
 * entirely — and (b) knows nothing about comments, strings, or def
 * sites. This route walks every folder itself and classifies each
 * whole-word occurrence through the SAME pure matcher the client
 * re-runs right before writing (src/lib/symbol-matching.ts), so the
 * preview the user reviews is the exact set the apply will act on.
 *
 * Response (HTTP 200, ok: true):
 * {
 *   ok: true,
 *   name,
 *   files: [{
 *     folder, folderSlug, file, fileSlug, path, isPython,
 *     occurrences: [{ line, col, start, end, snippet, context, defSite }]
 *   }],
 *   totalOccurrences, truncated
 * }
 *
 * Occurrence `start`/`end` are 0-based character offsets into the file
 * AS SCANNED; the apply re-reads the file and recomputes them, so they
 * are advisory (line/col/snippet are what the UI shows).
 *
 * Windows note: absolute paths are built with path.join on the
 * server; every key handed to the client (folderSlug/fileSlug/path)
 * stays forward-slash-normalized.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Files above this size are skipped — a rename preview should be
 *  instant, and a 2 MB text file is never a sane rename target. */
const MAX_FILE_BYTES = 2_000_000;
/** Hard caps so a degenerate project can't balloon the response. */
const MAX_FILES = 400;
const MAX_OCCURRENCES_PER_FILE = 400;

/** FileKind values that never join a rename scan: binary media/data
 *  kinds (reading them as utf-8 yields garbage "matches" — the smoke
 *  run caught .zip/.xz archives matching inside compressed bytes), .ipynb
 *  (its JSON wraps source in stringified lists — a word-boundary
 *  rename there corrupts notebooks rather than renaming code), and
 *  "other" (the viewer's own "Unsupported file type" bucket). */
const SKIP_KINDS = new Set(["image", "video", "audio", "pdf", "spreadsheet", "ipynb", "other"]);

interface PreviewOccurrence {
    line: number;
    col: number;
    start: number;
    end: number;
    snippet: string;
    context: OccurrenceContext;
    defSite: boolean;
}

interface PreviewFile {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    /** Forward-slash RELATIVE path inside the folder (the write route's
     *  `fileName` for nested files — the display `file` is only the
     *  basename, which would write to the folder root). */
    path: string;
    isPython: boolean;
    occurrences: PreviewOccurrence[];
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const name = (searchParams.get("name") ?? "").trim();
    // The apply validates the identifier client-side too — but refusing
    // here keeps the scan cheap and the contract obvious.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        return NextResponse.json(
            {ok: false, error: "name must be a valid identifier."},
            {status: 400}
        );
    }

    const scriptsRoot = getScriptsRoot();
    const folders = await listFolders();
    const files: PreviewFile[] = [];
    let totalOccurrences = 0;
    let truncated = false;

    // Folder-level parallelism mirrors listFolders' own fan-out; within
    // a folder the walk is sequential so one huge folder can't starve
    // the event loop with hundreds of concurrent reads.
    await Promise.all(
        folders.map(async (folder) => {
            if (folder.isEmpty) return;
            for (const file of folder.files) {
                if (files.length >= MAX_FILES) {
                    truncated = true;
                    return;
                }
                // Skip binary kinds outright — reading them as utf-8 is wasted
                // I/O and their "matches" would be garbage anyway.
                if (file.kind && SKIP_KINDS.has(file.kind)) continue;
                if (file.size > MAX_FILE_BYTES) continue;
                const relPath = file.path ?? file.name;
                const abs = path.join(scriptsRoot, folder.name, ...relPath.split("/"));
                let source: string;
                try {
                    source = await fs.readFile(abs, "utf-8");
                } catch {
                    continue; // unreadable / racing delete — not a rename target
                }
                const occurrences = findSymbolOccurrences(source, name, relPath);
                if (occurrences.length === 0) continue;
                const capped = occurrences.slice(0, MAX_OCCURRENCES_PER_FILE);
                if (capped.length < occurrences.length) truncated = true;
                totalOccurrences += capped.length;
                files.push({
                    folder: folder.name,
                    folderSlug: folder.slug,
                    file: file.name,
                    fileSlug: file.slug,
                    path: relPath,
                    isPython: isPythonSourceFile(relPath),
                    occurrences: capped.map((o) => ({
                        line: o.line,
                        col: o.col,
                        start: o.start,
                        end: o.end,
                        snippet: o.lineText,
                        context: o.context,
                        defSite: o.defSite,
                    })),
                });
            }
        })
    );

    // Stable order: folder, then path — the preview groups by file, so
    // a deterministic listing keeps re-scans comparable at a glance.
    files.sort((a, b) =>
        `${a.folder}/${a.path}`.localeCompare(`${b.folder}/${b.path}`, "en", {sensitivity: "base"})
    );

    return NextResponse.json({
        ok: true,
        name,
        files,
        totalOccurrences,
        truncated,
    });
}
