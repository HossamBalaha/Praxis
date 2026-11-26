import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {gunzipSync} from "node:zlib";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {extractAll as extractAllJs, parseZipCentralDirectory, ZIP_LIMITS} from "@/lib/unzip";
import {archiveCapabilities, unrarBinaryName} from "@/lib/archive-caps";
import {extractRar, listRar} from "@/lib/rar-extract";

/**
 * POST /api/archive — inspect and extract COMPRESSED FILES opened in
 * the explorer, with different options per format:
 *
 *   action: "list"   — list the archive's entries
 *                      (.zip via the pure-JS central-directory parser;
 *                       .tar / .tar.gz / .tgz via the system `tar`)
 *   action: "extract"
 *     dest: "here"     — extract into the containing folder
 *     dest: "subfolder" — extract into a NEW subfolder (name provided,
 *                        defaults to the archive's base name)
 *   .gz (single-file gzip) is decompressed with node:zlib into the
 *   sibling file with the .gz suffix stripped.
 *
 * The formats handled depend on the extractor binaries present on the
 * host (probed once — lib/archive-caps): unrar adds .rar, xz adds
 * single-file .xz, bzip2 adds single-file .bz2. Formats with no
 * available handler answer with a clear `unsupported` error that
 * lists what IS supported on this machine — the viewer card then
 * offers only Download.
 *
 * Body: { action, folder, file, dest?, subfolderName? }
 *
 * Safety: same slug/traversal guards as /api/compress; ZIP extraction
 * enforces the shared ZIP_LIMITS caps; `tar` runs with an explicit
 * argument list (no shell), -k never overwrites promptlessly (-k
 * keeps existing files).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARCHIVE_RE = /\.(zip|tar|tgz|gz|bz2|xz|7z|rar|tar\.gz|tar\.bz2|tar\.xz|tbz2|txz)$/i;

function validFileSlug(fileName: string): boolean {
    return !(
        fileName.includes("..") || fileName.includes("\\") ||
        fileName.startsWith("/") || fileName.endsWith("/") ||
        fileName.split("/").some((seg) => !seg || seg.startsWith("."))
    );
}

/** A safe subfolder name for extraction (no separators, no ".."). */
function sanitizeSubfolderName(raw: string): string | null {
    const cleaned = raw.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_").trim();
    if (!cleaned || cleaned.startsWith(".") || cleaned.length > 80) return null;
    return cleaned;
}

/** Spawn a helper binary; resolves { code, stderr }. */
function run(bin: string, args: string[], opts?: { cwd?: string }): Promise<{ code: number; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(bin, args, {stdio: ["ignore", "ignore", "pipe"], cwd: opts?.cwd});
        let stderr = "";
        child.stderr?.on("data", (c) => (stderr += c.toString()));
        child.on("error", (err) => resolve({code: -1, stderr: err.message}));
        child.on("close", (code) => resolve({code: code ?? -1, stderr}));
    });
}

/** Decompress a single-file stream (xz / bzip2 / gzip via the matching
 *  binary) into an output path; resolves { code, stderr, bytes }. The
 *  promise settles only after the CHILD exits and the output stream
 *  closed — the pipe can finish before the process does. */
function runStream(bin: string, args: string[], outPath: string): Promise<{
    code: number;
    stderr: string;
    bytes: number
}> {
    return new Promise((resolve) => {
        import("node:fs").then((fs) => {
            const out = fs.createWriteStream(outPath);
            const child = spawn(bin, args, {stdio: ["ignore", "pipe", "pipe"]});
            let stderr = "";
            let bytes = 0;
            let exitCode: number | null = null;
            let childDone = false;
            let outDone = false;
            const settle = () => {
                if (childDone && outDone) {
                    resolve({code: exitCode ?? -1, stderr, bytes});
                }
            };
            child.stderr?.on("data", (c) => (stderr += c.toString()));
            child.stdout?.on("data", (c) => (bytes += c.length));
            child.stdout?.pipe(out);
            out.on("error", (err) => {
                child.kill();
                resolve({code: -1, stderr: err.message, bytes});
            });
            child.on("error", (err) => {
                out.destroy();
                resolve({code: -1, stderr: err.message, bytes});
            });
            child.on("close", (code) => {
                exitCode = code ?? -1;
                childDone = true;
                settle();
            });
            out.on("close", () => {
                outDone = true;
                settle();
            });
        });
    });
}

