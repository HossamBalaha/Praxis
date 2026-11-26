/**
 * Jupyter-style console magics + the other pure helpers the persistent
 * Python console needs (src/components/console-panel.tsx). The MAGIC
 * EXECUTION itself lives in the server-side kernel
 * (src/lib/console-kernel.ts) — it needs the real namespace and real
 * timing — so this module covers everything the CLIENT decides before
 * sending: parsing the magic token (LINE magics `%time …` and CELL
 * magics `%%time …` — the cell body is the whole submission), listing
 * the magics for %help, validating unknown %/%% commands, the
 * persisted-history array ops and the pandas DataFrame repr detector
 * used to render rich tables.
 *
 * Pure logic only (no React / window / fetch) so the vitest suite can
 * cover the parsing edge cases directly
 * (see __tests__/console-magics-cell.test.ts).
 */

/* ------------------------------------------------------------------ */
/*  Magic parsing                                                      */
/* ------------------------------------------------------------------ */

export type ConsoleMagicName =
    | "%time"
    | "%timeit"
    | "%who"
    | "%whos"
    | "%tasks"
    | "%reset"
    | "%history"
    | "%help";

/** Cell magics — the `%%`-prefixed kind that takes the WHOLE
 * submission (everything after the first line / token) as its
 * operand, executed by the kernel in console-kernel.ts. */
export type ConsoleCellMagicName = "%%time" | "%%timeit" | "%%capture";

export interface ParsedConsoleMagic {
    /** Canonical LINE magic, or null when the line is ordinary code (or
     *  an unknown/`%`-token — see `unknown`). */
    magic: ConsoleMagicName | null;
    /** Canonical CELL magic (leading `%%` token), or null. Mutually
     *  exclusive with `magic`. */
    cellMagic: ConsoleCellMagicName | null;
    /** True when the line starts with `%`/`%%` but matches no known
     *  magic — the client shows a hint instead of letting Python
     *  SyntaxError. */
    unknown: boolean;
    /** Everything after the magic token (trimmed; for CELL magics this
     *  is the cell body and may be multi-line). Empty string when there
     *  was nothing after. */
    rest: string;
    /** The raw first token as typed (e.g. `%timeit-lite`, `%%TIME`) —
     *  used in the unknown-magic hint text. */
    token: string;
}

/** Input aliases per canonical magic (%magic lists them, like IPython). */
const MAGIC_ALIASES: Array<{ names: string[]; canonical: ConsoleMagicName }> = [
    {names: ["%time"], canonical: "%time"},
    // %timeit-lite is the advertised single-shot name; bare %timeit is
    // accepted as the same thing so muscle memory works.
    {names: ["%timeit", "%timeit-lite"], canonical: "%timeit"},
    {names: ["%who"], canonical: "%who"},
    {names: ["%whos"], canonical: "%whos"},
    {names: ["%tasks"], canonical: "%tasks"},
    {names: ["%reset"], canonical: "%reset"},
    {names: ["%history"], canonical: "%history"},
    {names: ["%help", "%magic"], canonical: "%help"},
];

const CELL_MAGIC_ALIASES: Array<{ names: string[]; canonical: ConsoleCellMagicName }> = [
    {names: ["%%time"], canonical: "%%time"},
    {names: ["%%timeit"], canonical: "%%timeit"},
    {names: ["%%capture"], canonical: "%%capture"},
];

/** Parse one console input for a leading magic. Only lines whose
 *  FIRST non-space character is `%` are candidates — `print("%time")`
 *  and friends stay ordinary code. A leading `%%` token is a CELL
 *  magic whose `rest` is the whole cell body (may be multi-line).
 *  Matching is case-insensitive like IPython. */
