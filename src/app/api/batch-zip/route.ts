import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {buildZip, type ZipInput} from "@/lib/zip";
import {ZIP_LIMITS} from "@/lib/unzip";

/**
 * POST /api/batch-zip
 * Body: { entries: [{ folder: <folder slug>, file: <file slug> }, …] }
 *
 * the deferred "Zip selected" bulk op: archives the
 * multi-selected FILES (they may live in different folders and
 * subfolders) into ONE zip download. File slugs are lossless
 * base64url of the file's path RELATIVE to its folder (including any
 * nested sub-directory), so each entry resolves exactly like
 * /api/file does — path.join(scriptsRoot, folderName, fileName) with
 * a traversal re-check.
 *
 * Unreadable/missing entries are SKIPPED (reported via the
 * X-Praxis-Entries response header so the client toast can say how
 * many made it). The same ZIP_LIMITS caps the upload-zip reader apply
 * here (entry count + total bytes).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchZipEntry {
    folder?: unknown;
    file?: unknown;
}

export async function POST(request: Request) {
    let body: { entries?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const rawEntries = Array.isArray(body.entries) ? (body.entries as BatchZipEntry[]) : [];
    if (rawEntries.length === 0) {
        return NextResponse.json({error: "No files selected — nothing to zip."}, {status: 400});
    }
    if (rawEntries.length > ZIP_LIMITS.maxEntries) {
        return NextResponse.json(
            {error: `Too many files selected (${rawEntries.length} > ${ZIP_LIMITS.maxEntries}).`},
            {status: 413}
        );
    }

    const scriptsRoot = getScriptsRoot();
    const entries: ZipInput[] = [];
    const seen = new Set<string>();
    let totalBytes = 0;

    for (const raw of rawEntries) {
        const folderSlug = typeof raw.folder === "string" ? raw.folder : "";
        const fileSlug = typeof raw.file === "string" ? raw.file : "";
        if (!folderSlug || !fileSlug) continue; // malformed entry — skip
        const folderName = deslugify(folderSlug);
        const fileName = deslugify(fileSlug);
        if (!folderName || !fileName) continue;

        // Same resolution + traversal guard as /api/file.
        const abs = path.join(scriptsRoot, folderName, fileName);
        const rel = path.relative(scriptsRoot, abs);
        if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") continue;
        // Dedupe — the same file can only enter the archive once.
        if (seen.has(rel)) continue;

        let st: Awaited<ReturnType<typeof fs.stat>>;
        try {
            st = await fs.stat(abs);
        } catch {
            continue; // deleted since the selection was made — skip
        }
        if (!st.isFile()) continue;

        totalBytes += st.size;
        if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
            return NextResponse.json(
                {error: "Selection exceeds the 2 GB zip limit."},
                {status: 413}
            );
        }
        try {
            const data = await fs.readFile(abs);
            seen.add(rel);
            // Entry names mirror the on-disk layout: folder/subdir/file.ext.
            entries.push({name: rel.split(path.sep).join("/"), data, mtime: st.mtime});
        } catch {
            // Locked/unreadable file — skip it, keep zipping the rest.
        }
    }

    if (entries.length === 0) {
        return NextResponse.json(
            {error: "None of the selected files could be read — nothing to zip."},
            {status: 400}
        );
    }

    let archive: Buffer;
    try {
        archive = buildZip(entries);
    } catch (err) {
        return NextResponse.json(
            {error: `Could not build zip: ${err instanceof Error ? err.message : String(err)}`},
            {status: 500}
        );
    }

    return new NextResponse(new Uint8Array(archive), {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="praxis-selection-${entries.length}-files.zip"`,
            "Content-Length": String(archive.length),
            // How many selected files actually made it into the archive.
            "X-Praxis-Entries": String(entries.length),
            "Cache-Control": "no-store",
        },
    });
}
