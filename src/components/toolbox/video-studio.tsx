"use client";

/**
 * the "Video studio" category — 20
 * tools around ONE re-encode engine. Everything is client-side:
 * MediaRecorder records a canvas (± WebAudio-routed audio) while the
 * video plays, so every export runs in REAL time. Pure math (timecode
 * parse/format, clip clamping, contact-sheet grid layout, bitrate
 * formatting, stats text) lives in src/lib/video-ops.ts and is unit
 * tested in Node.
 *
 *   reports      metadata · stats/bitrate · video → data URL (8 MB cap)
 *   stills       thumbnail at t · frame extract at t · contact sheet
 *   re-encode    trim · speed · rotate 90° · flip H · flip V · grayscale ·
 *                sepia · brightness · mute · volume boost · custom CSS
 *                filter · timecode overlay · resize/scale
 *   audio        audio extract (MediaRecorder over WebAudio)
 *
 * Every result is delivered through the OutputDeliveryDialog — never a
 * raw download. MediaRecorder-missing browsers get a clear message.
 */

import * as React from "react";
import {Loader2, Upload} from "lucide-react";
import {fetchPreloadFile, toolboxSaveTarget, useToolboxPreload} from "@/lib/toolbox-preload";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";
import {canvasToBlob, clamp} from "@/lib/image-ops";
import {
    clampClip,
    contactSheetLayout,
    dataUrlCapError,
    formatTimecode,
    parseTimecode,
    sampleTimestamps,
    videoStatsReport,
} from "@/lib/video-ops";

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
        {file
            ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : "Drop a video or click to browse (MP4 · WebM · MOV…)"}
      </span>
            <input type="file" accept="video/*" className="hidden"
                   onChange={(e) => onPick(e.target.files?.[0] ?? null)}/>
        </label>
    );
}

interface VideoMeta {
    duration: number;
    w: number;
    h: number;
}

/** Picker → object URL → <video> element + metadata.
 * consumes the toolbox preload context — when the dialog
 *  was opened from a video's view UI (praxis:open-toolbox), that
 *  video is fetched and set as the loaded file automatically. */
function useLoadedVideo() {
    const [file, setFile] = React.useState<File | null>(null);
    const [meta, setMeta] = React.useState<VideoMeta | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const url = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    const preload = useToolboxPreload();

    // fetch the preloaded file once (the video that is open
    // in the viewer when the toolbox was opened from its view UI).
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

    React.useEffect(() => {
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [url]);

    const onLoadedMetadata = React.useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        setError(null);
        setMeta({duration: Number.isFinite(v.duration) ? v.duration : 0, w: v.videoWidth, h: v.videoHeight});
    }, []);

    const player = url ? (
        <video
            ref={videoRef}
            src={url}
            controls
            playsInline
            preload="auto"
            onLoadedMetadata={onLoadedMetadata}
            onError={() => setError("The browser could not decode this video — try MP4 (H.264) or WebM.")}
            className="max-h-[480px] w-full rounded-md border bg-black"
            aria-label="Video source"
        />
    ) : (
        <div className="grid place-items-center rounded-md border bg-muted/20 py-8 text-xs text-muted-foreground">
            Pick a video to load it.
        </div>
    );

    return {file, setFile, player, videoRef, meta, error};
}

/** Blob delivery wiring. */
function useBlobDelivery() {
    // save-into-project lands in the SOURCE file's folder when
    // one was preloaded (Tools ▸ from the viewer), else the project root.
    const preload = useToolboxPreload();
    const [delivery, setDelivery] = React.useState<{ blob: Blob; name: string; description: string } | null>(null);
    const [open, setOpen] = React.useState(false);
    const deliver = (blob: Blob, name: string, description: string) => {
        setDelivery({blob, name, description});
        setOpen(true);
    };
    const dialog = (
        <OutputDeliveryDialog
            open={open}
            onOpenChange={setOpen}
            title="Video Result Ready"
            description={delivery?.description}
            blob={delivery?.blob ?? null}
            defaultName={delivery?.name ?? "clip.webm"}
            folderSlug={toolboxSaveTarget(preload)}
        />
    );
    return {deliver, dialog};
}

/* ─── the re-encode engine ──────────────────────────────────────── */

/** One shared AudioContext + one persistent source→gain→dest chain per
 *  <video> element (createMediaElementSource may only be called ONCE
 *  per element, so the chain is cached in a WeakMap and reused). */
