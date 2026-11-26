import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {getScriptsRoot, safeFolderName} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/create-venv
 *
 * Body: { folder: <slug>, interpreter?: string }
 *
 * Creates a per-folder virtual environment at `.venv/<folder-slug>/`
 * under the project root using `<interpreter> -m venv`. The venv lets
 * each folder have its own isolated dependency set (e.g. conflicting
 * numpy versions between two folders) without polluting the global
 * Python install.
 *
 * The slug is base64url-encoded (per the codebase convention), which
 * makes it filesystem-safe even when the folder display name contains
 * spaces, slashes, or non-ASCII characters.
 *
 * Response: {
 *   ok: boolean,
 *   venvPath: string,    // absolute path to the venv root
 *   venvPython: string,  // absolute path to the venv's python binary
 *   existed: boolean,    // true if the venv already existed (no-op)
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 120_000; // 2 min cap — venv creation can be slow on first run

/** Compute the venv root and python binary paths for a folder NAME
 *  (already validated via safeFolderName — the raw request
 *  field used to be interpolated directly, so a crafted slug built
 *  venv directories anywhere the process could write). */
function venvPathsFor(folderName: string): {
    venvPath: string;
    venvPython: string;
} | null {
    const venvRoot = path.resolve(process.cwd(), ".venv");
    const venvPath = path.join(venvRoot, folderName);
    // Containment guard: the venv must stay directly under .venv/.
    const rel = path.relative(venvRoot, venvPath);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") return null;
    const venvPython =
        process.platform === "win32"
            ? path.join(venvPath, "Scripts", "python.exe")
            : path.join(venvPath, "bin", "python");
    return {venvPath, venvPython};
}

/** Run `python -m venv <venvPath>` with the given interpreter. */
function runVenv(
    interpreter: string,
    venvPath: string
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const child = spawn(
            interpreter,
            ["-m", "venv", venvPath],
            {
                cwd: process.cwd(),
                env: process.env,
                stdio: ["ignore", "pipe", "pipe"],
            }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ok: code === 0, stdout, stderr, code});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({ok: false, stdout: "", stderr: "spawn error", code: null});
        });
    });
}

export async function POST(request: Request) {
    let body: { folder?: string; interpreter?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const {folder} = body;
    if (!folder) {
        return NextResponse.json(
            {error: "Body must include 'folder'."},
            {status: 400}
        );
    }

    // Validate the folder: safeFolderName applies the deslugify +
    // separator/".."/containment checks .
    const folderName = safeFolderName(folder);
    if (!folderName) {
        return NextResponse.json(
            {error: "Invalid folder slug."},
            {status: 400}
        );
    }
    // The folder folder must exist in the active project — a venv is
    // only ever created for a real folder.
    try {
        const folderStat = await fs.stat(path.join(getScriptsRoot(), folderName));
        if (!folderStat.isDirectory()) throw new Error("not a directory");
    } catch {
        return NextResponse.json(
            {error: "Folder not found in the active project."},
            {status: 404}
        );
    }

    const venv = venvPathsFor(folderName);
    if (!venv) {
        return NextResponse.json(
            {error: "Invalid folder name."},
            {status: 400}
        );
    }
    const {venvPath, venvPython} = venv;

    // If the venv already exists, return it as a no-op success. The user
    // can delete `.venv/<folder-slug>/` to force a fresh create.
    try {
        const stat = await fs.stat(/* turbopackIgnore: true */ venvPython);
        if (stat.isFile()) {
            return NextResponse.json({
                ok: true,
                venvPath,
                venvPython,
                existed: true,
            });
        }
    } catch {
        // Doesn't exist — fall through to creation.
    }

    // Ensure the `.venv/` parent dir exists.
    try {
        await fs.mkdir(path.resolve(process.cwd(), ".venv"), {recursive: true});
    } catch (err) {
        return NextResponse.json(
            {
                ok: false,
                error: `Failed to create .venv/ parent directory: ${(err as Error).message}`,
            },
            {status: 500}
        );
    }

    const interpreter = await findInterpreter(body.interpreter);
    const result = await runVenv(interpreter, venvPath);

    if (!result.ok) {
        // Distinguish "venv module not installed" from other failures.
        const stderrLower = result.stderr.toLowerCase();
        if (stderrLower.includes("no module named venv")) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `The interpreter "${interpreter}" does not have the venv module installed. Install python3-venv (Debian/Ubuntu) or use a different interpreter.`,
                },
                {status: 500}
            );
        }
        return NextResponse.json(
            {
                ok: false,
                error: result.stderr || `python -m venv exited with code ${result.code}`,
            },
            {status: 500}
        );
    }

    // Verify the python binary was actually created (some failures exit 0
    // but leave an incomplete venv).
    try {
        const stat = await fs.stat(/* turbopackIgnore: true */ venvPython);
        if (!stat.isFile()) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `venv creation reported success but ${venvPython} is missing.`,
                },
                {status: 500}
            );
        }
    } catch {
        return NextResponse.json(
            {
                ok: false,
                error: `venv creation reported success but ${venvPython} is missing.`,
            },
            {status: 500}
        );
    }

    return NextResponse.json({
        ok: true,
        venvPath,
        venvPython,
        existed: false,
    });
}
