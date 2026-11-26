/**
 * multi-file-undo.ts — ONE Ctrl+Z for a multi-file refactor.
 *
 * The editor's existing undo stacks (code-viewer's UndoSnapshot ring,
 * file-viewer's fmt-undo ring — the machinery extract function rides)
 * snapshot a SINGLE buffer before a programmatic rewrite so Ctrl+Z
 * pops straight back to the pre-edit text. A project-wide rename
 * rewrites MANY files at once, and the requirement is that ONE Ctrl+Z
 * restores the pre-rename content of EVERY touched file — so the same
 * snapshot-before-programmatic-rewrite idea is lifted to file level:
 * a "group" records the pre-edit content of each file that was about
 * to be written, and the group is popped as a single unit.
 *
 * This module is the PURE stack only (module-level state, zero DOM) so
 * it is unit-testable in the node vitest environment; the DOM side —
 * the capture-phase Ctrl+Z listener that writes the files back
 * through /api/file-write — lives in multi-file-undo-hotkey.ts and is
 * armed only while at least one group is pending (no per-keystroke
 * work when nothing is undoable).
 */

/** One file's pre-edit snapshot. `fileName` is the RELATIVE path
 *  (forward slashes) that /api/file-write accepts as `fileName`. */
export interface MultiFileUndoEntry {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
    /** The file's content BEFORE the group's writes landed. */
    preContent: string;
}

/** A single Ctrl+Z unit: every file one refactor touched. */
export interface MultiFileUndoGroup {
    /** Deterministic id (`mfu-<n>`) — group ids never encode build
     *  metadata, they only need to be unique within the session. */
    id: string;
    /** Human label for the toast/hint ("Rename \"a\" → \"b\""). */
    label: string;
    /** Epoch ms when the group was pushed (display only). */
    createdAt: number;
    entries: MultiFileUndoEntry[];
}

/** Groups are small (a rename touches dozens of files at most) but a
 *  runaway loop must not grow the stack without bound. */
const MAX_UNDO_GROUPS = 20;

/** LIFO stack of pending multi-file undo groups (module state). */
const stack: MultiFileUndoGroup[] = [];
let seq = 0;

/**
 * Push a group onto the undo stack (assigning id/createdAt when the
 * caller didn't). Returns the stored group (with its final id).
 */
export function pushMultiFileUndoGroup(group: Omit<MultiFileUndoGroup, "id" | "createdAt"> & Partial<Pick<MultiFileUndoGroup, "id" | "createdAt">>): MultiFileUndoGroup {
    seq += 1;
    const stored: MultiFileUndoGroup = {
        id: group.id ?? `mfu-${seq}`,
        label: group.label,
        createdAt: group.createdAt ?? Date.now(),
        entries: group.entries,
    };
    stack.push(stored);
    if (stack.length > MAX_UNDO_GROUPS) stack.shift();
    return stored;
}

/** Pop the most recent group (the next Ctrl+Z target), or null. */
export function popMultiFileUndoGroup(): MultiFileUndoGroup | null {
    return stack.pop() ?? null;
}

/** Peek at the most recent group without consuming it. */
export function peekMultiFileUndoGroup(): MultiFileUndoGroup | null {
    return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** How many groups are pending (0 = no multi-file undo available). */
export function multiFileUndoDepth(): number {
    return stack.length;
}

/** Drop every pending group (used by tests + full reset). */
export function clearMultiFileUndoGroups(): void {
    stack.length = 0;
}
