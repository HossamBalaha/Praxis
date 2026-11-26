/**
 * ai-features.test.ts — unit tests for the Section 7 AI additions in
 * src/lib/ai.ts (sampling controls, test-generation source cap,
 * per-language + suffix (FIM-style) completion prompts) and
 * src/lib/ai-chat-utils.ts (conversation search highlighting + the
 * Markdown export builder).
 *
 * The createChatCompletion request-body tests stub global fetch so
 * the "knobs actually reach the model API" claim is covered without
 * network access. The built-in z-ai SDK path was REMOVED from
 * lib/ai — the tests now cover the "no provider → actionable
 * guidance error" contract plus the OpenAI-compatible body.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    buildCompletionMessages,
    buildCompletionUserMessage,
    capSourceForPrompt,
    COMPLETION_LANGUAGE_LABELS,
    COMPLETION_LANGUAGE_PROMPTS,
    completionLanguageFromFileName,
    completionSystemPrompt,
    createChatCompletion,
    SAMPLING_BOUNDS,
    sanitizeProvider,
    sanitizeSampling,
    TEST_GENERATION_SOURCE_CAP,
    TEST_GENERATION_TRUNCATION_MARKER,
} from "@/lib/ai";
import {
    buildConversationMarkdown,
    conversationExportFileName,
    countQueryMatches,
    splitOnQuery,
} from "@/lib/ai-chat-utils";

/* ─── Sampling: sanitize + bounds ─────────────────────────────────── */

describe("SAMPLING_BOUNDS", () => {
    it("matches the plan's specified ranges", () => {
        expect(SAMPLING_BOUNDS.temperature).toEqual({min: 0, max: 2, step: 0.1});
        expect(SAMPLING_BOUNDS.topP).toEqual({min: 0, max: 1, step: 0.05});
        expect(SAMPLING_BOUNDS.maxTokens).toEqual({min: 64, max: 8192, step: 64});
    });
});

describe("sanitizeSampling", () => {
    it("passes through a valid payload unchanged", () => {
        expect(
            sanitizeSampling({temperature: 0.7, topP: 0.9, maxTokens: 1024})
        ).toEqual({temperature: 0.7, topP: 0.9, maxTokens: 1024});
    });

    it("returns null for absent / non-object payloads", () => {
        expect(sanitizeSampling(undefined)).toBeNull();
        expect(sanitizeSampling(null)).toBeNull();
        expect(sanitizeSampling("hot")).toBeNull();
        expect(sanitizeSampling(42)).toBeNull();
    });

    it("returns null when any knob is missing or non-numeric", () => {
        expect(sanitizeSampling({temperature: 0.7, topP: 0.9})).toBeNull();
        expect(
            sanitizeSampling({temperature: 0.7, topP: 0.9, maxTokens: "lots"})
        ).toBeNull();
        expect(
            sanitizeSampling({temperature: NaN, topP: 0.9, maxTokens: 512})
        ).toBeNull();
    });

    it("clamps out-of-bounds values into the bounds", () => {
        expect(
            sanitizeSampling({temperature: 99, topP: 5, maxTokens: 1})
        ).toEqual({temperature: 2, topP: 1, maxTokens: 64});
        expect(
            sanitizeSampling({temperature: -5, topP: -1, maxTokens: 999999})
        ).toEqual({temperature: 0, topP: 0, maxTokens: 8192});
    });

    it("accepts numeric strings and rounds to 2dp / int", () => {
        expect(
            sanitizeSampling({temperature: "0.678", topP: "0.914", maxTokens: "512.7"})
        ).toEqual({temperature: 0.68, topP: 0.91, maxTokens: 513});
    });
});

/* ─── Sampling rides the provider payload (sanitizeProvider) ──────── */

