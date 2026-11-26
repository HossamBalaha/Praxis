/**
 * Per-script output cache — stores the last run result for each
 * (folder, file) pair so the UI can restore it when the user
 * re-selects that script.
 *
 * Stored in localStorage (capped at MAX_ENTRIES). Each entry includes
 * the run result + a timestamp so the UI can show "cached · 2m ago".
 */
import {STORAGE_PREFIX} from "@/lib/config";
import type {RunResult} from "@/components/output-panel";

const CACHE_KEY = `${STORAGE_PREFIX}.output-cache`;
const MAX_ENTRIES = 200;

export interface CachedRun {
    /** ISO timestamp of when the run finished. */
    cachedAt: number;
    /** Folder slug. */
    folderSlug: string;
    /** File slug. */
    fileSlug: string;
    /** Folder display name (for the UI). */
    folderName: string;
    /** File display name. */
    fileName: string;
    /** The run result. */
    result: RunResult;
}

type CacheMap = Record<string, CachedRun>; // key = `${folderSlug}/${fileSlug}`

function readAll(): CacheMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as CacheMap;
    } catch {
        return {};
    }
}

function writeAll(map: CacheMap) {
    if (typeof window === "undefined") return;
    try {
        // Cap by recency — keep the newest MAX_ENTRIES.
        const entries = Object.values(map).sort((a, b) => b.cachedAt - a.cachedAt);
        const kept = entries.slice(0, MAX_ENTRIES);
        const next: CacheMap = {};
        for (const e of kept) {
            next[`${e.folderSlug}/${e.fileSlug}`] = e;
        }
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
        /* quota exceeded — drop oldest silently */
    }
}

/** Cache a run result for later restoration. */
export function cacheRun(entry: Omit<CachedRun, "cachedAt">): void {
    const map = readAll();
    map[`${entry.folderSlug}/${entry.fileSlug}`] = {
        ...entry,
        cachedAt: Date.now(),
    };
    writeAll(map);
}

/** Look up a cached run for the given (folder, file) pair. */
export function getCachedRun(
    folderSlug: string,
    fileSlug: string
): CachedRun | null {
    const map = readAll();
    return map[`${folderSlug}/${fileSlug}`] ?? null;
}

/** Clear the entire cache. */
export function clearCache(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(CACHE_KEY);
    } catch {
        /* ignore */
    }
}
