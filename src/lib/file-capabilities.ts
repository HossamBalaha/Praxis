/**
 * per-file-kind capability gating for the navbar menus and
 * the toolbar.
 *
 * The menus used to enable almost everything for every file (Run on a
 *.md, "Format document" on a.mp4, AI code tools on a CSV…). This
 * helper is the single source of truth: given the file kind of the
 * OPEN file, it says which actions make sense. menu-bar.tsx consumes
 * it (plus the Run toolbar in page.tsx) so items are visibly DISABLED
 * (dimmed, with an explanatory tooltip) instead of failing at
 * click-time with an error toast.
 */
import type {FileKind} from "@/lib/scripts";

export interface FileCapabilities {
    /** Run / Run all / Run with coverage / Debug — .py only. */
    canRun: boolean;
    /** Run in Console (works on .py source; other kinds have none). */
    canRunInConsole: boolean;
    /** black/ruff Format document + Auto-indent file. */
    canFormat: boolean;
    /** AI Explain / Improve / Generate tests (need Python source). */
    canAiCode: boolean;
    /** Lint / typecheck / tests panels target Python. */
    canLint: boolean;
    /** Chart preview + editable grid (CSV/TSV). */
    canChart: boolean;
    /** Transform pipeline (CSV/TSV). */
    canTransform: boolean;
    /** The whole Data menu needs a tabular/data file (or none open). */
    canData: boolean;
    /** SQL workbench entry (database files). */
    canSql: boolean;
    /** Spell check (plain-text-ish editors). */
    canSpell: boolean;
    /** Edit-in-viewer (text-representable kinds). */
    canEdit: boolean;
    /** Profiler + coverage reports are Python runs. */
    canProfile: boolean;
    /** The editor gutter/bookmark actions need the Python editor. */
    canGotoLine: boolean;
    /** line bookmarks target the Python editor (toggle,
     * next/prev, gutter) — every other kind has no line model. */
    canBookmark: boolean;
}

const EDITABLE_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
    "markdown",
    "text",
    "log",
    "json",
    "yaml",
    "toml",
    "sql",
    "r",
    "shell",
    "html",
    // CSS joined the editable, formattable text kinds
    // (lib/misc-format beautifier + the generic text editor).
    "css",
    "csv",
]);

const SPELL_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
    "markdown",
    "text",
    "log",
    // the rest of the spellable text kinds — wavy
    // underlines now render in their read AND edit views (both
    // windows), not just a red count on the chip.
    "yaml",
    "toml",
    "json",
    "sql",
    "r",
    "shell",
    "html",
    // stylesheets are spellable text too.
    "css",
]);

/** Capabilities for "no file open" — everything off except navigation. */
export const NO_FILE_CAPABILITIES: FileCapabilities = {
    canRun: false,
    canRunInConsole: false,
    canFormat: false,
    canAiCode: false,
    canLint: false,
    canChart: false,
    canTransform: false,
    canData: false,
    canSql: false,
    canSpell: false,
    canEdit: false,
    canProfile: false,
    canGotoLine: false,
    canBookmark: false,
};

