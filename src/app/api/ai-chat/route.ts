import {NextResponse} from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
    AI_REQUEST_LIMITS,
    buildContextFilesBlock,
    type ClassifiedError,
    classifyAiError,
    type ContextFileInput,
    createChatCompletion,
    sanitizeContextFiles,
    sanitizeProvider,
} from "@/lib/ai";
import {getScriptsRoot, listFolders} from "@/lib/scripts";

/**
 * POST /api/ai-chat
 *
 * Body:
 * {
 * messages: [{ role: 'user' | 'assistant', content: string }],
 * context?: { fileName?: string; code?: string; folder?: string },
 * contextFiles?: [{ path: string, symbol?: string, kind?: string }]
 * }
 *
 * `contextFiles` are the chat composer's @-mentions: each path is
 * resolved against the ACTIVE project root (containment-guarded the
 * same way every file route does), read (≤ 60 KB per file, binary
 * refused), and injected into the system prompt as a line-numbered
 * block with the grounding + `path:line` citation instruction. The
 * streaming path below is unchanged — only the system prompt widens.
 *
 * Streams an OpenAI-compatible chat completion (the provider the
 * client selected — the built-in z-ai SDK was removed; no
 * provider → the shared "add a provider" guidance error)
 * back to the client as Server-Sent Events (`text/event-stream`). Each
 * upstream delta is forwarded as `data: {json}\n\n`; the stream ends
 * with `data: [DONE]\n\n`. Errors are emitted as
 * `data: {"error": "...", "errorType": "...", "retryable": bool}\n\n`
 * followed by [DONE] so the client can surface them via the normal
 * SSE parser and decide whether to offer a Retry button.
 *
 * Server-side hardening:
 * - Request body is capped (max 50 messages, max 8k chars per
 * message, max 6k chars of context.code, max 5 MB total body).
 * - The upstream read loop is wrapped in a 60-second idle-timeout —
 * if the SDK stalls (no bytes for 60s), we emit an error event
 * and close, so a serverless instance isn't held open forever.
 * - Errors are classified (auth / rate_limit / network / timeout /
 * server / bad_request) so the client can show Retry only for
 * retryable types.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard ceiling on the file context sent to the model. Large files are
 *  truncated to their tail (the most recently edited region) so we stay
 *  within a reasonable token budget. */
const MAX_CODE_CHARS = AI_REQUEST_LIMITS.maxContextCodeChars;

/** Idle timeout for the upstream read loop. If the SDK doesn't produce
 *  any bytes for this many ms, we abort + emit a timeout error event.
 *  This prevents a stalled upstream from holding a serverless instance
 *  open indefinitely. */
const UPSTREAM_IDLE_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT =
    "You are a helpful coding assistant for Praxis, a Python IDE. The user is working on a Python file. Provide clear, concise explanations and code suggestions.";

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface ChatRequestBody {
    messages?: ChatMessage[];
    context?: {
        fileName?: string;
        code?: string;
        folder?: string;
        /** Optional override for the system prompt. Empty/undefined = use
         * the built-in default. The parent (AiChatSidebar) forwards the
         * user's Settings → AI → "AI Chat system prompt" value here. */
        systemPromptOverride?: string;
    };
    /** Optional @-mention context — the files (and optional symbols) the
     *  user attached in the composer. Each path is resolved against the
     *  ACTIVE project root with the same containment guard every file
     *  route uses, read (≤ 60 KB per file), and injected as a
     *  line-numbered system block. sanitizeContextFiles caps the list at
     *  5 file paths; junk entries are dropped. */
    contextFiles?: unknown;
    /** Optional chat provider (Settings → AI → Chat model providers).
     *  Absent / invalid → the shared no-provider guidance (the built-in
     *  z-ai SDK was removed). See sanitizeProvider. */
    provider?: unknown;
}

/** Extensions whose bytes are never useful as model context — reading
 *  them as utf-8 would ship mojibake into the prompt. */
const BINARY_EXT_BLOCKLIST = new Set([
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svgz", "tif", "tiff",
    "pdf", "zip", "gz", "tar", "tgz", "7z", "rar", "bz2", "xz",
    "mp3", "mp4", "wav", "avi", "mov", "mkv", "webm",
    "db", "sqlite", "sqlite3", "xlsx", "xls", "docx", "pptx",
    "parquet", "feather", "npz", "npy", "pkl", "pickle", "whl", "so", "dll", "exe", "bin",
]);

