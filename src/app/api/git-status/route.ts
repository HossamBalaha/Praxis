import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * GET /api/git-status
 *
 * If `python_scripts/` (or whatever SCRIPTS_DIR points to) is inside a
 * git repository, runs `git status --porcelain` and returns a list of
 * file statuses keyed by relative path. Used to show modified/untracked
 * badges next to file names in the dropdown.
 *
 * Returns ok=false (not an error) when the directory isn't a git repo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

interface GitEntry {
    path: string;
    /** Index status character (M, A, D, ?, etc.). */
    indexStatus: string;
    /** Working tree status character. */
    wtStatus: string;
}

export async function GET() {
    // Run both `git status --porcelain` and `git rev-parse --abbrev-ref HEAD`
    // in parallel — the branch name is shown in the Footer's git chip and
    // the porcelain output drives the per-file status badges in the
    // sidebar. Branch fetch is best-effort: if it fails (detached HEAD,
    // weird refs), we just return branch=null and the Footer hides the
    // chip's branch label.
    const [statusResult, branchResult] = await Promise.all([
        new Promise<{ ok: boolean; stdout: string; stderr: string }>(
            (resolve) => {
                const child = spawn(
                    "git",
                    ["status", "--porcelain=v1", "-z"],
                    {cwd: getScriptsRoot(), env: process.env, stdio: ["ignore", "pipe", "pipe"]}
                );
                const timer = setTimeout(() => {
                    try {
                        child.kill("SIGKILL");
                    } catch {
                    }
                }, TIMEOUT_MS);
                let stdout = "";
                let stderr = "";
                child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
                child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
                child.on("close", (code) => {
                    clearTimeout(timer);
                    resolve({ok: code === 0, stdout, stderr});
                });
                child.on("error", () => {
                    clearTimeout(timer);
                    resolve({ok: false, stdout: "", stderr: "spawn error"});
                });
            }
        ),
        new Promise<{ ok: boolean; branch: string | null }>((resolve) => {
            const child = spawn(
                "git",
                ["rev-parse", "--abbrev-ref", "HEAD"],
                {cwd: getScriptsRoot(), env: process.env, stdio: ["ignore", "pipe", "pipe"]}
            );
            const timer = setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                } catch {
                }
            }, TIMEOUT_MS);
            let stdout = "";
            child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
            child.on("close", (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    const branch = stdout.trim();
                    // detached HEAD returns "HEAD" — treat as no branch.
                    resolve({ok: true, branch: branch && branch !== "HEAD" ? branch : null});
                } else {
                    resolve({ok: false, branch: null});
                }
            });
            child.on("error", () => {
                clearTimeout(timer);
                resolve({ok: false, branch: null});
            });
        }),
    ]);

    if (!statusResult.ok) {
        // Most likely: not a git repo, or git not installed.
        return NextResponse.json({
            ok: false,
            isRepo: false,
            entries: [],
            branch: null,
            hint: "Initialize a git repo in your scripts directory to see status badges.",
        });
    }

    // porcelain v1 -z output: each entry is "XY <path>\0". For renames (R)
    // and copies (C) a second NUL-separated field follows holding the
    // destination (R) or source (C) path.
    const entries: GitEntry[] = [];
    const parts = statusResult.stdout.split("\0").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.length < 4) continue;
        const indexStatus = part[0];
        const wtStatus = part[1];
        let pathStr = part.slice(3);
        // Rename (R) or Copy (C): the next NUL-separated field is the
        // destination path (for R) or source path (for C). For R we want
        // the destination; for C we want the current path.
        if (indexStatus === "R") {
            // pathStr is the source; the destination is the next part.
            const dest = parts[i + 1];
            if (dest) {
                pathStr = dest;
                i++; // consume the destination field
            }
        } else if (indexStatus === "C") {
            // pathStr is the destination already; the source is the next part.
            i++; // consume the source field
        }
        entries.push({path: pathStr, indexStatus, wtStatus});
    }

    return NextResponse.json({
        ok: true,
        isRepo: true,
        entries,
        branch: branchResult.branch,
    });
}
