/**
 * formatters for the CURLY-BRACE language family and shell.
 *
 * "i need the app to handle web design and development
 * files like css, ts, js, etc. I need for now autoformat and auto
 * ident" + "i am not limited to JS and MATLAB only; invest time and
 * effort handling different languages".
 *
 * Families covered here (MATLAB lives in matlab-format.ts):
 * ▸ JavaScript / TypeScript / JSX / TSX / MJS — re-indent + a
 * conservative spacing pass (formatJs); template literals,
 * strings, comments and regex literals stay frozen.
 * ▸ Java — same family, no template literals.
 * ▸ C / C++ — same family, no template literals.
 * ▸ R — re-indent only (# comments; R spacing is authorial).
 * ▸ Shell (bash/zsh) — keyword-block re-indent (if/then/fi,
 * for/do/done, case/esac, function braces) with heredoc bodies
 * and line continuations frozen verbatim.
 *
 * DESIGN RULE: never join or split lines, never add/remove semicolons
 * or braces — the re-indenter only moves leading whitespace and the
 * spacing pass only normalizes whitespace BETWEEN preserved tokens.
 * That keeps the beautifier lossless for the right-click Auto-format /
 * Auto-indent entries in view AND edit modes.
 */

export interface CodeFormatOptions {
    /** Spaces per indent level (default 2; the per-language setting wins). */
    indentWidth?: number;
    /** Ensure exactly one trailing newline (default true). */
    finalNewline?: boolean;
    /** setting — run the operator/comma spacing pass too
     *  (JS/TS family only; default true = Settings → Formatting). */
    operatorSpacing?: boolean;
    /** setting — JS/TS/JSX/TSX quote normalization on
     *  Auto-format ("double" = 'x' → "x" when safe; "single" = the
     *  reverse; "keep"/undefined leaves the author's quotes).
     *  Template literals, comments and regex are NEVER touched. */
    quoteStyle?: "keep" | "double" | "single";
    /** setting — spaces INSIDE object-literal braces: { a: 1 }
     *  (default true = Prettier's bracketSpacing; false = {a: 1}).
     *  Applies to the JS-family spacing pass only — code blocks and
     *  arrays are always tight. */
    bracketSpacing?: boolean;
}

const DEFAULT_WIDTH = 2;

/* ──────────────────────────────────────────────────────────────────
 * Tokenizer — shared by every curly-family formatter.
 * ────────────────────────────────────────────────────────────────── */

export type TokKind = "word" | "num" | "str" | "tpl" | "com" | "reg" | "punct" | "ws";

export interface Token {
    kind: TokKind;
    text: string;
    /** 1-based line the token starts on. */
    line: number;
}

const OPENERS = "([{";
const CLOSERS = ")]}";

/** Tokenize with string / template / comment / regex awareness.
 *  `hashComments` switches the line-comment marker from `//` to `#`
 *  (R); `template` enables backtick template literals (JS family). */
export function tokenizeCurly(
    src: string,
    opts: { hashComments?: boolean; template?: boolean } = {}
): Token[] {
    const lineComment = opts.hashComments ? "#" : "//";
    const blockComment = !opts.hashComments; // /* */ only where // exists
    const template = opts.template ?? true;
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;

    const push = (kind: TokKind, text: string, atLine = line) =>
        tokens.push({kind, text, line: atLine});

    while (i < src.length) {
        const ch = src[i];
        if (ch === "\n") {
            let j = i;
            while (j < src.length && (src[j] === "\n" || src[j] === "\r")) j++;
            push("ws", src.slice(i, j));
            line += (src.slice(i, j).match(/\n/g) ?? []).length;
            i = j;
            continue;
        }
        if (ch === " " || ch === "\t") {
            let j = i;
            while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
            push("ws", src.slice(i, j));
            i = j;
            continue;
        }
        // Strings — ' and " with backslash escapes.
        if (ch === "'" || ch === '"') {
            let j = i + 1;
            while (j < src.length) {
                if (src[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (src[j] === ch) {
                    j++;
                    break;
                }
                if (src[j] === "\n") break; // unterminated — stop at EOL
                j++;
            }
            push("str", src.slice(i, j));
            i = j;
            continue;
        }
        // Template literals — the WHOLE literal (with its ${} holes) is
        // one frozen token: interpolation braces must NOT affect code
        // depth, and the author's own line breaks are preserved.
        if (template && ch === "`") {
            let j = i + 1;
            while (j < src.length && src[j] !== "`") {
                if (src[j] === "\\") {
                    j += 2;
                    continue;
                }
                j++;
            }
            const text = src.slice(i, Math.min(j + 1, src.length));
            const startLine = line;
            push("tpl", text, startLine);
            line += (text.match(/\n/g) ?? []).length;
            i = j + 1;
            continue;
        }
        // Line comments.
        if (src.startsWith(lineComment, i)) {
            const nl = src.indexOf("\n", i);
            const stop = nl < 0 ? src.length : nl;
            push("com", src.slice(i, stop));
            i = stop;
            continue;
        }
        // Block comments.
        if (blockComment && src.startsWith("/*", i)) {
            let j = src.indexOf("*/", i + 2);
            const stop = j < 0 ? src.length : j + 2;
            const text = src.slice(i, stop);
            const startLine = line;
            push("com", text, startLine);
            line += (text.match(/\n/g) ?? []).length;
            i = stop;
            continue;
        }
        // Regex literals (JS family): a / after an operator, an opener, a
        // keyword or a comma starts a regex, not a division.
        // skip the WS token between the operator and the
        // slash (see lastMeaningfulToken).
        if (!opts.hashComments && ch === "/" && (i === 0 || isRegexContext(lastMeaningfulToken(tokens)))) {
            let j = i + 1;
            let inClass = false;
            while (j < src.length) {
                const c = src[j];
                if (c === "\\") {
                    j += 2;
                    continue;
                }
                if (c === "\n") break; // not a regex after all — bail at EOL
                if (c === "[") inClass = true;
                else if (c === "]") inClass = false;
                else if (c === "/" && !inClass) {
                    j++;
                    break;
                }
                j++;
            }
            push("reg", src.slice(i, j));
            i = j;
            continue;
        }
        // Words / numbers (numbers may start with a digit only here — a
        // leading-dot float like `.5` arrives as punct `.` + num, and the
        // spacing pass keeps them tight).
        if (/[A-Za-z0-9_$]/.test(ch)) {
            let j = i;
            while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
            push(
                /^[0-9]/.test(src.slice(i, j)) ? "num" : "word",
                src.slice(i, j)
            );
            i = j;
            continue;
        }
        push("punct", ch);
        i++;
    }
    return tokens;
}

const REGEX_CONTEXT_WORDS = new Set([
    "return", "typeof", "case", "in", "of", "new", "delete", "void",
    "do", "else", "yield", "await", "throw", "instanceof",
]);

/** the last MEANINGINGFUL token (skipping whitespace) —
 *  `x = /re/` and `return /re/` have a WS token between the operator
 *  and the slash, and the raw `tokens[length-1]` was that WS token,
 *  which isRegexContext treated as division. Regex literals after
 *  `= `, `return `, `, `, `(` were mis-tokenized as punct + str +
 *  punct — the `'quoted'` inside /'quoted'/ then became a string
 *  token the quote-normalizer rewrote. */
function lastMeaningfulToken(tokens: Token[]): Token | undefined {
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].kind !== "ws") return tokens[i];
    }
    return undefined;
}

