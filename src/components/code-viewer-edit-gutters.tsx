"use client";

import * as React from "react";
import {EditLineGutterRows} from "@/components/code-viewer-gutter";
import {EDIT_GUTTER_BREAKPOINT_PX} from "@/lib/breakpoint-list";
import {formatSymbol, type PythonSymbol} from "@/lib/python-symbols";
import type {CodeViewerProps} from "@/components/code-viewer-types";
import type {VimController} from "@/lib/vim-mode";

export interface CodeViewerEditGuttersProps {
    /** Settings toggle for the fold gutter. */
    codeFolding: CodeViewerProps["codeFolding"];
    /** The deferred edit-buffer symbol scan. */
    editSymbols: PythonSymbol[];
    /** Which edit-mode folds are collapsed. */
    editFoldedKeys: ReadonlySet<string>;
    /** The stable fold-key mapper. */
    foldKeyOf: (sym: PythonSymbol) => string;
    /** Toggles one edit-mode fold. */
    toggleEditFold: (sym: PythonSymbol) => void;
    /** True on dark themes. */
    isDark: boolean;
    /** The editor font size in px. */
    fontSize: number;
    /** The line-height multiplier. */
    lineHeight: number;
    /** The fold gutter's width in px. */
    EDIT_FOLD_GUTTER_PX: number;
    /** One edit-mode row's height in px. */
    EDIT_LINE_HEIGHT: number;
    /** The line-number gutter element. */
    editLineGutterRef: React.RefObject<HTMLDivElement | null>;
    /** Lines in the edit buffer. */
    editLineCount: number;
    /** True for .py/.pyw (breakpoints apply). */
    isPythonFile: boolean;
    /** Gutter strip click handler. */
    toggleBreakpointAt: (line: number) => void;
    /** The caret's 1-based line. */
    caretLine: number;
    /** Stable serialization of the folded rows. */
    editFoldedKey: string;
    /** Stable serialization of covered rows. */
    coverageKey: string;
    /** First mounted overlay window line. */
    overlayFirst: number;
    /** Last mounted overlay window line. */
    overlayLast: number;
    /** True while vim mode is enabled. */
    vimMode: boolean;
    /** The live vim controller (relative numbers). */
    vimRef: React.RefObject<VimController | null>;
    /** This file's breakpoints (ascending). */
    activeBreakpoints: number[];
    /** The active pdb stop line, if any. */
    stoppedLine: number | null;
}

