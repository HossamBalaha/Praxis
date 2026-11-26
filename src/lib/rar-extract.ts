import fs from "node:fs/promises";
import path from "node:path";
import {ZIP_LIMITS} from "@/lib/unzip";

/**
 * In-process RAR archive support — listing + extraction through
 * node-unrar-js (the official unrar sources compiled to WebAssembly).
 *
 * The system-binary chain (unrar / unrar-free / a 7z build with the
 * RAR codec) only exists on machines where the user installed those
 * tools. This module needs NO system binary: the WASM decoder ships
 * with the app, so every RAR archive (RAR3 + RAR5) opens inline on
 * any host. The module is loaded LAZILY and probed once — a missing
 * or broken install degrades to the system-binary path instead of
 * crashing the route.
 *
 * The same safety rules as the ZIP extractor apply: path-traversal
 * guard per entry, `__MACOSX/` / `.DS_Store` noise skipped, per-entry
 * and total uncompressed-size caps, entry-count cap.
 */

export interface RarEntry {
    name: string;
    size: number;
    isDir: boolean;
}

/** null = not probed yet; true/false = probed once. */
let rarJsOk: boolean | null = null;

/** Can the WASM unrar be loaded on this machine? Probed once per process. */
export async function rarJsAvailable(): Promise<boolean> {
    if (rarJsOk !== null) return rarJsOk;
    try {
        const mod = await import("node-unrar-js");
        rarJsOk = typeof mod.createExtractorFromData === "function";
    } catch {
        rarJsOk = false;
    }
    return rarJsOk;
}

type UnrarExtractor = {
    getFileList: () => { fileHeaders: Iterable<RarHeader> };
    extract: (opts?: { files?: string[] }) => { files: Iterable<RarFile> };
};
type RarHeader = {
    name: string;
    unpSize: number;
    flags?: { directory?: boolean };
};
type RarFile = { fileHeader: RarHeader; extraction?: Uint8Array };

async function makeExtractor(buf: Buffer): Promise<UnrarExtractor> {
    const {createExtractorFromData} = await import("node-unrar-js");
    // Copy into a plain ArrayBuffer — node-unrar-js validates the input
    // as ArrayBuffer and a Node Buffer's backing store does not satisfy
    // the newer TS DOM lib shape (resizable buffers).
    const data = new ArrayBuffer(buf.byteLength);
    new Uint8Array(data).set(buf);
    return (await createExtractorFromData({data})) as unknown as UnrarExtractor;
}

/** List every entry (name + uncompressed size + directory flag). */
export async function listRar(buf: Buffer): Promise<RarEntry[]> {
    const extractor = await makeExtractor(buf);
    const list = extractor.getFileList();
    const entries: RarEntry[] = [];
    for (const h of list.fileHeaders) {
        entries.push({name: h.name, size: h.unpSize ?? 0, isDir: !!h.flags?.directory});
    }
    return entries;
}

/** Clean an entry name and resolve it under destDir; null = skip. */
function resolveEntry(destDir: string, rawName: string): string | null {
    if (rawName.includes("__MACOSX/")) return null;
    const base = rawName.split("/").pop() ?? "";
    if (base === ".DS_Store" || base === "Thumbs.db") return null;
    const cleaned = rawName.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!cleaned || cleaned.includes("..")) return null;
    const target = path.resolve(destDir, cleaned);
    const rel = path.relative(destDir, target);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return target;
}

/** Extract every file into destDir. Returns the count of files written. */
export async function extractRar(buf: Buffer, destDir: string): Promise<number> {
    const extractor = await makeExtractor(buf);
    const headers = [...extractor.getFileList().fileHeaders];
    if (headers.length > ZIP_LIMITS.maxEntries) {
        throw new Error(
            `RAR archive has too many entries (${headers.length}); the limit is ${ZIP_LIMITS.maxEntries}.`
        );
    }
    // Pre-validate with the DECLARED sizes so a bomb archive is rejected
    // before a single byte is written to disk.
    let declaredTotal = 0;
    for (const h of headers) {
        if ((h.unpSize ?? 0) > ZIP_LIMITS.maxEntryBytes) {
            throw new Error(
                `RAR entry "${h.name}" declares ${(h.unpSize ?? 0).toLocaleString()} bytes uncompressed; the per-entry limit is ${ZIP_LIMITS.maxEntryBytes.toLocaleString()}.`
            );
        }
        declaredTotal += h.unpSize ?? 0;
    }
    if (declaredTotal > ZIP_LIMITS.maxTotalBytes) {
        throw new Error(
            `RAR archive exceeds the total uncompressed limit of ${ZIP_LIMITS.maxTotalBytes.toLocaleString()} bytes.`
        );
    }

    await fs.mkdir(destDir, {recursive: true});

    let written = 0;
    let totalBytes = 0;
    const extracted = extractor.extract({});
    for (const f of extracted.files) {
        const h = f.fileHeader;
        const target = resolveEntry(destDir, h.name);
        if (target === null) continue;
        if (h.flags?.directory) {
            await fs.mkdir(target, {recursive: true});
            continue;
        }
        const data = f.extraction;
        if (!data || data.length === 0) {
            // Empty file — still write it (an empty file is a valid entry).
            await fs.mkdir(path.dirname(target), {recursive: true});
            await fs.writeFile(target, Buffer.alloc(0));
            written++;
            continue;
        }
        if (data.length > ZIP_LIMITS.maxEntryBytes) {
            throw new Error(
                `RAR entry "${h.name}" inflated to ${data.length.toLocaleString()} bytes; the per-entry limit is ${ZIP_LIMITS.maxEntryBytes.toLocaleString()}.`
            );
        }
        totalBytes += data.length;
        if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
            throw new Error(
                `RAR archive exceeds the total uncompressed limit of ${ZIP_LIMITS.maxTotalBytes.toLocaleString()} bytes.`
            );
        }
        await fs.mkdir(path.dirname(target), {recursive: true});
        await fs.writeFile(target, Buffer.from(data));
        written++;
    }
    return written;
}
