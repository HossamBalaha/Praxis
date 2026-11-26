/**
 * Whitespace-overlay mark extraction for the code viewer
 * (src/components/code-viewer.tsx) — the pure half of the Show
 * Whitespace overlay.
 *
 * Each rendered line splits into its leading whitespace run, its
 * body, and its trailing whitespace run; the overlay paints the runs
 * as visible markers (→ for tab, · for space, ¶ at end-of-line) and
 * copies the body through transparently. Zero React, zero DOM (see
 * __tests__/whitespace-marks.test.ts).
 */

/** One line's whitespace segmentation. */
export interface WhitespaceMarks {
    /** The leading run of spaces/tabs (rendered as visible markers). */
    leading: string;
    /** The verbatim body between the runs (rendered transparent). */
    body: string;
    /** The trailing run of any whitespace (rendered as visible markers). */
    trailing: string;
    /** True when the line is non-empty and earns a ¶ end-of-line mark. */
    hasEol: boolean;
}

/**
 * Segment one source line for the whitespace overlay: the leading
 * whitespace run, the body (with its trailing whitespace split off),
 * and whether an end-of-line marker applies. Blank lines have empty
 * runs and no marker.
 */
export function whitespaceMarksForLine(line: string): WhitespaceMarks {
    let j = 0;
    // Leading whitespace run.
    while (j < line.length && (line[j] === " " || line[j] === "\t")) {
        j++;
    }
    const leading = line.slice(0, j);
    const body = line.slice(j);
    const trailingMatch = body.match(/\s+$/);
    if (trailingMatch) {
        const trailing = trailingMatch[0];
        const trailingStart = body.length - trailing.length;
        return {
            leading,
            body: body.slice(0, trailingStart),
            trailing,
            hasEol: line.length > 0,
        };
    }
    return {leading, body, trailing: "", hasEol: line.length > 0};
}
