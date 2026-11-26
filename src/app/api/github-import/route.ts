import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {deslugify, getScriptsRoot, sanitizeSubPath, slugify} from "@/lib/scripts";
import {extractAll as extractAllJs, parseZipCentralDirectory} from "@/lib/unzip";

/**
 * POST /api/github-import — shallow-import a GitHub repo (zip archive)
 * or a gist into a NEW workspace folder.
 *
 * Body: { url, mode?: "repo" | "gist", ref?, subpath?, into? }
 *   url      github.com/<owner>/<repo>[/tree/<ref>[/subpath]]
 *            or gist.github.com/<id>
 *   into     desired target folder name (sanitized; uniquified on clash)
 *
 * Repo: the archive comes from codeload.github.com (refs/heads/<ref>,
 * falling back to refs/tags/<ref>; with no ref the default branch is
 * resolved via the GitHub API first). The zip is unpacked the same way
 * /api/upload-zip does — system `unzip` first, pure-JS extractor as the
 * fallback — the leading <repo>-<ref>/ root directory is stripped, and a
 * subpath keeps only that subtree.
 *
 * Gist: files come from the gist API (truncated bodies re-fetched from
 * their raw_url, skipped when that fails).
 *
 * The import lands in a new folder under the ACTIVE project root — the
 * same location /api/folder-create uses — with a small
 * `.praxis/source.json` { url, mode, ref, subpath, importedAt } persisted
 * inside so the folder can be reloaded from its source later.
 *
 * Caps: 100 MB archive, 5000 files. Network-level failures (DNS,
 * refused, timeout) answer { ok: false, offline: true, error } with a
 * clean message so the UI can show its offline hint.
 *
 * Response: { ok, folder (slug), name, files, url, ref? }.
 *
 * GET /api/github-import?folder=<slug> — reads that folder's
 * .praxis/source.json: { ok, hasSource, source? { url, mode, ref,
 * subpath, importedAt } }.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ZIP_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_FILES = 5000;
const API_TIMEOUT_MS = 15_000;
const ARCHIVE_TIMEOUT_MS = 60_000;

const GH_HEADERS: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "praxis-ide-import", // the GitHub API rejects UA-less clients
};

/* ── URL parsing (client mirror in open-from-url-dialog.tsx) ─────── */

interface ParsedRepo {
    kind: "repo";
    owner: string;
    repo: string;
    ref?: string;
    subpath?: string;
}

interface ParsedGist {
    kind: "gist";
    gistId: string;
}

function decodeSegment(seg: string): string {
    try {
        return decodeURIComponent(seg);
    } catch {
        return seg; // stray % — keep the raw text
    }
}

function parseGithubUrl(raw: string): ParsedRepo | ParsedGist | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let u: URL;
    try {
        u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
        return null;
    }
    const host = u.hostname.toLowerCase();
    if (host === "gist.github.com" || host === "www.gist.github.com") {
        const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
        if (/^[\w-]+$/.test(id)) return {kind: "gist", gistId: id};
        return null;
    }
    if (host !== "github.com" && host !== "www.github.com") return null;
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    const owner = decodeSegment(segs[0]);
    const repo = decodeSegment(segs[1]).replace(/\.git$/i, "");
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
    let ref: string | undefined;
    let subpath: string | undefined;
    if (segs.length >= 4 && segs[2] === "tree") {
        const refRaw = decodeSegment(segs[3]);
        if (refRaw && !refRaw.includes("..")) ref = refRaw;
        const rest = segs.slice(4).map(decodeSegment);
        if (rest.length) subpath = rest.join("/");
    }
    return {kind: "repo", owner, repo, ref, subpath};
}

/* ── offline / network detection ─────────────────────────────────── */

const NETWORK_CODES = new Set([
    "ENOTFOUND",
    "ECONNREFUSED",
    "ECONNRESET",
    "ECONNABORTED",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
]);

/** Best-effort detail string for a network-level fetch failure ("" when
 *  the error is probably NOT a network outage). */
