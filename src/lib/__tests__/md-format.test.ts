import {describe, expect, it} from "vitest";
import {formatMarkdown, reindentMarkdown} from "@/lib/md-format";

describe("formatMarkdown", () => {
    it("strips trailing whitespace and keeps fences untouched", () => {
        const src = "# Title   \n\n```js\nconst x = 1;   \n```\ntext   \n";
        const out = formatMarkdown(src);
        expect(out).toContain("# Title\n");
        expect(out).toContain("const x = 1;   \n"); // fence interior frozen
        expect(out).toContain("text\n");
    });
    it("removes heading close sequences", () => {
        expect(formatMarkdown("## Head ##\n")).toBe("## Head\n");
    });
    it("collapses 3+ blank lines to one", () => {
        expect(formatMarkdown("a\n\n\n\n\nb\n")).toBe("a\n\nb\n");
    });
    it("puts one blank line before a heading", () => {
        expect(formatMarkdown("para\n# Head\n")).toBe("para\n\n# Head\n");
    });
});

describe("reindentMarkdown", () => {
    it("re-indents nested lists with a detected unit", () => {
        const src = "- a\n      - b\n        - c\n- d\n";
        const out = reindentMarkdown(src);
        expect(out).toBe("- a\n  - b\n    - c\n- d\n");
    });
    it("aligns soft continuations to the item content column", () => {
        const src = "- item one\n     wraps here\n";
        const out = reindentMarkdown(src);
        expect(out).toBe("- item one\n  wraps here\n");
    });
    it("freezes fenced code blocks", () => {
        const src = "- a\n\n```python\n  def f():\n      return 1\n```\n";
        expect(reindentMarkdown(src)).toBe(src);
    });
    it("dedents back to the parent level", () => {
        const src = "- a\n  - b\n- c\n";
        expect(reindentMarkdown(src)).toBe("- a\n  - b\n- c\n");
    });
});
