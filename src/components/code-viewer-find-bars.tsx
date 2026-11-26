"use client";

import * as React from "react";
import {ChevronDown, ChevronUp, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {ReadModeFindBar} from "@/components/read-mode-find-bar";

export interface CodeViewerFindBarsProps {
    /** True while the find bar is open. */
    showFind: boolean;
    /** True while the editor surface is in edit mode. */
    editMode: boolean;
    /** True while the replace row is expanded. */
    showReplace: boolean;
    /** The live find query. */
    findText: string;
    /** The live replace text. */
    replaceText: string;
    /** True when the query is a regex pattern. */
    useRegex: boolean;
    /** 0-based index of the current match. */
    currentMatch: number;
    /** Total matches for the current mode. */
    totalMatches: number;
    /** View-mode occurrence matches (row + column). */
    viewFindMatches: Array<{ row: number; start: number; end: number }>;
    /** The measured code row height in px. */
    measuredLineHeight: number;
    /** The measured top padding of the code body in px. */
    measuredCodeTop: number;
    /** The find input (focused by the opener). */
    findInputRef: React.RefObject<HTMLInputElement | null>;
    /** The replace input. */
    replaceInputRef: React.RefObject<HTMLInputElement | null>;
    /** The scroll container the view bar scrolls. */
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    /** Closes/opens the bar. */
    setShowFind: React.Dispatch<React.SetStateAction<boolean>>;
    /** Expands/collapses the replace row. */
    setShowReplace: React.Dispatch<React.SetStateAction<boolean>>;
    /** Updates the query. */
    setFindText: React.Dispatch<React.SetStateAction<string>>;
    /** Updates the replace text. */
    setReplaceText: React.Dispatch<React.SetStateAction<string>>;
    /** Toggles regex mode. */
    setUseRegex: React.Dispatch<React.SetStateAction<boolean>>;
    /** Steps/clamps the match index. */
    setCurrentMatch: React.Dispatch<React.SetStateAction<number>>;
    /** Advances to the next match. */
    handleFindNext: () => void;
    /** Steps back to the previous match. */
    handleFindPrev: () => void;
    /** Replaces the current match and advances. */
    handleReplaceCurrent: () => void;
    /** Replaces every match in one pass. */
    handleReplaceAll: () => void;
}

export function CodeViewerFindBars(props: CodeViewerFindBarsProps) {
    const {
        showFind,
        editMode,
        showReplace,
        findText,
        replaceText,
        useRegex,
        currentMatch,
        totalMatches,
        viewFindMatches,
        measuredLineHeight,
        measuredCodeTop,
        findInputRef,
        replaceInputRef,
        scrollContainerRef,
        setShowFind,
        setShowReplace,
        setFindText,
        setReplaceText,
        setUseRegex,
        setCurrentMatch,
        handleFindNext,
        handleFindPrev,
        handleReplaceCurrent,
        handleReplaceAll,
    } = props;
    return (
        <>
            {/* ─── find bars, PINNED to the viewer root ─────
         Both bars render here (children of the root, not the scroll
         container) so they stay put while the code scrolls. ArrowUp /
         ArrowDown cycle prev/next matches; Enter/Shift+Enter still do
         too. */}
            {showFind && editMode && (
                <div
                    className="absolute top-[58px] right-3 z-40 flex flex-col gap-1 rounded-md border bg-popover text-popover-foreground shadow-lg px-1.5 py-1">
                    <div className="flex items-center gap-1">
                        {/* Expand/collapse the replace row. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowReplace((v) => !v)}
                            className="size-6 shrink-0"
                            title={showReplace ? "Hide replace" : "Show replace"}
                            aria-label={showReplace ? "Hide replace" : "Show replace"}
                        >
                            <ChevronDown className={cn("size-3.5 transition-transform", showReplace && "rotate-180")}/>
                        </Button>
                        <input
                            ref={findInputRef}
                            type="text"
                            value={findText}
                            onChange={(e) => {
                                setFindText(e.target.value);
                                setCurrentMatch(0);
                            }}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    setShowFind(false);
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (e.shiftKey) handleFindPrev();
                                    else handleFindNext();
                                } else if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    handleFindNext();
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    handleFindPrev();
                                }
                            }}
                            placeholder={useRegex ? "Find (regex)" : "Find"}
                            aria-label="Find in file"
                            className="h-6 w-40 bg-transparent text-xs outline-none px-1 font-mono"
                            spellCheck={false}
                        />
                        {/* Regex toggle button. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setUseRegex((v) => !v)}
                            className={cn("size-6 shrink-0 text-[10px] font-mono font-bold", useRegex && "bg-emerald-500/15 text-emerald-600")}
                            title={useRegex ? "Regex mode ON — click to switch to literal" : "Literal mode — click to switch to regex"}
                            aria-label={useRegex ? "Disable regex" : "Enable regex"}
                            aria-pressed={useRegex}
                        >
                            .*
                        </Button>
                        <span
                            className="text-[10px] text-muted-foreground tabular-nums shrink-0 min-w-[44px] text-center select-none">
             {totalMatches > 0 ? `${Math.min(currentMatch + 1, totalMatches)}/${totalMatches}` : "0/0"}
           </span>
                        <Button variant="ghost" size="icon" onClick={handleFindPrev} disabled={totalMatches === 0}
                                className="size-6" title="Previous match (↑ / Shift+Enter)"><ChevronUp
                            className="size-3.5"/></Button>
                        <Button variant="ghost" size="icon" onClick={handleFindNext} disabled={totalMatches === 0}
                                className="size-6" title="Next match (↓ / Enter)"><ChevronDown
                            className="size-3.5"/></Button>
                        <Button variant="ghost" size="icon" onClick={() => {
                            setShowFind(false);
                            setShowReplace(false);
                        }} className="size-6" title="Close (Escape)"><X className="size-3.5"/></Button>
                    </div>
                    {showReplace && (
                        <div className="flex items-center gap-1 border-t pt-1">
                            <input
                                ref={replaceInputRef}
                                type="text"
                                value={replaceText}
                                onChange={(e) => setReplaceText(e.target.value)}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Escape") {
                                        e.preventDefault();
                                        setShowFind(false);
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (e.shiftKey) handleReplaceAll();
                                        else handleReplaceCurrent();
                                    }
                                }}
                                placeholder="Replace"
                                aria-label="Replace with"
                                className="h-6 w-40 bg-transparent text-xs outline-none px-1 font-mono"
                                spellCheck={false}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleReplaceCurrent}
                                disabled={totalMatches === 0}
                                className="h-6 text-[10px] px-2"
                                title="Replace this match (Enter)"
                            >
                                Replace
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleReplaceAll}
                                disabled={totalMatches === 0}
                                className="h-6 text-[10px] px-2"
                                title="Replace all matches (Shift+Enter)"
                            >
                                All
                            </Button>
                        </div>
                    )}
                </div>
            )}
            {showFind && !editMode && (
                <ReadModeFindBar
                    findText={findText}
                    onFindTextChange={(s) => {
                        setFindText(s);
                        setCurrentMatch(0);
                    }}
                    onClose={() => setShowFind(false)}
                    scrollContainerRef={scrollContainerRef}
                    matches={viewFindMatches}
                    currentMatch={currentMatch}
                    onNext={handleFindNext}
                    onPrev={handleFindPrev}
                    measuredLineHeight={measuredLineHeight}
                    measuredCodeTop={measuredCodeTop}
                />
            )}
        </>
    );
}
