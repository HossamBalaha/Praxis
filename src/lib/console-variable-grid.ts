/**
 * Shared pieces for "console variable → data grid viewer"
 * (src/components/console-panel.tsx + src/components/variable-grid-dialog.tsx
 * + POST /api/console/variable).
 *
 * Pure client-side logic only — types, the fetch wrapper for the
 * variable-data API route, and the two small heuristics the console
 * panel uses to decide WHERE the "open in grid" affordance renders:
 *   - `simplePathExpr` — is the echoed In[N] line a plain
 *     name/attribute/subscript path (exactly the grammar the kernel's
 *     guarded resolver accepts), so the grid fetch can resolve the SAME
 *     object the result printed;
 *   - `tableLikeReprHint` — does a non-DataFrame output block LOOK like
 *     a dict / list-of-dicts / list-of-lists / dict-of-lists repr worth
 *     offering the grid on (the kernel makes the final call — anything
 *     it can't serialize comes back as an error toast).
 */

/* ------------------------------------------------------------------ */
/*  Types (mirrors POST /api/console/variable's success body)           */

/* ------------------------------------------------------------------ */

/** One grid payload as consumed by the grid viewer dialog and by the
 *  PRAXIS_OPEN_VARIABLE_GRID CustomEvent detail. `rows` cells are
 *  strict-JSON scalars (null for NaN/None) capped at ~300 chars each;
 *  `rows`/`columns` are capped at ~2000/100 by the route. */
export interface VariableGridPayload {
    /** Column labels (pandas column names, dict keys, generated col_N...). */
    columns: string[];
    /** Row-major cell values. */
    rows: unknown[][];
    /** Viewer title — the namespace expression the grid was fetched from. */
    title: string;
    /** Kernel-side shape bucket: dataframe | series | matrix | array |
     *  dict-of-lists | dict | list-of-dicts | list-of-lists | list | set. */
    kind?: string;
    /** FULL row count in the kernel when known (rows may be truncated). */
    totalRows?: number | null;
    /** FULL column count when known. */
    totalCols?: number | null;
    /** The guarded namespace expression the data resolved from. */
    expr?: string;
}

/** Route error body (ok:false) — `dead` marks a 410 (session ended). */
export interface VariableGridError {
    ok: false;
    error: string;
    dead?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Fetch wrapper                                                       */

/* ------------------------------------------------------------------ */

/**
 * Fetch one console variable's data as grid records from the live
 * kernel session (POST /api/console/variable). Throws an Error whose
 * message is ready for a toast — kernel dead (410), busy (409),
 * not-table-like (422), too large (413) and network failures all
 * funnel into that single path so the console panel can degrade to a
 * toast (never a broken panel).
 */
export async function fetchVariableGrid(
    sessionId: string,
    expr: string,
    opts?: {
        /** Row cap override — the route clamps to [1, 2000]. */
        rowCap?: number;
        /** Column cap override — the route clamps to [1, 100]. */
        colCap?: number;
        /** Abort the fetch (e.g. the panel unmounted mid-flight). */
        signal?: AbortSignal;
    }
): Promise<Omit<VariableGridPayload, "title">> {
    let res: Response;
    try {
        res = await fetch("/api/console/variable", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                id: sessionId,
                expr,
                ...(opts?.rowCap !== undefined ? {rowCap: opts.rowCap} : {}),
                ...(opts?.colCap !== undefined ? {colCap: opts.colCap} : {}),
            }),
            signal: opts?.signal,
        });
    } catch (err) {
        throw new Error(
            err instanceof Error && err.name === "AbortError"
                ? "Fetch aborted."
                : "Network error contacting the console kernel."
        );
    }
    const data = (await res.json().catch(() => null)) as
        | {
        ok?: boolean;
        error?: string;
        kind?: string;
        columns?: unknown;
        rows?: unknown;
        totalRows?: unknown;
        totalCols?: unknown
    }
        | null;
    if (!res.ok || !data || data.ok !== true) {
        const error =
            typeof data?.error === "string" && data.error ? data.error : `HTTP ${res.status}.`;
        // 410 means the kernel session died — surface the same copy the
        // /api/console route uses so both paths read consistently.
        throw new Error(
            res.status === 410
                ? `${error} (it restarts on the next submission)`
                : error
        );
    }
    // Shape-validate before handing rows to the dialog — a malformed
    // reply renders as a toast, not a broken grid.
    if (
        !Array.isArray(data.columns) ||
        !data.columns.every((c) => typeof c === "string") ||
        !Array.isArray(data.rows) ||
        !data.rows.every((r) => Array.isArray(r))
    ) {
        throw new Error("The kernel reply was malformed (columns/rows missing).");
    }
    return {
        columns: data.columns as string[],
        rows: data.rows as unknown[][],
        kind: typeof data.kind === "string" ? data.kind : undefined,
        totalRows:
            typeof data.totalRows === "number" ? data.totalRows : null,
        totalCols:
            typeof data.totalCols === "number" ? data.totalCols : null,
        expr,
    };
}

/* ------------------------------------------------------------------ */
/*  Per-column filter predicates (the grid's filter row)                */

/* ------------------------------------------------------------------ */

/** The grid's MISSING notion — the exact cells the dialog renders as
 *  "—" and the sort treats as nulls-last. */
export function isMissingValue(v: unknown): boolean {
    return v === null || v === undefined || v === "";
}

