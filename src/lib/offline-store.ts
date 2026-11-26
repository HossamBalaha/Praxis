"use client";

/**
 * Offline write queue + connectivity state — the client half of
 * offline file access.
 *
 * The service worker (public/sw.js) covers READS offline: the app
 * shell plus a runtime cache of recently-opened files
 * (/api/code + /api/file, network-first with last-good fallback).
 * This module covers WRITES offline:
 *
 *   1. A save that cannot reach the server is handed to
 *      `queueOfflineWrite({ url, method: "POST", body, label, fileKey })`,
 *      which persists the POST into localStorage under
 *      "praxis.offline-writes" (capped: 40 entries, each body < 400 KB).
 *   2. When the browser reports it is back online (window "online"),
 *      `flushOfflineWrites()` replays the queue IN ORDER via fetch,
 *      removing each entry as its POST succeeds. Failures are kept
 *      with a per-entry attempt counter and dropped after 5 attempts
 *      so a permanently-rejected write can never wedge the queue. A
 *      light periodic retry (every 30 s while online with pending
 *      writes) also covers "server restarted while the browser stayed
 *      online" — no "online" event ever fires for that.
 *   3. `subscribeOffline(cb)` exposes `{ online, pendingWrites }`
 *      (plus the last flush report) — the OfflineIndicator footer chip
 *      renders from exactly this state.
 *
 * Concurrency:
 *   - localStorage is the source of truth, but a tab keeps an
 *     in-memory MIRROR so frequent `getOfflineState()` snapshot reads
 *     (every render of the indicator) never re-parse megabytes of
 *     queued bodies. The mirror is dropped whenever another tab
 *     touches the queue ("storage" event).
 *   - All mutations address entries BY ID on the current queue, so a
 *     flush awaiting the network never clobbers writes queued while
 *     it runs.
 *   - A tiny cross-tab lock ("praxis.offline-writes.lock") makes the
 *     reconnect flush single-flight ACROSS TABS — two Praxis tabs
 *     both seeing "online" would otherwise replay the same queue
 *     twice. The lock auto-expires (30 s heartbeat) so a crashed
 *     tab can never wedge it.
 *
 * Everything here is browser-only by design; each entry point degrades
 * gracefully (no-op / safe snapshot) when `window` is undefined, so
 * importing the module from server-rendered code is harmless.
 *
 * Toast wiring (for callers): `queueOfflineWrite` REJECTS oversized or
 * unserializable writes by RETURNING a toast-ready error —
 *
 *   const r = queueOfflineWrite({ ... });
 *   if (!r.ok) toast({ title: r.title, description: r.description, variant: "destructive" });
 *
 * — the store itself stays React-free (it lives in src/lib).
 */

import {STORAGE_PREFIX} from "@/lib/config";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUEUE_KEY = `${STORAGE_PREFIX}.offline-writes`;
const LOCK_KEY = `${QUEUE_KEY}.lock`;

/** Hard cap on queued writes — oldest entries are evicted past this. */
const MAX_QUEUED_WRITES = 40;
/** Bodies at or above this size are refused (localStorage is not a
 *  file store; 40 × 400 KB already exceeds a typical 5 MB quota). */
const MAX_BODY_BYTES = 400 * 1024;
/** A write is dropped (not retried forever) after this many attempts. */
const MAX_WRITE_ATTEMPTS = 5;
/** Grace period after the browser reports "online" before flushing —
 *  the OS network stack is often not fully up at event time. */
const RECONNECT_FLUSH_DELAY_MS = 1_500;
/** Periodic retry cadence while online with pending writes. */
const PERIODIC_FLUSH_INTERVAL_MS = 30_000;
/** Per-entry POST timeout during a flush — one hung request must not
 *  stall the whole queue (or the cross-tab lock) forever. */
const REPLAY_TIMEOUT_MS = 20_000;
/** A cross-tab flush lock older than this is considered abandoned
 *  (crashed tab) and may be taken over. */
const LOCK_TTL_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Types                                                              */

/* ------------------------------------------------------------------ */

/** What a caller hands to `queueOfflineWrite` — one replayable POST. */
export interface OfflineWritePayload {
    /** Same-origin API path the original save targeted (e.g. "/api/file-write"). */
    url: string;
    method: "POST";
    /** JSON-serializable request body of the original save. */
    body: unknown;
    /** Human label for toasts/logs (e.g. "Save — HelloPraxis.py"). */
    label: string;
    /** File identity ("folderSlug/fileSlug") — for diagnostics/dedupe UI. */
    fileKey: string;
}

