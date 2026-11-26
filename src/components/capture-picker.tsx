"use client";

/**
 * capture-picker.tsx — the per-run CAPTURE options.
 *
 * USABILITY REWORK: the popover is now WIDE (440px), the three presets are
 * the FIRST thing and read as big, one-click radio cards (icon +
 * label + one-line hint, selected state ticks), and picking a preset
 * CLOSES the panel immediately — the most common intent (choose a
 * level, run) is one click. The three direct switches stay below for
 * fine control, each with its own "follow settings again" undo, and
 * the footer keeps the two whole-panel actions.
 *
 * Semantics (unchanged from the accepted model): an undefined flag
 * FOLLOWS Settings → Capture; a set value applies ONLY to the next
 * run and clears when the request fires (the parent clears the map
 * in handleRun).
 *
 * NAMING: this is the RUN capture (Python run output — vars /
 * DataFrames / coverage). The camera family says "Screenshot"
 * instead, so the two never read alike (Section 4 wording rule:
 * run-output capture = "Run Capture"; the camera cluster =
 * "Screenshot").
 */

import * as React from "react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {Camera, Check, ChevronDown, Crosshair, Database, Eye, RotateCcw, Save, Zap,} from "lucide-react";

/** The three capture flags, in display order. */
export interface CaptureFlags {
    inspectVariables: boolean;
    captureDataframes: boolean;
    traceCoverage: boolean;
}

/** Next-run-only overrides — an undefined key follows the default. */
export type CaptureOverrideMap = Partial<CaptureFlags>;

interface CapturePickerProps {
    /** The three Settings → Capture defaults (what a plain Run uses). */
    defaults: CaptureFlags;
    /** The next-run-only overrides (undefined key = follow the default). */
    overrides: CaptureOverrideMap;
    /** Set ONE flag's next-run state (undefined = follow the default). */
    setFlag: (key: keyof CaptureFlags, value: boolean | undefined) => void;
    /** Drop every override — follow Settings → Capture again. */
    reset: () => void;
    /** Persist the three effective values as the new default. */
    makeDefault: (flags: CaptureFlags) => void;
}

/** The three capture rows — icon, name and what turning it on does. */
const CAPTURE_ROWS: ReadonlyArray<{
    key: keyof CaptureFlags;
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    effect: string;
}> = [
    {
        key: "inspectVariables",
        icon: Eye,
        name: "Variables",
        effect: "final values land in the Output panel's Vars tab",
    },
    {
        key: "captureDataframes",
        icon: Database,
        name: "DataFrames",
        effect: "pandas tables land in the DataFrames tab, rendered as HTML",
    },
    {
        key: "traceCoverage",
        icon: Crosshair,
        name: "Coverage",
        effect: "line-by-line report in the Coverage tab (slows the run)",
    },
];

/** Presets — one click sets all three flags for the next run and closes. */
const CAPTURE_PRESETS: ReadonlyArray<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    flags: CaptureFlags;
    hint: string;
}> = [
    {
        label: "Nothing extra",
        icon: Zap,
        flags: {inspectVariables: false, captureDataframes: false, traceCoverage: false},
        hint: "Fastest — stdout / stderr / figures only",
    },
    {
        label: "Standard",
        icon: Eye,
        flags: {inspectVariables: true, captureDataframes: true, traceCoverage: false},
        hint: "Vars + DataFrames, no coverage tracing",
    },
    {
        label: "Everything",
        icon: Camera,
        flags: {inspectVariables: true, captureDataframes: true, traceCoverage: true},
        hint: "Vars + DataFrames + Coverage (slower)",
    },
];

/** True when the effective flags equal this preset exactly. */
function flagsEqual(a: CaptureFlags, b: CaptureFlags): boolean {
    return (
        a.inspectVariables === b.inspectVariables &&
        a.captureDataframes === b.captureDataframes &&
        a.traceCoverage === b.traceCoverage
    );
}

