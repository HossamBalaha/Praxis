import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import {getScriptsRoot, resolveScriptPath} from "@/lib/scripts";
import {parseGitBlamePorcelain} from "@/lib/git-blame";

/**
 * POST /api/git-command — the Section 6 "missing git verbs" route.
 *
 * The existing routes cover status / diff / commit / branch switch /
 * log; this one adds the synchronization + history-rewriting commands
 * the panels now expose, each behind a strict action allow-list:
 *
 * { action: "push" } git push
 * { action: "pull", rebase? } git pull [--rebase]
 * { action: "fetch" } git fetch --all --prune
 * { action: "stashPush", message? } git stash push [-m msg]
 * { action: "stashPop", index? } git stash pop [index]
 * { action: "stashList" } git stash list — raw lines + structured entries
 * { action: "stashShow", index } git stash show -p stash@{index} → patch text
 * { action: "stashApply", index? } git stash apply [stash@{index}]
 * { action: "stashDrop", index? } git stash drop [index]
 * { action: "merge", branch } git merge --no-edit <branch>
 * { action: "rebase", branch } git rebase <branch>
 * { action: "abort", kind } git merge --abort | git rebase --abort
 * { action: "clone", url, dir } git clone <url> <dir> (into the scripts root)
 * { action: "revert", sha } git revert --no-edit <sha>
 * { action: "stage", files: string[] } git add --:/<paths>
 * { action: "unstage", files: string[] } git restore --staged --:/<paths>
 *    (fallback chain: git reset HEAD -- → git rm --cached, see the case)
 * { action: "discard", files: string[] } git checkout --:/<paths> (DESTRUCTIVE — the UI confirms first)
 * { action: "stageHunk", path, patch } git apply --cached - (patch on stdin)
 * { action: "unstageHunk", path, patch } git apply -R --cached - (patch on stdin)
 * { action: "blame", path } git blame --porcelain -w -- <path>
 * { action: "resolveActive", folder, file } → repo-root-relative path
 *
 * SECURITY (mirrors the sibling git routes):
 * - every spawn is argv-array based, stdio pipes, NO shell — a
 * crafted value can never become a second command;
 * - branch names / shas / URLs / dir names / paths are validated
 * BEFORE they ever reach argv (friendly errors instead of git's
 * cryptic ones);
 * - file paths use the same `:/<path>` pathspec prefix as
 * /api/git-commit: git resolves it against the REPO ROOT and
 * refuses to escape it;
 * - `stageHunk` runs `git apply --cached` with cwd = the repo root
 * (resolved via rev-parse) so the patch's a/ b/ paths land where
 * git expects them, and the patch goes to the child's stdin
 * (never a temp file, never an argv element); `unstageHunk` is its
 * exact mirror — `git apply --reverse --cached`, same stdin
 * discipline, so the reverse hunk lands on the index only;
 * - mutating commands are serialized through one in-process promise
 * chain so two rapid clicks can't interleave index writes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 120_000; // push/pull/clone/rebase can all hit the network
const MAX_OUTPUT_CHARS = 60_000;
/** Patch-size cap for stashShow — same ceiling /api/git-log uses for
 *  `git show` patches, so a giant stash can't flood the dialog. */
const MAX_PATCH_CHARS = 256_000;

/* ================================================================== */
/*  Shared spawn helper                                                */

/* ================================================================== */

interface GitRunResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

/** Run one git command (argv array, optional stdin payload),
 *  capturing stdout/stderr with the sibling routes' timeout kill. */
function runGit(
    args: string[],
    opts: { cwd?: string; stdin?: string } = {}
): Promise<GitRunResult> {
    const cwd = opts.cwd ?? getScriptsRoot();
    return new Promise((resolve) => {
        const child = spawn("git", args, {
            cwd,
            env: process.env,
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch {
                /* already dead */
            }
        }, TIMEOUT_MS);
        child.on("error", () => {
            clearTimeout(timer);
            resolve({code: null, stdout: "", stderr: "spawn error"});
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({code, stdout, stderr});
        });
        if (opts.stdin !== undefined) {
            child.stdin.on("error", () => {
                /* EPIPE — git exited early (bad patch); close handler resolves */
            });
            child.stdin.end(opts.stdin, "utf-8");
        } else {
            child.stdin.end();
        }
    });
}

