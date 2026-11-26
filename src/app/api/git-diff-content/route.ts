import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * GET /api/git-diff-content?path=<relative-path>[&untracked=1][&scope=all|unstaged|staged]
 *
 * Runs `git diff HEAD -- <path>` (with cwd=scripts root) and returns
 * the raw unified diff text. Used by the Git Diff bottom-panel tab to
 * render a side-by-side view of every modified file.
 *
 * `scope` narrows WHICH pair of trees the diff compares (the panel's
 * staged/unstaged views + its Unstage machinery):
 *   scope=all (default, backwards compatible) — `git diff HEAD --`:
 *     combined staged + unstaged changes (the classic view).
 *   scope=unstaged — `git diff --`: index ↔ working tree — exactly
 *     the changes the panel's “Stage file / Stage hunk” buttons move
 *     INTO the index.
 *   scope=staged — `git diff --cached --`: HEAD ↔ index — exactly
 *     the changes the panel's “Unstage file / Unstage hunk” buttons
 *     remove FROM the index. An untracked file has NO index entry, so
 *     the staged scope legitimately returns an empty diff for it (the
 * `untracked=1` /dev/null fallback only applies to the unstaged/all
 *   scopes — that view describes the working tree).
 *
 * Unlike /api/git-diff (which takes folder+file slugs and returns
 * parsed line-number arrays for the editor gutter), this route is
 * path-based and returns the raw diff string — the client does the
 * parsing for side-by-side rendering.
 *
 * `untracked=1` (Section 6,— diff for ALL file states):
 * `git diff HEAD` shows NOTHING for an untracked file (git simply
 * has no blob for it), which used to dead-end the panel on "Untracked
 * file — stage it…". With the flag the route instead runs
 * `git diff --no-index -- /dev/null <absPath>` from the repo root —
 * the whole file renders as an all-added diff, exactly like a
 * newly-added file in any IDE's diff view. Works for every file type.
 *
 * `binary: true` in the response marks a BINARY file change (git
 * prints "Binary files a/x and b/x differ" — no hunks); the panel
 * shows "binary changed" instead of the misleading "no changes".
 *
 * Response: { ok: boolean, isRepo: boolean, diff: string, binary?: boolean }
 *
 * - ok=true, isRepo=false, diff=""  → not a git repo (or no HEAD).
 * - ok=true, isRepo=true,  diff=""  → repo, but the file has no changes.
 * - ok=true, isRepo=true,  diff=... → repo, file has uncommitted changes.
 * - ok=false                       → spawn failure or path outside repo
 *                                    (HTTP 400/500).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

/** Spawn one git command (argv array + cwd), capturing output. */
function runGit(
    scriptsRoot: string,
    args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(
            "git",
            args,
            {
                cwd: scriptsRoot,
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
            resolve({code, stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({code: null, stdout: "", stderr: "spawn error"});
        });
    });
}

