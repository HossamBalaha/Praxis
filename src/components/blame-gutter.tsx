"use client";

/**
 * blame-gutter.tsx — the EDITOR's inline git blame gutter (F21).
 *
 * git-blame.ts + a blame MODE already existed, but only inside the Git
 * Diff panel's tab. This component puts blame where you actually read
 * code: a toggleable, narrow column to the LEFT of the editor's
 * line-number gutter, showing author + relative age once per commit
 * RUN (consecutive lines from the same commit share one label — the
 * VS Code presentation), with the full commit details on hover.
 *
 * SELF-CONTAINED BY CONTRACT — the host (code-viewer) only has to:
 *   1. render <BlameGutter … /> inside a `relative` wrapper that
 *      spans the code's full scrollable height (view mode: the
 *      codeBodyRef wrapper; edit mode: the "relative flex min-h-full"
 *      row), as a sibling of the squiggle/fold overlays;
 *   2. reserve horizontal room for it (the column is w-40 =
 *      160px on xl+ screens; it renders nothing below xl);
 *   3. feed it the row metrics it already measures
 *      (measuredLineHeight / measuredCodeTop).
 *
 * Positioning is pure line math: row top = (startLine - 1) ×
 * lineHeightPx + topOffsetPx, height = lineCount × lineHeightPx — the
 * same formula the viewer's own overlays (squiggles, fold chevrons)
 * use, so the annotations stay glued to their lines.
 *
 * DATA: fetched ONCE per (folder, file) through lib/blame-data's
 * cache; a file switch clears the rows instantly and refetches (cache
 * hit when flipping back). Any failure — not a repo, untracked file,
 * network — resolves to null and the gutter renders NOTHING (blame is
 * a reading aid, never an error surface). A stale-data guard clamps
 * rows to the CURRENT lineCount: the buffer may have edits since the
 * fetch, so positions past the end are dropped.
 *
 * The column itself is pointer-events-none — it can never block code
 * selection/clicks — while each commit-run row opts back in
 * (pointer-events-auto) for its hover background + tooltip.
 */

import * as React from "react";
import {GitCommitHorizontal} from "lucide-react";
import {cn} from "@/lib/utils";
import {type BlameGroup, fetchBlame, groupBlameLines, relativeAge,} from "@/lib/blame-data";
import type {BlameLine} from "@/lib/git-blame";

/* ================================================================== */
/*  Props                                                              */

/* ================================================================== */

export interface BlameGutterProps {
    /** Slug of the folder containing the file (same currency the editor
     *  tabs / API routes use — base64url of the folder name). */
    folderSlug: string;
    /** Slug of the open file. */
    fileSlug: string;
    /** Master toggle — the gutter fetches on first show and hides
     *  instantly when turned off (the cache makes re-showing free). */
    visible: boolean;
    /** CURRENT rendered line count of the buffer — blame rows are
     *  clamped to it (stale-blame guard for edits after the fetch). */
    lineCount: number;
    /** Rendered row height in px (the viewer's measuredLineHeight). */
    lineHeightPx: number;
    /** Editor font size in px — sizes the gutter's own text. */
    fontSize: number;
    /** Theme flag for the gutter's tints (author emerald, borders). */
    isDark: boolean;
    /** Y offset of line 1 inside the host wrapper (the viewer's
     *  measuredCodeTop — the SyntaxHighlighter's top padding). Row tops
     *  are computed as (startLine - 1) × lineHeightPx + topOffsetPx.
     *  Defaults to 0. */
    topOffsetPx?: number;
}

/* ================================================================== */
/*  Row palette                                                        */

/* ================================================================== */

interface BlamePalette {
    /** Left border for a committed run. */
    border: string;
    /** Left border for an uncommitted ("Not Committed Yet") run. */
    borderUncommitted: string;
    /** Author text (emerald tint). */
    author: string;
    /** Author text for uncommitted runs (amber, matching the diff
     *  panel's inline-blame wording). */
    authorUncommitted: string;
    /** Relative-age text (muted). */
    age: string;
    /** Shimmer bar color. */
    shimmer: string;
}

const DARK_PALETTE: BlamePalette = {
    border: "rgba(52, 211, 153, 0.28)",
    borderUncommitted: "rgba(251, 191, 36, 0.45)",
    author: "text-emerald-300/85",
    authorUncommitted: "text-amber-300/90",
    age: "text-slate-400/75",
    shimmer: "rgba(148, 163, 184, 0.14)",
};

const LIGHT_PALETTE: BlamePalette = {
    border: "rgba(5, 150, 105, 0.35)",
    borderUncommitted: "rgba(217, 119, 6, 0.50)",
    author: "text-emerald-700/85",
    authorUncommitted: "text-amber-600/90",
    age: "text-slate-500/75",
    shimmer: "rgba(100, 116, 139, 0.12)",
};

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

/** One commit RUN — spans its lines; the label sits on the first
 *  line (editors keep continuation lines blank). */