function offlineDetail(err: unknown): string {
    const e = err as (NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException }) | null;
    const code = e?.code ?? e?.cause?.code;
    if (typeof code === "string" && NETWORK_CODES.has(code)) return code;
    if (err instanceof Error) {
        // undici wraps DNS/socket failures as TypeError("fetch failed"); a
        // fetch timeout surfaces as TimeoutError/AbortError.
        if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
        if (/^fetch failed$/i.test(err.message)) return "fetch failed";
    }
    return "";
}

function offlineResponse(detail: string): NextResponse {
    return NextResponse.json(
        {
            ok: false,
            offline: true,
            error: `GitHub is unreachable from this machine${detail ? ` (${detail})` : ""} — check the network connection and try again.`,
        },
        {status: 502}
    );
}

/* ── shared fetch helper ─────────────────────────────────────────── */

async function fetchGithubJson(
    url: string
): Promise<{ ok: true; data: unknown } | { ok: false; offline: boolean; status: number; message: string }> {
    try {
        const res = await fetch(url, {
            headers: GH_HEADERS,
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });
        if (!res.ok) {
            return {
                ok: false,
                offline: false,
                status: res.status,
                message: `GitHub API returned HTTP ${res.status}${res.status === 403 ? " (rate limit?)" : ""}.`,
            };
        }
        return {ok: true, data: await res.json()};
    } catch (err) {
        const detail = offlineDetail(err);
        if (detail) return {ok: false, offline: true, status: 0, message: detail};
        // Non-network throw from json parsing etc. — treat as a hard error.
        return {
            ok: false,
            offline: false,
            status: 500,
            message: (err as Error).message,
        };
    }
}

/* ── unpack helpers — copied from /api/upload-zip ─────────────────── */

/** Spawn `unzip` and resolve with the exit code. */
function runUnzip(zipPath: string, destDir: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn("unzip", ["-o", zipPath, "-d", destDir], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        if (child.stderr) {
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
        }
        child.on("error", (err) => {
            // ENOENT → `unzip` not installed; the caller falls back to the
            // pure-JS extractor. Any other spawn error is a real failure.
            const errAny = err as NodeJS.ErrnoException;
            if (errAny.code === "ENOENT") {
                reject(new Error("__unzip_not_installed__"));
            } else {
                reject(new Error(`Failed to spawn 'unzip': ${err.message}`));
            }
        });
        child.on("close", (code) => {
            if (code === 0) resolve(0);
            else reject(new Error(`unzip exited with code ${code}. ${stderr}`));
        });
    });
}

/** Write the buffer to a temp file inside the destination's own tree,
 *  unzip, clean up. Same binary/exit-code semantics as runUnzip. */
async function runUnzipBuffer(buf: Buffer, destDir: string): Promise<void> {
    const tmpZip = path.join(
        destDir,
        `.import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`
    );
    try {
        await fs.writeFile(tmpZip, buf);
        await runUnzip(tmpZip, destDir);
    } finally {
        try {
            await fs.unlink(tmpZip);
        } catch {
            // ignore
        }
    }
}

/** Unpack a GitHub archive buffer: system unzip first, then the
 *  pure-JS extractor fallback (extractAll handles stored + deflate,
 *  which covers GitHub's codeload zips). */
async function unpackArchive(buf: Buffer, destDir: string): Promise<void> {
    try {
        await runUnzipBuffer(buf, destDir);
    } catch (err) {
        const msg = (err as Error).message;
        if (msg === "__unzip_not_installed__" || /exited with code/.test(msg)) {
            try {
                const written = await extractAllJs(buf, destDir, fs, path);
                if (written === 0) parseZipCentralDirectory(buf); // throws if not a zip
            } catch (extractErr) {
                throw new Error(
                    `Could not extract the GitHub archive: ${(extractErr as Error).message}`
                );
            }
        } else {
            throw err;
        }
    }
}

/* ── folder naming (folder-create semantics) ─────────────────────── */

/** Sanitize a desired folder name into a filesystem-safe one
 *  (folder-create's rules, relaxed to allow dots in repo names). */
