import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import {SCRIPTS_DIR_NAME} from "@/lib/config";

/**
 * Active project root (multi-project support). When null, the app
 * falls back to the default `python_scripts/` directory. When set
 * (via /api/projects POST → setActiveProjectRoot), the app reads
 * folder folders from this custom path instead. The value lives in
 * module-level state on the server side; this is fine because the app
 * is a single-user dev tool.
 */
let _activeProjectRoot: string | null = null;

/**
 * Set the active project root (server-side, module-level). Pass `null`
 * to reset to the default `python_scripts/` directory.
 */
export function setActiveProjectRoot(root: string | null): void {
    _activeProjectRoot = root;
    // the folders cache must never survive a project
    // switch — it would serve the previous project's listing.
    invalidateFoldersCache();
    // persist the choice so a server RESTART doesn't silently
    // drop the user back onto the default project (and then seed
    // .praxis/settings.json into the WRONG folder — the root cause of
    // "the folder is created but nothing in it" on long dev sessions).
    void persistActiveProjectPointer(root);
}

/* ─── active-project persistence across restarts ────────
*
* The active root used to live ONLY in module state, so every
* `npm run dev` / standalone restart reset it to the default
* python_scripts/. On the next page load GET /api/projects reported
* active="" → the client switched to the DEFAULT project → the
*.praxis seeding wrote settings.json into python_scripts/ (or into
* the app cwd in earlier deployments — the empty-folder sightings) while the
* project the user actually worked in got a.praxis/ at most from an
* aborted write. The pointer below is written on every switch and
* re-validated on boot by restoreActiveProjectRoot. */

function activeProjectPointerFile(): string {
    return path.join(getDefaultScriptsRoot(), ".praxis", "active-project.json");
}

/** Best-effort atomic pointer write (never throws). */
async function persistActiveProjectPointer(root: string | null): Promise<void> {
    try {
        const file = activeProjectPointerFile();
        if (root === null) {
            // Reset to default = remove the pointer.
            try {
                await fs.unlink(file);
            } catch {
                /* absent — fine */
            }
            return;
        }
        await fs.mkdir(path.dirname(file), {recursive: true});
        const payload = JSON.stringify({active: path.resolve(root)}, null, 2) + "\n";
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmp, payload, "utf-8");
        await fs.rename(tmp, file);
    } catch {
        /* best-effort: a failed pointer write must never break a switch */
    }
}

let _restorePromise: Promise<void> | null = null;

/**
 * restore the persisted active project root after a server
 * restart — exactly once per process, and only when no explicit
 * switch has happened meanwhile. Re-validates the path against the
 * same guards as POST /api/projects (forbidden roots, still exists).
 * Awaited by GET /api/projects and GET /api/project-settings (the
 * two first mount calls), so every later getScriptsRoot — folders,
 * code, runs, and the.praxis seeding — resolves to the project the
 * user actually has open.
 */
export async function restoreActiveProjectRoot(): Promise<void> {
    if (_restorePromise) return _restorePromise;
    _restorePromise = (async () => {
        if (_activeProjectRoot !== null) return; // an explicit switch already won
        try {
            const text = await fs.readFile(activeProjectPointerFile(), "utf-8");
            const parsed = JSON.parse(text) as { active?: unknown };
            if (typeof parsed.active !== "string" || !parsed.active.trim()) return;
            const abs = path.resolve(parsed.active.trim());
            // Same rejection set as POST /api/projects — a crafted pointer
            // must not activate the app dir / a forbidden root.
            if (projectRootRejectionReason(abs)) return;
            try {
                const st = await fs.stat(abs);
                if (!st.isDirectory()) return;
            } catch {
                return; // vanished from disk — stay on the default project
            }
            if (_activeProjectRoot === null) {
                _activeProjectRoot = abs;
                invalidateFoldersCache();
            }
        } catch {
            /* no pointer / unreadable / invalid — default project stands */
        }
    })();
    return _restorePromise;
}

/**
 * Get the current scripts root — resolves to the active project root
 * if one has been set via setActiveProjectRoot, otherwise to the
 * explicit SCRIPTS_ROOT env var, and finally to the default
 * `python_scripts/` directory under process.cwd.
 *
 * The env var matters for the standalone deployment (
 * H4): Next.js's standalone server.js chdirs into .next/standalone,
 * so a cwd-relative root would point at a build-time traced snapshot
 * of python_scripts instead of the live volume mount. Setting
 * SCRIPTS_ROOT (e.g. /app/python_scripts in docker-compose) pins the
 * root to the mounted directory regardless of the working directory.
 */
export function getScriptsRoot(): string {
    if (_activeProjectRoot) return _activeProjectRoot;
    return getDefaultScriptsRoot();
}

/**
 * The scripts root used when NO custom project is active — the
 * SCRIPTS_ROOT env var if set (standalone/Docker deployment), the LIVE
 * `python_scripts` at the repo root when running from the standalone
 * build, otherwise `<cwd>/python_scripts`. Split out of getScriptsRoot
 * so other routes can resolve the same canonical location without
 * accidentally honoring the active custom project.
 */
export function getDefaultScriptsRoot(): string {
    if (process.env.SCRIPTS_ROOT) return path.resolve(/* turbopackIgnore: true */ process.env.SCRIPTS_ROOT);
    // turbopackIgnore: cwd is read at RUNTIME (not build time) — without
    // this comment Turbopack's static analysis traces the whole project
    // into the standalone build output. The comment must sit INSIDE the
    // call's arguments (the documented form).
    const cwd = process.cwd(/* turbopackIgnore: true */);
    // STANDALONE DEPLOYMENT — `bun .next/standalone/server.js` runs with
    // cwd INSIDE the build snapshot (.next/standalone). A cwd-relative
    // root would point at the snapshot's COPIED python_scripts (the
    // copy-standalone step), so the auto-created .praxis/ folder
    // (settings.json, appearance.json, projects.json…) landed in
    // .next/standalone/python_scripts/.praxis — invisible next to the
    // real project and wiped by every rebuild. Climb out of the
    // snapshot (.next/standalone → repo root) and use the LIVE
    // python_scripts there when it exists; only when it doesn't (a
    // self-contained deployment on a machine without the repo) do we
    // fall back to the snapshot's copy.
    if (cwd.endsWith(`${path.sep}.next${path.sep}standalone`)) {
        // turbopackIgnore: same runtime-only rule as process.cwd above —
        // these joins resolve per-request roots, never build-time files.
        const repoRoot = path.dirname(/* turbopackIgnore: true */ path.dirname(cwd));
        const liveRoot = path.join(/* turbopackIgnore: true */ repoRoot, SCRIPTS_DIR_NAME);
        try {
            if (fsSync.existsSync(liveRoot)) {
                return path.resolve(/* turbopackIgnore: true */ liveRoot);
            }
        } catch {
            /* fall through to the cwd-relative root */
        }
    }
    // turbopackIgnore: the final fallback is likewise runtime-only —
    // cwd comes from the running server, so the traced output must not
    // sweep the whole project in.
    return path.resolve(/* turbopackIgnore: true */ cwd, SCRIPTS_DIR_NAME);
}

