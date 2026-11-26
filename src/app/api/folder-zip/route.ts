import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";
import {buildZip, type ZipInput} from "@/lib/zip";
import {ZIP_LIMITS} from "@/lib/unzip";

/**
 * GET /api/folder-zip?folder=<slug>[&sub=<relative path>][&scaffold=github]
 *
 * Zips an entire folder (recursively) and streams it back as an
 * attachment — the explorer's "Download folder as .zip" action,
 * the VS Code "Download…" analogue for folders. `sub` zips
 * ONLY that nested subfolder (the subfolder rows get the same Send ▸
 * action as the main folder).
 *
 * `scaffold=github` (Tools ▸ Export ▸ GitHub-ready repo) adds
 * the repository boilerplate a bare scripts folder lacks — README.md,
 * .gitignore and requirements.txt — injected ONLY when that file does
 * not already exist on disk, so an authored file is never overwritten.
 * requirements.txt lists the top-level imports found across the .py
 * files (best-effort static scan, stdlib filtered).
 *
 * Safety:
 *  - folder slug is deslugified + traversal-checked (same pattern as
 *    folder-stats / open-folder); `sub` passes sanitizeSubPath.
 *  - total uncompressed size and entry count are capped by the SAME
 *    limits the upload-zip reader enforces (ZIP_LIMITS) so a runaway
 *    folder can't exhaust memory building the archive.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    if (!folderSlug) {
        return NextResponse.json({error: "Missing 'folder' query parameter."}, {status: 400});
    }
    // optional nested scope — zip ONLY this subfolder.
    const cleanSub = sanitizeSubPath(searchParams.get("sub"));
    if (cleanSub === null) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }

    const folderName = deslugify(folderSlug);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder name."}, {status: 400});
    }

    const root = getScriptsRoot();
    const folderDir = cleanSub
        ? path.join(root, folderName, ...cleanSub.split("/"))
        : path.join(root, folderName);
    const rel = path.relative(root, folderDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    let dirStat;
    try {
        dirStat = await fs.stat(folderDir);
    } catch {
        return NextResponse.json({error: "Folder not found."}, {status: 404});
    }
    if (!dirStat.isDirectory()) {
        return NextResponse.json({error: "Not a folder."}, {status: 400});
    }

    // Walk the folder recursively (depth-first, sorted for determinism).
    const entries: ZipInput[] = [];
    let totalBytes = 0;
    const walkStack: string[][] = [[""]];
    while (walkStack.length > 0) {
        const [relDir] = walkStack.pop()!;
        const absDir = relDir ? path.join(folderDir, relDir) : folderDir;
        let names: string[];
        try {
            names = await fs.readdir(absDir);
        } catch {
            continue; // unreadable subfolder — skip rather than fail the zip
        }
        names.sort();
        for (const name of names) {
            const relPath = relDir ? `${relDir}/${name}` : name;
            const absPath = path.join(absDir, name);
            let st;
            try {
                st = await fs.stat(absPath);
            } catch {
                continue;
            }
            if (st.isDirectory()) {
                walkStack.push([relPath]);
                continue;
            }
            if (!st.isFile()) continue;
            if (entries.length >= ZIP_LIMITS.maxEntries) {
                return NextResponse.json(
                    {error: `Folder has more than ${ZIP_LIMITS.maxEntries} files — too many to zip.`},
                    {status: 413}
                );
            }
            totalBytes += st.size;
            if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
                return NextResponse.json(
                    {error: "Folder contents exceed the 2 GB zip limit."},
                    {status: 413}
                );
            }
            try {
                const data = await fs.readFile(absPath);
                // with a `sub` scope the archive root is the
                // subfolder itself — entry names keep the full folder/sub/…
                // prefix so unzipping restores the same layout.
                entries.push({
                    name: `${folderName}/${cleanSub ? cleanSub + "/" : ""}${relPath}`,
                    data,
                    mtime: st.mtime
                });
            } catch {
                // Locked/unreadable file — skip it, keep zipping the rest.
            }
        }
    }

    if (entries.length === 0) {
        return NextResponse.json({error: "Folder is empty — nothing to zip."}, {status: 400});
    }

    // ── GitHub-ready scaffold injection ────────────────────
    // Only for the folder ROOT (a `sub` scope skips it), and only the
    // files missing on disk. The zip never mutates the source folder —
    // scaffold files exist ONLY inside the archive.
    const wantsScaffold = searchParams.get("scaffold") === "github" && !cleanSub;
    if (wantsScaffold) {
        const hasEntry = (name: string) =>
            entries.some((e) => e.name === `${folderName}/${name}`);
        if (!hasEntry("README.md")) {
            const pyCount = entries.filter((e) => e.name.toLowerCase().endsWith(".py")).length;
            const readme =
                `# ${folderName}\n\n` +
                `A collection of ${pyCount} Python script${pyCount === 1 ? "" : "s"} written and exercised in ` +
                `[Praxis](https://github.com/hossambalaha/Praxis) — a browser-based Python IDE.\n\n` +
                `## Run\n\n\`\`\`bash\npython3 <script>.py\n\`\`\`\n\n` +
                `## Layout\n\n` +
                entries
                    .filter((e) => e.name.toLowerCase().endsWith(".py"))
                    .slice(0, 40)
                    .map((e) => `- \`${e.name.slice(folderName.length + 1)}\``)
                    .join("\n") +
                (entries.filter((e) => e.name.toLowerCase().endsWith(".py")).length > 40 ? "\n- …" : "") +
                `\n\n---\n\nExported ${new Date().toISOString()}.\n`;
            entries.push({name: `${folderName}/README.md`, data: Buffer.from(readme, "utf8"), mtime: new Date()});
        }
        if (!hasEntry(".gitignore")) {
            const gitignore =
                `# Python\n__pycache__/\n*.py[cod]\n*.egg-info/\n.venv/\nvenv/\n\n` +
                `# Environments & tooling\n.env\n.mypy_cache/\n.ruff_cache/\n.pytest_cache/\n.coverage\n\n` +
                `# Praxis captures\nruns/\nfigures/\n\n# OS\n.DS_Store\nThumbs.db\n`;
            entries.push({name: `${folderName}/.gitignore`, data: Buffer.from(gitignore, "utf8"), mtime: new Date()});
        }
        if (!hasEntry("requirements.txt")) {
            // Best-effort top-level import scan across the .py entries.
            const STDLIB = new Set([
                "abc", "argparse", "array", "ast", "asyncio", "base64", "binascii", "bisect",
                "collections", "concurrent", "configparser", "contextlib", "copy", "csv", "ctypes",
                "dataclasses", "datetime", "decimal", "difflib", "enum", "functools", "gc", "glob",
                "hashlib", "heapq", "html", "http", "importlib", "inspect", "io", "itertools", "json",
                "logging", "math", "multiprocessing", "operator", "os", "pathlib", "pickle", "platform",
                "pprint", "queue", "random", "re", "secrets", "selectors", "shlex", "shutil", "signal",
                "socket", "sqlite3", "statistics", "string", "struct", "subprocess", "sys", "tarfile",
                "tempfile", "textwrap", "threading", "time", "traceback", "typing", "unittest", "urllib",
                "uuid", "warnings", "wave", "weakref", "xml", "zipfile", "zlib",
            ]);
            const found = new Set<string>();
            for (const e of entries) {
                if (!e.name.toLowerCase().endsWith(".py")) continue;
                const text = e.data.toString("utf8");
                for (const m of text.matchAll(/^\s*(?:from\s+([A-Za-z_][\w.]*)|import\s+([A-Za-z_][\w.,\s]*))/gm)) {
                    const clause = (m[1] ?? m[2] ?? "").split(",")[0].trim();
                    const root = clause.split(".")[0].trim();
                    if (root && !STDLIB.has(root)) found.add(root);
                }
            }
            if (found.size > 0) {
                const reqs =
                    `# Auto-generated by the Praxis GitHub-ready export — versions left free.\n` +
                    [...found].sort().map((n) => `${n}`).join("\n") + "\n";
                entries.push({
                    name: `${folderName}/requirements.txt`,
                    data: Buffer.from(reqs, "utf8"),
                    mtime: new Date()
                });
            }
        }
    }

    let archive: Buffer;
    try {
        archive = buildZip(entries);
    } catch (err) {
        return NextResponse.json(
            {error: `Could not build zip: ${err instanceof Error ? err.message : String(err)}`},
            {status: 500}
        );
    }

    // a `sub` scope names the archive after the subfolder
    // Path separators become underscores in the download name;
    // the scaffold variant suffixes "-github" so it never
    // collides with a plain folder download in the downloads bar.
    const safeName = cleanSub
        ? `${folderName}_${cleanSub.replace(/\//g, "_")}`.replace(/[^A-Za-z0-9 _\-.()]/g, "_")
        : (folderName + (wantsScaffold ? "-github" : "")).replace(/[^A-Za-z0-9 _\-.()]/g, "_");
    return new NextResponse(new Uint8Array(archive), {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${safeName}.zip"`,
            "Content-Length": String(archive.length),
            "Cache-Control": "no-store",
        },
    });
}
