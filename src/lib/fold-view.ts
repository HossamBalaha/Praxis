/**
 * Pure fold-to-view math for the code viewer (src/components/
 * code-viewer.tsx): building the fold-collapsed display text, the
 * placeholder a folded block renders in its place, and the stable
 * fold-key mapper that disambiguates repeated symbols.
 *
 * Zero React, zero DOM (see __tests__/fold-view.test.ts).
 */
import type {PythonSymbol} from "@/lib/python-symbols";

/**
 * The display text with folded blocks collapsed: every hidden body
 * line is dropped and the folded symbol's def line is followed by ONE
 * placeholder row, so the rendered rows stay countable (the overlay
 * engine maps raw lines onto them — see layout/code-overlay-engine).
 * Unfolded files return the source unchanged.
 */
export function buildFoldedView(
    code: string,
    symbols: PythonSymbol[],
    foldedLines: ReadonlySet<number>,
    codeFolding: boolean
): string {
    if (!codeFolding || foldedLines.size === 0) return code;
    const result: string[] = [];
    const allLines = code.split("\n");
    for (let i = 0; i < allLines.length; i++) {
        const lineNum = i + 1;
        // Check if this line is inside a folded block.
        let isFolded = false;
        for (const sym of symbols) {
            if (foldedLines.has(sym.line) && lineNum > sym.line && lineNum <= (sym.endLine ?? sym.line)) {
                isFolded = true;
                break;
            }
        }
        if (isFolded) continue;
        result.push(allLines[i]);
        // If we just passed the def/class line of a folded symbol, add a placeholder.
        for (const sym of symbols) {
            if (foldedLines.has(sym.line) && lineNum === sym.line) {
                result.push(foldPlaceholderLine(sym));
            }
        }
    }
    return result.join("\n");
}

/**
 * The placeholder row a folded symbol renders: echoes the symbol kind
 * + name so the folded region is identifiable without expanding it.
 */
export function foldPlaceholderLine(sym: PythonSymbol): string {
    const kind =
        sym.type === "class" ? "class" :
            sym.type === "function" || sym.type === "method" ? "def" :
                sym.type === "loop" ? "loop" :
                    sym.type === "conditional" ? "if/elif" :
                        sym.type === "try" ? "try" :
                            sym.type === "with" ? "with" :
                                sym.type === "else" ? "else" :
                                    sym.type === "except" ? "except" :
                                        sym.type === "finally" ? "finally" : "block";
    const tail = sym.name && (sym.type === "function" || sym.type === "method")
        ? ` ${sym.name}(${sym.args ?? ""})`
        : sym.name ? ` ${sym.name.slice(0, 60)}` : "";
    return `    # ▸ ${kind}${tail} … (${Math.max(0, (sym.endLine ?? sym.line) - sym.line)} lines hidden — click to expand)`;
}

/**
 * Build the fold-key mapper for a symbol list: keys are `type:name`
 * while that name is unique among same-type symbols (so a fold
 * survives edits that shift lines above it), and disambiguated with
 * the line number when it repeats (`else:else:#42`) — the fix for the
 * "two children with the same key" React error block statements used
 * to trigger.
 */
export function buildFoldKeyMapper(
    symbols: PythonSymbol[]
): (sym: PythonSymbol) => string {
    const counts = new Map<string, number>();
    for (const s of symbols) {
        counts.set(`${s.type}:${s.name}`, (counts.get(`${s.type}:${s.name}`) ?? 0) + 1);
    }
    return (sym: PythonSymbol) =>
        (counts.get(`${sym.type}:${sym.name}`) ?? 0) > 1
            ? `${sym.type}:${sym.name}#${sym.line}`
            : `${sym.type}:${sym.name}`;
}