function isRegexContext(prev: Token | undefined): boolean {
    if (!prev) return true;
    if (prev.kind === "punct") {
        /* `/` after a CLOSER (`) ] }`), a postfix
       `++`/`--` or a member `.` is DIVISION (`(a + b) / c`,
       `arr[i] / 2`, `n++ / total`) — treating it as a regex start
       swallowed the rest of the line as one frozen token, skipping
       every paren inside it and drifting the indent depth for ALL
       following lines. After openers,
       commas, semicolons, colons and operators a regex can start
       (`x = /re/`, `f(/a/)`, `return /re/`).
       FIX 2: postfix `++`/`--` is ALSO division (the
       comment promised it; the code never checked it). */
        if (CLOSERS.includes(prev.text)) return false;
        if (prev.text === ".") return false; // member access → division context
        if (prev.text === "++" || prev.text === "--") return false; // postfix → division
        return true;
    }
    if (prev.kind === "word") return REGEX_CONTEXT_WORDS.has(prev.text);
    return false; // num / str / tpl / com / reg → division
}

/* ──────────────────────────────────────────────────────────────────
 * Re-indent — the shared curly-family pass.
 * ────────────────────────────────────────────────────────────────── */

/** Depth BEFORE each token (openers bump after themselves, closers
 *  bump before themselves) — one linear pass, then a per-line lookup.
 *
 * paren continuation ABSORPTION: an unclosed call paren
 *  whose line ALSO opened a still-open `{` (the `f(cb => {` callback
 *  shape) does NOT add an indent level — the block brace takes over,
 *  so the callback body sits one level under the STATEMENT (matching
 *  what mainstream formatters print) instead of two. Plain multi-line
 *  calls without a brace (`foo(\n  arg\n)`) still indent their
 *  continuation lines. */
interface OpenerEntry {
    text: string;
    line: number;
    counts: boolean;
}

function depthIndex(tokens: Token[]): { depthBefore: number[]; firstOfLine: Map<number, number> } {
    const depthBefore: number[] = new Array(tokens.length);
    const firstOfLine = new Map<number, number>();
    const stack: OpenerEntry[] = [];
    /** Counting depth = stack entries that count (see absorption below). */
    const countingDepth = () => {
        let n = 0;
        for (const e of stack) if (e.counts) n++;
        return n;
    };
    /** — re-evaluate paren ABSORPTION at a LINE boundary: an
     *  unclosed `(`/`[` does not count (for the whole upcoming line)
     *  when a still-unclosed `{` sits ABOVE it in the stack AND was
     *  opened on the SAME line — the callback shape `f(cb => {`. The
     *  evaluation deliberately happens BEFORE the line's closers pop,
     *  so a `});` closer line also prints at the statement's level.
     *  Plain `foo(\n  arg\n)` continuations keep their +1 (no brace
     *  above), and a same-line object `{x: 1}` that closes before the
     *  line ends never absorbs anything. */
    const reabsorb = () => {
        for (let i = 0; i < stack.length; i++) {
            const e = stack[i];
            if (e.text !== "(" && e.text !== "[") continue;
            e.counts = true;
            for (let j = i + 1; j < stack.length; j++) {
                if (stack[j].text === "{" && stack[j].line === e.line) {
                    e.counts = false; // the block brace took over the continuation
                    break;
                }
            }
        }
    };
    let prevLine = 0;
    for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        if (tok.kind !== "ws" && !firstOfLine.has(tok.line)) firstOfLine.set(tok.line, t);
        if (tok.line > prevLine) {
            prevLine = tok.line;
            reabsorb();
        }
        if (tok.kind === "punct") {
            // Openers: the token prints at the CURRENT depth, its CONTENT is
            // one deeper. Closers: pop FIRST so a closer leading a line
            // prints at the OUTER level.
            if (OPENERS.includes(tok.text)) {
                depthBefore[t] = countingDepth();
                stack.push({text: tok.text, line: tok.line, counts: true});
            } else if (CLOSERS.includes(tok.text)) {
                // Tolerant pop: `)` pops the nearest `(`/`[`, `}` the nearest
                // `{`, `]` the nearest `[` — malformed code degrades instead
                // of crashing.
                const want = tok.text === ")" ? ["(", "["] : tok.text === "}" ? ["{"] : ["["];
                for (let s = stack.length - 1; s >= 0; s--) {
                    if (want.includes(stack[s].text)) {
                        stack.splice(s, 1);
                        break;
                    }
                }
                depthBefore[t] = countingDepth();
            } else {
                depthBefore[t] = countingDepth();
            }
        } else {
            depthBefore[t] = countingDepth();
        }
    }
    return {depthBefore, firstOfLine};
}

export function reindentCurly(
    src: string,
    opts: CodeFormatOptions & { hashComments?: boolean; template?: boolean } = {}
): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const tokens = tokenizeCurly(src, opts);
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const {depthBefore, firstOfLine} = depthIndex(tokens);

    const out: string[] = [];
    /** Bases of open `case`/`default` labels — a case line prints at
     *  its switch's body level and its statements one deeper, until the
     *  next case/default or the switch's closing brace clears them. */
    const caseStack: number[] = [];
    for (let ln = 1; ln <= lines.length; ln++) {
        const firstIdx = firstOfLine.get(ln);
        if (firstIdx === undefined) {
            // Blank line — or an interior line of a FROZEN multi-line token
            // (template literal / block comment): emit the original text.
            const original = lines[ln - 1] ?? "";
            out.push(original.trim() === "" ? "" : original.replace(/\s+$/, ""));
            continue;
        }
        const firstTok = tokens[firstIdx];
        const rawDepth = depthBefore[firstIdx];
        let level = rawDepth;

        if (firstTok.kind === "word" && (firstTok.text === "case" || firstTok.text === "default")) {
            // Retire prior labels at or beyond this line's depth (the last
            // one in the same switch), then place the new label at the
            // switch body's level.
            while (caseStack.length > 0 && caseStack[caseStack.length - 1] >= rawDepth) caseStack.pop();
            level = caseStack.length > 0 ? Math.max(rawDepth, caseStack[caseStack.length - 1] + 1) : rawDepth;
            caseStack.push(level);
        } else if (caseStack.length > 0) {
            if (firstTok.kind === "punct" && CLOSERS.includes(firstTok.text)) {
                // A leading closer at/below a label base retires that label
                // (the switch's own `}`, or a nested block's close).
                while (caseStack.length > 0 && caseStack[caseStack.length - 1] >= rawDepth) caseStack.pop();
                level = rawDepth;
            } else {
                // Inside a case body: at least one deeper than the label base,
                // unless braces have already opened deeper.
                level = Math.max(rawDepth, caseStack[caseStack.length - 1] + 1);
            }
        }

        const original = lines[ln - 1] ?? "";
        const stripped = original.replace(/^[       ]+/, "");
        out.push(" ".repeat(Math.max(0, level) * width) + stripped);
    }

    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const joined = out.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ──────────────────────────────────────────────────────────────────
 * Spacing normalizer — the JS-family "beautify" half.
 * ────────────────────────────────────────────────────────────────── */

