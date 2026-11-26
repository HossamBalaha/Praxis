import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {findInterpreter} from "@/lib/python-interpreter";
import {safeFolderName} from "@/lib/scripts";

/**
 * POST /api/audit
 *
 * Body: { folder: <slug>, interpreter?: string }
 *
 * Runs `pip-audit` (or `python -m pip_audit`) against the folder's
 * per-folder venv at `.venv/<folder-slug>/` (if it exists) or against
 * the detected Python interpreter, and returns a list of known
 * vulnerabilities for the installed packages.
 *
 * We prefer the JSON output format (`--format json`) because it's
 * machine-readable; if pip-audit refuses JSON output (older versions),
 * we fall back to parsing the human-readable text format best-effort.
 *
 * Response: {
 * ok: boolean,
 * vulnerabilities: Array<{
 * name: string,
 * version: string,
 * fixVersion: string, // first recommended fix version, or ""
 * id: string, // GHSA-... / PYSEC-... / CVE-...
 * description: string,
 * }>,
 * count: number,
 * raw?: string, // included on text-parse fallback
 * hint?: string, // included when pip-audit is not installed
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;

interface Vulnerability {
    name: string;
    version: string;
    fixVersion: string;
    id: string;
    description: string;
}

interface PipAuditJson {
    dependencies?: Array<{
        name: string;
        version: string;
        vulns?: Array<{
            id?: string;
            fix_versions?: string[];
            description?: string;
        }>;
    }>;
}

/**
 * Resolve the Python interpreter to audit:
 *   1. If a per-folder venv exists at .venv/<folder-name>/, use its python.
 *   2. Otherwise use findInterpreter(body.interpreter).
 *
 * the venv python path used to be built from the RAW
 * folder request field and spawned verbatim if it existed — a
 * crafted slug pointing at any binary on disk turned this route into
 * arbitrary binary execution. The folder now goes through
 * safeFolderName (deslugify + separator/".." checks) and a
 * path.relative containment guard against the .venv root.
 */
async function resolveAuditInterpreter(
    folder: string,
    manualOverride?: string
): Promise<{ python: string; fromVenv: boolean }> {
    const folderName = safeFolderName(folder);
    if (folderName) {
        const venvRoot = path.resolve(process.cwd(), ".venv");
        const venvDir = path.join(venvRoot, folderName);
        const rel = path.relative(venvRoot, venvDir);
        const contained =
            !rel.startsWith("..") && !path.isAbsolute(rel) && rel !== "";
        if (contained) {
            const venvPython =
                process.platform === "win32"
                    ? path.join(venvDir, "Scripts", "python.exe")
                    : path.join(venvDir, "bin", "python");
            try {
                const stat = await fs.stat(venvPython);
                if (stat.isFile()) {
                    return {python: venvPython, fromVenv: true};
                }
            } catch {
                // No venv — fall through.
            }
        }
    }
    const py = await findInterpreter(manualOverride);
    return {python: py, fromVenv: false};
}