function sanitizeFolderName(name: string): string {
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/[\x00-\x1f]/g, "")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 64)
        .replace(/\.+$/, "");
    return cleaned || "github-import";
}

/** Pick a unique folder name under the scripts root (base, base-2, …). */
async function uniqueFolderName(base: string): Promise<string> {
    const root = getScriptsRoot();
    let candidate = base;
    for (let i = 2; i < 100; i++) {
        try {
            await fs.stat(path.join(root, candidate));
            candidate = `${base}-${i}`;
        } catch {
            return candidate; // free — take it
        }
    }
    return `${base}-${Date.now()}`;
}

/* ── post-unpack shaping ─────────────────────────────────────────── */

/** Count files (dot-directories skipped; .praxis is written after the
 *  count anyway). Early-exits past the cap — the caller errors out. */
async function countFiles(dir: string, depth = 0): Promise<number> {
    if (depth > 8) return 0;
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
        return 0;
    }
    let n = 0;
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isFile()) n++;
        else if (entry.isDirectory()) {
            n += await countFiles(path.join(dir, entry.name), depth + 1);
        }
        if (n > MAX_FILES) return n;
    }
    return n;
}

/** Strip the archive's single root wrapper directory (GitHub zips always
 *  have `<repo>-<ref>/`), or — with a subpath — keep ONLY that subtree.
 *  Same promotion trick /api/upload-zip uses for the no-subpath case. */
