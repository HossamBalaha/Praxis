"use client";

/**
 *  — the Run Queue dialog.
 *
 * Live view of every run currently executing on the server (the same
 * registry /api/stop uses — served by GET /api/run/queue). Polls
 * every 2 s while open. Each row: what is running, for how long
 * (ticking), whether its stdin is open (interactive), and a Stop
 * button.
 */
import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Layers, Square} from "lucide-react";

interface QueueRun {
    runId: string;
    label: string;
    kind: string;
    startedAt: number;
    durationMs: number;
    pid?: number;
    interpreter?: string;
    interactive: boolean;
    alive: boolean;
}

function fmtDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function RunQueueDialog({
                                   open,
                                   onOpenChange,
                                   onStop,
                               }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Stop by runId (reuses the existing /api/stop flow). */
    onStop: (runId: string) => void;
}) {
    const [runs, setRuns] = React.useState<QueueRun[]>([]);
    const [, forceTick] = React.useState(0);

    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch("/api/run/queue");
                if (!res.ok) return;
                const data = (await res.json()) as { runs?: QueueRun[] };
                if (!cancelled) setRuns(data.runs ?? []);
            } catch {
                /* server unreachable — keep the last snapshot */
            }
        };
        void poll();
        const t = setInterval(poll, 2000);
        const ticker = setInterval(() => forceTick((n) => n + 1), 1000);
        return () => {
            cancelled = true;
            clearInterval(t);
            clearInterval(ticker);
        };
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="size-4"/>
                        Run Queue
                    </DialogTitle>
                    <DialogDescription>
                        Every script currently executing on the server — foreground
                        and background runs alike. Polls every 2 seconds.
                    </DialogDescription>
                </DialogHeader>

                {runs.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        Nothing is running right now.
                    </p>
                ) : (
                    <ul className="space-y-1.5 max-h-80 overflow-auto">
                        {runs.map((r) => (
                            <li
                                key={r.runId}
                                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
                            >
                <span
                    className={`size-2 rounded-full shrink-0 ${
                        r.alive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                    title={r.alive ? "Executing" : "Finishing / cleaning up"}
                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{r.label}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                        {fmtDuration(r.durationMs)}
                                        {r.interpreter ? ` · ${r.interpreter}` : ""}
                                        {r.interactive ? " · interactive stdin" : ""}
                                        {r.pid ? ` · pid ${r.pid}` : ""}
                                        {!r.alive && " · finishing"}
                                    </p>
                                </div>
                                {r.alive && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 text-xs shrink-0 hover:border-red-400 hover:text-red-400"
                                        onClick={() => onStop(r.runId)}
                                        title="Stop this run (SIGTERM, then SIGKILL)"
                                    >
                                        <Square className="size-3"/>
                                        Stop
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
