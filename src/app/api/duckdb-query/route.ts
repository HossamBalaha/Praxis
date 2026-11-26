import {NextRequest, NextResponse} from "next/server";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine} from "@/lib/py-exec";

/**
 * DuckDB analytical SQL workbench.
 *
 * GET  /api/duckdb-query?folder=<slug>&file=<slug>  → schema inference
 *      (columns with types + samples, approximate row count) for a
 *      parquet / csv / feather file.
 * POST /api/duckdb-query { folder, file, sql, interpreter? }  → run
 *      the user's SQL verbatim over the file loaded as the table
 *      named after the file stem — full SQL: window functions, joins,
 *      CTEs, GROUP BY, everything duckdb supports.
 *
 * The user SQL NEVER touches the command line — it is piped to the
 * Python helper through STDIN (the argv only ever carries the fixed,
 * non-user snippet and the two mode/path arguments), so there is no
 * shell/argv injection surface at all. Same folder/file containment
 * guards as /api/sqlite-query. Rows are capped (1000), cells are
 * stringified/truncated (200 chars) and the run is killed after
 * TIMEOUT_MS.
 *
 * duckdb not installed → { ok: false, missing: "duckdb",
 * hint: "pip install duckdb" } so the workbench can render the
 * install hint card with a copyable line.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;
const TIMEOUT_MS = 60_000; // analytical files are big — give duckdb room

const DATA_EXTS = new Set([".parquet", ".csv", ".feather"]);

/** Schema + query runner — a FIXED, non-user Python snippet. The user
 *  SQL arrives on stdin, never in argv. MAX_ROWS is inlined by hand
 *  (1000) below so the snippet stays a plain constant string. */
const DUCKDB_PY = String.raw`
import json, sys, os, time

mode = sys.argv[1]          # "schema" | "query"
db_path = sys.argv[2]

def emit(obj):
    print(json.dumps(obj, default=str))

# Table name = the file's stem, sanitized to a safe SQL identifier
# ("sales-2024.parquet" -> table "sales_2024", "1data.csv" -> "t_1data").
def safe_name(p):
    stem = os.path.splitext(os.path.basename(p))[0]
    cleaned = "".join(c if c.isalnum() else "_" for c in stem)
    if not cleaned:
        return "t"
    if cleaned[0].isdigit():
        return "t_" + cleaned
    return cleaned

TABLE = safe_name(db_path)
EXT = os.path.splitext(db_path)[1].lower()

try:
    import duckdb
except Exception:
    emit({"ok": False, "missing": "duckdb", "hint": "pip install duckdb"})
    sys.exit(0)

def stringify(v):
    if v is None:
        return None
    if isinstance(v, (bytes, bytearray)):
        v = v.hex()
    elif isinstance(v, (dict, list)):
        v = json.dumps(v, default=str)
    else:
        v = str(v)
    return v[:200] if len(v) > 200 else v

try:
    con = duckdb.connect()
    if EXT == ".parquet":
        con.execute("CREATE TABLE \"%s\" AS SELECT * FROM read_parquet('%s')" % (TABLE, db_path))
    elif EXT == ".feather":
        try:
            con.execute("CREATE TABLE \"%s\" AS SELECT * FROM read_feather('%s')" % (TABLE, db_path))
        except Exception:
            # newer duckdb renamed the path-based arrow reader…
            try:
                con.execute("CREATE TABLE \"%s\" AS SELECT * FROM read_ipc('%s')" % (TABLE, db_path))
            except Exception:
                # …and duckdb 2.x dropped it entirely — read the IPC file
                # with pyarrow and REGISTER the arrow table (replacement
                # scan) under the same name.
                try:
                    import pyarrow.feather as pf
                except ImportError:
                    raise Exception("reading .feather needs pyarrow — pip install pyarrow")
                con.register(TABLE, pf.read_table(db_path))
    else:
        # csv — read_csv_auto sniffs the delimiter / quoting / types
        con.execute("CREATE TABLE \"%s\" AS SELECT * FROM read_csv_auto('%s')" % (TABLE, db_path))
    if mode == "schema":
        desc = con.execute("DESCRIBE SELECT * FROM \"%s\"" % TABLE).fetchall()
        preview = con.execute("SELECT * FROM \"%s\" LIMIT 5" % TABLE).fetchall()
        try:
            approx = con.execute("SELECT COUNT(*) FROM \"%s\"" % TABLE).fetchone()[0]
        except Exception:
            approx = None
        columns = []
        for i, d in enumerate(desc):
            sample = ""
            if preview and i < len(preview[0]):
                v = preview[0][i]
                sample = "" if v is None else str(v)[:80]
            columns.append({"name": str(d[0]), "type": str(d[1]), "sample": sample})
        emit({"ok": True, "table": TABLE, "columns": columns,
              "rowCountApprox": approx, "engine": "duckdb"})
    else:
        sql = sys.stdin.read()
        started = time.perf_counter()
        cur = con.execute(sql)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = cur.fetchmany(1001)
            total = len(rows)
            out = [[stringify(v) for v in r] for r in rows[:1000]]
            emit({"ok": True, "columns": cols, "rows": out,
                  # rows NOTICED before the cap — 1001 means "1000 shown,
                  # at least one more exists"
                  "totalNoticed": total,
                  "truncated": total > 1000,
                  "elapsedMs": int((time.perf_counter() - started) * 1000)})
        else:
            emit({"ok": True, "columns": [], "rows": [],
                  "elapsedMs": int((time.perf_counter() - started) * 1000)})
    con.close()
except Exception as e:
    emit({"ok": False, "error": str(e)})
`;

