/**
 * multi-file-undo.test.ts — unit tests for src/lib/multi-file-undo.ts.
 *
 * The stack is module-level state, so every test clears it first —
 * that also documents the ONE-keystroke-one-group contract the hotkey
 * glue (multi-file-undo-hotkey.ts, DOM-bound, not tested here) relies
 * on: push N groups → N Ctrl+Z pops in LIFO order → depth back to 0.
 */
import {beforeEach, describe, expect, it} from "vitest";
import {
    clearMultiFileUndoGroups,
    multiFileUndoDepth,
    peekMultiFileUndoGroup,
    popMultiFileUndoGroup,
    pushMultiFileUndoGroup,
} from "@/lib/multi-file-undo";

beforeEach(() => {
    clearMultiFileUndoGroups();
});

describe("multi-file-undo stack", () => {
    it("pushes and peeks without consuming", () => {
        expect(multiFileUndoDepth()).toBe(0);
        expect(peekMultiFileUndoGroup()).toBeNull();
        const g = pushMultiFileUndoGroup({
            label: "Rename \"a\" → \"b\"",
            entries: [{folderSlug: "f", fileSlug: "s", fileName: "a.py", preContent: "x = 1"}],
        });
        expect(multiFileUndoDepth()).toBe(1);
        expect(peekMultiFileUndoGroup()).toBe(g);
        expect(peekMultiFileUndoGroup()?.label).toBe("Rename \"a\" → \"b\"");
        expect(multiFileUndoDepth()).toBe(1); // peek did not consume
    });

    it("assigns deterministic ids + timestamps when omitted", () => {
        const g1 = pushMultiFileUndoGroup({label: "one", entries: []});
        const g2 = pushMultiFileUndoGroup({label: "two", entries: []});
        expect(g1.id).not.toBe(g2.id);
        expect(g1.id).toMatch(/^mfu-\d+$/);
        expect(typeof g1.createdAt).toBe("number");
    });

    it("pops in LIFO order — one Ctrl+Z per group", () => {
        pushMultiFileUndoGroup({label: "first", entries: []});
        pushMultiFileUndoGroup({label: "second", entries: []});
        pushMultiFileUndoGroup({label: "third", entries: []});
        expect(multiFileUndoDepth()).toBe(3);
        expect(popMultiFileUndoGroup()?.label).toBe("third");
        expect(popMultiFileUndoGroup()?.label).toBe("second");
        expect(popMultiFileUndoGroup()?.label).toBe("first");
        expect(popMultiFileUndoGroup()).toBeNull();
        expect(multiFileUndoDepth()).toBe(0);
    });

    it("preserves the caller's id and entries untouched", () => {
        const entries = [
            {folderSlug: "A", fileSlug: "S", fileName: "sub/dir/a.py", preContent: "before"},
            {folderSlug: "B", fileSlug: "T", fileName: "b.md", preContent: "before2"},
        ];
        const g = pushMultiFileUndoGroup({label: "batch", entries});
        expect(g.entries).toBe(entries); // same objects — no cloning surprises
        expect(g.id).toMatch(/^mfu-/); // id was assigned
        const popped = popMultiFileUndoGroup();
        expect(popped?.entries[0].preContent).toBe("before");
        expect(popped?.entries[1].fileName).toBe("b.md");
    });

    it("caps the stack at 20 groups (oldest drops first)", () => {
        for (let i = 0; i < 25; i++) {
            pushMultiFileUndoGroup({label: `g${i}`, entries: []});
        }
        expect(multiFileUndoDepth()).toBe(20);
        // Newest is g24; the oldest surviving group is g5.
        expect(peekMultiFileUndoGroup()?.label).toBe("g24");
        let last: string | undefined;
        while (multiFileUndoDepth() > 0) last = popMultiFileUndoGroup()?.label;
        expect(last).toBe("g5");
    });

    it("clear drops everything at once", () => {
        pushMultiFileUndoGroup({label: "a", entries: []});
        pushMultiFileUndoGroup({label: "b", entries: []});
        clearMultiFileUndoGroups();
        expect(multiFileUndoDepth()).toBe(0);
        expect(peekMultiFileUndoGroup()).toBeNull();
    });
});
