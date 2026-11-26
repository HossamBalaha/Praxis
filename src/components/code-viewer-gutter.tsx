"use client";

import * as React from "react";
import {cn} from "@/lib/utils";


/**
 * memoized edit-mode line-number ROWS.
 *
 * The row list is one <div> per line of the buffer — on a 2,000-line
 * file that is 2,000 elements the old inline `editLines.map(...)`
 * reconciled on EVERY keystroke (React walked + diffed them all just to
 * produce an identical DOM). Extracted here behind React.memo with
 * PRIMITIVE props:
 * - `lineCount` — changes only when a line is added/removed;
 * - `caretLine` — changes only when the caret moves BETWEEN lines;
 * - `foldedKey` — a stable string serialization of the folded-line
 * set (the Set's identity churns on every deferred
 * symbol re-parse; the string does not).
 * So while the user types WITHIN a line (the common case), all three
 * props are unchanged, the memo bails, and zero row elements are
 * touched. Line ADDITIONS still re-render the rows — unavoidable, the
 * numbers must stay correct — but that is one render per Enter, not
 * one per character.
 */
export const EditLineGutterRows = React.memo(function EditLineGutterRows({
                                                                             lineCount,
                                                                             caretLine,
                                                                             foldedKey,
                                                                             coverageKey,
                                                                             windowFirst = 1,
                                                                             windowLast = Infinity,
                                                                             rowHeight = 26,
                                                                             relativeTo,
                                                                         }: {
    lineCount: number;
    caretLine: number;
    foldedKey: string;
    coverageKey: string;
    /** Overlay windowing — only rows in [windowFirst, windowLast] mount;
     *   spacers keep the flow height identical so the gutter never
     *   shifts. Infinity (default) renders every row, exactly like
     *   before. */
    windowFirst?: number;
    windowLast?: number;
    rowHeight?: number;
    /** Vim relative/hybrid line numbers — when set, rows render the
     *   DISTANCE to this caret line instead of the absolute number
     *   (the caret line itself stays absolute, hybrid-style). */
    relativeTo?: number;
}) {
    // Parse the fold set once per foldedKey change (small: one entry per
    // hidden line of the currently folded blocks).
    const folded = React.useMemo(() => {
        if (!foldedKey) return null;
        const set = new Set<number>();
        for (const part of foldedKey.split(",")) {
            const n = Number(part);
            if (Number.isFinite(n)) set.add(n);
        }
        return set;
    }, [foldedKey]);
    // Same trick for the coverage set: the KEY is a stable comma-joined
    // string (built once per run result change), so the memoized rows
    // child doesn't reconcile on caret churn — identical pattern to
    // foldedKey above. Empty key = no coverage markers.
    const covered = React.useMemo(() => {
        if (!coverageKey) return null;
        const set = new Set<number>();
        for (const part of coverageKey.split(",")) {
            const n = Number(part);
            if (Number.isFinite(n)) set.add(n);
        }
        return set;
    }, [coverageKey]);

    const rows: React.ReactElement[] = [];
    // PERF: window the gutter rows (spacer above + below keep the flow
    // height identical). A 5,000-line file used to mount 5,000 gutter
    // divs that all participated in layout on every edit re-render.
    const first = Math.max(1, Math.min(windowFirst, lineCount));
    const last = Math.min(lineCount, Math.max(windowLast, windowFirst));
    if (first > 1) {
        rows.push(<div key="g-sp-top" style={{height: `${(first - 1) * rowHeight}px`}}/>);
    }
    for (let i = first - 1; i < last; i++) {
        const isCovered = covered?.has(i + 1) === true;
        const n = i + 1;
        // Vim relative numbering: |n - caretLine| (the caret line keeps
        // its absolute number — the hybrid look).
        const label =
            relativeTo != null && n !== relativeTo ? Math.abs(n - relativeTo) : n;
        rows.push(
            <div
                key={i}
                className={cn(
                    "tabular-nums",
                    caretLine === i + 1 && "text-emerald-500 font-medium",
                    // Lines hidden under a fold render dimmed so the collapsed
                    // span reads as one block (the code itself is covered by the
                    // fold overlay next to the gutter).
                    folded?.has(i + 1) && "opacity-30",
                    // Coverage gutter mapping: executed lines get a soft emerald
                    // tint on the number's row — the view-mode twin is the thin
                    // marker strip at the code body's left edge.
                    isCovered &&
                    "bg-emerald-500/10 rounded-sm text-emerald-700 dark:text-emerald-400"
                )}
                title={isCovered ? `Line ${i + 1} executed in the last coverage run` : undefined}
            >
                {label}
            </div>
        );
    }
    if (last < lineCount) {
        rows.push(<div key="g-sp-bot" style={{height: `${(lineCount - last) * rowHeight}px`}}/>);
    }
    return <>{rows}</>;
});
