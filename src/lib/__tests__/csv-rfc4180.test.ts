/**
 * csv-rfc4180.test.ts — unit tests for the RFC-4180 whole-document
 * CSV parser in src/lib/csv-io.ts (Section 6,.
 *
 * Focuses on the regressions the old line-splitter had:
 *   - quoted fields with EMBEDDED NEWLINES (LF, CRLF, multi-line)
 *   - escaped quotes ("" → ")
 *   - CRLF record terminators (one terminator, not two rows)
 *   - trailing-newline edge cases (0/1/2 trailing terminators,
 *     no-terminator-at-EOF)
 * plus round-trips through stringifyCsv for every quoted-field shape.
 */
import {describe, expect, it} from "vitest";
import {csvField, parseCsv, stringifyCsv} from "@/lib/csv-io";

describe("RFC 4180 — quoted fields with embedded newlines", () => {
    it("keeps a single LF inside a quoted field in ONE cell", () => {
        const t = 'name,notes\nAda,"line1\nline2"\n';
        const table = parseCsv(t);
        expect(table.headers).toEqual(["name", "notes"]);
        expect(table.rows).toEqual([["Ada", "line1\nline2"]]);
    });

    it("keeps CRLF inside a quoted field verbatim", () => {
        const t = 'a,b\r\n"x\r\ny",2\r\n';
        const table = parseCsv(t);
        expect(table.headers).toEqual(["a", "b"]);
        expect(table.rows).toEqual([["x\r\ny", "2"]]);
    });

    it("multi-line cell in the HEADER row too", () => {
        const t = '"multi\nline\nheader",v\n1,2\n';
        expect(parseCsv(t).headers).toEqual(["multi\nline\nheader", "v"]);
    });

    it("several multi-line cells in one record", () => {
        const t = '"a\nb","c\nd",e\n';
        expect(parseCsv(t).headers).toEqual(["a\nb", "c\nd", "e"]);
    });

    it("the separator inside quotes stays in the cell", () => {
        expect(parseCsv('"x,y",z\n').headers).toEqual(["x,y", "z"]);
    });

    it("a quoted cell spanning MANY records keeps them as one row", () => {
        const t = 'id,text\n1,"r1\nr2\nr3\nr4"\n2,plain\n';
        const table = parseCsv(t);
        expect(table.rows).toEqual([["1", "r1\nr2\nr3\nr4"], ["2", "plain"]]);
    });
});

describe("RFC 4180 — escaped quotes", () => {
    it('unescapes "" to a single " in quoted fields', () => {
        expect(parseCsv('"say ""hi""",x\n').headers).toEqual(['say "hi"', "x"]);
    });

    it('unescapes a RUN of escaped quotes', () => {
        expect(parseCsv('"""a""","""b"""\n').headers).toEqual(['"a"', '"b"']);
    });

    it("escapes inside multi-line cells mix correctly", () => {
        const t = 'a\n"he said ""wait,\nthen left"""\n';
        const table = parseCsv(t);
        expect(table.rows).toEqual([['he said "wait,\nthen left"']]);
    });

    it("empty quoted field is an empty string (not a dropped field)", () => {
        expect(parseCsv('"",b\n').headers).toEqual(["", "b"]);
    });
});

describe("RFC 4180 — CRLF terminators", () => {
    it("CRLF records parse as single rows (no phantom empty row)", () => {
        const table = parseCsv("h1,h2\r\nv1,v2\r\n");
        expect(table.headers).toEqual(["h1", "h2"]);
        expect(table.rows).toEqual([["v1", "v2"]]);
    });

    it("mixed LF and CRLF terminators work", () => {
        const table = parseCsv("h1,h2\nv1,v2\r\nv3,v4\n");
        expect(table.rows).toEqual([["v1", "v2"], ["v3", "v4"]]);
    });

    it("a lone CR outside quotes also ends the record", () => {
        expect(parseCsv("a,b\rc,d\r").rows).toEqual([["c", "d"]]);
    });
});

describe("trailing-newline edge cases", () => {
    it("zero trailing terminators still yields the last record", () => {
        expect(parseCsv("a,b\n1,2").rows).toEqual([["1", "2"]]);
        expect(parseCsv("a,b\n1,2").headers).toEqual(["a", "b"]);
    });

    it("one trailing terminator adds NO empty row", () => {
        expect(parseCsv("a,b\n1,2\n").rows).toEqual([["1", "2"]]);
        expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([["1", "2"]]);
    });

    it("two trailing terminators leave ONE empty row (blank line)", () => {
        expect(parseCsv("a,b\n1,2\n\n").rows).toEqual([["1", "2"], [""]]);
    });

    it("a trailing separator yields a trailing empty field", () => {
        expect(parseCsv("a,\n").headers).toEqual(["a", ""]);
    });

    it("empty document → no headers, no rows", () => {
        expect(parseCsv("")).toEqual({headers: [], rows: []});
    });

    it("document that is only a terminator → one empty header row", () => {
        expect(parseCsv("\n")).toEqual({headers: [""], rows: []});
    });
});

describe("tolerance (never throws)", () => {
    it("unterminated quote at EOF keeps the partial field", () => {
        const table = parseCsv('a,"never closed');
        expect(table.headers).toEqual(["a", "never closed"]);
    });

    it("junk after a closing quote is plain content", () => {
        expect(parseCsv('"a"b,c\n').headers).toEqual(["ab", "c"]);
    });
});

describe("round-trips through stringifyCsv", () => {
    it("a multi-line cell survives parse → stringify → parse", () => {
        const table = {headers: ["name", "notes"], rows: [["Ada", "l1\nl2"]]};
        const text = stringifyCsv(table);
        // The multi-line cell must be quoted on write and re-parsed whole.
        expect(parseCsv(text)).toEqual(table);
    });

    it("escaped quotes survive parse → stringify → parse", () => {
        const table = {headers: ['say "hi"'], rows: [['"quoted"']]};
        expect(parseCsv(stringifyCsv(table))).toEqual(table);
    });

    it("csvField quotes only when necessary", () => {
        expect(csvField("plain", ",")).toBe("plain");
        expect(csvField("a,b", ",")).toBe('"a,b"');
        expect(csvField('q"', ",")).toBe('"q"""');
        expect(csvField("l1\nl2", ",")).toBe('"l1\nl2"');
        expect(csvField(" pad ", ",")).toBe('" pad "');
    });

    it("CRLF-only files round-trip with their multi-line cells", () => {
        const raw = 'h\r\n"multi\r\nline"\r\n';
        const table = parseCsv(raw);
        expect(table.rows).toEqual([["multi\r\nline"]]);
        // Re-stringify: the embedded CRLF forces quoting; terminators are
        // LF on write (the app's line-ending policy), content preserved.
        expect(parseCsv(stringifyCsv(table))).toEqual(table);
    });
});

describe("tsv separators (sep is not comma)", () => {
    it("tab inside a quoted cell stays in the field", () => {
        expect(parseCsv('"a\tb"\tc\n', "\t").headers).toEqual(["a\tb", "c"]);
    });
});
