"use client";

import * as React from "react";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {useToast} from "@/hooks/use-toast";
import {
    AudioWaveform,
    CloudRain,
    Coffee,
    Eraser,
    Factory,
    Flame,
    GripHorizontal,
    Music4,
    Power,
    Rocket,
    Trees,
    Volume2,
    VolumeX,
    Wand2,
    X,
} from "lucide-react";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {
    AMBIENT_DEFAULT_TRACK_VOL,
    AMBIENT_TRACK_COUNT,
    type AmbientCategoryId,
    ambientTracksByCategory,
    clearAmbientTracks,
    setAmbientMaster,
    setAmbientTrack,
    toggleAmbient,
    useAmbientState,
} from "@/lib/ambient";

/* ================================================================== */
/*  Window-event API                                                   */
/* ================================================================== */

/** Dispatching this event opens the mixer panel — the Focus menu, the
 *  floating widget and Settings → Focus all use the helper below, so
 *  no prop drilling is needed anywhere. */
export const AMBIENT_MIXER_EVENT = "praxis:ambient-mixer";

/** Open the ambient mixer panel from anywhere (menu item, button…). */
export function openAmbientMixer(): void {
    window.dispatchEvent(new CustomEvent(AMBIENT_MIXER_EVENT));
}

/* ================================================================== */
/*  Quick mixes — one click replaces the whole blend                   */

/* ================================================================== */

interface AmbientPreset {
    id: string;
    label: string;
    hint: string;
    /** track id → volume; everything else is silenced. */
    vols: Record<string, number>;
}

const PRESETS: AmbientPreset[] = [
    {
        id: "rainy-cafe",
        label: "Rainy café",
        hint: "Steady rain over distant café murmur — the classic writing blend",
        vols: {rain: 55, cafe: 40},
    },
    {
        id: "deep-forest",
        label: "Deep forest",
        hint: "Rustling leaves, birdsong and a soft stream",
        vols: {forest: 50, birds: 30, stream: 35},
    },
    {
        id: "night-storm",
        label: "Night storm",
        hint: "A distant thunderstorm rolling over a night field",
        vols: {thunderstorm: 55, "night-field": 30},
    },
    {
        id: "cozy-fire",
        label: "Cozy fire",
        hint: "A crackling fireplace with wind outside the window",
        vols: {fireplace: 55, wind: 25, "rain-on-roof": 20},
    },
    {
        id: "airplane-focus",
        label: "Airplane focus",
        hint: "Cabin drone + brown noise — the deep-work masking blend",
        vols: {airplane: 50, "brown-noise": 35},
    },
    {
        id: "zen-drone",
        label: "Zen drone",
        hint: "Om drone with a soft singing bowl for meditation",
        vols: {"om-drone": 45, "singing-bowl": 25},
    },
    {
        id: "midnight-train",
        label: "Midnight train",
        hint: "Railway rhythm through a sleeping city",
        vols: {train: 45, "city-night": 35},
    },
    {
        id: "study-room",
        label: "Study room",
        hint: "Quiet office typing and a ticking clock",
        vols: {"office-typing": 40, "clock-ticking": 25},
    },
    /* ── sixteen more one-click blends ── */
    {
        id: "laundromat-sunday",
        label: "Laundromat Sunday",
        hint: "Tumbling washers with warm pink noise — chores without chores",
        vols: {laundromat: 45, "pink-noise": 20},
    },
    {
        id: "monsoon-market",
        label: "Monsoon market",
        hint: "A downpour over a busy street market",
        vols: {"heavy-rain": 50, "night-market": 35},
    },
    {
        id: "snowed-in-cabin",
        label: "Snowed-in cabin",
        hint: "Blizzard outside, bonfire and a candle inside",
        vols: {blizzard: 40, bonfire: 50, "candle-hiss": 20},
    },
    {
        id: "library-hush",
        label: "Library hush",
        hint: "Reading-room quiet with a wall clock",
        vols: {library: 45, "clock-ticking": 20},
    },
    {
        id: "harbor-morning",
        label: "Harbor morning",
        hint: "Docks, gulls and a fresh breeze",
        vols: {"harbor-docks": 45, seagulls: 30, wind: 15},
    },
    {
        id: "deep-space-bridge",
        label: "Deep space bridge",
        hint: "Starship reactor, comms chatter and hull hum",
        vols: {"reactor-core": 45, "comms-beeps": 20, "spaceship-hum": 30},
    },
    {
        id: "iron-workshop",
        label: "Iron workshop",
        hint: "A rhythmic factory press over cooling fans",
        vols: {"factory-floor": 40, "computer-fans": 20},
    },
    {
        id: "ocean-temple",
        label: "Ocean temple",
        hint: "Slow waves, distant temple bells and gulls above",
        vols: {"ocean-waves": 50, "temple-bells": 25, seagulls: 15},
    },
    {
        id: "lofi-desk",
        label: "Lo-fi desk",
        hint: "A dusty beat on vinyl with a desk fan",
        vols: {"lo-fi-beat": 45, "vinyl-crackle": 25, fan: 15},
    },
    {
        id: "night-savanna",
        label: "Night savanna",
        hint: "Insects, crickets and an owl over dry grass",
        vols: {"savanna-dusk": 45, crickets: 25, "owl-hoots": 15},
    },
    {
        id: "metro-commute",
        label: "Metro commute",
        hint: "Platform rumble under dense traffic",
        vols: {"subway-platform": 45, "traffic-hum": 25},
    },
    {
        id: "server-basement",
        label: "Server basement",
        hint: "Racks of fans, mains hum and the odd Geiger tick",
        vols: {"server-room": 45, "electrical-hum": 20, "geiger-counter": 10},
    },
    {
        id: "rainy-rooftop",
        label: "Rainy rooftop",
        hint: "Rain on the roof above a humming city",
        vols: {"rooftop-evening": 40, rain: 40, "city-rain-street": 25},
    },
    {
        id: "cave-of-pools",
        label: "Cave of pools",
        hint: "Echoing drips deep underwater",
        vols: {"dripping-cave": 45, underwater: 20},
    },
    {
        id: "alpine-dawn",
        label: "Alpine dawn",
        hint: "Mountain gusts, birdsong and a rushing stream",
        vols: {"mountain-gust": 40, birds: 30, stream: 25},
    },
    {
        id: "mothership-meditation",
        label: "Mothership meditation",
        hint: "Nebula drone under an Om chant and singing bowl",
        vols: {"nebula-drone": 40, "om-drone": 30, "singing-bowl": 20},
    },
];

