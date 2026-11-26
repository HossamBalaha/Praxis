"use client";

import * as React from "react";
import {DialogContent} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";
import {loadSettings, saveSettings} from "@/lib/settings";

/**
 * FloatingDialogContent — a DialogContent the user can DRAG anywhere on
 * screen by its top handle and RESIZE by its edges / corner, exactly
 * like a desktop tool window.
 *
 * ▸ Position + size persist per dialog id at praxis.modalFloat.<id> —
 * reopening starts where it was left; the default is centered at
 * defaultW × defaultH.
 * ▸ The drag handle is the small ⠿ pill pinned to the dialog's top edge
 * (never covers the content); pointer capture keeps the drag alive
 * outside the handle.
 * ▸ The drag clamps to the viewport: at least 96px of the window stays
 * reachable horizontally and 48px vertically, so it can never be
 * dragged fully off-screen.
 * ▸ Right / bottom / corner resize grips, capped by 94vw × 88dvh. The
 * grips sit OUTSIDE the dialog's inner scroll region, so they stay
 * grabbable however deep the content scrolls.
 *
 * RESIZE MODE (shared with ResizableDialogContent — one app-wide
 * setting): Free — edges move independently, the classic behavior;
 * Ratio — every drag grows width AND height together, keeping the
 * window's aspect ratio. Switch it from the corner chip on this
 * dialog (⤡ free ⇄ 1:1 ratio) or Settings → Editor → Modal resizing.
 */
export interface FloatingDialogContentProps
    extends React.ComponentProps<typeof DialogContent> {
    /** Persistence id — box stored at praxis.modalFloat.<id>. */
    id: string;
    /** First-open width in px. */
    defaultW?: number;
    /** First-open height in px (>= 9000 = fit 88dvh at mount). */
    defaultH?: number;
    /** Smallest draggable width. */
    minW?: number;
    /** Smallest draggable height. */
    minH?: number;
    /** FIT-CONTENT HEIGHT — the default behavior for this window on
     *  EVERY open: the height follows the contents (capped at
     *  defaultH / 88dvh). Dragging a height grip switches to manual
     *  height for the CURRENT window session; the next open is
     *  fit-content again (position + width are still remembered). */
    fitHeight?: boolean;
}

const BOX_PREFIX = "praxis.modalFloat";

interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

const FIT_H_SENTINEL = 0;

function loadBox(
    id: string,
    defaultW: number,
    defaultH: number
): { box: Box; fitH: boolean } {
    const w = Math.min(defaultW, Math.max(320, window.innerWidth * 0.94));
    const h = Math.min(defaultH, Math.max(240, window.innerHeight * 0.88));
    const fallback: Box = {
        x: Math.max(8, Math.round((window.innerWidth - w) / 2)),
        y: Math.max(8, Math.round((window.innerHeight - h) / 2)),
        w: Math.round(w),
        h: Math.round(h),
    };
    try {
        const raw = window.localStorage.getItem(`${BOX_PREFIX}.${id}`);
        if (!raw) return {box: fallback, fitH: false};
        const b = JSON.parse(raw) as Partial<Box>;
        if (
            Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h)
        ) {
            // h === 0 is the fit-content sentinel: position/width remembered,
            // height follows the content.
            if (b.h === FIT_H_SENTINEL && (b.w ?? 0) >= 320) {
                const box = {x: b.x as number, y: b.y as number, w: b.w as number, h: Math.round(h)};
                box.x = Math.min(Math.max(8 - box.w + 96, box.x), Math.max(8, window.innerWidth - 96));
                box.y = Math.min(Math.max(0, box.y), Math.max(8, window.innerHeight - 48));
                return {box, fitH: true};
            }
            if ((b.w ?? 0) >= 320 && (b.h ?? 0) >= 240) {
                const box = {x: b.x as number, y: b.y as number, w: b.w as number, h: b.h as number};
                // Re-clamp a persisted off-screen box (viewport shrank since).
                box.x = Math.min(Math.max(8 - box.w + 96, box.x), Math.max(8, window.innerWidth - 96));
                box.y = Math.min(Math.max(0, box.y), Math.max(8, window.innerHeight - 48));
                return {box, fitH: false};
            }
        }
    } catch {
        /* corrupted — fall through */
    }
    return {box: fallback, fitH: false};
}

type DragKind = "move" | "e" | "s" | "se";

