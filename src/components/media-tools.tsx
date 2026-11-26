"use client";

import * as React from "react";
import {
    Camera,
    ChevronDown,
    FlipHorizontal,
    FlipVertical,
    Gauge,
    Loader2,
    Maximize,
    Pause,
    PictureInPicture2,
    Play,
    Repeat,
    RotateCcw,
    RotateCw,
    Scissors,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    ZoomIn,
    ZoomOut,
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
// media playback defaults (Settings → Media → Playback
// defaults) — applied once per file open.
import {readMediaPlaybackDefaults} from "@/lib/settings";

/**
 * media tooling. redesign + fixes.
 * playback defaults + fine rate slider + keyboard control.
 * AUDIO SPLIT — the audio player now lives in its own
 * components/audio-tools.tsx (waveform-centric transport, level
 * meter, dedicated Audio-studio toolbox suite); this file is
 * VIDEO-ONLY from here on.
 *
 * VIDEO — playback speed (presets + a fine 0.1×–4× slider), frame
 * stepping (± 1/30 s), grab-frame-to-PNG, loop/repeat toggle, volume
 * + mute, skip ±5 s / ±10 s, fullscreen and picture-in-picture,
 * view transforms (zoom / rotate / flip), and the trim/export dialog
 * (server /api/media-trim; needs ffmpeg — the UI says so honestly
 * when it's absent). The dialog is wider, wraps its buttons and
 * dismisses on outside click.
 * Settings ▸ Media ▸ “Playback defaults” are applied once
 * per file open (rate / autoplay / volume / loop); a fine playback
 * rate slider, a tabular-nums time readout, and keyboard control
 * (Space / arrows / M / L — see the kbd-chip hints) were added.
 */

interface MediaToolsProps {
    src: string;
    fileName: string;
    folderSlug: string;
    fileSlug: string;
    onLoaded?: () => void;
    /** The main <video> failed to load (missing file / unsupported
     *  codec) — the FileViewer swaps its skeleton overlay for an error
     *  card instead of an eternal loading state. */
    onError?: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** A tiny kbd chip for the keyboard-hints line. */
function Kbd({children}: { children: React.ReactNode }) {
    return (
        <kbd className="rounded border bg-muted px-1 py-0 font-mono text-[9px] leading-4 text-muted-foreground">
            {children}
        </kbd>
    );
}

export function MediaTools({src, fileName, folderSlug, fileSlug, onLoaded, onError}: MediaToolsProps) {
    const {toast} = useToast();
    const mediaRef = React.useRef<HTMLVideoElement | null>(null);
    const [speed, setSpeed] = React.useState(1);
    const [loop, setLoop] = React.useState<{ a: number | null; b: number | null }>({a: null, b: null});
    const [repeatAll, setRepeatAll] = React.useState(false);
    const [muted, setMuted] = React.useState(false);
    const [volume, setVolume] = React.useState(1);
    const [duration, setDuration] = React.useState(0);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [trimOpen, setTrimOpen] = React.useState(false);
    const [trimA, setTrimA] = React.useState(0);
    const [trimB, setTrimB] = React.useState(0);
    const [trimming, setTrimming] = React.useState(false);
    /* video VIEW transforms — zoom / rotate / flip (like the
        image toolbox): CSS on the <video> wrapper; playback itself is
        untouched (the export path lives in the toolbox's Video studio). */
    const [vidZoom, setVidZoom] = React.useState(1);
    const [vidRotation, setVidRotation] = React.useState(0);
    const [vidFlipH, setVidFlipH] = React.useState(false);
    const [vidFlipV, setVidFlipV] = React.useState(false);

    // media playback DEFAULTS (Settings → Media → Playback
    // defaults) — read ONCE per file open and applied to the element +
    // the toolbar state before the user touches anything. Manual
    // changes made during playback always win afterwards: nothing here
    // ever re-applies the defaults while the file is playing.
    React.useEffect(() => {
        const d = readMediaPlaybackDefaults();
        setSpeed(d.playbackRate);
        setVolume(d.volume / 100);
        setMuted(false);
        setRepeatAll(d.loop);
        const el = mediaRef.current;
        if (el) {
            el.playbackRate = d.playbackRate;
            el.volume = d.volume / 100;
            el.muted = false;
            el.loop = d.loop;
            if (d.autoplay) {
                // Autoplay can be refused (no user gesture yet) — that's fine,
                // the user just presses play; the promise rejection is ignored.
                void el.play().catch(() => undefined);
            }
        }
    }, [src]);

    // keep the element's native `loop` attribute in sync with
    // the Repeat toggle (smoother than re-seeking in the ended handler,
    // which stays as a belt-and-braces fallback).
    React.useEffect(() => {
        if (mediaRef.current) mediaRef.current.loop = repeatAll;
    }, [repeatAll]);

    // A–B loop enforcement + time tracking + repeat-all.
    React.useEffect(() => {
        const el = mediaRef.current;
        if (!el) return;
        const onTime = () => {
            setCurrentTime(el.currentTime);
            if (loop.a !== null && loop.b !== null && el.currentTime >= loop.b) {
                el.currentTime = loop.a;
            }
        };
        const onEnded = () => {
            if (repeatAll) {
                el.currentTime = 0;
                void el.play();
            }
        };
        el.addEventListener("timeupdate", onTime);
        el.addEventListener("ended", onEnded);
        return () => {
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("ended", onEnded);
        };
    }, [loop, repeatAll]);

    const setPlaybackRate = (rate: number) => {
        setSpeed(rate);
        if (mediaRef.current) mediaRef.current.playbackRate = rate;
    };

    const seekTo = (fraction: number) => {
        const el = mediaRef.current;
        if (!el) return;
        const total = el.duration || duration;
        if (total > 0) el.currentTime = fraction * total;
    };

    const skip = (sec: number) => {
        const el = mediaRef.current;
        if (!el) return;
        el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + sec));
    };

    const stepFrame = (dir: 1 | -1) => {
        const el = mediaRef.current;
        if (el) el.currentTime = Math.max(0, el.currentTime + dir / 30);
    };

    const toggleMute = () => {
        const el = mediaRef.current;
        const next = !muted;
        setMuted(next);
        if (el) el.muted = next;
    };

    const applyVolume = (v: number) => {
        setVolume(v);
        setMuted(v === 0);
        if (mediaRef.current) {
            mediaRef.current.volume = v;
            mediaRef.current.muted = v === 0;
        }
    };

    const toggleFullscreen = () => {
        const el = mediaRef.current as HTMLVideoElement | null;
        if (!el) return;
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else {
            void el.requestFullscreen?.();
        }
    };

    const togglePip = async () => {
        const el = mediaRef.current;
        if (!el) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await el.requestPictureInPicture();
            }
        } catch {
            toast({
                title: "Picture-in-picture unavailable",
                description: "This browser refused the PiP request for this video.",
                variant: "destructive"
            });
        }
    };

    const grabFrame = () => {
        const video = mediaRef.current;
        if (!video) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName.replace(/\.[^.]+$/, "")}-frame-${Math.round(video.currentTime * 1000)}ms.png`;
        a.click();
        toast({
            title: "Frame grabbed",
            description: `${canvas.width}×${canvas.height} PNG downloaded.`,
            variant: "success"
        });
    };

    const openTrim = () => {
        const el = mediaRef.current;
        // Sensible defaults: full file, or a ±5 s window when a playhead
        // position exists.
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

    /** frame-time readout — m:ss.d (one decimal) so stepping
     *  ±1/30 s is actually visible next to the controls. */
    const fmtTimePrecise = (s: number) => {
        if (!Number.isFinite(s)) return "0:00.0";
        const m = Math.floor(s / 60);
        const sec = Math.max(0, s % 60);
        return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
    };

    const loopArmed = loop.a !== null && loop.b !== null;

    return (
        <div
            className="flex flex-col h-full min-h-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60 rounded-sm"
            tabIndex={0}
            role="region"
            aria-label="Video player — Space play/pause, ←/→ seek ±5 s, ↑/↓ volume, M mute, L loop"
            onKeyDown={(e) => {
                // keyboard control for the player. Only handled when
                // the CONTAINER itself has focus — a focused slider/button/
                // textarea keeps its own key behavior (no double handling).
                if (e.target !== e.currentTarget) return;
                const el = mediaRef.current;
                if (!el) return;
                if (e.key === " ") {
                    e.preventDefault();
                    if (el.paused) void el.play().catch(() => undefined);
                    else el.pause();
                } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    // Shift+arrow jumps 10 s, plain arrow 5 s.
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
                {/* fine playback-rate slider — 0.1×–4× in 0.1 steps,
            covering the rates the presets skip (0.9×, 1.1×, 2.5×…). */}
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
                <span
                    className="text-[10px] font-mono tabular-nums w-9 text-center"
                    title="Current playback rate"
                >
          {speed.toFixed(1)}×
        </span>
                {/* frame-time readout (current / total, tenths so the
            ±1-frame stepper is visible) next to the controls. */}
                <span className="ml-1 font-mono tabular-nums text-[10px] text-muted-foreground"
                      title="Current time / duration">
          {fmtTimePrecise(currentTime)} / {fmtTimePrecise(duration)}
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
                {/* (user batch: "add more options for media gallery
and playback"): a ±10 s jump joins the ±5 s pair — long
clips (the new 30–60 s demo files) skip in bigger steps. */}
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => skip(10)}
                        title="Forward 10 s (Shift+→)">
                    10s <SkipForward className="size-3"/>
                </Button>
                {/* The frame utilities + the view
transforms each collapse into ONE dropdown instead of
13 stacked buttons. */}
                <div className="w-px h-5 bg-border mx-1"/>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]"
                                title="Frame utilities — step by frame, grab a PNG, picture-in-picture, fullscreen">
                            <Camera className="size-3"/> Frame <ChevronDown className="size-2.5"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => stepFrame(-1)} className="gap-2 cursor-pointer">
                            ⏪ <span className="flex-1">Step Back 1/30 s</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => stepFrame(1)} className="gap-2 cursor-pointer">
                            <span className="flex-1">Step Forward 1/30 s</span> ⏩
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuItem onClick={grabFrame} className="gap-2 cursor-pointer">
                            <Camera className="size-3.5"/> <span className="flex-1">Grab Frame → PNG</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void togglePip()} className="gap-2 cursor-pointer">
                            <PictureInPicture2 className="size-3.5"/> <span className="flex-1">Picture-in-picture</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={toggleFullscreen} className="gap-2 cursor-pointer">
                            <Maximize className="size-3.5"/> <span className="flex-1">Fullscreen</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* video VIEW transforms — zoom / rotate / flip
            (view-only — the export path is the Video studio). */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]"
                                title="Zoom, rotate and flip the video (view only)">
                            <RotateCw className="size-3"/> View <ChevronDown className="size-2.5"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Zoom
                            ({Math.round(vidZoom * 100)}%)</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setVidZoom((z) => Math.max(0.5, z / 1.25))}
                                          className="gap-2 cursor-pointer">
                            <ZoomOut className="size-3.5"/> Zoom Out
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVidZoom((z) => Math.min(3, z * 1.25))}
                                          className="gap-2 cursor-pointer">
                            <ZoomIn className="size-3.5"/> Zoom In
                        </DropdownMenuItem>
                        <DropdownMenuSeparator/>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Transforms</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setVidRotation((r) => (r + 90) % 360)}
                                          className="gap-2 cursor-pointer">
                            <RotateCw className="size-3.5"/> Rotate 90° Clockwise
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVidRotation((r) => (r + 270) % 360)}
                                          className="gap-2 cursor-pointer">
                            <RotateCcw className="size-3.5"/> Rotate 90° Counter-Clockwise
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVidFlipH((f) => !f)} className="gap-2 cursor-pointer">
                            <FlipHorizontal
                                className={cn("size-3.5", vidFlipH && "text-emerald-500")}/> {vidFlipH ? "Unflip" : "Flip"} Horizontally
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVidFlipV((f) => !f)} className="gap-2 cursor-pointer">
                            <FlipVertical
                                className={cn("size-3.5", vidFlipV && "text-emerald-500")}/> {vidFlipV ? "Unflip" : "Flip"} vertically
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                setVidZoom(1);
                                setVidRotation(0);
                                setVidFlipH(false);
                                setVidFlipV(false);
                            }}
                            className="gap-2 cursor-pointer"
                        >
                            <Maximize className="size-3.5"/> Reset view transform
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* the duplicate Tools ▸ dropdown was REMOVED — the
FileViewer header's Tools menu (next to the zoom cluster) is
the single toolbox entry point (user: "the same for images
and videos — aim to reduce space"). */}
                <div className="w-px h-5 bg-border mx-1"/>
                {/* Repeat / loop controls. The Repeat button is the
            loop toggle for the CURRENT media (no A–B window) — it now
            also drives the element's native `loop` attribute and is
            initialized from Settings → Media → Loop by default. */}
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
                    variant={loop.a !== null && loop.b !== null ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => {
                        const el = mediaRef.current;
                        if (el) setLoop({a: el.currentTime, b: null});
                    }}
                    title="Set loop A at the playhead (on the waveform: click = A, ⌥click = B, ⇧click = clear)"
                >
                    Set A
                </Button>
                <Button
                    variant={loop.a !== null && loop.b !== null ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => {
                        const el = mediaRef.current;
                        if (el && loop.a !== null) setLoop((l) => ({...l, b: el.currentTime}));
                    }}
                    disabled={loop.a === null}
                    title="Set loop B at the playhead (needs A first)"
                >
                    Set B
                </Button>
                {(loop.a !== null || loop.b !== null) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => setLoop({a: null, b: null})}
                        title="Clear the A–B loop"
                    >
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
Download button (the "why multiple download buttons in the
navbar of videos / audios? keep the top one" fix). */}
                {/* keyboard hints — kbd chips for the player keys.
            Click the player area first so it has keyboard focus. */}
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

            {/* Body — the <video> element (the audio counterpart is
 components/audio-tools.tsx since ). */}
            <div className="flex-1 min-h-0 overflow-auto grid place-items-center p-4" data-testid="media-tools-body">
                <div className="w-full grid place-items-center overflow-auto">
                    <video
                        ref={mediaRef}
                        src={src}
                        controls
                        onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
                        onLoadedData={onLoaded}
                        onError={onError}
                        className="max-w-full max-h-full"
                        style={{
                            width: "min(100%, 860px)",
                            transform: `rotate(${vidRotation}deg) scale(${vidZoom * (vidFlipH ? -1 : 1)}, ${vidZoom * (vidFlipV ? -1 : 1)})`,
                            transformOrigin: "center center",
                        }}
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
            </div>

            {/* Trim dialog — wider (buttons no longer overflow),
          flex-wrap button row, and clicking the backdrop dismisses. */}
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
                                    const el = mediaRef.current;
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