export async function GET(request: NextRequest) {
    const rawPath = request.nextUrl.searchParams.get("path") ?? "";
    if (!rawPath) {
        return NextResponse.json(
            {ok: false, error: "Query param 'path' is required."},
            {status: 400}
        );
    }

    const scriptsRoot = getScriptsRoot();

    // Basic input validation: reject empty / absolute / `..`-bearing
    // paths. We don't enforce containment within SCRIPTS_ROOT here
    // (unlike /api/git-diff) because the paths come from
    // `git status --porcelain`, which reports files ANYWHERE in the
    // repo — including paths outside SCRIPTS_ROOT (e.g. when the
    // scripts dir is a subdirectory of the repo and the user has
    // edited files in the parent). The actual safety comes from the
    // `:/<path>` pathspec below, which git interprets relative to the
    // REPO ROOT and refuses to resolve outside the repo.
    if (path.isAbsolute(rawPath) || rawPath.split("/").includes("..")) {
        return NextResponse.json(
            {ok: false, error: "Path must be a relative path inside the repo."},
            {status: 400}
        );
    }
    // Normalize backslashes to forward slashes for git (Windows).
    const relPath = rawPath.split(path.sep).join("/");

    const untracked = request.nextUrl.searchParams.get("untracked") === "1";

    // Which pair of trees to compare — see the route doc above. An
    // unknown value falls back to the classic combined HEAD diff so
    // older callers (the panel before the scope toggle, the commit
    // dialog's AI-message diff fetch) keep working unchanged.
    const rawScope = request.nextUrl.searchParams.get("scope") ?? "all";
    const scope: "all" | "unstaged" | "staged" =
        rawScope === "staged" || rawScope === "unstaged" ? rawScope : "all";

    if (untracked && scope !== "staged") {
        // ── Untracked file `git diff HEAD` can't show it (no
        //    blob), so diff /dev/null against the file from the REPO ROOT
        //    — the classic all-added "new file" view. The repo root is
        //    resolved with rev-parse (the pathspec `:/` trick doesn't
        //    apply to --no-index, which takes real filesystem paths),
        //    and the file must exist under it (a status "?" entry always
        //    does — the panel only sends paths it got from git-status).
        const rootRes = await runGit(scriptsRoot, ["rev-parse", "--show-toplevel"]);
        const root = rootRes.code === 0 ? rootRes.stdout.trim() : "";
        if (!root) {
            return NextResponse.json({
                ok: true,
                isRepo: false,
                diff: "",
                hint: "Scripts directory is not inside a git repository.",
            });
        }
        // Containment: the untracked path is repo-root-relative; join and
        // verify it stays under the root before handing it to git.
        const abs = path.resolve(root, relPath);
        const relFromRoot = path.relative(root, abs);
        if (!relFromRoot || relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
            return NextResponse.json(
                {ok: false, error: "Path must be a relative path inside the repo."},
                {status: 400}
            );
        }
        // --no-index exits 1 when there IS a diff; 0 only when the files
        // are identical (impossible vs /dev/null for a non-empty file).
        const result = await runGit(root, ["diff", "--no-index", "--", "/dev/null", abs]);
        if (result.code === null) {
            return NextResponse.json(
                {ok: false, error: result.stderr || "Failed to spawn git."},
                {status: 500}
            );
        }
        return NextResponse.json({
            ok: true,
            isRepo: true,
            diff: result.stdout,
            binary: /Binary files .* differ/.test(result.stdout),
            relPath,
        });
    }

    // Use the `:/<path>` pathspec prefix so git resolves the path
    // against the REPO ROOT, not the CWD. This matches the format
    // `git status --porcelain` emits (paths are repo-root-relative
    // when CWD is a subdirectory of the repo). Without this prefix,
    // git would look for `<cwd>/<path>` and silently return an empty
    // diff for any file outside the CWD.
    //
    // The scope picks the exact `git diff` flavor (HEAD vs index vs
    // working tree — see the route doc); plain `git diff` prints the
    // text to stdout and exits 0 either way (no --exit-code set), so
    // the shared exit-code handling below covers all three flavors.
    const diffArgs =
        scope === "staged"
            ? ["diff", "--cached", "--", `:/${relPath}`]
            : scope === "unstaged"
                ? ["diff", "--", `:/${relPath}`]
                : ["diff", "HEAD", "--", `:/${relPath}`];
    const result = await runGit(scriptsRoot, diffArgs);

    // git diff exit codes (same semantics as /api/git-diff):
    //   null  → spawn failed → 500.
    //   0     → no changes (success, empty stdout).
    //   1     → there ARE changes (git diff exits 1 when output is
    //           produced for a tracked file with diffs).
    //   128   → not a git repo / no HEAD commit.
    //   other → treat as "no changes" so the panel keeps working.
    if (result.code === null) {
        return NextResponse.json(
            {ok: false, error: result.stderr || "Failed to spawn git."},
            {status: 500}
        );
    }

    if (result.code === 128) {
        return NextResponse.json({
            ok: true,
            isRepo: false,
            diff: "",
            hint: "Scripts directory is not inside a git repository.",
        });
    }

    // code === 1 (changes present) or code === 0 (no changes) — both
    // are "ok=true". The diff text is whatever git printed (empty for
    // code 0). `binary` marks the "Binary files … differ" case so the
    // panel can say "binary changed" instead of "no changes".
    return NextResponse.json({
        ok: true,
        isRepo: true,
        diff: result.stdout,
        binary: /Binary files .* differ/.test(result.stdout),
        relPath,
    });
}
