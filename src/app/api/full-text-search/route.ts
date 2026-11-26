import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, listFolders, sanitizeSubPath} from "@/lib/scripts";

/**
 * GET /api/full-text-search?q=<query>&limit=<N>[&folder=<slug>][&sub=<relative path>]
 *
 * Searches the content of every .py file across every folder for the
 * given query (case-insensitive substring match). Returns up to `limit`
 * (default 50) hits, each with a 2-line context snippet.
 * `sub` scopes the search to files INSIDE that nested
 * subfolder (the subfolder rows' "Search in folder…" action) and the
 * per-file path now resolves through the file's path-encoding slug,
 * so NESTED files are finally searchable at all (the old basename
 * join silently missed every file below the folder root).
 *
 * Response: {
 *   query,
 *   hits: [{ folder, folderSlug, file, fileSlug, line, snippet }]
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Hit {
    folder: string;
    folderSlug: string;
    file: string;
    fileSlug: string;
    line: number;
    snippet: string;
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const q = (searchParams.get("q") ?? "").toLowerCase().trim();
    const parsedLimit = parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;
    // optional folder scope — the explorer's "Find in
    // folder…" full-text action searches only that folder.
    const folderScope = searchParams.get("folder") ?? "";
    // optional sub-folder scope INSIDE the folder ("" = whole
    // folder, matching by exact dir or descendants).
    const subScope = sanitizeSubPath(searchParams.get("sub"));
    if (subScope === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    if (!q) {
        return NextResponse.json({query: "", hits: []});
    }

    const folders = await listFolders();
    const hits: Hit[] = [];

    outer:
        for (const folder of folders) {
            if (folder.isEmpty) continue;
            if (folderScope && folder.slug !== folderScope) continue;
            for (const file of folder.files) {
                // scope to the subfolder when `sub` is set.
                if (subScope) {
                    const dir = file.dir ?? "";
                    if (dir !== subScope && !dir.startsWith(subScope + "/")) continue;
                }
                // resolve through the file's slug (which encodes the
                // RELATIVE path) — the old basename join missed nested files.
                const relFile = file.path ?? deslugify(file.slug);
                const abs = path.join(getScriptsRoot(), folder.name, ...relFile.split("/"));
                let source: string;
                try {
                    source = await fs.readFile(abs, "utf-8");
                } catch {
                    continue;
                }
                const lines = source.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(q)) {
                        const start = Math.max(0, i - 1);
                        const end = Math.min(lines.length, i + 2);
                        const snippet = lines.slice(start, end).join("\n");
                        hits.push({
                            folder: folder.name,
                            folderSlug: folder.slug,
                            file: file.name,
                            fileSlug: file.slug,
                            line: i + 1,
                            snippet,
                        });
                        if (hits.length >= limit) break outer;
                    }
                }
            }
        }

    return NextResponse.json({query: q, hits, ...(folderScope ? {folderScope} : {}), ...(subScope ? {subScope} : {})});
}
