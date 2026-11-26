/**
 * lsp-jsonrpc.test.ts — unit tests for src/lib/lsp-jsonrpc.ts.
 *
 * The framing layer is the first thing a broken LSP integration gets
 * wrong, so the suite attacks it at the byte level:
 *   - encodeLspMessage produces a spec-correct header with a BYTE count
 *     (utf-8 multibyte bodies) and roundtrips through the decoder
 *   - one message per chunk, many messages in one chunk, and messages
 *     split at EVERY possible byte boundary (header split, body split,
 *     multibyte character split)
 *   - incremental decoding across many small chunks (the "drip" case a
 *     real pipe produces)
 *   - garbage resync: leading noise, noise BETWEEN messages, a header
 *     with no Content-Length, and a body that fails JSON.parse — the
 *     decoder survives all of them and still delivers the next frame
 *   - oversized header blocks are dropped instead of buffering forever
 */
import {describe, expect, it} from "vitest";
import {encodeLspMessage, LspMessageDecoder} from "@/lib/lsp-jsonrpc";

describe("encodeLspMessage", () => {
    it("wraps a payload with a Content-Length header counting utf-8 bytes", () => {
        // A body with multibyte characters: 4 emoji = 16 bytes, not 4 chars.
        const payload = {jsonrpc: "2.0", id: 1, method: "test", params: {emoji: "😀😀😀😀"}};
        // Encode it.
        const wire = encodeLspMessage(payload);
        // The wire form starts with the canonical field.
        expect(wire.subarray(0, 14).toString("ascii")).toBe("Content-Length");
        // Parse the header value back out.
        const text = wire.toString("utf-8");
        // Header and body are separated by the blank line.
        const split = text.indexOf("\r\n\r\n");
        // The declared length equals the BODY byte count.
        const header = text.slice(0, split);
        const declared = Number(/Content-Length: (\d+)/.exec(header)![1]);
        // The body bytes are exactly the remainder of the buffer.
        const bodyBytes = wire.byteLength - (split + 4);
        // Declared, actual, and re-serialized body all agree.
        expect(declared).toBe(bodyBytes);
        expect(JSON.parse(text.slice(split + 4))).toEqual(payload);
    });

    it("roundtrips through the decoder", () => {
        // Fresh decoder.
        const decoder = new LspMessageDecoder();
        // Encode a request.
        const wire = encodeLspMessage({jsonrpc: "2.0", id: 7, method: "initialize"});
        // Feed it in one chunk.
        const out = decoder.push(wire);
        // Exactly one message, exactly the payload.
        expect(out).toEqual([{jsonrpc: "2.0", id: 7, method: "initialize"}]);
        // The buffer fully drained.
        expect(decoder.bufferedBytes).toBe(0);
    });
});

describe("LspMessageDecoder chunk boundaries", () => {
    it("decodes multiple messages packed into one chunk", () => {
        // Decoder under test.
        const decoder = new LspMessageDecoder();
        // Two frames back to back.
        const wire = Buffer.concat([
            encodeLspMessage({id: 1, method: "a"}),
            encodeLspMessage({id: 2, method: "b"}),
        ]);
        // One push, two messages out, in order.
        const out = decoder.push(wire);
        expect(out.map((m) => (m as { id: number }).id)).toEqual([1, 2]);
    });

    it("decodes a message split at EVERY byte boundary", () => {
        // Exhaustive split sweep — the pipe may cut anywhere.
        const payload = {jsonrpc: "2.0", id: 42, method: "textDocument/hover", params: {ok: true, note: "hä"}};
        // Encode once.
        const wire = encodeLspMessage(payload);
        // Try every split point.
        for (let cut = 1; cut < wire.byteLength; cut++) {
            // Fresh decoder per cut.
            const decoder = new LspMessageDecoder();
            // Feed the head — usually incomplete.
            const first = decoder.push(wire.subarray(0, cut));
            // Nothing complete yet (the cut is inside the message).
            expect(first).toEqual([]);
            // Feed the tail — completes the message.
            const second = decoder.push(wire.subarray(cut));
            // The reassembled payload matches exactly.
            expect(second).toEqual([payload]);
        }
    });

    it("survives a multibyte character split across chunks", () => {
        // A body containing a 3-byte character.
        const payload = {method: "m", params: {s: "é"}};
        // Encode it.
        const wire = encodeLspMessage(payload);
        // Find the byte offset of the multibyte char inside the body.
        const bodyStart = wire.indexOf("\r\n\r\n") + 4;
        // Slice so the cut lands between the first and second byte of é.
        const cut = wire.indexOf("é", bodyStart) + 1;
        // Fresh decoder.
        const decoder = new LspMessageDecoder();
        // Head first.
        expect(decoder.push(wire.subarray(0, cut))).toEqual([]);
        // Tail completes it.
        const out = decoder.push(wire.subarray(cut));
        // The character survived the byte split.
        expect(out).toEqual([payload]);
    });

    it("decodes a message delivered one byte at a time", () => {
        // The drip test — the harshest chunking.
        const decoder = new LspMessageDecoder();
        // Two payloads.
        const wire = Buffer.concat([
            encodeLspMessage({id: 1, m: "one"}),
            encodeLspMessage({id: 2, m: "two"}),
        ]);
        // Collected messages.
        const out: unknown[] = [];
        // Byte by byte.
        for (let i = 0; i < wire.byteLength; i++) {
            // Push exactly one byte.
            out.push(...decoder.push(wire.subarray(i, i + 1)));
        }
        // Both messages arrived intact, in order.
        expect(out.map((m) => (m as { id: number }).id)).toEqual([1, 2]);
    });
});

