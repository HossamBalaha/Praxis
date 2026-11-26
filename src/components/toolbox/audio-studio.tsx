"use client";

/**
 * the "Audio studio" category, the AUDIO half of the split
 * between audio and video tools (audio tools are linked to the
 * audio files). The
 * video tools stay in toolbox/video-studio.tsx; the inline audio
 * PLAYER is components/audio-tools.tsx.
 *
 * Nine tools around ONE offline-render engine:
 *
 * reports metadata & levels (duration / channels / sample rate /
 * peak + RMS dBFS / bitrate) · audio → data URL (8 MB cap)
 * stills waveform → PNG (min/max column render with grid)
 * offline trim clip · fade in/out · volume boost · normalize
 * peak · speed change · any format → 16-bit WAV
 *
 * Unlike the Video studio's real-time MediaRecorder pipeline, every
 * transform here renders through OfflineAudioContext + the pure WAV
 * encoder in lib/audio-ops.ts — the result is written in one pass,
 * faster than real time, with deterministic output. Pure math (dB,
 * levels, envelope, WAV headers, waveform reduction) is unit-tested
 * in Node (audio-ops.test.ts).
 *
 * Every result goes through the OutputDeliveryDialog — never a raw
 * download. The toolbox preload context links the tool to the audio
 * file open in the viewer when launched from its Tools ▸ menu.
 */

import * as React from "react";
import {Loader2, Upload} from "lucide-react";
import {fetchPreloadFile, toolboxSaveTarget, useToolboxPreload} from "@/lib/toolbox-preload";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {OutputDeliveryDialog} from "@/components/output-delivery-dialog";
import {canvasToBlob} from "@/lib/image-ops";
import {audioLevelsAll, audioStatsReport, dbFromLinear, encodeWav, linearFromDb, waveformPeaks,} from "@/lib/audio-ops";

/* ─── shared bits (local copies so the suite files stay independent) ── */

function Note({children}: { children: React.ReactNode }) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Err({children}: { children: React.ReactNode }) {
    return <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">{children}</p>;
}

function AudioDrop({file, onPick}: { file: File | null; onPick: (f: File | null) => void }) {
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
            : "Drop an audio file or click to browse (WAV · MP3 · OGG · WebM · FLAC…)"}
      </span>
            <input type="file" accept="audio/*" className="hidden"
                   onChange={(e) => onPick(e.target.files?.[0] ?? null)}/>
        </label>
    );
}

/** Blob delivery wiring (same shape as the Video studio's). */
function useBlobDelivery() {
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
            title="Audio Result Ready"
            description={delivery?.description}
            blob={delivery?.blob ?? null}
            defaultName={delivery?.name ?? "result.wav"}
            folderSlug={toolboxSaveTarget(preload)}
        />
    );
    return {deliver, dialog};
}

