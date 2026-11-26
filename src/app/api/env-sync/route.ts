import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {access, mkdir, readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {findInterpreter} from "@/lib/python-interpreter";
import {deslugify, getScriptsRoot} from "@/lib/scripts";

/**
 * GET  /api/env-sync?folder=<slug>[&interpreter=<path>]
 * POST /api/env-sync  body { folder, action, pin?, target?, package?, interpreter? }
 *
 * The environment-sync tab's backend: declared-vs-installed diff for one
 * folder folder, plus the write actions (freeze / sync / lock / pin).
 *
 * - GET runs `pip list --format json` on the configured interpreter
 *   (findInterpreter — same pattern as /api/pip-list, including the
 *   importlib.metadata fallback for pip-less conda envs), parses
 *   requirements.txt AND pyproject.toml (naively) for declared deps, and
 *   reads the pinned interpreter from .praxis/interpreter.json.
 * - POST "freeze" writes requirements.txt (pip freeze) — or a single
 *   name==version merge when `package` is given; "lock" writes
 *   requirements.lock; "pin" writes .praxis/interpreter.json.
 * - POST "sync" installs the MISSING declared packages only. Each one
 *   gets a `--dry-run` resolvability probe first. Extras are NEVER
 *   removed — they are reported only. Plain JSON (not SSE): the route
 *   enforces a 300 s overall deadline so long installs degrade to
 *   per-package notes instead of a hung stream.
 *
 * SECURITY: spawn argv (never a shell), names/specs re-validated with
 * the pip-list-style no-leading-dash rules before they reach pip, and
 * every write goes to a FIXED filename inside the resolved folder dir.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_TIMEOUT_MS = 150_000;
const DRY_RUN_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 240_000;
const SYNC_DEADLINE_MS = 300_000;
const MAX_OUTPUT_CHARS = 2_000_000;

interface DeclaredDep {
    name: string;
    spec?: string;
    source: "requirements" | "pyproject";
}

interface InstalledPkg {
    name: string;
    version: string;
}

interface SyncResult {
    name: string;
    action: string;
    ok: boolean;
    note?: string;
}

// ─── process helpers (mirrors /api/pip-list) ─────────────────────────────

function runCmd(
    interpreter: string,
    args: string[],
    timeoutMs: number = LIST_TIMEOUT_MS
): Promise<{ ok: boolean; code: number | null; output: string }> {
    return new Promise((resolve) => {
        const child = spawn(interpreter, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        child.stdout.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch {
                /* */
            }
        }, timeoutMs);
        child.on("close", (c) => {
            clearTimeout(timer);
            resolve({ok: true, code: c, output: out.slice(-MAX_OUTPUT_CHARS)});
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({ok: false, code: null, output: `spawn error: ${err.message}`});
        });
    });
}

function runPip(
    interpreter: string,
    args: string[],
    timeoutMs = LIST_TIMEOUT_MS
): Promise<{ ok: boolean; code: number | null; output: string }> {
    return runCmd(interpreter, ["-m", "pip", "--disable-pip-version-check", ...args], timeoutMs);
}

const IMPORTLIB_LIST_SCRIPT = [
    "import json",
    "import importlib.metadata as m",
    "pkgs = []",
    "for d in m.distributions():",
    "    name = d.metadata.get('Name')",
    "    if name:",
    "        pkgs.append({'name': name, 'version': str(d.version)})",
    "pkgs.sort(key=lambda p: p['name'].lower())",
    "print(json.dumps(pkgs))",
].join("\n");

const IMPORTLIB_FREEZE_SCRIPT = [
    "import importlib.metadata as m",
    "lines = []",
    "for d in m.distributions():",
    "    name = d.metadata.get('Name')",
    "    if name:",
    "        lines.append(name + '==' + str(d.version))",
    "lines.sort()",
    "print('\\n'.join(lines))",
].join("\n");

