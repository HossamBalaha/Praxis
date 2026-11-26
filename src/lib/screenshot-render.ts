/**
 * Screenshot rendering — the "Capture Code" engine.
 *
 *. This module renders a file's FULL text into
 * ONE PNG on a <canvas> — deterministic for any file and any size
 * (the DOM never has to fit on screen), with a filename header, a
 * line-number gutter and conservative syntax coloring (comments and
 * string literals — the two token families that are safe to detect
 * with a regex across every language, unlike full grammars).
 *
 * Selection captures reuse the same renderer with a line window
 * (startLine + the selected lines), so a "capture the selected
 * region" shot looks exactly like a whole-file shot.
 */

export interface CodeShotSpec {
    /** The file's text (already truncated by the caller if huge). */
    content: string;
    /** File name shown in the header bar. */
    fileName: string;
    /** Optional language label shown next to the name (e.g. "TOML"). */
    languageLabel?: string;
    /** 1-based first line when rendering a selection window. */
    startLine?: number;
    /** Render the line-number gutter (default true). */
    lineNumbers?: boolean;
    /** Extra caption for selection shots ("lines 12–40"). */
    caption?: string;
    /** Render the traffic-dot filename header (default true). The
     *  height budget shrinks accordingly — new Composer option. */
    showHeader?: boolean;
    /** Render the bottom footer strip (line/char note + watermark,
     *  default true). The height budget shrinks accordingly. */
    showFooter?: boolean;
    /** Custom footer watermark (default "Praxis — Theory into practice").
     *  Empty string removes it — a Composer-level option so a report
     *  shot can carry its own attribution. */
    watermark?: string;
    /** Storage DPI — the canvas renders at dpi/96× (min 2×) so the
     *  exported image carries print-quality pixel density. Default 96
     *  keeps the classic 2× crispness. */
    dpi?: number;
    /** Storage format for the returned data URL (default "png"). */
    format?: "png" | "jpeg" | "webp";
    /** Palette id of the rendered shot — a key of SHOT_PALETTES
     *  ("one-dark", "one-light", "nord", …; default "one-dark").
     *  "auto" is resolved by the CALLER at shot time (the app's
     *  dark/light family → one-dark / one-light). Set from Settings ▸
     *  Capture ▸ Screenshot theme and the composer's Theme picker. */
    theme?: string;
    /** JPEG / WebP encode quality, 0.5–1 (default 0.92). Ignored for
     *  PNG (lossless). */
    imageQuality?: number;
}

export interface CodeShotResult {
    dataUrl: string;
    width: number;
    height: number;
    bytes: number;
}

/** Storage options shared by every capture path (window grab, code
 *  render, region snip). Read from Settings → Capture. */
export interface ShotEncodeOptions {
    /** Storage DPI (72–600). The raster is stored at dpi/96× the
     *  on-screen size; PNG / JPEG also embed the density metadata. */
    dpi: number;
    /** Storage file format — also the save/download extension. */
    format: "png" | "jpeg" | "webp";
    /** JPEG / WebP quality, 0.5–1 (default 0.92). PNG ignores it. */
    imageQuality?: number;
}

/** Clamp helper shared by the encode paths. */
function clampDpi(dpi: number): number {
    if (!Number.isFinite(dpi)) return 96;
    return Math.min(600, Math.max(72, Math.round(dpi)));
}

/* ── PNG pHYs / JPEG JFIF density patching ──────────────────────────
 *
 * The canvas API cannot write image density metadata, so the encoded
 * bytes are patched directly: PNG gets a pHYs chunk (pixels per
 * METRE — dpi × 39.3701), JPEG gets the JFIF APP0 density fields.
 * WebP has no browser-writable density field — the resample below
 * still applies. CRC32 is the standard PNG chunk checksum. */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** Insert a pHYs chunk (dpi) after the PNG IHDR. Returns the patched
 * data URL. No-op (input returned) when the buffer is not a PNG. */
