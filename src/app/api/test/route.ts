import {NextResponse} from "next/server";
import path from "node:path";
import {getScriptsRoot} from "@/lib/scripts";
import {findInterpreter} from "@/lib/python-interpreter";
import {resolveTestFileScope, scopeNodeid, spawnCapture, type TestFileRef,} from "@/lib/test-scope";

/**
 * POST /api/test
 *
 * this route was MISSING — the "Run all tests" dialog has
 * fetched `/api/test` since, which 404'd and surfaced an
 * HTTP error card. It now really exists.
 *
 * Discovers every `test_*.py` / `*_test.py` under the scripts root
 * and runs each file with `<interpreter> -m pytest -v --tb=line`.
 * When pytest isn't installed the file is executed directly and
 * reported as a single whole-file test (exit 0 = passed).
 *
 * SCOPE KEYS: the body also honors `folder` and `file` (slugs) — the
 * SAME keys the watch-mode runner and the explorer's per-file
 * "Run pytest" send — so a scoped request runs ONLY that folder/file
 * instead of every test file in the project. Absent keys keep the
 * whole-project behavior (the panel's "Run tests" button). The
 * discovery itself is shared with /api/test/collect (lib/test-scope)
 * so the pre-collected tree and the real run cover the exact same
 * files — never a tree the run cannot fill in.
 *
 * NODEID KEYS: the body additionally honors `nodeid` (string) or
 * `nodeids` (string[]) — the per-test run action on the panel's
 * pre-collected tree rows. Each id is validated with
 * lib/test-scope.scopeNodeid against the DISCOVERED scope (a nodeid
 * naming anything but a discovered test file is refused with HTTP
 * 400 — no arbitrary-path execution; the pytest argv is always built
 * from the DISCOVERED file's own path joined to the id's test-id
 * suffix), the run list narrows to the target files, and pytest runs
 * the ids from the file's own directory with ABSOLUTE-path args —
 * the SAME cwd/arg form the whole-file loop below uses, so conftest
 * semantics and the absolute `--tb=line` trace lines match. The
 * status-line parser takes the basename either way, so the echoed
 * ids land back onto the very tree nodes the click came from. The
 * response shape is identical to the whole-file run (a subset
 * report). Absent nodeid/nodeids behaves EXACTLY as before (whole
 * folder/file/project run).
 *
 * Response shape (consumed by the Tests panel + legacy dialog):
 * {
 *   ok: true,
 *   total, passed, failed, errors, skipped,
 *   durationMs,
 *   files: [{ folder, folderName, file, fileSlug, total, passed, failed }],
 *   tests: [{ name, status: "passed"|"failed"|"error"|"skipped",
 *             message?, folder?, file?, fileSlug?, line? }],
 *   raw?: string          // tail of combined output (fallback display)
 * }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_FILE_TIMEOUT_MS = 60_000;
const OVERALL_TIMEOUT_MS = 8 * 60_000;
const MAX_TEST_ENTRIES = 400;
/** Cap on `nodeid`/`nodeids` per request — one per click in practice;
 * a cap keeps argv bounded under the Windows command-line limits. */
const MAX_NODEID_ARGS = 40;

interface TestEntry {
    name: string;
    status: "passed" | "failed" | "error" | "skipped";
    message?: string;
    folder?: string;
    folderName?: string;
    file?: string;
    fileSlug?: string;
    line?: number;
}

/** Parse `pytest -v --tb=line` output into structured test entries. */
function parsePytestOutput(
    text: string,
    ctx: { folder: string; folderName: string; file: string; fileSlug: string }
): TestEntry[] {
    const entries: TestEntry[] = [];
    const lines = text.split("\n");
    // Trace lines pytest --tb=line emits between the FAILED status and
    // the next result: `/abs/path/file.py:42: ValueError: boom`.
    const traceRe = /^(.+?):(\d+):\s*(.+)$/;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Status lines: `path/test_x.py::test_y PASSED [ 50%]` — the test id
        // may itself contain `::` (class-based nodeids such as
        // `file.py::TestFoo::test_bar`), so the id char class includes `:`
        // too; without it every class-based row was dropped and the
        // pre-collected tree could never be filled in by a real run.
        const m = line.match(
            /^(?:.*[\\/])?([\w./-]+\.py)::([\w.:[\]-]+)\s+(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)\b/
        );
        if (m) {
            let status: TestEntry["status"];
            switch (m[3]) {
                case "PASSED":
                case "XPASS":
                    status = "passed";
                    break;
                case "FAILED":
                    status = "failed";
                    break;
                case "ERROR":
                    status = "error";
                    break;
                default:
                    status = "skipped";
            }
            entries.push({
                name: `${m[1]}::${m[2]}`,
                status,
                folder: ctx.folder,
                folderName: ctx.folderName,
                file: ctx.file,
                fileSlug: ctx.fileSlug,
            });
            continue;
        }
        // Attach the next trace line to the most recent failed/error entry
        // that has no message yet.
        const t = traceRe.exec(line.trim());
        if (t && !path.isAbsolute(t[1]) === false) {
            // Absolute-path trace lines only (relative ones may be output noise).
            const last = entries[entries.length - 1];
            if (last && (last.status === "failed" || last.status === "error") && !last.message) {
                const lineNo = Number(t[2]);
                if (Number.isFinite(lineNo)) last.line = lineNo;
                last.message = t[3].slice(0, 300);
            }
        }
    }
    return entries;
}

