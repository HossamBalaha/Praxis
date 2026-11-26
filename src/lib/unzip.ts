/**
 * Pure-JavaScript ZIP extractor — used as a fallback when the system
 * `unzip` binary is not installed (common on minimal Docker images,
 * Alpine without `unzip`, some Windows environments, etc.).
 *
 * Supports the two storage methods that account for >99% of real-world
 * ZIP archives produced by Python's `zipfile`, `7z`, WinZip, macOS
 * Finder, GitHub's "Download ZIP", etc.:
 *
 *   - method 0: stored (no compression)
 *   - method 8: deflate (raw deflate, no zlib wrapper)
 *
 * It does NOT support newer methods (BZIP2=12, LZMA=14, Zstandard=93,
 * XZ=95, MP3=96) because those would require extra native dependencies
 * — and the `unzip` binary on the host already handles them when it's
 * available. For 99%+ of "upload a folder of .py folders" use cases,
 * stored + deflate is enough.
 *
 * The parser walks the central directory (which lives at the end of
 * the file) rather than the local file headers — this is the robust
 * approach because the local headers don't always have accurate
 * sizes/flags (data descriptors can be missing until the CD is read).
 */
import {inflateRawSync} from "node:zlib";

export interface ZipEntry {
    /** Path inside the archive (always forward-slashes). */
    name: string;
    /** True if the entry ends with `/` (a directory). */
    isDirectory: boolean;
    /** Storage method: 0=stored, 8=deflate. */
    method: number;
    /** Compressed size in bytes. */
    compressedSize: number;
    /** Uncompressed size in bytes. */
    uncompressedSize: number;
    /** Byte offset of the local file header in the buffer. */
    localHeaderOffset: number;
    /** External attributes (used to detect Unix permission bits). */
    externalAttrs: number;
}

/** Signature constants used in the ZIP format. */
const SIG_EOCD = 0x06054b50; // End of central directory
const SIG_CDFH = 0x02014b50; // Central directory file header
const SIG_LFH = 0x04034b50;  // Local file header

/** The minimum size of an EOCD record (without comment). */
const EOCD_MIN_LEN = 22;
/** Maximum distance from the end of the file to search for the EOCD. */
const EOCD_MAX_SCAN = 65557;

/**
 * Find the End-of-Central-Directory record in the buffer.
 * Returns the byte offset of the EOCD signature, or throws if not
 * found (which means the buffer is not a valid ZIP archive).
 */
function findEocd(buf: Buffer): number {
    // The EOCD is at the end of the file, possibly followed by a
    // comment of up to 65535 bytes. Scan backwards from the end.
    const minOffset = Math.max(0, buf.length - EOCD_MAX_SCAN);
    for (let i = buf.length - EOCD_MIN_LEN; i >= minOffset; i--) {
        if (buf.readUInt32LE(i) === SIG_EOCD) return i;
    }
    throw new Error(
        "Not a valid ZIP archive (End-of-Central-Directory record not found). " +
        "The file may be corrupt, truncated, or in a different archive format."
    );
}

/**
 * Parse the ZIP central directory and return the list of entries.
 * Throws on any structural inconsistency — we'd rather fail loudly
 * than silently extract the wrong bytes.
 */
