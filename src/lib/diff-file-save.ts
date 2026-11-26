/**
 * The diff view's write-through save path (src/components/diff-view.tsx).
 *
 * POST /api/file-write with the route's CORRECT field names —
 * { folder, fileName, content } — the exact contract documented on the
 * route itself (src/app/api/file-write/route.ts). An earlier save
 * attempt from the diff shipped `{ folder, fileSlug, content }` instead
 * (a base64url SLUG in the fileName slot), which the route rejects with
 * a 400 "Body must include 'folder', 'fileName', and 'content'" —
 * fileName is the real file name (or relative path inside the folder),
 * and the slug form only ever matched /api/import-py-adjacent routes
 * that deslugify it themselves.
 *
 * Also ships `deslugifyClient` — the browser-side twin of
 * lib/scripts.ts deslugify (base64url → utf-8, no Node Buffer) so a
 * host holding a fileSlug (the praxis:open-diff detail's rightFile)
 * can recover the real fileName before calling the writer.
 */

export interface DiffFileWriteResult {
    /** The file the route wrote (its fileName echo). */
    file: string;
    /** Bytes written. */
    size: number;
}

/**
 * Save one side of a diff through /api/file-write.
 * Throws an Error (message ready for DiffView's inline error row) when
 * the write fails — 400s (bad field names / traversal), 500s (fs errors)
 * and network failures all funnel here.
 */
export async function saveDiffFileWrite(
    folder: string,
    fileName: string,
    content: string
): Promise<DiffFileWriteResult> {
    let res: Response;
    try {
        res = await fetch("/api/file-write", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            // THE contract: folder + fileName + content. Not fileSlug — the
            // route never deslugifies the file name; the 400 that killed the
            // previous save-from-diff came from exactly that mix-up.
            body: JSON.stringify({folder, fileName, content}),
        });
    } catch {
        throw new Error("Network error while saving.");
    }
    const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; file?: string; size?: number; error?: string }
        | null;
    if (!res.ok || !data || data.ok !== true) {
        const message =
            typeof data?.error === "string" && data.error ? data.error : `HTTP ${res.status}.`;
        throw new Error(message);
    }
    return {
        file: typeof data.file === "string" ? data.file : fileName,
        size: typeof data.size === "number" ? data.size : 0,
    };
}

/**
 * Browser-side deslugify (base64url → utf-8) — the twin of
 * lib/scripts.ts deslugify without Node's Buffer. Use it when a host
 * holds the praxis:open-diff detail's `rightFile.fileSlug` and needs
 * the real fileName for /api/file-write.
 */
export function deslugifyClient(slug: string): string {
    if (!slug) return "";
    // base64url → base64 (atob-safe), then decode UTF-8 bytes.
    const b64 = slug.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    try {
        const bin = atob(padded);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        // Not valid base64url — return it untouched and let the route's own
        // fileName validation produce the actionable error.
        return slug;
    }
}