/**
 * The parent directory that top-level projects live in — the directory
 * that /api/projects scans, /api/projects/create makes new project
 * folders in, and /api/upload-zip extracts archives into.
 *
 * In dev / non-standalone runs this is simply `process.cwd`. When
 * SCRIPTS_ROOT is pinned (standalone Docker) it is that
 * root's PARENT: docker-compose mounts `./python_scripts:/app/python_scripts`,
 * so the app root that sibling projects should live in is `/app` — not
 * `.next/standalone`, which is a build-time snapshot that a container
 * rebuild wipes. Before this helper existed, all three routes resolved
 * the parent from `process.cwd`, so in the Docker deployment new
 * projects were created inside the throwaway snapshot directory and
 * were invisible to the volume-mounted filesystem.
 */
export function getProjectsParentRoot(): string {
    if (process.env.SCRIPTS_ROOT) {
        return path.dirname(path.resolve(/* turbopackIgnore: true */ process.env.SCRIPTS_ROOT));
    }
    // Standalone build: same climb-out as getDefaultScriptsRoot — sibling
    // projects must live NEXT TO the live python_scripts at the repo
    // root, never inside the .next/standalone snapshot.
    const cwd = process.cwd(/* turbopackIgnore: true */);
    if (cwd.endsWith(`${path.sep}.next${path.sep}standalone`)) {
        return path.dirname(/* turbopackIgnore: true */ path.dirname(cwd));
    }
    return cwd;
}

/* ─── Created-projects registry ─────────────────────────────────── */

/**
 * Projects created through the app (`POST /api/projects/create` and
 * `POST /api/upload-zip`) are recorded in this registry so they remain
 * listed and selectable WHILE THEY ARE STILL EMPTY.
 *
 * Why it exists: GET /api/projects only lists directories that contain
 * at least one.py file, and POST /api/projects refuses empty roots
 * (arbitrary empty directories must not be activatable as
 * the sandbox root). Without a registry, a freshly created project was
 * invisible in the project menu and unreachable — the "created it but
 * the explorer never goes to it" bug. (The old workaround — seeding a
 * `folder_1` folder — never actually fixed it, because an empty
 * folder contains no.py files either; it just littered every new
 * project with a stray folder. The seed is gone;
 * the registry is the real fix.)
 *
 * Storage: `<default scripts root>/.praxis/projects.json` — a stable
 * location that exists in every deployment mode, follows SCRIPTS_ROOT
 * (so it lands on the mounted Docker volume and survives container
 * restarts), and is invisible to every folder/project scan because
 * `.praxis` is a dot-directory. Writes are atomic (temp file + rename)
 * so a crash mid-write can never truncate it.
 *
 * Tamper resistance: every consumer must re-validate a registry entry
 * before trusting it (direct child of getProjectsParentRoot, not a
 * forbidden root name, not a dot-path, still exists on disk) — the
 * file lives inside the sandbox, so a crafted file-write must not be
 * able to register e.g. `node_modules` as a switchable project.
 */
const CREATED_PROJECTS_CACHE_TTL_MS = 5_000;
let createdProjectsCache: { at: number; paths: Set<string> } | null = null;

function createdProjectsFilePath(): string {
    return path.join(getDefaultScriptsRoot(), ".praxis", "projects.json");
}

/** Parse + validate the registry file. Invalid entries are dropped. */
async function loadCreatedProjects(): Promise<Set<string>> {
    if (
        createdProjectsCache &&
        Date.now() - createdProjectsCache.at < CREATED_PROJECTS_CACHE_TTL_MS
    ) {
        return createdProjectsCache.paths;
    }
    const paths = new Set<string>();
    try {
        const text = await fs.readFile(createdProjectsFilePath(), "utf-8");
        const parsed = JSON.parse(text) as { projects?: unknown };
        if (Array.isArray(parsed.projects)) {
            for (const p of parsed.projects) {
                // Only absolute paths survive; relative entries are meaningless
                // across deployments.
                if (typeof p === "string" && path.isAbsolute(p)) {
                    paths.add(path.resolve(p));
                }
            }
        }
    } catch {
        /* missing / unreadable / invalid JSON — treat as empty registry */
    }
    createdProjectsCache = {at: Date.now(), paths};
    return paths;
}

/** Record a newly created project. Idempotent; prunes dead entries. */
export async function registerCreatedProject(abs: string): Promise<void> {
    const resolved = path.resolve(abs);
    const paths = await loadCreatedProjects();
    if (paths.has(resolved)) return;
    paths.add(resolved);
    // Prune entries whose directory no longer exists so the registry
    // doesn't accumulate every project the user ever deleted.
    const alive: string[] = [];
    for (const p of paths) {
        try {
            const st = await fs.stat(p);
            if (st.isDirectory()) alive.push(p);
        } catch {
            /* deleted — drop */
        }
    }
    const file = createdProjectsFilePath();
    await fs.mkdir(path.dirname(file), {recursive: true});
    const payload =
        JSON.stringify({projects: alive.sort()}, null, 2) + "\n";
    // Atomic write: a reader never sees a half-written registry.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, payload, "utf-8");
    await fs.rename(tmp, file);
    createdProjectsCache = {at: Date.now(), paths: new Set(alive)};
}

/** All registered project paths (unvalidated — callers must re-check). */
export async function listCreatedProjects(): Promise<string[]> {
    const paths = await loadCreatedProjects();
    return Array.from(paths);
}

/** True when `abs` was registered as app-created. Callers must still
 *  apply the containment / forbidden-name checks before activating it. */
export async function isCreatedProject(abs: string): Promise<boolean> {
    const paths = await loadCreatedProjects();
    return paths.has(path.resolve(abs));
}

/* ─── Project-directory scanning (shared by /api/projects and
       /api/folder-list) ──────────────────────────────────────────── */

/**
 * Directories that may never be set as a project root:
 * the app directory itself and the app's own source / build / VCS
 * trees. Relocating the sandbox root there made .env, the SQLite db
 * and the server tree readable/writable through every file route
 * while the per-file containment checks still "passed".
 *
 * Kept in sync with the reserved-name set in /api/projects/create.
 * Shared by /api/projects (listing + POST validation) and
 * /api/folder-list (the "Browse for folder…" picker hides these).
 */
export const FORBIDDEN_ROOT_NAMES: ReadonlySet<string> = new Set([
    "node_modules",
    ".next",
    ".git",
    ".svn",
    ".hg",
    "public",
    "src",
    ".vscode",
    ".idea",
    "prisma",
    "db",
    "mini-services",
    "scripts",
    "out",
    "dist",
    "build",
    ".cache",
    ".turbo",
    ".vercel",
]);

/**
 * shared guard for activatable project roots.
 *
 * A project folder may now live ANYWHERE on the machine, so the old "direct child of the
 * projects parent root" containment is retired. What stays rejected
 * are the genuine footguns:
 *
 * - the filesystem/drive root itself ("/", "C:\\") — activating it
 * would make every folder scan walk the entire drive;
 * - the app's own directory (process.cwd) — activating it would
 * expose.env, the server source and the build tree to every
 * per-file read/write route while their containment checks
 * "pass";
 * - reserved directory names (node_modules, src, public, …);
 * - hidden dot-folders (.git,.cache, …) as the root itself.
 *
 * Returns a human-readable rejection reason, or null when the path is
 * an acceptable project root. Callers still need to stat the path
 * themselves (existence + is-a-directory).
 */
