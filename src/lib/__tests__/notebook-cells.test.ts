/**
 * Unit tests for # %% notebook-cell parsing
 * (src/lib/notebook-cells.ts) — extracted from code-viewer.tsx.
 */
import {describe, expect, it} from "vitest";
import {isCellMarker, parseCells} from "@/lib/notebook-cells";

describe("isCellMarker", () => {
    it("accepts the # %% family (any spacing/case)", () => {
        expect(isCellMarker("# %%")).toBe(true);
        expect(isCellMarker("#%%")).toBe(true);
        expect(isCellMarker("   #  %%  markdown-ish")).toBe(true);
        expect(isCellMarker("# %% [markdown]")).toBe(true);
        expect(isCellMarker("# %%[MARKDOWN]")).toBe(true);
    });

    it("rejects ordinary comments and code", () => {
        expect(isCellMarker("# comment")).toBe(false);
        expect(isCellMarker("# %")).toBe(false);
        expect(isCellMarker("x = 1")).toBe(false);
        expect(isCellMarker("")).toBe(false);
    });
});

describe("parseCells", () => {
    it("splits on # %% markers (startLine = the marker's own 1-based line)", () => {
        const src = "# %%\na = 1\nb = 2\n# %%\nprint(a)\n";
        const cells = parseCells(src);
        expect(cells).toHaveLength(2);
        expect(cells[0]).toMatchObject({startLine: 1, endLine: 3, type: "code"});
        expect(cells[0].source).toBe("a = 1\nb = 2");
        // The final cell's endLine counts the phantom row the trailing
        // newline creates (original behavior, preserved).
        expect(cells[1]).toMatchObject({startLine: 4, endLine: 6, type: "code"});
        expect(cells[1].source).toBe("print(a)\n");
    });

    it("marks [markdown] cells", () => {
        const src = "# %% [markdown]\n# # Title\n# Body text\n";
        const cells = parseCells(src);
        expect(cells).toHaveLength(1);
        expect(cells[0].type).toBe("markdown");
        expect(cells[0].source).toBe("# # Title\n# Body text\n");
    });

    it("treats content before the first marker as its own leading code cell", () => {
        const src = "import os\nx = 1\n# %%\ny = 2\n";
        const cells = parseCells(src);
        // THREE cells: the leading block, a degenerate empty cell the
        // marker re-scan emits (original quirk, preserved), and the
        // marker's own cell.
        expect(cells).toHaveLength(3);
        expect(cells[0]).toMatchObject({startLine: 1, endLine: 2, type: "code"});
        expect(cells[0].source).toBe("import os\nx = 1");
        expect(cells[1]).toMatchObject({startLine: 3, endLine: 2, source: ""});
        expect(cells[2]).toMatchObject({startLine: 3, endLine: 5});
        expect(cells[2].source).toBe("y = 2\n");
    });

    it("drops an all-blank leading region (no phantom first cell)", () => {
        const src = "\n\n# %%\nx = 1\n";
        const cells = parseCells(src);
        // The degenerate re-scan cell + the real marker cell.
        expect(cells).toHaveLength(2);
        expect(cells[0]).toMatchObject({startLine: 3, endLine: 2, source: ""});
        expect(cells[1]).toMatchObject({startLine: 3, endLine: 5});
    });

    it("returns one whole-file code cell for marker-less files with content", () => {
        const src = "a = 1\nb = 2\n";
        const cells = parseCells(src);
        expect(cells).toHaveLength(1);
        expect(cells[0]).toMatchObject({startLine: 1, endLine: 3, type: "code", source: "a = 1\nb = 2\n"});
    });

    it("returns no cells for an empty file", () => {
        expect(parseCells("")).toEqual([]);
        expect(parseCells("\n\n")).toEqual([]);
    });

    it("derives the heading from the first prose line (comments skipped)", () => {
        const src = "# %%\n# a comment\nreal heading line here\nx = 1\n";
        const cells = parseCells(src);
        expect(cells[0].heading).toBe("real heading line here");
    });

    it("caps the heading at 80 chars", () => {
        const long = "h".repeat(120);
        const cells = parseCells(`# %%\n${long}\n`);
        expect(cells[0].heading).toHaveLength(80);
    });

    it("lets the heading scan skip the NEXT cell marker (comments skipped too)", () => {
        const src = "# %%\n# %%\nx = 1\n";
        const cells = parseCells(src);
        expect(cells).toHaveLength(2);
        // The empty first cell's heading lookup skips the marker line and
        // finds the next cell's prose (original behavior, preserved).
        expect(cells[0].heading).toBe("x = 1");
        expect(cells[1]).toMatchObject({startLine: 2, endLine: 4});
    });
});
