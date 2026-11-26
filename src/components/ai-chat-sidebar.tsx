"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
// KaTeX math in AI responses ($…$ / $$…$$) — the assistant
// explains statistics formulas, which should render as formulas.
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import {useLazyKatexPlugin} from "@/lib/lazy-katex";
import {
    AlertCircle,
    AtSign,
    Braces,
    CircleAlert,
    CircleCheck,
    Download,
    FileCheck2,
    FileCode2,
    FunctionSquare,
    Loader2,
    RotateCw,
    Search,
    Send,
    Sparkles,
    Square,
    Trash2,
    X,
} from "lucide-react";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,} from "@/components/ui/sheet";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {useToast} from "@/hooks/use-toast";
import {STORAGE_PREFIX} from "@/lib/config";
import {cn} from "@/lib/utils";
import {useChromeLanguage} from "@/lib/i18n-react";
import {type AiChatProvider, getActiveChatProvider, loadSettings, saveSettings,} from "@/lib/settings";
import {type SamplingParams, sanitizeSampling,} from "@/lib/ai-shared";
import {AiSamplingControls} from "@/components/ai-sampling-controls";
import {AiModelHelpDialog} from "@/components/ai-model-help-dialog";
import {fuzzyMatch} from "@/lib/tab-filter";
import {
    buildContextFiles,
    buildConversationMarkdown,
    type ChatMention,
    conversationExportFileName,
    countQueryMatches,
    findActiveMentionQuery,
    flattenProjectFiles,
    linkifyCitations,
    MENTION_FILE_CAP,
    parseCitationHref,
    type ProjectFileEntry,
    type ProjectTreeFolder,
    serializeMentions,
    splitOnQuery,
} from "@/lib/ai-chat-utils";

/**
 * AI Chat sidebar — a collapsible right panel that streams chat
 * completions from `/api/ai-chat` (which routes through the
 * OpenAI-compatible provider chosen in Settings → AI — the built-in
 * z-ai SDK was removed). The current file's content is sent with
 * each message as context so the assistant can answer questions about
 * the code the user is editing.
 *
 * History is persisted to localStorage under `${STORAGE_PREFIX}-ai-chat`
 * so a refresh doesn't wipe the conversation. The streaming response is
 * parsed SSE-style — each `data:` chunk contributes a token to the
 * assistant message in flight.
 *
 * UX features:
 * - Stop button (replaces Send while streaming).
 * - Retry button on failed assistant bubbles — re-sends the preceding
 * user message.
 * - Auto-scroll pauses when the user scrolls up to read history, and
 * resumes when they scroll back to the bottom.
 * - Mid-stream network errors append a `[connection lost: …]` marker
 * to the partial response (instead of replacing it).
 * - Context chip shows character count + a "truncated" badge when the
 * 6,000-char tail-slice kicks in.
 * - `pendingPrompt` prop (with a nonce) lets the parent pre-fill +
 * auto-send a question — used by the "Explain" / "Improve" buttons
 * in the code viewer to route through the integrated chat instead
 * of opening an external AI website.
 * - Tuning popover (AiSamplingControls) — temperature / top_p /
 * max_tokens knobs persisted per-app in localStorage and forwarded
 * inside the provider payload (sanitizeProvider validates them;
 * null = provider defaults, nothing sent).
 * - Conversation search — filter + <mark> highlighting over history.
 * - Export — the conversation downloads as one Markdown file (Blob
 * URL, same pattern as the run-history CSV export).
 * - Listens for the app-wide `praxis:ai-prompt` CustomEvent (the
 * Ask-AI button's integrated route for run failures dispatches it)
 * and auto-sends its `detail.text`, opening the sidebar via the
 * onOpenChange prop — no page.tsx wiring needed.
 */

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** True while an assistant message is still receiving tokens. */
    streaming?: boolean;
    /** True if this assistant message ended in an error (enables Retry). */
    error?: boolean;
    /** Unix ms — used only for sorting, not displayed. */
    ts: number;
}

interface AiChatSidebarProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Active file name (e.g. "hello.py"). Shown in the context chip. */
    fileName?: string;
    /** Active file source — sent to the model as the current context. */
    code?: string;
    /** Active folder name — also sent as context. */
    folderName?: string;
    /** A pre-filled prompt to send automatically. The parent bumps
     *  `nonce` to trigger a new send (mirrors the `insertSnippet`
     *  pattern in CodeViewer). When nonce === 0 the prop is ignored. */
    pendingPrompt?: { text: string; nonce: number } | null;
    /** Optional override for the AI Chat system prompt. Empty/undefined
     *  = use the server's built-in default. */
    systemPromptOverride?: string;
    /** Max chars of the current file sent as context. Defaults to 6000. */
    maxContextChars?: number;
    /** a file EXPLICITLY added to the AI context from
     *  the explorer ("Add file to AI context") — its content rides
     *  along every message, appended after the current file's slice. */
    extraContext?: { fileName: string; content: string } | null;
    /** — "Apply to file": every ```python block in an assistant
     * message gets an Apply button that opens a BEFORE/AFTER diff
     * against the current file; accepting calls this with the new
     * content. Nothing is written until the user accepts. */
    onApplyCode?: (newCode: string) => void;
    /** — opens the Settings dialog (the parent's handler; the helper
     *  dialog passes "ai" so it lands directly on the AI tab where
     *  the model providers are configured). */
    onOpenSettings?: (tab?: string) => void;
}

const STORAGE_KEY = `${STORAGE_PREFIX}-ai-chat`;
const MAX_HISTORY = 50;
const DEFAULT_MAX_CODE_CHARS = 6000;
/** Sampling knobs persist here (per-app — one conversation at a time,
 *  so per-conversation === per-app today). null-absent = defaults. */
const SAMPLING_STORAGE_KEY = `${STORAGE_PREFIX}-ai-sampling`;
/** Debounce for localStorage persistence (the write used
 *  to happen on every streamed token — full-history JSON.stringify per
 *  token made streaming cost O(messages × tokens × size)). */
const PERSIST_DEBOUNCE_MS = 500;
/** How many Recent rows the @ popup shows (mtime-desc, current file first). */
const MENTION_RECENT_COUNT = 6;
/** How many All-files rows the @ popup shows after fuzzy ranking. */
const MENTION_FILES_COUNT = 10;
/** Symbol fetch debounce (ms) — /api/project-symbols is a project-wide
 *  walk, so it only fires once the filter text settles. */
const MENTION_SYMBOLS_DEBOUNCE_MS = 150;

/** One symbol row from GET /api/project-symbols (the route's response
 *  shape — see its header for the full contract). */
interface ProjectSymbolEntry {
    folder: string;
    folderName: string;
    file: string;
    fileSlug: string;
    name: string;
    type: string;
    line: number;
    args?: string;
    docstring?: string;
}

/** One selectable row in the @ popup. */
interface MentionRow {
    key: string;
    group: "recent" | "files" | "symbols";
    /** Primary text — the file name, or "path ▸ name" for symbols. */
    label: string;
    /** Secondary muted text (the full project-relative path). */
    detail: string;
    /** Symbol kind badge ("function" | "class" | "method"). */
    badge?: string;
    icon: "file" | "class" | "function";
    mention: ChatMention;
}

/** Generate a cheap unique id without pulling in `uuid`. */
function newId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cap the in-session messages array at MAX_HISTORY (the
 *  array used to grow unboundedly, so per-token work scaled with the
 *  whole conversation). Oldest messages drop off, mirroring what the
 *  persistence layer already does. */
function capHistory(next: ChatMessage[]): ChatMessage[] {
    return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
}

/** Count newlines in a string for the "N lines" context chip. */
function lineCount(s: string): number {
    if (!s) return 0;
    const n = s.split("\n").length;
    return s.endsWith("\n") ? n - 1 : n;
}

