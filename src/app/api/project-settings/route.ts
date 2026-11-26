import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot, restoreActiveProjectRoot} from "@/lib/scripts";
import {resetInterpreterCache} from "@/lib/python-interpreter";
import {DEFAULT_SETTINGS} from "@/lib/settings";

/**
 * Per-project settings — overrides stored on disk at
 * `<project-root>/.praxis/settings.json` rather than in localStorage.
 *
 * The "project root" is the active custom project directory when one
 * has been set via /api/projects POST, otherwise the app's working
 * directory (process.cwd). The .praxis/ folder is created on demand.
 *
 * The client merges the project settings over the global (localStorage)
 * settings on load: `{ ...globalSettings, ...projectSettings }`.
 *
 * GET    — reads `.praxis/settings.json`; returns `{ ok, settings }` if
 *          present, `{ ok: false }` otherwise.
 * POST   — body `{ settings: {...} }`; writes the file (creates the
 *          .praxis/ directory if needed).
 * DELETE — removes the file (no-op if it doesn't exist).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The per-project JSON config files that live in `.praxis/` — every
 *  one is created (with its EMPTY default shape) when the project is
 *  opened and the file is missing, and left COMPLETELY alone when it
 *  already exists ("if the .praxis is found and the configs is
 *  inside, no need to create it — just load it from there"):
 *    ▸ settings.json      — the per-project settings overrides;
 *    ▸ notes.json         — the per-script notes map ({});
 *    ▸ appearance.json   — explorer icon/color customization;
 *    ▸ spell-ignore.json — the project spell-check ignore list ([]).
 *  (active-project.json / projects.json are APP-level files in the
 *  DEFAULT root's .praxis — they are not per-project state and are
 *  managed by lib/scripts.ts.) */
const PRAXIS_PROJECT_CONFIGS: ReadonlyArray<{ name: string; default: string }> = [
    {name: "notes.json", default: "{}\n"},
    {name: "appearance.json", default: '{\n  "folders": {},\n  "files": {}\n}\n'},
    {name: "spell-ignore.json", default: "[]\n"},
];

/** Ensure the ACTIVE project's `.praxis/` folder carries every project
 * JSON config: missing files are created with their empty default,
 * existing ones are NEVER overwritten (their contents are the * data). Runs at startup (the first GET /api/project-settings on
 * mount) and on every project switch — when a project is loaded its
 *.praxis folder is completed on the spot; when.praxis already
 * holds the configs this is a no-op read pass. Skipped entirely for
 * deliberately-cleared projects (seed=0) so a "Clear project
 * settings" still leaves no husk behind. */
async function ensurePraxisConfigs(): Promise<void> {
    const dir = path.join(getScriptsRoot(), ".praxis");
    try {
        await fs.mkdir(dir, {recursive: true});
        for (const cfg of PRAXIS_PROJECT_CONFIGS) {
            const file = path.join(dir, cfg.name);
            try {
                await fs.access(file);
            } catch {
                // Missing — write the empty default shape (best-effort: a
                // read-only project must never fail the settings GET).
                try {
                    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
                    await fs.writeFile(tmp, cfg.default, "utf-8");
                    await fs.rename(tmp, file);
                } catch {
                    try {
                        await fs.writeFile(file, cfg.default, "utf-8");
                    } catch {
                        /* not writable — the lazy on-demand writers keep working */
                    }
                }
            }
        }
    } catch {
        /* the settings read below still works; .praxis stays absent */
    }
}

/** Resolve the on-disk path for the active project's settings file.
 *
 * FIX: the root used to be
 * `getActiveProjectRoot ?? SCRIPTS_ROOT ?? process.cwd` — with
 * the DEFAULT project open that resolved to the APP root
 * (process.cwd, the folder that contains python_scripts/), so
 * `.praxis/settings.json` landed OUTSIDE python_scripts. The root is
 * now `getScriptsRoot` — the ACTIVE project when one is open, else
 * `<cwd>/python_scripts` (or the SCRIPTS_ROOT pin in standalone /
 * Docker) — exactly the folder the explorer shows as the project
 * root, so the settings live where a user (and version control)
 * would look for them. */
function settingsFilePath(): string {
    return path.join(getScriptsRoot(), ".praxis", "settings.json");
}

/** Write the settings file ATOMICALLY (tmp + rename) with a DIRECT
 * writeFile fallback.: on Windows the rename can fail with EBUSY /
 * EPERM while an AV scanner or the search indexer holds the fresh tmp
 * file — the previous code gave up, leaving the.praxis/ directory
 * created and EMPTY (mkdir had already landed). The fallback now
 * writes the file in place directly: a crash mid-write is recoverable
 * (the JSON parse on the next GET rejects a torn file and re-seeds),
 * and "the file exists with the settings" beats "the folder is empty".
 * Returns true when the file verifiably landed on disk. */
