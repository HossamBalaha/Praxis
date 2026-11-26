/**
 * tests for the PURE helpers in
 * src/lib/image-ops.ts — tone ops, kernels, pixel loops, ASCII ramps,
 * histogram/palette quantization, geometry math and the EXIF parser.
 * Reference values (Rec. 709 luma, kernel sums, crafted EXIF bytes)
 * are cross-checked against the underlying standards.
 */
import {describe, expect, it} from "vitest";
import {
    asciiFromRaster,
    aspectRatioFraction,
    clamp,
    clampRect,
    convolveRaster,
    cssFilterString,
    dominantColor,
    EDGE_KERNEL,
    EMBOSS_KERNEL,
    formatBytes,
    formatExifReport,
    gcd,
    grainRaster,
    grayscaleRaster,
    histogramFromRaster,
    histogramText,
    imageInfoReport,
    invertRaster,
    luminance,
    makeRaster,
    mulberry32,
    paletteFromRaster,
    parseExif,
    pixelateRaster,
    posterizeRaster,
    posterizeValue,
    type Raster,
    rgbToHex,
    sharpenKernel,
    solarizeRaster,
    solarizeValue,
    thresholdRaster,
    thresholdValue,
    vignetteGain,
    vignetteRaster,
    watermarkAnchor,
} from "../image-ops";

/* ─── scalar math ───────────────────────────────────────────────── */

describe("clamp / gcd / luminance / hex", () => {
    it("clamps into [min, max]", () => {
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
        expect(clamp(5, 0, 10)).toBe(5);
    });
    it("gcd reduces exactly", () => {
        expect(gcd(1920, 1080)).toBe(120);
        expect(gcd(100, 100)).toBe(100);
        expect(gcd(7, 13)).toBe(1);
    });
    it("Rec. 709 luma matches known values", () => {
        expect(luminance(255, 255, 255)).toBe(255);
        expect(luminance(0, 0, 0)).toBe(0);
        expect(luminance(255, 0, 0)).toBe(54);
        expect(luminance(0, 255, 0)).toBe(182);
        expect(luminance(0, 0, 255)).toBe(18);
    });
    it("rgbToHex pads and clamps", () => {
        expect(rgbToHex(255, 0, 16)).toBe("#ff0010");
        expect(rgbToHex(0, 128, 255)).toBe("#0080ff");
        expect(rgbToHex(300, -1, 0)).toBe("#ff0000");
    });
});

describe("formatBytes / aspectRatioFraction", () => {
    it("humanizes byte counts", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(1023)).toBe("1023 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
        expect(formatBytes(-1)).toBe("—");
    });
    it("reduces clean ratios, decimals for odd ones", () => {
        expect(aspectRatioFraction(1920, 1080)).toBe("16:9");
        expect(aspectRatioFraction(100, 100)).toBe("1:1");
        expect(aspectRatioFraction(1366, 768)).toBe("1.78:1");
        expect(aspectRatioFraction(0, 0)).toBe("—");
    });
});

/* ─── CSS filter string ─────────────────────────────────────────── */

describe("cssFilterString", () => {
    it("emits each active filter in canonical order", () => {
        expect(cssFilterString({blur: 8})).toBe("blur(8px)");
        expect(cssFilterString({brightness: 120, contrast: 130})).toBe("brightness(120%) contrast(130%)");
        expect(cssFilterString({grayscale: 100})).toBe("grayscale(100%)");
        expect(cssFilterString({hueRotate: 90})).toBe("hue-rotate(90deg)");
        expect(cssFilterString({opacity: 60, saturate: 160})).toContain("opacity(60%)");
    });
    it("skips neutral values and returns none when idle", () => {
        expect(cssFilterString({})).toBe("none");
        expect(cssFilterString({brightness: 100, blur: 0, grayscale: 0})).toBe("none");
    });
});

/* ─── tone ops ──────────────────────────────────────────────────── */

describe("tone ops", () => {
    it("posterizeValue quantizes into levels", () => {
        expect(posterizeValue(64, 4)).toBeCloseTo(85, 0);
        expect(posterizeValue(128, 4)).toBeCloseTo(170, 0);
        expect(posterizeValue(200, 2)).toBe(255);
        expect(posterizeValue(100, 2)).toBe(0);
    });
    it("solarizeValue flips only above the threshold", () => {
        expect(solarizeValue(100, 128)).toBe(100);
        expect(solarizeValue(200, 128)).toBe(55);
        expect(solarizeValue(128, 128)).toBe(128);
    });
    it("thresholdValue cuts hard at the threshold", () => {
        expect(thresholdValue(127, 128)).toBe(0);
        expect(thresholdValue(128, 128)).toBe(255);
    });
});

