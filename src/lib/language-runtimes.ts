/**
 * the LANGUAGE RUNTIMES registry (server-side).
 *
 * Every non-Python language gets:
 * ▸ an INSTALLED check (fast, cached) surfaced through
 * GET /api/runtime-check and the Settings → Python → "Other
 * language runtimes" panel;
 * ▸ a runnable definition (command + argv + cwd) used by POST
 * /api/run when the client passes body.language;
 * ▸ an INSTALL HINT — when the runtime is missing, Run shows a
 * toast telling the user exactly what to install.
 *
 * Supported languages: JavaScript (node), TypeScript (tsx → Node ≥
 * 22.6 strip-types → deno), MATLAB (matlab -batch → GNU Octave), R
 * (Rscript), shell (bash), Java (single-file), C (gcc), C++ (g++),
 * Ruby, PHP, Go, Lua, Perl, Rust (rustc compile + run), Julia,
 * Kotlin (script), Swift, Zig (zig run), Dart, Groovy, Scala,
 * Elixir — plus the Windows-native pair PowerShell (.ps1; pwsh with
 * a powershell.exe fallback) and Batch (.bat /.cmd via cmd.exe).
 */
import {spawn} from "node:child_process";
import path from "node:path";

/* ──────────────────────────────────────────────────────────────────
 * Detection helpers.
 * ────────────────────────────────────────────────────────────────── */

const DETECT_TIMEOUT_MS = 5000;

export interface RuntimeStatus {
    id: string;
    label: string;
    /** Which language ids this runtime can execute. */
    languages: string[];
    ok: boolean;
    /** First line of `--version` output (or "" when only `which` matched). */
    version: string;
    command: string;
    /** Shown in the UI when the runtime is missing. */
    installHint: string;
}

/** Run `<cmd> <args>` and resolve the first non-empty output line. */
function probe(
    command: string,
    args: string[],
    opts: { timeoutMs?: number } = {}
): Promise<{ ok: boolean; version: string }> {
    return new Promise((resolve) => {
        let done = false;
        const finish = (ok: boolean, version: string) => {
            if (done) return;
            done = true;
            resolve({ok, version});
        };
        try {
            const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"]});
            let out = "";
            child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
            child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
            const timer = setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                } catch { /* ignore */
                }
                finish(false, "");
            }, opts.timeoutMs ?? DETECT_TIMEOUT_MS);
            child.on("error", () => {
                clearTimeout(timer);
                finish(false, "");
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                const line = out.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
                finish(code === 0 && line !== "", line);
            });
        } catch {
            finish(false, "");
        }
    });
}

/** MATLAB's `-version` style startup is way too slow to probe — the
 *  binary's EXISTENCE is the check (`which` / `where`). */
function probeWhich(command: string): Promise<boolean> {
    const finder = process.platform === "win32" ? "where" : "which";
    return new Promise((resolve) => {
        let done = false;
        const finish = (ok: boolean) => {
            if (!done) {
                done = true;
                resolve(ok);
            }
        };
        try {
            const child = spawn(finder, [command], {stdio: ["ignore", "pipe", "pipe"]});
            const timer = setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                } catch { /* ignore */
                }
                finish(false);
            }, DETECT_TIMEOUT_MS);
            child.on("error", () => {
                clearTimeout(timer);
                finish(false);
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                finish(code === 0);
            });
        } catch {
            finish(false);
        }
    });
}

/* ──────────────────────────────────────────────────────────────────
* Run plan builders — PURE (unit-tested without spawning).
* ────────────────────────────────────────────────────────────────── */

export interface RunPlan {
    command: string;
    argv: string[];
    /** Working directory for the child. */
    cwd: string;
    /** C/C++: an upfront compile step that must succeed first. */
    compile?: { command: string; argv: string[] };
    /** True when the primary command IS the compiled artifact. */
    runCompiled?: { command: string; argv: string[] };
    /** A note for the UI (e.g. MATLAB batch startup latency). */
    note?: string;
}

