"use client";

/**
 * the "Image studio" category — 27
 * editing tools that share ONE engine (src/lib/image-ops.ts):
 *
 *   ▸ CSS-filter ops    blur · brightness · contrast · saturation · hue ·
 *                       grayscale · sepia · invert · opacity
 *   ▸ pixel-loop ops    sharpen · posterize · solarize · threshold ·
 *                       pixelate · film grain · vignette · emboss · edge
 *   ▸ drawImage ops     rotate 90° · flip H · flip V · resize · crop
 *   ▸ decorations       watermark text · border/frame · rounded corners
 *   ▸ export            convert format (PNG/JPEG/WebP + quality)
 *
 * Every tool is the same UX: drop an image → live canvas preview that
 * re-renders on every slider move (the engine renders at FULL
 * resolution, the preview is a faithful downscale) → "Apply / Export"
 * produces a Blob which is ALWAYS delivered through the
 * OutputDeliveryDialog (copy / save-as / save-into-project), never a
 * silent download. 100% offline.
 */

import * as React from "react";
import {Loader2, Upload} from "lucide-react";
import {fetchPreloadFile, toolboxSaveTarget, useToolboxPreload} from "@/lib/toolbox-preload";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";
import {
    canvasToBlob,
    clampRect,
    convolveRaster,
    cssFilterString,
    EDGE_KERNEL,
    EMBOSS_KERNEL,
    type FilterParams,
    grainRaster,
    invertRaster,
    loadImageFile,
    pixelateRaster,
    posterizeRaster,
    type Raster,
    renderImagePlan,
    type RenderPlan,
    sharpenKernel,
    solarizeRaster,
    thresholdRaster,
    vignetteRaster,
    watermarkAnchor,
} from "@/lib/image-ops";

/* "Save into project" resolves through toolboxSaveTarget
 *  (preload folder → source file's folder; else the project root). */

/* ─── shared bits (local copies so the suite files stay independent) ── */

function Note({children}: { children: React.ReactNode }) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Err({children}: { children: React.ReactNode }) {
    return <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">{children}</p>;
}

function Check({checked, onChange, label}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="size-3.5 accent-emerald-600"
            />
            {label}
        </label>
    );
}

