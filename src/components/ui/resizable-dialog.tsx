"use client";

import * as React from "react";
import {DialogContent} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";
import {loadSettings, saveSettings} from "@/lib/settings";

/**
 * ResizableDialogContent — a DialogContent the user can drag to any
 * size by its right edge, bottom edge, or bottom-right corner grip
 *.
 *
 * ▸ The size is applied as inline width/height (capped by 94vw /
 * 88dvh), so it composes with the content's own scroll containers;
 * callers must NOT pass sm:max-w-* / max-h-[…vh] classes (they
 * would cap below the dragged size) — the wrapper is the size
 * authority.
 * ▸ Persisted per dialog id at praxis.modalSize.<id> — reopening
 * starts at the last dragged size; the default (defaultW/H) is
 * used until the user drags.
 * ▸ The three grips use pointer capture, so the drag survives
 * leaving the handle; keyboard users get the same result via the
 * dialog's natural focus order (the grips are decorative extras on
 * top of a fully usable dialog).
 *
 * RESIZE MODE:
 * ▸ Free (default) — the edges move independently (the classic
 * behavior): "e" changes width only, "s" height only, "se" both.
 * ▸ Ratio — every drag grows width AND height together, keeping the
 * dialog's current aspect ratio: dragging the right edge widens and
 * the height follows proportionally (same for the bottom edge); the
 * corner grip applies one scale factor to both. Select between the
 * two in Settings → Editor → "Modal resizing" (searchable as
 * "resizing"/"resize"), OR flip it live from THIS dialog's corner
 * chip (⤡ Free ⇄ Ratio) — the choice persists and every open
 * resizable dialog follows it (praxis:settings-saved event).
 *
 * PINNED GRIPS: the grips used to sit inside the dialog's
 * own `overflow-y-auto` scroll box — with tall scrolling content
 * (Transform Pipeline, workbenches) the bottom-edge and corner grips
 * scrolled away with the content, so the dialog could only be resized
 * where the content happened to be visible. The dialog is now a flex
 * column with an INNER scroll region; the grips are siblings of that
 * region, pinned to the visible box at all times — every edge grip
 * is grabbable no matter how far the content is scrolled.
 */
export interface ResizableDialogContentProps
    extends React.ComponentProps<typeof DialogContent> {
    /** Persistence id — the size is stored at praxis.modalSize.<id>. */
    id: string;
    /** First-open width in px (before any drag). */
    defaultW?: number;
    /** First-open height in px (before any drag). Values ≥ 9000 mean
     *  "fit the viewport height" (resolved at mount against 88dvh). */
    defaultH?: number;
    /** Smallest draggable width. */
    minW?: number;
    /** Smallest draggable height. */
    minH?: number;
}

const SIZE_PREFIX = "praxis.modalSize";

function loadSize(
    id: string,
    defaultW: number,
    defaultH: number
): { w: number; h: number } {
    if (typeof window === "undefined") return {w: defaultW, h: defaultH};
    try {
        const raw = window.localStorage.getItem(`${SIZE_PREFIX}.${id}`);
        if (!raw) return {w: defaultW, h: defaultH};
        const p = JSON.parse(raw) as { w?: number; h?: number };
        if (Number.isFinite(p.w) && Number.isFinite(p.h) && (p.w ?? 0) >= 320 && (p.h ?? 0) >= 240) {
            return {w: p.w as number, h: p.h as number};
        }
    } catch {
        /* corrupted — fall through */
    }
    return {w: defaultW, h: defaultH};
}

type DragMode = "e" | "s" | "se";

