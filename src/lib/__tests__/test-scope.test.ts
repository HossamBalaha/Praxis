/**
 * test-scope.test.ts — unit tests for src/lib/test-scope.ts
 * (the ONE shared test-file discovery + scope honoring used by BOTH
 * /api/test (the real run) and /api/test/collect (the pre-collection
 * pass)).
 *
 * Covered:
 *   - whole-project discovery: every test_*.py / *_test.py across
 *     folders AND project-root-level files (the synthetic root entry)
 *   - nested files resolve to the right ABSOLUTE path (path.join with
 *     the file's relative path — the old code joined only the basename
 *     and missed the subdir)
 *   - root files resolve to <root>/<name> — NOT <root>/<rootName>/…
 *   - FOLDER scope: only the folder whose slug matches is scanned
 *   - FILE scope: only the file whose slug matches (with or without a
 *     folder scope) — the keys the watch-mode runner + the explorer's
 *     per-file "Run pytest" send
 *   - non-test names are excluded ("plain.py", "TestMathUtils.py")
 *   - the MAX_TEST_FILES=60 discovery cap
 *   - normalizeNodeidPath folds Windows backslashes for nodeid matching
 *
 * ENV: SCRIPTS_ROOT is pinned to a temp dir (read at CALL time by
 * scripts.ts, so a static import is safe).
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {MAX_TEST_FILES, normalizeNodeidPath, resolveTestFileScope, TEST_FILE_RE,} from "@/lib/test-scope";
import {slugify} from "@/lib/scripts";

const TMP_BASE = path.join(os.tmpdir(), `praxis-testscope-${process.pid}`);
const ROOT = path.join(TMP_BASE, "root");
process.env.SCRIPTS_ROOT = ROOT;

async function write(...segments: string[]): Promise<string> {
    const abs = path.join(ROOT, ...segments);
    await fs.mkdir(path.dirname(abs), {recursive: true});
    await fs.writeFile(abs, "def test_x():\n    assert True\n", "utf-8");
    return abs;
}

beforeAll(async () => {
    await fs.mkdir(ROOT, {recursive: true});
    await write("Getting Started", "test_one.py");
    await write("Getting Started", "plain.py"); // not a test name
    await write("DataAnalysis", "test_two.py");
    await write("DataAnalysis", "TestMathUtils.py"); // not test_*.py / *_test.py
    await write("Deep", "inner", "test_deep.py"); // nested inside a folder
    await write("test_root.py"); // directly in the project root
    // Cap fixtures: one folder with enough test files to blow the cap.
    for (let i = 0; i < 65; i++) {
        await write("Many", `test_m${String(i).padStart(2, "0")}.py`);
    }
});

afterAll(async () => {
    await fs.rm(TMP_BASE, {recursive: true, force: true}).catch(() => {
    });
});

describe("TEST_FILE_RE", () => {
    it("matches pytest's default patterns (case-insensitive)", () => {
        expect(TEST_FILE_RE.test("test_foo.py")).toBe(true);
        expect(TEST_FILE_RE.test("TEST_FOO.PY")).toBe(true);
        expect(TEST_FILE_RE.test("foo_test.py")).toBe(true);
        expect(TEST_FILE_RE.test("plain.py")).toBe(false);
        expect(TEST_FILE_RE.test("TestMathUtils.py")).toBe(false);
    });
});

describe("resolveTestFileScope", () => {
    it("discovers test files across folders AND the project root", async () => {
        const refs = await resolveTestFileScope({});
        const names = refs.map((r) => r.file).sort();
        expect(names).toContain("test_one.py");
        expect(names).toContain("test_two.py");
        expect(names).toContain("test_root.py");
        expect(names).toContain("test_deep.py");
        expect(names).not.toContain("plain.py");
        expect(names).not.toContain("TestMathUtils.py");
    });

    it("resolves nested files to the CORRECT absolute path", async () => {
        const refs = await resolveTestFileScope({});
        const deep = refs.find((r) => r.file === "test_deep.py");
        expect(deep).toBeDefined();
        // The nested file's abs includes the subdir (the old code joined
        // only the basename and pointed at <root>/<folder>/test_deep.py).
        expect(deep!.abs).toBe(path.join(ROOT, "Deep", "inner", "test_deep.py"));
        expect(deep!.folder).toBe(slugify("Deep"));
    });

    it("resolves project-root files to <root>/<name> (no doubled basename)", async () => {
        const refs = await resolveTestFileScope({});
        const rootRef = refs.find((r) => r.file === "test_root.py");
        expect(rootRef).toBeDefined();
        expect(rootRef!.abs).toBe(path.join(ROOT, "test_root.py"));
    });

    it("FOLDER scope scans only that folder", async () => {
        const refs = await resolveTestFileScope({folder: slugify("DataAnalysis")});
        expect(refs.map((r) => r.file)).toEqual(["test_two.py"]);
        expect(refs[0].folder).toBe(slugify("DataAnalysis"));
        expect(refs[0].folderName).toBe("DataAnalysis");
    });

    it("FOLDER scope works for the project root's sentinel slug too", async () => {
        const refs = await resolveTestFileScope({folder: slugify(".")});
        expect(refs.map((r) => r.file)).toEqual(["test_root.py"]);
    });

    it("FILE scope (folder + file) narrows to exactly that file", async () => {
        const refs = await resolveTestFileScope({
            folder: slugify("Getting Started"),
            file: slugify("test_one.py"),
        });
        expect(refs.map((r) => r.file)).toEqual(["test_one.py"]);
    });

    it("FILE scope alone finds the file wherever it lives", async () => {
        const refs = await resolveTestFileScope({
            file: slugify("inner/test_deep.py"),
        });
        expect(refs.map((r) => r.file)).toEqual(["test_deep.py"]);
        // A file scope that matches nothing yields an empty scan.
        expect(
            await resolveTestFileScope({file: slugify("nope.py")})
        ).toEqual([]);
    });

    it("caps the discovery at MAX_TEST_FILES", async () => {
        const refs = await resolveTestFileScope({});
        expect(refs.length).toBe(MAX_TEST_FILES);
    });
});

describe("normalizeNodeidPath", () => {
    it("folds Windows separators into forward slashes", () => {
        expect(normalizeNodeidPath("A\\B\\test_x.py")).toBe("A/B/test_x.py");
        expect(normalizeNodeidPath("A/B/test_x.py")).toBe("A/B/test_x.py");
        expect(normalizeNodeidPath("A//B/test_x.py")).toBe("A/B/test_x.py");
    });
});