async function writeSettingsFile(
    file: string,
    settings: unknown
): Promise<boolean> {
    const text = JSON.stringify(settings, null, 2) + "\n";
    await fs.mkdir(path.dirname(file), {recursive: true});
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
        await fs.writeFile(tmp, text, "utf-8");
        await fs.rename(tmp, file);
        return true;
    } catch {
        // Atomic path failed (EBUSY / EPERM / EXDEV …) — direct write, then
        // clean the tmp husk best-effort.
        try {
            await fs.writeFile(file, text, "utf-8");
            return true;
        } catch {
            return false;
        } finally {
            try {
                await fs.unlink(tmp);
            } catch {
                /* tmp never landed / already gone */
            }
        }
    }
}

export async function GET(request: Request) {
    // this GET is one of the two FIRST calls on mount (it can
    // beat /api/projects) — restore the persisted active-project pointer
    // before resolving the settings path, so the read (and the seed POST
    // that follows a missing file) target the project the user actually
    // has open, never the default folder after a server restart.
    await restoreActiveProjectRoot();
    // `?seed=0` opts OUT of the server-side auto-seed — the
    // client sends it for projects whose settings the user deliberately
    // CLEARED (Settings → Clear project settings), so "by all means
    // create the file" never resurrects a file the user just deleted
    // (the guarantee).
    const wantsSeed = new URL(request.url).searchParams.get("seed") !== "0";
    // The .praxis folder with its JSON configs is created in the
    // CURRENT project the moment it is opened (mount / project switch)
    // when missing, and loaded as-is when present — before the settings
    // read so a brand-new project's .praxis exists from the first GET.
    if (wantsSeed) {
        await ensurePraxisConfigs();
    }
    const file = settingsFilePath();
    try {
        const text = await fs.readFile(file, "utf-8");
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return NextResponse.json({ok: true, settings: parsed, praxisDir: path.dirname(file)});
        }
        // Unparseable / non-object file — fall through to the seed below.
    } catch {
        // Missing file (or torn write) — fall through to the seed below.
    }
    // no readable.praxis/settings.json — the
    // SERVER seeds one NOW with the built-in defaults so the file is
    // guaranteed to exist from the very first GET, even when the browser's
    // follow-up POST (the client-side copy of the CURRENT
    // settings) never lands (offline, blocked, Windows AV flakiness…).
    // `seeded: true` tells the client the file was just created; it then
    // still POSTs its own settings so the copy carries the values
    // (see page.tsx fetchProjectSettings).
    if (wantsSeed) {
        const seededOk = await writeSettingsFile(file, DEFAULT_SETTINGS);
        if (seededOk) {
            return NextResponse.json({
                ok: true,
                settings: DEFAULT_SETTINGS,
                seeded: true,
                praxisDir: path.dirname(file)
            });
        }
    }
    return NextResponse.json({ok: false});
}

export async function POST(request: Request) {
    let body: { settings?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {error: "Invalid JSON body."},
            {status: 400}
        );
    }
    if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
        return NextResponse.json(
            {error: "Request body must include a `settings` object."},
            {status: 400}
        );
    }
    // the GET above restores the active-project pointer, but a
    // server restart between the GET and this POST (or a direct POST from
    // a retry / another tab) would otherwise target the DEFAULT folder.
    // Restoring here too costs one cheap stat and keeps every write aimed
    // at the project the user has open.
    await restoreActiveProjectRoot();
    // When settings carry an interpreter selection, drop the server-side
    // interpreter / env caches so the next request re-validates against a
    // fresh discovery (the only path that may
    // reset the interpreter cache is the settings endpoint).
    if ("pythonInterpreter" in body.settings) {
        resetInterpreterCache();
    }
    const file = settingsFilePath();
    // →46: atomic write with a DIRECT-write fallback (see
    // writeSettingsFile) — "by all means", a settings.json lands in the
    // project dir instead of an empty .praxis/ folder.
    const wrote = await writeSettingsFile(file, body.settings);
    if (wrote) {
        return NextResponse.json({ok: true, praxisDir: path.dirname(file)});
    }
    return NextResponse.json(
        {error: `Failed to write project settings: the .praxis folder is not writable (read-only project? AV lock?) — retry or check the folder permissions.`},
        {status: 500}
    );
}

export async function DELETE() {
    const file = settingsFilePath();
    try {
        await fs.unlink(file);
    } catch {
        // File may not exist — that's fine, the end state is "no project
        // settings" either way.
        return NextResponse.json({ok: true});
    }
    // the file IS gone — prune the.praxis/ folder too when
    // this was its last content (the old code unlinked settings.json and
    // left an EMPTY .praxis/ directory behind, which reads as "the folder
    // is created but nothing in it"). appearance.json / notes.json /
    // spell-ignore.json keep it alive; an empty folder disappears.
    try {
        const dir = path.dirname(file);
        const rest = await fs.readdir(dir);
        if (rest.length === 0) await fs.rmdir(dir);
    } catch {
        /* not empty / vanished — either way the file deletion stands */
    }
    return NextResponse.json({ok: true});
}
