"use client";

/**
 * MergeEditor — a pure, network-free git conflict resolver.
 *
 * Parses the classic conflict markers client-side (<<<<<<< ours /
 * ||||||| base / ======= / >>>>>>> theirs, the diff3 layout) and
 * walks the user through each chunk: Accept Ours / Accept Theirs /
 * Accept Both, prev/next navigation, dimmed ±3-line context between
 * chunks, and an editable Result pane that reflects the running
 * resolution. "Mark resolved" hands the final marker-free content
 * back through onResolved.
 */

import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {Check, ChevronDown, ChevronUp, CircleCheck} from "lucide-react";

/* ── Conflict parsing ─────────────────────────────────────────── */

export interface ConflictChunk {
    /** 1-indexed line of the `<<<<<<<` marker. */
    startLine: number;
    /** 1-indexed line of the `>>>>>>>` marker. */
    endLine: number;
    /** Lines between `<<<<<<<` and the next marker (ours side). */
    ours: string[];
    /** Lines between `=======` and `>>>>>>>` (theirs side). */
    theirs: string[];
    /** Lines between `|||||||` and `=======` when the merge kept the
     *  common ancestor (diff3 style); null otherwise. */
    base: string[] | null;
}

/** `=======` separator — exactly seven equals up to end-of-line.
 *  Longer runs stay content, so a markdown setext underline like
 *  `========` is not mistaken for a separator. */
const SEPARATOR_RE = /^={7}\s*$/;

/**
 * Pure conflict-marker parser. Malformed blocks (an unterminated
 * `<<<<<<<`) are skipped rather than crashing the editor — git
 * itself only emits well-formed blocks.
 */
export function parseConflicts(content: string): ConflictChunk[] {
    const lines = content.split("\n");
    const chunks: ConflictChunk[] = [];
    let i = 0;
    while (i < lines.length) {
        if (!lines[i].startsWith("<<<<<<<")) {
            i++;
            continue;
        }
        const startLine = i + 1;
        const ours: string[] = [];
        const theirs: string[] = [];
        let base: string[] | null = null;
        let current = ours;
        let j = i + 1;
        let closed = false;
        for (; j < lines.length; j++) {
            const line = lines[j];
            if (line.startsWith(">>>>>>>")) {
                closed = true;
                break;
            }
            if (line.startsWith("|||||||") && current === ours && base === null) {
                base = [];
                current = base;
                continue;
            }
            if (SEPARATOR_RE.test(line) && current !== theirs) {
                current = theirs;
                continue;
            }
            current.push(line);
        }
        if (closed) {
            chunks.push({startLine, endLine: j + 1, ours, theirs, base});
            i = j + 1;
        } else {
            // Unterminated conflict — bail out of the rest of the file.
            break;
        }
    }
    return chunks;
}

/** Marker lines dropped from a manual resolution (see resolve()). */
function isMarkerLine(line: string): boolean {
    return (
        line.startsWith("<<<<<<<") ||
        line.startsWith(">>>>>>>") ||
        line.startsWith("|||||||") ||
        SEPARATOR_RE.test(line)
    );
}

/* ── Section model (context between chunks + chunks) ───────────── */

interface ContextSection {
    type: "context";
    /** 1-indexed first line of the run. */
    startLine: number;
    lines: string[];
}

interface ChunkSection {
    type: "chunk";
    index: number;
}

type Section = ContextSection | ChunkSection;

function buildSections(content: string, chunks: ConflictChunk[]): Section[] {
    const lines = content.split("\n");
    const sections: Section[] = [];
    let cursor = 0; // 0-indexed next unconsumed line
    chunks.forEach((chunk, index) => {
        const chunkStart = chunk.startLine - 1;
        if (chunkStart > cursor) {
            sections.push({
                type: "context",
                startLine: cursor + 1,
                lines: lines.slice(cursor, chunkStart),
            });
        }
        sections.push({type: "chunk", index});
        cursor = chunk.endLine; // first line after the >>>>>>> marker
    });
    if (cursor < lines.length) {
        sections.push({
            type: "context",
            startLine: cursor + 1,
            lines: lines.slice(cursor),
        });
    }
    return sections;
}