export function AiChatSidebar({
                                  open,
                                  onOpenChange,
                                  fileName,
                                  code,
                                  extraContext,
                                  folderName,
                                  pendingPrompt,
                                  systemPromptOverride,
                                  maxContextChars,
                                  onApplyCode,
                                  onOpenSettings,
                              }: AiChatSidebarProps) {
    const {toast} = useToast();
    // i18n — the sidebar's chrome strings (title, composer, buttons)
    // ride the shared dictionary; `dir` flips the Sheet to the mirrored
    // side for RTL languages (physical layout adjustment, see
    // globals.css [dir="rtl"] rules for the inner mirroring).
    const {t, dir} = useChromeLanguage();

    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    // PERF: streaming-delta coalescing buffers (see applyEvent).
    const deltaBufRef = React.useRef("");
    const deltaFlushRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [input, setInput] = React.useState("");
    const [isStreaming, setIsStreaming] = React.useState(false);

    /* ─── @-mentions (repo-aware context) ─────────────────────────
     * The composer supports @file / @symbol mentions: typing "@"
     * (plus optional filter text) opens the popup (recent/open files →
     * all project files from /api/folders → project symbols from
     * /api/project-symbols, ranked with the shared fuzzyMatch scorer).
     * Selecting a row REMOVES the "@query" fragment from the textarea
     * and attaches a removable chip; on send the chips become the
     * `contextFiles` payload (capped at 5 files) + serialized "@path"/
     * "@path ▸ symbol" tags inside the outgoing message text, so the
     * history and the model both see what was referenced. */
    const [mentions, setMentions] = React.useState<ChatMention[]>([]);
    /** True after Esc dismisses the popup — re-arms on the next edit. */
    const [mentionDismissed, setMentionDismissed] = React.useState(false);
    /** Highlighted row in the popup (ArrowUp/ArrowDown/Enter). */
    const [mentionIndex, setMentionIndex] = React.useState(0);
    /** Project file list from /api/folders (fetched on first popup open —
     *  the same route the explorer tree reads). null = not loaded yet. */
    const [projectFiles, setProjectFiles] = React.useState<ProjectFileEntry[] | null>(null);
    /** Guard so a failed /api/folders fetch doesn't retry per keystroke. */
    const [filesAttempted, setFilesAttempted] = React.useState(false);
    /** Symbol hits from /api/project-symbols for the current filter text. */
    const [projectSymbols, setProjectSymbols] = React.useState<ProjectSymbolEntry[]>([]);
    const [symbolsLoading, setSymbolsLoading] = React.useState(false);

    // the pending "Apply to file" review: the code block the
    // user clicked Apply on, held until they Accept or Decline in the
    // before/after diff dialog. Nothing touches the editor before Accept.
    const [pendingApply, setPendingApply] = React.useState<{
        before: string;
        after: string;
    } | null>(null);
    const [hydrated, setHydrated] = React.useState(false);

    // ─── Sampling knobs (tuning popover) ─────────────────────────────
    // null = provider defaults (nothing sent — request body unchanged
    // from the pre-feature shape). Hydrated from localStorage and
    // re-validated with the shared server sanitizer so a stale/hand-
    // edited value can't ship out-of-bounds knobs.
    const [sampling, setSampling] = React.useState<SamplingParams | null>(null);
    React.useEffect(() => {
        try {
            const raw = window.localStorage.getItem(SAMPLING_STORAGE_KEY);
            if (raw) setSampling(sanitizeSampling(JSON.parse(raw)));
        } catch {
            /* corrupted storage — stay on provider defaults */
        }
    }, []);
    const handleSamplingChange = React.useCallback(
        (v: SamplingParams | null) => {
            setSampling(v);
            try {
                if (v == null) window.localStorage.removeItem(SAMPLING_STORAGE_KEY);
                else window.localStorage.setItem(SAMPLING_STORAGE_KEY, JSON.stringify(v));
            } catch {
                /* storage full / disabled — non-fatal */
            }
        },
        []
    );

    // ─── Conversation search ─────────────────────────────────────────
    // searchOpen reveals the input; searchQuery filters the history and
    // switches bubbles to plain-text <mark> highlighting (assistant
    // markdown is suspended while a query is active — highlighting
    // inside rendered markdown would corrupt the AST).
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const activeQuery = searchOpen ? searchQuery.trim() : "";

    // Abort controller for the in-flight stream — lets us cancel on
    // unmount, when the user clears the chat, or when they click Stop.
    const abortRef = React.useRef<AbortController | null>(null);

    // Auto-scroll anchor — keeps the latest message in view as tokens
    // arrive. We pause auto-scroll when the user scrolls away from the
    // bottom (see onScroll handler).
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const isPinnedRef = React.useRef(true);
    // The textarea ref lets us auto-focus the input when the sidebar
    // opens so the user can start typing immediately.
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    // an assistant code block's Apply button was clicked:
    // hold the before (current file) / after (the block) pair for the
    // review dialog. The editor is only touched on Accept.
    const requestApply = React.useCallback(
        (after: string) => {
            if (typeof code !== "string") {
                toast({
                    title: "Nothing to apply to",
                    description: "Open a file first — Apply replaces the active file's editor buffer.",
                });
                return;
            }
            setPendingApply({before: code, after});
        },
        [code, toast]
    );

    // Queued prompt — when a pendingPrompt arrives while a stream is
    // in flight, it's stashed here and drained when the stream
    // finishes. Declared early so the close effect can clear it.
    const queuedPromptRef = React.useRef<string | null>(null);
    // Mounted guard — the abort path in sendCore resolves after the
    // sidebar has unmounted in some flows; the setStates there are
    // harmless in React 19 but a mounted ref makes that explicit
    //
    const mountedRef = React.useRef(true);
    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);
    // Latest messages, for stable callbacks (see retryMessage).
    const messagesRef = React.useRef(messages);
    React.useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    /* ----------------------------------------------------------------
     *  Persistence — load once on mount, save on every change.
     * ---------------------------------------------------------------- */
    React.useEffect(() => {
        setHydrated(true);
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    setMessages(
                        parsed
                            .filter(
                                (m) =>
                                    m &&
                                    (m.role === "user" || m.role === "assistant") &&
                                    typeof m.content === "string"
                            )
                            .slice(-MAX_HISTORY)
                            .map((m: ChatMessage) => ({
                                id: m.id ?? newId(),
                                role: m.role,
                                content: m.content,
                                ts: m.ts ?? Date.now(),
                            }))
                    );
                }
            }
        } catch {
            /* ignore corrupted localStorage */
        }
    }, []);

    React.useEffect(() => {
        if (!hydrated) return;
        // debounced persistence. Re-schedule on every
        // messages change; the last scheduled write fires even after
        // unmount (it only touches localStorage, never setState).
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            persistTimerRef.current = null;
            try {
                // Don't persist the "streaming" / "error" flags — they're
                // meaningless on reload.
                const serializable = messages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    ts: m.ts,
                }));
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(serializable.slice(-MAX_HISTORY))
                );
            } catch {
                /* storage full / disabled — non-fatal */
            }
        }, PERSIST_DEBOUNCE_MS);
    }, [messages, hydrated]);

    // Timer ref for the debounced persistence above.
    const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    /* ----------------------------------------------------------------
  * Auto-scroll to the newest message (or streaming token), but
  * only if the user is pinned to the bottom. The user can scroll
  * up to read history without being yanked back on every token.
  * ---------------------------------------------------------------- */
    React.useEffect(() => {
        const el = scrollRef.current;
        if (!el || !isPinnedRef.current) return;
        // requestAnimationFrame so layout settles before we scroll.
        const raf = requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
        return () => cancelAnimationFrame(raf);
    }, [messages, open]);

    /* ----------------------------------------------------------------
     *  Cancel any in-flight stream when the sidebar closes.
     * ---------------------------------------------------------------- */
    React.useEffect(() => {
        if (!open) {
            abortRef.current?.abort();
            abortRef.current = null;
            isPinnedRef.current = true;
            // Clear any queued prompt so it doesn't fire when the sidebar
            // reopens later.
            queuedPromptRef.current = null;
        } else {
            // Auto-focus the input when the sidebar opens so the user can
            // start typing immediately. requestAnimationFrame waits for the
            // Sheet's open animation to lay out the textarea.
            const raf = requestAnimationFrame(() => {
                textareaRef.current?.focus();
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [open]);

    /* ----------------------------------------------------------------
     *  Cleanup on unmount.
     * ---------------------------------------------------------------- */
    React.useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    /* ----------------------------------------------------------------
  * Core send routine. Takes the user text + the history snapshot
  * to send (so Retry can re-send an old question without relying
  * on the current `messages` state).
  * ---------------------------------------------------------------- */
    const sendCore = React.useCallback(
        async (
            userText: string,
            historyForApi: Array<{ role: "user" | "assistant"; content: string }>,
            // When retrying, we drop the failed assistant bubble + the
            // preceding user message from the visible list and re-add them
            // as fresh entries so the user sees a clean retry.
            retryContext?: { failedAssistantId: string; userMessageId: string },
            // The composer's @-mention chips, reduced to the `contextFiles`
            // payload (≤ 5 files) — the server resolves each path against the
            // active project root and injects it as a line-numbered system
            // block. Retry/queued/auto-send paths pass nothing: their stored
            // message text already carries the serialized "@path" tags.
            contextFiles: ChatMention[] = []
        ) => {
            const userMsg: ChatMessage = {
                id: retryContext?.userMessageId ?? newId(),
                role: "user",
                content: userText,
                ts: Date.now(),
            };
            const assistantId = newId();
            const assistantMsg: ChatMessage = {
                id: assistantId,
                role: "assistant",
                content: "",
                streaming: true,
                ts: Date.now(),
            };

            setMessages((prev) => {
                if (retryContext) {
                    // Drop the failed bubble + the original user message —
                    // we're re-adding fresh copies below.
                    const filtered = prev.filter(
                        (m) =>
                            m.id !== retryContext.failedAssistantId &&
                            m.id !== retryContext.userMessageId
                    );
                    return capHistory([...filtered, userMsg, assistantMsg]);
                }
                return capHistory([...prev, userMsg, assistantMsg]);
            });
            setIsStreaming(true);

            const controller = new AbortController();
            abortRef.current = controller;

            // Resolve the effective context-char limit (prop override →
            // built-in default). Used both for the client-side truncation
            // here and for the truncation badge in the context chip.
            const maxChars = maxContextChars && maxContextChars > 0
                ? maxContextChars
                : DEFAULT_MAX_CODE_CHARS;

            // Truncate the code context defensively — the server does this
            // too, but keeping it client-side means the request body stays
            // small.
            const trimmedCode =
                code && code.length > maxChars
                    ? code.slice(-maxChars)
                    : code;
            // the explicitly-attached file — appended to
            // the code payload with a labeled separator so the model can
            // tell the two apart (no server-side change needed).
            let codePayload = trimmedCode;
            if (extraContext && extraContext.content.trim()) {
                const extraTail =
                    extraContext.content.length > maxChars
                        ? extraContext.content.slice(-maxChars)
                        : extraContext.content;
                codePayload = `${trimmedCode ?? ""}\n\n# ── also attached: ${extraContext.fileName} ──\n${extraTail}`;
            }

            const contextPayload: {
                fileName?: string;
                code?: string;
                folder?: string;
                systemPromptOverride?: string;
            } = {};
            if (fileName) contextPayload.fileName = fileName;
            if (folderName) contextPayload.folder = folderName;
            if (codePayload) contextPayload.code = codePayload;
            // Forward the custom system prompt (if any) so the
            // server can use it instead of the built-in default.
            if (systemPromptOverride && systemPromptOverride.trim()) {
                contextPayload.systemPromptOverride = systemPromptOverride.trim();
            }

            try {
                // Route the message through the selected chat provider
                // (Settings → AI → Chat model providers). The built-in
                // Z.AI SDK default is GONE — every provider is an
                // OpenAI-compatible endpoint (Ollama, LM Studio, vLLM,
                // llama.cpp, hosted APIs); read at send time so the sidebar's
                // Model selector applies immediately. The provider payload also
                // carries the tuning-popover sampling knobs (when set): the
                // route forwards `body.provider` to sanitizeProvider, which
                // validates + clamps them, and createChatCompletion maps them
                // onto the upstream request body. With NO provider configured
                // the request still goes out (provider omitted) — the server
                // answers with the actionable "add an OpenAI-compatible
                // provider" message and the bubble surfaces it.
                const chatProvider = getActiveChatProvider(loadSettings());
                const res = await fetch("/api/ai-chat", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        messages: historyForApi,
                        context: contextPayload,
                        ...(contextFiles.length > 0 ? {contextFiles: buildContextFiles(contextFiles)} : {}),
                        ...(chatProvider
                            ? {
                                provider: {
                                    kind: chatProvider.kind,
                                    baseUrl: chatProvider.baseUrl,
                                    apiKey: chatProvider.apiKey,
                                    model: chatProvider.model,
                                    ...(sampling ? {sampling} : {}),
                                },
                            }
                            : {}),
                    }),
                    signal: controller.signal,
                });

                if (!res.ok) {
                    const errText = await res.text().catch(() => "");
                    throw new Error(
                        errText || `Request failed with status ${res.status}`
                    );
                }
                if (!res.body) {
                    throw new Error("The AI service returned no response stream.");
                }

                // Parse the SSE stream. Each event is `data: {json}\n\n`; we
                // accumulate deltas into the assistant message in flight.
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                /** Parse and apply one complete SSE event payload (the joined
                 *  `data:` lines, with the leading space stripped). Throws on
                 *  server-sent error events so the outer catch can surface them. */
                const applyEvent = (data: string) => {
                    if (data === "[DONE]") {
                        buffer = "";
                        return true; // signal: stream done
                    }
                    // Parse first; if it's not JSON, ignore (partial chunk).
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        return false; // ignore non-JSON chunk
                    }
                    // Surface server-sent errors as real exceptions so the outer
                    // catch can toast + replace the bubble. (Previously this was
                    // wrapped in the same try/catch as JSON.parse and silently
                    // dropped.)
                    if (parsed && typeof parsed === "object" && "error" in parsed) {
                        const errMsg = (parsed as { error?: unknown }).error;
                        throw new Error(
                            typeof errMsg === "string"
                                ? errMsg
                                : "The AI service returned an error."
                        );
                    }
                    const delta: string =
                        (parsed as { choices?: Array<{ delta?: { content?: string } }> })
                            ?.choices?.[0]?.delta?.content ?? "";
                    if (delta) {
                        /* PERF: COALESCED token flush — one setMessages per SSE
                         * token re-mapped the WHOLE message list dozens of times
                         * per second (the memoized bubbles still re-diffed their
                         * props each pass). Deltas now land in a ref buffer and a
                         * single 60 ms timer applies them as ONE state update;
                         * stream end drains whatever is left. */
                        deltaBufRef.current += delta;
                        if (!deltaFlushRef.current) {
                            deltaFlushRef.current = setTimeout(() => {
                                deltaFlushRef.current = null;
                                const chunk = deltaBufRef.current;
                                if (!chunk) return;
                                deltaBufRef.current = "";
                                setMessages((prev) =>
                                    prev.map((m) =>
                                        m.id === assistantId
                                            ? {...m, content: m.content + chunk}
                                            : m
                                    )
                                );
                            }, 60);
                        }
                    }
                    return false;
                };

                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});

                    let sepIdx: number;
                    while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
                        const rawEvent = buffer.slice(0, sepIdx);
                        buffer = buffer.slice(sepIdx + 2);
                        if (!rawEvent) continue;
                        // Normalize CRLF → LF and extract `data:` lines.
                        const lines = rawEvent.replace(/\r\n/g, "\n").split("\n");
                        const dataLines = lines
                            .filter((l) => l.startsWith("data:"))
                            .map((l) => l.slice(5).replace(/^ /, ""));
                        if (dataLines.length === 0) continue;
                        const data = dataLines.join("\n");
                        if (applyEvent(data)) break;
                    }
                }

                // Flush any final partial event the upstream may have left
                // without a trailing blank line (some SDKs/proxies do this).
                const tail = buffer.trim();
                if (tail) {
                    const lines = tail.replace(/\r\n/g, "\n").split("\n");
                    const dataLines = lines
                        .filter((l) => l.startsWith("data:"))
                        .map((l) => l.slice(5).replace(/^ /, ""));
                    if (dataLines.length > 0) {
                        applyEvent(dataLines.join("\n"));
                    }
                }

                // Drain any buffered tail tokens BEFORE the done marker (the
                // coalescing timer may still hold the last <60 ms of text).
                if (deltaFlushRef.current) {
                    clearTimeout(deltaFlushRef.current);
                    deltaFlushRef.current = null;
                }
                const tailDelta = deltaBufRef.current;
                deltaBufRef.current = "";
                // Mark the assistant message as done (+ any buffered tail).
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId
                            ? {...m, streaming: false, content: m.content + tailDelta}
                            : m
                    )
                );
            } catch (err) {
                // AbortError happens when the user closes the panel, clicks
                // Stop, or clears mid-stream — don't surface that as a toast.
                if (err instanceof DOMException && err.name === "AbortError") {
                    if (mountedRef.current) {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantId
                                    ? {
                                        ...m,
                                        streaming: false,
                                        content:
                                            m.content || "_(response interrupted)_",
                                    }
                                    : m
                            )
                        );
                    }
                } else {
                    const msg =
                        err instanceof Error
                            ? err.message
                            : "Unknown error during AI chat.";
                    toast({
                        title: "AI chat error",
                        description: msg,
                        variant: "destructive",
                    });
                    // Always append a connection-lost / error marker so the user
                    // can see the response was truncated. Previously this only
                    // replaced an empty bubble, hiding the partial response the
                    // user had already seen streamed.
                    if (mountedRef.current) {
                        setMessages((prev) =>
                            prev.map((m) => {
                                if (m.id !== assistantId) return m;
                                const marker = `\n\n**[error: ${msg}]**`;
                                return {
                                    ...m,
                                    streaming: false,
                                    error: true,
                                    content:
                                        (m.content || "") + (m.content ? marker : `**Error:** ${msg}`),
                                };
                            })
                        );
                    }
                }
            } finally {
                if (mountedRef.current) setIsStreaming(false);
                abortRef.current = null;
            }
        },
        [code, fileName, folderName, extraContext, systemPromptOverride, maxContextChars, sampling, toast]
    );
    /* ----------------------------------------------------------------
     *  Send the current input as a new message.
     * ---------------------------------------------------------------- */
    const sendMessage = React.useCallback(() => {
        const text = input.trim();
        if (!text || isStreaming) return;
        // The mention chips ride along two ways: as serialized "@path" /
        // "@path ▸ symbol" tags INSIDE the outgoing message text (so the
        // stored history + the model both show what was referenced) and as
        // the structured `contextFiles` payload the server resolves + loads.
        const outgoing = serializeMentions(text, mentions);
        // honor Settings → AI → "AI Chat max messages" —
        // keep only the newest N entries client-side (the server caps at
        // AI_REQUEST_LIMITS.maxMessages regardless). Previously the setting
        // existed in the dialog but was never read anywhere.
        const cap = Math.max(1, loadSettings().aiChatMaxMessages || 50);
        const historyForApi = [...messages, {role: "user" as const, content: outgoing}]
            .slice(-cap)
            .map((m) => ({role: m.role, content: m.content}));
        setInput("");
        setMentions([]);
        setMentionDismissed(false);
        void sendCore(outgoing, historyForApi, undefined, buildContextFiles(mentions));
    }, [input, isStreaming, messages, sendCore, mentions]);

    /* ----------------------------------------------------------------
  * Retry a failed assistant message — re-sends the preceding user
  * message and drops the failed bubble.
  *
  * Reads `messages` from a ref so the callback identity is stable
  * MessageBubble is memoized on the message object,
  * and an unstable onRetry would defeat that on every render.
  * ---------------------------------------------------------------- */
    const retryMessage = React.useCallback(
        (failedAssistantId: string) => {
            if (isStreaming) return;
            // Find the failed bubble + the user message immediately before it.
            const msgs = messagesRef.current;
            const failedIdx = msgs.findIndex(
                (m) => m.id === failedAssistantId
            );
            if (failedIdx <= 0) return;
            const userMsg = msgs[failedIdx - 1];
            if (userMsg.role !== "user") return;
            // History for the API = everything before the user message,
            // capped at the configured max.
            const cap = Math.max(1, loadSettings().aiChatMaxMessages || 50);
            const historyForApi = msgs
                .slice(0, failedIdx - 1)
                .slice(-cap)
                .map((m) => ({role: m.role, content: m.content}));
            void sendCore(userMsg.content, historyForApi, {
                failedAssistantId,
                userMessageId: userMsg.id,
            });
        },
        [messagesRef, isStreaming, sendCore]
    );

    /* ----------------------------------------------------------------
     *  Stop the in-flight stream (does NOT clear history).
     * ---------------------------------------------------------------- */
    const stopStreaming = React.useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    /* ----------------------------------------------------------------
  * Handle a pending prompt from the parent (e.g. the "Explain"
  * button in the code viewer). When the nonce changes, set the
  * input + send immediately.
  *
  * If a stream is already in flight, the prompt is QUEUED (not
  * dropped) — it's sent automatically when the current stream
  * completes. This prevents the "Explain" / "Improve" click
  * from being silently lost if they click while the assistant is
  * still responding to a previous question.
  *
  * The sendCore call is deferred via a microtask so the setState
  * calls inside it don't fire synchronously in the effect body
  * (which would trip the react-hooks/set-state-in-effect rule).
  * ---------------------------------------------------------------- */
    const lastPromptNonceRef = React.useRef(0);

    React.useEffect(() => {
        if (!pendingPrompt || pendingPrompt.nonce === 0) return;
        if (pendingPrompt.nonce === lastPromptNonceRef.current) return;
        lastPromptNonceRef.current = pendingPrompt.nonce;
        const text = pendingPrompt.text.trim();
        if (!text) return;
        if (isStreaming) {
            // Queue the prompt — it'll be sent when the current stream
            // finishes (see the isStreaming transition effect below).
            queuedPromptRef.current = text;
            return;
        }
        // same configured cap on the Ask-AI auto-send path.
        const cap = Math.max(1, loadSettings().aiChatMaxMessages || 50);
        const historyForApi = [...messages, {role: "user" as const, content: text}]
            .slice(-cap)
            .map((m) => ({role: m.role, content: m.content}));
        // Defer the send out of the effect body so the setState calls
        // inside sendCore don't fire synchronously here.
        void Promise.resolve().then(() => sendCore(text, historyForApi));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingPrompt]);

    // When a stream finishes (isStreaming flips from true → false),
    // drain any queued prompt. This is a separate effect so it only
    // fires on the transition, not on every pendingPrompt change.
    const wasStreamingRef = React.useRef(false);
    React.useEffect(() => {
        const wasStreaming = wasStreamingRef.current;
        wasStreamingRef.current = isStreaming;
        if (wasStreaming && !isStreaming) {
            const queued = queuedPromptRef.current;
            queuedPromptRef.current = null;
            if (queued) {
                // configured cap on the queued-prompt drain path.
                const cap = Math.max(1, loadSettings().aiChatMaxMessages || 50);
                const historyForApi = [...messages, {role: "user" as const, content: queued}]
                    .slice(-cap)
                    .map((m) => ({role: m.role, content: m.content}));
                void Promise.resolve().then(() => sendCore(queued, historyForApi));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isStreaming]);

    const clearChat = React.useCallback(() => {
        if (isStreaming) {
            abortRef.current?.abort();
            abortRef.current = null;
            setIsStreaming(false);
        }
        // drop any queued prompt too — the drain effect
        // watches isStreaming flip false and would auto-send it into the
        // freshly emptied conversation as a ghost message.
        queuedPromptRef.current = null;
        // mention chips are per-question — clear them with the history.
        setMentions([]);
        setMentionDismissed(false);
        setMessages([]);
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
        toast({title: "Chat cleared", variant: "success"});
    }, [isStreaming, toast]);

    /* ----------------------------------------------------------------
     *  `praxis:ai-prompt` — app-wide CustomEvent that routes a question
     *  into the integrated chat. Dispatched by AskAiButton's integrated
     *  item (the run-failure "Ask AI about error" flow hands the full
     *  failure context — error text + source excerpt — to THIS sidebar
     *  instead of an external website) and usable by any surface that
     *  can't reach the sidebar's props. detail: { text: string }.
     *
     *  The sidebar opens itself through the controlled onOpenChange prop
     *  (page.tsx's setAiChatOpen) — no page.tsx change needed. While a
     *  stream is in flight the text is queued via the same mechanism
     *  pendingPrompt uses, so it drains when the current answer lands.
     * ---------------------------------------------------------------- */
    React.useEffect(() => {
        const onAiPrompt = (e: Event) => {
            const detail = (e as CustomEvent<{ text?: string }>).detail;
            const text = typeof detail?.text === "string" ? detail.text.trim() : "";
            if (!text) return;
            onOpenChange(true);
            if (isStreaming) {
                queuedPromptRef.current = text;
                return;
            }
            const cap = Math.max(1, loadSettings().aiChatMaxMessages || 50);
            const historyForApi = [
                ...messagesRef.current,
                {role: "user" as const, content: text},
            ]
                .slice(-cap)
                .map((m) => ({role: m.role, content: m.content}));
            void sendCore(text, historyForApi);
        };
        window.addEventListener("praxis:ai-prompt", onAiPrompt);
        return () => window.removeEventListener("praxis:ai-prompt", onAiPrompt);
    }, [onOpenChange, isStreaming, sendCore]);

    /* ----------------------------------------------------------------
     *  Export — download the whole conversation as one Markdown file.
     *  Same Blob-URL download pattern as the run-history CSV export:
     *  create → objectURL → temp <a download> → click → revoke.
     * ---------------------------------------------------------------- */
    const exportConversation = React.useCallback(() => {
        if (messages.length === 0) return;
        const md = buildConversationMarkdown(
            messages.map((m) => ({role: m.role, content: m.content})),
            {fileName, folderName, exportedAt: new Date()}
        );
        try {
            const blob = new Blob([md], {type: "text/markdown;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = conversationExportFileName();
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast({
                title: t("aiChatExportDone"),
                description: `${messages.length} messages · Markdown`,
                variant: "success",
            });
        } catch {
            toast({title: "Export failed", variant: "destructive"});
        }
    }, [messages, fileName, folderName, toast, t]);

    /* ----------------------------------------------------------------
     *  Search — filter the history to messages containing the query
     *  (case-insensitive) and count total matches for the result chip.
     *  Memoized so typing in the composer doesn't re-filter.
     * ---------------------------------------------------------------- */
    const searchResult = React.useMemo(() => {
        const q = activeQuery.toLowerCase();
        if (!q) return {visible: messages, matchCount: 0};
        const visible = messages.filter((m) =>
            m.content.toLowerCase().includes(q)
        );
        const matchCount = visible.reduce(
            (sum, m) => sum + countQueryMatches(m.content, activeQuery),
            0
        );
        return {visible, matchCount};
    }, [messages, activeQuery]);

    /* ----------------------------------------------------------------
     *  @-mention popup state + rows.
     *
     *  activeMention = the still-open "@filter" token in the input (see
     *  findActiveMentionQuery). The popup opens whenever it exists and the
     *  composer is usable; Esc sets mentionDismissed (re-armed by the next
     *  edit). Rows are ordered recent/open files → all project files →
     *  project symbols, each filtered + ranked with the app's shared
     *  fuzzyMatch scorer (lib/tab-filter.ts).
     * ---------------------------------------------------------------- */
    const activeMention = React.useMemo(
        () =>
            open && !isStreaming && !mentionDismissed && !searchOpen
                ? findActiveMentionQuery(input)
                : null,
        [open, isStreaming, mentionDismissed, searchOpen, input]
    );

    /** The Recent group: mtime-descending (the same ordering page.tsx's
     *  Recent Files dialog uses), with the ACTIVE file pinned first. */
    const recentMentionFiles = React.useMemo(() => {
        if (!projectFiles) return [];
        const withMtime = projectFiles.filter(
            (f) => typeof f.mtime === "number" && f.mtime > 0
        );
        const sorted = [...withMtime].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
        if (fileName) {
            const mine = sorted.filter((f) => f.name === fileName);
            if (mine.length > 0) {
                return [...mine, ...sorted.filter((f) => f.name !== fileName)].slice(
                    0,
                    MENTION_RECENT_COUNT
                );
            }
        }
        return sorted.slice(0, MENTION_RECENT_COUNT);
    }, [projectFiles, fileName]);

    const mentionRows = React.useMemo(() => {
        const rows: MentionRow[] = [];
        const q = (activeMention?.query ?? "").trim();

        for (const f of recentMentionFiles) {
            if (fuzzyMatch(q, f.path) == null) continue;
            rows.push({
                key: `recent-${f.path}`,
                group: "recent",
                label: f.name,
                detail: f.path,
                icon: "file",
                mention: {path: f.path},
            });
        }

        if (projectFiles) {
            const scored = projectFiles
                .map((f) => ({f, score: fuzzyMatch(q, f.path)}))
                .filter((x) => x.score != null)
                .sort(
                    (a, b) =>
                        (b.score ?? 0) - (a.score ?? 0) ||
                        a.f.path.localeCompare(b.f.path, "en", {sensitivity: "base"})
                )
                .slice(0, MENTION_FILES_COUNT);
            for (const {f} of scored) {
                rows.push({
                    key: `file-${f.path}`,
                    group: "files",
                    label: f.name,
                    detail: f.path,
                    icon: "file",
                    mention: {path: f.path},
                });
            }
        }

        // Symbols render as "path ▸ name (kind)" — selecting one attaches a
        // chip that resolves to the symbol's file + name server-side.
        for (const s of projectSymbols) {
            const path = `${s.folderName}/${s.file}`;
            rows.push({
                key: `sym-${s.folder}-${s.fileSlug}-${s.type}-${s.name}-${s.line}`,
                group: "symbols",
                label: `${path} ▸ ${s.name}`,
                detail: `L${s.line}`,
                badge: s.type,
                icon: s.type === "class" ? "class" : "function",
                mention: {path, symbol: s.name, kind: s.type},
            });
        }
        return rows;
    }, [activeMention, recentMentionFiles, projectFiles, projectSymbols]);

    /** Clamp the highlighted row into the current row list (the rows swap
     *  as the filter text / fetches change). */
    const mentionActiveIndex =
        mentionRows.length > 0
            ? Math.min(mentionIndex, mentionRows.length - 1)
            : 0;

    /** Attach a chip: dedup + the 5-file cap, strip the "@query" fragment
     *  the popup was filtering on, keep focus in the textarea. */
    const selectMention = React.useCallback(
        (row: MentionRow) => {
            const m = row.mention;
            const distinctPaths = new Set(mentions.map((x) => x.path));
            if (!distinctPaths.has(m.path) && distinctPaths.size >= MENTION_FILE_CAP) {
                toast({
                    title: "Context limit",
                    description: `The chat context is capped at ${MENTION_FILE_CAP} files — remove a chip first.`,
                    variant: "destructive",
                });
                return;
            }
            setMentions((prev) =>
                prev.some((x) => x.path === m.path && x.symbol === m.symbol)
                    ? prev
                    : [...prev, m]
            );
            const am = activeMention;
            if (am) {
                setInput((prev) =>
                    prev.slice(0, am.at) + prev.slice(am.at + 1 + am.query.length)
                );
            }
            setMentionIndex(0);
            setMentionDismissed(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
        },
        [mentions, activeMention, toast]
    );

    /** Remove one chip (its x button). */
    const removeMention = React.useCallback((index: number) => {
        setMentions((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // Fetch the project file list on the FIRST popup open (the /api/folders
    // route the explorer tree reads; cached for the sidebar's lifetime).
    // filesAttempted guards against re-fetching per keystroke on failure.
    React.useEffect(() => {
        if (!activeMention || projectFiles || filesAttempted) return;
        setFilesAttempted(true);
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/folders");
                const data = (await res.json()) as { folders?: ProjectTreeFolder[] };
                if (!cancelled && res.ok && Array.isArray(data.folders)) {
                    setProjectFiles(flattenProjectFiles(data.folders));
                }
            } catch {
                /* tree unavailable — the popup shows the empty hint */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeMention, projectFiles, filesAttempted]);

    // Fetch project symbols while the filter text is non-empty (the route
    // walks + parses every .py file in the project, so the call is debounced
    // and aborted when the token changes). An empty filter lists files only.
    React.useEffect(() => {
        const query = activeMention?.query.trim() ?? "";
        if (!activeMention || query.length === 0) {
            setProjectSymbols([]);
            setSymbolsLoading(false);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setSymbolsLoading(true);
            void (async () => {
                try {
                    const res = await fetch(
                        `/api/project-symbols?query=${encodeURIComponent(query)}&limit=8`,
                        {signal: controller.signal}
                    );
                    const data = (await res.json()) as {
                        ok?: boolean;
                        symbols?: ProjectSymbolEntry[];
                    };
                    if (res.ok && data.ok && Array.isArray(data.symbols)) {
                        setProjectSymbols(data.symbols.slice(0, 8));
                    }
                } catch {
                    /* aborted or offline — keep whatever was there */
                } finally {
                    setSymbolsLoading(false);
                }
            })();
        }, MENTION_SYMBOLS_DEBOUNCE_MS);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [activeMention]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // While the @ popup is open, arrows / Enter / Tab / Esc drive the
        // popup instead of the composer (Enter SELECTS, it does not send).
        if (activeMention) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) =>
                    Math.min(i + 1, Math.max(mentionRows.length - 1, 0))
                );
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => Math.max(i - 1, 0));
                return;
            }
            if (
                (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) ||
                e.key === "Tab"
            ) {
                if (mentionRows.length > 0) {
                    e.preventDefault();
                    selectMention(mentionRows[mentionActiveIndex] ?? mentionRows[0]);
                }
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setMentionDismissed(true);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            sendMessage();
        }
    };

    /** Track whether the user is pinned to the bottom of the scroll
     * area. Used to pause auto-scroll while reading history. */
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const threshold = 32; // px from bottom
        isPinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };

    // Context chip text — shows file name, line count, and a truncation
    // indicator when the context-char tail-slice kicks in.
    const effectiveMaxChars = maxContextChars && maxContextChars > 0
        ? maxContextChars
        : DEFAULT_MAX_CODE_CHARS;
    const hasContext = !!fileName || !!code;
    const codeTruncated = !!code && code.length > effectiveMaxChars;
    const mentionFileCount = new Set(mentions.map((m) => m.path)).size;
    const mentionNote =
        mentionFileCount > 0
            ? ` · @${mentionFileCount} file${mentionFileCount === 1 ? "" : "s"}`
            : "";
    const contextLabel = hasContext
        ? `Context: ${fileName ?? "untitled"} — ${lineCount(code ?? "")} lines${extraContext ? ` · attached: ${extraContext.fileName}` : ""}${mentionNote}`
        : extraContext
            ? `Context: attached ${extraContext.fileName}${mentionNote}`
            : `No file context${mentionNote}`;

    // ─── Chat provider selection ───────────────────────────────────────
    // The integrated chat routes through the provider chosen here — the
    // built-in Z.AI SDK or any OpenAI-compatible endpoint added in
    // Settings → AI (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter,
    // Z.AI's HTTP API…). The choice is persisted in the shared settings
    // store, so code completion + test generation follow it too.
    //
    // activeProviderId is local state that (a) forces a re-render right
    // after a switch (saveSettings updates the module cache but doesn't
    // notify React) and (b) re-syncs from the store each time the sidebar
    // opens — done via the render-phase "adjust state" pattern rather
    // than an effect to avoid a cascading render.
    const [activeProviderId, setActiveProviderId] = React.useState("");
    const [providerSyncedOpen, setProviderSyncedOpen] = React.useState(false);
    if (open && !providerSyncedOpen) {
        setProviderSyncedOpen(true);
        setActiveProviderId(loadSettings().aiChatProviderId);
    } else if (!open && providerSyncedOpen) {
        setProviderSyncedOpen(false);
    }
    const selectedProvider =
        typeof window === "undefined" ? null : getActiveChatProvider(loadSettings());
    const enabledProviders: AiChatProvider[] =
        typeof window === "undefined"
            ? []
            : (loadSettings().aiChatProviders ?? []).filter(
                (p) => p && p.enabled && p.id !== selectedProvider?.id
            );
    const handleProviderChange = (id: string) => {
        setActiveProviderId(id);
        const s = loadSettings();
        saveSettings({...s, aiChatProviderId: id});
        toast({
            title: "Chat provider switched",
            description: `${(s.aiChatProviders ?? []).find((p) => p.id === id)?.name ?? id}${
                (s.aiChatProviders ?? []).find((p) => p.id === id)?.model
                    ? ` · ${s.aiChatProviders.find((p) => p.id === id)?.model}`
                    : ""
            }`,
            variant: "default",
        });
    };

    /* ── MODEL READINESS PROBE. When the sidebar
  * opens (and after every provider switch), the ACTIVE provider is
  * pinged through /api/ai-test with a trivial "ping" — exactly the
  * check the Settings → AI Test button runs. A failure leaves
  * `modelUnavailable` true: the composer and Send stay DISABLED and
  * a banner links to the model-setup helper + Settings → AI. The
  * probe is skippable from Settings → AI ("Verify the model before
  * chatting") for users who prefer errors-on-send. */
    const [modelCheck, setModelCheck] = React.useState<
        | { status: "idle" }
        | { status: "checking" }
        | { status: "ok"; model?: string }
        | { status: "unavailable"; error?: string }
    >({status: "idle"});
    const modelUnavailable = modelCheck.status === "unavailable";
    const [helpOpen, setHelpOpen] = React.useState(false);

    const probeModel = React.useCallback(async (provider: AiChatProvider | null) => {
        setModelCheck({status: "checking"});
        try {
            const res = await fetch("/api/ai-test", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    provider: provider
                        ? {
                            kind: provider.kind,
                            baseUrl: provider.baseUrl,
                            apiKey: provider.apiKey,
                            model: provider.model
                        }
                        : undefined,
                }),
            });
            const data = (await res.json().catch(() => null)) as
                | { ok?: boolean; model?: string; latencyMs?: number; error?: string }
                | null;
            if (res.ok && data?.ok) {
                setModelCheck({status: "ok", model: data.model});
            } else {
                setModelCheck({status: "unavailable", error: data?.error ?? `HTTP ${res.status}`});
            }
        } catch (err) {
            setModelCheck({status: "unavailable", error: (err as Error).message});
        }
    }, []);

    // Probe when the sidebar opens (verification enabled) and after a
    // provider switch. Re-uses the provider resolved from the store so
    // the just-saved selection is what gets pinged.
    React.useEffect(() => {
        if (!open) return;
        if (loadSettings().aiChatVerifyModel === false) {
            setModelCheck({status: "idle"});
            return;
        }
        void probeModel(getActiveChatProvider(loadSettings()));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activeProviderId, probeModel]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                // RTL physical adjustment: the sheet opens from the mirrored
                // edge (left in Arabic) so the panel hugs the reading-start
                // side. The .ai-chat-sheet class carries the [dir="rtl"]
                // close-button mirror in globals.css.
                side={dir === "rtl" ? "left" : "right"}
                className="ai-chat-sheet w-full sm:w-[400px] sm:max-w-none p-0 gap-0 flex flex-col"
                aria-describedby="ai-chat-desc"
            >
                {/* pe-10 = logical padding — reserves space for the close
            button on the correct side in LTR AND RTL. */}
                <SheetHeader className="p-3 border-b shrink-0 space-y-1 pe-10">
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-purple-500 shrink-0"/>
                        <SheetTitle className="text-sm font-semibold">
                            {t("aiChatTitle")}
                        </SheetTitle>
                    </div>
                    <SheetDescription id="ai-chat-desc" className="sr-only">
                        Ask the AI assistant about your current Python file. Responses
                        stream in real time.
                    </SheetDescription>
                    {/* Context chip — shows which file (if any) is being sent as
              context with each message. Includes a "truncated" badge
              when the file exceeds the 6,000-char context limit. ms-1.5
              = logical margin (mirrors in RTL). */}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <FileCode2 className="size-3 shrink-0 text-emerald-500"/>
                        <span className="truncate" title={contextLabel}>
              {contextLabel}
                            {codeTruncated && (
                                <span
                                    className="ms-1.5 inline-flex items-center rounded bg-amber-500/15 px-1 py-px text-[9px] font-medium text-amber-700 dark:text-amber-400"
                                    title={`File is ${code?.length.toLocaleString()} chars — only the last ${effectiveMaxChars.toLocaleString()} are sent as context.`}
                                >
                  truncated
                </span>
                            )}
                            {folderName ? (
                                <span className="text-muted-foreground/70">
                  {" · "}
                                    {folderName}
                </span>
                            ) : null}
            </span>
                    </div>
                </SheetHeader>

                {/* Toolbar — chat provider selector (start) + search /
            export / clear icon buttons (end). Icon-only buttons carry
            aria-labels + the .ai-chat-icon-btn focus-ring class. */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
              Model:
            </span>
                        <Select
                            value={selectedProvider?.id ?? activeProviderId ?? ""}
                            onValueChange={handleProviderChange}
                        >
                            <SelectTrigger
                                size="sm"
                                className="h-6 max-w-[190px] text-[11px] gap-1 px-2"
                                aria-label="Chat model provider"
                                title={
                                    selectedProvider
                                        ? `${selectedProvider.name}${selectedProvider.model ? ` · ${selectedProvider.model}` : ""} — manage providers in Settings → AI`
                                        : "Manage providers in Settings → AI"
                                }
                            >
                                <SelectValue placeholder="Provider…"/>
                            </SelectTrigger>
                            <SelectContent>
                                {selectedProvider && (
                                    <SelectItem key={selectedProvider.id} value={selectedProvider.id}
                                                className="text-xs">
                                        {selectedProvider.name}
                                        {selectedProvider.model ? ` · ${selectedProvider.model}` : ""}
                                    </SelectItem>
                                )}
                                {enabledProviders.map((p) => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs">
                                        {p.name}
                                        {p.model ? ` · ${p.model}` : ""}
                                    </SelectItem>
                                ))}
                                {!selectedProvider && enabledProviders.length === 0 && (
                                    <SelectItem value="no-provider" className="text-xs" disabled>
                                        No provider — add one in Settings → AI
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                setSearchOpen((v) => !v);
                                if (searchOpen) setSearchQuery("");
                            }}
                            className={cn(
                                "size-7 text-muted-foreground hover:text-foreground ai-chat-icon-btn",
                                searchOpen && "bg-muted text-foreground"
                            )}
                            aria-label={t("aiChatSearch")}
                            aria-pressed={searchOpen}
                            title={t("aiChatSearch")}
                        >
                            <Search className="size-3.5"/>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={exportConversation}
                            disabled={messages.length === 0}
                            className="size-7 text-muted-foreground hover:text-foreground ai-chat-icon-btn"
                            aria-label={t("aiChatExport")}
                            title={t("aiChatExport")}
                        >
                            <Download className="size-3.5"/>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearChat}
                            disabled={messages.length === 0 && !isStreaming}
                            className="size-7 text-muted-foreground hover:text-foreground ai-chat-icon-btn"
                            aria-label={t("aiChatClear")}
                            title={`${t("aiChatClear")} — removes the persisted history`}
                        >
                            <Trash2 className="size-3.5"/>
                        </Button>
                    </div>
                </div>

                {/* Search row — revealed by the toolbar toggle. Filters the
            history case-insensitively; the chip counts messages and
            matches. Esc / the X button closes + resets. */}
                {searchOpen && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b shrink-0">
                        <Search className="size-3 text-muted-foreground shrink-0" aria-hidden/>
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    setSearchQuery("");
                                    setSearchOpen(false);
                                }
                            }}
                            placeholder={t("aiChatSearch")}
                            className="h-6 text-xs px-2 bg-background ai-chat-search-input"
                            aria-label={t("aiChatSearch")}
                        />
                        {activeQuery && (
                            <span
                                className="shrink-0 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                                aria-live="polite"
                            >
                {t("aiChatSearchCount")
                    .replace("{n}", String(searchResult.visible.length))
                    .replace("{m}", String(searchResult.matchCount))}
              </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                setSearchQuery("");
                                setSearchOpen(false);
                            }}
                            className="size-6 shrink-0 text-muted-foreground hover:text-foreground ai-chat-icon-btn"
                            aria-label="Close search"
                            title="Close search"
                        >
                            <X className="size-3.5"/>
                        </Button>
                    </div>
                )}

                {/* Message list — scrollable, fills available height. role=log
            + aria-live=polite announce streamed tokens to screen
            readers. While a search query is active only matching
            messages render (bubbles switch to plain-text highlighting). */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent"
                    role="log"
                    aria-live="polite"
                    aria-label="Chat messages"
                >
                    {messages.length === 0 ? (
                        <EmptyState/>
                    ) : activeQuery && searchResult.visible.length === 0 ? (
                        <p className="h-full flex items-center justify-center text-center text-xs text-muted-foreground px-6">
                            {t("aiChatSearchNoResults").replace("{q}", activeQuery)}
                        </p>
                    ) : (
                        searchResult.visible.map((m) => (
                            <MessageBubble
                                key={m.id}
                                message={m}
                                onRetry={retryMessage}
                                isStreaming={isStreaming}
                                onApply={onApplyCode ? requestApply : undefined}
                                query={activeQuery}
                            />
                        ))
                    )}
                </div>

                {/* Composer — textarea + send/stop button + the sampling
            "tuning" popover. Enter sends, Shift+Enter inserts a newline
            (configurable in Settings → AI). While streaming, the Send
            button is replaced by a Stop button. When the model probe
            failed, the composer + Send are DISABLED and the banner
            above links to the setup helper. */}
                <div className="border-t p-3 shrink-0 space-y-2 bg-background">
                    {/* Model-readiness banner — checking chip / OK chip / failed
              guard with the setup helper (the composer below stays
              disabled until a model tests OK). */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                        {modelCheck.status === "checking" && (
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin"/>
                Checking the model…
              </span>
                        )}
                        {modelCheck.status === "ok" && (
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400"
                                title={`The provider answered the pre-chat check${modelCheck.model ? ` · ${modelCheck.model}` : ""}`}
                            >
                <CircleCheck className="size-3"/>
                Model ready{modelCheck.model ? ` · ${modelCheck.model}` : ""}
              </span>
                        )}
                        {modelUnavailable && (
                            <span className="flex w-full flex-wrap items-center gap-1.5">
                <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
                  <CircleAlert className="size-3"/>
                  No AI model available
                </span>
                <Button
                    variant="link"
                    size="sm"
                    className="h-6 px-1 text-[11px]"
                    onClick={() => setHelpOpen(true)}
                    title="Open the step-by-step helper: run a local model (Ollama / LM Studio), add a hosted API, or fix the built-in provider"
                >
                  How to add a model…
                </Button>
                <Button
                    variant="link"
                    size="sm"
                    className="h-6 px-1 text-[11px]"
                    onClick={() => onOpenSettings?.("ai")}
                    title="Open the AI tab in the configs — the provider cards, quick-add presets and Test buttons live there"
                >
                  Settings → AI
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-[10px] text-muted-foreground"
                    onClick={() => void probeModel(getActiveChatProvider(loadSettings()))}
                    title="Re-run the pre-chat model check"
                >
                  <RotateCw className="size-3"/>
                  Retry
                </Button>
              </span>
                        )}
                    </div>
                    {/* Mention chips — the attached @file / @symbol context. Each
              chip is removable (its x); the whole row clears on send.
              Styling matches the model-readiness chips above
              (rounded-full border bg-muted/40 pill). */}
                    {mentions.length > 0 && (
                        <div
                            className="flex flex-wrap items-center gap-1.5"
                            aria-label="Attached AI context"
                        >
                            {mentions.map((m, i) => (
                                <span
                                    key={`${m.path}::${m.symbol ?? ""}::${i}`}
                                    className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium"
                                >
                  {m.symbol ? (
                      m.kind === "class" ? (
                          <Braces className="size-3 shrink-0 text-amber-500"/>
                      ) : (
                          <FunctionSquare className="size-3 shrink-0 text-sky-500"/>
                      )
                  ) : (
                      <FileCode2 className="size-3 shrink-0 text-emerald-500"/>
                  )}
                                    <span
                                        className="max-w-[150px] truncate"
                                        title={m.symbol ? `${m.path} ▸ ${m.symbol} (${m.kind ?? "symbol"})` : m.path}
                                    >
                    {m.symbol
                        ? `${m.path} ▸ ${m.symbol}`
                        : m.path}
                  </span>
                  <button
                      type="button"
                      onClick={() => removeMention(i)}
                      className="ms-0.5 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${m.path}${m.symbol ? ` (${m.symbol})` : ""} from the AI context`}
                      title="Remove this file from the AI context"
                  >
                    <X className="size-3"/>
                  </button>
                </span>
                            ))}
                        </div>
                    )}
                    {/* Composer + the @ popup (positioned above the textarea).
              The popup is driven entirely from the keyboard handler —
              ArrowUp/Down move, Enter/Tab select, Esc dismisses; rows
              are also clickable. */}
                    <div className="relative">
                        {activeMention && (
                            <MentionPopup
                                rows={mentionRows}
                                activeIndex={mentionActiveIndex}
                                loading={!projectFiles || symbolsLoading}
                                onSelect={selectMention}
                                onHover={setMentionIndex}
                            />
                        )}
                        <Textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                // Any edit re-arms the popup after an Esc dismissal.
                                setMentionDismissed(false);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                modelUnavailable
                                    ? "Disabled — no AI model is configured or reachable…"
                                    : isStreaming
                                        ? "AI is responding…"
                                        : loadSettings().aiChatEnterToSend !== false
                                            ? t("aiChatPlaceholder")
                                            : `${t("aiChatPlaceholder")} (Ctrl+Enter to send)`
                            }
                            disabled={isStreaming || modelUnavailable}
                            rows={3}
                            className="resize-none text-sm min-h-[72px] max-h-[160px] bg-background disabled:opacity-60"
                            aria-label="Message"
                            aria-autocomplete="list"
                            aria-expanded={!!activeMention}
                            aria-controls={activeMention ? "ai-chat-mention-list" : undefined}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        {/* Tuning popover — temperature / top_p / max_tokens. Sits
                with the composer hint because the knobs apply to the
                NEXT send from this input. */}
                        <AiSamplingControls
                            value={sampling}
                            onChange={handleSamplingChange}
                        />
                        {isStreaming ? (
                            <Button
                                size="sm"
                                onClick={stopStreaming}
                                variant="destructive"
                                className="gap-1.5 h-7"
                                title="Stop generating (keeps the partial response)"
                            >
                                <Square className="size-3.5"/>
                                {t("aiChatStop")}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={sendMessage}
                                disabled={!input.trim() || modelUnavailable}
                                className="gap-1.5 h-7"
                                title={modelUnavailable ? "Disabled until a model tests OK — see the banner above" : "Send message (Enter)"}
                            >
                                <Send className="size-3.5"/>
                                {t("aiChatSend")}
                            </Button>
                        )}
                    </div>
                </div>
            </SheetContent>
            {/* — the Apply-to-file review dialog: a line diff of
          the current file vs the assistant's code; Accept swaps the
          editor buffer (via the parent's onApplyCode), Decline closes. */}
            <ApplyDiffDialog
                pending={pendingApply}
                fileName={fileName}
                onAccept={(after) => {
                    setPendingApply(null);
                    onApplyCode?.(after);
                }}
                onDecline={() => setPendingApply(null)}
            />
            {/* The model-setup helper — opened from the readiness banner's
          "How to add a model…" link when the probe failed. */}
            <AiModelHelpDialog
                open={helpOpen}
                onOpenChange={setHelpOpen}
                providerName={selectedProvider?.name}
                error={modelCheck.status === "unavailable" ? modelCheck.error : undefined}
                onOpenAiSettings={() => onOpenSettings?.("ai")}
            />
        </Sheet>
    );
}