/* ─── raster pixel loops ────────────────────────────────────────── */

describe("raster ops", () => {
    it("makeRaster fills every pixel", () => {
        const r = makeRaster(3, 2, [10, 20, 30, 255]);
        expect(r.data.length).toBe(24);
        expect(r.data[4]).toBe(10);
        expect(r.data[7]).toBe(255);
    });
    it("thresholdRaster binarizes via luma", () => {
        const r = makeRaster(2, 1, [10, 10, 10, 255]);
        r.data.set([240, 240, 240, 255], 4);
        const out = thresholdRaster(r, 128);
        expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
        expect([...out.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
    });
    it("invertRaster and grayscaleRaster behave", () => {
        const r = makeRaster(1, 1, [255, 0, 0, 255]);
        expect([...invertRaster(r).data.slice(0, 3)]).toEqual([0, 255, 255]);
        expect([...grayscaleRaster(r).data.slice(0, 3)]).toEqual([54, 54, 54]);
    });
    it("solarizeRaster / posterizeRaster map per channel", () => {
        const r = makeRaster(1, 1, [200, 64, 128, 255]);
        expect([...solarizeRaster(r, 128).data.slice(0, 3)]).toEqual([55, 64, 128]);
        expect([...posterizeRaster(r, 2).data.slice(0, 3)]).toEqual([255, 0, 255]);
    });
    it("pixelateRaster copies each block's center sample", () => {
        const r = makeRaster(4, 4, [0, 0, 255, 255]);
        const i = (1 * 4 + 1) * 4; // pixel (1,1)
        r.data.set([255, 0, 0, 255], i);
        const out = pixelateRaster(r, 2);
        // block (0,0) covers pixels (0..1, 0..1) — all become the center sample (1,1)
        for (const [x, y] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ]) {
            const j = (y * 4 + x) * 4;
            expect([...out.data.slice(j, j + 3)]).toEqual([255, 0, 0]);
        }
        // block (0,2) center is (3,1) — still blue
        const j = (1 * 4 + 3) * 4;
        expect([...out.data.slice(j, j + 3)]).toEqual([0, 0, 255]);
    });
    it("mulberry32 is deterministic and in range", () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        const c = mulberry32(7);
        const seqA = [a(), a(), a()];
        const seqB = [b(), b(), b()];
        const seqC = [c(), c(), c()];
        expect(seqA).toEqual(seqB);
        expect(seqA).not.toEqual(seqC);
        expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    });
    it("grainRaster: amount 0 is identity, same seed repeats, values stay in range", () => {
        const r = makeRaster(8, 8, [128, 128, 128, 255]);
        expect([...grainRaster(r, 0, 1).data]).toEqual([...r.data]);
        const g1 = grainRaster(r, 40, 99);
        const g2 = grainRaster(r, 40, 99);
        expect([...g1.data]).toEqual([...g2.data]);
        expect([...g1.data].every((v) => v >= 0 && v <= 255)).toBe(true);
        expect([...g1.data]).not.toEqual([...r.data]);
    });
    it("vignette darkens corners, not the center", () => {
        expect(vignetteGain(0, 0, 0.5)).toBe(1);
        expect(vignetteGain(1, 1, 0.5)).toBeCloseTo(0.5, 6);
        const r = makeRaster(64, 64, [255, 255, 255, 255]);
        const out = vignetteRaster(r, 0.8);
        const center = (32 * 64 + 32) * 4;
        const corner = 0;
        expect(out.data[center]).toBeGreaterThan(out.data[corner]);
        expect(out.data[center]).toBe(255);
    });
});

