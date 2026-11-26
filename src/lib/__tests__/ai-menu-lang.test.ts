/**
 * ai-menu-lang tests — the language-aware prompt wording for the
 * explorer's AI ▸ Explain / Review & Improve file actions (see
 * components/folder-tree.tsx handleAiOnFile).
 *
 * The AI menu group renders for R / Shell / JS / C / Ruby files too,
 * so the prompt noun ("Explain the R script …") and the markdown
 * fence that wraps the quoted source must follow the file's language
 * instead of the old hard-coded "Python script" + ```python.
 */
import {describe, expect, it} from "vitest";
import {aiPromptNounFor} from "../ai-menu-lang";

describe("aiPromptNounFor — label + fence per file language", () => {
    it("python kind → Python script + python fence", () => {
        expect(aiPromptNounFor("python", "HelloPraxis.py")).toEqual({
            label: "Python script",
            fence: "python",
        });
    });

    it("r / shell / javascript / c / ruby kinds → matching noun + fence", () => {
        expect(aiPromptNounFor("r", "analyze.R")).toEqual({label: "R script", fence: "r"});
        expect(aiPromptNounFor("shell", "backup.sh")).toEqual({label: "shell script", fence: "bash"});
        expect(aiPromptNounFor("javascript", "HelloNode.js")).toEqual({
            label: "JavaScript file",
            fence: "javascript",
        });
        expect(aiPromptNounFor("c", "quicksort.c")).toEqual({label: "C source", fence: "c"});
        expect(aiPromptNounFor("ruby", "fetch.rb")).toEqual({label: "Ruby script", fence: "ruby"});
    });

    it("legacy .py entries with NO kind still resolve via the name fallback", () => {
        expect(aiPromptNounFor(null, "RootLevelScript.py")).toEqual({
            label: "Python script",
            fence: "python",
        });
        expect(aiPromptNounFor(undefined, "tool.pyw")).toEqual({
            label: "Python script",
            fence: "python",
        });
    });

    it("runnable but unmapped kinds (java, go, …) fall back to a generic source file + plain fence", () => {
        expect(aiPromptNounFor("java", "Fib.java")).toEqual({label: "source file", fence: ""});
        expect(aiPromptNounFor("go", "main.go")).toEqual({label: "source file", fence: ""});
    });

    it("unrecognized kind/name falls back to a generic source file + plain fence", () => {
        expect(aiPromptNounFor(null, "Notes.txt")).toEqual({label: "source file", fence: ""});
        expect(aiPromptNounFor(undefined, "")).toEqual({label: "source file", fence: ""});
    });
});