export async function POST(request: Request) {
    let body: {
        interpreter?: string;
        folder?: string;
        file?: string;
        /** Single-test run: one pytest nodeid ("path/test_x.py::test_y"). */
        nodeid?: string;
        /** Single-test run: several nodeids at once (same validation). */
        nodeids?: string[];
    } = {};
    try {
        body = await request.json();
    } catch {
        /* empty body is fine */
    }
    const interpreter = await findInterpreter(body.interpreter);
    const root = getScriptsRoot();
    const started = Date.now();

    // ── Discover test files (SHARED with /api/test/collect so the
    // pre-collected tree and the real run cover the exact same files,
    // including the folder/file scope keys) ────────────────────────
    const testFiles = await resolveTestFileScope({
        folder:
            typeof body.folder === "string" && body.folder ? body.folder : undefined,
        file: typeof body.file === "string" && body.file ? body.file : undefined,
    });

    if (testFiles.length === 0) {
        return NextResponse.json({
            ok: true,
            total: 0,
            passed: 0,
            failed: 0,
            errors: 0,
            skipped: 0,
            durationMs: Date.now() - started,
            files: [],
            tests: [],
            raw: "No test files found (looked for test_*.py / *_test.py in every folder).",
        });
    }

    // ── Probe pytest availability once ─────────────────────────────
    const probe = await spawnCapture(
        interpreter,
        ["-m", "pytest", "--version"],
        root,
        15_000
    );
    const hasPytest =
        probe.code === 0 && !/No module named/i.test(probe.stderr + probe.stdout);

    // ── Optional nodeid scoping (the panel's per-test run action) ──
    // Every id must belong to the DISCOVERED scope or the request is
    // refused outright — the pytest argv is always built from the
    // DISCOVERED file's own absolute path, so an id naming any
    // other path can never execute.
    const rawNodeids = [
        ...(typeof body.nodeid === "string" && body.nodeid.trim()
            ? [body.nodeid.trim()]
            : []),
        ...(Array.isArray(body.nodeids)
            ? body.nodeids
                .filter((n): n is string => typeof n === "string" && !!n.trim())
                .map((n) => n.trim())
            : []),
    ];
    const nodeids = rawNodeids.length > 0 ? [...new Set(rawNodeids)] : [];
    if (nodeids.length > MAX_NODEID_ARGS) {
        return NextResponse.json(
            {
                ok: false,
                error: `Too many node ids in one request (${nodeids.length} > ${MAX_NODEID_ARGS}).`,
            },
            {status: 400}
        );
    }
    /** Validated ids grouped per target file (usually exactly one). */
    const scopedGroups = new Map<string, { tf: TestFileRef; ids: string[] }>();
    if (nodeids.length > 0) {
        if (!hasPytest) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "pytest is required to run individual tests by node id (the no-pytest fallback only runs whole files).",
                },
                {status: 400}
            );
        }
        for (const id of nodeids) {
            const scoped = scopeNodeid(id, testFiles);
            if (!scoped) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: `Refused to run node id "${id.slice(
                            0,
                            200
                        )}" — it does not belong to the requested folder/file scope.`,
                    },
                    {status: 400}
                );
            }
            const group =
                scopedGroups.get(scoped.file.fileSlug) ??
                {tf: scoped.file, ids: []};
            group.ids.push(scoped.testId);
            scopedGroups.set(scoped.file.fileSlug, group);
        }
    }
    // With nodeids present ONLY the target files run; absent nodeids the
    // list is the whole discovered scope (the existing behavior).
    const runList =
        scopedGroups.size > 0
            ? testFiles.filter((tf) => scopedGroups.has(tf.fileSlug))
            : testFiles;

    // ── Run each file ──────────────────────────────────────────────
    const tests: TestEntry[] = [];
    const files: Array<{
        folder: string;
        folderName: string;
        file: string;
        fileSlug: string;
        total: number;
        passed: number;
        failed: number;
    }> = [];
    let rawTail = "";

    for (const tf of runList) {
        if (Date.now() - started > OVERALL_TIMEOUT_MS) {
            tests.push({
                name: `${tf.file} (skipped — overall timeout)`,
                status: "skipped",
                folder: tf.folder,
                folderName: tf.folderName,
                file: tf.file,
                fileSlug: tf.fileSlug,
            });
            continue;
        }
        // Whole-file runs pass the ABSOLUTE path; nodeid runs pass one
        // `<abs>::<testId>` arg per validated id. Both spawn from the
        // file's own directory — the SAME cwd/arg form as before, so
        // conftest/cwd semantics and the ABSOLUTE `--tb=line` trace lines
        // (which the parser attaches to failing rows) are unchanged,
        // while the -v status lines parse back onto the very collected
        // tree nodes the click came from (the parser takes the basename
        // of the echoed path either way).
        const nodeidGroup = scopedGroups.get(tf.fileSlug);
        const targets = nodeidGroup
            ? nodeidGroup.ids.map((id) => `${tf.abs}::${id}`)
            : [tf.abs];
        const cwd = path.dirname(tf.abs);
        if (hasPytest) {
            const r = await spawnCapture(
                interpreter,
                ["-m", "pytest", ...targets, "-v", "--tb=line", "-p", "no:cacheprovider"],
                cwd,
                PER_FILE_TIMEOUT_MS
            );
            const parsed = parsePytestOutput(r.stdout + "\n" + r.stderr, tf);
            if (parsed.length === 0) {
                // pytest ran but reported nothing parseable (collection error).
                tests.push({
                    name: `${tf.file}::(collection)`,
                    status: r.code === 0 ? "skipped" : "error",
                    message:
                        (r.stderr || r.stdout || "pytest produced no result lines")
                            .trim()
                            .split("\n")
                            .slice(-6)
                            .join("\n")
                            .slice(0, 300) || undefined,
                    folder: tf.folder,
                    folderName: tf.folderName,
                    file: tf.file,
                    fileSlug: tf.fileSlug,
                });
            } else {
                if (r.timedOut) {
                    parsed.forEach((p) => {
                        if (p.status === "passed") p.status = "failed";
                        p.message = "timed out (60 s per-file limit)";
                    });
                }
                tests.push(...parsed);
            }
            rawTail = (r.stdout + r.stderr).slice(-1_500);
        } else {
            // Fallback: run the file directly — one whole-file "test".
            // (Unreachable for nodeid runs: those require pytest and were
            // refused with HTTP 400 above when it is missing.)
            const r = await spawnCapture(interpreter, [tf.abs], cwd, PER_FILE_TIMEOUT_MS);
            tests.push({
                name: tf.file,
                status: r.code === 0 ? "passed" : "failed",
                message:
                    r.code === 0
                        ? undefined
                        : (r.stderr.trim().split("\n").slice(-5).join("\n") || `exit ${r.code}`).slice(0, 300),
                folder: tf.folder,
                folderName: tf.folderName,
                file: tf.file,
                fileSlug: tf.fileSlug,
            });
            rawTail = (r.stdout + r.stderr).slice(-1_500);
        }
        if (tests.length >= MAX_TEST_ENTRIES) break;
    }

    // ── Per-file rollups ───────────────────────────────────────────
    for (const tf of testFiles) {
        const own = tests.filter((t) => t.fileSlug === tf.fileSlug);
        if (own.length === 0) continue;
        files.push({
            folder: tf.folder,
            folderName: tf.folderName,
            file: tf.file,
            fileSlug: tf.fileSlug,
            total: own.length,
            passed: own.filter((t) => t.status === "passed").length,
            failed: own.filter((t) => t.status === "failed" || t.status === "error").length,
        });
    }

    const passed = tests.filter((t) => t.status === "passed").length;
    const failed = tests.filter((t) => t.status === "failed").length;
    const errors = tests.filter((t) => t.status === "error").length;
    const skipped = tests.filter((t) => t.status === "skipped").length;

    return NextResponse.json({
        ok: true,
        total: tests.length,
        passed,
        failed,
        errors,
        skipped,
        durationMs: Date.now() - started,
        usedPytest: hasPytest,
        files,
        tests: tests.slice(0, MAX_TEST_ENTRIES),
        raw: rawTail || undefined,
    });
}
