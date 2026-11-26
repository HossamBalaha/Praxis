"use client";

import * as React from "react";
import {type DiffOp, lineDiff, wordDiffSegments, type WordSegment,} from "@/lib/word-diff";
import {cn} from "@/lib/utils";

/**
 * FileDiffPreview — compact word-level diff of two text buffers.
 *
 * The find-in-files "Replace Selected" review pane (and any future
 * cross-file refactor preview) needs to show, per file, exactly what
 * the checked replacements would change BEFORE anything is written.
 * This component renders that review: a line-level diff (word-diff.ts
 * lineDiff — prefix/suffix trimmed LCS) with the changed line PAIRS
 * intra-line highlighted (wordDiffSegments, the same primitive the
 * DiffView tab uses), collapsed unchanged runs ("⋯ N lines"), and a
 * −removed/+added stat header.
 *
 * Rendering rules:
 *   - only lines within `contextLines` of a change are shown; every
 *     other equal run collapses into one "⋯ N lines" row, so a
 *     5,000-line file with 3 edits previews in ~15 rows;
 *   - inside a change block, the k-th removed line pairs with the
 *     k-th added line (lineDiff guarantees removes precede adds), and
 *     each side highlights the spans missing from its counterpart;
 *   - a hard row cap keeps a pathological full-file rewrite from
 *     mounting thousands of DOM nodes (the cap note says so honestly).
 */

/** One rendered diff row. */
type DiffRow =
    | { kind: "skip"; count: number }
    | { kind: "equal"; aIndex: number; bIndex: number; text: string }
    | { kind: "remove"; aIndex: number; text: string; segs: WordSegment[] }
    | { kind: "add"; bIndex: number; text: string; segs: WordSegment[] };

/** Hard cap on rendered rows — beyond this the diff is honest about
 *  being truncated instead of mounting the whole file. */
const MAX_RENDER_ROWS = 1000;

/** Build the visible row list from a line diff (memoized by caller). */
function buildRows(
    oldLines: readonly string[],
    newLines: readonly string[],
    contextLines: number
): { rows: DiffRow[]; removed: number; added: number; truncated: boolean } {
    const ops: DiffOp[] = lineDiff(oldLines, newLines);
    let removed = 0;
    let added = 0;
    for (const op of ops) {
        if (op.type === "remove") removed++;
        else if (op.type === "add") added++;
    }

    // ── Visibility pass: an op renders when it is a change, or an
    //    equal line within `contextLines` ops of a change (ops are
    //    1-per-line, so op distance == line distance inside a run).
    const visible = ops.map((op) => op.type !== "equal");
    for (let i = 0; i < ops.length; i++) {
        if (ops[i].type !== "equal") continue;
        for (let d = 1; d <= contextLines; d++) {
            if (i - d >= 0 && ops[i - d].type !== "equal") visible[i] = true;
            if (i + d < ops.length && ops[i + d].type !== "equal") visible[i] = true;
        }
    }

    const rows: DiffRow[] = [];
    let skipRun = 0;
    const flushSkip = () => {
        if (skipRun > 0) {
            rows.push({kind: "skip", count: skipRun});
            skipRun = 0;
        }
    };

    // ── Walk the ops once, grouping change blocks for the k-th pairing.
    let i = 0;
    while (i < ops.length) {
        const op = ops[i];
        if (op.type === "equal") {
            if (visible[i]) {
                flushSkip();
                rows.push({kind: "equal", aIndex: op.aIndex, bIndex: op.bIndex, text: oldLines[op.aIndex] ?? ""});
            } else {
                skipRun++;
            }
            i++;
            continue;
        }
        // A change block: every op until the next equal (or end).
        flushSkip();
        const block: DiffOp[] = [];
        while (i < ops.length && ops[i].type !== "equal") {
            block.push(ops[i]);
            i++;
        }
        // lineDiff emits removes before adds within a block — the k-th of
        // each side is the intra-line pair (same guarantee the DiffView
        // tab relies on for its word rows).
        const removes = block.filter((b): b is Extract<DiffOp, { type: "remove" }> => b.type === "remove");
        const adds = block.filter((b): b is Extract<DiffOp, { type: "add" }> => b.type === "add");
        for (let k = 0; k < removes.length || k < adds.length; k++) {
            const rem = removes[k];
            const add = adds[k];
            const remText = rem ? oldLines[rem.aIndex] ?? "" : null;
            const addText = add ? newLines[add.bIndex] ?? "" : null;
            if (rem) {
                rows.push({
                    kind: "remove",
                    aIndex: rem.aIndex,
                    text: remText ?? "",
                    segs: wordDiffSegments(remText ?? "", addText ?? ""),
                });
            }
            if (add) {
                rows.push({
                    kind: "add",
                    bIndex: add.bIndex,
                    text: addText ?? "",
                    segs: wordDiffSegments(addText ?? "", remText ?? ""),
                });
            }
        }
    }
    flushSkip();

    const truncated = rows.length > MAX_RENDER_ROWS;
    return {rows: truncated ? rows.slice(0, MAX_RENDER_ROWS) : rows, removed, added, truncated};
}

