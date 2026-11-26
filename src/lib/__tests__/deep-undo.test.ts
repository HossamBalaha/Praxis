/**
 * deep-undo.test.ts — unit tests for the snapshot pacing decision
 * (src/lib/deep-undo.ts) of the FileViewer editor's deep undo.
 */
import {describe, expect, it} from "vitest";
import {shouldSnapshotTyping, TYPING_SNAPSHOT_EVERY_KEYSTROKES,} from "../deep-undo";

describe("shouldSnapshotTyping", () => {
    it("fires exactly on every 30th keystroke by default", () => {
        expect(shouldSnapshotTyping(0)).toBe(false);
        expect(shouldSnapshotTyping(1)).toBe(false);
        expect(shouldSnapshotTyping(29)).toBe(false);
        expect(shouldSnapshotTyping(30)).toBe(true);
        expect(shouldSnapshotTyping(31)).toBe(false);
        expect(shouldSnapshotTyping(60)).toBe(true);
    });
    it("supports an explicit cadence", () => {
        expect(shouldSnapshotTyping(5, 5)).toBe(true);
        expect(shouldSnapshotTyping(4, 5)).toBe(false);
    });
    it("never fires on non-positive keystrokes or cadences", () => {
        expect(shouldSnapshotTyping(-30)).toBe(false);
        expect(shouldSnapshotTyping(30, 0)).toBe(false);
        expect(shouldSnapshotTyping(30, -5)).toBe(false);
    });
    it("default cadence matches the documented ~30 keystrokes", () => {
        expect(TYPING_SNAPSHOT_EVERY_KEYSTROKES).toBe(30);
    });
});
