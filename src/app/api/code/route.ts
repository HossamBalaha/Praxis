import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import {resolveScriptPath} from "@/lib/scripts";

/**
 * GET /api/code?folder=<slug>&file=<slug>
 *
 * Returns the source text of a single Python file. The file path is
 * rebuilt from the deslugified names and validated to stay inside
 * `python_scripts/`, so crafted slugs cannot escape that directory.
 *
 * Results are cached on globalThis keyed by (absPath, mtimeMs) so
 * re-opening a file is instant even without the client-side cache.
 *
 * Response shape:
 *   {
 *     folder: "Descriptive Statistics",
 *     file: "Brier Score.py",
 *     size: 1234,
 *     content: "...",
 *     language: "python"
 *   }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Server-side code cache (globalThis for HMR survival) ──────────
// Keyed by (absPath, mtimeMs, size) — the size guards against a write
// landing within the same mtime tick.
interface CodeCacheEntry {
    mtime: number;
    size: number;
    body: unknown;
}

const codeCache: Map<string, CodeCacheEntry> = (() => {
    const g = globalThis as unknown as { __codeRouteCache?: Map<string, CodeCacheEntry> };
    if (!g.__codeRouteCache) g.__codeRouteCache = new Map();
    return g.__codeRouteCache;
})();

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

    const resolved = await resolveScriptPath(folderSlug, fileSlug);
    if (!resolved) {
        return NextResponse.json(
            {error: "File not found inside python_scripts/."},
            {status: 404}
        );
    }

    // ── Cache check: return cached result if mtime AND size haven't
    //    changed. This avoids re-reading the file (which triggers Windows
    //    Defender scanning) on every re-open.
    try {
        const stat = await fs.stat(resolved.absPath);
        const cached = codeCache.get(resolved.absPath);
        if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
            return NextResponse.json(cached.body);
        }
        // Read the file + cache the result.
        const content = await fs.readFile(resolved.absPath, "utf-8");
        const body = {
            folder: resolved.folderName,
            file: resolved.fileName,
            size: Buffer.byteLength(content, "utf-8"),
            content,
            language: "python" as const,
        };
        // Evict oldest entry if cache is full (50 files).
        if (codeCache.size >= 50) {
            const firstKey = codeCache.keys().next().value;
            if (firstKey) codeCache.delete(firstKey);
        }
        codeCache.set(resolved.absPath, {mtime: stat.mtimeMs, size: stat.size, body});
        return NextResponse.json(body);
    } catch (err) {
        return NextResponse.json(
            {error: `Failed to read file: ${(err as Error).message}`},
            {status: 500}
        );
    }
}