/** node plan — works for.js/.mjs/.cjs (JSX needs a transpiler). */
export function nodePlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "node", argv: [absPath, ...args], cwd};
}

/** TypeScript plan — the resolved runtime wins (tsx / node / deno). */
export function typescriptPlan(
    flavor: "tsx" | "node-strip" | "node" | "deno",
    absPath: string,
    args: string[],
    cwd: string
): RunPlan {
    if (flavor === "tsx") return {command: "tsx", argv: [absPath, ...args], cwd};
    if (flavor === "deno") return {command: "deno", argv: ["run", absPath, ...args], cwd};
    if (flavor === "node-strip")
        return {command: "node", argv: ["--experimental-strip-types", absPath, ...args], cwd};
    return {command: "node", argv: [absPath, ...args], cwd};
}

/** MATLAB plan — matlab -batch (slow startup) or GNU Octave. */
export function matlabPlan(
    flavor: "matlab" | "octave",
    absPath: string,
    args: string[],
    cwd: string
): RunPlan {
    if (flavor === "matlab") {
        // matlab -batch "run('script.m')" — forward slashes keep the
        // quoted path portable across platforms.
        const script = absPath.replace(/\\/g, "/");
        return {
            command: "matlab",
            argv: ["-batch", `run('${script}')`, ...args],
            cwd,
            note: "MATLAB batch mode can take 30 s or more to start — the run is not stuck.",
        };
    }
    return {command: "octave", argv: ["--no-gui", "-q", absPath, ...args], cwd};
}

/** C / C++: compile to a temp binary, then run it. */
export function cPlan(
    compiler: "gcc" | "g++" | "clang" | "clang++",
    absPath: string,
    binary: string,
    args: string[],
    cwd: string
): RunPlan {
    return {
        command: compiler,
        argv: [absPath, "-o", binary, ...args],
        cwd,
        compile: {command: compiler, argv: [absPath, "-o", binary]},
        runCompiled: {command: binary, argv: [...args]},
    };
}

export function rPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "Rscript", argv: [absPath, ...args], cwd};
}

export function shellPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "bash", argv: [absPath, ...args], cwd};
}

export function javaPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "java", argv: [absPath, ...args], cwd};
}

export function rubyPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "ruby", argv: [absPath, ...args], cwd};
}

export function phpPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "php", argv: [absPath, ...args], cwd};
}

export function goPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "go", argv: ["run", absPath, ...args], cwd};
}

/* ── the new language runtimes ──────────────────────────── */

/** Lua — `lua script.lua` (lua / luajit). */
export function luaPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "lua", argv: [absPath, ...args], cwd};
}

/** Perl — `perl script.pl`. */
export function perlPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "perl", argv: [absPath, ...args], cwd};
}

/** Rust — compile with rustc to a temp binary, then run it (like C). */
export function rustPlan(
    absPath: string,
    binary: string,
    args: string[],
    cwd: string
): RunPlan {
    return {
        command: "rustc",
        argv: [absPath, "-o", binary],
        cwd,
        compile: {command: "rustc", argv: [absPath, "-o", binary]},
        runCompiled: {command: binary, argv: [...args]},
    };
}

/** Julia — `julia script.jl`. */
export function juliaPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "julia", argv: [absPath, ...args], cwd};
}

/** Kotlin — `kotlin script.kts` script mode (the bundled runner). */
export function kotlinPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "kotlin", argv: [absPath, ...args], cwd};
}

/** Swift — `swift script.swift` (interpreter mode). */
export function swiftPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "swift", argv: [absPath, ...args], cwd};
}

/* ── the Windows-native scripting pair ─────────────────── */

/** PowerShell — pwsh when installed, else Windows PowerShell 5.1.
 *  -NoProfile keeps startup fast and deterministic; -ExecutionPolicy
 *  Bypass is scoped to THIS process so unsigned scripts run. */
