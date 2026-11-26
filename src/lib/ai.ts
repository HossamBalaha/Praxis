/**
 * Shared helpers for the AI server-side routes
 * (`/api/ai-chat`, `/api/ai-completion`, `/api/ai-generate-tests`,
 * `/api/ai-test`).
 *
 * The bundled z-ai-web-dev-sdk path was REMOVED — it only worked
 * where Praxis runs inside Z.AI's own infrastructure (its credentials
 * file `.z-ai-config`) and failed everywhere else with a configuration
 * error.
 * EVERY AI call now routes through an explicit OpenAI-compatible
 * provider configured in Settings → AI:
 *  - local inference servers (Ollama, LM Studio, vLLM, llama.cpp),
 *  - hosted APIs (Z.AI's HTTP API, OpenRouter, OpenAI, Groq, …).
 *
 * A request that carries no (or an unusable) provider is rejected with
 * a pointed, actionable message instead of silently attempting the
 * removed built-in.
 *
 * Both paths return the same shapes the routes already consume:
 *  - `stream: true`  → a web ReadableStream<Uint8Array> of OpenAI-
 *    style SSE deltas.
 *  - `stream: false` → a parsed completion object with
 *    `choices[0].message.content` / `model`.
 */

/** The error every AI route returns when no provider is configured —
 * one shared string so the client surfaces a consistent fix-it hint. */
export const NO_AI_PROVIDER_MESSAGE =
    "No AI provider is configured — open Settings → AI, add an OpenAI-compatible provider (Ollama, LM Studio, vLLM, llama.cpp, Z.AI's HTTP API, OpenRouter, OpenAI…), and select it as the active provider.";

/**
 * Error categories the AI routes can return to the client. The client
 * uses `retryable` to decide whether to show a "Retry" button.
 *
 *  - `auth`:         the SDK credentials are missing / invalid.
 *  - `rate_limit`:   the upstream returned 429.
 *  - `network`:      fetch failed (DNS, connection refused, etc.).
 *  - `timeout`:      the call exceeded its deadline.
 *  - `server`:       anything else (5xx, parse errors, SDK bugs).
 *  - `bad_request`:  the client sent a malformed body (4xx).
 */
export type AiErrorType =
    | "auth"
    | "rate_limit"
    | "network"
    | "timeout"
    | "server"
    | "bad_request";

export interface ClassifiedError {
    type: AiErrorType;
    message: string;
    /** True if the same request might succeed if retried. */
    retryable: boolean;
}

// ─── Dynamic chat providers (OpenAI-compatible endpoints) ──────────

/** A sanitized provider as accepted by createChatCompletion. Only the
 * fields the server needs — the client's richer AiChatProvider shape
 * (with id/name/enabled) is reduced to this by sanitizeProvider. */
export interface SanitizedProvider {
    kind: "openai";
    baseUrl: string;
    apiKey: string;
    model: string;
    /** Optional sampling controls (temperature / max_tokens / top_p)
     *  forwarded by the client's provider payload. Absent = provider
     *  defaults (nothing sent upstream — behavior unchanged). */
    sampling?: SamplingParams;
}

/** Clamp a client-supplied string field to a sane length. */
function str(v: unknown, max: number): string {
    return typeof v === "string" ? v.slice(0, max) : "";
}

/** Validate + reduce an untrusted client `provider` payload.
 * Returns null for anything unusable (missing / wrong shape / non-HTTP
 * URL), which the routes treat as "no provider configured" — the
 * call then fails with the actionable setup message instead of
 * attempting a built-in SDK. Legacy `kind: "zai"` payloads (from
 * settings persisted before the SDK's removal) also collapse to
 * null: there IS no built-in provider anymore. */
export function sanitizeProvider(raw: unknown): SanitizedProvider | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const model = str(r.model, 200);
    // Sampling knobs ride the provider payload from the chat sidebar's
    // tuning popover; sanitized+clamped here.
    const sampling = sanitizeSampling(r.sampling);
    // "zai" is gone — the removed built-in SDK kind maps to null so
    // the caller surfaces the "add a provider" guidance.
    if (r.kind === "zai") return null;
    if (r.kind !== "openai") return null;
    const baseUrl = str(r.baseUrl, 500).trim();
    if (!baseUrl) return null;
    let u: URL;
    try {
        u = new URL(baseUrl);
    } catch {
        return null;
    }
    // http(s) only — file:, data:, etc. are rejected.
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return {kind: "openai", baseUrl, apiKey: str(r.apiKey, 500), model, ...(sampling ? {sampling} : {})};
}