/** Render one side's word segments (changed spans highlighted). */
function SegmentSpan({segs, side}: { segs: WordSegment[]; side: "remove" | "add" }) {
    if (segs.length === 0) return null;
    return (
        <>
            {segs.map((seg, i) => (
                <span
                    key={i}
                    className={cn(
                        "whitespace-pre-wrap break-all",
                        seg.changed &&
                        (side === "remove"
                            ? "bg-red-500/25 rounded-sm"
                            : "bg-emerald-500/25 rounded-sm")
                    )}
                >
          {seg.text}
        </span>
            ))}
        </>
    );
}

export function FileDiffPreview({
                                    oldContent,
                                    newContent,
                                    contextLines = 2,
                                    className,
                                }: {
    oldContent: string;
    newContent: string;
    /** Equal lines shown around each change block (default 2). */
    contextLines?: number;
    className?: string;
}) {
    const {rows, removed, added, truncated} = React.useMemo(
        () => buildRows(oldContent.split("\n"), newContent.split("\n"), contextLines),
        [oldContent, newContent, contextLines]
    );

    if (oldContent === newContent) {
        return (
            <p className={cn("text-xs text-muted-foreground p-3", className)}>
                No changes in this file.
            </p>
        );
    }

    return (
        <div className={cn("text-[11px] font-mono", className)}>
            <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] border-b text-muted-foreground select-none">
                <span className="text-red-600 dark:text-red-400">−{removed}</span>
                <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>
            </div>
            <div>
                {rows.map((row, idx) => {
                    if (row.kind === "skip") {
                        return (
                            <div
                                key={idx}
                                className="px-2 py-0.5 text-muted-foreground/70 text-[10px] select-none bg-muted/30 text-center"
                            >
                                ⋯ {row.count} unchanged line{row.count === 1 ? "" : "s"}
                            </div>
                        );
                    }
                    if (row.kind === "equal") {
                        return (
                            <div key={idx} className="flex px-2 py-0.5 whitespace-pre-wrap break-all select-none">
                <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/60 select-none">
                  {row.aIndex + 1}
                </span>
                                <span className="flex-1 min-w-0 text-muted-foreground">{row.text || "\u00a0"}</span>
                            </div>
                        );
                    }
                    if (row.kind === "remove") {
                        return (
                            <div
                                key={idx}
                                className="flex px-2 py-0.5 bg-red-500/10 text-red-700 dark:text-red-300 whitespace-pre-wrap break-all"
                            >
                <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/60 select-none">
                  {row.aIndex + 1}
                </span>
                                <span className="w-3 shrink-0 select-none" aria-hidden>
                  −
                </span>
                                <span className="flex-1 min-w-0">
                  <SegmentSpan segs={row.segs} side="remove"/>
                </span>
                            </div>
                        );
                    }
                    return (
                        <div
                            key={idx}
                            className="flex px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap break-all"
                        >
              <span className="w-9 shrink-0 text-right pr-2 text-muted-foreground/60 select-none">
                {row.bIndex + 1}
              </span>
                            <span className="w-3 shrink-0 select-none" aria-hidden>
                +
              </span>
                            <span className="flex-1 min-w-0">
                <SegmentSpan segs={row.segs} side="add"/>
              </span>
                        </div>
                    );
                })}
                {truncated && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30">
                        Diff truncated after {MAX_RENDER_ROWS} rows — the remaining
                        changes are not shown but WILL be written.
                    </div>
                )}
            </div>
        </div>
    );
}