describe("sanitizeProvider sampling", () => {
    it("keeps valid sampling on the openai kind", () => {
        const p = sanitizeProvider({
            kind: "openai",
            baseUrl: "http://localhost:11434/v1",
            model: "llama3.2",
            sampling: {temperature: 0.3, topP: 0.8, maxTokens: 256},
        });
        expect(p).not.toBeNull();
        expect(p?.sampling).toEqual({temperature: 0.3, topP: 0.8, maxTokens: 256});
    });

    it("collapses the removed zai kind to null (the built-in SDK is gone)", () => {
        const p = sanitizeProvider({
            kind: "zai",
            model: "",
            sampling: {temperature: 1.2, topP: 1, maxTokens: 4096},
        });
        expect(p).toBeNull();
    });

    it("clamps an out-of-bounds sampling payload and drops an invalid one", () => {
        const clamped = sanitizeProvider({
            kind: "openai",
            baseUrl: "http://x:1/v1",
            model: "m",
            sampling: {temperature: 50, topP: 2, maxTokens: 1},
        });
        expect(clamped?.sampling).toEqual({temperature: 2, topP: 1, maxTokens: 64});

        const invalid = sanitizeProvider({
            kind: "openai",
            baseUrl: "http://x:1/v1",
            model: "m",
            sampling: {temperature: "nope", topP: 1, maxTokens: 512},
        });
        expect(invalid?.sampling).toBeUndefined();
    });

    it("omits the sampling key entirely when not supplied (legacy shape)", () => {
        const p = sanitizeProvider({
            kind: "openai",
            baseUrl: "http://x:1/v1",
            model: "m",
        });
        expect(p && "sampling" in p).toBe(false);
    });
});

/* ─── createChatCompletion forwards the knobs to the model API ────── */

describe("createChatCompletion sampling forwarding", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ok: true}), {status: 200})
        );
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("includes temperature / max_tokens / top_p in the endpoint body", async () => {
        await createChatCompletion(
            {
                kind: "openai",
                baseUrl: "http://localhost:11434/v1",
                apiKey: "",
                model: "llama3.2",
                sampling: {temperature: 0.4, topP: 0.95, maxTokens: 384},
            },
            {messages: [{role: "user", content: "hi"}]}
        );
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body.temperature).toBe(0.4);
        expect(body.max_tokens).toBe(384);
        expect(body.top_p).toBe(0.95);
    });

    it("sends NO sampling keys when none are set (unchanged legacy body)", async () => {
        await createChatCompletion(
            {
                kind: "openai",
                baseUrl: "http://localhost:11434/v1",
                apiKey: "",
                model: "llama3.2",
            },
            {messages: [{role: "user", content: "hi"}]}
        );
        const body = JSON.parse(
            ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body as string
        ) as Record<string, unknown>;
        expect("temperature" in body).toBe(false);
        expect("max_tokens" in body).toBe(false);
        expect("top_p" in body).toBe(false);
    });

    it("explicit opts.sampling wins over the provider-carried knobs", async () => {
        await createChatCompletion(
            {
                kind: "openai",
                baseUrl: "http://localhost:11434/v1",
                apiKey: "",
                model: "llama3.2",
                sampling: {temperature: 1, topP: 1, maxTokens: 512},
            },
            {
                messages: [{role: "user", content: "hi"}],
                sampling: {temperature: 0.1, topP: 0.5, maxTokens: 128},
            }
        );
        const body = JSON.parse(
            ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body as string
        ) as Record<string, unknown>;
        expect(body.temperature).toBe(0.1);
        expect(body.max_tokens).toBe(128);
        expect(body.top_p).toBe(0.5);
    });
});

describe("createChatCompletion with NO provider (the removed built-in)", () => {
    it("fails fast with the shared actionable guidance message", async () => {
        await expect(
            createChatCompletion(null, {
                messages: [{role: "user", content: "hi"}],
                sampling: {temperature: 0.9, topP: 0.7, maxTokens: 777},
            })
        ).rejects.toThrow(/No AI provider is configured/);
    });

    it("fails the same way for a legacy zai-shaped provider", async () => {
        await expect(
            createChatCompletion(
                // A legacy persisted shape (kind "zai") — outside the
                // SanitizedProvider type, cast on purpose.
                {kind: "zai", baseUrl: "", apiKey: "", model: ""} as unknown as Parameters<
                    typeof createChatCompletion
                >[0],
                {messages: [{role: "user", content: "hi"}]}
            )
        ).rejects.toThrow(/No AI provider is configured/);
    });
});

