import {NextResponse} from "next/server";
import {
    AI_REQUEST_LIMITS,
    buildCompletionMessages,
    classifyAiError,
    createChatCompletion,
    sanitizeProvider,
} from "@/lib/ai";

/**
 * POST /api/ai-completion
 *
 * Body: { code: string, cursorOffset?: number, provider?: {...},
 * suffix?: string, language?: string }
 *
 * Calls the active chat provider (any OpenAI-compatible endpoint the
 * client selected — see sanitizeProvider) server-side to get a code
 * completion for the given source (the text before the cursor). The
 * optional `suffix` (text AFTER the cursor) and `language` feed the
 * Fill-In-Middle prompt assembly from lib/ai.ts — the completion
 * must fit BETWEEN prefix and suffix without repeating either.
 * `language` defaults to python; the client derives it from the file
 * name. No provider → the shared "add a provider" guidance
 * error (the built-in z-ai SDK was removed).
 *
 * This route exists so the completion runs server-side (the client
 * never touches the provider's API key). The client (CodeViewer)
 * calls it via fetch.
 *
 * Response: { ok, suggestion?, error?, errorType?, retryable? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT =
    "You are a Python code-completion engine. The user will send you the source code before the cursor; respond with ONLY the next 1-3 lines that should follow at the cursor position. Do not repeat existing code. Do not wrap in markdown fences. Do not explain. Emit nothing if the context is unclear.";

interface CompletionRequestBody {
    code?: string;
    cursorOffset?: number;
    /** Optional chat provider (Settings → AI). Invalid/absent → the
     *  shared no-provider guidance. */
    provider?: unknown;
    /** Fill-In-Middle context: the text AFTER the cursor (tail-capped
     * inside buildCompletionUserMessage). Empty → legacy prefix-only
     * prompt, byte-identical to the old shape. */
    suffix?: string;
    /** The file's language (python default) — picks the per-language
     *  completion system prompt (lib/ai.ts). */
    language?: string;
}

/** Strip surrounding markdown code fences if the model wrapped its
 *  response in ```python ... ``` (despite being told not to). Handles
 *  ```python, ```py, ```text, and bare ``` openings, plus any leading
 *  "Here is the completion:" preamble on its own line. Trims
 *  leading/trailing whitespace. */
function stripCodeFences(text: string): string {
    let out = text.trim();
    // Drop a single leading preamble line like "Here is the completion:"
    // or "Sure, here you go:" — anything before the first fence or
    // newline that doesn't look like code.
    const preambleMatch = out.match(/^[^\n`]{0,80}\n+/);
    if (preambleMatch && !/^(\s|def |class |import |from |if |for |while |return |print\(|#)/.test(out)) {
        // Only strip if the preamble is short and the rest starts with a
        // fence or actual code.
        const rest = out.slice(preambleMatch[0].length);
        if (rest.startsWith("```") || /^(\s|def |class |import |from |if |for |while |return |print\(|#)/.test(rest)) {
            out = rest;
        }
    }
    // Remove a leading ```python (or ```py, ```text, bare ```) and a
    // matching trailing ```.
    const leadingMatch = out.match(/^```(?:python|py|text)?\s*\n?/i);
    if (leadingMatch) {
        out = out.slice(leadingMatch[0].length);
    }
    if (out.endsWith("```")) {
        out = out.slice(0, -3);
    }
    return out.trim();
}

export async function POST(request: Request) {
    // body-size guard before parsing — the other AI
    // routes (AI_REQUEST_LIMITS) already had one; a client could send an
    // unbounded body here and it was fully buffered before the route's
    // own context cap ever applied.
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
        Number.isFinite(contentLength) &&
        contentLength > AI_REQUEST_LIMITS.maxBodyBytes
    ) {
        return NextResponse.json(
            {error: "Request body too large."},
            {status: 413}
        );
    }

    let body: CompletionRequestBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }

    const {code, cursorOffset, suffix, language} = body;
    if (!code || typeof code !== "string") {
        return NextResponse.json(
            {error: "Body must include 'code' (string)."},
            {status: 400}
        );
    }

    // Cap the context to avoid sending huge files to the LLM.
    const maxContext = 4000;
    const codeBeforeCursor =
        typeof cursorOffset === "number" && cursorOffset >= 0 && cursorOffset <= code.length
            ? code.slice(0, cursorOffset)
            : code;
    const context =
        codeBeforeCursor.length > maxContext
            ? codeBeforeCursor.slice(-maxContext)
            : codeBeforeCursor;

    try {
        const provider = sanitizeProvider(body.provider);

        // Race the LLM call against a timeout so a hung request doesn't
        // block the UI indefinitely. the timeout timer is
        // now CLEARED when the LLM responds first — every request used to
        // leak a pending 15 s timer (and keep the race promise + closure
        // alive) even on the success path.
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
                () => reject(new Error("AI completion timed out")),
                TIMEOUT_MS
            );
        });
        let result: {
            choices?: Array<{ message?: { content?: string } }>;
        };
        try {
            result = (await Promise.race([
                createChatCompletion(provider, {
                    // Fill-In-Middle + per-language prompt assembly (lib/ai.ts):
                    // prefix + optional suffix, language-aware system prompt.
                    // No suffix / default language → the legacy shape.
                    messages: buildCompletionMessages({
                        prefix: context,
                        suffix: typeof suffix === "string" ? suffix : undefined,
                        language: typeof language === "string" ? language : undefined,
                    }),
                    thinkingDisabled: true,
                }),
                timeoutPromise,
            ])) as {
                choices?: Array<{ message?: { content?: string } }>;
            };
        } finally {
            clearTimeout(timeoutHandle);
        }

        const raw = result?.choices?.[0]?.message?.content ?? "";
        const text = stripCodeFences(raw);

        return NextResponse.json({ok: true, suggestion: text || null});
    } catch (err) {
        const ce = classifyAiError(err);
        return NextResponse.json(
            {
                ok: false,
                error: ce.message,
                errorType: ce.type,
                retryable: ce.retryable,
                suggestion: null,
            },
            {status: ce.type === "bad_request" ? 400 : 500}
        );
    }
}
