import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {deslugify, getScriptsRoot, resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * GET /api/ast?folder=<slug>&file=<slug>[&code=<source override>]
 *
 * Parses the requested Python file (or the `code` override — the
 * unsaved editor buffer) into a NESTED AST tree the UI can render
 * as an outline. Python side: ast.parse with end positions, an
 * ast.dump-style field annotation, short human labels ("def main",
 * "Assign: x"). Node count is capped (MAX_NODES) with
 * truncated=true so a pathological file cannot balloon the JSON.
 *
 * Errors (syntax problems, oversized files) come back as
 * { ok: false, error } with HTTP 200 — the UI renders them inline.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;
/** Hard source cap — files beyond this are refused (see MAX_CODE_BYTES). */
const MAX_CODE_BYTES = 1_000_000;
/** Guard against runaway JSON even though the node cap bounds it. */
const MAX_OUTPUT_BYTES = 10_000_000;

/** AST builder — a FIXED, non-user Python snippet (same trust model
 *  as /api/sqlite-query). argv: [source path, display file name]. */
const AST_PY = String.raw`
import ast, json, os, sys

MAX_NODES = 20000
MAX_STR = 100

def emit(obj):
    print(json.dumps(obj))

def fail(msg):
    emit({"ok": False, "error": msg})
    sys.exit(0)

def clip(s):
    s = str(s)
    return s if len(s) <= MAX_STR else s[: MAX_STR - 1] + "\u2026"

def short_target(t):
    if isinstance(t, ast.Name):
        return t.id
    if isinstance(t, ast.Attribute):
        return short_target(t.value) + "." + t.attr
    if isinstance(t, ast.Subscript):
        return short_target(t.value) + "[\u2026]"
    if isinstance(t, ast.Starred):
        return "*" + short_target(t.value)
    if isinstance(t, (ast.Tuple, ast.List)):
        head = ", ".join(short_target(e) for e in t.elts[:3])
        return head + (", \u2026" if len(t.elts) > 3 else "")
    return type(t).__name__

def label_of(node, depth=0):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return "def " + node.name
    if isinstance(node, ast.ClassDef):
        return "class " + node.name
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Constant):
        return clip(repr(node.value))
    if isinstance(node, ast.Attribute) and depth < 3:
        return label_of(node.value, depth + 1) + "." + node.attr
    if isinstance(node, ast.Assign):
        return "Assign: " + ", ".join(short_target(t) for t in node.targets)
    if isinstance(node, ast.AnnAssign):
        return "AnnAssign: " + short_target(node.target)
    if isinstance(node, ast.AugAssign):
        return "AugAssign: " + short_target(node.target)
    if isinstance(node, ast.Call) and depth < 3:
        return "Call: " + label_of(node.func, depth + 1)
    if isinstance(node, ast.Import):
        parts = []
        for a in node.names:
            parts.append(a.name + ("" if not a.asname else " as " + a.asname))
        return "import " + ", ".join(parts)
    if isinstance(node, ast.ImportFrom):
        return "from " + "." * node.level + (node.module or "") + " import \u2026"
    if isinstance(node, (ast.For, ast.AsyncFor)):
        return "for " + short_target(node.target) + " in \u2026"
    if isinstance(node, ast.arg):
        return node.arg
    if isinstance(node, ast.Lambda):
        return "lambda"
    if isinstance(node, ast.Return):
        return "return"
    return type(node).__name__

def field_repr(v):
    # ast.dump-style field rendering, clipped so one giant string
    # constant cannot dominate the JSON payload.
    if v is None:
        return "None"
    if isinstance(v, ast.AST):
        return type(v).__name__
    if isinstance(v, (list, tuple)):
        if not len(v):
            return "[]"
        return "%d item%s" % (len(v), "s" if len(v) != 1 else "")
    if isinstance(v, bool):
        return str(v)
    return clip(repr(v))

node_count = 0
truncated = False

def conv(node, depth):
    global node_count, truncated
    if node_count >= MAX_NODES:
        truncated = True
        return None
    node_count += 1
    children = []
    for ch in ast.iter_child_nodes(node):
        c = conv(ch, depth + 1)
        if c is not None:
            children.append(c)
    attrs = {}
    for f in node._fields:
        try:
            v = getattr(node, f)
        except AttributeError:
            continue
        # Optional fields that are None are noise (only Constant.value
        # is meaningful when None).
        if v is None and not isinstance(node, ast.Constant):
            continue
        attrs[f] = field_repr(v)
    return {
        "kind": type(node).__name__,
        "label": clip(label_of(node)),
        "line": int(getattr(node, "lineno", 0) or 0),
        "col": int(getattr(node, "col_offset", 0) or 0),
        "endLine": int(getattr(node, "end_lineno", 0) or 0),
        "endCol": int(getattr(node, "end_col_offset", 0) or 0),
        "depth": depth,
        "attrs": attrs,
        "children": children,
    }

src = sys.argv[1]
display = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(src)
try:
    with open(src, "r", encoding="utf-8") as f:
        source = f.read()
except Exception as e:
    fail("Could not read source: %s" % e)
try:
    tree = ast.parse(source)
except SyntaxError as e:
    fail("SyntaxError: %s (line %s, col %s)" % (e.msg, e.lineno, e.offset))
except Exception as e:
    fail("Parse failed: %s" % e)
# end positions require Python 3.8+
if tree.body and not hasattr(tree.body[0], "end_lineno"):
    fail("Python 3.8+ is required for AST end positions.")
root = conv(tree, 0)
emit({
    "ok": True,
    "fileName": display,
    "nodes": [root] if root is not None else [],
    "truncated": truncated,
})
`;

/** Shape of one nested AST node (mirrors the Python emitter). */
interface AstNode {
    kind: string;
    label: string;
    line: number;
    col: number;
    endLine: number;
    endCol: number;
    depth: number;
    attrs: Record<string, string>;
    children: AstNode[];
}

interface AstJson {
    ok: boolean;
    error?: string;
    fileName?: string;
    nodes?: AstNode[];
    truncated?: boolean;
}

/** Resolve folder+file slugs to an absolute source path. With a
 *  `code` override the file may be a not-yet-saved buffer, so a
 *  virtual path inside the scripts root is accepted (lint does the
 *  same for live buffers). Returns the display name too. */
async function resolveSource(
    folderSlug: string,
    fileSlug: string,
    hasCode: boolean
): Promise<
    | { ok: true; absPath: string; fileName: string }
    | { ok: false; response: NextResponse }
> {
    const resolved = await resolveScriptPath(folderSlug, fileSlug);
    if (resolved) {
        // Oversized guard before spawning Python.
        try {
            const stat = await fs.stat(resolved.absPath);
            if (stat.size > MAX_CODE_BYTES) {
                return {
                    ok: false,
                    response: NextResponse.json(
                        {ok: false, error: "File is over 1 MB — too large for AST analysis."},
                        {status: 200}
                    ),
                };
            }
        } catch {
            return {
                ok: false,
                response: NextResponse.json({error: "File not found."}, {status: 404}),
            };
        }
        return {ok: true, absPath: resolved.absPath, fileName: resolved.fileName};
    }
    if (!hasCode) {
        return {
            ok: false,
            response: NextResponse.json({error: "File not found."}, {status: 404}),
        };
    }
    // Virtual (unsaved buffer) path: same guards as /api/file — the
    // deslugified names must stay inside the scripts root.
    const folderName = deslugify(folderSlug);
    const fileName = deslugify(fileSlug);
    if (
        !folderName ||
        !fileName ||
        folderName.includes("..") ||
        folderName.includes("/") ||
        folderName.includes("\\") ||
        fileName.includes("..") ||
        fileName.includes("\\") ||
        fileName.startsWith("/")
    ) {
        return {
            ok: false,
            response: NextResponse.json(
                {error: "Invalid folder or file slug."},
                {status: 400}
            ),
        };
    }
    if (!fileName.toLowerCase().endsWith(".py")) {
        return {
            ok: false,
            response: NextResponse.json(
                {error: "Not a Python file."},
                {status: 400}
            ),
        };
    }
    const abs = path.join(getScriptsRoot(), folderName, fileName);
    const rel = path.relative(getScriptsRoot(), abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return {
            ok: false,
            response: NextResponse.json(
                {error: "Path traversal blocked."},
                {status: 400}
            ),
        };
    }
    return {ok: true, absPath: abs, fileName};
}

export async function GET(request: Request) {
    const {searchParams} = new URL(request.url);
    const folder = searchParams.get("folder");
    const file = searchParams.get("file");
    const code = searchParams.get("code");
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Missing 'folder' or 'file' query parameter."},
            {status: 400}
        );
    }
    if (code && code.length > MAX_CODE_BYTES) {
        return NextResponse.json(
            {error: "code parameter exceeds 1 MB."},
            {status: 400}
        );
    }

    const resolved = await resolveSource(folder, file, code !== null);
    if (!resolved.ok) return resolved.response;

    const interpreter = await findInterpreter(
        searchParams.get("interpreter")?.trim() || undefined
    );

    // With a code override the source goes through a temp file (never
    // inline argv — the 100 KB / 28 KB argv budgets would truncate it).
    let srcPath = resolved.absPath;
    let cleanupDir: string | null = null;
    if (code !== null) {
        try {
            cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), "praxis-ast-"));
            srcPath = path.join(cleanupDir, "buffer.py");
            await fs.writeFile(srcPath, code, "utf-8");
        } catch {
            if (cleanupDir) await fs.rm(cleanupDir, {recursive: true, force: true});
            return NextResponse.json(
                {error: "Failed to stage the source buffer."},
                {status: 500}
            );
        }
    }

    try {
        const result = await runPyOnce(
            interpreter,
            ["-c", AST_PY, srcPath, resolved.fileName],
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
                {error: "AST analysis timed out (60 s)."},
                {status: 504}
            );
        }
        if (result.stdout.length > MAX_OUTPUT_BYTES) {
            return NextResponse.json(
                {error: "AST output exceeded the size cap."},
                {status: 500}
            );
        }
        const json = lastJsonLine<AstJson>(result.stdout);
        if (!json) {
            return NextResponse.json(
                {error: result.stderr || "No AST returned."},
                {status: 500}
            );
        }
        return NextResponse.json(json);
    } finally {
        if (cleanupDir) {
            await fs.rm(cleanupDir, {recursive: true, force: true});
        }
    }
}
