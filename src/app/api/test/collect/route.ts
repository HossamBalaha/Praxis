import {NextResponse} from "next/server";
import {getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {normalizeNodeidPath, resolveTestFileScope, spawnCapture,} from "@/lib/test-scope";

/**
 * POST /api/test/collect — the PRE-COLLECTION pass for the Tests panel.
 *
 * Runs ONE `pytest --collect-only -q` subprocess over the exact same
 * test files /api/test would run (the discovery + the `folder` /
 * `file` scope keys are shared through lib/test-scope.ts), and returns
 * the discovered node ids so the panel can render the whole test tree
 * BEFORE any run — every node marked "not run" — with real runs later
 * filling in pass/fail/skip on the same tree.
 *
 * Why collect-only and not a run: collection does not execute tests
 * or fixtures, so it finishes in tens of milliseconds for typical
 * projects — one cheap subprocess, never blocking the panel (the
 * client fetches asynchronously and renders a skeleton while it is in
 * flight).
 *
 * Behavior contract:
 *   - pytest unavailable  → `{ ok: true, available: false, tests: [] }`
 *     so the client can SKIP pre-collection SILENTLY (the panel keeps
 *     its "No test run yet." state — no error banner for a missing
 *     dev tool);
 *   - no test files      → `{ ok: true, available: true, tests: [] }`;
 *   - collection errors (import errors inside a test file) → the
 *     healthy files still collect; the exit code / stderr tail rides
 *     along as `error` for a soft inline hint, never an HTTP error.
 *
 * Windows: the subprocess is spawned with an argument ARRAY of
 * path.relative-derived paths (native separators), no shell string.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECT_TIMEOUT_MS = 45_000;
const MAX_COLLECT_ENTRIES = 600;

/** One collected test node, in the panel's TestReportEntry naming. */
interface CollectEntry {
    /** `${file}::${testId}` — the SAME name shape /api/test's rows use,
     *  so a real run overlays pass/fail onto the collected node by
     *  (fileSlug, name) with no renaming layer. */
    name: string;
    /** The full pytest nodeid (path + classes + parametrize id). */
    nodeid: string;
    folder: string;
    folderName: string;
    file: string;
    fileSlug: string;
}

export async function POST(request: Request) {
    let body: { interpreter?: string; folder?: string; file?: string } = {};
    try {
        body = await request.json();
    } catch {
        /* empty body is fine */
    }
    const started = Date.now();
    const interpreter = await findInterpreter(body.interpreter);
    const root = getScriptsRoot();

    // ── Same discovery + scope honoring as the real run ────────────
    const testFiles = await resolveTestFileScope({
        folder:
            typeof body.folder === "string" && body.folder ? body.folder : undefined,
        file: typeof body.file === "string" && body.file ? body.file : undefined,
    });
    if (testFiles.length === 0) {
        return NextResponse.json({
            ok: true,
            available: true,
            collectedAt: Date.now(),
            durationMs: Date.now() - started,
            count: 0,
            files: 0,
            tests: [],
        });
    }

    // ── Probe pytest availability (same probe as /api/test) ────────
    const probe = await spawnCapture(
        interpreter,
        ["-m", "pytest", "--version"],
        root,
        15_000
    );
    const hasPytest =
        probe.code === 0 && !/No module named/i.test(probe.stderr + probe.stdout);
    if (!hasPytest) {
        // Silent skip — the panel renders its plain empty state.
        return NextResponse.json({
            ok: true,
            available: false,
            collectedAt: Date.now(),
            durationMs: Date.now() - started,
            count: 0,
            files: 0,
            tests: [],
        });
    }

    // ── ONE subprocess: pytest --collect-only -q over the scoped
    // files, run from the scripts root with RELATIVE paths (short argv
    // — well under the Windows 32 767-char command-line cap with the
    // 60-file discovery cap; pytest echoes them back as nodeids).
    const r = await spawnCapture(
        interpreter,
        [
            "-m",
            "pytest",
            "--collect-only",
            "-q",
            "-p",
            "no:cacheprovider",
            ...testFiles.map((tf) => tf.rel),
        ],
        root,
        COLLECT_TIMEOUT_MS
    );

    // ── Parse the -q nodeid lines ──────────────────────────────────
    // Exact match on the normalized relative path; basename fallback
    // covers a pytest that re-roots the printed ids (rootdir/ini drift).
    const byRel = new Map<string, (typeof testFiles)[number]>();
    for (const tf of testFiles) byRel.set(normalizeNodeidPath(tf.rel), tf);
    const byBase = new Map<string, (typeof testFiles)[number][]>();
    for (const tf of testFiles) {
        const arr = byBase.get(tf.file) ?? [];
        arr.push(tf);
        byBase.set(tf.file, arr);
    }
    const used = new Set<string>();
    const tests: CollectEntry[] = [];
    for (const rawLine of (r.stdout + "\n" + r.stderr).split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("=")) continue; // separators / banners
        // `path/test_x.py::test_y` — the id part may itself contain `::`
        // (class-based nodeids) and parametrize brackets.
        const m = /^(\S.*\.py)::(.+)$/.exec(line);
        if (!m) continue;
        const nodeidPath = m[1];
        const testId = m[2];
        let tf = byRel.get(normalizeNodeidPath(nodeidPath));
        if (!tf) {
            // Fallback: match on the basename (first unused ref).
            const base = nodeidPath.split(/[\\/]+/).pop() ?? "";
            for (const candidate of byBase.get(base) ?? []) {
                if (!used.has(candidate.fileSlug)) {
                    tf = candidate;
                    break;
                }
            }
        }
        if (!tf || used.has(tf.fileSlug + "::" + testId)) continue;
        used.add(tf.fileSlug + "::" + testId);
        tests.push({
            name: `${tf.file}::${testId}`,
            nodeid: line,
            folder: tf.folder,
            folderName: tf.folderName,
            file: tf.file,
            fileSlug: tf.fileSlug,
        });
        if (tests.length >= MAX_COLLECT_ENTRIES) break;
    }

    // Collection-level error (exit 2 = collection errors / import
    // failures): keep the healthy files' nodes and surface the tail as
    // a soft `error` — the panel shows it inline under the tree header.
    let error: string | undefined;
    if (r.code !== 0 && !r.timedOut) {
        error = (r.stderr || r.stdout || `pytest exited with code ${r.code}`)
            .trim()
            .split("\n")
            .slice(-8)
            .join("\n")
            .slice(0, 500) || `pytest exited with code ${r.code}`;
    }
    if (r.timedOut) error = `collection timed out (${COLLECT_TIMEOUT_MS / 1000}s)`;

    return NextResponse.json({
        ok: true,
        available: true,
        collectedAt: Date.now(),
        durationMs: Date.now() - started,
        count: tests.length,
        files: new Set(tests.map((t) => t.fileSlug)).size,
        tests,
        error,
    });
}