/** Operators that always carry spaces around them. */
const SPACED = new Set([
    "=", "==", "===", "!=", "!==", "<=", ">=", "&&", "||", "??",
    "=>", "+", "-", "*", "/", "%", "<", ">", "&", "|", "^", ">>",
    "<<", ">>>", "**", "+=", "-=", "*=", "/=", "%=", "&&=", "||=",
    "??=", "!", "?",
]);

/** Punctuation that never carries spaces around it (tight). */
const TIGHT = new Set([".", "?.", "::", "++", "--", ",", ";", "(", ")", "[", "]"]);

/** Multi-character operators that may be BUILT by merging.
 * `++`/`--` joined the set — without them `i++` stayed as
 * `+ +` (two tokens) and the postfix spacing rule never fired,
 * printing `state.clicks ++;`. */
const KNOWN_OPS = new Set([
    "==", "===", "!=", "!==", "<=", ">=", "&&", "||", "??", "=>",
    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "??=", "&&=",
    "||=", "<<", ">>", ">>>", "**", "**=", "++", "--",
]);

/** Merge adjacent punct tokens into multi-char operators — only when
 *  the RESULT is a known operator (`=` + `-` never merges into `=-`). */
function joinPuncts(tokens: Token[]): Token[] {
    const merged: Token[] = [];
    for (const tok of tokens) {
        if (tok.kind !== "punct") {
            merged.push({...tok});
            continue;
        }
        const prev = merged[merged.length - 1];
        // Optional chaining / namespacing glue first.
        if (prev && prev.kind === "punct" && prev.text === "?" && tok.text === ".") {
            prev.text = "?.";
            continue;
        }
        if (prev && prev.kind === "punct" && prev.text === ":" && tok.text === ":") {
            prev.text = "::";
            continue;
        }
        if (
            prev &&
            prev.kind === "punct" &&
            KNOWN_OPS.has(prev.text + tok.text)
        ) {
            prev.text += tok.text;
            continue;
        }
        merged.push({...tok});
    }
    return merged;
}

/** Unary operators (tight when adjacent to another unary or an opener). */
const UNARY = new Set(["-", "+", "!", "~", "++", "--"]);

/** Keywords followed by a spaced `(` (control flow, not calls). */
const PAREN_KEYWORDS = new Set([
    "if", "while", "for", "switch", "catch", "return", "typeof", "new",
    "delete", "void", "in", "of", "do", "case", "yield", "await",
    "throw", "instanceof", "function",
]);

/** — keywords where a following `[` is a VALUE start (`return [1]`),
 *  not member indexing (`arr[0]` stays tight after a plain word). */
const BRACKET_KEYWORDS = new Set([
    "return", "yield", "throw", "case", "typeof", "delete", "void",
    "await", "in", "of", "new",
]);

function spaceBetween(
    prev: Token,
    cur: Token,
    innermostOpener: string | undefined,
    ternaryActive = false,
    bracketSpacing = true
): boolean {
    const p = prev.text;
    const c = cur.text;

    // —— cur is punctuation ————————————————————————————————
    if (cur.kind === "punct") {
        if (c === "(") {
            if (prev.kind === "word") return PAREN_KEYWORDS.has(p);
            /* a comma before an arrow-function / grouped paren
                    gets its space — `f("click", () => {})`, not `f("click",() =>`.
                    A GROUPED paren after an operator is spaced too:
                    `x = (a) ? b : c`, never `x =(a)`. */
            if (prev.kind === "punct") {
                if (p === ",") return true;
                if (SPACED.has(p) && !UNARY.has(p)) return true; // = (, => (, && (
                return false;
            }
            return false;
        }
        if (c === "[") {
            /* `= [1]`, `return [1]`, `f(a, [b])` get their space;
                    member indexing (`arr[0]`, `f()[i]`) and openers stay tight. */
            if (prev.kind === "word") return BRACKET_KEYWORDS.has(p);
            if (prev.kind === "punct") {
                if (p === "," || p === ";") return true;
                if (OPENERS.includes(p) || p === "." || p === "?.") return false;
                if (UNARY.has(p)) return false; // -[1] … unary binds tight
                if (SPACED.has(p)) return true; // = [1], => [1], + [1]
                return false; // `)`/`]`/`}` → member indexing
            }
            return true; // after a value → array literal start
        }
        if (c === "{") {
            if (prev.kind === "punct") return !(p === "(" || p === "[" || p === "." || p === "?.");
            return true; // `else {`, `return {`, `do {`
        }
        if (c === "}" || c === ")" || c === "]" || c === "," || c === ";" || c === "." || c === "?.") return false;
        if (c === ":") {
            /* — ternary-aware colon: `a ? b: c` keeps its
                    spaces; every other colon is TIGHT — object-literal pairs
                    ({ a: 1 }), string keys ({ "k": v }), TS type annotations
                    (name: Type), return types (): Token[]) and labels. The old
                    "expression colon" spacing produced `src : string` and
                    `(): Token[]` drift. */
            if (ternaryActive) return true;
            return false;
        }
        if (UNARY.has(c)) {
            // Prefix position (after an opener/comma/semicolon/another unary)
            // or postfix ++/--: tight. After `)`/`]`/`}` or a word it is
            // BINARY (a + 1) — spaced.
            if (prev.kind === "punct") return !(OPENERS.includes(p) || p === "," || p === ";" || UNARY.has(p));
            if (prev.kind === "word" || prev.kind === "num") return c === "++" || c === "--" ? false : true;
            return false;
        }
        if (SPACED.has(c)) {
            if (c === "*" && prev.kind === "word" && (p === "function" || p === "yield" || p === "of")) return false;
            return true;
        }
        if (c === "?") return true; // ternary
        return false;
    }
    // —— prev is punctuation ——————————————————————————————————
    if (prev.kind === "punct") {
        if (p === "," || p === ";") return true;
        if (p === ":") return true;
        if (p === ".") return false;
        if (p === "?.") return false;
        if (p === "(" || p === "[") return false;
        if (p === ")") return true; // cur punct cases were handled above
        if (p === "]") return true;
        if (p === "{") return bracketSpacing && cur.text !== "}";
        if (p === "}") return true;
        // NOTE: a preceding unary +/-/!/~ is handled by the unary-position
        // override in applyJsSpacing — a BINARY `a + 1` needs the space.
        if (SPACED.has(p)) return true;
        return false;
    }
    // —— prev is word / number ——————————————————————————————————
    if (prev.kind === "word" || prev.kind === "num") {
        return true; // word word / word "str" / word `tpl` / word //com
    }
    // —— prev is str / tpl / com / reg ————————————————————————
    return true;
}

