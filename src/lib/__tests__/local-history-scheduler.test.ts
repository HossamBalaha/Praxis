/**
 * local-history-scheduler.test.ts — unit tests for
 * src/lib/local-history-scheduler.ts (the PERIODIC snapshot pass).
 *
 * Covered:
 *   - pure eligibility: isTextualSnapshotKind (binary kinds never
 *     snapshot) and kindForFileName (extension → kind)
 *   - pure candidate selection: selectSnapshotCandidates honors the
 *     mtime+size pre-filter, the kind filter, and the per-pass cap
 *   - the REAL fs pass against a pinned temp scripts root:
 *       ▸ first pass snapshots every eligible file with the
 *         "periodic" label sidecar, in the exact layout the list /
 *         diff / restore routes read
 *       ▸ binary kinds are skipped entirely
 *       ▸ a second pass with NO disk changes writes nothing
 *       ▸ a touched file with UNCHANGED content writes nothing (the
 *         hash-vs-latest-snapshot compare — mtime alone must not
 *         produce duplicate snapshots)
 *       ▸ a real content change DOES snapshot
 *   - the vitest guard: ensureSnapshotScheduler() is a NO-OP under
 *     the vitest environment (the timer never arms from a test run).
 *
 * ENV: SCRIPTS_ROOT is pinned to a temp dir (read at CALL time by
 * scripts.ts, so a static import is safe); snapshots land under
 * tmpdir()/praxis-local-history/<hash of that root> and the whole
 * project dir is removed in afterAll.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {
    ensureSnapshotScheduler,
    isTextualSnapshotKind,
    kindForFileName,
    type PeriodicFileFact,
    type PeriodicFileState,
    runPeriodicSnapshotPass,
    schedulerStatus,
    selectSnapshotCandidates,
    stateKeyFor,
} from "@/lib/local-history-scheduler";
import {projectHistoryDir, snapshotDir, snapshotDirs,} from "@/app/api/local-history/list/route-helpers";
import type {FileKind} from "@/lib/scripts";
import {slugify} from "@/lib/scripts";

const TMP_BASE = path.join(os.tmpdir(), `praxis-lhsched-${process.pid}`);
const SCRIPTS_ROOT = path.join(TMP_BASE, "root");
process.env.SCRIPTS_ROOT = SCRIPTS_ROOT;

/* ── fixtures ──────────────────────────────────────────────────── */

async function seedProject(): Promise<void> {
    await fs.mkdir(SCRIPTS_ROOT, {recursive: true});
    await fs.mkdir(path.join(SCRIPTS_ROOT, "FolderA", "sub"), {recursive: true});
    await fs.mkdir(path.join(SCRIPTS_ROOT, "__pycache__"), {recursive: true});
    await fs.mkdir(path.join(SCRIPTS_ROOT, ".praxis"), {recursive: true});
    await fs.writeFile(
        path.join(SCRIPTS_ROOT, "rootfile.py"),
        'print("root")\n',
        "utf-8"
    );
    await fs.writeFile(
        path.join(SCRIPTS_ROOT, "FolderA", "helper.py"),
        "def helper():\n    return 1\n",
        "utf-8"
    );
    await fs.writeFile(
        path.join(SCRIPTS_ROOT, "FolderA", "sub", "notes.md"),
        "# notes\n",
        "utf-8"
    );
    // A binary kind — must NEVER be snapshotted by the periodic pass.
    await fs.writeFile(path.join(SCRIPTS_ROOT, "logo.png"), Buffer.from([0x89, 0x50]));
    // Hidden dir + hidden file — skipped like the explorer skips them.
    await fs.writeFile(
        path.join(SCRIPTS_ROOT, ".praxis", "settings.json"),
        "{}\n",
        "utf-8"
    );
    await fs.writeFile(
        path.join(SCRIPTS_ROOT, "__pycache__", "junk.py"),
        "x = 1\n",
        "utf-8"
    );
}

function fact(over: Partial<PeriodicFileFact>): PeriodicFileFact {
    return {
        folderSlug: "F",
        fileSlug: "f",
        abs: "/nowhere",
        name: "f.py",
        kind: "python",
        mtimeMs: 1_000,
        size: 10,
        ...over,
    };
}

/* ── pure halves ───────────────────────────────────────────────── */

describe("isTextualSnapshotKind / kindForFileName", () => {
    it("accepts the text-representable kinds", () => {
        for (const k of ["python", "markdown", "json", "csv", "ipynb"] as FileKind[]) {
            expect(isTextualSnapshotKind(k)).toBe(true);
        }
    });

    it("rejects the binary kinds (the save paths are text-only too)", () => {
        for (const k of ["image", "video", "audio", "pdf", "spreadsheet", "sqlite", "other"] as FileKind[]) {
            expect(isTextualSnapshotKind(k)).toBe(false);
        }
        expect(isTextualSnapshotKind(undefined)).toBe(false);
    });

    it("maps names to kinds via the shared extension table", () => {
        expect(kindForFileName("main.py")).toBe("python");
        expect(kindForFileName("logo.png")).toBe("image");
        expect(kindForFileName(".gitignore")).toBe("text");
    });
});

