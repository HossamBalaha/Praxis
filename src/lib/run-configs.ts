/**
 *  — Saved run configurations (per script).
 *
 * A run config captures the Run toolbar's argument/environment state
 * under a name, so "run with the dev dataset" or "run with --verbose
 * --dry-run" is one dropdown pick instead of retyping. Stored in
 * localStorage per script (folderSlug/fileSlug), mirroring how notes
 * and per-file settings already work.
 *
 * Three additions on top of the localStorage store:
 *
 *  ▸ STARRED configs additionally persist into the ACTIVE PROJECT's
 *    .praxis settings via /api/project-settings (key `runConfigs`) —
 *    they follow the project to any machine that opens it, while the
 *    localStorage copy keeps working exactly as before.
 *
 *  ▸ AUTO-DETECTION: when a Python file has no saved config,
 *    synthesizeRunConfig() derives a sensible default from static
 *    analysis of its source (main-block → "Main script"; argparse →
 *    same with the "--help" argv placeholder; module-style → plain
 *    run).
 *
 *  ▸ ONE-CLICK RUN: runConfigNow(config) runs a config immediately —
 *    either through a host listener on the `praxis:run-config-now`
 *    event (recommended: it reuses the app's own run machinery), or
 *    directly through the same POST /api/run SSE stream the Run
 *    toolbar's doRun uses.
 */

export interface RunConfig {
    id: string;
    /** Display name, e.g. "Debug --verbose" (user-chosen). */
    name: string;
    /** Raw argv text — split on whitespace at apply time (same as the
     *  Run toolbar's args field). */
    args: string;
    /** Raw KEY=VALUE lines — parsed at apply time (same format as the
     *  Run toolbar's env field). */
    env: string;
    /** Pre-supplied stdin text (written to the process before it runs). */
    stdin: string;
    /** Optional interpreter override ("Run with…" equivalent). */
    interpreter?: string;
    createdAt: number;
    /**
     * STARRED — the config follows the PROJECT: starred configs are
     * persisted into the active project's .praxis settings (via
     * /api/project-settings, key `runConfigs`) in addition to this
     * browser's localStorage, so they reappear on any machine that opens
     * the project. Unstarred configs stay localStorage-only exactly as
     * before.
     */
    starred?: boolean;
    /**
     * True for the AUTO-SYNTHESIZED config (static analysis of the
     * script's source — see synthesizeRunConfig). Ephemeral: it is
     * shown when the script has no saved config and never written to
     * storage unless the user saves it.
     */
    auto?: boolean;
    /**
     * Script identity, stamped on project-stored configs (and on
     * anything handed to runConfigNow) so a config can be run /
     * re-listed without the caller tracking the folder/file slugs.
     */
    folderSlug?: string;
    fileSlug?: string;
    fileName?: string;
}

export interface ScriptRunConfigs {
    configs: RunConfig[];
    /** Config auto-applied when this script is selected. null = none. */
    defaultId: string | null;
}

const PREFIX = "praxis.runconfigs.";
const MAX_CONFIGS = 20;

function keyFor(folderSlug: string, fileSlug: string): string {
    return `${PREFIX}${folderSlug}/${fileSlug}`;
}

export function loadRunConfigs(
    folderSlug: string,
    fileSlug: string
): ScriptRunConfigs {
    try {
        const raw = window.localStorage.getItem(keyFor(folderSlug, fileSlug));
        if (!raw) return {configs: [], defaultId: null};
        const parsed = JSON.parse(raw) as Partial<ScriptRunConfigs>;
        const configs = Array.isArray(parsed.configs)
            ? parsed.configs.filter(
                (c) => c && typeof c.id === "string" && typeof c.name === "string"
            )
            : [];
        // Cap FIRST, then validate defaultId against the capped list (a
        // default pointing at config #21+ used to survive the cap — found
        // by the vitest review).
        const capped = configs.slice(0, MAX_CONFIGS);
        return {
            configs: capped,
            defaultId:
                typeof parsed.defaultId === "string" &&
                capped.some((c) => c.id === parsed.defaultId)
                    ? parsed.defaultId
                    : null,
        };
    } catch {
        return {configs: [], defaultId: null};
    }
}

export function saveRunConfigs(
    folderSlug: string,
    fileSlug: string,
    data: ScriptRunConfigs
): void {
    try {
        window.localStorage.setItem(
            keyFor(folderSlug, fileSlug),
            JSON.stringify({...data, configs: data.configs.slice(0, MAX_CONFIGS)})
        );
    } catch {
        /* storage full — non-fatal */
    }
}

