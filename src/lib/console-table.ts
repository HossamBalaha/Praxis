/**
 * Pure pandas-DataFrame repr detection + parsing for the console panel
 * (src/components/console-panel.tsx): when a submission's OUTPUT block
 * "looks like" a DataFrame, the panel swaps the raw preformatted text
 * for a compact styled table.
 *
 * Detection is deliberately CONSERVATIVE — the every-day plain pandas
 * text grid keeps its raw text rendering; only two shapes promote to
 * a table:
 *   1. pandas HTML output — a <table … class="dataframe"> (what
 *      df.to_html() / display(HTML(df._repr_html_())) prints).
 *   2. the bordered text summary — BOTH a `Columns:` header line AND
 *      a row of `---` separators (the grid pandas and other table
 *      printers fall back to when the repr is summarized, plus the
 *      underline-separator grid shape).
 *
 * The HTML shape is parsed by a tiny hand-rolled ALLOWLIST parser:
 * only table/thead/tbody/tr/th/td tags survive, every attribute is
 * dropped (nothing but tag names + text is carried out, so the React
 * render never touches dangerouslySetInnerHTML), and text runs are
 * collected only while a th/td is open — the <style> block pandas
 * prepends to its HTML therefore can never leak into cells.
 *
 * No React / DOM here so the vitest suite can pin the detector and
 * both parsers directly (see __tests__/console-table.test.ts).
 */

/* ------------------------------------------------------------------ */
/*  Shared result shape                                                 */

/* ------------------------------------------------------------------ */

/** One parsed table — header labels plus one row per data line.
 *  pandas grids always carry a leading INDEX column, so every row is
 *  `[indexCell, ...valueCells]` and `columns` holds the VALUE-column
 *  labels only (the index column renders with an empty header). */
export interface ConsoleTable {
    /** header labels, one per value column. */
    columns: string[];
    /** rows: [indexCell, ...valueCells], aligned with columns. */
    rows: string[][];
}

/* ------------------------------------------------------------------ */
/*  Detector                                                            */
/* ------------------------------------------------------------------ */

/** `Columns: <labels>` header line (pandas' bracket form is
 *  `Columns: [a, b, c]`); leading indentation tolerated. */
const COLUMNS_LINE_RE = /^\s*Columns:\s+\S/;
/** Underline separator row: only dashes/spaces/pipes/colons/plus and
 *  at least one run of three dashes (`--- ---`, `+---+---+`, `----`). */
const DASH_ROW_RE = /^[\s|:+-]*$/;
/** pandas' trailing shape summary — never a data row. */
const SHAPE_SUMMARY_RE = /^\[\d+ rows? x \d+ columns?\]$/;

function isDashRow(line: string): boolean {
    return DASH_ROW_RE.test(line) && /-{3,}/.test(line);
}

/** Conservative DataFrame sniff on an output block: "html" for pandas
 * HTML output, "text" for the Columns:+dashes grid, null otherwise.
 * Attribute order on the <table> is not fixed (pandas emits
 * `border="1" class="dataframe"`), so the class is matched anywhere
 * inside the opening tag. */
export function detectDataFrameOutput(text: string): "html" | "text" | null {
    if (/<table\b[^>]*\bclass="dataframe"/.test(text)) return "html";
    const lines = text.split("\n");
    if (!lines.some((l) => COLUMNS_LINE_RE.test(l))) return null;
    return lines.some((l) => isDashRow(l)) ? "text" : null;
}

/* ------------------------------------------------------------------ */
/*  Text-grid parser                                                    */

/* ------------------------------------------------------------------ */

/** Header labels off a `Columns:` line — bracket list or plain, comma
 *  list or space-separated. */
function parseColumnsList(rest: string): string[] {
    let s = rest.trim();
    if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
    const cells = s.includes(",") ? s.split(",") : s.split(/\s+/);
    return cells.map((c) => c.trim()).filter((c) => c.length > 0);
}

/** Parse the text-grid shape into a ConsoleTable: the `Columns:` line
 *  is the header, dash rows and the trailing shape summary are dropped,
 *  every other non-blank line splits on whitespace into
 *  [index, ...values]. Null when nothing parseable remains. */
