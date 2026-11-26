import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
    FORBIDDEN_ROOT_NAMES,
    getDefaultScriptsRoot,
    getProjectsParentRoot,
    isCreatedProject,
    listCreatedProjects,
    projectRootRejectionReason,
    scanPythonFiles,
} from "@/lib/scripts";

/**
 * GET /api/folder-list?path=<absolute-or-relative path>
 *
 * Powers the "Open folder…" / File → Open project → "Browse for
 * folder…" picker: lists the SUBDIRECTORIES of the requested directory
 * so the user can navigate the filesystem and open any folder as the
 * active project.
 *
 * browse ANYWHERE on the machine. The old rules
 * pinned the picker inside the projects parent root and rejected any
 * `..` escape; now:
 *
 * - no `path` param → start at the projects parent root (where the
 * auto-listed projects live — the natural starting point);
 * - an ABSOLUTE path lists that directory, wherever it is;
 * - a RELATIVE path resolves against the projects parent root
 * (back-compat with root-relative entries);
 * - "Up one level" climbs parent directories all the way to the
 * drive/filesystem root (where it stops);
 * - dot-directories and FORBIDDEN_ROOT_NAMES stay hidden from the
 * LISTING (noise + footguns — their subtrees are still reachable
 * by typing a path, but POST /api/projects rejects them as roots);
 * - the response carries a precomputed breadcrumb (`crumbs`) so the
 * client never has to split/Join OS-specific separators, plus
 * `isAppDir` (the picker disables Open for the app's own folder)
 * and `rejection` (why the CURRENT folder cannot be opened, if
 * applicable — surfaced as a hint instead of a dead button).
 *
 * Response:
 * {
 * root, rootName, path, relPath, parent, isDefault, isAppDir,
 * hasPy, scriptCount, created, rejection, startPath,
 * crumbs: [{ name, path, isStart }],
 * dirs: [{ name, path, hasPy, scriptCount, created }]
 * }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PickerCrumb {
    name: string;
    path: string;
    /** True for the crumb that is the projects parent root — the
     *  client labels it "… (projects)" so the starting point stays
     *  recognizable while browsing far away from it. */
    isStart: boolean;
}

interface PickerDirInfo {
    name: string;
    path: string;
    hasPy: boolean;
    scriptCount: number;
    /** True when the directory is in the created-projects registry —
     *  such projects were opened/created through the app before. */
    created: boolean;
}

export async function GET(request: Request) {
    const start = getProjectsParentRoot();
    const url = new URL(request.url);
    const requested = (url.searchParams.get("path") ?? "").trim();

    // absolute paths list anywhere; relative paths resolve
    // against the projects parent root; no path = the start directory.
    const resolved = requested
        ? path.isAbsolute(requested)
            ? path.resolve(requested)
            : path.resolve(start, requested)
        : start;

    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(resolved, {withFileTypes: true});
    } catch {
        return NextResponse.json(
            {error: "Directory does not exist or is not readable."},
            {status: 404}
        );
    }

    const registered = new Set(await listCreatedProjects());

    // The current directory itself — is it openable as a project?
    const fsRoot = path.parse(resolved).root;
    const rel = path.relative(fsRoot, resolved); // "" at the drive root
    const isDefault = resolved === getDefaultScriptsRoot();
    const isAppDir = resolved === process.cwd();
    const rejection = projectRootRejectionReason(resolved);
    let selfHasPy = false;
    let selfCount = 0;
    // Skip the .py scan for the app directory and the drive root — both
    // are un-openable anyway, and walking their trees is pure latency.
    if (rel !== "" && !isAppDir) {
        const scan = await scanPythonFiles(resolved);
        selfHasPy = scan.hasPy;
        selfCount = scan.count;
    }
    const selfCreated = rel !== "" && (await isCreatedProject(resolved));

    // Breadcrumb from the filesystem root down to the current directory
    // (OS-separator-safe: built server-side, joined with path.join).
    const crumbs: PickerCrumb[] = [];
    {
        const parts = rel ? rel.split(path.sep).filter(Boolean) : [];
        let acc = fsRoot;
        crumbs.push({
            name: fsRoot === "/" ? "Filesystem" : fsRoot,
            path: fsRoot,
            isStart: fsRoot === path.resolve(start),
        });
        for (const part of parts) {
            acc = path.join(acc, part);
            crumbs.push({name: part, path: acc, isStart: acc === path.resolve(start)});
        }
    }

    const dirs: PickerDirInfo[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;
        if (FORBIDDEN_ROOT_NAMES.has(entry.name)) continue;
        const abs = path.join(resolved, entry.name);
        const {hasPy, count} = await scanPythonFiles(abs);
        dirs.push({
            name: entry.name,
            path: abs,
            hasPy,
            scriptCount: count,
            created: registered.has(abs),
        });
    }
    dirs.sort((a, b) =>
        a.name.localeCompare(b.name, "en", {sensitivity: "base"})
    );

    return NextResponse.json({
        root: fsRoot,
        rootName: fsRoot === "/" ? "Filesystem" : fsRoot,
        path: resolved,
        // Forward-slash form for display/back-compat (client-side joins).
        relPath: rel ? rel.split(path.sep).join("/") : "",
        parent: rel === "" ? null : path.dirname(resolved),
        isDefault,
        isAppDir,
        rejection,
        startPath: path.resolve(start),
        hasPy: selfHasPy,
        scriptCount: selfCount,
        created: selfCreated,
        crumbs,
        dirs,
    });
}
