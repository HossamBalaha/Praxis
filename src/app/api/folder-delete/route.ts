import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/folder-delete
 *
 * Body: { folder: string, sub?: string }
 *
 * Deletes an entire folder folder and all its contents. Used by the
 * Explorer's right-click "Delete" context menu item on folder rows.
 *
 * with `sub` (a relative folder path inside the
 * folder) deletes a NESTED folder instead of the whole folder.
 *
 * Safety:
 *   - The folder must be inside getScriptsRoot (path-traversal guard).
 *   - Refuses to delete the getScriptsRoot itself (folder name must be non-empty).
 *   - Recursive delete (rm -rf equivalent).
 *
 * Response: { ok: true, deleted: <folderName> }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let body: { folder?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, sub} = body;
    if (!folder) {
        return NextResponse.json(
            {error: "Body must include 'folder' slug."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder name."}, {status: 400});
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
    const absPath = path.join(getScriptsRoot(), folderName, cleanSub);
    const rel = path.relative(getScriptsRoot(), absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        return NextResponse.json(
            {error: "Cannot delete the scripts root itself."},
            {status: 400}
        );
    }
    // Verify it exists and is a directory.
    try {
        const stat = await fs.stat(absPath);
        if (!stat.isDirectory()) {
            return NextResponse.json({error: "Not a directory."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "Folder not found."}, {status: 404});
    }
    // Recursive delete.
    try {
        await fs.rm(absPath, {recursive: true, force: true});
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to delete: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    return NextResponse.json({ok: true, deleted: cleanSub ? `${folderName}/${cleanSub}` : folderName});
}
