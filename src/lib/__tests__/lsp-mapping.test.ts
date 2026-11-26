/**
 * lsp-mapping.test.ts — unit tests for src/lib/lsp-mapping.ts.
 *
 * Every translation the LSP routes rely on, proved against the raw
 * shapes pyright actually emits:
 *   - 0-based → 1-based position math (the off-by-one class of bug)
 *   - file:// uri decoding, Windows-style uris, non-file uris
 *   - locateScriptPath: in-project files, NESTED files, escapes (..),
 *     a different drive, the root itself
 *   - mapHover: MarkupContent with a ```python fence + `---` docstring
 *     separator, MarkedString, MarkedString[], empty shapes
 *   - mapDefinition: single Location, arrays, LocationLink targets,
 *     external (site-packages) locations counted, not navigated
 *   - mapReferenceLocations: external rows dropped
 *   - mapDiagnostics: severity 1/2/3/absent buckets + the code prefix
 *   - mapPrepareRename + mapRenameEdits: placeholder, extents, the
 *     caret defSite flag, external files skipped
 *   - applyExactRenames: single + multiple edits, same-line edits,
 *     overlap REJECTION, out-of-range rejection, identity on []
 */
import {describe, expect, it} from "vitest";
import {
    applyExactRenames,
    locateScriptPath,
    mapDefinition,
    mapDiagnostics,
    mapHover,
    mapPrepareRename,
    mapReferenceLocations,
    mapRenameEdits,
    severityFromLsp,
    toOneBasedCol,
    toOneBasedLine,
    uriToAbsolutePath,
} from "@/lib/lsp-mapping";

/** The slugify the routes use (base64url — see lib/scripts.ts). */
const slugify = (name: string) => Buffer.from(name, "utf-8").toString("base64url");

// A POSIX-style scripts root for the location tests.
const ROOT = "/workspace/python_scripts";

describe("position math", () => {
    it("shifts LSP 0-based positions to 1-based", () => {
        // Line 0 → 1.
        expect(toOneBasedLine(0)).toBe(1);
        // Character 0 → 1.
        expect(toOneBasedCol(0)).toBe(1);
        // Line 4 → 5.
        expect(toOneBasedLine(4)).toBe(5);
        // Negative input floors at 1 (a malformed server payload).
        expect(toOneBasedLine(-3)).toBe(1);
        expect(toOneBasedCol(-3)).toBe(1);
    });
});

describe("uriToAbsolutePath", () => {
    it("decodes file uris (including percent-encoded spaces)", () => {
        // A plain uri.
        expect(uriToAbsolutePath("file:///workspace/proj/a.py")).toBe("/workspace/proj/a.py");
        // A percent-encoded space.
        expect(uriToAbsolutePath("file:///workspace/My%20Folder/a%20b.py")).toBe("/workspace/My Folder/a b.py");
    });

    it("returns null for non-file and malformed uris", () => {
        // An untitled document.
        expect(uriToAbsolutePath("untitled:Untitled-1")).toBeNull();
        // An https uri.
        expect(uriToAbsolutePath("https://example.com/x.py")).toBeNull();
        // A truncated percent escape.
        expect(uriToAbsolutePath("file://%2")).toBeNull();
        // A host-bearing (UNC-ish) file uri.
        expect(uriToAbsolutePath("file://c")).toBeNull();
    });
});

describe("locateScriptPath", () => {
    it("recovers (folderName, fileName) for an in-project file", () => {
        // A top-level file.
        const located = locateScriptPath("/workspace/python_scripts/Stats/brier.py", ROOT);
        expect(located).toEqual({folderName: "Stats", fileName: "brier.py"});
    });

    it("keeps NESTED relative paths with forward slashes", () => {
        // A nested file.
        const located = locateScriptPath("/workspace/python_scripts/Stats/deep/nested/file.py", ROOT);
        // The fileName carries the whole relative path.
        expect(located).toEqual({folderName: "Stats", fileName: "deep/nested/file.py"});
    });

    it("rejects escapes, roots and foreign prefixes", () => {
        // Outside the root.
        expect(locateScriptPath("/workspace/other/x.py", ROOT)).toBeNull();
        // A traversal attempt.
        expect(locateScriptPath("/workspace/python_scripts/../evil.py", ROOT)).toBeNull();
        // The root itself.
        expect(locateScriptPath("/workspace/python_scripts", ROOT)).toBeNull();
        // A folder (no file segment).
        expect(locateScriptPath("/workspace/python_scripts/Stats", ROOT)).toBeNull();
    });
});

