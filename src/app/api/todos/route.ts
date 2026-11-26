import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {type FileKind, fileKindFromExt, getScriptsRoot, listFolders} from "@/lib/scripts";

/**
 * GET /api/todos
 *
 * Scans every folder's TEXT files — every kind the tree shows
 * (python / java / c / js / ts / shell / ruby / go / markdown /
 * …, via the SAME classifier the explorer uses) — for TODO / FIXME / XXX / HACK
 * markers and returns one entry per occurrence with enough context to
 * jump straight to the line:
 *
 * Response: {
 * ok: true,
 * total: number,
 * todos: [{
 * folder, folderName, file, fileSlug,
 * line, // 1-indexed
 * tag, // TODO | FIXME | XXX | HACK (uppercased)
 * text, // the rest of the line after the marker, trimmed
 * kind // "python" | "markdown" | "text"
 * }]
 * }
 *
 * Entries are grouped by folder then file then line. The scan is a
 * plain read + regex walk (no caching) — cheap for a book-sized
 * project. Files are capped at 1 MB and the result at 500 entries.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 1_000_000;
const MAX_RESULTS = 500;

const TODO_RE = /\b(TODO|FIXME|XXX|HACK)\b[:\s]*(.*)/;

/** Binary / non-prose kinds that never carry scannable comment TODOs. */
const NON_TEXT_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
    "image",
    "video",
    "audio",
    "pdf",
    "csv",
    "spreadsheet",
    "sqlite",
    "ipynb", // JSON structure — its code cells are the .py twin's job
    "other",
]);

/** Every TEXT kind the tree shows — the SAME classifier the explorer uses, so
 * exactly the files the user can open are the ones scanned. */
function isScannable(fileName: string): boolean {
    const ext =
        fileName.startsWith(".") && !path.extname(fileName)
            ? fileName.toLowerCase() // dotfiles classify by whole name
            : path.extname(fileName).toLowerCase();
    const kind = fileKindFromExt(ext);
    return kind !== "other" && !NON_TEXT_KINDS.has(kind);
}

export async function GET() {
    const folders = await listFolders();
    const root = getScriptsRoot();
    const todos: Array<{
        folder: string;
        folderName: string;
        file: string;
        fileSlug: string;
        line: number;
        tag: string;
        text: string;
        kind: string;
    }> = [];

    outer: for (const folder of folders) {
        // folder.files carries .py + .md (+ any .txt) entries — filter to
        // the scannable set instead of walking dataFiles (csv/parquet/…).
        for (const file of folder.files) {
            if (!isScannable(file.name)) continue;
            // RELATIVE path — file.path carries "subdir/file.ext" for
            // nested files; the basename alone missed every subfolder file.
            const rel = file.path ?? file.name;
            const abs = path.join(root, folder.name, rel);
            let source: string;
            try {
                const stat = await fs.stat(abs);
                if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
                source = await fs.readFile(abs, "utf-8");
            } catch {
                continue;
            }
            const ext =
                file.name.startsWith(".") && !path.extname(file.name)
                    ? file.name.toLowerCase()
                    : path.extname(file.name).toLowerCase();
            const kind: string = fileKindFromExt(ext);
            const lines = source.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const m = TODO_RE.exec(lines[i]);
                if (!m) continue;
                todos.push({
                    folder: folder.slug,
                    folderName: folder.name,
                    file: file.name,
                    fileSlug: file.slug,
                    line: i + 1,
                    tag: m[1].toUpperCase(),
                    text: m[2].trim().slice(0, 200),
                    kind,
                });
                if (todos.length >= MAX_RESULTS) break outer;
            }
        }
    }

    return NextResponse.json({ok: true, total: todos.length, todos});
}