/** The Result text for a given choice vector: context stays, chunk
 *  bodies swap for the chosen side; unresolved chunks keep their raw
 *  marker block so the pane always mirrors the live state. */
function buildResult(
    content: string,
    chunks: ConflictChunk[],
    choices: Array<"ours" | "theirs" | "both" | null>
): string {
    const lines = content.split("\n");
    const out: string[] = [];
    let cursor = 0;
    chunks.forEach((chunk, index) => {
        const start = chunk.startLine - 1;
        if (start > cursor) out.push(...lines.slice(cursor, start));
        const choice = choices[index] ?? null;
        if (choice === "ours") out.push(...chunk.ours);
        else if (choice === "theirs") out.push(...chunk.theirs);
        else if (choice === "both") out.push(...chunk.ours, ...chunk.theirs);
        else out.push(...lines.slice(start, chunk.endLine));
        cursor = chunk.endLine;
    });
    out.push(...lines.slice(cursor));
    return out.join("\n");
}

type Choice = "ours" | "theirs" | "both" | null;

/* ── Small presentational pieces ───────────────────────────────── */

function CodeRow({
                     n,
                     text,
                     className,
                 }: {
    n: number;
    text: string;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start gap-2 px-2 font-mono text-xs leading-5", className)}>
      <span
          className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70 select-none"
          aria-hidden="true"
      >
        {n}
      </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {text === "" ? "\u00a0" : text}
      </span>
        </div>
    );
}

function ContextBlock({
                          section,
                          sectionKey,
                          expanded,
                          onToggle,
                      }: {
    section: ContextSection;
    sectionKey: number;
    expanded: boolean;
    onToggle: (key: number) => void;
}) {
    const lines = section.lines;
    // ±3 lines: runs of six or fewer are shown whole.
    if (lines.length <= 6) {
        return (
            <div className="rounded-md border border-border/60 bg-muted/10 py-1">
                {lines.map((line, k) => (
                    <CodeRow
                        key={k}
                        n={section.startLine + k}
                        text={line}
                        className="text-muted-foreground/70"
                    />
                ))}
            </div>
        );
    }
    const hidden = lines.length - 6;
    // Rows carry their own source line numbers — the collapsed tail
    // must keep the ORIGINAL numbering, not its slot in the window.
    const rows: Array<{ n: number; text: string } | { expander: true }> = expanded
        ? lines.map((text, i) => ({n: section.startLine + i, text}))
        : [
            ...lines.slice(0, 3).map((text, i) => ({n: section.startLine + i, text})),
            {expander: true as const},
            ...lines.slice(-3).map((text, i) => ({
                n: section.startLine + lines.length - 3 + i,
                text,
            })),
        ];
    return (
        <div className="rounded-md border border-border/60 bg-muted/10 py-1">
            {rows.map((row, k) =>
                "expander" in row ? (
                    <button
                        key={`exp-${k}`}
                        type="button"
                        onClick={() => onToggle(sectionKey)}
                        aria-expanded={expanded}
                        aria-label={`${hidden} hidden context lines`}
                        className="mx-auto my-1 flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                        <ChevronDown className="size-3"/>
                        {hidden} more lines
                    </button>
                ) : (
                    <CodeRow
                        key={k}
                        n={row.n}
                        text={row.text}
                        className="text-muted-foreground/70"
                    />
                )
            )}
            {expanded && (
                <button
                    type="button"
                    onClick={() => onToggle(sectionKey)}
                    aria-label="Collapse context lines"
                    className="mx-auto my-1 flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                    <ChevronUp className="size-3"/>
                    collapse
                </button>
            )}
        </div>
    );
}

