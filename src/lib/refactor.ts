/**
 *  — deterministic extract refactors (NO AI).
 *
 * Pure text transforms used by the editor's right-click
 * "Refactor ▸ Extract function / Extract variable" actions. Everything
 * is plain string surgery on the buffer + the selection range, so the
 * result is exactly predictable and testable (see src/lib/__tests__).
 *
 * Conventions:
 *  - Offsets are 0-indexed character offsets into `source`.
 *  - Indentation is measured in raw leading spaces/tabs; the extracted
 *    body is dedented to the SHALLOWEST indent among its non-blank
 *    lines (textwrap.dedent semantics, tolerant of ragged indents).
 *  - The new def is inserted directly ABOVE the selection at the
 *    selection's own indent — for a top-level selection that yields a
 *    top-level def; for an indented selection a nested def (valid
 *    Python, and keeps the transform local).
 */

export interface Range {
    start: number;
    end: number;
}

export interface ExtractEdit {
    /** The full new buffer. */
    source: string;
    /** Where the caret should land after the edit (call site name). */
    caret: number;
}

/** Leading whitespace of a line, as a string. */
function leadingWhitespace(line: string): string {
    const m = line.match(/^[ \t]*/);
    return m ? m[0] : "";
}

/** textwrap.dedent-style removal of the common leading whitespace. */
export function dedent(text: string): string {
    const lines = text.replace(/\n$/, "").split("\n");
    let prefix: string | null = null;
    for (const line of lines) {
        if (!line.trim()) continue;
        const lead = leadingWhitespace(line);
        if (prefix === null) prefix = lead;
        else {
            // Common prefix of the two leading-whitespace strings.
            let common = "";
            const n = Math.min(prefix.length, lead.length);
            for (let i = 0; i < n; i++) {
                if (prefix[i] === lead[i]) common += prefix[i];
                else break;
            }
            prefix = common;
        }
        if (prefix === "") break;
    }
    if (!prefix) return text;
    return lines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l)).join("\n");
}

/** Line-start offsets of every line in source (0-indexed). */
export function lineStarts(source: string): number[] {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === "\n") starts.push(i + 1);
    }
    return starts;
}

/** Python reserved words — not valid names (extracting into one of
 *  these would produce a syntax error; caught by the vitest review). */
const PY_KEYWORDS = new Set([
    "False", "None", "True", "and", "as", "assert", "async", "await",
    "break", "class", "continue", "def", "del", "elif", "else", "except",
    "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
    "while", "with", "yield", "match", "case",
]);

/** True if name is a valid, non-keyword Python identifier. */
export function isIdentifier(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !PY_KEYWORDS.has(name);
}

/**
 * Extract the selected code into a new function `name` and replace
 * the selection with a call. Returns null when the transform does not
 * apply (empty selection / bad name).
 *
 * The generated def has no parameters and returns nothing — the user
 * is expected to adjust the signature (the call site makes that
 * obvious). Keeping it dumb keeps it predictable.
 */
export function extractFunction(
    source: string,
    selection: Range,
    name: string
): ExtractEdit | null {
    if (selection.end <= selection.start) return null;
    if (!isIdentifier(name)) return null;

    const sel = source.slice(selection.start, selection.end);
    if (!sel.trim()) return null;

    // Selection bounds relative to their lines.
    const starts = lineStarts(source);
    let firstLineIdx = 0;
    for (let i = starts.length - 1; i >= 0; i--) {
        if (starts[i] <= selection.start) {
            firstLineIdx = i;
            break;
        }
    }
    const lineStart = starts[firstLineIdx];
    // If the selection starts mid-line (after some code), the extracted
    // body still works — the replacement keeps the leading text.
    const indent = leadingWhitespace(source.slice(lineStart, selection.start) === "" ? source.slice(lineStart).split("\n")[0] : source.slice(lineStart, selection.start));

    const body = dedent(sel).replace(/\s+$/, "");
    if (!body) return null;
    // The body is indented ONE unit deeper than the def header — the
    // unit follows the file's own style (tabs stay tabs). (Bug found by
    // the vitest suite: this used to be a hardcoded 4 spaces, which put
    // nested bodies at the SAME indent as the def header → IndentationError.)
    const unit = indent.includes("\t") ? "\t" : "    ";
    const bodyLines = body.split("\n").map((l) => (l.trim() ? `${indent}${unit}${l}` : ""));
    const def = [
        `${indent}def ${name}():`,
        ...bodyLines,
        "",
    ].join("\n");

    const call = `${indent}${name}()`;
    const before = source.slice(0, selection.start);
    const after = source.slice(selection.end);

    // The def is inserted at the START of the selection's first line,
    // then the selection is replaced by the call.
    const newSource =
        source.slice(0, lineStart) +
        def +
        "\n" +
        source.slice(lineStart, selection.start) +
        call +
        after;

    const caret = lineStart + def.length + 1 + (source.slice(lineStart, selection.start).length) + indent.length + name.length + 1;
    return {source: newSource, caret};
}

/**
 * Extract the selected EXPRESSION into a variable `name` assigned on
 * the line above, replacing the selection with the variable name.
 * Only sensible for single-line selections (multi-line expressions
 * still work but read poorly) — enforced with `allowMultiline=false`.
 */
export function extractVariable(
    source: string,
    selection: Range,
    name: string,
    allowMultiline = false
): ExtractEdit | null {
    if (selection.end <= selection.start) return null;
    if (!isIdentifier(name)) return null;
    const sel = source.slice(selection.start, selection.end).trim();
    if (!sel) return null;
    if (!allowMultiline && sel.includes("\n")) return null;

    const starts = lineStarts(source);
    let firstLineIdx = 0;
    for (let i = starts.length - 1; i >= 0; i--) {
        if (starts[i] <= selection.start) {
            firstLineIdx = i;
            break;
        }
    }
    const lineStart = starts[firstLineIdx];
    const lineEndIdx = source.indexOf("\n", lineStart);
    const lineEnd = lineEndIdx === -1 ? source.length : lineEndIdx;
    const line = source.slice(lineStart, lineEnd);
    const indent = leadingWhitespace(line);
    const unit = indent.includes("\t") ? "\t" : "    ";

    const before = source.slice(0, selection.start);
    const after = source.slice(selection.end);
    const assignment = `${indent}${name} = ${sel}\n`;

    const newSource =
        before.slice(0, lineStart) +
        assignment +
        before.slice(lineStart) +
        name +
        after;
    // Caret: right after the inserted name at the use site.
    const caret = lineStart + assignment.length + (before.length - lineStart) + name.length;
    return {source: newSource, caret};
}