/** Insert canonical spacing between the tokens of ONE line. */
export function applyJsSpacing(line: string, bracketSpacing = true): string {
    const tokens = tokenizeCurly(line, {template: true});
    const code = joinPuncts(tokens.filter((t) => t.kind !== "ws"));
    if (code.length === 0) return line.replace(/\s+$/, "");

    const openerStack: string[] = [];
    let lastPopped: string | null = null;
    /* — ternary `?` scoping: remembers the opener depth where
      *  a bare `?` (not `?.`) appeared; the NEXT `:` at the same nesting
      *  or shallower is the ternary's colon (spaced). Popping past the
      *  depth or hitting `;` retires it — an object-literal colon at a
      *  deeper level never gets confused with a ternary. */
    let ternaryDepth: number | null = null;
    /** A +/-/!/~ sits in PREFIX position when nothing value-like
     * precedes it (start of line, after an opener/comma/operator). */
    const unaryAt = (idx: number): boolean => {
        const tk = code[idx];
        if (tk.kind !== "punct" || !["-", "+", "!", "~"].includes(tk.text)) return false;
        if (idx === 0) return true;
        const before = code[idx - 1];
        return before.kind === "punct" && !CLOSERS.includes(before.text);
    };
    let out = "";
    for (let t = 0; t < code.length; t++) {
        const tok = code[t];
        const ternaryActive = ternaryDepth !== null && openerStack.length <= ternaryDepth;
        if (tok.kind === "punct") {
            if (OPENERS.includes(tok.text)) {
                openerStack.push(tok.text);
                lastPopped = null;
            } else if (CLOSERS.includes(tok.text)) {
                lastPopped = openerStack.pop() ?? null;
                if (ternaryDepth !== null && openerStack.length < ternaryDepth) ternaryDepth = null;
            } else if (tok.text === "?" && t < code.length - 1) {
                ternaryDepth = openerStack.length;
            } else if (tok.text === ":") {
                ternaryDepth = null; // consumed (ternary or annotation)
            } else if (tok.text === ";") {
                ternaryDepth = null;
            }
        }
        if (t === 0) {
            out += tok.text;
            continue;
        }
        // Space after a PREFIX unary is always tight (-1, !x, -(-1)).
        if (unaryAt(t - 1) && ["word", "num", "str", "tpl", "reg"].includes(tok.kind)) {
            out += tok.text;
            continue;
        }
        // Object-literal braces get inner padding: `{ b: 1 }` (the popped
        // opener was `{` and the neighbor is a value); code blocks stay
        // tight (`x; }`). The bracketSpacing option (Settings →
        // Formatting) turns the padding off: `{b: 1}`.
        if (
            tok.kind === "punct" &&
            tok.text === "}" &&
            lastPopped === "{" &&
            bracketSpacing &&
            (["word", "num", "str", "tpl", "reg"].includes(code[t - 1].kind) ||
                (code[t - 1].kind === "punct" && [")", "]"].includes(code[t - 1].text)))
        ) {
            out += " " + tok.text;
            continue;
        }
        const space = spaceBetween(code[t - 1], tok, openerStack[openerStack.length - 1], ternaryActive, bracketSpacing);
        out += (space ? " " : "") + tok.text;
    }
    return out;
}

/** Collapse 2+ consecutive blank lines to one. */
function collapseBlanks(lines: string[]): string[] {
    const out: string[] = [];
    for (const l of lines) {
        if (l === "" && out.length > 0 && out[out.length - 1] === "") continue;
        out.push(l);
    }
    return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Public formatters.
 * ────────────────────────────────────────────────────────────────── */

function spacingPass(src: string, opts: CodeFormatOptions): string {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const bracketSpacing = opts.bracketSpacing !== false;
    /* — block-comment STATE: an interior JSDoc line (` * text…`)
        and the star-slash closer do NOT start with a slash-star, so the
        old per-line comment check missed them and the CODE spacing rules
        mangled the comment body (hyphens and dots re-spaced, the closer
        split with a space). A simple open/close scan across lines
        freezes every comment interior verbatim. */
    let inBlockComment = false;
    const spaced = lines.map((l) => {
        const trimmed = l.trim();
        if (trimmed === "") return "";
        if (inBlockComment) {
            if (trimmed.includes("*/")) inBlockComment = false;
            return l.replace(/\s+$/, "");
        }
        // Comment-only lines keep their aligned bodies verbatim.
        if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
            return l.replace(/\s+$/, "");
        }
        if (trimmed.startsWith("/*")) {
            if (!trimmed.includes("*/")) inBlockComment = true;
            return l.replace(/\s+$/, "");
        }
        const indent = l.slice(0, l.length - l.trimStart().length);
        const spacedLine = indent + applyJsSpacing(trimmed, bracketSpacing);
        // A block comment that OPENS mid-line and does not close on the
        // same line keeps the following lines in comment state.
        const openAt = trimmed.indexOf("/*");
        if (openAt >= 0 && trimmed.indexOf("*/", openAt + 2) < 0) inBlockComment = true;
        return spacedLine;
    });
    return collapseBlanks(spaced).join("\n");
}

/** Re-indent only (Auto-indent entry) — JS / TS / JSX / TSX. */
export function reindentJs(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: true});
}

/** Auto-format — re-indent + the spacing pass (the operator-spacing
 *  switch gates the whole pass — "indent-only" — and the
 *  bracket-spacing sub-option shapes the object-literal braces). */
export function formatJs(src: string, opts: CodeFormatOptions = {}): string {
    const indented = reindentJs(src, opts);
    let out = indented;
    if (opts.operatorSpacing !== false) {
        out = spacingPass(out, opts);
    }
    // quote normalization — token-aware, only terminated
    // string literals whose body needs no re-escaping.
    if (opts.quoteStyle === "double" || opts.quoteStyle === "single") {
        out = convertJsQuotes(out, opts.quoteStyle);
    }
    const joined = out.replace(/\n+$/, "");
    return (opts.finalNewline ?? true) ? `${joined}\n` : joined;
}

/** Java — same family, no template literals. */
export function reindentJava(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

export function formatJava(src: string, opts: CodeFormatOptions = {}): string {
    return formatJs(reindentJava(src, {...opts, operatorSpacing: false}), opts);
}

/** C / C++ — same family, no template literals. */
export function reindentC(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

export function formatC(src: string, opts: CodeFormatOptions = {}): string {
    return formatJs(reindentC(src, {...opts, operatorSpacing: false}), opts);
}

/** R — curly family with # comments; format == re-indent. */
export function reindentR(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false, hashComments: true});
}

/* ──────────────────────────────────────────────────────────────────
 * the remaining registry languages: PHP / Go / Ruby.
 * ────────────────────────────────────────────────────────────────── */

/** PHP — curly family; BOTH `//` and `#` start line comments. */
export function reindentPhp(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false, hashComments: true});
}

export function formatPhp(src: string, opts: CodeFormatOptions = {}): string {
    return formatJs(reindentPhp(src, {...opts, operatorSpacing: false}), opts);
}

/** Go — curly family; backticks are RAW STRINGS → template tokenizer. */
export function reindentGo(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: true});
}

export function formatGo(src: string, opts: CodeFormatOptions = {}): string {
    return formatJs(reindentGo(src, {...opts, operatorSpacing: false}), opts);
}

/* ──────────────────────────────────────────────────────────────────
 * quote normalization (JS family).
 *
 * "auto format should include also converting single quotes to
 * double quotes (add also to configs if to be included in the auto
 * format)" — Settings → Formatting → "JS / TS quote style". Tokenizing
 * the whole source and re-emitting it VERBATIM except for rewritten
 * `str` tokens makes this lossless: template literals, comments,
 * regex literals and every other byte survive untouched. A string is
 * only converted when its body contains NO quote character of the
 * target kind at all — anything else would need re-escaping and is
 * left exactly as authored.
 * ────────────────────────────────────────────────────────────────── */
