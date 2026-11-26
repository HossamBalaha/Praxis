"use client";

/**
 * inline-ai-chat.tsx — the inline "Edit with AI" widget (item E18).
 *
 * A compact, self-contained chat card the host (CodeViewer) anchors
 * right at the editor selection (Ctrl+I). The host owns everything
 * buffer-related: it captures the selection + anchor coordinates,
 * renders this component, and routes the AI's replacement through its
 * own undoable buffer-edit path via `onApply`.
 *
 * ── Wire protocol: mirrors AiChatSidebar EXACTLY ───────────────────
 *
 * The sidebar's streaming chat call is POST /api/ai-chat with
 * { messages, context: { fileName?, code?, systemPromptOverride? },
 * provider?: { kind, baseUrl, apiKey, model, sampling? } } and an
 * OpenAI-style SSE response (`data: {json}\n\n` events carrying
 * choices[0].delta.content, terminated by `data: [DONE]\n\n`, with
 * `{"error": ...}` events for server-side failures). This component
 * reuses that exact protocol — same body shape (the system prompt
 * rides `context.systemPromptOverride` because the route drops
 * client-sent system messages), same SSE parse loop (buffer + "\n\n"
 * split + CRLF normalize + `data:` line extraction), same 60 ms
 * coalesced delta flush, same AbortController handling.
 *
 * NOTE on endpoint choice: /api/ai-completion is the NON-streaming
 * ghost-text endpoint — its contract (confirmed in
 * src/app/api/ai-completion/route.ts) is { code, cursorOffset? } in,
 * a single JSON { ok, suggestion } out, and it has no slot for a user
 * prompt. It cannot host a streaming chat, so the widget talks to
 * /api/ai-chat — the endpoint that actually implements the sidebar's
 * streaming chat protocol this component was told to reuse.
 *
 * ── Positioning ────────────────────────────────────────────────────
 *
 * The card is `position: absolute` at the host-supplied `anchor`
 * coordinates (the host's positioning context — typically a
 * `relative` wrapper around the editor). A useLayoutEffect nudge
 * keeps it inside the viewport. No portals, no fixed overlay: the
 * host keeps owning scroll/stacking.
 */