describe("kernels", () => {
    it("sum to the right values", () => {
        expect(EMBOSS_KERNEL.reduce((a, b) => a + b, 0)).toBe(1);
        expect(EDGE_KERNEL.reduce((a, b) => a + b, 0)).toBe(0);
        expect(sharpenKernel(100).reduce((a, b) => a + b, 0)).toBe(1);
        expect(sharpenKernel(0)[4]).toBe(1);
    });
    it("convolution leaves uniform areas untouched (emboss/sharpen)", () => {
        const r = makeRaster(5, 5, [100, 100, 100, 255]);
        expect([...convolveRaster(r, EMBOSS_KERNEL).data]).toEqual([...r.data]);
        expect([...convolveRaster(r, sharpenKernel(80)).data]).toEqual([...r.data]);
    });
    it("edge detection goes black on uniform, lights up on contrast", () => {
        const uniform = makeRaster(5, 5, [100, 100, 100, 255]);
        const flat = convolveRaster(uniform, EDGE_KERNEL, {gray: true, abs: true});
        expect(flat.data[0]).toBe(0);
        const r = makeRaster(5, 5, [0, 0, 0, 255]);
        for (let y = 0; y < 5; y++) for (let x = 2; x < 5; x++) r.data[(y * 5 + x) * 4] = 255;
        const edges = convolveRaster(r, EDGE_KERNEL, {gray: true, abs: true});
        expect(edges.data[(2 * 5 + 2) * 4]).toBeGreaterThan(0);
    });
});

/* ─── geometry ──────────────────────────────────────────────────── */

describe("geometry", () => {
    it("clampRect pulls the rect inside the image", () => {
        expect(clampRect(-5, -5, 999, 999, 100, 100)).toEqual({x: 0, y: 0, w: 100, h: 100});
        expect(clampRect(10, 20, 50, 60, 100, 100)).toEqual({x: 10, y: 20, w: 50, h: 60});
        expect(clampRect(90, 90, 50, 50, 100, 100)).toEqual({x: 90, y: 90, w: 10, h: 10});
    });
    it("watermarkAnchor places the 9-grid positions", () => {
        expect(watermarkAnchor(100, 100, 40, 10, "top-left", 5)).toEqual({x: 5, y: 5});
        expect(watermarkAnchor(100, 100, 40, 10, "bottom-right", 5)).toEqual({x: 55, y: 85});
        expect(watermarkAnchor(100, 100, 40, 10, "center", 5)).toEqual({x: 30, y: 45});
    });
});

/* ─── analysis ──────────────────────────────────────────────────── */

describe("asciiFromRaster", () => {
    it("maps white to the ramp end and black to the start", () => {
        const white = asciiFromRaster(makeRaster(8, 2, [255, 255, 255, 255]), 8, " .oO@");
        const black = asciiFromRaster(makeRaster(8, 2, [0, 0, 0, 255]), 8, " .oO@");
        expect(white.split("\n")[0]).toBe("@@@@@@@@");
        expect(black.split("\n")[0]).toBe("        ");
    });
    it("invert flips the ramp", () => {
        const out = asciiFromRaster(makeRaster(8, 2, [255, 255, 255, 255]), 8, " .oO@", true);
        expect(out.split("\n")[0]).toBe("        ");
    });
    it("respects the requested width", () => {
        const out = asciiFromRaster(makeRaster(64, 8, [128, 128, 128, 255]), 20);
        expect(out.split("\n")[0]).toHaveLength(20);
    });
});

describe("histogram", () => {
    it("buckets black and white correctly", () => {
        const r = makeRaster(2, 1, [0, 0, 0, 255]);
        r.data.set([255, 255, 255, 255], 4);
        const h = histogramFromRaster(r, 16);
        expect(h.r[0]).toBe(1);
        expect(h.r[15]).toBe(1);
        expect(h.lum.reduce((a, b) => a + b, 0)).toBe(2);
    });
    it("renders a text table with a pixel total", () => {
        const r = makeRaster(4, 1, [10, 20, 30, 255]);
        const t = histogramText(histogramFromRaster(r, 4));
        expect(t).toContain("bucket");
        expect(t).toContain("pixels: 4");
    });
});

describe("palette / dominant color", () => {
    it("pure colors survive quantization exactly", () => {
        const p = paletteFromRaster(makeRaster(4, 4, [255, 0, 0, 255]), 3);
        expect(p).toHaveLength(1);
        expect(p[0].hex).toBe("#ff0000");
        expect(p[0].share).toBe(1);
        expect(p[0].name).toBe("red");
    });
    it("mixed halves report both with 50% share", () => {
        const r = makeRaster(2, 1, [255, 0, 0, 255]);
        r.data.set([0, 0, 255, 255], 4);
        const p = paletteFromRaster(r, 2);
        expect(p).toHaveLength(2);
        expect(p.every((e) => Math.abs(e.share - 0.5) < 1e-9)).toBe(true);
        expect(p.map((e) => e.hex).sort()).toEqual(["#0000ff", "#ff0000"]);
    });
    it("dominantColor picks the most common", () => {
        const d = dominantColor(makeRaster(2, 1, [0, 255, 0, 255]));
        expect(d.hex).toBe("#00ff00");
        expect(d.name).toBe("lime");
    });
});

