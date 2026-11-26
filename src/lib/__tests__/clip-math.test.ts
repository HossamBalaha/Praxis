/**
 * Unit tests for the Show-Less clip engine (src/lib/clip-math.ts) —
 * the collapsed-preview geometry extracted from code-viewer.tsx.
 *
 * The pinned behaviors are the ones the component relied on inline:
 * the 8-row historical floor, the entirely-inside-the-viewport
 * budget, the floored viewport cap, the 220px pre-measurement
 * fallback, and the tiny-scroll trim that kills the "0.1 cm
 * scrollbar" in Show-full mode.
 */
import {describe, expect, it} from "vitest";
import {
    COLLAPSED_FALLBACK_CLIP_PX,
    COLLAPSED_LINE_COUNT,
    collapsedClipHeight,
    collapsedPreviewText,
    collapsedRowCount,
    firstRowsOf,
    isFileCollapsible,
    viewPadTrimFor,
} from "@/lib/clip-math";

describe("collapsedRowCount", () => {
    it("keeps the historical 8-row floor before the viewport is measured", () => {
        expect(collapsedRowCount(0, 24, 16)).toBe(COLLAPSED_LINE_COUNT);
        expect(COLLAPSED_LINE_COUNT).toBe(8);
    });

    it("derives the rows that fit the visible height (viewport − top − bottom budget)", () => {
        // 600 − 16 (codeTop) − 20 (bottom budget) = 564 usable; 564 / 24 = 23.5 → 23.
        expect(collapsedRowCount(600, 24, 16)).toBe(23);
    });

    it("never returns fewer than 8 rows even on a tiny pane", () => {
        expect(collapsedRowCount(100, 24, 16)).toBe(8);
        expect(collapsedRowCount(1, 24, 16)).toBe(8);
    });

    it("guards a zero/negative measured line height as 1px rows", () => {
        // 600 − 16 − 20 = 564 rows at 1px each — degenerate but safe.
        expect(collapsedRowCount(600, 0, 16)).toBe(564);
        expect(collapsedRowCount(600, -5, 16)).toBe(564);
    });

    it("follows the measured line height (font-size settings are honored)", () => {
        expect(collapsedRowCount(600, 32, 16)).toBe(Math.floor(564 / 32));
        expect(collapsedRowCount(600, 12, 16)).toBe(47);
    });

    it("clamps a viewport shorter than the fixed pads to the floor", () => {
        // usable = max(0, 30 − 16 − 20) = 0 → floor(0/24) = 0 → floor 8.
        expect(collapsedRowCount(30, 24, 16)).toBe(8);
    });
});

describe("collapsedClipHeight", () => {
    it("falls back to the historical fixed 220px until measured", () => {
        expect(collapsedClipHeight(0, 16, 23, 24)).toBe(COLLAPSED_FALLBACK_CLIP_PX);
        expect(COLLAPSED_FALLBACK_CLIP_PX).toBe(220);
    });

    it("is the top pad + rows + pre bottom pad, clamped to the viewport", () => {
        // round(16 + 23*24 + 16) = 584 ≤ floor(600) → 584.
        expect(collapsedClipHeight(600, 16, 23, 24)).toBe(584);
    });

    it("FLOORS the viewport cap so a fractional ResizeObserver rect cannot leave a sub-pixel scroll", () => {
        // Content would be 584; floor(599.5) = 599 → 584 fits. But a taller
        // content against a fractional viewport clips at the floor.
        expect(collapsedClipHeight(599.5, 16, 23, 24)).toBe(584);
        expect(collapsedClipHeight(500.9, 16, 23, 24)).toBe(500);
    });

    it("uses the content height when the viewport is taller than the rows", () => {
        // round(16 + 8*24 + 16) = 224 — an 8-row file never claims 600px.
        expect(collapsedClipHeight(600, 16, 8, 24)).toBe(224);
    });

    it("rounds the content estimate (fractional row heights do not drift)", () => {
        // 16 + 10*20.4 + 16 = 236 exactly; 16 + 10*20.44 + 16 = 236.4 → 236.
        expect(collapsedClipHeight(600, 16, 10, 20.4)).toBe(236);
        expect(collapsedClipHeight(600, 16, 10, 20.44)).toBe(236);
    });

    it("treats a non-positive measured row height as 1px rows", () => {
        // round(16 + 30*1 + 16) = 62.
        expect(collapsedClipHeight(600, 16, 30, 0)).toBe(62);
    });
});

describe("isFileCollapsible", () => {
    it("is true only when the file has MORE rows than the preview fits", () => {
        expect(isFileCollapsible(9, 8)).toBe(true);
        expect(isFileCollapsible(8, 8)).toBe(false);
        expect(isFileCollapsible(1, 8)).toBe(false);
    });

    it("any overflow at all clips (no +2 slack)", () => {
        expect(isFileCollapsible(9, 8)).toBe(true);
        expect(isFileCollapsible(31, 30)).toBe(true);
        expect(isFileCollapsible(30, 30)).toBe(false);
    });
});

describe("viewPadTrimFor", () => {
    it("trims small positive leftovers (ceil — integer padding)", () => {
        expect(viewPadTrimFor(1)).toBe(1);
        expect(viewPadTrimFor(5.2)).toBe(6);
        expect(viewPadTrimFor(16)).toBe(16);
    });

    it("leaves zero and negative leftovers alone", () => {
        expect(viewPadTrimFor(0)).toBe(0);
        expect(viewPadTrimFor(-3)).toBe(0);
    });

    it("treats larger overflows as real content (untouched)", () => {
        expect(viewPadTrimFor(17)).toBe(0);
        expect(viewPadTrimFor(160)).toBe(0);
    });
});

describe("firstRowsOf / collapsedPreviewText", () => {
    it("cuts at the row count and joins without a trailing newline (the find matcher's view)", () => {
        expect(firstRowsOf("a\nb\nc\nd", 2)).toBe("a\nb");
        expect(firstRowsOf("a\nb\nc\nd", 100)).toBe("a\nb\nc\nd");
        expect(firstRowsOf("", 8)).toBe("");
    });

    it("adds the single trailing newline the rendered preview carries", () => {
        expect(collapsedPreviewText("a\nb\nc\nd", 2)).toBe("a\nb\n");
        expect(collapsedPreviewText("short", 8)).toBe("short\n");
    });
});
