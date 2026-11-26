import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {deslugify, getScriptsRoot, sanitizeSubPath} from "@/lib/scripts";
import {killChildGroup} from "@/lib/term-sessions";

/**
 * GET /api/tasks?folder=<slug> — scan a workspace folder for task
 * definitions and return them for the bottom panel's Tasks tab:
 *
 *   package.json      → the "scripts" table            (npm run <name>)
 *   Makefile          → target rules at column 0       (make <target>)
 *   justfile/Justfile → recipes                        (just <recipe>)
 *   pyproject.toml    → [project.scripts] entries (the console-script
 *                       name itself) + a custom [tool.praxis.tasks] table
 *                       (naive TOML section scan — no full parser needed
 *                       for flat `key = "value"` tables).
 *
 * The scan covers the folder root plus two nested levels (skipping
 * node_modules and other build noise) so monorepo package.json files
 * surface too — those tasks carry a relative `cwd`.
 *
 * POST /api/tasks { folder, command, cwd? } — run one task as a
 * one-shot `/bin/sh -c` child with the folder as cwd, stdout + stderr
 * merged, streamed back as SSE events (headers copied from /api/debug):
 *
 *   data: {"kind":"out","text":"…"}\n\n
 *   data: {"kind":"exit","code":0}\n\n
 *
 * Hard caps: 300 s runtime, 2 MB streamed output. The child is spawned
 * detached (own process group) so Stop/timeout/cancel take down the whole
 * tree, not just the shell — same trick as /api/term's one-shot exec.
 */

export const runtime = "nodejs";
// SSE: do not buffer the response.
export const dynamic = "force-dynamic";

/* ── shared shapes (mirrored by tasks-panel-content.tsx) ─────────── */

type TaskSource = "npm" | "make" | "just" | "pyproject" | "package";

interface TaskDef {
    id: string;
    name: string;
    source: TaskSource;
    command: string;
    /** Relative sub-directory (posix-style) when the task runs in a nested file. */
    cwd?: string;
}

interface TaskRoots {
    hasPackage: boolean;
    hasMake: boolean;
    hasJust: boolean;
    hasPyproject: boolean;
}

/* ── scan limits ─────────────────────────────────────────────────── */

const MAX_TASKS = 300;
const MAX_SCAN_DIRS = 120;
const MAX_SCAN_DEPTH = 2;

/** Build-tool noise that would flood the scan with nested manifests. */
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    "dist",
    "build",
    ".next",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    "target",
    "out",
    "coverage",
    ".praxis",
]);

/* ── per-manifest collectors ─────────────────────────────────────── */

/** Stable id: source + name + (nested) cwd. */
function taskId(source: TaskSource, name: string, rel: string): string {
    return `${source}:${name}${rel ? `@${rel}` : ""}`;
}

async function collectNpmScripts(
    file: string,
    rel: string,
    tasks: TaskDef[]
): Promise<void> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await fs.readFile(file, "utf-8"));
    } catch {
        return; // corrupt package.json — skip silently
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (typeof scripts !== "object" || scripts === null) return;
    for (const [name, cmd] of Object.entries(scripts)) {
        if (tasks.length >= MAX_TASKS) return;
        if (typeof cmd !== "string" || !cmd.trim()) continue;
        tasks.push({
            id: taskId("npm", name, rel),
            name,
            source: "npm",
            // `npm run` keeps the project's local binaries on PATH.
            command: `npm run ${name}`,
            ...(rel ? {cwd: rel} : {}),
        });
    }
}

/** Makefile target: `name:` at column 0 — the lookahead skips `VAR :=`. */
const MAKE_TARGET_RE = /^[a-zA-Z_-][\w.-]*:(?!=)/;

function collectMakeTargets(
    text: string,
    rel: string,
    tasks: TaskDef[]
): void {
    const seen = new Set<string>(); // dedupes .PHONY/repeat declarations
    for (const rawLine of text.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        const m = MAKE_TARGET_RE.exec(line);
        if (!m) continue;
        const target = m[0].slice(0, -1).trim();
        if (!target || seen.has(target)) continue;
        if (target.startsWith(".")) continue; // .PHONY, .DEFAULT_GOAL, …
        if (tasks.length >= MAX_TASKS) return;
        seen.add(target);
        tasks.push({
            id: taskId("make", target, rel),
            name: target,
            source: "make",
            command: `make ${target}`,
            ...(rel ? {cwd: rel} : {}),
        });
    }
}

