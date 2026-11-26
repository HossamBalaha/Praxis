/**
 * path-traversal.test.ts — SECURITY tests for src/lib/scripts.ts.
 *
 * scripts.ts exports the slug/path helpers every API route uses to turn
 * (folderSlug, fileSlug) request fields into filesystem paths. Slugs are
 * base64url-encoded NAMES, so a hostile client can encode ANY string —
 * "../..", "a/b", "/etc/passwd", "..\\..\\evil" — into a slug. These tests
 * verify the guards:
 *
 * - slugify/deslugify round-trips for benign names (incl. spaces, dots,
 * unicode); raw non-base64 traversal strings do NOT decode into
 * traversal names (URL-encoding tricks neither)
 * - getScriptsRoot/getDefaultScriptsRoot/getProjectsParentRoot
 * honor the SCRIPTS_ROOT env var (pinned to a controlled temp dir)
 * - resolveScriptPath: valid (Demo, a.py) resolves; nested file slugs
 * resolve by design; non-.py rejected without anyKind; and EVERY
 * traversal attempt — folder "..", folder "../<sibling>", file
 * "../../<sibling>/secret.py", backslash forms, absolute paths,
 * URL-encoded and raw variants — returns null even when the target
 * file REALLY EXISTS outside the scripts root (a sibling directory
 * with a real secret.py is planted for exactly that)
 * - safeFolderName: rejects separator/.., dot-names, NUL, padded names
 * - sanitizeSubPath: rejects.., backslashes, absolute/trailing-slash
 * forms, empty and hidden segments
 * - findRequirementsTxt: cannot be aimed at a sibling directory
 * - resolveFigurePath/readRunMetadata: runId format + figure/metadata
 * name guards against escaping RUN_TMP_ROOT
 * - projectRootRejectionReason: drive root / cwd / hidden / reserved
 *
 * ENV NOTE: SCRIPTS_ROOT is read at CALL time by scripts.ts, but
 * RUN_TMP_ROOT is captured at MODULE LOAD time — therefore this file sets
 * both env vars BEFORE dynamically importing the module (a static import
 * would be hoisted and evaluated first).
 *
 * UNTESTED INTERNALS (not exported, exercised only via the API routes):
 * listFilesAndDataFiles, parseScriptMetadata, scanPythonFiles,
 * parseCellMarkers (pure), listFolders
 * (covered indirectly by the resolution tests), and the run-tmp sweeper.
 */
import fs from "node:fs";
import path from "node:path";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

/* TMP_BASE is resolved the same way the app resolves the env vars
 * (scripts.ts does path.resolve(process.env.SCRIPTS_ROOT)): on Windows a
 * POSIX-style "/tmp/..." would otherwise stay DRIVE-RELATIVE ("\tmp\...")
 * while the app returns "C:\tmp\..." — every string comparison then
 * failed (7 red tests on Windows, green on POSIX). path.resolve makes
 * both sides identical on every platform. */
const TMP_BASE = path.resolve(`/tmp/praxis-pathtest-${process.pid}`);
/** The pinned scripts root — everything the app may touch lives INSIDE. */
const SCRIPTS_ROOT = path.join(TMP_BASE, "root");
/** A sibling directory OUTSIDE the scripts root, with real files to steal. */
const OUTSIDE_DIR = path.join(TMP_BASE, "outside");
/** Pinned RUN_TMP_ROOT for figure/metadata resolution tests. */
const RUN_TMP = path.join(TMP_BASE, "runs");

// Must be set before the dynamic import below (see ENV NOTE).
process.env.SCRIPTS_ROOT = SCRIPTS_ROOT;
process.env.RUN_TMP_ROOT = RUN_TMP;

const scripts = await import("@/lib/scripts");
const {
    slugify,
    deslugify,
    getScriptsRoot,
    getDefaultScriptsRoot,
    getProjectsParentRoot,
    sanitizeSubPath,
    safeFolderName,
    resolveScriptPath,
    findRequirementsTxt,
    resolveFigurePath,
    readRunMetadata,
    projectRootRejectionReason,
} = scripts;

