/**
 * extensions-registry — the HOST side of the Praxis extension system.
 *
 * Design: manifest-declared, permission-scoped, Worker-sandboxed
 * mini-plugins. Each extension ships a manifest (id, permissions,
 * contributions) plus a `code` string — plain JS that runs inside a
 * classic Web Worker created from a Blob URL. The worker talks to
 * the host over a tiny RPC bridge: it posts
 * { kind:"call", fn, args, seq } and the host replies
 * { kind:"reply", seq, ok, value }. Every call is permission-checked
 * against the manifest BEFORE the host acts, so a worker can never
 * reach a capability its manifest does not declare.
 *
 * This module is pure TS (no React): a tiny subscribe store
 * (getExtensionState / subscribeExtensions) lets the ExtensionsPanel
 * re-render on state changes — the same store shape
 * src/hooks/use-toast.ts uses for toasts.
 *
 * Storage keys (all under STORAGE_PREFIX from ./config):
 *   `${STORAGE_PREFIX}.extensions.enabled` — the EnabledMap
 *   `${STORAGE_PREFIX}.ext.<id>`            — per-extension JSON bag (64 KB cap)
 */

import {STORAGE_PREFIX} from "./config";
import {
    buildWorkerSource,
    type HostInvokeMessage,
    type HostReplyMessage,
    type RpcFn,
    type WorkerCallMessage,
    type WorkerToHostMessage,
} from "./extensions-worker";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Permission names an extension can declare in its manifest. */
export type ExtensionPermission =
    | "commands"
    | "statusbar"
    | "notify"
    | "clipboard"
    | "editor.insertText"
    | "storage";

export interface ExtensionManifest {
    /** Stable machine id, e.g. "word-count". */
    id: string;
    /** Human name, e.g. "Word Count". */
    name: string;
    description: string;
    author?: string;
    permissions: ExtensionPermission[];
    contributions: {
        commands?: Array<{ id: string; title: string; when?: string }>;
        statusBar?: Array<{ id: string; text: string; tooltip?: string; when?: string }>;
        snippets?: Array<{ label: string; body: string; language?: string }>;
        /** dark/light class presets — declared only, no runtime effect yet. */
        themes?: Array<{ id: string; label: string }>;
    };
    /** Worker-side JS source (plain script, no imports — the host wraps
     * it in the RPC runtime IIFE; see ./extensions-worker.ts). */
    code: string;
}

export interface EnabledMap {
    [id: string]: boolean;
}

/** One queued notification pushed by an extension via the RPC. */
export interface ExtensionNotification {
    /** Monotonic counter — stable React keys for the queue. */
    seq: number;
    extId: string;
    extName: string;
    title?: string;
    text: string;
    /** Unix ms when the host received the notify RPC. */
    at: number;
}

/** The whole observable host state (immutable snapshots — mutations
 * produce new objects so useSyncExternalStore sees a fresh
 * reference). */
export interface ExtensionState {
    running: Array<{ id: string; name: string }>;
    commands: Array<{ extId: string; extName: string; commandId: string; title: string }>;
    statusBar: Array<{ extId: string; id: string; text: string; tooltip?: string }>;
    notifications: ExtensionNotification[];
}

/**
 * The provider the host app wires so extensions can read the active
 * editor. Defaults to empty strings until setDocumentProvider is
 * called (the host wiring agent installs the real one).
 */
export interface DocumentProvider {
    getDocument(): string;

    getSelection(): string;
}

/** Window event the host app listens for so extensions can insert
 * text into the editor (detail: { text }). */
export const EXTENSION_INSERT_TEXT_EVENT = "praxis:extension-insert-text";

/* ------------------------------------------------------------------ */
/*  Storage keys + persistence                                         */
/* ------------------------------------------------------------------ */

const ENABLED_KEY = `${STORAGE_PREFIX}.extensions.enabled`;
/** Per-extension storage quota (serialized JSON length in chars). */
const STORAGE_LIMIT = 64 * 1024;
/** Cap of the notification queue — a chatty extension must not grow it forever. */
const NOTIFICATION_CAP = 20;

/** localStorage key for one extension's JSON storage bag. */
export function extensionStorageKey(extId: string): string {
    return `${STORAGE_PREFIX}.ext.${extId}`;
}

/** Load the enabled map. Defaults to every builtin enabled; a stored
 * map only overrides ids it explicitly knows about (so newly added
 * builtins start enabled). Server-side call → all defaults. */
