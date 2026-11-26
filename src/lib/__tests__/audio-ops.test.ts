import {describe, expect, it} from "vitest";
import {
    audioLevels,
    audioLevelsAll,
    audioStatsReport,
    dbFromLinear,
    encodeWav,
    fadeEnvelopeAt,
    linearFromDb,
    waveformPeaks,
} from "../audio-ops";

describe("db conversions", () => {
    it("maps the anchor amplitudes", () => {
        expect(dbFromLinear(1)).toBeCloseTo(0, 6);
        expect(dbFromLinear(0.5)).toBeCloseTo(-6.0206, 4);
        expect(dbFromLinear(0.1)).toBeCloseTo(-20, 6);
        expect(linearFromDb(0)).toBeCloseTo(1, 9);
        expect(linearFromDb(-6.0206)).toBeCloseTo(0.5, 6);
        expect(linearFromDb(-20)).toBeCloseTo(0.1, 9);
    });
    it("floors silence at -120 dB instead of -Infinity", () => {
        expect(dbFromLinear(0)).toBe(-120);
        expect(dbFromLinear(-Infinity)).toBe(-120);
        expect(dbFromLinear(1e-13)).toBe(-120);
    });
    it("round-trips through the pair", () => {
        for (const db of [-1.5, -6, -12, -30, -60]) {
            expect(dbFromLinear(linearFromDb(db))).toBeCloseTo(db, 6);
        }
    });
});

describe("audioLevels", () => {
    it("computes peak and rms of a known signal", () => {
        // +1, -0.5, +0.5, 0 → peak 1, rms sqrt((1+0.25+0.25+0)/4)=sqrt(0.375)
        const d = new Float32Array([1, -0.5, 0.5, 0]);
        const {peak, rms} = audioLevels(d);
        expect(peak).toBeCloseTo(1, 6);
        expect(rms).toBeCloseTo(Math.sqrt(0.375), 6);
    });
    it("handles empty channels", () => {
        const {peak, rms} = audioLevels(new Float32Array(0));
        expect(peak).toBe(0);
        expect(rms).toBe(0);
    });
    it("audioLevelsAll takes the loudest peak across channels", () => {
        const left = new Float32Array([0.25, -0.25]);
        const right = new Float32Array([0.9, -0.1]);
        const {peak} = audioLevelsAll([left, right]);
        expect(peak).toBeCloseTo(0.9, 6);
    });
});

describe("fadeEnvelopeAt", () => {
    it("is 1 everywhere without fades", () => {
        for (const t of [0, 0.5, 1, 5]) expect(fadeEnvelopeAt(t, 0, 0, 5)).toBe(1);
    });
    it("ramps 0→1 across the fade-in window", () => {
        expect(fadeEnvelopeAt(0, 2, 0, 10)).toBe(0);
        expect(fadeEnvelopeAt(1, 2, 0, 10)).toBeCloseTo(0.5, 6);
        expect(fadeEnvelopeAt(2, 2, 0, 10)).toBe(1);
        expect(fadeEnvelopeAt(5, 2, 0, 10)).toBe(1);
    });
    it("ramps 1→0 across the fade-out window", () => {
        expect(fadeEnvelopeAt(9, 0, 2, 10)).toBeCloseTo(0.5, 6);
        expect(fadeEnvelopeAt(10, 0, 2, 10)).toBe(0);
        expect(fadeEnvelopeAt(4, 0, 2, 10)).toBe(1);
    });
    it("combines in and out without overlap", () => {
        const g = (t: number) => fadeEnvelopeAt(t, 2, 2, 10);
        expect(g(1)).toBeCloseTo(0.5, 6);
        expect(g(5)).toBe(1);
        expect(g(9)).toBeCloseTo(0.5, 6);
    });
    it("clamps overlapping fades (in wins the head, out keeps the tail)", () => {
        // fadeIn+fadeOut > duration: fadeOut is clamped to dur - fadeIn.
        const g = (t: number) => fadeEnvelopeAt(t, 8, 8, 10);
        expect(g(0)).toBe(0);
        expect(g(4)).toBeCloseTo(0.5, 6);
        expect(g(8)).toBe(1);
        expect(g(10)).toBe(0);
    });
    it("survives a zero-length buffer", () => {
        expect(fadeEnvelopeAt(0, 1, 1, 0)).toBe(1);
    });
});

