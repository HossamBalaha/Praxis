/**
 * Format Document configuration.
 *
 * Format Document behavior is configurable in the settings,
 * including the option to add the parentheses for if/elif
 * automatically.
 *
 * This module holds the POST-PROCESSORS applied to the formatter's
 * output (black via /api/format, or the built-in fallback below) so
 * the user can shape what "Format Document" does from Settings →
 * Editor → Formatting:
 *
 * • formatPostIfParentheses — wrap `if` / `elif` conditions in
 * parentheses automatically (`if x > 3:` → `if (x > 3):`).
 * • formatPostFinalNewline — guarantee exactly one trailing
 * newline at end of file.
 *
 * It also provides `builtinFormat` — a dependency-free formatter used
 * by the /api/format route when `black` is not installed, so Format
 * Document always does *something* useful out of the box (trailing
 * whitespace + blank-run normalization + final newline) instead of
 * silently failing.
 */
import {type IndentSettings, reindentPython} from "@/lib/indent";

/** Minimal settings slice the post-processors read. */
export interface FormatPostSettings {
    formatPostIfParentheses?: boolean;
    formatPostFinalNewline?: boolean;
    // ─── the extended, ALL-LANGUAGE passes ────────────────
    /** Python quote conversion — "keep" (undefined) / "double"
     *  ('x' → "x") / "single" ("x" → 'x'); string-aware. */
    formatPyQuoteStyle?: "keep" | "double" | "single";
    /** Trim trailing whitespace on every line (default on). */
    formatTrimTrailingWs?: boolean;
    /** Collapse runs of blank lines (default on) down to
     *  formatMaxBlankLines kept (default 1). */
    formatCollapseBlankRuns?: boolean;
    formatMaxBlankLines?: number;
    /** Line-ending normalization — "keep" (undefined) / "lf" / "crlf";
     *  runs LAST so every formatter output honors it. */
    formatNormalizeLineEndings?: "keep" | "lf" | "crlf";
    /** Python — one space after each comma (default on). */
    formatPySpaceAfterComma?: boolean;
    /** Python — True/False/None capitalization (default on). */
    formatPyNormalizeBooleans?: boolean;
    /** Indent style every Auto-format emits — "keep" (undefined)
     *  follows the editor's indent style, "spaces" / "tabs" force one
     *  style on the formatter output (leading whitespace only, per the
     *  configured indent width). Applies to every language; callers
     *  pass YAML through untouched (tabs are invalid in YAML). */
    formatIndentStyle?: "keep" | "spaces" | "tabs";
    /** The formatter indent width used by the indent-style conversion. */
    formatIndentWidth?: number;
    /** The TAB width the indent-style conversion uses (2/4/8; default 4) —
     *  how many spaces one tab represents when expanding / collapsing. */
    formatTabWidth?: number;
    /** Auto-format strips blank lines at the very START of the file
     *  (default on) — Auto-indent never touches them. */
    formatTrimLeadingBlankLines?: boolean;
    /** Hygiene passes skip frozen regions — Markdown fenced code blocks
     *  and HTML script/pre/style/textarea bodies (default on). */
    formatHygieneSkipFences?: boolean;
}

/**
 *  — helpers for locating the statement-splitting colon.
 *
 * Scans a line char-by-char (string-aware, bracket-depth-aware) and
 * returns the index of the first `:` that sits OUTSIDE every string
 * literal and at bracket depth 0 — i.e. the colon that terminates an
 * `if` / `elif` header. Colons inside strings (`if x == "a:b":`),
 * inside brackets (slices `a[1:2]`, dict literals `{"k": v}`) and
 * walrus `:=` inside parens are all correctly skipped.
 */
function findHeaderColon(line: string): number {
    let quote: string | null = null;
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
            if (c === "\\") {
                i++;
                continue;
            }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            continue;
        }
        if (c === "(" || c === "[" || c === "{") {
            depth++;
            continue;
        }
        if (c === ")" || c === "]" || c === "}") {
            depth--;
            continue;
        }
        if (c === ":" && depth === 0) return i;
    }
    return -1;
}

/** Wrap the condition of one `if` / `elif` statement, whichever form:
 *  block header, one-line compound, or ternary arm. */
