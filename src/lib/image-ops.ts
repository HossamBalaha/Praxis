/**
 * the image ENGINE + pure math behind the
 * Developer Toolbox's "Image studio" and "Image → text" categories.
 *
 * Layout:
 * ▸ PURE helpers — clamp / luminance / CSS-filter string / posterize /
 * solarize / threshold / vignette gain / kernels / ASCII ramps /
 * histograms / palette quantization / EXIF parsing. All of these run
 * in plain Node, so src/lib/__tests__/image-ops.test.ts covers them.
 * ▸ ENGINE helpers — loadImageFile / renderImagePlan / canvasToBlob.
 * They touch the DOM (Image, canvas, ctx.filter) only at CALL time,
 * never at import time, so importing this module stays Node-safe.
 *
 * The engine deliberately renders at FULL resolution every time (the
 * preview is a downscale of the true output) — that keeps filter blur,
 * crop rectangles and watermark fonts pixel-faithful between the live
 * preview and the exported Blob.
 */

/* ─── pure math ─────────────────────────────────────────────────── */

export function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

/** Integer gcd (used by aspect-ratio reduction). */
export function gcd(a: number, b: number): number {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x || 1;
}

/** Rec. 709 luma, rounded to an integer 0…255. */
export function luminance(r: number, g: number, b: number): number {
    return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

export function rgbToHex(r: number, g: number, b: number): string {
    const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return "—";
    if (n < 1024) return `${Math.round(n)} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

/** "16:9" when the ratio reduces cleanly, "1.78:1" otherwise. */
export function aspectRatioFraction(w: number, h: number): string {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "—";
    const g = gcd(w, h);
    const rw = Math.round(w / g);
    const rh = Math.round(h / g);
    if (rw <= 50 && rh <= 50) return `${rw}:${rh}`;
    return `${(w / h).toFixed(2)}:1`;
}

/* ─── CSS filter string (ctx.filter ops) ────────────────────────── */

export interface FilterParams {
    /** blur radius in px (0 = off) */
    blur?: number;
    /** percent, 100 = unchanged */
    brightness?: number;
    contrast?: number;
    saturate?: number;
    /** degrees */
    hueRotate?: number;
    /** percent 0…100 */
    grayscale?: number;
    sepia?: number;
    invert?: number;
    opacity?: number;
}

/** FilterParams → the exact CSS `filter:` string for ctx.filter. */
export function cssFilterString(p: FilterParams): string {
    const parts: string[] = [];
    if (p.blur && p.blur > 0) parts.push(`blur(${p.blur}px)`);
    if (p.brightness != null && p.brightness !== 100) parts.push(`brightness(${p.brightness}%)`);
    if (p.contrast != null && p.contrast !== 100) parts.push(`contrast(${p.contrast}%)`);
    if (p.saturate != null && p.saturate !== 100) parts.push(`saturate(${p.saturate}%)`);
    if (p.hueRotate != null && p.hueRotate !== 0) parts.push(`hue-rotate(${p.hueRotate}deg)`);
    if (p.grayscale != null && p.grayscale !== 0) parts.push(`grayscale(${p.grayscale}%)`);
    if (p.sepia != null && p.sepia !== 0) parts.push(`sepia(${p.sepia}%)`);
    if (p.invert != null && p.invert !== 0) parts.push(`invert(${p.invert}%)`);
    if (p.opacity != null && p.opacity !== 100) parts.push(`opacity(${p.opacity}%)`);
    return parts.length > 0 ? parts.join(" ") : "none";
}

/* ─── per-value tone ops (pure) ─────────────────────────────────── */

/** Quantize v (0…255) into `levels` evenly spaced tones. */
export function posterizeValue(v: number, levels: number): number {
    const n = clamp(Math.round(levels), 2, 255);
    return Math.round((clamp(v, 0, 255) / 255) * (n - 1)) * (255 / (n - 1));
}

/** Sabattier effect: above the threshold, flip the ramp. */
export function solarizeValue(v: number, threshold: number): number {
    const x = clamp(v, 0, 255);
    return x > threshold ? 255 - x : x;
}

/** Hard black/white cut at `threshold` (0…255). */
export function thresholdValue(v: number, threshold: number): number {
    return clamp(v, 0, 255) >= threshold ? 255 : 0;
}

/* ─── raster container + pixel loops (pure) ─────────────────────── */

/** A RGBA, row-major raster — structurally what getImageData returns. */
export interface Raster {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

export function makeRaster(width: number, height: number, fill: [number, number, number, number]): Raster {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = fill[0];
        data[i + 1] = fill[1];
        data[i + 2] = fill[2];
        data[i + 3] = fill[3];
    }
    return {width, height, data};
}

function mapRgb(src: Raster, fn: (r: number, g: number, b: number) => [number, number, number]): Raster {
    const data = new Uint8ClampedArray(src.data);
    for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = fn(data[i], data[i + 1], data[i + 2]);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
    }
    return {width: src.width, height: src.height, data};
}

export function posterizeRaster(src: Raster, levels: number): Raster {
    return mapRgb(src, (r, g, b) => [posterizeValue(r, levels), posterizeValue(g, levels), posterizeValue(b, levels)]);
}

export function solarizeRaster(src: Raster, threshold: number): Raster {
    return mapRgb(src, (r, g, b) => [solarizeValue(r, threshold), solarizeValue(g, threshold), solarizeValue(b, threshold)]);
}

export function thresholdRaster(src: Raster, threshold: number): Raster {
    return mapRgb(src, (r, g, b) => {
        const v = thresholdValue(luminance(r, g, b), threshold);
        return [v, v, v];
    });
}

export function invertRaster(src: Raster): Raster {
    return mapRgb(src, (r, g, b) => [255 - r, 255 - g, 255 - b]);
}

export function grayscaleRaster(src: Raster): Raster {
    return mapRgb(src, (r, g, b) => {
        const l = luminance(r, g, b);
        return [l, l, l];
    });
}

/** Sample each `block`×`block` square at its center (deterministic). */
export function pixelateRaster(src: Raster, block: number): Raster {
    const b = clamp(Math.round(block), 1, Math.max(src.width, src.height, 1));
    if (b <= 1) return {width: src.width, height: src.height, data: new Uint8ClampedArray(src.data)};
    const data = new Uint8ClampedArray(src.data);
    for (let by = 0; by < src.height; by += b) {
        for (let bx = 0; bx < src.width; bx += b) {
            const cx = Math.min(bx + (b >> 1), src.width - 1);
            const cy = Math.min(by + (b >> 1), src.height - 1);
            const si = (cy * src.width + cx) * 4;
            for (let y = by; y < Math.min(by + b, src.height); y++) {
                for (let x = bx; x < Math.min(bx + b, src.width); x++) {
                    const di = (y * src.width + x) * 4;
                    data[di] = src.data[si];
                    data[di + 1] = src.data[si + 1];
                    data[di + 2] = src.data[si + 2];
                }
            }
        }
    }
    return {width: src.width, height: src.height, data};
}

/** Deterministic PRNG so grain is identical between preview and export. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Film grain. `amount` 0…128-ish, mono adds the same delta to R/G/B. */
export function grainRaster(src: Raster, amount: number, seed = 1234, mono = true): Raster {
    const a = clamp(amount, 0, 128);
    if (a <= 0) return {width: src.width, height: src.height, data: new Uint8ClampedArray(src.data)};
    const rnd = mulberry32(Math.round(seed) || 1);
    const data = new Uint8ClampedArray(src.data);
    for (let i = 0; i < data.length; i += 4) {
        if (mono) {
            const d = (rnd() * 2 - 1) * a;
            data[i] += d;
            data[i + 1] += d;
            data[i + 2] += d;
        } else {
            data[i] += (rnd() * 2 - 1) * a;
            data[i + 1] += (rnd() * 2 - 1) * a;
            data[i + 2] += (rnd() * 2 - 1) * a;
        }
    }
    return {width: src.width, height: src.height, data};
}

/** Vignette falloff for normalized coords (-1…1 on each axis). */
export function vignetteGain(nx: number, ny: number, strength: number): number {
    const d = Math.sqrt(nx * nx + ny * ny); // 0 at center, √2 at corners
    const t = clamp((d - 0.35) / (Math.SQRT2 - 0.35), 0, 1);
    return 1 - clamp(strength, 0, 1) * t;
}

export function vignetteRaster(src: Raster, strength: number): Raster {
    const s = clamp(strength, 0, 1);
    if (s <= 0) return {width: src.width, height: src.height, data: new Uint8ClampedArray(src.data)};
    const cx = (src.width - 1) / 2;
    const cy = (src.height - 1) / 2;
    const data = new Uint8ClampedArray(src.data);
    for (let y = 0; y < src.height; y++) {
        const ny = cx === 0 ? 0 : (y - cy) / cy;
        for (let x = 0; x < src.width; x++) {
            const nx = cy === 0 ? 0 : (x - cx) / cx;
            const g = vignetteGain(nx, ny, s);
            const i = (y * src.width + x) * 4;
            data[i] = data[i] * g;
            data[i + 1] = data[i + 1] * g;
            data[i + 2] = data[i + 2] * g;
        }
    }
    return {width: src.width, height: src.height, data};
}

/* ─── 3×3 convolution kernels (emboss / edge / sharpen) ──────────── */

export const EMBOSS_KERNEL: readonly number[] = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
export const EDGE_KERNEL: readonly number[] = [-1, -1, -1, -1, 8, -1, -1, -1, -1];

/** Unsharp-style kernel: amount 0…100 → neighbour weight 0…1. */
export function sharpenKernel(amount: number): number[] {
    const a = clamp(amount, 0, 100) / 100;
    return [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
}

/** Clamp-to-edge 3×3 convolution. `gray` renders the response as grayscale. */
export function convolveRaster(
    src: Raster,
    kernel: readonly number[],
    opts?: { gray?: boolean; abs?: boolean }
): Raster {
    const {width, height} = src;
    const data = new Uint8ClampedArray(src.data);
    const gray = opts?.gray === true;
    const abs = opts?.abs === true;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0;
            let g = 0;
            let b = 0;
            for (let ky = 0; ky < 3; ky++) {
                const sy = clamp(y + ky - 1, 0, height - 1);
                for (let kx = 0; kx < 3; kx++) {
                    const k = kernel[ky * 3 + kx];
                    if (!k) continue;
                    const sx = clamp(x + kx - 1, 0, width - 1);
                    const si = (sy * width + sx) * 4;
                    r += src.data[si] * k;
                    g += src.data[si + 1] * k;
                    b += src.data[si + 2] * k;
                }
            }
            if (abs) {
                r = Math.abs(r);
                g = Math.abs(g);
                b = Math.abs(b);
            }
            const di = (y * width + x) * 4;
            if (gray) {
                const l = luminance(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255));
                data[di] = l;
                data[di + 1] = l;
                data[di + 2] = l;
            } else {
                data[di] = r;
                data[di + 1] = g;
                data[di + 2] = b;
            }
        }
    }
    return {width, height, data};
}

/* ─── geometry math (pure) ──────────────────────────────────────── */

/** Clamp a numeric crop rect into [0,W)×[0,H) with ≥1 px size. */
export function clampRect(
    x: number,
    y: number,
    w: number,
    h: number,
    W: number,
    H: number
): { x: number; y: number; w: number; h: number } {
    const cx = clamp(Math.round(x), 0, Math.max(0, W - 1));
    const cy = clamp(Math.round(y), 0, Math.max(0, H - 1));
    const cw = clamp(Math.round(w), 1, Math.max(1, W - cx));
    const ch = clamp(Math.round(h), 1, Math.max(1, H - cy));
    return {x: cx, y: cy, w: cw, h: ch};
}

/** 9-grid watermark anchor (textAlign=left / textBaseline=top). */
export function watermarkAnchor(
    boxW: number,
    boxH: number,
    textW: number,
    textH: number,
    position: string,
    margin = 16
): { x: number; y: number } {
    const x = position.includes("left")
        ? margin
        : position.includes("right")
            ? boxW - margin - textW
            : (boxW - textW) / 2;
    const y = position.includes("top")
        ? margin
        : position.includes("bottom")
            ? boxH - margin - textH
            : (boxH - textH) / 2;
    return {x, y};
}

/* ─── analysis (pure) — ASCII / histogram / palette / info ───────── */

export const ASCII_RAMPS: Readonly<Record<string, string>> = {
    standard: " .:-=+*#%@",
    detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    minimal: " .oO@",
    blocks: " ░▒▓█",
    binary: "01",
};

/** Luminance → character ramp; cells are ~2:1 tall (terminal glyphs). */
export function asciiFromRaster(src: Raster, outWidth: number, ramp = ASCII_RAMPS.standard, invert = false): string {
    const chars = ramp.length > 0 ? ramp : ASCII_RAMPS.standard;
    const w = clamp(Math.round(outWidth), 8, 400);
    const cellW = src.width / w;
    const cellH = Math.max(0.5, cellW / 2);
    const rows = Math.max(1, Math.round(src.height / cellH));
    const lines: string[] = [];
    for (let ry = 0; ry < rows; ry++) {
        let line = "";
        for (let rx = 0; rx < w; rx++) {
            const x0 = Math.floor(rx * cellW);
            const x1 = Math.min(src.width, Math.max(x0 + 1, Math.ceil((rx + 1) * cellW)));
            const y0 = Math.floor(ry * cellH);
            const y1 = Math.min(src.height, Math.max(y0 + 1, Math.ceil((ry + 1) * cellH)));
            let sum = 0;
            let n = 0;
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const i = (y * src.width + x) * 4;
                    sum += luminance(src.data[i], src.data[i + 1], src.data[i + 2]);
                    n++;
                }
            }
            const lum = n > 0 ? sum / n : 0;
            let idx = clamp(Math.floor((lum / 256) * chars.length), 0, chars.length - 1);
            if (invert) idx = chars.length - 1 - idx;
            line += chars[idx];
        }
        lines.push(line);
    }
    return lines.join("\n");
}

export interface Histogram {
    buckets: number;
    r: number[];
    g: number[];
    b: number[];
    lum: number[];
}

/** Per-channel + luma histograms with `buckets` bins (2…256). */
export function histogramFromRaster(src: Raster, buckets = 16): Histogram {
    const n = clamp(Math.round(buckets), 2, 256);
    const h: Histogram = {
        buckets: n,
        r: new Array<number>(n).fill(0),
        g: new Array<number>(n).fill(0),
        b: new Array<number>(n).fill(0),
        lum: new Array<number>(n).fill(0),
    };
    for (let i = 0; i < src.data.length; i += 4) {
        const r = src.data[i];
        const g = src.data[i + 1];
        const b = src.data[i + 2];
        h.r[Math.min(n - 1, Math.floor((r * n) / 256))]++;
        h.g[Math.min(n - 1, Math.floor((g * n) / 256))]++;
        h.b[Math.min(n - 1, Math.floor((b * n) / 256))]++;
        h.lum[Math.min(n - 1, Math.floor((luminance(r, g, b) * n) / 256))]++;
    }
    return h;
}

/** Histogram → aligned text table (bucket, range, R, G, B, luma counts). */
export function histogramText(h: Histogram): string {
    const width = Math.max(String(Math.max(...h.r, ...h.g, ...h.b, ...h.lum)).length, 1);
    const lines = [
        `bucket   range        ${"R".padStart(width)}  ${"G".padStart(width)}  ${"B".padStart(width)}  ${"lum".padStart(width)}`,
    ];
    for (let i = 0; i < h.buckets; i++) {
        const lo = Math.round((i * 256) / h.buckets);
        const hi = Math.round(((i + 1) * 256) / h.buckets) - 1;
        lines.push(
            `${String(i).padStart(3)}     ${String(lo).padStart(3)}-${String(hi).padStart(3)}    ` +
            `${String(h.r[i]).padStart(width)}  ${String(h.g[i]).padStart(width)}  ${String(h.b[i]).padStart(width)}  ${String(h.lum[i]).padStart(width)}`
        );
    }
    const total = h.r.reduce((a, b) => a + b, 0);
    lines.push(`pixels: ${total}`);
    return lines.join("\n");
}

export interface PaletteEntry {
    hex: string;
    r: number;
    g: number;
    b: number;
    count: number;
    /** share of pixels, 0…1 */
    share: number;
    name: string;
}

/**
 * Palette quantization: 4 bits per channel (4096 buckets), then the top-N
 * buckets by pixel count, each reported as the AVERAGE color inside the
 * bucket (so pure red stays #ff0000, not the bucket-center approximation).
 */
export function paletteFromRaster(src: Raster, maxColors = 8): PaletteEntry[] {
    type Bucket = { r: number; g: number; b: number; n: number };
    const buckets = new Map<number, Bucket>();
    for (let i = 0; i < src.data.length; i += 4) {
        const key = ((src.data[i] >> 4) << 8) | ((src.data[i + 1] >> 4) << 4) | (src.data[i + 2] >> 4);
        const b = buckets.get(key);
        if (b) {
            b.r += src.data[i];
            b.g += src.data[i + 1];
            b.b += src.data[i + 2];
            b.n++;
        } else {
            buckets.set(key, {r: src.data[i], g: src.data[i + 1], b: src.data[i + 2], n: 1});
        }
    }
    const total = src.data.length / 4;
    const top = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, clamp(Math.round(maxColors), 1, 64));
    return top.map(([, v]) => {
        const r = Math.round(v.r / v.n);
        const g = Math.round(v.g / v.n);
        const b = Math.round(v.b / v.n);
        return {hex: rgbToHex(r, g, b), r, g, b, count: v.n, share: v.n / total, name: nearestCssColorName(r, g, b)};
    });
}

export function dominantColor(src: Raster): PaletteEntry {
    return paletteFromRaster(src, 1)[0];
}

const CSS_COLORS: ReadonlyArray<readonly [string, number, number, number]> = [
    ["black", 0, 0, 0], ["white", 255, 255, 255], ["red", 255, 0, 0], ["lime", 0, 255, 0],
    ["blue", 0, 0, 255], ["yellow", 255, 255, 0], ["cyan", 0, 255, 255], ["magenta", 255, 0, 255],
    ["gray", 128, 128, 128], ["silver", 192, 192, 192], ["maroon", 128, 0, 0], ["olive", 128, 128, 0],
    ["green", 0, 128, 0], ["purple", 128, 0, 128], ["teal", 0, 128, 128], ["navy", 0, 0, 128],
    ["orange", 255, 165, 0], ["pink", 255, 192, 203], ["brown", 165, 42, 42], ["gold", 255, 215, 0],
    ["coral", 255, 127, 80], ["indigo", 75, 0, 130], ["tan", 210, 180, 140], ["violet", 238, 130, 238],
];

export function nearestCssColorName(r: number, g: number, b: number): string {
    let best = "gray";
    let bestDist = Infinity;
    for (const [name, cr, cg, cb] of CSS_COLORS) {
        const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
        if (d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
    return best;
}

export interface ImageFactsInput {
    name: string;
    width: number;
    height: number;
    bytes: number;
    type: string;
}

export function imageInfoReport(v: ImageFactsInput): string {
    const px = v.width * v.height;
    const ratio = aspectRatioFraction(v.width, v.height);
    const orientation = v.width > v.height ? "landscape" : v.width < v.height ? "portrait" : "square";
    return [
        `File            ${v.name}`,
        `Format          ${v.type || "unknown"}`,
        `Dimensions      ${v.width} × ${v.height} px`,
        `Megapixels      ${(px / 1_000_000).toFixed(2)} MP`,
        `Aspect ratio    ${ratio} (${(v.width / Math.max(1, v.height)).toFixed(2)})`,
        `Orientation     ${orientation}`,
        `File size       ${formatBytes(v.bytes)} (${v.bytes.toLocaleString()} bytes)`,
        `Pixels          ${px.toLocaleString()} px (≈ ${(v.bytes / Math.max(1, px)).toFixed(2)} bytes/px)`,
    ].join("\n");
}

/* ─── EXIF parser (pure — JPEG APP1 / TIFF IFD0 + Exif sub-IFD) ──── */

export interface ExifEntry {
    label: string;
    value: string;
}

export interface ExifResult {
    found: boolean;
    reason?: string;
    entries: ExifEntry[];
    orientation: number | null;
}

const ORIENTATION_NAMES: Readonly<Record<number, string>> = {
    1: "normal",
    2: "mirror horizontal",
    3: "rotate 180°",
    4: "mirror vertical",
    5: "mirror horizontal + rotate 270°",
    6: "rotate 90° CW",
    7: "mirror horizontal + rotate 90°",
    8: "rotate 270° CW",
};

interface RawEntry {
    tag: number;
    type: number;
    count: number;
    /** inline value bytes or the absolute offset of the value */
    valueField: number;
}

function readShort(view: DataView, off: number, little: boolean): number {
    return view.getUint16(off, little);
}

function readEntry(view: DataView, entryOff: number, little: boolean): RawEntry {
    return {
        tag: view.getUint16(entryOff, little),
        type: view.getUint16(entryOff + 2, little),
        count: view.getUint32(entryOff + 4, little),
        valueField: view.getUint32(entryOff + 8, little),
    };
}

/**
 * Read one IFD entry's value. Short values (≤ 4 bytes) live inline at
 * `entryOff + 8`; longer ones sit at the TIFF-relative offset stored in
 * the entry's value field.
 */
function readEntryValue(view: DataView, entryOff: number, e: RawEntry, little: boolean): string | number | null {
    const sizeOfType: Record<number, number> = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8};
    const size = sizeOfType[e.type] ?? 0;
    if (!size) return null;
    const valueOff = e.count * size <= 4 ? entryOff + 8 : e.valueField;
    if (valueOff < 0 || valueOff + Math.min(e.count * size, 1024) > view.byteLength) return null;
    switch (e.type) {
        case 2: {
            let s = "";
            for (let i = 0; i < e.count && valueOff + i < view.byteLength; i++) {
                const c = view.getUint8(valueOff + i);
                if (c === 0) break;
                s += String.fromCharCode(c);
            }
            return s.trim();
        }
        case 1:
        case 7:
            return e.count === 1 ? view.getUint8(valueOff) : null;
        case 3:
            return readShort(view, valueOff, little);
        case 4:
            return view.getUint32(valueOff, little);
        case 9:
            return view.getInt32(valueOff, little);
        case 5:
        case 10: {
            const num = e.type === 5 ? view.getUint32(valueOff, little) : view.getInt32(valueOff, little);
            const den = e.type === 5 ? view.getUint32(valueOff + 4, little) : view.getInt32(valueOff + 4, little);
            if (!den) return null;
            return num / den;
        }
        default:
            return null;
    }
}

/** Pure JPEG EXIF dump: APP1 segment → TIFF → IFD0 (+ Exif sub-IFD). */
export function parseExif(bytes: Uint8Array): ExifResult {
    const none = (reason: string): ExifResult => ({found: false, reason, entries: [], orientation: null});
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return none("no EXIF — this is not a JPEG file (EXIF lives in JPEG APP1 segments)");
    }
    // walk the marker segments until APP1/Exif or the image data (SOS)
    let off = 2;
    let app1: Uint8Array | null = null;
    while (off + 4 <= bytes.length) {
        if (bytes[off] !== 0xff) break;
        const marker = bytes[off + 1];
        if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) break;
        if (marker === 0xda) break; // start of scan — EXIF would have come earlier
        const len = (bytes[off + 2] << 8) | bytes[off + 3];
        if (len < 2) break;
        if (marker === 0xe1) {
            const payload = bytes.subarray(off + 4, off + 2 + len);
            if (
                payload.length >= 6 &&
                payload[0] === 0x45 && payload[1] === 0x78 && payload[2] === 0x69 && payload[3] === 0x66 &&
                payload[4] === 0 && payload[5] === 0
            ) {
                app1 = payload.subarray(6);
                break;
            }
        }
        off += 2 + len;
    }
    if (!app1 || app1.length < 8) return none("no EXIF APP1 segment found in this JPEG");
    const view = new DataView(app1.buffer, app1.byteOffset, app1.byteLength);
    const little = app1[0] === 0x49 && app1[1] === 0x49;
    const big = app1[0] === 0x4d && app1[1] === 0x4d;
    if (!little && !big) return none("EXIF TIFF header is malformed");
    if (readShort(view, 2, little) !== 0x2a) return none("EXIF TIFF magic is wrong");
    const ifd0Off = view.getUint32(4, little);

    const readIfd = (ifdOff: number): Array<{ tag: number; value: string | number | null }> => {
        if (ifdOff < 0 || ifdOff + 2 > view.byteLength) return [];
        const count = readShort(view, ifdOff, little);
        const out: Array<{ tag: number; value: string | number | null }> = [];
        for (let i = 0; i < count && i < 256; i++) {
            const entryOff = ifdOff + 2 + i * 12;
            if (entryOff + 12 > view.byteLength) break;
            const e = readEntry(view, entryOff, little);
            out.push({tag: e.tag, value: readEntryValue(view, entryOff, e, little)});
        }
        return out;
    };

    const ifd0 = readIfd(ifd0Off);
    const exifPtr = ifd0.find((e) => e.tag === 0x8769);
    const subIfd = exifPtr && typeof exifPtr.value === "number" ? readIfd(exifPtr.value) : [];
    const all = [...ifd0, ...subIfd];

    const get = (tag: number): string | number | null => all.find((e) => e.tag === tag)?.value ?? null;
    const orientation = typeof get(0x0112) === "number" ? (get(0x0112) as number) : null;

    const rational = (tag: number, fmt: (v: number) => string): string | null => {
        const v = get(tag);
        return typeof v === "number" && Number.isFinite(v) ? fmt(v) : null;
    };
    const text = (tag: number): string | null => {
        const v = get(tag);
        return typeof v === "string" && v ? v : null;
    };
    const num = (tag: number): number | null => {
        const v = get(tag);
        return typeof v === "number" ? v : null;
    };

    const entries: ExifEntry[] = [];
    const push = (label: string, value: string | null) => {
        if (value != null && value !== "") entries.push({label, value});
    };
    push("Camera", [text(0x010f), text(0x0110)].filter(Boolean).join(" ") || null);
    if (orientation != null) {
        push("Orientation", `${orientation} (${ORIENTATION_NAMES[orientation] ?? "unknown"})`);
    }
    push("Software", text(0x0131));
    push("Date taken", text(0x9003) ?? text(0x0132));
    push("Date digitized", text(0x9004));
    push("Artist", text(0x013b));
    push("Copyright", text(0x8298));
    push(
        "Exposure",
        rational(0x829a, (v) => (v >= 1 ? `${v.toFixed(1)} s` : `1/${Math.round(1 / v)} s`))
    );
    push("F-number", rational(0x829d, (v) => `f/${v.toFixed(1)}`));
    push("ISO", (() => {
        const v = num(0x8827);
        return v != null ? String(Math.round(v)) : null;
    })());
    push("Focal length", rational(0x920a, (v) => `${v.toFixed(1)} mm`));
    push("Flash", (() => {
        const v = num(0x9209);
        if (v == null) return null;
        return (v & 1) === 1 ? `fired (${v})` : `did not fire (${v})`;
    })());
    push("Image size (EXIF)", (() => {
        const w = num(0xa002);
        const h = num(0xa003);
        return w != null && h != null ? `${w} × ${h} px` : null;
    })());

    if (entries.length === 0) return none("this JPEG has an EXIF segment but no recognizable tags");
    return {found: true, entries, orientation};
}

export function formatExifReport(result: ExifResult, fileName: string): string {
    const head = `EXIF — ${fileName}`;
    if (!result.found) {
        return [head, "", result.reason ?? "no EXIF found"].join("\n");
    }
    const width = Math.max(...result.entries.map((e) => e.label.length), 8);
    return [head, "", ...result.entries.map((e) => `${e.label.padEnd(width)}  ${e.value}`)].join("\n");
}

/* ─── engine (DOM at call time only) ────────────────────────────── */

export function loadImageFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not decode this image — try PNG, JPEG, WebP, GIF or BMP."));
        };
        img.src = url;
    });
}

/** Draw an image (optionally capped) to a raster for the analysis tools. */
export function imageToRaster(img: HTMLImageElement, maxDim = 1024): Raster {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const s = Math.min(1, maxDim / Math.max(w, h, 1));
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    ctx.drawImage(img, 0, 0, cw, ch);
    const id = ctx.getImageData(0, 0, cw, ch);
    return {width: id.width, height: id.height, data: id.data};
}

export interface RenderPlan {
    /** quarter turns 0…3 */
    rotate?: number;
    flipH?: boolean;
    flipV?: boolean;
    /** source rect in ORIGINAL image pixels */
    crop?: { x: number; y: number; w: number; h: number } | null;
    /** output scale (1 = original size) */
    outputScale?: number;
    /** CSS filter string applied while drawing */
    filter?: string;
    /** background painted before the image (opacity / JPEG flattening) */
    background?: string | null;
    /** per-pixel ops chained over the rendered canvas */
    pixelOps?: Array<(r: Raster) => Raster>;
    /** decorations drawn on top (watermark / border / rounded corners) */
    decorate?: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;
}

/** The one true render: geometry → CSS filter → pixel ops → decorations. */
export function renderImagePlan(img: HTMLImageElement, plan: RenderPlan): HTMLCanvasElement {
    const srcW = plan.crop ? plan.crop.w : img.naturalWidth || img.width;
    const srcH = plan.crop ? plan.crop.h : img.naturalHeight || img.height;
    const q = (((plan.rotate ?? 0) % 4) + 4) % 4;
    const swapped = q % 2 === 1;
    const s = clamp(plan.outputScale ?? 1, 0.01, 8);
    const outW = Math.max(1, Math.round((swapped ? srcH : srcW) * s));
    const outH = Math.max(1, Math.round((swapped ? srcW : srcH) * s));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    if (plan.background) {
        ctx.fillStyle = plan.background;
        ctx.fillRect(0, 0, outW, outH);
    }
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((q * Math.PI) / 2);
    if (plan.flipH || plan.flipV) ctx.scale(plan.flipH ? -1 : 1, plan.flipV ? 1 : -1);
    ctx.scale(s, s);
    if (plan.filter && plan.filter !== "none") ctx.filter = plan.filter;
    ctx.drawImage(img, plan.crop?.x ?? 0, plan.crop?.y ?? 0, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH);
    ctx.restore();
    ctx.filter = "none";
    if (plan.pixelOps && plan.pixelOps.length > 0) {
        let raster: Raster = ctx.getImageData(0, 0, outW, outH);
        for (const op of plan.pixelOps) raster = op(raster);
        // TS5.7 generic-typed-array workaround: rebuild via createImageData
        // (constructor `new ImageData(data, w, h)` rejects ArrayBufferLike).
        const patched = ctx.createImageData(raster.width, raster.height);
        patched.data.set(raster.data);
        ctx.putImageData(patched, 0, 0);
    }
    if (plan.decorate) plan.decorate(ctx, canvas);
    return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error(`The browser refused to encode ${type} — try PNG.`))),
            type,
            quality
        );
    });
}
