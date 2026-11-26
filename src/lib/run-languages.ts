/**
 * which FILE KINDS can RUN, and with which language runtime.
 *
 * Python keeps its full pipeline (prelude, figures, variables,
 * coverage); every other kind below routes through the runtime
 * registry on the server (node / tsx / matlab / octave / Rscript /
 * bash / java / gcc / g++ / ruby / php / go), with a friendly
 * "install X to run this" hint when missing.
 *
 * ruby / php / go are among the RUNNABLE kinds — their runtimes
 * were already defined server-side; the kinds light up end-to-end
 * (Run button, run-all batches, syntax highlighting, formatting).
 *
 * Client- and server-safe (a pure table, no imports).
 */

/** kind → language id for POST /api/run's body.language. */
export const RUN_LANGUAGE_BY_KIND: Partial<
    Record<
        | "python"
        | "javascript"
        | "typescript"
        | "matlab"
        | "r"
        | "shell"
        | "java"
        | "c"
        | "cpp"
        | "ruby"
        | "php"
        | "go"
        | "lua"
        | "perl"
        | "rust"
        | "julia"
        | "kotlin"
        | "swift"
        | "powershell"
        | "batch"
        | "zig"
        | "dart"
        | "groovy"
        | "scala"
        | "elixir"
        | "haskell"
        | "erlang"
        | "clojure"
        | "ocaml"
        | "fsharp",
        string
    >
> = {
    python: "python",
    javascript: "javascript",
    typescript: "typescript",
    matlab: "matlab",
    r: "r",
    shell: "shell",
    java: "java",
    c: "c",
    cpp: "cpp",
    ruby: "ruby",
    php: "php",
    go: "go",
    lua: "lua",
    perl: "perl",
    rust: "rust",
    julia: "julia",
    kotlin: "kotlin",
    swift: "swift",
    powershell: "powershell",
    batch: "batch",
    zig: "zig",
    dart: "dart",
    groovy: "groovy",
    scala: "scala",
    elixir: "elixir",
    haskell: "haskell",
    erlang: "erlang",
    clojure: "clojure",
    ocaml: "ocaml",
    fsharp: "fsharp",
};

/** The runtime LABEL shown next to Run (and in toasts) per language. */
export const RUNTIME_LABEL_BY_LANGUAGE: Record<string, string> = {
    python: "Python",
    javascript: "Node.js",
    typescript: "tsx / Node",
    matlab: "MATLAB / Octave",
    r: "Rscript",
    shell: "bash",
    java: "java",
    c: "gcc",
    cpp: "g++",
    ruby: "Ruby",
    php: "PHP",
    go: "Go",
    lua: "Lua",
    perl: "Perl",
    rust: "rustc",
    julia: "Julia",
    kotlin: "Kotlin",
    swift: "Swift",
    powershell: "PowerShell",
    batch: "cmd.exe",
    zig: "zig run",
    dart: "dart run",
    groovy: "Groovy",
    scala: "scala",
    elixir: "Elixir",
    haskell: "runghc",
    erlang: "escript",
    clojure: "bb / clojure",
    ocaml: "ocaml",
    fsharp: "dotnet fsi",
};

/** True when the file kind is directly runnable in the IDE. */
export function isRunnableKind(kind: string | null | undefined): boolean {
    return !!kind && kind in RUN_LANGUAGE_BY_KIND;
}

/** The language id to run this kind with (undefined = not runnable). */
export function runLanguageForKind(kind: string | null | undefined): string | undefined {
    return kind ? RUN_LANGUAGE_BY_KIND[kind as keyof typeof RUN_LANGUAGE_BY_KIND] : undefined;
}

/**
 * the language id a FILE LIST ENTRY runs with.
 *
 * Explorer entries carry a `kind` when the extension was recognized,
 * but folders can also hold legacy entries whose kind is unknown
 * (a bare name). Python keeps its historical `.py`/`.pyw` name-based
 * fallback; every other language relies on the recognized kind.
 *
 * Shared by "Run all in folder" (server + client) so the batch, the
 * confirm dialog and the tree badges count the SAME set of files.
 */
export function runLanguageForFile(
    kind: string | null | undefined,
    name: string
): string | undefined {
    if (kind) return runLanguageForKind(kind);
    if (/\.pyw?$/i.test(name)) return "python";
    return undefined;
}

/**
 * the shell command that runs a file of this language in the
 * integrated terminal ("Run In Terminal").
 *
 * the tree's Run In Terminal used to hard-code
 * `python3 <file>` for EVERY runnable kind — a .js / .R / .sh / .c
 * file dispatched a python3 command. It now derives the interpreter
 * from the file's language (extension-aware), matching how
 * POST /api/run's runtime registry executes each kind.
 *
 * Client-safe (a pure table, no imports).
 */
export function terminalRunCommandFor(
    language: string | null | undefined,
    fileName: string
): string | undefined {
    switch (language) {
        case "python":
            return `python3 "${fileName}"`;
        case "javascript":
            return `node "${fileName}"`;
        case "typescript":
            return `npx tsx "${fileName}"`;
        case "matlab":
            return `octave "${fileName}"`;
        case "r":
            return `Rscript "${fileName}"`;
        case "shell":
            return `bash "${fileName}"`;
        case "java":
            return `java "${fileName}"`;
        case "c":
            return `gcc "${fileName}" -o /tmp/praxis-run-c && /tmp/praxis-run-c`;
        case "cpp":
            return `g++ "${fileName}" -o /tmp/praxis-run-cpp && /tmp/praxis-run-cpp`;
        case "ruby":
            return `ruby "${fileName}"`;
        case "php":
            return `php "${fileName}"`;
        case "go":
            return `go run "${fileName}"`;
        case "lua":
            return `lua "${fileName}"`;
        case "perl":
            return `perl "${fileName}"`;
        case "rust":
            return `rustc "${fileName}" -o /tmp/praxis-run-rs && /tmp/praxis-run-rs`;
        case "julia":
            return `julia "${fileName}"`;
        case "kotlin":
            return `kotlin "${fileName}"`;
        case "swift":
            return `swift "${fileName}"`;
        case "powershell":
            return `pwsh -File "${fileName}"`;
        case "batch":
            // cmd.exe batches need a shell wrapper for quoting to work.
            return `cmd /c "${fileName}"`;
        case "zig":
            return `zig run "${fileName}"`;
        case "dart":
            return `dart run "${fileName}"`;
        case "groovy":
            return `groovy "${fileName}"`;
        case "scala":
            return `scala "${fileName}"`;
        case "elixir":
            return `elixir "${fileName}"`;
        case "haskell":
            return `runghc "${fileName}"`;
        case "erlang":
            return `escript "${fileName}"`;
        case "clojure":
            return `bb "${fileName}"`;
        case "ocaml":
            return `ocaml "${fileName}"`;
        case "fsharp":
            return `dotnet fsi "${fileName}"`;
        default:
            return undefined;
    }
}