export function loadEnabled(): EnabledMap {
    const map: EnabledMap = {};
    for (const ext of BUILTIN_EXTENSIONS) map[ext.id] = true;
    if (typeof window === "undefined") return map;
    try {
        const raw = window.localStorage.getItem(ENABLED_KEY);
        if (!raw) return map;
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object") {
            const stored = parsed as Record<string, unknown>;
            for (const ext of BUILTIN_EXTENSIONS) {
                const value = stored[ext.id];
                if (typeof value === "boolean") map[ext.id] = value;
            }
        }
    } catch {
        // Corrupt JSON → fall back to defaults.
    }
    return map;
}

/** Persist the enabled map. No-op on the server. */
export function saveEnabled(map: EnabledMap): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(ENABLED_KEY, JSON.stringify(map));
    } catch {
        // Quota/private-mode failures must not break toggling.
    }
}

/* ------------------------------------------------------------------ */
/*  The subscribe store (no React — mirrors use-toast's listener set)  */
/* ------------------------------------------------------------------ */

let state: ExtensionState = {
    running: [],
    commands: [],
    statusBar: [],
    notifications: [],
};

const listeners = new Set<() => void>();

function setState(mutate: (current: ExtensionState) => ExtensionState): void {
    state = mutate(state);
    for (const listener of listeners) listener();
}

/** Current snapshot (referentially stable between mutations). */
export function getExtensionState(): ExtensionState {
    return state;
}