describe("LspMessageDecoder resync and faults", () => {
    it("skips leading garbage before a valid header", () => {
        // Decoder with a fault recorder.
        const faults: string[] = [];
        const decoder = new LspMessageDecoder({
            onFault: (reason) => faults.push(reason),
        });
        // A wrapper-script banner, then a real frame.
        const wire = Buffer.concat([
            Buffer.from("pyright wrapper v1.2.3 installing...\n", "utf-8"),
            encodeLspMessage({id: 5, method: "x"}),
        ]);
        // The garbage is dropped, the frame survives.
        const out = decoder.push(wire);
        expect(out).toEqual([{id: 5, method: "x"}]);
        // The drop was reported.
        expect(faults.length).toBeGreaterThan(0);
    });

    it("skips garbage BETWEEN two valid frames", () => {
        // Decoder under test.
        const decoder = new LspMessageDecoder();
        // Frame, noise, frame.
        const wire = Buffer.concat([
            encodeLspMessage({id: 1}),
            Buffer.from("random stdout noise\nwithout any header\n", "utf-8"),
            encodeLspMessage({id: 2}),
        ]);
        // Both frames decoded, noise gone.
        const out = decoder.push(wire);
        expect(out.map((m) => (m as { id: number }).id)).toEqual([1, 2]);
    });

    it("drops a body that fails JSON.parse and keeps the next frame", () => {
        // Decoder with fault recording.
        const faults: string[] = [];
        const decoder = new LspMessageDecoder({onFault: (r) => faults.push(r)});
        // Hand-build a frame whose body is not JSON.
        const badBody = Buffer.from("{not json at all", "utf-8");
        const badFrame = Buffer.concat([
            Buffer.from(`Content-Length: ${badBody.byteLength}\r\n\r\n`, "ascii"),
            badBody,
        ]);
        // Follow it with a valid frame.
        const wire = Buffer.concat([badFrame, encodeLspMessage({id: 9, ok: true})]);
        // The bad body yields nothing; the good frame still arrives.
        const out = decoder.push(wire);
        expect(out).toEqual([{id: 9, ok: true}]);
        // The parse failure was reported.
        expect(faults.some((f) => f.includes("JSON.parse"))).toBe(true);
    });

    it("drops an oversized header block instead of buffering forever", () => {
        // Decoder under test.
        const decoder = new LspMessageDecoder();
        // A "header" with no terminator, far beyond the cap.
        const garbage = Buffer.alloc(20 * 1024, 0x61 /* "a" */);
        // Feed the garbage in pieces.
        decoder.push(garbage.subarray(0, 9000));
        // The noise did NOT accumulate — only a possible partial header
        // (13 bytes) is retained.
        expect(decoder.bufferedBytes).toBeLessThanOrEqual(13);
        // Cross the cap with the rest.
        decoder.push(garbage.subarray(9000));
        // Still no unbounded buffering.
        expect(decoder.bufferedBytes).toBeLessThanOrEqual(13);
        // A valid frame still decodes afterwards.
        const out = decoder.push(encodeLspMessage({id: 3}));
        expect(out).toEqual([{id: 3}]);
    });

    it("returns [] for an empty or whitespace-only chunk", () => {
        // Decoder under test.
        const decoder = new LspMessageDecoder();
        // Empty chunk.
        expect(decoder.push(Buffer.alloc(0))).toEqual([]);
        // Whitespace-only chunk.
        expect(decoder.push(Buffer.from("\r\n  \n"))).toEqual([]);
        // Nothing beyond a possible partial header tail is retained.
        expect(decoder.bufferedBytes).toBeLessThanOrEqual(13);
    });
});