interface ArchiveEntryInfo {
    name: string;
    size: number;
    isDir: boolean;
}

/** Parse one `tar -tvf` line into { name, size, isDir }. Handles both
 *  GNU tar (`mode owner/group size date time name`) and bsdtar
 *  (`mode nlink owner group size Mon DD HH:MM name`); the NAME may
 *  contain spaces (it is sliced by character offset, not split). */
function parseTarVerboseLine(line: string): { name: string; size: number; isDir: boolean } | null {
    const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    // Tokenize with offsets so the name can be sliced exactly.
    const toks: { t: string; start: number }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) toks.push({t: m[0], start: m.index});
    if (toks.length < 6) return null;
    const mode = toks[0].t;
    if (!/^[ldbcps-]/.test(mode)) return null;
    // Locate the date column: an ISO date or a month abbreviation.
    let di = -1;
    for (let i = 1; i < Math.min(toks.length, 8); i++) {
        if (ISO_DATE.test(toks[i].t) || MONTH.test(toks[i].t)) {
            di = i;
            break;
        }
    }
    // Need at least mode + one owner-ish token + size before the date.
    if (di < 3) return null;
    // The size is the all-digit token immediately before the date.
    const sizeTok = toks[di - 1].t;
    if (!/^\d+$/.test(sizeTok)) return null;
    // The name starts after the date+time run: ISO date → 1 time token;
    // month form ("Nov 17 18:03") → day + time tokens.
    let ni = MONTH.test(toks[di].t) ? di + 3 : di + 2;
    if (ni >= toks.length) return null;
    const name = line.slice(toks[ni].start).trim();
    if (!name) return null;
    return {
        name,
        size: Number.parseInt(sizeTok, 10) || 0,
        isDir: mode.startsWith("d") || name.endsWith("/"),
    };
}

