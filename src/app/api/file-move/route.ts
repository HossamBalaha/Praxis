import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath, slugify} from "@/lib/scripts";

/**
 * POST /api/file-move
 *
 * Body: { fromFolder: string, file: string, toFolder: string, toSub?: string, newName?: string, overwrite?: boolean }
 *
 * Moves a file from one folder to another. Used by the Explorer's
 * right-click "Cut" → "Paste" workflow (and "Move to…" if added later).
 *
 * - If `newName` is omitted, the original filename is kept.
 * - If a file with the target name already exists in `toFolder`, we
 * return 409 Conflict — unless `overwrite: true` (the
 *   paste-conflict dialog can now answer "overwrite" for moves too,
 *   not just copies).
 * - Path traversal is blocked on all three slugs.
 * - `toSub` (relative sub-folder path inside `toFolder`,
 *   validated by sanitizeSubPath) lands the file in a NESTED
 *   subfolder — the subfolder rows' "Paste" action (subfolders now
 *   have the same menu as the main folder).
 *
 * Response: { ok: true, oldName, newName, oldFolder, newFolder, oldSlug, newSlug, overwritten }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-.()]{0,200}\.[A-Za-z0-9]+$/;

export async function POST(request: Request) {
    let body: {
        fromFolder?: string;
        file?: string;
        toFolder?: string;
        toSub?: string;
        newName?: string;
        overwrite?: boolean
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {fromFolder, file, toFolder, toSub, newName, overwrite = false} = body;
    if (!fromFolder || !file || !toFolder) {
        return NextResponse.json(
            {error: "Body must include 'fromFolder', 'file', and 'toFolder'."},
            {status: 400}
        );
    }
    const fromName = deslugify(fromFolder);
    const toName = deslugify(toFolder);
    const fileName = deslugify(file);
    if (!fromName || !toName || !fileName) {
        return NextResponse.json({error: "Invalid slugs."}, {status: 400});
    }
    if (
        fromName.includes("/") || fromName.includes("\\") || fromName.includes("..") ||
        toName.includes("/") || toName.includes("\\") || toName.includes("..")
    ) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // `file` may be a RELATIVE PATH inside the folder
    // Nested files ride the same lossless slug. Same nested-safe
    // guard as file-write: traversal, absolute
    // or trailing-slash forms, backslashes, empty / dot segments are
    // banned; clean relative segments are allowed so drag-and-drop and
    // cut/paste work for files living inside subfolders.
    if (
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return NextResponse.json({error: "Invalid file path (traversal or hidden segments not allowed)."}, {status: 400});
    }
    const targetName = newName ? path.basename(newName.trim()) : path.basename(fileName);
    if (targetName.includes("/") || targetName.includes("\\") || targetName.includes("..")) {
        return NextResponse.json({error: "Invalid target name."}, {status: 400});
    }
    // optional nested destination — validated by the shared
    // guard ("" = the folder root, exactly the old behavior).
    const cleanSub = sanitizeSubPath(toSub);
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    if (!NAME_RE.test(targetName)) {
        return NextResponse.json(
            {error: "Invalid target filename. Must be 1–200 chars, start with a letter/digit, and end with an extension."},
            {status: 400}
        );
    }
    const scriptsRoot = getScriptsRoot();
    const fromDir = path.join(scriptsRoot, fromName);
    // the destination honors the `toSub` path.
    const toDir = cleanSub ? path.join(scriptsRoot, toName, ...cleanSub.split("/")) : path.join(scriptsRoot, toName);
    const srcAbs = path.join(fromDir, fileName);
    const dstAbs = path.join(toDir, targetName);
    const srcRel = path.relative(scriptsRoot, srcAbs);
    const dstRel = path.relative(scriptsRoot, dstAbs);
    if (srcRel.startsWith("..") || path.isAbsolute(srcRel) ||
        dstRel.startsWith("..") || path.isAbsolute(dstRel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // Source must exist.
    try {
        const stat = await fs.stat(srcAbs);
        if (!stat.isFile()) {
            return NextResponse.json({error: "Source is not a file."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "Source file not found."}, {status: 404});
    }
    // Target must NOT exist — unless overwrite was explicitly requested
    //.
    let overwritten = false;
    try {
        await fs.stat(dstAbs);
        if (!overwrite) {
            return NextResponse.json(
                {error: `A file named "${targetName}" already exists in "${toName}${cleanSub ? "/" + cleanSub : ""}".`},
                {status: 409}
            );
        }
        overwritten = true;
        await fs.rm(dstAbs, {force: true});
    } catch { /* good — doesn't exist */
    }
    // Ensure target dir exists.
    await fs.mkdir(toDir, {recursive: true});
    // Move.
    try {
        await fs.rename(srcAbs, dstAbs);
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to move: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    // the slug encodes the full RELATIVE path at the
    // destination (sub-aware) so tabs / selections keep pointing at the
    // moved file wherever it landed.
    const newRelPath = cleanSub ? `${cleanSub}/${targetName}` : targetName;
    const oldRelPath = fileName;
    return NextResponse.json({
        ok: true,
        oldName: path.basename(fileName),
        newName: targetName,
        oldFolder: fromName,
        newFolder: toName,
        ...(cleanSub ? {newSub: cleanSub} : {}),
        oldSlug: slugify(oldRelPath),
        newSlug: slugify(newRelPath),
        oldFolderSlug: slugify(fromName),
        newFolderSlug: slugify(toName),
        overwritten,
    });
}
