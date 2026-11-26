/**
 * ai-chat-mentions.test.ts — unit tests for the repo-aware chat's pure
 * helpers:
 *
 *  - src/lib/ai-chat-utils.ts — @-mention parsing/serialization
 *    (findActiveMentionQuery / buildContextFiles / serializeMentions),
 *    `path:line` citation extraction + the linkify pass
 *    (extractCitations / codeSpanRanges / linkifyCitations /
 *    parseCitationHref), the project-tree flattening + git-path matcher
 *    (flattenProjectFiles / matchProjectFilePath).
 *  - src/lib/ai.ts — the server-side contextFiles sanitizer + the
 *    line-numbered system-context block builder
 *    (sanitizeContextFiles / numberedSourceLines / buildContextFilesBlock).
 */

import {describe, expect, it} from "vitest";
import {
    buildContextFiles,
    type ChatMention,
    CITATION_HREF_PREFIX,
    codeSpanRanges,
    extractCitations,
    findActiveMentionQuery,
    flattenProjectFiles,
    linkifyCitations,
    matchProjectFilePath,
    MENTION_FILE_CAP,
    parseCitationHref,
    type ProjectTreeFolder,
    serializeMentions,
} from "@/lib/ai-chat-utils";
import {
    AI_CONTEXT_CITATION_INSTRUCTION,
    AI_CONTEXT_FILES_CAP,
    buildContextFilesBlock,
    numberedSourceLines,
    sanitizeContextFiles,
} from "@/lib/ai";

/* ─── findActiveMentionQuery ──────────────────────────────────────── */

describe("findActiveMentionQuery", () => {
    it("finds an open token at the end of the text", () => {
        expect(findActiveMentionQuery("how does @util")).toEqual({
            at: 9,
            query: "util",
        });
    });

    it("returns the bare @ for a just-typed @", () => {
        expect(findActiveMentionQuery("see @")).toEqual({at: 4, query: ""});
    });

    it("closes the token once whitespace follows it", () => {
        expect(findActiveMentionQuery("see @util and more")).toBeNull();
    });

    it("tracks the LAST @ (typing past a mistaken one)", () => {
        expect(findActiveMentionQuery("@a@b")).toEqual({at: 2, query: "b"});
    });

    it("returns null without any @", () => {
        expect(findActiveMentionQuery("plain question")).toBeNull();
    });
});

/* ─── buildContextFiles (payload building: dedup + cap) ───────────── */

describe("buildContextFiles", () => {
    it("dedups identical mentions (same path + symbol)", () => {
        const mentions: ChatMention[] = [
            {path: "My Folder/utils.py"},
            {path: "My Folder/utils.py"},
        ];
        expect(buildContextFiles(mentions)).toEqual([
            {path: "My Folder/utils.py"},
        ]);
    });

    it("keeps several symbols of the same file (one file for the cap)", () => {
        const out = buildContextFiles([
            {path: "a.py", symbol: "load", kind: "function"},
            {path: "a.py", symbol: "dump", kind: "function"},
        ]);
        expect(out).toHaveLength(2);
        expect(new Set(out.map((m) => m.path))).toEqual(new Set(["a.py"]));
    });

    it("caps at MENTION_FILE_CAP distinct paths, keeping attachment order", () => {
        const mentions: ChatMention[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
            path: `file${n}.py`,
        }));
        const out = buildContextFiles(mentions);
        expect(out).toHaveLength(MENTION_FILE_CAP);
        expect(out.map((m) => m.path)).toEqual([
            "file1.py",
            "file2.py",
            "file3.py",
            "file4.py",
            "file5.py",
        ]);
    });

    it("drops empty paths", () => {
        expect(buildContextFiles([{path: "  "}, {path: "ok.py"}])).toEqual([
            {path: "ok.py"},
        ]);
    });
});

/* ─── serializeMentions ───────────────────────────────────────────── */

describe("serializeMentions", () => {
    it("appends file tags after the typed text", () => {
        expect(serializeMentions("what does this do", [{path: "utils.py"}])).toBe(
            "what does this do @utils.py"
        );
    });

    it("renders symbol mentions as @path ▸ symbol", () => {
        expect(
            serializeMentions("explain", [
                {path: "My Folder/stats.py", symbol: "brier_score", kind: "function"},
            ])
        ).toBe("explain @My Folder/stats.py ▸ brier_score");
    });

    it("returns the plain text when there are no mentions", () => {
        expect(serializeMentions("  hello  ", [])).toBe("hello");
    });

    it("is idempotent for an already-serialized message (the retry path)", () => {
        const once = serializeMentions("q", [
            {path: "a.py"},
            {path: "b.py"},
        ]);
        expect(serializeMentions(once, [])).toBe(once);
    });
});