/** Build the /chat/completions URL from a user-supplied base, forgiving
 * the common pastes:
 * http://localhost:11434 → …/v1/chat/completions (Ollama)
 * http://localhost:11434/v1 → …/chat/completions
 * http://localhost:1234/v1 → …/chat/completions (LM Studio)
 * http://localhost:8000 → …/v1/chat/completions (vLLM)
 * http://localhost:8080 → …/v1/chat/completions (llama.cpp)
 * https://api.z.ai/api/paas/v4 → …/chat/completions
 * https://openrouter.ai/api/v1 → …/chat/completions
 * …/v1/chat/completions → as-is (full endpoint pasted)
 */
export function chatCompletionsUrl(baseUrl: string): string {
    const base = baseUrl.trim().replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(base)) return base;
    if (/\/v\d+[^/]*$/i.test(base) || /\/api\/paas\/v\d+$/i.test(base)) {
        return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
}

/** Create a chat completion through the given provider.
 *
 * The built-in z-ai SDK path is GONE — provider null (or a legacy
 * `kind: "zai"`) fails fast with the shared, actionable setup message
 * (NO_AI_PROVIDER_MESSAGE) instead of attempting an SDK call that can
 * never work outside Z.AI's infrastructure.
 *
 * - provider kind "openai" → fetch POST to the endpoint's
 *   /chat/completions with an optional Bearer key.
 *
 * With `stream: true` the return value is a ReadableStream of SSE
 * bytes; otherwise it is the parsed completion object. HTTP errors
 * from the endpoint are thrown as Errors with `.status` attached so
 * classifyAiError maps them precisely. */
