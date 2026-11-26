"use client";

import * as React from "react";
import {
    AudioWaveform,
    Gauge,
    Loader2,
    Pause,
    Play,
    Repeat,
    Scissors,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {audioLevelsAll, dbFromLinear, waveformPeaks} from "@/lib/audio-ops";
// media playback defaults (Settings → Media → Playback
// defaults) — applied once per file open.
import {readMediaPlaybackDefaults} from "@/lib/settings";

/**
 * the DEDICATED audio player, split from media-tools.tsx
 * (which is video-only).
 *
 * The design is audio-first: the waveform is the centerpiece, not a
 * strip under a video —
 *
 * ▸ big min/max waveform (decoded once via Web Audio) — click
 * seeks, Alt+click sets loop A, Shift+click sets loop B,
 * double-click clears the loop; played region colored live
 * ▸ transport row: play/pause, ±5 s / ±10 s skips, precise
 * m:ss.d readout (tenths — a 30 fps convention, but for audio it
 * simply reads cleanly)
 * ▸ speed presets + fine 0.1×–4× slider, volume, repeat, A–B loop
 * ▸ trim/export dialog (server ffmpeg — says so when missing),
 * download, keyboard control (Space / ←→ / ↑↓ / M / L)
 * ▸ footer: channels + sample rate from the DECODED buffer (the
 * old footer could only count waveform buckets), plus peak dBFS
 *
 * The waveform's toolbox counterpart (Audio studio: trim / fade /
 * gain / normalize / speed / WAV convert / waveform PNG) lives in
 * components/toolbox/audio-studio.tsx.
 */

interface AudioToolsProps {
    src: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    onLoaded?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** A tiny kbd chip for the keyboard-hints line. */
function Kbd({children}: { children: React.ReactNode }) {
    return (
        <kbd className="rounded border bg-muted px-1 py-0 font-mono text-[9px] leading-4 text-muted-foreground">
            {children}
        </kbd>
    );
}

/** One analyser chain per <audio> element (createMediaElementSource
 *  may only be called ONCE per element — cached in a ref here). */
interface MeterChain {
    ctx: AudioContext;
    analyser: AnalyserNode;
    data: Float32Array<ArrayBuffer>;
}

export function AudioTools({src, fileName, folderSlug, fileSlug, onLoaded}: AudioToolsProps) {
    const {toast} = useToast();
    const audioRef = React.useRef<HTMLAudioElement | null>(null);
    const meterRef = React.useRef<MeterChain | null>(null);

    const [peaks, setPeaks] = React.useState<{ min: number[]; max: number[] } | null>(null);
    const [info, setInfo] = React.useState<{
        channels: number;
        sampleRate: number;
        peakDb: number;
        rmsDb: number
    } | null>(null);
    const [playing, setPlaying] = React.useState(false);
    const [speed, setSpeed] = React.useState(1);
    const [loop, setLoop] = React.useState<{ a: number | null; b: number | null }>({a: null, b: null});
    const [repeatAll, setRepeatAll] = React.useState(false);
    const [muted, setMuted] = React.useState(false);
    const [volume, setVolume] = React.useState(1);
    const [duration, setDuration] = React.useState(0);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [level, setLevel] = React.useState(0);
    const [trimOpen, setTrimOpen] = React.useState(false);
    const [trimA, setTrimA] = React.useState(0);
    const [trimB, setTrimB] = React.useState(0);
    const [trimming, setTrimming] = React.useState(false);

    /* Decode once per src → waveform min/max + channels/sample rate +
       honest peak/RMS levels. A fresh AudioContext is closed after. */
    React.useEffect(() => {
        let cancelled = false;
        setPeaks(null);
        setInfo(null);
        void (async () => {
            try {
                const AC = window.AudioContext ?? (window as unknown as {
                    webkitAudioContext: typeof AudioContext
                }).webkitAudioContext;
                const ctx = new AC();
                const res = await fetch(src);
                const buf = await res.arrayBuffer();
                const audio = await ctx.decodeAudioData(buf);
                if (cancelled) return;
                const channels: Float32Array[] = [];
                for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
                const {peak, rms} = audioLevelsAll(channels);
                setPeaks(waveformPeaks(channels, 600));
                setDuration(audio.duration);
                setInfo({
                    channels: audio.numberOfChannels,
                    sampleRate: audio.sampleRate,
                    peakDb: dbFromLinear(peak),
                    rmsDb: dbFromLinear(rms),
                });
                void ctx.close();
            } catch {
                if (!cancelled) setPeaks({min: [], max: []});
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [src]);

    /* playback defaults (Settings → Media) — applied once per
        file open; manual changes during playback always win afterwards. */
    React.useEffect(() => {
        const d = readMediaPlaybackDefaults();
        setSpeed(d.playbackRate);
        setVolume(d.volume / 100);
        setMuted(false);
        setRepeatAll(d.loop);
        setLoop({a: null, b: null});
        const el = audioRef.current;
        if (el) {
            el.playbackRate = d.playbackRate;
            el.volume = d.volume / 100;
            el.muted = false;
            el.loop = d.loop;
            if (d.autoplay) void el.play().catch(() => undefined);
        }
    }, [src]);

    /* Keep the element's native `loop` attribute in sync with the
       Repeat toggle. */
    React.useEffect(() => {
        if (audioRef.current) audioRef.current.loop = repeatAll;
    }, [repeatAll]);

    /* A–B loop enforcement + repeat-all + time tracking. */
    React.useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const onTime = () => {
            setCurrentTime(el.currentTime);
            if (loop.a !== null && loop.b !== null && el.currentTime >= loop.b) {
                el.currentTime = loop.a;
            }
        };
        const onEnded = () => {
            setPlaying(false);
            if (repeatAll) {
                el.currentTime = 0;
                void el.play();
            }
        };
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        el.addEventListener("timeupdate", onTime);
        el.addEventListener("ended", onEnded);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        return () => {
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("ended", onEnded);
            el.removeEventListener("play", onPlay);
            el.removeEventListener("pause", onPause);
        };
    }, [loop, repeatAll]);

    /* The live level meter + smooth playhead: an rAF loop while playing.
  The analyser chain is created lazily INSIDE a user gesture (the
  first play) — a suspended-by-policy AudioContext created outside
  a gesture would swallow the audio. Any failure just disables the
  meter silently (the transport never depends on it). */
    React.useEffect(() => {
        if (!playing) {
            setLevel(0);
            return;
        }
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const el = audioRef.current;
            if (el) setCurrentTime(el.currentTime);
            const meter = meterRef.current;
            if (meter) {
                meter.analyser.getFloatTimeDomainData(meter.data);
                let peak = 0;
                for (let i = 0; i < meter.data.length; i++) {
                    const a = Math.abs(meter.data[i]);
                    if (a > peak) peak = a;
                }
                setLevel(peak);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing]);

    const ensureMeter = () => {
        const el = audioRef.current;
        if (!el || meterRef.current) return;
        try {
            const AC = window.AudioContext ?? (window as unknown as {
                webkitAudioContext: typeof AudioContext
            }).webkitAudioContext;
            const ctx = new AC();
            void ctx.resume().catch(() => undefined);
            const source = ctx.createMediaElementSource(el);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            meterRef.current = {ctx, analyser, data: new Float32Array(analyser.fftSize)};
        } catch {
            meterRef.current = null;
        }
    };

    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        ensureMeter();
        if (el.paused) void el.play().catch(() => undefined);
        else el.pause();
    };

    const seekTo = (fraction: number) => {
        const el = audioRef.current;
        if (!el) return;
        const total = el.duration || duration;
        if (total > 0) el.currentTime = Math.max(0, Math.min(1, fraction)) * total;
    };

    const skip = (sec: number) => {
        const el = audioRef.current;
        if (!el) return;
        el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + sec));
    };

    const setPlaybackRate = (rate: number) => {
        setSpeed(rate);
        if (audioRef.current) audioRef.current.playbackRate = rate;
    };

    const toggleMute = () => {
        const el = audioRef.current;
        const next = !muted;
        setMuted(next);
        if (el) el.muted = next;
    };

    const applyVolume = (v: number) => {
        setVolume(v);
        setMuted(v === 0);
        if (audioRef.current) {
            audioRef.current.volume = v;
            audioRef.current.muted = v === 0;
        }
    };

    const openTrim = () => {
        const el = audioRef.current;
        const total = el?.duration || duration || 0;
        if (el && el.currentTime > 0 && total > 10) {
            setTrimA(Math.max(0, el.currentTime - 5));
            setTrimB(Math.min(total, el.currentTime + 5));
        } else {
            setTrimA(0);
            setTrimB(total);
        }
        setTrimOpen(true);
    };

    const exportTrim = async () => {
        setTrimming(true);
        try {
            const res = await fetch("/api/media-trim", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, file: fileSlug, startSec: trimA, endSec: trimB}),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                toast({
                    title: "Trim not available",
                    description: json.error ?? json.hint ?? `HTTP ${res.status}`,
                    variant: "destructive",
                });
            } else {
                toast({
                    title: `Exported ${json.file}`,
                    description: `${json.seconds.toFixed(1)} s · ${(json.bytes / 1024).toFixed(0)} KB — next to the source.`,
                    variant: "success"
                });
            }
        } catch (err) {
            toast({title: "Trim failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setTrimming(false);
            setTrimOpen(false);
        }
    };

    const fmtTime = (s: number) => {
        if (!Number.isFinite(s)) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, "0")}`;
    };
    const fmtTimePrecise = (s: number) => {
        if (!Number.isFinite(s)) return "0:00.0";
        const m = Math.floor(s / 60);
        const sec = Math.max(0, s % 60);
        return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
    };

    const loopArmed = loop.a !== null && loop.b !== null;
    const W = 600; // svg viewBox width (one unit per bucket)

    return (
        <div
            className="flex flex-col h-full min-h-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60 rounded-sm"
            tabIndex={0}
            role="region"
            aria-label="Audio player — Space play/pause, ←/→ seek ±5 s, ⇧←/→ ±10 s, ↑/↓ volume, M mute, L loop"
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                const el = audioRef.current;
                if (!el) return;
                if (e.key === " ") {
                    e.preventDefault();
                    togglePlay();
                } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    skip(e.shiftKey ? -10 : -5);
                } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    skip(e.shiftKey ? 10 : 5);
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    applyVolume(Math.min(1, Math.round((volume + 0.05) * 100) / 100));
                } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    applyVolume(Math.max(0, Math.round((volume - 0.05) * 100) / 100));
                } else if (e.key === "m" || e.key === "M") {
                    e.preventDefault();
                    toggleMute();
                } else if (e.key === "l" || e.key === "L") {
                    e.preventDefault();
                    setRepeatAll((r) => !r);
                }
            }}
        >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b bg-muted/20">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Gauge className="size-3"/> speed
        </span>
                {SPEEDS.map((r) => (
                    <Button
                        key={r}
                        size="sm"
                        variant={speed === r ? "default" : "ghost"}
                        className="h-6 px-1.5 text-[10px]"
                        onClick={() => setPlaybackRate(r)}
                    >
                        {r}×
                    </Button>
                ))}
                <input
                    type="range"
                    min={0.1}
                    max={4}
                    step={0.1}
                    value={speed}
                    onChange={(e) => setPlaybackRate(Number(e.target.value))}
                    className="w-20 h-1 accent-emerald-500"
                    aria-label="Fine playback rate"
                    title={`Fine playback rate — currently ${speed.toFixed(1)}× (0.1–4×)`}
                />
                <span className="text-[10px] font-mono tabular-nums w-9 text-center" title="Current playback rate">
          {speed.toFixed(1)}×
        </span>
                <div className="w-px h-5 bg-border mx-1"/>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => skip(-10)}
                        title="Back 10 s (Shift+←)">
                    <SkipBack className="size-3"/> 10s
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => skip(-5)}
                        title="Back 5 s (←)">
                    <SkipBack className="size-3"/> 5s
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => skip(5)}
                        title="Forward 5 s (→)">
                    5s <SkipForward className="size-3"/>
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => skip(10)}
                        title="Forward 10 s (Shift+→)">
                    10s <SkipForward className="size-3"/>
                </Button>
                <div className="w-px h-5 bg-border mx-1"/>
                {/* Repeat / A–B loop. */}
                <Button
                    variant={repeatAll ? "default" : "ghost"}
                    size="sm"
                    className="h-6 gap-1 text-[10px]"
                    onClick={() => setRepeatAll((r) => !r)}
                    title="Loop the whole file when it ends (L) — independent of the A–B loop"
                >
                    <Repeat className="size-3"/> Loop
                </Button>
                <Button
                    variant={loopArmed ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => {
                        const el = audioRef.current;
                        if (el) setLoop({a: el.currentTime, b: null});
                    }}
                    title="Set loop A at the playhead (on the waveform: Alt+click = A, Shift+click = B, double-click = clear)"
                >
                    Set A
                </Button>
                <Button
                    variant={loopArmed ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => {
                        const el = audioRef.current;
                        if (el && loop.a !== null) setLoop((l) => ({...l, b: el.currentTime}));
                    }}
                    disabled={loop.a === null}
                    title="Set loop B at the playhead (needs A first)"
                >
                    Set B
                </Button>
                {(loop.a !== null || loop.b !== null) && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]"
                            onClick={() => setLoop({a: null, b: null})} title="Clear the A–B loop">
                        Clear loop
                    </Button>
                )}
                {/* Volume */}
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={toggleMute}
                            title={muted ? "Unmute" : "Mute"}>
                        {muted ? <VolumeX className="size-3"/> : <Volume2 className="size-3"/>}
                    </Button>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => applyVolume(Number(e.target.value))}
                        className="w-16 h-1 accent-emerald-500"
                        aria-label="Volume"
                        title="Volume"
                    />
                </div>
                <div className="w-px h-5 bg-border mx-1"/>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[10px]"
                    onClick={openTrim}
                    title="Export a time window as a new file (ffmpeg)"
                >
                    <Scissors className="size-3"/> Trim / Export…
                </Button>
                {/* The navbar Download twin was REMOVED — the FileViewer
header directly above already carries the pane's single
Download button. */}
                <span
                    className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap"
                    title="Click the player area first so it has keyboard focus, then:"
                >
          <Kbd>Space</Kbd> play/pause
          <Kbd>←</Kbd><Kbd>→</Kbd> ±5s
          <Kbd>↑</Kbd><Kbd>↓</Kbd> volume
          <Kbd>M</Kbd> mute
          <Kbd>L</Kbd> loop
        </span>
            </div>

            {/* Body — the waveform is the centerpiece. */}
            <div className="flex-1 min-h-0 overflow-auto grid place-items-center p-4" data-testid="audio-tools-body">
                <div className="w-full max-w-3xl space-y-3">
                    {peaks === null ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-8">
                            <Loader2 className="size-3.5 animate-spin"/> Decoding waveform…
                        </div>
                    ) : peaks.min.length > 0 ? (
                        <div
                            className="cursor-crosshair"
                            onClick={(e) => {
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                // (audio-first gestures — the video-era
                                // waveform used click-for-A): CLICK SEEKS (the natural
                                // audio gesture), Alt+click sets loop A, Shift+click
                                // sets loop B, double-click clears the loop.
                                if (e.altKey && !e.shiftKey) setLoop((l) => ({...l, a: fraction * duration}));
                                else if (e.shiftKey && !e.altKey) setLoop((l) => ({...l, b: fraction * duration}));
                                else seekTo(fraction);
                            }}
                            onDoubleClick={() => setLoop({a: null, b: null})}
                            title="click = seek · Alt+click = loop A · Shift+click = loop B · double-click = clear loop"
                        >
                            <svg viewBox={`0 0 ${W} 96`} className="w-full h-24" role="img" aria-label="Waveform">
                                {peaks.min.map((lo, i) => {
                                    const hi = peaks.max[i];
                                    const x = (i / peaks.min.length) * W;
                                    const y0 = 48 - hi * 44;
                                    const y1 = 48 - lo * 44;
                                    const played = i / peaks.min.length <= currentTime / (duration || 1);
                                    const inLoop =
                                        loop.a !== null && loop.b !== null &&
                                        (i / peaks.min.length) * duration >= loop.a && (i / peaks.min.length) * duration <= loop.b;
                                    return (
                                        <rect
                                            key={i}
                                            x={x}
                                            y={y0}
                                            width={W / peaks.min.length - 0.15}
                                            height={Math.max(1, y1 - y0)}
                                            fill={inLoop ? "#f59e0b" : played ? "#10b981" : "currentColor"}
                                            opacity={inLoop || played ? 0.95 : 0.35}
                                        />
                                    );
                                })}
                                {/* Playhead */}
                                {duration > 0 && (
                                    <line
                                        x1={(currentTime / duration) * W}
                                        x2={(currentTime / duration) * W}
                                        y1="0"
                                        y2="96"
                                        stroke="#10b981"
                                        strokeWidth="1.5"
                                    />
                                )}
                                {loop.a !== null && (
                                    <line x1={(loop.a / duration) * W} x2={(loop.a / duration) * W} y1="0" y2="96"
                                          stroke="#10b981" strokeWidth="1.5"/>
                                )}
                                {loop.b !== null && (
                                    <line x1={(loop.b / duration) * W} x2={(loop.b / duration) * W} y1="0" y2="96"
                                          stroke="#ef4444" strokeWidth="1.5"/>
                                )}
                            </svg>
                        </div>
                    ) : (
                        <p className="text-[10px] text-muted-foreground text-center">
                            Waveform unavailable for this format — the transport below still works.
                        </p>
                    )}

                    {/* Transport row (the audio element itself stays sr-only). */}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            size="sm"
                            className="h-9 w-9 p-0 rounded-full"
                            onClick={togglePlay}
                            title={playing ? "Pause (Space)" : "Play (Space)"}
                            aria-label={playing ? "Pause" : "Play"}
                        >
                            {playing ? <Pause className="size-4"/> : <Play className="size-4"/>}
                        </Button>
                        <span className="font-mono tabular-nums text-xs text-muted-foreground"
                              title="Current time / duration">
              {fmtTimePrecise(currentTime)} / {fmtTimePrecise(duration)}
            </span>
                        {/* Live level meter (analyser-driven; silent when the
                browser refuses the WebAudio graph). */}
                        <div className="flex items-center gap-1.5 min-w-[110px]" title="Live output level (dBFS-ish)">
                            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={cn("h-full rounded-full transition-[width] duration-75", level > 0.99 ? "bg-red-500" : level > 0.89 ? "bg-amber-500" : "bg-emerald-500")}
                                    style={{width: `${Math.min(100, Math.round(level * 100))}%`}}
                                />
                            </div>
                            <span className="text-[9px] font-mono tabular-nums text-muted-foreground w-9">
                {level > 0 ? `${(20 * Math.log10(Math.max(1e-4, level))).toFixed(0)}dB` : "—"}
              </span>
                        </div>
                        {!loopArmed && peaks && peaks.min.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                click the waveform to seek · Alt+click for loop A · Shift+click for B
              </span>
                        )}
                    </div>
                    <audio
                        ref={audioRef}
                        src={src}
                        onLoadedMetadata={(e) => {
                            const d = (e.target as HTMLAudioElement).duration;
                            if (Number.isFinite(d) && d > 0) setDuration(d);
                        }}
                        onCanPlay={onLoaded}
                        className="sr-only"
                        aria-label={`${fileName} playback element`}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-3 py-1 border-t text-[10px] text-muted-foreground">
                <span className="truncate">{fileName}</span>
                <span className="font-mono">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
                {loopArmed && (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Repeat className="size-2.5"/> loop {fmtTime(loop.a!)}–{fmtTime(loop.b!)}
          </span>
                )}
                {repeatAll && !loopArmed && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Repeat className="size-2.5"/> loop
          </span>
                )}
                {info && (
                    <span className="ml-auto flex items-center gap-2 whitespace-nowrap"
                          title="From the decoded buffer — not guessed from the container">
            <span className="flex items-center gap-1">
              <AudioWaveform
                  className="size-2.5"/> {info.channels === 1 ? "mono" : `${info.channels} ch`} · {info.sampleRate} Hz
            </span>
            <span className="font-mono">peak {info.peakDb.toFixed(1)} dBFS</span>
          </span>
                )}
            </div>

            {/* Trim dialog (same shape as the video player's). */}
            {trimOpen && (
                <div
                    className="absolute inset-0 z-20 grid place-items-center bg-background/70 backdrop-blur-sm"
                    role="dialog"
                    aria-label="Trim and export"
                    onClick={() => !trimming && setTrimOpen(false)}
                >
                    <div
                        className="rounded-lg border bg-card p-4 w-[min(30rem,calc(100%-2rem))] shadow-lg space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-sm font-medium flex items-center gap-1.5">
                            <Scissors className="size-4 text-emerald-500"/> Trim / Export A Window
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            Cut {fmtTime(trimA)} – {fmtTime(trimB)} ({(trimB - trimA).toFixed(1)} s) into a new file
                            next to the source.
                            Requires ffmpeg on this machine.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <label className="space-y-1">
                                <span className="text-muted-foreground">Start (s)</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, trimB - 0.1)}
                                    step={0.1}
                                    value={trimA}
                                    onChange={(e) => setTrimA(Math.max(0, Number(e.target.value)))}
                                    className="w-full h-8 rounded-md border bg-background px-2 font-mono"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-muted-foreground">End (s)</span>
                                <input
                                    type="number"
                                    min={trimA + 0.1}
                                    max={duration || trimA + 60}
                                    step={0.1}
                                    value={trimB}
                                    onChange={(e) => setTrimB(Number(e.target.value))}
                                    className="w-full h-8 rounded-md border bg-background px-2 font-mono"
                                />
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={trimming}
                                    onClick={() => void exportTrim()}>
                                {trimming ? <Loader2 className="size-3.5 animate-spin"/> : <Play className="size-3.5"/>}
                                Export
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => {
                                    const el = audioRef.current;
                                    if (el) {
                                        setTrimA(Math.max(0, el.currentTime - 5));
                                        setTrimB(el.currentTime + 5);
                                    }
                                }}
                                title="Take a 10 s window around the playhead"
                            >
                                ±5 s around playhead
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => {
                                    setTrimA(0);
                                    setTrimB(duration);
                                }}
                                title="Use the whole file as the window"
                            >
                                Whole file
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs ml-auto"
                                    onClick={() => setTrimOpen(false)}>
                                <Pause className="size-3.5"/> Cancel
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70">Click outside this card to dismiss.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