async function collapseArchiveRoot(destDir: string, cleanSub: string): Promise<void> {
    const entries = await fs.readdir(destDir, {withFileTypes: true});
    // Drop macOS noise some archivers smuggle in.
    for (const e of entries) {
        if (e.name === "__MACOSX") {
            await fs.rm(path.join(destDir, e.name), {recursive: true, force: true});
        }
    }
    const live = (await fs.readdir(destDir, {withFileTypes: true})).filter(
        (e) => e.name !== "__MACOSX"
    );
    const rootName =
        live.length === 1 && live[0].isDirectory() ? live[0].name : null;

    if (cleanSub) {
        const base = rootName ? path.join(destDir, rootName) : destDir;
        const sub = path.join(base, ...cleanSub.split("/"));
        const rel = path.relative(base, sub);
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
            throw new Error("Invalid subpath.");
        }
        let st: import("node:fs").Stats;
        try {
            st = await fs.stat(sub);
        } catch {
            throw new Error(`Subpath "${cleanSub}" was not found in the archive.`);
        }
        // Stage the wanted subtree aside, clear everything else, promote it.
        const staging = path.join(
            destDir,
            `.sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        await fs.rename(sub, staging);
        for (const e of await fs.readdir(destDir, {withFileTypes: true})) {
            if (path.join(destDir, e.name) === staging) continue;
            await fs.rm(path.join(destDir, e.name), {recursive: true, force: true});
        }
        if (st.isDirectory()) {
            for (const e of await fs.readdir(staging, {withFileTypes: true})) {
                await fs.rename(path.join(staging, e.name), path.join(destDir, e.name));
            }
            await fs.rmdir(staging);
        } else {
            await fs.rename(staging, path.join(destDir, path.basename(sub)));
        }
        return;
    }

    if (rootName) {
        const inner = path.join(destDir, rootName);
        for (const e of await fs.readdir(inner, {withFileTypes: true})) {
            try {
                await fs.rename(path.join(inner, e.name), path.join(destDir, e.name));
            } catch {
                // Name collision — skip (unzip -o already overwrote what it could).
            }
        }
        try {
            await fs.rmdir(inner);
        } catch {
            // ignore — leave the empty wrapper behind
        }
    }
}

/** Persist the import source for "reload from source". */
async function writeSourceJson(
    folderDir: string,
    source: {
        url: string;
        mode: "repo" | "gist";
        ref?: string;
        subpath: string;
    }
): Promise<void> {
    const dir = path.join(folderDir, ".praxis");
    await fs.mkdir(dir, {recursive: true});
    await fs.writeFile(
        path.join(dir, "source.json"),
        JSON.stringify(
            {...source, importedAt: new Date().toISOString()},
            null,
            2
        ) + "\n",
        "utf-8"
    );
}

/* ── POST ────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
    let body: {
        url?: string;
        mode?: string;
        ref?: string;
        subpath?: string;
        into?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const rawUrl = (body.url ?? "").trim();
    if (!rawUrl) {
        return NextResponse.json(
            {error: "Body must include 'url'."},
            {status: 400}
        );
    }
    const parsed = parseGithubUrl(rawUrl);
    if (!parsed) {
        return NextResponse.json(
            {
                error:
                    "Not a GitHub repository or gist URL. Expected github.com/<owner>/<repo> (optionally /tree/<ref>/<subpath>) or gist.github.com/<id>.",
            },
            {status: 400}
        );
    }
    // `mode` is advisory only — the URL shape decides.
    // A subpath from the body wins over one embedded in the URL.
    const urlSubpath = parsed.kind === "repo" ? parsed.subpath : undefined;
    const subpathRaw = (body.subpath ?? "").trim() || urlSubpath || "";
    const cleanSub = sanitizeSubPath(subpathRaw);
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid subpath."}, {status: 400});
    }

    const into = (body.into ?? "").trim();

    if (parsed.kind === "gist") {
        return importGist(parsed, rawUrl, into);
    }
    return importRepo(parsed, rawUrl, body, cleanSub, into);
}

/* ── repo import ────────────────────────────────────────────────── */

async function importRepo(
    parsed: ParsedRepo,
    rawUrl: string,
    body: { ref?: string },
    cleanSub: string,
    into: string
): Promise<NextResponse> {
    // Resolve the ref: body > URL tree segment > the repo's default branch
    // (GitHub API) > literal HEAD (codeload resolves it without a branch).
    let ref = (body.ref ?? "").trim() || parsed.ref || "";
    if (!ref) {
        const meta = await fetchGithubJson(
            `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`
        );
        if (!meta.ok) {
            if (meta.offline) return offlineResponse(meta.message);
            // API hiccup (rate limit, 403 on anonymous datacenter IPs, …) —
            // not fatal: codeload resolves HEAD to the default branch anyway.
            ref = "HEAD";
        } else {
            const branch =
                typeof (meta.data as { default_branch?: unknown }).default_branch === "string"
                    ? (meta.data as { default_branch: string }).default_branch
                    : "";
            ref = branch || "HEAD";
        }
    }

    // Fetch the archive — refs/heads first, then refs/tags (tree URLs also
    // carry tags); a literal HEAD uses the branch-free codeload form.
    const candidates =
        ref === "HEAD"
            ? [
                `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/HEAD`,
            ]
            : [
                `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/refs/heads/${ref}`,
                `https://codeload.github.com/${parsed.owner}/${parsed.repo}/zip/refs/tags/${ref}`,
            ];
    let res: Response | undefined;
    let offline: string | null = null;
    for (const candidate of candidates) {
        try {
            const attempt = await fetch(candidate, {
                headers: {"User-Agent": "praxis-ide-import"},
                signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
            });
            if (attempt.ok) {
                res = attempt;
                break;
            }
        } catch (err) {
            offline = offlineDetail(err);
            if (offline) break;
            return NextResponse.json(
                {error: `Archive fetch failed: ${(err as Error).message}`},
                {status: 502}
            );
        }
    }
    if (offline) return offlineResponse(offline);
    if (!res) {
        return NextResponse.json(
            {
                error: `GitHub did not serve the archive for ${parsed.owner}/${parsed.repo} (ref "${ref}") — check that the branch or tag exists and the repository is public.`,
            },
            {status: 404}
        );
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_ZIP_BYTES) {
        return NextResponse.json(
            {
                error: `The archive is ${(declared / (1024 * 1024)).toFixed(1)} MB; the import limit is 100 MB.`,
            },
            {status: 413}
        );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
        return NextResponse.json(
            {error: "GitHub returned an empty archive."},
            {status: 502}
        );
    }
    if (buf.length > MAX_ZIP_BYTES) {
        return NextResponse.json(
            {
                error: `The archive is ${(buf.length / (1024 * 1024)).toFixed(1)} MB; the import limit is 100 MB.`,
            },
            {status: 413}
        );
    }

    const baseName = sanitizeFolderName(into || parsed.repo);
    const folderName = await uniqueFolderName(baseName);
    const scriptsRoot = getScriptsRoot();
    // turbopackIgnore: folderName is a runtime-sanitized unique name —
    // the tracer cannot prove it stays inside scriptsRoot (the
    // relative-path guard below enforces exactly that), so it must not
    // trace the whole project into the server bundle.
    const destDir = path.join(/*turbopackIgnore: true*/ scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, destDir);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    try {
        await fs.mkdir(destDir, {recursive: true});
        await unpackArchive(buf, destDir);
        await collapseArchiveRoot(destDir, cleanSub);

        const files = await countFiles(destDir);
        if (files > MAX_FILES) {
            await fs.rm(destDir, {recursive: true, force: true});
            return NextResponse.json(
                {
                    error: `The archive contains ${files} files; the import limit is ${MAX_FILES} (try a subpath import instead).`,
                },
                {status: 413}
            );
        }

        await writeSourceJson(destDir, {
            url: rawUrl,
            mode: "repo",
            ref,
            subpath: cleanSub,
        });

        return NextResponse.json({
            ok: true,
            folder: slugify(folderName),
            name: folderName,
            files,
            url: rawUrl,
            ref,
        });
    } catch (err) {
        // Never leave a half-imported folder behind.
        await fs.rm(destDir, {recursive: true, force: true}).catch(() => {
        });
        return NextResponse.json(
            {error: `Import failed: ${(err as Error).message}`},
            {status: 500}
        );
    }
}