/** Resolve one project-relative mention path to readable text, mirroring
 *  how the other file routes resolve paths: the joined path must stay
 *  INSIDE the scripts root (path.relative guard — the same check
 *  resolveScriptPath runs) and must be a real file. Three passes:
 *  (1) first segment matches a folder name (case-insensitive), the rest
 *  is the path inside that folder; (2) the whole path resolves against
 *  the project root (root-level / nested files addressed without the
 *  folder prefix); (3) a suffix match against the explorer tree's file
 *  paths (git paths can carry a repo-root prefix the tree does not have,
 *  and symbol mentions only know the basename). Returns null for
 *  anything unresolvable / binary — the prompt block then says the file
 *  could not be read instead of silently inventing content. */
async function loadProjectFileByPath(relPath: string): Promise<string | null> {
    const clean = relPath.trim().split(/[\\/]+/).filter(Boolean).join("/");
    if (!clean) return null;
    const segs = clean.split("/");
    if (segs.some((s) => s === ".." || s.startsWith("."))) return null; // traversal / hidden
    const ext = (segs[segs.length - 1] ?? "").split(".").pop() ?? "";
    if (ext && BINARY_EXT_BLOCKLIST.has(ext.toLowerCase())) return null;

    const root = getScriptsRoot();
    const folders = await listFolders();

    /** Read + return the file when abs is a file INSIDE the root, else null. */
    const readInside = async (abs: string): Promise<string | null> => {
        const rel = path.relative(root, abs);
        if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") return null;
        try {
            const stat = await fs.stat(abs);
            if (!stat.isFile()) return null;
            const buf = await fs.readFile(abs);
            // A NUL byte means this is binary after all (extension heuristics
            // can't catch everything) — refuse to ship mojibake to the model.
            if (buf.includes(0)) return null;
            return buf.toString("utf-8");
        } catch {
            return null;
        }
    };

    // (1) first segment = folder name, remainder = path inside the folder.
    //    (The synthetic project-ROOT entry is skipped — its files sit in the
    //    scripts root itself, not under root/<basename>; pass 2/3 cover
    //    those via their bare relative paths.)
    if (segs.length >= 2) {
        const folderName = segs[0] ?? "";
        const folder = folders.find(
            (f) => !f.isRoot && f.name.toLowerCase() === folderName.toLowerCase()
        );
        if (folder) {
            const abs = path.join(root, folder.name, ...segs.slice(1));
            const content = await readInside(abs);
            if (content != null) return content;
        }
    }
    // (2) whole path against the project root.
    {
        const abs = path.join(root, ...segs);
        const content = await readInside(abs);
        if (content != null) return content;
    }
    // (3) suffix match against the tree (repo-root prefixes + basenames).
    for (const folder of folders) {
        for (const file of folder.files) {
            const rel = file.path ?? file.name;
            const full = folder.isRoot ? rel : `${folder.name}/${rel}`;
            if (
                full === clean ||
                full.endsWith(`/${clean}`) ||
                clean.endsWith(`/${full}`) ||
                (folder.isRoot && rel === clean) ||
                (segs.length >= 2 &&
                    segs[0]?.toLowerCase() === folder.name.toLowerCase() &&
                    segs[segs.length - 1] === file.name)
            ) {
                const abs = path.join(root, folder.isRoot ? "" : folder.name, ...rel.split("/"));
                const content = await readInside(abs);
                if (content != null) return content;
            }
        }
    }
    return null;
}