export function pngEmbedDpi(dataUrl: string, dpi: number): string {
    const PREFIX = "data:image/png;base64,";
    if (!dataUrl.startsWith(PREFIX)) return dataUrl;
    const safeDpi = clampDpi(dpi);
    try {
        const raw = atob(dataUrl.slice(PREFIX.length));
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        // PNG: 8-byte signature + IHDR (length 4 + "IHDR" 4 + data 13 + crc 4)
        const ihdrEnd = 8 + 4 + 4 + 13 + 4;
        if (bytes.length < ihdrEnd) return dataUrl;
        const ppm = Math.round(safeDpi / 0.0254); // pixels per metre
        const chunk = new Uint8Array(21);
        const dv = new DataView(chunk.buffer);
        dv.setUint32(0, 9); // data length
        chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
        dv.setUint32(8, ppm);
        dv.setUint32(12, ppm);
        chunk[16] = 1; // unit = metre
        dv.setUint32(17, crc32(chunk.subarray(4, 17)));
        const out = new Uint8Array(bytes.length + chunk.length);
        out.set(bytes.subarray(0, ihdrEnd), 0);
        out.set(chunk, ihdrEnd);
        out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
        let bin = "";
        for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
        return PREFIX + btoa(bin);
    } catch {
        return dataUrl;
    }
}

/** Patch the JFIF APP0 density fields of a JPEG data URL to `dpi`
 * (dots per inch). No-op when the buffer has no JFIF APP0. */
export function jpegEmbedDpi(dataUrl: string, dpi: number): string {
    const PREFIX = "data:image/jpeg;base64,";
    if (!dataUrl.startsWith(PREFIX)) return dataUrl;
    const safeDpi = clampDpi(dpi);
    try {
        const raw = atob(dataUrl.slice(PREFIX.length));
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        // SOI (2) + APP0 marker (2) + length (2); the JFIF ident + version
        // occupy bytes 6..11, units byte 12, densities 13..16.
        if (bytes.length < 18) return dataUrl;
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return dataUrl;
        if (bytes[2] !== 0xff || bytes[3] !== 0xe0) return dataUrl;
        const ident = String.fromCharCode(bytes[6], bytes[7], bytes[8], bytes[9], bytes[10]);
        if (ident !== "JFIF\0") return dataUrl;
        const dv = new DataView(bytes.buffer);
        bytes[12] = 1; // units = dots per inch
        dv.setUint16(13, safeDpi);
        dv.setUint16(15, safeDpi);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return PREFIX + btoa(bin);
    } catch {
        return dataUrl;
    }
}

/** Encode a canvas with the storage format + DPI metadata. */
export function encodeCanvas(
    canvas: HTMLCanvasElement,
    opts: ShotEncodeOptions
): { dataUrl: string; bytes: number } {
    const format = opts.format ?? "png";
    const mime = `image/${format}`;
    const quality = format === "png" ? undefined : clampImageQuality(opts.imageQuality);
    let dataUrl = canvas.toDataURL(mime, quality);
    if (format === "png") dataUrl = pngEmbedDpi(dataUrl, opts.dpi);
    else if (format === "jpeg") dataUrl = jpegEmbedDpi(dataUrl, opts.dpi);
    return {dataUrl, bytes: Math.round((dataUrl.length - 22) * 0.75)};
}

/** Clamp a user-supplied JPEG/WebP quality into the safe 0.5–1 band. */
export function clampImageQuality(q: number | undefined): number {
    if (typeof q !== "number" || !Number.isFinite(q)) return 0.92;
    return Math.min(1, Math.max(0.5, q));
}

/* ── Palettes — the code shot's colors ──────────────────────────
*
* The renderer supports a REGISTRY of named palettes. Each entry mirrors a classic IDE scheme; "auto" is
* resolved by the caller (the app's dark/light family at shot
* time → one-dark / one-light). */
export interface ShotPalette {
    bg: string;
    panel: string;
    border: string;
    fg: string;
    muted: string;
    comment: string;
    string: string;
    headerBg: string;
    accent: string;
}

