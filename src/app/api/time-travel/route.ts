import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import {resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import type {TraceEvent, TraceFile} from "@/lib/trace-format";

/**
 * POST /api/time-travel
 *
 * Body: { folder, file, code?, interpreter?, maxEvents? (default 3000) }
 *
 * Runs the script ONCE under a sys.settrace recorder and returns the
 * full execution trace (TraceFile from src/lib/trace-format.ts):
 *   - every line / call / return / exception event, with the frame's
 *     locals as short reprs (80 chars)
 *   - stdout captured as deltas keyed by the event index they
 *     appeared after, so the UI can step forward AND backward
 *   - recording stops at maxEvents (capped: true) but the script
 *     itself always runs to completion
 *
 * The recorder is a `python -c` program (same pattern as /api/profile):
 * it swaps sys.stdout for a recording writer, so the ONLY bytes on the
 * process's real stdout are the final JSON document (printed through
 * the saved real stream). User-script stdout never leaks into the
 * channel — it lands in the stdout deltas.
 *
 * Response: { ok, error?, fileName, totalEvents, capped, stdout, events }
 *   ok=false + error (no data)  → infra failures (timeout / spawn /
 *                                 unparseable recorder output)
 *   ok=false + error + full data → the script itself raised (the
 *                                 trace up to the exception is still
 *                                 returned — that is the interesting
 *                                 part for time travel)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;
const DEFAULT_MAX_EVENTS = 3000;
/** Hard ceiling for maxEvents — keeps the JSON response bounded. */
const MAX_EVENTS_LIMIT = 50_000;

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        code?: string;
        interpreter?: string;
        maxEvents?: number;
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
    // A raw `code` override only needs folder/file for identity + cwd —
    // the on-disk file is not executed (same convention as /api/run).
    const resolved = await resolveScriptPath(folder, file, {
        anyKind: hasCodeOverride,
    });
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    const maxEvents =
        typeof body.maxEvents === "number" &&
        Number.isInteger(body.maxEvents) &&
        body.maxEvents > 0
            ? Math.min(body.maxEvents, MAX_EVENTS_LIMIT)
            : DEFAULT_MAX_EVENTS;

    const interpreter = await findInterpreter(body.interpreter);

    const recorder = `
import sys, json

TARGET = ${JSON.stringify(resolved.absPath)}
SRC_OVERRIDE = ${hasCodeOverride ? JSON.stringify(body.code) : "None"}
MAX_EVENTS = ${maxEvents}
REAL_OUT = sys.stdout

_events = []
_stdout = []
_capped = False
_error = None

class _Capture:
    # stdout replacement: each write becomes a delta keyed by the
    # number of events recorded so far.
    def write(self, text):
        try:
            if text:
                _stdout.append({"afterEvent": len(_events), "text": str(text)})
        except Exception:
            pass
        return len(text)
    def writelines(self, lines):
        for ln in lines:
            self.write(ln)
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

def _repr80(value):
    try:
        r = repr(value)
    except Exception:
        r = "<repr failed>"
    if len(r) > 80:
        r = r[:77] + "..."
    return r

def _locals_snap(frame):
    out = {}
    try:
        loc = frame.f_locals
        names = list(loc)[:64]
    except Exception:
        return out
    for k in names:
        if k.startswith("_"):
            continue
        try:
            out[str(k)] = _repr80(loc[k])
        except Exception:
            pass
    return out

def _tracer(frame, event, arg):
    global _capped
    if _capped:
        return None
    if frame.f_code.co_filename != TARGET:
        return None
    if len(_events) >= MAX_EVENTS:
        _capped = True
        return None
    try:
        ev = {"line": frame.f_lineno, "event": event,
              "locals": _locals_snap(frame)}
        if event != "line":
            ev["func"] = frame.f_code.co_name
        _events.append(ev)
    except Exception:
        return None
    return _tracer

sys.stdout = _Capture()
sys.argv = [TARGET]
_G = {"__name__": "__main__", "__file__": TARGET,
      "__builtins__": __builtins__}
try:
    if SRC_OVERRIDE is None:
        with open(TARGET, "r", encoding="utf-8") as f:
            source = f.read()
    else:
        source = SRC_OVERRIDE
    code = compile(source, TARGET, "exec")
    sys.settrace(_tracer)
    try:
        exec(code, _G)
    finally:
        sys.settrace(None)
except SystemExit:
    pass
except BaseException as e:
    _error = "%s: %s" % (type(e).__name__, e)
finally:
    sys.stdout = REAL_OUT

REAL_OUT.write(json.dumps({
    "fileName": ${JSON.stringify(resolved.fileName)},
    "totalEvents": len(_events),
    "capped": _capped,
    "stdout": _stdout,
    "events": _events,
    "error": _error,
}))
REAL_OUT.write("\\n")
REAL_OUT.flush()
`;

    const result = await new Promise<{
        code: number | null;
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
                code: null,
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
        child.on("close", (code) => {
            clearTimeout(timeoutHandle);
            resolve({code, stdout, stderr, timedOut, spawnError: false});
        });
        child.on("error", () => {
            clearTimeout(timeoutHandle);
            resolve({code: null, stdout, stderr: "spawn error", timedOut: false, spawnError: true});
        });
    });

    if (result.spawnError) {
        return NextResponse.json({ok: false, error: result.stderr}, {status: 500});
    }
    if (result.timedOut) {
        return NextResponse.json(
            {ok: false, error: `Script exceeded ${TIMEOUT_MS / 1000} s — recording aborted.`},
            {status: 408}
        );
    }

    const trace = parseTraceFile(result.stdout, resolved.fileName);
    if (!trace) {
        // The recorder's JSON is the only thing that should be on stdout —
        // corruption means the script bypassed sys.stdout (raw fd writes).
        return NextResponse.json(
            {
                ok: false,
                error:
                    "The trace recorder produced unparseable output (the script may have written directly to fd 1)." +
                    (result.stderr.trim() ? ` stderr: ${result.stderr.trim().slice(0, 200)}` : ""),
            },
            {status: 500}
        );
    }

    const scriptError = trace.error ?? null;
    return NextResponse.json({
        ok: scriptError === null,
        ...(scriptError !== null ? {error: scriptError} : {}),
        fileName: trace.fileName,
        totalEvents: trace.totalEvents,
        capped: trace.capped,
        stdout: trace.stdout,
        events: trace.events,
    });
}