export function convertJsQuotes(
    src: string,
    style: "double" | "single"
): string {
    const target = style === "double" ? '"' : "'";
    const tokens = tokenizeCurly(src.replace(/\r\n?/g, "\n"), {template: true});
    let out = "";
    for (const t of tokens) {
        if (t.kind !== "str" || t.text.length < 2) {
            out += t.text;
            continue;
        }
        const quote = t.text[0];
        // Only TERMINATED, non-empty-bordered literals; the tokenizer
        // stops unterminated ones at EOL (their closing char is missing).
        if (quote !== target && t.text.endsWith(quote)) {
            const body = t.text.slice(1, -1);
            if (!body.includes(target) && !body.includes("\\")) {
                out += target + body + target;
                continue;
            }
        }
        out += t.text;
    }
    return out;
}

/* ──────────────────────────────────────────────────────────────────
 * the curly-family re-indenters for perl / rust / kotlin /
 * swift. All four are brace languages; only their comment / literal
 * rules differ, which the tokenizer flags already encode:
 *   ▸ Perl — `//` AND `#` line comments; strings are ' and " → the
 *     hashComments tokenizer (#) with template OFF (backticks are
 *     the package separator, not literals — kept as plain punct).
 *   ▸ Rust — `//` comments, no template literals.
 *   ▸ Kotlin — `//` comments; backticks are IDENTIFIERS (never
 *     template literals) → template OFF.
 *   ▸ Swift — `//` comments, no template literals.
 * ────────────────────────────────────────────────────────────────── */

/** Perl — curly family with # line comments (// also exists as a
 *  C-style comment in modern Perl; keeping # keeps POD blocks and
 *  heredoc-lite safety). Re-indent only. */
export function reindentPerl(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false, hashComments: true});
}

