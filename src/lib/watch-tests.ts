/**
 * watch-tests.ts — client-side pytest WATCH-ENGINE (panel item G24).
 *
 * Three concerns live here, all dependency-free and unit-testable in
 * the plain node vitest environment:
 *
 *  1. PURE affected-test resolution — `affectedTestFiles(changedFile,
 *     testFiles, source)` maps a changed Python file to the test files
 *     that (transitively, one hop) depend on it: the file itself when
 *     it IS a test file, else every test file whose import statements
 *     reference the changed file's module name (`import x`,
 *     `from x import y`, `from pkg.x import y`).
 *
 *  2. `WatchRunner` — a hooks-free orchestration object owned by the
 *     Tests panel. The panel feeds it save notifications
 *     (`notifySave`), it debounces them (800 ms default), resolves the
 *     affected test files, runs them through the panel's EXISTING
 *     /api/test machinery and tracks {running, lastResult, watchedAt}.
 *
 *  3. A tiny MODULE-LEVEL STORE the host reads for editor gutter
 *     marks + the footer badge (`getWatchState()` /
 *     `subscribeWatchState()`). The panel (via the runner) WRITES
 *     after each watched run; the badge component and the host's
 *     gutter renderer READ. Same external-store pattern as
 *     lib/footer-store.ts so consumers can useSyncExternalStore.
 *
 * The store shape the host reads for gutter marks:
 *
 *   {
 *     active: boolean,                  // watch mode is ON
 *     running: boolean,                 // a watched run is in flight
 *     summary: WatchTestSummary | null, // last completed watched run
 *     error: string | null,             // run-level error (fetch/HTTP)
 *     watchedAt: number,                // epoch ms of the last run
 *     lastFiles: string[],              // the test files (slugs) it covered
 *   }
 *
 *   WatchTestSummary.perTest[] carries per-test pass/fail with the
 *   test file's slug + failing LINE — the exact data gutter marks
 *   need. `summary` is only meaningful while `active` is true.
 */

/* ================================================================== */
/*  1. Pure helpers                                                    */
/* ================================================================== */

/** pytest's default discovery patterns (mirrors /api/test's regex). */
const TEST_FILE_RE = /^(test_.+|.+_test)\.py$/i;

/** Basename of a POSIX/Windows-ish path. */
function baseName(p: string): string {
    const parts = p.split(/[\\/]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : p;
}

/** True for `test_*.py` / `*_test.py` file names (path tolerated). */
export function isTestFileName(name: string): boolean {
    return TEST_FILE_RE.test(baseName(name));
}

/**
 * The dotted module paths a file name could be imported under.
 * "utils.py" → ["utils"]; "models/user.py" → ["user", "models.user"]
 * (every suffix — a same-folder test imports the bare name, a
 * root-relative test imports the dotted path).
 */
export function modulePathsFromFile(fileName: string): string[] {
    const parts = fileName.split(/[\\/]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return [];
    const stem = parts[parts.length - 1].replace(/\.(py|pyw)$/i, "");
    if (!stem) return [];
    const dirs = parts.slice(0, -1);
    const out = [stem];
    for (let i = dirs.length - 1; i >= 0; i--) {
        out.push([...dirs.slice(i), stem].join("."));
    }
    return out;
}

/** Valid dotted Python module path (each segment an identifier). */
function isValidModulePath(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name);
}

/** A # that is not inside a single/double-quoted string, or -1. */
function commentHashIndex(line: string): number {
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
            if (ch === "\\") i++;
            else if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "#") {
            return i;
        }
    }
    return -1;
}

function tripleOpenIndex(line: string): number {
    const dq = line.indexOf('"""');
    const sq = line.indexOf("'''");
    if (dq === -1) return sq;
    if (sq === -1) return dq;
    return Math.min(dq, sq);
}

/**
 * Scan Python source for import statements, returning the FULL dotted
 * module paths (not just the top-level package):
 *
 *   import a                    → ["a"]
 *   import a, b.c as d          → ["a", "b.c"]
 *   from e.f import g, h as i   → ["e.f"]
 *   from e.f import (g,\n h)    → ["e.f"]   (paren continuation)
 *
 * Comment lines and triple-quoted strings (docstrings with example
 * `import foo` lines) are skipped; relative imports (`from . import`)
 * are ignored — the watch scope matcher works on plain module paths.
 * Never throws: a weird file just yields fewer paths.
 */
