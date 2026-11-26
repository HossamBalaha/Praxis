/**
 * inline-ai.test.ts — unit tests for the pure helpers behind the
 * inline AI chat widget (E18) in src/lib/inline-ai.ts.
 *
 * Covered contracts:
 * - extractCodeBlock: the FIRST fenced ``` block of a model answer is
 *   what "Apply to selection" drops into the buffer — fenced python,
 *   fenced no-language, no fence (→ null), multiple fences (first
 *   wins), fence with leading prose, plus the real-world edges
 *   (indentation preserved, interrupted/unterminated fences, inline
 *   backticks in prose, CRLF, empty bodies).
 * - buildInlineAiUserMessage: file name + fenced selection + TASK
 *   prompt framing, selection truncation, no-selection shape.
 * - buildInlineAiContextPayload: the sidebar-compatible `context`
 *   body key (empty fields omitted, tail-capped file context).
 * - summarizeSelection: the context-chip label (head + line count).
 *
 * Pure string logic — plain node vitest environment, no DOM.
 */
import {describe, expect, it} from "vitest";
import {
    buildInlineAiContextPayload,
    buildInlineAiUserMessage,
    extractCodeBlock,
    INLINE_AI_FILE_CONTEXT_CAP,
    INLINE_AI_SELECTION_CAP,
    INLINE_AI_SELECTION_TRUNCATION_MARKER,
    INLINE_AI_SYSTEM_PROMPT,
    summarizeSelection,
} from "@/lib/inline-ai";

/* ─── extractCodeBlock ───────────────────────────────────────────── */

describe("extractCodeBlock", () => {
    it("extracts a fenced python block", () => {
        const answer =
            "```python\ndef add(a, b):\n    return a + b\n```";
        expect(extractCodeBlock(answer)).toBe("def add(a, b):\n    return a + b");
    });

    it("extracts a fenced block with no language tag", () => {
        const answer = "```\nx = 1\ny = 2\n```";
        expect(extractCodeBlock(answer)).toBe("x = 1\ny = 2");
    });

    it("returns null when there is no fence", () => {
        expect(extractCodeBlock("def foo():\n    pass")).toBeNull();
        expect(extractCodeBlock("Just an explanation, no code.")).toBeNull();
        expect(extractCodeBlock("")).toBeNull();
    });

    it("keeps only the FIRST of multiple fences", () => {
        const answer =
            "```python\nfirst = 1\n```\n\nSome prose.\n\n```python\nsecond = 2\n```";
        expect(extractCodeBlock(answer)).toBe("first = 1");
    });

    it("skips leading prose before the fence", () => {
        const answer =
            "Sure! Here's the fixed version:\n\n```python\ndef add(a: int, b: int) -> int:\n    return a + b\n```\n\nThis adds type hints.";
        expect(extractCodeBlock(answer)).toBe(
            "def add(a: int, b: int) -> int:\n    return a + b"
        );
    });

    it("ignores trailing prose after the closing fence", () => {
        const answer = "```python\ncode = True\n```\nHope that helps!";
        expect(extractCodeBlock(answer)).toBe("code = True");
    });

    it("preserves the first line's indentation", () => {
        const answer = "```python\n    def inner():\n        pass\n```";
        expect(extractCodeBlock(answer)).toBe("    def inner():\n        pass");
    });

    it("accepts any info string (js, py, text, trailing spaces)", () => {
        expect(extractCodeBlock("```js\nconst x = 1;\n```")).toBe("const x = 1;");
        expect(extractCodeBlock("```py\nx = 1\n```")).toBe("x = 1");
        expect(extractCodeBlock("```text\nplain\n```")).toBe("plain");
        expect(extractCodeBlock("```python  \nx = 1\n```")).toBe("x = 1");
    });

    it("returns the partial body of an unterminated fence (interrupted stream)", () => {
        const partial = "```python\ndef add(a, b):\n    return a + b";
        expect(extractCodeBlock(partial)).toBe("def add(a, b):\n    return a + b");
    });

    it("returns null for a fence with an empty body", () => {
        expect(extractCodeBlock("```python\n```")).toBeNull();
        expect(extractCodeBlock("```python\n```\nmore prose")).toBeNull();
        expect(extractCodeBlock("Here: ```python")).toBeNull();
    });

    it("does not match inline triple backticks inside prose", () => {
        const prose = "Use ``` fences in your answer, not inline mentions.";
        expect(extractCodeBlock(prose)).toBeNull();
    });

    it("normalizes CRLF inside the extracted code", () => {
        const answer = "```python\r\nx = 1\r\ny = 2\r\n```";
        expect(extractCodeBlock(answer)).toBe("x = 1\ny = 2");
    });

    it("drops blank lines directly after the opening fence", () => {
        const answer = "```python\n\ncode = 1\n```";
        expect(extractCodeBlock(answer)).toBe("code = 1");
    });
});

/* ─── buildInlineAiUserMessage ───────────────────────────────────── */

