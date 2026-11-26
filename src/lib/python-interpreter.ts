import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";

/**
 * Discover all Python interpreters available on the system, regardless
 * of OS. Probes:
 *   1. $VIRTUAL_ENV (if set)
 *   2. ~/.venv, ~/.virtualenvs/*
 *   3. conda envs (`conda env list --json`)
 *   4. pyenv versions (~/.pyenv/versions/*)
 *   5. uv-managed envs (`uv python list`)
 *   6. System python3 / python on PATH
 *
 * For each candidate, we check whether matplotlib/numpy/scipy are
 * importable so the UI can show "✓ has scientific stack" badges.
 */

export interface DiscoveredEnv {
    /** Absolute path to the python binary. */
    path: string;
    /** Display label, e.g. "venv: ~/.venv" or "conda: base". */
    label: string;
    /** Source: "venv", "conda", "pyenv", "uv", "system", "manual". */
    source: "venv" | "conda" | "pyenv" | "uv" | "system" | "manual";
    /** Python version string (e.g. "3.12.1"), if probeable. */
    version?: string;
    /** True if matplotlib + numpy + scipy are importable. */
    hasScientificStack: boolean;
}

let cachedEnvs: DiscoveredEnv[] | null = null;

/** Bare interpreter name for this platform. */
export function pickInterpreterName(): string {
    if (process.platform === "win32") return "python";
    return "python3";
}

/** Probe a single interpreter: returns {version, hasScientificStack}. */
async function probeInterpreter(
    interpreterPath: string
): Promise<{ version?: string; hasScientificStack: boolean }> {
    return new Promise((resolve) => {
        // Use newlines (not semicolons) for compound statements — Python
        // doesn't allow `for` / `try` after a semicolon on the same line.
        const script = [
            "import sys",
            "print(sys.version.split()[0])",
            "import importlib",
            "ok = True",
            "for m in ['matplotlib', 'numpy', 'scipy']:",
            "    try:",
            "        importlib.import_module(m)",
            "    except Exception:",
            "        ok = False",
            "print('STACK_OK' if ok else 'STACK_MISSING')",
        ].join("\n");
        const child = spawn(interpreterPath, ["-c", script], {
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timeout = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, 5000);
        child.on("close", (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                resolve({hasScientificStack: false});
                return;
            }
            const lines = stdout.trim().split("\n");
            const version = lines[0] || undefined;
            const hasScientificStack = stdout.includes("STACK_OK");
            resolve({version, hasScientificStack});
        });
        child.on("error", () => {
            clearTimeout(timeout);
            resolve({hasScientificStack: false});
        });
    });
}

/** Run a command and return its stdout (trimmed). 5s timeout. */
async function runCommand(
    cmd: string,
    args: string[]
): Promise<string | null> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });
        let stdout = "";
        const timeout = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* */
            }
        }, 5000);
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.on("close", () => {
            clearTimeout(timeout);
            resolve(stdout.trim() || null);
        });
        child.on("error", () => {
            clearTimeout(timeout);
            resolve(null);
        });
    });
}

/**
 * Discover all available Python environments on the system.
 * Results are cached for the process lifetime.
 */
