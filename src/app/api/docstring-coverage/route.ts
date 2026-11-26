import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {getScriptsRoot, safeFolderName} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * GET /api/docstring-coverage?folder=<slug>
 *
 * Docstring coverage report across EVERY .py file in the workspace
 * folder (recursive; dot-dirs / node_modules / __pycache__ pruned,
 * same skip rules the folder walkers use). One Python invocation
 * walks + parses the whole folder (the same one-spawn approach as
 * /api/folder-lint).
 *
 * "Documented" = a public function / method / class whose docstring
 * is present and non-empty. _private and __dunder__ names are
 * skipped; lambdas have no docstrings and are never visited.
 *
 * Response:
 * { ok, files: [{ file, total, documented, pct, missing: [{ name, kind, line }] }],
 *   overall: { total, documented, pct } }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;

/** Coverage walker — a FIXED, non-user Python snippet.
 *  argv: [folder dir]. */
const DOCSTRING_PY = String.raw`
import ast, json, os, sys

MAX_FILES = 500
MAX_MISSING = 500

def emit(obj):
    print(json.dumps(obj))

def fail(msg):
    emit({"ok": False, "error": msg})
    sys.exit(0)

folder_dir = sys.argv[1]

def py_files(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        # prune the same noise dirs every other walker skips
        dirnames[:] = [d for d in sorted(dirnames)
                       if not d.startswith(".") and d != "node_modules"
                       and d != "__pycache__"]
        for fn in sorted(filenames):
            if fn.endswith(".py"):
                out.append(os.path.join(dirpath, fn))
                if len(out) >= MAX_FILES:
                    return out
    return out

files_out = []
total_all = 0
documented_all = 0

try:
    paths = py_files(folder_dir)
except Exception as e:
    fail("Could not walk the folder: %s" % e)

for p in paths:
    rel = os.path.relpath(p, folder_dir).replace(os.sep, "/")
    try:
        with open(p, "r", encoding="utf-8") as f:
            src = f.read()
        tree = ast.parse(src)
    except Exception as e:
        # Unreadable / unparseable files surface with an error marker
        # so they are visible instead of silently absent.
        files_out.append({
            "file": rel,
            "total": 0,
            "documented": 0,
            "pct": 0,
            "missing": [],
            "error": str(e),
        })
        continue

    total = 0
    documented = 0
    missing = []

    def handle(n, kind):
        global total, documented
        nm = n.name
        if nm.startswith("_"):
            # _private and __dunder__ are skipped by definition
            return
        total += 1
        ds = ast.get_docstring(n)
        if ds is not None and ds.strip():
            documented += 1
        elif len(missing) < MAX_MISSING:
            missing.append({"name": nm, "kind": kind, "line": n.lineno})

    def walk_defs(node, in_class):
        for ch in ast.iter_child_nodes(node):
            if isinstance(ch, (ast.FunctionDef, ast.AsyncFunctionDef)):
                handle(ch, "method" if in_class else "function")
                # defs nested inside are plain functions, not methods
                walk_defs(ch, False)
            elif isinstance(ch, ast.ClassDef):
                handle(ch, "class")
                walk_defs(ch, True)
            else:
                # lambdas have no docstring and are never visited
                walk_defs(ch, in_class)

    walk_defs(tree, False)
    total_all += total
    documented_all += documented
    files_out.append({
        "file": rel,
        "total": total,
        "documented": documented,
        "pct": round(100.0 * documented / total) if total else 100,
        "missing": missing,
    })

overall_pct = round(100.0 * documented_all / total_all) if total_all else 100
emit({
    "ok": True,
    "files": files_out,
    "overall": {"total": total_all, "documented": documented_all, "pct": overall_pct},
})
`;

interface MissingEntry {
    name: string;
    kind: string;
    line: number;
}

interface FileCoverage {
    file: string;
    total: number;
    documented: number;
    pct: number;
    missing: MissingEntry[];
    error?: string;
}

interface CoverageJson {
    ok: boolean;
    error?: string;
    files?: FileCoverage[];
    overall?: { total: number; documented: number; pct: number };
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folder = searchParams.get("folder");
    if (!folder) {
        return NextResponse.json(
            {error: "Missing 'folder' query parameter."},
            {status: 400}
        );
    }
    // safeFolderName rejects separators / ".." / dot-names and
    // re-verifies containment inside the scripts root.
    const folderName = safeFolderName(folder);
    if (!folderName) {
        return NextResponse.json(
            {error: "Invalid folder slug."},
            {status: 400}
        );
    }
    const folderDir = path.join(getScriptsRoot(), folderName);
    try {
        const stat = await fs.stat(folderDir);
        if (!stat.isDirectory()) {
            return NextResponse.json(
                {error: "Folder not found."},
                {status: 404}
            );
        }
    } catch {
        return NextResponse.json({error: "Folder not found."}, {status: 404});
    }

    const interpreter = await findInterpreter(
        searchParams.get("interpreter")?.trim() || undefined
    );

    const result = await runPyOnce(
        interpreter,
        ["-c", DOCSTRING_PY, folderDir],
        {timeoutMs: TIMEOUT_MS}
    );
    if (!result.ok) {
        return NextResponse.json(
            {error: `Failed to launch Python: ${result.stderr}`},
            {status: 500}
        );
    }
    if (result.timedOut) {
        return NextResponse.json(
            {error: "Coverage scan timed out (60 s)."},
            {status: 504}
        );
    }
    const json = lastJsonLine<CoverageJson>(result.stdout);
    if (!json) {
        return NextResponse.json(
            {error: result.stderr || "No coverage report returned."},
            {status: 500}
        );
    }
    return NextResponse.json(json);
}
