"use client";

/**
 * Ambient sound engine — a shared, timer-independent WebAudio mixer.
 *
 * What this module delivers:
 * • a catalog of 105 fully synthesized tracks (zero network assets,
 * works offline) across EIGHT categories (Urban & Machines, Space
 * & Sci-Fi among them), plus a one-click blends list of 24.
 * • ambient sound works with or without an active focus session —
 * the engine is a module-level singleton with its
 * own localStorage state (`praxis.ambient`), its own pub/sub and a
 * React hook. The Focus menu, the Focus widget and the Settings
 * dialog all drive the SAME instance — no focus session required.
 *
 * Architecture:
 * • `AmbientTrackDef.recipe(ctx, out, cleanup)` builds one track's
 * node graph into its own GainNode (`out`). Tracks are built
 * lazily (only when their volume goes above 0) and disposed when
 * they return to 0, so CPU scales with how many sounds are in the
 * mix, never with the size of the catalog.
 * • Continuous textures are looped noise buffers (white / pink /
 * brown) through biquad filter chains with slow LFOs; discrete
 * events (crackles, chirps, ticks, notes…) are one-shot nodes
 * spawned by jittered setTimeout schedulers.
 * • Autoplay policy: the AudioContext is only ever created inside a
 * user-gesture call chain (menu click, switch toggle, slider). A
 * persisted `on: true` state after a reload is re-armed on the
 * FIRST pointer/key interaction.
 */

import * as React from "react";
import {STORAGE_PREFIX} from "@/lib/config";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export type AmbientCategoryId =
    | "Rain & Water"
    | "Fire & Air"
    | "Nature"
    | "Places"
    | "Urban & Machines"
    | "Noise & Tones"
    | "Space & Sci-Fi"
    | "Rhythmic & Tonal";

export interface AmbientTrackMeta {
    id: string;
    label: string;
    hint: string;
    category: AmbientCategoryId;
}

type NoiseKind = "white" | "pink" | "brown";

/** A recipe wires nodes into `out` and registers cleanup callbacks. */
type Recipe = (
    ctx: AudioContext,
    out: GainNode,
    cleanup: (fn: () => void) => void
) => void;

interface AmbientTrackDef extends AmbientTrackMeta {
    recipe: Recipe;
}

interface TrackHandle {
    stop: () => void;
}

/** Persisted intent (what the user wants), not engine state. */
export interface AmbientState {
    /** Master on/off — the engine also needs a user gesture to run. */
    on: boolean;
    /** Master volume, 0–100. */
    master: number;
    /** Track id → volume 0–100. Zero/missing entries are not built. */
    vols: Record<string, number>;
}

/** What subscribers receive: persisted intent + live engine status. */
export interface AmbientSnapshot extends AmbientState {
    /** True when the AudioContext is actually running. */
    running: boolean;
    /** How many tracks are currently audible. */
    activeCount: number;
}

/* ================================================================== */
/*  Synth helpers                                                      */
/* ================================================================== */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T, >(arr: readonly T[]): T =>
    arr[Math.floor(Math.random() * arr.length)] as T;

const noiseBufferCache = new Map<string, AudioBuffer>();

function makeNoiseBuffer(ctx: AudioContext, kind: NoiseKind, seconds = 10): AudioBuffer {
    // "Endless" feel
    // not stop and repeats"): buffers are 10 s — 2.5× longer than before —
    // so the loop period is far below the hearing threshold, and each
    // SOURCE additionally starts at a random offset and plays at a
    // slightly randomized rate (see noiseSrc), so two tracks sharing a
    // cached buffer never repeat in lockstep.
    const key = `${kind}:${ctx.sampleRate}:${seconds}`;
    const cached = noiseBufferCache.get(key);
    if (cached) return cached;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (kind === "brown") {
        let last = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            last = (last + 0.02 * w) / 1.02;
            data[i] = last * 3.5;
        }
    } else if (kind === "pink") {
        // Paul Kellet's refined pink-noise approximation.
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + w * 0.0555179;
            b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856;
            b4 = 0.55 * b4 + w * 0.5329522;
            b5 = -0.7616 * b5 - w * 0.016898;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
            b6 = w * 0.115926;
        }
    } else {
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // Crossfade the loop seam so the N-second loop never clicks.
    const fadeLen = Math.min(2000, Math.floor(len / 8));
    for (let i = 0; i < fadeLen; i++) {
        const f = i / fadeLen;
        data[i] *= f;
        data[len - 1 - i] *= f;
    }
    noiseBufferCache.set(key, buf);
    return buf;
}

/** Looping noise source. Caller must start it (cleanup does).
 *
 * Endless-loop behavior: the source starts at a RANDOM offset inside
 * the buffer and runs at a RANDOMIZED playback rate (0.92–1.08 — a
 * ±8% pitch drift that is imperceptible on noise textures). Two
 * sources built from the same cached buffer therefore drift out of
 * phase within a few seconds and never audibly "repeat together".
 * The rate is also re-randomized per source, not per buffer. */
function noiseSrc(
    ctx: AudioContext,
    kind: NoiseKind,
    cleanup: (fn: () => void) => void,
    seconds = 10
): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    const buf = makeNoiseBuffer(ctx, kind, seconds);
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rnd(0.92, 1.08);
    // Random loop phase — start somewhere inside the buffer instead of
    // at sample 0 where every other source starts.
    const offset = rnd(0, buf.duration - 0.05);
    src.start(ctx.currentTime, offset);
    cleanup(() => {
        try {
            src.stop();
        } catch { /* already stopped */
        }
    });
    return src;
}

function filt(
    ctx: AudioContext,
    type: BiquadFilterType,
    freq: number,
    q = 1
): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
}

function gainNode(ctx: AudioContext, v: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
}

/** Slow LFO wired onto any AudioParam (modulates around its base). */
function paramLfo(
    ctx: AudioContext,
    cleanup: (fn: () => void) => void,
    target: AudioParam,
    rateHz: number,
    depth: number
): void {
    const o = ctx.createOscillator();
    o.frequency.value = rateHz;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    cleanup(() => {
        try {
            o.stop();
        } catch { /* already stopped */
        }
    });
}

/** A sustained oscillator with its own gain — returns the gain node. */
function drone(
    ctx: AudioContext,
    dest: AudioNode,
    cleanup: (fn: () => void) => void,
    type: OscillatorType,
    freq: number,
    vol: number
): GainNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = gainNode(ctx, vol);
    o.connect(g).connect(dest);
    o.start();
    cleanup(() => {
        try {
            o.stop();
        } catch { /* already stopped */
        }
    });
    return g;
}

/** One-shot tone with a soft attack + exponential decay. */
function tone(
    ctx: AudioContext,
    dest: AudioNode,
    opts: {
        freq: number;
        toFreq?: number;
        dur: number;
        vol: number;
        type?: OscillatorType;
        delay?: number;
    }
): void {
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(opts.freq, t0);
    if (opts.toFreq != null)
        o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.toFreq), t0 + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + opts.dur + 0.05);
}