interface PyRun {
    code: number | null;
    stdout: string;
    stderr: string;
    spawnError: boolean;
    timedOut: boolean;
}

/** spawn + timeout + STDIN pipe (runPyOnce ignores stdin, so the query
 *  text needs this sibling helper — same shape as typecheck's runTool). */
function runPy(
    interpreter: string,
    args: string[],
    stdinText: string | null,
    timeoutMs: number
): Promise<PyRun> {
    return new Promise<PyRun>((resolve) => {
        const child = spawn(interpreter, args, {
            cwd: process.cwd(),
            env: {...process.env, PYTHONIOENCODING: "utf-8"},
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, timeoutMs);
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        if (child.stdin) {
            // user SQL flows through stdin — NEVER through argv / a shell
            child.stdin.on("error", () => { /* EPIPE — helper died early */
            });
            child.stdin.end(stdinText ?? "", "utf-8");
        }
        child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({code, stdout, stderr, spawnError: false, timedOut});
        });
        child.on("error", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({code: null, stdout, stderr, spawnError: true, timedOut: false});
        });
    });
}

/** Union of everything the Python helper can emit. */
type PyPayload =
    | {
    ok: true;
    table?: string;
    columns?: unknown;
    rowCountApprox?: number | null;
    engine?: string;
    rows?: unknown[][];
    totalNoticed?: number;
    truncated?: boolean;
    elapsedMs?: number;
}
    | { ok: false; error?: string; missing?: string; hint?: string };

async function resolveDataFile(params: { folder?: string; file?: string }) {
    const {folder, file} = params;
    if (!folder || !file) {
        return {error: NextResponse.json({error: "Missing 'folder' and 'file'."}, {status: 400})};
    }
    const folderName = deslugify(folder);
    if (!folderName) {
        return {error: NextResponse.json({error: "Invalid folder slug."}, {status: 400})};
    }
    const relFile = deslugify(file);
    if (
        !relFile ||
        relFile.includes("..") ||
        relFile.includes("\\") ||
        relFile.startsWith("/")
    ) {
        return {error: NextResponse.json({error: "Invalid file reference."}, {status: 400})};
    }
    const ext = path.extname(relFile).toLowerCase();
    if (!DATA_EXTS.has(ext)) {
        return {error: NextResponse.json({error: `Not an analytical file (${ext}).`}, {status: 400})};
    }
    const abs = path.join(getScriptsRoot(), folderName, relFile);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return {error: NextResponse.json({error: "Path traversal blocked."}, {status: 400})};
    }
    try {
        const stat = await fs.stat(/* turbopackIgnore: true */ abs);
        if (!stat.isFile()) throw new Error("not a file");
    } catch {
        return {error: NextResponse.json({error: "File not found."}, {status: 404})};
    }
    return {abs};
}

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const resolved = await resolveDataFile({
        folder: sp.get("folder") ?? undefined,
        file: sp.get("file") ?? undefined,
    });
    if (resolved.error) return resolved.error;
    // honor the SELECTED interpreter (same as /api/sqlite-query)
    const interpreter = await findInterpreter(sp.get("interpreter")?.trim() || undefined);
    const result = await runPy(interpreter, ["-c", DUCKDB_PY, "schema", resolved.abs], null, TIMEOUT_MS);
    if (result.spawnError) {
        return NextResponse.json({error: `Failed to launch Python: ${result.stderr}`}, {status: 500});
    }
    if (result.timedOut) {
        return NextResponse.json({error: "Schema inference timed out (60 s)."}, {status: 504});
    }
    const json = lastJsonLine<PyPayload>(result.stdout);
    if (!json) {
        return NextResponse.json({error: result.stderr || "No schema returned."}, {status: 500});
    }
    if (!json.ok) {
        // missing duckdb keeps its missing+hint pair for the install card
        return NextResponse.json(json, {status: 422});
    }
    return NextResponse.json(json);
}

export async function POST(request: NextRequest) {
    let body: { folder?: string; file?: string; sql?: string; interpreter?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const sql = (body.sql ?? "").trim();
    if (!sql) {
        return NextResponse.json({error: "Empty SQL statement."}, {status: 400});
    }
    const resolved = await resolveDataFile({folder: body.folder, file: body.file});
    if (resolved.error) return resolved.error;
    const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);
    // the user SQL rides stdin — argv stays fixed/non-user
    const result = await runPy(interpreter, ["-c", DUCKDB_PY, "query", resolved.abs], sql, TIMEOUT_MS);
    if (result.spawnError) {
        return NextResponse.json({error: `Failed to launch Python: ${result.stderr}`}, {status: 500});
    }
    if (result.timedOut) {
        return NextResponse.json({error: "Query timed out (60 s)."}, {status: 504});
    }
    const json = lastJsonLine<PyPayload>(result.stdout);
    if (!json) {
        return NextResponse.json({error: result.stderr || "No result returned."}, {status: 500});
    }
    if (!json.ok) {
        return NextResponse.json(json, {status: 422});
    }
    return NextResponse.json(json);
}