beforeAll(() => {
    // Inside the scripts root: a real Demo folder with nested content.
    fs.mkdirSync(path.join(SCRIPTS_ROOT, "Demo", "sub"), {recursive: true});
    fs.writeFileSync(path.join(SCRIPTS_ROOT, "Demo", "a.py"), "# demo\n", "utf8");
    fs.writeFileSync(path.join(SCRIPTS_ROOT, "Demo", "sub", "b.py"), "# nested\n", "utf8");
    fs.writeFileSync(path.join(SCRIPTS_ROOT, "Demo", "notes.md"), "# notes\n", "utf8");
    fs.writeFileSync(path.join(SCRIPTS_ROOT, "Demo", "requirements.txt"), "numpy\n", "utf8");
    // OUTSIDE the scripts root: the attack targets. These files EXIST, so a
    // missing containment check would let the traversal actually resolve.
    fs.mkdirSync(OUTSIDE_DIR, {recursive: true});
    fs.writeFileSync(path.join(OUTSIDE_DIR, "secret.py"), "# SECRET\n", "utf8");
    fs.writeFileSync(path.join(OUTSIDE_DIR, "requirements.txt"), "should-not-leak\n", "utf8");
    fs.writeFileSync(path.join(OUTSIDE_DIR, "vars.json"), '{"leaked": true}\n', "utf8");
    // Run temp dir with one real figure + one real metadata file.
    fs.mkdirSync(path.join(RUN_TMP, "run-1234"), {recursive: true});
    fs.writeFileSync(path.join(RUN_TMP, "run-1234", "fig.png"), "png", "utf8");
    fs.writeFileSync(path.join(RUN_TMP, "run-1234", "vars.json"), '{"x": 1}\n', "utf8");
});

afterAll(() => {
    fs.rmSync(TMP_BASE, {recursive: true, force: true});
    delete process.env.SCRIPTS_ROOT;
    delete process.env.RUN_TMP_ROOT;
});

/* ─── slug round-trips ─────────────────────────────────────────────── */

describe("slugify / deslugify", () => {
    it("round-trips benign folder and file names losslessly", () => {
        for (const name of ["Demo", "Data Analysis", "Getting Started", "a.py", "v1.2 Notes.md", "Ünïcode Földer"]) {
            expect(deslugify(slugify(name))).toBe(name);
        }
    });

    it("encodes names containing separators as opaque slugs (no literal dots/slashes)", () => {
        const slug = slugify("../outside");
        expect(slug).not.toContain(".");
        expect(slug).not.toContain("/");
        expect(slug).not.toContain("\\");
    });

    it("raw traversal strings passed AS slugs do not decode into traversal names", () => {
        // ".." / "../.." contain no base64url payload → decode to the empty string.
        expect(deslugify("..")).toBe("");
        expect(deslugify("../..")).toBe("");
        expect(deslugify("")).toBe("");
    });

    it("URL-encoded traversal payloads do not decode into traversal names", () => {
        // "%2e%2e" is not valid base64url — it decodes to replacement-character
        // garbage, never to "..". The slug layer is base64, NOT url-encoding.
        const decoded = deslugify("%2e%2e");
        expect(decoded).not.toContain("..");
        expect(decoded).not.toMatch(/^[./\\]+$/);
    });
});

/* ─── root resolution ──────────────────────────────────────────────── */

describe("getScriptsRoot / getDefaultScriptsRoot / getProjectsParentRoot", () => {
    it("SCRIPTS_ROOT env var pins the scripts root", () => {
        expect(getScriptsRoot()).toBe(SCRIPTS_ROOT);
        expect(getDefaultScriptsRoot()).toBe(SCRIPTS_ROOT);
    });

    it("the projects parent is the pinned root's parent directory", () => {
        expect(getProjectsParentRoot()).toBe(path.dirname(SCRIPTS_ROOT));
    });
});

/* ─── resolveScriptPath — the main traversal guard ─────────────────── */

describe("resolveScriptPath — valid resolutions", () => {
    it("resolves a real (folder, file) pair inside the root", async () => {
        const res = await resolveScriptPath(slugify("Demo"), slugify("a.py"));
        expect(res).toEqual({
            absPath: path.join(SCRIPTS_ROOT, "Demo", "a.py"),
            folderName: "Demo",
            fileName: "a.py",
        });
    });

    it("resolves NESTED files (file slug encodes a relative path — by design)", async () => {
        const res = await resolveScriptPath(slugify("Demo"), slugify("sub/b.py"));
        expect(res?.absPath).toBe(path.join(SCRIPTS_ROOT, "Demo", "sub", "b.py"));
        // A crafted folder slug that stays INSIDE the root addresses the same
        // file — containment is the security property, not the slug's shape.
        const res2 = await resolveScriptPath(slugify("Demo/sub"), slugify("b.py"));
        expect(res2?.absPath).toBe(path.join(SCRIPTS_ROOT, "Demo", "sub", "b.py"));
    });

    it("rejects non-.py files unless anyKind is set (export routes only)", async () => {
        expect(await resolveScriptPath(slugify("Demo"), slugify("notes.md"))).toBeNull();
        const res = await resolveScriptPath(slugify("Demo"), slugify("notes.md"), {anyKind: true});
        expect(res?.absPath).toBe(path.join(SCRIPTS_ROOT, "Demo", "notes.md"));
    });

    it("returns null for missing files and empty slugs", async () => {
        expect(await resolveScriptPath(slugify("Demo"), slugify("missing.py"))).toBeNull();
        expect(await resolveScriptPath(slugify("NoSuchFolder"), slugify("a.py"))).toBeNull();
        expect(await resolveScriptPath("", slugify("a.py"))).toBeNull();
        expect(await resolveScriptPath(slugify("Demo"), "")).toBeNull();
    });
});

