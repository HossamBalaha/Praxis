import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, slugify} from "@/lib/scripts";

/**
 * POST /api/file-create
 *
 * Body: { folder: string, fileName: string, content?: string }
 *
 * Creates a new file (with optional initial content) inside a folder
 * folder. Used by the "New file…" action in the Explorer sidebar and
 * by the Examples menu (which passes full file bodies). Default
 * content is provided for `.py` files (`# -*- coding: utf-8 -*-\n\n`),
 * and an empty string for everything else.
 *
 * Safety:
 *   - folder is deslugged + path-traversal checked.
 *   - fileName must not contain path separators or `..`.
 *   - Hidden (dot) files are rejected — EXCEPT a small allowlist of
 *     standard, side-effect-free config files (.gitignore, …) that the
 *     Examples library creates.
 *   - Refuses to overwrite an existing file (409 Conflict).
 *
 * Response: { ok: true, name, slug, folder }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-.()]{0,200}\.[A-Za-z0-9]+$/;

/** Dotfiles the route will create (the Examples library ships a
 *  .gitignore preset). Anything else starting with "." is rejected —
 *  no .env, no arbitrary hidden files. */
const DOTFILE_ALLOWLIST = new Set([
    ".gitignore",
    ".gitattributes",
    ".dockerignore",
]);

const DEFAULT_CONTENT: Record<string, string> = {
    ".py": "# -*- coding: utf-8 -*-\n\n",
    ".md": "# \n",
    ".txt": "",
    ".json": "{\n  \n}\n",
    ".yaml": "# YAML\n",
    ".yml": "# YAML\n",
    ".toml": "# TOML\n",
    ".csv": "",
    ".sql": "-- SQL\n",
    ".R": "# R\n",
    ".r": "# R\n",
    ".sh": "#!/usr/bin/env bash\nset -euo pipefail\n\n",
};

export async function POST(request: Request) {
    let body: { folder?: string; fileName?: string; content?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, fileName, content, sub} = body;
    if (!folder || !fileName) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'fileName'."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    const cleanName = path.basename(fileName.trim());
    if (!folderName || !cleanName) {
        return NextResponse.json({error: "Invalid slugs."}, {status: 400});
    }
    if (
        folderName.includes("/") || folderName.includes("\\") || folderName.includes("..") ||
        cleanName.includes("/") || cleanName.includes("\\") || cleanName.includes("..")
    ) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // optional `sub` — a relative folder path INSIDE the
    // folder where the file is created ("" / undefined = folder root).
    // Validated like every other nested path: no traversal, no absolute,
    // no hidden/empty segments, depth-capped.
    const cleanSub = (sub ?? "").trim();
    if (cleanSub) {
        if (
            cleanSub.includes("..") || cleanSub.includes("\\") ||
            cleanSub.startsWith("/") || cleanSub.endsWith("/") ||
            cleanSub.split("/").some((seg) => !seg || seg.startsWith(".")) ||
            cleanSub.split("/").length > 4
        ) {
            return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
        }
    }
    if (cleanName.startsWith(".")) {
        if (!DOTFILE_ALLOWLIST.has(cleanName.toLowerCase())) {
            return NextResponse.json(
                {error: "Hidden files cannot be created."},
                {status: 400}
            );
        }
    } else if (!NAME_RE.test(cleanName)) {
        return NextResponse.json(
            {error: "Invalid filename. Must be 1–200 chars, start with a letter/digit, and end with an extension."},
            {status: 400}
        );
    }
    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(scriptsRoot, folderName);
    // target dir honors the `sub` path.
    const targetDir = cleanSub ? path.join(folderDir, cleanSub) : folderDir;
    const abs = path.join(targetDir, cleanName);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    // Refuse to overwrite.
    try {
        await fs.stat(abs);
        return NextResponse.json(
            {error: `A file named "${cleanName}" already exists in "${folderName}${cleanSub ? "/" + cleanSub : ""}".`},
            {status: 409}
        );
    } catch { /* good — doesn't exist */
    }
    // Ensure folder dir (and any nested parent) exists.
    await fs.mkdir(targetDir, {recursive: true});
    // Determine content: explicit > default-by-extension > empty.
    const ext = path.extname(cleanName).toLowerCase();
    const initial = content ?? DEFAULT_CONTENT[ext] ?? "";
    try {
        await fs.writeFile(abs, initial, "utf-8");
    } catch (e) {
        return NextResponse.json(
            {error: `Failed to create file: ${e instanceof Error ? e.message : String(e)}`},
            {status: 500}
        );
    }
    // the slug encodes the relative PATH so the new
    // nested file resolves everywhere a listed file does.
    const relPath = cleanSub ? `${cleanSub}/${cleanName}` : cleanName;
    return NextResponse.json({
        ok: true,
        name: cleanName,
        slug: slugify(relPath),
        folder: folderName,
        dir: cleanSub,
        path: relPath,
    });
}
