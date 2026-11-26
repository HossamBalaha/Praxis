"use client";

import * as React from "react";
import {SyntaxHighlighter} from "@/lib/highlighter";


export const SimpleHighlightBlock = React.memo(function SimpleHighlightBlock({
                                                                                 code,
                                                                                 rsStyle,
                                                                                 showLineNumbers,
                                                                                 startingLineNumber = 1,
                                                                                 padTop = true,
                                                                                 padBottom = true,
                                                                                 bottomPadPx,
                                                                                 fillHeight = true,
                                                                                 wordWrap,
                                                                                 codeBg,
                                                                                 fontSize,
                                                                                 lineHeight,
                                                                                 letterSpacing,
                                                                                 isDark,
                                                                                 gutterDigits,
                                                                                 contentVisibilityAuto,
                                                                                 chunkLineCount,
                                                                                 lineHeightPx,
                                                                                 clipOverflow,
                                                                             }: {
    code: string;
    rsStyle: Record<string, unknown>;
    showLineNumbers: boolean;
    /** First line number of this chunk (progressive rendering splits
     *  long files into consecutive blocks; numbering continues). */
    startingLineNumber?: number;
    /** Chunk padding — intermediate chunks of a progressive render
     *  carry no top/bottom padding so rows stay flush. */
    padTop?: boolean;
    padBottom?: boolean;
    /** EXACT bottom padding in px — overrides the 1rem default when the
     *  container measures a few px of leftover scroll (the "0.1 cm
     *  scrollbar" in Show-full mode: trimming the bottom pad makes the
     *  content fit the viewport EXACTLY, killing the sliver scrollbar). */
    bottomPadPx?: number;
    /** Stretch to the container (single-block mode only). */
    fillHeight?: boolean;
    /** SHOW-LESS NESTED-SCROLL KILL: every Prism theme carries
     *  `overflow: "auto"` on its `pre[class*="language-"]` entry, so the
     *  react-syntax-highlighter <pre> keeps a NESTED scroll container.
     *  When the collapsed preview's forced-8-rows content exceeds a short
     *  viewport, that <pre> rendered its own VERTICAL scrollbar — dragging
     *  it scrolled the words UNDER the absolutely-positioned zigzag chips
     *  (the "squiggles detach from the words" report). Passing true here
     *  overrides the theme overflow with `hidden`, so in Show-less mode
     *  the ONLY clip is the shared wrapper that owns both the text and
     *  every overlay — no nested scroller can ever exist, and
     *  scrollHeight === clientHeight on the scrollport. */
    clipOverflow?: boolean;
    wordWrap: boolean;
    codeBg: string;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    isDark: boolean;
    /** Digit count of the FILE's last line number — sizes the gutter
     *  so every chunk (and every line) shares one code column. */
    gutterDigits?: number;
    /** Chunked rendering: skip layout + paint for offscreen chunks
     *  (content-visibility) with an intrinsic-size placeholder so the
     *  scrollbar math stays correct. */
    contentVisibilityAuto?: boolean;
    chunkLineCount?: number;
    lineHeightPx?: number;
}) {
    return (
        /* The clipOverflow spread lands LAST in customStyle so the
         * "hidden" override beats the theme's own `overflow: "auto"` —
         * react-syntax-highlighter merges customStyle over the theme's
         * pre rules, and last-write-wins keeps Show-less mode free of
         * any nested scrollbar. */
        <SyntaxHighlighter language="python" style={rsStyle as never} showLineNumbers={showLineNumbers}
                           startingLineNumber={startingLineNumber} wrapLongLines={wordWrap}
                           customStyle={{
                               margin: 0,
                               background: codeBg,
                               fontSize: `${fontSize / 16}rem`,
                               lineHeight: String(lineHeight),
                               letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                               padding: `${padTop ? "1rem" : "0"} 1rem ${padBottom ? (bottomPadPx !== undefined ? `${bottomPadPx}px` : "1rem") : "0"} 0`,
                               fontFamily: "var(--font-jb-mono), monospace",
                               minHeight: fillHeight ? "100%" : undefined,
                               flex: fillHeight ? "1 1 auto" : undefined, ...(clipOverflow ? {overflow: "hidden" as React.CSSProperties["overflow"]} : null), ...(contentVisibilityAuto && chunkLineCount ? {
                                   contentVisibility: "auto" as React.CSSProperties["contentVisibility"], /* EXACT rows × line-height (no rounding): the intrinsic-size
                 estimate must match the real rendered height to the
                 fraction, or the scrollbar adjusts every time an
                 offscreen chunk re-lays-out — the scroll-position
                 jumps read as "flicker while scrolling down". The
                 `auto` prefix lets the browser keep the last-rendered
                 size once a chunk HAS rendered; this estimate only
                 covers the not-yet-rendered tail. */
                                   containIntrinsicSize: `auto ${chunkLineCount * (lineHeightPx || fontSize * lineHeight)}px`
                               } : {})
                           }}
                           lineNumberStyle={{
                               minWidth: gutterDigits ? `max(2.5em, ${gutterDigits}ch + 1.2em)` : "2.5em",
                               paddingRight: "1em",
                               color: isDark ? "#4b5563" : "#9ca3af",
                               userSelect: "none",
                               textAlign: "right"
                           }}
                           codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
        >{code}</SyntaxHighlighter>
    );
});

export const CellCodeBlock = React.memo(function CellCodeBlock({
                                                                   source,
                                                                   rsStyle,
                                                                   showLineNumbers,
                                                                   startLine,
                                                                   wordWrap,
                                                                   codeBg,
                                                                   fontSize,
                                                                   lineHeight,
                                                                   letterSpacing,
                                                                   isDark,
                                                                   gutterMinWidth,
                                                               }: {
    source: string;
    rsStyle: Record<string, unknown>;
    showLineNumbers: boolean;
    startLine: number;
    wordWrap: boolean;
    codeBg: string;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    isDark: boolean;
    gutterMinWidth: string;
}) {
    return (
        <SyntaxHighlighter language="python" style={rsStyle as never} showLineNumbers={showLineNumbers}
                           startingLineNumber={startLine} wrapLongLines={wordWrap}
                           customStyle={{
                               margin: 0,
                               background: codeBg,
                               fontSize: `${fontSize / 16}rem`,
                               lineHeight: String(lineHeight),
                               letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                               padding: "0.75rem 1rem 0.75rem 0",
                               fontFamily: "var(--font-jb-mono), monospace"
                           }}
                           lineNumberStyle={{
                               minWidth: gutterMinWidth,
                               paddingRight: "1em",
                               color: isDark ? "#4b5563" : "#9ca3af",
                               userSelect: "none",
                               textAlign: "right"
                           }}
                           codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
        >{source}</SyntaxHighlighter>
    );
});