import * as React from "react";
import {
    AlertCircle,
    Check,
    Copy,
    Crosshair,
    Eye,
    EyeOff,
    GripHorizontal,
    Loader2,
    Send,
    Sparkles,
    Square,
    X,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {FileDiffPreview} from "@/components/file-diff-preview";
import {cn} from "@/lib/utils";
import {getActiveChatProvider, loadSettings} from "@/lib/settings";
import {STORAGE_PREFIX} from "@/lib/config";
import {readPersistedSampling} from "@/lib/ai-shared";
import {
    buildInlineAiContextPayload,
    buildInlineAiUserMessage,
    extractCodeBlock,
    summarizeSelection,
} from "@/lib/inline-ai";

/** Remembered drag position for the Edit-with-AI card (per browser). */
const POS_KEY = `${STORAGE_PREFIX}.inlineAiPos`;

/* ─── Props ─────────────────────────────────────────────────────── */

export interface InlineAiChatProps {
    /** Show the widget. The host toggles this (Ctrl+I / Escape / ×). */
    open: boolean;
    /** Absolute coordinates (in the host's positioning context) at
     * which to anchor the card — usually the selection's top-left. */
    anchor: { top: number; left: number } | null;
    /** File being edited (header + prompt framing). */
    fileName: string;
    /** The current editor selection ("" when the caret is collapsed).
     * When non-empty and a response completes, the Apply action
     * replaces this text with the AI's code. */
    selectedText: string;
    /** Optional surrounding-file context (the whole file or a window
     * around the selection). Sent as the sidebar's `context.code`. */
    fileContext?: string;
    /** Close the widget (Escape, ×, after Apply, …). */
    onClose: () => void;
    /** Receive the AI's replacement. The HOST owns the buffer edit +
     * undo — this component never touches the editor. */
    onApply: (replacement: string) => void;
    /** Explicit dark flag for the few inline-styled surfaces (the
     * popover/foreground tokens already follow the theme). */
    isDark: boolean;
}

/* ─── Presets ────────────────────────────────────────────────────── */

/** One-tap prompt chips — prefill the input (they do NOT auto-send:
 * the user keeps the chance to edit before Enter). */
const PRESET_PROMPTS: ReadonlyArray<{ label: string; prompt: string }> = [
    {label: "Explain", prompt: "Explain what this code does, step by step."},
    {
        label: "Refactor",
        prompt:
            "Refactor this code for clarity and idiomatic style. Return the complete revised code.",
    },
    {
        label: "Add docstring",
        prompt:
            "Add a concise docstring (and brief comments only where helpful). Return the complete revised code.",
    },
    {
        label: "Add type hints",
        prompt: "Add type hints to this code. Return the complete revised code.",
    },
    {
        label: "Fix bugs",
        prompt:
            "Find and fix any bugs in this code. Return the complete corrected code.",
    },
    {label: "Write tests", prompt: "Write pytest unit tests for this code."},
];

/** Coalesced-render window for streamed deltas (ms) — one setState
 * per tick instead of one per SSE token (same value the sidebar
 * uses). */
const DELTA_FLUSH_MS = 60;

/** Max height of the auto-growing prompt textarea (px). */
const PROMPT_MAX_HEIGHT = 132;

/** Max height of the streamed-response pane (px). */
const RESPONSE_MAX_HEIGHT = 200;

/* ─── Component ──────────────────────────────────────────────────── */

export function InlineAiChat({
                                 open,
                                 anchor,
                                 fileName,
                                 selectedText,
                                 fileContext,
                                 onClose,
                                 onApply,
                                 isDark,
                             }: InlineAiChatProps) {
    const [input, setInput] = React.useState("");
    const [response, setResponse] = React.useState("");
    const [isStreaming, setIsStreaming] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    /** Bumped on every send so an empty, finished response can show a
     * hint instead of a blank pane. */
    const [requestSeq, setRequestSeq] = React.useState(0);

    const abortRef = React.useRef<AbortController | null>(null);
    /** Streamed-but-not-yet-rendered text (the 60 ms coalescing buffer). */
    const deltaBufRef = React.useRef("");
    const deltaFlushRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = React.useRef(true);
    const wasOpenRef = React.useRef(false);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const responseRef = React.useRef<HTMLDivElement | null>(null);
    const cardRef = React.useRef<HTMLDivElement | null>(null);
    const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    /* ── Mount / unmount ─────────────────────────────────────────── */

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // Mirror the sidebar: abort in-flight streams on unmount and
            // clear the coalescing timer so nothing fires afterwards.
            abortRef.current?.abort();
            abortRef.current = null;
            if (deltaFlushRef.current) clearTimeout(deltaFlushRef.current);
            deltaFlushRef.current = null;
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = null;
        };
    }, []);

    /* ── Open / close lifecycle ──────────────────────────────────── */

    React.useEffect(() => {
        if (open) {
            if (!wasOpenRef.current) {
                // Fresh session per (re)open — a stale answer must never be
                // applied to a NEW selection.
                setInput("");
                setResponse("");
                setError(null);
                setCopied(false);
                deltaBufRef.current = "";
            }
            wasOpenRef.current = true;
            // Focus the prompt on open (rAF lets the card lay out first).
            const raf = requestAnimationFrame(() => textareaRef.current?.focus());
            return () => cancelAnimationFrame(raf);
        }
        wasOpenRef.current = false;
        // Widget closed → cancel any in-flight stream (sidebar behavior).
        abortRef.current?.abort();
        abortRef.current = null;
    }, [open]);

    /* ── Delta-flush helper ──────────────────────────────────────── */

    /** Drain the coalescing buffer into `response` right now (used at
     * stream end and in the catch paths so Stop never eats the last
     * <60 ms of text). */
    const flushDeltaBufferNow = React.useCallback(() => {
        if (deltaFlushRef.current) {
            clearTimeout(deltaFlushRef.current);
            deltaFlushRef.current = null;
        }
        const chunk = deltaBufRef.current;
        deltaBufRef.current = "";
        if (chunk && mountedRef.current) {
            setResponse((prev) => prev + chunk);
        }
    }, []);

    /* ── Send (mirrors AiChatSidebar.sendCore) ───────────────────── */

    const send = React.useCallback(
        async (promptText: string) => {
            const prompt = promptText.trim();
            // abortRef is non-null exactly while a stream is in flight.
            if (!prompt || abortRef.current) return;

            setInput("");
            setResponse("");
            setError(null);
            setCopied(false);
            setRequestSeq((n) => n + 1);
            setIsStreaming(true);

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                // Resolve the active chat provider at SEND time (Settings →
                // AI → Chat model providers) and pull the sidebar's persisted
                // tuning knobs — the provider payload carries them exactly
                // like ai-chat-sidebar.tsx does.
                const chatProvider = getActiveChatProvider(loadSettings());
                const sampling = readPersistedSampling();

                const res = await fetch("/api/ai-chat", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        messages: [
                            {
                                role: "user" as const,
                                content: buildInlineAiUserMessage({
                                    fileName,
                                    selectedText,
                                    prompt,
                                }),
                            },
                        ],
                        context: buildInlineAiContextPayload({fileName, fileContext}),
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

                // ── SSE parse loop — same shape as the sidebar's ──
                // Each event is `data: {json}\n\n`; deltas land in the 60 ms
                // coalescing buffer; `{"error": ...}` events throw so the
                // catch below can surface them inline.
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let sseBuffer = "";

                const applyEvent = (data: string): boolean => {
                    if (data === "[DONE]") {
                        sseBuffer = "";
                        return true; // stream done
                    }
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        return false; // ignore non-JSON chunk
                    }
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
                        // COALESCED flush: one setState per ~60 ms, not per token.
                        deltaBufRef.current += delta;
                        if (!deltaFlushRef.current) {
                            deltaFlushRef.current = setTimeout(() => {
                                deltaFlushRef.current = null;
                                const chunk = deltaBufRef.current;
                                if (!chunk) return;
                                deltaBufRef.current = "";
                                setResponse((prev) => prev + chunk);
                            }, DELTA_FLUSH_MS);
                        }
                    }
                    return false;
                };

                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    sseBuffer += decoder.decode(value, {stream: true});

                    let sepIdx: number;
                    while ((sepIdx = sseBuffer.indexOf("\n\n")) >= 0) {
                        const rawEvent = sseBuffer.slice(0, sepIdx);
                        sseBuffer = sseBuffer.slice(sepIdx + 2);
                        if (!rawEvent) continue;
                        // Normalize CRLF → LF and extract `data:` lines.
                        const lines = rawEvent.replace(/\r\n/g, "\n").split("\n");
                        const dataLines = lines
                            .filter((l) => l.startsWith("data:"))
                            .map((l) => l.slice(5).replace(/^ /, ""));
                        if (dataLines.length === 0) continue;
                        if (applyEvent(dataLines.join("\n"))) break;
                    }
                }

                // Flush a final partial event some SDKs/proxies leave without
                // a trailing blank line.
                const tail = sseBuffer.trim();
                if (tail) {
                    const lines = tail.replace(/\r\n/g, "\n").split("\n");
                    const dataLines = lines
                        .filter((l) => l.startsWith("data:"))
                        .map((l) => l.slice(5).replace(/^ /, ""));
                    if (dataLines.length > 0) {
                        applyEvent(dataLines.join("\n"));
                    }
                }

                // Drain the coalescing buffer before declaring completion.
                flushDeltaBufferNow();
            } catch (err) {
                // Stop / close / supersede — keep the partial response, no
                // error surface (same AbortError policy as the sidebar).
                if (err instanceof DOMException && err.name === "AbortError") {
                    flushDeltaBufferNow();
                } else {
                    const msg =
                        err instanceof Error
                            ? err.message
                            : "Unknown error during AI request.";
                    if (mountedRef.current) setError(msg);
                }
            } finally {
                if (mountedRef.current) setIsStreaming(false);
                if (abortRef.current === controller) abortRef.current = null;
            }
        },
        [fileName, selectedText, fileContext, flushDeltaBufferNow]
    );

    /* ── Auto-grow prompt textarea ───────────────────────────────── */

    const autoGrow = React.useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, PROMPT_MAX_HEIGHT)}px`;
    }, []);

    React.useEffect(() => {
        autoGrow();
    }, [input, open, autoGrow]);

    /* ── Keep the streamed response scrolled to the newest text ──── */

    React.useEffect(() => {
        const el = responseRef.current;
        if (!el) return;
        const raf = requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
        return () => cancelAnimationFrame(raf);
    }, [response, isStreaming]);

    /* ── DRAGGING — the focus-timer.tsx pattern, verbatim ─────────────
     * The header is the drag handle: pointerdown captures THE HANDLE
     * ITSELF (mouse + touch + pen — one pointer-events code path),
     * pointermove drives a `{x,y}` POSITION STATE (position: fixed
     * once moved, so the card stops riding the editor's scroll),
     * pointerup persists the drop position to localStorage
     * (`praxis.inlineAiPos`) so the card REMEMBERS where the user
     * parked it across re-opens and reloads. The position is restored
     * on mount, clamped to today's viewport, exactly like the floating
     * Focus timer. The Crosshair button in the header re-docks the
     * card at the selection anchor and forgets the position.
     *
     * The previous implementation captured the pointer on the CARD
     * ROOT while the move/up handlers lived on the HEADER — once
     * capture engaged, every pointermove was retargeted to the root,
     * so the header handlers never fired: the card wouldn't follow the
     * pointer, the drag state never cleaned up, and a later hover over
     * the header made the stuck card jitter around the cursor. */
    const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
    const headerRef = React.useRef<HTMLDivElement | null>(null);
    const dragStateRef = React.useRef<{
        pointerId: number;
        offsetX: number;
        offsetY: number;
    } | null>(null);

    /** Viewport clamp for the FIXED card — 8 px side/bottom margins,
     * and never higher than 48 px (the app header bar) so the card
     * can't park itself under the menu bar or off-screen. */
    const clampPos = React.useCallback((x: number, y: number) => {
        const el = cardRef.current;
        const w = el?.offsetWidth ?? 380;
        const h = el?.offsetHeight ?? 200;
        return {
            x: Math.max(8, Math.min(window.innerWidth - w - 8, x)),
            y: Math.max(48, Math.min(window.innerHeight - h - 8, y)),
        };
    }, []);

    // Restore the remembered position on mount (Focus-timer behavior),
    // clamped to TODAY'S viewport — the remembered position is a
    // per-browser preference, not per-open. `pos` then lives in this
    // component instance across open/close cycles; only ⌖ (re-dock)
    // returns the card to the selection anchor.
    React.useEffect(() => {
        try {
            const raw = window.localStorage.getItem(POS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as { x?: number; y?: number };
                if (typeof parsed.x === "number" && typeof parsed.y === "number") {
                    setPos(clampPos(parsed.x, parsed.y));
                }
            }
        } catch {
            /* corrupted — anchor at the selection */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep a remembered position inside the viewport on window resizes.
    React.useEffect(() => {
        if (!pos) return;
        const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y) : p));
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [pos, clampPos]);

    const persistPos = React.useCallback((p: { x: number; y: number }) => {
        try {
            window.localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
            /* storage — non-fatal */
        }
    }, []);

    const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Interactive children (the ⌖ re-dock and × close buttons) stay
        // clickable — the focus-timer closest() guard.
        if (
            (e.target as HTMLElement).closest(
                "button, input, textarea, a, [role=\"switch\"]"
            )
        )
            return;
        // Only a primary-button / contact drag.
        if (e.button !== 0) return;
        const handle = headerRef.current;
        const card = cardRef.current;
        if (!handle || !card) return;
        e.preventDefault();
        e.stopPropagation();
        // Base = current screen position (fixed mode) or the anchor's
        // absolute position (anchored mode → switching to fixed).
        const rect = card.getBoundingClientRect();
        const base = pos ?? {x: Math.round(rect.left), y: Math.round(rect.top)};
        dragStateRef.current = {
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
        setPos(base);
        // Capture on the HANDLE — the element that owns the move/up
        // handlers — so the retargeted events actually reach them.
        try {
            handle.setPointerCapture(e.pointerId);
        } catch {
            /* capture best-effort */
        }
    };

    const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const el = cardRef.current;
        if (!el) return;
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const next = {
            x: Math.max(8, Math.min(window.innerWidth - width - 8, e.clientX - drag.offsetX)),
            y: Math.max(48, Math.min(window.innerHeight - height - 8, e.clientY - drag.offsetY)),
        };
        setPos(next);
    };

    const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        try {
            headerRef.current?.releasePointerCapture(e.pointerId);
        } catch {
            /* already released */
        }
        // Persist the drop position ("the card stays where you drop it").
        setPos((prev) => {
            if (prev) persistPos(prev);
            return prev;
        });
    };

    /** Re-dock at the selection anchor and forget the remembered
     *  position (the ⌖ button in the header). */
    const redockToAnchor = () => {
        try {
            window.localStorage.removeItem(POS_KEY);
        } catch {
            /* storage — non-fatal */
        }
        setPos(null);
    };

    /* ── Viewport clamp (ANCHORED mode only) ─────────────────── */

    // The host anchors the card at the selection; if that would push it
    // past the viewport edge (long lines near the right margin), nudge
    // it back with a translate. Imperative on purpose — no extra state.
    // SKIPPED once the user has DRAGGED the card (fixed mode owns the
    // position from then on; its own clamp keeps it on screen).
    React.useLayoutEffect(() => {
        if (!open || !anchor || pos) return;
        const el = cardRef.current;
        if (!el || typeof window === "undefined") return;
        el.style.transform = "";
        const rect = el.getBoundingClientRect();
        const margin = 8;
        let dx = 0;
        let dy = 0;
        if (rect.right > window.innerWidth - margin) {
            dx = window.innerWidth - margin - rect.right;
        }
        if (rect.left + dx < margin) dx = margin - rect.left;
        if (rect.bottom > window.innerHeight - margin) {
            dy = window.innerHeight - margin - rect.bottom;
        }
        // Never nudge the card UNDER the app header bar (~48px) — only
        // the bottom edge may pull it up that far.
        if (rect.top + dy < 48) dy = 48 - rect.top;
        if (dx !== 0 || dy !== 0) {
            el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
        }
    }, [open, anchor, pos]);

    // NOTE: the drag position is NO LONGER reset on every open — it is
    // remembered per browser (Focus-timer / floating-window behavior);
    // the header's ⌖ re-dock button restores the selection anchor.

    /* ── Handlers ────────────────────────────────────────────────── */

    /** Enter = send, Shift+Enter = newline (Escape is handled at the
     * card level so it works from any focused control). IME
     * composition Enter is left alone. */
    const handlePromptKeyDown = (
        e: React.KeyboardEvent<HTMLTextAreaElement>
    ) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send(input);
        }
    };

    const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    };

    const applyPreset = (prompt: string) => {
        setInput(prompt);
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const handleStop = () => {
        abortRef.current?.abort();
    };

    const handleApply = () => {
        // Prefer the first fenced code block (the model is told to fence
        // its answer); fall back to the raw response.
        onApply(extractCodeBlock(response) ?? response);
        onClose();
    };

    const handleCopy = async () => {
        const text = extractCodeBlock(response) ?? response;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard unavailable (permissions / non-secure context) —
            // fail silently; the response text stays selectable.
            setCopied(false);
        }
    };

    /* ── Derived ─────────────────────────────────────────────────── */

    const summary = React.useMemo(
        () => summarizeSelection(selectedText),
        [selectedText]
    );

    const extracted = React.useMemo(
        () => extractCodeBlock(response),
        [response]
    );

    const hasSelection = selectedText.trim().length > 0;

    const canApply =
        !isStreaming && !error && response.trim().length > 0 && hasSelection;

    // ── Change PREVIEW (word diff of selection → AI code) ───────────
    // "Apply to selection" used to splice blindly; now the card can
    // show exactly what will change BEFORE applying (the shared
    // FileDiffPreview machinery — the same rendering the find-in-files
    // review pane uses). Toggle-able because small edits don't need a
    // wall of diff rows.
    const [previewOpen, setPreviewOpen] = React.useState(false);

    const emptyDone =
        requestSeq > 0 && !isStreaming && !error && response.trim().length === 0;

    const showResponsePane =
        isStreaming || response.length > 0 || error !== null || emptyDone;

    /* ── Render ──────────────────────────────────────────────────── */

    if (!open || !anchor) return null;

    return (
        <div
            ref={cardRef}
            role="dialog"
            aria-label={`Edit with AI — ${fileName}`}
            className={cn(
                "z-40 w-[380px] max-w-[90vw] rounded-lg border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur",
                pos ? "fixed" : "absolute"
            )}
            style={pos ? {top: pos.y, left: pos.x} : {top: anchor.top, left: anchor.left}}
            onKeyDown={handleCardKeyDown}
            // Clicks inside the card must not reach the editor underneath
            // (caret moves / outside-click dismissals belong to the host's
            // own handlers on its own surfaces only).
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Header — the DRAG HANDLE (pointer-capture ON THE HANDLE —
          mouse + touch + pen; the ⠿ grip marks it, the position
          persists per browser like the floating Focus timer, and ⌖
          re-docks the card at the selection anchor). touch-none keeps
          the browser from turning a touch-drag into a scroll. */}
            <div
                ref={headerRef}
                className={cn(
                    "flex items-center gap-1.5 border-b px-3 py-2 select-none touch-none",
                    "cursor-grab active:cursor-grabbing"
                )}
                onPointerDown={handleHeaderPointerDown}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
                onPointerCancel={handleHeaderPointerUp}
                title="Drag to move this card anywhere — the position is remembered (⌖ re-docks at the selection)"
            >
                <GripHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden/>
                <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden/>
                <span className="truncate text-xs font-semibold">
          Edit with AI — {fileName}
        </span>
                {pos && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={redockToAnchor}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label="Re-dock the card at the selection"
                        title="Re-dock at the selection (and forget the dragged position)"
                    >
                        <Crosshair className="size-3.5" aria-hidden/>
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("size-6 shrink-0", !pos && "ml-auto")}
                    onClick={onClose}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label="Close inline AI chat"
                    title="Close (Esc)"
                >
                    <X className="size-3.5" aria-hidden/>
                </Button>
            </div>

            {/* Selection context chip */}
            {summary.lineCount > 0 && (
                <div className="px-3 pt-2">
                    <div
                        className={cn(
                            "flex items-center gap-2 rounded-md border px-2 py-1",
                            isDark
                                ? "border-white/10 bg-black/25"
                                : "border-black/10 bg-black/[0.035]"
                        )}
                        title={`${summary.head}${summary.truncated ? "…" : ""} (${summary.lineCount} lines selected)`}
                    >
            <span className="truncate font-mono text-[10px] leading-4">
              {summary.head}
            </span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {summary.lineCount} {summary.lineCount === 1 ? "line" : "lines"}
            </span>
                    </div>
                </div>
            )}

            {/* Preset prompt chips */}
            <div className="flex flex-wrap gap-1 px-3 pt-2">
                {PRESET_PROMPTS.map((preset) => (
                    <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPreset(preset.prompt)}
                        className="rounded-full border bg-background/60 px-2 py-0.5 text-[10px] leading-4 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={preset.prompt}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            {/* Prompt input */}
            <div className="px-3 pt-2">
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    rows={2}
                    placeholder={
                        hasSelection
                            ? "Tell the AI what to do with the selection…"
                            : "Ask the AI about this file…"
                    }
                    aria-label="Prompt for the AI"
                    className="field-sizing-fixed min-h-[2.5rem] resize-none text-xs leading-relaxed"
                />
            </div>

            {/* Footer: hint + Send/Stop */}
            <div className="flex items-center gap-2 px-3 pb-2 pt-2">
        <span
            className="truncate text-[10px] text-muted-foreground"
            aria-hidden
        >
          Enter to send · Shift+Enter newline · Esc close
        </span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {isStreaming ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleStop}
                            aria-label="Stop generating"
                        >
                            <Square className="size-3" aria-hidden/>
                            Stop
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            onClick={() => void send(input)}
                            disabled={!input.trim()}
                            aria-label="Send prompt to the AI"
                        >
                            <Send className="size-3" aria-hidden/>
                            Send
                        </Button>
                    )}
                </div>
            </div>

            {/* Response pane */}
            {showResponsePane && (
                <div className="border-t px-3 py-2">
                    <div
                        className="mb-1 flex min-h-4 items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                        {isStreaming ? (
                            <>
                                <Loader2
                                    className="size-3 animate-spin"
                                    aria-label="Generating response"
                                />
                                <span>Generating…</span>
                            </>
                        ) : (
                            <span>{error ? "Response failed" : "Response"}</span>
                        )}
                    </div>

                    {error !== null && (
                        <div
                            role="alert"
                            aria-live="polite"
                            className="mb-1.5 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] leading-4 text-destructive"
                        >
                            <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden/>
                            <span className="break-words">{error}</span>
                        </div>
                    )}

                    {response.length > 0 && (
                        <div
                            ref={responseRef}
                            aria-busy={isStreaming}
                            className={cn(
                                "overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-2 font-mono text-[11px] leading-relaxed",
                                isDark
                                    ? "border-white/10 bg-black/30"
                                    : "border-black/10 bg-black/[0.04]"
                            )}
                            style={{maxHeight: RESPONSE_MAX_HEIGHT}}
                        >
                            {response}
                            {isStreaming && (
                                <span className="animate-pulse" aria-hidden>
                  {" ▋"}
                </span>
                            )}
                        </div>
                    )}

                    {!isStreaming && response.length === 0 && emptyDone && (
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            The model returned an empty response. Try rephrasing the prompt.
                        </p>
                    )}

                    {/* Action row — only once the stream completed AND a
              selection was provided. */}
                    {canApply && (
                        <div className="mt-2 flex items-center gap-1.5">
                            <Button
                                size="sm"
                                onClick={handleApply}
                                className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                title="Replace the selection with the AI's code (undoable in the editor)"
                            >
                                <Check className="size-3" aria-hidden/>
                                Apply to selection
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPreviewOpen((v) => !v)}
                                aria-pressed={previewOpen}
                                title="Preview the exact word-level changes Apply will make (selection → AI code)"
                            >
                                {previewOpen ? <EyeOff className="size-3" aria-hidden/> :
                                    <Eye className="size-3" aria-hidden/>}
                                {previewOpen ? "Hide" : "Preview"}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleCopy()}
                                aria-label="Copy the AI's code"
                            >
                                {copied ? (
                                    <Check className="size-3 text-emerald-600" aria-hidden/>
                                ) : (
                                    <Copy className="size-3" aria-hidden/>
                                )}
                                {copied ? "Copied" : "Copy"}
                            </Button>
                            <span className="ml-1 hidden truncate text-[10px] text-muted-foreground sm:inline">
                {extracted !== null
                    ? "applies the extracted code block"
                    : "applies the full answer"}
              </span>
                        </div>
                    )}

                    {/* The word-level preview of what Apply will change — the
              selection (old) vs the AI's code (new). Rendered inside
              the same scrollable response pane so a big diff cannot
              blow up the card's height. */}
                    {canApply && previewOpen && (
                        <div className="mt-1.5 rounded-md border bg-background/60 overflow-auto"
                             style={{maxHeight: 180}}>
                            <FileDiffPreview
                                oldContent={selectedText}
                                newContent={extracted ?? response}
                                contextLines={1}
                                className="p-1"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
