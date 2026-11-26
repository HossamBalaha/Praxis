"use client";

/**
 * Focus-session settings — the persistence layer shared by the
 * FocusSessions widget and the Settings → Focus tab.
 *
 * The widget owns the live timer; this module only stores /
 * broadcasts the configuration. `saveFocusSettings` dispatches
 * `praxis:focus-settings-changed` so a mounted FocusSessions
 * re-hydrates immediately.
 */

import {STORAGE_PREFIX} from "@/lib/config";

const FOCUS_SETTINGS_KEY = `${STORAGE_PREFIX}.focus-settings`;

export type PhaseKind = "focus" | "short";
export type PresetId = "pomodoro" | "classic5217" | "deepwork" | "custom";
export type RingStyle = "ring" | "bar";

export interface FocusDurations {
    /** Focus block length in minutes. */
    focus: number;
    /** Short break length in minutes. */
    short: number;
}

export interface FocusSettings extends FocusDurations {
    preset: PresetId;
    /** Auto-start the next phase when one ends (phase CHAINING — the
     *  first phase of a session is ALWAYS armed, never auto-started). */
    autoStart: boolean;
    /** Play a soft chime when a phase ends. */
    sound: boolean;
    /** Show a toast when a phase ends. */
    notify: boolean;
    /** Progress presentation around the clock. */
    ringStyle: RingStyle;
    /** Compact mode — tighter padding, smaller clock. */
    compact: boolean;
    /** Mirror the live countdown into the browser tab title. */
    tabTitle: boolean;
    /** Daily focus goal in minutes (0 = off). */
    dailyGoalMin: number;
    /** Zen mode — hide the IDE chrome while a focus block runs. */
    zenMode: boolean;
    /** Start the ambient mix automatically when a focus block starts
     *  (opt-in coupling — ambient itself is timer-independent). */
    ambientWithFocus: boolean;
}

export const FOCUS_PRESETS: Record<Exclude<PresetId, "custom">, FocusDurations> = {
    // The classic Pomodoro technique: 25-minute focus sprints with
    // 5-minute breaks.
    pomodoro: {focus: 25, short: 5},
    // The 52/17 rule (DeskTime productivity study).
    classic5217: {focus: 52, short: 17},
    // One ultradian deep-work cycle.
    deepwork: {focus: 90, short: 10},
};

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
    preset: "pomodoro",
    ...FOCUS_PRESETS.pomodoro,
    autoStart: true,
    sound: true,
    notify: true,
    ringStyle: "ring",
    compact: false,
    tabTitle: true,
    dailyGoalMin: 90,
    zenMode: false,
    ambientWithFocus: false,
};

export function loadFocusSettings(): FocusSettings {
    if (typeof window === "undefined") return {...DEFAULT_FOCUS_SETTINGS};
    try {
        const raw = window.localStorage.getItem(FOCUS_SETTINGS_KEY);
        if (!raw) return {...DEFAULT_FOCUS_SETTINGS};
        const parsed = JSON.parse(raw) as Partial<FocusSettings> & {
            // Legacy fields from earlier setting shapes — dropped on load
            // so stale values never leak back into the widget.
            ambientOn?: boolean;
            ambient?: Record<string, number>;
            long?: number;
            rounds?: number;
        };
        delete parsed.ambientOn;
        delete parsed.ambient;
        delete parsed.long;
        delete parsed.rounds;
        return {...DEFAULT_FOCUS_SETTINGS, ...parsed} as FocusSettings;
    } catch {
        return {...DEFAULT_FOCUS_SETTINGS};
    }
}

export function saveFocusSettings(next: FocusSettings): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(FOCUS_SETTINGS_KEY, JSON.stringify(next));
    } catch { /* storage full/blocked */
    }
    // Tell a mounted FocusSessions widget to pick the new values up.
    window.dispatchEvent(new CustomEvent("praxis:focus-settings-changed"));
}

export const FOCUS_SETTINGS_EVENT = "praxis:focus-settings-changed";