export interface ShotPaletteEntry {
    id: string;
    label: string;
    isDark: boolean;
    palette: ShotPalette;
}

const oneDark: ShotPalette = {
    bg: "#282c34", panel: "#21252b", border: "#3e4451", fg: "#abb2bf",
    muted: "#5c6370", comment: "#7f848e", string: "#98c379", headerBg: "#2c313a", accent: "#61afef",
};

const oneLight: ShotPalette = {
    bg: "#fafafa", panel: "#f0f0f0", border: "#d8d8d8", fg: "#383a42",
    muted: "#a0a1a7", comment: "#a0a1a7", string: "#50a14f", headerBg: "#f0f0f0", accent: "#4078f2",
};

const nord: ShotPalette = {
    bg: "#2e3440", panel: "#3b4252", border: "#434c5e", fg: "#d8dee9",
    muted: "#7b88a1", comment: "#90a0b5", string: "#a3be8c", headerBg: "#3b4252", accent: "#88c0d0",
};

const monokai: ShotPalette = {
    bg: "#272822", panel: "#1e1f1c", border: "#49483e", fg: "#f8f8f2",
    muted: "#90908a", comment: "#88846f", string: "#e6db74", headerBg: "#1e1f1c", accent: "#a6e22e",
};

const dracula: ShotPalette = {
    bg: "#282a36", panel: "#21222c", border: "#44475a", fg: "#f8f8f2",
    muted: "#6272a4", comment: "#6272a4", string: "#f1fa8c", headerBg: "#21222c", accent: "#bd93f9",
};

const gruvboxDark: ShotPalette = {
    bg: "#282828", panel: "#32302f", border: "#504945", fg: "#ebdbb2",
    muted: "#928374", comment: "#928374", string: "#b8bb26", headerBg: "#32302f", accent: "#fabd2f",
};

const gruvboxLight: ShotPalette = {
    bg: "#fbf1c7", panel: "#ebdbb2", border: "#d5c4a1", fg: "#3c3836",
    muted: "#9d0006", comment: "#7c6f64", string: "#79740e", headerBg: "#ebdbb2", accent: "#b57600",
};

const solarizedDark: ShotPalette = {
    bg: "#002b36", panel: "#073642", border: "#586e75", fg: "#93a1a1",
    muted: "#657b83", comment: "#586e75", string: "#2aa198", headerBg: "#073642", accent: "#268bd2",
};

const solarizedLight: ShotPalette = {
    bg: "#fdf6e3", panel: "#eee8d5", border: "#93a1a1", fg: "#657b83",
    muted: "#93a1a1", comment: "#93a1a1", string: "#859900", headerBg: "#eee8d5", accent: "#268bd2",
};

const githubDark: ShotPalette = {
    bg: "#0d1117", panel: "#161b22", border: "#30363d", fg: "#e6edf3",
    muted: "#8b949e", comment: "#8b949e", string: "#a5d6ff", headerBg: "#161b22", accent: "#58a6ff",
};

const githubLight: ShotPalette = {
    bg: "#ffffff", panel: "#f6f8fa", border: "#d0d7de", fg: "#1f2328",
    muted: "#656d76", comment: "#656d76", string: "#0a3069", headerBg: "#f6f8fa", accent: "#0969da",
};

const tokyoNight: ShotPalette = {
    bg: "#1a1b26", panel: "#24283b", border: "#414868", fg: "#c0caf5",
    muted: "#565f89", comment: "#565f89", string: "#9ece6a", headerBg: "#24283b", accent: "#7aa2f7",
};

const rosePine: ShotPalette = {
    bg: "#191724", panel: "#1f1d2e", border: "#403d52", fg: "#e0def4",
    muted: "#908caa", comment: "#908caa", string: "#ebbcba", headerBg: "#1f1d2e", accent: "#c4a7e7",
};

