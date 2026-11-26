/**
 * lsp-jsonrpc.ts — the byte-level JSON-RPC framing every LSP server and
 * client speaks over stdio.
 *
 * The Language Server Protocol does NOT send newline-delimited JSON.
 * Each message is wrapped in a header block followed by exactly one
 * blank line and then the body:
 *
 *   Content-Length: 123\r\n
 *   Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n
 *   \r\n
 *   {"jsonrpc":"2.0", ...123 bytes...}
 *
 * `Content-Length` counts BODY BYTES (utf-8), not characters — so the
 * decoder below accumulates raw Buffers and only decodes a body once
 * its full byte length has arrived. Decoding per-chunk as text would
 * corrupt any multi-byte character that a pipe boundary happens to
 * split in half.
 *
 * Two defensive behaviors, both unit-tested:
 *
 * - Resync: if the stream does not start with a `Content-Length:`
 *   header (a wrapper script printing an install notice, a stray
 *   newline), the decoder scans forward to the NEXT header instead of
 *   dying — losing the garbage line, never the messages after it. When
 *   no header is found at all it keeps only a possible partial header
 *   at the tail (13 bytes) and drops the rest, so noise can never make
 *   the buffer grow without bound.
 * - Tolerant body parse: a body that fails JSON.parse is dropped and
 *   reported through `onFault` (the connection stays usable; one
 *   malformed message must not wedge the whole sidecar).
 *
 * Pure module: no spawn, no fs, no DOM — node-testable as-is.
 */

/** The canonical header field name that opens every LSP frame. */
const CONTENT_LENGTH_FIELD = "Content-Length";

/** Header terminator — the blank line ending every LSP header block. */
const HEADER_TERMINATOR = "\r\n\r\n";

/** Hard cap on a single message body (pyright never approaches this;
 *  the cap exists so a corrupt header cannot make us buffer forever). */
export const MAX_LSP_BODY_BYTES = 32 * 1024 * 1024;

/** Hard cap on the header block itself (a few hundred bytes in practice). */
const MAX_LSP_HEADER_BYTES = 16 * 1024;

/**
 * Serialize one JSON-RPC message into the framed wire format pyright
 * expects on stdin. Returns the exact bytes to write (header + body).
 */
export function encodeLspMessage(payload: unknown): Buffer {
    // Serialize first — the Content-Length must match the utf-8 byte
    // count of the body, not its character count.
    const body = Buffer.from(JSON.stringify(payload), "utf-8");
    // The header is pure ASCII, so its byte length equals its length.
    const header = `Content-Length: ${body.byteLength}\r\n\r\n`;
    // Concatenate into one write so a message is never split mid-frame.
    return Buffer.concat([Buffer.from(header, "ascii"), body]);
}

/** Options for the incremental decoder. */
export interface LspMessageDecoderOptions {
    /**
     * Called (best-effort, never throws) when a body fails to parse or a
     * header block is malformed. The decoder keeps going regardless —
     * this hook exists for logging, not for control flow.
     */
    onFault?: (reason: string, fragment: string) => void;
}

/**
 * Incremental decoder for a stream of LSP frames.
 *
 * Push raw stdout chunks in as they arrive; complete, parsed messages
 * come out of `push()` in order. The decoder owns an internal byte
 * buffer and compacts it after every extracted message, so feeding it
 * a long stream stays O(stream), not O(stream²).
 */
export class LspMessageDecoder {
    /** Bytes received but not yet consumed by a complete message. */
    private buffer: Buffer = Buffer.alloc(0);
    /** Optional fault reporter (see LspMessageDecoderOptions). */
    private readonly onFault?: (reason: string, fragment: string) => void;

    constructor(options?: LspMessageDecoderOptions) {
        // Store the fault hook once; push() stays allocation-light.
        this.onFault = options?.onFault;
    }

    /** Bytes currently buffered awaiting completion (exposed for tests). */
    public get bufferedBytes(): number {
        // Trivial accessor — the tests assert the buffer drains to 0.
        return this.buffer.byteLength;
    }

