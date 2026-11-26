/**
 * word-diff.ts — pure diff primitives for the DiffView editor tab
 * (item F22).
 *
 * Two layers:
 *
 *   lineDiff(a, b)          — line-level LCS diff, producing ops that
 *                             carry BOTH sides' line indices (the view
 *                             uses the indices to fetch the ORIGINAL
 *                             text, so it can diff normalized lines —
 *                             e.g. "Ignore whitespace" — but render the
 *                             raw ones).
 *   wordDiffSegments(a, b)  — intra-line segmentation for a changed
 *                             remove+add PAIR: the returned segments
 *                             concatenate back to `a`, with `changed`
 *                             marking the spans of `a` that have no
 *                             counterpart in `b`. The view calls it
 *                             twice (a-vs-b for the left pane, b-vs-a
 *                             for the right pane) to get both sides'
 *                             highlight spans.
 *
 * Server-safe (no DOM, no React) — the unit tests import it directly.
 */

/** One line-diff step. `equal` ops carry both indices; `remove` only
 *  the a-side index; `add` only the b-side index. Ops are emitted in
 *  ascending order on both indices, so filtering by type and reading
 *  the indices reconstructs `a` and `b` exactly. */
export type DiffOp =
    | { type: "equal"; aIndex: number; bIndex: number }
    | { type: "remove"; aIndex: number }
    | { type: "add"; bIndex: number };

/** One intra-line span. `segments.map((s) => s.text).join("") === a`. */
export interface WordSegment {
    text: string;
    changed: boolean;
}

/* ── Size guards ────────────────────────────────────────────────────
 *
 * The LCS table is O(n·m) in both time and Int32 cells, so two guards
 * keep pathological inputs off it:
 *
 *   MAX_DIFF_LINES — inputs beyond 5,000 lines per side never build a
 *     table. They still get a cheap single-pass COMMON PREFIX/SUFFIX
 *     trim (always LCS-safe), and only the unmatched middle is
 *     degraded to one "replace block" (all removes, then all adds).
 *     A 6,000-line file with one edited line therefore still diffs
 *     minimally — the trim absorbs the 5,999 unchanged lines.
 *
 *   MAX_LCS_CELLS — even ≤5,000-line inputs skip the table when the
 *     trimmed middle's table would exceed 2.5M cells (≈10 MB), e.g.
 *     two ~1,600-line fully-rewritten middles. Same replace-block
 *     fallback. */
export const MAX_DIFF_LINES = 5_000;
export const MAX_LCS_CELLS = 2_500_000;

/** wordDiffSegments guards: beyond this many characters the token pass
 *  is skipped for a character prefix/suffix trim; beyond this token
 *  table area the token middles are marked changed wholesale. */
const WORD_MAX_CHARS = 8_000;
const WORD_MAX_TOKEN_CELLS = 40_000;

/* ── LCS core ─────────────────────────────────────────────────────── */

/**
 * Ordered LCS alignment of two token arrays: the matched (aIndex,
 * bIndex) pairs. Classic suffix-DP + greedy walk (the same scheme as
 * compare-files-dialog's diffLines, factored out so the line and word
 * layers share it). When a[i] === b[j], matching them is always
 * optimal, so the walk never needs to backtrack.
 *
 * Callers must keep n·m bounded (see the guards above).
 */
function lcsPairs(a: readonly string[], b: readonly string[]): Array<[number, number]> {
    const n = a.length;
    const m = b.length;
    if (n === 0 || m === 0) return [];
    const w = m + 1;
    const dp = new Int32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * w + j] =
                a[i] === b[j]
                    ? dp[(i + 1) * w + j + 1] + 1
                    : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
    }
    const pairs: Array<[number, number]> = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            pairs.push([i, j]);
            i++;
            j++;
        } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return pairs;
}

/**
 * Line-level diff. LCS-based, with a common prefix/suffix trim in
 * front (the trim alone handles the "huge file, tiny change" case in
 * O(n)) and the documented size guards above. Guaranteed properties:
 *
 *   - ops reconstruct both inputs (see DiffOp);
 *   - every `equal` op satisfies a[aIndex] === b[bIndex];
 *   - within any run of non-equal ops, removes precede adds — so a
 *     renderer can pair the k-th remove with the k-th add to build
 *     intra-line word-diff rows.
 */
