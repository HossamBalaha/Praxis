/**
 * pure audio math for the DEDICATED audio tools family.
 *
 * Audio tools, separate from the video tools and linked to the
 * audio files. Two consumers:
 *
 * ▸ components/audio-tools.tsx the inline audio PLAYER (waveform,
 * transport, A–B loop, level meter)
 * ▸ components/toolbox/audio-studio.tsx the "Audio studio" toolbox
 * suite (trim / fade / gain /
 * normalize / speed / WAV convert /
 * waveform PNG / metadata)
 *
 * Everything here is PURE (no DOM, no WebAudio) so it is unit-testable
 * in Node: the 16-bit PCM WAV encoder, dB conversions, level analysis,
 * the linear fade envelope and the per-bucket min/max waveform
 * reduction used to draw waveforms and waveform PNGs.
 */

/** A decoded audio buffer reduced to plain channel arrays. */
export interface DecodedAudio {
    channels: Float32Array[];
    sampleRate: number;
}

/* ── dB conversions ──────────────────────────────────────────────── */

/** Linear (0..1 amplitude) → dBFS. −Infinity floors at −120 dB. */
export function dbFromLinear(x: number): number {
    const a = Math.abs(x);
    if (!Number.isFinite(a) || a <= 1e-12) return -120;
    return Math.max(-120, 20 * Math.log10(a));
}

/** dBFS → linear amplitude. */
export function linearFromDb(db: number): number {
    if (!Number.isFinite(db)) return 1;
    return Math.pow(10, db / 20);
}

/* ── level analysis ─────────────────────────────────────────────── */

/** Peak + RMS of one channel, in linear amplitude (0..1). */
export function audioLevels(data: Float32Array): { peak: number; rms: number } {
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        sumSq += v * v;
    }
    const rms = data.length > 0 ? Math.sqrt(sumSq / data.length) : 0;
    return {peak, rms};
}

/** Peak + RMS across EVERY channel of a decoded buffer. */
export function audioLevelsAll(channels: Float32Array[]): { peak: number; rms: number } {
    let peak = 0;
    let sumSq = 0;
    let n = 0;
    for (const ch of channels) {
        const lv = audioLevels(ch);
        if (lv.peak > peak) peak = lv.peak;
        sumSq += lv.rms * lv.rms * ch.length;
        n += ch.length;
    }
    return {peak, rms: n > 0 ? Math.sqrt(sumSq / n) : 0};
}

/* ── fade envelope ───────────────────────────────────────────────── */

/**
 * The linear fade envelope used by the Fade tool and the inline
 * player's preview: 0 → 1 over `fadeIn` seconds at the start, 1 → 0
 * over `fadeOut` seconds at the end, 1 in between. Fades are clamped
 * so they never overlap (fadeIn + fadeOut ≤ duration) and never run
 * negative.
 */
export function fadeEnvelopeAt(t: number, fadeIn: number, fadeOut: number, duration: number): number {
    const dur = Math.max(0, duration);
    const fi = clamp(fadeIn, 0, dur);
    const fo = clamp(fadeOut, 0, dur - fi);
    if (t <= 0) return fi > 0 ? 0 : 1;
    if (t >= dur) return fo > 0 ? 0 : 1;
    if (fi > 0 && t < fi) return t / fi;
    if (fo > 0 && t > dur - fo) return Math.max(0, (dur - t) / fo);
    return 1;
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, x));
}

/* ── waveform reduction ──────────────────────────────────────────── */

/**
 * Reduce decoded channels to per-bucket min/max pairs (the classic
 * waveform-overview representation — ± around a midline). Mono uses
 * its own min/max; multi-channel reduces to the LOUDEST |value| per
 * side so stereo never hides a spike.
 */