export function projectRootRejectionReason(resolved: string): string | null {
    const p = path.resolve(resolved);
    if (p === path.parse(p).root) {
        return "The drive root itself cannot be opened as a project — pick a folder inside it.";
    }
    if (p === process.cwd()) {
        return "The app's own directory cannot be opened as a project — pick a content folder.";
    }
    const base = path.basename(p);
    if (base.startsWith(".")) {
        return `Hidden folders (names starting with ".") cannot be opened as a project.`;
    }
    if (FORBIDDEN_ROOT_NAMES.has(base)) {
        return `"${base}" is a reserved directory name and cannot be opened as a project.`;
    }
    return null;
}

/**
 * One recursive walk that BOTH checks for .py files AND counts them
 * (fast path: /api/projects GET no longer walks every project tree
 * twice — once in containsPythonFiles and again in countPythonFiles).
 * Depth-capped to avoid runaway scans. Shared with /api/folder-list
 * so the folder picker shows the same counts the project menu does.
 */
export async function scanPythonFiles(
    dir: string,
    depth = 0
): Promise<{ hasPy: boolean; count: number }> {
    if (depth > 4) return {hasPy: false, count: 0};
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
        return {hasPy: false, count: 0};
    }
    let hasPy = false;
    let count = 0;
    for (const entry of entries) {
        if (entry.isFile()) {
            if (entry.name.toLowerCase().endsWith(".py")) {
                hasPy = true;
                count++;
            }
        } else if (entry.isDirectory()) {
            // Skip noise directories.
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const sub = await scanPythonFiles(path.join(dir, entry.name), depth + 1);
            if (sub.hasPy) hasPy = true;
            count += sub.count;
        }
    }
    return {hasPy, count};
}

/**
 * True when no custom project root has been set (i.e. the app is
 * reading from the default `python_scripts/` directory). Useful for
 * the /api/projects GET handler so it can signal the "default" state
 * to the client without leaking the absolute default path.
 */
export function isActiveProjectDefault(): boolean {
    return _activeProjectRoot === null;
}

/**
 * Returns the active custom project root that was set via
 * setActiveProjectRoot, or null if none has been set (i.e. the app
 * is using the default `python_scripts/` directory).
 */
export function getActiveProjectRoot(): string | null {
    return _activeProjectRoot;
}

/**
 * Per-run temp directory used by the matplotlib capture prelude. Each
 * run gets its own subfolder under this root so figures from different
 * runs never collide. The /api/figure endpoint serves files from here.
 */
export const RUN_TMP_ROOT = path.resolve(
    /* turbopackIgnore: true */ process.env.RUN_TMP_ROOT ??
    path.join(os.tmpdir(), "statcomp-runs")
);

/** Public URL prefix under which captured figures are exposed. */
export const FIGURE_URL_PREFIX = "/api/figure";

export interface FolderInfo {
    /** Folder (folder) display name. */
    name: string;
    /** URL-safe slug used for routing / lookups. */
    slug: string;
    /** True for the synthetic PROJECT-ROOT entry. Its slug deslugifies to "." — the sentinel
     * that every route's `path.join(scriptsRoot, ".")` already resolves
     * to the scripts root itself, so root-level files ride the exact
     * same (folderSlug, fileSlug) machinery as files inside real
     * folders. The tree uses the flag to swap the default icon to a
     * drive glyph and hide root-dangerous operations (rename / delete /
     * venv / folder zip). */
    isRoot?: boolean;
    /** Python files inside this folder, sorted alphabetically. */
    files: FileInfo[];
    /** every SUBFOLDER path inside this folder (relative,
     * POSIX separators, recursive — including folders that contain no
     * files yet). The explorer renders folder rows from this ∪ the
     * files' own `dir` values, so an EMPTY subfolder created via
     * "New subfolder…" shows up immediately. */
    dirs?: string[];
    /** readmeFile / hasReadme were REMOVED — README.md is now
     *  an ordinary file in `files` (kind "markdown"), rendered + edited
     *  like any other .md file, instead of being hoisted into a special
     *  folder-intro card. */
    /** True if the folder folder exists but has no .py files. */
    isEmpty?: boolean;
    /** Tags declared across all scripts in this folder (deduped). */
    tags?: string[];
    /** Non-Python files (CSV, JSON, parquet, images, etc.) shown in the data-file browser. */
    dataFiles?: DataFileInfo[];
}

export interface FileInfo {
    /** Display name (the basename), e.g. "Brier Score.py". */
    name: string;
    /** URL-safe slug — encodes the RELATIVE PATH inside
     *  the folder ("subdir/file.py" for nested files, plain name for
     *  folder-root files). Lossless base64url, so every route that
     *  deslugifies + path.joins resolves nested files transparently. */
    slug: string;
    /** File size in bytes (used by the UI for the "X bytes" hint). */
    size: number;
    /** First paragraph of the module docstring, used as a one-line description. */
    description?: string;
    /** Tags declared in the script (parsed from `# tags: a, b, c` comments). */
    tags?: string[];
    /** File modification time, ms since epoch. */
    mtime?: number;
    /**
     * File kind — used by the file viewer to pick the right renderer.
     * `python` is the original kind; the others were added when the
     * explorer became a "real" file explorer that shows every file
     * in the folder folder, not just .py.
     */
    kind?: FileKind;
    /** Lowercase extension including the dot, e.g. ".py", ".md", ".csv". */
    ext?: string;
    /** relative folder path INSIDE the folder (POSIX
     *  separators; "" = folder root; "data/raw" = nested two levels).
     * The explorer groups files into folder rows from this. */
    dir?: string;
    /** relative path incl. filename (POSIX separators);
     *  equals `name` for folder-root files. */
    path?: string;
}

/**
 * Categorize a file by its extension so the file viewer can pick
 * the right renderer. "other" files show a friendly "unsupported"
 * message instead of failing silently.
 *
 * The set is deliberately conservative — only kinds the viewer
 * actually has a renderer for. Add new kinds here AND in the
 * FileViewer component at the same time.
 */
