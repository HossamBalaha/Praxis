import {NextResponse} from "next/server";
import {classifyAiError, createChatCompletion, sanitizeProvider} from "@/lib/ai";

/**
 * POST /api/ai-test
 *
 * Body (optional JSON): { provider?: {...} }
 *
 * Pings the given chat provider with a trivial "ping" message and
 * reports the round-trip latency + the model name the endpoint used.
 * No provider supplied → the shared "no provider configured"
 * guidance error (the built-in z-ai SDK was removed). Used by the
 * Settings → AI tab's per-provider "Test" buttons and the sidebar
 * status indicator, so the user can verify an endpoint (Ollama, LM
 * Studio, vLLM, llama.cpp, a hosted API, …) is reachable before
 * switching to it.
 *
 * Response: { ok: true, latencyMs: number, model?: string } |
 * { ok: false, error: string, errorType: string, retryable: bool }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 15_000;

export async function POST(request: Request) {
    const start = Date.now();

    // Body is optional — an empty body now surfaces the "no provider
    // configured" guidance (there is no built-in SDK to fall back to).
    let rawBody: unknown = null;
    try {
        const text = await request.text();
        if (text.trim()) rawBody = JSON.parse(text);
    } catch {
        return NextResponse.json({error: "Invalid JSON body."}, {status: 400});
    }
    const provider = sanitizeProvider(
        (rawBody as { provider?: unknown } | null)?.provider
    );

    try {
        const result = (await Promise.race([
            createChatCompletion(provider, {
                messages: [
                    {role: "system", content: "Reply with the single word: pong"},
                    {role: "user", content: "ping"},
                ],
                thinkingDisabled: true,
            }),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error("AI test connection timed out")),
                    TIMEOUT_MS
                )
            ),
        ])) as {
            model?: string;
            choices?: Array<{ model?: string }>;
        };
        const latencyMs = Date.now() - start;
        const model: string | undefined =
            // The SDK / endpoint surfaces the upstream model name on the
            // completion object; we read it defensively since the shape varies.
            result?.model ?? result?.choices?.[0]?.model ?? undefined;
        return NextResponse.json({ok: true, latencyMs, model});
    } catch (err) {
        const ce = classifyAiError(err);
        return NextResponse.json(
            {
                ok: false,
                error: ce.message,
                errorType: ce.type,
                retryable: ce.retryable,
            },
            {status: ce.type === "bad_request" ? 400 : 500}
        );
    }
}
