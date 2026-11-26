/**
 * ai-shared.ts — the CLIENT-SAFE pure half of lib/ai.ts.
 *
 * Sampling bounds + sanitizer, the test-generation source cap, and the
 * completion prompt assembly (per-language prompts, Fill-In-Middle
 * prefix/suffix framing) are pure string/number logic — safe for the
 * browser bundle. lib/ai.ts keeps the Node-only SDK plumbing and
 * re-exports everything from here for its API routes.
 *
 * One import was added with readPersistedSampling: STORAGE_PREFIX
 * from @/lib/config (itself client-safe — package.json is inlined at
 * build time and env guards process.env), still fine on both sides
 * of the client/server boundary.
 */

import {STORAGE_PREFIX} from "@/lib/config";

/** One message in a chat-completion request (the shape both provider
 *  paths and buildCompletionMessages emit). */
export interface ProviderMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

// ─── Sampling controls (temperature / max_tokens / top_p) ─────────
// The chat sidebar's "tuning" popover sends these alongside the
// provider selection. They ride INSIDE the provider payload because
// the AI routes already forward `body.provider` to sanitizeProvider —
// no route changes were needed to thread them server-side.

/** Bounds + steps shared by the sidebar UI, the sanitizer and the
 *  tests — one source of truth so the popover's sliders can never
 *  produce a value the server would clamp differently. */
export const SAMPLING_BOUNDS = {
    /** Softness of the distribution. 0 = greedy, 2 = wild. */
    temperature: {min: 0, max: 2, step: 0.1},
    /** Nucleus sampling cut. 1 = no cut (provider default). */
    topP: {min: 0, max: 1, step: 0.05},
    /** Hard ceiling on generated tokens. */
    maxTokens: {min: 64, max: 8192, step: 64},
} as const;

/** Validated sampling knobs as sent to the model API. */
export interface SamplingParams {
    temperature: number;
    topP: number;
    maxTokens: number;
}

/** Clamp one number into [min, max]; NaN/undefined → null. */
function num(v: unknown, min: number, max: number): number | null {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
}

/** Validate + clamp an untrusted client `sampling` payload.
 *  Returns null when absent or wholly invalid (= send nothing, keep
 *  the provider's defaults); otherwise every field is clamped into
 *  SAMPLING_BOUNDS so a malicious/buggy client can't ask for
 *  temperature 99 or 1 token. */
export function sanitizeSampling(raw: unknown): SamplingParams | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const temperature = num(r.temperature, SAMPLING_BOUNDS.temperature.min, SAMPLING_BOUNDS.temperature.max);
    const topP = num(r.topP, SAMPLING_BOUNDS.topP.min, SAMPLING_BOUNDS.topP.max);
    const maxTokens = num(
        r.maxTokens,
        SAMPLING_BOUNDS.maxTokens.min,
        SAMPLING_BOUNDS.maxTokens.max
    );
    if (temperature == null || topP == null || maxTokens == null) return null;
    return {
        temperature: Math.round(temperature * 100) / 100,
        topP: Math.round(topP * 100) / 100,
        maxTokens: Math.round(maxTokens),
    };
}

/** Serialize sampling knobs into the OpenAI-style request-body keys
 * (`temperature`, `max_tokens`, `top_p`). Returns {} when null so the
 * spread below stays a no-op — the request body is byte-identical to
 * the pre-sampling one when the user never touched the popover. */
export function samplingBodyKeys(s: SamplingParams | null | undefined): Record<string, number> {
    if (!s) return {};
    return {temperature: s.temperature, max_tokens: s.maxTokens, top_p: s.topP};
}

// ─── Persisted sampling (localStorage) ──────────────────────────────
// The chat sidebar's Tuning popover (ai-sampling-controls) writes the
// knobs to this key; readPersistedSampling() lets OTHER client call
// sites (code-viewer's completion fetch) ride the same persisted
// values without duplicating the read+validate logic.

/** localStorage key the tuning popover persists the sampling knobs
 * under — `${STORAGE_PREFIX}-ai-sampling` (the same constant the
 * sidebar builds inline). Exported so consumers/tests share one
 * truth. */
