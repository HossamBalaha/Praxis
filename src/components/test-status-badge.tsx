"use client";

import * as React from "react";
import {CheckCircle2, CircleX, Loader2} from "lucide-react";
import {cn} from "@/lib/utils";
import {getWatchState, subscribeWatchState} from "@/lib/watch-tests";

/**
 * TestStatusBadge — the compact watch-status chip the host can drop
 * into the footer (panel item G24). Props: none.
 *
 * Reads the module-level watch store in src/lib/watch-tests.ts — the
 * same store the editor's gutter marks read — via useSyncExternalStore
 * (the footerStore pattern), so watched-run updates never re-render
 * the page:
 *
 *   <TestStatusBadge />   →   ✓ 12 tests passing   (emerald)
 *                          →   ✕ 3 failing         (red)
 *                          →   ⟳ running…          (amber spinner)
 *
 * Renders null while watch mode is off or no watched run has landed
 * yet. The title shows the run's duration + timestamp (and the error
 * message when the run itself failed).
 */
export function TestStatusBadge() {
    const state = React.useSyncExternalStore(
        subscribeWatchState,
        getWatchState,
        getWatchState
    );

    // Inactive (watch off) → no chip at all.
    if (!state.active) return null;

    const titleBase =
        state.summary && state.watchedAt > 0
            ? `Watched run · ${(state.summary.durationMs / 1000).toFixed(2)}s · ${new Date(
                state.watchedAt
            ).toLocaleTimeString()}`
            : "pytest watch mode is on";

    // A watched run is in flight — amber spinner.
    if (state.running) {
        return (
            <span
                className="inline-flex items-center gap-1 shrink-0 text-amber-600 dark:text-amber-400"
                title={`${titleBase} — re-running the affected tests…`}
            >
        <Loader2 className="size-3 animate-spin"/>
        running…
      </span>
        );
    }

    const summary = state.summary;
    // No completed run yet → nothing to show.
    if (!summary) return null;

    // The run itself failed (HTTP / network) with nothing to count.
    if (state.error && summary.total === 0) {
        return (
            <span
                className="inline-flex items-center gap-1 shrink-0 text-red-600 dark:text-red-400"
                title={`${titleBase} — ${state.error}`}
            >
        <CircleX className="size-3"/>
        test run failed
      </span>
        );
    }

    const failing = summary.failed + summary.errors;
    const passing = summary.passed;

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 shrink-0 tabular-nums",
                failing > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
            )}
            title={
                state.error
                    ? `${titleBase} — ${state.error}`
                    : `${titleBase} — ${passing} passed · ${failing} failing across ${
                        state.lastFiles.length
                    } file${state.lastFiles.length === 1 ? "" : "s"}`
            }
        >
      {failing > 0 ? (
          <>
              <CircleX className="size-3"/>
              {failing} failing
          </>
      ) : (
          <>
              <CheckCircle2 className="size-3"/>
              {passing} tests passing
          </>
      )}
    </span>
    );
}