/** justfile recipe: `name:` or quiet `@name:` at column 0. */
const JUST_RECIPE_RE = /^@?([\w-]+)\s*:/;

function collectJustRecipes(
    text: string,
    rel: string,
    tasks: TaskDef[]
): void {
    const seen = new Set<string>();
    for (const rawLine of text.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("#")) continue;
        const m = JUST_RECIPE_RE.exec(line);
        if (!m) continue;
        const name = m[1];
        const rest = line.slice(m[0].length).trim();
        // A bare quiet "@default:" with nothing (or only a comment) after the
        // colon is a placeholder, not a runnable recipe — skip it.
        if (name === "default" && (rest === "" || rest.startsWith("#"))) continue;
        if (seen.has(name)) continue;
        if (tasks.length >= MAX_TASKS) return;
        seen.add(name);
        tasks.push({
            id: taskId("just", name, rel),
            name,
            source: "just",
            command: `just ${name}`,
            ...(rel ? {cwd: rel} : {}),
        });
    }
}

/** Naive TOML scan — section headers + flat `key = "value"` pairs. */
function collectPyprojectTasks(
    text: string,
    rel: string,
    tasks: TaskDef[]
): void {
    let section = "";
    const seen = new Set<string>();
    const HEADER_RE = /^\s*\[\s*([^\]#]+?)\s*\]\s*(?:#.*)?$/;
    const KV_RE = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/;
    for (const rawLine of text.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        const header = HEADER_RE.exec(line);
        if (header) {
            section = header[1].trim();
            continue;
        }
        if (section !== "project.scripts" && section !== "tool.praxis.tasks") {
            continue;
        }
        if (tasks.length >= MAX_TASKS) return;
        const kv = KV_RE.exec(line);
        if (!kv) continue;
        const name = kv[1];
        const value = kv[2] ?? kv[3] ?? "";
        if (!name || !value.trim()) continue;
        const source: TaskSource =
            section === "project.scripts" ? "package" : "pyproject";
        const id = taskId(source, name, rel);
        if (seen.has(id)) continue;
        seen.add(id);
        tasks.push({
            id,
            name,
            source,
            // [project.scripts] entries are console scripts — run the name
            // itself; [tool.praxis.tasks] values are ready-made commands.
            command: source === "package" ? name : value,
            ...(rel ? {cwd: rel} : {}),
        });
    }
}

/* ── folder walker ───────────────────────────────────────────────── */

async function scanFolder(
    root: string
): Promise<{ tasks: TaskDef[]; roots: TaskRoots }> {
    const tasks: TaskDef[] = [];
    const roots: TaskRoots = {
        hasPackage: false,
        hasMake: false,
        hasJust: false,
        hasPyproject: false,
    };
    let visited = 0;

    const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
        if (visited >= MAX_SCAN_DIRS || depth > MAX_SCAN_DEPTH) return;
        visited++;
        let entries: import("node:fs").Dirent[];
        try {
            entries = await fs.readdir(dir, {withFileTypes: true});
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const abs = path.join(dir, entry.name);
            const lower = entry.name.toLowerCase();
            if (lower === "package.json") {
                roots.hasPackage = true;
                await collectNpmScripts(abs, rel, tasks);
            } else if (entry.name === "Makefile") {
                roots.hasMake = true;
                collectMakeTargets(await safeRead(abs), rel, tasks);
            } else if (lower === "justfile" || entry.name === "Justfile") {
                roots.hasJust = true;
                collectJustRecipes(await safeRead(abs), rel, tasks);
            } else if (lower === "pyproject.toml") {
                roots.hasPyproject = true;
                collectPyprojectTasks(await safeRead(abs), rel, tasks);
            }
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
            await walk(
                path.join(dir, entry.name),
                rel ? `${rel}/${entry.name}` : entry.name,
                depth + 1
            );
        }
    };

    await walk(root, "", 0);
    return {tasks: tasks.slice(0, MAX_TASKS), roots};
}

async function safeRead(file: string): Promise<string> {
    try {
        return await fs.readFile(file, "utf-8");
    } catch {
        return "";
    }
}

/* ── GET: the scan ───────────────────────────────────────────────── */

export async function GET(request: Request) {
    const url = new URL(request.url);
    const folder = (url.searchParams.get("folder") ?? "").trim();
    if (!folder) {
        return NextResponse.json(
            {error: "Missing 'folder' query parameter."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    if (
        !folderName ||
        folderName.includes("/") ||
        folderName.includes("\\") ||
        folderName.includes("..")
    ) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, folderDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const st = await fs.stat(folderDir);
        if (!st.isDirectory()) {
            return NextResponse.json(
                {error: "Folder is not a directory."},
                {status: 404}
            );
        }
    } catch {
        return NextResponse.json({error: "Folder not found."}, {status: 404});
    }

    const {tasks, roots} = await scanFolder(folderDir);
    return NextResponse.json({ok: true, tasks, roots});
}

/* ── POST: run one task, stream its output ────────────────────────── */

const RUN_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
    let body: { folder?: string; command?: string; cwd?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, command} = body;
    if (!folder || typeof command !== "string" || !command.trim()) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'command'."},
            {status: 400}
        );
    }
    if (command.length > 8000) {
        return NextResponse.json(
            {error: "Command too long (8000 character limit)."},
            {status: 400}
        );
    }
    const folderName = deslugify(folder);
    if (
        !folderName ||
        folderName.includes("/") ||
        folderName.includes("\\") ||
        folderName.includes("..")
    ) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    // Optional relative sub-directory inside the folder (shared path guard).
    const sub = sanitizeSubPath(body.cwd);
    if (sub === null) {
        return NextResponse.json(
            {error: "Invalid working directory."},
            {status: 400}
        );
    }
    const scriptsRoot = getScriptsRoot();
    const cwd = sub
        ? path.join(scriptsRoot, folderName, ...sub.split("/"))
        : path.join(scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, cwd);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({error: "Path traversal blocked."}, {status: 400});
    }
    try {
        const st = await fs.stat(cwd);
        if (!st.isDirectory()) {
            return NextResponse.json(
                {error: "Working directory is not a folder."},
                {status: 404}
            );
        }
    } catch {
        return NextResponse.json(
            {error: "Working directory not found."},
            {status: 404}
        );
    }

    const isWin = process.platform === "win32";
    let child;
    try {
        // turbopackIgnore: the shell binary is resolved at RUNTIME
        // (Comspec on Windows / /bin/sh elsewhere) — the tracer must not
        // statically follow it and drag the whole project into the trace.
        child = spawn(
            /*turbopackIgnore: true*/
            isWin ? (process.env.Comspec ?? "cmd.exe") : "/bin/sh",
            isWin ? ["/c", command] : ["-c", command],
            {
                cwd,
                env: {...process.env, PYTHONUNBUFFERED: "1"},
                stdio: ["ignore", "pipe", "pipe"],
                // detached (POSIX): own process group so Stop / timeout / client
                // abort kill the command's whole tree, not just the shell.
                detached: !isWin,
            }
        );
    } catch (err) {
        return NextResponse.json(
            {error: `Failed to launch shell: ${(err as Error).message}`},
            {status: 500}
        );
    }

    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            let emitted = 0; // streamed byte budget
            let finished = false; // output cap reached — stop streaming
            const send = (obj: Record<string, unknown>) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                } catch {
                    closed = true;
                }
            };
            const done = () => {
                if (closed) return;
                closed = true;
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            };

            const onData = (chunk: Buffer) => {
                if (finished || closed || emitted >= MAX_OUTPUT_BYTES) return;
                const slice = chunk.subarray(0, MAX_OUTPUT_BYTES - emitted);
                emitted += slice.length;
                send({kind: "out", text: slice.toString("utf-8")});
                if (emitted >= MAX_OUTPUT_BYTES) {
                    finished = true;
                    send({
                        kind: "out",
                        text: "\n[praxis] output limit reached (2 MB) — task stopped.\n",
                    });
                    killChildGroup(child, "SIGKILL");
                }
            };

            child.stdout?.on("data", onData);
            child.stderr?.on("data", onData);
            child.on("error", (err) => {
                if (!finished) {
                    send({kind: "out", text: `\n[praxis] spawn error: ${err.message}\n`});
                }
            });

            timer = setTimeout(() => {
                send({
                    kind: "out",
                    text: `\n[praxis] task exceeded 300 s and was killed.\n`,
                });
                killChildGroup(child, "SIGKILL");
            }, RUN_TIMEOUT_MS);

            child.on("close", (code) => {
                if (timer) clearTimeout(timer);
                finished = true;
                send({kind: "exit", code});
                done();
            });
        },
        cancel() {
            // Client aborted the stream (Stop button / panel switch) — take
            // the whole process group down with it.
            if (timer) clearTimeout(timer);
            killChildGroup(child);
        },
    });

    // SSE headers copied from /api/debug.
    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
