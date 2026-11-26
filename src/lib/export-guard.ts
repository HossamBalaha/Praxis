import fs from "node:fs/promises";

/**
 * Shared guard for the report-style exports (Markdown / HTML /
 * notebook): their whole value is a faithful TEXT rendering of the
 * file, so a binary source (a .xlsx, a .parquet, a .db, an image…)
 * must be refused up front instead of being piped through utf-8
 * decoding into a mojibake fence / cell.
 */

/** Extensions that are binary by definition. */
const BINARY_EXTS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif", ".tif", ".tiff",
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a",
    ".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv",
    ".pdf",
    ".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".zst",
    ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".wasm", ".pyc",
    ".db", ".sqlite", ".sqlite3", ".db3",
    ".xlsx", ".xls", ".parquet", ".feather", ".arrow", ".h5", ".hdf5", ".npy", ".npz", ".pkl", ".joblib",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

/** Is this file name binary by extension? */
export function isBinaryFileName(fileName: string): boolean {
    const m = fileName.toLowerCase().match(/\.[^.]+$/);
    return m ? BINARY_EXTS.has(m[0]) : false;
}

/**
 * Read a file as exportable UTF-8 text. Returns null when the file is
 * binary (known-binary extension, or a NUL byte in the first 8 KB —
 * every real binary format has one that early) or cannot be read.
 */
export async function readSourceText(absPath: string, fileName: string): Promise<string | null> {
    let buf: Buffer;
    try {
        buf = await fs.readFile(absPath);
    } catch {
        return null;
    }
    if (buf.length === 0) return "";
    if (isBinaryFileName(fileName)) return null;
    const probe = buf.subarray(0, 8192);
    if (probe.includes(0)) return null;
    return buf.toString("utf-8");
}
