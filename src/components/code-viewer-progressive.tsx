"use client";

import * as React from "react";
import {Loader2} from "lucide-react";
import {WorkerOrPlainHighlightBlock} from "@/components/worker-highlight";
import {SimpleHighlightBlock} from "@/components/code-viewer-blocks";

export const ProgressiveCodeBody = React.memo(function ProgressiveCodeBody({
                                                                               chunks,
                                                                               startRows,
                                                                               totalLines,
                                                                               gutterDigits,
                                                                               showLineNumbers,
                                                                               rsStyle,
                                                                               wordWrap,
                                                                               codeBg,
                                                                               fontSize,
                                                                               lineHeight,
                                                                               letterSpacing,
                                                                               isDark,
                                                                               lineHeightPx,
                                                                               onFrontier,
                                                                               useWorkerHighlight,
                                                                               clipOverflow,
                                                                           }: {
    /** Tokenize the chunks in the highlight WORKER (off the main
     *  thread) instead of per-chunk main-thread Prism. Falls back to
     *  the plain blocks when the worker is unavailable. */
    chunks: string[];
    /** First 1-based display row of every chunk. */
    startRows: number[];
    totalLines: number;
    gutterDigits: number;
    showLineNumbers: boolean;
    rsStyle: Record<string, unknown>;
    wordWrap: boolean;
    codeBg: string;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    isDark: boolean;
    lineHeightPx: number;
    /** Frontier reporter — called with the first NOT-yet-mounted row at
     *  mount start and with Infinity once every chunk is on screen. */
    onFrontier: (rowLimit: number) => void;
    useWorkerHighlight?: boolean;
    /** Shared Show-less overflow lock passthrough — chunked files only
     *  render EXPANDED today, but if that gate ever widens the nested
     *  scroll kill must follow automatically. */
    clipOverflow?: boolean;
}) {
    const [mounted, setMounted] = React.useState(0);
    // Reset the frontier whenever the chunk set changes (file switch,
    // re-expand). Report START immediately so overlays gate rows past
    // chunk 1 from the very first frame.
    React.useEffect(() => {
        setMounted(0);
        onFrontier(startRows[1] ?? Number.POSITIVE_INFINITY);
    }, [chunks]);
    // Drive the progressive mount: one chunk per animation frame until
    // the whole file is on screen. Frame 0 paints the loader first, so
    // the very first (heaviest) tokenize never blocks a blank tab.
    React.useEffect(() => {
        if (mounted >= chunks.length) return;
        let cancelled = false;
        const raf = requestAnimationFrame(() => {
            if (!cancelled) setMounted((n) => Math.min(n + 1, chunks.length));
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, [chunks, mounted]);
    // Report END once every chunk is mounted (one parent re-render).
    React.useEffect(() => {
        if (mounted >= chunks.length) onFrontier(Number.POSITIVE_INFINITY);
    }, [mounted, chunks.length, onFrontier]);

    return (
        <>
            {chunks.slice(0, mounted).map((chunk, i) => (
                <WorkerOrPlainHighlightBlock
                    key={`chunk-${i}`}
                    useWorker={!!useWorkerHighlight}
                    code={chunk}
                    language="python"
                    rsStyle={rsStyle}
                    showLineNumbers={showLineNumbers}
                    startingLineNumber={startRows[i]}
                    wordWrap={wordWrap}
                    codeBg={codeBg}
                    fontSize={fontSize}
                    lineHeight={lineHeight}
                    letterSpacing={letterSpacing}
                    isDark={isDark}
                    gutterDigits={gutterDigits}
                    padTop={i === 0}
                    padBottom={false}
                    fillHeight={false}
                    contentVisibilityAuto
                    chunkLineCount={chunk.split("\n").length}
                    lineHeightPx={lineHeightPx}
                    clipOverflow={clipOverflow}
                    fallback={
                        <SimpleHighlightBlock
                            code={chunk}
                            rsStyle={rsStyle}
                            showLineNumbers={showLineNumbers}
                            startingLineNumber={startRows[i]}
                            padTop={i === 0}
                            padBottom={false}
                            fillHeight={false}
                            wordWrap={wordWrap}
                            codeBg={codeBg}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            letterSpacing={letterSpacing}
                            isDark={isDark}
                            gutterDigits={gutterDigits}
                            contentVisibilityAuto
                            chunkLineCount={chunk.split("\n").length}
                            lineHeightPx={lineHeightPx}
                            clipOverflow={clipOverflow}
                        />
                    }
                />
            ))}
            {mounted < chunks.length ? (
                <div
                    className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                >
                    <Loader2 className="size-4 animate-spin"/>
                    Rendering{" "}
                    {Math.max(0, (startRows[mounted] ?? 1) - 1).toLocaleString()} of{" "}
                    {totalLines.toLocaleString()} lines…
                </div>
            ) : (
                <div style={{height: "1rem"}} aria-hidden="true"/>
            )}
        </>
    );
});
