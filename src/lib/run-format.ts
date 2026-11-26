/**
 * Pure formatting + detection helpers for the RUN pipeline
 * (src/components/output-panel.tsx, src/app/page.tsx and /api/run +
 * /api/run-all).
 *
 * Everything here is string-in / string-out with no React, no window
 * and no fs so the vitest suite can cover the fiddly bits (the mm:ss
 * vs h:mm:ss rollover, the byte-cap phrasing, the timeout-marker
 * sniff, the run-all batch alert text) without a DOM — same
 * discipline as the other src/lib modules.
 */

/** Type-only import — erased at build time, so run-format keeps zero
 *  runtime dependencies (the vitest node suite imports this module);
 *  run-notify.ts only contributes the RunNotifyInfo SHAPE here. */
import type {RunNotifyInfo} from "@/lib/run-notify";

/** Live elapsed readout for the running pill: `mm:ss` below one hour,
 *  `h:mm:ss` above (terminal `time` / stopwatch convention). Negative
 *  and non-finite inputs clamp to zero so a late tick after the run
 *  ended can never render a negative duration. */
export function formatElapsedRun(ms: number): string {
    const total = Math.max(
        0,
        Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
    );
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const two = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** Human byte size for the truncation notice. Mirrors the SERVER's
 *  formatBytes() phrasing exactly ("2 MB", "2.5 MB", "500 KB") so the
 *  panel pill and the `[praxis] output truncated at …` stderr line the
 *  route already emits agree with each other. Non-positive / NaN input
 *  falls back to the historical "2 MB" default (the old hard-coded
 *  notice) instead of rendering nonsense. */
export function formatByteCap(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "2 MB";
    if (bytes >= 1_000_000) {
        const mb = bytes / 1_000_000;
        return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** The stderr line the run route stamps when the HARD timeout kills a
 * run (both the Python path and the generic language path emit it
 * right before SIGKILL). The Output panel sniffs this marker to tell
 * a server-side timeout apart from a user-initiated stop — the end
 * event's `killed` flag alone is true for both, which used to leave
 * the "Timed out" pill branch permanently dead. */
export const RUN_TIMEOUT_MARKER_RE = /\[praxis\] run timed out after \d+ s/;

/** True when the finished run died by TIMEOUT rather than by the user
 * clicking Stop. `error === "timeout"` is kept for compatibility with
 * any older cached results that carried that (never-emitted) field. */
export function isTimeoutRun(
    stderr: string | undefined,
    error?: string
): boolean {
    if (error === "timeout") return true;
    return typeof stderr === "string" && RUN_TIMEOUT_MARKER_RE.test(stderr);
}

/** The EXACT stderr line /api/run stamps when its hard timeout kills a
 * run (see route.ts — both the Python and the generic-language path
 * emit it right before SIGKILL). /api/run-all now stamps the SAME line
 * for each per-file timeout so its batch results are distinguishable
 * from user stops downstream (isTimeoutRun). Kept byte-identical to
 * the main route's literal — including the leading/trailing newlines
 * and the em dash — so the two channels can never drift apart; the
 * unit test pins this against RUN_TIMEOUT_MARKER_RE. */
export function runTimeoutMarkerLine(timeoutMs: number): string {
    return `\n[praxis] run timed out after ${Math.round(timeoutMs / 1000)} s — the process was killed (hard timeout).\n`;
}

/* ── run-all (batch) completion alert ──────────────────────────────
 *
 * the batch completion path used to show only a toast —
 * notifyRunFinished / playRunChime fired for primary runs and notebook
 * cells but never for run-all. This pure builder turns the batch `end`
 * SSE event (passCount / failCount / stopped / totalMs) into the same
 * RunNotifyInfo shape the primary path feeds to the notification +
 * chime, so the batch gets identical settings-gated alerting
 * (runNotifyMode / runNotifyOnFailure / runNotifySound are all
 * enforced inside run-notify.ts, not here).
 *
 * `fileName` carries the batch-specific text (notifyRunFinished builds
 * its title as "Run complete/failed/stopped: <fileName>"), e.g.
 *   "Run all — Calib (7 files)"        → title "Run complete: …"
 *   "Run all — Calib (7 files, 2 failed)" → title "Run failed: …"
 *   stopped batches report killed:true  → title "Run stopped: …"
 */

export interface BatchNotifyInput {
    /** Display name of the folder the batch ran in. */
    folderName: string;
    /** Optional relative subfolder the batch was scoped to. */
    sub?: string;
    /** How many files actually ran (completed results collected). */
    total: number;
    /** Files that failed (non-zero exit / killed / missing runtime). */
    failCount: number;
    /** True when the user stopped the batch mid-way. */
    stopped?: boolean;
    /** Server-side total batch duration (the end event's totalMs). */
    durationMs: number;
}

/** Build the notification/chime info for a finished run-all batch. */
export function batchRunNotifyInfo(input: BatchNotifyInput): RunNotifyInfo {
    const scope = input.sub ? `${input.folderName}/${input.sub}` : input.folderName;
    const parts: string[] = [`${input.total} file${input.total === 1 ? "" : "s"}`];
    if (input.failCount > 0) parts.push(`${input.failCount} failed`);
    return {
        fileName: `Run all — ${scope} (${parts.join(", ")})`,
        folderName: input.folderName,
        ok: input.failCount === 0 && !input.stopped,
        killed: !!input.stopped,
        durationMs: input.durationMs,
    };
}
