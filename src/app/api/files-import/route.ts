import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath, slugify} from "@/lib/scripts";

/**
 * POST /api/files-import
 *
 * Body: {
 * folder: string,
 * sub?: string, // relative sub-folder path inside the folder
 * files: Array<{ name: string; content: string; encoding?: "utf-8" | "base64" }>,
 * overwrite?: boolean // default false
 * }
 *
 * Writes one or more files into a folder folder. Used by the
 * drag-and-drop file import feature when the user drops files onto a
 * folder row in the sidebar (and the "Upload files here…" context
 * action — also from subfolder rows, with `sub`).
 *
 * - When `overwrite` is false (default), files that already exist on
 * disk are SKIPPED and reported in the response. The client can then
 * prompt the user (overwrite / overwrite all / skip / skip all) and
 * re-call with overwrite=true for the chosen files.
 * - When `overwrite` is true, existing files are replaced.
 * - Text files use `encoding: "utf-8"` (default). Binary files (images,
 * PDFs, audio, video,.xlsx,.zip, etc.) use `encoding: "base64"` so
 * they survive JSON transport intact.
 *
 * Response: {
 * ok: true,
 * imported: Array<{ name, slug, path, overwritten }>,
 * skipped: Array<{ name, reason }> // reason = "exists" by default
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportFile {
    name: string;
    content: string;
    encoding?: "utf-8" | "base64";
}

/** Same filename policy as /api/file-create: the import
 *  path only blocked separators and ".." — a file named "x & calc.py"
 *  was accepted, and on Windows the lint / git-diff routes passed it
 *  unquoted through shell:true, injecting a second command. */
const NAME_RE = /^[A-Za-z0-9\u00C0-\u024F][A-Za-z0-9 _\-.()\u00C0-\u024F]{0,200}(?:\.[A-Za-z0-9]+)+$/;

export async function POST(request: Request) {
    let body: { folder?: string; sub?: string; files?: ImportFile[]; overwrite?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, sub, files, overwrite = false} = body;
    if (!folder || !Array.isArray(files) || files.length === 0) {
        return NextResponse.json(
            {error: "Body must include 'folder' and a non-empty 'files' array."},
            {status: 400}
        );
    }
    // optional nested destination.
    const cleanSub = sanitizeSubPath(sub);
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }

    const folderName = deslugify(folder);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }

    const folderDir = cleanSub
        ? path.join(getScriptsRoot(), folderName, ...cleanSub.split("/"))
        : path.join(getScriptsRoot(), folderName);
    await fs.mkdir(folderDir, {recursive: true});

    const imported: Array<{ name: string; slug: string; path: string; overwritten: boolean }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const f of files) {
        // Sanitize filename — no path separators, no parent traversal, and
        // the file-create NAME_RE policy ("&", "|", "^" and other
        // shell metacharacters are rejected instead of reaching routes
        // that pass filenames to spawned commands).
        const fname = path.basename(f.name);
        if (
            !fname ||
            fname.includes("/") ||
            fname.includes("\\") ||
            fname.includes("..") ||
            !NAME_RE.test(fname)
        ) {
            skipped.push({name: f.name, reason: "invalid filename"});
            continue;
        }
        const abs = path.join(folderDir, fname);
        const rel = path.relative(getScriptsRoot(), abs);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            skipped.push({name: fname, reason: "path traversal blocked"});
            continue;
        }

        let exists = false;
        try {
            await fs.stat(abs);
            exists = true;
        } catch {
            exists = false;
        }

        if (exists && !overwrite) {
            skipped.push({name: fname, reason: "exists"});
            continue;
        }

        // Write — base64 for binary, utf-8 for text.
        try {
            if (f.encoding === "base64") {
                const buf = Buffer.from(f.content, "base64");
                await fs.writeFile(abs, buf);
            } else {
                await fs.writeFile(abs, f.content, "utf-8");
            }
        } catch (e) {
            skipped.push({
                name: fname,
                reason: `write failed: ${e instanceof Error ? e.message : String(e)}`,
            });
            continue;
        }
        // the slug encodes the RELATIVE path (sub-aware) so the
        // tree resolves nested imports like every other file.
        const relPath = cleanSub ? `${cleanSub}/${fname}` : fname;
        imported.push({
            name: fname,
            slug: slugify(relPath),
            path: abs,
            overwritten: exists,
        });
    }

    return NextResponse.json({ok: true, imported, skipped});
}
