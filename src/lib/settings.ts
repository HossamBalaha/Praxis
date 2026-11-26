/**
 * Runtime settings — user-tunable preferences stored in localStorage.
 *
 * Distinguished from `config.ts` (build-time constants from env vars):
 * settings are runtime, editable from the UI's cog menu, and persist
 * per-browser. Config values are baked in at build time and cannot be
 * changed without editing `.env.local`.
 */
import {STORAGE_PREFIX} from "@/lib/config";
import {DEFAULT_NAMING_STYLES, type NamingStyle, type NamingStyleSettings,} from "@/lib/naming-styles";
import {type IndentStyleName} from "@/lib/indent";

const SETTINGS_KEY = `${STORAGE_PREFIX}.settings`;

/** Spell-check dictionary language. "auto" (default) lets /api/spell
 * detect the file's language from its prose and pick the matching
 * public/dict/<language>.txt; each explicit value pins that
 * dictionary for every check. Mirrors the route's `dict` field. */
export type SpellLanguage =
    | "auto"
    | "english"
    | "spanish"
    | "french"
    | "german"
    | "italian"
    | "portuguese"
    | "russian";

export interface Settings {
    /** Auto-load the last run result when a script is selected. */
    autoLoadCachedOutput: boolean;
    /** Discard cached entries older than this many seconds. 0 = never expire. */
    cacheTtlSeconds: number;
    /** Custom Python interpreter path. If empty, auto-detection is used. */
    pythonInterpreter: string;
    /** Capture DataFrames by default (can be overridden per run). */
    captureDataframes: boolean;
    /** Trace coverage by default. */
    traceCoverage: boolean;
    /** Inspect variables by default. */
    inspectVariables: boolean;
    /** Hard run timeout in seconds. */
    runTimeoutSeconds: number;
    /** start runs with stdin held open so input
     *  prompts can be answered live from the Output panel. When false,
     *  stdin is closed at spawn (the old behavior) and scripts
     *  that call input without pre-supplied stdin fail fast. */
    interactiveStdin: boolean;
    /** Max output bytes per run. */
    maxOutputBytes: number;
    /** Default output theme id. */
    defaultOutputTheme: string;
    /** Show line numbers in the code viewer. */
    showLineNumbers: boolean;
    /** Code font size in pixels. */
    codeFontSize: number;
    /** code line height (unitless multiplier). */
    codeLineHeight: number;
    /** code letter spacing in px (0 = font default). */
    codeLetterSpacing: number;
    /** Include full-text search by default in the search palette. */
    fullTextSearchByDefault: boolean;
    /** Show git status badges in dropdowns (requires git repo). */
    showGitStatus: boolean;
    /** Default file sort mode: alphabetical or by modification time. */
    defaultSortMode: "alpha" | "mtime";
    /** AI endpoints: list of {name, url, enabled}. */
    aiEndpoints: AiEndpoint[];
    /** Default code syntax theme. */
    codeSyntaxTheme: string;
    /** Show the per-run Capture picker (in the run-input strip below the
     * editor tabs —fixed the stale "above Run" wording). */
    showPerRunFlags: boolean;
    /** Which quick-action buttons the menu bar's RIGHT edge
     *  shows. Keys: run / jump / screenshot / toolbox / layout /
     *  terminal / search / ai / history / refresh / settings / theme /
     *  project. Missing key = shown (defaults are all-on); false =
     *  hidden. Configure in Settings → Nav → "Top-right quick
     *  actions". */
    topRightQuickActions?: Record<string, boolean>;
    /** Code font ligatures — JetBrains Mono's contextual programming
     * ligatures render `!=` as `≠`, `<=` as `≤`, `>=` as `≥`, `->` as `→`
     *. The glyphs occupy exactly the component sequence's
     * width, so editor pixel-math is unaffected. Default on; users who
     * prefer plain ASCII operators can turn it off. */
    codeLigatures: boolean;
    /** Code viewer collapsed by default. */
    codeCollapsedByDefault: boolean;
    /** Word wrap in code viewer. */
    codeWordWrap: boolean;
    /** Max history entries (10-100). */
    historyMaxEntries: number;
    /** Confirm before Run All. */
    confirmRunAll: boolean;
    /** Show a "this run may take a while" warning before running if the
     *  estimated duration (from history or static analysis) exceeds this
     *  many seconds. 0 = never warn. */
    runDurationWarningThreshold: number;
    /** Show file size in dropdown. */
    showFileSizeInDropdown: boolean;
    /** Show last-run status dot in dropdown. */
    showLastRunStatusInDropdown: boolean;
    /** Indent width for editor (2/4/8). default 4 → 2 (user
     * request: "make default 2 spaces"). */
    editorIndentWidth: number;
    /** indentation style — literal tabs vs spaces. Drives
     *  the editor's Tab key / auto-indent AND the indentation of every
     *  generated example file and Insert block (Python). */
    indentStyle: IndentStyleName;
    /** Auto-format on save (run black before writing). */
    autoFormatOnSave: boolean;
    /** Organize imports on save — ruff's `--select I --fix` pass runs
     *  on the edited source before the format pass (requires ruff; no
     *  fallback — black cannot organize imports). */
    organizeImportsOnSave?: boolean;
    /** trim trailing whitespace on every save. */
    trimTrailingOnSave: boolean;
    /** ensure the file ends with exactly one newline on
     *  every save (POSIX convention black and linters expect). */
    finalNewlineOnSave: boolean;
    // ─── formatter options (Settings → Editor → Formatting) ──
    /** Indent width for the OFFLINE formatters — Markdown lists /
     *  tables, HTML beautify, TOML, JSON (2/4/8 spaces). Separate from
     *  editorIndentWidth (the editor's Tab width) so a 2-space editor
     *  can still format Markdown with 4-space lists (and vice versa). */
    formatIndentWidth: number;
    /** Align Markdown pipe-tables when Auto-format Markdown runs — pad
     * every cell so all the `|` line up (the example table). */
    formatMarkdownTables: boolean;
    /** Align the TOML key column — pad keys inside a run so every `=`
     *  lines up (the "presented correctly" part for .toml files). */
    formatTomlAlignEquals: boolean;
    /** Ensure exactly one trailing newline when formatting md/toml/json. */
    formatFinalNewline: boolean;
    // ─── PER-LANGUAGE formatter widths (Settings → Editor →
    //     Formatting) — the "add configs for autoformat + autoindent
    //     html/md/others/etc. to set the number of spaces" request.
    //     0 / undefined = fall back to the global formatIndentWidth.
    // ruby / php / go joined the per-language table. */
    formatLangIndent?: Partial<
        Record<
            | "markdown" | "html" | "json" | "toml" | "yaml" | "css" | "sql"
            | "javascript" | "typescript" | "matlab" | "java" | "c" | "cpp"
            | "r" | "shell" | "ruby" | "php" | "go"
            | "lua" | "perl" | "rust" | "julia" | "kotlin" | "swift"
            | "powershell" | "batch"
            | "zig" | "dart" | "groovy" | "scala" | "elixir"
            | "haskell" | "erlang" | "clojure" | "ocaml" | "fsharp" | "graphql",
            number
        >
    >;
    /** AUTO-FORMAT-ON-SAVE for the non-Python formattable
     *  kinds (the Python path keeps its own black `autoFormatOnSave`).
     *  Global switch; per-language overrides below. The save flow
     *  (manual + autosave) runs the offline formatter before writing. */
    formatAutoSaveAll?: boolean;
    /** per-language AUTO-FORMAT-ON-SAVE overrides — true/false
     *  beats the global `formatAutoSaveAll` for that kind. */
    formatLangAutoSave?: Partial<
        Record<
            | "markdown" | "html" | "json" | "toml" | "yaml" | "css" | "sql"
            | "javascript" | "typescript" | "matlab" | "java" | "c" | "cpp"
            | "r" | "shell" | "ruby" | "php" | "go"
            | "lua" | "perl" | "rust" | "julia" | "kotlin" | "swift"
            | "powershell" | "batch"
            | "zig" | "dart" | "groovy" | "scala" | "elixir"
            | "haskell" | "erlang" | "clojure" | "ocaml" | "fsharp" | "graphql",
            boolean
        >
    >;
    /** JSON — sort object keys on Auto-format (default off).
     *  Deterministic diffs for config files that don't care about key
     *  order. */
    formatJsonSortKeys?: boolean;
    /** MATLAB — keep the operator/comma spacing pass ON for
     *  Auto-format (default on; Auto-indent never touches spacing). */
    formatMatlabOperatorSpacing?: boolean;
    /** JS/TS family — the operator/comma spacing pass
     *  (Settings → Formatting; default on). */
    formatJsOperatorSpacing?: boolean;
    /** SQL — up-case the keywords on Auto-format (default
     *  off; the re-indenter alone keeps the author's case). */
    formatSqlUppercaseKeywords?: boolean;
    // ─── the new Formatting-tab controls ──────────────────
    /** JS / TS / JSX / TSX quote style applied by Auto-format — "keep"
     * leaves the author's quotes, "double" converts 'x' → "x" when
     * safe (never template literals, comments, or regex), "single" the
     * reverse. the "auto format should include also converting
     * single quotes to double quotes" request — ON by default. */
    formatJsQuoteStyle?: "keep" | "double" | "single";
    /** trim trailing whitespace on every line during
     *  Auto-format (all offline formatters; default on). */
    formatTrimTrailingWs?: boolean;
    /** collapse runs of 2+ blank lines to one blank line
     *  during Auto-format (all offline formatters; default on). */
    formatCollapseBlankRuns?: boolean;
    /** ("add more control options in Formatting — all
     *  languages"): the MAXIMUM number of consecutive blank lines the
     *  collapse pass keeps — 1 (default) shrinks to a single blank, 2
     *  keeps a double, 3 a triple. Only takes effect while the
     *  collapse-blank-runs switch is on. */
    formatMaxBlankLines?: number;
    // ─── ("auto format should include also converting single
    //     quotes to double quotes … make it as option in the config" +
    //     "add more control options in Formatting — all languages") ───
    /** PYTHON quote style applied by Auto-format — the same contract
     * as formatJsQuoteStyle, for the black path: "keep" leaves the
     * author's quotes, "double" converts 'x' → "x" when safe
     * (string-aware: a '…' containing " stays single; comments never
     * touched), "single" the reverse. Runs as a POST-pass on black's
     * output — black itself never converts quotes. ON by default —
     * print('a') formats to print("a") (the exact example). */
    formatPyQuoteStyle?: "keep" | "double" | "single";
    /** Line-ending normalization during Auto-format — ALL languages:
     *  "keep" (default) preserves each file's existing endings, "lf"
     *  writes \n, "crlf" writes \r\n (the Windows-friendly option).
     *  Applied as the LAST pass so every formatter's output honors it. */
    formatNormalizeLineEndings?: "keep" | "lf" | "crlf";
    /** Python — normalize `True/False/None` capitalization? black
     *  already enforces this; the option exists so the BUILTIN fallback
     *  (black absent) keeps the same guarantee (default on). */
    formatPyNormalizeBooleans?: boolean;
    /** Python — one space after each comma in calls / literals
     *  ("f(a,b)" → "f(a, b)"; default on). black does this too; the
     *  builtin fallback + the post-pass keep it for raw buffers. */
    formatPySpaceAfterComma?: boolean;
    /** HTML / XML family — break long attribute lists? (default off:
     *  one-line tags stay one line; ON wraps tags whose line exceeds
     *  formatHtmlWrapAtCols columns onto indented attribute lines). */
    formatHtmlWrapAttrs?: boolean;
    /** HTML / XML family — the column budget for the wrap-above switch
     *  (default 100). */
    formatHtmlWrapAtCols?: number;
    /** HTML / XML family — normalize attribute quoting on Auto-format:
     *  "keep" leaves the author's quotes, "double" converts
     *  attr='v' → attr="v" when the value contains no double quote
     *  (raw script/pre/style contents are never touched). */
    formatHtmlAttrQuotes?: "keep" | "double";
    /** Markdown — normalize the bullet marker on Auto-format: "-" (the
     *  CommonMark default) rewrites `* item` list markers to `- item`,
     *  "*" the reverse. Emphasis (`*text*`) and horizontal rules are
     *  never touched — only real list-item markers. */
    formatMarkdownBulletChar?: "-" | "*";
    /** Markdown PREVIEW — the reading column width of the rendered
     * document. Now it is:
     * "narrow" ≈ 42rem, "medium" ≈ 48rem (the classic GitHub-ish
     * column, default), "wide" ≈ 56rem, "full" — the whole pane. */
    mdPreviewWidth?: "narrow" | "medium" | "wide" | "full";
    /** CSS / SCSS / LESS — one declaration per line (default on — the
     *  beautifier splits `a{b:c;d:e}` into one-per-line). */
    formatCssOneDeclPerLine?: boolean;
    /** JSON / YAML / TOML — indent the TOP-LEVEL array / object by the
     *  configured width even when the source is a single huge line
     *  (default on — minified JSON expands). */
    formatDataExpandMinified?: boolean;
    /** Indent style every Auto-format EMITS (all languages): "keep"
     *  (default) follows the editor's indentation style, "spaces"
     *  expands leading tabs to the configured width, "tabs" collapses
     *  each full width-run of leading spaces into one tab. YAML keeps
     *  spaces regardless — tab indentation is invalid YAML. */
    formatIndentStyle?: "keep" | "spaces" | "tabs";
    /** Auto-format strips blank lines at the very START of the file —
     *  all languages (default on; Auto-indent never touches them). */
    formatTrimLeadingBlankLines?: boolean;
    /** HARD-WRAP prose lines on Auto-format — the all-language
     *  "wrapping" option (Settings → Formatting): Markdown paragraphs
     *  and plain-text lines longer than formatWrapColumn re-flow at
     *  word boundaries. Fenced code, tables, headings, list markers and
     *  indented blocks are never touched. Default off. */
    formatWrapProse?: boolean;
    /** The wrap column (40–120; default 80 — the classic). */
    formatWrapColumn?: number;
    /** Tab width the indent-STYLE conversion uses — how many spaces one
     *  tab represents when "Tabs" expands or a full space-run collapses
     *  (Settings → Formatting; default 4, choices 2/4/8). */
    formatTabWidth?: number;
    /** Markdown — one blank line before every ATX heading on Auto-format
     *  (default on) so section breaks stay visually consistent. */
    formatMarkdownHeadingSpace?: boolean;
    /** JS / TS family — spaces INSIDE object / array literals
     *  ({ a: 1 } and [1, 2], default on — the tight {a:1} form expands). */
    formatJsBracketSpacing?: boolean;
    /** SQL — keyword casing on Auto-format: "keep" preserves the
     *  author's case, "upper" up-cases the major keywords, "lower"
     *  lower-cases them (the legacy boolean switch maps to "upper"). */
    formatSqlKeywordCase?: "keep" | "upper" | "lower";
    /** HTML / XML family — lowercase tag and attribute names on
     *  Auto-format (DIV CLASS="x" → div class="x"; default on). */
    formatHtmlLowercaseTags?: boolean;
    /** Hygiene passes (trim-trailing-whitespace, blank-run collapse)
     *  SKIP frozen regions — Markdown fenced code blocks and HTML
     *  script/pre/style/textarea bodies keep their authored whitespace
     *  (default on: samples inside fences must not be reformatted). */
    formatHygieneSkipFences?: boolean;
    /** rainbow bracket colorization + pair guides. */
    rainbowBrackets: boolean;
    /** Custom AI question template. */
    aiQuestionTemplate: string;
    /** Per-script notes (stored in localStorage). */
    enableScriptNotes: boolean;
    // ─── New IDE features ───────────────────────────────────────────
    /** Auto-run the current script when it changes on disk . */
    autoRunOnFileChange: boolean;
    /** Show a go-to-symbol / outline dropdown in the code viewer . */
    showSymbolOutline: boolean;
    /** Enable AI code completion (ghost text) in the editor . */
    aiCompletionEnabled: boolean;
    /** Enable inline diagnostics (squiggly underlines from ruff/mypy) . */
    inlineDiagnostics: boolean;
    /** Show git diff gutter markers in the editor . */
    showGitDiffGutter: boolean;
    /** Show the inline git BLAME gutter in the editor (author + age per
     *  line group, hover for the commit) — the editor twin of the Git
     *  Diff panel's blame mode. */
    showBlameGutter: boolean;
    /** Show the built-in PERFORMANCE HUD (FPS, keystroke→paint latency,
     *  queue depths, SSE throughput, render counts) — the numbers-first
     *  way to catch regressions. */
    showPerfHud: boolean;
    /** Auto-save edits after this many ms of inactivity. 0 = disabled . */
    autoSaveDelayMs: number;
    /** When Auto-format / Auto-indent runs from VIEW mode, the viewer
     *  first switches to the editor, waits this many milliseconds (so
     *  the editor visibly mounts — the formatted text lands on a live
     *  surface, not in the same render batch), then applies the
     *  formatting. 0 applies immediately in the same batch. Default 10 . */
    formatSwitchDelayMs: number;
    /** Show per-folder file-size stats in the sidebar . */
    showFolderSize: boolean;
    /** Show the `#tag` chips parsed from `# tags:` comments in the
     * explorer (folder header badges + the per-file tag chip). Hidden
     * when false — the Properties dialogs still list tags (user
     * request: "make it configurable to view or hide them"). */
    explorerShowTags: boolean;
    /** Enable high-contrast accessibility theme . */
    highContrastMode: boolean;
    /** Show a search/filter box at the top of the output panel . */
    outputSearchEnabled: boolean;
    /** Auto-fold runs of identical output lines . */
    collapsibleOutput: boolean;
    /** Enable drag-drop file upload (any file type) anywhere on the page . */
    dragDropUpload: boolean;
    /** Code folding in view mode — click chevrons to collapse def/class blocks. */
    codeFolding: boolean;
    /** Minimap in view mode — scaled-down overview of the entire file. */
    showMinimap: boolean;
    /** Syntax highlighting toggle — off = plain monospace text (faster for large files). */
    webWorkerHighlighting: boolean;
    /** Show toast notifications for actions (refresh, save, import, etc.). */
    actionNotifications: boolean;
    /** Auto-dismiss toast notifications after this many ms (0 = manual). */
    toastDuration: number;
    /** Reduce motion — disable animations and transitions. */
    reduceMotion: boolean;
    /** Screen reader mode — adds extra ARIA labels and keyboard hints. */
    screenReaderMode: boolean;
    /** Large text mode — increases all UI text sizes by 25%. */
    largeTextMode: boolean;
    /** Focus indicators — thicker focus rings for keyboard navigation. */
    enhancedFocusIndicators: boolean;
    // ─── Extended accessibility options ──────────────────────────────
    /** Dyslexia-friendly mode — uses a wider letter-spacing, increased
     *  line-height, and the Atkinson Hyperlegible font stack when
     *  available. Helps readers with dyslexia distinguish similar
     *  glyphs (b/d, p/q, I/l, 0/O). */
    dyslexiaFriendlyMode: boolean;
    /** Color-blind mode — deuteranopia/protanopia-friendly palette
     * swaps red/green status indicators for blue/orange so they're
     * distinguishable by users with red-green color blindness. */
    colorBlindMode: boolean;
    /** Show keyboard shortcut hints next to every menu item / button
     *  that has one (instead of only in tooltips). */
    alwaysShowShortcutHints: boolean;
    /** Sticky cursor — keeps a visible caret indicator in the code
     * viewer even when not focused, useful for users tracking the
     * current line with a screen magnifier. */
    stickyCursorIndicator: boolean;
    /** Tab navigation cycle — when on, Tab wraps from the last
     * focusable element back to the first (instead of escaping to
     * the browser chrome). Useful for keyboard-only users. */
    wrapTabNavigation: boolean;
    // ─── Extended editor / UX options ────────────────────────────────
    /** Default panel tab when a script is selected: output / diag / notes. */
    defaultBottomTab: "output" | "diag" | "notes";
    /** Auto-switch to the Output tab when a run starts. */
    autoSwitchToOutputOnRun: boolean;
    /** Show line/column position in the footer (cursor location). */
    showCursorPositionInFooter: boolean;
    /** Confirm before closing a tab with unsaved changes. */
    confirmCloseUnsavedTab: boolean;
    /** Highlight the current line in the code viewer. */
    highlightCurrentLine: boolean;
    /** Symbol/docstring hover tooltips on Python lines in view mode.
     *  OFF by default — the floating card only appears when explicitly
     *  enabled (some users read the per-line hover as noise). */
    hoverSymbolTooltips: boolean;
    /** Show whitespace characters (trailing spaces, tabs vs spaces). */
    showWhitespace: boolean;
    /** Auto-save the active script when the tab loses focus (in
     *  addition to the existing autoSaveDelayMs debounce). */
    autoSaveOnBlur: boolean;
    /** Maximum line length before a soft warning gutter marker
     *  appears (e.g. PEP 8's 79 / 99). 0 = disabled. */
    maxLineLengthHint: number;
    /** Default run mode for the Run button: normal / coverage.
     *  A legacy "sandbox" value in older persisted settings is tolerated
     *  and treated as "normal" by the run handler. */
    defaultRunMode: "normal" | "sandbox" | "coverage";
    /** Auto-switch to the Diagnostics tab when a lint/typecheck
     *  finishes with errors. */
    autoSwitchToDiagnosticsOnError: boolean;
    // ─── New feature settings ────────────────────────────────────────
    /** Docstring style for the Docstring Studio generators. */
    docstringStyle: "google" | "numpy" | "sphinx";
    /** Vim mode (normal/insert/visual, counts, operators, registers,
     *  marks, macros, relative numbers) in the Python editor. */
    vimMode: boolean;
    /** Profiler flavor for the line/memory profile runs. */
    profilerMode: "line" | "memory" | "both";
    /** Type checking power mode: live mypy layer (hover types, inlay
     *  hints, quick-fixes) beyond the bare pass. */
    typeCheckEnabled: boolean;
    /** mypy strictness profile for the power mode. */
    typeCheckProfile: "loose" | "standard" | "strict";
    /** Use the mypy daemon (dmypy) so re-checks take milliseconds. */
    typeCheckDaemon: boolean;
    /** Branch coverage in "Run with Coverage" (line coverage always on). */
    coverageBranch: boolean;
    /** Fail the coverage dashboard below this threshold (0 = off). */
    coverageFailUnder: number;
    /** Property-based testing workbench (Hypothesis) in the Tests panel. */
    hypothesisEnabled: boolean;
    /** Extensions system enabled (the panel controls per-extension
     *  switches; this is the master toggle). */
    extensionsEnabled: boolean;
    /** Live collaboration defaults (the Collaborate menu overrides at
     *  runtime). Display name / cursor color live in collab-store. */
    collabGuestPermission: "read" | "edit";
    collabAutoFollow: boolean;
    /** Auto-offer the tutor view for files in Getting Started folders. */
    tutorViewSuggestions: boolean;

