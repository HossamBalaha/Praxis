import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * write an edited sheet back to disk — the save path of
 * the editable CSV/XLSX grid. POST { folder, file, columns, rows }.
 *
 *   .csv/.tsv  → plain text write (no Python needed, always available)
 *   .xlsx       → pandas.DataFrame.to_excel (openpyxl engine)
 *   .parquet    → to_parquet (pyarrow); .feather → to_feather
 *
 * Rows arrive as JSON-safe values (numbers, strings, booleans, nulls).
 * A pre-save snapshot is written by the CLIENT (it calls
 * /api/local-history/save before this route), so undo/restore works
 * like every other edit.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000;
const MAX_COLS = 500;
const TIMEOUT_MS = 60_000;

const WRITE_PY = String.raw`
import json, sys
import pandas as pd

target, fmt, payload_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(payload_path, "r", encoding="utf-8") as f:
    payload = json.load(f)
df = pd.DataFrame(payload["rows"], columns=payload["columns"])
for col in df.columns:
    df[col] = df[col].where(df[col].notna(), None)

if fmt == "xlsx":
    df.to_excel(target, index=False)
elif fmt == "parquet":
    df.to_parquet(target, index=False)
elif fmt == "feather":
    df.to_feather(target, index=False)
else:
    fail = None
print(json.dumps({"ok": True, "rows": len(df)}))
`;

export async function POST(request: NextRequest) {
    let body: {
        folder?: string;
        file?: string;
        columns?: string[];
        rows?: unknown[][];
        sep?: string;
        // The CONFIGURED interpreter (Settings ▸ Python runtime) — the
        // READ path (/api/data-sheet) honors it, so the WRITE must too or
        // the two can run in different environments (the user's
        // "in the loaded env, pandas is installed!!!" mismatch).
        interpreter?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file, columns, rows} = body;
    if (!folder || !file || !Array.isArray(columns) || !Array.isArray(rows)) {
        return NextResponse.json({error: "Missing folder, file, columns or rows."}, {status: 400});
    }
    if (columns.length === 0 || columns.length > MAX_COLS) {
        return NextResponse.json({error: `Column count out of range (1-${MAX_COLS}).`}, {status: 400});
    }
    if (rows.length > MAX_ROWS) {
        return NextResponse.json({error: `Too many rows (max ${MAX_ROWS}).`}, {status: 400});
    }
    if (rows.some((r) => !Array.isArray(r) || r.length !== columns.length)) {
        return NextResponse.json({error: "Every row must match the column count."}, {status: 400});
    }

    const folderName = deslugify(folder);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const relFile = deslugify(file);
    if (
        !relFile ||
        relFile.includes("..") ||
        relFile.includes("\\") ||
        relFile.startsWith("/")
    ) {
        return NextResponse.json({error: "Invalid file reference."}, {status: 400});
    }
    const ext = path.extname(relFile).toLowerCase();
    const abs = path.join(getScriptsRoot(), folderName, relFile);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const st = await fs.stat(/* turbopackIgnore: true */ abs);
        if (!st.isFile()) throw new Error("not a file");
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    // CSV / TSV: direct text write — deterministic, no Python required.
    if (ext === ".csv" || ext === ".tsv") {
        const sep = ext === ".tsv" ? "\t" : ",";
        const esc = (v: unknown): string => {
            const s = v === null || v === undefined ? "" : String(v);
            return s.includes(sep) || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };
        const lines = [columns.map(esc).join(sep)];
        for (const row of rows) lines.push(row.map(esc).join(sep));
        await fs.writeFile(abs, `${lines.join("\n")}\n`, "utf-8");
        return NextResponse.json({ok: true, rows: rows.length, engine: "text"});
    }

    if (![".xlsx", ".parquet", ".feather"].includes(ext)) {
        return NextResponse.json({error: `Cannot write ${ext} files.`}, {status: 400});
    }

    // Binary formats: DataFrame write via the fixed Python snippet.
    const tmpDir = await fs.mkdtemp("praxis-sheet-write-");
    const payloadPath = path.join(tmpDir, "payload.json");
    try {
        await fs.writeFile(payloadPath, JSON.stringify({columns, rows}), "utf-8");
        // Honor the configured interpreter like the read path does.
        const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);
        const result = await runPyOnce(
            interpreter,
            ["-c", WRITE_PY, abs, ext.slice(1), payloadPath],
            {timeoutMs: TIMEOUT_MS}
        );
        if (!result.ok) {
            return NextResponse.json(
                {error: `Failed to launch Python: ${result.stderr}`},
                {status: 500}
            );
        }
        const json = lastJsonLine<{ ok: boolean; rows?: number }>(result.stdout);
        if (!json || !json.ok) {
            const hint = /pandas|openpyxl|pyarrow/.test(result.stderr)
                ? "Install the missing package first (pip install pandas openpyxl pyarrow)."
                : undefined;
            return NextResponse.json(
                {error: result.stderr || "Sheet write failed.", hint},
                {status: 422}
            );
        }
        return NextResponse.json({ok: true, rows: json.rows, engine: ext.slice(1)});
    } finally {
        fs.rm(tmpDir, {recursive: true, force: true}).catch(() => undefined);
    }
}