const audioChains = new WeakMap<HTMLMediaElement, { gain: GainNode; dest: MediaStreamAudioDestinationNode }>();
let sharedAudioCtx: AudioContext | null = null;

function getAudioChain(video: HTMLMediaElement): { gain: GainNode; dest: MediaStreamAudioDestinationNode } {
    if (!sharedAudioCtx) sharedAudioCtx = new AudioContext();
    void sharedAudioCtx.resume();
    let chain = audioChains.get(video);
    if (!chain) {
        const src = sharedAudioCtx.createMediaElementSource(video);
        const gain = sharedAudioCtx.createGain();
        const dest = sharedAudioCtx.createMediaStreamDestination();
        src.connect(gain);
        gain.connect(dest);
        gain.connect(sharedAudioCtx.destination); // keep monitoring audible
        chain = {gain, dest};
        audioChains.set(video, chain);
    }
    return chain;
}

function once(el: HTMLMediaElement, event: string, timeoutMs = 6000): Promise<void> {
    return new Promise((resolve, reject) => {
        const on = () => {
            cleanup();
            resolve();
        };
        const fail = () => {
            cleanup();
            reject(new Error(`Timed out waiting for “${event}” — the video element seems stuck.`));
        };
        const timer = window.setTimeout(fail, timeoutMs);
        const cleanup = () => {
            el.removeEventListener(event, on);
            window.clearTimeout(timer);
        };
        el.addEventListener(event, on);
    });
}

async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
    if (Math.abs(video.currentTime - t) < 0.01) return;
    video.currentTime = t;
    await once(video, "seeked");
}

function pickMime(candidates: string[]): string | null {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
    for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return null;
}

export interface ReencodeOpts {
    start?: number;
    end?: number;
    rate?: number;
    /** degrees: 0 / 90 / 180 / 270 */
    rotate?: number;
    flipH?: boolean;
    flipV?: boolean;
    cssFilter?: string;
    mute?: boolean;
    volume?: number;
    scale?: number;
    timecode?: boolean;
    bitrate?: number;
    fps?: number;
}

function drawTimecode(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number) {
    ctx.save();
    ctx.font = "bold 20px monospace";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = "#fff";
    ctx.fillText(formatTimecode(t), 14, canvas.height - 12);
    ctx.restore();
}

/**
 * The shared export engine: plays the (segment of the) video while
 * drawing every frame to a canvas; MediaRecorder records the canvas ±
 * the WebAudio-routed audio into a WebM Blob. Runs in real time.
 */
async function reencode(
    video: HTMLVideoElement,
    opts: ReencodeOpts,
    onProgress?: (frac: number) => void
): Promise<Blob> {
    if (typeof MediaRecorder === "undefined") {
        throw new Error(
            "MediaRecorder is not supported in this browser — video export needs a Chromium/Firefox-class browser."
        );
    }
    const vw = video.videoWidth || 2;
    const vh = video.videoHeight || 2;
    const rot = ((Math.round(opts.rotate ?? 0) % 360) + 360) % 360;
    const scale = clamp(opts.scale ?? 1, 0.1, 2);
    const sw = Math.max(2, Math.round(vw * scale));
    const sh = Math.max(2, Math.round(vh * scale));
    const swapped = rot === 90 || rot === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swapped ? sh : sw;
    canvas.height = swapped ? sw : sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");

    const fps = clamp(opts.fps ?? 30, 5, 60);
    const stream = canvas.captureStream(fps);
    let restoreGain: (() => void) | null = null;
    const wasMuted = video.muted;
    const wasVolume = video.volume;
    if (!opts.mute) {
        const chain = getAudioChain(video);
        const gain = opts.volume != null ? clamp(opts.volume, 0, 4) : 1;
        chain.gain.gain.value = gain;
        restoreGain = () => {
            chain.gain.gain.value = 1;
        };
        for (const track of chain.dest.stream.getAudioTracks()) stream.addTrack(track);
    }

    const mime = pickMime(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]);
    if (!mime) throw new Error("This browser cannot record WebM video — try Chrome or Firefox.");

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: opts.bitrate ?? 4_000_000,
        audioBitsPerSecond: 128_000,
    });
    rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = () => reject(new Error("The recorder failed mid-export."));
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clip = clampClip(opts.start ?? 0, opts.end ?? duration, duration || 0);
    const start = clip?.start ?? 0;
    const end = clip?.end ?? duration;

    video.pause();
    await seekTo(video, start);
    const rate = clamp(opts.rate ?? 1, 0.1, 4);
    video.playbackRate = rate;
    video.muted = false; // a muted element silences the WebAudio source too
    video.volume = 1;

    let raf = 0;
    const drawFrame = () => {
        ctx.save();
        if (opts.cssFilter) ctx.filter = opts.cssFilter;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (rot) ctx.rotate((rot * Math.PI) / 180);
        if (opts.flipH || opts.flipV) ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? 1 : -1);
        ctx.scale(scale, scale);
        ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
        ctx.restore();
        if (opts.timecode) drawTimecode(ctx, canvas, video.currentTime);
    };

    rec.start(200);
    try {
        await video.play();
        await new Promise<void>((resolve) => {
            const step = () => {
                if (video.ended || video.currentTime >= end - 0.005) {
                    resolve();
                    return;
                }
                drawFrame();
                onProgress?.(clamp((video.currentTime - start) / Math.max(0.01, end - start), 0, 1));
                raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
        });
    } finally {
        cancelAnimationFrame(raf);
        video.pause();
        video.playbackRate = 1;
        video.muted = wasMuted;
        video.volume = wasVolume;
        restoreGain?.();
        if (rec.state !== "inactive") rec.stop();
        stream.getVideoTracks().forEach((t) => t.stop());
    }
    await stopped;
    return new Blob(chunks, {type: mime});
}