    // ─── Integrated AI assistant config ──────────────────────────────
    // These control the server-side z-ai SDK calls (chat, completion,
    // test generation). They live in the Settings → AI tab.
    /** System prompt for the AI Chat sidebar. Empty = use the built-in
     *  default (a helpful Python coding assistant). */
    aiChatSystemPrompt: string;
    /** Max chars of the current file sent as context with each chat
     *  message. The server truncates to the tail (most recently edited
     *  region) when this is exceeded. */
    aiChatContextChars: number;
    /** Max messages from the history sent to the model. Older messages
     *  are dropped server-side. */
    aiChatMaxMessages: number;
    /** AI completion debounce in ms (time between the last keystroke and
     *  the fetch). 0 = no debounce (fetch on every change). */
    aiCompletionDebounceMs: number;
    // ─── Chat model providers (dynamic, not z-ai-specific) ────────
    /** LLM providers the integrated AI can talk to. The first entry is
     * the built-in Z.AI SDK; users can add OpenAI-compatible endpoints
     * (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, Z.AI's HTTP API,
     * anything speaking /chat/completions). Sent with each AI request —
     * the server never persists them. */
    aiChatProviders: AiChatProvider[];
    /** id of the provider the chat sidebar / completions route through.
     *  Falls back to the first enabled provider when unset. */
    aiChatProviderId: string;
    /** Verify the active chat model BEFORE chatting: on every sidebar open, the app pings the
     * provider with a trivial message — a failure disables the composer
     * and shows the model-setup helper. Turn OFF to skip the probe and
     * always allow typing (errors then surface on send). */
    aiChatVerifyModel: boolean;
    /** Enter sends the message (Shift+Enter inserts a newline). OFF →
     * Enter inserts a newline and Ctrl/Cmd+Enter sends — for users who
     * paste multi-line prompts often (ease-of-use ask). */
    aiChatEnterToSend: boolean;
    // ─── Naming style (Insert-block templates + Examples) ───────
    /** Identifier style per kind — used by the editor's Insert blocks
     *  and the Examples library (variables, functions, classes, dict
     *  keys, file names). */
    namingStyleVariables: NamingStyle;
    namingStyleFunctions: NamingStyle;
    namingStyleClasses: NamingStyle;
    namingStyleDictKeys: NamingStyle;
    namingStyleFiles: NamingStyle;
    // ─── Explorer / panel layout ──────────────────────────
    /** Show the "Recent" (recently modified) section in the explorer.
     *  When on, it is separated from the folder list by a divider. */
    showRecentFiles: boolean;
    /** How many entries the "Recent" section lists (1–20). */
    recentFilesCount: number;
    /** Where the bottom panel's tab strip (Output / Diagnostics / Notes)
     *  sits: "top" = the classic row above the content; "left" = a
     *  vertical rail on the left edge (saves vertical space). */
    bottomTabsPosition: "top" | "left";
    /** show the bottom panel's tabs (Output / Diagnostics /
     *  Notes / Git Diff) as ICONS ONLY (no text labels) to save
     *  horizontal space. Tooltips/aria-labels keep the names. */
    bottomTabsIconOnly: boolean;
    /** how long (in seconds) a freshly added favorite keeps
     *  its highlight (ring + bold name + pop animation) before reverting
     *  to a plain star like the others. 0 = no highlight at all. */
    favHighlightSeconds: number;
    /** Warn with a toast at startup when no Python interpreter can be
     *  found on this machine (runs / lint / tests need one). */
    warnNoPython: boolean;
    // ─── output panel options (Settings → Editor → Output) ─
    /** Soft-wrap the output body (JetBrains "Use Soft Wraps"). On =
     *  long lines wrap; off = horizontal scrollbar. The output panel's
     *  right-click toggle overrides this locally until reload. */
    outputWordWrap: boolean;
    /** Max LINES of stdout/stderr the output panel RENDERS per run
     *  (older lines beyond the limit are dropped from the display with
     *  a truncation notice; the full output still copies/exports).
     *  0 = no limit. Perf guard for multi-thousand-line runs. */
    outputBufferLimit: number;
    // ─── navigation, editor polish & workspace options ────
    /** Sticky scroll — the innermost def/class header stays pinned at
     *  the top of the code pane while scrolling (VS Code behavior). */
    stickyScroll: boolean;
    /** Symbol-path breadcrumbs — the slim module > class > function bar
     *  above the editor (tracks the caret through the symbol index). */
    showBreadcrumbs: boolean;
    /** Indent guides — thin vertical lines at each indent level. */
    indentGuides: boolean;
    /** Code Lens chips (Run / Usages / Rename / Tests)
     *  at each top-level def/class in edit mode. */
    codeLens: boolean;
    /** interface language for the translated chrome
     *  (menu bar). "en" default; "ar" flips the shell to RTL. Mirrors
     *  localStorage key "praxis.language" (see lib/i18n.ts). */
    language: "en" | "ar";
    /** Ruler column — a faint vertical guide at this column (LaTeX /
     * PEP 8 line-length discipline). 0 = off. */
    rulerColumn: number;
    /** Ruler line WIDTH in px. Clamped to 1–6 so
     * the guide stays a guide, never a curtain. 1 = classic hairline. */
    rulerLineWidth: number;
    /** The last non-zero ruler column — the Ruler on/off switch
     * (Settings → Editor, the row ABOVE Column ruler) restores this
     * value when toggled back on, so flipping the ruler off and on
     * never loses a customized position. */
    rulerLastColumn: number;
    /** Tab expands snippets — pressing Tab after a snippet trigger word
     *  inserts the snippet body instead of an indent. */
    tabSnippetExpansion: boolean;
    /** Spell check — misspelled words in markdown/text buffers are
     *  shown as info diagnostics with an "Add to dictionary" action. */
    spellCheck: boolean;
    /** Spell suggestions — the misspelled-word popover also lists
     *  dictionary near-matches ("coment" → comment…). */
    spellSuggestions: boolean;
    /** How many suggestions the popover lists (clamped 1–8). */
    spellSuggestionCount: number;
    /** Spell dictionary language — "auto" detects per file (stopword
     *  fingerprint of the prose), an explicit value pins one dictionary
     *  (english / spanish / french / german / italian / portuguese /
     *  russian). Sent to /api/spell as `dict`. */
    spellLanguage: SpellLanguage;
    /** Session restore — reload/restart reopens the tabs, active file
     *  and caret lines from the previous session. */
    sessionRestore: boolean;
    /** Word count — the footer shows live words / characters for the
     *  open file (selection counts when text is selected). */
    showWordCountInFooter: boolean;
    // ─── what Format Document does (Settings → Editor →
    //     Formatting). The toggles below are applied to the formatter
    //     output (black, or the built-in fallback when black is missing)
    //     every time Format Document / Format Selection / format-on-save
    //     runs. */
    /** Wrap `if` / `elif` conditions in parentheses automatically
     * (`if x > 3:` → `if (x > 3):`). Default: ON. */
    formatPostIfParentheses: boolean;
    /** Guarantee exactly one trailing newline at end of file. */
    formatPostFinalNewline: boolean;
    // ─── browser notifications when a run finishes.
    //     "hidden" = notify only when the IDE tab is NOT visible;
    //     "always" = notify even when looking at the IDE;
    //     "off" = never. */
    runNotifyMode: "off" | "hidden" | "always";
    /** Include failed/killed runs in the notifications (not just
     *  successful ones). */
    runNotifyOnFailure: boolean;
    /** play a soft chime (in addition to / instead of
     *  the browser notification — audio needs no permission) when a
     *  run finishes under the same notify-mode gating. */
    runNotifySound: boolean;
    /** chime loudness 0–100 (percent). */
    runNotifyVolume: number;
    // ─── pytest watch mode (Tests panel, item G24) ────────
    /** Watch tests on save — when ON, the Tests panel re-runs
     *  the test files affected by each saved Python file (debounced
     *  800 ms) and publishes per-test pass/fail to the watch store
     *  (src/lib/watch-tests.ts) for editor gutter marks + the footer
     *  TestStatusBadge. Default off — a watched pytest run is never
     *  free. */
    testWatchOnSave: boolean;
    // ─── Data file tables (CSV / TSV / Excel / parquet / feather) ────
    /** Zebra-striped rows in the data-file tables (CSV viewer, Excel /
     *  parquet sheet viewer). Makes long rows easier to track. */
    dataTableZebra: boolean;
    /** Colored header row in the data-file tables — an emerald-tinted,
     *  sticky header band matching the app's data-file accents. */
    dataTableColoredHeader: boolean;
    /** Color numeric cells in the data-file tables: negatives red,
     *  positives green, numbers right-aligned, booleans blue, NaN /
     *  None gray-italic. "Good presentation especially if colored". */
    dataTableColoredNumbers: boolean;
    // ─── the 25 approved additions ──────────────────────
    /** Default explorer view mode: tree (classic) / flat (all files in
     *  one list) / kind (grouped by file kind) / details (table with
     *  size · modified · type columns). */
    explorerViewMode: "tree" | "flat" | "kind" | "details";
    /** Show hidden dot-files (.praxis, .venv…) in the explorer. */
    explorerShowHidden: boolean;
    /** Column-stats band above the data tables (min/max/mean/unique/
     *  missing per column; the missing badge filters the table). */
    dataTableStatsBand: boolean;
    /** Log viewer: follow the file (auto-scroll + re-fetch tail) while
     *  a run writes to it. */
    logFollowTail: boolean;
    /** Typewriter scrolling — keep the caret vertically centered while
     *  typing (View menu render toggle). */
    typewriterScroll: boolean;
    /** Markdown studio: split editor + live preview by default (off =
     *  the classic render / raw toggle). */
    markdownStudioDefault: boolean;
    // ─── media gallery / slideshow options (Settings →
    //     View). Consumed by the data-file-browser gallery preview and
    //     the image toolbox slideshow.
    /** Seconds each image stays on screen during a slideshow (1-60). */
    slideshowIntervalSeconds: number;
    /** Transition between slideshow images. */
    slideshowTransition: "none" | "fade" | "slide";
    /** Loop back to the first image after the last one (otherwise the
     *  slideshow stops at the end). */
    slideshowLoop: boolean;
    /** start the slideshow automatically when the media
     *  gallery opens (off = wait for the Play button). */
    slideshowAutoStart: boolean;
    // ─── media PLAYBACK defaults — applied by the media
    //     tools (video + audio) when a file opens. Manual changes made
    //     during playback always win afterwards (the defaults are read
    //     once per file open, not re-applied while playing).
    /** Default playback rate for the media player (0.25–4). */
    mediaDefaultPlaybackRate: number;
    /** Start playing automatically when a media file opens. */
    mediaAutoplay: boolean;
    /** Default volume percent (0–100). */
    mediaDefaultVolume: number;
    /** Loop the current media by default (the Repeat toggle). */
    mediaLoopByDefault: boolean;
    // ─── Screenshot Studio (Settings → Capture). Storage
    //     density + file format for every capture (window / code /
    //     selection). "DPI of storage": the stored raster is resampled
    //     to dpi/96× the on-screen size (300 DPI ≈ 3.1×) so the image
    //     prints at its on-screen physical size with print-quality
    //     density; PNG / JPEG exports also embed the density metadata.
    /** Storage DPI for saved screenshots (72–600, default 300). */
    screenshotDpi: number;
    /** Storage file format / extension for saved screenshots. */
    screenshotFormat: "png" | "jpeg" | "webp";
    /** Palette id of RENDERED code screenshots — any key of
     *  SHOT_PALETTES in lib/screenshot-render.ts ("one-dark",
     *  "one-light", "nord", "dracula", …) or "auto" (follow the app
     *  theme at shot time; resolved by the Studio). Legacy "light" /
     *  "dark" values map to one-light / one-dark. */
    shotTheme: string;
    /** JPEG / WebP encode quality for saved screenshots, 0.5–1
     *  (default 0.92). PNG is lossless and ignores it. */
    shotImageQuality: number;
    /** Which capture KIND the top-right screenshot camera quick-action
     *  uses by default — "window" (the IDE's own workspace region,
     *  rasterized from the live DOM), "code" (render the whole open file
     *  as one image) or "selection" (freeze the IDE, drag a region).
     *  All three capture INTERNALLY — no OS screen picker. Plain
     *  string-shaped setting the per-kind "Make Default"
     *  buttons in Settings → Capture write it; the camera dropdown still
     *  allows one-off picks. */
    defaultCaptureMode: "window" | "code" | "selection";
    /** App-wide INTERFACE theme id (lib/ui-themes.ts): "light" / "dark"
     *  ride next-themes alone; every other id ("nord", "dracula",
     *  "solarized-dark", …) additionally sets data-theme on <html> and
     *  drives the .dark class by the theme's family. Switched from the
     *  menu-bar theme dropdown and Settings → Editor → Interface theme. */
    uiTheme: string;
    /** How resizable dialogs (Chart Preview, Transform Pipeline, …)
     *  resize: "free" — width and height move independently, or
     *  "ratio" — both grow together, keeping the dialog's aspect
     *  ratio (Settings → Editor → Modal resizing). */
    modalResizeMode: "free" | "ratio";
}

