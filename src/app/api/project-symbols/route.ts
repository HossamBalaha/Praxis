import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot, listFolders} from "@/lib/scripts";
import {parsePythonSymbols} from "@/lib/python-symbols";

/**
 * GET /api/project-symbols?query=mean&limit=100
 *
 * Project-wide symbol search (⌘T — VS Code's "Go to Symbol in
 * Workspace"). Walks every folder, parses every .py file with the
 * shared `parsePythonSymbols` extractor (the same one the editor's
 * symbol palette uses), and returns the symbols whose name matches the
 * query (case-insensitive substring). Plain `def` / `class` /
 * `method` symbols are always included; block statements (for/if/…)
 * are skipped — they're fold hints, not navigation targets.
 *
 * Response: {
 *   ok: true,
 *   total: number,            // total matches before the limit
 *   symbols: [{
 *     folder, folderName, file, fileSlug,
 *     name, type, line, args?, docstring?
 *   }]
 * }
 *
 * Files are read fresh per request (a book-sized project is a few
 * hundred files — a full walk is a handful of milliseconds), and each
 * file is capped at 1 MB so a stray data dump can't stall the walk.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 1_000_000;
const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;

export async function GET(request: Request) {
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").trim();
    const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT)
    );

    const folders = await listFolders();
    const symbols: Array<{
        folder: string;
        folderName: string;
        file: string;
        fileSlug: string;
        name: string;
        type: string;
        line: number;
        args?: string;
        docstring?: string;
    }> = [];

    const needle = query.toLowerCase();
    const root = getScriptsRoot();

    for (const folder of folders) {
        for (const file of folder.files) {
            const abs = path.join(root, folder.name, file.name);
            let source: string;
            try {
                const stat = await fs.stat(abs);
                if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
                source = await fs.readFile(abs, "utf-8");
            } catch {
                continue; // unreadable / vanished mid-walk — skip
            }
            for (const sym of parsePythonSymbols(source)) {
                if (
                    sym.type !== "function" &&
                    sym.type !== "class" &&
                    sym.type !== "method"
                ) {
                    continue;
                }
                if (needle && !sym.name.toLowerCase().includes(needle)) continue;
                symbols.push({
                    folder: folder.slug,
                    folderName: folder.name,
                    file: file.name,
                    fileSlug: file.slug,
                    name: sym.name,
                    type: sym.type,
                    line: sym.line,
                    args: sym.args,
                    docstring: sym.docstring,
                });
            }
        }
    }

    return NextResponse.json({
        ok: true,
        total: symbols.length,
        symbols: symbols.slice(0, limit),
    });
}
