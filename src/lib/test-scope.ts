import {spawn} from "node:child_process";
import path from "node:path";
import {getScriptsRoot, listFolders} from "@/lib/scripts";

/**
 * test-scope.ts — the ONE shared test-file discovery + subprocess
 * capture layer for the pytest routes.
 *
 * WHY this module exists: /api/test (the real run) and /api/test/collect
 * (the pre-collection pass) must agree EXACTLY on which files they look
 * at — including the FOLDER / FILE scope keys the client sends
 * (`{interpreter, folder?, file?}`; the watch-mode runner and the
 * explorer's per-file "Run pytest" both send them). Duplicating that
 * logic in two routes is how scope drift happens, so the discovery
 * lives here and both routes call `resolveTestFileScope`.
 *
 * Windows notes (the primary deployment is F:\Praxis on Windows):
 *   - every path is built with path.join (never string + "/")
 *   - the subprocess is spawned with an ARGUMENT ARRAY (no shell string)
 *   - `rel` (the pytest argv path) is computed with path.relative so it
 *     carries the platform-native separators; the nodeid matcher below
 *     normalizes BOTH sides to forward slashes before comparing.
 */

/** pytest's default discovery patterns — mirrors lib/watch-tests.ts. */
export const TEST_FILE_RE = /^(test_.+|.+_test)\.py$/i;

/** Matches /api/test's discovery cap — collect never scans more. */
export const MAX_TEST_FILES = 60;

export interface TestFileRef {
    /** Folder SLUG (base64url) — the client-facing scope key. */
    folder: string;
    /** Folder display name (e.g. "Python Projects"). */
    folderName: string;
    /** File display name (basename). */
    file: string;
    /** File slug (base64url of the file's relative path). */
    fileSlug: string;
    /** Absolute on-disk path (path.join-built — Windows safe). */
    abs: string;
    /** Path relative to the scripts root with the platform's separators
     *  (what we pass to pytest on the command line). */
    rel: string;
}

export interface TestScope {
    /** Optional folder slug — when set, only that folder is scanned. */
    folder?: string;
    /** Optional file slug — when set, only that file (within `folder`
     *  when both are given, else in any folder) is scanned. */
    file?: string;
}

/**
 * Discover every test_*.py / *_test.py under the scripts root, honoring
 * the FOLDER / FILE scope keys:
 *   - `folder` present → only the folder whose slug matches is scanned
 *     (the synthetic project-ROOT entry — slugify(".") — is a folder
 *     like any other, so root-level test files scope correctly);
 *   - `file` present → only the file whose slug matches survives;
 *   - neither → the whole project (the panel's "Run tests" button).
 *
 * Caps at MAX_TEST_FILES so a hostile/huge project cannot fan out into
 * an unbounded subprocess spawn (same cap the route always had).
 */
export async function resolveTestFileScope(
    scope: TestScope
): Promise<TestFileRef[]> {
    const root = getScriptsRoot();
    const folders = await listFolders();
    const out: TestFileRef[] = [];

    for (const folder of folders) {
        // Folder scope: filter by slug FIRST so a scoped run never even
        // walks the other folders' file lists.
        if (scope.folder && folder.slug !== scope.folder) continue;
        // The synthetic root entry carries root-level files; a real folder
        // entry's files live inside <root>/<folderName>/…
        const base = folder.isRoot ? root : path.join(root, folder.name);
        for (const file of folder.files) {
            if (!file?.name || !file.slug) continue;
            if (!TEST_FILE_RE.test(file.name)) continue;
            // File scope: only the requested file survives.
            if (scope.file && file.slug !== scope.file) continue;
            // `file.path` is the POSIX relative path INSIDE the folder
            // ("sub/test_x.py"); split it so path.join rebuilds the
            // platform-native absolute path (nested test files used to
            // resolve to <root>/<folder>/<basename> and miss the subdir).
            const relInside = (file.path ?? file.name).split("/").filter(Boolean);
            const abs = path.join(base, ...relInside);
            out.push({
                folder: folder.slug,
                folderName: folder.name,
                file: file.name,
                fileSlug: file.slug,
                abs,
                rel: path.relative(root, abs),
            });
            if (out.length >= MAX_TEST_FILES) return out;
        }
    }
    return out;
}