/** Seek to t and grab the frame (optionally capped) as a canvas. */
async function grabFrame(video: HTMLVideoElement, t: number, maxDim?: number): Promise<HTMLCanvasElement> {
    await seekTo(video, t);
    const vw = video.videoWidth || 2;
    const vh = video.videoHeight || 2;
    const s = maxDim ? Math.min(1, maxDim / Math.max(vw, vh)) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(vw * s));
    canvas.height = Math.max(2, Math.round(vh * s));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
}

/** Record the WebAudio chain (audio only) while the video plays once. */
async function extractAudio(video: HTMLVideoElement): Promise<Blob> {
    if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not supported in this browser.");
    }
    const chain = getAudioChain(video);
    const mime = pickMime(["audio/webm;codecs=opus", "audio/webm", "video/webm"]);
    if (!mime) throw new Error("This browser cannot record audio — try Chrome or Firefox.");
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(chain.dest.stream, {mimeType: mime, audioBitsPerSecond: 128_000});
    rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = () => reject(new Error("The audio recorder failed."));
    });
    const wasMuted = video.muted;
    video.muted = false;
    video.volume = 1;
    await seekTo(video, 0);
    rec.start(200);
    try {
        await video.play();
        await once(video, "ended", Math.max(8000, (video.duration + 5) * 1000));
    } finally {
        video.pause();
        video.muted = wasMuted;
        if (rec.state !== "inactive") rec.stop();
    }
    await stopped;
    return new Blob(chunks, {type: mime});
}

/* ─── the export-family tools (spec-driven) ─────────────────────── */

type ParamValues = Record<string, number | string | boolean>;

interface VideoControlSpec {
    key: string;
    label: string;
    kind: "range" | "select" | "check" | "text" | "time";
    def: number | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    placeholder?: string;
    options?: ReadonlyArray<readonly [string, string]>;
}

interface VideoExportSpec {
    id: string;
    label: string;
    hint: string;
    suffix: string;
    controls: VideoControlSpec[];
    build: (p: ParamValues, ctx: { duration: number }) => ReencodeOpts;
}

const vnum = (p: ParamValues, key: string): number => {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
};
const vbool = (p: ParamValues, key: string): boolean => p[key] === true;
const vstr = (p: ParamValues, key: string): string => (typeof p[key] === "string" ? (p[key] as string) : "");

