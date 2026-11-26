/**
 * Shared constructor for the example library — keeps 250+ example
 * definitions in the `examples-data/` files compact and uniform.
 *
 *: the library grew from 37 to 250+ entries, grouped by
 * language → category → SUBCATEGORY (user request: "make them at least
 * 20 per category and also u can include sub categories to avoid long
 * lists"). Each data module builds its entries with this helper.
 */
import {applyNamingStyle, type NamingStyleSettings} from "@/lib/naming-styles";
import type {ExampleLanguage, FileExample} from "@/lib/examples";

/** Build one example entry with fixed language/extension. `fixedName`
 *  (optional) pins the created file's name — for canonical project
 *  files (pyproject.toml, .editorconfig, Makefile, …) whose names must
 *  not be naming-styled.
 *
 *  The menu ITEM label passes through pascalCaseLabel here — the
 *  single choke point every example in every data module flows
 *  through, so every label reads uniformly in Pascal Case
 *  ("Csv Join", "Print Tricks") with zero churn in the data files.
 *  Labels are display-only (file names / ids / naming styles are
 *  untouched).
 *
 *  Rules: the label is trimmed; every space/hyphen-separated word is
 *  Pascal-cased; ALL-CAPS words (CSV, 3D) stay; DOTTED tokens
 *  ("setup.py", "nn.Module") stay verbatim — they are file names or
 *  qualified names, not prose. */
export function pascalCaseLabel(label: string): string {
    if (!label) return label;
    const trimmed = label.trim();
    if (!trimmed) return trimmed;
    const isUpperish = (w: string) =>
        w.length > 0 && w === w.toUpperCase() && /[A-Z0-9]/.test(w);
    const cap = (w: string): string => {
        if (!w || isUpperish(w)) return w; // CSV, CI, 3D, "&", "()"…
        // Lower the rest so ALL-CAPS words like "Banner" stay, "BANNER" →
        // "Banner", and mixed "pRint" → "Print" — canonical Pascal.
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    };
    return trimmed
        .split(/(\s+)/) // keep the separators
        .map((tok) =>
            /^\s+$/.test(tok)
                ? tok
                : // Dotted tokens are file names / qualified names — verbatim.
                tok.includes(".")
                    ? tok
                    : // Hyphenated compounds capitalize each half ("Real-time" →
                      // "Real-Time"); punctuation-only parts pass through.
                    tok
                        .split("-")
                        .map((part) =>
                            /^[A-Za-z]/.test(part) || /[A-Za-z]/.test(part) ? cap(part) : part
                        )
                        .join("-")
        )
        .join("");
}

export function mkExample(
    language: ExampleLanguage,
    id: string,
    label: string,
    description: string,
    category: string,
    subcategory: string,
    baseName: string,
    extension: string,
    build: (s: NamingStyleSettings) => string,
    fixedName?: string,
): FileExample {
    return {
        id,
        label: pascalCaseLabel(label),
        description,
        language,
        category,
        subcategory,
        baseName,
        extension,
        build,
        fixedName,
    };
}

/**
 * Naming-style aliases — the sugar that keeps generated bodies readable
 * while still honoring Settings → Editor → Naming style. Each Python
 * build function opens with:
 *
 *   const f = fn(s); const v = vr(s); const c = cl(s); const k = ky(s);
 *
 * and then uses `${f("process")}`, `${v("data")}`, `${c("Model")}`,
 * `${k("total")}` inside the template literal.
 */
export const fn = (s: NamingStyleSettings) => (n: string) => applyNamingStyle(s.functions, n);
export const vr = (s: NamingStyleSettings) => (n: string) => applyNamingStyle(s.variables, n);
export const cl = (s: NamingStyleSettings) => (n: string) => applyNamingStyle(s.classes, n);
export const ky = (s: NamingStyleSettings) => (n: string) => applyNamingStyle(s.dictKeys, n);
