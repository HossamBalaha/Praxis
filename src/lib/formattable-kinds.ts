/**
 * The registry of every file kind the offline Auto-format /
 * Auto-indent engines cover — the single source of truth for the
 * viewer's right-click FORMATTING submenu (view mode), the edit-mode
 * "Format & transform ▸" gate and the menubar capability gating.
 *
 * Before this registry the menus hard-coded per-kind conditional
 * blocks that drifted out of sync with lib/code-format's language
 * list: Lua / Perl / Rust / Julia / Kotlin / Swift / PowerShell /
 * Batch rendered an EMPTY "Formatting ▸" submenu (the trigger was
 * always shown) and PowerShell / Batch had no entries at all. Every kind that
 * formatSource can handle is declared here exactly once; menus
 * derive from this list and HIDE entirely when the open kind is not
 * in it (no empty submenus ever again).
 */

export interface FormattableKind {
    /** The FileKind (as classified by lib/scripts). */
    kind: string;
    /** Display name used in "Auto-Format <Name>" menu rows. */
    label: string;
    /** Tooltip for the Auto-Format row. */
    formatTitle: string;
    /** Tooltip for the Auto-Indent row (kinds whose indent twin is the
     *  same engine describe it here; null = indent-only twin exists). */
    indentTitle?: string;
    /** False for the kinds whose structure IS the layout — a separate
     *  indent-only pass is meaningless (JSON: indenting is formatting). */
    hasIndentTwin?: boolean;
}

/** Markdown / HTML / TOML / JSON / YAML / CSS / SQL + the code family
 *  (JS / TS / MATLAB / Java / C / C++ / R / shell / Ruby / PHP / Go /
 *  Lua / Perl / Rust / Julia / Kotlin / Swift) + the Windows-native
 *  scripting pair (PowerShell / Batch). Mirrors the FmtLang union in
 *  file-viewer's formatSource exactly. */
export const FORMATTABLE_KINDS: readonly FormattableKind[] = [
    {
        kind: "markdown",
        label: "Markdown",
        formatTitle: "Auto-format this Markdown file — tables, lists and code fences untouched",
        indentTitle: "Re-indent this Markdown file to the configured indentation",
    },
    {
        kind: "html",
        label: "HTML",
        formatTitle: "Beautify this HTML file — one line per block element, script/style contents untouched",
        indentTitle: "Re-indent this HTML file to the configured indentation — line content untouched",
    },
    {
        kind: "toml",
        label: "TOML",
        formatTitle: "Auto-format this TOML file — aligned key column (`=` lines up), blank line before each [table], normalized array indentation",
        indentTitle: "Re-indent this TOML file's multiline arrays — everything else untouched",
    },
    {
        kind: "json",
        label: "JSON",
        formatTitle: "Auto-format this JSON file — re-stringified at the configured indent width",
        hasIndentTwin: false,
    },
    {
        kind: "yaml",
        label: "YAML",
        formatTitle: "Re-indent this YAML file — indentation snapped to the configured unit, block scalars (| and >) untouched",
        indentTitle: "Re-indent to the configured indentation — line content untouched",
    },
    {
        kind: "css",
        label: "CSS",
        formatTitle: "Beautify this CSS file — one declaration per line, nested blocks at the configured indent",
        indentTitle: "Re-indent to the configured indentation — line content untouched",
    },
    {
        kind: "sql",
        label: "SQL",
        formatTitle: "Re-indent this SQL file — clauses on their own lines, continuation and subqueries indented, strings untouched",
        indentTitle: "Re-indent to the configured indentation — line content untouched",
    },
    {
        kind: "javascript",
        label: "JavaScript",
        formatTitle: "Beautify this file — brace re-indent + operator spacing (template literals, strings, comments and regex stay frozen)",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "typescript",
        label: "TypeScript",
        formatTitle: "Beautify this file — brace re-indent + operator spacing (template literals, strings, comments and regex stay frozen)",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "matlab",
        label: "MATLAB",
        formatTitle: "Auto-format this MATLAB file — block re-indent + spacing (strings and transpose untouched)",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "java",
        label: "Java",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "c",
        label: "C",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "cpp",
        label: "C++",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "r",
        label: "R",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "shell",
        label: "Shell",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "ruby",
        label: "Ruby",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "php",
        label: "PHP",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "go",
        label: "Go",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "lua",
        label: "Lua",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "perl",
        label: "Perl",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "rust",
        label: "Rust",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "julia",
        label: "Julia",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "kotlin",
        label: "Kotlin",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "swift",
        label: "Swift",
        formatTitle: "Re-indent + spacing pass for this file — braces and keywords drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "powershell",
        label: "PowerShell",
        formatTitle: "Re-indent this PowerShell script — braces + parenthesized blocks drive the layout, strings untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "batch",
        label: "Batch",
        formatTitle: "Re-indent this Batch file — `( … )` blocks and labels drive the layout",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "zig",
        label: "Zig",
        formatTitle: "Re-indent this Zig file — braces drive the layout; strings and comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "dart",
        label: "Dart",
        formatTitle: "Re-indent this Dart file — braces drive the layout; strings and comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "groovy",
        label: "Groovy",
        formatTitle: "Re-indent this Groovy file — braces drive the layout; strings and comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "scala",
        label: "Scala",
        formatTitle: "Re-indent this Scala file — braces drive the layout; strings and comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "elixir",
        label: "Elixir",
        formatTitle: "Re-indent this Elixir file — do…end blocks drive the layout; heredocs and comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "haskell",
        label: "Haskell",
        formatTitle: "Re-indent this Haskell file — layout-sensitive, so the pass normalizes the indent grid to whole multiples of the configured width; comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "erlang",
        label: "Erlang",
        formatTitle: "Re-indent this Erlang file — -> clause arrows open one level, end/after/catch/else dedent; % comments untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "clojure",
        label: "Clojure",
        formatTitle: "Re-indent this Clojure file — every ( ) [ ] { } form drives the layout; ; comments and strings untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "ocaml",
        label: "OCaml",
        formatTitle: "Re-indent this OCaml file — layout-sensitive, so the pass normalizes the indent grid to whole multiples of the configured width",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "fsharp",
        label: "F#",
        formatTitle: "Re-indent this F# file — layout-sensitive, so the pass normalizes the indent grid to whole multiples of the configured width",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
    {
        kind: "graphql",
        label: "GraphQL",
        formatTitle: "Re-indent this GraphQL file — braces drive the layout; # comments and strings untouched",
        indentTitle: "Re-indent only (Settings → Formatting → per-language indent width) — line content untouched",
    },
];

/** The open file's formattable-kind entry (null when the kind has no
 *  formatter — callers hide their Formatting menu entirely). */
export function formattableKindFor(kind: string | null | undefined): FormattableKind | null {
    if (!kind) return null;
    return FORMATTABLE_KINDS.find((k) => k.kind === kind) ?? null;
}
