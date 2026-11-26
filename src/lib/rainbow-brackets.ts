/**
 * Rainbow-bracket scan for the code viewer's pair-colorization
 * overlay (src/components/code-viewer.tsx) — the pure half of
 * buildRainbowOverlay.
 *
 * A single pass over the source tracks bracket nesting depth; each
 * bracket glyph is tinted with the color of its depth (VS Code's
 * bracket-pair colorization) and every MULTI-LINE pair draws a faint
 * vertical guide '│' at the opening column through the lines it
 * spans. The component renders the marks as a transparent <pre>
 * overlay; this module only computes them (see
 * __tests__/rainbow-brackets.test.ts).
 */

/** Depth colors (gold, violet, teal, blue, red, green). */
export const RAINBOW_BRACKET_COLORS = [
    "#e5b356", // gold
    "#c678dd", // violet
    "#56b6c2", // teal
    "#61afef", // blue
    "#e06c75", // red
    "#98c379", // green
];

/** Scan budget: files with more brackets than this skip the overlay
 *  entirely (the scan is O(source) and the overlay would dwarf the
 *  code it decorates). */
export const RAINBOW_MAX_BRACKETS = 4000;

/** Neutral hint for closers with no matching opener. */
export const UNMATCHED_BRACKET_COLOR = "#9ca3af";

/** One bracket or guide glyph on a line, keyed by its column. */
export interface RainbowMark {
    /** The glyph rendered at this column (a bracket char or '│'). */
    ch: string;
    /** The depth color (or the neutral unmatched hint). */
    color: string;
    /** True for the faint vertical pair guides (opacity drops to 0.4). */
    guide: boolean;
}

/**
 * Scan `src` for bracket pairs: one mark map per line (column →
 * glyph). Returns null when the source has no brackets at all or
 * exceeds the bracket budget — the caller renders no overlay.
 */
export function scanRainbowMarks(
    src: string
): Array<Map<number, RainbowMark>> | null {
    const lines = src.split("\n");
    // marks[li] = bracket/guide glyphs on that line, keyed by column.
    const marks: Array<Map<number, RainbowMark>> = lines.map(() => new Map());
    const stack: Array<{ line: number; col: number }> = [];
    let bracketCount = 0;
    const OPEN = "([{";
    const CLOSE = ")]}";
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        for (let ci = 0; ci < line.length; ci++) {
            const ch = line[ci];
            if (OPEN.indexOf(ch) >= 0) {
                bracketCount++;
                if (bracketCount > RAINBOW_MAX_BRACKETS) return null;
                const color = RAINBOW_BRACKET_COLORS[stack.length % RAINBOW_BRACKET_COLORS.length];
                stack.push({line: li, col: ci});
                marks[li].set(ci, {ch, color, guide: false});
            } else if (CLOSE.indexOf(ch) >= 0) {
                bracketCount++;
                if (bracketCount > RAINBOW_MAX_BRACKETS) return null;
                const open = stack.pop();
                // The closer wears the SAME color as its opener (depth before
                // pop); unmatched closers get a neutral gray hint.
                const color = open
                    ? RAINBOW_BRACKET_COLORS[stack.length % RAINBOW_BRACKET_COLORS.length]
                    : UNMATCHED_BRACKET_COLOR;
                if (open && li > open.line) {
                    // Pair guide: faint vertical line at the opening column,
                    // from the line AFTER the opener through the closer's line.
                    for (let g = open.line + 1; g <= li; g++) {
                        if (!marks[g].has(open.col)) {
                            marks[g].set(open.col, {ch: "│", color, guide: true});
                        }
                    }
                }
                marks[li].set(ci, {ch, color, guide: false});
            }
        }
    }
    if (bracketCount === 0) return null;
    return marks;
}
