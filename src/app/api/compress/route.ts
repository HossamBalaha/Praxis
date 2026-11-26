import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";
import {buildZip, type ZipInput} from "@/lib/zip";
import {ZIP_LIMITS} from "@/lib/unzip";

/**
 * POST /api/compress
 *
 * Builds a.zip archive of a FILE or a FOLDER (recursively) and stores
 * it ON DISK — unlike /api/folder-zip (which streams a download), the
 * user picks WHERE the archive lands:
 *
 * destMode: "same" → the source's containing folder (a file's own
 * folder; a folder's PARENT, so the archive sits
 * next to it like Windows "Send to ▸ Compressed
 * folder").
 * destMode: "path" → an absolute, existing directory anywhere on
 * the machine (chosen with the compress dialog's
 * folder browser).
 *
 * Body:
 * { kind: "file" | "folder",
 * folder: string, // folder slug
 * sub?: string, // relative subfolder path (folder kind)
 * file?: string, // file slug / relative path (file kind)
 * zipName?: string, // archive name (".zip" optional)
 * destMode: "same" | "path",
 * destPath?: string } // required when destMode === "path"
 *
 * Safety:
 * - slugs are deslugified + traversal-checked (same pattern as
 * folder-zip / file-stats); `sub` passes sanitizeSubPath; `file`
 * uses the nested-safe guard.
 * - destPath must be an ABSOLUTE path to an existing directory and
 * may not be inside (or equal to) the app's own directory.
 * - the archive name is sanitized (no separators, no "..", length
 * capped) and never overwrites an existing file — " (2)", " (3)"…
 * suffixes are appended on collision.
 * - total uncompressed size and entry count are capped by the SAME
 * limits the upload-zip reader enforces (ZIP_LIMITS).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompressBody {
    kind?: "file" | "folder";
    folder?: string;
    sub?: string;
    file?: string;
    zipName?: string;
    destMode?: "same" | "path";
    destPath?: string;
}

/** Nested-safe file-slug guard (same rule as file-stats / file-write):
 *  the slug may be a RELATIVE path inside the folder — no traversal,
 *  no backslashes, no absolute or hidden segments. */
function validFileSlug(fileName: string): boolean {
    return !(
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    );
}

/** Turn a user/defaults archive name into a safe file name (no path
 * semantics survive). Returns null when nothing usable is left. */
function sanitizeArchiveName(raw: string): string | null {
    const base = raw.trim().replace(/\.zip$/i, "");
    const cleaned = base.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_").trim();
    if (!cleaned || cleaned.startsWith(".")) return null;
    return cleaned.slice(0, 120);
}

/** Never overwrite: "name.zip", "name (2).zip", "name (3).zip"… */
async function availablePath(dir: string, name: string): Promise<string> {
    const candidate = path.join(dir, `${name}.zip`);
    try {
        await fs.access(candidate);
    } catch {
        return candidate; // free — use it
    }
    for (let n = 2; n < 100; n++) {
        const next = path.join(dir, `${name} (${n}).zip`);
        try {
            await fs.access(next);
        } catch {
            return next;
        }
    }
    return path.join(dir, `${name} (${Date.now()}).zip`);
}