/** One-shot filtered noise burst (clicks, crackles, swishes, rumbles). */
function burst(
    ctx: AudioContext,
    dest: AudioNode,
    opts: {
        dur: number;
        vol: number;
        filter?: BiquadFilterType;
        freq?: number;
        q?: number;
        delay?: number;
    }
): void {
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const len = Math.max(64, Math.floor(ctx.sampleRate * opts.dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node: AudioNode = src;
    if (opts.filter) {
        const f = filt(ctx, opts.filter, opts.freq ?? 1000, opts.q ?? 1);
        src.connect(f);
        node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.vol, t0 + Math.min(0.012, opts.dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    node.connect(g).connect(dest);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.03);
}

/** Jittered repeating scheduler (min..max ms between events).
 *
 * Endless feel: events are scheduled ON THE AUDIO CLOCK with a
 * lookahead window instead of one `setTimeout` per event — a throttled
 * (background) tab could previously starve the setTimeout chain and
 * the crackles/chirps/thunder would stop while the looped bed kept
 * playing. The 400 ms interval only REFILLS the queue; the sounds
 * themselves start at exact `ctx.currentTime + delay` offsets, so
 * they fire sample-accurately even while timers are throttled. The
 * callback receives its delay in SECONDS and must pass it through to
 * burst/tone via `opts.delay`. */
function every(
    ctx: AudioContext,
    cleanup: (fn: () => void) => void,
    minMs: number,
    maxMs: number,
    fn: (delaySec: number) => void
): void {
    const LOOKAHEAD_SEC = 1.25;
    let nextAt = ctx.currentTime + rnd(minMs, maxMs) / 1000;
    const timer = window.setInterval(() => {
        const horizon = ctx.currentTime + LOOKAHEAD_SEC;
        while (nextAt < horizon) {
            fn(Math.max(0, nextAt - ctx.currentTime));
            nextAt += rnd(minMs, maxMs) / 1000;
        }
    }, 400);
    cleanup(() => window.clearInterval(timer));
}

/* ================================================================== */
/*  The 36-track catalog                                               */
/* ================================================================== */

const TRACKS: AmbientTrackDef[] = [
    /* ── Rain & Water ─────────────────────────────────────────────── */
    {
        id: "rain",
        label: "Rain",
        category: "Rain & Water",
        hint: "Steady rainfall — filtered white noise with a soft flutter",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.9);
            src.connect(filt(ctx, "highpass", 400)).connect(filt(ctx, "lowpass", 5200)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, rnd(0.09, 0.15), 0.12);
        },
    },
    {
        id: "heavy-rain",
        label: "Heavy rain",
        category: "Rain & Water",
        hint: "A proper downpour — wider hiss plus a low rumble bed",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.8);
            src.connect(filt(ctx, "highpass", 250)).connect(filt(ctx, "lowpass", 7500)).connect(g).connect(out);
            const rumb = noiseSrc(ctx, "brown", C);
            rumb.connect(filt(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.35)).connect(out);
            paramLfo(ctx, C, g.gain, 0.15, 0.1);
        },
    },
    {
        id: "thunderstorm",
        label: "Thunderstorm",
        category: "Rain & Water",
        hint: "Heavy rain with distant rolling thunder every so often",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.75);
            src.connect(filt(ctx, "highpass", 300)).connect(filt(ctx, "lowpass", 6500)).connect(g).connect(out);
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 350)).connect(gainNode(ctx, 0.3)).connect(out);
            every(ctx, C, 7000, 18000, (d) => {
                burst(ctx, out, {
                    dur: rnd(1.8, 3.2),
                    vol: rnd(0.3, 0.5),
                    filter: "lowpass",
                    freq: rnd(90, 140),
                    delay: d
                });
            });
        },
    },
    {
        id: "ocean-waves",
        label: "Ocean waves",
        category: "Rain & Water",
        hint: "Slow swelling surf — brown noise breathing through a lowpass",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            const lp = filt(ctx, "lowpass", 700, 0.7);
            const g = gainNode(ctx, 0.75);
            src.connect(lp).connect(g).connect(out);
            paramLfo(ctx, C, lp.frequency, 0.07, 350);
            paramLfo(ctx, C, g.gain, 0.08, 0.45);
        },
    },
    {
        id: "stream",
        label: "Stream",
        category: "Rain & Water",
        hint: "A babbling brook — two wobbling band-passes over a soft bed",
        recipe: (ctx, out, C) => {
            const s1 = noiseSrc(ctx, "white", C);
            s1.connect(filt(ctx, "bandpass", 1800, 0.8)).connect(gainNode(ctx, 0.5)).connect(out);
            const s2 = noiseSrc(ctx, "white", C);
            const bp2 = filt(ctx, "bandpass", 3200, 1.5);
            s2.connect(bp2).connect(gainNode(ctx, 0.35)).connect(out);
            paramLfo(ctx, C, bp2.frequency, 0.3, 600);
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 300)).connect(gainNode(ctx, 0.25)).connect(out);
        },
    },
    {
        id: "rain-on-roof",
        label: "Rain on roof",
        category: "Rain & Water",
        hint: "Tight patter on a window with a muffled shelter rumble",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.8);
            src.connect(filt(ctx, "highpass", 1200)).connect(filt(ctx, "lowpass", 6000)).connect(g).connect(out);
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 200)).connect(gainNode(ctx, 0.3)).connect(out);
            paramLfo(ctx, C, g.gain, 0.2, 0.1);
        },
    },

    /* ── Fire & Air ────────────────────────────────────────────────── */
    {
        id: "fireplace",
        label: "Fireplace",
        category: "Fire & Air",
        hint: "Crackling fire — a low roar dotted with snapping pops",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 350)).connect(gainNode(ctx, 0.5)).connect(out);
            every(ctx, C, 180, 650, (d) => {
                burst(ctx, out, {dur: rnd(0.02, 0.06), vol: rnd(0.12, 0.4), filter: "highpass", freq: 2500, delay: d});
            });
            every(ctx, C, 2500, 9000, (d) => {
                burst(ctx, out, {dur: rnd(0.08, 0.2), vol: rnd(0.3, 0.5), filter: "lowpass", freq: 900, delay: d});
            });
        },
    },
    {
        id: "campfire",
        label: "Campfire",
        category: "Fire & Air",
        hint: "An outdoor fire — sparser cracks, more hiss, wider space",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 300)).connect(gainNode(ctx, 0.35)).connect(out);
            const hiss = noiseSrc(ctx, "white", C);
            hiss.connect(filt(ctx, "highpass", 4000)).connect(gainNode(ctx, 0.06)).connect(out);
            every(ctx, C, 300, 1100, (d) => {
                burst(ctx, out, {dur: rnd(0.02, 0.05), vol: rnd(0.1, 0.3), filter: "highpass", freq: 2200, delay: d});
            });
        },
    },
    {
        id: "wind",
        label: "Wind",
        category: "Fire & Air",
        hint: "A gentle breeze — pink noise breathing through a moving lowpass",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            const lp = filt(ctx, "lowpass", 700, 0.7);
            const g = gainNode(ctx, 0.8);
            src.connect(lp).connect(g).connect(out);
            paramLfo(ctx, C, lp.frequency, 0.05, 350);
            paramLfo(ctx, C, g.gain, 0.03, 0.25);
        },
    },
    {
        id: "snowstorm",
        label: "Snowstorm",
        category: "Fire & Air",
        hint: "Howling gusts — a higher, tighter band with sudden swells",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            const bp = filt(ctx, "bandpass", 600, 0.6);
            const g = gainNode(ctx, 0.9);
            src.connect(bp).connect(g).connect(out);
            paramLfo(ctx, C, bp.frequency, 0.1, 250);
            paramLfo(ctx, C, g.gain, 0.08, 0.3);
            every(ctx, C, 4000, 10000, (d) => {
                burst(ctx, out, {dur: rnd(1.2, 2.2), vol: rnd(0.15, 0.25), filter: "lowpass", freq: 900, delay: d});
            });
        },
    },
    {
        id: "desert-wind",
        label: "Desert wind",
        category: "Fire & Air",
        hint: "Warm, wide wind across open sand — slow sweeping band-pass",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            const bp = filt(ctx, "bandpass", 350, 1.2);
            const g = gainNode(ctx, 0.8);
            src.connect(bp).connect(g).connect(out);
            paramLfo(ctx, C, bp.frequency, 0.03, 150);
            paramLfo(ctx, C, g.gain, 0.02, 0.2);
        },
    },
    {
        id: "fan",
        label: "Fan",
        category: "Fire & Air",
        hint: "A steady desk fan — smooth brown drone with a faint motor hum",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 600)).connect(gainNode(ctx, 0.55)).connect(out);
            drone(ctx, out, C, "sine", 120, 0.045);
        },
    },

    /* ── Nature ────────────────────────────────────────────────────── */
    {
        id: "crickets",
        label: "Crickets",
        category: "Nature",
        hint: "A summer-night chorus of chirping crickets",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 1500)).connect(gainNode(ctx, 0.05)).connect(out);
            every(ctx, C, 400, 1200, (d) => {
                const base = rnd(3800, 4600);
                const pulses = 3 + Math.floor(Math.random() * 4);
                for (let i = 0; i < pulses; i++) {
                    tone(ctx, out, {freq: base, dur: 0.025, vol: 0.08, delay: d + i * 0.06});
                }
            });
        },
    },
    {
        id: "birds",
        label: "Birdsong",
        category: "Nature",
        hint: "Songbirds chirping in the morning — random sweeping tweets",
        recipe: (ctx, out, C) => {
            every(ctx, C, 1500, 5000, (d) => {
                const notes = 2 + Math.floor(Math.random() * 4);
                for (let i = 0; i < notes; i++) {
                    const f = rnd(1800, 3600);
                    tone(ctx, out, {
                        freq: f,
                        toFreq: f * rnd(0.7, 1.4),
                        dur: rnd(0.07, 0.15),
                        vol: 0.1,
                        delay: d + i * rnd(0.08, 0.18)
                    });
                }
            });
        },
    },
    {
        id: "forest",
        label: "Forest",
        category: "Nature",
        hint: "Rustling leaves with the occasional distant bird",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            const g = gainNode(ctx, 0.25);
            src.connect(filt(ctx, "lowpass", 1200)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.07, 0.1);
            every(ctx, C, 3000, 9000, (d) => {
                const f = rnd(1500, 2800);
                tone(ctx, out, {freq: f, toFreq: f * rnd(0.8, 1.3), dur: rnd(0.08, 0.14), vol: 0.06, delay: d});
            });
        },
    },
    {
        id: "jungle",
        label: "Jungle",
        category: "Nature",
        hint: "Dense tropical ambience — insects, rumble and exotic calls",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 500)).connect(gainNode(ctx, 0.3)).connect(out);
            const ins = noiseSrc(ctx, "white", C);
            const ig = gainNode(ctx, 0.15);
            ins.connect(filt(ctx, "bandpass", 2800, 2)).connect(ig).connect(out);
            paramLfo(ctx, C, ig.gain, 0.4, 0.04);
            every(ctx, C, 1200, 4000, (d) => {
                const f = rnd(1200, 2400);
                tone(ctx, out, {freq: f, toFreq: f * rnd(0.6, 1.5), dur: rnd(0.1, 0.2), vol: 0.07, delay: d});
            });
        },
    },
    {
        id: "night-field",
        label: "Night field",
        category: "Nature",
        hint: "Sparse crickets over a very low breeze — quiet darkness",
        recipe: (ctx, out, C) => {
            const wind = noiseSrc(ctx, "pink", C);
            wind.connect(filt(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.15)).connect(out);
            every(ctx, C, 900, 2200, (d) => {
                const base = rnd(3600, 4300);
                const pulses = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < pulses; i++) {
                    tone(ctx, out, {freq: base, dur: 0.02, vol: 0.05, delay: d + i * 0.07});
                }
            });
        },
    },
    {
        id: "frogs",
        label: "Frogs",
        category: "Nature",
        hint: "A pond at dusk — croaking frogs over a soft water bed",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 300)).connect(gainNode(ctx, 0.12)).connect(out);
            every(ctx, C, 1200, 4200, (d) => {
                const f = rnd(170, 260);
                const dur = rnd(0.18, 0.35);
                const t0 = ctx.currentTime + d;
                const o = ctx.createOscillator();
                o.type = "sawtooth";
                o.frequency.value = f;
                const am = ctx.createOscillator();
                am.frequency.value = 22;
                const amg = ctx.createGain();
                amg.gain.value = 0.05;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, t0);
                g.gain.linearRampToValueAtTime(0.12, t0 + 0.03);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                am.connect(amg).connect(g.gain);
                o.connect(g).connect(out);
                o.start(t0);
                am.start(t0);
                o.stop(t0 + dur + 0.05);
                am.stop(t0 + dur + 0.05);
            });
        },
    },

    /* ── Places ────────────────────────────────────────────────────── */
    {
        id: "cafe",
        label: "Café murmur",
        category: "Places",
        hint: "Distant chatter and cups — band-passed brown noise with a clink",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            const g = gainNode(ctx, 0.9);
            src.connect(filt(ctx, "bandpass", 420, 0.8)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.23, 0.35);
            every(ctx, C, 8000, 20000, (d) => {
                tone(ctx, out, {freq: rnd(2200, 3200), dur: 0.05, vol: 0.03, delay: d});
            });
        },
    },
    {
        id: "office-typing",
        label: "Office typing",
        category: "Places",
        hint: "Keyboards clattering in a quiet room tone",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 800)).connect(gainNode(ctx, 0.1)).connect(out);
            every(ctx, C, 300, 1500, (d) => {
                const cluster = 2 + Math.floor(Math.random() * 6);
                for (let i = 0; i < cluster; i++) {
                    burst(ctx, out, {
                        dur: 0.008,
                        vol: rnd(0.06, 0.15),
                        filter: "highpass",
                        freq: 1800,
                        delay: d + i * rnd(0.04, 0.09)
                    });
                }
            });
        },
    },
    {
        id: "train",
        label: "Train",
        category: "Places",
        hint: "Railway rhythm — steady clacks over rolling steel hiss",
        recipe: (ctx, out, C) => {
            const hiss = noiseSrc(ctx, "pink", C);
            const hg = gainNode(ctx, 0.35);
            hiss.connect(filt(ctx, "lowpass", 1100)).connect(hg).connect(out);
            paramLfo(ctx, C, hg.gain, 0.15, 0.08);
            every(ctx, C, 850, 950, (d) => {
                tone(ctx, out, {freq: 70, toFreq: 45, dur: 0.12, vol: 0.25, delay: d});
                tone(ctx, out, {freq: 62, toFreq: 40, dur: 0.1, vol: 0.18, delay: d + 0.12});
            });
        },
    },
    {
        id: "airplane",
        label: "Airplane cabin",
        category: "Places",
        hint: "Cruising-altitude drone — deep hull hum with air-vent hiss",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 380)).connect(gainNode(ctx, 0.7)).connect(out);
            const res = noiseSrc(ctx, "brown", C);
            res.connect(filt(ctx, "bandpass", 160, 3)).connect(gainNode(ctx, 0.4)).connect(out);
            const hiss = noiseSrc(ctx, "white", C);
            hiss.connect(filt(ctx, "highpass", 3500)).connect(gainNode(ctx, 0.04)).connect(out);
        },
    },
    {
        id: "car-ride",
        label: "Car ride",
        category: "Places",
        hint: "Highway driving — tire hum with a gently breathing road band",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            src.connect(filt(ctx, "lowpass", 550)).connect(gainNode(ctx, 0.5)).connect(out);
            const road = noiseSrc(ctx, "pink", C);
            const bp = filt(ctx, "bandpass", 95, 1.5);
            road.connect(bp).connect(gainNode(ctx, 0.25)).connect(out);
            paramLfo(ctx, C, bp.frequency, 0.2, 15);
            every(ctx, C, 6000, 14000, (d) => {
                burst(ctx, out, {
                    dur: rnd(1.0, 1.6),
                    vol: rnd(0.08, 0.12),
                    filter: "bandpass",
                    freq: 1200,
                    q: 0.8,
                    delay: d
                });
            });
        },
    },
    {
        id: "city-night",
        label: "City at night",
        category: "Places",
        hint: "Distant traffic wash with the occasional passing car",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 260)).connect(gainNode(ctx, 0.55)).connect(out);
            const breeze = noiseSrc(ctx, "pink", C);
            const bg = gainNode(ctx, 0.12);
            breeze.connect(filt(ctx, "bandpass", 700, 0.7)).connect(bg).connect(out);
            paramLfo(ctx, C, bg.gain, 0.05, 0.05);
            every(ctx, C, 10000, 25000, (d) => {
                burst(ctx, out, {dur: rnd(1.8, 2.6), vol: rnd(0.06, 0.1), filter: "lowpass", freq: 600, delay: d});
            });
        },
    },

    /* ── Noise & Tones ─────────────────────────────────────────────── */
    {
        id: "white-noise",
        label: "White noise",
        category: "Noise & Tones",
        hint: "Classic broadband masking noise",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            src.connect(filt(ctx, "lowpass", 10000)).connect(gainNode(ctx, 0.5)).connect(out);
        },
    },
    {
        id: "pink-noise",
        label: "Pink noise",
        category: "Noise & Tones",
        hint: "Softer 1/f noise — equal energy per octave, easier on the ears",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            src.connect(gainNode(ctx, 0.55)).connect(out);
        },
    },
    {
        id: "brown-noise",
        label: "Brown noise",
        category: "Noise & Tones",
        hint: "Deep, warm low-frequency noise for deep work",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 1200)).connect(gainNode(ctx, 0.55)).connect(out);
        },
    },
    {
        id: "spaceship-hum",
        label: "Spaceship hum",
        category: "Noise & Tones",
        hint: "A sci-fi deck — detuned low sines beating over a sub-bass bed",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 55, 0.06);
            drone(ctx, out, C, "sine", 55.8, 0.06);
            drone(ctx, out, C, "sine", 110.3, 0.03);
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 200)).connect(gainNode(ctx, 0.1)).connect(out);
        },
    },
    {
        id: "underwater",
        label: "Underwater",
        category: "Noise & Tones",
        hint: "Muffled depths with rising bubble blips",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            const lp = filt(ctx, "lowpass", 320, 0.7);
            const g = gainNode(ctx, 0.7);
            src.connect(lp).connect(g).connect(out);
            paramLfo(ctx, C, lp.frequency, 0.08, 120);
            every(ctx, C, 2000, 6000, (d) => {
                tone(ctx, out, {freq: rnd(220, 320), toFreq: rnd(550, 800), dur: 0.08, vol: 0.05, delay: d});
            });
        },
    },
    {
        id: "electrical-hum",
        label: "Electrical hum",
        category: "Noise & Tones",
        hint: "Mains transformer hum at 50 Hz with faint harmonics",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 50, 0.05);
            drone(ctx, out, C, "sine", 100, 0.03);
            drone(ctx, out, C, "sine", 150, 0.015);
            const hiss = noiseSrc(ctx, "pink", C);
            hiss.connect(filt(ctx, "highpass", 6000)).connect(gainNode(ctx, 0.008)).connect(out);
        },
    },

    /* ── Rhythmic & Tonal ──────────────────────────────────────────── */
    {
        id: "heartbeat",
        label: "Heartbeat",
        category: "Rhythmic & Tonal",
        hint: "A calm ~63 bpm double-thump — grounding and slow",
        recipe: (ctx, out, C) => {
            every(ctx, C, 940, 980, (d) => {
                tone(ctx, out, {freq: 52, toFreq: 38, dur: 0.14, vol: 0.5, delay: d});
                tone(ctx, out, {freq: 48, toFreq: 34, dur: 0.12, vol: 0.3, delay: d + 0.19});
            });
        },
    },
    {
        id: "clock-ticking",
        label: "Clock ticking",
        category: "Rhythmic & Tonal",
        hint: "An analog wall clock — tick… tock, once a second",
        recipe: (ctx, out, C) => {
            let flip = false;
            every(ctx, C, 1000, 1000, (d) => {
                flip = !flip;
                burst(ctx, out, {
                    dur: 0.012,
                    vol: 0.2,
                    filter: "bandpass",
                    freq: flip ? 2200 : 1500,
                    q: 8,
                    delay: d,
                });
            });
        },
    },
    {
        id: "metronome",
        label: "Metronome",
        category: "Rhythmic & Tonal",
        hint: "A steady 90 bpm practice click",
        recipe: (ctx, out, C) => {
            every(ctx, C, 664, 668, (d) => {
                tone(ctx, out, {freq: 1100, dur: 0.015, vol: 0.25, delay: d});
                burst(ctx, out, {dur: 0.006, vol: 0.06, filter: "highpass", freq: 4000, delay: d});
            });
        },
    },
    {
        id: "singing-bowl",
        label: "Singing bowl",
        category: "Rhythmic & Tonal",
        hint: "Meditation bowl strikes with long, beating decays",
        recipe: (ctx, out, C) => {
            every(ctx, C, 8000, 15000, (d) => {
                const partials: Array<[number, number]> = [
                    [220, 0.12],
                    [330.5, 0.08],
                    [587, 0.05],
                    [660.5, 0.04],
                ];
                for (const [f, v] of partials) {
                    tone(ctx, out, {freq: f, dur: rnd(6, 8), vol: v, delay: d});
                }
                burst(ctx, out, {dur: 0.04, vol: 0.06, filter: "bandpass", freq: 1400, q: 2, delay: d});
            });
        },
    },
    {
        id: "om-drone",
        label: "Om drone",
        category: "Rhythmic & Tonal",
        hint: "A low 136 Hz chant-like drone with soft overtones",
        recipe: (ctx, out, C) => {
            const g = drone(ctx, out, C, "sine", 136.1, 0.12);
            drone(ctx, out, C, "sine", 272.2, 0.05);
            drone(ctx, out, C, "sine", 68.05, 0.06);
            paramLfo(ctx, C, g.gain, 0.1, 0.03);
            const bed = noiseSrc(ctx, "pink", C);
            bed.connect(filt(ctx, "lowpass", 500)).connect(gainNode(ctx, 0.05)).connect(out);
        },
    },
    {
        id: "music-box",
        label: "Music box",
        category: "Rhythmic & Tonal",
        hint: "Gentle random pentatonic plinks — a sleepy lullaby",
        recipe: (ctx, out, C) => {
            const scale = [523.25, 587.33, 659.25, 783.99, 880];
            every(ctx, C, 1200, 2600, (d) => {
                const f = pick(scale);
                tone(ctx, out, {freq: f, dur: 1.8, vol: 0.12, delay: d});
                tone(ctx, out, {freq: f * 2, dur: 1.2, vol: 0.05, type: "triangle", delay: d});
            });
        },
    },

    /* ══ — 69 more tracks ("reach to 100 ambient sounds +
        different blends more than the existing") ════════════════════ */

    /* ── Rain & Water (additions) ─────────────────────────────────── */
    {
        id: "drizzle",
        label: "Drizzle",
        category: "Rain & Water",
        hint: "A thin, intermittent sprinkle — light and distant",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.35);
            src.connect(filt(ctx, "highpass", 1500)).connect(filt(ctx, "lowpass", 7000)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.08, 0.14);
            every(ctx, C, 1800, 5200, (d) => {
                burst(ctx, out, {
                    dur: rnd(0.15, 0.4),
                    vol: rnd(0.03, 0.06),
                    filter: "bandpass",
                    freq: rnd(700, 1100),
                    q: 0.8,
                    delay: d
                });
            });
        },
    },
    {
        id: "waterfall",
        label: "Waterfall",
        category: "Rain & Water",
        hint: "A wide cascade — roaring brown energy with spray hiss",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            const g = gainNode(ctx, 0.7);
            src.connect(filt(ctx, "lowpass", 900)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.05, 0.12);
            const spray = noiseSrc(ctx, "white", C);
            spray.connect(filt(ctx, "bandpass", 1200, 0.5)).connect(gainNode(ctx, 0.35)).connect(out);
        },
    },
    {
        id: "fountain",
        label: "Fountain",
        category: "Rain & Water",
        hint: "A garden fountain — bubbling burbles over a soft water bed",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "bandpass", 700, 1)).connect(gainNode(ctx, 0.4)).connect(out);
            every(ctx, C, 150, 550, (d) => {
                burst(ctx, out, {
                    dur: rnd(0.05, 0.14),
                    vol: rnd(0.05, 0.14),
                    filter: "bandpass",
                    freq: rnd(1000, 2600),
                    q: 1.4,
                    delay: d
                });
            });
        },
    },
    {
        id: "dripping-cave",
        label: "Dripping cave",
        category: "Rain & Water",
        hint: "Stalactite drips echoing in a dark hollow",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 250)).connect(gainNode(ctx, 0.18)).connect(out);
            every(ctx, C, 900, 3200, (d) => {
                const f = rnd(900, 1500);
                tone(ctx, out, {freq: f, toFreq: f * 0.55, dur: 0.06, vol: 0.16, delay: d});
                tone(ctx, out, {freq: f * 0.75, toFreq: f * 0.4, dur: 0.05, vol: 0.05, delay: d + 0.17});
            });
        },
    },
    {
        id: "leaky-faucet",
        label: "Leaky faucet",
        category: "Rain & Water",
        hint: "A stubborn drip in a quiet room — plink… plink…",
        recipe: (ctx, out, C) => {
            const room = noiseSrc(ctx, "brown", C);
            room.connect(filt(ctx, "lowpass", 450)).connect(gainNode(ctx, 0.06)).connect(out);
            every(ctx, C, 2000, 4200, (d) => {
                tone(ctx, out, {freq: 1250, toFreq: 900, dur: 0.045, vol: 0.22, delay: d});
                tone(ctx, out, {freq: 1900, toFreq: 1400, dur: 0.03, vol: 0.05, delay: d});
            });
        },
    },
    {
        id: "rain-through-leaves",
        label: "Rain through leaves",
        category: "Rain & Water",
        hint: "Rainfall softened by a canopy — patter plus leaf rustle",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.4);
            src.connect(filt(ctx, "highpass", 700)).connect(filt(ctx, "lowpass", 6000)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.3, 0.12);
            const leaves = noiseSrc(ctx, "pink", C);
            const lb = filt(ctx, "bandpass", 3000, 0.6);
            leaves.connect(lb).connect(gainNode(ctx, 0.1)).connect(out);
            paramLfo(ctx, C, lb.frequency, 0.14, 400);
        },
    },
    {
        id: "icicle-melt",
        label: "Icicle melt",
        category: "Rain & Water",
        hint: "Thaw drips with a cold breeze — early spring",
        recipe: (ctx, out, C) => {
            const breeze = noiseSrc(ctx, "pink", C);
            breeze.connect(filt(ctx, "lowpass", 500)).connect(gainNode(ctx, 0.12)).connect(out);
            every(ctx, C, 500, 1600, (d) => {
                const f = rnd(700, 1600);
                tone(ctx, out, {freq: f, toFreq: f * 0.6, dur: 0.05, vol: rnd(0.06, 0.12), delay: d});
            });
        },
    },
    {
        id: "river-barge",
        label: "River barge",
        category: "Rain & Water",
        hint: "A low diesel boat pushing through lapping water",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sawtooth", 55, 0.05);
            drone(ctx, out, C, "sine", 27.5, 0.05);
            const water = noiseSrc(ctx, "brown", C);
            const wb = filt(ctx, "bandpass", 500, 0.8);
            water.connect(wb).connect(gainNode(ctx, 0.35)).connect(out);
            paramLfo(ctx, C, wb.frequency, 0.22, 150);
        },
    },

    /* ── Fire & Air (additions) ────────────────────────────────────── */
    {
        id: "bonfire",
        label: "Bonfire",
        category: "Fire & Air",
        hint: "A big outdoor blaze — deep roar with frequent snaps",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.45)).connect(out);
            every(ctx, C, 80, 420, (d) => {
                burst(ctx, out, {dur: rnd(0.02, 0.07), vol: rnd(0.15, 0.45), filter: "highpass", freq: 2000, delay: d});
            });
            every(ctx, C, 3000, 8000, (d) => {
                burst(ctx, out, {dur: rnd(0.2, 0.4), vol: rnd(0.2, 0.3), filter: "lowpass", freq: 300, delay: d});
            });
        },
    },
    {
        id: "candle-hiss",
        label: "Candle hiss",
        category: "Fire & Air",
        hint: "One tiny flame — faint sputter and flutter",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            const g = gainNode(ctx, 0.045);
            src.connect(filt(ctx, "bandpass", 5000, 0.8)).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.6, 0.025);
            every(ctx, C, 1200, 4000, (d) => {
                burst(ctx, out, {dur: rnd(0.01, 0.03), vol: rnd(0.02, 0.05), filter: "highpass", freq: 3000, delay: d});
            });
        },
    },
    {
        id: "blizzard",
        label: "Blizzard",
        category: "Fire & Air",
        hint: "Whiteout wind — screaming gusts over a deep moan",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            const bp = filt(ctx, "bandpass", 500, 0.5);
            const g = gainNode(ctx, 1.0);
            src.connect(bp).connect(g).connect(out);
            paramLfo(ctx, C, bp.frequency, 0.13, 300);
            const howl = noiseSrc(ctx, "white", C);
            howl.connect(filt(ctx, "highpass", 2000)).connect(gainNode(ctx, 0.12)).connect(out);
            every(ctx, C, 2000, 6000, (d) => {
                burst(ctx, out, {
                    dur: rnd(1.5, 3),
                    vol: rnd(0.2, 0.35),
                    filter: "bandpass",
                    freq: rnd(700, 1100),
                    q: 0.7,
                    delay: d
                });
            });
        },
    },
    {
        id: "hair-dryer",
        label: "Hair dryer",
        category: "Fire & Air",
        hint: "Steady hot airflow with a small motor whir",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "white", C);
            src.connect(filt(ctx, "lowpass", 4000)).connect(gainNode(ctx, 0.35)).connect(out);
            drone(ctx, out, C, "sine", 95, 0.045);
            drone(ctx, out, C, "sine", 190, 0.02);
        },
    },
    {
        id: "furnace",
        label: "Furnace",
        category: "Fire & Air",
        hint: "A basement heater — resonant rumble and burner thrum",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            src.connect(filt(ctx, "lowpass", 220)).connect(gainNode(ctx, 0.5)).connect(out);
            const res = noiseSrc(ctx, "brown", C);
            res.connect(filt(ctx, "bandpass", 120, 4)).connect(gainNode(ctx, 0.2)).connect(out);
            every(ctx, C, 6000, 12000, (d) => {
                burst(ctx, out, {dur: rnd(0.3, 0.5), vol: rnd(0.1, 0.16), filter: "lowpass", freq: 180, delay: d});
            });
        },
    },
    {
        id: "mountain-gust",
        label: "Mountain gust",
        category: "Fire & Air",
        hint: "High-altitude wind — long slow gusts across open rock",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "pink", C);
            const lp = filt(ctx, "lowpass", 900, 0.7);
            const g = gainNode(ctx, 0.5);
            src.connect(lp).connect(g).connect(out);
            paramLfo(ctx, C, g.gain, 0.022, 0.35);
            every(ctx, C, 5000, 11000, (d) => {
                burst(ctx, out, {dur: rnd(2, 4), vol: rnd(0.1, 0.2), filter: "lowpass", freq: 600, delay: d});
            });
        },
    },

    /* ── Nature (additions) ────────────────────────────────────────── */
    {
        id: "owl-hoots",
        label: "Owl hoots",
        category: "Nature",
        hint: "A lone owl in the dark — soft round hoots",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "pink", C);
            bed.connect(filt(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.1)).connect(out);
            every(ctx, C, 6000, 14000, (d) => {
                tone(ctx, out, {freq: 350, toFreq: 330, dur: 0.32, vol: 0.12, delay: d});
                tone(ctx, out, {freq: 340, toFreq: 318, dur: 0.36, vol: 0.1, delay: d + 0.55});
            });
        },
    },
    {
        id: "wolf-howls",
        label: "Wolf howls",
        category: "Nature",
        hint: "Far-away howls echoing over a quiet night",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "pink", C);
            bed.connect(filt(ctx, "lowpass", 300)).connect(gainNode(ctx, 0.12)).connect(out);
            every(ctx, C, 12000, 25000, (d) => {
                tone(ctx, out, {freq: 250, toFreq: 310, dur: 2.2, vol: 0.07, type: "sine", delay: d});
                tone(ctx, out, {freq: 254, toFreq: 306, dur: 2.2, vol: 0.035, type: "triangle", delay: d + 0.03});
            });
        },
    },
    {
        id: "whale-song",
        label: "Whale song",
        category: "Nature",
        hint: "Deep-ocean calls — long bending moans through water",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 150)).connect(gainNode(ctx, 0.15)).connect(out);
            every(ctx, C, 8000, 20000, (d) => {
                tone(ctx, out, {freq: rnd(160, 220), toFreq: rnd(380, 460), dur: rnd(2, 3.2), vol: 0.08, delay: d});
                tone(ctx, out, {
                    freq: rnd(120, 180),
                    toFreq: rnd(300, 360),
                    dur: rnd(1.6, 2.4),
                    vol: 0.04,
                    delay: d + 0.4
                });
            });
        },
    },
    {
        id: "loon-calls",
        label: "Loon calls",
        category: "Nature",
        hint: "Tremolo loon laughter over a still lake",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 350)).connect(gainNode(ctx, 0.1)).connect(out);
            every(ctx, C, 9000, 20000, (d) => {
                const t0 = ctx.currentTime + d;
                const o = ctx.createOscillator();
                o.type = "sine";
                o.frequency.value = 440;
                const am = ctx.createOscillator();
                am.frequency.value = 9;
                const amg = ctx.createGain();
                amg.gain.value = 0.045;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, t0);
                g.gain.linearRampToValueAtTime(0.09, t0 + 0.25);
                g.gain.setValueAtTime(0.09, t0 + 0.9);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
                am.connect(amg).connect(g.gain);
                o.connect(g).connect(out);
                o.start(t0);
                am.start(t0);
                o.stop(t0 + 1.5);
                am.stop(t0 + 1.5);
            });
        },
    },
    {
        id: "dove-coos",
        label: "Dove coos",
        category: "Nature",
        hint: "Morning doves on a warm windowsill",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "pink", C);
            bed.connect(filt(ctx, "lowpass", 800)).connect(gainNode(ctx, 0.1)).connect(out);
            every(ctx, C, 4000, 9000, (d) => {
                tone(ctx, out, {freq: 480, toFreq: 390, dur: 0.4, vol: 0.07, delay: d});
                tone(ctx, out, {freq: 460, toFreq: 370, dur: 0.3, vol: 0.05, delay: d + 0.75});
                tone(ctx, out, {freq: 445, toFreq: 360, dur: 0.35, vol: 0.04, delay: d + 1.35});
            });
        },
    },
    {
        id: "seagulls",
        label: "Seagulls",
        category: "Nature",
        hint: "Coastal gulls crying over wind",
        recipe: (ctx, out, C) => {
            const wind = noiseSrc(ctx, "pink", C);
            wind.connect(filt(ctx, "lowpass", 700)).connect(gainNode(ctx, 0.15)).connect(out);
            every(ctx, C, 3000, 8000, (d) => {
                const base = rnd(1100, 1500);
                const cries = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < cries; i++) {
                    tone(ctx, out, {
                        freq: base,
                        toFreq: base * 0.7,
                        dur: 0.28,
                        vol: 0.07,
                        delay: d + i * rnd(0.3, 0.5)
                    });
                }
            });
        },
    },
    {
        id: "savanna-dusk",
        label: "Savanna dusk",
        category: "Nature",
        hint: "Warm evening insects over dry grass",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "pink", C);
            const bg = gainNode(ctx, 0.14);
            bed.connect(filt(ctx, "lowpass", 900)).connect(bg).connect(out);
            paramLfo(ctx, C, bg.gain, 0.03, 0.05);
            const ins = noiseSrc(ctx, "white", C);
            const ig = gainNode(ctx, 0.06);
            ins.connect(filt(ctx, "bandpass", 3200, 3)).connect(ig).connect(out);
            paramLfo(ctx, C, ig.gain, 0.5, 0.03);
            every(ctx, C, 9000, 18000, (d) => {
                burst(ctx, out, {dur: rnd(0.8, 1.6), vol: rnd(0.05, 0.09), filter: "lowpass", freq: 350, delay: d});
            });
        },
    },
    {
        id: "bamboo-grove",
        label: "Bamboo grove",
        category: "Nature",
        hint: "Stalks knocking and creaking in the breeze",
        recipe: (ctx, out, C) => {
            const wind = noiseSrc(ctx, "pink", C);
            wind.connect(filt(ctx, "lowpass", 700)).connect(gainNode(ctx, 0.25)).connect(out);
            every(ctx, C, 2000, 6000, (d) => {
                tone(ctx, out, {
                    freq: rnd(85, 115),
                    toFreq: rnd(55, 75),
                    dur: rnd(0.25, 0.5),
                    vol: 0.03,
                    type: "sawtooth",
                    delay: d
                });
                tone(ctx, out, {
                    freq: rnd(200, 320),
                    dur: 0.08,
                    vol: 0.025,
                    type: "triangle",
                    delay: d + rnd(0.05, 0.15)
                });
            });
        },
    },

    /* ── Places (additions) ────────────────────────────────────────── */
    {
        id: "library",
        label: "Library",
        category: "Places",
        hint: "Reading-room hush with the occasional page turn",
        recipe: (ctx, out, C) => {
            const room = noiseSrc(ctx, "brown", C);
            room.connect(filt(ctx, "lowpass", 600)).connect(gainNode(ctx, 0.08)).connect(out);
            every(ctx, C, 8000, 20000, (d) => {
                burst(ctx, out, {dur: rnd(0.12, 0.2), vol: rnd(0.03, 0.05), filter: "highpass", freq: 3000, delay: d});
                burst(ctx, out, {
                    dur: rnd(0.08, 0.14),
                    vol: rnd(0.02, 0.04),
                    filter: "highpass",
                    freq: 2500,
                    delay: d + rnd(0.4, 0.8)
                });
            });
            every(ctx, C, 6000, 14000, (d) => {
                for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
                    burst(ctx, out, {
                        dur: 0.09,
                        vol: rnd(0.04, 0.07),
                        filter: "lowpass",
                        freq: 320,
                        delay: d + i * rnd(0.5, 0.7)
                    });
                }
            });
        },
    },
    {
        id: "restaurant-kitchen",
        label: "Restaurant kitchen",
        category: "Places",
        hint: "Sizzling pans, clattering plates and kitchen bustle",
        recipe: (ctx, out, C) => {
            const murmur = noiseSrc(ctx, "brown", C);
            murmur.connect(filt(ctx, "bandpass", 500, 0.8)).connect(gainNode(ctx, 0.22)).connect(out);
            drone(ctx, out, C, "sawtooth", 95, 0.012);
            every(ctx, C, 3000, 7000, (d) => {
                burst(ctx, out, {
                    dur: rnd(0.3, 0.6),
                    vol: rnd(0.05, 0.09),
                    filter: "bandpass",
                    freq: 4000,
                    q: 0.6,
                    delay: d
                });
            });
            every(ctx, C, 1200, 3600, (d) => {
                tone(ctx, out, {freq: rnd(2000, 4000), dur: 0.05, vol: rnd(0.03, 0.07), type: "triangle", delay: d});
            });
        },
    },
    {
        id: "laundromat",
        label: "Laundromat",
        category: "Places",
        hint: "Washers tumbling behind a warm machine hum",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sawtooth", 60, 0.05);
            drone(ctx, out, C, "sine", 30, 0.03);
            const drum = noiseSrc(ctx, "brown", C);
            const dg = gainNode(ctx, 0.22);
            drum.connect(filt(ctx, "bandpass", 180, 1)).connect(dg).connect(out);
            paramLfo(ctx, C, dg.gain, 0.9, 0.08);
            every(ctx, C, 700, 900, (d) => {
                burst(ctx, out, {
                    dur: 0.06,
                    vol: rnd(0.03, 0.06),
                    filter: "bandpass",
                    freq: rnd(500, 900),
                    q: 1.5,
                    delay: d
                });
            });
        },
    },
    {
        id: "bus-ride",
        label: "Bus ride",
        category: "Places",
        hint: "A city bus — diesel idle, road hiss and a soft sway",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sawtooth", 85, 0.04);
            drone(ctx, out, C, "sine", 42.5, 0.04);
            const road = noiseSrc(ctx, "pink", C);
            const rg = gainNode(ctx, 0.28);
            road.connect(filt(ctx, "lowpass", 450)).connect(rg).connect(out);
            paramLfo(ctx, C, rg.gain, 0.18, 0.06);
        },
    },
    {
        id: "subway-platform",
        label: "Subway platform",
        category: "Places",
        hint: "Tunnel rumble, brake squeals and passing trains",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 200)).connect(gainNode(ctx, 0.3)).connect(out);
            every(ctx, C, 12000, 26000, (d) => {
                const approach = 2.5;
                burst(ctx, out, {dur: approach, vol: 0.16, filter: "lowpass", freq: 350, delay: d});
                tone(ctx, out, {freq: 1800, toFreq: 1600, dur: 1.2, vol: 0.03, type: "sine", delay: d + approach});
                burst(ctx, out, {dur: 1.8, vol: 0.2, filter: "lowpass", freq: 500, delay: d + approach + 1.2});
            });
            every(ctx, C, 5000, 9000, (d) => {
                burst(ctx, out, {dur: 0.6, vol: 0.04, filter: "highpass", freq: 3000, delay: d});
            });
        },
    },
    {
        id: "harbor-docks",
        label: "Harbor docks",
        category: "Places",
        hint: "Water lapping against hulls with rope creaks",
        recipe: (ctx, out, C) => {
            const water = noiseSrc(ctx, "brown", C);
            const wg = gainNode(ctx, 0.25);
            water.connect(filt(ctx, "bandpass", 400, 0.9)).connect(wg).connect(out);
            paramLfo(ctx, C, wg.gain, 0.12, 0.12);
            every(ctx, C, 5000, 12000, (d) => {
                tone(ctx, out, {
                    freq: rnd(130, 170),
                    toFreq: rnd(90, 110),
                    dur: rnd(0.4, 0.7),
                    vol: 0.028,
                    type: "sawtooth",
                    delay: d
                });
            });
        },
    },
    {
        id: "airport-terminal",
        label: "Airport terminal",
        category: "Places",
        hint: "Crowd murmur with PA chimes and rolling luggage",
        recipe: (ctx, out, C) => {
            const crowd = noiseSrc(ctx, "brown", C);
            const cg = gainNode(ctx, 0.28);
            crowd.connect(filt(ctx, "bandpass", 400, 0.7)).connect(cg).connect(out);
            paramLfo(ctx, C, cg.gain, 0.16, 0.1);
            every(ctx, C, 15000, 30000, (d) => {
                tone(ctx, out, {freq: 880, dur: 0.35, vol: 0.045, delay: d});
                tone(ctx, out, {freq: 660, dur: 0.35, vol: 0.045, delay: d + 0.4});
                tone(ctx, out, {freq: 880, dur: 0.45, vol: 0.045, delay: d + 0.8});
            });
            every(ctx, C, 4000, 10000, (d) => {
                for (let i = 0; i < 4; i++) {
                    burst(ctx, out, {dur: 0.03, vol: 0.02, filter: "bandpass", freq: 900, q: 2, delay: d + i * 0.09});
                }
            });
        },
    },
    {
        id: "museum-gallery",
        label: "Museum gallery",
        category: "Places",
        hint: "Marble halls — sparse footsteps and a lofty hush",
        recipe: (ctx, out, C) => {
            const hall = noiseSrc(ctx, "brown", C);
            hall.connect(filt(ctx, "lowpass", 800)).connect(gainNode(ctx, 0.07)).connect(out);
            every(ctx, C, 6000, 14000, (d) => {
                for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
                    burst(ctx, out, {
                        dur: 0.09,
                        vol: rnd(0.05, 0.08),
                        filter: "lowpass",
                        freq: 280,
                        delay: d + i * rnd(0.55, 0.8)
                    });
                }
            });
            every(ctx, C, 9000, 18000, (d) => {
                const f = rnd(1500, 2600);
                tone(ctx, out, {freq: f, dur: 0.1, vol: 0.015, delay: d});
            });
        },
    },
    {
        id: "night-market",
        label: "Night market",
        category: "Places",
        hint: "A busy street market — chatter, wok clangs, sizzle",
        recipe: (ctx, out, C) => {
            const bustle = noiseSrc(ctx, "brown", C);
            const bg = gainNode(ctx, 0.3);
            bustle.connect(filt(ctx, "bandpass", 550, 0.8)).connect(bg).connect(out);
            paramLfo(ctx, C, bg.gain, 0.3, 0.12);
            every(ctx, C, 2500, 6000, (d) => {
                tone(ctx, out, {freq: rnd(1800, 2800), dur: 0.07, vol: rnd(0.03, 0.06), type: "triangle", delay: d});
            });
            every(ctx, C, 4000, 9000, (d) => {
                burst(ctx, out, {
                    dur: rnd(0.3, 0.5),
                    vol: rnd(0.05, 0.08),
                    filter: "bandpass",
                    freq: 3800,
                    q: 0.7,
                    delay: d
                });
            });
        },
    },
    {
        id: "rooftop-evening",
        label: "Rooftop evening",
        category: "Places",
        hint: "A quiet roof above the city hum",
        recipe: (ctx, out, C) => {
            const city = noiseSrc(ctx, "brown", C);
            city.connect(filt(ctx, "lowpass", 250)).connect(gainNode(ctx, 0.3)).connect(out);
            const air = noiseSrc(ctx, "pink", C);
            air.connect(filt(ctx, "bandpass", 650, 0.6)).connect(gainNode(ctx, 0.12)).connect(out);
            every(ctx, C, 20000, 40000, (d) => {
                tone(ctx, out, {freq: 700, toFreq: 900, dur: 1.6, vol: 0.02, delay: d});
                tone(ctx, out, {freq: 900, toFreq: 700, dur: 1.6, vol: 0.02, delay: d + 1.8});
            });
        },
    },
    {
        id: "monastery-courtyard",
        label: "Monastery courtyard",
        category: "Places",
        hint: "A cloister fountain, doves and a far-off bell",
        recipe: (ctx, out, C) => {
            const fountain = noiseSrc(ctx, "brown", C);
            fountain.connect(filt(ctx, "bandpass", 600, 1)).connect(gainNode(ctx, 0.18)).connect(out);
            every(ctx, C, 5000, 9000, (d) => {
                tone(ctx, out, {freq: 470, toFreq: 385, dur: 0.35, vol: 0.04, delay: d});
            });
            every(ctx, C, 30000, 60000, (d) => {
                tone(ctx, out, {freq: 440, dur: 6, vol: 0.05, delay: d});
                tone(ctx, out, {freq: 660, dur: 5, vol: 0.03, delay: d + 0.02});
            });
        },
    },

    /* ── Urban & Machines (new category) ───────────────────────────── */
    {
        id: "city-rain-street",
        label: "Rain on a city street",
        category: "Urban & Machines",
        hint: "Rain over wet asphalt with traffic wash behind",
        recipe: (ctx, out, C) => {
            const rain = noiseSrc(ctx, "white", C);
            rain.connect(filt(ctx, "highpass", 500)).connect(filt(ctx, "lowpass", 5000)).connect(gainNode(ctx, 0.5)).connect(out);
            const traffic = noiseSrc(ctx, "brown", C);
            traffic.connect(filt(ctx, "lowpass", 350)).connect(gainNode(ctx, 0.2)).connect(out);
            every(ctx, C, 4000, 9000, (d) => {
                burst(ctx, out, {
                    dur: rnd(0.15, 0.3),
                    vol: rnd(0.06, 0.1),
                    filter: "bandpass",
                    freq: rnd(900, 1400),
                    q: 1,
                    delay: d
                });
            });
        },
    },
    {
        id: "traffic-hum",
        label: "Traffic hum",
        category: "Urban & Machines",
        hint: "Dense flowing traffic, heard from a few floors up",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 300)).connect(gainNode(ctx, 0.45)).connect(out);
            const band = noiseSrc(ctx, "brown", C);
            band.connect(filt(ctx, "bandpass", 150, 2)).connect(gainNode(ctx, 0.25)).connect(out);
            every(ctx, C, 6000, 12000, (d) => {
                burst(ctx, out, {
                    dur: rnd(1.5, 2.5),
                    vol: rnd(0.07, 0.11),
                    filter: "bandpass",
                    freq: 900,
                    q: 0.8,
                    delay: d
                });
            });
        },
    },
    {
        id: "construction-site",
        label: "Construction site",
        category: "Urban & Machines",
        hint: "Hammering, drills and crane machinery at work",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 450)).connect(gainNode(ctx, 0.15)).connect(out);
            every(ctx, C, 1000, 3000, (d) => {
                burst(ctx, out, {dur: 0.03, vol: rnd(0.12, 0.2), filter: "highpass", freq: 2500, delay: d});
                tone(ctx, out, {freq: 180, toFreq: 120, dur: 0.1, vol: 0.08, delay: d});
            });
            every(ctx, C, 8000, 15000, (d) => {
                for (let i = 0; i < 25; i++) {
                    burst(ctx, out, {
                        dur: 0.012,
                        vol: rnd(0.04, 0.07),
                        filter: "bandpass",
                        freq: 1600,
                        q: 2,
                        delay: d + i * 0.035
                    });
                }
            });
        },
    },
    {
        id: "printer-dot-matrix",
        label: "Dot-matrix printer",
        category: "Urban & Machines",
        hint: "A retro line printer buzzing through a report",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sawtooth", 120, 0.012);
            every(ctx, C, 1000, 2500, (d) => {
                const chars = 8 + Math.floor(Math.random() * 10);
                for (let i = 0; i < chars; i++) {
                    burst(ctx, out, {
                        dur: 0.02,
                        vol: rnd(0.04, 0.08),
                        filter: "highpass",
                        freq: 2000,
                        delay: d + i * 0.028
                    });
                }
                burst(ctx, out, {dur: 0.25, vol: 0.03, filter: "lowpass", freq: 1200, delay: d + chars * 0.028});
            });
        },
    },
    {
        id: "computer-fans",
        label: "Computer fans",
        category: "Urban & Machines",
        hint: "A workstation cooling itself under a desk",
        recipe: (ctx, out, C) => {
            const fans = noiseSrc(ctx, "white", C);
            const fg = gainNode(ctx, 0.18);
            fans.connect(filt(ctx, "lowpass", 1800)).connect(fg).connect(out);
            paramLfo(ctx, C, fg.gain, 0.02, 0.03);
            drone(ctx, out, C, "sine", 120, 0.02);
            every(ctx, C, 7000, 15000, (d) => {
                burst(ctx, out, {dur: 0.02, vol: 0.05, filter: "bandpass", freq: 3600, q: 5, delay: d});
            });
        },
    },
    {
        id: "server-room",
        label: "Server room",
        category: "Urban & Machines",
        hint: "Racks and racks of fans, endlessly humming",
        recipe: (ctx, out, C) => {
            const dense = noiseSrc(ctx, "white", C);
            dense.connect(filt(ctx, "lowpass", 2500)).connect(gainNode(ctx, 0.25)).connect(out);
            const warm = noiseSrc(ctx, "pink", C);
            warm.connect(filt(ctx, "lowpass", 800)).connect(gainNode(ctx, 0.15)).connect(out);
            drone(ctx, out, C, "sine", 95, 0.02);
            drone(ctx, out, C, "sine", 96, 0.02);
        },
    },
    {
        id: "factory-floor",
        label: "Factory floor",
        category: "Urban & Machines",
        hint: "Presses, conveyors and clanking metal rhythm",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sawtooth", 75, 0.04);
            const air = noiseSrc(ctx, "white", C);
            air.connect(filt(ctx, "highpass", 4000)).connect(gainNode(ctx, 0.02)).connect(out);
            every(ctx, C, 520, 560, (d) => {
                tone(ctx, out, {freq: 240, toFreq: 180, dur: 0.09, vol: 0.06, type: "square", delay: d});
                burst(ctx, out, {dur: 0.05, vol: 0.05, filter: "bandpass", freq: 2800, q: 3, delay: d + 0.01});
            });
        },
    },
    {
        id: "wind-turbine",
        label: "Wind turbine",
        category: "Urban & Machines",
        hint: "A giant blade sweeping around, whoosh after whoosh",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 60, 0.03);
            every(ctx, C, 2200, 2300, (d) => {
                burst(ctx, out, {dur: 1.1, vol: 0.14, filter: "bandpass", freq: 700, q: 1, delay: d});
                burst(ctx, out, {dur: 0.8, vol: 0.08, filter: "bandpass", freq: 1200, q: 1.2, delay: d + 0.6});
            });
        },
    },
    {
        id: "steam-locomotive",
        label: "Steam locomotive",
        category: "Urban & Machines",
        hint: "Chuffing rhythm, rail clacks and steam hiss",
        recipe: (ctx, out, C) => {
            const hiss = noiseSrc(ctx, "white", C);
            hiss.connect(filt(ctx, "highpass", 2500)).connect(gainNode(ctx, 0.03)).connect(out);
            every(ctx, C, 520, 620, (d) => {
                for (let i = 0; i < 4; i++) {
                    burst(ctx, out, {
                        dur: rnd(0.1, 0.14),
                        vol: rnd(0.12, 0.18),
                        filter: "lowpass",
                        freq: 1200,
                        delay: d + i * rnd(0.12, 0.15)
                    });
                }
            });
            every(ctx, C, 30000, 60000, (d) => {
                const t0 = ctx.currentTime + d;
                const o = ctx.createOscillator();
                o.type = "sine";
                o.frequency.setValueAtTime(620, t0);
                const vib = ctx.createOscillator();
                vib.frequency.value = 5.5;
                const vibG = ctx.createGain();
                vibG.gain.value = 12;
                vib.connect(vibG).connect(o.frequency);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, t0);
                g.gain.linearRampToValueAtTime(0.05, t0 + 0.2);
                g.gain.setValueAtTime(0.05, t0 + 1.1);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
                o.connect(g).connect(out);
                o.start(t0);
                vib.start(t0);
                o.stop(t0 + 1.7);
                vib.stop(t0 + 1.7);
            });
        },
    },
    {
        id: "car-wash",
        label: "Car wash",
        category: "Urban & Machines",
        hint: "Spinning brushes and water spray all around the car",
        recipe: (ctx, out, C) => {
            const spray = noiseSrc(ctx, "white", C);
            spray.connect(filt(ctx, "highpass", 1500)).connect(filt(ctx, "lowpass", 6000)).connect(gainNode(ctx, 0.18)).connect(out);
            const brush = noiseSrc(ctx, "white", C);
            const bp = filt(ctx, "bandpass", 900, 1.5);
            brush.connect(bp).connect(gainNode(ctx, 0.1)).connect(out);
            paramLfo(ctx, C, bp.frequency, 3.5, 250);
            every(ctx, C, 4000, 8000, (d) => {
                burst(ctx, out, {dur: rnd(0.8, 1.4), vol: rnd(0.06, 0.1), filter: "lowpass", freq: 800, delay: d});
            });
        },
    },

    /* ── Noise & Tones (additions) ──────────────────────────────────── */
    {
        id: "am-radio-static",
        label: "AM radio static",
        category: "Noise & Tones",
        hint: "Between stations — crackle, whistles and carrier hum",
        recipe: (ctx, out, C) => {
            const stat = noiseSrc(ctx, "white", C);
            stat.connect(filt(ctx, "bandpass", 2000, 0.3)).connect(gainNode(ctx, 0.3)).connect(out);
            drone(ctx, out, C, "sine", 900, 0.008);
            every(ctx, C, 300, 1500, (d) => {
                burst(ctx, out, {dur: rnd(0.01, 0.04), vol: rnd(0.05, 0.15), filter: "highpass", freq: 2500, delay: d});
            });
            const whistle = drone(ctx, out, C, "sine", 3000, 0.015);
            paramLfo(ctx, C, whistle.gain, 0.07, 0.012);
        },
    },
    {
        id: "shortwave-radio",
        label: "Shortwave radio",
        category: "Noise & Tones",
        hint: "Heterodyne squeals and distant number-station beeps",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "white", C);
            bed.connect(filt(ctx, "bandpass", 3000, 0.4)).connect(gainNode(ctx, 0.15)).connect(out);
            every(ctx, C, 2000, 5000, (d) => {
                const seq = 2 + Math.floor(Math.random() * 4);
                for (let i = 0; i < seq; i++) {
                    tone(ctx, out, {
                        freq: pick([600, 750, 900, 1050]),
                        dur: 0.22,
                        vol: 0.05,
                        type: "sine",
                        delay: d + i * 0.3
                    });
                }
            });
            every(ctx, C, 3000, 7000, (d) => {
                tone(ctx, out, {freq: rnd(1400, 2400), toFreq: rnd(800, 1600), dur: 0.5, vol: 0.02, delay: d});
            });
        },
    },
    {
        id: "geiger-counter",
        label: "Geiger counter",
        category: "Noise & Tones",
        hint: "Random clicks over a faint radiation hiss",
        recipe: (ctx, out, C) => {
            const hiss = noiseSrc(ctx, "white", C);
            hiss.connect(filt(ctx, "highpass", 5000)).connect(gainNode(ctx, 0.02)).connect(out);
            every(ctx, C, 200, 2000, (d) => {
                burst(ctx, out, {dur: 0.004, vol: 0.16, filter: "highpass", freq: 5000, delay: d});
            });
        },
    },
    {
        id: "tuning-fork",
        label: "Tuning fork",
        category: "Noise & Tones",
        hint: "A 440 Hz A, struck softly now and then",
        recipe: (ctx, out, C) => {
            const main = drone(ctx, out, C, "sine", 440, 0.09);
            drone(ctx, out, C, "sine", 880, 0.015);
            paramLfo(ctx, C, main.gain, 0.05, 0.015);
            every(ctx, C, 20000, 30000, (d) => {
                burst(ctx, out, {dur: 0.03, vol: 0.05, filter: "bandpass", freq: 440, q: 6, delay: d});
            });
        },
    },
    {
        id: "vinyl-crackle",
        label: "Vinyl crackle",
        category: "Noise & Tones",
        hint: "A well-loved record — surface noise and warm pops",
        recipe: (ctx, out, C) => {
            const surface = noiseSrc(ctx, "pink", C);
            surface.connect(filt(ctx, "lowpass", 7000)).connect(gainNode(ctx, 0.04)).connect(out);
            every(ctx, C, 150, 800, (d) => {
                burst(ctx, out, {
                    dur: rnd(0.006, 0.014),
                    vol: rnd(0.04, 0.14),
                    filter: "highpass",
                    freq: 3000,
                    delay: d
                });
            });
        },
    },
    {
        id: "tape-hiss",
        label: "Tape hiss",
        category: "Noise & Tones",
        hint: "Cassette deck rolling — hiss with a touch of wow",
        recipe: (ctx, out, C) => {
            const hiss = noiseSrc(ctx, "white", C);
            const hg = gainNode(ctx, 0.12);
            hiss.connect(filt(ctx, "highpass", 3000)).connect(filt(ctx, "lowpass", 9000)).connect(hg).connect(out);
            paramLfo(ctx, C, hg.gain, 0.5, 0.012);
            drone(ctx, out, C, "sine", 38, 0.015);
        },
    },
    {
        id: "fluorescent-lamp",
        label: "Fluorescent lamp",
        category: "Noise & Tones",
        hint: "That buzzing ceiling tube everyone tries to ignore",
        recipe: (ctx, out, C) => {
            // Sawtooth through a lowpass = the Hz mains buzz.
            const lp = filt(ctx, "lowpass", 600);
            const src = ctx.createOscillator();
            src.type = "sawtooth";
            src.frequency.value = 100;
            const g = gainNode(ctx, 0.028);
            src.connect(lp).connect(g).connect(out);
            src.start();
            C(() => {
                try {
                    src.stop();
                } catch { /* already stopped */
                }
            });
            paramLfo(ctx, C, g.gain, 0.13, 0.006);
            every(ctx, C, 3000, 9000, (d) => {
                burst(ctx, out, {dur: 0.015, vol: 0.03, filter: "bandpass", freq: 2400, q: 4, delay: d});
            });
        },
    },
    {
        id: "binaural-beat",
        label: "Binaural beat",
        category: "Noise & Tones",
        hint: "200 + 204 Hz — a slow 4 Hz theta pulsation",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 200, 0.06);
            drone(ctx, out, C, "sine", 204, 0.06);
            const bed = noiseSrc(ctx, "pink", C);
            bed.connect(filt(ctx, "lowpass", 500)).connect(gainNode(ctx, 0.04)).connect(out);
        },
    },

    /* ── Space & Sci-Fi (new category) ─────────────────────────────── */
    {
        id: "reactor-core",
        label: "Reactor core",
        category: "Space & Sci-Fi",
        hint: "A starship reactor pulsing behind bulkheads",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 40, 0.12);
            const res = noiseSrc(ctx, "brown", C);
            const rg = gainNode(ctx, 0.25);
            res.connect(filt(ctx, "bandpass", 90, 6)).connect(rg).connect(out);
            paramLfo(ctx, C, rg.gain, 0.25, 0.15);
            const coolant = noiseSrc(ctx, "white", C);
            coolant.connect(filt(ctx, "bandpass", 2600, 2)).connect(gainNode(ctx, 0.015)).connect(out);
        },
    },
    {
        id: "warp-idle",
        label: "Warp idle",
        category: "Space & Sci-Fi",
        hint: "The engine holding at station-keeping — detuned and restless",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sawtooth", 110, 0.028);
            drone(ctx, out, C, "sawtooth", 113, 0.028);
            const whine = drone(ctx, out, C, "sine", 1200, 0.012);
            paramLfo(ctx, C, whine.gain, 0.13, 0.008);
            const bed = noiseSrc(ctx, "brown", C);
            bed.connect(filt(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.08)).connect(out);
        },
    },
    {
        id: "nebula-drone",
        label: "Nebula drone",
        category: "Space & Sci-Fi",
        hint: "An airy, shifting pad floating through colored gas",
        recipe: (ctx, out, C) => {
            const freqs = [220, 275, 330];
            for (const f of freqs) {
                const g = drone(ctx, out, C, "sine", f, 0.035);
                paramLfo(ctx, C, g.gain, rnd(0.02, 0.06), 0.02);
            }
            const air = noiseSrc(ctx, "white", C);
            air.connect(filt(ctx, "highpass", 6000)).connect(gainNode(ctx, 0.008)).connect(out);
        },
    },
    {
        id: "radar-sweep",
        label: "Radar sweep",
        category: "Space & Sci-Fi",
        hint: "A scanning beam pinging into the distance",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 55, 0.02);
            every(ctx, C, 3000, 3100, (d) => {
                tone(ctx, out, {freq: 1500, dur: 0.08, vol: 0.1, delay: d});
                tone(ctx, out, {freq: 1500, dur: 0.06, vol: 0.03, delay: d + 0.16});
                tone(ctx, out, {freq: 1500, dur: 0.04, vol: 0.012, delay: d + 0.28});
            });
        },
    },
    {
        id: "comms-beeps",
        label: "Comms chatter",
        category: "Space & Sci-Fi",
        hint: "Console beeps and squelch from a busy comm station",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "white", C);
            bed.connect(filt(ctx, "bandpass", 2500, 0.5)).connect(gainNode(ctx, 0.02)).connect(out);
            every(ctx, C, 2000, 6000, (d) => {
                const seq = 2 + Math.floor(Math.random() * 4);
                for (let i = 0; i < seq; i++) {
                    tone(ctx, out, {
                        freq: rnd(600, 950),
                        toFreq: rnd(500, 1000),
                        dur: 0.1,
                        vol: 0.05,
                        type: "square",
                        delay: d + i * 0.16
                    });
                }
                burst(ctx, out, {dur: 0.06, vol: 0.02, filter: "bandpass", freq: 1800, q: 2, delay: d});
            });
        },
    },
    {
        id: "droid-beeps",
        label: "Droid beeps",
        category: "Space & Sci-Fi",
        hint: "An excitable little robot chirping to itself",
        recipe: (ctx, out, C) => {
            every(ctx, C, 1500, 4000, (d) => {
                const mood = Math.random();
                if (mood < 0.4) {
                    tone(ctx, out, {freq: rnd(800, 1200), toFreq: rnd(1400, 2000), dur: 0.18, vol: 0.06, delay: d});
                } else if (mood < 0.7) {
                    for (let i = 0; i < 4; i++) {
                        tone(ctx, out, {
                            freq: rnd(700, 1900),
                            dur: 0.07,
                            vol: 0.05,
                            type: "square",
                            delay: d + i * 0.1
                        });
                    }
                } else {
                    tone(ctx, out, {freq: rnd(1600, 2200), toFreq: rnd(500, 900), dur: 0.3, vol: 0.05, delay: d});
                }
            });
        },
    },
    {
        id: "hangar-ambience",
        label: "Hangar ambience",
        category: "Space & Sci-Fi",
        hint: "A vast deck — distant machinery and hydraulic hisses",
        recipe: (ctx, out, C) => {
            const hall = noiseSrc(ctx, "brown", C);
            hall.connect(filt(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.3)).connect(out);
            drone(ctx, out, C, "sine", 50, 0.03);
            every(ctx, C, 10000, 20000, (d) => {
                burst(ctx, out, {dur: rnd(1.2, 2.2), vol: rnd(0.06, 0.1), filter: "highpass", freq: 2000, delay: d});
            });
            every(ctx, C, 6000, 14000, (d) => {
                burst(ctx, out, {dur: 0.1, vol: 0.05, filter: "lowpass", freq: 300, delay: d});
            });
        },
    },
    {
        id: "shuttle-cabin",
        label: "Shuttle cabin",
        category: "Space & Sci-Fi",
        hint: "Small-ship interior — hum, air recycler, rare console blip",
        recipe: (ctx, out, C) => {
            drone(ctx, out, C, "sine", 90, 0.05);
            const air = noiseSrc(ctx, "white", C);
            const ag = gainNode(ctx, 0.08);
            air.connect(filt(ctx, "lowpass", 1200)).connect(ag).connect(out);
            paramLfo(ctx, C, ag.gain, 0.08, 0.02);
            every(ctx, C, 9000, 18000, (d) => {
                tone(ctx, out, {freq: pick([1046, 1318, 1568]), dur: 0.12, vol: 0.03, delay: d});
            });
        },
    },
    {
        id: "black-hole-drone",
        label: "Black hole drone",
        category: "Space & Sci-Fi",
        hint: "An immense, slow mass bending everything around it",
        recipe: (ctx, out, C) => {
            const src = noiseSrc(ctx, "brown", C);
            const lp = filt(ctx, "lowpass", 120);
            const g = gainNode(ctx, 0.8);
            src.connect(lp).connect(g).connect(out);
            paramLfo(ctx, C, lp.frequency, 0.012, 40);
            drone(ctx, out, C, "sine", 30, 0.05);
            drone(ctx, out, C, "sine", 31, 0.05);
        },
    },

    /* ── Rhythmic & Tonal (additions) ──────────────────────────────── */
    {
        id: "hang-drum",
        label: "Hang drum",
        category: "Rhythmic & Tonal",
        hint: "Handpan taps in a slow, meditative pattern",
        recipe: (ctx, out, C) => {
            const scale = [220, 261.63, 311.13, 349.23, 440];
            every(ctx, C, 1500, 4000, (d) => {
                const f = pick(scale);
                tone(ctx, out, {freq: f, dur: 1.6, vol: 0.1, delay: d});
                tone(ctx, out, {freq: f * 2.76, dur: 0.9, vol: 0.02, delay: d});
                burst(ctx, out, {dur: 0.03, vol: 0.03, filter: "bandpass", freq: f * 3, q: 3, delay: d});
            });
        },
    },
    {
        id: "kalimba",
        label: "Kalimba",
        category: "Rhythmic & Tonal",
        hint: "Thumb-piano plucks wandering a pentatonic scale",
        recipe: (ctx, out, C) => {
            const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
            every(ctx, C, 800, 2000, (d) => {
                const f = pick(scale);
                tone(ctx, out, {freq: f, dur: 0.9, vol: 0.09, type: "triangle", delay: d});
                tone(ctx, out, {freq: f * 2, dur: 0.5, vol: 0.02, type: "sine", delay: d});
            });
        },
    },
    {
        id: "wind-chimes",
        label: "Wind chimes",
        category: "Rhythmic & Tonal",
        hint: "Gusts stirring clusters of tubular chimes",
        recipe: (ctx, out, C) => {
            const breeze = noiseSrc(ctx, "pink", C);
            const bg = gainNode(ctx, 0.12);
            breeze.connect(filt(ctx, "lowpass", 900)).connect(bg).connect(out);
            paramLfo(ctx, C, bg.gain, 0.04, 0.08);
            const chimes = [1174.66, 1318.51, 1567.98, 1760, 2093];
            every(ctx, C, 4000, 12000, (d) => {
                const cluster = 4 + Math.floor(Math.random() * 6);
                for (let i = 0; i < cluster; i++) {
                    tone(ctx, out, {freq: pick(chimes), dur: rnd(2, 4), vol: 0.04, delay: d + i * rnd(0.1, 0.3)});
                }
            });
        },
    },
    {
        id: "temple-bells",
        label: "Temple bells",
        category: "Rhythmic & Tonal",
        hint: "Far temple bells rolling over a mountain valley",
        recipe: (ctx, out, C) => {
            const air = noiseSrc(ctx, "pink", C);
            air.connect(filt(ctx, "lowpass", 600)).connect(gainNode(ctx, 0.08)).connect(out);
            every(ctx, C, 8000, 18000, (d) => {
                const partials: Array<[number, number]> = [
                    [196, 0.05], [294.5, 0.03], [396, 0.02], [522, 0.012],
                ];
                for (const [f, v] of partials) {
                    tone(ctx, out, {freq: f, dur: rnd(6, 9), vol: v, delay: d});
                }
            });
        },
    },
    {
        id: "deep-gong",
        label: "Deep gong",
        category: "Rhythmic & Tonal",
        hint: "One enormous gong, struck sparingly",
        recipe: (ctx, out, C) => {
            every(ctx, C, 12000, 25000, (d) => {
                const partials: Array<[number, number]> = [
                    [60, 0.09], [90, 0.06], [120.5, 0.04], [151, 0.025], [189, 0.015],
                ];
                for (const [f, v] of partials) {
                    tone(ctx, out, {freq: f, dur: rnd(8, 12), vol: v, delay: d});
                }
                burst(ctx, out, {dur: 0.05, vol: 0.05, filter: "lowpass", freq: 800, delay: d});
            });
        },
    },
    {
        id: "lo-fi-beat",
        label: "Lo-fi beat",
        category: "Rhythmic & Tonal",
        hint: "Dusty kick, soft snare and vinyl warmth at ~66 bpm",
        recipe: (ctx, out, C) => {
            const surface = noiseSrc(ctx, "pink", C);
            surface.connect(filt(ctx, "lowpass", 6000)).connect(gainNode(ctx, 0.03)).connect(out);
            const bpm = 66;
            const beat = 60000 / bpm;
            every(ctx, C, beat - 4, beat + 4, (d) => {
                tone(ctx, out, {freq: 90, toFreq: 40, dur: 0.15, vol: 0.3, delay: d});
                burst(ctx, out, {
                    dur: 0.12,
                    vol: 0.08,
                    filter: "bandpass",
                    freq: 1800,
                    q: 1,
                    delay: d + beat / 2 / 1000
                });
                burst(ctx, out, {dur: 0.01, vol: 0.04, filter: "highpass", freq: 3500, delay: d + rnd(0, 0.3)});
            });
            every(ctx, C, beat * 2 - 8, beat * 2 + 8, (d) => {
                const chord = pick([
                    [261.63, 329.63, 392.0],
                    [220.0, 261.63, 329.63],
                ]);
                for (const f of chord) {
                    tone(ctx, out, {freq: f, dur: 0.9, vol: 0.035, type: "triangle", delay: d});
                }
            });
        },
    },
    {
        id: "synth-pad",
        label: "Synth pad",
        category: "Rhythmic & Tonal",
        hint: "A warm chord pad breathing through a slow filter",
        recipe: (ctx, out, C) => {
            const chords = [
                [174.61, 220, 261.63],
                [164.81, 196, 246.94],
                [146.83, 174.61, 220],
            ];
            let chordIndex = 0;
            every(ctx, C, 12000, 12200, (d) => {
                chordIndex = (chordIndex + 1) % chords.length;
                const chord = chords[chordIndex];
                for (const f of chord) {
                    tone(ctx, out, {freq: f, dur: 12, vol: 0.035, type: "sawtooth", delay: d});
                }
                tone(ctx, out, {freq: chord[0] / 2, dur: 12, vol: 0.03, type: "sine", delay: d});
            });
        },
    },
    {
        id: "ocean-drum",
        label: "Ocean drum",
        category: "Rhythmic & Tonal",
        hint: "Beads sloshing in a frame drum, wave after wave",
        recipe: (ctx, out, C) => {
            const bed = noiseSrc(ctx, "brown", C);
            const bg = gainNode(ctx, 0.15);
            bed.connect(filt(ctx, "lowpass", 600)).connect(bg).connect(out);
            every(ctx, C, 2500, 4000, (d) => {
                const beads = 22 + Math.floor(Math.random() * 18);
                for (let i = 0; i < beads; i++) {
                    burst(ctx, out, {
                        dur: 0.006,
                        vol: rnd(0.015, 0.035),
                        filter: "highpass",
                        freq: 4200,
                        delay: d + i * rnd(0.03, 0.07)
                    });
                }
            });
        },
    },
    {
        id: "taiko-drum",
        label: "Taiko drum",
        category: "Rhythmic & Tonal",
        hint: "Big deep drums struck with ceremony",
        recipe: (ctx, out, C) => {
            const hall = noiseSrc(ctx, "brown", C);
            hall.connect(filt(ctx, "lowpass", 500)).connect(gainNode(ctx, 0.1)).connect(out);
            every(ctx, C, 1800, 2300, (d) => {
                tone(ctx, out, {freq: 65, toFreq: 40, dur: 0.42, vol: 0.4, delay: d});
                burst(ctx, out, {dur: 0.05, vol: 0.1, filter: "bandpass", freq: 900, q: 1.5, delay: d});
                if (Math.random() < 0.3) {
                    tone(ctx, out, {freq: 62, toFreq: 38, dur: 0.35, vol: 0.28, delay: d + 0.45});
                }
            });
        },
    },
];

