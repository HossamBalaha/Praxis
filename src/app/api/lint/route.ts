import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot, resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/lint
 *
 * Body: { folder, file, interpreter?, content? }
 *
 * Runs `ruff check` on the requested script and returns the diagnostics
 * as a list. Falls back to `pyflakes` if `ruff` is not installed; if
 * neither is available, returns an empty list with a hint.
 *
 * when `content` is provided, the UNSAVED editor buffer
 * is linted instead of the on-disk file — ruff reads it from stdin
 * (`--stdin-filename` keeps the reported path stable), so the edit-mode
 * squiggles refresh live while typing instead of going stale. The
 * disk-based path is unchanged (and still cached by mtime+size).
 *
 * Results are cached in-memory keyed by (absPath, mtimeMs) so switching
 * back to a previously-linted file doesn't re-spawn Python (which takes
 * 2-3s per call). The cache is process-scoped (cleared on server
 * restart) and invalidated automatically when the file's mtime changes.
 *
 * Response: { ok, linter, diagnostics: [{ line, col, code, message }] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 30_000; // ruff / pyflakes should be fast; kill hangs

// ─── In-memory lint cache (stored on globalThis to survive HMR) ─────
// In dev mode, Turbopack recompiles route modules on every HMR update,
// creating a fresh Map each time. Storing on globalThis ensures the
// cache persists across module re-instantiations.
// The key includes mtime AND size: an mtime-only key can serve stale
// results when a write lands within the same mtime tick as the linted
// version .
interface CacheEntry {
    mtime: number;
    size: number;
    body: unknown;
}

const CACHE_MAX = 50;
const lintCache: Map<string, CacheEntry> = (() => {
    const g = globalThis as unknown as { __lintCache?: Map<string, CacheEntry> };
    if (!g.__lintCache) g.__lintCache = new Map();
    return g.__lintCache;
})();

interface Diagnostic {
    line: number;
    col: number;
    code: string;
    message: string;
}

async function runLinter(
    interpreter: string,
    absPath: string,
    tool: "ruff" | "pyflakes" | "ruff-binary",
    stdinContent?: string
): Promise<{ ok: boolean; output: string; stderr: string }> {
    // Three strategies, fastest first:
    // 1. "ruff-binary" — `ruff check` as a standalone binary (~50ms
    //    startup). If `pip install ruff` was used, `ruff.exe` / `ruff`
    //    is on PATH. This avoids the ~1.5-3s Python interpreter startup
    //    on Windows.
    // 2. "ruff" — `python -m ruff check` (slower, ~1.5s+ for Python
    //    startup). Fallback if the standalone binary isn't on PATH.
    // 3. "pyflakes" — `python -m pyflakes` (last resort).
    //
    // with `stdinContent`, the ruff strategies read the
    // buffer from stdin via `--stdin-filename` (pyflakes has no stdin
    // mode — live lint simply returns empty for it).
    let cmd: string;
    let args: string[];
    const useStdin = typeof stdinContent === "string";
    if (tool === "ruff-binary") {
        cmd = "ruff";
        args = useStdin
            ? ["check", "--stdin-filename", absPath, "--output-format=concise", "--no-cache", "-"]
            : ["check", "--output-format=concise", "--no-cache", absPath];
    } else if (tool === "ruff") {
        cmd = interpreter;
        args = useStdin
            ? ["-m", "ruff", "check", "--stdin-filename", absPath, "--output-format=concise", "--no-cache", "-"]
            : ["-m", "ruff", "check", "--output-format=concise", "--no-cache", absPath];
    } else {
        if (useStdin) {
            // pyflakes has no stdin mode — report "no live lint" cleanly.
            return {ok: true, output: "", stderr: ""};
        }
        cmd = interpreter;
        args = ["-m", "pyflakes", absPath];
    }
    return new Promise((resolve) => {
        const child = spawn(/* turbopackIgnore: true */ cmd, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
            // NEVER enable `shell` here: argv carries the
            // user-controlled file path, and on Windows Node does not quote
            // argv elements when shell is true — a folder file named
            // "x & calc.py" would inject a second command. Bare executable
            // names ("ruff", or the absolute interpreter path) resolve via
            // PATH on every platform without a shell.
        });
        if (useStdin) {
            child.stdin?.on("error", () => { /* EPIPE when the tool exits early */
            });
            child.stdin?.end(stdinContent, "utf-8");
        }
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timeoutHandle = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timeoutHandle);
            resolve({ok: code === 0, output: stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timeoutHandle);
            resolve({ok: false, output: "", stderr: "spawn error"});
        });
    });
}

function parseRuffConcise(output: string): Diagnostic[] {
    // ruff concise format: "<path>:<line>:<col>: <code> <message>"
    // (messages may carry a "[*] " / "[ ] " fixable prefix — stripped
    // so the squiggle tooltip reads cleanly)
    const out: Diagnostic[] = [];
    for (const line of output.split("\n")) {
        const m = line.match(/^[^:]+:(\d+):(\d+):\s+(\S+)\s+(.+)$/);
        if (m) {
            out.push({
                line: parseInt(m[1], 10),
                col: parseInt(m[2], 10),
                code: m[3],
                message: m[4].replace(/^\[(\*| |x|X)\]\s+/, ""),
            });
        }
    }
    return out;
}

