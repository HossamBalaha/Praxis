/**
 * Unit tests for the progressive-render chunker
 * (src/lib/code-chunks.ts) — extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {FULL_CHUNK_LINES, FULL_CHUNK_THRESHOLD, splitSafeChunks,} from "@/lib/code-chunks";

describe("splitSafeChunks", () => {
    it("returns one chunk for files at or under the target", () => {
        expect(splitSafeChunks(["a", "b"], 200)).toEqual(["a\nb"]);
        expect(splitSafeChunks([], 200)).toEqual([]);
    });

    it("splits at ~target lines on plain code", () => {
        const lines = Array.from({length: 450}, (_, i) => `x${i}`);
        const chunks = splitSafeChunks(lines, 200);
        expect(chunks.map((c) => c.split("\n").length)).toEqual([200, 200, 50]);
        expect(chunks.join("\n")).toBe(lines.join("\n"));
    });

    it("never cuts inside a triple-single-quoted string", () => {
        const lines = [
            ...Array.from({length: 199}, (_, i) => `code${i}`),
            "s = '''",
            "still inside the docstring",
            "'''",
            "after",
        ];
        const chunks = splitSafeChunks(lines, 200);
        // The boundary waits for the ''' close: chunk 0 carries all 202
        // lines through the fence (the seam would mis-color the string).
        expect(chunks[0].split("\n")).toHaveLength(202);
        expect(chunks[0].split("\n").slice(-1)[0]).toBe("'''");
        expect(chunks[1].split("\n")).toEqual(["after"]);
    });

    it("never cuts inside a triple-double-quoted string either", () => {
        const lines = [
            ...Array.from({length: 199}, (_, i) => `code${i}`),
            's = """',
            "inside",
            '"""',
        ];
        const chunks = splitSafeChunks(lines, 200);
        expect(chunks[0].split("\n").slice(-1)[0]).toBe('"""');
    });

    it("does not confuse ''' inside a \"\"\" block (and vice versa)", () => {
        const lines = [
            'd = """',
            "not a fence: '''",
            '"""',
            ...Array.from({length: 200}, (_, i) => `code${i}`),
        ];
        const chunks = splitSafeChunks(lines, 200);
        // The stray ''' must NOT toggle the state machine open — the
        // boundary lands on code196 (index 199) right on schedule.
        expect(chunks[0].split("\n")).toHaveLength(200);
        expect(chunks[0].split("\n")[0]).toBe('d = """');
        expect(chunks[1].split("\n")).toEqual(["code197", "code198", "code199"]);
    });

    it("keeps an unterminated string's tail in one final chunk", () => {
        const lines = [
            ...Array.from({length: 199}, (_, i) => `code${i}`),
            "s = '''",
            "never closed",
        ];
        const chunks = splitSafeChunks(lines, 200);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].split("\n").length).toBe(201);
    });

    it("re-joins to the original source", () => {
        const lines = ["a", "'''", "b", "c", "'''", ...Array.from({length: 300}, (_, i) => `z${i}`)];
        expect(splitSafeChunks(lines, 100).join("\n")).toBe(lines.join("\n"));
    });
});

describe("chunk thresholds", () => {
    it("keeps the tuned constants (progressive render kicks in past 800 lines, 200-row chunks)", () => {
        expect(FULL_CHUNK_THRESHOLD).toBe(800);
        expect(FULL_CHUNK_LINES).toBe(200);
    });
});