const CATEGORY_ICONS: Record<AmbientCategoryId, React.ReactNode> = {
    "Rain & Water": <CloudRain className="size-3.5 text-sky-500"/>,
    "Fire & Air": <Flame className="size-3.5 text-orange-500"/>,
    Nature: <Trees className="size-3.5 text-emerald-500"/>,
    Places: <Coffee className="size-3.5 text-amber-600 dark:text-amber-400"/>,
    "Urban & Machines": <Factory className="size-3.5 text-slate-500 dark:text-slate-400"/>,
    "Noise & Tones": <AudioWaveform className="size-3.5 text-violet-500"/>,
    "Space & Sci-Fi": <Rocket className="size-3.5 text-indigo-500"/>,
    "Rhythmic & Tonal": <Music4 className="size-3.5 text-pink-500"/>,
};

const MIXER_POS_KEY = `${STORAGE_PREFIX}.ambient-mixer-pos`;

function clampNum(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

/**
 * The Ambient Mixer — a FLOATING, DRAGGABLE, NON-MODAL panel.
 *
 * Requirements that shaped this design:
 * • "i need this in a modal — ambient sounds (no timer needed) …
 * selecting multiple of them by going multiple times to the navbar
 * is not a good idea" → one surface holding ALL the tracks
 * (105 after; 36 before).
 * • "when opening the ambient mixer and the deep work is on; i can't
 * move it any more and the focus went to the mixer" → the old
 * RADIX MODAL overlaid the whole screen (the floating focus timer
 * could no longer be dragged) and its focus trap yanked the caret
 * out of the editor. This panel is NON-MODAL: no overlay, no focus
 * trap, nothing behind it is blocked. It moves like the focus
 * timer (drag the header grip), remembers where you dropped it,
 * and closes with its × button or Escape.
 *
 * It drives the SAME shared engine as the Focus menu, the floating
 * widget and Settings → Focus (lib/ambient), so a mix started here
 * keeps playing everywhere — fully independent of any focus timer.
 */
export function AmbientMixerDialog() {
    const {toast} = useToast();
    const [open, setOpen] = React.useState(false);
    const ambient = useAmbientState();
    const groups = React.useMemo(() => ambientTracksByCategory(), []);

    /* ── Any surface can open the panel via the window event ──────── */
    React.useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener(AMBIENT_MIXER_EVENT, onOpen);
        return () => window.removeEventListener(AMBIENT_MIXER_EVENT, onOpen);
    }, []);

    /* ── Escape closes (WITHOUT trapping focus anywhere else) ─────── */
    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    /* ── Dragging (pointer events — mouse + touch + pen) ─────────── */
    const panelRef = React.useRef<HTMLDivElement | null>(null);
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
        try {
            const raw = window.localStorage.getItem(MIXER_POS_KEY);
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
    }, []);

    const persistPos = React.useCallback((x: number, y: number) => {
        try {
            window.localStorage.setItem(MIXER_POS_KEY, JSON.stringify({x, y}));
        } catch { /* storage */
        }
    }, []);
    /* ── Default position: dodge the floating focus timer ──────────
     *  Both panels default to the top-right corner; the timer floats
     *  at a HIGHER z-index, so without this the timer would land ON the
     *  mixer's header grip and swallow its drag (the "deep work is on
     *  and I can't move the mixer" trap). When there is no persisted
     *  position yet and the timer is visible nearby, the mixer opens
     *  BELOW it instead. */
    React.useEffect(() => {
        if (!open || pos) return;
        const timer = document.querySelector('[data-tutorial="focus-widget"]');
        if (!(timer instanceof HTMLElement)) return;
        const r = timer.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // hidden
        const w = window.innerWidth;
        const width = Math.min(560, w - 32);
        // Overlap test against the mixer's CSS default (top-20 right-4).
        const defaultLeft = w - width - 16;
        const overlaps = r.right > defaultLeft + 40 && r.bottom > 64;
        if (!overlaps) return;
        const next = {
            x: defaultLeft,
            y: Math.min(Math.max(8, r.bottom + 12), Math.max(8, window.innerHeight - 240)),
        };
        setPos(next);
        persistPos(next.x, next.y);
    }, [open, pos, persistPos]);

    // Keep the panel inside the viewport when the window shrinks.
    React.useEffect(() => {
        const onResize = () => {
            setPos((prev) => {
                if (!prev) return prev;
                const w = window.innerWidth;
                const h = window.innerHeight;
                const el = panelRef.current;
                const width = el?.offsetWidth ?? 520;
                const height = el?.offsetHeight ?? 400;
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

    const onGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Only the header bar drags — switches, sliders, buttons and the
        // close button stay clickable.
        if ((e.target as HTMLElement).closest("button, input, a, [role=\"switch\"]")) return;
        const el = panelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const base = pos ?? {x: rect.left, y: rect.top};
        dragStateRef.current = {
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
        setPos(base);
        // Capture on the HEADER (the element that owns the move/up
        // handlers below) — capturing on the panel root would retarget
        // every move to the root and the handlers would never fire.
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch { /* capture unsupported — the page-level fallback below */
        }
    };

    const onGripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const el = panelRef.current;
        if (!el) return;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const next = {
            x: clampNum(e.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - width - 8)),
            y: clampNum(e.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - height - 8)),
        };
        setPos(next);
    };

    const onGripPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch { /* already released */
        }
        setPos((prev) => {
            if (prev) persistPos(prev.x, prev.y);
            return prev;
        });
    };

    const warnIfBlocked = (ok: boolean) => {
        if (!ok) {
            toast({
                title: "Ambient sounds unavailable",
                description: "This browser blocked WebAudio.",
            });
        }
    };

    const handleToggle = () => warnIfBlocked(toggleAmbient());

    const handleTrackVol = (id: string, label: string, v: number) => {
        const ok = setAmbientTrack(id, v);
        warnIfBlocked(ok);
        if (!ok) return;
        if (v > 0) return; // no toast noise while sliding
        toast({title: `${label} muted`});
    };

    const applyPreset = (preset: AmbientPreset) => {
        // Replace the whole blend with the preset's mix.
        for (const [id, v] of Object.entries(ambient.vols)) {
            if (v > 0 && !(id in preset.vols)) setAmbientTrack(id, 0);
        }
        for (const [id, v] of Object.entries(preset.vols)) {
            warnIfBlocked(setAmbientTrack(id, v));
        }
        toast({
            title: `Preset: ${preset.label}`,
            description: `${Object.keys(preset.vols).length} sounds blended.`,
        });
    };

    const activeCount = ambient.activeCount;

    if (!open) return null;

    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Ambient mixer"
            data-tutorial="ambient-mixer"
            style={pos ? {left: pos.x, top: pos.y, right: "auto", bottom: "auto"} : undefined}
            className={cn(
                "fixed z-[68] top-20 right-4 select-none rounded-xl border shadow-xl overflow-hidden",
                "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
                "w-[min(560px,calc(100vw-2rem))] max-h-[82vh] flex flex-col"
            )}
        >
            {/* Header — the grip. The whole bar drags (controls excluded). */}
            <div
                className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 border-b cursor-grab active:cursor-grabbing touch-none",
                )}
                onPointerDown={onGripPointerDown}
                onPointerMove={onGripPointerMove}
                onPointerUp={onGripPointerUp}
                onPointerCancel={onGripPointerUp}
                title="Drag to move — the mixer keeps playing wherever you drop it"
            >
                <GripHorizontal className="size-3.5 text-muted-foreground shrink-0"/>
                <AudioWaveform className="size-4 text-emerald-500 shrink-0"/>
                <span className="text-xs font-semibold shrink-0">Ambient mixer</span>
                <span className="text-[10px] font-normal text-muted-foreground truncate hidden sm:inline">
          {AMBIENT_TRACK_COUNT} sounds · no timer needed
        </span>
                {activeCount > 0 && (
                    <span
                        className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            {activeCount} in mix
          </span>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 ml-auto"
                    onClick={() => setOpen(false)}
                    aria-label="Close the ambient mixer"
                    title="Close the mixer (it keeps playing — reopen any time)"
                >
                    <X className="size-3.5"/>
                </Button>
            </div>

            {/* ── Master controls ─────────────────────────────────── */}
            <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                    <Power
                        className={cn(
                            "size-4 shrink-0",
                            ambient.on ? "text-emerald-500" : "text-muted-foreground"
                        )}
                    />
                    <Switch
                        checked={ambient.on}
                        onCheckedChange={handleToggle}
                        aria-label="Ambient sounds master switch"
                        title={ambient.on ? "Stop the whole mix" : "Start the mix with the current selection"}
                    />
                    <span className="text-xs font-medium">
            {ambient.on ? "Playing" : "Paused"}
          </span>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-44">
                    <Volume2 className="size-4 text-muted-foreground shrink-0"/>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={ambient.master}
                        onChange={(e) => setAmbientMaster(Number(e.target.value))}
                        className="flex-1 h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer"
                        aria-label="Ambient master volume"
                        title="Overall loudness of the whole mix"
                    />
                    <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
            {ambient.master}%
          </span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                        clearAmbientTracks();
                        toast({title: "All sounds muted", description: "The selection and volumes were cleared."});
                    }}
                    disabled={activeCount === 0}
                    title="Remove every sound from the mix (the master switch and volume stay)"
                >
                    <Eraser className="size-3.5"/>
                    Mute all
                </Button>
            </div>

            {/* ── One-click presets ───────────────────────────────── */}
            <div className="shrink-0 px-3 pt-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Wand2 className="size-3"/>
                    One-click blends
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                        <Button
                            key={p.id}
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => applyPreset(p)}
                            title={p.hint}
                        >
                            {p.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* ── The full-track mixer body ────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
                {groups.map((group) => {
                    const inGroup = group.tracks.filter((t) => (ambient.vols[t.id] ?? 0) > 0).length;
                    return (
                        <section key={group.category}>
                            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {CATEGORY_ICONS[group.category]}
                                {group.category}
                                <span className="font-normal normal-case">
                  {inGroup}/{group.tracks.length} on
                </span>
                            </p>
                            <div className="grid md:grid-cols-2 gap-x-4">
                                {group.tracks.map((t) => {
                                    const vol = ambient.vols[t.id] ?? 0;
                                    const active = vol > 0;
                                    return (
                                        <div key={t.id} className="flex items-center gap-2 py-1">
                                            <button
                                                type="button"
                                                onClick={() => handleTrackVol(t.id, t.label, active ? 0 : AMBIENT_DEFAULT_TRACK_VOL)}
                                                className={cn(
                                                    "size-6 shrink-0 rounded flex items-center justify-center transition-colors",
                                                    active
                                                        ? "text-emerald-500 hover:bg-emerald-500/10"
                                                        : "text-muted-foreground/60 hover:bg-foreground/5"
                                                )}
                                                aria-pressed={active}
                                                aria-label={`${active ? "Mute" : "Play"} ${t.label}`}
                                                title={t.hint}
                                            >
                                                {active ? <Volume2 className="size-3.5"/> :
                                                    <VolumeX className="size-3.5"/>}
                                            </button>
                                            <span
                                                className={cn(
                                                    "text-xs flex-1 min-w-0 truncate",
                                                    active ? "font-medium text-foreground" : "text-muted-foreground"
                                                )}
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
                                                disabled={!active}
                                                className="w-24 sm:w-28 shrink-0 h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                                aria-label={`${t.label} volume`}
                                                title={active ? `${t.label} volume — ${vol}%` : "Enable the sound to set its volume"}
                                            />
                                            <span
                                                className="w-7 text-right text-[9px] tabular-nums text-muted-foreground shrink-0">
                        {vol}%
                      </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>

            <p className="shrink-0 border-t px-3 py-1.5 text-[10px] leading-snug text-muted-foreground">
                {AMBIENT_TRACK_COUNT} sounds synthesized locally with WebAudio — works offline, and every
                track loops seamlessly (no start/stop seams). The mix runs with or without a focus timer
                and survives reloads. Drag the header to move the mixer; the editor and the focus timer
                stay fully usable while it is open.
            </p>
        </div>
    );
}
