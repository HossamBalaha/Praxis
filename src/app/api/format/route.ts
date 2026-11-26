import {NextResponse} from "next/server";
import {spawn} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileKindFromExt, resolveScriptPath} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {applyFormatPostProcessors, builtinFormat, type FormatPostSettings} from "@/lib/format-post";
import {getIndentSettings} from "@/lib/indent";
import {DEFAULT_SETTINGS, type Settings} from "@/lib/settings";
import {formattableKindFor} from "@/lib/formattable-kinds";
import {formatAnySource} from "@/lib/format-any";
import {
    formatterToolForKind,
    prettierParserFor,
    probeFormatterTool,
    ruffFormatDiskArgs,
    ruffFormatStdinArgs,
    ruffOrganizeDiskArgs,
    ruffOrganizeStdinArgs,
    runFormatterBinary,
    runRuffFormatDisk,
    runRuffFormatStdin,
    runRuffOrganizeDisk,
    runRuffOrganizeStdin,
} from "@/lib/formatter-binaries";
// platform-aware argv guard — `black -c <src>` carries the
// WHOLE source on the command line, which fails with ENAMETOOLONG /
// uv_spawn on Windows once the file passes the 32 767-char CreateProcess
// ceiling. Large sources switch to `black -` (true stdin mode).
import {MAX_INLINE_SCRIPT_BYTES} from "@/lib/spawn-limits";

/**
 * POST /api/format
 *
 * Body: { folder, file, content?, interpreter?, settings?, mode?, organizeImports? }
 *
 * ("add more control options in Formatting — all languages
 * and apply them correctly"): `settings` carries the caller's
 * Formatting slice (quote style, max blank lines, trim, comma
 * spacing, line endings…). It drives (a) the indent the BUILTIN
 * fallback uses and (b) applyFormatPostProcessors on EVERY path —
 * black output, ruff output, builtin output, disk mode — so the
 * options the user toggles in Settings → Formatting actually apply
 * to.py files and notebook cells, not just the offline formatters.
 * Missing/invalid `settings` falls back to DEFAULT_SETTINGS (the old
 * behavior).
 *
 * MODE: `mode: "organize"` (or `organizeImports: true`) is the
 * ORGANIZE-IMPORTS request — `ruff check --select I --fix`, nothing
 * else (no black, no built-in formatter, no Formatting post-passes:
 * organizing imports must never rewrite quotes / blank lines /
 * endings). Python only; ruff missing → a friendly 503 error body
 * the client can surface. Any other / absent `mode` value is the
 * normal format path (older callers that send e.g. mode:"string"
 * keep working untouched).
 *
 * If `content` is provided, formats it in-memory (ruff format / black
 * STDIN for Python, the real formatter binaries' STDIN for non-Python)
 * and returns the formatted source — does NOT touch disk. This is the
 * save-time path used by handleSaveEdit so the in-editor edits are
 * preserved (the content arrives on the request, never read from
 * disk).
 *
 * If `content` is NOT provided, the file is formatted IN PLACE on
 * disk and the new source returned so the UI can refresh.
 *
 * PYTHON prefers `ruff format` (black-compatible output) through the
 * SAME two-layer discovery /api/lint uses — standalone `ruff` binary
 * first, then `<interpreter> -m ruff` — and falls back to the exact
 * black pipeline unchanged when ruff is missing or fails. The built-in
 * formatter remains black's own fallback.
 *
 * NON-PYTHON formattable kinds (Go / Ruby / JS / TS / JSON / CSS /
 * HTML / Markdown / YAML …) run the REAL formatter binary first when
 * one is on PATH — gofmt/gofumpt for Go, rubocop for Ruby, prettier
 * for the prettier family — each probed ONCE per process with a
 * short TTL (lib/formatter-binaries). A missing binary, a non-zero
 * exit (syntax error) or a timeout silently falls back to the exact
 * BUILT-IN offline engines the viewer's Format Document uses
 * (lib/format-any), so formatting never errors out — it just tells
 * the truth about which engine ran.
 *
 * Response: { ok, formatted, content, changed?, fallback?, formatter?, error? }
 * (`content` mirrors `formatted` — keeps both spellings so older
 * clients and the diagnostics panel keep working; `formatter` names
 * the engine that produced the output — "ruff" / "black" / "prettier"
 * / "gofmt" / "rubocop" / "builtin" — and `fallback: "builtin"` is set
 * whenever the built-in pass ran).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 30_000; // hard cap so a hung black can't block the request

/** The format settings slice the route understands — every option the
 *  post-processors + the builtin formatter read. Extra keys the
 *  client sends are ignored (a whole Settings object is fine). */