export interface AiEndpoint {
    name: string;
    url: string;
    enabled: boolean;
}

/** A chat-completion provider. The `kind: "zai"` built-in SDK
 *  provider was REMOVED — it only worked where Praxis runs inside
 *  Z.AI's infrastructure and failed everywhere else, so every
 *  provider now talks to an OpenAI-compatible /chat/completions
 *  endpoint: local inference servers (Ollama, LM Studio, vLLM,
 *  llama.cpp) or hosted APIs (Z.AI's HTTP API, OpenRouter, OpenAI…).
 *  The `kind` field stays in the type for migration tolerance, but
 *  the only valid value is "openai"; stale "zai" entries are
 *  filtered out at load time (see loadSettings). */
export interface AiChatProvider {
    /** Stable id (used by aiChatProviderId + React keys). */
    id: string;
    /** Display name shown in the chat sidebar + settings. */
    name: string;
    kind: "openai";
    /** Base URL of the OpenAI-compatible server, e.g.
     *  http://localhost:11434/v1. */
    baseUrl: string;
    /** Bearer token for the endpoint. Empty = no Authorization header
     *  (Ollama / LM Studio / vLLM / llama.cpp usually need none). */
    apiKey: string;
    /** Model id sent as `model` in the request body (e.g. "llama3.2",
     *  "glm-4.6"). */
    model: string;
    enabled: boolean;
}

