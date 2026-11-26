/**
 * lsp-debounce.test.ts — unit tests for src/lib/lsp-debounce.ts.
 *
 * The suite proves the five documented invariants using a manual clock
 * (no fake timers): the flush list records (time, payload) pairs and
 * the tests advance the clock explicitly.
 *
 *   INVARIANT 1 trailing edge — one flush per quiet period, with the
 *   LATEST payload only (latest-wins).
 *   INVARIANT 2 max wait — continuous pushes still flush within
 *   maxWaitMs of the window's first push (no starvation).
 *   INVARIANT 3 single timer — the scheduler sees at most one live
 *   handle at a time.
 *   INVARIANT 4 cancel — pending payload dropped, callback never fires.
 *   INVARIANT 5 flush — immediate delivery, window reset.
 */
import {describe, expect, it} from "vitest";
import {createLspDebouncer, type DebounceClock, type DebounceTimerHandle} from "@/lib/lsp-debounce";

/** A manual clock the tests advance deterministically. */
class ManualClock implements DebounceClock {
    /** Every schedule() call, newest last. */
    public readonly scheduled: Array<{ at: number; ms: number; task: () => void; handle: number }> = [];
    /** Handles cancelled so far. */
    public readonly cancelled: number[] = [];
    /** Current virtual time. */
    private nowMs = 0;
    /** The next handle id to hand out. */
    private nextHandle = 1;

    /** Advance virtual time, running tasks whose deadline passed (FIFO). */
    public advance(ms: number): void {
        // Compute the new virtual time.
        const target = this.nowMs + ms;
        // Run due tasks in deadline order until the target is reached.
        for (; ;) {
            // The earliest still-scheduled task at or before the target.
            const due = this.scheduled.find(
                (s) => !this.cancelled.includes(s.handle) && s.at <= target
            );
            // Nothing due — stop.
            if (!due) break;
            // Jump the clock to the task's deadline.
            this.nowMs = Math.max(this.nowMs, due.at);
            // Mark it consumed by cancelling (it already fired).
            this.cancelled.push(due.handle);
            // Fire it.
            due.task();
        }
        // Land on the target time.
        this.nowMs = target;
    }

    /** The current virtual time. */
    public now(): number {
        // Straight read.
        return this.nowMs;
    }

    /** Schedule a task at now + ms. */
    public schedule(task: () => void, ms: number): DebounceTimerHandle {
        // The deadline for this task.
        const at = this.nowMs + ms;
        // The unique handle.
        const handle = this.nextHandle++;
        // Record it.
        this.scheduled.push({at, ms, task, handle});
        // Return the handle.
        return handle;
    }

    /** Cancel a handle. */
    public cancel(handle: DebounceTimerHandle): void {
        // Record the cancellation.
        this.cancelled.push(handle as number);
    }

    /** Live (scheduled + not cancelled) task count — INVARIANT 3 probe. */
    public liveTimers(): number {
        // Count tasks that are scheduled and not cancelled.
        return this.scheduled.filter((s) => !this.cancelled.includes(s.handle)).length;
    }
}

/** Build a debouncer wired to a fresh ManualClock; returns both plus the flush log. */
function rig<T>(delayMs: number, maxWaitMs: number) {
    // The manual clock.
    const clock = new ManualClock();
    // The flush log: (virtual time, payload).
    const log: Array<{ at: number; payload: T }> = [];
    // The debouncer under test.
    const debouncer = createLspDebouncer<T>({
        delayMs,
        maxWaitMs,
        clock,
        onFlush: (payload) => log.push({at: clock.now(), payload}),
    });
    // Hand back everything the assertions need.
    return {clock, debouncer, log};
}

describe("createLspDebouncer — INVARIANT 1 (trailing edge, latest-wins)", () => {
    it("flushes once with the latest payload after the quiet period", () => {
        // A 100ms trailing edge with a 1s ceiling.
        const {clock, debouncer, log} = rig<string>(100, 1000);
        // Push three payloads in quick succession.
        debouncer.push("a");
        // 30ms of typing.
        clock.advance(30);
        debouncer.push("b");
        // 30 more ms.
        clock.advance(30);
        debouncer.push("c");
        // Nothing has flushed yet.
        expect(log).toEqual([]);
        // Wait out the quiet period after the LAST push.
        clock.advance(100);
        // Exactly one flush, with the latest payload, 100ms after "c".
        expect(log).toEqual([{at: 160, payload: "c"}]);
    });

    it("schedules a fresh window after each flush", () => {
        // The rig.
        const {clock, debouncer, log} = rig<string>(50, 500);
        // First burst.
        debouncer.push("one");
        clock.advance(50);
        // Second burst.
        debouncer.push("two");
        clock.advance(50);
        // Two flushes, one per quiet period.
        expect(log.map((l) => l.payload)).toEqual(["one", "two"]);
    });
});

