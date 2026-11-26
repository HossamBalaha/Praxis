import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import path from "node:path";
import {deslugify, getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/folder-lint
 *
 * Body: { folder: string, interpreter?: string }
 *
 * Lints EVERY Python file in a folder folder at once (ruff binary, or
 * `python -m ruff`; falls back to `python -m pyflakes`) and returns an
 * aggregate report the client renders as an "Issues summary" dialog:
 * per-file issue lists grouped by rule (unused imports, unused vars,
 * …), with totals. The client can download the markdown rendering or
 * save it into the folder.
 *
 * an optional `interpreter` body field runs the lint in the
 * SELECTED environment (Settings → Python → interpreter) instead of
 * the auto-detected one, so "Install ruff" + re-check target the same
 * pip the user configured.
 *
 * ruff's concise format is parsed here — one spawn for the whole folder
 * (fast) instead of one per file.
 *
 * Response: {
 * ok, linter,
 * files: [{ file, issues: [{ line, col, code, message }] }],
 * totals: { files, filesWithIssues, issues, byRule: { [code]: n } },
 * generatedAt: number,
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 60_000;

interface FolderIssue {
    line: number;
    col: number;
    code: string;
    message: string;
}

interface FileReport {
    file: string;
    issues: FolderIssue[];
}

function parseConcise(output: string): FileReport[] {
    // ruff concise: "<path>:<line>:<col>: <code> <message>"
    // pyflakes:     "<path>:<line>:<col>: <message>"  (code = PYF)
    // the path group is GREEDY (`.*`) and anchored on the
    // LAST ":<digits>:<digits>:" before the message. The old `[^:]+`
    // version could not match Windows drive paths ("D:\...py:1:1:") —
    // the drive colon ate the anchor and every finding was silently
    // dropped, making real issues look like "folder is clean".
    const byFile = new Map<string, FolderIssue[]>();
    for (const line of output.split("\n")) {
        const m = line.match(/^(.*):(\d+):(\d+):\s+(?:(\S+)\s+)?(.+)$/);
        if (!m) continue;
        const filePath = m[1];
        const base = path.basename(filePath);
        const issue: FolderIssue = {
            line: parseInt(m[2], 10),
            col: parseInt(m[3], 10),
            code: m[4] ?? "PYF",
            // Strip ruff's "[*] " / "[ ] " fixable prefixes.
            message: m[5].replace(/^\[(\*| |x|X)\]\s+/, ""),
        };
        const list = byFile.get(base) ?? [];
        list.push(issue);
        byFile.set(base, list);
    }
    return [...byFile.entries()]
        .map(([file, issues]) => ({file, issues: issues.sort((a, b) => a.line - b.line)}))
        .sort((a, b) => a.file.localeCompare(b.file));
}

function runTool(
    cmd: string,
    args: string[],
    env: NodeJS.ProcessEnv
): Promise<{ ok: boolean; output: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            env,
            stdio: ["ignore", "pipe", "pipe"],
            // No shell — argv carries user-controlled folder names.
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const t = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(t);
            resolve({ok: code === 0, output: stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(t);
            resolve({ok: false, output: "", stderr: "spawn error"});
        });
    });
}