describe("imageInfoReport", () => {
    it("reports dimensions, megapixels, ratio and orientation", () => {
        const t = imageInfoReport({name: "photo.jpg", width: 1920, height: 1080, bytes: 2_500_000, type: "image/jpeg"});
        expect(t).toContain("photo.jpg");
        expect(t).toContain("1920 × 1080 px");
        expect(t).toContain("2.07 MP");
        expect(t).toContain("16:9");
        expect(t).toContain("landscape");
        expect(t).toContain("2.38 MB");
    });
});

/* ─── EXIF parser ───────────────────────────────────────────────── */

/** A minimal, hand-crafted JPEG: SOI + APP1/Exif (II, Orientation=6, Make="TestCam"). */
function buildExifJpeg(): Uint8Array {
    const tiff = new Uint8Array(46);
    const v = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49], 0); // "II" little-endian
    v.setUint16(2, 0x2a, true); // TIFF magic
    v.setUint32(4, 8, true); // IFD0 offset
    v.setUint16(8, 2, true); // two entries
    // entry 1 — Orientation (0x0112), SHORT, inline value 6
    v.setUint16(10, 0x0112, true);
    v.setUint16(12, 3, true);
    v.setUint32(14, 1, true);
    v.setUint16(18, 6, true);
    // entry 2 — Make (0x010f), ASCII, 8 bytes at TIFF offset 38
    const makeOff = 38;
    v.setUint16(22, 0x010f, true);
    v.setUint16(24, 2, true);
    v.setUint32(26, 8, true);
    v.setUint32(30, makeOff, true);
    v.setUint32(34, 0, true); // next IFD = none
    const make = "TestCam\0";
    for (let i = 0; i < make.length; i++) tiff[makeOff + i] = make.charCodeAt(i);

    const payload = new Uint8Array(6 + tiff.length);
    payload.set([0x45, 0x78, 0x69, 0x66, 0, 0], 0); // "Exif\0\0"
    payload.set(tiff, 6);
    const segLen = payload.length + 2;
    const jpg = new Uint8Array(2 + 2 + segLen);
    jpg.set([0xff, 0xd8], 0); // SOI
    jpg.set([0xff, 0xe1], 2); // APP1
    jpg[4] = segLen >> 8;
    jpg[5] = segLen & 0xff;
    jpg.set(payload, 6);
    return jpg;
}

describe("parseExif", () => {
    it("parses a crafted APP1 segment (orientation + make)", () => {
        const res = parseExif(buildExifJpeg());
        expect(res.found).toBe(true);
        expect(res.orientation).toBe(6);
        const byLabel = new Map(res.entries.map((e) => [e.label, e.value]));
        expect(byLabel.get("Camera")).toBe("TestCam");
        expect(byLabel.get("Orientation")).toBe("6 (rotate 90° CW)");
    });
    it("is graceful for non-JPEG bytes", () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const res = parseExif(png);
        expect(res.found).toBe(false);
        expect(res.reason).toContain("not a JPEG");
        expect(formatExifReport(res, "pic.png")).toContain("no EXIF");
    });
    it("is graceful for JPEGs without EXIF", () => {
        const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
        const res = parseExif(jpg);
        expect(res.found).toBe(false);
        expect(res.reason).toContain("no EXIF APP1");
    });
    it("formats a readable report", () => {
        const res = parseExif(buildExifJpeg());
        const text = formatExifReport(res, "cam.jpg");
        expect(text).toContain("EXIF — cam.jpg");
        expect(text).toContain("TestCam");
    });
});

/* makeRaster satisfies the Raster contract (used by every loop above) */
describe("Raster type", () => {
    it("makeRaster returns a well-formed Raster", () => {
        const r: Raster = makeRaster(2, 3, [1, 2, 3, 4]);
        expect(r.width).toBe(2);
        expect(r.height).toBe(3);
        expect(r.data).toBeInstanceOf(Uint8ClampedArray);
        expect(r.data.length).toBe(24);
    });
});