export function importedModulePaths(source: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    if (!source) return out;
    const lines = source.split("\n");
    let triple: '"""' | "'''" | null = null;
    let inParenFrom = false;

    const add = (name: string) => {
        if (!name || name.startsWith(".") || seen.has(name)) return;
        if (!isValidModulePath(name)) return;
        seen.add(name);
        out.push(name);
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (triple) {
            const end = line.indexOf(triple);
            if (end === -1) continue;
            line = line.slice(end + 3);
            triple = null;
        }
        const hash = commentHashIndex(line);
        if (hash !== -1) line = line.slice(0, hash);
        const trimmed = line.trim();
        if (!trimmed) continue;

        const open = tripleOpenIndex(trimmed);
        if (open !== -1) {
            const marker = trimmed.slice(open, open + 3) as '"""' | "'''";
            if (trimmed.slice(open + 3).indexOf(marker) === -1) triple = marker;
            continue; // docstring / string line — not code
        }

        // Inside a `from x import (…` continuation — wait for the ")".
        if (inParenFrom) {
            if (trimmed.includes(")")) inParenFrom = false;
            continue;
        }

        // import a, b.c as d
        const imp = /^import\s+([\w.][\w.,\s]*)$/.exec(trimmed);
        if (imp) {
            for (const piece of imp[1].split(",")) {
                add(piece.trim().split(/\s+as\s+/i)[0].trim());
            }
            continue;
        }

        // from e.f import g …
        const from = /^from\s+([\w.]+)\s+import\s+(.*)$/.exec(trimmed);
        if (from) {
            add(from[1].trim());
            if (from[2].startsWith("(") && !from[2].includes(")")) inParenFrom = true;
            continue;
        }
    }
    return out;
}

/**
 * Map a changed Python file to the test files that should re-run.
 *
 *  • The changed file IS a test file (`test_*.py` / `*_test.py`) →
 *    `[changedFile]`.
 *  • Otherwise → every test file whose SOURCE (from the `source` map,
 *    keyed by test-file name) imports the changed module. Matching
 *    covers the bare module name (`utils`), the dotted package path
 *    (`models.user`), and submodules of it (`utils.helper` still
 *    executes `utils.py` on import).
 *  • No imports match (or the test sources are unknown) → [].
 *
 * Pure: no fetches, no clock, no store — fully unit-tested.
 */
export function affectedTestFiles(
    changedFile: string,
    testFiles: string[],
    source: Map<string, string>
): string[] {
    if (!changedFile) return [];
    if (isTestFileName(changedFile)) return [changedFile];

    const targets = modulePathsFromFile(changedFile);
    if (targets.length === 0) return [];

    const hits = (paths: string[]): boolean =>
        paths.some((p) =>
            targets.some((t) => p === t || p.startsWith(t + "."))
        );

    const out: string[] = [];
    const seen = new Set<string>();
    for (const tf of testFiles) {
        if (seen.has(tf)) continue;
        const content = source.get(tf);
        if (content == null) continue;
        if (hits(importedModulePaths(content))) {
            seen.add(tf);
            out.push(tf);
        }
    }
    return out;
}

/* ================================================================== */
/*  2. Result + store shapes                                           */

/* ================================================================== */

/** One per-test entry — the data gutter marks are drawn from. */
export interface WatchTestEntry {
    /** Stable id: `<fileSlug>::<test name>`. */
    id: string;
    /** Test file NAME (e.g. "test_utils.py"). */
    file: string;
    /** Test name as pytest reports it (may include `file::test`). */
    name: string;
    status: "passed" | "failed" | "error";
    /** Test file slug (matches TestReportEntry.fileSlug). */
    fileSlug?: string;
    /** Folder slug — with fileSlug, locates the file for gutter jumps. */
    folder?: string;
    /** 1-based failing line (when pytest's --tb=line surfaced it). */
    line?: number;
}