interface ParsedTrace extends TraceFile {
    error?: string | null;
}

/** Strict-typed narrowing of the recorder's JSON into a TraceFile
 * (unknown → validated shape; no `any`). */
function parseTraceFile(raw: string, fallbackName: string): ParsedTrace | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;

    const events: TraceEvent[] = [];
    if (Array.isArray(obj.events)) {
        for (const e of obj.events) {
            if (!e || typeof e !== "object") continue;
            const ev = e as Record<string, unknown>;
            if (typeof ev.line !== "number") continue;
            if (
                ev.event !== "line" &&
                ev.event !== "call" &&
                ev.event !== "return" &&
                ev.event !== "exception"
            ) {
                continue;
            }
            const locals: Record<string, string> = {};
            if (ev.locals && typeof ev.locals === "object") {
                for (const [k, v] of Object.entries(ev.locals as Record<string, unknown>)) {
                    locals[k] = typeof v === "string" ? v : String(v);
                }
            }
            events.push({
                line: ev.line,
                event: ev.event,
                locals,
                ...(typeof ev.func === "string" ? {func: ev.func} : {}),
            });
        }
    }

    const stdout: Array<{ afterEvent: number; text: string }> = [];
    if (Array.isArray(obj.stdout)) {
        for (const s of obj.stdout) {
            if (!s || typeof s !== "object") continue;
            const delta = s as Record<string, unknown>;
            if (typeof delta.afterEvent !== "number" || typeof delta.text !== "string") continue;
            stdout.push({afterEvent: delta.afterEvent, text: delta.text});
        }
    }

    return {
        fileName: typeof obj.fileName === "string" ? obj.fileName : fallbackName,
        totalEvents: typeof obj.totalEvents === "number" ? obj.totalEvents : events.length,
        capped: obj.capped === true,
        stdout,
        events,
        ...(typeof obj.error === "string" ? {error: obj.error} : {}),
    };
}