export async function createChatCompletion(
    provider: SanitizedProvider | null,
    opts: {
        messages: ProviderMessage[];
        stream?: boolean;
        /** Legacy GLM "thinking" toggle — accepted for compatibility with
         *  older clients, no longer forwarded anywhere (the SDK it
         *  targeted was removed). */
        thinkingDisabled?: boolean;
        /** Sampling overrides (temperature / max_tokens / top_p). Merged
         *  over `provider.sampling` (explicit opts win); null/undefined in
         *  both = nothing sent, i.e. the endpoint's own defaults. */
        sampling?: SamplingParams | null;
    }
): Promise<unknown> {
    // Explicit opts.sampling wins over the provider-carried knobs (the
    // popover path); when neither is set the spread below contributes
    // nothing, so the upstream request body is unchanged.
    const sampling: SamplingParams | null =
        opts.sampling ?? provider?.sampling ?? null;

    if (!provider || (provider as { kind?: string }).kind === "zai") {
        // No provider configured (or a persisted zai one) — fail fast
        // with the actionable setup message.
        const err = new Error(NO_AI_PROVIDER_MESSAGE) as Error & { status?: number };
        err.status = 400;
        throw err;
    }
    void opts.thinkingDisabled;

    if (!provider.model) {
        const err = new Error(
            "No model id configured for this provider — set one in Settings → AI."
        ) as Error & { status?: number };
        err.status = 400;
        throw err;
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    // API key resolution order:
    //   1. the key sent inline by the client (localStorage-stored), or
    //   2. the server-side keyring (~/.praxis/ai-keys.json) when the
    // user chose "store key on the server" in Settings → AI —
    //      the client sends an EMPTY apiKey in that case and the key
    //      never travels back to the browser. See lib/server-keyring.ts.
    let apiKey = provider.apiKey;
    if (!apiKey && provider.baseUrl) {
        try {
            const {resolveKey} = await import("@/lib/server-keyring");
            apiKey = resolveKey(provider.baseUrl);
        } catch {
            /* keyring unavailable — proceed without a key */
        }
    }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const url = chatCompletionsUrl(provider.baseUrl);
    let res: Response;
    try {
        res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: provider.model,
                messages: opts.messages,
                ...(opts.stream ? {stream: true} : {}),
                // Sampling knobs — standard chat-completions params, so every
                // OpenAI-compatible server (Ollama / vLLM / llama.cpp / hosted)
                // accepts them; absent entirely when the user left defaults.
                ...samplingBodyKeys(sampling),
            }),
        });
    } catch (err) {
        // fetch throws TypeError on network failure — rethrow as a plain
        // Error so classifyAiError's TypeError heuristic still matches and
        // the message names the endpoint for debugging.
        throw new Error(
            `Could not reach ${url} — ${(err as Error).message}`
        );
    }

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(
            `Provider responded ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
    }

    if (opts.stream) {
        if (!res.body) throw new Error("Provider returned no stream.");
        return res.body;
    }
    return res.json();
}

/** Classify an error from an AI call into a structured
 *  `ClassifiedError`. Inspects status codes when present (upstream
 *  HTTP errors attach them as `error.status` / `error.statusCode`)
 *  and falls back to message-text heuristics. */
export function classifyAiError(err: unknown): ClassifiedError {
    const msg =
        err instanceof Error
            ? err.message
            : typeof err === "string"
                ? err
                : "Unknown error during AI call.";
    const e = err as { status?: number; statusCode?: number; response?: { status?: number }; name?: string };
    const status: number | undefined =
        typeof e?.status === "number"
            ? e.status
            : typeof e?.statusCode === "number"
                ? e.statusCode
                : typeof e?.response?.status === "number"
                    ? e.response.status
                    : undefined;

    // The "no provider configured" guard fails as auth/config —
    // non-retryable, with the shared actionable message telling the
    // user exactly which Settings → AI step fixes it. (The old
    // .z-ai-config heuristic below is retired along with the SDK it
    // described — that SDK is no longer attempted at all.)
    if (msg === NO_AI_PROVIDER_MESSAGE) {
        return {type: "auth", message: msg, retryable: false};
    }

    if (status === 401 || status === 403) {
        return {type: "auth", message: msg, retryable: false};
    }
    if (status === 429) {
        return {
            type: "rate_limit",
            message: "The AI service is rate-limiting requests. Please wait a moment and retry.",
            retryable: true,
        };
    }
    if (status === 400 || status === 422) {
        return {type: "bad_request", message: msg, retryable: false};
    }
    if (
        /timeout|timed out|abort/i.test(msg) ||
        e?.name === "TimeoutError" ||
        e?.name === "AbortError"
    ) {
        return {
            type: "timeout",
            message: "The AI request timed out. Please try again.",
            retryable: true,
        };
    }
    if (
        /fetch failed|network|ECONN|ENOTFOUND|ECONNREFUSED|ECONNRESET|socket hang up/i.test(msg) ||
        e?.name === "TypeError" /* fetch throws TypeError on network failure */
    ) {
        return {
            type: "network",
            message: "A network error occurred while contacting the AI service.",
            retryable: true,
        };
    }
    return {type: "server", message: msg, retryable: status === undefined || status >= 500};
}

/** Hard caps on the request body the AI routes will accept. Anything
 *  larger is rejected with a 413 so a malicious client can't OOM the
 *  serverless instance by sending a 10MB messages array. */
export const AI_REQUEST_LIMITS = {
    /** Max number of messages in the `messages` array (chat route). */
    maxMessages: 50,
    /** Max length of any single message's `content` (chars). */
    maxMessageContentChars: 8000,
    /** Max length of `context.code` (chars). */
    maxContextCodeChars: 6000,
    /** Max total request body size in bytes (5 MB). */
    maxBodyBytes: 5 * 1024 * 1024,
} as const;

/* ================================================================== */
/*  Repo-aware chat context — @-mention contextFiles                  */

/* ================================================================== */

/** One sanitized `contextFiles` entry — the shape /api/ai-chat accepts
 *  (the client builds it from the chat composer's mention chips; see
 *  buildContextFiles in lib/ai-chat-utils.ts, which mirrors this cap). */
export interface SanitizedContextFile {
    /** Project-relative path ("My Folder/utils.py"). */
    path: string;
    /** Optional symbol the mention targeted — the whole file is still sent,
     *  with an instruction to focus near this symbol. */
    symbol?: string;
    /** Symbol kind ("function" | "class" | "method"). */
    kind?: string;
}

/** Max number of FILE paths the chat context may carry (spec contract —
 *  several symbol mentions in the same file still count as one file). */
export const AI_CONTEXT_FILES_CAP = 5;
/** Max characters of any single context file's content sent to the
 *  model (the head is kept — imports + public API). */
export const AI_CONTEXT_FILE_CHARS = 60_000;
/** The grounding instruction appended to the contextFiles system block. */
export const AI_CONTEXT_CITATION_INSTRUCTION =
    "Answer grounded in these files; when you reference them, cite as `path:line`.";

/** Validate + reduce an untrusted client `contextFiles` payload: array
 *  entries must be objects with a non-empty string path (≤ 300 chars);
 *  symbol/kind strings are clamped; the list is deduped by
 *  (path, symbol) and capped at AI_CONTEXT_FILES_CAP distinct paths.
 *  Pure — mirrored client-side by buildContextFiles in
 *  lib/ai-chat-utils.ts. */
export function sanitizeContextFiles(raw: unknown): SanitizedContextFile[] {
    if (!Array.isArray(raw)) return [];
    const seenPath = new Set<string>();
    const seenKey = new Set<string>();
    const out: SanitizedContextFile[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const path = typeof r.path === "string" ? r.path.trim().slice(0, 300) : "";
        if (!path) continue;
        const symbol = typeof r.symbol === "string" ? r.symbol.trim().slice(0, 200) : "";
        const kind = typeof r.kind === "string" ? r.kind.trim().slice(0, 60) : "";
        const key = `${path}::${symbol}`;
        if (seenKey.has(key)) continue;
        if (!seenPath.has(path)) {
            if (seenPath.size >= AI_CONTEXT_FILES_CAP) break;
            seenPath.add(path);
        }
        seenKey.add(key);
        out.push(
            symbol
                ? {path, symbol, ...(kind ? {kind} : {})}
                : {path}
        );
    }
    return out;
}

/** Render source with 1-based line numbers in the `{i+1:6d} | line`
 *  format the citation instruction refers to ("utils.py:42" maps to the
 *  "     42 | " row). Content longer than maxChars is clipped at the
 *  head's cap and flagged. Pure. */
export function numberedSourceLines(
    source: string,
    maxChars: number
): { text: string; truncated: boolean } {
    const clipped = source.length > maxChars ? source.slice(0, maxChars) : source;
    const lines = clipped.split("\n");
    const body = lines.map((l, i) => `${String(i + 1).padStart(6, " ")} | ${l}`).join("\n");
    return {text: body, truncated: source.length > maxChars};
}

/** One loaded context file for buildContextFilesBlock. */
export interface ContextFileInput extends SanitizedContextFile {
    /** The file's text, or null when it could not be read (unresolvable
     *  path / unreadable / binary) — the block then says so instead of
     *  silently dropping the mention. */
    content: string | null;
}

/** Build the system-context block injected for @-mentions: one section
 *  per file (path heading, symbol-focus line when the mention targeted a
 *  symbol, line-numbered content in an unfenced code block, truncation
 *  marker) followed by the grounding instruction. Returns "" when there
 *  is nothing to inject (no mentions / all failed → the block still
 *  documents the failures, so only an EMPTY input short-circuits).
 *  Pure — pinned by the vitest suite. */
export function buildContextFilesBlock(files: readonly ContextFileInput[]): string {
    if (files.length === 0) return "";
    const lines: string[] = ["Referenced project files (mentioned by the user):"];
    for (const f of files) {
        lines.push("");
        lines.push(`## ${f.path}`);
        if (f.content == null) {
            lines.push("(this file could not be read — do not invent its contents)");
            continue;
        }
        if (f.symbol) {
            lines.push(
                `Symbol focus: ${f.symbol}${f.kind ? ` (${f.kind})` : ""} — the whole file is included; pay particular attention to the code around this symbol.`
            );
        }
        const {text, truncated} = numberedSourceLines(f.content, AI_CONTEXT_FILE_CHARS);
        lines.push("```");
        lines.push(text);
        lines.push("```");
        if (truncated) {
            lines.push(`(file truncated at ${AI_CONTEXT_FILE_CHARS.toLocaleString("en")} characters)`);
        }
    }
    lines.push("");
    lines.push(AI_CONTEXT_CITATION_INSTRUCTION);
    return lines.join("\n") + "\n\n";
}

