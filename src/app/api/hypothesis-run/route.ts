import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {createRunTmpDir, resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/hypothesis-run
 *
 * Body: { folder, file (test file slug), code? (source override), testName? }
 *
 * Runs `python -m pytest <file> --hypothesis-show-statistics -q` on the
 * test file and parses the output:
 *   - passed / failed / errors from pytest's summary line
 *   - shrinks: every "Falsifying example" block in output order
 *     (original → minimal — old hypothesis versions printed each
 *     shrink step, modern versions print the final one)
 *   - statistics: the raw trimmed "Hypothesis" report section
 *
 * Missing packages are reported honestly instead of crashing:
 *   hypothesis missing → { ok: false, missing: "hypothesis",
 *                          hint: "pip install hypothesis" }
 *   pytest missing    → { ok: false, missing: "pytest",
 *                          hint: "pip install pytest" }
 *
 * A `code` override is written to a run-tmp file with the SAME
 * basename (pytest needs a real file; the user's folder is never
 * touched) and run with the folder as cwd so conftest/imports apply.
 *
 * Response: { ok: true, passed, failed, errors, shrinks: [{ step,
 *             repr, explanation? }], statistics?, stdout }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 120_000; // hypothesis property tests can be slow
const PROBE_TIMEOUT_MS = 15_000;
/** Cap on the raw stdout echoed back (full text still parsed). */
const MAX_STDOUT_CHARS = 200_000;

interface ShrinkStep {
    step: number;
    repr: string;
    explanation?: string;
}

interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError: boolean;
}

function runToString(
    command: string,
    argv: string[],
    cwd: string,
    timeoutMs: number
): Promise<RunResult> {
    return new Promise<RunResult>((resolve) => {
        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(command, argv, {
                cwd,
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: "1",
                    PYTHONIOENCODING: "utf-8",
                    MPLBACKEND: "Agg",
                },
                stdio: ["ignore", "pipe", "pipe"],
            });
        } catch (err) {
            resolve({
                code: null,
                stdout: "",
                stderr: `Failed to launch ${command}: ${(err as Error).message}`,
                timedOut: false,
                spawnError: true,
            });
            return;
        }
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, timeoutMs);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({code, stdout, stderr, timedOut, spawnError: false});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({code: null, stdout, stderr: "spawn error", timedOut: false, spawnError: true});
        });
    });
}

/** "Falsifying example" / "Failing test case" blocks in output order
 * (original → minimal), with hypothesis's optional "Explanation:" /
 * "title:" section split out. Hypothesis ≤6.79 prints "Falsifying
 * example:", modern versions print "Failing test case:" inside the
 * pytest traceback (each echoed line prefixed with "E "). */
function parseShrinks(output: string): ShrinkStep[] {
    const lines = output.split("\n");
    const out: ShrinkStep[] = [];
    let i = 0;
    while (i < lines.length) {
        const marker =
            lines[i].includes("Falsifying example") ||
            lines[i].includes("Failing test case");
        if (!marker) {
            i++;
            continue;
        }
        const block: string[] = [];
        let j = i;
        while (j < lines.length && lines[j].trim() !== "") {
            // pytest prefixes traceback-echoed lines with "E" — strip that
            // marker so the repr reads like the original hypothesis output.
            block.push(lines[j].replace(/^\s*E\s?/, ""));
            j++;
        }
        // hypothesis sometimes appends "title:" / "Explanation:" after a
        // blank line — absorb that continuation so it cannot be mistaken
        // for a separate block.
        let k = j;
        while (k < lines.length && lines[k].trim() === "") k++;
        let explanation: string | undefined;
        if (
            k < lines.length &&
            (lines[k].startsWith("Explanation:") || lines[k].startsWith("title:"))
        ) {
            const extra: string[] = [];
            while (k < lines.length && lines[k].trim() !== "") {
                extra.push(lines[k].replace(/^\s*E\s?/, ""));
                k++;
            }
            block.push("", ...extra);
            const explIdx = extra.findIndex((l) => l.startsWith("Explanation:"));
            if (explIdx >= 0) {
                explanation =
                    extra.slice(explIdx).join("\n").replace(/^Explanation:[^\n]*\n?/, "").trim() ||
                    undefined;
            }
        }
        const repr = block.join("\n").trim();
        if (repr) {
            out.push({
                step: out.length,
                repr,
                ...(explanation !== undefined ? {explanation} : {}),
            });
        }
        i = Math.max(k, j + 1);
    }
    return out;
}

/** The raw Hypothesis report section pytest prints for
 * --hypothesis-show-statistics ("==== Hypothesis Statistics ====" in
 * modern versions, "---- Hypothesis ----" in older ones); falls back
 * to scanning the `test_x:` / `  - during ... phase` blocks when the
 * section header is absent. */
