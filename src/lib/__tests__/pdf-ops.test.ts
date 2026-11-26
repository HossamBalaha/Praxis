/**
 * tests for the PURE helpers in
 * src/lib/pdf-ops.ts — the page-range parser (the safety net under
 * every PDF page tool), metadata sanitizer, word-wrap, watermark
 * anchor math and report formatting. The pdf-lib wrappers themselves
 * are browser-facing and stay untested here by design.
 */
import {describe, expect, it} from "vitest";
import {
    fitFontSize,
    formatPageLabel,
    formatPdfInfo,
    normalizePdfName,
    PageRangeError,
    parseMoveCommand,
    parsePageRange,
    sanitizeMetadataValue,
    watermarkAnchorPdf,
    wrapTextToWidth,
} from "../pdf-ops";

describe("parsePageRange", () => {
    it("expands ranges and singles, deduped and sorted", () => {
        expect(parsePageRange("1-3,5,7-9", 9)).toEqual([1, 2, 3, 5, 7, 8, 9]);
        expect(parsePageRange(" 2 , 4 ", 9)).toEqual([2, 4]);
        expect(parsePageRange("1,1,2,2", 9)).toEqual([1, 2]);
        expect(parsePageRange("9", 9)).toEqual([9]);
        expect(parsePageRange("1 - 3", 9)).toEqual([1, 2, 3]);
    });
    it("bounds-checks against the page count", () => {
        expect(() => parsePageRange("1-3,5,7-9", 8)).toThrow(PageRangeError);
        expect(() => parsePageRange("1-3,5,7-9", 8)).toThrow(/out of range/);
        expect(() => parsePageRange("0", 9)).toThrow(/out of range/);
        expect(() => parsePageRange("10", 9)).toThrow(/has 9 pages/);
        expect(() => parsePageRange("3-1", 9)).toThrow(/backwards/);
        expect(() => parsePageRange("abc", 9)).toThrow(/not a page number/);
        expect(() => parsePageRange("1;x", 9)).toThrow(/not a page number/);
        expect(() => parsePageRange("", 9)).toThrow(/Enter a page range/);
        expect(() => parsePageRange("1", 0)).toThrow(/Load a PDF first/);
    });
    it("names the error class for callers to catch precisely", () => {
        try {
            parsePageRange("99", 3);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(PageRangeError);
            expect((err as Error).message).toContain("3 pages");
        }
    });
});

describe("parseMoveCommand", () => {
    it("validates from/to against the page count", () => {
        expect(parseMoveCommand(2, 5, 9)).toEqual({from: 2, to: 5});
        expect(parseMoveCommand(1, 1, 1)).toEqual({from: 1, to: 1});
        expect(() => parseMoveCommand(0, 1, 9)).toThrow(PageRangeError);
        expect(() => parseMoveCommand(1, 10, 9)).toThrow(/"to"/);
        expect(() => parseMoveCommand(10, 1, 9)).toThrow(/"from"/);
    });
});

describe("sanitizeMetadataValue", () => {
    it("strips control characters and collapses whitespace", () => {
        expect(sanitizeMetadataValue("  a\u0000b  c  ")).toBe("a b c");
        expect(sanitizeMetadataValue("one\ttwo\nthree")).toBe("one two three");
        expect(sanitizeMetadataValue("")).toBe("");
    });
    it("caps the length with an ellipsis", () => {
        const out = sanitizeMetadataValue("x".repeat(300), 50);
        expect(out.length).toBeLessThanOrEqual(50);
        expect(out.endsWith("…")).toBe(true);
    });
});

describe("normalizePdfName / formatPageLabel", () => {
    it("always produces a .pdf name", () => {
        expect(normalizePdfName("report")).toBe("report.pdf");
        expect(normalizePdfName("X.PDF")).toBe("X.pdf");
        expect(normalizePdfName("a/b:c*.pdf")).toBe("a-b-c.pdf");
        expect(normalizePdfName("   ")).toBe("document.pdf");
    });
    it("substitutes # and @ tokens", () => {
        expect(formatPageLabel("#", 5, 9)).toBe("5");
        expect(formatPageLabel("# / @", 3, 9)).toBe("3 / 9");
        expect(formatPageLabel("Page # of @", 1, 12)).toBe("Page 1 of 12");
    });
});

describe("wrapTextToWidth", () => {
    it("greedily wraps words to the estimated width", () => {
        expect(wrapTextToWidth("the quick brown fox", 12, 60, 0.5)).toEqual(["the quick", "brown fox"]);
    });
    it("preserves explicit newlines and blank lines", () => {
        expect(wrapTextToWidth("a\nb", 12, 600, 0.5)).toEqual(["a", "b"]);
        expect(wrapTextToWidth("para one\n\npara two", 12, 600, 0.5)).toEqual(["para one", "", "para two"]);
        expect(wrapTextToWidth("", 12, 600, 0.5)).toEqual([""]);
    });
    it("hard-breaks words longer than a line", () => {
        expect(wrapTextToWidth("abcdefghij", 12, 24, 0.5)).toEqual(["abcd", "efgh", "ij"]);
    });
    it("clamps absurd font sizes", () => {
        expect(wrapTextToWidth("hi", 1000, 600, 0.5)).toEqual(["hi"]);
        expect(wrapTextToWidth("hi", -5, 600, 0.5)).toEqual(["hi"]);
    });
});

describe("watermarkAnchorPdf / fitFontSize", () => {
    it("anchors the diagonal watermark around the page center", () => {
        const {x, y} = watermarkAnchorPdf(612, 612, 200, 48, 45);
        expect(x).toBeCloseTo(252.26, 1);
        expect(y).toBeCloseTo(218.32, 1);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(612);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(612);
    });
    it("fits font sizes down to the minimum", () => {
        expect(fitFontSize("Hello", 100, 40, 0.5, 10)).toBe(40);
        expect(fitFontSize("Hello World!", 100, 40, 0.5, 10)).toBe(16);
        expect(fitFontSize("T".repeat(200), 100, 40, 0.5, 10)).toBe(10);
    });
});

describe("formatPdfInfo", () => {
    it("summarizes pages, sizes and metadata", () => {
        const t = formatPdfInfo({
            fileName: "report.pdf",
            bytes: 2048,
            pageCount: 9,
            pageSizes: Array.from({length: 9}, () => ({width: 612, height: 792})),
            title: "Quarterly Report",
            author: "Praxis",
        });
        expect(t).toContain("report.pdf");
        expect(t).toContain("Pages            9");
        expect(t).toContain("612 × 792 pt (9 pages)");
        expect(t).toContain("Quarterly Report");
        expect(t).toContain("Praxis");
    });
    it("skips absent metadata instead of printing blanks", () => {
        const t = formatPdfInfo({fileName: "x.pdf", bytes: 10, pageCount: 1, pageSizes: [{width: 612, height: 792}]});
        expect(t).not.toContain("Title");
        expect(t).toContain("612 × 792 pt");
    });
});
