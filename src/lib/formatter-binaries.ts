import {type ChildProcess, spawn} from "node:child_process";
import path from "node:path";

/**
 * formatter-binaries.ts — real formatter binaries for the non-Python
 * formattable kinds, Windows-safe.
 *
 * The offline built-in engines (lib/format-any.ts) always work, but the
 * user's machines often have the canonical industry formatters on PATH
 * (`prettier`, `gofmt`/`gofumpt`, `rubocop`). Format Document should
 * prefer the REAL engine when it exists — its output is the one every
 * other tool in the user's ecosystem produces — and silently fall back
 * to the built-in pass when the binary is missing or fails. A formatter
 * that is not installed must NEVER surface as an error page.
 *
 * WINDOWS RULES (F:\Praxis + bun):
 * ▸ every spawn uses an ARGUMENT ARRAY — never a shell string, and
 *   never `shell: true` (the classic argv-injection foot-gun);
 * ▸ `prettier`/`rubocop` installed through npm/bundler on Windows are
 *   `.cmd`/`.bat` shims: modern Node REFUSES to spawn those directly
 *   (EINVAL — the CVE-2024-27980 hardening). When a direct spawn fails
 *   with EINVAL we retry through `%ComSpec% /d /s /c <bin> <args…>` —
 *   still an argv array, the binary name and every argument stay
 *   separate elements, and nothing user-controlled ever reaches the
 *   command line (the SOURCE travels over stdin, never argv);
 * ▸ existence probing uses `<bin> --version`: `gofmt` does not know
 *   `--version` and exits 2 with usage — a process that LAUNCHED still
 *   proves the binary is on PATH, which is all the probe needs.
 *
 * Probe results are cached per-process with a short TTL so a missing
 * binary costs one spawn per minute at most (format-on-save can fire
 * many times a minute).
 */

/** How long a probe result (available OR missing) is trusted. */
const PROBE_TTL_MS = 60_000;
/** Short cap for the `--version` probe — a slow-to-start binary is as
 *  good as absent for an interactive Format Document. */
const PROBE_TIMEOUT_MS = 4_000;
/** Hard cap for one real formatting pass (matches the route's black cap). */
export const BINARY_FORMAT_TIMEOUT_MS = 30_000;

/** The real-world formatter binaries this module can drive. `ruff` is
 *  the Python formatter (black-compatible output) — the route prefers it
 *  over black and keeps black as the fallback, mirroring the same
 *  standalone-binary discovery /api/lint uses. */
export type FormatterToolName = "prettier" | "gofmt" | "rubocop" | "ruff";

/** Kinds whose canonical formatter is prettier (core parsers only —
 *  plugin-only grammars fall back to the built-in engines). */
const PRETTIER_KINDS: ReadonlySet<string> = new Set([
    "javascript",
    "typescript",
    "json",
    "css",
    "html",
    "markdown",
    "yaml",
]);

/** Which real binary covers a formattable kind (null = built-in only). */
export function formatterToolForKind(kind: string): FormatterToolName | null {
    if (kind === "go") return "gofmt";
    if (kind === "ruby") return "rubocop";
    if (PRETTIER_KINDS.has(kind)) return "prettier";
    return null;
}

/** prettier's `--parser` value for a kind + concrete file name. The
 *  file name matters for the css dialects (scss / less have their own
 *  core parsers; `.sass` is unsupported and will fail → built-in
 *  fallback, which is the honest outcome). Returns null when the kind
 *  has no prettier parser at all. */
export function prettierParserFor(kind: string, fileName: string): string | null {
    switch (kind) {
        case "javascript":
            return "babel";
        case "typescript":
            return "typescript";
        case "json":
            return "json";
        case "css": {
            const ext = path.extname(fileName).toLowerCase();
            if (ext === ".scss") return "scss";
            if (ext === ".less") return "less";
            return "css";
        }
        case "html":
            return "html";
        case "markdown":
            return "markdown";
        case "yaml":
            return "yaml";
        default:
            return null;
    }
}

/* ── the spawn primitive ─────────────────────────────────────────── */

interface SpawnOutcome {
    /** The process actually started (close fired) — for the PROBE this is
     *  the availability signal; exit codes like gofmt's usage error (2)
     *  still prove the binary exists. */
    launched: boolean;
    /** Exit code (null when killed by the timeout or never launched). */
    code: number | null;
    stdout: string;
    stderr: string;
}

interface SpawnOptions {
    stdin?: string;
    timeoutMs: number;
    cwd?: string;
    /** Probe calls run `<bin> --version`; a real formatter run should
     *  never be mistaken for cmd.exe's not-found shape (exit 1 + empty
     *  stdout). */
    isProbe?: boolean;
}

