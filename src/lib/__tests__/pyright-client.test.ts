/**
 * pyright-client.test.ts — unit tests for src/lib/pyright-client.ts
 * (the browser-side fetch + validation layer for /api/lsp/*).
 *
 * Proves the wire contract's two design rules with a stubbed fetch:
 *   - NEVER throws: network failures, non-OK responses and malformed
 *     payloads all collapse into the caller's fallback value
 *     (false / null / [] — never a thrown rejection).
 *   - ALWAYS validates shapes: corrupt rows are dropped, not trusted;
 *     "unavailable" (available:false) stays distinguishable from an
 *     honest empty answer (available:true, empty list).
 * Plus the pure mergeLspDiagnostics squiggle contract: ruff rows
 * first, pyright type rows appended, duplicates collapsed by
 * (line, message).
 */
import {afterEach, describe, expect, it, vi} from "vitest";
import {
    fetchLspDefinition,
    fetchLspDiagnostics,
    fetchLspHover,
    fetchLspRenameApply,
    fetchLspRenamePrepare,
    type LspDiagnosticRow,
    mergeLspDiagnostics,
    postLspDocument,
} from "@/lib/pyright-client";

/** The feature-args fixture every POST-based test shares. */
const ARGS = {folder: "proj", file: "app.py", content: "x = 1\n", line: 1, col: 1};

/** Stub global fetch to answer `body` for the next call (JSON-wrapped). */
function stubFetchBody(body: unknown, ok = true): void {
    // A resolved Response stand-in with just the fields the client reads.
    vi.stubGlobal("fetch", vi.fn(async () => ({ok, json: async () => body})));
}

/** Stub global fetch to REJECT (the network-failure path). */
function stubFetchFailure(): void {
    // A fetch that never answers.
    vi.stubGlobal("fetch", vi.fn(async () => {
        // Simulate the network layer dying mid-request.
        throw new Error("network down");
    }));
}

// Restore the real globals between tests (isolation).
afterEach(() => {
    // Drop every stub.
    vi.unstubAllGlobals();
});

describe("mergeLspDiagnostics (the squiggle merge)", () => {
    // A ruff-style row (the live-lint base).
    const ruffRow: LspDiagnosticRow = {line: 3, severity: "warning", message: "Unused import os"};
    // A pyright-style row (a type error).
    const typeRow: LspDiagnosticRow = {line: 5, col: 4, severity: "error", message: "Cannot assign to a method"};

    it("keeps undefined semantics when neither side has rows", () => {
        // No base, no LSP rows — "no lint data at all".
        expect(mergeLspDiagnostics(undefined, [])).toBeUndefined();
    });

    it("returns the base unchanged when the sidecar added nothing", () => {
        // Base only — the merged list IS the base (still undefined-aware).
        expect(mergeLspDiagnostics([ruffRow], [])).toEqual([ruffRow]);
        // An undefined base stays an empty list (never undefined once rows exist).
        expect(mergeLspDiagnostics(undefined, [])).toBeUndefined();
    });

    it("appends pyright rows after the ruff rows (style first, types second)", () => {
        // The merge.
        const merged = mergeLspDiagnostics([ruffRow], [typeRow]);
        // Base order preserved, LSP rows appended.
        expect(merged).toEqual([ruffRow, typeRow]);
    });

    it("collapses duplicate findings by (line, message) regardless of severity", () => {
        // Both tools flag the same undefined name on the same line.
        const ruffFlag: LspDiagnosticRow = {line: 7, severity: "warning", message: "Undefined name: foo"};
        const pyrightFlag: LspDiagnosticRow = {line: 7, col: 1, severity: "error", message: "Undefined name: foo"};
        // The merge — the ruff row (base) wins, the pyright twin is dropped.
        expect(mergeLspDiagnostics([ruffFlag], [pyrightFlag, typeRow])).toEqual([ruffFlag, typeRow]);
    });

    it("synthesizes the list from LSP rows alone when no base exists", () => {
        // No ruff data, real type errors.
        expect(mergeLspDiagnostics(undefined, [typeRow])).toEqual([typeRow]);
    });
});

