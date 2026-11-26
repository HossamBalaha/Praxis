"use client";

import * as React from "react";
import {ChevronDown} from "lucide-react";
import {formatSymbol, type PythonSymbol} from "@/lib/python-symbols";

export const StickyScrollHeader = React.memo(function StickyScrollHeader({
                                                                             scrollRef,
                                                                             symbols,
                                                                             active,
                                                                             codeTop,
                                                                             rowH,
                                                                             codeBg,
                                                                             isDark,
                                                                             fontSize,
                                                                             letterSpacing,
                                                                             onJump,
                                                                             interactive = true,
                                                                         }: {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    symbols: PythonSymbol[];
    active: boolean;
    codeTop: number;
    rowH: number;
    codeBg: string;
    isDark: boolean;
    fontSize: number;
    letterSpacing: number;
    /** Jump-to-definition handler (interactive bars only). */
    onJump?: (line: number) => void;
    /** false = pointer-events-none presentation bar (edit mode — the
     *  bar must never take a click/focus away from the textarea). */
    interactive?: boolean;
}) {
    const [symbol, setSymbol] = React.useState<PythonSymbol | null>(null);
    const symbolRef = React.useRef<PythonSymbol | null>(null);
    const rafRef = React.useRef<number | null>(null);

    const apply = React.useCallback(
        (scrollTop: number) => {
            const line = Math.max(1, Math.floor(Math.max(0, scrollTop - codeTop) / Math.max(1, rowH)) + 1);
            const inBlock = (s: PythonSymbol) =>
                s.line <= line &&
                (s.endLine ?? Number.MAX_SAFE_INTEGER) >= line &&
                (s.type === "class" || s.type === "function" || s.type === "method");
            // Innermost = deepest indent among containing def/class blocks.
            let best: PythonSymbol | null = null;
            for (const s of symbols) {
                if (!inBlock(s)) continue;
                if (!best || s.indent > best.indent || (s.indent === best.indent && s.line > best.line)) {
                    best = s;
                }
            }
            // Only pin when the header line itself has scrolled ABOVE the
            // first visible line (VS Code behavior — no pin at file top).
            if (best && best.line >= line) best = null;
            if (best !== symbolRef.current) {
                symbolRef.current = best;
                setSymbol(best);
            }
        },
        [symbols, codeTop, rowH]
    );

    React.useEffect(() => {
        const sc = scrollRef.current;
        if (!sc || !active) {
            if (symbolRef.current !== null) {
                symbolRef.current = null;
                setSymbol(null);
            }
            return;
        }
        const onScroll = () => {
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                apply(scrollRef.current?.scrollTop ?? 0);
            });
        };
        sc.addEventListener("scroll", onScroll, {passive: true});
        // Recompute after layout-affecting changes (expand/collapse,
        // symbol refresh, font-size changes) — no scroll event
        // accompanies those, so the pinned bar would linger stale.
        apply(sc.scrollTop);
        return () => {
            sc.removeEventListener("scroll", onScroll);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [active, apply, scrollRef]);

    if (!symbol) return null;
    if (!interactive) {
        // Edit mode: the same overlay + styling, but nothing is clickable —
        // pointer events fall through to the textarea underneath.
        return (
            <div className="sticky top-0 z-30 h-0 pointer-events-none">
                <div
                    aria-hidden="true"
                    className="absolute left-0 right-0 flex items-center gap-2 px-3 border-b text-left pointer-events-none"
                    style={{
                        height: `${rowH}px`,
                        background: codeBg,
                        borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
                        fontFamily: "var(--font-jb-mono), monospace",
                        fontSize: `${fontSize / 16}rem`,
                        ...(letterSpacing ? {letterSpacing: `${letterSpacing}px`} : null),
                        color: isDark ? "#abb2bf" : "#383a42",
                    }}
                >
                    <ChevronDown className="size-3 shrink-0 -rotate-90 text-muted-foreground"/>
                    <span className="truncate">{formatSymbol(symbol)}</span>
                    {symbol.docstring && (
                        <span className="truncate text-muted-foreground/70 hidden md:inline">
              — {symbol.docstring}
            </span>
                    )}
                    <span className="ml-auto text-[9px] text-muted-foreground shrink-0 font-mono">
            L{symbol.line}
          </span>
                </div>
            </div>
        );
    }
    return (
        <div className="sticky top-0 z-30 h-0 pointer-events-none">
            <button
                type="button"
                onClick={() => onJump?.(symbol.line)}
                className="pointer-events-auto absolute left-0 right-0 flex items-center gap-2 px-3 border-b text-left"
                style={{
                    height: `${rowH}px`,
                    background: codeBg,
                    borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
                    fontFamily: "var(--font-jb-mono), monospace",
                    fontSize: `${fontSize / 16}rem`,
                    ...(letterSpacing ? {letterSpacing: `${letterSpacing}px`} : null),
                    color: isDark ? "#abb2bf" : "#383a42",
                }}
                title={`${formatSymbol(symbol)} — line ${symbol.line} (click to jump)`}
            >
                <ChevronDown className="size-3 shrink-0 -rotate-90 text-muted-foreground"/>
                <span className="truncate">{formatSymbol(symbol)}</span>
                {symbol.docstring && (
                    <span className="truncate text-muted-foreground/70 hidden md:inline">
            — {symbol.docstring}
          </span>
                )}
                <span className="ml-auto text-[9px] text-muted-foreground shrink-0 font-mono">
          L{symbol.line}
        </span>
            </button>
        </div>
    );
});
