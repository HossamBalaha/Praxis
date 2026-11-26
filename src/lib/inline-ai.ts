/**
 * inline-ai.ts — pure helpers for the inline AI chat widget (E18).
 *
 * The widget (src/components/inline-ai-chat.tsx) anchors a small chat
 * card right at the editor selection (Ctrl+I). Everything here is
 * string-pure logic kept OUT of the component so it is unit-testable
 * in the node vitest environment (no DOM, no React):
 *
 * - INLINE_AI_SYSTEM_PROMPT — the code-editing persona, sent through
 *   `context.systemPromptOverride` (the same key AiChatSidebar uses to
 *   forward Settings → AI → "AI Chat system prompt").
 * - buildInlineAiUserMessage — the single user message: file name, the
 *   fenced selection, and the user's prompt.
 * - buildInlineAiContextPayload — the `context` object of the POST
 *   body, byte-compatible with the sidebar's contextPayload shape
 *   ({ fileName?, code?, systemPromptOverride? }); the surrounding
 *   file context rides `code` exactly like the sidebar's sheet code.
 * - extractCodeBlock — pull the FIRST fenced ``` block out of a model
 *   answer so "Apply to selection" can drop the revised code straight
 *   into the buffer (no markdown rendering involved).
 * - summarizeSelection — the context-chip label (first ~40 chars +
 *   line count).
 *
 * The wire protocol itself (POST shape + SSE parse loop) lives in the
 * component and mirrors src/components/ai-chat-sidebar.tsx exactly —
 * see the header comment there and src/app/api/ai-chat/route.ts for
 * the server contract.
 */

import {completionLanguageFromFileName} from "@/lib/ai-shared";

// ─── System prompt ─────────────────────────────────────────────────
// NOTE: /api/ai-chat OWNS the system message (it drops any client-sent
// system role) — the only way to change the persona is the
// `context.systemPromptOverride` key, which the route splices in when
// non-empty. The fence instruction keeps answers extractable by
// extractCodeBlock below (models ignore it often enough that the
// extractor also handles prose-wrapped and unfenced answers).

/** Persona for the inline "Edit with AI" widget. */
export const INLINE_AI_SYSTEM_PROMPT =
    "You are a code editing assistant. Return ONLY the revised code unless asked to explain. " +
    "When you revise code, output the COMPLETE replacement for the selected code in a single " +
    "markdown code fence (```language ... ```) with no surrounding prose.";

// ─── Prompt assembly ───────────────────────────────────────────────

/** Client-side cap on the selection embedded in the user message. The
 * server (AI_REQUEST_LIMITS.maxMessageContentChars = 8000) would
 * tail-truncate an oversized message and chop off the TASK line, so
 * the selection is head-capped here with an explicit marker instead. */
export const INLINE_AI_SELECTION_CAP = 6000;

/** Marker appended when a selection was cut for the prompt. */
export const INLINE_AI_SELECTION_TRUNCATION_MARKER = "… (selection truncated)";

/** Client-side cap on the surrounding file context — matches the
 * server's AI_REQUEST_LIMITS.maxContextCodeChars (6000). Kept as the
 * TAIL (like the sidebar's DEFAULT_MAX_CODE_CHARS trim) so the code
 * nearest the selection survives. */
export const INLINE_AI_FILE_CONTEXT_CAP = 6000;

/** Head-cap a selection for the prompt (long selections keep their
 * head — the start of the function/class being edited). */
function capSelectionForPrompt(selection: string): string {
    if (selection.length <= INLINE_AI_SELECTION_CAP) return selection;
    return (
        selection.slice(0, INLINE_AI_SELECTION_CAP).trimEnd() +
        "\n" +
        INLINE_AI_SELECTION_TRUNCATION_MARKER
    );
}

/** The fence language for the selection, derived from the file name
 * (js/ts/R/shell/julia/matlab; anything unknown → "python", the app's
 * primary language). Reuses the shared completion-prompt table. */
function fenceLanguageFor(fileName: string): string {
    return completionLanguageFromFileName(fileName);
}

/**
 * Build the single user message for an inline-edit request.
 *
 * Contains, in order: the file name, the fenced selection (when one
 * was provided — the answer replaces it on Apply), and the user's
 * prompt behind an explicit `TASK:` lead so the model can't mistake
 * commentary for instructions. Without a selection the message says
 * so and relies on the file context attached via
 * buildInlineAiContextPayload.
 */
