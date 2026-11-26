/**
 * single-test-run.test.ts — unit tests for the per-test (nodeid) run
 * wiring behind the Tests panel's hover run actions:
 *
 *   · scopeNodeid (src/lib/test-scope.ts) — the route-side GUARD that
 *     validates a client-supplied pytest nodeid against the DISCOVERED
 *     scope before /api/test ever spawns pytest. Covers the exact
 *     relative-path match (the form the collect pass emits — the
 *     round trip always revalidates), the Windows-separator and
 *     basename fallbacks, class/parametrize test ids, and the
 *     rejections: paths outside the scope, bare file paths, empty test
 *     ids, non-.py parts, oversized input.
 *   · buildTestTree + mergeScopedRows (src/components/tests-panel.tsx,
 *     pure module-scope helpers) — the panel-side row state: collected
 *     nodes keep their nodeid (the run action's scope key), run rows
 *     overlay onto the same nodes, replacing rows INHERIT the nodeid,
 *     and consecutive scoped runs each update their own rows while
 *     earlier overlays survive (dedupe by file+name).
 *
 * ENV: pure helpers only — no fs, no fetch, no DOM.
 */
import {describe, expect, it} from "vitest";
import {scopeNodeid, type TestFileRef} from "@/lib/test-scope";
import {buildTestTree, type CollectedTestEntry, mergeScopedRows, type TestReportEntry,} from "@/components/tests-panel";

// ── scopeNodeid ─────────────────────────────────────────────────────

const REFS: TestFileRef[] = [
    {
        folder: "f1",
        folderName: "Getting Started",
        file: "test_one.py",
        fileSlug: "s1",
        abs: "/root/Getting Started/test_one.py",
        rel: "Getting Started/test_one.py",
    },
    {
        folder: "f2",
        folderName: "DataAnalysis",
        file: "test_two.py",
        fileSlug: "s2",
        abs: "/root/DataAnalysis/test_two.py",
        rel: "DataAnalysis/test_two.py",
    },
    {
        folder: "f3",
        folderName: "Deep",
        file: "test_deep.py",
        fileSlug: "s3",
        abs: "/root/Deep/inner/test_deep.py",
        rel: "Deep/inner/test_deep.py",
    },
];

describe("scopeNodeid", () => {
    it("accepts the exact root-relative form the collect pass emits", () => {
        const scoped = scopeNodeid("Getting Started/test_one.py::test_a", REFS);
        expect(scoped).not.toBeNull();
        expect(scoped!.file).toBe(REFS[0]);
        expect(scoped!.testId).toBe("test_a");
    });

    it("keeps the whole test id — classes and parametrize brackets", () => {
        const scoped = scopeNodeid(
            "DataAnalysis/test_two.py::TestFoo::test_bar[1]",
            REFS
        );
        expect(scoped!.file).toBe(REFS[1]);
        expect(scoped!.testId).toBe("TestFoo::test_bar[1]");
    });

    it("folds Windows separators before matching", () => {
        const scoped = scopeNodeid("DataAnalysis\\test_two.py::test_x", REFS);
        expect(scoped!.file).toBe(REFS[1]);
        expect(scoped!.testId).toBe("test_x");
    });

    it("falls back to the basename when pytest re-rooted its printed id", () => {
        // pytest printed just the file name (rootdir drift) — the basename
        // still names OUR discovered file.
        const scoped = scopeNodeid("test_two.py::test_x", REFS);
        expect(scoped!.file).toBe(REFS[1]);
    });

    it("matches nested (subdir) discovered paths exactly", () => {
        const scoped = scopeNodeid("Deep/inner/test_deep.py::test_d", REFS);
        expect(scoped!.file).toBe(REFS[2]);
        expect(scoped!.testId).toBe("test_d");
    });

    it("accepts an absolute printed path via the basename fallback", () => {
        const scoped = scopeNodeid(
            "/root/Getting Started/test_one.py::test_a",
            REFS
        );
        expect(scoped!.file).toBe(REFS[0]);
    });

    it("rejects nodeids outside the discovered scope", () => {
        expect(scopeNodeid("elsewhere/test_x.py::test_a", REFS)).toBeNull();
        expect(scopeNodeid("../escape.py::test_a", REFS)).toBeNull();
        expect(scopeNodeid("test_missing.py::test_a", REFS)).toBeNull();
    });

    it("rejects malformed ids: bare paths, empty ids, non-py, oversized", () => {
        expect(scopeNodeid("Getting Started/test_one.py", REFS)).toBeNull();
        expect(scopeNodeid("Getting Started/test_one.py::", REFS)).toBeNull();
        expect(scopeNodeid("notes.txt::test_a", REFS)).toBeNull();
        expect(scopeNodeid("", REFS)).toBeNull();
        expect(scopeNodeid(`${"x".repeat(401)}::test_a`, REFS)).toBeNull();
        expect(scopeNodeid("Getting Started/test_one.py::test_a", [])).toBeNull();
    });
});

// ── buildTestTree (nodeid plumbing) ─────────────────────────────────

