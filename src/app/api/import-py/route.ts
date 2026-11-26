import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";
// 
// working"): .py edits save through THIS route, but only
// /api/file-write (the non-Python path) took snapshots — so the
// Local History dialog stayed empty for every Python edit. The
// pre-write content is now snapshotted through the shared helper the
// list / diff / restore routes already read.
import {saveLocalHistorySnapshot} from "../local-history/list/route-helpers";

/**
 * POST /api/import-py
 *
 * Body: { folder, fileName, content }
 *
 * Writes a .py file directly into the folder folder. Used by the
 * drag-drop .py import feature.
 *
 * Response: { ok, file, slug, path }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let body: { folder?: string; fileName?: string; content?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, fileName, content} = body;
    if (!folder || !fileName || content === undefined) {
        return NextResponse.json(
            {error: "Body must include 'folder', 'fileName', and 'content'."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    // Sanitize filename.
    const pyName = fileName.endsWith(".py") ? fileName : fileName + ".py";
    if (pyName.includes("/") || pyName.includes("\\") || pyName.includes("..")) {
        return NextResponse.json({error: "Invalid filename."}, {status: 400});
    }

    const folderDir = path.join(getScriptsRoot(), folderName);
    await fs.mkdir(folderDir, {recursive: true});
    const abs = path.join(folderDir, pyName);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // LOCAL HISTORY: capture the PRE-WRITE content so the Local History
    // dialog can roll back (best-effort — a first save has none).
    let preWriteContent: string | null = null;
    try {
        preWriteContent = await fs.readFile(abs, "utf-8");
    } catch { /* new file — no snapshot */
    }
    await fs.writeFile(abs, content, "utf-8");
    if (preWriteContent !== null) {
        await saveLocalHistorySnapshot(folder, slugify(pyName), preWriteContent);
    }

    return NextResponse.json({
        ok: true,
        file: pyName,
        slug: slugify(pyName),
        path: abs,
    });
}
