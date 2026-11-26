"use client";

import * as React from "react";
import {AnimatePresence, motion} from "framer-motion";
import {BarChart3, Download, Film, Image as ImageIcon, MousePointerClick, Trash2, X,} from "lucide-react";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";

/* ================================================================== */
/* PlotsPanel */
/*                                                                    */
/*  The bottom panel's PERSISTENT figure gallery. Unlike the run      */
/*  Output tab's "figures" strip (which shows only the CURRENT        */
/*  result), the Plots tab accumulates every matplotlib figure /      */
/*  animation produced by any run in this workspace — primary runs,   */
/*  split/background runs — and keeps them across tab switches,       */
/*  file switches and page reloads (localStorage + HEAD validation    */
/*  on restore, same pattern as the run-history figure cache).        */
/*                                                                    */
/*  Capabilities (gallery + zoom + export PNG/SVG + delete):          */
/*    • grid gallery, newest first (or sort by name / source script)  */
/*    • click to zoom — lightbox with 1× / 2× scale toggle            */
/*    • per-plot download (original PNG/SVG/GIF/MP4 bytes),          */
/*      "Download all", and open-in-new-tab                           */
/*    • delete one / clear all                                        */
/*    • filter by the script that produced the plots                  */

/* ================================================================== */

export interface PlotEntry {
    /** Stable id: `<runId>::<name>` — unique per run per figure. */
    id: string;
    /** Serve URL — `/api/figure/<runId>/<encoded name>`. */
    url: string;
    /** File name, e.g. `figure-1.png`. */
    name: string;
    /** The script that produced it (caption + filter). */
    fileName: string;
    /** The run id (grouping). */
    runId: string;
    /** Epoch ms when the figure streamed in. */
    capturedAt: number;
    /** — mpld3 HTML companion URL when the figure was
     *  captured with mpld3 installed (zoom/pan). */
    interactiveUrl?: string;
}

type PlotSort = "newest" | "name" | "script";

