/**
 * peek-references.ts — pure helpers behind the editor's peek references
 * popup (⇧F12) and the Ctrl/Cmd+Click go-to-definition gesture.
 *
 * Everything the popup needs that is NOT React lives here so it is
 * unit-testable in plain node (no DOM):
 *
 * - ReferenceHit — the /api/full-text-search hit shape (the SAME
 *   endpoint the project's Find Usages dialog and the Go-to-declaration
 *   handler use — one references "data machinery" for the whole app).
 * - fetchReferences — the fetch + response validation for a symbol.
 * - wordAt — the word span containing a 1-based column on a line (used
 *   by the viewer's Ctrl/Cmd+Click pixel-math → word resolution and by
 *   the ⇧F12 caret resolution).
 * - hitIsCurrentFile — cheap identity check.
 * - OPEN_REFERENCE_EVENT + dispatchOpenReference — the cross-file jump
 *   hand-off (see the wiring note below).
 *
 * ── Cross-file jumps: the praxis:open-reference event ──────────────
 *
 * In-file reference clicks are resolved INSIDE CodeViewer (it owns
 * jumpToLine). A click on a reference in ANOTHER file needs the page's
 * guarded file-selection machinery, which no generic event existed for
 * — so this module defines one. page.tsx wires it with a listener that
 * mirrors the existing `onOpenLocalHistory` pattern (see the wiring
 * instructions in the task report):
 *
 *   window.addEventListener("praxis:open-reference", (e) => {
 *     const d = (e as CustomEvent).detail;
 *     if (!d?.folder || !d?.file) return;
 *     guardedSelectFile(d.folder, d.file, {
 *       afterSwitch: () =>
 *         setTimeout(() => codeViewerRef.current?.jumpToLine(d.line), 300),
 *     });
 *   });
 *
 * Until that listener exists, cross-file rows still report themselves
 * (the popup shows the file names) — only the automatic file switch is
 * pending, and every same-file reference jumps today.
 */

/** One full-text-search hit — the shared "references data machinery". */
export interface ReferenceHit {
    /** Human-readable folder name. */
    folder: string;
    folderSlug: string;
    /** Human-readable file name. */
    file: string;
    fileSlug: string;
    /** 1-indexed line of the occurrence. */
    line: number;
    /** The matched line's text (trimmed by the API). */
    snippet: string;
}

/** The window event a peek row dispatches for a CROSS-file jump. */
export const OPEN_REFERENCE_EVENT = "praxis:open-reference";

/** Hard cap on rendered reference rows (the API limit matches). */
export const REFERENCES_LIMIT = 50;

/**
 * Fetch the references for a symbol from the project's full-text search
 * — the same endpoint /api/full-text-search that powers the Find Usages
 * dialog and the Go-to-declaration handler, so the peek popup shows the
 * SAME data the rest of the app calls "references".
 *
 * Returns `[]` (never throws — the popup shows its own error state on
 * network failures) and validates the hit shape so a malformed row
 * can't crash the popup.
 */
export async function fetchReferences(
    symbol: string,
    opts?: { signal?: AbortSignal }
): Promise<ReferenceHit[]> {
    const q = symbol.trim();
    if (!q) return [];
    try {
        const res = await fetch(
            `/api/full-text-search?q=${encodeURIComponent(q)}&limit=${REFERENCES_LIMIT}`,
            {signal: opts?.signal}
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { hits?: unknown };
        if (!Array.isArray(data.hits)) return [];
        const out: ReferenceHit[] = [];
        for (const raw of data.hits) {
            if (!raw || typeof raw !== "object") continue;
            const h = raw as Record<string, unknown>;
            const line = Number(h.line);
            if (
                typeof h.folderSlug !== "string" ||
                typeof h.fileSlug !== "string" ||
                !Number.isFinite(line) ||
                line < 1
            ) {
                continue;
            }
            out.push({
                folder: typeof h.folder === "string" ? h.folder : "",
                folderSlug: h.folderSlug,
                file: typeof h.file === "string" ? h.file : "",
                fileSlug: h.fileSlug,
                line,
                snippet: typeof h.snippet === "string" ? h.snippet : "",
            });
        }
        return out;
    } catch {
        // Aborted or network failure — an empty list keeps the popup calm.
        return [];
    }
}

/**
 * The word spanning a 1-based `col` on `line` ("" when the column isn't
 * inside an identifier). Mirrors the caret-word scan the edit mode
 * uses (`/[\w$]/` word characters), so both surfaces resolve the same
 * words from the same columns.
 */
export function wordAt(line: string, col: number): string {
    if (!line || col < 1) return "";
    const wordChars = /[\w$]/;
    let i = Math.min(col - 1, line.length - 1);
    if (i < 0 || !wordChars.test(line[i]!)) return "";
    let s = i;
    while (s > 0 && wordChars.test(line[s - 1]!)) s--;
    let e = i;
    while (e < line.length && wordChars.test(line[e]!)) e++;
    return line.slice(s, e);
}

/** True when a hit points at the file the popup is peeking FROM. */
export function hitIsCurrentFile(
    hit: ReferenceHit,
    current: { folderSlug?: string; fileSlug?: string }
): boolean {
    return (
        !!current.folderSlug &&
        !!current.fileSlug &&
        hit.folderSlug === current.folderSlug &&
        hit.fileSlug === current.fileSlug
    );
}

/**
 * Dispatch the cross-file jump hand-off (`praxis:open-reference`) for a
 * reference row click that targets ANOTHER file. page.tsx's listener
 * (see the module header) performs the guarded file switch + line jump;
 * without it this is a no-op event and the popup simply stays open.
 */
export function dispatchOpenReference(hit: ReferenceHit): void {
    try {
        window.dispatchEvent(
            new CustomEvent(OPEN_REFERENCE_EVENT, {
                detail: {
                    folder: hit.folderSlug,
                    file: hit.fileSlug,
                    line: hit.line,
                    fileName: hit.file,
                },
            })
        );
    } catch {
        /* no window (SSR) — nothing to hand off to */
    }
}
