/**
 * rAF throttle — coalesces a burst of synchronous calls into ONE call
 * per animation frame (the last arguments win).
 *
 * Built for drag-resize handlers: pointermove fires faster than the
 * display refreshes, and each direct `setState` re-renders the whole
 * page component — the classic "IDE lags while resizing" source. Wrapping
 * the setState in this throttle means React re-renders at most once per
 * frame no matter how many pointermove events fire.
 */
export function rafThrottle<Args extends unknown[]>(fn: (...args: Args) => void): {
    (...args: Args): void;
    cancel(): void;
} {
    let raf = 0;
    let lastArgs: Args | null = null;
    const scheduled: { (...args: Args): void; cancel(): void } = ((...args: Args) => {
        lastArgs = args;
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            const argsToUse = lastArgs;
            lastArgs = null;
            if (argsToUse) fn(...argsToUse);
        });
    }) as { (...args: Args): void; cancel(): void };
    scheduled.cancel = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        lastArgs = null;
    };
    return scheduled;
}
