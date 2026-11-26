/**
 * context-menu-spec.ts — the canonical right-click menu structure.
 *
 * One ordered spec per surface (explorer / editor edit mode / editor
 * view mode). EVERY language derives its menu from the SAME order:
 * a group renders only when it is allowed for the file's kind
 * (runnable → Run ▸, formattable → Format ▸, …), and the surviving
 * groups keep the canonical relative order — so a Lua file and a
 * Markdown file show the same submenus in the same slots, minus
 * exactly the actions that do not apply.
 *
 * The four menu call sites (FolderTree tree rows, FolderTree flat
 * rows, CodeViewer, FileViewer) render their groups in THIS order —
 * verified by reading each menu's JSX (unit test:
 * __tests__/context-menu-and-format.test.ts) — which is what keeps
 * them from drifting apart again.
 */

import {capabilitiesForKind} from "@/lib/file-capabilities";
import {formattableKindFor} from "@/lib/formattable-kinds";
import {RUN_LANGUAGE_BY_KIND} from "@/lib/run-languages";

export type MenuSurface = "explorer" | "editor-edit" | "editor-view";

export type MenuGroupId =
    | "open" // explorer: Open ▸ (editor / split / terminal)
    | "run" // Run ▸ (whole-file execution)
    | "organize" // explorer: Rename / New file / New subfolder / Duplicate / Favorite
    | "format" // Format ▸ (Auto-Format / Auto-Indent)
    | "workspace" // explorer: pin / AI context / snapshot / lock / SQL workbench
    | "ai" // AI ▸ (explain / improve / tests)
    | "clipboard" // Clipboard ▸ (copy flavors / cut / compare)
    | "appearance" // explorer: icon & color
    | "send" // explorer: download / containing folder
    | "export" // explorer: export flavors
    | "compare" // explorer: history / git HEAD
    | "movecopy" // explorer: move to / copy to
    | "delete" // explorer: delete
    | "properties" // explorer: properties
    | "navigate" // editor: Find / Go to line / symbol / bookmark / split / select all
    | "editfile" // editor (view mode): the "Edit File" mode switch
    | "file" // editor: save / mode switch / download / reveal / history / containing folder
    | "runselection" // editor: folded INTO the Run ▸ submenu (double-Run fix) — kept for order compat, renderers return null
    | "refactor" // editor: rename symbol / definition / usages / extracts
    | "inspect" // editor (python): AST Explorer / Show Bytecode / Generate Property Tests — the inspection trio
    | "edit" // editor: undo / clipboard / lines / case / trim
    | "fold" // editor: fold / unfold blocks
    | "view" // editor (view mode): code theme / collapse
    | "insertblock"; // editor: styled block inserts

/** Where the canonical SEPARATORS sit, per surface — the Python VIEW
 *  mode layout is the master template: a header label + separator on
 *  top, then one divider before the Clipboard group (the break
 *  between code actions and file utilities). The explorer adds the
 *  destructive break before Delete. The shared renderer
 *  (components/context-menu-groups.tsx) consumes this so all four
 *  call sites get IDENTICAL divider placement — a separator renders
 *  only when both of its neighboring groups actually render. */
export const SEPARATOR_BEFORE: Record<MenuSurface, readonly MenuGroupId[]> = {
    explorer: ["clipboard", "delete"],
    "editor-edit": ["clipboard"],
    "editor-view": ["clipboard"],
};

/** The canonical order, per surface. A language's menu is this list
 *  with the not-allowed groups removed — never re-ordered. */
export const CANONICAL_MENU_ORDER: Record<MenuSurface, readonly MenuGroupId[]> = {
    explorer: [
        "open",
        "run",
        "organize",
        "format",
        "workspace",
        "ai",
        "clipboard",
        "appearance",
        "send",
        "export",
        "compare",
        "movecopy",
        "delete",
        "properties",
    ],
    "editor-edit": [
        "navigate",
        "file",
        "format",
        "run",
        "runselection",
        "refactor",
        "inspect",
        "edit",
        "fold",
        "ai",
        "clipboard",
        "insertblock",
    ],
    "editor-view": [
        "run",
        "editfile", // "Edit File" leads the view menu
        "ai", // the master template's "Explain … With AI" top-level item
        "navigate",
        "format",
        "runselection",
        "refactor",
        "inspect",
        "clipboard",
        "file", // the file utilities (download / reveal / history…) close it
        "view",
    ],
};