const EXPORT_TOOLS: VideoExportSpec[] = [
    {
        id: "vid-trim",
        label: "Trim clip",
        hint: "Cut a segment (start → end) — exports in real time.",
        suffix: "trim",
        controls: [
            {key: "start", label: "Start", kind: "time", def: "0:00", placeholder: "0:00 or 12.5"},
            {key: "end", label: "End", kind: "time", def: "", placeholder: "blank = to the end"},
        ],
        build: (p, ctx) => {
            const start = parseTimecode(vstr(p, "start") || "0") ?? 0;
            const endRaw = vstr(p, "end").trim();
            const end = endRaw ? (parseTimecode(endRaw) ?? undefined) : undefined;
            if (end != null && end <= start) throw new Error("End must be after start (and at least 50 ms long).");
            if (end != null && ctx.duration > 0 && start >= ctx.duration) {
                throw new Error(`Start ${formatTimecode(start)} is past the end of the video (${formatTimecode(ctx.duration)}).`);
            }
            return {start, end};
        },
    },
    {
        id: "vid-speed",
        label: "Speed change export",
        hint: "Re-encode at a different playback rate (audio follows).",
        suffix: "speed",
        controls: [
            {
                key: "rate",
                label: "Rate",
                kind: "select",
                def: "0.5",
                options: [
                    ["0.25", "0.25× slow-mo"],
                    ["0.5", "0.5×"],
                    ["0.75", "0.75×"],
                    ["1.5", "1.5×"],
                    ["2", "2×"],
                    ["3", "3×"],
                ] as ReadonlyArray<readonly [string, string]>,
            },
        ],
        build: (p) => ({rate: Number(vstr(p, "rate") || "0.5")}),
    },
    {
        id: "vid-rotate",
        label: "Rotate 90° export",
        hint: "Quarter-turn (canvas swaps width/height).",
        suffix: "rotated",
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
        build: (p) => ({rotate: Number(vstr(p, "angle") || "90")}),
    },
    {
        id: "vid-flip-h",
        label: "Flip H export",
        hint: "Mirror horizontally, re-encoded.",
        suffix: "flipped-h",
        controls: [],
        build: () => ({flipH: true})
    },
    {
        id: "vid-flip-v",
        label: "Flip V export",
        hint: "Mirror vertically, re-encoded.",
        suffix: "flipped-v",
        controls: [],
        build: () => ({flipV: true})
    },
    {
        id: "vid-grayscale",
        label: "Grayscale export",
        hint: "CSS grayscale filter burned into a new file.",
        suffix: "grayscale",
        controls: [],
        build: () => ({cssFilter: "grayscale(100%)"}),
    },
    {
        id: "vid-sepia",
        label: "Sepia / vintage export",
        hint: "Sepia wash + a touch of contrast — burned in.",
        suffix: "vintage",
        controls: [],
        build: () => ({cssFilter: "sepia(80%) contrast(105%)"}),
    },
    {
        id: "vid-brightness",
        label: "Brightness boost export",
        hint: "Lift dark footage while re-encoding.",
        suffix: "brightened",
        controls: [{key: "v", label: "Brightness", kind: "range", def: 1.25, min: 0.5, max: 2, step: 0.05, unit: "×"}],
        build: (p) => ({cssFilter: `brightness(${vnum(p, "v")})`}),
    },
    {
        id: "vid-mute",
        label: "Mute audio export",
        hint: "Strip the audio track — video-only WebM.",
        suffix: "muted",
        controls: [],
        build: () => ({mute: true}),
    },
    {
        id: "vid-volume",
        label: "Volume boost export",
        hint: "WebAudio gain node — boosts quiet recordings.",
        suffix: "volume",
        controls: [{key: "v", label: "Gain", kind: "range", def: 1.6, min: 0.25, max: 3, step: 0.05, unit: "×"}],
        build: (p) => ({volume: vnum(p, "v")}),
    },
    {
        id: "vid-filter",
        label: "Custom filter export",
        hint: "Any CSS filter string, burned in while re-encoding.",
        suffix: "filtered",
        controls: [
            {
                key: "filter",
                label: "CSS filter",
                kind: "text",
                def: "blur(2px) saturate(1.2)",
                placeholder: "blur(2px) saturate(1.2)"
            },
        ],
        build: (p) => ({cssFilter: vstr(p, "filter") || "none"}),
    },
    {
        id: "vid-timecode",
        label: "Timecode overlay export",
        hint: "Burn a running mm:ss.cc timestamp into the corner.",
        suffix: "timecode",
        controls: [{key: "on", label: "Burn timecode", kind: "check", def: true}],
        build: (p) => ({timecode: vbool(p, "on")}),
    },
    {
        id: "vid-scale",
        label: "Resize / scale export",
        hint: "Downscale the canvas while re-encoding (smaller files).",
        suffix: "scaled",
        controls: [
            {
                key: "scale",
                label: "Scale",
                kind: "select",
                def: "0.75",
                options: [
                    ["0.5", "50%"],
                    ["0.75", "75%"],
                    ["1", "100% (no change)"],
                ] as ReadonlyArray<readonly [string, string]>,
            },
        ],
        build: (p) => ({scale: Number(vstr(p, "scale") || "0.75")}),
    },
    /* — the +10 additions that bring Video Studio to 30 export tools.
      * Each rides the SAME re-encode pipeline — just a different
      * ReencodeOpts preset (cssFilter / rotate / scale / fps / mute
      * combinations). */
    {
        id: "vid-contrast",
        label: "Contrast boost export",
        hint: "contrast(125%) burned in — punchier footage.",
        suffix: "contrast",
        controls: [{key: "v", label: "Contrast", kind: "range", def: 125, min: 90, max: 200, step: 1, unit: "%"}],
        build: (p) => ({cssFilter: `contrast(${vnum(p, "v")}%)`}),
    },
    {
        id: "vid-saturate",
        label: "Saturation boost export",
        hint: "saturate(140%) — the vivid pass.",
        suffix: "saturated",
        controls: [{key: "v", label: "Saturation", kind: "range", def: 140, min: 50, max: 300, step: 1, unit: "%"}],
        build: (p) => ({cssFilter: `saturate(${vnum(p, "v")}%)`}),
    },
    {
        id: "vid-hue",
        label: "Hue rotate export",
        hint: "Spin the whole palette while re-encoding.",
        suffix: "hue",
        controls: [{key: "v", label: "Angle", kind: "range", def: 90, min: 0, max: 360, step: 1, unit: "°"}],
        build: (p) => ({cssFilter: `hue-rotate(${vnum(p, "v")}deg)`}),
    },
    {
        id: "vid-invert",
        label: "Invert colors export",
        hint: "The negative-image flip, burned in.",
        suffix: "inverted",
        controls: [],
        build: () => ({cssFilter: "invert(100%)"}),
    },
    {
        id: "vid-vintage",
        label: "Vintage export",
        hint: "sepia(60%) + contrast(110%) — the found-footage look.",
        suffix: "vintage",
        controls: [{key: "sep", label: "Sepia", kind: "range", def: 60, min: 10, max: 100, step: 1, unit: "%"}],
        build: (p) => ({cssFilter: `sepia(${vnum(p, "sep")}%) contrast(110%)`}),
    },
    {
        id: "vid-rotate-180",
        label: "Rotate 180 export",
        hint: "Upside down — no controls, just the turn.",
        suffix: "rotated-180",
        controls: [],
        build: () => ({rotate: 180}),
    },
    {
        id: "vid-mute-gray",
        label: "Silent grayscale export",
        hint: "Grayscale AND muted — the archive-duplicate preset.",
        suffix: "gray-mute",
        controls: [],
        build: () => ({cssFilter: "grayscale(100%)", mute: true}),
    },
    {
        id: "vid-half",
        label: "Half-size export",
        hint: "50% canvas + default quality — the quick draft render.",
        suffix: "half",
        controls: [],
        build: () => ({scale: 0.5}),
    },
    {
        id: "vid-double",
        label: "Upscale export",
        hint: "150% canvas scale (the browser resamples) — the softer big render.",
        suffix: "big",
        controls: [],
        build: () => ({scale: 1.5}),
    },
    {
        id: "vid-fps24",
        label: "24 fps export",
        hint: "Re-encode at the cinema frame rate — the filmic timing.",
        suffix: "fps24",
        controls: [
            {
                key: "fps",
                label: "FPS",
                kind: "select",
                def: "24",
                options: [["12", "12"], ["24", "24"], ["30", "30"]] as ReadonlyArray<readonly [string, string]>,
            },
        ],
        build: (p) => ({fps: Number(vstr(p, "fps") || "24")}),
    },
];