/** A cell as filter text (same rendering the dialog's cells show). */
function cellFilterText(v: unknown): string {
    if (isMissingValue(v)) return "";
    if (typeof v === "boolean") return v ? "True" : "False";
    return String(v);
}

/** A cell as a number for the comparison queries — real numbers
 *  (finite only; NaN/Infinity never satisfy a numeric filter), or
 *  strings that parse WHOLLY as one ("1e3", "-2.5"). null when the
 *  cell is not numeric. */
function numericCell(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
        const t = v.trim();
        if (t === "") return null;
        const n = Number(t);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Numeric comparator query — ">10", ">= 1.5", "<0", "<= -3", "=42". */
const COMPARATOR_RE =
    /^\s*(>=|<=|>|<|=)\s*(-?(?:\d+\.?\d*|\.\d+))\s*$/;

/** Inclusive-range query — "10..20", "-3 .. -1", "1.5..2.5". */
const RANGE_RE =
    /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*\.\.\s*(-?(?:\d+\.?\d*|\.\d+))\s*$/;

/**
 * Does one grid cell match a filter-row query? The grid dialog applies
 * this per column over the rows it already holds (client-side).
 *
 * Query grammar (all case-insensitive):
 *   - "" / whitespace       → matches everything (no filter);
 *   - "missing"|"null"|"nan"→ only missing cells (null/undefined/""/
 *                              non-finite numbers);
 *   - ">N" | ">=N" | "<N"  | "<=N" | "=N" — numeric comparison; cells
 *                              that are not numeric never match;
 *   - "A..B"                — inclusive numeric range;
 *   - anything else         → substring match on the cell's display
 *                              text, case-insensitive.
 */
export function matchesCellFilter(value: unknown, query: string): boolean {
    const q = query.trim();
    if (q === "") return true;
    const lower = q.toLowerCase();
    if (lower === "missing" || lower === "null" || lower === "nan") {
        return (
            isMissingValue(value) ||
            (typeof value === "number" && !Number.isFinite(value))
        );
    }
    const cmp = q.match(COMPARATOR_RE);
    if (cmp) {
        const n = numericCell(value);
        if (n === null) return false;
        const bound = Number(cmp[2]);
        switch (cmp[1]) {
            case ">":
                return n > bound;
            case ">=":
                return n >= bound;
            case "<":
                return n < bound;
            case "<=":
                return n <= bound;
            default:
                return n === bound;
        }
    }
    const range = q.match(RANGE_RE);
    if (range) {
        const n = numericCell(value);
        if (n === null) return false;
        return n >= Number(range[1]) && n <= Number(range[2]);
    }
    return cellFilterText(value).toLowerCase().includes(lower);
}

/* ------------------------------------------------------------------ */
/*  Affordance heuristics                                               */
/* ------------------------------------------------------------------ */

/**
 * The grammar the kernel's guarded resolver accepts, as a regex:
 * identifier ( .identifier | ["key"] | ['key'] | [123] )* — with
 * whitespace tolerance. `df`, `results[0]`, `cfg.paths["home"]` all
 * qualify; `df.head()` or `a + b` do not (no button — the Vars list
 * affordance still covers the underlying object by name).
 */
const SIMPLE_PATH_RE =
    /^[A-Za-z_][A-Za-z0-9_]*(?:\s*(?:\.\s*[A-Za-z_][A-Za-z0-9_]*|\[\s*(?:"[^"\\\n]*"|'[^'\\\n]*'|-?\d+)\s*\]))*$/;

/** Trimmed simple-path expression for a echoed In[N] line, else null. */
export function simplePathExpr(code: string): string | null {
    const t = code.trim();
    // Multi-line submissions / absurdly long lines are never object paths.
    if (!t || t.includes("\n") || t.length > 120) return null;
    return SIMPLE_PATH_RE.test(t) ? t : null;
}

/** Prefix slice the hint regexes run over — merged stdout blocks can be
 *  huge and the panel re-renders on every keystroke, so the hint must
 *  stay O(prefix), never O(text). */
const HINT_PREFIX = 2000;

/**
 * Conservative "this output block could be a table-like dict/list"
 * sniff for the affordance on plain-text results (DataFrame-shaped
 * blocks are detected by console-table/console-magics and get the
 * affordance through a different path). Recognized shapes:
 *   - `[{'a': 1}, ...]` / `({ ... })` — list/tuple of dicts
 *   - `[[1, 2], ...]` — list/tuple of sequences (≥ 2 rows worth of commas)
 *   - `{'a': [1, 2], ...}` — dict of lists
 *   - `{'a': 1, ...}` — dict of scalars (serializes as a one-row grid)
 * Click-gated and kernel-verified — false positives degrade to a toast.
 */
export function tableLikeReprHint(text: string): boolean {
    const t = (text.length > HINT_PREFIX ? text.slice(0, HINT_PREFIX) : text).trim();
    if (t.length < 4) return false;
    // `t` is left-trimmed, so char 0 is the container's opener; the inner
    // char is the first non-space after it — enough to tell "[{"/"({" /
    // "[["/"((" / "{'" apart without bracket-escaping regexes.
    const opener = t.charAt(0);
    const inner = t.slice(1).trimStart().charAt(0);
    if (opener === "[" || opener === "(") {
        if (inner === "{") return /:/.test(t); // list/tuple of dicts
        if (inner === "[" || inner === "(") return /,/.test(t); // of sequences
        return false;
    }
    // dict (of lists or scalars): starts with a quoted key
    if (opener === "{" && /^\{\s*['"]/.test(t)) return /:/.test(t);
    return false;
}