/** Internal, persisted form of a queued write. */
export interface OfflineWriteEntry extends OfflineWritePayload {
    /** Unique id — all queue mutations address entries by id so they
     *  can never clobber writes queued concurrently by another flush/tab. */
    id: string;
    queuedAt: number;
    /** Failed replay attempts so far; dropped at MAX_WRITE_ATTEMPTS. */
    attempts: number;
}

/** Result of one flush pass (and the `lastFlush` field of the state). */
export interface OfflineFlushReport {
    /** Writes successfully replayed and removed from the queue. */
    flushed: number;
    /** Writes that failed this pass (kept for retry, or dropped at the cap). */
    failed: number;
    /** When the pass finished (Date.now()). */
    at: number;
}

/** Subscribed state shape: { online, pendingWrites };
 *  lastFlush is a superset field the indicator uses for its brief
 *  "Synced" flash. */
export interface OfflineState {
    online: boolean;
    pendingWrites: number;
    /** Report of the most recent non-empty flush attempt (null before
     *  the first). New object identity per pass. */
    lastFlush: OfflineFlushReport | null;
}

/** `queueOfflineWrite` result — success carries the new queue length,
 *  failure carries a toast-ready title/description pair. */
export type QueueOfflineWriteResult =
    | { ok: true; pending: number }
    | { ok: false; title: string; description: string };

/* ------------------------------------------------------------------ */
/*  Internal state                                                     */
/* ------------------------------------------------------------------ */

type Listener = (state: OfflineState) => void;
const listeners = new Set<Listener>();

/** Per-tab identity (lock ownership). */
const TAB_ID = makeId();

/** In-memory mirror of the persisted queue — see the header comment.
 *  `null` means "not loaded / invalidated by another tab". */
let queueMirror: OfflineWriteEntry[] | null = null;

let cachedSnapshot: OfflineState = {online: true, pendingWrites: 0, lastFlush: null};
let lastFlushReport: OfflineFlushReport | null = null;
let flushInFlight: Promise<OfflineFlushReport> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

/* ------------------------------------------------------------------ */
/*  Queue storage — localStorage via the mirror                        */

/* ------------------------------------------------------------------ */

function isOfflineWriteEntry(value: unknown): value is OfflineWriteEntry {
    if (!value || typeof value !== "object") return false;
    const e = value as Record<string, unknown>;
    return (
        typeof e.id === "string" &&
        typeof e.url === "string" &&
        e.method === "POST" &&
        typeof e.label === "string" &&
        typeof e.fileKey === "string" &&
        typeof e.queuedAt === "number" &&
        typeof e.attempts === "number" &&
        "body" in e
    );
}

/** Parse + validate whatever is in localStorage. Corrupt storage
 *  self-heals to an empty queue. */
function parseQueueFromStorage(): OfflineWriteEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(QUEUE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const entries: OfflineWriteEntry[] = [];
        for (const item of parsed) {
            if (isOfflineWriteEntry(item)) entries.push(item);
        }
        // Paranoia: never trust a foreign/hand-edited array to respect the cap.
        return entries.length > MAX_QUEUED_WRITES
            ? entries.slice(entries.length - MAX_QUEUED_WRITES)
            : entries;
    } catch {
        try {
            window.localStorage.removeItem(QUEUE_KEY);
        } catch {
            /* ignore */
        }
        return [];
    }
}

/** The queue, from the mirror when warm (O(1) — queued bodies can be
 *  hundreds of KB, so snapshot reads must not re-parse them). */
function loadQueue(): OfflineWriteEntry[] {
    if (queueMirror === null) queueMirror = parseQueueFromStorage();
    return queueMirror;
}

/** Persist `entries` and re-point the mirror at what actually landed
 *  on disk. On quota errors the OLDEST entries are evicted (the
 *  newest write — the one the user just made — survives longest).
 *  Returns the persisted list, or null when nothing would fit. */