/* ------------------------------------------------------------------ */
/* Message bubble — user (end) vs assistant (start, markdown) */
/*  Memoized on the message object: setMessages maps and  */
/*  only replaces the identity of the message it updates, so during    */
/*  streaming only the in-flight bubble re-renders / re-parses its     */
/*  markdown instead of every bubble in the conversation.              */
/*  While `query` is set (conversation search), BOTH roles render as   */
/*  plain text with <mark> highlighting — assistant markdown is        */
/*  suspended because injecting marks into the markdown AST would      */
/*  corrupt code fences and tables. Rounded corners use LOGICAL        */
/*  utilities (rounded-ee / rounded-es) so the "tail" corner flips     */
/*  with [dir=rtl]; the .ai-chat-bubble-* classes carry extra RTL      */
/*  adjustments in globals.css.                                        */

/* ------------------------------------------------------------------ */

/** Plain-text render with search highlighting — one <mark> per hit. */
function HighlightedText({text, query}: { text: string; query: string }) {
    const segments = splitOnQuery(text, query);
    if (segments.length === 0) return null;
    return (
        <>
            {segments.map((s, i) =>
                s.hit ? (
                    <mark
                        key={i}
                        className="ai-chat-search-mark bg-amber-300/40 dark:bg-amber-400/30 text-inherit rounded-sm px-0.5"
                    >
                        {s.text}
                    </mark>
                ) : (
                    <React.Fragment key={i}>{s.text}</React.Fragment>
                )
            )}
        </>
    );
}

