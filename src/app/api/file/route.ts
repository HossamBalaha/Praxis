import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * GET /api/file?folder=<slug>&file=<slug>
 *
 * Serves ANY file from a folder folder as raw bytes with the right
 * Content-Type header, so the browser can render it directly via
 * `<img src="/api/file?…">`, `<video src="/api/file?…">`,
 * `<iframe src="/api/file?…">` for PDFs, etc.
 *
 * This is the generic file-serving endpoint backing the "real file
 * explorer" feature — every file kind (image, video, audio, PDF,
 * markdown, text, JSON, …) is served through this one route. The
 * file viewer component decides how to render it.
 *
 * Path traversal is blocked by re-resolving the path from the
 * deslugged folder + file names and verifying the resolved path
 * stays inside the scripts root.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extensions whose bytes are safe to browser-cache for an hour —
 *  immutable-in-practice MEDIA only. Everything else revalidates. */
const CACHEABLE_MEDIA_EXTS: ReadonlySet<string> = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
    ".mp4", ".webm", ".ogg", ".ogv", ".mov", ".mkv",
    ".mp3", ".wav", ".flac", ".m4a", ".aac", ".opus",
    ".pdf",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

function isCacheableMediaExt(ext: string): boolean {
    return CACHEABLE_MEDIA_EXTS.has(ext);
}

/** Extension → MIME type map for inline rendering. */
const MIME_TYPES: Record<string, string> = {
    // Text
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
    ".R": "text/x-r; charset=utf-8",
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
    // Registry language extensions — the kinds arrived without the
    // MIME entries, so they all served as
    // application/octet-stream.
    ".java": "text/x-java-source; charset=utf-8",
    ".c": "text/x-c; charset=utf-8",
    ".h": "text/x-c; charset=utf-8",
    ".cpp": "text/x-c++; charset=utf-8",
    ".cc": "text/x-c++; charset=utf-8",
    ".cxx": "text/x-c++; charset=utf-8",
    ".hpp": "text/x-c++; charset=utf-8",
    ".hh": "text/x-c++; charset=utf-8",
    ".m": "text/x-objc; charset=utf-8",
    ".rb": "text/x-ruby; charset=utf-8",
    ".rbw": "text/x-ruby; charset=utf-8",
    ".gemspec": "text/x-ruby; charset=utf-8",
    ".php": "application/x-httpd-php; charset=utf-8",
    ".go": "text/x-go; charset=utf-8",
    ".lua": "text/x-lua; charset=utf-8",
    ".pl": "text/x-perl; charset=utf-8",
    ".pm": "text/x-perl; charset=utf-8",
    ".rs": "text/rust; charset=utf-8",
    ".jl": "text/x-julia; charset=utf-8",
    ".kt": "text/x-kotlin; charset=utf-8",
    ".kts": "text/x-kotlin; charset=utf-8",
    ".swift": "text/x-swift; charset=utf-8",
    // the Windows-native scripting pair.
    ".ps1": "text/x-powershell; charset=utf-8",
    ".psm1": "text/x-powershell; charset=utf-8",
    ".psd1": "text/x-powershell; charset=utf-8",
    ".bat": "text/plain; charset=utf-8",
    ".cmd": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    // Images
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
    // Video
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogv": "video/ogg",
    ".mkv": "video/x-matroska",
    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    // Documents
    ".pdf": "application/pdf",
    ".ipynb": "application/x-ipynb+json",
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
    const folderName = deslugify(folderSlug);
    const fileName = deslugify(fileSlug);
    if (!folderName || !fileName) {
        return NextResponse.json(
            {error: "Invalid folder or file slug."},
            {status: 400}
        );
    }

    const scriptsRoot = getScriptsRoot();
    const abs = path.join(scriptsRoot, folderName, fileName);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Path traversal blocked."},
            {status: 400}
        );
    }

    try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) {
            return NextResponse.json(
                {error: "Not a file."},
                {status: 400}
            );
        }
    } catch {
        return NextResponse.json(
            {error: "File not found."},
            {status: 404}
        );
    }

    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    const data = await fs.readFile(abs);
    return new NextResponse(data, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Content-Length": String(data.length),
            "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
            // MEDIA (images / video / audio / pdf) benefits from the
            // browser HTTP cache — the bytes rarely change and re-downloads
            // are expensive. TEXT content must ALWAYS revalidate: a saved
            // edit re-fetched within the hour used to come back from the
            // HTTP cache as the PRE-SAVE copy (a “save did not work”
            // illusion — the disk file was fine, the view was stale).
            "Cache-Control": isCacheableMediaExt(ext) ? "public, max-age=3600" : "no-store",
        },
    });
}