export type FileKind =
    | "python"      // .py — full CodeViewer + Run + Diagnostics
    | "markdown"    // .md, .markdown — render as Markdown + edit
    | "text"        // .txt, .ini, .cfg, .conf — plain text + edit
    | "log" //.log — level-colored, filterable log mode
    | "json"        // .json, .jsonl — syntax-highlighted JSON + edit
    | "yaml"        // .yaml, .yml — syntax-highlighted YAML + edit
    | "toml"        // .toml — syntax-highlighted TOML + edit
    | "sql" //.sql — syntax-highlighted SQL + edit
    | "css" //.css — syntax-highlighted CSS + edit
    | "javascript" //.js,.mjs,.cjs,.jsx — run with node + format
    | "typescript" //.ts,.mts,.tsx — run with tsx/node/deno + format
    | "matlab" //.m — run with matlab -batch / Octave + format
    | "java" //.java — single-file run (java file.java) + format
    | "c" //.c — gcc compile+run + format
    | "cpp" //.cpp,.cc,.cxx — g++ compile+run + format
    | "r" //.R,.r — syntax-highlighted R + edit
    | "shell" //.sh,.bash — syntax-highlighted shell + edit
    | "ruby" //.rb — run with ruby + syntax-highlight + edit
    | "php" //.php — run with php + syntax-highlight + edit
    | "go" //.go — run with `go run` + syntax-highlight + edit
    // six more registry languages (run + highlight + edit + format).
    | "lua"         // .lua — run with lua + highlight + edit + format
    | "perl"        // .pl, .pm — run with perl + highlight + edit + format
    | "rust"        // .rs — rustc compile+run + highlight + edit + format
    | "julia"       // .jl — run with julia + highlight + edit + format
    | "kotlin"      // .kt, .kts — run with kotlin script mode + highlight + edit + format
    | "swift"       // .swift — run with swift + highlight + edit + format
    // the Windows-native scripting pair (the "add other
    // languages also" batch — the primary deployment is a Windows box).
    | "powershell"  // .ps1, .psm1, .psd1 — run with powershell/pwsh + highlight + edit + format
    | "batch"       // .bat, .cmd — run with cmd /c + highlight + edit + format
    // more registry languages (run + highlight + edit + format).
    | "zig"         // .zig — run with `zig run` + highlight + edit + format
    | "dart"        // .dart — run with `dart run` + highlight + edit + format
    | "groovy"      // .groovy, .gy — run with groovy + highlight + edit + format
    | "scala"       // .scala, .sc — run with scala + highlight + edit + format
    | "elixir"      // .exs, .ex — run with elixir + highlight + edit + format
    // the functional-language wave (the "add more languages" batch):
    // runnable kinds with Prism grammars, offline re-indenters and
    // Language Lab examples. GraphQL is format/highlight/edit only (a
    // QUERY language — there is no interpreter; its "runtime" is the
    // format pass + the viewer's syntax highlighting).
    | "haskell"     // .hs, .lhs — run with runghc + highlight + edit + format
    | "erlang"      // .erl, .es — run with escript + highlight + edit + format
    | "clojure"     // .clj, .cljs, .edn — run with bb/clojure + highlight + edit + format
    | "ocaml"       // .ml, .mli — run with ocaml + highlight + edit + format
    | "fsharp"      // .fsx, .fs — run with dotnet fsi + highlight + edit + format
    | "graphql"     // .graphql, .gql, .schema — highlight + edit + format (no runtime)
    | "html"        // .html, .htm — render in an iframe
    | "csv"         // .csv, .tsv — table viewer
    | "spreadsheet" // .xlsx, .xls, .parquet, .feather — pandas table
    // viewer via /api/data-sheet
    | "image"       // .png, .jpg, .jpeg, .gif, .webp, .svg, .bmp — <img>
    | "video"       // .mp4, .webm, .mov, .ogv — <video controls>
    | "audio"       // .mp3, .wav, .ogg, .flac — <audio controls>
    | "pdf"         // .pdf — <iframe> with the PDF viewer
    | "ipynb"       // .ipynb — notebook viewer (existing)
    | "http"       // .http, .rest — the REST API client workbench
    | "sqlite" //.db,.sqlite,.sqlite3,.db3 — SQL workbench
    | "other";      // anything else — "Unsupported file type"

/** Map a file extension to a FileKind. Returns "other" for unknown. */
export function fileKindFromExt(ext: string): FileKind {
    const e = ext.toLowerCase();
    if (e === ".py" || e === ".pyw") return "python";
    if (e === ".md" || e === ".markdown" || e === ".mdx") return "markdown";
    if (e === ".txt" || e === ".ini" || e === ".cfg" || e === ".conf" || e === ".env") return "text";
    //.log gets its own LEVEL-COLORED, filterable mode.
    if (e === ".log") return "log";
    // Standard ignore/config dotfiles — the whole name acts as the
    // "extension" (path.extname(".gitignore") is ""). Editable as text.
    if (e === ".gitignore" || e === ".gitattributes" || e === ".dockerignore") return "text";
    if (e === ".json" || e === ".jsonl") return "json";
    // The REST API workbench — .http / .rest files open in the API
    // client (request builder + environments + response inspector).
    if (e === ".http" || e === ".rest") return "http";
    if (e === ".yaml" || e === ".yml") return "yaml";
    if (e === ".toml") return "toml";
    if (e === ".sql") return "sql";
    // stylesheets join the editable text kinds (the
    // misc-format beautifier + re-indenter target them).
    if (e === ".css") return "css";
    // the CSS preprocessor dialects highlight through the css
    // grammar too (scss / less / sass) — kind "css" (edit + format +
    // highlight all keep working).
    if (e === ".scss" || e === ".less" || e === ".sass") return "css";
    // unified diffs / patches render as text with the DIFF
    // grammar (+/- lines, hunk headers) — prismLanguageFor routes them.
    if (e === ".diff" || e === ".patch") return "text";
    // the web-dev + engineering language families.
    if (e === ".js" || e === ".mjs" || e === ".cjs" || e === ".jsx") return "javascript";
    if (e === ".ts" || e === ".mts" || e === ".tsx") return "typescript";
    if (e === ".m") return "matlab";
    if (e === ".java") return "java";
    if (e === ".c" || e === ".h") return "c";
    if (e === ".cpp" || e === ".cc" || e === ".cxx" || e === ".hpp" || e === ".hh") return "cpp";
    if (e === ".r" || e === ".rmd") return "r";
    if (e === ".sh" || e === ".bash" || e === ".zsh") return "shell";
    // the remaining registry languages — ruby / php / go
    // became real file kinds (run + highlight + edit + format).
    if (e === ".rb" || e === ".rbw" || e === ".gemspec") return "ruby";
    if (e === ".php") return "php";
    if (e === ".go") return "go";
    // the six new registry languages — real file kinds (run +
    // highlight + edit + format) wired through the runtime registry.
    if (e === ".lua") return "lua";
    if (e === ".pl" || e === ".pm") return "perl";
    if (e === ".rs") return "rust";
    if (e === ".jl") return "julia";
    if (e === ".kt" || e === ".kts") return "kotlin";
    if (e === ".swift") return "swift";
    // the Windows-native scripting pair — PowerShell scripts
    // and modules run through powershell.exe / pwsh; .bat / .cmd through
    // cmd.exe (with a graceful install hint on non-Windows machines).
    if (e === ".ps1" || e === ".psm1" || e === ".psd1") return "powershell";
    if (e === ".bat" || e === ".cmd") return "batch";
    // the added registry languages — real file kinds (run + highlight +
    // edit + format) wired through the runtime registry.
    if (e === ".zig") return "zig";
    if (e === ".dart") return "dart";
    if (e === ".groovy" || e === ".gy") return "groovy";
    if (e === ".scala" || e === ".sc") return "scala";
    if (e === ".exs" || e === ".ex") return "elixir";
    // the functional-language wave — same wiring as the registry
    // languages above.
    if (e === ".hs" || e === ".lhs") return "haskell";
    if (e === ".erl" || e === ".es") return "erlang";
    if (e === ".clj" || e === ".cljs" || e === ".edn") return "clojure";
    if (e === ".ml" || e === ".mli") return "ocaml";
    if (e === ".fsx" || e === ".fs") return "fsharp";
    if (e === ".graphql" || e === ".gql" || e === ".schema") return "graphql";
    if (e === ".html" || e === ".htm") return "html";
    //
    // some other languages and formats"): XML-family documents join the
    // HTML kind — the viewer renders them (browsers display XML), and
    // the Source / Split panes highlight them with the SAME registered
    // markup grammar. .svg stays an image (it previews as a graphic),
    // .rmd stays R.
    if ([".xml", ".xhtml", ".rss", ".atom", ".plist", ".xaml", ".wsdl", ".xsd", ".xsl", ".xslt", ".csproj", ".resx", ".config"].includes(e)) return "html";
    if (e === ".csv" || e === ".tsv") return "csv";
    // Binary spreadsheet formats — rendered through the pandas-backed
    // /api/data-sheet reader (same table the DataFileBrowser uses).
    if (e === ".xlsx" || e === ".xls" || e === ".parquet" || e === ".feather") return "spreadsheet";
    // SQLite databases open the SQL workbench directly
    // (schema + ER diagram + read-only queries) instead of the
    // "Unsupported file type" card.
    if (e === ".db" || e === ".sqlite" || e === ".sqlite3" || e === ".db3") return "sqlite";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"].includes(e)) return "image";
    if ([".mp4", ".webm", ".mov", ".ogv", ".mkv"].includes(e)) return "video";
    if ([".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"].includes(e)) return "audio";
    if (e === ".pdf") return "pdf";
    if (e === ".ipynb") return "ipynb";
    return "other";
}

