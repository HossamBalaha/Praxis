import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * media trim/export — POST { folder, file, startSec, endSec }
 *
 * Best-effort: requires ffmpeg on PATH (probed first). Cuts the
 * [start, end] window with stream copy (-c copy) when the container
 * allows it — fast and lossless for mp3/mp4/webm/wav — and writes
 * "<name>.trimmed.<ext>" next to the source. When ffmpeg is missing
 * the response says so (501) and the client shows a hint instead of
 * pretending to work.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_EXTS = new Set([
    ".mp4", ".webm", ".mov", ".mkv", ".ogv",
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a",
]);
const MAX_SECONDS = 12 * 3600;
const TIMEOUT_MS = 120_000;

function probeFfmpeg(): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn("ffmpeg", ["-version"], {stdio: "ignore"});
        child.on("error", () => resolve(false));
        child.on("close", () => resolve(true));
    });
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
    return new Promise((resolve) => {
        let stderr = "";
        let settled = false;
        const child = spawn("ffmpeg", args, {stdio: ["ignore", "ignore", "pipe"]});
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, timeoutMs);
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({code, stderr});
        });
        child.on("error", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({code: null, stderr: "spawn failed"});
        });
    });
}

export async function POST(request: NextRequest) {
    let body: { folder?: string; file?: string; startSec?: number; endSec?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file} = body;
    const startSec = Number(body.startSec);
    const endSec = Number(body.endSec);
    if (!folder || !file || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
        return NextResponse.json({error: "Missing folder, file, startSec or endSec."}, {status: 400});
    }
    if (startSec < 0 || endSec <= startSec || endSec - startSec > MAX_SECONDS) {
        return NextResponse.json({error: "Bad time window (0 ≤ start < end, max 12 h)."}, {status: 400});
    }

    const folderName = deslugify(folder);
    const relFile = deslugify(file);
    if (
        !folderName ||
        !relFile ||
        relFile.includes("..") ||
        relFile.includes("\\") ||
        relFile.startsWith("/")
    ) {
        return NextResponse.json({error: "Invalid file reference."}, {status: 400});
    }
    const ext = path.extname(relFile).toLowerCase();
    if (!MEDIA_EXTS.has(ext)) {
        return NextResponse.json({error: `Not a media file (${ext}).`}, {status: 400});
    }
    const abs = path.join(getScriptsRoot(), folderName, relFile);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const st = await fs.stat(/* turbopackIgnore: true */ abs);
        if (!st.isFile()) throw new Error("not a file");
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    if (!(await probeFfmpeg())) {
        return NextResponse.json(
            {
                error: "ffmpeg is not installed on this machine, so trim/export is unavailable.",
                hint: "Install ffmpeg (winget install ffmpeg / brew install ffmpeg / apt install ffmpeg) and try again.",
            },
            {status: 501}
        );
    }

    const duration = endSec - startSec;
    const base = relFile.slice(0, -ext.length);
    const outRel = `${base}.trimmed${ext}`;
    const outAbs = path.join(getScriptsRoot(), folderName, outRel);
    const args = [
        "-y",
        "-ss", startSec.toFixed(3),
        "-t", duration.toFixed(3),
        "-i", abs,
        "-c", "copy",
        outAbs,
    ];
    const res = await runFfmpeg(args, TIMEOUT_MS);
    if (res.code !== 0) {
        // Stream copy can fail on keyframe-unaligned cuts — retry with a
        // re-encode (still fast for short clips). The AUDIO codec follows
        // the output extension: forcing AAC into a .wav/.mp3 container
        // fails outright ("could not find tag for codec aac in stream"),
        // which used to kill the whole trim for non-mp4 outputs.
        const outExt = (outAbs.split(".").pop() ?? "").toLowerCase();
        const audioCodec =
            outExt === "wav" ? "pcm_s16le" :
                outExt === "mp3" ? "libmp3lame" :
                    outExt === "m4a" || outExt === "mp4" || outExt === "mov" || outExt === "mkv" || outExt === "webm" ? "aac" :
                        "aac";
        const reencodeArgs = [
            "-y",
            "-ss", startSec.toFixed(3),
            "-t", duration.toFixed(3),
            "-i", abs,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-c:a", audioCodec,
            outAbs,
        ];
        const retry = await runFfmpeg(reencodeArgs, TIMEOUT_MS);
        if (retry.code !== 0) {
            return NextResponse.json(
                {error: "ffmpeg failed to trim this file.", hint: retry.stderr.split("\n").slice(-4).join(" ")},
                {status: 422}
            );
        }
    }
    const stat = await fs.stat(outAbs).catch(() => null);
    return NextResponse.json({
        ok: true,
        file: outRel,
        bytes: stat?.size ?? 0,
        seconds: duration,
    });
}
