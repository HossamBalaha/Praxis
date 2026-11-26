/**
 * Progressive-render chunking for the code viewer
 * (src/components/code-viewer.tsx).
 *
 * Files past FULL_CHUNK_THRESHOLD lines render in chunks of
 * FULL_CHUNK_LINES, one chunk per animation frame: the first rows
 * paint immediately, a live "Rendering N of M lines" loader covers
 * the tail, and the long Prism tokenize is spread across frames
 * instead of freezing the tab for the whole file. Chunk boundaries
 * never fall inside a triple-quoted string (the seam would mis-color
 * the docstring on both sides). Zero React, zero DOM (see
 * __tests__/code-chunks.test.ts).
 */

/** Files longer than this many lines render progressively. */
export const FULL_CHUNK_THRESHOLD = 800;

/* 200-line chunks, not 500: the per-chunk Prism tokenize + DOM build
 * is a MAIN-THREAD long task (measured ~1.8 s per 500-line chunk on a
 * 3.6k-line file), so smaller chunks mean shorter freezes between
 * paint opportunities — the loader ticks and the page stays
 * responsive while the tail renders. Combined with
 * content-visibility: auto on each chunk (offscreen chunks skip
 * layout + paint), the whole progressive mount is dramatically
 * smoother to scroll through. */
export const FULL_CHUNK_LINES = 200;

/**
 * Split `lines` into chunks of ~target lines whose boundaries sit
 * OUTSIDE any triple-quoted string (a state machine over ''' / """).
 */
export function splitSafeChunks(allLines: string[], target: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    let inSq = false;
    let inDq = false;
    for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        for (let j = 0; j + 2 < line.length; j++) {
            if (!inDq && line.charCodeAt(j) === 39 && line.charCodeAt(j + 1) === 39 && line.charCodeAt(j + 2) === 39) {
                inSq = !inSq;
                j += 2;
            } else if (!inSq && line.charCodeAt(j) === 34 && line.charCodeAt(j + 1) === 34 && line.charCodeAt(j + 2) === 34) {
                inDq = !inDq;
                j += 2;
            }
        }
        if (!inSq && !inDq && i - start + 1 >= target) {
            chunks.push(allLines.slice(start, i + 1).join("\n"));
            start = i + 1;
        }
    }
    if (start < allLines.length) chunks.push(allLines.slice(start).join("\n"));
    return chunks;
}
