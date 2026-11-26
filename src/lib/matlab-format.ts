/**
 * MATLAB (.m) auto-format + auto-indent.
 *
 * "what about matlab files? i need also to include
 * handling those files (autoformat and auto ident)".
 *
 * MATLAB blocks are keyword-delimited (function/if/for/while/switch/
 * try/parfor/classdef/properties/methods/events … end), NOT brace
 * delimited, so this is a dedicated re-indenter:
 *
 * ▸ a stack of block keywords drives the level; `end` (only when it
 * starts the statement — `a(end)` indexing never counts) pops it;
 * ▸ else / elseif / case / otherwise / catch print at their
 * opener's level (one shallower than the body);
 * › `…` continuations keep the body line's indent + one extra step;
 * ▸ old-style multi-function files (functions WITHOUT a matching
 * end, separated at column 0) reset cleanly instead of drifting;
 * ▸ the spacing pass is transpose-aware: `x'` stays an operator,
 * `'text'` stays a string (`''` escapes included).
 *
 * Same lossless design as the other formatters: lines are never
 * joined or split, semicolons are never added or removed.
 */

export interface MatlabFormatOptions {
    /** Spaces per indent level (default 2; the per-language setting wins). */
    indentWidth?: number;
    /** Ensure exactly one trailing newline (default true). */
    finalNewline?: boolean;
}

const DEFAULT_WIDTH = 2;

/** Keywords that OPEN a block. `properties` / `methods` / `events` /
 *  `arguments` / `enumeration` only appear inside classdef but are
 *  counted generically — they always pair with `end` anyway. */
const OPENERS = new Set([
    "function", "if", "for", "while", "switch", "try", "parfor",
    "classdef", "properties", "methods", "events", "arguments",
    "enumeration",
]);

/** Keywords that print at the ENCLOSING block's level (one shallower
 *  than the body they live in). */
const PEERS = new Set(["else", "elseif", "catch"]);

/** `case` / `otherwise` labels print AT the switch body's level (their
 *  statements one deeper) — not at the opener's level like else. */
const CASE_LABELS = new Set(["case", "otherwise"]);

/** First code word of a MATLAB line (comments and leading blanks
 *  skipped). Returns "" for blank / comment-only lines. */
function firstWord(line: string): string {
    const bare = line.replace(/^[ \t]+/, "");
    if (bare === "" || bare.startsWith("%")) return "";
    // Strip a leading `end`-ish statement down to its first word.
    const m = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(bare);
    return m ? m[1] : "";
}

/** Is this line a bare `end` statement (block closer) — NOT the
 *  indexing `end` inside expressions like `a(end)` or `x(end-1)`? */
function isEndStatement(line: string): boolean {
    const bare = line.replace(/^[ \t]+/, "");
    if (!/^end\b/.test(bare)) return false; // `end)`, `end-1`, `ends`… stay inline
    const rest = bare.slice(3);
    // `end` · `end;` · `end,` · `end   % comment` — a real block closer.
    if (rest === "" || /^[;,]/.test(rest) || /^\s/.test(rest)) return true;
    return false;
}

/* ──────────────────────────────────────────────────────────────────
 * Tokenizer — strings (with '' escapes), transpose, comments.
 * ────────────────────────────────────────────────────────────────── */

export interface MToken {
    kind: "word" | "num" | "str" | "com" | "punct" | "ws";
    text: string;
}

/** Tokenize ONE MATLAB line. A `'` right after an identifier, a
 *  closer (`)` `]` `}`), a `.` or another `'` is the TRANSPOSE
 *  operator; everywhere else it opens a char-array string. */
export function tokenizeMatlabLine(line: string): MToken[] {
    const tokens: MToken[] = [];
    let i = 0;
    const push = (kind: MToken["kind"], text: string) => tokens.push({kind, text});

    while (i < line.length) {
        const ch = line[i];
        if (ch === " " || ch === "\t") {
            let j = i;
            while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
            push("ws", line.slice(i, j));
            i = j;
            continue;
        }
        // Comments run to end-of-line.
        if (ch === "%") {
            push("com", line.slice(i));
            break;
        }
        // String or transpose?
        if (ch === "'") {
            const prev = tokens[tokens.length - 1];
            const prevIsValue =
                prev &&
                (prev.kind === "word" ||
                    prev.kind === "num" ||
                    prev.kind === "str" ||
                    (prev.kind === "punct" && [")", "]", "}", ".", "'"].includes(prev.text)));
            if (!prevIsValue) {
                // Char-array string with '' escapes.
                let j = i + 1;
                while (j < line.length) {
                    if (line[j] === "'") {
                        if (line[j + 1] === "'") {
                            j += 2; // '' escape
                            continue;
                        }
                        j++;
                        break;
                    }
                    j++;
                }
                push("str", line.slice(i, Math.min(j, line.length)));
                i = j;
                continue;
            }
            push("punct", "'");
            i++;
            continue;
        }
        // Words / numbers.
        if (/[A-Za-z0-9_]/.test(ch)) {
            let j = i;
            while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
            push(/^[0-9]/.test(ch) ? "num" : "word", line.slice(i, j));
            i = j;
            continue;
        }
        push("punct", ch);
        i++;
    }
    return tokens;
}

