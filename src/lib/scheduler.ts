/**
 *  — Scheduled runs.
 *
 * A tiny browser-side scheduler: "re-run this script every N minutes".
 * Honest scope (stated in the UI too): schedules fire only while a
 * Praxis tab is open — this is an IDE convenience (auto-refresh a
 * dashboard, poll a scraper while you work), NOT a cron replacement.
 *
 * Storage: localStorage under "praxis.schedules". The page wires a
 * tick (every 30 s) that fires due schedules through the normal run
 * flow, so output, history and notifications behave exactly like a
 * manual run.
 */

export interface Schedule {
    id: string;
    /** Display label — "Folder/File.py". */
    label: string;
    folderSlug: string;
    fileSlug: string;
    /** Optional saved run config to apply (args/env/stdin). */
    configId?: string;
    /** Fire every N minutes (>= 1). */
    everyMinutes: number;
    enabled: boolean;
    /** Epoch ms of the last fired tick (null = never fired; nextDue is
     *  computed from createdAt so a fresh schedule waits one period). */
    lastRunAt: number | null;
    lastOutcome?: "ok" | "fail" | null;
    createdAt: number;
}

const KEY = "praxis.schedules";
// One-time migration from the older key (state is preserved).
const LEGACY_KEY = "praxis.schedules.v1";
export const MIN_TICK_MS = 30_000;

export function loadSchedules(): Schedule[] {
    try {
        let raw = window.localStorage.getItem(KEY);
        if (!raw) {
            raw = window.localStorage.getItem(LEGACY_KEY);
            if (raw) window.localStorage.setItem(KEY, raw);
        }
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Schedule[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (s) =>
                s &&
                typeof s.id === "string" &&
                typeof s.folderSlug === "string" &&
                typeof s.fileSlug === "string" &&
                typeof s.everyMinutes === "number" &&
                s.everyMinutes >= 1
        );
    } catch {
        return [];
    }
}

export function saveSchedules(schedules: Schedule[]): void {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(schedules));
    } catch {
        /* storage — non-fatal */
    }
}

export function nextDueAt(s: Schedule): number {
    const base = s.lastRunAt ?? s.createdAt;
    return base + s.everyMinutes * 60_000;
}

export function newScheduleId(): string {
    return `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Format an interval for display: 1m / 15m / 2h / 24h. */
export function formatInterval(minutes: number): string {
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
}

/** Human "in 4m 12s" for the dialog's next-run column. */
export function formatIn(ms: number): string {
    if (ms <= 0) return "due now";
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return `in ${s}s`;
    return `in ${m}m ${s.toString().padStart(2, "0")}s`;
}