/* ─── Test generation: source cap ─────────────────────────────────── */

describe("capSourceForPrompt", () => {
    it("passes short sources through unchanged (identity)", () => {
        const src = "def add(a, b):\n    return a + b\n";
        expect(capSourceForPrompt(src)).toBe(src);
    });

    it("returns non-strings verbatim", () => {
        expect(capSourceForPrompt("")).toBe("");
    });

    it("caps at TEST_GENERATION_SOURCE_CAP with the truncation marker", () => {
        const src = "x".repeat(TEST_GENERATION_SOURCE_CAP + 5000);
        const capped = capSourceForPrompt(src);
        expect(capped.length).toBeLessThan(TEST_GENERATION_SOURCE_CAP + 200);
        expect(capped.startsWith("x".repeat(TEST_GENERATION_SOURCE_CAP))).toBe(true);
        expect(capped).toContain(TEST_GENERATION_TRUNCATION_MARKER);
        // The marker must tell the model the original size.
        expect(capped).toContain(`${(TEST_GENERATION_SOURCE_CAP + 5000).toLocaleString()} chars`);
    });

    it("keeps the HEAD of the file (imports), not the tail", () => {
        const src = "IMPORT_HEADER\n" + "y".repeat(9000) + "\nTAIL_MARKER";
        const capped = capSourceForPrompt(src);
        expect(capped.startsWith("IMPORT_HEADER")).toBe(true);
        expect(capped).not.toContain("TAIL_MARKER");
    });

    it("honors a custom cap", () => {
        expect(capSourceForPrompt("abcdefghij", 4)).toContain("abcd");
        expect(capSourceForPrompt("abcdefghij", 4)).toContain(
            TEST_GENERATION_TRUNCATION_MARKER
        );
    });

    it("exports the documented cap size (8000)", () => {
        expect(TEST_GENERATION_SOURCE_CAP).toBe(8000);
    });
});

/* ─── Completion prompts: language detection + per-language maps ──── */

describe("completionLanguageFromFileName", () => {
    it.each([
        ["script.py", "python"],
        ["no-extension", "python"],
        ["", "python"],
        [undefined, "python"],
        ["app.js", "javascript"],
        ["app.mjs", "javascript"],
        ["app.cjs", "javascript"],
        ["App.JS", "javascript"],
        ["main.ts", "typescript"],
        ["widget.tsx", "typescript"],
        ["analyze.R", "r"],
        ["report.Rmd", "r"],
        ["build.sh", "shell"],
        ["run.bash", "shell"],
        ["run.zsh", "shell"],
        ["solver.jl", "julia"],
        ["SignalFilter.m", "matlab"],
        ["styles.css", "python"], // unknown extension falls back
    ] as const)("%s → %s", (fileName, expected) => {
        expect(completionLanguageFromFileName(fileName)).toBe(expected);
    });
});

describe("completionSystemPrompt", () => {
    it("describes Python 3 by default", () => {
        expect(completionSystemPrompt("python")).toContain("Python 3");
        expect(completionSystemPrompt("")).toContain("Python 3");
        expect(completionSystemPrompt("klingon")).toContain("Python 3");
    });

    it("adapts to each known language", () => {
        expect(completionSystemPrompt("javascript")).toContain("JavaScript");
        expect(completionSystemPrompt("typescript")).toContain("TypeScript");
        expect(completionSystemPrompt("r")).toContain("R code");
        expect(completionSystemPrompt("shell")).toContain("shell");
        expect(completionSystemPrompt("julia")).toContain("Julia");
        expect(completionSystemPrompt("matlab")).toContain("MATLAB");
    });

    it("keeps the response contract from the original route prompt", () => {
        const p = completionSystemPrompt("python");
        expect(p).toContain("ONLY the next 1-3 lines");
        expect(p).toContain("Do not wrap in markdown fences");
    });

    it("covers every language in the prompt + label maps", () => {
        const langs = Object.keys(COMPLETION_LANGUAGE_PROMPTS);
        expect(Object.keys(COMPLETION_LANGUAGE_LABELS).sort()).toEqual(
            [...langs].sort()
        );
        for (const l of langs) {
            expect(COMPLETION_LANGUAGE_PROMPTS[l as keyof typeof COMPLETION_LANGUAGE_PROMPTS].length).toBeGreaterThan(0);
        }
    });
});

