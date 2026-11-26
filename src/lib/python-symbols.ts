/**
 * Lightweight Python symbol parser — extracts function, class, and
 * block-level statement definitions with their line numbers, without
 * a full AST parser. Uses regex to match `def`, `async def`, `class`,
 * and the block keywords `for`, `if`, `while`, `try`, `with` at any
 * indentation level. The block keywords are surfaced so the code
 * viewer can fold them (not just def/class).
 */

export interface PythonSymbol {
    name: string;
    type: "function" | "class" | "method" | "loop" | "conditional" | "try" | "with" | "else" | "except" | "finally";
    line: number; // 1-indexed
    endLine?: number; // 1-indexed (approximate)
    indent: number; // indentation level (in spaces — tabs expanded)
    args?: string; // for functions: the argument list
    docstring?: string; // first line of the docstring if present
}

const TAB_WIDTH = 4;

/**
 * Compute the indentation level of a line in *space units*, expanding
 * tabs to `TAB_WIDTH` spaces. This is necessary because counting raw
 * characters (the old `m[1].length` approach) treats a tab as 1 unit,
 * which breaks indent comparison when files mix tabs and spaces or use
 * tabs exclusively — methods inside a tab-indented class would appear to
 * have indent 1, the same as a top-level def, and the endLine logic
 * would terminate too early.
 */
function getIndent(line: string): number {
    let count = 0;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === " ") count++;
        else if (ch === "\t") count += TAB_WIDTH;
        else break;
    }
    return count;
}

/** True if the line is blank or a Python comment. */
function isBlankOrComment(line: string): boolean {
    const t = line.trim();
    return !t || t.startsWith("#");
}

/**
 * Parse Python source for top-level and nested definitions.
 * Returns symbols sorted by line number.
 */
export function parsePythonSymbols(source: string): PythonSymbol[] {
    const lines = source.split("\n");
    const symbols: PythonSymbol[] = [];

    // Patterns for def, async def, and class. We capture leading
    // whitespace with `(\s*)` only to anchor the match — the actual
    // indent is computed via `getIndent` so tabs are expanded.
    const defRe = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?\s*:/;
    const classRe = /^(\s*)class\s+(\w+)\s*(?:\([^)]*\))?\s*:/;
    // Block-level statement patterns. These are detected alongside
    // def/class so the code viewer can fold them. The trailing `:` is
    // required to avoid matching `import foo`-style lines that begin
    // with these keywords inside expressions.
    const forRe = /^(\s*)for\s+.+\s+in\s+.+:/;
    const ifRe = /^(\s*)if\s+.+:/;
    const elifRe = /^(\s*)elif\s+.+:/;
    const elseRe = /^(\s*)else\s*:/;
    const whileRe = /^(\s*)while\s+.+:/;
    const tryRe = /^(\s*)try\s*:/;
    const withRe = /^(\s*)with\s+.+:/;
    const exceptRe = /^(\s*)except(\s+.+)?:/;
    const finallyRe = /^(\s*)finally\s*:/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m = defRe.exec(line);
        if (m) {
            const indent = getIndent(line);
            const name = m[2];
            const args = m[3]?.trim();
            const isMethod = indent > 0 && symbols.some(
                (s) => s.type === "class" && s.indent < indent && s.line < i + 1
            );
            // Check for docstring on the next non-empty line.
            let docstring: string | undefined;
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const next = lines[j].trim();
                if (!next || next.startsWith("#")) continue;
                const docMatch = next.match(/^("""|''')(.*)/);
                if (docMatch) {
                    docstring = docMatch[2].replace(/("""|''')$/, "").trim() || undefined;
                }
                break;
            }
            symbols.push({
                name,
                type: isMethod ? "method" : "function",
                line: i + 1,
                indent,
                args,
                docstring,
            });
            continue;
        }

        m = classRe.exec(line);
        if (m) {
            const indent = getIndent(line);
            const name = m[2];
            let docstring: string | undefined;
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const next = lines[j].trim();
                if (!next || next.startsWith("#")) continue;
                const docMatch = next.match(/^("""|''')(.*)/);
                if (docMatch) {
                    docstring = docMatch[2].replace(/("""|''')$/, "").trim() || undefined;
                }
                break;
            }
            symbols.push({
                name,
                type: "class",
                line: i + 1,
                indent,
                docstring,
            });
            continue;
        }

        // Block-level statements (for/if/elif/else/while/try/except/finally/with).
        // The `name` is the full stripped line content — used both for the symbol
        // dropdown and the fold chevron tooltip. Indent and endLine use
        // the same logic as def/class, so these fold correctly inside
        // larger blocks (e.g. an `if` inside a `for` inside a `def`).
        let blockType: "loop" | "conditional" | "try" | "with" | "else" | "except" | "finally" | null = null;
        if (forRe.exec(line)) blockType = "loop";
        else if (whileRe.exec(line)) blockType = "loop";
        else if (ifRe.exec(line)) blockType = "conditional";
        else if (elifRe.exec(line)) blockType = "conditional";
        else if (elseRe.exec(line)) blockType = "else";
        else if (tryRe.exec(line)) blockType = "try";
        else if (exceptRe.exec(line)) blockType = "except";
        else if (finallyRe.exec(line)) blockType = "finally";
        else if (withRe.exec(line)) blockType = "with";
        if (blockType) {
            const indent = getIndent(line);
            const name = line.trim();
            symbols.push({
                name,
                type: blockType,
                line: i + 1,
                indent,
            });
        }
    }

    // Compute endLines.
    //
    // A symbol's block extends from its def/class line until the next
    // non-blank, non-comment line whose indent is <= the symbol's indent
    // (i.e. the next sibling or parent statement — not a child). If no
    // such line exists, the block extends to the end of the file.
    //
    // We look at ALL subsequent source lines (not just the next symbol)
    // because top-level statements that aren't def/class — e.g. a
    // `print` call or an import after a function — also terminate the
    // block. Using only the next symbol would make the fold span those
    // unrelated lines, producing the "folds too much" symptom.
    for (let i = 0; i < symbols.length; i++) {
        const s = symbols[i];
        let endLine = lines.length; // default: extends to end of file
        // `s.line` is 1-indexed; lines[s.line] is the 0-indexed line AFTER
        // the def line (the first line we need to consider).
        for (let j = s.line; j < lines.length; j++) {
            const line = lines[j];
            if (isBlankOrComment(line)) continue;
            if (getIndent(line) <= s.indent) {
                // This line ends the block. `j` is 0-indexed; the 1-indexed
                // line number of the line BEFORE line (j+1) is `j`.
                endLine = j;
                break;
            }
        }
        s.endLine = endLine;
    }

    return symbols;
}

/** Format a symbol for display: `def foo(x, y)` or `class Bar`, or the
 * full block-statement text (e.g. `for item in items:`, `if condition:`,
 * `while x > 0:`, `try:`, `with open(...) as f:`) for the new block types. */
export function formatSymbol(sym: PythonSymbol): string {
    if (sym.type === "class") return `class ${sym.name}`;
    if (sym.type === "function" || sym.type === "method") {
        return `def ${sym.name}(${sym.args ?? ""})`;
    }
    // Block-level statements (for/if/while/try/with): `name` already
    // holds the full stripped source line, which is the most faithful
    // representation we have without a real AST.
    return sym.name;
}
