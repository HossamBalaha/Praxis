/**
 * deep-undo.ts — the pacing decision for the FileViewer editor's
 * DEEP UNDO snapshots. The editor already snapshots
 * PROGRAMMATIC rewrites (Auto-format / Auto-indent / replace-all)
 * onto its fmt-undo stack; deep undo additionally snapshots the
 * buffer every ~30 user keystrokes and on blur, into the SAME capped
 * ring, so Ctrl+Z can walk back through long typing sessions — not
 * just formatter jumps.
 *
 * Only the pure decision lives here (unit-tested); the keystroke
 * counter itself is a ref in file-viewer.tsx because it must reset
 * exactly when a snapshot is taken.
 */

/** Snapshot the buffer after every N counted keystrokes (~30). */
export const TYPING_SNAPSHOT_EVERY_KEYSTROKES = 30;

/**
 * Should the Nth keystroke trigger a buffer snapshot? True exactly on
 * every `every`-th keystroke (30 / 60 / 90 …); 0 and negatives never
 * fire. The caller resets its counter on a true return, so the same
 * function also works with an ever-increasing count.
 */
export function shouldSnapshotTyping(
    keystrokes: number,
    every: number = TYPING_SNAPSHOT_EVERY_KEYSTROKES
): boolean {
    return every > 0 && keystrokes > 0 && keystrokes % every === 0;
}