/**
 * Summary of one watched run — mapped by the Tests panel from its own
 * /api/test response (TestReportData), scoped to the affected files.
 */
export interface WatchTestSummary {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    durationMs: number;
    /** Per test-file rollup, keyed by file slug (falls back to name). */
    perFile: Record<string, { passed: number; failed: number }>;
    /** Per-test entries for editor gutter marks (skips aren't listed). */
    perTest?: WatchTestEntry[];
}

/** What the runner's `runTests` callback resolves with (summary + optional run-level error). */
export interface TestRunResult extends WatchTestSummary {
    /** Non-empty when the run itself failed (HTTP / network error). */
    error?: string;
}

/** The module-level store state the HOST + badge read. */
export interface WatchStoreState {
    /** Watch mode is ON (the Tests panel started its runner). */
    active: boolean;
    /** A watched run is currently in flight. */
    running: boolean;
    /** Last COMPLETED watched run's summary (null before the first). */
    summary: WatchTestSummary | null;
    /** Run-level error of the last completed run (null when it ran). */
    error: string | null;
    /** Epoch ms of the last completed watched run. */
    watchedAt: number;
    /** Test-file slugs the last watched run covered. */
    lastFiles: string[];
}

/* ── the store itself (footer-store.ts pattern) ──────────────────── */

let storeState: WatchStoreState = {
    active: false,
    running: false,
    summary: null,
    error: null,
    watchedAt: 0,
    lastFiles: [],
};
const storeListeners = new Set<() => void>();

const emitStore = () => {
    for (const l of storeListeners) l();
};

const setStore = (patch: Partial<WatchStoreState>) => {
    storeState = {...storeState, ...patch};
    emitStore();
};

/** Read the current watch state (useSyncExternalStore snapshot). */
export function getWatchState(): WatchStoreState {
    return storeState;
}

/** Subscribe to watch-state changes. Returns an unsubscribe fn. */
export function subscribeWatchState(listener: () => void): () => void {
    storeListeners.add(listener);
    return () => {
        storeListeners.delete(listener);
    };
}

/** Store writer (used by WatchRunner / the panel): flip `active`. */
export function setWatchActive(active: boolean): void {
    if (storeState.active === active) return;
    setStore({active});
}

/** Store writer: flip `running` (a watched run started / finished). */
export function setWatchRunning(running: boolean): void {
    if (storeState.running === running) return;
    setStore({running});
}

/** Store writer: clear the last result (fresh watch session). */
export function clearWatchResult(): void {
    setStore({summary: null, error: null, watchedAt: 0, lastFiles: []});
}

/**
 * Store writer: publish a completed watched run. Splits the run-level
 * `error` out of the result — the summary stays clean for gutter marks.
 */
export function publishWatchResult(result: TestRunResult, files: string[]): void {
    const summary: WatchTestSummary = {
        total: result.total,
        passed: result.passed,
        failed: result.failed,
        errors: result.errors,
        durationMs: result.durationMs,
        perFile: result.perFile,
        perTest: result.perTest,
    };
    setStore({
        summary,
        error: result.error ?? null,
        watchedAt: Date.now(),
        lastFiles: files,
    });
}

/* ================================================================== */
/*  3. WatchRunner                                                     */
/* ================================================================== */

/** Default save→rerun debounce (matches the task spec). */
export const WATCH_DEBOUNCE_MS = 800;

/** The runner's observable state (same shape the task specifies). */
export interface WatchRunnerState {
    running: boolean;
    lastResult: TestRunResult | null;
    watchedAt: number;
}

export interface WatchRunnerOptions {
    /** Execute the affected test files (the panel's /api/test call). */
    runTests: (files: string[]) => Promise<TestRunResult>;
    /**
     * Resolve a changed file → the affected TEST files. Defaults to the
     * identity (the changed file itself is the test scope). The panel
     * passes a resolver built on `affectedTestFiles` + its source map.
     */
    affected?: (changedFile: string) => string[];
    /** Debounce window for notifySave bursts (default 800 ms). */
    debounceMs?: number;
}