/** Plain argv-array spawn with stdin + timeout + output capture.
 *  NEVER a shell string — `shell` stays off for every path here. */
function spawnCollect(
    bin: string,
    args: string[],
    opts: SpawnOptions
): Promise<SpawnOutcome> {
    // turbopackIgnore: the formatter binary is resolved at RUNTIME
    // (per-project interpreter / PATH lookup) — never a build-time path.
    return new Promise<SpawnOutcome>((resolve) => {
        let child: ChildProcess;
        try {
            child = spawn(/* turbopackIgnore: true */ bin, args, {
                cwd: opts.cwd,
                env: process.env,
                stdio: ["pipe", "pipe", "pipe"],
            });
        } catch (err) {
            resolve({launched: false, code: null, stdout: "", stderr: spawnErrText(err)});
            return;
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (launched: boolean, code: number | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({launched, code, stdout, stderr});
        };
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
            // A hung formatter is a FAILED formatter — the caller falls back
            // to the built-in engine instead of waiting forever.
            finish(true, null);
        }, opts.timeoutMs);
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        child.on("close", (code) => finish(true, code));
        child.on("error", () => finish(false, null));
        if (typeof opts.stdin === "string") {
            try {
                child.stdin?.write(opts.stdin, "utf-8");
            } catch { /* child died early */
            }
        }
        try {
            child.stdin?.end();
        } catch { /* ignore */
        }
    });
}

function spawnErrText(err: unknown): string {
    const e = err as NodeJS.ErrnoException | null;
    return `spawn error: ${e?.code ?? e?.message ?? "unknown"}`;
}


/** Windows-only fallback route for .cmd/.bat shims: run the binary
 *  through `%ComSpec% /d /s /c` — STILL an argument array (the binary
 *  name and every flag ride as separate argv elements; the source
 *  itself never appears here at all, it travels over stdin). */
function spawnCollectViaCmd(
    bin: string,
    args: string[],
    opts: SpawnOptions
): Promise<SpawnOutcome> {
    const comspec = process.env.ComSpec ?? "cmd.exe";
    return new Promise<SpawnOutcome>((resolve) => {
        let child: ChildProcess;
        try {
            // turbopackIgnore: the cmd shim target is resolved at RUNTIME
            // (the binary name and every flag ride as separate argv elements).
            child = spawn(/* turbopackIgnore: true */ comspec, ["/d", "/s", "/c", bin, ...args], {
                cwd: opts.cwd,
                env: process.env,
                stdio: ["pipe", "pipe", "pipe"],
            });
        } catch (err) {
            resolve({launched: false, code: null, stdout: "", stderr: spawnErrText(err)});
            return;
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (launched: boolean, code: number | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({launched, code, stdout, stderr});
        };
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
            finish(true, null);
        }, opts.timeoutMs);
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        child.on("close", (code) => {
            // cmd.exe reports "not on PATH" by PRINTING it and exiting 1 —
            // "'prettier' is not recognized as an internal or external
            // command" — so a launched cmd.exe is not proof the BINARY
            // launched. Treat that message (and, for localized Windows where
            // the text is not English, an exit-1 with NO stdout — a real
            // formatter always prints something) as not-launched.
            // Misjudging "missing" is always safe: the caller just uses the
            // built-in formatter.
            const combined = `${stdout}\n${stderr}`;
            if (/is not recognized/i.test(combined)) {
                finish(false, code);
                return;
            }
            if (code === 1 && stdout.trim() === "" && opts.isProbe) {
                finish(false, code);
                return;
            }
            finish(true, code);
        });
        child.on("error", () => finish(false, null));
        if (typeof opts.stdin === "string") {
            try {
                child.stdin?.write(opts.stdin, "utf-8");
            } catch { /* child died early */
            }
        }
        try {
            child.stdin?.end();
        } catch { /* ignore */
        }
    });
}

/** Spawn a binary, transparently retrying through cmd.exe on Windows
 *  when the direct spawn can't launch (.cmd/.bat shims / PATH lookup
 *  quirks). Non-Windows platforms never retry — a failed spawn there
 *  simply means the binary is absent. */
async function spawnBinary(
    bin: string,
    args: string[],
    opts: SpawnOptions
): Promise<SpawnOutcome> {
    const direct = await spawnCollect(bin, args, opts);
    if (direct.launched) return direct;
    if (process.platform !== "win32") return direct;
    // Windows: both ENOENT ("prettier" only resolves to the prettier.cmd
    // shim, which a direct CreateProcess spawn cannot execute) and
    // EINVAL (Node's .cmd/.bat hardening on the explicit-shim spawn) are
    // covered by the cmd.exe route below — it searches PATH with the
    // PATHEXT rules the direct spawn lacks.
    return spawnCollectViaCmd(bin, args, opts);
}

