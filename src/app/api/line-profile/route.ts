import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import {resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/line-profile
 *
 * Body: { folder, file, code?, mode?: "line"|"memory"|"both", interpreter? }
 *
 * - line: sys.settrace tracer that credits elapsed time (perf_counter
 *   deltas — monotonic, unlike the literal time.time the contract
 *   mentions, which can jump on NTP adjustments) to the LAST executed
 *   line of the script per event. Classic line-profiler semantics.
 * - memory: tracemalloc snapshot diff (before exec vs after) grouped
 *   per function — the function is the deepest USER-script frame in
 *   each allocation traceback (tracemalloc frames carry no function
 *   names, so the enclosing function is derived from the script's own
 *   AST ranges; module-level allocations land in "<module>").
 * - both: one run with BOTH tracers active (both result fields).
 *
 * The script's own stdout is swallowed by the recorder — the only
 * bytes on the process's real stdout are the JSON result (same
 * pattern as /api/profile and /api/time-travel).
 *
 * Response:
 *   { ok, lines: Record<lineNo, microseconds>, slowest: [{ line, us,
 *     text }] (top 15), totalUs }                       — line / both
 *   { ok, memory: [{ func, bytes, count }] (top 20) }    — memory / both
 *   ok=false + error (+ any data already gathered) when the script
 *   itself raised; a bare { ok: false, error } for infra failures.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;
const SLOWEST_TOP = 15;
const MEMORY_TOP = 20;

interface MemoryEntry {
    func: string;
    bytes: number;
    count: number;
}

interface RecorderResult {
    lineUs: Record<string, number>;
    totalUs: number;
    memory: MemoryEntry[];
    error: string | null;
}

