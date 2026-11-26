import {NextRequest, NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * GET /api/data-sheet?folder=<slug>&name=<file>&sheet=<name>
 * GET /api/data-sheet?folder=<slug>&file=<slug>&sheet=<name>
 *
 * Tabular preview for BINARY spreadsheet formats that the browser
 * cannot render natively:.xlsx /.xls (via openpyxl),.parquet /
 *.feather (via pyarrow). The file is read by a short Python child
 * process (pandas) that prints a JSON document on stdout — the same
 * trust model as /api/run, but with a fixed, non-user script.
 *
 * The file is addressed EITHER by plain `name` (a file in the folder
 * root — the DataFileBrowser form) or by `file` (a base64url slug of
 * the file's relative path INSIDE the folder, including subfolders —
 * the FileViewer form; nested.xlsx/.parquet files open there too).
 *
 * Response: {
 * ok: true,
 * name, ext,
 * sheets: string[], // xlsx workbooks only (sheet names)
 * sheet: string, // the sheet actually read ("" for others)
 * columns: string[],
 * dtypes: string[],
 * rows: unknown[][], // first MAX_ROWS rows, JSON-safe values
 * totalRows: number, // full row count (may exceed MAX_ROWS)
 * engine: string, // "openpyxl" | "pyarrow" |...
 * } | { ok: false, error, hint? }
 *
 * The 404/400 semantics match /api/data-file (path traversal blocked,
 * missing files reported). Failures inside Python (missing pandas /
 * openpyxl / pyarrow) return 422 with a pip hint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;
const MAX_COLS = 200;
const TIMEOUT_MS = 30_000;

const SHEET_EXTS = new Set([".xlsx", ".xls", ".parquet", ".feather"]);

/** The fixed Python reader — NOT user code. Prints one JSON line. */
const READER_PY = String.raw`
import json, sys
import pandas as pd

path = sys.argv[1]
sheet = sys.argv[2] if len(sys.argv) > 2 else ""
ext = path.rsplit(".", 1)[-1].lower()

sheets = []
engine = ""
if ext in ("xlsx", "xls"):
    engine = "openpyxl"
    xls = pd.ExcelFile(path)
    sheets = xls.sheet_names
    if sheet and sheet in sheets:
        df = pd.read_excel(path, sheet_name=sheet)
    else:
        df = pd.read_excel(path, sheet_name=0)
        sheet = sheets[0] if sheets else ""
elif ext in ("parquet", "feather"):
    engine = "pyarrow"
    df = pd.read_parquet(path) if ext == "parquet" else pd.read_feather(path)
    sheet = ""
else:
    raise ValueError("unsupported extension: " + ext)

MAX_ROWS, MAX_COLS = int(sys.argv[3]), int(sys.argv[4])
total_cols = int(df.shape[1])
df = df.iloc[:, :MAX_COLS]
cols = [str(c) for c in df.columns]
dtypes = [str(t) for t in df.dtypes]

def clean(v):
    if v is None or v != v:  # None or NaN
        return None
    try:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        if v in (True, False):
            return v
        if isinstance(v, float) and v.is_integer():
            return v
    except Exception:
        pass
    try:
        json.dumps(v)
        return v
    except Exception:
        return str(v)

rows = [[clean(v) for v in row] for row in df.head(MAX_ROWS).itertuples(index=False, name=None)]
print(json.dumps({
    "ok": True,
    "sheets": sheets,
    "sheet": sheet,
    "engine": engine,
    "columns": cols,
    "dtypes": dtypes,
    "rows": rows,
    "totalRows": int(len(df)),
    # TRUE column count BEFORE the MAX_COLS slice — the grid editor
    # needs it to detect a truncated preview (writing a truncated
    # grid back would silently destroy the clipped columns).
    "totalCols": int(total_cols),
}))
`;

export async function GET(request: NextRequest) {
    const {searchParams} = new URL(request.url);
    const folderSlug = searchParams.get("folder") ?? "";
    const name = searchParams.get("name") ?? "";
    const fileSlug = searchParams.get("file") ?? "";
    const sheet = (searchParams.get("sheet") ?? "").slice(0, 200);
    // honor the interpreter the user SELECTED (Settings →
    // Python runtime) instead of always auto-picking one — parquet/
    // feather previews used to fail with "missing pandas" whenever
    // the selected env differed from the auto-detected one.
    const interpreterOverride = searchParams.get("interpreter")?.trim() || undefined;

    if (!folderSlug || (!name && !fileSlug)) {
        return NextResponse.json(
            {error: "Missing 'folder' and 'name'/'file' query parameters."},
            {status: 400}
        );
    }
    const folderName = deslugify(folderSlug);
    if (!folderName) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    // Resolve the target relative path: either the slug-encoded nested
    // path (preferred — FileViewer form) or the plain root file name.
    // Both forms are validated below by the same traversal guards.
    const relFile = fileSlug ? deslugify(fileSlug) : name;
    if (
        !relFile ||
        relFile.includes("..") ||
        relFile.includes("\\") ||
        relFile.startsWith("/") ||
        relFile.endsWith("/") ||
        // Plain-name form stays a single filename (original strictness);
        // the slug form legitimately carries "/" for nested files.
        (!fileSlug && name.includes("/"))
    ) {
        return NextResponse.json(
            {error: "Invalid file reference."},
            {status: 400}
        );
    }
    const ext = path.extname(relFile).toLowerCase();
    if (!SHEET_EXTS.has(ext)) {
        return NextResponse.json(
            {error: `Unsupported extension "${ext}" — expected xlsx/xls/parquet/feather.`},
            {status: 400}
        );
    }

    const abs = path.join(getScriptsRoot(), folderName, relFile);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) throw new Error("not a file");
    } catch {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    const interpreter = await findInterpreter(interpreterOverride);
    const result = await new Promise<{ ok: boolean; stdout: string; stderr: string }>(
        (resolve) => {
            let stdout = "";
            let stderr = "";
            let settled = false;
            const child = spawn(
                interpreter,
                ["-c", READER_PY, abs, sheet, String(MAX_ROWS), String(MAX_COLS)],
                {
                    cwd: path.dirname(abs),
                    env: {...process.env, PYTHONIOENCODING: "utf-8"},
                    stdio: ["ignore", "pipe", "pipe"],
                }
            );
            const timer = setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                } catch { /* already dead */
                }
            }, TIMEOUT_MS);
            child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
            child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
            child.on("close", () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ok: true, stdout, stderr});
            });
            child.on("error", (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ok: false, stdout: "", stderr: err.message});
            });
        }
    );

    if (!result.ok) {
        return NextResponse.json(
            {error: `Failed to launch Python: ${result.stderr}`},
            {status: 500}
        );
    }

    // The reader prints exactly one JSON line on stdout; anything else
    // on stdout is noise. Parse the LAST non-empty line.
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const jsonLine = lines[lines.length - 1];
    if (jsonLine) {
        try {
            const data = JSON.parse(jsonLine) as {
                ok: true;
                sheets: string[];
                sheet: string;
                engine: string;
                columns: string[];
                dtypes: string[];
                rows: unknown[][];
                totalRows: number;
            };
            return NextResponse.json({
                ...data,
                ok: true as const,
                name: relFile,
                ext,
            });
        } catch {
            /* fall through to the error path below */
        }
    }

    // Python failed — usually a missing optional dependency.
    const lower = result.stderr.toLowerCase();
    const missing =
        lower.includes("no module named 'openpyxl'") || lower.includes('no module named "openpyxl"')
            ? "openpyxl"
            : lower.includes("no module named 'pyarrow'") || lower.includes('no module named "pyarrow"')
                ? "pyarrow"
                : lower.includes("no module named 'pandas'") || lower.includes('no module named "pandas"')
                    ? "pandas"
                    : null;
    return NextResponse.json(
        {
            ok: false,
            error: missing
                ? `The Python environment is missing the "${missing}" package.`
                : result.stderr.trim().split("\n").slice(-3).join("\n") || "The file could not be read.",
            hint: missing ? `Install it once via Tools ▸ Dependency Manager (or pip install ${missing}) and reopen this preview.` : undefined,
            // `missing` (the bare package name) lets the CLIENT render the
            // one-click "Install X & retry" button without regexing the
            // message; `interpreter` says WHICH env was actually spawned so
            // the card can be honest about mismatches.
            ...(missing ? {missing} : {}),
            interpreter,
        },
        {status: 422}
    );
}
