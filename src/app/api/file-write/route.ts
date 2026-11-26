import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";
// file-write's inline snapshot block moved into the
// shared saveLocalHistorySnapshot helper so /api/import-py (the .py
// editing path — the one that was NEVER snapshotting) writes the same
// layout through the exact same code.
import {saveLocalHistorySnapshot} from "../local-history/list/route-helpers";

/**
 * POST /api/file-write
 *
 * Body: { folder, fileName, content }
 *
 * Writes text content to ANY file inside a folder folder — not just
 * .py files (the existing /api/import-py route forces a .py extension,
 * so we need a separate route for editing markdown / text / json /
 * yaml / toml files via the FileViewer).
 *
 * Path traversal is blocked by re-resolving the path from the
 * deslugged folder + fileName and verifying the resolved path
 * stays inside the scripts root.
 *
 * The fileName is validated to:
 *   - not contain path separators or `..`
 *   - not start with `.` (no hidden files)
 *
 * the README.md / folder.md write BAN was lifted — those
 * files are now ordinary markdown files (listed in the folder tree,
 * rendered + edited by the FileViewer), so they save through this
 * route like any other text file.
 *
 * Response: { ok, file, size }
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
    // Sanitize filename. fileName may now be a RELATIVE
    // PATH inside the folder ("data/raw/load.py") — nested files ride
    // the same lossless slug. What stays banned: traversal, absolute
    // paths, backslashes, empty/dot segments, hidden basenames.
    if (
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return NextResponse.json({error: "Invalid file path (traversal or hidden segments not allowed)."}, {status: 400});
    }
    const baseName = path.basename(fileName);
    if (baseName.startsWith(".")) {
        return NextResponse.json({error: "Hidden files cannot be edited."}, {status: 400});
    }

    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(scriptsRoot, folderName);
    const abs = path.join(folderDir, fileName);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    try {
        // Ensure the folder dir exists (it should already, but be safe).
        // mkdir the file's PARENT so a first save of a
        // nested file ("sub/new.py") works even before its folder is listed.
        await fs.mkdir(path.dirname(abs), {recursive: true});
        // Capture the pre-write content so we can save a local-history snapshot.
        let preWriteContent: string | null = null;
        try {
            preWriteContent = await fs.readFile(abs, "utf-8");
        } catch { /* new file — no pre-write snapshot */
        }
        await fs.writeFile(abs, content, "utf-8");
        // Save snapshot to local-history (best-effort, shared helper).
        if (preWriteContent !== null) {
            await saveLocalHistorySnapshot(folder, slugify(fileName), preWriteContent);
        }
        const stat = await fs.stat(abs);
        return NextResponse.json({
            ok: true,
            file: fileName,
            size: stat.size,
        });
    } catch (err) {
        return NextResponse.json(
            {error: `Could not write file: ${(err as Error).message}`},
            {status: 500}
        );
    }
}