export function waveformPeaks(
    channels: Float32Array[],
    buckets: number
): { min: number[]; max: number[] } {
    const B = Math.max(1, Math.floor(buckets));
    const min: number[] = new Array(B).fill(0);
    const max: number[] = new Array(B).fill(0);
    if (channels.length === 0) return {min, max};
    const frames = channels[0].length;
    if (frames === 0) return {min, max};
    const bucketSize = frames / B;
    for (let i = 0; i < B; i++) {
        const start = Math.floor(i * bucketSize);
        const end = Math.min(frames, Math.floor((i + 1) * bucketSize));
        let lo = 0;
        let hi = 0;
        for (const ch of channels) {
            for (let j = start; j < end; j++) {
                const v = ch[j] || 0;
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
        }
        min[i] = lo;
        max[i] = hi;
    }
    return {min, max};
}

/* ── 16-bit PCM WAV encoder ──────────────────────────────────────── */

/**
 * Encode channel arrays as a 16-bit little-endian PCM RIFF/WAVE file
 * (the universally decodable "convert anything → WAV" target):
 *
 *   RIFF ▸ WAVE ▸ "fmt " (16-byte PCM chunk: format 1, channels,
 *   sample rate, byte rate, block align, 16 bits) ▸ "data".
 *
 * Samples are clamped to [−1, 1] (fader/normalize math can overshoot
 * by rounding) and interleaved per frame.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
    if (channels.length === 0) throw new Error("encodeWav: no channels");
    const numChannels = channels.length;
    if (numChannels > 2) throw new Error("encodeWav: at most 2 channels are expected here");
    const frames = channels[0].length;
    for (let c = 1; c < numChannels; c++) {
        if (channels[c].length !== frames) {
            throw new Error("encodeWav: channel length mismatch");
        }
    }
    const sr = Math.max(1, Math.round(sampleRate));
    const blockAlign = numChannels * 2;
    const dataSize = frames * blockAlign;
    const out = new Uint8Array(44 + dataSize);

    const ascii = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
    };
    const u32 = (offset: number, v: number) => {
        out[offset] = v & 0xff;
        out[offset + 1] = (v >>> 8) & 0xff;
        out[offset + 2] = (v >>> 16) & 0xff;
        out[offset + 3] = (v >>> 24) & 0xff;
    };
    const u16 = (offset: number, v: number) => {
        out[offset] = v & 0xff;
        out[offset + 1] = (v >>> 8) & 0xff;
    };

    ascii(0, "RIFF");
    u32(4, 36 + dataSize); // rest-of-file size after this field
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    u32(16, 16); // PCM chunk size
    u16(20, 1); // audio format: PCM
    u16(22, numChannels);
    u32(24, sr);
    u32(28, sr * blockAlign); // byte rate
    u16(32, blockAlign);
    u16(34, 16); // bits per sample
    ascii(36, "data");
    u32(40, dataSize);

    let o = 44;
    for (let f = 0; f < frames; f++) {
        for (let c = 0; c < numChannels; c++) {
            const raw = channels[c][f] || 0;
            const clamped = raw < -1 ? -1 : raw > 1 ? 1 : raw;
            // Asymmetric int16 mapping: [-1, 1] → [-32768, 32767].
            const s = Math.round(clamped * (clamped < 0 ? 32768 : 32767));
            out[o] = s & 0xff;
            out[o + 1] = (s >> 8) & 0xff;
            o += 2;
        }
    }
    return out;
}

/* ── text report ─────────────────────────────────────────────────── */

/** The Audio studio "Metadata & levels" report (same shape as the
 *  Video studio's stats report — honest numbers only). */
export function audioStatsReport(i: {
    name: string;
    type: string;
    bytes: number;
    duration: number;
    channels: number;
    sampleRate: number;
    peakDb: number;
    rmsDb: number;
}): string {
    const kbps = i.duration > 0 ? (i.bytes * 8) / i.duration / 1000 : 0;
    const pad = (k: string, v: string) => `${k.padEnd(15, " ")}${v}`;
    return [
        pad("file", i.name),
        pad("type", i.type),
        pad("size", `${i.bytes} bytes (${(i.bytes / 1024).toFixed(1)} KB)`),
        pad("duration", `${i.duration.toFixed(3)} s (${i.duration.toFixed(1)} s)`),
        pad("channels", String(i.channels)),
        pad("sample rate", `${i.sampleRate} Hz`),
        pad("bitrate", `${kbps.toFixed(1)} kbps (size ÷ duration, container overhead included)`),
        pad("peak level", `${i.peakDb.toFixed(1)} dBFS`),
        pad("rms level", `${i.rmsDb.toFixed(1)} dBFS`),
    ].join("\n");
}
