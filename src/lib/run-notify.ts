/**
 * browser notifications when a run finishes.
 *
 * Alarm "if code is completed while I am not in
 * the tab of the IDE" — so the default mode is "hidden": notify only
 * when `document.visibilityState !== "visible"`. "always" notifies
 * regardless; "off" never notifies. Failure/killed runs can be
 * included via `runNotifyOnFailure`.
 *
 * Permission is requested lazily: the Settings toggle calls
 * `requestRunNotifyPermission` from its click handler (browsers
 * require a user gesture for the prompt).
 *
 * `playRunChime` — a Web-Audio chime that plays under
 * the same visibility/failure gating as the notification (audio needs
 * NO browser permission, so it also covers the "permission denied"
 * case). Volume + on/off: Settings → Python.
 *
 * clicking the notification deep-links to the run —
 * a `praxis:focus-run` CustomEvent carries the run info and page.tsx
 * switches to the Output tab + scrolls to that run's entry.
 */
import {loadSettings} from "@/lib/settings";

export type RunNotifyMode = "off" | "hidden" | "always";

/** Custom event fired when a completion notification is clicked —
 *  page.tsx listens for it to deep-link to the run's output entry. */
export const FOCUS_RUN_EVENT = "praxis:focus-run";

/** Request Notification permission (call from a click handler). */
export async function requestRunNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted" || Notification.permission === "denied") {
        return Notification.permission;
    }
    try {
        return await Notification.requestPermission();
    } catch {
        return "denied";
    }
}

export interface RunNotifyInfo {
    fileName: string;
    folderName?: string;
    ok: boolean;
    killed: boolean;
    durationMs: number;
}

/** Fire a completion notification if the settings + visibility say so.
 *  Returns true when a notification was actually shown. */
export function notifyRunFinished(info: RunNotifyInfo): boolean {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    const settings = loadSettings();
    const mode = settings.runNotifyMode ?? "off";
    if (mode === "off") return false;
    if (mode === "hidden" && document.visibilityState === "visible") return false;
    if (!info.ok && !settings.runNotifyOnFailure) return false;
    if (Notification.permission !== "granted") return false;

    const title = info.killed
        ? `Run stopped: ${info.fileName}`
        : info.ok
            ? `Run complete: ${info.fileName}`
            : `Run failed: ${info.fileName}`;
    const body = [
        info.folderName ? `Folder: ${info.folderName}` : null,
        `Finished in ${(info.durationMs / 1000).toFixed(1)}s`,
        info.killed ? "Stopped by user or timeout" : info.ok ? "Exit code 0" : "Non-zero exit code",
    ]
        .filter(Boolean)
        .join(" · ");

    try {
        const n = new Notification(title, {
            body,
            // A subtle tag coalesces bursts (parallel background runs).
            tag: `praxis-run-${info.fileName}`,
        });
        // deep-link — focusing the window is not enough;
        // dispatch an event so page.tsx can jump to THIS run's output
        // entry (switch to the Output tab + scroll + flash the header).
        n.addEventListener("click", () => {
            try {
                window.focus();
            } catch { /* ignore */
            }
            try {
                window.dispatchEvent(
                    new CustomEvent<RunNotifyInfo>(FOCUS_RUN_EVENT, {detail: info}),
                );
            } catch { /* ignore */
            }
            try {
                n.close();
            } catch { /* ignore */
            }
        });
        return true;
    } catch {
        return false;
    }
}

// ─── completion chime ────────────────────────────────

/** Shared gate for BOTH the notification and the chime (mode /
 *  visibility / notify-on-failure). Split out so the two stay in sync. */
function runAlertAllowed(settings: {
    runNotifyMode?: RunNotifyMode;
    runNotifyOnFailure?: boolean
}, info: RunNotifyInfo): boolean {
    const mode = settings.runNotifyMode ?? "off";
    if (mode === "off") return false;
    if (mode === "hidden" && document.visibilityState === "visible") return false;
    if (!info.ok && !settings.runNotifyOnFailure) return false;
    return true;
}

/** One AudioContext per page, created lazily on the first chime
 * (browsers only allow AudioContext construction/resume inside a
 * user gesture AFTER autoplay policy — but a run the user STARTED
 * counts as prior interaction, so by the time a run finishes the
 * context is always allowed). */
let chimeCtx: AudioContext | null = null;

/** Play a short two-note chime for a finished run.
 * Success: a rising major fifth (E5 → A5); failure/stopped: a
 * falling minor third (E4 → C4) — instantly distinguishable.
 * Volume comes from Settings → Python (0–100). Returns true when a
 * sound was actually scheduled. `force: true` (the Settings "Test"
 * button) skips the mode/visibility/failure gating — the user is
 * explicitly asking to hear it. */
export function playRunChime(info: RunNotifyInfo, opts?: { force?: boolean }): boolean {
    if (typeof window === "undefined") return false;
    const settings = loadSettings();
    if (!opts?.force) {
        if (!runAlertAllowed(settings, info)) return false;
        if (!settings.runNotifySound) return false;
    }
    const volume = Math.min(1, Math.max(0, (settings.runNotifyVolume ?? 60) / 100));
    if (volume <= 0) return false;
    try {
        const Ctx = window.AudioContext ?? (window as unknown as {
            webkitAudioContext?: typeof AudioContext
        }).webkitAudioContext;
        if (!Ctx) return false;
        if (!chimeCtx) chimeCtx = new Ctx();
        const ctx = chimeCtx;
        if (ctx.state === "suspended") void ctx.resume();

        const now = ctx.currentTime;
        const notes: Array<[number, number]> = info.ok
            ? [[659.25, 0], [880, 0.16]]   // E5 → A5 (rising, "done!")
            : [[329.63, 0], [261.63, 0.2]]; // E4 → C4 (falling, "failed")
        for (const [freq, at] of notes) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            // Soft exponential envelope: quick attack, ~0.35s decay.
            const start = now + at;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume * 0.5, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.4);
        }
        return true;
    } catch {
        return false;
    }
}
