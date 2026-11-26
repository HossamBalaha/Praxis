import {NextRequest, NextResponse} from "next/server";
import {findInterpreter} from "@/lib/python-interpreter";
import {lastJsonLine, runPyOnce} from "@/lib/py-exec";

/**
 * config validation — POST { content, format }
 * format ∈ yaml | toml | ini | json
 *
 * Runs the content through the REAL parser (PyYAML / tomllib /
 * configparser / json) in a fixed Python snippet and reports issues
 * with line numbers so the viewer can offer "jump to line". YAML and
 * TOML give exact lines from their exceptions; INI/JSON get a
 * best-effort line extracted from the message.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set(["yaml", "toml", "ini", "json"]);
const TIMEOUT_MS = 10_000;
const MAX_INPUT = 1_000_000;

const VALIDATE_PY = String.raw`
import json, sys, io, re, configparser

fmt = sys.argv[1]
text = sys.stdin.read()

def issue(msg, line=None):
    return {"ok": False, "issues": [{"message": msg, "line": line}]}

def line_of(msg):
    m = re.search(r"[Ll]ine\s+(\d+)", msg)
    if m:
        return int(m.group(1))
    m = re.search(r"at line (\d+)", msg)
    if m:
        return int(m.group(1))
    return None

try:
    if fmt == "yaml":
        import yaml
        try:
            yaml.safe_load(text)
        except yaml.YAMLError as e:
            msg = str(e).split("\n")[0]
            print(json.dumps(issue(msg, line_of(str(e)))))
        else:
            print(json.dumps({"ok": True, "issues": []}))
    elif fmt == "toml":
        try:
            import tomllib
            tomllib.loads(text)
        except ImportError:
            import toml
            toml.loads(text)
        except Exception as e:
            print(json.dumps(issue("%s: %s" % (type(e).__name__, e), line_of(str(e)))))
        else:
            print(json.dumps({"ok": True, "issues": []}))
    elif fmt == "ini":
        cp = configparser.ConfigParser(strict=True)
        try:
            cp.read_string(text)
        except configparser.Error as e:
            print(json.dumps(issue(str(e), line_of(str(e)))))
        else:
            print(json.dumps({"ok": True, "issues": []}))
    elif fmt == "json":
        try:
            json.loads(text)
        except json.JSONDecodeError as e:
            print(json.dumps(issue(str(e), e.lineno)))
        else:
            print(json.dumps({"ok": True, "issues": []}))
    else:
        print(json.dumps(issue("bad format " + fmt)))
except Exception as e:
    print(json.dumps(issue("%s: %s" % (type(e).__name__, e))))
`;

export async function POST(request: NextRequest) {
    let body: { content?: string; format?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {content, format} = body;
    if (typeof content !== "string" || !format || !FORMATS.has(format)) {
        return NextResponse.json(
            {error: "Need 'content' and a format of: yaml, toml, ini, json."},
            {status: 400}
        );
    }
    if (content.length > MAX_INPUT) {
        return NextResponse.json({error: "Content too large (1 MB limit)."}, {status: 413});
    }
    const interpreter = await findInterpreter();
    const result = await runPyOnce(interpreter, ["-c", VALIDATE_PY, format], {
        timeoutMs: TIMEOUT_MS,
    });
    if (!result.ok) {
        return NextResponse.json({error: `Failed to launch Python: ${result.stderr}`}, {status: 500});
    }
    const json = lastJsonLine<{ ok: boolean; issues: Array<{ message: string; line: number | null }> }>(
        result.stdout
    );
    if (!json) {
        return NextResponse.json({error: result.stderr || "Validator produced no output."}, {status: 422});
    }
    return NextResponse.json(json);
}