export const AMBIENT_CATEGORIES: AmbientCategoryId[] = [
    "Rain & Water",
    "Fire & Air",
    "Nature",
    "Places",
    "Urban & Machines",
    "Noise & Tones",
    "Space & Sci-Fi",
    "Rhythmic & Tonal",
];

/** Metadata-only list (for menus / settings UI). */
export const AMBIENT_TRACKS: AmbientTrackMeta[] = TRACKS.map(({recipe: _recipe, ...meta}) => meta);
export const AMBIENT_TRACK_COUNT = TRACKS.length;

const TRACK_MAP = new Map<string, AmbientTrackDef>(TRACKS.map((t) => [t.id, t]));

export function ambientTracksByCategory(): Array<{
    category: AmbientCategoryId;
    tracks: AmbientTrackMeta[];
}> {
    return AMBIENT_CATEGORIES.map((category) => ({
        category,
        tracks: AMBIENT_TRACKS.filter((t) => t.category === category),
    }));
}

export function ambientTrackMeta(id: string): AmbientTrackMeta | undefined {
    return TRACK_MAP.get(id);
}

/* ================================================================== */
/*  The engine (module singleton)                                      */
/* ================================================================== */

const masterCurve = (v: number) => Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.4) * 0.9;
const trackCurve = (v: number) => Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6) * 0.55;