describe("buildInlineAiUserMessage", () => {
    it("includes the file name, the fenced selection and the TASK prompt", () => {
        const msg = buildInlineAiUserMessage({
            fileName: "analysis.py",
            selectedText: "def add(a, b):\n    return a + b",
            prompt: "add type hints",
        });
        expect(msg).toContain("File: analysis.py");
        expect(msg).toContain("```python\ndef add(a, b):\n    return a + b\n```");
        expect(msg).toContain("TASK: add type hints");
    });

    it("fences with the language guessed from the file name", () => {
        const msg = buildInlineAiUserMessage({
            fileName: "utils.js",
            selectedText: "const x = 1;",
            prompt: "use let",
        });
        expect(msg).toContain("```javascript\nconst x = 1;\n```");
    });

    it("omits the selection block when nothing is selected", () => {
        const msg = buildInlineAiUserMessage({
            fileName: "analysis.py",
            selectedText: "",
            prompt: "explain the file",
        });
        expect(msg).toContain("File: analysis.py");
        expect(msg).toContain("TASK: explain the file");
        expect(msg).not.toContain("SELECTED CODE");
        expect(msg).not.toContain("```python");
    });

    it("caps an oversized selection with the truncation marker", () => {
        const huge = "x = 1\n".repeat(1500); // 9000 chars
        const msg = buildInlineAiUserMessage({
            fileName: "big.py",
            selectedText: huge,
            prompt: "refactor",
        });
        expect(msg).toContain(INLINE_AI_SELECTION_TRUNCATION_MARKER);
        // Selection head + marker stays inside the server's 8000-char
        // per-message budget (AI_REQUEST_LIMITS.maxMessageContentChars).
        expect(msg.length).toBeLessThan(8000);
        expect(msg).toContain("TASK: refactor");
    });

    it("never lets the selection exceed the cap", () => {
        const msg = buildInlineAiUserMessage({
            fileName: "big.py",
            selectedText: "a".repeat(INLINE_AI_SELECTION_CAP + 5000),
            prompt: "p",
        });
        expect(msg.length).toBeLessThan(INLINE_AI_SELECTION_CAP + 500);
    });
});

/* ─── buildInlineAiContextPayload ────────────────────────────────── */

describe("buildInlineAiContextPayload", () => {
    it("always carries the code-editing system prompt override", () => {
        const payload = buildInlineAiContextPayload({
            fileName: "analysis.py",
        });
        expect(payload.systemPromptOverride).toBe(INLINE_AI_SYSTEM_PROMPT);
        expect(payload.systemPromptOverride).toContain(
            "You are a code editing assistant"
        );
    });

    it("includes the file name and context code when present", () => {
        const payload = buildInlineAiContextPayload({
            fileName: "analysis.py",
            fileContext: "import os\n\ndef run():\n    pass\n",
        });
        expect(payload.fileName).toBe("analysis.py");
        expect(payload.code).toBe("import os\n\ndef run():\n    pass\n");
    });

    it("omits empty file context (no stray code key)", () => {
        const payload = buildInlineAiContextPayload({
            fileName: "analysis.py",
            fileContext: "   \n  ",
        });
        expect(payload).not.toHaveProperty("code");
        expect(payload.fileName).toBe("analysis.py");
    });

    it("tail-caps oversized file context like the sidebar/server do", () => {
        const huge = "y".repeat(INLINE_AI_FILE_CONTEXT_CAP + 3000);
        const payload = buildInlineAiContextPayload({
            fileName: "big.py",
            fileContext: huge,
        });
        expect(payload.code).toBe(huge.slice(-INLINE_AI_FILE_CONTEXT_CAP));
        expect(payload.code!.length).toBe(INLINE_AI_FILE_CONTEXT_CAP);
    });
});

/* ─── summarizeSelection ─────────────────────────────────────────── */

describe("summarizeSelection", () => {
    it("returns an empty summary for an empty selection", () => {
        expect(summarizeSelection("")).toEqual({
            head: "",
            lineCount: 0,
            truncated: false,
        });
        expect(summarizeSelection("   \n  ").lineCount).toBe(0);
    });

    it("summarizes a short single-line selection", () => {
        const s = summarizeSelection("x = compute(1)");
        expect(s.head).toBe("x = compute(1)");
        expect(s.lineCount).toBe(1);
        expect(s.truncated).toBe(false);
    });

    it("counts the lines of a multiline selection", () => {
        const s = summarizeSelection("def a():\n    pass\ndef b():\n    pass");
        expect(s.lineCount).toBe(4);
    });

    it("cuts the head at ~40 chars with an ellipsis", () => {
        const long = "def very_long_function_name(argument_one, argument_two):";
        const s = summarizeSelection(long, 40);
        expect(s.truncated).toBe(true);
        expect(s.head.endsWith("…")).toBe(true);
        expect(s.head.length).toBeLessThanOrEqual(41);
    });

    it("collapses internal whitespace in the head", () => {
        const s = summarizeSelection("def  foo():\n    return   1");
        expect(s.head.startsWith("def foo(): return 1".slice(0, 10))).toBe(true);
        expect(s.head).not.toMatch(/\n/);
    });
});
