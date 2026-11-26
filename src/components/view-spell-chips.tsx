"use client";

import * as React from "react";
import {SpellWordSpan} from "@/lib/spell-marks";
import {pixelXOfColumn, visualPositionOf} from "@/lib/editor-geometry";

export interface ViewSpellChipsProps {
    /** True in edit mode (chips are view-only). */
    editMode: boolean;
    /** True while spell checking is on. */
    spellEnabled: boolean;
    /** Misspelled words in comments/strings. */
    spellIssues: Array<{ word: string; line: number; col: number }>;
    /** The file's lines (chip text measurement). */
    lines: string[];
    /** First mounted overlay window line. */
    overlayFirst: number;
    /** Last mounted overlay window line. */
    overlayLast: number;
    /** Raw line → display-row top (null = hidden). */
    viewRowTopOf: (rawLine: number) => number | null;
    /** Raw line → display row (folds applied). */
    rawLineToViewRow: Map<number, number>;
    /** The view tab size. */
    viewTabSize: number;
    /** Wrap columns (soft-wrap geometry). */
    viewWrapCols: number;
    /** Wrapped-row surpluses per line. */
    viewRowPrefix: number[] | null;
    /** One row's height in px. */
    lineHeightPx: number;
    /** Left offset where code text starts. */
    codeLeftOffsetPx: number;
    /** Measured monospace char width. */
    charWidth: number;
    /** The editor font size in px. */
    fontSize: number;
    /** Adds the word to the dictionary. */
    ignoreSpellWord: (word: string) => void;
    /** Replaces every occurrence. */
    replaceSpellWord: (word: string, suggestion: string) => void;
    /** Replaces one occurrence. */
    replaceSpellWordAt: (word: string, suggestion: string, line: number, col: number) => void;
}

export function ViewSpellChips(props: ViewSpellChipsProps) {
    const {
        editMode,
        spellEnabled,
        spellIssues,
        lines,
        overlayFirst,
        overlayLast,
        viewRowTopOf,
        rawLineToViewRow,
        viewTabSize,
        viewWrapCols,
        viewRowPrefix,
        lineHeightPx,
        codeLeftOffsetPx,
        charWidth,
        fontSize,
        ignoreSpellWord,
        replaceSpellWord,
        replaceSpellWordAt,
    } = props;
    return (
        <>
            {/* ─── spell chips (VIEW mode,────────────────
The comment/string misspellings render as transparent-text
chips at their exact (line, col) — the SAME mechanism the
file viewer's CodeViewSurface uses (SpellWordSpan: wavy
underline + click for add-to-dictionary). Positioning is
TAB-AWARE and WRAP-AWARE. */}
            {!editMode && spellEnabled && spellIssues.length > 0 && (() => {
// DISPLAY-ROW aware (the white-space-zigzag fix, mirrors
                // viewFindMatches): chips whose line is hidden under a fold or
                // past the COLLAPSED preview cut are SKIPPED (viewRowTopOf →
                // null), and the survivors position at their display row —
                // marks stay glued to the rows actually on screen instead of
                // floating in the white space below the collapsed preview.
                const chips = spellIssues
                    .filter((i) => i.line >= 1 && i.line <= lines.length && i.line >= overlayFirst && i.line <= overlayLast && viewRowTopOf(i.line) !== null)
                    .map((issue, i) => {
                        const lineText = lines[issue.line - 1] ?? "";
                        const row = rawLineToViewRow.size ? (rawLineToViewRow.get(issue.line) ?? 0) : issue.line;
                        const pos = visualPositionOf(lineText, Math.max(0, issue.col - 1), viewTabSize, viewWrapCols);
                        const extraRowsBefore = viewRowPrefix?.[row - 1] ?? 0;
                        const top = (viewRowTopOf(issue.line) ?? 0) + (extraRowsBefore + pos.row) * lineHeightPx;
                        const left = codeLeftOffsetPx + pixelXOfColumn(lineText, issue.col - 1, viewTabSize, charWidth);
                        return (
                            <span
                                key={`vspell-${issue.word}-${issue.line}-${issue.col}-${i}`}
                                style={{
                                    position: "absolute",
                                    top: `${top}px`,
                                    left: `${left}px`,
                                    width: `${issue.word.length * charWidth}px`,
                                    height: `${lineHeightPx}px`,
                                    lineHeight: `${lineHeightPx}px`,
                                    fontFamily: "var(--font-jb-mono), monospace",
                                    fontSize: `${fontSize}px`,
                                    color: "transparent",
                                    overflow: "hidden",
                                    whiteSpace: "pre",
                                    pointerEvents: "auto",
                                    zIndex: 2,
                                }}
                            >
               <SpellWordSpan
                   word={issue.word}
                   onIgnore={ignoreSpellWord}
                   onReplace={replaceSpellWord}
                   onReplaceOnce={(w, s) => replaceSpellWordAt(w, s, issue.line, issue.col)}
               />
             </span>
                        );
                    });
                return <>{chips}</>;
            })()}

        </>
    );
}
