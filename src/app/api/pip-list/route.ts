import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {findInterpreter} from "@/lib/python-interpreter";
import {getScriptsRoot} from "@/lib/scripts";
import {
    type DeclaredDependency,
    parseDeclaredDependencies,
    planPinPackage,
    validatePyprojectPin,
} from "@/lib/manifest-deps";

/**
 * GET /api/pip-list
 * POST /api/pip-list { action:... }
 *
 * The Dependency Manager (Tools ▸ Dependency manager…) data source.
 *
 * - GET returns the SELECTED environment's installed packages
 * (`<interpreter> -m pip list --format json` — pure local metadata,
 * no network), the interpreter label, and the ACTIVE project's
 * manifests: requirements.txt AND pyproject.toml — both contents plus
 * the DECLARED dependency list merged across them (each entry tagged
 * with the manifest it came from) and a `manifests` summary the UI
 * badges. `null` content = the project has no such manifest.
 * - POST `action: "outdated"` → `pip list --outdated --format json`
 * (hits PyPI — slow, explicitly user-triggered with a spinner).
 * - POST `action: "upgrade" | "uninstall"` with `package` — ANY
 * installed package (the manager's rows each get Update/Remove;
 * names are strictly validated so nothing can smuggle a pip FLAG
 * through the argv).
 * - POST `action: "install"` with `package` — installs a new
 * package (optionally with a ==/>= version spec).
 * - POST `action: "upgrade-all"` with `packages: [...]` — one
 * `pip install --upgrade p1 p2 …` pass for every outdated row the
 * user selected (longer timeout, still argv-safe).
 * - POST `action: "pin"` → rewrites `requirements.txt` at the
 * ACTIVE project root with the CURRENT versions of every installed
 * package (`pip freeze`), so the project becomes reproducible.
 * - POST `action: "pin-package"` with `package` + `version` → pins
 * ONE installed package at its current version INTO THE MANIFEST IT
 * CAME FROM: a `name==version` line in requirements.txt, or a
 * minimal in-place replacement inside the pyproject.toml
 * `[project].dependencies` / optional-dependencies / `[tool.uv]`
 * dev-dependencies array. The TOML edit is validated by re-parsing
 * AFTER the write, with a backup of the original content to RESTORE
 * on a failed parse — a pyproject.toml must never be corrupted. When
 * the array can't be edited safely the pin degrades to a
 * requirements.txt line and the response says so (`fellBack`).
 *
 * SECURITY: spawn argv (never a shell), interpreter validated by
 * findInterpreter, package names/specs matched against strict
 * validators (no leading dash — a name like "--requirement" can never
 * become a pip flag), and both manifests are confined to the scripts
 * root.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 150_000; // --outdated hits the network; be patient
// 2 MB — a real environment's `pip list --format json` is ~20 KB
// (435+ packages); the cap only exists to bound a runaway
// --outdated error dump.
const MAX_OUTPUT_CHARS = 2_000_000;

/** A plain distribution name (as printed by `pip list`): letters,
 *  digits, dot, underscore, hyphen — but NEVER a leading dash, so a
 *  crafted name can never impersonate a pip flag on the argv. */
function validPackageName(pkg: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(pkg);
}

/** A name plus an optional version spec (`pkg==1.2`, `pkg>=1`,
 *  `pkg~=1.2`, `pkg!=2`, `pkg>1,<3`): the install input accepts
 *  these. Same no-leading-dash rule. */
function validPackageSpec(pkg: string): boolean {
    const spec = pkg.replace(/\s+/g, "");
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]{0,100})((?:==|>=|<=|!=|~=|>|<)[A-Za-z0-9._+!-]+)*$/.exec(spec);
    return !!m;
}

/** Run `<interpreter> args...>` and collect stdout+stderr + the exit
 * code (the exit code tells a missing pip apart from an
 * empty-but-working pip). */
