"use client";

/**
 * breadcrumbs-bar.tsx — the slim symbol-path bar (module > class >
 * function) for the active caret line.
 *
 * Designed to mount above the code viewer in page.tsx (see the wiring
 * notes at the bottom of this file — the lead owns page.tsx):
 *
 *   <BreadcrumbsBar
 *     symbols={codeViewerRef.current?.getSymbols() ?? symbolsForFile}
 *     caretLine={cursorPos?.line}
 *     fileName={selectedFile?.name}
 *     onGotoLine={(line) => codeViewerRef.current?.jumpToLine(line)}
 *     visible={settings.showBreadcrumbs !== false}
 *   />
 *
 * Navigation output — BOTH channels work, use either or both:
 *   · callback:  onGotoLine(line, symbolName?)
 *   · window event "PRAXIS_GOTO_LINE"  detail {line, symbol?, fileId?}
 *   · window event "praxis:goto-line"   detail {line}
 * The third one is the app's EXISTING goto-line event (the page already
 * listens and jumps the current file) — dispatched from the crumb click
 * so the bar navigates TODAY with zero page wiring; PRAXIS_GOTO_LINE is
 * the documented primary name for richer detail consumers.
 *
 * Perf contract: the caret moves on every keystroke, so the path is
 * derived in ONE cheap useMemo (indent-stack walk over the already
 * parsed symbol list — no re-parsing here) and nothing else re-renders.
 */

import * as React from "react";
import {ChevronRight} from "lucide-react";
import {cn} from "@/lib/utils";
import {type Breadcrumb, symbolPathAtLine} from "@/lib/breadcrumbs";
import type {PythonSymbol} from "@/lib/python-symbols";

export interface BreadcrumbsBarProps {
    /** Symbol index for the ACTIVE file (parsePythonSymbols output — the
     *  same list the symbol palette uses; re-parsed by the owner, not here). */
    symbols?: PythonSymbol[];
    /** Active caret line (1-based). null/undefined = module-only bar. */
    caretLine?: number | null;
    /** Opaque file identity carried on the emitted event (for multi-file
     *  consumers distinguishing which file the jump targets). */
    fileId?: string | null;
    /** File name for the module crumb (basename is displayed). */
    fileName?: string;
    /** Jump callback — receives the crumb's definition line. */
    onGotoLine?: (line: number, symbolName?: string) => void;
    /** Settings toggle binding (defaults true). */
    visible?: boolean;
    className?: string;
}

export function BreadcrumbsBar({
                                   symbols,
                                   caretLine,
                                   fileId,
                                   fileName,
                                   onGotoLine,
                                   visible = true,
                                   className,
                               }: BreadcrumbsBarProps) {
    const crumbs = React.useMemo<Breadcrumb[]>(
        () => symbolPathAtLine(symbols ?? [], caretLine, fileName),
        [symbols, caretLine, fileName]
    );

    if (!visible) return null;
    if (crumbs.length === 0) {
        // No file context at all — keep the 24px strip reserved so the
        // layout doesn't jump when a file opens, with a muted placeholder.
        return (
            <div
                className={cn(
                    "h-6 flex items-center overflow-hidden text-[11px] font-mono text-muted-foreground/60 px-2 select-none",
                    className
                )}
                aria-hidden="true"
            >
                —
            </div>
        );
    }

    const goto = (crumb: Breadcrumb) => {
        onGotoLine?.(crumb.line, crumb.symbol?.name);
        // Documented primary event (carries symbol + file identity).
        window.dispatchEvent(
            new CustomEvent("PRAXIS_GOTO_LINE", {
                detail: {line: crumb.line, symbol: crumb.symbol?.name, fileId: fileId ?? undefined},
            })
        );
        // The app's existing goto-line channel — jumps the current file
        // TODAY (page.tsx already listens), so the bar needs no wiring.
        window.dispatchEvent(
            new CustomEvent("praxis:goto-line", {detail: {line: crumb.line}})
        );
    };

    return (
        <nav
            aria-label="Symbol path"
            className={cn(
                "h-6 flex items-center overflow-hidden text-[11px] font-mono select-none",
                className
            )}
        >
            {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                    <React.Fragment key={`${crumb.kind}-${crumb.label}-${crumb.line}`}>
                        {i > 0 && (
                            <ChevronRight
                                className="size-3 shrink-0 text-muted-foreground/60"
                                aria-hidden="true"
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => goto(crumb)}
                            title={`Go to line ${crumb.line}`}
                            aria-label={
                                crumb.kind === "module"
                                    ? `Module ${crumb.label} — line 1`
                                    : `${crumb.kind} ${crumb.label} — line ${crumb.line}`
                            }
                            className={cn(
                                // The LAST crumb (current scope) never truncates so the
                                // user always sees where they are; earlier crumbs absorb
                                // overflow with ellipsis.
                                "rounded px-1.5 py-0.5 max-w-44 truncate transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                last
                                    ? "text-foreground font-medium shrink-0 max-w-56"
                                    : "text-muted-foreground hover:text-foreground",
                                crumb.kind === "module" && !last && "shrink-0"
                            )}
                        >
                            {crumb.label}
                        </button>
                    </React.Fragment>
                );
            })}
        </nav>
    );
}
