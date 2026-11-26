/**
 * Durable delivery for "Run In Console" / "Debug with Pdb" — fixes the
 * first-run-empty bugs.
 *
 * The payloads used to travel as one-shot `praxis:console-run` /
 * `praxis:debug-run` window events whose only consumers are panel
 * listeners — registered when the panel MOUNTS. On the first
 * invocation the bottom panel is still closed (or the lazy dynamic
 * chunk is still loading), so the events fired into the void: an
 * empty console opened, and the second invocation worked only because
 * the listeners existed by then.
 *
 * This module-level store makes the hand-off durable: the producer
 * writes the payload here AND dispatches the event (for the
 * already-mounted panel); the panel drains the store on mount, so the
 * first click runs as soon as it appears.
 *
 * ── Claim / acknowledge semantics (the StrictMode remount fix) ────
 *
 * React StrictMode (enabled in this app's dev config) mounts every
 * panel TWICE: effects → cleanup → effects. The DiagnosticsPanel's
 * unmount cleanup ABORTS the in-flight /api/debug request that its
 * own mount-time drain just started, and the second mount's drain
 * then found the store EMPTY (the one-shot take had already consumed
 * it) — so the very first "Run with Pdb" opened an idle panel and
 * nothing ran (the second click worked because the event-listener
 * path has no unmount cleanup racing it).
 *
 * `takePendingConsoleRun()` is therefore a CLAIM, not a consume: the
 * payload stays claimable for a short retry window so a remount can
 * re-drain it, until the consumer ACKNOWLEDGES (the console panel
 * acks the moment `submit()` takes ownership — its synchronous prefix
 * raises the busy flag or enqueues the line). `takePendingDebugRun()`
 * stays sticky for its whole TTL window (the pdb consumer's launch is
 * idempotent while a session is already running, so a retry is always
 * safe) and simply expires afterwards. Both payloads also carry a
 * hard TTL so nothing re-runs minutes later.
 */

export interface PendingConsoleRun {
    code: string;
    fileName?: string;
    queuedAt: number;
}

/** How long a queued console payload stays claimable at all (ms). */
const CONSOLE_CLAIM_TTL_MS = 8_000;
/** How long a CLAIMED-but-unacknowledged console payload may be
 *  re-claimed by a remounting panel (the StrictMode retry window). */
const CONSOLE_RECLAIM_MS = 4_000;
/** How long the sticky pdb request stays claimable (ms). */
const DEBUG_TTL_MS = 2_000;

let pending: PendingConsoleRun | null = null;
let pendingClaimedAt = 0;

/** Queue a run-in-console payload and notify any mounted panel.
 *  The mounted panel consumes the EVENT; a not-yet-mounted panel will
 *  drain `takePendingConsoleRun()` in its mount effect. */
export function queueConsoleRun(code: string, fileName?: string): void {
    pending = {code, fileName, queuedAt: Date.now()};
    pendingClaimedAt = 0;
    try {
        window.dispatchEvent(
            new CustomEvent("praxis:console-run", {
                detail: {code, fileName},
            })
        );
    } catch {
        /* no window (SSR) — the store alone still carries it */
    }
}

/** CLAIM the pending payload — returns it while it is still live,
 *  WITHOUT retiring it: a panel that mounts, claims and then gets
 *  torn down before the run started (React StrictMode double-mount,
 *  python ↔ non-python remounts) leaves the payload claimable so the
 *  next mount retries. The consumer retires it via
 *  `acknowledgePendingConsoleRun()` once the run has truly started. */
export function takePendingConsoleRun(): PendingConsoleRun | null {
    if (!pending) return null;
    const now = Date.now();
    if (now - pending.queuedAt > CONSOLE_CLAIM_TTL_MS) {
        pending = null;
        pendingClaimedAt = 0;
        return null;
    }
    if (pendingClaimedAt === 0) {
        pendingClaimedAt = now;
    } else if (now - pendingClaimedAt > CONSOLE_RECLAIM_MS) {
        // Claimed long ago without an ack — treat as consumed so a much
        // later, unrelated remount can't re-run the same code.
        return null;
    }
    return {...pending};
}

/** Acknowledge the pending console run — the panel calls this once it
 *  has taken ownership (submit's synchronous prefix raised the busy
 *  flag or enqueued the line). Retires the payload so no remount can
 *  double-run it. */
export function acknowledgePendingConsoleRun(): void {
    pending = null;
    pendingClaimedAt = 0;
}

/** Queue a debug-with-pdb request: opens the Diagnostics panel on the
 *  debug tool and starts the session. Same durable-store pattern — the
 *  panel drains it on mount, an already-mounted panel takes the event. */
let pendingDebug = false;
let pendingDebugAt = 0;

export function queueDebugRun(): void {
    pendingDebug = true;
    pendingDebugAt = Date.now();
    try {
        window.dispatchEvent(new CustomEvent("praxis:debug-run"));
    } catch {
        /* SSR — store alone */
    }
}

/** STICKY claim for the debug request: returns true for the whole TTL
 *  window. The pdb consumer's mount-time drain can be aborted by its
 *  own unmount cleanup (StrictMode double-mount) — the sticky window
 *  lets the SECOND mount re-drain and actually launch the session.
 *  The consumer ignores the request while a debug session is already
 *  running, so retries are idempotent; the TTL bounds it. */
export function takePendingDebugRun(): boolean {
    if (!pendingDebug) return false;
    if (Date.now() - pendingDebugAt > DEBUG_TTL_MS) {
        pendingDebug = false;
        return false;
    }
    return true;
}

/** Queue an "open the inline Edit-with-AI card" request — the
 *  Explorer's file right-click uses this after selecting a file: the
 *  freshly-mounting CodeViewer drains it in its mount effect; an
 *  already-mounted viewer consumes the event. Same durable pattern as
 *  the console/debug requests. (One-shot: the viewer's drain IS the
 *  delivery — opening the card twice is visible.) */
let pendingInlineAi = false;

export function queueInlineAi(): void {
    pendingInlineAi = true;
    try {
        window.dispatchEvent(new CustomEvent("praxis:open-inline-ai"));
    } catch {
        /* SSR — store alone */
    }
}

/** One-shot drain for the inline-AI request. */
export function takePendingInlineAi(): boolean {
    const p = pendingInlineAi;
    pendingInlineAi = false;
    return p;
}