class AmbientEngine {
    running = false;
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private tracks = new Map<string, { gain: GainNode; handle: TrackHandle }>();
    /** Guards the auto-resume listeners so stop can take them down. */
    private resumeGuards: Array<() => void> = [];

    /** Create the context (must derive from a user gesture). */
    start(masterVol: number): boolean {
        if (this.running) {
            this.applyMaster(masterVol);
            return true;
        }
        try {
            const Ctor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return false;
            const ctx = new Ctor();
            void ctx.resume().catch(() => {
            });
            this.ctx = ctx;
            this.master = ctx.createGain();
            this.master.gain.value = masterVol;
            this.master.connect(ctx.destination);
            this.running = true;
            this.armResumeGuards(ctx);
            return true;
        } catch {
            return false;
        }
    }

    applyMaster(v01: number): void {
        if (this.master && this.ctx) {
            this.master.gain.setTargetAtTime(v01, this.ctx.currentTime, 0.1);
        }
    }

    /** Build (or re-volume) one track. Safe to call repeatedly. */
    ensureTrack(id: string, vol01: number): void {
        if (!this.ctx || !this.master) return;
        const existing = this.tracks.get(id);
        if (existing) {
            existing.gain.gain.setTargetAtTime(vol01, this.ctx.currentTime, 0.12);
            return;
        }
        const def = TRACK_MAP.get(id);
        if (!def) return;
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.master);
        const cleanups: Array<() => void> = [];
        try {
            def.recipe(this.ctx, gain, (fn) => cleanups.push(fn));
        } catch {
            try {
                gain.disconnect();
            } catch { /* dead node */
            }
            return;
        }
        gain.gain.setTargetAtTime(vol01, this.ctx.currentTime, 0.12);
        this.tracks.set(id, {
            gain,
            handle: {
                stop: () => {
                    for (const fn of cleanups) {
                        try {
                            fn();
                        } catch { /* double stop */
                        }
                    }
                    try {
                        gain.disconnect();
                    } catch { /* dead node */
                    }
                },
            },
        });
    }

    /** Fade one track out, then dispose its node graph. */
    removeTrack(id: string): void {
        const t = this.tracks.get(id);
        if (!t || !this.ctx) return;
        t.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
        const handle = t.handle;
        this.tracks.delete(id);
        window.setTimeout(() => handle.stop(), 350);
    }

    stop(): void {
        if (!this.ctx) return;
        const ctx = this.ctx;
        for (const g of this.resumeGuards) {
            try {
                g();
            } catch { /* dead listener */
            }
        }
        this.resumeGuards = [];
        try {
            this.master?.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        } catch { /* closing */
        }
        const handles = Array.from(this.tracks.values()).map((t) => t.handle);
        this.tracks.clear();
        window.setTimeout(() => {
            for (const h of handles) {
                try {
                    h.stop();
                } catch { /* double stop */
                }
            }
            void ctx.close().catch(() => {
            });
        }, 350);
        this.running = false;
        this.ctx = null;
        this.master = null;
    }

    /** "Endless" insurance: browsers/OSes can suspend a running
     * AudioContext (Bluetooth device switch, OS power saving, tab
     * freeze-then-thaw…). A suspended context = every loop and every
     * scheduled event stops SILENTLY — exactly the "sound stopped"
     * failure. Two cheap guards heal it: one on the
     * context's own statechange, one when the page becomes visible
     * again (a background tab often returns with a suspended context). */
    private armResumeGuards(ctx: AudioContext): void {
        const tryResume = () => {
            if (!this.running) return;
            if (ctx.state === "suspended") void ctx.resume().catch(() => {
            });
        };
        ctx.addEventListener("statechange", tryResume);
        const onVisible = () => {
            if (document.visibilityState === "visible") tryResume();
        };
        document.addEventListener("visibilitychange", onVisible);
        this.resumeGuards.push(() => {
            ctx.removeEventListener("statechange", tryResume);
            document.removeEventListener("visibilitychange", onVisible);
        });
    }
}

