/**
 * Shareable snapshot links.
 *
 * A "snapshot" is a tiny set of workspace files packed into the page URL's
 * hash: `#praxis=<base64 payload>`. Using the hash (never a `?` query)
 * keeps the link page-load friendly — servers never see it, so a shared
 * link opens the app normally and the snapshot restores client-side.
 *
 * Encoding pipeline:
 *   files -> dedupe long repeated content into a dictionary
 *          -> JSON { v, n, t, d[ict], f[ile pairs] }
 *          -> UTF-8 bytes -> base64 -> `#praxis=<payload>`
 *
 * The dictionary exists because real projects repeat file bodies
 * (generated headers, near-identical scripts): each distinct long content
 * is stored once and referenced from file pairs as `$<index>`. Short
 * contents (and anything that would collide with the `$N` ref syntax)
 * are stored literally — an out-of-range `$N` at decode time therefore
 * means the payload is corrupt, not a literal.
 *
 * Pure library: no React, no server imports, safe on both ends.
 */

export interface SnapshotFile {
    path: string;
    content: string;
}

export interface SnapshotData {
    name: string;
    files: SnapshotFile[];
    savedAt: number;
}

/** Hash marker — the page listens for this exact prefix. */
const HASH_PREFIX = "#praxis=";

/** Hard share limits (exceeding returns { error } for the host to toast). */
const MAX_FILES = 200;
const MAX_FILE_BYTES = 256 * 1024; // 256 KB per file
const MAX_TOTAL_BYTES = 1536 * 1024; // 1.5 MB total content

/** Contents at/above this byte size go into the dedupe dictionary. */
const DICT_MIN_BYTES = 64;

/** Exactly `$` + digits — a dictionary reference. */
const REF_RE = /^\$(\d+)$/;

/* ------------------------------------------------------------------ */
/* UTF-8 safe base64 helpers (btoa/atob alone are latin-1)             */

/* ------------------------------------------------------------------ */

function textToBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    // Chunked so huge payloads never blow the call stack with a spread.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

function base64ToText(base64: string): string {
    // Tolerate URL-safe variants (-/_ instead of +//) defensively.
    const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized); // throws on garbage — callers catch
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