describe("createLspDebouncer — INVARIANT 2 (max wait)", () => {
    it("flushes within maxWaitMs under continuous pushes", () => {
        // 200ms trailing edge, 600ms hard ceiling.
        const {clock, debouncer, log} = rig<number>(200, 600);
        // Open the window at t=0.
        debouncer.push(1);
        // Keep pushing every 150ms — the trailing edge never arrives.
        for (let i = 2; i <= 6; i++) {
            // 150ms gap.
            clock.advance(150);
            // Push again.
            debouncer.push(i);
        }
        // At t=750 (6 pushes), the max-wait flush must already have fired
        // (the window opened at t=0, ceiling 600ms).
        const firstFlush = log[0]!;
        // The flush happened no later than the ceiling.
        expect(firstFlush.at).toBeLessThanOrEqual(600);
        // It carried the payload live at the deadline.
        expect(firstFlush.payload).toBe(4);
        // Let the second window (opened by push 5) run its course.
        clock.advance(400);
        // A later push opened a new window and flushed again, latest-wins.
        expect(log.length).toBe(2);
        expect(log[1]!.payload).toBe(6);
    });

    it("never lets the pending payload age past maxWaitMs", () => {
        // Aggressive typing: push every 50ms against a 300ms ceiling.
        const {clock, debouncer, log} = rig<string>(200, 300);
        // Type for a full 2 seconds.
        for (let t = 0; t < 2000; t += 50) {
            // Push.
            debouncer.push(`p${t}`);
            // Advance to the next push.
            clock.advance(50);
        }
        // Every flush must have happened within 300ms of its window's
        // first push; with pushes every 50ms that means a flush at least
        // every ~300ms across a 2s span.
        expect(log.length).toBeGreaterThanOrEqual(6);
        // And no flush gap ever exceeded the ceiling.
        for (let i = 1; i < log.length; i++) {
            // Gap between consecutive flushes.
            const gap = log[i]!.at - log[i - 1]!.at;
            // The ceiling (plus scheduling slop of the push cadence).
            expect(gap).toBeLessThanOrEqual(300 + 50);
        }
    });
});

describe("createLspDebouncer — INVARIANT 3 (single timer)", () => {
    it("keeps at most one live timer while pushes stack up", () => {
        // The rig.
        const {clock, debouncer} = rig<string>(100, 1000);
        // First push opens the window and schedules a timer.
        debouncer.push("a");
        // One live timer.
        expect(clock.liveTimers()).toBe(1);
        // A burst of pushes.
        for (let i = 0; i < 10; i++) {
            // 10ms apart.
            clock.advance(10);
            // Push again.
            debouncer.push(`x${i}`);
        }
        // Still exactly one live timer.
        expect(clock.liveTimers()).toBe(1);
    });

    it("clears the timer when it fires", () => {
        // The rig.
        const {clock, debouncer} = rig<string>(50, 500);
        // Push and let it flush.
        debouncer.push("a");
        clock.advance(50);
        // The timer is gone.
        expect(clock.liveTimers()).toBe(0);
        // And nothing is pending.
        expect(debouncer.pending()).toBe(false);
    });
});

describe("createLspDebouncer — INVARIANT 4 (cancel)", () => {
    it("drops the payload and never fires the callback", () => {
        // The rig.
        const {clock, debouncer, log} = rig<string>(50, 500);
        // Push.
        debouncer.push("doomed");
        // Pending.
        expect(debouncer.pending()).toBe(true);
        // Cancel before the timer fires.
        debouncer.cancel();
        // Run the clock far past the deadline.
        clock.advance(1000);
        // The callback never fired.
        expect(log).toEqual([]);
        // Nothing pending.
        expect(debouncer.pending()).toBe(false);
        // No live timers.
        expect(clock.liveTimers()).toBe(0);
    });

    it("cancels cleanly when nothing is pending", () => {
        // The rig.
        const {debouncer} = rig<string>(50, 500);
        // Cancel on an idle debouncer.
        expect(() => debouncer.cancel()).not.toThrow();
    });
});

describe("createLspDebouncer — INVARIANT 5 (flush now)", () => {
    it("fires immediately with the pending payload", () => {
        // The rig.
        const {clock, debouncer, log} = rig<string>(500, 5000);
        // Push a payload with a long trailing edge.
        debouncer.push("now");
        // Flush immediately.
        debouncer.flush();
        // It fired at the current virtual time.
        expect(log).toEqual([{at: 0, payload: "now"}]);
        // The window reset — a later push starts a fresh one.
        debouncer.push("next");
        clock.advance(500);
        // The second payload flushed on its own schedule.
        expect(log.map((l) => l.payload)).toEqual(["now", "next"]);
    });

    it("flush is a no-op when idle", () => {
        // The rig.
        const {debouncer, log} = rig<string>(50, 500);
        // Flush with nothing pending.
        expect(() => debouncer.flush()).not.toThrow();
        // No flush was recorded.
        expect(log).toEqual([]);
    });
});

describe("createLspDebouncer — configuration guards", () => {
    it("treats maxWaitMs below delayMs as delayMs", () => {
        // A ceiling SMALLER than the quiet period.
        const {clock, debouncer, log} = rig<string>(100, 10);
        // Push once.
        debouncer.push("a");
        // The effective ceiling is the 100ms delay.
        clock.advance(100);
        // It flushed at the trailing edge, not before.
        expect(log).toEqual([{at: 100, payload: "a"}]);
    });
});
