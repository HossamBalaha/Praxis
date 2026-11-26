import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import {resolveScriptPath} from "@/lib/scripts";
import {parseGitBlamePorcelain} from "@/lib/git-blame";

/**
 * POST /api/git-blame — per-file blame for the EDITOR's inline blame
 * gutter (F21).
 *
 * The Git Diff panel already has a blame mode, but it goes through
 * /api/git-command's `blame` action, which speaks repo-root-relative
 * PATHS — the currency of the diff panel, not of the editor. The editor
 * holds (folderSlug, fileSlug), and its gutter wants a single cheap
 * round-trip plus a hard line cap so a monster file can't flood the
 * client. This route serves exactly that:
 *
 *   { folder: string; file: string }   // slugs, like /api/lint & friends
 *     → { ok: true, lines: BlameWireLine[], truncated?: true }
 *
 * where BlameWireLine = { commit, author, authorTime, summary, line }.
 *
 * WHY NOT REUSE /api/git-command: its `blame` action needs the caller
 * to first `resolveActive` folder+file → relPath (TWO round-trips per
 * file, no cap, and no move/copy detection). The porcelain PARSER is
 * shared — both routes parse through the tested
 * parseGitBlamePorcelain() in lib/git-blame.ts.
 *
 * COMMAND: `git blame --line-porcelain -w -M -C -- <rel>` run with
 * cwd = the repo root (resolved via rev-parse from the FILE's own
 * directory, so a folder that is its own repo inside the scripts root
 * is found). Flags:
 *   --line-porcelain  full header block per line — the most robust
 *                     machine format (the parser also handles the
 *                     incremental --porcelain reuse, but this is the
 *                     unambiguous one);
 *   -w                ignore whitespace churn (a re-indent doesn't
 *                     rewrite blame);
 *   -M -C             detect moved/copied lines so a big paste keeps
 *                     pointing at the code's real origin.
 *
 * CAP: files above MAX_BLAME_LINES (5,000) are blamed only through
 * `-L 1,<cap>` — git never walks the tail, the response stays small,
 * and `truncated: true` tells the gutter the file is longer than the
 * data (the gutter's own stale-line clamp already ignores positions
 * past the rendered buffer).
 *
 * SECURITY (mirrors the sibling git routes — git-status / git-log /
 * git-command):
 * - argv-array spawn, stdio pipes, NO shell — a crafted slug can never
 *   become a second command;
 * - folder/file slugs go through resolveScriptPath() (the shared
 *   helper every route uses): deslugged, rebuilt under the scripts
 *   root, and verified with fs.stat to exist and be a file — traversal
 *   via crafted slugs is impossible;
 * - the blame pathspec is repo-root-relative and `--`-terminated;
 * - read-only command → no index-write serialization needed.
 *
 * Not-a-repo / untracked files are NOT errors: the route answers
 * ok:false with a friendly message (HTTP 200) and the client gutter
 * simply renders nothing — same contract as /api/git-status.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 15_000;
/** Hard cap on blamed lines — mirrors the editor's own render guard. */
const MAX_BLAME_LINES = 5_000;

/* ── spawn helper (same shape as the sibling git routes) ─────────── */

interface GitRunResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

function runGit(
    args: string[],
    cwd: string
): Promise<GitRunResult> {
    return new Promise((resolve) => {
        const child = spawn("git", args, {
            cwd,
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
    });
}

/* ── wire shape ──────────────────────────────────────────────────── */

export interface BlameWireLine {
    /** Full 40-hex sha of the commit the line came from. */
    commit: string;
    /** Author display name. */
    author: string;
    /** Author time as unix seconds. */
    authorTime: number;
    /** Commit subject (first line of the message). */
    summary: string;
    /** 1-indexed line number in the FINAL (working-tree) file. */
    line: number;
}

interface BlameBody {
    folder?: unknown;
    file?: unknown;
}

/** Count the file's lines from raw bytes (native indexOf scan — no
 *  giant split()). A missing final newline still counts its last line. */
function countLines(buf: Buffer): number {
    if (buf.length === 0) return 0;
    let nl = 0;
    let idx = buf.indexOf(0x0a);
    while (idx !== -1) {
        nl++;
        idx = buf.indexOf(0x0a, idx + 1);
    }
    return buf[buf.length - 1] === 0x0a ? nl : nl + 1;
}

export async function POST(request: NextRequest) {
    let body: BlameBody;
    try {
        body = (await request.json()) as BlameBody;
    } catch {
        return NextResponse.json({ok: false, error: "Invalid JSON body."}, {status: 400});
    }
    const folder = typeof body.folder === "string" ? body.folder : "";
    const file = typeof body.file === "string" ? body.file : "";
    if (!folder || !file) {
        return NextResponse.json(
            {ok: false, error: "Both 'folder' and 'file' are required."},
            {status: 400}
        );
    }

    // Shared slug → path resolver (same helper / containment guard as
    // /api/lint, /api/run, /api/git-command resolveActive …). anyKind:
    // blame is about reading code — .py mostly, but a Markdown report or
    // a data file is equally blamable.
    const resolved = await resolveScriptPath(folder, file, {anyKind: true});
    if (!resolved) {
        return NextResponse.json({ok: false, error: "File not found."}, {status: 404});
    }

    // Repo root — resolved from the FILE's own directory so both layouts
    // work: scripts root inside a repo, or a project folder that IS a
    // repo nested inside a non-repo scripts root.
    const rootRes = await runGit(
        ["rev-parse", "--show-toplevel"],
        path.dirname(resolved.absPath)
    );
    if (rootRes.code !== 0) {
        return NextResponse.json({
            ok: false,
            isRepo: false,
            error: "Not inside a git repository.",
        });
    }
    const root = rootRes.stdout.trim();
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

    // Line count → decide the -L cap before spawning blame.
    let fileLines = 0;
    try {
        const buf = await fs.readFile(resolved.absPath);
        fileLines = countLines(buf);
    } catch {
        /* unreadable (shouldn't happen — stat'd above) → blame will say so */
    }
    if (fileLines === 0) {
        // Empty file: git blame prints nothing anyway — answer directly.
        return NextResponse.json({ok: true, lines: []});
    }

    const truncated = fileLines > MAX_BLAME_LINES;
    const args = ["blame", "--line-porcelain", "-w", "-M", "-C"];
    if (truncated) {
        // Blame only the first MAX_BLAME_LINES lines — git never walks the
        // tail of a monster file.
        args.push("-L", `1,${MAX_BLAME_LINES}`);
    }
    args.push("--", rel);

    const res = await runGit(args, root);
    if (res.code === 128) {
        return NextResponse.json({ok: false, error: "File is not tracked by git yet."});
    }
    if (res.code !== 0) {
        return NextResponse.json({
            ok: false,
            error: res.stderr.trim() || `git blame exited ${res.code}.`,
        });
    }

    // Shared, unit-tested porcelain parser (lib/git-blame.ts) — tolerant
    // of malformed output (returns the lines collected so far).
    const parsed = parseGitBlamePorcelain(res.stdout).slice(0, MAX_BLAME_LINES);
    const lines: BlameWireLine[] = parsed.map((l) => ({
        commit: l.sha,
        author: l.author,
        authorTime: l.authorTime,
        summary: l.summary,
        line: l.finalLine,
    }));

    return NextResponse.json(
        truncated ? {ok: true, lines, truncated: true} : {ok: true, lines}
    );
}