/** Subscribe to store mutations; returns the unsubscribe function. */
export function subscribeExtensions(callback: () => void): () => void {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

let notificationSeq = 0;

function pushNotification(ext: ExtensionManifest, text: string, title: string | undefined): void {
    setState((s) => ({
        ...s,
        // Newest first, hard cap of 20.
        notifications: [
            {seq: ++notificationSeq, extId: ext.id, extName: ext.name, title, text, at: Date.now()},
            ...s.notifications,
        ].slice(0, NOTIFICATION_CAP),
    }));
}

/** Empty the notification queue (the panel's Clear button). */
export function clearExtensionNotifications(): void {
    setState((s) => ({...s, notifications: []}));
}

/** Host-side diagnostics logger — the RPC `log` fn and worker errors
 * all land here, prefixed so the console line is attributable. */
function logLine(ext: ExtensionManifest, ...parts: unknown[]): void {
    console.info(
        `[ext:${ext.name}]`,
        ...parts.map((part) => (part instanceof Error ? part.message : String(part)))
    );
}

/* ------------------------------------------------------------------ */
/*  Document provider (wired by the host app)                          */
/* ------------------------------------------------------------------ */

let documentProvider: DocumentProvider = {
    getDocument: () => "",
    getSelection: () => "",
};

/** Install the real document/selection source (defaults to empty
 * strings so getDocument/getSelection never throw pre-wiring). */
export function setDocumentProvider(provider: DocumentProvider): void {
    documentProvider = provider;
}

/* ------------------------------------------------------------------ */
/*  Permission policy                                                 */
/* ------------------------------------------------------------------ */

/**
 * Host-side capability policy: which manifest permission each RPC
 * entry point requires. `log` is always allowed (diagnostics only).
 * `clipboard` is declared-but-reserved — no RPC fn uses it yet.
 * The single editor permission ("editor.insertText") gates ALL
 * editor access, reads included.
 */
const FN_PERMISSIONS: Readonly<Record<RpcFn, ExtensionPermission | undefined>> = {
    registerCommand: "commands",
    registerStatusBar: "statusbar",
    notify: "notify",
    insertText: "editor.insertText",
    getDocument: "editor.insertText",
    getSelection: "editor.insertText",
    setStorage: "storage",
    getStorage: "storage",
    log: undefined,
};

/* ------------------------------------------------------------------ */
/*  Builtin first-party extensions                                    */
/* ------------------------------------------------------------------ */

/**
 * The five first-party examples. `code` is the worker-side JS each
 * one runs; it receives a global `praxis` API object whose methods
 * are RPC round-trips to this host (see ./extensions-worker.ts for
 * the runtime the code is appended to).
 */
const BUILTIN_EXTENSIONS: ExtensionManifest[] = [
    {
        id: "word-count",
        name: "Word Count",
        description:
            "Status-bar item with the live word and character count of the active file, polled from the host every two seconds.",
        author: "Praxis",
        // editor.insertText is the single editor permission — it covers reads too.
        permissions: ["statusbar", "editor.insertText"],
        contributions: {
            commands: [{id: "refresh", title: "Count words now"}],
            statusBar: [{id: "wc", text: "0 words", tooltip: "Words and characters in the active file"}],
        },
        code: String.raw`
praxis.registerStatusBar("wc", "0 words", "Words and characters in the active file");

async function refreshWordCount() {
  var doc = await praxis.getDocument();
  var words = doc.trim() ? doc.trim().split(/\s+/).length : 0;
  var chars = doc.length;
  await praxis.registerStatusBar(
    "wc",
    words + " words / " + chars + " chars",
    "Words and characters in the active file"
  );
}

praxis.onCommand("refresh", refreshWordCount);
setInterval(function () {
  refreshWordCount().catch(function () { /* host bridge hiccup — try next tick */ });
}, 2000);
refreshWordCount().catch(function () { /* ignore */ });
`,
    },
    {
        id: "hello-praxis",
        name: "Hello Praxis",
        description:
            "A command that greets you through a notification and inserts a comment into the editor at the cursor.",
        author: "Praxis",
        permissions: ["commands", "notify", "editor.insertText"],
        contributions: {
            commands: [{id: "hello", title: "Say hello"}],
        },
        code: String.raw`
praxis.registerCommand("hello", "Say hello", async function () {
  await praxis.notify("Hello from the hello-praxis extension.", "Hello Praxis");
  await praxis.insertText("# Hello from hello-praxis\n");
});
`,
    },
    {
        id: "selection-stats",
        name: "Selection Stats",
        description: "A command that reads the current editor selection and reports its length.",
        author: "Praxis",
        permissions: ["commands", "notify", "editor.insertText"],
        contributions: {
            commands: [{id: "stats", title: "Show selection stats"}],
        },
        code: String.raw`
praxis.registerCommand("stats", "Show selection stats", async function () {
  var selection = await praxis.getSelection();
  var text = selection.length > 0
    ? "Selection is " + selection.length + " characters."
    : "Nothing is selected.";
  await praxis.notify(text, "Selection stats");
});
`,
    },
    {
        id: "timestamp-statusbar",
        name: "Timestamp Status Bar",
        description:
            "Status-bar item with the current local time; the extension updates the item itself, every second.",
        author: "Praxis",
        permissions: ["statusbar"],
        contributions: {
            statusBar: [{id: "ts", text: "--:--:--", tooltip: "Current local time"}],
        },
        code: String.raw`
function pad(n) {
  return ("0" + n).slice(-2);
}

function tick() {
  var d = new Date();
  var text = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  praxis.registerStatusBar("ts", text, "Current local time").catch(function () { /* ignore */ });
}

tick();
setInterval(tick, 1000);
`,
    },
    {
        id: "snippet-pack-basics",
        name: "Snippet Pack: Basics",
        description:
            "Three starter snippets — a file header comment, a TODO block and a print-debug scaffold. Snippets are declarative contributions, so this one barely runs any code.",
        author: "Praxis",
        permissions: [],
        contributions: {
            snippets: [
                {
                    label: "Header comment",
                    body: '# -*- coding: utf-8 -*-\n"""One-line module summary."""\n',
                    language: "python",
                },
                {
                    label: "TODO block",
                    body: "# TODO: describe the task\n#   [ ] step one\n#   [ ] step two\n",
                    language: "python",
                },
                {
                    label: "Print debug scaffold",
                    body: 'print("DEBUG:", value)\n',
                    language: "python",
                },
            ],
        },
        code: String.raw`
// Snippets are declarative manifest contributions — the worker only
// logs that it is alive.
praxis.log("loaded - snippets are contributed declaratively").catch(function () { /* ignore */ });
`,
    },
];

/** The builtin catalog (a fresh array so callers cannot mutate the
 * module's copy). */
export function listBuiltinExtensions(): ExtensionManifest[] {
    return BUILTIN_EXTENSIONS.slice();
}

/* ------------------------------------------------------------------ */
/*  Worker lifecycle                                                   */

/* ------------------------------------------------------------------ */

interface RunningEntry {
    manifest: ExtensionManifest;
    worker: Worker;
    blobUrl: string;
}

const running = new Map<string, RunningEntry>();

/** Narrow an unknown postMessage payload to the protocol union. */
function isWorkerToHostMessage(data: unknown): data is WorkerToHostMessage {
    if (typeof data !== "object" || data === null) return false;
    const kind = (data as { kind?: unknown }).kind;
    return kind === "call" || kind === "invoke-result" || kind === "ready";
}

/**
 * Start one extension: build its worker source, spawn the Worker
 * from a Blob URL (classic — the source is plain JS), seed the
 * declarative contributions into the store, and wire the RPC. The
 * returned promise resolves when the worker posts "ready" (or after
 * a 5 s fallback, so a silent worker never hangs the UI).
 */
export async function startExtension(ext: ExtensionManifest): Promise<void> {
    if (running.has(ext.id)) return; // guard double-start
    if (typeof window === "undefined" || typeof Worker === "undefined") return; // SSR / no workers

    const source = buildWorkerSource(ext);
    const blobUrl = URL.createObjectURL(new Blob([source], {type: "text/javascript"}));
    let worker: Worker;
    try {
        worker = new Worker(blobUrl, {type: "classic"});
    } catch (err) {
        URL.revokeObjectURL(blobUrl);
        logLine(ext, "failed to start worker:", err instanceof Error ? err.message : String(err));
        return;
    }

    running.set(ext.id, {manifest: ext, worker, blobUrl});
    seedContributions(ext);

    let markReady: (() => void) | null = null;
    const ready = new Promise<void>((resolve) => {
        markReady = resolve;
    });
    // Readiness fallback — a worker whose code throws synchronously
    // never posts "ready", but the UI must not wait forever.
    const readyTimer = setTimeout(() => {
        markReady?.();
    }, 5000);

    worker.onmessage = (ev: MessageEvent<unknown>): void => {
        const msg = ev.data;
        if (!isWorkerToHostMessage(msg)) return;
        switch (msg.kind) {
            case "ready":
                clearTimeout(readyTimer);
                markReady?.();
                return;
            case "call":
                handleCall(ext, worker, msg);
                return;
            case "invoke-result":
                if (!msg.ok) {
                    logLine(ext, "command failed:", msg.error ?? "unknown error");
                }
                return;
        }
    };
    worker.onerror = (ev: ErrorEvent): void => {
        logLine(ext, "worker error:", ev.message || "uncaught worker error");
        markReady?.(); // don't leave the boot wait hanging
    };

    await ready;
}

/** Stop one extension: terminate the worker, revoke its Blob URL and
 * drop its live state. Notifications stay — they are a log, not
 * live state. Unknown ids are a no-op. */
export function stopExtension(id: string): void {
    const entry = running.get(id);
    if (!entry) return;
    running.delete(id);
    try {
        entry.worker.terminate();
    } catch {
        // Already dead — nothing to do.
    }
    URL.revokeObjectURL(entry.blobUrl);
    setState((s) => ({
        ...s,
        running: s.running.filter((r) => r.id !== id),
        commands: s.commands.filter((c) => c.extId !== id),
        statusBar: s.statusBar.filter((b) => b.extId !== id),
    }));
}

/**
 * Boot every enabled builtin, once per module lifetime: the memoized
 * promise means concurrent/repeat callers all await the same boot
 * and the workers are never double-started.
 */
let bootPromise: Promise<void> | null = null;

export function startEnabled(): Promise<void> {
    if (!bootPromise) {
        bootPromise = (async () => {
            if (typeof window === "undefined") return; // SSR
            const enabled = loadEnabled();
            await Promise.all(
                listBuiltinExtensions()
                    .filter((ext) => enabled[ext.id] !== false)
                    .map((ext) => startExtension(ext))
            );
        })();
    }
    return bootPromise;
}

/**
 * Invoke a command the extension registered (posts an "invoke" to
 * the worker; its dispatch table calls the handler). Fire-and-forget
 * by design — the worker reports failures via "invoke-result" and the
 * host logs them. Not-running extensions are ignored (the UI keeps
 * their buttons disabled).
 */
export function runCommand(extId: string, commandId: string): void {
    const entry = running.get(extId);
    if (!entry) return;
    const message: HostInvokeMessage = {kind: "invoke", commandId};
    entry.worker.postMessage(message);
}

/** Seed manifest-declared commands + status-bar items into the store
 * so the UI is populated before the worker registers anything. */
function seedContributions(ext: ExtensionManifest): void {
    setState((s) => ({
        ...s,
        running: [...s.running, {id: ext.id, name: ext.name}],
        commands: [
            ...s.commands,
            ...(ext.contributions.commands ?? []).map((c) => ({
                extId: ext.id,
                extName: ext.name,
                commandId: c.id,
                title: c.title,
            })),
        ],
        statusBar: [
            ...s.statusBar,
            ...(ext.contributions.statusBar ?? []).map((b) => ({
                extId: ext.id,
                id: b.id,
                text: b.text,
                tooltip: b.tooltip,
            })),
        ],
    }));
}

/* ------------------------------------------------------------------ */
/*  RPC host implementation                                            */

/* ------------------------------------------------------------------ */

function reply(worker: Worker, seq: number, result: { ok: true; value: unknown } | { ok: false; error: string }): void {
    const message: HostReplyMessage = result.ok
        ? {kind: "reply", seq, ok: true, value: result.value ?? null}
        : {kind: "reply", seq, ok: false, error: result.error};
    worker.postMessage(message);
}

function handleCall(ext: ExtensionManifest, worker: Worker, msg: WorkerCallMessage): void {
    const required = FN_PERMISSIONS[msg.fn];
    if (required !== undefined && !ext.permissions.includes(required)) {
        reply(worker, msg.seq, {
            ok: false,
            error: `permission denied: "${msg.fn}" requires "${required}"`,
        });
        return;
    }
    try {
        reply(worker, msg.seq, {ok: true, value: implementCall(ext, msg.fn, msg.args)});
    } catch (err) {
        reply(worker, msg.seq, {ok: false, error: err instanceof Error ? err.message : String(err)});
    }
}

/** The actual host capabilities behind the RPC bridge. */
function implementCall(ext: ExtensionManifest, fn: RpcFn, args: unknown[]): unknown {
    switch (fn) {
        case "registerCommand": {
            const [commandId, title] = args;
            if (typeof commandId !== "string" || typeof title !== "string") {
                throw new Error("registerCommand(commandId: string, title: string)");
            }
            setState((s) => ({
                ...s,
                // Merge by (extId, commandId) — re-registration updates the title.
                commands: [
                    ...s.commands.filter((c) => !(c.extId === ext.id && c.commandId === commandId)),
                    {extId: ext.id, extName: ext.name, commandId, title},
                ],
            }));
            return null;
        }
        case "registerStatusBar": {
            const [id, text, tooltip] = args;
            if (typeof id !== "string" || typeof text !== "string") {
                throw new Error("registerStatusBar(id: string, text: string, tooltip?: string)");
            }
            const tip = typeof tooltip === "string" ? tooltip : undefined;
            setState((s) => ({
                ...s,
                // Merge by (extId, id) — re-registration updates the live text.
                statusBar: [
                    ...s.statusBar.filter((b) => !(b.extId === ext.id && b.id === id)),
                    {extId: ext.id, id, text, tooltip: tip},
                ],
            }));
            return null;
        }
        case "notify": {
            const [text, title] = args;
            if (typeof text !== "string") {
                throw new Error("notify(text: string, title?: string)");
            }
            const heading = typeof title === "string" ? title : undefined;
            pushNotification(ext, text, heading);
            return null;
        }
        case "insertText": {
            const [text] = args;
            if (typeof text !== "string") {
                throw new Error("insertText(text: string)");
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(EXTENSION_INSERT_TEXT_EVENT, {detail: {text}})
                );
            }
            return null;
        }
        case "getDocument":
            return documentProvider.getDocument();
        case "getSelection":
            return documentProvider.getSelection();
        case "setStorage": {
            const [key, value] = args;
            if (typeof key !== "string") {
                throw new Error("setStorage(key: string, value: JSON)");
            }
            const bag = readStorageBag(ext.id);
            bag[key] = value === undefined ? null : value;
            writeStorageBag(ext.id, bag);
            return null;
        }
        case "getStorage": {
            const [key] = args;
            if (typeof key !== "string") {
                throw new Error("getStorage(key: string)");
            }
            const stored = readStorageBag(ext.id)[key];
            return stored === undefined ? null : stored;
        }
        case "log": {
            const [parts] = args;
            if (Array.isArray(parts)) {
                logLine(ext, ...(parts as unknown[]).map((part) => String(part)));
            } else {
                logLine(ext, String(parts));
            }
            return null;
        }
    }
}

/** Read one extension's JSON storage bag (corrupt/missing → {}). */
function readStorageBag(extId: string): Record<string, unknown> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(extensionStorageKey(extId));
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return {};
    } catch {
        return {};
    }
}

/** Write one extension's JSON storage bag — throws when the
 * serialized size passes the 64 KB cap (the RPC reply then tells the
 * worker). */
function writeStorageBag(extId: string, bag: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    const serialized = JSON.stringify(bag);
    if (serialized.length > STORAGE_LIMIT) {
        throw new Error(`extension storage exceeds the 64 KB quota (${serialized.length} chars)`);
    }
    try {
        window.localStorage.setItem(extensionStorageKey(extId), serialized);
    } catch {
        throw new Error("extension storage is not writable (quota or private mode)");
    }
}
