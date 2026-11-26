/**
 * run-configs.test.ts — unit tests for src/lib/run-configs.ts.
 *
 * Saved run configurations (args/env/stdin/interpreter per script) persist
 * in localStorage under "praxis.runconfigs.<folderSlug>/<fileSlug>".
 * Covered:
 *   - loadRunConfigs/saveRunConfigs round-trip through a mocked
 *     window.localStorage
 *   - malformed JSON and non-object payloads degrade to the empty bundle
 *   - per-config validation (entries without string id/name are dropped)
 *   - defaultId validation (must reference a surviving config)
 *   - the MAX_CONFIGS = 20 cap on save AND load — including the current
 *     quirk that defaultId is validated against the UNSLICED config list
 *   - newRunConfigId shape and uniqueness
 *   - runConfigSummary for every field combination
 *   - AUTO-DETECTION: detectRunConfigShape / synthesizeRunConfig (main
 *     block / argparse / module-style, commented-out guards, the
 *     "--help" argv placeholder)
 *   - the one-click-run argv/env parsing (doRun's exact rules)
 *   - the PROJECT-stored starred configs through a mocked
 *     /api/project-settings (sanitize, read-modify-write preserving the
 *     other settings keys, per-script sync, merged effective list)
 *   - runConfigNow: no-slugs error, the host-takeover event path, the
 *     direct POST /api/run SSE aggregation, HTTP + transport failures
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    detectRunConfigShape,
    getEffectiveRunConfigs,
    loadProjectRunConfigs,
    loadRunConfigs,
    newRunConfigId,
    parseRunConfigEnv,
    PROJECT_RUN_CONFIGS_KEY,
    type RunConfig,
    runConfigNow,
    runConfigSummary,
    saveProjectRunConfigs,
    saveRunConfigs,
    type ScriptRunConfigs,
    splitRunConfigArgs,
    syncStarredConfigsToProject,
    synthesizeRunConfig,
} from "@/lib/run-configs";

function makeLocalStorage(): Storage {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
            return store.size;
        },
    };
}

function cfg(id: string, overrides: Partial<RunConfig> = {}): RunConfig {
    return {
        id,
        name: `Config ${id}`,
        args: "",
        env: "",
        stdin: "",
        createdAt: 1_700_000_000_000,
        ...overrides,
    };
}

const KEY = "praxis.runconfigs.GettingStarted/HelloPraxis";

let storage: Storage;

beforeEach(() => {
    storage = makeLocalStorage();
    vi.stubGlobal("window", {localStorage: storage});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadRunConfigs / saveRunConfigs", () => {
    it("returns the empty bundle for a script with nothing stored", () => {
        expect(loadRunConfigs("GettingStarted", "HelloPraxis")).toEqual({
            configs: [],
            defaultId: null,
        });
    });

    it("round-trips configs and defaultId", () => {
        const data: ScriptRunConfigs = {
            configs: [
                cfg("rc-1", {name: "Verbose", args: "--verbose"}),
                cfg("rc-2", {name: "Dev data", env: "DATASET=dev\nLANG=C"}),
            ],
            defaultId: "rc-2",
        };
        saveRunConfigs("GettingStarted", "HelloPraxis", data);
        expect(loadRunConfigs("GettingStarted", "HelloPraxis")).toEqual(data);
    });

    it("stores per script — other script keys are untouched", () => {
        saveRunConfigs("GettingStarted", "HelloPraxis", {
            configs: [cfg("rc-1")],
            defaultId: "rc-1",
        });
        saveRunConfigs("DataAnalysis", "DescriptiveStats", {
            configs: [cfg("rc-9")],
            defaultId: null,
        });
        expect(loadRunConfigs("GettingStarted", "HelloPraxis").configs).toHaveLength(1);
        expect(loadRunConfigs("DataAnalysis", "DescriptiveStats").configs[0].id).toBe("rc-9");
        // Stored under the documented prefixed key.
        expect(storage.getItem(KEY)).not.toBeNull();
    });

    it("degrades to the empty bundle on malformed JSON", () => {
        storage.setItem(KEY, "{definitely not json");
        expect(loadRunConfigs("GettingStarted", "HelloPraxis")).toEqual({
            configs: [],
            defaultId: null,
        });
    });

    it("drops config entries that lack a string id or name", () => {
        storage.setItem(
            KEY,
            JSON.stringify({
                configs: [null, {id: "a"}, cfg("b"), {id: 42, name: "x"}, "junk"],
                defaultId: "b",
            })
        );
        const loaded = loadRunConfigs("GettingStarted", "HelloPraxis");
        expect(loaded.configs.map((c) => c.id)).toEqual(["b"]);
        expect(loaded.defaultId).toBe("b");
    });

    it("nulls defaultId when it references a config that did not survive validation", () => {
        storage.setItem(
            KEY,
            JSON.stringify({configs: [cfg("b")], defaultId: "ghost"})
        );
        expect(loadRunConfigs("GettingStarted", "HelloPraxis").defaultId).toBeNull();
    });

    it("nulls defaultId when it is not a string", () => {
        storage.setItem(KEY, JSON.stringify({configs: [cfg("b")], defaultId: 7}));
        expect(loadRunConfigs("GettingStarted", "HelloPraxis").defaultId).toBeNull();
    });

    it("caps the loaded config list at 20 entries", () => {
        const configs = Array.from({length: 25}, (_, i) => cfg(`rc-${i}`));
        storage.setItem(KEY, JSON.stringify({configs, defaultId: "rc-0"}));
        const loaded = loadRunConfigs("GettingStarted", "HelloPraxis");
        expect(loaded.configs).toHaveLength(20);
        expect(loaded.configs[0].id).toBe("rc-0");
        expect(loaded.configs[19].id).toBe("rc-19");
    });

    it("caps the SAVED config list at 20 entries too", () => {
        const configs = Array.from({length: 25}, (_, i) => cfg(`rc-${i}`));
        saveRunConfigs("GettingStarted", "HelloPraxis", {configs, defaultId: null});
        expect(loadRunConfigs("GettingStarted", "HelloPraxis").configs).toHaveLength(20);
    });

    it("defaultId is validated against the CAPPED list (edge-case fix)", () => {
        // rc-21 exists in the stored payload but is cut by the 20-cap; the
        // defaultId must now be dropped with it (used to survive the cap).
        const configs = Array.from({length: 22}, (_, i) => cfg(`rc-${i}`));
        storage.setItem(KEY, JSON.stringify({configs, defaultId: "rc-21"}));
        const loaded = loadRunConfigs("GettingStarted", "HelloPraxis");
        expect(loaded.configs.map((c) => c.id)).not.toContain("rc-21");
        expect(loaded.defaultId).toBeNull();
        // A default pointing INSIDE the capped list still resolves.
        storage.setItem(KEY, JSON.stringify({configs, defaultId: "rc-5"}));
        expect(loadRunConfigs("GettingStarted", "HelloPraxis").defaultId).toBe("rc-5");
    });
});

describe("newRunConfigId", () => {
    it("has the documented rc-<time>-<rand> shape", () => {
        const id = newRunConfigId();
        expect(id).toMatch(/^rc-[a-z0-9]+-[a-z0-9]{5}$/);
        expect(id.startsWith("rc-")).toBe(true);
    });

    it("generates unique ids", () => {
        const ids = new Set(Array.from({length: 100}, () => newRunConfigId()));
        expect(ids.size).toBe(100);
    });
});

describe("runConfigSummary", () => {
    it("returns 'no overrides' for an empty config", () => {
        expect(runConfigSummary(cfg("x"))).toBe("no overrides");
    });

    it("lists trimmed args", () => {
        expect(runConfigSummary(cfg("x", {args: "  --verbose --dry-run  "}))).toBe(
            "args: --verbose --dry-run"
        );
    });

    it("counts env lines as vars", () => {
        expect(runConfigSummary(cfg("x", {env: "A=1\nB=2"}))).toBe("env: 2 var(s)");
        expect(runConfigSummary(cfg("x", {env: "A=1"}))).toBe("env: 1 var(s)");
    });

    it("marks stdin presence without content", () => {
        expect(runConfigSummary(cfg("x", {stdin: "line1\nline2"}))).toBe("stdin");
    });

    it("shows the interpreter override as py:", () => {
        expect(runConfigSummary(cfg("x", {interpreter: "python3.12"}))).toBe("py: python3.12");
    });

    it("joins all fields with the middle-dot separator in fixed order", () => {
        expect(
            runConfigSummary(
                cfg("x", {
                    args: "--verbose",
                    env: "A=1",
                    stdin: "data",
                    interpreter: "python3.12",
                })
            )
        ).toBe("args: --verbose · env: 1 var(s) · stdin · py: python3.12");
    });
});

/* ==================================================================== */
/*  Auto-detection (pure static analysis)                              */
/* ==================================================================== */

