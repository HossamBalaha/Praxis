"use client";

import * as React from "react";
import {Activity} from "lucide-react";
import {cn} from "@/lib/utils";
import {perfMetrics, type PerfMetricSnapshot,} from "@/lib/perf-metrics";

/**
 * PerfHud — the built-in performance HUD overlay (item G23).
 *
 * A dev-toggle overlay that surfaces FPS, keystroke → paint latency,
 * spell/lint queue depth, SSE throughput and per-panel render counts,
 * so regressions show up as numbers before they show up as flicker.
 *
 * The host wires the toggle — page.tsx renders `<PerfHud open={…} />`
 * from its dev settings; this component owns NO toggle of its own.
 *
 * ─── how the numbers get here ────────────────────────────────────────
 * All measurement lives in the zero-cost hub (`src/lib/perf-metrics.ts`):
 * subscribing starts its rAF loop / keydown listener / longtask
 * observer, and the last unsubscribe stops them — while `open` is
 * false the HUD (and the hub) cost literally nothing. The hub emits a
 * snapshot ~4×/second; the HUD deliberately does NOT re-render per
 * frame, so it never skews the very FPS it displays.
 *
 * ─── reportPanelRender integration (for the main panels) ────────────
 * Panels count their own renders by calling the hub directly from
 * their component body — the HUD only DISPLAYS these numbers and must
 * never report on other panels' behalf (nor for itself, or the HUD
 * would pollute its own top-6 list). The code viewer already reports
 * as "Editor" (see the reportPanelRender call at the top of
 * CodeViewerInner in code-viewer.tsx) — that one is the end-to-end
 * proof the registry works. Example wiring for the editor tabs panel:
 *
 *   // src/components/editor-tabs.tsx (top of the component body)
 *   import { reportPanelRender } from "@/lib/perf-metrics";
 *   export function EditorTabs(props: EditorTabsProps) {
 *     reportPanelRender("EditorTabs");   // ← one line, ~zero cost
 *     // …existing component code…
 *   }
 *
 * SSE consumers report throughput where they read stream chunks:
 *
 *   const { value } = await reader.read();
 *   noteSseBytes(value?.byteLength ?? 0);
 *
 * and the spell/lint workers report backlog with
 * `noteQueueDepth("spell" | "lint", n)`.
 */

interface PerfHudProps {
    /** Show the overlay. Wired to the host's dev toggle. */
    open: boolean;
}

/** 12,400 → "12.4k", 1,234,567 → "1.2M", 999 → "999". */
function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

/** FPS color coding: emerald ≥ 55, amber ≥ 35, red below. */
function fpsTone(fps: number | null): string {
    if (fps === null) return "text-muted-foreground";
    if (fps >= 55) return "text-emerald-600 dark:text-emerald-400";
    if (fps >= 35) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
}

function HudRow({
                    label,
                    value,
                    tone,
                }: {
    label: string;
    value: React.ReactNode;
    tone?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-2 leading-relaxed">
            <span className="text-muted-foreground whitespace-nowrap">{label}</span>
            <span className={cn("tabular-nums text-right", tone)}>{value}</span>
        </div>
    );
}

export function PerfHud({open}: PerfHudProps) {
    const [snap, setSnap] = React.useState<PerfMetricSnapshot | null>(null);

    React.useEffect(() => {
        if (!open) return;
        // Subscribing boots the hub's measurement loop; unsubscribing on
        // close (or unmount) tears it back down — zero cost when hidden.
        const unsubscribe = perfMetrics.subscribe(setSnap);
        // First values immediately; afterwards the hub notifies at 4 Hz.
        setSnap(perfMetrics.getSnapshot());
        return unsubscribe;
    }, [open]);

    const topRenders = React.useMemo(() => {
        if (!snap) return [] as Array<[string, number]>;
        return Object.entries(snap.renderCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
    }, [snap]);

    if (!open) return null;

    const fps = snap?.fps ?? null;

    return (
        <div
            role="status"
            aria-label="Performance HUD"
            className="fixed bottom-9 left-2 z-[90] w-64 rounded-lg border bg-popover/95 backdrop-blur p-3 text-[11px] font-mono text-popover-foreground shadow-lg select-none"
        >
            <div className="mb-2 flex items-center gap-1.5 border-b pb-2 font-semibold tracking-wide">
                <Activity className="size-3 text-emerald-500"/>
                <span>PERF HUD</span>
                <span className="ml-auto text-[9px] font-normal text-muted-foreground">
          4 Hz
        </span>
            </div>

            <div className="flex flex-col gap-0.5">
                <HudRow
                    label="fps"
                    value={fps === null ? "—" : fps.toFixed(0)}
                    tone={fpsTone(fps)}
                />
                <HudRow
                    label="frame"
                    value={
                        snap?.frameMs == null ? "—" : `${snap.frameMs.toFixed(1)} ms`
                    }
                />
                <HudRow
                    label="key→paint"
                    value={
                        snap?.keydownToPaintMs == null
                            ? "—"
                            : `${snap.keydownToPaintMs.toFixed(1)} ms`
                    }
                />
                <HudRow label="long tasks (10s)" value={snap?.frameLongTasks ?? 0}/>
                <HudRow
                    label="sse"
                    value={`${((snap?.sseBytesPerSec ?? 0) / 1024).toFixed(1)} KB/s`}
                />
                <HudRow label="spell queue" value={snap?.queueDepths.spell ?? 0}/>
                <HudRow label="lint queue" value={snap?.queueDepths.lint ?? 0}/>
                <HudRow
                    label="heap"
                    value={
                        snap?.heapMB == null ? "n/a" : `${snap.heapMB.toFixed(1)} MB`
                    }
                />
            </div>

            <div className="mt-2 border-t pt-2">
                <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    render counts
                </div>
                {topRenders.length === 0 ? (
                    <div className="text-muted-foreground">
                        — no reportPanelRender() calls yet —
                    </div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {topRenders.map(([label, count]) => (
                            <HudRow key={label} label={label} value={formatCount(count)}/>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
