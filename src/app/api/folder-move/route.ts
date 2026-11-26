import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";

/**
 * POST /api/folder-move
 *
 * Body: { fromFolder: string, dir: string, toFolder: string, toSub?: string }
 *
 * moves a whole NESTED
 * subfolder (everything under `fromFolder/<dir>`) into another folder
 * — either its root or a nested subfolder there (`toSub`). The
 * explorer's subfolder rows are now DRAGGABLE and this route is what
 * their drop resolves to (mirroring how file rows move via
 * /api/file-move).
 *
 *  - `dir` is the RELATIVE path of the subfolder being moved, e.g.
 *    "Sorting" or "Sorting/Inner". Its basename is kept at the
 *    destination ("Sorting" dropped on folder B → B/Sorting).
 *  - Guards: no traversal (sanitizeSubPath on all three relative
 *    paths), source must exist as a directory, destination must NOT
 *    already contain a folder/file with the same name (409 — the
 *    client toasts it; no silent merge, exactly like VS Code).
 *  - A folder can never be moved INTO ITSELF or one of its own
 *    descendants (that would create an impossible cycle) — 400.
 *  - Same-place drops (identical absolute source/destination) are a
 *    400 no-op the client filters out before calling.
 *
 * Response: { ok: true, name, fromFolder, toFolder, toSub }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    let body: { fromFolder?: string; dir?: string; toFolder?: string; toSub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {fromFolder, dir, toFolder, toSub} = body;
    if (!fromFolder || !dir || !toFolder) {
        return NextResponse.json(
            {error: "Body must include 'fromFolder', 'dir', and 'toFolder'."},
            {status: 400}
        );
    }

    const fromName = deslugify(fromFolder);
    const toName = deslugify(toFolder);
    if (!fromName || !toName) {
        return NextResponse.json({error: "Invalid folder slugs."}, {status: 400});
    }
    if (
        fromName.includes("/") || fromName.includes("\\") || fromName.includes("..") ||
        toName.includes("/") || toName.includes("\\") || toName.includes("..")
    ) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    // The subfolder being moved — a clean RELATIVE path inside fromFolder.
    const cleanDir = sanitizeSubPath(dir);
    if (cleanDir === null || cleanDir === "") {
        return NextResponse.json(
            {error: "Invalid 'dir' — must be a relative subfolder path (not the folder root)."},
            {status: 400}
        );
    }
    // The destination parent — "" = the target folder's root.
    const cleanToSub = sanitizeSubPath(toSub);
    if (cleanToSub === null) {
        return NextResponse.json({error: "Invalid 'toSub' sub-folder path."}, {status: 400});
    }

    const root = getScriptsRoot();
    const srcDir = path.join(root, fromName, ...cleanDir.split("/"));
    const parentDir = path.join(root, toName, ...(cleanToSub ? cleanToSub.split("/") : []));
    const baseName = cleanDir.split("/").pop()!;
    const dstDir = path.join(parentDir, baseName);

    // Both must stay under the scripts root.
    for (const [label, p] of [["source", srcDir], ["destination", dstDir]] as const) {
        const rel = path.relative(root, p);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json({error: `Path traversal blocked on ${label}.`}, {status: 400});
        }
    }

    // No moving a folder into itself or one of its own descendants.
    const dstRelToSrc = path.relative(srcDir, dstDir);
    if (dstRelToSrc === "" || (!dstRelToSrc.startsWith("..") && !dstRelToSrc.startsWith(`..${path.sep}`))) {
        return NextResponse.json(
            {error: "A folder cannot be moved into itself or one of its own subfolders."},
            {status: 400}
        );
    }

    let srcStat;
    try {
        srcStat = await fs.stat(srcDir);
    } catch {
        return NextResponse.json({error: "The subfolder no longer exists (refresh the tree)."}, {status: 404});
    }
    if (!srcStat.isDirectory()) {
        return NextResponse.json({error: "'dir' is not a folder."}, {status: 400});
    }

    // Same-place drop (same folder, dir already lives at the destination).
    if (srcDir === dstDir) {
        return NextResponse.json({error: "Already there — nothing to move."}, {status: 400});
    }

    // Destination parent must exist (it came from the live tree, but a
    // concurrent rename could have removed it).
    try {
        const parentStat = await fs.stat(parentDir);
        if (!parentStat.isDirectory()) {
            return NextResponse.json({error: "Destination is not a folder."}, {status: 400});
        }
    } catch {
        return NextResponse.json({error: "Destination folder not found (refresh the tree)."}, {status: 404});
    }

    // No silent merges — a same-named entry at the destination is a 409.
    try {
        await fs.access(dstDir);
        return NextResponse.json(
            {
                error: `"${baseName}" already exists inside "${toName}${cleanToSub ? "/" + cleanToSub : ""}" — rename one of them first.`,
            },
            {status: 409}
        );
    } catch {
        /* good — no collision */
    }

    try {
        await fs.rename(srcDir, dstDir);
    } catch (err) {
        return NextResponse.json(
            {error: `Move failed: ${err instanceof Error ? err.message : String(err)}`},
            {status: 500}
        );
    }

    return NextResponse.json({
        ok: true,
        name: baseName,
        fromFolder: fromName,
        toFolder: toName,
        toSub: cleanToSub,
    });
}
