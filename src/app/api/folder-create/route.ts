import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";

/**
 * POST /api/folder-create
 *
 * Body: { name: string, folder?: string, sub?: string }
 *
 * Creates a new empty folder under the scripts root. Used by the
 * "New folder…" action in the Explorer sidebar.
 *
 * when `folder` (+ optional `sub`, a relative folder
 * path inside it) is provided, the folder is created INSIDE that
 * folder — nesting folders inside folders finally works (the old
 * route could only create root-level folders, so the answer to "why
 * can't I create folders inside folders?" was: nobody could).
 *
 * Safety:
 *   - name + sub are sanitized + path-traversal checked.
 *   - Refuses to overwrite an existing folder (409 Conflict).
 *
 * Response: { ok: true, name, slug, dir }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-]{0,63}$/;

export async function POST(request: Request) {
    let body: { name?: string; folder?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {name, folder, sub} = body;
    if (!name) {
        return NextResponse.json({error: "Body must include 'name'."}, {status: 400});
    }
    const cleanName = path.basename(name.trim());
    if (!cleanName) {
        return NextResponse.json({error: "Invalid folder name."}, {status: 400});
    }
    if (cleanName.includes("/") || cleanName.includes("\\") || cleanName.includes("..")) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    if (!NAME_RE.test(cleanName)) {
        return NextResponse.json(
            {error: "Invalid folder name. Must be 1–64 chars, letters/digits/spaces/underscores/hyphens only."},
            {status: 400}
        );
    }
    // resolve the optional parent (folder + sub).
    const cleanSub = (sub ?? "").trim();
    if (cleanSub && (
        cleanSub.includes("..") || cleanSub.includes("\\") ||
        cleanSub.startsWith("/") || cleanSub.endsWith("/") ||
        cleanSub.split("/").some((seg) => !seg || seg.startsWith(".")) ||
        cleanSub.split("/").length > 3
    )) {
        return NextResponse.json({error: "Invalid parent folder path."}, {status: 400});
    }
    const scriptsRoot = getScriptsRoot();
    const folderName = folder ? deslugify(folder) : "";
    if (folder && (!folderName || folderName.includes("/") || folderName.includes("\\") || folderName.includes(".."))) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const parentDir = folderName ? path.join(scriptsRoot, folderName, cleanSub) : scriptsRoot;
    const abs = path.join(parentDir, cleanName);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // Refuse to overwrite an existing folder.
    try {
        await fs.stat(abs);
        return NextResponse.json(
            {error: `A folder named "${cleanName}" already exists.`},
            {status: 409}
        );
    } catch { /* good — doesn't exist */
    }
    // Create.
    try {
        await fs.mkdir(abs, {recursive: true});
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to create folder: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    // `dir` is the new folder's path RELATIVE to its folder ("" for a
    // root-level folder) — the tree uses it to expand + select.
    const dir = folderName ? (cleanSub ? `${cleanSub}/${cleanName}` : cleanName) : "";
    return NextResponse.json({
        ok: true,
        name: cleanName,
        slug: slugify(cleanName),
        folder: folderName || undefined,
        dir,
    });
}
