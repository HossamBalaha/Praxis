import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import {resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";

/**
 * POST /api/typecheck
 *
 * Body: { folder, file, interpreter?,
 *         profile?: "loose"|"standard"|"strict",
 *         columns?: boolean (default true),
 *         inlays?:  boolean,
 *         daemon?:  boolean }
 *
 * Runs `mypy` on the requested script and returns the diagnostics.
 * If mypy is not installed, returns ok=false with a hint.
 *
 * - profile: loose adds --ignore-missing-imports, strict adds
 *   --strict, standard keeps the default flag set.
 * - columns: passes --show-column-numbers (default) so diagnostics
 *   and revealed-type notes carry real columns.
 * - daemon: prefers `dmypy run -- <flags> <file>` (reuses the mypy
 *   daemon process across requests); on ANY failure — dmypy not
 *   installed, daemon contention, crash — it silently falls back to
 *   plain mypy. The `daemon` echo field reports what actually ran, so
 *   a missing dmypy never fails the request.
 * - inlays: parses mypy's `note: Revealed type is "..."` lines
 *   (reveal_type calls in the source) into inlay hints + symbol
 *   types. mypy has no return-type inlays, so that subset stays
 *   empty — the arrays are best-effort, empty when unavailable.
 *
 * Response: { ok, diagnostics: [{ line, col, severity, message }],
 *             raw, profile, daemon, inlays?, symbolTypes? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 120_000; // mypy is slow on large codebases

type Profile = "loose" | "standard" | "strict";

interface Diagnostic {
    line: number;
    col: number;
    severity: "error" | "warning" | "note";
    message: string;
}

interface TypeInlay {
    line: number;
    col: number;
    endCol?: number;
    label: string;
    kind: "type" | "return";
}

interface SymbolType {
    name: string;
    line: number;
    type: string;
}

function parseMypy(output: string): Diagnostic[] {
    // mypy format: "<path>:<line>:<col>: <severity>: <message>  [code]"
    // (the <col> segment only appears with --show-column-numbers).
    const out: Diagnostic[] = [];
    for (const line of output.split("\n")) {
        const m = line.match(/^[^:]+:(\d+):(?:(\d+):)?\s*(error|warning|note):\s*(.+)$/);
        if (m) {
            out.push({
                line: parseInt(m[1], 10),
                col: m[2] ? parseInt(m[2], 10) : 0,
                severity: m[3] as "error" | "warning" | "note",
                message: m[4],
            });
        }
    }
    return out;
}

interface RevealedNote {
    line: number;
    col: number;
    type: string;
}

function parseRevealedNotes(output: string): RevealedNote[] {
    // reveal_type() notes: "<path>:<line>:<col>: note: Revealed type is "T""
    const out: RevealedNote[] = [];
    for (const line of output.split("\n")) {
        const m = line.match(
            /^[^:\n]+:(\d+):(?:(\d+):)?\s*note:\s*Revealed type is "(.+)"\s*$/
        );
        if (m) {
            out.push({
                line: parseInt(m[1], 10),
                col: m[2] ? parseInt(m[2], 10) : 0,
                type: m[3],
            });
        }
    }
    return out;
}

/** Best-effort names for symbolTypes: pair each reveal_type(expr) call
 * in the source with the note mypy emits at that line (reveal_type
 * output itself is nameless). Lines with nested calls are skipped. */
async function scanRevealTypeCalls(absPath: string): Promise<Map<number, string>> {
    const byLine = new Map<number, string>();
    let src: string;
    try {
        src = await fs.readFile(absPath, "utf-8");
    } catch {
        return byLine; // unreadable source — symbolTypes stays empty
    }
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/reveal_type\(\s*([^()]+?)\s*\)/);
        if (m) byLine.set(i + 1, m[1].trim());
    }
    return byLine;
}

async function buildInlays(
    stdout: string,
    absPath: string
): Promise<{ inlays: TypeInlay[]; symbolTypes: SymbolType[] }> {
    const notes = parseRevealedNotes(stdout);
    const names = await scanRevealTypeCalls(absPath);
    const inlays: TypeInlay[] = notes.map((n) => ({
        line: n.line,
        col: n.col,
        // mypy gives no end column for revealed types — endCol stays unset.
        label: n.type,
        kind: "type" as const,
    }));
    const symbolTypes: SymbolType[] = [];
    for (const n of notes) {
        const name = names.get(n.line);
        if (name) symbolTypes.push({name, line: n.line, type: n.type});
    }
    return {inlays, symbolTypes};
}

