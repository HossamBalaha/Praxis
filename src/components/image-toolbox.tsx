"use client";

import * as React from "react";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    Crop,
    Download,
    EyeOff,
    FlipHorizontal,
    FlipVertical,
    Grid3x3,
    Maximize2,
    Minus,
    Pipette,
    PlayCircle,
    Plus,
    RotateCcw,
    RotateCw,
    SlidersHorizontal,
    StopCircle,
    X,
    ZoomIn,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";
import {loadSettings} from "@/lib/settings";

/**
 * the image toolbox. redesign.
 *
 * ▸ PROBE, redesigned — instead of a cramped footer readout there is
 * now a proper INSPECTOR side panel: a magnifier loupe (13×13 real
 * pixels at 9× scale with a center crosshair) that follows the
 * cursor over the image, a large color swatch, HEX / RGB / HSL
 * values each with a copy button, the pixel coordinate and the
 * nearest named CSS color. Toggle with the Pipette button.
 * ▸ CROP → the OutputDeliveryDialog: after dragging a
 * selection the user CHOOSES copy-to-clipboard / save-as-download /
 * save-into-project instead of a silent download. Crop coordinates
 * are only accepted while the image is unrotated (the rotation
 * transform makes the rect math lie — the button explains).
 * ▸ GALLERY options — a thumbnail rail of the sibling images, prev /
 * next navigation, a slideshow, zoom presets (fit / 100% / 200%)
 * and fullscreen.
 */

interface ImageToolboxProps {
    src: string;
    fileName: string;
    /** Other images in the same folder (for compare + gallery). */
    siblings: Array<{ fileSlug: string; fileName: string; src: string }>;
    onLoaded?: () => void;
    /** The MAIN image failed to load (missing file / unsupported
     *  format) — the FileViewer swaps its skeleton overlay for an
     *  error card instead of waiting forever. Gallery thumbnails and
     *  compare images report nothing here — a broken sibling must not
     *  error the whole viewer. */
    onError?: () => void;
    /** Controlled zoom — when provided, the toolbox's own zoom buttons,
     *  presets, Ctrl+wheel and the HOST's View ▸ Zoom In / Out / Reset
     *  all drive THIS value (the FileViewer's per-kind zoom), so every
     *  zoom surface agrees. Omitted → the toolbox keeps its internal
     *  state (standalone mounts behave exactly as before). */
    controlledZoom?: number;
    onZoomChange?: (zoom: number) => void;
}

/** rgb → hsl. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
}

/** A compact table of the classic named CSS colors (nearest match). */
const NAMED_COLORS: Array<[string, number, number, number]> = [
    ["black", 0, 0, 0], ["white", 255, 255, 255], ["red", 255, 0, 0], ["lime", 0, 255, 0],
    ["blue", 0, 0, 255], ["yellow", 255, 255, 0], ["cyan", 0, 255, 255], ["magenta", 255, 0, 255],
    ["silver", 192, 192, 192], ["gray", 128, 128, 128], ["maroon", 128, 0, 0], ["olive", 128, 128, 0],
    ["green", 0, 128, 0], ["purple", 128, 0, 128], ["teal", 0, 128, 128], ["navy", 0, 0, 128],
    ["orange", 255, 165, 0], ["pink", 255, 192, 203], ["brown", 165, 42, 42], ["gold", 255, 215, 0],
    ["coral", 255, 127, 80], ["orchid", 218, 112, 214], ["indigo", 75, 0, 130], ["ivory", 255, 255, 240],
    ["khaki", 240, 230, 140], ["lavender", 230, 230, 250], ["moccasin", 255, 228, 181], ["salmon", 250, 128, 114],
    ["sienna", 160, 82, 45], ["tan", 210, 180, 140], ["tomato", 255, 99, 71], ["turquoise", 64, 224, 208],
    ["violet", 238, 130, 238], ["wheat", 245, 222, 179], ["azure", 240, 255, 255], ["beige", 245, 245, 220],
    ["bisque", 255, 228, 196], ["chocolate", 210, 105, 30], ["crimson", 220, 20, 60], ["darkblue", 0, 0, 139],
    ["darkgreen", 0, 100, 0], ["darkorange", 255, 140, 0], ["darkred", 139, 0, 0], ["forestgreen", 34, 139, 34],
    ["hotpink", 255, 105, 180], ["lightblue", 173, 216, 230], ["lightgray", 211, 211, 211], ["lightgreen", 144, 238, 144],
    ["lightyellow", 255, 255, 224], ["midnightblue", 25, 25, 112], ["orangered", 255, 69, 0], ["palegreen", 152, 251, 152],
    ["plum", 221, 160, 221], ["royalblue", 65, 105, 225], ["seagreen", 46, 139, 87], ["slategray", 112, 128, 144],
    ["steelblue", 70, 130, 180], ["thistle", 216, 191, 216],
];

