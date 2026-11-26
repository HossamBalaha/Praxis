/**
 * tests for the PURE helpers in
 * src/lib/video-ops.ts — timecode parse/format round trips, clip
 * clamping, contact-sheet grid math, bitrate formatting and the
 * stats/data-URL-cap helpers.
 */
import {describe, expect, it} from "vitest";
import {
    clampClip,
    contactSheetLayout,
    dataUrlCapError,
    formatBitrate,
    formatTimecode,
    parseTimecode,
    sampleTimestamps,
    VIDEO_DATAURL_CAP,
    videoStatsReport,
} from "../video-ops";

describe("formatTimecode", () => {
    it("renders m:ss.cc under an hour", () => {
        expect(formatTimecode(83.45)).toBe("1:23.45");
        expect(formatTimecode(5)).toBe("0:05.00");
        expect(formatTimecode(0)).toBe("0:00.00");
        expect(formatTimecode(59.99)).toBe("0:59.99");
    });
    it("switches to h:mm:ss.cc at an hour", () => {
        expect(formatTimecode(3675.5)).toBe("1:01:15.50");
        expect(formatTimecode(3600)).toBe("1:00:00.00");
    });
    it("degrades gracefully for junk", () => {
        expect(formatTimecode(-1)).toBe("0:00.00");
        expect(formatTimecode(Number.NaN)).toBe("0:00.00");
    });
});

describe("parseTimecode", () => {
    it("accepts m:ss.f, h:mm:ss.f and plain seconds", () => {
        expect(parseTimecode("1:23.45")).toBe(83.45);
        expect(parseTimecode("01:02:03.4")).toBe(3723.4);
        expect(parseTimecode("83.5")).toBe(83.5);
        expect(parseTimecode("12")).toBe(12);
        expect(parseTimecode("0:05")).toBe(5);
    });
    it("rejects malformed input", () => {
        expect(parseTimecode("abc")).toBeNull();
        expect(parseTimecode("")).toBeNull();
        expect(parseTimecode("  ")).toBeNull();
        expect(parseTimecode("-5")).toBeNull();
        expect(parseTimecode("1:70")).toBeNull();
        expect(parseTimecode("1:2:3:4")).toBeNull();
        expect(parseTimecode("1.5.5")).toBeNull();
    });
    it("round-trips through formatTimecode", () => {
        expect(parseTimecode(formatTimecode(83.45))).toBe(83.45);
        expect(parseTimecode(formatTimecode(3723.4))).toBe(3723.4);
    });
});

describe("clampClip", () => {
    it("clamps out-of-range bounds into the duration", () => {
        expect(clampClip(-5, 100, 30)).toEqual({start: 0, end: 30, duration: 30});
        expect(clampClip(0, 30, 30)).toEqual({start: 0, end: 30, duration: 30});
        expect(clampClip(10, 50, 30)).toEqual({start: 10, end: 30, duration: 30});
    });
    it("rejects empty or reversed ranges", () => {
        expect(clampClip(10, 5, 20)).toBeNull();
        expect(clampClip(5, 5.01, 30)).toBeNull();
        expect(clampClip(0, 10, 0)).toBeNull();
    });
});

describe("contactSheetLayout", () => {
    it("defaults to a balanced grid", () => {
        const l = contactSheetLayout(12);
        expect(l.cols).toBe(4);
        expect(l.rows).toBe(3);
        expect(l.sheetW).toBe(4 * 320 + 5 * 8);
        expect(l.sheetH).toBe(3 * (180 + 18) + 4 * 8);
    });
    it("honors an explicit column count", () => {
        const l = contactSheetLayout(6, {cols: 2});
        expect(l.cols).toBe(2);
        expect(l.rows).toBe(3);
        expect(l.sheetW).toBe(2 * 320 + 3 * 8);
    });
    it("single frames make a one-cell sheet", () => {
        const l = contactSheetLayout(1);
        expect(l.rows).toBe(1);
        expect(l.sheetW).toBe(320 + 2 * 8);
        expect(l.sheetH).toBe(180 + 18 + 2 * 8);
    });
});

describe("sampleTimestamps", () => {
    it("spreads N midpoints across the duration", () => {
        expect(sampleTimestamps(10, 4)).toEqual([1.25, 3.75, 6.25, 8.75]);
        expect(sampleTimestamps(0, 4)).toEqual([]);
    });
});

describe("formatBitrate / videoStatsReport", () => {
    it("formats kbps below 1 Mbps and Mbps above", () => {
        expect(formatBitrate(500_000)).toBe("500 kbps");
        expect(formatBitrate(4_210_000)).toBe("4.21 Mbps");
        expect(formatBitrate(0)).toBe("—");
    });
    it("reports the facts, including the honest bitrate", () => {
        const t = videoStatsReport({
            name: "clip.mp4",
            type: "video/mp4",
            bytes: 25 * 1024 * 1024,
            duration: 83.45,
            width: 1920,
            height: 1080,
            frameRate: 30,
        });
        expect(t).toContain("clip.mp4");
        expect(t).toContain("1:23.45");
        expect(t).toContain("1920 × 1080 px");
        expect(t).toContain("16:9");
        expect(t).toContain("30 fps");
        expect(t).toContain("2,504 frames");
        expect(t).toContain("Mbps");
    });
});

describe("dataUrlCapError", () => {
    it("allows files under the cap and complains over it", () => {
        expect(dataUrlCapError(7 * 1024 * 1024)).toBeNull();
        const err = dataUrlCapError(9 * 1024 * 1024);
        expect(err).toBeTruthy();
        expect(err).toContain("cap");
        expect(err).toContain("9.00 MB");
        expect(VIDEO_DATAURL_CAP).toBe(8 * 1024 * 1024);
    });
});