/** Run a single command and capture stdout/stderr with a hard timeout. */
function runCmd(
    cmd: string,
    args: string[],
    cwd: string
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
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

/**
 * Run pip-audit, trying several invocations in order:
 *   1. `pip-audit --format json`  (the standalone CLI)
 *   2. `<python> -m pip_audit --format json`  (module form)
 *
 * Returns the raw result of whichever invocation succeeded (or the last
 * failure if none did).
 */
async function runPipAudit(
    python: string
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null; tried: string }> {
    // 1. Try the standalone CLI.
    const cliResult = await runCmd(
        "pip-audit",
        ["--format", "json"],
        process.cwd()
    );
    if (cliResult.code !== null) {
        // Process spawned and exited — return its result regardless of exit
        // code (non-zero can still carry useful JSON for "vulns found").
        return {...cliResult, tried: "pip-audit --format json"};
    }
    // ENOENT (spawn error) → CLI not on PATH. Try module form.

    // 2. Try the module form via the chosen interpreter.
    const modResult = await runCmd(
        python,
        ["-m", "pip_audit", "--format", "json"],
        process.cwd()
    );
    return {...modResult, tried: `${python} -m pip_audit --format json`};
}

/** Parse the JSON output of `pip-audit --format json`. */
function parseJsonOutput(json: string): Vulnerability[] {
    let parsed: PipAuditJson;
    try {
        parsed = JSON.parse(json) as PipAuditJson;
    } catch {
        return [];
    }
    const out: Vulnerability[] = [];
    for (const dep of parsed.dependencies ?? []) {
        for (const vuln of dep.vulns ?? []) {
            out.push({
                name: dep.name,
                version: dep.version,
                fixVersion: (vuln.fix_versions ?? [])[0] ?? "",
                id: vuln.id ?? "",
                description: vuln.description ?? "",
            });
        }
    }
    return out;
}

/**
 * Parse the human-readable text output of `pip-audit` best-effort.
 * The text format looks roughly like:
 *
 * Found 2 vulnerabilities:
 *
 * Name Version ID Fix Versions
 * ----------- ------- -------------- ------------
 * requests 2.25.0 GHSA-... 2.31.0
 * urllib3 1.25.0 PYSEC-... 1.26.5
 *
 * Descriptions are not included in the text format, so we leave them
 * blank. We match rows that look like `<name> <version> <id> <fix?>`.
 */
function parseTextOutput(text: string): Vulnerability[] {
    const out: Vulnerability[] = [];
    const lines = text.split("\n");
    // IDs we recognize: GHSA-..., PYSEC-..., CVE-..., RUSTSEC-...
    const idRe = /\b(GHSA-[A-Za-z0-9-]+|PYSEC-[A-Za-z0-9-]+|CVE-\d{4}-\d+|RUSTSEC-\d{4}-\d+)\b/;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Skip header / separator lines.
        if (/^name\b/i.test(trimmed)) continue;
        if (/^-+$/.test(trimmed) || /^=+$/.test(trimmed)) continue;
        if (/^found\s+\d+\s+vulneranc/i.test(trimmed)) continue;
        const idMatch = trimmed.match(idRe);
        if (!idMatch) continue;
        const id = idMatch[1];
        // Split the line into whitespace-separated tokens. The name is the
        // first token, version is the second, id is one of the middle ones,
        // and the fix version(s) are whatever comes after the id.
        const tokens = trimmed.split(/\s+/);
        if (tokens.length < 3) continue;
        const name = tokens[0];
        const version = tokens[1];
        const idIdx = tokens.findIndex((t) => t === id);
        const fixVersion = idIdx >= 0 && idIdx < tokens.length - 1
            ? tokens.slice(idIdx + 1).join(", ")
            : "";
        out.push({
            name,
            version,
            fixVersion,
            id,
            description: "",
        });
    }
    return out;
}

export async function POST(request: Request) {
    let body: { folder?: string; interpreter?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const {folder} = body;
    if (!folder) {
        return NextResponse.json(
            {error: "Body must include 'folder'."},
            {status: 400}
        );
    }

    const {python, fromVenv} = await resolveAuditInterpreter(
        folder,
        body.interpreter
    );

    const result = await runPipAudit(python);

    // Common case: pip-audit is not installed.
    const combined = (result.stdout + " " + result.stderr).toLowerCase();
    if (
        result.code === null ||
        combined.includes("no module named pip_audit") ||
        (result.stderr.toLowerCase().includes("not found") &&
            result.stdout.trim() === "")
    ) {
        return NextResponse.json({
            ok: false,
            vulnerabilities: [],
            count: 0,
            hint:
                "pip-audit is not installed. Install it with " +
                `'${python} -m pip install pip-audit' to enable vulnerability scanning.`,
            interpreter: python,
            fromVenv,
        });
    }

    // Try JSON first; fall back to text parsing.
    let vulnerabilities: Vulnerability[] = [];
    let usedFallback = false;
    if (result.stdout.trim().startsWith("{") || result.stdout.trim().startsWith("[")) {
        vulnerabilities = parseJsonOutput(result.stdout);
    }
    if (vulnerabilities.length === 0) {
        // Either JSON parsing failed or pip-audit printed text. Try text.
        const textVulns = parseTextOutput(result.stdout);
        if (textVulns.length > 0) {
            vulnerabilities = textVulns;
            usedFallback = true;
        }
    }

    // pip-audit exits non-zero when vulnerabilities are found; that's not
    // an error from our perspective — we still return ok=true.
    const isRealError =
        result.code !== 0 &&
        vulnerabilities.length === 0 &&
        !combined.includes("no known vulnerabilities") &&
        !combined.includes("no vulnerabilities found");

    if (isRealError) {
        return NextResponse.json(
            {
                ok: false,
                error: result.stderr || `pip-audit exited with code ${result.code}`,
                raw: result.stdout,
                interpreter: python,
                fromVenv,
            },
            {status: 500}
        );
    }

    return NextResponse.json({
        ok: true,
        vulnerabilities,
        count: vulnerabilities.length,
        ...(usedFallback ? {raw: result.stdout} : {}),
        interpreter: python,
        fromVenv,
        tried: result.tried,
    });
}
