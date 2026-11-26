/**
 * agent-mode.test.ts — unit tests for src/lib/agent-mode.ts, the PURE
 * half of Agent Mode (multi-file AI edits with a step plan and
 * per-file approvals):
 *
 *   - plan JSON normalization: fenced / unfenced / prose-wrapped replies,
 *     missing fields, malformed edits dropped (never thrown);
 *   - drift verification + splice: applyEdit's exact-match locator and
 *     the drift result;
 *   - create-file path derivation (createFileContent + the create-side
 *     normalization rules);
 *   - the manifest filtering rules + the browser-side slug encode
 *     (byte-identical to lib/scripts slugify, verified against Node's
 *     Buffer and round-tripped through lib/slug-codec decodeSlug).
 */
import {describe, expect, it} from "vitest";
import {
    AGENT_PLAN_MAX_EDITS,
    AGENT_PLAN_MAX_STEPS,
    applyEdit,
    createFileContent,
    encodeSlug,
    extractPlanJson,
    isPlannableTextPath,
    manifestPathDepth,
    normalizeAgentPlan,
    normalizeRelativePath,
    planLabel,
    stripMarkdownFences,
} from "@/lib/agent-mode";
import {decodeSlug} from "@/lib/slug-codec";

/* ─── Plan JSON normalization ──────────────────────────────────────── */

describe("normalizeAgentPlan — raw reply shapes", () => {
    const FULL = JSON.stringify({
        steps: [{title: "Add logging", detail: "Insert a logger in every route."}],
        edits: [
            {
                path: "api/routes.py",
                action: "modify",
                description: "add logger import",
                original: "import os\n",
                proposed: "import os\nimport logging\n",
            },
        ],
        notes: "Two files touched.",
    });

    it("parses a clean unfenced JSON reply", () => {
        const r = normalizeAgentPlan(FULL);
        expect(r).not.toBeNull();
        expect(r!.plan.steps).toHaveLength(1);
        expect(r!.plan.steps[0]).toEqual({
            title: "Add logging",
            detail: "Insert a logger in every route.",
        });
        expect(r!.plan.edits).toHaveLength(1);
        expect(r!.plan.edits[0].path).toBe("api/routes.py");
        expect(r!.plan.edits[0].action).toBe("modify");
        expect(r!.plan.edits[0].original).toBe("import os\n");
        expect(r!.plan.edits[0].proposed).toBe("import os\nimport logging\n");
        expect(r!.plan.notes).toBe("Two files touched.");
        expect(r!.droppedEdits).toBe(0);
    });

    it("parses a reply wrapped in a markdown fence", () => {
        const fenced = "```json\n" + FULL + "\n```";
        expect(normalizeAgentPlan(fenced)?.plan.edits).toHaveLength(1);
    });

    it("parses a reply with prose around the JSON object", () => {
        const noisy = `Here is the plan you asked for:\n${FULL}\nHope this helps!`;
        const r = normalizeAgentPlan(noisy);
        expect(r?.plan.steps).toHaveLength(1);
        expect(r?.plan.edits).toHaveLength(1);
    });

    it("returns null for replies with no recoverable JSON", () => {
        expect(normalizeAgentPlan("")).toBeNull();
        expect(normalizeAgentPlan("no braces at all")).toBeNull();
        expect(normalizeAgentPlan("{ steps: [ } unparseable")).toBeNull();
        expect(normalizeAgentPlan("{\"unclosed\":")).toBeNull();
    });

    it("tolerates missing sections and fields", () => {
        const r = normalizeAgentPlan("{}");
        expect(r?.plan.steps).toEqual([]);
        expect(r?.plan.edits).toEqual([]);
        expect(r?.plan.notes).toBe("");
        // A step without a title is dropped; a step without detail survives
        // with an empty detail.
        const partial = normalizeAgentPlan(
            JSON.stringify({
                steps: [{title: "Only a title"}, {detail: "no title"}],
            })
        );
        expect(partial?.plan.steps).toEqual([{title: "Only a title", detail: ""}]);
    });

    it("non-object / non-array members degrade to empty sections", () => {
        const r = normalizeAgentPlan(
            JSON.stringify({steps: "nope", edits: {a: 1}, notes: 42})
        );
        expect(r?.plan.steps).toEqual([]);
        expect(r?.plan.edits).toEqual([]);
        expect(r?.plan.notes).toBe("");
    });
});

/* ─── Edit normalization rules ─────────────────────────────────────── */