export function capabilitiesForKind(kind: FileKind | undefined | null): FileCapabilities {
    if (!kind) return NO_FILE_CAPABILITIES;
    switch (kind) {
        case "python":
            return {
                canRun: true,
                canRunInConsole: true,
                canFormat: true,
                canAiCode: true,
                canLint: true,
                canChart: false,
                canTransform: false,
                canData: false,
                canSql: false,
                canSpell: false,
                canEdit: false,
                canProfile: true,
                canGotoLine: true,
                canBookmark: true,
            };
        case "csv":
        case "spreadsheet":
            return {
                canRun: false,
                canRunInConsole: false,
                canFormat: false,
                canAiCode: false,
                canLint: false,
                canChart: kind === "csv",
                canTransform: kind === "csv",
                canData: true,
                canSql: false,
                canSpell: false,
                canEdit: kind === "csv",
                canProfile: false,
                canGotoLine: false,
                canBookmark: false,
            };
        case "sqlite":
            return {
                canRun: false,
                canRunInConsole: false,
                canFormat: false,
                canAiCode: false,
                canLint: false,
                canChart: false,
                canTransform: false,
                canData: true,
                canSql: true,
                canSpell: false,
                canEdit: false,
                canProfile: false,
                canGotoLine: false,
                canBookmark: false,
            };
        case "javascript":
        case "typescript":
        case "matlab":
        case "java":
        case "c":
        case "cpp":
        case "ruby":
        case "php":
        case "go":
        // the six new registry kinds joined the runnable set.
        case "lua":
        case "perl":
        case "rust":
        case "julia":
        case "kotlin":
        case "swift":
        case "powershell":
        case "batch":
        case "zig":
        case "dart":
        case "groovy":
        case "scala":
        case "elixir":
        case "haskell":
        case "erlang":
        case "clojure":
        case "ocaml":
        case "fsharp":
        // GraphQL is a QUERY language — highlight / edit / format only
        // (there is no interpreter to run); its "runtime" is the
        // offline formatter pass + the viewer's grammar.
        case "graphql":
            return {
                // the language runtime kinds — runnable through the
                // registry (node / tsx / matlab / octave / java / gcc / g++)
                // with an install-hint toast when the runtime is missing, and
                // formattable offline (lib/code-format + matlab-format).
                // ruby / php / go joined the runnable registry kinds.
                canRun: kind === "graphql" ? false : true,
                canRunInConsole: false,
                canFormat: true,
                canAiCode: true,
                canLint: false,
                canChart: false,
                canTransform: false,
                canData: false,
                canSql: false,
                canSpell: false,
                canEdit: true,
                canProfile: false,
                canGotoLine: true,
                canBookmark: kind === "graphql" ? false : true,
            };
        case "image":
        case "video":
        case "audio":
        case "pdf":
        case "ipynb":
        case "other":
            return {
                canRun: false,
                canRunInConsole: false,
                canFormat: false,
                canAiCode: false,
                canLint: false,
                canChart: false,
                canTransform: false,
                canData: false,
                canSql: false,
                canSpell: false,
                canEdit: false,
                canProfile: false,
                canGotoLine: false,
                canBookmark: false,
            };
        default:
            // markdown / text / log / json / yaml / toml / sql / r / shell / html
            return {
                // R and shell RUN through the runtime registry
                // (Rscript / bash) — "the main is python and others can run".
                canRun: kind === "r" || kind === "shell",
                canRunInConsole: false,
                // HTML joined Markdown — both have real
                // formatters wired into the viewer's view AND edit modes
                // (Edit ▸ Format document routes by kind now).
                // TOML + JSON joined too (lib/toml-format,
                // lib/json-format) — the "toml files are not presented/
                // indented correctly" fix.
                // YAML / CSS / SQL joined (lib/misc-format) — the
                // "add others also" part of the formatter-config request.
                canFormat:
                    kind === "markdown" ||
                    kind === "html" ||
                    kind === "toml" ||
                    kind === "json" ||
                    kind === "yaml" ||
                    kind === "css" ||
                    kind === "sql",
                // R and Shell are runnable languages — the
                // AI / Refactor / Explain groups must light up for them too
                // (the same canAiCode gate the other runnable kinds use, so
                // Explorer and both editor surfaces agree through
                // menuGroupsForKind's "ai" group).
                canAiCode: kind === "r" || kind === "shell",
                canLint: false,
                canChart: false,
                canTransform: false,
                canData: false,
                canSql: kind === "sql",
                canSpell: SPELL_KINDS.has(kind),
                canEdit: EDITABLE_KINDS.has(kind),
                canProfile: false,
                canGotoLine: false,
                canBookmark: false,
            };
    }
}

/** Why an item is disabled — shown as the tooltip suffix. */
export function capabilityHint(kind: FileKind | undefined | null): string {
    if (!kind) return "no file is open";
    switch (kind) {
        case "python":
            return "";
        // the runtime kinds carry their own (runnable) story.
        case "javascript":
            return "JavaScript runs through Node.js";
        case "typescript":
            return "TypeScript runs through tsx / Node ≥ 22.6 / deno";
        case "matlab":
            return "MATLAB files run through matlab -batch or GNU Octave";
        case "java":
            return "Java single-file programs run through java";
        case "c":
            return "C compiles with gcc, then runs";
        case "cpp":
            return "C++ compiles with g++, then runs";
        case "ruby":
            return "Ruby scripts run through ruby";
        case "php":
            return "PHP scripts run through php";
        case "go":
            return "Go files run through `go run`";
        // the new registry languages carry their own hints.
        case "lua":
            return "Lua scripts run through lua";
        case "perl":
            return "Perl scripts run through perl";
        case "rust":
            return "Rust compiles with rustc, then runs";
        case "julia":
            return "Julia scripts run through julia";
        case "kotlin":
            return "Kotlin scripts run through kotlin script mode";
        case "swift":
            return "Swift scripts run through swift";
        // the Windows-native scripting pair.
        case "powershell":
            return "PowerShell scripts run through pwsh / powershell.exe";
        case "batch":
            return "Batch files run through cmd.exe";
        case "zig":
            return "Zig files compile and run through `zig run`";
        case "dart":
            return "Dart scripts run through `dart run`";
        case "groovy":
            return "Groovy scripts run through groovy";
        case "scala":
            return "Scala scripts run through scala (a JDK is needed too)";
        case "elixir":
            return "Elixir scripts run through elixir";
        case "haskell":
            return "Haskell scripts run through runghc (the GHC Haskell platform)";
        case "erlang":
            return "Erlang scripts run through escript (an Erlang/OTP install)";
        case "clojure":
            return "Clojure code runs through babashka (bb) or the clojure CLI";
        case "ocaml":
            return "OCaml scripts run through the ocaml interpreter";
        case "fsharp":
            return "F# scripts run through dotnet fsi (the .NET SDK)";
        case "graphql":
            return "GraphQL is a query language — it highlights, edits and formats, but there is no interpreter to run";
        case "r":
            return "R scripts run through Rscript";
        case "shell":
            return "shell scripts run through bash";
        case "csv":
        case "spreadsheet":
            return "data files can't run as Python — the Data menu has the tools";
        case "sqlite":
            return "databases are queried in the SQL workbench, not run";
        case "image":
            return "images open in the image toolbox";
        case "video":
            return "videos open in the media tools";
        case "audio":
            return "audio opens in the media tools";
        case "pdf":
            return "PDFs open in the PDF toolkit";
        case "ipynb":
            return "notebooks run their cells in the notebook view";
        default:
            return "this action targets Python files";
    }
}
