"use client";

/**
 * — the Scheduled Runs dialog.
 *
 * Lists the browser-side schedules (see lib/scheduler.ts), lets the
 * user schedule the current script at a fixed interval, toggle/pause,
 * fire immediately, or delete. A note makes the "only while a Praxis
 * tab is open" scope explicit.
 */
import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Clock, Play, Plus, Trash2,} from "lucide-react";
import {formatIn, formatInterval, nextDueAt, type Schedule,} from "@/lib/scheduler";

const INTERVALS = [1, 5, 10, 15, 30, 60, 120, 360, 720, 1440];

export function SchedulerDialog({
                                    open,
                                    onOpenChange,
                                    schedules,
                                    onChange,
                                    currentTarget,
                                    onRunNow,
                                }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** The live schedule list (owned by the page). */
    schedules: Schedule[];
    onChange: (next: Schedule[]) => void;
    /** Current selection target for the "add" row (null = nothing open). */
    currentTarget: { label: string; folderSlug: string; fileSlug: string } | null;
    /** Fire a schedule's script through the normal run flow. */
    onRunNow: (s: Schedule) => void;
}) {
    const [minutes, setMinutes] = React.useState(10);
    const [, forceTick] = React.useState(0);

    // Re-render every 5 s while open so the "next run in …" column moves.
    React.useEffect(() => {
        if (!open) return;
        const t = setInterval(() => forceTick((n) => n + 1), 5000);
        return () => clearInterval(t);
    }, [open]);

    const addCurrent = () => {
        if (!currentTarget) return;
        onChange([
            ...schedules,
            {
                id: `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                label: currentTarget.label,
                folderSlug: currentTarget.folderSlug,
                fileSlug: currentTarget.fileSlug,
                everyMinutes: minutes,
                enabled: true,
                lastRunAt: null,
                lastOutcome: null,
                createdAt: Date.now(),
            },
        ]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="size-4"/>
                        Scheduled Runs
                    </DialogTitle>
                    <DialogDescription>
                        Re-run scripts automatically on a fixed interval. Schedules
                        fire only while a Praxis tab is open — think of it as a
                        convenient auto-refresh, not a system cron.
                    </DialogDescription>
                </DialogHeader>

                {/* Add row */}
                <div className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex-1 min-w-0 text-xs truncate">
                        {currentTarget ? (
                            <>
                                Schedule <span className="font-medium">{currentTarget.label}</span>{" "}
                                every
                            </>
                        ) : (
                            "Open a script first to schedule it"
                        )}
                    </div>
                    <select
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value))}
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label="Interval"
                    >
                        {INTERVALS.map((m) => (
                            <option key={m} value={m}>
                                {formatInterval(m)}
                            </option>
                        ))}
                    </select>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs shrink-0"
                        onClick={addCurrent}
                        disabled={!currentTarget || schedules.some((s) => s.enabled && s.folderSlug === currentTarget?.folderSlug && s.fileSlug === currentTarget?.fileSlug)}
                        title={
                            schedules.some((s) => s.folderSlug === currentTarget?.folderSlug && s.fileSlug === currentTarget?.fileSlug)
                                ? "This script already has a schedule"
                                : "Add a schedule for the current script"
                        }
                    >
                        <Plus className="size-3"/>
                        Add
                    </Button>
                </div>

                {/* List */}
                {schedules.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        No schedules yet.
                    </p>
                ) : (
                    <ul className="space-y-1.5 max-h-80 overflow-auto">
                        {schedules.map((s) => {
                            const due = nextDueAt(s);
                            const live = s.enabled && Date.now() >= due;
                            return (
                                <li
                                    key={s.id}
                                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
                                >
                                    <Switch
                                        checked={s.enabled}
                                        onCheckedChange={(v) =>
                                            onChange(
                                                schedules.map((x) => (x.id === s.id ? {...x, enabled: v} : x))
                                            )
                                        }
                                        title={s.enabled ? "Pause this schedule" : "Resume this schedule"}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{s.label}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            every {formatInterval(s.everyMinutes)} ·{" "}
                                            {s.enabled
                                                ? live
                                                    ? "due now — firing on the next tick"
                                                    : formatIn(due - Date.now())
                                                : "paused"}
                                            {s.lastOutcome === "ok" && " · last: OK"}
                                            {s.lastOutcome === "fail" && " · last: FAILED"}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 gap-1 text-xs shrink-0"
                                        onClick={() => onRunNow(s)}
                                        title="Run this script now (counts as its scheduled run)"
                                    >
                                        <Play className="size-3"/>
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs shrink-0 text-muted-foreground hover:text-red-400"
                                        onClick={() => onChange(schedules.filter((x) => x.id !== s.id))}
                                        title="Delete this schedule"
                                    >
                                        <Trash2 className="size-3"/>
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
