"use client";

/**
 * worker-highlight — renders a serialized Prism token tree (from
 * src/lib/highlight-client.ts) through the EXACT
 * react-syntax-highlighter span pipeline, so the worker-highlighted
 * code is pixel-identical to the main-thread SyntaxHighlighter
 * output: same `token <type>` classes, same
 * createStyleObject-merged inline styles from the same theme object,
 * same inline line-number spans.
 *
 * While the worker round-trip is in flight the block renders a
 * metrically-identical SKELETON (same font / line-height / padding,
 * faint shimmer bars per row) so the layout never jumps when the
 * colors land. If the worker is unavailable, `tokens` resolves null
 * and the caller falls back to SimpleHighlightBlock — never a blank
 * or unstyled flash.
 */

import * as React from "react";
// createStyleObject is the same helper react-syntax-highlighter's own
// createElement uses — it computes a span's inline style from its
// token classes + the theme stylesheet (power-set class lookup).
import {createStyleObject} from "react-syntax-highlighter/dist/esm/create-element";
import {type SerializedToken, tokenizeHighlight} from "@/lib/highlight-client";

/** One flattened text run: the accumulated token-class chain plus the
 * literal text. Mirrors react-syntax-highlighter's flattenCodeTree
 * (classes accumulate as the tree descends; one run per deepest text
 * node). */
interface FlatRun {
    classes: string[];
    text: string;
}

function flattenRuns(tokens: SerializedToken[], acc: string[], out: FlatRun[]): void {
    for (const t of tokens) {
        const classes = t.types.length ? [...acc, ...t.types] : acc;
        if (t.value !== undefined) {
            out.push({classes, text: t.value});
        } else if (t.children && t.children.length) {
            flattenRuns(t.children, classes, out);
        }
    }
}

/** Split flattened runs on newlines into per-LINE run lists. The
 * newline stays attached to the end of its segment (exactly how
 * react-syntax-highlighter emits line text) so `white-space: pre`
 * renders row breaks. A trailing newline does NOT create a phantom
 * final row. */
function runsToLines(runs: FlatRun[]): FlatRun[][] {
    const lines: FlatRun[][] = [[]];
    for (const run of runs) {
        if (!run.text.includes("\n")) {
            lines[lines.length - 1].push(run);
            continue;
        }
        const parts = run.text.split("\n");
        parts.forEach((part, i) => {
            const last = i === parts.length - 1;
            if (i > 0) lines.push([]);
            if (part || !last) {
                lines[lines.length - 1].push({
                    classes: run.classes,
                    text: last ? part : part + "\n",
                });
            }
        });
    }
    // A single trailing newline ends the final line — drop the empty tail.
    if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    return lines;
}

const LINE_NUMBER_CLASSES = [
    "comment",
    "linenumber",
    "react-syntax-highlighter-line-number",
];

export interface WorkerHighlightBlockProps {
    code: string;
    language?: string;
    /** The Prism theme object (rsStyle) — same object the
     *  SyntaxHighlighter path passes as `style`. */
    rsStyle: Record<string, unknown>;
    showLineNumbers: boolean;
    startingLineNumber?: number;
    wordWrap: boolean;
    codeBg: string;
    fontSize: number;
    lineHeight: number;
    letterSpacing: number;
    isDark: boolean;
    /** Digits of the file's last line number — sizes the gutter
     *  identically to the main-thread blocks. */
    gutterDigits?: number;
    padTop?: boolean;
    padBottom?: boolean;
    /** EXACT bottom padding in px — trims the 1rem default so a file
     *  that overflows the viewport by only a few px fits EXACTLY (kills
     *  the "0.1 cm scrollbar" sliver in Show-full mode). */
    bottomPadPx?: number;
    /** content-visibility passthrough (chunked rendering). */
    contentVisibilityAuto?: boolean;
    chunkLineCount?: number;
    lineHeightPx?: number;
    fillHeight?: boolean;
    /** SHOW-LESS NESTED-SCROLL KILL: when true the <pre> pins
     *  `overflow: hidden` explicitly. The worker <pre> defaults to
     *  visible today, but an explicit hidden in the collapsed preview
     *  makes the "text and overlays share ONE clip, zero nested
     *  scrollers" guarantee literal for this render path too. */
    clipOverflow?: boolean;
}

