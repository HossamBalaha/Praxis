/**
 * Pure find/replace matching for the code viewer's find bars
 * (src/components/code-viewer.tsx).
 *
 * Two match shapes exist, exactly like a real editor:
 *  · EDIT mode matches are global OFFSETS into the buffer (they drive
 *    the textarea's selection) — literal (case-insensitive) or regex.
 *  · VIEW mode matches are OCCURRENCE-level (display row + column)
 *    against the RENDERED text (folds applied, collapse cut applied),
 *    so the highlight rect, the counter and the scroll all agree.
 *
 * Zero React, zero DOM — the bars and effects stay in the component
 * (see __tests__/find-occurrences.test.ts).
 */

/** An edit-mode match: a half-open global offset range. */
export interface OffsetMatch {
    start: number;
    end: number;
}

/** A view-mode occurrence: 1-based display row + half-open column
 *  range inside that row's text. */
export interface RowOccurrence {
    row: number;
    start: number;
    end: number;
}

/**
 * Every match of `query` in `content`. Literal mode is a
 * case-insensitive substring scan (the default); regex mode compiles
 * the query globally + case-insensitively, with zero-width matches
 * advancing one char so the loop cannot spin forever. An empty query
 * or an invalid pattern matches nothing.
 */
export function findMatchesIn(
    content: string,
    query: string,
    useRegex: boolean
): OffsetMatch[] {
    if (!query) return [];
    const result: OffsetMatch[] = [];
    if (useRegex) {
        try {
            const re = new RegExp(query, "gi");
            let m: RegExpExecArray | null;
            while ((m = re.exec(content)) !== null) {
                result.push({start: m.index, end: m.index + m[0].length});
                if (m[0].length === 0) re.lastIndex++; // Avoid a zero-width loop.
            }
        } catch {
            // Invalid regex — return no matches.
            return [];
        }
    } else {
        const hay = content.toLowerCase();
        const needle = query.toLowerCase();
        let idx = 0;
        while ((idx = hay.indexOf(needle, idx)) !== -1) {
            result.push({start: idx, end: idx + needle.length});
            idx += needle.length;
        }
    }
    return result;
}

/**
 * The text the view-mode matcher scans: the rendered rows —
 * `visibleCode` clipped to the collapse cut while the collapsed
 * Show-less preview is showing. Rows map 1:1 to what is on screen.
 */
export function displayedRowsText(
    visibleCode: string,
    expanded: boolean,
    isCollapsible: boolean,
    collapsedLineCount: number
): string {
    if (expanded || !isCollapsible) return visibleCode;
    return visibleCode.split("\n").slice(0, collapsedLineCount).join("\n");
}

/**
 * Every case-insensitive occurrence of `query` per displayed row (the
 * query is trimmed; several hits on one line count separately). An
 * empty query matches nothing.
 */
export function viewFindOccurrences(displayed: string, query: string): RowOccurrence[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rows = displayed.split("\n");
    const out: RowOccurrence[] = [];
    for (let i = 0; i < rows.length; i++) {
        const low = rows[i].toLowerCase();
        let idx = low.indexOf(q);
        while (idx !== -1) {
            out.push({row: i + 1, start: idx, end: idx + q.length});
            idx = low.indexOf(q, idx + q.length);
        }
    }
    return out;
}