export async function POST(request: Request) {
    let body: { folder?: string; interpreter?: string; sub?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder: folderSlug} = body;
    if (!folderSlug) {
        return NextResponse.json({error: "Body must include 'folder'."}, {status: 400});
    }
    const folderName = deslugify(folderSlug);
    if (!folderName || folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    // optional `sub` (relative folder path INSIDE the folder)
    // lints a NESTED subfolder instead of the whole folder — the
    // subfolder rows get the same "Issues summary…" action the main
    // folder rows have. Same sanitization as /api/folder-delete.
    const cleanSub = (body.sub ?? "").trim();
    if (cleanSub && (
        cleanSub.includes("..") || cleanSub.includes("\\") ||
        cleanSub.startsWith("/") || cleanSub.endsWith("/") ||
        cleanSub.split("/").some((seg) => !seg || seg.startsWith("."))
    )) {
        return NextResponse.json({error: "Invalid sub-folder path."}, {status: 400});
    }
    const folderDir = path.join(getScriptsRoot(), folderName, cleanSub);
    const rel = path.relative(getScriptsRoot(), folderDir);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }

    const interpreter = await findInterpreter(
        body.interpreter?.trim() || undefined
    );
    // Prefer the standalone ruff binary (~50ms startup, no interpreter).
    // after the client's "Install ruff" button runs pip in the
    // selected env, the `<interpreter> -m ruff` fallback below picks the
    // module up immediately — the PATH-binary cache doesn't need to be
    // invalidated for the lint to start working.
    const g = globalThis as unknown as { __ruffBinaryChecked?: boolean; __ruffBinaryAvailable?: boolean };
    if (g.__ruffBinaryChecked === undefined) {
        g.__ruffBinaryChecked = true;
        try {
            const {spawnSync} = await import("node:child_process");
            const res = spawnSync("ruff", ["--version"], {stdio: "ignore", timeout: 2000});
            g.__ruffBinaryAvailable = res.status === 0 && !res.error;
        } catch {
            g.__ruffBinaryAvailable = false;
        }
    }

    // `ruff check <dir>` walks the folder recursively; only .py files are
    // considered by default. --respect-gitignore is kept default so vendor
    // folders stay out.
    let result: { ok: boolean; output: string; stderr: string };
    let linter: "ruff" | "pyflakes" | "none" = "ruff";
    if (g.__ruffBinaryAvailable) {
        result = await runTool("ruff", ["check", "--output-format=concise", "--no-cache", folderDir], process.env);
    } else {
        result = await runTool(interpreter, ["-m", "ruff", "check", "--output-format=concise", "--no-cache", folderDir], process.env);
    }
    if (result.stderr.toLowerCase().includes("no such file") || result.stderr.toLowerCase().includes("not found")) {
        g.__ruffBinaryAvailable = false;
        result = await runTool(interpreter, ["-m", "ruff", "check", "--output-format=concise", "--no-cache", folderDir], process.env);
    }
    if (result.stderr.includes("No module named ruff")) {
        result = await runTool(interpreter, ["-m", "pyflakes", folderDir], process.env);
        linter = "pyflakes";
    }
    // a broken/missing interpreter (spawn error, no stderr
    // from the tool itself) used to fall through to an EMPTY report with
    // linter "ruff" — a misleading "folder is clean 🎉". Surface it as
    // linter "none" with a hint about the interpreter instead.
    if (
        result.output === "" &&
        /spawn error|ENOENT|cannot find|not recognized/i.test(result.stderr) &&
        linter === "ruff"
    ) {
        return NextResponse.json({
            ok: true,
            linter: "none",
            files: [],
            totals: {files: 0, filesWithIssues: 0, issues: 0, byRule: {}},
            generatedAt: Date.now(),
            hint: "No Python interpreter could be launched — pick one in Settings → Python, then retry.",
        });
    }
    if (result.stderr.toLowerCase().includes("no module")) {
        return NextResponse.json({
            ok: true,
            linter: "none",
            files: [],
            totals: {files: 0, filesWithIssues: 0, issues: 0, byRule: {}},
            generatedAt: Date.now(),
            hint: "Install ruff (`pip install ruff`) to generate issue reports.",
        });
    }

    const files = parseConcise(result.output);
    const byRule: Record<string, number> = {};
    let issues = 0;
    for (const f of files) {
        issues += f.issues.length;
        for (const i of f.issues) byRule[i.code] = (byRule[i.code] ?? 0) + 1;
    }
    return NextResponse.json({
        ok: true,
        linter,
        files,
        totals: {
            files: files.length,
            filesWithIssues: files.filter((f) => f.issues.length > 0).length,
            issues,
            byRule,
        },
        generatedAt: Date.now(),
    });
}
