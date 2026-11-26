/**
 * the PURE helpers behind the Developer
 * Toolbox's "Video studio" category. Strictly no DOM in here — the
 * <video> element, MediaRecorder and canvas pipeline live in
 * src/components/toolbox/video-studio.tsx; this module owns the math
 * those components share (timecode parse/format, clip clamping,
 * contact-sheet grid layout, bitrate formatting, stats report text)
 * so it can be unit-tested in Node.
 */

import {aspectRatioFraction, clamp, formatBytes} from "./image-ops";

/* ─── timecodes ─────────────────────────────────────────────────── */

/** seconds → "m:ss.cc" (or "h:mm:ss.cc" once an hour is reached). */
export function formatTimecode(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
    const cs = Math.floor((seconds % 1) * 100);
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}.${pad2(cs)}` : `${m}:${pad2(ss)}.${pad2(cs)}`;
}

/**
 * "1:23.5" | "01:02:03.4" | "83.5" | "12" → seconds (or null when the
 * input is not a plausible timecode: bad chars, minutes/seconds > 59 in
 * compound forms, negatives, empty).
 */
export function parseTimecode(input: string): number | null {
    const s = (input ?? "").trim();
    if (!s) return null;
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(s)) return null;
    const parts = s.split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) {
        const [m, ss] = parts;
        if (ss > 59) return null;
        return m * 60 + ss;
    }
    const [h, m, ss] = parts;
    if (m > 59 || ss > 59) return null;
    return h * 3600 + m * 60 + ss;
}

export interface ClipRange {
    start: number;
    end: number;
    duration: number;
}

/**
 * Clamp a (start, end) pair into a recordable clip. Returns null when
 * the result would be too short to record (< 50 ms) or the duration is
 * unusable.
 */
export function clampClip(start: number, end: number, duration: number): ClipRange | null {
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const s = clamp(start, 0, duration);
    const e = clamp(end, 0, duration);
    if (e - s < 0.05) return null;
    return {start: s, end: e, duration};
}

/* ─── contact-sheet grid math ───────────────────────────────────── */

export interface ContactSheetLayout {
    cols: number;
    rows: number;
    cellW: number;
    cellH: number;
    gap: number;
    labelH: number;
    sheetW: number;
    sheetH: number;
}

/**
 * Grid layout for a contact sheet: `cols` defaults to a balanced
 * √N-ish grid, rows = ceil(n / cols), sheet = cells + labels + gaps.
 */
export function contactSheetLayout(
    frameCount: number,
    opts?: { cols?: number; cellW?: number; cellH?: number; gap?: number; labelH?: number }
): ContactSheetLayout {
    const n = clamp(Math.round(frameCount), 1, 256);
    const cellW = opts?.cellW ?? 320;
    const cellH = opts?.cellH ?? 180;
    const gap = opts?.gap ?? 8;
    const labelH = opts?.labelH ?? 18;
    const cols = clamp(Math.round(opts?.cols ?? Math.ceil(Math.sqrt(n))), 1, n);
    const rows = Math.ceil(n / cols);
    return {
        cols,
        rows,
        cellW,
        cellH,
        gap,
        labelH,
        sheetW: cols * cellW + (cols + 1) * gap,
        sheetH: rows * (cellH + labelH) + (rows + 1) * gap,
    };
}

/** Evenly spaced sample timestamps (fraction 0…1 across the duration). */
export function sampleTimestamps(duration: number, count: number): number[] {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const n = clamp(Math.round(count), 1, 256);
    return Array.from({length: n}, (_, i) => (duration * (i + 0.5)) / n);
}

/* ─── formatting ────────────────────────────────────────────────── */

export function formatBitrate(bitsPerSecond: number): string {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return "—";
    if (bitsPerSecond < 1_000_000) return `${Math.round(bitsPerSecond / 1000)} kbps`;
    return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
}

export interface VideoStatsInput {
    name: string;
    type: string;
    bytes: number;
    duration: number;
    width: number;
    height: number;
    frameRate?: number;
}

/** Metadata/stats report text (honest: bitrate is size ÷ duration). */
export function videoStatsReport(v: VideoStatsInput): string {
    const {width, height, duration, bytes} = v;
    const bitrate = duration > 0 ? (bytes * 8) / duration : 0;
    const lines = [
        `File            ${v.name}`,
        `Format          ${v.type || "unknown"}`,
        `Duration        ${formatTimecode(duration)} (${duration.toFixed(2)} s)`,
        `Resolution      ${width} × ${height} px`,
        `Aspect ratio    ${aspectRatioFraction(width, height)} (${(width / Math.max(1, height)).toFixed(2)})`,
    ];
    if (v.frameRate && v.frameRate > 0) {
        lines.push(`Frame rate      ${v.frameRate} fps (≈ ${Math.round(duration * v.frameRate).toLocaleString()} frames)`);
    }
    lines.push(
        `File size       ${formatBytes(bytes)} (${bytes.toLocaleString()} bytes)`,
        `Overall bitrate ${formatBitrate(bitrate)}${bitrate > 0 ? " (file size ÷ duration)" : ""}`
    );
    return lines.join("\n");
}

/* ─── data-URL cap ──────────────────────────────────────────────── */

export const VIDEO_DATAURL_CAP = 8 * 1024 * 1024;

/** Error message when a video is too big to inline, else null. */
export function dataUrlCapError(bytes: number, cap = VIDEO_DATAURL_CAP): string | null {
    if (bytes <= cap) return null;
    return `The video is ${formatBytes(bytes)} — over the ${formatBytes(cap)} data-URL cap. Trim or shrink it first (Video studio ▸ Trim clip / Resize export), then retry.`;
}
