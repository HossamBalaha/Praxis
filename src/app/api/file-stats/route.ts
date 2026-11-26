import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/file-stats
 *
 * Body: { folder: string, file: string }
 *
 * Returns detailed metadata for a single file:
 *   - size (bytes)
 *   - mtime (ms since epoch)
 *   - birthtime (creation time, if available)
 *   - extension
 *   - lineCount (for text files)
 *   - wordCount (for text files)
 *   - charCount (character count)
 *   - sha256 (first 16 chars — for change detection, not security)
 *   - isBinary (heuristic: contains null bytes in first 8KB)
 *
 * Used by the right-click "Properties" context menu item to show
 * richer metadata than what the folder-tree carries in memory.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let body: { folder?: string; file?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file} = body;
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    const fileName = deslugify(file);
    if (!folderName || !fileName) {
        return NextResponse.json({error: "Invalid slugs."}, {status: 400});
    }
    // fileName may be a RELATIVE PATH inside the folder —
    // nested-safe guard (same as file-write) so the Properties dialog
    // works for files living inside subfolders.
    if (
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return NextResponse.json({error: "Invalid file path (traversal or hidden segments not allowed)."}, {status: 400});
    }
    const absPath = path.join(getScriptsRoot(), folderName, fileName);
    const rel = path.relative(getScriptsRoot(), absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    let stat;
    try {
        stat = await fs.stat(absPath);
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    if (!stat.isFile()) {
        return NextResponse.json({error: "Not a file."}, {status: 400});
    }

    // Read up to 8KB to detect binary + compute line/word/char counts.
    const HEAD_LIMIT = 8192;
    let content: Buffer;
    try {
        content = await fs.readFile(absPath);
    } catch {
        return NextResponse.json({error: "Could not read file."}, {status: 500});
    }
    const head = content.subarray(0, HEAD_LIMIT);
    const isBinary = head.includes(0x00);

    // Text stats — only meaningful for non-binary files.
    let lineCount = 0;
    let wordCount = 0;
    let charCount = 0;
    if (!isBinary) {
        const text = content.toString("utf-8");
        charCount = text.length;
        lineCount = text.split("\n").length;
        wordCount = (text.match(/\S+/g) ?? []).length;
    }

    // SHA-256 hash (first 16 hex chars — enough for change detection).
    const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);

    // Extension (lowercase, including the dot).
    const ext = path.extname(fileName).toLowerCase();

    return NextResponse.json({
        ok: true,
        size: stat.size,
        mtime: stat.mtimeMs,
        birthtime: stat.birthtime?.getTime() ?? null,
        extension: ext,
        lineCount,
        wordCount,
        charCount,
        sha256: hash,
        isBinary,
    });
}