export const AI_SAMPLING_STORAGE_KEY = `${STORAGE_PREFIX}-ai-sampling`;

/** Read the sampling knobs the chat sidebar's Tuning popover persisted
 * (`${STORAGE_PREFIX}-ai-sampling`, JSON SamplingParams). Returns the
 * SANITIZED params (clamped into SAMPLING_BOUNDS by sanitizeSampling),
 * or null when the key is absent, corrupt, or invalid — null means
 * "provider defaults, send nothing upstream".
 *
 * Isomorphic-safe: on the server / during SSR (`typeof window ===
 * "undefined"`) it returns null instead of touching localStorage, so
 * shared server code importing this module stays side-effect free.
 * localStorage access is also wrapped (privacy modes can throw on
 * access) — any failure degrades to "defaults". */
export function readPersistedSampling(): SamplingParams | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage?.getItem(AI_SAMPLING_STORAGE_KEY);
        if (!raw) return null;
        return sanitizeSampling(JSON.parse(raw));
    } catch {
        // Corrupt JSON, storage disabled/quota errors — defaults.
        return null;
    }
}

/** Max chars of source code embedded in a test-generation prompt.
 *  ~8000 chars ≈ 2000 tokens — small enough for 7B local models,
 *  large enough for realistic modules. */
export const TEST_GENERATION_SOURCE_CAP = 8000;

/** Marker appended when the source was cut, phrased so models treat it
 *  as "the file continues" rather than "the file ended here". */
export const TEST_GENERATION_TRUNCATION_MARKER = "... (truncated)";

/** Cap a source file for the test-generation prompt: the FIRST `cap`
 *  chars (imports + top-of-file API — the part pytest tests import)
 *  plus the truncation marker. Short files pass through unchanged. */
export function capSourceForPrompt(
    source: string,
    cap: number = TEST_GENERATION_SOURCE_CAP
): string {
    if (typeof source !== "string" || source.length <= cap) return source;
    return (
        source.slice(0, cap) +
        `\n${TEST_GENERATION_TRUNCATION_MARKER} — original file was ${source.length.toLocaleString()} chars`
    );
}

// ─── Completion prompts: per-language + suffix (FIM-style) context ──
// /api/ai-completion used to hardcode "You are a Python code-completion
// engine…" — wrong for the.js /.R /.sh files the editors also edit.
// These helpers build the message array from (a) the file's language
// and (b) the text AFTER the caret, so the model can see both sides.
// Both request shapes here are chat-completions; no endpoint wired
// through this layer takes a raw FIM body (prefix/suffix slots), so
// the suffix always rides the PROMPT with explicit framing instead —
// a raw FIM structure would need a /completions-style route (llama.cpp
// /v1/completions) which this layer does not target yet.

/** The languages the completion prompt knows how to describe. */
export type CompletionLanguage =
    | "python"
    | "javascript"
    | "typescript"
    | "r"
    | "shell"
    | "julia"
    | "matlab";

/** Language → completion-engine instruction. Small on purpose: these
 *  describe SYNTAX IDIOMS the model should follow (comment char,
 *  block style), not the file's whole grammar. */
export const COMPLETION_LANGUAGE_PROMPTS: Record<CompletionLanguage, string> = {
    python:
        "You are completing Python 3 code. Follow PEP 8 indentation (4 spaces), snake_case names, and Python 3 idioms.",
    javascript:
        "You are completing modern JavaScript (ES2020+) code. Follow the file's existing indentation and style (const/let, arrow functions, template literals).",
    typescript:
        "You are completing TypeScript code. Follow the file's existing indentation and style; prefer explicit types only when inference is unclear.",
    r:
        "You are completing R code. Follow the tidyverse style where applicable (snake_case, <- assignment, 2-space indentation).",
    shell:
        "You are completing POSIX/bash shell code. Use the file's existing quoting style, 2-space indentation, and portable constructs.",
    julia:
        "You are completing Julia code. Follow Julia idioms (1-based indexing, multiple dispatch, 4-space indentation).",
    matlab:
        "You are completing MATLAB code. Follow MATLAB idioms (1-based indexing, end-terminated blocks, camelCase functions).",
};