function wrapCondition(condition: string): string | null {
    const cond = condition.trim();
    if (!cond) return null;
    if (cond.startsWith("(") && cond.endsWith(")") && balancedSimple(cond)) return null;
    if (!balancedSimple(cond)) return null;
    return `(${cond})`;
}

/** Wrap `if` / `elif` conditions in parentheses.
 *
 * `if x > 3:` → `if (x > 3):` — including indented forms and `elif`,
 * while leaving already-parenthesized conditions, `for` / `while`
 * headers, multi-line continuations and comments untouched.
 *
 * INLINE if's are handled too:
 * • one-line compound statements — `if x > 3: print(x)` →
 * `if (x > 3): print(x)` (same for `elif`, body preserved);
 * • ternary expressions — `n = 1 if x > 3 else 2` →
 * `n = 1 if (x > 3) else 2` (only the condition between `if` and
 * `else` is wrapped — the true/false arms are untouched). Works
 * at any bracket depth (call args, dict values, defaults) and
 * skips comprehension filters (`[x for x in y if x > 3]`, no
 * `else` — left alone).
 */
export function addIfElifParentheses(src: string): string {
    return src
        .split("\n")
        .map((line) => {
            if (/^\s*(el)?if[ \t]/.test(line)) {
                return processHeader(line);
            }
            return addTernaryParentheses(line);
        })
        .join("\n");
}

/** The line starts with `if` / `elif` — split it at the first
 *  top-level colon and wrap the condition, whatever follows the
 *  colon (block header, one-line body, or comment). */
function processHeader(line: string): string {
    const m = /^(\s*)(el)?if([ \t]+)(.*)$/.exec(line);
    if (!m) return line;
    const [, indent, el, , rest] = m;
    const colon = findHeaderColon(line);
    if (colon < 0) {
        // Multi-line continuation (condition continues on the next line).
        return line;
    }
    const condStart = m[0].length - rest.length; // offset where `rest` begins
    const condition = line.slice(condStart, colon);
    const tail = line.slice(colon); // `:body`, `:  # comment`, or `:`
    const wrapped = wrapCondition(condition);
    if (!wrapped) return line;
    return `${indent}${el ?? ""}if ${wrapped}${tail}`;
}

/** wrap the condition of every INLINE ternary in a
 *  line — `n = 1 if x > 3 else 2` → `n = 1 if (x > 3) else 2`.
 *  Left-to-right scan outside string literals; for each ` if ` it
 *  looks for the matching ` else ` at the same bracket depth and
 *  wraps what sits between. Safe at any bracket depth because the
 *  conditional-expression grammar pins the condition between the two
 *  keywords — adding parentheses never changes how it parses. */