export async function discoverEnvs(): Promise<DiscoveredEnv[]> {
    if (cachedEnvs) return cachedEnvs;

    const envs: DiscoveredEnv[] = [];
    const seen = new Set<string>();
    const add = async (
        interpreterPath: string,
        label: string,
        source: DiscoveredEnv["source"]
    ) => {
        // Normalize and dedupe.
        const normalized = path.resolve(interpreterPath);
        if (seen.has(normalized)) return;
        seen.add(normalized);

        // Check it exists + is executable.
        try {
            await fs.access(normalized, fs.constants.X_OK);
        } catch {
            return;
        }

        const probe = await probeInterpreter(normalized);
        envs.push({
            path: normalized,
            label,
            source,
            version: probe.version,
            hasScientificStack: probe.hasScientificStack,
        });
    };

    // 1. $VIRTUAL_ENV
    if (process.env.VIRTUAL_ENV) {
        const venvPython = process.platform === "win32"
            ? path.join(process.env.VIRTUAL_ENV, "Scripts", "python.exe")
            : path.join(process.env.VIRTUAL_ENV, "bin", "python");
        await add(venvPython, `venv: ${process.env.VIRTUAL_ENV}`, "venv");
    }

    // 2. ~/.venv
    if (os.homedir()) {
        const homeVenv = process.platform === "win32"
            ? path.join(os.homedir(), ".venv", "Scripts", "python.exe")
            : path.join(os.homedir(), ".venv", "bin", "python");
        await add(homeVenv, "venv: ~/.venv", "venv");

        // ~/.virtualenvs/*
        const virtualenvsDir = path.join(os.homedir(), ".virtualenvs");
        try {
            const entries = await fs.readdir(virtualenvsDir, {withFileTypes: true});
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const venvPython = process.platform === "win32"
                    ? path.join(virtualenvsDir, entry.name, "Scripts", "python.exe")
                    : path.join(virtualenvsDir, entry.name, "bin", "python");
                await add(venvPython, `venv: ${entry.name}`, "venv");
            }
        } catch { /* dir doesn't exist */
        }
    }

    // 3. conda envs
    const condaOutput = await runCommand("conda", ["env", "list", "--json"]);
    if (condaOutput) {
        try {
            const parsed = JSON.parse(condaOutput) as { envs?: string[] };
            for (const envPath of parsed.envs ?? []) {
                const envName = path.basename(envPath);
                const envPython = process.platform === "win32"
                    ? path.join(envPath, "python.exe")
                    : path.join(envPath, "bin", "python");
                await add(envPython, `conda: ${envName}`, "conda");
            }
        } catch { /* parse error */
        }
    }

    // 4. pyenv versions
    if (os.homedir()) {
        const pyenvDir = path.join(os.homedir(), ".pyenv", "versions");
        try {
            const entries = await fs.readdir(pyenvDir, {withFileTypes: true});
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const envPython = process.platform === "win32"
                    ? path.join(pyenvDir, entry.name, "python.exe")
                    : path.join(pyenvDir, entry.name, "bin", "python");
                await add(envPython, `pyenv: ${entry.name}`, "pyenv");
            }
        } catch { /* dir doesn't exist */
        }
    }

    // 5. uv-managed envs
    const uvOutput = await runCommand("uv", ["python", "list", "--format", "json"]);
    if (uvOutput) {
        try {
            const parsed = JSON.parse(uvOutput) as Array<{
                path?: string;
                version?: string;
            }>;
            for (const item of parsed) {
                if (item.path) {
                    await add(item.path, `uv: ${item.version ?? "unknown"}`, "uv");
                }
            }
        } catch { /* parse error */
        }
    }

    // 6. System python on PATH
    await add(pickInterpreterName(), "system (PATH)", "system");

    // Sort: has-scientific-stack first, then by label.
    envs.sort((a, b) => {
        if (a.hasScientificStack !== b.hasScientificStack) {
            return a.hasScientificStack ? -1 : 1;
        }
        return a.label.localeCompare(b.label);
    });

    cachedEnvs = envs;
    return envs;
}

/**
 * Find the best interpreter: prefer the first one with the scientific
 * stack, or the first one overall. Respects a manual override path
 * if provided.
 *
 * SECURITY: the override used to be returned verbatim
 * AND written to the module-global cache, so one request with
 * `interpreter: "/bin/sh"` executed a shell for that request and then
 * poisoned every later request — across all routes — until restart.
 * Now an override is only accepted when it is provably a Python
 * interpreter, and overrides never touch the cached default selection.
 */
let cachedInterpreter: string | null = null;

/**
 * Client-supplied interpreter paths that already passed the Python
 * probe. Only validated paths enter this set, so unvalidated values
 * can never leak into any cache.
 */
const validatedManualPaths = new Set<string>();

export async function findInterpreter(
    manualOverride?: string
): Promise<string> {
    // Fast path: no override, default already selected.
    if (!manualOverride && cachedInterpreter) return cachedInterpreter;

    const envs = await discoverEnvs();
    const defaultSelection = (): string => {
        const withStack = envs.find((e) => e.hasScientificStack);
        cachedInterpreter =
            withStack?.path ?? envs[0]?.path ?? pickInterpreterName();
        return cachedInterpreter;
    };

    if (!manualOverride) return defaultSelection();

    // A manual override is accepted in exactly two ways, and is NEVER
    // written to `cachedInterpreter`:
    //   1. an exact path match against the discoverEnvs allow-list, or
    //   2. an absolute path to a binary that answers a Python probe.
    // Anything else (e.g. "/bin/sh", a relative name, a non-Python
    // binary, a missing file) falls back to the default selection.
    if (!path.isAbsolute(manualOverride)) {
        // Bare/relative names like "python3" never identify a specific
        // binary; only allow-listed absolute paths may be spawned.
        return defaultSelection();
    }
    const requested = path.resolve(manualOverride);
    if (envs.some((e) => e.path === requested)) return requested;
    if (validatedManualPaths.has(requested)) return requested;

    // Probe once per unknown path: probeInterpreter spawns
    // `<path> -c "import sys; print(sys.version)..."`. Non-Python
    // binaries either exit non-zero (sh: "import: not found") or print
    // something that is not a version string (/bin/echo) — both are
    // rejected by the strict version check below.
    const probe = await probeInterpreter(requested);
    if (!probe.version || !/^\d+\.\d+(\.\d+)?/.test(probe.version)) {
        return defaultSelection();
    }
    validatedManualPaths.add(requested);
    return requested;
}

/** Reset the cache (used when settings change). */
export function resetInterpreterCache(): void {
    cachedInterpreter = null;
    cachedEnvs = null;
    validatedManualPaths.clear();
}
