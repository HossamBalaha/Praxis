/**
 * pure, offline JSON auto-formatting (the Organize ▸
 * right-click twin for.json files; JSON joins TOML/MD/HTML).
 *
 * JSON's structure fully determines its layout, so "format" and
 * "indent" are the same operation: parse → stringify with the
 * configured indent width. Invalid JSON is returned unchanged (the
 * caller shows a toast so the user knows nothing happened).
 */

export interface JsonFormatOptions {
    /** Spaces per indentation level (Settings → Editor → Formatting;
     *  default 2). */
    indentWidth?: number;
    /** Ensure exactly one trailing newline (default true). */
    finalNewline?: boolean;
    /** Sort object keys alphabetically (default false). */
    sortKeys?: boolean;
}

function sortValue(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sortValue);
    if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            out[k] = sortValue((v as Record<string, unknown>)[k]);
        }
        return out;
    }
    return v;
}

/** Format a JSON document. Returns the ORIGINAL text when it does
 *  not parse (never throws). */
export function formatJson(text: string, options: JsonFormatOptions = {}): string {
    const indentWidth = Math.max(1, Math.min(8, options.indentWidth ?? 2));
    const finalNewline = options.finalNewline ?? true;
    try {
        const parsed = JSON.parse(text);
        const value = options.sortKeys ? sortValue(parsed) : parsed;
        const stringified = JSON.stringify(value, null, indentWidth);
        if (stringified === undefined) return text; // undefined/… input
        return finalNewline ? `${stringified}\n` : stringified;
    } catch {
        return text;
    }
}

/** Alias — for JSON, re-indenting IS formatting (structure defines
 *  the layout). Returns the original text when it does not parse. */
export const reindentJson = formatJson;