function ChunkCard({
                       chunk,
                       chunkIndex,
                       choice,
                       onChoose,
                       registerRef,
                   }: {
    chunk: ConflictChunk;
    chunkIndex: number;
    choice: Choice;
    onChoose: (index: number, choice: Exclude<Choice, null>) => void;
    registerRef: (index: number, el: HTMLElement | null) => void;
}) {
    // First line numbers of each side — the marker lines sit between.
    const oursFirst = chunk.startLine + 1;
    const baseMarkerLine = chunk.base !== null ? oursFirst + chunk.ours.length : 0;
    const separatorLine = chunk.base !== null
        ? baseMarkerLine + chunk.base.length + 1
        : oursFirst + chunk.ours.length;
    const theirsFirst = separatorLine + 1;
    return (
        <article
            ref={(el) => registerRef(chunkIndex, el)}
            className="overflow-hidden rounded-md border border-border bg-card"
        >
            <header
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-xs font-medium">Conflict {chunkIndex + 1}</span>
                    <span className="text-[10px] text-muted-foreground">
            lines {chunk.startLine}–{chunk.endLine}
          </span>
                    {choice !== null && (
                        <Badge
                            className="border-transparent bg-emerald-500/15 text-emerald-700 text-[10px] dark:text-emerald-300">
                            resolved: {choice}
                        </Badge>
                    )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onChoose(chunkIndex, "ours")}
                        aria-label={`Accept ours for conflict ${chunkIndex + 1}`}
                    >
                        Accept Ours
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onChoose(chunkIndex, "theirs")}
                        aria-label={`Accept theirs for conflict ${chunkIndex + 1}`}
                    >
                        Accept Theirs
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onChoose(chunkIndex, "both")}
                        aria-label={`Accept both sides for conflict ${chunkIndex + 1}`}
                    >
                        Accept Both
                    </Button>
                </div>
            </header>
            <div className="flex flex-col py-1">
                {chunk.ours.map((line, k) => (
                    <CodeRow
                        key={`ours-${k}`}
                        n={oursFirst + k}
                        text={line}
                        className="border-l-2 border-emerald-500 bg-emerald-500/5"
                    />
                ))}
                {chunk.base !== null &&
                    chunk.base.map((line, k) => (
                        <CodeRow
                            key={`base-${k}`}
                            n={baseMarkerLine + 1 + k}
                            text={line}
                            className="border-l-2 border-muted-foreground/30 bg-muted/20"
                        />
                    ))}
                {chunk.theirs.map((line, k) => (
                    <CodeRow
                        key={`theirs-${k}`}
                        n={theirsFirst + k}
                        text={line}
                        className="border-l-2 border-sky-500 bg-sky-500/5"
                    />
                ))}
            </div>
        </article>
    );
}

/* ── The dialog ────────────────────────────────────────────────── */

export interface MergeEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** File being resolved — shown in the header. */
    fileName: string;
    /** Conflicted file text (with git conflict markers). */
    content: string;
    /** Optional common-ancestor text — feeds the Base column summary
     *  in the three-column header; per-chunk base lines come from the
     *  markers' `|||||||` sections when the merge kept them. */
    baseContent?: string;
    /** Receives the final, marker-free resolved content. */
    onResolved: (resolvedContent: string) => void;
    /** Optional side labels, e.g. "HEAD" / "feature/auth". */
    theirsLabel?: string;
    oursLabel?: string;
}