/* ─── Completion prompts: suffix (FIM-style) assembly ─────────────── */

describe("buildCompletionUserMessage", () => {
    const PREFIX = "def fib(n):\n    if n < 2:\n        return n\n";

    it("empty suffix keeps the exact legacy single-block shape", () => {
        expect(buildCompletionUserMessage(PREFIX, "", "python")).toBe(
            buildCompletionUserMessage(PREFIX, undefined, "python")
        );
        const msg = buildCompletionUserMessage(PREFIX, "", "python");
        expect(msg).toContain("Complete this Python 3 code.");
        expect(msg).toContain(PREFIX);
        expect(msg).not.toContain("CODE AFTER CURSOR");
    });

    it("whitespace-only suffix behaves like empty (unchanged)", () => {
        expect(buildCompletionUserMessage(PREFIX, "   \n  ", "python")).toBe(
            buildCompletionUserMessage(PREFIX, "", "python")
        );
    });

    it("frames the suffix under CODE AFTER CURSOR", () => {
        const suffix = "    return fib(n-1) + fib(n-2)\n";
        const msg = buildCompletionUserMessage(PREFIX, suffix, "python");
        expect(msg).toContain("CODE BEFORE CURSOR:");
        expect(msg).toContain(PREFIX);
        expect(msg).toContain("CODE AFTER CURSOR");
        expect(msg).toContain(suffix);
        expect(msg).toContain("do not repeat it");
    });

    it("tail-caps a huge suffix at 2000 chars", () => {
        const suffixHead = "HEAD_VISIBLE_NEVER" + "a".repeat(3000);
        const msg = buildCompletionUserMessage(PREFIX, suffixHead, "python");
        expect(msg).not.toContain("HEAD_VISIBLE_NEVER");
        expect(msg).toContain("a".repeat(100));
        // ~2000 suffix chars + framing — nowhere near the whole 3000+.
        expect(msg.length).toBeLessThan(PREFIX.length + 2300);
    });

    it("adapts the lead line to the language", () => {
        expect(buildCompletionUserMessage("x", "", "r")).toContain("Complete this R code.");
        expect(buildCompletionUserMessage("x", "", "javascript")).toContain(
            "Complete this JavaScript code."
        );
        expect(buildCompletionUserMessage("x", "", "typescript")).toContain(
            "Complete this TypeScript code."
        );
        expect(buildCompletionUserMessage("x", "", "shell")).toContain(
            "Complete this shell code."
        );
    });

    it("unknown language falls back to the Python lead", () => {
        expect(buildCompletionUserMessage("x", "", "cobol")).toContain(
            "Complete this Python 3 code."
        );
    });
});

describe("buildCompletionMessages", () => {
    it("returns a system + user pair", () => {
        const msgs = buildCompletionMessages({
            prefix: "print(",
            suffix: ")",
            language: "python",
        });
        expect(msgs).toHaveLength(2);
        expect(msgs[0].role).toBe("system");
        expect(msgs[1].role).toBe("user");
        expect(msgs[1].content).toContain("CODE AFTER CURSOR");
    });

    it("defaults language to python and suffix to empty", () => {
        const msgs = buildCompletionMessages({prefix: "x = 1"});
        expect(msgs[0].content).toContain("Python 3");
        expect(msgs[1].content).not.toContain("CODE AFTER CURSOR");
    });
});