const MessageBubble = React.memo(function MessageBubble({
                                                            message,
                                                            onRetry,
                                                            isStreaming,
                                                            onApply,
                                                            query = "",
                                                        }: {
    message: ChatMessage;
    onRetry: (failedAssistantId: string) => void;
    isStreaming: boolean;
    /** — opens the Apply review for a code block (undefined =
     *  no file context / apply disabled → buttons hidden). */
    onApply?: (code: string) => void;
    /** Active conversation-search query ("" = normal render). */
    query?: string;
}) {
    // KaTeX loads lazily after mount (own async chunk).
    const lazyKatexPlugins = useLazyKatexPlugin();
    const isUser = message.role === "user";
    const searching = query.trim().length > 0;
    // `path:line` citations → markdown links → the citation chip button
    // (see the `a` renderer below). Memoized on the content so a
    // re-render with unchanged content (the memoized-bubble props stay
    // identical) never re-scans; during streaming the ~60 ms coalesced
    // flush re-runs the scan on the accumulated text, which is cheap for
    // message-sized strings.
    const citedMarkdown = React.useMemo(
        () => linkifyCitations(message.content),
        [message.content]
    );
    return (
        <div
            className={cn(
                "flex w-full",
                // justify-end/start are direction-relative — user bubbles
                // mirror to the left automatically in RTL.
                isUser ? "justify-end" : "justify-start"
            )}
        >
            <div
                className={cn(
                    "max-w-[90%] rounded-lg px-3 py-2 text-sm break-words",
                    isUser
                        ? "bg-primary text-primary-foreground rounded-ee-sm ai-chat-bubble-user"
                        : "bg-muted text-foreground rounded-es-sm ai-chat-bubble-assistant"
                )}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed">
                        {searching ? (
                            <HighlightedText text={message.content} query={query}/>
                        ) : (
                            message.content
                        )}
                    </p>
                ) : searching ? (
                    // Search mode: assistant bubbles become plain text + marks
                    // (markdown suspended — see the component header note).
                    <p className="whitespace-pre-wrap leading-relaxed text-xs">
                        <HighlightedText text={message.content} query={query}/>
                    </p>
                ) : (
                    <div className="ai-chat-markdown">
                        {message.content ? (
                            <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={lazyKatexPlugins}
                                components={{
                                    /* — path:line citation chips. The model is told to cite
                                       as `path:line`; linkifyCitations (pure, in
                                       ai-chat-utils) rewrites those PROSE occurrences into
                                       markdown links with the #praxis-cite/ href, which this
                                       renderer intercepts and turns into a button that
                                       dispatches the "praxis:open-file-line" CustomEvent
                                       (detail { path, line }). Code fences / inline code are
                                       never rewritten. */
                                    a: ({node: _n, href, ...p}) => {
                                        const cite =
                                            typeof href === "string" ? parseCitationHref(href) : null;
                                        if (cite) {
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        window.dispatchEvent(
                                                            new CustomEvent("praxis:open-file-line", {
                                                                detail: {path: cite.path, line: cite.line},
                                                            })
                                                        );
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px font-mono text-[0.85em] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                                                    title={`Open ${cite.path} at line ${cite.line}`}
                                                >
                                                    <FileCode2 className="size-3 shrink-0"/>
                                                    {cite.path}:{cite.line}
                                                </button>
                                            );
                                        }
                                        return (
                                            <a
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
                                                {...p}
                                            />
                                        );
                                    },
                                    h1: ({node: _n, ...p}) => (
                                        <h1
                                            className="text-base font-semibold mt-1 mb-2"
                                            {...p}
                                        />
                                    ),
                                    h2: ({node: _n, ...p}) => (
                                        <h2
                                            className="text-sm font-semibold mt-2 mb-1.5"
                                            {...p}
                                        />
                                    ),
                                    h3: ({node: _n, ...p}) => (
                                        <h3 className="text-sm font-semibold mt-1.5 mb-1" {...p} />
                                    ),
                                    p: ({node: _n, ...p}) => (
                                        <p className="leading-relaxed mb-2 last:mb-0" {...p} />
                                    ),
                                    ul: ({node: _n, ...p}) => (
                                        <ul className="list-disc ps-4 mb-2 space-y-0.5" {...p} />
                                    ),
                                    ol: ({node: _n, ...p}) => (
                                        <ol className="list-decimal ps-4 mb-2 space-y-0.5" {...p} />
                                    ),
                                    li: ({node: _n, ...p}) => <li {...p} />,
                                    code: ({
                                               node: _n,
                                               className,
                                               children,
                                               ...props
                                           }) => {
                                        const isBlock = /language-/.test(className ?? "");
                                        if (isBlock) {
                                            // python blocks get an "Apply to file"
                                            // header button that routes the block through the
                                            // before/after review dialog (never a silent write).
                                            const codeText = childrenToText(children);
                                            const canApply =
                                                !!onApply &&
                                                !message.streaming &&
                                                /language-python/.test(className ?? "") &&
                                                codeText.trim().length > 0;
                                            return (
                                                <div className="relative my-1.5">
                                                    {canApply && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onApply?.(codeText)}
                                                            // .ai-chat-code-apply carries the RTL
                                                            // mirror (right-1 → left-1) in globals.css.
                                                            className="ai-chat-code-apply absolute top-1 right-1 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-background/80 border hover:bg-accent"
                                                            title="Review this code as a diff against the current file — apply only what you accept"
                                                        >
                                                            <FileCheck2 className="size-3 text-emerald-500"/>
                                                            Apply
                                                        </button>
                                                    )}
                                                    <pre
                                                        className="bg-background/60 border rounded-md px-2.5 py-2 my-1.5 overflow-x-auto text-xs">
                            <code className="font-mono">{children}</code>
                          </pre>
                                                </div>
                                            );
                                        }
                                        return (
                                            <code
                                                className="font-mono text-[0.85em] bg-background/60 px-1 py-0.5 rounded"
                                                {...props}
                                            >
                                                {children}
                                            </code>
                                        );
                                    },
                                    pre: ({node: _n, ...p}) => (
                                        <pre {...p} className="my-1.5 overflow-x-auto"/>
                                    ),
                                    blockquote: ({node: _n, ...p}) => (
                                        <blockquote
                                            // ps-2.5 = logical padding; the border side +
                                            // its padding mirror via the [dir="rtl"] rule for
                                            // .ai-chat-markdown blockquote in globals.css.
                                            className="ai-chat-blockquote border-l-2 border-muted-foreground/30 ps-2.5 text-muted-foreground italic my-1.5"
                                            {...p}
                                        />
                                    ),
                                    hr: () => <hr className="my-2 border-muted"/>,
                                    table: ({node: _n, ...p}) => (
                                        <div className="my-2 overflow-x-auto">
                                            <table
                                                className="text-xs border-collapse"
                                                {...p}
                                            />
                                        </div>
                                    ),
                                    th: ({node: _n, ...p}) => (
                                        <th
                                            className="border border-muted px-2 py-1 text-start font-semibold"
                                            {...p}
                                        />
                                    ),
                                    td: ({node: _n, ...p}) => (
                                        <td className="border border-muted px-2 py-1" {...p} />
                                    ),
                                }}
                            >
                                {citedMarkdown}
                            </ReactMarkdown>
                        ) : (
                            <span className="text-muted-foreground italic text-xs">
                (empty response)
              </span>
                        )}
                        {message.streaming && (
                            <span
                                className="inline-block w-1.5 h-3.5 ms-0.5 align-text-bottom bg-foreground/70 animate-pulse"
                                aria-hidden
                            />
                        )}
                        {message.error && !message.streaming && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onRetry(message.id)}
                                    disabled={isStreaming}
                                    className="h-6 gap-1 px-2 text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                                    title="Re-send the previous question"
                                >
                                    <RotateCw className="size-3"/>
                                    Retry
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