type FormatSettings = Settings | FormatPostSettings;

/** Extract the caller's format settings (default-fused). */
function resolveFormatSettings(raw: unknown): Settings {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return {...DEFAULT_SETTINGS, ...(raw as Partial<Settings>)} as Settings;
    }
    return DEFAULT_SETTINGS;
}

export async function POST(request: Request) {
    let body: {
        folder?: string;
        file?: string;
        content?: string;
        interpreter?: string;
        settings?: FormatSettings;
        /** "organize" = the organize-imports request (ruff --select I --fix).
         *  Any other value (incl. legacy "string") = the normal format path. */
        mode?: string;
        /** Alternate spelling of mode:"organize" for the save hook. */
        organizeImports?: boolean;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const {folder, file, content, interpreter, mode, settings: rawSettings} = body;
    const organize = mode === "organize" || body.organizeImports === true;
    // the caller's Formatting options (fused with defaults).
    const fmtSettings = resolveFormatSettings(rawSettings);
    const post = (src: string, fileName?: string, kind?: string) =>
        applyFormatPostProcessors(src, fmtSettings, fileName, kind);

    // ── NOTEBOOK-CELL mode — `content` with NO folder/file ──
    // A .ipynb code cell is not a .py file on disk; it runs the SAME
    // ruff / black / built-in pipeline the .py editor's Format Document
    // uses (cells also get the full formatting, not just the offline
    // re-indent).
    if (typeof content === "string" && !folder && !file) {
        const py = await findInterpreter(interpreter);
        // ORGANIZE mode — ruff only, output verbatim (no post-passes:
        // organizing a cell's imports must not rewrite quotes/endings).
        if (organize) {
            const res = await tryRuffOrganizeStdin(py, content, "cell.py");
            if (res.absent) return ruffAbsentResponse();
            if (!res.ok || res.output == null) {
                return NextResponse.json(
                    {ok: false, error: res.detail ?? "ruff failed to organize imports."},
                    {status: 500}
                );
            }
            return NextResponse.json({
                ok: true,
                formatted: res.output,
                content: res.output,
                changed: res.output !== content,
                formatter: "ruff",
            });
        }
        // ruff preference — `ruff format -`, black's bare STDIN mirror;
        // ruff missing/failed → the black path below, unchanged.
        const ruffOut = await tryRuffFormatStdin(py, content);
        if (ruffOut != null) {
            const formatted = post(ruffOut, "cell.py");
            return NextResponse.json({
                ok: true,
                formatted,
                content: formatted,
                changed: formatted !== content,
                formatter: "ruff",
            });
        }
        const result = await runBlackStdin(py, content);
        if (result.stderr.toLowerCase().includes("no module named black") || !result.ok) {
            const formatted = post(
                builtinFormat(content, getIndentSettings(fmtSettings), "cell.py"),
                "cell.py"
            );
            return NextResponse.json({
                ok: true,
                formatted,
                content: formatted,
                changed: formatted !== content,
                fallback: "builtin",
                formatter: "builtin",
            });
        }
        // black's output still passes through the POST passes
        // (quotes / hygiene / line endings — the config).
        const formatted = post(result.stdout, "cell.py");
        return NextResponse.json({
            ok: true,
            formatted,
            content: formatted,
            changed: formatted !== content,
            formatter: "black",
        });
    }

    if (!folder || !file) {
        return NextResponse.json(
            {error: "Body must include 'folder' and 'file' slugs."},
            {status: 400}
        );
    }
    // anyKind: the non-Python formattable kinds (Go / Ruby / prettier
    // family …) ride the same resolver — the .py-only guard stays the
    // default for every other execution path (run / lint / tests).
    const resolved = await resolveScriptPath(folder, file, {anyKind: true});
    if (!resolved) {
        return NextResponse.json({error: "File not found."}, {status: 404});
    }

    const kind = fileKindFromExt(path.extname(resolved.fileName));

    // ── ORGANIZE-IMPORTS mode — Python only, ruff only ──────────────
    // `ruff check --select I --fix`: sorts/merges/dedupes the import
    // block and NOTHING else. No black, no built-in formatter, no
    // Formatting post-passes; `changed:false` is the clean "no edits
    // needed" report. Ruff absent → the friendly 503 body.
    if (organize) {
        if (kind !== "python") {
            return NextResponse.json(
                {
                    ok: false,
                    error: `${resolved.fileName}: organize imports is only available for Python files.`,
                },
                {status: 400}
            );
        }
        return handleOrganizeImports(resolved, content, interpreter);
    }

    // ── NON-PYTHON kinds ─────────────────────────────────────────────
    // Real binaries first (gofmt / rubocop / prettier — probed once per
    // process with a TTL), built-in offline engines as the fallback.
    // The Python interpreter setting is deliberately NOT resolved on
    // this branch: formatting a .go/.json file must not fail because
    // the configured Python env is missing.
    if (kind !== "python") {
        return handleNonPythonFormat(resolved, kind, content, fmtSettings, post);
    }

    // Honor the `pythonInterpreter` setting.
    const py = await findInterpreter(interpreter);

    // ── In-memory mode: format `content` via ruff / black STDIN ──────
    // ruff first (both discovery layers — see tryRuffFormatStdin);
    // `--stdin-filename` points ruff at the real file so its
    // pyproject.toml resolves exactly as it would on disk.
    if (typeof content === "string") {
        const ruffOut = await tryRuffFormatStdin(py, content, resolved.absPath);
        if (ruffOut != null) {
            // ruff's output still passes through the POST passes
            // (quotes / hygiene / line endings — the config), the same
            // deal black's output gets.
            const formatted = post(ruffOut, resolved.fileName);
            return NextResponse.json({
                ok: true,
                formatted,
                content: formatted,
                changed: formatted !== content,
                formatter: "ruff",
            });
        }
        const result = await runBlackStdin(py, content);
        if (result.stderr.toLowerCase().includes("no module named black")) {
            // black unavailable — use the built-in formatter so
            // Format Document works out of the box. `fallback` tells the UI
            // to mention it ("formatted with the built-in formatter — pip
            // install black for full black formatting").
            const formatted = post(
                builtinFormat(content, getIndentSettings(fmtSettings), resolved.fileName),
                resolved.fileName
            );
            return NextResponse.json({
                ok: true,
                formatted,
                content: formatted,
                changed: formatted !== content,
                fallback: "builtin",
                formatter: "builtin",
            });
        }
        if (!result.ok) {
            return NextResponse.json(
                {ok: false, error: result.stderr || "format failed"},
                {status: 500}
            );
        }
        // black STDIN mode prints the formatted source to stdout.
        // the Formatting options (quotes, blank lines, endings…)
        // run on black's output too.
        const formatted = post(result.stdout, resolved.fileName);
        return NextResponse.json({
            ok: true,
            formatted,
            content: formatted,
            changed: formatted !== content,
            formatter: "black",
        });
    }

    // ── Disk mode: format the file in place ──────────────────────────
    // Read original first so we can detect "already formatted" no-ops.
    const original = await readFile(resolved.absPath, "utf-8");

    // ruff first — `ruff format <absPath>` writes in place exactly like
    // `black --quiet <absPath>`; the black path below stays the fallback.
    if (await tryRuffFormatDisk(py, resolved.absPath)) {
        const ruffReadBack = await readFile(resolved.absPath, "utf-8");
        // the Formatting options run on ruff's read-back too, and are
        // written back when they changed something (black's deal).
        const ruffFormatted = post(ruffReadBack, resolved.fileName);
        if (ruffFormatted !== ruffReadBack) {
            await writeFile(resolved.absPath, ruffFormatted, "utf-8");
        }
        return NextResponse.json({
            ok: true,
            formatted: ruffFormatted,
            content: ruffFormatted,
            changed: ruffFormatted !== original,
            formatter: "ruff",
        });
    }

    const result = await runBlackDisk(py, resolved.absPath);
    if (result.stderr.toLowerCase().includes("no module named black")) {
        // built-in fallback for disk mode too. with the
        // caller's settings + the post passes.
        const formatted = post(
            builtinFormat(original, getIndentSettings(fmtSettings), resolved.fileName),
            resolved.fileName
        );
        if (formatted !== original) {
            await writeFile(resolved.absPath, formatted, "utf-8");
        }
        return NextResponse.json({
            ok: true,
            formatted,
            content: formatted,
            changed: formatted !== original,
            fallback: "builtin",
            formatter: "builtin",
        });
    }
    if (!result.ok) {
        return NextResponse.json(
            {ok: false, error: result.stderr || "format failed"},
            {status: 500}
        );
    }
    const readBack = await readFile(resolved.absPath, "utf-8");
    // black wrote the disk file — the Formatting options
    // run on the read-back source BEFORE it is handed back (and written
    // back when they changed something), so the file on disk and the
    // returned source both carry the configured quote style / hygiene /
    // line endings.
    const formatted = post(readBack, resolved.fileName);
    if (formatted !== readBack) {
        await writeFile(resolved.absPath, formatted, "utf-8");
    }
    return NextResponse.json({
        ok: true,
        formatted,
        content: formatted,
        changed: formatted !== original,
        formatter: "black",
    });
}

/* ── the NON-PYTHON branch ─────────────────────────────────────────── */

/** Format one non-Python file: a REAL formatter binary when one is on
 *  PATH (gofmt/gofumpt for Go, rubocop for Ruby, prettier for
 *  JS/TS/JSON/CSS/HTML/Markdown/YAML — lib/formatter-binaries), and
 *  the exact BUILT-IN offline engine the viewer uses as the fallback.
 *  Handles BOTH modes with one code path: in-memory (`content`, the
 *  save-time buffer) and disk (reads the file, writes it back when it
 *  changed). Response mirrors the Python branches' field shape. */
async function handleNonPythonFormat(
    resolved: { absPath: string; folderName: string; fileName: string },
    kind: string,
    content: string | undefined,
    fmtSettings: Settings,
    post: (src: string, fileName?: string, kind?: string) => string
): Promise<NextResponse> {
    const entry = formattableKindFor(kind);
    if (!entry) {
        // Truthful rejection — the kind has no formatter at all (binary
        // OR built-in); the menu layer already hides Format for these.
        return NextResponse.json(
            {
                error: `${resolved.fileName}: no formatter is registered for ${kind} files.`,
            },
            {status: 400}
        );
    }
    // In-memory mode formats the caller's buffer (save-time path);
    // disk mode reads the file first so the response's `changed` flag
    // and the write-back both compare against the real original.
    const inMemory = typeof content === "string";
    const source = inMemory
        ? (content as string)
        : await readFile(resolved.absPath, "utf-8");

    // 1) REAL binaries — gofmt/gofumpt for Go, rubocop for Ruby,
    //    prettier for JS/TS/JSON/CSS/HTML/Markdown/YAML. Availability is
    //    probed once per process (short TTL); a missing binary, a syntax
    //    error (non-zero exit) or a timeout just drops to the built-in
    //    engine below — never an error page.
    const tool = formatterToolForKind(kind);
    if (tool) {
        const binResult = await runFormatterBinary(
            {
                tool,
                absPath: resolved.absPath,
                fileName: resolved.fileName,
                source,
            },
            tool === "prettier"
                ? prettierParserFor(kind, resolved.fileName) ?? undefined
                : undefined
        );
        if (binResult.ran && binResult.output != null) {
            // The settings-driven passes run on the REAL formatter's output
            // too (line endings / final newline / hygiene — the same deal
            // black's output gets).
            const formatted = post(binResult.output, resolved.fileName, kind);
            if (!inMemory && formatted !== source) {
                await writeFile(resolved.absPath, formatted, "utf-8");
            }
            return NextResponse.json({
                ok: true,
                formatted,
                content: formatted,
                changed: formatted !== source,
                formatter: binResult.bin,
            });
        }
    }

    // 2) BUILT-IN offline engines — the EXACT pass the viewer's Format
    //    Document uses client-side (lib/format-any), so a machine with
    //    no prettier/gofmt/rubocop still gets the same result the app
    //    has always produced.
    const builtin = post(
        formatAnySource(kind, "format", source, fmtSettings),
        resolved.fileName,
        kind
    );
    if (!inMemory && builtin !== source) {
        await writeFile(resolved.absPath, builtin, "utf-8");
    }
    return NextResponse.json({
        ok: true,
        formatted: builtin,
        content: builtin,
        changed: builtin !== source,
        fallback: "builtin",
        formatter: "builtin",
    });
}

/* ── the ruff orchestration (shared by every Python path) ─────────── */

/** The friendly "ruff is not installed" body — organize mode has NO
 *  fallback (black cannot organize imports), so the client surfaces
 *  this verbatim. */
const RUFF_ABSENT_ERROR =
    "Organize imports requires ruff, but no ruff executable was found — neither a standalone binary on PATH nor the ruff module in the selected Python interpreter. Install it (e.g. `pip install ruff`), then try again.";

/** 503 + the friendly ruff-not-installed body. */
function ruffAbsentResponse(): NextResponse {
    return NextResponse.json({ok: false, error: RUFF_ABSENT_ERROR}, {status: 503});
}

/** Run `<interpreter> -m ruff <args…>` — the interpreter-module twin of
 *  the standalone-binary layer in lib/formatter-binaries (the second
 *  discovery layer /api/lint already uses: catches machines where ruff
 *  is pip-installed into the selected interpreter but its Scripts dir
 *  is not on PATH). Mirrors runBlackStdin's spawn shape — argv array, no
 *  shell, timeout kill, source over stdin only. */
function runRuffModule(
    interpreter: string,
    args: string[],
    stdin?: string
): Promise<{ ok: boolean; code: number | null; stdout: string; stderr: string }> {
    const argv = ["-m", "ruff", ...args];
    const useStdin = typeof stdin === "string";
    return new Promise((resolve) => {
        const child = spawn(
            interpreter,
            argv,
            {
                cwd: process.cwd(),
                env: process.env,
                stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
            }
        );
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ok: code === 0, code, stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({ok: false, code: null, stdout: "", stderr: "spawn error"});
        });
        if (useStdin) {
            try {
                child.stdin?.write(stdin, "utf-8");
                child.stdin?.end();
            } catch { /* child died early */
            }
        }
    });
}

