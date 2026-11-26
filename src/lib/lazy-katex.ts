"use client";

/**
 *  — lazy KaTeX plugin hook.
 *
 * rehype-katex (+ katex) is one of the heaviest static imports in the
 * app (~100 KB+ min) and is only needed when a document actually
 * contains math. All three markdown renderers (FileViewer, CodeViewer
 * cells, AI chat) used to import it statically, putting KaTeX on the
 * critical path of EVERY page load.
 *
 * This hook dynamically imports the plugin after mount and returns the
 * rehypePlugins array. Until it resolves the markdown renders with raw
 * $…$ (harmless one-frame); once loaded, math typesets. The plugin
 * lands in its own async chunk — off the initial bundle.
 *
 * The KaTeX CSS stays a static import (23 KB gz, needed the instant a
 * formula typesets — a FOUC on every formula would look broken).
 *
 * ─── (Markdown crash) ──────────────────────────────────────
 * The resolved plugin value (m.default) is a FUNCTION. Passing a raw
 * function to a React state setter makes React treat it as an UPDATER
 * CALLBACK and invoke it: setPlugin(rehypeKatex) stored
 * rehypeKatex(null) — the plugin's own TRANSFORMER — as the state.
 * react-markdown then handed that transformer to unified as though it
 * were a plugin factory; unified's freeze called it as an attacher
 * with `undefined` as the tree and rehype-katex crashed the whole page:
 *   "Unexpected value `undefined` for `tree`, expected node"
 * Both the setter and the useState initializer must therefore WRAP the
 * function so React stores the plugin object itself.
 */
import * as React from "react";
import type {PluggableList} from "unified";

let cached: unknown = null;
let promise: Promise<unknown> | null = null;

export function useLazyKatexPlugin(): PluggableList {
    // Lazy initializer: even if `cached` already holds the plugin
    // function (HMR re-mount), React must store it verbatim, not call it.
    const [plugin, setPlugin] = React.useState<unknown>(() => cached);

    React.useEffect(() => {
        if (cached || promise) return;
        // PERF: the KaTeX CSS used to be a STATIC import in two viewers —
        // it now rides this same lazy load (see lib/katex-css.ts).
        void import("@/lib/katex-css");
        promise = import("rehype-katex").then((m) => {
            cached = m.default;
            return cached;
        });
        // CRITICAL: wrap in an updater — `setPlugin(m.default)` would CALL
        // the plugin function (React treats function arguments as state
        // updaters) and store its transformer as the state.
        void promise.then((p) => setPlugin(() => p));
    }, []);

    return React.useMemo<PluggableList>(
        () => (plugin ? [plugin as never] : []),
        [plugin]
    );
}