describe("normalizeAgentPlan — edit validation", () => {
    const planOf = (edits: unknown[]) =>
        normalizeAgentPlan(JSON.stringify({steps: [], edits}))!;

    it("drops edits with invalid paths (traversal / absolute / backslash / hidden)", () => {
        const r = planOf([
            {path: "../evil.py", action: "modify", original: "x", proposed: "y"},
            {path: "/abs.py", action: "modify", original: "x", proposed: "y"},
            {path: "a\\b.py", action: "modify", original: "x", proposed: "y"},
            {path: ".hidden/x.py", action: "modify", original: "x", proposed: "y"},
            {path: "", action: "modify", original: "x", proposed: "y"},
            {path: 42, action: "modify", original: "x", proposed: "y"},
        ]);
        expect(r.plan.edits).toEqual([]);
        expect(r.droppedEdits).toBe(6);
    });

    it("keeps a valid nested relative path untouched (trims it)", () => {
        const r = planOf([
            {
                path: "  sub/dir/Name With Spaces.py  ",
                action: "modify",
                original: "x",
                proposed: "y",
            },
        ]);
        expect(r.plan.edits[0].path).toBe("sub/dir/Name With Spaces.py");
    });

    it("treats an unknown action as modify when a locator exists, drops it otherwise", () => {
        const r = planOf([
            {path: "a.py", action: "replace", original: "x", proposed: "y"},
            {path: "a.py", action: "replace", proposed: "y"},
        ]);
        expect(r.plan.edits).toHaveLength(1);
        expect(r.plan.edits[0].action).toBe("modify");
        expect(r.droppedEdits).toBe(1);
    });

    it("drops modify edits without an original locator", () => {
        const r = planOf([
            {path: "a.py", action: "modify", original: "", proposed: "y"},
            {path: "a.py", action: "modify", proposed: "y"},
        ]);
        expect(r.plan.edits).toEqual([]);
        expect(r.droppedEdits).toBe(2);
    });

    it("drops modify no-ops (original identical to proposed)", () => {
        const r = planOf([
            {path: "a.py", action: "modify", original: "x = 1\n", proposed: "x = 1\n"},
        ]);
        expect(r.plan.edits).toEqual([]);
        expect(r.droppedEdits).toBe(1);
    });

    it("drops create edits with empty proposed content", () => {
        const r = planOf([{path: "new.py", action: "create", proposed: ""}]);
        expect(r.plan.edits).toEqual([]);
        expect(r.droppedEdits).toBe(1);
    });

    it("forces create originals to empty string", () => {
        const r = planOf([
            {path: "new.py", action: "create", original: "should be ignored", proposed: "x = 1\n"},
        ]);
        expect(r.plan.edits).toHaveLength(1);
        expect(r.plan.edits[0].original).toBe("");
        expect(r.plan.edits[0].proposed).toBe("x = 1\n");
    });

    it("dedupes identical edits (same path, action and original)", () => {
        const r = planOf([
            {path: "a.py", action: "modify", original: "x", proposed: "y"},
            {path: "a.py", action: "modify", original: "x", proposed: "z"},
        ]);
        expect(r.plan.edits).toHaveLength(1);
        expect(r.droppedEdits).toBe(1);
    });

    it("enforces the step and edit caps, counting the overflow as dropped", () => {
        const steps = Array.from({length: 30}, (_, i) => ({title: `s${i}`}));
        const edits = Array.from({length: 30}, (_, i) => ({
            path: `f${i}.py`,
            action: "modify",
            original: "x",
            proposed: `y${i}`,
        }));
        const r = normalizeAgentPlan(JSON.stringify({steps, edits}))!;
        expect(r.plan.steps).toHaveLength(AGENT_PLAN_MAX_STEPS);
        expect(r.plan.edits).toHaveLength(AGENT_PLAN_MAX_EDITS);
        expect(r.droppedEdits).toBe(30 - AGENT_PLAN_MAX_EDITS);
        // The first edits survive in order (plan order is apply order).
        expect(r.plan.edits[0].path).toBe("f0.py");
        expect(r.plan.edits[AGENT_PLAN_MAX_EDITS - 1].path).toBe(`f${AGENT_PLAN_MAX_EDITS - 1}.py`);
    });

    it("caps long string fields instead of blowing up the payload", () => {
        const r = planOf([
            {
                path: "a.py",
                action: "modify",
                description: "d".repeat(900),
                original: "x".repeat(60_000),
                proposed: "y".repeat(60_000),
            },
        ]);
        expect(r.plan.edits[0].description.length).toBe(500);
        expect(r.plan.edits[0].original.length).toBe(50_000);
        expect(r.plan.edits[0].proposed.length).toBe(50_000);
    });
});