function TextResultButton({
                              text,
                              name,
                              label = "Deliver .txt",
                          }: {
    text: string;
    name: string;
    label?: string;
}) {
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

/* ─── the source loader: pick / preload → decode once ─────────────── */

interface LoadedAudio {
    file: File | null;
    setFile: (f: File | null) => void;
    player: React.ReactNode;
    buffer: AudioBuffer | null;
    error: string | null;
    decoding: boolean;
}

/** Picker → object URL → <audio controls> preview + the decoded
 *  AudioBuffer (one decode feeds every tool). Consumes the toolbox
 *  preload context so the audio file open in the viewer is loaded
 *  automatically when the dialog opens from its Tools ▸ menu. */
function useDecodedAudio(): LoadedAudio {
    const [file, setFile] = React.useState<File | null>(null);
    const [buffer, setBuffer] = React.useState<AudioBuffer | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [decoding, setDecoding] = React.useState(false);
    const url = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    const preload = useToolboxPreload();

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

    // Decode ONCE per picked file → AudioBuffer (channels + length +
    // sampleRate). A fresh AudioContext per decode is closed right
    // after; decodeAudioData detaches the ArrayBuffer, so a copy of the
    // file bytes is read for every new file.
    React.useEffect(() => {
        if (!file) {
            setBuffer(null);
            setError(null);
            return;
        }
        let cancelled = false;
        setDecoding(true);
        setError(null);
        void (async () => {
            try {
                const AC = window.AudioContext ?? (window as unknown as {
                    webkitAudioContext: typeof AudioContext
                }).webkitAudioContext;
                const ctx = new AC();
                const bytes = await file.arrayBuffer();
                const decoded = await ctx.decodeAudioData(bytes.slice(0));
                if (!cancelled) {
                    setBuffer(decoded);
                    setError(null);
                }
                void ctx.close();
            } catch {
                if (!cancelled) setError("The browser could not decode this file — try WAV, MP3, OGG, WebM or FLAC.");
            } finally {
                if (!cancelled) setDecoding(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [file]);

    const player = url ? (
        <audio src={url} controls preload="auto" className="w-full rounded-md border" aria-label="Audio source"/>
    ) : (
        <div className="grid place-items-center rounded-md border bg-muted/20 py-8 text-xs text-muted-foreground">
            Pick an audio file to load it.
        </div>
    );

    return {file, setFile, player, buffer, error, decoding};
}

/* ─── the offline render engine ──────────────────────────────────── */

export interface RenderWavOpts {
    /** Trim window in SOURCE seconds (undefined end = to the end). */
    start?: number;
    end?: number;
    /** Linear gain applied to the whole render (1 = untouched). */
    gain?: number;
    /** Linear fades, in OUTPUT seconds. */
    fadeIn?: number;
    fadeOut?: number;
    /** Playback rate (1 = normal; 2 = double-speed, half-length). */
    rate?: number;
}

/**
 * One OfflineAudioContext pass: source (trimmed, rate-adjusted) →
 * gain (+ fade envelope) → destination, encoded to 16-bit PCM WAV.
 * Deterministic and faster than real time — no MediaRecorder needed.
 */
export async function renderProcessedWav(buf: AudioBuffer, opts: RenderWavOpts = {}): Promise<Blob> {
    const rate = Math.max(0.0625, opts.rate ?? 1);
    const srcStart = Math.max(0, Math.min(opts.start ?? 0, Math.max(0, buf.duration - 0.02)));
    const srcEnd = Math.max(srcStart + 0.02, Math.min(opts.end ?? buf.duration, buf.duration));
    const srcDur = srcEnd - srcStart;
    const outDur = srcDur / rate;
    const frames = Math.max(1, Math.ceil(outDur * buf.sampleRate));
    const ctx = new OfflineAudioContext(Math.min(2, Math.max(1, buf.numberOfChannels)), frames, buf.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    const g = Math.max(0, opts.gain ?? 1);
    const fadeIn = Math.max(0, Math.min(opts.fadeIn ?? 0, outDur));
    const fadeOut = Math.max(0, Math.min(opts.fadeOut ?? 0, outDur - fadeIn));
    if (fadeIn > 0) {
        gain.gain.setValueAtTime(0, 0);
        gain.gain.linearRampToValueAtTime(g, fadeIn);
    } else {
        gain.gain.setValueAtTime(g, 0);
    }
    if (fadeOut > 0) {
        gain.gain.setValueAtTime(g, Math.max(fadeIn, outDur - fadeOut));
        gain.gain.linearRampToValueAtTime(0, outDur);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(0, srcStart, srcDur);
    const rendered = await ctx.startRendering();
    const channels: Float32Array[] = [];
    for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c));
    return new Blob([encodeWav(channels, rendered.sampleRate) as unknown as BlobPart], {type: "audio/wav"});
}

/* ─── small control primitives ───────────────────────────────────── */

function NumField({
                      label,
                      value,
                      onChange,
                      unit,
                      min,
                      max,
                      placeholder,
                  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    unit?: string;
    min?: number;
    max?: number;
    placeholder?: string;
}) {
    return (
        <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                inputMode="decimal"
                className="h-8 w-28 text-xs font-mono"
                aria-label={label}
            />
            {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
            {min !== undefined && max !== undefined && (
                <span className="text-[10px] text-muted-foreground">
          {min}–{max}
        </span>
            )}
        </label>
    );
}

function RunButton({
                       busy,
                       disabled,
                       children,
                       onClick,
                   }: {
    busy: boolean;
    disabled: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={disabled || busy} onClick={onClick}>
            {busy ? <Loader2 className="size-3.5 animate-spin"/> : null}
            {busy ? "Rendering…" : children}
        </Button>
    );
}

/** Seconds ↔ "m:ss.d" timecode (same format the players show). */
function fmtT(s: number): string {
    if (!Number.isFinite(s) || s < 0) return "0:00.0";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

function parseT(v: string): number | null {
    const t = v.trim();
    if (t === "") return null;
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(t);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return null;
}

/* ─── the tools ──────────────────────────────────────────────────── */

/** aud-meta — metadata & levels report. */
export function AudioMetadataTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const report = React.useMemo(() => {
        if (!file || !buffer) return "";
        const channels: Float32Array[] = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        const {peak, rms} = audioLevelsAll(channels);
        return audioStatsReport({
            name: file.name,
            type: file.type || "unknown",
            bytes: file.size,
            duration: buffer.duration,
            channels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate,
            peakDb: dbFromLinear(peak),
            rmsDb: dbFromLinear(rms),
        });
    }, [file, buffer]);
    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            {decoding && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin"/> Decoding for analysis…
                </p>
            )}
            <div className="flex items-center gap-2">
                <TextResultButton text={report}
                                  name={`${(file?.name ?? "audio").replace(/\.[^.]+$/, "")}-metadata.txt`}/>
            </div>
            <pre
                className="min-h-[80px] w-full rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
        {report || "Pick an audio file to read its metadata and levels."}
      </pre>
            <Note>
                Peak / RMS are decoded sample values in dBFS (0 = full scale). Bitrate is size ÷ duration — container
                overhead included, so it is a rough, honest number.
            </Note>
        </div>
    );
}

/** aud-trim — cut a time window → WAV. */
export function AudioTrimTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [start, setStart] = React.useState("0:00");
    const [end, setEnd] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (!file || !buffer) return;
        const s = parseT(start) ?? 0;
        const e = end.trim() === "" ? buffer.duration : parseT(end);
        if (e == null) {
            setRunError(`"${end}" is not a timecode — try 1:23.5 or 12.5 (blank = to the end).`);
            return;
        }
        if (e <= s) {
            setRunError("End must be after start (and at least 20 ms long).");
            return;
        }
        setBusy(true);
        setRunError(null);
        try {
            const blob = await renderProcessedWav(buffer, {start: s, end: e});
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-trim.wav`, `Cut ${fmtT(s)} → ${fmtT(e)} (${(e - s).toFixed(1)} s) — 16-bit PCM WAV.`);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <NumField label="Start" value={start} onChange={setStart} placeholder="0:00 or 12.5"/>
                <NumField label="End" value={end} onChange={setEnd} placeholder="blank = to the end"/>
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Trim → WAV
                </RunButton>
            </div>
            {buffer ? <Note>Source duration {fmtT(buffer.duration)} — the window is clamped to it.</Note> : null}
            {runError && <Err>{runError}</Err>}
            {dialog}
        </div>
    );
}

/** aud-fade — fade in/out → WAV. */
export function AudioFadeTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [fadeIn, setFadeIn] = React.useState("2");
    const [fadeOut, setFadeOut] = React.useState("3");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (!file || !buffer) return;
        const fi = Number(fadeIn);
        const fo = Number(fadeOut);
        if (!Number.isFinite(fi) || fi < 0 || !Number.isFinite(fo) || fo < 0) {
            setRunError("Fades are seconds ≥ 0 — e.g. 2 and 3.");
            return;
        }
        if (fi + fo >= buffer.duration) {
            setRunError(`Fades (${fi.toFixed(1)} + ${fo.toFixed(1)} s) overlap the whole clip (${buffer.duration.toFixed(1)} s).`);
            return;
        }
        setBusy(true);
        setRunError(null);
        try {
            const blob = await renderProcessedWav(buffer, {fadeIn: fi, fadeOut: fo});
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-fade.wav`, `Linear fades: ${fi.toFixed(1)} s in / ${fo.toFixed(1)} s out — 16-bit PCM WAV.`);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <NumField label="Fade in" value={fadeIn} onChange={setFadeIn} unit="s" min={0} max={60}/>
                <NumField label="Fade out" value={fadeOut} onChange={setFadeOut} unit="s" min={0} max={60}/>
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Apply fades → WAV
                </RunButton>
            </div>
            <Note>Linear envelope: 0 → 1 over the fade-in, 1 → 0 over the fade-out (the same math lib/audio-ops.ts uses
                in its unit tests).</Note>
            {runError && <Err>{runError}</Err>}
            {dialog}
        </div>
    );
}

/** aud-gain — volume boost / cut → WAV. */
export function AudioGainTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [db, setDb] = React.useState("-6");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (!file || !buffer) return;
        const d = Number(db);
        if (!Number.isFinite(d) || d < -60 || d > 24) {
            setRunError("Gain is dB between −60 and +24.");
            return;
        }
        setBusy(true);
        setRunError(null);
        try {
            const blob = await renderProcessedWav(buffer, {gain: linearFromDb(d)});
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-gain${d >= 0 ? "+" : ""}${Math.round(d)}db.wav`, `Volume ${d >= 0 ? "+" : ""}${d} dB — 16-bit PCM WAV (clipped safely at full scale).`);
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <NumField label="Gain" value={db} onChange={setDb} unit="dB" min={-60} max={24}/>
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Apply gain → WAV
                </RunButton>
            </div>
            <Note>Positive values boost; the render clamps overshoot to ±full scale instead of wrapping.</Note>
            {runError && <Err>{runError}</Err>}
            {dialog}
        </div>
    );
}

/** aud-normalize — peak-normalize to a target ceiling → WAV. */
export function AudioNormalizeTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [target, setTarget] = React.useState("-1");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (!file || !buffer) return;
        const t = Number(target);
        if (!Number.isFinite(t) || t <= -60 || t > 0) {
            setRunError("Target is dBFS below 0 (−0.1 … −24 is the sensible range).");
            return;
        }
        setBusy(true);
        setRunError(null);
        try {
            let peak = 0;
            for (let c = 0; c < buffer.numberOfChannels; c++) {
                const d = buffer.getChannelData(c);
                for (let i = 0; i < d.length; i++) {
                    const a = Math.abs(d[i]);
                    if (a > peak) peak = a;
                }
            }
            if (peak <= 0) {
                setRunError("This file is pure silence — nothing to normalize.");
                return;
            }
            const gain = linearFromDb(t) / peak;
            const blob = await renderProcessedWav(buffer, {gain});
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(
                blob,
                `${base}-normalized.wav`,
                `Peak ${dbFromLinear(peak).toFixed(1)} dBFS → ${t} dBFS (×${gain.toFixed(2)}) — 16-bit PCM WAV.`
            );
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <NumField label="Target peak" value={target} onChange={setTarget} unit="dBFS" min={-24} max={-0.1}/>
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Normalize → WAV
                </RunButton>
            </div>
            <Note>Amplifies (or attenuates) so the loudest sample sits at the target. −1 dBFS leaves a touch of
                headroom.</Note>
            {runError && <Err>{runError}</Err>}
            {dialog}
        </div>
    );
}

/** aud-speed — rate change → WAV. */
export function AudioSpeedTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [rate, setRate] = React.useState("1.5");
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (!file || !buffer) return;
        const r = Number(rate);
        if (!Number.isFinite(r) || r < 0.25 || r > 4) {
            setRunError("Rate is 0.25–4 (1 = unchanged).");
            return;
        }
        setBusy(true);
        setRunError(null);
        try {
            const blob = await renderProcessedWav(buffer, {rate: r});
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(
                blob,
                `${base}-speed${r}x.wav`,
                `${r}× rate — length ${fmtT(buffer.duration)} → ${fmtT(buffer.duration / r)} — 16-bit PCM WAV.`
            );
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Rate</span>
                    <Select value={rate} onValueChange={setRate}>
                        <SelectTrigger className="h-8 w-40 text-xs" aria-label="Rate">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            {["0.25", "0.5", "0.75", "1.5", "2", "3", "4"].map((r) => (
                                <SelectItem key={r} value={r}>
                                    {r}× {Number(r) < 1 ? "slower" : "faster"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Render → WAV
                </RunButton>
            </div>
            <Note>Pitch follows the rate (tape-style) — a 2× render is half as long and an octave up.</Note>
            {runError && <Err>{runError}</Err>}
            {dialog}
        </div>
    );
}

/** aud-convert — any decoded format → 16-bit PCM WAV. */
export function AudioConvertTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [busy, setBusy] = React.useState(false);

    const run = async () => {
        if (!file || !buffer) return;
        setBusy(true);
        try {
            const blob = await renderProcessedWav(buffer, {});
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(
                blob,
                `${base}-converted.wav`,
                `${file.name} → 16-bit PCM WAV · ${buffer.numberOfChannels} ch · ${buffer.sampleRate} Hz · ${fmtT(buffer.duration)}.`
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Convert → WAV
                </RunButton>
            </div>
            <Note>MP3 / OGG / WebM / FLAC → the universally decodable WAV, rendered offline in one pass (no real-time
                recording).</Note>
            {dialog}
        </div>
    );
}

/** aud-waveform — the decoded waveform → PNG poster. */
export function AudioWaveformTool() {
    const {file, setFile, player, buffer, error, decoding} = useDecodedAudio();
    const {deliver, dialog} = useBlobDelivery();
    const [busy, setBusy] = React.useState(false);
    const [runError, setRunError] = React.useState<string | null>(null);

    const run = async () => {
        if (!file || !buffer) return;
        setBusy(true);
        setRunError(null);
        try {
            const channels: Float32Array[] = [];
            for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
            const W = 1600;
            const H = 480;
            const mid = H / 2;
            const canvas = document.createElement("canvas");
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
            ctx.fillStyle = "#0b1220";
            ctx.fillRect(0, 0, W, H);
            // Grid: seconds every 10% + faint dB guides.
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 1;
            for (let i = 1; i < 10; i++) {
                const x = (i / 10) * W;
                ctx.beginPath();
                ctx.moveTo(x, 24);
                ctx.lineTo(x, H - 24);
                ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.font = "12px ui-monospace, monospace";
                ctx.fillText(fmtT((i / 10) * buffer.duration), x + 4, H - 10);
            }
            for (const f of [0.5, -0.5]) {
                ctx.beginPath();
                ctx.moveTo(0, mid - f * (mid - 24));
                ctx.lineTo(W, mid - f * (mid - 24));
                ctx.strokeStyle = "rgba(255,255,255,0.05)";
                ctx.stroke();
            }
            // Min/max columns.
            const {min, max} = waveformPeaks(channels, 1200);
            const colW = W / min.length;
            const scale = mid - 24;
            for (let i = 0; i < min.length; i++) {
                const x = i * colW;
                const y0 = mid - max[i] * scale;
                const y1 = mid - min[i] * scale;
                ctx.fillStyle = "#34d399";
                ctx.fillRect(x, y0, Math.max(1, colW - 0.5), Math.max(1, y1 - y0));
            }
            ctx.beginPath();
            ctx.moveTo(0, mid);
            ctx.lineTo(W, mid);
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.stroke();
            // Title.
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.font = "600 16px ui-sans-serif, system-ui";
            ctx.fillText(file.name, 16, 28);
            ctx.font = "12px ui-monospace, monospace";
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.fillText(
                `${buffer.numberOfChannels} ch · ${buffer.sampleRate} Hz · ${fmtT(buffer.duration)}`,
                16,
                46
            );
            const blob = await canvasToBlob(canvas, "image/png");
            const base = file.name.replace(/\.[^.]+$/, "");
            deliver(blob, `${base}-waveform.png`, "Waveform poster — min/max columns with second grid, 1600×480 PNG.");
        } catch (err) {
            setRunError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <RunButton busy={busy} disabled={!buffer || decoding} onClick={() => void run()}>
                    Render waveform → PNG
                </RunButton>
            </div>
            <Note>1200 min/max columns over the full duration — the same reduction the inline player draws, at poster
                scale.</Note>
            {runError && <Err>{runError}</Err>}
            {dialog}
        </div>
    );
}

/** aud-dataurl — the file as a data: URL (embeds up to 8 MB). */
export function AudioDataUrlTool() {
    const {file, setFile, player, error} = useDecodedAudio();
    const [dataUrl, setDataUrl] = React.useState<string | null>(null);
    const [runError, setRunError] = React.useState<string | null>(null);
    const CAP = 8 * 1024 * 1024;

    const run = async () => {
        if (!file) return;
        if (file.size > CAP) {
            setRunError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the cap is 8 MB so the editor stays responsive.`);
            setDataUrl(null);
            return;
        }
        try {
            const text = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = () => reject(new Error("Reading the file failed."));
                r.readAsDataURL(file);
            });
            setDataUrl(text);
            setRunError(null);
        } catch (err) {
            setRunError((err as Error).message);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <AudioDrop file={file} onPick={setFile}/>
            {error && <Err>{error}</Err>}
            {player}
            <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" className="h-8 text-xs" disabled={!file} onClick={() => void run()}>
                    Read as data URL
                </Button>
            </div>
            {runError && <Err>{runError}</Err>}
            {dataUrl && (
                <div className="space-y-2">
          <pre
              className="max-h-40 w-full overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] break-all whitespace-pre-wrap">
            {dataUrl.slice(0, 4000)}
              {dataUrl.length > 4000 ? `\n… ${(dataUrl.length / 1024).toFixed(0)} KB total` : ""}
          </pre>
                    <TextResultButton text={dataUrl}
                                      name={`${(file?.name ?? "audio").replace(/\.[^.]+$/, "")}-dataurl.txt`}
                                      label="Deliver full data URL"/>
                </div>
            )}
            <Note>data: URLs embed audio straight into HTML/Markdown — 8 MB cap so the text editor does not
                choke.</Note>
        </div>
    );
}

/* ─── registration ───────────────────────────────────────────────── */

export function audioStudioTool(id: string): React.ComponentType {
    const C = function AudioStudioEntry() {
        switch (id) {
            case "aud-meta":
                return <AudioMetadataTool/>;
            case "aud-trim":
                return <AudioTrimTool/>;
            case "aud-fade":
                return <AudioFadeTool/>;
            case "aud-gain":
                return <AudioGainTool/>;
            case "aud-normalize":
                return <AudioNormalizeTool/>;
            case "aud-speed":
                return <AudioSpeedTool/>;
            case "aud-convert":
                return <AudioConvertTool/>;
            case "aud-waveform":
                return <AudioWaveformTool/>;
            case "aud-dataurl":
                return <AudioDataUrlTool/>;
            default:
                return <Note>Unknown tool.</Note>;
        }
    };
    C.displayName = `AudioStudio(${id})`;
    return C;
}