export interface DataFileInfo {
    /** Display name, e.g. "samples.csv". */
    name: string;
    /** File size in bytes. */
    size: number;
    /** File extension (lowercase, including the dot). */
    ext: string;
    /** Modification time, ms since epoch. */
    mtime?: number;
    /** relative folder path inside the folder ("" = root). */
    dir?: string;
    /** relative path incl. filename. */
    path?: string;
    /** base64url slug of the RELATIVE PATH (identical contract to
     *  FileInfo.slug). /api/data-file and /api/data-sheet accept it as
     *  the `file` parameter so NESTED data files
     *  ("Data Files/SensorReadings.csv") resolve — the legacy plain
     *  `name` parameter only reaches files sitting directly in the
     *  folder root, which silently 404'd every sub-foldered data file
     *  in the Data File Browser. Optional so hand-built listings (tests,
     *  older clients) keep type-checking. */
    slug?: string;
}

/**
 * Convert a folder / file name into a URL-safe slug.
 * We base64-url-encode the raw name so the round trip is lossless even
 * when the name contains spaces, slashes or non-ASCII characters.
 */
export function slugify(name: string): string {
    return Buffer.from(name, "utf-8").toString("base64url");
}

export function deslugify(slug: string): string {
    return Buffer.from(slug, "base64url").toString("utf-8");
}

/**
 * shared sanitizer for a relative SUB-FOLDER path INSIDE a
 * folder ("" / undefined = the folder root). Every route that gained a
 * `sub` / `toSub` parameter in this set (file-move, file-copy,
 * folder-zip, upload-zip, files-import, folder-stats, full-text-search,
 * resolve-path — plus the earlier run-all / folder-lint / open-folder
 * / file-create / folder-rename / folder-delete) validates the path
 * through this one guard: no traversal, no separators other than "/",
 * no absolute / trailing-slash forms, no hidden or empty segments.
 *
 * Returns "" (folder root) or the cleaned path on success, or null
 * when the input is invalid (callers answer 400).
 */
export function sanitizeSubPath(sub: string | undefined | null): string | null {
    const clean = (sub ?? "").trim();
    if (!clean) return "";
    if (
        clean.includes("..") ||
        clean.includes("\\") ||
        clean.startsWith("/") ||
        clean.endsWith("/") ||
        clean.split("/").some((seg) => !seg || seg.startsWith("."))
    ) {
        return null;
    }
    return clean;
}

/**
 * listFolders result cache: the full-project rescan used
 * to run on EVERY /api/folders request — each one re-addirs the root,
 * stats and reads the first 2 KB of every Python file, and the tree
 * refreshes whenever the always-on watch-dir SSE reports any write
 * (including the app's own saves). The cache is invalidated by fs
 * events (the watch-dir route calls invalidateFoldersCache on every
 * watcher callback) and by every project switch, and expires after the
 * TTL below as a safety net for missed events.
 */
const FOLDERS_CACHE_TTL_MS = 5_000;
let foldersCache: { at: number; value: FolderInfo[] } | null = null;

/** Drop the cached listFolders result (fs event / project switch). */
export function invalidateFoldersCache(): void {
    foldersCache = null;
}

/**
 * List every folder (sub-directory) under the scripts root along with the
 * Python files inside it. Hidden folders (starting with `.`) and the
 * special `node_modules` folder are ignored.
 *
 * Empty folders ARE included (with `isEmpty: true`) so the UI can show
 * them with an "empty" badge — useful when the user is mid-adding
 * folders to a fresh project.
 */
