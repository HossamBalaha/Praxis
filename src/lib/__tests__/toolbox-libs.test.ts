import {describe, expect, it} from "vitest";
import {parseCsv, parseCsvLine, separatorForExt, stringifyCsv} from "../csv-io";
import {jsonTypeOf, queryJsonPath} from "../jsonpath";
import {nextCronRuns, parseCron} from "../cron";
import {md5} from "../md5";
import {
    escapeHtmlEntities,
    fromBase64Utf8,
    generateFakeData,
    loremIpsum,
    parseColor,
    relativeTimeFrom,
    rgbToHex,
    rgbToHsl,
    timestampFacts,
    toBase64Utf8,
    unescapeHtmlEntities,
} from "../toolbox-utils";
import {diffLines, parseMarkdownOutline} from "../markdown-outline";

/* — tests for the new pure libraries (items 1-15 backend
* logic). Keep them deterministic: seeds fixed, no Date.now asserts
* beyond sanity. */

describe("csv-io", () => {
    it("parses quoted fields with escaped quotes", () => {
        const line = parseCsvLine('"a, b""c",plain,next', ",");
        expect(line).toEqual(['a, b"c', "plain", "next"]);
    });
    it("parses a whole document and keeps ragged rows", () => {
        const table = parseCsv("name,age\nAda,36\nBob,unknown\n");
        expect(table.headers).toEqual(["name", "age"]);
        expect(table.rows).toEqual([["Ada", "36"], ["Bob", "unknown"]]);
    });
    it("round-trips through stringify with quoting only when needed", () => {
        const table = {headers: ["a,b", "plain"], rows: [['say "hi"', "x"]]};
        const text = stringifyCsv(table);
        expect(text).toBe('"a,b",plain\n"say ""hi""",x\n');
        expect(parseCsv(text.replace(/\n$/, ""))).toEqual({
            headers: ["a,b", "plain"],
            rows: [['say "hi"', "x"]],
        });
    });
    it("uses tab separators for tsv", () => {
        expect(separatorForExt(".tsv")).toBe("\t");
        expect(separatorForExt(".csv")).toBe(",");
        const table = parseCsv("a\tb\n1\t2", "\t");
        expect(table.rows).toEqual([["1", "2"]]);
    });
});

describe("jsonpath", () => {
    const doc = {
        store: {
            book: [
                {title: "A", price: 10},
                {title: "B", price: 30},
                {title: "C", price: 5},
            ],
            name: "shop",
        },
        count: 3,
    };
    it("navigates members and indexes", () => {
        expect(queryJsonPath(doc, "$.store.name")).toEqual([{path: "$.store.name", value: "shop"}]);
        expect(queryJsonPath(doc, "$.store.book[0].title")).toEqual([{path: "$.store.book[0].title", value: "A"}]);
    });
    it("wildcards and recursive descent", () => {
        expect(queryJsonPath(doc, "$.store.book[*].price").map((m) => m.value)).toEqual([10, 30, 5]);
        expect(queryJsonPath(doc, "$..price").map((m) => m.value)).toEqual([10, 30, 5]);
    });
    it("filters with comparisons", () => {
        const hits = queryJsonPath(doc, "$.store.book[?(@.price > 9)].title");
        expect(hits.map((h) => h.value)).toEqual(["A", "B"]);
    });
    it("slices arrays", () => {
        expect(queryJsonPath(doc, "$.store.book[1:3]").map((m) => (m.value as {
            title: string
        }).title)).toEqual(["B", "C"]);
    });
    it("labels types", () => {
        expect(jsonTypeOf(doc.store.book)).toBe("array(3)");
        expect(jsonTypeOf(null)).toBe("null");
        expect(jsonTypeOf("x")).toBe("string");
    });
    it("rejects malformed queries", () => {
        expect(() => queryJsonPath(doc, "store")).toThrow(); // missing $
        expect(() => queryJsonPath(doc, "$.a.b.")).toThrow(); // trailing dot
        expect(() => queryJsonPath(doc, "$[bad")).toThrow(); // unbalanced bracket
    });
});