const engine = new AmbientEngine();

/* ================================================================== */
/*  Persisted state + pub/sub                                          */
/* ================================================================== */

const AMBIENT_KEY = `${STORAGE_PREFIX}.ambient`;
const DEFAULT_STATE: AmbientState = {on: false, master: 70, vols: {}};

let state: AmbientState = {...DEFAULT_STATE};
let hydrated = false;
const listeners = new Set<(s: AmbientSnapshot) => void>();

function hydrate(): void {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;
    try {
        const raw = window.localStorage.getItem(AMBIENT_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<AmbientState>;
            state = {
                on: !!parsed.on,
                master: typeof parsed.master === "number" ? Math.max(0, Math.min(100, parsed.master)) : DEFAULT_STATE.master,
                vols:
                    parsed.vols && typeof parsed.vols === "object"
                        ? Object.fromEntries(
                            Object.entries(parsed.vols)
                                .filter(([id, v]) => typeof v === "number" && TRACK_MAP.has(id))
                                .map(([id, v]) => [id, Math.max(0, Math.min(100, v as number))])
                        )
                        : {},
            };
        }
    } catch { /* corrupted — defaults */
    }
    // A persisted `on: true` cannot start audio without a gesture — arm
    // a one-time listener on the first pointer/key interaction instead.
    if (state.on) armGestureResume();
}