/* ─── knownPaths cross-checks (the manifest contract) ──────────────── */

describe("normalizeAgentPlan — knownPaths cross-check", () => {
    const known = new Set(["routes.py", "sub/util.py"]);
    const planOf = (edits: unknown[]) =>
        normalizeAgentPlan(JSON.stringify({steps: [], edits}), {knownPaths: known})!;

    it("keeps modify edits that target manifest files", () => {
        const r = planOf([
            {path: "sub/util.py", action: "modify", original: "x", proposed: "y"},
        ]);
        expect(r.plan.edits).toHaveLength(1);
        expect(r.droppedEdits).toBe(0);
    });

    it("drops modify edits for files the manifest never listed (invented paths)", () => {
        const r = planOf([
            {path: "does_not_exist.py", action: "modify", original: "x", proposed: "y"},
        ]);
        expect(r.plan.edits).toEqual([]);
        expect(r.droppedEdits).toBe(1);
    });

    it("drops create edits whose file already exists in the manifest", () => {
        const r = planOf([{path: "routes.py", action: "create", proposed: "x\n"}]);
        expect(r.plan.edits).toEqual([]);
        expect(r.droppedEdits).toBe(1);
    });

    it("keeps create edits for genuinely new paths", () => {
        const r = planOf([{path: "tests/test_routes.py", action: "create", proposed: "x\n"}]);
        expect(r.plan.edits).toHaveLength(1);
        expect(r.droppedEdits).toBe(0);
    });

    it("without knownPaths, path existence is not cross-checked", () => {
        const r = normalizeAgentPlan(
            JSON.stringify({
                edits: [{path: "anything.py", action: "modify", original: "x", proposed: "y"}],
            })
        );
        expect(r?.plan.edits).toHaveLength(1);
    });
});

/* ─── Drift verification + splice ─────────────────────────────────── */

describe("applyEdit", () => {
    const CONTENT = [
        "import os",
        "",
        "def handler(event):",
        "    return event",
        "",
        "def other():",
        "    return handler(None)",
    ].join("\n");

    it("splices the exact original out and the proposed in (middle of file)", () => {
        const r = applyEdit(CONTENT, {
            original: "def handler(event):\n    return event",
            proposed: "def handler(event):\n    logging.info(\"event %s\", event)\n    return event",
        });
        expect(r).toEqual({
            ok: true,
            next: [
                "import os",
                "",
                "def handler(event):",
                "    logging.info(\"event %s\", event)",
                "    return event",
                "",
                "def other():",
                "    return handler(None)",
            ].join("\n"),
        });
    });

    it("replaces only the FIRST occurrence when the snippet appears twice", () => {
        const r = applyEdit("x = 1\nx = 1\n", {original: "x = 1", proposed: "x = 2"});
        expect(r).toEqual({ok: true, next: "x = 2\nx = 1\n"});
    });

    it("supports deletions (empty proposed removes the snippet)", () => {
        const r = applyEdit("keep\nremove me\nkeep\n", {original: "remove me\n", proposed: ""});
        expect(r).toEqual({ok: true, next: "keep\nkeep\n"});
    });

    it("reports drift when the original no longer matches byte-exact", () => {
        // Whitespace-only difference is still drift — the client must never
        // blind-write a stale replacement.
        expect(applyEdit("def f():\n    return 1\n", {
            original: "def f():\n\treturn 1",
            proposed: "nope",
        })).toEqual({ok: false, reason: "drift"});
        expect(applyEdit("totally different\n", {
            original: "def f():\n    return 1",
            proposed: "nope",
        })).toEqual({ok: false, reason: "drift"});
    });

    it("reports drift for an empty original (un-locatable locator)", () => {
        expect(applyEdit("anything", {original: "", proposed: "x"})).toEqual({
            ok: false,
            reason: "drift",
        });
    });

    it("chained edits compose: the second applies to the first's output", () => {
        const first = applyEdit(CONTENT, {
            original: "import os",
            proposed: "import os\nimport logging",
        });
        expect(first.ok).toBe(true);
        const second = applyEdit((first as { ok: true; next: string }).next, {
            original: "    return event",
            proposed: "    logging.info(event)\n    return event",
        });
        expect(second.ok).toBe(true);
        expect((second as { next: string }).next).toContain("import logging");
        expect((second as { next: string }).next).toContain("logging.info(event)");
    });
});

/* ─── Create-file path derivation ─────────────────────────────────── */