export function ResizableDialogContent({
                                           id,
                                           defaultW = 720,
                                           defaultH = 520,
                                           minW = 480,
                                           minH = 360,
                                           className,
                                           style,
                                           children,
                                           ...rest
                                       }: ResizableDialogContentProps) {
    // "fit" heights (≥ 9000) resolve against the viewport at mount so
    // the dialog fills 88dvh whatever the screen.
    const resolvedDefaultH =
        defaultH >= 9000 && typeof window !== "undefined"
            ? Math.round(window.innerHeight * 0.88)
            : defaultH;
    const [size, setSize] = React.useState(() => loadSize(id, defaultW, resolvedDefaultH));
    /** Free vs ratio resizing — Settings → Editor → Modal resizing, or
     *  the corner chip on this dialog. */
    const [ratioMode, setRatioMode] = React.useState(false);
    React.useEffect(() => {
        const read = () => setRatioMode(loadSettings().modalResizeMode === "ratio");
        read();
        window.addEventListener("praxis:settings-saved", read);
        return () => window.removeEventListener("praxis:settings-saved", read);
    }, []);

    React.useEffect(() => {
        try {
            window.localStorage.setItem(`${SIZE_PREFIX}.${id}`, JSON.stringify(size));
        } catch {
            /* private mode */
        }
    }, [id, size]);

    /** Flip Free ⇄ Ratio from the dialog itself — persists into the
     *  settings store and broadcasts so every other resizable dialog
     *  switches too. */
    const toggleResizeMode = React.useCallback(() => {
        const next = ratioMode ? "free" : "ratio";
        const settings = loadSettings();
        settings.modalResizeMode = next;
        saveSettings(settings);
        setRatioMode(next === "ratio");
        try {
            window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
        } catch {
            /* older browsers */
        }
    }, [ratioMode]);

    const dragMode = React.useRef<DragMode | null>(null);
    const dragStart = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);

    const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragMode.current = mode;
        dragStart.current = {x: e.clientX, y: e.clientY, w: size.w, h: size.h};
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* capture unsupported */
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const mode = dragMode.current;
        const start = dragStart.current;
        if (!mode || !start) return;
        const maxW = Math.max(minW, Math.round(window.innerWidth * 0.94));
        const maxH = Math.max(minH, Math.round(window.innerHeight * 0.88));
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!ratioMode) {
            // FREE — edges independent (the classic behavior).
            const w = Math.max(minW, Math.min(maxW, start.w + dx));
            const h = Math.max(minH, Math.min(maxH, start.h + dy));
            setSize((prev) =>
                mode === "e" ? {...prev, w} : mode === "s" ? {...prev, h} : {w, h}
            );
            return;
        }
        // RATIO — width AND height grow together, preserving the dialog's
        // aspect ratio. The drag axis with the larger projection drives the
        // scale factor; the min/max clamps use the box's own ratio so the
        // clamped result still keeps its shape.
        const ratio = start.w / start.h || 1;
        let scale: number;
        if (mode === "se") {
            // Corner: the diagonal's dominant axis decides.
            scale = Math.abs(dx) > Math.abs(dy) ? (start.w + dx) / start.w : (start.h + dy) / start.h;
        } else if (mode === "e") {
            scale = (start.w + dx) / start.w;
        } else {
            scale = (start.h + dy) / start.h;
        }
        if (!Number.isFinite(scale) || scale <= 0) return;
        let w = start.w * scale;
        let h = start.h * scale;
        // Clamp to the viewport box while keeping the ratio (shrink toward
        // the binding edge's cap, then re-derive the other side).
        if (w > maxW) {
            w = maxW;
            h = w / ratio;
        }
        if (h > maxH) {
            h = maxH;
            w = h * ratio;
        }
        // Floor at the minimums — keep the shape by lifting BOTH sides.
        if (w < minW || h < minH) {
            const lift = Math.max(minW / w, minH / h);
            w = Math.min(maxW, w * lift);
            h = Math.min(maxH, h * lift);
        }
        w = Math.round(w);
        h = Math.round(h);
        setSize((prev) => (w !== prev.w || h !== prev.h ? {w, h} : prev));
    };

    const onPointerUp = (e: React.PointerEvent) => {
        dragMode.current = null;
        dragStart.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* not captured */
        }
    };

    return (
        <DialogContent
            /* the base DialogContent carries
      `sm:max-w-lg max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)]`,
      and CSS max-width/max-height CLAMP the inline width/height this
      wrapper sets — so every resizable dialog was hard-capped at
      512px wide no matter what the user dragged or the default
      asked for (the height still moved). Cancelling the caps here
      (plain classes — no !important needed once twMerge drops the
      base's conflicting utilities) hands sizing authority to the
      inline style below. */
            className={cn(
                "sm:max-w-none max-h-none max-w-none flex flex-col overflow-hidden",
                className
            )}
            style={{
                width: `min(${Math.round(size.w)}px, 94vw)`,
                height: `min(${Math.round(size.h)}px, 88dvh)`,
                ...style,
            }}
            {...rest}
        >
            {/* Inner scroll region — the children keep flex-column layout
          (header / body / footer stack) while anything taller than the
          dialog scrolls HERE, so the grips below stay pinned to the
          visible box (see the PINNED GRIPS note above). */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {children}
            </div>
            {/* right edge — width only (free) or width-driven ratio scale */}
            <div
                role="separator"
                aria-label={ratioMode ? "Resize width and height in ratio" : "Resize width"}
                onPointerDown={onPointerDown("e")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn(
                    "absolute top-3 bottom-5 right-0 w-1.5 cursor-ew-resize touch-none z-[60]",
                    "bg-transparent hover:bg-emerald-500/50 focus-visible:bg-emerald-500/60 transition-colors"
                )}
            />
            {/* bottom edge — height only (free) or height-driven ratio scale */}
            <div
                role="separator"
                aria-label={ratioMode ? "Resize height and width in ratio" : "Resize height"}
                onPointerDown={onPointerDown("s")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn(
                    "absolute left-3 right-5 bottom-0 h-1.5 cursor-ns-resize touch-none z-[60]",
                    "bg-transparent hover:bg-emerald-500/50 focus-visible:bg-emerald-500/60 transition-colors"
                )}
            />
            {/* bottom-right corner — both (free) or one scale factor (ratio) */}
            <div
                role="separator"
                aria-label={ratioMode ? "Resize width and height in ratio" : "Resize width and height"}
                title={ratioMode ? "Drag to resize — keeps the dialog's aspect ratio (Settings → Editor → Modal resizing)" : "Drag to resize (free) — switch to Ratio mode in Settings → Editor → Modal resizing"}
                onPointerDown={onPointerDown("se")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn(
                    "absolute bottom-0 right-0 size-4 touch-none z-[61]",
                    ratioMode ? "cursor-alias" : "cursor-nwse-resize"
                )}
            >
                <svg viewBox="0 0 16 16" className="size-4 text-muted-foreground/70" aria-hidden="true">
                    <path d="M14 6 6 14M14 10l-4 4M14 12l-2 2" stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" fill="none"/>
                </svg>
            </div>
            {/* Free ⇄ Ratio quick toggle — pinned at the dialog's bottom-right,
          just left of the corner grip. Clicking flips the app-wide modal
          resize mode (persisted; every resizable dialog follows). */}
            <button
                type="button"
                onClick={toggleResizeMode}
                aria-pressed={ratioMode}
                title={
                    ratioMode
                        ? "Ratio resizing is ON — drags grow width AND height together. Click for Free (independent edges). Also in Settings → Editor → Modal resizing."
                        : "Free resizing is ON — edges move independently. Click for Ratio (proportional growth). Also in Settings → Editor → Modal resizing."
                }
                className="absolute bottom-0.5 right-5 z-[62] rounded border border-border/70 bg-muted/60 px-1 py-px text-[9px] font-semibold leading-tight text-muted-foreground opacity-80 transition-opacity hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
            >
                {ratioMode ? "1:1 ratio" : "free"}
            </button>
        </DialogContent>
    );
}
