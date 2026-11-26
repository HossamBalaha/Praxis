"use client";

/**
 *  — the Focus tab, extracted from settings-dialog.tsx
 * (3,700 lines) into its own module. Part of the settings-dialog
 * split: each tab keeps its own file; the dialog shell owns the tab
 * strip, search index, and the shared draft state.
 *
 * Props are exactly the focus-related state + helpers the tab used as
 * an inline section (verified by the type checker): the draft, the
 * field updater, the preset applier, and the toast.
 */
import * as React from "react";
import {
    AudioWaveform,
    Bell,
    Brain,
    CircleDot,
    Clock,
    Coffee,
    Eye,
    Maximize2,
    PanelBottom,
    Target,
    Timer as TimerIcon,
    Volume2,
    VolumeX,
    Zap,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {
    AMBIENT_TRACK_COUNT,
    type AmbientState,
    ambientTracksByCategory,
    setAmbientMaster,
    setAmbientTrack,
    toggleAmbient as toggleAmbientFn,
} from "@/lib/ambient";
import type {FocusSettings, PresetId} from "@/lib/focus-settings";

/** The reusable row the settings dialog uses (re-exported shape —
 *  defined locally so this module has no circular import on the
 *  3,700-line dialog). */
function SettingRow({
                        icon,
                        label,
                        hint,
                        children,
                    }: {
    icon?: React.ReactNode;
    label: string;
    hint?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                    {icon}
                    {label}
                </div>
                {hint ? (
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-lg">{hint}</p>
                ) : null}
            </div>
            <div className="shrink-0 flex items-center gap-2">{children}</div>
        </div>
    );
}

export function FocusTabSection({
                                    focusDraft,
                                    updateFocus,
                                    applyFocusPreset,
                                    ambient,
                                    ambientGroups,
                                    toggleAmbient = toggleAmbientFn,
                                    setAmbientMaster: setMaster = setAmbientMaster,
                                    toast,
                                }: {
    focusDraft: FocusSettings;
    updateFocus: <K extends keyof FocusSettings>(key: K, value: FocusSettings[K]) => void;
    applyFocusPreset: (preset: PresetId) => void;
    /** Live ambient-mixer state (the tab's ambient section binds to it). */
    ambient: AmbientState;
    /** The track catalogue grouped by category (memoized by the parent). */
    ambientGroups: ReturnType<typeof ambientTracksByCategory>;
    toggleAmbient?: typeof toggleAmbientFn;
    setAmbientMaster?: typeof setAmbientMaster;
    toast: (t: { title: string; description?: string; variant?: "default" | "destructive" | "warning" }) => void;
}) {
    return (
        <>
            <section className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Brain className="size-3"/>
                    Focus sessions
                </h3>
                <p className="text-[11px] text-muted-foreground">
                    The floating timer&apos;s durations and behavior — the same storage the
                    Focus menu and the widget write to, so changes apply to an armed or
                    running session immediately. Selecting a preset never starts the
                    countdown; that still takes your explicit Start click.
                </p>
                <SettingRow
                    icon={<TimerIcon className="size-3.5"/>}
                    label="Preset"
                    hint="Pomodoro 25/5 · the 52/17 DeskTime rule · one 90-minute deep-work cycle · or Custom (the two fields below)."
                >
                    <Select value={focusDraft.preset} onValueChange={(v) => applyFocusPreset(v as PresetId)}>
                        <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pomodoro" className="text-xs">Pomodoro 25/5</SelectItem>
                            <SelectItem value="classic5217" className="text-xs">52/17 rule</SelectItem>
                            <SelectItem value="deepwork" className="text-xs">Deep work 90</SelectItem>
                            <SelectItem value="custom" className="text-xs">Custom</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow icon={<Clock className="size-3.5"/>} label="Focus block (minutes)"
                            hint="Length of one deep-work block (1–240).">
                    <Input
                        type="number"
                        min={1}
                        max={240}
                        value={focusDraft.focus}
                        onChange={(e) => {
                            const n = parseInt(e.target.value || "25", 10);
                            updateFocus("focus", Number.isFinite(n) ? Math.max(1, Math.min(240, n)) : 25);
                        }}
                        className="font-mono text-xs h-8 w-32"
                    />
                </SettingRow>
                <SettingRow icon={<Coffee className="size-3.5"/>} label="Short break (minutes)"
                            hint="The breather between focus blocks (1–60).">
                    <Input
                        type="number"
                        min={1}
                        max={60}
                        value={focusDraft.short}
                        onChange={(e) => {
                            const n = parseInt(e.target.value || "5", 10);
                            updateFocus("short", Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 5);
                        }}
                        className="font-mono text-xs h-8 w-32"
                    />
                </SettingRow>
                <SettingRow
                    icon={<Target className="size-3.5"/>}
                    label="Daily focus goal (minutes)"
                    hint="A gentle chime + toast fire the first time today's focus minutes reach this goal. 0 = off."
                >
                    <Input
                        type="number"
                        min={0}
                        max={720}
                        value={focusDraft.dailyGoalMin}
                        onChange={(e) => {
                            const n = parseInt(e.target.value || "0", 10);
                            updateFocus("dailyGoalMin", Number.isFinite(n) ? Math.max(0, Math.min(720, n)) : 0);
                        }}
                        className="font-mono text-xs h-8 w-32"
                    />
                </SettingRow>
                <SettingRow icon={<Zap className="size-3.5"/>} label="Auto-chain next phase"
                            hint="When a phase ends, the next one starts counting automatically (the FIRST phase of a session is always armed, never auto-started).">
                    <Switch checked={focusDraft.autoStart} onCheckedChange={(v) => updateFocus("autoStart", v)}/>
                </SettingRow>
                <SettingRow icon={<Volume2 className="size-3.5"/>} label="Chime when a phase ends"
                            hint="A soft two-tone chime synthesized in the browser (no assets).">
                    <Switch checked={focusDraft.sound} onCheckedChange={(v) => updateFocus("sound", v)}/>
                </SettingRow>
                <SettingRow icon={<Bell className="size-3.5"/>} label="Toast when a phase ends"
                            hint="A desktop-style toast announcing each phase transition.">
                    <Switch checked={focusDraft.notify} onCheckedChange={(v) => updateFocus("notify", v)}/>
                </SettingRow>
                <SettingRow icon={<Eye className="size-3.5"/>} label="Countdown in the browser tab title"
                            hint="Mirrors the live remaining time into the page title while a phase runs.">
                    <Switch checked={focusDraft.tabTitle} onCheckedChange={(v) => updateFocus("tabTitle", v)}/>
                </SettingRow>
                <SettingRow icon={<CircleDot className="size-3.5"/>} label="Progress presentation"
                            hint="Ring = animated SVG circle around the clock; Bar = the classic horizontal bar.">
                    <Select value={focusDraft.ringStyle}
                            onValueChange={(v) => updateFocus("ringStyle", v as "ring" | "bar")}>
                        <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ring" className="text-xs">Progress ring</SelectItem>
                            <SelectItem value="bar" className="text-xs">Progress bar</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
                <SettingRow icon={<PanelBottom className="size-3.5"/>} label="Compact widget"
                            hint="Tighter padding and a smaller clock for the floating timer.">
                    <Switch checked={focusDraft.compact} onCheckedChange={(v) => updateFocus("compact", v)}/>
                </SettingRow>
                <SettingRow icon={<Maximize2 className="size-3.5"/>} label="Zen mode"
                            hint="While a focus block runs, the sidebar, bottom panel and AI chat hide themselves; stopping, pausing or a break brings everything back.">
                    <Switch checked={focusDraft.zenMode} onCheckedChange={(v) => updateFocus("zenMode", v)}/>
                </SettingRow>
                <SettingRow icon={<Volume2 className="size-3.5"/>} label="Start ambient sounds with focus sessions"
                            hint="Opt-in coupling: beginning a focus block turns the ambient mix on. Ambient itself is fully independent — see the section below.">
                    <Switch checked={focusDraft.ambientWithFocus}
                            onCheckedChange={(v) => updateFocus("ambientWithFocus", v)}/>
                </SettingRow>
            </section>

            <section className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Volume2 className="size-3"/>
                    Ambient sounds
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 px-2.5 text-[11px] gap-1.5"
                        onClick={() => window.dispatchEvent(new CustomEvent("praxis:ambient-mixer"))}
                        title={`Open the Ambient Mixer — mix any combination of the ${AMBIENT_TRACK_COUNT} sounds with per-track volume sliders and one-click blends (no timer needed; the mixer is a draggable panel that never blocks the editor)`}
                    >
                        <AudioWaveform className="size-3.5 text-emerald-500"/>
                        Open ambient mixer…
                    </Button>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                    {AMBIENT_TRACK_COUNT} locally synthesized tracks (WebAudio — no downloads, works offline),
                    mixed live per track. They play with or without the focus timer: toggle
                    them here, in the mixer panel, or from the Focus menu.
                </p>
                <SettingRow
                    icon={ambient.on ? <Volume2 className="size-3.5"/> : <VolumeX className="size-3.5"/>}
                    label="Ambient sounds"
                    hint="The master switch — independent of any timer. With an empty mix, enabling it starts a gentle rain by default."
                >
                    <Switch
                        checked={ambient.on}
                        onCheckedChange={() => {
                            const ok = toggleAmbient();
                            if (!ok) toast({
                                title: "Ambient sounds unavailable",
                                description: "This browser blocked WebAudio."
                            });
                        }}
                    />
                </SettingRow>
                <SettingRow
                    icon={<Volume2 className="size-3.5"/>}
                    label="Master volume"
                    hint="Overall loudness of the whole mix (0–100). Applies live."
                >
                    <div className="flex items-center gap-2 w-48">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={ambient.master}
                            onChange={(e) => setAmbientMaster(Number(e.target.value))}
                            className="flex-1 h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer"
                            aria-label="Ambient master volume"
                        />
                        <span
                            className="text-[10px] w-8 text-right tabular-nums text-muted-foreground">{ambient.master}%</span>
                    </div>
                </SettingRow>
                <div
                    className="grid md:grid-cols-2 gap-x-6 gap-y-3 rounded-md border divide-y md:divide-y-0 md:divide-x">
                    {ambientGroups.map((group) => (
                        <div key={group.category} className="p-2.5 space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                {group.category}
                                <span className="ml-1.5 font-normal normal-case">
                      {group.tracks.filter((t) => (ambient.vols[t.id] ?? 0) > 0).length}/{group.tracks.length} on
                    </span>
                            </p>
                            {group.tracks.map((t) => {
                                const vol = ambient.vols[t.id] ?? 0;
                                return (
                                    <div key={t.id} className="flex items-center gap-2 py-0.5">
                                        <Switch
                                            checked={vol > 0}
                                            onCheckedChange={(v) => {
                                                const ok = setAmbientTrack(t.id, v ? 45 : 0);
                                                if (!ok) toast({
                                                    title: "Ambient sounds unavailable",
                                                    description: "This browser blocked WebAudio."
                                                });
                                            }}
                                            className="scale-90"
                                            aria-label={`${vol > 0 ? "Mute" : "Play"} ${t.label}`}
                                        />
                                        <span
                                            className={cn("text-xs flex-1 min-w-0 truncate", vol > 0 ? "font-medium" : "text-muted-foreground")}
                                            title={t.hint}
                                        >
                          {t.label}
                        </span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={vol}
                                            onChange={(e) => setAmbientTrack(t.id, Number(e.target.value))}
                                            disabled={vol === 0}
                                            className="w-28 shrink-0 h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                            aria-label={`${t.label} volume`}
                                        />
                                        <span
                                            className="w-7 text-right text-[10px] tabular-nums text-muted-foreground shrink-0">{vol}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </section>

        </>
    );
}