/* ── availability probing (cached, short TTL) ───────────────────── */

interface ProbeEntry {
    at: number;
    /** The binary name that was proven to launch (null = none of the
     *  candidates for this tool is on PATH). */
    bin: string | null;
}

const probeCache = new Map<FormatterToolName, ProbeEntry>();

/** Candidate binaries per tool, in preference order. gofmt ships with
 *  every Go toolchain; gofumpt is the stricter superset some machines
 *  add on top — gofmt is probed first because it is the one that is
 *  always there when Go is installed at all. */
const TOOL_CANDIDATES: Record<FormatterToolName, string[]> = {
    gofmt: ["gofmt", "gofumpt"],
    rubocop: ["rubocop"],
    prettier: ["prettier"],
    ruff: ["ruff"],
};

/** Does `<bin> --version` launch at all? A non-zero exit is fine —
 *  gofmt answers `--version` with a usage error (exit 2) while still
 *  proving it exists; only a failed LAUNCH (ENOENT / cmd
 *  not-recognized) means "not installed". */
async function binaryLaunches(bin: string): Promise<boolean> {
    const res = await spawnBinary(bin, ["--version"], {
        timeoutMs: PROBE_TIMEOUT_MS,
        isProbe: true,
    });
    return res.launched;
}

/** Probe every candidate for a tool and return the first one that
 *  launches. Result is cached per-process for PROBE_TTL_MS so
 *  format-on-save doesn't pay a spawn (or a failed PATH walk) every
 *  keystroke-save. `force` bypasses the cache (used by tests/debug). */
export async function probeFormatterTool(
    tool: FormatterToolName,
    force = false
): Promise<string | null> {
    const cached = probeCache.get(tool);
    if (!force && cached && Date.now() - cached.at < PROBE_TTL_MS) {
        return cached.bin;
    }
    let found: string | null = null;
    for (const bin of TOOL_CANDIDATES[tool]) {
        if (await binaryLaunches(bin)) {
            found = bin;
            break;
        }
    }
    probeCache.set(tool, {at: Date.now(), bin: found});
    return found;
}

/** Drop the probe cache (exposed so future tests / a "re-check
 *  formatters" affordance can force a fresh probe). */
export function resetFormatterProbes(): void {
    probeCache.clear();
}

/* ── running a real formatter over stdin ────────────────────────── */

export interface BinaryFormatterRequest {
    tool: FormatterToolName;
    /** Absolute path of the file on disk — only used for cwd (rubocop
     *  resolves .rubocop.yml from it) and never as an argv payload. */
    absPath: string;
    /** Base file name — rubocop's `--stdin` virtual name and prettier's
     *  `--stdin-filepath` (parser inference + config resolution). */
    fileName: string;
    /** The source to format — travels over STDIN, never argv. */
    source: string;
}

export interface BinaryFormatterResult {
    /** A real binary ran AND produced usable output. false → the caller
     *  falls back to the built-in engine (never an error page). */
    ran: boolean;
    /** The formatted source when `ran`, else null. */
    output: string | null;
    /** Which binary produced the output ("prettier" / "gofmt" / …) — the
     *  truthful value for the response's `formatter` field. */
    bin: string | null;
    /** First line of the failure diagnostics — purely informational. */
    detail?: string;
}

/** Extract rubocop's corrected source from its `--stdin` report. With
 *  `--autocorrect --stdin <name>.rb`, rubocop prints the offense report
 *  first and the corrected source after a separator line of twenty-plus
 *  `=` characters. No separator → the run is treated as a failure so
 *  the caller falls back (an edited-but-unparsed stream must never
 *  replace the user's source). */
export function extractRubocopSource(stdout: string): string | null {
    const lines = stdout.split(/\r?\n/);
    let sep = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/^={20,}$/.test(lines[i].trim())) {
            sep = i;
            break;
        }
    }
    if (sep < 0) return null;
    let start = sep + 1;
    while (start < lines.length && lines[start].trim() === "") start++;
    const body = lines.slice(start).join("\n");
    return body.length > 0 ? body : null;
}

/** Build the argv for one tool. Fixed literals + the base file name —
 *  never the source (stdin) and never a shell string. prettier's argv
 *  is assembled in runFormatterBinary (it carries the parser). */
