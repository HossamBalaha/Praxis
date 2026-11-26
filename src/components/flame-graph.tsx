"use client";

/**
 * flame-graph.tsx — canvas flame graph of the profiled call tree.
 *
 * Mounted inside the Diagnostics panel's Profile tool (see
 * ProfileResult in diagnostics-panel.tsx) next to the classic pstats
 * table. Data comes from the app's existing /api/profile rows (flat
 * pstats rows) — buildFlameTree derives the pseudo call tree — or, the
 * moment /api/profile returns real call trees, via the `tree` prop
 * (FlameNode[]); both shapes are documented on the props below.
 *
 * Rendering contract (this is a flagship-performance surface):
 *   · 100% canvas drawing — no per-frame DOM;
 *   · devicePixelRatio-correct backing store (ctx scaled by the live
 *     dpr, re-checked every draw, plus a matchMedia watcher);
 *   · ALL paints funnel through one rAF-batched scheduleDraw() —
 *     pointer moves mutate refs (hover key + tooltip DOM) and never
 *     touch React state;
 *   · the tree build, the layout, the breadcrumb path and the module
 *     color cache are useMemo'd; only zoom / real resizes relayout;
 *   · the container is measured through a ResizeObserver whose
 *     callback is rafThrottle'd (src/lib/raf-batch.ts).
 *
 * Interactions: hover → tooltip (name, file:line, cumulative, self,
 * calls, % of total); click a frame → zoom into that subtree (click
 * the zoom root again, a breadcrumb crumb, or Reset to zoom out);
 * sub-pixel siblings are aggregated into "(other)" buckets whose
 * tooltip lists the members; stacks deeper than the canvas height are
 * truncated with a visible note.
 */

import * as React from "react";
import {ChevronRight, RotateCcw} from "lucide-react";
import {cn} from "@/lib/utils";
import {rafThrottle} from "@/lib/raf-batch";
import {
    buildFlameTree,
    flameColorsFor,
    type FlameLayout,
    type FlameNode,
    flamePathTo,
    type FlameRect,
    type FlameSortMode,
    type FlameTree,
    formatSeconds,
    hitTestFlame,
    layoutFlame,
    parseNcalls,
    percentOf,
    type PstatsRow,
} from "@/lib/flame-graph-data";

// ── props ───────────────────────────────────────────────────────────

export interface FlameGraphProps {
    /**
     * Flat pstats rows — the EXACT shape /api/profile returns today and
     * the Diagnostics panel already holds ({ncalls, tottime, cumtime,
     * location}). A pseudo call tree is derived from it (widths are the
     * real cumulative times; parent/child edges are a best-fit guess).
     */
    rows?: PstatsRow[];
    /**
     * RICHER SHAPE for when /api/profile provides a real call tree:
     * nodes need only {name, cumulative} (+ optional file/line/self/
     * calls/children/module). Takes precedence over `rows`.
     */
    tree?: FlameNode[];
    /** Canvas height in CSS px (the stack draws top-down inside it). */
    height?: number;
    /** One frame row's height in CSS px. */
    rowHeight?: number;
    /** Sub-pixel merge threshold — siblings narrower merge into "(other)". */
    minFramePx?: number;
    className?: string;
}

// ── component ────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 240;
const DEFAULT_ROW_HEIGHT = 18;
const LABEL_MIN_W = 26; // below this a rect can't host readable text
/** The toolbar toggle's two segments (see FlameSortMode). */
const SORT_MODES: FlameSortMode[] = ["cumulative", "self"];

