"use client";

import * as React from "react";
import {
    AudioWaveform,
    BarChart3,
    Brain,
    CircleDot,
    Coffee,
    Flame,
    GripHorizontal,
    Minus,
    Pause,
    Play,
    RotateCcw,
    Settings2,
    SkipForward,
    Square,
    Target,
    Timer,
    Volume2,
    VolumeX,
    X,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {useToast} from "@/hooks/use-toast";
import {
    DEFAULT_FOCUS_SETTINGS,
    FOCUS_PRESETS,
    FOCUS_SETTINGS_EVENT,
    type FocusDurations,
    type FocusSettings,
    loadFocusSettings,
    type PhaseKind,
    type PresetId,
    saveFocusSettings,
} from "@/lib/focus-settings";
import {
    AMBIENT_TRACK_COUNT,
    ambientTracksByCategory,
    getAmbientState,
    setAmbientMaster,
    toggleAmbient,
    useAmbientState,
} from "@/lib/ambient";

/* ================================================================== */
/*  Focus & concentration sessions                                     */
/*                                                                     */
/*  The floating, draggable Pomodoro-style timer. Selecting a preset  */
/*  ARMS the session (durations loaded, clock shows the full time)    */
/*  but the countdown only begins on an explicit START click.         */
/*                                                                     */
/*  Ambient sounds are NOT part of this component anymore — they live */
/*  in lib/ambient (a shared engine with 105 synthesized tracks) so   */
/*  they play with or without a timer. The widget's mixer panel and   */
/*  speaker button simply drive that shared engine.                   */
/* ================================================================== */

/* ── Persistence keys (same prefix convention as settings) ───────── */
const FOCUS_STATS_KEY = `${STORAGE_PREFIX}.focus-stats`;
const FOCUS_POS_KEY = `${STORAGE_PREFIX}.focus-pos`;

interface DayStats {
    /** Completed focus blocks today. */
    sessions: number;
    /** Accumulated focus minutes today (partial blocks included). */
    minutes: number;
}

interface FocusStats {
    /** ISO YYYY-MM-DD (local) → stats for that day. Only recent days kept. */
    days: Record<string, DayStats>;
    /** Consecutive days (ending today or yesterday) with ≥1 focus block. */
    streak: number;
    /** All-time completed focus blocks. */
    totalSessions: number;
    /** All-time focus minutes. */
    totalMinutes: number;
}

const DEFAULT_STATS: FocusStats = {
    days: {},
    streak: 0,
    totalSessions: 0,
    totalMinutes: 0,
};

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Local YYYY-MM-DD for "today" (stats are day-scoped in the * timezone, not UTC — a 23:30 session shouldn't split across days). */
function localDayKey(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function clampNum(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const PHASE_META: Record<PhaseKind, { label: string; hint: string }> = {
    focus: {label: "Focus", hint: "Deep work — one task, no distractions"},
    short: {label: "Short break", hint: "Stand up, look far away, breathe"},
};

/** A gentle two-tone chime synthesized with WebAudio (no assets). The
 * AudioContext is created lazily inside the user-gesture-derived call
 * chain so autoplay policies stay satisfied. */
function playChime(): void {
    try {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const now = ctx.currentTime;
        const note = (freq: number, at: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + at);
            gain.gain.linearRampToValueAtTime(0.18, now + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + at);
            osc.stop(now + at + dur + 0.05);
        };
        note(660, 0, 0.35);
        note(880, 0.18, 0.5);
        setTimeout(() => void ctx.close().catch(() => {
        }), 1400);
    } catch {
        /* audio unavailable — the toast still fires */
    }
}

/** A brighter three-note goal fanfare (daily goal reached). */
function playGoalFanfare(): void {
    try {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const now = ctx.currentTime;
        const note = (freq: number, at: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + at);
            gain.gain.linearRampToValueAtTime(0.16, now + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + at);
            osc.stop(now + at + dur + 0.05);
        };
        note(523.25, 0, 0.3); // C5
        note(659.25, 0.16, 0.3); // E5
        note(783.99, 0.32, 0.55); // G5
        setTimeout(() => void ctx.close().catch(() => {
        }), 1600);
    } catch {
        /* audio unavailable */
    }
}

/* ================================================================== */
/*  The component                                                      */

/* ================================================================== */

export function FocusSessions() {
    const {toast} = useToast();

    /* ── Persisted state ─────────────────────────────────────────── */
    const [settings, setSettings] = React.useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);
    const [stats, setStats] = React.useState<FocusStats>(DEFAULT_STATS);
    const [taskLabel, setTaskLabel] = React.useState("");

    // Hydrate from localStorage, then keep live: the Settings → Focus
    // tab saves through lib/focus-settings, which broadcasts
    // praxis:focus-settings-changed — re-hydrate whenever that fires.
    React.useEffect(() => {
        const hydrateFn = () => setSettings(loadFocusSettings());
        hydrateFn();
        window.addEventListener(FOCUS_SETTINGS_EVENT, hydrateFn);
        return () => window.removeEventListener(FOCUS_SETTINGS_EVENT, hydrateFn);
    }, []);

    React.useEffect(() => {
        void (async () => {
            try {
                const raw = window.localStorage.getItem(FOCUS_STATS_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as Partial<FocusStats>;
                    setStats((prev) => ({...prev, ...parsed}));
                }
            } catch { /* corrupted — defaults */
            }
        })();
    }, []);

    const saveSettings = React.useCallback((next: FocusSettings) => {
        setSettings(next);
        saveFocusSettings(next);
    }, []);

    const saveStats = React.useCallback((next: FocusStats) => {
        setStats(next);
        try {
            window.localStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(next));
        } catch { /* storage full/blocked */
        }
    }, []);

    /* ── Ambient sounds — the SHARED engine (lib/ambient). It runs    */
    /*    with or without a timer; this widget is just one of its      */
    /*    control surfaces (the Focus menu and Settings are others).   */
    const ambient = useAmbientState();

    const handleAmbientToggle = React.useCallback(() => {
        const ok = toggleAmbient();
        if (!ok) {
            toast({title: "Ambient sounds unavailable", description: "This browser blocked WebAudio."});
        }
    }, [toast]);

    // Per-track mixing moved to the Ambient Mixer MODAL
    // (praxis:ambient-mixer); the widget keeps only the master switch,
    // master volume, the active-mix chips and the launcher button.

    /* ── Timer engine ──────────────────────────────────────────────── */
    // Explicit session MODE machine —
    //   idle: nothing loaded (fresh mount / after Stop)
    //   armed: durations loaded, clock shows the FULL time, NOT counting
    // (waiting for the explicit START)
    //   running: the countdown advances (endsAt is authoritative)
    //   paused: mid-phase hold (remainingMs frozen until resume)
    const [phase, setPhase] = React.useState<PhaseKind>("focus");
    const [running, setRunning] = React.useState(false);
    // held = mid-phase pause; distinguishes "paused" from "armed".
    const [held, setHeld] = React.useState(false);
    const [endsAt, setEndsAt] = React.useState<number | null>(null);
    const [remainingMs, setRemainingMs] = React.useState(0);
    const [phaseDurationMs, setPhaseDurationMs] = React.useState(0);
    const mode: "idle" | "armed" | "running" | "paused" =
        running ? "running" : phaseDurationMs === 0 ? "idle" : held ? "paused" : "armed";
    // Visibility + widget UI state.
    const [visible, setVisible] = React.useState(false);
    const [minimized, setMinimized] = React.useState(false);
    const [panel, setPanel] = React.useState<"timer" | "settings" | "stats">("timer");
    const [justCompleted, setJustCompleted] = React.useState<PhaseKind | null>(null);
    // Guard so completing a phase inside a re-render cascade can't
    // double-count stats (interval + user click at the same moment).
    const completingRef = React.useRef(false);
    const taskLabelRef = React.useRef("");
    React.useEffect(() => {
        taskLabelRef.current = taskLabel;
    }, [taskLabel]);

    /** Duration (ms) of a phase kind under the CURRENT settings. */
    const phaseMs = React.useCallback(
        (kind: PhaseKind) =>
            Math.round((kind === "focus" ? settings.focus : settings.short) * 60_000),
        [settings.focus, settings.short]
    );

    /** Credit the accumulated focus time to today's stats. Called when a
     *  FOCUS phase completes (the only phase that counts). */
    const creditFocusSession = React.useCallback(
        (minutes: number) => {
            setStats((prev) => {
                const key = localDayKey();
                const today = prev.days[key] ?? {sessions: 0, minutes: 0};
                // Streak: consecutive days ending today (or yesterday) with at
                // least one focus block. Recompute from the day map each time.
                const dayKeys = new Set(Object.keys(prev.days));
                dayKeys.add(key);
                let streak = 0;
                const cursor = new Date();
                if (!dayKeys.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
                while (dayKeys.has(localDayKey(cursor))) {
                    streak += 1;
                    cursor.setDate(cursor.getDate() - 1);
                }
                const next: FocusStats = {
                    days: {...prev.days, [key]: {sessions: today.sessions + 1, minutes: today.minutes + minutes}},
                    streak,
                    totalSessions: prev.totalSessions + 1,
                    totalMinutes: Math.round((prev.totalMinutes + minutes) * 10) / 10,
                };
                // Prune anything older than 400 days so the map stays bounded.
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 400);
                const cutoffKey = localDayKey(cutoff);
                for (const k of Object.keys(next.days)) {
                    if (k < cutoffKey) delete next.days[k];
                }
                try {
                    window.localStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(next));
                } catch { /* storage */
                }
                return next;
            });
        },
        []
    );

    /** Advance the phase machine. Called when a phase's time runs out
     *  (credit = true) or via Skip (credit = false — an abandoned focus
     *  block must NOT count toward today's stats). */
    const advancePhase = React.useCallback((credit = true) => {
        if (completingRef.current) return;
        completingRef.current = true;
        const finishedKind = phase;
        const finishedMinutes = phaseDurationMs / 60_000;
        if (finishedKind === "focus" && credit) {
            creditFocusSession(finishedMinutes);
        }
        const nextKind: PhaseKind = finishedKind === "focus" ? "short" : "focus";
        const ms = phaseMs(nextKind);
        setPhase(nextKind);
        setPhaseDurationMs(ms);
        setJustCompleted(finishedKind);
        setTimeout(() => setJustCompleted(null), 2600);
        if (settings.sound) playChime();
        if (settings.notify) {
            toast({
                title:
                    finishedKind === "focus"
                        ? "Focus block complete 🎉"
                        : "Break over — back to focus",
                description:
                    finishedKind === "focus"
                        ? `${Math.round(finishedMinutes)} min done${
                            taskLabelRef.current ? ` — ${taskLabelRef.current}` : ""
                        }. Take a short break.`
                        : `Next: ${settings.focus} min focus.`,
            });
        }
        if (settings.autoStart) {
            // Phase CHAINING (explicitly enabled in settings) — the next
            // phase keeps counting. Note the FIRST phase of a session never
            // auto-starts (armSession leaves it armed).
            setRunning(true);
            setHeld(false);
            setEndsAt(Date.now() + ms);
        } else {
            setRunning(false);
            setHeld(false);
            setEndsAt(null);
            setRemainingMs(ms);
        }
        completingRef.current = false;
    }, [phase, phaseDurationMs, settings.autoStart, settings.sound, settings.notify, settings.focus, phaseMs, creditFocusSession, toast]);

    // The ticker — a 250ms interval reading the authoritative endsAt.
    React.useEffect(() => {
        if (!running || endsAt == null) return;
        const tick = () => {
            const left = endsAt - Date.now();
            if (left <= 0) {
                advancePhase();
            } else {
                setRemainingMs(left);
            }
        };
        tick();
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
    }, [running, endsAt, advancePhase]);

    /* ── Zen mode broadcast ───────────────────────────────────────────
       While a FOCUS phase is actively running and zenMode is on, tell
       page.tsx to hide the IDE chrome (sidebar + bottom panel + AI
       sidebar). Pausing, stopping, or entering a break restores it. */
    React.useEffect(() => {
        const active = settings.zenMode && running && phase === "focus";
        window.dispatchEvent(new CustomEvent("praxis:zen", {detail: {active}}));
        return () => {
            window.dispatchEvent(new CustomEvent("praxis:zen", {detail: {active: false}}));
        };
    }, [settings.zenMode, running, phase]);

    /* ── Live countdown in the browser tab title ──────────────────── */
    React.useEffect(() => {
        if (!settings.tabTitle) return;
        if (mode !== "running") {
            if (document.title.startsWith("⏳ ")) {
                document.title = document.title.replace(/^⏳ \d+:\d+ /, "");
            }
            return;
        }
        const update = () => {
            const left = endsAt != null ? Math.max(0, endsAt - Date.now()) : 0;
            const t = formatClock(left);
            if (!document.title.startsWith("⏳ ")) {
                document.title = `⏳ ${t} ${document.title}`;
            } else {
                document.title = `⏳ ${t} ${document.title.replace(/^⏳ \d+:\d+ /, "")}`;
            }
        };
        update();
        const id = window.setInterval(update, 1000);
        return () => {
            window.clearInterval(id);
            if (document.title.startsWith("⏳ ")) {
                document.title = document.title.replace(/^⏳ \d+:\d+ /, "");
            }
        };
    }, [settings.tabTitle, mode, endsAt, phase]);

    /* ── Daily-goal celebration (once per day) ───────────────────── */
    const goalCelebratedRef = React.useRef(false);
    React.useEffect(() => {
        if (settings.dailyGoalMin <= 0) return;
        const today = stats.days[localDayKey()];
        if (!today) return;
        if (today.minutes >= settings.dailyGoalMin && !goalCelebratedRef.current) {
            goalCelebratedRef.current = true;
            if (settings.sound) playGoalFanfare();
            toast({
                title: "Daily goal reached! 🏁",
                description: `${Math.round(today.minutes)} focus minutes today (goal ${settings.dailyGoalMin}) — everything from here is bonus.`,
            });
        }
    }, [stats, settings.dailyGoalMin, settings.sound, toast]);

    /* ── Commands (from the navbar Focus menu + widget buttons) ────── */

    /** armSession — loads a preset's durations and SHOWS the widget, but
     * deliberately does NOT start the countdown (the explicit
     * rule: the timer starts only on a START click). */
    const armSession = React.useCallback(
        (preset: PresetId) => {
            const durations: FocusDurations =
                preset === "custom"
                    ? {
                        focus: settings.focus,
                        short: settings.short,
                    }
                    : FOCUS_PRESETS[preset];
            const next: FocusSettings = {...settings, preset, ...durations};
            saveSettings(next);
            const ms = Math.round(durations.focus * 60_000);
            setPhase("focus");
            setPhaseDurationMs(ms);
            // ARMED — not running. The Start button begins the countdown.
            setRunning(false);
            setHeld(false);
            setEndsAt(null);
            setRemainingMs(ms);
            setVisible(true);
            setMinimized(false);
            setPanel("timer");
            toast({
                title: `${preset === "pomodoro" ? "Pomodoro" : preset === "classic5217" ? "52/17" : preset === "deepwork" ? "Deep work" : "Custom"} session armed`,
                description: `${durations.focus} min focus ready — press Start when you are.`,
            });
        },
        [settings, saveSettings, toast]
    );

    /** The explicit START — only THIS (or pause/resume on an armed
     *  session) ever begins a countdown. */
    const beginCountdown = React.useCallback(() => {
        if (phaseDurationMs === 0) return;
        // Opt-in coupling: "start ambient with focus sessions" (Settings →
        // Focus). The ambient engine itself is timer-independent — this
        // only flips it on when a focus block actually begins.
        if (phase === "focus" && settings.ambientWithFocus && !getAmbientState().running) {
            toggleAmbient(true);
        }
        const ms = remainingMs > 0 && mode !== "running" ? remainingMs : phaseDurationMs;
        setRunning(true);
        setHeld(false);
        setEndsAt(Date.now() + (ms > 0 ? ms : phaseDurationMs));
    }, [phaseDurationMs, remainingMs, mode, phase, settings.ambientWithFocus]);

    const pauseOrResume = React.useCallback(() => {
        // Armed → this click IS the start (the menu item reads
        // "Start · pause · resume" for exactly this reason).
        if (mode === "armed") {
            beginCountdown();
            return;
        }
        if (mode === "paused") {
            setRunning(true);
            setHeld(false);
            setEndsAt(Date.now() + remainingMs);
            return;
        }
        if (mode === "running" && endsAt != null) {
            setRemainingMs(Math.max(0, endsAt - Date.now()));
            setHeld(true);
            setRunning(false);
        }
    }, [mode, endsAt, remainingMs, beginCountdown]);

    const stopSession = React.useCallback(() => {
        setRunning(false);
        setHeld(false);
        setEndsAt(null);
        setPhase("focus");
        setPhaseDurationMs(0);
        setRemainingMs(0);
        setPanel("timer");
    }, []);

    const skipPhase = React.useCallback(() => {
        // Skip advances the machine exactly like a natural completion but
        // credits NOTHING.
        advancePhase(false);
    }, [advancePhase]);

    React.useEffect(() => {
        const onCommand = (e: Event) => {
            const detail = (e as CustomEvent).detail as
                | { command: string; preset?: PresetId }
                | undefined;
            if (!detail) return;
            switch (detail.command) {
                case "start":
                case "arm":
                    if (detail.preset) armSession(detail.preset);
                    break;
                case "begin":
                    beginCountdown();
                    break;
                case "pause-resume":
                    pauseOrResume();
                    break;
                case "stop":
                    stopSession();
                    break;
                case "skip":
                    skipPhase();
                    break;
                case "show":
                    setVisible(true);
                    setMinimized(false);
                    break;
                case "hide":
                    setVisible(false);
                    break;
                case "settings":
                    setVisible(true);
                    setMinimized(false);
                    setPanel("settings");
                    break;
                case "stats":
                    setVisible(true);
                    setMinimized(false);
                    setPanel("stats");
                    break;
            }
        };
        window.addEventListener("praxis:focus-command", onCommand);
        return () => window.removeEventListener("praxis:focus-command", onCommand);
    }, [armSession, beginCountdown, pauseOrResume, stopSession, skipPhase]);

    /* ── Dragging (pointer events — mouse + touch + pen) ───────────── */
    const widgetRef = React.useRef<HTMLDivElement | null>(null);
    const dragStateRef = React.useRef<{
        pointerId: number;
        offsetX: number;
        offsetY: number;
    } | null>(null);
    // Position lives in a ref + state pair: state for rendering, ref for
    // the move handler (no re-render per pixel).
    const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

    // Restore the last position on mount, clamped to today's viewport.
    React.useEffect(() => {
        void (async () => {
            try {
                const raw = window.localStorage.getItem(FOCUS_POS_KEY);
                if (raw) {
                    const p = JSON.parse(raw) as { x?: number; y?: number };
                    if (typeof p.x === "number" && typeof p.y === "number") {
                        const w = window.innerWidth;
                        const h = window.innerHeight;
                        setPos({
                            x: clampNum(p.x, 8, Math.max(8, w - 120)),
                            y: clampNum(p.y, 8, Math.max(8, h - 80)),
                        });
                    }
                }
            } catch { /* corrupted — default position */
            }
        })();
    }, []);

    const persistPos = React.useCallback((x: number, y: number) => {
        try {
            window.localStorage.setItem(FOCUS_POS_KEY, JSON.stringify({x, y}));
        } catch { /* storage */
        }
    }, []);

    // Keep the widget inside the viewport when the window shrinks.
    React.useEffect(() => {
        const onResize = () => {
            setPos((prev) => {
                if (!prev) return prev;
                const w = window.innerWidth;
                const h = window.innerHeight;
                const el = widgetRef.current;
                const width = el?.offsetWidth ?? 300;
                const height = el?.offsetHeight ?? 160;
                const next = {
                    x: clampNum(prev.x, 8, Math.max(8, w - width - 8)),
                    y: clampNum(prev.y, 8, Math.max(8, h - height - 8)),
                };
                if (next.x !== prev.x || next.y !== prev.y) persistPos(next.x, next.y);
                return next;
            });
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [persistPos]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Only the grip area drags — buttons stay clickable.
        if ((e.target as HTMLElement).closest("button, input, a, [role=\"switch\"]")) return;
        const el = widgetRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const base = pos ?? {x: rect.left, y: rect.top};
        dragStateRef.current = {
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
        setPos(base);
        el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const el = widgetRef.current;
        if (!el) return;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const next = {
            x: clampNum(e.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - width - 8)),
            y: clampNum(e.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - height - 8)),
        };
        setPos(next);
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        try {
            widgetRef.current?.releasePointerCapture(e.pointerId);
        } catch { /* already released */
        }
        setPos((prev) => {
            if (prev) persistPos(prev.x, prev.y);
            return prev;
        });
    };

    /* ── Derived render values ──────────────────────────────────────── */
    const displayMs = running && endsAt != null ? Math.max(0, endsAt - Date.now()) : remainingMs;
    const progress =
        phaseDurationMs > 0 ? clampNum(1 - displayMs / phaseDurationMs, 0, 1) : 0;
    const todayKey = localDayKey();
    const today = stats.days[todayKey] ?? {sessions: 0, minutes: 0};

    // Last 7 days (oldest → newest) for the weekly bars.
    const week = React.useMemo(() => {
        const out: { key: string; label: string; minutes: number; isToday: boolean }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = localDayKey(d);
            out.push({
                key,
                label: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()] ?? "",
                minutes: stats.days[key]?.minutes ?? 0,
                isToday: i === 0,
            });
        }
        return out;
    }, [stats.days]);
    const weekMax = Math.max(30, ...week.map((d) => d.minutes));
    const goalPct =
        settings.dailyGoalMin > 0
            ? clampNum(today.minutes / settings.dailyGoalMin, 0, 1)
            : 0;

    const phaseIcon =
        phase === "focus" ? <Brain className="size-3.5"/> : <Coffee className="size-3.5"/>;
    const phaseColor =
        phase === "focus"
            ? "text-emerald-500"
            : phase === "short"
                ? "text-sky-500"
                : "text-violet-500";
    const phaseStroke =
        phase === "focus" ? "#10b981" : phase === "short" ? "#0ea5e9" : "#8b5cf6";
    const phaseBg =
        phase === "focus"
            ? "bg-emerald-500"
            : phase === "short"
                ? "bg-sky-500"
                : "bg-violet-500";
    // The final minute of a running phase pulses amber — a gentle "wrap
    // it up" cue.
    const finalMinute = running && displayMs <= 60_000 && displayMs > 0;
    const effectiveStroke = finalMinute ? "#f59e0b" : phaseStroke;
    const effectiveColor = finalMinute ? "text-amber-500" : phaseColor;

    // The ambient track groups, memoized once (they never change).
    const ambientGroups = React.useMemo(() => ambientTracksByCategory(), []);

    if (!visible) return null;

    /* ── The progress ring (SVG) ──────────────────────────────────────
       A 96px ring whose stroke fills clockwise with `progress`; the
       clock sits in the hole. */
    const RING_R = 52;
    const RING_C = 2 * Math.PI * RING_R;

    const renderRing = () => (
        <svg
            viewBox="0 0 120 120"
            className={cn("mx-auto block", settings.compact ? "size-[104px]" : "size-[120px]")}
            role="presentation"
        >
            <circle cx="60" cy="60" r={RING_R} fill="none" stroke="currentColor" className="text-muted/40"
                    strokeWidth="7"/>
            <circle
                cx="60"
                cy="60"
                r={RING_R}
                fill="none"
                stroke={effectiveStroke}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - progress)}
                transform="rotate(-90 60 60)"
                style={{transition: "stroke-dashoffset 0.3s linear"}}
            />
            {/* Phase dots at the phase start position for a subtle tick. */}
            <circle cx="60" cy="8" r="3" fill={effectiveStroke} opacity="0.5"/>
        </svg>
    );

    /* ── The floating widget ────────────────────────────────────────── */
    return (
        <div
            ref={widgetRef}
            data-tutorial="focus-widget"
            role="dialog"
            aria-label="Focus session timer"
            style={pos ? {left: pos.x, top: pos.y, right: "auto", bottom: "auto"} : undefined}
            className={cn(
                "fixed z-[70] top-16 right-4 select-none rounded-xl border shadow-xl overflow-hidden",
                "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
                settings.compact ? "w-[240px]" : "w-[300px]",
                "touch-none"
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            {/* Header — the grip. The whole bar drags (buttons excluded). */}
            <div
                className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 border-b cursor-grab active:cursor-grabbing",
                    justCompleted && "animate-pulse"
                )}
                title="Drag to move — the timer stays where you drop it"
            >
                <GripHorizontal className="size-3.5 text-muted-foreground shrink-0"/>
                <span className={cn("flex items-center gap-1.5 text-xs font-semibold shrink-0", effectiveColor)}>
          {phaseIcon}
                    {mode === "armed" ? `${PHASE_META[phase].label} · armed` : PHASE_META[phase].label}
        </span>
                <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0"
                      title={PHASE_META[phase].hint}>
          {mode === "armed"
              ? "Press Start when you're ready"
              : PHASE_META[phase].hint}
        </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 shrink-0"
                    onClick={() => setMinimized((m) => !m)}
                    aria-label={minimized ? "Expand focus timer" : "Minimize focus timer"}
                    title={minimized ? "Expand" : "Minimize to a pill"}
                >
                    <Minus className="size-3"/>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 shrink-0"
                    onClick={() => setVisible(false)}
                    aria-label="Hide the focus timer"
                    title="Hide (restart it from the Focus menu)"
                >
                    <X className="size-3"/>
                </Button>
            </div>

            {minimized ? (
                /* Minimized pill: just the clock + play/pause. */
                <div className="flex items-center gap-2 px-3 py-2">
          <span className={cn("text-lg font-bold tabular-nums", effectiveColor)}>
            {formatClock(displayMs)}
          </span>
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={pauseOrResume}
                        disabled={mode === "idle"}
                        aria-label={mode === "running" ? "Pause" : mode === "paused" ? "Resume" : "Start"}
                        title={mode === "running" ? "Pause (the remainder is held)" : mode === "paused" ? "Resume" : "Start the countdown"}
                    >
                        {mode === "running" ? <Pause className="size-3.5"/> : <Play className="size-3.5"/>}
                    </Button>
                </div>
            ) : panel === "timer" ? (
                <div className={cn(settings.compact ? "p-2" : "p-3")}>
                    {/* Ring presentation — the clock sits inside an animated SVG
              progress ring (click the ring to start/pause). The classic
              bar stays available via Focus settings → Progress style. */}
                    {settings.ringStyle === "ring" && phaseDurationMs > 0 ? (
                        <button
                            type="button"
                            onClick={() => {
                                if (mode === "idle") return;
                                pauseOrResume();
                            }}
                            className="relative mx-auto block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                            title={
                                mode === "armed"
                                    ? "Click to START the countdown"
                                    : mode === "running"
                                        ? "Click to pause (the remainder is held)"
                                        : mode === "paused"
                                            ? "Click to resume"
                                            : "Progress ring"
                            }
                            aria-label="Focus progress — click to start, pause or resume"
                        >
                            {renderRing()}
                            <span
                                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span
                    className={cn(
                        "font-bold tabular-nums leading-none",
                        settings.compact ? "text-2xl" : "text-3xl",
                        effectiveColor,
                        finalMinute && "animate-pulse"
                    )}
                    aria-live="off"
                >
                  {formatClock(displayMs)}
                </span>
                <span className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                  {phase === "focus"
                      ? taskLabel || "Focus block"
                      : `${Math.round(phaseDurationMs / 60_000)} min break`}
                    {mode === "paused" && " · paused"}
                    {mode === "armed" && " · ready"}
                </span>
              </span>
                        </button>
                    ) : (
                        <>
                            {/* Clock + progress bar (the classic presentation) */}
                            <div className="flex items-end justify-between gap-2">
                                <div className="min-w-0">
                                    <div
                                        className={cn(
                                            "text-4xl font-bold tabular-nums leading-none",
                                            effectiveColor,
                                            finalMinute && "animate-pulse"
                                        )}
                                        aria-live="off"
                                    >
                                        {formatClock(displayMs)}
                                    </div>
                                    <div className="mt-1 text-[10px] text-muted-foreground truncate">
                                        {phase === "focus"
                                            ? taskLabel || "Focus block"
                                            : `Next: ${settings.focus} min focus`}
                                        {mode === "paused" && " · paused"}
                                        {mode === "armed" && " · press Start"}
                                    </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {phaseDurationMs > 0 ? `/${Math.round(phaseDurationMs / 60_000)} min` : ""}
                </span>
                            </div>
                            <div
                                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(progress * 100)}
                            >
                                <div
                                    className={cn("h-full rounded-full transition-[width] duration-300", finalMinute ? "bg-amber-500" : phaseBg)}
                                    style={{width: `${progress * 100}%`}}
                                />
                            </div>
                        </>
                    )}

                    {/* Controls — the primary button keeps a FIXED width so the
row never reflows (and never overflows the widget) when
the label switches between Start / Pause / Resume; the
whole row wraps gracefully in compact mode. */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Button
                            variant={mode === "armed" ? "default" : "outline"}
                            size="sm"
                            className={cn(
                                "h-7 gap-1.5 text-xs w-[78px] justify-center px-0",
                                mode === "armed" && "bg-emerald-500 hover:bg-emerald-600"
                            )}
                            onClick={mode === "armed" ? beginCountdown : pauseOrResume}
                            disabled={mode === "idle"}
                            title={
                                mode === "armed"
                                    ? "START the countdown — nothing counts until you click this"
                                    : mode === "running"
                                        ? "Pause — the remaining time is held"
                                        : mode === "paused"
                                            ? "Resume the held countdown"
                                            : "Load a preset first"
                            }
                        >
                            {mode === "running" ? <Pause className="size-3.5 shrink-0"/> :
                                <Play className="size-3.5 shrink-0"/>}
                            <span
                                className="truncate">{mode === "armed" ? "Start" : mode === "running" ? "Pause" : "Resume"}</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={stopSession}
                            title="Stop and reset the session"
                        >
                            <Square className="size-3.5 shrink-0"/>
                            Stop
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={skipPhase}
                            title="Skip to the next phase (a skipped focus block is not counted)"
                        >
                            <SkipForward className="size-3.5 shrink-0"/>
                            Skip
                        </Button>
                        <span className="ml-auto flex items-center gap-1">
              <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-7", ambient.running && "text-emerald-500")}
                  onClick={handleAmbientToggle}
                  aria-label={ambient.on ? "Mute ambient sounds" : "Play ambient sounds"}
                  title={
                      ambient.on
                          ? `Ambient sounds on (${ambient.activeCount} in the mix) — click to mute. Timer not required.`
                          : `Play ambient sounds (${AMBIENT_TRACK_COUNT} synthesized tracks — no timer needed). Tune the mix in the mixer below.`
                  }
              >
                {ambient.running ? <Volume2 className="size-3.5"/> : <VolumeX className="size-3.5"/>}
              </Button>
              <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setPanel("settings")}
                  aria-label="Focus settings"
                  title="Focus settings — durations, sound, ring, zen, ambient mixer"
              >
                <Settings2 className="size-3.5"/>
              </Button>
              <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setPanel("stats")}
                  aria-label="Focus statistics"
                  title="Today's sessions, minutes, weekly chart and streak"
              >
                <BarChart3 className="size-3.5"/>
              </Button>
            </span>
                    </div>

                    {/* Quick presets — these ARM a session (load the durations +
              show the clock) but do NOT start counting. The row wraps
              in compact mode instead of overflowing. */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
                        <Timer className="size-3.5 text-muted-foreground shrink-0"/>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => armSession("pomodoro")}
                            title="Arm 25 min focus / 5 min break — the countdown starts when you press Start"
                        >
                            Pomodoro
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => armSession("classic5217")}
                            title="Arm 52 min focus / 17 min break (the DeskTime rule) — press Start to count"
                        >
                            52/17
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => armSession("deepwork")}
                            title="Arm one 90-minute ultradian cycle, then a 10-minute break — press Start to count"
                        >
                            90 Deep
                        </Button>
                    </div>
                </div>
            ) : panel === "settings" ? (
                <div className={cn(settings.compact ? "p-2" : "p-3", "space-y-3")}>
                    <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Settings2 className="size-3.5 text-muted-foreground"/>
              Focus settings
            </span>
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => setPanel("timer")}
                                aria-label="Back to the timer">
                            <RotateCcw className="size-3"/>
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label htmlFor="focus-min" className="text-[10px] text-muted-foreground">Focus (min)</Label>
                            <Input
                                id="focus-min"
                                type="number"
                                min={1}
                                max={240}
                                value={settings.focus}
                                onChange={(e) =>
                                    saveSettings({
                                        ...settings,
                                        preset: "custom",
                                        focus: clampNum(Number(e.target.value) || 1, 1, 240),
                                    })
                                }
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="short-min" className="text-[10px] text-muted-foreground">Short break</Label>
                            <Input
                                id="short-min"
                                type="number"
                                min={1}
                                max={60}
                                value={settings.short}
                                onChange={(e) =>
                                    saveSettings({
                                        ...settings,
                                        preset: "custom",
                                        short: clampNum(Number(e.target.value) || 1, 1, 60),
                                    })
                                }
                                className="h-7 text-xs"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="task-input" className="text-[10px] text-muted-foreground shrink-0">Working
                            on…</Label>
                        <Input
                            id="task-input"
                            value={taskLabel}
                            onChange={(e) => setTaskLabel(e.target.value.slice(0, 60))}
                            placeholder="e.g. DijkstraShortestPath"
                            className="h-7 flex-1 min-w-0 w-auto text-xs"
                            title="Shown on the timer and in the completion toast"
                        />
                    </div>
                    {/* Presentation + behavior options. */}
                    <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Progress style</Label>
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant={settings.ringStyle === "ring" ? "default" : "outline"}
                                size="sm"
                                className="h-6 px-2 text-[11px] gap-1"
                                onClick={() => saveSettings({...settings, ringStyle: "ring"})}
                                title="Animated circular progress ring around the clock (click the ring to start/pause)"
                            >
                                <CircleDot className="size-3"/>
                                Ring
                            </Button>
                            <Button
                                variant={settings.ringStyle === "bar" ? "default" : "outline"}
                                size="sm"
                                className="h-6 px-2 text-[11px] gap-1"
                                onClick={() => saveSettings({...settings, ringStyle: "bar"})}
                                title="Classic horizontal bar under the clock"
                            >
                                <span className="block w-3 h-1 rounded-full bg-current"/>
                                Bar
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="daily-goal"
                               className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Target className="size-3"/>
                            Daily goal (minutes, 0 = off)
                        </Label>
                        <Input
                            id="daily-goal"
                            type="number"
                            min={0}
                            max={720}
                            value={settings.dailyGoalMin}
                            onChange={(e) =>
                                saveSettings({
                                    ...settings,
                                    dailyGoalMin: clampNum(Number(e.target.value) || 0, 0, 720),
                                })
                            }
                            className="h-7 text-xs"
                            title="A gentle chime + toast fire the first time today's focus minutes reach this goal"
                        />
                    </div>
                    <div className="space-y-2 border-t pt-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="auto-start" className="text-[11px]">Auto-chain next phase</Label>
                            <Switch
                                id="auto-start"
                                checked={settings.autoStart}
                                onCheckedChange={(v) => saveSettings({...settings, autoStart: v})}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="focus-sound" className="text-[11px] flex items-center gap-1.5">
                                {settings.sound ? <Volume2 className="size-3.5"/> : <VolumeX className="size-3.5"/>}
                                Chime when a phase ends
                            </Label>
                            <Switch
                                id="focus-sound"
                                checked={settings.sound}
                                onCheckedChange={(v) => saveSettings({...settings, sound: v})}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="focus-notify" className="text-[11px]">Toast notifications</Label>
                            <Switch
                                id="focus-notify"
                                checked={settings.notify}
                                onCheckedChange={(v) => saveSettings({...settings, notify: v})}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="focus-tab-title" className="text-[11px]">Countdown in tab title</Label>
                            <Switch
                                id="focus-tab-title"
                                checked={settings.tabTitle}
                                onCheckedChange={(v) => saveSettings({...settings, tabTitle: v})}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="focus-compact" className="text-[11px]">Compact widget</Label>
                            <Switch
                                id="focus-compact"
                                checked={settings.compact}
                                onCheckedChange={(v) => saveSettings({...settings, compact: v})}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="focus-zen" className="text-[11px]">Zen mode</Label>
                            <Switch
                                id="focus-zen"
                                checked={settings.zenMode}
                                onCheckedChange={(v) => saveSettings({...settings, zenMode: v})}
                            />
                        </div>
                        {settings.zenMode && (
                            <p className="text-[10px] text-muted-foreground leading-snug">
                                While a focus block runs, the sidebar, bottom panel and AI chat hide themselves;
                                stopping, pausing or a break brings everything back.
                            </p>
                        )}
                        <div className="flex items-center justify-between">
                            <Label htmlFor="focus-ambient-auto" className="text-[11px]">Ambient with focus
                                sessions</Label>
                            <Switch
                                id="focus-ambient-auto"
                                checked={settings.ambientWithFocus}
                                onCheckedChange={(v) => saveSettings({...settings, ambientWithFocus: v})}
                            />
                        </div>
                    </div>
                    {/* ── Ambient sounds (shared engine — plays with or without a
timer). The full-track mixer (105 sounds)
lives in its own MODAL (Focus ▸ Ambient mixer… —
praxis:ambient-mixer): the widget keeps the quick master
switch + volume and an active-mix summary, so "Focus
settings" and the "Ambient mixer" are two DIFFERENT
surfaces. */}
                    <div className="space-y-2 border-t pt-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="ambient-on" className="text-[11px] flex items-center gap-1.5">
                                {ambient.on ? <Volume2 className="size-3.5"/> : <VolumeX className="size-3.5"/>}
                                Ambient sounds
                            </Label>
                            <Switch
                                id="ambient-on"
                                checked={ambient.on}
                                onCheckedChange={(v) => handleAmbientToggle()}
                                title="Plays independently of the focus timer — start and stop it any time"
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="ambient-master" className="text-[10px] font-medium">
                                    Master volume
                                </Label>
                                <span
                                    className="text-[10px] text-muted-foreground tabular-nums">{ambient.master}%</span>
                            </div>
                            <input
                                id="ambient-master"
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={ambient.master}
                                onChange={(e) => setAmbientMaster(Number(e.target.value))}
                                className="w-full h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer"
                                aria-label="Ambient master volume"
                                title="Overall loudness of the whole ambient mix"
                            />
                        </div>
                        {/* Active-mix summary — which sounds are in the blend right
                now, plus the launcher into the full mixer panel. */}
                        {ambient.activeCount > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {ambientGroups.map((group) =>
                                        group.tracks
                                            .filter((t) => (ambient.vols[t.id] ?? 0) > 0)
                                            .map((t) => (
                                                <span
                                                    key={t.id}
                                                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400"
                                                    title={`${t.label} — ${ambient.vols[t.id] ?? 0}% (click Open ambient mixer… to adjust)`}
                                                >
                        <Volume2 className="size-2.5"/>
                                                    {t.label}
                                                    <span className="tabular-nums opacity-70">{ambient.vols[t.id]}%</span>
                      </span>
                                            ))
                                )}
                            </div>
                        ) : (
                            <p className="text-[10px] text-muted-foreground leading-snug">
                                Nothing in the mix yet — open the mixer and pick any combination of
                                the {AMBIENT_TRACK_COUNT} sounds.
                            </p>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full text-xs gap-1.5"
                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:ambient-mixer"))}
                            title={`Open the Ambient Mixer — a draggable panel with all ${AMBIENT_TRACK_COUNT} sounds, per-track volume sliders and one-click blends (no timer needed)`}
                        >
                            <AudioWaveform className="size-3.5 text-emerald-500"/>
                            Open ambient mixer…
                        </Button>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            {AMBIENT_TRACK_COUNT} sounds synthesized locally with WebAudio — mix any combination, works
                            offline,
                            and runs with or without a timer.
                        </p>
                    </div>
                </div>
            ) : (
                /* ── Stats panel — weekly chart + daily goal ── */
                <div className={cn(settings.compact ? "p-2" : "p-3", "space-y-3")}>
                    <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <BarChart3 className="size-3.5 text-muted-foreground"/>
              Study statistics
            </span>
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => setPanel("timer")}
                                aria-label="Back to the timer">
                            <RotateCcw className="size-3"/>
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg bg-muted/50 p-2">
                            <div className="text-xl font-bold tabular-nums text-emerald-500">{today.sessions}</div>
                            <div className="text-[10px] text-muted-foreground">focus blocks today</div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                            <div className="text-xl font-bold tabular-nums text-emerald-500">
                                {Math.round(today.minutes)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">focus minutes today</div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                            <div
                                className="text-xl font-bold tabular-nums text-amber-500 flex items-center justify-center gap-1">
                                <Flame className="size-3.5"/>
                                {stats.streak}
                            </div>
                            <div className="text-[10px] text-muted-foreground">day streak</div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2">
                            <div className="text-xl font-bold tabular-nums text-sky-500">
                                {stats.totalSessions}
                            </div>
                            <div className="text-[10px] text-muted-foreground">all-time blocks</div>
                        </div>
                    </div>
                    {/* Daily goal progress */}
                    {settings.dailyGoalMin > 0 && (
                        <div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span className="flex items-center gap-1">
                  <Target className="size-3"/>
                  Daily Goal — {settings.dailyGoalMin} min
                </span>
                                <span className={cn("tabular-nums font-medium", goalPct >= 1 && "text-emerald-500")}>
                  {Math.round(today.minutes)} / {settings.dailyGoalMin}
                                    {goalPct >= 1 ? " ✓" : ""}
                </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-[width] duration-500",
                                        goalPct >= 1 ? "bg-emerald-500" : "bg-sky-500"
                                    )}
                                    style={{width: `${goalPct * 100}%`}}
                                />
                            </div>
                        </div>
                    )}
                    {/* Weekly bar chart (last 7 days, oldest → newest). */}
                    <div>
                        <div className="text-[10px] text-muted-foreground mb-1.5">Last 7 days (minutes)</div>
                        <div className="flex items-end justify-between gap-1 h-16" role="img"
                             aria-label="Focus minutes per day for the last 7 days">
                            {week.map((d) => (
                                <div key={d.key} className="flex-1 flex flex-col items-center gap-1"
                                     title={`${d.minutes ? Math.round(d.minutes) : 0} focus minutes`}>
                                    <div
                                        className={cn(
                                            "w-full rounded-sm transition-[height] duration-500",
                                            d.minutes > 0 ? "bg-emerald-500/80" : "bg-muted",
                                            d.isToday && d.minutes > 0 && "bg-emerald-500 ring-1 ring-emerald-500/40"
                                        )}
                                        style={{height: `${Math.max(4, (d.minutes / weekMax) * 100)}%`}}
                                    />
                                    <span
                                        className={cn("text-[9px]", d.isToday ? "text-foreground font-semibold" : "text-muted-foreground")}>
                    {d.label}
                  </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground text-center">
                        {stats.totalMinutes > 0
                            ? `${Math.round(stats.totalMinutes).toLocaleString()} focus minutes in total — keep the streak alive.`
                            : "Complete your first focus block to start a streak."}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-full text-xs"
                        onClick={() => {
                            saveStats(DEFAULT_STATS);
                            goalCelebratedRef.current = false;
                            toast({title: "Statistics reset", description: "Streaks and history cleared."});
                        }}
                        title="Clear all focus statistics"
                    >
                        <RotateCcw className="size-3.5"/>
                        Reset statistics
                    </Button>
                </div>
            )}
        </div>
    );
}
