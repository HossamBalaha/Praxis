/**
 * completion-popup.test.ts — unit tests for the popup-side pure
 * helpers that live in src/lib/completion-provider.ts (the popup
 * itself is UI in file-viewer's edit-mode textarea; these cover the
 * TRIGGER decision + the INSERTION slicing + the candidate cap the
 * popup passes to matchCompletions).
 *
 * The matcher's own ranking/dedupe/limit behavior is covered by
 * completion-provider.test.ts — only the popup-specific seams are
 * duplicated here.
 */
import {describe, expect, it} from "vitest";
import {completionSuffix, keywordsForKind, matchCompletions, shouldOfferCompletion,} from "@/lib/completion-provider";

describe("shouldOfferCompletion", () => {
    it("offers for a 1+ char identifier prefix in an editable surface", () => {
        expect(shouldOfferCompletion("c", {composing: false, editMode: true})).toBe(true);
        expect(shouldOfferCompletion("con", {composing: false, editMode: true})).toBe(true);
    });

    it("never offers mid-IME-composition or outside edit mode", () => {
        expect(shouldOfferCompletion("con", {composing: true, editMode: true})).toBe(false);
        expect(shouldOfferCompletion("con", {composing: false, editMode: false})).toBe(false);
        expect(shouldOfferCompletion("con", {composing: true, editMode: false})).toBe(false);
    });

    it("requires a non-empty prefix", () => {
        expect(shouldOfferCompletion("", {composing: false, editMode: true})).toBe(false);
    });
});

describe("completionSuffix", () => {
    it("returns the chars after the typed prefix (exact case)", () => {
        expect(completionSuffix("console", "con")).toBe("sole");
        expect(completionSuffix("align-items", "align")).toBe("-items");
    });

    it("matches the prefix case-insensitively", () => {
        expect(completionSuffix("Console", "cON")).toBe("sole");
    });

    it("returns the whole label when the prefix is empty", () => {
        expect(completionSuffix("console", "")).toBe("console");
    });

    it("non-prefix candidates (the contains-tier) insert the full label", () => {
        // "igur" is only a CONTAINS match of "configure" — there is no
        // suffix relationship, so the popup documents appending the word.
        expect(completionSuffix("configure", "igur")).toBe("configure");
    });

    it("never slices negatively when the prefix outruns the label", () => {
        expect(completionSuffix("con", "console")).toBe("con");
        expect(completionSuffix("", "con")).toBe("");
    });
});

describe("popup candidate cap", () => {
    it("caps the popup at ~12 items (the popup's own limit)", () => {
        const words = Array.from({length: 30}, (_, i) => `conso${i}`);
        const out = matchCompletions("conso", words, keywordsForKind("javascript"), 12);
        expect(out).toHaveLength(12);
    });

    it("keyword + document sources both survive the cap", () => {
        const out = matchCompletions("con", ["conect"], keywordsForKind("javascript"), 12);
        expect(out.map((c) => c.label)).toContain("conect");
        expect(out.map((c) => c.label)).toContain("const");
    });
});