describe("detectRunConfigShape", () => {
    it("main script: an if __name__ == '__main__' block", () => {
        expect(detectRunConfigShape("\ndef f():\n    pass\n\nif __name__ == '__main__':\n    f()\n")).toEqual({
            kind: "main",
            hasMainBlock: true,
            usesArgparse: false,
        });
    });

    it("argparse: the import (either form) or ArgumentParser(…)", () => {
        expect(detectRunConfigShape('import argparse\nif __name__ == "__main__":\n    pass\n').usesArgparse).toBe(true);
        expect(detectRunConfigShape("from argparse import ArgumentParser\n").usesArgparse).toBe(true);
        expect(detectRunConfigShape("p = argparse.ArgumentParser()\n").usesArgparse).toBe(true);
        expect(detectRunConfigShape("import argparse\nif __name__ == '__main__':\n    pass\n").kind).toBe("argparse");
    });

    it("module-style: no main block → plain run", () => {
        expect(detectRunConfigShape("def helper():\n    return 1\n")).toEqual({
            kind: "module",
            hasMainBlock: false,
            usesArgparse: false,
        });
    });

    it("a COMMENTED-OUT main block never counts", () => {
        expect(detectRunConfigShape("# if __name__ == '__main__':\n").hasMainBlock).toBe(false);
    });

    it("tolerates odd whitespace and either quote style", () => {
        expect(detectRunConfigShape("if   __name__   ==   \"__main__\"   :\n").hasMainBlock).toBe(true);
        expect(detectRunConfigShape("if __name__ == \"__main__\" :\n").hasMainBlock).toBe(true);
    });

    it("never matches a mis-spelled __main__ guard", () => {
        expect(detectRunConfigShape("if __nam__ == '__main__':\n").hasMainBlock).toBe(false);
    });
});