export function parseZipCentralDirectory(buf: Buffer): ZipEntry[] {
    const eocdOffset = findEocd(buf);
    // EOCD layout (after the 4-byte signature):
    //   +2 diskNumber, +2 cdDisk, +2 cdEntriesThisDisk, +2 cdEntriesTotal,
    //   +4 cdSize, +4 cdOffset, +2 commentLen
    const cdEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    const entries: ZipEntry[] = [];
    let p = cdOffset;
    for (let i = 0; i < cdEntries; i++) {
        if (buf.readUInt32LE(p) !== SIG_CDFH) {
            throw new Error(
                `Corrupt ZIP: central directory entry ${i} has bad signature.`
            );
        }
        // CDFH layout (after the 4-byte signature):
        //   +2 versionMadeBy, +2 versionNeeded, +2 flags, +2 method,
        //   +2 modTime, +2 modDate, +4 crc32, +4 compressedSize,
        //   +4 uncompressedSize, +2 nameLen, +2 extraLen, +2 commentLen,
        //   +2 diskNumberStart, +2 internalAttrs, +4 externalAttrs,
        //   +4 localHeaderOffset, then name / extra / comment
        const method = buf.readUInt16LE(p + 10);
        const compressedSize = buf.readUInt32LE(p + 20);
        const uncompressedSize = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const externalAttrs = buf.readUInt32LE(p + 38);
        const localHeaderOffset = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

        entries.push({
            name,
            isDirectory: name.endsWith("/"),
            method,
            compressedSize,
            uncompressedSize,
            localHeaderOffset,
            externalAttrs,
        });

        p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

/**
 * Extract a single entry's bytes from the buffer.
 *
 * Handles the data-descriptor case (bit 3 of the general purpose
 * flag set) by trusting the central directory's compressed size
 * rather than the local header's (which may be 0 when a data
 * descriptor is used).
 */
export function extractEntry(buf: Buffer, entry: ZipEntry): Buffer {
    const p = entry.localHeaderOffset;
    if (buf.readUInt32LE(p) !== SIG_LFH) {
        throw new Error(
            `Corrupt ZIP: local file header for "${entry.name}" has bad signature.`
        );
    }
    // LFH layout (after the 4-byte signature):
    //   +2 versionNeeded, +2 flags, +2 method, +2 modTime, +2 modDate,
    //   +4 crc32, +4 compressedSize, +4 uncompressedSize,
    //   +2 nameLen, +2 extraLen, then name / extra / data
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const dataStart = p + 30 + nameLen + extraLen;
    // Always trust the central directory's size — the LFH size may be
    // 0 when bit 3 of the GPF is set (data descriptor follows data).
    const comp = buf.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.method === 0) {
        // Stored — no compression.
        return Buffer.from(comp);
    }
    if (entry.method === 8) {
        // Deflate (raw — no zlib header).
        const inflated = inflateRawSync(comp, {
            // Some zips don't store the uncompressed size correctly in the
            // local header; let zlib figure it out from the deflate stream.
            finishFlush: 1 /* Z_SYNC_FLUSH */,
        });
        return inflated;
    }
    throw new Error(
        `Unsupported ZIP compression method ${entry.method} for entry "${entry.name}". ` +
        "Re-export the archive with deflate or stored compression, or install the system `unzip` binary."
    );
}

/** zip-bomb caps. The extractor used to inflate
 *  entries with no limit on the declared OR actual uncompressed size —
 *  a 10 MB archive of highly-compressible data could claim ~4 GB per
 *  entry and exhaust memory/disk. inflateRawSync also ignores the
 *  declared size, so BOTH the declared limit and a post-inflate check
 *  are enforced. */
export const ZIP_LIMITS = {
    /** Max declared/actual uncompressed size per entry (512 MB). */
    maxEntryBytes: 512 * 1024 * 1024,
    /** Max total uncompressed bytes across the whole archive (2 GB). */
    maxTotalBytes: 2 * 1024 * 1024 * 1024,
    /** Max number of entries (guards central-directory floods). */
    maxEntries: 20_000,
} as const;

/**
 * Extract every file from the ZIP buffer into `destDir`.
 *
 * - Creates intermediate directories as needed.
 * - Skips entries that would escape `destDir` (path traversal).
 * - Skips `__MACOSX/` and `.DS_Store` macOS metadata noise.
 * - Honors the directory bit (creates empty dirs).
 * - Enforces per-entry + total inflation caps.
 *
 * Returns the count of files written.
 */
export async function extractAll(
    buf: Buffer,
    destDir: string,
    fsMod: typeof import("node:fs/promises"),
    pathMod: typeof import("node:path")
): Promise<number> {
    const entries = parseZipCentralDirectory(buf);
    if (entries.length > ZIP_LIMITS.maxEntries) {
        throw new Error(
            `ZIP has too many entries (${entries.length}); the limit is ${ZIP_LIMITS.maxEntries}.`
        );
    }
    let written = 0;
    let totalBytes = 0;

    // Pre-create the destination.
    await fsMod.mkdir(destDir, {recursive: true});

    for (const entry of entries) {
        // Skip macOS metadata noise.
        if (entry.name.includes("__MACOSX/")) continue;
        const base = entry.name.split("/").pop() ?? "";
        if (base === ".DS_Store" || base === "Thumbs.db") continue;

        // Normalize the path and resolve against destDir.
        const cleaned = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
        const target = pathMod.resolve(destDir, cleaned);
        const rel = pathMod.relative(destDir, target);
        if (rel.startsWith("..") || pathMod.isAbsolute(rel)) {
            // Path traversal attempt — skip.
            continue;
        }

        if (entry.isDirectory) {
            await fsMod.mkdir(target, {recursive: true});
            continue;
        }

        // per-entry + total inflation caps, checked
        // BEFORE inflating (the declared size) and AFTER (the actual
        // buffer — inflateRawSync trusts the stream, not the header).
        if (entry.uncompressedSize > ZIP_LIMITS.maxEntryBytes) {
            throw new Error(
                `ZIP entry "${entry.name}" declares ${entry.uncompressedSize.toLocaleString()} bytes uncompressed; the per-entry limit is ${ZIP_LIMITS.maxEntryBytes.toLocaleString()}.`
            );
        }
        if (totalBytes + entry.uncompressedSize > ZIP_LIMITS.maxTotalBytes) {
            throw new Error(
                `ZIP exceeds the total uncompressed limit of ${ZIP_LIMITS.maxTotalBytes.toLocaleString()} bytes.`
            );
        }

        // Ensure the parent dir exists.
        await fsMod.mkdir(pathMod.dirname(target), {recursive: true});

        const data = extractEntry(buf, entry);
        if (data.length > ZIP_LIMITS.maxEntryBytes) {
            throw new Error(
                `ZIP entry "${entry.name}" inflated to ${data.length.toLocaleString()} bytes; the per-entry limit is ${ZIP_LIMITS.maxEntryBytes.toLocaleString()}.`
            );
        }
        totalBytes += data.length;
        if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
            throw new Error(
                `ZIP exceeds the total uncompressed limit of ${ZIP_LIMITS.maxTotalBytes.toLocaleString()} bytes.`
            );
        }
        await fsMod.writeFile(target, data);
        written++;
    }

    return written;
}
