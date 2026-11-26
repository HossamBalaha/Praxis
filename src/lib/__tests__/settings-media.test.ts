/**
 * unit tests for the media playback default helpers in
 * src/lib/settings.ts:
 *   ▸ clampMediaPlaybackRate  (0.25–4, nullish/NaN → 1)
 *   ▸ clampMediaVolumePercent (0–100, nullish/NaN → 100)
 *   ▸ readMediaPlaybackDefaults (backward-compat defaults for missing
 *     keys + clamping of stale out-of-range stored values)
 *
 * Pure logic only — the node vitest environment is enough (the
 * arg-less readMediaPlaybackDefaults call hits the SSR guard in
 * loadSettings, which returns DEFAULT_SETTINGS without touching
 * localStorage).
 */
import {describe, expect, it} from "vitest";
import {
    clampMediaPlaybackRate,
    clampMediaVolumePercent,
    DEFAULT_SETTINGS,
    readMediaPlaybackDefaults,
    type Settings,
} from "@/lib/settings";

describe("clampMediaPlaybackRate", () => {
    it("passes through in-range rates untouched", () => {
        for (const r of [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]) {
            expect(clampMediaPlaybackRate(r)).toBe(r);
        }
    });

    it("clamps below-range rates up to 0.25", () => {
        expect(clampMediaPlaybackRate(0.1)).toBe(0.25);
        expect(clampMediaPlaybackRate(0)).toBe(0.25);
        expect(clampMediaPlaybackRate(-2)).toBe(0.25);
    });

    it("clamps above-range rates down to 4", () => {
        expect(clampMediaPlaybackRate(4.5)).toBe(4);
        expect(clampMediaPlaybackRate(10)).toBe(4);
        expect(clampMediaPlaybackRate(Number.MAX_SAFE_INTEGER)).toBe(4);
    });

    it("falls back to 1 for nullish / non-finite / garbage input", () => {
        expect(clampMediaPlaybackRate(null)).toBe(1);
        expect(clampMediaPlaybackRate(undefined)).toBe(1);
        expect(clampMediaPlaybackRate(Number.NaN)).toBe(1);
        expect(clampMediaPlaybackRate(Number.POSITIVE_INFINITY)).toBe(1);
        expect(clampMediaPlaybackRate(Number.NEGATIVE_INFINITY)).toBe(1);
        expect(clampMediaPlaybackRate("not a number")).toBe(1);
    });

    it("coerces numeric strings", () => {
        expect(clampMediaPlaybackRate("2")).toBe(2);
        expect(clampMediaPlaybackRate("0.5")).toBe(0.5);
        expect(clampMediaPlaybackRate("9")).toBe(4);
    });
});

describe("clampMediaVolumePercent", () => {
    it("passes through in-range percents untouched", () => {
        for (const v of [0, 25, 60, 100]) {
            expect(clampMediaVolumePercent(v)).toBe(v);
        }
    });

    it("clamps out-of-range percents into 0–100", () => {
        expect(clampMediaVolumePercent(-10)).toBe(0);
        expect(clampMediaVolumePercent(101)).toBe(100);
        expect(clampMediaVolumePercent(1_000_000)).toBe(100);
    });

    it("falls back to 100 for nullish / non-finite / garbage input", () => {
        expect(clampMediaVolumePercent(null)).toBe(100);
        expect(clampMediaVolumePercent(undefined)).toBe(100);
        expect(clampMediaVolumePercent(Number.NaN)).toBe(100);
        expect(clampMediaVolumePercent(Number.POSITIVE_INFINITY)).toBe(100);
        expect(clampMediaVolumePercent("loud")).toBe(100);
    });

    it("coerces numeric strings", () => {
        expect(clampMediaVolumePercent("40")).toBe(40);
        expect(clampMediaVolumePercent("300")).toBe(100);
    });
});

describe("readMediaPlaybackDefaults", () => {
    it("returns the documented defaults for DEFAULT_SETTINGS", () => {
        expect(readMediaPlaybackDefaults(DEFAULT_SETTINGS)).toEqual({
            playbackRate: 1,
            autoplay: false,
            volume: 100,
            loop: false,
        });
    });

    it("reads a fully-customized bundle through", () => {
        const s: Settings = {
            ...DEFAULT_SETTINGS,
            mediaDefaultPlaybackRate: 2,
            mediaAutoplay: true,
            mediaDefaultVolume: 40,
            mediaLoopByDefault: true,
        };
        expect(readMediaPlaybackDefaults(s)).toEqual({
            playbackRate: 2,
            autoplay: true,
            volume: 40,
            loop: true,
        });
    });

    it("fills backward-compat defaults when the keys are missing (older stored settings)", () => {
        const legacy = {
            ...DEFAULT_SETTINGS,
            mediaDefaultPlaybackRate: undefined,
            mediaAutoplay: undefined,
            mediaDefaultVolume: undefined,
            mediaLoopByDefault: undefined,
        } as unknown as Settings;
        expect(readMediaPlaybackDefaults(legacy)).toEqual({
            playbackRate: 1,
            autoplay: false,
            volume: 100,
            loop: false,
        });
    });

    it("clamps stale out-of-range stored values", () => {
        const s: Settings = {
            ...DEFAULT_SETTINGS,
            mediaDefaultPlaybackRate: 9,
            mediaDefaultVolume: -5,
        };
        const d = readMediaPlaybackDefaults(s);
        expect(d.playbackRate).toBe(4);
        expect(d.volume).toBe(0);
    });

    it("only treats explicit `true` as on for autoplay / loop (older stored `\"true\"` strings stay off)", () => {
        const s: Settings = {
            ...DEFAULT_SETTINGS,
            mediaAutoplay: "true" as unknown as boolean,
            mediaLoopByDefault: 1 as unknown as boolean,
        };
        const d = readMediaPlaybackDefaults(s);
        expect(d.autoplay).toBe(false);
        expect(d.loop).toBe(false);
    });

    it("reads from the (SSR-guarded) store when no settings object is passed", () => {
        // No `window` in the node test env → loadSettings returns
        // DEFAULT_SETTINGS without touching localStorage.
        expect(readMediaPlaybackDefaults()).toEqual({
            playbackRate: 1,
            autoplay: false,
            volume: 100,
            loop: false,
        });
    });
});