export async function listFolders(includeHidden = false): Promise<FolderInfo[]> {
    if (
        foldersCache &&
        !includeHidden &&
        Date.now() - foldersCache.at < FOLDERS_CACHE_TTL_MS
    ) {
        return foldersCache.value;
    }
    const scriptsRoot = getScriptsRoot();
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(
            /* turbopackIgnore: true */ scriptsRoot,
            {withFileTypes: true}
        );
    } catch {
        // The folder does not exist (yet). Return an empty list rather than
        // throwing, so the UI can render a friendly empty state.
        return [];
    }

    const folderDirs: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // hidden dot-directories (.praxis with the project
        // settings!) surface when the explorer's show-hidden toggle is on.
        if ((entry.name.startsWith(".") || entry.name === "node_modules") && !includeHidden) continue;
        folderDirs.push(path.join(/* turbopackIgnore: true */ scriptsRoot, entry.name));
    }

    // Process folders in PARALLEL (was sequential) — for a project with
    // 20+ folders this cuts the total listFolders time from O(N×M)
    // sequential reads to ~one folder's worth of I/O. the
    // separate readFolderReadme pass was removed with the folder-intro
    // card (README.md is a normal file now), so each folder is ONE
    // readdir + one stat pass per file.
    const folderResults = await Promise.all(
        folderDirs.map(async (folderDir) => {
            const entryName = path.basename(folderDir);
            // listFilesAndDataFiles merged what used to be three separate
            // readdirs (files + data files + README detection) into ONE
            // readdir + ONE stat pass per file.
            const {files, dataFiles, dirs} = await listFilesAndDataFiles(folderDir, "", 0, includeHidden);

            // Aggregate tags across all .py scripts in the folder.
            const tagSet = new Set<string>();
            for (const f of files) {
                for (const t of f.tags ?? []) tagSet.add(t);
            }

            return {
                name: entryName,
                slug: slugify(entryName),
                files,
                dirs,
                isEmpty: files.length === 0,
                tags: Array.from(tagSet).sort(),
                dataFiles,
            } as FolderInfo;
        })
    );

    // Sort folders alphabetically (case-insensitive) for stable display.
    folderResults.sort((a, b) =>
        a.name.localeCompare(b.name, "en", {sensitivity: "base"})
    );

    // ── PROJECT-ROOT entry
    // folder, they are not displayed and only folders are displayed") ──
    // listFolders used to list ONLY the sub-directories, so files that
    // sit directly in the project root (python_scripts/ or the active
    // project) were invisible in the explorer. A synthetic first entry now
    // carries them:
    //   • name   — the root directory's real basename ("python_scripts",
    //              or the active project's folder name) so every display
    //              surface (tree header, Recent list, run labels) reads
    //              naturally;
    //   • slug   — slugify("."), the sentinel every route resolves via
    //              path.join(scriptsRoot, ".") === scriptsRoot, so
    //              opening / saving / running / exporting a root file uses
    //              the same (folderSlug, fileSlug) code path as any other
    //              file — no route changes required;
    //   • files  — a FLAT scan (depth is passed at the walk cap, so the
    //              walker never descends): only files directly in the
    //              root; sub-directories are the regular entries below.
    // The entry is ALWAYS present (even when the root holds no files) so
    // "New file…" can create root-level files and the project root stays
    // visible; the tree renders it with a drive icon first, before every
    // real folder.
    const rootListing = await listFilesAndDataFiles(
        scriptsRoot,
        "",
        FOLDER_WALK_MAX_DEPTH
    );
    const rootTagSet = new Set<string>();
    for (const f of rootListing.files) {
        for (const t of f.tags ?? []) rootTagSet.add(t);
    }
    const rootEntry: FolderInfo = {
        name: path.basename(/* turbopackIgnore: true */ scriptsRoot),
        slug: slugify("."),
        isRoot: true,
        files: rootListing.files,
        dirs: [],
        isEmpty: rootListing.files.length === 0,
        tags: Array.from(rootTagSet).sort(),
        dataFiles: rootListing.dataFiles,
    };
    folderResults.unshift(rootEntry);

    foldersCache = {at: Date.now(), value: folderResults};
    return folderResults;
}

/** readFolderReadme / readFolderReadmeBody were REMOVED.
 *  README.md is now listed as a NORMAL file by listFilesAndDataFiles
 *  (kind "markdown"), so the special folder-readme card, its badge
 *  and its on-demand /api/folder-readme route are gone. */

/** Extensions considered "data files" (shown in the folder data browser). */
const DATA_FILE_EXTS = new Set([
    ".csv", ".tsv", ".json", ".jsonl", ".parquet", ".feather",
    ".xlsx", ".xls", ".db", ".sqlite", ".h5", ".hdf5",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    ".txt", ".md", ".yaml", ".yml", ".toml", ".pkl", ".npz", ".npy",
]);

/** directories the folder listing never descends
 * into — venvs, caches and build outputs can be huge and are never
 * user content. */
const SKIPPED_DIR_NAMES = new Set([
    "node_modules", "__pycache__", ".venv", "venv", "env",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".git", ".idea",
    ".vscode", "dist", "build", ".next", ".turbo",
]);

/** how deep the folder listing descends. Nesting
 * beyond this is ignored (the walker that feeds the watcher caps at
 * the same depth).
 * the fixture chain LevelOne→LevelFour worked at depth
 * 4, but five-plus-level trees silently lost their deepest rows —
 * subfolder expand/collapse then looked broken. */
const FOLDER_WALK_MAX_DEPTH = 8;

/**
 * Merged listing — does ONE readdir + ONE stat per file (previously
 * three separate readdirs when README detection ran on its own; the
 * 2 KB metadata read for .py files is unchanged — the docstring +
 * `# tags:` line are always at the top — which cuts the I/O per file
 * by ~10× for large scripts).
 *
 * RECURSIVE — subfolders inside a folder are walked
 * too (depth-capped), and every file carries its relative `dir` /
 * `path` (POSIX separators) + a slug that encodes the path, so the
 * explorer can render real folder rows and every file route resolves
 * nested files transparently. Root files are bit-identical to the old
 * output (dir ""/path name), keeping every consumer backward
 * compatible.
 */
const METADATA_READ_BYTES = 2048;

async function listFilesAndDataFiles(
    dir: string,
    relDir = "",
    depth = 0,
    includeHidden = false
): Promise<{ files: FileInfo[]; dataFiles: DataFileInfo[]; dirs: string[] }> {
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
        return {files: [], dataFiles: [], dirs: []};
    }

    // README.md / folder.md / README.MD / FOLDER.md are now
    // ORDINARY files — they stay in the tree (kind "markdown"), open in
    // the FileViewer, and can be edited + saved like any other .md file.
    // The old `readmeNames` exclusion ("hoisted to folder.readme") was
    // removed with the folder-intro card.
    // Dotfiles that stay visible in the folder tree (the Examples
    // library creates a .gitignore preset). Everything else starting
    // with "." stays hidden.
    const visibleDotfiles = new Set([".gitignore", ".gitattributes", ".dockerignore"]);
    const files: FileInfo[] = [];
    const dataFiles: DataFileInfo[] = [];
    // every subfolder we descend into — INCLUDING empty ones —
    // so a freshly created folder renders in the explorer before any
    // file is added to it.
    const dirs: string[] = [];

    // Process all files in parallel — each file's stat + (optional)
    // metadata read are independent, so we can do them concurrently.
    // This turns O(N) sequential stat+read calls into one batch.
    const fileEntries = entries.filter((e) => e.isFile());
    const dirEntries = depth < FOLDER_WALK_MAX_DEPTH ? entries.filter((e) => e.isDirectory()) : [];

    await Promise.all([
        ...fileEntries.map(async (entry) => {
            if (entry.name.startsWith(".") && !visibleDotfiles.has(entry.name.toLowerCase()) && !includeHidden) return;
            // Dotfiles have no path.extname (".gitignore" → "") — use the
            // whole lowercased name as the "extension" so fileKindFromExt
            // classifies it as text.
            const ext =
                entry.name.startsWith(".") && !path.extname(entry.name)
                    ? entry.name.toLowerCase()
                    : path.extname(entry.name).toLowerCase();
            const absPath = path.join(dir, entry.name);
            const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
            try {
                const stat = await fs.stat(/* turbopackIgnore: true */ absPath);
                const kind = fileKindFromExt(ext);

                // For .py files, parse the docstring + tags from the first
                // 2 KB only (was: read the entire file). The docstring + a
                // `# tags:` comment are always near the top of the file.
                let description: string | undefined;
                let tags: string[] | undefined;
                if (kind === "python") {
                    const fd = await fs.open(absPath, "r");
                    try {
                        const buf = Buffer.alloc(METADATA_READ_BYTES);
                        const {bytesRead} = await fd.read(buf, 0, METADATA_READ_BYTES, 0);
                        const source = buf.slice(0, bytesRead).toString("utf-8");
                        const meta = parseScriptMetadata(source);
                        description = meta.description;
                        tags = meta.tags;
                    } finally {
                        await fd.close();
                    }
                }

                files.push({
                    name: entry.name,
                    slug: slugify(relPath),
                    size: stat.size,
                    description,
                    tags,
                    mtime: stat.mtimeMs,
                    kind,
                    ext,
                    dir: relDir,
                    path: relPath,
                });

                // Data files: non-.py files with a known data extension.
                if (ext !== ".py" && DATA_FILE_EXTS.has(ext)) {
                    dataFiles.push({
                        name: entry.name,
                        size: stat.size,
                        ext,
                        mtime: stat.mtimeMs,
                        dir: relDir,
                        path: relPath,
                        // the slug form of addressing — carries the sub-folder
                        // path, so the Data File Browser can request nested files
                        // ("Data Files/SensorReadings.xlsx") instead of guessing
                        // they sit at the folder root.
                        slug: slugify(relPath),
                    });
                }
            } catch {
                // ignore unreadable files
            }
        }),
        // recurse into subfolders (parallel per level).
        ...dirEntries.map(async (entry) => {
            // dot-directories respect the explorer's show-hidden
            // toggle now (they used to be skipped UNCONDITIONALLY, even
            // with ?hidden=1 — inconsistent with the root level).
            if ((entry.name.startsWith(".") && !includeHidden) || SKIPPED_DIR_NAMES.has(entry.name)) return;
            const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
            dirs.push(rel);
            const sub = await listFilesAndDataFiles(
                path.join(dir, entry.name),
                rel,
                depth + 1,
                includeHidden
            );
            files.push(...sub.files);
            dataFiles.push(...sub.dataFiles);
            dirs.push(...sub.dirs);
        }),
    ]);

    files.sort((a, b) =>
        (a.path ?? a.name).localeCompare(b.path ?? b.name, "en", {sensitivity: "base"})
    );
    dataFiles.sort((a, b) =>
        (a.path ?? a.name).localeCompare(b.path ?? b.name, "en", {sensitivity: "base"})
    );
    dirs.sort((a, b) => a.localeCompare(b, "en", {sensitivity: "base"}));
    return {files, dataFiles, dirs};
}

