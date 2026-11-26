/**
 * bracket-match.ts — the bracket-pair matching scanner.
 *
 * The non-Python editor (file-viewer) highlights the matching pair
 * when the caret sits on / next to a bracket ( [] {}) —.
 * The scan is a single pass with a stack of open-bracket offsets;
 * strings are skipped NAIVELY (quotes with backslash escapes — no
 * language-aware tokenization, which is exactly what the plan asks
 * for). Returns the pair that CONTAINS or ADJOINS the caret:
 *
 * - caret ON an opener → that opener + its closer;
 * - caret ON a closer → its opener + that closer;
 * - caret just AFTER a closer / just BEFORE an opener → that pair
 * (the classic "next to" behavior).
 *
 * Pure module — unit-tested in __tests__/bracket-match.test.ts.
 */

const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);
const MATCH: Record<string, string> = {")": "(", "]": "[", "}": "{"};

export interface BracketPair {
    /** Offset of the opening bracket (inclusive). */
    openOffset: number;
    /** Offset of the closing bracket (inclusive). */
    closeOffset: number;
    /** The bracket character (same for both ends). */
    bracket: string;
}

/** Find the bracket pair at / adjacent to `caret` in `source`. */
export function findBracketPair(source: string, caret: number): BracketPair | null {
    const n = source.length;
    // Probe order: caret first, then the neighbors — "on" beats
    // "next to" when both are brackets.
    const candidates: Array<{ off: number }> = [];
    for (const off of [caret, caret - 1, caret + 1]) {
        if (off >= 0 && off < n) candidates.push({off});
    }
    // Prefer ON the caret, then before, then after.
    const wanted = candidates
        .map((c) => source[c.off])
        .filter((ch) => OPENERS.has(ch) || CLOSERS.has(ch));
    if (wanted.length === 0) return null;

    // One pass builds the stack of pairs; we keep the pair that covers
    // or touches the probed bracket offsets.
    const stack: Array<{ off: number; ch: string }> = [];
    const pairs: BracketPair[] = [];
    for (let i = 0; i < n; i++) {
        const ch = source[i];
        if (ch === '"' || ch === "'") {
            // Naive string skip: same quote ends it, backslash escapes.
            let j = i + 1;
            while (j < n && source[j] !== ch) {
                j += source[j] === "\\" ? 2 : 1;
            }
            i = j; // past the closing quote (or the string end)
            continue;
        }
        if (OPENERS.has(ch)) {
            stack.push({off: i, ch});
            continue;
        }
        if (CLOSERS.has(ch)) {
            const open = stack.pop();
            if (open && open.ch === MATCH[ch]) {
                pairs.push({openOffset: open.off, closeOffset: i, bracket: open.ch});
            }
            // Mismatched closer — drop it (the stack just shrinks).
        }
    }

    for (const probe of candidates) {
        const ch = source[probe.off];
        if (OPENERS.has(ch)) {
            const pair = pairs.find((p) => p.openOffset === probe.off);
            if (pair) return pair;
        } else if (CLOSERS.has(ch)) {
            const pair = pairs.find((p) => p.closeOffset === probe.off);
            if (pair) return pair;
        }
    }
    return null;
}

/** Occurrences (offsets) of `needle` in `hay` — for the soft
 * selection-occurrence highlight (whole-word when the needle is an
 * identifier-ish run). Case-sensitive; the visual highlight is soft. */
export function findOccurrences(hay: string, needle: string, cap = 500): number[] {
    if (!needle) return [];
    const out: number[] = [];
    const wordish = /^[A-Za-z0-9_$]+$/.test(needle);
    let i = hay.indexOf(needle);
    while (i !== -1 && out.length < cap) {
        if (wordish) {
            const beforeOk = i === 0 || !/[A-Za-z0-9_$]/.test(hay[i - 1]);
            const afterOk = i + needle.length >= hay.length || !/[A-Za-z0-9_$]/.test(hay[i + needle.length]);
            if (beforeOk && afterOk) out.push(i);
        } else {
            out.push(i);
        }
        i = hay.indexOf(needle, i + Math.max(1, needle.length));
    }
    return out;
}
