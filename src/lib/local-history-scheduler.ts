import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {type FileKind, fileKindFromExt, getScriptsRoot, restoreActiveProjectRoot, slugify,} from "@/lib/scripts";
import {nextCronRun, parseCron, type ParsedCron} from "@/lib/cron";
import {projectHistoryDir, saveLocalHistorySnapshot, snapshotDirs,} from "@/app/api/local-history/list/route-helpers";

/**
 * local-history-scheduler.ts — the PERIODIC snapshot pass.
 *
 * Save-time snapshots exist (file-write / import-py snapshot the
 * PRE-write content on every save). This module adds the time-based
 * safety net: every 5 minutes, every file in the ACTIVE project that
 * changed on disk since the last pass gets a snapshot too — so edits
 * made OUTSIDE the app (an external editor, a script that rewrites its
 * own output, a crash before the next save) still leave recoverable
 * history behind.
 *
 * HOW CHEAP IT STAYS:
 *   1. mtime + size are compared FIRST — an unchanged file costs ONE
 *      stat, no read, no hash;
 *   2. only files whose stat moved on are READ and HASHED (sha1);
 *   3. a snapshot is written ONLY when the content actually differs
 *      from the latest snapshot on disk (hash comparison);
 *   4. each pass is capped (MAX_FILES_PER_PASS examined-and-written,
 *      MAX_WALK_FILES stat'ed) so a huge project can never turn the
 *      pass into a minutes-long I/O storm;
 *   5. binary kinds are skipped the same way the save paths are
 *      text-only — an image/pdf/xlsx write never lands in history.
 *
 * SCHEDULING reuses lib/cron.ts: the every-5-minute cron expression
 * (see SCHEDULE_EXPR below) + nextCronRun() give
 * DRIFT-FREE wall-clock arming (a plain setInterval would drift and
 * slowly march away from the 5-minute grid). Each tick re-arms the
 * next one with a single unref'd setTimeout — the timer NEVER keeps
 * the process alive (a dev server with no requests exits cleanly) and
 * the pass is re-entrancy-guarded.
 *
 * LAZY START: nothing happens at import time. The first local-history
 * API call (list/save/diff/restore) arms the loop via
 * ensureSnapshotScheduler(); a session that never opens Local History
 * pays zero cost. And the loop NEVER runs under vitest (guard below).
 */

/** Every five minutes, on the 5-minute grid (see the header comment
 *  for why cron semantics instead of a plain interval). */
const SCHEDULE_EXPR = "*/5 * * * *";
/** Fallback arming interval when the cron expression somehow fails to
 *  parse (never expected — the expression is a constant above). */
const FALLBACK_INTERVAL_MS = 5 * 60_000;
/** Most files whose CONTENT gets read + hashed + possibly snapshotted
 *  in one pass (the spec's ~200 cap). */
const MAX_FILES_PER_PASS = 200;
/** Most files stat'ed per pass — bounds the walk itself on huge
 *  projects so even the cheap half cannot run long. */
const MAX_WALK_FILES = 4_000;
/** Files larger than this are skipped — a multi-MB data/log file
 *  re-hashed every 5 minutes would dominate the pass (and the
 *  save-time paths never snapshot monsters either). */
const MAX_SNAPSHOT_FILE_BYTES = 2_000_000;
/** Label sidecar for periodic snapshots — the Local History timeline
 *  renders it next to the time, so the user can SEE why a snapshot
 *  exists ("periodic" vs a manual label vs a plain save-time one). */
const PERIODIC_LABEL = "periodic";
/** Walk depth — mirrors listFolders' FOLDER_WALK_MAX_DEPTH so the
 *  scheduler covers exactly the tree the explorer shows. */
const WALK_MAX_DEPTH = 8;

/** Directory names never descended into (mirrors scripts.ts's
 *  SKIPPED_DIR_NAMES — venvs/pycache would balloon the walk). */
const SKIPPED_DIR_NAMES = new Set([
    "node_modules", "__pycache__", ".venv", "venv", "env",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".git", ".idea",
    ".vscode", "dist", "build", ".next", ".turbo", ".praxis",
]);