export function powershellPlan(
    flavor: "pwsh" | "powershell",
    absPath: string,
    args: string[],
    cwd: string
): RunPlan {
    const command = flavor === "pwsh" ? "pwsh" : "powershell";
    return {
        command,
        argv: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", absPath, ...args],
        cwd,
    };
}

/** Batch — `cmd /c` runs the .bat / .cmd and propagates its exit code. */
export function batchPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "cmd", argv: ["/d", "/c", absPath, ...args], cwd};
}

/* ── the added language runtimes: Zig / Dart / Groovy / Scala / Elixir ─ */

/** Zig — `zig run file.zig` compiles to the local cache and executes in
 *  one step (no artifact lands in the project folder). */
export function zigPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {
        command: "zig",
        argv: ["run", absPath, ...args],
        cwd,
        note: "zig run compiles first — a short startup pause is normal.",
    };
}

/** Dart — `dart file.dart` runs a plain script (no package context needed). */
export function dartPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "dart", argv: ["run", absPath, ...args], cwd};
}

/** Groovy — `groovy file.groovy`. */
export function groovyPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "groovy", argv: [absPath, ...args], cwd};
}

/** Scala — `scala file.scala` (the Scala 3 script runner). */
export function scalaPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {
        command: "scala",
        argv: [absPath, ...args],
        cwd,
        note: "scala compiles the script before running — the first run can take a while.",
    };
}

/** Elixir — `elixir file.exs`. */
export function elixirPlan(absPath: string, args: string[], cwd: string): RunPlan {
    return {command: "elixir", argv: [absPath, ...args], cwd};
}

/* ──────────────────────────────────────────────────────────────────
 * The registry.
 * ────────────────────────────────────────────────────────────────── */

interface RuntimeDef {
    id: string;
    label: string;
    languages: string[];
    detect: () => Promise<{ ok: boolean; version: string }>;
    /** Build the run plan (languages with flavor pickers — typescript /
     * matlab / c — resolve through resolveLanguageRun instead). */
    plan?: (absPath: string, args: string[], cwd: string) => RunPlan;
    installHint: string;
}

/** Node version from a `v24.22.2` style line. */
function parseNodeVersion(version: string): { major: number; minor: number } {
    const m = /v?(\d+)\.(\d+)/.exec(version);
    return m ? {major: Number(m[1]), minor: Number(m[2])} : {major: 0, minor: 0};
}

async function detectTypescriptFlavor(): Promise<{
    ok: boolean;
    version: string;
    flavor?: "tsx" | "node-strip" | "node" | "deno";
}> {
    const tsx = await probe("tsx", ["--version"]);
    if (tsx.ok) return {ok: true, version: tsx.version, flavor: "tsx"};
    const node = await probe("node", ["--version"]);
    if (node.ok) {
        const {major, minor} = parseNodeVersion(node.version);
        if (major > 23 || (major === 23 && minor >= 6)) return {ok: true, version: node.version, flavor: "node"};
        if (major === 22 && minor >= 6) return {ok: true, version: node.version, flavor: "node-strip"};
        if (major === 24) return {ok: true, version: node.version, flavor: "node"};
    }
    const deno = await probe("deno", ["--version"]);
    if (deno.ok) return {ok: true, version: deno.version, flavor: "deno"};
    return {ok: false, version: ""};
}

