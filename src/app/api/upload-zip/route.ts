import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {
    deslugify,
    getProjectsParentRoot,
    getScriptsRoot,
    registerCreatedProject,
    sanitizeSubPath,
    setActiveProjectRoot,
} from "@/lib/scripts";
import {extractAll as extractAllJs, parseZipCentralDirectory} from "@/lib/unzip";

/**
 * POST /api/upload-zip — multipart/form-data with:
 *   - `file`: the .zip file
 *   - `projectName`: name of the new project directory to create
 * - `folder`: folder slug — when present, the zip is
 *                    extracted INTO that existing folder (the explorer's
 *                    "Import .zip into this folder…" action) instead of
 *                    creating a new project. The active project is left
 *                    untouched.
 *
 * Unzips the file into a new directory under the projects parent root
 * (see getProjectsParentRoot) and switches the active project to it.
 * Returns the new project's path, script count, and name. The project
 * is registered in the created-projects registry so it stays listed
 * and switchable even when the archive contained no .py files.
 *
 * Extraction strategy:
 *   1. Try the system `unzip` binary first (fastest, handles every
 *      compression method, preserves Unix permissions).
 *   2. If `unzip` is not installed (ENOENT) or unavailable, fall back
 *      to a pure-JavaScript extractor (`src/lib/unzip.ts`) that
 *      handles the stored + deflate methods — which covers >99% of
 *      real-world ZIPs produced by Python's `zipfile`, 7z, WinZip,
 *      macOS Finder, and GitHub's "Download ZIP".
 *
 * This dual approach means the upload works even on minimal Docker
 * images, Alpine without `unzip`, and Windows — without requiring any
 * extra npm dependencies.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
            // ENOENT means `unzip` is not installed — the caller will fall
            // back to the pure-JS extractor. Any other spawn error is a
            // real failure.
            const errAny = err as NodeJS.ErrnoException;
            if (errAny.code === "ENOENT") {
                reject(new Error("__unzip_not_installed__"));
            } else {
                reject(
                    new Error(
                        `Failed to spawn 'unzip': ${err.message}`
                    )
                );
            }
        });
        child.on("close", (code) => {
            if (code === 0) resolve(0);
            else reject(new Error(`unzip exited with code ${code}. ${stderr}`));
        });
    });
}

/** Folder-import mode: write the buffer to a temp file inside the
 *  DESTINATION's own tree (not the projects parent), unzip, clean up.
 *  Same binary/exit-code semantics as runUnzip. */
async function runUnzipBuffer(buf: Buffer, destDir: string): Promise<void> {
    const tmpZip = path.join(destDir, `.import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`);
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

/** Recursively count .py files (capped for performance). */
async function countPythonFiles(dir: string, depth = 0): Promise<number> {
    if (depth > 5) return 0;
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
        return 0;
    }
    let count = 0;
    for (const entry of entries) {
        if (entry.isFile()) {
            if (entry.name.toLowerCase().endsWith(".py")) count++;
        } else if (entry.isDirectory()) {
            if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__MACOSX") continue;
            count += await countPythonFiles(path.join(dir, entry.name), depth + 1);
        }
    }
    return count;
}

/** Sanitize a project name into a filesystem-safe directory name. */
function sanitizeProjectName(name: string): string {
    // Strip path separators, control chars, and leading dots.
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[\x00-\x1f]/g, "")
        .replace(/^\.+/, "")
        .trim();
    // Fall back to a timestamp if the user passed garbage.
    if (!cleaned) return `project-${Date.now()}`;
    // Strip a trailing.zip if the user passed the full filename.
    return cleaned.replace(/\.zip$/i, "");
}

