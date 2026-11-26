import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * SQLite SQL workbench.
 *
 * GET  /api/sqlite-query?folder=<slug>&file=<slug>  → schema (tables,
 *      columns, types, row counts + the per-table INDEX list) for the
 *      database file.
 * POST /api/sqlite-query { folder, file, sql, write? }  → run one SQL
 *      statement. Read-only by default: the database opens in SQLite
 *      readonly URI mode so the workbench can never mutate the file
 *      — no UPDATE/INSERT/DELETE side effects even if typed; writes
 *      fail with the Python error verbatim.
 *
 *  `write: true` (Section 6,opens the database WITHOUT
 *      mode=ro so INSERT / UPDATE / DELETE / CREATE TABLE / ALTER /
 *      DROP execute for real. The workbench UI keeps the toggle OFF
 *      by default (persisted per-browser) and labels the danger.
 *
 * Result rows are capped (500) and the statement is killed after
 * TIMEOUT_MS. Same path/traversal guards as /api/data-sheet.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;
const TIMEOUT_MS = 15_000;

const DB_EXTS = new Set([".db", ".sqlite", ".sqlite3", ".db3"]);

/** Schema + query runner — a FIXED, non-user Python snippet. */
const SQL_PY = String.raw`
import json, sys, sqlite3

mode = sys.argv[1]          # "schema" | "query" | "query-write"
dbPath = sys.argv[2]
sql = sys.argv[3] if len(sys.argv) > 3 else ""
# READ-ONLY default: the URI mode=ro flag makes SQLite refuse every
# write at the C level (the guard the workbench relies on). Only the
# explicit "query-write" mode — sent when the user turned the Write
# toggle ON — drops the flag.
if mode == "query-write":
    uri = "file:" + dbPath.replace("?", "%3f").replace("#", "%23")
else:
    uri = "file:" + dbPath.replace("?", "%3f").replace("#", "%23") + "?mode=ro"

def emit(obj):
    print(json.dumps(obj, default=str))

try:
    con = sqlite3.connect(uri, uri=True, timeout=5)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    if mode == "schema":
        tables = []
        rows = cur.execute(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name"
        ).fetchall()
        for r in rows:
            name, typ = r["name"], r["type"]
            cols = []
            for c in cur.execute('PRAGMA table_info("%s")' % name).fetchall():
                cols.append({"name": c["name"], "type": c["type"] or "?", "pk": bool(c["pk"])})
            try:
                count = cur.execute('SELECT COUNT(*) FROM "%s"' % name).fetchone()[0]
            except Exception:
                count = None
            fks = []
            try:
                for f in cur.execute('PRAGMA foreign_key_list("%s")' % name).fetchall():
                    fks.append({"from": f["from"], "table": f["table"], "to": f["to"]})
            except Exception:
                pass
            tables.append({"name": name, "type": typ, "columns": cols, "rows": count, "fks": fks})
 # ── INDEXES (Section 6, task 2d): PRAGMA index_list per table
        #    (covers explicit indexes AND the implicit unique/pk
        #    autoindexes sqlite creates for constraints) plus
        #    index_info for the covered columns of each.
        indexes = []
        for t in tables:
            tname = t["name"]
            try:
                ils = cur.execute('PRAGMA index_list("%s")' % tname).fetchall()
            except Exception:
                continue
            for il in ils:
                info = {
                    "name": il["name"],
                    "table": tname,
                    "unique": bool(il["unique"]),
                    # origin: c = CREATE INDEX, u = UNIQUE constraint,
                    #         pk = PRIMARY KEY (implicit index)
                    "origin": il["origin"] if "origin" in il.keys() else "c",
                    "partial": bool(il["partial"]) if "partial" in il.keys() else False,
                    "columns": [],
                }
                try:
                    for c in cur.execute('PRAGMA index_info("%s")' % il["name"]).fetchall():
                        if c["name"] is not None:
                            info["columns"].append(c["name"])
                except Exception:
                    pass
                indexes.append(info)
        emit({"ok": True, "tables": tables, "indexes": indexes})
    else:
        cur.execute(sql)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = []
            for row in cur.fetchmany(501):
                rows.append(list(row))
            emit({"ok": True, "columns": cols, "rows": rows[:500], "truncated": len(rows) > 500})
        else:
            con.commit()
            emit({"ok": True, "columns": [], "rows": [], "changes": cur.rowcount})
    con.close()
except sqlite3.Error as e:
    emit({"ok": False, "error": str(e)})
except Exception as e:
    emit({"ok": False, "error": str(e)})
`;

async function resolveDb(params: { folder?: string; file?: string }) {
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
    if (!DB_EXTS.has(ext)) {
        return {error: NextResponse.json({error: `Not a SQLite file (${ext}).`}, {status: 400})};
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
    const resolved = await resolveDb({
        folder: sp.get("folder") ?? undefined,
        file: sp.get("file") ?? undefined,
    });
    if (resolved.error) return resolved.error;
    // honor the SELECTED interpreter (same fix as
    // /api/data-sheet).
    const interpreter = await findInterpreter(sp.get("interpreter")?.trim() || undefined);
    const result = await runPyOnce(interpreter, ["-c", SQL_PY, "schema", resolved.abs], {
        timeoutMs: TIMEOUT_MS,
    });
    if (!result.ok) {
        return NextResponse.json({error: `Failed to launch Python: ${result.stderr}`}, {status: 500});
    }
    const json = lastJsonLine<{ ok: boolean; error?: string; tables?: unknown; indexes?: unknown }>(
        result.stdout
    );
    if (!json) {
        return NextResponse.json({error: result.stderr || "No schema returned."}, {status: 500});
    }
    if (!json.ok) {
        return NextResponse.json({error: json.error ?? "Schema read failed."}, {status: 422});
    }
    return NextResponse.json(json);
}

export async function POST(request: NextRequest) {
    let body: { folder?: string; file?: string; sql?: string; write?: boolean; interpreter?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const sql = (body.sql ?? "").trim();
    if (!sql) {
        return NextResponse.json({error: "Empty SQL statement."}, {status: 400});
    }
    const resolved = await resolveDb({folder: body.folder, file: body.file});
    if (resolved.error) return resolved.error;
    // WRITE MODE only the explicit, UI-gated `write: true`
    // runs without mode=ro; everything else keeps the readonly URI and
    // SQLite itself refuses mutations.
    const mode = body.write === true ? "query-write" : "query";
    const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);
    const result = await runPyOnce(interpreter, ["-c", SQL_PY, mode, resolved.abs, sql], {
        timeoutMs: TIMEOUT_MS,
    });
    if (!result.ok) {
        return NextResponse.json({error: `Failed to launch Python: ${result.stderr}`}, {status: 500});
    }
    if (result.timedOut) {
        return NextResponse.json({error: "Query timed out (15 s)."}, {status: 504});
    }
    const json = lastJsonLine<{
        ok: boolean;
        error?: string;
        columns?: string[];
        rows?: unknown[][];
        truncated?: boolean;
        changes?: number;
    }>(result.stdout);
    if (!json) {
        return NextResponse.json({error: result.stderr || "No result returned."}, {status: 500});
    }
    if (!json.ok) {
        return NextResponse.json({error: json.error ?? "Query failed."}, {status: 422});
    }
    return NextResponse.json({...json, maxRows: MAX_ROWS});
}