export function parseConsoleMagic(line: string): ParsedConsoleMagic {
    const trimmed = line.trim();
    if (!trimmed.startsWith("%")) {
        return {magic: null, cellMagic: null, unknown: false, rest: line, token: ""};
    }
    const token = trimmed.split(/\s+/, 1)[0].toLowerCase();
    if (token.startsWith("%%")) {
        const hit = CELL_MAGIC_ALIASES.find((m) => m.names.includes(token));
        if (!hit) {
            return {magic: null, cellMagic: null, unknown: true, rest: "", token};
        }
        return {
            magic: null,
            cellMagic: hit.canonical,
            unknown: false,
            rest: trimmed.slice(token.length).trim(),
            token,
        };
    }
    const hit = MAGIC_ALIASES.find((m) => m.names.includes(token));
    if (!hit) {
        return {magic: null, cellMagic: null, unknown: true, rest: "", token};
    }
    return {
        magic: hit.canonical,
        cellMagic: null,
        unknown: false,
        rest: trimmed.slice(token.length).trim(),
        token,
    };
}

/** The %help listing (client-side copy — the kernel prints the same
 * list server-side for direct API users; keep the two in sync). */
export const CONSOLE_MAGIC_HELP = [
    "%time <code>        run the code once and report the wall time",
    "%timeit-lite <code> single-shot timing (no repeat loop)",
    "%who                list the names defined in the namespace",
    "%whos               list names with their types and values",
    "%tasks              asyncio task tree in the kernel (Async tab twin)",
    "%reset              clear the whole namespace (state is lost)",
    "%history            list this session's submissions",
    "%help               this list",
    "",
    "Cell magics (must be the first token of the submission):",
    "%%time              time the whole cell (wall time)",
    "%%timeit            best of 3 runs — the cell re-runs 3 times, side effects repeat",
    "%%capture           capture the cell's stdout/stderr into _capture",
].join("\n");

/** The advertised names for the unknown-magic hints — first-listed
 *  alias of each magic, matching CONSOLE_MAGIC_HELP. */
const LINE_MAGIC_HINTS = [
    "%time",
    "%timeit-lite",
    "%who",
    "%whos",
    "%tasks",
    "%reset",
    "%history",
    "%help",
];
const CELL_MAGIC_HINTS = ["%%time", "%%timeit", "%%capture"];

/** Friendly one-line hint for an unrecognized `%`/`%%` token — the
 * panel prints this as a sys entry instead of shipping the line to
 * Python (which would answer with a bare SyntaxError). The kernel
 * has its own copy of the guard for direct API users. */
export function unknownMagicHint(token: string): string {
    if (token.startsWith("%%")) {
        return `Unknown cell magic ${token} — try ${CELL_MAGIC_HINTS.join(", ")}`;
    }
    return `Unknown magic ${token} — try ${LINE_MAGIC_HINTS.join(", ")}`;
}

/* ------------------------------------------------------------------ */
/*  Persisted history array ops                                        */
/* ------------------------------------------------------------------ */

/** How many console history entries survive in localStorage (~200 per
 *  the spec; matches the shell-style cap the terminal panel uses).
 *  Used by the panel's load/save helpers around localStorage itself. */
export const CONSOLE_HISTORY_CAP = 200;

/** Append one submission to the history: consecutive duplicates
 *  collapse (the shell `history` behavior — re-running the same line
 *  twice keeps one entry) and the list is capped to the newest CAP
 *  entries. Blank submissions are ignored. Returns the SAME array
 *  reference when nothing changed so React state updates can bail. */
export function appendConsoleHistory(
    prev: string[],
    entry: string,
    cap = CONSOLE_HISTORY_CAP
): string[] {
    if (!entry.trim()) return prev;
    if (
        prev.length > 0 &&
        prev[prev.length - 1].trim() === entry.trim()
    ) {
        return prev;
    }
    const next = [...prev, entry];
    return next.length > cap ? next.slice(next.length - cap) : next;
}

/* ------------------------------------------------------------------ */
/*  Pandas DataFrame repr detection (rich table rendering)             */

/* ------------------------------------------------------------------ */

export interface DataFrameReprTable {
    /** Header cells INCLUDING the (usually empty) leading index column. */
    columns: string[];
    /** Data rows; each row includes the leading index cell. Ellipsis
     *  truncation rows from pandas collapse into `["..", "…"]`-style
     *  marker rows rendered as a single spanning cell. */
    rows: string[][];
    /** The `[N rows x M columns]` footer line, when pandas printed it. */
    shapeNote?: string;
}

/** Split one repr line into cells on runs of 2+ spaces. The LEADING
 *  run of spaces produces an empty first cell — that is the index
 *  column slot and must be kept so header/data column counts line up. */