describe("postLspDocument (the sync availability)", () => {
    it("resolves true when the sidecar answered", async () => {
        // The wire answer.
        stubFetchBody({ok: true, available: true});
        // The sync.
        expect(await postLspDocument({folder: "proj", file: "app.py", content: "x = 1"})).toBe(true);
    });

    it("resolves false on an explicit unavailable answer", async () => {
        // Pyright not installed.
        stubFetchBody({ok: true, available: false});
        // The fallback answer.
        expect(await postLspDocument({folder: "proj", file: "app.py", content: "x = 1"})).toBe(false);
    });

    it("resolves false on non-OK responses and network failures (never throws)", async () => {
        // A rate-limited proxy.
        stubFetchBody({available: true}, false);
        // The fallback answer.
        expect(await postLspDocument({folder: "proj", file: "app.py", content: "x = 1"})).toBe(false);
        // A dead network.
        stubFetchFailure();
        // Still the fallback answer, not a rejection.
        await expect(postLspDocument({folder: "proj", file: "app.py", content: "x = 1"})).resolves.toBe(false);
    });
});

describe("fetchLspHover (the typed card)", () => {
    it("returns the card for a valid answer", async () => {
        // The wire answer.
        stubFetchBody({available: true, hover: {title: "def compute(x: int) -> int", body: "Adds two numbers."}});
        // The card.
        expect(await fetchLspHover(ARGS)).toEqual({title: "def compute(x: int) -> int", body: "Adds two numbers."});
    });

    it("treats a blank body as undefined but keeps the card", async () => {
        // Pyright knows the type but has no docstring.
        stubFetchBody({available: true, hover: {title: "x: int", body: "   "}});
        // The body collapses to undefined.
        expect(await fetchLspHover(ARGS)).toEqual({title: "x: int", body: undefined});
    });

    it("returns null for unavailable answers, missing hovers, and malformed titles", async () => {
        // Unavailable.
        stubFetchBody({available: false});
        // Null.
        expect(await fetchLspHover(ARGS)).toBeNull();
        // Nothing known at this position (a legal answer).
        stubFetchBody({available: true, hover: null});
        // Null.
        expect(await fetchLspHover(ARGS)).toBeNull();
        // A blank title can never render.
        stubFetchBody({available: true, hover: {title: "   ", body: "docs"}});
        // Null.
        expect(await fetchLspHover(ARGS)).toBeNull();
    });

    it("never throws on network failure", async () => {
        // The dead network.
        stubFetchFailure();
        // Null, not a rejection.
        await expect(fetchLspHover(ARGS)).resolves.toBeNull();
    });
});

describe("fetchLspDefinition (F12)", () => {
    it("maps validated targets and drops corrupt rows", async () => {
        // One valid target, one with a bad line, one missing its file slug.
        stubFetchBody({
            available: true,
            externalCount: 2,
            targets: [
                {folderName: "proj", fileName: "util.py", folderSlug: "proj", fileSlug: "util", line: 12, col: 5},
                {folderName: "proj", fileName: "util.py", folderSlug: "proj", fileSlug: "util", line: 0, col: 5},
                {folderName: "proj", fileName: "util.py", folderSlug: "proj", line: 9, col: 5},
                "not-an-object",
            ],
        });
        // The answer.
        const r = await fetchLspDefinition(ARGS);
        // Available with exactly the one valid target.
        expect(r.available).toBe(true);
        expect(r.targets).toEqual([{
            folderName: "proj",
            fileName: "util.py",
            folderSlug: "proj",
            fileSlug: "util",
            line: 12,
            col: 5
        }]);
        // The external count passed through.
        expect(r.externalCount).toBe(2);
    });

    it("reports unavailable (available:false) without inventing targets", async () => {
        // The sidecar never answered.
        stubFetchBody({available: false});
        // The unavailable shape.
        expect(await fetchLspDefinition(ARGS)).toEqual({available: false, targets: [], externalCount: 0});
        // A network failure collapses to the same shape.
        stubFetchFailure();
        // Still unavailable, never a throw.
        await expect(fetchLspDefinition(ARGS)).resolves.toEqual({available: false, targets: [], externalCount: 0});
    });
});