function nearestNamedColor(r: number, g: number, b: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [name, cr, cg, cb] of NAMED_COLORS) {
        const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
        if (d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
    return best;
}

const LOUPE_N = 13; // 13×13 pixels
const LOUPE_SCALE = 9;

export function ImageToolbox({
                                 src,
                                 fileName,
                                 siblings,
                                 onLoaded,
                                 onError,
                                 controlledZoom,
                                 onZoomChange
                             }: ImageToolboxProps) {
    const {toast} = useToast();
    const isSvg = fileName.toLowerCase().endsWith(".svg");
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const loupeRef = React.useRef<HTMLCanvasElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [internalZoom, setInternalZoom] = React.useState(1);
    /** Controlled-vs-internal zoom: the FileViewer passes its per-kind
     *  zoom so the right-click View ▸ Zoom In / Out / Reset items (which
     *  used to mutate a font-zoom state the image never read — dead
     *  controls) now move the image too. */
    const zoom = controlledZoom !== undefined ? controlledZoom : internalZoom;
    /** The last value THIS component pushed up via onZoomChange — lets
     *  the scroll-correction effect below tell a host-driven zoom change
     *  (the FileViewer's header +/- and View ▸ Zoom items mutate the
     *  controlled prop directly) from our own emitted one, so host zooms
     *  can be center-anchored too. */
    const lastEmittedZoomRef = React.useRef<number | null>(null);
    const setZoom = React.useCallback(
        (next: number | ((z: number) => number)) => {
            const value = typeof next === "function" ? next(controlledZoom !== undefined ? controlledZoom : internalZoom) : next;
            const clamped = Math.min(8, Math.max(0.1, value));
            if (onZoomChange) {
                lastEmittedZoomRef.current = clamped;
                onZoomChange(clamped);
            } else {
                lastEmittedZoomRef.current = null;
                setInternalZoom(clamped);
            }
        },
        [controlledZoom, internalZoom, onZoomChange]
    );
    const [rotation, setRotation] = React.useState(0);
    /* WHEEL ZOOM — plain mouse wheel (and Ctrl+wheel) over the image
       viewport zooms in/out, ANCHORED ON THE CURSOR: the image point
       under the pointer stays under the pointer while the scale
       changes (the layout effect right below shifts the viewport
       scroll after each new scale commits).
       Attached as a NON-passive NATIVE listener on the viewport
       container: React's synthetic onWheel is passive, so the
       preventDefault that stops the outer code viewport from
       scrolling while the wheel drives the zoom would be a silent
       no-op there. stopPropagation additionally keeps the app-wide
       Ctrl+wheel code-font zoomer (window-level) out of it — over an
       image, the wheel belongs to the image. Shift+wheel stays a plain
       scroll escape hatch; panning a zoomed image stays drag-based.
       The step is EXPONENTIAL in the delta (clamped per event), so a
       trackpad's small deltas creep smoothly and a discrete wheel
       notch steps the same visible amount. */
    const wheelAnchorRef = React.useRef<{ cx: number; cy: number; fx: number; fy: number } | null>(null);
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheelNative = (e: WheelEvent) => {
            if (e.shiftKey) return;
            e.preventDefault();
            e.stopPropagation();
            // Remember the point under the cursor as FRACTIONS of the
            // current VISUAL box — valid under rotation and flips too.
            const img = imgRef.current;
            if (img) {
                const r = img.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    wheelAnchorRef.current = {
                        cx: e.clientX,
                        cy: e.clientY,
                        fx: (e.clientX - r.left) / r.width,
                        fy: (e.clientY - r.top) / r.height,
                    };
                }
            }
            const step = Math.max(-120, Math.min(120, e.deltaY));
            setZoom((z) => Math.min(8, Math.max(0.1, z * Math.exp(-step * 0.002))));
        };
        el.addEventListener("wheel", onWheelNative, {passive: false});
        return () => el.removeEventListener("wheel", onWheelNative);
    }, [setZoom]);
    /* Button / preset zooms anchor at the VIEWPORT CENTER: the image
       point currently in the middle of the viewport stays in the
       middle while the scale changes — the same scroll-correction
       the wheel path uses, seeded with the center point instead of
       the cursor. When the image still fits the viewport the
       correction is a no-op (small images simply grow from the
       layout origin); once it overflows, the +/- buttons and the
       View ▸ presets zoom in and out around the middle of the
       image instead of drifting toward the top-left corner.
       Equal-value clicks (pressing a preset already active) bail
       before seeding the anchor, so no stale anchor can leak into
       a later host-driven (controlled) zoom change. */
    const zoomAtCenter = React.useCallback(
        (next: number | ((z: number) => number)) => {
            const current = controlledZoom !== undefined ? controlledZoom : internalZoom;
            const value = typeof next === "function" ? next(current) : next;
            const clamped = Math.min(8, Math.max(0.1, value));
            if (clamped === current) return;
            const el = containerRef.current;
            const img = imgRef.current;
            if (el && img) {
                const cont = el.getBoundingClientRect();
                const r = img.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && cont.width > 0 && cont.height > 0) {
                    const cx = cont.left + cont.width / 2;
                    const cy = cont.top + cont.height / 2;
                    wheelAnchorRef.current = {
                        cx,
                        cy,
                        fx: (cx - r.left) / r.width,
                        fy: (cy - r.top) / r.height,
                    };
                }
            }
            setZoom(next);
        },
        [controlledZoom, internalZoom, setZoom]
    );
    /* Cursor-anchored zoom, step 2: once the new scale has committed
       (useLayoutEffect — after the DOM update, before paint; transform
       only, no layout thrash), re-center the viewport scroll so the
       anchored image point lands back under the cursor. When the image
       still fits the viewport the scroll is a no-op and the zoom simply
       grows from the layout origin; once it overflows, every wheel step
       zooms exactly toward the pointer. (Deps are [zoom, controlledZoom]:
       the anchor is consumed by wheel/button zoom changes — both seed
       it before committing — while a controlled change we did NOT emit
       is a HOST zoom (the FileViewer's header +/- and View ▸ Zoom items)
       and gets the CENTER-anchor treatment directly below.) */
    React.useLayoutEffect(() => {
        const el = containerRef.current;
        const img = imgRef.current;
        if (!el || !img) return;
        const a = wheelAnchorRef.current;
        if (!a) {
            /* Host-driven zoom: no anchor was seeded — anchor at the
               viewport CENTER (the image point in the middle stays in the
               middle), same as our own buttons. Skipped when the prop just
               echoes what we emitted, and when uncontrolled. */
            if (controlledZoom === undefined || controlledZoom === lastEmittedZoomRef.current) return;
            const cont = el.getBoundingClientRect();
            const r = img.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0 || cont.width <= 0 || cont.height <= 0) return;
            const cx = cont.left + cont.width / 2;
            const cy = cont.top + cont.height / 2;
            const fx = (cx - r.left) / r.width;
            const fy = (cy - r.top) / r.height;
            const dx = (r.left - cont.left) + fx * r.width - (cx - cont.left);
            const dy = (r.top - cont.top) + fy * r.height - (cy - cont.top);
            if (dx) el.scrollLeft += dx;
            if (dy) el.scrollTop += dy;
            return;
        }
        wheelAnchorRef.current = null;
        const cont = el.getBoundingClientRect();
        const r = img.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const dx = (r.left - cont.left) + a.fx * r.width - (a.cx - cont.left);
        const dy = (r.top - cont.top) + a.fy * r.height - (a.cy - cont.top);
        if (dx) el.scrollLeft += dx;
        if (dy) el.scrollTop += dy;
    }, [zoom, controlledZoom]);
    /* the missing view transforms — flip H/V (like every
        image application) + rotate CCW to pair with the CW button. */
    const [flipH, setFlipH] = React.useState(false);
    const [flipV, setFlipV] = React.useState(false);
    /*
        a transparency checkerboard behind the image — PNG/WebP/AVIF
        alpha reads correctly instead of blending into the theme. */
    const [checker, setChecker] = React.useState(false);
    /* quick enhance panel — brightness / contrast /
        saturation sliders + grayscale / invert toggles (a light
        "image editing application" pass for the VIEW; the full
        toolbox suite remains one click away via Tools ▸). */
    const [enhanceOpen, setEnhanceOpen] = React.useState(false);
    const [enhance, setEnhance] = React.useState({
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: false,
        invert: false
    });
    const enhanceActive =
        enhance.brightness !== 100 || enhance.contrast !== 100 || enhance.saturate !== 100 || enhance.grayscale || enhance.invert;
    const enhanceCss = `brightness(${enhance.brightness}%) contrast(${enhance.contrast}%) saturate(${enhance.saturate}%)${enhance.grayscale ? " grayscale(1)" : ""}${enhance.invert ? " invert(1)" : ""}`;
    /* gallery options — thumbnail size + slideshow interval
   override (the "more options for media gallery"). */
    const [thumbSize, setThumbSize] = React.useState<"s" | "m" | "l">("s");
    const [slideInterval, setSlideInterval] = React.useState(0); // 0 = settings default
    const [probe, setProbe] = React.useState<{
        x: number;
        y: number;
        hex: string;
        rgb: string;
        hsl: string;
        name: string | null
    } | null>(null);
    const [inspectorOpen, setInspectorOpen] = React.useState(!isSvg);
    const [compareSlug, setCompareSlug] = React.useState<string>("");
    const [blink, setBlink] = React.useState(false);
    const [crop, setCrop] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    /** Natural size of the currently displayed image (set on load) — the
     *  crop overlay below maps its NATURAL-pixel coordinates into the
     *  layout box via percentages, so the green rect stays anchored to the
     *  exact image pixels at every zoom level (and under flips), instead
     *  of shifting the way a rect scaled about its own corner does. */
    const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(null);
    const cropStartRef = React.useRef<{ x: number; y: number } | null>(null);
    const panRef = React.useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
    const [loupePos, setLoupePos] = React.useState<{ left: number; top: number } | null>(null);
    /** Gallery: index into [main, ...siblings]; null = main image. */
    const [galleryIdx, setGalleryIdx] = React.useState<number | null>(null);
    const [slideshow, setSlideshow] = React.useState(false);
    /** crop delivery dialog. */
    const [cropBlob, setCropBlob] = React.useState<Blob | null>(null);
    const [cropInfo, setCropInfo] = React.useState<{ w: number; h: number } | null>(null);
    const [cropOpen, setCropOpen] = React.useState(false);
    /** The folder slug, parsed from the src URL (?folder=…&file=…). */
    const folderSlug = React.useMemo(() => {
        try {
            const u = new URL(src, window.location.href);
            return u.searchParams.get("folder") ?? "";
        } catch {
            return "";
        }
    }, [src]);

    const gallery = React.useMemo(
        () => [{fileSlug: "", fileName, src}, ...siblings],
        [fileName, src, siblings]
    );
    const viewIdx = galleryIdx ?? 0;
    const viewSrc = gallery[viewIdx]?.src ?? src;
    const viewName = gallery[viewIdx]?.fileName ?? fileName;

    const compareSrc = siblings.find((s) => s.fileSlug === compareSlug)?.src ?? null;
    const [compareVisible, setCompareVisible] = React.useState(true);

    React.useEffect(() => {
        if (blink && compareSrc) {
            const t = window.setInterval(() => setCompareVisible((v) => !v), 800);
            return () => window.clearInterval(t);
        }
        setCompareVisible(true);
    }, [blink, compareSrc]);

    // the navbar's "Cancel compare" broadcasts
    // praxis:cancel-compare — clear OUR side-by-side state too so the
    // second image hides without an extra manual click down here.
    React.useEffect(() => {
        const onCancel = () => {
            setCompareSlug("");
            setBlink(false);
        };
        window.addEventListener("praxis:cancel-compare", onCancel);
        return () => window.removeEventListener("praxis:cancel-compare", onCancel);
    }, []);

    // Slideshow: advance through the gallery — the
    // interval + loop come from Settings → Media (slideshow timing
    // config) so both slideshow surfaces agree; re-read on save so an
    // open gallery picks changes up immediately.
    const [slideshowStyle, setSlideshowStyle] = React.useState(() => {
        const s = loadSettings();
        return {
            intervalSeconds: Math.max(1, Math.min(60, s.slideshowIntervalSeconds ?? 3)),
            loop: s.slideshowLoop !== false,
        };
    });
    React.useEffect(() => {
        const onChanged = () => {
            const s = loadSettings();
            setSlideshowStyle({
                intervalSeconds: Math.max(1, Math.min(60, s.slideshowIntervalSeconds ?? 3)),
                loop: s.slideshowLoop !== false,
            });
        };
        window.addEventListener("praxis:settings-saved", onChanged);
        return () => window.removeEventListener("praxis:settings-saved", onChanged);
    }, []);
    React.useEffect(() => {
        if (!slideshow || gallery.length < 2) return;
        const t = window.setInterval(() => {
            setGalleryIdx((i) => {
                const cur = i ?? 0;
                if (cur >= gallery.length - 1) {
                    if (slideshowStyle.loop) return 0;
                    setSlideshow(false); // reached the end, loop is off
                    return cur;
                }
                return cur + 1;
            });
        }, (slideInterval || slideshowStyle.intervalSeconds) * 1000);
        return () => window.clearInterval(t);
    }, [slideshow, gallery.length, slideshowStyle, slideInterval]);

    // Reset per-image state when the gallery view changes.
    React.useEffect(() => {
        setProbe(null);
        setCrop(null);
    }, [viewSrc]);

    // Pixel probe via a same-size canvas copy of the image.
    // the copy carries the quick-enhance filter so the
    // inspector/loupe report the colors the user is actually LOOKING
    // at (filtered view), not the raw underneath.
    React.useEffect(() => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas || viewSrc.toLowerCase().includes(".svg")) return;
        if (!img.complete || img.naturalWidth === 0) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        if (enhanceActive) {
            try {
                ctx.filter = enhanceCss;
            } catch {
                /* filter unsupported — raw pixels then */
            }
        } else {
            ctx.filter = "none";
        }
        ctx.drawImage(img, 0, 0);
        ctx.filter = "none";
    }, [viewSrc, zoom, rotation, onLoaded, enhanceActive, enhanceCss]);

    const drawLoupe = (x: number, y: number) => {
        const img = imgRef.current;
        const ctx = canvasRef.current?.getContext("2d");
        const loupe = loupeRef.current;
        if (!img || !ctx || !loupe) return;
        const half = Math.floor(LOUPE_N / 2);
        loupe.width = LOUPE_N * LOUPE_SCALE;
        loupe.height = LOUPE_N * LOUPE_SCALE;
        const lctx = loupe.getContext("2d");
        if (!lctx) return;
        lctx.imageSmoothingEnabled = false;
        try {
            const sx = Math.max(0, Math.min(img.naturalWidth - LOUPE_N, x - half));
            const sy = Math.max(0, Math.min(img.naturalHeight - LOUPE_N, y - half));
            lctx.drawImage(canvasRef.current!, sx, sy, LOUPE_N, LOUPE_N, 0, 0, loupe.width, loupe.height);
            // Center-pixel crosshair.
            const c = (half + 0.5) * LOUPE_SCALE;
            lctx.strokeStyle = "rgba(255,255,255,0.9)";
            lctx.lineWidth = 1;
            lctx.beginPath();
            lctx.moveTo(c - 6, c);
            lctx.lineTo(c + 6, c);
            lctx.moveTo(c, c - 6);
            lctx.lineTo(c, c + 6);
            lctx.stroke();
            lctx.strokeStyle = "rgba(0,0,0,0.7)";
            lctx.beginPath();
            lctx.moveTo(c - 7, c);
            lctx.lineTo(c + 7, c);
            lctx.moveTo(c, c - 7);
            lctx.lineTo(c, c + 7);
            lctx.stroke();
        } catch {
            /* tainted canvas */
        }
    };

    const onProbeMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isSvg || !inspectorOpen) return;
        const img = imgRef.current;
        if (!img || img.naturalWidth === 0) return;
        const rect = img.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            setProbe(null);
            setLoupePos(null);
            return;
        }
        const x = Math.round(((e.clientX - rect.left) / rect.width) * img.naturalWidth);
        const y = Math.round(((e.clientY - rect.top) / rect.height) * img.naturalHeight);
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        try {
            const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
            const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
            const [h, s, l] = rgbToHsl(r, g, b);
            setProbe({
                x,
                y,
                hex,
                rgb: `rgb(${r}, ${g}, ${b})`,
                hsl: `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
                name: nearestNamedColor(r, g, b),
            });
            drawLoupe(x, y);
            // Loupe follows the cursor, offset to the lower-right.
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (containerRect) {
                setLoupePos({
                    left: Math.min(e.clientX - containerRect.left + 18, containerRect.width - LOUPE_N * LOUPE_SCALE - 8),
                    top: Math.min(e.clientY - containerRect.top + 18, containerRect.height - LOUPE_N * LOUPE_SCALE - 8),
                });
            }
        } catch {
            /* tainted canvas (external src) — probe quietly off */
        }
    };

    /** crop → Blob → OutputDeliveryDialog.
     * mirrored selection math when the view is flipped, and
     *  the quick-enhance filter is baked into the exported crop. */
    const prepareCrop = () => {
        if (!crop) return;
        const img = imgRef.current;
        if (!img || isSvg) return;
        // Map the VISUALLY selected rectangle back to source pixels —
        // flips mirror the canvas the user dragged over.
        const rawX1 = Math.min(crop.x1, crop.x2);
        const rawX2 = Math.max(crop.x1, crop.x2);
        const rawY1 = Math.min(crop.y1, crop.y2);
        const rawY2 = Math.max(crop.y1, crop.y2);
        const sx = flipH ? img.naturalWidth - rawX2 : rawX1;
        const sy = flipV ? img.naturalHeight - rawY2 : rawY1;
        const sw = rawX2 - rawX1;
        const sh = rawY2 - rawY1;
        if (sw < 2 || sh < 2) {
            toast({title: "Drag a crop rectangle on the image first", variant: "destructive"});
            return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        if (enhanceActive) {
            try {
                ctx.filter = enhanceCss;
            } catch {
                /* filter unsupported — raw crop then */
            }
        }
        ctx.drawImage(img, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    toast({
                        title: "Crop failed",
                        description: "The canvas could not encode a PNG.",
                        variant: "destructive"
                    });
                    return;
                }
                setCropBlob(blob);
                setCropInfo({w: canvas.width, h: canvas.height});
                setCropOpen(true);
            },
            "image/png"
        );
    };

    // Crop rectangle in IMAGE coordinates.
    const onCropStart = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.shiftKey || e.altKey) return; // pan uses plain drag below
        const img = imgRef.current;
        if (!img || isSvg) return;
        if (rotation % 360 !== 0) {
            // The rotated bounding rect makes fraction math lie — refuse
            // politely instead of cropping the wrong region.
            return;
        }
        const rect = img.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
        cropStartRef.current = {
            x: ((e.clientX - rect.left) / rect.width) * img.naturalWidth,
            y: ((e.clientY - rect.top) / rect.height) * img.naturalHeight,
        };
        setCrop(null);
    };
    const onCropMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const start = cropStartRef.current;
        const img = imgRef.current;
        if (!start || !img) return;
        const rect = img.getBoundingClientRect();
        setCrop({
            x1: start.x,
            y1: start.y,
            x2: ((e.clientX - rect.left) / rect.width) * img.naturalWidth,
            y2: ((e.clientY - rect.top) / rect.height) * img.naturalHeight,
        });
    };

    const showCropBox = crop && Math.abs(crop.x2 - crop.x1) > 3 && Math.abs(crop.y2 - crop.y1) > 3;

    const copyValue = (v: string, label: string) => {
        void navigator.clipboard
            .writeText(v)
            .then(() => toast({title: `${label} copied`, description: v, variant: "success"}));
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void containerRef.current?.requestFullscreen?.();
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar —: one slim row. Zoom / Fit / Enhance
/ Full stay in front; the view transforms (rotate / flip /
presets) and the analyzers (Inspector / Crop) collapse into
dropdowns. The duplicate Tools ▸ dropdown was REMOVED — the
FileViewer header's Tools menu (next to the zoom cluster) is
the single toolbox entry point. */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => zoomAtCenter((z) => Math.max(0.1, z / 1.25))}
                        title="Zoom out (anchored on the middle of the image)">
                    <Minus className="size-3.5"/>
                </Button>
                <span className="text-[10px] font-mono w-12 text-center"
                      title="Current zoom — double-click the image to reset to 100%">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => zoomAtCenter((z) => Math.min(8, z * 1.25))}
                        title="Zoom in (anchored on the middle of the image)">
                    <Plus className="size-3.5"/>
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => zoomAtCenter(1)}
                        title="Reset the zoom to 100% (same as double-clicking the image)">
                    Fit
                </Button>
                {/* View ▸ — rotate / flip / reset / size presets */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                                title="Rotate, flip, zoom presets and reset the view">
                            <RotateCw className="size-3.5"/> View <ChevronDown className="size-3"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Transforms</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setRotation((r) => (r + 90) % 360)}
                                          className="gap-2 cursor-pointer">
                            <RotateCw className="size-3.5"/> Rotate 90° clockwise
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRotation((r) => (r + 270) % 360)}
                                          className="gap-2 cursor-pointer">
                            <RotateCcw className="size-3.5"/> Rotate 90° counter-clockwise
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFlipH((f) => !f)} className="gap-2 cursor-pointer">
                            <FlipHorizontal
                                className={cn("size-3.5", flipH && "text-emerald-500")}/> {flipH ? "Unflip" : "Flip"} horizontally
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFlipV((f) => !f)} className="gap-2 cursor-pointer">
                            <FlipVertical
                                className={cn("size-3.5", flipV && "text-emerald-500")}/> {flipV ? "Unflip" : "Flip"} vertically
                        </DropdownMenuItem>
                        {/* transparency checkerboard (view-only). */}
                        <DropdownMenuItem
                            onClick={() => setChecker((c) => !c)}
                            className="gap-2 cursor-pointer"
                            title="Show a checkerboard behind the image so transparent areas read as transparent (PNG / WebP / AVIF alpha)"
                        >
                            <Grid3x3 className={cn("size-3.5", checker && "text-emerald-500")}/>
                            {checker ? "Hide" : "Show"} transparency checkerboard
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Zoom presets</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => zoomAtCenter(2)} className="gap-2 cursor-pointer">
                            <ZoomIn className="size-3.5"/> Actual size (100%)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => zoomAtCenter(4)} className="gap-2 cursor-pointer">
                            <ZoomIn className="size-3.5"/> Double actual size (200%)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem
                            onClick={() => {
                                zoomAtCenter(1);
                                setRotation(0);
                                setFlipH(false);
                                setFlipV(false);
                                setEnhance({
                                    brightness: 100,
                                    contrast: 100,
                                    saturate: 100,
                                    grayscale: false,
                                    invert: false
                                });
                            }}
                            className="gap-2 cursor-pointer"
                        >
                            <Maximize2 className="size-3.5"/> Reset view &amp; filters
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* quick enhance (view-only brightness / contrast /
            saturation / grayscale / invert — the full toolbox suite is
            in the header's Tools ▸). */}
                <Button variant={enhanceOpen ? "default" : "ghost"} size="sm"
                        className={cn("h-7 gap-1 text-xs", enhanceActive && !enhanceOpen && "text-emerald-600 dark:text-emerald-400")}
                        onClick={() => setEnhanceOpen((v) => !v)}
                        title="Quick enhance — brightness / contrast / saturation sliders + grayscale &amp; invert (view-only; bake them into a crop with Crop → PNG)">
                    <SlidersHorizontal className="size-3.5"/> Enhance
                </Button>
                {/* Analyze ▸ — inspector + crop (image tools that act ON the
            bitmap rather than the view). */}
                {!isSvg && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"
                                    className={cn("h-7 gap-1 text-xs", inspectorOpen && "text-emerald-600 dark:text-emerald-400")}
                                    title="Inspect colors or crop a region to PNG">
                                <Pipette className="size-3.5"/> Analyze <ChevronDown className="size-3"/>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                            <DropdownMenuItem
                                onClick={() => setInspectorOpen((v) => !v)}
                                className="gap-2 cursor-pointer"
                                title="Toggle the color inspector panel (loupe + HEX/RGB/HSL + nearest named color)"
                            >
                                <Pipette className={cn("size-3.5", inspectorOpen && "text-emerald-500")}/>
                                <span className="flex-1">{inspectorOpen ? "Hide Inspector" : "Color Inspector"}</span>
                                <span className="text-[10px] text-muted-foreground">loupe · HEX · HSL</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={prepareCrop}
                                disabled={rotation % 360 !== 0}
                                className="gap-2 cursor-pointer"
                                title={rotation % 360 !== 0 ? "Reset the rotation first — crop coordinates only work on the unrotated image" : "Drag a selection on the image, then choose copy / save-as / save-into-project"}
                            >
                                <Crop className="size-3.5"/>
                                <span className="flex-1">Crop → PNG…</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={toggleFullscreen}
                        title="Fullscreen the image viewport">
                    <Maximize2 className="size-3.5"/> Full
                </Button>
                {siblings.length > 0 && (
                    <>
                        <div className="w-px h-5 bg-border mx-1"/>
                        <select
                            value={compareSlug}
                            onChange={(e) => setCompareSlug(e.target.value)}
                            className="h-7 rounded-md border bg-background px-1.5 text-[11px] max-w-40"
                            aria-label="Compare with another image"
                        >
                            <option value="">Compare with…</option>
                            {siblings.map((s) => (
                                <option key={s.fileSlug} value={s.fileSlug}>{s.fileName}</option>
                            ))}
                        </select>
                        {compareSlug && (
                            <Button
                                variant={blink ? "default" : "outline"}
                                size="sm"
                                className="h-7 gap-1 text-[11px]"
                                onClick={() => setBlink((b) => !b)}
                                title="Alternate between the two images every 0.8 s — differences pop out"
                            >
                                <EyeOff className="size-3"/> Blink
                            </Button>
                        )}
                        {/* an EXPLICIT exit from compare mode — the
user no longer has to re-open "Compare with…" and pick
the empty option to hide the second image. */}
                        {compareSlug && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-[11px]"
                                onClick={() => {
                                    setCompareSlug("");
                                    setBlink(false);
                                }}
                                title="Exit compare mode — show only this image"
                            >
                                <X className="size-3"/> Cancel compare
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* the quick-enhance panel — brightness / contrast /
          saturation sliders + grayscale &amp; invert toggles (view-only;
          the export path bakes them into Crop → PNG). */}
            {enhanceOpen && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b bg-muted/10">
                    {(
                        [
                            ["brightness", "Brightness"],
                            ["contrast", "Contrast"],
                            ["saturate", "Saturation"],
                        ] as Array<["brightness" | "contrast" | "saturate", string]>
                    ).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground">{label}</span>
                            <input
                                type="range"
                                min={20}
                                max={200}
                                step={1}
                                value={enhance[key]}
                                onChange={(e) => setEnhance((p) => ({...p, [key]: Number(e.target.value)}))}
                                className="h-1.5 w-28 accent-emerald-600"
                                aria-label={label}
                            />
                            <span
                                className="w-10 font-mono text-[10px] tabular-nums text-muted-foreground">{enhance[key]}%</span>
                        </label>
                    ))}
                    <label className="flex items-center gap-1.5 text-[11px]">
                        <input
                            type="checkbox"
                            checked={enhance.grayscale}
                            onChange={(e) => setEnhance((p) => ({...p, grayscale: e.target.checked}))}
                            className="accent-emerald-600"
                        />
                        <span className="text-muted-foreground">Grayscale</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px]">
                        <input
                            type="checkbox"
                            checked={enhance.invert}
                            onChange={(e) => setEnhance((p) => ({...p, invert: e.target.checked}))}
                            className="accent-emerald-600"
                        />
                        <span className="text-muted-foreground">Invert</span>
                    </label>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setEnhance({
                            brightness: 100,
                            contrast: 100,
                            saturate: 100,
                            grayscale: false,
                            invert: false
                        })}
                        disabled={!enhanceActive}
                        title="Reset the enhance sliders"
                    >
                        <RotateCcw className="size-3"/> Reset
                    </Button>
                </div>
            )}

            {/* Viewport + Inspector */}
            <div className="flex-1 min-h-0 flex">
                <div
                    ref={containerRef}
                    className={cn(
                        "flex-1 min-h-0 overflow-auto bg-[repeating-conic-gradient(hsl(var(--muted)/.15)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] grid place-items-center p-4 relative"
                    )}
                    onMouseMove={(e) => {
                        onProbeMove(e);
                        onCropMove(e);
                        if (panRef.current && containerRef.current) {
                            containerRef.current.scrollLeft = panRef.current.scrollX - (e.clientX - panRef.current.x);
                            containerRef.current.scrollTop = panRef.current.scrollY - (e.clientY - panRef.current.y);
                        }
                    }}
                    onMouseLeave={() => {
                        setProbe(null);
                        setLoupePos(null);
                    }}
                    onMouseDown={(e) => {
                        if (e.button === 0 && !e.shiftKey) {
                            onCropStart(e);
                            if (zoom > 1 && containerRef.current) {
                                panRef.current = {
                                    x: e.clientX,
                                    y: e.clientY,
                                    scrollX: containerRef.current.scrollLeft,
                                    scrollY: containerRef.current.scrollTop
                                };
                            }
                        }
                    }}
                    onMouseUp={() => {
                        cropStartRef.current = null;
                        panRef.current = null;
                    }}
                    /* Double-click resets the zoom to 100% (Shift+double-click
                       is left alone for precise crop clicking). */
                    onDoubleClick={(e) => {
                        if (e.shiftKey) return;
                        wheelAnchorRef.current = null;
                        setZoom(1);
                    }}
                    /* Wheel zoom lives on the native non-passive listener
                       attached in the effect above (plain wheel AND Ctrl+wheel
                       zoom, anchored on the cursor; Shift+wheel scrolls). */
                >
                    <div
                        className={cn("relative", compareSrc && !blink && "grid grid-cols-2 gap-4 place-items-center")}>
                        <div
                            className="relative inline-block"
                            style={
                                checker
                                    ? {
                                        backgroundImage:
                                            "linear-gradient(45deg, rgba(128,128,128,0.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.22) 75%), linear-gradient(45deg, rgba(128,128,128,0.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.22) 75%)",
                                        backgroundSize: "16px 16px",
                                        backgroundPosition: "0 0, 8px 8px",
                                    }
                                    : undefined
                            }
                        >
                            <img
                                key={viewSrc}
                                ref={imgRef}
                                src={viewSrc}
                                alt={viewName}
                                onLoad={() => {
                                    /* DECODE-GATED REVEAL: onLoad only means the bytes
                                     * arrived — the FileViewer's skeleton stays up until
                                     * the bitmap is actually decoded (img.decode()), so
                                     * the reveal never races the first paint of the
                                     * pixels. decode() rejects on a broken image: the
                                     * reveal still fires (the onError path below owns
                                     * the failure surface). */
                                    // Grab the mounted image element.
                                    const el = imgRef.current;
                                    // Record the natural pixel size for the crop overlay's percentage mapping.
                                    if (el && el.naturalWidth > 0) {
                                        setNatural({w: el.naturalWidth, h: el.naturalHeight});
                                    }
                                    // Reveal only after the bitmap decodes (or fails to).
                                    if (el && typeof el.decode === "function") {
                                        void el.decode().then(
                                            () => onLoaded?.(),
                                            () => onLoaded?.()
                                        );
                                    } else {
                                        // No decode() support — reveal immediately.
                                        onLoaded?.();
                                    }
                                }}
                                onError={() => onError?.()}
                                crossOrigin="anonymous"
                                className="max-w-none select-none"
                                style={{
                                    transform: `rotate(${rotation}deg) scale(${zoom * (flipH ? -1 : 1)}, ${zoom * (flipV ? -1 : 1)})`,
                                    transformOrigin: "top left",
                                    filter: enhanceActive ? enhanceCss : undefined,
                                    maxWidth: compareSrc ? "min(360px, 42vw)" : undefined,
                                    maxHeight: "70vh",
                                    width: "auto",
                                }}
                                draggable={false}
                            />
                            {showCropBox && natural && (
                                /* Zoom-anchored overlay: the green rect must scale
                                 * around the IMAGE origin (container top-left) exactly
                                 * like the img's own transform does — NOT around the
                                 * rect's own top-left corner, which is what kept it
                                 * drifting away from the pixels it was drawn over at
                                 * any zoom other than 100%. The full-size (inset-0)
                                 * layer carries the same scale+flip transform, and the
                                 * inner rect is placed with PERCENTAGES of the natural
                                 * size, so it also stays correct for images whose
                                 * layout box is height-capped (max-height fit) — the
                                 * percentages map natural px → layout px for free. */
                                <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        transform: `scale(${zoom * (flipH ? -1 : 1)}, ${zoom * (flipV ? -1 : 1)})`,
                                        transformOrigin: "0 0",
                                    }}
                                >
                                    <div
                                        className="absolute border-2 border-emerald-500 bg-emerald-500/20"
                                        style={{
                                            left: `${(Math.min(crop!.x1, crop!.x2) / natural.w) * 100}%`,
                                            top: `${(Math.min(crop!.y1, crop!.y2) / natural.h) * 100}%`,
                                            width: `${(Math.abs(crop!.x2 - crop!.x1) / natural.w) * 100}%`,
                                            height: `${(Math.abs(crop!.y2 - crop!.y1) / natural.h) * 100}%`,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                        {compareSrc && !blink && (
                            <figure className="text-center">
                                <img src={compareSrc} alt="comparison" className="max-w-full max-h-[70vh] mx-auto"
                                     style={{maxWidth: "min(360px, 42vw)"}}/>
                                <figcaption
                                    className="text-[10px] text-muted-foreground pt-1 truncate max-w-64 mx-auto">
                                    {siblings.find((s) => s.fileSlug === compareSlug)?.fileName}
                                </figcaption>
                            </figure>
                        )}
                        {compareSrc && blink && (
                            <img
                                src={compareVisible ? compareSrc : viewSrc}
                                alt="blink comparison"
                                className="max-w-full max-h-[70vh]"
                                style={{maxWidth: "min(560px, 60vw)"}}
                            />
                        )}
                    </div>
                    <canvas ref={canvasRef} className="hidden" aria-hidden="true"/>
                    {/* Magnifier loupe — follows the cursor while the inspector is on. */}
                    {inspectorOpen && loupePos && (
                        <canvas
                            ref={loupeRef}
                            className="absolute z-10 rounded-md border-2 border-background shadow-xl pointer-events-none"
                            style={{
                                left: loupePos.left,
                                top: loupePos.top,
                                width: LOUPE_N * LOUPE_SCALE,
                                height: LOUPE_N * LOUPE_SCALE
                            }}
                            aria-hidden="true"
                        />
                    )}
                </div>

                {/* ── Color inspector side panel ( redesign) ────── */}
                {inspectorOpen && !isSvg && (
                    <aside className="w-52 shrink-0 border-l bg-muted/10 overflow-y-auto p-3 space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Color
                            inspector</p>
                        {probe ? (
                            <>
                                <div className="flex items-center gap-2">
                                    <span className="size-12 rounded-lg border shadow-inner"
                                          style={{background: probe.hex}}/>
                                    <div className="min-w-0">
                                        <p className="text-sm font-mono font-semibold truncate">{probe.hex}</p>
                                        {probe.name &&
                                          <p className="text-[11px] text-muted-foreground truncate">≈ {probe.name}</p>}
                                        <p className="text-[10px] text-muted-foreground font-mono">({probe.x}, {probe.y})</p>
                                    </div>
                                </div>
                                {(
                                    [
                                        ["HEX", probe.hex],
                                        ["RGB", probe.rgb],
                                        ["HSL", probe.hsl],
                                    ] as Array<[string, string]>
                                ).map(([label, value]) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => copyValue(value, label)}
                                        className="w-full flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-left hover:bg-muted/50"
                                        title={`Copy ${value}`}
                                    >
                                        <span className="text-[10px] text-muted-foreground w-7 shrink-0">{label}</span>
                                        <span className="text-[11px] font-mono truncate flex-1">{value}</span>
                                        <Copy className="size-3 text-muted-foreground shrink-0"/>
                                    </button>
                                ))}
                                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                                    Hover the image: the loupe magnifies 13×13 real pixels; the swatch and values track
                                    the center pixel. Click a value to copy it.
                                </p>
                            </>
                        ) : (
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Hover the image to inspect pixels — a magnifier follows the cursor and the panel fills
                                with HEX / RGB / HSL values.
                            </p>
                        )}
                    </aside>
                )}
            </div>

            {/* Gallery rail + footer */}
            {gallery.length > 1 && (
                <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-muted/10 overflow-x-auto">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 shrink-0"
                        onClick={() => setGalleryIdx((i) => Math.max(0, (i ?? 0) - 1))}
                        disabled={viewIdx === 0}
                        title="Previous image in this folder"
                    >
                        <ChevronLeft className="size-3.5"/>
                    </Button>
                    {gallery.map((g, i) => (
                        <button
                            key={g.fileSlug || "main"}
                            type="button"
                            onClick={() => setGalleryIdx(i === 0 ? null : i)}
                            className={cn(
                                "shrink-0 rounded-md border-2 overflow-hidden transition-opacity",
                                i === viewIdx ? "border-emerald-500" : "border-transparent opacity-60 hover:opacity-100"
                            )}
                            title={g.fileName}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={g.src}
                                alt={g.fileName}
                                title={g.fileName}
                                className={cn(
                                    "object-cover bg-muted",
                                    thumbSize === "s" ? "size-10" : thumbSize === "m" ? "size-16" : "size-24"
                                )}
                                loading="lazy"
                            />
                        </button>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 shrink-0"
                        onClick={() => setGalleryIdx((i) => Math.min(gallery.length - 1, (i ?? 0) + 1))}
                        disabled={viewIdx === gallery.length - 1}
                        title="Next image in this folder"
                    >
                        <ChevronRight className="size-3.5"/>
                    </Button>
                    <Button
                        variant={slideshow ? "default" : "ghost"}
                        size="sm"
                        className="h-6 gap-1 text-[10px] shrink-0"
                        onClick={() => setSlideshow((s) => !s)}
                        title={`Cycle through this folder's images every ${slideInterval || slideshowStyle.intervalSeconds} s`}
                    >
                        {slideshow ? <StopCircle className="size-3"/> : <PlayCircle className="size-3"/>}
                        {slideshow ? "Stop" : "Slideshow"}
                    </Button>
                    {/* the media-gallery options —
per-session slideshow speed + thumbnail size. */}
                    <select
                        value={String(slideInterval || slideshowStyle.intervalSeconds)}
                        onChange={(e) => setSlideInterval(Number(e.target.value))}
                        className="h-6 shrink-0 rounded border bg-background px-1 text-[10px]"
                        aria-label="Slideshow interval"
                        title="How long each image stays on screen (Settings → Media holds the default)"
                    >
                        {[1, 2, 3, 4, 8, 12].map((s) => (
                            <option key={s} value={s}>{s}s</option>
                        ))}
                    </select>
                    <select
                        value={thumbSize}
                        onChange={(e) => setThumbSize(e.target.value as "s" | "m" | "l")}
                        className="h-6 shrink-0 rounded border bg-background px-1 text-[10px]"
                        aria-label="Thumbnail size"
                        title="Gallery thumbnail size"
                    >
                        <option value="s">Small</option>
                        <option value="m">Medium</option>
                        <option value="l">Large</option>
                    </select>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-3 px-3 py-1 border-t text-[10px] text-muted-foreground">
                <span className="truncate" title={viewName}>{viewName}</span>
                {gallery.length > 1 && (
                    <span className="shrink-0 tabular-nums">{viewIdx + 1} / {gallery.length}</span>
                )}
                {crop && showCropBox && (
                    <span className="shrink-0 text-emerald-600 dark:text-emerald-400 font-mono">
            crop {Math.round(Math.abs(crop.x2 - crop.x1))}×{Math.round(Math.abs(crop.y2 - crop.y1))}
          </span>
                )}
                <span className="ml-auto flex items-center gap-2">
          {!isSvg &&
            <span className="opacity-60">drag = crop box · wheel = zoom at cursor · double-click = 100% · Shift+wheel = scroll</span>}
                    {isSvg && <span className="opacity-60">vector — zoom is lossless</span>}
                    <a href={viewSrc} download={viewName}
                       className="inline-flex items-center gap-1 hover:text-foreground"
                       title="Download the original file">
            <Download className="size-3"/> Download
          </a>
        </span>
            </div>

            {/* crop delivery — copy / save-as / save-into-project. */}
            <OutputDeliveryDialog
                open={cropOpen}
                onOpenChange={setCropOpen}
                title="Crop Ready"
                description={
                    cropInfo
                        ? `${cropInfo.w}×${cropInfo.h} px PNG — choose what to do with it.`
                        : "Choose what to do with the cropped PNG."
                }
                blob={cropBlob}
                defaultName={`${viewName.replace(/\.[^.]+$/, "")}-crop.png`}
                folderSlug={folderSlug}
            />
        </div>
    );
}