/** Can `<interpreter> -m ruff` run at all? Probed once per interpreter
 *  per process (globalThis, the pattern the lint route uses so dev-mode
 *  HMR re-instantiations keep the cache). */
async function ruffModuleAvailable(interpreter: string): Promise<boolean> {
    const g = globalThis as unknown as {
        __ruffModuleAvailable?: Map<string, boolean>;
    };
    const cache = g.__ruffModuleAvailable ?? new Map<string, boolean>();
    g.__ruffModuleAvailable = cache;
    const cached = cache.get(interpreter);
    if (cached !== undefined) return cached;
    const probe = await runRuffModule(interpreter, ["--version"]);
    const ok = probe.ok && !probe.stderr.toLowerCase().includes("no module named ruff");
    cache.set(interpreter, ok);
    return ok;
}

/** First non-empty stderr line, capped (error payloads can be huge). */
function firstStderrLine(stderr: string): string | undefined {
    const line = stderr.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line ? line.slice(0, 200) : undefined;
}

/** Try `ruff format -` through BOTH discovery layers (standalone binary
 *  first — the TTL-cached PATH probe — then the interpreter module).
 *  Returns the formatted source, or null when ruff is unavailable or the
 *  run failed → the caller's black path runs completely unchanged (black
 *  reports a syntax error truthfully on its own). */