function parsePyflakes(output: string): Diagnostic[] {
    // pyflakes format: "<path>:<line>:<col>: <message>" (no code)
    const out: Diagnostic[] = [];
    for (const line of output.split("\n")) {
        const m = line.match(/^[^:]+:(\d+):(\d+):\s+(.+)$/);
        if (m) {
            out.push({
                line: parseInt(m[1], 10),
                col: parseInt(m[2], 10),
                code: "PYF",
                message: m[3],
            });
        }
    }
    return out;
}

export async function POST(request: Request) {
    let body: { folder?: string; file?: string; interpreter?: string; content?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file, content} = body;
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }
    const liveLint = typeof content === "string";
    const resolved = await resolveScriptPath(folder, file);
    if (!resolved) {
        // Live lint of a buffer for a file that no longer exists on disk
        // (deleted after opening): still lint the buffer content.
        if (!liveLint) {
            return NextResponse.json({error: "File not found."}, {status: 404});
        }
    }

    // resolve the lint target. For live (buffer) lint the
    // file may not exist on disk yet — a virtual path under the scripts
    // root keeps ruff's reported path shape (and its import resolution)
    // stable. Disk lint keeps using the resolved real path (cache key).
    const absPath = resolved?.absPath ?? path.join(
        getScriptsRoot(),
        deslugify(folder) ?? folder,
        deslugify(file) ?? file
    );

    // ── Cache check (disk lint only — buffer lint must always re-run):
    //    if we've linted this file before AND its mtime hasn't changed,
    //    return the cached result without re-spawning Python. This makes
    //    switching back to a previously-opened file instant (was 2-3s
    //    per re-lint).
    let currentStat: { mtime: number; size: number } | null = null;
    if (!liveLint) {
        try {
            const stat = await fs.stat(absPath);
            const cacheKey = absPath;
            const cached = lintCache.get(cacheKey);
            if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
                return NextResponse.json(cached.body);
            }
            // Store the stat so we can key the cache entry after linting completes.
            currentStat = {mtime: stat.mtimeMs, size: stat.size};
        } catch {
            // stat failed — proceed without cache
        }
    }

    const interpreter = await findInterpreter(body.interpreter);

    /** Store a result in the cache (disk lint + valid stat only). */
    const cacheResult = (responseBody: unknown) => {
        if (currentStat) {
            if (lintCache.size >= CACHE_MAX) {
                // Evict the oldest entry (Map preserves insertion order).
                const firstKey = lintCache.keys().next().value;
                if (firstKey) lintCache.delete(firstKey);
            }
            lintCache.set(absPath, {mtime: currentStat.mtime, size: currentStat.size, body: responseBody});
        }
    };

    // Detect ruff binary availability ONCE (cached on globalThis).
    // If ruff.exe isn't on PATH, skip the binary attempt entirely —
    // the failed spawn wastes ~500ms on Windows.
    const g = globalThis as unknown as { __ruffBinaryChecked?: boolean; __ruffBinaryAvailable?: boolean };
    if (g.__ruffBinaryChecked === undefined) {
        g.__ruffBinaryChecked = true;
        try {
            // spawnSync instead of execSync: the options are properly typed
            // (execSync + shell/timeout/stdio failed type checking with
            // TS2769 and broke `next build`), and no shell
            // is involved at all. "ruff" resolves via PATH on Unix and via
            // CreateProcess (.exe) on Windows; an npm .cmd shim simply isn't
            // found and we fall back to `python -m ruff`.
            const {spawnSync} = await import("node:child_process");
            const res = spawnSync("ruff", ["--version"], {
                stdio: "ignore",
                timeout: 2000,
            });
            g.__ruffBinaryAvailable = res.status === 0 && !res.error;
        } catch {
            g.__ruffBinaryAvailable = false;
        }
    }

    // Try ruff binary first (only if available), then python -m ruff,
    // then pyflakes as last resort. Live lint passes the buffer via
    // stdin; pyflakes has no stdin mode (runLinter returns empty there).
    const stdin = liveLint ? (content as string) : undefined;
    let result: { ok: boolean; output: string; stderr: string };
    if (g.__ruffBinaryAvailable) {
        result = await runLinter(interpreter, absPath, "ruff-binary", stdin);
    } else {
        result = await runLinter(interpreter, absPath, "ruff", stdin);
    }
    // If ruff binary failed (not on PATH after all), fall back to python -m ruff.
    if (g.__ruffBinaryAvailable && (result.stderr.toLowerCase().includes("no such file") || result.stderr.toLowerCase().includes("not found") || (result.output === "" && result.stderr === "" && !result.ok))) {
        g.__ruffBinaryAvailable = false; // don't try binary again
        result = await runLinter(interpreter, absPath, "ruff", stdin);
    }
    if (result.stderr.includes("No module named ruff")) {
        result = await runLinter(interpreter, absPath, "pyflakes", stdin);
        const responseBody = {
            ok: result.ok,
            linter: "pyflakes",
            diagnostics: parsePyflakes(result.output),
            raw: result.output,
        };
        cacheResult(responseBody);
        return NextResponse.json(responseBody);
    }
    if (result.stderr.toLowerCase().includes("no module")) {
        const responseBody = {
            ok: true,
            linter: "none",
            diagnostics: [],
            hint: "Install ruff (`pip install ruff`) for linting.",
        };
        cacheResult(responseBody);
        return NextResponse.json(responseBody);
    }
    const responseBody = {
        ok: result.ok,
        linter: "ruff",
        diagnostics: parseRuffConcise(result.output),
        raw: result.output,
    };
    cacheResult(responseBody);
    return NextResponse.json(responseBody);
}
