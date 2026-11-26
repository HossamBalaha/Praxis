/**
 * ai-review-anchors.test.ts — unit tests for the AI-review "apply fix in
 * place" anchoring, all against the PURE helpers in
 * src/lib/ai-chat-utils.ts:
 *
 *  - splitDiffFileSections — the per-file split of a (possibly
 *    multi-file) concatenated diff, including the untracked
 *    /dev/null case, with cumulative hunk indices matching the flat
 *    list the reviewer prompt numbers (diffHunkList).
 *  - hunkNewSideLines / hunkNewStartLine — the hunk's lines as they
 *    exist in the CURRENT working-tree file + the header's new-file
 *    start line.
 *  - spliceHunkFix — locating the hunk's new side in the file content
 *    (header line anchor, then an exact text search for drift) and
 *    replacing the hunk's ADDED lines with the fixed text; the drift
 *    fallback contract (null) drives the dialog's append + inline
 *    warning.
 *  - matchProjectFilePath — resolving a diff/symbol path against the
 *    explorer tree.
 */

import {describe, expect, it} from "vitest";
import {
    type DiffHunk,
    diffHunkList,
    hunkNewSideLines,
    hunkNewStartLine,
    matchProjectFilePath,
    spliceHunkFix,
    splitDiffFileSections,
} from "@/lib/ai-chat-utils";

/** A two-file concatenated diff, exactly what page.tsx's
 * menuOpenAiReview builds (parts joined with "\n"). */
const TWO_FILE_DIFF = [
    "diff --git a/My Folder/utils.py b/My Folder/utils.py",
    "index 111..222 100644",
    "--- a/My Folder/utils.py",
    "+++ b/My Folder/utils.py",
    "@@ -1,4 +1,5 @@",
    " import os",
    "-x = 1",
    "+x = 2",
    "+y = 3",
    " print(x)",
    "diff --git a/other.py b/other.py",
    "index 333..444 100644",
    "--- a/other.py",
    "+++ b/other.py",
    "@@ -10,3 +10,3 @@",
    " def a():",
    "-    return 1",
    "+    return 2",
    " ",
].join("\n");

/** Untracked file — git diffs it against /dev/null, so there is no
 * `+++ b/` header to take the path from; the `diff --git` line carries
 * it. */
const UNTRACKED_DIFF = [
    "diff --git a/new_file.py b/new_file.py",
    "new file mode 100644",
    "index 000..555",
    "--- /dev/null",
    "+++ b/new_file.py",
    "@@ -0,0 +1,2 @@",
    "+def hello():",
    "+    return 42",
].join("\n");

describe("splitDiffFileSections", () => {
    it("splits a concatenated multi-file diff into per-file sections with paths", () => {
        const sections = splitDiffFileSections(TWO_FILE_DIFF);
        expect(sections.map((s) => s.path)).toEqual([
            "My Folder/utils.py",
            "other.py",
        ]);
        expect(sections[0]!.hunks).toHaveLength(1);
        expect(sections[1]!.hunks).toHaveLength(1);
    });

    it("takes the path from the diff --git line when +++ is /dev/null (untracked)", () => {
        const sections = splitDiffFileSections(UNTRACKED_DIFF);
        expect(sections).toHaveLength(1);
        expect(sections[0]!.path).toBe("new_file.py");
        expect(sections[0]!.hunks[0]!.lines).toEqual([
            "+def hello():",
            "+    return 42",
        ]);
    });

    it("numbers hunks cumulatively exactly like the flat list (the prompt contract)", () => {
        const flat = diffHunkList(TWO_FILE_DIFF);
        const sections = splitDiffFileSections(TWO_FILE_DIFF);
        const viaSections = sections.flatMap((s) => s.hunks);
        expect(viaSections).toEqual(flat);
        expect(flat).toHaveLength(2);
        expect(flat[0]!.header).toBe("@@ -1,4 +1,5 @@");
        expect(flat[1]!.header).toBe("@@ -10,3 +10,3 @@");
    });
});

describe("hunkNewSideLines", () => {
    it("collects context + added lines with the prefix stripped", () => {
        const hunk: DiffHunk = {
            header: "@@ -1,4 +1,5 @@",
            lines: [" import os", "-x = 1", "+x = 2", "+y = 3", " print(x)"],
        };
        expect(hunkNewSideLines(hunk)).toEqual([
            "import os",
            "x = 2",
            "y = 3",
            "print(x)",
        ]);
    });

    it("handles an empty context line (' ' alone)", () => {
        const hunk: DiffHunk = {
            header: "@@ -10,3 +10,3 @@",
            lines: [" def a():", "-    return 1", "+    return 2", " "],
        };
        expect(hunkNewSideLines(hunk)).toEqual([
            "def a():",
            "    return 2",
            "",
        ]);
    });
});