/**
 * Capture a subprocess run (shared by the real-run and collect-only
 * routes so both have the SAME timeout/kill/env semantics). Always
 * resolves — never throws — with {code, stdout, stderr, timedOut};
 * a spawn-level failure (missing interpreter) reports code -1.
 *
 * The command is spawned as an ARGUMENT ARRAY with no shell involved:
 * Windows-safe (no cmd.exe quoting rules) and immune to argument
 * injection through paths.
 */
export function spawnCapture(
    cmd: string,
    args: string[],
    cwd: string,
    timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
            cwd,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: "1",
                PYTHONIOENCODING: "utf-8",
                MPLBACKEND: "Agg",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill("SIGKILL");
            } catch {
                /* already gone */
            }
        }, timeoutMs);
        child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf-8")));
        child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf-8")));
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({code, stdout, stderr, timedOut});
        });
        child.on("error", () => {
            clearTimeout(timer);
            resolve({code: -1, stdout, stderr: stderr || "spawn error", timedOut: false});
        });
    });
}

/**
 * Normalize a pytest-printed nodeid path part for matching against our
 * discovered refs: pytest echoes the path with the platform's separators
 * ("A\test_x.py" on Windows), while `rel` above already is the
 * platform form — both sides are folded to forward slashes here.
 */
export function normalizeNodeidPath(p: string): string {
    return p.split(/[\\/]+/).filter(Boolean).join("/");
}

// ── single-test (nodeid) scoping ────────────────────────────────────

/** A validated nodeid: the DISCOVERED file it belongs to + the test-id
 *  suffix (everything after the nodeid's first `::`). */
export interface ScopedNodeid {
    /** The discovered test file whose scope the nodeid fell in (the
     *  caller already narrowed discovery with folder/file scope keys). */
    file: TestFileRef;
    /** The nodeid's test-id part — `TestFoo::test_bar[1]` for
     *  `path/test_x.py::TestFoo::test_bar[1]`. */
    testId: string;
}

/**
 * Validate ONE client-supplied pytest nodeid against the DISCOVERED
 * test files of the requested scope — the guard the single-test run
 * is built on.
 *
 * The nodeid's file part must match a DISCOVERED file: exact match on
 * the root-relative path (the very form /api/test/collect emits when
 * it collected the id, so the round trip always revalidates) or, as a
 * fallback, the BASENAME (mirroring collect's own two-step matching for
 * a pytest that re-rooted its printed ids). The pytest argv /api/test
 * later builds is ALWAYS the discovered file's OWN path joined to the
 * nodeid's test-id suffix — a nodeid naming any other path is rejected
 * with null, so arbitrary-path execution through the route is
 * impossible.
 *
 * Also rejects: no `::` separator (a bare file path is not a nodeid —
 * the plain file run already exists via the `file` scope key), an
 * empty test-id part, a non-`.py` file part, and oversized input.
 */
export function scopeNodeid(
    nodeid: string,
    testFiles: TestFileRef[]
): ScopedNodeid | null {
    const id = (nodeid ?? "").trim();
    if (!id || id.length > 400) return null;
    const sep = id.indexOf("::");
    if (sep <= 0) return null;
    const testId = id.slice(sep + 2);
    if (!testId) return null;
    const nodeidPath = normalizeNodeidPath(id.slice(0, sep));
    if (!nodeidPath || !/\.py$/i.test(nodeidPath)) return null;

    // 1) exact relative-path match — the collect pass emits ids in this
    //    exact form, so the common round trip resolves here.
    let tf: TestFileRef | undefined;
    for (const t of testFiles) {
        if (normalizeNodeidPath(t.rel) === nodeidPath) {
            tf = t;
            break;
        }
    }
    // 2) basename fallback — pytest re-roots its printed ids when an ini
    //    file / rootdir drifts; the basename still names OUR discovered
    //    file (and the argv we build is that file's own rel anyway).
    if (!tf) {
        const base = nodeidPath.split("/").pop() ?? "";
        if (base) {
            for (const t of testFiles) {
                if (t.file === base) {
                    tf = t;
                    break;
                }
            }
        }
    }
    if (!tf) return null;
    return {file: tf, testId};
}
