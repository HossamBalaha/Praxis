import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";

/**
 * POST /api/folder-stats
 *
 * Body: { folder: string, sub?: string }
 *
 * Returns detailed metadata for a folder folder:
 *   - fileCount (total files, including non-Python)
 *   - pythonFileCount (.py files only)
 *   - totalSize (sum of all file sizes in bytes)
 *   - mtime (folder modification time)
 *   - birthtime (folder creation time, if available)
 *   - hasReadme (whether a README.md exists)
 *   - readmeFile (the README filename, if found)
 *   - dataFileCount (non-Python, non-README files)
 *   - largestFile { name, size } (the biggest file in the folder)
 *   - newestFile { name, mtime } (the most recently modified file)
 *
 * Used by the right-click "Properties" context menu on folder rows.
 * `sub` stats a NESTED subfolder instead of the folder
 * root (the subfolder rows' Properties action — same menu as the
 * main folder). The listing walks that subfolder RECURSIVELY so
 * deeper descendants count too.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "folder.md" is the new canonical sidecar name; "chapter.md" /
// "CHAPTER.md" stay as LEGACY candidates so pre-rename projects keep
// their Properties → README detection.
const README_CANDIDATES = ["README.md", "folder.md", "chapter.md", "README.MD", "CHAPTER.md"];

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
    // optional nested subfolder scope.
    const cleanSub = sanitizeSubPath(sub);
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    const folderName = deslugify(folder);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    // Validate the decoded name — prevent path traversal via crafted
    // slugs that decode to "." or "subfolder/another".
    if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder name."}, {status: 400});
    }
    const folderDir = cleanSub
        ? path.join(getScriptsRoot(), folderName, ...cleanSub.split("/"))
        : path.join(getScriptsRoot(), folderName);
    const rel = path.relative(getScriptsRoot(), folderDir);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    let stat;
    try {
        stat = await fs.stat(folderDir);
    } catch {
        return NextResponse.json({error: "Folder not found."}, {status: 404});
    }
    if (!stat.isDirectory()) {
        return NextResponse.json({error: "Not a directory."}, {status: 400});
    }

    // List all files in the folder — non-recursive for the folder root
    // (the original behavior), RECURSIVE for a `sub` scope so deeper
    // descendants count toward the subfolder's stats.
    const files: Array<{ name: string; size: number; mtime: number; isPython: boolean }> = [];
    let hasReadme = false;
    let readmeFile: string | null = null;
    if (cleanSub) {
        const walk = async (dir: string, relDir: string, depth: number): Promise<void> => {
            if (depth > 6) return;
            let subEntries: import("node:fs").Dirent[];
            try {
                subEntries = await fs.readdir(dir, {withFileTypes: true});
            } catch {
                return;
            }
            for (const entry of subEntries) {
                if (entry.isFile()) {
                    try {
                        const s = await fs.stat(path.join(dir, entry.name));
                        const displayName = relDir ? `${relDir}/${entry.name}` : entry.name;
                        files.push({
                            name: displayName,
                            size: s.size,
                            mtime: s.mtimeMs,
                            isPython: entry.name.toLowerCase().endsWith(".py"),
                        });
                        if (README_CANDIDATES.includes(entry.name)) {
                            hasReadme = true;
                            readmeFile = displayName;
                        }
                    } catch {
                        // skip unreadable files
                    }
                } else if (entry.isDirectory()) {
                    await walk(path.join(dir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name, depth + 1);
                }
            }
        };
        await walk(folderDir, "", 0);
    } else {
        let entries: import("node:fs").Dirent[];
        try {
            entries = await fs.readdir(folderDir, {withFileTypes: true});
        } catch {
            return NextResponse.json({error: "Could not read folder."}, {status: 500});
        }
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const full = path.join(folderDir, entry.name);
            try {
                const s = await fs.stat(full);
                const isPython = entry.name.toLowerCase().endsWith(".py");
                files.push({name: entry.name, size: s.size, mtime: s.mtimeMs, isPython});
                if (README_CANDIDATES.includes(entry.name)) {
                    hasReadme = true;
                    readmeFile = entry.name;
                }
            } catch {
                // skip unreadable files
            }
        }
    }

    const fileCount = files.length;
    const pythonFileCount = files.filter((f) => f.isPython).length;
    const totalSize = files.reduce((n, f) => n + f.size, 0);
    const dataFileCount = fileCount - pythonFileCount - (hasReadme ? 1 : 0);

    // Largest + newest file.
    let largestFile: { name: string; size: number } | null = null;
    let newestFile: { name: string; mtime: number } | null = null;
    for (const f of files) {
        if (!largestFile || f.size > largestFile.size) {
            largestFile = {name: f.name, size: f.size};
        }
        if (!newestFile || f.mtime > newestFile.mtime) {
            newestFile = {name: f.name, mtime: f.mtime};
        }
    }

    return NextResponse.json({
        ok: true,
        folderName: cleanSub ? `${folderName}/${cleanSub}` : folderName,
        ...(cleanSub ? {sub: cleanSub} : {}),
        fileCount,
        pythonFileCount,
        dataFileCount,
        totalSize,
        mtime: stat.mtimeMs,
        birthtime: stat.birthtime?.getTime() ?? null,
        hasReadme,
        readmeFile,
        largestFile,
        newestFile,
    });
}