function parsePackageJson(output: string): InstalledPkg[] {
    try {
        const start = output.indexOf("[");
        if (start < 0) return [];
        const arr = JSON.parse(output.slice(start)) as Array<{ name?: string; version?: string }>;
        return arr
            .filter((p) => p && typeof p.name === "string")
            .map((p) => ({name: p.name as string, version: String(p.version ?? "?")}))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

/** pip freeze lines, with the conda-env importlib fallback. */
async function freezeLines(interpreter: string): Promise<{ lines: string[]; method: string }> {
    const freezeRes = await runPip(interpreter, ["freeze"]);
    const pipWorks =
        freezeRes.ok && freezeRes.code === 0 && !/No module named pip/i.test(freezeRes.output);
    let lines: string[] = [];
    if (pipWorks) {
        lines = freezeRes.output
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("-"));
    } else {
        const metaRes = await runCmd(interpreter, ["-c", IMPORTLIB_FREEZE_SCRIPT]);
        lines = metaRes.output
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("#"));
    }
    return {lines, method: pipWorks ? "pip freeze" : "importlib.metadata"};
}

async function listInstalled(interpreter: string): Promise<InstalledPkg[]> {
    const pipRes = await runPip(interpreter, ["list", "--format", "json"]);
    let packages = parsePackageJson(pipRes.output);
    if (packages.length === 0) {
        const metaRes = await runCmd(interpreter, ["-c", IMPORTLIB_LIST_SCRIPT]);
        packages = parsePackageJson(metaRes.output);
    }
    return packages;
}

// ─── validation (mirrors /api/pip-list's argv-safety) ───────────────────

/** A plain distribution name — no leading dash, so a crafted name can
 *  never impersonate a pip flag on the argv. */
function validPackageName(pkg: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(pkg);
}

/** A name plus an optional version spec, allowing one extras bracket
 *  (`pkg[extra]>=1`) — still no leading dash anywhere. */
function validRequirement(req: string): boolean {
    const spec = req.replace(/\s+/g, "");
    return /^([A-Za-z0-9][A-Za-z0-9._-]{0,100})(\[[A-Za-z0-9._,-]+\])?((?:==|>=|<=|!=|~=|>|<)[A-Za-z0-9._+!-]+)*$/.test(
        spec
    );
}

/** PEP 503 normalization for declared-vs-installed comparisons. */
function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[-_.]+/g, "-");
}

// ─── dependency-file parsing (naive by design) ───────────────────────────

function parseRequirements(content: string): Array<{ name: string; spec?: string }> {
    const out: Array<{ name: string; spec?: string }> = [];
    for (const raw of content.split(/\r?\n/)) {
        let line = raw.trim();
        const hash = line.indexOf(" #");
        if (hash !== -1) line = line.slice(0, hash).trim();
        if (!line || line.startsWith("#") || line.startsWith("-")) continue;
        const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(.*)$/.exec(line);
        if (!m) continue;
        out.push({name: m[1], spec: m[2].trim() || undefined});
    }
    return out;
}

function parsePyproject(content: string): Array<{ name: string; spec?: string }> {
    const out: Array<{ name: string; spec?: string }> = [];
    // PEP 621 [project] dependencies = [...] — quoted strings
    const depsMatch = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(content);
    if (depsMatch) {
        const body = depsMatch[1];
        const quoted = /"([^"]+)"|'([^']+)'/g;
        let q: RegExpExecArray | null;
        while ((q = quoted.exec(body)) !== null) {
            const entry = (q[1] ?? q[2] ?? "").trim();
            if (!entry) continue;
            const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(.*)$/.exec(entry.replace(/\s+/g, " ").trim());
            if (m) out.push({name: m[1], spec: m[2].trim() || undefined});
        }
    }
    // poetry-style [tool.poetry.dependencies] table — name = "version"
    if (out.length === 0 && /\[tool\.poetry\.dependencies\]/.test(content)) {
        const table = content.slice(content.indexOf("[tool.poetry.dependencies]"));
        const row = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*"([^"]*)"/gm;
        let r: RegExpExecArray | null;
        while ((r = row.exec(table)) !== null) {
            const version = r[2];
            // caret/wildcard poetry specs are not pip-comparable — only plain
            // x.y.z pins map to ==x.y.z
            const spec = /^[\d.]+$/.test(version) ? `==${version}` : undefined;
            out.push({name: r[1], spec});
        }
    }
    return out;
}