function timeAgo(ms: number): string {
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

const isVideoName = (n: string) => /\.(mp4|webm|mov)$/i.test(n);
const isAnimName = (n: string) => /\.gif$/i.test(n);

/* ------------------------------------------------------------------ */
/*  Lightbox with zoom                                                 */

/* ------------------------------------------------------------------ */
function PlotLightbox({
                          plot,
                          onClose,
                          onPrev,
                          onNext,
                      }: {
    plot: PlotEntry;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
}) {
    const [scale, setScale] = React.useState(1);
    const [pan, setPan] = React.useState({x: 0, y: 0});

    React.useEffect(() => {
        setScale(1);
        setPan({x: 0, y: 0});
    }, [plot.id]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowLeft") onPrev();
            else if (e.key === "ArrowRight") onNext();
            else if (e.key === "+" || e.key === "=")
                setScale((s) => Math.min(6, s * 1.5));
            else if (e.key === "-") setScale((s) => Math.max(0.25, s / 1.5));
            else if (e.key === "0") {
                setScale(1);
                setPan({x: 0, y: 0});
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, onPrev, onNext]);

    const isVideo = isVideoName(plot.name);

    return (
        <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
        >
            {/* Close */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 size-10 rounded-full bg-foreground/10 hover:bg-foreground/50 flex items-center justify-center text-white z-10"
                aria-label="Close plot viewer"
            >
                <X className="size-5"/>
            </button>
            {/* Zoom controls (images only — videos keep native controls) */}
            {!isVideo && (
                <div
                    className="absolute top-4 left-4 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-white/90 text-xs z-10">
                    <button
                        onClick={() => setScale((s) => Math.max(0.25, s / 1.5))}
                        className="size-7 rounded-full hover:bg-white/20 flex items-center justify-center"
                        aria-label="Zoom out"
                        title="Zoom out (−)"
                    >
                        −
                    </button>
                    <span className="min-w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
                    <button
                        onClick={() => setScale((s) => Math.min(6, s * 1.5))}
                        className="size-7 rounded-full hover:bg-white/20 flex items-center justify-center"
                        aria-label="Zoom in"
                        title="Zoom in (+)"
                    >
                        +
                    </button>
                    <button
                        onClick={() => {
                            setScale(1);
                            setPan({x: 0, y: 0});
                        }}
                        className="size-7 rounded-full hover:bg-white/20 flex items-center justify-center text-[10px]"
                        aria-label="Reset zoom"
                        title="Reset zoom (0)"
                    >
                        1:1
                    </button>
                </div>
            )}
            {/* Prev / next */}
            <button
                onClick={onPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-foreground/10 hover:bg-foreground/40 flex items-center justify-center text-white z-10"
                aria-label="Previous plot (←)"
            >
                ‹
            </button>
            <button
                onClick={onNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-foreground/10 hover:bg-foreground/40 flex items-center justify-center text-white z-10"
                aria-label="Next plot (→)"
            >
                ›
            </button>
            {/* The plot — drag to pan when zoomed */}
            <div
                className="max-w-[92vw] max-h-[86vh] flex flex-col items-center gap-3 overflow-hidden"
                onDoubleClick={() =>
                    setScale((s) => (s === 1 ? 2 : 1))
                }
            >
                {isVideo ? (
                    <video
                        src={plot.url}
                        controls
                        autoPlay
                        className="max-w-full max-h-[78vh] rounded-lg shadow-2xl"
                    />
                ) : (
                    <motion.img
                        drag={scale > 1}
                        dragConstraints={{
                            left: -1000,
                            right: 1000,
                            top: -1000,
                            bottom: 1000,
                        }}
                        dragElastic={0.08}
                        onDrag={(_, info) => setPan({x: info.offset.x, y: info.offset.y})}
                        src={plot.url}
                        alt={plot.name}
                        style={{
                            transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
                            transformOrigin: "center",
                        }}
                        className={cn(
                            "max-w-full max-h-[78vh] object-contain rounded-lg shadow-2xl",
                            scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
                        )}
                    />
                )}
                <p className="text-xs text-white/70 font-mono flex items-center gap-2">
                    <ImageIcon className="size-3"/>
                    {plot.name}
                    <span className="text-white/40">·</span>
                    <span className="text-white/50 not-italic">{plot.fileName}</span>
                    <span className="text-white/40">·</span>
                    <span className="text-white/50">{timeAgo(plot.capturedAt)}</span>
                </p>
            </div>
        </motion.div>
    );
}

/* ------------------------------------------------------------------ */
/*  Single gallery card                                                */
/* ------------------------------------------------------------------ */
const PlotCard = React.memo(function PlotCard({
                                                  plot,
                                                  index,
                                                  onZoom,
                                                  onRemove,
                                              }: {
    plot: PlotEntry;
    index: number;
    onZoom: () => void;
    onRemove: () => void;
}) {
    const isVideo = isVideoName(plot.name);
    const isAnim = isAnimName(plot.name);
    // toggle to the mpld3 zoom/pan companion in an iframe.
    const [interactive, setInteractive] = React.useState(false);

    return (
        <figure
            className="group relative rounded-lg overflow-hidden border bg-card shadow-sm transition-shadow hover:shadow-md">
            {/* A div[role=button] (NOT a <button>) — the hover overlay nests
          an <a download> and a remove <button>, and HTML forbids
          interactive elements inside <button> (hydration error). */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => !interactive && onZoom()}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!interactive) onZoom();
                    }
                }}
                className={`w-full block bg-white relative outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    interactive ? "" : "cursor-zoom-in"
                }`}
                title={
                    interactive
                        ? "Interactive mode — drag to pan, scroll to zoom"
                        : "Click to zoom (← → to browse, +/− zoom, 0 reset)"
                }
                aria-label={`Zoom ${plot.name}`}
            >
                {interactive && plot.interactiveUrl ? (
                    <iframe
                        src={plot.interactiveUrl}
                        title={`${plot.name} — interactive`}
                        sandbox="allow-scripts"
                        className="w-full h-[300px] block bg-white"
                    />
                ) : isVideo ? (
                    <video
                        src={plot.url}
                        controls
                        className="w-full h-auto block bg-black aspect-video"
                        preload="metadata"
                    />
                ) : (
                    <img
                        src={plot.url}
                        alt={plot.name}
                        className="w-full h-auto block bg-white"
                        loading="lazy"
                    />
                )}
                {/* Hover overlay actions */}
                <span
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none"/>
                <span
                    className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {plot.interactiveUrl && (
              <button
                  type="button"
                  onClick={(e) => {
                      e.stopPropagation();
                      setInteractive((v) => !v);
                  }}
                  className="size-7 rounded-md bg-black/70 hover:bg-cyan-700 text-white flex items-center justify-center"
                  title={
                      interactive
                          ? "Back to the static PNG"
                          : "Interactive (mpld3) — drag to pan, scroll to zoom"
                  }
                  aria-label="Toggle interactive plot"
              >
                  <MousePointerClick className="size-3.5"/>
              </button>
          )}
                    <a
                        href={plot.url}
                        download={plot.name}
                        onClick={(e) => e.stopPropagation()}
                        className="size-7 rounded-md bg-black/70 hover:bg-black text-white flex items-center justify-center"
                        title={`Download ${plot.name} (original ${plot.name.split(".").pop()?.toUpperCase() ?? "file"})`}
                        aria-label="Download plot"
                    >
            <Download className="size-3.5"/>
          </a>
          <button
              type="button"
              onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
              }}
              className="size-7 rounded-md bg-black/70 hover:bg-red-600 text-white flex items-center justify-center"
              title="Remove from gallery"
              aria-label="Remove plot"
          >
            <Trash2 className="size-3.5"/>
          </button>
        </span>
                {/* Type badges */}
                {isAnim && (
                    <span
                        className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-cyan-500/90 text-white text-[9px] font-semibold tracking-wide">
            ANIM
          </span>
                )}
                {isVideo && (
                    <span
                        className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-purple-500/90 text-white text-[9px] font-semibold tracking-wide flex items-center gap-0.5">
            <Film className="size-2.5"/> VIDEO
          </span>
                )}
            </div>
            <figcaption className="px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 bg-muted/40 border-t">
                <ImageIcon className="size-3 shrink-0 text-muted-foreground"/>
                <span className="truncate font-medium" title={plot.name}>
          {plot.name}
        </span>
                <span className="text-muted-foreground/60 truncate hidden sm:inline" title={plot.fileName}>
          · {plot.fileName}
        </span>
                <span className="ml-auto text-muted-foreground/70 shrink-0 tabular-nums">
          {timeAgo(plot.capturedAt)}
        </span>
                <span className="shrink-0 text-muted-foreground/50 tabular-nums">
          #{index + 1}
        </span>
            </figcaption>
        </figure>
    );
});

