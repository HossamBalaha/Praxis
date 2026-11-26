/**
 * pyright-lsp.test.ts — the sidecar LIFECYCLE suite.
 *
 * These tests run against a REAL child process: the mock langserver
 * fixture (fixtures/mock-langserver.mjs) spawned through the same
 * framing and JSON-RPC plumbing the real pyright uses. That makes them
 * honest about process behavior (spawn, pipes, exit events, timing)
 * without requiring pyright itself to be installed.
 *
 * Covered, per the Phase 3 contract:
 *   - launch resolution ladder + the unavailable fallback (no crash)
 *   - spawn → initialize handshake → ready, with serverVersion read
 *   - hover/definition/references/rename roundtrips after document sync
 *   - didChange COALESCING (a burst of syncs → ONE notification)
 *   - immediate sync before a request (ordering guarantee)
 *   - publishDiagnostics → the cached, versioned diagnostics
 *   - request TIMEOUT → null result, server stays usable (late
 *     responses dropped by unknown id)
 *   - server CRASH → failed + backoff → on-demand restart works and
 *     bumps the generation
 *   - repeated crashes → unavailable (the give-up budget)
 *   - INTERPRETER CHANGE → clean restart against the new pythonPath
 *   - shutdown() kills the process and clears all state
 *   - the globalThis singleton is stable across calls
 */
import {afterEach, describe, expect, it} from "vitest";
import {fileURLToPath} from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {getPyrightLspManager, PyrightLspManager} from "@/lib/pyright-lsp";

// The fixture, launched via process.execPath (a .mjs entry).
const FIXTURE = fileURLToPath(new URL("./fixtures/mock-langserver.mjs", import.meta.url));