export function newRunConfigId(): string {
    return `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Human summary for a config (tooltip / list subtitle). */
export function runConfigSummary(c: RunConfig): string {
    const parts: string[] = [];
    if (c.args.trim()) parts.push(`args: ${c.args.trim()}`);
    if (c.env.trim()) parts.push(`env: ${c.env.trim().split("\n").length} var(s)`);
    if (c.stdin.trim()) parts.push("stdin");
    if (c.interpreter) parts.push(`py: ${c.interpreter}`);
    return parts.length ? parts.join(" · ") : "no overrides";
}

/* ==================================================================== */
/*  Project-stored starred configs (+ auto-detection + one-click run)  */
/* ==================================================================== */

/** The key inside the active project's .praxis/settings.json that
 *  carries the STARRED configs (each entry stamped with its script's
 *  folderSlug/fileSlug/fileName so the list renders for the right
 *  script on any machine that opens the project). */
export const PROJECT_RUN_CONFIGS_KEY = "runConfigs";

/** Cap on the project-stored list — bounds .praxis/settings.json size
 *  (localStorage keeps its own 20-per-script cap). */
const MAX_PROJECT_CONFIGS = 200;

/** GET /api/project-settings → its settings object (any shape; null
 *  when the route answered ok:false — e.g. an unwritable project). */
async function fetchProjectSettings(): Promise<Record<string, unknown> | null> {
    try {
        const res = await fetch("/api/project-settings", {cache: "no-store"});
        if (!res.ok) return null;
        const data = (await res.json()) as {
            ok?: boolean;
            settings?: Record<string, unknown>;
        };
        return data.settings && typeof data.settings === "object"
            ? data.settings
            : null;
    } catch {
        return null; // offline / server hiccup — callers degrade to local-only
    }
}

/** Coerce an unknown JSON value into valid RunConfigs (drops junk
 *  entries instead of failing the whole list). */
function sanitizeRunConfigs(raw: unknown): RunConfig[] {
    if (!Array.isArray(raw)) return [];
    const out: RunConfig[] = [];
    for (const c of raw) {
        if (!c || typeof c !== "object") continue;
        const cfg = c as Partial<RunConfig>;
        if (typeof cfg.id !== "string" || typeof cfg.name !== "string") continue;
        out.push({
            id: cfg.id,
            name: cfg.name,
            args: typeof cfg.args === "string" ? cfg.args : "",
            env: typeof cfg.env === "string" ? cfg.env : "",
            stdin: typeof cfg.stdin === "string" ? cfg.stdin : "",
            interpreter:
                typeof cfg.interpreter === "string" ? cfg.interpreter : undefined,
            createdAt: typeof cfg.createdAt === "number" ? cfg.createdAt : Date.now(),
            starred: cfg.starred === true || undefined,
            // `auto` is never persisted — a synthesized config only becomes
            // concrete when the user saves it.
            auto: undefined,
            folderSlug: typeof cfg.folderSlug === "string" ? cfg.folderSlug : undefined,
            fileSlug: typeof cfg.fileSlug === "string" ? cfg.fileSlug : undefined,
            fileName: typeof cfg.fileName === "string" ? cfg.fileName : undefined,
        });
    }
    return out.slice(0, MAX_PROJECT_CONFIGS);
}

/**
 * The STARRED configs persisted in the ACTIVE project's .praxis
 * settings (all scripts — filter by folderSlug/fileSlug for one
 * script, or leave unfiltered to render a project-wide list).
 * Empty when the project has none / is unwritable / offline.
 */
export async function loadProjectRunConfigs(): Promise<RunConfig[]> {
    const settings = await fetchProjectSettings();
    return sanitizeRunConfigs(settings?.[PROJECT_RUN_CONFIGS_KEY]);
}

/**
 * Persist the full starred-config list into the project's .praxis
 * settings. Read-modify-write: the CURRENT settings object is fetched
 * right before the POST and only the `runConfigs` key is replaced, so
 * the project's other settings (interpreter, appearance overrides…)
 * survive byte-for-byte. Returns false when the write failed (the
 * localStorage copy remains the source of truth in that case).
 */
export async function saveProjectRunConfigs(next: RunConfig[]): Promise<boolean> {
    const current = await fetchProjectSettings();
    const merged: Record<string, unknown> = {
        ...(current ?? {}),
        [PROJECT_RUN_CONFIGS_KEY]: next,
    };
    try {
        const res = await fetch("/api/project-settings", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({settings: merged}),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Sync ONE script's starred configs into the project store: the
 * starred subset (stamped with the script's identity so it renders /
 * runs on any machine that opens the project) replaces this script's
 * previous entries; every other script's entries are left untouched.
 * Returns the resulting full project list (also what lands on disk
 * when the write succeeds).
 */
export async function syncStarredConfigsToProject(
    folderSlug: string,
    fileSlug: string,
    fileName: string,
    configs: RunConfig[]
): Promise<RunConfig[]> {
    const starredForScript = configs
        .filter((c) => c.starred)
        .map((c) => ({
            ...c,
            starred: true,
            auto: undefined,
            folderSlug,
            fileSlug,
            fileName,
        }));
    const current = await loadProjectRunConfigs();
    const others = current.filter(
        (c) => !(c.folderSlug === folderSlug && c.fileSlug === fileSlug)
    );
    const next = [...others, ...starredForScript].slice(0, MAX_PROJECT_CONFIGS);
    await saveProjectRunConfigs(next);
    return next;
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Auto-detection (pure static analysis of the script source)         */
/* ──────────────────────────────────────────────────────────────────── */

export type RunConfigKind = "main" | "argparse" | "module";

export interface RunConfigDetection {
    /** What static analysis says the script is:
     *    "argparse"— argparse usage (import OR ArgumentParser(…)), with
     *                or without a main guard — argv matters either way,
     *                so the synthesized config carries the "--help"
     *                placeholder;
     *    "main"     — has an `if __name__ == "__main__":` block → the
     *                config runs it as the main script;
     *    "module"  — no main block and no argparse (import-style
     *                module) → plain run. */
    kind: RunConfigKind;
    hasMainBlock: boolean;
    usesArgparse: boolean;
}

/** `if __name__ == "__main__":` — tolerant of whitespace and either
 *  quote style; MULTILINE so the guard matches wherever its line sits
 *  (no /m and ^ anchors to the string start — a guard below the imports
 *  never matched), and the ^ also means a commented-out
 *  `# if __name__` line never counts. */
const MAIN_BLOCK_RE =
    /^[ \t]*if[ \t]+__name__[ \t]*==[ \t]*(['"])__main__\1[ \t]*:/m;

/** argparse usage: the import (either form) OR a direct
 *  ArgumentParser(…) construction (covers re-exported aliases). */
const ARGPARSE_RE = /\bimport[ \t]+argparse\b|\bfrom[ \t]+argparse[ \t]+import\b|\bargparse\.ArgumentParser[ \t]*\(/;

/** Pure static analysis — no subprocess, no parsing, one regex pair.
 *  argparse wins over the main guard: a module-level CLI (import-time
 *  parse_args, no `__main__` block — the CLI Toolbox sample files) is
 *  still argv-driven, so it must still get the "--help" placeholder. */
export function detectRunConfigShape(source: string): RunConfigDetection {
    const hasMainBlock = MAIN_BLOCK_RE.test(source);
    const usesArgparse = ARGPARSE_RE.test(source);
    const kind: RunConfigKind = usesArgparse
        ? "argparse"
        : hasMainBlock
            ? "main"
            : "module";
    return {kind, hasMainBlock, usesArgparse};
}

/**
 * Synthesize the DEFAULT config for a Python file with no saved
 * config yet (pure — call it with the file's source):
 *   ▸ `if __name__ == "__main__":` block → "Main script" (args empty);
 *   ▸ argparse (with or without a main block)                → same but
 *     argv matters, so the args field carries "--help" — the one
 *     placeholder that runs safely on EVERY argparse CLI (required
 *     arguments make an empty argv exit 2) and prints the usage the
 *     user then swaps for real flags;
 *   ▸ module-style (no main, no argparse)                     → "Plain
 *     run" with empty args.
 * The returned config is flagged `auto: true` — ephemeral until saved.
 */
export function synthesizeRunConfig(
    source: string,
    fileName: string
): { config: RunConfig; detection: RunConfigDetection } {
    const detection = detectRunConfigShape(source);
    const name =
        detection.kind === "argparse"
            ? "Main script (argparse)"
            : detection.kind === "main"
                ? "Main script"
                : "Plain run";
    const config: RunConfig = {
        id: newRunConfigId(),
        name,
        args: detection.usesArgparse ? "--help" : "",
        env: "",
        stdin: "",
        createdAt: Date.now(),
        auto: true,
        // The synthesized config carries the file's identity so a lister
        // (or runConfigNow's caller) can tell WHICH script it belongs to
        // without the caller threading the name alongside it.
        fileName,
    };
    return {config, detection};
}

/** What a config lister should show for a script:
 *  saved (localStorage + this project's starred) configs, and when
 *  there are NONE, the auto-synthesized config for its source. */
export interface EffectiveRunConfigs {
    configs: RunConfig[];
    synthesized: RunConfig | null;
    detection: RunConfigDetection;
}

/**
 * The one call a configs popover wants on open: merges the script's
 * localStorage configs with the project's starred configs for the
 * SAME script (deduped by id — the project copy wins field-by-field
 * since it is the one that follows the project), and synthesizes the
 * auto config from static analysis when nothing is saved.
 */
export async function getEffectiveRunConfigs(
    folderSlug: string,
    fileSlug: string,
    fileName?: string,
    source?: string
): Promise<EffectiveRunConfigs> {
    const local = loadRunConfigs(folderSlug, fileSlug);
    const project = await loadProjectRunConfigs();
    const mine = project.filter(
        (c) => c.folderSlug === folderSlug && c.fileSlug === fileSlug
    );
    const byId = new Map<string, RunConfig>();
    for (const c of local.configs) byId.set(c.id, c);
    for (const c of mine) {
        const prev = byId.get(c.id);
        byId.set(c.id, prev ? {...prev, ...c} : c);
    }
    const configs = [...byId.values()];
    const detection = detectRunConfigShape(source ?? "");
    const synthesized =
        configs.length === 0 && source
            ? synthesizeRunConfig(source, fileName ?? fileSlug).config
            : null;
    return {configs, synthesized, detection};
}

/* ──────────────────────────────────────────────────────────────────── */
/*  One-click run (runConfigNow)                                       */

/* ──────────────────────────────────────────────────────────────────── */

/** Split a config's raw argv text — the EXACT rule the Run toolbar's
 *  doRun applies (trim + whitespace split), so a config applied to the
 *  toolbar and one run through runConfigNow hand the SAME argv to
 *  /api/run. */
export function splitRunConfigArgs(argsText: string): string[] | undefined {
    const t = argsText.trim();
    return t ? t.split(/\s+/) : undefined;
}

/** Parse a config's raw KEY=VALUE env text — the EXACT rule doRun
 *  applies (line-trimmed; a value-less key maps to ""). */
export function parseRunConfigEnv(
    envText: string
): Record<string, string> | undefined {
    const t = envText.trim();
    if (!t) return undefined;
    return Object.fromEntries(
        t
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
                const idx = l.indexOf("=");
                return idx >= 0
                    ? [l.slice(0, idx).trim(), l.slice(idx + 1)]
                    : [l, ""];
            })
    );
}

/** One SSE event from /api/run (passthrough of the JSON frames). */
export interface RunStreamEvent {
    type: "start" | "stdout" | "stderr" | "figure" | "end" | "error";
    text?: string;
    url?: string;
    exitCode?: number;
    durationMs?: number;
    ok?: boolean;
    message?: string;

    [key: string]: unknown;
}

/** Aggregated outcome of a one-click run. */
export interface RunNowResult {
    /** True when a HOST listener caught the `praxis:run-config-now`
     *  event (callEvent.preventDefault()) and ran the config through
     *  the app's own machinery — this helper then did NOT run anything. */
    hostHandled?: boolean;
    ok: boolean;
    exitCode?: number;
    durationMs?: number;
    stdout: string;
    stderr: string;
    /** Figure URLs captured mid-run (the prelude's matplotlib capture). */
    figures: string[];
    error?: string;
}

/** Optional context for a one-click run. */
export interface RunConfigNowOptions {
    /** Script the config runs — defaults to the config's OWN stamped
     *  identity (present on project-stored configs; the caller of a
     *  localStorage-only config passes the slugs explicitly). */
    folderSlug?: string;
    fileSlug?: string;
    /** Live SSE events (start/stdout/stderr/figure/end) for whoever
     *  renders progress. */
    onEvent?: (evt: RunStreamEvent) => void;
    /** Abort the run request. */
    signal?: AbortSignal;
}

const RUN_NOW_EVENT = "praxis:run-config-now";

/**
 * ONE-CLICK RUN — run `config` immediately.
 *
 * The recommended host wiring (page.tsx / any component with access to
 * the app's run handler):
 *
 *   window.addEventListener("praxis:run-config-now", (e) => {
 *     e.preventDefault();              // take the run over
 *     const { config, args, env, stdin } = e.detail;
 *     // copy args/env/stdin into the Run toolbar state for the
 *     // event's folderSlug/fileSlug, then fire the SAME handleRun()
 *     // the Run button uses — output lands in the Output panel.
 *   });
 *
 * When no listener prevented the event, this helper runs the config
 * ITSELF through POST /api/run — the SAME backend route + body the
 * Run toolbar's doRun uses (folder/file/args/env/stdin/interpreter,
 * parsed with the toolbar's exact rules above) — and resolves with the
 * aggregated stdout/stderr/exit once the SSE stream ends.
 */
export async function runConfigNow(
    config: RunConfig,
    opts: RunConfigNowOptions = {}
): Promise<RunNowResult> {
    const folderSlug = opts.folderSlug ?? config.folderSlug;
    const fileSlug = opts.fileSlug ?? config.fileSlug;
    const empty: RunNowResult = {ok: false, stdout: "", stderr: "", figures: []};
    if (!folderSlug || !fileSlug) {
        return {
            ...empty,
            error:
                "runConfigNow needs the script's folderSlug/fileSlug — pass them in opts or use a config stamped with its script identity (project-stored configs are).",
        };
    }

    // Parse ONCE with the toolbar's exact rules so the event's consumer
    // and the direct path below hand /api/run the identical body.
    const args = splitRunConfigArgs(config.args);
    const env = parseRunConfigEnv(config.env);
    const stdin = config.stdin || undefined;

    // 1) HOST hook — a listener that preventDefault()s takes the run
    //    over (its Output panel / history / notifications stay the UX).
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        const evt = new CustomEvent(RUN_NOW_EVENT, {
            detail: {config, folderSlug, fileSlug, args, env, stdin},
            cancelable: true,
            bubbles: true,
        });
        window.dispatchEvent(evt);
        if (evt.defaultPrevented) {
            return {...empty, hostHandled: true, ok: true};
        }
    }

    // 2) Direct run — the same POST /api/run SSE stream doRun consumes.
    try {
        const res = await fetch("/api/run", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            signal: opts.signal,
            body: JSON.stringify({
                folder: folderSlug,
                file: fileSlug,
                args,
                env,
                stdin,
                interpreter: config.interpreter || undefined,
            }),
        });
        if (!res.ok || !res.body) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            return {...empty, error: data.error ?? `HTTP ${res.status}`};
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const result: RunNowResult = {ok: false, stdout: "", stderr: "", figures: []};
        let streamDone = false;

        const handleEvent = (evt: RunStreamEvent) => {
            opts.onEvent?.(evt);
            switch (evt.type) {
                case "stdout":
                    if (typeof evt.text === "string") result.stdout += evt.text;
                    break;
                case "stderr":
                    if (typeof evt.text === "string") result.stderr += evt.text;
                    break;
                case "figure":
                    if (typeof evt.url === "string") result.figures.push(evt.url);
                    break;
                case "end":
                    result.exitCode = evt.exitCode;
                    result.durationMs = evt.durationMs;
                    result.ok = evt.ok === true;
                    streamDone = true;
                    break;
                case "error":
                    result.error = evt.message ?? "run error";
                    streamDone = true;
                    break;
                default:
                    break; // "start" and future event kinds pass through only
            }
        };

        // SSE frames are "data: {json}\n\n" — split on blank-line
        // boundaries, tolerate a frame split across chunk boundaries.
        while (true) {
            const {done, value} = await reader.read();
            if (value) buffer += decoder.decode(value, {stream: true});
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
                for (const line of frame.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        handleEvent(JSON.parse(line.slice(6)) as RunStreamEvent);
                    } catch {
                        /* ignore malformed frames */
                    }
                }
            }
            if (done) {
                // Flush any decoder tail, then the final incomplete frame
                // (a stream that ended without its trailing blank line).
                buffer += decoder.decode();
                for (const line of buffer.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        handleEvent(JSON.parse(line.slice(6)) as RunStreamEvent);
                    } catch {
                        /* ignore */
                    }
                }
                break;
            }
            if (streamDone) break;
        }

        return result;
    } catch (err) {
        if ((err as Error).name === "AbortError") {
            return {...empty, error: "aborted"};
        }
        return {...empty, error: (err as Error).message};
    }
}