export function CapturePicker({
                                  defaults,
                                  overrides,
                                  setFlag,
                                  reset,
                                  makeDefault,
                              }: CapturePickerProps) {
    // CONTROLLED popover — preset clicks close it (the "choose a level,
    // get out of the way" flow).
    const [open, setOpen] = React.useState(false);

    /** The effective NEXT-run flags — override first, default second. */
    const effective: CaptureFlags = {
        inspectVariables: overrides.inspectVariables ?? defaults.inspectVariables,
        captureDataframes: overrides.captureDataframes ?? defaults.captureDataframes,
        traceCoverage: overrides.traceCoverage ?? defaults.traceCoverage,
    };
    const anyOverride =
        overrides.inspectVariables !== undefined ||
        overrides.captureDataframes !== undefined ||
        overrides.traceCoverage !== undefined;

    /** The trigger's plain-words summary, e.g. "Vars · Frames · Coverage". */
    const summary = CAPTURE_ROWS.filter((r) => effective[r.key])
        .map((r) => (r.key === "inspectVariables" ? "Vars" : r.key === "captureDataframes" ? "Frames" : "Coverage"))
        .join(" · ");
    const summaryLabel = summary || "Nothing extra";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-7 gap-1.5 px-2 text-[11px] font-medium",
                        anyOverride && "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    )}
                    aria-label={`Run capture picker — the next run captures: ${summaryLabel}`}
                    title={
                        (anyOverride
                            ? "Custom run-capture set for the NEXT run only — reverts to Settings → Capture afterwards."
                            : "Follows Settings → Capture — click to change what the next run captures.") +
                        ` Next run: ${summaryLabel}.`
                    }
                >
                    <Crosshair className="size-3.5 shrink-0"/>
                    <span className="text-muted-foreground font-normal">Run Capture:</span>
                    <span className="max-w-40 truncate">{summaryLabel}</span>
                    <ChevronDown
                        className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}/>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-[440px] p-0">
                <div className="px-4 pt-3.5 pb-3">
                    <p className="text-sm font-semibold">What should the next run capture?</p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                        These switches apply to the <strong>next run only</strong> — afterwards the run follows
                        Settings → Capture again.
                    </p>
                </div>

                {/* presets — one click, all three flags, panel closes */}
                <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                    {CAPTURE_PRESETS.map((preset) => {
                        const active = flagsEqual(effective, preset.flags);
                        return (
                            <button
                                key={preset.label}
                                type="button"
                                onClick={() => {
                                    setFlag("inspectVariables", preset.flags.inspectVariables);
                                    setFlag("captureDataframes", preset.flags.captureDataframes);
                                    setFlag("traceCoverage", preset.flags.traceCoverage);
                                    // One click = decision made — close the panel (the
                                    // button's summary already shows the new level).
                                    setOpen(false);
                                }}
                                className={cn(
                                    "relative flex h-[74px] flex-col items-start justify-center gap-1 rounded-lg border px-3 text-left transition-colors",
                                    active
                                        ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : "border-border bg-muted/30 text-foreground hover:bg-muted"
                                )}
                                title={`${preset.hint} — sets all three switches for the next run`}
                                aria-pressed={active}
                            >
                                {active && (
                                    <span
                                        className="absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="size-3" strokeWidth={3}/>
                  </span>
                                )}
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <preset.icon className={cn("size-3.5", active ? "text-emerald-500" : "text-muted-foreground")}/>
                                    {preset.label}
                </span>
                                <span className="text-[10px] leading-snug text-muted-foreground">{preset.hint}</span>
                            </button>
                        );
                    })}
                </div>

                {/* the three direct switches */}
                <div className="divide-y border-t">
                    {CAPTURE_ROWS.map((row) => {
                        const overridden = overrides[row.key] !== undefined;
                        const on = effective[row.key];
                        return (
                            <div key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                                <row.icon
                                    className={cn("size-4 shrink-0", on ? "text-emerald-500" : "text-muted-foreground")}/>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium leading-none">
                                        {row.name}
                                        {overridden && (
                                            <span
                                                className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                        next run
                      </span>
                                        )}
                                    </p>
                                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                        On: {row.effect}.
                                    </p>
                                </div>
                                {overridden && (
                                    <button
                                        type="button"
                                        onClick={() => setFlag(row.key, undefined)}
                                        className="size-5 inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="Follow Settings → Capture again for this one"
                                        aria-label={`Follow the settings default for ${row.name}`}
                                    >
                                        <RotateCcw className="size-3"/>
                                    </button>
                                )}
                                <Switch checked={on} onCheckedChange={(v) => setFlag(row.key, v)}
                                        aria-label={`${row.name} on the next run`}/>
                            </div>
                        );
                    })}
                </div>

                {/* footer — the two whole-panel actions */}
                <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-[11px] leading-snug text-muted-foreground">
            {anyOverride ? "Custom set — applies to the next run only." : "Following Settings → Capture."}
          </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {anyOverride && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 px-1.5 text-[10px]"
                                onClick={reset}
                                title="Drop every override — the next run follows Settings → Capture again"
                            >
                                <RotateCcw className="size-3"/>
                                Follow settings
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-1.5 text-[10px]"
                            onClick={() => makeDefault(effective)}
                            title="Save these three values as the Settings → Capture defaults"
                        >
                            <Save className="size-3"/>
                            Make default
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