/**
 * Parse a Python source file's metadata:
 *   - First paragraph of the module docstring (description).
 *   - `# tags: a, b, c` comment line.
 */
function parseScriptMetadata(source: string): {
    description?: string;
    tags?: string[];
} {
    const result: { description?: string; tags?: string[] } = {};

    // Parse tags from a `# tags: ...` comment anywhere in the file.
    const tagMatch = source.match(/^\s*#\s*tags:\s*(.+)\s*$/m);
    if (tagMatch) {
        result.tags = tagMatch[1]
            .split(/[,\s]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
    }

    // Parse the module docstring (first triple-quoted string at the top of the file).
    const docMatch = source.match(/^[\s\n]*("""|''')([\s\S]*?)\1/m);
    if (docMatch) {
        const body = docMatch[2].trim();
        // The description is the first paragraph (up to the first blank line).
        const firstPara = body.split(/\n\s*\n/)[0].trim();
        if (firstPara) {
            // Collapse whitespace + newlines.
            result.description = firstPara.replace(/\s+/g, " ").slice(0, 300);
        }
    }
    return result;
}

/**
 * Safely resolve a (folderSlug, fileSlug) pair to an absolute filesystem
 * path. We rebuild the path purely from the deslugged names and then verify
 * the resolved path stays inside SCRIPTS_ROOT — this prevents path
 * traversal via crafted slugs.
 */
export async function resolveScriptPath(
    folderSlug: string,
    fileSlug: string,
    opts?: { anyKind?: boolean }
): Promise<{ absPath: string; folderName: string; fileName: string } | null> {
    const folderName = deslugify(folderSlug);
    const fileName = deslugify(fileSlug);

    if (!folderName || !fileName) return null;
    // `anyKind` lets the EXPORT routes resolve non-.py files
    // (Markdown reports / notebooks for .md, .csv, …). Every execution
    // path (run / lint / format / tests / AI) keeps the default .py-only
    // behavior — the flag is opt-in per route, never global.
    if (!opts?.anyKind && !fileName.toLowerCase().endsWith(".py")) return null;

    const scriptsRoot = getScriptsRoot();
    const folderDir = path.join(/* turbopackIgnore: true */ scriptsRoot, folderName);
    const absPath = path.join(/* turbopackIgnore: true */ folderDir, fileName);

    // Path-traversal guard: resolved path must remain inside the scripts root.
    const rel = path.relative(scriptsRoot, absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

    // Verify it actually exists and is a file.
    try {
        const stat = await fs.stat(/* turbopackIgnore: true */ absPath);
        if (!stat.isFile()) return null;
    } catch {
        return null;
    }

    return {absPath, folderName, fileName};
}

/**
 * Create a fresh, unique per-run temp directory under RUN_TMP_ROOT.
 * The directory is used to capture matplotlib figures and other side
 * artifacts. Returns the absolute path.
 *
 * the old docstring claimed the directory "gets
 * garbage-collected on the next run for the same script" — no such
 * code existed anywhere, docker-compose mounts RUN_TMP_ROOT as a
 * persistent volume, and run-all leaks one directory per file per
 * batch. Runs now trigger sweepRunTmpDirs (throttled), which removes
 * run directories older than RUN_DIR_TTL_MS; each sweep also runs once
 * at process start.
 */
export async function createRunTmpDir(runId: string): Promise<string> {
    const dir = path.join(RUN_TMP_ROOT, runId);
    await fs.mkdir(dir, {recursive: true});
    maybeSweepRunTmpDirs();
    return dir;
}

/** Run-directory TTL. Figures from recent runs stay
 *  viewable in the run history; anything older is swept. */
const RUN_DIR_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
/** Sweeps are throttled — at most one per 10 minutes per process. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweepAt = 0;
let sweepInFlight: Promise<void> | null = null;

/** Remove run temp directories older than RUN_DIR_TTL_MS. Safe to call
 *  concurrently — overlapping calls share the single in-flight sweep. */
export async function sweepRunTmpDirs(): Promise<void> {
    if (sweepInFlight) return sweepInFlight;
    sweepInFlight = (async () => {
        try {
            const entries = await fs.readdir(
                /* turbopackIgnore: true */ RUN_TMP_ROOT,
                {withFileTypes: true}
            );
            const now = Date.now();
            await Promise.all(
                entries.map(async (entry) => {
                    if (!entry.isDirectory()) return;
                    // runIds are uuids (alnum + dash) — never touch other names.
                    if (!/^[A-Za-z0-9_-]+$/.test(entry.name)) return;
                    const dir = path.join(RUN_TMP_ROOT, entry.name);
                    try {
                        const stat = await fs.stat(dir);
                        if (now - stat.mtimeMs > RUN_DIR_TTL_MS) {
                            await fs.rm(dir, {recursive: true, force: true});
                        }
                    } catch { /* raced with another sweeper — ignore */
                    }
                })
            );
        } catch {
            /* RUN_TMP_ROOT doesn't exist yet — nothing to sweep */
        } finally {
            sweepInFlight = null;
        }
    })();
    return sweepInFlight;
}

/** Throttled fire-and-forget sweep used by createRunTmpDir. */
function maybeSweepRunTmpDirs(): void {
    if (Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) return;
    lastSweepAt = Date.now();
    void sweepRunTmpDirs();
}

// Sweep once at process start (module load).
if (typeof process !== "undefined") {
    void sweepRunTmpDirs();
}

/**
 * List all figure files (PNG/JPG/SVG/PDF-as-PNG) produced in a run dir.
 * PDFs are skipped because browsers can't inline them without a viewer.
 */
export async function listFigures(runDir: string): Promise<string[]> {
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(runDir, {withFileTypes: true});
    } catch {
        return [];
    }
    const exts = [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp"];
    const figures: string[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!exts.includes(ext)) continue;
        figures.push(entry.name);
    }
    figures.sort();
    return figures;
}

/**
 * Resolve a (runId, figureName) pair to an absolute filesystem path,
 * guarding against path traversal out of RUN_TMP_ROOT.
 */
export async function resolveFigurePath(
    runId: string,
    figureName: string
): Promise<string | null> {
    if (!runId || !figureName) return null;
    // Validate runId format (only alphanumerics + dash, so it can't escape).
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) return null;
    // Validate figureName has no path separators.
    if (figureName.includes("/") || figureName.includes("\\") ||
        figureName.includes("..")) return null;

    const abs = path.join(RUN_TMP_ROOT, runId, figureName);
    const rel = path.relative(RUN_TMP_ROOT, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

    try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) return null;
    } catch {
        return null;
    }
    return abs;
}

/**
 * Build the public URL for a figure served by /api/figure.
 */
export function figureUrl(runId: string, figureName: string): string {
    return `${FIGURE_URL_PREFIX}/${encodeURIComponent(runId)}/${encodeURIComponent(figureName)}`;
}

/**
 * Read a metadata file (variables.json, coverage.json, dataframes.json,
 * tests.json) from a run temp dir. Returns null if missing.
 * Same path-traversal guard as resolveFigurePath.
 */
export async function readRunMetadata<T = unknown>(
    runId: string,
    fileName: string
): Promise<T | null> {
    if (!runId || !fileName) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) return null;
    if (fileName.includes("/") || fileName.includes("\\") ||
        fileName.includes("..")) return null;

    const abs = path.join(RUN_TMP_ROOT, runId, fileName);
    const rel = path.relative(RUN_TMP_ROOT, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

    try {
        const text = await fs.readFile(abs, "utf-8");
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/** Read the HTML capture for a DataFrame (or any other HTML file) in a run. */
export async function readRunHtml(
    runId: string,
    fileName: string
): Promise<string | null> {
    if (!runId || !fileName) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) return null;
    if (fileName.includes("/") || fileName.includes("\\") ||
        fileName.includes("..")) return null;

    const abs = path.join(RUN_TMP_ROOT, runId, fileName);
    const rel = path.relative(RUN_TMP_ROOT, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

    try {
        return await fs.readFile(abs, "utf-8");
    } catch {
        return null;
    }
}

/**
 * Parse `# %%` cell markers in a Python source file.
 * Returns the line ranges of each cell (1-indexed, inclusive).
 */
export function parseCellMarkers(source: string): Array<{
    startLine: number;
    endLine: number;
    /** Optional cell type: "code" or "markdown" (if `# %% [markdown]`). */
    type: "code" | "markdown";
    /** First non-marker line, used as a heading. */
    heading?: string;
}> {
    const lines = source.split("\n");
    const cells: Array<{
        startLine: number;
        endLine: number;
        type: "code" | "markdown";
        heading?: string;
    }> = [];
    let cellStart: number | null = null;
    let cellType: "code" | "markdown" = "code";
    let cellHeading: string | undefined;

    const isMarker = (line: string) =>
        /^\s*#\s*%%(\s+\[markdown\])?/i.test(line);

    const getHeading = (startIdx: number): string | undefined => {
        for (let i = startIdx + 1; i < lines.length; i++) {
            const l = lines[i].trim();
            if (!l || l.startsWith("#")) continue;
            return l.slice(0, 80);
        }
        return undefined;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isMarker(line)) {
            // Close previous cell.
            if (cellStart !== null) {
                cells.push({
                    startLine: cellStart + 1,
                    endLine: i,
                    type: cellType,
                    heading: cellHeading,
                });
            }
            cellStart = i;
            cellType = /\[markdown\]/i.test(line) ? "markdown" : "code";
            cellHeading = getHeading(i);
        }
    }
    // Close final cell.
    if (cellStart !== null) {
        cells.push({
            startLine: cellStart + 1,
            endLine: lines.length,
            type: cellType,
            heading: cellHeading,
        });
    } else if (lines.length > 0) {
        // No markers — the whole file is one cell.
        cells.push({
            startLine: 1,
            endLine: lines.length,
            type: "code",
            heading: lines.find((l) => l.trim())?.slice(0, 80),
        });
    }
    return cells;
}

/**
 * Check whether a folder folder contains a `requirements.txt` and
 * return its absolute path if so.
 */
export async function findRequirementsTxt(
    folderSlug: string
): Promise<string | null> {
    const folderName = deslugify(folderSlug);
    if (!folderName) return null;
    const candidates = ["requirements.txt", "Pipfile", "environment.yml", "pyproject.toml"];
    const scriptsRoot = getScriptsRoot();
    for (const candidate of candidates) {
        const abs = path.join(
            /* turbopackIgnore: true */ scriptsRoot,
            folderName,
            candidate
        );
        const rel = path.relative(scriptsRoot, abs);
        if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
        try {
            const stat = await fs.stat(/* turbopackIgnore: true */ abs);
            if (stat.isFile()) return abs;
        } catch {
            // try next
        }
    }
    return null;
}

/**
 * Validate a folder slug and return the deslugified folder NAME,
 * rejecting anything that could escape the scripts root when joined
 * into a path — names containing separators, "..", dot-names, or NULs
 * (built from the raw request field, a crafted slug could point
 * the venv creation or spawned process anywhere the process can
 * write). Returns null when the
 * slug is invalid.
 */
export function safeFolderName(folderSlug: string): string | null {
    const folderName = deslugify(folderSlug);
    if (!folderName) return null;
    if (
        folderName.includes("/") ||
        folderName.includes("\\") ||
        folderName.includes("..") ||
        folderName.includes("\0") ||
        folderName !== folderName.trim() ||
        folderName === "." ||
        folderName.startsWith(".")
    ) {
        return null;
    }
    // Containment: the rebuilt path must stay inside the scripts root.
    const scriptsRoot = getScriptsRoot();
    const abs = path.join(/* turbopackIgnore: true */ scriptsRoot, folderName);
    const rel = path.relative(scriptsRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") return null;
    return folderName;
}
