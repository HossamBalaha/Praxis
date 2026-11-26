import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";

/**
 * POST /api/folder-rename
 *
 * Body: { folder: string, newName: string, sub?: string }
 *
 * Renames a folder folder. Used by the Explorer's right-click
 * "Rename…" context menu item on folder rows.
 *
 * with `sub` (a relative folder path inside the
 * folder) renames a NESTED folder in place.
 *
 * Safety:
 *   - The folder must be inside getScriptsRoot (path-traversal guard).
 *   - Refuses to overwrite an existing folder (409 Conflict).
 *   - newName must match NAME_RE (letters, digits, spaces, underscores,
 *     hyphens; 1–64 chars).
 *
 * Response: { ok: true, oldName, newName, oldSlug, newSlug, dir }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-]{0,63}$/;

export async function POST(request: Request) {
    let body: { folder?: string; newName?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, newName, sub} = body;
    if (!folder || !newName) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'newName'."},
            {status: 400}
        );
    }
    const oldName = deslugify(folder);
    const newNameClean = path.basename(newName.trim());
    if (!oldName || !newNameClean) {
        return NextResponse.json({error: "Invalid names."}, {status: 400});
    }
    // Validate BOTH old and new names — prevent path traversal via
    // crafted slugs that decode to "../something" or "subfolder/another".
    if (oldName.includes("/") || oldName.includes("\\") || oldName.includes("..") ||
        newNameClean.includes("/") || newNameClean.includes("\\") || newNameClean.includes("..")) {
        return NextResponse.json({error: "Invalid folder name."}, {status: 400});
    }
    if (!NAME_RE.test(newNameClean)) {
        return NextResponse.json(
            {error: "Invalid new folder name. Must be 1–64 chars, letters/digits/spaces/underscores/hyphens only."},
            {status: 400}
        );
    }
    // optional nested folder path inside the folder.
    const cleanSub = (sub ?? "").trim();
    if (cleanSub && (
        cleanSub.includes("..") || cleanSub.includes("\\") ||
        cleanSub.startsWith("/") || cleanSub.endsWith("/") ||
        cleanSub.split("/").some((seg) => !seg || seg.startsWith("."))
    )) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    const parentDir = path.join(getScriptsRoot(), oldName, cleanSub ? path.dirname(cleanSub) : "");
    const oldAbs = path.join(getScriptsRoot(), oldName, cleanSub);
    const newAbs = path.join(parentDir, newNameClean);
    const oldRel = path.relative(getScriptsRoot(), oldAbs);
    const newRel = path.relative(getScriptsRoot(), newAbs);
    if (oldRel.startsWith("..") || path.isAbsolute(oldRel) ||
        newRel.startsWith("..") || path.isAbsolute(newRel) ||
        oldRel === "" || newRel === "") {
        return NextResponse.json(
            {error: "Cannot rename the scripts root itself."},
            {status: 400}
        );
    }
    // Verify old folder exists.
    try {
        const stat = await fs.stat(oldAbs);
        if (!stat.isDirectory()) {
            return NextResponse.json({error: "Source is not a directory."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "Source folder not found."}, {status: 404});
    }
    // Verify new folder doesn't already exist.
    try {
        await fs.stat(newAbs);
        return NextResponse.json(
            {error: `A folder named "${newNameClean}" already exists.`},
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
    return NextResponse.json({
        ok: true,
        oldName,
        newName: newNameClean,
        oldSlug: slugify(oldName),
        newSlug: slugify(oldName), // folder slug is UNCHANGED for nested renames
        dir: cleanSub || "",
    });
}