interface SlowestLine {
    line: number;
    us: number;
    text: string;
}

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        code?: string;
        mode?: string;
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

    const mode =
        body.mode === "memory" || body.mode === "both" ? body.mode : "line";
    const doLine = mode === "line" || mode === "both";
    const doMemory = mode === "memory" || mode === "both";

    // The script source (disk or override) — used for the `slowest` line
    // texts on the TS side and for the AST function ranges on the Python
    // side; both must see the SAME source.
    let sourceLines: string[];
    if (hasCodeOverride) {
        sourceLines = (body.code as string).split("\n");
    } else {
        try {
            sourceLines = (await fs.readFile(resolved.absPath, "utf-8")).split("\n");
        } catch {
            return NextResponse.json({error: "File vanished before profiling."}, {status: 404});
        }
    }

    const interpreter = await findInterpreter(body.interpreter);

    const recorder = `
import sys, json, time

TARGET = ${JSON.stringify(resolved.absPath)}
SRC_OVERRIDE = ${hasCodeOverride ? JSON.stringify(body.code) : "None"}
DO_LINE = ${doLine ? "True" : "False"}
DO_MEMORY = ${doMemory ? "True" : "False"}
REAL_OUT = sys.stdout

_error = None

class _Discard:
    # stdout replacement: the profiled script's prints are swallowed
    # so the only bytes on the real stdout are the JSON result.
    def write(self, text):
        return len(text)
    def writelines(self, lines):
        return len(lines)
    def flush(self):
        pass
    def isatty(self):
        return False
    def fileno(self):
        return REAL_OUT.fileno()
    @property
    def encoding(self):
        return "utf-8"
    def close(self):
        pass

_LINE_US = {}
_LAST_LINE = None
_LAST_T = None

def _line_tracer(frame, event, arg):
    global _LAST_LINE, _LAST_T
    if frame.f_code.co_filename != TARGET:
        return None
    now = time.perf_counter()
    if _LAST_LINE is not None:
        _LINE_US[_LAST_LINE] = _LINE_US.get(_LAST_LINE, 0.0) + (now - _LAST_T) * 1e6
    _LAST_LINE = frame.f_lineno
    _LAST_T = now
    return _line_tracer

if SRC_OVERRIDE is None:
    with open(TARGET, "r", encoding="utf-8") as f:
        source = f.read()
else:
    source = SRC_OVERRIDE

_FUNC_RANGES = []
if DO_MEMORY:
    import ast
    try:
        for _node in ast.walk(ast.parse(source)):
            if isinstance(_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                _FUNC_RANGES.append((_node.lineno, _node.end_lineno, _node.name))
    except Exception:
        _FUNC_RANGES = []

def _func_for_line(lineno):
    best = None
    best_size = None
    for start, end, name in _FUNC_RANGES:
        if start <= lineno <= end:
            size = end - start
            if best_size is None or size < best_size:
                best = name
                best_size = size
    return best

_MEM = {}

def _collect_memory(snap_before, snap_after):
    try:
        diffs = snap_after.compare_to(snap_before, "traceback")
    except Exception:
        return
    for d in diffs:
        try:
            if d.size_diff == 0 and d.count_diff == 0:
                continue
            frames = list(d.traceback)
            func = "<module>"
            for fr in reversed(frames):
                if fr.filename == TARGET:
                    func = _func_for_line(fr.lineno) or "<module>"
                    break
            entry = _MEM.get(func)
            if entry is None:
                _MEM[func] = [d.size_diff, d.count_diff]
            else:
                entry[0] += d.size_diff
                entry[1] += d.count_diff
        except Exception:
            pass

sys.stdout = _Discard()
sys.argv = [TARGET]
_G = {"__name__": "__main__", "__file__": TARGET,
      "__builtins__": __builtins__}
_snap_before = None
if DO_MEMORY:
    import tracemalloc
    tracemalloc.start(15)
    _snap_before = tracemalloc.take_snapshot()
_T0 = time.perf_counter()
try:
    _code = compile(source, TARGET, "exec")
    if DO_LINE:
        sys.settrace(_line_tracer)
    try:
        exec(_code, _G)
    finally:
        if DO_LINE:
            sys.settrace(None)
except SystemExit:
    pass
except BaseException as e:
    _error = "%s: %s" % (type(e).__name__, e)
_total_us = (time.perf_counter() - _T0) * 1e6
if DO_MEMORY:
    import tracemalloc
    _snap_after = tracemalloc.take_snapshot()
    tracemalloc.stop()
    _collect_memory(_snap_before, _snap_after)
sys.stdout = REAL_OUT

_mem_out = [{"func": k, "bytes": v[0], "count": v[1]}
            for k, v in _MEM.items()]
_mem_out.sort(key=lambda item: -item["bytes"])
_mem_out = _mem_out[:${MEMORY_TOP}]

REAL_OUT.write(json.dumps({
    "lineUs": {str(k): round(v, 1) for k, v in _LINE_US.items()},
    "totalUs": round(_total_us, 1),
    "memory": _mem_out,
    "error": _error,
}))
REAL_OUT.write("\\n")
REAL_OUT.flush()
`;

    const result = await new Promise<{
        stdout: string;
        stderr: string;
        timedOut: boolean;
        spawnError: boolean;
    }>((resolve) => {
        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(interpreter, ["-u", "-c", recorder], {
                cwd: path.dirname(resolved.absPath),
                env: {
                    ...process.env,
                    MPLBACKEND: "Agg",
                    PYTHONUNBUFFERED: "1",
                    PYTHONIOENCODING: "utf-8",
                },
                stdio: ["ignore", "pipe", "pipe"],
            });
        } catch (err) {
            resolve({
                stdout: "",
                stderr: `Failed to launch ${interpreter}: ${(err as Error).message}`,
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
        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, TIMEOUT_MS);
        child.on("close", () => {
            clearTimeout(timeoutHandle);
            resolve({stdout, stderr, timedOut, spawnError: false});
        });
        child.on("error", () => {
            clearTimeout(timeoutHandle);
            resolve({stdout, stderr: "spawn error", timedOut: false, spawnError: true});
        });
    });

    if (result.spawnError) {
        return NextResponse.json({ok: false, error: result.stderr}, {status: 500});
    }
    if (result.timedOut) {
        return NextResponse.json(
            {ok: false, error: `Script exceeded ${TIMEOUT_MS / 1000} s — profiling aborted.`},
            {status: 408}
        );
    }

    const parsed = parseRecorderOutput(result.stdout);
    if (!parsed) {
        return NextResponse.json(
            {
                ok: false,
                error:
                    "The profiler produced unparseable output (the script may have written directly to fd 1)." +
                    (result.stderr.trim() ? ` stderr: ${result.stderr.trim().slice(0, 200)}` : ""),
            },
            {status: 500}
        );
    }

    // Top 15 slowest lines with their source text.
    const slowest: SlowestLine[] = Object.entries(parsed.lineUs)
        .map(([key, us]) => {
            const line = parseInt(key, 10);
            return {
                line,
                us,
                text: (sourceLines[line - 1] ?? "").trim(),
            };
        })
        .sort((a, b) => b.us - a.us)
        .slice(0, SLOWEST_TOP);

    const scriptError = parsed.error ?? null;
    return NextResponse.json({
        ok: scriptError === null,
        ...(scriptError !== null ? {error: scriptError} : {}),
        ...(doLine
            ? {
                lines: parsed.lineUs,
                slowest,
                totalUs: parsed.totalUs,
            }
            : {}),
        ...(doMemory ? {memory: parsed.memory} : {}),
    });
}

/** Strict-typed narrowing of the recorder's JSON (unknown → validated). */
function parseRecorderOutput(raw: string): RecorderResult | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;

    const lineUs: Record<string, number> = {};
    if (obj.lineUs && typeof obj.lineUs === "object") {
        for (const [k, v] of Object.entries(obj.lineUs as Record<string, unknown>)) {
            if (typeof v === "number" && Number.isFinite(v)) {
                lineUs[k] = v;
            }
        }
    }

    const memory: MemoryEntry[] = [];
    if (Array.isArray(obj.memory)) {
        for (const m of obj.memory) {
            if (!m || typeof m !== "object") continue;
            const entry = m as Record<string, unknown>;
            if (typeof entry.func !== "string") continue;
            memory.push({
                func: entry.func,
                bytes: typeof entry.bytes === "number" ? entry.bytes : 0,
                count: typeof entry.count === "number" ? entry.count : 0,
            });
        }
    }

    return {
        lineUs,
        totalUs: typeof obj.totalUs === "number" ? obj.totalUs : 0,
        memory: memory.slice(0, MEMORY_TOP),
        error: typeof obj.error === "string" ? obj.error : null,
    };
}
