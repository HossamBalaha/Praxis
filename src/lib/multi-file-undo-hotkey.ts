/**
 * multi-file-undo-hotkey.ts — the DOM half of the multi-file undo.
 *
 * While at least one multi-file undo group is pending, a CAPTURE-phase
 * window keydown listener intercepts the next Ctrl+Z / Cmd+Z (before
 * the editor's own textarea handlers — capture beats bubble, and
 * stopImmediatePropagation beats anything else registered on window)
 * and restores EVERY file of the newest group to its recorded
 * pre-refactor content through the same /api/file-write route the
 * apply used. One keystroke, whole project back.
 *
 * Arm/disarm discipline (performance rule: no per-keystroke work when
 * there is nothing to undo):
 *   - armMultiFileUndoHotkey() is idempotent and installs the listener
 *     ONLY once; it is called by the apply flows right after a group is
 *     pushed.
 *   - the listener self-removes the moment the stack runs empty (after
 *     a restore pops the last group), so plain typing sessions never
 *     pay for it.
 *
 * The module touches window/document, so it must only be imported from
 * client components ("use client" files) — matching how the rest of
 * the codebase guards browser-only libs.
 */

import {toast} from "@/hooks/use-toast";
import {
    multiFileUndoDepth,
    type MultiFileUndoGroup,
    peekMultiFileUndoGroup,
    popMultiFileUndoGroup,
} from "@/lib/multi-file-undo";

/** Listener installed flag — arm() must stay idempotent. */
let armed = false;

/** True while a group is being restored (guards double Ctrl+Z). */
let restoring = false;

const onUndoKeydown = (e: KeyboardEvent): void => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (!mod || key !== "z" || e.shiftKey || e.altKey) {
        // Redo chords (Ctrl+Shift+Z / Ctrl+Y) and every other key pass
        // straight through — only a plain undo pops a group.
        return;
    }
    if (multiFileUndoDepth() === 0) {
        // Stack emptied (consumed elsewhere / cleared) — disarm quietly.
        disarmMultiFileUndoHotkey();
        return;
    }
    if (restoring) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    const group = peekMultiFileUndoGroup();
    if (!group) return;
    // Consume the keystroke BEFORE the async work so the browser (and
    // the editor's own undo) cannot race the restore.
    e.preventDefault();
    e.stopImmediatePropagation();
    restoring = true;
    void restoreGroup(group).finally(() => {
        restoring = false;
        if (multiFileUndoDepth() === 0) disarmMultiFileUndoHotkey();
    });
};

/** Install the capture listener (no-op when already armed / SSR). */
export function armMultiFileUndoHotkey(): void {
    if (armed || typeof window === "undefined") return;
    armed = true;
    window.addEventListener("keydown", onUndoKeydown, {capture: true});
}

/** Remove the listener (idempotent; exported for tests + teardown). */
export function disarmMultiFileUndoHotkey(): void {
    if (!armed || typeof window === "undefined") return;
    armed = false;
    window.removeEventListener("keydown", onUndoKeydown, {capture: true} as AddEventListenerOptions);
}

/**
 * Write every entry's preContent back through the same write path the
 * apply used (/api/file-write), pop the group, refresh the project
 * tree, and report the outcome. Returns the write summary.
 */
async function restoreGroup(group: MultiFileUndoGroup): Promise<void> {
    let restored = 0;
    const failed: string[] = [];
    // Sequential writes: a project tree watcher reacts to every save,
    // and firing dozens of writes simultaneously used to stampede the
    // folder cache on large refactors. Order is the group's entry order.
    for (const entry of group.entries) {
        try {
            const res = await fetch("/api/file-write", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: entry.folderSlug,
                    fileName: entry.fileName,
                    content: entry.preContent,
                }),
            });
            if (res.ok) restored++;
            else failed.push(entry.fileName);
        } catch {
            failed.push(entry.fileName);
        }
    }
    // The group counts as consumed even if some writes failed — a
    // partially failed restore stays visible via the toast so the user
    // knows exactly which files to check manually.
    popMultiFileUndoGroup();
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("praxis:multi-file-undo-applied", {
            detail: {label: group.label, restored, failed: [...failed]},
        }));
        // The page already listens for this one — it refreshes the
        // explorer without any new wiring.
        window.dispatchEvent(new CustomEvent("praxis:refresh-folders"));
    }
    toast({
        title: failed.length > 0 ? "Undo finished with errors" : `Undid: ${group.label}`,
        description:
            `Restored ${restored} of ${group.entries.length} file${group.entries.length === 1 ? "" : "s"} to their pre-refactor content.` +
            (failed.length > 0
                ? ` ${failed.length} write${failed.length === 1 ? "" : "s"} failed (${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ", …" : ""}) — check them manually.`
                : ""),
        variant: failed.length > 0 ? "warning" : "success",
    });
}

/**
 * Manually trigger the newest group's restore (the dialogs expose an
 * explicit "Undo" affordance alongside the Ctrl+Z shortcut). Returns
 * false when nothing is pending.
 */
export async function undoLatestMultiFileGroup(): Promise<boolean> {
    const group = peekMultiFileUndoGroup();
    if (!group || restoring) return false;
    restoring = true;
    try {
        await restoreGroup(group);
        return true;
    } finally {
        restoring = false;
        if (multiFileUndoDepth() === 0) disarmMultiFileUndoHotkey();
    }
}

/** Label of the pending group (for the dialogs' "Undo" hint), or null. */
export function pendingMultiFileUndoLabel(): string | null {
    return peekMultiFileUndoGroup()?.label ?? null;
}