/* ── gist import ─────────────────────────────────────────────────── */

async function importGist(
    parsed: ParsedGist,
    rawUrl: string,
    into: string
): Promise<NextResponse> {
    const gist = await fetchGithubJson(
        `https://api.github.com/gists/${parsed.gistId}`
    );
    if (!gist.ok) {
        if (gist.offline) return offlineResponse(gist.message);
        return NextResponse.json(
            {
                error: `Gist ${parsed.gistId} could not be read (HTTP ${gist.status}) — check that it exists and is public.`,
            },
            {status: 404}
        );
    }

    const data = gist.data;
    if (typeof data !== "object" || data === null) {
        return NextResponse.json(
            {error: "Unexpected gist response."},
            {status: 502}
        );
    }
    const filesRaw = (data as { files?: unknown }).files;
    if (typeof filesRaw !== "object" || filesRaw === null || Array.isArray(filesRaw)) {
        return NextResponse.json({error: "The gist has no files."}, {status: 400});
    }
    const fileMap = filesRaw as Record<string, unknown>;
    const keys = Object.keys(fileMap);
    if (keys.length === 0) {
        return NextResponse.json({error: "The gist has no files."}, {status: 400});
    }
    if (keys.length > MAX_FILES) {
        return NextResponse.json(
            {error: `The gist has ${keys.length} files; the import limit is ${MAX_FILES}.`},
            {status: 413}
        );
    }

    // Folder name: the gist description, else the first file's name, else the id.
    const description =
        typeof (data as { description?: unknown }).description === "string"
            ? ((data as { description: string }).description ?? "").trim()
            : "";
    let firstFileName = "";
    for (const key of keys) {
        const rec = fileMap[key];
        if (typeof rec === "object" && rec !== null) {
            const fname = (rec as { filename?: unknown }).filename;
            if (typeof fname === "string" && fname.trim()) {
                firstFileName = fname;
                break;
            }
        }
    }
    const baseName = sanitizeFolderName(
        into || description || firstFileName.replace(/\.[^.]+$/, "") || `gist-${parsed.gistId}`
    );
    const folderName = await uniqueFolderName(baseName);
    const scriptsRoot = getScriptsRoot();
    // turbopackIgnore: folderName is a runtime-sanitized unique name —
    // the tracer cannot prove it stays inside scriptsRoot (the
    // relative-path guard below enforces exactly that), so it must not
    // trace the whole project into the server bundle.
    const destDir = path.join(/*turbopackIgnore: true*/ scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, destDir);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    try {
        await fs.mkdir(destDir, {recursive: true});
        let written = 0;
        for (const key of keys) {
            const rec = fileMap[key];
            if (typeof rec !== "object" || rec === null) continue;
            const r = rec as {
                filename?: unknown;
                content?: unknown;
                raw_url?: unknown;
            };
            const fname =
                typeof r.filename === "string" && r.filename.trim() ? r.filename : key;
            // Gist file names may carry "/" (nested keys) — guard like every
            // other nested write: no traversal, no absolute, no hidden dots.
            const segs = fname.split("/");
            if (
                segs.some(
                    (s) => !s || s === "." || s === ".." || s.startsWith("\\") || s.length > 200
                )
            ) {
                return NextResponse.json(
                    {error: `The gist contains an unsafe file name ("${fname}").`},
                    {status: 400}
                );
            }
            let content = typeof r.content === "string" ? r.content : null;
            if (content === null && typeof r.raw_url === "string") {
                // Truncated gist body — re-fetch the raw content, best-effort.
                try {
                    const rawRes = await fetch(r.raw_url, {
                        signal: AbortSignal.timeout(API_TIMEOUT_MS),
                    });
                    if (rawRes.ok) content = await rawRes.text();
                } catch {
                    /* offline mid-import — skip this file */
                }
            }
            if (content === null) continue;
            const abs = path.join(destDir, ...segs);
            const inner = path.relative(destDir, abs);
            if (inner.startsWith("..") || path.isAbsolute(inner)) {
                return NextResponse.json(
                    {error: `The gist contains an unsafe file name ("${fname}").`},
                    {status: 400}
                );
            }
            await fs.mkdir(path.dirname(abs), {recursive: true});
            await fs.writeFile(abs, content, "utf-8");
            written++;
        }

        await writeSourceJson(destDir, {url: rawUrl, mode: "gist", subpath: ""});

        return NextResponse.json({
            ok: true,
            folder: slugify(folderName),
            name: folderName,
            files: written,
            url: rawUrl,
        });
    } catch (err) {
        await fs.rm(destDir, {recursive: true, force: true}).catch(() => {
        });
        return NextResponse.json(
            {error: `Gist import failed: ${(err as Error).message}`},
            {status: 500}
        );
    }
}