async function tryRuffFormatStdin(
    interpreter: string,
    source: string,
    fileName?: string
): Promise<string | null> {
    const standaloneBin = await probeFormatterTool("ruff");
    if (standaloneBin) {
        const res = await runRuffFormatStdin(source, fileName);
        if (res.ran && res.output != null) return res.output;
        return null;
    }
    if (!(await ruffModuleAvailable(interpreter))) return null;
    const mod = await runRuffModule(interpreter, ruffFormatStdinArgs(fileName), source);
    if (mod.ok && (mod.stdout.length > 0 || source.trim() === "")) return mod.stdout;
    return null;
}

/** Try the in-place `ruff format <absPath>` through both layers.
 *  true = the file was rewritten on disk (caller reads it back). */
async function tryRuffFormatDisk(interpreter: string, absPath: string): Promise<boolean> {
    const standaloneBin = await probeFormatterTool("ruff");
    if (standaloneBin) {
        return (await runRuffFormatDisk(absPath)).ran;
    }
    if (!(await ruffModuleAvailable(interpreter))) return false;
    const mod = await runRuffModule(interpreter, ruffFormatDiskArgs(absPath));
    return mod.ok;
}

/** Organize outcome — `absent` (friendly 503 error) vs `ok:false` with a
 *  detail (ruff EXISTS but the pass errored — a 500 with the reason). */
