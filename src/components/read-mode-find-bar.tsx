"use client";

import * as React from "react";
import {ChevronDown, ChevronUp, X} from "lucide-react";
import {Button} from "@/components/ui/button";

export function ReadModeFindBar({
                                    findText,
                                    onFindTextChange,
                                    onClose,
                                    scrollContainerRef,
                                    matches,
                                    currentMatch,
                                    onNext,
                                    onPrev,
                                    measuredLineHeight,
                                    measuredCodeTop,
                                }: {
    findText: string;
    onFindTextChange: (s: string) => void;
    onClose: () => void;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    /** Occurrence-level matches ({row, start, end}) from the parent —
     *  `row` is the RENDERED display row (folds / collapse applied), so
     *  the scroll target below lands on the exact glyph position. */
    matches: Array<{ row: number; start: number; end: number }>;
    /** 0-based index of the current occurrence. */
    currentMatch: number;
    onNext: () => void;
    onPrev: () => void;
    measuredLineHeight: number;
    measuredCodeTop: number;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Focus the input on mount.
    React.useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    // Scroll the code body to the current match.
    // the target uses the match's DISPLAY ROW — the old
    // raw-line math overshot whenever a block above was folded (and was
    // pure fiction for matches below the collapsed preview's cut, which
    // the viewer now auto-expands past — see the expand effect in
    // CodeViewer). The parent keeps the file expanded while the find bar
    // is open, so every row in `matches` is rendered and scrollable.
    React.useEffect(() => {
        if (matches.length === 0) return;
        const m = matches[Math.min(currentMatch, matches.length - 1)];
        if (!m) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        const targetY = measuredCodeTop + (m.row - 1) * measuredLineHeight;
        // Only scroll when the row is actually OUT of view, so stepping between
        // adjacent hits doesn't nudge the view on every arrow press. When it IS
        // out of view, jump INSTANTLY (VSCode/Chrome find-bar behavior) — a
        // smooth animation across a long distance can visibly stall when the
        // user steps quickly, which reads as "the arrows don't scroll".
        const firstVisible = container.scrollTop + measuredLineHeight;
        const lastVisible = container.scrollTop + container.clientHeight - measuredLineHeight * 2;
        if (targetY < firstVisible || targetY > lastVisible) {
            container.scrollTo({
                top: Math.max(0, targetY - container.clientHeight / 3),
            });
        }
    }, [currentMatch, matches, measuredCodeTop, measuredLineHeight, scrollContainerRef]);

    return (
        <div
            className="absolute top-[58px] right-3 z-40 flex items-center gap-1 rounded-md border bg-popover text-popover-foreground shadow-lg px-1.5 py-1">
            <input
                ref={inputRef}
                type="text"
                value={findText}
                onChange={(e) => onFindTextChange(e.target.value)}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                        e.preventDefault();
                        onClose();
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (e.shiftKey) onPrev();
                        else onNext();
                    }
                        // / arrow keys cycle matches like the
                    // edit-mode bar (now with real per-occurrence highlighting).
                    else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        onNext();
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        onPrev();
                    }
                }}
                placeholder="Find in file"
                className="h-6 w-44 bg-transparent text-xs outline-none px-1 font-mono"
                spellCheck={false}
            />
            <span
                className="text-[10px] text-muted-foreground tabular-nums shrink-0 min-w-[44px] text-center select-none"
                title={`${matches.length} occurrence${matches.length === 1 ? "" : "s"}`}>
        {matches.length > 0 ? `${Math.min(currentMatch + 1, matches.length)}/${matches.length}` : "0/0"}
      </span>
            <Button variant="ghost" size="icon" onClick={onPrev} disabled={matches.length === 0} className="size-6"
                    title="Previous occurrence (↑ / Shift+Enter)"><ChevronUp className="size-3.5"/></Button>
            <Button variant="ghost" size="icon" onClick={onNext} disabled={matches.length === 0} className="size-6"
                    title="Next occurrence (↓ / Enter)"><ChevronDown className="size-3.5"/></Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="size-6" title="Close (Escape)"><X
                className="size-3.5"/></Button>
        </div>
    );
}