/* ================================================================== */
/*  In-process serialization of mutating commands                       */
/* ================================================================== */

// Two index-writing commands that overlap (a stash pop racing a
// stageHunk) corrupt the index with .lock contention. A module-level
// promise chain (stored on globalThis so Turbopack HMR
// re-instantiations don't drop it) runs every mutation through one
// queue.
const g = globalThis as unknown as { __gitCommandChain?: Promise<unknown> };
if (!g.__gitCommandChain) g.__gitCommandChain = Promise.resolve();

function serialize<T>(job: () => Promise<T>): Promise<T> {
    const run = g.__gitCommandChain!.then(job, job);
    g.__gitCommandChain = run.catch(() => undefined);
    return run;
}

/* ================================================================== */
/*  Input validators (friendly errors — argv-array spawning is the    */
/*  actual injection barrier)                                         */

/* ================================================================== */

/** Conservative branch/ref name (same rules as /api/git-branch). */
function validRefName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const name = raw.trim();
    if (!name || name.length > 200) return null;
    if (name === "HEAD" || name.endsWith(".lock") || name.startsWith(".")) return null;
    if (name.includes("..") || name.endsWith("/") || name.endsWith(".")) return null;
    if (name.includes("@{") || name.includes("//")) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) return null;
    return name;
}

/** 4–64 hex chars (a commit sha prefix, like /api/git-log). */
function safeSha(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const sha = raw.trim().toLowerCase();
    if (!/^[0-9a-f]{4,64}$/.test(sha)) return null;
    return sha;
}

/** A git clone URL: https?/git/ssh schemes or the scp-style
 *  git@host:path form. No spaces, no shell metacharacters anywhere. */
