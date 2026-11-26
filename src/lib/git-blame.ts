/**
 * git-blame.ts — parser for `git blame --porcelain` output.
 *
 * The Git Diff panel's inline-blame mode (Section 6,runs
 * `git blame --porcelain -w -- <path>` through /api/git-command and
 * renders per-line commit short-hash + author + relative date in a
 * left gutter column. The porcelain format is the only machine-stable
 * blame output (the default "pretty" layout breaks the moment an
 * author name contains spaces of unusual width), so the raw text is
 * parsed here — server route and unit tests share this module.
 *
 * Porcelain shape (one entry per line-group, headers repeat for every
 * new commit; consecutive lines from the same commit reuse the current
 * header state):
 *
 *   <40-hex-sha> <orig-line> <final-line> [<num-lines>]
 *   author <name>
 *   author-mail <mail>
 *   author-time <unix-seconds>
 *   author-tz <+0000>
 *   committer <name>
 *   ...
 *   summary <subject>
 *   [previous <sha> <file>]        (only with -C/-M)
 *   [boundary]                     (only for boundary commits)
 *   filename <file>
 *   \t<line content>
 *
 * Content lines are distinguished SOLELY by the leading tab — header
 * keys never start with one, so a "summary" that happens to contain
 * "\nauthor …" text still can't confuse the parser (git emits the
 * header keys on their own lines).
 */

export interface BlameLine {
    /** Full 40-hex sha of the commit the line came from (all zeros +
     *  uncommitted=true for "Not Committed Yet" working-tree lines). */
    sha: string;
    /** 1-indexed line number in the FINAL (working-tree) file. */
    finalLine: number;
    /** Author display name. */
    author: string;
    /** Author time as unix seconds. */
    authorTime: number;
    /** Commit subject (first line of the message). */
    summary: string;
    /** True for working-tree lines git attributes to "Not Committed Yet". */
    uncommitted: boolean;
    /** True when the line comes from a boundary commit (older than the
     *  blame root, e.g. with -L ranges or shallow clones). */
    boundary: boolean;
}

const SHA_ZEROES = /^0+$/;

/**
 * Parse `git blame --porcelain` stdout into one BlameLine per file
 * line, in file order. Tolerant of the incremental header reuse (a
 * group header applies to every following \t-line until the next sha
 * header) and of the optional previous/boundary/filename headers.
 * Malformed input never throws — parsing stops at the bad line and
 * returns what was collected (blame of a huge file degrades to
 * partial gutter data rather than an error screen).
 */
export function parseGitBlamePorcelain(text: string): BlameLine[] {
    const out: BlameLine[] = [];
    // Current group header state — mutated as header lines stream past,
    // flushed to an entry on every \t-prefixed content line.
    let sha = "";
    let finalLine = 0;
    let author = "";
    let authorTime = 0;
    let summary = "";
    let boundary = false;

    const lines = text.split("\n");
    for (const raw of lines) {
        if (raw.startsWith("\t")) {
            // Content line — emit with the CURRENT header state. (The entry
            // header's <final-line> is authoritative for ordering; lines are
            // emitted in file order anyway, but trust the number.)
            if (!sha) continue; // content without a header — malformed, skip
            const uncommitted =
                author === "Not Committed Yet" || SHA_ZEROES.test(sha);
            out.push({
                sha,
                finalLine,
                author,
                authorTime,
                summary,
                uncommitted,
                boundary,
            });
            finalLine += 1; // next \t-line is the next file line
            continue;
        }
        // Entry header: "<sha> <orig> <final> [<count>]"
        const head = /^([0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/.exec(raw);
        if (head) {
            sha = head[1];
            finalLine = parseInt(head[3], 10);
            author = "";
            authorTime = 0;
            summary = "";
            boundary = false;
            continue;
        }
        if (raw.startsWith("author ")) {
            author = raw.slice(7);
        } else if (raw.startsWith("author-time ")) {
            authorTime = parseInt(raw.slice(12), 10) || 0;
        } else if (raw.startsWith("summary ")) {
            summary = raw.slice(8);
        } else if (raw === "boundary") {
            boundary = true;
        }
        // author-mail / author-tz / committer* / previous / filename and
        // the "\ No newline" markers are not rendered — ignored on purpose.
    }
    return out;
}

/** Collapse blame runs: consecutive lines from the same sha become one
 *  group so the gutter can render the annotation once (editors show
 *  the hash/author/date on the first line of each run, like VS Code). */
export interface BlameRun {
    sha: string;
    shortSha: string;
    author: string;
    authorTime: number;
    summary: string;
    uncommitted: boolean;
    /** 1-indexed final-file line numbers covered by this run. */
    lines: number[];
}

export function groupBlameRuns(lines: BlameLine[]): BlameRun[] {
    const runs: BlameRun[] = [];
    for (const l of lines) {
        const last = runs[runs.length - 1];
        if (last && last.sha === l.sha) {
            last.lines.push(l.finalLine);
        } else {
            runs.push({
                sha: l.sha,
                shortSha: l.sha.slice(0, 7),
                author: l.author,
                authorTime: l.authorTime,
                summary: l.summary,
                uncommitted: l.uncommitted,
                lines: [l.finalLine],
            });
        }
    }
    return runs;
}

/** Relative time label ("just now", "3 d ago") for a unix-seconds
 *  timestamp — mirrors the Git Log dialog's wording so both views age
 *  the same commit identically. Pure (takes `now` for testability). */
export function blameRelTime(unixSec: number, nowMs: number = Date.now()): string {
    const diff = nowMs / 1000 - unixSec;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
    if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} mo ago`;
    return `${Math.floor(diff / (86400 * 365))} y ago`;
}