// ─── folder resolution ───────────────────────────────────────────────────

function resolveFolderDir(folderSlug: string): { folderName: string; dir: string } | null {
    const folderName = deslugify(folderSlug);
    if (!folderName) return null;
    const scriptsRoot = getScriptsRoot();
    const dir = path.join(scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, dir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return {folderName, dir};
}

async function readIfPresent(abs: string): Promise<string | null> {
    try {
        return await readFile(abs, "utf-8");
    } catch {
        return null;
    }
}

async function fileExists(abs: string): Promise<boolean> {
    try {
        const s = await stat(abs);
        return s.isFile();
    } catch {
        return false;
    }
}

/** The GET diff core, shared with POST "sync". */
async function computeEnv(
    folderDir: string,
    interpreter: string
): Promise<{
    declared: DeclaredDep[];
    installed: InstalledPkg[];
    missing: Array<{ name: string; spec?: string; source: string }>;
    extra: InstalledPkg[];
    declaredSet: Set<string>;
}> {
    const requirements = await readIfPresent(path.join(folderDir, "requirements.txt"));
    const pyproject = await readIfPresent(path.join(folderDir, "pyproject.toml"));
    const declared: DeclaredDep[] = [];
    const seen = new Set<string>();
    if (requirements) {
        for (const d of parseRequirements(requirements)) {
            if (seen.has(normalizeName(d.name))) continue;
            seen.add(normalizeName(d.name));
            declared.push({name: d.name, spec: d.spec, source: "requirements"});
        }
    }
    if (pyproject) {
        for (const d of parsePyproject(pyproject)) {
            if (seen.has(normalizeName(d.name))) continue;
            seen.add(normalizeName(d.name));
            declared.push({name: d.name, spec: d.spec, source: "pyproject"});
        }
    }
    const installed = await listInstalled(interpreter);
    const installedSet = new Set(installed.map((p) => normalizeName(p.name)));
    const declaredSet = new Set(declared.map((d) => normalizeName(d.name)));
    const missing = declared
        .filter((d) => !installedSet.has(normalizeName(d.name)))
        .map((d) => ({name: d.name, spec: d.spec, source: d.source}));
    const extra = installed.filter((p) => !declaredSet.has(normalizeName(p.name)));
    return {declared, installed, missing, extra, declaredSet};
}

/** The pinned interpreter file — GET reads it, POST "pin" writes it. */
function interpreterPinPath(folderDir: string): string {
    return path.join(folderDir, ".praxis", "interpreter.json");
}

// ─── GET ─────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    const url = new URL(request.url);
    const folderSlug = url.searchParams.get("folder") ?? "";
    const interpreterHint = url.searchParams.get("interpreter")?.trim() || undefined;
    if (!folderSlug) {
        return NextResponse.json({error: "Missing 'folder' query parameter."}, {status: 400});
    }
    const resolved = resolveFolderDir(folderSlug);
    if (!resolved) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    try {
        const interpreter = await findInterpreter(interpreterHint);
        const env = await computeEnv(resolved.dir, interpreter);

        const pinnedRaw = await readIfPresent(interpreterPinPath(resolved.dir));
        let pinned: string | undefined;
        if (pinnedRaw) {
            try {
                const parsed = JSON.parse(pinnedRaw) as { path?: unknown };
                if (typeof parsed.path === "string" && parsed.path.length > 0) pinned = parsed.path;
            } catch {
                pinned = undefined;
            }
        }

        return NextResponse.json({
            ok: true,
            interpreter,
            ...(pinned ? {pinned} : {}),
            declared: env.declared,
            installed: env.installed,
            missing: env.missing,
            extra: env.extra,
            lockfilePresent: await fileExists(path.join(resolved.dir, "requirements.lock")),
        });
    } catch (err) {
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "Environment read failed."},
            {status: 500}
        );
    }
}