function safeCloneUrl(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const url = raw.trim();
    if (!url || url.length > 2048) return null;
    if (/[\s`$;&|<>]/.test(url)) return null;
    if (!/^(https?:\/\/|git:\/\/|ssh:\/\/|git@[A-Za-z0-9._-]+:)/.test(url)) return null;
    if (url.includes("..")) return null;
    return url;
}

/** A destination DIRECTORY name for clone — one plain path segment,
 *  never a flag (leading dash rejected), never a traversal. */
function safeCloneDir(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const dir = raw.trim();
    if (!dir || dir.length > 100) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dir)) return null;
    return dir;
}

/** Repo-relative file path (no absolute, no `..`) — same contract as
 *  /api/git-commit's safeRelPath; converted to `:/<path>` pathspecs
 *  that git resolves against the repo root. */
function safeRelPath(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    if (!raw || path.isAbsolute(raw)) return null;
    if (raw.split("/").includes("..") || raw.split(path.sep).includes("..")) return null;
    return raw.split(path.sep).join("/");
}

/** A 0-based stash number (stash@{N}). Null when absent/invalid —
 *  pop/drop/apply then act on the latest stash, matching git's own
 *  default; stashShow requires one but the client always sends it. */
function stashIndex(raw: unknown): number | null {
    const idx = typeof raw === "number" ? Math.trunc(raw) : NaN;
    return Number.isInteger(idx) && idx >= 0 && idx <= 999 ? idx : null;
}

/** The repo root (for commands that need repo-anchored cwd). */
async function repoRoot(): Promise<string | null> {
    const res = await runGit(["rev-parse", "--show-toplevel"]);
    if (res.code !== 0) return null;
    return res.stdout.trim() || null;
}

/* ================================================================== */
/*  Route                                                              */

/* ================================================================== */

interface CommandBody {
    action?: unknown;
    branch?: unknown;
    rebase?: unknown;
    message?: unknown;
    index?: unknown;
    kind?: unknown;
    url?: unknown;
    dir?: unknown;
    sha?: unknown;
    files?: unknown;
    path?: unknown;
    patch?: unknown;
    folder?: unknown;
    file?: unknown;
}

/** One structured `git stash list` row — parsed from the
 *  --format=%gd\x1f%gs\x1f%ct\x1f%h line the route itself requests. */
interface StashEntry {
    /** "stash@{0}" — the reflog selector, exactly as git prints it. */
    ref: string;
    /** 0-based stash number (parsed out of the braces). */
    index: number;
    /** Reflog subject — "On main: my message" / "WIP on main: …". */
    message: string;
    /** Unix seconds of the stash commit's date. */
    timestamp: number;
    /** Short sha of the stash commit. */
    shortSha: string;
}

export async function POST(request: NextRequest) {
    let body: CommandBody;
    try {
        body = (await request.json()) as CommandBody;
    } catch {
        return NextResponse.json({ok: false, error: "Invalid JSON body."}, {status: 400});
    }
    const action = typeof body.action === "string" ? body.action : "";

    /* ── read-only commands (no index writes — no serialization) ──── */

    if (action === "stashList") {
        // Two list calls in parallel: the DEFAULT format (raw lines — the
        // diff panel's toolbar toast still prints those verbatim, so its
        // shape must not change) and a structured one (--format with unit
        // separators) the stash dialog renders: ref · message · unix date
        // · short sha per row. Ancient git without --format on stash list
        // degrades gracefully — `stashes` keeps working, `entries` comes
        // back empty and the dialog falls back to its hint.
        const [raw, structured] = await Promise.all([
            runGit(["stash", "list"]),
            runGit(["stash", "list", "--format=%gd%x1f%gs%x1f%ct%x1f%h"]),
        ]);
        if (raw.code !== 0) {
            return NextResponse.json({
                ok: false,
                isRepo: false,
                error: raw.stderr.trim() || "Could not list stashes.",
            });
        }
        const stashes = raw.stdout.split("\n").filter(Boolean).slice(0, 50);
        const entries: StashEntry[] =
            structured.code === 0
                ? structured.stdout
                    .split("\n")
                    .filter(Boolean)
                    .slice(0, 50)
                    .map((line) => {
                        const [ref, message, ts, shortSha] = line.split("\x1f");
                        const m = (ref ?? "").match(/stash@\{(\d+)\}/);
                        return {
                            ref: ref ?? "",
                            index: m ? Number(m[1]) : 0,
                            message: message ?? "",
                            timestamp: Number(ts) || 0,
                            shortSha: shortSha ?? "",
                        };
                    })
                    .filter((e) => e.ref)
                : [];
        return NextResponse.json({ok: true, stashes, entries});
    }

    if (action === "stashShow") {
        // Read-only: the stash's patch (`git stash show -p` = the diff the
        // stash would re-apply: base tree → stashed tree). Capped like
        // /api/git-log's patch; binary stashes are flagged the same way
        // /api/git-diff-content flags binary diffs. A bad/out-of-range
        // index surfaces git's own "log for 'stash' only has N entries"
        // stderr verbatim so the toast explains exactly what's missing.
        const idx = stashIndex(body.index) ?? 0;
        const res = await runGit(["stash", "show", "-p", `stash@{${idx}}`]);
        if (res.code !== 0) {
            return NextResponse.json({
                ok: false,
                error: res.stderr.trim() || `git stash show exited ${res.code}.`,
            });
        }
        let patch = res.stdout;
        let truncated = false;
        if (patch.length > MAX_PATCH_CHARS) {
            patch = patch.slice(0, MAX_PATCH_CHARS);
            truncated = true;
        }
        return NextResponse.json({
            ok: true,
            patch,
            truncated,
            binary: /Binary files .* differ/.test(patch),
        });
    }

    if (action === "resolveActive") {
        // folder+file slugs → repo-root-relative path (the panel's
        // active-file focus uses git-status-shaped paths). anyKind: the
        // focus file may be any type — that is the whole point of 1a.
        const resolved = await resolveScriptPath(String(body.folder ?? ""), String(body.file ?? ""), {
            anyKind: true,
        });
        if (!resolved) {
            return NextResponse.json({ok: false, error: "File not found."}, {status: 404});
        }
        const root = await repoRoot();
        if (!root) {
            return NextResponse.json({
                ok: false,
                isRepo: false,
                error: "Not inside a git repository.",
            });
        }
        const rel = path.relative(root, resolved.absPath);
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
            return NextResponse.json(
                {ok: false, error: "File is outside the repository."},
                {status: 400}
            );
        }
        return NextResponse.json({ok: true, relPath: rel.split(path.sep).join("/")});
    }

    if (action === "blame") {
        const rel = safeRelPath(body.path);
        if (!rel) {
            return NextResponse.json({ok: false, error: "Invalid 'path'."}, {status: 400});
        }
        const root = await repoRoot();
        if (!root) {
            return NextResponse.json({ok: false, isRepo: false, error: "Not inside a git repository."});
        }
        // -w ignores whitespace churn so a re-indent doesn't rewrite blame.
        const res = await runGit(["blame", "--porcelain", "-w", "--", rel], {cwd: root});
        if (res.code === 128) {
            return NextResponse.json({ok: false, error: "File is not tracked by git yet."});
        }
        if (res.code !== 0) {
            return NextResponse.json({
                ok: false,
                error: res.stderr.trim() || `git blame exited ${res.code}.`,
            });
        }
        const lines = parseGitBlamePorcelain(res.stdout);
        return NextResponse.json({ok: true, lines});
    }

    /* ── mutating commands — serialized through the chain ─────────── */

    const run = async (): Promise<NextResponse> => {
        const combined = (r: GitRunResult) => (r.stdout + r.stderr).trim().slice(0, MAX_OUTPUT_CHARS);
        switch (action) {
            /* ── synchronization ─────────────────────────────────────── */
            case "push": {
                // Plain `git push` — the branch's upstream is what the picker
                // set up; an unset upstream surfaces git's own "has no
                // upstream" hint verbatim for the toast.
                const res = await runGit(["push"]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || res.stdout.trim() || `git push exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }
            case "pull": {
                const args = ["pull"];
                if (body.rebase === true) args.push("--rebase");
                const res = await runGit(args);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || res.stdout.trim() || `git pull exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }
            case "fetch": {
                const res = await runGit(["fetch", "--all", "--prune"]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git fetch exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }

            /* ── stash ───────────────────────────────────────────────── */
            case "stashPush": {
                const args = ["stash", "push"];
                const msg = typeof body.message === "string" ? body.message.trim().slice(0, 200) : "";
                if (msg) args.push("-m", msg);
                const res = await runGit(args);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git stash push exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }
            case "stashPop":
            case "stashDrop": {
                const verb = action === "stashPop" ? "pop" : "drop";
                const args = ["stash", verb];
                const idx = stashIndex(body.index);
                if (idx !== null) args.push(`stash@{${idx}}`);
                const res = await runGit(args);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git stash ${verb} exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }
            case "stashApply": {
                // Apply WITHOUT dropping (pop = apply + drop). Conflicts surface
                // git's own stderr verbatim — the toast tells the user exactly
                // which files collided.
                const args = ["stash", "apply"];
                const idx = stashIndex(body.index);
                if (idx !== null) args.push(`stash@{${idx}}`);
                const res = await runGit(args);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git stash apply exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }

            /* ── merge / rebase ──────────────────────────────────────── */
            case "merge": {
                const branch = validRefName(body.branch);
                if (!branch) {
                    return NextResponse.json({ok: false, error: "Invalid branch name."}, {status: 400});
                }
                const res = await runGit(["merge", "--no-edit", branch]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        conflict: /conflict/i.test(res.stdout + res.stderr),
                        error: res.stderr.trim() || res.stdout.trim() || `git merge exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }
            case "rebase": {
                const branch = validRefName(body.branch);
                if (!branch) {
                    return NextResponse.json({ok: false, error: "Invalid branch name."}, {status: 400});
                }
                const res = await runGit(["rebase", branch]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        conflict: true, // any rebase stop is an "abort/continue" state
                        error: res.stderr.trim() || res.stdout.trim() || `git rebase exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }
            case "abort": {
                const kind = body.kind === "rebase" ? "rebase" : "merge";
                const res = await runGit([kind, "--abort"]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git ${kind} --abort exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: "Aborted."});
            }

            /* ── clone / revert ──────────────────────────────────────── */
            case "clone": {
                const url = safeCloneUrl(body.url);
                const dir = safeCloneDir(body.dir);
                if (!url || !dir) {
                    return NextResponse.json(
                        {
                            ok: false,
                            error:
                                "A valid repository URL (https://, git://, ssh://, or git@host:…) and a destination folder name are required.",
                        },
                        {status: 400}
                    );
                }
                const scriptsRoot = getScriptsRoot();
                // turbopackIgnore: the clone destination is a RUNTIME value —
                // scriptsRoot is per-request active-project state and `dir` is
                // user input. Tracing it at build time would sweep the whole
                // repo into the server output.
                const dest = path.join(/* turbopackIgnore: true */ scriptsRoot, dir);
                const rel = path.relative(scriptsRoot, dest);
                if (rel.startsWith("..") || path.isAbsolute(rel)) {
                    return NextResponse.json({ok: false, error: "Invalid destination."}, {status: 400});
                }
                try {
                    // turbopackIgnore: same runtime-only rule as the join above —
                    // existence probe for a user-chosen folder, not a build asset.
                    await fs.stat(/* turbopackIgnore: true */ dest);
                    return NextResponse.json(
                        {ok: false, error: `Folder "${dir}" already exists.`},
                        {status: 400}
                    );
                } catch {
                    /* does not exist — good */
                }
                // cwd = the scripts root so `git clone <url> <dir>` creates
                // the project folder exactly where the explorer lists it.
                const res = await runGit(["clone", url, dir], {cwd: scriptsRoot});
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git clone exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, dir, output: combined(res)});
            }
            case "revert": {
                const sha = safeSha(body.sha);
                if (!sha) {
                    return NextResponse.json({ok: false, error: "Invalid commit sha."}, {status: 400});
                }
                const res = await runGit(["revert", "--no-edit", sha]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        conflict: true,
                        error: res.stderr.trim() || res.stdout.trim() || `git revert exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, output: combined(res)});
            }

            /* ── staging / discard (per-file + per-hunk) ─────────────── */
            case "stage": {
                const filesArr = Array.isArray(body.files) ? body.files : [];
                if (filesArr.length === 0) {
                    return NextResponse.json({ok: false, error: "No files given."}, {status: 400});
                }
                const safePaths: string[] = [];
                for (const f of filesArr) {
                    const safe = safeRelPath(f);
                    if (!safe) {
                        return NextResponse.json(
                            {ok: false, error: `Invalid file path: ${String(f)}`},
                            {status: 400}
                        );
                    }
                    safePaths.push(safe);
                }
                const pathspecs = safePaths.map((p) => `:/${p}`);
                const res = await runGit(["add", "--", ...pathspecs]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git add exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, staged: safePaths});
            }
            case "discard": {
                const filesArr = Array.isArray(body.files) ? body.files : [];
                if (filesArr.length === 0) {
                    return NextResponse.json({ok: false, error: "No files given."}, {status: 400});
                }
                const safePaths: string[] = [];
                for (const f of filesArr) {
                    const safe = safeRelPath(f);
                    if (!safe) {
                        return NextResponse.json(
                            {ok: false, error: `Invalid file path: ${String(f)}`},
                            {status: 400}
                        );
                    }
                    safePaths.push(safe);
                }
                const pathspecs = safePaths.map((p) => `:/${p}`);
                const res = await runGit(["checkout", "--", ...pathspecs]);
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git checkout exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, discarded: safePaths});
            }
            case "stageHunk": {
                const rel = safeRelPath(body.path);
                const patch = typeof body.patch === "string" ? body.patch : "";
                if (!rel || !patch.trim()) {
                    return NextResponse.json(
                        {ok: false, error: "A 'path' and a 'patch' are required."},
                        {status: 400}
                    );
                }
                const root = await repoRoot();
                if (!root) {
                    return NextResponse.json({ok: false, error: "Not inside a git repository."});
                }
                // `git apply --cached` applies the hunk to the INDEX; cwd is
                // the repo root so the a/ b/ prefixes in the patch resolve
                // against the repository, exactly like the source diff did.
                // (No --recount: the client slices the hunk EXACTLY from the
                // diff git itself printed, and recounting makes git re-count
                // the body — verified against a scratch repo, a stray trailing
                // blank line in the slice then fails the apply.)
                const res = await runGit(["apply", "--cached", "-"], {
                    cwd: root,
                    stdin: patch,
                });
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git apply exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, staged: rel});
            }
            case "unstageHunk": {
                const rel = safeRelPath(body.path);
                const patch = typeof body.patch === "string" ? body.patch : "";
                if (!rel || !patch.trim()) {
                    return NextResponse.json(
                        {ok: false, error: "A 'path' and a 'patch' are required."},
                        {status: 400}
                    );
                }
                const root = await repoRoot();
                if (!root) {
                    return NextResponse.json({ok: false, error: "Not inside a git repository."});
                }
                // The exact mirror of stageHunk: `git apply --reverse --cached`
                // — the patch was sliced from `git diff --cached` (HEAD →
                // index), so its NEW side IS the current index content;
                // reverse-applying to the index lands the HEAD side back
                // there. The working tree is never touched. Same stdin
                // discipline and the same no-recount reasoning as stageHunk.
                const res = await runGit(["apply", "--reverse", "--cached", "-"], {
                    cwd: root,
                    stdin: patch,
                });
                if (res.code !== 0) {
                    return NextResponse.json({
                        ok: false,
                        error: res.stderr.trim() || `git apply --reverse exited ${res.code}.`,
                    });
                }
                return NextResponse.json({ok: true, unstaged: rel});
            }
            case "unstage": {
                const filesArr = Array.isArray(body.files) ? body.files : [];
                if (filesArr.length === 0) {
                    return NextResponse.json({ok: false, error: "No files given."}, {status: 400});
                }
                const safePaths: string[] = [];
                for (const f of filesArr) {
                    const safe = safeRelPath(f);
                    if (!safe) {
                        return NextResponse.json(
                            {ok: false, error: `Invalid file path: ${String(f)}`},
                            {status: 400}
                        );
                    }
                    safePaths.push(safe);
                }
                const pathspecs = safePaths.map((p) => `:/${p}`);
                // Fallback chain, each step verified on scratch repos:
                //  1. `git restore --staged` (git ≥ 2.23) — the modern verb;
                //  2. `git reset HEAD --` — covers ancient git without
                //     `restore`, AND unborn branches (git resolves the unborn
                //     HEAD as the empty tree, so staged entries reset to
                //     untracked instead of erroring);
                //  3. `git rm --cached --ignore-unmatch` — the last resort for
                //     an unborn branch whose reset STILL failed: removing the
                //     index entries is literally the unstage there.
                // `:/` pathspecs throughout so paths resolve against the repo
                // root regardless of the scripts-dir cwd. Only when EVERY step
                // fails do we report (preferring the most specific stderr).
                const restore = await runGit(["restore", "--staged", "--", ...pathspecs]);
                if (restore.code === 0) {
                    return NextResponse.json({ok: true, unstaged: safePaths});
                }
                const reset = await runGit(["reset", "HEAD", "--", ...pathspecs]);
                if (reset.code === 0) {
                    return NextResponse.json({ok: true, unstaged: safePaths});
                }
                const rm = await runGit([
                    "rm",
                    "--cached",
                    "--ignore-unmatch",
                    "--",
                    ...pathspecs,
                ]);
                if (rm.code === 0) {
                    return NextResponse.json({ok: true, unstaged: safePaths});
                }
                return NextResponse.json({
                    ok: false,
                    error:
                        (rm.stderr || reset.stderr || restore.stderr).trim() ||
                        `git restore --staged exited ${restore.code}.`,
                });
            }

            default:
                return NextResponse.json(
                    {
                        ok: false,
                        error:
                            "Unknown action. Use push | pull | fetch | stashPush | stashPop | stashList | stashShow | stashApply | stashDrop | merge | rebase | abort | clone | revert | stage | unstage | discard | stageHunk | unstageHunk | blame | resolveActive.",
                    },
                    {status: 400}
                );
        }
    };

    return serialize(run);
}
