import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getProjectsParentRoot, registerCreatedProject, setActiveProjectRoot,} from "@/lib/scripts";

/**
 * POST /api/projects/create
 *
 * Body: { name: string, parentDir?: string }
 *
 * Creates a new empty project directory — under the projects parent
 * root by default (see getProjectsParentRoot), or inside the
 * user-chosen `parentDir` (the dialog now asks WHERE the
 * project should be created) — and switches the active project root
 * to it. The directory must not already exist (to prevent accidental
 * overwrite). After this call, every subsequent /api/folders,
 * /api/code, /api/run, etc. reads from the new (empty) project root.
 *
 * The project is registered in the created-projects registry
 * (`<default root>/.praxis/projects.json`) so it stays listed and
 * switchable in /api/projects while it is still empty — GET otherwise
 * only lists directories that already contain a.py file.
 *
 * Response: { ok, projectPath, projectName }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _\-]{0,63}$/;

export async function POST(request: Request) {
    let body: { name?: string; parentDir?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const rawName = (body.name ?? "").trim();
    if (!rawName) {
        return NextResponse.json({error: "Project name is required."}, {status: 400});
    }
    if (!NAME_RE.test(rawName)) {
        return NextResponse.json(
            {
                error:
                    "Project name must be 1–64 chars, start with a letter or digit, and contain only letters, digits, spaces, underscores, or hyphens.",
            },
            {status: 400}
        );
    }

    // Reserved / forbidden names — would conflict with build / VCS / app dirs.
    const reserved = new Set([
        "node_modules", ".next", ".git", "public", "src", ".vscode", ".idea",
        "scripts", "prisma", "db", "mini-services", "out", "dist", "build",
        ".cache", ".turbo", ".vercel",
    ]);
    if (reserved.has(rawName.toLowerCase())) {
        return NextResponse.json(
            {error: `"${rawName}" is a reserved name. Choose a different project name.`},
            {status: 400}
        );
    }

    // The parent directory every top-level project lives in. Resolves
    // to process.cwd in dev, and to the SCRIPTS_ROOT's parent in the
    // standalone/Docker deployment  — process.cwd there is
    // the throwaway .next/standalone snapshot, so creating projects
    // under it would put them outside the mounted volume.
    //
    // an explicit parentDir overrides the default — the user
    // picked the location in the create-project dialog (validated
    // below: must be absolute + an existing directory).
    let parent = getProjectsParentRoot();
    const requestedParent = (body.parentDir ?? "").trim();
    if (requestedParent) {
        if (!path.isAbsolute(requestedParent)) {
            return NextResponse.json(
                {error: "The location must be an absolute path (e.g. /home/me/projects or D:\\Projects)."},
                {status: 400}
            );
        }
        try {
            const stat = await fs.stat(requestedParent);
            if (!stat.isDirectory()) throw new Error("not a directory");
        } catch {
            return NextResponse.json(
                {error: `Location "${requestedParent}" does not exist or is not a folder.`},
                {status: 400}
            );
        }
        parent = path.resolve(requestedParent);
    }
    const abs = path.resolve(parent, rawName);

    // Safety: the resolved path must be directly inside the chosen
    // parent (a custom location is the own disk; the default
    // location keeps the app-working-directory rule).
    const rel = path.relative(parent, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json(
            {error: "Project path must be inside the chosen location."},
            {status: 400}
        );
    }

    // Refuse to overwrite an existing directory.
    try {
        await fs.stat(abs);
        return NextResponse.json(
            {error: `A directory named "${rawName}" already exists. Choose a different name or use the existing project.`},
            {status: 409}
        );
    } catch {
        // Good — directory does not exist. Continue.
    }

    // Create the empty directory (recursive in case of nested path,
    // though our NAME_RE prevents slashes). No starter folder folder:
    // the user gets a genuinely empty project, and the registry below
    // (not a seeded folder) is what keeps it visible while empty.
    await fs.mkdir(abs, {recursive: true});

    // Register it so /api/projects lists it and /api/projects POST can
    // switch back to it while it still contains no Python scripts.
    await registerCreatedProject(abs);

    // Switch the active project to the new directory.
    setActiveProjectRoot(abs);

    return NextResponse.json({
        ok: true,
        projectPath: abs,
        projectName: rawName,
    });
}
