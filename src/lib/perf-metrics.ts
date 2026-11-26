/**
 * perf-metrics.ts — the global, dependency-free performance metrics hub
 * behind the built-in Perf HUD (item G23).
 *
 * Purpose: make regressions show up as NUMBERS before they show up as
 * flicker. The hub continuously measures, while at least one subscriber
 * (the HUD) is mounted:
 *
 *   - fps              rolling 60-frame average via requestAnimationFrame
 *   - frameMs          average frame time over the same 60-frame window
 *   - keydownToPaintMs keystroke → next-paint latency (double-rAF trick),
 *                     rolling median of the last 20 keystrokes
 *   - frameLongTasks   PerformanceObserver "longtask" count over the
 *                     trailing 10 seconds (main-thread stalls > 50 ms)
 *   - sseBytesPerSec   trailing 1-second sum of bytes reported by SSE
 *                     consumers via noteSseBytes(n) — safe when unused
 *   - queueDepths      latest spell-check / lint queue depths, reported
 *                     by the workers via noteQueueDepth(kind, n)
 *   - renderCounts     cumulative per-panel render counters, bumped
 *                     by panels via reportPanelRender("Editor") or
 *                     noteRender("Editor") — same registry, both count
 *   - heapMB           usedJSHeapSize via performance.memory (Chromium
 *                     only — null everywhere else)
 *
 * Zero-cost when disabled: nothing at module scope touches the DOM, and
 * the rAF loop, the keydown listener and the PerformanceObserver only
 * run while `perfMetrics.subscribe(cb)` has at least one live
 * subscriber. The last unsubscribe tears everything down.
 *
 * Passive counters (queue depths, render counts, SSE samples) are safe
 * to note even while the hub is stopped — they are plain state writes
 * that the next subscribed session reads back.
 *
 * SSR-safe: every window / PerformanceObserver / performance.memory
 * access is guarded; importing this module on the server is a no-op.
 * Silent by design — nothing here ever logs to the console.
 */

/** Queue kinds reported by the background spell-check / lint workers. */
export type PerfQueueKind = "spell" | "lint";

/** Immutable point-in-time readout of every metric the HUD displays. */
export interface PerfMetricSnapshot {
    /** Rolling 60-frame average frames-per-second (null before 2 frames). */
    fps: number | null;
    /** Average frame time in ms over the same rolling window. */
    frameMs: number | null;
    /** Rolling MEDIAN keystroke → paint latency in ms (last 20 keys);
     * null until the first keystroke is measured while subscribed. */
    keydownToPaintMs: number | null;
    /** Long tasks (> 50 ms main-thread tasks) started in the last 10 s. */
    frameLongTasks: number;
    /** Bytes received over the trailing 1-second SSE window. */
    sseBytesPerSec: number;
    /** Latest reported spell / lint queue depths. */
    queueDepths: { spell: number; lint: number };
    /** Cumulative render counts per panel label. */
    renderCounts: Record<string, number>;
    /** Used JS heap in MB, or null where performance.memory is missing. */
    heapMB: number | null;
}

/** Listener invoked ~4×/second with a fresh snapshot while subscribed. */
export type PerfMetricsListener = (snapshot: PerfMetricSnapshot) => void;

// ─── tuning constants ────────────────────────────────────────────────
const FPS_WINDOW = 60;
const KEY_LATENCY_WINDOW = 20;
const LONG_TASK_WINDOW_MS = 10_000;
const SSE_WINDOW_MS = 1_000;
/** Hard cap so a chatty stream can never grow the sample list forever. */
const SSE_MAX_SAMPLES = 4096;
/** Cap distinct noteRender labels so dynamic labels can't leak memory. */
const MAX_RENDER_LABELS = 64;
/** Snapshot/notify cadence — 4 Hz, so the HUD itself never skews FPS. */
const EMIT_INTERVAL_MS = 250;
/** Frame gaps ≥ 1 s mean the tab was hidden — skip them in the FPS avg. */
const HIDDEN_FRAME_GAP_MS = 1_000;
const MB = 1024 * 1024;

// ─── passive state (always alive, cheap to write) ───────────────────
let queueDepths: { spell: number; lint: number } = {spell: 0, lint: 0};
const renderCounts = new Map<string, number>();
/** `[receivedAt, bytes]` samples inside the trailing 1 s window. */
let sseSamples: Array<{ t: number; bytes: number }> = [];

// ─── loop state (only meaningful while running) ─────────────────────
const listeners = new Set<PerfMetricsListener>();
let running = false;
let rafId = 0;
let lastFrameAt = 0;
let lastEmitAt = 0;
let frameCount = 0;
let frameDeltas = new Float64Array(FPS_WINDOW);
let keyLatencies: number[] = [];
let keydownInFlight = false;
/** Bumped on stop() so an in-flight double-rAF chain aborts cleanly. */
let keydownEpoch = 0;
let longTaskStarts: number[] = [];
let longTaskObserver: PerformanceObserver | null = null;