function runCmd(
    interpreter: string,
    args: string[],
    timeoutMs: number = TIMEOUT_MS
): Promise<{ ok: boolean; code: number | null; output: string }> {
    return new Promise((resolve) => {
        const child = spawn(interpreter, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let code: number | null = null;
        child.stdout.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (out += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, timeoutMs);
        child.on("close", (c) => {
            clearTimeout(timer);
            code = c;
            resolve({ok: true, code, output: out.slice(-MAX_OUTPUT_CHARS)});
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            resolve({ok: false, code: null, output: `spawn error: ${err.message}`});
        });
    });
}

/** `interpreter -m pip …` (kept for the existing call sites). */
function runPip(interpreter: string, args: string[]): Promise<{ ok: boolean; code: number | null; output: string }> {
    return runCmd(interpreter, ["-m", "pip", "--disable-pip-version-check", ...args]);
}

/** Install/upgrade variant — installs can legitimately take minutes
 *  (big wheels, slow networks), so this one runs with a 10-minute
 *  cap instead of the 150 s metadata cap. */
function runPipLong(interpreter: string, args: string[]): Promise<{
    ok: boolean;
    code: number | null;
    output: string
}> {
    return runCmd(interpreter, ["-m", "pip", "--disable-pip-version-check", ...args], 600_000);
}

/** importlib.metadata fallback. Conda envs — like
 * anaconda3/envs/tf — often ship WITHOUT the pip module, but every
 * Python ≥3.8 can enumerate installed distributions through the
 * standard library. Same metadata pip would read, zero dependencies. */
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

/** Parse `pip list --format json` output safely. */
function parsePackageJson(output: string): Array<{ name: string; version: string }> {
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

/** Read a manifest from the ACTIVE project root (null when the
 *  project has none). Both manifests live at the root — exactly where
 *  `pin` / `pin-package` write them. */
async function readManifest(name: string): Promise<string | null> {
    try {
        return await readFile(path.join(getScriptsRoot(), name), "utf-8");
    } catch {
        return null;
    }
}

/** Fresh manifest state for responses (declared list across BOTH
 *  manifests, each entry tagged with the manifest it came from). */
async function currentManifests(): Promise<{
    requirements: string | null;
    pyproject: string | null;
    declared: DeclaredDependency[];
    manifests: { requirements: boolean; pyproject: boolean };
}> {
    const requirements = await readManifest("requirements.txt");
    const pyproject = await readManifest("pyproject.toml");
    return {
        requirements,
        pyproject,
        declared: parseDeclaredDependencies(requirements, pyproject),
        manifests: {
            requirements: requirements != null,
            pyproject: pyproject != null,
        },
    };
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const interpreterHint = url.searchParams.get("interpreter")?.trim() || undefined;
    try {
        const interpreter = await findInterpreter(interpreterHint);

        // 1) The normal path: pip list --format json.
        const pipRes = await runPip(interpreter, ["list", "--format", "json"]);
        let packages = parsePackageJson(pipRes.output);
        let pipAvailable = pipRes.ok && pipRes.code === 0 && !/No module named pip/i.test(pipRes.output);

        // 2) The fallback: no pip in this environment (conda envs like
        //    anaconda3/envs/tf) — read the SAME site-packages metadata via
        //    the stdlib's importlib.metadata. The dialog then lists
        //    packages normally and only disables the pip-only actions.
        let method: "pip" | "importlib.metadata" = "pip";
        if (packages.length === 0) {
            const metaRes = await runCmd(interpreter, ["-c", IMPORTLIB_LIST_SCRIPT]);
            const metaPkgs = parsePackageJson(metaRes.output);
            if (metaPkgs.length > 0) {
                packages = metaPkgs;
                method = "importlib.metadata";
                pipAvailable = false;
            }
        }

        // Manifests at the ACTIVE project root — requirements.txt plus
        // pyproject.toml when the project has one. `declared` merges both
        // (each entry carries its source); `manifests` powers the UI's
        // detected-manifest badges; null content = manifest absent.
        const manifests = await currentManifests();

        return NextResponse.json({
            ok: packages.length > 0,
            interpreter,
            packages,
            pipAvailable,
            method,
            requirements: manifests.requirements,
            pyproject: manifests.pyproject,
            declared: manifests.declared,
            manifests: manifests.manifests,
        });
    } catch (err) {
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "Failed to list packages."},
            {status: 500}
        );
    }
}

