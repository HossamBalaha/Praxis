"use client";

/**
 * MinimapColumn — the shared canvas minimap rail.
 *
 * Born inside file-viewer.tsx (the Markdown edit surface); now shared
 * with the Python editor's view mode (code-viewer.tsx), which used to
 * render a 2px-font <pre> showing the first 8,000 characters with no
 * viewport indicator and no click-to-scroll.
 *
 * A ~64px-wide canvas rail pinned to the RIGHT side of a scroll
 * container (pass its ref). Renders:
 *
 *   · one canvas pixel row per buffer line (density-squeezed when the
 *     file is taller than the rail), each line's bar gray-coded by its
 *     leading-whitespace bucket into 3 tones — the file's block
 *     structure reads at a glance (lib/minimap.ts owns the math),
 *   · a translucent viewport-indicator rectangle for the visible
 *     window, scroll-synced live,
 *   · CLICK-to-scroll (click Y → scroll ratio → the container's
 *     scrollTop, viewport centered on the click) and DRAG-to-scroll
 *     (pointer capture — the drag keeps steering while the pointer is
 *     outside the rail).
 *
 * Buffers over MINIMAP_MAX_LINES lines render a static "minimap off"
 * note instead, and the whole rail hides whenever the scroll container
 * is not scrollable.
 */

import * as React from "react";
import {
    MINIMAP_MAX_LINES,
    minimapLineStats,
    minimapLineY,
    minimapScrollTargetForRatio,
    minimapShouldRender,
    minimapViewportRect,
} from "@/lib/minimap";

export function MinimapColumn({
                                  scrollRef,
                                  text,
                                  dark,
                              }: {
    /** The scroll container to mirror + steer. */
    scrollRef: React.RefObject<HTMLDivElement | null>;
    /** The live buffer (drives the density rows). */
    text: string;
    dark: boolean;
}) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const draggingRef = React.useRef(false);
    // scroll-container geometry — read from the DOM (scroll events,
    // container resizes and the content div's growth via ResizeObserver).
    const [geo, setGeo] = React.useState({scrollTop: 0, scrollHeight: 1, clientHeight: 1});
    // the rail's own painted height (a resize of the column re-draws).
    const [railH, setRailH] = React.useState(0);

    // per-line density inputs — memoized so a render-per-keystroke
    // (the parent passes fresh `text`) only recomputes on real change.
    const stats = React.useMemo(() => minimapLineStats(text), [text]);
    const lineCount = stats.length;
    const withinCap = minimapShouldRender(lineCount);
    const scrollableNow = geo.scrollHeight > geo.clientHeight + 1;
    const visible = withinCap && scrollableNow;

    // ── geometry tracking (scroll + container + inner-content growth).
    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        // PERF: rAF-coalesced reads — scroll events can fire several times
        // per frame (wheel + compositor + smooth-scroll ticks); one
        // requestAnimationFrame per frame applies the latest geometry
        // exactly once.
        let raf = 0;
        const apply = () => {
            raf = 0;
            const next = {
                scrollTop: el.scrollTop,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
            };
            setGeo((prev) =>
                prev.scrollTop === next.scrollTop &&
                prev.scrollHeight === next.scrollHeight &&
                prev.clientHeight === next.clientHeight
                    ? prev
                    : next
            );
        };
        const read = () => {
            if (raf) return;
            raf = requestAnimationFrame(apply);
        };
        apply();
        el.addEventListener("scroll", read, {passive: true});
        const ro = new ResizeObserver(read);
        ro.observe(el);
        // the content auto-grows INSIDE the container — the container's
        // own box never resizes, so the content div needs observing too.
        if (el.firstElementChild instanceof HTMLElement) ro.observe(el.firstElementChild);
        return () => {
            el.removeEventListener("scroll", read);
            if (raf) cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [scrollRef, lineCount]);

    // ── the rail's own size (window resizes / pane drag).
    React.useEffect(() => {
        if (!visible) return;
        const c = canvasRef.current;
        if (!c) return;
        const ro = new ResizeObserver(() => setRailH(c.clientHeight));
        ro.observe(c);
        setRailH(c.clientHeight);
        return () => ro.disconnect();
    }, [visible]);

    // ── the paint: density rows + the translucent viewport rectangle.
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w <= 0 || h <= 0) return;
        // DPR-sharp raster (capped at 2 — 3x+ gains nothing at 1px rows).
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const wantW = Math.round(w * dpr);
        const wantH = Math.round(h * dpr);
        if (canvas.width !== wantW || canvas.height !== wantH) {
            canvas.width = wantW;
            canvas.height = wantH;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const tones = dark
            ? ["#3f4757", "#5b6675", "#8b95a3"]
            : ["#c3c9d2", "#9aa3af", "#6b7280"];
        const xInset = 3;
        const x0 = 3;
        const maxBar = Math.max(1, w - x0 - 2 * xInset - 2);
        for (let i = 0; i < stats.length; i++) {
            const s = stats[i];
            if (s.length === 0) continue;
            const y = minimapLineY(i, lineCount, h);
            const barW = Math.max(1, Math.min(maxBar, Math.round(s.length * 0.5)));
            ctx.fillStyle = tones[s.bucket];
            ctx.fillRect(x0 + s.bucket * xInset, y, barW, 1);
        }
        const rect = minimapViewportRect(geo, h);
        ctx.fillStyle = dark ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.15)";
        ctx.fillRect(0, rect.top, w, rect.height);
        ctx.strokeStyle = dark ? "rgba(52,211,153,0.55)" : "rgba(5,150,105,0.50)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, rect.top + 0.5, Math.max(1, w - 1), Math.max(1, rect.height - 1));
    }, [stats, lineCount, geo, dark, railH]);

    // ── CLICK + DRAG → scroll (pointer capture keeps the drag steering
    //    even outside the rail's box).
    const scrollToClientY = (clientY: number) => {
        const canvas = canvasRef.current;
        const el = scrollRef.current;
        if (!canvas || !el) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.height <= 0) return;
        const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
        const target = minimapScrollTargetForRatio(ratio, el);
        if (target !== el.scrollTop) el.scrollTop = target;
    };
    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch { /* detached — ignore */
        }
        draggingRef.current = true;
        scrollToClientY(e.clientY);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!draggingRef.current) return;
        scrollToClientY(e.clientY);
    };
    const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
        draggingRef.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch { /* not captured — ignore */
        }
    };

    if (!withinCap) {
        return (
            <div
                aria-hidden="true"
                title={`Minimap is off for this file — ${lineCount.toLocaleString()} lines is past the ${MINIMAP_MAX_LINES.toLocaleString()}-line cap`}
                className="hidden md:flex w-16 shrink-0 select-none flex-col items-center gap-1 border-l bg-muted/20 px-1 pt-2"
            >
                <p className="text-[9px] leading-tight text-muted-foreground/70">minimap off</p>
                <p className="text-[8px] leading-tight text-muted-foreground/50">
                    {lineCount.toLocaleString()} lines
                </p>
            </div>
        );
    }
    if (!scrollableNow) return null;
    // A11y: the rail duplicates the scroll container's OWN scrolling
    // affordance, so it is aria-hidden; keyboard + screen-reader users
    // keep the native scrollbar.
    return (
        <div
            aria-hidden="true"
            title="Editor minimap — click or drag to scroll the file"
            className="relative hidden md:flex w-16 shrink-0 border-l bg-muted/10"
        >
            <canvas
                ref={canvasRef}
                className="block h-full w-full cursor-pointer touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            />
        </div>
    );
}