/**
 * Hooks-free watch orchestrator. Lifecycle:
 *
 *   const runner = new WatchRunner()
 *     .start({ runTests, affected, debounceMs: 800 });
 *   runner.subscribe(({ running, lastResult, watchedAt }) => …);
 *   runner.notifySave("utils.py");     // debounced → affected → run
 *   runner.stop();                     // cancels pending + in-flight
 *
 * While started it mirrors its state into the module-level store
 * (active / running / summary) so the host + footer badge can render
 * without importing the panel.
 */
export class WatchRunner {
    private opts: WatchRunnerOptions | null = null;
    private started = false;
    private running = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pending = new Set<string>();
    private listeners = new Set<(s: WatchRunnerState) => void>();
    private lastResult: TestRunResult | null = null;
    private watchedAt = 0;
    private runToken = 0;
    private rerunAfter = false;
    private state: WatchRunnerState = {running: false, lastResult: null, watchedAt: 0};

    /** Arm the runner. Safe to call again after stop(). Starts a fresh
     *  watch session — any previously published summary is cleared so
     *  gutter marks never show results from an earlier session. */
    start(opts: WatchRunnerOptions): this {
        this.opts = opts;
        this.started = true;
        clearWatchResult();
        setWatchActive(true);
        this.emit();
        return this;
    }

    /** Disarm: cancels the pending debounce and invalidates any
     *  in-flight run (its result is dropped). Keeps lastResult. */
    stop(): void {
        this.started = false;
        this.runToken++;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pending.clear();
        this.rerunAfter = false;
        this.running = false;
        setWatchRunning(false);
        setWatchActive(false);
        this.emit();
    }

    /** True while started (watch mode armed). */
    isActive(): boolean {
        return this.started;
    }

    /** Current observable state snapshot. */
    getState(): WatchRunnerState {
        return this.state;
    }

    /**
     * Record a file save. Bursts are debounced (debounceMs, 800 default);
     * the affected test files of every pending save are unioned into ONE
     * run. No-op while stopped.
     */
    notifySave(fileSlug: string): void {
        if (!this.started || !fileSlug) return;
        this.pending.add(fileSlug);
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, this.opts?.debounceMs ?? WATCH_DEBOUNCE_MS);
    }

    /** Subscribe to {running, lastResult, watchedAt}. Unsubscribe fn returned. */
    subscribe(cb: (state: WatchRunnerState) => void): () => void {
        this.listeners.add(cb);
        return () => {
            this.listeners.delete(cb);
        };
    }

    private emit(): void {
        this.state = {
            running: this.running,
            lastResult: this.lastResult,
            watchedAt: this.watchedAt,
        };
        for (const cb of this.listeners) cb(this.state);
    }

    /** Debounce expired: resolve affected files and run them. */
    private async flush(): Promise<void> {
        if (!this.started || !this.opts) return;
        if (this.running) {
            // A run is in flight — remember to flush again when it lands.
            this.rerunAfter = true;
            return;
        }
        const changed = [...this.pending];
        this.pending.clear();

        const files: string[] = [];
        const seen = new Set<string>();
        for (const c of changed) {
            const affected = this.opts.affected ? this.opts.affected(c) : [c];
            for (const f of affected ?? []) {
                if (f && !seen.has(f)) {
                    seen.add(f);
                    files.push(f);
                }
            }
        }
        if (files.length === 0) return; // nothing affected — no run

        this.running = true;
        const token = ++this.runToken;
        setWatchRunning(true);
        this.emit();

        let result: TestRunResult;
        try {
            result = await this.opts.runTests(files);
        } catch (e) {
            result = {
                error: e instanceof Error ? e.message : String(e),
                total: 0,
                passed: 0,
                failed: 0,
                errors: 0,
                durationMs: 0,
                perFile: {},
                perTest: [],
            };
        }

        if (token !== this.runToken) return; // stop() or a newer run won

        this.lastResult = result;
        this.watchedAt = Date.now();
        this.running = false;
        setWatchRunning(false);
        publishWatchResult(result, files);
        this.emit();

        if (this.rerunAfter && this.started) {
            this.rerunAfter = false;
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.flush();
            }, 0);
        }
    }
}