function addTernaryParentheses(line: string): string {
    if (!line.includes(" if ")) return line;
    let out = "";
    let i = 0;
    const n = line.length;
    let quote: string | null = null;
    let depth = 0;
    while (i < n) {
        const ch = line[i];
        if (quote) {
            out += ch;
            if (ch === "\\") {
                out += line[i + 1] ?? "";
                i += 2;
                continue;
            }
            if (ch === quote) quote = null;
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            out += ch;
            i++;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") {
            depth++;
            out += ch;
            i++;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            depth--;
            out += ch;
            i++;
            continue;
        }
        if (line.startsWith(" if ", i)) {
            const condStart = i + 4;
            // Scan ahead for the matching ` else ` at the same depth.
            let j = condStart;
            let q: string | null = null;
            let d2 = 0;
            let condEnd = -1;
            while (j < n) {
                const cj = line[j];
                if (q) {
                    if (cj === "\\") {
                        j += 2;
                        continue;
                    }
                    if (cj === q) q = null;
                    j++;
                    continue;
                }
                if (cj === '"' || cj === "'") {
                    q = cj;
                    j++;
                    continue;
                }
                if (cj === "(" || cj === "[" || cj === "{") {
                    d2++;
                    j++;
                    continue;
                }
                if (cj === ")" || cj === "]" || cj === "}") {
                    d2--;
                    j++;
                    continue;
                }
                if (d2 === 0 && line.startsWith(" else ", j)) {
                    condEnd = j;
                    break;
                }
                j++;
            }
            if (condEnd >= 0) {
                const cond = line.slice(condStart, condEnd).trim();
                const wrapped = wrapCondition(cond);
                if (wrapped) {
                    // Preserve the original spacing: emit `… if (cond) else …`.
                    out += line.slice(i, condStart);
                    out += wrapped;
                    out += line.slice(condEnd, condEnd + 6);
                    i = condEnd + 6;
                    continue;
                }
            }
            // No matching `else` (comprehension filter etc.) or unsafe —
            // copy the keyword verbatim and keep scanning.
            out += line.slice(i, i + 4);
            i += 4;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

/** True when every bracket kind in `s` is balanced AND the string does
 *  not end inside a string literal in a way we can't cheaply verify —
 *  we only do a tolerant count of , [] and {} plus quote parity. */
function balancedSimple(s: string): boolean {
    let round = 0, square = 0, curly = 0;
    let quote: string | null = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
            if (c === "\\") {
                i++;
                continue;
            }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            continue;
        }
        if (c === "(") round++;
        else if (c === ")") round--;
        else if (c === "[") square++;
        else if (c === "]") square--;
        else if (c === "{") curly++;
        else if (c === "}") curly--;
        if (round < 0 || square < 0 || curly < 0) return false;
    }
    return round === 0 && square === 0 && curly === 0 && quote === null;
}

/** Guarantee exactly one trailing newline (POSIX text convention). */
export function ensureFinalNewline(src: string): string {
    if (!src) return src;
    return src.replace(/\n+$/, "\n");
}

/* ──────────────────────────────────────────────────────────────────
* the Python QUOTE NORMALIZER.
*
* "auto format should include also converting single
* quotes to double quotes … for example x = 'a' to x = \"a\"; handle
* that and make it as option in the config". black deliberately
* never converts quotes, so this runs as a POST-PASS on black's (or
* the built-in formatter's) output.
*
* SAFETY — the scanner is fully string-aware:
* • comments (# …) are never touched;
* • triple-quoted blocks (docstrings) are skipped whole;
* • a single-quoted string containing a double quote ('say "hi"')
* is skipped — converting would need escaping and change the
* literal's bytes; likewise "…" containing ' for the reverse;
* • strings with backslash escapes keep their quoting (re-writing
* them changes nothing visible and risks style churn);
* • f-strings / b-strings / r-strings all pass through the same
* scanner (their prefix letters are part of the code stream and
* the quote chars still delimit them — scanning by quote char
* handles every prefix uniformly).
* ────────────────────────────────────────────────────────────── */

/** One scanned region of a Python source: code (outside every string
 *  / comment) or literal (the exact text of one string/comment). */
type PyRegion =
    | { t: "code"; text: string }
    | { t: "str"; quote: string; triple: boolean; text: string }
    | { t: "comment"; text: string };

/** Split Python source into code / string / comment regions. */
function scanPyRegions(src: string): PyRegion[] {
    const out: PyRegion[] = [];
    let i = 0;
    const n = src.length;
    let codeStart = 0;
    const flushCode = (end: number) => {
        if (end > codeStart) out.push({t: "code", text: src.slice(codeStart, end)});
    };
    while (i < n) {
        const ch = src[i];
        // Comment — to end of line (string prefixes can't precede #).
        if (ch === "#") {
            let j = i;
            while (j < n && src[j] !== "\n") j++;
            flushCode(i);
            out.push({t: "comment", text: src.slice(i, j)});
            codeStart = j;
            i = j;
            continue;
        }
        // String — possibly triple-quoted, with any prefix letters.
        if (ch === '"' || ch === "'") {
            const triple =
                src[i + 1] === ch && src[i + 2] === ch;
            let j = triple ? i + 3 : i + 1;
            const closer = triple ? ch.repeat(3) : ch;
            let closed = false;
            while (j < n) {
                if (src[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (!triple && src[j] === "\n") break; // unterminated single-line
                if (triple ? src.startsWith(closer, j) : src[j] === closer) {
                    j += closer.length;
                    closed = true;
                    break;
                }
                j++;
            }
            if (!closed && !triple) {
                // unterminated — treat the rest of the line as a plain string
                j = Math.min(n, src.indexOf("\n", i) < 0 ? n : src.indexOf("\n", i));
                closed = j > i;
            }
            flushCode(i);
            out.push({t: "str", quote: ch, triple, text: src.slice(i, j)});
            codeStart = j;
            i = j;
            continue;
        }
        i++;
    }
    flushCode(n);
    return out;
}

/** Convert the quotes of ONE single-line string literal when safe.
 *  `to` is the target quote character. */
function convertStringLiteral(text: string, to: string): string | null {
    if (text.includes("\n")) return null; // multi-line — never converted
    const m = /^([A-Za-z]*)((['"])([\s\S]*)\3)$/.exec(text);
    if (!m) return null;
    const [, prefix, , q, body] = m;
    if (q === to) return null; // already the target style
    if (body.includes(to)) return null; // would need escaping — skip
    if (body.includes("\\")) return null; // escapes present — skip
    return `${prefix}${to}${body}${to}`;
}

/** Normalize Python quotes across a whole source. */
export function normalizePythonQuotes(
    src: string,
    style: "keep" | "double" | "single" | undefined
): string {
    if (!src || !style || style === "keep") return src;
    const to = style === "double" ? '"' : "'";
    let out = "";
    for (const region of scanPyRegions(src)) {
        if (region.t === "code" || region.t === "comment") {
            out += region.text;
            continue;
        }
        if (region.triple) {
            out += region.text; // docstrings / blocks stay verbatim
            continue;
        }
        const converted = convertStringLiteral(region.text, to);
        out += converted ?? region.text;
    }
    return out;
}

/** Line-index ranges (0-based, [start, end) half-open) the hygiene
 *  passes must leave untouched — Markdown fenced code blocks and the
 *  bodies of HTML script/style/pre/textarea elements. Their authored
 *  whitespace (trailing spaces, deliberate blank runs in samples) is
 *  CONTENT, not noise, so trim/collapse skip every line inside. */
export function hygieneFrozenRanges(src: string, kind?: string): Array<[number, number]> {
    if (!src) return [];
    const lines = src.split("\n");
    const ranges: Array<[number, number]> = [];
    if (kind === "markdown" || kind === "md") {
        let fence: string | null = null;
        let start = -1;
        lines.forEach((line, i) => {
            if (fence) {
                const m = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
                if (m && m[2][0] === fence![0]) {
                    ranges.push([start, i + 1]);
                    fence = null;
                }
                return;
            }
            const m = /^(\s*)(`{3,}|~{3,})/.exec(line);
            if (m) {
                fence = m[2][0] === "`" ? "`" : "~";
                start = i;
            }
        });
    } else if (kind === "html" || kind === "xml") {
        // Bodies of <script> / <style> / <pre> / <textarea> — from the
        // opening tag line AFTER the one it starts on through the line
        // holding the matching close tag.
        let close: string | null = null;
        let start = -1;
        const OPEN_RE = /<(script|style|pre|textarea)(\s[^>]*)?>/i;
        lines.forEach((line, i) => {
            if (close) {
                if (new RegExp(`</${close}`, "i").test(line)) {
                    ranges.push([start, i + 1]);
                    close = null;
                }
                return;
            }
            const m = OPEN_RE.exec(line);
            if (m && !new RegExp(`</${m[1]}`, "i").test(line)) {
                close = m[1].toLowerCase();
                start = i;
            }
        });
    }
    return ranges.filter((r) => r[1] > r[0]);
}

function lineInFrozen(i: number, frozen?: Array<[number, number]>): boolean {
    if (!frozen || frozen.length === 0) return false;
    return frozen.some(([a, b]) => i >= a && i < b);
}

/* ─── hard-wrap prose lines (all-language format option) ────────── */

/** Greedy word-wrap of one text run at `width` columns. The caller
 * prefixes continuation lines with its own indent. */
function wrapWords(text: string, width: number): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const out: string[] = [];
    let line = "";
    for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (candidate.length <= width || !line) line = candidate;
        else {
            out.push(line);
            line = w;
        }
    }
    if (line) out.push(line);
    return out;
}

/** Hard-wrap PROSE lines to `width` columns — the "wrapping" format
 *  option that is useful for every language's prose (Markdown
 *  paragraphs / plain text today; code, fences, tables, headings and
 *  indented blocks pass through untouched, so nothing structural is
 *  ever re-flowed). `frozen` (fences / raw regions) is skipped. */
export function wrapProseLines(
    src: string,
    width = 80,
    frozen?: Array<[number, number]>
): string {
    if (!src) return src;
    const w = Math.max(20, Math.min(120, Math.floor(width)));
    const endsWithNewline = src.endsWith("\n");
    const lines = src.split("\n");
    if (endsWithNewline) lines.pop();
    const out: string[] = [];
    let i = 0;
    const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l) || /^\s*\|?[\s:|-]+\|\s*$/.test(l);
    const isHeading = (l: string) => /^\s{0,3}#{1,6}\s/.test(l);
    const isFenceEdge = (l: string) => /^\s*(```|~~~)/.test(l);
    while (i < lines.length) {
        const line = lines[i];
        const skip =
            lineInFrozen(i, frozen) ||
            line.trim() === "" ||
            isHeading(line) ||
            isTableRow(line) ||
            isFenceEdge(line) ||
            /^ {4,}\S/.test(line) /* indented code block */;
        if (skip) {
            out.push(line);
            i += 1;
            continue;
        }
        // List item: wrap its text, continuation lines indented under the
        // marker so re-wrapped bullets keep their alignment.
        const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
        if (listMatch) {
            const [, base, marker, gap, rest] = listMatch;
            const prefix = `${marker}${gap}`;
            const continuation = `${base}${" ".repeat(prefix.length)}`;
            const wrapped = wrapWords(rest, w - continuation.length);
            if (wrapped.length > 0) {
                out.push(`${base}${prefix}${wrapped[0]}`);
                out.push(...wrapped.slice(1).map((l) => continuation + l));
            }
            i += 1;
            continue;
        }
        // Prose paragraph: consume the run of consecutive prose lines.
        const para: string[] = [];
        let j = i;
        while (
            j < lines.length &&
            !lineInFrozen(j, frozen) &&
            lines[j].trim() !== "" &&
            !isHeading(lines[j]) &&
            !isTableRow(lines[j]) &&
            !isFenceEdge(lines[j]) &&
            !/^ {4,}\S/.test(lines[j]) &&
            !/^\s*([-*+]|\d+[.)])\s+/.test(lines[j])
            ) {
            para.push(lines[j].trim());
            j += 1;
        }
        if (para.length > 0) {
            out.push(...wrapWords(para.join(" "), w));
            i = j;
        } else {
            out.push(line);
            i += 1;
        }
    }
    return (endsWithNewline ? [...out, ""] : out).join("\n");
}

/** trim trailing whitespace on every line (all languages; the optional
 *  frozen ranges keep Markdown fence / HTML raw-body lines verbatim).
 *  CRLF-aware: a line's terminating \r (from \r\n) is part of the
 *  line ENDING, not trailing junk — "keep" line endings survive the
 *  trim (normalizeLineEndings runs LAST). */
export function trimTrailingWhitespace(src: string, frozen?: Array<[number, number]>): string {
    if (!src) return src;
    if (!frozen || frozen.length === 0) {
        // Spaces/tabs before an optional \r, then the \n — plus the very
        // end of the source when it has no trailing newline at all.
        return src.replace(/[ \t]+(?=\r?\n)/g, "").replace(/[ \t]+$/g, "");
    }
    const endsNL = src.endsWith("\n");
    const lines = src.split("\n");
    if (endsNL) lines.pop();
    const out = lines.map((line, i) => (lineInFrozen(i, frozen) ? line : line.replace(/[ \t]+$/, "")));
    return (endsNL ? [...out, ""] : out).join("\n");
}

/** collapse runs of blank lines down to `maxKeep` kept.
 *  A "blank" line is empty or whitespace-only; `maxKeep` defaults
 *  to 1 (n blank lines → 1). Runs at the very START of the file are
 *  removed entirely (leading blank lines are never meaningful); runs
 *  at the very END collapse to nothing (the final newline itself is
 *  preserved — ensureFinalNewline / the trailing-"" slot own it). */
export function collapseBlankRuns(
    src: string,
    maxKeep = 1,
    frozen?: Array<[number, number]>
): string {
    if (!src) return src;
    const keep = Math.max(0, Math.floor(maxKeep));
    // The trailing "" after the last \n is the FINAL-NEWLINE slot — drop
    // it now and re-add it at the end so it is never counted as a blank.
    const endsWithNewline = src.endsWith("\n");
    const lines = src.split("\n");
    if (endsWithNewline) lines.pop();
    const out: string[] = [];
    let run = 0;
    let leading = true;
    lines.forEach((line, i) => {
        const blank = line.trim() === "";
        const frozenHere = lineInFrozen(i, frozen);
        // A blank line inside a frozen region IS content — it resets the
        // collapse run and lands verbatim.
        if (frozenHere) {
            if (run > 0 && !leading) {
                const kept = Math.min(run, keep);
                for (let k = 0; k < kept; k++) out.push("");
            }
            run = 0;
            leading = false;
            out.push(line);
            return;
        }
        if (blank) {
            run++;
            return;
        }
        if (run > 0) {
            const kept = leading ? 0 : Math.min(run, keep);
            for (let k = 0; k < kept; k++) out.push("");
        }
        run = 0;
        leading = false;
        out.push(line);
    });
    // A trailing blank run before EOF keeps NOTHING — trailing blanks
    // fold into the final newline.
    if (endsWithNewline) out.push("");
    return out.join("\n");
}

/** Python — one space after every comma in calls / lists /
 *  tuples / dicts (string-aware: commas inside strings and comments
 *  are never touched). "f(a,b)" → "f(a, b)"; "(a ,b)" → "(a, b)". */
export function pySpaceAfterComma(src: string): string {
    if (!src) return src;
    let out = "";
    for (const region of scanPyRegions(src)) {
        if (region.t !== "code") {
            out += region.text;
            continue;
        }
        // Only inter-token commas BETWEEN code characters: `x,y` → `x, y`
        // and `x ,y` / `x , y` → `x, y`. A comma directly followed by a
        // closing bracket, another comma, or a newline (continuation
        // layout) keeps its form — `(x,)`, `],`, multi-line call commas
        // stay exactly as the author wrote them.
        out += region.text
            .replace(/,([^ \n\t)\]},])/g, ", $1")
            .replace(/[ \t]+,/g, ",");
    }
    return out;
}

/** Python — True / False / None capitalization in code
 *  regions only (strings / comments untouched; black also enforces
 *  this — the builtin fallback now does too). */
export function pyNormalizeBooleans(src: string): string {
    if (!src) return src;
    let out = "";
    for (const region of scanPyRegions(src)) {
        if (region.t !== "code") {
            out += region.text;
            continue;
        }
        out += region.text
            .replace(/\btrue\b/g, "True")
            .replace(/\bfalse\b/g, "False")
            .replace(/\bnone\b/g, "None")
            .replace(/\bTRUE\b/g, "True")
            .replace(/\bFALSE\b/g, "False")
            .replace(/\bNONE\b/g, "None");
    }
    return out;
}

/** normalize line endings — "lf" writes \n everywhere,
 *  "crlf" writes \r\n everywhere, anything else keeps the source
 *  as-is. Applied LAST so every formatter's output honors it. */
export function normalizeLineEndings(
    src: string,
    mode: "keep" | "lf" | "crlf" | undefined
): string {
    if (!src || !mode || mode === "keep") return src;
    const unified = src.replace(/\r\n?/g, "\n");
    return mode === "lf" ? unified : unified.replace(/\n/g, "\r\n");
}

/** Indent-style conversion for the formatter output (ALL languages):
 *  "spaces" expands every leading tab to `width` spaces, "tabs"
 *  collapses every run of `width` leading spaces into one tab. Only
 *  the LEADING whitespace of each line is converted — alignment
 *  inside the line (markdown tables, aligned TOML `=` columns)
 *  survives untouched. "keep" / undefined returns the source. */
export function convertIndentStyle(
    src: string,
    mode: "keep" | "spaces" | "tabs" | undefined,
    width: number
): string {
    if (!src || !mode || mode === "keep") return src;
    const w = Math.max(1, Math.min(8, width || 2));
    return src.split("\n").map((line) => {
        const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
        if (!lead) return line;
        // Tabs expand at the configured stop so partial columns convert
        // cleanly; then ("tabs") every full w-space run becomes one tab.
        const expanded = lead.replace(/\t/g, " ".repeat(w));
        if (mode === "tabs") {
            const collapsed = expanded.replace(new RegExp(` {${w}}`, "g"), "\t");
            return collapsed + line.slice(lead.length);
        }
        return expanded + line.slice(lead.length);
    }).join("\n");
}

/** Strip blank lines from the very START of the file (the "blank
 *  lines at file start" hygiene pass — a formatted file opens on
 *  its first real line). Never touches interior blank lines. */
export function trimLeadingBlankLines(src: string): string {
    return src.replace(/^[ \t]*\n+/, "");
}

/** Apply every ENABLED post-processor to the formatter output.
 * the if/elif parentheses processor is PYTHON-ONLY —
 * it used to run on markdown / JSON / text buffers too, where a
 * sentence like "add 1 if missing else skip" would get wrapped as
 * "add 1 if (missing) else skip". `fileName` gates it (undefined
 * = assume Python, preserving the historical behavior for callers
 * that don't know the name).
 * the hygiene passes controlled from
 * Settings → Formatting now run here too — Python quote style
 * ('x' → "x"), trailing-whitespace trim, blank-run collapse with
 * the max-lines knob, Python comma spacing + booleans, and the
 * line-ending normalization (always LAST). Order matters: quotes /
 * spacing run on the formatter output, then whitespace hygiene,
 * then the final newline, then line endings. */
export function applyFormatPostProcessors(
    content: string,
    settings: FormatPostSettings | undefined,
    fileName?: string,
    kind?: string
): string {
    let out = content;
    const isPython = fileName == null || /\.pyw?$/i.test(fileName);
    if (isPython && settings?.formatPostIfParentheses !== false) {
        out = addIfElifParentheses(out);
    }
    if (isPython) {
        if (settings?.formatPyQuoteStyle && settings.formatPyQuoteStyle !== "keep") {
            out = normalizePythonQuotes(out, settings.formatPyQuoteStyle);
        }
        if (settings?.formatPySpaceAfterComma !== false) {
            out = pySpaceAfterComma(out);
        }
        if (settings?.formatPyNormalizeBooleans !== false) {
            out = pyNormalizeBooleans(out);
        }
    }
    // Frozen regions (markdown fences / html raw bodies) shield the
    // hygiene passes when the skip switch is on (default).
    const frozen =
        settings?.formatHygieneSkipFences === false
            ? undefined
            : hygieneFrozenRanges(out, kind ?? (/\.(md|markdown)$/i.test(fileName ?? "") ? "markdown" : undefined));
    if (settings?.formatTrimTrailingWs !== false) {
        out = trimTrailingWhitespace(out, frozen);
    }
    if (settings?.formatCollapseBlankRuns !== false) {
        out = collapseBlankRuns(out, Math.max(0, settings?.formatMaxBlankLines ?? 1), frozen);
    }
    // Leading blank lines belong to the same whitespace-hygiene family
    // (default ON, Auto-format only).
    if (settings?.formatTrimLeadingBlankLines !== false) {
        out = trimLeadingBlankLines(out);
    }
    // Indent style conversion — leading whitespace only, after every
    // engine has placed its indentation.
    out = convertIndentStyle(
        out,
        settings?.formatIndentStyle,
        settings?.formatTabWidth ?? settings?.formatIndentWidth ?? 4
    );
    if (settings?.formatPostFinalNewline !== false) {
        out = ensureFinalNewline(out);
    }
    // Always LAST: line endings over the fully formatted text.
    out = normalizeLineEndings(out, settings?.formatNormalizeLineEndings);
    return out;
}

/** Built-in dependency-free formatter (the black-unavailable fallback).
 *
 * Honest about what it does — it is NOT black:
 *   • strips trailing whitespace on every line
 *   • collapses 3+ blank lines down to 2
 *   • removes blank lines at the very top of the file
 *   • re-indents Python block structure via reindentPython
 *     (colon headers open a level, dedent closes)
 */
export function builtinFormat(
    src: string,
    indent: IndentSettings,
    fileName: string
): string {
    let out = src
        .split("\n")
        .map((l) => l.replace(/[ \t]+$/, ""))
        .join("\n");
    out = out.replace(/\n{3,}/g, "\n\n");
    out = out.replace(/^\n+/, "");
    if (/\.py$/i.test(fileName)) {
        try {
            out = reindentPython(out, indent);
        } catch {
            /* keep the whitespace-only pass */
        }
    }
    return ensureFinalNewline(out);
}
