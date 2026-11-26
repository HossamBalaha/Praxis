"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Accessibility,
    Activity,
    AlignLeft,
    ArrowUpDown,
    ArrowUpFromLine,
    Bell,
    Blocks,
    BookOpen,
    Braces,
    Camera,
    CircleCheck,
    CircleX,
    Clock,
    Cloud,
    Code2,
    Columns2,
    Command,
    Contrast,
    CornerDownLeft,
    Crop,
    Crosshair,
    Database,
    Download,
    Equal,
    Eraser,
    ExternalLink,
    Eye,
    FileCode2,
    FileImage,
    FlaskConical,
    FolderClosed,
    FolderCog,
    Gauge,
    GitBranch,
    GitCommitHorizontal,
    GraduationCap,
    Hash,
    Highlighter,
    Images,
    IndentIncrease,
    Keyboard,
    Languages,
    ListOrdered,
    ListTree,
    Loader2,
    MessageSquareText,
    Moon,
    MoveHorizontal,
    Package,
    Palette,
    Palette as PaletteIcon,
    PanelBottom,
    Percent,
    Play,
    Rainbow,
    RefreshCw,
    Repeat,
    RotateCcw,
    Ruler,
    Save,
    Search,
    Settings as SettingsIcon,
    ShieldCheck,
    ShieldQuestion,
    Sigma,
    Sparkles,
    Star,
    StickyNote,
    Table as TableIcon,
    Table,
    Tags,
    Terminal,
    Timer as TimerIcon,
    Trash2,
    TriangleAlert,
    Type,
    Upload,
    UserCircle,
    Users,
    Volume2,
    Wand2,
    WrapText,
    Wrench,
    Zap,
} from "lucide-react";
import {playRunChime, requestRunNotifyPermission} from "@/lib/run-notify";
import {applyUiTheme, UI_THEMES} from "@/lib/ui-themes";
import {useTheme} from "next-themes";
import {SHOT_PALETTES} from "@/lib/screenshot-render";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils";
import {
    type AiChatProvider,
    DEFAULT_SETTINGS,
    loadSettings,
    mergeProjectSettings,
    nextProviderId,
    saveSettings,
    type Settings,
} from "@/lib/settings";
// per-language one-line intros — shared with the run picker + context menus.
import {LANGUAGE_INTROS} from "@/lib/context-menu-spec";
import {loadCollabIdentity, loadCollabSettings, saveCollabSettings} from "@/lib/collab-store";
import {NAMING_STYLES, type NamingStyle} from "@/lib/naming-styles";
import {
    keyEventToCombo,
    loadCustomShortcuts,
    saveCustomShortcuts,
    SHORTCUT_GROUPS,
    type ShortcutItem,
} from "@/lib/shortcuts";
import {useToast} from "@/hooks/use-toast";
import {setChromeLanguage} from "@/lib/i18n-react";
import {useMiddleMousePan} from "@/lib/middle-pan";
import {FocusTabSection} from "@/components/settings/focus-tab";
import {
    DEFAULT_FOCUS_SETTINGS,
    FOCUS_PRESETS,
    type FocusSettings,
    loadFocusSettings,
    type PresetId,
    saveFocusSettings,
} from "@/lib/focus-settings";
import {ambientTracksByCategory, setAmbientMaster, toggleAmbient, useAmbientState,} from "@/lib/ambient";

/** Quick-add presets for the AI tab's provider manager. Each appends a
 * provider pre-filled with the runtime's default OpenAI-compatible
 * endpoint; the user only fills in the model (and a key, for hosted
 * APIs). Local servers (Ollama, LM Studio, vLLM, llama.cpp) need no
 * key. */
const PROVIDER_PRESETS: {
    label: string;
    hint: string;
    make: () => Omit<AiChatProvider, "id">;
}[] = [
    {
        label: "Ollama",
        hint: "Ollama's OpenAI-compatible endpoint — http://localhost:11434/v1. Set the model to one pulled locally (e.g. llama3.2, qwen2.5-coder). No API key needed.",
        make: () => ({
            name: "Ollama (local)",
            kind: "openai",
            baseUrl: "http://localhost:11434/v1",
            apiKey: "",
            model: "llama3.2",
            enabled: true,
        }),
    },
    {
        label: "LM Studio",
        hint: "LM Studio's local server — http://localhost:1234/v1. Start it from LM Studio's Developer tab; the model id is the loaded model's id. No API key needed.",
        make: () => ({
            name: "LM Studio (local)",
            kind: "openai",
            baseUrl: "http://localhost:1234/v1",
            apiKey: "",
            model: "",
            enabled: true,
        }),
    },
    {
        label: "vLLM",
        hint: "vLLM's OpenAI-compatible server — http://localhost:8000/v1 (adjust if you passed --port). The model id is the served model name. No API key needed.",
        make: () => ({
            name: "vLLM (local)",
            kind: "openai",
            baseUrl: "http://localhost:8000/v1",
            apiKey: "",
            model: "",
            enabled: true,
        }),
    },
    {
        label: "llama.cpp",
        hint: "llama-server's OpenAI-compatible endpoint — http://localhost:8080/v1 (adjust for your --port). The model id is the loaded gguf's name. No API key needed.",
        make: () => ({
            name: "llama.cpp (local)",
            kind: "openai",
            baseUrl: "http://localhost:8080/v1",
            apiKey: "",
            model: "",
            enabled: true,
        }),
    },
    {
        label: "Z.AI API",
        hint: "Z.AI's hosted OpenAI-compatible API — https://api.z.ai/api/paas/v4 with your Z.AI API key. Model e.g. glm-4.6. Useful where the bundled SDK isn't configured.",
        make: () => ({
            name: "Z.AI (GLM)",
            kind: "openai",
            baseUrl: "https://api.z.ai/api/paas/v4",
            apiKey: "",
            model: "glm-4.6",
            enabled: true,
        }),
    },
    {
        label: "OpenRouter",
        hint: "OpenRouter aggregates many hosted models — https://openrouter.ai/api/v1 with your OpenRouter API key. Model e.g. openai/gpt-4o-mini or anthropic/claude-3.5-sonnet.",
        make: () => ({
            name: "OpenRouter",
            kind: "openai",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "",
            model: "",
            enabled: true,
        }),
    },
    {
        label: "Custom",
        hint: "Any other OpenAI-compatible /chat/completions endpoint (OpenAI, Groq, Together, Mistral, a remote vLLM box…).",
        make: () => ({
            name: "Custom endpoint",
            kind: "openai",
            baseUrl: "http://",
            apiKey: "",
            model: "",
            enabled: true,
        }),
    },
];

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Which tab to select when the dialog opens (e.g. "ai" — used by
     *  the AI menu's "AI settings…" item so it opens directly on the AI
     *  tab instead of the last-visited one). Undefined = keep the last
     *  tab, which is the behavior of every other entry point (⌘,, the
     *  command palette, Tools → Open full settings…). */
    initialTab?: string;
    /** Slug of the currently-selected folder. Used to enable
     *  the "Create venv for this folder" button (disabled when no
     *  folder is selected) and to scope the POST /api/create-venv call. */
    currentFolderSlug?: string;
    /** Per-project overrides currently active (loaded from
     *  `<project-root>/.praxis/settings.json`). Keys present in this
     *  object are shown with a "project" badge in the relevant tab, and
     *  the draft is initialized as `{ ...globalSettings, ...projectOverrides }`. */
    projectOverrides?: Partial<Settings>;
    /** Persist the given settings object as the active project's
     *  `.praxis/settings.json`. The page owns the fetch so it can update
     *  its own `projectOverrides` state on success. */
    onSaveProjectSettings?: (settings: Partial<Settings>) => void | Promise<void>;
    /** Remove a single key from the project overrides file. */
    onResetProjectKey?: (key: keyof Settings) => void | Promise<void>;
    /** Delete the project settings file entirely. */
    onClearProjectSettings?: () => void | Promise<void>;
    /** the LIVE settings source for the active project —
     *  drives the persistent badge in the dialog header (answers "where
     *  are the current project settings stored?" every time it opens):
     *  "project" = .praxis/settings.json is live, "seeded" = it was just
     *  created from the browser settings, "local" = browser-local only. */
    settingsSource?: "project" | "seeded" | "local";
    /** Absolute path of the active project's `.praxis` folder — shown
     * under the source badge so "the project folder" is a concrete,
     * findable location. */
    settingsSourceDir?: string | null;
    /** the detected language runtimes (node / tsx / MATLAB /
     *  Octave / Rscript / bash / java / gcc / g++ / ruby / php / go /
     *  lua / perl / rustc / julia / kotlin / swift / zig / dart / groovy /
     *  scala / elixir) — shown in the Python tab's "Other language
     *  runtimes" panel with install hints for the missing ones. */
    runtimeStatuses?: Array<{
        id: string;
        label: string;
        languages: string[];
        ok: boolean;
        version: string;
        command: string;
        installHint: string;
    }>;
    /** Re-run the runtime detection (/api/runtime-check).
     * a FRESH re-detection (drops the server-side cache). */
    onRefreshRuntimes?: () => void;
    /** true while the fresh re-detection is in flight — the
     *  "Check again" button shows a spinner and disables. */
    runtimeRefreshBusy?: boolean;
    /** mirror the saved draft into the project's
     *  `.praxis/settings.json` — the "a copy of the settings should be
     *  stored in it" ask. The page owns the fetch (secrets stripped,
     *  projectOverrides state updated). Resolves true on success. */
    mirrorProjectSettings?: (settings: Partial<Settings>) => Promise<boolean>;
}

const OUTPUT_THEMES = [
    {id: "midnight", label: "Midnight"},
    {id: "daylight", label: "Daylight"},
    {id: "dracula", label: "Dracula"},
    {id: "solarized-dark", label: "Solarized Dark"},
    {id: "solarized-light", label: "Solarized Light"},
    {id: "monokai", label: "Monokai"},
    {id: "matrix", label: "Matrix"},
    {id: "github-dark", label: "GitHub Dark"},
];

/* ------------------------------------------------------------------ */
/*  Settings search index                                              */

/* ------------------------------------------------------------------ */
/**
 * A flat index of every searchable setting, used by the search box at
 * the top of the dialog. Each entry maps a Settings key to its
 * display label + optional hint + the tab slug it lives in.
 *
 * The label MUST exactly match the `label` prop passed to the
 * corresponding <SettingRow> — that's how search-result clicks
 * highlight the right row after jumping to the tab (see
 * SettingsHighlightContext below).
 */
interface SettingIndexEntry {
    key: keyof Settings;
    label: string;
    hint?: string;
    tab: string;
    /** Unique DOM-row id suffix. Needed only when several entries
     * share one key (the three defaultCaptureMode rows) — without it
     * every row gets the same `setting-row-<key>` id (invalid HTML:
     * duplicate ids, search-jump always lands on the first). */
    rowId?: string;
}

const SETTINGS_INDEX: SettingIndexEntry[] = [
    // ─── Cache tab ───────────────────────────────────────────────────
    {key: "autoLoadCachedOutput", label: "Auto-load cached output on script selection", tab: "cache"},
    {
        key: "cacheTtlSeconds",
        label: "Cache TTL (seconds)",
        hint: "0 = never expire. 604800 = 7 days (default).",
        tab: "cache"
    },
    {key: "historyMaxEntries", label: "History max entries", tab: "cache"},
    {
        key: "actionNotifications",
        label: "Show action notifications",
        hint: "Toast notifications for refresh, save, import, export, etc.",
        tab: "cache"
    },
    {
        key: "toastDuration",
        label: "Toast duration (ms)",
        hint: "0 = manual dismiss. Default 4000 (4 seconds).",
        tab: "cache"
    },
    // ─── Python tab ──────────────────────────────────────────────────
    {
        key: "pythonInterpreter",
        label: "Python interpreter",
        hint: "Select a discovered environment, browse for a custom one, or leave on auto-detect.",
        tab: "python"
    },
    {
        key: "vimMode",
        label: "Vim mode",
        hint: "Modal editing in the Python editor — normal/insert/visual, counts, operators, registers, marks, macros. The mode shows in the status bar.",
        tab: "editor"
    },
    {
        key: "typeCheckEnabled",
        label: "Type checking power mode",
        hint: "Live mypy layer: type inlay hints in the editor, strictness profiles, quick-fixes, optional dmypy daemon.",
        tab: "python"
    },
    {
        key: "typeCheckProfile",
        label: "Type checking profile",
        hint: "loose / standard / strict — the mypy flag set used by the power mode.",
        tab: "python"
    },
    {
        key: "typeCheckDaemon",
        label: "Type checking daemon (dmypy)",
        hint: "Re-checks take milliseconds instead of a cold run.",
        tab: "python"
    },
    {
        key: "profilerMode",
        label: "Profiler mode",
        hint: "What Run ▸ Line & Memory Profile records: line timing, tracemalloc memory, or both.",
        tab: "python"
    },
    {
        key: "docstringStyle",
        label: "Docstring style",
        hint: "Google / NumPy / Sphinx — the style the Docstring Studio generates.",
        tab: "python"
    },
    {
        key: "coverageBranch",
        label: "Branch coverage",
        hint: "Attempt branch-level coverage in Run with Coverage runs.",
        tab: "python"
    },
    {
        key: "coverageFailUnder",
        label: "Coverage fail-under threshold",
        hint: "Mark the coverage dashboard red below this percent (0 = off).",
        tab: "python"
    },
    {
        key: "hypothesisEnabled",
        label: "Property-based tests",
        hint: "The Hypothesis workbench in the Tests panel (scaffold, shrink sequences, promote regression tests).",
        tab: "python"
    },
    {
        key: "extensionsEnabled",
        label: "Extensions system",
        hint: "Master toggle for the sandboxed mini-plugin runtime (commands, status-bar items, snippets).",
        tab: "advanced"
    },
    {
        key: "tutorViewSuggestions",
        label: "Tutor view suggestions",
        hint: "Auto-suggest Run with Tutor View for files in Getting Started folders.",
        tab: "python"
    },
    {key: "runTimeoutSeconds", label: "Run timeout (seconds)", tab: "python"},
    {key: "maxOutputBytes", label: "Max output bytes per run", tab: "python"},
    {key: "confirmRunAll", label: "Confirm before Run All", tab: "python"},
    {
        key: "runDurationWarningThreshold",
        label: "Run-duration warning threshold (seconds)",
        hint: "Before each run, Praxis estimates how long the script will take (from history + static analysis). If the estimate exceeds this many seconds, a confirmation dialog is shown. 0 = never warn.",
        tab: "python"
    },
    {
        key: "autoRunOnFileChange",
        label: "Auto-run on file change",
        hint: "When enabled, the current script re-runs automatically when it changes on disk (requires a watcher connection).",
        tab: "python"
    },
    // ─── Capture tab ─────────────────────────────────────────────────
    {key: "captureDataframes", label: "Capture DataFrames (pandas HTML repr)", tab: "capture"},
    {key: "inspectVariables", label: "Inspect variables at exit", tab: "capture"},
    {key: "traceCoverage", label: "Trace code coverage (slower)", tab: "capture"},
    // ─── Nav tab ─────────────────────────────────────────────
    {
        key: "topRightQuickActions",
        label: "Top-right quick actions (the menu bar's right edge)",
        hint: "Choose which quick-action buttons the top-right cluster shows: Run, Jump, Screenshots, Developer Toolbox, Layout presets, Terminal, Search, AI chat, Run history, Refresh, Settings, Theme, active-project chip — plus eleven opt-in extras (project symbols, snippets, snippet manager, local history, commit history, git diff, chart preview, SQLite workbench, fullscreen, shortcut trainer, shortcuts reference) that stay hidden until switched on. When everything is on, the cluster scrolls horizontally inside its width-capped strip (half the bar) and pans with the wheel / middle-click drag / Shift+wheel.",
        tab: "nav"
    },
    {key: "fullTextSearchByDefault", label: "Full-text search by default in palette", tab: "nav"},
    {key: "showGitStatus", label: "Show git status badges (requires git repo)", tab: "nav"},
    {key: "showFileSizeInDropdown", label: "Show file size in dropdown", tab: "nav"},
    {key: "showLastRunStatusInDropdown", label: "Show last-run status dot in dropdown", tab: "nav"},
    // ─── AI tab ──────────────────────────────────────────────────────
    {
        key: "aiCompletionEnabled",
        label: "AI code completion (suggestion popup)",
        hint: "Shows a debounced AI suggestion popup at the bottom of the editor as you type. Press Tab to accept, Escape to dismiss, Alt+\\ to force a fetch.",
        tab: "ai"
    },
    {
        key: "aiChatSystemPrompt",
        label: "AI Chat system prompt",
        hint: "Empty = use the built-in default. Customize to bias the assistant toward your coding style.",
        tab: "ai"
    },
    {
        key: "aiChatContextChars",
        label: "AI Chat context chars",
        hint: "Max chars of the current file sent as context with each chat message.",
        tab: "ai"
    },
    {
        key: "aiChatMaxMessages",
        label: "AI Chat max messages",
        hint: "Max messages from the history sent to the model — only the newest N are kept.",
        tab: "ai"
    },
    {
        key: "aiCompletionDebounceMs",
        label: "AI completion debounce (ms)",
        hint: "Time between the last keystroke and the completion fetch. 0 = no debounce.",
        tab: "ai"
    },
    {
        key: "aiChatProviders",
        label: "Chat model providers (Ollama, LM Studio, vLLM, llama.cpp, Z.AI API, custom)",
        hint: "Add any OpenAI-compatible endpoint — local inference servers or hosted APIs — and pick which one the chat, completion and test generation route through.",
        tab: "ai"
    },
    {
        key: "aiChatProviderId",
        label: "Active chat model provider",
        hint: "The provider used by the AI chat sidebar, code completion and test generation.",
        tab: "ai"
    },
    {
        key: "aiEndpoints",
        label: "AI endpoints",
        hint: "External AI endpoints (Gemini, Claude, ChatGPT, custom) — opens the AI's website in a new tab.",
        tab: "ai"
    },
    {
        key: "aiQuestionTemplate",
        label: "AI question template",
        hint: "Template used when sending a question to an external AI endpoint.",
        tab: "ai"
    },
    // ─── Editor tab ──────────────────────────────────────────────────
    {
        key: "showPerRunFlags",
        label: "Show the per-run Capture picker",
        hint: "The per-run Capture picker (Capture: Vars · Frames · Coverage) in the run-input strip below the editor tabs, with Stdin / Args / Env — direct switches and presets for what the NEXT run captures, next-run-only.",
        tab: "editor"
    },
    {key: "defaultSortMode", label: "Default sort mode", tab: "editor"},
    {key: "codeSyntaxTheme", label: "Code syntax theme", tab: "editor"},
    {key: "showLineNumbers", label: "Show line numbers", tab: "editor"},
    {key: "codeFontSize", label: "Code font size (px)", tab: "editor"},
    {key: "defaultOutputTheme", label: "Default output theme", tab: "editor"},
    {key: "codeCollapsedByDefault", label: "Collapsed by default", tab: "editor"},
    {key: "codeWordWrap", label: "Word wrap", tab: "editor"},
    {key: "formatPostIfParentheses", label: "Formatting: parenthesize if/elif conditions", tab: "editor"},
    {key: "formatPostFinalNewline", label: "Formatting: final newline", tab: "editor"},
    // the formatter family moved to its own Formatting tab.
    {
        key: "formatIndentWidth",
        label: "Formatter indent width",
        hint: "Spaces per indent level for every offline formatter (the per-language overrides below can pin their own).",
        tab: "formatting"
    },
    {
        key: "formatMarkdownTables",
        label: "Align Markdown tables",
        hint: "Pipe-table cells padded so all the | line up.",
        tab: "formatting"
    },
    {
        key: "formatTomlAlignEquals",
        label: "Align TOML key column",
        hint: "Every = in a run of key = value lines lines up.",
        tab: "formatting"
    },
    {
        key: "formatFinalNewline",
        label: "Final newline when formatting",
        hint: "Formatted files end with exactly one trailing newline.",
        tab: "formatting"
    },
    {
        key: "formatWrapProse",
        label: "Wrap prose lines on format",
        hint: "Hard-wrap Markdown / plain-text paragraphs at the configured column on Auto-format — code fences, tables, headings and indented blocks untouched. Config keys: formatWrapProse + formatWrapColumn.",
        tab: "formatting"
    },
    {
        key: "formatLangIndent",
        label: "Indent width (a language's block, Formatting tab)",
        hint: "Pin the formatter indent width per language — each language's own section in the Formatting tab has an Indent width select (Default follows the global).",
        tab: "formatting"
    },
    {
        key: "formatJsOperatorSpacing",
        label: "JS / TS operator spacing",
        hint: "The beautify pass spaces operators, commas and object colons.",
        tab: "formatting"
    },
    {
        key: "formatSqlUppercaseKeywords",
        label: "SQL keywords UPPERCASE on format",
        hint: "SELECT / FROM / WHERE … up-cased by Auto-format.",
        tab: "formatting"
    },
    // ─── the formatter tab gains save-time + per-language
    //     switches + the JSON / MATLAB options.
    {
        key: "formatAutoSaveAll",
        label: "Auto-format on save (all languages)",
        hint: "The offline formatter runs on every non-Python file save — python keeps its own black switch.",
        tab: "formatting"
    },
    {
        key: "formatLangAutoSave",
        label: "Auto-format on save (a language's block, Formatting tab)",
        hint: "Force save-time formatting ON or OFF for one language — each language's own section in the Formatting tab has a Format on save select (Default follows the global switch).",
        tab: "formatting"
    },
    {
        key: "formatJsonSortKeys",
        label: "Sort JSON object keys on format",
        hint: "Auto-format JSON re-stringifies with sorted keys — deterministic diffs.",
        tab: "formatting"
    },
    {
        key: "formatMatlabOperatorSpacing",
        label: "MATLAB operator spacing",
        hint: "The MATLAB Auto-format spacing pass (commas, keywords). Auto-indent never touches spacing.",
        tab: "formatting"
    },
    {key: "runNotifyMode", label: "Browser notification when a run finishes", tab: "python"},
    {key: "runNotifyOnFailure", label: "Notify on failed / stopped runs too", tab: "python"},
    {
        key: "codeLigatures",
        label: "Font ligatures (≠ ≤ ≥ →)",
        hint: "Render comparison operators as single glyphs in the code font",
        tab: "editor"
    },
    {
        key: "editorIndentWidth",
        label: "Indentation",
        hint: "Style and width used by the editor's Tab key and every generated example / Insert block (Python).",
        tab: "editor"
    },
    {
        key: "showRecentFiles",
        label: "Show the Recent files section",
        hint: "Recently modified files at the top of the explorer, separated from the folders by a divider.",
        tab: "editor"
    },
    {
        key: "recentFilesCount",
        label: "Recent files count",
        hint: "How many entries the Recent section lists (1–20).",
        tab: "editor"
    },
    {
        key: "explorerShowTags",
        label: "Show #tags in the explorer",
        hint: "The #tag chips parsed from `# tags:` comments — folder badges + per-file chip.",
        tab: "editor"
    },
    {
        key: "bottomTabsPosition",
        label: "Bottom panel tabs position",
        hint: "Left (default) = the Output / Diagnostics / Notes tabs stack one above the other in a vertical rail; Top = the classic side-by-side row.",
        tab: "editor"
    },
    {
        key: "bottomTabsIconOnly",
        label: "Bottom panel tab labels",
        hint: "Icon + name (classic) or icons only — saves horizontal space in the Output / Diagnostics / Notes strip.",
        tab: "editor"
    },
    {
        key: "favHighlightSeconds",
        label: "New-favorite highlight (seconds)",
        hint: "How long a freshly added favorite keeps its ring + bold name before reverting to a plain star. 0 = no highlight.",
        tab: "editor"
    },
    {
        key: "warnNoPython",
        label: "Warn when Python is missing",
        hint: "Toast a warning at startup when no working Python interpreter is found.",
        tab: "editor"
    },
    {key: "autoFormatOnSave", label: "Auto-format on save (black)", tab: "editor"},
    {
        key: "organizeImportsOnSave",
        label: "Organize imports on save (ruff)",
        hint: "Runs ruff's import-block pass (sort, merge, dedupe, drop unused) on the edited source before the format pass — requires ruff; there is no fallback.",
        tab: "editor"
    },
    {
        key: "namingStyleVariables",
        label: "Naming style — variables",
        hint: "How the Insert-block templates and Examples name variables.",
        tab: "editor"
    },
    {
        key: "namingStyleFunctions",
        label: "Naming style — functions",
        hint: "How generated function/method names are written.",
        tab: "editor"
    },
    {
        key: "namingStyleClasses",
        label: "Naming style — classes",
        hint: "How generated class names are written.",
        tab: "editor"
    },
    {
        key: "namingStyleDictKeys",
        label: "Naming style — dict keys / JSON fields",
        hint: "How generated dictionary keys and JSON field names are written.",
        tab: "editor"
    },
    {
        key: "namingStyleFiles",
        label: "Naming style — file names",
        hint: "How files created by the Examples menu are named.",
        tab: "editor"
    },
    {key: "enableScriptNotes", label: "Enable per-script notes", tab: "editor"},
    // pytest watch mode (Tests panel, item G24) — the
    //     panel header's eye toggle writes the same setting.
    {
        key: "testWatchOnSave",
        label: "Watch tests on save",
        hint: "The Tests panel re-runs the test files affected by every saved Python file (debounced 800 ms) — the eye toggle in the Tests panel header writes the same setting. Per-test pass/fail feeds the editor gutter marks and the footer test badge.",
        tab: "editor"
    },
    {key: "showSymbolOutline", label: "Show symbol outline (functions/classes)", tab: "editor"},
    {key: "inlineDiagnostics", label: "Inline diagnostics (squiggly underlines from ruff/mypy)", tab: "editor"},
    {key: "showGitDiffGutter", label: "Show git diff gutter markers", tab: "editor"},
    {key: "showBlameGutter", label: "Show the git blame gutter", tab: "editor"},
    {key: "showPerfHud", label: "Show the performance HUD", tab: "advanced"},
    {
        key: "autoSaveDelayMs",
        label: "Auto-save delay (ms)",
        hint: "0 = disabled. When >0, edits are auto-saved after this many ms of inactivity.",
        tab: "editor"
    },
    {
        key: "formatSwitchDelayMs",
        label: "Switch-to-editor delay before applying format (ms)",
        hint: "View-mode Auto-format / Auto-indent switches to the editor, waits this long, then applies the formatted text. 0 = same frame.",
        tab: "formatting"
    },
    {key: "outputSearchEnabled", label: "Show search/filter in output panel", tab: "editor"},
    {key: "collapsibleOutput", label: "Auto-fold runs of identical output lines", tab: "editor"},
    // ─── Editor/Python/Nav rows that were MISSING from the index (user
    // report: "i am trying to find ruler in configs but could not").
    //     Searchability rule: every rendered SettingRow needs an entry
    //     here, or the search box can never find it — the ruler was the
    //     reported case; typography, sticky scroll, guides, spell check,
    //     snippet expansion, save hygiene, run-chime and the session
    //     rows were equally invisible. ────────────────────────────
    {
        key: "rulerColumn",
        label: "Column ruler",
        hint: "Vertical guide line at this column — 0 = off, 80 = the classic line. Config keys rulerColumn + rulerLineWidth live ONLY here (Settings → Editor).",
        tab: "editor"
    },
    {
        key: "rulerLastColumn",
        label: "Ruler",
        hint: "Master switch for the column ruler — Off parks the column in rulerLastColumn, On restores it. Renders for every code file in view AND edit mode.",
        tab: "editor"
    },
    {
        key: "rulerLineWidth",
        label: "Ruler line width",
        hint: "Thickness of the column-ruler guide in pixels (1 = hairline … 6 = bold). Only visible when the ruler column is not 0.",
        tab: "editor"
    },
    {
        key: "codeLineHeight",
        label: "Line height",
        hint: "Vertical spacing between code lines (1.2 compact → 2.0 airy).",
        tab: "editor"
    },
    {key: "codeLetterSpacing", label: "Letter spacing (px)", tab: "editor"},
    {key: "indentGuides", label: "Indent guides", tab: "editor"},
    {key: "codeLens", label: "Code Lens (Run/Usages/Rename chips at each def)", tab: "editor"},
    {key: "stickyScroll", label: "Sticky scroll (headers pin while scrolling)", tab: "editor"},
    {key: "rainbowBrackets", label: "Rainbow brackets + pair guides", tab: "editor"},
    {key: "spellCheck", label: "Spell check markdown & text files", tab: "editor"},
    {
        key: "spellLanguage",
        label: "Spell check dictionary",
        hint: "The dictionary /api/spell checks against: Auto-detect picks the file's language from its prose (English · Español · Français · Deutsch · Italiano · Português · Русский); an explicit pick pins one dictionary for every file.",
        tab: "editor"
    },
    {key: "tabSnippetExpansion", label: "Tab expands snippets", tab: "editor"},
    {key: "trimTrailingOnSave", label: "Trim trailing whitespace on save", tab: "editor"},
    {key: "finalNewlineOnSave", label: "Final newline on save", tab: "editor"},
    {key: "runNotifySound", label: "Play a chime when a run finishes", tab: "python"},
    {key: "runNotifyVolume", label: "Chime volume", tab: "python"},
    {key: "sessionRestore", label: "Restore the session on reload", tab: "nav"},
    {key: "showWordCountInFooter", label: "Word count in the footer", tab: "nav"},
    // ─── Accessibility tab (see the new tab below) ─────────────────
    {
        key: "highContrastMode",
        label: "High contrast mode",
        hint: "Stronger borders and text contrast across the whole UI.",
        tab: "a11y"
    },
    {
        key: "largeTextMode",
        label: "Large text mode",
        hint: "Bumps base UI font size for comfortable reading.",
        tab: "a11y"
    },
    {
        key: "dyslexiaFriendlyMode",
        label: "Dyslexia-friendly mode",
        hint: "Relaxed letter/word spacing tuned for dyslexic readers.",
        tab: "a11y"
    },
    {
        key: "colorBlindMode",
        label: "Color-blind friendly palette",
        hint: "Swaps red/green status colors for a color-blind-safe set.",
        tab: "a11y"
    },
    {key: "reduceMotion", label: "Reduce motion", hint: "Disables animations and transitions.", tab: "a11y"},
    {
        key: "screenReaderMode",
        label: "Screen reader mode",
        hint: "Extra ARIA labeling and simplified landmarks for assistive tech.",
        tab: "a11y"
    },
    {
        key: "enhancedFocusIndicators",
        label: "Enhanced focus indicators",
        hint: "Thicker, high-visibility focus rings on every control.",
        tab: "a11y"
    },
    {
        key: "stickyCursorIndicator",
        label: "Sticky cursor indicator",
        hint: "Keeps a subtle marker on the last caret line while scrolling.",
        tab: "a11y"
    },
    {
        key: "alwaysShowShortcutHints",
        label: "Always show shortcut hints",
        hint: "Displays keyboard hints on buttons/tooltips permanently.",
        tab: "a11y"
    },
    {
        key: "wrapTabNavigation",
        label: "Wrap Tab navigation",
        hint: "Tab / Shift+Tab move focus cyclically instead of getting stuck at the edges.",
        tab: "a11y"
    },
    // ─── output panel options ───────────────────────
    {
        key: "outputWordWrap",
        label: "Output word wrap",
        hint: "Soft-wrap long output lines (JetBrains \"Use Soft Wraps\"). Off = horizontal scrollbar. Also toggleable from the output panel's right-click menu.",
        tab: "editor"
    },
    {
        key: "outputBufferLimit",
        label: "Output render limit (lines)",
        hint: "Max lines of stdout/stderr the output panel renders per run (older lines drop from the DISPLAY with a notice; copy/export still use the full output). 0 = no limit.",
        tab: "editor"
    },
    {key: "dragDropUpload", label: "Enable drag-drop file upload (.py / .ipynb)", tab: "editor"},
    // ─── Data file table presentation (CSV / Excel / parquet viewers) ──
    {
        key: "dataTableZebra",
        label: "Data tables — zebra rows",
        hint: "Alternating row shading in the CSV / Excel / parquet table viewers so long rows are easier to track across columns.",
        tab: "editor"
    },
    // the new settings' search-index entries.
    {
        key: "dataTableStatsBand",
        label: "Data tables — column statistics band",
        hint: "Per-column type / min / max / mean / unique / missing badges above the data tables; the missing badge filters rows.",
        tab: "editor"
    },
    {
        key: "typewriterScroll",
        label: "Editor — typewriter scrolling",
        hint: "Keep the caret vertically centered in the code viewer while typing.",
        tab: "editor"
    },
    {
        key: "markdownStudioDefault",
        label: "Markdown — studio mode by default",
        hint: "Open .md files in the split editor + live-preview studio.",
        tab: "editor"
    },
    // ─── Media tab  ───────────────────────────────────────
    {
        key: "slideshowIntervalSeconds",
        label: "Slideshow — seconds per image",
        hint: "How long each image stays on screen during a media-gallery slideshow (1–60 s).",
        tab: "media"
    },
    {
        key: "slideshowTransition",
        label: "Slideshow — transition",
        hint: "none / fade / slide — the animation between two slideshow images (respects Reduce motion).",
        tab: "media"
    },
    {
        key: "slideshowLoop",
        label: "Slideshow — loop",
        hint: "Restart from the first image after the last one; off = the slideshow stops at the end.",
        tab: "media"
    },
    {
        key: "slideshowAutoStart",
        label: "Slideshow — auto-start",
        hint: "Begin playing automatically when the media gallery opens.",
        tab: "media"
    },
    // ─── Media tab (— playback defaults) ──────────────────
    {
        key: "mediaDefaultPlaybackRate",
        label: "Media — default playback rate",
        hint: "Playback speed applied when a video / audio file opens (0.25–4×).",
        tab: "media"
    },
    {
        key: "mediaAutoplay",
        label: "Media — autoplay",
        hint: "Start playing automatically when a video / audio file opens (browsers may still block unmuted autoplay).",
        tab: "media"
    },
    {
        key: "mediaDefaultVolume",
        label: "Media — default volume",
        hint: "Initial volume for the media player (0–100%).",
        tab: "media"
    },
    {
        key: "mediaLoopByDefault",
        label: "Media — loop by default",
        hint: "Turn on Repeat (loop the current media) when a video / audio file opens.",
        tab: "media"
    },
    // ─── Screenshot Studio (Capture tab) ─────────────────
    // — the screenshot entries renamed to the word "Screenshot"
    // and now MATCH the rendered SettingRow labels exactly, so search jumps
    // highlight the right rows.)
    // search-dedupe: the THREE defaultCaptureMode rows used to
    // each appear in the index — searching "screenshot" then listed the
    // SAME setting three times (plus DPI + format = five near-identical
    // rows — the same config listed multiple times). One entry now
    // covers the whole capture-kind group; its label still matches the
    // first SettingRow ("Screenshot of the IDE window") so the search
    // jump highlights the right block, and the hint names all three
    // kinds so the row is still discoverable by any of their words.
    {
        key: "defaultCaptureMode",
        rowId: "defaultCaptureMode-window",
        label: "Screenshot of the IDE window",
        hint: "The camera quick-action's DEFAULT capture kind — IDE window / the whole file / a dragged region (pick per kind in Capture → Screenshot Capture).",
        tab: "capture"
    },
    {
        key: "screenshotDpi",
        label: "Screenshot storage DPI",
        hint: "Pixel density of SAVED screenshots (72–600, default 300): the stored image is resampled to dpi/96× the on-screen size (300 DPI ≈ 3.1× pixels) and PNG / JPEG exports embed the density metadata.",
        tab: "capture"
    },
    {
        key: "screenshotFormat",
        label: "Screenshot file extension",
        hint: "Storage format for saved / downloaded screenshots: .png (lossless), .jpg (smaller, lossy) or .webp (smallest). The clipboard always pastes PNG.",
        tab: "capture"
    },
    {
        key: "explorerShowHidden",
        label: "Explorer — show hidden files",
        hint: "Surface dot-directories like .praxis and dot-files in the file tree (also the eye toggle in the explorer header).",
        tab: "editor"
    },
    {
        key: "dataTableColoredHeader",
        label: "Data tables — colored header",
        hint: "Emerald-tinted sticky header band in the CSV / Excel / parquet viewers, matching the app's data-file accents.",
        tab: "editor"
    },
    {
        key: "dataTableColoredNumbers",
        label: "Data tables — colored numbers",
        hint: "Numeric cells colored (negatives red, positives green) and right-aligned; booleans blue; NaN / None gray italics.",
        tab: "editor"
    },
    // ─── Advanced tab ────────────────────────────────────────────────
    {
        key: "codeFolding",
        label: "Code folding (view mode)",
        hint: "Click the chevron next to a def/class/for/if/while/try/with line in view mode to collapse just that block.",
        tab: "advanced"
    },
    {
        key: "showMinimap",
        label: "Minimap (view mode)",
        hint: "Shows a scaled-down overview of the entire file on the right edge of the code viewer.",
        tab: "advanced"
    },
    {
        key: "webWorkerHighlighting",
        label: "Syntax highlighting",
        hint: "When on, the code viewer uses Prism syntax highlighting. When off, shows plain monospace text (faster for very large files).",
        tab: "advanced"
    },
    {
        key: "highlightCurrentLine",
        label: "Highlight current line",
        hint: "Draws a subtle background on the line under the mouse / caret so you can track your place.",
        tab: "advanced"
    },
    {
        key: "hoverSymbolTooltips",
        label: "Symbol hover tooltips",
        hint: "Show the floating diagnostic / docstring card when hovering Python lines in view mode. Off by default.",
        tab: "editor"
    },
    {
        key: "showWhitespace",
        label: "Show whitespace",
        hint: "Surface trailing whitespace and tab/space differences in the code viewer.",
        tab: "advanced"
    },
    {
        key: "maxLineLengthHint",
        label: "Max line length hint",
        hint: "Shows a soft warning gutter marker on lines longer than this many characters. 0 = disabled.",
        tab: "advanced"
    },
    {
        key: "defaultBottomTab",
        label: "Default bottom panel tab",
        hint: "Which tab is active when a script is selected: Output, Diagnostics, or Notes.",
        tab: "advanced"
    },
    {
        key: "autoSwitchToOutputOnRun",
        label: "Auto-switch to Output on run",
        hint: "When a run starts, switch the bottom panel to the Output tab automatically.",
        tab: "advanced"
    },
    {
        key: "autoSwitchToDiagnosticsOnError",
        label: "Auto-switch to Diagnostics on error",
        hint: "When a lint/typecheck finishes with errors, switch the bottom panel to the Diagnostics tab.",
        tab: "advanced"
    },
    {
        key: "defaultRunMode",
        label: "Default run mode",
        hint: "Which mode the Run button uses by default: normal or coverage.",
        tab: "advanced"
    },
    {
        key: "confirmCloseUnsavedTab",
        label: "Confirm before closing unsaved tab",
        hint: "When you close an editor tab with unsaved changes, ask first.",
        tab: "advanced"
    },
    {
        key: "autoSaveOnBlur",
        label: "Auto-save on tab blur",
        hint: "Save the active script when its tab loses focus.",
        tab: "advanced"
    },
    {
        key: "showCursorPositionInFooter",
        label: "Show cursor position in footer",
        hint: "Display the current line:column in the footer.",
        tab: "advanced"
    },
    // Note: aiCompletionEnabled lives in the AI tab (see above), not here.
    {key: "showFolderSize", label: "Show per-folder file-size stats in sidebar", tab: "advanced"},
    // ─── Discoverability entries
    // or "theme" found nothing — the rows EXIST in the Editor tab but
    // were never indexed, so the search box could not surface them).
    {
        key: "modalResizeMode",
        label: "Modal resizing",
        hint: "How resizable dialogs (Chart Preview, Transform Pipeline, the workbenches…) resize: Free moves width and height independently; Ratio grows both together, keeping the dialog's aspect ratio. Also toggleable live from each resizable dialog's corner.",
        tab: "editor"
    },
    {
        key: "uiTheme",
        label: "Interface theme",
        hint: "The app-wide look (menus, panels, dialogs) — a registry of light and dark themes (Praxis, One, GitHub, Solarized, Gruvbox, Nord, Catppuccin, Tokyo Night, Rosé Pine, Ayu, Everforest, Kanagawa, Material, Quiet Light, Espresso, Moonlight, VS Dark+, Shades of Purple…). Also on the menu bar's right edge.",
        tab: "editor"
    },
    {
        key: "shotTheme",
        label: "Screenshot theme",
        hint: "Palette of rendered code screenshots — Auto follows the app theme at shot time; every named palette is also selectable live in the Screenshot Composer.",
        tab: "capture"
    },
    {
        key: "shotImageQuality",
        label: "Screenshot image quality",
        hint: "JPEG / WebP encode quality for saved screenshots (PNG is lossless and ignores this).",
        tab: "capture"
    },
];