describe("mapHover", () => {
    it("extracts the fenced signature as title and the docstring as body", () => {
        // Pyright's MarkupContent shape.
        const raw = {
            contents: {
                kind: "markdown",
                value: "```python\n(def) brier(y_true: list[float], y_pred: list[float]) -> float\n```\n\n---\n\nCompute the Brier score.",
            },
        };
        // Map it.
        const mapped = mapHover(raw);
        // The title is the signature's first line.
        expect(mapped!.title).toBe("(def) brier(y_true: list[float], y_pred: list[float]) -> float");
        // The body is the text after the --- rule.
        expect(mapped!.body).toBe("Compute the Brier score.");
    });

    it("handles MarkedString and MarkedString[] shapes", () => {
        // A bare string.
        expect(mapHover({contents: "plain docstring"})).toEqual({title: "plain docstring", body: undefined});
        // An array of parts.
        const arr = mapHover({contents: [{language: "python", value: "def foo(x)"}, "the docstring"]});
        // The code block won as the title.
        expect(arr!.title).toBe("def foo(x)");
        // The string part became the body.
        expect(arr!.body).toBe("the docstring");
    });

    it("returns null for empty or malformed hovers", () => {
        // Null result.
        expect(mapHover(null)).toBeNull();
        // No contents.
        expect(mapHover({})).toBeNull();
        // Blank contents.
        expect(mapHover({contents: {kind: "markdown", value: "   "}})).toBeNull();
        // A fence with nothing in it.
        expect(mapHover({contents: {kind: "markdown", value: "```python\n\n```"}})).toBeNull();
    });
});

describe("mapDefinition", () => {
    it("maps single Location results to in-project targets", () => {
        // One location.
        const raw = {
            uri: "file:///workspace/python_scripts/Stats/brier.py",
            range: {start: {line: 3, character: 4}, end: {line: 3, character: 9}}
        };
        // Map it.
        const mapped = mapDefinition(raw, ROOT, slugify);
        // One target, 1-based.
        expect(mapped.targets).toEqual([
            {
                folderName: "Stats",
                fileName: "brier.py",
                folderSlug: slugify("Stats"),
                fileSlug: slugify("brier.py"),
                line: 4,
                col: 5
            },
        ]);
        // Nothing external.
        expect(mapped.externalCount).toBe(0);
    });

    it("prefers LocationLink targetUri/targetRange when present", () => {
        // A LocationLink.
        const raw = {
            originUri: "file:///workspace/python_scripts/A/x.py",
            targetUri: "file:///workspace/python_scripts/B/y.py",
            targetRange: {start: {line: 0, character: 0}}
        };
        // Map it.
        const mapped = mapDefinition(raw, ROOT, slugify);
        // The TARGET won.
        expect(mapped.targets[0]!.fileName).toBe("y.py");
    });

    it("counts stdlib / site-packages locations as external", () => {
        // An in-project + an external location.
        const raw = [
            {uri: "file:///workspace/python_scripts/Stats/brier.py", range: {start: {line: 0}}},
            {uri: "file:///usr/lib/python3.12/site-packages/numpy/__init__.py", range: {start: {line: 100}}},
            {uri: "untitled:Untitled-1"},
        ];
        // Map.
        const mapped = mapDefinition(raw, ROOT, slugify);
        // One navigable target.
        expect(mapped.targets.length).toBe(1);
        // Two external (site-packages + untitled).
        expect(mapped.externalCount).toBe(2);
    });
});

