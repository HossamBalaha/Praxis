import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {deslugify, getScriptsRoot, resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * GET /api/disasm?folder=<slug>&file=<slug>[&symbol=<name>]
 *        [&code=<source override>][&compareCode=<second source>]
 *
 * Bytecode workbench: compiles the source (or the code override)
 * with compile(code, "<praxis>", "exec") and disassembles it via
 * dis.get_instructions. With `symbol`, only that function's code
 * object is disassembled (found by walking co_consts). With
 * `compareCode`, a second disassembly is produced and an
 * offset-by-offset diff array is attached (`before` holds the
 * original instruction text, `changed` marks mismatches).
 *
 * Bytecode rows are capped (5000) — `truncated: true` signals the
 * cap. Errors come back as { ok: false, error } with HTTP 200.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;
const MAX_CODE_BYTES = 1_000_000;
const MAX_OUTPUT_BYTES = 10_000_000;

/** Disassembler — a FIXED, non-user Python snippet.
 *  argv: [source path, display name, symbol, compare path]. */
const DISASM_PY = String.raw`
import dis, json, os, sys, types

MAX_ROWS = 5000
MAX_LINES = 20000

def emit(obj):
    print(json.dumps(obj))

def fail(msg):
    emit({"ok": False, "error": msg})
    sys.exit(0)

src_path = sys.argv[1]
display = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(src_path)
symbol = sys.argv[3] if len(sys.argv) > 3 else ""
cmp_path = sys.argv[4] if len(sys.argv) > 4 else ""

def read_source(p, what):
    try:
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        fail("Could not read %s: %s" % (what, e))

source = read_source(src_path, "source")

# Source rows: every line with its 1-based number, capped.
all_lines = source.splitlines()
source_rows = []
for i, line in enumerate(all_lines[:MAX_LINES]):
    source_rows.append({"line": i + 1, "text": line})
src_truncated = len(all_lines) > MAX_LINES

def compile_source(src, what):
    try:
        return compile(src, "<praxis>", "exec")
    except SyntaxError as e:
        fail("SyntaxError in %s: %s (line %s, col %s)" % (what, e.msg, e.lineno, e.offset))
    except Exception as e:
        fail("Could not compile %s: %s" % (what, e))

def find_code(co, name):
    # Walk co_consts recursively to find the code object for "name"
    # (module-level functions, methods, nested functions alike).
    if co.co_name == name:
        return co
    for c in co.co_consts:
        if isinstance(c, types.CodeType):
            found = find_code(c, name)
            if found is not None:
                return found
    return None

def dis_rows(co):
    out = []
    truncated = False
    for ins in dis.get_instructions(co):
        if len(out) >= MAX_ROWS:
            truncated = True
            break
        # Python 3.13+ may expose line_number instead of starts_line.
        starts = getattr(ins, "starts_line", None)
        if starts is None:
            starts = getattr(ins, "line_number", None)
        out.append({
            "offset": ins.offset,
            "line": starts,
            "opname": ins.opname,
            "arg": ins.argrepr or "",
        })
    return out, truncated

code = compile_source(source, "source")
target = code
if symbol:
    target = find_code(code, symbol)
    if target is None:
        fail("Symbol %r not found in %s." % (symbol, display))
bytecode, bc_truncated = dis_rows(target)

out = {
    "ok": True,
    "fileName": display,
    "source": source_rows,
    "bytecode": bytecode,
}
if src_truncated or bc_truncated:
    out["truncated"] = True

def op_text(r):
    return (r["opname"] + " " + r["arg"]).strip()

if cmp_path:
    cmp_source = read_source(cmp_path, "compareCode")
    cmp_code = compile_source(cmp_source, "compareCode")
    cmp_target = cmp_code
    if symbol:
        cmp_target = find_code(cmp_code, symbol)
        if cmp_target is None:
            fail("Symbol %r not found in compareCode." % symbol)
    cmp_rows, cmp_truncated = dis_rows(cmp_target)
    if cmp_truncated:
        out["truncated"] = True
    # Diff keyed by the COMPARE side's offsets; before = the original
    # instruction text at the same offset (missing = added opcode).
    diff = []
    for i, b in enumerate(cmp_rows):
        before = op_text(bytecode[i]) if i < len(bytecode) else None
        changed = before is None or op_text(b) != before
        row = {
            "offset": b["offset"],
            "opname": b["opname"],
            "arg": b["arg"],
            "changed": bool(changed),
        }
        if before is not None:
            row["before"] = before
        diff.append(row)
    out["diff"] = diff

emit(out)
`;

interface SourceRow {
    line: number;
    text: string;
}

interface BytecodeRow {
    offset: number;
    line: number | null;
    opname: string;
    arg: string;
}

interface DiffRow {
    offset: number;
    opname: string;
    arg: string;
    changed: boolean;
    before?: string;
}

interface DisasmJson {
    ok: boolean;
    error?: string;
    fileName?: string;
    source?: SourceRow[];
    bytecode?: BytecodeRow[];
    diff?: DiffRow[];
    truncated?: boolean;
}

/** Same resolution contract as /api/ast — the code override allows
 *  analyzing an unsaved buffer via a virtual in-root path. */
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
        try {
            const stat = await fs.stat(resolved.absPath);
            if (stat.size > MAX_CODE_BYTES) {
                return {
                    ok: false,
                    response: NextResponse.json(
                        {ok: false, error: "File is over 1 MB — too large for disassembly."},
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
    const symbol = searchParams.get("symbol") ?? "";
    const code = searchParams.get("code");
    const compareCode = searchParams.get("compareCode");
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Missing 'folder' or 'file' query parameter."},
            {status: 400}
        );
    }
    if ((code && code.length > MAX_CODE_BYTES) ||
        (compareCode && compareCode.length > MAX_CODE_BYTES)) {
        return NextResponse.json(
            {error: "code/compareCode parameter exceeds 1 MB."},
            {status: 400}
        );
    }

    const resolved = await resolveSource(folder, file, code !== null);
    if (!resolved.ok) return resolved.response;

    const interpreter = await findInterpreter(
        searchParams.get("interpreter")?.trim() || undefined
    );

    // Buffer overrides are staged as temp files, never inline argv.
    let srcPath = resolved.absPath;
    let cmpPath = "";
    let cleanupDir: string | null = null;
    try {
        if (code !== null || compareCode !== null) {
            cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), "praxis-disasm-"));
            if (code !== null) {
                srcPath = path.join(cleanupDir, "buffer.py");
                await fs.writeFile(srcPath, code, "utf-8");
            }
            if (compareCode !== null) {
                cmpPath = path.join(cleanupDir, "compare.py");
                await fs.writeFile(cmpPath, compareCode, "utf-8");
            }
        }
    } catch {
        if (cleanupDir) await fs.rm(cleanupDir, {recursive: true, force: true});
        return NextResponse.json(
            {error: "Failed to stage the source buffer."},
            {status: 500}
        );
    }

    try {
        const result = await runPyOnce(
            interpreter,
            ["-c", DISASM_PY, srcPath, resolved.fileName, symbol, cmpPath],
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
                {error: "Disassembly timed out (60 s)."},
                {status: 504}
            );
        }
        if (result.stdout.length > MAX_OUTPUT_BYTES) {
            return NextResponse.json(
                {error: "Disassembly output exceeded the size cap."},
                {status: 500}
            );
        }
        const json = lastJsonLine<DisasmJson>(result.stdout);
        if (!json) {
            return NextResponse.json(
                {error: result.stderr || "No disassembly returned."},
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
