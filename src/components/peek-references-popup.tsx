"use client";

/**
 * peek-references-popup.tsx — the ⇧F12 "peek references" popup.
 *
 * A compact, self-contained popup anchored near the caret inside the
 * CodeViewer (the host positions it absolutely in the viewer's root —
 * the same anchoring the Ctrl+I inline AI card uses). It lists every
 * project-wide reference for the word under the caret:
 *
 *   file + line + the matched snippet line, click to jump, Esc or a
 *   click outside closes.
 *
 * DATA: fetchReferences (lib/peek-references) hits the SAME
 * /api/full-text-search endpoint the Find Usages dialog and the
 * Go-to-declaration handler use — one references "data machinery"
 * for the whole app, so the popup's list is exactly what ⌥F7 shows.
 * Since Phase 3 the host may instead pass `hitsOverride` — SEMANTIC
 * references from the Pyright sidecar (⇧F12 asks the LSP first); when
 * present the popup skips its fetch and shows those verbatim (the
 * same ReferenceHit shape, so rendering and jumping never branch).
 *
 * JUMP semantics (onJump is provided by the host):
 *   • reference in the CURRENT file → the viewer jumps internally
 *     (jumpToLine);
 *   • reference in another file → the host dispatches the
 *     praxis:open-reference window event; page.tsx's listener (see
 *     lib/peek-references' header for the 8-line wiring) performs the
 *     guarded file switch + line jump. Until that listener exists,
 *     same-file references still jump and the row shows where the hit
 *     lives.
 *
 * Everything DOM lives here so the viewer only supplies symbol +
 * anchor + identity; the fetch/abort lifecycle is owned by the popup.
 */

import * as React from "react";
import {FileCode2, Loader2, Search, X} from "lucide-react";
import {cn} from "@/lib/utils";
import {fetchReferences, hitIsCurrentFile, type ReferenceHit,} from "@/lib/peek-references";

export interface PeekReferencesPopupProps {
    /** The symbol whose references are shown. */
    symbol: string;
    /** Absolute coordinates in the host's positioning context (the
     *  viewer's relative root) — near the caret line. */
    anchor: { top: number; left: number };
    /** The file the popup is peeking FROM (same-file hits jump
     *  internally). */
    currentFile: { folderSlug?: string; fileSlug?: string };
    /** Semantic (Pyright LSP) references — when provided, shown verbatim
     *  instead of the full-text-search fetch (the ⇧F12 LSP-first path). */
    hitsOverride?: ReferenceHit[];
    /** Close (Esc, click-outside, ×, or after a jump). */
    onClose: () => void;
    /** Jump to one reference (the host decides same-file vs
     *  cross-file routing). */
    onJump: (hit: ReferenceHit) => void;
}

export function PeekReferencesPopup({
                                        symbol,
                                        anchor,
                                        currentFile,
                                        hitsOverride,
                                        onClose,
                                        onJump,
                                    }: PeekReferencesPopupProps) {
    const [hits, setHits] = React.useState<ReferenceHit[] | null>(null);
    const [loading, setLoading] = React.useState(true);
    const cardRef = React.useRef<HTMLDivElement | null>(null);

    // Fetch on open (abortable — reopening for another word cancels the
    // previous request; a symbol change while mounted never stacks).
    // Semantic hits (hitsOverride) skip the fetch entirely.
    React.useEffect(() => {
        // The semantic path — no fetch, no abort bookkeeping.
        if (hitsOverride) {
            setHits(hitsOverride);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        setHits(null);
        void (async () => {
            const found = await fetchReferences(symbol, {
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setHits(found);
            setLoading(false);
        })();
        return () => controller.abort();
        // hitsOverride is read once per open by design (the host passes it
        // at open time; changing it mid-open would fight the user's reading
        // position) — hence the deliberate partial dependency list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, hitsOverride]);

    // Esc closes; a click anywhere OUTSIDE the popup closes it too. Both
    // listeners only ever close (never preventDefault), so they can't
    // interfere with the editor's own key/click handling. Capture-phase
    // so the popup sees the event before any editor handler could stop
    // its propagation.
    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        };
        const onPointerDown = (e: PointerEvent) => {
            if (
                cardRef.current &&
                e.target instanceof Node &&
                !cardRef.current.contains(e.target)
            ) {
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("pointerdown", onPointerDown, {capture: true});
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("pointerdown", onPointerDown, true);
        };
    }, [onClose]);

    const total = hits?.length ?? 0;
    const currentFileCount = hits
        ? hits.filter((h) => hitIsCurrentFile(h, currentFile)).length
        : 0;

    return (
        <div
            ref={cardRef}
            role="dialog"
            aria-label={`References to ${symbol}`}
            className="z-40 w-[400px] max-w-[92vw] rounded-lg border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur"
            style={{top: anchor.top, left: anchor.left}}
            // Clicks inside the popup must not reach the editor underneath.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
                <Search className="size-3.5 shrink-0 text-primary" aria-hidden/>
                <span className="truncate text-xs font-semibold">
          References — <span className="font-mono">{symbol}</span>
        </span>
                {!loading && (
                    <span
                        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border bg-background/60 px-1.5 py-0.5 text-[10px] font-mono">
            {total}
                        {total > 0 && currentFileCount > 0 && (
                            <span className="text-muted-foreground">· {currentFileCount} here</span>
                        )}
          </span>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Close references popup"
                    title="Close (Esc)"
                >
                    <X className="size-3.5" aria-hidden/>
                </button>
            </div>

            {/* Body — the compact scrollable reference list. Long-list
          handling: max-h + overflow-y-auto keeps dozens of hits inside
          the popup's footprint. */}
            <div className="max-h-[264px] overflow-y-auto">
                {loading && (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin text-emerald-500" aria-label="Searching references"/>
                        Searching references…
                    </div>
                )}
                {!loading && total === 0 && (
                    <p className="px-3 py-4 text-xs text-muted-foreground">
                        No references found for <span className="font-mono">{symbol}</span>.
                    </p>
                )}
                {!loading &&
                    hits?.map((hit, i) => {
                        const inCurrentFile = hitIsCurrentFile(hit, currentFile);
                        return (
                            <button
                                key={`${hit.folderSlug}/${hit.fileSlug}:${hit.line}:${i}`}
                                type="button"
                                onClick={() => {
                                    onJump(hit);
                                    onClose();
                                }}
                                className="flex w-full items-start gap-2 border-b border-border/40 px-3 py-1.5 text-left text-[11px] transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                                title={`Open ${hit.file} at line ${hit.line}`}
                            >
                                <FileCode2
                                    className={cn(
                                        "size-3.5 shrink-0 mt-0.5",
                                        inCurrentFile ? "text-emerald-500" : "text-muted-foreground"
                                    )}
                                    aria-hidden
                                />
                                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {hit.file || hit.fileSlug}
                    </span>
                    <span className="shrink-0 rounded-sm border px-1 font-mono text-[9px] text-muted-foreground">
                      L{hit.line}
                    </span>
                      {!inCurrentFile && (
                          <span className="shrink-0 truncate text-[9px] text-muted-foreground/70">
                        {hit.folder || hit.folderSlug}
                      </span>
                      )}
                  </span>
                                    {hit.snippet && (
                                        <span
                                            className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                      {hit.snippet}
                    </span>
                                    )}
                </span>
                            </button>
                        );
                    })}
            </div>

            {/* Footer hint */}
            <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                Esc or click outside to close · same-file rows jump directly
            </div>
        </div>
    );
}