/** Reverse lookup: label → Settings key, used by SettingRow to check
 *  whether its setting is project-overridden / highlighted. */
const LABEL_TO_KEY = new Map(
    SETTINGS_INDEX.map((e) => [e.label, e.key] as const)
);

/** Reverse lookup: label → UNIQUE row id (rowId when the entry
 *  declares one — shared-key rows — else the key). SettingRow uses it
 *  for its DOM id so duplicate-key entries never collide. */
const LABEL_TO_ROW_ID = new Map(
    SETTINGS_INDEX.map((e) => [e.label, e.rowId ?? (e.key as string)] as const)
);

/** Human-readable rendering of a setting's current value for the
 *  search-results list. Booleans → On/Off, arrays → count, strings
 *  truncated to 40 chars. */
function formatSettingValue(v: unknown): string {
    if (typeof v === "boolean") return v ? "On" : "Off";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") {
        if (v.length === 0) return "(empty)";
        return v.length > 40 ? v.slice(0, 40) + "…" : v;
    }
    if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
    if (v === null || v === undefined) return "—";
    try {
        return JSON.stringify(v).slice(0, 40);
    } catch {
        return "—";
    }
}

/** Display name for a tab slug, used in search-result badges. */
const TAB_LABELS: Record<string, string> = {
    cache: "Cache",
    python: "Python",
    formatting: "Formatting",
    capture: "Capture",
    ai: "AI",
    editor: "Editor",
    focus: "Focus",
    nav: "Nav",
    backup: "Backup",
    advanced: "Advanced",
    project: "Project",
    shortcuts: "Shortcuts",
};

/* ------------------------------------------------------------------ */
/*  Context: highlight ring + project-override badge                  */

/* ------------------------------------------------------------------ */
/**
 * SettingRow reads this context to decide whether to (a) paint a
 * temporary highlight ring (after a search-result click jumps to it)
 * and (b) show a "project" badge (when the setting's key is in the
 * active project overrides). Using context avoids threading two new
 * props through every SettingRow call site.
 */
interface SettingsRowContextValue {
    highlightedLabel: string | null;
    overriddenKeys: Set<string>;
}

const SettingsRowContext = React.createContext<SettingsRowContextValue>({
    highlightedLabel: null,
    overriddenKeys: new Set(),
});

/**
 * Modal dialog with all user-tunable settings, persisted to localStorage.
 * Opened from the menu bar's File → Settings, the right-edge settings
 * button, or ⌘,.
 *
 * PERF: this component is ~5,900 lines with 17 useState / 6 useEffect /
 * 7 useCallback hooks. It used to stay MOUNTED (open=false) forever —
 * every parent re-render re-ran its ENTIRE hook body in the background
 * while invisible (the page re-renders on every run-stream tick). The
 * exported wrapper below now mounts this inner body ONLY while the
 * dialog is open (+220 ms after close for the exit animation).
 */