const BlameRow = React.memo(function BlameRow({
                                                  group,
                                                  rowH,
                                                  top,
                                                  fontSize,
                                                  palette,
                                              }: {
    group: BlameGroup;
    /** Clamped, sanitized row height (px). */
    rowH: number;
    /** topOffsetPx (px). */
    top: number;
    fontSize: number;
    palette: BlamePalette;
}) {
    const rowTop = (group.startLine - 1) * rowH + top;
    const height = group.lineCount * rowH;
    const date = new Date(group.authorTime * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
    const title = group.uncommitted
        ? "Uncommitted working-tree line"
        : `${group.summary} — ${group.commit.slice(0, 12)} — ${group.author} — ${date} (${relativeAge(group.authorTime)})`;

    return (
        <div
            className="pointer-events-auto group absolute left-0 right-1 overflow-hidden border-l-2 hover:bg-emerald-500/5"
            style={{
                top: `${rowTop}px`,
                height: `${height}px`,
                borderColor: group.uncommitted ? palette.borderUncommitted : palette.border,
            }}
            title={title}
        >
            {/* Label row — anchored to the run's FIRST line; the age is
          shrink-0 so a long author name truncates, never the date. */}
            <div
                className="flex items-center gap-1 overflow-hidden px-1.5"
                style={{height: `${rowH}px`}}
            >
                <GitCommitHorizontal
                    className={cn(
                        "size-2.5 shrink-0 text-emerald-500/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                        group.uncommitted && "text-amber-500/70"
                    )}
                />
                <span
                    className={cn(
                        "truncate font-medium",
                        fontSize >= 16 ? "text-[11px]" : "text-[10px]",
                        group.uncommitted ? palette.authorUncommitted : palette.author
                    )}
                >
          {group.uncommitted ? "you (not committed yet)" : group.author}
        </span>
                {!group.uncommitted && (
                    <span
                        className={cn(
                            "shrink-0 whitespace-nowrap",
                            fontSize >= 16 ? "text-[10px]" : "text-[9px]",
                            palette.age
                        )}
                    >
            {relativeAge(group.authorTime)}
          </span>
                )}
            </div>
        </div>
    );
});

/** Loading state — a few staggered shimmer bars where the labels are
 *  about to appear (only on the FIRST load of a file; cached files
 *  paint instantly and never shimmer). */
function BlameShimmer({top, color}: { top: number; color: string }) {
    const bars = [
        {top: 0, width: 88},
        {top: 42, width: 116},
        {top: 96, width: 72},
        {top: 150, width: 104},
    ];
    return (
        <div
            className="absolute inset-x-0"
            style={{top: `${top}px`}}
            aria-hidden="true"
        >
            {bars.map((b, i) => (
                <div
                    key={i}
                    className="absolute left-2 h-2 animate-pulse rounded-sm"
                    style={{
                        top: `${b.top}px`,
                        width: `${b.width}px`,
                        background: color,
                        animationDelay: `${i * 160}ms`,
                    }}
                />
            ))}
        </div>
    );
}

/* ================================================================== */
/*  BlameGutter                                                        */

/* ================================================================== */

export function BlameGutter({
                                folderSlug,
                                fileSlug,
                                visible,
                                lineCount,
                                lineHeightPx,
                                fontSize,
                                isDark,
                                topOffsetPx = 0,
                            }: BlameGutterProps) {
    const [blame, setBlame] = React.useState<BlameLine[] | null>(null);
    const [loading, setLoading] = React.useState(false);

    // File switch → drop the previous file's rows IMMEDIATELY (during
    // render, the viewer's own foldFileKey pattern) so file A's blame
    // never flashes over file B while the fetch is in flight.
    const fileKey = `${folderSlug} ${fileSlug}`;
    const [loadedKey, setLoadedKey] = React.useState(fileKey);
    if (loadedKey !== fileKey) {
        setLoadedKey(fileKey);
        setBlame(null);
    }

    // Fetch on show / on file change — once per (folder, file); the
    // lib's cache dedupes toggles and returns instantly for files seen
    // before. Failures resolve to null and the gutter stays empty.
    React.useEffect(() => {
        if (!visible || !folderSlug || !fileSlug) return;
        let cancelled = false;
        setLoading(true);
        fetchBlame(folderSlug, fileSlug).then((lines) => {
            if (cancelled) return;
            setBlame(lines);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [visible, folderSlug, fileSlug]);

    // Stale-blame clamp + grouping: lines past the CURRENT buffer length
    // are dropped (the buffer may have edits since the fetch), then the
    // survivors collapse into consecutive same-commit runs. Pure math —
    // memoized so hover state in the rows never re-runs it.
    const groups = React.useMemo<BlameGroup[]>(() => {
        if (!blame) return [];
        const safeCount = Math.max(0, Math.floor(lineCount));
        if (safeCount === 0) return [];
        return groupBlameLines(blame.filter((l) => l.finalLine <= safeCount));
    }, [blame, lineCount]);

    if (!visible) return null;

    const rowH = Math.max(1, lineHeightPx);
    const top = Math.max(0, topOffsetPx);
    const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
    const showShimmer = loading && blame === null;
    if (!showShimmer && groups.length === 0) return null;

    return (
        // The column: absolutely positioned against the host's `relative`
        // full-content-height wrapper, left of the line-number gutter.
        // Hidden below xl — a blame column is a big-screen reading aid;
        // the host reserves no room for it there (see integration notes).
        <div
            aria-hidden="true"
            className={cn(
                "pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-40 overflow-hidden select-none xl:block"
            )}
        >
            {showShimmer ? (
                <BlameShimmer top={top} color={palette.shimmer}/>
            ) : (
                groups.map((g) => (
                    <BlameRow
                        key={`${g.commit}:${g.startLine}`}
                        group={g}
                        rowH={rowH}
                        top={top}
                        fontSize={fontSize}
                        palette={palette}
                    />
                ))
            )}
        </div>
    );
}