function extractStatistics(stdout: string): string | undefined {
    const lines = stdout.split("\n");
    const headerIdx = lines.findIndex((l) => {
        const t = l.trim();
        return (
            t.length > 10 &&
            (/^[=-]+ *Hypothesis Statistics *=*$/.test(t) || /^-+ *Hypothesis *-+$/.test(t))
        );
    });
    if (headerIdx >= 0) {
        const collected: string[] = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
            // Section dividers are runs of = or - dashes; the statistic
            // bullets ("- during generate phase …") carry a SINGLE dash and
            // must stay inside the section. With -q the final summary line
            // ("1 passed in 0.1s") is unwrapped — stop there too.
            const t = lines[i].trim();
            if (t.startsWith("=") || /^-{4,}/.test(t) || /^\d+ (passed|failed|error|no tests)/.test(t)) break;
            collected.push(lines[i]);
        }
        const text = collected.join("\n").trim();
        if (text) return text;
    }
    // Fallback scan: test-id headers followed by indented stat lines.
    const fallback: string[] = [];
    for (const line of lines) {
        if (
            /^test\w+:$/.test(line.trim()) ||
            /^.+::[^:]+:$/.test(line.trim()) ||
            (line.startsWith("  ") && line.trim().startsWith("- "))
        ) {
            fallback.push(line);
        }
    }
    const text = fallback.join("\n").trim();
    return text || undefined;
}

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        code?: string;
        testName?: string;
        interpreter?: string;
    };
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
    const hasCodeOverride = typeof body.code === "string" && body.code.length > 0;
    const resolved = await resolveScriptPath(folder, file, {
        anyKind: hasCodeOverride,
    });
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    const interpreter = await findInterpreter(body.interpreter);
    const cwd = path.dirname(resolved.absPath);

    // Hypothesis probe — the whole route is pointless without it.
    const probe = await runToString(
        interpreter,
        ["-c", "import hypothesis"],
        cwd,
        PROBE_TIMEOUT_MS
    );
    if (probe.spawnError) {
        return NextResponse.json({ok: false, error: probe.stderr}, {status: 500});
    }
    if (probe.code !== 0 || /no module named/i.test(probe.stderr)) {
        return NextResponse.json({
            ok: false,
            missing: "hypothesis",
            hint: "pip install hypothesis",
        });
    }

    // A `code` override must become a real file for pytest — write it to
    // the run-tmp tree under the same basename (the folder is cwd).
    let target = resolved.absPath;
    if (hasCodeOverride) {
        const runTmpDir = await createRunTmpDir(randomUUID());
        target = path.join(runTmpDir, resolved.fileName);
        try {
            // resolved.fileName keeps its nested path ("A/B/c.py") — recreate
            // the intermediate directories so the staged file lands where the
            // join above points.
            await fs.mkdir(path.dirname(target), {recursive: true});
            await fs.writeFile(target, body.code as string, "utf-8");
        } catch (err) {
            return NextResponse.json(
                {ok: false, error: `Could not stage the overridden source: ${(err as Error).message}`},
                {status: 500}
            );
        }
    }

    const testName =
        typeof body.testName === "string" && body.testName.trim()
            ? body.testName.trim()
            : undefined;

    const args: string[] = [
        "-m", "pytest",
        target,
        "--hypothesis-show-statistics",
        "-q",
        "-p", "no:cacheprovider",
        ...(testName ? ["-k", testName] : []),
    ];

    const result = await runToString(interpreter, args, cwd, TIMEOUT_MS);
    if (result.spawnError) {
        return NextResponse.json({ok: false, error: result.stderr}, {status: 500});
    }
    if (result.timedOut) {
        return NextResponse.json(
            {ok: false, error: `pytest exceeded ${TIMEOUT_MS / 1000} s — the run was killed.`},
            {status: 408}
        );
    }
    if (/no module named (['"]?pytest['"]?)/i.test(result.stderr)) {
        return NextResponse.json({
            ok: false,
            missing: "pytest",
            hint: "pip install pytest",
        });
    }

    // Counts from pytest's final summary line ("=== 3 passed, 1 failed,
    // 2 errors in 0.05s ==="). Nothing parseable (collection error etc.)
    // leaves the raw stdout as the source of truth.
    const passed = /(\d+) passed/.exec(result.stdout)?.[1] ?? "0";
    const failed = /(\d+) failed/.exec(result.stdout)?.[1] ?? "0";
    const errors = /(\d+) errors?\b/.exec(result.stdout)?.[1] ?? "0";

    const shrinks = parseShrinks(result.stdout + "\n" + result.stderr);
    const statistics = extractStatistics(result.stdout);

    return NextResponse.json({
        ok: true,
        passed: parseInt(passed, 10),
        failed: parseInt(failed, 10),
        errors: parseInt(errors, 10),
        shrinks,
        ...(statistics !== undefined ? {statistics} : {}),
        stdout: result.stdout.slice(0, MAX_STDOUT_CHARS),
    });
}
