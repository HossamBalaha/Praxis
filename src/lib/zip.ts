/**
 * Minimal, dependency-free ZIP writer.
 *
 * The app already SHIPS a pure-JS ZIP reader (src/lib/unzip.ts, used by
 * the upload-zip route), but nothing could CREATE archives — which the
 * new "Download folder as .zip" explorer action needs. This module
 * writes a spec-conformant ZIP:
 *
 *   [local file header][deflate data] × N
 *   [central directory entry] × N
 *   [end-of-central-directory]
 *
 * using node:zlib's deflateRawSync for compression and crc32 (exposed
 * as zlib.crc32 since Node 20.15; a table fallback covers older runs).
 * Filenames are stored as UTF-8 (general-purpose bit 11 set).
 *
 * Deliberately not streamed: folder downloads are bounded by the same
 * limits the reader enforces (see ZIP_LIMITS in unzip.ts), and a single
 * Buffer is simpler + correct for those sizes.
 */
import {crc32 as zlibCrc32, deflateRawSync} from "node:zlib";

/** CRC-32 (IEEE 802.3 polynomial, reflected) with a lazily-built table.
 *  zlib.crc32 is used when available (Node ≥ 20.15); the manual table
 *  is a byte-at-a-time fallback with identical output. */
let CRC_TABLE: Uint32Array | null = null;

function crc32(buf: Buffer): number {
    if (typeof zlibCrc32 === "function") return zlibCrc32(buf) >>> 0;
    if (!CRC_TABLE) {
        CRC_TABLE = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            CRC_TABLE[n] = c >>> 0;
        }
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

/** Convert a JS Date into the DOS date/time pair stored in ZIP headers
 *  (2-byte each). DOS dates start at 1980-01-01 — anything older is
 *  clamped to that epoch. */
function dosDateTime(d: Date): { time: number; date: number } {
    const year = Math.max(1980, d.getFullYear());
    const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    return {time, date};
}

export interface ZipInput {
    /** Path inside the archive (POSIX separators; no leading slash). */
    name: string;
    /** File contents. Empty files are stored as zero-length entries. */
    data: Buffer;
    /** Modification timestamp (defaults to now). */
    mtime?: Date;
}

interface CentralRecord {
    nameBuf: Buffer;
    crc: number;
    compressed: Buffer;
    uncompressedSize: number;
    method: number;
    offset: number;
    time: number;
    date: number;
}

/** Build a ZIP archive from the given entries. Returns the raw bytes. */
export function buildZip(entries: ZipInput[]): Buffer {
    const chunks: Buffer[] = [];
    const central: CentralRecord[] = [];
    let offset = 0;

    for (const entry of entries) {
        // Normalize the name to forward slashes with no leading slash —
        // Windows-produced backslash paths would otherwise create broken
        // nested names on strict readers.
        const name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
        const nameBuf = Buffer.from(name, "utf8");
        if (nameBuf.length > 0xffff) {
            throw new Error(`Zip entry name too long: ${name.slice(0, 60)}…`);
        }
        const data = entry.data;
        if (data.length > 0xffffffff) {
            throw new Error(`Zip entry too large (> 4 GB): ${name}`);
        }

        // Compress; if deflate somehow EXPANDS tiny files, store raw.
        // (The cast works around @types/node's Buffer<ArrayBufferLike> vs
        // Buffer<ArrayBuffer> variance — deflateRawSync returns the former.)
        let compressed: Buffer = data.length > 0 ? (deflateRawSync(data, {level: 6}) as unknown as Buffer) : Buffer.alloc(0);
        let method = 8; // deflate
        if (compressed.length >= data.length) {
            compressed = data;
            method = 0; // stored
        }

        const crc = crc32(data);
        const {time, date} = dosDateTime(entry.mtime ?? new Date());

        // ── Local file header (PK\x03\x04) ──
        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0); // signature
        lfh.writeUInt16LE(20, 4); // version needed (2.0 — deflate/folders)
        lfh.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
        lfh.writeUInt16LE(method, 8);
        lfh.writeUInt16LE(time, 10);
        lfh.writeUInt16LE(date, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(compressed.length, 18);
        lfh.writeUInt32LE(data.length, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28); // extra field length

        chunks.push(lfh, nameBuf, compressed);
        central.push({
            nameBuf,
            crc,
            compressed,
            uncompressedSize: data.length,
            method,
            offset,
            time,
            date,
        });
        offset += lfh.length + nameBuf.length + compressed.length;
    }

    // ── Central directory (PK\x01\x02) ──
    const centralStart = offset;
    for (const rec of central) {
        const cdh = Buffer.alloc(46);
        cdh.writeUInt32LE(0x02014b50, 0); // signature
        cdh.writeUInt16LE(0x031e, 4); // version made by (UNIX, ZIP 3.0)
        cdh.writeUInt16LE(20, 6); // version needed
        cdh.writeUInt16LE(0x0800, 8); // flags: UTF-8 names
        cdh.writeUInt16LE(rec.method, 10);
        cdh.writeUInt16LE(rec.time, 12);
        cdh.writeUInt16LE(rec.date, 14);
        cdh.writeUInt32LE(rec.crc, 16);
        cdh.writeUInt32LE(rec.compressed.length, 20);
        cdh.writeUInt32LE(rec.uncompressedSize, 24);
        cdh.writeUInt16LE(rec.nameBuf.length, 28);
        cdh.writeUInt16LE(0, 30); // extra length
        cdh.writeUInt16LE(0, 32); // comment length
        cdh.writeUInt16LE(0, 34); // disk number start
        cdh.writeUInt16LE(0, 36); // internal attrs
        // external attrs (UNIX -rw-r--r--). NOTE: << coerces to a SIGNED
        // 32-bit int (0o100644 << 16 === -2119958528) which writeUInt32LE
        // rejects — coerce back to unsigned with >>> 0.
        cdh.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        cdh.writeUInt32LE(rec.offset, 42);
        chunks.push(cdh, rec.nameBuf);
        offset += cdh.length + rec.nameBuf.length;
    }

    // ── End of central directory (PK\x05\x06) ──
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with central dir
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(offset - centralStart, 12); // central dir size
    eocd.writeUInt32LE(centralStart, 16);
    eocd.writeUInt16LE(0, 20); // comment length
    chunks.push(eocd);

    return Buffer.concat(chunks);
}