describe("synthesizeRunConfig", () => {
    it("main script → 'Main script' with empty argv", () => {
        const {config, detection} = synthesizeRunConfig(
            'if __name__ == "__main__":\n    print("hi")\n',
            "hi.py"
        );
        expect(detection.kind).toBe("main");
        expect(config.name).toBe("Main script");
        expect(config.args).toBe("");
        expect(config.auto).toBe(true);
        expect(config.id).toMatch(/^rc-/);
    });

    it("argparse CLI → the '--help' argv placeholder", () => {
        const {config, detection} = synthesizeRunConfig(
            'import argparse\nparser = argparse.ArgumentParser()\n',
            "cli.py"
        );
        expect(detection.kind).toBe("argparse");
        expect(config.name).toBe("Main script (argparse)");
        // --help runs safely on EVERY argparse CLI and prints the usage —
        // the placeholder the user swaps for real flags.
        expect(config.args).toBe("--help");
    });

    it("module-style → 'Plain run' with empty argv", () => {
        const {config, detection} = synthesizeRunConfig("def helper():\n    pass\n", "lib.py");
        expect(detection.kind).toBe("module");
        expect(config.name).toBe("Plain run");
        expect(config.args).toBe("");
    });
});

/* ==================================================================== */
/*  One-click run parsing (the toolbar's exact rules)                  */
/* ==================================================================== */

