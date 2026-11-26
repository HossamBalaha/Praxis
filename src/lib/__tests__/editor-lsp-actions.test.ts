/**
 * editor-lsp-actions.test.ts — unit tests for src/lib/editor-lsp-actions.ts
 * (the LSP-first decision ladder behind F12 / ⇧F12).
 *
 * Proves the ladder's contract:
 *   - no session (pyright unavailable) → the fallback owns the gesture
 *   - no position (no caret / no click cell) → the fallback owns it
 *   - an unavailable / empty sidecar answer → the fallback owns it
 *   - in-project targets → onJump fires with the FIRST target, handled
 *   - external-only targets → onExternal fires, handled (text search
 *     would only surface same-name red herrings)
 *   - references → semantic hits pass through VERBATIM; anything less
 *     returns null so the text-search popup loads its own fetch
 */
import {describe, expect, it, vi} from "vitest";
import {gotoDefinitionViaLsp, referencesViaLsp} from "@/lib/editor-lsp-actions";
import type {LspDefinitionResult} from "@/lib/pyright-client";
import type {ReferenceHit} from "@/lib/peek-references";

/** A definition result factory (one line instead of five per case). */
function defResult(overrides: Partial<LspDefinitionResult> = {}): LspDefinitionResult {
    // The fully-populated default; tests override the interesting fields.
    return {available: true, targets: [], externalCount: 0, ...overrides};
}

/** A reference hit factory. */
function hit(line: number, fileSlug = "app.py"): ReferenceHit {
    // A minimal-but-valid hit row.
    return {folder: "proj", folderSlug: "proj", file: fileSlug, fileSlug, line, snippet: `use at ${line}`};
}

describe("gotoDefinitionViaLsp", () => {
    it("returns false (fallback owns it) with no session or no position", async () => {
        // The jump spy — must NEVER fire in these cases.
        const onJump = vi.fn();
        // No session at all.
        expect(await gotoDefinitionViaLsp(null, {line: 3, col: 5}, {onJump, onExternal: vi.fn()})).toBe(false);
        // A session but no position.
        expect(await gotoDefinitionViaLsp({
            definitionAt: async () => defResult(),
            referencesAt: async () => []
        }, null, {onJump, onExternal: vi.fn()})).toBe(false);
        // A position before the buffer start (line 0 / col 0 are not real spots).
        expect(await gotoDefinitionViaLsp({
            definitionAt: async () => defResult(),
            referencesAt: async () => []
        }, {line: 0, col: 5}, {onJump, onExternal: vi.fn()})).toBe(false);
        expect(await gotoDefinitionViaLsp({
            definitionAt: async () => defResult(),
            referencesAt: async () => []
        }, {line: 3, col: 0}, {onJump, onExternal: vi.fn()})).toBe(false);
        // Nothing jumped.
        expect(onJump).not.toHaveBeenCalled();
    });

    it("returns false when the sidecar is unavailable or answers nothing", async () => {
        // The unavailable answer (pyright not installed / timed out).
        const session = {definitionAt: async () => defResult({available: false}), referencesAt: async () => []};
        // The fallback owns the gesture.
        expect(await gotoDefinitionViaLsp(session, {line: 3, col: 5}, {
            onJump: vi.fn(),
            onExternal: vi.fn()
        })).toBe(false);
        // An available-but-empty answer ALSO falls back (dynamic patterns
        // pyright cannot resolve — the heuristic may still find them).
        const empty = {definitionAt: async () => defResult({available: true}), referencesAt: async () => []};
        expect(await gotoDefinitionViaLsp(empty, {line: 3, col: 5}, {
            onJump: vi.fn(),
            onExternal: vi.fn()
        })).toBe(false);
    });

    it("jumps to the FIRST in-project target and reports the gesture handled", async () => {
        // Two in-project targets (overloads) — the first must win.
        const session = {
            definitionAt: async () =>
                defResult({
                    targets: [
                        {
                            folderName: "proj",
                            fileName: "util.py",
                            folderSlug: "proj",
                            fileSlug: "util",
                            line: 12,
                            col: 5
                        },
                        {
                            folderName: "proj",
                            fileName: "util.py",
                            folderSlug: "proj",
                            fileSlug: "util",
                            line: 40,
                            col: 1
                        },
                    ],
                }),
            referencesAt: async () => [],
        };
        // The jump spy.
        const onJump = vi.fn();
        // The external spy — must not fire.
        const onExternal = vi.fn();
        // The gesture.
        const handled = await gotoDefinitionViaLsp(session, {line: 3, col: 5}, {onJump, onExternal});
        // Fully handled — the caller must NOT run its fallback.
        expect(handled).toBe(true);
        // Exactly one jump, to the first target.
        expect(onJump).toHaveBeenCalledTimes(1);
        expect(onJump).toHaveBeenCalledWith({folderSlug: "proj", fileSlug: "util", line: 12});
        // No external toast.
        expect(onExternal).not.toHaveBeenCalled();
    });

    it("reports external-only definitions as handled (no text-search fallback)", async () => {
        // The definition lives in site-packages — zero in-project targets.
        const session = {definitionAt: async () => defResult({externalCount: 3}), referencesAt: async () => []};
        // The spies.
        const onJump = vi.fn();
        const onExternal = vi.fn();
        // The gesture.
        const handled = await gotoDefinitionViaLsp(session, {line: 3, col: 5}, {onJump, onExternal});
        // Handled — a text search would only find same-name red herrings.
        expect(handled).toBe(true);
        // The external toast carries the count.
        expect(onExternal).toHaveBeenCalledWith(3);
        // No jump happened.
        expect(onJump).not.toHaveBeenCalled();
    });
});

describe("referencesViaLsp", () => {
    it("returns null with no session, no position, or zero hits", async () => {
        // A minimal session whose referencesAt always answers empty.
        const emptySession = {definitionAt: async () => null, referencesAt: async () => []};
        // No session.
        expect(await referencesViaLsp(null, {line: 3, col: 5})).toBeNull();
        // No position.
        expect(await referencesViaLsp({
            definitionAt: async () => null,
            referencesAt: async () => [hit(1)]
        }, null)).toBeNull();
        // An invalid position.
        expect(await referencesViaLsp({definitionAt: async () => null, referencesAt: async () => [hit(1)]}, {
            line: 1,
            col: 0
        })).toBeNull();
        // The sidecar answered with nothing.
        expect(await referencesViaLsp(emptySession, {line: 3, col: 5})).toBeNull();
    });

    it("passes semantic hits through VERBATIM (the popup shows them as-is)", async () => {
        // Three semantic hits across two files.
        const hits = [hit(4), hit(17, "other.py"), hit(30)];
        // The session answering them.
        const session = {definitionAt: async () => null, referencesAt: async () => hits};
        // The gesture.
        const result = await referencesViaLsp(session, {line: 3, col: 5});
        // The same array contents, in the same order.
        expect(result).toEqual(hits);
    });
});