export async function POST(request: Request) {
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json(
            {error: "Expected multipart/form-data upload."},
            {status: 400}
        );
    }

    const file = form.get("file");
    const projectNameRaw = (form.get("projectName") as string | null) ?? "";
    // optional folder targeting — extract INTO an existing
    // folder folder instead of creating a new project.
    const folderSlug = (form.get("folder") as string | null) ?? "";
    // optional NESTED destination inside that folder — the
    // subfolder rows' "Import .zip here…" action.
    const subField = (form.get("sub") as string | null) ?? "";

    if (!(file instanceof File)) {
        return NextResponse.json(
            {error: "Missing 'file' field in upload."},
            {status: 400}
        );
    }

    // cap the uploaded archive size before buffering
    // it into memory — a client could previously POST an arbitrarily
    // large body and the whole thing was held in RAM (plus duplicated by
    // Buffer.from). The pure-JS extractor's inflation caps are enforced
    // in src/lib/unzip.ts.
    const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB
    if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
            {
                error: `Archive is ${file.size.toLocaleString()} bytes; the upload limit is ${MAX_UPLOAD_BYTES.toLocaleString()} bytes (200 MB).`,
            },
            {status: 413}
        );
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // ── folder-import mode ────────────────────────────
    // Extract the archive INTO the named folder folder (must already
    // exist). No project registration, no active-project switch — the
    // explorer just gains the archive's contents.
    if (folderSlug) {
        const folderName = deslugify(folderSlug);
        if (!folderName) {
            return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
        }
        if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
            return NextResponse.json({error: "Invalid folder name."}, {status: 400});
        }
        // optional nested destination ("" = the folder root).
        const cleanSub = sanitizeSubPath(subField);
        if (cleanSub === null) {
            return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
        }
        const root = getScriptsRoot();
        const destDir = cleanSub
            ? path.join(root, folderName, ...cleanSub.split("/"))
            : path.join(root, folderName);
        const rel = path.relative(root, destDir);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
        }
        try {
            const st = await fs.stat(destDir);
            if (!st.isDirectory()) {
                return NextResponse.json({error: "Import target is not a folder."}, {status: 400});
            }
        } catch {
            if (cleanSub) {
                // a nested import target may not exist yet — create
                // it (the top-level folder itself must exist; see below).
                const topDir = path.join(root, folderName);
                try {
                    const topSt = await fs.stat(topDir);
                    if (!topSt.isDirectory()) {
                        return NextResponse.json({error: "Import target is not a folder."}, {status: 400});
                    }
                } catch {
                    return NextResponse.json({error: "Import target folder not found."}, {status: 404});
                }
                await fs.mkdir(destDir, {recursive: true});
            } else {
                return NextResponse.json({error: "Import target folder not found."}, {status: 404});
            }
        }

        try {
            // Strategy 1: system unzip (overwrite semantics match a re-import).
            let usedFallback = false;
            let extractorNote: string | undefined;
            try {
                await runUnzipBuffer(buf, destDir);
            } catch (err) {
                const msg = (err as Error).message;
                if (msg === "__unzip_not_installed__" || /exited with code/.test(msg)) {
                    usedFallback = true;
                    extractorNote = msg === "__unzip_not_installed__"
                        ? "System `unzip` binary not found; used built-in extractor."
                        : `System unzip failed (${msg}); used built-in extractor.`;
                    try {
                        const written = await extractAllJs(buf, destDir, fs, path);
                        if (written === 0) parseZipCentralDirectory(buf); // throws if not a zip
                    } catch (extractErr) {
                        return NextResponse.json(
                            {
                                error:
                                    `Could not extract ZIP: ${(extractErr as Error).message}. ` +
                                    "If your archive uses an exotic compression method (BZIP2, LZMA, Zstandard, XZ), " +
                                    "install the system `unzip` binary on the server.",
                            },
                            {status: 500}
                        );
                    }
                } else {
                    throw err;
                }
            }

            // Promote a single top-level wrapper folder (GitHub-style zips).
            const entries = await fs.readdir(destDir, {withFileTypes: true});
            if (entries.length === 1 && entries[0].isDirectory()) {
                const inner = path.join(destDir, entries[0].name);
                const innerEntries = await fs.readdir(inner, {withFileTypes: true});
                for (const e of innerEntries) {
                    const src = path.join(inner, e.name);
                    const dst = path.join(destDir, e.name);
                    try {
                        await fs.rename(src, dst);
                    } catch {
                        // Name collision with an existing file — skip (unzip -o
                        // already overwrote what it could).
                    }
                }
                try {
                    await fs.rmdir(inner);
                } catch {
                    // ignore
                }
            }

            // Report the folder's post-import file names (top level only,
            // capped) so the client toast + refresh callback can use them.
            const finalEntries = await fs.readdir(destDir, {withFileTypes: true});
            const importedFiles = finalEntries
                .filter((e) => e.isFile())
                .slice(0, 200)
                .map((e) => e.name);

            return NextResponse.json({
                ok: true,
                folder: folderSlug,
                folderName,
                importedFiles,
                extractor: usedFallback ? "builtin" : "system",
                extractorNote,
            });
        } catch (err) {
            return NextResponse.json({error: (err as Error).message}, {status: 500});
        }
    }

    const projectName = sanitizeProjectName(projectNameRaw || file.name);
    if (!projectName) {
        return NextResponse.json(
            {error: "Invalid project name."},
            {status: 400}
        );
    }

    // Resolve the destination directory under the projects parent root
    // (process.cwd in dev; the SCRIPTS_ROOT's parent in the standalone
    // Docker deployment — cwd there is the throwaway
    // .next/standalone snapshot).
    const parent = getProjectsParentRoot();
    const destDir = path.resolve(parent, projectName);
    const rel = path.relative(parent, destDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Project name resolves outside the app working directory."},
            {status: 400}
        );
    }

    // Reject if the destination already exists (so we don't clobber).
    try {
        await fs.stat(destDir);
        return NextResponse.json(
            {
                error: `A directory named "${projectName}" already exists. Choose a different name.`,
            },
            {status: 409}
        );
    } catch {
        // Good — destination doesn't exist, continue.
    }

    // Save the uploaded zip to a temp file. Node's File object exposes
    // an arrayBuffer method we can use to read its bytes.
    const tmpZip = path.join(
        parent,
        `.upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`
    );
    let usedFallback = false;
    let fallbackReason: string | undefined;
    try {
        await fs.writeFile(tmpZip, buf);

        // Make the destination directory, then unzip into it.
        await fs.mkdir(destDir, {recursive: true});

        // Strategy 1: try the system `unzip` binary first.
        try {
            await runUnzip(tmpZip, destDir);
        } catch (err) {
            // If `unzip` isn't installed (or fails), fall back to the
            // pure-JS extractor. We pre-validate the buffer so we can give
            // a useful error if it's not actually a ZIP.
            const msg = (err as Error).message;
            if (msg === "__unzip_not_installed__" || /exited with code/.test(msg)) {
                usedFallback = true;
                fallbackReason = msg === "__unzip_not_installed__"
                    ? "System `unzip` binary not found; used built-in extractor."
                    : `System unzip failed (${msg}); used built-in extractor.`;
                try {
                    const written = await extractAllJs(buf, destDir, fs, path);
                    if (written === 0) {
                        // Sanity check: did the buffer even parse as a ZIP?
                        parseZipCentralDirectory(buf); // throws if not
                    }
                } catch (extractErr) {
                    // Both strategies failed — surface a clear error.
                    return NextResponse.json(
                        {
                            error:
                                `Could not extract ZIP: ${(extractErr as Error).message}. ` +
                                "If your archive uses an exotic compression method (BZIP2, LZMA, Zstandard, XZ), " +
                                "install the system `unzip` binary on the server.",
                        },
                        {status: 500}
                    );
                }
            } else {
                // Real spawn error — propagate.
                throw err;
            }
        }

        // Some zips have a single top-level folder inside them; if so,
        // promote that folder's contents up so the project directory is
        // the actual folder root. We only do this when there's exactly
        // one entry and it's a directory.
        const entries = await fs.readdir(destDir, {withFileTypes: true});
        if (entries.length === 1 && entries[0].isDirectory()) {
            const inner = path.join(destDir, entries[0].name);
            const innerEntries = await fs.readdir(inner, {withFileTypes: true});
            for (const e of innerEntries) {
                const src = path.join(inner, e.name);
                const dst = path.join(destDir, e.name);
                await fs.rename(src, dst);
            }
            try {
                await fs.rmdir(inner);
            } catch {
                // ignore — leave empty dir if rename failed
            }
        }

        // Register the project so it stays listed / switchable even when
        // the archive contained no .py files (a zip of, say, only .csv
        // data would otherwise create an unreachable project).
        await registerCreatedProject(destDir);

        // Switch the active project to the new directory.
        setActiveProjectRoot(destDir);
        const scriptCount = await countPythonFiles(destDir);

        return NextResponse.json({
            ok: true,
            projectName,
            path: destDir,
            scriptCount,
            active: getScriptsRoot(),
            // Surface the fallback to the client so it can show a hint if
            // the user wants to install `unzip` for richer format support.
            extractor: usedFallback ? "builtin" : "system",
            extractorNote: fallbackReason,
        });
    } catch (err) {
        return NextResponse.json(
            {error: (err as Error).message},
            {status: 500}
        );
    } finally {
        // Always clean up the temp zip.
        try {
            await fs.unlink(tmpZip);
        } catch {
            // ignore
        }
    }
}