// ─── small helpers ───────────────────────────────────────────────────
function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** performance.memory is Chromium-only and NOT in the standard DOM
 * types — reach it through a local structural type instead of `any`. */
interface PerfMemoryLike {
    usedJSHeapSize: number;
}

function readHeapMB(): number | null {
    try {
        const mem = (performance as unknown as { memory?: PerfMemoryLike })
            .memory;
        if (mem && Number.isFinite(mem.usedJSHeapSize) && mem.usedJSHeapSize > 0) {
            return mem.usedJSHeapSize / MB;
        }
    } catch {
        // Some engines throw on property access — a dev HUD never logs.
    }
    return null;
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pruneLongTasks(now: number): void {
    const cutoff = now - LONG_TASK_WINDOW_MS;
    if (longTaskStarts.length > 0 && longTaskStarts[0] < cutoff) {
        longTaskStarts = longTaskStarts.filter((t) => t >= cutoff);
    }
}

function pruneSseSamples(now: number): void {
    const cutoff = now - SSE_WINDOW_MS;
    let i = 0;
    while (i < sseSamples.length && sseSamples[i].t < cutoff) i++;
    if (i > 0) sseSamples.splice(0, i);
}

// ─── snapshot ────────────────────────────────────────────────────────
function buildSnapshot(now: number): PerfMetricSnapshot {
    pruneLongTasks(now);
    pruneSseSamples(now);

    const frames = Math.min(frameCount, FPS_WINDOW);
    let frameMs: number | null = null;
    if (frames >= 2) {
        let sum = 0;
        for (let i = 0; i < frames; i++) sum += frameDeltas[i];
        frameMs = sum / frames;
    }
    const fps = frameMs !== null && frameMs > 0 ? 1000 / frameMs : null;

    let sseBytes = 0;
    for (const sample of sseSamples) sseBytes += sample.bytes;

    const counts: Record<string, number> = {};
    for (const [label, count] of renderCounts) counts[label] = count;

    return {
        fps,
        frameMs,
        keydownToPaintMs: keyLatencies.length > 0 ? median(keyLatencies) : null,
        frameLongTasks: longTaskStarts.length,
        sseBytesPerSec: sseBytes,
        queueDepths: {spell: queueDepths.spell, lint: queueDepths.lint},
        renderCounts: counts,
        heapMB: readHeapMB(),
    };
}

// ─── measurement plumbing (attached only while running) ─────────────
const onKeyDown = (): void => {
    if (keydownInFlight) return; // key-repeat bursts measure once
    keydownInFlight = true;
    const startedAt = performance.now();
    const epoch = keydownEpoch;
    // rAF #1 fires BEFORE the paint this keystroke schedules; rAF #2
    // fires right AFTER it — so startedAt → now is keystroke → paint.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (epoch !== keydownEpoch) return; // hub stopped mid-flight
            keydownInFlight = false;
            keyLatencies.push(performance.now() - startedAt);
            if (keyLatencies.length > KEY_LATENCY_WINDOW) keyLatencies.shift();
        });
    });
};

const tick = (now: number): void => {
    if (!running) return;
    if (lastFrameAt !== 0) {
        const dt = now - lastFrameAt;
        if (dt < HIDDEN_FRAME_GAP_MS) {
            frameDeltas[frameCount % FPS_WINDOW] = dt;
            frameCount++;
        }
        // dt ≥ 1 s ⇒ the tab was hidden / rAF paused — a single such gap
        // would drag the 60-frame FPS average to ~1; skip it instead.
    }
    lastFrameAt = now;
    if (now - lastEmitAt >= EMIT_INTERVAL_MS) {
        lastEmitAt = now;
        const snapshot = buildSnapshot(now);
        for (const listener of listeners) listener(snapshot);
    }
    rafId = requestAnimationFrame(tick);
};

function attachLongTaskObserver(): void {
    if (typeof PerformanceObserver === "undefined") return;
    try {
        const supported = PerformanceObserver.supportedEntryTypes;
        if (Array.isArray(supported) && !supported.includes("longtask")) {
            return; // Firefox / Safari — silently degrade, never log
        }
        longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                longTaskStarts.push(entry.startTime);
            }
        });
        longTaskObserver.observe({entryTypes: ["longtask"]});
    } catch {
        longTaskObserver = null; // entry type unsupported/disabled — fine
    }
}

function start(): void {
    if (running || typeof window === "undefined") return;
    running = true;
    lastFrameAt = 0; // first frame only establishes the baseline
    lastEmitAt = nowMs();
    window.addEventListener("keydown", onKeyDown, {
        capture: true,
        passive: true,
    });
    attachLongTaskObserver();
    rafId = requestAnimationFrame(tick);
}