describe("mapReferenceLocations", () => {
    it("keeps in-project rows and drops external ones", () => {
        // Mixed locations.
        const raw = [
            {uri: "file:///workspace/python_scripts/Stats/brier.py", range: {start: {line: 0, character: 0}}},
            {uri: "file:///workspace/python_scripts/Utils/helpers.py", range: {start: {line: 9, character: 4}}},
            {uri: "file:///usr/lib/python3.12/json/__init__.py", range: {start: {line: 1}}},
        ];
        // Map.
        const rows = mapReferenceLocations(raw, ROOT, slugify);
        // Two in-project rows, 1-based positions.
        expect(rows.map((r) => r.fileName)).toEqual(["brier.py", "helpers.py"]);
        expect(rows[1]!.line).toBe(10);
        expect(rows[1]!.col).toBe(5);
    });
});

describe("severityFromLsp + mapDiagnostics", () => {
    it("buckets LSP severities", () => {
        // 1 → error.
        expect(severityFromLsp(1)).toBe("error");
        // 2 → warning.
        expect(severityFromLsp(2)).toBe("warning");
        // 3 → info.
        expect(severityFromLsp(3)).toBe("info");
        // 4 (hint) + absent → info.
        expect(severityFromLsp(4)).toBe("info");
        expect(severityFromLsp(undefined)).toBe("info");
    });

    it("maps diagnostics with the code prefix and 1-based positions", () => {
        // Two raw diagnostics.
        const raw = [
            {
                range: {start: {line: 0, character: 0}},
                severity: 1,
                code: "reportGeneralTypeIssues",
                message: "incompatible type"
            },
            {range: {start: {line: 4, character: 2}}, severity: 2, message: "optional member access"},
            {range: {start: {line: 0}}, severity: 1, code: 42, message: "numeric code"},
            {range: {start: {line: 0}}, severity: 1, message: ""},
        ];
        // Map.
        const mapped = mapDiagnostics(raw);
        // Three rows (the blank message was dropped).
        expect(mapped.length).toBe(3);
        // The error with the rule prefix.
        expect(mapped[0]).toEqual({
            line: 1,
            col: 1,
            severity: "error",
            message: "reportGeneralTypeIssues · incompatible type"
        });
        // The warning without a code.
        expect(mapped[1]).toEqual({line: 5, col: 3, severity: "warning", message: "optional member access"});
        // A numeric code is stringified.
        expect(mapped[2]!.message).toBe("42 · numeric code");
    });
});

describe("mapPrepareRename + mapRenameEdits", () => {
    it("maps the placeholder and the 1-based extent", () => {
        // A prepareRename result.
        const raw = {
            range: {start: {line: 2, character: 4}, end: {line: 2, character: 15}},
            placeholder: "mock_symbol"
        };
        // Map.
        expect(mapPrepareRename(raw)).toEqual({placeholder: "mock_symbol", line: 3, col: 5, endCol: 16});
        // A null result is not renameable.
        expect(mapPrepareRename(null)).toBeNull();
        // No placeholder → not renameable.
        expect(mapPrepareRename({range: {start: {line: 0}}})).toBeNull();
    });

    it("maps a WorkspaceEdit into per-file exact-edit rows", async () => {
        // A two-file workspace edit.
        const raw = {
            changes: {
                "file:///workspace/python_scripts/Stats/brier.py": [
                    {range: {start: {line: 2, character: 4}, end: {line: 2, character: 15}}, newText: "renamed"},
                    {range: {start: {line: 8, character: 0}, end: {line: 8, character: 11}}, newText: "renamed"},
                ],
                "file:///workspace/python_scripts/Utils/helpers.py": [
                    {range: {start: {line: 1, character: 7}, end: {line: 1, character: 18}}, newText: "renamed"},
                ],
                // An external file is skipped entirely.
                "file:///usr/lib/python3.12/site-packages/numpy/__init__.py": [
                    {range: {start: {line: 0, character: 0}, end: {line: 0, character: 4}}, newText: "renamed"},
                ],
            },
        };
        // Snippets from a static map.
        const snippets = new Map([
            ["Stats/brier.py:3", "def mock_symbol():"],
            ["Stats/brier.py:9", "    mock_symbol()"],
            ["Utils/helpers.py:2", "  from stats import mock_symbol"],
        ]);
        // The snippet lookup.
        const snippetAt = (folder: string, file: string, line: number) => snippets.get(`${folder}/${file}:${line}`) ?? "";
        // Map with the caret on brier.py line 3 (the def site).
        const mapped = await mapRenameEdits(raw, ROOT, slugify, {fileName: "brier.py", line: 3}, snippetAt);
        // Two in-project files.
        expect(mapped!.files.map((f) => f.fileName).sort()).toEqual(["brier.py", "helpers.py"]);
        // Total occurrences across files.
        expect(mapped!.totalOccurrences).toBe(3);
        // The brier.py group.
        const brier = mapped!.files.find((f) => f.fileName === "brier.py")!;
        // Two rows with exact extents.
        expect(brier.occurrences).toEqual([
            {line: 3, col: 5, endCol: 16, snippet: "def mock_symbol():", defSite: true},
            {line: 9, col: 1, endCol: 12, snippet: "    mock_symbol()", defSite: false},
        ]);
        // Slugs are precomputed for the dialog.
        expect(brier.folderSlug).toBe(slugify("Stats"));
        expect(brier.fileSlug).toBe(slugify("brier.py"));
    });

    it("returns null for empty or external-only edits", async () => {
        // No changes.
        expect(await mapRenameEdits({changes: {}}, ROOT, slugify, {fileName: "x.py", line: 1}, () => "")).toBeNull();
        // Only external files.
        expect(
            await mapRenameEdits(
                {changes: {"file:///usr/lib/x.py": [{range: {start: {line: 0}}, newText: "y"}]}},
                ROOT,
                slugify,
                {fileName: "x.py", line: 1},
                () => ""
            )
        ).toBeNull();
    });
});

