import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * GET  /api/bytes?folder=<slug>&file=<slug>&offset=<n>&length=<n>
 * PATCH /api/bytes  body { folder, file, offset, bytes(base64) }
 *
 * The hex editor's byte-range backend: serves 64 KB chunks of ANY file
 * (binary included) and splices byte patches back in place. Path
 * resolution and containment guards are the same as /api/file +
 * /api/file-write — the resolved path must stay inside the scripts root,
 * and the deslugged file path must never carry traversal, absolute
 * forms, backslashes, or hidden segments.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-call read cap — the hex viewer fetches one window at a time. */
const MAX_CHUNK = 64 * 1024;
/** Whole-file cap for the read-modify-write PATCH path. */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** PATCH payload cap — matches the GET chunk size. */
const MAX_PATCH_BYTES = 64 * 1024;

function jsonNoStore(body: Record<string, unknown>, status = 200): NextResponse {
    return NextResponse.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

/** Shared folder+file resolution with the file routes' guards. Returns
 *  the absolute path on success, or an error response. */
async function resolveSafeFilePath(
    folderSlug: string,
    fileSlug: string
): Promise<{ abs: string; fileName: string } | NextResponse> {
    if (!folderSlug || !fileSlug) {
        return jsonNoStore({error: "Missing 'folder' or 'file' parameter."}, 400);
    }
    const folderName = deslugify(folderSlug);
    const fileName = deslugify(fileSlug);
    if (!folderName || !fileName) {
        return jsonNoStore({error: "Invalid folder or file slug."}, 400);
    }
    // Mirror /api/file-write's nested-path validation: the deslugged file
    // path may be a relative path INSIDE the folder, but never traversal,
    // absolute forms, backslashes, or hidden segments.
    if (
        fileName.includes("..") ||
        fileName.includes("\\") ||
        fileName.startsWith("/") ||
        fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return jsonNoStore(
            {error: "Invalid file path (traversal or hidden segments not allowed)."},
            400
        );
    }
    const scriptsRoot = getScriptsRoot();
    const abs = path.join(scriptsRoot, folderName, fileName);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return jsonNoStore({error: "Path traversal blocked."}, 400);
    }
    return {abs, fileName};
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    const fileSlug = searchParams.get("file") ?? "";
    const offsetRaw = searchParams.get("offset") ?? "0";
    const lengthRaw = searchParams.get("length") ?? String(MAX_CHUNK);

    const resolved = await resolveSafeFilePath(folderSlug, fileSlug);
    if (resolved instanceof NextResponse) return resolved;
    const {abs, fileName} = resolved;

    const offset = Number(offsetRaw);
    const length = Number(lengthRaw);
    if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) {
        return jsonNoStore({error: "'offset' must be a non-negative integer."}, 400);
    }
    if (!Number.isFinite(length) || !Number.isInteger(length) || length <= 0) {
        return jsonNoStore({error: "'length' must be a positive integer."}, 400);
    }
    const cappedLength = Math.min(length, MAX_CHUNK);

    let totalSize: number;
    try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) {
            return jsonNoStore({error: "Not a file."}, 400);
        }
        if (stat.size > MAX_FILE_SIZE) {
            return jsonNoStore({error: "File exceeds the 50 MB viewer cap."}, 400);
        }
        totalSize = stat.size;
    } catch {
        return jsonNoStore({error: "File not found."}, 404);
    }
    if (offset > totalSize) {
        return jsonNoStore({error: "Offset beyond end of file."}, 400);
    }

    const readLength = Math.min(cappedLength, totalSize - offset);
    let bytes: Buffer;
    try {
        const handle = await fs.open(abs, "r");
        try {
            const buf = Buffer.alloc(readLength);
            if (readLength > 0) {
                const {bytesRead} = await handle.read(buf, 0, readLength, offset);
                bytes = buf.subarray(0, bytesRead);
            } else {
                bytes = buf;
            }
        } finally {
            await handle.close();
        }
    } catch (err) {
        return jsonNoStore({error: `Could not read file: ${(err as Error).message}`}, 500);
    }

    return jsonNoStore({
        ok: true,
        bytes: bytes.toString("base64"),
        offset,
        totalSize,
        fileName,
    });
}

export async function PATCH(request: Request) {
    let body: { folder?: string; file?: string; offset?: number; bytes?: string };
    try {
        body = await request.json();
    } catch {
        return jsonNoStore({error: "Invalid JSON body."}, 400);
    }
    const {folder, file, offset, bytes} = body;
    if (!folder || !file || typeof offset !== "number" || typeof bytes !== "string") {
        return jsonNoStore(
            {error: "Body must include 'folder', 'file', 'offset', and 'bytes' (base64)."},
            400
        );
    }
    if (!Number.isInteger(offset) || offset < 0) {
        return jsonNoStore({error: "'offset' must be a non-negative integer."}, 400);
    }

    const resolved = await resolveSafeFilePath(folder, file);
    if (resolved instanceof NextResponse) return resolved;
    const {abs} = resolved;

    // Buffer.from never throws on bad base64 — it silently drops junk, so
    // round-trip the decode to reject payloads that lost characters.
    const patch = Buffer.from(bytes, "base64");
    if (
        patch.length === 0 ||
        patch.toString("base64").replace(/=+$/, "") !== bytes.replace(/=+$/, "")
    ) {
        return jsonNoStore({error: "Invalid base64 'bytes' payload."}, 400);
    }
    if (patch.length > MAX_PATCH_BYTES) {
        return jsonNoStore({error: "Patch exceeds the 64 KB per-request cap."}, 400);
    }

    try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) {
            return jsonNoStore({error: "Not a file."}, 400);
        }
        if (stat.size > MAX_FILE_SIZE) {
            return jsonNoStore({error: "File exceeds the 50 MB edit cap."}, 400);
        }
        if (offset + patch.length > stat.size) {
            return jsonNoStore({error: "Patch runs past the end of the file."}, 400);
        }

        // Read-modify-write splice, mirroring /api/file-write's single
        // write-back (byte edits are in-place: head + patch + tail).
        const current = await fs.readFile(abs);
        const next = Buffer.concat([
            current.subarray(0, offset),
            patch,
            current.subarray(offset + patch.length),
        ]);
        await fs.writeFile(abs, next);
        return jsonNoStore({ok: true, written: patch.length});
    } catch (err) {
        return jsonNoStore({error: `Could not write bytes: ${(err as Error).message}`}, 500);
    }
}