interface OrganizeOutcome {
    ok: boolean;
    absent?: boolean;
    output?: string;
    detail?: string;
}

/** Try `ruff check --select I --fix -` through both layers. */
async function tryRuffOrganizeStdin(
    interpreter: string,
    source: string,
    fileName: string
): Promise<OrganizeOutcome> {
    const standaloneBin = await probeFormatterTool("ruff");
    if (standaloneBin) {
        const res = await runRuffOrganizeStdin(source, fileName);
        if (res.ran && res.output != null) return {ok: true, output: res.output};
        return {ok: false, detail: res.detail};
    }
    if (!(await ruffModuleAvailable(interpreter))) return {ok: false, absent: true};
    const mod = await runRuffModule(interpreter, ruffOrganizeStdinArgs(fileName), source);
    if ((mod.code === 0 || mod.code === 1) && (mod.stdout.length > 0 || source.trim() === "")) {
        return {ok: true, output: mod.stdout};
    }
    return {ok: false, detail: firstStderrLine(mod.stderr)};
}

/** Try the in-place `ruff check --select I --fix <absPath>`. */
async function tryRuffOrganizeDisk(
    interpreter: string,
    absPath: string
): Promise<OrganizeOutcome> {
    const standaloneBin = await probeFormatterTool("ruff");
    if (standaloneBin) {
        const res = await runRuffOrganizeDisk(absPath);
        if (res.ran) return {ok: true};
        return {ok: false, detail: res.detail};
    }
    if (!(await ruffModuleAvailable(interpreter))) return {ok: false, absent: true};
    const mod = await runRuffModule(interpreter, ruffOrganizeDiskArgs(absPath));
    // exit 1 = fixes applied with (unfixable) violations remaining — the
    // organize pass still completed.
    if (mod.code === 0 || mod.code === 1) return {ok: true};
    return {ok: false, detail: firstStderrLine(mod.stderr)};
}