/* ── GET: read the persisted source (reload-from-source support) ──── */

export async function GET(request: Request) {
    const url = new URL(request.url);
    const folder = (url.searchParams.get("folder") ?? "").trim();
    if (!folder) {
        return NextResponse.json(
            {error: "Missing 'folder' query parameter."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    if (
        !folderName ||
        folderName.includes("/") ||
        folderName.includes("\\") ||
        folderName.includes("..")
    ) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const srcPath = path.join(
        getScriptsRoot(),
        folderName,
        ".praxis",
        "source.json"
    );
    try {
        const parsed: unknown = JSON.parse(await fs.readFile(srcPath, "utf-8"));
        if (typeof parsed === "object" && parsed !== null) {
            const r = parsed as Record<string, unknown>;
            const source = {
                url: typeof r.url === "string" ? r.url : "",
                mode: r.mode === "gist" ? ("gist" as const) : ("repo" as const),
                ref: typeof r.ref === "string" ? r.ref : undefined,
                subpath: typeof r.subpath === "string" ? r.subpath : "",
                importedAt: typeof r.importedAt === "string" ? r.importedAt : "",
            };
            return NextResponse.json({ok: true, hasSource: true, source});
        }
        // Corrupt file — degrade to "no source" rather than erroring.
    } catch {
        /* absent or unreadable — no source */
    }
    return NextResponse.json({ok: true, hasSource: false});
}