// ─── Test generation: source payload cap ──────────────────────────
// The /api/ai-generate-tests route reads the WHOLE script from disk and
// embeds it verbatim in the prompt. A 5,000-line module can blow past
// the context window of a small local model (a common complaint with
// 7B-class Ollama models), producing garbage or a 400. This cap keeps
// the HEAD of the file (imports + public API — what tests exercise)
// and marks the cut so the model knows there was more.

import type {ProviderMessage, SamplingParams} from "@/lib/ai-shared";
import {SAMPLING_BOUNDS, samplingBodyKeys, sanitizeSampling,} from "@/lib/ai-shared";

// ── client-safe pure helpers — moved to lib/ai-shared.ts so client
// components can import them without pulling the Node-only SDK into
// the browser bundle (the Turbopack build regression fix). Re-exported
// here for the API routes' existing imports.
export {
    SAMPLING_BOUNDS,
    sanitizeSampling,
    capSourceForPrompt,
    COMPLETION_LANGUAGE_PROMPTS,
    COMPLETION_LANGUAGE_LABELS,
    TEST_GENERATION_SOURCE_CAP,
    TEST_GENERATION_TRUNCATION_MARKER,
    completionLanguageFromFileName,
    completionSystemPrompt,
    buildCompletionUserMessage,
    buildCompletionMessages,
} from "@/lib/ai-shared";
export type {SamplingParams, CompletionLanguage, ProviderMessage} from "@/lib/ai-shared";