function persist(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(AMBIENT_KEY, JSON.stringify(state));
    } catch { /* quota — ignore */
    }
}

function snapshot(): AmbientSnapshot {
    return {
        ...state,
        running: engine.running,
        activeCount: Object.values(state.vols).filter((v) => v > 0).length,
    };
}

function publish(): void {
    const snap = snapshot();
    for (const l of listeners) l(snap);
}

function armGestureResume(): void {
    const resume = () => {
        if (state.on && !engine.running) {
            if (engine.start(masterCurve(state.master))) {
                for (const [id, v] of Object.entries(state.vols)) {
                    if (v > 0) engine.ensureTrack(id, trackCurve(v));
                }
                publish();
            }
        }
        if (engine.running || !state.on) {
            window.removeEventListener("pointerdown", resume);
            window.removeEventListener("keydown", resume);
        }
    };
    window.addEventListener("pointerdown", resume, {passive: true});
    window.addEventListener("keydown", resume);
}

export function subscribeAmbient(cb: (s: AmbientSnapshot) => void): () => void {
    hydrate();
    listeners.add(cb);
    cb(snapshot());
    return () => listeners.delete(cb);
}

/** React hook — live ambient state for menus / settings / the widget. */
export function useAmbientState(): AmbientSnapshot {
    const [snap, setSnap] = React.useState<AmbientSnapshot>(() => {
        hydrate();
        return snapshot();
    });
    React.useEffect(() => subscribeAmbient(setSnap), []);
    return snap;
}

