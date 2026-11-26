import {NextRequest, NextResponse} from "next/server";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * server-side format conversion —
 * JSON ⇄ YAML ⇄ CSV ⇄ TOML. POST { content, from, to }.
 *
 * from/to ∈ json | yaml | csv | toml. Conversion runs through a FIXED
 * Python snippet (stdlib json + csv + tomllib/toml; YAML via PyYAML
 * when installed). Output { ok, output } or { ok:false, error } with
 * the parser's message + line when available — the Toolbox surfaces
 * it inline.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMS = new Set(["json", "yaml", "csv", "toml"]);
const TIMEOUT_MS = 15_000;
const MAX_INPUT = 2_000_000; // 2 MB of text — tool-sized inputs

const CONVERT_PY = String.raw`
import json, sys, io, csv, tempfile, os

src_fmt, dst_fmt, src_path = sys.argv[1], sys.argv[2], sys.argv[3]

def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)

with open(src_path, "r", encoding="utf-8") as f:
    text = f.read()

def loads(fmt, text):
    if fmt == "json":
        return json.loads(text)
    if fmt == "yaml":
        import yaml
        return yaml.safe_load(text)
    if fmt == "toml":
        try:
            import tomllib
            return tomllib.loads(text)
        except ImportError:
            import toml
            return toml.loads(text)
    if fmt == "csv":
        rows = list(csv.reader(io.StringIO(text)))
        if not rows:
            return []
        header = rows[0]
        out = []
        for r in rows[1:]:
            if not r:
                continue
            out.append({header[i] if i < len(header) else "col%d" % i: v for i, v in enumerate(r)})
        return out
    fail("bad source format " + fmt)

def dumps(fmt, data):
    if fmt == "json":
        return json.dumps(data, indent=2, ensure_ascii=False, default=str)
    if fmt == "yaml":
        import yaml
        return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    if fmt == "toml":
        try:
            import toml
            return toml.dumps(data)
        except ImportError:
            fail("Writing TOML needs the 'toml' package (pip install toml).")
    if fmt == "csv":
        if isinstance(data, list) and data and isinstance(data[0], dict):
            keys = []
            for d in data:
                for k in d:
                    if k not in keys:
                        keys.append(k)
            buf = io.StringIO(newline="\n")
            w = csv.DictWriter(buf, fieldnames=keys, restval="", lineterminator="\n")
            w.writeheader()
            for d in data:
                w.writerow({k: ("" if v is None else v) for k, v in d.items()})
            return buf.getvalue()
        fail("CSV output needs a list of objects (convert from JSON/YAML/TOML arrays).")
    fail("bad target format " + fmt)

try:
    data = loads(src_fmt, text)
    if src_fmt == "csv" and dst_fmt in ("csv",):
        fail("CSV to CSV is a no-op.")
    if src_fmt == dst_fmt:
        out = text if src_fmt == "csv" else dumps(dst_fmt, data)
    else:
        out = dumps(dst_fmt, data)
    print(json.dumps({"ok": True, "output": out}))
except Exception as e:
    fail("%s: %s" % (type(e).__name__, e))
`;

export async function POST(request: NextRequest) {
    let body: { content?: string; from?: string; to?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {content, from, to} = body;
    if (typeof content !== "string") {
        return NextResponse.json({error: "Missing 'content'."}, {status: 400});
    }
    if (content.length > MAX_INPUT) {
        return NextResponse.json({error: "Input too large (2 MB limit)."}, {status: 413});
    }
    if (!from || !to || !FORMS.has(from) || !FORMS.has(to)) {
        return NextResponse.json(
            {error: "'from'/'to' must each be one of: json, yaml, csv, toml."},
            {status: 400}
        );
    }

    // Write the input to a temp file — avoids any quoting/escaping issues.
    const tmp = await import("node:fs/promises").then((fs) =>
        fs.mkdtemp("praxis-convert-")
    );
    const srcPath = `${tmp}/input.${from}`;
    const nodeFs = await import("node:fs/promises");
    try {
        await nodeFs.writeFile(srcPath, content, "utf-8");
        const interpreter = await findInterpreter();
        const result = await runPyOnce(interpreter, ["-c", CONVERT_PY, from, to, srcPath], {
            timeoutMs: TIMEOUT_MS,
        });
        if (!result.ok) {
            return NextResponse.json(
                {error: `Failed to launch Python: ${result.stderr}`},
                {status: 500}
            );
        }
        const json = lastJsonLine<{ ok: boolean; output?: string; error?: string }>(result.stdout);
        if (!json) {
            return NextResponse.json(
                {error: result.stderr || "Conversion produced no output."},
                {status: 422}
            );
        }
        if (!json.ok) {
            return NextResponse.json({error: json.error ?? "Conversion failed."}, {status: 422});
        }
        return NextResponse.json({ok: true, output: json.output});
    } finally {
        nodeFs.rm(tmp, {recursive: true, force: true}).catch(() => undefined);
    }
}
