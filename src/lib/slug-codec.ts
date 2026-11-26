/**
 * slug-codec.ts — browser-safe decode of the explorer's file slugs.
 *
 * `src/lib/scripts.ts` encodes every file's RELATIVE path
 * ("sub/dir/Name With Spaces.py") as base64url so routes can carry it
 * losslessly. That module also imports `node:fs`, so importing it from
 * a client component would drag Node built-ins into the browser
 * bundle. This tiny duplicate keeps the client-side dialogs
 * (project-wide find & replace, rename preview) able to turn a
 * `fileSlug` back into the relative path that /api/file-write expects
 * as `fileName` — WITHOUT importing the server module.
 *
 * Decode contract (must stay byte-identical to
 * Buffer.from(slug, "base64url").toString("utf-8")): the slugs this
 * decodes are always produced by slugify, so malformed input only
 * needs to degrade gracefully (best-effort decode, "" on empty).
 *
 * Windows note: decoded paths keep their FORWARD slashes — that is
 * exactly what the write route validates and path.joins against.
 */

/** Decode a base64url slug (as produced by lib/scripts slugify). */
export function decodeSlug(slug: string): string {
    if (!slug) return "";
    // base64url alphabet → standard base64, then re-pad to a multiple
    // of four so atob accepts it.
    let std = slug.replace(/-/g, "+").replace(/_/g, "/");
    while (std.length % 4 !== 0) std += "=";
    // Only attempt a decode when the characters are legal — a corrupt
    // slug should yield "" (the callers treat that as "skip the file")
    // rather than throw mid-dialog.
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(std)) return "";
    // atob is a browser global since forever and a Node global since 16
    // (vitest's node env has it too), so there is no fallback branch to
    // keep — anything without atob can't run this app anyway.
    try {
        const bin = atob(std);
        // atob returns one char per byte — rebuild the UTF-8 bytes and
        // decode them so non-ASCII names survive the trip.
        const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0) & 0xff);
        return new TextDecoder("utf-8").decode(bytes);
    } catch {
        return "";
    }
}