describe("resolveScriptPath — traversal attempts are rejected", () => {
    // Sanity for the attack fixture: the escape target REALLY exists.
    it("attack fixture: a secret file exists OUTSIDE the scripts root", () => {
        expect(fs.existsSync(path.join(OUTSIDE_DIR, "secret.py"))).toBe(true);
    });

    it("folder slug '..' cannot reach the scripts root's parent", async () => {
        expect(await resolveScriptPath(slugify(".."), slugify("secret.py"))).toBeNull();
    });

    it("folder slug '../<sibling>' cannot reach a real file in a sibling dir", async () => {
        // ../outside resolves to TMP_BASE/outside which CONTAINS secret.py —
        // without the containment guard this would resolve successfully.
        expect(await resolveScriptPath(slugify("../outside"), slugify("secret.py"))).toBeNull();
    });

    it("folder slug '../..' cannot climb two levels", async () => {
        expect(await resolveScriptPath(slugify("../.."), slugify("secret.py"))).toBeNull();
    });

    it("file slug '../../<sibling>/secret.py' cannot escape via the file name", async () => {
        expect(await resolveScriptPath(slugify("Demo"), slugify("../../outside/secret.py"))).toBeNull();
    });

    it("absolute paths in the file slug are neutralized by path.join (anchored inside)", async () => {
        // path.join(folderDir, "/abs/path") keeps the result under folderDir,
        // and the file does not exist there.
        expect(
            await resolveScriptPath(slugify("Demo"), slugify(`${OUTSIDE_DIR}/secret.py`))
        ).toBeNull();
        expect(await resolveScriptPath(slugify("Demo"), slugify("/etc/passwd.py"))).toBeNull();
    });

    it("absolute paths in the FOLDER slug are anchored under the root", async () => {
        expect(await resolveScriptPath(slugify("/etc"), slugify("passwd.py"))).toBeNull();
        expect(await resolveScriptPath(slugify(OUTSIDE_DIR), slugify("secret.py"))).toBeNull();
    });

    it("backslash traversal forms are rejected (literal on POSIX, guarded on Windows)", async () => {
        expect(await resolveScriptPath(slugify("..\\..\\outside"), slugify("secret.py"))).toBeNull();
        expect(await resolveScriptPath(slugify("Demo"), slugify("..\\..\\outside\\secret.py"))).toBeNull();
    });

    it("raw (non-base64) and URL-encoded traversal slugs are rejected", async () => {
        // A raw ".." slug decodes to "" → rejected by the empty-name check.
        expect(await resolveScriptPath("..", "c2VjcmV0LnB5")).toBeNull();
        // "%2e%2e" decodes to garbage → nonexistent folder.
        expect(await resolveScriptPath("%2e%2e", "c2VjcmV0LnB5")).toBeNull();
    });
});

/* ─── safeFolderName ───────────────────────────────────────────────── */

describe("safeFolderName", () => {
    it("accepts benign folder slugs", () => {
        expect(safeFolderName(slugify("Demo"))).toBe("Demo");
        expect(safeFolderName(slugify("Data Analysis"))).toBe("Data Analysis");
    });

    it("rejects names that could escape the root when joined into a path", () => {
        expect(safeFolderName(slugify(".."))).toBeNull();
        expect(safeFolderName(slugify("../.."))).toBeNull();
        expect(safeFolderName(slugify("a/b"))).toBeNull();
        expect(safeFolderName(slugify("a\\b"))).toBeNull();
        expect(safeFolderName(slugify("sub/../../outside"))).toBeNull();
    });

    it("rejects NUL bytes, padding whitespace, dot-names and empty names", () => {
        expect(safeFolderName(slugify("a\0b"))).toBeNull();
        expect(safeFolderName(slugify(" Demo"))).toBeNull();
        expect(safeFolderName(slugify("Demo "))).toBeNull();
        expect(safeFolderName(slugify("."))).toBeNull();
        expect(safeFolderName(slugify(".hidden"))).toBeNull();
        expect(safeFolderName("")).toBeNull();
    });
});

/* ─── sanitizeSubPath ──────────────────────────────────────────────── */

