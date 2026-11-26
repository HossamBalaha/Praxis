/**
 * Markdown outline parsing for the studio's outline
 * sidebar + a simple line-diff for the Toolbox's "Diff two snippets"
 * (also reused by the snippet manager's preview). Pure functions.
 */

export interface OutlineHeading {
    level: number;
    text: string;
    /** 0-based line index of the heading. */
    line: number;
}

/** Parse ATX (#) headings, ignoring fenced code blocks. */
export function parseMarkdownOutline(text: string): OutlineHeading[] {
    const out: OutlineHeading[] = [];
    const lines = text.split("\n");
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (m) {
            out.push({level: m[1].length, text: m[2].trim(), line: i});
        }
    }
    return out;
}

/** Map a heading to the anchor id react-markdown/remark generate
 *  (github-slugger style: lowercase, strip punctuation, spaces → -). */
export function headingAnchor(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[\u2000-\u206f\u2e00-\u2e7f'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, "")
        .replace(/\s+/g, "-");
}

// ─── Line diff (LCS) ────────────────────────────────────────────────

export type DiffOp = "same" | "add" | "del";

export interface DiffLine {
    op: DiffOp;
    text: string;
    /** Line number in A (for same/del) or B (for same/add). */
    lineNo: number;
}

/** LCS-based line diff between two snippets (capped at 800 lines
 *  each — the O(n·m) table is fine for tool-sized inputs). */
export function diffLines(aText: string, bText: string, cap = 800): DiffLine[] {
    const a = aText.split("\n").slice(0, cap);
    const b = bText.split("\n").slice(0, cap);
    const n = a.length;
    const m = b.length;
    // dp[i][j] = LCS length of a[i:], b[j:]
    const dp: number[][] = Array.from({length: n + 1}, () =>
        new Array<number>(m + 1).fill(0)
    );
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    let lineA = 0;
    let lineB = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            lineA++;
            lineB++;
            out.push({op: "same", text: a[i], lineNo: lineB});
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            lineA++;
            out.push({op: "del", text: a[i], lineNo: lineA});
            i++;
        } else {
            lineB++;
            out.push({op: "add", text: b[j], lineNo: lineB});
            j++;
        }
    }
    while (i < n) {
        lineA++;
        out.push({op: "del", text: a[i], lineNo: lineA});
        i++;
    }
    while (j < m) {
        lineB++;
        out.push({op: "add", text: b[j], lineNo: lineB});
        j++;
    }
    return out;
}