/* ------------------------------------------------------------------ */
/*  Empty state — shown before the first message                       */

/* ------------------------------------------------------------------ */

function EmptyState() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-muted-foreground">
            <div className="rounded-full bg-purple-500/10 p-3 mb-3">
                <Sparkles className="size-5 text-purple-500"/>
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
                Ask the AI anything
            </p>
            <p className="text-xs leading-relaxed max-w-[260px]">
                Get explanations, debugging help, or code suggestions for the file
                you&apos;re editing. Responses stream in real time.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                <AlertCircle className="size-3"/>
                <span>Context is sent with each message</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                <AtSign className="size-3"/>
                <span>Type @ to attach files or symbols as context</span>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  @-mention popup — recent files, all project files, symbols        */

/* ------------------------------------------------------------------ */

/** Icon for one popup row (mirrors the symbol palette's colors). */
function MentionRowIcon({row}: { row: MentionRow }) {
    if (row.icon === "class") return <Braces className="size-3.5 shrink-0 text-amber-500"/>;
    if (row.icon === "function") return <FunctionSquare className="size-3.5 shrink-0 text-sky-500"/>;
    return <FileCode2 className="size-3.5 shrink-0 text-emerald-500"/>;
}

/** The small popup list above the composer. Keyboard navigation lives in
 *  the sidebar's handleKeyDown (ArrowUp/Down/Enter/Tab/Esc); rows are
 *  also clickable. onMouseDown + preventDefault keeps the textarea's
 *  focus (and the popup's open token) while clicking. */
