"use client";

import * as React from "react";

/**
 * stable-identity event handler hook (the community
 * "useEffectEvent" pattern, before React ships it natively).
 *
 * `useStableEvent(fn)` returns a function whose identity NEVER changes
 * but that always invokes the LATEST `fn` passed in. This is the exact
 * tool the page needs for its MenuBar prop wiring:
 *
 *   const onRun = useStableEvent(handleRun);
 *   const menuBar = React.useMemo(=> <MenuBar onRun={onRun} ... />,
 *                                  [valueProps...]);
 *
 * — the memoized MenuBar element holds stable handler identities (so
 * React can bail out of re-rendering the 2600-element menu tree on
 * every selection change), yet every menu click runs the handler from
 * the CURRENT render. No stale closures, no 900 ms re-renders.
 *
 * Implementation notes:
 * - `useInsertionEffect` updates the ref before layout effects fire, so
 *   even handlers invoked synchronously after commit see fresh values.
 * - The returned function is created once (`useMemo` with an empty
 *   dep list) — identity is stable for the component's lifetime.
 * - fn is captured in a ref on EVERY render (including the ones where
 *   the memoized element is skipped), so staleness is impossible.
 */
export function useStableEvent<A extends unknown[], R>(
    fn: (...args: A) => R
): (...args: A) => R {
    const ref = React.useRef(fn);
    React.useInsertionEffect(() => {
        ref.current = fn;
    });
    return React.useMemo(() => {
        const stable = (...args: A) => ref.current(...args);
        return stable;
    }, []);
}