describe("splitRunConfigArgs / parseRunConfigEnv", () => {
    it("splits argv on whitespace after trimming (doRun's rule)", () => {
        expect(splitRunConfigArgs("  --verbose   --dry  ")).toEqual(["--verbose", "--dry"]);
        expect(splitRunConfigArgs("\t")).toBeUndefined();
        expect(splitRunConfigArgs("")).toBeUndefined();
    });

    it("parses KEY=VALUE lines (a value-less key maps to empty)", () => {
        expect(parseRunConfigEnv("A=1\n\nB=two \nFLAG")).toEqual({
            A: "1",
            B: "two",
            FLAG: "",
        });
        expect(parseRunConfigEnv("  ")).toBeUndefined();
    });
});

/* ==================================================================== */
/*  Project-stored starred configs (via /api/project-settings)         */

/* ==================================================================== */

/** An in-memory /api/project-settings double the store talks to. */
function makeProjectSettingsHarness(): {
    settings: Record<string, unknown>;
    posts: Array<Record<string, unknown>>;
} {
    const harness = {
        settings: {} as Record<string, unknown>,
        posts: [] as Array<Record<string, unknown>>,
    };
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === "/api/project-settings") {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body)) as { settings: Record<string, unknown> };
                harness.posts.push(body.settings);
                harness.settings = body.settings; // the POST replaces the file
                return new Response(JSON.stringify({ok: true}), {status: 200});
            }
            return new Response(
                JSON.stringify({ok: true, settings: harness.settings}),
                {status: 200}
            );
        }
        return new Response(JSON.stringify({error: "not found"}), {status: 404});
    });
    vi.stubGlobal("fetch", fetchMock);
    return harness;
}