const highContrastDark: ShotPalette = {
    bg: "#000000", panel: "#0d0d0d", border: "#ffffff", fg: "#ffffff",
    muted: "#c8c8c8", comment: "#c8c8c8", string: "#00ff87", headerBg: "#0d0d0d", accent: "#2ea043",
};

const highContrastLight: ShotPalette = {
    bg: "#ffffff", panel: "#f2f2f2", border: "#000000", fg: "#000000",
    muted: "#333333", comment: "#333333", string: "#006600", headerBg: "#f2f2f2", accent: "#005a9e",
};

/** The named screenshot palettes — order = picker order. */
export const SHOT_PALETTES: readonly ShotPaletteEntry[] = [
    {id: "one-dark", label: "One Dark", isDark: true, palette: oneDark},
    {id: "one-light", label: "One Light", isDark: false, palette: oneLight},
    {id: "nord", label: "Nord", isDark: true, palette: nord},
    {id: "monokai", label: "Monokai", isDark: true, palette: monokai},
    {id: "dracula", label: "Dracula", isDark: true, palette: dracula},
    {id: "gruvbox-dark", label: "Gruvbox Dark", isDark: true, palette: gruvboxDark},
    {id: "gruvbox-light", label: "Gruvbox Light", isDark: false, palette: gruvboxLight},
    {id: "solarized-dark", label: "Solarized Dark", isDark: true, palette: solarizedDark},
    {id: "solarized-light", label: "Solarized Light", isDark: false, palette: solarizedLight},
    {id: "github-dark", label: "GitHub Dark", isDark: true, palette: githubDark},
    {id: "github-light", label: "GitHub Light", isDark: false, palette: githubLight},
    {id: "tokyo-night", label: "Tokyo Night", isDark: true, palette: tokyoNight},
    {id: "rose-pine", label: "Rosé Pine", isDark: true, palette: rosePine},
    {id: "high-contrast-dark", label: "High Contrast Dark", isDark: true, palette: highContrastDark},
    {id: "high-contrast-light", label: "High Contrast Light", isDark: false, palette: highContrastLight},
] as const;

/** Resolve a palette id ("auto" → the caller pre-resolves; unknown
 *  ids fall back to One Dark, the classic look). */
export function shotPaletteById(id: string | null | undefined): ShotPaletteEntry {
    return SHOT_PALETTES.find((p) => p.id === id) ?? SHOT_PALETTES[0];
}

const CHAR_W = 7.2; // 12px JetBrains Mono ≈ 7.2px advance
const LINE_H = 19;  // 12px font on a 19px rhythm
const PAD_L = 14;
const PAD_R = 14;
const PAD_T = 10;
const HEADER_H = 34;
const FOOTER_H = 26;

/** Conservative per-line tokenizer: returns colored segments for the
 * comment prefix and double/single-quoted string literals. Everything
 * else stays the base foreground — deliberately NOT a full grammar,
 * so no language can scramble the rendering. */
function segmentsFor(line: string, p: ShotPalette): Array<{ text: string; color: string }> {
    const trimmed = line.trimStart();
    const isComment =
        trimmed.startsWith("#") || trimmed.startsWith("//") ||
        trimmed.startsWith("--") || trimmed.startsWith(";") ||
        trimmed.startsWith("%") || trimmed.startsWith("REM ") ||
        trimmed.startsWith("rem ") || trimmed.startsWith("dnl ");
    if (isComment) return [{text: line, color: p.comment}];

    const out: Array<{ text: string; color: string }> = [];
    let buf = "";
    let i = 0;
    let quote: string | null = null;
    while (i < line.length) {
        const ch = line[i];
        if (quote) {
            buf += ch;
            if (ch === quote && line[i - 1] !== "\\") {
                out.push({text: buf, color: p.string});
                buf = "";
                quote = null;
            }
        } else if (ch === '"' || ch === "'") {
            if (buf) {
                out.push({text: buf, color: p.fg});
                buf = "";
            }
            quote = ch;
            buf = ch;
        } else {
            buf += ch;
        }
        i++;
    }
    if (buf) out.push({text: buf, color: quote ? p.string : p.fg});
    return out.length ? out : [{text: "", color: p.fg}];
}

