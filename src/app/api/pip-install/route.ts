import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/pip-install
 *
 * Body: { package: string, interpreter?: string }
 *
 * Installs a Python package into the SELECTED environment with
 * `<interpreter> -m pip install <package>`. Used by the folder
 * Issues-report dialog's "Install ruff" button when no linter is
 * available (linter: "none"), so issue reports can be generated
 * without leaving the app.
 *
 * SECURITY: the package spec is matched against a strict validator
 * (name + optional ==/>= version spec, never a leading dash — a
 * crafted value can never impersonate a pip flag). The interpreter
 * path is validated by findInterpreter (allow-list or Python
 * probe) before it is ever spawned, and the package name is never
 * passed through a shell (spawn argv, no shell: true).
 *
 * Response: { ok, exitCode, durationMs, output, interpreter, package }
 *   `output` carries the pip stdout+stderr tail (last ~8 KB).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3 * 60 * 1000; // pip can be slow on cold caches
const MAX_OUTPUT_CHARS = 8_000;

/** A name plus an optional version spec (`pkg==1.2`, `pkg>=1`):
 *  letters, digits, dot, underscore, hyphen — but NEVER a leading
 *  dash, so the value can never impersonate a pip flag. */
function validPackageSpec(pkg: string): boolean {
    const spec = pkg.replace(/\s+/g, "");
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]{0,100})((?:==|>=|<=|!=|~=|>|<)[A-Za-z0-9._+!-]+)*$/.exec(spec);
    return !!m;
}

export async function POST(request: Request) {
    let body: { package?: string; interpreter?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const pkg = (body.package ?? "").trim();
    if (!pkg || !validPackageSpec(pkg)) {
        return NextResponse.json(
            {error: "Invalid package (name or name==version expected)."},
            {status: 400}
        );
    }

    // The selected environment's interpreter (validated by
    // findInterpreter — never a bare shell or unprobed path).
    const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);
    const started = Date.now();

    const result = await new Promise<{ ok: boolean; output: string }>((resolve) => {
        const child = spawn(
            interpreter,
            ["-m", "pip", "install", "--disable-pip-version-check", pkg],
            {cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"]}
        );
        let out = "";
        child.stdout.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ok: code === 0, output: out.slice(-MAX_OUTPUT_CHARS)});
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({ok: false, output: `spawn error: ${err.message}`});
        });
    });

    return NextResponse.json({
        ok: result.ok,
        exitCode: result.ok ? 0 : 1,
        durationMs: Date.now() - started,
        output: result.output,
        interpreter,
        package: pkg,
    });
}