export function CodeViewerEditGutters(props: CodeViewerEditGuttersProps) {
    const {
        codeFolding,
        editSymbols,
        editFoldedKeys,
        foldKeyOf,
        toggleEditFold,
        isDark,
        fontSize,
        lineHeight,
        EDIT_FOLD_GUTTER_PX,
        EDIT_LINE_HEIGHT,
        editLineGutterRef,
        editLineCount,
        isPythonFile,
        toggleBreakpointAt,
        caretLine,
        editFoldedKey,
        coverageKey,
        overlayFirst,
        overlayLast,
        vimMode,
        vimRef,
        activeBreakpoints,
        stoppedLine,
    } = props;
    return (
        <>
            {/* ─── Fold-chevron gutter (edit mode) ────────────────────
    Mirrors the view-mode fold gutter: a dedicated column to
    the LEFT of the line numbers with one clickable chevron
    per block-level symbol (def / class / for / if / try /
    with). Clicking toggles the fold — the block's body is
    covered by an opaque overlay (rendered next to the
    textarea), NOT removed from the buffer, so edits can
    never lose code. The column stretches with the flex row
    (the line-number gutter is the sizer), and chevrons are
    positioned by the same 16px + (line-1)×1.6×fontSize
    formula the gutter + squiggle overlay use. */}
            {codeFolding && (
                <div
                    className="relative shrink-0 select-none"
                    style={{width: `${EDIT_FOLD_GUTTER_PX}px`}}
                >
                    {editSymbols.map((sym) => {
                        const isFolded = editFoldedKeys.has(foldKeyOf(sym));
                        const top = 16 + (sym.line - 1) * EDIT_LINE_HEIGHT;
                        return (
                            <button
                                type="button"
                                key={`efold-${foldKeyOf(sym)}`}
                                aria-label={isFolded
                                    ? `Expand ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`
                                    : `Collapse ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`}
                                className="absolute flex items-center justify-center rounded-sm hover:bg-foreground/10 focus:bg-foreground/15 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                                style={{
                                    top: `${top}px`,
                                    left: 0,
                                    width: `${EDIT_FOLD_GUTTER_PX}px`,
                                    height: `${EDIT_LINE_HEIGHT}px`,
                                    color: isDark ? "#9ca3af" : "#4b5563",
                                    fontSize: `${Math.max(11, fontSize * 0.9)}px`,
                                    fontWeight: 700,
                                    background: "transparent",
                                    border: 0,
                                    cursor: "pointer",
                                    lineHeight: 1,
                                    padding: 0,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleEditFold(sym);
                                }}
                                title={isFolded
                                    ? `Expand ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`
                                    : `Collapse ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`}
                            >
                                {isFolded ? "▸" : "▾"}
                            </button>
                        );
                    })}
                </div>
            )}
            {/* ─── Line-number gutter (edit mode) ───────────────────
    A synced line-number column on the left of the textarea.
    The gutter is a <div> with one <div> per line, styled
    to match the textarea's line height. The current line
    (where the caret is) gets a subtle highlight. The gutter
    grows to the full content height (no overflow clipping)
    so it scrolls with the parent scroll container. */}
            <div
                ref={editLineGutterRef}
                aria-hidden="true"
                className="shrink-0 select-none text-right text-muted-foreground/50 font-mono relative"
                style={{
                    paddingTop: "16px",
                    paddingBottom: "16px",
                    paddingRight: "8px",
                    paddingLeft: "12px",
                    fontSize: fontSize + "px",
                    lineHeight: String(lineHeight),
                    fontFamily: "var(--font-jb-mono), monospace",
                    background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                    borderRight: "1px solid " + (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"),
                    minWidth: `${Math.max(2, String(editLineCount).length) * 0.75}em`,
                    cursor: isPythonFile ? "default" : undefined,
                }}
                onClick={(e) => {
                    /* ─── BREAKPOINT STRIP (edit mode) ───────────────────
                       Clicking the gutter's reserved LEFT strip (its 12px
                       paddingLeft — the zone left of the digits, where nothing
                       else renders) toggles a breakpoint on that line. The
                       hit-test is purely by x-offset, so the digits
                       themselves, the fold-chevron gutter (a separate sibling
                       column) and the squiggle overlays never lose a click.
                       The y→line math is the same row formula the rows use
                       (16px padding + (n-1) × row height). */
                    if (!isPythonFile) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    if (x > EDIT_GUTTER_BREAKPOINT_PX) return;
                    const y = e.clientY - rect.top - 16;
                    const rowH = fontSize * lineHeight;
                    const line = Math.floor(y / rowH) + 1;
                    if (line >= 1 && line <= editLineCount) {
                        e.preventDefault();
                        toggleBreakpointAt(line);
                    }
                }}
            >
                {/* the rows live in the memoized child —
      its props (lineCount / caretLine / foldedKey) stay
      constant while typing WITHIN a line, so the N row divs
      are NOT reconciled on those keystrokes. */}
                <EditLineGutterRows
                    lineCount={editLineCount}
                    caretLine={caretLine}
                    foldedKey={editFoldedKey}
                    coverageKey={coverageKey}
                    windowFirst={overlayFirst}
                    windowLast={overlayLast}
                    rowHeight={fontSize * lineHeight}
                    relativeTo={
                        vimMode && vimRef.current?.wantsRelativeNumbers()
                            ? caretLine
                            : undefined
                    }
                />
                {isPythonFile && activeBreakpoints.length > 0 && (
                    /* ─── Breakpoint markers (edit mode) ────────────────
                        Red dots centered in the reserved strip, one per
                        breakpoint line, windowed like the gutter rows
                        (spacer-free — only in-viewport rows mount; the
                        strip is pointer-events-none so the gutter's own
                        click handler stays the single hit target). */
                    <div
                        className="pointer-events-none absolute inset-y-0 left-0 z-10"
                        style={{width: EDIT_GUTTER_BREAKPOINT_PX}}
                        aria-hidden="true"
                    >
                        {activeBreakpoints
                            .filter((l) => l >= overlayFirst && l <= overlayLast)
                            .map((l) => (
                                <div
                                    key={`bp-${l}`}
                                    className="absolute left-0 flex items-center justify-center"
                                    style={{
                                        top: `${16 + (l - 1) * (fontSize * lineHeight)}px`,
                                        height: `${fontSize * lineHeight}px`,
                                        width: EDIT_GUTTER_BREAKPOINT_PX,
                                    }}
                                    title={`Breakpoint at line ${l} — click to remove`}
                                >
            <span
                className={
                    l === stoppedLine
                        ? "size-2.5 rounded-full bg-red-500 ring-2 ring-red-300"
                        : "size-2.5 rounded-full bg-red-500"
                }
            />
                                </div>
                            ))}
                    </div>
                )}
                {isPythonFile && stoppedLine !== null && stoppedLine >= 1 && stoppedLine <= editLineCount && (
                    /* The debugger's CURRENT-LINE arrow in the strip — the
                        classic pdb "where am I" glyph next to the dot/line. */
                    <div
                        className="pointer-events-none absolute left-0 z-10 flex items-center justify-center text-[9px] leading-none"
                        style={{
                            top: `${16 + (stoppedLine - 1) * (fontSize * lineHeight)}px`,
                            height: `${fontSize * lineHeight}px`,
                            width: EDIT_GUTTER_BREAKPOINT_PX,
                            color: "#f59e0b",
                            fontWeight: 700,
                        }}
                        aria-hidden="true"
                    >
                        ▶
                    </div>
                )}
            </div>
        </>
    );
}
