"use client";

import * as React from "react";
import {Check, CloudOff, CloudUpload} from "lucide-react";
import {getOfflineState, type OfflineState, subscribeOffline} from "@/lib/offline-store";

/**
 * Offline status pill — a self-contained footer chip the host can
 * drop anywhere; it takes no props and reads its state from the
 * offline-store:
 *
 *   online + empty queue  → renders NOTHING (the normal case).
 *   offline               → gray   "Offline — N writes queued" (files
 *                           open from the service worker's runtime
 *                           cache; saves are being queued).
 *   online + queued       → amber  "Syncing N writes…" while the queue
 *                           replays (the count ticks down live).
 *   flush completed       → emerald "Synced" for a moment, then the
 *                           chip disappears again.
 *
 * Rendering rules: useSyncExternalStore over subscribeOffline — the
 * store's snapshots are referentially stable, so only this chip
 * re-renders on connectivity/queue changes, never the page tree.
 */

/** How long the emerald "Synced" state stays visible after a flush. */
const SYNCED_FLASH_MS = 2_500;

/** useSyncExternalStore wants a plain () => void notifier; the store
 *  notifies with its state object, so adapt (stable module identity). */
function subscribeToOfflineStore(onStoreChange: () => void): () => void {
    return subscribeOffline(() => onStoreChange());
}

/** Constant server snapshot — the real getOfflineState reads
 *  localStorage/navigator, which differ between server render and
 *  client hydration. Rendering the static "online, nothing queued"
 *  state on both sides keeps hydration exact; the first post-hydration
 *  snapshot read reveals the true offline state if there is one. */
const SERVER_SNAPSHOT: OfflineState = {online: true, pendingWrites: 0, lastFlush: null};

export function OfflineIndicator() {
    const state = React.useSyncExternalStore(
        subscribeToOfflineStore,
        getOfflineState,
        () => SERVER_SNAPSHOT
    );

    // Brief "Synced" flash: a NEW flush report landed in which writes
    // were replayed (flushed > 0) and nothing failed.
    const [syncedFlash, setSyncedFlash] = React.useState(false);
    const prevState = React.useRef(state);
    React.useEffect(() => {
        const before = prevState.current;
        prevState.current = state;
        const report = state.lastFlush;
        if (
            !report ||
            report === before.lastFlush ||
            report.flushed === 0 ||
            report.failed > 0 ||
            !state.online
        ) {
            return;
        }
        setSyncedFlash(true);
        const timer = window.setTimeout(() => setSyncedFlash(false), SYNCED_FLASH_MS);
        return () => window.clearTimeout(timer);
    }, [state]);

    const pending = state.pendingWrites;
    const writeWord = pending === 1 ? "write" : "writes";

    // Online, nothing queued, nothing to flash → no chip at all.
    if (state.online && pending === 0 && !syncedFlash) return null;

    const pill =
        "inline-flex items-center gap-1 rounded-full border bg-popover px-2 py-0.5 text-[10px] font-medium whitespace-nowrap shrink-0";

    if (!state.online) {
        return (
            <span
                role="status"
                aria-live="polite"
                title="Offline — recently-opened files open from the offline cache; saves are queued and replayed when you reconnect."
                className={`${pill} text-muted-foreground`}
            >
        <CloudOff className="size-3 shrink-0" aria-hidden="true"/>
        Offline — {pending} {writeWord} queued
      </span>
        );
    }

    if (pending > 0) {
        return (
            <span
                role="status"
                aria-live="polite"
                title="Back online — replaying queued saves in order. Entries that keep failing are retried and dropped after 5 attempts."
                className={`${pill} text-amber-600 dark:text-amber-400`}
            >
        <CloudUpload className="size-3 shrink-0 animate-pulse" aria-hidden="true"/>
        Syncing {pending} {writeWord}…
      </span>
        );
    }

    // Online, queue drained, flash window active.
    return (
        <span
            role="status"
            aria-live="polite"
            title="All queued writes were saved."
            className={`${pill} text-emerald-600 dark:text-emerald-400`}
        >
      <Check className="size-3 shrink-0" aria-hidden="true"/>
      Synced
    </span>
    );
}
