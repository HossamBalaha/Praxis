/**
 * robust CSV parsing + stringifying for the editable
 * data grid and the converters. Handles quoted fields, escaped
 * double quotes, CRLF, and the tab separator (.tsv). Pure client-side —
 * no dependency on the server or pandas.
 */

export interface ParsedTable {
    headers: string[];
    rows: string[][];
}

/** Parse one CSV line (no trailing newline). Returns null on a
 *  truncated quote (unterminated quoted field).
 *
 *  Kept for single-line callers (tests, the toolbox); the
 *  WHOLE-DOCUMENT parser below is the RFC-4180 one — a quoted field
 *  may contain embedded newlines, so per-line parsing can never see
 *  the full field. */
export function parseCsvLine(
    line: string,
    sep: string
): string[] | null {
    const out: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === sep) {
            out.push(field);
            field = "";
        } else {
            field += ch;
        }
    }
    if (inQuotes) return null;
    out.push(field);
    return out;
}

/** Parse a whole CSV/TSV document — RFC 4180 compliant (Section 6,
 * . A character-level state machine (NOT line-based: the old
 *  line splitter broke quoted fields with EMBEDDED NEWLINES across
 *  "lines" and kept each fragment as its own garbage row):
 *   - `"…"` quoted fields may contain the separator, quotes (doubled
 *     `""` → `"`), CR, LF, and CRLF verbatim;
 *   - record terminators are CRLF, LF, or a bare CR OUTSIDE quotes;
 *   - one trailing terminator does NOT create an empty trailing row
 *     ("a,b\n" is one record) while interior blank lines stay one
 *     empty-field row ("a,b\n\nc" → [a,b] / [""] / [c]), matching
 *     the previous tolerant behavior;
 *   - an unterminated quote at EOF keeps its partial field (never
 *     throws — a truncated paste degrades to content, not an error).
 *  Tolerant on the rest: junk after a closing quote is content. */
export function parseCsv(text: string, sep = ","): ParsedTable {
    const records: string[][] = [];
    let field = "";
    let record: string[] = [];
    let inQuotes = false;

    const pushField = () => {
        record.push(field);
        field = "";
    };
    const pushRecord = () => {
        pushField();
        records.push(record);
        record = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"'; // RFC 4180 — "" inside quotes is a literal "
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                // Quoted content is verbatim: sep, CR, LF, CRLF all stay in
                // the field (the RFC's whole point).
                field += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === sep) {
            pushField();
            continue;
        }
        if (ch === "\r" || ch === "\n") {
            // CRLF is ONE terminator (consuming the LF half); a bare CR or
            // bare LF also ends the record — matches the old normalizer.
            if (ch === "\r" && text[i + 1] === "\n") i++;
            pushRecord();
            continue;
        }
        field += ch;
    }

    // EOF: flush an in-progress record — a non-empty field, a started
    // row ("a," → ["a",""]), or a still-open quote (truncated
    // paste). A COMPLETE record ended by a terminator stays flushed —
    // exactly one trailing newline creates no phantom empty row.
    if (field !== "" || record.length > 0 || inQuotes) {
        pushRecord();
    }

    const headers = records.length > 0 ? records[0] : [];
    const rows = records.slice(1);
    return {headers, rows};
}

/** Quote a field only when necessary (sep, quote, newline, leading/
 *  trailing space). */
export function csvField(field: string, sep: string): string {
    const needs =
        field.includes(sep) ||
        field.includes('"') ||
        field.includes("\n") ||
        field !== field.trim();
    if (!needs) return field;
    return `"${field.replace(/"/g, '""')}"`;
}

/** Stringify a table back to CSV/TSV text. */
export function stringifyCsv(table: ParsedTable, sep = ","): string {
    const lines = [
        table.headers.map((h) => csvField(h, sep)).join(sep),
        ...table.rows.map((r) => r.map((c) => csvField(c, sep)).join(sep)),
    ];
    return `${lines.join("\n")}\n`;
}

/** One TYPED grid cell as export text — null/undefined export as the
 *  empty field, booleans as Python-style True/False (the display text
 *  the grids show), everything else via String(v). */
function exportCellText(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "True" : "False";
    return String(v);
}

/** Assemble CSV text from a typed grid (headers + unknown[][] rows) —
 *  the variable/DataFrame grid's Export-CSV path. Riding
 *  stringifyCsv means every field goes through the RFC 4180 quoting
 *  (embedded commas, quotes, newlines), so a round trip through
 *  parseCsv restores the exact cell text. */
export function toCsvText(headers: string[], rows: unknown[][]): string {
    return stringifyCsv({
        headers,
        rows: rows.map((row) => row.map(exportCellText)),
    });
}

/** The separator for a tabular file extension (".tsv" → tab). */
export function separatorForExt(ext: string): string {
    return ext.toLowerCase() === ".tsv" ? "\t" : ",";
}