/* ─── Conversation search + export (ai-chat-utils) ────────────────── */

describe("splitOnQuery", () => {
    it("returns one plain segment for an empty query", () => {
        expect(splitOnQuery("hello world", "")).toEqual([
            {text: "hello world", hit: false},
        ]);
        expect(splitOnQuery("hello world", "   ")).toEqual([
            {text: "hello world", hit: false},
        ]);
    });

    it("returns [] for empty text", () => {
        expect(splitOnQuery("", "q")).toEqual([]);
    });

    it("splits case-insensitively and marks every hit", () => {
        expect(splitOnQuery("Ada LOVES ada", "ada")).toEqual([
            {text: "Ada", hit: true},
            {text: " LOVES ", hit: false},
            {text: "ada", hit: true},
        ]);
    });

    it("needs no regex escaping — dots and parens match literally", () => {
        expect(splitOnQuery("a.b(a.b)", "(a.b)")).toEqual([
            {text: "a.b", hit: false},
            {text: "(a.b)", hit: true},
        ]);
    });

    it("handles adjacent matches as separate segments", () => {
        expect(splitOnQuery("abab", "ab")).toEqual([
            {text: "ab", hit: true},
            {text: "ab", hit: true},
        ]);
    });

    it("no match → single plain segment", () => {
        expect(splitOnQuery("abc", "z")).toEqual([{text: "abc", hit: false}]);
    });
});

describe("countQueryMatches", () => {
    it("counts case-insensitive occurrences", () => {
        // "nana" holds TWO non-overlapping "na" hits.
        expect(countQueryMatches("Na na NA nana", "na")).toBe(5);
        expect(countQueryMatches("one two three", "two")).toBe(1);
        expect(countQueryMatches("nothing here", "zz")).toBe(0);
    });

    it("returns 0 for empty query or text", () => {
        expect(countQueryMatches("abc", "")).toBe(0);
        expect(countQueryMatches("", "a")).toBe(0);
    });
});

describe("buildConversationMarkdown", () => {
    const msgs = [
        {role: "user" as const, content: "What does this do?"},
        {role: "assistant" as const, content: "It prints `hello`."},
    ];

    it("renders a header + one section per message", () => {
        const md = buildConversationMarkdown(msgs, {
            fileName: "hello.py",
            folderName: "Getting Started",
            exportedAt: new Date("2024-03-05T14:30:00Z"),
        });
        expect(md).toContain("# Praxis AI Chat Export");
        expect(md).toContain("- Folder: Getting Started");
        expect(md).toContain("- File: hello.py");
        expect(md).toContain("- Messages: 2");
        expect(md).toContain("Exported: 2024-03-05 14:30 UTC");
        expect(md).toContain("## You");
        expect(md).toContain("What does this do?");
        expect(md).toContain("## Assistant");
        expect(md).toContain("It prints `hello`.");
    });

    it("skips absent meta lines and stamps nothing for an invalid date", () => {
        const md = buildConversationMarkdown(msgs, {exportedAt: new Date("nope")});
        expect(md).not.toContain("- Folder:");
        expect(md).not.toContain("- File:");
        expect(md).not.toContain("Exported:");
    });

    it("marks empty message bodies as (empty)", () => {
        const md = buildConversationMarkdown([
            {role: "assistant", content: ""},
        ]);
        expect(md).toContain("_(empty)_");
    });
});

describe("conversationExportFileName", () => {
    it("is date-stamped with the praxis prefix", () => {
        expect(conversationExportFileName(new Date("2024-01-02T10:00:00Z"))).toBe(
            "praxis-ai-chat-2024-01-02.md"
        );
    });

    it("falls back to today for an invalid date", () => {
        expect(conversationExportFileName(new Date("nope"))).toMatch(
            /^praxis-ai-chat-\d{4}-\d{2}-\d{2}\.md$/
        );
    });
});
