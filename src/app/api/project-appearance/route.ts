import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * Per-project EXPLORER APPEARANCE (folder/file icons + colors) —
 * stored on disk at `<project-root>/.praxis/appearance.json` instead
 * of only in localStorage.
 *
 * Why: folder icons and coloring used to live ONLY in the browser's
 * localStorage. Opening the same project in another browser (or
 * after clearing site data) lost every customization. The plan now:
 *
 * • LOAD — the client fetches THIS endpoint first. If the project
 * file exists (and holds at least one entry) it wins and the
 * browser-local copy is refreshed from it; otherwise the client
 * falls back to localStorage. Either way the user is notified
 * which source was used.
 * • SAVE — every customization is dual-written: localStorage stays
 * the instant offline cache and the same map is POSTed here
 * (debounced by the client) so the project folder carries it.
 *
 * The "project root" resolution mirrors /api/project-settings:
 * the active custom project when one is open, else SCRIPTS_ROOT, else
 * the working directory. The.praxis/ folder is hidden from the
 * explorer (dot-prefixed), so nothing extra shows up in the tree.
 *
 * GET — reads `.praxis/appearance.json`; `{ ok, appearance }` when
 * present and non-empty, `{ ok: false }` otherwise.
 * POST — body `{ appearance: {...} }`; writes the file.
 * DELETE — removes the file (no-op when missing).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve the on-disk path for the active project's appearance file.
 *
 * FIX: the root used to be
 * `getActiveProjectRoot ?? SCRIPTS_ROOT ?? process.cwd` — with
 * the DEFAULT project open that resolved to the APP root
 * (process.cwd, the folder that contains python_scripts/), so
 * `.praxis/appearance.json` landed OUTSIDE python_scripts and the
 * user could never find it. The root is now `getScriptsRoot` — the
 * ACTIVE project when one is open, else `<cwd>/python_scripts` (or
 * the SCRIPTS_ROOT pin in standalone/Docker) — i.e. exactly the
 * folder the explorer shows as the project root, which is where a
 * user looks for per-project state. */
function appearanceFilePath(): string {
    return path.join(getScriptsRoot(), ".praxis", "appearance.json");
}

/** True when the parsed object holds at least one customization —
 * an empty `{}` (or `{folders:{},files:{}}`) counts as "no project
 * appearance" so the client falls back to localStorage. */
function hasAnyEntry(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const map = value as { folders?: unknown; files?: unknown };
    const folderCount =
        map.folders && typeof map.folders === "object" ? Object.keys(map.folders).length : 0;
    const fileCount =
        map.files && typeof map.files === "object" ? Object.keys(map.files).length : 0;
    return folderCount + fileCount > 0;
}

export async function GET() {
    const file = appearanceFilePath();
    try {
        const text = await fs.readFile(file, "utf-8");
        const parsed = JSON.parse(text);
        if (hasAnyEntry(parsed)) {
            return NextResponse.json({ok: true, appearance: parsed});
        }
        return NextResponse.json({ok: false});
    } catch {
        // Missing file, unreadable, or invalid JSON — treat as "no project
        // appearance" so the client falls back to localStorage.
        return NextResponse.json({ok: false});
    }
}

export async function POST(request: Request) {
    let body: { appearance?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {error: "Invalid JSON body."},
            {status: 400}
        );
    }
    if (
        !body.appearance ||
        typeof body.appearance !== "object" ||
        Array.isArray(body.appearance)
    ) {
        return NextResponse.json(
            {error: "Request body must include an `appearance` object."},
            {status: 400}
        );
    }
    const file = appearanceFilePath();
    try {
        await fs.mkdir(path.dirname(file), {recursive: true});
        // tmp + atomic rename (with a direct-write fallback for the odd
        // EBUSY / EPERM on Windows AV / indexers) — a torn write must
        // never leave a half-written appearance.json behind.
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        const text = JSON.stringify(body.appearance, null, 2);
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
                    /* nothing to clean up */
                }
            }
        }
        return NextResponse.json({ok: true});
    } catch (err) {
        return NextResponse.json(
            {error: `Failed to write project appearance: ${(err as Error).message}`},
            {status: 500}
        );
    }
}

export async function DELETE() {
    const file = appearanceFilePath();
    try {
        await fs.unlink(file);
    } catch {
        // File may not exist — the end state is "no project appearance"
        // either way.
    }
    return NextResponse.json({ok: true});
}