describe("waveformPeaks", () => {
    it("returns per-bucket min/max of a sine-ish signal", () => {
        // 10 frames, 5 buckets → exactly 2 frames per bucket.
        const d = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5, 0, 0.2]);
        const {min, max} = waveformPeaks([d], 5);
        expect(min).toHaveLength(5);
        expect(max).toHaveLength(5);
        expect(max[0]).toBeCloseTo(0.5, 6); // {0, 0.5}
        expect(min[0]).toBeCloseTo(0, 6);
        expect(max[1]).toBeCloseTo(1, 6); // {1, 0.5}
        expect(min[2]).toBeCloseTo(-0.5, 6); // {0, -0.5}
        expect(min[3]).toBeCloseTo(-1, 6); // {-1, -0.5}
        expect(max[4]).toBeCloseTo(0.2, 6); // {0, 0.2}
    });
    it("stereo keeps the loudest side per bucket", () => {
        const left = new Float32Array([0.1]);
        const right = new Float32Array([0.8]);
        const {max} = waveformPeaks([left, right], 1);
        expect(max[0]).toBeCloseTo(0.8, 6);
    });
    it("degenerates safely on empty input", () => {
        const {min, max} = waveformPeaks([], 4);
        expect(min).toEqual([0, 0, 0, 0]);
        expect(max).toEqual([0, 0, 0, 0]);
        const zero = waveformPeaks([new Float32Array(0)], 4);
        expect(zero.min).toEqual([0, 0, 0, 0]);
    });
});

describe("encodeWav", () => {
    it("writes a spec-correct RIFF/WAVE header for mono", () => {
        const bytes = encodeWav([new Float32Array([0, 0.5])], 44100);
        const str = (o: number, n: number) => String.fromCharCode(...bytes.slice(o, o + n));
        expect(str(0, 4)).toBe("RIFF");
        expect(bytes.length).toBe(48); // 44 + 2 frames × 2 bytes
        expect(bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)).toBe(36 + 4);
        expect(str(8, 4)).toBe("WAVE");
        expect(str(12, 4)).toBe("fmt ");
        expect(bytes[16] | (bytes[17] << 8) | (bytes[18] << 16) | (bytes[19] << 24)).toBe(16);
        expect(bytes[20] | (bytes[21] << 8)).toBe(1); // PCM
        expect(bytes[22] | (bytes[23] << 8)).toBe(1); // mono
        expect(bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24)).toBe(44100);
        expect(bytes[28] | (bytes[29] << 8) | (bytes[30] << 16) | (bytes[31] << 24)).toBe(88200); // byte rate
        expect(bytes[32] | (bytes[33] << 8)).toBe(2); // block align
        expect(bytes[34] | (bytes[35] << 8)).toBe(16); // bits
        expect(str(36, 4)).toBe("data");
        expect(bytes[40] | (bytes[41] << 8) | (bytes[42] << 16) | (bytes[43] << 24)).toBe(4);
    });
    it("interleaves stereo frames little-endian", () => {
        const bytes = encodeWav(
            [new Float32Array([1, -1]), new Float32Array([0.5, 0])],
            8000
        );
        // frame 0: L=1 → 32767, R=0.5 → 16383(ish); frame 1: L=-1 → -32768, R=0
        const s16 = (o: number) => (bytes[o] | (bytes[o + 1] << 8)) << 16 >> 16;
        expect(s16(44)).toBe(32767);
        expect(s16(46)).toBe(Math.round(0.5 * 32767));
        expect(s16(48)).toBe(-32768);
        expect(s16(50)).toBe(0);
    });
    it("clamps out-of-range samples instead of wrapping", () => {
        const bytes = encodeWav([new Float32Array([2, -2])], 8000);
        const s16 = (o: number) => (bytes[o] | (bytes[o + 1] << 8)) << 16 >> 16;
        expect(s16(44)).toBe(32767);
        expect(s16(46)).toBe(-32768);
    });
    it("rejects empty and mismatched channel sets", () => {
        expect(() => encodeWav([], 8000)).toThrow(/no channels/);
        expect(() => encodeWav([new Float32Array(2), new Float32Array(3)], 8000)).toThrow(/mismatch/);
    });
});

describe("audioStatsReport", () => {
    it("lists the honest numbers with aligned padding", () => {
        const r = audioStatsReport({
            name: "tone.wav",
            type: "audio/wav",
            bytes: 44100,
            duration: 1,
            channels: 2,
            sampleRate: 22050,
            peakDb: -0.1,
            rmsDb: -12.5,
        });
        expect(r).toContain("tone.wav");
        expect(r).toContain("2");
        expect(r).toContain("22050 Hz");
        expect(r).toContain("352.8 kbps"); // 44100*8/1/1000
        expect(r).toContain("-0.1 dBFS");
        expect(r.split("\n")).toHaveLength(9);
    });
});