describe("cron", () => {
    it("parses */15 and computes next runs at 15-minute steps", () => {
        const parsed = parseCron("*/15 * * * *");
        expect(parsed.summary).toContain("15 minutes");
        const from = new Date("2026-11-12T10:07:00");
        const runs = nextCronRuns(parsed, 3, from);
        expect(runs[0].getMinutes()).toBe(15);
        expect(runs[1].getMinutes()).toBe(30);
        expect(runs[2].getMinutes()).toBe(45);
    });
    it("daily at 09:30", () => {
        const parsed = parseCron("30 9 * * *");
        const from = new Date("2026-11-12T10:00:00");
        const next = nextCronRuns(parsed, 1, from);
        expect(next[0].getDate()).toBe(13);
        expect(next[0].getHours()).toBe(9);
        expect(next[0].getMinutes()).toBe(30);
    });
    it("weekday names and ranges", () => {
        const parsed = parseCron("0 8 * * MON-FRI");
        expect(parsed.summary).toContain("Monday");
        // Saturday 2026-11-14 → next run is Monday 16th.
        const from = new Date("2026-11-14T12:00:00");
        const next = nextCronRuns(parsed, 1, from);
        expect(next[0].getDay()).toBe(1);
        expect(next[0].getDate()).toBe(16);
    });
    it("6-field forms accept (and drop) a leading seconds field", () => {
        expect(() => parseCron("0 */5 * * * *")).not.toThrow();
    });
});

describe("md5", () => {
    it("matches the RFC 1321 test vectors", () => {
        expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
        expect(md5("a")).toBe("0cc175b9c0f1b6a831c399e269772661");
        expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
        expect(md5("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
        expect(md5("abcdefghijklmnopqrstuvwxyz")).toBe("c3fcd3d76192e4007dfb496cca67e13b");
    });
    it("handles UTF-8 multibyte input", () => {
        // Known vector: md5("héllo") via the UTF-8 bytes.
        expect(md5("héllo")).toBe("be50e8478cf24ff3595bc7307fb91b50");
    });
});

describe("toolbox-utils", () => {
    it("base64 round-trips UTF-8", () => {
        const text = "Praxis — naïve ∑ 42";
        expect(fromBase64Utf8(toBase64Utf8(text))).toBe(text);
    });
    it("parses and converts colors", () => {
        expect(parseColor("#0be")).toBeTruthy();
        expect(rgbToHex(parseColor("#10b981")!)).toBe("#10b981");
        const hsl = rgbToHsl(parseColor("rgb(255, 0, 0)")!);
        expect(hsl.h).toBe(0);
        expect(hsl.s).toBe(100);
        expect(hsl.l).toBe(50);
        expect(parseColor("nope")).toBeNull();
    });
    it("escapes and unescapes HTML entities", () => {
        const escaped = escapeHtmlEntities("<a> & \"q\"");
        expect(escaped).toBe("&lt;a&gt; &amp; &quot;q&quot;");
        expect(unescapeHtmlEntities(escaped)).toBe('<a> & "q"');
    });
    it("generates seeded fake data deterministically", () => {
        const a = generateFakeData({count: 4, kind: "name", seed: 42});
        const b = generateFakeData({count: 4, kind: "name", seed: 42});
        expect(a).toEqual(b);
        expect(a).toHaveLength(4);
        expect(a.every((x) => x.includes(" "))).toBe(true);
        const emails = generateFakeData({count: 5, kind: "email", seed: 7});
        expect(emails.every((e) => e.includes("@"))).toBe(true);
    });
    it("lorem paragraphs respect the count", () => {
        const text = loremIpsum(3, 11);
        expect(text.split("\n\n")).toHaveLength(3);
    });
    it("timestamp facts parse epoch seconds, ms and ISO", () => {
        expect(timestampFacts("1731408000")?.iso).toContain("2024-11-12");
        expect(timestampFacts("1731408000000")?.epochMs).toBe(1731408000000);
        expect(timestampFacts("2026-11-12T00:00:00Z")?.epochMs).toBeGreaterThan(0);
        expect(timestampFacts("garbage")).toBeNull();
    });
    it("humanizes relative time with an explicit now (JWT exp/nbf/iat)", () => {
        const now = Date.UTC(2026, 0, 1);
        expect(relativeTimeFrom(now + 3 * 86_400_000, now)).toBe("in 3 days");
        expect(relativeTimeFrom(now - 2 * 3_600_000, now)).toBe("2 hours ago");
        expect(relativeTimeFrom(now, now)).toBe("in 1 second");
    });
});

describe("markdown-outline + diff", () => {
    it("parses ATX headings and skips fenced code", () => {
        const outline = parseMarkdownOutline("# Title\n```python\n# not a heading\n```\n## Section\nbody\n### Deep");
        expect(outline.map((h) => h.text)).toEqual(["Title", "Section", "Deep"]);
        expect(outline[2].level).toBe(3);
    });
    it("diffs two snippets with add/del/same", () => {
        const diff = diffLines("a\nb\nc", "a\nB\nc\nd");
        expect(diff.filter((d) => d.op === "same").map((d) => d.text)).toEqual(["a", "c"]);
        expect(diff.filter((d) => d.op === "del").map((d) => d.text)).toEqual(["b"]);
        expect(diff.filter((d) => d.op === "add").map((d) => d.text)).toEqual(["B", "d"]);
    });
});