describe("selectSnapshotCandidates", () => {
    it("keeps new files and files whose mtime or size moved", () => {
        const state: Record<string, PeriodicFileState> = {
            "F/same": {mtimeMs: 1_000, size: 10, hash: "h"},
            "F/mtime": {mtimeMs: 1_000, size: 10, hash: "h"},
            "F/size": {mtimeMs: 1_000, size: 10, hash: "h"},
        };
        const out = selectSnapshotCandidates(
            [
                fact({folderSlug: "F", fileSlug: "same", mtimeMs: 1_000, size: 10}),
                fact({folderSlug: "F", fileSlug: "mtime", mtimeMs: 1_001, size: 10}),
                fact({folderSlug: "F", fileSlug: "size", mtimeMs: 1_000, size: 11}),
                fact({folderSlug: "F", fileSlug: "new", mtimeMs: 5, size: 5}),
            ],
            state
        );
        expect(out.map((f) => f.fileSlug)).toEqual(["mtime", "size", "new"]);
    });

    it("skips binary kinds entirely", () => {
        const out = selectSnapshotCandidates(
            [
                fact({fileSlug: "a", kind: "image"}),
                fact({fileSlug: "b", kind: "python"}),
            ],
            {}
        );
        expect(out.map((f) => f.fileSlug)).toEqual(["b"]);
    });

    it("caps the candidate list per pass", () => {
        const files = Array.from({length: 10}, (_, i) =>
            fact({fileSlug: `f${i}`, mtimeMs: i, size: i})
        );
        expect(selectSnapshotCandidates(files, {}, 3)).toHaveLength(3);
    });

    it("state keys are folder/file pairs", () => {
        expect(stateKeyFor("F", "g")).toBe("F/g");
    });
});

/* ── the REAL fs pass ──────────────────────────────────────────── */

/** Newest .txt ids in the canonical (+ legacy) snapshot dirs. */
async function snapshotIds(folderSlug: string, fileSlug: string): Promise<string[]> {
    const ids: string[] = [];
    for (const dir of snapshotDirs(folderSlug, fileSlug)) {
        try {
            const names = await fs.readdir(dir);
            ids.push(...names.filter((n) => n.endsWith(".txt")).map((n) => n.slice(0, -4)));
        } catch {
            /* no dir yet */
        }
    }
    return ids.sort();
}

describe("runPeriodicSnapshotPass (real fs, pinned scripts root)", () => {
    beforeAll(async () => {
        await seedProject();
    });

    afterAll(async () => {
        // Remove BOTH the pinned scripts root and this test run's slice of
        // the history tree so nothing leaks into the real tmp dir.
        await fs.rm(TMP_BASE, {recursive: true, force: true}).catch(() => {
        });
        await fs.rm(projectHistoryDir(), {recursive: true, force: true}).catch(() => {
        });
    });

    it("first pass snapshots every eligible text file with the periodic label", async () => {
        const result = await runPeriodicSnapshotPass();
        // rootfile.py + FolderA/helper.py + FolderA/sub/notes.md are the
        // eligible files (logo.png binary-skipped; .praxis + __pycache__
        // never walked).
        expect(result.written).toBe(3);

        // Exact layout the timeline reads: folder slug + file slug pair.
        const rootIds = await snapshotIds(slugify("."), slugify("rootfile.py"));
        expect(rootIds.length).toBe(1);
        // …and the label sidecar the list route renders next to the time.
        const label = await fs.readFile(
            path.join(snapshotDir(slugify("."), slugify("rootfile.py")), `${rootIds[0]}.label`),
            "utf-8"
        );
        expect(label.trim()).toBe("periodic");

        // Nested file slug: slugify("sub/notes.md") under FolderA's slug.
        const nestedIds = await snapshotIds(
            slugify("FolderA"),
            slugify("sub/notes.md")
        );
        expect(nestedIds.length).toBe(1);
    });

    it("never touches binary kinds", async () => {
        const ids = await snapshotIds(slugify("."), slugify("logo.png"));
        expect(ids).toHaveLength(0);
    });

    it("a second pass with no disk changes writes nothing", async () => {
        const result = await runPeriodicSnapshotPass();
        expect(result.written).toBe(0);
        expect(result.examined).toBe(0); // pure stat pre-filter — nothing read
    });

    it("a touched file with UNCHANGED content writes nothing (hash compare)", async () => {
        // Same content, NEW mtime — utimes (portable, also on Windows) makes
        // the stat move deterministic: the stat filter must flag the file,
        // then the content-vs-latest-snapshot compare must clear it.
        const target = path.join(SCRIPTS_ROOT, "rootfile.py");
        const later = new Date(Date.now() + 60_000);
        await fs.utimes(target, later, later);
        const result = await runPeriodicSnapshotPass();
        expect(result.examined).toBe(1); // the stat moved → read + hashed…
        expect(result.written).toBe(0); // …but content matches → NO snapshot
        expect(result.unchanged).toBe(1);
        const ids = await snapshotIds(slugify("."), slugify("rootfile.py"));
        expect(ids).toHaveLength(1); // still exactly the one from pass 1
    });

    it("a REAL content change snapshots", async () => {
        const target = path.join(SCRIPTS_ROOT, "FolderA", "helper.py");
        await fs.writeFile(target, "def helper():\n    return 2\n", "utf-8");
        const result = await runPeriodicSnapshotPass();
        expect(result.written).toBe(1);
        const ids = await snapshotIds(slugify("FolderA"), slugify("helper.py"));
        expect(ids.length).toBe(2); // original + the change
        // The NEWEST snapshot carries the changed content.
        const newest = await fs.readFile(
            path.join(snapshotDir(slugify("FolderA"), slugify("helper.py")), `${ids[ids.length - 1]}.txt`),
            "utf-8"
        );
        expect(newest).toContain("return 2");
    });
});

/* ── the arming guard ──────────────────────────────────────────── */

describe("ensureSnapshotScheduler (vitest guard)", () => {
    it("is a NO-OP under the vitest environment — the timer never arms", () => {
        expect(process.env.VITEST).toBeTruthy();
        ensureSnapshotScheduler();
        const status = schedulerStatus();
        expect(status.armed).toBe(false);
        expect(status.running).toBe(false);
        expect(status.lastPassAt).toBe(0);
    });
});