function VideoExportRunner({spec}: { spec: VideoExportSpec }) {
    const {file, setFile, player, videoRef, meta, error} = useLoadedVideo();
    const [params, setParams] = React.useState<ParamValues>({});
    const [busy, setBusy] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = useBlobDelivery();

    React.useEffect(() => {
        const d: ParamValues = {};
        for (const c of spec.controls) d[c.key] = c.def;
        setParams(d);
        setRunError(null);
    }, [spec]);

    const setParam = (key: string, value: number | string | boolean) => setParams((p) => ({...p, [key]: value}));

    const run = async () => {
        const video = videoRef.current;
        if (!video || !file) return;
        setBusy(true);
        setRunError(null);
        setProgress(0);
        try {
            const opts = spec.build(params, {duration: meta?.duration ?? 0});
            const blob = await reencode(video, opts, setProgress);
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-${spec.suffix}.webm`, "WebM (VP8/VP9 + Opus) — exported in real time via MediaRecorder.");
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
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
                                    className="h-1.5 w-32 accent-emerald-600"
                                    aria-label={c.label}
                                />
                                <span className="w-16 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {val}
                                    {c.unit ?? ""}
                </span>
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
                    return (
                        <label key={c.key} className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">{c.label}</span>
                            <Input
                                value={typeof v === "string" ? v : ""}
                                placeholder={c.placeholder}
                                onChange={(e) => setParam(c.key, e.target.value)}
                                className="h-8 w-40 text-xs font-mono"
                                aria-label={c.label}
                            />
                        </label>
                    );
                })}
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!meta || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Exporting…" : "Export WebM"}
                </Button>
            </div>
            {busy && (
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-48 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-emerald-500 transition-all"
                             style={{width: `${Math.round(progress * 100)}%`}}/>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{Math.round(progress * 100)}%</span>
                </div>
            )}
            {runError && <Err>{runError}</Err>}
            <Note>
                {spec.hint} Exports run in real time — a 30 s clip takes ~30
                s. {meta ? `Source: ${meta.w} × ${meta.h} · ${formatTimecode(meta.duration)}.` : ""}
            </Note>
            {dialog}
        </div>
    );
}

/* ─── the hand-written tools ────────────────────────────────────── */

function TextResultButton({
                              text,
                              name,
                              label = "Deliver .txt",
                          }: {
    text: string;
    name: string;
    label?: string;
}) {
    // same save-target rule as useBlobDelivery — the source
    // file's folder when preloaded, else the project root.
    const preload = useToolboxPreload();
    const [open, setOpen] = React.useState(false);
    return (
        <>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!text} onClick={() => setOpen(true)}>
                {label}
            </Button>
            <OutputDeliveryDialog
                open={open}
                onOpenChange={setOpen}
                title="Report Ready"
                description="Copy, save as…, or save into the project folder."
                text={text || null}
                defaultName={name}
                folderSlug={toolboxSaveTarget(preload)}
            />
        </>
    );
}

export function VideoMetadataTool() {
    const {file, setFile, player, meta, error} = useLoadedVideo();
    const report = React.useMemo(
        () =>
            file && meta
                ? videoStatsReport({
                    name: file.name,
                    type: file.type || "unknown",
                    bytes: file.size,
                    duration: meta.duration,
                    width: meta.w,
                    height: meta.h,
                })
                : "",
        [file, meta]
    );
    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex items-center gap-2">
                <TextResultButton text={report}
                                  name={`${(file?.name ?? "video").replace(/\.[^.]+$/, "")}-metadata.txt`}/>
            </div>
            <pre
                className="min-h-[80px] w-full rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {report || "Pick a video to read its metadata."}
      </pre>
            {report && <Note>Duration/resolution come from the element; bitrate is file size ÷ duration.</Note>}
        </div>
    );
}

export function VideoStatsTool() {
    const {file, setFile, player, meta, error} = useLoadedVideo();
    const report = React.useMemo(
        () =>
            file && meta
                ? videoStatsReport({
                    name: file.name,
                    type: file.type || "unknown",
                    bytes: file.size,
                    duration: meta.duration,
                    width: meta.w,
                    height: meta.h,
                    frameRate: 30,
                }) +
                "\n\nNOTE  frame rate is ASSUMED 30 fps — the browser does not expose\n      the real frame rate. Frame counts are estimates."
                : "",
        [file, meta]
    );
    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex items-center gap-2">
                <TextResultButton text={report} name={`${(file?.name ?? "video").replace(/\.[^.]+$/, "")}-stats.txt`}/>
            </div>
            <pre
                className="min-h-[80px] w-full rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {report || "Pick a video to compute its stats."}
      </pre>
            <Note>Bitrate = size ÷ duration (container overhead included) — a rough, honest number.</Note>
        </div>
    );
}

/** Shared time-input + grab-frame flow for the still tools. */
function useStillGrabber() {
    const {file, setFile, player, videoRef, meta, error} = useLoadedVideo();
    const [time, setTime] = React.useState("0:01");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = useBlobDelivery();

    const grab = async (maxDim?: number, suffix: string = "frame") => {
        const video = videoRef.current;
        if (!video || !file) return;
        const t = parseTimecode(time);
        if (t == null) {
            setRunError(`“${time}” is not a timecode — try 1:23.5 or 12.5.`);
            return;
        }
        setBusy(true);
        setRunError(null);
        try {
            const canvas = await grabFrame(video, t, maxDim);
            const blob = await canvasToBlob(canvas, "image/png");
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-${suffix}.png`, `Frame at ${formatTimecode(t)} — PNG still.`);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return {file, setFile, player, meta, error, time, setTime, busy, runError, grab, dialog};
}

function TimeInput({time, setTime, duration}: { time: string; setTime: (v: string) => void; duration: number }) {
    return (
        <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Time</span>
            <Input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="1:23.5 or 12.5"
                className="h-8 w-32 text-xs font-mono"
                aria-label="Frame time"
            />
            {duration > 0 && <span className="text-[11px] text-muted-foreground">of {formatTimecode(duration)}</span>}
        </label>
    );
}

export function VideoThumbnailTool() {
    const g = useStillGrabber();
    return (
        <div className="space-y-3 py-1">
            <Drop file={g.file} onPick={g.setFile}/>
            {g.error && <Err>{g.error}</Err>}
            {g.player}
            <div className="flex flex-wrap items-center gap-3">
                <TimeInput time={g.time} setTime={g.setTime} duration={g.meta?.duration ?? 0}/>
                <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={!g.meta || g.busy}
                    onClick={() => void g.grab(640, "thumb")}
                >
                    {g.busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {g.busy ? "Seeking…" : "Grab thumbnail"}
                </Button>
            </div>
            {g.runError && <Err>{g.runError}</Err>}
            <Note>Thumbnail = the frame capped at 640 px on the long edge — handy for posters and link previews.</Note>
            {g.dialog}
        </div>
    );
}

export function VideoFrameTool() {
    const g = useStillGrabber();
    return (
        <div className="space-y-3 py-1">
            <Drop file={g.file} onPick={g.setFile}/>
            {g.error && <Err>{g.error}</Err>}
            {g.player}
            <div className="flex flex-wrap items-center gap-3">
                <TimeInput time={g.time} setTime={g.setTime} duration={g.meta?.duration ?? 0}/>
                <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={!g.meta || g.busy}
                    onClick={() => void g.grab(undefined, "frame")}
                >
                    {g.busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {g.busy ? "Seeking…" : "Extract frame"}
                </Button>
            </div>
            {g.runError && <Err>{g.runError}</Err>}
            <Note>Full-resolution PNG still at the given time.</Note>
            {g.dialog}
        </div>
    );
}

export function VideoContactSheetTool() {
    const {file, setFile, player, videoRef, meta, error} = useLoadedVideo();
    const [frames, setFrames] = React.useState(12);
    const [cols, setCols] = React.useState("auto");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = useBlobDelivery();

    const build = async () => {
        const video = videoRef.current;
        if (!video || !file || !meta) return;
        setBusy(true);
        setRunError(null);
        try {
            const layout = contactSheetLayout(frames, cols !== "auto" ? {cols: Number(cols)} : undefined);
            const canvas = document.createElement("canvas");
            canvas.width = layout.sheetW;
            canvas.height = layout.sheetH;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas 2D is unavailable.");
            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const stamps = sampleTimestamps(meta.duration, frames);
            for (let i = 0; i < stamps.length; i++) {
                await seekTo(video, stamps[i]);
                const col = i % layout.cols;
                const row = Math.floor(i / layout.cols);
                const x = layout.gap + col * (layout.cellW + layout.gap);
                const y = layout.gap + row * (layout.cellH + layout.labelH + layout.gap);
                // letterbox fit into the cell
                const s = Math.min(layout.cellW / (video.videoWidth || 2), layout.cellH / (video.videoHeight || 2));
                const w = Math.max(2, Math.round((video.videoWidth || 2) * s));
                const h = Math.max(2, Math.round((video.videoHeight || 2) * s));
                ctx.drawImage(video, x + (layout.cellW - w) / 2, y + (layout.cellH - h) / 2, w, h);
                ctx.fillStyle = "#eee";
                ctx.font = "12px monospace";
                ctx.textBaseline = "top";
                ctx.fillText(formatTimecode(stamps[i]), x + 2, y + layout.cellH + 3);
            }
            const blob = await canvasToBlob(canvas, "image/png");
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-contact-sheet.png`, `${frames} frames on a ${layout.cols} × ${layout.rows} grid.`);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Frames</span>
                    <input
                        type="range"
                        min={4}
                        max={36}
                        step={2}
                        value={frames}
                        onChange={(e) => setFrames(Number(e.target.value))}
                        className="h-1.5 w-32 accent-emerald-600"
                        aria-label="Frame count"
                    />
                    <span className="w-8 font-mono text-[11px] text-muted-foreground">{frames}</span>
                </label>
                <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Columns</span>
                    <Sel
                        value={cols}
                        onValueChange={setCols}
                        options={[
                            ["auto", "auto (√N)"],
                            ["2", "2"],
                            ["3", "3"],
                            ["4", "4"],
                            ["6", "6"],
                        ] as ReadonlyArray<readonly [string, string]>}
                        ariaLabel="Columns"
                    />
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!meta || busy} onClick={() => void build()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Capturing…" : "Build contact sheet"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>Evenly spaced samples across the whole clip, each stamped with its timecode.</Note>
            {dialog}
        </div>
    );
}

export function VideoAudioExtractTool() {
    const {file, setFile, player, videoRef, meta, error} = useLoadedVideo();
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);
    const {deliver, dialog} = useBlobDelivery();

    const run = async () => {
        const video = videoRef.current;
        if (!video || !file) return;
        setBusy(true);
        setRunError(null);
        try {
            const blob = await extractAudio(video);
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-audio.webm`, "Audio track (Opus in WebM) — recorded via WebAudio.");
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!meta || busy} onClick={() => void run()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                    {busy ? "Recording (real time)…" : "Extract audio"}
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            <Note>Records the WebAudio chain while the video plays once — the video element is left unharmed.</Note>
            {dialog}
        </div>
    );
}

export function VideoDataUrlTool() {
    const {file, setFile, player, error} = useLoadedVideo();
    // save-target — source folder when preloaded, else root.
    const preload = useToolboxPreload();
    const [busy, setBusy] = React.useState(false);
    const [dataUrl, setDataUrl] = React.useState("");
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!file) {
            setDataUrl("");
            return;
        }
        const capError = dataUrlCapError(file.size);
        if (capError) {
            setDataUrl("");
            return;
        }
        let cancelled = false;
        setBusy(true);
        const reader = new FileReader();
        reader.onload = () => {
            if (!cancelled) setDataUrl(String(reader.result ?? ""));
        };
        reader.onloadend = () => {
            if (!cancelled) setBusy(false);
        };
        reader.onerror = () => {
            if (!cancelled) setDataUrl("");
        };
        reader.readAsDataURL(file);
        return () => {
            cancelled = true;
        };
    }, [file]);

    const capError = file ? dataUrlCapError(file.size) : null;

    return (
        <div className="space-y-3 py-1">
            <Drop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            {capError && <Err>{capError}</Err>}
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!dataUrl || busy}
                    onClick={() => setOpen(true)}
                >
                    {busy ? "Encoding…" : "Deliver .txt"}
                </Button>
                {dataUrl &&
                  <Note>{dataUrl.length.toLocaleString()} characters · {(dataUrl.length / 1024 / 1024).toFixed(1)} MB of
                    text</Note>}
            </div>
            <pre
                className="max-h-32 w-full overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] break-all whitespace-pre-wrap">
        {dataUrl ? dataUrl.slice(0, 400) + "…" : "Pick a video (≤ 8 MB) to inline as a data: URI."}
      </pre>
            <OutputDeliveryDialog
                open={open}
                onOpenChange={setOpen}
                title="Video Data URL Ready"
                description="The full data: URI — copy, save as…, or save into the project folder."
                text={dataUrl || null}
                defaultName={`${(file?.name ?? "video").replace(/\.[^.]+$/, "")}-dataurl.txt`}
                folderSlug={toolboxSaveTarget(preload)}
            />
        </div>
    );
}

/* ─── the registry entry point ──────────────────────────────────── */

/** One component per tool id — used by the dev-toolbox registry. */
export function videoStudioTool(id: string): React.ComponentType {
    const C = function VideoStudioEntry() {
        switch (id) {
            case "vid-meta":
                return <VideoMetadataTool/>;
            case "vid-thumb":
                return <VideoThumbnailTool/>;
            case "vid-frame":
                return <VideoFrameTool/>;
            case "vid-contact":
                return <VideoContactSheetTool/>;
            case "vid-audio":
                return <VideoAudioExtractTool/>;
            case "vid-dataurl":
                return <VideoDataUrlTool/>;
            case "vid-stats":
                return <VideoStatsTool/>;
            default: {
                const spec = EXPORT_TOOLS.find((t) => t.id === id);
                return spec ? <VideoExportRunner spec={spec}/> : <Note>Unknown tool.</Note>;
            }
        }
    };
    C.displayName = `VideoStudio(${id})`;
    return C;
}
