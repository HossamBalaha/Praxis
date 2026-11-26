"use client";

/**
 * lazy access to the example library.
 *
 * `@/lib/examples` re-exports ~60 data modules from `examples-data/` —
 * roughly 5 MB of TypeScript holding ~2,900 ready-made example files.
 * page.tsx, MenuBar and FolderTree all imported it STATICALLY, so the
 * whole library was part of the home page's client module graph:
 *
 *   - every cold `bun run dev` first load had to compile it before the
 *     IDE became usable, AND
 *   - the browser had to download ~6 MB of unminified dev JS up front.
 *
 * That was the bulk of the "the website is too slow with bun run dev"
 * report. This module keeps the exact same public API
 * (`exampleGroups` / `exampleMenuNodes` / `exampleById` /
 * `exampleFileName`), but loads the library as a SEPARATE dynamic
 * chunk in the background once the app mounts:
 *
 *   - first paint no longer waits for the library — its compile and
 *     transfer are off the critical path;
 *   - the Examples menus render the moment it lands (in practice long
 *     before anyone opens them);
 *   - `loadExamples` gives event handlers an awaited accessor: an
 *     example menu item can only be CLICKED once the module has
 *     loaded, so the await resolves from the in-memory cache
 *     instantly (and stays correct if invoked earlier).
 *
 * The production bundle gets the same win: the library ships as a lazy
 * chunk fetched after first paint instead of ~6 MB inside the initial
 * JavaScript.
 */
import * as React from "react";

type ExamplesModule = typeof import("@/lib/examples");

/** Cached dynamic import — at most one chunk load per session. */
let modPromise: Promise<ExamplesModule> | null = null;

/** Awaitable accessor for event handlers (page.tsx's example creator). */
export function loadExamples(): Promise<ExamplesModule> {
    if (!modPromise) {
        modPromise = import("@/lib/examples");
    }
    return modPromise;
}

/**
 * Load the example library in the background after mount. Returns the
 * module namespace once available, `null` until then — renderers use
 * optional chaining (`examples?.exampleGroups`) so the menus simply
 * appear when the data lands, with no layout shift.
 */
export function useExamples(): ExamplesModule | null {
    const [mod, setMod] = React.useState<ExamplesModule | null>(null);
    React.useEffect(() => {
        let alive = true;
        loadExamples()
            .then((m) => {
                if (alive) setMod(m);
            })
            .catch(() => {
                // A failed chunk load (e.g. a dev-server hiccup) must not
                // crash the app — the Examples menus just stay empty, and
                // resetting the cache lets the next call retry the import.
                modPromise = null;
            });
        return () => {
            alive = false;
        };
    }, []);
    return mod;
}
