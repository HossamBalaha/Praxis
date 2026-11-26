/**
 * csv-formula.ts — a tiny, safe spreadsheet-formula evaluator for the
 * editable CSV grid (Section 6,.
 *
 * Cells whose text starts with `=` are treated as formulas and get
 * evaluated PURE CLIENT-SIDE by this module; every other cell is plain
 * text. The grammar is deliberately minimal:
 *
 *   expr    := term (("+" | "-") term)*
 *   term    := factor (("*" | "/") factor)*
 *   factor  := NUMBER | CELLREF | FUNC "(" args ")" | "(" expr ")" | ("-"|"+") factor
 *   args    := arg ("," arg)*          arg := expr | CELLREF ":" CELLREF
 *   FUNC    := SUM | AVG | AVERAGE | MIN | MAX | COUNT | ABS | ROUND | SQRT
 *
 * Cell references are A1-style: column letters (A..ZZZ, case-insensitive)
 * + 1-based DATA-row number — row 1 is the first data row (the header
 * row is not referenceable; the grid renders its own row numbers
 * starting at 1 for data). Referenced cells may themselves hold
 * formulas — evaluation is recursive with a shared visiting-set so a
 * cycle surfaces as `#CIRC!` instead of a hang.
 *
 * SAFETY: there is no eval / Function / dynamic code anywhere — a
 * hand-written recursive-descent parser over a strict token stream is
 * the whole engine, so a malicious spreadsheet can only ever produce
 * numbers or an error string.
 *
 * Errors mirror spreadsheet conventions where it helps (#DIV/0!,
 * #VALUE!, #NAME?, #REF!, #NUM!, #CIRC!) and are returned as
 * `{ error: "..." }` — the grid renders the error text in the cell.
 */

export interface FormulaGrid {
    headers: string[];
    rows: string[][];
}

export interface FormulaResult {
    /** Present on success. */
    value?: number;
    /** Present on failure; the string the grid displays in the cell. */
    error?: string;
}

/* ================================================================== */
/*  Tokenizer                                                          */
/* ================================================================== */

type Tok =
    | { t: "num"; v: number }
    | { t: "ref"; col: number; row: number }
    | { t: "name"; v: string }
    | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")" | "," | ":" };

const OP_CHARS = new Set(["+", "-", "*", "/", "(", ")", ",", ":"]);
type OpChar = "+" | "-" | "*" | "/" | "(" | ")" | "," | ":";

/** Split a formula body (after the leading `=`) into tokens. Returns
 *  null on an illegal character (→ #VALUE!). */
function tokenize(src: string): Tok[] | null {
    const toks: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch === " " || ch === "\t") {
            i++;
            continue;
        }
        if (/[0-9.]/.test(ch)) {
            const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(src.slice(i));
            if (!m) return null;
            const v = Number(m[0]);
            if (!Number.isFinite(v)) return null;
            toks.push({t: "num", v});
            i += m[0].length;
            continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            // A run of letters+digits: a CELLREF when it matches
            // [letters][digits] exactly, else a function/identifier name.
            const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
            const word = m[0];
            const ref = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(word);
            if (ref) {
                toks.push({
                    t: "ref",
                    col: colLettersToIndex(ref[1]),
                    row: parseInt(ref[2], 10),
                });
            } else {
                toks.push({t: "name", v: word.toUpperCase()});
            }
            i += word.length;
            continue;
        }
        if (OP_CHARS.has(ch)) {
            toks.push({t: "op", v: ch as OpChar});
            i++;
            continue;
        }
        return null; // illegal character
    }
    return toks;
}