    /**
     * Feed one stdout chunk; returns every complete message it finished.
     * Never throws — pipe noise becomes faults, not crashes.
     */
    public push(chunk: Buffer | string): unknown[] {
        // Normalize string chunks (tests and text-mode streams) to bytes.
        const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk;
        // Append to the working buffer (copy — the caller reuses its chunk).
        this.buffer = Buffer.concat([this.buffer, bytes]);
        // Collect every message the new bytes complete.
        const messages: unknown[] = [];
        // Keep extracting while a full header + body is buffered.
        for (; ;) {
            // Nothing buffered — done.
            if (this.buffer.byteLength === 0) break;
            // The buffer must be aligned on a Content-Length field.
            if (!this.startsWithContentLength()) {
                // Try to realign to the next frame boundary.
                if (!this.resyncToNextHeader()) break;
                // Realigned — retry the extraction loop on the trimmed buffer.
                continue;
            }
            // Locate the end of the header block.
            const headerEnd = this.buffer.indexOf(HEADER_TERMINATOR, 0, "ascii");
            // No complete header yet — wait for more bytes.
            if (headerEnd < 0) {
                // Refuse to buffer an unbounded header block: a header past
                // the cap is garbage by definition (real headers are ~40 bytes).
                if (this.buffer.byteLength > MAX_LSP_HEADER_BYTES) {
                    // Report the drop so wrapper noise is diagnosable.
                    this.reportFault("oversized header block dropped", this.buffer.subarray(0, 200).toString("utf-8"));
                    // Discard the whole pseudo-header.
                    this.buffer = Buffer.alloc(0);
                }
                // Wait for more bytes either way.
                break;
            }
            // An absurdly long header block is garbage: skip past it.
            if (headerEnd > MAX_LSP_HEADER_BYTES) {
                // Report it.
                this.reportFault("oversized header block dropped", this.buffer.subarray(0, 200).toString("utf-8"));
                // Skip the header and its terminator.
                this.buffer = this.buffer.subarray(headerEnd + HEADER_TERMINATOR.length);
                // Try the next candidate.
                continue;
            }
            // Parse the Content-Length out of the header block.
            const length = this.parseContentLength(headerEnd);
            // A malformed header block: drop it and try again after it.
            if (length < 0) {
                // Report the fault so operators can see what the server sent.
                this.reportFault("unparseable header block", this.buffer.subarray(0, Math.min(headerEnd, 200)).toString("utf-8"));
                // Advance past this (garbage) header terminator.
                this.buffer = this.buffer.subarray(headerEnd + HEADER_TERMINATOR.length);
                // Try the next candidate.
                continue;
            }
            // Byte offset where the body starts.
            const bodyStart = headerEnd + HEADER_TERMINATOR.length;
            // Body length still missing — wait for more bytes.
            if (this.buffer.byteLength < bodyStart + length) break;
            // Slice the exact body bytes and decode them as utf-8 text.
            const bodyText = this.buffer.subarray(bodyStart, bodyStart + length).toString("utf-8");
            // Parse the JSON body defensively.
            let parsed: unknown;
            try {
                // The actual parse — the only operation that can throw here.
                parsed = JSON.parse(bodyText);
            } catch {
                // Report the dropped body so the fault is visible in logs.
                this.reportFault("body failed JSON.parse", bodyText.slice(0, 200));
                // The message is skipped, not fatal.
                parsed = undefined;
            }
            // Keep the parsed message only when it is a JSON object.
            if (parsed !== undefined && parsed !== null && typeof parsed === "object") {
                // Deliver the complete message to the caller.
                messages.push(parsed);
            }
            // Compact the buffer past this message.
            this.buffer = this.buffer.subarray(bodyStart + length);
        }
        // Hand back everything extracted from this chunk (possibly []).
        return messages;
    }

    /** True when byte 0 begins a `Content-Length` field (ASCII). */
    private startsWithContentLength(): boolean {
        // Cheap prefix test — the field name is exactly 14 bytes.
        return (
            this.buffer.byteLength >= CONTENT_LENGTH_FIELD.length &&
            this.buffer.subarray(0, CONTENT_LENGTH_FIELD.length).toString("ascii") === CONTENT_LENGTH_FIELD
        );
    }

    /**
     * Realign the buffer to the next `Content-Length` occurrence.
     * Returns true when the buffer changed (a retry may find a frame);
     * false when the caller must simply wait for more bytes.
     */
    private resyncToNextHeader(): boolean {
        // Search anywhere in the buffer for the field name.
        const idx = this.buffer.indexOf(CONTENT_LENGTH_FIELD, 0, "ascii");
        // Not found: everything buffered is garbage, EXCEPT a possible
        // partial header at the very tail ("Content-Len" split across
        // chunks) which must survive to prefix the next chunk.
        if (idx < 0) {
            // The longest partial prefix worth keeping.
            const keep = CONTENT_LENGTH_FIELD.length - 1;
            // Drop only when there is more than the partial could be.
            if (this.buffer.byteLength > keep) {
                // Report roughly what was dropped (helps diagnose wrapper noise).
                this.reportFault(
                    "resync dropped garbage",
                    this.buffer.subarray(0, Math.min(this.buffer.byteLength - keep, 200)).toString("utf-8")
                );
                // Keep only the potential partial header at the tail.
                this.buffer = this.buffer.subarray(this.buffer.byteLength - keep);
            }
            // Nothing further to try — wait for more bytes.
            return false;
        }
        // Report the garbage being skipped before the found header.
        if (idx > 0) {
            // Only meaningful prefixes are worth logging.
            this.reportFault("resync skipped bytes", this.buffer.subarray(0, Math.min(idx, 200)).toString("utf-8"));
        }
        // Slice so the found header starts at byte 0.
        this.buffer = this.buffer.subarray(idx);
        // The buffer changed — the caller should retry.
        return true;
    }

    /** Parse `Content-Length: N` from the header block ending at `headerEnd`. */
    private parseContentLength(headerEnd: number): number {
        // The header block as ASCII text (headers are never utf-8 payload).
        const text = this.buffer.subarray(0, headerEnd).toString("ascii");
        // Match the field case-insensitively (the spec says clients must be
        // tolerant; pyright emits the canonical casing but mocks may not).
        const match = /content-length\s*:\s*(\d+)/i.exec(text);
        // No valid field — signal garbage to the caller.
        if (!match) return -1;
        // Parse the captured digits.
        const value = Number(match[1]);
        // Reject negatives and absurd sizes (corrupt header).
        if (!Number.isFinite(value) || value < 0 || value > MAX_LSP_BODY_BYTES) return -1;
        // The validated body length.
        return value;
    }

    /** Best-effort fault reporting that never throws. */
    private reportFault(reason: string, fragment: string): void {
        // Guard: no hook configured — nothing to do.
        if (!this.onFault) return;
        // Wrap the call so a throwing logger cannot break the decoder.
        try {
            // Deliver the fault.
            this.onFault(reason, fragment);
        } catch {
            // A broken logger must not take the sidecar down.
        }
    }
}