function toolArgs(tool: FormatterToolName, req: BinaryFormatterRequest): string[] | null {
    switch (tool) {
        case "gofmt":
            // gofmt / gofumpt read stdin and write the formatted source to
            // stdout with NO flags at all.
            return [];
        case "rubocop":
            // `--autocorrect` = the safe corrections (Layout cops — exactly
            // the formatting family). Exit code 1 with remaining offenses is
            // still a successful format when the separator is present.
            return ["--autocorrect", "--stdin", req.fileName];
        default:
            return null;
    }
}

/** Run the real formatter for a kind over the source on stdin.
 *  `parser` is the prettier parser for the kind (ignored by the other
 *  tools) — kept in the signature so the caller owns the kind→parser
 *  mapping and this module stays free of FileKind knowledge. */
export async function runFormatterBinary(
    req: BinaryFormatterRequest,
    parser?: string
): Promise<BinaryFormatterResult> {
    const bin = await probeFormatterTool(req.tool);
    if (!bin) {
        return {ran: false, output: null, bin: null};
    }
    let args: string[];
    if (req.tool === "prettier") {
        // Explicit --parser wins over the filepath inference and keeps the
        // mapping deterministic (e.g. .jsonl → json); --stdin-filepath lets
        // prettier still pick up the project's .prettierrc relative to the
        // real file.
        args = ["--parser", parser ?? "babel", "--stdin-filepath", req.fileName];
    } else {
        const built = toolArgs(req.tool, req);
        if (!built) return {ran: false, output: null, bin: null};
        args = built;
    }
    const cwd = path.dirname(req.absPath);
    const res = await spawnBinary(bin, args, {
        stdin: req.source,
        timeoutMs: BINARY_FORMAT_TIMEOUT_MS,
        cwd,
    });
    if (!res.launched) {
        return {ran: false, output: null, bin: null, detail: "binary did not launch"};
    }
    if (req.tool === "rubocop") {
        // rubocop exits 1 while STILL printing the corrected source after
        // the separator (uncorrectable offenses remain) — the separator,
        // not the exit code, decides success.
        const body = extractRubocopSource(res.stdout);
        if (body != null) return {ran: true, output: body, bin};
        return {ran: false, output: null, bin: null, detail: firstNonEmpty(res.stderr)};
    }
    // prettier / gofmt: exit 0 + non-empty stdout = success. Exit 1
    // (syntax error) or a timeout (code null) → fall back.
    if (res.code === 0 && res.stdout.length > 0) {
        return {ran: true, output: res.stdout, bin};
    }
    if (res.code === 0 && res.stdout.length === 0 && req.source.trim() === "") {
        // Formatting an effectively empty document is a success.
        return {ran: true, output: "", bin};
    }
    return {ran: false, output: null, bin: null, detail: firstNonEmpty(res.stderr)};
}

function firstNonEmpty(s: string): string | undefined {
    const line = s.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line ? line.slice(0, 200) : undefined;
}

/* ── ruff — the Python formatter + import organizer ──────────────── */

/** Arg builders — PURE (unit-tested) so the route, the /api/lint-style
 *  standalone layer and the `python -m ruff` interpreter-module layer
 *  all share one argv shape. Fixed literals + the file name only; the
 *  SOURCE always travels over stdin, never argv. */

/** argv for `ruff format` over STDIN — the ruff twin of black's STDIN
 *  mode (`black -`): ruff has no `-c` argv fast path, so the source
 *  never appears on the command line at all. `--stdin-filename` (when
 *  a real file backs the buffer) lets ruff resolve the project's
 *  pyproject.toml/ruff.toml exactly like it would for the file on disk. */
export function ruffFormatStdinArgs(fileName?: string): string[] {
    return fileName
        ? ["format", "--stdin-filename", fileName, "-"]
        : ["format", "-"];
}

/** argv for the in-place disk pass `ruff format <absPath>` (mirrors
 *  `black --quiet <absPath>` — writes the file, prints nothing). */
export function ruffFormatDiskArgs(absPath: string): string[] {
    return ["format", absPath];
}

/** argv for import organization over STDIN — `ruff check --select I
 *  --fix`: with `--fix` on stdin the REPAIRED source is printed to
 *  stdout (diagnostics ride stderr), exactly the shape the lint route
 *  uses for its live buffers. `--no-cache` mirrors /api/lint so a
 *  stale cache never masks a fix. */
export function ruffOrganizeStdinArgs(fileName: string): string[] {
    return [
        "check",
        "--select",
        "I",
        "--fix",
        "--no-cache",
        "--stdin-filename",
        fileName,
        "-",
    ];
}