/** Render a full file (or a selection window) into a single PNG. */
export function renderCodeToPng(spec: CodeShotSpec): CodeShotResult {
    const lines = spec.content.split("\n");
    // Palette — the named registry entry ("one-dark" default keeps the
    // classic look; "auto" was resolved by the caller before here).
    const p: ShotPalette = shotPaletteById(spec.theme).palette;
    // Canvas height safety: browsers cap canvas buffers (~16k–32k px).
    // Cap at 1400 lines per image — beyond that the shot renders the
    // first 1400 lines and the header says how many were clipped.
    const MAX_LINES = 1400;
    const clipped = lines.length > MAX_LINES;
    const shown = clipped ? lines.slice(0, MAX_LINES) : lines;

    const startLine = spec.startLine ?? 1;
    const lineNumbers = spec.lineNumbers !== false;
    const showHeader = spec.showHeader !== false;
    const showFooter = spec.showFooter !== false;
    const gutterW = lineNumbers
        ? Math.max(2, String(startLine + shown.length - 1).length) * (CHAR_W - 0.8) + PAD_L + 14
        : PAD_L;
    const longest = shown.reduce((m, l) => Math.max(m, l.length), 40);
    const width = Math.min(2400, Math.max(560, gutterW + longest * CHAR_W + PAD_R + 20));

    const headerH = showHeader ? HEADER_H + (spec.caption ? 16 : 0) : 0;
    const height = headerH + PAD_T + shown.length * LINE_H + (showFooter ? FOOTER_H : 0);

    const canvas = document.createElement("canvas");
    // DPI-aware scale: 96 DPI keeps the classic 2× crispness; higher
    // storage DPI renders genuinely denser text (300 DPI ≈ 3.1×).
    const dpi = spec.dpi && spec.dpi > 0 ? clampDpi(spec.dpi) : 96;
    const scale = Math.max(2, dpi / 96);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.scale(scale, scale);

    // Background + header panel.
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);
    if (showHeader) {
        ctx.fillStyle = p.headerBg;
        ctx.fillRect(0, 0, width, headerH);
        ctx.fillStyle = p.border;
        ctx.fillRect(0, headerH - 1, width, 1);
        if (lineNumbers) {
            ctx.fillStyle = p.panel;
            ctx.fillRect(0, headerH, gutterW - 14, height - headerH);
            ctx.fillStyle = p.border;
            ctx.fillRect(gutterW - 14, headerH, 1, height - headerH);
        }
    } else if (lineNumbers) {
        // headerless still carries the gutter panel below the top pad
        ctx.fillStyle = p.panel;
        ctx.fillRect(0, 0, gutterW - 14, height);
        ctx.fillStyle = p.border;
        ctx.fillRect(gutterW - 14, 0, 1, height);
    }

    const mono = `12px "jetbrainsMono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    const sans = `600 11px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const small = `10px system-ui, -apple-system, "Segoe UI", sans-serif`;

    // Header: traffic dots + file name + language + caption.
    if (showHeader) {
        const dots = ["#ff5f57", "#febc2e", "#28c840"];
        dots.forEach((c, i) => {
            ctx.beginPath();
            ctx.fillStyle = c;
            ctx.arc(16 + i * 16, headerH / 2 - (spec.caption ? 8 : 0), 5, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.fillStyle = p.fg;
        ctx.font = sans;
        ctx.fillText(spec.fileName, 66, headerH / 2 + 4 - (spec.caption ? 8 : 0));
        if (spec.languageLabel) {
            const nameW = ctx.measureText(spec.fileName).width;
            ctx.fillStyle = p.accent;
            ctx.font = `10px system-ui, sans-serif`;
            ctx.fillText(spec.languageLabel.toUpperCase(), 70 + nameW, headerH / 2 + 4 - (spec.caption ? 8 : 0));
        }
        if (spec.caption) {
            ctx.fillStyle = p.muted;
            ctx.font = small;
            ctx.fillText(spec.caption, 16, headerH - 6);
        }
    }

    // Body lines.
    ctx.textBaseline = "top";
    shown.forEach((line, idx) => {
        const y = headerH + PAD_T + idx * LINE_H;
        if (lineNumbers) {
            ctx.fillStyle = p.muted;
            ctx.font = mono;
            ctx.textAlign = "right";
            ctx.fillText(String(startLine + idx), gutterW - 20, y);
            ctx.textAlign = "left";
        }
        let x = gutterW;
        for (const seg of segmentsFor(line, p)) {
            ctx.fillStyle = seg.color;
            ctx.font = mono;
            ctx.fillText(seg.text, x, y);
            x += ctx.measureText(seg.text).width;
            if (x > width - PAD_R) break;
        }
    });

    // Footer: line count (or clip note) + Praxis watermark.
    // the note used to start at x = PAD_L (14px), which lands
    // INSIDE the line-number gutter panel — the gutter panel painted
    // over it, so the “xx lines · xx chars” note was hidden behind the
    // left line numbers. It now starts at the gutter's
    // right edge when the gutter is on; the watermark is measured so it
    // hugs the right padding whatever its length.
    if (showFooter) {
        ctx.fillStyle = p.muted;
        ctx.font = small;
        const footerY = height - FOOTER_H + 8;
        const lineNote = clipped
            ? `${shown.length.toLocaleString()} of ${lines.length.toLocaleString()} lines (clipped) · Praxis`
            : `${lines.length.toLocaleString()} lines · ${spec.content.length.toLocaleString()} chars · Praxis`;
        ctx.fillText(lineNote, lineNumbers ? gutterW : PAD_L, footerY);
        const watermark = spec.watermark !== undefined ? spec.watermark : "Praxis — Theory into practice";
        if (watermark) {
            const wmW = ctx.measureText(watermark).width;
            ctx.fillText(watermark, Math.max(lineNumbers ? gutterW : PAD_L, width - PAD_R - wmW), footerY);
        }
    }

    const encoded = encodeCanvas(canvas, {dpi, format: spec.format ?? "png", imageQuality: spec.imageQuality});
    return {dataUrl: encoded.dataUrl, width, height, bytes: encoded.bytes};
}

/** Freeze a live capture stream's CURRENT frame into a canvas (the
 *  caller crops / resamples / encodes from there). */
export function videoFrameToCanvas(
    video: HTMLVideoElement
): HTMLCanvasElement {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error("The capture stream produced no frame");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(video, 0, 0, w, h);
    return canvas;
}

/** Resample a source canvas to the storage DPI (dpi/96×, clamped so
 *  no side exceeds the browser's ~16k canvas cap) and encode it with
 *  the storage format + density metadata. */
export function resampleCanvasToDpi(
    source: HTMLCanvasElement,
    opts: ShotEncodeOptions
): { dataUrl: string; width: number; height: number; bytes: number } {
    const dpi = clampDpi(opts.dpi);
    const factor = Math.max(1, dpi / 96);
    const MAX_SIDE = 16_000;
    const scale = Math.min(factor, MAX_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const encoded = encodeCanvas(canvas, {...opts, dpi});
    return {
        dataUrl: encoded.dataUrl,
        width: canvas.width,
        height: canvas.height,
        bytes: encoded.bytes,
    };
}

/** Crop a rect (in the SOURCE canvas' pixel coordinates) from a
 *  canvas, resample to the storage DPI and encode. */
export function cropCanvasRegion(
    source: HTMLCanvasElement,
    rect: { x: number; y: number; w: number; h: number },
    opts: ShotEncodeOptions
): { dataUrl: string; width: number; height: number; bytes: number } {
    const x = Math.max(0, Math.min(source.width - 1, Math.round(rect.x)));
    const y = Math.max(0, Math.min(source.height - 1, Math.round(rect.y)));
    const w = Math.max(1, Math.min(source.width - x, Math.round(rect.w)));
    const h = Math.max(1, Math.min(source.height - y, Math.round(rect.h)));
    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    const ctx = crop.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    return resampleCanvasToDpi(crop, opts);
}

/** Frame-grab a live capture stream into a data URL at the storage
 *  DPI / format. */
export async function grabVideoFrame(
    video: HTMLVideoElement,
    opts?: ShotEncodeOptions
): Promise<{ dataUrl: string; width: number; height: number; bytes: number }> {
    const frame = videoFrameToCanvas(video);
    if (!opts) {
        const encoded = encodeCanvas(frame, {dpi: 96, format: "png"});
        return {dataUrl: encoded.dataUrl, width: frame.width, height: frame.height, bytes: encoded.bytes};
    }
    return resampleCanvasToDpi(frame, opts);
}

/* ─── The IDE's INTERNAL capture engine ─────────────────────────────
*
*.
*
* Both the "window" and "region" shots therefore serialize the app's
* own workspace DOM ([data-screenshot-root]) into an SVG — no OS
* screen picker, no getDisplayMedia permission prompt. Chromium
* TAINTS any canvas that draws an SVG containing <foreignObject>
* ("Tainted canvases may not be exported"), so the DOM capture is
* delivered as VECTOR SVG (displayed, downloaded, saved — full
* fidelity, infinitely scalable); a PNG attempt is still made first
* for browsers that allow it (Firefox). Code / selection shots stay
* canvas-rendered PNGs everywhere.
*
* Fidelity helpers:
* ▸ collectPageCss — the SVG is loaded through an <img>, and
* SVG-as-image NEVER loads external resources, so the app's
* stylesheets are INLINED as text into the SVG (<style> inside the
* SVG renders). Same-origin <style>/<link> sheets are read through
* cssRules; cross-origin links are fetched.
* ▸ inlineImageSources — http(s)/blob <img> srcs are re-fetch'd
* and re-encoded as data: URLs (same external-resource rule).
*
* <canvas>/<video>/<iframe> elements cannot survive serialization —
* they are replaced by same-sized placeholder boxes so the layout
* keeps its geometry. Fonts fall back to the system stack (the
* classic foreignObject limitation). */

/** Collect the document's CSS as one inlinable string. */
async function collectPageCss(): Promise<string> {
    const parts: string[] = [];
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
        const href = (sheet as CSSStyleSheet).href;
        if (href) {
            // <link rel=stylesheet> — cssRules throws for cross-origin, so
            // fetch the file text (same-origin app bundles resolve fine).
            try {
                const res = await fetch(href, {cache: "force-cache"});
                if (res.ok) parts.push(await res.text());
                continue;
            } catch {
                continue; // unreadable — skip
            }
        }
        try {
            for (const rule of Array.from(sheet.cssRules)) {
                parts.push(rule.cssText);
            }
        } catch {
            /* protected sheet — skip */
        }
    }
    return parts.join("\n");
}

/** Re-encode every external / blob <img> src in a clone as a data:
 * URL so the SVG raster can actually show it. */
async function inlineImageSources(clone: HTMLElement): Promise<void> {
    const imgs = Array.from(clone.querySelectorAll("img"));
    await Promise.all(
        imgs.map(async (img) => {
            const src = img.getAttribute("src") ?? "";
            if (!src || src.startsWith("data:")) return;
            try {
                const res = await fetch(src, {cache: "force-cache"});
                if (!res.ok) return;
                const blob = await res.blob();
                const dataUrl = await new Promise<string>((resolve) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(String(fr.result));
                    fr.onerror = () => resolve("");
                    fr.readAsDataURL(blob);
                });
                if (dataUrl) img.setAttribute("src", dataUrl);
            } catch {
                /* offline / expired blob — leave the attribute */
            }
        })
    );
}

/** Unicode-safe base64 of an SVG text (for data:image/svg+xml URLs). */
export function svgDataUrl(svgText: string): string {
    const bytes = new TextEncoder().encode(svgText);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** A DOM raster session: the serialized SVG (blob URL for display +
 *  text for data-URL delivery) and the rasterized size. */
export interface DomRaster {
    /** Blob URL — displayable in <img> (the frozen frame / the stage). */
    url: string;
    /** The SVG source (for save-to-file data URLs). */
    text: string;
    width: number;
    height: number;
}

/**
 * Serialize an element's current visual into a self-contained SVG —
 * the internal IDE capture primitive shared by the "window" shot and
 * the "region" shot (the crop is applied through foreignObject
 * placement, keeping one serialization). Never touches a canvas, so
 * the Chromium foreignObject taint rule cannot break it.
 */
export async function rasterizeDomToSvg(
    root: Element,
    opts?: { crop?: { x: number; y: number; w: number; h: number } }
): Promise<DomRaster> {
    const rect = root.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    const clone = root.cloneNode(true) as HTMLElement;
    // canvas / video / iframe cannot serialize — swap them for
    // same-sized placeholders so the layout geometry survives.
    clone.querySelectorAll("canvas, video, iframe").forEach((el) => {
        const box = document.createElement("div");
        const r = (el as HTMLElement).getBoundingClientRect();
        box.style.width = `${Math.round(r.width)}px`;
        box.style.height = `${Math.round(r.height)}px`;
        box.style.background = "rgba(127,127,127,0.15)";
        el.replaceWith(box);
    });
    await inlineImageSources(clone);

    const css = await collectPageCss();
    const xml = new XMLSerializer().serializeToString(clone);

    // Crop: place the full-size foreignObject so the wanted region fills
    // the (smaller) SVG viewport — the outer svg clips the overflow.
    const crop = opts?.crop;
    const outW = crop ? Math.max(1, Math.round(crop.w)) : width;
    const outH = crop ? Math.max(1, Math.round(crop.h)) : height;
    const foX = crop ? -Math.round(crop.x) : 0;
    const foY = crop ? -Math.round(crop.y) : 0;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">
    <defs><style><![CDATA[${css}]]></style></defs>
    <foreignObject x="${foX}" y="${foY}" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:#f8fafc;">${xml}</div></foreignObject>
  </svg>`;
    const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
    return {url: URL.createObjectURL(blob), text: svg, width: outW, height: outH};
}

/**
 * Try to rasterize a DOM raster (optionally cropped) into a PNG data
 * URL — the quality path for browsers that allow exporting
 * foreignObject images (Firefox does; Chromium TAINTS the canvas and
 * this resolves null, letting the caller fall back to the vector
 * delivery). Never throws.
 */
export async function trySvgToPng(
    raster: DomRaster,
    opts?: ShotEncodeOptions
): Promise<{ dataUrl: string; width: number; height: number; bytes: number } | null> {
    try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("The DOM rasterization failed"));
            img.src = raster.url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = raster.width;
        canvas.height = raster.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, raster.width, raster.height);
        // Taint probe — throws ("Tainted canvases may not be exported")
        // in Chromium the moment the SVG carried a foreignObject → null,
        // and the caller delivers the vector SVG instead. Never throws.
        const probe = canvas.toDataURL("image/png");
        void probe;
        if (opts) return resampleCanvasToDpi(canvas, opts);
        const encoded = encodeCanvas(canvas, {dpi: 96, format: "png"});
        return {dataUrl: encoded.dataUrl, width: canvas.width, height: canvas.height, bytes: encoded.bytes};
    } catch {
        return null;
    }
}
