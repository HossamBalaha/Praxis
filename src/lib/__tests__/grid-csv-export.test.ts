/**
 * grid-csv-export.test.ts — unit tests for the variable/DataFrame grid's
 * Export-CSV row assembly (src/lib/csv-io.ts → toCsvText) plus the
 * computeStatsForValues stats the grid's Stats toggle shows
 * (src/components/column-stats.tsx).
 *
 * toCsvText converts TYPED grid rows (null / number / boolean / string
 * cells) into RFC 4180 CSV via the same stringifyCsv the CSV editor
 * uses — so every field that needs quoting (embedded commas, quotes,
 * newlines, leading/trailing spaces) gets it, and a round trip through
 * parseCsv restores the exact cell text.
 */
import {describe, expect, it} from "vitest";
import {parseCsv, toCsvText} from "@/lib/csv-io";
import {computeStatsForValues} from "@/components/column-stats";

describe("toCsvText — typed cell rendering", () => {
    it("headers ride the header row; one line per row; trailing newline", () => {
        const csv = toCsvText(["a", "b"], [[1, 2], [3, 4]]);
        expect(csv).toBe("a,b\n1,2\n3,4\n");
    });

    it("null / undefined export as the empty field (not the '—' marker)", () => {
        const table = parseCsv(toCsvText(["x"], [[null], [undefined]]));
        expect(table.rows).toEqual([[""], [""]]);
    });

    it("booleans export as Python-style True/False", () => {
        const table = parseCsv(toCsvText(["flag"], [[true], [false]]));
        expect(table.rows).toEqual([["True"], ["False"]]);
    });

    it("numbers keep their full string form", () => {
        const table = parseCsv(toCsvText(["n"], [[1024], [-2.5], [1e21]]));
        expect(table.rows).toEqual([["1024"], ["-2.5"], ["1e+21"]]);
    });
});

describe("toCsvText — RFC 4180 quoting through stringifyCsv", () => {
    it("cells with commas, quotes and newlines round-trip exactly", () => {
        const rows: unknown[][] = [
            ['say "hi", ok', "line1\nline2"],
            [" pad ", "plain"],
        ];
        const csv = toCsvText(["note", "text"], rows);
        expect(parseCsv(csv)).toEqual({
            headers: ["note", "text"],
            rows: [
                ['say "hi", ok', "line1\nline2"],
                [" pad ", "plain"],
            ],
        });
    });

    it("the header row is quoted when it needs it too", () => {
        const csv = toCsvText(['weird,"head'], [["v"]]);
        expect(csv.split("\n")[0]).toBe('"weird,""head"');
        expect(parseCsv(csv).headers).toEqual(['weird,"head']);
    });

    it("a header containing an embedded newline round-trips", () => {
        const csv = toCsvText(["multi\nline"], [["v"]]);
        expect(parseCsv(csv).headers).toEqual(["multi\nline"]);
        expect(parseCsv(csv).rows).toEqual([["v"]]);
    });
});

describe("computeStatsForValues — the grid's Stats band input", () => {
    it("min / max / mean / SUM for numeric columns, missing counted", () => {
        const stats = computeStatsForValues(["v"], [[10], [null], [30], [20]]);
        expect(stats[0].kind).toBe("numeric");
        expect(stats[0].min).toBe(10);
        expect(stats[0].max).toBe(30);
        expect(stats[0].mean).toBe(20);
        expect(stats[0].sum).toBe(60);
        expect(stats[0].missing).toBe(1);
        expect(stats[0].total).toBe(4);
    });

    it("sum is undefined when the column has no numeric cells", () => {
        const stats = computeStatsForValues(["t"], [["a"], [null]]);
        expect(stats[0].kind).toBe("text");
        expect(stats[0].sum).toBeUndefined();
        expect(stats[0].missing).toBe(1);
    });

    it("numeric STRINGS and booleans are recognized like the CSV path", () => {
        const stats = computeStatsForValues(["n", "b"], [["5", true], ["7", false]]);
        expect(stats[0].sum).toBe(12);
        expect(stats[0].kind).toBe("numeric");
        expect(stats[1].kind).toBe("boolean");
    });
});
