import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot, restoreActiveProjectRoot} from "@/lib/scripts";
import {buildZip, type ZipInput} from "@/lib/zip";
import {extractEntry, parseZipCentralDirectory, ZIP_LIMITS} from "@/lib/unzip";

/**
 * Backup of the ACTIVE project's `.praxis/` folder as a ZIP.
 *
 * The settings dialog's "Export settings" button downloads this — the
 * archive carries every per-project JSON config (settings.json,
 * appearance.json, notes.json, spell-ignore.json …), and "Import
 * settings" restores a previously exported archive back into the
 * project (same folder, atomic writes, existing configs are replaced).
 *
 * GET → `praxis-settings-backup.zip` (the.praxis folder contents)
 * POST → multipart/form-data with `file` = such a zip; every JSON
 * entry lands back in `<project>/.praxis/`.
 *
 * App-level registry files (active-project.json / projects.json) are
 * NEVER exported or imported — they describe THIS installation's
 * project list, not the project settings.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The app-level pointer/registry files that live in the DEFAULT
 *  root's .praxis but are NOT project settings — excluded both ways. */
const APP_LEVEL_CONFIGS = new Set(["active-project.json", "projects.json"]);

function praxisDir(): string {
    return path.join(getScriptsRoot(), ".praxis");
}

/** Best-effort atomic write (tmp + rename with a direct fallback). */
async function writeAtomic(file: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(file), {recursive: true});
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
        await fs.writeFile(tmp, text, "utf-8");
        await fs.rename(tmp, file);
    } catch {
        try {
            await fs.writeFile(file, text, "utf-8");
        } finally {
            try {
                await fs.unlink(tmp);
            } catch {
                /* tmp never landed */
            }
        }
    }
}

export async function GET() {
    // the GET must resolve the persisted active-project pointer first
    // (a server restart resets it) so the backup targets the project the
    // user actually has open.
    await restoreActiveProjectRoot();
    const dir = praxisDir();
    try {
        const names = await fs.readdir(dir);
        const entries: ZipInput[] = [];
        for (const name of names) {
            if (APP_LEVEL_CONFIGS.has(name)) continue;
            if (/\.tmp$/.test(name)) continue;
            const abs = path.join(dir, name);
            try {
                const st = await fs.stat(abs);
                if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
                entries.push({name: `.praxis/${name}`, data: await fs.readFile(abs)});
            } catch {
                /* unreadable entry — skip */
            }
        }
        if (entries.length === 0) {
            return NextResponse.json(
                {error: "No .praxis settings to export yet — nothing was saved into this project's .praxis folder."},
                {status: 404}
            );
        }
        const zip = buildZip(entries);
        return new NextResponse(new Uint8Array(zip), {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": 'attachment; filename="praxis-settings-backup.zip"',
                "Content-Length": String(zip.length),
            },
        });
    } catch {
        return NextResponse.json(
            {error: "Could not read this project's .praxis folder."},
            {status: 404}
        );
    }
}

export async function POST(request: Request) {
    await restoreActiveProjectRoot();
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({error: "Invalid upload."}, {status: 400});
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json(
            {error: "Request body must include a `file` zip (multipart/form-data)."},
            {status: 400}
        );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0 || buf.length > ZIP_LIMITS.maxTotalBytes) {
        return NextResponse.json({error: "The uploaded zip is empty or too large."}, {status: 400});
    }

    let entries;
    try {
        entries = parseZipCentralDirectory(buf);
    } catch {
        return NextResponse.json({error: "Not a valid .zip archive."}, {status: 400});
    }

    // Map every JSON-ish entry into .praxis/ — archives exported by THIS
    // route carry `.praxis/<name>` paths; hand-made ones may store the
    // files at the zip root. Only known-shaped config names are accepted
    // so a stray archive can never drop arbitrary files into the project.
    const dir = praxisDir();
    const restored: string[] = [];
    const seen = new Set<string>();
    try {
        for (const entry of entries) {
            if (entry.isDirectory) continue;
            if (entry.name.includes("__MACOSX/")) continue;
            const base = entry.name.split("/").pop() ?? "";
            if (!base || base === ".DS_Store" || base === "Thumbs.db") continue;
            if (APP_LEVEL_CONFIGS.has(base)) continue;
            if (!/\.json$/i.test(base)) continue;
            if (!/^[A-Za-z0-9._-]+$/.test(base)) continue;
            if (entry.uncompressedSize > ZIP_LIMITS.maxEntryBytes) {
                return NextResponse.json(
                    {error: `ZIP entry "${entry.name}" is too large for a settings file.`},
                    {status: 400}
                );
            }
            if (seen.has(base)) continue;
            seen.add(base);
            const data = extractEntry(buf, entry);
            const text = data.toString("utf-8");
            // Validate it parses BEFORE writing — a torn import must never
            // replace a working config with a broken one.
            try {
                JSON.parse(text);
            } catch {
                return NextResponse.json(
                    {error: `"${base}" is not valid JSON — the archive looks corrupted. Nothing was imported.`},
                    {status: 400}
                );
            }
            await writeAtomic(path.join(dir, base), text);
            restored.push(base);
        }
    } catch (err) {
        return NextResponse.json(
            {error: `Import failed: ${(err as Error).message}`},
            {status: 500}
        );
    }

    if (restored.length === 0) {
        return NextResponse.json(
            {error: "No settings JSON found inside the archive (expected settings.json / appearance.json / notes.json / spell-ignore.json)."},
            {status: 400}
        );
    }
    return NextResponse.json({ok: true, restored});
}