interface ToolRun {
    code: number | null;
    stdout: string;
    stderr: string;
    spawnError: boolean;
}

function runTool(command: string, argv: string[]): Promise<ToolRun> {
    return new Promise<ToolRun>((resolve) => {
        const child = spawn(command, argv, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timeoutHandle = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timeoutHandle);
            resolve({code, stdout, stderr, spawnError: false});
        });
        child.on("error", () => {
            clearTimeout(timeoutHandle);
            resolve({code: null, stdout, stderr, spawnError: true});
        });
    });
}

/** dmypy "ran" iff it exited with mypy-style codes and did not complain
 * about a missing module or a daemon problem. Exit 1 is a SUCCESSFUL
 * daemon run that found type errors — same convention as `ok` below;
 * only 0/1 count as usable. */
function daemonUsable(run: ToolRun): boolean {
    if (run.spawnError || run.code === null || run.code > 1) return false;
    return !/no module named ['"]?dmypy|dmypy: error|daemon (crashed|is already running)/i.test(
        run.stderr + run.stdout
    );
}

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        interpreter?: string;
        profile?: unknown;
        columns?: unknown;
        inlays?: unknown;
        daemon?: unknown;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file} = body;
    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }
    const resolved = await resolveScriptPath(folder, file);
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }
    const interpreter = await findInterpreter(body.interpreter);

    const profile: Profile =
        body.profile === "loose" || body.profile === "strict"
            ? (body.profile as Profile)
            : "standard";
    const columns = body.columns !== false; // default true
    const inlays = body.inlays === true;
    const daemon = body.daemon === true;

    const flags: string[] = ["--no-error-summary", "--no-color-output"];
    if (columns) flags.push("--show-column-numbers");
    if (profile === "loose") flags.push("--ignore-missing-imports");
    if (profile === "strict") flags.push("--strict");

    // Daemon first (opt-in): everything after `--` is passed straight to
    // mypy. Any failure falls back to plain mypy below. mypy 2.x moved the
    // dmypy entrypoint from `-m dmypy` to `-m mypy.dmypy` — try both so the
    // daemon works across mypy generations.
    let result: ToolRun | null = null;
    let usedDaemon = false;
    if (daemon) {
        for (const mod of ["mypy.dmypy", "dmypy"]) {
            const dmypyRun = await runTool(interpreter, [
                "-m", mod, "run", "--", ...flags, resolved.absPath,
            ]);
            if (daemonUsable(dmypyRun)) {
                result = dmypyRun;
                usedDaemon = true;
                break;
            }
        }
    }
    if (!result) {
        result = await runTool(interpreter, ["-m", "mypy", ...flags, resolved.absPath]);
    }

    if (result.stderr.toLowerCase().includes("no module named mypy")) {
        return NextResponse.json({
            ok: true,
            diagnostics: [],
            hint: "Install mypy (`pip install mypy`) for type checking.",
            profile,
            daemon: false,
            ...(inlays ? {inlays: [] as TypeInlay[], symbolTypes: [] as SymbolType[]} : {}),
        });
    }

    const inlayPayload = inlays
        ? await buildInlays(result.stdout, resolved.absPath)
        : null;

    return NextResponse.json({
        // mypy exits 1 if it found type errors — that's a successful tool run
        // that reported problems, not a tool crash. Distinguish "ran cleanly"
        // from "found errors": ok means mypy ran and either succeeded (0) or
        // reported type errors (1). The diagnostics array carries the actual
        // errors so the UI can still surface them.
        ok: result.code !== null && result.code <= 1,
        diagnostics: parseMypy(result.stdout),
        raw: result.stdout,
        profile,
        daemon: usedDaemon,
        ...(inlayPayload ? {inlays: inlayPayload.inlays, symbolTypes: inlayPayload.symbolTypes} : {}),
    });
}
