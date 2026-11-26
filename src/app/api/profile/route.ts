import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {createRunTmpDir, resolveScriptPath,} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/profile
 *
 * Body: { folder, file }
 *
 * Runs the requested script under cProfile and returns the top-N lines
 * by cumulative time. The full pstats binary is also written to the run
 * temp dir in case the user wants to load it in snakeviz / gprof2dot.
 *
 * Response: {
 * ok,
 * lines: [{ ncalls, tottime, percall_tot, cumtime, percall_cum, file:line, func }],
 * pstatsUrl?: string,
 * durationMs
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINES = 40;
const TIMEOUT_MS = 120_000; // profiling is slower than running

interface ProfileLine {
    ncalls: string;
    tottime: number;
    percall_tot: number;
    cumtime: number;
    percall_cum: number;
    location: string;
}

function parsePstats(text: string): ProfileLine[] {
    // pstats text output looks like:
    //   ncalls  tottime  percall  cumtime  percall filename:lineno(function)
    //   100/1   0.001    0.000    0.010    0.010  foo:42(bar)
    const out: ProfileLine[] = [];
    for (const line of text.split("\n")) {
        const m = line.match(
            /^\s*(\d+\/?\d*)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/
        );
        if (m) {
            out.push({
                ncalls: m[1],
                tottime: parseFloat(m[2]),
                percall_tot: parseFloat(m[3]),
                cumtime: parseFloat(m[4]),
                percall_cum: parseFloat(m[5]),
                location: m[6],
            });
        }
    }
    return out.slice(0, MAX_LINES);
}

export async function POST(request: Request) {
    let body: { folder?: string; file?: string; stdin?: string; interpreter?: string };
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
    const runId = randomUUID();
    const runTmpDir = await createRunTmpDir(runId);

    // Use cProfile to run the user script and write a pstats binary
    // that snakeviz / gprof2dot can load.
    const pstatsPath = `${runTmpDir}/profile.pstats`;
    const profilerCode = `
import cProfile, pstats, sys, io, runpy
sys.argv = [${JSON.stringify(resolved.absPath)}]
profiler = cProfile.Profile()
profiler.enable()
try:
    with open(${JSON.stringify(resolved.absPath)}, "r", encoding="utf-8") as _f:
        exec(compile(_f.read(), ${JSON.stringify(resolved.absPath)}, "exec"))
except SystemExit:
    pass
profiler.disable()
profiler.dump_stats(${JSON.stringify(pstatsPath)})
s = io.StringIO()
pstats.Stats(profiler, stream=s).sort_stats("cumulative").print_stats(${MAX_LINES})
sys.stdout.write(s.getvalue())
`;

    const started = Date.now();
    const result = await new Promise<{
        ok: boolean;
        stdout: string;
        stderr: string;
    }>((resolve) => {
        const child = spawn(interpreter, ["-c", profilerCode], {
            cwd: runTmpDir,
            env: {
                ...process.env,
                MPLBACKEND: "Agg",
                PYTHONUNBUFFERED: "1",
                PYTHONIOENCODING: "utf-8",
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        if (body.stdin) {
            try {
                child.stdin?.write(body.stdin);
            } catch { /* */
            }
        }
        try {
            child.stdin?.end();
        } catch { /* */
        }
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timeoutHandle = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timeoutHandle);
            resolve({ok: code === 0, stdout, stderr});
        });
        child.on("error", () =>
            resolve({ok: false, stdout: "", stderr: "spawn error"})
        );
    });

    // Check pstats file exists.
    let pstatsUrl: string | undefined;
    try {
        await fs.access(pstatsPath);
        pstatsUrl = `/api/figure/${encodeURIComponent(runId)}/${encodeURIComponent("profile.pstats")}`;
    } catch {
        /* pstats file wasn't written */
    }

    return NextResponse.json({
        ok: result.ok,
        lines: parsePstats(result.stdout),
        stdout: result.stdout,
        stderr: result.stderr,
        pstatsUrl,
        durationMs: Date.now() - started,
    });
}