describe("fetchLspDiagnostics (the poll)", () => {
    it("validates rows, buckets severities, and sanitizes columns", async () => {
        // A batch with every kind of row.
        stubFetchBody({
            diagnostics: [
                {line: 2, col: 5, severity: "error", message: "Type error"},
                {line: 4, severity: "bogus", message: "Bucketed to info"},
                {line: 6, col: -1, severity: "warning", message: "Bad col dropped"},
                {line: 0, severity: "error", message: "Bad line dropped"},
                {line: 8, severity: "warning, extra"},
            ],
            version: 3,
        });
        // The pull.
        const r = await fetchLspDiagnostics("proj", "app.py");
        // The validated rows.
        expect(r!.diagnostics).toEqual([
            {line: 2, col: 5, severity: "error", message: "Type error"},
            {line: 4, severity: "info", message: "Bucketed to info"},
            {line: 6, severity: "warning", message: "Bad col dropped"},
        ]);
        // The version passed through.
        expect(r!.version).toBe(3);
    });

    it("returns null on failure so callers keep the previous rows", async () => {
        // A non-OK response.
        stubFetchBody({diagnostics: []}, false);
        // Null.
        expect(await fetchLspDiagnostics("proj", "app.py")).toBeNull();
        // A dead network.
        stubFetchFailure();
        // Null, not a rejection.
        await expect(fetchLspDiagnostics("proj", "app.py")).resolves.toBeNull();
    });
});

describe("fetchLspRenamePrepare (the F2 probe)", () => {
    it("returns the supported probe with its extent", async () => {
        // The wire answer.
        stubFetchBody({available: true, supported: true, placeholder: "total", line: 3, col: 5, endCol: 10});
        // The probe.
        expect(await fetchLspRenamePrepare(ARGS)).toEqual({
            supported: true,
            placeholder: "total",
            line: 3,
            col: 5,
            endCol: 10
        });
    });

    it("collapses unsupported / placeholder-less / failed answers to supported:false or null", async () => {
        // Unsupported at this position (a keyword, say).
        stubFetchBody({available: true, supported: false});
        // The unsupported probe.
        expect(await fetchLspRenamePrepare(ARGS)).toEqual({supported: false});
        // Supported but the placeholder is missing — treat as unsupported.
        stubFetchBody({available: true, supported: true});
        // The unsupported probe.
        expect(await fetchLspRenamePrepare(ARGS)).toEqual({supported: false});
        // The sidecar never answered.
        stubFetchBody({available: false});
        // Null (the caller falls back to the text-rename path).
        expect(await fetchLspRenamePrepare(ARGS)).toBeNull();
    });
});

describe("fetchLspRenameApply (the F2 preview)", () => {
    it("builds the preview from validated files and occurrences", async () => {
        // One file with two occurrences (one flagged as the def site).
        stubFetchBody({
            available: true,
            supported: true,
            totalOccurrences: 2,
            files: [
                {
                    folder: "proj",
                    folderSlug: "proj",
                    file: "app.py",
                    fileSlug: "app",
                    path: "proj/app.py",
                    isPython: true,
                    occurrences: [
                        {line: 1, col: 5, endCol: 10, snippet: "def total():", defSite: true},
                        {line: 8, col: 3, endCol: 8, snippet: "return total()", defSite: false},
                    ],
                },
            ],
        });
        // The preview.
        const r = await fetchLspRenameApply(ARGS, "sum_all");
        // The renamed symbol.
        expect(r!.name).toBe("sum_all");
        // One file, two occurrences, the def site flagged.
        expect(r!.files).toHaveLength(1);
        expect(r!.files[0]!.occurrences).toEqual([
            {line: 1, col: 5, endCol: 10, snippet: "def total():", context: "code", defSite: true},
            {line: 8, col: 3, endCol: 8, snippet: "return total()", context: "code", defSite: false},
        ]);
        // The total from the wire.
        expect(r!.totalOccurrences).toBe(2);
    });

    it("drops corrupt occurrences and files with no survivors, then yields null", async () => {
        // A file whose only occurrence has endCol < col, plus a slug-less file.
        stubFetchBody({
            available: true,
            supported: true,
            files: [
                {
                    folder: "proj",
                    folderSlug: "proj",
                    file: "app.py",
                    fileSlug: "app",
                    path: "proj/app.py",
                    occurrences: [{line: 1, col: 9, endCol: 5, snippet: "backwards", defSite: false}],
                },
                {
                    folder: "proj",
                    file: "other.py",
                    path: "proj/other.py",
                    occurrences: [{line: 2, col: 1, endCol: 4, snippet: "ok", defSite: false}]
                },
            ],
        });
        // Nothing survived validation — null (the caller falls back).
        expect(await fetchLspRenameApply(ARGS, "sum_all")).toBeNull();
        // An unavailable answer — also null.
        stubFetchBody({available: false});
        // Null.
        expect(await fetchLspRenameApply(ARGS, "sum_all")).toBeNull();
    });
});
