"use client";

/**
 * the spell-check OVERLAY for plain <textarea>
 * editors. Browsers cannot draw wavy underlines inside a textarea, so
 * the classic technique: a transparent-text layer with the SAME font
 * metrics / padding / wrapping sits on top of the textarea
 * (pointer-events disabled except on the marked words). Misspelled
 * words render with the .spell-miss wavy red underline and are
 * click-to-ignore. The parent syncs scrollTop/scrollLeft from the
 * textarea's onScroll via the forwarded ref.
 */

import * as React from "react";
import {cn} from "@/lib/utils";
import {markSpellWords} from "@/lib/spell-marks";

export interface SpellTextOverlayProps {
    /** The exact text the textarea shows (same string → same wrapping). */
    text: string;
    /** Misspelled word forms (from /api/spell). */
    words: Set<string>;
    onIgnore: (word: string) => void;
    /** Replace-everywhere — swaps every occurrence of the misspelled word
     *  for the picked suggestion through the host's edit channel. Omitted
     *  → the popover's Replace button stays hidden. */
    onReplace?: (word: string, suggestion: string) => void;
    /** Replace-in-place — swaps ONLY the clicked occurrence. Omitted →
     *  the popover's third button stays hidden. */
    onReplaceOnce?: (word: string, suggestion: string) => void;
    /** Layout classes that MIRROR the textarea (padding, font, leading). */
    className?: string;
    /** Inline styles that mirror the textarea (font-size, line-height…). */
    style?: React.CSSProperties;
    /** Set by the parent to sync scrolling (scrollTop / scrollLeft). */
    overlayRef?: React.RefObject<HTMLDivElement | null>;
}

export function SpellTextOverlay({
                                     text,
                                     words,
                                     onIgnore,
                                     onReplace,
                                     onReplaceOnce,
                                     className,
                                     style,
                                     overlayRef
                                 }: SpellTextOverlayProps) {
    // PERF: React.memo on the component (below) + the cached
    // markSpellWords output means typing in a textarea no longer
    // re-walks the ENTIRE file text (an O(full-text) regex pass) on
    // every keystroke — the walk only re-runs when the text or the
    // misspelled-word SET actually changes.
    const marks = React.useMemo(
        () => markSpellWords(text, words, onIgnore, onReplace, onReplaceOnce),
        // words (a Set) identity changes when the spell API re-replies;
        // text changes on keystroke. The handlers are intentionally NOT
        // deps — the popover reads them through refs inside the spans.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [text, words]
    );
    if (words.size === 0) return null;
    return (
        <div
            ref={overlayRef}
            aria-hidden="true"
            className={cn(
                "pointer-events-none absolute inset-0 z-[2] overflow-hidden select-none [&_.spell-miss]:pointer-events-auto",
                className
            )}
            style={style}
        >
            {marks}
        </div>
    );
}

export const MemoizedSpellTextOverlay = React.memo(SpellTextOverlay, (prev, next) =>
    prev.text === next.text &&
    prev.words === next.words &&
    prev.onIgnore === next.onIgnore &&
    prev.onReplace === next.onReplace &&
    prev.onReplaceOnce === next.onReplaceOnce &&
    prev.className === next.className &&
    prev.style === next.style &&
    prev.overlayRef === next.overlayRef
);
