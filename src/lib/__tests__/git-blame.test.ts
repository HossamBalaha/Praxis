/**
 * git-blame.test.ts — unit tests for src/lib/git-blame.ts.
 *
 * Covers the porcelain parser against a realistic fixture (two
 * commits + one "Not Committed Yet" working-tree line), header-reuse
 * semantics (consecutive lines of the same commit omit the headers),
 * boundary entries, run grouping, and the relative-time labels.
 */
import {describe, expect, it} from "vitest";
import {blameRelTime, groupBlameRuns, parseGitBlamePorcelain,} from "@/lib/git-blame";

const SHA_A = "a".repeat(40);
const SHA_B = "b1b2b3b4b5".padEnd(40, "0");

/** Hand-built porcelain fixture: 5 lines —
 * lines 1-2 from commit A, line 3 from commit B, line 4 from B again
 * (header REUSE — git omits the headers for a same-commit neighbor),
 * line 5 uncommitted. */
const FIXTURE = [
    `${SHA_A} 1 1 2`,
    "author Ada Lovelace",
    "author-mail ada@example.com",
    "author-time 1700000000",
    "author-tz +0000",
    "committer Ada Lovelace",
    "committer-time 1700000000",
    `summary ${"Add first draft"}`,
    "filename notes.py",
    "\timport os",
    "\timport sys",
    `${SHA_B} 9 3`,
    "author Grace Hopper",
    "author-mail grace@example.com",
    "author-time 1710000000",
    "author-tz +0000",
    "summary Fix import order",
    "filename notes.py",
    "\timport json",
    "\timport re",
    `${"0".repeat(40)} 99 5`,
    "author Not Committed Yet",
    "author-mail <not.committed.yet>",
    "author-time 1720000000",
    "author-tz +0000",
    "summary Version stage is the file on disk",
    "filename notes.py",
    "\tprint('wip')",
].join("\n");

describe("parseGitBlamePorcelain", () => {
    it("parses per-line sha/author/time/summary in file order", () => {
        const lines = parseGitBlamePorcelain(FIXTURE);
        expect(lines).toHaveLength(5);
        expect(lines.map((l) => l.finalLine)).toEqual([1, 2, 3, 4, 5]);
        expect(lines[0]).toMatchObject({
            sha: SHA_A,
            author: "Ada Lovelace",
            authorTime: 1700000000,
            summary: "Add first draft",
            uncommitted: false,
        });
    });

    it("reuses the group header for consecutive same-commit lines", () => {
        const lines = parseGitBlamePorcelain(FIXTURE);
        // Lines 3-4 are both from SHA_B (the 4th line has NO header block).
        expect(lines[3].sha).toBe(SHA_B);
        expect(lines[3].author).toBe("Grace Hopper");
        expect(lines[3].summary).toBe("Fix import order");
    });

    it("marks Not Committed Yet lines (zero sha) as uncommitted", () => {
        const lines = parseGitBlamePorcelain(FIXTURE);
        expect(lines[4].uncommitted).toBe(true);
        expect(lines[4].author).toBe("Not Committed Yet");
    });

    it("survives malformed input without throwing", () => {
        expect(parseGitBlamePorcelain("")).toEqual([]);
        // A content line with no preceding sha header is skipped.
        expect(parseGitBlamePorcelain("\tlost line")).toEqual([]);
        // Truncated mid-header entry: the headers before the missing
        // content line simply never emit an entry.
        const partial = parseGitBlamePorcelain(
            `${SHA_A} 1 1 1\nauthor Ada\n`
        );
        expect(partial).toEqual([]);
    });

    it("tracks the boundary marker and ignores unknown headers", () => {
        const boundaryFixture = [
            `${SHA_A} 1 1`,
            "boundary",
            "author Ada Lovelace",
            "author-time 1700000000",
            "previous 1234567890 old_name.py",
            "filename notes.py",
            "summary Old import",
            "\timport os",
        ].join("\n");
        const lines = parseGitBlamePorcelain(boundaryFixture);
        expect(lines).toHaveLength(1);
        expect(lines[0].boundary).toBe(true);
        expect(lines[0].summary).toBe("Old import");
    });

    it("keeps parsing when a summary contains header-looking text", () => {
        // The summary VALUE lives on its own line; a literal "author X"
        // inside it is impossible to express — but a summary containing
        // tabs or keywords after the first space must not break the scan.
        const tricky = [
            `${SHA_A} 1 1`,
            "author A U Thor",
            "author-time 1700000000",
            "summary fix: handle author-time parsing",
            "filename f.py",
            "\tx = 1",
        ].join("\n");
        const lines = parseGitBlamePorcelain(tricky);
        expect(lines[0].summary).toBe("fix: handle author-time parsing");
        expect(lines[0].author).toBe("A U Thor");
    });
});

describe("groupBlameRuns", () => {
    it("collapses consecutive same-commit lines into one run", () => {
        const runs = groupBlameRuns(parseGitBlamePorcelain(FIXTURE));
        expect(runs.map((r) => r.lines)).toEqual([[1, 2], [3, 4], [5]]);
        expect(runs[0].shortSha).toBe(SHA_A.slice(0, 7));
        expect(runs[2].uncommitted).toBe(true);
    });

    it("starts a new run when the same sha returns after a gap", () => {
        // A-B-A ordering must produce three runs, not two.
        const lines = [
            {sha: "a", finalLine: 1, author: "A", authorTime: 1, summary: "s", uncommitted: false, boundary: false},
            {sha: "b", finalLine: 2, author: "B", authorTime: 2, summary: "s", uncommitted: false, boundary: false},
            {sha: "a", finalLine: 3, author: "A", authorTime: 1, summary: "s", uncommitted: false, boundary: false},
        ];
        expect(groupBlameRuns(lines)).toHaveLength(3);
    });
});

describe("blameRelTime", () => {
    const NOW = 1_700_000_000_000; // fixed epoch for determinism
    it("labels the classic buckets", () => {
        expect(blameRelTime(NOW / 1000, NOW)).toBe("just now");
        expect(blameRelTime(NOW / 1000 - 120, NOW)).toBe("2 min ago");
        expect(blameRelTime(NOW / 1000 - 7200, NOW)).toBe("2 h ago");
        expect(blameRelTime(NOW / 1000 - 86400 * 3, NOW)).toBe("3 d ago");
        expect(blameRelTime(NOW / 1000 - 86400 * 60, NOW)).toBe("2 mo ago");
        expect(blameRelTime(NOW / 1000 - 86400 * 730, NOW)).toBe("2 y ago");
    });
});
