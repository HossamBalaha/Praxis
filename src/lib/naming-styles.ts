/**
 * Naming-style engine — powers the configurable coding style used by the
 * editor's "Insert block" templates and the Examples library.
 *
 * The user picks a style per identifier KIND (Settings → Editor →
 * Naming style): variables, functions, classes, dict keys and file
 * names each get one of snake_case / camelCase / PascalCase /
 * kebab-case / UPPER_SNAKE. Templates store identifiers in a canonical
 * word-list form; `applyNamingStyle` renders them per the setting.
 */

export type NamingStyle =
    | "snake_case"
    | "camelCase"
    | "PascalCase"
    | "kebab-case"
    | "UPPER_SNAKE";

export const NAMING_STYLES: { value: NamingStyle; label: string; example: string }[] = [
    {value: "snake_case", label: "snake_case", example: "process_data"},
    {value: "camelCase", label: "camelCase", example: "processData"},
    {value: "PascalCase", label: "PascalCase", example: "ProcessData"},
    {value: "kebab-case", label: "kebab-case", example: "process-data"},
    {value: "UPPER_SNAKE", label: "UPPER_SNAKE", example: "PROCESS_DATA"},
];

/** Which identifier kind a template token refers to. Each kind reads
 *  its own setting. */
export type NamingKind = "variable" | "function" | "class" | "dictKey" | "file";

export interface NamingStyleSettings {
    variables: NamingStyle;
    functions: NamingStyle;
    classes: NamingStyle;
    dictKeys: NamingStyle;
    files: NamingStyle;
}

/** defaults "make default 2 spaces and
 * all PascalCase unless var to be camelCase". Classes and functions
 * default to PascalCase, variables (and the var-like dict keys / JSON
 * fields) to camelCase, and generated FILE names to PascalCase. All
 * five remain individually configurable in Settings → Editor →
 * Naming style. */
export const DEFAULT_NAMING_STYLES: NamingStyleSettings = {
    variables: "camelCase",
    functions: "PascalCase",
    classes: "PascalCase",
    dictKeys: "camelCase",
    files: "PascalCase",
};

/** The PREVIOUS defaults — used by the settings schema
 * migration to detect "user never customized this key" so the new
 * defaults can be applied without stomping real customizations. */
export const LEGACY_NAMING_STYLES: NamingStyleSettings = {
    variables: "snake_case",
    functions: "snake_case",
    classes: "PascalCase",
    dictKeys: "snake_case",
    files: "snake_case",
};

/** Split a canonical name into words. Understands snake, kebab, spaces,
 *  Pascal and camel boundaries: "loadCSVData" → ["load","CSV","Data"],
 *  "my-cool thing" → ["my","cool","thing"]. */
function words(base: string): string[] {
    return base
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[\s_-]+/)
        .filter(Boolean);
}

/** Render a canonical name in the given style.
 *  `base` may be any of the styles already (words normalizes). */
export function applyNamingStyle(style: NamingStyle, base: string): string {
    const w = words(base);
    if (w.length === 0) return base;
    switch (style) {
        case "snake_case":
            return w.map((x) => x.toLowerCase()).join("_");
        case "kebab-case":
            return w.map((x) => x.toLowerCase()).join("-");
        case "UPPER_SNAKE":
            return w.map((x) => x.toUpperCase()).join("_");
        case "camelCase":
            return w
                .map((x, i) =>
                    i === 0
                        ? x.toLowerCase()
                        : x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()
                )
                .join("");
        case "PascalCase":
            return w
                .map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase())
                .join("");
        default:
            return base;
    }
}

/** Map a NamingKind to its style from the settings bundle. */
export function styleForKind(
    styles: NamingStyleSettings,
    kind: NamingKind
): NamingStyle {
    switch (kind) {
        case "variable":
            return styles.variables;
        case "function":
            return styles.functions;
        case "class":
            return styles.classes;
        case "dictKey":
            return styles.dictKeys;
        case "file":
            return styles.files;
        default:
            return "snake_case";
    }
}
