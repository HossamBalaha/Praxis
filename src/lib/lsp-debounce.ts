/**
 * lsp-debounce.ts — the debounce primitive behind every LSP request the
 * client makes.
 *
 * A plain trailing-edge debounce is NOT enough for editor traffic: a
 * user typing continuously keeps pushing the flush point out forever
 * ("starvation") — the document sync would never reach the server while
 * the user is on a roll. The debouncer therefore guarantees BOTH:
 *
 *   INVARIANT 1 (trailing edge) — after `delayMs` of silence following
 *   the last push, the callback fires exactly once, with the LATEST
 *   payload. Intermediate payloads are dropped (latest-wins), so a
 *   burst of keystrokes sends one hover request, not twenty.
 *
 *   INVARIANT 2 (max wait) — under CONTINUOUS pushes, a flush happens
 *   within `maxWaitMs` of the push that started the current pending
 *   window. Typing can delay a flush by at most `maxWaitMs − delayMs`.
 *
 *   INVARIANT 3 (single timer) — at most one scheduled timer exists at
 *   any moment; a push never stacks a second timer on a pending one.
 *
 *   INVARIANT 4 (cancel) — `cancel()` drops the pending payload and
 *   timer without ever firing the callback (used when a file closes or
 *   the LSP turns out to be unavailable).
 *
 *   INVARIANT 5 (flush) — `flush()` fires the callback immediately with
 *   the pending payload (if any) and resets the pending window, so a
 *   caller that needs the sync to land NOW (an explicit hover request)
 *   never waits out the timer.
 *
 * The clock and timer functions are injectable, which is what makes
 * the invariants unit-testable without fake-timer magic — the tests
 * drive a manual clock and assert exact flush times.
 *
 * Pure module: no DOM, no fetch, no spawn.
 */

/** Timer handle as produced by the injected (or real) scheduler. */
export type DebounceTimerHandle = unknown;

/** Injectable clock + scheduler (defaults: Date.now / setTimeout / clearTimeout). */
export interface DebounceClock {
    /** Monotonic-enough now in milliseconds. */
    now(): number;

    /** Schedule `task` to run in `ms`; returns a cancellable handle. */
    schedule(task: () => void, ms: number): DebounceTimerHandle;

    /** Cancel a scheduled handle. */
    cancel(handle: DebounceTimerHandle): void;
}

/** The real-world clock used when none is injected. */
const defaultClock: DebounceClock = {
    // Wall clock matches how the deadlines are compared.
    now: () => Date.now(),
    // Delegate to the global timer.
    schedule: (task, ms) => setTimeout(task, ms),
    // Delegate to the global canceller.
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Options shaping one debouncer instance. */
export interface LspDebouncerOptions<T> {
    /** Quiet period (trailing edge) before the flush fires. */
    delayMs: number;
    /** Hard ceiling on how long a pending window may stay unflushed. */
    maxWaitMs: number;
    /** The sink invoked with the latest payload on every flush. */
    onFlush: (payload: T) => void;
    /** Injectable clock (tests pass a manual one). */
    clock?: DebounceClock;
}

/** The debouncer's public surface. */
export interface LspDebouncer<T> {
    /** Record a new payload, (re)starting the trailing-edge window. */
    push(payload: T): void;

    /** True when a payload is pending and a timer is scheduled. */
    pending(): boolean;

    /** Fire the pending payload NOW (no-op when nothing is pending). */
    flush(): void;

    /** Drop the pending payload and timer; the callback never fires. */
    cancel(): void;
}

/**
 * Create a trailing-edge, max-wait-capped debouncer for payloads of
 * type T. See the module header for the five invariants this enforces.
 */
export function createLspDebouncer<T>(options: LspDebouncerOptions<T>): LspDebouncer<T> {
    // Resolve the clock (injected for tests, real one otherwise).
    const clock = options.clock ?? defaultClock;
    // The quiet period before a flush.
    const delayMs = Math.max(0, options.delayMs);
    // The pending-window ceiling (never smaller than the delay).
    const maxWaitMs = Math.max(delayMs, options.maxWaitMs);
    // The latest payload not yet flushed.
    let pendingPayload: T | undefined;
    // The single scheduled timer handle (INVARIANT 3).
    let timerHandle: DebounceTimerHandle | null = null;
    // When the current pending window STARTED (the max-wait reference).
    // null = no window open. A dedicated null sentinel — NOT the number
    // 0 — because a window legitimately opened at time 0 must keep its
    // own start (using `> 0` as the "open" test silently re-anchored the
    // max-wait deadline on every push and the ceiling never bound).
    let windowStartAt: number | null = null;

    /** Clear any scheduled timer. */
    const clearTimer = () => {
        // Nothing scheduled — nothing to do.
        if (timerHandle === null) return;
        // Cancel through the clock abstraction.
        clock.cancel(timerHandle);
        // Forget the handle.
        timerHandle = null;
    };

    /** Fire the callback with the pending payload and reset the window. */
    const fire = () => {
        // Drop the timer first so the state is consistent even if the
        // callback itself pushes synchronously.
        clearTimer();
        // Capture the payload before resetting.
        const payload = pendingPayload;
        // Reset the pending state (the window is over).
        pendingPayload = undefined;
        windowStartAt = null;
        // Only a real payload fires (a stray timer with no payload is a no-op).
        if (payload !== undefined) {
            // Deliver to the sink.
            options.onFlush(payload);
        }
    };

    /** (Re)schedule the timer for the current pending window. */
    const schedule = () => {
        // Always run with at most one live timer (INVARIANT 3).
        clearTimer();
        // When the window started (now, if this push opened it).
        const startedAt = windowStartAt ?? clock.now();
        // Remember the window start for later pushes.
        windowStartAt = startedAt;
        // Deadline from the trailing edge.
        const trailingDeadline = clock.now() + delayMs;
        // Deadline from the max-wait ceiling (INVARIANT 2).
        const maxWaitDeadline = startedAt + maxWaitMs;
        // Fire at whichever deadline comes FIRST.
        const wait = Math.max(0, Math.min(trailingDeadline, maxWaitDeadline) - clock.now());
        // Schedule the single timer.
        timerHandle = clock.schedule(() => {
            // The timer ran — the pending window flushes now.
            fire();
        }, wait);
    };

    /** Record a payload and (re)arm the trailing window. */
    const push = (payload: T) => {
        // Latest-wins: overwrite whatever was pending (INVARIANT 1).
        pendingPayload = payload;
        // (Re)arm the single timer with both deadlines — schedule() also
        // anchors the window start when none is open (it must live there,
        // not here, so a window opened at time 0 keeps its own anchor).
        schedule();
    };

    /** True when a payload is waiting and a timer is armed. */
    const pending = () => {
        // Pending means a payload exists (the timer is implied).
        return pendingPayload !== undefined;
    };

    /** Flush immediately (INVARIANT 5). */
    const flush = () => {
        // Nothing pending — a clean no-op.
        if (pendingPayload === undefined) return;
        // Fire the callback right now.
        fire();
    };

    /** Drop everything (INVARIANT 4). */
    const cancel = () => {
        // Disarm the timer.
        clearTimer();
        // Forget the payload.
        pendingPayload = undefined;
        // Close the pending window.
        windowStartAt = null;
    };

    // Hand back the debouncer surface.
    return {push, pending, flush, cancel};
}