export function FlameGraph({
                               rows,
                               tree: treeProp,
                               height = DEFAULT_HEIGHT,
                               rowHeight = DEFAULT_ROW_HEIGHT,
                               minFramePx,
                               className,
                           }: FlameGraphProps) {
    const wrapRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const tooltipRef = React.useRef<HTMLDivElement | null>(null);
    const tipNameRef = React.useRef<HTMLSpanElement | null>(null);
    const tipLocRef = React.useRef<HTMLSpanElement | null>(null);
    const tipCumRef = React.useRef<HTMLSpanElement | null>(null);
    const tipSelfRef = React.useRef<HTMLSpanElement | null>(null);
    const tipCallsRef = React.useRef<HTMLSpanElement | null>(null);
    const tipPctRef = React.useRef<HTMLSpanElement | null>(null);

    /** Live values read by the draw loop — refs only, never state. */
    const layoutRef = React.useRef<FlameLayout | null>(null);
    const hoverRef = React.useRef<FlameRect | null>(null);
    const sizeRef = React.useRef({w: 0, h: height});
    const drawRafRef = React.useRef(0);
    /** Module → color cache; the hot loop only ever does a Map.get. */
    const colorCacheRef = React.useRef(new Map<string, ReturnType<typeof flameColorsFor>>());

    // Zoom state — the ONLY interactive React state besides real resizes.
    const [zoomKey, setZoomKey] = React.useState<string | null>(null);
    // True box size; written by the (throttled) ResizeObserver only.
    const [boxW, setBoxW] = React.useState(0);
    // Sibling ordering — the Cumulative / Self time toolbar toggle. A pure
    // re-layout of the SAME tree (layoutFlame orders siblings through a
    // per-layout cache and never mutates), so no re-ingestion, and the
    // zoom key stays valid across modes — click-to-zoom keeps working.
    const [sortMode, setSortMode] = React.useState<FlameSortMode>("cumulative");

    // ── data: build the tree once per data change ──────────────────────
    const tree = React.useMemo<FlameTree | null>(
        () => buildFlameTree({rows, tree: treeProp}),
        [rows, treeProp]
    );

    // A new profile invalidates any zoom (stale keys point nowhere).
    React.useEffect(() => {
        setZoomKey(null);
    }, [tree]);

    const layout = React.useMemo<FlameLayout | null>(() => {
        if (!tree) return null;
        const w = Math.max(1, boxW || 1);
        // Depth cap from the canvas height — deeper stacks truncate with a
        // visible note instead of silently clipping.
        const maxDepth = Math.max(1, Math.floor((height - 4) / rowHeight));
        return layoutFlame(tree, {zoomKey, width: w, minFramePx, maxDepth, sort: sortMode});
    }, [tree, zoomKey, boxW, height, rowHeight, minFramePx, sortMode]);

    const crumbs = React.useMemo(
        () => (tree ? flamePathTo(tree, zoomKey) : []),
        [tree, zoomKey]
    );

    // ── draw: single rAF-batched entry point ───────────────────────────
    const draw = React.useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const layout = layoutRef.current;
        if (!layout) return;

        // devicePixelRatio-correct backing store. Re-checked every draw so
        // browser-zoom (dpr) changes self-heal even without the matchMedia
        // watcher below; assignments are no-ops when unchanged.
        const dpr = window.devicePixelRatio || 1;
        const cssW = Math.max(1, sizeRef.current.w);
        const cssH = Math.max(1, sizeRef.current.h);
        const bw = Math.round(cssW * dpr);
        const bh = Math.round(cssH * dpr);
        if (canvas.width !== bw) canvas.width = bw;
        if (canvas.height !== bh) canvas.height = bh;
        if (canvas.style.width !== `${cssW}px`) canvas.style.width = `${cssW}px`;
        if (canvas.style.height !== `${cssH}px`) canvas.style.height = `${cssH}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const cache = colorCacheRef.current;
        const colorsFor = (module: string | undefined): ReturnType<typeof flameColorsFor> => {
            const key = module ?? "~";
            let c = cache.get(key);
            if (!c) {
                c = flameColorsFor(key);
                cache.set(key, c);
            }
            return c;
        };

        const fontPx = Math.min(11, Math.max(8, rowHeight - 6));
        const font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        const hover = hoverRef.current;

        for (let i = 0; i < layout.rects.length; i++) {
            const r = layout.rects[i];
            const rx = Math.round(r.x);
            const rw = Math.max(1, Math.round(r.x + r.w) - rx - 1);
            const ry = r.depth * rowHeight + 1;
            const rh = rowHeight - 2;
            const c = colorsFor(r.aggregated ? "(other)" : r.node.module);

            ctx.fillStyle = c.fill;
            ctx.fillRect(rx, ry, rw, rh);

            // Label (clamped to the rect, "…" when clipped). Buckets show
            // their member count; regular frames show name + time when wide.
            if (rw >= LABEL_MIN_W) {
                ctx.font = r.isZoomRoot ? `bold ${font}` : font;
                ctx.fillStyle = c.text;
                ctx.textBaseline = "middle";
                const label =
                    r.aggregated
                        ? `(other ${r.aggregated.length})`
                        : rw > 90
                            ? `${r.node.name} · ${formatSeconds(r.node.cumulative)}`
                            : r.node.name;
                let text = label;
                while (text.length > 1 && ctx.measureText(text).width > rw - 6) {
                    text = text.slice(0, -1);
                }
                if (text !== label) text = `${text.slice(0, -1)}…`;
                ctx.fillText(text, rx + 3, ry + rh / 2);
            }

            // Frame edge — subtle separation between adjacent rects.
            ctx.strokeStyle = c.stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(0, rw - 1), Math.max(0, rh - 1));
        }

        // Hover overlay (light wash + stronger edge) — drawn last so it
        // never fights the label strokes.
        if (hover) {
            const rx = Math.round(hover.x);
            const rw = Math.max(1, Math.round(hover.x + hover.w) - rx - 1);
            const ry = hover.depth * rowHeight + 1;
            const rh = rowHeight - 2;
            ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = "rgba(24, 20, 16, 0.9)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx + 0.5, ry + 0.5, Math.max(0, rw - 1), Math.max(0, rh - 1));
        }
    }, [rowHeight]);

    const scheduleDraw = React.useCallback(() => {
        if (drawRafRef.current) return; // coalesce: one paint per frame
        drawRafRef.current = requestAnimationFrame(() => {
            drawRafRef.current = 0;
            draw();
        });
    }, [draw]);

    React.useEffect(() => {
        return () => {
            if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
        };
    }, []);

    // Layout (or real box) changed → publish to the draw loop + repaint.
    React.useEffect(() => {
        layoutRef.current = layout;
        scheduleDraw();
    }, [layout, scheduleDraw]);

    // ── sizing: ResizeObserver, rAF-throttled ──────────────────────────
    React.useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const apply = rafThrottle(() => {
            const rect = el.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width));
            sizeRef.current = {w, h: height};
            // Only a REAL width change re-renders (relayout) — height is a
            // prop, so it only updates the ref for the draw pass.
            setBoxW((prev) => (prev === w ? prev : w));
            scheduleDraw();
        });
        apply(); // first measure (canvas exists before layout settles)
        const ro = new ResizeObserver(apply);
        ro.observe(el);
        return () => {
            ro.disconnect();
            apply.cancel();
        };
    }, [height, scheduleDraw]);

    // Keep the backing store crisp across browser zoom / monitor changes:
    // watch the CURRENT dpr and re-arm for the next step after each fire.
    React.useEffect(() => {
        let mq: MediaQueryList | null = null;
        const onDpr = () => {
            mq?.removeEventListener("change", onDpr);
            scheduleDraw();
            arm();
        };
        const arm = () => {
            mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
            mq.addEventListener("change", onDpr);
        };
        arm();
        return () => mq?.removeEventListener("change", onDpr);
    }, [scheduleDraw]);

    // ── tooltip (imperative — no React state on pointer move) ─────────
    const hideTooltip = React.useCallback(() => {
        const el = tooltipRef.current;
        if (el) el.style.display = "none";
        if (hoverRef.current) {
            hoverRef.current = null;
            scheduleDraw();
        }
    }, [scheduleDraw]);

    const showTooltip = React.useCallback(
        (rect: FlameRect, px: number, py: number) => {
            const el = tooltipRef.current;
            if (!el) return;
            const total = layoutRef.current?.total ?? 0;

            if (rect.aggregated) {
                // Merged sub-pixel frames: count, combined time and the top
                // members so the bucket is still actionable.
                const members = rect.aggregated;
                const sum = members.reduce((s, m) => s + Math.max(0, m.cumulative), 0);
                const top = [...members].sort((a, b) => b.cumulative - a.cumulative).slice(0, 4);
                if (tipNameRef.current) tipNameRef.current.textContent = `(${members.length} frames — top ${top.length})`;
                if (tipLocRef.current) {
                    tipLocRef.current.textContent = top
                        .map((m) => `${m.name} ${formatSeconds(m.cumulative)}`)
                        .join(" · ");
                }
                if (tipCumRef.current) tipCumRef.current.textContent = formatSeconds(sum);
                if (tipSelfRef.current) tipSelfRef.current.textContent = "—";
                if (tipCallsRef.current) {
                    tipCallsRef.current.textContent = members.reduce((s, m) => s + (m.calls ?? 0), 0).toString();
                }
                if (tipPctRef.current) tipPctRef.current.textContent = percentOf(sum, total);
            } else {
                const n = rect.node;
                if (tipNameRef.current) tipNameRef.current.textContent = n.name;
                if (tipLocRef.current) {
                    const file = n.file ? (n.file === "~" ? "built-in" : `${n.file}${n.line ? `:${n.line}` : ""}`) : "";
                    tipLocRef.current.textContent = file || "—";
                }
                if (tipCumRef.current) tipCumRef.current.textContent = formatSeconds(n.cumulative);
                if (tipSelfRef.current) tipSelfRef.current.textContent = formatSeconds(n.self ?? 0);
                if (tipCallsRef.current) {
                    const parsed = parseNcalls(n.ncallsRaw ?? (n.calls ?? 0).toString());
                    tipCallsRef.current.textContent =
                        parsed.primitive !== null && n.ncallsRaw
                            ? `${parsed.total} (${parsed.primitive} primitive)`
                            : `${parsed.total}`;
                }
                if (tipPctRef.current) tipPctRef.current.textContent = percentOf(n.cumulative, total);
            }

            // Position near the cursor, clamped inside the wrapper so the
            // tooltip never clips out of the panel.
            el.style.display = "block";
            const wrap = wrapRef.current;
            const maxX = wrap ? wrap.clientWidth : 320;
            const w = el.offsetWidth;
            const left = Math.max(2, Math.min(px + 12, Math.max(2, maxX - w - 4)));
            const top = Math.max(2, py - 46);
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
        },
        []
    );

    // ── pointer handlers (refs + rAF only) ─────────────────────────────
    const onPointerMove = React.useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            const layout = layoutRef.current;
            if (!canvas || !layout) return;
            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const hit = hitTestFlame(layout.rects, px, py, rowHeight);
            const prev = hoverRef.current;
            if (hit !== prev) {
                hoverRef.current = hit;
                scheduleDraw();
                if (hit) showTooltip(hit, px, py);
            } else if (hit) {
                // Same frame, new cursor position — just follow the pointer.
                showTooltip(hit, px, py);
            }
            // Zoomable targets get the pointer cursor: frames with children,
            // plus the zoom root itself (click = reset).
            const zoomable =
                hit &&
                !hit.aggregated &&
                (hit.isZoomRoot || (hit.node.children?.length ?? 0) > 0);
            canvas.style.cursor = zoomable ? "pointer" : "default";
        },
        [rowHeight, scheduleDraw, showTooltip]
    );

    const onPointerLeave = React.useCallback(() => hideTooltip(), [hideTooltip]);

    const onCanvasClick = React.useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            const layout = layoutRef.current;
            if (!canvas || !layout) return;
            const rect = canvas.getBoundingClientRect();
            const hit = hitTestFlame(
                layout.rects,
                e.clientX - rect.left,
                e.clientY - rect.top,
                rowHeight
            );
            if (!hit || hit.aggregated) return; // buckets aren't subtrees
            if (hit.isZoomRoot) {
                // Clicking the zoom root resets — the VS Code flame behavior.
                setZoomKey(null);
                return;
            }
            if ((hit.node.children?.length ?? 0) > 0) {
                setZoomKey(hit.key);
            }
        },
        [rowHeight]
    );

    // ── render ────────────────────────────────────────────────────────
    if (!tree) {
        return (
            <p className="text-xs text-muted-foreground py-3">No profile data to graph.</p>
        );
    }

    return (
        <div className={cn("space-y-1.5", className)}>
            {/* Breadcrumb / reset-zoom control — DOM (not canvas) because it is
          semantic, keyboard-focusable chrome, not per-frame pixels. */}
            <div className="flex items-center gap-1 min-w-0 text-[11px] font-mono">
                <button
                    type="button"
                    onClick={() => setZoomKey(null)}
                    className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 hover:bg-muted transition-colors",
                        zoomKey ? "text-muted-foreground" : "text-foreground font-medium"
                    )}
                    aria-label="Reset zoom — show the full call tree"
                >
                    {tree.root.name}
                </button>
                {crumbs.length > 1 &&
                    crumbs.slice(1).map((n, i) => (
                        <React.Fragment key={`${i}-${n.name}`}>
                            <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden/>
                            <button
                                type="button"
                                onClick={() => setZoomKey(tree.keyOf(n))}
                                className={cn(
                                    "max-w-40 truncate rounded px-1.5 py-0.5 hover:bg-muted transition-colors",
                                    i === crumbs.length - 2 ? "text-foreground font-medium" : "text-muted-foreground"
                                )}
                                title={`Zoom to ${n.name} (${formatSeconds(n.cumulative)})`}
                            >
                                {n.name}
                            </button>
                        </React.Fragment>
                    ))}
                {/* ── Sort toggle — a two-segment control in the breadcrumb
            toolbar. "Cumulative" is the classic flame layout (children
            in ingestion order); "Self time" re-orders every parent's
            children by self time descending — a pure re-layout of the
            same tree (widths stay ∝ cumulative time), so click-to-zoom
            and the breadcrumbs keep working in either mode. */}
                <div
                    className="ml-auto shrink-0 flex items-center rounded-md border overflow-hidden text-[10px]"
                    role="group"
                    aria-label="Order sibling frames by"
                >
                    {SORT_MODES.map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setSortMode(mode)}
                            aria-pressed={sortMode === mode}
                            className={cn(
                                "px-1.5 py-0.5 transition-colors",
                                sortMode === mode
                                    ? "bg-muted text-foreground font-medium"
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                            title={
                                mode === "cumulative"
                                    ? "Order sibling frames by cumulative time — the classic flame graph layout"
                                    : "Order sibling frames by self time (descending) within each parent — widths stay proportional to cumulative time"
                            }
                        >
                            {mode === "cumulative" ? "Cumulative" : "Self time"}
                        </button>
                    ))}
                </div>
                {zoomKey && (
                    <button
                        type="button"
                        onClick={() => setZoomKey(null)}
                        className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label="Reset zoom"
                        title="Reset zoom"
                    >
                        <RotateCcw className="size-3" aria-hidden/>
                        Reset
                    </button>
                )}
            </div>

            {/* Canvas + tooltip wrapper. aria-label carries the essentials for
          screen readers (canvas content is not inspectable by them). */}
            <div
                ref={wrapRef}
                className="relative w-full overflow-hidden rounded-md border bg-muted/30"
                style={{height}}
            >
                <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label="Flame graph of the profiled call tree — frame widths are proportional to cumulative time; hover for details, click a frame to zoom."
                    tabIndex={0}
                    className="block w-full"
                    onPointerMove={onPointerMove}
                    onPointerLeave={onPointerLeave}
                    onClick={onCanvasClick}
                />
                <div
                    ref={tooltipRef}
                    className="pointer-events-none absolute z-10 hidden max-w-[320px] rounded-md border bg-popover px-2.5 py-2 text-[11px] font-mono leading-relaxed shadow-md"
                    role="tooltip"
                >
                    <div className="flex items-baseline gap-2 min-w-0">
                        <span ref={tipNameRef} className="font-semibold text-foreground truncate"/>
                        <span ref={tipPctRef} className="ml-auto shrink-0 text-foreground/70"/>
                    </div>
                    <span ref={tipLocRef} className="block truncate text-muted-foreground"/>
                    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        <span className="text-muted-foreground">cum</span>
                        <span ref={tipCumRef} className="text-right tabular-nums"/>
                        <span className="text-muted-foreground">self</span>
                        <span ref={tipSelfRef} className="text-right tabular-nums"/>
                        <span className="text-muted-foreground">calls</span>
                        <span ref={tipCallsRef} className="text-right tabular-nums"/>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>
          widths ∝ cumulative time
            {sortMode === "self" ? " · siblings ordered by self time" : ""} ·
          colors by module · click a frame to zoom
        </span>
                {layout?.truncated && (
                    <span className="text-amber-600 dark:text-amber-400">
            deep stack truncated — {layout.rows} rows shown
          </span>
                )}
            </div>
        </div>
    );
}
