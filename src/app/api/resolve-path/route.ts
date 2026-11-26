import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";

/**
 * GET /api/resolve-path?folder=<slug>[&file=<slug>][&sub=<relative path>]
 *
 * Returns the ABSOLUTE filesystem path of a folder folder (or a file
 * inside it) — used by the explorer's "Copy absolute path" context-menu
 * action. The browser can't know the server's absolute
 * layout, and the tree only carries display names.
 * `sub` resolves a NESTED subfolder's absolute path (the
 * subfolder rows now have the same Clipboard ▸ menu as the main
 * folder).
 *
 * Read-only: the route never writes, and the slugs pass through the
 * same deslugify + traversal guards every other file route uses.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    const fileSlug = searchParams.get("file") ?? "";
    // optional nested subfolder path.
    const cleanSub = sanitizeSubPath(searchParams.get("sub"));
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    if (!folderSlug) {
        return NextResponse.json({error: "Missing 'folder' query parameter."}, {status: 400});
    }

    const folderName = deslugify(folderSlug);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder name."}, {status: 400});
    }

    let fileName = "";
    if (fileSlug) {
        fileName = deslugify(fileSlug) ?? "";
        if (!fileName) {
            return NextResponse.json({error: "Invalid file slug."}, {status: 400});
        }
        // nested-safe guard (same as file-write) — the file slug
        // may encode a relative path ("Sorting/QuickSort.py").
        if (
            fileName.includes("..") || fileName.includes("\\") ||
            fileName.startsWith("/") || fileName.endsWith("/") ||
            fileName.split("/").some((seg) => !seg || seg.startsWith("."))
        ) {
            return NextResponse.json({error: "Invalid file path (traversal or hidden segments not allowed)."}, {status: 400});
        }
    }

    const root = getScriptsRoot();
    // `sub` segments join between the folder and the (optional)
    // file — file slugs already encode their own relative path.
    const absPath = path.join(root, folderName, ...(cleanSub ? cleanSub.split("/") : []), fileName);
    const rel = path.relative(root, absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    // Report existence so the menu can degrade gracefully instead of
    // copying a path to something the user already deleted.
    let exists = true;
    try {
        await fs.stat(absPath);
    } catch {
        exists = false;
    }

    return NextResponse.json({
        absPath,
        root,
        exists,
        isFile: fileName !== "",
    });
}
