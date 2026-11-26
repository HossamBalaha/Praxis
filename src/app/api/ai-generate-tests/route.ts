import {
    AI_REQUEST_LIMITS,
    capSourceForPrompt,
    type ClassifiedError,
    classifyAiError,
    createChatCompletion,
    sanitizeProvider
} from "@/lib/ai";
import fs from "node:fs/promises";
import {resolveScriptPath} from "@/lib/scripts";

/**
 * POST /api/ai-generate-tests
 *
 * Body: { folder: <slug>, file: <slug>, interpreter?: string,
 * provider?: {...} }
 *
 * Reads the requested Python script's source, sends it to the active
 * chat provider (any OpenAI-compatible endpoint the client selected;
 * the built-in z-ai SDK was removed — no provider surfaces the
 * shared guidance error) with a prompt asking for comprehensive pytest
 * test functions, and STREAMS the generated test code back to the
 * client as Server-Sent Events so the user sees the code appear in
 * real time instead of staring at a spinner for up to 60 seconds.
 *
 * SSE event format:
 * data: {"fileName":"test_foo.py"}\n\n — sent first, so the client knows the filename
 * data: {"delta":"import pytest\n"}\n\n — repeated for each upstream token
 * data: {"error":"…","errorType":"…","retryable":bool}\n\n — on error
 * data: [DONE]\n\n — terminator
 *
 * The client accumulates the deltas, shows a live preview, and writes
 * the final code to disk via /api/import-py when [DONE] arrives.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
    "You are an expert Python test engineer. You generate comprehensive, " +
    "well-structured pytest test suites that follow best practices: clear " +
    "test names, Arrange-Act-Assert structure, parametrization where " +
    "appropriate, and meaningful assertions. You only output Python code.";

const USER_PROMPT_PREFIX =
    "Generate comprehensive pytest test functions for this Python code. " +
    "Return ONLY the test code, no explanations, no markdown fences, no " +
    "commentary. The code should be directly runnable with `pytest`.\n\n" +
    "```python\n";

const USER_PROMPT_SUFFIX = "\n```";

/** Idle timeout for the upstream read loop. If the SDK doesn't produce
 *  any bytes for this many ms, we abort + emit a timeout error event. */
const UPSTREAM_IDLE_TIMEOUT_MS = 60_000;

export async function POST(request: Request) {
    // ── Body-size guard. ──
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
        Number.isFinite(contentLength) &&
        contentLength > AI_REQUEST_LIMITS.maxBodyBytes
    ) {
        return new Response(
            JSON.stringify({error: "Request body too large."}),
            {status: 413, headers: {"Content-Type": "application/json"}}
        );
    }

    let body: { folder?: string; file?: string; interpreter?: string; provider?: unknown };
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({error: "Invalid JSON body."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    const {folder, file} = body;
    if (!folder || !file) {
        return new Response(
            JSON.stringify({error: "Body must include 'folder' and 'file' slugs."}),
            {status: 400, headers: {"Content-Type": "application/json"}}
        );
    }

    const resolved = await resolveScriptPath(folder, file);
    if (!resolved) {
        return new Response(
            JSON.stringify({error: "File not found inside python_scripts/."}),
            {status: 404, headers: {"Content-Type": "application/json"}}
        );
    }

    let source: string;
    try {
        source = await fs.readFile(resolved.absPath, "utf-8");
    } catch {
        return new Response(
            JSON.stringify({error: "File vanished before it could be read."}),
            {status: 404, headers: {"Content-Type": "application/json"}}
        );
    }

    // The conventional pytest test file name is `test_<original_name>`.
    // We slugify the stem so the file is shell-friendly and importable.
    const stem = resolved.fileName.replace(/\.py$/i, "");
    const safeStem = stem.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "script";
    const fileName = `test_${safeStem}.py`;

    const encoder = new TextEncoder();
    const errorEvent = (ce: ClassifiedError) =>
        `data: ${JSON.stringify({
            error: ce.message,
            errorType: ce.type,
            retryable: ce.retryable,
        })}\n\n`;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const safeEnqueue = (chunk: Uint8Array | string) => {
                try {
                    if (typeof chunk === "string") {
                        controller.enqueue(encoder.encode(chunk));
                    } else {
                        controller.enqueue(chunk);
                    }
                } catch {
                    /* controller may already be closed — ignore */
                }
            };

            // Send the filename first so the client can display it in the
            // preview dialog before any tokens arrive.
            safeEnqueue(`data: ${JSON.stringify({fileName})}\n\n`);

            let idleTimer: ReturnType<typeof setTimeout> | null = null;
            let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
            const resetIdleTimer = () => {
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    try {
                        reader?.cancel().catch(() => {
                        });
                    } catch { /* ignore */
                    }
                    safeEnqueue(
                        errorEvent({
                            type: "timeout",
                            message: "The AI service stopped responding. Please try again.",
                            retryable: true,
                        })
                    );
                    safeEnqueue("data: [DONE]\n\n");
                    try {
                        controller.close();
                    } catch { /* ignore */
                    }
                }, UPSTREAM_IDLE_TIMEOUT_MS);
            };

            try {
                const provider = sanitizeProvider(body.provider);
                const upstream = (await createChatCompletion(provider, {
                    messages: [
                        {role: "system", content: SYSTEM_PROMPT},
                        {
                            role: "user",
                            content: USER_PROMPT_PREFIX + capSourceForPrompt(source) + USER_PROMPT_SUFFIX,
                        },
                    ],
                    thinkingDisabled: true,
                    stream: true,
                })) as ReadableStream<Uint8Array> | null | undefined;

                if (!upstream || typeof upstream.getReader !== "function") {
                    // Non-streaming fallback: some SDK configs don't return a
                    // stream. Treat the response as a single completion + emit
                    // its content as one delta.
                    const completion = upstream as unknown as {
                        choices?: Array<{ message?: { content?: string } }>;
                    };
                    const raw = completion?.choices?.[0]?.message?.content ?? "";
                    if (!raw.trim()) {
                        safeEnqueue(
                            errorEvent({
                                type: "server",
                                message: "LLM returned an empty response.",
                                retryable: false,
                            })
                        );
                    } else {
                        // Strip surrounding code fences if the model wrapped its
                        // response despite being told not to.
                        let out = raw.trim();
                        const leadingMatch = out.match(/^```(?:python)?\s*\n/i);
                        if (leadingMatch) out = out.slice(leadingMatch[0].length);
                        if (out.endsWith("```")) out = out.slice(0, -3);
                        safeEnqueue(`data: ${JSON.stringify({delta: out})}\n\n`);
                    }
                    safeEnqueue("data: [DONE]\n\n");
                    controller.close();
                    return;
                }

                reader = upstream.getReader();
                resetIdleTimer();
                // Forward raw upstream bytes verbatim — the client's SSE parser
                // handles the framing. We don't need to buffer here.
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    if (value) {
                        safeEnqueue(value);
                        resetIdleTimer();
                    }
                }
                if (idleTimer) clearTimeout(idleTimer);
                try {
                    reader.releaseLock();
                } catch { /* ignore */
                }
                safeEnqueue("data: [DONE]\n\n");
                controller.close();
            } catch (err) {
                if (idleTimer) clearTimeout(idleTimer);
                const ce = classifyAiError(err);
                safeEnqueue(errorEvent(ce));
                safeEnqueue("data: [DONE]\n\n");
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}
