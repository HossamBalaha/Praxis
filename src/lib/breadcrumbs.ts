/**
 * breadcrumbs.ts — pure derivation of the symbol path (module > class >
 * function) shown by the IDE breadcrumb bar
 * (src/components/breadcrumbs-bar.tsx).
 *
 * Source data: the shared Python symbol index produced by
 * parsePythonSymbols (src/lib/python-symbols.ts) — the same index the
 * symbol palette and the code viewer's folding use, so the bar's path
 * always agrees with the palette.
 *
 * Algorithm (indent-stack): walk the def/class symbols in source order
 * up to the caret line, maintaining a stack of enclosing definitions;
 * a symbol with indent >= the stack top's indent CLOSES the top (it's
 * a sibling or an outer re-dedent), so the stack left over is exactly
 * the chain of definitions CONTAINING the caret line. Block-statement
 * symbols (for/if/try/with…) are deliberately excluded — the bar shows
 * the semantic path (module > class > function) the task defines; fold
 * blocks would only add noise at 24px of height.
 *
 * DOM-free and unit-tested (src/lib/__tests__/breadcrumbs.test.ts).
 */

import type {PythonSymbol} from "@/lib/python-symbols";

/** What a crumb represents. The module crumb is synthesized from the
 *  file name; the others map 1:1 onto PythonSymbol kinds. */
export type BreadcrumbKind = "module" | "class" | "function" | "method";

export interface Breadcrumb {
    kind: BreadcrumbKind;
    /** Display label: basename for module, bare name for class,
     *  `name()` for functions/methods (matches IDE breadcrumb density). */
    label: string;
    /** 1-based line the crumb jumps to (definition line; 1 for module). */
    line: number;
    /** The originating symbol (absent on the module crumb). */
    symbol?: PythonSymbol;
}

/** Symbol kinds that participate in the path (see header WHY). */
function isPathSymbol(s: PythonSymbol): boolean {
    return s.type === "function" || s.type === "method" || s.type === "class";
}

/**
 * The enclosing definition chain at `caretLine` (1-based). Returns just
 * the module crumb when the caret is above the first definition, and an
 * empty list when there is no file name at all (nothing to anchor).
 *
 * `caretLine` null/0 (no caret yet / non-text file) → module-only.
 */
export function symbolPathAtLine(
    symbols: PythonSymbol[],
    caretLine: number | null | undefined,
    fileName?: string
): Breadcrumb[] {
    const mod = moduleCrumb(fileName);
    if (!mod) return [];

    const line = typeof caretLine === "number" && caretLine > 0 ? caretLine : 0;
    if (!symbols || symbols.length === 0) return [mod];

    // parsePythonSymbols returns source order, but this also accepts any
    // hand-built list — sorting keeps the stack walk correct regardless.
    const defs = symbols
        .filter(isPathSymbol)
        .filter((s) => s.line <= line)
        .sort((a, b) => a.line - b.line);

    const stack: PythonSymbol[] = [];
    for (const s of defs) {
        // Pop everything the new definition closed (same indent = sibling;
        // smaller indent = outer level).
        while (stack.length > 0 && stack[stack.length - 1].indent >= s.indent) {
            stack.pop();
        }
        stack.push(s);
    }

    return [
        mod,
        ...stack.map((s): Breadcrumb => {
            const isClass = s.type === "class";
            return {
                kind: isClass ? "class" : s.type === "method" ? "method" : "function",
                label: isClass ? s.name : `${s.name}()`,
                line: s.line,
                symbol: s,
            };
        }),
    ];
}

/** Module crumb from a file name — basename with BOTH separators
 *  (Windows paths must not leak `\` into the label or split logic). */
export function moduleCrumb(fileName?: string): Breadcrumb | null {
    const name = fileName?.trim();
    if (!name) return null;
    const base = name.split(/[\\/]/).pop() ?? name;
    return {
        kind: "module",
        label: base || name,
        line: 1,
    };
}
