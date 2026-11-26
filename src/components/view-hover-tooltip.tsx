"use client";

import * as React from "react";
import {cn} from "@/lib/utils";
import type {CodeViewerProps} from "@/components/code-viewer-types";

export interface ViewHoverTooltipProps {
    /** The derived hover card content. */
    hoverTip: { kind: "diag" | "symbol" | "lsp"; title: string; body: string | undefined; line: number } | null;
    /** True in edit mode (tooltip is view-only). */
    editMode: boolean;
    /** Raw line → display-row top. */
    viewRowTopOf: (rawLine: number) => number | null;
    /** Raw line → y position fallback. */
    lineTop: (line: number) => number;
    /** One row's height in px. */
    lineHeightPx: number;
    /** mypy-revealed types (reveal_type). */
    typeSymbols: CodeViewerProps["typeSymbols"];
    /** Left offset where code text starts. */
    codeLeftOffsetPx: number;
}

export function ViewHoverTooltip(props: ViewHoverTooltipProps) {
    const {
        hoverTip,
        editMode,
        viewRowTopOf,
        lineTop,
        lineHeightPx,
        typeSymbols,
        codeLeftOffsetPx,
    } = props;
    return (
        <>
            {/* ─── FLOATING HOVER TOOLTIP (view mode) ─────────────
    One shared card for diagnostics (message), symbol hovers
    (signature + first docstring line), and — when the typecheck
    tool ran — the mypy-revealed type of a reveal_type() call on
    the hovered line (Settings → Python → Type checking). It is
    derived from hoverTipLine — it re-renders per LINE crossing,
    never per mouse pixel — and it is pointer-events-none so it
    can never block selection. Replaces the old native-title
    strips/squiggles that swallowed mousedown. */}
            {hoverTip && !editMode && (() => {
                const rowTop = viewRowTopOf(hoverTip.line) ?? lineTop(hoverTip.line);
                const tipTop = rowTop + lineHeightPx + 6;
                const revealed = (typeSymbols ?? []).find((t) => t.line === hoverTip.line);
                return (
                    <div
                        className="pointer-events-none absolute z-40 w-72 rounded-md border bg-popover/95 px-2.5 py-1.5 text-popover-foreground shadow-lg backdrop-blur"
                        style={{
                            top: `${tipTop}px`,
                            left: `${Math.max(8, codeLeftOffsetPx)}px`,
                            fontFamily: "var(--font-jb-mono), monospace",
                        }}
                        role="status"
                    >
                        <p className={cn("text-[11px] leading-snug", hoverTip.kind === "diag" ? "text-red-500" : "text-foreground")}>
                            {hoverTip.title}
                        </p>
                        {hoverTip.body && (
                            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                                {hoverTip.body}
                            </p>
                        )}
                        {/* The Pyright-sourced card carries a tiny source badge so the
          user can tell the semantic hover from the offline symbol scan. */}
                        {hoverTip.kind === "lsp" && (
                            <p className="mt-0.5 text-[9px] leading-none text-muted-foreground/70">
                                pyright
                            </p>
                        )}
                        {revealed && (
                            <p className="mt-0.5 text-[10px] leading-snug text-sky-600 dark:text-sky-400"
                               title="mypy — revealed type">
                                {revealed.name}: {revealed.type}
                            </p>
                        )}
                    </div>
                );
            })()}
        </>
    );
}
