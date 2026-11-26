import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import {getScriptsRoot, resolveScriptPath} from "@/lib/scripts";

/**
 * GET /api/git-diff?folder=<slug>&file=<slug>
 *
 * Runs `git diff HEAD -- <absPath>` (with cwd=getScriptsRoot) and parses
 * the unified diff output to extract the line numbers that have been
 * changed. Used by the editor to render per-line gutter indicators
 * (added / removed / modified) when the user has uncommitted edits.
 *
 * Results are cached in-memory keyed by (absPath, mtimeMs) so switching
 * back to a previously-viewed file doesn't re-spawn git (which takes
 * 2-3s per call when the repo is large).
 *
 * Response: {
 * ok: boolean,
 * isRepo: boolean,
 * diff: string,
 * addedLines: number[],
 * removedLines: number[],
 * modifiedLines: number[],
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

// ─── In-memory git-diff cache (stored on globalThis to survive HMR) ─
// In dev mode, Turbopack recompiles route modules on every HMR update,
// creating a fresh Map each time. Storing on globalThis ensures the
// cache persists across module re-instantiations.
interface DiffCacheEntry {
    mtime: number;
    size: number;
    body: unknown;
}

const DIFF_CACHE_MAX = 50;
const diffCache: Map<string, DiffCacheEntry> = (() => {
    const g = globalThis as unknown as { __diffCache?: Map<string, DiffCacheEntry> };
    if (!g.__diffCache) g.__diffCache = new Map();
    return g.__diffCache;
})();

interface ParsedDiff {
    addedLines: number[];
    removedLines: number[];
    modifiedLines: number[];
}

/**
 * Parse a unified diff and return per-category 1-indexed line numbers.
 *
 * The hunk header `@@ -oldStart,oldLen +newStart,newLen @@` tells us
 * the starting line of the old (HEAD) and new (working tree) versions
 * for the lines that follow.
 *
 * - Lines starting with `-` (and not `---`) are removals in the old
 *   file → recorded against the OLD-file line counter.
 * - Lines starting with `+` (and not `+++`) are additions in the new
 *   file → recorded against the NEW-file line counter.
 * - We pair adjacent `-` and `+` runs as "modifications": a `+` line
 *   that immediately follows a `-` line is treated as a modification
 *   (modifiedLines) rather than a pure addition (addedLines).
 */
function parseUnifiedDiff(diff: string): ParsedDiff {
    const addedLines: number[] = [];
    const removedLines: number[] = [];
    const modifiedLines: number[] = [];

    const lines = diff.split("\n");
    let oldLine = 0;
    let newLine = 0;

    // Track the most recent run of consecutive `-` lines so we can
    // promote the following `+` lines to "modified" rather than "added".
    let pendingRemovalCount = 0;

    for (const line of lines) {
        // Hunk header: @@ -oldStart[,oldLen] +newStart[,newLen] @@
        const hunkMatch = line.match(
            /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
        );
        if (hunkMatch) {
            oldLine = parseInt(hunkMatch[1], 10);
            newLine = parseInt(hunkMatch[3], 10);
            pendingRemovalCount = 0;
            continue;
        }

        // Skip the file header lines ("--- a/..." / "+++ b/...") and the
        // "diff --git" / "index ..." preamble lines.
        if (line.startsWith("--- ") || line.startsWith("+++ ")) {
            pendingRemovalCount = 0;
            continue;
        }

        if (line.startsWith("-")) {
            // Removed line in the old file.
            removedLines.push(oldLine);
            oldLine++;
            pendingRemovalCount++;
        } else if (line.startsWith("+")) {
            // Added line in the new file.
            if (pendingRemovalCount > 0) {
                // This `+` follows one or more `-` → treat as a modification.
                modifiedLines.push(newLine);
                pendingRemovalCount--;
            } else {
                addedLines.push(newLine);
            }
            newLine++;
        } else if (line.startsWith("\\")) {
            // "\ No newline at end of file" — skip, no line counter advance.
            continue;
        } else {
            // Context line (starts with " " or is blank). Advance both.
            // Some diff outputs trim leading whitespace on context lines,
            // so treat any other line as context.
            oldLine++;
            newLine++;
            pendingRemovalCount = 0;
        }
    }

    return {addedLines, removedLines, modifiedLines};
}

/** Run `git diff HEAD -- <absPath>` with cwd=getScriptsRoot. Uses
 * --no-optional-locks to avoid index lock contention + --no-color
 * for faster output (no ANSI escape processing).
 *
 * no shell, ever. With shell:true on Windows Node does
 * not quote argv elements, and absPath contains the user-controlled
 * file name — a file named "x & calc.py" would execute a second
 * command. "git" resolves via PATH without a shell on every
 * platform. */
function runGitDiff(
    absPath: string
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const child = spawn(
            "git",
            ["--no-optional-locks", "diff", "--no-color", "HEAD", "--", absPath],
            {
                cwd: getScriptsRoot(),
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

export async function GET(request: NextRequest) {
    const folder = request.nextUrl.searchParams.get("folder") ?? "";
    const file = request.nextUrl.searchParams.get("file") ?? "";
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Query params 'folder' and 'file' are required."},
            {status: 400}
        );
    }

    const resolved = await resolveScriptPath(folder, file);
    if (!resolved) {
        return NextResponse.json(
            {error: "File not found inside python_scripts/."},
            {status: 404}
        );
    }

    // Use a path relative to getScriptsRoot for cleaner diff output if
    // possible, but the absolute path also works (git resolves it).
    const relPath = path.relative(getScriptsRoot(), resolved.absPath) || resolved.absPath;

    // ── Cache check: return cached result if mtime AND size haven't
    //    changed (mtime-only keys can serve stale results
    //    when a write lands in the same mtime tick).
    let currentMtime: number | undefined;
    let currentSize: number | undefined;
    try {
        const stat = await fs.stat(resolved.absPath);
        currentMtime = stat.mtimeMs;
        currentSize = stat.size;
        const cached = diffCache.get(resolved.absPath);
        if (cached && cached.mtime === currentMtime && cached.size === currentSize) {
            return NextResponse.json(cached.body);
        }
    } catch { /* stat failed — proceed without cache */
    }

    const result = await runGitDiff(resolved.absPath);

    const cacheResult = (b: unknown) => {
        if (currentMtime !== undefined && currentSize !== undefined) {
            if (diffCache.size >= DIFF_CACHE_MAX) {
                const k = diffCache.keys().next().value;
                if (k) diffCache.delete(k);
            }
            diffCache.set(resolved.absPath, {mtime: currentMtime, size: currentSize, body: b});
        }
    };

    if (result.code === null) {
        return NextResponse.json(
            {ok: false, error: result.stderr || "Failed to spawn git."},
            {status: 500}
        );
    }

    if (result.code === 128) {
        const b = {
            ok: true,
            isRepo: false,
            diff: "",
            addedLines: [],
            removedLines: [],
            modifiedLines: [],
            hint: "Scripts directory is not inside a git repository."
        };
        cacheResult(b);
        return NextResponse.json(b);
    }

    if (result.code === 1) {
        const parsed = parseUnifiedDiff(result.stdout);
        const b = {
            ok: true,
            isRepo: true,
            diff: result.stdout,
            addedLines: parsed.addedLines,
            removedLines: parsed.removedLines,
            modifiedLines: parsed.modifiedLines,
            relPath
        };
        cacheResult(b);
        return NextResponse.json(b);
    }

    const b = {ok: true, isRepo: true, diff: "", addedLines: [], removedLines: [], modifiedLines: [], relPath};
    cacheResult(b);
    return NextResponse.json(b);
}