/** A temp log file path unique per call. */
function newLogPath(): string {
    // A fresh file under the OS temp dir.
    return path.join(os.tmpdir(), `mock-langserver-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

/** Read + parse the fixture's JSONL log. */
function readLog(logPath: string): Array<Record<string, unknown>> {
    // Absent log = no messages.
    try {
        // Read + parse every line.
        return fs.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch {
        // Nothing logged yet.
        return [];
    }
}

/** Poll until the predicate holds (or fail after `timeoutMs`). */
async function waitFor(what: string, predicate: () => boolean, timeoutMs = 4000): Promise<void> {
    // The deadline.
    const deadline = Date.now() + timeoutMs;
    // Poll loop.
    for (; ;) {
        // Hold?
        if (predicate()) return;
        // Out of time?
        if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
        // Small sleep.
        await new Promise((r) => setTimeout(r, 15));
    }
}

/** A real-ish python file for the document fixtures. */
const SAMPLE_TEXT = [
    "import os",
    "",
    "def mock_symbol(value):",
    '    """A docstring."""',
    "    return mock_symbol(value)",
].join("\n");

/** The default test manager: fast timings, fixture launch via env. */
function newManager(overrides?: {
    env?: Record<string, string>;
    requestTimeoutMs?: number;
    maxAutoRestarts?: number;
    backoffMs?: number
}): PyrightLspManager {
    // A log file for this manager's fixture.
    const logPath = newLogPath();
    // Build the env: PRAXIS_PYRIGHT_PATH points at the fixture.
    const env = {
        ...process.env,
        PRAXIS_PYRIGHT_PATH: FIXTURE,
        MOCK_LOG: logPath,
        ...overrides?.env,
    } as unknown as NodeJS.ProcessEnv;
    // The manager with test timings.
    const manager = new PyrightLspManager({
        env,
        projectRoot: os.tmpdir(),
        initTimeoutMs: 4000,
        requestTimeoutMs: overrides?.requestTimeoutMs ?? 1200,
        coalesceMs: 15,
        backoffMs: overrides?.backoffMs ?? 150,
        maxAutoRestarts: overrides?.maxAutoRestarts ?? 3,
        negativeProbeTtlMs: 200,
    });
    // Stash the log path on the instance for the test to read.
    (manager as unknown as { __logPath: string }).__logPath = logPath;
    // Hand it back.
    return manager;
}

/** The log path stashed by newManager. */
function logOf(manager: PyrightLspManager): string {
    // Straight read of the stash.
    return (manager as unknown as { __logPath: string }).__logPath;
}

/** A stable document uri for a manager. */
const DOC_URI = "file:///workspace/demo/mock_file.py";

// Every manager created in a test, stopped afterwards.
const managers: PyrightLspManager[] = [];

afterEach(async () => {
    // Stop every manager this test created.
    for (const m of managers.splice(0)) {
        // Best-effort clean stop.
        await m.stop("test teardown");
    }
});

describe("PyrightLspManager — launch resolution", () => {
    it("falls back to unavailable when the launch command cannot be resolved", async () => {
        // A manager pointed at a nonexistent entry, with an empty PATH so
        // the PATH candidate cannot rescue it on any machine.
        const manager = newManager({
            env: {
                PRAXIS_PYRIGHT_PATH: "/nonexistent/pyright-lsp.js",
                PATH: "/nonexistent-path-dir"
            }
        });
        // Register for teardown.
        managers.push(manager);
        // ensure must NOT throw — it reports unusability.
        const ok = await manager.ensure();
        // Not usable.
        expect(ok).toBe(false);
        // The snapshot says unavailable with a reason.
        const status = manager.getStatus();
        expect(status.state).toBe("unavailable");
        expect(status.available).toBe(false);
        expect(status.reason).toContain("pyright-langserver not found");
    });

    it("prefers the explicit env entry over node_modules and PATH", () => {
        // A manager with the fixture configured.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Resolve without spawning.
        const plan = manager.resolveLaunch();
        // The env entry won, launched through process.execPath.
        expect(plan).not.toBeNull();
        expect(plan!.command).toBe(process.execPath);
        expect(plan!.args[0]).toBe(FIXTURE);
        expect(plan!.source).toBe("env");
    });

    it("resolves the local node_modules entry when no env override exists", () => {
        // A fake node_modules entry in a temp project root.
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxis-lsp-root-"));
        // The pyright entry layout.
        const entry = path.join(root, "node_modules", "pyright", "langserver.index.js");
        // Create it.
        fs.mkdirSync(path.dirname(entry), {recursive: true});
        fs.writeFileSync(entry, "// stub\n", "utf-8");
        // A manager WITHOUT the env override but with that project root.
        const manager = new PyrightLspManager({env: {...process.env, PRAXIS_PYRIGHT_PATH: ""}, projectRoot: root});
        // Register for teardown.
        managers.push(manager);
        // Resolve.
        const plan = manager.resolveLaunch();
        // The node_modules entry won.
        expect(plan!.source).toBe("node-modules");
        expect(plan!.args[0]).toBe(entry);
        // Clean the temp root.
        fs.rmSync(root, {recursive: true, force: true});
    });
});

describe("PyrightLspManager — start / handshake / features", () => {
    it("spawns, handshakes, and reaches ready", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Start it.
        const ok = await manager.ensure();
        // Started fine.
        expect(ok).toBe(true);
        // The status reflects the handshake.
        const status = manager.getStatus();
        expect(status.state).toBe("ready");
        expect(status.ready).toBe(true);
        expect(status.available).toBe(true);
        expect(status.serverVersion).toBe("1.2.3");
        expect(status.processAlive).toBe(true);
        expect(status.generation).toBe(1);
        // The fixture logged the initialize request.
        const entries = readLog(logOf(manager));
        expect(entries.some((e) => e.method === "initialize")).toBe(true);
    });

    it("answers hover with the current document text synced", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Ready.
        await manager.ensure();
        // Hover on line 2 (the def line) column 5.
        const result = (await manager.hover({uri: DOC_URI, text: SAMPLE_TEXT}, 2, 5)) as {
            contents?: { value?: string }
        } | null;
        // The mock hover came back.
        expect(result).not.toBeNull();
        expect(result!.contents?.value).toContain("mock_hover");
        // The document was opened on the server.
        const entries = readLog(logOf(manager));
        expect(entries.some((e) => e.type === "didOpen" && e.uri === DOC_URI)).toBe(true);
    });

    it("answers definition, references, prepareRename and rename", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Ready + the document open.
        await manager.ensure();
        // The shared doc handle.
        const doc = {uri: DOC_URI, text: SAMPLE_TEXT};
        // Definition.
        const def = (await manager.definition(doc, 2, 5)) as Array<{ uri: string }> | null;
        expect(Array.isArray(def)).toBe(true);
        expect(def![0]!.uri).toBe(DOC_URI);
        // References.
        const refs = (await manager.references(doc, 2, 5)) as Array<{ uri: string }> | null;
        expect(refs!.length).toBeGreaterThanOrEqual(2);
        // prepareRename.
        const prep = (await manager.prepareRename(doc, 2, 5)) as { placeholder?: string } | null;
        expect(prep!.placeholder).toBe("mock_symbol");
        // rename.
        const ren = (await manager.rename(doc, 2, 5, "new_name")) as { changes?: Record<string, unknown[]> } | null;
        expect(Object.keys(ren!.changes!)).toContain(DOC_URI);
    });
});

describe("PyrightLspManager — didChange coalescing (the debounce invariant)", () => {
    it("collapses a burst of syncs into ONE didChange notification", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Ready + first sync (a didOpen).
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: SAMPLE_TEXT});
        // A rapid burst of edits (NO immediate flag → coalesced).
        for (let i = 1; i <= 6; i++) {
            // Each edit appends a line.
            manager.syncDocument({uri: DOC_URI, text: SAMPLE_TEXT + "\n# edit " + i});
        }
        // Let the 15ms coalesce window fire.
        await new Promise((r) => setTimeout(r, 120));
        // Count the didChange notifications the server saw.
        const changes = readLog(logOf(manager)).filter((e) => e.type === "didChange");
        // SIX rapid posts → exactly ONE notification.
        expect(changes.length).toBe(1);
        // It carried the LATEST text.
        expect(changes[0]!.length).toBe((SAMPLE_TEXT + "\n# edit 6").length);
    });

    it("flushes the pending change IMMEDIATELY before a request", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Ready + first sync.
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: SAMPLE_TEXT});
        // A pending (coalesced) edit…
        manager.syncDocument({uri: DOC_URI, text: SAMPLE_TEXT + "\n# pending edit"});
        // …then a request touching the SAME document (forces the flush).
        await manager.hover({uri: DOC_URI, text: SAMPLE_TEXT + "\n# pending edit"}, 1, 1);
        // The didChange was sent BEFORE the hover request.
        const entries = readLog(logOf(manager));
        const changeIdx = entries.findIndex((e) => e.type === "didChange");
        const hoverIdx = entries.findIndex((e) => e.method === "textDocument/hover");
        // Both happened, in the right order.
        expect(changeIdx).toBeGreaterThanOrEqual(0);
        expect(hoverIdx).toBeGreaterThan(changeIdx);
    });
});

describe("PyrightLspManager — diagnostics", () => {
    it("caches published diagnostics with a bumping version", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Ready + a document carrying the diagnostics marker.
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: "# PUBLISH_DIAG\nmock_symbol = 1\n"});
        // The publish arrives asynchronously.
        await waitFor("diagnostics to publish", () => manager.getDiagnostics(DOC_URI) !== null);
        // The cached diagnostics.
        const cached = manager.getDiagnostics(DOC_URI)!;
        // Two typed diagnostics from the fixture.
        expect(cached.diagnostics.length).toBe(2);
        expect(cached.diagnostics[0]!.severity).toBe(1);
        expect(cached.diagnostics[0]!.code).toBe("reportGeneralTypeIssues");
        // The version is 1 (first publish).
        expect(cached.version).toBe(1);
        // A changed document republishes with version 2.
        manager.syncDocument({uri: DOC_URI, text: "# PUBLISH_DIAG\nmock_symbol = 2\n", immediate: true});
        // Await the new publish.
        await waitFor("diagnostics version 2", () => (manager.getDiagnostics(DOC_URI)?.version ?? 0) >= 2);
    });

    it("clears diagnostics on closeDocument", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Ready + marker document.
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: "# PUBLISH_DIAG\nmock_symbol = 1\n"});
        // Await the publish.
        await waitFor("diagnostics to publish", () => manager.getDiagnostics(DOC_URI) !== null);
        // Close the document.
        manager.closeDocument(DOC_URI);
        // The cache is gone.
        expect(manager.getDiagnostics(DOC_URI)).toBeNull();
        // The server saw the close (async pipe — poll for the log entry).
        await waitFor("didClose to reach the server", () => readLog(logOf(manager)).some((e) => e.method === "textDocument/didClose"));
    });
});

describe("PyrightLspManager — request timeouts", () => {
    it("returns null on timeout WITHOUT killing the server, and drops late responses", async () => {
        // A manager whose fixture delays hover responses.
        const manager = newManager({env: {MOCK_DELAY_MS: "250"}, requestTimeoutMs: 80});
        // Register for teardown.
        managers.push(manager);
        // Ready.
        await manager.ensure();
        // The document.
        const doc = {uri: DOC_URI, text: SAMPLE_TEXT};
        // The hover times out.
        const timedOut = await manager.hover(doc, 2, 5);
        // A null result signals the fallback path.
        expect(timedOut).toBeNull();
        // The server is STILL ready.
        expect(manager.getStatus().state).toBe("ready");
        // Let the late response arrive (it must be dropped, not crash).
        await new Promise((r) => setTimeout(r, 300));
        // A fresh request still works.
        const refs = (await manager.references(doc, 2, 5)) as Array<{ uri: string }> | null;
        expect(refs!.length).toBeGreaterThanOrEqual(2);
        expect(manager.getStatus().state).toBe("ready");
    });
});

describe("PyrightLspManager — crash handling and restarts", () => {
    it("detects a crash, backs off, and restarts on demand", async () => {
        // The manager under test (fast backoff).
        const manager = newManager({backoffMs: 150});
        // Register for teardown.
        managers.push(manager);
        // Ready (generation 1).
        await manager.ensure();
        const gen1 = manager.getStatus().generation;
        // Open the kill-marker document.
        manager.syncDocument({uri: DOC_URI, text: "# KILL_SERVER\n"});
        // The crash lands as state=failed.
        await waitFor("crash to be detected", () => manager.getStatus().state === "failed", 3000);
        // The failure detail mentions the exit.
        const failed = manager.getStatus();
        expect(failed.ready).toBe(false);
        expect(failed.reason).toContain("exited unexpectedly");
        expect(failed.restarts).toBe(1);
        expect(failed.processAlive).toBe(false);
        // An immediate ensure is refused (backoff window).
        const immediate = await manager.ensure();
        expect(immediate).toBe(false);
        // After the backoff, a restart succeeds.
        await new Promise((r) => setTimeout(r, 250));
        const restarted = await manager.ensure();
        expect(restarted).toBe(true);
        // The generation bumped — clients know to re-sync.
        expect(manager.getStatus().generation).toBe(gen1 + 1);
        // Serving real traffic opens a FRESH incident: the next crash
        // restarts the streak at 1 instead of accumulating to the budget.
        const hover = await manager.hover({uri: DOC_URI, text: SAMPLE_TEXT}, 2, 5);
        expect(hover).not.toBeNull();
        // Crash again (this server HAS served).
        manager.syncDocument({uri: DOC_URI, text: "# KILL_SERVER\n"});
        await waitFor("second crash", () => manager.getStatus().state === "failed", 3000);
        // A fresh incident, not a streak of 2.
        expect(manager.getStatus().restarts).toBe(1);
    });

    it("gives up (unavailable) after the crash budget is exhausted", async () => {
        // A manager with a 2-crash budget and short backoff.
        const manager = newManager({maxAutoRestarts: 2, backoffMs: 60});
        // Register for teardown.
        managers.push(manager);
        // Crash 1.
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: "# KILL_SERVER\n"});
        await waitFor("first crash", () => manager.getStatus().state === "failed", 3000);
        // Past the backoff.
        await new Promise((r) => setTimeout(r, 120));
        // Restart + crash 2.
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: "# KILL_SERVER\n"});
        // The budget is spent here, so the state may land directly on
        // `unavailable` without passing through `failed`.
        await waitFor("second crash", () => manager.getStatus().state !== "ready" && manager.getStatus().state !== "starting", 3000);
        // Past the backoff again.
        await new Promise((r) => setTimeout(r, 120));
        // The budget is spent — unavailable, no more restarts.
        const ok = await manager.ensure();
        expect(ok).toBe(false);
        expect(manager.getStatus().state).toBe("unavailable");
        expect(manager.getStatus().reason).toContain("gave up");
    });
});

describe("PyrightLspManager — interpreter changes", () => {
    it("restarts against the new pythonPath and bumps the generation", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Start with interpreter A.
        await manager.ensure("/venvs/alpha/bin/python");
        // Record the generation.
        const gen1 = manager.getStatus().generation;
        // Switch to interpreter B.
        await manager.ensure("/venvs/beta/bin/python");
        // A new generation.
        expect(manager.getStatus().generation).toBe(gen1 + 1);
        // The running config records interpreter B.
        expect(manager.getStatus().pythonPath).toBe("/venvs/beta/bin/python");
        // The fixture logged BOTH handshakes with their pythonPaths.
        const inits = readLog(logOf(manager)).filter((e) => e.type === "initialize-options");
        expect(inits.length).toBe(2);
        expect(inits[0]!.pythonPath).toBe("/venvs/alpha/bin/python");
        expect(inits[1]!.pythonPath).toBe("/venvs/beta/bin/python");
    });

    it("keeps the running server when the interpreter is unchanged", async () => {
        // The manager under test.
        const manager = newManager();
        // Register for teardown.
        managers.push(manager);
        // Start with interpreter A.
        await manager.ensure("/venvs/alpha/bin/python");
        // The generation after the first start.
        const gen1 = manager.getStatus().generation;
        // ensure with the SAME interpreter.
        await manager.ensure("/venvs/alpha/bin/python");
        // No restart happened.
        expect(manager.getStatus().generation).toBe(gen1);
        expect(readLog(logOf(manager)).filter((e) => e.type === "initialize-options").length).toBe(1);
    });
});

describe("PyrightLspManager — shutdown", () => {
    it("stops the process cleanly and clears all state", async () => {
        // The manager under test.
        const manager = newManager();
        // Start + open a document.
        await manager.ensure();
        manager.syncDocument({uri: DOC_URI, text: SAMPLE_TEXT});
        // The clean stop.
        await manager.stop("test shutdown");
        // State is stopped, no child.
        const status = manager.getStatus();
        expect(status.state).toBe("stopped");
        expect(status.processAlive).toBe(false);
        expect(status.ready).toBe(false);
        // Documents and diagnostics were cleared.
        expect(manager.getDiagnostics(DOC_URI)).toBeNull();
        // The fixture logged its spec-clean exit.
        await waitFor("fixture exit log", () => readLog(logOf(manager)).some((e) => e.type === "exit"), 2000);
        // A further ensure can start it again (stop is not unavailable).
        const ok = await manager.ensure();
        expect(ok).toBe(true);
    });

    it("stop() is safe on a never-started manager", async () => {
        // A manager with an unusable launch path.
        const manager = newManager({env: {PRAXIS_PYRIGHT_PATH: "/nonexistent/pyright.js"}});
        // Register for teardown.
        managers.push(manager);
        // Stopping the unstarted manager must not throw.
        await expect(manager.stop("never started")).resolves.toBeUndefined();
        expect(manager.getStatus().state).toBe("stopped");
    });
});

describe("getPyrightLspManager — the singleton", () => {
    it("returns the same instance across calls", () => {
        // Two calls, one instance.
        expect(getPyrightLspManager()).toBe(getPyrightLspManager());
    });
});
