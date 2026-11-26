/**
 * tab-filter.test.ts — unit tests for src/lib/tab-filter.ts.
 *
 * Covered: the fuzzy subsequence scorer (match / no-match / consecutive
 * + boundary bonuses), the VS Code initial-highlight semantics of
 * initialSwitcherIndex (entry AFTER the active tab in MRU order,
 * wrapping), and the wrap/clamp index helpers the overlay's arrow/Tab
 * navigation uses.
 */
import {describe, expect, it} from "vitest";
import {clampIndex, fuzzyMatch, initialSwitcherIndex, wrapIndex} from "@/lib/tab-filter";

describe("fuzzyMatch", () => {
    it("matches everything with score 0 on an empty query", () => {
        expect(fuzzyMatch("", "anything.py")).toBe(0);
    });

    it("matches ordered subsequences case-insensitively", () => {
        expect(fuzzyMatch("mp", "Main.PY")).not.toBeNull();
        expect(fuzzyMatch("abc", "xxaxxbxc")).not.toBeNull();
    });

    it("rejects non-subsequences", () => {
        expect(fuzzyMatch("xyz", "main.py")).toBeNull();
        expect(fuzzyMatch("pm", "main.py")).toBeNull(); // p comes after m only
    });

    it("rewards consecutive hits over scattered ones", () => {
        expect(fuzzyMatch("ma", "main.py") ?? -1).toBeGreaterThan(
            fuzzyMatch("mi", "main.py") ?? -1
        );
    });

    it("rewards word-boundary starts", () => {
        // "pc" hits at p(0)+c(7, after '.') vs "pr" hitting p(0)+r(2 mid-word)
        expect(fuzzyMatch("pc", "praxis_console.py") ?? -1).toBeGreaterThan(
            fuzzyMatch("pr", "praxis_console.py") ?? -1
        );
    });

    it("scores identical matches consistently", () => {
        expect(fuzzyMatch("demo", "demo.py")).toBe(fuzzyMatch("demo", "demo.py"));
    });
});

describe("initialSwitcherIndex", () => {
    it("preselects the entry after the active tab (wrapping)", () => {
        expect(initialSwitcherIndex(["a", "b", "c"], "a")).toBe(1);
        expect(initialSwitcherIndex(["a", "b", "c"], "b")).toBe(2);
        expect(initialSwitcherIndex(["a", "b", "c"], "c")).toBe(0);
    });

    it("falls back to the first entry without an active id", () => {
        expect(initialSwitcherIndex(["a", "b", "c"], null)).toBe(0);
        expect(initialSwitcherIndex(["a", "b", "c"], "zzz")).toBe(0);
    });

    it("returns 0 for single-entry (or empty) lists", () => {
        expect(initialSwitcherIndex(["only"], "only")).toBe(0);
        expect(initialSwitcherIndex([], null)).toBe(0);
    });
});

describe("wrapIndex / clampIndex", () => {
    it("wraps in both directions", () => {
        expect(wrapIndex(3, 3)).toBe(0);
        expect(wrapIndex(-1, 3)).toBe(2);
        expect(wrapIndex(5, 3)).toBe(2);
    });
    it("answers -1 for empty lists", () => {
        expect(wrapIndex(0, 0)).toBe(-1);
        expect(clampIndex(0, 0)).toBe(-1);
    });
    it("clamps into range", () => {
        expect(clampIndex(-4, 3)).toBe(0);
        expect(clampIndex(9, 3)).toBe(2);
    });
});
