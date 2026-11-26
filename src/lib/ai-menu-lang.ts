/**
 * ai-menu-lang.ts — the language-aware wording for the explorer's
 * AI ▸ "Explain / Review & Improve" file prompts.
 *
 * the AI context-menu group now renders for R / Shell /
 * JS / C / Ruby files too (not just Python), but the prompt used to
 * hard-code "Explain the **Python** script …" and a ```python fence
 * for every file. These pure helpers derive the prompt NOUN ("Python
 * script", "R script", "shell script", …) and the matching markdown
 * FENCE token from the file's run language (kind/name → language id,
 * see lib/run-languages) so the prompt describes the file it quotes.
 *
 * Client-safe (pure tables, one pure function).
 */
import {runLanguageForFile} from "./run-languages";

/** Prompt noun per language id ("Explain the <noun> …"). */
const LABEL_BY_LANGUAGE: Record<string, string> = {
    python: "Python script",
    r: "R script",
    shell: "shell script",
    javascript: "JavaScript file",
    c: "C source",
    ruby: "Ruby script",
};

/** Markdown fence token per language id ("" = plain ``` fence). */
const FENCE_BY_LANGUAGE: Record<string, string> = {
    python: "python",
    r: "r",
    shell: "bash",
    javascript: "javascript",
    c: "c",
    ruby: "ruby",
};

/** The wording for a file-AI prompt: the noun for the sentence and
 *  the fence token that wraps the quoted source. Unknown languages
 *  (and unrecognized kinds) fall back to "source file" + a plain
 *  fence, so the prompt is never wrong about the language. */
export function aiPromptNounFor(
    kind: string | null | undefined,
    fileName: string
): { label: string; fence: string } {
    const language = runLanguageForFile(kind, fileName);
    return {
        label: (language ? LABEL_BY_LANGUAGE[language] : undefined) ?? "source file",
        fence: (language ? FENCE_BY_LANGUAGE[language] : undefined) ?? "",
    };
}
