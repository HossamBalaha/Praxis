"use client";

import * as React from "react";
import {RotateCcw, SlidersHorizontal} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Button} from "@/components/ui/button";
import {useChromeLanguage} from "@/lib/i18n-react";
import {SAMPLING_BOUNDS, type SamplingParams} from "@/lib/ai-shared";

/**
 * Sampling-controls popover for the AI chat sidebar — the "tuning"
 * trigger next to the message input. Exposes temperature / top_p /
 * max_tokens within the bounds the server sanitizer enforces
 * (SAMPLING_BOUNDS is shared, so the sliders can never produce a value
 * the server would clamp differently).
 *
 * `value === null` means "provider defaults" — nothing is sent with
 * the request, keeping pre-feature behavior byte-identical. Touching
 * any slider makes the knobs explicit; the Reset button returns to
 * null. The sliders always SHOW the effective values (defaults when
 * null) so the popover reads sanely in both states.
 */

/** What the sliders display when sampling is unset — these mirror the
 *  common provider defaults (OpenAI-style temperature 0.7, top_p 1,
 *  and a mid-range token ceiling) and are only DISPLAY/seed values:
 *  nothing is sent while `value` stays null. */
export const SAMPLING_UI_DEFAULTS: SamplingParams = {
    temperature: 0.7,
    topP: 1,
    maxTokens: 2048,
};

interface AiSamplingControlsProps {
    /** Current knobs, or null = provider defaults (nothing sent). */
    value: SamplingParams | null;
    /** Called with the new knobs, or null when reset to defaults. */
    onChange: (v: SamplingParams | null) => void;
    /** Compact mode — hides the "Sampling" text label (icon-only). */
    label?: boolean;
}

export function AiSamplingControls({
                                       value,
                                       onChange,
                                       label = true,
                                   }: AiSamplingControlsProps) {
    const {t} = useChromeLanguage();
    // Display state: the explicit knobs, or the seed defaults when null.
    const shown = value ?? SAMPLING_UI_DEFAULTS;
    const usingDefaults = value == null;

    /** Commit one knob — the other two keep their shown values. */
    const set = (patch: Partial<SamplingParams>) => {
        onChange({...shown, ...patch});
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground ai-chat-icon-btn"
                    aria-label={t("aiChatTuning")}
                    title={
                        usingDefaults
                            ? `${t("aiChatTuning")} — ${t("aiChatTuningDefaults")}`
                            : `${t("aiChatTuning")} — temperature ${shown.temperature} · top_p ${shown.topP} · max_tokens ${shown.maxTokens}`
                    }
                >
                    <SlidersHorizontal className="size-3.5"/>
                    {label && <span className="hidden sm:inline">{t("aiChatTuningLabel")}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-72 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{t("aiChatTuning")}</p>
                    <span
                        className={
                            "text-[10px] px-1.5 py-px rounded " +
                            (usingDefaults
                                ? "bg-muted text-muted-foreground"
                                : "bg-purple-500/15 text-purple-700 dark:text-purple-300")
                        }
                    >
            {usingDefaults ? t("aiChatTuningDefaults") : "custom"}
          </span>
                </div>

                {/* Temperature — 0 (deterministic) … 2 (creative). */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="ai-sampling-temperature">{t("aiChatTuningTemp")}</label>
                        <span className="tabular-nums text-muted-foreground">
              {shown.temperature.toFixed(1)}
            </span>
                    </div>
                    <input
                        id="ai-sampling-temperature"
                        type="range"
                        className="w-full accent-purple-500"
                        min={SAMPLING_BOUNDS.temperature.min}
                        max={SAMPLING_BOUNDS.temperature.max}
                        step={SAMPLING_BOUNDS.temperature.step}
                        value={shown.temperature}
                        onChange={(e) => set({temperature: Number(e.target.value)})}
                    />
                </div>

                {/* Top P — nucleus sampling cut, 0 … 1. */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="ai-sampling-topp">{t("aiChatTuningTopP")}</label>
                        <span className="tabular-nums text-muted-foreground">
              {shown.topP.toFixed(2)}
            </span>
                    </div>
                    <input
                        id="ai-sampling-topp"
                        type="range"
                        className="w-full accent-purple-500"
                        min={SAMPLING_BOUNDS.topP.min}
                        max={SAMPLING_BOUNDS.topP.max}
                        step={SAMPLING_BOUNDS.topP.step}
                        value={shown.topP}
                        onChange={(e) => set({topP: Number(e.target.value)})}
                    />
                </div>

                {/* Max tokens — numeric field (64 … 8192); a slider is too
            coarse across two orders of magnitude. */}
                <div className="space-y-1">
                    <label
                        htmlFor="ai-sampling-maxtokens"
                        className="flex items-center justify-between text-[11px]"
                    >
                        {t("aiChatTuningMaxTokens")}
                        <span className="tabular-nums text-muted-foreground">
              {shown.maxTokens}
            </span>
                    </label>
                    <input
                        id="ai-sampling-maxtokens"
                        type="range"
                        className="w-full accent-purple-500"
                        min={SAMPLING_BOUNDS.maxTokens.min}
                        max={SAMPLING_BOUNDS.maxTokens.max}
                        step={SAMPLING_BOUNDS.maxTokens.step}
                        value={shown.maxTokens}
                        onChange={(e) => set({maxTokens: Number(e.target.value)})}
                    />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-muted-foreground leading-tight">
                        {t("aiChatTuningHint")}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px] shrink-0"
                        onClick={() => onChange(null)}
                        disabled={usingDefaults}
                        title={t("aiChatTuningReset")}
                    >
                        <RotateCcw className="size-3"/>
                        {t("aiChatTuningReset")}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