export function getAmbientState(): AmbientSnapshot {
    hydrate();
    return snapshot();
}

/* ================================================================== */
/* Controls (all safe to call from user gestures only — they start */
/*  the engine, which is why they are invoked from click handlers)    */
/* ================================================================== */

/** The default volume a track gets when toggled on without one. */
export const AMBIENT_DEFAULT_TRACK_VOL = 45;

/**
 * Master on/off. Returns false when WebAudio is unavailable (caller
 * may toast). With `next` omitted it toggles.
 */
export function toggleAmbient(next?: boolean): boolean {
    hydrate();
    const target = next ?? !state.on;
    if (target) {
        if (!engine.start(masterCurve(state.master))) return false;
        state.on = true;
        const active = Object.entries(state.vols).filter(([, v]) => v > 0);
        if (active.length === 0) {
            // Nothing in the mix yet — a gentle default so "on" is audible.
            state.vols = {...state.vols, rain: 40};
            engine.ensureTrack("rain", trackCurve(40));
        } else {
            for (const [id, v] of active) engine.ensureTrack(id, trackCurve(v));
        }
    } else {
        engine.stop();
        state.on = false;
    }
    persist();
    publish();
    return true;
}

/** Master volume 0–100 (applies live). */
export function setAmbientMaster(v: number): void {
    hydrate();
    state.master = Math.max(0, Math.min(100, Math.round(v)));
    if (state.on) engine.applyMaster(masterCurve(state.master));
    persist();
    publish();
}