function Sel<T extends string>({
                                   value,
                                   onValueChange,
                                   options,
                                   ariaLabel,
                               }: {
    value: T;
    onValueChange: (v: T) => void;
    options: ReadonlyArray<readonly [T, string]>;
    ariaLabel: string;
}) {
    return (
        <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
            <SelectTrigger size="sm" className="h-8 text-xs" aria-label={ariaLabel}>
                <SelectValue/>
            </SelectTrigger>
            <SelectContent>
                {options.map(([v, label]) => (
                    <SelectItem key={v} value={v} className="text-xs">
                        {label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** The drop-zone / file-picker shared by every Image studio tool. */
function Drop({file, onPick}: { file: File | null; onPick: (f: File | null) => void }) {
    return (
        <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onPick(f);
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"
        >
            <Upload className="size-3.5 shrink-0"/>
            <span className="truncate">
        {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Drop an image or click to browse (PNG · JPEG · WebP · GIF · BMP)"}
      </span>
            <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
        </label>
    );
}

/* ─── tool specs ────────────────────────────────────────────────── */

type ParamValues = Record<string, number | string | boolean>;

interface BuildCtx {
    w: number;
    h: number;
    /** per-session grain seed so preview and export match */
    seed: number;
}

interface BuiltPlan {
    plan: RenderPlan;
    /** export MIME (default image/png) */
    type?: string;
    /** 0…1, only for lossy formats */
    quality?: number;
    /** appended to the source name ("-blur"); "" = keep the plain name */
    suffix?: string;
}

interface ControlSpec {
    key: string;
    label: string;
    kind: "range" | "select" | "check" | "text" | "color" | "number";
    def: number | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    placeholder?: string;
    options?: ReadonlyArray<readonly [string, string]>;
}

interface ImageToolSpec {
    id: string;
    label: string;
    hint: string;
    controls: ControlSpec[];
    build: (p: ParamValues, ctx: BuildCtx) => BuiltPlan;
}

const num = (p: ParamValues, key: string): number => {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
};
const bool = (p: ParamValues, key: string): boolean => p[key] === true;
const str = (p: ParamValues, key: string): string => (typeof p[key] === "string" ? (p[key] as string) : "");

/** One-liner for the ctx.filter-family tools. */
function filterTool(
    id: string,
    label: string,
    hint: string,
    controls: ControlSpec[],
    filterOf: (p: ParamValues) => FilterParams
): ImageToolSpec {
    return {
        id,
        label,
        hint,
        controls,
        build: (p) => ({plan: {filter: cssFilterString(filterOf(p))}, suffix: id.replace(/^img-/, "")}),
    };
}

/** One-liner for the pixel-loop tools. */
function pixelTool(
    id: string,
    label: string,
    hint: string,
    controls: ControlSpec[],
    op: (p: ParamValues, ctx: BuildCtx) => (r: Raster) => Raster
): ImageToolSpec {
    return {
        id,
        label,
        hint,
        controls,
        build: (p, ctx) => ({plan: {pixelOps: [op(p, ctx)]}, suffix: id.replace(/^img-/, "")}),
    };
}

const POSITION_OPTIONS: ReadonlyArray<readonly [string, string]> = [
    ["top-left", "Top left"],
    ["top-center", "Top center"],
    ["top-right", "Top right"],
    ["left", "Middle left"],
    ["center", "Center"],
    ["right", "Middle right"],
    ["bottom-left", "Bottom left"],
    ["bottom-center", "Bottom center"],
    ["bottom-right", "Bottom right"],
];

const IMAGE_TOOLS: ImageToolSpec[] = [
    /* — CSS filter ops — */
    filterTool("img-blur", "Blur", "Gaussian blur via the canvas CSS filter.", [{
        key: "blur",
        label: "Radius",
        kind: "range",
        def: 8,
        min: 0,
        max: 40,
        step: 1,
        unit: "px"
    }], (p) => ({blur: num(p, "blur")})),
    filterTool("img-brightness", "Brightness", "Scale every channel brighter or darker.", [{
        key: "v",
        label: "Brightness",
        kind: "range",
        def: 120,
        min: 0,
        max: 200,
        step: 1,
        unit: "%"
    }], (p) => ({brightness: num(p, "v")})),
    filterTool("img-contrast", "Contrast", "Stretch or flatten the tonal range.", [{
        key: "v",
        label: "Contrast",
        kind: "range",
        def: 130,
        min: 0,
        max: 200,
        step: 1,
        unit: "%"
    }], (p) => ({contrast: num(p, "v")})),
    filterTool("img-saturation", "Saturation", "From gray (0%) to candy (300%).", [{
        key: "v",
        label: "Saturation",
        kind: "range",
        def: 160,
        min: 0,
        max: 300,
        step: 1,
        unit: "%"
    }], (p) => ({saturate: num(p, "v")})),
    filterTool("img-hue", "Hue rotate", "Spin the color wheel.", [{
        key: "v",
        label: "Angle",
        kind: "range",
        def: 90,
        min: 0,
        max: 360,
        step: 1,
        unit: "°"
    }], (p) => ({hueRotate: num(p, "v")})),
    filterTool("img-grayscale", "Grayscale", "Desaturate to monochrome.", [{
        key: "v",
        label: "Amount",
        kind: "range",
        def: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%"
    }], (p) => ({grayscale: num(p, "v")})),
    filterTool("img-sepia", "Sepia", "The vintage sepia wash.", [{
        key: "v",
        label: "Amount",
        kind: "range",
        def: 80,
        min: 0,
        max: 100,
        step: 1,
        unit: "%"
    }], (p) => ({sepia: num(p, "v")})),
    filterTool("img-invert", "Invert colors", "Negative-image flip.", [{
        key: "v",
        label: "Amount",
        kind: "range",
        def: 100,
        min: 0,
        max: 100,
        step: 1,
        unit: "%"
    }], (p) => ({invert: num(p, "v")})),
    {
        id: "img-opacity",
        label: "Opacity",
        hint: "Fade the image over a white background.",
        controls: [{key: "v", label: "Opacity", kind: "range", def: 60, min: 0, max: 100, step: 1, unit: "%"}],
        build: (p) => ({
            plan: {filter: cssFilterString({opacity: num(p, "v")}), background: "#ffffff"},
            suffix: "opacity",
        }),
    },

    /* — pixel-loop ops — */
    pixelTool("img-sharpen", "Sharpen", "Unsharp-style 3×3 kernel.", [{
        key: "amount",
        label: "Amount",
        kind: "range",
        def: 40,
        min: 0,
        max: 100,
        step: 1,
        unit: "%"
    }], (p) => (r) => convolveRaster(r, sharpenKernel(num(p, "amount")))),
    pixelTool("img-posterize", "Posterize", "Quantize to N tones per channel.", [{
        key: "levels",
        label: "Levels",
        kind: "range",
        def: 4,
        min: 2,
        max: 16,
        step: 1
    }], (p) => (r) => posterizeRaster(r, num(p, "levels"))),
    pixelTool("img-solarize", "Solarize", "Sabattier effect — the ramp flips above the threshold.", [{
        key: "t",
        label: "Threshold",
        kind: "range",
        def: 128,
        min: 0,
        max: 255,
        step: 1
    }], (p) => (r) => solarizeRaster(r, num(p, "t"))),
    pixelTool("img-threshold", "Threshold (B/W)", "Hard black-and-white cut.", [{
        key: "t",
        label: "Threshold",
        kind: "range",
        def: 128,
        min: 0,
        max: 255,
        step: 1
    }], (p) => (r) => thresholdRaster(r, num(p, "t"))),
    pixelTool("img-pixelate", "Pixelate", "Chunky mosaic blocks (source pixels).", [{
        key: "block",
        label: "Block size",
        kind: "range",
        def: 12,
        min: 2,
        max: 64,
        step: 1,
        unit: "px"
    }], (p) => (r) => pixelateRaster(r, num(p, "block"))),
    {
        id: "img-grain",
        label: "Film grain",
        hint: "Deterministic noise — the preview and the export match exactly.",
        controls: [
            {key: "amount", label: "Amount", kind: "range", def: 18, min: 0, max: 60, step: 1},
            {key: "mono", label: "Mono", kind: "check", def: true},
        ],
        build: (p, ctx) => ({
            plan: {pixelOps: [(r) => grainRaster(r, num(p, "amount"), ctx.seed, bool(p, "mono"))]},
            suffix: "grain",
        }),
    },
    pixelTool("img-vignette", "Vignette", "Darken the corners like an old lens.", [{
        key: "v",
        label: "Strength",
        kind: "range",
        def: 45,
        min: 0,
        max: 100,
        step: 1,
        unit: "%"
    }], (p) => (r) => vignetteRaster(r, num(p, "v") / 100)),
    pixelTool("img-emboss", "Emboss", "Classic emboss kernel (sums to 1).", [], () => (r) => convolveRaster(r, EMBOSS_KERNEL)),
    {
        id: "img-edge",
        label: "Edge detect",
        hint: "Laplacian-8 edge response as grayscale.",
        controls: [{key: "invert", label: "Invert (white lines)", kind: "check", def: false}],
        build: (p) => ({
            plan: {
                pixelOps: [
                    (r) => convolveRaster(r, EDGE_KERNEL, {gray: true, abs: true}),
                    ...(bool(p, "invert") ? [invertRaster] : []),
                ],
            },
            suffix: "edges",
        }),
    },

    /* — drawImage transforms — */
    {
        id: "img-rotate",
        label: "Rotate 90°",
        hint: "Quarter-turn clockwise (repeat for 180°/270°).",
        controls: [
            {
                key: "angle",
                label: "Angle",
                kind: "select",
                def: "90",
                options: [
                    ["90", "90° CW"],
                    ["180", "180°"],
                    ["270", "270° (90° CCW)"],
                ] as ReadonlyArray<readonly [string, string]>,
            },
        ],
        build: (p) => ({plan: {rotate: Math.round(num(p, "angle") / 90) % 4}, suffix: "rotated"}),
    },
    {
        id: "img-flip-h",
        label: "Flip horizontal",
        hint: "Mirror across the vertical axis.",
        controls: [],
        build: () => ({plan: {flipH: true}, suffix: "flipped-h"})
    },
    {
        id: "img-flip-v",
        label: "Flip vertical",
        hint: "Mirror across the horizontal axis.",
        controls: [],
        build: () => ({plan: {flipV: true}, suffix: "flipped-v"})
    },
    {
        id: "img-resize",
        label: "Resize / scale export",
        hint: "Bilinear-smoothed rescale (percent of the source).",
        controls: [{key: "pct", label: "Scale", kind: "range", def: 50, min: 5, max: 400, step: 5, unit: "%"}],
        build: (p) => ({plan: {outputScale: num(p, "pct") / 100}, suffix: `resized-${num(p, "pct")}pct`}),
    },
    {
        id: "img-crop",
        label: "Crop (numeric)",
        hint: "Source-pixel rectangle — clamped to the image bounds.",
        controls: [
            {key: "x", label: "X", kind: "number", def: 0, min: 0},
            {key: "y", label: "Y", kind: "number", def: 0, min: 0},
            {key: "w", label: "Width", kind: "number", def: 0, min: 1},
            {key: "h", label: "Height", kind: "number", def: 0, min: 1},
        ],
        build: (p, ctx) => ({
            plan: {crop: clampRect(num(p, "x"), num(p, "y"), num(p, "w") || ctx.w, num(p, "h") || ctx.h, ctx.w, ctx.h)},
            suffix: "cropped",
        }),
    },

    /* — decorations — */
    {
        id: "img-watermark",
        label: "Watermark text",
        hint: "Drawn at full resolution on top of the pixels.",
        controls: [
            {key: "text", label: "Text", kind: "text", def: "© Praxis", placeholder: "© your name"},
            {key: "size", label: "Font size", kind: "range", def: 48, min: 8, max: 200, step: 1, unit: "px"},
            {key: "pos", label: "Position", kind: "select", def: "bottom-right", options: POSITION_OPTIONS},
            {key: "alpha", label: "Opacity", kind: "range", def: 70, min: 5, max: 100, step: 1, unit: "%"},
            {key: "color", label: "Color", kind: "color", def: "#ffffff"},
            {key: "shadow", label: "Drop shadow", kind: "check", def: true},
        ],
        build: (p) => ({
            plan: {
                decorate: (ctx, canvas) => {
                    const size = Math.max(8, num(p, "size"));
                    const text = str(p, "text");
                    ctx.save();
                    ctx.globalAlpha = Math.min(1, Math.max(0.05, num(p, "alpha") / 100));
                    ctx.font = `bold ${size}px system-ui, sans-serif`;
                    ctx.fillStyle = str(p, "color") || "#ffffff";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "top";
                    if (bool(p, "shadow")) {
                        ctx.shadowColor = "rgba(0,0,0,0.55)";
                        ctx.shadowBlur = Math.max(2, size / 12);
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 1;
                    }
                    const tw = ctx.measureText(text).width;
                    const anchor = watermarkAnchor(canvas.width, canvas.height, tw, size, str(p, "pos") || "bottom-right");
                    ctx.fillText(text, anchor.x, anchor.y);
                    ctx.restore();
                },
            },
            suffix: "watermarked",
        }),
    },
    {
        id: "img-border",
        label: "Border / frame",
        hint: "Stroke a frame inside the edges.",
        controls: [
            {key: "w", label: "Width", kind: "range", def: 16, min: 1, max: 100, step: 1, unit: "px"},
            {key: "color", label: "Color", kind: "color", def: "#ffffff"},
        ],
        build: (p) => ({
            plan: {
                decorate: (ctx, canvas) => {
                    const w = Math.max(1, num(p, "w"));
                    ctx.save();
                    ctx.strokeStyle = str(p, "color") || "#ffffff";
                    ctx.lineWidth = w;
                    ctx.strokeRect(w / 2, w / 2, canvas.width - w, canvas.height - w);
                    ctx.restore();
                },
            },
            suffix: "framed",
        }),
    },
    {
        id: "img-rounded",
        label: "Rounded corners",
        hint: "Clips to a rounded rect — corners go transparent (PNG).",
        controls: [{key: "r", label: "Radius", kind: "range", def: 64, min: 0, max: 500, step: 1, unit: "px"}],
        build: (p) => ({
            plan: {
                decorate: (ctx, canvas) => {
                    const r = Math.min(num(p, "r"), canvas.width / 2, canvas.height / 2);
                    if (r <= 0) return;
                    const w = canvas.width;
                    const h = canvas.height;
                    ctx.save();
                    ctx.globalCompositeOperation = "destination-in";
                    ctx.beginPath();
                    ctx.moveTo(r, 0);
                    ctx.lineTo(w - r, 0);
                    ctx.quadraticCurveTo(w, 0, w, r);
                    ctx.lineTo(w, h - r);
                    ctx.quadraticCurveTo(w, h, w - r, h);
                    ctx.lineTo(r, h);
                    ctx.quadraticCurveTo(0, h, 0, h - r);
                    ctx.lineTo(0, r);
                    ctx.quadraticCurveTo(0, 0, r, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                },
            },
            suffix: "rounded",
        }),
    },

    /* — export — */
    {
        id: "img-convert",
        label: "Convert format",
        hint: "Re-encode as PNG / JPEG / WebP with a quality slider (lossy formats).",
        controls: [
            {
                key: "format",
                label: "Format",
                kind: "select",
                def: "png",
                options: [
                    ["png", "PNG (lossless)"],
                    ["jpeg", "JPEG (lossy)"],
                    ["webp", "WebP (lossy)"],
                ] as ReadonlyArray<readonly [string, string]>,
            },
            {key: "q", label: "Quality", kind: "range", def: 90, min: 10, max: 100, step: 1, unit: "%"},
        ],
        build: (p) => {
            const format = str(p, "format") || "png";
            const type = `image/${format}`;
            return {
                plan: format === "jpeg" ? {background: "#ffffff"} : {},
                type,
                quality: format === "png" ? undefined : num(p, "q") / 100,
                suffix: "",
            };
        },
    },

    /* — the +3 additions that bring Image Studio to 30 tools —
      * tint (multiply a color over the frame), scanlines (CRT rows) and
      * glitch (seeded horizontal slice offsets). All three are pixelOps
      * so the preview and the export run the exact same code. */
    pixelTool(
        "img-tint",
        "Tint",
        "Multiply a color over the whole frame (white keeps, black kills).",
        [
            {key: "color", label: "Color", kind: "color", def: "#38bdf8"},
            {key: "strength", label: "Strength", kind: "range", def: 50, min: 0, max: 100, step: 1, unit: "%"},
        ],
        (p) => (r) => {
            const hex = str(p, "color") || "#ffffff";
            const mix = num(p, "strength") / 100;
            const tr = parseInt(hex.slice(1, 3), 16);
            const tg = parseInt(hex.slice(3, 5), 16);
            const tb = parseInt(hex.slice(5, 7), 16);
            const out = new Uint8ClampedArray(r.data);
            for (let i = 0; i < out.length; i += 4) {
                for (let c = 0; c < 3; c++) {
                    const tint = c === 0 ? tr : c === 1 ? tg : tb;
                    out[i + c] = out[i + c] * (1 - mix) + (out[i + c] * tint) / 255 * mix;
                }
            }
            return {width: r.width, height: r.height, data: out};
        }
    ),
    pixelTool(
        "img-scanlines",
        "Scanlines (CRT)",
        "Every Nth row dims — the old-tube display effect.",
        [
            {key: "gap", label: "Row gap", kind: "range", def: 3, min: 2, max: 10, step: 1, unit: "px"},
            {key: "dark", label: "Darkening", kind: "range", def: 45, min: 5, max: 90, step: 1, unit: "%"},
        ],
        (p) => (r) => {
            const gap = Math.max(2, Math.round(num(p, "gap")));
            const dark = num(p, "dark") / 100;
            const out = new Uint8ClampedArray(r.data);
            for (let y = 0; y < r.height; y++) {
                if (y % gap === gap - 1) {
                    for (let x = 0; x < r.width; x++) {
                        const i = (y * r.width + x) * 4;
                        out[i] *= 1 - dark;
                        out[i + 1] *= 1 - dark;
                        out[i + 2] *= 1 - dark;
                    }
                }
            }
            return {width: r.width, height: r.height, data: out};
        }
    ),
    pixelTool(
        "img-glitch",
        "Glitch (slice shift)",
        "Deterministic horizontal slice offsets — preview and export always match.",
        [
            {key: "count", label: "Slices", kind: "range", def: 14, min: 4, max: 60, step: 1},
            {key: "shift", label: "Max shift", kind: "range", def: 60, min: 5, max: 200, step: 1, unit: "px"},
        ],
        (p, ctx) => (r) => {
            const slices = Math.max(2, Math.round(num(p, "count")));
            const maxShift = num(p, "shift");
            const out = new Uint8ClampedArray(r.data);
            // deterministic PRNG from the session seed
            let s = (ctx.seed || 1) >>> 0;
            const rand = () => {
                s = (s * 1664525 + 1013904223) >>> 0;
                return s / 0xffffffff;
            };
            const band = Math.max(1, Math.floor(r.height / slices));
            for (let b = 0; b < slices; b++) {
                const y0 = b * band;
                const y1 = Math.min(r.height, y0 + band);
                const shift = Math.round((rand() * 2 - 1) * maxShift);
                if (shift === 0) continue;
                for (let y = y0; y < y1; y++) {
                    for (let x = 0; x < r.width; x++) {
                        const srcX = (x - shift + r.width) % r.width;
                        const di = (y * r.width + x) * 4;
                        const si = (y * r.width + srcX) * 4;
                        out[di] = r.data[si];
                        out[di + 1] = r.data[si + 1];
                        out[di + 2] = r.data[si + 2];
                        out[di + 3] = r.data[si + 3];
                    }
                }
            }
            return {width: r.width, height: r.height, data: out};
        }
    ),
];

/* ─── the shared engine UI ──────────────────────────────────────── */

export function ImageStudio({toolId}: { toolId: string }) {
    const spec = React.useMemo(() => IMAGE_TOOLS.find((t) => t.id === toolId), [toolId]);
    const [file, setFile] = React.useState<File | null>(null);
    const [img, setImg] = React.useState<HTMLImageElement | null>(null);
    const [params, setParams] = React.useState<ParamValues>({});
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [delivery, setDelivery] = React.useState<{ blob: Blob; name: string } | null>(null);
    const [deliveryOpen, setDeliveryOpen] = React.useState(false);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    /** per-session grain seed — identical preview & export */
    const seedRef = React.useRef(1234);
    // preload channel — the file open in the viewer when the
    // toolbox was opened from the image view/edit UI
    // (praxis:open-toolbox) loads automatically, no re-drop needed.
    const preload = useToolboxPreload();

    // fetch the preloaded file once.
    React.useEffect(() => {
        if (!preload || file) return;
        let cancelled = false;
        void fetchPreloadFile(preload).then((f) => {
            if (f && !cancelled) setFile(f);
        });
        return () => {
            cancelled = true;
        };
    }, [preload, file]);

    // control defaults whenever the tool changes
    React.useEffect(() => {
        const d: ParamValues = {};
        for (const c of spec?.controls ?? []) d[c.key] = c.def;
        setParams(d);
        setError(null);
    }, [spec]);

    // decode the picked file
    React.useEffect(() => {
        if (!file) {
            setImg(null);
            return;
        }
        let cancelled = false;
        setError(null);
        void loadImageFile(file)
            .then((el) => {
                if (!cancelled) setImg(el);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError((err as Error).message);
            });
        seedRef.current = (Date.now() % 100000) + 1;
        return () => {
            cancelled = true;
        };
    }, [file]);

    // the crop tool starts as the full image
    React.useEffect(() => {
        if (img && toolId === "crop") {
            setParams((p) => ({...p, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight}));
        }
    }, [img, toolId]);

    // live preview — full-res render, downscaled onto the preview canvas
    React.useEffect(() => {
        if (!img || !spec) return;
        let cancelled = false;
        const t = window.setTimeout(() => {
            if (cancelled) return;
            try {
                const built = spec.build(params, {w: img.naturalWidth, h: img.naturalHeight, seed: seedRef.current});
                const full = renderImagePlan(img, built.plan);
                const preview = canvasRef.current;
                if (preview) {
                    const scale = Math.min(720 / full.width, 460 / full.height, 1);
                    preview.width = Math.max(1, Math.round(full.width * scale));
                    preview.height = Math.max(1, Math.round(full.height * scale));
                    const ctx = preview.getContext("2d");
                    if (ctx) ctx.drawImage(full, 0, 0, preview.width, preview.height);
                }
            } catch (err) {
                setError((err as Error).message);
            }
        }, 40);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [img, spec, params]);

    const setParam = (key: string, value: number | string | boolean) => {
        setParams((p) => ({...p, [key]: value}));
    };

    const exportImage = async () => {
        if (!img || !spec || !file) return;
        setBusy(true);
        setError(null);
        try {
            const built = spec.build(params, {w: img.naturalWidth, h: img.naturalHeight, seed: seedRef.current});
            const canvas = renderImagePlan(img, built.plan);
            const type = built.type ?? "image/png";
            const blob = await canvasToBlob(canvas, type, built.quality);
            const base = file.name.replace(/\.[^.]+$/, "");
            const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
            const name = built.suffix ? `${base}-${built.suffix}.${ext}` : `${base}.${ext}`;
            setDelivery({blob, name});
            setDeliveryOpen(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (!spec) return <Note>Unknown tool.</Note>;

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {/* show where the preloaded image came from. */}
            {preload && file && (
                <Note>
                    Loaded from the open file <span className="font-mono">{file.name}</span> — pick another
                    above to switch.
                </Note>
            )}

            {error && <Err>{error}</Err>}

            {/* controls */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {spec.controls.map((c) => {
                    const v = params[c.key];
                    if (c.kind === "range") {
                        const val = typeof v === "number" ? v : (c.def as number);
                        return (
                            <label key={c.key} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">{c.label}</span>
                                <input
                                    type="range"
                                    min={c.min}
                                    max={c.max}
                                    step={c.step}
                                    value={val}
                                    onChange={(e) => setParam(c.key, Number(e.target.value))}
                                    className="h-1.5 w-36 accent-emerald-600"
                                    aria-label={c.label}
                                />
                                <span className="w-16 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {val}
                                    {c.unit ?? ""}
                </span>
                            </label>
                        );
                    }
                    if (c.kind === "number") {
                        const val = typeof v === "number" ? v : 0;
                        return (
                            <label key={c.key} className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">{c.label}</span>
                                <Input
                                    type="number"
                                    value={Number.isFinite(val) ? val : ""}
                                    min={c.min}
                                    max={c.max}
                                    onChange={(e) => setParam(c.key, Number(e.target.value) || 0)}
                                    className="h-8 w-24 text-xs"
                                    aria-label={c.label}
                                />
                            </label>
                        );
                    }
                    if (c.kind === "select") {
                        return (
                            <div key={c.key} className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">{c.label}</span>
                                <Sel
                                    value={typeof v === "string" ? v : (c.def as string)}
                                    onValueChange={(next) => setParam(c.key, next)}
                                    options={c.options ?? []}
                                    ariaLabel={c.label}
                                />
                            </div>
                        );
                    }
                    if (c.kind === "check") {
                        return <Check key={c.key} checked={v === true} onChange={(next) => setParam(c.key, next)}
                                      label={c.label}/>;
                    }
                    if (c.kind === "color") {
                        return (
                            <label key={c.key} className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">{c.label}</span>
                                <input
                                    type="color"
                                    value={typeof v === "string" ? v : (c.def as string)}
                                    onChange={(e) => setParam(c.key, e.target.value)}
                                    className="h-6 w-9 cursor-pointer rounded border bg-background"
                                    aria-label={c.label}
                                />
                            </label>
                        );
                    }
                    return (
                        <label key={c.key} className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">{c.label}</span>
                            <Input
                                value={typeof v === "string" ? v : ""}
                                placeholder={c.placeholder}
                                onChange={(e) => setParam(c.key, e.target.value)}
                                className="h-8 w-44 text-xs"
                                aria-label={c.label}
                            />
                        </label>
                    );
                })}
            </div>

            {/* preview */}
            <div className="grid place-items-center rounded-md border bg-muted/20 p-2">
                {img ? (
                    <canvas
                        ref={canvasRef}
                        className="max-h-[560px] max-w-full rounded"
                        style={{background: "repeating-conic-gradient(rgba(128,128,128,0.18) 0% 25%, transparent 0% 50%) 50% / 16px 16px"}}
                        aria-label="Live preview"
                    />
                ) : (
                    <p className="py-10 text-xs text-muted-foreground">Pick an image to see the live preview.</p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!img || busy}
                        onClick={() => void exportImage()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Rendering…" : "Apply / Export"}
                </Button>
                <Note>{spec.hint}</Note>
            </div>
            {img && (
                <Note>
                    {img.naturalWidth} × {img.naturalHeight} px source — the preview is a faithful downscale of the
                    exact
                    full-resolution render that will be exported.
                </Note>
            )}

            <OutputDeliveryDialog
                open={deliveryOpen}
                onOpenChange={setDeliveryOpen}
                title="Image Ready"
                description="Choose copy to clipboard, save-as download, or save into the project folder."
                blob={delivery?.blob ?? null}
                defaultName={delivery?.name ?? "image.png"}
                folderSlug={toolboxSaveTarget(preload)}
            />
        </div>
    );
}

/** Registry factory: one component per tool id. */
export function imageStudioTool(id: string): React.ComponentType {
    const C = function ImageStudioEntry() {
        return <ImageStudio toolId={id}/>;
    };
    C.displayName = `ImageStudio(${id})`;
    return C;
}