/** argv for in-place import organization — `ruff check --select I
 *  --fix <absPath>` writes the fixes back to disk. */
export function ruffOrganizeDiskArgs(absPath: string): string[] {
    return ["check", "--select", "I", "--fix", "--no-cache", absPath];
}

/** The ruff runners' shared result: `ran` follows the
 *  runFormatterBinary contract — false means "fall back" (never an
 *  error page; the black path decides what an error looks like). */
export interface RuffResult {
    /** ruff launched AND completed usefully. */
    ran: boolean;
    /** The formatted/repaired source for stdin runs (null otherwise). */
    output: string | null;
    /** Which binary produced it ("ruff" when the standalone ran). */
    bin: string | null;
    /** First line of the failure diagnostics — informational. */
    detail?: string;
}

/** Run standalone `ruff format -` over the source. Exit 0 + stdout
 *  (or an effectively-empty source) = success; a missing binary, a
 *  syntax error or a timeout = ran:false → the caller keeps black. */
export async function runRuffFormatStdin(
    source: string,
    fileName?: string
): Promise<RuffResult> {
    const bin = await probeFormatterTool("ruff");
    if (!bin) return {ran: false, output: null, bin: null};
    const res = await spawnBinary(bin, ruffFormatStdinArgs(fileName), {
        stdin: source,
        timeoutMs: BINARY_FORMAT_TIMEOUT_MS,
    });
    if (!res.launched) {
        return {ran: false, output: null, bin: null, detail: "binary did not launch"};
    }
    if (res.code === 0 && (res.stdout.length > 0 || source.trim() === "")) {
        return {ran: true, output: res.stdout, bin};
    }
    return {ran: false, output: null, bin: null, detail: firstNonEmpty(res.stderr)};
}

/** Run standalone `ruff format <absPath>` in place. Exit 0 = the pass
 *  completed (ruff format only exits non-zero on real errors — 1 is
 *  reserved for `--check`, which this invocation never passes). */
export async function runRuffFormatDisk(absPath: string): Promise<RuffResult> {
    const bin = await probeFormatterTool("ruff");
    if (!bin) return {ran: false, output: null, bin: null};
    const res = await spawnBinary(bin, ruffFormatDiskArgs(absPath), {
        timeoutMs: BINARY_FORMAT_TIMEOUT_MS,
        cwd: path.dirname(absPath),
    });
    if (!res.launched) {
        return {ran: false, output: null, bin: null, detail: "binary did not launch"};
    }
    if (res.code === 0) return {ran: true, output: null, bin};
    return {ran: false, output: null, bin: null, detail: firstNonEmpty(res.stderr)};
}

/** Run standalone `ruff check --select I --fix -` over the source.
 *  Exit 0 (clean) AND exit 1 (unfixable I-violations remain) both carry
 *  the repaired source on stdout — the source, not the exit code,
 *  decides success (the rubocop-separator lesson). */
export async function runRuffOrganizeStdin(
    source: string,
    fileName: string
): Promise<RuffResult> {
    const bin = await probeFormatterTool("ruff");
    if (!bin) return {ran: false, output: null, bin: null};
    const res = await spawnBinary(bin, ruffOrganizeStdinArgs(fileName), {
        stdin: source,
        timeoutMs: BINARY_FORMAT_TIMEOUT_MS,
    });
    if (!res.launched) {
        return {ran: false, output: null, bin: null, detail: "binary did not launch"};
    }
    if ((res.code === 0 || res.code === 1) && (res.stdout.length > 0 || source.trim() === "")) {
        return {ran: true, output: res.stdout, bin};
    }
    return {ran: false, output: null, bin: null, detail: firstNonEmpty(res.stderr)};
}

/** Run standalone `ruff check --select I --fix <absPath>` in place.
 *  Exit 1 = fixes applied with (unfixable) violations remaining — still
 *  a completed organize pass; the route reads the file back either way. */
export async function runRuffOrganizeDisk(absPath: string): Promise<RuffResult> {
    const bin = await probeFormatterTool("ruff");
    if (!bin) return {ran: false, output: null, bin: null};
    const res = await spawnBinary(bin, ruffOrganizeDiskArgs(absPath), {
        timeoutMs: BINARY_FORMAT_TIMEOUT_MS,
        cwd: path.dirname(absPath),
    });
    if (!res.launched) {
        return {ran: false, output: null, bin: null, detail: "binary did not launch"};
    }
    if (res.code === 0 || res.code === 1) return {ran: true, output: null, bin};
    return {ran: false, output: null, bin: null, detail: firstNonEmpty(res.stderr)};
}