/** The organize-imports request handler (Python only — POST already
 *  rejected every other kind). In-memory mode organizes the caller's
 *  buffer over stdin (the save-time path); disk mode lets ruff write
 *  the fixes in place and reads the file back. The response mirrors the
 *  format path's field shape so clients read ONE contract, and
 *  `changed: false` is the clean no-edits report. ruff's output is
 *  returned VERBATIM — the Formatting post-passes are the FORMAT path's
 *  contract, not import organization's. */
async function handleOrganizeImports(
    resolved: { absPath: string; folderName: string; fileName: string },
    content: string | undefined,
    interpreter?: string
): Promise<NextResponse> {
    const py = await findInterpreter(interpreter);
    if (typeof content === "string") {
        const res = await tryRuffOrganizeStdin(py, content, resolved.absPath);
        if (res.absent) return ruffAbsentResponse();
        if (!res.ok || res.output == null) {
            return NextResponse.json(
                {ok: false, error: res.detail ?? "ruff failed to organize imports."},
                {status: 500}
            );
        }
        return NextResponse.json({
            ok: true,
            formatted: res.output,
            content: res.output,
            changed: res.output !== content,
            formatter: "ruff",
        });
    }
    const original = await readFile(resolved.absPath, "utf-8");
    const res = await tryRuffOrganizeDisk(py, resolved.absPath);
    if (res.absent) return ruffAbsentResponse();
    if (!res.ok) {
        return NextResponse.json(
            {ok: false, error: res.detail ?? "ruff failed to organize imports."},
            {status: 500}
        );
    }
    const readBack = await readFile(resolved.absPath, "utf-8");
    return NextResponse.json({
        ok: true,
        formatted: readBack,
        content: readBack,
        changed: readBack !== original,
        formatter: "ruff",
    });
}