/** The built-in Z.AI SDK provider is GONE (it failed wherever
 *  Praxis runs outside Z.AI's infrastructure). The provider list now
 *  starts EMPTY — add an OpenAI-compatible endpoint in Settings → AI
 *  and every AI feature routes through it immediately. */

export const DEFAULT_SETTINGS: Settings = {
    autoLoadCachedOutput: true,
    cacheTtlSeconds: 7 * 24 * 3600, // 7 days
    pythonInterpreter: "",
    captureDataframes: true,
    traceCoverage: false,
    inspectVariables: true,
    runTimeoutSeconds: 60,
    interactiveStdin: true,
    maxOutputBytes: 2_000_000,
    defaultOutputTheme: "midnight",
    showLineNumbers: true,
    codeFontSize: 13,
    codeLineHeight: 1.6,
    codeLetterSpacing: 0,
    fullTextSearchByDefault: false,
    showGitStatus: true,
    defaultSortMode: "alpha",
    aiEndpoints: [
        {name: "Gemini", url: "https://gemini.google.com/app", enabled: true},
        {name: "Claude", url: "https://claude.ai/new", enabled: true},
        {name: "ChatGPT", url: "https://chat.openai.com/", enabled: true},
    ],
    codeSyntaxTheme: "follow",
    showPerRunFlags: true, // the per-run Capture picker is ON by default — direct, next-run-only
    /** every top-right quick action is on by default; the Nav tab's
     *  switches write false into this map to hide one. */
    topRightQuickActions: {},
    codeLigatures: true,
    codeCollapsedByDefault: true,
    codeWordWrap: false,
    historyMaxEntries: 25,
    confirmRunAll: true,
    runDurationWarningThreshold: 30,
    showFileSizeInDropdown: true,
    showLastRunStatusInDropdown: false,
    editorIndentWidth: 2,
    indentStyle: "spaces",
    autoFormatOnSave: false,
    organizeImportsOnSave: false,
    trimTrailingOnSave: false,
    finalNewlineOnSave: false,
    // ─── formatter defaults ──────────────────────────────
    formatIndentWidth: 2,
    formatMarkdownTables: true,
    formatTomlAlignEquals: true,
    formatFinalNewline: true,
    // per-language overrides start EMPTY (every language uses
    // the global width until the user pins one).
    formatLangIndent: {},
    formatJsOperatorSpacing: true,
    formatSqlUppercaseKeywords: false,
    // ─── formatter defaults ──────────────────────────────
    // Quote normalization defaults: DOUBLE — single quotes convert
    // to double when safe; "keep" / "single" remain available in the
    // Formatting tab.
    formatJsQuoteStyle: "double",
    formatTrimTrailingWs: true,
    formatCollapseBlankRuns: true,
    formatMaxBlankLines: 1,
    // ─── formatter defaults ──────────────────────────────
    // Python quote normalization: DOUBLE by default — print('a')
    // formats to print("a"); the Formatting tab still offers
    // keep / single.
    formatPyQuoteStyle: "double",
    formatNormalizeLineEndings: "keep",
    formatPyNormalizeBooleans: true,
    formatPySpaceAfterComma: true,
    formatHtmlWrapAttrs: false,
    formatHtmlWrapAtCols: 100,
    formatHtmlAttrQuotes: "keep",
    formatMarkdownBulletChar: "-",
    // the md preview reading column — the classic ~48rem prose
    // column (medium) keeps the classic look; narrow / wide /
    // full are the Settings ▸ Formatting ▸ Markdown choices.
    mdPreviewWidth: "medium",
    formatCssOneDeclPerLine: true,
    formatDataExpandMinified: true,
    // the new ALL-LANGUAGE controls: indent style "keep" follows the
    // editor's style (historical behavior); leading blank lines are
    // stripped on Auto-format by default.
    formatIndentStyle: "keep",
    formatTrimLeadingBlankLines: true,
    // the all-language prose-wrap option: OFF by default (hard-wrapping
    // is a preference — the wrapped text must be read as-is on narrow
    // screens too), 80 columns when enabled.
    formatWrapProse: false,
    formatWrapColumn: 80,
    // the added Formatting-tab controls — tab width 4 (the classic
    // tab stop), heading spacing / bracket spacing / lowercase tags /
    // fence-aware hygiene all ON by default; SQL keyword case starts
    // at "keep" (the legacy boolean stays false).
    formatTabWidth: 4,
    formatMarkdownHeadingSpace: true,
    formatJsBracketSpacing: true,
    formatSqlKeywordCase: "keep",
    formatHtmlLowercaseTags: true,
    formatHygieneSkipFences: true,
    // ─── formatter defaults ──────────────────────────────
    // Auto-format-on-save for non-Python kinds: OFF by default (the
    // per-language table starts empty; true/false overrides the global).
    formatAutoSaveAll: false,
    formatLangAutoSave: {},
    formatJsonSortKeys: false,
    formatMatlabOperatorSpacing: true,
    rainbowBrackets: false,
    aiQuestionTemplate: "I'm running a Python script called \"{script_name}\".\n\n{error_or_success}\n\n{output}\n\n{source_code}\n\n{question}",
    enableScriptNotes: true,
    // ─── New IDE features ───────────────────────────────────────────
    autoRunOnFileChange: false,
    showSymbolOutline: true,
    aiCompletionEnabled: false,
    inlineDiagnostics: true,
    showGitDiffGutter: true,
    showBlameGutter: false,
    showPerfHud: false,
    autoSaveDelayMs: 0, // 0 = disabled by default
    formatSwitchDelayMs: 10, // switch-to-editor pause before applying format/indent
    showFolderSize: true,
    explorerShowTags: true,
    highContrastMode: false,
    outputSearchEnabled: true,
    collapsibleOutput: true,
    dragDropUpload: true,
    // ─── View-mode editor enhancements ──────────────────────────────
    // Folding defaults ON (the old default-off shipped a flagship editor
    // feature nobody could see without hunting settings).
    codeFolding: true,
    showMinimap: false,
    webWorkerHighlighting: true,
    actionNotifications: true,
    toastDuration: 4000,
    reduceMotion: false,
    screenReaderMode: false,
    largeTextMode: false,
    enhancedFocusIndicators: false,
    // ─── Extended accessibility defaults ────────────────────────────
    dyslexiaFriendlyMode: false,
    colorBlindMode: false,
    alwaysShowShortcutHints: false,
    stickyCursorIndicator: false,
    wrapTabNavigation: false,
    // ─── Extended editor / UX defaults ──────────────────────────────
    defaultBottomTab: "output",
    autoSwitchToOutputOnRun: true,
    showCursorPositionInFooter: true,
    confirmCloseUnsavedTab: true,
    highlightCurrentLine: true,
    hoverSymbolTooltips: false,
    showWhitespace: false,
    autoSaveOnBlur: false,
    maxLineLengthHint: 99, // PEP 8 default for "modern" code
    defaultRunMode: "normal",
    autoSwitchToDiagnosticsOnError: false,
    // ─── Integrated AI assistant defaults ─────────────────────────────
    docstringStyle: "google",
    vimMode: false,
    profilerMode: "both",
    typeCheckEnabled: true,
    typeCheckProfile: "standard",
    typeCheckDaemon: true,
    coverageBranch: false,
    coverageFailUnder: 0,
    hypothesisEnabled: true,
    extensionsEnabled: true,
    collabGuestPermission: "read",
    collabAutoFollow: false,
    tutorViewSuggestions: true,
    aiChatSystemPrompt: "", // empty = use the built-in default
    aiChatContextChars: 6000,
    aiChatMaxMessages: 50,
    aiCompletionDebounceMs: 1000,
    // ─── Chat model providers defaults ───────────────────────────
    aiChatProviders: [],
    aiChatProviderId: "",
    // verify the active chat model before chatting (see the interface
    // comment); ON by default so a missing model disables the composer
    // with the setup helper instead of failing on send.
    aiChatVerifyModel: true,
    // Enter sends (Shift+Enter newline); Ctrl/Cmd+Enter always sends.
    aiChatEnterToSend: true,
    // ─── Naming style defaults (Python conventions) ──────────
    namingStyleVariables: DEFAULT_NAMING_STYLES.variables,
    namingStyleFunctions: DEFAULT_NAMING_STYLES.functions,
    namingStyleClasses: DEFAULT_NAMING_STYLES.classes,
    namingStyleDictKeys: DEFAULT_NAMING_STYLES.dictKeys,
    namingStyleFiles: DEFAULT_NAMING_STYLES.files,
    // ─── Explorer / panel layout defaults ───────────
    showRecentFiles: true,
    recentFilesCount: 5,
    // "left" is the default — the Output / Diagnostics /
    // Notes tabs stack ONE ABOVE THE OTHER in a vertical rail on the
    // left edge of the bottom panel (the tabs never share a row),
    // saving a row of vertical space.
    bottomTabsPosition: "left",
    bottomTabsIconOnly: false,
    favHighlightSeconds: 10,
    warnNoPython: true,
    // ─── output panel defaults ─────────────────────
    outputWordWrap: true,
    outputBufferLimit: 10_000,
    // ─── navigation, editor polish & workspace defaults ──
    // The OLD toolbar breadcrumb (folder ▸ file above the editor) was
    //  removed as redundant — the NEW showBreadcrumbs key governs the
    //  symbol-path breadcrumbs bar (module > class > function, caret
    //  tracking), a different surface. On by default like VS Code.
    stickyScroll: true,
    showBreadcrumbs: true,
    indentGuides: true,
    codeLens: true,
    language: "en",
    rulerColumn: 80,
    rulerLineWidth: 1, // 1–6 px, classic hairline by default
    rulerLastColumn: 80, // remembered position for the Ruler on/off switch
    tabSnippetExpansion: true,
    spellCheck: true,
    spellSuggestions: true,
    spellSuggestionCount: 3,
    // auto-detect per file — no client wiring needed for the common
    // case; the explicit picks ride along as the POST body's `dict`.
    spellLanguage: "auto",
    sessionRestore: true,
    showWordCountInFooter: true,
    // ─── defaults ─────────────────────────────────────────
    formatPostIfParentheses: true, // ON by default
    formatPostFinalNewline: true,
    runNotifyMode: "hidden", // notify only when the IDE tab is hidden
    runNotifyOnFailure: true,
    runNotifySound: true, // chime on run finish
    runNotifyVolume: 60, // 0–100
    // ─── pytest watch mode default ──────────────
    // OFF by default (watched pytest runs cost real CPU per save).
    testWatchOnSave: false,
    // ─── Data file table defaults ───────────────────────────
    dataTableZebra: true,
    dataTableColoredHeader: true,
    dataTableColoredNumbers: true,
    // ─── defaults ──────────────────────────────────────
    explorerViewMode: "tree",
    explorerShowHidden: false,
    dataTableStatsBand: true,
    logFollowTail: false,
    typewriterScroll: false,
    markdownStudioDefault: true,
    // ─── slideshow defaults ───────────────────────
    slideshowIntervalSeconds: 3,
    slideshowTransition: "fade",
    slideshowLoop: true,
    slideshowAutoStart: false,
    // ─── media playback defaults ────────────────────
    mediaDefaultPlaybackRate: 1,
    mediaAutoplay: false,
    mediaDefaultVolume: 100,
    mediaLoopByDefault: false,
    // ─── Screenshot Studio defaults ──────────────────
    // 300 DPI storage (the print-quality default) and
    // lossless PNG; both switchable in Settings → Capture and in the
    // Screenshot Studio modal itself.
    screenshotDpi: 300,
    screenshotFormat: "png",
    // rendered code-shot palette — "auto" follows the app theme at
    // shot time (the composer remembers its own last pick too).
    shotTheme: "auto",
    // JPEG / WebP encode quality for saved screenshots (0.5–1).
    shotImageQuality: 0.92,
    // the camera quick-action's default capture kind — "window" is the
    // dropdown's first row and the least destructive default.
    defaultCaptureMode: "window",
    // app-wide interface theme — "light" matches the classic first-run
    // look; the menu-bar theme dropdown and Settings → Editor switch it.
    uiTheme: "light",
    // resizable dialogs start FREE (edges independent); switch to
    // "ratio" in Settings → Editor for proportional corner drags.
    modalResizeMode: "free",
};

