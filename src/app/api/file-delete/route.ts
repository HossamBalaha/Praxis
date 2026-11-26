import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";

/**
 * POST /api/file-delete
 *
 * Body: { folder: string, file: string }
 *
 * Deletes a single file from a folder folder. Used by the Explorer's
 * right-click "Delete" context menu item.
 *
 * The file must be inside getScriptsRoot (path-traversal guard). If the
 * file doesn't exist, we return 404. If the file is the last one in
 * the folder and the folder becomes empty, we leave the empty
 * folder folder in place (the Explorer shows an "empty" badge).
 *
 * Response: { ok: true, deleted: <fileName>, folder: <folderName> }
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
        return NextResponse.json({error: "Invalid folder or file slug."}, {status: 400});
    }
    // fileName may be a RELATIVE PATH inside the folder
    // (nested files ride the same lossless slug) — nested-safe guard
    // (same as file-write): traversal, backslashes, absolute or
    // trailing-slash forms and empty / dot segments are banned.
    if (
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return NextResponse.json({error: "Invalid file path (traversal or hidden segments not allowed)."}, {status: 400});
    }
    const folderDir = path.join(getScriptsRoot(), folderName);
    const absPath = path.join(folderDir, fileName);
    // Path-traversal guard.
    const rel = path.relative(getScriptsRoot(), absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // Verify it exists and is a file.
    try {
        const stat = await fs.stat(absPath);
        if (!stat.isFile()) {
            return NextResponse.json({error: "Not a file."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    // Delete.
    try {
        await fs.unlink(absPath);
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to delete: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    return NextResponse.json({
        ok: true,
        deleted: fileName,
        slug: slugify(fileName),
        folder: folderName,
    });
}