function commitQueue(entries: OfflineWriteEntry[]): OfflineWriteEntry[] | null {
    if (typeof window === "undefined") return null;
    let toStore = entries;
    for (; ;) {
        try {
            window.localStorage.setItem(QUEUE_KEY, JSON.stringify(toStore));
            queueMirror = toStore;
            return toStore;
        } catch {
            if (toStore.length <= 1) break;
            toStore = toStore.slice(1); // evict the oldest, try again
        }
    }
    // Not even a single entry fits — reset rather than keep stale data.
    try {
        window.localStorage.removeItem(QUEUE_KEY);
    } catch {
        /* ignore */
    }
    queueMirror = [];
    return null;
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */

/* ------------------------------------------------------------------ */

/** Stable entry ids (crypto.randomUUID in secure contexts, fallback otherwise). */
function makeId(): string {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch {
        /* fall through */
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Serialized byte size (UTF-8 aware; Blob is available in browsers). */
function bodyByteSize(serialized: string): number {
    try {
        return new Blob([serialized]).size;
    } catch {
        // Conservative upper bound for the UTF-8 encoding of a UTF-16 string.
        return serialized.length * 2;
    }
}

function formatKb(bytes: number): string {
    return `${(bytes / 1024).toFixed(bytes >= 102_400 ? 0 : 1)} KB`;
}

/** Remove one entry by id (operates on the CURRENT queue — concurrent
 *  queueOfflineWrite calls are preserved). */
function removeEntryById(id: string): void {
    const queue = loadQueue();
    const next = queue.filter((entry) => entry.id !== id);
    if (next.length !== queue.length) commitQueue(next);
}

/** Increment a failed entry's attempt counter. Returns true while the
 *  entry is still queued; drops (and returns false for) entries that
 *  reached MAX_WRITE_ATTEMPTS, or that vanished (flushed elsewhere). */
function bumpEntryAttempts(id: string): boolean {
    const queue = loadQueue();
    const index = queue.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    const attempts = queue[index].attempts + 1;
    if (attempts >= MAX_WRITE_ATTEMPTS) {
        console.warn(
            `[offline-store] dropping "${queue[index].label}" after ${attempts} failed attempts.`
        );
        commitQueue(queue.filter((entry) => entry.id !== id));
        return false;
    }
    const next = queue.slice();
    next[index] = {...next[index], attempts};
    commitQueue(next);
    return true;
}

/* ------------------------------------------------------------------ */
/*  Cross-tab flush lock                                               */

/* ------------------------------------------------------------------ */

/** One Praxis tab flushes at a time. Take the lock unless a live
 *  foreign tab holds it; a lock older than LOCK_TTL_MS is abandoned
 *  (crashed tab) and can be taken over. Degrades to "allow" when
 *  localStorage is unusable (single-tab / private mode). */
function acquireFlushLock(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const raw = window.localStorage.getItem(LOCK_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { tabId?: unknown; at?: unknown };
            const foreignAndAlive =
                parsed &&
                typeof parsed.tabId === "string" &&
                parsed.tabId !== TAB_ID &&
                typeof parsed.at === "number" &&
                Date.now() - parsed.at < LOCK_TTL_MS;
            if (foreignAndAlive) return false;
        }
        window.localStorage.setItem(LOCK_KEY, JSON.stringify({tabId: TAB_ID, at: Date.now()}));
        return true;
    } catch {
        return true;
    }
}

function renewFlushLock(): void {
    try {
        window.localStorage.setItem(LOCK_KEY, JSON.stringify({tabId: TAB_ID, at: Date.now()}));
    } catch {
        /* ignore */
    }
}

function releaseFlushLock(): void {
    try {
        const raw = window.localStorage.getItem(LOCK_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { tabId?: unknown };
            if (parsed?.tabId === TAB_ID) window.localStorage.removeItem(LOCK_KEY);
        }
    } catch {
        /* ignore */
    }
}

/* ------------------------------------------------------------------ */
/*  Snapshot + emitter                                                 */

/* ------------------------------------------------------------------ */

function refreshSnapshot(): OfflineState {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const pendingWrites = loadQueue().length;
    // Referential stability: only build a new snapshot object when a
    // value actually changed (useSyncExternalStore re-render contract).
    if (
        cachedSnapshot.online !== online ||
        cachedSnapshot.pendingWrites !== pendingWrites ||
        cachedSnapshot.lastFlush !== lastFlushReport
    ) {
        cachedSnapshot = {online, pendingWrites, lastFlush: lastFlushReport};
    }
    return cachedSnapshot;
}

function emit(): void {
    const snapshot = refreshSnapshot();
    for (const cb of [...listeners]) {
        try {
            cb(snapshot);
        } catch {
            /* one broken listener must never break the queue */
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Public API — queue                                                 */

/* ------------------------------------------------------------------ */

/**
 * Queue one replayable POST write (called by save paths when the
 * request cannot reach the server — the caller decides the policy,
 * the store only persists + replays).
 *
 * Rejections are RETURNED (never thrown) as a toast-ready
 * `{ ok: false, title, description }` pair:
 *   - body ≥ 400 KB (localStorage is not a file store),
 *   - unserializable body,
 *   - non-POST method / missing URL,
 *   - localStorage quota exhausted.
 */
export function queueOfflineWrite(payload: OfflineWritePayload): QueueOfflineWriteResult {
    if (typeof window === "undefined") {
        return {
            ok: false,
            title: "Write not queued",
            description: "The offline write queue only exists in the browser.",
        };
    }
    if (payload.method !== "POST" || typeof payload.url !== "string" || !payload.url) {
        return {
            ok: false,
            title: "Write not queued",
            description: "Only POST requests to a valid URL can be replayed offline.",
        };
    }

    let serialized: string;
    try {
        serialized = JSON.stringify(payload.body);
    } catch {
        return {
            ok: false,
            title: "Write not queued",
            description: `"${payload.label}" could not be serialized for the offline queue.`,
        };
    }

    const bytes = bodyByteSize(serialized);
    if (bytes > MAX_BODY_BYTES) {
        return {
            ok: false,
            title: "File too large to save offline",
            description: `"${payload.label}" is ${formatKb(bytes)} — the offline queue caps writes at ${formatKb(
                MAX_BODY_BYTES
            )}. Keep this tab open or copy your changes somewhere safe until you are back online.`,
        };
    }

    const queue = loadQueue();
    queue.push({...payload, id: makeId(), queuedAt: Date.now(), attempts: 0});
    if (queue.length > MAX_QUEUED_WRITES) {
        // Cap: the OLDEST queued writes make room — the queue tracks the
        // most recent edits, same eviction direction as the SW file cache.
        const dropped = queue.length - MAX_QUEUED_WRITES;
        console.warn(
            `[offline-store] offline write queue full — dropping ${dropped} oldest queued write(s).`
        );
        queue.splice(0, dropped);
    }

    const stored = commitQueue(queue);
    if (stored === null) {
        return {
            ok: false,
            title: "Offline storage is full",
            description: `"${payload.label}" could not be queued — the browser rejected the write. Copy your changes somewhere safe.`,
        };
    }

    emit();
    return {ok: true, pending: stored.length};
}

/* ------------------------------------------------------------------ */
/*  Public API — flush                                                 */

/* ------------------------------------------------------------------ */

/** Replay one queued POST with a hard timeout so a hung connection
 *  cannot stall the queue (or the cross-tab lock) indefinitely. */
async function replayEntry(
    entry: OfflineWriteEntry
): Promise<"ok" | "server-error" | "network-error"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPLAY_TIMEOUT_MS);
    try {
        // Plain window.fetch — api-auth's patch (if installed) re-attaches
        // the Authorization header for /api/* automatically.
        const res = await fetch(entry.url, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(entry.body),
            signal: controller.signal,
        });
        return res.ok ? "ok" : "server-error";
    } catch {
        return "network-error";
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Replay every queued write IN ORDER via fetch. Each successful POST
 * removes its entry immediately (crash-safe); failed entries keep
 * their spot with an incremented attempt counter and are dropped
 * after MAX_WRITE_ATTEMPTS. A network error mid-flush stops the pass —
 * the remaining entries keep their counters for the next reconnect
 * instead of burning attempts against a dead network.
 *
 * No-ops (returning { flushed: 0, failed: 0 }) while the browser
 * reports offline, when another flush is already running (the
 * in-flight promise is shared), or when another tab holds the flush
 * lock. Never rejects.
 */
export function flushOfflineWrites(): Promise<OfflineFlushReport> {
    if (flushInFlight) return flushInFlight;
    if (typeof window === "undefined") return Promise.resolve({flushed: 0, failed: 0, at: Date.now()});
    // Burning retry attempts while offline would drop writes that an
    // honest reconnect would have flushed fine.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return Promise.resolve({flushed: 0, failed: 0, at: Date.now()});
    }
    if (loadQueue().length === 0) {
        return Promise.resolve({flushed: 0, failed: 0, at: Date.now()});
    }
    if (!acquireFlushLock()) {
        // Another tab is replaying the queue — its "storage" events keep
        // this tab's count in sync as entries disappear.
        return Promise.resolve({flushed: 0, failed: 0, at: Date.now()});
    }

    // Iterate a COPY — a write queued while we are awaiting the network
    // mutates the live mirror (push / cap-evict splice) and must never
    // disturb this loop's iteration; it simply flushes on a later pass.
    const snapshot = loadQueue().slice();
    const run = (async (): Promise<OfflineFlushReport> => {
        let flushed = 0;
        let failed = 0;
        try {
            for (const entry of snapshot) {
                const outcome = await replayEntry(entry);
                if (outcome === "ok") {
                    // removeEntryById re-reads the CURRENT queue, so a write
                    // queued while we were awaiting the network is preserved.
                    removeEntryById(entry.id);
                    flushed += 1;
                    emit(); // the indicator's count ticks down live
                } else {
                    failed += 1;
                    const stillQueued = bumpEntryAttempts(entry.id);
                    emit();
                    if (outcome === "network-error" && stillQueued) {
                        break; // network died mid-flush — stop burning attempts
                    }
                }
                renewFlushLock(); // heartbeat so live tabs don't take over
            }
            if (flushed > 0 || failed > 0) {
                lastFlushReport = {flushed, failed, at: Date.now()};
            }
            return {flushed, failed, at: Date.now()};
        } finally {
            releaseFlushLock();
            emit();
        }
    })();

    flushInFlight = run.then(
        (report) => report,
        (err) => {
            // The loop already catches per-entry errors; this guards bugs.
            console.warn("[offline-store] offline flush failed unexpectedly:", err);
            return {flushed: 0, failed: 0, at: Date.now()};
        }
    );
    void flushInFlight.finally(() => {
        flushInFlight = null;
    });
    return flushInFlight;
}

/* ------------------------------------------------------------------ */
/*  Public API — state                                                 */

/* ------------------------------------------------------------------ */

/** Snapshot getter (referentially stable between changes — safe for
 *  useSyncExternalStore). */
export function getOfflineState(): OfflineState {
    return refreshSnapshot();
}

/** Number of writes currently queued in localStorage. */
export function pendingWriteCount(): number {
    return loadQueue().length;
}

/**
 * Subscribe to { online, pendingWrites, lastFlush } changes
 * (window online/offline events, every queue mutation, flush
 * progress, and cross-tab "storage" updates). Returns unsubscribe.
 */
export function subscribeOffline(cb: (state: OfflineState) => void): () => void {
    listeners.add(cb);
    bindWindowListeners();
    return () => {
        listeners.delete(cb);
    };
}

/* ------------------------------------------------------------------ */
/*  Window wiring — bound once, at import time (browser only)          */

/* ------------------------------------------------------------------ */

function scheduleFlushSoon(): void {
    if (reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void flushOfflineWrites();
    }, RECONNECT_FLUSH_DELAY_MS);
}

function bindWindowListeners(): void {
    if (listenersBound || typeof window === "undefined") return;
    listenersBound = true;

    // Reconnect: flip the state immediately (the chip goes amber
    // "Syncing N writes…"), then give the network a moment to settle
    // before replaying the queue.
    window.addEventListener("online", () => {
        emit();
        scheduleFlushSoon();
    });

    window.addEventListener("offline", () => {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        emit();
    });

    // Cross-tab: another tab queued/flushed writes — drop the mirror and
    // re-emit so this tab's count stays truthful.
    // (event.key null === storage.clear().)
    window.addEventListener("storage", (event) => {
        if (event.key === null || event.key === QUEUE_KEY) {
            queueMirror = null;
            emit();
        }
    });

    // Periodic flush attempt: while ONLINE with pending writes (e.g.
    // the server restarted — no "online" event will ever fire), retry
    // on a slow cadence.
    window.setInterval(() => {
        if (flushInFlight) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        if (pendingWriteCount() === 0) return;
        void flushOfflineWrites();
    }, PERIODIC_FLUSH_INTERVAL_MS);

    // A page load that finds a leftover queue (the browser was closed
    // while offline) flushes shortly after startup.
    if (pendingWriteCount() > 0) scheduleFlushSoon();
}

if (typeof window !== "undefined") {
    bindWindowListeners();
}
