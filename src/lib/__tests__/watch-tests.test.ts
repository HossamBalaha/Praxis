/**
 * unit tests for the pytest watch-engine (src/lib/watch-tests.ts):
 *   ▸ affectedTestFiles — test-file detection, direct-import match,
 *     package.module matching, docstring/comment immunity, no-match → [].
 *   ▸ WatchRunner — debounce coalescing, affected resolution + run
 *     scoping, in-flight re-notify rerun, stop() cancellation, error
 *     results, store mirroring.
 *
 * Pure logic only — the node vitest environment is enough (fake timers
 * drive the debounce; no DOM / fetch is touched).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    affectedTestFiles,
    clearWatchResult,
    getWatchState,
    importedModulePaths,
    isTestFileName,
    modulePathsFromFile,
    publishWatchResult,
    setWatchActive,
    setWatchRunning,
    subscribeWatchState,
    type TestRunResult,
    WATCH_DEBOUNCE_MS,
    WatchRunner,
} from "@/lib/watch-tests";

const src = (imports: string): string =>
    `"""Docstring.\n\n    import notreal\n    from notreal import x\n"""\n# import alsocomment\n${imports}\n`;

const okRun = (over: Partial<TestRunResult> = {}): TestRunResult => ({
    total: 2,
    passed: 2,
    failed: 0,
    errors: 0,
    durationMs: 5,
    perFile: {"dGVzdF9h.py": {passed: 2, failed: 0}},
    perTest: [],
    ...over,
});

describe("isTestFileName", () => {
    it("detects both pytest naming conventions (case-insensitive)", () => {
        expect(isTestFileName("test_utils.py")).toBe(true);
        expect(isTestFileName("utils_test.py")).toBe(true);
        expect(isTestFileName("Test_Utils.py")).toBe(true);
        expect(isTestFileName("UTILS_TEST.py")).toBe(true);
    });

    it("rejects non-test and non-python names", () => {
        expect(isTestFileName("utils.py")).toBe(false);
        expect(isTestFileName("tester.py")).toBe(false);
        expect(isTestFileName("test.py")).toBe(false);
        expect(isTestFileName("test_utils.ts")).toBe(false);
        expect(isTestFileName("conftest.py")).toBe(false);
    });

    it("uses the basename when a path is passed", () => {
        expect(isTestFileName("models/test_user.py")).toBe(true);
        expect(isTestFileName("models\\user_test.py")).toBe(true);
        expect(isTestFileName("models/utils.py")).toBe(false);
    });
});

describe("modulePathsFromFile", () => {
    it("derives the bare stem for a root file", () => {
        expect(modulePathsFromFile("utils.py")).toEqual(["utils"]);
    });

    it("derives every dotted suffix for a nested file", () => {
        expect(modulePathsFromFile("models/user.py")).toEqual([
            "user",
            "models.user",
        ]);
        expect(modulePathsFromFile("a/b/c.py")).toEqual(["c", "b.c", "a.b.c"]);
    });
});

describe("importedModulePaths", () => {
    it("captures full dotted paths from import / from-import forms", () => {
        expect(importedModulePaths("import utils\n")).toEqual(["utils"]);
        expect(importedModulePaths("import a, b.c as d\n")).toEqual(["a", "b.c"]);
        expect(importedModulePaths("from models.user import User\n")).toEqual([
            "models.user",
        ]);
        expect(importedModulePaths("from pkg.mod import (a,\n  b)\n")).toEqual([
            "pkg.mod",
        ]);
    });

    it("skips comments, docstrings and relative imports", () => {
        expect(importedModulePaths("# import ghost\n")).toEqual([]);
        expect(importedModulePaths('"""\nimport ghost\n"""\nimport real\n')).toEqual([
            "real",
        ]);
        expect(importedModulePaths("from . import sibling\n")).toEqual([]);
        expect(importedModulePaths("from ..pkg import x\n")).toEqual([]);
    });
});

describe("affectedTestFiles", () => {
    const testFiles = ["test_utils.py", "test_app.py", "other_test.py"];

    it("returns just the changed file when it IS a test file", () => {
        expect(affectedTestFiles("test_utils.py", testFiles, new Map())).toEqual([
            "test_utils.py",
        ]);
        expect(affectedTestFiles("models/user_test.py", testFiles, new Map())).toEqual([
            "models/user_test.py",
        ]);
    });

    it("matches a direct import of the changed module", () => {
        const source = new Map<string, string>([
            ["test_utils.py", src("import utils")],
            ["test_app.py", src("from utils import helper")],
            ["other_test.py", src("import json\nimport os")],
        ]);
        expect(affectedTestFiles("utils.py", testFiles, source)).toEqual([
            "test_utils.py",
            "test_app.py",
        ]);
    });

    it("matches package.module imports for a nested changed file", () => {
        const source = new Map<string, string>([
            ["test_user.py", src("from models.user import User")],
            ["test_api.py", src("import models.user")],
            ["test_other.py", src("from models import base")],
        ]);
        expect(
            affectedTestFiles(
                "models/user.py",
                ["test_user.py", "test_api.py", "test_other.py"],
                source
            )
        ).toEqual(["test_user.py", "test_api.py"]);
    });

    it("matches a submodule import (importing utils.helper runs utils.py)", () => {
        const source = new Map<string, string>([
            ["test_x.py", src("from utils.helper import thing")],
        ]);
        expect(affectedTestFiles("utils.py", ["test_x.py"], source)).toEqual(["test_x.py"]);
    });

    it("ignores imports inside docstrings and comments", () => {
        const source = new Map<string, string>([
            ["test_doc.py", '"""import utils"""\n# from utils import x\nimport json\n'],
        ]);
        expect(affectedTestFiles("utils.py", ["test_doc.py"], source)).toEqual([]);
    });

    it("returns [] when nothing imports the changed module", () => {
        const source = new Map<string, string>([
            ["test_utils.py", src("import json\nimport sys")],
            ["other_test.py", src("import numpy")],
        ]);
        expect(affectedTestFiles("utils.py", testFiles, source)).toEqual([]);
    });

    it("returns [] for unknown test-file sources", () => {
        expect(affectedTestFiles("utils.py", testFiles, new Map())).toEqual([]);
    });

    it("never matches an unrelated dotted module that shares a tail", () => {
        const source = new Map<string, string>([
            ["test_x.py", src("import mylib.utils")],
        ]);
        expect(affectedTestFiles("utils.py", ["test_x.py"], source)).toEqual([]);
    });
});

describe("WatchRunner", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setWatchActive(false);
        setWatchRunning(false);
        clearWatchResult();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("debounces a burst of saves into ONE run and unions the affected files", async () => {
        const runTests = vi.fn(async () => okRun());
        const runner = new WatchRunner().start({
            runTests,
            affected: (f) => affectedTestFiles(f, ["test_a.py", "test_b.py"], new Map()),
        });
        // save the test file itself + a module imported by test_b
        runner.notifySave("test_a.py");
        runner.notifySave("test_a.py"); // dup — same pending entry
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
        expect(runTests).toHaveBeenCalledTimes(1);
        expect(runTests).toHaveBeenCalledWith(["test_a.py"]);

        runTests.mockClear();
        runner.notifySave("test_a.py");
        runner.notifySave("test_b.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
        expect(runTests).toHaveBeenCalledTimes(1);
        expect(runTests).toHaveBeenCalledWith(["test_a.py", "test_b.py"]);
        runner.stop();
    });

    it("defaults to the identity resolver (the saved file is the scope)", async () => {
        const runTests = vi.fn(async () => okRun());
        const runner = new WatchRunner().start({runTests});
        runner.notifySave("test_z.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
        expect(runTests).toHaveBeenCalledWith(["test_z.py"]);
        runner.stop();
    });

    it("skips the run entirely when nothing is affected", async () => {
        const runTests = vi.fn(async () => okRun());
        const runner = new WatchRunner().start({
            runTests,
            affected: () => [],
        });
        runner.notifySave("whatever.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
        expect(runTests).not.toHaveBeenCalled();
        runner.stop();
    });

    it("notifies subscribers with running → result → idle, and mirrors the store", async () => {
        const seen: Array<{ running: boolean; total: number | null }> = [];
        const runTests = vi.fn(async () => okRun({total: 3, passed: 2, failed: 1}));
        const runner = new WatchRunner();
        runner.subscribe((s) =>
            seen.push({running: s.running, total: s.lastResult?.total ?? null})
        );
        runner.start({runTests});
        expect(getWatchState().active).toBe(true);

        runner.notifySave("test_a.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);

        expect(runTests).toHaveBeenCalledTimes(1);
        expect(seen.some((s) => s.running)).toBe(true);
        expect(seen[seen.length - 1]).toEqual({running: false, total: 3});
        expect(runner.getState().lastResult?.total).toBe(3);
        expect(runner.getState().watchedAt).toBeGreaterThan(0);

        const store = getWatchState();
        expect(store.active).toBe(true);
        expect(store.running).toBe(false);
        expect(store.summary?.total).toBe(3);
        expect(store.summary?.passed).toBe(2);
        expect(store.lastFiles).toEqual(["test_a.py"]);
        runner.stop();
    });

    it("reruns when a save lands while a run is in flight", async () => {
        let resolveFirst!: (r: TestRunResult) => void;
        let call = 0;
        const runTests = vi.fn((files: string[]) => {
            call++;
            void files;
            return new Promise<TestRunResult>((resolve) => {
                if (call === 1) resolveFirst = resolve;
                else resolve(okRun());
            });
        });
        const runner = new WatchRunner().start({runTests});
        runner.notifySave("test_a.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
        expect(runTests).toHaveBeenCalledTimes(1);

        // second save while the first run is still pending
        runner.notifySave("test_b.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
        expect(runTests).toHaveBeenCalledTimes(1); // still in flight

        resolveFirst(okRun());
        await vi.advanceTimersByTimeAsync(10);
        expect(runTests).toHaveBeenCalledTimes(2);
        expect(runTests).toHaveBeenLastCalledWith(["test_b.py"]);
        runner.stop();
    });

    it("stop() cancels the pending debounce — no run fires", async () => {
        const runTests = vi.fn(async () => okRun());
        const runner = new WatchRunner().start({runTests});
        runner.notifySave("test_a.py");
        runner.stop();
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS * 2);
        expect(runTests).not.toHaveBeenCalled();
        expect(getWatchState().active).toBe(false);
        expect(getWatchState().running).toBe(false);
    });

    it("stop() invalidates an in-flight run — its result is dropped", async () => {
        let resolveRun!: (r: TestRunResult) => void;
        const runTests = vi.fn(
            () => new Promise<TestRunResult>((resolve) => (resolveRun = resolve))
        );
        const runner = new WatchRunner().start({runTests});
        runner.notifySave("test_a.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);

        runner.stop();
        resolveRun(okRun({total: 9}));
        await vi.advanceTimersByTimeAsync(10);

        expect(runner.getState().lastResult).toBeNull();
        expect(getWatchState().summary).toBeNull();
    });

    it("turns a rejected runTests into an error result (never throws)", async () => {
        const runTests = vi.fn(async () => {
            throw new Error("HTTP 500");
        });
        const runner = new WatchRunner().start({runTests});
        runner.notifySave("test_a.py");
        await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);

        const st = runner.getState();
        expect(st.lastResult?.error).toBe("HTTP 500");
        expect(st.lastResult?.total).toBe(0);
        expect(getWatchState().error).toBe("HTTP 500");
        expect(getWatchState().running).toBe(false);
        runner.stop();
    });
});

describe("watch store", () => {
    it("notifies subscribers on publish", () => {
        const states: number[] = [];
        const unsub = subscribeWatchState(() => states.push(getWatchState().watchedAt));
        publishWatchResult(okRun({total: 7}), ["test_a.py"]);
        expect(getWatchState().summary?.total).toBe(7);
        expect(getWatchState().lastFiles).toEqual(["test_a.py"]);
        expect(states).toHaveLength(1);
        unsub();
        publishWatchResult(okRun({total: 1}), []);
        expect(states).toHaveLength(1); // no listener after unsubscribe
    });

    it("active flips via setWatchActive without spamming identical updates", () => {
        let notified = 0;
        const unsub = subscribeWatchState(() => notified++);
        setWatchActive(true);
        setWatchActive(true); // identical — no emit
        expect(getWatchState().active).toBe(true);
        expect(notified).toBe(1);
        setWatchActive(false);
        expect(getWatchState().active).toBe(false);
        unsub();
    });
});
