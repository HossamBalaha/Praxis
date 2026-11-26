/**
 * # %% notebook-cell parsing for the code viewer
 * (src/components/code-viewer.tsx) — the pure scanner behind both the
 * read-only cell view and the edit-mode Alt+Enter run-cell.
 *
 * A cell starts at a `# %%` marker line (optionally `[markdown]`) and
 * runs to the next marker; content before the first marker is its own
 * code cell when it has any non-blank line. Pure string math, zero
 * React/DOM (see __tests__/notebook-cells.test.ts).
 */

/** One # %% cell of a Python file. */
export interface NotebookCell {
    /** 1-based line of the cell's first content row (after the marker). */
    startLine: number;
    /** 1-based line of the cell's last content row (before the next marker). */
    endLine: number;
    type: "code" | "markdown";
    source: string;
    /** First non-comment prose line (≤ 80 chars) for the cell header. */
    heading?: string;
}

/** True for a `# %%` cell marker line (optionally `[markdown]`). */
export function isCellMarker(line: string): boolean {
    return /^\s*#\s*%%(\s+\[markdown\])?/i.test(line);
}

/** The first prose line at/after `startIdx` (skipping blanks,
 *  comments and markers) — the cell header's heading text. */
function cellHeadingOf(lines: string[], startIdx: number): string | undefined {
    for (let i = startIdx; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l || l.startsWith("#") || isCellMarker(l)) continue;
        return l.slice(0, 80);
    }
    return undefined;
}

/**
 * Split a Python file into # %% cells. Files without markers yield
 * one code cell covering the whole file (when it has any content);
 * empty files yield no cells.
 */
export function parseCells(source: string): NotebookCell[] {
    const lines = source.split("\n");
    const cells: NotebookCell[] = [];
    let cellStart = -1;
    let cellType: "code" | "markdown" = "code";
    let hasMarker = false;
    if (lines.length > 0 && !isCellMarker(lines[0])) {
        let firstMarker = -1;
        for (let i = 0; i < lines.length; i++) {
            if (isCellMarker(lines[i])) {
                firstMarker = i;
                break;
            }
        }
        const endIdx = firstMarker === -1 ? lines.length : firstMarker;
        if (lines.slice(0, endIdx).some((l) => l.trim())) {
            cells.push({
                startLine: 1,
                endLine: endIdx,
                type: "code",
                source: lines.slice(0, endIdx).join("\n"),
                heading: cellHeadingOf(lines, 0)
            });
        }
        if (firstMarker === -1) return cells;
        cellStart = firstMarker;
        cellType = /\[markdown\]/i.test(lines[firstMarker]) ? "markdown" : "code";
        hasMarker = true;
    }
    for (let i = 0; i < lines.length; i++) {
        if (isCellMarker(lines[i])) {
            if (hasMarker && cellStart >= 0) {
                cells.push({
                    startLine: cellStart + 1,
                    endLine: i,
                    type: cellType,
                    source: lines.slice(cellStart + 1, i).join("\n"),
                    heading: cellHeadingOf(lines, cellStart + 1)
                });
            }
            cellStart = i;
            cellType = /\[markdown\]/i.test(lines[i]) ? "markdown" : "code";
            hasMarker = true;
        }
    }
    if (hasMarker && cellStart >= 0) {
        cells.push({
            startLine: cellStart + 1,
            endLine: lines.length,
            type: cellType,
            source: lines.slice(cellStart + 1).join("\n"),
            heading: cellHeadingOf(lines, cellStart + 1)
        });
    }
    return cells;
}