/* ──────────────────────────────────────────────────────────────────
 * Re-indent.
 * ────────────────────────────────────────────────────────────────── */

export function reindentMatlab(src: string, opts: MatlabFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");

    const stack: string[] = [];
    let continuation = false;
    /** Statements directly under a case/otherwise label sit one deeper
     *  than the label, until the next label or the switch's `end`. */
    let caseOpen = false;
    const out: string[] = [];

    for (const raw of lines) {
        const bare = raw.replace(/^[ \t]+/, "");
        const word = firstWord(raw);

        if (bare === "" || bare.startsWith("%")) {
            out.push(raw.replace(/\s+$/, ""));
            continuation = false;
            continue;
        }

        // Continuation of a `...` line: body indent + one extra step.
        if (continuation) {
            const level = Math.max(0, stack.length) * width;
            out.push(" ".repeat(level + width) + raw.replace(/^[ \t]+/, "").replace(/\s+$/, ""));
            continuation = /\.\.\.\s*(%.*)?$/.test(bare);
            continue;
        }

        // Old-style separator: a top-level `function` while the innermost
        // open block is ALSO a function without its end → replace it.
        if (word === "function" && stack[stack.length - 1] === "function") {
            stack.pop();
        }

        // Block closer.
        if (isEndStatement(raw)) {
            const closed = stack.pop();
            if (closed === "switch") caseOpen = false;
            out.push(" ".repeat(Math.max(0, stack.length) * width) + bare.replace(/\s+$/, ""));
            continuation = false;
            continue;
        }

        // Peer keywords print at the opener's level.
        if (word && PEERS.has(word.toLowerCase())) {
            out.push(" ".repeat(Math.max(0, stack.length - 1) * width) + bare.replace(/\s+$/, ""));
            continuation = /\.\.\.\s*(%.*)?$/.test(bare);
            continue;
        }
        // Case labels print at the switch body's level; their statements
        // (below) sit one deeper.
        if (word && CASE_LABELS.has(word.toLowerCase())) {
            caseOpen = true;
            out.push(" ".repeat(Math.max(0, stack.length) * width) + bare.replace(/\s+$/, ""));
            continuation = /\.\.\.\s*(%.*)?$/.test(bare);
            continue;
        }

        // Regular statement at the current level (+1 inside a case body).
        out.push(" ".repeat(Math.max(0, stack.length + (caseOpen ? 1 : 0)) * width) + bare.replace(/\s+$/, ""));
        continuation = /\.\.\.\s*(%.*)?$/.test(bare);

        if (word && OPENERS.has(word.toLowerCase())) {
            // `if` on a continuation-less line always opens; `for`/`while`
            // likewise. One subtlety: `else`/`elseif` never reach here.
            stack.push(word.toLowerCase());
        }
    }

    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed: string[] = [];
    for (const l of out) {
        if (l === "" && collapsed.length > 0 && collapsed[collapsed.length - 1] === "") continue;
        collapsed.push(l);
    }
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ──────────────────────────────────────────────────────────────────
 * Spacing pass — normalize whitespace BETWEEN preserved tokens.
 * ────────────────────────────────────────────────────────────────── */

/** MATLAB spacing rules (prettier-light):
 *   ▸ space after commas and semicolons (when content follows),
 *   ▸ space around `=` (never `==` — that's a comparison, also spaced),
 *   ▸ keywords keep one space before their opening paren if any,
 *   ▸ strings, transpose `'` and comments are frozen atoms. */
export function applyMatlabSpacing(line: string): string {
    const tokens = tokenizeMatlabLine(line);
    const code = tokens.filter((t) => t.kind !== "ws");
    if (code.length === 0) return line.replace(/\s+$/, "");

    // Merge two-char operators — only when the RESULT is a real MATLAB
    // operator (`=` + `-` never merges into `=-`; `.` + `*` merges for
    // the element-wise `.*`).
    const KNOWN_MATLAB_OPS = new Set([
        "==", "<=", ">=", "~=", "&&", "||", ".*", "./", ".^", ".'",
        ".*=", "./=", ".^=", "+=", "-=", "*=", "/=", "^=",
    ]);
    const merged: MToken[] = [];
    for (const tok of code) {
        const prev = merged[merged.length - 1];
        if (
            prev &&
            prev.kind === "punct" &&
            tok.kind === "punct" &&
            KNOWN_MATLAB_OPS.has(prev.text + tok.text)
        ) {
            prev.text += tok.text;
            continue;
        }
        merged.push({...tok});
    }

    let out = "";
    for (let t = 0; t < merged.length; t++) {
        const tok = merged[t];
        if (t === 0) {
            out += tok.text;
            continue;
        }
        const prev = merged[t - 1];
        // A `-`/`+` in PREFIX position (nothing value-like before it)
        // binds tightly to the value that follows: r = -1.
        const prevIsPrefixUnary =
            prev.kind === "punct" &&
            (prev.text === "-" || prev.text === "+") &&
            (t - 2 < 0 || merged[t - 2].kind === "punct");
        const p = prev.text;
        const c = tok.text;

        let space: boolean;
        if (tok.kind === "com") {
            space = true; // one space before a trailing comment
        } else if (tok.kind === "str" || tok.kind === "word" || tok.kind === "num") {
            if (prevIsPrefixUnary) {
                space = false; // -1 binds to its sign
            } else if (prev.kind === "punct") {
                if (p === "," || p === ";") space = true;
                /* a colon binds TIGHT on both sides (`0:n`, not the
                          mixed `0: n`) — the MATLAB range style. */
                else if (p === "'" || p === "." || p === "@" || p === "(" || p === ":") space = false;
                else if (p === "[" || p === "{") space = false;
                else space = true; // after an operator: `x = 'a'`, `a == b`
            } else {
                space = true; // word word
            }
        } else {
            // punct after anything
            if (c === "," || c === ";" || c === "'" || c === "." || c === "@" || c === ":") space = false;
            else if (c === "(" || c === ")" || c === "]" || c === "}") {
                /* a paren that FOLLOWS an operator is spaced —
                          `t = (0:n)' / 10` — while call parens after words stay
                          tight (`zeros(3, 3)`). */
                space = c === "(" && prev.kind === "punct" && /^[=<>~&|+\-*/^]+$/.test(p);
            } else if (c === "[" || c === "{") {
                // A matrix/cell literal after an operator is spaced: `= [1 2]`;
                // tight after an opener or comma: `f([1 2])`.
                space = !(prev.kind === "punct" && ["(", "[", "{", ",", ";", "'", ".", "@"].includes(p));
            } else if (/^[=<>~&|+\-*/^]+$/.test(c)) {
                // Unary minus/plus stays tight after an opener, comma or
                // another unary — spaced after `=` (r = -1) and after words.
                if (c === "-" || c === "+") {
                    if (prev.kind === "punct" && ["(", "[", "{", ",", ";"].includes(p)) space = false;
                    else if (prev.kind === "punct" && /^[=<>~&|+\-*/^]+$/.test(p) && c === p) space = false;
                    else space = true;
                } else if (prev.kind === "punct" && [".", "@", "(", "[", "{"].includes(p)) space = false;
                /* after a transpose `'` the VALUE is complete, so a
                          following operator is BINARY and gets its spaces —
                          `(0:n)' / 10`, not `)'/ 10`. */
                else space = true;
            } else space = false;
        }
        out += (space ? " " : "") + tok.text;
    }
    return out.replace(/\s+$/, "");
}

/** Auto-format — re-indent + the spacing pass. */
export function formatMatlab(src: string, opts: MatlabFormatOptions = {}): string {
    const indented = reindentMatlab(src, opts);
    const lines = indented.replace(/\r\n?/g, "\n").split("\n");
    const spaced = lines.map((l) => {
        const trimmed = l.trim();
        if (trimmed === "" || trimmed.startsWith("%")) return l.replace(/\s+$/, "");
        const indent = l.slice(0, l.length - l.trimStart().length);
        return indent + applyMatlabSpacing(trimmed);
    });
    const collapsed: string[] = [];
    for (const l of spaced) {
        if (l === "" && collapsed.length > 0 && collapsed[collapsed.length - 1] === "") continue;
        collapsed.push(l);
    }
    while (collapsed.length > 0 && collapsed[collapsed.length - 1] === "") collapsed.pop();
    const joined = collapsed.join("\n");
    return (opts.finalNewline ?? true) ? `${joined}\n` : joined;
}