/* ─── citation extraction + linkify ───────────────────────────────── */

describe("extractCitations", () => {
    it("finds plain and nested paths with line numbers", () => {
        const out = extractCitations(
            "See utils.py:42 and My Folder/sub/load.py:1203 for details."
        );
        expect(out).toEqual([
            {path: "utils.py", line: 42, text: "utils.py:42"},
            {path: "My Folder/sub/load.py", line: 1203, text: "My Folder/sub/load.py:1203"},
        ]);
    });

    it("matches case-insensitively (path:LINE casing)", () => {
        const out = extractCitations("defined in UTILS.PY:7");
        expect(out).toEqual([{path: "UTILS.PY", line: 7, text: "UTILS.PY:7"}]);
    });

    it("ignores host:port and IP:port pairs", () => {
        expect(extractCitations("connect to localhost:8080 or 127.0.0.1:8080")).toEqual([]);
    });

    it("ignores citations inside fenced code blocks", () => {
        const md = "Look at utils.py:1 first.\n\n```python\n# see utils.py:2\nx = 1\n```\n";
        const out = extractCitations(md);
        expect(out).toEqual([{path: "utils.py", line: 1, text: "utils.py:1"}]);
    });

    it("ignores citations inside inline code", () => {
        const out = extractCitations("run `utils.py:5` in the shell");
        expect(out).toEqual([]);
    });

    it("rejects line zero and non-numeric lines", () => {
        expect(extractCitations("utils.py:0")).toEqual([]);
        expect(extractCitations("utils.py:abc")).toEqual([]);
    });
});

describe("codeSpanRanges", () => {
    it("covers fenced blocks including their marker lines", () => {
        const md = "a\n```python\nx=1\n```\nb";
        const ranges = codeSpanRanges(md);
        expect(ranges).toHaveLength(1);
        expect(ranges[0]!.kind).toBe("fence");
        expect(md.slice(ranges[0]!.start, ranges[0]!.end)).toBe("```python\nx=1\n```");
    });

    it("covers inline code contents without the backticks", () => {
        const md = "see `utils.py:9` here";
        const ranges = codeSpanRanges(md);
        expect(ranges).toHaveLength(1);
        expect(ranges[0]!.kind).toBe("inline");
        expect(md.slice(ranges[0]!.start, ranges[0]!.end)).toBe("utils.py:9");
    });
});

describe("linkifyCitations", () => {
    it("rewrites prose citations into markdown links", () => {
        const out = linkifyCitations("See utils.py:42 for the loop.");
        expect(out).toBe(
            `See [utils.py:42](${CITATION_HREF_PREFIX}${encodeURIComponent("utils.py:42")}) for the loop.`
        );
    });

    it("leaves code fences and inline code byte-identical", () => {
        const md = "```python\n# utils.py:1\nx = 1\n```\nand `utils.py:2` inline";
        expect(linkifyCitations(md)).toBe(md);
    });

    it("round-trips through parseCitationHref", () => {
        const out = linkifyCitations("My Folder/stats.py:15!");
        expect(parseCitationHref(`${CITATION_HREF_PREFIX}${encodeURIComponent("My Folder/stats.py:15")}`)).toEqual({
            path: "My Folder/stats.py",
            line: 15,
        });
        expect(out).toContain("My Folder/stats.py:15");
    });

    it("parseCitationHref rejects ordinary hrefs", () => {
        expect(parseCitationHref("https://example.com")).toBeNull();
        expect(parseCitationHref("#anchor")).toBeNull();
    });
});

/* ─── project tree flattening + matching ──────────────────────────── */

const TREE: ProjectTreeFolder[] = [
    {
        name: "python_scripts",
        slug: "cHl0aG9uX3NjcmlwdHM",
        isRoot: true,
        files: [
            {name: "hello.py", slug: "aGVsbG8ucHk", path: "hello.py", mtime: 10},
        ],
    },
    {
        name: "My Folder",
        slug: "bXktZm9sZGVy",
        files: [
            {name: "utils.py", slug: "dXRpbHMucHk", path: "utils.py", mtime: 30},
            {name: "load.py", slug: "bG9hZC5weQ", path: "sub/load.py", mtime: 20},
        ],
    },
];