const COLLECTED: CollectedTestEntry[] = [
    {
        name: "test_one.py::test_a",
        nodeid: "Getting Started/test_one.py::test_a",
        folder: "f1",
        folderName: "Getting Started",
        file: "test_one.py",
        fileSlug: "s1",
    },
    {
        name: "test_one.py::TestFoo::test_b",
        nodeid: "Getting Started/test_one.py::TestFoo::test_b",
        folder: "f1",
        folderName: "Getting Started",
        file: "test_one.py",
        fileSlug: "s1",
    },
];

describe("buildTestTree (nodeid plumbing)", () => {
    it("carries the collected nodeid + folder onto every tree node", () => {
        const [file] = buildTestTree(COLLECTED, undefined);
        expect(file.folder).toBe("f1");
        expect(file.entries.map((e) => e.nodeid)).toEqual(
            COLLECTED.map((c) => c.nodeid)
        );
        expect(file.entries.every((e) => e.status === "notrun")).toBe(true);
    });

    it("overlays a run row onto the same collected node, keeping its nodeid", () => {
        const rows: TestReportEntry[] = [
            {
                name: "test_one.py::test_a",
                status: "failed",
                message: "boom",
                folder: "f1",
                fileSlug: "s1",
                line: 12,
            },
        ];
        const [file] = buildTestTree(COLLECTED, rows);
        const node = file.entries.find((e) => e.name === "test_one.py::test_a")!;
        expect(node.status).toBe("failed");
        expect(node.line).toBe(12);
        expect(node.nodeid).toBe("Getting Started/test_one.py::test_a");
        // The untouched sibling stays "notrun".
        expect(
            file.entries.find((e) => e.name === "test_one.py::TestFoo::test_b")!
                .status
        ).toBe("notrun");
    });

    it("a replacing row inherits the collected nodeid (run action survives re-runs)", () => {
        // First run overlays onto the "notrun" node; a SECOND run row for
        // the same name must REPLACE it (newest wins) while keeping the
        // nodeid + identity fields the run action needs.
        const rows: TestReportEntry[] = [
            {
                name: "test_one.py::test_a",
                status: "passed",
                folder: "f1",
                fileSlug: "s1",
            },
            {
                name: "test_one.py::test_a",
                status: "failed",
                message: "flaky",
                folder: "f1",
                fileSlug: "s1",
            },
        ];
        const [file] = buildTestTree(COLLECTED, rows);
        const node = file.entries.find((e) => e.name === "test_one.py::test_a")!;
        expect(node.status).toBe("failed");
        expect(node.nodeid).toBe("Getting Started/test_one.py::test_a");
        expect(node.folder).toBe("f1");
        expect(node.fileSlug).toBe("s1");
    });

    it("scoped rows ordered AFTER page rows win for their own nodes", () => {
        const pageRows: TestReportEntry[] = [
            {
                name: "test_one.py::test_a",
                status: "failed",
                folder: "f1",
                fileSlug: "s1",
            },
        ];
        const scopedRows: TestReportEntry[] = [
            {
                name: "test_one.py::test_a",
                status: "passed",
                folder: "f1",
                fileSlug: "s1",
            },
        ];
        const [file] = buildTestTree(COLLECTED, [...pageRows, ...scopedRows]);
        expect(
            file.entries.find((e) => e.name === "test_one.py::test_a")!.status
        ).toBe("passed");
    });

    it("run-only files (nothing collected) still group + carry the folder", () => {
        const rows: TestReportEntry[] = [
            {
                name: "test_two.py::test_z",
                status: "passed",
                folder: "f2",
                folderName: "DataAnalysis",
                file: "test_two.py",
                fileSlug: "s2",
            },
        ];
        const files = buildTestTree(undefined, rows);
        expect(files).toHaveLength(1);
        expect(files[0].folder).toBe("f2");
        expect(files[0].entries[0].nodeid).toBeUndefined();
    });
});

// ── mergeScopedRows (consecutive single-test runs) ──────────────────

describe("mergeScopedRows", () => {
    const row = (
        fileSlug: string,
        name: string,
        status: TestReportEntry["status"]
    ): TestReportEntry => ({name, status, fileSlug});

    it("appends the first scoped run's rows", () => {
        const next = [row("s1", "test_one.py::test_a", "passed")];
        expect(mergeScopedRows([], next)).toEqual(next);
    });

    it("a later run of the SAME test replaces its earlier row only", () => {
        const first = [
            row("s1", "test_one.py::test_a", "passed"),
            row("s1", "test_one.py::test_b", "failed"),
        ];
        const second = [row("s1", "test_one.py::test_a", "failed")];
        const merged = mergeScopedRows(first, second);
        expect(merged).toHaveLength(2);
        expect(merged.find((t) => t.name === "test_one.py::test_a")!.status).toBe(
            "failed"
        );
        // test_b's earlier overlay SURVIVES — each single-test run updates
        // its own row.
        expect(merged.find((t) => t.name === "test_one.py::test_b")!.status).toBe(
            "failed"
        );
    });

    it("dedupes per (fileSlug, name) — same name in another file survives", () => {
        const first = [row("s1", "test_x.py::test_a", "passed")];
        const second = [row("s2", "test_x.py::test_a", "failed")];
        const merged = mergeScopedRows(first, second);
        expect(merged).toHaveLength(2);
    });

    it("an empty next run keeps the previous rows untouched", () => {
        const prev = [row("s1", "test_one.py::test_a", "passed")];
        expect(mergeScopedRows(prev, [])).toBe(prev);
    });
});
