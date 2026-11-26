/**
 * fold-state.ts — persisted code-folding state (edit mode).
 *
 * Collapsed fold ranges should survive a reload: the viewer restores the
 * fold KEYS (the stable `type:name` — see the fold KEY strategy note in
 * code-viewer.tsx) it saved for a file on mount, and writes the current
 * set back on every fold toggle (throttled by the caller).
 *
 * Storage shape (localStorage, key "praxis.fold-state"):
 *
 *   { "<folderSlug>/<fileSlug>": ["def:foo", "class:Bar#12", …], … }
 *
 * The map is LRU-capped at FOLD_STATE_MAX_FILES entries so an endlessly
 * rotating workspace can't grow it unboundedly — the LEAST recently
 * written file's folds are dropped first (write order = recency).
 *
 * Everything here is pure + synchronous + window-guarded so it can run
 * during SSR (returns empty / no-ops) and be unit-tested in node with a
 * stubbed localStorage.
 */

/** The single localStorage key (deliberately WITHOUT a numeric suffix). */
export const FOLD_STATE_STORAGE_KEY = "praxis.fold-state";

/** LRU cap — at most this many files keep persisted folds. */
export const FOLD_STATE_MAX_FILES = 50;

/** One file's persisted fold keys (the `type:name[#line]` strings). */
export type FoldEntry = string[];

/** The whole persisted map: stable file id → fold keys. */
export type FoldStateMap = Record<string, FoldEntry>;

/** Read the persisted map. Degrades to {} when storage is missing or
 *  the JSON is malformed (never throws — fold persistence is a nicety,
 *  not an error surface). */
export function loadFoldState(): FoldStateMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(FOLD_STATE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const out: FoldStateMap = {};
        // Validate per-file entries as they're read — one corrupted entry
        // must not take the whole map down.
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof key !== "string" || !key) continue;
            if (!Array.isArray(value)) continue;
            const arr = value.filter((k): k is string => typeof k === "string" && k.length > 0);
            if (arr.length > 0) out[key] = arr;
        }
        return out;
    } catch {
        return {};
    }
}

/** Restore the fold keys for one file id (empty array when none
 *  persisted — callers just skip the update then). */
export function restoreFoldKeys(fileId: string): FoldEntry {
    if (!fileId) return [];
    return loadFoldState()[fileId] ?? [];
}

/**
 * Persist `keys` for `fileId`, LRU-capped. The entry moves to the MOST
 * recent position (delete + re-insert keeps insertion order = recency)
 * and the map is trimmed to FOLD_STATE_MAX_FILES by dropping the oldest
 * entries first. A `keys` array of length 0 still writes an explicit
 * empty entry — "the user unfolded everything" is real state that should
 * survive a reload too.
 */
export function saveFoldState(fileId: string, keys: FoldEntry): void {
    if (typeof window === "undefined") return;
    if (!fileId) return;
    try {
        const map = loadFoldState();
        // Recency bump: delete first so the re-insert lands at the END of
        // the key order (Object.entries preserves string-key insertion
        // order for non-integer keys — exactly what the LRU trim needs).
        delete map[fileId];
        map[fileId] = Array.from(keys);
        const entries = Object.entries(map);
        if (entries.length > FOLD_STATE_MAX_FILES) {
            // Drop the OLDEST (front of the insertion order) entries.
            const trimmed = entries.slice(entries.length - FOLD_STATE_MAX_FILES);
            window.localStorage.setItem(
                FOLD_STATE_STORAGE_KEY,
                JSON.stringify(Object.fromEntries(trimmed))
            );
            return;
        }
        window.localStorage.setItem(FOLD_STATE_STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota exceeded / storage disabled — folding still works this
         * session, it just won't survive the reload. */
    }
}

/** Drop one file's persisted folds (used when a file's state should be
 *  forgotten entirely). */
export function clearFoldState(fileId: string): void {
    if (typeof window === "undefined") return;
    if (!fileId) return;
    try {
        const map = loadFoldState();
        if (!(fileId in map)) return;
        delete map[fileId];
        window.localStorage.setItem(FOLD_STATE_STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}