describe("flattenProjectFiles", () => {
    it("prefixes folder files and keeps root files bare", () => {
        const out = flattenProjectFiles(TREE);
        expect(out.map((f) => f.path)).toEqual([
            "hello.py",
            "My Folder/utils.py",
            "My Folder/sub/load.py",
        ]);
        expect(out[1]).toMatchObject({folderSlug: "bXktZm9sZGVy", fileSlug: "dXRpbHMucHk"});
        expect(out[1]!.mtime).toBe(30);
    });
});

describe("matchProjectFilePath", () => {
    it("matches an exact tree path", () => {
        expect(matchProjectFilePath("My Folder/utils.py", TREE)).toMatchObject({
            folderSlug: "bXktZm9sZGVy",
            fileSlug: "dXRpbHMucHk",
            fileName: "utils.py",
        });
    });

    it("matches a root-level file by its bare name", () => {
        expect(matchProjectFilePath("hello.py", TREE)).toMatchObject({
            folderSlug: "cHl0aG9uX3NjcmlwdHM",
            fileName: "hello.py",
        });
    });

    it("matches a git path carrying a repo-root prefix (suffix pass)", () => {
        expect(matchProjectFilePath("repo/python_scripts/hello.py", TREE)).toMatchObject({
            fileName: "hello.py",
        });
    });

    it("matches a symbol-style folder/basename path to a nested file (basename pass)", () => {
        expect(matchProjectFilePath("My Folder/load.py", TREE)).toMatchObject({
            fileSlug: "bG9hZC5weQ",
            fileName: "load.py",
        });
    });

    it("returns null for an unknown path", () => {
        expect(matchProjectFilePath("nope/missing.py", TREE)).toBeNull();
        expect(matchProjectFilePath("", TREE)).toBeNull();
    });
});

/* ─── server-side sanitizer + block builder (lib/ai.ts) ───────────── */

describe("sanitizeContextFiles", () => {
    it("keeps valid entries and clamps junk", () => {
        const out = sanitizeContextFiles([
            {path: "My Folder/utils.py", symbol: "load", kind: "function"},
            {path: "utils.py"},
            {path: ""},
            "junk",
            null,
            42,
            {symbol: "orphan"},
        ]);
        expect(out).toEqual([
            {path: "My Folder/utils.py", symbol: "load", kind: "function"},
            {path: "utils.py"},
        ]);
    });

    it("caps at AI_CONTEXT_FILES_CAP distinct paths and dedups", () => {
        const raw = [1, 2, 3, 4, 5, 6].map((n) => ({path: `f${n}.py`}));
        const out = sanitizeContextFiles(raw);
        expect(out).toHaveLength(AI_CONTEXT_FILES_CAP);
        expect(sanitizeContextFiles([{path: "a.py"}, {path: "a.py"}])).toEqual([
            {path: "a.py"},
        ]);
    });

    it("rejects non-array payloads", () => {
        expect(sanitizeContextFiles(undefined)).toEqual([]);
        expect(sanitizeContextFiles("a.py")).toEqual([]);
    });
});

describe("numberedSourceLines", () => {
    it("renders the {i+1:6d} | line format", () => {
        const {text, truncated} = numberedSourceLines("a\nb", 100);
        expect(text).toBe("     1 | a\n     2 | b");
        expect(truncated).toBe(false);
    });

    it("flags + clips oversized content", () => {
        const big = "x".repeat(50);
        const {text, truncated} = numberedSourceLines(big, 10);
        expect(truncated).toBe(true);
        expect(text).toBe("     1 | " + "x".repeat(10));
    });
});

describe("buildContextFilesBlock", () => {
    it("returns '' for an empty list", () => {
        expect(buildContextFilesBlock([])).toBe("");
    });

    it("emits path headings, symbol-focus line, numbered content and the grounding instruction", () => {
        const block = buildContextFilesBlock([
            {path: "utils.py", content: "x = 1\ny = 2"},
            {path: "stats.py", symbol: "brier", kind: "function", content: "def brier():\n    pass"},
        ]);
        expect(block).toContain("Referenced project files (mentioned by the user):");
        expect(block).toContain("## utils.py");
        expect(block).toContain("     1 | x = 1");
        expect(block).toContain("     2 | y = 2");
        expect(block).toContain("## stats.py");
        expect(block).toContain("Symbol focus: brier (function)");
        expect(block).toContain(AI_CONTEXT_CITATION_INSTRUCTION);
        expect(block.endsWith("\n\n")).toBe(true);
    });

    it("documents unreadable files instead of dropping them silently", () => {
        const block = buildContextFilesBlock([{path: "gone.py", content: null}]);
        expect(block).toContain("## gone.py");
        expect(block).toContain("(this file could not be read");
        expect(block).toContain(AI_CONTEXT_CITATION_INSTRUCTION);
    });
});
