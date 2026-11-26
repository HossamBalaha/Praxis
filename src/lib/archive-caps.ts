import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import {rarJsAvailable} from "@/lib/rar-extract";

/**
 * Archive helper capability probing — which extractor binaries exist
 * on THIS machine. Probed once per process, cached; every consumer
 * (the /api/archive routes, the viewer UI) reports the formats the
 * host can actually handle instead of a hardcoded list.
 *
 * 7-ZIP: besides any system 7z / 7za / 7zr, the app VENDORS a
 * `bin/7za` binary (copied from the 7zip-bin npm package at build
 * time — scripts/copy-standalone.mjs carries it into the standalone
 * build). It is probed FIRST so .7z list + extract work out of the
 * box even on hosts with no 7-Zip installed.
 *
 * BSDTAR is probed SEPARATELY from the 7-Zip family: it accepts
 * tar-style flags (-tf / -xf), not 7z's (l -slt / x -o…), so it must
 * never be recorded as the 7-Zip binary — only as a last-resort
 * fallback for archives libarchive can read.
 */

export interface ArchiveCapabilities {
    tar: boolean;
    /** In-process RAR support through the bundled WASM unrar (no
     *  system binary needed). */
    rarJs: boolean;
    unrar: boolean;
    unrarFlavor: "none" | "free" | "rarlab";
    /** The binary name to spawn for unrar ("unrar" or "unrar-free"). */
    unrarBin: string | null;
    xz: boolean;
    bzip2: boolean;
    p7zip: boolean;
    /** Absolute path of the 7-Zip binary to use (vendored or system). */
    p7zipBin: string | null;
    /** A real 7z binary whose build includes the RAR codec (p7zip-rar). */
    p7zipRar: boolean;
    /** bsdtar exists (tar-style flags; libarchive format support). */
    bsdtar: boolean;
}

let cachedCaps: ArchiveCapabilities | null = null;
let probing: Promise<ArchiveCapabilities> | null = null;

/** The vendored 7za shipped with the app (bin/7za next to the server
 * root). Returns null when the file does not exist (e.g. an unusual
 * deployment without the bin folder). */
export function vendored7zaPath(): string | null {
    try {
        const p = path.join(process.cwd(), "bin", "7za");
        try {
            fs.accessSync(p, fs.constants.X_OK);
            return p;
        } catch {
            return null;
        }
    } catch {
        return null;
    }
}

/** Capture a binary's stdout+stderr for a short-lived probe. */
function capture(bin: string, args: string[]): Promise<{ code: number; out: string } | null> {
    return new Promise((resolve) => {
        try {
            const child = spawn(bin, args, {stdio: ["ignore", "pipe", "pipe"]});
            let out = "";
            child.stdout?.on("data", (c) => (out += c.toString()));
            child.stderr?.on("data", (c) => (out += c.toString()));
            child.on("error", () => resolve(null));
            child.on("close", (code) => resolve({code: code ?? -1, out}));
        } catch {
            resolve(null);
        }
    });
}

function probe(bin: string): Promise<boolean> {
    return capture(bin, ["--version"]).then((r) => r !== null);
}

/** Does a `7z i` banner include the RAR codec (p7zip-rar installed)? */
function sevenZipSupportsRar(out: string): boolean {
    // The Formats table lists one row per handler, e.g.
    //   C   F        rar       rar          52 61 72 21
    // Match a format-id "rar" column (word-bounded so "rar5" alone
    // without a base "rar" row still counts — they appear together).
    return /^\s*\S*\s*\S*\s*rar5?\s/m.test(out) || /\brar\b/i.test(out.split("Formats:")[1] ?? "");
}

export function archiveCapabilities(): Promise<ArchiveCapabilities> {
    if (cachedCaps) return Promise.resolve(cachedCaps);
    if (probing) return probing;
    probing = (async () => {
        const caps: ArchiveCapabilities = {
            tar: await probe("tar"),
            rarJs: await rarJsAvailable(),
            unrar: false,
            unrarFlavor: "none",
            unrarBin: null,
            xz: await probe("xz"),
            bzip2: await probe("bzip2"),
            p7zip: false,
            p7zipBin: null,
            p7zipRar: false,
            bsdtar: false,
        };
        // 7-Zip chain: the VENDORED binary first (always present in a
        // normal install), then the system binaries. The first one that
        // actually answers wins — `probe` only checks spawnability, so a
        // binary that spawns but errors still counts (p7zip answers `i`
        // with its banner; the flag is harmless for the others).
        // bsdtar is NOT part of this chain (different flag syntax).
        const candidates: Array<{ bin: string; args: string[] }> = [];
        const vendored = vendored7zaPath();
        if (vendored) candidates.push({bin: vendored, args: ["i"]});
        candidates.push({bin: "7z", args: ["i"]}, {bin: "7za", args: ["i"]}, {bin: "7zr", args: ["i"]});
        for (const c of candidates) {
            const r = await capture(c.bin, c.args);
            if (r !== null) {
                caps.p7zip = true;
                caps.p7zipBin = c.bin;
                caps.p7zipRar = sevenZipSupportsRar(r.out);
                break;
            }
        }
        // bsdtar — its own capability (tar-style flags).
        const bsdtarProbe = await capture("bsdtar", ["--version"]);
        caps.bsdtar = bsdtarProbe !== null;
        // unrar flavor detection: rarlab's unrar answers `unrar` (no
        // args) with a usage banner starting "UNRAR"; unrar-free prints
        // "unrar-free". The two take DIFFERENT flags (lb/x -o+ vs
        // -t/-x -f), so the route needs to know which one it has. Some
        // distros ship the binary as `unrar-free` only — probe that name
        // too and remember which one answered.
        let unrarBin: string | null = null;
        for (const b of ["unrar", "unrar-free"]) {
            const r = await capture(b, []);
            if (r) {
                unrarBin = b;
                caps.unrar = true;
                if (/unrar-free/i.test(r.out)) caps.unrarFlavor = "free";
                else caps.unrarFlavor = "rarlab";
                break;
            }
        }
        caps.unrarBin = unrarBin;
        cachedCaps = caps;
        return caps;
    })();
    return probing;
}

/** The unrar binary name to spawn ("unrar", "unrar-free", or null). */
export async function unrarBinaryName(): Promise<string | null> {
    const c = await archiveCapabilities();
    return c.unrarBin ?? "unrar";
}

/** The archive formats supported on this machine, as a human sentence
 * for unsupported-format messages. */
export async function supportedFormatsSentence(): Promise<string> {
    const c = await archiveCapabilities();
    const parts: string[] = [".zip (built-in)"];
    if (c.tar) parts.push(".tar / .tar.gz / .tgz / .tar.bz2 / .tbz2 / .tar.xz / .txz (tar)");
    parts.push("single-file .gz" + (c.xz ? " / .xz" : "") + " (zlib" + (c.xz ? " / xz" : "") + ")");
    if (c.bzip2) parts.push("single-file .bz2 (bzip2)");
    if (c.rarJs) {
        parts.push(".rar (built-in WASM unrar)");
    } else if (c.unrar || c.p7zipRar) {
        const via = c.unrar ? (c.unrarFlavor === "free" ? "unrar-free" : "unrar") : "7-zip";
        parts.push(`.rar (${via})`);
    }
    if (c.p7zip || c.bsdtar) parts.push(".7z (7-zip" + (c.bsdtar && !c.p7zip ? " via bsdtar" : "") + ")");
    return parts.join(", ");
}