function MentionPopup({
                          rows,
                          activeIndex,
                          loading,
                          onSelect,
                          onHover,
                      }: {
    rows: MentionRow[];
    activeIndex: number;
    loading: boolean;
    onSelect: (row: MentionRow) => void;
    onHover: (index: number) => void;
}) {
    const groups: Array<{ id: MentionRow["group"]; label: string }> = [
        {id: "recent", label: "Recent"},
        {id: "files", label: "All project files"},
        {id: "symbols", label: "Symbols"},
    ];
    return (
        <div
            id="ai-chat-mention-list"
            role="listbox"
            aria-label="Mention a file or symbol"
            className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[240px] overflow-y-auto rounded-md border bg-popover text-xs shadow-lg"
        >
            {rows.length === 0 ? (
                <p className="px-3 py-2 text-muted-foreground">
                    {loading
                        ? "Searching the project…"
                        : "No matches — keep typing, or press Esc."}
                </p>
            ) : (
                groups.map((g) => {
                    const groupRows = rows
                        .map((row, index) => ({row, index}))
                        .filter(({row}) => row.group === g.id);
                    if (groupRows.length === 0) return null;
                    return (
                        <div key={g.id}>
                            <p className="px-2.5 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                {g.label}
                            </p>
                            {groupRows.map(({row, index}) => (
                                <button
                                    key={row.key}
                                    type="button"
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        onSelect(row);
                                    }}
                                    onMouseMove={() => onHover(index)}
                                    className={cn(
                                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-start",
                                        index === activeIndex && "bg-accent"
                                    )}
                                >
                                    <MentionRowIcon row={row}/>
                                    <span className="min-w-0 flex-1 truncate font-mono">
                    {row.label}
                  </span>
                                    {row.badge && (
                                        <span className="shrink-0 text-[10px] text-muted-foreground">
                      ({row.badge})
                    </span>
                                    )}
                                    {row.detail && (
                                        <span
                                            className="shrink-0 max-w-[45%] truncate text-[10px] text-muted-foreground"
                                            title={row.detail}
                                        >
                      {row.detail}
                    </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    );
                })
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* — Apply-to-file review dialog */

/* ------------------------------------------------------------------ */

/** Flatten react-markdown code-block children (arrays of strings) into
 *  one string — the block's raw source text. */
function childrenToText(children: React.ReactNode): string {
    if (children == null) return "";
    if (typeof children === "string") return children;
    if (Array.isArray(children)) return children.map((c) => childrenToText(c)).join("");
    if (typeof children === "number") return String(children);
    // Elements (rare in code blocks) — try props.children.
    if (React.isValidElement(children)) {
        return childrenToText((children.props as { children?: React.ReactNode }).children);
    }
    return "";
}

type ApplyDiffRow =
    | { kind: "same"; text: string }
    | { kind: "del"; text: string }
    | { kind: "add"; text: string };

/** Compact LCS line diff (capped — beyond 1200 lines/side it becomes a
 *  whole-file replace, which for an Apply review is the honest view). */
function applyDiff(a: string[], b: string[]): ApplyDiffRow[] {
    if (a.length > 1200 || b.length > 1200) {
        return [
            ...a.map((l) => ({kind: "del" as const, text: l})),
            ...b.map((l) => ({kind: "add" as const, text: l})),
        ];
    }
    const n = a.length;
    const m = b.length;
    const dp = new Int32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * (m + 1) + j] =
                a[i] === b[j]
                    ? dp[(i + 1) * (m + 1) + (j + 1)] + 1
                    : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + (j + 1)]);
        }
    }
    const rows: ApplyDiffRow[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            rows.push({kind: "same", text: a[i]});
            i++;
            j++;
        } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + (j + 1)]) {
            rows.push({kind: "del", text: a[i]});
            i++;
        } else {
            rows.push({kind: "add", text: b[j]});
            j++;
        }
    }
    while (i < n) {
        rows.push({kind: "del", text: a[i]});
        i++;
    }
    while (j < m) {
        rows.push({kind: "add", text: b[j]});
        j++;
    }
    return rows;
}