export const RUNTIME_DEFS: RuntimeDef[] = [
    {
        id: "node",
        label: "Node.js (JavaScript)",
        languages: ["javascript"],
        detect: () => probe("node", ["--version"]),
        plan: (p, args, cwd) => nodePlan(p, args, cwd),
        installHint: "Install Node.js from nodejs.org (or your package manager) to run .js files.",
    },
    {
        id: "typescript",
        label: "TypeScript (tsx / Node ≥ 22.6 / deno)",
        languages: ["typescript"],
        detect: detectTypescriptFlavor,
        installHint: "Install tsx (npm i -g tsx), Node.js ≥ 22.6, or deno to run .ts files.",
    },
    {
        id: "matlab",
        label: "MATLAB / GNU Octave",
        languages: ["matlab"],
        detect: async () => {
            const hasMatlab = await probeWhich("matlab");
            if (hasMatlab) return {ok: true, version: "MATLAB (batch mode)"};
            const octave = await probe("octave", ["--version"]);
            return octave.ok ? {ok: true, version: octave.version} : {ok: false, version: ""};
        },
        installHint: "Install MATLAB (mathworks.com) or the free GNU Octave (apt install octave / brew install octave / octave.org) to run .m files.",
    },
    {
        id: "r",
        label: "R (Rscript)",
        languages: ["r"],
        detect: () => probe("Rscript", ["--version"]),
        plan: (p, args, cwd) => rPlan(p, args, cwd),
        installHint: "Install R from cran.r-project.org (Rscript comes with it) to run .R files.",
    },
    {
        id: "bash",
        label: "Bash (shell scripts)",
        languages: ["shell"],
        detect: () => probe("bash", ["--version"]),
        plan: (p, args, cwd) => shellPlan(p, args, cwd),
        installHint: "Install bash to run .sh scripts (present on every Linux and macOS).",
    },
    {
        id: "java",
        label: "Java (single-file)",
        languages: ["java"],
        detect: () => probe("java", ["-version"]),
        plan: (p, args, cwd) => javaPlan(p, args, cwd),
        installHint: "Install the JDK 11+ (adoptium.net) to run single-file .java programs.",
    },
    {
        id: "c",
        label: "C (gcc)",
        languages: ["c"],
        detect: () => probe("gcc", ["--version"]),
        plan: (p, args, cwd) => cPlan("gcc", p, path.join(cwd, "__praxis_c_binary"), args, cwd),
        installHint: "Install gcc (build-essential / Xcode CLT) to compile and run .c files.",
    },
    {
        id: "cpp",
        label: "C++ (g++)",
        languages: ["cpp"],
        detect: () => probe("g++", ["--version"]),
        plan: (p, args, cwd) => cPlan("g++", p, path.join(cwd, "__praxis_cpp_binary"), args, cwd),
        installHint: "Install g++ (build-essential / Xcode CLT) to compile and run .cpp files.",
    },
    {
        id: "ruby",
        label: "Ruby",
        languages: ["ruby"],
        detect: () => probe("ruby", ["--version"]),
        plan: (p, args, cwd) => rubyPlan(p, args, cwd),
        installHint: "Install Ruby from ruby-lang.org to run .rb files.",
    },
    {
        id: "php",
        label: "PHP",
        languages: ["php"],
        detect: () => probe("php", ["--version"]),
        plan: (p, args, cwd) => phpPlan(p, args, cwd),
        installHint: "Install PHP from php.net to run .php files.",
    },
    {
        id: "go",
        label: "Go",
        languages: ["go"],
        detect: () => probe("go", ["version"]),
        plan: (p, args, cwd) => goPlan(p, args, cwd),
        installHint: "Install Go from go.dev to run .go files.",
    },
    // ── the new language runtimes ─────────────────────────
    {
        id: "lua",
        label: "Lua",
        languages: ["lua"],
        detect: () => probe("lua", ["-e", "print(_VERSION)"]),
        plan: (p, args, cwd) => luaPlan(p, args, cwd),
        installHint: "Install Lua from lua.org (or `apt install lua5.4` / `brew install lua`) to run .lua files.",
    },
    {
        id: "perl",
        label: "Perl",
        languages: ["perl"],
        detect: () => probe("perl", ["-e", "print($]);"]),
        plan: (p, args, cwd) => perlPlan(p, args, cwd),
        installHint: "Install Perl from perl.org (present on Linux/macOS by default) to run .pl files.",
    },
    {
        id: "rust",
        label: "Rust",
        languages: ["rust"],
        detect: () => probe("rustc", ["--version"]),
        installHint: "Install the Rust toolchain from rustup.rs to compile and run .rs files.",
    },
    {
        id: "julia",
        label: "Julia",
        languages: ["julia"],
        detect: () => probe("julia", ["--version"]),
        plan: (p, args, cwd) => juliaPlan(p, args, cwd),
        installHint: "Install Julia from julialang.org to run .jl files.",
    },
    {
        id: "kotlin",
        label: "Kotlin",
        languages: ["kotlin"],
        detect: () => probe("kotlin", ["-version"]),
        plan: (p, args, cwd) => kotlinPlan(p, args, cwd),
        installHint: "Install Kotlin from kotlinlang.org (kotlin + kotlinc on PATH) to run .kts / .kt scripts.",
    },
    {
        id: "swift",
        label: "Swift",
        languages: ["swift"],
        detect: () => probe("swift", ["--version"]),
        plan: (p, args, cwd) => swiftPlan(p, args, cwd),
        installHint: "Install Swift from swift.org to run .swift files.",
    },
    // ── the Windows-native scripting pair ────────────────
    //  PowerShell prefers pwsh (7+) — cross-platform — and falls back to
    //  Windows PowerShell 5.1. Detection prints the PS version table's
    //  one-line form for a fast, informative status row.
    {
        id: "powershell",
        label: "PowerShell (pwsh / Windows PowerShell)",
        languages: ["powershell"],
        detect: async () => {
            const pwsh = await probe("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
            if (pwsh.ok) return {ok: true, version: `pwsh ${pwsh.version}`};
            const win = await probe("powershell", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
            return win.ok ? {ok: true, version: `Windows PowerShell ${win.version}`} : {ok: false, version: ""};
        },
        installHint: "Windows has PowerShell built in (powershell.exe); install PowerShell 7 (pwsh) from github.com/PowerShell/PowerShell for the modern cross-platform engine.",
    },
    //  Batch runs through cmd.exe — present on every Windows box; the
    //  `where cmd` probe keeps non-Windows machines honest.
    {
        id: "batch",
        label: "Batch (cmd.exe)",
        languages: ["batch"],
        detect: async () => {
            const ok = await probeWhich("cmd");
            return {ok, version: ok ? "cmd.exe" : ""};
        },
        installHint: "Batch files run through cmd.exe — available on every Windows installation.",
    },
    // ── the added language runtimes ─────────────────────────
    {
        id: "zig",
        label: "Zig",
        languages: ["zig"],
        detect: () => probe("zig", ["version"]),
        plan: (p, args, cwd) => zigPlan(p, args, cwd),
        installHint: "Install Zig from ziglang.org (or your package manager) to run .zig files.",
    },
    {
        id: "dart",
        label: "Dart",
        languages: ["dart"],
        detect: () => probe("dart", ["--version"]),
        plan: (p, args, cwd) => dartPlan(p, args, cwd),
        installHint: "Install the Dart SDK from dart.dev (or `brew install dart`) to run .dart files.",
    },
    {
        id: "groovy",
        label: "Groovy",
        languages: ["groovy"],
        detect: () => probe("groovy", ["--version"]),
        plan: (p, args, cwd) => groovyPlan(p, args, cwd),
        installHint: "Install Groovy from groovy-lang.org (or `brew install groovy`) to run .groovy files.",
    },
    {
        id: "scala",
        label: "Scala",
        languages: ["scala"],
        detect: () => probe("scala", ["-version"]),
        plan: (p, args, cwd) => scalaPlan(p, args, cwd),
        installHint: "Install Scala (scala + a JDK) from scala-lang.org to run .scala scripts.",
    },
    {
        id: "elixir",
        label: "Elixir",
        languages: ["elixir"],
        detect: () => probe("elixir", ["--version"]),
        plan: (p, args, cwd) => elixirPlan(p, args, cwd),
        installHint: "Install Elixir from elixir-lang.org (or `brew install elixir`) to run .exs / .ex files.",
    },
    {
        id: "haskell",
        label: "Haskell",
        languages: ["haskell"],
        detect: () => probe("runghc", ["--version"]),
        plan: (p, args, cwd) => ({command: "runghc", argv: [p, ...args], cwd}),
        installHint: "Install the GHC Haskell platform (ghcup, `brew install ghc` or choco) — runghc interprets .hs files directly.",
    },
    {
        id: "erlang",
        label: "Erlang",
        languages: ["erlang"],
        detect: () => probe("escript", ["-h"]),
        plan: (p, args, cwd) => ({command: "escript", argv: [p, ...args], cwd}),
        installHint: "Install Erlang/OTP (escript runs .erl scripts without a compile step).",
    },
    {
        id: "clojure",
        label: "Clojure",
        languages: ["clojure"],
        detect: async () => {
            // babashka first (fast startup), the JVM clojure CLI second.
            const bb = await probe("bb", ["--version"]);
            if (bb.ok) return bb;
            return probe("clojure", ["--version"]);
        },
        plan: (p, args, cwd) => ({command: "bb", argv: [p, ...args], cwd}),
        installHint: "Install babashka (the fast Clojure interpreter — `brew install babashka` / bbatomic) or the JVM clojure CLI.",
    },
    {
        id: "ocaml",
        label: "OCaml",
        languages: ["ocaml"],
        detect: () => probe("ocaml", ["-version"]),
        plan: (p, args, cwd) => ({command: "ocaml", argv: [p, ...args], cwd}),
        installHint: "Install OCaml (opam) — the `ocaml` binary interprets .ml scripts.",
    },
    {
        id: "fsharp",
        label: "F#",
        languages: ["fsharp"],
        detect: () => probe("dotnet", ["fsi", "--help"]),
        plan: (p, args, cwd) => ({command: "dotnet", argv: ["fsi", p, ...args], cwd}),
        installHint: "Install the .NET SDK — `dotnet fsi` executes .fsx F# scripts.",
    },
];

/* ──────────────────────────────────────────────────────────────────
 * Cached resolution.
 * ────────────────────────────────────────────────────────────────── */

interface CachedRuntime {
    status: RuntimeStatus;
    at: number;
    /** TypeScript flavor from the last detection. */
    tsFlavor?: "tsx" | "node-strip" | "node" | "deno";
    /** MATLAB flavor: prefer matlab, fall back to octave. */
    matlabFlavor?: "matlab" | "octave";
    /** PowerShell flavor — pwsh (7+) beats Windows PowerShell. */
    psFlavor?: "pwsh" | "powershell";
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedRuntime>();

async function resolveDef(def: RuntimeDef): Promise<CachedRuntime> {
    const hit = cache.get(def.id);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

    let status: RuntimeStatus;
    let extra: Partial<CachedRuntime> = {};
    if (def.id === "typescript") {
        const det = await detectTypescriptFlavor();
        status = {
            id: def.id,
            label: def.label,
            languages: def.languages,
            ok: det.ok,
            version: det.version,
            command: det.flavor ?? "",
            installHint: def.installHint,
        };
        extra = {tsFlavor: det.flavor};
    } else if (def.id === "matlab") {
        const hasMatlab = await probeWhich("matlab");
        const octave = hasMatlab ? {ok: false, version: ""} : await probe("octave", ["--version"]);
        status = {
            id: def.id,
            label: def.label,
            languages: def.languages,
            ok: hasMatlab || octave.ok,
            version: hasMatlab ? "MATLAB (batch mode)" : octave.version,
            command: hasMatlab ? "matlab" : "octave",
            installHint: def.installHint,
        };
        extra = {matlabFlavor: hasMatlab ? "matlab" : octave.ok ? "octave" : undefined};
    } else if (def.id === "powershell") {
        const pwsh = await probe("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
        const usePwsh = pwsh.ok;
        const win = usePwsh ? {
            ok: false,
            version: ""
        } : await probe("powershell", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
        status = {
            id: def.id,
            label: def.label,
            languages: def.languages,
            ok: usePwsh || win.ok,
            version: usePwsh ? `pwsh ${pwsh.version}` : win.ok ? `Windows PowerShell ${win.version}` : "",
            command: usePwsh ? "pwsh" : "powershell",
            installHint: def.installHint,
        };
        extra = {psFlavor: usePwsh ? "pwsh" : win.ok ? "powershell" : undefined};
    } else {
        const det = await def.detect();
        status = {
            id: def.id,
            label: def.label,
            languages: def.languages,
            ok: det.ok,
            version: det.version,
            command: def.id,
            installHint: def.installHint,
        };
    }
    const entry: CachedRuntime = {status, at: Date.now(), ...extra};
    cache.set(def.id, entry);
    return entry;
}

/** All runtime statuses (cached 60 s) — feeds /api/runtime-check. */
export async function getRuntimeStatuses(): Promise<RuntimeStatus[]> {
    const entries = await Promise.all(RUNTIME_DEFS.map((d) => resolveDef(d)));
    return entries.map((e) => e.status);
}

/** drop the cached detections so the next
 *  getRuntimeStatuses re-probes every runtime — the "Check again"
 *  button's FRESH re-detection (a cached answer made the click look
 *  like it did nothing). */
export function clearRuntimeCache(): void {
    cache.clear();
}

export interface ResolvedRun {
    plan?: RunPlan;
    installHint?: string;
    note?: string;
}

/** Resolve the run plan for a language id, or the install hint.
 * `binaryDir` is the per-run temp dir — C / C++ artifacts compile
 * there (never into the project folder the explorer watches). */
export async function resolveLanguageRun(
    language: string,
    absPath: string,
    args: string[],
    cwd: string,
    binaryDir?: string
): Promise<ResolvedRun> {
    const entry = await resolveDef(
        RUNTIME_DEFS.find((d) => d.languages.includes(language)) ??
        RUNTIME_DEFS.find((d) => d.id === language)!
    );
    const st = entry.status;
    if (!st.ok) return {installHint: st.installHint};

    if (language === "typescript") {
        const flavor = entry.tsFlavor ?? "node";
        return {plan: typescriptPlan(flavor, absPath, args, cwd)};
    }
    if (language === "matlab") {
        const flavor = entry.matlabFlavor ?? "matlab";
        const plan = matlabPlan(flavor, absPath, args, cwd);
        return {plan, note: plan.note};
    }
    if (language === "c" || language === "cpp") {
        const outDir = binaryDir && binaryDir.length > 0 ? binaryDir : cwd;
        const plan = language === "c"
            ? cPlan("gcc", absPath, path.join(outDir, "praxis_c_binary"), args, cwd)
            : cPlan("g++", absPath, path.join(outDir, "praxis_cpp_binary"), args, cwd);
        return {plan};
    }
    // rust compiles to the run temp dir, then runs the binary.
    if (language === "rust") {
        const outDir = binaryDir && binaryDir.length > 0 ? binaryDir : cwd;
        return {plan: rustPlan(absPath, path.join(outDir, "praxis_rust_binary"), args, cwd)};
    }
    if (language === "powershell") {
        const flavor = entry.psFlavor ?? "powershell";
        return {plan: powershellPlan(flavor, absPath, args, cwd)};
    }
    if (language === "batch") {
        return {plan: batchPlan(absPath, args, cwd)};
    }
    if (language === "zig") {
        return {plan: zigPlan(absPath, args, cwd), note: "zig run compiles first — a short startup pause is normal."};
    }
    const def = RUNTIME_DEFS.find((d) => d.languages.includes(language))!;
    if (!def.plan) return {installHint: def.installHint};
    return {
        plan: def.plan(absPath, args, cwd),
        note: def.id === "scala" ? "scala compiles the script before running — the first run can take a while." : undefined
    };
}