function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener("keydown", onKeyDown, {capture: true});
    if (longTaskObserver) {
        longTaskObserver.disconnect();
        longTaskObserver = null;
    }
    keydownEpoch++; // abort any in-flight keystroke measurement
    keydownInFlight = false;
}

// ─── public note* API (safe any time, even while stopped) ───────────

/**
 * Report bytes received on an SSE/stream connection. Call it wherever
 * a stream chunk is read, e.g. next to `reader.read()` in the run/
 * console/terminal panels:
 *
 *   const { value } = await reader.read();
 *   noteSseBytes(value?.byteLength ?? 0);
 *
 * The hub keeps a trailing 1-second window; when nobody subscribes the
 * samples simply expire — calling this while the HUD is closed is a
 * cheap no-op-ish push, and never logs.
 */
export function noteSseBytes(n: number): void {
    if (!(n > 0)) return; // ignore 0 / negative / NaN
    const now = nowMs();
    pruneSseSamples(now);
    sseSamples.push({t: now, bytes: n});
    if (sseSamples.length > SSE_MAX_SAMPLES) {
        sseSamples.splice(0, sseSamples.length - SSE_MAX_SAMPLES);
    }
}

/** Report the current spell-check or lint work-queue depth. */
export function noteQueueDepth(kind: PerfQueueKind, depth: number): void {
    queueDepths[kind] = Number.isFinite(depth)
        ? Math.max(0, Math.floor(depth))
        : 0;
}

/**
 * Bump the cumulative render counter for a panel label. Panels call
 * this from their component body (see perf-hud.tsx for the exact
 * integration snippet) — e.g. `noteRender("Editor")`. Unknown labels
 * beyond MAX_RENDER_LABELS are ignored so dynamic labels can't leak.
 */
export function noteRender(label: string): void {
    const current = renderCounts.get(label);
    if (current !== undefined) {
        renderCounts.set(label, current + 1);
        return;
    }
    if (renderCounts.size >= MAX_RENDER_LABELS) return;
    renderCounts.set(label, 1);
}

// ─── panel render reporting (the tiny API the HUD reads) ───────────

/** Longest panel id worth a row in the HUD — longer ids are ignored so
 * a dynamically generated id can never sneak into the top-6 list. */
const MAX_PANEL_ID_LEN = 24;

/**
 * The one-liner panels call from the TOP of their component body to
 * count themselves into the HUD's "render counts" list:
 *
 *   import { reportPanelRender } from "@/lib/perf-metrics";
 *   export function TerminalPanel(props: …) {
 *     reportPanelRender("Terminal");   // ← ~zero cost, any time
 *     // …existing component code…
 *   }
 *
 * Same registry as noteRender (labels stay comparable across both
 * entry points), but hardened for the "panel id came from a variable"
 * case: trimmed, non-empty, ≤ 24 chars, string-only. Safe while the
 * hub is stopped — the counter is plain module state that the next
 * subscribed session reads back.
 */
export function reportPanelRender(panelId: string): void {
    if (typeof panelId !== "string") return;
    const label = panelId.trim();
    if (label.length === 0 || label.length > MAX_PANEL_ID_LEN) return;
    noteRender(label);
}

// ─── the singleton hub ───────────────────────────────────────────────
/**
 * `perfMetrics` — subscribe to keep the measurement loop alive and
 * receive snapshots at 4 Hz; the note* writers are also mirrored as
 * methods for `import { perfMetrics } from "@/lib/perf-metrics"`
 * convenience.
 */
export const perfMetrics = {
    /**
     * Subscribe to 4 Hz snapshot updates. The FIRST subscriber starts
     * the rAF loop, keydown listener and longtask observer; the LAST
     * unsubscribe stops all of them (zero cost when the HUD is closed).
     */
    subscribe(listener: PerfMetricsListener): () => void {
        listeners.add(listener);
        if (listeners.size === 1) start();
        return () => {
            if (!listeners.delete(listener)) return;
            if (listeners.size === 0) stop();
        };
    },

    /**
     * Current snapshot. Usable any time — passive counters are always
     * current; fps/latency/longtask values reflect the last subscribed
     * session (zeros before the first one).
     */
    getSnapshot(): PerfMetricSnapshot {
        return buildSnapshot(nowMs());
    },

    /** Clear all accumulated counters (handy before a measurement run). */
    reset(): void {
        frameDeltas = new Float64Array(FPS_WINDOW);
        frameCount = 0;
        keyLatencies = [];
        longTaskStarts = [];
        sseSamples = [];
        queueDepths = {spell: 0, lint: 0};
        renderCounts.clear();
    },

    noteSseBytes,
    noteQueueDepth,
    noteRender,
    reportPanelRender,
};
