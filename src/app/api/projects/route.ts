import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
    FORBIDDEN_ROOT_NAMES,
    getActiveProjectRoot,
    getDefaultScriptsRoot,
    getProjectsParentRoot,
    isActiveProjectDefault,
    listCreatedProjects,
    projectRootRejectionReason,
    registerCreatedProject,
    restoreActiveProjectRoot,
    scanPythonFiles,
    setActiveProjectRoot,
} from "@/lib/scripts";
import {SCRIPTS_DIR_NAME} from "@/lib/config";

/**
 * Multi-project support.
 *
 * GET /api/projects — scans the projects parent root (see
 * getProjectsParentRoot) for subdirectories that contain at least one
 * `.py` file (directly or in nested folders) and returns them as
 * available "projects", PLUS every registered project — including
 * ones that are still empty or live OUTSIDE the projects parent root
 *. The default `python_scripts/` directory is covered by
 * the client's dedicated "Default" entry and is not listed again.
 *
 * POST /api/projects — body: `{ path: string }`. Sets the active
 * project root (module-level server state). After this call, every
 * subsequent /api/folders, /api/code, /api/run, etc. reads from the
 * new project root. Pass an empty string or `"default"` to reset to
 * the default `python_scripts/` directory.
 *
 * the project root may live ANYWHERE on the machine — the
 *. The old containment
 * ("must be a direct child of the projects parent root") is gone;
 * what survives are the guards that stop genuine footguns: the app's
 * own directory, the drive root, reserved directory names
 * (node_modules, src, public, …) and hidden dot-folders. A folder with
 * zero `.py` files is now also openable (an empty book project is a
 * legitimate starting point — files are created afterwards from the
 * Explorer). Explicitly-opened folders are registered so they persist
 * in the switcher across restarts.
 */

interface ProjectInfo {
    name: string;
    path: string;
    scriptCount: number;
}

/**
 * Directories that may never be set as a project root live in
 * scripts.ts now (projectRootRejectionReason + FORBIDDEN_ROOT_NAMES)
 * — shared with /api/folder-list, the "Browse for folder…" picker.
 */

/** GET — list available projects: scanned children of the projects
 *  parent root (with .py files) plus every registered project. */
export async function GET() {
    // after a server restart the module-level active root is
    // null — restore the persisted pointer BEFORE reporting `active`, so
    // the client lands on the project the user last had open (and the
    // .praxis/settings.json seeding targets THAT project's folder).
    await restoreActiveProjectRoot();
    const parent = getProjectsParentRoot();
    const projects: ProjectInfo[] = [];

    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(parent, {withFileTypes: true});
    } catch {
        return NextResponse.json({
            projects: [],
            active: isActiveProjectDefault() ? "" : (getActiveProjectRoot() ?? ""),
        });
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;
        // Skip noise / build / VCS directories.
        if (FORBIDDEN_ROOT_NAMES.has(entry.name)) continue;
        const abs = path.join(parent, entry.name);
        // The default python_scripts/ dir is represented by the client's
        // dedicated "Default" menu entry — listing it here as well showed
        // the same project twice in the switcher.
        if (abs === getDefaultScriptsRoot()) continue;
        const {hasPy, count} = await scanPythonFiles(abs);
        if (!hasPy) continue;
        projects.push({name: entry.name, path: abs, scriptCount: count});
    }

    // Merge in registered projects: freshly created ones (still empty,
    // invisible to the scan above) AND arbitrary-path projects
    // the user opened once (they persist in the switcher across server
    // restarts). Every registry entry is re-validated before it is
    // trusted — the registry file lives inside the workspace, so a
    // crafted file-write must not be able to register e.g. `node_modules`
    // or the app directory as a switchable project.
    const registered = await listCreatedProjects();
    for (const p of registered) {
        if (projects.some((x) => x.path === p)) continue;
        // entries may live anywhere on the machine — validation
        // is the shared projectRootRejectionReason guard + existence.
        if (projectRootRejectionReason(p)) continue;
        if (p === getDefaultScriptsRoot()) continue;
        try {
            const st = await fs.stat(p);
            if (!st.isDirectory()) continue;
        } catch {
            continue; // deleted from disk since it was registered
        }
        const {count} = await scanPythonFiles(p);
        projects.push({name: path.basename(p), path: p, scriptCount: count});
    }

    // Sort alphabetically for stable display.
    projects.sort((a, b) =>
        a.name.localeCompare(b.name, "en", {sensitivity: "base"})
    );

    // `active` is "" when the server is using the default python_scripts/
    // dir (so the client can treat empty string as "default"), or the
    // absolute path of the active custom project otherwise.
    return NextResponse.json({
        projects,
        active: isActiveProjectDefault() ? "" : (getActiveProjectRoot() ?? ""),
    });
}

/** POST — set the active project root. */
export async function POST(request: Request) {
    let body: { path?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const requestedPath = (body.path ?? "").trim();

    // Empty string or "default" resets to the default python_scripts/ dir.
    if (!requestedPath || requestedPath === "default") {
        setActiveProjectRoot(null);
        return NextResponse.json({
            ok: true,
            projectPath: "",
            projectName: SCRIPTS_DIR_NAME,
        });
    }

    // Resolve the requested path. relative paths resolve
    // against the projects parent root (back-compat with the switcher
    // and the picker's root-relative entries); ABSOLUTE paths may point
    // anywhere on the machine.
    const parent = getProjectsParentRoot();
    const resolved = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(parent, requestedPath);

    // Selecting the default python_scripts/ dir explicitly is the same
    // as resetting to the default state — normalize it so the client's
    // "Default" entry gets checked instead of showing the default dir
    // as a pseudo-custom project.
    if (resolved === getDefaultScriptsRoot()) {
        setActiveProjectRoot(null);
        return NextResponse.json({
            ok: true,
            projectPath: "",
            projectName: SCRIPTS_DIR_NAME,
        });
    }

    // guard set (replaces the old "must stay inside the
    // projects parent root" containment, which blocked the user's
    // at-any-path projects): drive roots, the app's own directory,
    // reserved directory names and hidden dot-folders stay rejected —
    // activating any of those is a footgun (walking the whole drive,
    // exposing the server tree / .env to the per-file write routes,
    // …), while every other real directory is fair game.
    const rejection = projectRootRejectionReason(resolved);
    if (rejection) {
        return NextResponse.json({error: rejection}, {status: 400});
    }

    try {
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) {
            return NextResponse.json(
                {error: "Project path is not a directory."},
                {status: 400}
            );
        }
    } catch {
        return NextResponse.json(
            {error: "Project directory does not exist."},
            {status: 404}
        );
    }

    // the "must contain.py files" requirement is gone — an
    // empty folder is a legitimate empty book project (the user opens
    // it and creates files from the Explorer). Register the folder so
    // it survives restarts in the File → Open project switcher; the
    // registry is pruned automatically when a folder disappears.
    await registerCreatedProject(resolved);
    setActiveProjectRoot(resolved);
    return NextResponse.json({
        ok: true,
        projectPath: resolved,
        projectName: path.basename(resolved),
    });
}