export function buildInlineAiUserMessage(opts: {
    fileName: string;
    selectedText: string;
    prompt: string;
    /** Fence language override; defaults to the file-name guess. */
    language?: string;
}): string {
    const fileName = (opts.fileName ?? "").trim();
    const prompt = (opts.prompt ?? "").trim();
    const selection = capSelectionForPrompt((opts.selectedText ?? "").trim());
    const lang = opts.language || fenceLanguageFor(fileName);

    const header = fileName ? `File: ${fileName}` : "File: (untitled)";

    if (selection) {
        return (
            `${header}\n\n` +
            "SELECTED CODE (your answer replaces this selection when applied):\n" +
            "```" +
            lang +
            "\n" +
            selection +
            "\n```\n\n" +
            `TASK: ${prompt}`
        );
    }
    return (
        `${header}\n\n` +
        "No code is selected. The current file is attached as context when available.\n\n" +
        `TASK: ${prompt}`
    );
}

/**
 * Build the `context` payload of the POST body — the exact shape
 * AiChatSidebar sends ({ fileName?, code?, systemPromptOverride? },
 * with empty fields omitted so the server never sees a stray
 * "Current file:" line). The inline widget always overrides the
 * system prompt with the code-editing persona.
 */
export function buildInlineAiContextPayload(opts: {
    fileName: string;
    fileContext?: string;
}): {
    fileName?: string;
    code?: string;
    systemPromptOverride: string;
} {
    const payload: {
        fileName?: string;
        code?: string;
        systemPromptOverride: string;
    } = {systemPromptOverride: INLINE_AI_SYSTEM_PROMPT};

    const fileName = (opts.fileName ?? "").trim();
    if (fileName) payload.fileName = fileName;

    const ctx = opts.fileContext ?? "";
    if (ctx.trim()) {
        payload.code =
            ctx.length > INLINE_AI_FILE_CONTEXT_CAP
                ? ctx.slice(-INLINE_AI_FILE_CONTEXT_CAP)
                : ctx;
    }
    return payload;
}

// ─── Answer extraction ─────────────────────────────────────────────

/**
 * Extract the FIRST fenced code block from a model answer.
 *
 * The model is told to return a single ```language fence, but answers
 * often carry prose ("Sure! Here's the fixed version:") around it —
 * and explanatory answers may contain several fences. Rules:
 *
 * - The opening fence must sit at a line start (leading whitespace
 *   allowed) and be followed by a newline — an inline ``` inside
 *   prose never matches. The info string (```python, ```js, bare ```)
 *   is consumed with the opening line.
 * - The block ends at the FIRST subsequent line-start ``` fence.
 * - Trailing whitespace is trimmed; the first line's indentation is
 *   preserved (it is code). Leading blank lines are dropped.
 * - An UNTERMINATED fence (stream interrupted by Stop / a dropped
 *   connection) still yields the content streamed so far — applying a
 *   near-complete edit beats falling back to the whole raw answer.
 * - No fence at all, or an empty body → null (the caller falls back
 *   to the raw response).
 */
export function extractCodeBlock(text: string): string | null {
    if (typeof text !== "string" || !text.includes("```")) return null;
    // Normalize CRLF → LF so \r never rides the extracted code into the
    // buffer (the editors are \n-based).
    const normalized = text.replace(/\r\n/g, "\n");

    // Opening fence: line-start ```, optional info string, then EOL.
    const openMatch = /(?:^|\n)[ \t]*```[^\n`]*[ \t]*(?=\n)/.exec(normalized);
    if (!openMatch) return null;
    const bodyStart = openMatch.index + openMatch[0].length;
    let body = normalized.slice(bodyStart);

    // Closing fence: the first line-start ``` after the body starts
    // (|^ covers a fence immediately after the opening line).
    const closeMatch = /(?:^|\n)[ \t]*```/.exec(body);
    if (closeMatch) {
        body = body.slice(0, closeMatch.index);
    }

    const out = body.replace(/^[ \t]*\n+/, "").replace(/\s+$/, "");
    return out.length > 0 ? out : null;
}

// ─── Context chip ──────────────────────────────────────────────────

/** The context-chip summary of the selection. */
export interface SelectionSummary {
    /** First ~maxChars chars of the selection, runs of whitespace
     * collapsed to single spaces, "…" appended when cut. */
    head: string;
    /** Number of lines in the (trimmed) selection. */
    lineCount: number;
    /** Whether the head was cut at maxChars. */
    truncated: boolean;
}

/**
 * Summarize the selection for the widget's context chip: the first
 * ~40 characters plus the line count, so the user can see WHAT the
 * AI is about to edit without a second selection highlight.
 */
export function summarizeSelection(
    text: string,
    maxChars: number = 40
): SelectionSummary {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return {head: "", lineCount: 0, truncated: false};
    const lineCount = trimmed.split("\n").length;
    const collapsed = trimmed.replace(/\s+/g, " ").trim();
    const truncated = collapsed.length > maxChars;
    const head = truncated
        ? collapsed.slice(0, maxChars).trimEnd() + "…"
        : collapsed;
    return {head, lineCount, truncated};
}