/** Human byte size for error messages. */
function humanBytes(n: number): string {
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/* ------------------------------------------------------------------ */
/* Encoding                                                            */

/* ------------------------------------------------------------------ */

/**
 * Encode files (plus a name) into a `#praxis=<payload>` hash string.
 *
 * Returns the hash string, or `{ error }` when a hard limit is exceeded
 * — the host is expected to toast the human message.
 */
export function encodeSnapshot(
    files: SnapshotFile[],
    name: string
): string | { error: string } {
    if (!Array.isArray(files)) {
        return {error: "Snapshot needs a list of files."};
    }
    if (files.length === 0) {
        return {error: "Snapshot has no files — nothing to share."};
    }
    if (files.length > MAX_FILES) {
        return {
            error: `Snapshot has ${files.length} files; the share limit is ${MAX_FILES}. Remove some files and try again.`,
        };
    }

    const encoder = new TextEncoder();

    // Last duplicate path wins; a leading "/" is stripped for page-friendliness.
    const byPath = new Map<string, SnapshotFile>();
    for (const f of files) {
        if (
            typeof f !== "object" ||
            f === null ||
            typeof f.path !== "string" ||
            typeof f.content !== "string"
        ) {
            return {
                error: "Snapshot files must each carry a path and string content.",
            };
        }
        const p = f.path.replace(/^\/+/, "");
        if (!p) return {error: "Snapshot files must each have a non-empty path."};
        byPath.set(p, {path: p, content: f.content});
    }

    let total = 0;
    for (const f of byPath.values()) {
        const size = encoder.encode(f.content).length;
        if (size > MAX_FILE_BYTES) {
            return {
                error: `"${f.path}" is ${humanBytes(size)}; the per-file share limit is 256 KB.`,
            };
        }
        total += size;
    }
    if (total > MAX_TOTAL_BYTES) {
        return {
            error: `Snapshot content is ${humanBytes(total)}; the share limit is 1.5 MB — try sharing fewer or smaller files.`,
        };
    }

    const trimmedName = typeof name === "string" ? name.trim().slice(0, 80) : "";
    const cleanName = trimmedName || "shared snapshot";

    // Dictionary dedupe: identical long bodies are stored once and
    // referenced as $<index>. Literal contents that look like a ref are
    // force-dictionaried so decoding stays unambiguous.
    const dictIndex = new Map<string, number>();
    const dict: string[] = [];
    const pairs: Array<[string, string]> = [];
    for (const f of byPath.values()) {
        const size = encoder.encode(f.content).length;
        let value = f.content;
        if (size >= DICT_MIN_BYTES || REF_RE.test(f.content)) {
            let idx = dictIndex.get(f.content);
            if (idx === undefined) {
                idx = dict.length;
                dict.push(f.content);
                dictIndex.set(f.content, idx);
            }
            value = `$${idx}`;
        }
        pairs.push([f.path, value]);
    }

    const payload = JSON.stringify({
        v: 1,
        n: cleanName,
        t: Date.now(),
        d: dict,
        f: pairs,
    });
    return `${HASH_PREFIX}${textToBase64(payload)}`;
}

/* ------------------------------------------------------------------ */
/* Decoding                                                            */

/* ------------------------------------------------------------------ */

/**
 * Defensively parse a raw payload (the part after `#praxis=`).
 * Corrupt JSON, wrong version, malformed refs, out-of-range refs → null.
 */
export function parseSnapshotPayload(payload: string): SnapshotData | null {
    if (typeof payload !== "string" || !payload) return null;
    try {
        const raw: unknown = JSON.parse(base64ToText(payload));
        if (typeof raw !== "object" || raw === null) return null;
        const r = raw as Record<string, unknown>;
        if (r.v !== 1) return null;
        if (typeof r.n !== "string" || !r.n) return null;
        if (typeof r.t !== "number" || !Number.isFinite(r.t)) return null;
        if (!Array.isArray(r.d) || !r.d.every((x) => typeof x === "string")) {
            return null;
        }
        const dict = r.d as string[];
        if (!Array.isArray(r.f) || r.f.length === 0 || r.f.length > MAX_FILES) {
            return null;
        }
        const files: SnapshotFile[] = [];
        for (const entry of r.f) {
            if (!Array.isArray(entry) || entry.length !== 2) return null;
            const [p, v] = entry as [unknown, unknown];
            if (typeof p !== "string" || !p) return null;
            if (typeof v !== "string") return null;
            let content = v;
            const ref = REF_RE.exec(v);
            if (ref) {
                const idx = Number(ref[1]);
                if (!Number.isInteger(idx) || idx < 0 || idx >= dict.length) {
                    return null; // corrupt ref — never a literal (see encoder note)
                }
                content = dict[idx];
            }
            files.push({path: p, content});
        }
        return {name: r.n, files, savedAt: r.t};
    } catch {
        return null;
    }
}

/** Read + decode the snapshot from the current page's location.hash. */
export function decodeSnapshotHash(): SnapshotData | null {
    if (typeof window === "undefined") return null; // SSR / non-DOM guard
    const hash = window.location.hash;
    if (!hash.startsWith(HASH_PREFIX)) return null;
    let payload = hash.slice(HASH_PREFIX.length);
    try {
        // The hash may arrive percent-encoded (some chat apps mangle links);
        // pure base64 contains no %, so this is a no-op when it is intact.
        payload = decodeURIComponent(payload);
    } catch {
        /* keep the raw string — parseSnapshotPayload will reject it */
    }
    return parseSnapshotPayload(payload);
}

/** Absolute share URL (origin + pathname + the snapshot hash). */
export function snapshotUrl(
    files: SnapshotFile[],
    name: string
): string | { error: string } {
    const encoded = encodeSnapshot(files, name);
    if (typeof encoded !== "string") return encoded; // { error }
    if (typeof window === "undefined") return encoded;
    // Query params are dropped on purpose — the snapshot drives page state.
    return `${window.location.origin}${window.location.pathname}${encoded}`;
}

/** Remove the snapshot hash without adding a history entry or reloading. */
export function clearSnapshotHash(): void {
    if (typeof window === "undefined") return;
    window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
    );
}
