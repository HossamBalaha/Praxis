import {NextResponse} from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import {getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";

/**
 * POST /api/screenshot-save
 *
 * Persists a captured screenshot into the ACTIVE project at a
 * caller-chosen relative path (the Screenshot Studio's "Save To File"
 * action — persists the capture at a caller-chosen path).
 *
 * Body: { path: string, dataUrl: string }
 * ▸ path — project-relative, e.g. "Screenshots/shot-20240101.png";
 * validated by sanitizeSubPath (no traversal / hidden
 * segments), parent folders created on demand. The
 * extension decides the accepted image type:.png,.jpg /
 *.jpeg, or.webp (the storage-format setting).
 * ▸ dataUrl — a strict "data:image/<type>;base64,…" payload whose
 * type MATCHES the extension; anything else is rejected
 * so the route can never be coerced into writing
 * arbitrary bytes (e.g. a shell script) into the project.
 *
 * Returns { ok: true, path } with the absolute written path, or a 4xx
 * with a concrete reason.
 */

/** The accepted storage formats: extension → data-URL prefix + magic
 * bytes. The magic check runs in addition to the prefix check so a
 * forged data URL can never smuggle non-image bytes past the route. */
const ACCEPTED_TYPES: Record<
    string,
    { prefix: string; mime: string; magic: number[]; label: string }
> = {
    ".png": {
        prefix: "data:image/png;base64,",
        mime: "image/png",
        magic: [0x89, 0x50, 0x4e, 0x47],
        label: "PNG",
    },
    ".jpg": {
        prefix: "data:image/jpeg;base64,",
        mime: "image/jpeg",
        magic: [0xff, 0xd8, 0xff],
        label: "JPEG",
    },
    ".jpeg": {
        prefix: "data:image/jpeg;base64,",
        mime: "image/jpeg",
        magic: [0xff, 0xd8, 0xff],
        label: "JPEG",
    },
    ".webp": {
        prefix: "data:image/webp;base64,",
        mime: "image/webp",
        magic: [0x52, 0x49, 0x46, 0x46], // "RIFF" (…WEBP follows at byte 8)
        label: "WebP",
    },
    ".svg": {
        // The VECTOR delivery of the IDE's internal DOM capture — text,
        // so instead of magic bytes the decoded payload must BE an <svg>
        // document with no script handlers (an SVG opened in a browser
        // executes embedded scripts — reject anything that carries one).
        prefix: "data:image/svg+xml;base64,",
        mime: "image/svg+xml",
        magic: [],
        label: "SVG",
    },
};

export async function POST(request: Request) {
    let body: { path?: unknown; dataUrl?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const rel = typeof body.path === "string" ? body.path.trim() : "";
    const lower = rel.toLowerCase();
    const accepted = Object.entries(ACCEPTED_TYPES).find(([ext]) => lower.endsWith(ext));
    if (!accepted) {
        return NextResponse.json(
            {error: "The save path must end with .png, .jpg, .jpeg, .webp or .svg."},
            {status: 400}
        );
    }
    const ext = accepted[0];
    const type = accepted[1];
    const cleanRel = sanitizeSubPath(rel.replace(/\\/g, "/").replace(/^\/+/, ""));
    if (cleanRel === null) {
        return NextResponse.json(
            {error: "Invalid save path — keep it a simple relative path inside the project (e.g. Screenshots/shot.png)."},
            {status: 400}
        );
    }

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!dataUrl.startsWith(type.prefix)) {
        return NextResponse.json(
            {error: `Only ${type.label} data URLs (${type.prefix}…) can be saved to a ${ext} path.`},
            {status: 400}
        );
    }
    const b64 = dataUrl.slice(type.prefix.length);
    let bytes: Buffer;
    try {
        bytes = Buffer.from(b64, "base64");
    } catch {
        return NextResponse.json({error: `The ${type.label} payload is not decodable.`}, {status: 400});
    }
    // A base64 string that decodes to fewer bytes than its length implies
    // means it was not pure base64 (whitespace / junk) — reject.
    if (bytes.length < 1 || bytes.length < Math.floor(b64.length * 0.7)) {
        return NextResponse.json({error: `The ${type.label} payload is malformed.`}, {status: 400});
    }
    // Magic-byte check (PNG / JPEG / RIFF-WEBP) — the payload must
    // actually BE the image type the extension claims.
    const svgText = ext === ".svg" ? bytes.toString("utf8") : "";
    if (
        ext === ".svg"
            ? !/^\s*(<\?xml|<svg)/i.test(svgText) ||
            /<script[\s>]|javascript:|\son[a-z]+\s*=\s*["'`]/i.test(svgText)
            : bytes.length < 12 ||
            type.magic.some((m, i) => bytes[i] !== m) ||
            (ext === ".webp" &&
                !(bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50))
    ) {
        return NextResponse.json(
            {error: `The payload is not a ${type.label} image.`},
            {status: 400}
        );
    }

    const abs = path.join(getScriptsRoot(), cleanRel);
    try {
        await fs.mkdir(path.dirname(abs), {recursive: true});
        // Atomic-ish write: tmp + rename so a viewer refresh never sees a
        // half-written image.
        const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmp, bytes);
        await fs.rename(tmp, abs);
    } catch (err) {
        return NextResponse.json(
            {error: `Could not write the screenshot: ${(err as Error).message}`},
            {status: 500}
        );
    }
    return NextResponse.json({ok: true, path: abs, relPath: cleanRel});
}