function splitReprCols(line: string): string[] {
    const trimmedEnd = line.replace(/\s+$/, "");
    return trimmedEnd.split(/\s{2,}/);
}

/** pandas' truncation filler row: `..  ..  ...` (2 dots for the index
 *  and numeric columns, 3 for the rest). */
function isEllipsisRow(cells: string[]): boolean {
    return (
        cells.length > 0 &&
        cells.every((c) => c === ".." || c === "...")
    );
}

/** Heuristic detector for a pandas DataFrame repr block:
 *
 *      name  value
 *   0     aa      1
 *   1  bbbbb      2
 *
 * Rules (deliberately conservative — mixed print()+repr output stays
 * plain text rather than rendering a wrong table):
 *   - the FIRST data row's leading cell must be the RangeIndex start
 *     `0`, or the header's index cell must be empty with >= 2 data rows
 *     (named-index frames);
 *   - every row splits into the same number of 2+ -space-separated
 *     cells as the header;
 *   - the block must consume the ENTIRE non-blank text (a class banner
 *     line and the `[N rows x M columns]` footer are allowed).
 * Series reprs (no header row) and HTML payloads are NOT matched. */
export function parseDataFrameRepr(text: string): DataFrameReprTable | null {
    const lines = text
        .split("\n")
        .map((l) => l.replace(/\r$/, ""))
        // A `<class 'pandas.core.frame.DataFrame'>` banner may sit above
        // the table when the user prints df explicitly.
        .filter((l) => l.trim() !== "<class 'pandas.core.frame.DataFrame'>");
    if (lines.length < 2) return null;

    // Skip leading blank lines; the header must be the first content.
    let head = 0;
    while (head < lines.length && lines[head].trim() === "") head++;
    if (head >= lines.length - 1) return null;

    const headerLine = lines[head];
    const columns = splitReprCols(headerLine);
    if (columns.length < 2) return null;

    const rows: string[][] = [];
    let shapeNote: string | undefined;
    // `end` is normalized to point at the FIRST UNCONSUMED line when the
    // loop breaks — the trailing-junk scan below starts there, so a
    // mismatched / Series-tail line itself counts as junk (mixed print
    // output stays plain text, never a half-right table).
    let end = head + 1;
    for (; end < lines.length; end++) {
        const line = lines[end];
        if (line.trim() === "") {
            // Blank line: the table may be followed by the shape footer
            // (pandas puts a blank line before `[N rows x M columns]`).
            const next = lines[end + 1]?.trim() ?? "";
            const footer = /^\[\d+ rows? x \d+ columns?\]$/.exec(next);
            if (footer) {
                shapeNote = next;
                end += 2; // consume the blank line + the footer
            }
            break;
        }
        const footer = /^\[\d+ rows? x \d+ columns?\]$/.exec(line.trim());
        if (footer) {
            shapeNote = line.trim();
            end += 1; // consume the footer line
            break;
        }
        // `Name: x, dtype: …` is the Series tail — a DataFrame never has
        // it; stop (mixed output stays plain text).
        if (/^Name: .*, dtype: /.test(line.trim())) break;
        const cells = splitReprCols(line);
        if (isEllipsisRow(cells)) {
            rows.push(["…"]);
            continue;
        }
        if (cells.length !== columns.length) break;
        rows.push(cells);
    }

    if (rows.length === 0) return null;
    const first = rows[0];
    const firstIsRangeStart = first.length > 0 && /^0$/.test(first[0].trim());
    const emptyIndexHeader = columns[0].trim() === "";
    // Named-index frames (r1/r2…) need >= 2 rows + an anonymous index
    // column before we trust the shape — single-row guesses misfire on
    // ordinary aligned text.
    if (!firstIsRangeStart && !(emptyIndexHeader && rows.length >= 2)) {
        return null;
    }
    // Trailing junk after the block (more non-blank lines) means the
    // text was NOT just a DataFrame repr — bail and render plain text.
    for (let i = end; i < lines.length; i++) {
        if (lines[i].trim() !== "") return null;
    }
    return {columns, rows, shapeNote};
}