let cached: Settings | null = null;

/** Load settings from localStorage, merged with defaults. */
export function loadSettings(): Settings {
    if (cached) return cached;
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<Settings>;
        // Content-based cleanup (runs every load, all idempotent):
        // A persisted provider entry of the removed built-in SDK kind is
        // stripped from the provider list and a dangling active-provider
        // id is cleared, so the UI never shows a dead built-in option and
        // AI calls surface the "add an OpenAI-compatible provider"
        // guidance instead of attempting an SDK that cannot work here.
        const hasZai = (parsed.aiChatProviders ?? []).some(
            (p) => (p as { kind?: string } | undefined)?.kind === "zai"
        );
        if (hasZai || parsed.aiChatProviderId === "builtin-zai") {
            parsed.aiChatProviders = (parsed.aiChatProviders ?? []).filter(
                (p) => (p as { kind?: string } | undefined)?.kind !== "zai"
            );
            if (
                !parsed.aiChatProviders.some((p) => p.id === parsed.aiChatProviderId)
            ) {
                parsed.aiChatProviderId = "";
            }
        }
        cached = {...DEFAULT_SETTINGS, ...parsed} as Settings;
        // Persist the cleaned settings so the cleanup settles.
        try {
            window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(cached));
        } catch { /* quota — ignore */
        }
        return cached;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