describe("sanitizeSubPath", () => {
    it("accepts undefined/null/empty as the folder root", () => {
        expect(sanitizeSubPath(undefined)).toBe("");
        expect(sanitizeSubPath(null)).toBe("");
        expect(sanitizeSubPath("")).toBe("");
        expect(sanitizeSubPath("   ")).toBe("");
    });

    it("accepts and trims clean relative paths", () => {
        expect(sanitizeSubPath("data")).toBe("data");
        expect(sanitizeSubPath("data/raw")).toBe("data/raw");
        expect(sanitizeSubPath("  data/raw  ")).toBe("data/raw");
    });

    it("rejects traversal, separators, absolute and malformed forms", () => {
        expect(sanitizeSubPath("..")).toBeNull();
        expect(sanitizeSubPath("a/../b")).toBeNull();
        expect(sanitizeSubPath("a\\b")).toBeNull();
        expect(sanitizeSubPath("/absolute")).toBeNull();
        expect(sanitizeSubPath("trailing/")).toBeNull();
        expect(sanitizeSubPath("a//b")).toBeNull(); // empty segment
        expect(sanitizeSubPath(".hidden")).toBeNull();
        expect(sanitizeSubPath("a/.git")).toBeNull();
    });
});

/* ─── findRequirementsTxt ──────────────────────────────────────────── */

describe("findRequirementsTxt", () => {
    it("finds a requirements.txt inside a real folder", async () => {
        expect(await findRequirementsTxt(slugify("Demo"))).toBe(
            path.join(SCRIPTS_ROOT, "Demo", "requirements.txt")
        );
    });

    it("cannot be aimed at a sibling directory outside the root", async () => {
        // TMP_BASE/outside/requirements.txt EXISTS — the containment check in
        // the candidate loop must skip it.
        expect(fs.existsSync(path.join(OUTSIDE_DIR, "requirements.txt"))).toBe(true);
        expect(await findRequirementsTxt(slugify("../outside"))).toBeNull();
        expect(await findRequirementsTxt(slugify(".."))).toBeNull();
    });
});

/* ─── figure / metadata resolution (run temp dir) ──────────────────── */

describe("resolveFigurePath / readRunMetadata", () => {
    it("resolves a real (runId, figure) pair inside RUN_TMP_ROOT", async () => {
        expect(await resolveFigurePath("run-1234", "fig.png")).toBe(
            path.join(RUN_TMP, "run-1234", "fig.png")
        );
        expect(await readRunMetadata("run-1234", "vars.json")).toEqual({x: 1});
    });

    it("rejects runIds that are not plain identifiers (separators, dots, empty)", async () => {
        expect(await resolveFigurePath("../run-1234", "fig.png")).toBeNull();
        expect(await resolveFigurePath("a/b", "fig.png")).toBeNull();
        expect(await resolveFigurePath("..", "fig.png")).toBeNull();
        expect(await resolveFigurePath("", "fig.png")).toBeNull();
        expect(await readRunMetadata("../outside", "secret.py")).toBeNull();
    });

    it("rejects figure/metadata names containing separators or '..'", async () => {
        expect(await resolveFigurePath("run-1234", "../fig.png")).toBeNull();
        expect(await resolveFigurePath("run-1234", "sub/fig.png")).toBeNull();
        expect(await resolveFigurePath("run-1234", "..\\fig.png")).toBeNull();
        expect(await resolveFigurePath("run-1234", "/etc/passwd")).toBeNull();
        expect(await resolveFigurePath("run-1234", "")).toBeNull();
        // The traversal would reach the planted outside file if unguarded:
        expect(await resolveFigurePath("run-1234", "../../outside/secret.py")).toBeNull();
        expect(await readRunMetadata("run-1234", "../../outside/vars.json")).toBeNull();
    });

    it("returns null for files that do not exist in the run dir", async () => {
        expect(await resolveFigurePath("run-1234", "nope.png")).toBeNull();
        expect(await readRunMetadata("run-1234", "nope.json")).toBeNull();
    });
});

/* ─── project root guard ───────────────────────────────────────────── */

describe("projectRootRejectionReason", () => {
    it("rejects the drive root, the app's own cwd, hidden and reserved names", () => {
        expect(projectRootRejectionReason("/")).toMatch(/drive root/);
        expect(projectRootRejectionReason(process.cwd())).toMatch(/app's own directory/);
        expect(projectRootRejectionReason(path.join(TMP_BASE, ".git"))).toMatch(/Hidden folders/);
        expect(projectRootRejectionReason(path.join(TMP_BASE, "node_modules"))).toMatch(
            /reserved directory name/
        );
    });

    it("accepts a normal content directory", () => {
        expect(projectRootRejectionReason(SCRIPTS_ROOT)).toBeNull();
        expect(projectRootRejectionReason(OUTSIDE_DIR)).toBeNull();
    });
});