export function FloatingDialogContent({
                                          id,
                                          defaultW = 720,
                                          defaultH = 520,
                                          minW = 480,
                                          minH = 360,
                                          fitHeight = false,
                                          className,
                                          style,
                                          children,
                                          ...rest
                                      }: FloatingDialogContentProps) {
    const resolvedDefaultH =
        defaultH >= 9000 && typeof window !== "undefined"
            ? Math.round(window.innerHeight * 0.88)
            : defaultH;
    const [state, setState] = React.useState<{ box: Box; fitH: boolean }>(() =>
        typeof window === "undefined"
            ? {box: {x: 8, y: 8, w: defaultW, h: resolvedDefaultH}, fitH: fitHeight}
            : (() => {
                const loaded = loadBox(id, defaultW, resolvedDefaultH);
                // fitHeight windows open in fit-content mode EVERY time —
                // the default behavior. A previously dragged manual height
                // applies only to the session it was dragged in; the stored
                // box still contributes its remembered position + width,
                // and the fit cap is the default height, never an old
                // dragged height.
                if (fitHeight) {
                    const defaultCap = Math.round(
                        Math.min(resolvedDefaultH, Math.max(240, window.innerHeight * 0.88))
                    );
                    return {box: {...loaded.box, h: defaultCap}, fitH: true};
                }
                return loaded;
            })()
    );
    const box = state.box;
    const fitH = state.fitH;
    const setBox = React.useCallback((updater: (prev: Box) => Box) => {
        setState((prev) => ({...prev, box: updater(prev.box)}));
    }, []);

    /** Free vs ratio resizing — the SAME app-wide setting the resizable
     *  dialogs use (Settings → Editor → Modal resizing), flippable from
     *  this window's corner chip. */
    const [ratioMode, setRatioMode] = React.useState(false);
    React.useEffect(() => {
        const read = () => setRatioMode(loadSettings().modalResizeMode === "ratio");
        read();
        window.addEventListener("praxis:settings-saved", read);
        return () => window.removeEventListener("praxis:settings-saved", read);
    }, []);

    /** Flip Free ⇄ Ratio from this window — persists into the settings
     *  store and broadcasts so every resizable / floating window
     *  follows. */
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

    React.useEffect(() => {
        if (!userDraggedRef.current) return;
        try {
            // While in fit-content mode the stored h is the sentinel 0 —
            // position + width persist, height re-fits on every open.
            window.localStorage.setItem(
                `${BOX_PREFIX}.${id}`,
                JSON.stringify(fitH ? {...box, h: FIT_H_SENTINEL} : box)
            );
        } catch {
            /* private mode */
        }
    }, [id, box, fitH]);

    const dragKind = React.useRef<DragKind | null>(null);
    const dragStart = React.useRef<{ x: number; y: number; box: Box } | null>(null);
    /** True once the user has actually DRAGGED something (move or resize)
     *  — the box only persists after a real drag, never from the
     *  auto-computed default, so fit-content mode survives re-opens. */
    const userDraggedRef = React.useRef(false);

    const onPointerDown = (kind: DragKind) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        userDraggedRef.current = true;
        dragKind.current = kind;
        dragStart.current = {x: e.clientX, y: e.clientY, box};
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* capture unsupported */
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const kind = dragKind.current;
        const start = dragStart.current;
        if (!kind || !start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        const maxW = Math.max(minW, Math.round(window.innerWidth * 0.94));
        const maxH = Math.max(minH, Math.round(window.innerHeight * 0.88));
        // Any height-affecting drag leaves fit-content mode — the user
        // takes manual control of the window height from here on.
        if (kind !== "move" && kind !== "e" && fitH) {
            setState((prev) => ({...prev, fitH: false}));
        }
        setBox((prev) => {
            if (kind === "move") {
                // Clamp: ≥96px reachable horizontally, ≥48px vertically.
                const x = Math.min(Math.max(8 - prev.w + 96, start.box.x + dx), Math.max(8, window.innerWidth - 96));
                const y = Math.min(Math.max(0, start.box.y + dy), Math.max(8, window.innerHeight - 48));
                if (x === prev.x && y === prev.y) return prev;
                return {...prev, x: Math.round(x), y: Math.round(y)};
            }
            if (!ratioMode) {
                // FREE — edges independent (the classic behavior).
                const w = Math.max(minW, Math.min(maxW, start.box.w + (kind === "s" ? 0 : dx)));
                const h = Math.max(minH, Math.min(maxH, start.box.h + (kind === "e" ? 0 : dy)));
                if (w === prev.w && h === prev.h) return prev;
                return {...prev, w: Math.round(w), h: Math.round(h)};
            }
            // RATIO — width AND height grow together, preserving the
            // window's aspect ratio; the clamps keep the shape.
            const ratio = start.box.w / start.box.h || 1;
            let scale: number;
            if (kind === "se") {
                scale = Math.abs(dx) > Math.abs(dy) ? (start.box.w + dx) / start.box.w : (start.box.h + dy) / start.box.h;
            } else if (kind === "e") {
                scale = (start.box.w + dx) / start.box.w;
            } else {
                scale = (start.box.h + dy) / start.box.h;
            }
            if (!Number.isFinite(scale) || scale <= 0) return prev;
            let w = start.box.w * scale;
            let h = start.box.h * scale;
            if (w > maxW) {
                w = maxW;
                h = w / ratio;
            }
            if (h > maxH) {
                h = maxH;
                w = h * ratio;
            }
            if (w < minW || h < minH) {
                const lift = Math.max(minW / w, minH / h);
                w = Math.min(maxW, w * lift);
                h = Math.min(maxH, h * lift);
            }
            w = Math.round(w);
            h = Math.round(h);
            if (w === prev.w && h === prev.h) return prev;
            return {...prev, w, h};
        });
    };

    const onPointerUp = (e: React.PointerEvent) => {
        dragKind.current = null;
        dragStart.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* not captured */
        }
    };

    /* SSR-safe viewport bounds — window only exists client-side; during
     * prerender the raw box values pass through unclamped. */
    const vw = typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth;
    const vh = typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerHeight;
    const clampX = (x: number) => Math.round(Math.min(Math.max(8 - box.w + 96, x), Math.max(8, vw - 96)));
    const clampY = (y: number) => Math.round(Math.min(Math.max(0, y), Math.max(8, vh - 48)));

    return (
        <DialogContent
            /* Cancel the base DialogContent's centering (left-50%/top-50% +
               translates + max-w caps) — twMerge drops the conflicting base
               utilities and the inline style below becomes the sole
               positioning authority. */
            className={cn(
                "left-0 top-0 translate-x-0 translate-y-0 sm:max-w-none max-w-none max-h-none flex flex-col overflow-hidden",
                className
            )}
            style={{
                position: "fixed",
                left: `${clampX(box.x)}px`,
                top: `${clampY(box.y)}px`,
                width: `min(${box.w}px, 94vw)`,
                // Fit-content mode: the height follows the children (capped by
                // the remembered/default box height and 88dvh); manual mode:
                // the exact dragged height.
                ...(fitH
                    ? {height: "auto", maxHeight: `min(${box.h}px, 88dvh)`}
                    : {height: `min(${box.h}px, 88dvh)`}),
                ...style,
            }}
            {...rest}
        >
            {/* Inner scroll region — children stack as a column while taller
          content scrolls HERE, so the grips below stay pinned. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>

            {/* Drag handle — the ⠿ pill pinned to the top edge. */}
            <div
                role="separator"
                aria-label="Drag to move the window"
                title="Drag to move this window anywhere on screen (position remembered)"
                onPointerDown={onPointerDown("move")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="absolute top-0 left-1/2 -translate-x-1/2 z-[63] flex h-5 w-28 cursor-move touch-none items-end justify-center"
            >
        <span
            className="flex h-3.5 w-24 items-center justify-center rounded-b-md border border-t-0 border-border/70 bg-muted/70 text-[8px] font-semibold tracking-widest text-muted-foreground select-none">
          ⠿
        </span>
            </div>

            {/* right edge — width */}
            <div
                role="separator"
                aria-label="Resize width"
                onPointerDown={onPointerDown("e")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn(
                    "absolute top-6 bottom-5 right-0 w-1.5 cursor-ew-resize touch-none z-[60]",
                    "bg-transparent hover:bg-emerald-500/50 focus-visible:bg-emerald-500/60 transition-colors"
                )}
            />
            {/* bottom edge — height */}
            <div
                role="separator"
                aria-label="Resize height"
                onPointerDown={onPointerDown("s")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn(
                    "absolute left-3 right-5 bottom-0 h-1.5 cursor-ns-resize touch-none z-[60]",
                    "bg-transparent hover:bg-emerald-500/50 focus-visible:bg-emerald-500/60 transition-colors"
                )}
            />
            {/* bottom-right corner — both */}
            <div
                role="separator"
                aria-label={ratioMode ? "Resize width and height in ratio" : "Resize width and height"}
                title={ratioMode
                    ? "Drag to resize — keeps the window's aspect ratio (click the corner chip for Free)"
                    : "Drag to resize (free) — click the corner chip for Ratio"}
                onPointerDown={onPointerDown("se")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={cn("absolute bottom-0 right-0 size-4 touch-none z-[61]", ratioMode ? "cursor-alias" : "cursor-nwse-resize")}
            >
                <svg viewBox="0 0 16 16" className="size-4 text-muted-foreground/70" aria-hidden="true">
                    <path d="M14 6 6 14M14 10l-4 4M14 12l-2 2" stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" fill="none"/>
                </svg>
            </div>
            {/* Free ⇄ Ratio quick toggle — same app-wide modal resize mode
          the resizable dialogs share. */}
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
