import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * POST /api/git-branch
 *
 * branch management for the footer's git chip.
 *
 * Body:
 *   { action: "list" }                      → { ok, branches, current }
 *   { action: "switch", name }              → git switch <name>
 *   { action: "create", name, base? }       → git switch -c <name> [base]
 *   { action: "delete", name }              → git branch -d <name>
 *
 * Delete guards (the picker's trash affordance):
 *   - the CURRENT branch is refused here AND in the UI — git's own
 *     refusal ("cannot delete branch 'x' used by worktree at …") is
 *     correct but cryptic, so the route pre-checks and explains;
 *   - `git branch -d` (never -D) refuses branches with unmerged
 *     commits — that stderr is surfaced verbatim with a pointer to
 *     the force command, so nothing merged elsewhere is lost
 *     silently.
 *
 * Branch names are validated against a conservative pattern (git's
 * own rules are arcane — ref name components may not contain
 * space~^:?*[\, "..", a leading ".", or end with ".lock"; we simply
 * reject anything outside [A-Za-z0-9._/-] plus a few structural
 * rules) BEFORE the name ever reaches an argv — and since we spawn
 * without a shell, injection isn't possible anyway. The validation is
 * about giving a friendly error instead of git's cryptic one.
 *
 * Switching with uncommitted changes: `git switch` refuses when it
 * would overwrite local modifications — git's stderr is surfaced
 * verbatim so the dialog can show exactly what's blocking.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 30_000;

interface BranchBody {
    action?: unknown;
    name?: unknown;
    base?: unknown;
}

/** Conservative branch-name validation (friendly errors, not security
 *  — spawning without a shell already makes injection impossible). */
function validBranchName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const name = raw.trim();
    if (!name || name.length > 200) return null;
    if (name === "HEAD" || name.endsWith(".lock") || name.startsWith(".")) return null;
    if (name.includes("..") || name.endsWith("/") || name.endsWith(".")) return null;
    if (name.includes("@{") || name.includes("//")) return null;
    // Allow ASCII letters, digits, and . _ / - inside components.
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) return null;
    return name;
}

/** Run a git command, capturing stdout/stderr + exit code. */
function runGit(
    args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn("git", args, {
            cwd: getScriptsRoot(),
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
    let body: BranchBody;
    try {
        body = (await request.json()) as BranchBody;
    } catch {
        return NextResponse.json(
            {ok: false, error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const action = typeof body.action === "string" ? body.action : "";

    // ── list ─────────────────────────────────────────────────────────
    if (action === "list") {
        const [branchRes, currentRes] = await Promise.all([
            runGit(["branch", "--format=%(refname:short)%00%(objectname:short)"]),
            runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
        ]);
        if (branchRes.code !== 0 || currentRes.code !== 0) {
            return NextResponse.json({
                ok: false,
                isRepo: false,
                branches: [],
                current: null,
                hint: "Initialize a git repo to manage branches.",
            });
        }
        const current =
            currentRes.stdout.trim() === "HEAD"
                ? null // detached HEAD
                : currentRes.stdout.trim();
        const branches = branchRes.stdout
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
                const [name, shortSha = ""] = l.split("\0");
                return {name: name ?? "", shortSha};
            })
            .filter((b) => b.name);
        return NextResponse.json({ok: true, isRepo: true, branches, current});
    }

    // ── switch ───────────────────────────────────────────────────────
    if (action === "switch") {
        const name = validBranchName(body.name);
        if (!name) {
            return NextResponse.json(
                {ok: false, error: "That is not a valid branch name."},
                {status: 400}
            );
        }
        const res = await runGit(["switch", name]);
        if (res.code !== 0) {
            return NextResponse.json(
                {ok: false, error: res.stderr.trim() || `git switch exited ${res.code}.`},
                {status: 400}
            );
        }
        return NextResponse.json({
            ok: true,
            message: `Switched to branch “${name}”.`,
            output: res.stdout.trim(),
        });
    }

    // ── create (+ switch) ────────────────────────────────────────────
    if (action === "create") {
        const name = validBranchName(body.name);
        if (!name) {
            return NextResponse.json(
                {ok: false, error: "That is not a valid branch name."},
                {status: 400}
            );
        }
        const base = validBranchName(body.base);
        const args = ["switch", "-c", name];
        if (base) args.push(base);
        const res = await runGit(args);
        if (res.code !== 0) {
            return NextResponse.json(
                {ok: false, error: res.stderr.trim() || `git switch -c exited ${res.code}.`},
                {status: 400}
            );
        }
        return NextResponse.json({
            ok: true,
            message: `Created and switched to branch “${name}”.`,
            output: res.stdout.trim(),
        });
    }

    // ── delete (git branch -d — safe delete, asks nothing silently) ──
    if (action === "delete") {
        const name = validBranchName(body.name);
        if (!name) {
            return NextResponse.json(
                {ok: false, error: "That is not a valid branch name."},
                {status: 400}
            );
        }
        // Double-guard the checked-out branch: the picker hides the trash
        // affordance for it, but a stale list (branch switched elsewhere
        // since the popover loaded) could still send it. git refuses too
        // ("cannot delete branch 'x' used by worktree at …", exit 1) — the
        // pre-check just says it plainly.
        const cur = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
        if (cur.code === 0 && cur.stdout.trim() === name) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `Cannot delete the current branch “${name}” — switch to another branch first.`,
                },
                {status: 400}
            );
        }
        const res = await runGit(["branch", "-d", name]);
        if (res.code !== 0) {
            const err = (res.stderr || res.stdout).trim();
            // The unmerged case is EXPECTED user friction, not a failure to
            // explain: keep git's own wording (it names the branch and
            // suggests the force command) and add where that force lives —
            // this route deliberately never passes -D.
            const unmerged = /not fully merged/i.test(err);
            return NextResponse.json(
                {
                    ok: false,
                    error: unmerged
                        ? `${err} — the branch has commits no other branch contains. Run “git branch -D ${name}” in a terminal if you really want to force-delete it.`
                        : err || `git branch -d exited ${res.code}.`,
                },
                {status: 400}
            );
        }
        return NextResponse.json({
            ok: true,
            message: `Deleted branch “${name}”.`,
        });
    }

    return NextResponse.json(
        {ok: false, error: "Unknown action. Use list | switch | create | delete."},
        {status: 400}
    );
}