export async function POST(request: Request) {
    // ── Body-size guard — reject oversized bodies before parsing. ──
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

    let body: ChatRequestBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {error: "Invalid JSON body."},
            {status: 400}
        );
    }

    const {messages, context} = body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json(
            {error: "Body must include a non-empty 'messages' array."},
            {status: 400}
        );
    }

    // ── Server-side caps on the messages array. ──
    // Keep only the last N messages and truncate each one's content so a
    // malicious / buggy client can't forward a 10MB history to the SDK.
    const trimmedMessages = messages
        .filter(
            (m) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string"
        )
        .slice(-AI_REQUEST_LIMITS.maxMessages)
        .map((m) => ({
            role: m.role,
            content:
                m.content.length > AI_REQUEST_LIMITS.maxMessageContentChars
                    ? m.content.slice(-AI_REQUEST_LIMITS.maxMessageContentChars)
                    : m.content,
        }));

    if (trimmedMessages.length === 0) {
        return NextResponse.json(
            {error: "Body must include at least one valid message."},
            {status: 400}
        );
    }

    // ── Build the system prompt, optionally prepended with the current
    //    file context (file name, folder, and the code itself fenced as
    //    a ```python block). Empty/whitespace-only fields are skipped so
    //    we never send a stray "Folder: " line.
    const fileName = context?.fileName?.trim();
    const folder = context?.folder?.trim();
    const rawCode = context?.code ?? "";
    // Honor the custom system prompt if provided (Settings → AI →
    // "AI Chat system prompt"). Empty/whitespace-only = use the built-in
    // default below.
    const userSystemPrompt = context?.systemPromptOverride?.trim();
    const baseSystemPrompt = userSystemPrompt || SYSTEM_PROMPT;

    let contextBlock = "";

    // ── @-mention context files. Resolved server-side against the
    //    ACTIVE project root with the same containment guard every file
    //    route uses; each file's content rides the system prompt as a
    //    LINE-NUMBERED block (see buildContextFilesBlock) capped at 5
    //    files / 60 KB each, with the grounding + `path:line` citation
    //    instruction. Streaming is untouched — this only widens the
    //    system prompt.
    const contextFiles = sanitizeContextFiles(body.contextFiles);
    if (contextFiles.length > 0) {
        const loaded: ContextFileInput[] = await Promise.all(
            contextFiles.map(async (f) => ({
                path: f.path,
                ...(f.symbol ? {symbol: f.symbol, ...(f.kind ? {kind: f.kind} : {})} : {}),
                content: await loadProjectFileByPath(f.path),
            }))
        );
        contextBlock += buildContextFilesBlock(loaded);
    }

    if (fileName || folder || rawCode.trim()) {
        const lines: string[] = [];
        if (fileName) lines.push(`Current file: ${fileName}`);
        if (folder) lines.push(`Folder: ${folder}`);
        if (rawCode.trim()) {
            const code =
                rawCode.length > MAX_CODE_CHARS
                    ? rawCode.slice(-MAX_CODE_CHARS)
                    : rawCode;
            lines.push("```python", code, "```");
        }
        contextBlock = lines.join("\n") + "\n\n";
    }

    const fullSystemPrompt = contextBlock + baseSystemPrompt;

    // Drop any system messages the client sent — we own the system prompt.
    const history: ChatMessage[] = trimmedMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({role: m.role, content: m.content}));

    const sdkMessages: ChatMessage[] = [
        {role: "system", content: fullSystemPrompt},
        ...history,
    ];

    const encoder = new TextEncoder();

    /** Format a classified error as an SSE `data:` line. */
    const errorEvent = (ce: ClassifiedError) =>
        `data: ${JSON.stringify({
            error: ce.message,
            errorType: ce.type,
            retryable: ce.retryable,
        })}\n\n`;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            // `enqueue` accepts either a raw Uint8Array (forwarded verbatim
            // from the upstream stream) or a string (encoded to UTF-8). We
            // must NOT call TextEncoder.encode on a Uint8Array — that
            // coerces it via `.toString` and produces "100,97,116,97,…"
            // instead of the actual bytes.
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

            let idleTimer: ReturnType<typeof setTimeout> | null = null;
            const resetIdleTimer = () => {
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(() => {
                    // The upstream stalled — abort the reader + emit a timeout
                    // error so the client can offer a Retry.
                    try {
                        reader?.cancel().catch(() => {
                        });
                    } catch {
                        /* ignore */
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
                    } catch {
                        /* ignore */
                    }
                }, UPSTREAM_IDLE_TIMEOUT_MS);
            };

            let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

            try {
                // Resolve the chat provider: the client's selection (any
                // OpenAI-compatible endpoint).
                const provider = sanitizeProvider(body.provider);

                // createChatCompletion returns the raw upstream stream (a web
                // ReadableStream<Uint8Array>) for /chat/completions with
                // stream:true, so the byte-forwarding loop below is
                // provider-agnostic. A missing/invalid provider THROWS here —
                // the catch below surfaces the guidance as an SSE error event.
                const upstream = (await createChatCompletion(provider, {
                    messages: sdkMessages,
                    stream: true,
                })) as ReadableStream<Uint8Array> | null | undefined;

                if (!upstream || typeof upstream.getReader !== "function") {
                    safeEnqueue(
                        errorEvent({
                            type: "server",
                            message: "The AI service returned no stream.",
                            retryable: false,
                        })
                    );
                    safeEnqueue("data: [DONE]\n\n");
                    controller.close();
                    return;
                }

                reader = upstream.getReader();
                resetIdleTimer(); // start the idle clock
                try {
                    while (true) {
                        const {done, value} = await reader.read();
                        if (done) break;
                        if (value) {
                            safeEnqueue(value);
                            resetIdleTimer(); // got bytes — reset the idle clock
                        }
                    }
                } finally {
                    if (idleTimer) clearTimeout(idleTimer);
                    try {
                        reader.releaseLock();
                    } catch {
                        /* ignore */
                    }
                }

                // Guarantee the client sees a terminator even if the upstream
                // omitted one.
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
