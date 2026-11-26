import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * GET /api/python-check
 *
 * Lightweight interpreter probe for the "user has no Python" warning.
 * `findInterpreter` walks every discovery source (venv, conda, pyenv,
 * uv, system PATH…) and returns a candidate path — but a candidate is
 * not a working interpreter, so this route also SPAWNS `<interp>
 * --version` to prove it actually runs. If neither succeeds the app
 * toasts a warning at startup — runs, lint, tests and the figure
 * pipeline all need Python.
 *
 * an optional `?interpreter=` search parameter — the
 * CONFIGURED interpreter (Settings → Python). When set, THAT binary is
 * probed (falling back through findInterpreter's validation when it
 * can't be spawned), so the warning reflects the environment the user
 * actually selected, not just whatever was auto-detected first.
 *
 * Response: { ok, interpreter, version? } | { ok: false, error }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function probeVersion(interpreter: string): Promise<{ ok: boolean; version?: string }> {
    return new Promise((resolve) => {
        const child = spawn(interpreter, ["--version"], {stdio: ["ignore", "pipe", "ignore"]});
        let out = "";
        child.stdout.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        const t = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
            resolve({ok: false});
        }, 4000);
        child.on("close", (code) => {
            clearTimeout(t);
            resolve({ok: code === 0, version: out.trim().split("\n")[0] || undefined});
        });
        child.on("error", () => {
            clearTimeout(t);
            resolve({ok: false});
        });
    });
}

export async function GET(request: Request) {
    try {
        // honor the configured interpreter when provided.
        const requested = new URL(request.url).searchParams.get("interpreter") || undefined;
        const interpreter = await findInterpreter(requested || undefined);
        const probe = await probeVersion(interpreter);
        if (!probe.ok) {
            return NextResponse.json({
                ok: false,
                error: `Python ("${interpreter}") could not be started. Install Python 3 and make sure it is on your PATH.`,
            });
        }
        return NextResponse.json({ok: true, interpreter, version: probe.version});
    } catch (err) {
        return NextResponse.json({
            ok: false,
            error: `Interpreter detection failed: ${(err as Error).message}`,
        });
    }
}