describe("createFileContent", () => {
    it("derives the new file's content from the edit's proposed text", () => {
        expect(createFileContent({proposed: "import pytest\n\ndef test_x():\n    assert True\n"})).toBe(
            "import pytest\n\ndef test_x():\n    assert True\n"
        );
    });
    it("is exactly what the apply pass writes for create edits (before is \"\")", () => {
        // The undo entry for a created file records preContent "" — the
        // written content IS createFileContent(edit).
        const edit = {proposed: "x = 1\n"};
        expect(createFileContent(edit)).toBe("x = 1\n");
    });
});

/* ─── Manifest filtering rules ────────────────────────────────────── */

describe("isPlannableTextPath", () => {
    it("accepts the text/code extensions the agent may plan against", () => {
        for (const p of [
            "run.py", "notes.md", "util.ts", "api.js", "conf.json",
            "cfg.yaml", "pyproject.toml", "setup.sh", "Makefile.txt",
            "sub/dir/module.py",
        ]) {
            expect(isPlannableTextPath(p)).toBe(true);
        }
    });

    it("is case-insensitive on the extension", () => {
        expect(isPlannableTextPath("SCRIPT.PY")).toBe(true);
        expect(isPlannableTextPath("readme.MD")).toBe(true);
    });

    it("rejects binaries, archives, media and data formats", () => {
        for (const p of [
            "photo.png", "logo.svg", "bundle.zip", "bundle.tar.gz", "deep.7z",
            "data.parquet", "sheet.xlsx", "db.sqlite", "clip.mp4", "doc.pdf",
            "font.woff2", "unknown.bin", "noextension",
        ]) {
            expect(isPlannableTextPath(p)).toBe(false);
        }
    });
});

describe("manifestPathDepth", () => {
    it("counts folder segments (0 for a root file)", () => {
        expect(manifestPathDepth("a.py")).toBe(0);
        expect(manifestPathDepth("a/b.py")).toBe(1);
        expect(manifestPathDepth("a/b/c/d/e.py")).toBe(4);
    });
});

describe("normalizeRelativePath", () => {
    it("accepts and trims valid relative paths", () => {
        expect(normalizeRelativePath("a.py")).toBe("a.py");
        expect(normalizeRelativePath("  sub/dir/a.py  ")).toBe("sub/dir/a.py");
    });
    it("rejects traversal, absolute, backslash, hidden and empty forms", () => {
        for (const bad of ["..", "../x.py", "a/../b.py", "/x.py", "x.py/", "a\\b.py", ".h/x.py", "", null, 7]) {
            expect(normalizeRelativePath(bad)).toBeNull();
        }
    });
});

/* ─── JSON extraction + fence stripping ───────────────────────────── */

describe("stripMarkdownFences / extractPlanJson", () => {
    it("strips one leading/trailing fence, keeps inner fences intact", () => {
        expect(stripMarkdownFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
        expect(stripMarkdownFences('  {"a":1}  ')).toBe('{"a":1}');
        expect(stripMarkdownFences("plain text")).toBe("plain text");
    });
    it("extracts the first {...} object and JSON.parses it", () => {
        expect(extractPlanJson('noise {"a": {"b": 2}} trailing')).toEqual({a: {b: 2}});
        expect(extractPlanJson("")).toBeNull();
        expect(extractPlanJson("no object here")).toBeNull();
        expect(extractPlanJson("{broken")).toBeNull();
    });
});

/* ─── Slug encode (the browser twin of scripts.ts slugify) ────────── */

describe("encodeSlug", () => {
    it("is byte-identical to the server's Buffer base64url slugify", () => {
        for (const name of [
            "routes.py",
            "sub/dir/Name With Spaces.py",
            "Brier Score.py",
            "unicode-ümlaut-测试.py",
        ]) {
            expect(encodeSlug(name)).toBe(
                Buffer.from(name, "utf-8").toString("base64url")
            );
        }
    });
    it("round-trips through lib/slug-codec's decodeSlug", () => {
        for (const name of ["a.py", "sub/dir/x.ts", "Name With Spaces.md"]) {
            expect(decodeSlug(encodeSlug(name))).toBe(name);
        }
    });
    it("returns an empty slug for an empty name", () => {
        expect(encodeSlug("")).toBe("");
    });
});

/* ─── Display helpers ─────────────────────────────────────────────── */

describe("planLabel", () => {
    it("keeps the first six words as the undo-group label", () => {
        expect(planLabel("add logging to every single API route in the project")).toBe(
            "add logging to every single API"
        );
    });
    it("falls back to a generic label for blank input", () => {
        expect(planLabel("   ")).toBe("agent task");
    });
});