/** Rust — curly family; re-indent only. */
export function reindentRust(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/** Kotlin — curly family (backticks are identifiers, not literals). */
export function reindentKotlin(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/** Swift — curly family; re-indent only. */
export function reindentSwift(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/* ──────────────────────────────────────────────────────────────────
 * the END-KEYWORD family: Lua and Julia.
 *
 * Blocks open with a leading keyword (function / if…then / for…do /
 * while…do / do / repeat — or function / if / for / while / let /
 * struct / module / begin / try in Julia) and close with a bare
 * `end` (Lua's `repeat` closes with `until`). Peers (else / elseif /
 * catch / finally) print at the OPENER's level. One-line blocks
 * (`if x then return end`) net out to zero — both ends on one line.
 * ────────────────────────────────────────────────────────────────── */

/** Strip a Lua line-comment outside strings and collect word data. */
function scanEndKeywordLine(
    line: string,
    comment: "--" | "#"
): { words: string[]; bracketDelta: number; leadClosers: number } {
    const words: string[] = [];
    let bracketDelta = 0;
    let leadClosers = 0;
    let seenOpener = false;
    let inS: string | null = null;
    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (inS) {
            if (ch === "\\") {
                i += 2;
                continue;
            }
            if (ch === inS) inS = null;
            i++;
            continue;
        }
        if (ch === "'" || ch === '"') {
            inS = ch;
            i++;
            continue;
        }
        // Lua long strings [[ ... ]] — bracket-neutral, frozen content.
        if (comment === "--" && line.startsWith("[[", i)) {
            i += 2;
            while (i < line.length && !line.startsWith("]", i)) i++;
            i++;
            continue;
        }
        if (comment === "--" && line.startsWith("--", i)) break;
        if (comment === "#" && ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
        if (ch === "(" || ch === "[" || ch === "{") {
            bracketDelta++;
            seenOpener = true;
            i++;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            bracketDelta--;
            if (!seenOpener) leadClosers++;
            i++;
            continue;
        }
        if (/[A-Za-z_@]/.test(ch)) {
            let j = i;
            while (j < line.length && /[A-Za-z0-9_@!?.]/.test(line[j])) j++;
            const word = line.slice(i, j);
            // strip trailing punctuation from the collected word
            const clean = word.replace(/[.!?:;,]+$/, "");
            if (clean) words.push(clean);
            i = j;
            continue;
        }
        i++;
    }
    return {words, bracketDelta, leadClosers};
}

/** Re-indent a Lua file. `repeat … until` dedents at `until`.
 *  One-line `if a then b end` blocks stay level. */
export function reindentLua(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    const out: string[] = [];
    for (const raw of lines) {
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        if (bare === "" || bare.startsWith("--")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        const {words, bracketDelta, leadClosers} = scanEndKeywordLine(bare, "--");
        const first = words[0] ?? "";
        const last = words[words.length - 1] ?? "";
        const second = words[1] ?? "";
        const isEnd = first === "end" && leadClosers === 0 && bracketDelta === 0;
        const isUntil = first === "until";
        const peer = (first === "else" || first === "elseif") && last !== "end";
        // Single-line block: `if x then y end` / `for i do f end` → net 0.
        const inlineBalanced =
            last === "end" &&
            (words.includes("then") || words.includes("do") || first === "function" || first === "repeat");
        const dedent = leadClosers + (isEnd && !inlineBalanced ? 1 : 0) + (isUntil ? 1 : 0) + (peer && !inlineBalanced ? 1 : 0);
        const level = Math.max(0, depth - dedent);
        out.push(" ".repeat(level * width) + bare);
        if (!inlineBalanced) {
            if (isEnd || isUntil) depth = Math.max(0, depth - 1);
            if (peer) { /* printed at opener level; depth unchanged */
            }
            const opensKeyword =
                first === "function" ||
                (first === "local" && second === "function") ||
                first === "repeat" ||
                first === "do" && words.length === 1;
            const trailer = last === "then" || last === "do";
            if (opensKeyword || (trailer && !peer)) depth++;
        }
        depth = Math.max(0, depth + (inlineBalanced ? 0 : bracketDelta));
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/** Re-indent a Julia file — function / if / for / while / let /
 *  struct (incl. mutable struct) / module / begin / try / quote open,
 *  `end` closes, else / elseif / catch / finally print at the opener's
 *  level. Triple-quoted strings span lines — their interiors stay
 *  frozen. One-line `if c x end` blocks stay level. */
export function reindentJulia(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    let inTriple = false;
    const out: string[] = [];
    const JULIA_PEERS = new Set(["else", "elseif", "catch", "finally"]);
    const JULIA_OPENERS = new Set([
        "function", "if", "for", "while", "let", "struct", "module",
        "baremodule", "begin", "try", "quote", "macro", "do",
    ]);
    for (const raw of lines) {
        if (inTriple) {
            out.push(raw);
            const quotes = (raw.match(/"""/g) ?? []).length;
            if (quotes % 2 === 1) inTriple = false;
            continue;
        }
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        const tripleCount = (bare.match(/"""/g) ?? []).length;
        if (bare === "" || bare.startsWith("#")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        if (tripleCount % 2 === 1) {
            // A triple string opens here and continues on later lines —
            // print this line at the current level, freeze the interior.
            out.push(" ".repeat(depth * width) + bare);
            inTriple = true;
            continue;
        }
        const {words, bracketDelta, leadClosers} = scanEndKeywordLine(bare, "#");
        const first = words[0] ?? "";
        const second = words[1] ?? "";
        const last = words[words.length - 1] ?? "";
        const isEnd = first === "end" && leadClosers === 0 && bracketDelta === 0;
        const peer = JULIA_PEERS.has(first) && last !== "end";
        const inlineBalanced =
            last === "end" &&
            (JULIA_OPENERS.has(first) || (first === "mutable" && second === "struct") ||
                (first === "abstract" || first === "primitive"));
        const dedent =
            leadClosers + (isEnd && !inlineBalanced ? 1 : 0) + (peer && !inlineBalanced ? 1 : 0);
        const level = Math.max(0, depth - dedent);
        out.push(" ".repeat(level * width) + bare);
        if (!inlineBalanced) {
            if (isEnd) depth = Math.max(0, depth - 1);
            if (
                JULIA_OPENERS.has(first) ||
                (first === "mutable" && second === "struct") ||
                (first === "abstract" && second === "type") ||
                (first === "primitive" && second === "type")
            ) depth++;
        }
        depth = Math.max(0, depth + (inlineBalanced ? 0 : bracketDelta));
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ── Ruby — end-keyword blocks (def/class/module/if/…/do), plus
   bracket pairs. A per-line quote/comment-aware scan keeps the depth
   honest; statement-INITIAL keywords open (trailing `if x` modifiers
   never do), a trailing `do` (optionally `|params|`) opens one block,
   peers (else/elsif/rescue/ensure/when) print at the opener's level. */

const RUBY_OPENERS = new Set([
    "def", "class", "module", "begin", "case", "if", "unless", "while", "until", "for",
]);
const RUBY_PEERS = new Set(["else", "elsif", "rescue", "ensure", "when"]);

/** Scan one Ruby line outside strings / comments. Returns the first
 *  word, whether a `do` ends the line, and the bracket deltas. */
function scanRubyLine(line: string): {
    firstWord: string;
    trailingDo: boolean;
    bracketDelta: number;
    leadClosers: number;
} {
    let firstWord = "";
    let trailingDo = false;
    let bracketDelta = 0;
    let leadClosers = 0;
    let seenOpener = false;
    let lastWord = "";
    let inS: string | null = null;
    let i = 0;
    const words: string[] = [];
    while (i < line.length) {
        const ch = line[i];
        if (inS) {
            if (ch === "\\") {
                i += 2;
                continue;
            }
            if (ch === inS) inS = null;
            i++;
            continue;
        }
        if (ch === "'" || ch === '"') {
            inS = ch;
            i++;
            continue;
        }
        if (ch === "#") break; // comment → rest of line ignored
        if (ch === "(" || ch === "[" || ch === "{") {
            bracketDelta++;
            seenOpener = true;
            i++;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            bracketDelta--;
            if (!seenOpener) leadClosers++;
            i++;
            continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            let j = i;
            while (j < line.length && /[A-Za-z0-9_?!]/.test(line[j])) j++;
            const word = line.slice(i, j);
            words.push(word);
            if (words.length === 1) firstWord = word;
            // `do` followed only by `|params|` (or nothing) → trailing do.
            const rest = line.slice(j).replace(/\|[^|]*\|/, "").trim();
            if (word === "do" && rest === "" && words.length > 1) trailingDo = true;
            lastWord = word;
            i = j;
            continue;
        }
        i++;
    }
    // A `do` as the very last word of a `each do |x|` / `while … do`.
    if (lastWord === "do" && words.length > 1) trailingDo = true;
    return {firstWord, trailingDo, bracketDelta, leadClosers};
}

/** Re-indent a Ruby file; format == re-indent (keywords drive layout). */
export function reindentRuby(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    const out: string[] = [];
    for (const raw of lines) {
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        if (bare === "" || bare.startsWith("#")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        const {firstWord, trailingDo, bracketDelta, leadClosers} = scanRubyLine(bare);
        const isEnd = firstWord === "end" && leadClosers === 0 && bracketDelta === 0;
        const peer = RUBY_PEERS.has(firstWord);
        // Dedent leading closers + `end` + peers BEFORE printing the line.
        const lead = leadClosers + (isEnd ? 1 : 0) + (peer ? 1 : 0);
        const level = Math.max(0, depth - lead);
        out.push(" ".repeat(level * width) + bare);
        // Apply the line's structural delta.
        if (isEnd) depth = Math.max(0, depth - 1);
        if (RUBY_OPENERS.has(firstWord)) depth++;
        if (trailingDo) depth++;
        depth = Math.max(0, depth + bracketDelta);
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const joined = out.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ──────────────────────────────────────────────────────────────────
 * Shell — keyword-block re-indent (heredoc-aware).
 * ────────────────────────────────────────────────────────────────── */

const SHELL_CLOSERS = new Set(["fi", "done", "esac"]);
const SHELL_PEER = new Set(["else", "elif"]);

/** Strip a trailing # comment that is not inside quotes. */
function shellCommentFree(line: string): string {
    let inS: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inS) {
            if (ch === inS) inS = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            inS = ch;
            continue;
        }
        if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
}

/** Heredoc marker on a line, if any (<<EOF / <<-EOF / <<'EOF' / <<"EOF"). */
function heredocMarker(line: string): string | null {
    const m = /<<(-?)(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(shellCommentFree(line));
    return m ? m[3] : null;
}

/** Re-indent a shell script; format == re-indent (the structure IS
 *  the keywords). Heredoc bodies and `\` continuations stay verbatim. */
export function reindentShell(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");

    let depth = 0;
    let heredoc: string | null = null;
    let caseDepth = -1; // the body level of the open `case` (patterns open one deeper)
    const out: string[] = [];

    for (const raw of lines) {
        // Inside a heredoc body: frozen until the terminator line.
        if (heredoc !== null) {
            out.push(raw);
            if (raw.trim() === heredoc) heredoc = null;
            continue;
        }
        const bare = shellCommentFree(raw).trim();
        if (bare === "") {
            out.push("");
            continue;
        }
        const marker = heredocMarker(raw);
        const first = (bare.split(/\s+/)[0] ?? "").replace(/[^A-Za-z_-]/g, "");
        const endsOpen =
            /;\s*then\s*$/.test(bare) ||
            /\s+then$/.test(bare) ||
            /;\s*do\s*$/.test(bare) ||
            /\s+do$/.test(bare) ||
            (first === "case" && /\bin$/.test(bare)) ||
            first === "function" ||
            /\{\s*$/.test(bare);

        // `esac` closes the case AND any open pattern block at once.
        if (first === "esac") {
            depth = Math.max(0, caseDepth >= 0 ? caseDepth - 1 : depth - 1);
            caseDepth = -1;
            out.push(" ".repeat(depth * width) + raw.replace(/^[ \t]+/, ""));
            if (marker) heredoc = marker;
            continue;
        }
        // `;;` ends a case pattern — fall back to the case body level.
        if (caseDepth >= 0 && depth > caseDepth && /^;;/.test(bare)) {
            depth = caseDepth;
            out.push(" ".repeat(depth * width) + raw.replace(/^[ \t]+/, ""));
            if (marker) heredoc = marker;
            continue;
        }

        // Closers dedent BEFORE printing.
        if (SHELL_CLOSERS.has(first) || bare === "}" || bare === ")") {
            depth = Math.max(0, depth - 1);
            out.push(" ".repeat(depth * width) + raw.replace(/^[ \t]+/, ""));
            if (marker) heredoc = marker;
            continue;
        }
        // Peer keywords print at the opener's level.
        if (SHELL_PEER.has(first) && !endsOpen) {
            out.push(" ".repeat(Math.max(0, depth - 1) * width) + raw.replace(/^[ \t]+/, ""));
            if (marker) heredoc = marker;
            continue;
        }
        // Standalone `then` / `do` (POSIX style: if cond ⏎ then ⏎ body) —
        // the line itself opens the block at its own level.
        if ((first === "then" || first === "do") && !endsOpen && bare === first) {
            out.push(" ".repeat(depth * width) + raw.replace(/^[ \t]+/, ""));
            depth++;
            if (marker) heredoc = marker;
            continue;
        }
        // A `pattern)` line inside an open case opens the pattern block.
        if (caseDepth >= 0 && depth === caseDepth && /\)$/.test(bare) && !bare.startsWith("(")) {
            out.push(" ".repeat(depth * width) + raw.replace(/^[ \t]+/, ""));
            depth++;
            if (marker) heredoc = marker;
            continue;
        }

        out.push(" ".repeat(depth * width) + raw.replace(/^[ \t]+/, ""));
        if (marker) heredoc = marker;
        if (endsOpen) {
            depth++;
            if (first === "case") caseDepth = depth;
        }
    }

    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ──────────────────────────────────────────────────────────────────
 * the Windows-native scripting pair.
 *
 * PowerShell: curly family with `#` line comments (and `<# #>` block
 * comments, which the tokenizer freezes). Backticks are PS's escape
 * character, NOT template literals → template OFF keeps them neutral
 * punctuation. Re-indent only (format == indent) — operator spacing
 * in PS would fight its `-Param value` grammar.
 *
 * Batch: parenthesized `if/for … (… )` blocks + `:label` sections.
 * Depth comes from a quote-aware paren scan: a line ENDING with `(`
 * opens, a line STARTING with `)` dedents first (the `) else (` shape
 * then re-opens on the same line). `REM` / `::` lines are frozen.
 * ────────────────────────────────────────────────────────────────── */

/** PowerShell — re-indent only (braces + parens depth).
 * hardening: HERE-STRING interiors (`@" … "@`, `@' … '@`) and
 * block-comment interiors (`<# … #>`) are frozen verbatim — their
 * braces / parens must never move the depth. Implemented by swapping
 * each frozen line for a `#`-prefixed placeholder (comments keep
 * their authored indentation in the curly engine), running the
 * shared re-indenter, then splicing the originals back. */
export function reindentPowershell(src: string, opts: CodeFormatOptions = {}): string {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const frozen: string[] = [];
    const masked: string[] = [];
    // here-string state: "opens" when a line ENDS with @" / @' (array
    // sub-expressions @(… ) never match), closes on a line whose
    // trimmed form is exactly "@ / '@.
    let inHere: string | null = null;
    // block-comment state: <# … #>.
    let inBlock = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (inHere) {
            if (trimmed === inHere) inHere = null;
            frozen.push(line);
            masked.push(`#__PRAXIS_FREEZE_${frozen.length - 1}__`);
            continue;
        }
        if (inBlock) {
            if (trimmed.includes("#>")) inBlock = false;
            frozen.push(line);
            masked.push(`#__PRAXIS_FREEZE_${frozen.length - 1}__`);
            continue;
        }
        if (trimmed.endsWith('@"')) {
            inHere = '"@';
            masked.push(line);
            continue;
        }
        if (trimmed.endsWith("@'")) {
            inHere = "'@";
            masked.push(line);
            continue;
        }
        if (trimmed.includes("<#")) {
            if (!trimmed.includes("#>")) inBlock = true;
            masked.push(line);
            continue;
        }
        masked.push(line);
    }
    const indented = reindentCurly(masked.join("\n"), {
        ...opts,
        template: false,
        hashComments: true,
    });
    return indented
        .split("\n")
        .map((l) => {
            const m = /^(\s*)#__PRAXIS_FREEZE_(\d+)__\s*$/.exec(l);
            if (m) return frozen[Number(m[2])];
            return l;
        })
        .join("\n");
}

/** Scan one Batch line outside "strings" for paren deltas. */
function scanBatchLine(line: string): { opens: boolean; leadClose: boolean } {
    let inS = false;
    let i = 0;
    let opens = false;
    let leadClose = false;
    let seenOpen = false;
    while (i < line.length) {
        const ch = line[i];
        if (ch === '"') {
            inS = !inS;
            i++;
            continue;
        }
        if (inS) {
            i++;
            continue;
        }
        if (ch === "^") {
            i += 2;
            continue;
        } // ^ escape
        if (ch === "(") {
            opens = true;
            seenOpen = true;
            i++;
            continue;
        }
        if (ch === ")") {
            if (!seenOpen && !leadClose) leadClose = true;
            opens = false;
            i++;
            continue;
        }
        i++;
    }
    return {opens, leadClose};
}

/** Batch — re-indent only; `(… )` blocks + `:` labels at column 0. */
export function reindentBatch(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    const out: string[] = [];
    for (const raw of lines) {
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        if (bare === "") {
            out.push("");
            continue;
        }
        // Labels (:name) always sit at column 0; comment lines freeze.
        if (bare.startsWith(":")) {
            out.push(bare);
            continue;
        }
        if (/^rem\b/i.test(bare) || bare.startsWith("::")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        const {opens, leadClose} = scanBatchLine(bare);
        // A leading `)` dedents first — `) else (` then re-opens below.
        if (leadClose) depth = Math.max(0, depth - 1);
        out.push(" ".repeat(depth * width) + bare);
        if (opens) depth++;
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ──────────────────────────────────────────────────────────────────
 * the added registry languages: Zig / Dart / Groovy / Scala (curly
 * family — only their comment/literal rules differ, which the
 * tokenizer flags already encode) and Elixir (do…end keyword family
 * with # comments and triple-quoted heredocs).
 * ────────────────────────────────────────────────────────────────── */

/** Zig — curly family; `//` comments, no template literals. Re-indent only. */
export function reindentZig(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/** Dart — curly family; `//` comments (also the `?.` null-aware member). */
export function reindentDart(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/** Groovy — curly family; `//` comments, ' and " strings. */
export function reindentGroovy(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/** Scala — curly family; `//` comments (triple-quoted strings freeze via
 *  the tokenizer's string handling across lines best-effort). */
export function reindentScala(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, template: false});
}

/** Scan one Elixir line outside strings / comments. Elixir blocks open
 *  with a TRAILING `do` (def/do → end) and close with a bare `end`;
 *  `fn … ->` anonymous functions also open. Heredocs (\"\"\" … \"\"\")
 *  freeze like Julia's triple strings. */
const ELIXIR_PEERS = new Set(["else", "rescue", "catch"]);

export function reindentElixir(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    let inHeredoc = false;
    const out: string[] = [];
    for (const raw of lines) {
        if (inHeredoc) {
            out.push(raw.replace(/\s+$/, ""));
            const quotes = (raw.match(/"""/g) ?? []).length;
            if (quotes % 2 === 1) inHeredoc = false;
            continue;
        }
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        const heredocCount = (bare.match(/"""/g) ?? []).length;
        if (bare === "" || bare.startsWith("#")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        if (heredocCount % 2 === 1) {
            // A heredoc opens here and continues on later lines.
            out.push(" ".repeat(depth * width) + bare);
            inHeredoc = true;
            continue;
        }
        const {words, bracketDelta, leadClosers} = scanEndKeywordLine(bare, "#");
        const first = words[0] ?? "";
        const last = words[words.length - 1] ?? "";
        const isEnd = first === "end" && leadClosers === 0 && bracketDelta === 0;
        const peer = ELIXIR_PEERS.has(first) && last !== "end";
        const trailingDo = last === "do";
        const opensFn = first === "fn" && last !== "end";
        // One-line block: `if x do y end` / `fn x, y -> x + y end` → net 0.
        const inlineBalanced = last === "end" && (trailingDo || words.includes("->") || opensFn);
        const dedent =
            leadClosers + (isEnd && !inlineBalanced ? 1 : 0) + (peer && !inlineBalanced ? 1 : 0);
        const level = Math.max(0, depth - dedent);
        out.push(" ".repeat(level * width) + bare);
        if (!inlineBalanced) {
            if (isEnd) depth = Math.max(0, depth - 1);
            if (trailingDo || opensFn) depth++;
        }
        depth = Math.max(0, depth + (inlineBalanced ? 0 : bracketDelta));
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/* ── the functional-language wave ─────────────────────────────────
 *  Haskell / Erlang / Clojure / OCaml / F# / GraphQL re-indenters
 *  (the "add more languages" batch — one per new FileKind).
 *  Three shapes:
 *    ▸ GraphQL — curly family with `#` comments (reindentCurly).
 *    ▸ Clojure — LISP: depth from  [ ] { } (strings + `;` comments
 *      skipped — the tokenizer below is the curly twin for brackets).
 *    ▸ Erlang — arrow blocks: a trailing `->` opens one level, the
 *      peers `end` / `after` / `catch` / `else` dedent.
 *    ▸ Haskell / OCaml / F# — layout-sensitive languages where a
 *      brace/keyword GUESS would corrupt code: the pass only
 *      normalizes leading whitespace to whole multiples of the
 *      configured indent width (the authored relative structure is
 *      preserved; the grid is normalized) + trailing/blank hygiene.
 */

/** GraphQL — curly family; `#` comments. */
export function reindentGraphql(src: string, opts: CodeFormatOptions = {}): string {
    return reindentCurly(src, {...opts, hashComments: true, template: false});
}

/** Scan one Clojure line outside strings / `;` comments. Returns:
 *    ▸ leadClosers — foreign closers BEFORE the line's first opener
 *      (these print the line at its PARENT's level);
 *    ▸ net — (this line's opens) minus (this line's closers), where
 *      foreign closers count too: the depth change for the lines that
 *      FOLLOW. A trailing closer run (`… )))` closing outer forms)
 *      does NOT dedent its own line — Lisp convention keeps the form
 *      at its level and closes the parents after it. */
function scanClojureLine(bare: string): { leadClosers: number; net: number } {
    let run = 0; // openers still unmatched ON THIS LINE
    let leadClosers = 0;
    let foreignTrail = 0;
    let openerSeen = false;
    let opens = 0;
    let closes = 0;
    let inStr = false;
    let i = 0;
    while (i < bare.length) {
        const ch = bare[i];
        if (inStr) {
            if (ch === "\\") i++; // skip the escaped char
            else if (ch === '"') inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === ";" && (i === 0 || /\s/.test(bare[i - 1]))) break; // rest is a comment
        else if (ch === "(" || ch === "[" || ch === "{") {
            opens++;
            run++;
            openerSeen = true;
        } else if (ch === ")" || ch === "]" || ch === "}") {
            closes++;
            if (run === 0) {
                // unmatched on this line — foreign: leading (before any
                // opener) dedents THIS line, trailing just closes parents.
                if (openerSeen) foreignTrail++;
                else leadClosers++;
            } else run--;
        }
        i++;
    }
    return {leadClosers, net: opens - closes};
}

/** Clojure — every form opens one level; a leading closer prints at
 *  its parent's level and eats one open. Comments (`;`, `;;`) and
 *  strings are verbatim. */
export function reindentClojure(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    const out: string[] = [];
    for (const raw of lines) {
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        if (bare === "" || bare.startsWith(";")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        const {leadClosers, net} = scanClojureLine(bare);
        const level = Math.max(0, depth - leadClosers);
        out.push(" ".repeat(level * width) + bare);
        depth = Math.max(0, depth + net);
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/** Erlang — `->` opens a clause body (one level); a leading `end` /
 *  `after` / `catch` / `else` dedents; a line ending in `.` closes the
 *  clause grid back to the top level. `%` comments verbatim. */
export function reindentErlang(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let depth = 0;
    const out: string[] = [];
    for (const raw of lines) {
        const bare = raw.replace(/^[ \t]+/, "").replace(/\s+$/, "");
        if (bare === "" || bare.startsWith("%")) {
            out.push(raw.replace(/\s+$/, ""));
            continue;
        }
        const firstWord = bare.split(/[^A-Za-z_]/)[0] ?? "";
        const isDedent = ["end", "after", "catch", "else"].includes(firstWord);
        const level = Math.max(0, depth - (isDedent ? 1 : 0));
        out.push(" ".repeat(level * width) + bare);
        if (isDedent) depth = Math.max(0, depth - 1);
        // Count arrows OUTSIDE the final comment; each `->` opens a body.
        const body = bare.split("%")[0];
        const arrows = (body.match(/->/g) ?? []).length;
        if (arrows > 0) depth += arrows;
        // A clause-ending period (a body line, not an arrow opener) closes
        // the WHOLE clause — the grid resets for the lines that follow.
        if (arrows === 0 && /\.$/.test(body)) depth = 0;
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}

/** Haskell / OCaml / F# — layout-sensitive: normalize the indent GRID
 *  (leading whitespace rounds to the nearest whole multiple of the
 *  configured width) without guessing block structure. Blank lines
 *  and comments (`--` / `(*` / `//`) keep their trailing hygiene. */
export function reindentLayoutWidth(src: string, opts: CodeFormatOptions = {}): string {
    const width = Math.max(1, Math.min(8, opts.indentWidth ?? DEFAULT_WIDTH));
    const finalNewline = opts.finalNewline ?? true;
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];
    for (const raw of lines) {
        const m = raw.match(/^[ \t]*/);
        const lead = m ? m[0] : "";
        const rest = raw.slice(lead.length);
        if (rest === "") {
            out.push("");
            continue;
        }
        // Tabs count as one width unit; spaces round to the nearest grid
        // step (min 0, max a sane 24 steps).
        const steps = lead.includes("\t")
            ? Math.min(24, lead.split("\t").length - 1)
            : Math.min(24, Math.round(lead.replace(/\t/g, "    ").length / width));
        out.push(" ".repeat(steps * width) + rest.replace(/\s+$/, ""));
    }
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    const collapsed = collapseBlanks(out);
    const joined = collapsed.join("\n");
    return finalNewline ? `${joined}\n` : joined;
}