/** The before/after review for "Apply to file": current file (left
 *  semantics: red −) vs the assistant's code (green +). Accept calls
 *  the parent's onApplyCode; Decline leaves everything untouched. */
function ApplyDiffDialog({
                             pending,
                             fileName,
                             onAccept,
                             onDecline,
                         }: {
    pending: { before: string; after: string } | null;
    fileName?: string;
    onAccept: (after: string) => void;
    onDecline: () => void;
}) {
    const rows = React.useMemo(
        () => (pending ? applyDiff(pending.before.split("\n"), pending.after.split("\n")) : []),
        [pending]
    );
    const added = rows.filter((r) => r.kind === "add").length;
    const removed = rows.filter((r) => r.kind === "del").length;
    const identical = pending != null && pending.before === pending.after;
    return (
        <Dialog open={pending != null} onOpenChange={(o) => {
            if (!o) onDecline();
        }}>
            <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCheck2 className="size-5 text-emerald-500"/>
                        Apply AI Code To {fileName ?? "The Current File"}
                    </DialogTitle>
                    <DialogDescription>
                        Review the diff before anything changes — Accept replaces the editor buffer
                        (the file is not written to disk until you save; ⌘Z still undoes).
                    </DialogDescription>
                </DialogHeader>
                {identical ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                        The AI&apos;s code is identical to the current file — nothing to apply.
                    </p>
                ) : (
                    <>
                        <p className="flex items-center gap-3 text-[11px] pb-2 shrink-0">
                            <span className="text-red-600 dark:text-red-400 tabular-nums">−{removed} current</span>
                            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{added} AI</span>
                        </p>
                        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border font-mono text-[11px]">
                            {rows.map((r, i) => (
                                <div
                                    key={i}
                                    className={
                                        r.kind === "add"
                                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                            : r.kind === "del"
                                                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                                : "text-muted-foreground"
                                    }
                                >
                                    <div className="flex items-start gap-2 px-2 py-px">
                    <span className="w-3 shrink-0 select-none text-muted-foreground/70">
                      {r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}
                    </span>
                                        <span className="whitespace-pre-wrap break-all min-w-0 flex-1">{r.text}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                <div className="flex items-center justify-end gap-2 pt-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={onDecline}>
                        Decline
                    </Button>
                    <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={identical}
                        onClick={() => pending && onAccept(pending.after)}
                    >
                        <FileCheck2 className="size-3.5"/>
                        Apply to editor
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