describe("project run-config store", () => {
    it("loads and sanitizes the persisted starred list", async () => {
        const harness = makeProjectSettingsHarness();
        harness.settings = {
            pythonInterpreter: "py",
            [PROJECT_RUN_CONFIGS_KEY]: [
                cfg("a", {starred: true, folderSlug: "F", fileSlug: "f", fileName: "f.py"}),
                {id: "b"}, // junk — no name → dropped
                null,
                "nope",
            ],
        };
        const loaded = await loadProjectRunConfigs();
        expect(loaded.map((c) => c.id)).toEqual(["a"]);
        expect(loaded[0].starred).toBe(true);
        expect(loaded[0].folderSlug).toBe("F");
    });

    it("returns an empty list when the project has none (or is offline)", async () => {
        const harness = makeProjectSettingsHarness();
        harness.settings = {};
        expect(await loadProjectRunConfigs()).toEqual([]);
    });

    it("saveProjectRunConfigs PRESERVES the project's other settings keys", async () => {
        const harness = makeProjectSettingsHarness();
        harness.settings = {pythonInterpreter: "keep-me", notes: 1};
        const ok = await saveProjectRunConfigs([
            cfg("a", {starred: true, folderSlug: "F", fileSlug: "f"}),
        ]);
        expect(ok).toBe(true);
        // The POST body kept the unrelated keys and replaced ONLY the
        // runConfigs key (read-modify-write, not a blind overwrite).
        const posted = harness.posts[0];
        expect(posted).toMatchObject({pythonInterpreter: "keep-me", notes: 1});
        expect(Array.isArray(posted[PROJECT_RUN_CONFIGS_KEY])).toBe(true);
    });

    it("syncStarredConfigsToProject replaces ONLY this script's entries", async () => {
        const harness = makeProjectSettingsHarness();
        harness.settings = {
            [PROJECT_RUN_CONFIGS_KEY]: [
                // Another script's entry — must survive untouched.
                cfg("other", {starred: true, folderSlug: "Other", fileSlug: "o"}),
                // THIS script's old starred config — must be replaced.
                cfg("old", {starred: true, folderSlug: "F", fileSlug: "f"}),
            ],
        };
        const next = await syncStarredConfigsToProject("F", "f", "f.py", [
            cfg("local-plain"), // unstarred → stays localStorage-only
            cfg("local-star", {starred: true, args: "--x", auto: true}),
        ]);
        expect(next.map((c) => c.id).sort()).toEqual(["local-star", "other"]);
        // The starred entry is stamped with its script identity and the
        // ephemeral `auto` flag is stripped on persist.
        const star = next.find((c) => c.id === "local-star")!;
        expect(star).toMatchObject({folderSlug: "F", fileSlug: "f", fileName: "f.py", starred: true});
        expect(star.auto).toBeUndefined();
        // And the POST that landed carries the same list.
        expect(harness.posts[0][PROJECT_RUN_CONFIGS_KEY]).toHaveLength(2);
    });

    it("getEffectiveRunConfigs merges localStorage + project starred, deduped by id", async () => {
        const harness = makeProjectSettingsHarness();
        saveRunConfigs("F", "f", {
            configs: [cfg("a", {args: "--local"}), cfg("b")],
            defaultId: null,
        });
        harness.settings = {
            [PROJECT_RUN_CONFIGS_KEY]: [
                // Same id as the local one — the project copy wins fields.
                cfg("a", {starred: true, args: "--project", folderSlug: "F", fileSlug: "f"}),
                cfg("c", {starred: true, folderSlug: "F", fileSlug: "f"}),
                cfg("not-mine", {starred: true, folderSlug: "Elsewhere", fileSlug: "x"}),
            ],
        };
        const eff = await getEffectiveRunConfigs("F", "f", "f.py", "def f():\n    pass\n");
        expect(eff.configs.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
        expect(eff.configs.find((c) => c.id === "a")).toMatchObject({
            starred: true,
            args: "--project",
        });
        // Saved configs exist → no synthesized config, and the detection
        // still reports what static analysis found for the source.
        expect(eff.synthesized).toBeNull();
        expect(eff.detection.kind).toBe("module");
    });

    it("getEffectiveRunConfigs SYNTHESIZES when nothing is saved", async () => {
        makeProjectSettingsHarness();
        const eff = await getEffectiveRunConfigs(
            "F",
            "f",
            "f.py",
            'import argparse\nif __name__ == "__main__":\n    pass\n'
        );
        expect(eff.configs).toEqual([]);
        expect(eff.synthesized).not.toBeNull();
        expect(eff.synthesized!.name).toBe("Main script (argparse)");
        expect(eff.synthesized!.args).toBe("--help");
        expect(eff.detection.kind).toBe("argparse");
    });

    it("getEffectiveRunConfigs synthesizes nothing without a source", async () => {
        makeProjectSettingsHarness();
        const eff = await getEffectiveRunConfigs("F", "f");
        expect(eff.synthesized).toBeNull();
        expect(eff.detection.kind).toBe("module");
    });
});

/* ==================================================================== */
/*  One-click run (runConfigNow)                                       */

/* ==================================================================== */

/** Minimal CustomEvent double (the node vitest env has no DOM). */
class FakeCustomEvent {
    type: string;
    detail: unknown;
    cancelable: boolean;
    bubbles: boolean;
    defaultPrevented = false;

    constructor(
        type: string,
        init?: { detail?: unknown; cancelable?: boolean; bubbles?: boolean }
    ) {
        this.type = type;
        this.detail = init?.detail;
        this.cancelable = init?.cancelable ?? false;
        this.bubbles = init?.bubbles ?? false;
    }

    preventDefault(): void {
        if (this.cancelable) this.defaultPrevented = true;
    }
}

/** An SSE Response built from event objects (what /api/run streams). */
function sseResponse(events: Array<Record<string, unknown>>): Response {
    const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
    return new Response(stream, {status: 200});
}

describe("runConfigNow", () => {
    it("errors (without running anything) when no script slugs are known", async () => {
        makeProjectSettingsHarness();
        const res = await runConfigNow(cfg("x"));
        expect(res.ok).toBe(false);
        expect(res.error).toContain("folderSlug");
    });

    it("a host listener that preventDefaults takes the run over", async () => {
        const harness = makeProjectSettingsHarness();
        let seenDetail: Record<string, unknown> | null = null;
        vi.stubGlobal("CustomEvent", FakeCustomEvent);
        vi.stubGlobal("window", {
            localStorage: storage,
            dispatchEvent: (e: FakeCustomEvent) => {
                e.preventDefault();
                seenDetail = e.detail as Record<string, unknown>;
                return true;
            },
        });
        const res = await runConfigNow(
            cfg("x", {args: "--flag value", env: "A=1"}),
            {folderSlug: "F", fileSlug: "f"}
        );
        expect(res.hostHandled).toBe(true);
        expect(res.ok).toBe(true);
        // The host got the pre-parsed argv/env exactly as documented.
        expect(seenDetail).toMatchObject({
            folderSlug: "F",
            fileSlug: "f",
            args: ["--flag", "value"],
            env: {A: "1"},
        });
        // And the helper itself ran nothing (no /api/run POST happened).
        expect(harness.posts).toHaveLength(0);
    });

    it("runs directly through POST /api/run and aggregates the SSE stream", async () => {
        const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
        const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
            calls.push({url: String(url), body});
            return sseResponse([
                {type: "start", runId: "r1"},
                {type: "stdout", text: "hello "},
                {type: "stdout", text: "world"},
                {type: "figure", url: "/api/figure/r1/figure_001.png", name: "figure_001.png"},
                {type: "stderr", text: "warn"},
                {type: "end", ok: true, exitCode: 0, durationMs: 123},
            ]);
        });
        vi.stubGlobal("fetch", fetchMock);
        // (window carries only localStorage → the host hook is skipped,
        // which is exactly the no-listener default.)
        const events: string[] = [];
        const res = await runConfigNow(
            cfg("x", {args: "--flag v", env: "A=1", stdin: "data", interpreter: "/usr/bin/python3"}),
            {folderSlug: "F", fileSlug: "f", onEvent: (e) => events.push(e.type)}
        );
        // The body the Run toolbar's doRun would have sent for the same
        // config: folder/file + parsed argv/env/stdin/interpreter.
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("/api/run");
        expect(calls[0].body).toEqual({
            folder: "F",
            file: "f",
            args: ["--flag", "v"],
            env: {A: "1"},
            stdin: "data",
            interpreter: "/usr/bin/python3",
        });
        // …and the aggregated outcome of the streamed events.
        expect(res.ok).toBe(true);
        expect(res.exitCode).toBe(0);
        expect(res.stdout).toBe("hello world");
        expect(res.stderr).toBe("warn");
        expect(res.figures).toEqual(["/api/figure/r1/figure_001.png"]);
        expect(res.durationMs).toBe(123);
        expect(events).toEqual(["start", "stdout", "stdout", "figure", "stderr", "end"]);
    });

    it("reports HTTP-level failures without throwing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({error: "boom"}), {status: 500}))
        );
        const res = await runConfigNow(cfg("x"), {folderSlug: "F", fileSlug: "f"});
        expect(res.ok).toBe(false);
        expect(res.error).toBe("boom");
    });

    it("reports transport failures without throwing", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("offline");
            })
        );
        const res = await runConfigNow(cfg("x"), {folderSlug: "F", fileSlug: "f"});
        expect(res.ok).toBe(false);
        expect(res.error).toBe("offline");
    });
});