describe("applyExactRenames", () => {
    // A small document for the edit tests.
    const DOC = ["def mock_symbol():", "    return mock_symbol(1)", "", "x = mock_symbol"].join("\n");

    it("applies a single exact edit", () => {
        // Rename the def's identifier (line 1, cols 5-16).
        const out = applyExactRenames(DOC, [{line: 1, col: 5, endCol: 16, newText: "renamed"}]);
        // The def line changed, nothing else.
        expect(out).toBe(["def renamed():", "    return mock_symbol(1)", "", "x = mock_symbol"].join("\n"));
    });

    it("applies multiple edits across lines bottom-up", () => {
        // Rename all three occurrences.
        const out = applyExactRenames(DOC, [
            {line: 1, col: 5, endCol: 16, newText: "renamed"},
            {line: 2, col: 12, endCol: 23, newText: "renamed"},
            {line: 4, col: 5, endCol: 16, newText: "renamed"},
        ]);
        // Every occurrence replaced.
        expect(out).toBe(["def renamed():", "    return renamed(1)", "", "x = renamed"].join("\n"));
    });

    it("applies multiple edits on the SAME line right-to-left", () => {
        // A line with two adjacent identifiers.
        const doc = "a = mock_symbol + mock_symbol";
        // Both edits on line 1.
        const out = applyExactRenames(doc, [
            {line: 1, col: 5, endCol: 16, newText: "r1"},
            {line: 1, col: 19, endCol: 30, newText: "r2"},
        ]);
        // Both replaced.
        expect(out).toBe("a = r1 + r2");
    });

    it("REJECTS overlapping edits (all-or-nothing)", () => {
        // Two edits sharing a character range.
        const out = applyExactRenames("abc def", [
            {line: 1, col: 1, endCol: 4, newText: "X"},
            {line: 1, col: 3, endCol: 7, newText: "Y"},
        ]);
        // Rejected, not partially applied.
        expect(out).toBeNull();
    });

    it("REJECTS out-of-range edits", () => {
        // A line beyond the document.
        expect(applyExactRenames("abc", [{line: 9, col: 1, endCol: 2, newText: "X"}])).toBeNull();
        // Columns beyond the line.
        expect(applyExactRenames("abc", [{line: 1, col: 2, endCol: 99, newText: "X"}])).toBeNull();
        // A reversed range.
        expect(applyExactRenames("abc", [{line: 1, col: 3, endCol: 2, newText: "X"}])).toBeNull();
    });

    it("returns the identity for an empty edit set", () => {
        // No edits, same content back.
        expect(applyExactRenames(DOC, [])).toBe(DOC);
    });
});
