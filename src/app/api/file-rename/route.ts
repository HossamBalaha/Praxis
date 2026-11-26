import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";

/**
 * POST /api/file-rename
 *
 * Body: { folder: string, file: string, newName: string }
 *
 * Renames a file within the same folder folder. Used by the Explorer's
 * right-click "Rename…" context menu item.
 *
 * The new name must be a valid filename (no path separators, no parent
 * traversal). If a file with the new name already exists in the same
 * folder, we return 409 Conflict.
 *
 * Response: { ok: true, oldName, newName, oldSlug, newSlug }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-.()]{0,200}\.[A-Za-z0-9]+$/;

export async function POST(request: Request) {
    let body: { folder?: string; file?: string; newName?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file, newName} = body;
    if (!folder || !file || !newName) {
        return NextResponse.json(
            {error: "Body must include 'folder', 'file', and 'newName'."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    const oldFileName = deslugify(file);
    const newFileName = path.basename(newName.trim());
    if (!folderName || !oldFileName || !newFileName) {
        return NextResponse.json({error: "Invalid slugs."}, {status: 400});
    }
    if (!NAME_RE.test(newFileName)) {
        return NextResponse.json(
            {error: "Invalid new filename. Must be 1–200 chars, start with a letter/digit, and end with an extension."},
            {status: 400}
        );
    }
    const folderDir = path.join(getScriptsRoot(), folderName);
    // nested files — oldFileName may be a relative path
    // The rename stays INSIDE that directory
    // (path.dirname), and the new slug keeps the directory part so tabs
    // / selections keep pointing at the file. Root files are unchanged.
    const srcDirRel = path.dirname(oldFileName) === "." ? "" : path.dirname(oldFileName);
    const oldAbs = path.join(folderDir, oldFileName);
    const newAbs = srcDirRel ? path.join(folderDir, srcDirRel, newFileName) : path.join(folderDir, newFileName);
    // Path-traversal guard.
    const oldRel = path.relative(getScriptsRoot(), oldAbs);
    const newRel = path.relative(getScriptsRoot(), newAbs);
    if (oldRel.startsWith("..") || path.isAbsolute(oldRel) ||
        newRel.startsWith("..") || path.isAbsolute(newRel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // Verify old file exists.
    try {
        const stat = await fs.stat(oldAbs);
        if (!stat.isFile()) {
            return NextResponse.json({error: "Source is not a file."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "Source file not found."}, {status: 404});
    }
    // Verify new file doesn't already exist.
    try {
        await fs.stat(newAbs);
        return NextResponse.json(
            {error: `A file named "${newFileName}" already exists in this folder.`},
            {status: 409}
        );
    } catch { /* good — doesn't exist */
    }
    // Rename.
    try {
        await fs.rename(oldAbs, newAbs);
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to rename: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    // slugs keep the relative directory part.
    const newRelPath = srcDirRel ? `${srcDirRel}/${newFileName}` : newFileName;
    return NextResponse.json({
        ok: true,
        oldName: path.basename(oldFileName),
        newName: newFileName,
        oldSlug: slugify(oldFileName),
        newSlug: slugify(newRelPath),
    });
}