/** Run `black` on the source and capture stdout (the formatted source).
 *
 * two modes —
 * - small sources keep the `black -c "<src>"` argv fast path;
 * - sources past MAX_INLINE_SCRIPT_BYTES (Windows: ~28 KB — the whole
 CreateProcess command line is capped at 32 767 chars; * "ENAMETOOLONG: name too long, uv_spawn") run through TRUE STDIN
 * mode (`black -`), where the payload never touches argv. */
function runBlackStdin(
    interpreter: string,
    source: string
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    const useStdinMode = Buffer.byteLength(source, "utf-8") > MAX_INLINE_SCRIPT_BYTES;
    const argv = useStdinMode
        ? ["-m", "black", "-"]
        : ["-m", "black", "-c", source];
    return new Promise((resolve) => {
        const child = spawn(
            interpreter,
            argv,
            {cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"]}
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ok: code === 0, stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({ok: false, stdout: "", stderr: "spawn error"});
        });
        if (useStdinMode) {
            // `black -` reads the source from stdin and prints the formatted
            // result to stdout — the payload never appears in argv.
            try {
                child.stdin?.write(source, "utf-8");
                child.stdin?.end();
            } catch { /* child died early */
            }
        } else {
            // black -c reads the source from argv, not stdin — no need to write.
            try {
                child.stdin?.end();
            } catch { /* ignore */
            }
        }
    });
}

/** Run `black --quiet <absPath>` (writes the file in place). */
function runBlackDisk(
    interpreter: string,
    absPath: string
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(
            interpreter,
            ["-m", "black", "--quiet", absPath],
            {cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"]}
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            } catch { /* already dead */
            }
        }, TIMEOUT_MS);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ok: code === 0, stdout, stderr});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({ok: false, stdout: "", stderr: "spawn error"});
        });
    });
}
