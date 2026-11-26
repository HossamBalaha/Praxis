"use client";

/**
 * env-interpreter-pill.tsx — the status-bar interpreter pill for
 * Environment Sync.
 *
 * Shows WHICH Python the current folder will run with, plus the pinned
 * state: the Environment Sync tab can pin an interpreter per project
 * (.praxis/interpreter.json); this pill surfaces that state in the
 * footer (the spec's "interpreter pill in the status bar shows pinned
 * state") AND applies the pin automatically — when a pinned
 * interpreter differs from the active setting, the pill reports it
 * once per folder so the page can switch the setting (the "reopening a
 * folder restores its exact environment" half).
 *
 * Clicking the pill opens the Dependency Manager (its Environment Sync
 * section is where pins are managed).
 */

import * as React from "react";
import {Pin, RefreshCw} from "lucide-react";
import {cn} from "@/lib/utils";

export function EnvInterpreterPill({
                                       folderSlug,
                                       pythonInterpreter,
                                       onPinnedInterpreter,
                                       onOpenDependencyManager,
                                   }: {
    /** The ACTIVE folder slug (no folder → the pill hides). */
    folderSlug?: string | null;
    /** The currently-configured interpreter path (Settings → Python). */
    pythonInterpreter?: string | null;
    /** Fired ONCE per folder when a pinned interpreter differs from the
     *  configured one — the page applies it to the settings. */
    onPinnedInterpreter?: (pinnedPath: string) => void;
    /** Click handler — opens the Dependency Manager. */
    onOpenDependencyManager?: () => void;
}) {
    const [state, setState] = React.useState<{
        loading: boolean;
        interpreter?: string;
        pinned?: string;
    }>({loading: false});
    /** Folder → notified-pin bookkeeping so a pin is reported exactly
     *  once per folder switch (not on every poll). */
    const notifiedRef = React.useRef<Map<string, string>>(new Map());

    React.useEffect(() => {
        if (!folderSlug) {
            setState({loading: false});
            return;
        }
        let cancelled = false;
        setState((s) => ({loading: true, interpreter: s.interpreter, pinned: s.pinned}));
        fetch(
            `/api/env-sync?folder=${encodeURIComponent(folderSlug)}` +
            (pythonInterpreter ? `&interpreter=${encodeURIComponent(pythonInterpreter)}` : ""),
            {cache: "no-store"}
        )
            .then(async (res) => {
                const data = (await res.json().catch(() => null)) as
                    | { ok?: boolean; interpreter?: string; pinned?: string }
                    | null;
                if (cancelled) return;
                if (!res.ok || !data?.ok) {
                    setState({loading: false});
                    return;
                }
                setState({loading: false, interpreter: data.interpreter, pinned: data.pinned});
                // Auto-apply the pin: when the folder's pinned interpreter
                // differs from the configured one, notify the host ONCE per
                // folder (it switches the setting; the next fetch confirms).
                const pin = data.pinned;
                if (
                    pin &&
                    onPinnedInterpreter &&
                    pin !== pythonInterpreter &&
                    notifiedRef.current.get(folderSlug) !== pin
                ) {
                    notifiedRef.current.set(folderSlug, pin);
                    onPinnedInterpreter(pin);
                }
            })
            .catch(() => {
                if (!cancelled) setState({loading: false});
            });
        return () => {
            cancelled = true;
        };
    }, [folderSlug, pythonInterpreter, onPinnedInterpreter]);

    if (!folderSlug) return null;

    const active = state.pinned ?? pythonInterpreter ?? state.interpreter;
    if (!active) return null;
    const basename = active.split("/").pop() || active;
    // "python3.12" → "Python 3.12" when it looks like a plain pythonX.Y
    const label = /^python\d+\.\d+$/.test(basename)
        ? `Python ${basename.slice("python".length)}`
        : basename;
    const isPinned = Boolean(state.pinned);

    return (
        <button
            type="button"
            onClick={() => onOpenDependencyManager?.()}
            title={
                (isPinned
                    ? `Interpreter pinned by this project (.praxis/interpreter.json): ${active}`
                    : `Active interpreter: ${active}`) +
                " — click to open the Dependency manager (Environment Sync section)"
            }
            className={cn(
                "hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded shrink-0 transition-colors",
                "bg-muted/60 hover:bg-muted text-foreground/80",
                isPinned && "text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20"
            )}
            aria-label={`Python interpreter: ${label}${isPinned ? " (pinned)" : ""}`}
        >
            {state.loading ? (
                <RefreshCw className="size-2.5 animate-spin" aria-hidden="true"/>
            ) : isPinned ? (
                <Pin className="size-2.5" aria-hidden="true"/>
            ) : null}
            <span className="font-medium">{label}</span>
            {isPinned && <span className="text-[9px] opacity-80">pinned</span>}
        </button>
    );
}