/** Guess the completion language from a file name (extension match,
 *  case-insensitive). Unknown extensions → "python" — the app's
 *  primary language and the historical default of the route. */
export function completionLanguageFromFileName(
    fileName: string | undefined | null
): CompletionLanguage {
    const ext = (fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    switch (ext) {
        case "js":
        case "mjs":
        case "cjs":
            return "javascript";
        case "ts":
        case "tsx":
            return "typescript";
        case "r":
        case "rmd":
            return "r";
        case "sh":
        case "bash":
        case "zsh":
            return "shell";
        case "jl":
            return "julia";
        case "m":
            return "matlab";
        default:
            return "python";
    }
}

/** The system message for a completion request in the given language
 *  (defaults to python when unknown — the trigger sites in the editors
 *  currently only send code, not the file name). */
export function completionSystemPrompt(language: string): string {
    const lang = (language ?? "").toLowerCase() as CompletionLanguage;
    const instruction =
        COMPLETION_LANGUAGE_PROMPTS[lang] ?? COMPLETION_LANGUAGE_PROMPTS.python;
    // Same response contract the route's original prompt established —
    // only the "Python" framing became language-aware.
    return (
        instruction +
        " The user will send you the source code before the cursor" +
        " (and, when available, the code after it); respond with ONLY the" +
        " next 1-3 lines that should follow at the cursor position. Do not" +
        " repeat existing code. Do not wrap in markdown fences. Do not" +
        " explain. Emit nothing if the context is unclear."
    );
}

/** Short display name per language for the user-message lead line
 * ("Complete this Python 3 code. …"). */
export const COMPLETION_LANGUAGE_LABELS: Record<CompletionLanguage, string> = {
    python: "Python 3",
    javascript: "JavaScript",
    typescript: "TypeScript",
    r: "R",
    shell: "shell",
    julia: "Julia",
    matlab: "MATLAB",
};

/** Build the user message body for a completion request.
 *
 * - `prefix` — the code before the cursor (tail-capped by the route).
 * - `suffix` — the code AFTER the caret; when non-empty it is fenced
 * under an explicit "CODE AFTER CURSOR" heading so chat-completion
 * models understand the insertion point sits between the two blocks
 * (the poor-man's FIM framing). Empty suffix → the exact legacy
 * single-block shape — behavior unchanged.
 * - `language` — per-prompt instruction (default "python"). */
export function buildCompletionUserMessage(
    prefix: string,
    suffix: string = "",
    language: string = "python"
): string {
    const lang = (language ?? "").toLowerCase() as CompletionLanguage;
    const label = COMPLETION_LANGUAGE_LABELS[lang] ?? COMPLETION_LANGUAGE_LABELS.python;
    const lead =
        `Complete this ${label} code. ` +
        "Return ONLY the next 1-3 lines that should follow the cursor. " +
        "Do not repeat existing code. Do not wrap in markdown fences. Do not explain.";
    if (!suffix || !suffix.trim()) {
        // Legacy shape — identical to the pre-FIM route prompt.
        return `${lead}\n\n${prefix}`;
    }
    // Suffix present: show both sides with explicit framing. The suffix
    // is capped (tail of it — what the caret is nearest to matters most)
    // so a huge after-block can't swamp the request either.
    const MAX_SUFFIX_CHARS = 2000;
    const suffixTail =
        suffix.length > MAX_SUFFIX_CHARS ? suffix.slice(-MAX_SUFFIX_CHARS) : suffix;
    return (
        `${lead}\n\nCODE BEFORE CURSOR:\n${prefix}\n\n` +
        `CODE AFTER CURSOR (do not repeat it — your completion joins the two blocks):\n${suffixTail}`
    );
}

/** Convenience: the full message pair for a completion request. */
export function buildCompletionMessages(opts: {
    prefix: string;
    suffix?: string;
    language?: string;
}): ProviderMessage[] {
    return [
        {role: "system", content: completionSystemPrompt(opts.language ?? "python")},
        {
            role: "user",
            content: buildCompletionUserMessage(
                opts.prefix,
                opts.suffix ?? "",
                opts.language ?? "python"
            ),
        },
    ];
}