export async function POST(request: Request) {
    let body: {
        action?: "list" | "extract" | "capabilities";
        folder?: string;
        file?: string;
        dest?: "here" | "subfolder";
        subfolderName?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    // The capability probe — no file needed, answers which extractor
    // binaries this host has so the viewer can list the REAL format
    // support instead of a hardcoded set.
    if (body.action === "capabilities") {
        return NextResponse.json({ok: true, capabilities: await archiveCapabilities()});
    }

    const action = body.action === "extract" ? "extract" : "list";

    const folderSlug = body.folder ?? "";
    const fileSlug = body.file ?? "";
    if (!folderSlug || !fileSlug) {
        return NextResponse.json({error: "Missing 'folder' or 'file'."}, {status: 400});
    }
    const folderName = deslugify(folderSlug);
    if (!folderName || folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const relFile = deslugify(fileSlug);
    if (!relFile || !validFileSlug(relFile)) {
        return NextResponse.json({error: "Invalid file path."}, {status: 400});
    }

    const root = getScriptsRoot();
    const archivePath = path.join(root, folderName, relFile);
    const rel = path.relative(root, archivePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    const baseName = path.basename(relFile);
    const lower = baseName.toLowerCase();
    if (!ARCHIVE_RE.test(baseName)) {
        return NextResponse.json({error: "Not a compressed archive."}, {status: 400});
    }
    const caps = await archiveCapabilities();
    const isZip = lower.endsWith(".zip");
    const isTar = lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz") ||
        lower.endsWith(".tar.bz2") || lower.endsWith(".tar.xz") || lower.endsWith(".tbz2") || lower.endsWith(".txz");
    const isGz = !isTar && lower.endsWith(".gz");
    const isXz = !isTar && lower.endsWith(".xz");
    const isBz2 = !isTar && lower.endsWith(".bz2");
    const isRar = lower.endsWith(".rar");
    const is7z = lower.endsWith(".7z");
    // Capability gate: each format needs a handler present. .7z works
    // through a real 7-Zip binary OR bsdtar (tar-style flags); .rar
    // through the BUILT-IN WASM unrar, or unrar / unrar-free, or a 7z
    // build with the RAR codec.
    const supported =
        isZip ||
        (isTar && caps.tar) ||
        isGz ||
        (isXz && caps.xz) ||
        (isBz2 && caps.bzip2) ||
        (isRar && (caps.rarJs || caps.unrar || caps.p7zipRar)) ||
        (is7z && (caps.p7zip || caps.bsdtar));

    try {
        const st = await fs.stat(archivePath);
        if (!st.isFile()) return NextResponse.json({error: "Not a file."}, {status: 400});
        if (st.size > 512 * 1024 * 1024) {
            return NextResponse.json({error: "Archive is larger than the 512 MB inline limit — download it instead."}, {status: 413});
        }
    } catch {
        return NextResponse.json({error: "Archive not found."}, {status: 404});
    }

    if (!supported) {
        const {supportedFormatsSentence} = await import("@/lib/archive-caps");
        return NextResponse.json(
            {
                ok: false,
                unsupported: true,
                error: `${baseName}: no inline handler for this archive format on this machine (available here: ${await supportedFormatsSentence()}). Use Download and extract it locally.`,
            },
            {status: 415}
        );
    }

    /* ── Single-file .xz / .bz2 → decompress beside the archive ── */
    if (isXz || isBz2) {
        const suffix = isXz ? ".xz" : ".bz2";
        const bin = isXz ? "xz" : "bzip2";
        const outName = baseName.replace(new RegExp(suffix.replace(".", "\\.") + "$", "i"), "") || `${baseName}.out`;
        const outPath = path.join(path.dirname(archivePath), outName);
        const res = await runStream(bin, ["-dc", archivePath], outPath);
        if (res.code !== 0) {
            return NextResponse.json({error: `${bin} failed (is ${bin} installed?). ${res.stderr}`.trim()}, {status: 500});
        }
        if (res.bytes > ZIP_LIMITS.maxTotalBytes) {
            await fs.rm(outPath, {force: true});
            return NextResponse.json({error: "Decompressed file exceeds the size limit."}, {status: 413});
        }
        return NextResponse.json({ok: true, kind: isXz ? "xz" : "bz2", path: outName, size: res.bytes});
    }

    /* ── Single-file .gz → decompress beside the archive ────────── */
    if (isGz) {
        const outName = baseName.replace(/\.gz$/i, "") || `${baseName}.out`;
        const outPath = path.join(path.dirname(archivePath), outName);
        try {
            const buf = await fs.readFile(archivePath);
            const out = gunzipSync(buf);
            if (out.length > ZIP_LIMITS.maxTotalBytes) {
                return NextResponse.json({error: "Decompressed file exceeds the size limit."}, {status: 413});
            }
            await fs.writeFile(outPath, out);
            return NextResponse.json({ok: true, kind: "gz", path: outName, size: out.length});
        } catch (err) {
            return NextResponse.json({error: `gunzip failed: ${(err as Error).message}`}, {status: 500});
        }
    }

    /* ── .zip listing via the pure-JS central directory ─────────── */
    if (isZip && action === "list") {
        try {
            const buf = await fs.readFile(archivePath);
            const entries = parseZipCentralDirectory(buf);
            const list: ArchiveEntryInfo[] = entries
                .filter((e) => !e.name.includes("__MACOSX/") && path.basename(e.name) !== ".DS_Store")
                .slice(0, 500)
                .map((e) => ({name: e.name, size: e.uncompressedSize, isDir: e.isDirectory}));
            return NextResponse.json({
                ok: true,
                kind: "zip",
                entries: list,
                totalEntries: entries.length,
                truncated: entries.length > 500,
            });
        } catch (err) {
            return NextResponse.json({error: `Could not read the ZIP: ${(err as Error).message}`}, {status: 500});
        }
    }

    /* ── .rar listing — the BUILT-IN WASM unrar first (works on every
     *  host, no system binary needed, and reports real uncompressed
     *  sizes), then the system-binary chain: unrar (flavor-aware) with
     *  a 7-Zip fallback when its build carries the RAR codec.
     *  • rarlab's unrar `lb -y` prints bare entry names.
     *  • unrar-free `-t` prints a banner + header, then per entry a
     *    NAME line followed by a "size date time attr" line, closed by
     *    dashed separators and a summary row — parse the PAIRS between
     *    the separators and drop everything else.
     *  • 7z `l -slt` prints the same structured blocks the .7z branch
     *    parses. */
    if (isRar && action === "list") {
        const entries: ArchiveEntryInfo[] = [];
        if (caps.rarJs) {
            try {
                const buf = await fs.readFile(archivePath);
                entries.push(...(await listRar(buf)));
            } catch (err) {
                return NextResponse.json(
                    {error: `Could not read the RAR archive: ${(err as Error).message}`},
                    {status: 500}
                );
            }
        }
        if (caps.unrar && entries.length === 0) {
            const bin = (await unrarBinaryName()) ?? "unrar";
            if (caps.unrarFlavor === "free") {
                const res = await new Promise<{ code: number; out: string }>((resolve) => {
                    // turbopackIgnore: the binary is resolved at RUNTIME (unrar
                    // vs 7za per machine) — the tracer must not statically follow it
                    // and drag the whole project into the server trace.
                    const child = spawn(/*turbopackIgnore: true*/ bin, ["-t", "--", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
                    let out = "";
                    child.stdout?.on("data", (c) => (out += c.toString()));
                    child.on("error", () => resolve({code: -1, out: ""}));
                    child.on("close", (code) => resolve({code: code ?? -1, out}));
                });
                // unrar-free exits NON-ZERO on recoverable warnings (e.g. a
                // "Pathname cannot be converted from UTF-16BE" notice rides
                // stderr while the listing itself is complete) — parse the
                // stdout whenever it carries the dashed entry table; the
                // entries.length check below rejects genuinely broken output.
                if (res.code === 0 || /^-+\s*$/m.test(res.out)) {
                    const lines = res.out.split("\n").map((l) => l.replace(/\r$/, ""));
                    const isDash = (l: string) => /^-+\s*$/.test(l);
                    const first = lines.findIndex(isDash);
                    let last = -1;
                    for (let i = lines.length - 1; i > first; i--) {
                        if (isDash(lines[i])) {
                            last = i;
                            break;
                        }
                    }
                    // Entry rows sit between the first and last dashed separator;
                    // each entry = a NAME line + a meta line (size/date/attr).
                    if (first >= 0) {
                        const endIdx = last > first ? last : lines.length;
                        for (let i = first + 1; i < endIdx; i++) {
                            const nameLine = lines[i];
                            const metaLine = lines[i + 1] ?? "";
                            if (isDash(nameLine)) continue;
                            if (!nameLine.trim()) continue;
                            // The meta line starts with the size column; a name line
                            // does not. Only treat the pair as an entry when the
                            // NEXT line looks like the meta row.
                            const metaMatch = /^\s*([\d.]+)\s+\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}/.exec(metaLine);
                            if (!metaMatch) continue;
                            const name = nameLine.replace(/^\s+/, "");
                            entries.push({
                                name,
                                size: Number.parseInt(metaMatch[1], 10) || 0,
                                isDir: /d/i.test(metaLine.split(/\s+/).at(-1) ?? "") || name.endsWith("/")
                            });
                            i++; // consume the meta line
                        }
                    }
                }
            } else {
                const res = await new Promise<{ code: number; out: string }>((resolve) => {
                    const child = spawn(/*turbopackIgnore: true*/ bin, ["lb", "-y", "--", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
                    let out = "";
                    child.stdout?.on("data", (c) => (out += c.toString()));
                    child.on("error", () => resolve({code: -1, out: ""}));
                    child.on("close", (code) => resolve({code: code ?? -1, out}));
                });
                if (res.code === 0) {
                    for (const l of res.out.split("\n")) {
                        const name = l.trim();
                        if (name && !/^unrar(-free)?\b/i.test(name) && !/Copyright|Usage:|^Try /i.test(name)) {
                            entries.push({name, size: 0, isDir: name.endsWith("/")});
                        }
                    }
                }
            }
        }
        // 7z-with-RAR fallback (p7zip-rar installed).
        if (entries.length === 0 && caps.p7zipRar && caps.p7zipBin) {
            const res = await new Promise<{ code: number; out: string }>((resolve) => {
                const child = spawn(caps.p7zipBin as string, ["l", "-slt", "--", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
                let out = "";
                child.stdout?.on("data", (c) => (out += c.toString()));
                child.on("error", () => resolve({code: -1, out: ""}));
                child.on("close", (code) => resolve({code: code ?? -1, out}));
            });
            if (res.code === 0) {
                let cur: { name?: string; size?: number; isDir?: boolean } | null = null;
                let pastHeader = false;
                for (const line of res.out.split("\n")) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("----------")) {
                        pastHeader = true;
                        continue;
                    }
                    if (!pastHeader) continue;
                    const m = /^(\w+) = (.*)$/.exec(trimmed);
                    if (!m) continue;
                    const [, key, value] = m;
                    if (key === "Path") {
                        if (cur?.name) entries.push({name: cur.name, size: cur.size ?? 0, isDir: !!cur.isDir});
                        cur = {name: value};
                    } else if (cur && key === "Size") cur.size = Number.parseInt(value, 10) || 0;
                    else if (cur && key === "Attributes") cur.isDir = value.includes("D");
                }
                if (cur?.name) entries.push({name: cur.name, size: cur.size ?? 0, isDir: !!cur.isDir});
            }
        }
        const list = entries
            .filter((e) => !e.name.includes("__MACOSX/") && path.basename(e.name) !== ".DS_Store")
            .slice(0, 500);
        if (list.length === 0) {
            return NextResponse.json(
                {error: `no RAR handler could list the archive (built-in WASM unrar: ${caps.rarJs ? "loaded but empty" : "missing"}, unrar: ${caps.unrar ? caps.unrarFlavor : "missing"}, 7z RAR codec: ${caps.p7zipRar ? "yes" : "no"}).`},
                {status: 500}
            );
        }
        return NextResponse.json({
            ok: true,
            kind: "rar",
            entries: list,
            totalEntries: entries.length,
            truncated: entries.length > 500
        });
    }

    /* ── .tar listing via the system tar binary — VERBOSE (-tvf) so
     *  every entry carries its real uncompressed size, not just the
     *  name. GNU tar prints `mode owner/group size date time name`
     *  (owner/group share one token); bsdtar prints `mode nlink owner
     *  group size Mon DD HH:MM name`. Both shapes are parsed by
     *  locating the date column, taking the all-digit token right
     *  before it as the size, and slicing the name from the token
     *  after the time — names with spaces survive intact. */
    if (isTar && action === "list") {
        const verbose = await new Promise<string>((resolve) => {
            const child = spawn("tar", ["-tvf", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
            let out = "";
            child.stdout?.on("data", (c) => (out += c.toString()));
            child.stderr?.on("data", () => { /* warnings don't fail the listing */
            });
            child.on("error", () => resolve(""));
            child.on("close", () => resolve(out));
        });
        const lines = verbose.split("\n").map((l) => l.replace(/\r$/, ""));
        const names: { name: string; size: number; isDir: boolean }[] = [];
        for (const line of lines) {
            const parsed = parseTarVerboseLine(line);
            if (parsed) names.push(parsed);
        }
        if (names.length === 0) {
            return NextResponse.json(
                {error: "tar could not list the archive (is tar installed?)."},
                {status: 500}
            );
        }
        const list: ArchiveEntryInfo[] = names.slice(0, 500).map((e) => ({
            name: e.name,
            size: e.size,
            isDir: e.isDir,
        }));
        return NextResponse.json({
            ok: true,
            kind: "tar",
            entries: list,
            totalEntries: names.length,
            truncated: names.length > 500,
        });
    }

    /* ── .7z listing — a real 7-Zip binary first (`l -slt`
     *  structured blocks), bsdtar as the fallback (`-tf`, tar-style
     *  flags — never 7z flags: this build family rejects them).
     *  LIST is its own branch so the viewer's automatic on-open `list`
     *  call never falls through to extraction (dest defaulting to
     *  "here") — merely OPENING a .7z must not extract it into its
     *  containing folder. */
    if (is7z && action === "list") {
        const entries: ArchiveEntryInfo[] = [];
        if (caps.p7zipBin) {
            const bin = caps.p7zipBin;
            const res = await new Promise<{ code: number; out: string; stderr: string }>((resolve) => {
                const child = spawn(bin, ["l", "-slt", "--", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
                let out = "";
                let stderr = "";
                child.stdout?.on("data", (c) => (out += c.toString()));
                child.stderr?.on("data", (c) => (stderr += c.toString()));
                child.on("error", () => resolve({code: -1, out: "", stderr: "spawn failed"}));
                child.on("close", (code) => resolve({code: code ?? -1, out, stderr}));
            });
            if (res.code === 0) {
                let cur: { name?: string; size?: number; isDir?: boolean } | null = null;
                // `l -slt` prints a HEADER block first (Path = the archive's own
                // path, Type, PhysicalSize…) before the "----------" separator
                // and the per-entry blocks — skip it so the archive path itself
                // never shows up as an entry.
                let pastHeader = false;
                for (const line of res.out.split("\n")) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("----------")) {
                        pastHeader = true;
                        continue;
                    }
                    if (!pastHeader) continue;
                    const m = /^(\w+) = (.*)$/.exec(trimmed);
                    if (!m) continue;
                    const [, key, value] = m;
                    if (key === "Path") {
                        if (cur?.name) entries.push({name: cur.name, size: cur.size ?? 0, isDir: !!cur.isDir});
                        cur = {name: value};
                    } else if (cur && key === "Size") {
                        cur.size = Number.parseInt(value, 10) || 0;
                    } else if (cur && key === "Attributes") {
                        cur.isDir = value.includes("D");
                    }
                }
                if (cur?.name) entries.push({name: cur.name, size: cur.size ?? 0, isDir: !!cur.isDir});
            }
        }
        // bsdtar fallback — libarchive reads many .7z archives; `-tvf`
        // prints the same verbose rows as tar (mode/owner/size/date/name),
        // parsed with the shared helper so sizes are reported too.
        if (entries.length === 0 && caps.bsdtar) {
            const res = await new Promise<{ code: number; out: string }>((resolve) => {
                const child = spawn("bsdtar", ["-tvf", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
                let out = "";
                child.stdout?.on("data", (c) => (out += c.toString()));
                child.stderr?.on("data", () => { /* warnings don't fail the listing */
                });
                child.on("error", () => resolve({code: -1, out: ""}));
                child.on("close", (code) => resolve({code: code ?? -1, out}));
            });
            if (res.code === 0) {
                for (const l of res.out.split("\n")) {
                    const parsed = parseTarVerboseLine(l.replace(/\r$/, ""));
                    if (parsed) entries.push({name: parsed.name, size: parsed.size, isDir: parsed.isDir});
                }
            }
        }
        const list = entries
            .filter((e) => !e.name.includes("__MACOSX/") && path.basename(e.name) !== ".DS_Store")
            .slice(0, 500);
        if (list.length === 0) {
            return NextResponse.json(
                {error: `7-zip could not list the archive. Install 7-Zip (or p7zip) for full .7z support.`},
                {status: 500}
            );
        }
        return NextResponse.json({
            ok: true,
            kind: "7z",
            entries: list,
            totalEntries: entries.length,
            truncated: entries.length > 500
        });
    }

    /* ── Extraction ──────────────────────────────────────────────── */
    // The subfolder name arrives with the request; the tracer cannot see
    // that it stays inside the scripts root (the guard right below
    // enforces that, so the dynamic join is safe at runtime).
    const dest =
        body.dest === "subfolder"
            ? path.join(
                /*turbopackIgnore: true*/
                path.dirname(archivePath),
                sanitizeSubfolderName(body.subfolderName ?? baseName.replace(/\.[^.]+(\.[^.]+)?$/, "")) ?? "extracted"
            )
            : path.dirname(archivePath);

    // Keep the extraction inside the scripts root.
    const destRel = path.relative(root, dest);
    if (destRel.startsWith("..") || path.isAbsolute(destRel)) {
        return NextResponse.json({error: "Destination blocked."}, {status: 400});
    }

    if (isZip) {
        try {
            const buf = await fs.readFile(archivePath);
            const count = await extractAllJs(buf, dest, fs, path);
            return NextResponse.json({ok: true, kind: "zip", path: path.relative(root, dest), count});
        } catch (err) {
            return NextResponse.json({error: `Extraction failed: ${(err as Error).message}`}, {status: 500});
        }
    }

    // .rar — the BUILT-IN WASM unrar first (no system binary needed);
    // then unrar / unrar-free (flavor-aware flags), with a 7-Zip
    // fallback when its build carries the RAR codec.
    if (isRar) {
        if (caps.rarJs) {
            try {
                const buf = await fs.readFile(archivePath);
                const count = await extractRar(buf, dest);
                return NextResponse.json({ok: true, kind: "rar", path: path.relative(root, dest), count});
            } catch (err) {
                return NextResponse.json({error: `RAR extraction failed: ${(err as Error).message}`}, {status: 500});
            }
        }
        await fs.mkdir(dest, {recursive: true});
        if (caps.unrar) {
            const bin = (await unrarBinaryName()) ?? "unrar";
            const res =
                caps.unrarFlavor === "free"
                    ? await run(bin, ["-x", "-f", "--", archivePath, dest + path.sep])
                    : await run(bin, ["x", "-o+", "-y", "--", archivePath, dest + path.sep]);
            if (res.code !== 0) {
                // unrar-free exits NON-ZERO when a recoverable warning rode
                // stderr (e.g. the UTF-16BE pathname notice) even though every
                // file extracted. Verify by OUTCOME: list the archive and
                // accept the run when at least one entry now exists under dest.
                let extractedAny = false;
                if (caps.unrarFlavor === "free") {
                    const list = await new Promise<{ code: number; out: string }>((resolve) => {
                        // turbopackIgnore: the binary is resolved at RUNTIME (unrar
                        // vs 7za per machine) — the tracer must not statically follow it
                        // and drag the whole project into the server trace.
                        const child = spawn(/*turbopackIgnore: true*/ bin, ["-t", "--", archivePath], {stdio: ["ignore", "pipe", "pipe"]});
                        let out = "";
                        child.stdout?.on("data", (c) => (out += c.toString()));
                        child.on("error", () => resolve({code: -1, out: ""}));
                        child.on("close", (code) => resolve({code: code ?? -1, out}));
                    });
                    for (const line of list.out.split("\n")) {
                        const name = line.trim();
                        if (!name || /^-+\s*$/.test(name)) continue;
                        if (/^\s*[\d.]+\s+\d{2}-\d{2}-\d{2}/.test(line)) continue;
                        if (/unrar|Copyright|Usage|^RAR archive|Pathname\/Comment/i.test(name)) continue;
                        try {
                            const st = await fs.stat(path.join(dest, name));
                            if (st.isFile()) {
                                extractedAny = true;
                                break;
                            }
                        } catch { /* not there */
                        }
                    }
                }
                if (!extractedAny) {
                    return NextResponse.json(
                        {error: `unrar extraction failed (exit ${res.code}). ${res.stderr}`.trim()},
                        {status: 500}
                    );
                }
            }
            return NextResponse.json({ok: true, kind: "rar", path: path.relative(root, dest)});
        }
        if (caps.p7zipRar && caps.p7zipBin) {
            const res = await run(caps.p7zipBin, ["x", "-y", `-o${dest}`, "--", archivePath]);
            if (res.code !== 0) {
                return NextResponse.json(
                    {error: `7-zip RAR extraction failed (exit ${res.code}). ${res.stderr}`.trim()},
                    {status: 500}
                );
            }
            return NextResponse.json({ok: true, kind: "rar", path: path.relative(root, dest)});
        }
        return NextResponse.json({error: "No RAR extractor available on this machine."}, {status: 500});
    }

    // .7z — the 7-zip family: the capability probe's binary (the
    // VENDORED bin/7za first, then system 7z / 7za / 7zr), then the
    // others, with bsdtar (tar-style flags) as the final fallback.
    if (is7z) {
        await fs.mkdir(dest, {recursive: true});
        const sevenZipCandidates: Array<{ bin: string; args: string[] }> = [];
        if (caps.p7zipBin) {
            sevenZipCandidates.push({bin: caps.p7zipBin, args: ["x", "-y", `-o${dest}`, "--", archivePath]});
        }
        for (const b of ["7z", "7za", "7zr"]) {
            if (b !== caps.p7zipBin) {
                sevenZipCandidates.push({bin: b, args: ["x", "-y", `-o${dest}`, "--", archivePath]});
            }
        }
        sevenZipCandidates.push({bin: "bsdtar", args: ["-xf", archivePath, "-C", dest]});
        let last = {code: -1, stderr: "no 7-zip binary"};
        for (const candidate of sevenZipCandidates) {
            last = await run(candidate.bin, candidate.args);
            if (last.code === 0) break;
        }
        if (last.code !== 0) {
            return NextResponse.json(
                {error: `7-zip extraction failed (tried ${sevenZipCandidates.map((c) => c.bin).join(", ")}). ${last.stderr}`.trim()},
                {status: 500}
            );
        }
        return NextResponse.json({ok: true, kind: "7z", path: path.relative(root, dest)});
    }

    // tar — the system binary handles every tar flavor + compression.
    await fs.mkdir(dest, {recursive: true});
    const res = await run("tar", ["-xf", archivePath, "-C", dest]);
    if (res.code !== 0) {
        return NextResponse.json(
            {error: `tar extraction failed (is tar installed?). ${res.stderr}`.trim()},
            {status: 500}
        );
    }
    return NextResponse.json({ok: true, kind: "tar", path: path.relative(root, dest)});
}