export const WorkerHighlightBlock = React.memo(function WorkerHighlightBlock({
                                                                                 code,
                                                                                 language = "python",
                                                                                 rsStyle,
                                                                                 showLineNumbers,
                                                                                 startingLineNumber = 1,
                                                                                 wordWrap,
                                                                                 codeBg,
                                                                                 fontSize,
                                                                                 lineHeight,
                                                                                 letterSpacing,
                                                                                 isDark,
                                                                                 gutterDigits,
                                                                                 padTop = true,
                                                                                 padBottom = true,
                                                                                 bottomPadPx,
                                                                                 contentVisibilityAuto,
                                                                                 chunkLineCount,
                                                                                 lineHeightPx,
                                                                                 fillHeight = true,
                                                                                 clipOverflow,
                                                                             }: WorkerHighlightBlockProps) {
    const [tokens, setTokens] = React.useState<SerializedToken[] | null>(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        setTokens(null);
        setFailed(false);
        void tokenizeHighlight(code, language).then((t) => {
            if (!alive) return;
            if (t === null) setFailed(true);
            else setTokens(t);
        });
        return () => {
            alive = false;
        };
    }, [code, language]);

    // The classes present in the theme — token spans only carry the
    // `token` prefix plus classes NOT in the stylesheet (identical to
    // createElement's filter), and the theme lookup styles the rest.
    const themeClasses = React.useMemo(() => {
        const set = new Set<string>();
        for (const selector of Object.keys(rsStyle)) {
            for (const cls of selector.split(".")) set.add(cls);
        }
        return set;
    }, [rsStyle]);

    // The per-line render — memoized on the token tree + geometry.
    const lines = React.useMemo(() => {
        if (!tokens) return null;
        const runs: FlatRun[] = [];
        flattenRuns(tokens, [], runs);
        return runsToLines(runs);
    }, [tokens]);

    const largestNumber = startingLineNumber + Math.max(0, (lines?.length ?? 1) - 1);
    const numberMinWidth = gutterDigits
        ? `max(2.5em, ${gutterDigits}ch + 1.2em)`
        : "2.5em";

    if (failed) {
        // Worker unavailable → the caller renders its own fallback; this
        // block then never mounts (see the wrapper below). Defensive.
        return null;
    }

    // Skeleton while the worker round-trip is in flight — same metrics
    // as the final render so nothing shifts.
    if (!lines) {
        const rows = Math.min(60, Math.max(4, code.split("\n").length));
        return (
            <div
                aria-busy="true"
                style={{
                    margin: 0,
                    background: codeBg,
                    fontSize: `${fontSize / 16}rem`,
                    lineHeight: String(lineHeight),
                    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                    padding: `${padTop ? "1rem" : "0"} 1rem ${padBottom ? (bottomPadPx !== undefined ? `${bottomPadPx}px` : "1rem") : "0"} 0`,
                    fontFamily: "var(--font-jb-mono), monospace",
                    minHeight: fillHeight ? "100%" : undefined,
                    ...(contentVisibilityAuto && chunkLineCount
                        ? {
                            contentVisibility: "auto" as React.CSSProperties["contentVisibility"],
                            containIntrinsicSize: `auto ${chunkLineCount * (lineHeightPx || fontSize * lineHeight)}px`,
                        }
                        : null),
                }}
            >
                {Array.from({length: rows}).map((_, i) => (
                    <div
                        key={i}
                        className="animate-pulse praxis-shimmer"
                        style={{
                            height: `${(lineHeightPx || fontSize * lineHeight)}px`,
                            width: `${38 + ((i * 53) % 55)}%`,
                            background: "hsl(var(--muted)/0.55)",
                            borderRadius: 3,
                            marginBottom: 0,
                        }}
                    />
                ))}
            </div>
        );
    }

    return (
        <pre
            aria-hidden="false"
            style={{
                margin: 0,
                background: codeBg,
                fontSize: `${fontSize / 16}rem`,
                lineHeight: String(lineHeight),
                letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                padding: `${padTop ? "1rem" : "0"} 1rem ${padBottom ? (bottomPadPx !== undefined ? `${bottomPadPx}px` : "1rem") : "0"} 0`,
                fontFamily: "var(--font-jb-mono), monospace",
                minHeight: fillHeight ? "100%" : undefined,
                /* Show-less mode clip: no nested scroll container may exist —
                   the shared wrapper clips text AND overlays together. */
                ...(clipOverflow ? {overflow: "hidden" as React.CSSProperties["overflow"]} : null),
                ...(wordWrap ? {whiteSpace: "pre-wrap", wordBreak: "break-word"} : null),
                ...(contentVisibilityAuto && chunkLineCount
                    ? {
                        contentVisibility: "auto" as React.CSSProperties["contentVisibility"],
                        containIntrinsicSize: `auto ${chunkLineCount * (lineHeightPx || fontSize * lineHeight)}px`,
                    }
                    : null),
            }}
        >
      <code style={{fontFamily: "var(--font-jb-mono), monospace"}}>
        {lines.map((runs, i) => {
            const n = startingLineNumber + i;
            return (
                <span key={`ln-${i}`} style={wordWrap ? {display: "flex"} : undefined}>
              {showLineNumbers && (
                  <span
                      className={LINE_NUMBER_CLASSES.join(" ")}
                      style={createStyleObject(
                          LINE_NUMBER_CLASSES,
                          {
                              display: "inline-block",
                              minWidth: numberMinWidth,
                              paddingRight: "1em",
                              color: isDark ? "#4b5563" : "#9ca3af",
                              textAlign: "right",
                              userSelect: "none",
                          },
                          rsStyle as Record<string, React.CSSProperties>
                      )}
                  >
                  {n}
                </span>
              )}
                    {runs.map((run, j) => {
                        const allClasses = ["token", ...run.classes];
                        const carry = run.classes.filter((c) => !themeClasses.has(c));
                        return (
                            <span
                                key={`t-${i}-${j}`}
                                className={["token", ...carry].join(" ")}
                                style={createStyleObject(
                                    allClasses,
                                    {},
                                    rsStyle as Record<string, React.CSSProperties>
                                )}
                            >
                    {run.text}
                  </span>
                        );
                    })}
                    {runs.length === 0 ? "\n" : null}
            </span>
            );
        })}
      </code>
    </pre>
    );
});

/**
 * WorkerOrPlainHighlightBlock — the drop-in switch: try the worker
 * first; if it reports unavailable (tokens null), render the
 * main-thread fallback (`fallback` render prop) exactly as before
 * the worker existed.
 */
export function WorkerOrPlainHighlightBlock({
                                                useWorker,
                                                fallback,
                                                ...props
                                            }: WorkerHighlightBlockProps & {
    useWorker: boolean;
    fallback: React.ReactNode;
}) {
    const [workerDead, setWorkerDead] = React.useState(false);
    React.useEffect(() => {
        if (!useWorker) return;
        let alive = true;
        void tokenizeHighlight(props.code, props.language ?? "python").then((t) => {
            if (alive && t === null) setWorkerDead(true);
        });
        return () => {
            alive = false;
        };
    }, [useWorker, props.code, props.language]);
    if (!useWorker || workerDead) return <>{fallback}</>;
    return <WorkerHighlightBlock {...props} />;
}