/** Persist settings to localStorage and refresh the in-memory cache. */
export function saveSettings(next: Settings): void {
    cached = next;
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
        /* quota exceeded — ignore */
    }
}

// ─── Project overrides merge ──────────────────────────────────
// Settings whose values are PER-KEY MAPS. A project file that pins
// one entry must never wipe the browser's other entries — and a
// seeded project file carrying an EMPTY map must never reset the
// user's opt-in choices (a shallow `{...base, ...overrides}`
// replace did exactly that: a shipped `topRightQuickActions: {}`
// pinned every opt-in quick action back to hidden on each reload).
const MAP_SETTINGS_KEYS = [
    "topRightQuickActions",
    "formatLangIndent",
    "formatLangAutoSave",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Merge the project's `.praxis/settings.json` overrides over the
 *  browser-local settings. Plain values and arrays replace
 *  wholesale (the historical behavior); the MAP-shaped settings
 *  above merge PER KEY — project pins win, browser entries fill
 *  the rest, and an empty project map leaves the browser's choices
 *  untouched. */
export function mergeProjectSettings(
    base: Settings,
    overrides: Partial<Settings> | null | undefined
): Settings {
    if (!overrides || !isPlainObject(overrides) || Object.keys(overrides).length === 0) {
        return base;
    }
    const out = {...base, ...overrides} as Settings;
    for (const key of MAP_SETTINGS_KEYS) {
        const o = (overrides as unknown as Record<string, unknown>)[key];
        if (isPlainObject(o)) {
            const b = (base as unknown as Record<string, unknown>)[key];
            (out as unknown as Record<string, unknown>)[key] = {
                ...(isPlainObject(b) ? b : {}),
                ...o,
            };
        }
    }
    return out;
}

/** the settings payload POSTed to /api/format — the whole
 *  object MINUS the secrets (AI provider API keys never belong on a
 *  request wire, even a localhost one) . The route reads only the
 *  Formatting keys; everything else rides along harmlessly. */
export function formatRequestSettings(s: Settings): Record<string, unknown> {
    const {aiChatProviders, aiChatProviderId, ...rest} = s;
    void aiChatProviders;
    void aiChatProviderId;
    return rest as Record<string, unknown>;
}

// ─── Interpreter passthrough ────────────────────────────

// ─── media playback defaults — readers + clamps ──────────
// Pure helpers (no localStorage access in the clampers) so they are
// unit-testable in the node vitest environment. They follow the same
// "?? default + clamp" pattern the slideshow bundle uses in
// data-file-browser.tsx, but live here so both the settings dialog
// and the media tools share one source of truth.

/** The normalized media playback defaults bundle. */
export interface MediaPlaybackDefaults {
    /** Playback rate, clamped to 0.25–4. */
    playbackRate: number;
    /** Autoplay on open. */
    autoplay: boolean;
    /** Volume PERCENT, clamped to 0–100. */
    volume: number;
    /** Loop (Repeat) the current media. */
    loop: boolean;
}

/** Clamp a playback rate into the range the media player accepts
 *  (0.25–4×). Null / undefined / non-finite / non-numeric input falls
 *  back to 1×. */
export function clampMediaPlaybackRate(rate: unknown): number {
    if (rate == null) return 1;
    const n = typeof rate === "number" ? rate : Number(rate);
    if (!Number.isFinite(n)) return 1;
    return Math.min(4, Math.max(0.25, n));
}

/** Clamp a volume PERCENT into 0–100. Null / undefined / non-finite /
 *  non-numeric input falls back to 100 (full volume). */
export function clampMediaVolumePercent(volume: unknown): number {
    if (volume == null) return 100;
    const n = typeof volume === "number" ? volume : Number(volume);
    if (!Number.isFinite(n)) return 100;
    return Math.min(100, Math.max(0, n));
}

/** Read + normalize the four media playback defaults. Tolerates older
 *  stored settings that predate the keys: missing values get the
 *  documented defaults (rate 1× · autoplay off · volume 100 · loop
 *  off) — the same backward-compat pattern the slideshow bundle
 *  uses. Pass an explicit Settings object (tests) or read from
 *  localStorage (the default). */
export function readMediaPlaybackDefaults(settings?: Settings): MediaPlaybackDefaults {
    const s = settings ?? loadSettings();
    return {
        playbackRate: clampMediaPlaybackRate(s.mediaDefaultPlaybackRate ?? 1),
        autoplay: s.mediaAutoplay === true,
        volume: clampMediaVolumePercent(s.mediaDefaultVolume ?? 100),
        loop: s.mediaLoopByDefault === true,
    };
}

/** Query-string fragment carrying the CONFIGURED Python interpreter so
 * server routes that spawn fixed Python helpers (/api/data-sheet,
 * /api/sqlite-query) use the environment the user actually selected
 * in Settings → Python runtime — not the auto-detected one. Returns
 * "" (auto) when no override is set. */
export function interpreterQuery(): string {
    const p = (loadSettings().pythonInterpreter ?? "").trim();
    return p ? `&interpreter=${encodeURIComponent(p)}` : "";
}

/** The configured interpreter path, or undefined for auto-detect. */
export function configuredInterpreter(): string | undefined {
    const p = (loadSettings().pythonInterpreter ?? "").trim();
    return p || undefined;
}

// ─── Chat provider helpers (client side) ───────────────────────────

/** Resolve the provider AI requests should route through: the one named
 *  by `aiChatProviderId` when it exists and is enabled, else the first
 *  enabled provider. Returns NULL when none is configured — the
 *  server then answers with the shared "add an OpenAI-compatible
 *  provider" message; callers show the setup helper. */
export function getActiveChatProvider(settings: Settings): AiChatProvider | null {
    const providers = (settings.aiChatProviders ?? []).filter(
        (p) => p && p.enabled && (p as { kind?: string }).kind !== "zai"
    );
    const byId = providers.find((p) => p.id === settings.aiChatProviderId);
    return byId ?? providers[0] ?? null;
}

/** Generate a provider id that doesn't collide with the existing set. */
export function nextProviderId(existing: AiChatProvider[]): string {
    let n = 1;
    const ids = new Set(existing.map((p) => p.id));
    while (ids.has(`provider-${n}`)) n++;
    return `provider-${n}`;
}

// ─── Naming-style helpers ─────────────────────────────────────────

/** Read the five naming-style keys as one bundle (for the template
 * renderer + example builders). fallbacks follow the new
 *  camelCase/PascalCase defaults. */
export function getNamingStyles(settings: Settings): NamingStyleSettings {
    return {
        variables: settings.namingStyleVariables ?? "camelCase",
        functions: settings.namingStyleFunctions ?? "PascalCase",
        classes: settings.namingStyleClasses ?? "PascalCase",
        dictKeys: settings.namingStyleDictKeys ?? "camelCase",
        files: settings.namingStyleFiles ?? "PascalCase",
    };
}
