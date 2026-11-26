/**
 * pyright-lsp.ts — the Pyright language-server SIDECAR process manager.
 *
 * Praxis runs pyright as a child `pyright-langserver --stdio` process
 * and speaks JSON-RPC over its pipes (framing: src/lib/lsp-jsonrpc.ts).
 * This module owns EVERYTHING about that process's life:
 *
 *   ── Launch resolution (the availability ladder) ───────────────────
 *   1. $PRAXIS_PYRIGHT_PATH — an explicit .js entry (spawned through
 *      process.execPath, so it works on Windows where .cmd shims need
 *      a shell) or a direct executable.
 *   2. <projectRoot>/node_modules/pyright/langserver.index.js — the
 *      entry `bun add -d pyright` provides, again via process.execPath.
 *   3. A bare `pyright-langserver` on PATH (POSIX).
 *   When none resolves, the manager reports `unavailable` and every
 *   consumer falls back to the existing regex/AST-lite machinery —
 *   a missing pyright must degrade features, never crash the IDE.
 *   A failed resolution is NEGATIVE-CACHED for 30 s so requests do not
 *   re-probe (and re-fail) on every keystroke.
 *
 *   ── Lifecycle states ──────────────────────────────────────────────
 *   stopped → starting → ready → (crash) failed → starting → …
 *                     ↘ unavailable (launch unresolvable, or the
 *                        server died MAX_AUTO_RESTARTS times)
 *   `shutdown()` (user closes the IDE / interpreter switch) → stopped.
 *
 *   ── Safety invariants (all unit-tested against a mock server) ────
 *   - No shell anywhere in the spawn (no injection, no .cmd parsing).
 *   - windowsHide: the sidecar never flashes a console window.
 *   - The initialize handshake carries processId, so pyright self-
 *     terminates if the Praxis server dies (no orphan sidecars).
 *   - process exit / SIGINT / SIGTERM hooks SIGKILL the child.
 *   - Crash restarts back off (BACKOFF_MS) and stop after
 *     MAX_AUTO_RESTARTS consecutive failures (→ unavailable).
 *   - Every request has a timeout; a timed-out request NEVER kills the
 *     server (pyright can be slow on huge files) — the response, when
 *     it eventually arrives, is dropped by its unknown id.
 *   - Interpreter changes RESTART the server (pyright resolves types
 *     against pythonPath), bumping `generation` so clients re-sync.
 *
 *   ── Document sync ─────────────────────────────────────────────────
 *   Full-text sync: didOpen on first sight, didChange with the whole
 *   buffer afterwards. Coalesced per document (COALESCE_MS) so a burst
 *   of HTTP posts during fast typing produces ONE notification; any
 *   request touching the document flushes the pending change first
 *   (LSP over one stdio pipe is strictly ordered, so the request is
 *   guaranteed to see the flushed text).
 *
 *   ── The singleton ─────────────────────────────────────────────────
 *   One manager per server process, pinned on globalThis (HMR-proof).
 *   `getPyrightLspManager()` is what routes use; `reset…ForTests()`
 *   swaps in a fresh instance for the lifecycle suite.
 */

