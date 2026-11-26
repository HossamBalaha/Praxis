/**
 * spell-spans.ts — the Python COMMENT/STRING prose scanner.
 *
 * The Python editor (code-viewer) spell-checks only the PROSE parts
 * of its buffer — comments (`# …`) and string literals — never the
 * code itself. The /api/spell tokenizer already skips identifiers,
 * but a bare `x = somthing` line would still flag `somthing`; gating
 * the reported issues by token spans keeps the squiggles inside
 * comments/strings only (the plan's "COMMENTS AND STRINGS ONLY").
 *
 * The scanner is deliberately LIGHT — a single pass, no full Python
 * tokenizer:
 * - triple-quoted strings ('''…''' / """…""") span lines and are
 * honored (a quote inside them is text, not an opener);
 * - single/double-quoted one-line strings, with backslash escapes;
 * - a `#` outside every string opens a comment to end of line;
 * - f-string braces / prefixes are not special (they change nothing
 * about where the string ends).
 *
 * Pure module — unit-tested in __tests__/spell-spans.test.ts.
 */

/** A contiguous prose region of the source (absolute offsets). */
export interface ProseSpan {
    /** Inclusive start offset (the `#` or the opening quote). */
    start: number;
    /** Exclusive end offset (past the closing quote / the newline). */
    end: number;
    /** Which prose surface this span covers. */
    kind: "comment" | "string";
}

/**
 * Tokenize `source` into comment + string spans. Offsets are absolute
 * character offsets into `source` — intersect them with anything that
 * can compute an offset (spell issues carry 1-indexed line/col).
 */
export function scanPyCommentStringSpans(source: string): ProseSpan[] {
    const out: ProseSpan[] = [];
    const n = source.length;
    let i = 0;
    const push = (start: number, end: number, kind: "comment" | "string") => {
        // Degenerate spans never render anything.
        if (end > start) out.push({start, end, kind});
    };
    while (i < n) {
        const ch = source[i];
        // Comment: everything to the line end (only outside strings — the
        // loop structure guarantees `#` here is NOT inside one).
        if (ch === "#") {
            let end = i;
            while (end < n && source[end] !== "\n") end++;
            push(i, end, "comment");
            i = end;
            continue;
        }
        // String openers: single or double quote.
        if (ch === '"' || ch === "'") {
            const quote = ch;
            // Triple-quoted?
            const isTriple = source.slice(i, i + 3) === quote.repeat(3);
            if (isTriple) {
                const closer = quote.repeat(3);
                let j = i + 3;
                let closed = false;
                while (j < n) {
                    if (source[j] === "\\") {
                        j += 2; // escaped char — skip both
                        continue;
                    }
                    if (source.slice(j, j + 3) === closer) {
                        closed = true;
                        break;
                    }
                    j++;
                }
                const end = closed ? j + 3 : n;
                push(i, end, "string");
                i = end;
                continue;
            }
            // Single-line string (may actually be unterminated — then it
            // runs to the newline; a spell mark there is still useful).
            let j = i + 1;
            let closed = false;
            while (j < n) {
                const c = source[j];
                if (c === "\\") {
                    j += 2;
                    continue;
                }
                if (c === quote) {
                    closed = true;
                    break;
                }
                if (c === "\n") break; // unterminated — stop at the line end
                j++;
            }
            const end = closed ? j + 1 : Math.min(j, n);
            push(i, end, "string");
            i = end;
            continue;
        }
        i++;
    }
    return out;
}

/** Line-start offsets for a source string (0 for line 1). */
export function lineStartOffsets(source: string): number[] {
    const starts: number[] = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === "\n") starts.push(i + 1);
    }
    return starts;
}

/** One misspelled word as /api/spell reports it (1-indexed). */
export interface SpellIssueLike {
    word: string;
    line: number;
    col: number;
}

/**
 * Keep only the issues whose word sits INSIDE one of the scanned
 * comment/string spans (the Python editor's prose gate). The whole
 * word must lie in the span so a word straddling a string's closing
 * quote is dropped (it can't be real prose).
 */
export function spellIssuesInPyProse<T extends SpellIssueLike>(issues: T[], source: string): T[] {
    if (issues.length === 0) return issues;
    const spans = scanPyCommentStringSpans(source);
    if (spans.length === 0) return [];
    const starts = lineStartOffsets(source);
    return issues.filter((iss) => {
        if (iss.line < 1 || iss.line > starts.length) return false;
        const off = starts[iss.line - 1] + Math.max(0, iss.col - 1);
        const end = off + iss.word.length;
        return spans.some((s) => off >= s.start && end <= s.end);
    });
}