function SettingsDialogInner({
                                 open,
                                 onOpenChange,
                                 initialTab,
                                 currentFolderSlug,
                                 projectOverrides,
                                 onSaveProjectSettings,
                                 onResetProjectKey,
                                 onClearProjectSettings,
                                 settingsSource,
                                 settingsSourceDir,
                                 runtimeStatuses,
                                 onRefreshRuntimes,
                                 runtimeRefreshBusy,
                                 mirrorProjectSettings,
                             }: SettingsDialogProps) {
    const {toast} = useToast();
    const {setTheme} = useTheme();
    const [draft, setDraft] = React.useState<Settings>(loadSettings);

    /* The Focus tab edits the FocusSessions widget's own persisted
settings (lib/focus-settings — same storage the Focus menu and the
floating widget write to) and drives the SHARED ambient engine
(lib/ambient), so ambient is configurable in the right place at
last. */
    const [focusDraft, setFocusDraft] = React.useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);
    const ambient = useAmbientState();
    const ambientGroups = React.useMemo(() => ambientTracksByCategory(), []);
    const updateFocus = React.useCallback(
        <K extends keyof FocusSettings>(key: K, value: FocusSettings[K]) => {
            setFocusDraft((prev) => {
                const next = {...prev, [key]: value};
                saveFocusSettings(next); // broadcasts → the live widget re-hydrates
                return next;
            });
        },
        []
    );
    const applyFocusPreset = React.useCallback((preset: PresetId) => {
        setFocusDraft((prev) => {
            const next: FocusSettings =
                preset === "custom"
                    ? {...prev, preset}
                    : {...prev, preset, ...FOCUS_PRESETS[preset]};
            saveFocusSettings(next);
            return next;
        });
    }, []);
    // live Notification.permission readout next to the
    // run-notification controls ("granted" / "denied" / "not asked").
    const [notifyPerm, setNotifyPerm] = React.useState<string>(() =>
        typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
    );
    const [discoveredEnvs, setDiscoveredEnvs] = React.useState<
        Array<{
            path: string;
            label: string;
            source: string;
            version?: string;
            hasScientificStack: boolean;
        }>
    >([]);
    // Confirmation dialog state for destructive actions (clear cache /
    // clear history). null = dialog closed; string = which action is
    // pending confirmation.
    const [confirmClear, setConfirmClear] = React.useState<null | "cache" | "history">(null);

    // ── Collaboration settings live in their OWN store (lib/collab-store)
    //    so the Collaborate menu/session reads them without a settings
    //    round-trip. This dialog edits a draft + persists immediately.
    const COLLAB_COLORS = ["#059669", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#65a30d"];
    const [collabDraft, setCollabDraft] = React.useState(() => {
        const base = loadCollabSettings();
        const identity = loadCollabIdentity();
        return {
            displayName: base.displayName || identity.name,
            cursorColor: base.cursorColor || identity.color,
            guestPermission: base.guestPermission,
            autoFollow: base.autoFollow,
        };
    });
    const persistCollab = React.useCallback(() => {
        setCollabDraft((prev) => {
            try {
                saveCollabSettings({
                    displayName: prev.displayName.trim(),
                    cursorColor: prev.cursorColor,
                    guestPermission: prev.guestPermission,
                    autoFollow: prev.autoFollow,
                });
            } catch { /* storage — non-fatal */
            }
            return prev;
        });
    }, []);

    // Controlled tab state so search-result clicks can jump to a tab.
    const [tab, setTab] = React.useState("cache");
    // Search query — when non-empty, the dialog shows a flat list of
    // matching settings instead of the tabbed view.
    const [search, setSearch] = React.useState("");
    // Label of the setting to briefly highlight (after a search jump).
    // Cleared after 2s by a setTimeout.
    const [highlightedLabel, setHighlightedLabel] = React.useState<string | null>(null);

    /* ─── SECTION JUMP BAR ───────────────────────────────────────────
* A jump strip ATTACHED TO THE TAB BAR (rendered directly under the
* TabsList inside the pinned header) with one chip per section
* header of the ACTIVE tab. It replaces the Formatting-only A–Z
* letter strip. The list is DOM-DRIVEN — after every tab switch it reads
* the active TabsContent's direct <section> children and their
* first <h3> — so it automatically covers all 14 tabs with zero
* per-tab hand-written lists. A scroll-spy highlights the section
* currently in view. */
    const settingsScrollRef = React.useRef<HTMLDivElement | null>(null);
    /* Middle-mouse panning on the two horizontal strips — the tab
   * strip and the section jump bar (press the wheel button and drag
   * left/right; the classic pan gesture). */
    const tabsStripPanRef = useMiddleMousePan<HTMLDivElement>();
    const jumpStripPanRef = useMiddleMousePan<HTMLDivElement>();
    const [jumpSections, setJumpSections] = React.useState<
        Array<{ id: string; label: string; el: HTMLElement }>
    >([]);
    const [activeJumpId, setActiveJumpId] = React.useState<string | null>(null);

    const rebuildJumpSections = React.useCallback(() => {
        const host = settingsScrollRef.current;
        if (!host) {
            setJumpSections([]);
            return;
        }
        // The ACTIVE TabsContent (Radix keeps inactive ones hidden in the
        // DOM — data-state distinguishes them).
        const activePane = host.querySelector('[role="tabpanel"][data-state="active"]');
        if (!activePane) {
            setJumpSections([]);
            return;
        }
        const secs = Array.from(activePane.querySelectorAll<HTMLElement>(":scope > section"));
        const next: Array<{ id: string; label: string; el: HTMLElement }> = [];
        secs.forEach((sec) => {
            const heading = sec.querySelector("h3");
            const label = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();
            if (!label) return;
            next.push({id: `jump-sec-${label}`, label, el: sec});
        });
        setJumpSections(next);
        setActiveJumpId(next.length > 0 ? next[0].id : null);
    }, []);

    // Rebuild on tab switch / dialog open / leaving search. Two RAFs
    // wait for React to commit the new active TabsContent before the
    // DOM is scanned (Radix flips data-state during the commit).
    React.useEffect(() => {
        if (!open) return;
        const raf = requestAnimationFrame(() =>
            requestAnimationFrame(() => rebuildJumpSections())
        );
        return () => cancelAnimationFrame(raf);
    }, [open, tab, search, rebuildJumpSections]);

    // Scroll-spy — while the tabbed view scrolls, highlight the chip of
    // the last section whose heading passed above the fold.
    React.useEffect(() => {
        const host = settingsScrollRef.current;
        if (!open || !host) return;
        let raf = 0;
        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const top = host.getBoundingClientRect().top;
                let current: string | null = null;
                for (const s of jumpSections) {
                    if (s.el.getBoundingClientRect().top - top <= 8) current = s.id;
                }
                setActiveJumpId((prev) => (prev === current ? prev : current));
            });
        };
        host.addEventListener("scroll", onScroll, {passive: true});
        onScroll();
        return () => {
            host.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(raf);
        };
    }, [open, jumpSections]);

    const jumpToSection = React.useCallback((el: HTMLElement) => {
        el.scrollIntoView({behavior: "smooth", block: "start"});
    }, []);

    // Custom shortcut bindings (id → display combo) + the id currently
    // being recorded. Null = not recording.
    const [customShortcuts, setCustomShortcuts] = React.useState<Record<string, string>>({});
    const [recordingId, setRecordingId] = React.useState<string | null>(null);

    // Set of project-overridden keys, derived from the projectOverrides
    // prop. Recomputed when the prop changes.
    const overriddenKeys = React.useMemo(
        () => new Set(Object.keys(projectOverrides ?? {})),
        [projectOverrides]
    );

    // Refresh the draft + discover envs + load custom shortcuts when the
    // dialog opens. The draft is the global settings merged with the
    // active project overrides so the UI reflects the effective values.
    React.useEffect(() => {
        if (open) {
            setDraft(mergeProjectSettings(loadSettings(), projectOverrides));
            setCustomShortcuts(loadCustomShortcuts());
            // The Focus tab reads the live focus/ambient state on every open.
            setFocusDraft(loadFocusSettings());
            // AI menu → "AI settings…" opens the dialog directly on the AI
            // tab; without an explicit tab the last-visited one is kept.
            // A stale search from the previous visit would otherwise hide
            // the tabbed view entirely, so it is cleared on every open.
            if (initialTab) setTab(initialTab);
            setSearch("");
            fetch("/api/envs")
                .then((r) => r.json())
                .then((data) => setDiscoveredEnvs(data.envs ?? []))
                .catch(() => setDiscoveredEnvs([]));
        }
        // `projectOverrides` is intentionally NOT a
        // dependency. While the dialog is open, saving / resetting a
        // project override updates the parent's projectOverrides — the old
        // dep list made this effect re-fire, wiping the in-progress draft
        // (typed values snapped back) and re-fetching /api/envs. The draft
        // is re-synced the next time the dialog opens. `initialTab` is
        // likewise read only at open time — the parent only changes it
        // together with `open`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /* ── Interface-theme LIVE PREVIEW ───────────────────────────
* Picking a theme in the select applies it to the document right
* away.
* Cancel / Esc / overlay-click RESTORES the saved theme: the
* preview effect above is keyed on the draft, so closing without
* saving re-applies the store's value and the page's own applier
* stays in sync because settings.uiTheme never changed. */
    React.useEffect(() => {
        if (!open) return;
        const family = applyUiTheme(draft.uiTheme ?? "light");
        setTheme(family);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, draft.uiTheme]);
    React.useEffect(() => {
        if (open) return;
        // Dialog just closed — re-apply the SAVED effective theme so a
        // cancelled preview never lingers on the document.
        const saved = mergeProjectSettings(loadSettings(), projectOverrides);
        const family = applyUiTheme(saved.uiTheme ?? "light");
        setTheme(family);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Key-recording listener: while a shortcut is being recorded, every
    // keydown is captured (capture phase, stopPropagation) and turned
    // into a combo string. Escape cancels recording. Bare modifier
    // presses (Shift / Ctrl / Alt / Cmd alone) are ignored so the user
    // can press the modifiers first.
    // ─── shortcut conflict detection ───────────────────────
    /** Which shortcut (if any) already OWNS this combo? Returns the
     *  winning ShortcutItem or null. A shortcut's own existing binding
     * never counts as a conflict (rebinding to the same combo is a
     * no-op). */
    const findShortcutOwner = (
        combo: string,
        exceptId: string,
        customs: Record<string, string>
    ): ShortcutItem | null => {
        for (const g of SHORTCUT_GROUPS) {
            for (const it of g.items) {
                if (it.id === exceptId) continue;
                const effective = customs[it.id] ?? it.keys;
                if (effective === combo) return it;
            }
        }
        return null;
    };
    const [shortcutConflict, setShortcutConflict] = React.useState<{
        combo: string;
        ownerAction: string;
        recordingId: string;
    } | null>(null);

    React.useEffect(() => {
        if (!recordingId) return;
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const combo = keyEventToCombo(e);
            if (combo === null) return; // bare modifier — keep listening
            if (combo === "Escape") {
                setRecordingId(null);
                return;
            }
            // conflict detection — refuse a combo another shortcut
            // (custom OR default) already uses, unless it belongs to the one
            // being rebound. Prevents two actions silently firing together.
            const owner = findShortcutOwner(combo, recordingId, customShortcuts);
            if (owner) {
                setShortcutConflict({combo, ownerAction: owner.action, recordingId});
                setRecordingId(null);
                return;
            }
            setCustomShortcuts((prev) => {
                const next = {...prev, [recordingId]: combo};
                saveCustomShortcuts(next);
                return next;
            });
            setRecordingId(null);
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [recordingId, customShortcuts]);

    const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setDraft((prev) => ({...prev, [key]: value}));
    };

    const handleSave = () => {
        saveSettings(draft);
        // Broadcast the save so settings-reactive readers (e.g. the data
        // table presentation) refresh WITHOUT a remount or page reload.
        try {
            window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
        } catch {
            /* non-DOM env — ignore */
        }
        //
        // it"): the plain Save ALSO mirrors a copy of the draft into the
        // active project's .praxis/settings.json — the browser-local
        // store stays the instant cache, the project folder carries the
        // durable copy (PyCharm .idea-style). Best-effort: a failure keeps
        // the local save + closes the dialog, with a soft notice.
        if (mirrorProjectSettings) {
            void mirrorProjectSettings(draft as Partial<Settings>)
                .then((ok) => {
                    if (ok) {
                        toast({
                            title: "Settings saved — copy stored in the project",
                            description: "localStorage holds this browser's instant copy; .praxis/settings.json in the project folder now holds the same settings (AI provider keys stay browser-local).",
                            variant: "success",
                        });
                    }
                })
                .catch(() => {
                    toast({
                        title: "Saved locally — the project copy failed",
                        description: ".praxis/settings.json could not be written (read-only project folder?). Your settings still saved in this browser.",
                        variant: "warning" as const,
                    });
                });
        }
        onOpenChange(false);
    };

    // ── Backup (the .praxis folder as a zip) ─────────────────────────
    const [backupBusy, setBackupBusy] = React.useState(false);

    /** Download the ACTIVE project's .praxis folder as one zip. */
    const handleExportBackup = React.useCallback(async () => {
        setBackupBusy(true);
        try {
            const res = await fetch("/api/project-backup", {cache: "no-store"});
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast({
                    title: "Export failed",
                    description: data.error ?? `HTTP ${res.status}`,
                    variant: "destructive"
                });
                return;
            }
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "praxis-settings-backup.zip";
            a.click();
            URL.revokeObjectURL(a.href);
            toast({
                title: "Backup exported",
                description: "praxis-settings-backup.zip holds this project's .praxis folder (settings, appearance, notes, spell-ignore). Import it on any machine to restore.",
                variant: "success",
            });
        } catch {
            toast({title: "Export failed", description: "The backup could not be downloaded.", variant: "destructive"});
        } finally {
            setBackupBusy(false);
        }
    }, [toast]);

    /** Restore a backup zip into the active project's .praxis folder —
     *  the restored settings become BOTH the live project settings and
     *  this browser's local copy (the dialog draft reloads from them). */
    const handleImportBackup = React.useCallback(
        async (file: File) => {
            setBackupBusy(true);
            try {
                const body = new FormData();
                body.append("file", file);
                const res = await fetch("/api/project-backup", {method: "POST", body});
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) {
                    toast({
                        title: "Import failed",
                        description: data.error ?? `HTTP ${res.status}`,
                        variant: "destructive"
                    });
                    return;
                }
                // Reload the now-live project settings so the draft (and the
                // browser-local mirror) reflect exactly what the zip restored.
                const proj = await fetch("/api/project-settings", {cache: "no-store"});
                let merged: Settings = draft;
                if (proj.ok) {
                    const pj = await proj.json();
                    if (pj.ok && pj.settings && typeof pj.settings === "object") {
                        merged = {...DEFAULT_SETTINGS, ...(pj.settings as Partial<Settings>)};
                    }
                }
                saveSettings(merged);
                setDraft(merged);
                try {
                    window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
                } catch {
                    /* non-DOM env — ignore */
                }
                toast({
                    title: "Backup imported",
                    description: `${(data.restored as string[]).length} config file(s) restored into .praxis (${(data.restored as string[]).join(", ")}) — the settings above now match the archive.`,
                    variant: "success",
                });
            } catch {
                toast({
                    title: "Import failed",
                    description: "The archive could not be uploaded.",
                    variant: "destructive"
                });
            } finally {
                setBackupBusy(false);
            }
        },
        [draft, toast]
    );

    // In-flight flag for the "Create venv for this folder"
    // button. While true, the button shows a spinner and is disabled.
    const [creatingVenv, setCreatingVenv] = React.useState(false);

    // Per-provider connection-test results for the AI tab's provider
    // manager (keyed by provider id).
    const [providerTests, setProviderTests] = React.useState<
        Record<
            string,
            | { ok: true; latencyMs: number; model?: string }
            | { ok: false; error: string }
        >
    >({});
    const [testingProviderId, setTestingProviderId] = React.useState<string | null>(null);

    /** POST /api/ai-test with one provider's config — pings the endpoint
     * with a trivial "ping" message and reports the round-trip latency +
     * model name. Results render inline on the provider's card so the
     * user can verify an endpoint (Ollama, LM Studio, vLLM, llama.cpp,
     * a hosted API…) before switching to it. Every provider is an
     * OpenAI-compatible endpoint — the built-in z-ai SDK ping is gone
     * along with the SDK itself. */
    const handleTestProvider = async (p: AiChatProvider) => {
        if ((p as { kind?: string }).kind === "zai") {
            setProviderTests((prev) => ({
                ...prev,
                [p.id]: {
                    ok: false,
                    error:
                        "The built-in Z.AI SDK option was removed — edit this provider into an OpenAI-compatible endpoint (base URL + model), or remove it and add one from the presets.",
                },
            }));
            return;
        }
        if (!p.baseUrl.trim()) {
            setProviderTests((prev) => ({
                ...prev,
                [p.id]: {ok: false, error: "Base URL is empty."},
            }));
            return;
        }
        if (!p.model.trim()) {
            setProviderTests((prev) => ({
                ...prev,
                [p.id]: {ok: false, error: "Model id is empty — set the model your server serves."},
            }));
            return;
        }
        setTestingProviderId(p.id);
        setProviderTests((prev) => {
            const next = {...prev};
            delete next[p.id];
            return next;
        });
        try {
            const res = await fetch("/api/ai-test", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    provider: {
                        kind: p.kind,
                        baseUrl: p.baseUrl,
                        apiKey: p.apiKey,
                        model: p.model,
                    },
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
                const msg =
                    (data && (data.error || data.message)) || `Failed (HTTP ${res.status})`;
                setProviderTests((prev) => ({
                    ...prev,
                    [p.id]: {ok: false, error: typeof msg === "string" ? msg : "Unknown error"},
                }));
            } else {
                setProviderTests((prev) => ({
                    ...prev,
                    [p.id]: {ok: true, latencyMs: data.latencyMs, model: data.model},
                }));
            }
        } catch (err) {
            setProviderTests((prev) => ({
                ...prev,
                [p.id]: {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                },
            }));
        } finally {
            setTestingProviderId(null);
        }
    };

    // POST /api/create-venv with the current folder slug +
    // (optionally) the selected interpreter. On success, toast the
    // created venv path and auto-switch `draft.pythonInterpreter` to the
    // venv's python binary so the user is immediately ready to run.
    const handleCreateVenv = async () => {
        if (!currentFolderSlug) return;
        setCreatingVenv(true);
        try {
            const res = await fetch("/api/create-venv", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: currentFolderSlug,
                    interpreter: draft.pythonInterpreter || undefined,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
                const msg =
                    (data && (data.error || data.message)) ||
                    `Failed to create venv (HTTP ${res.status})`;
                throw new Error(typeof msg === "string" ? msg : "Failed to create venv");
            }
            // Auto-switch the interpreter to the freshly-created venv python.
            if (data.venvPython) {
                update("pythonInterpreter", data.venvPython);
            }
            toast({
                title: "Venv created",
                description: `Venv created at ${data.venvPath ?? currentFolderSlug}`,
                variant: "success",
            });
        } catch (err) {
            toast({
                title: "Failed to create venv",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
        } finally {
            setCreatingVenv(false);
        }
    };

    const handleReset = () => {
        // Only mutate the local draft here — persisting belongs to Save.
        // (Calling resetSettings directly would write to localStorage
        // immediately, so a later Cancel could no longer restore the
        // user's previous settings.) We only mutate the
        // in-memory draft; persistence happens on Save.
        setDraft(DEFAULT_SETTINGS);
    };

    // Search filtering: case-insensitive match against the setting's
    // label AND hint. Empty query → empty results (the tabbed view is
    // shown instead).
    // results are additionally DEDUPLICATED per
    // (tab + key): several index rows can legitimately share one
    // Settings key (per-language overrides, the capture kinds…) — the
    // search list only ever shows the FIRST of each, so one logical
    // setting can never appear as repeated rows.
    const searchResults = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        const seen = new Set<string>();
        return SETTINGS_INDEX.filter((e) => {
            const inLabel = e.label.toLowerCase().includes(q);
            const inHint = e.hint ? e.hint.toLowerCase().includes(q) : false;
            if (!inLabel && !inHint) return false;
            const dedupeKey = `${e.tab}::${e.key}`;
            if (seen.has(dedupeKey)) return false;
            seen.add(dedupeKey);
            return true;
        });
    }, [search]);

    /** Jump from a search result to the setting's tab + briefly
     *  highlight the row. The highlight is cleared after 2s. */
    const jumpToSetting = (entry: SettingIndexEntry) => {
        setTab(entry.tab);
        setSearch("");
        setHighlightedLabel(entry.label);
        // Scroll the row into view after the tab swaps. Two RAFs ensure
        // the new TabsContent has painted before we look up the element.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = document.getElementById(
                    `setting-row-${entry.rowId ?? entry.key}`
                );
                if (el) el.scrollIntoView({block: "center", behavior: "smooth"});
            });
        });
        window.setTimeout(() => setHighlightedLabel(null), 2000);
    };

    // Project settings: "Save as project settings" persists the current
    // draft to <project-root>/.praxis/settings.json via the page's
    // callback. We pass a snapshot of the draft (a plain object).
    const handleSaveProjectSettings = async () => {
        if (!onSaveProjectSettings) return;
        try {
            await onSaveProjectSettings(draft as Partial<Settings>);
            toast({
                title: "Project settings saved",
                description: "Saved to .praxis/settings.json in the active project root.",
                variant: "success",
            });
        } catch (err) {
            toast({
                title: "Failed to save project settings",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
        }
    };

    /**: the profile buttons used to call only
     * `setDraft(next)` + `saveSettings(next)` — which writes the
     * BROWSER-LOCAL store. But since /45 the live settings are
     * `{...localSettings,...projectOverrides }` — the.praxis/
     * settings.json OVERRIDES shadow the local store, so the profile's
     * patch never reached the app until the project file happened to be
     * updated. Applying a profile now runs the EXACT flow the plain Save
     * button uses: patch the draft, save locally, broadcast
     * `praxis:settings-saved` (settings-reactive readers refresh live),
     * and MIRROR the patched settings into.praxis/settings.json so the
     * project source carries the same values. The dialog stays open so
     * the user can see the toggles flip. */
    const applyProfile = React.useCallback(
        (profileName: string, patch: Partial<Settings>) => {
            const next: Settings = {...draft, ...patch};
            setDraft(next);
            saveSettings(next);
            try {
                window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
            } catch {
                /* non-DOM env — ignore */
            }
            if (mirrorProjectSettings) {
                void mirrorProjectSettings(next as Partial<Settings>)
                    .then((ok) => {
                        toast({
                            title: ok
                                ? `${profileName} profile applied — saved locally and to the project`
                                : `${profileName} profile applied (saved locally)`,
                            description: ok
                                ? "The settings it lists are patched and saved; everything else kept its value. .praxis/settings.json now carries the same profile so it is the live source for this project."
                                : ".praxis/settings.json could not be written (read-only project folder?) — the profile still applies in this browser.",
                            variant: "success",
                        });
                    })
                    .catch(() => {
                        toast({
                            title: `${profileName} profile applied (saved locally)`,
                            description: ".praxis/settings.json could not be written — the profile still applies in this browser.",
                            variant: "warning" as const,
                        });
                    });
            } else {
                toast({
                    title: `${profileName} profile applied`,
                    description: "The settings it lists are patched and saved immediately; everything else kept its value.",
                    variant: "success",
                });
            }
        },
        [draft, mirrorProjectSettings, toast]
    );

    const handleClearProjectSettings = async () => {
        if (!onClearProjectSettings) return;
        try {
            await onClearProjectSettings();
            toast({
                title: "Project settings cleared",
                description: "Removed .praxis/settings.json — global settings now in effect.",
                variant: "success",
            });
        } catch (err) {
            toast({
                title: "Failed to clear project settings",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
        }
    };

    const handleResetProjectKey = async (key: keyof Settings) => {
        if (!onResetProjectKey) return;
        try {
            await onResetProjectKey(key);
            // After removing the override, the effective value reverts to the
            // global one — re-seed the draft so the UI reflects that.
            setDraft((prev) => ({...prev, [key]: loadSettings()[key]}));
        } catch (err) {
            toast({
                title: "Failed to reset project override",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
        }
    };


    /* ─── the merged LANGUAGES + FORMATTING structure ──────────────
   * One block per non-Python formattable language, rendered at the
   * bottom of the Formatting tab: the language identity first (title,
   * one-line intro, detected runtime + green/gray dot — exactly the
   * Languages tab row), then every option that applies to it: its
   * indent width, its format-on-save mode, and the language-specific
   * passes. The old flat 20-row wall + the two full-width per-language
   * grids + the conventions card are all absorbed here — same settings
   * keys, new per-language dividers and headers. */
    const pythonEnvOk = discoveredEnvs.length > 0;

    interface LangFormatBlock {
        kind: string;
        title: string;
        /** runtime language id — kinds with an interpreter get the
         *  version chip + green/gray dot; doc kinds pass null. */
        language?: string;
        intro: string;
        conventions: string;
        /** language-specific SettingRows (moved verbatim from the old
         *  flat list into THIS language's block). */
        extra?: React.ReactNode;
    }

    const LANG_FORMAT_BLOCKS: LangFormatBlock[] = [
        {
            kind: "markdown",
            title: "Markdown",
            intro: "Lightweight prose + docs markup — renders GitHub-grade in the preview, formats offline with tables, lists and code fences untouched.",
            conventions: "table alignment (padded pipe cells), blank line before headings, list re-indent + bullet-marker normalization; fenced code blocks stay verbatim.",
            extra: (
                <>
                    <SettingRow
                        icon={<Table className="size-3.5"/>}
                        label="Align Markdown tables"
                        hint="Auto-format Markdown pads every pipe-table cell so all the | line up, and re-dashes the separator row to the padded widths."
                    >
                        <Switch
                            checked={draft.formatMarkdownTables}
                            onCheckedChange={(v) => update("formatMarkdownTables", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<ArrowUpFromLine className="size-3.5"/>}
                        label="Blank line before Markdown headings"
                        hint="Auto-format keeps exactly one blank line before every ATX heading (# / ## / …) — consistent section breaks. Fenced code blocks are never touched."
                    >
                        <Switch
                            checked={draft.formatMarkdownHeadingSpace !== false}
                            onCheckedChange={(v) => update("formatMarkdownHeadingSpace", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<ListTree className="size-3.5"/>}
                        label="Markdown bullet marker on format"
                        hint="Auto-format Markdown normalizes the bullet marker of every list item — * item becomes - item (the CommonMark default) or the reverse. Emphasis (*text*) and horizontal rules are never touched, and fenced code blocks stay verbatim."
                    >
                        <Select
                            value={draft.formatMarkdownBulletChar ?? "-"}
                            onValueChange={(v) =>
                                update("formatMarkdownBulletChar", v as "-" | "*")
                            }
                        >
                            <SelectTrigger className="h-8 w-28 text-xs" aria-label="Markdown bullet marker on format">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="-" className="text-xs">- (dash)</SelectItem>
                                <SelectItem value="*" className="text-xs">* (asterisk)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    {/* ── the PREVIEW reading width — the answer is now YES: this control
sizes the rendered document's prose column (the classic
md preview capped at one fixed width). */}
                    <SettingRow
                        icon={<WrapText className="size-3.5"/>}
                        label="Markdown preview reading width"
                        hint="The rendered document's prose column: Narrow ≈ 42rem, Medium ≈ 48rem (the classic look), Wide ≈ 56rem, Full uses the whole preview pane. Also applies to the Markdown studio's preview side. The column ruler (Editor tab) draws over the preview at its configured column."
                    >
                        <Select
                            value={draft.mdPreviewWidth ?? "medium"}
                            onValueChange={(v) =>
                                update("mdPreviewWidth", v as "narrow" | "medium" | "wide" | "full")
                            }
                        >
                            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Markdown preview reading width">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="narrow" className="text-xs">Narrow (42rem)</SelectItem>
                                <SelectItem value="medium" className="text-xs">Medium (48rem)</SelectItem>
                                <SelectItem value="wide" className="text-xs">Wide (56rem)</SelectItem>
                                <SelectItem value="full" className="text-xs">Full pane</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                </>
            ),
        },
        {
            kind: "html",
            title: "HTML",
            intro: "The markup language of the web — sandboxed Preview / Source / Split views, live editing, offline beautify with raw regions untouched.",
            conventions: "one line per block element, attribute quoting + optional long-attribute wrapping, tag-name lowercasing; script/pre/style/textarea contents stay frozen.",
            extra: (
                <>
                    <SettingRow
                        icon={<FileCode2 className="size-3.5"/>}
                        label="HTML: lowercase tag names on format"
                        hint="Auto-format HTML / XML lowercases the tag and attribute NAMES — DIV CLASS='x' becomes div class='x' — while quoted values stay verbatim and camel-case SVG attributes (viewBox …) keep their case."
                    >
                        <Switch
                            checked={draft.formatHtmlLowercaseTags !== false}
                            onCheckedChange={(v) => update("formatHtmlLowercaseTags", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<FileCode2 className="size-3.5"/>}
                        label="HTML: attribute quotes on format"
                        hint='Auto-format HTML / XML normalizes attribute quoting — attr=&apos;v&apos; becomes attr="v" when the value contains no double quote. Script / pre / style / textarea contents are never touched.'
                    >
                        <Select
                            value={draft.formatHtmlAttrQuotes ?? "keep"}
                            onValueChange={(v) =>
                                update("formatHtmlAttrQuotes", v as "keep" | "double")
                            }
                        >
                            <SelectTrigger className="h-8 w-28 text-xs" aria-label="HTML attribute quotes on format">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="keep" className="text-xs">Keep as typed</SelectItem>
                                <SelectItem value="double" className="text-xs">' → " (double)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    <SettingRow
                        icon={<Wand2 className="size-3.5"/>}
                        label="HTML: wrap long attribute lists"
                        hint="Auto-format HTML / XML breaks a tag onto indented attribute lines when the whole tag exceeds the column budget below. Off keeps one-line tags on one line."
                    >
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={draft.formatHtmlWrapAttrs === true}
                                onCheckedChange={(v) => update("formatHtmlWrapAttrs", v)}
                            />
                            <Select
                                value={String(draft.formatHtmlWrapAtCols ?? 100)}
                                onValueChange={(v) => update("formatHtmlWrapAtCols", parseInt(v, 10))}
                                disabled={draft.formatHtmlWrapAttrs !== true}
                            >
                                <SelectTrigger className="h-8 w-24 text-xs" aria-label="HTML attribute wrap column">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="80" className="text-xs">80 cols</SelectItem>
                                    <SelectItem value="100" className="text-xs">100 cols</SelectItem>
                                    <SelectItem value="120" className="text-xs">120 cols</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingRow>
                </>
            ),
        },
        {
            kind: "toml",
            title: "TOML",
            intro: "Tom's Obvious, Minimal Language — the pyproject-style config format; formats offline with aligned key columns and normalized arrays.",
            conventions: "aligned key column (`=` lines up), blank line before each [table], normalized multiline-array indentation.",
            extra: (
                <SettingRow
                    icon={<Equal className="size-3.5"/>}
                    label="Align TOML key column"
                    hint="Auto-format TOML pads the key column inside each run of `key = value` lines so every = lines up — the tidy pyproject-style layout."
                >
                    <Switch
                        checked={draft.formatTomlAlignEquals}
                        onCheckedChange={(v) => update("formatTomlAlignEquals", v)}
                    />
                </SettingRow>
            ),
        },
        {
            kind: "json",
            title: "JSON",
            intro: "The config / data interchange format — tree ⇄ text inspector with live validation, JSONPath queries and offline re-stringify.",
            conventions: "re-stringified at the configured indent width (indenting IS formatting — no separate indent twin), optional key sorting, minified single-line files expanded.",
            extra: (
                <SettingRow
                    icon={<Braces className="size-3.5"/>}
                    label="Sort JSON object keys on format"
                    hint="Auto-format JSON re-stringifies with keys in sorted order — deterministic diffs for config files that don't care about key order. Off keeps the authored order."
                >
                    <Switch
                        checked={draft.formatJsonSortKeys === true}
                        onCheckedChange={(v) => update("formatJsonSortKeys", v)}
                    />
                </SettingRow>
            ),
        },
        {
            kind: "yaml",
            title: "YAML",
            intro: "Human-friendly configuration — validation banner, form editor awareness, block scalars (| and >) stay byte-for-byte through formatting.",
            conventions: "indentation snapped to the configured unit (tabs are invalid YAML — the indent-style conversion skips it), block scalars untouched.",
        },
        {
            kind: "css",
            title: "CSS",
            intro: "Stylesheets (also SCSS / LESS shapes) — live split preview with HTML, offline beautifier with one declaration per line.",
            conventions: "one declaration per line, nested blocks at the configured indent.",
            extra: (
                <SettingRow
                    icon={<PaletteIcon className="size-3.5"/>}
                    label="CSS: one declaration per line"
                    hint="Auto-format CSS / SCSS / LESS splits multi-declaration blocks (a{b:c;d:e}) so every declaration sits on its own indented line."
                >
                    <Switch
                        checked={draft.formatCssOneDeclPerLine !== false}
                        onCheckedChange={(v) => update("formatCssOneDeclPerLine", v)}
                    />
                </SettingRow>
            ),
        },
        {
            kind: "sql",
            title: "SQL",
            intro: "Structured Query Language — schema view for DDL, SQLite workbench for databases, clause re-indent + keyword casing offline.",
            conventions: "clauses on their own lines, continuation and subqueries indented, strings untouched; keyword case per the option below.",
            extra: (
                <SettingRow
                    icon={<Wand2 className="size-3.5"/>}
                    label="SQL keyword case on format"
                    hint="Auto-format rewrites the casing of the major SQL keywords (SELECT / FROM / WHERE …) — upper, lower, or keep the author's case. Identifiers and strings are never touched."
                >
                    <Select
                        value={draft.formatSqlKeywordCase ?? (draft.formatSqlUppercaseKeywords ? "upper" : "keep")}
                        onValueChange={(v) =>
                            update("formatSqlKeywordCase", v as "keep" | "upper" | "lower")
                        }
                    >
                        <SelectTrigger className="h-8 w-32 text-xs" aria-label="SQL keyword case on format">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="keep" className="text-xs">Keep As Typed</SelectItem>
                            <SelectItem value="upper" className="text-xs">UPPERCASE</SelectItem>
                            <SelectItem value="lower" className="text-xs">lowercase</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingRow>
            ),
        },
        {
            kind: "javascript",
            title: "JavaScript",
            language: "javascript",
            intro: LANGUAGE_INTROS.javascript,
            conventions: "brace re-indent + operator spacing + optional quote normalization ('x' → \"x\"). Template literals, strings, comments and regex stay frozen.",
            extra: (
                <>
                    <SettingRow
                        icon={<Braces className="size-3.5"/>}
                        label="JS / TS operator spacing"
                        hint="The JavaScript / TypeScript beautify pass normalizes spaces around operators, commas and object-literal colons (calls stay tight: f(x), not f (x)). Turn off for indent-only."
                    >
                        <Switch
                            checked={draft.formatJsOperatorSpacing !== false}
                            onCheckedChange={(v) => update("formatJsOperatorSpacing", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<Braces className="size-3.5"/>}
                        label="JS / TS bracket spacing"
                        hint="Auto-format pads object-literal braces — { a: 1 } (Prettier's bracketSpacing, ON by default) or the tight {a: 1}. Code blocks and arrays stay tight either way."
                    >
                        <Switch
                            checked={draft.formatJsBracketSpacing !== false}
                            onCheckedChange={(v) => update("formatJsBracketSpacing", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<Braces className="size-3.5"/>}
                        label="JS / TS quote style on format"
                        hint={`Auto-format normalizes string-literal quotes for .js / .ts / .jsx / .tsx — 'x' → "x" (Prettier's default, ON by default) or the reverse, applied ONLY when the body needs no re-escaping. Template literals, comments and regex always stay untouched.`}
                    >
                        <Select
                            value={draft.formatJsQuoteStyle ?? "double"}
                            onValueChange={(v) =>
                                update("formatJsQuoteStyle", v as "keep" | "double" | "single")
                            }
                        >
                            <SelectTrigger className="h-8 w-28 text-xs" aria-label="JS / TS quote style on format">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="keep" className="text-xs">Keep as typed</SelectItem>
                                <SelectItem value="double" className="text-xs">' → " (double)</SelectItem>
                                <SelectItem value="single" className="text-xs">" → ' (single)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                </>
            ),
        },
        {
            kind: "typescript",
            title: "TypeScript",
            language: "typescript",
            intro: LANGUAGE_INTROS.typescript,
            conventions: "the same brace re-indent + operator spacing + quote normalization as JavaScript — types and generics ride along frozen.",
            extra: (
                <>
                    <SettingRow
                        icon={<Braces className="size-3.5"/>}
                        label="JS / TS operator spacing"
                        hint="The JavaScript / TypeScript beautify pass normalizes spaces around operators, commas and object-literal colons (calls stay tight: f(x), not f (x)). Turn off for indent-only."
                    >
                        <Switch
                            checked={draft.formatJsOperatorSpacing !== false}
                            onCheckedChange={(v) => update("formatJsOperatorSpacing", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<Braces className="size-3.5"/>}
                        label="JS / TS bracket spacing"
                        hint="Auto-format pads object-literal braces — { a: 1 } (Prettier's bracketSpacing, ON by default) or the tight {a: 1}. Code blocks and arrays stay tight either way."
                    >
                        <Switch
                            checked={draft.formatJsBracketSpacing !== false}
                            onCheckedChange={(v) => update("formatJsBracketSpacing", v)}
                        />
                    </SettingRow>
                    <SettingRow
                        icon={<Braces className="size-3.5"/>}
                        label="JS / TS quote style on format"
                        hint={`Auto-format normalizes string-literal quotes for .js / .ts / .jsx / .tsx — 'x' → "x" (Prettier's default, ON by default) or the reverse, applied ONLY when the body needs no re-escaping. Template literals, comments and regex always stay untouched.`}
                    >
                        <Select
                            value={draft.formatJsQuoteStyle ?? "double"}
                            onValueChange={(v) =>
                                update("formatJsQuoteStyle", v as "keep" | "double" | "single")
                            }
                        >
                            <SelectTrigger className="h-8 w-28 text-xs" aria-label="JS / TS quote style on format">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="keep" className="text-xs">Keep as typed</SelectItem>
                                <SelectItem value="double" className="text-xs">' → " (double)</SelectItem>
                                <SelectItem value="single" className="text-xs">" → ' (single)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                </>
            ),
        },
        {
            kind: "matlab",
            title: "MATLAB",
            language: "matlab",
            intro: LANGUAGE_INTROS.matlab,
            conventions: "keyword-block re-indent (else / elseif / case at the opener's level, classdef / properties nesting, … continuations) + transpose-aware spacing.",
            extra: (
                <SettingRow
                    icon={<Braces className="size-3.5"/>}
                    label="MATLAB operator spacing"
                    hint="The MATLAB Auto-format spacing pass (commas, keywords). Auto-indent never touches spacing."
                >
                    <Switch
                        checked={draft.formatMatlabOperatorSpacing !== false}
                        onCheckedChange={(v) => update("formatMatlabOperatorSpacing", v)}
                    />
                </SettingRow>
            ),
        },
        {
            kind: "java",
            title: "Java",
            language: "java",
            intro: LANGUAGE_INTROS.java,
            conventions: "brace re-indent + spacing; generics untouched.",
        },
        {
            kind: "c",
            title: "C",
            language: "c",
            intro: LANGUAGE_INTROS.c,
            conventions: "brace re-indent + spacing; preprocessor lines untouched.",
        },
        {
            kind: "cpp",
            title: "C++",
            language: "cpp",
            intro: LANGUAGE_INTROS.cpp,
            conventions: "brace re-indent + spacing; generics and preprocessor lines untouched.",
        },
        {
            kind: "r",
            title: "R",
            language: "r",
            intro: LANGUAGE_INTROS.r,
            conventions: "re-indent only — braces drive the layout; spacing is left to the author.",
        },
        {
            kind: "shell",
            title: "Shell",
            language: "shell",
            intro: LANGUAGE_INTROS.shell,
            conventions: "if / then / fi, case / esac and heredoc bodies frozen while the block structure re-indents.",
        },
        {
            kind: "ruby",
            title: "Ruby",
            language: "ruby",
            intro: LANGUAGE_INTROS.ruby,
            conventions: "end-block + trailing do re-indent; strings frozen.",
        },
        {
            kind: "php",
            title: "PHP",
            language: "php",
            intro: LANGUAGE_INTROS.php,
            conventions: "brace-driven re-indent; heredocs frozen.",
        },
        {
            kind: "go",
            title: "Go",
            language: "go",
            intro: LANGUAGE_INTROS.go,
            conventions: "brace-driven re-indent; raw strings stay frozen.",
        },
        {
            kind: "lua",
            title: "Lua",
            language: "lua",
            intro: LANGUAGE_INTROS.lua,
            conventions: "function / if…then / for…do / repeat…until re-indent; one-line blocks stay level.",
        },
        {
            kind: "perl",
            title: "Perl",
            language: "perl",
            intro: LANGUAGE_INTROS.perl,
            conventions: "brace re-indent; # comments stay byte-for-byte.",
        },
        {
            kind: "rust",
            title: "Rust",
            language: "rust",
            intro: LANGUAGE_INTROS.rust,
            conventions: "brace-driven re-indent; lifetimes and strings untouched.",
        },
        {
            kind: "julia",
            title: "Julia",
            language: "julia",
            intro: LANGUAGE_INTROS.julia,
            conventions: "function / struct / module / try re-indent; triple-quoted strings frozen.",
        },
        {
            kind: "kotlin",
            title: "Kotlin",
            language: "kotlin",
            intro: LANGUAGE_INTROS.kotlin,
            conventions: "brace re-indent; backtick identifiers stay identifiers.",
        },
        {
            kind: "swift",
            title: "Swift",
            language: "swift",
            intro: LANGUAGE_INTROS.swift,
            conventions: "brace re-indent with strings and comments frozen.",
        },
        {
            kind: "powershell",
            title: "PowerShell",
            language: "powershell",
            intro: LANGUAGE_INTROS.powershell,
            conventions: "brace + parenthesized block re-indent; # comments and here-strings frozen.",
        },
        {
            kind: "batch",
            title: "Batch",
            language: "batch",
            intro: LANGUAGE_INTROS.batch,
            conventions: "( … ) block re-indent, :labels pinned to column 0, REM / :: lines frozen.",
        },
        {
            kind: "zig",
            title: "Zig",
            language: "zig",
            intro: LANGUAGE_INTROS.zig,
            conventions: "brace-driven re-indent; // comments and strings untouched.",
        },
        {
            kind: "dart",
            title: "Dart",
            language: "dart",
            intro: LANGUAGE_INTROS.dart,
            conventions: "brace-driven re-indent; strings and comments untouched.",
        },
        {
            kind: "groovy",
            title: "Groovy",
            language: "groovy",
            intro: LANGUAGE_INTROS.groovy,
            conventions: "brace-driven re-indent; strings and comments untouched.",
        },
        {
            kind: "scala",
            title: "Scala",
            language: "scala",
            intro: LANGUAGE_INTROS.scala,
            conventions: "brace-driven re-indent; strings and comments untouched.",
        },
        {
            kind: "elixir",
            title: "Elixir",
            language: "elixir",
            intro: LANGUAGE_INTROS.elixir,
            conventions: "do…end re-indent (def / if / case open, end closes, peers at the opener's level); heredocs byte-for-byte.",
        },
        {
            kind: "haskell",
            title: "Haskell",
            language: "haskell",
            intro: LANGUAGE_INTROS.haskell,
            conventions: "indent-grid normalization — layout-sensitive, so leading whitespace rounds to whole multiples of the width; the authored structure is preserved.",
        },
        {
            kind: "erlang",
            title: "Erlang",
            language: "erlang",
            intro: LANGUAGE_INTROS.erlang,
            conventions: "arrow-clause re-indent — a trailing -> opens one level, leading end / after / catch / else dedents, a clause-ending period resets to column 0; % comments verbatim.",
        },
        {
            kind: "clojure",
            title: "Clojure",
            language: "clojure",
            intro: LANGUAGE_INTROS.clojure,
            conventions: "bracket-form re-indent — every ( ) [ ] { } form opens one level; ; comments and strings byte-for-byte.",
        },
        {
            kind: "ocaml",
            title: "OCaml",
            language: "ocaml",
            intro: LANGUAGE_INTROS.ocaml,
            conventions: "indent-grid normalization — layout-sensitive, leading whitespace rounds to whole multiples of the width.",
        },
        {
            kind: "fsharp",
            title: "F#",
            language: "fsharp",
            intro: LANGUAGE_INTROS.fsharp,
            conventions: "indent-grid normalization — layout-sensitive, leading whitespace rounds to whole multiples of the width.",
        },
        {
            kind: "graphql",
            title: "GraphQL",
            language: "graphql",
            intro: LANGUAGE_INTROS.graphql,
            conventions: "brace re-indent with # comments — type / query / mutation blocks align by their braces; arguments and enum members indent one level under their parent.",
        },
    ];
    /* ─── SECTION JUMP BAR targets (replaces the A–Z letter
* strip): the bar is DOM-DRIVEN — it reads the ACTIVE tab's
* top-level <section> headings at runtime (rebuildSections below),
* so every tab (Editor, Formatting, Python, …) automatically gets
* a jump chip per section header (“Formatting — all languages”,
* “Language runtimes — installed & detected”, “Python”, “Java”, …)
* with no per-tab hand-written list. The old strip keyed on the
* FIRST LETTER of each language — near-useless chips like B C D E
* F G … — and only existed on the Formatting tab. */
    return (
        <SettingsRowContext.Provider
            value={{highlightedLabel, overriddenKeys}}
        >
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="sm:max-w-7xl w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col overflow-hidden overflow-y-hidden overflow-x-hidden gap-0 p-0">
                    {/* ── FIXED TOP — title + source badges + search. The dialog is a flex column:
header/search strip → tab strip → scrollable content →
pinned footer. Only the middle region scrolls. */}
                    <div className="shrink-0 px-6 pt-5 pb-2.5 space-y-2.5">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <SettingsIcon className="size-4 text-emerald-500"/>
                                Settings
                                {/* the persistent settings-source badge — ONE badge carries the
                whole story: WHERE the settings load from and the exact
                on-disk file (the old pair of badges — "loaded from
                .praxis/settings.json" + a second path chip — read as
                duplicated information). */}
                                {settingsSource === "project" || settingsSource === "seeded" ? (() => {
                                    const sep = settingsSourceDir?.includes("\\") ? "\\" : "/";
                                    const filePath = settingsSourceDir
                                        ? `${settingsSourceDir}${sep}settings.json`
                                        : ".praxis/settings.json";
                                    return (
                                        <span
                                            className={
                                                "ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium max-w-[24rem] " +
                                                (settingsSource === "project"
                                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                    : "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400")
                                            }
                                            title={
                                                settingsSource === "project"
                                                    ? `This project's settings load from ${filePath} (PyCharm .idea-style). Keys in that file override the browser-local values.`
                                                    : `No .praxis/settings.json existed in this project — one was just created at ${filePath} with your current settings. Future opens load from it.`
                                            }
                                        >
                <FolderCog className="size-3 shrink-0"/>
                <span className="truncate">
                  {(settingsSource === "project" ? "project — " : "created — ") + filePath}
                </span>
              </span>
                                    );
                                })() : settingsSource ? (
                                    <span
                                        className="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                        title="No .praxis/settings.json in this project — settings load from this browser's localStorage."
                                    >
                <FolderCog className="size-3"/>
                browser-local (no .praxis yet)
              </span>
                                ) : null}
                            </DialogTitle>
                            <DialogDescription>
                                Runtime preferences. Stored in your browser&apos;s localStorage — and, when a project
                                has one, overridden by <span className="font-mono">.praxis/settings.json</span> in the
                                project folder.
                            </DialogDescription>
                        </DialogHeader>

                        {/* Search box — when non-empty, a flat list of matching settings
            replaces the tabbed view. Matches against label + hint
            (case-insensitive). */}
                        <div className="relative">
                            <Search
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"/>
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search settings by name or description…"
                                className="pl-8 h-9 text-sm"
                                aria-label="Search settings"
                            />
                            {search && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs"
                                    onClick={() => setSearch("")}
                                    aria-label="Clear search"
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>

                    {search.trim() ? (
                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6">
                            <SearchResultsView
                                results={searchResults}
                                draft={draft}
                                onSelect={jumpToSetting}
                            />
                        </div>
                    ) : (
                        <Tabs value={tab} onValueChange={setTab} className="w-full flex flex-col flex-1 min-h-0">
                            {/* The tab strip renders on ONE row. Compact triggers (11px, tight padding, no wrap) fit
all tabs in the dialog's width; ultra-narrow viewports
scroll horizontally instead of ever breaking the row, so
no tab is ever cut or re-flowed to a new line. The strip
sits ABOVE the scroll container — it stays pinned while
the settings scroll underneath. */}
                            <div className="shrink-0 px-6 pt-1 pb-2 border-b bg-background">
                                <TabsList
                                    ref={tabsStripPanRef}
                                    /* TRUE SAFE CENTERING: the old [justify-content:safe_center]
               * relied on the `safe` keyword, which several engines parse
               * but still LAYOUT as plain `center` — with an overflowing
               * row the flex line centered into BOTH sides, making the
               * leftmost tabs permanently unreachable (scrollLeft bottoms
               * out at 0 with the first tab still clipped off-screen:
               * the "horizontal scrolling truncates the leftmost tabs"
               * report). Auto MARGINS implement safe centering for real:
               * the triggers now sit in a w-max wrapper with mx-auto —
               * when the row fits it centers exactly like before; when
               * it overflows the auto margins collapse to 0 and the row
               * starts at the leading padding, so EVERY tab is
               * reachable by scrolling. scroll-px keeps scroll-into-view
               * (keyboard arrow navigation) from gluing a tab to the
               * strip edge. */
                                    className="flex w-full justify-start items-start gap-0 h-auto overflow-x-auto rounded-md p-1.5 px-3 pb-2.5 [scrollbar-width:thin] scroll-px-3"
                                    title="Scroll the strip left/right — wheel, middle-click drag, or Shift+wheel"
                                >
                                    {/* The w-max wrapper — the actual safe-centering trick: its
                max-content width lets the row keep its natural size, and
                the mx-auto auto margins center it when it fits and
                collapse to 0 when it overflows (see the block comment
                above). */}
                                    <div className="flex w-max mx-auto items-center gap-0.5">
                                        {/* Tab order: editing + runtime first, then the big feature
                areas, then chrome/accessibility, then data-management
                tabs last. Radix renders TabsContent by value, not DOM
                order — the content blocks below keep their own order. */}
                                        <TabsTrigger value="editor"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Editor</TabsTrigger>
                                        {/* Every formatter setting moved here
from the Editor tab, plus the new language families. */}
                                        <TabsTrigger value="formatting" data-settings-tab="formatting"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Formatting</TabsTrigger>
                                        <TabsTrigger value="python"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Python</TabsTrigger>
                                        {/* the runtime panel merged INTO the Formatting tab (the "merge languages and formatting" ask) — the
per-language blocks there carry the identity (title,
description, version, green/gray dot) + every option. */}
                                        <TabsTrigger value="collaboration"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Collaboration</TabsTrigger>
                                        <TabsTrigger value="focus"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Focus</TabsTrigger>
                                        <TabsTrigger value="ai"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">AI</TabsTrigger>
                                        <TabsTrigger value="nav"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Nav</TabsTrigger>
                                        <TabsTrigger value="a11y"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Accessibility</TabsTrigger>
                                        <TabsTrigger value="capture"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Capture</TabsTrigger>
                                        {/* media gallery / slideshow defaults. */}
                                        <TabsTrigger value="media"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Media</TabsTrigger>
                                        <TabsTrigger value="backup"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Backup</TabsTrigger>
                                        <TabsTrigger value="cache"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Cache</TabsTrigger>
                                        <TabsTrigger value="advanced"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Advanced</TabsTrigger>
                                        {/* Project + Shortcuts close the strip on the SAME row —
              they can no longer wrap onto a new line (nowrap above),
              and stay adjacent at any width. */}
                                        <TabsTrigger value="project"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Project</TabsTrigger>
                                        <TabsTrigger value="shortcuts"
                                                     className="text-[11px] h-7 px-2 whitespace-nowrap shrink-0">Shortcuts</TabsTrigger>
                                    </div>
                                </TabsList>
                                {/* ── the SECTION jump bar — ATTACHED to the tab strip (same
pinned container, directly under the TabsList). One chip per
section header of the ACTIVE tab; horizontally scrollable (the
Formatting tab lists every language block); the scroll-spy marks
the section in view. Hidden while a search is active (flat
results view).
The scrollable chip row keeps breathing room (px-3 +
pb-2 + pt-1.5, taller bordered py-1.5 chips) so the
horizontal scrollbar and the row edges can never touch the chip
text. The wheel, middle-click + drag and Shift+wheel all pan the
strip left/right (useMiddleMousePan). */}
                                {!search.trim() && jumpSections.length > 0 && (
                                    <div
                                        className="mt-0.5 flex items-stretch gap-1 border-t pt-1"
                                        data-section-jump-bar="true"
                                        role="navigation"
                                        aria-label="Jump to a section of this tab"
                                    >
                <span
                    className="shrink-0 self-center pr-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListTree className="size-3" aria-hidden="true"/>
                </span>
                                        <div
                                            ref={jumpStripPanRef}
                                            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3 pb-2 pt-1.5 [scrollbar-width:thin]"
                                            title="Scroll the chips left/right — wheel, middle-click drag, or Shift+wheel"
                                        >
                                            {jumpSections.map((s) => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => jumpToSection(s.el)}
                                                    className={cn(
                                                        "shrink-0 whitespace-nowrap rounded border px-2.5 py-1.5 text-[10px] font-medium leading-4 transition-colors",
                                                        activeJumpId === s.id
                                                            ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    )}
                                                    title={`Jump to the “${s.label}” section`}
                                                    aria-label={`Jump to the ${s.label} section`}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* The ONLY scrollable region — every tab's settings scroll
              here while the strip above and the footer below stay
              pinned. The host class drives the tab-switch fade-in
              (globals.css — praxis-tab-in). */}
                            <div ref={settingsScrollRef}
                                 className="settings-tabs-host flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-5 pt-1">
                                {/* Cache section */}
                                <TabsContent value="cache"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <FolderClosed className="size-3"/>
                                            Output cache
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            The cache lives in your browser&apos;s localStorage — one
                                            entry per script, keyed by folder/file slug.
                                        </p>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Auto-load cached output on script selection"
                                        >
                                            <Switch
                                                checked={draft.autoLoadCachedOutput}
                                                onCheckedChange={(v) => update("autoLoadCachedOutput", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Cache TTL (seconds)"
                                            hint="0 = never expire. 604800 = 7 days (default)."
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                value={draft.cacheTtlSeconds}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update("cacheTtlSeconds", Number.isFinite(n) ? Math.max(0, n) : 0);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Clock className="size-3.5"/>} label="History max entries">
                                            <Input
                                                type="number"
                                                min={10}
                                                max={100}
                                                value={draft.historyMaxEntries}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "25", 10);
                                                    update("historyMaxEntries", Number.isFinite(n) ? Math.max(10, Math.min(100, n)) : 25);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* Notifications section */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Bell className="size-3"/>
                                            Notifications
                                        </h3>
                                        <SettingRow
                                            icon={<Bell className="size-3.5"/>}
                                            label="Show action notifications"
                                            hint="Toast notifications for refresh, save, import, export, etc."
                                        >
                                            <Switch
                                                checked={draft.actionNotifications}
                                                onCheckedChange={(v) => update("actionNotifications", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Toast duration (ms)"
                                            hint="0 = sticky / manual dismiss. Default 4000 (4 seconds)."
                                        >
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={draft.toastDuration}
                                                    onChange={(e) => {
                                                        // NaN guard — parseInt("abc") returns NaN; fall
                                                        // back to 4000 (default) instead of persisting NaN.
                                                        const n = parseInt(e.target.value || "4000", 10);
                                                        update("toastDuration", Number.isFinite(n) ? Math.max(0, n) : 4000);
                                                    }}
                                                    className="font-mono text-xs h-8 w-32"
                                                />
                                                {draft.toastDuration === 0 ? (
                                                    <span
                                                        className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-medium text-amber-700 dark:text-amber-400"
                                                        title="Toasts currently stay on screen until you dismiss them — set a duration above 0 for auto-dismiss."
                                                    >
                    sticky — never auto-dismiss
                  </span>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">
                    auto-dismiss after {(draft.toastDuration / 1000).toFixed(draft.toastDuration % 1000 === 0 ? 0 : 1)}s
                  </span>
                                                )}
                                            </div>
                                        </SettingRow>
                                    </section>
                                </TabsContent>

                                {/* Python section */}
                                {/* ─── the FORMATTING tab — every auto-format /
              auto-indent option gathered per language ─────────────── */}
                                <TabsContent value="formatting"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    {/* ── 0. (REMOVED) the A–Z letter jump strip used to render here —
              replaced by the universal SECTION jump bar attached to
              the tab strip above (see SectionJumpBar), which lists the
              ACTIVE tab's real section headers ("Formatting — all
              languages", "Language runtimes — installed & detected",
              "Python", …) on EVERY tab. The per-language <section>
              ids (`fmt-lang-<kind>`) are kept — the bar's scroll-spy
              and jump use the section elements directly. */}
                                    {/* ── 1. GLOBAL — every language's Auto-format shares these ── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Braces className="size-3"/>
                                            Formatting — all languages
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            Every file the viewer opens — Markdown, HTML, JSON, TOML, YAML, CSS, SQL,
                                            JavaScript, TypeScript, MATLAB, Java, C, C++, R, shell, Ruby, PHP, Go, Lua,
                                            Perl,
                                            Rust, Julia, Kotlin, Swift, PowerShell, Batch, Zig, Dart, Groovy, Scala,
                                            Elixir,
                                            Haskell, Erlang, Clojure, OCaml, F#, GraphQL — plus Python (through
                                            black/ruff)
                                            — has an offline Auto-format / Auto-indent in its right-click menu, valid in
                                            view
                                            and edit modes and in notebook cells. Every Auto-format / Auto-indent is
                                            undoable with
                                            <kbd
                                                className="font-mono text-[10px] px-1 py-0.5 rounded border bg-muted/50">Ctrl+Z</kbd>.
                                            The passes below apply to EVERY language; each language&apos;s own block
                                            further down
                                            pins its indent width, its save-time behavior and the options that only fit
                                            it.
                                        </p>
                                        <SettingRow
                                            icon={<AlignLeft className="size-3.5"/>}
                                            label="Formatter indent width"
                                            hint="Spaces per indent level for the offline formatters — Markdown lists &amp; tables, HTML beautify, TOML arrays, JSON. Independent of the editor's Tab width; each language block below can pin its own."
                                        >
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={String(draft.formatIndentWidth ?? 2)}
                                                    onValueChange={(v) => update("formatIndentWidth", parseInt(v, 10))}
                                                >
                                                    <SelectTrigger className="h-8 w-20 text-xs"
                                                                   aria-label="Formatter indent width">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="2" className="text-xs">2</SelectItem>
                                                        <SelectItem value="4" className="text-xs">4</SelectItem>
                                                        <SelectItem value="8" className="text-xs">8</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                  {"·".repeat(Math.max(2, draft.formatIndentWidth || 2))}
                </span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<TimerIcon className="size-3.5"/>}
                                            label="Switch-to-editor delay before applying format"
                                            hint="View-mode Auto-format / Auto-indent first switches to the editor, waits this long, then applies the formatted text — the editor visibly mounts before the change lands. 0 = apply in the same frame."
                                        >
                                            <div className="flex items-center gap-1.5">
                                                {([
                                                    {label: "0", v: 0},
                                                    {label: "10", v: 10},
                                                    {label: "50", v: 50},
                                                    {label: "250", v: 250},
                                                ] as const).map((p) => (
                                                    <button
                                                        key={p.label}
                                                        type="button"
                                                        onClick={() => update("formatSwitchDelayMs", p.v)}
                                                        className={cn(
                                                            "px-1.5 py-1 rounded border text-[10px] font-mono transition-colors",
                                                            draft.formatSwitchDelayMs === p.v
                                                                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                                                : "border-input bg-muted/40 text-muted-foreground hover:bg-muted"
                                                        )}
                                                        title={`${p.v === 0 ? "Apply in the same render batch" : `Wait ${p.v} ms after the switch, then apply`}`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={2000}
                                                    value={draft.formatSwitchDelayMs ?? 10}
                                                    onChange={(e) => {
                                                        const n = parseInt(e.target.value || "0", 10);
                                                        update("formatSwitchDelayMs", Number.isFinite(n) ? Math.min(2000, Math.max(0, n)) : 10);
                                                    }}
                                                    className="font-mono text-xs h-8 w-20"
                                                    aria-label="Switch-to-editor delay in milliseconds"
                                                />
                                                <span className="text-[10px] text-muted-foreground font-mono">ms</span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<CornerDownLeft className="size-3.5"/>}
                                            label="Final newline when formatting"
                                            hint="Auto-format md / toml / json ends with exactly one trailing newline."
                                        >
                                            <Switch
                                                checked={draft.formatFinalNewline !== false}
                                                onCheckedChange={(v) => update("formatFinalNewline", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eraser className="size-3.5"/>}
                                            label="Trim trailing whitespace on format"
                                            hint="Auto-format strips the spaces / tabs at the end of every line, for every language — leftover whitespace never survives a format. Auto-indent leaves it alone."
                                        >
                                            <Switch
                                                checked={draft.formatTrimTrailingWs !== false}
                                                onCheckedChange={(v) => update("formatTrimTrailingWs", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<ArrowUpDown className="size-3.5"/>}
                                            label="Collapse blank-line runs on format"
                                            hint="Auto-format collapses long blank-line runs down to the maximum chosen below — huge gaps shrink, intentional spacing stays. Auto-indent leaves them alone."
                                        >
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={draft.formatCollapseBlankRuns !== false}
                                                    onCheckedChange={(v) => update("formatCollapseBlankRuns", v)}
                                                />
                                                <Select
                                                    value={String(draft.formatMaxBlankLines ?? 1)}
                                                    onValueChange={(v) => update("formatMaxBlankLines", parseInt(v, 10))}
                                                    disabled={draft.formatCollapseBlankRuns === false}
                                                >
                                                    <SelectTrigger className="h-8 w-32 text-xs"
                                                                   aria-label="Max consecutive blank lines">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1" className="text-xs">Max 1 blank
                                                            line</SelectItem>
                                                        <SelectItem value="2" className="text-xs">Max 2 blank
                                                            lines</SelectItem>
                                                        <SelectItem value="3" className="text-xs">Max 3 blank
                                                            lines</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<ArrowUpFromLine className="size-3.5"/>}
                                            label="Blank lines at file start on format"
                                            hint="Auto-format strips the blank lines at the very beginning of a file (every language) so a formatted file opens on its first real line. Auto-indent leaves them alone."
                                        >
                                            <Switch
                                                checked={draft.formatTrimLeadingBlankLines !== false}
                                                onCheckedChange={(v) => update("formatTrimLeadingBlankLines", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<IndentIncrease className="size-3.5"/>}
                                            label="Indent style on format (all languages)"
                                            hint="Every Auto-format emits this indentation style — Keep follows the editor's indentation, Spaces expands leading tabs to the configured width, Tabs collapses each full width-run of leading spaces into one tab. Only the leading whitespace converts: aligned tables, TOML = columns and inline alignment survive. YAML always keeps spaces (tabs are invalid there)."
                                        >
                                            <Select
                                                value={draft.formatIndentStyle ?? "keep"}
                                                onValueChange={(v) => update("formatIndentStyle", v as "keep" | "spaces" | "tabs")}
                                            >
                                                <SelectTrigger className="h-8 w-32 text-xs"
                                                               aria-label="Indent style on format">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="keep" className="text-xs">Keep</SelectItem>
                                                    <SelectItem value="spaces" className="text-xs">Spaces</SelectItem>
                                                    <SelectItem value="tabs" className="text-xs">Tabs</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<IndentIncrease className="size-3.5"/>}
                                            label="Tab width for the indent conversion"
                                            hint="How many spaces ONE tab represents when the indent-style conversion above expands tabs or collapses space runs — the classic tab stop, independent of the formatter indent width."
                                        >
                                            <Select
                                                value={String(draft.formatTabWidth ?? 4)}
                                                onValueChange={(v) => update("formatTabWidth", parseInt(v, 10))}
                                            >
                                                <SelectTrigger className="h-8 w-20 text-xs"
                                                               aria-label="Tab width for the indent conversion">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="2" className="text-xs">2</SelectItem>
                                                    <SelectItem value="4" className="text-xs">4</SelectItem>
                                                    <SelectItem value="8" className="text-xs">8</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        {/* ─── the WRAPPING option — the "settings like
wrapping which can be useful for all languages" ask:
hard-wrap PROSE lines (Markdown paragraphs / plain
text) at the configured column on Auto-format. Code
fences, tables, headings, list markers and indented
blocks are never re-flowed. */}
                                        <SettingRow
                                            icon={<WrapText className="size-3.5"/>}
                                            label="Wrap prose lines on format"
                                            hint="Auto-format hard-wraps Markdown paragraphs and plain-text lines at the column chosen beside — words move to word boundaries, nothing is ever split mid-word. Fenced code blocks, tables, headings, list markers and indented blocks pass through untouched, and Auto-indent never wraps."
                                        >
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={draft.formatWrapProse === true}
                                                    onCheckedChange={(v) => update("formatWrapProse", v)}
                                                />
                                                <Select
                                                    value={String(draft.formatWrapColumn ?? 80)}
                                                    onValueChange={(v) => update("formatWrapColumn", parseInt(v, 10))}
                                                    disabled={draft.formatWrapProse !== true}
                                                >
                                                    <SelectTrigger className="h-8 w-24 text-xs"
                                                                   aria-label="Prose wrap column">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="60" className="text-xs">60 cols</SelectItem>
                                                        <SelectItem value="72" className="text-xs">72 cols</SelectItem>
                                                        <SelectItem value="80" className="text-xs">80 cols</SelectItem>
                                                        <SelectItem value="100" className="text-xs">100
                                                            cols</SelectItem>
                                                        <SelectItem value="120" className="text-xs">120
                                                            cols</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<MoveHorizontal className="size-3.5"/>}
                                            label="Line endings on format"
                                            hint="Auto-format normalizes every file's line endings — LF (Linux / macOS / modern Windows editors), CRLF (classic Windows), or keep each file exactly as it is. Runs as the LAST pass so every formatter's output honors it."
                                        >
                                            <Select
                                                value={draft.formatNormalizeLineEndings ?? "keep"}
                                                onValueChange={(v) =>
                                                    update("formatNormalizeLineEndings", v as "keep" | "lf" | "crlf")
                                                }
                                            >
                                                <SelectTrigger className="h-8 w-28 text-xs"
                                                               aria-label="Line endings on format">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="keep" className="text-xs">Keep as
                                                        saved</SelectItem>
                                                    <SelectItem value="lf" className="text-xs">LF (\n)</SelectItem>
                                                    <SelectItem value="crlf" className="text-xs">CRLF
                                                        (\r\n)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eraser className="size-3.5"/>}
                                            label="Hygiene skips fenced code blocks"
                                            hint="The trailing-whitespace trim and blank-run collapse NEVER touch Markdown fenced code blocks or HTML script/pre/style/textarea bodies — a sample's authored whitespace is content, not noise."
                                        >
                                            <Switch
                                                checked={draft.formatHygieneSkipFences !== false}
                                                onCheckedChange={(v) => update("formatHygieneSkipFences", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Sigma className="size-3.5"/>}
                                            label="Expand minified data files"
                                            hint="Auto-format JSON / YAML / TOML re-indents a single-line (minified) document with the configured indent width — a 4,000-character config.json expands to readable form."
                                        >
                                            <Switch
                                                checked={draft.formatDataExpandMinified !== false}
                                                onCheckedChange={(v) => update("formatDataExpandMinified", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Save className="size-3.5"/>}
                                            label="Auto-format on save (all languages)"
                                            hint="Saving (or auto-saving) a non-Python file runs its offline formatter first — a messy .css / .ts / .md / .m file lands tidy. Python keeps its own black switch (Editor ▸ Auto-format on save); each language block below can force its own on/off."
                                        >
                                            <Switch
                                                checked={draft.formatAutoSaveAll === true}
                                                onCheckedChange={(v) => update("formatAutoSaveAll", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ── LANGUAGE RUNTIMES — the detection panel, merged INTO the
                Formatting tab: the languages and their formatting live
                on ONE tab. Every runtime row carries the per-language
                intro subtitle + live version + install hints; the
                per-language blocks further down hold each language's
                options. This section renders FLAT (no nested
                space-y-3 section) so the TabsContent's dividers +
                spacing never stack on each other. ── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Languages className="size-3"/>
                                            Language runtimes — installed &amp; detected
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            Python is the primary language (full pipeline: figures, variables, coverage,
                                            lint,
                                            tests) — its settings live in the Python tab. Every language below runs
                                            through its
                                            own interpreter: Run works out of the box when one is installed, and shows
                                            an
                                            install hint when it is not. Create a file in any of them (New Example ▸
                                            ships
                                            runnable files for every group) and press Run to test the runtime.
                                        </p>
                                        <div className="space-y-1.5">
                                            {(runtimeStatuses ?? []).map((rt) => (
                                                <div
                                                    key={rt.id}
                                                    className="rounded-md border px-2.5 py-1.5 text-xs"
                                                    title={rt.ok ? `${rt.command} — ${rt.version}` : rt.installHint}
                                                >
                                                    <div className="flex items-center gap-2">
                    <span
                        className={
                            "size-2 shrink-0 rounded-full " +
                            (rt.ok ? "bg-emerald-500" : "bg-muted-foreground/30")
                        }
                    />
                                                        <span
                                                            className="min-w-0 flex-1 truncate font-medium">{rt.label}</span>
                                                        <span
                                                            className={
                                                                "shrink-0 font-mono text-[10px] " +
                                                                (rt.ok ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")
                                                            }
                                                        >
                      {rt.ok ? rt.version || "found" : "not found"}
                    </span>
                                                    </div>
                                                    {/* the per-language intro subtitles — one very small
                      line under each language the runtime covers. */}
                                                    <div className="mt-1 space-y-0.5 pl-4">
                                                        {rt.languages.map((lang) => (
                                                            <p key={lang}
                                                               className="text-[10px] leading-snug text-muted-foreground">
                                                                <span
                                                                    className="font-semibold text-foreground/80">{lang}</span>
                                                                {" — "}
                                                                {LANGUAGE_INTROS[lang] ?? `runs through ${rt.command}.`}
                                                            </p>
                                                        ))}
                                                    </div>
                                                    {!rt.ok && (
                                                        <p className="mt-1 pl-4 text-[10px] leading-snug text-amber-600 dark:text-amber-400">
                                                            {rt.installHint}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                            {(!runtimeStatuses || runtimeStatuses.length === 0) && (
                                                <p className="text-[11px] italic text-muted-foreground">
                                                    Detecting runtimes… (Run still works — a missing runtime shows its
                                                    install hint
                                                    when you try to run the file.)
                                                </p>
                                            )}
                                        </div>
                                        {onRefreshRuntimes && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1.5 text-xs"
                                                onClick={onRefreshRuntimes}
                                                disabled={runtimeRefreshBusy === true}
                                                title="Re-detect every installed runtime from scratch (node / MATLAB / Octave / R / java / gcc / lua / rustc / julia / …) — bypasses the cached result"
                                            >
                                                {runtimeRefreshBusy ? (
                                                    <Loader2 className="size-3.5 animate-spin"/>
                                                ) : (
                                                    <RefreshCw className="size-3.5"/>
                                                )}
                                                {runtimeRefreshBusy ? "Detecting…" : "Check again"}
                                            </Button>
                                        )}
                                    </section>

                                    {/* ── 2. PYTHON — its own block (its interpreter & run settings
                live in the Python tab; the other language blocks
                follow, each starting with the language itself). ── */}
                                    <section className="space-y-2.5">
                                        <div className="flex items-center gap-2">
              <span
                  className={"size-2 shrink-0 rounded-full " + (pythonEnvOk ? "bg-emerald-500" : "bg-muted-foreground/30")}
                  title={pythonEnvOk ? "The Python interpreter detected" : "No Python interpreter detected — the built-in fallback formatter covers .py files"}
              />
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">Python</h3>
                                        </div>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            {LANGUAGE_INTROS.python} Auto-format runs black / ruff through the real
                                            pipeline
                                            (Edit ▸ Format document, save-time formatting, notebook cells) with the
                                            built-in
                                            fallback (block re-indent + hygiene) when neither is installed; interpreter
                                            and run
                                            settings live in the Python tab.
                                        </p>
                                        <SettingRow
                                            icon={<FileCode2 className="size-3.5"/>}
                                            label="Python quote style on format"
                                            hint={'Auto-format normalizes string-literal quotes for .py files and notebook code cells — x = \'a\' → x = "a" (black-compatible, ON by default) or the reverse, only when the body needs no re-escaping. Docstrings (triple-quoted) and comments always stay untouched.'}
                                        >
                                            <Select
                                                value={draft.formatPyQuoteStyle ?? "double"}
                                                onValueChange={(v) =>
                                                    update("formatPyQuoteStyle", v as "keep" | "double" | "single")
                                                }
                                            >
                                                <SelectTrigger className="h-8 w-28 text-xs"
                                                               aria-label="Python quote style on format">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="keep" className="text-xs">Keep as
                                                        typed</SelectItem>
                                                    <SelectItem value="double" className="text-xs">' → "
                                                        (double)</SelectItem>
                                                    <SelectItem value="single" className="text-xs">" → '
                                                        (single)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Braces className="size-3.5"/>}
                                            label="Python: space after commas"
                                            hint="Auto-format ensures exactly one space after every comma in calls / lists / tuples / dicts — f(a,b) → f(a, b). Tuple singletons (x,) and multi-line continuation commas keep their layout. Strings and comments are never touched."
                                        >
                                            <Switch
                                                checked={draft.formatPySpaceAfterComma !== false}
                                                onCheckedChange={(v) => update("formatPySpaceAfterComma", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Braces className="size-3.5"/>}
                                            label="Python: True / False / None casing"
                                            hint="Auto-format corrects true/false/none and TRUE/FALSE/NONE in CODE to Python's True / False / None (black enforces this too — the built-in fallback now matches). Words inside strings and comments are never touched."
                                        >
                                            <Switch
                                                checked={draft.formatPyNormalizeBooleans !== false}
                                                onCheckedChange={(v) => update("formatPyNormalizeBooleans", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ── 3. EVERY OTHER LANGUAGE — one section per language:
                the language first (name, one-line intro, detected
                runtime version with the green/gray dot exactly like
                the Languages tab), then EVERY option that applies to
                it — its indent width, its save-time behavior, and the
                language-specific passes ("merge languages and
                formatting so it begins by the language (other than
                python) and is followed by name/title, description,
                version, green/grayish color as in languages, then all
                the allowed and available options that can be applied
                to that language"). ── */}
                                    {LANG_FORMAT_BLOCKS.map((block) => {
                                        const rt = block.language
                                            ? runtimeStatuses?.find((r) => r.languages.includes(block.language as string)) ?? null
                                            : null;
                                        const currentIndent = draft.formatLangIndent?.[block.kind] ?? 0;
                                        const saveMode = draft.formatLangAutoSave?.[block.kind];
                                        const saveValue = saveMode === undefined ? "default" : saveMode ? "on" : "off";
                                        return (
                                            // id-anchored for the A–Z jump strip — the
                                            // scroll margin clears the pinned strip so the target
                                            // heading lands below it, not underneath.
                                            <section key={block.kind} id={`fmt-lang-${block.kind}`}
                                                     className="space-y-2.5 scroll-mt-12">
                                                <div className="flex items-center gap-2">
                  <span
                      className={
                          "size-2 shrink-0 rounded-full " +
                          (rt?.ok ? "bg-emerald-500" : "bg-muted-foreground/30")
                      }
                      title={
                          rt
                              ? rt.ok
                                  ? `${rt.command ?? rt.label} — ${rt.version ?? "found"}`
                                  : rt.installHint ?? "not found"
                              : block.kind === "graphql"
                                  ? "A QUERY language — it highlights, edits and formats offline, but there is no interpreter to run"
                                  : "Formats offline — no runtime needed"
                      }
                  />
                                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                                        {block.title}
                                                    </h3>
                                                    {rt && (
                                                        <span
                                                            className={
                                                                "font-mono text-[10px] " +
                                                                (rt.ok ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")
                                                            }
                                                            title={rt.ok ? `${rt.command ?? rt.label} — ${rt.version}` : rt.installHint}
                                                        >
                      {rt.ok ? rt.version || "found" : "not found"}
                    </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                                    {block.intro}
                                                </p>
                                                <p className="text-[11px] leading-relaxed text-muted-foreground/75">
                                                    <span
                                                        className="font-medium text-foreground/70">Auto-format:</span>{" "}
                                                    {block.conventions}
                                                </p>
                                                <div
                                                    className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-muted/20 px-2.5 py-2">
                                                    <label className="flex items-center gap-1.5 text-xs"
                                                           title={`${block.title} formatter indent width — Default follows the global formatter width`}>
                                                        <span className="text-muted-foreground">Indent width</span>
                                                        <select
                                                            className="h-7 rounded-md border bg-background px-1 text-xs"
                                                            aria-label={`${block.title} indent width`}
                                                            value={String(currentIndent)}
                                                            onChange={(e) => {
                                                                const v = parseInt(e.target.value, 10);
                                                                const next = {...(draft.formatLangIndent ?? {})};
                                                                if (v > 0) next[block.kind] = v;
                                                                else delete next[block.kind];
                                                                update("formatLangIndent", next);
                                                            }}
                                                        >
                                                            <option value="0">Default</option>
                                                            <option value="2">2</option>
                                                            <option value="4">4</option>
                                                            <option value="8">8</option>
                                                        </select>
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-xs"
                                                           title={`${block.title} format-on-save — Default follows the global switch`}>
                                                        <span className="text-muted-foreground">Format on save</span>
                                                        <select
                                                            className="h-7 rounded-md border bg-background px-1 text-xs"
                                                            aria-label={`${block.title} format on save`}
                                                            value={saveValue}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                const next = {...(draft.formatLangAutoSave ?? {})};
                                                                if (v === "on") next[block.kind] = true;
                                                                else if (v === "off") next[block.kind] = false;
                                                                else delete next[block.kind];
                                                                update("formatLangAutoSave", next);
                                                            }}
                                                        >
                                                            <option value="default">Default</option>
                                                            <option value="on">On</option>
                                                            <option value="off">Off</option>
                                                        </select>
                                                    </label>
                                                </div>
                                                {block.extra}
                                            </section>
                                        );
                                    })}
                                </TabsContent>
                                <TabsContent value="python"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Terminal className="size-3"/>
                                            Python runtime
                                        </h3>
                                        <SettingRow
                                            icon={<Terminal className="size-3.5"/>}
                                            label="Python interpreter"
                                            hint="Select a discovered environment, browse for a custom one, or leave on auto-detect."
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <Select
                                                    value={draft.pythonInterpreter || "__auto__"}
                                                    onValueChange={(v) =>
                                                        update("pythonInterpreter", v === "__auto__" ? "" : v)
                                                    }
                                                >
                                                    <SelectTrigger className="h-8 w-48 text-xs font-mono">
                                                        <SelectValue placeholder="Auto-detect"/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__auto__" className="text-xs">
                                                            Auto-detect (best available)
                                                        </SelectItem>
                                                        {discoveredEnvs.map((env) => (
                                                            <SelectItem
                                                                key={env.path}
                                                                value={env.path}
                                                                className="text-xs font-mono"
                                                            >
                        <span className="flex items-center gap-1.5">
                          {env.hasScientificStack ? (
                              <CircleCheck className="size-3 text-emerald-500"/>
                          ) : (
                              <CircleX className="size-3 text-muted-foreground"/>
                          )}
                            <span className="truncate">{env.label}</span>
                            {env.version && (
                                <span className="text-[10px] text-muted-foreground">
                              v{env.version}
                            </span>
                            )}
                        </span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {/* No "Browse for interpreter" file input here —
File.path is an Electron-only extension and is
`undefined` in Chrome/Firefox/Safari, so the
button was silently setting pythonInterpreter to
the string "undefined". Users who want a custom
interpreter should pick it from the dropdown
(populated by /api/envs) or type the path into the
manual override Input below. */}
                                                {draft.pythonInterpreter && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2 text-xs"
                                                        onClick={() => update("pythonInterpreter", "")}
                                                        title="Reset to auto-detect"
                                                    >
                                                        Clear
                                                    </Button>
                                                )}
                                            </div>
                                        </SettingRow>
                                        {/* Per-folder virtualenv creator. Spins up a
                fresh `.venv/<folder-name>/` via `<interpreter> -m venv`
                (handled by the /api/create-venv route) so each folder
                can have isolated dependencies. On success the
                interpreter dropdown is auto-switched to the new venv's
                python binary. Disabled when no folder is selected. */}
                                        <SettingRow
                                            icon={<Package className="size-3.5"/>}
                                            label="Create virtualenv for current folder"
                                            hint={
                                                currentFolderSlug
                                                    ? `Creates .venv/${currentFolderSlug}/ using the selected interpreter, then switches to it.`
                                                    : "Select a folder in the sidebar first to enable per-folder venv creation."
                                            }
                                        >
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={handleCreateVenv}
                                                disabled={!currentFolderSlug || creatingVenv}
                                                title={
                                                    currentFolderSlug
                                                        ? "Create a fresh virtualenv under .venv/<folder-name>/"
                                                        : "Select a folder first"
                                                }
                                            >
                                                {creatingVenv ? (
                                                    <>
                                                        <Loader2 className="size-3.5 animate-spin"/>
                                                        Creating…
                                                    </>
                                                ) : (
                                                    <>
                                                        <Package className="size-3.5"/>
                                                        Create Venv
                                                    </>
                                                )}
                                            </Button>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Run timeout (seconds)"
                                        >
                                            <Input
                                                type="number"
                                                min={5}
                                                max={600}
                                                value={draft.runTimeoutSeconds}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "60", 10);
                                                    update("runTimeoutSeconds", Number.isFinite(n) ? Math.max(1, n) : 60);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        {/* interactive stdin — keep the script's
                stdin open so input() prompts can be answered LIVE from
                the Output panel while the run streams. */}
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Interactive stdin"
                                            hint={"Runs keep their stdin open, so an input() prompt can be answered from the \"stdin ▸\" row at the bottom of the Output panel while the script streams. The EOF button closes it. Off = stdin closes at spawn (scripts that call input() without pre-supplied stdin fail fast, like python file.py < /dev/null)."}
                                        >
                                            <Switch
                                                checked={draft.interactiveStdin}
                                                onCheckedChange={(v) => update("interactiveStdin", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Max output bytes per run"
                                        >
                                            <Input
                                                type="number"
                                                min={10000}
                                                value={draft.maxOutputBytes}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "2000000", 10);
                                                    update("maxOutputBytes", Number.isFinite(n) ? Math.max(1024, n) : 2_000_000);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Terminal className="size-3.5"/>}
                                                    label="Confirm before Run All">
                                            <Switch
                                                checked={draft.confirmRunAll}
                                                onCheckedChange={(v) => update("confirmRunAll", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Run-duration warning threshold (seconds)"
                                            hint="Before each run, Praxis estimates how long the script will take (from history + static analysis). If the estimate exceeds this many seconds, a confirmation dialog is shown. 0 = never warn."
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                value={draft.runDurationWarningThreshold}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update("runDurationWarningThreshold", Number.isFinite(n) ? Math.max(0, n) : 0);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        {/* ─── browser notifications when a run
                finishes — “alarm me if code is completed while I am
                not in the tab”. */}
                                        <SettingRow
                                            icon={<Bell className="size-3.5"/>}
                                            label="Browser notification when a run finishes"
                                            hint="off = never · only when hidden = notify when the IDE tab is in the background (the typical ask) · always = notify even while looking at the IDE"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={draft.runNotifyMode}
                                                    onValueChange={(v) => update("runNotifyMode", v as Settings["runNotifyMode"])}
                                                >
                                                    <SelectTrigger className="h-8 w-44 text-xs">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="off" className="text-xs">Off</SelectItem>
                                                        <SelectItem value="hidden" className="text-xs">Only when tab is
                                                            hidden</SelectItem>
                                                        <SelectItem value="always"
                                                                    className="text-xs">Always</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 text-xs shrink-0"
                                                    disabled={notifyPerm === "granted" || notifyPerm === "unsupported"}
                                                    onClick={async () => {
                                                        const p = await requestRunNotifyPermission();
                                                        setNotifyPerm(p);
                                                        if (p === "granted") {
                                                            toast({
                                                                title: "Notifications enabled",
                                                                description: "Praxis can now alert you when runs finish."
                                                            });
                                                        } else if (p === "denied") {
                                                            toast({
                                                                title: "Notifications blocked",
                                                                description: "Allow notifications for this site in the browser's site settings.",
                                                                variant: "destructive"
                                                            });
                                                        }
                                                    }}
                                                >
                                                    {notifyPerm === "granted" ? "Permission granted" : notifyPerm === "denied" ? "Permission denied" : "Enable notifications"}
                                                </Button>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Bell className="size-3.5"/>}
                                            label="Notify on failed / stopped runs too"
                                            hint="When off, only successful runs trigger a notification."
                                        >
                                            <Switch
                                                checked={draft.runNotifyOnFailure}
                                                onCheckedChange={(v) => update("runNotifyOnFailure", v)}
                                            />
                                        </SettingRow>
                                        {/* ─── the completion chime — same gating as
                the notification but needs NO browser permission (pure
                Web Audio), so it works even with notifications denied. */}
                                        <SettingRow
                                            icon={<Volume2 className="size-3.5"/>}
                                            label="Play a chime when a run finishes"
                                            hint="A soft two-note sound under the same visibility/failure rules as the notification — success rises (E5→A5), failure falls (E4→C4). Works even when browser notifications are blocked."
                                        >
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={draft.runNotifySound}
                                                    onCheckedChange={(v) => update("runNotifySound", v)}
                                                />
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    step={5}
                                                    aria-label="Chime volume"
                                                    value={draft.runNotifyVolume}
                                                    onChange={(e) => update("runNotifyVolume", parseInt(e.target.value, 10))}
                                                    disabled={!draft.runNotifySound}
                                                    className="w-28 accent-primary"
                                                />
                                                <span
                                                    className="text-[10px] font-mono text-muted-foreground w-8 text-right">{draft.runNotifyVolume}%</span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[10px] shrink-0 px-2"
                                                    disabled={!draft.runNotifySound}
                                                    onClick={() => playRunChime({
                                                        fileName: "preview.py",
                                                        ok: true,
                                                        killed: false,
                                                        durationMs: 1200
                                                    }, {force: true})}
                                                    title="Preview the chime at the current volume"
                                                >
                                                    Test
                                                </Button>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Terminal className="size-3.5"/>}
                                            label="Auto-run on file change"
                                            hint="When enabled, the current script re-runs automatically when it changes on disk (requires a watcher connection)."
                                        >
                                            <Switch
                                                checked={draft.autoRunOnFileChange}
                                                onCheckedChange={(v) => update("autoRunOnFileChange", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ─── OTHER LANGUAGE RUNTIMES pointer (the "why there
is Other Language Runtimes in Python tab?" — the panel
itself now lives in the Formatting tab). The Python tab
keeps only this compact pointer — Python settings stay
about Python. ─────────────────────────────────────── */}
                                    <section className="space-y-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Languages className="size-3"/>
                                            Other language runtimes
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            Every non-Python language (JavaScript, TypeScript, MATLAB, R, shell, Java,
                                            C, C++,
                                            Ruby, PHP, Go, Lua, Perl, Rust, Julia, Kotlin, Swift, PowerShell, Batch,
                                            Zig, Dart,
                                            Groovy, Scala, Elixir, Haskell, Erlang, Clojure, OCaml, F#, GraphQL) lives
                                            in the
                                            Formatting tab — the runtime detection panel with a one-line intro per
                                            language plus
                                            each language&apos;s own formatting options —{" "}
                                            <button
                                                type="button"
                                                className="font-medium text-emerald-600 underline underline-offset-2 hover:opacity-80 dark:text-emerald-400"
                                                onClick={() => {
                                                    // DIRECT tab switch (the Tabs are controlled — this
                                                    // always lands, even if a stale radix trigger mount
                                                    // missed the click), then scroll the Formatting
                                                    // trigger into view inside the one-row strip (the
                                                    // user's "this link should direct me to the
                                                    // formatting tab").
                                                    setTab("formatting");
                                                    const el = document.querySelector("[data-settings-tab='formatting']") as HTMLElement | null;
                                                    el?.scrollIntoView({
                                                        block: "nearest",
                                                        inline: "center",
                                                        behavior: "smooth"
                                                    });
                                                }}
                                            >
                                                open the Formatting tab
                                            </button>
                                            .
                                        </p>
                                    </section>

                                    {/* ── Type checking power mode ───────────────────────── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <ShieldCheck className="size-3"/>
                                            Type checking
                                        </h3>
                                        <SettingRow
                                            icon={<ShieldCheck className="size-3.5"/>}
                                            label="Type checking power mode"
                                            hint="Beyond the bare mypy pass: type inlay hints in the editor, quick-fixes in Problems, and strictness profiles."
                                        >
                                            <Switch
                                                checked={draft.typeCheckEnabled !== false}
                                                onCheckedChange={(v) => update("typeCheckEnabled", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Gauge className="size-3.5"/>}
                                            label="Strictness profile"
                                            hint="loose ignores missing imports; standard is the mypy default; strict enables --strict."
                                        >
                                            <Select
                                                value={draft.typeCheckProfile ?? "standard"}
                                                onValueChange={(v) => update("typeCheckProfile", v as "loose" | "standard" | "strict")}
                                            >
                                                <SelectTrigger className="h-7 w-36 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="loose">loose</SelectItem>
                                                    <SelectItem value="standard">standard</SelectItem>
                                                    <SelectItem value="strict">strict</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Zap className="size-3.5"/>}
                                            label="Mypy daemon (dmypy)"
                                            hint="Re-checks take milliseconds instead of a cold run; falls back to plain mypy when the daemon is unavailable."
                                        >
                                            <Switch
                                                checked={draft.typeCheckDaemon !== false}
                                                onCheckedChange={(v) => update("typeCheckDaemon", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ── Profiling ───────────────────────────────────────── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Gauge className="size-3"/>
                                            Profiling
                                        </h3>
                                        <SettingRow
                                            icon={<Gauge className="size-3.5"/>}
                                            label="Profiler mode"
                                            hint="What Run ▸ Line & Memory Profile records. The gutter heat strip shows per-line timing; tracemalloc adds per-function memory deltas."
                                        >
                                            <Select
                                                value={draft.profilerMode ?? "both"}
                                                onValueChange={(v) => update("profilerMode", v as "line" | "memory" | "both")}
                                            >
                                                <SelectTrigger className="h-7 w-36 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="line">line timing</SelectItem>
                                                    <SelectItem value="memory">memory</SelectItem>
                                                    <SelectItem value="both">both</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                    </section>

                                    {/* ── Docstrings ──────────────────────────────────────── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <BookOpen className="size-3"/>
                                            Docstrings
                                        </h3>
                                        <SettingRow
                                            icon={<BookOpen className="size-3.5"/>}
                                            label="Docstring style"
                                            hint="The style the Docstring Studio generates and repairs."
                                        >
                                            <Select
                                                value={draft.docstringStyle ?? "google"}
                                                onValueChange={(v) => update("docstringStyle", v as "google" | "numpy" | "sphinx")}
                                            >
                                                <SelectTrigger className="h-7 w-36 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="google">Google</SelectItem>
                                                    <SelectItem value="numpy">NumPy</SelectItem>
                                                    <SelectItem value="sphinx">Sphinx</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                    </section>

                                    {/* ── Testing ─────────────────────────────────────────── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <FlaskConical className="size-3"/>
                                            Testing
                                        </h3>
                                        <SettingRow
                                            icon={<FlaskConical className="size-3.5"/>}
                                            label="Branch coverage"
                                            hint="Run with Coverage also lists the main file's UNEXECUTED branch-decision lines (if / elif / while / for / except / case) in the Coverage tab — clickable jumps."
                                        >
                                            <Switch
                                                checked={draft.coverageBranch === true}
                                                onCheckedChange={(v) => update("coverageBranch", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Percent className="size-3.5"/>}
                                            label="Coverage fail-under threshold"
                                            hint="The Coverage tab computes the run file's statement % and turns it red (with a jump-to-first-uncovered link) below this percent. 0 = off."
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={String(draft.coverageFailUnder ?? 0)}
                                                onChange={(e) => update("coverageFailUnder", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                                className="h-7 w-20 text-xs"
                                                aria-label="Coverage fail-under percent"
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<FlaskConical className="size-3.5"/>}
                                            label="Property-based tests (Hypothesis)"
                                            hint="The Property section in the Tests panel: scaffold strategies from signatures, run with shrink sequences, promote counterexamples to regression tests."
                                        >
                                            <Switch
                                                checked={draft.hypothesisEnabled !== false}
                                                onCheckedChange={(v) => update("hypothesisEnabled", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<GraduationCap className="size-3.5"/>}
                                            label="Tutor view suggestions"
                                            hint="Auto-suggest Run with Tutor View when opening files in Getting Started folders."
                                        >
                                            <Switch
                                                checked={draft.tutorViewSuggestions !== false}
                                                onCheckedChange={(v) => update("tutorViewSuggestions", v)}
                                            />
                                        </SettingRow>
                                    </section>
                                </TabsContent>

                                {/* Capture section */}
                                <TabsContent value="capture"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    {/* ── CAPTURE TAB SPLIT "Capture" used to mean two
              unrelated things in one tab — Python RUN capture (the
              Vars / DataFrames / Coverage tabs a run grows) and the
              SCREENSHOT camera. The tab now carries TWO clearly-labeled
              sections; every screenshot entry uses the word
              "Screenshot" so the two families never blur again.
              The Python side was also SIMPLIFIED from the dense
              three-level model (preset chips + toggles + a live
              summary) to PLAIN TOGGLES — the one-off presets live in
              the per-run Capture picker where they belong. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Database className="size-3"/>
                                            Python Run Capture
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            Every Python run can capture extra artifacts and show them as tabs in the
                                            Output panel below the editor. Pick what the <strong>default</strong> run
                                            captures here — the per-run <strong>Capture picker</strong> in the
                                            run-input strip below the editor tabs (with Stdin / Args / Env, for Python
                                            files) can still override any of the three for one run only, with its own
                                            presets and a Make-default button.
                                        </p>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Inspect variables at exit"
                                            hint="After a run finishes, the Output panel grows a Vars tab — the final value of every variable in the script's __main__ namespace."
                                        >
                                            <Switch
                                                checked={draft.inspectVariables}
                                                onCheckedChange={(v) => update("inspectVariables", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Database className="size-3.5"/>}
                                            label="Capture DataFrames (pandas HTML repr)"
                                            hint="pandas variables render as styled HTML tables in the Output panel's DataFrames tab — the exact to_html() view, no extra code needed in the script."
                                        >
                                            <Switch
                                                checked={draft.captureDataframes}
                                                onCheckedChange={(v) => update("captureDataframes", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Crosshair className="size-3.5"/>}
                                            label="Trace code coverage (slower)"
                                            hint="Every run traces which lines executed and the Output panel grows a Coverage tab with the line-by-line report. Adds overhead to each run — the per-run Capture picker in the run-input strip is the better place for one-off coverage."
                                        >
                                            <Switch
                                                checked={draft.traceCoverage}
                                                onCheckedChange={(v) => update("traceCoverage", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ── SCREENSHOT CAPTURE — the top-right camera quick-action's
three capture kinds, plain rows + one Make Default button
per kind (writes the defaultCaptureMode setting the
camera button reads), plus the storage defaults (DPI +
file extension) the Screenshot Studio modal seeds from.
Labels all use the word "Screenshot". */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Camera className="size-3"/>
                                            Screenshot Capture
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            The screenshot camera in the header's top-right action cluster (next to
                                            Run) is a split button — the camera itself fires the DEFAULT capture kind
                                            picked here, and the small chevron next to it opens a mode picker for
                                            one-off kinds (a check marks the default). Each capture opens the
                                            Screenshot Studio with the shot already firing (Save To File / Download /
                                            Copy there).
                                        </p>
                                        {([
                                            {
                                                mode: "window" as const,
                                                icon: <Camera className="size-3.5"/>,
                                                label: "Screenshot of the IDE window",
                                                hint: "The IDE's own workspace region, rasterized from the live DOM — the capture stays inside the app (no OS window picker).",
                                            },
                                            {
                                                mode: "code" as const,
                                                icon: <FileCode2 className="size-3.5"/>,
                                                label: "Screenshot of the whole file",
                                                hint: "Render the ENTIRE open file into a single PNG — filename header, line numbers, syntax-tinted.",
                                            },
                                            {
                                                mode: "selection" as const,
                                                icon: <Crosshair className="size-3.5"/>,
                                                label: "Screenshot of a dragged region",
                                                hint: "Freeze the IDE, drag a scissors-style rectangle over the frame, snip exactly that region — fully internal, never the PC screen.",
                                            },
                                        ]).map((row) => {
                                            const active = (draft.defaultCaptureMode ?? "window") === row.mode;
                                            return (
                                                <SettingRow key={row.mode} icon={row.icon} label={row.label}
                                                            hint={row.hint}>
                                                    <Button
                                                        variant={active ? "default" : "outline"}
                                                        size="sm"
                                                        className="h-7 gap-1 px-2 text-[10px]"
                                                        onClick={() => update("defaultCaptureMode", row.mode)}
                                                        disabled={active}
                                                        title={
                                                            active
                                                                ? "This is the camera button's default capture kind"
                                                                : "Make this the camera button's default capture kind (the dropdown still allows one-off picks)"
                                                        }
                                                    >
                                                        {active && <CircleCheck className="size-3 shrink-0"/>}
                                                        {active ? "Default" : "Make Default"}
                                                    </Button>
                                                </SettingRow>
                                            );
                                        })}
                                        {/* screenshot THEME — the palette of rendered code shots: a
                full named-palette registry (One Dark, One Light, Nord,
                Monokai, Dracula, Gruvbox, Solarized, GitHub, Tokyo
                Night, Rosé Pine, High Contrast…) + Auto. The composer's
                Theme picker overrides per shot and remembers it. */}
                                        <SettingRow
                                            icon={<Palette className="size-3.5"/>}
                                            label="Screenshot theme"
                                            hint="Palette of rendered code screenshots — Auto follows the app theme at shot time; every named palette is also selectable live in the Screenshot Composer"
                                        >
                                            <Select
                                                value={(() => {
                                                    const v = draft.shotTheme ?? "auto";
                                                    if (v === "light") return "one-light";
                                                    if (v === "dark") return "one-dark";
                                                    return v;
                                                })()}
                                                onValueChange={(v) => update("shotTheme", v)}
                                            >
                                                <SelectTrigger className="h-8 w-44 text-xs"
                                                               aria-label="Screenshot theme">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent className="max-h-72">
                                                    <SelectItem value="auto" className="text-xs">
                                                        Auto — follow the app theme
                                                    </SelectItem>
                                                    {SHOT_PALETTES.map((p) => (
                                                        <SelectItem key={p.id} value={p.id} className="text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span
                            className="inline-block size-3 rounded-sm border border-foreground/10"
                            style={{backgroundColor: p.palette.bg}}
                            aria-hidden="true"
                        />
                          {p.label}
                      </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        {/* JPEG / WebP quality — the lossy-encode knob (PNG ignores). */}
                                        <SettingRow
                                            icon={<Crop className="size-3.5"/>}
                                            label="Screenshot image quality"
                                            hint="JPEG / WebP encode quality for saved screenshots (PNG is lossless and ignores this). Lower = smaller files, higher = crisper text."
                                        >
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="range"
                                                    min={50}
                                                    max={100}
                                                    step={1}
                                                    value={Math.round((draft.shotImageQuality ?? 0.92) * 100)}
                                                    onChange={(e) => update("shotImageQuality", parseInt(e.target.value, 10) / 100)}
                                                    className="w-28 h-7 p-0 acc-[color:var(--primary)]"
                                                    aria-label="Screenshot image quality percent"
                                                />
                                                <span className="text-xs tabular-nums w-10 text-right">
                  {Math.round((draft.shotImageQuality ?? 0.92) * 100)}%
                </span>
                                            </div>
                                        </SettingRow>
                                        {/* storage defaults — the Screenshot Studio modal reads these on
                every open and can override them per capture. */}
                                        <SettingRow
                                            icon={<Crop className="size-3.5"/>}
                                            label="Screenshot storage DPI"
                                            hint="Pixel density of saved screenshots — 300 DPI (default) stores the image at ≈3.1× the on-screen pixels and embeds the density in PNG / JPEG exports"
                                        >
                                            <Select
                                                value={String(draft.screenshotDpi ?? 300)}
                                                onValueChange={(v) => update("screenshotDpi", parseInt(v, 10))}
                                            >
                                                <SelectTrigger className="h-8 w-36 text-xs"
                                                               aria-label="Screenshot storage DPI">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {/* Ten DPI levels — the common print/retina steps
                      between 96 and 300 included (120 · 144 · 220 ·
                      400); 300 stays the default. */}
                                                    {[72, 96, 120, 144, 192, 220, 300, 400, 600].map((d) => (
                                                        <SelectItem key={d} value={String(d)} className="text-xs">
                                                            {d} DPI{d === 300 ? " · default" : ""}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<FileImage className="size-3.5"/>}
                                            label="Screenshot file extension"
                                            hint="Format of saved / downloaded screenshots (.png lossless · .jpg smaller · .webp smallest); the clipboard always pastes PNG"
                                        >
                                            <Select
                                                value={draft.screenshotFormat ?? "png"}
                                                onValueChange={(v) => update("screenshotFormat", v as "png" | "jpeg" | "webp")}
                                            >
                                                <SelectTrigger className="h-8 w-28 text-xs"
                                                               aria-label="Screenshot file extension">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="png" className="text-xs">.png —
                                                        lossless</SelectItem>
                                                    <SelectItem value="jpeg" className="text-xs">.jpg —
                                                        smaller</SelectItem>
                                                    <SelectItem value="webp" className="text-xs">.webp —
                                                        smallest</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                    </section>
                                </TabsContent>

                                {/* Media tab — slideshow timing + gallery
              behavior. The values feed the data-file-browser gallery
              preview and the image toolbox slideshow (settings.ts
              store keys slideshow*). */}
                                <TabsContent value="media"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Images className="size-3"/>
                                            Slideshow
                                        </h3>
                                        <SettingRow icon={<TimerIcon className="size-3.5"/>} label="Seconds per image"
                                                    hint="How long each image stays on screen (1–60 s)">
                                            <Select
                                                value={String(draft.slideshowIntervalSeconds ?? 3)}
                                                onValueChange={(v) => update("slideshowIntervalSeconds", parseInt(v, 10))}
                                            >
                                                <SelectTrigger className="h-8 w-20 text-xs"
                                                               aria-label="Seconds per image">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {[1, 2, 3, 4, 5, 8, 10, 15, 30, 60].map((n) => (
                                                        <SelectItem key={n} value={String(n)}
                                                                    className="text-xs">{n}s</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow icon={<Wand2 className="size-3.5"/>} label="Transition"
                                                    hint="Animation between two slideshow images">
                                            <Select
                                                value={draft.slideshowTransition ?? "fade"}
                                                onValueChange={(v) => update("slideshowTransition", v as "none" | "fade" | "slide")}
                                            >
                                                <SelectTrigger className="h-8 w-28 text-xs"
                                                               aria-label="Slideshow transition">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none" className="text-xs">None</SelectItem>
                                                    <SelectItem value="fade" className="text-xs">Fade</SelectItem>
                                                    <SelectItem value="slide" className="text-xs">Slide</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow icon={<Repeat className="size-3.5"/>} label="Loop"
                                                    hint="Restart from the first image after the last one; off = stop at the end">
                                            <Switch
                                                checked={draft.slideshowLoop !== false}
                                                onCheckedChange={(v) => update("slideshowLoop", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Play className="size-3.5"/>} label="Auto-start"
                                                    hint="Begin playing when the media gallery opens">
                                            <Switch
                                                checked={draft.slideshowAutoStart === true}
                                                onCheckedChange={(v) => update("slideshowAutoStart", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* media PLAYBACK defaults — applied by the media
              tools (video + audio) when a file opens; manual changes
              during playback still win afterwards. The TabsContent
              class chain above draws the section divider automatically
              (`[&>section+section]:mt-5 border-t pt-4`). */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Gauge className="size-3"/>
                                            Playback defaults
                                        </h3>
                                        <SettingRow icon={<Gauge className="size-3.5"/>} label="Playback rate"
                                                    hint="Applied when a video / audio file opens (0.25–4×)">
                                            <Select
                                                value={String(draft.mediaDefaultPlaybackRate ?? 1)}
                                                onValueChange={(v) => update("mediaDefaultPlaybackRate", parseFloat(v))}
                                            >
                                                <SelectTrigger className="h-8 w-20 text-xs"
                                                               aria-label="Default playback rate">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {[0.25, 0.5, 1, 1.5, 2, 3, 4].map((r) => (
                                                        <SelectItem key={r} value={String(r)}
                                                                    className="text-xs">{r}×</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow icon={<Play className="size-3.5"/>} label="Autoplay"
                                                    hint="Start playing automatically when a media file opens (the browser may refuse unmuted autoplay)">
                                            <Switch
                                                checked={draft.mediaAutoplay === true}
                                                onCheckedChange={(v) => update("mediaAutoplay", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Volume2 className="size-3.5"/>} label="Default volume"
                                                    hint="Initial volume for the media player (0–100%)">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    step={5}
                                                    aria-label="Default media volume"
                                                    value={draft.mediaDefaultVolume ?? 100}
                                                    onChange={(e) => update("mediaDefaultVolume", parseInt(e.target.value, 10))}
                                                    className="w-28 accent-primary"
                                                />
                                                <span
                                                    className="text-[10px] font-mono text-muted-foreground w-8 text-right">{draft.mediaDefaultVolume ?? 100}%</span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow icon={<Repeat className="size-3.5"/>} label="Loop by default"
                                                    hint="Turn on Repeat (loop the current media) when a file opens">
                                            <Switch
                                                checked={draft.mediaLoopByDefault === true}
                                                onCheckedChange={(v) => update("mediaLoopByDefault", v)}
                                            />
                                        </SettingRow>
                                    </section>
                                </TabsContent>

                                {/* Editor section was here in the original, but a SECOND
<TabsContent value="editor"> block lower down caused both
to render simultaneously (duplicate controls). The first
block has been removed and its unique field
(defaultOutputTheme) has been merged into the surviving
block below. */}

                                {/* Navigation section */}
                                <TabsContent value="nav"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Search className="size-3"/>
                                            Navigation
                                        </h3>
                                        <SettingRow icon={<Search className="size-3.5"/>}
                                                    label="Full-text search by default in palette">
                                            <Switch
                                                checked={draft.fullTextSearchByDefault}
                                                onCheckedChange={(v) => update("fullTextSearchByDefault", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<GitBranch className="size-3.5"/>}
                                                    label="Show git status badges (requires git repo)">
                                            <Switch
                                                checked={draft.showGitStatus}
                                                onCheckedChange={(v) => update("showGitStatus", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Search className="size-3.5"/>}
                                                    label="Show file size in dropdown">
                                            <Switch
                                                checked={draft.showFileSizeInDropdown}
                                                onCheckedChange={(v) => update("showFileSizeInDropdown", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Search className="size-3.5"/>}
                                                    label="Show last-run status dot in dropdown">
                                            <Switch
                                                checked={draft.showLastRunStatusInDropdown}
                                                onCheckedChange={(v) => update("showLastRunStatusInDropdown", v)}
                                            />
                                        </SettingRow>
                                        {/* ── workspace niceties ──
 (the breadcrumb-bar toggle was removed with the
                bar itself — the toolbar already shows folder ▸ file.) */}
                                        <SettingRow
                                            icon={<Search className="size-3.5"/>}
                                            label="Restore the session on reload"
                                            hint="Reopen the tabs you had open (and the caret position) after a page reload or browser restart."
                                        >
                                            <Switch
                                                checked={draft.sessionRestore}
                                                onCheckedChange={(v) => update("sessionRestore", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Search className="size-3.5"/>}
                                            label="Word count in the footer"
                                            hint="Shows words · characters · reading time for the active file next to Ln/Col."
                                        >
                                            <Switch
                                                checked={draft.showWordCountInFooter}
                                                onCheckedChange={(v) => update("showWordCountInFooter", v)}
                                            />
                                        </SettingRow>
                                    </section>
                                    {/* ── TOP-RIGHT QUICK ACTIONS ───────────────────────────. One switch
per quick-action button on the menu bar's right edge —
the Developer Toolbox icon sits NEXT TO the screenshot
camera there. A switch stores false in the
topRightQuickActions map (Settings → Nav); every key
defaults to shown. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Wrench className="size-3"/>
                                            Top-right quick actions
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            Choose which quick-action buttons the menu bar&apos;s right edge shows.
                                            Every
                                            switched-off button disappears from the bar instantly — the nineteen
                                            opt-in extras below start hidden and appear only when switched on; their
                                            actions stay available in the menus. With everything on, the cluster pans
                                            horizontally (wheel / middle-click drag / Shift+wheel).
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                                            {(
                                                [
                                                    {
                                                        id: "run",
                                                        label: "Run",
                                                        hint: "The Run button (plus the pinned entry-point badge)."
                                                    },
                                                    {
                                                        id: "jump",
                                                        label: "Jump to anything",
                                                        hint: "Ctrl+Shift+J — pinned tabs, favorites, recents, last runs."
                                                    },
                                                    {
                                                        id: "screenshot",
                                                        label: "Screenshots",
                                                        hint: "The camera dropdown — Screenshot: window / code / region."
                                                    },
                                                    {
                                                        id: "toolbox",
                                                        label: "Developer Toolbox",
                                                        hint: "The toolbox icon next to the camera — one click, Tools ▸ Developer Toolbox."
                                                    },
                                                    {
                                                        id: "layout",
                                                        label: "Layout presets",
                                                        hint: "The preset picker dropdown."
                                                    },
                                                    {
                                                        id: "terminal",
                                                        label: "Terminal toggle",
                                                        hint: "Shows / hides the bottom terminal panel (Ctrl+`)."
                                                    },
                                                    {
                                                        id: "search",
                                                        label: "Search",
                                                        hint: "The script search dialog (Ctrl+K)."
                                                    },
                                                    {
                                                        id: "ai",
                                                        label: "AI chat",
                                                        hint: "Opens / closes the AI chat sidebar."
                                                    },
                                                    {
                                                        id: "history",
                                                        label: "Run history",
                                                        hint: "The history list (⌘⇧H) with its count badge."
                                                    },
                                                    {
                                                        id: "refresh",
                                                        label: "Refresh",
                                                        hint: "Refreshes the project tree (⌘⇧R)."
                                                    },
                                                    {
                                                        id: "settings",
                                                        label: "Settings",
                                                        hint: "Opens this dialog (⌘,)."
                                                    },
                                                    {
                                                        id: "theme",
                                                        label: "Theme picker",
                                                        hint: "The interface-theme dropdown (Light, Dark, One Dark, Nord, Dracula…)."
                                                    },
                                                    {
                                                        id: "project",
                                                        label: "Active-project chip",
                                                        hint: "The little chip naming the active project."
                                                    },
                                                    // ── the eight opt-in extras: unlike the 13 defaults above (shown
                                                    // unless the switch is false), these render NOTHING until the
                                                    // switch holds an explicit true — menu-bar's qaExtra() gate hides
                                                    // the button entirely while off
                                                    // when it is OFF, they should be hidden from the navbar"). The
                                                    // switch list and the navbar buttons stay 1:1 in sync.
                                                    {
                                                        id: "palette",
                                                        label: "Command palette",
                                                        hint: "⌘⇧P — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "distractionFree",
                                                        label: "Distraction-free",
                                                        hint: "⇧F11 — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "runQueue",
                                                        label: "Run queue",
                                                        hint: "The queued-runs dialog — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "scheduler",
                                                        label: "Scheduled runs",
                                                        hint: "The cron scheduler dialog — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "goToFile",
                                                        label: "Go to file",
                                                        hint: "⌘T file jumper — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "bookmarks",
                                                        label: "Bookmarks",
                                                        hint: "Favorites + line bookmarks — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "dependencyManager",
                                                        label: "Dependency Manager",
                                                        hint: "pip package browser — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "jumpList",
                                                        label: "Jump list",
                                                        hint: "Symbols + outline places in the open file — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "projectSymbols",
                                                        label: "Go to symbol in project",
                                                        hint: "Project-wide symbol search — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "snippets",
                                                        label: "Snippets palette",
                                                        hint: "Ctrl+/ snippet inserter — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "snippetManager",
                                                        label: "Snippet Manager",
                                                        hint: "The snippet library CRUD + import / export packs — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "localHistory",
                                                        label: "Local file history",
                                                        hint: "Per-file save snapshots + rollback — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "gitLog",
                                                        label: "Commit history",
                                                        hint: "The Git log dialog — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "gitDiff",
                                                        label: "Git changes",
                                                        hint: "The Git Diff tab with a modified-count badge — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "chartPreview",
                                                        label: "Chart preview",
                                                        hint: "Instant chart from the current CSV's X/Y columns — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "sqlWorkbench",
                                                        label: "SQLite workbench",
                                                        hint: "Pick a .db file, browse the schema, run read-only queries — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "fullscreen",
                                                        label: "Fullscreen",
                                                        hint: "F11 browser fullscreen — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "shortcutTrainer",
                                                        label: "Shortcut trainer",
                                                        hint: "Practice the keyboard shortcuts with instant feedback — off by default; flip on to show the button on the bar."
                                                    },
                                                    {
                                                        id: "shortcuts",
                                                        label: "Keyboard shortcuts",
                                                        hint: "The full shortcuts reference dialog — off by default; flip on to show the button on the bar."
                                                    },
                                                ] as const
                                            ).map((qa) => {
                                                const shown = draft.topRightQuickActions?.[qa.id] !== false;
                                                // the nineteen extras need an explicit true (they default
                                                // OFF — while off, the navbar button is HIDDEN, not
                                                // greyed; its action stays in the menus).
                                                const extra = ["palette", "distractionFree", "runQueue", "scheduler", "goToFile", "bookmarks", "dependencyManager", "jumpList", "projectSymbols", "snippets", "snippetManager", "localHistory", "gitLog", "gitDiff", "chartPreview", "sqlWorkbench", "fullscreen", "shortcutTrainer", "shortcuts"].includes(qa.id);
                                                const enabled = extra
                                                    ? draft.topRightQuickActions?.[qa.id] === true
                                                    : shown;
                                                return (
                                                    <SettingRow
                                                        key={qa.id}
                                                        icon={<Wrench className="size-3.5"/>}
                                                        label={qa.label}
                                                        hint={qa.hint}
                                                    >
                                                        <Switch
                                                            checked={enabled}
                                                            onCheckedChange={(v) => {
                                                                const next = {...(draft.topRightQuickActions ?? {})};
                                                                if (extra) {
                                                                    // explicit true / removed — never a bare
                                                                    // false (which the 13 defaults interpret as
                                                                    // "shown").
                                                                    if (v) next[qa.id] = true;
                                                                    else delete next[qa.id];
                                                                } else if (v) delete next[qa.id];
                                                                else next[qa.id] = false;
                                                                update("topRightQuickActions", next);
                                                            }}
                                                        />
                                                    </SettingRow>
                                                );
                                            })}
                                        </div>
                                    </section>
                                </TabsContent>

                                {/* ─── Accessibility tab ──────────────────────────────────
              The ten a11y modes previously lived ONLY as Help ▸
              Accessibility toggles in the navbar — invisible to the
              settings dialog and its search (part of the "every option
              belongs in the config" rule). Same keys, same instant
              data-attribute effects; the navbar menu stays as a quick
              toggle and now points here too. */}
                                <TabsContent value="a11y"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Languages className="size-3"/>
                                            Language
                                        </h3>
                                        {/* interface language — translated menu-bar
                chrome + RTL shell flip for Arabic. Scaffold coverage:
                menus are translated; dialogs/tooltips remain English
                (extend lib/i18n.ts to translate more). */}
                                        <SettingRow
                                            icon={<Languages className="size-3.5"/>}
                                            label="Interface language"
                                            hint="Translates the menu bar chrome and flips the app shell to right-to-left for Arabic. This is a scaffold: dialogs, settings and tooltips remain English for now."
                                        >
                                            <Select
                                                value={draft.language ?? "en"}
                                                onValueChange={(v) => {
                                                    update("language", v as "en" | "ar");
                                                    setChromeLanguage(v as "en" | "ar");
                                                }}
                                            >
                                                <SelectTrigger className="w-44 h-8 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="en">English</SelectItem>
                                                    <SelectItem value="ar">العربية (Arabic)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                    </section>
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Accessibility className="size-3"/>
                                            Vision &amp; readability
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            All modes apply immediately (page-level data attributes — no reload needed).
                                            They can be stacked; the navbar&apos;s Help ▸ Accessibility menu toggles the
                                            same switches.
                                        </p>
                                        <SettingRow
                                            icon={<Contrast className="size-3.5"/>}
                                            label="High contrast mode"
                                            hint="Stronger borders and text contrast across the whole UI."
                                        >
                                            <Switch checked={draft.highContrastMode}
                                                    onCheckedChange={(v) => update("highContrastMode", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Type className="size-3.5"/>}
                                            label="Large text mode"
                                            hint="Bumps the base UI font size for comfortable reading."
                                        >
                                            <Switch checked={draft.largeTextMode}
                                                    onCheckedChange={(v) => update("largeTextMode", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Accessibility className="size-3.5"/>}
                                            label="Dyslexia-friendly mode"
                                            hint="Relaxed letter and word spacing tuned for dyslexic readers."
                                        >
                                            <Switch checked={draft.dyslexiaFriendlyMode}
                                                    onCheckedChange={(v) => update("dyslexiaFriendlyMode", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Palette className="size-3.5"/>}
                                            label="Color-blind friendly palette"
                                            hint="Swaps red/green status colors for a color-blind-safe set."
                                        >
                                            <Switch checked={draft.colorBlindMode}
                                                    onCheckedChange={(v) => update("colorBlindMode", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Zap className="size-3.5"/>}
                                            label="Reduce motion"
                                            hint="Disables animations and transitions."
                                        >
                                            <Switch checked={draft.reduceMotion}
                                                    onCheckedChange={(v) => update("reduceMotion", v)}/>
                                        </SettingRow>
                                    </section>
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Keyboard className="size-3"/>
                                            Interaction &amp; assistive tech
                                        </h3>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Screen reader mode"
                                            hint="Extra ARIA labeling and simplified landmarks for assistive technology."
                                        >
                                            <Switch checked={draft.screenReaderMode}
                                                    onCheckedChange={(v) => update("screenReaderMode", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Crosshair className="size-3.5"/>}
                                            label="Enhanced focus indicators"
                                            hint="Thicker, high-visibility focus rings on every control."
                                        >
                                            <Switch checked={draft.enhancedFocusIndicators}
                                                    onCheckedChange={(v) => update("enhancedFocusIndicators", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Hash className="size-3.5"/>}
                                            label="Sticky cursor indicator"
                                            hint="Keeps a subtle marker on the last caret line while you scroll away."
                                        >
                                            <Switch checked={draft.stickyCursorIndicator}
                                                    onCheckedChange={(v) => update("stickyCursorIndicator", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Keyboard className="size-3.5"/>}
                                            label="Always show shortcut hints"
                                            hint="Displays keyboard hints on buttons and tooltips permanently."
                                        >
                                            <Switch checked={draft.alwaysShowShortcutHints}
                                                    onCheckedChange={(v) => update("alwaysShowShortcutHints", v)}/>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<MoveHorizontal className="size-3.5"/>}
                                            label="Wrap Tab navigation"
                                            hint="Tab / Shift+Tab move focus cyclically instead of getting stuck at the edges."
                                        >
                                            <Switch checked={draft.wrapTabNavigation}
                                                    onCheckedChange={(v) => update("wrapTabNavigation", v)}/>
                                        </SettingRow>
                                    </section>
                                </TabsContent>

                                {/* AI integration section */}
                                <TabsContent value="ai"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    {/* ─── Chat model providers (OpenAI-compatible) ─────────
              The integrated AI (chat sidebar, code completion, test
              generation) routes through ONE selected provider — ANY
              OpenAI-compatible /chat/completions endpoint — local
              inference servers like Ollama, LM Studio, vLLM and
              llama.cpp, or hosted APIs (Z.AI's HTTP API, OpenRouter,
              OpenAI…). The built-in Z.AI SDK option was REMOVED —
              it only worked inside Z.AI's own infrastructure and
              failed everywhere else; providers live in the settings
              store; the config rides along with each AI request, so
              nothing is persisted server-side. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Sparkles className="size-3"/>
                                            Chat model providers
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Pick which model answers the chat sidebar, completions and
                                            test generation. Add your own LLM — Ollama, LM Studio, vLLM,
                                            llama.cpp or any OpenAI-compatible endpoint — and switch any
                                            time from the chat sidebar too. No provider yet? Add one below;
                                            every AI feature routes through it immediately.
                                        </p>

                                        {/* Which provider is active. */}
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs shrink-0">Use for chat &amp; completions:</Label>
                                            <Select
                                                value={(() => {
                                                    const enabled = (draft.aiChatProviders ?? []).filter((p) => p && p.enabled);
                                                    return enabled.some((p) => p.id === draft.aiChatProviderId)
                                                        ? draft.aiChatProviderId
                                                        : enabled[0]?.id ?? "";
                                                })()}
                                                onValueChange={(id) => update("aiChatProviderId", id)}
                                            >
                                                <SelectTrigger
                                                    size="sm"
                                                    className="h-8 flex-1 text-xs"
                                                    aria-label="Active chat provider"
                                                >
                                                    <SelectValue placeholder="No enabled providers"/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(draft.aiChatProviders ?? []).filter((p) => p && p.enabled).map((p) => (
                                                        <SelectItem key={p.id} value={p.id} className="text-xs">
                                                            {p.name}
                                                            {p.model ? ` · ${p.model}` : ""}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Provider cards. */}
                                        {(draft.aiChatProviders ?? []).map((p, i) => {
                                            const isActive = p.id === draft.aiChatProviderId;
                                            const test = providerTests[p.id];
                                            const setField = <K extends keyof AiChatProvider>(key: K, value: AiChatProvider[K]) => {
                                                const next = [...(draft.aiChatProviders ?? [])];
                                                next[i] = {...p, [key]: value};
                                                update("aiChatProviders", next);
                                            };
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={cn(
                                                        "rounded-md border p-2.5 space-y-2",
                                                        isActive && "ring-1 ring-emerald-500/60"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Switch
                                                            checked={p.enabled}
                                                            onCheckedChange={(v) => setField("enabled", v)}
                                                            aria-label={`${p.name} enabled`}
                                                        />
                                                        <Input
                                                            value={p.name}
                                                            onChange={(e) => setField("name", e.target.value)}
                                                            className="font-mono text-xs h-8 w-32"
                                                            placeholder="Name"
                                                            aria-label="Provider name"
                                                        />
                                                        <span
                                                            className="h-8 shrink-0 inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 text-[10px] font-medium text-muted-foreground"
                                                            title="Every provider now talks to an OpenAI-compatible /chat/completions endpoint — the built-in Z.AI SDK option was removed"
                                                        >
                      <Cloud className="size-3" aria-hidden="true"/>
                      OpenAI-compatible
                    </span>
                                                        <div className="flex-1"/>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-1 text-xs shrink-0"
                                                            onClick={() => handleTestProvider(p)}
                                                            disabled={testingProviderId === p.id || !p.enabled}
                                                            title="Ping this provider with a trivial message and report latency + model"
                                                        >
                                                            {testingProviderId === p.id ? (
                                                                <Loader2 className="size-3.5 animate-spin"/>
                                                            ) : (
                                                                <Sparkles className="size-3.5"/>
                                                            )}
                                                            Test
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8 shrink-0"
                                                            onClick={() => {
                                                                update(
                                                                    "aiChatProviders",
                                                                    (draft.aiChatProviders ?? []).filter((q) => q.id !== p.id)
                                                                );
                                                                if (draft.aiChatProviderId === p.id) {
                                                                    const fallback = (draft.aiChatProviders ?? []).find(
                                                                        (q) => q.id !== p.id && q.enabled
                                                                    );
                                                                    update("aiChatProviderId", fallback?.id ?? "");
                                                                }
                                                            }}
                                                            aria-label={`Remove ${p.name}`}
                                                            title={`Remove ${p.name}`}
                                                        >
                                                            <Trash2 className="size-3.5"/>
                                                        </Button>
                                                    </div>
                                                    {(p as { kind?: string }).kind !== "zai" && (
                                                        <div
                                                            className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] text-muted-foreground">Base
                                                                    URL</Label>
                                                                <Input
                                                                    value={p.baseUrl}
                                                                    onChange={(e) => setField("baseUrl", e.target.value)}
                                                                    className="font-mono text-xs h-8"
                                                                    placeholder="http://localhost:11434/v1"
                                                                    spellCheck={false}
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label
                                                                    className="text-[10px] text-muted-foreground">Model</Label>
                                                                <Input
                                                                    value={p.model}
                                                                    onChange={(e) => setField("model", e.target.value)}
                                                                    className="font-mono text-xs h-8"
                                                                    placeholder="llama3.2"
                                                                    spellCheck={false}
                                                                />
                                                            </div>
                                                            <div className="space-y-1 sm:col-span-2">
                                                                <Label className="text-[10px] text-muted-foreground">
                                                                    API key (optional — local servers need none)
                                                                </Label>
                                                                <div className="flex items-center gap-1.5">
                                                                    <Input
                                                                        type="password"
                                                                        value={p.apiKey}
                                                                        onChange={(e) => setField("apiKey", e.target.value)}
                                                                        className="font-mono text-xs h-8 flex-1"
                                                                        placeholder="sk-… (empty = no Authorization header)"
                                                                        autoComplete="off"
                                                                        spellCheck={false}
                                                                    />
                                                                    {/* store the key SERVER-SIDE
                              (~/.praxis/ai-keys.json, 0600) instead of
                              the browser's localStorage. The local field
                              is cleared after a successful store; the
                              server resolves the key at request time
                              when the client sends an empty one. */}
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-8 text-[10px] shrink-0"
                                                                        disabled={!p.apiKey || !p.baseUrl}
                                                                        title="Store this key on the SERVER (~/.praxis/ai-keys.json, 0600) instead of the browser's localStorage, then clear the local copy"
                                                                        onClick={() =>
                                                                            void (async () => {
                                                                                try {
                                                                                    const res = await fetch("/api/ai-keys", {
                                                                                        method: "POST",
                                                                                        headers: {"Content-Type": "application/json"},
                                                                                        body: JSON.stringify({
                                                                                            action: "store",
                                                                                            baseUrl: p.baseUrl,
                                                                                            apiKey: p.apiKey,
                                                                                        }),
                                                                                    });
                                                                                    const data = await res.json();
                                                                                    if (data?.ok) {
                                                                                        setField("apiKey", "");
                                                                                        toast({
                                                                                            title: "Key stored on the server",
                                                                                            description: `${p.baseUrl} → ${data.masked} (localStorage copy cleared).`,
                                                                                        });
                                                                                    } else {
                                                                                        toast({
                                                                                            title: "Could not store the key",
                                                                                            description: data?.error ?? `HTTP ${res.status}`,
                                                                                            variant: "destructive",
                                                                                        });
                                                                                    }
                                                                                } catch (err) {
                                                                                    toast({
                                                                                        title: "Could not store the key",
                                                                                        description: (err as Error).message,
                                                                                        variant: "destructive",
                                                                                    });
                                                                                }
                                                                            })()
                                                                        }
                                                                    >
                                                                        Store on server
                                                                    </Button>
                                                                </div>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                    Keys kept in this field live in the browser's
                                                                    localStorage. “Store on server” moves them to
                                                                    the server's keyring file — the browser then
                                                                    only ever sees a masked value. See Security in
                                                                    the README.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {test && (
                                                        <p
                                                            className={cn(
                                                                "text-[11px] font-mono break-words",
                                                                test.ok
                                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                                    : "text-destructive"
                                                            )}
                                                        >
                                                            {test.ok
                                                                ? `OK — ${test.latencyMs}ms${test.model ? ` · ${test.model}` : ""}`
                                                                : `Failed: ${test.error}`}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Quick-add presets. */}
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                            <span className="text-[10px] text-muted-foreground shrink-0">Add:</span>
                                            {PROVIDER_PRESETS.map((preset) => (
                                                <Button
                                                    key={preset.label}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2 text-[11px]"
                                                    onClick={() => {
                                                        update("aiChatProviders", [
                                                            ...(draft.aiChatProviders ?? []),
                                                            {id: nextProviderId(draft.aiChatProviders ?? []), ...preset.make()},
                                                        ]);
                                                    }}
                                                    title={preset.hint}
                                                >
                                                    + {preset.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </section>

                                    {/* ─── Integrated AI assistant ───────────────────────────────
              This section configures the requests the integrated AI
              makes — through the provider selected above (every
              provider is an OpenAI-compatible endpoint; add one above
              if the list is empty). */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Sparkles className="size-3"/>
                                            Integrated AI assistant
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            The integrated AI assistant (chat sidebar, code completion,
                                            test generation) runs through the provider selected above —
                                            a local endpoint usually needs nothing more than its URL and
                                            model; a hosted API adds its key. No provider configured?
                                            The AI features say so with a one-click path to this tab.
                                        </p>
                                        <SettingRow
                                            icon={<Sparkles className="size-3.5"/>}
                                            label="AI code completion (suggestion popup)"
                                            hint="Shows a debounced AI suggestion popup at the bottom of the editor as you type. Press Tab to accept, Escape to dismiss, Alt+\\ to force a fetch. Runs through the selected chat provider."
                                        >
                                            <Switch
                                                checked={draft.aiCompletionEnabled}
                                                onCheckedChange={(v) => update("aiCompletionEnabled", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<ShieldQuestion className="size-3.5"/>}
                                            label="Verify the model before chatting"
                                            hint="On every AI-chat open, ping the active provider with a trivial message — when the model is missing or unreachable the composer + Send are disabled and a setup helper explains how to add a model (Ollama, LM Studio, a hosted API). Turn OFF to always allow typing and see errors on send instead."
                                        >
                                            <Switch
                                                checked={draft.aiChatVerifyModel !== false}
                                                onCheckedChange={(v) => update("aiChatVerifyModel", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<CornerDownLeft className="size-3.5"/>}
                                            label="Enter sends the message"
                                            hint="ON — Enter sends, Shift+Enter inserts a newline. OFF — Enter inserts a newline and Ctrl/Cmd+Enter sends (handy when pasting multi-line prompts)."
                                        >
                                            <Switch
                                                checked={draft.aiChatEnterToSend !== false}
                                                onCheckedChange={(v) => update("aiChatEnterToSend", v)}
                                            />
                                        </SettingRow>

                                        {/* AI Chat system prompt — full-width textarea. */}
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <Label
                                                    className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                                    <Sparkles className="size-3.5"/>
                                                    AI Chat system prompt
                                                </Label>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[10px] text-muted-foreground"
                                                    onClick={() => update("aiChatSystemPrompt", "")}
                                                    title="Reset to the built-in default"
                                                >
                                                    Reset
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                Empty = use the built-in default (a helpful Python coding
                                                assistant). Customize to bias the assistant toward your
                                                coding style, library stack, or output format.
                                            </p>
                                            <Textarea
                                                value={draft.aiChatSystemPrompt}
                                                onChange={(e) => update("aiChatSystemPrompt", e.target.value)}
                                                className="font-mono text-xs h-20 w-full"
                                                placeholder="You are a helpful coding assistant for Praxis, a Python IDE…"
                                            />
                                        </div>

                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="AI Chat context chars"
                                            hint="Max chars of the current file sent as context with each chat message. The server truncates to the tail (most recently edited region) when this is exceeded."
                                        >
                                            <Input
                                                type="number"
                                                min={500}
                                                max={20000}
                                                value={draft.aiChatContextChars}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update(
                                                        "aiChatContextChars",
                                                        Number.isFinite(n) ? Math.max(500, Math.min(20000, n)) : 6000
                                                    );
                                                }}
                                                className="font-mono text-xs h-8 w-28"
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="AI Chat max messages"
                                            hint="Max messages from the history sent to the model. Older messages are dropped server-side. Lower this if the assistant gets slow on long conversations."
                                        >
                                            <Input
                                                type="number"
                                                min={5}
                                                max={100}
                                                value={draft.aiChatMaxMessages}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update(
                                                        "aiChatMaxMessages",
                                                        Number.isFinite(n) ? Math.max(5, Math.min(100, n)) : 50
                                                    );
                                                }}
                                                className="font-mono text-xs h-8 w-28"
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="AI completion debounce (ms)"
                                            hint="Time between the last keystroke and the completion fetch. Lower = faster suggestions but more API calls. 0 = no debounce."
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                max={5000}
                                                step={100}
                                                value={draft.aiCompletionDebounceMs}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update(
                                                        "aiCompletionDebounceMs",
                                                        Number.isFinite(n) ? Math.max(0, Math.min(5000, n)) : 1000
                                                    );
                                                }}
                                                className="font-mono text-xs h-8 w-28"
                                            />
                                        </SettingRow>

                                        {/* Connection testing now lives per provider in the "Chat
                model providers" section above — each card has its own
                Test button, which pings that provider's endpoint (or
                the built-in SDK) and reports latency + model inline. */}
                                    </section>

                                    {/* ─── External AI endpoints (the "Ask AI" button) ────────── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <ExternalLink className="size-3"/>
                                            External AI endpoints
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            When you click &ldquo;Ask AI&rdquo; in the code viewer, the
                                            question is copied to your clipboard and the AI&apos;s website
                                            opens in a new tab. Paste the question into the AI&apos;s chat
                                            input. This is separate from the integrated assistant above.
                                        </p>
                                        {draft.aiEndpoints.map((ep, i) => (
                                            <div key={i} className="flex items-center gap-2 py-1">
                                                <Switch
                                                    checked={ep.enabled}
                                                    onCheckedChange={(v) => {
                                                        const next = [...draft.aiEndpoints];
                                                        next[i] = {...ep, enabled: v};
                                                        update("aiEndpoints", next);
                                                    }}
                                                />
                                                <Input
                                                    value={ep.name}
                                                    onChange={(e) => {
                                                        const next = [...draft.aiEndpoints];
                                                        next[i] = {...ep, name: e.target.value};
                                                        update("aiEndpoints", next);
                                                    }}
                                                    className="font-mono text-xs h-8 w-28"
                                                    placeholder="Name"
                                                />
                                                <Input
                                                    value={ep.url}
                                                    onChange={(e) => {
                                                        const next = [...draft.aiEndpoints];
                                                        next[i] = {...ep, url: e.target.value};
                                                        update("aiEndpoints", next);
                                                    }}
                                                    className="font-mono text-xs h-8 flex-1"
                                                    placeholder="https://…"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    onClick={() => {
                                                        update("aiEndpoints", draft.aiEndpoints.filter((_, j) => j !== i));
                                                    }}
                                                >
                                                    <Trash2 className="size-3.5"/>
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1.5 text-xs"
                                            onClick={() =>
                                                update("aiEndpoints", [
                                                    ...draft.aiEndpoints,
                                                    {name: "Custom", url: "https://", enabled: true},
                                                ])
                                            }
                                        >
                                            <Sparkles className="size-3.5"/>
                                            Add AI endpoint
                                        </Button>

                                        {/* AI question template — full-width textarea (not in a
                SettingRow, which constrains the width). */}
                                        <div className="space-y-1.5 pt-2 border-t">
                                            <Label
                                                className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                                <Sparkles className="size-3.5"/>
                                                AI question template
                                            </Label>
                                            <p className="text-[11px] text-muted-foreground">
                                                Variables: <code className="font-mono">{"{script_name}"}</code>,{" "}
                                                <code className="font-mono">{"{source_code}"}</code>,{" "}
                                                <code className="font-mono">{"{output}"}</code>,{" "}
                                                <code className="font-mono">{"{error_or_success}"}</code>,{" "}
                                                <code className="font-mono">{"{question}"}</code>
                                            </p>
                                            <Textarea
                                                value={draft.aiQuestionTemplate}
                                                onChange={(e) => update("aiQuestionTemplate", e.target.value)}
                                                className="font-mono text-xs h-24 w-full"
                                                placeholder="I'm running a Python script called {script_name}…"
                                            />
                                        </div>
                                    </section>
                                </TabsContent>

                                {/* Code viewer section */}
                                <TabsContent value="editor"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    {/* ── Interface section: app-wide chrome look. ── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Palette className="size-3"/>
                                            Interface
                                        </h3>
                                        <SettingRow
                                            icon={<Palette className="size-3.5"/>}
                                            label="Interface theme"
                                            hint="The app-wide look (menus, panels, dialogs) — applied live as you pick, restored if you cancel. The same picker lives on the menu bar's right edge."
                                        >
                                            <Select
                                                value={draft.uiTheme ?? "light"}
                                                onValueChange={(v) => update("uiTheme", v)}
                                            >
                                                <SelectTrigger className="h-8 w-52 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent className="max-h-72">
                                                    {UI_THEMES.map((t) => (
                                                        <SelectItem key={t.id} value={t.id} className="text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span
                            className="inline-block size-3 rounded-sm border border-foreground/10"
                            style={{backgroundColor: t.swatch.bg}}
                            aria-hidden="true"
                        />
                          {t.label}
                          <span className="text-[10px] text-muted-foreground">{t.family}</span>
                      </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Palette className="size-3.5"/>}
                                            label="Modal resizing"
                                            hint="How resizable dialogs (Chart Preview, Transform Pipeline, the workbenches…) resize: Free moves width and height independently; Ratio grows both together, keeping the dialog's aspect ratio."
                                        >
                                            <Select
                                                value={draft.modalResizeMode ?? "free"}
                                                onValueChange={(v) => update("modalResizeMode", v as "free" | "ratio")}
                                            >
                                                <SelectTrigger className="h-8 w-40 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="free" className="text-xs">Free — independent
                                                        edges</SelectItem>
                                                    <SelectItem value="ratio" className="text-xs">Ratio —
                                                        proportional</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                    </section>
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Code2 className="size-3"/>
                                            Code viewer
                                        </h3>
                                        <SettingRow
                                            icon={<Crosshair className="size-3.5"/>}
                                            label="Show the per-run Capture picker"
                                            hint="The per-run Capture picker (Capture: Vars · Frames · Coverage) in the run-input strip below the editor tabs, with Stdin / Args / Env — one click opens direct switches and presets for what the NEXT run captures (next-run-only; afterwards Settings → Capture applies again)."
                                        >
                                            <Switch
                                                checked={draft.showPerRunFlags}
                                                onCheckedChange={(v) => update("showPerRunFlags", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<ArrowUpDown className="size-3.5"/>}
                                                    label="Default sort mode">
                                            <Select
                                                value={draft.defaultSortMode}
                                                onValueChange={(v) => update("defaultSortMode", v as "alpha" | "mtime")}
                                            >
                                                <SelectTrigger className="h-8 w-32 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="alpha"
                                                                className="text-xs">Alphabetical</SelectItem>
                                                    <SelectItem value="mtime" className="text-xs">Modification
                                                        time</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow icon={<Code2 className="size-3.5"/>} label="Code syntax theme">
                                            <Select
                                                value={draft.codeSyntaxTheme}
                                                onValueChange={(v) => update("codeSyntaxTheme", v)}
                                            >
                                                <SelectTrigger className="h-8 w-40 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent className="max-h-72">
                                                    <SelectItem value="follow" className="text-xs">Follow global
                                                        theme</SelectItem>
                                                    <SelectItem value="one-dark" className="text-xs">One
                                                        Dark</SelectItem>
                                                    <SelectItem value="one-light" className="text-xs">One
                                                        Light</SelectItem>
                                                    <SelectItem value="dracula" className="text-xs">Dracula</SelectItem>
                                                    <SelectItem value="vsc-dark-plus" className="text-xs">VS Code
                                                        Dark+</SelectItem>
                                                    <SelectItem value="nord" className="text-xs">Nord</SelectItem>
                                                    <SelectItem value="night-owl" className="text-xs">Night
                                                        Owl</SelectItem>
                                                    <SelectItem value="material-oceanic" className="text-xs">Material
                                                        Oceanic</SelectItem>
                                                    <SelectItem value="material-dark" className="text-xs">Material
                                                        Dark</SelectItem>
                                                    <SelectItem value="material-light" className="text-xs">Material
                                                        Light</SelectItem>
                                                    <SelectItem value="gruvbox-dark" className="text-xs">Gruvbox
                                                        Dark</SelectItem>
                                                    <SelectItem value="gruvbox-light" className="text-xs">Gruvbox
                                                        Light</SelectItem>
                                                    <SelectItem value="tomorrow"
                                                                className="text-xs">Tomorrow</SelectItem>
                                                    <SelectItem value="twilight"
                                                                className="text-xs">Twilight</SelectItem>
                                                    <SelectItem value="atom-dark" className="text-xs">Atom
                                                        Dark</SelectItem>
                                                    <SelectItem value="ghcolors" className="text-xs">GitHub
                                                        Colors</SelectItem>
                                                    <SelectItem value="solarized-light" className="text-xs">Solarized
                                                        Light</SelectItem>
                                                    <SelectItem value="duotone-dark" className="text-xs">Duotone
                                                        Dark</SelectItem>
                                                    <SelectItem value="duotone-light" className="text-xs">Duotone
                                                        Light</SelectItem>
                                                    <SelectItem value="duotone-sea" className="text-xs">Duotone
                                                        Sea</SelectItem>
                                                    <SelectItem value="duotone-space" className="text-xs">Duotone
                                                        Space</SelectItem>
                                                    <SelectItem value="duotone-forest" className="text-xs">Duotone
                                                        Forest</SelectItem>
                                                    <SelectItem value="duotone-earth" className="text-xs">Duotone
                                                        Earth</SelectItem>
                                                    <SelectItem value="a11y-dark" className="text-xs">A11y
                                                        Dark</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow icon={<Code2 className="size-3.5"/>} label="Show line numbers">
                                            <Switch
                                                checked={draft.showLineNumbers}
                                                onCheckedChange={(v) => update("showLineNumbers", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Command className="size-3.5"/>}
                                            label="Vim mode"
                                            hint="Modal editing in the Python editor: normal / insert / visual modes, counts, operators, registers, marks, dot-repeat, q macros and :commands (:w, :%s/a/b/). The mode indicator sits in the status bar; relative line numbers follow :set rnu."
                                        >
                                            <Switch
                                                checked={draft.vimMode === true}
                                                onCheckedChange={(v) => update("vimMode", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Terminal className="size-3.5"/>}
                                                    label="Default output theme">
                                            <Select
                                                value={draft.defaultOutputTheme}
                                                onValueChange={(v) => update("defaultOutputTheme", v)}
                                            >
                                                <SelectTrigger className="h-8 w-44 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {OUTPUT_THEMES.map((t) => (
                                                        <SelectItem key={t.id} value={t.id}>
                                                            {t.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow icon={<Code2 className="size-3.5"/>} label="Collapsed by default">
                                            <Switch
                                                checked={draft.codeCollapsedByDefault}
                                                onCheckedChange={(v) => update("codeCollapsedByDefault", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Code2 className="size-3.5"/>} label="Word wrap">
                                            <Switch
                                                checked={draft.codeWordWrap}
                                                onCheckedChange={(v) => update("codeWordWrap", v)}
                                            />
                                        </SettingRow>
                                        {/* ─── what Format Document does ───────────
Post-processors applied to the formatter output (black,
or the built-in fallback).
VISIBLE SUB-GROUP HEADER (plan 4c): this cluster used to
be separated ONLY by this code comment — invisible to the
user. It now carries the same small uppercase header the
other sub-groups show. */}
                                        <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                            Format document
                                        </h4>
                                        <SettingRow
                                            icon={<Braces className="size-3.5"/>}
                                            label="Formatting: parenthesize if/elif conditions"
                                            hint="After formatting, wrap bare if/elif conditions in parentheses — `if x > 3:` becomes `if (x > 3):`. Applied on Format Document, Format Selection and the editor's auto-format paths."
                                        >
                                            <Switch
                                                checked={draft.formatPostIfParentheses}
                                                onCheckedChange={(v) => update("formatPostIfParentheses", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<FileCode2 className="size-3.5"/>}
                                            label="Formatting: final newline"
                                            hint="After formatting, guarantee exactly one trailing newline at the end of the file (POSIX convention; silences “no newline at end of file” linters)."
                                        >
                                            <Switch
                                                checked={draft.formatPostFinalNewline}
                                                onCheckedChange={(v) => update("formatPostFinalNewline", v)}
                                            />
                                        </SettingRow>
                                        {/* ─── indentation style + width — one row, two
controls. Default: 2 spaces. Tab style
disables the width select.
VISIBLE SUB-GROUP HEADER (plan 4c — see Format
document above). */}
                                        <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                            Indentation &amp; save hygiene
                                        </h4>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Indentation"
                                            hint="Used by the editor's Tab key, Enter auto-indent, Insert blocks and every generated example (Python files)"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Select
                                                    value={draft.indentStyle ?? "spaces"}
                                                    onValueChange={(v) => update("indentStyle", v as "spaces" | "tab")}
                                                >
                                                    <SelectTrigger className="h-8 w-24 text-xs"
                                                                   aria-label="Indentation style">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="spaces"
                                                                    className="text-xs">Spaces</SelectItem>
                                                        <SelectItem value="tab" className="text-xs">Tab</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Select
                                                    value={String(draft.editorIndentWidth)}
                                                    onValueChange={(v) => update("editorIndentWidth", parseInt(v, 10))}
                                                    disabled={(draft.indentStyle ?? "spaces") === "tab"}
                                                >
                                                    <SelectTrigger className="h-8 w-20 text-xs"
                                                                   aria-label="Indent width">
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="2" className="text-xs">2</SelectItem>
                                                        <SelectItem value="4" className="text-xs">4</SelectItem>
                                                        <SelectItem value="8" className="text-xs">8</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                  {(draft.indentStyle ?? "spaces") === "tab" ? "→\t→\t" : "→" + "·".repeat(Math.max(2, draft.editorIndentWidth || 2)) + "→"}
                </span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow icon={<Code2 className="size-3.5"/>}
                                                    label="Auto-format on save (black)">
                                            <Switch
                                                checked={draft.autoFormatOnSave}
                                                onCheckedChange={(v) => update("autoFormatOnSave", v)}
                                            />
                                        </SettingRow>
                                        {/* organize imports on save — ruff's import-block pass
                (sort / merge / dedupe) that runs BEFORE black when both
                save-time toggles are on. Requires ruff (no fallback).
                Registered exactly like the black toggle above it. */}
                                        <SettingRow
                                            icon={<ListOrdered className="size-3.5"/>}
                                            label="Organize imports on save (ruff)"
                                            hint="Runs ruff's import-block pass (sort, merge, dedupe, drop unused) on the edited source before the format pass — requires ruff; there is no fallback."
                                        >
                                            <Switch
                                                checked={draft.organizeImportsOnSave === true}
                                                onCheckedChange={(v) => update("organizeImportsOnSave", v)}
                                            />
                                        </SettingRow>
                                        {/* save-time hygiene — trim + final newline.
                Cheap pure-string passes that run BEFORE black (if the
                format-on-save toggle is on too), so the formatter and
                the file on disk never see dirty line endings. */}
                                        <SettingRow icon={<Eraser className="size-3.5"/>}
                                                    label="Trim trailing whitespace on save"
                                                    hint="Strips spaces/tabs at the end of every line when the file is written — the editor buffer resyncs to the cleaned text.">
                                            <Switch
                                                checked={draft.trimTrailingOnSave}
                                                onCheckedChange={(v) => update("trimTrailingOnSave", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<CornerDownLeft className="size-3.5"/>}
                                                    label="Final newline on save"
                                                    hint="Makes the file end with exactly one \n — the POSIX convention linters and git diffs expect.">
                                            <Switch
                                                checked={draft.finalNewlineOnSave}
                                                onCheckedChange={(v) => update("finalNewlineOnSave", v)}
                                            />
                                        </SettingRow>
                                        {/* rainbow brackets + pair guides. */}
                                        <SettingRow icon={<Rainbow className="size-3.5"/>}
                                                    label="Rainbow brackets + pair guides"
                                                    hint="Colors each bracket by nesting depth and draws a faint vertical guide connecting multi-line pairs — in both view and edit mode.">
                                            <Switch
                                                checked={draft.rainbowBrackets}
                                                onCheckedChange={(v) => update("rainbowBrackets", v)}
                                            />
                                        </SettingRow>
                                        {/* ─── Explorer & panel layout ──────────────────
VISIBLE SUB-GROUP HEADER (plan 4c): the explorer /
bottom-panel rows below used to sit in the Code viewer
section with no divider but a code comment. */}
                                        <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                            Explorer &amp; panel layout
                                        </h4>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Show the Recent files section"
                                            hint="Recently modified files at the top of the explorer — separated from the folder list by a divider"
                                        >
                                            <Switch
                                                checked={draft.showRecentFiles}
                                                onCheckedChange={(v) => update("showRecentFiles", v)}
                                            />
                                        </SettingRow>
                                        {/* #hashtags visibility — the chips come from `# tags:`
                comment lines in the .py files (folder badges + the
                per-file chip). */}
                                        <SettingRow
                                            icon={<Tags className="size-3.5"/>}
                                            label="Show #tags in the explorer"
                                            hint="The #tag chips parsed from `# tags:` comments in Python files — shown on folder headers and beside file names. Turn off for a cleaner tree; the Properties dialogs still list every tag."
                                        >
                                            <Switch
                                                checked={draft.explorerShowTags !== false}
                                                onCheckedChange={(v) => update("explorerShowTags", v)}
                                            />
                                        </SettingRow>
                                        {/* hidden dot-files —.praxis (the project
                settings) and dot-files surface in the tree. */}
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Show hidden files"
                                            hint="Surface dot-directories like .praxis (the project settings / appearance files) and dot-files in the explorer — same as the eye toggle in the tree header."
                                        >
                                            <Switch
                                                checked={draft.explorerShowHidden}
                                                onCheckedChange={(v) => update("explorerShowHidden", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Recent files count"
                                            hint="How many entries the Recent section lists"
                                        >
                                            <Select
                                                value={String(draft.recentFilesCount ?? 5)}
                                                onValueChange={(v) => update("recentFilesCount", parseInt(v, 10))}
                                                disabled={!draft.showRecentFiles}
                                            >
                                                <SelectTrigger className="h-8 w-20 text-xs"
                                                               aria-label="Recent files count">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {[3, 5, 8, 10, 15, 20].map((n) => (
                                                        <SelectItem key={n} value={String(n)}
                                                                    className="text-xs">{n}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<PanelBottom className="size-3.5"/>}
                                            label="Bottom panel tabs position"
                                            hint="Left (default) = the tabs stack one above the other in a vertical rail beside the output; Top = the classic side-by-side row"
                                        >
                                            <Select
                                                value={draft.bottomTabsPosition ?? "left"}
                                                onValueChange={(v) => update("bottomTabsPosition", v as "top" | "left")}
                                            >
                                                <SelectTrigger className="h-8 w-24 text-xs"
                                                               aria-label="Bottom panel tabs position">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="top" className="text-xs">Top</SelectItem>
                                                    <SelectItem value="left" className="text-xs">Left</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        {/* icon-only tab labels — the strip's own toggle
                button also flips this; the setting makes it persistent
                and discoverable via search. */}
                                        <SettingRow
                                            icon={<PanelBottom className="size-3.5"/>}
                                            label="Bottom panel tab labels"
                                            hint="Icon + name (classic) or icons only — saves horizontal space in the Output / Diagnostics / Notes strip"
                                        >
                                            <Select
                                                value={draft.bottomTabsIconOnly ? "icon" : "icon+name"}
                                                onValueChange={(v) => update("bottomTabsIconOnly", v === "icon")}
                                            >
                                                <SelectTrigger className="h-8 w-28 text-xs"
                                                               aria-label="Bottom panel tab labels">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="icon+name" className="text-xs">Icon +
                                                        name</SelectItem>
                                                    <SelectItem value="icon" className="text-xs">Icons only</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        {/* how long a freshly added favorite keeps its
                highlight before reverting to a plain star. */}
                                        <SettingRow
                                            icon={<Star className="size-3.5"/>}
                                            label="New-favorite highlight (seconds)"
                                            hint="How long a freshly added favorite keeps its ring + bold name before reverting to a plain star. 0 = no highlight"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={300}
                                                    value={draft.favHighlightSeconds ?? 10}
                                                    onChange={(e) => {
                                                        const n = parseInt(e.target.value || "10", 10);
                                                        update("favHighlightSeconds", Number.isFinite(n) ? Math.max(0, Math.min(300, n)) : 10);
                                                    }}
                                                    className="font-mono text-xs h-8 w-24"
                                                    aria-label="New-favorite highlight seconds"
                                                />
                                                <span
                                                    className="text-[10px] text-muted-foreground shrink-0">seconds</span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Warn when Python is missing"
                                            hint="Show a toast at startup when no working Python interpreter is found on this machine"
                                        >
                                            <Switch
                                                checked={draft.warnNoPython}
                                                onCheckedChange={(v) => update("warnNoPython", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Code2 className="size-3.5"/>}
                                                    label="Enable per-script notes">
                                            <Switch
                                                checked={draft.enableScriptNotes}
                                                onCheckedChange={(v) => update("enableScriptNotes", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ─── Typography ────────────────────────────────────────
              How the code viewer's text renders — font size, line
              height, letter spacing and programming ligatures. Split
              out of "Code viewer" so the most-used rows stay on top. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Type className="size-3"/>
                                            Typography
                                        </h3>
                                        <SettingRow icon={<Code2 className="size-3.5"/>} label="Code font size (px)">
                                            <Input
                                                type="number"
                                                min={10}
                                                max={20}
                                                value={draft.codeFontSize}
                                                onChange={(e) => {
                                                    // NaN guard — parseInt("abc") returns NaN, which
                                                    // would be saved to localStorage and survive across
                                                    // reloads. Fall back to 13 instead.
                                                    const n = parseInt(e.target.value || "13", 10);
                                                    update("codeFontSize", Number.isFinite(n) ? Math.max(10, Math.min(20, n)) : 13);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        {/* typography — line height + letter spacing.
                The slider+number pairs keep quick presets and precise
                values both one interaction away. */}
                                        <SettingRow icon={<Type className="size-3.5"/>} label="Line height"
                                                    hint="Vertical spacing between code lines (1.2 compact → 2.0 airy). The editor's measured line positions (cursor, highlight, ruler) follow automatically.">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range"
                                                    min={1.2}
                                                    max={2}
                                                    step={0.05}
                                                    value={draft.codeLineHeight}
                                                    onChange={(e) => update("codeLineHeight", Number(e.target.value))}
                                                    className="w-24 h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer"
                                                    aria-label="Code line height"
                                                />
                                                <Input
                                                    type="number"
                                                    min={1.2}
                                                    max={2}
                                                    step={0.05}
                                                    value={draft.codeLineHeight}
                                                    onChange={(e) => {
                                                        const n = parseFloat(e.target.value || "1.6");
                                                        update("codeLineHeight", Number.isFinite(n) ? Math.max(1.2, Math.min(2, n)) : 1.6);
                                                    }}
                                                    className="font-mono text-xs h-8 w-20"
                                                />
                                            </div>
                                        </SettingRow>
                                        <SettingRow icon={<Type className="size-3.5"/>} label="Letter spacing (px)"
                                                    hint="Horizontal spacing between glyphs. 0 = the font's default; positive values spread the code out (easier scanning), negative tightens it.">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range"
                                                    min={-0.5}
                                                    max={2}
                                                    step={0.1}
                                                    value={draft.codeLetterSpacing}
                                                    onChange={(e) => update("codeLetterSpacing", Number(e.target.value))}
                                                    className="w-24 h-1.5 rounded-full appearance-none bg-muted-foreground/25 accent-emerald-500 cursor-pointer"
                                                    aria-label="Code letter spacing"
                                                />
                                                <Input
                                                    type="number"
                                                    min={-0.5}
                                                    max={2}
                                                    step={0.1}
                                                    value={draft.codeLetterSpacing}
                                                    onChange={(e) => {
                                                        const n = parseFloat(e.target.value || "0");
                                                        update("codeLetterSpacing", Number.isFinite(n) ? Math.max(-0.5, Math.min(2, n)) : 0);
                                                    }}
                                                    className="font-mono text-xs h-8 w-20"
                                                />
                                            </div>
                                        </SettingRow>
                                        {/* JetBrains Mono programming ligatures —
                != → ≠, <= → ≤, >= → ≥, -> → →. The ligature glyphs
                occupy exactly the component sequence's width, so code
                alignment and column math are unaffected. */}
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Font ligatures (≠ ≤ ≥ →)"
                                            hint="Render comparison operators as single glyphs in the code font"
                                        >
                                            <Switch
                                                checked={draft.codeLigatures}
                                                onCheckedChange={(v) => update("codeLigatures", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ─── Naming style ─────────────────────────────────────
              Controls how identifiers and file names are written by
              the editor's Insert-block templates and the Examples
              library: one style per identifier kind. The select items
              show a live example of each style so the effect is
              obvious. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Type className="size-3"/>
                                            Naming style
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Applied to every identifier the editor generates — the
                                            Insert-block templates (function, class, for, figure, …)
                                            and the Examples menu, including the generated file names.
                                        </p>
                                        {([
                                            {
                                                key: "namingStyleVariables",
                                                label: "Variables",
                                                hint: "Local variables and parameters in inserted blocks.",
                                            },
                                            {
                                                key: "namingStyleFunctions",
                                                label: "Functions",
                                                hint: "Function and method names (def blocks, example scripts).",
                                            },
                                            {
                                                key: "namingStyleClasses",
                                                label: "Classes",
                                                hint: "Class names in class/dataclass blocks and examples.",
                                            },
                                            {
                                                key: "namingStyleDictKeys",
                                                label: "Dict keys / JSON fields",
                                                hint: "Dictionary keys in comprehension/read-JSON blocks and JSON templates.",
                                            },
                                            {
                                                key: "namingStyleFiles",
                                                label: "File names",
                                                hint: "Names of files created by the Examples menu.",
                                            },
                                        ] as {
                                            key: "namingStyleVariables" | "namingStyleFunctions" | "namingStyleClasses" | "namingStyleDictKeys" | "namingStyleFiles";
                                            label: string;
                                            hint: string;
                                        }[]).map((row) => (
                                            <SettingRow key={row.key} icon={<Type className="size-3.5"/>}
                                                        label={row.label} hint={row.hint}>
                                                <Select
                                                    value={draft[row.key]}
                                                    onValueChange={(v) => update(row.key, v as NamingStyle)}
                                                >
                                                    <SelectTrigger className="h-8 w-40 text-xs" aria-label={row.label}>
                                                        <SelectValue/>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {NAMING_STYLES.map((s) => (
                                                            <SelectItem key={s.value} value={s.value}
                                                                        className="text-xs">
                                                                {s.label}
                                                                <span
                                                                    className="ml-2 text-[10px] text-muted-foreground font-mono">
                          {s.example}
                        </span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </SettingRow>
                                        ))}
                                    </section>

                                    {/* ─── Editor assistance & files ────────────────────────
These rows used to sit directly under "Naming style"
with no header of their own. They are grouped under this section instead. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Wand2 className="size-3"/>
                                            Editor assistance &amp; files
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Smart-editor features that read your code as you work, plus
                                            editor ↔ file-system behaviors.
                                        </p>
                                        <SettingRow icon={<ListTree className="size-3.5"/>}
                                                    label="Show symbol outline (functions/classes)">
                                            <Switch
                                                checked={draft.showSymbolOutline}
                                                onCheckedChange={(v) => update("showSymbolOutline", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Crosshair className="size-3.5"/>}
                                                    label="Inline diagnostics (squiggly underlines from ruff/mypy)">
                                            <Switch
                                                checked={draft.inlineDiagnostics}
                                                onCheckedChange={(v) => update("inlineDiagnostics", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<GitBranch className="size-3.5"/>}
                                                    label="Show git diff gutter markers">
                                            <Switch
                                                checked={draft.showGitDiffGutter}
                                                onCheckedChange={(v) => update("showGitDiffGutter", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<GitCommitHorizontal className="size-3.5"/>}
                                            label="Show the git blame gutter"
                                            hint="Author + age per line group right in the editor (hover for the commit) — the editor twin of the Git Diff panel's blame mode."
                                        >
                                            <Switch
                                                checked={draft.showBlameGutter}
                                                onCheckedChange={(v) => update("showBlameGutter", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Activity className="size-3.5"/>}
                                            label="Show the performance HUD"
                                            hint="FPS, keystroke-to-paint latency, long tasks, SSE throughput, queue depths and per-panel render counts — regressions as numbers, before they're flicker."
                                        >
                                            <Switch
                                                checked={draft.showPerfHud}
                                                onCheckedChange={(v) => update("showPerfHud", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Auto-save delay (ms)"
                                            hint="0 = disabled. When >0, edits are auto-saved after this many ms of inactivity."
                                        >
                                            <div className="flex items-center gap-1.5">
                                                {/* one-click presets next to the raw input. */}
                                                {([
                                                    {label: "Off", v: 0},
                                                    {label: "1s", v: 1000},
                                                    {label: "5s", v: 5000},
                                                    {label: "30s", v: 30000},
                                                ] as const).map((p) => (
                                                    <button
                                                        key={p.label}
                                                        type="button"
                                                        onClick={() => update("autoSaveDelayMs", p.v)}
                                                        className={cn(
                                                            "px-1.5 py-1 rounded border text-[10px] font-mono transition-colors",
                                                            draft.autoSaveDelayMs === p.v
                                                                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                                                : "border-input bg-muted/40 text-muted-foreground hover:bg-muted"
                                                        )}
                                                        title={`Auto-save after ${p.v === 0 ? "is disabled" : `${p.v / 1000}s of inactivity`}`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={draft.autoSaveDelayMs}
                                                    onChange={(e) => {
                                                        // NaN guard — parseInt("abc") returns NaN; fall
                                                        // back to 0 (disabled) instead of persisting NaN.
                                                        const n = parseInt(e.target.value || "0", 10);
                                                        update("autoSaveDelayMs", Number.isFinite(n) ? Math.max(0, n) : 0);
                                                    }}
                                                    className="font-mono text-xs h-8 w-24"
                                                />
                                            </div>
                                        </SettingRow>
                                        {/* High-contrast mode now lives in the dedicated A11y tab. */}
                                        <SettingRow icon={<Search className="size-3.5"/>}
                                                    label="Show search/filter in output panel">
                                            <Switch
                                                checked={draft.outputSearchEnabled}
                                                onCheckedChange={(v) => update("outputSearchEnabled", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Database className="size-3.5"/>}
                                                    label="Auto-fold runs of identical output lines">
                                            <Switch
                                                checked={draft.collapsibleOutput}
                                                onCheckedChange={(v) => update("collapsibleOutput", v)}
                                            />
                                        </SettingRow>
                                        {/* ─── output word wrap + render limit ───────
VISIBLE SUB-GROUP HEADER (plan 4c): these output-panel
rows used to run on with no divider but a code
comment. */}
                                        <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                            Output panel
                                        </h4>
                                        <SettingRow
                                            icon={<WrapText className="size-3.5"/>}
                                            label="Output word wrap"
                                            hint="Soft-wrap long output lines (JetBrains “Use Soft Wraps”). Off = horizontal scrollbar. Also toggleable from the output panel's right-click menu."
                                        >
                                            <Switch
                                                checked={draft.outputWordWrap}
                                                onCheckedChange={(v) => update("outputWordWrap", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<AlignLeft className="size-3.5"/>}
                                            label="Output render limit (lines)"
                                            hint="Max lines of stdout/stderr the output panel renders per run — older lines drop from the display with a notice (copy/export still use the full output). 0 = no limit."
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                value={draft.outputBufferLimit}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update("outputBufferLimit", Number.isFinite(n) ? Math.max(0, n) : 0);
                                                }}
                                                className="font-mono text-xs h-8 w-24"
                                            />
                                        </SettingRow>
                                        <SettingRow icon={<Upload className="size-3.5"/>}
                                                    label="Enable drag-drop file upload (.py / .ipynb)">
                                            <Switch
                                                checked={draft.dragDropUpload}
                                                onCheckedChange={(v) => update("dragDropUpload", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* ── editor enhancements ── */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Eye className="size-3"/>
                                            Editor &amp; prose
                                        </h3>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Sticky scroll (headers pin while scrolling)"
                                            hint="The def/class header of the block you scroll through sticks to the top of the code viewer, VS Code style."
                                        >
                                            <Switch
                                                checked={draft.stickyScroll}
                                                onCheckedChange={(v) => update("stickyScroll", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<MessageSquareText className="size-3.5"/>}
                                            label="Symbol hover tooltips"
                                            hint="Show the floating card (diagnostic first, else the innermost def/class signature + docstring) when hovering Python lines in view mode. Off by default — enable it here."
                                        >
                                            <Switch
                                                checked={draft.hoverSymbolTooltips}
                                                onCheckedChange={(v) => update("hoverSymbolTooltips", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Symbol-path breadcrumbs"
                                            hint="The slim module > class > function bar above the editor — tracks the caret through the file's symbol index; every crumb jumps to its definition."
                                        >
                                            <Switch
                                                checked={draft.showBreadcrumbs}
                                                onCheckedChange={(v) => update("showBreadcrumbs", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Indent guides"
                                            hint="Faint vertical lines at every indentation multiple in the code viewer."
                                        >
                                            <Switch
                                                checked={draft.indentGuides}
                                                onCheckedChange={(v) => update("indentGuides", v)}
                                            />
                                        </SettingRow>
                                        {/* typewriter scrolling. */}
                                        <SettingRow
                                            icon={<Type className="size-3.5"/>}
                                            label="Typewriter scrolling"
                                            hint="Keep the caret vertically centered in the code viewer while typing (writers' mode). Also in View → editor chrome."
                                        >
                                            <Switch
                                                checked={draft.typewriterScroll}
                                                onCheckedChange={(v) => update("typewriterScroll", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Columns2 className="size-3.5"/>}
                                            label="Markdown studio for editing"
                                            hint="The Edit side of every .md file is the studio — a split editor with live preview, outline and stats. View keeps the rendered preview (with the read-only Source toggle)."
                                        >
                                            <span className="text-[10px] text-muted-foreground italic">Built-in — no toggle needed</span>
                                        </SettingRow>
                                        {/* Code Lens chips above each top-level
                def/class in edit mode (▶ Run · Usages · Rename · Tests). */}
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Code Lens"
                                            hint="Chips pinned to the right edge at every top-level def/class while editing: ▶ Run · Usages · Rename · Tests. Reuses the existing run / find-usages / rename / AI-test wiring."
                                        >
                                            <Switch
                                                checked={draft.codeLens}
                                                onCheckedChange={(v) => update("codeLens", v)}
                                            />
                                        </SettingRow>
                                        {/* ── RULER ON/OFF — the master switch ABOVE the position
+ width rows. Toggling OFF parks the current column in
rulerLastColumn and zeroes it; toggling ON restores it,
so a customized position survives the round trip.
VISIBLE SUB-GROUP HEADER (plan 4c): the three ruler
rows used to hang under the prose rows with no divider
but this code comment. */}
                                        <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                            Column ruler
                                        </h4>
                                        <SettingRow
                                            icon={<Ruler className="size-3.5"/>}
                                            label="Ruler"
                                            hint={"Master switch for the vertical column ruler — the same guide the Python editor draws, now rendered for EVERY code file in both view and edit mode. Off parks the column below in rulerLastColumn; On restores it. Config keys: rulerColumn (0 = off) + rulerLastColumn."}
                                        >
                                            <Switch
                                                checked={draft.rulerColumn > 0}
                                                onCheckedChange={(v) => {
                                                    if (v) {
                                                        const restore = draft.rulerLastColumn && draft.rulerLastColumn > 0 ? draft.rulerLastColumn : 80;
                                                        update("rulerColumn", restore);
                                                        if (draft.rulerLastColumn !== restore) update("rulerLastColumn", restore);
                                                    } else {
                                                        if (draft.rulerColumn > 0) update("rulerLastColumn", draft.rulerColumn);
                                                        update("rulerColumn", 0);
                                                    }
                                                }}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Column ruler"
                                            hint={"A vertical line at this column (0 = off, 80 = classic). Solid line — distinct from the dashed max-line-length hint. Config keys: rulerColumn (and rulerLineWidth) — editable ONLY here in Settings → Editor (the navbar cyclers were removed), or in <project-root>/.praxis/settings.json (project override)."}
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                max={120}
                                                value={draft.rulerColumn}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    const clamped = Number.isFinite(n) ? Math.max(0, Math.min(120, n)) : 0;
                                                    update("rulerColumn", clamped);
                                                    if (clamped > 0) update("rulerLastColumn", clamped);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        {/* ruler line WIDTH — the position above was
configurable but the hairline's thickness was hardcoded
1px. Now 1–6 px. */}
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Ruler line width"
                                            hint={"Thickness of the column-ruler guide in pixels (1 = classic hairline, 6 = bold). Only visible when the ruler column is not 0. Config key: rulerLineWidth — this dialog (Settings → Editor) or .praxis/settings.json."}
                                        >
                                            <Input
                                                type="number"
                                                min={1}
                                                max={6}
                                                value={draft.rulerLineWidth}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "1", 10);
                                                    update("rulerLineWidth", Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 1);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Tab expands snippets"
                                            hint="Typing a snippet trigger (def, class, try, dataclass… or your own snippet names) then Tab inserts the snippet body."
                                        >
                                            <Switch
                                                checked={draft.tabSnippetExpansion}
                                                onCheckedChange={(v) => update("tabSnippetExpansion", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Sparkles className="size-3.5"/>}
                                            label="Spell check markdown &amp; text files"
                                            hint="Read-mode files are checked against a dictionary that auto-detects the file's language from its prose (English by default); misspelled words get a wavy red underline, click one to add it to the project dictionary."
                                        >
                                            <Switch
                                                checked={draft.spellCheck}
                                                onCheckedChange={(v) => update("spellCheck", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Sparkles className="size-3.5"/>}
                                            label="Show fixing suggestions"
                                            hint="The misspelled-word popover also lists near-matches from the dictionary (“coment” → comment) — click one to copy it, ready to paste over the word."
                                        >
                                            <Switch
                                                checked={draft.spellSuggestions}
                                                onCheckedChange={(v) => update("spellSuggestions", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Sparkles className="size-3.5"/>}
                                            label="Suggestions shown"
                                            hint="How many fixing suggestions the misspelled-word popover lists (1–8)."
                                        >
                                            <Input
                                                type="number"
                                                min={1}
                                                max={8}
                                                value={draft.spellSuggestionCount}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "3", 10);
                                                    update("spellSuggestionCount", Number.isFinite(n) ? Math.max(1, Math.min(8, n)) : 3);
                                                }}
                                                className="font-mono text-xs h-8 w-20"
                                                disabled={!draft.spellSuggestions}
                                            />
                                        </SettingRow>
                                        {/* ─── the dictionary LANGUAGE — E20 multi-language
                spell dictionaries. "auto" (default) detects per file
                from the prose, server-side, so it works with zero
                client wiring; the explicit picks ride along as the
                POST body's `dict` field on the viewers' next check. */}
                                        <SettingRow
                                            icon={<Sparkles className="size-3.5"/>}
                                            label="Dictionary"
                                            hint="Which dictionary the spell check uses. Auto-detects the file's language from its prose (English · Español · Français · Deutsch · Italiano · Português · Русский) — the viewer sends this on the next check."
                                        >
                                            <Select
                                                value={draft.spellLanguage}
                                                onValueChange={(v) => update("spellLanguage", v as Settings["spellLanguage"])}
                                            >
                                                <SelectTrigger className="h-8 w-44 text-xs"
                                                               aria-label="Spell check dictionary">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="auto"
                                                                className="text-xs">Auto-detect</SelectItem>
                                                    <SelectItem value="english" className="text-xs">English</SelectItem>
                                                    <SelectItem value="spanish" className="text-xs">Español —
                                                        Spanish</SelectItem>
                                                    <SelectItem value="french" className="text-xs">Français —
                                                        French</SelectItem>
                                                    <SelectItem value="german" className="text-xs">Deutsch —
                                                        German</SelectItem>
                                                    <SelectItem value="italian" className="text-xs">Italiano —
                                                        Italian</SelectItem>
                                                    <SelectItem value="portuguese" className="text-xs">Português —
                                                        Portuguese</SelectItem>
                                                    <SelectItem value="russian" className="text-xs">Русский —
                                                        Russian</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                    </section>

                                    {/* ── Data file tables (CSV / TSV / Excel / parquet / feather) ──
              Presentation of the data-file viewers: zebra rows, a colored
              header band and colored numeric cells. Applied everywhere the
              data tables render — the file-tree CSV viewer, the Excel /
              parquet sheet viewer and the Data files browser preview. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <TableIcon className="size-3"/>
                                            Data file tables
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Presentation of the CSV / TSV / Excel / parquet / feather
                                            table viewers — in the file tree, the Data files browser and
                                            the sheet viewer.
                                        </p>
                                        <SettingRow
                                            icon={<TableIcon className="size-3.5"/>}
                                            label="Zebra rows"
                                            hint="Alternating row shading so long rows are easier to track across wide tables."
                                        >
                                            <Switch
                                                checked={draft.dataTableZebra}
                                                onCheckedChange={(v) => update("dataTableZebra", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<PaletteIcon className="size-3.5"/>}
                                            label="Colored header"
                                            hint="Emerald-tinted sticky header band, matching the app's data-file accents."
                                        >
                                            <Switch
                                                checked={draft.dataTableColoredHeader}
                                                onCheckedChange={(v) => update("dataTableColoredHeader", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Sigma className="size-3.5"/>}
                                            label="Colored numbers"
                                            hint="Numeric cells are right-aligned and colored — negatives red, positives green; booleans blue; NaN / None gray italics."
                                        >
                                            <Switch
                                                checked={draft.dataTableColoredNumbers}
                                                onCheckedChange={(v) => update("dataTableColoredNumbers", v)}
                                            />
                                        </SettingRow>
                                        {/* the column-stats band. */}
                                        <SettingRow
                                            icon={<Sigma className="size-3.5"/>}
                                            label="Column statistics band"
                                            hint="Per-column type / min / max / mean / unique / missing badges above every data table; the missing badge filters the rows."
                                        >
                                            <Switch
                                                checked={draft.dataTableStatsBand}
                                                onCheckedChange={(v) => update("dataTableStatsBand", v)}
                                            />
                                        </SettingRow>
                                    </section>
                                    {/* ── TESTING — the pytest watch mode (panel item G24).
              The Tests panel's header eye-toggle writes the SAME
              setting (persisted + broadcast via praxis:settings-saved),
              so this row and that switch always agree. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <FlaskConical className="size-3"/>
                                            Testing
                                        </h3>
                                        <SettingRow
                                            icon={<FlaskConical className="size-3.5"/>}
                                            label="Watch tests on save"
                                            hint="When on, the Tests panel re-runs the test files affected by every saved Python file — the saved test file itself, or the test files that import the changed module (debounced 800 ms). Per-test pass/fail feeds the editor gutter marks and the footer's test badge."
                                        >
                                            <Switch
                                                checked={draft.testWatchOnSave}
                                                onCheckedChange={(v) => update("testWatchOnSave", v)}
                                            />
                                        </SettingRow>
                                    </section>
                                </TabsContent>
                                {/* ──────────────────────────────────────────────────────────────
FOCUS TAB — the floating timer's full configuration plus
the ambient-sound engine, in their proper home (the user
asked for every earlier addition to live in the config).
Writes go straight to lib/focus-settings + lib/ambient,
which the running widget reacts to live.
────────────────────────────────────────────────────────────── */}
                                <TabsContent value="collaboration"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Users className="size-3"/>
                                            Live collaboration
                                        </h3>
                                        <SettingRow
                                            icon={<UserCircle className="size-3.5"/>}
                                            label="Display name"
                                            hint="What other participants see in the presence bar and the session roster."
                                        >
                                            <Input
                                                value={collabDraft.displayName}
                                                onChange={(e) => setCollabDraft((prev) => ({
                                                    ...prev,
                                                    displayName: e.target.value
                                                }))}
                                                onBlur={() => persistCollab()}
                                                placeholder="(generated guest name)"
                                                className="h-7 w-44 text-xs"
                                                aria-label="Collaboration display name"
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Palette className="size-3.5"/>}
                                            label="Cursor color"
                                            hint="Your presence color — cursors, avatars and selections use it."
                                        >
                                            <Select
                                                value={collabDraft.cursorColor}
                                                onValueChange={(v) => {
                                                    setCollabDraft((prev) => ({...prev, cursorColor: v}));
                                                    window.setTimeout(persistCollab, 0);
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-36 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {COLLAB_COLORS.map((c) => (
                                                        <SelectItem key={c} value={c}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2.5 rounded-full" style={{backgroundColor: c}}/>
                            {c}
                        </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<ShieldCheck className="size-3.5"/>}
                                            label="Guest permission"
                                            hint="What guests you invite can do: edit the buffers live, or read-only presence."
                                        >
                                            <Select
                                                value={collabDraft.guestPermission}
                                                onValueChange={(v) => {
                                                    setCollabDraft((prev) => ({
                                                        ...prev,
                                                        guestPermission: v as "read" | "edit"
                                                    }));
                                                    window.setTimeout(persistCollab, 0);
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-36 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="read">read-only</SelectItem>
                                                    <SelectItem value="edit">edit</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Follow mode by default"
                                            hint="When a session starts, follow the host's file/scroll position until you click somewhere yourself."
                                        >
                                            <Switch
                                                checked={collabDraft.autoFollow}
                                                onCheckedChange={(v) => {
                                                    setCollabDraft((prev) => ({...prev, autoFollow: v}));
                                                    window.setTimeout(persistCollab, 0);
                                                }}
                                            />
                                        </SettingRow>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed pt-1">
                                            Sessions run through the Collaborate menu (Share Workspace / Copy Invite
                                            Link /
                                            End Session). These defaults apply to every future session.
                                        </p>
                                    </section>
                                </TabsContent>

                                <TabsContent value="focus"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    {/* the Focus tab's 230 lines moved to
                components/settings/focus-tab.tsx. */}
                                    <FocusTabSection
                                        focusDraft={focusDraft}
                                        updateFocus={updateFocus}
                                        applyFocusPreset={applyFocusPreset}
                                        ambient={ambient}
                                        ambientGroups={ambientGroups}
                                        toggleAmbient={toggleAmbient}
                                        setAmbientMaster={setAmbientMaster}
                                        toast={toast}
                                    />
                                </TabsContent>

                                <TabsContent value="backup"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Database className="size-3"/>
                                            Cache management
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            These actions are destructive and cannot be undone. A
                                            confirmation dialog will appear before anything is deleted.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={() => setConfirmClear("cache")}
                                            >
                                                <Trash2 className="size-3.5"/>
                                                Clear Output Cache
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={() => setConfirmClear("history")}
                                            >
                                                <Trash2 className="size-3.5"/>
                                                Clear Run History
                                            </Button>
                                        </div>
                                    </section>

                                    {/* Backup — export / import the project's .praxis folder as a zip */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Download className="size-3"/>
                                            Backup
                                        </h3>
                                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                                            The buttons download / restore the ACTIVE project's <span
                                            className="font-mono">.praxis</span> folder
                                            (settings.json, appearance.json, notes.json, spell-ignore.json) as ONE zip —
                                            project-portable
                                            settings, not a browser-local dump.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={() => void handleExportBackup()}
                                                disabled={backupBusy}
                                                title="Download the active project's .praxis folder as praxis-settings-backup.zip"
                                            >
                                                {backupBusy ? <Loader2 className="size-3.5 animate-spin"/> :
                                                    <Download className="size-3.5"/>}
                                                Export settings
                                            </Button>
                                            <input
                                                type="file"
                                                accept=".zip"
                                                className="hidden"
                                                id="settings-import-zip"
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f) void handleImportBackup(f);
                                                    e.target.value = "";
                                                }}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={() => document.getElementById("settings-import-zip")?.click()}
                                                disabled={backupBusy}
                                                title="Restore a previously exported praxis-settings-backup.zip into this project's .praxis folder"
                                            >
                                                {backupBusy ? <Loader2 className="size-3.5 animate-spin"/> :
                                                    <Upload className="size-3.5"/>}
                                                Import settings
                                            </Button>
                                        </div>
                                    </section>

                                    {/* ── Settings profiles ──
One-click curated bundles for the three archetypes the
user approved (Student / Pro / Minimal). Each applies a
Partial<Settings> patch over the CURRENT draft (non-
destructive: keys the preset never mentions keep their
value) — then it saves immediately so the profile
survives even if the dialog is dismissed with Escape. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Sparkles className="size-3"/>
                                            Profiles
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            One-click starting points. Applying a profile patches the
                                            settings it lists and saves immediately; everything it
                                            doesn't mention keeps its current value. Export above to
                                            share your tuned profile.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-auto min-h-14 min-w-0 flex-col items-start gap-0.5 p-3 text-left whitespace-normal"
                                                onClick={() => {
                                                    // profiles flow through applyProfile — the
                                                    // same patch + save + broadcast + project-mirror the
                                                    // plain Save uses (see the comment there).
                                                    applyProfile("Student", {
                                                        // Inline AI help while learning.
                                                        aiCompletionEnabled: true,
                                                        // Guard rails: never lose work, always see errors.
                                                        autoSaveDelayMs: 1500,
                                                        autoSaveOnBlur: true,
                                                        autoFormatOnSave: true,
                                                        confirmCloseUnsavedTab: true,
                                                        autoSwitchToDiagnosticsOnError: true,
                                                        autoSwitchToOutputOnRun: true,
                                                        // Gentle run posture.
                                                        runTimeoutSeconds: 60,
                                                        runDurationWarningThreshold: 10,
                                                        confirmRunAll: true,
                                                        warnNoPython: true,
                                                        // Learning aids.
                                                        enableScriptNotes: true,
                                                        showSymbolOutline: true,
                                                        inlineDiagnostics: true,
                                                        codeFolding: true,
                                                        codeFontSize: 14,
                                                    });
                                                }}
                                                title="Learning-friendly: inline AI help, autosave + auto-format, jump to errors, notes + symbol outline, bigger code"
                                            >
                <span className="flex items-center gap-1.5 font-semibold text-xs">
                  <GraduationCap className="size-3.5 text-sky-500"/>
                  Student
                </span>
                                                <span
                                                    className="w-full text-[10px] text-muted-foreground font-normal leading-snug">
                  Inline AI help, autosave + auto-format, jump to errors, notes & outline, larger code
                </span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-auto min-h-14 min-w-0 flex-col items-start gap-0.5 p-3 text-left whitespace-normal"
                                                onClick={() => {
                                                    // profiles flow through applyProfile (see
                                                    // the Student button / the helper comment).
                                                    applyProfile("Pro", {
                                                        // Full power posture.
                                                        aiCompletionEnabled: true,
                                                        inspectVariables: true,
                                                        captureDataframes: true,
                                                        runTimeoutSeconds: 300,
                                                        runDurationWarningThreshold: 0,
                                                        runNotifyMode: "hidden",
                                                        historyMaxEntries: 40,
                                                        // Move fast without losing anything.
                                                        autoSaveDelayMs: 800,
                                                        autoFormatOnSave: true,
                                                        // Editor power features.
                                                        stickyScroll: true,
                                                        showMinimap: true,
                                                        showGitDiffGutter: true,
                                                        highlightCurrentLine: true,
                                                    });
                                                }}
                                                title="Power-user: 5-minute runs, no duration warnings, variable inspection + dataframe capture, sticky scroll, minimap, git gutters, longer history"
                                            >
                <span className="flex items-center gap-1.5 font-semibold text-xs">
                  <Zap className="size-3.5 text-amber-500"/>
                  Pro
                </span>
                                                <span
                                                    className="w-full text-[10px] text-muted-foreground font-normal leading-snug">
                  5-min runs, variable & dataframe capture, sticky scroll, minimap, git gutters
                </span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-auto min-h-14 min-w-0 flex-col items-start gap-0.5 p-3 text-left whitespace-normal"
                                                onClick={() => {
                                                    // profiles flow through applyProfile (see
                                                    // the Student button / the helper comment).
                                                    applyProfile("Minimal", {
                                                        // Distraction-free editing.
                                                        aiCompletionEnabled: false,
                                                        inlineDiagnostics: false,
                                                        showMinimap: false,
                                                        showSymbolOutline: false,
                                                        showRecentFiles: false,
                                                        showGitStatus: false,
                                                        showFolderSize: false,
                                                        showFileSizeInDropdown: false,
                                                        showWhitespace: false,
                                                        // Quiet panels and chrome.
                                                        bottomTabsIconOnly: true,
                                                        autoSwitchToOutputOnRun: false,
                                                        autoSwitchToDiagnosticsOnError: false,
                                                        toastDuration: 2500,
                                                        actionNotifications: false,
                                                        runNotifyMode: "off",
                                                    });
                                                }}
                                                title="Distraction-free: no completion popups, no inline diagnostics, no minimap/outline/recents/git chips, icon-only tabs, quiet toasts"
                                            >
                <span className="flex items-center gap-1.5 font-semibold text-xs">
                  <Moon className="size-3.5 text-indigo-500"/>
                  Minimal
                </span>
                                                <span
                                                    className="w-full text-[10px] text-muted-foreground font-normal leading-snug">
                  No popups or inline hints, no minimap/outline, icon-only tabs, quiet toasts
                </span>
                                            </Button>
                                        </div>
                                    </section>


                                    {/* Keyboard shortcuts reference */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Keyboard className="size-3"/>
                                            Keyboard Shortcuts
                                        </h3>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            {[
                                                ["Ctrl+K", "Search scripts"],
                                                ["⌘⇧H", "Run history"],
                                                ["Ctrl+/", "Snippet palette"],
                                                ["Ctrl+Enter", "Run script"],
                                                ["Ctrl+,", "Toggle theme"],
                                            ].map(([key, desc]) => (
                                                <div key={key} className="flex items-center gap-2">
                                                    <kbd
                                                        className="px-1.5 py-0.5 rounded bg-muted text-foreground/80 font-mono text-[10px]">
                                                        {key}
                                                    </kbd>
                                                    <span className="text-muted-foreground">{desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </TabsContent>

                                {/* Accessibility options live in the Tools → Accessibility
              sub-menu on the top menu bar — no separate settings tab
              to avoid redundancy. The sub-menu has all 14 toggles
              with checkmarks + tooltips. */}

                                {/* Advanced section — editor enhancements, panel/run behavior,
              AI, sidebar */}
                                <TabsContent value="advanced"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    {/* Panel / run behavior section — new cog options that make
              the app more dynamic and configurable. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Terminal className="size-3"/>
                                            Panel & run behavior
                                        </h3>
                                        <SettingRow
                                            icon={<Terminal className="size-3.5"/>}
                                            label="Default bottom panel tab"
                                            hint="Which tab is active when a script is selected: Output, Diagnostics, or Notes."
                                        >
                                            <Select
                                                value={draft.defaultBottomTab}
                                                onValueChange={(v) => update("defaultBottomTab", v as "output" | "diag" | "notes")}
                                            >
                                                <SelectTrigger className="h-8 w-32 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="output">Output</SelectItem>
                                                    <SelectItem value="diag">Diagnostics</SelectItem>
                                                    <SelectItem value="notes">Notes</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Terminal className="size-3.5"/>}
                                            label="Auto-switch to Output on run"
                                            hint="When a run starts, switch the bottom panel to the Output tab automatically."
                                        >
                                            <Switch
                                                checked={draft.autoSwitchToOutputOnRun}
                                                onCheckedChange={(v) => update("autoSwitchToOutputOnRun", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Wrench className="size-3.5"/>}
                                            label="Auto-switch to Diagnostics on error"
                                            hint="When a lint/typecheck finishes with errors, switch the bottom panel to the Diagnostics tab."
                                        >
                                            <Switch
                                                checked={draft.autoSwitchToDiagnosticsOnError}
                                                onCheckedChange={(v) => update("autoSwitchToDiagnosticsOnError", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Terminal className="size-3.5"/>}
                                            label="Default run mode"
                                            hint="Which mode the Run button uses by default: normal or coverage. (Sandbox mode was removed — the server never implemented isolation; re-add once firejail/bwrap/docker support lands.)"
                                        >
                                            <Select
                                                value={draft.defaultRunMode === "sandbox" ? "normal" : draft.defaultRunMode}
                                                onValueChange={(v) => update("defaultRunMode", v as "normal" | "coverage")}
                                            >
                                                <SelectTrigger className="h-8 w-32 text-xs">
                                                    <SelectValue/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="normal">Normal</SelectItem>
                                                    <SelectItem value="coverage">Coverage</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </SettingRow>
                                        <SettingRow
                                            icon={<StickyNote className="size-3.5"/>}
                                            label="Confirm before closing unsaved tab"
                                            hint="When you close an editor tab with unsaved changes, ask first."
                                        >
                                            <Switch
                                                checked={draft.confirmCloseUnsavedTab}
                                                onCheckedChange={(v) => update("confirmCloseUnsavedTab", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Auto-save on tab blur"
                                            hint="Save the active script when its tab loses focus, in addition to the auto-save debounce."
                                        >
                                            <Switch
                                                checked={draft.autoSaveOnBlur}
                                                onCheckedChange={(v) => update("autoSaveOnBlur", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Eye className="size-3.5"/>}
                                            label="Show cursor position in footer"
                                            hint="Display the current line:column in the footer (useful for tracking location)."
                                        >
                                            <Switch
                                                checked={draft.showCursorPositionInFooter}
                                                onCheckedChange={(v) => update("showCursorPositionInFooter", v)}
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* Editor enhancements — the code viewer's view-mode features
              (folding, minimap, Prism highlighting, whitespace, hints). */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Code2 className="size-3"/>
                                            Editor enhancements
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            These features enhance the code viewer in view mode (read-only).
                                            The edit mode uses a lightweight textarea for reliability.
                                        </p>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Code folding (view mode)"
                                            hint="Click the chevron next to a def/class/for/if/while/try/with line in view mode to collapse just that block. Reduces visual noise on long files. Each chevron sits in its own dedicated gutter to the left of the line numbers."
                                        >
                                            <Switch
                                                checked={draft.codeFolding}
                                                onCheckedChange={(v) => update("codeFolding", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Minimap (view mode)"
                                            hint="Shows a scaled-down overview of the entire file on the right edge of the code viewer."
                                        >
                                            <Switch
                                                checked={draft.showMinimap}
                                                onCheckedChange={(v) => update("showMinimap", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Code2 className="size-3.5"/>}
                                            label="Syntax highlighting"
                                            hint="When on, syntax highlighting runs in a REAL tokenization Worker (src/lib/highlight-worker.ts) — the whole file is tokenized off the main thread and the painted output is pixel-identical to the classic path; long files never freeze the tab. When off (or if the worker is unavailable), Prism runs on the main thread as the fallback."
                                        >
                                            <Switch
                                                checked={draft.webWorkerHighlighting}
                                                onCheckedChange={(v) => update("webWorkerHighlighting", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Highlighter className="size-3.5"/>}
                                            label="Highlight current line"
                                            hint="Draws a subtle background on the line under the mouse / caret so you can track your place."
                                        >
                                            <Switch
                                                checked={draft.highlightCurrentLine}
                                                onCheckedChange={(v) => update("highlightCurrentLine", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Blocks className="size-3.5"/>}
                                            label="Extensions system"
                                            hint="Master toggle for the sandboxed mini-plugin runtime (Tools ▸ Extensions manages the individual first-party examples)."
                                        >
                                            <Switch
                                                checked={draft.extensionsEnabled !== false}
                                                onCheckedChange={(v) => update("extensionsEnabled", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Hash className="size-3.5"/>}
                                            label="Show whitespace"
                                            hint="Surface trailing whitespace and tab/space differences in the code viewer."
                                        >
                                            <Switch
                                                checked={draft.showWhitespace}
                                                onCheckedChange={(v) => update("showWhitespace", v)}
                                            />
                                        </SettingRow>
                                        <SettingRow
                                            icon={<Clock className="size-3.5"/>}
                                            label="Max line length hint"
                                            hint="Shows a soft warning gutter marker on lines longer than this many characters. 0 = disabled. PEP 8 defaults: 79 (strict) / 99 (modern)."
                                        >
                                            <Input
                                                type="number"
                                                min={0}
                                                max={1000}
                                                value={draft.maxLineLengthHint}
                                                onChange={(e) => {
                                                    const n = parseInt(e.target.value || "0", 10);
                                                    update("maxLineLengthHint", Number.isFinite(n) ? Math.max(0, Math.min(1000, n)) : 0);
                                                }}
                                                className="font-mono text-xs h-8 w-32"
                                            />
                                        </SettingRow>
                                    </section>

                                    {/* The AI section (aiCompletionEnabled + the new integrated
              assistant settings) lives in the AI tab now, not here.
              See the "Integrated AI assistant" section in the AI tab. */}

                                    {/* Sidebar section */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <FolderClosed className="size-3"/>
                                            Sidebar
                                        </h3>
                                        <SettingRow icon={<FolderClosed className="size-3.5"/>}
                                                    label="Show per-folder file-size stats in sidebar">
                                            <Switch
                                                checked={draft.showFolderSize}
                                                onCheckedChange={(v) => update("showFolderSize", v)}
                                            />
                                        </SettingRow>
                                    </section>
                                </TabsContent>

                                {/* Project settings tab — save / reset / clear the per-project
              override file at <project-root>/.praxis/settings.json. */}
                                <TabsContent value="project"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <FolderCog className="size-3"/>
                                            Project settings
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Project settings live in <code
                                            className="font-mono">.praxis/settings.json</code>{" "}
                                            at the active project&apos;s root and override your global
                                            (browser-localStorage)
                                            settings when that project is active. Useful for per-project interpreter
                                            paths,
                                            run timeouts, capture flags, etc.
                                            <span className="block mt-1.5">
 <strong>:</strong> the dialog&apos;s main <strong>Save</strong> button now also writes a copy
                  of your settings to <code className="font-mono">.praxis/settings.json</code> (AI provider keys stay
                  browser-local) — the folder always holds the current settings, never sits empty. The
                  file is created with your settings the first time a project opens, and loaded from
                  there on every later open (PyCharm .idea-style).
                </span>
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={handleSaveProjectSettings}
                                                disabled={!onSaveProjectSettings}
                                            >
                                                <Save className="size-3.5"/>
                                                Save As Project Settings
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                                                onClick={handleClearProjectSettings}
                                                disabled={!onClearProjectSettings || overriddenKeys.size === 0}
                                            >
                                                <Trash2 className="size-3.5"/>
                                                Clear All Project Settings
                                            </Button>
                                        </div>
                                    </section>

                                    {/* Active overrides list — each row shows the key, its
                project value, and a "Reset To Global" button. */}
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <FolderCog className="size-3"/>
                                            Active overrides ({overriddenKeys.size})
                                        </h3>
                                        {overriddenKeys.size === 0 ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                No project overrides active for this project. Click
                                                &ldquo;Save as project settings&rdquo; to capture the current
                                                settings into the project file.
                                            </p>
                                        ) : (
                                            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                                {Object.entries(projectOverrides ?? {}).map(([key, value]) => (
                                                    <div
                                                        key={key}
                                                        className="flex items-center justify-between gap-3 py-1 border-b last:border-b-0"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span
                                                                    className="text-sm font-mono text-foreground">{key}</span>
                                                                <Badge variant="outline"
                                                                       className="text-[9px] uppercase tracking-wider">
                                                                    project
                                                                </Badge>
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground font-mono truncate">
                                                                {formatSettingValue(value)}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs shrink-0"
                                                            onClick={() => handleResetProjectKey(key as keyof Settings)}
                                                            disabled={!onResetProjectKey}
                                                            title="Remove this override — the global value will take effect"
                                                        >
                                                            <RotateCcw className="size-3"/>
                                                            Reset To Global
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </TabsContent>

                                {/* Keyboard shortcuts tab — rebind any shortcut. The actual
              global handlers in use-keyboard-shortcuts.ts still read
              hardcoded keys (TODO: wire them to these custom bindings);
              for now the customization is saved + surfaced in the Help →
              Keyboard shortcuts dialog. */}
                                <TabsContent value="shortcuts"
                                             className="space-y-2.5 mt-3 [&>section+section]:mt-4 [&>section+section]:border-t [&>section+section]:pt-3">
                                    <section className="space-y-2.5">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                            <Keyboard className="size-3"/>
                                            Keyboard Shortcuts
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Click a key binding to record a new one. Press the desired
                                            key combination (with ⌘/Ctrl, ⇧, ⌥ modifiers as needed),
                                            then release. Press <kbd
                                            className="font-mono text-[10px] px-1 py-0.5 rounded border bg-muted/50">Esc</kbd>{" "}
                                            to cancel recording. Custom bindings are stored in
                                            localStorage and shown in the Help → Keyboard shortcuts dialog.
                                            Rebinding is live — custom shortcuts override the defaults
                                            immediately.
                                        </p>
                                        {/* conflict banner — the just-recorded combo is
                  already owned by another action; nothing was saved. */}
                                        {shortcutConflict && (
                                            <div
                                                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                                                <TriangleAlert className="size-3.5 shrink-0 mt-0.5"/>
                                                <div className="min-w-0">
                                                    <span
                                                        className="font-mono font-semibold">{shortcutConflict.combo}</span>{" "}
                                                    is already bound to{" "}
                                                    <span className="font-medium">{shortcutConflict.ownerAction}</span>.
                                                    Nothing was
                                                    saved — pick a different combination, or rebind the other action
                                                    first.
                                                    <button
                                                        type="button"
                                                        className="ml-2 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
                                                        onClick={() => setShortcutConflict(null)}
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                                            {SHORTCUT_GROUPS.map((g) => (
                                                <div key={g.group} className="space-y-1.5">
                                                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                        {g.group}
                                                    </h4>
                                                    {g.items.map((it) => {
                                                        const custom = customShortcuts[it.id];
                                                        const isRecording = recordingId === it.id;
                                                        return (
                                                            <div
                                                                key={it.id}
                                                                className="flex items-center justify-between gap-3 py-1"
                                                            >
                          <span className="text-sm text-foreground/80 min-w-0 flex-1 truncate">
                            {it.action}
                              {custom && (
                                  <Badge variant="outline"
                                         className="ml-1.5 text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                      custom
                                  </Badge>
                              )}
                          </span>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setRecordingId(isRecording ? null : it.id)}
                                                                        className={cn(
                                                                            "font-mono text-[10px] px-2 py-1 rounded border transition-colors min-w-[80px] text-center",
                                                                            isRecording
                                                                                ? "border-emerald-400 ring-2 ring-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                                                                                : "bg-muted/50 text-foreground hover:bg-muted"
                                                                        )}
                                                                        title={isRecording ? "Press keys… (Esc to cancel)" : "Click to rebind"}
                                                                    >
                                                                        {isRecording ? "Press keys…" : (custom ?? it.keys)}
                                                                    </button>
                                                                    {custom && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-7 px-2 text-xs"
                                                                            onClick={() => {
                                                                                setCustomShortcuts((prev) => {
                                                                                    const next = {...prev};
                                                                                    delete next[it.id];
                                                                                    saveCustomShortcuts(next);
                                                                                    return next;
                                                                                });
                                                                            }}
                                                                            title="Reset to default binding"
                                                                        >
                                                                            <RotateCcw className="size-3"/>
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </TabsContent>
                            </div>
                        </Tabs>
                    )}

                    <DialogFooter className="shrink-0 gap-2 border-t px-6 py-3 bg-background">
                        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
                            <RotateCcw className="size-3.5"/>
                            Reset To Defaults
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>

                {/* Confirmation dialog for destructive cache / history actions. */}
                <AlertDialog
                    open={confirmClear !== null}
                    onOpenChange={(v) => {
                        if (!v) setConfirmClear(null);
                    }}
                >
                    <AlertDialogContent className="sm:max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <Trash2 className="size-5 text-destructive"/>
                                {confirmClear === "cache" ? "Clear output cache?" : "Clear run history?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {confirmClear === "cache"
                                    ? "This will permanently delete all cached run outputs stored in your browser's localStorage. The scripts themselves are not affected. This action cannot be undone."
                                    : "This will permanently delete all entries in the run history drawer. The scripts themselves are not affected. This action cannot be undone."}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                onClick={async () => {
                                    if (confirmClear === "cache") {
                                        const {clearCache} = await import("@/lib/output-cache");
                                        clearCache();
                                    } else if (confirmClear === "history") {
                                        const {saveHistory} = await import("@/components/run-history");
                                        saveHistory([]);
                                    }
                                    setConfirmClear(null);
                                }}
                            >
                                {confirmClear === "cache" ? "Clear cache" : "Clear history"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </Dialog>
        </SettingsRowContext.Provider>
    );
}

function SettingRow({
                        icon,
                        label,
                        hint,
                        children,
                    }: {
    icon: React.ReactNode;
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    const ctx = React.useContext(SettingsRowContext);
    // Reverse-lookup the Settings key for this row's label so we can
    // (a) tag the row with a stable id for scroll-into-view, and
    // (b) check whether the setting is project-overridden.
    const key = LABEL_TO_KEY.get(label);
    // Row id: the entry's rowId when present (shared-key rows like the
    // three defaultCaptureMode kinds) — otherwise the key. Unique per
    // row, so search-jump highlights and scrolls to the EXACT row.
    const rowId = LABEL_TO_ROW_ID.get(label);
    const isHighlighted = label === ctx.highlightedLabel;
    const isOverridden = key ? ctx.overriddenKeys.has(key) : false;
    return (
        <div
            id={rowId ? `setting-row-${rowId}` : undefined}
            className={cn(
                "flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 py-1 px-1 -mx-1 rounded transition-colors",
                isHighlighted && "ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
            )}
        >
            <div className="flex items-start gap-2 min-w-0 flex-1">
                {/* 3px top offset — centers a 14px (size-3.5) icon
against the FIRST line of the text-sm label (20px line box:
(20−14)/2 = 3px). The old mt-0.5 (2px) left icons ~1–2px
too HIGH next to the text. */}
                <span className="text-muted-foreground mt-[3px] shrink-0">{icon}</span>
                <div className="min-w-0">
                    <Label className="text-sm font-normal cursor-default flex items-center gap-1.5">
                        {label}
                        {isOverridden && (
                            <Badge variant="outline"
                                   className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                project
                            </Badge>
                        )}
                    </Label>
                    {hint && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  SearchResultsView — flat list of matching settings                 */

/* ------------------------------------------------------------------ */
/**
 * Renders the flat search-results list shown when the search box has
 * a non-empty query. Each row shows the setting label, its current
 * value, and a badge for the tab it belongs to. Clicking a row jumps
 * to that tab + highlights the row.
 */
function SearchResultsView({
                               results,
                               draft,
                               onSelect,
                           }: {
    results: SettingIndexEntry[];
    draft: Settings;
    onSelect: (entry: SettingIndexEntry) => void;
}) {
    if (results.length === 0) {
        return (
            <div className="py-8 text-center text-sm text-muted-foreground">
                No settings match your search.
            </div>
        );
    }
    return (
        <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
            {results.map((entry) => (
                <button
                    key={`${entry.tab}-${entry.rowId ?? (entry.key as string)}`}
                    type="button"
                    onClick={() => onSelect(entry)}
                    className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded text-left hover:bg-accent transition-colors group"
                >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                        <CornerDownLeft
                            className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0"/>
                        <div className="min-w-0">
                            <div className="text-sm text-foreground truncate">{entry.label}</div>
                            {entry.hint && (
                                <div className="text-[11px] text-muted-foreground truncate">{entry.hint}</div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground font-mono max-w-[160px] truncate">
              {formatSettingValue(draft[entry.key])}
            </span>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider shrink-0">
                            {TAB_LABELS[entry.tab] ?? entry.tab}
                        </Badge>
                    </div>
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Thin open-gated wrapper                                            */

/* ------------------------------------------------------------------ */
/**
 * PERF wrapper — see SettingsDialogInner's header. Mounts the heavy
 * body only while open (plus a 220 ms hold after close so the Radix
 * exit animation plays), so a closed settings dialog costs ZERO
 * hook work no matter how often the parent re-renders.
 */
export function SettingsDialog(props: SettingsDialogProps) {
    const {open} = props;
    const [rendered, setRendered] = React.useState(open);
    React.useEffect(() => {
        if (open) {
            setRendered(true);
            return;
        }
        const t = setTimeout(() => setRendered(false), 220);
        return () => clearTimeout(t);
    }, [open]);
    if (!rendered) return null;
    return <SettingsDialogInner {...props} />;
}