/** Which groups a given file kind may show, in canonical order. */
export function menuGroupsForKind(
    kind: string | null | undefined,
    surface: MenuSurface
): MenuGroupId[] {
    // Files with no kind are legacy Python entries — treat them as python.
    const k = !kind ? "python" : kind;
    const caps = capabilitiesForKind(k as never);
    const formattable = formattableKindFor(k) !== null;
    const runnable =
        k === "python" || RUN_LANGUAGE_BY_KIND[k as keyof typeof RUN_LANGUAGE_BY_KIND] !== undefined;
    const editable = caps.canEdit;
    const isPython = k === "python";

    const allowed = new Set<MenuGroupId>();
    for (const g of CANONICAL_MENU_ORDER[surface]) {
        switch (g) {
            case "open":
            case "organize":
            case "workspace":
            case "appearance":
            case "send":
            case "export":
            case "compare":
            case "movecopy":
            case "delete":
            case "properties":
                // explorer file-management groups — every file gets them
                allowed.add(g);
                break;
            case "run":
                if (runnable) allowed.add(g);
                break;
            case "format":
                if (formattable || isPython) allowed.add(g);
                break;
            case "ai":
                if (caps.canAiCode) allowed.add(g);
                break;
            case "clipboard":
                allowed.add(g);
                break;
            case "navigate":
                // Find + split view are universal; the line-model items
                // (Go to line / symbol / bookmark) gate individually inside
                // the submenu on canGotoLine / canBookmark.
                allowed.add(g);
                break;
            case "file":
                // View mode needs an editable kind for "Edit File" / "Save";
                // in edit mode the file already IS editable.
                allowed.add(g);
                break;
            case "editfile":
                if (editable) allowed.add(g);
                break;
            case "runselection":
                // Every runnable kind runs its selection (the FileViewer's Run ▸
                // for non-Python mirrors the Python editor's).
                if (runnable) allowed.add(g);
                break;
            case "refactor":
                // Rename Symbol / Find Usages are language-blind project
                // searches — every code language gets them (the Python
                // editor's menu remains the reference shape).
                if (isPython || caps.canAiCode) allowed.add(g);
                break;
            case "inspect":
                // The Python inspection trio — AST Explorer / Show Bytecode /
                // Generate Property Tests — rides the editor menus.
                if (isPython) allowed.add(g);
                break;
            case "edit":
            case "fold":
                if (surface === "editor-edit" && editable) allowed.add(g);
                break;
            case "insertblock":
                if (surface === "editor-edit" && editable) allowed.add(g);
                break;
            case "view":
                allowed.add(g);
                break;
        }
    }
    return CANONICAL_MENU_ORDER[surface].filter((g) => allowed.has(g));
}

/** A very small intro line per language — used as the subtitle under
 *  each language row (settings Languages tab, run picker, etc.). */
export const LANGUAGE_INTROS: Record<string, string> = {
    python:
        "The primary language — the full pipeline: figures, variables, coverage, lint, tests and AI tools.",
    javascript: "The language of the web — runs here through Node.js, formats offline with the JS beautifier.",
    typescript: "Typed JavaScript — runs through tsx / Node ≥ 22.6 / deno with types stripped on the fly.",
    matlab: "Numerical computing — runs through matlab -batch or GNU Octave; formats with the MATLAB-aware pass.",
    r: "Statistics and data — R scripts run through Rscript; the re-indenter respects brace blocks.",
    shell: "The workhorse — bash scripts run in the integrated terminal or through bash; heredoc bodies stay frozen when formatting.",
    java: "Single-file Java programs run directly through the java launcher; brace re-indent + spacing offline.",
    c: "Compiles with gcc then runs; the formatter re-indents braces and keywords without touching preprocessor lines.",
    cpp: "Compiles with g++ then runs; generics and preprocessor lines stay untouched while formatting.",
    ruby: "Elegant scripting — runs through ruby; the re-indenter follows end-blocks and trailing do.",
    php: "Server-side web scripting — runs through php; braces drive the layout.",
    go: "Simple & fast — runs through `go run`; raw strings stay frozen while formatting.",
    lua: "Lightweight embedding language — runs through lua; function / if…then / for…do blocks re-indent cleanly.",
    perl: "Text-processing classic — runs through perl; # comments stay byte-for-byte.",
    rust: "Memory-safe systems language — compiles with rustc then runs; braces drive the re-indent.",
    julia: "Scientific computing — runs through julia; triple-quoted strings stay frozen.",
    kotlin: "Concise JVM language — runs in script mode; backtick identifiers stay identifiers.",
    swift: "Apple's language — runs through swift; brace re-indent with strings and comments frozen.",
    powershell: "Windows-native shell — runs through pwsh / powershell.exe; here-strings stay frozen.",
    batch: "Classic Windows batch — runs through cmd.exe; `( … )` blocks re-indent and :labels pin to column 0.",
    zig: "Modern systems language — compiles and runs through `zig run`; braces drive the layout.",
    dart: "Flutter's language — runs through `dart run`; braces drive the layout.",
    groovy: "Dynamic JVM scripting — runs through groovy; braces drive the layout.",
    scala: "JVM functional favorite — runs through scala (a JDK is needed too).",
    elixir: "Erlang-VM functional language — runs through elixir; do…end blocks re-indent, heredocs stay byte-for-byte.",
    haskell: "Pure functional — runs through runghc (GHC); layout-sensitive, so formatting normalizes the indent grid only.",
    erlang: "Fault-tolerant telecom classic — runs through escript (an Erlang/OTP install); -> clause arrows drive the layout.",
    clojure: "Lisp on the JVM — runs through babashka (bb) or the clojure CLI; every bracket form drives the re-indent.",
    ocaml: "ML-family functional — runs through the ocaml interpreter; layout-sensitive, grid-normalized formatting.",
    fsharp: "Functional-first .NET — runs through dotnet fsi (the .NET SDK); layout-sensitive, grid-normalized formatting.",
    graphql: "A QUERY language for APIs — it highlights, edits and formats offline, but there is no interpreter to run.",
};