// ─── POST ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    let body: {
        folder?: string;
        action?: string;
        pin?: string;
        target?: string;
        package?: string;
        interpreter?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const action = (body.action ?? "").trim();
    if (!body.folder || !action) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'action' (freeze | sync | lock | pin)."},
            {status: 400}
        );
    }
    const resolved = resolveFolderDir(body.folder);
    if (!resolved) {
        return NextResponse.json({error: "Invalid folder slug."}, {status: 400});
    }
    const folderDir = resolved.dir;
    const requirementsPath = path.join(folderDir, "requirements.txt");
    const lockPath = path.join(folderDir, "requirements.lock");

    try {
        const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);
        const results: SyncResult[] = [];
        let wrote: string | undefined;

        if (action === "freeze") {
            const {lines, method} = await freezeLines(interpreter);
            if (lines.length === 0) {
                return NextResponse.json(
                    {error: "Nothing to freeze — no installed packages were found."},
                    {status: 500}
                );
            }
            if (body.package) {
                // Per-row "add to requirements": merge ONE name==version line in
                // instead of overwriting the whole file.
                const pkg = body.package.trim();
                if (!validPackageName(pkg)) {
                    return NextResponse.json({error: "Invalid package name."}, {status: 400});
                }
                const norm = normalizeName(pkg);
                const match = lines.find((l) => normalizeName(l.split(/[=<>!~]/)[0] ?? "") === norm);
                const line = match ?? pkg;
                const current = (await readIfPresent(requirementsPath)) ?? "";
                const kept = current
                    .split(/\r?\n/)
                    .filter((l) => {
                        const nm = l.trim().split(/[=<>!~#\s@]/)[0] ?? "";
                        return nm === "" || normalizeName(nm) !== norm;
                    });
                kept.push(line);
                const content = kept.filter(Boolean).join("\n") + "\n";
                await writeFile(requirementsPath, content, "utf-8");
                wrote = "requirements.txt";
                results.push({
                    name: pkg,
                    action: "freeze",
                    ok: true,
                    note: `merged ${line} (${method})`,
                });
            } else {
                const header =
                    "# Frozen by Praxis env-sync on " + new Date().toISOString().slice(0, 10) + "\n";
                if (body.target === "pyproject") {
                    // naive splice: replace/create the [project] dependencies list
                    const pyprojectPath = path.join(folderDir, "pyproject.toml");
                    const current = await readIfPresent(pyprojectPath);
                    const depsBody = lines.map((l) => `  ${JSON.stringify(l)}`).join(",\n");
                    const depsBlock = `dependencies = [\n${depsBody},\n]`;
                    let content: string;
                    if (current && /dependencies\s*=\s*\[[\s\S]*?\]/.test(current)) {
                        content = current.replace(/dependencies\s*=\s*\[[\s\S]*?\]/, depsBlock);
                    } else if (current && /\[project\]/.test(current)) {
                        content = current.replace(/\[project\]/, `[project]\n${depsBlock}`);
                    } else {
                        const name = resolved.folderName.replace(/[^\w.-]+/g, "-").toLowerCase() || "praxis-project";
                        content = `[project]\nname = "${name}"\n${depsBlock}\n`;
                    }
                    await writeFile(pyprojectPath, content, "utf-8");
                    wrote = "pyproject.toml";
                } else {
                    await writeFile(requirementsPath, header + lines.join("\n") + "\n", "utf-8");
                    wrote = "requirements.txt";
                }
                results.push({
                    name: "requirements",
                    action: "freeze",
                    ok: true,
                    note: `${lines.length} packages (${method})`,
                });
            }
        } else if (action === "lock") {
            const {lines, method} = await freezeLines(interpreter);
            if (lines.length === 0) {
                return NextResponse.json(
                    {error: "Nothing to lock — no installed packages were found."},
                    {status: 500}
                );
            }
            const header =
                "# Lock file by Praxis env-sync on " + new Date().toISOString().slice(0, 10) + "\n";
            await writeFile(lockPath, header + lines.join("\n") + "\n", "utf-8");
            wrote = "requirements.lock";
            results.push({
                name: "requirements.lock",
                action: "lock",
                ok: true,
                note: `${lines.length} packages (${method})`,
            });
        } else if (action === "pin") {
            const pin = (body.pin ?? "").trim();
            if (!pin || !path.isAbsolute(pin)) {
                return NextResponse.json(
                    {error: "Pin needs an absolute interpreter path."},
                    {status: 400}
                );
            }
            try {
                await access(pin);
            } catch {
                return NextResponse.json(
                    {error: `Interpreter not found: ${pin}`},
                    {status: 400}
                );
            }
            await mkdir(path.join(folderDir, ".praxis"), {recursive: true});
            await writeFile(interpreterPinPath(folderDir), JSON.stringify({path: pin}, null, 2) + "\n", "utf-8");
            wrote = ".praxis/interpreter.json";
            results.push({name: pin, action: "pin", ok: true, note: "interpreter pinned"});
        } else if (action === "sync") {
            // Install the MISSING declared packages. A single `package` scopes
            // the sync to one row (the per-row Install button).
            const env = await computeEnv(folderDir, interpreter);
            let targets: Array<{ name: string; spec?: string }>;
            if (body.package) {
                const pkg = body.package.trim();
                const declared = env.declared.find((d) => normalizeName(d.name) === normalizeName(pkg));
                targets = declared ? [declared] : validPackageName(pkg) ? [{name: pkg}] : [];
                if (targets.length === 0) {
                    return NextResponse.json({error: "Invalid package name."}, {status: 400});
                }
            } else {
                targets = env.missing;
            }
            const deadline = Date.now() + SYNC_DEADLINE_MS;
            for (const t of targets) {
                const req = t.name + (t.spec ?? "");
                if (!validRequirement(req)) {
                    results.push({
                        name: t.name,
                        action: "sync",
                        ok: false,
                        note: "unsupported requirement spec — install it manually",
                    });
                    continue;
                }
                if (Date.now() > deadline) {
                    results.push({name: t.name, action: "sync", ok: false, note: "300 s deadline reached"});
                    continue;
                }
                // dry-run first so an unresolvable spec never half-installs
                const dry = await runPip(interpreter, ["install", req, "--dry-run"], DRY_RUN_TIMEOUT_MS);
                if (!dry.ok || dry.code !== 0) {
                    results.push({
                        name: t.name,
                        action: "sync",
                        ok: false,
                        note: `not resolvable (${lastLine(dry.output)})`,
                    });
                    continue;
                }
                const inst = await runPip(interpreter, ["install", req], INSTALL_TIMEOUT_MS);
                if (inst.ok && inst.code === 0) {
                    results.push({name: t.name, action: "sync", ok: true, note: "installed"});
                } else {
                    results.push({name: t.name, action: "sync", ok: false, note: lastLine(inst.output)});
                }
            }
            if (!body.package && env.extra.length > 0) {
                // extras are REPORT ONLY — never removed by sync
                results.push({
                    name: `(${env.extra.length} extras)`,
                    action: "report",
                    ok: true,
                    note: "installed-but-not-declared packages were left untouched",
                });
            }
        } else {
            return NextResponse.json(
                {error: `Unknown action "${action}". Use freeze | sync | lock | pin.`},
                {status: 400}
            );
        }

        return NextResponse.json({
            ok: results.every((r) => r.ok),
            results,
            ...(wrote ? {wrote} : {}),
        });
    } catch (err) {
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "Environment action failed."},
            {status: 500}
        );
    }
}

function lastLine(output: string): string {
    const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const tail = lines.length > 0 ? lines[lines.length - 1] : "no output";
    return tail.slice(0, 200);
}
