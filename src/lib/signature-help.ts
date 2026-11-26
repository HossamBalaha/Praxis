/**
 * signature-help.ts — the pure scanner behind the editor's signature
 * help popup, extracted from code-viewer.tsx in Phase 3 (the viewer is
 * line-budget-capped; this is ~120 lines of string logic with no
 * React in it).
 *
 * Given the buffer and a caret offset it answers ONE question: is the
 * caret inside a call's parentheses, and if so which function, which
 * argument, and what signature + docstring should the popup show?
 *
 *   resolveSignatureHelp("f(1, 2|)", 6, symbols) →
 *     { name: "f", args: "x, y", activeArg: 1, line: 1, col: 7, … }
 *
 * Resolution order (unchanged from the viewer's original logic):
 *   1. the file's OWN defs — the LAST def of the callee name BEFORE
 *      the call line (respects redefinition);
 *   2. a small builtin table (print/len/range/…).
 * Null → no popup.
 *
 * The scanner is string/bracket-aware: colons and commas inside string
 * literals or nested brackets never advance the active-argument count.
 */

import type {PythonSymbol} from "@/lib/python-symbols";

/** The popup's data (the viewer's SigHelp shape, verbatim). */
export interface SignatureHelpResult {
    /** The callee as written (may be dotted: "math.sqrt"). */
    name: string;
    /** Raw arg-list string ("self, x, y=1, *args"). */
    args: string;
    docstring?: string;
    /** 0-based index of the argument the caret is in. */
    activeArg: number;
    /** The call's line (1-based, for symbol lookup + popup placement). */
    line: number;
    /** The caret's column (1-based, for popup placement). */
    col: number;
}

/** Builtins worth showing — name → signature + doc. */
export const BUILTIN_SIGS: Record<string, { args: string; docstring: string }> = {
    print: {
        args: "value, ..., sep=' ', end='\\n', file=None, flush=False",
        docstring: "Print values to the stream sys.stdout."
    },
    len: {args: "obj", docstring: "Return the number of items in a container."},
    range: {args: "start, stop, step", docstring: "start..stop in steps of step — stop is NOT included."},
    enumerate: {args: "iterable, start=0", docstring: "Yield (index, item) pairs from the iterable."},
    zip: {args: "*iterables, strict=False", docstring: "Aggregate iterables element-wise into tuples."},
    sorted: {args: "iterable, key=None, reverse=False", docstring: "Return a new sorted list from the items."},
    open: {args: "file, mode='r', encoding=None", docstring: "Open a file — use mode 'w' to write, 'a' to append."},
    input: {args: "prompt=None", docstring: "Read a line from stdin."},
    round: {args: "number, ndigits=None", docstring: "Round to ndigits precision (banker's rounding)."},
    isinstance: {args: "obj, class_or_tuple", docstring: "True when obj is an instance of the class(es)."},
    format: {args: "value, format_spec=''", docstring: "Format value per the given spec."},
    map: {args: "function, *iterables", docstring: "Apply function to every item of the iterables."},
    filter: {args: "function, iterable", docstring: "Keep the items where function(item) is truthy."},
    sum: {args: "iterable, start=0", docstring: "Sum the items, starting from start."},
    min: {args: "iterable, key=None, default=None", docstring: "The smallest item."},
    max: {args: "iterable, key=None, default=None", docstring: "The largest item."},
    abs: {args: "x", docstring: "The absolute value of x."},
    any: {args: "iterable", docstring: "True if ANY item is truthy."},
    all: {args: "iterable", docstring: "True if EVERY item is truthy."},
};

/**
 * Resolve the signature-help popup data for a caret position, or null
 * when the caret is not inside a call (or the callee is unknown).
 * `symbols` are the buffer's OWN defs (editSymbolsRef in the viewer).
 */
export function resolveSignatureHelp(
    src: string,
    pos: number,
    symbols: PythonSymbol[]
): SignatureHelpResult | null {
    // Scan backwards for the nearest UNMATCHED '(' before the caret.
    let depth = 0;
    // The index of the opening paren (−1 = none found).
    let openIdx = -1;
    for (let i = pos - 1; i >= 0; i--) {
        // The character under inspection.
        const ch = src[i];
        // A closing paren deepens the search.
        if (ch === ")") depth++;
        // An opening paren at depth 0 is our call.
        else if (ch === "(") {
            // Found it.
            if (depth === 0) {
                // Record and stop.
                openIdx = i;
                break;
            }
            // Matched an inner paren — keep climbing.
            depth--;
        }
    }
    // No enclosing call.
    if (openIdx === -1) return null;
    // The callee identifier ends right before the '(' (allowing
    // dotted attribute access: math.sqrt).
    let j = openIdx - 1;
    // Skip the whitespace between the name and the paren.
    while (j >= 0 && /[ \t]/.test(src[j]!)) j--;
    // One past the name's last character.
    const nameEnd = j + 1;
    // Walk back over identifier/dot characters.
    while (j >= 0 && /[\w.]/.test(src[j]!)) j--;
    // The callee as written.
    const name = src.slice(j + 1, nameEnd);
    // The final segment of a dotted name.
    const shortName = name.split(".").pop() ?? name;
    // Not an identifier — no popup.
    if (!shortName || !/^[A-Za-z_]\w*$/.test(shortName)) return null;
    // The call's line (1-based, for symbol lookup + popup placement).
    const line = src.slice(0, openIdx).split("\n").length;
    // Count top-level commas between '(' and the caret → active arg.
    let activeArg = 0;
    // Bracket depth inside the call.
    let d = 0;
    // The active string literal quote, if any.
    let inStr: '"' | "'" | null = null;
    for (let i = openIdx + 1; i < pos && i < src.length; i++) {
        // The character under inspection.
        const ch = src[i];
        // Inside a string — only its closing quote matters.
        if (inStr) {
            // The matching unescaped quote closes it.
            if (ch === inStr && src[i - 1] !== "\\") inStr = null;
        } else if (ch === '"' || ch === "'") {
            // Enter the string.
            inStr = ch;
        } else if (ch === "(" || ch === "[" || ch === "{") {
            // Nested bracket.
            d++;
        } else if (ch === ")" || ch === "]" || ch === "}") {
            // The call closed before the caret — no active argument.
            if (d === 0) break;
            // Leave the nested bracket.
            d--;
        } else if (ch === "," && d === 0) {
            // A top-level comma advances the argument.
            activeArg++;
        }
    }
    // Resolve: the LAST def of this name BEFORE the call line, then
    // builtins.
    const syms = symbols.filter(
        (s) =>
            (s.type === "function" || s.type === "method") &&
            s.name === shortName &&
            s.line < line
    );
    // The resolved arg list (null = unknown callee).
    let args: string | null = null;
    // The resolved docstring.
    let docstring: string | undefined;
    if (syms.length > 0) {
        // The most recent prior def wins.
        const best = syms[syms.length - 1]!;
        // Its arg list.
        args = best.args ?? "";
        // Its docstring (if any).
        docstring = best.docstring;
    } else if (BUILTIN_SIGS[shortName]) {
        // The builtin table.
        args = BUILTIN_SIGS[shortName]!.args;
        docstring = BUILTIN_SIGS[shortName]!.docstring;
    }
    // Unknown callee — no popup.
    if (args === null) return null;
    // The caret's column (1-based).
    const col = pos - src.lastIndexOf("\n", pos - 1) - 1 + 1;
    // The popup data.
    return {name, args, docstring, activeArg, line, col};
}