import {type ChildProcess, spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {encodeLspMessage, LspMessageDecoder} from "@/lib/lsp-jsonrpc";

// ── Public types ─────────────────────────────────────────────────────

/** The sidecar's coarse lifecycle state. */
export type PyrightLspState = "stopped" | "starting" | "ready" | "failed" | "unavailable";

/** The status snapshot every consumer sees (JSON-serializable). */
export interface PyrightLspStatus {
    /** Current lifecycle state. */
    state: PyrightLspState;
    /** True when the sidecar is usable RIGHT NOW. */
    ready: boolean;
    /** True when the sidecar is believed STARTABLE (not `unavailable`). */
    available: boolean;
    /** Human-readable explanation for any non-ready state. */
    reason: string | null;
    /** The pyright version the handshake reported (serverInfo.version). */
    serverVersion: string | null;
    /** The interpreter the running server was configured with. */
    pythonPath: string | null;
    /** Bumped on every (re)start — clients re-sync documents on change. */
    generation: number;
    /** Crash-driven restarts since the last successful start. */
    restarts: number;
    /** Epoch ms of the last successful handshake. */
    startedAt: number | null;
    /** True while a child process is attached (exposed for health). */
    processAlive: boolean;
}

/** One raw LSP diagnostic as pyright publishes it (positions 0-based). */
export interface RawLspDiagnostic {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    severity: number;
    code?: string | number;
    message: string;
}

/** The cached diagnostics for one document. */
export interface RawLspDiagnostics {
    diagnostics: RawLspDiagnostic[];
    /** Monotonic per-uri version — bumped on every publish. */
    version: number;
}

/** A resolved launch description (command + argv prefix). */
interface LaunchPlan {
    command: string;
    args: string[];
    /** How the plan was found (for the status `reason`). */
    source: "env" | "node-modules" | "path";
}

// ── Tunables (constructor-overridable for the test suite) ───────────

export interface PyrightLspManagerOptions {
    /** Directory whose node_modules is probed (default: process.cwd()). */
    projectRoot?: string;
    /** Timeout for the initialize handshake. */
    initTimeoutMs?: number;
    /** Timeout for individual requests. */
    requestTimeoutMs?: number;
    /** Server-side didChange coalescing window. */
    coalesceMs?: number;
    /** Crash-restart backoff window. */
    backoffMs?: number;
    /** Consecutive crash restarts before giving up (unavailable). */
    maxAutoRestarts?: number;
    /** TTL for a failed launch resolution. */
    negativeProbeTtlMs?: number;
    /** Environment override (tests inject PRAXIS_PYRIGHT_PATH). */
    env?: NodeJS.ProcessEnv;
}

const DEFAULT_INIT_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_COALESCE_MS = 120;
const DEFAULT_BACKOFF_MS = 2_000;
const DEFAULT_MAX_AUTO_RESTARTS = 3;
const DEFAULT_NEGATIVE_PROBE_TTL_MS = 30_000;

/** The pyright npm entry that `bun add -d pyright` installs. */
const NODE_MODULES_ENTRY = "pyright/langserver.index.js";

// ── The manager ──────────────────────────────────────────────────────

/**
 * Owns the pyright child process, the JSON-RPC correlation, document
 * sync and the diagnostics cache. One instance per server process.
 */
export class PyrightLspManager {
    /** True once the global kill-hooks are installed (per process). */
    private static exitHooksInstalled = false;
    // Tunables (defaults above, test overrides via the constructor).
    private readonly projectRoot: string;
    private readonly initTimeoutMs: number;
    private readonly requestTimeoutMs: number;
    private readonly coalesceMs: number;
    private readonly backoffMs: number;
    private readonly maxAutoRestarts: number;
    private readonly negativeProbeTtlMs: number;
    private readonly env: NodeJS.ProcessEnv;
    // Lifecycle state.
    private state: PyrightLspState = "stopped";
    private stateReason: string | null = null;
    private serverVersion: string | null = null;
    private pythonPath: string | null = null;
    private generation = 0;
    private restarts = 0;
    private startedAt: number | null = null;
    private negativeProbeUntil = 0;
    private restartBackoffUntil = 0;
    // True once this server instance answered a FEATURE request (hover /
    // definition / …). A handshake alone proves nothing — a server that
    // crashes before serving anything counts against the crash budget,
    private intentionalStop = false;
    // while one that served real traffic gets its budget forgiven.
    private servedSinceStart = false;
    // The child process and its plumbing.
    private child: ChildProcess | null = null;
    private decoder: LspMessageDecoder | null = null;
    private stderrTail: string = "";
    // JSON-RPC correlation.
    private nextRequestId = 1;
    private readonly pending = new Map<number, {
        resolve: (v: unknown) => void;
        reject: (e: Error) => void;
        timer: ReturnType<typeof setTimeout>
    }>();
    // The in-flight start (so concurrent ensure() calls share one spawn).
    private startingPromise: Promise<boolean> | null = null;
    // Document sync state.
    private readonly documents = new Map<string, { languageId: string; text: string; version: number }>();
    private readonly pendingChanges = new Map<string, string>();
    private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
    // Diagnostics pushed by the server.
    private readonly diagnostics = new Map<string, RawLspDiagnostics>();
    private readonly diagnosticsVersions = new Map<string, number>();

    // ── Status ────────────────────────────────────────────────────────

    constructor(options?: PyrightLspManagerOptions) {
        // Resolve every tunable with its default.
        this.projectRoot = options?.projectRoot ?? process.cwd();
        this.initTimeoutMs = options?.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
        this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        this.coalesceMs = options?.coalesceMs ?? DEFAULT_COALESCE_MS;
        this.backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS;
        this.maxAutoRestarts = options?.maxAutoRestarts ?? DEFAULT_MAX_AUTO_RESTARTS;
        this.negativeProbeTtlMs = options?.negativeProbeTtlMs ?? DEFAULT_NEGATIVE_PROBE_TTL_MS;
        this.env = options?.env ?? process.env;
    }

    // ── Launch resolution ─────────────────────────────────────────────

    /** A pure snapshot of the lifecycle state (never spawns). */
    public getStatus(): PyrightLspStatus {
        // Compose the serializable status.
        return {
            state: this.state,
            ready: this.state === "ready",
            available: this.state !== "unavailable",
            reason: this.stateReason,
            serverVersion: this.serverVersion,
            pythonPath: this.pythonPath,
            generation: this.generation,
            restarts: this.restarts,
            startedAt: this.startedAt,
            processAlive: this.child !== null && this.child.exitCode === null && this.child.signalCode === null,
        };
    }

    /**
     * Resolve how pyright would be launched, or null when it cannot be.
     * Pure probing — no spawn. Exported for unit tests.
     */
    public resolveLaunch(): LaunchPlan | null {
        // 1. The explicit override.
        const envPath = (this.env.PRAXIS_PYRIGHT_PATH ?? "").trim();
        if (envPath) {
            // A JS entry runs through the current Node/Bun binary — the
            // cross-platform way (no .cmd shim, no shell).
            if (/\.(js|cjs|mjs)$/i.test(envPath)) {
                // Only when the file actually exists.
                if (fs.existsSync(envPath)) {
                    return {command: process.execPath, args: [envPath], source: "env"};
                }
            } else {
                // A direct executable (a bin path, e.g. from `pip install
                // pyright`): must exist AND be executable.
                try {
                    // Access probe (X_OK).
                    fs.accessSync(envPath, fs.constants.X_OK);
                    return {command: envPath, args: [], source: "env"};
                } catch {
                    // Fall through to the next candidate.
                }
            }
        }
        // 2. The local node_modules entry (what `bun add -d pyright`
        //    installs) — again via process.execPath.
        const localEntry = path.join(this.projectRoot, "node_modules", NODE_MODULES_ENTRY);
        if (fs.existsSync(localEntry)) {
            return {command: process.execPath, args: [localEntry], source: "node-modules"};
        }
        // 3. A bare pyright-langserver on PATH (POSIX: the shebang script
        //    the npm/pip installs expose). Windows cannot exec these
        //    without a shell, so win32 skips this candidate entirely.
        if (process.platform !== "win32" && this.commandOnPath("pyright-langserver")) {
            return {command: "pyright-langserver", args: [], source: "path"};
        }
        // Nothing resolved.
        return null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    /**
     * Ensure a READY server: start it when stopped/failed, await an
     * in-flight start, and RESTART when `pythonPath` differs from the
     * running configuration. Returns false when the sidecar is (now)
     * unavailable — callers fall back without throwing.
     */
    public async ensure(pythonPath?: string): Promise<boolean> {
        // An explicit interpreter always wins over the running config.
        const requested = pythonPath?.trim() || null;
        // Ready with the SAME interpreter — nothing to do.
        if (this.state === "ready" && requested === this.pythonPath) return true;
        // Ready with a DIFFERENT interpreter — restart against the new env.
        if (this.state === "ready" && requested !== null && requested !== this.pythonPath) {
            // A clean stop first (kills the child, clears documents).
            await this.stop("interpreter changed");
            // Continue into the start path below.
        }
        // Within the crash-restart backoff window — refuse for now.
        if ((this.state === "failed") && Date.now() < this.restartBackoffUntil) return false;
        // Already starting — everyone awaits the same spawn.
        if (this.startingPromise) return this.startingPromise;
        // Hard-unavailable within the negative-probe TTL.
        if (this.state === "unavailable" && Date.now() < this.negativeProbeUntil) return false;
        // Start (or restart) now.
        this.startingPromise = this.start(requested);
        try {
            // Await the handshake outcome.
            return await this.startingPromise;
        } finally {
            // Clear the shared promise either way.
            this.startingPromise = null;
        }
    }

    /**
     * Cleanly stop the sidecar: shutdown → exit → SIGKILL escalation.
     * Documents and diagnostics are cleared; `reason` names the trigger.
     * Safe to call at ANY lifecycle point (even mid-handshake).
     */
    public async stop(reason: string): Promise<void> {
        // Mark the stop intentional so the exit handler stays quiet.
        this.intentionalStop = true;
        // Ask for a spec-clean shutdown (best-effort, 1.5s budget).
        if (this.child && this.state === "ready") {
            try {
                await this.request("shutdown", null, 1500);
            } catch {
                /* the kill below is the real guarantee */
            }
            // Then the exit notification.
            try {
                this.notify("exit", null);
            } catch {
                /* stdin may already be gone */
            }
            // Give the child a brief GRACE PERIOD to process the exit and
            // die on its own — SIGKILL cannot be caught, so killing first
            // would deny the child its exit handlers (and our test proof).
            await this.awaitChildExit(400);
        }
        // Kill whatever remains (idempotent) — this also rejects any
        // still-pending requests through the instance-guarded exit path.
        this.killChild();
        // Reject anything the exit path could not (no child event will
        // fire once the reference is dropped).
        for (const [, entry] of this.pending) {
            // Stop the timer.
            clearTimeout(entry.timer);
            // Reject with the stop reason.
            entry.reject(new Error(`pyright manager stopped: ${reason}`));
        }
        // Drop the correlation map.
        this.pending.clear();
        // Normalize state.
        this.state = "stopped";
        this.stateReason = reason;
        // Drop everything the old server owned.
        this.documents.clear();
        this.pendingChanges.clear();
        this.diagnostics.clear();
        this.diagnosticsVersions.clear();
        this.serverVersion = null;
        this.pythonPath = null;
    }

    /**
     * Sync one document towards the server. First sight → didOpen; a
     * text change → didChange (coalesced unless `immediate`); a change
     * that must be visible to the NEXT request → `immediate: true`.
     */
    public syncDocument(doc: { uri: string; text: string; languageId?: string; immediate?: boolean }): void {
        // Ignore sync attempts while not ready.
        if (this.state !== "ready") return;
        // The tracked document (if any).
        const existing = this.documents.get(doc.uri);
        // First sight → didOpen.
        if (!existing) {
            // Track it.
            this.documents.set(doc.uri, {languageId: doc.languageId ?? "python", text: doc.text, version: 1});
            // Open it on the server.
            this.notify("textDocument/didOpen", {
                textDocument: {uri: doc.uri, languageId: doc.languageId ?? "python", version: 1, text: doc.text},
            });
            // Done — an open IS the current text.
            return;
        }
        // Same text — nothing to send.
        if (existing.text === doc.text) return;
        // An immediate flush sends the didChange right now.
        if (doc.immediate) {
            // Drop any coalesced pending change for this uri.
            this.pendingChanges.delete(doc.uri);
            // Track the new text.
            const version = existing.version + 1;
            this.documents.set(doc.uri, {...existing, text: doc.text, version});
            // Send the full-text change.
            this.notify("textDocument/didChange", {
                textDocument: {uri: doc.uri, version},
                contentChanges: [{text: doc.text}],
            });
            // Done.
            return;
        }
        // Coalesced path: remember the latest text for this uri.
        this.pendingChanges.set(doc.uri, doc.text);
        // Arm the single flush timer when it is not already armed.
        if (this.coalesceTimer === null) {
            // The window.
            this.coalesceTimer = setTimeout(() => {
                // Disarm.
                this.coalesceTimer = null;
                // Flush every pending change (one didChange per uri).
                this.flushPendingChanges();
            }, this.coalesceMs);
        }
    }

    /** Close a document on the server and forget its diagnostics. */
    public closeDocument(uri: string): void {
        // Drop any coalesced change for it.
        this.pendingChanges.delete(uri);
        // Forget the tracking.
        const existing = this.documents.get(uri);
        // Unknown document — nothing to close.
        if (!existing) return;
        // Stop tracking.
        this.documents.delete(uri);
        // Tell the server.
        this.notify("textDocument/didClose", {textDocument: {uri}});
        // Drop the cached diagnostics too.
        this.diagnostics.delete(uri);
        this.diagnosticsVersions.delete(uri);
    }

    /** Forget EVERY document (used by the interpreter-change restart). */
    public clearDocuments(): void {
        // Drop pending changes.
        this.pendingChanges.clear();
        // Close each tracked document on the server.
        for (const uri of [...this.documents.keys()]) {
            // Reuse the single-document close.
            this.closeDocument(uri);
        }
    }

    /** textDocument/hover at a 1-based (line, col). */
    public async hover(doc: { uri: string; text: string }, line: number, col: number): Promise<unknown | null> {
        // Delegate to the shared prologue.
        return this.withCurrentDocument(doc, "textDocument/hover", {
            textDocument: {uri: doc.uri},
            position: {line: Math.max(0, line - 1), character: Math.max(0, col - 1)},
        });
    }

    /** textDocument/definition at a 1-based (line, col). */
    public async definition(doc: { uri: string; text: string }, line: number, col: number): Promise<unknown | null> {
        // Delegate to the shared prologue.
        return this.withCurrentDocument(doc, "textDocument/definition", {
            textDocument: {uri: doc.uri},
            position: {line: Math.max(0, line - 1), character: Math.max(0, col - 1)},
        });
    }

    /** textDocument/references at a 1-based (line, col). */
    public async references(doc: { uri: string; text: string }, line: number, col: number): Promise<unknown | null> {
        // Delegate to the shared prologue.
        return this.withCurrentDocument(doc, "textDocument/references", {
            textDocument: {uri: doc.uri},
            position: {line: Math.max(0, line - 1), character: Math.max(0, col - 1)},
            context: {includeDeclaration: true},
        });
    }

    // ── JSON-RPC plumbing ─────────────────────────────────────────────

    /** textDocument/prepareRename at a 1-based (line, col). */
    public async prepareRename(doc: { uri: string; text: string }, line: number, col: number): Promise<unknown | null> {
        // Delegate to the shared prologue.
        return this.withCurrentDocument(doc, "textDocument/prepareRename", {
            textDocument: {uri: doc.uri},
            position: {line: Math.max(0, line - 1), character: Math.max(0, col - 1)},
        });
    }

    /** textDocument/rename at a 1-based (line, col) with a new name. */
    public async rename(doc: {
        uri: string;
        text: string
    }, line: number, col: number, newName: string): Promise<unknown | null> {
        // Delegate to the shared prologue.
        return this.withCurrentDocument(doc, "textDocument/rename", {
            textDocument: {uri: doc.uri},
            position: {line: Math.max(0, line - 1), character: Math.max(0, col - 1)},
            newName,
        });
    }

    /** The cached diagnostics for a uri (null when none arrived yet). */
    public getDiagnostics(uri: string): RawLspDiagnostics | null {
        // Straight map read.
        return this.diagnostics.get(uri) ?? null;
    }

    /** True when `name` exists and is executable in some PATH dir. */
    private commandOnPath(name: string): boolean {
        // The PATH variable (possibly absent).
        const pathVar = (this.env.PATH ?? "").split(path.delimiter).filter(Boolean);
        // Probe every directory.
        for (const dir of pathVar) {
            // The candidate inside this dir.
            const candidate = path.join(dir, name);
            try {
                // Exists AND executable.
                fs.accessSync(candidate, fs.constants.X_OK);
                // Found.
                return true;
            } catch {
                // Try the next dir.
            }
        }
        // Not found anywhere.
        return false;
    }

    // ── Document sync ─────────────────────────────────────────────────

    /** Spawn + handshake. Only `ensure()` calls this. */
    private async start(pythonPath: string | null): Promise<boolean> {
        // Resolve the launch plan.
        const plan = this.resolveLaunch();
        // Nothing launchable — the documented fallback state.
        if (!plan) {
            // Record the state.
            this.state = "unavailable";
            // The reason the UI shows next to "Pyright: off".
            this.stateReason = "pyright-langserver not found — install with `bun add -d pyright` or set PRAXIS_PYRIGHT_PATH";
            // Negative-cache for the TTL so requests stay cheap.
            this.negativeProbeUntil = Date.now() + this.negativeProbeTtlMs;
            // Not usable.
            return false;
        }
        // Entering the handshake phase.
        this.state = "starting";
        this.stateReason = "starting pyright…";
        this.intentionalStop = false;
        this.servedSinceStart = false;
        this.stderrTail = "";
        // Reset per-run correlation state.
        this.nextRequestId = 1;
        // Attempt the spawn (guarded: ENOENT etc. must not throw out).
        try {
            // The one and only spawn — no shell, hidden window, piped stdio.
            this.child = spawn(plan.command, [...plan.args, "--stdio"], {
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
                shell: false,
                env: this.env,
            });
        } catch (err) {
            // The spawn itself failed (bad path, EPERM…).
            this.onLaunchFailure(`failed to spawn pyright: ${(err as Error).message}`);
            // Negative-cache this too.
            this.negativeProbeUntil = Date.now() + this.negativeProbeTtlMs;
            return false;
        }
        // Wire the stdout framing decoder.
        this.decoder = new LspMessageDecoder({
            // Frame-level faults are logged, never fatal.
            onFault: (reason, fragment) => console.debug(`[pyright-lsp] framing fault: ${reason} ${fragment.slice(0, 120)}`),
        });
        // Route decoded messages.
        this.child.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk));
        // Keep a rolling stderr tail for crash diagnostics.
        this.child.stderr?.on("data", (chunk: Buffer) => {
            // Bound the tail at ~4 KB.
            this.stderrTail = (this.stderrTail + chunk.toString("utf-8")).slice(-4096);
        });
        // The exit handler is anchored to THIS child instance, so a
        // replaced child's late events can never clobber the new one's
        // state (signal kills leave exitCode null — an instance check is
        // the only reliable identity test).
        const child = this.child;
        child.on("exit", (code, signal) => this.onChildExit(child, code, signal));
        child.on("error", (err) => this.onChildExit(child, null, `error: ${err.message}`));
        // Kill the sidecar if the SERVER dies (zombie prevention).
        this.installExitHooks();
        // Run the initialize handshake.
        const initialized = await this.handshake(pythonPath);
        // Handshake failed — the failure path already recorded state.
        if (!initialized) return false;
        // Ready.
        this.state = "ready";
        this.stateReason = null;
        this.pythonPath = pythonPath;
        this.startedAt = Date.now();
        this.generation += 1;
        // NOTE: restarts is NOT reset here — a successful handshake proves
        // nothing (the mock proves that handshakes succeed right up to a
        // crash). The budget is forgiven only when the instance SERVES a
        // real feature request (see withCurrentDocument).
        return true;
    }

    /** The initialize request + the `initialized` notification. */
    private async handshake(pythonPath: string | null): Promise<boolean> {
        try {
            // The handshake request (id 1) — carry our pid so pyright
            // self-terminates if Praxis dies.
            const result = (await this.request(
                "initialize",
                {
                    processId: process.pid,
                    clientInfo: {name: "praxis"},
                    capabilities: {},
                    rootUri: null,
                    initializationOptions: {
                        python: pythonPath ? {pythonPath} : undefined,
                    },
                },
                this.initTimeoutMs
            )) as { serverInfo?: { name?: string; version?: string } } | null;
            // A null result means the request failed/timed out — the failure
            // was recorded by the request plumbing or the exit handler.
            if (!result) {
                // A server that answers nothing usable is as broken as one
                // that never answers — record it or state stays "starting".
                this.onLaunchFailure("initialize returned no result");
                return false;
            }
            // Remember the reported version for the status panel.
            this.serverVersion = result.serverInfo?.version ?? null;
            // The mandatory post-initialize notification.
            this.notify("initialized", {});
            return true;
        } catch (err) {
            // Handshake blew up — record and kill the child.
            this.onLaunchFailure(`initialize failed: ${(err as Error).message}`);
            return false;
        }
    }

    /** Record a launch/handshake failure and clean the child up. */
    private onLaunchFailure(reason: string): void {
        // Kill whatever we spawned.
        this.killChild();
        // Decide between "failed" (retryable) and "unavailable" (given up).
        this.restarts += 1;
        // Past the consecutive-failure budget → stop trying.
        if (this.restarts >= this.maxAutoRestarts) {
            // Hard-off for this server process lifetime.
            this.state = "unavailable";
            this.stateReason = `${reason} (gave up after ${this.restarts} attempts)`;
            // A very long negative cache.
            this.negativeProbeUntil = Date.now() + this.negativeProbeTtlMs;
        } else {
            // Retryable — back off first.
            this.state = "failed";
            this.stateReason = reason;
            // The backoff window.
            this.restartBackoffUntil = Date.now() + this.backoffMs;
        }
    }

    /** The child exited (or failed to spawn): reconcile state. */
    private onChildExit(child: ChildProcess, code: number | null, signal: string | null): void {
        // Only the CURRENT child's exit matters — a replaced child's late
        // events must not clobber the new instance's state.
        if (this.child !== child) return;
        // Reject every pending request against the dead server.
        for (const [, entry] of this.pending) {
            // Stop the timeout timer.
            clearTimeout(entry.timer);
            // Reject with a descriptive error.
            entry.reject(new Error("pyright server exited"));
        }
        // Drop the correlation map.
        this.pending.clear();
        // Drop the decoder and forget the child.
        this.decoder = null;
        this.child = null;
        // Drop document + diagnostics state (it belonged to that server).
        this.documents.clear();
        this.pendingChanges.clear();
        this.diagnostics.clear();
        this.diagnosticsVersions.clear();
        // An intentional stop (shutdown / interpreter restart) — the stop()
        // path owns the final state; stay quiet here.
        if (this.intentionalStop) {
            // Done.
            return;
        }
        // A CRASH: count it, back off, maybe give up. A server that had
        // already SERVED traffic starts a fresh incident (its earlier
        // crashes are forgiven); one that died before serving anything
        // accumulates towards the give-up budget.
        this.restarts = this.servedSinceStart ? 1 : this.restarts + 1;
        // The crash detail (stderr tail when we have one).
        const detail = this.stderrTail ? ` (stderr: ${this.stderrTail.slice(-300)})` : "";
        // Past the budget → unavailable.
        if (this.restarts >= this.maxAutoRestarts) {
            this.state = "unavailable";
            this.stateReason = `pyright exited unexpectedly (code ${code ?? "?"} / ${signal ?? "no signal"})${detail} — gave up after ${this.restarts} crashes`;
            // Long negative cache.
            this.negativeProbeUntil = Date.now() + this.negativeProbeTtlMs;
        } else {
            // Retryable crash.
            this.state = "failed";
            this.stateReason = `pyright exited unexpectedly (code ${code ?? "?"} / ${signal ?? "no signal"})${detail}`;
            // Backoff before the next ensure().
            this.restartBackoffUntil = Date.now() + this.backoffMs;
        }
    }

    // ── Feature requests (each guarantees the doc text is current) ────

    /** Kill the child with SIGKILL (idempotent, never throws). */
    private killChild(): void {
        // Nothing to kill.
        if (!this.child) return;
        try {
            // SIGKILL directly — pyright is a single node process, and the
            // escalation ladder already gave it a graceful chance.
            this.child.kill("SIGKILL");
        } catch {
            /* already dead */
        }
        // Forget it (the exit handler is guarded by intentionalStop).
        this.child = null;
        this.decoder = null;
    }

    /** Await the child's own exit for up to `graceMs` (or true at once). */
    private async awaitChildExit(graceMs: number): Promise<boolean> {
        // No child — trivially exited.
        if (!this.child) return true;
        // Already dead.
        if (this.child.exitCode !== null || this.child.signalCode !== null) return true;
        // Race the exit event against the grace timer.
        return new Promise((resolve) => {
            // The grace timer.
            const timer = setTimeout(() => {
                // Grace expired.
                cleanup();
                resolve(false);
            }, graceMs);
            // One-shot exit listener.
            const onExit = () => {
                // Won the race.
                cleanup();
                resolve(true);
            };
            // Shared teardown.
            const cleanup = () => {
                // Drop the timer.
                clearTimeout(timer);
                // Drop the listener.
                this.child?.removeListener("exit", onExit);
            };
            // Arm the listener.
            this.child?.once("exit", onExit);
        });
    }

    /** Send a request and await its response (timeout → reject). */
    private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
        // The correlation id.
        const id = this.nextRequestId++;
        // The deferred promise.
        return new Promise((resolve, reject) => {
            // The timeout guard.
            const timer = setTimeout(() => {
                // Forget the entry (a late response finds no matching id).
                this.pending.delete(id);
                // Reject with a descriptive error.
                reject(new Error(`pyright request timed out: ${method}`));
            }, timeoutMs);
            // Register the entry.
            this.pending.set(id, {resolve, reject, timer});
            try {
                // Write the framed request to the child's stdin.
                this.child?.stdin?.write(encodeLspMessage({jsonrpc: "2.0", id, method, params}));
            } catch (err) {
                // The write failed (dead pipe) — clean up and reject.
                clearTimeout(timer);
                this.pending.delete(id);
                reject(new Error(`pyright write failed: ${(err as Error).message}`));
            }
        });
    }

    /** Send a notification (no response expected). */
    private notify(method: string, params: unknown): void {
        // Write the framed notification.
        this.child?.stdin?.write(encodeLspMessage({jsonrpc: "2.0", method, params}));
    }

    /** Send a SUCCESS RESPONSE to a server-initiated request. */
    private writeResponse(id: number, result: unknown): void {
        // Write the framed response.
        this.child?.stdin?.write(encodeLspMessage({jsonrpc: "2.0", id, result}));
    }

    /** Route decoded stdout messages. */
    private onStdout(chunk: Buffer): void {
        // Decode every complete frame in the chunk.
        const messages = this.decoder?.push(chunk) ?? [];
        // Handle each one.
        for (const raw of messages) {
            // Narrow to a JSON-RPC message shape.
            const msg = raw as {
                id?: number;
                method?: string;
                params?: unknown;
                result?: unknown;
                error?: { message?: string }
            };
            // A RESPONSE (to one of our requests).
            if (msg.id !== undefined && msg.method === undefined) {
                // Find the pending entry.
                const entry = this.pending.get(msg.id);
                // Unknown id (a late response after timeout) — drop it.
                if (!entry) continue;
                // Stop the timeout timer.
                clearTimeout(entry.timer);
                // Forget the entry.
                this.pending.delete(msg.id);
                // Error responses reject.
                if (msg.error) {
                    entry.reject(new Error(msg.error.message ?? "pyright returned an error"));
                } else {
                    entry.resolve(msg.result);
                }
                // Next message.
                continue;
            }
            // A SERVER REQUEST (id + method): pyright may ask for
            // workspace/configuration or client/registerCapability. Answer
            // with a benign default so it never blocks waiting on us.
            if (msg.id !== undefined && msg.method !== undefined) {
                // workspace/configuration expects one value per requested item.
                if (msg.method === "workspace/configuration") {
                    // One benign configuration object per item.
                    const items = ((msg.params as { items?: unknown[] })?.items ?? []).map(() => ({}));
                    // Answer with the array.
                    this.writeResponse(msg.id, items);
                } else {
                    // Everything else accepts a null result.
                    this.writeResponse(msg.id, null);
                }
                // Next message.
                continue;
            }
            // A SERVER NOTIFICATION.
            if (msg.method === "textDocument/publishDiagnostics") {
                // Narrow the params.
                const p = (msg.params ?? {}) as { uri?: string; diagnostics?: RawLspDiagnostic[] };
                // Only for a known uri.
                if (!p.uri) continue;
                // Bump the per-uri diagnostics version.
                const version = (this.diagnosticsVersions.get(p.uri) ?? 0) + 1;
                // Store both.
                this.diagnosticsVersions.set(p.uri, version);
                this.diagnostics.set(p.uri, {diagnostics: Array.isArray(p.diagnostics) ? p.diagnostics : [], version});
                // Next message.
                continue;
            }
            // window/logMessage and window/showMessage are ignored — Praxis
            // surfaces problems through its own panels, and answering
            // showMessageRequest requests is unnecessary.
        }
    }

    /** Flush every coalesced didChange (in uri order for determinism). */
    private flushPendingChanges(): void {
        // Still ready?
        if (this.state !== "ready") {
            // No — drop the pending changes (they belonged to a dead server).
            this.pendingChanges.clear();
            return;
        }
        // Flush in insertion order.
        for (const [uri, text] of this.pendingChanges) {
            // The tracked document.
            const existing = this.documents.get(uri);
            // Closed meanwhile — skip.
            if (!existing) continue;
            // Track the new text.
            const version = existing.version + 1;
            this.documents.set(uri, {...existing, text, version});
            // Send the full-text change.
            this.notify("textDocument/didChange", {
                textDocument: {uri, version},
                contentChanges: [{text}],
            });
        }
        // Everything flushed.
        this.pendingChanges.clear();
    }

    // ── Process-exit hygiene ──────────────────────────────────────────

    /** Shared prologue: flush + immediate-sync the doc, then a request. */
    private async withCurrentDocument<T>(
        doc: { uri: string; text: string },
        method: string,
        params: Record<string, unknown>,
        timeoutMs?: number
    ): Promise<T | null> {
        // Not ready — a null result routes the caller to the fallback.
        if (this.state !== "ready") return null;
        // Flush coalesced changes for OTHER uris first (ordering).
        this.flushPendingChanges();
        // Force this document's text current (immediate didChange).
        this.syncDocument({uri: doc.uri, text: doc.text, immediate: true});
        try {
            // Await the response with the default timeout.
            const result = (await this.request(method, params, timeoutMs ?? this.requestTimeoutMs)) as T;
            // A resolved feature request proves the server serves — forgive
            // any accumulated crash budget.
            this.servedSinceStart = true;
            // Hand it back.
            return result;
        } catch {
            // Timeout / server error — the fallback owns this case.
            return null;
        }
    }

    /** Install the once-per-process SIGKILL-on-exit hooks. */
    private installExitHooks(): void {
        // Already installed.
        if (PyrightLspManager.exitHooksInstalled) return;
        // Mark installed.
        PyrightLspManager.exitHooksInstalled = true;
        // The killer: synchronous, best-effort.
        const killSidecars = () => {
            // The current singleton's child (if any).
            const g = globalThis as unknown as { __praxisPyrightLsp?: PyrightLspManager };
            // Kill it.
            try {
                g.__praxisPyrightLsp?.killChild();
            } catch {
                /* best-effort */
            }
        };
        // Normal exit (incl. next-server shutdown).
        process.once("exit", killSidecars);
        // Ctrl+C — kill the sidecar, then honor the default behavior.
        process.once("SIGINT", () => {
            // Kill first.
            killSidecars();
            // Re-raise so the process actually terminates.
            process.exit(0);
        });
        // SIGTERM (docker stop, systemd) — same dance.
        process.once("SIGTERM", () => {
            // Kill first.
            killSidecars();
            // Re-raise.
            process.exit(0);
        });
    }
}

// ── The globalThis singleton ─────────────────────────────────────────

/** Where the singleton is pinned (survives Next.js HMR module reloads). */
const SINGLETON_KEY = "__praxisPyrightLsp";

/** The process-wide sidecar manager (created lazily). */
export function getPyrightLspManager(): PyrightLspManager {
    // The global slot.
    const g = globalThis as unknown as { [SINGLETON_KEY]?: PyrightLspManager };
    // Create on first use.
    if (!g[SINGLETON_KEY]) {
        g[SINGLETON_KEY] = new PyrightLspManager();
    }
    // Hand it back.
    return g[SINGLETON_KEY]!;
}

/**
 * Swap in a FRESH manager (and kill the old one's child). Exclusively
 * for the lifecycle test suite — production code never resets.
 */
export async function resetPyrightLspManagerForTests(): Promise<void> {
    // The global slot.
    const g = globalThis as unknown as { [SINGLETON_KEY]?: PyrightLspManager };
    // Kill the previous child, if any.
    if (g[SINGLETON_KEY]) {
        // Clean stop (best-effort).
        await g[SINGLETON_KEY]!.stop("test reset");
    }
    // A fresh instance.
    g[SINGLETON_KEY] = new PyrightLspManager();
}
