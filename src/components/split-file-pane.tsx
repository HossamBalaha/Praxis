"use client";
/**
 * split-file-pane — ONE independent split-view pane (Phase 2).
 *
 * Extracted from page.tsx alongside the split-pane engine
 * (src/layout/split-pane-engine.ts): the engine owns the pane MODEL,
 * the gutter topology and the resize math; THIS component is the pane
 * VIEW — it fetches its own file (Python via /api/code; every other
 * kind renders the FileViewer, which self-fetches) and never mirrors
 * the main editor. The header carries a per-pane file switcher (every
 * open tab), a "focus in editor" jump, and a close button.
 *
 * Pure-props component: zero page-scope dependencies, so it can be
 * unit-tested or reused without the 16k-line page.
 */
import * as React from "react";
import {Columns2, FileCode2, SquareArrowOutUpRight, X} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";
import {CodeViewer} from "@/components/code-viewer";
import {FileViewer} from "@/components/file-viewer";
import {PanelErrorBoundary} from "@/components/error-boundary";
import {EmptyState} from "@/components/empty-state";
import type {EditorTab, SplitTarget} from "@/components/editor-tabs";
import type {FileKind} from "@/lib/scripts";
import type {Settings} from "@/lib/settings";

/** One split-view pane: header (switcher/focus/close) + read-only body. */
export function SplitFilePane({
                                  target,
                                  paneIndex,
                                  fileKind,
                                  openTabs,
                                  settings,
                                  inlineDiagnostics,
                                  gitDiffLines,
                                  siblingImages,
                                  onChangeTarget,
                                  onClose,
                                  onFocusMain,
                                  basisPercent,
                              }: {
    target: SplitTarget;
    paneIndex: number;
    /** The target's FileKind, resolved by the parent from the folders
     *  list (the page cannot import the node-backed scripts lib). */
    fileKind: FileKind;
    openTabs: EditorTab[];
    settings: Settings;
    inlineDiagnostics?: Array<{ line: number; col?: number; message: string; severity: "error" | "warning" | "info" }>;
    gitDiffLines?: { added: number[]; modified: number[]; removed: number[] } | null | undefined;
    siblingImages: Array<{ fileName: string; fileSlug: string; src: string }>;
    onChangeTarget: (next: SplitTarget) => void;
    onClose: () => void;
    onFocusMain: () => void;
    /** This pane's PERCENT share of the pane group's box (width for a
     *  right split, height for a down split). Undefined only in the
     *  transitional frame where the sizes array trails the pane list; the
     *  pane then falls back to the equal-share flex-1 classes below. */
    basisPercent?: number;
}) {
    const isPython = /\.(py|pyw)$/i.test(target.fileName);
    // Python source for the pane — fetched ONCE per target (the pane is
    // read-only, so it never goes stale through edits).
    const [pyCode, setPyCode] = React.useState<string | null>(null);
    const [pyError, setPyError] = React.useState<string | null>(null);
    React.useEffect(() => {
        if (!isPython) {
            setPyCode(null);
            setPyError(null);
            return;
        }
        let cancelled = false;
        setPyCode(null);
        setPyError(null);
        void (async () => {
            try {
                const res = await fetch(
                    `/api/code?folder=${encodeURIComponent(target.folderSlug)}&file=${encodeURIComponent(target.fileSlug)}`
                );
                const data = await res.json();
                if (cancelled) return;
                if (res.ok && typeof data.content === "string") setPyCode(data.content);
                else setPyError(data.error ?? `HTTP ${res.status}`);
            } catch (err) {
                if (!cancelled) setPyError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isPython, target.folderSlug, target.fileSlug]);

    const switcherId = `${target.folderSlug}/${target.fileSlug}`;
    return (
        <div
            /* SPLIT-DOWN AUTO-FIT + SIZE SHARES: the pane's flex basis is its
               PERCENT share of the group (drag any gutter to move width
               between that pair — every pane participates), shrinking
               proportionally only for the few px the gutters themselves
               occupy. When no share is known yet the pane is an equal flex-1
               basis-0 share of the group's height (a single pane fills it
               entirely). The old max-h-[45%] cap left up to ~55% of the group
               as unused empty space below the pane — the "huge white space at
               the bottom when split down + show full code" report. Panes
               still always fit their content area. */
            className={cn(
                "flex flex-col min-w-0 min-h-0",
                typeof basisPercent !== "number" && "flex-1 basis-0"
            )}
            /* The percentage flex-basis replaces the equal-share classes:
               grow 0 (shares come from the gutters), shrink 1 (absorb the
               gutter px without wrapping). */
            style={typeof basisPercent === "number" ? {flex: `0 1 ${basisPercent}%`} : undefined}
            data-split-pane={paneIndex}
        >
            {/* Pane header — file switcher + focus + close. */}
            <div className="flex items-center justify-between gap-2 px-3 h-8 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
                    <FileCode2 className="size-3.5 shrink-0 text-emerald-500"/>
                    <select
                        value={switcherId}
                        onChange={(e) => {
                            const tab = openTabs.find((t) => t.id === e.target.value);
                            if (!tab) return;
                            onChangeTarget({
                                folderSlug: tab.folderSlug,
                                fileSlug: tab.fileSlug,
                                fileName: tab.fileName,
                                folderName: tab.folderName,
                            });
                        }}
                        className="max-w-52 truncate rounded border bg-background px-1 py-0.5 text-[11px] text-foreground"
                        title="Show a different open file in this pane"
                        aria-label={`File shown in split pane ${paneIndex + 1}`}
                    >
                        {/* The current target is always selectable, even when its
                tab was closed while the pane stays open. */}
                        {!openTabs.some((t) => t.id === switcherId) && (
                            <option value={switcherId}>{target.fileName}</option>
                        )}
                        {openTabs.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.fileName}
                            </option>
                        ))}
                    </select>
                    <Badge variant="secondary" className="text-[9px] px-1.5 shrink-0">
                        read-only
                    </Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[10px] gap-1"
                        onClick={onFocusMain}
                        title="Open this file in the main editor (keeps the pane)"
                    >
                        <SquareArrowOutUpRight className="size-3"/>
                        Focus
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={onClose}
                        aria-label="Close this split pane"
                        title="Close this split pane"
                    >
                        <X className="size-3.5"/>
                    </Button>
                </div>
            </div>
            {/* Pane body — independent of the main editor. */}
            <div className="flex-1 min-h-0 flex flex-col">
                {isPython ? (
                    pyError ? (
                        <EmptyState
                            icon={<Columns2 className="size-7"/>}
                            title="Could not load the file"
                            description={pyError}
                        />
                    ) : pyCode === null ? (
                        // Code-shaped skeleton — the same shape as the MAIN
                        // editor's loading skeleton (header bar + code-line
                        // bars), so split panes read consistently while their
                        // python content streams in (a single centered bar used
                        // to read as "nothing is loading").
                        <div className="flex flex-col h-full">
                            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                                <Skeleton className="size-4 rounded"/>
                                <div className="flex-1 space-y-1">
                                    <Skeleton className="h-3 w-32 rounded"/>
                                    <Skeleton className="h-2 w-20 rounded"/>
                                </div>
                                <Skeleton className="h-7 w-16 rounded"/>
                                <Skeleton className="h-7 w-16 rounded"/>
                            </div>
                            <div className="flex-1 px-4 py-3 space-y-2 overflow-hidden">
                                {Array.from({length: 10}).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Skeleton className="h-3 w-6 rounded shrink-0"/>
                                        <Skeleton
                                            className="h-3 rounded"
                                            style={{width: `${40 + Math.sin(i) * 30 + 30}%`}}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <PanelErrorBoundary label="Editor">
                            <CodeViewer
                                key={`split-${target.folderSlug}/${target.fileSlug}`}
                                fileName={target.fileName}
                                code={pyCode}
                                folderName={target.folderName}
                                folderSlug={target.folderSlug}
                                fileSlug={target.fileSlug}
                                aiEndpoints={settings.aiEndpoints}
                                codeSyntaxTheme={settings.codeSyntaxTheme}
                                wordWrap={settings.codeWordWrap}
                                collapsedByDefault={settings.codeCollapsedByDefault}
                                showLineNumbers={settings.showLineNumbers}
                                fontSize={settings.codeFontSize}
                                lineHeight={settings.codeLineHeight}
                                letterSpacing={settings.codeLetterSpacing}
                                rulerColumn={settings.rulerColumn}
                                rulerLineWidth={settings.rulerLineWidth}
                                rainbowBrackets={settings.rainbowBrackets}
                                indentWidth={settings.editorIndentWidth}
                                indentStyle={settings.indentStyle}
                                // Read-only reference view: no save hook, no run-cell, no
                                // AI actions — those stay in the main pane so the views
                                // never fight over one save flow.
                                showSymbolOutline={settings.showSymbolOutline}
                                diagnostics={inlineDiagnostics}
                                gitDiffLines={(settings.showGitDiffGutter ? gitDiffLines : undefined) ?? undefined}
                                codeFolding={settings.codeFolding}
                                showMinimap={settings.showMinimap}
                                webWorkerHighlighting={settings.webWorkerHighlighting}
                                pythonInterpreter={settings.pythonInterpreter}
                                highlightCurrentLine={settings.highlightCurrentLine}
                                hoverSymbolTooltips={settings.hoverSymbolTooltips}
                                showWhitespace={settings.showWhitespace}
                                maxLineLengthHint={settings.maxLineLengthHint}
                                showBlameGutter={settings.showBlameGutter}
                            />
                        </PanelErrorBoundary>
                    )
                ) : (
                    <FileViewer
                        fileName={target.fileName}
                        fileKind={fileKind}
                        folderSlug={target.folderSlug}
                        fileSlug={target.fileSlug}
                        codeSyntaxTheme={settings.codeSyntaxTheme}
                        siblingImages={siblingImages}
                        lineHeight={settings.codeLineHeight}
                        letterSpacing={settings.codeLetterSpacing}
                        rulerColumn={settings.rulerColumn}
                        rulerLineWidth={settings.rulerLineWidth}
                    />
                )}
            </div>
        </div>
    );
}