export function parseDataFrameText(text: string): ConsoleTable | null {
    const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
    let columns: string[] = [];
    let sawColumnsLine = false;
    const rows: string[][] = [];
    for (const line of lines) {
        if (!line.trim()) continue; // blank padding lines
        if (SHAPE_SUMMARY_RE.test(line.trim())) continue;
        const cols = /^\s*Columns:\s*(.*)$/.exec(line);
        if (cols) {
            sawColumnsLine = true;
            columns = parseColumnsList(cols[1]);
            continue;
        }
        if (isDashRow(line)) continue; // underline separator rows
        rows.push(line.trim().split(/\s+/));
    }
    if (rows.length === 0) return null;
    if (!sawColumnsLine) {
        // No `Columns:` line — the first grid line IS the header row
        // (its leading cell is the empty index-column slot).
        columns = (rows.shift() ?? []).slice(1);
    }
    return {columns, rows};
}

/* ------------------------------------------------------------------ */
/*  HTML parser (allowlisted tags, attributes stripped)                 */
/* ------------------------------------------------------------------ */

/** Tags the parser understands; everything else (style, div, a, b…) is
 *  TRANSPARENT — it opens no context, so its text only survives while
 *  an allowlisted th/td cell is open (inline wrappers like <b> keep
 *  their text; the prepended <style> block never reaches a cell). */
const ALLOWED_TAGS = new Set(["table", "thead", "tbody", "tr", "th", "td"]);

/** Tag scanner — the attribute blob swallows quoted values so a `>`
 *  inside an attribute string cannot end the tag early. */
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** Minimal entity decode (pandas escapes &, <, >, " and '). `&amp;`
 *  decodes LAST so `&amp;lt;` correctly yields the literal `&lt;`. */
function decodeEntities(s: string): string {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, "\u00a0")
        .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
        .replace(/&amp;/g, "&");
}

/** String.fromCodePoint that leaves lone surrogates / NaN intact
 *  (a malformed numeric entity must not throw the parser). */
function safeCodePoint(code: number): string {
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    try {
        return String.fromCodePoint(code);
    } catch {
        return "";
    }
}

/** Parse pandas' `<table class="dataframe">` HTML into a ConsoleTable
 *  — thead rows become the header (first th is the empty index slot),
 *  tbody / bare-table rows become data rows ([index, ...values]).
 *  Unbalanced markup is tolerated leniently (a stray close pops to its
 *  match); null only when no table structure produced any row. */
export function parseDataFrameHtml(html: string): ConsoleTable | null {
    // Open allowlisted tags only — everything else is transparent.
    const stack: string[] = [];
    let sawTable = false;
    let inThead = false;
    let row: string[] | null = null;
    let cell: string | null = null;
    const headRows: string[][] = [];
    const bodyRows: string[][] = [];

    const commitCell = () => {
        if (row != null && cell != null) row.push(cell);
        cell = null;
    };
    const commitRow = () => {
        commitCell();
        if (row != null && row.length > 0) {
            (inThead ? headRows : bodyRows).push(row);
        }
        row = null;
    };
    const popTo = (name: string) => {
        const at = stack.lastIndexOf(name);
        if (at === -1) return; // stray close — ignore
        // Close the intermediate th/td/tr properly while unwinding.
        while (stack.length > at) {
            const open = stack.pop();
            if (open === "th" || open === "td") commitCell();
            else if (open === "tr") commitRow();
            else if (open === "thead") inThead = false;
        }
    };

    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let cursor = 0;
    while ((m = TAG_RE.exec(html)) !== null) {
        const [, closing, rawName] = m;
        const name = rawName.toLowerCase();
        // Text run before this tag — collected only inside an open cell.
        if (cell !== null) {
            cell += decodeEntities(html.slice(cursor, m.index));
        }
        cursor = TAG_RE.lastIndex;
        if (!ALLOWED_TAGS.has(name)) continue; // transparent tag
        if (closing) {
            popTo(name);
            continue;
        }
        if (name === "table") sawTable = true;
        if (name === "thead") inThead = true;
        // Missing-close tolerance: opening a new tr/td/th commits whatever
        // still-open row/cell it would otherwise clobber.
        if (name === "tr") {
            commitRow();
            row = [];
        }
        if (name === "th" || name === "td") {
            commitCell();
            cell = "";
        }
        stack.push(name);
    }
    // Trailing text after the last tag (inside a still-open cell).
    if (cell !== null && cursor < html.length) {
        cell += decodeEntities(html.slice(cursor));
    }
    commitRow(); // unterminated last row, if any

    const headerRow =
        headRows.length > 0
            ? headRows[0]
            : bodyRows.length > 0
                ? bodyRows[0]
                : null;
    if (!sawTable || headerRow == null) return null;
    const rest = headRows.length > 0 ? bodyRows : bodyRows.slice(1);
    return {
        // First th is the (empty) index-column slot.
        columns: headerRow.slice(1),
        rows: rest,
    };
}
