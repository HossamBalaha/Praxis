import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";

/**
 * POST /api/file-duplicate
 *
 * Body: { folder: string, file: string }
 *
 * Duplicates a file inside the SAME folder folder. The new name is
 * `<stem> (1).<ext>` (or `(2)`, `(3)`, … if those already exist) — the
 * same convention VSCode uses. Used by the Explorer's right-click
 * "Duplicate" context menu item.
 *
 * Safety:
 *   - folder + file are deslugged + path-traversal checked.
 *   - The new file is written inside the same folderDir only.
 *
 * Response: { ok: true, originalName, newName, originalSlug, newSlug }
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
            {error: "Body must include 'folder' and 'file'."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    const fileName = deslugify(file);
    if (!folderName || !fileName) {
        return NextResponse.json({error: "Invalid slugs."}, {status: 400});
    }
    if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // `file` may be a RELATIVE PATH inside the folder —
    // nested-safe guard (same as file-write) so duplicating files that
    // live inside subfolders works. The DUPLICATE lands in the SAME
    // directory as the source (not the folder root).
    if (
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return NextResponse.json({error: "Invalid file path (traversal or hidden segments not allowed)."}, {status: 400});
    }
    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(scriptsRoot, folderName);
    // Directory part of a nested source ("" for root files).
    const srcDirRel = path.dirname(fileName) === "." ? "" : path.dirname(fileName);
    const srcDirAbs = srcDirRel ? path.join(folderDir, srcDirRel) : folderDir;
    const srcAbs = path.join(folderDir, fileName);
    const srcRel = path.relative(scriptsRoot, srcAbs);
    if (srcRel.startsWith("..") || path.isAbsolute(srcRel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // Verify source exists.
    try {
        const stat = await fs.stat(srcAbs);
        if (!stat.isFile()) {
            return NextResponse.json({error: "Source is not a file."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "Source file not found."}, {status: 404});
    }
    // Compute the new name — `<stem> (N).<ext>` with N starting at 1
    // and incrementing until a free filename is found.
    const ext = path.extname(fileName);
    const stem = path.basename(fileName, ext);
    let counter = 1;
    let newName = "";
    let newAbs = "";
    while (counter < 1000) {
        newName = `${stem} (${counter})${ext}`;
        newAbs = path.join(srcDirAbs, newName);
        try {
            await fs.stat(/* turbopackIgnore: true */ newAbs);
            counter++;
            continue;
        } catch {
            break; // name is free
        }
    }
    if (counter >= 1000) {
        return NextResponse.json(
            {error: "Could not find a free filename for the duplicate (too many copies)."},
            {status: 500}
        );
    }
    // Copy the file.
    try {
        await fs.copyFile(srcAbs, newAbs);
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to duplicate: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    // the new slug keeps the source's relative directory so
    // the tree can select / reveal the duplicate where it landed.
    const newRelPath = srcDirRel ? `${srcDirRel}/${newName}` : newName;
    return NextResponse.json({
        ok: true,
        originalName: path.basename(fileName),
        newName,
        originalSlug: slugify(fileName),
        newSlug: slugify(newRelPath),
    });
}