export function lineDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
    const n = a.length;
    const m = b.length;

    // Common prefix (greedy matching of equal heads is LCS-optimal).
    let p = 0;
    while (p < n && p < m && a[p] === b[p]) p++;
    // Common suffix, capped so it never reaches into the prefix.
    let s = 0;
    while (s < n - p && s < m - p && a[n - 1 - s] === b[m - 1 - s]) s++;

    const ops: DiffOp[] = [];
    for (let k = 0; k < p; k++) ops.push({type: "equal", aIndex: k, bIndex: k});

    const aMidLen = n - p - s;
    const bMidLen = m - p - s;

    if (aMidLen > 0 || bMidLen > 0) {
        const useTable =
            n <= MAX_DIFF_LINES && m <= MAX_DIFF_LINES && aMidLen * bMidLen <= MAX_LCS_CELLS;
        if (useTable) {
            const aMid = a.slice(p, n - s);
            const bMid = b.slice(p, m - s);
            const pairs = lcsPairs(aMid, bMid);
            let ai = 0;
            let bj = 0;
            for (const [pi, pj] of pairs) {
                while (ai < pi) ops.push({type: "remove", aIndex: p + ai++});
                while (bj < pj) ops.push({type: "add", bIndex: p + bj++});
                ops.push({type: "equal", aIndex: p + pi, bIndex: p + pj});
                ai = pi + 1;
                bj = pj + 1;
            }
            while (ai < aMidLen) ops.push({type: "remove", aIndex: p + ai++});
            while (bj < bMidLen) ops.push({type: "add", bIndex: p + bj++});
        } else {
            // Guard fallback: one replace block for the trimmed middle.
            for (let k = 0; k < aMidLen; k++) ops.push({type: "remove", aIndex: p + k});
            for (let k = 0; k < bMidLen; k++) ops.push({type: "add", bIndex: p + k});
        }
    }

    for (let k = 0; k < s; k++) {
        ops.push({type: "equal", aIndex: n - s + k, bIndex: m - s + k});
    }
    return ops;
}

/* ── Intra-line (word) diff ───────────────────────────────────────── */

/** Split on word boundaries: \w+ runs, whitespace runs, and
 *  punctuation runs become individual tokens (order preserved, the
 *  join of the tokens is the original string). */
const WORD_TOKEN_RE = /\w+|\s+|[^\w\s]+/g;

function tokenizeWords(s: string): string[] {
    // String.match with a /g regex returns every match (lastIndex is
    // reset by match itself), so the shared regex object is safe here.
    return s.match(WORD_TOKEN_RE) ?? [];
}

/** Cheap character-level fallback for oversized lines: common
 *  prefix/suffix, everything between marked changed. */
function charTrimSegments(a: string, b: string): WordSegment[] {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const out: WordSegment[] = [];
    if (p > 0) out.push({text: a.slice(0, p), changed: false});
    if (a.length - p - s > 0) out.push({text: a.slice(p, a.length - s), changed: true});
    if (s > 0) out.push({text: a.slice(a.length - s), changed: false});
    return out;
}

/** Merge adjacent segments with the same flag (the prefix/middle/
 *  suffix assembly can produce touching unchanged runs). */
function mergeSegments(segs: WordSegment[]): WordSegment[] {
    const out: WordSegment[] = [];
    for (const seg of segs) {
        const last = out[out.length - 1];
        if (last && last.changed === seg.changed) last.text += seg.text;
        else out.push({...seg});
    }
    return out;
}

/**
 * Intra-line segmentation of `a` against `b` for a changed line pair:
 * the segments concatenate back to `a`, and `changed: true` marks the
 * spans of `a` that have no counterpart in `b`. Call it with the
 * arguments swapped to get `b`'s spans (the right pane).
 *
 * Algorithm: common token prefix/suffix trim, then a small LCS over
 * the middle tokens (word-boundary tokens, so highlights land on whole
 * words/punctuation runs); unmatched tokens of `a` become changed
 * spans. Guards: lines over WORD_MAX_CHARS combined use the character
 * trim; middle token tables over WORD_MAX_TOKEN_CELLS mark the whole
 * middle changed. Both are instant even for minified-style lines.
 */
export function wordDiffSegments(a: string, b: string): WordSegment[] {
    if (a === b) return [{text: a, changed: false}];
    // An empty side has nothing to highlight (its counterpart renders
    // the whole line as changed via the swapped call).
    if (a.length === 0) return [];
    if (b.length === 0) return [{text: a, changed: true}];

    if (a.length + b.length > WORD_MAX_CHARS) {
        return charTrimSegments(a, b);
    }

    const ta = tokenizeWords(a);
    const tb = tokenizeWords(b);

    let p = 0;
    while (p < ta.length && p < tb.length && ta[p] === tb[p]) p++;
    let s = 0;
    while (
        s < ta.length - p &&
        s < tb.length - p &&
        ta[ta.length - 1 - s] === tb[tb.length - 1 - s]
        ) {
        s++;
    }

    const segments: WordSegment[] = [];
    if (p > 0) segments.push({text: ta.slice(0, p).join(""), changed: false});

    const midA = ta.slice(p, ta.length - s);
    const midB = tb.slice(p, tb.length - s);

    if (midA.length > 0) {
        if (midA.length * midB.length > WORD_MAX_TOKEN_CELLS) {
            segments.push({text: midA.join(""), changed: true});
        } else {
            const pairs = lcsPairs(midA, midB);
            const matched = new Uint8Array(midA.length);
            for (const [i] of pairs) matched[i] = 1;
            let buf = "";
            let bufChanged: boolean | null = null;
            for (let i = 0; i < midA.length; i++) {
                const ch = matched[i] === 0;
                if (bufChanged !== null && ch !== bufChanged) {
                    segments.push({text: buf, changed: bufChanged});
                    buf = "";
                }
                buf += midA[i];
                bufChanged = ch;
            }
            if (bufChanged !== null && buf.length > 0) {
                segments.push({text: buf, changed: bufChanged});
            }
        }
    }

    if (s > 0) segments.push({text: ta.slice(ta.length - s).join(""), changed: false});

    return mergeSegments(segments);
}
