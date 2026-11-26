import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {getScriptsRoot} from "@/lib/scripts";

/**
 * GET /api/git-log            → the commit list (newest first)
 * GET /api/git-log?sha=<sha>  → one commit's detail: changed files
 *                               (with status letters) + the full
 *                               unified patch.
 *
 * the commit-history browser ("Git Log" dialog).
 *
 * The list uses `git log` with a machine-readable pretty format —
 * fields separated by \x1f (unit separator), records by \x1e (record
 * separator) — so messages containing any printable character parse
 * without ambiguity. We cap the list at 300 commits and the patch at
 * 256 KB so a huge repo can't flood the dialog.
 *
 * Not-a-repo / no-commits-yet both return ok:false with a hint — the
 * dialog shows a friendly empty state instead of an error.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 15_000;
const MAX_COMMITS = 300;
const MAX_PATCH_CHARS = 256_000;

interface CommitSummary {
    sha: string;
    shortSha: string;
    author: string;
    authorEmail: string;
    /** Unix seconds. */
    timestamp: number;
    subject: string;
    /** parent shas (%P) — the Git Graph view computes
     *  branch lanes from these client-side. */
    parents: string[];
    /** decoration string (%D) — "HEAD -> main, origin/main"
     *  style labels for the graph's branch badges. Empty on non-heads. */
    refs: string;
}

interface CommitDetail {
    sha: string;
    shortSha: string;
    author: string;
    authorEmail: string;
    committer: string;
    /** Unix seconds. */
    timestamp: number;
    /** Full commit message (subject + body). */
    message: string;
    parents: string[];
    files: Array<{ path: string; status: string }>;
    patch: string;
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

/** Validate a sha-ish argument: 4–64 hex chars only. */
function safeSha(raw: string | null): string | null {
    if (!raw || !/^[0-9a-fA-F]{4,64}$/.test(raw)) return null;
    return raw;
}

export async function GET(request: NextRequest) {
    const {searchParams} = new URL(request.url);
    const shaParam = safeSha(searchParams.get("sha"));

    // ── Detail mode: one commit ──────────────────────────────────────
    if (shaParam) {
        // `git show` gives the message header AND the name-status list in
        // one call (no patch), then a second call fetches the patch alone.
        // The pretty record is terminated with \x1e AFTER the full commit
        // message (%B spans multiple lines, so a plain first-\n split
        // would truncate the header); the name-status lines follow the
        // record separator.
        const [info, patchRes] = await Promise.all([
            runGit([
                "show",
                "--no-color",
                "--name-status",
                "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%cn%x1f%at%x1f%P%x1f%B%x1e",
                shaParam,
            ]),
            runGit([
                "show",
                "--no-color",
                "--format=", // patch only
                "--unified=3",
                shaParam,
            ]),
        ]);

        if (info.code !== 0) {
            return NextResponse.json(
                {ok: false, error: info.stderr.trim() || "Commit not found."},
                {status: 404}
            );
        }

        const sep = info.stdout.indexOf("\x1e");
        const record = sep === -1 ? info.stdout : info.stdout.slice(0, sep);
        const fileLines = (sep === -1 ? "" : info.stdout.slice(sep + 1))
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
        const fields = record.split("\x1f");
        if (fields.length < 8) {
            return NextResponse.json(
                {ok: false, error: "Unexpected git output."},
                {status: 500}
            );
        }

        // name-status lines: "M\tpath" (status possibly with score, e.g.
        // "R100\told\tnew" for renames).
        const files: Array<{ path: string; status: string }> = [];
        for (const line of fileLines) {
            const m = line.match(/^([A-Z])(\d*)\t(.*)$/);
            if (!m) continue;
            const status = m[1];
            const rest = m[3];
            let path = rest;
            if (status === "R" || status === "C") {
                // "old\tnew" — show the NEW path, note the old one in parens.
                const tab = rest.indexOf("\t");
                if (tab !== -1) {
                    path = `${rest.slice(tab + 1)} (from ${rest.slice(0, tab)})`;
                }
            }
            files.push({path, status});
        }

        let patch = patchRes.code === 0 ? patchRes.stdout : "";
        let truncated = false;
        if (patch.length > MAX_PATCH_CHARS) {
            patch = patch.slice(0, MAX_PATCH_CHARS);
            truncated = true;
        }

        const detail: CommitDetail = {
            sha: fields[0],
            shortSha: fields[1],
            author: fields[2],
            authorEmail: fields[3],
            committer: fields[4],
            timestamp: Number(fields[5]) || 0,
            // fields[6] = parents, fields[7] = full message (%B, may span
            // lines — it was isolated by the \x1e record terminator).
            message: (fields[7] ?? fields[6] ?? "").trim(),
            parents: (fields[6] ?? "").split(" ").filter(Boolean),
            files,
            patch,
        };
        return NextResponse.json({ok: true, detail, patchTruncated: truncated});
    }

    // ── List mode ────────────────────────────────────────────────────
    const res = await runGit([
        "log",
        "-n",
        String(MAX_COMMITS),
        "--no-color",
        "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%P%x1f%D%x1e",
    ]);

    if (res.code !== 0) {
        // Not a repo, or a repo with zero commits (git log exits 128 with
        // "your current branch does not have any commits yet").
        const hint = /does not have any commits yet/i.test(res.stderr)
            ? "This repository has no commits yet."
            : "Initialize a git repo and make a commit to browse its history.";
        return NextResponse.json({ok: false, isRepo: false, commits: [], hint});
    }

    const commits: CommitSummary[] = res.stdout
        .split("\x1e")
        .map((rec) => rec.replace(/^\n/, "").trim())
        .filter(Boolean)
        .map((rec) => {
            const [sha, shortSha, author, authorEmail, ts, subject, parents, refs] =
                rec.split("\x1f");
            return {
                sha: sha ?? "",
                shortSha: shortSha ?? "",
                author: author ?? "",
                authorEmail: authorEmail ?? "",
                timestamp: Number(ts) || 0,
                subject: subject ?? "",
                parents: (parents ?? "").split(" ").filter(Boolean),
                refs: refs ?? "",
            };
        })
        .filter((c) => c.sha);

    return NextResponse.json({ok: true, isRepo: true, commits});
}
