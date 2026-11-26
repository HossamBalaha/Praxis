import {describe, expect, it} from "vitest";
// console-table — the conservative pandas-DataFrame detector + the
// text-grid / HTML allowlist parsers behind the console panel's styled
// table rendering. The tests pin the detection contract (plain grids
// stay raw text) and the pandas HTML shape (real _repr_html_ output,
// <style> block and all).
import {detectDataFrameOutput, parseDataFrameHtml, parseDataFrameText,} from "@/lib/console-table";

describe("detectDataFrameOutput", () => {
    it("detects pandas HTML output regardless of attribute order", () => {
        // pandas emits <table border="1" class="dataframe"> — the class is
        // NOT adjacent to the tag name.
        expect(
            detectDataFrameOutput('<table border="1" class="dataframe"><thead>')
        ).toBe("html");
        expect(detectDataFrameOutput('<table class="dataframe">')).toBe("html");
    });

    it("detects the Columns: + dashes text grid", () => {
        expect(
            detectDataFrameOutput("Columns: a, b\n--- ---\n0 1 2\n1 3 4")
        ).toBe("text");
    });

    it("rejects a Columns: line without separator rows (empty-DataFrame repr)", () => {
        expect(
            detectDataFrameOutput("Empty DataFrame\nColumns: [a, b]\nIndex: []")
        ).toBeNull();
    });

    it("rejects separator rows without a Columns: line", () => {
        expect(detectDataFrameOutput("--- ---\n0 1 2")).toBeNull();
    });

    it("rejects the plain pandas text grid (conservative by design)", () => {
        const plain = ["   alpha  beta gamma", "0      1     4     x"].join("\n");
        expect(detectDataFrameOutput(plain)).toBeNull();
    });

    it("rejects ordinary prose mentioning Columns: mid-sentence", () => {
        expect(detectDataFrameOutput("we renamed two Columns: a and b\nok")).toBeNull();
    });
});

describe("parseDataFrameText", () => {
    it("parses the Columns: header, dash rows and indexed grid rows", () => {
        const text = [
            "Columns: alpha, beta",
            "  ---   ---",
            "0      1     4",
            "1      2     5",
            "",
            "[2 rows x 2 columns]",
        ].join("\n");
        expect(parseDataFrameText(text)).toEqual({
            columns: ["alpha", "beta"],
            rows: [["0", "1", "4"], ["1", "2", "5"]],
        });
    });

    it("parses pandas' bracketed Columns: list", () => {
        const table = parseDataFrameText(
            "Columns: [alpha, beta, gamma]\n---\n0 1 2 3"
        );
        expect(table?.columns).toEqual(["alpha", "beta", "gamma"]);
        expect(table?.rows).toEqual([["0", "1", "2", "3"]]);
    });

    it("falls back to the first grid line as header when Columns: is absent", () => {
        expect(parseDataFrameText("a b\n---\n1 2")).toEqual({
            columns: ["b"],
            rows: [["1", "2"]],
        });
    });

    it("returns null when nothing but headers/separators survives", () => {
        expect(parseDataFrameText("Columns: a, b\n---")).toBeNull();
        expect(parseDataFrameText("")).toBeNull();
    });
});

describe("parseDataFrameHtml", () => {
    // Shape lifted from a real df._repr_html_(): <style> block first,
    // border attribute before class, th-empty index slot, th in thead,
    // th/td mix in tbody.
    const PANDAS_HTML = [
        "<div>",
        '<style scoped>',
        "  .dataframe tbody tr th:only-of-type { vertical-align: middle; }",
        "  .dataframe thead th { text-align: right; }",
        "</style>",
        '<table border="1" class="dataframe">',
        "  <thead>",
        '    <tr style="text-align: right;">',
        "      <th></th>",
        "      <th>alpha</th>",
        "      <th>beta</th>",
        "    </tr>",
        "  </thead>",
        "  <tbody>",
        "    <tr>",
        "      <th>0</th>",
        "      <td>1</td>",
        "      <td>4 &amp; more</td>",
        "    </tr>",
        "    <tr>",
        "      <th>1</th>",
        "      <td>2</td>",
        "      <td>&lt;weird&gt; &quot;value&quot;</td>",
        "    </tr>",
        "  </tbody>",
        "</table>",
        "</div>",
    ].join("\n");

    it("parses the real pandas HTML shape, dropping style/attrs/entities", () => {
        expect(parseDataFrameHtml(PANDAS_HTML)).toEqual({
            columns: ["alpha", "beta"],
            rows: [
                ["0", "1", "4 & more"],
                ["1", "2", '<weird> "value"'],
            ],
        });
    });

    it("keeps text of inline (non-allowlisted) tags inside cells", () => {
        // No thead: the first row (with the leading empty index th) is the
        // header; <b> is transparent so its text survives into the cell.
        const html =
            '<table class="dataframe"><tr><th></th><th><b>a</b></th></tr>' +
            "<tr><th>0</th><td><b>2</b></td></tr></table>";
        const t = parseDataFrameHtml(html);
        expect(t?.columns).toEqual(["a"]);
        expect(t?.rows).toEqual([["0", "2"]]);
    });

    it("returns null without a table or without rows", () => {
        expect(parseDataFrameHtml("<p>hello</p>")).toBeNull();
        expect(parseDataFrameHtml('<table class="dataframe"></table>')).toBeNull();
    });

    it("tolerates missing closes (lenient unwinding)", () => {
        const html =
            '<table class="dataframe"><thead><tr><th></th><th>a</th><th>b</th></thead>' +
            "<tbody><tr><th>0</th><td>1</td></tbody></table>";
        // </thead> pops the still-open tr; the last </tbody> ditto.
        expect(parseDataFrameHtml(html)).toEqual({
            columns: ["a", "b"],
            rows: [["0", "1"]],
        });
    });
});