export async function POST(request: Request) {
    let body: CompressBody;
    try {
        body = (await request.json()) as CompressBody;
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const kind = body.kind === "file" ? "file" : body.kind === "folder" ? "folder" : null;
    if (!kind) {
        return NextResponse.json({error: "kind must be 'file' or 'folder'."}, {status: 400});
    }
    const folderSlug = body.folder ?? "";
    if (!folderSlug) {
        return NextResponse.json({error: "Missing 'folder'."}, {status: 400});
    }
    const folderName = deslugify(folderSlug);
    if (!folderName || folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const cleanSub = sanitizeSubPath(body.sub);
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }

    const root = getScriptsRoot();
    let sourcePath: string;
    let defaultName: string;

    if (kind === "file") {
        const fileName = deslugify(body.file ?? "");
        if (!fileName || !validFileSlug(fileName)) {
            return NextResponse.json({error: "Invalid file path."}, {status: 400});
        }
        sourcePath = path.join(root, folderName, fileName);
        const rel = path.relative(root, sourcePath);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
        }
        let st;
        try {
            st = await fs.stat(sourcePath);
        } catch {
            return NextResponse.json({error: "File not found."}, {status: 404});
        }
        if (!st.isFile()) {
            return NextResponse.json({error: "Not a file."}, {status: 400});
        }
        defaultName = path.basename(fileName);
    } else {
        sourcePath = cleanSub
            ? path.join(root, folderName, ...cleanSub.split("/"))
            : path.join(root, folderName);
        const rel = path.relative(root, sourcePath);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
        }
        let st;
        try {
            st = await fs.stat(sourcePath);
        } catch {
            return NextResponse.json({error: "Folder not found."}, {status: 404});
        }
        if (!st.isDirectory()) {
            return NextResponse.json({error: "Not a folder."}, {status: 400});
        }
        // The archive root keeps the on-disk layout: folder/… or folder/sub/…
        defaultName = cleanSub ? `${folderName}_${cleanSub.replace(/\//g, "_")}` : folderName;
    }

    // ── Destination ─────────────────────────────────────────────────
    let destDir: string;
    if (body.destMode === "path") {
        const raw = (body.destPath ?? "").trim();
        if (!raw || !path.isAbsolute(raw)) {
            return NextResponse.json({error: "destPath must be an absolute folder path."}, {status: 400});
        }
        const resolved = path.resolve(raw);
        let st;
        try {
            st = await fs.stat(resolved);
        } catch {
            return NextResponse.json({error: "Destination folder not found."}, {status: 404});
        }
        if (!st.isDirectory()) {
            return NextResponse.json({error: "Destination is not a folder."}, {status: 400});
        }
        // The app's own CODE (src/, .next/, node_modules/…) is off-limits,
        // but the PROJECTS area inside it (the scripts root — where the
        // "same folder" mode writes anyway) stays a valid destination.
        // (turbopackIgnore: cwd is a runtime value — see src/lib/scripts.ts.)
        const appDir = path.resolve(/* turbopackIgnore: true */ process.cwd());
        const relToApp = path.relative(appDir, resolved);
        const insideApp = relToApp === "" || (!relToApp.startsWith("..") && !path.isAbsolute(relToApp));
        if (insideApp) {
            const scriptsRoot = getScriptsRoot();
            const relToScripts = path.relative(scriptsRoot, resolved);
            const insideScripts =
                relToScripts === "" || (!relToScripts.startsWith("..") && !path.isAbsolute(relToScripts));
            if (!insideScripts) {
                return NextResponse.json(
                    {error: "The destination may not be inside the app's own code folders — pick the projects area or any other location."},
                    {status: 400}
                );
            }
        }
        destDir = resolved;
    } else {
        // "Same folder": the FILE's folder, or the folder's PARENT (the
        // archive lands NEXT TO the zipped folder, Windows-style).
        destDir = path.dirname(sourcePath);
    }

    const archiveName = sanitizeArchiveName(body.zipName ?? defaultName);
    if (!archiveName) {
        return NextResponse.json({error: "Invalid archive name."}, {status: 400});
    }

    // ── Collect entries ─────────────────────────────────────────────
    const entries: ZipInput[] = [];
    if (kind === "file") {
        const data = await fs.readFile(sourcePath);
        if (data.length > ZIP_LIMITS.maxTotalBytes) {
            return NextResponse.json({error: "File exceeds the 2 GB zip limit."}, {status: 413});
        }
        entries.push({name: path.basename(sourcePath), data, mtime: (await fs.stat(sourcePath)).mtime});
    } else {
        const prefix = `${folderName}/${cleanSub ? cleanSub + "/" : ""}`;
        let totalBytes = 0;
        const walkStack: string[][] = [[""]];
        while (walkStack.length > 0) {
            const [relDir] = walkStack.pop()!;
            const absDir = relDir ? path.join(sourcePath, relDir) : sourcePath;
            let names: string[];
            try {
                names = await fs.readdir(absDir);
            } catch {
                continue; // unreadable subfolder — skip rather than fail the zip
            }
            names.sort();
            for (const name of names) {
                const relPath = relDir ? `${relDir}/${name}` : name;
                const absPath = path.join(absDir, name);
                let st;
                try {
                    st = await fs.stat(absPath);
                } catch {
                    continue;
                }
                if (st.isDirectory()) {
                    walkStack.push([relPath]);
                    continue;
                }
                if (!st.isFile()) continue;
                if (entries.length >= ZIP_LIMITS.maxEntries) {
                    return NextResponse.json(
                        {error: `Folder has more than ${ZIP_LIMITS.maxEntries} files — too many to zip.`},
                        {status: 413}
                    );
                }
                totalBytes += st.size;
                if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
                    return NextResponse.json(
                        {error: "Folder contents exceed the 2 GB zip limit."},
                        {status: 413}
                    );
                }
                try {
                    const data = await fs.readFile(absPath);
                    entries.push({name: `${prefix}${relPath}`, data, mtime: st.mtime});
                } catch {
                    // Locked/unreadable file — skip it, keep zipping the rest.
                }
            }
        }
        if (entries.length === 0) {
            return NextResponse.json({error: "Folder is empty — nothing to compress."}, {status: 400});
        }
    }

    // ── Build + write ───────────────────────────────────────────────
    let archive: Buffer;
    try {
        archive = buildZip(entries);
    } catch (err) {
        return NextResponse.json(
            {error: `Could not build the zip: ${err instanceof Error ? err.message : String(err)}`},
            {status: 500}
        );
    }

    const destPathFinal = await availablePath(destDir, archiveName);
    try {
        await fs.writeFile(destPathFinal, archive);
    } catch (err) {
        return NextResponse.json(
            {error: `Could not write the archive: ${err instanceof Error ? err.message : String(err)}`},
            {status: 500}
        );
    }

    return NextResponse.json({
        ok: true,
        path: destPathFinal,
        name: path.basename(destPathFinal),
        sizeBytes: archive.length,
        entryCount: entries.length,
    });
}