/* ------------------------------------------------------------------ */
/*  The panel                                                          */

/* ------------------------------------------------------------------ */
export function PlotsPanel({
                               plots,
                               active,
                               onRemove,
                               onClear,
                           }: {
    plots: PlotEntry[];
    /** True when the bottom panel tab is selected (gates eager rendering). */
    active: boolean;
    onRemove: (id: string) => void;
    onClear: () => void;
}) {
    const [sort, setSort] = React.useState<PlotSort>("newest");
    const [scriptFilter, setScriptFilter] = React.useState<string>("all");
    const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);

    const scripts = React.useMemo(() => {
        const set = new Set(plots.map((p) => p.fileName));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [plots]);

    const visible = React.useMemo(() => {
        let list = plots;
        if (scriptFilter !== "all")
            list = list.filter((p) => p.fileName === scriptFilter);
        list = [...list];
        if (sort === "newest") list.sort((a, b) => b.capturedAt - a.capturedAt);
        else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
        else
            list.sort(
                (a, b) =>
                    a.fileName.localeCompare(b.fileName) || b.capturedAt - a.capturedAt
            );
        return list;
    }, [plots, sort, scriptFilter]);

    const downloadAll = React.useCallback(async () => {
        for (const p of visible) {
            const a = document.createElement("a");
            a.href = p.url;
            a.download = p.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            await new Promise((r) => setTimeout(r, 200));
        }
    }, [visible]);

    /* Empty state — the gallery starts (and after Clear) with a gentle
       pointer to how figures get here. Same tone as the Tests panel's
       empty state. */
    if (plots.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground p-6">
                <BarChart3 className="size-8 opacity-40"/>
                <p className="text-sm font-medium text-foreground/70">
                    No plots captured yet
                </p>
                <p className="text-xs max-w-sm text-center leading-relaxed">
                    Run a script that uses <code className="font-mono">matplotlib</code>{" "}
                    (or <code className="font-mono">pyplot</code>) — every figure it
                    produces lands here and stays, across runs and reloads.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b bg-muted/30 text-xs flex-wrap">
        <span className="flex items-center gap-1.5 font-medium">
          <BarChart3 className="size-3.5 text-muted-foreground"/>
            {plots.length} plot{plots.length === 1 ? "" : "s"}
            {scriptFilter !== "all" && (
                <span className="text-muted-foreground font-normal">
              (showing {visible.length})
            </span>
            )}
        </span>

                <span className="w-px h-4 bg-border"/>

                <Select
                    value={sort}
                    onValueChange={(v) => setSort(v as PlotSort)}
                    aria-label="Sort plots"
                >
                    <SelectTrigger className="h-6 w-[130px] text-xs">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
                        <SelectItem value="name">By figure name</SelectItem>
                        <SelectItem value="script">By source script</SelectItem>
                    </SelectContent>
                </Select>

                {scripts.length > 1 && (
                    <Select
                        value={scriptFilter}
                        onValueChange={setScriptFilter}
                        aria-label="Filter plots by script"
                    >
                        <SelectTrigger className="h-6 w-[150px] text-xs">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All scripts</SelectItem>
                            {scripts.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <span className="ml-auto flex items-center gap-1">
          <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => void downloadAll()}
              title="Download every visible plot (original PNG/SVG/GIF/MP4 bytes)"
          >
            <Download className="size-3"/>
            Download all
          </Button>
          <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive"
              onClick={onClear}
              title="Remove every plot from the gallery (files on disk are untouched)"
          >
            <Trash2 className="size-3"/>
            Clear
          </Button>
        </span>
            </div>

            {/* Gallery grid */}
            <div className="flex-1 min-h-0 overflow-auto p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {visible.map((p, i) => (
                        <PlotCard
                            key={p.id}
                            plot={p}
                            index={i}
                            onZoom={() => setLightboxIdx(i)}
                            onRemove={() => onRemove(p.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {lightboxIdx !== null && visible[lightboxIdx] && (
                    <PlotLightbox
                        plot={visible[lightboxIdx]}
                        onClose={() => setLightboxIdx(null)}
                        onPrev={() =>
                            setLightboxIdx((i) =>
                                i === null ? i : (i - 1 + visible.length) % visible.length
                            )
                        }
                        onNext={() =>
                            setLightboxIdx((i) => (i === null ? i : (i + 1) % visible.length))
                        }
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
