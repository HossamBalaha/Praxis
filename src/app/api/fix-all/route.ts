import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/fix-all
 *
 * Body: { folder, file, interpreter? }
 *
 * Runs `ruff check --fix --unsafe-fixes` on the requested script, writing
 * the fixes back to disk in place. Returns the number of issues that were
 * auto-fixed plus the list of diagnostics that remain (so the UI can show
 * a toast and refresh its diagnostics list without re-fetching).
 *
 * Falls back gracefully if ruff is not installed — returns
 * `{ ok: false, error: "ruff not installed" }` so the UI can show a
 * helpful message.
 *
 * Response:
 * { ok: true, fixed: N, remaining: [{line,col,code,message}] }
 * { ok: false, error: "ruff not installed" }
 * { ok: false, error: "<other message>" }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 30_000; // ruff --fix should be fast; kill hangs

interface Diagnostic {
    line: number;
    col: number;
    code: string;
    message: string;
}

/**
 * Run `ruff check` against the file. When `fix` is true, ruff applies the
 * auto-fixable rules in place and writes the modified source back to disk.
 * The concise output format is the same in both modes — the post-fix
 * stdout therefore lists exactly the diagnostics that *remain*.
 */
function runRuff(
    interpreter: string,
    absPath: string,
    fix: boolean
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    const args = [
        "-m",
        "ruff",
        "check",
        "--output-format=concise",
        "--no-cache",
    ];
    if (fix) args.push("--fix", "--unsafe-fixes");
    args.push(absPath);

    return new Promise((resolve) => {
        const child = spawn(interpreter, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timeoutHandle = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch {
                /* */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timeoutHandle);
            resolve({ok: code === 0, stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timeoutHandle);
            resolve({ok: false, stdout: "", stderr: "spawn error"});
        });
    });
}

/**
 * Parse ruff concise output: "<path>:<line>:<col>: <code> <message>".
 * Summary lines like "Found N errors (M fixed, K remaining)." don't match
 * the regex (no leading `<path>:` colon structure) so they're skipped
 * naturally.
 */
function parseRuffConcise(output: string): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const line of output.split("\n")) {
        const m = line.match(/^[^:]+:(\d+):(\d+):\s+(\S+)\s+(.+)$/);
        if (m) {
            out.push({
                line: parseInt(m[1], 10),
                col: parseInt(m[2], 10),
                code: m[3],
                message: m[4],
            });
        }
    }
    return out;
}

export async function POST(request: Request) {
    let body: { folder?: string; file?: string; interpreter?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file} = body;
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }
    const resolved = await resolveScriptPath(folder, file);
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    const interpreter = await findInterpreter(body.interpreter);

    // 1. Capture "before" diagnostics so we can count how many were fixed.
    //    This is also our ruff-installed probe — if ruff isn't installed,
    //    bail out with the friendly "ruff not installed" sentinel.
    const before = await runRuff(interpreter, resolved.absPath, false);
    if (before.stderr.toLowerCase().includes("no module named ruff")) {
        return NextResponse.json({ok: false, error: "ruff not installed"});
    }
    const beforeCount = parseRuffConcise(before.stdout).length;

    // 2. Apply fixes in place. The post-fix stdout contains the diagnostics
    // that *remain* (ruff prints them after applying --fix), so we parse
    //    it directly instead of running a third check.
    const after = await runRuff(interpreter, resolved.absPath, true);
    if (after.stderr.toLowerCase().includes("no module named ruff")) {
        return NextResponse.json({ok: false, error: "ruff not installed"});
    }
    const remaining = parseRuffConcise(after.stdout);
    const fixed = Math.max(0, beforeCount - remaining.length);

    return NextResponse.json({ok: true, fixed, remaining});
}
