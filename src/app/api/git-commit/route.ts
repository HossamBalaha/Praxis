import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/git-commit
 * Body: { message: string, files: string[] }
 *
 * Stages the listed files (`git add -- <files...>`) then creates a
 * commit (`git commit -m "<message>" -- <files...>`), all with
 * cwd=scripts root. Used by the Commit dialog.
 *
 * Response:
 *   { ok: true,  message: "Committed N files", commit?: "<sha>" }
 *   { ok: false, error: string }  (HTTP 400 / 500)
 *
 * Notes:
 *  - `files` are relative paths under the scripts root. Each is
 *    containment-checked (no `..`, no absolute paths).
 *  - `message` is passed as a single argv element, so shell-injection
 *    isn't a concern (we don't go through a shell).
 *  - We run `git add` before `git commit` so NEW (untracked) files
 *    are included — `git commit -- <files>` alone would refuse to
 *    commit an untracked file.
 *  - Exit-code 1 from `git commit` means "nothing to commit" — we
 *    surface that as a soft error rather than a hard 500.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 30_000;

interface CommitBody {
    message?: unknown;
    files?: unknown;
}

/** Resolve + sanity-check one relative path. Returns null if bad.
 * Unlike /api/git-diff we DON'T enforce containment within
 * SCRIPTS_ROOT — the paths come from `git status --porcelain`,
 * which reports files anywhere in the repo (the scripts dir is
 * often a subdirectory of the repo). Safety comes from the
 * `:/<path>` pathspec prefix used in the actual git commands,
 * which git resolves against the repo root and refuses to escape. */
function safeRelPath(_scriptsRoot: string, raw: string): string | null {
    if (!raw || typeof raw !== "string") return null;
    if (path.isAbsolute(raw)) return null;
    if (raw.split("/").includes("..")) return null;
    return raw.split(path.sep).join("/");
}

/** Run a git command, capturing stdout/stderr + exit code. */
function runGit(
    scriptsRoot: string,
    args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn("git", args, {
            cwd: scriptsRoot,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
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
            resolve({code, stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({code: null, stdout: "", stderr: "spawn error"});
        });
    });
}

export async function POST(request: NextRequest) {
    let body: CommitBody;
    try {
        body = (await request.json()) as CommitBody;
    } catch {
        return NextResponse.json(
            {ok: false, error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const filesArr = Array.isArray(body.files) ? body.files : null;

    if (!message) {
        return NextResponse.json(
            {ok: false, error: "Commit message is required."},
            {status: 400}
        );
    }
    if (!filesArr || filesArr.length === 0) {
        return NextResponse.json(
            {ok: false, error: "No files selected to commit."},
            {status: 400}
        );
    }

    const scriptsRoot = getScriptsRoot();

    // Validate every requested path. If any fails validation, reject
    // the whole request — better to refuse than to silently skip a file.
    const safePaths: string[] = [];
    for (const f of filesArr) {
        const safe = typeof f === "string" ? safeRelPath(scriptsRoot, f) : null;
        if (!safe) {
            return NextResponse.json(
                {ok: false, error: `Invalid file path: ${String(f)}`},
                {status: 400}
            );
        }
        safePaths.push(safe);
    }

    // Convert each path to a `:/<path>` pathspec so git resolves it
    // against the REPO ROOT (matching `git status --porcelain`'s output
    // format). Without this prefix, git would look for `<cwd>/<path>`
    // and silently miss any file outside the CWD.
    const pathspecs = safePaths.map((p) => `:/${p}`);

    // 1) Stage the requested files. `git add -- <pathspecs>` so paths
    //    are never mistaken for options.
    const addResult = await runGit(scriptsRoot, ["add", "--", ...pathspecs]);
    if (addResult.code !== 0) {
        return NextResponse.json(
            {
                ok: false,
                error: `git add failed: ${(addResult.stderr || addResult.stdout).trim() || `exit ${addResult.code}`}`,
            },
            {status: 500}
        );
    }

    // 2) Commit. Pass `-- <pathspecs>` so only the staged paths are
    // recorded (matches the selection). `-m` carries the
    //    message as a single argv element — no shell, no injection.
    const commitResult = await runGit(scriptsRoot, [
        "commit",
        "-m",
        message,
        "--",
        ...pathspecs,
    ]);

    if (commitResult.code === null) {
        return NextResponse.json(
            {ok: false, error: "Failed to spawn git."},
            {status: 500}
        );
    }

    // git commit exit codes:
    //   0  → committed.
    //   1  → nothing to commit (e.g. all selected files were already
    //        staged & clean). Surface as a soft error.
    //   other → real failure (e.g. bad message, hooks rejected).
    if (commitResult.code !== 0) {
        const stderr = commitResult.stderr.trim();
        const stdout = commitResult.stdout.trim();
        // "nothing to commit" → 400 with a friendly message.
        if (commitResult.code === 1 || /nothing to commit/i.test(stderr + stdout)) {
            return NextResponse.json(
                {ok: false, error: stderr || stdout || "Nothing to commit."},
                {status: 400}
            );
        }
        return NextResponse.json(
            {
                ok: false,
                error: stderr || stdout || `git commit exited with code ${commitResult.code}`,
            },
            {status: 500}
        );
    }

    // Parse the new commit SHA from stdout (`[branch <sha>] msg`).
    const shaMatch = commitResult.stdout.match(/\[\w+(?:\/\w+)*\s+([0-9a-f]{7,40})\]/);
    const sha = shaMatch ? shaMatch[1] : null;

    return NextResponse.json({
        ok: true,
        message: `Committed ${safePaths.length} file${safePaths.length === 1 ? "" : "s"}`,
        commit: sha,
    });
}