export function MergeEditor({
                                open,
                                onOpenChange,
                                fileName,
                                content,
                                baseContent,
                                onResolved,
                                theirsLabel,
                                oursLabel,
                            }: MergeEditorProps) {
    const chunks = React.useMemo(() => parseConflicts(content), [content]);
    const sections = React.useMemo(
        () => buildSections(content, chunks),
        [content, chunks]
    );

    const [choices, setChoices] = React.useState<Choice[]>([]);
    const [resultText, setResultText] = React.useState(content);
    const [manualEdits, setManualEdits] = React.useState(false);
    const [currentChunk, setCurrentChunk] = React.useState(0);
    const [expandedCtx, setExpandedCtx] = React.useState<Set<number>>(new Set());
    // <article> elements type as plain HTMLElement — match that here.
    const chunkRefs = React.useRef<Array<HTMLElement | null>>([]);

    // Fresh state every time the dialog (re)opens or the file changes —
    // previous choices never leak into a new merge.
    React.useEffect(() => {
        if (!open) return;
        setChoices(chunks.map(() => null));
        setResultText(content);
        setManualEdits(false);
        setCurrentChunk(0);
        setExpandedCtx(new Set());
    }, [open, content, chunks]);

    // Marker blocks left in the live result text (drives the badge +
    // the disabled state; hand edits are trusted as manual resolution).
    const remaining = React.useMemo(
        () => parseConflicts(resultText).length,
        [resultText]
    );
    const canResolve = remaining === 0 || manualEdits;

    const registerRef = React.useCallback(
        (index: number, el: HTMLElement | null) => {
            chunkRefs.current[index] = el;
        },
        []
    );

    // Prev/next navigation keeps the target chunk in view.
    React.useEffect(() => {
        if (!open || chunks.length === 0) return;
        const el = chunkRefs.current[currentChunk];
        if (el) {
            el.scrollIntoView({block: "center", behavior: "smooth"});
        }
    }, [currentChunk, open, chunks.length]);

    const toggleContext = React.useCallback((key: number) => {
        setExpandedCtx((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const applyChoice = (index: number, choice: Exclude<Choice, null>) => {
        const chunk = chunks[index];
        if (!chunk) return;
        const chosen =
            choice === "ours"
                ? chunk.ours
                : choice === "theirs"
                    ? chunk.theirs
                    : [...chunk.ours, ...chunk.theirs];
        const nextChoices = choices.slice();
        nextChoices[index] = choice;
        setChoices(nextChoices);

        if (!manualEdits) {
            // Clean path: the result stays a pure function of (content, choices).
            setResultText(buildResult(content, chunks, nextChoices));
        } else {
            // Hand-edited result: splice just this chunk's marker block so
            // the user's edits elsewhere survive. The unresolved blocks in
            // the edited text map 1:1 onto unresolved chunks — verify that
            // before trusting an index.
            const blocks = parseConflicts(resultText);
            const prevUnresolved = choices.filter((c) => c === null).length;
            const blockIdx = choices.slice(0, index + 1).filter((c) => c === null).length - 1;
            const block = blocks.length === prevUnresolved && blockIdx >= 0 ? blocks[blockIdx] : undefined;
            if (block) {
                const lines = resultText.split("\n");
                lines.splice(block.startLine - 1, block.endLine - block.startLine + 1, ...chosen);
                setResultText(lines.join("\n"));
            } else {
                // Marker blocks were hand-mangled — deterministic recompute.
                setResultText(buildResult(content, chunks, nextChoices));
            }
        }

        // Auto-advance to the next unresolved chunk (wrap back once).
        let next = index + 1;
        while (next < chunks.length && nextChoices[next] !== null) next++;
        if (next >= chunks.length) {
            let first = 0;
            while (first < index && nextChoices[first] !== null) first++;
            setCurrentChunk(first < index ? first : index);
        } else {
            setCurrentChunk(next);
        }
    };

    const markResolved = () => {
        // onResolved always receives marker-free text: after a manual
        // resolution leftover marker lines are dropped (their content
        // lines are kept — the user already chose what stays).
        let finalText = resultText;
        if (parseConflicts(finalText).length > 0) {
            finalText = finalText
                .split("\n")
                .filter((line) => !isMarkerLine(line))
                .join("\n");
        }
        onOpenChange(false);
        onResolved(finalText);
    };

    const oursLines = chunks.reduce((n, c) => n + c.ours.length, 0);
    const theirsLines = chunks.reduce((n, c) => n + c.theirs.length, 0);
    const baseLines = chunks.reduce((n, c) => n + (c.base?.length ?? 0), 0);
    const hasMarkerBase = chunks.some((c) => c.base !== null);
    const resolvedCount = choices.filter((c) => c !== null).length;

    const headerCell =
        "rounded-md border border-border bg-muted/30 px-2.5 py-1.5 min-w-0";
    const headerLabel =
        "truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
    const headerCount = "text-xs font-medium tabular-nums";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-3 p-4 sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="truncate">Merge conflicts — {fileName}</DialogTitle>
                    <DialogDescription>
                        Pick a side per conflict (or accept both), hand-tune the result
                        below, then mark the file resolved.
                    </DialogDescription>
                </DialogHeader>

                {chunks.length === 0 ? (
                    /* Clean file — nothing to resolve. */
                    <div
                        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
                        <CircleCheck className="size-6 text-emerald-500"/>
                        <p className="text-xs font-medium">
                            No conflict markers found — this file is clean
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {fileName} can be saved as-is.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Chunk navigation */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-7"
                                    disabled={currentChunk === 0}
                                    onClick={() => setCurrentChunk((c) => Math.max(0, c - 1))}
                                    aria-label="Previous conflict"
                                >
                                    <ChevronUp className="size-3.5"/>
                                </Button>
                                <span
                                    className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
                                    aria-live="polite"
                                >
                  {currentChunk + 1} / {chunks.length}
                </span>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-7"
                                    disabled={currentChunk >= chunks.length - 1}
                                    onClick={() =>
                                        setCurrentChunk((c) => Math.min(chunks.length - 1, c + 1))
                                    }
                                    aria-label="Next conflict"
                                >
                                    <ChevronDown className="size-3.5"/>
                                </Button>
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums">
                {resolvedCount} of {chunks.length} resolved
              </span>
                        </div>

                        {/* Three-column header: Ours / Base / Theirs */}
                        <div className="grid grid-cols-3 gap-2" aria-label="Merge sides">
                            <div className={cn(headerCell, "border-l-2 border-l-emerald-500")}>
                                <div className={headerLabel} title={oursLabel}>
                                    Ours{oursLabel ? ` · ${oursLabel}` : ""}
                                </div>
                                <div className={headerCount}>{oursLines} lines</div>
                            </div>
                            <div className={cn(headerCell, "border-l-2 border-l-muted-foreground/40")}>
                                <div className={headerLabel}>Base</div>
                                <div className={headerCount}>
                                    {baseLines} lines
                                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    {hasMarkerBase
                        ? "in markers"
                        : baseContent
                            ? "ancestor given"
                            : "none"}
                  </span>
                                </div>
                            </div>
                            <div className={cn(headerCell, "border-l-2 border-l-sky-500")}>
                                <div className={headerLabel} title={theirsLabel}>
                                    Theirs{theirsLabel ? ` · ${theirsLabel}` : ""}
                                </div>
                                <div className={headerCount}>{theirsLines} lines</div>
                            </div>
                        </div>

                        {/* One-column chunk list with dimmed context runs */}
                        <div
                            className="flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1"
                            role="list"
                            aria-label="Conflicts and context"
                        >
                            {sections.map((section, i) =>
                                section.type === "chunk" ? (
                                    <div role="listitem" key={`chunk-${section.index}`}>
                                        <ChunkCard
                                            chunk={chunks[section.index]}
                                            chunkIndex={section.index}
                                            choice={choices[section.index] ?? null}
                                            onChoose={applyChoice}
                                            registerRef={registerRef}
                                        />
                                    </div>
                                ) : (
                                    <div role="listitem" key={`ctx-${i}`}>
                                        <ContextBlock
                                            section={section}
                                            sectionKey={i}
                                            expanded={expandedCtx.has(i)}
                                            onToggle={toggleContext}
                                        />
                                    </div>
                                )
                            )}
                        </div>

                        {/* Editable result */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-baseline justify-between">
                                <span className="text-xs font-medium">Result</span>
                                <span className="text-[10px] text-muted-foreground">
                  editable — hand-tune before saving
                </span>
                            </div>
                            <textarea
                                value={resultText}
                                onChange={(e) => {
                                    setResultText(e.target.value);
                                    setManualEdits(true);
                                }}
                                spellCheck={false}
                                aria-label={`Resolved content of ${fileName}`}
                                className="h-40 w-full resize-y rounded-md border border-input bg-muted/20 p-3 font-mono text-xs leading-5 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/20"
                            />
                        </div>

                        {/* Resolution bar */}
                        <div
                            className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                            <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs">
                                {remaining === 0 ? (
                                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CircleCheck className="size-3.5"/> all conflicts resolved
                  </span>
                                ) : manualEdits ? (
                                    <span className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-[10px] tabular-nums">
                      {remaining}
                    </Badge>
                    <span className="text-amber-600 dark:text-amber-400">
                      manual resolution — leftover markers will be dropped
                    </span>
                  </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Badge variant="destructive" className="text-[10px] tabular-nums">
                      {remaining}
                    </Badge>
                    unresolved conflicts remain
                  </span>
                                )}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                disabled={!canResolve}
                                onClick={markResolved}
                                aria-label={`Mark ${fileName} resolved`}
                                className="bg-emerald-600 text-white shadow-xs hover:bg-emerald-500"
                            >
                                <Check className="size-3.5"/> Mark resolved
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
