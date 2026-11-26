import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot,} from "@/lib/scripts";

/**
 * GET /api/data-file?folder=<slug>&name=<filename>
 * GET /api/data-file?folder=<slug>&file=<slug>
 *
 * Serves a non-Python data file (CSV, JSON, parquet, image, etc.) from
 * a folder folder, for preview in the data-file browser. The path is
 * validated against path traversal just like /api/code.
 *
 * The file is addressed EITHER by plain `name` (a file in the folder
 * root — the legacy form) or by `file` (a base64url slug of the
 * file's relative path INSIDE the folder, including subfolders —
 * same contract as /api/data-sheet). The slug form is what the Data
 * File Browser sends for every entry it lists: most data files live
 * in SUBFOLDERS (e.g. "Data & Docs/Data Files/SensorReadings.csv"),
 * and the plain-name form used to resolve those against the folder
 * root — a guaranteed "File not found" for every nested data file.
 *
 * For text files we return the raw content; for binary files (parquet,
 * xlsx, images) we serve them inline with the right content-type so
 * the browser can render them.
 */
const TEXT_EXTS = new Set([
    ".csv", ".tsv", ".json", ".jsonl", ".txt", ".md", ".yaml", ".yml",
    ".toml", ".py",
]);
const BINARY_CONTENT_TYPES: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".parquet": "application/vnd.apache.parquet",
    ".feather": "application/octet-stream",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".db": "application/octet-stream",
    ".sqlite": "application/octet-stream",
    ".h5": "application/x-hdf5",
    ".hdf5": "application/x-hdf5",
    ".pkl": "application/octet-stream",
    ".npz": "application/octet-stream",
    ".npy": "application/octet-stream",
};

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    const name = searchParams.get("name") ?? "";
    const fileSlug = searchParams.get("file") ?? "";
    if (!folderSlug || (!name && !fileSlug)) {
        return NextResponse.json(
            {error: "Missing 'folder' and 'name'/'file' query parameter."},
            {status: 400}
        );
    }
    const folderName = deslugify(folderSlug);
    if (!folderName) {
        return NextResponse.json(
            {error: "Invalid folder slug."},
            {status: 400}
        );
    }
    // Resolve the target relative path: the slug-encoded nested path
    // (preferred — carries subfolders) or the plain root file name.
    // Both forms go through the same traversal guards below.
    const relFile = fileSlug ? deslugify(fileSlug) : name;
    if (
        !relFile ||
        relFile.includes("..") ||
        relFile.includes("\\") ||
        relFile.startsWith("/") ||
        relFile.endsWith("/") ||
        // Plain-name form stays a single filename (original strictness);
        // the slug form legitimately carries "/" for nested files.
        (!fileSlug && name.includes("/"))
    ) {
        return NextResponse.json(
            {error: "Invalid filename."},
            {status: 400}
        );
    }
    const displayName = path.basename(relFile);
    const abs = path.join(getScriptsRoot(), folderName, relFile);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Path traversal blocked."},
            {status: 400}
        );
    }
    try {
        const ext = path.extname(relFile).toLowerCase();
        const data = await fs.readFile(abs);
        // ?download=1 streams the raw bytes as an attachment
        // (the data-browser gallery's Download button).
        // text data files (.csv / .tsv / .jsonl / .txt / .md …) now
        // carry their real text MIME instead of a generic
        // application/octet-stream — downloaded files open inline in
        // editors instead of triggering a "binary" save dance.
        if (searchParams.get("download") === "1") {
            const TEXT_DOWNLOAD_TYPES: Record<string, string> = {
                ".csv": "text/csv; charset=utf-8",
                ".tsv": "text/tab-separated-values; charset=utf-8",
                ".json": "application/json; charset=utf-8",
                ".jsonl": "application/x-ndjson; charset=utf-8",
                ".txt": "text/plain; charset=utf-8",
                ".md": "text/markdown; charset=utf-8",
                ".yaml": "text/yaml; charset=utf-8",
                ".yml": "text/yaml; charset=utf-8",
                ".toml": "text/plain; charset=utf-8",
                ".ini": "text/plain; charset=utf-8",
                ".cfg": "text/plain; charset=utf-8",
            };
            const downloadType =
                TEXT_DOWNLOAD_TYPES[ext] ??
                (TEXT_EXTS.has(ext) ? "text/plain; charset=utf-8" : BINARY_CONTENT_TYPES[ext] ?? "application/octet-stream");
            return new NextResponse(data, {
                headers: {
                    "Content-Type": downloadType,
                    "Content-Disposition": `attachment; filename="${displayName.replace(/[\r\n"]/g, "_").replace(/[^\x20-\x7E]/g, "_") || "download"}"; filename*=UTF-8''${encodeURIComponent(displayName)}`,
                    "Cache-Control": "no-store",
                },
            });
        }
        if (TEXT_EXTS.has(ext)) {
            const text = data.toString("utf-8");
            return NextResponse.json({
                ok: true,
                name: displayName,
                ext,
                size: data.length,
                text: text.slice(0, 200_000), // cap preview at 200 KB
                truncated: text.length > 200_000,
                contentType: "text",
            });
        }
        return NextResponse.json({
            ok: true,
            name: displayName,
            ext,
            size: data.length,
            contentType: "binary",
            mimeType: BINARY_CONTENT_TYPES[ext] ?? "application/octet-stream",
            // For images, return a data URL so the UI can render without
            // another round trip.
            dataUrl:
                ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" ||
                ext === ".webp" || ext === ".svg"
                    ? `data:${BINARY_CONTENT_TYPES[ext]};base64,${data.toString("base64")}`
                    : undefined,
        });
    } catch {
        return NextResponse.json(
            {error: "File not found."},
            {status: 404}
        );
    }
}