/**
 * Set one track's volume 0–100 (0 removes it). Enabling a track while
 * the engine is off turns the engine on (the call site is a gesture).
 * Returns false when audio could not start.
 */
export function setAmbientTrack(id: string, v: number): boolean {
    hydrate();
    const vol = Math.max(0, Math.min(100, Math.round(v)));
    if (!TRACK_MAP.has(id)) return true;
    const next = {...state.vols};
    if (vol > 0) {
        if (state.on && !engine.running) {
            if (!engine.start(masterCurve(state.master))) return false;
        } else if (!state.on) {
            if (!engine.start(masterCurve(state.master))) return false;
            state.on = true;
        }
        next[id] = vol;
        state.vols = next;
        engine.ensureTrack(id, trackCurve(vol));
    } else {
        delete next[id];
        state.vols = next;
        engine.removeTrack(id);
    }
    persist();
    publish();
    return true;
}

/** Toggle one track between 0 and the default volume. */
export function toggleAmbientTrack(id: string): boolean {
    hydrate();
    const cur = state.vols[id] ?? 0;
    return setAmbientTrack(id, cur > 0 ? 0 : AMBIENT_DEFAULT_TRACK_VOL);
}

/** Remove every track from the mix (engine keeps running if on). */
export function clearAmbientTracks(): void {
    hydrate();
    for (const [id, v] of Object.entries(state.vols)) {
        if (v > 0) engine.removeTrack(id);
    }
    state.vols = {};
    persist();
    publish();
}