/** The same dotfiles the explorer shows (others are history-irrelevant
 *  noise) — mirrors scripts.ts's visibleDotfiles. */
const VISIBLE_DOTFILES = new Set([".gitignore", ".gitattributes", ".dockerignore"]);

/**
 * Text-representable kinds ONLY — the binary kinds (image / video /
 * audio / pdf / spreadsheet / sqlite) are skipped exactly like the
 * save-time paths, which are text edits by construction. "other"
 * (unknown extension) is skipped too: a file we cannot classify is
 * not something history should be duplicating every 5 minutes.
 */
const TEXTUAL_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
    "python", "markdown", "text", "log", "json", "yaml", "toml", "sql",
    "css", "javascript", "typescript", "matlab", "java", "c", "cpp",
    "r", "shell", "ruby", "php", "go", "lua", "perl", "rust", "julia",
    "kotlin", "swift", "powershell", "batch", "zig", "dart", "groovy",
    "scala", "elixir", "haskell", "erlang", "clojure", "ocaml",
    "fsharp", "graphql", "http", "html", "csv", "ipynb",
]);

/** Pure: is this file kind snapshot-eligible (text-representable)? */
export function isTextualSnapshotKind(kind: FileKind | undefined): boolean {
    return kind !== undefined && TEXTUAL_KINDS.has(kind);
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Pure pass planning (unit-tested)                                    */

/* ──────────────────────────────────────────────────────────────────── */

/** One file the walker found (all fields the planner needs). */
export interface PeriodicFileFact {
    /** Folder slug exactly as the save paths build it (slugify(".").()
     *  for root files — the sentinel /api/file and file-write accept). */
    folderSlug: string;
    /** File slug — slugify of the file's relative path INSIDE the folder
     *  (what the Local History timeline lists with). */
    fileSlug: string;
    /** Absolute path (path.join-built, Windows-safe). */
    abs: string;
    /** File display name (basename). */
    name: string;
    kind: FileKind;
    mtimeMs: number;
    size: number;
}

/** Bookkeeping per file, persisted in periodic-state.json. */
export interface PeriodicFileState {
    /** stat at the last pass — the cheap pre-filter. */
    mtimeMs: number;
    size: number;
    /** sha1 of the content as of the last pass (only computed when the
     *  stat moved — see the header comment). */
    hash: string;
    /** Newest snapshot id on disk at the last pass (ours or a save-time
     *  one) — lets the next pass skip re-reading it when it still is
     *  the newest and the content hash still matches. */
    snapId?: string;
}

/** State map key — `${folderSlug}/${fileSlug}` (stable, unique). */
export function stateKeyFor(folderSlug: string, fileSlug: string): string {
    return `${folderSlug}/${fileSlug}`;
}

/**
 * Pure candidate selection: the files whose stat (mtime+size) moved
 * since the last pass (or that are new), already filtered to
 * snapshot-eligible kinds and capped at `cap`. Unchanged files cost
 * ONE stat in the real pass — this is the pure mirror of that filter
 * so it can be pinned by tests.
 */
export function selectSnapshotCandidates(
    files: PeriodicFileFact[],
    state: Record<string, PeriodicFileState>,
    cap: number = MAX_FILES_PER_PASS
): PeriodicFileFact[] {
    const out: PeriodicFileFact[] = [];
    for (const f of files) {
        if (out.length >= cap) break;
        if (!isTextualSnapshotKind(f.kind)) continue;
        const prev = state[stateKeyFor(f.folderSlug, f.fileSlug)];
        if (
            prev &&
            prev.mtimeMs === f.mtimeMs &&
            prev.size === f.size
        ) {
            continue; // unchanged on disk — one stat, no read, no hash
        }
        out.push(f);
    }
    return out;
}

/** Pure: extension → FileKind wrapper (re-exported shape for tests). */
export function kindForFileName(name: string): FileKind {
    const ext =
        name.startsWith(".") && !path.extname(name)
            ? name.toLowerCase()
            : path.extname(name).toLowerCase();
    return fileKindFromExt(ext);
}

/* ──────────────────────────────────────────────────────────────────── */
/*  The pass itself                                                     */

/* ──────────────────────────────────────────────────────────────────── */

/** Where the per-project bookkeeping lives: next to the snapshots the
 *  pass writes (projectHistoryDir), named so the list route never
 *  mistakes it for a snapshot dir (it reads per-FILE subdirs only). */
function stateFilePath(): string {
    return path.join(projectHistoryDir(), "periodic-state.json");
}

interface PassResult {
    /** Files stat'ed by the walk (bounded by MAX_WALK_FILES). */
    walked: number;
    /** Files whose stat moved and were read + hashed. */
    examined: number;
    /** Snapshots actually written. */
    written: number;
    /** Candidates that turned out identical to the latest snapshot. */
    unchanged: number;
}

/** Parse the schedule once (memoized — parseCron is pure). */
let parsedSchedule: ParsedCron | null | undefined;

function parsedCronOrNull(): ParsedCron | null {
    if (parsedSchedule === undefined) {
        try {
            parsedSchedule = parseCron(SCHEDULE_EXPR);
        } catch {
            parsedSchedule = null;
        }
    }
    return parsedSchedule;
}

/** sha1 hex of a string (the hash of BOTH the current content and the
 *  latest snapshot's content — same hash either side of the compare). */
function hashContent(content: string): string {
    return crypto.createHash("sha1").update(content, "utf-8").digest("hex");
}

/**
 * Walk the ACTIVE project root the same way the explorer does:
 * root-level files + every top-level folder (recursively, to the same
 * depth cap), skipping hidden / venv / cache dirs, building the exact
 * (folderSlug, fileSlug) pairs the save paths and the timeline use:
 *   - root files   → folderSlug = slugify(".") (the sentinel every
 *                    route resolves to the scripts root itself),
 *                    fileSlug = slugify(name);
 *   - folder files → folderSlug = slugify(top-level folder name),
 *                    fileSlug = slugify(relative path inside it,
 *                    POSIX separators — the same slug the explorer's
 *                    file rows carry).
 */
export async function collectProjectFiles(): Promise<PeriodicFileFact[]> {
    const root = getScriptsRoot();
    const out: PeriodicFileFact[] = [];

    const visitFile = async (
        abs: string,
        name: string,
        folderSlug: string,
        relInside: string
    ): Promise<void> => {
        try {
            const stat = await fs.stat(abs);
            if (stat.size > MAX_SNAPSHOT_FILE_BYTES) return; // monster file
            out.push({
                folderSlug,
                fileSlug: slugify(relInside),
                abs,
                name,
                kind: kindForFileName(name),
                mtimeMs: stat.mtimeMs,
                size: stat.size,
            });
        } catch {
            /* vanished mid-walk — skip */
        }
    };

    // A folder (or the root) walk: files stat'ed + nested dirs descended.
    const walk = async (
        dir: string,
        folderSlug: string,
        folderDir: string,
        depth: number
    ): Promise<void> => {
        if (out.length >= MAX_WALK_FILES) return;
        let entries: import("node:fs").Dirent[];
        try {
            entries = await fs.readdir(dir, {withFileTypes: true});
        } catch {
            return; // unreadable dir — skip silently
        }
        for (const entry of entries) {
            if (out.length >= MAX_WALK_FILES) return;
            if (entry.name.startsWith(".") && !VISIBLE_DOTFILES.has(entry.name.toLowerCase())) {
                continue; // hidden file the explorer would not show either
            }
            if (entry.isDirectory()) {
                if (SKIPPED_DIR_NAMES.has(entry.name)) continue;
                if (depth + 1 > WALK_MAX_DEPTH) continue;
                await walk(path.join(dir, entry.name), folderSlug, folderDir, depth + 1);
            } else if (entry.isFile()) {
                const abs = path.join(dir, entry.name);
                const relInside = path
                    .relative(folderDir, abs)
                    .split(path.sep)
                    .join("/");
                await visitFile(abs, entry.name, folderSlug, relInside);
            }
        }
    };

    // Root-level files.
    let rootEntries: import("node:fs").Dirent[];
    try {
        rootEntries = await fs.readdir(root, {withFileTypes: true});
    } catch {
        rootEntries = [];
    }
    for (const entry of rootEntries) {
        if (out.length >= MAX_WALK_FILES) break;
        if (!entry.isFile()) continue;
        if (entry.name.startsWith(".") && !VISIBLE_DOTFILES.has(entry.name.toLowerCase())) {
            continue;
        }
        await visitFile(path.join(root, entry.name), entry.name, slugify("."), entry.name);
    }

    // Top-level folders (the same skip rules as listFolders).
    for (const entry of rootEntries) {
        if (!entry.isDirectory()) continue;
        if (out.length >= MAX_WALK_FILES) break;
        if (entry.name.startsWith(".") || SKIPPED_DIR_NAMES.has(entry.name)) {
            continue;
        }
        await walk(path.join(root, entry.name), slugify(entry.name), path.join(root, entry.name), 1);
    }

    return out;
}

/**
 * ONE periodic pass (exported for tests — the timer tick calls this).
 *
 * Reads the persisted state, walks the project, snapshots every
 * changed-and-different file through the EXISTING save machinery
 * (saveLocalHistorySnapshot — the same writer /api/local-history/save
 * and the save-time paths use), and persists the new state.
 */
export async function runPeriodicSnapshotPass(): Promise<PassResult> {
    // Restore the persisted active-project pointer first: after a server
    // restart the module state is null until some route restores it, and
    // the pass must target the project the user actually has open (the
    // very routes that arm this scheduler restore it on every call).
    await restoreActiveProjectRoot();

    const stateFile = stateFilePath();
    let state: Record<string, PeriodicFileState> = {};
    try {
        const raw = await fs.readFile(stateFile, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, PeriodicFileState>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            state = parsed;
        }
    } catch {
        /* no state yet (or a torn write) — everything looks new; the
           content-vs-latest-snapshot compare below keeps that safe (no
           duplicate snapshots get written for unchanged content). */
    }

    const files = await collectProjectFiles();
    const candidates = selectSnapshotCandidates(files, state);
    const result: PassResult = {
        walked: files.length,
        examined: 0,
        written: 0,
        unchanged: 0,
    };

    for (const f of candidates) {
        const key = stateKeyFor(f.folderSlug, f.fileSlug);
        const prev = state[key];
        let content: string;
        try {
            content = await fs.readFile(f.abs, "utf-8");
        } catch {
            continue; // vanished between stat and read
        }
        result.examined++;
        const hash = hashContent(content);

        // Newest snapshot on disk (canonical dir first, then the legacy
        // 16-char one — the same pair every read route checks).
        let latestId: string | null = null;
        for (const dir of snapshotDirs(f.folderSlug, f.fileSlug)) {
            let names: string[];
            try {
                names = await fs.readdir(dir);
            } catch {
                continue;
            }
            const ids = names
                .filter((n) => n.endsWith(".txt"))
                .map((n) => n.slice(0, -4))
                .sort();
            if (ids.length > 0) {
                latestId = ids[ids.length - 1];
                break;
            }
        }

        // Only the content-hash compare decides whether a snapshot lands:
        //  - no snapshot on disk → snapshot (the file has no history);
        //  - cached match: the newest id is the one we recorded AND the
        //    content hash is the one we recorded → identical to the
        //    latest snapshot, no read of the snapshot file needed;
        //  - otherwise read the latest snapshot and compare hashes.
        let differs: boolean;
        if (latestId === null) {
            differs = true;
        } else if (prev && prev.snapId === latestId && prev.hash === hash) {
            differs = false;
        } else {
            let latestContent: string | null = null;
            for (const dir of snapshotDirs(f.folderSlug, f.fileSlug)) {
                try {
                    latestContent = await fs.readFile(
                        path.join(dir, `${latestId}.txt`),
                        "utf-8"
                    );
                    break;
                } catch {
                    /* try the legacy dir */
                }
            }
            differs = latestContent === null || hashContent(latestContent) !== hash;
        }

        if (!differs) {
            result.unchanged++;
            // Record the stat anyway so the NEXT pass's mtime pre-filter
            // knows this exact (mtime, size) was already seen.
            state[key] = {mtimeMs: f.mtimeMs, size: f.size, hash, snapId: latestId ?? undefined};
            continue;
        }

        // WRITE through the existing machinery — same layout, same prune,
        // a "periodic" label the timeline renders next to the time.
        const id = await saveLocalHistorySnapshot(
            f.folderSlug,
            f.fileSlug,
            content,
            {label: PERIODIC_LABEL}
        );
        if (id !== null) {
            result.written++;
            state[key] = {mtimeMs: f.mtimeMs, size: f.size, hash, snapId: id};
        }
    }

    // Persist the state (atomic tmp+rename; a torn file degrades to the
    // everything-looks-new path above, which stays snapshot-idempotent).
    try {
        await fs.mkdir(projectHistoryDir(), {recursive: true});
        const tmp = `${stateFile}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(state), "utf-8");
        await fs.rename(tmp, stateFile);
    } catch {
        /* best-effort bookkeeping — the pass still did its snapshots */
    }
    return result;
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Arming (the unref'd, vitest-guarded loop)                           */
/* ──────────────────────────────────────────────────────────────────── */

let armed = false;
let running = false;
let lastPassAt = 0;
let lastResult: PassResult | null = null;
let lastError: string | null = null;

/**
 * True under the vitest runner (it exports VITEST) or any "test" NODE
 * environment — the loop must NEVER arm there (a 5-minute timer would
 * hold a vitest worker or fire mid-suite and write snapshots into the
 * REAL tmp history root from a test run).
 */
function isTestEnvironment(): boolean {
    return Boolean(
        typeof process !== "undefined" &&
        process.env &&
        (process.env.VITEST || process.env.NODE_ENV === "test")
    );
}

/** Status snapshot — surfaced by the save route's response so the
 *  feature is observable ("is the periodic loop even armed?"). */
export function schedulerStatus(): {
    armed: boolean;
    running: boolean;
    lastPassAt: number;
    lastWritten: number;
    lastError: string | null;
    schedule: string;
} {
    return {
        armed,
        running,
        lastPassAt,
        lastWritten: lastResult?.written ?? 0,
        lastError,
        schedule: SCHEDULE_EXPR,
    };
}

/** Compute the delay until the next 5-minute-grid slot (drift-free —
 *  see the header comment). Falls back to the plain interval when the
 *  cron machinery is somehow unusable, and clamps pathological clock
 *  skew to a sane re-arm. */
function nextDelayMs(): number {
    const parsed = parsedCronOrNull();
    if (!parsed) return FALLBACK_INTERVAL_MS;
    const next = nextCronRun(parsed, new Date());
    if (!next) return FALLBACK_INTERVAL_MS;
    const delay = next.getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return 60_000; // clock skew — re-arm soon
    return Math.min(delay, FALLBACK_INTERVAL_MS + 1_000);
}

/** Arm the NEXT tick (single unref'd setTimeout; re-armed by each
 *  completed tick so a pass can never overlap its own successor).
 *  The handle is intentionally NOT kept — nothing cancels a tick:
 *  the loop is armed for the life of the process and every handle is
 *  unref'd, so the server exits whenever ITS work is done. */
function armNext(): void {
    const handle = setTimeout(() => {
        void tick();
    }, nextDelayMs());
    // NEVER keep the process alive for the scheduler alone — an idle
    // dev server / standalone build must exit when its work is done.
    handle.unref?.();
}

/** One tick: run the pass (guarded against overlap), then re-arm. */
async function tick(): Promise<void> {
    if (running) {
        armNext();
        return;
    }
    running = true;
    try {
        lastResult = await runPeriodicSnapshotPass();
        lastError = null;
    } catch (err) {
        lastError = (err as Error).message;
    } finally {
        running = false;
        lastPassAt = Date.now();
        armNext();
    }
}

/**
 * Lazily arm the periodic snapshot loop — called by every
 * local-history route so the FIRST local-history API call of a server
 * session starts it. Idempotent, and a NO-OP under vitest / test
 * environments.
 */
export function ensureSnapshotScheduler(): void {
    if (armed) return;
    if (isTestEnvironment()) return; // never during vitest
    armed = true;
    armNext();
}
