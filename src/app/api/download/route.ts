import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {resolveScriptPath} from "@/lib/scripts";

/**
 * GET /api/download?folder=<slug>&file=<slug>
 *
 * Streams ANY file in a folder as an attachment with a sensible
 * Content-Disposition. Used by the "Download" button in the code
 * viewer header, File ▸ Download Current File, and the explorer's
 * Send ▸ Download. Path resolution + traversal guards are identical
 * to /api/code.
 *
 * the route used to resolve WITHOUT `{ anyKind: true }`
 * — every non-.py file 404'd (File ▸ Download Current File then failed
 * or saved the JSON error text) — and always sent
 * `text/x-python`, a wrong MIME for anything else. It now accepts
 * every kind and picks the Content-Type from the extension, mirroring
 * /api/file's map.
 */

/** Extension → MIME type for the attachment (mirrors /api/file). */
const DOWNLOAD_MIME: Record<string, string> = {
    ".py": "text/x-python; charset=utf-8",
    ".pyw": "text/x-python; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".markdown": "text/markdown; charset=utf-8",
    ".mdx": "text/mdx; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".log": "text/plain; charset=utf-8",
    ".ini": "text/plain; charset=utf-8",
    ".cfg": "text/plain; charset=utf-8",
    ".conf": "text/plain; charset=utf-8",
    ".env": "text/plain; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jsonl": "application/x-ndjson; charset=utf-8",
    ".yaml": "text/yaml; charset=utf-8",
    ".yml": "text/yaml; charset=utf-8",
    ".toml": "text/plain; charset=utf-8",
    ".sql": "text/x-sql; charset=utf-8",
    ".r": "text/x-r; charset=utf-8",
    ".rmd": "text/x-rmd; charset=utf-8",
    ".sh": "text/x-shellscript; charset=utf-8",
    ".bash": "text/x-shellscript; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".tsv": "text/tab-separated-values; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".ts": "text/typescript; charset=utf-8",
    ".tsx": "text/typescript; charset=utf-8",
    ".ipynb": "application/x-ipynb+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".parquet": "application/vnd.apache.parquet",
    ".feather": "application/octet-stream",
    ".db": "application/x-sqlite3",
    ".sqlite": "application/x-sqlite3",
};

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    const fileSlug = searchParams.get("file") ?? "";

    if (!folderSlug || !fileSlug) {
        return NextResponse.json(
            {error: "Missing 'folder' or 'file' query parameter."},
            {status: 400}
        );
    }

    const resolved = await resolveScriptPath(folderSlug, fileSlug, {
        anyKind: true,
    });
    if (!resolved) {
        return NextResponse.json(
            {error: "File not found inside python_scripts/."},
            {status: 404}
        );
    }

    try {
        const data = await fs.readFile(resolved.absPath);
        // Content-Disposition, done correctly: the quoted filename=
        // parameter carries a plain ASCII-folded name (double-encoding it
        // made browsers save "Notes%20With%20Spaces.md"), while the
        // RFC 5987 filename* parameter carries the percent-encoded UTF-8
        // form. Browsers that understand filename* prefer it; the rest
        // fall back to the readable ASCII name.
        const encoded = encodeURIComponent(resolved.fileName);
        const asciiFold = resolved.fileName.replace(/[\r\n"]/g, "_").replace(/[^\x20-\x7E]/g, "_") || "download";
        const ext = path.extname(resolved.fileName).toLowerCase();
        return new Response(new Uint8Array(data), {
            headers: {
                "Content-Type": DOWNLOAD_MIME[ext] ?? "application/octet-stream",
                "Content-Disposition": `attachment; filename="${asciiFold}"; filename*=UTF-8''${encoded}`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        return NextResponse.json(
            {error: `Failed to read file: ${(err as Error).message}`},
            {status: 500}
        );
    }
}
