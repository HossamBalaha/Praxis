import {spawn} from "node:child_process";

/**
 * one shared helper for
 * routes that run a FIXED, non-user Python snippet and expect one
 * JSON line back on stdout (same trust model as /api/data-sheet,
 * which this was extracted from).
 *
 * runPyOnce:
 * - spawns `interpreter` with `args`
 * - collects stdout/stderr
 * - enforces the timeout with SIGKILL
 * - resolves { ok, stdout, stderr, timedOut }
 *
 * lastJsonLine: the LAST non-empty stdout line parsed as JSON —
 * Python warnings/deprecation notices on earlier lines are skipped.
 */

export interface PyRunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

export function runPyOnce(
    interpreter: string,
    args: string[],
    opts: { timeoutMs?: number; cwd?: string } = {}
): Promise<PyRunResult> {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    return new Promise<PyRunResult>((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timedOut = false;
        const child = spawn(interpreter, args, {
            cwd: opts.cwd,
            env: {...process.env, PYTHONIOENCODING: "utf-8"},
            stdio: ["ignore", "pipe", "pipe"],
        });
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, timeoutMs);
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        child.on("close", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ok: true, stdout, stderr, timedOut});
        });
        child.on("error", (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ok: false, stdout: "", stderr: err.message, timedOut: false});
        });
    });
}

/** Parse the last non-empty stdout line as JSON; null when absent. */
export function lastJsonLine<T = unknown>(stdout: string): T | null {
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(lines[i]) as T;
        } catch {
            /* keep walking backwards */
        }
    }
    return null;
}