describe("hunkNewStartLine", () => {
    it("parses the new-file start line", () => {
        expect(hunkNewStartLine({header: "@@ -1,4 +1,5 @@", lines: []})).toBe(1);
        expect(hunkNewStartLine({header: "@@ -10,3 +42,7 @@", lines: []})).toBe(42);
    });

    it("returns null for malformed headers and deleted files (+0,0)", () => {
        expect(hunkNewStartLine({header: "@@ garbage", lines: []})).toBeNull();
        expect(hunkNewStartLine({header: "@@ -1,3 +0,0 @@", lines: []})).toBeNull();
    });
});

describe("spliceHunkFix", () => {
    /** The working-tree state of "My Folder/utils.py" AFTER the diff above
     * was taken (the diff's new side is what the file now holds). */
    const FILE = "import os\nx = 2\ny = 3\nprint(x)\n";

    const HUNK: DiffHunk = {
        header: "@@ -1,4 +1,5 @@",
        lines: [" import os", "-x = 1", "+x = 2", "+y = 3", " print(x)"],
    };

    it("replaces the hunk's added lines in place (header line anchor)", () => {
        const out = spliceHunkFix(FILE, HUNK, "x = 2\ny = 99");
        expect(out).not.toBeNull();
        expect(out!.content).toBe("import os\nx = 2\ny = 99\nprint(x)\n");
        expect(out!.startLine).toBe(1);
    });

    it("falls back to an exact text search when the header line number drifted", () => {
        // The file gained a leading comment AFTER the diff was taken — the
        // hunk block still exists verbatim, one line lower.
        const drifted = `# header comment\n${FILE}`;
        const out = spliceHunkFix(drifted, HUNK, "x = 2\ny = 99");
        expect(out).not.toBeNull();
        expect(out!.content).toBe("# header comment\nimport os\nx = 2\ny = 99\nprint(x)\n");
        expect(out!.startLine).toBe(2);
    });

    it("returns null (drift) when the hunk's new side is not in the file", () => {
        expect(spliceHunkFix("totally different content\n", HUNK, "x = 9")).toBeNull();
    });

    it("preserves the trailing-newline parity of the file", () => {
        const noTrailing = "import os\nx = 2\ny = 3\nprint(x)";
        const out = spliceHunkFix(noTrailing, HUNK, "x = 2\ny = 99");
        expect(out!.content).toBe("import os\nx = 2\ny = 99\nprint(x)");
    });

    it("places the fixed text at the FIRST added line when adds interleave with context", () => {
        const hunk: DiffHunk = {
            header: "@@ -1,5 +1,6 @@",
            lines: [" a", "+b1", " c", "+b2", " d"],
        };
        const file = "a\nb1\nc\nb2\nd";
        const out = spliceHunkFix(file, hunk, "FIXED");
        // 'b1' and 'b2' (both added lines) are gone; FIXED sits where b1 was.
        expect(out!.content).toBe("a\nFIXED\nc\nd");
    });

    it("inserts the fix after the anchored block for a pure-deletion hunk", () => {
        const hunk: DiffHunk = {
            header: "@@ -1,3 +1,2 @@",
            lines: [" keep", "-gone", " tail"],
        };
        const file = "keep\ntail";
        const out = spliceHunkFix(file, hunk, "INSERTED");
        // No added lines exist to replace — the fix lands at the anchor
        // block's end so the deletion context stays intact.
        expect(out!.content).toBe("keep\ntail\nINSERTED");
    });

    it("returns null for a hunk with no new side", () => {
        const hunk: DiffHunk = {header: "@@ -1,1 +0,0 @@", lines: ["-only"]};
        expect(spliceHunkFix("anything", hunk, "fix")).toBeNull();
    });
});

describe("matchProjectFilePath (review-dialog file resolution)", () => {
    // Covered more broadly in ai-chat-mentions.test.ts; this pins the two
    // shapes the review dialog feeds it (git diff paths).
    const tree = [
        {
            name: "My Folder",
            slug: "f",
            files: [
                {name: "utils.py", slug: "u", path: "utils.py"},
                {name: "load.py", slug: "l", path: "sub/load.py"},
            ],
        },
    ];

    it("resolves a +++ b/ path from a multi-file diff", () => {
        const sections = splitDiffFileSections(TWO_FILE_DIFF);
        const {path} = sections[0]!;
        expect(path).toBe("My Folder/utils.py");
        // matchProjectFilePath is exercised in the mentions suite — here we
        // just assert the diff parser produced a resolvable path shape.
        expect(path.split("/").length).toBe(2);
    });

    it("resolves nested file paths against a tree with a basename pass", () => {
        expect(matchProjectFilePath("My Folder/load.py", tree)).toMatchObject({
            fileSlug: "l",
        });
    });
});