/** "A" → 0, "B" → 1, … "AA" → 26 (0-based column index). */
function colLettersToIndex(letters: string): number {
    let n = 0;
    for (const ch of letters.toUpperCase()) {
        n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n - 1;
}

/** 0-based column index → letters ("A", "AB") — used in the cycle
 *  bookkeeping keys and exported for tests / error labels. */
export function colIndexToLetters(index: number): string {
    let n = index + 1;
    let out = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out || "A";
}

/* ================================================================== */
/*  Evaluator                                                          */
/* ================================================================== */

const FUNC_ARITY: Record<string, { min: number; max: number }> = {
    SUM: {min: 1, max: 64},
    AVG: {min: 1, max: 64},
    AVERAGE: {min: 1, max: 64},
    MIN: {min: 1, max: 64},
    MAX: {min: 1, max: 64},
    COUNT: {min: 1, max: 64},
    ABS: {min: 1, max: 1},
    ROUND: {min: 1, max: 2},
    SQRT: {min: 1, max: 1},
};

/** A range literal collected as a call argument (corners normalized). */
interface RangeArg {
    from: [number, number];
    to: [number, number];
}

class Parser {
    private pos = 0;
    /** Cells currently being evaluated — SHARED across the recursion
     *  (including nested formula cells) so a cycle at any depth is
     *  caught once and reported as #CIRC!. */
    private visiting = new Set<string>();
    /** Set when the cycle guard trips; the top level converts any
     * result into #CIRC! so the user sees the real cause. */
    private cyclic = false;

    constructor(
        private toks: Tok[],
        private grid: FormulaGrid
    ) {
    }

    /** True when a cycle was hit during this evaluation (top level
     *  converts the result to #CIRC! — a nested #CIRC! string also sets
     *  it via the shared flag). */
    get sawCycle(): boolean {
        return this.cyclic;
    }

    /** True when every token was consumed (a public mirror of the
     *  private pos — evaluateFormula checks for trailing junk). */
    get fullyConsumed(): boolean {
        return this.pos === this.toks.length;
    }

    /** expr := term (("+" | "-") term)* */
    parseExpr(): FormulaResult {
        let left = this.parseTerm();
        if (left.error) return left;
        for (; ;) {
            if (this.eatOp("+")) {
                const right = this.parseTerm();
                if (right.error) return right;
                left = {value: (left.value ?? 0) + (right.value ?? 0)};
            } else if (this.eatOp("-")) {
                const right = this.parseTerm();
                if (right.error) return right;
                left = {value: (left.value ?? 0) - (right.value ?? 0)};
            } else {
                return left;
            }
        }
    }

    private peek(): Tok | undefined {
        return this.toks[this.pos];
    }

    private eatOp(v: OpChar): boolean {
        const t = this.peek();
        if (t && t.t === "op" && t.v === v) {
            this.pos++;
            return true;
        }
        return false;
    }

    /** term := factor (("*" | "/") factor)* */
    private parseTerm(): FormulaResult {
        let left = this.parseFactor();
        if (left.error) return left;
        for (; ;) {
            if (this.eatOp("*")) {
                const right = this.parseFactor();
                if (right.error) return right;
                left = {value: (left.value ?? 0) * (right.value ?? 0)};
            } else if (this.eatOp("/")) {
                const right = this.parseFactor();
                if (right.error) return right;
                if (right.value === 0) return {error: "#DIV/0!"};
                left = {value: (left.value ?? 0) / (right.value ?? 0)};
            } else {
                return left;
            }
        }
    }

    /** factor := NUM | REF | FUNC(args) | "(" expr ")" | ("-"|"+") factor */
    private parseFactor(): FormulaResult {
        if (this.eatOp("-")) {
            const inner = this.parseFactor();
            if (inner.error) return inner;
            return {value: -(inner.value ?? 0)};
        }
        if (this.eatOp("+")) {
            // Unary plus — harmless; allow `=+A1`.
            return this.parseFactor();
        }
        const t = this.peek();
        if (!t) return {error: "#VALUE!"};
        if (t.t === "num") {
            this.pos++;
            return {value: t.v};
        }
        if (t.t === "ref") {
            this.pos++;
            // A bare range USE (`=A1:A5`) is not a scalar — reject so it is
            // #VALUE!, never a silent single cell.
            if (this.eatOp(":")) return {error: "#VALUE!"};
            return this.readCell(t.col, t.row);
        }
        if (t.t === "name") {
            this.pos++;
            return this.parseCall(t.v);
        }
        if (t.t === "op" && t.v === "(") {
            this.pos++;
            const inner = this.parseExpr();
            if (inner.error) return inner;
            if (!this.eatOp(")")) return {error: "#VALUE!"};
            return inner;
        }
        return {error: "#VALUE!"};
    }

    /** FUNC "(" args ")" — each arg is a scalar expr or a range. */
    private parseCall(name: string): FormulaResult {
        if (!(name in FUNC_ARITY)) return {error: "#NAME?"};
        if (!this.eatOp("(")) return {error: "#VALUE!"};
        const args: Array<number | RangeArg> = [];
        if (!this.eatOp(")")) {
            for (; ;) {
                const arg = this.parseArg();
                // parseArg returns a number, a RangeArg, or { error } — the
                // `in` check needs an object (numbers throw on `in`).
                if (typeof arg === "object" && arg !== null && "error" in arg) {
                    return {error: (arg as { error: string }).error};
                }
                args.push(arg as number | RangeArg);
                if (this.eatOp(",")) continue;
                if (this.eatOp(")")) break;
                return {error: "#VALUE!"};
            }
        }
        const arity = FUNC_ARITY[name];
        if (args.length < arity.min || args.length > arity.max) {
            return {error: "#VALUE!"};
        }

        // ABS / ROUND / SQRT — scalar functions (range args are invalid).
        if (name === "ABS" || name === "SQRT" || name === "ROUND") {
            for (const a of args) {
                if (typeof a !== "number") return {error: "#VALUE!"};
            }
            const v = args[0] as number;
            if (name === "ABS") return {value: Math.abs(v)};
            if (name === "SQRT") {
                if (v < 0) return {error: "#NUM!"};
                return {value: Math.sqrt(v)};
            }
            const digits = args.length > 1 ? Math.trunc(args[1] as number) : 0;
            if (digits < -15 || digits > 15) return {error: "#NUM!"};
            const f = Math.pow(10, digits);
            return {value: Math.round(v * f) / f};
        }

        // Aggregate functions — flatten args to the numeric cells they
        // cover (ranges expand; non-numeric scalars stay as-is).
        const nums: number[] = [];
        for (const a of args) {
            if (typeof a === "number") {
                nums.push(a);
                continue;
            }
            const vals = this.rangeValues(a);
            if ("error" in vals) return {error: vals.error};
            nums.push(...vals.values);
        }
        if (name === "SUM") return {value: nums.reduce((s, v) => s + v, 0)};
        if (name === "COUNT") return {value: nums.length};
        if (nums.length === 0) return {error: "#NUM!"}; // AVG/MIN/MAX of nothing
        if (name === "AVG" || name === "AVERAGE") {
            return {value: nums.reduce((s, v) => s + v, 0) / nums.length};
        }
        if (name === "MIN") return {value: Math.min(...nums)};
        return {value: Math.max(...nums)}; // MAX
    }

    /** One call argument: a range (`A1:B2`, normalized to whichever
     *  corner order) or a scalar expression. */
    private parseArg(): number | RangeArg | { error: string } {
        const t = this.peek();
        if (t && t.t === "ref") {
            // Look ahead for ":" REF — a range literal.
            const next = this.toks[this.pos + 1];
            if (next && next.t === "op" && next.v === ":") {
                const after = this.toks[this.pos + 2];
                if (after && after.t === "ref") {
                    const from: [number, number] = [t.col, t.row];
                    const to: [number, number] = [after.col, after.row];
                    this.pos += 3;
                    return {
                        from: [Math.min(from[0], to[0]), Math.min(from[1], to[1])],
                        to: [Math.max(from[0], to[0]), Math.max(from[1], to[1])],
                    };
                }
            }
        }
        const scalar = this.parseExpr();
        if (scalar.error) return {error: scalar.error};
        return scalar.value ?? 0;
    }

    /** Expand a range to the numeric values of its cells. Cells that are
     *  EMPTY or non-numeric text are SKIPPED by aggregates (the pragmatic
     *  spreadsheet convention: labels in a column don't poison SUM), a
     *  nested formula error inside the range propagates. */
    private rangeValues(r: RangeArg): { values: number[] } | { error: string } {
        const values: number[] = [];
        for (let row = r.from[1]; row <= r.to[1]; row++) {
            for (let col = r.from[0]; col <= r.to[0]; col++) {
                const raw = this.rawCell(col, row);
                if (raw === null) continue; // outside the grid — skipped
                if (raw.trim() === "") continue; // blank — skipped
                const num = this.cellNumber(col, row, raw);
                if (typeof num === "string") return {error: num};
                if (num !== null) values.push(num);
            }
        }
        return {values};
    }

    /** Read one cell as a scalar (strict: text → #VALUE!). */
    private readCell(col: number, row: number): FormulaResult {
        const raw = this.rawCell(col, row);
        if (raw === null) return {error: "#REF!"};
        if (raw.trim() === "") return {value: 0};
        const num = this.cellNumber(col, row, raw);
        if (typeof num === "string") return {error: num};
        if (num === null) return {error: "#VALUE!"};
        return {value: num};
    }

    /** Raw text of a cell, or null when the ref is outside the grid. */
    private rawCell(col: number, row: number): string | null {
        if (row < 1 || row > this.grid.rows.length) return null;
        const cells = this.grid.rows[row - 1];
        if (col < 0 || col >= cells.length) return null;
        return cells[col] ?? "";
    }

    /** A cell's numeric value: a plain number, or (when the cell is
     *  itself a formula) its recursively-evaluated result.
     *  Returns null for non-numeric text, or an error string. */
    private cellNumber(col: number, row: number, raw: string): number | string | null {
        if (raw.startsWith("=")) {
            const key = `${colIndexToLetters(col)}${row}`;
            if (this.visiting.has(key)) {
                this.cyclic = true; // flag → top level reports #CIRC!
                return "#CIRC!";
            }
            this.visiting.add(key);
            try {
                const toks = tokenize(raw.slice(1));
                if (!toks) return "#VALUE!";
                // Nested formula: a CHILD parser sharing the visiting set so
                // cycles through any depth are one event.
                const sub = new Parser(toks, this.grid);
                sub.visiting = this.visiting;
                const res = sub.parseExpr();
                if (sub.cyclic) this.cyclic = true; // bubble the cycle flag up
                if (res.error) return res.error;
                if (!sub.fullyConsumed) return "#VALUE!";
                return res.value ?? 0;
            } finally {
                this.visiting.delete(key);
            }
        }
        const t = raw.trim().replace(/,/g, "");
        if (!/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
}

/* ================================================================== */
/*  Public API                                                         */

/* ================================================================== */

/**
 * Evaluate one cell of the grid.
 *  - Returns null when the raw text is not a formula (the grid shows
 *    the raw text unchanged).
 *  - Returns { error } for malformed / circular / bad-reference
 *    formulas — the grid renders the error string in the cell.
 */
export function evaluateCell(raw: string, grid: FormulaGrid): FormulaResult | null {
    if (typeof raw !== "string" || !raw.startsWith("=") || raw.trim().length <= 1) {
        return null;
    }
    return evaluateFormula(raw.slice(1), grid);
}

/** Evaluate a formula body (no leading `=`) against the grid. */
export function evaluateFormula(body: string, grid: FormulaGrid): FormulaResult {
    const toks = tokenize(body);
    if (!toks) return {error: "#VALUE!"};
    const parser = new Parser(toks, grid);
    const res = parser.parseExpr();
    // A cycle anywhere in the evaluation is the headline error — it
    // overrides whatever partial value/error bubbled up, because the
    // cause is the reference loop, not the arithmetic.
    if (parser.sawCycle) return {error: "#CIRC!"};
    if (res.error) return res;
    if (!parser.fullyConsumed) return {error: "#VALUE!"}; // trailing junk
    if (!Number.isFinite(res.value ?? 0)) return {error: "#NUM!"};
    return res;
}

/**
 * Evaluate the FULL grid into a display matrix: each cell resolves to
 * its displayed text (formula → evaluated number / error text; plain
 * text unchanged). The grid editor renders exactly this.
 */
export function evaluateGrid(grid: FormulaGrid): string[][] {
    return grid.rows.map((row) =>
        row.map((cell) => {
            const res = evaluateCell(cell, grid);
            if (res === null) return cell;
            if (res.error) return res.error;
            // Trim float noise: 0.1+0.2 → 0.3 (12 significant digits, the
            // spreadsheet display convention).
            const v = res.value ?? 0;
            return String(Math.round(v * 1e12) / 1e12);
        })
    );
}

/** True when any formula cell in the grid participates in a reference
 *  cycle (a future formula-check pass can badge the grid). */
export function hasCircularReference(grid: FormulaGrid): boolean {
    return grid.rows.some((row) =>
        row.some((cell) => {
            if (typeof cell !== "string" || !cell.startsWith("=")) return false;
            return evaluateCell(cell, grid)?.error === "#CIRC!";
        })
    );
}