export async function POST(request: Request) {
    let body: {
        action?: string;
        package?: string;
        packages?: string[];
        interpreter?: string;
        version?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const action = (body.action ?? "").trim();

    try {
        const interpreter = await findInterpreter(body.interpreter?.trim() || undefined);

        if (action === "outdated") {
            // Outdated checks NEED pip (they query PyPI). Give a precise,
            // actionable error when the env ships without it.
            const probe = await runPip(interpreter, ["--version"]);
            if (!probe.ok || probe.code !== 0 || /No module named pip/i.test(probe.output)) {
                return NextResponse.json(
                    {
                        error:
                            "pip is not installed in this environment, so PyPI version checks are unavailable. " +
                            "Install it with `" +
                            (interpreter.endsWith("python.exe") ? interpreter : "python") +
                            " -m ensurepip --upgrade` (or `conda install pip`), then retry. " +
                            "The package LIST itself keeps working via importlib.metadata.",
                    },
                    {status: 400}
                );
            }
            const res = await runPip(interpreter, ["list", "--outdated", "--format", "json"]);
            let outdated: Array<{ name: string; version: string; latest: string }> = [];
            try {
                const start = res.output.indexOf("[");
                if (start >= 0) {
                    const arr = JSON.parse(res.output.slice(start)) as Array<{
                        name?: string; version?: string; latest_version?: string;
                    }>;
                    outdated = arr
                        .filter((p) => p && typeof p.name === "string")
                        .map((p) => ({
                            name: p.name as string,
                            version: String(p.version ?? "?"),
                            latest: String(p.latest_version ?? "?"),
                        }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                }
            } catch { /* empty */
            }
            return NextResponse.json({ok: true, outdated, output: res.output.slice(-1_000)});
        }

        if (action === "upgrade" || action === "uninstall") {
            const pkg = (body.package ?? "").trim();
            if (!pkg || !validPackageName(pkg)) {
                return NextResponse.json(
                    {error: "Invalid package name."},
                    {status: 400}
                );
            }
            const args = action === "upgrade"
                ? ["install", "--upgrade", pkg]
                : ["uninstall", "-y", pkg];
            const res = await runPip(interpreter, args);
            return NextResponse.json({ok: res.ok, package: pkg, action, output: res.output});
        }

        if (action === "install") {
            // A new package (optionally with a ==/>=/… version spec). The
            // spec validator keeps pip flags off the argv.
            const pkg = (body.package ?? "").trim();
            if (!pkg || !validPackageSpec(pkg)) {
                return NextResponse.json(
                    {error: "Invalid package (name or name==version expected)."},
                    {status: 400}
                );
            }
            const res = await runPipLong(interpreter, ["install", pkg]);
            return NextResponse.json({ok: res.ok, package: pkg, action, output: res.output});
        }

        if (action === "upgrade-all") {
            // Every outdated package in ONE pass. Names come from the
            // manager's outdated list (already validated client-side),
            // but they are re-validated here all the same.
            const pkgs = (body.packages ?? [])
                .map((p) => (p ?? "").trim())
                .filter((p) => p.length > 0);
            if (pkgs.length === 0) {
                return NextResponse.json({error: "No packages to upgrade."}, {status: 400});
            }
            for (const p of pkgs) {
                if (!validPackageName(p)) {
                    return NextResponse.json({error: `Invalid package name: ${p}`}, {status: 400});
                }
            }
            const res = await runPipLong(interpreter, ["install", "--upgrade", ...pkgs]);
            return NextResponse.json({ok: res.ok, action, count: pkgs.length, output: res.output});
        }

        if (action === "pin") {
            // Freeze CURRENT versions into requirements.txt at the ACTIVE
            // project root — the project becomes reproducible on any
            // machine. pip freeze first; importlib.metadata fallback when
            // the env has no pip (same distributions, name==version lines).
            let lines: string[] = [];
            const freezeRes = await runPip(interpreter, ["freeze"]);
            const pipWorks =
                freezeRes.ok && freezeRes.code === 0 && !/No module named pip/i.test(freezeRes.output);
            if (pipWorks) {
                lines = freezeRes.output
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0 && !l.startsWith("#"));
            } else {
                const metaRes = await runCmd(interpreter, ["-c", IMPORTLIB_FREEZE_SCRIPT]);
                lines = metaRes.output
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0 && !l.startsWith("#"));
            }
            if (lines.length === 0) {
                return NextResponse.json(
                    {error: "Nothing to pin — no installed packages were found."},
                    {status: 500}
                );
            }
            const header = "# Pinned by Praxis Dependency Manager on " +
                new Date().toISOString().slice(0, 10) + "\n";
            const content = header + lines.join("\n") + "\n";
            await writeFile(path.join(getScriptsRoot(), "requirements.txt"), content, "utf-8");
            const manifests = await currentManifests();
            return NextResponse.json({
                ok: true,
                requirements: content,
                count: lines.length,
                method: pipWorks ? "pip freeze" : "importlib.metadata",
                pyproject: manifests.pyproject,
                declared: manifests.declared,
                manifests: manifests.manifests,
            });
        }

        if (action === "pin-package") {
            // Pin ONE installed package at its CURRENT version into the
            // manifest it came from — a `name==version` line in
            // requirements.txt, or a minimal in-place replacement of the
            // entry inside the pyproject.toml dependency arrays. The plan is
            // pure (lib/manifest-deps); this handler only validates +
            // writes, and for pyproject.toml it re-parses AFTER the write
            // and RESTORES the original content when that parse fails.
            const pkg = (body.package ?? "").trim();
            const version = (body.version ?? "").trim();
            if (!pkg || !validPackageName(pkg)) {
                return NextResponse.json({error: "Invalid package name."}, {status: 400});
            }
            // PEP 440-ish version: no whitespace, quotes, brackets or
            // separators — strictly the characters a version string can
            // carry, so nothing smuggles a newline/operator into the
            // manifest line we write.
            if (!/^[A-Za-z0-9][A-Za-z0-9.+!-]{0,63}$/.test(version)) {
                return NextResponse.json(
                    {error: "Invalid or missing version for the pin."},
                    {status: 400}
                );
            }
            const current = await currentManifests();
            const plan = planPinPackage({
                name: pkg,
                version,
                requirements: current.requirements,
                pyproject: current.pyproject,
            });

            // requirements.txt half (plain text — a merge, never a
            // reflow, of the existing lines).
            if (plan.requirements != null) {
                await writeFile(
                    path.join(getScriptsRoot(), "requirements.txt"),
                    plan.requirements,
                    "utf-8"
                );
            }

            // pyproject.toml half — written only after the pure plan
            // validated its own edit, then VERIFIED by re-reading and
            // re-parsing the file from disk; a failed verify RESTORES the
            // backup content so a broken TOML never survives the request.
            if (plan.pyproject != null && current.pyproject != null) {
                const backup = current.pyproject;
                const pyprojectPath = path.join(getScriptsRoot(), "pyproject.toml");
                await writeFile(pyprojectPath, plan.pyproject, "utf-8");
                try {
                    const reread = await readFile(pyprojectPath, "utf-8");
                    if (!validatePyprojectPin(reread, backup, pkg, version)) {
                        await writeFile(pyprojectPath, backup, "utf-8");
                        return NextResponse.json(
                            {
                                ok: false,
                                error:
                                    "pyproject.toml failed to re-parse after the pin write — the original file was restored; pin again (or pin to requirements.txt).",
                            },
                            {status: 500}
                        );
                    }
                } catch {
                    await writeFile(pyprojectPath, backup, "utf-8");
                    return NextResponse.json(
                        {
                            ok: false,
                            error:
                                "pyproject.toml could not be read back after the pin write — the original file was restored.",
                        },
                        {status: 500}
                    );
                }
            }

            const manifests = await currentManifests();
            return NextResponse.json({
                ok: true,
                package: pkg,
                version,
                wrote: plan.wrote,
                fellBack: plan.fellBack,
                ...(plan.reason ? {reason: plan.reason} : {}),
                declaredIn: plan.declaredIn,
                count: 1,
                method: "pin-package",
                requirements: manifests.requirements,
                pyproject: manifests.pyproject,
                declared: manifests.declared,
                manifests: manifests.manifests,
            });
        }

        return NextResponse.json(
            {error: `Unknown action "${action}". Use outdated | upgrade | upgrade-all | uninstall | install | pin | pin-package.`},
            {status: 400}
        );
    } catch (err) {
        return NextResponse.json(
            {error: err instanceof Error ? err.message : "Dependency action failed."},
            {status: 500}
        );
    }
}
