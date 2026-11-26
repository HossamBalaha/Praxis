"use client";

import * as React from "react";
import {useMiddleMousePan} from "@/lib/middle-pan";
import {
    Accessibility,
    AlignLeft,
    Archive,
    ArrowDownAZ,
    ArrowRightLeft,
    ArrowUpDown,
    AudioWaveform,
    Award,
    BarChart3,
    Bell,
    BellOff,
    Binary,
    Blocks,
    Bookmark,
    BookmarkPlus,
    BookOpen,
    Bot,
    Braces,
    Brain,
    Bug,
    CalendarClock,
    Camera,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ClipboardPaste,
    Clock3,
    Code2,
    CodeXml,
    Coffee,
    Columns2,
    Command,
    Contrast,
    Copy,
    CopyMinus,
    CornerDownLeft,
    Cpu,
    Crosshair,
    Database,
    Database as DatabaseIcon,
    Download,
    Eraser,
    Expand,
    ExternalLink,
    Eye,
    EyeOff,
    FileClock,
    FileCode,
    FileCode2,
    FileMinus,
    FileOutput,
    FilePlus,
    FileSearch,
    FileText,
    FlaskConical,
    Focus,
    FolderOpen,
    FolderPlus,
    FolderSearch,
    FoldVertical,
    FunctionSquare,
    Gauge,
    GitBranch,
    GitCommitHorizontal,
    Github,
    GitMerge,
    Globe,
    GraduationCap,
    Hash,
    HelpCircle,
    Highlighter,
    History,
    Image as ImageIcon,
    IndentIncrease,
    Keyboard,
    Layers,
    LayoutGrid,
    Library,
    Link2,
    ListChecks,
    ListOrdered,
    ListTree,
    ListVideo,
    Loader2,
    Mail,
    MapPin,
    Maximize2,
    Merge,
    Monitor,
    Moon,
    MousePointerSquareDashed,
    MoveHorizontal,
    Package,
    Palette as PaletteIcon,
    Palette,
    PanelBottom,
    Pause as PauseIcon,
    PhoneOff,
    Pin,
    Play,
    Redo2,
    RefreshCw,
    Replace,
    RotateCcw,
    Save,
    Scissors,
    Search,
    Settings as SettingsIcon,
    Share2,
    Shuffle,
    Sidebar as SidebarIcon,
    Sigma,
    SkipForward,
    Space,
    Sparkles,
    SpellCheck2,
    Square,
    SquareSigma,
    SquareTerminal,
    SquareX,
    Sun,
    Table,
    Terminal,
    TerminalSquare,
    TextSelect,
    Timer as TimerIcon,
    Type,
    Undo2,
    UnfoldVertical,
    Upload,
    UserRound,
    Users,
    Volume2,
    VolumeX,
    Wand2,
    Workflow,
    WrapText,
    XCircle,
    Zap,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import type {FileExample} from "@/lib/examples";
import {loadSettings} from "@/lib/settings";
// the ~5 MB example library is now a lazy dynamic chunk
// (src/hooks/use-examples.ts) — see the hook's header comment.
import {useExamples} from "@/hooks/use-examples";
import {
    Menubar,
    MenubarCheckboxItem,
    MenubarContent,
    MenubarItem,
    MenubarLabel,
    MenubarMenu,
    MenubarSeparator,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger,
} from "@/components/ui/menubar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {cn} from "@/lib/utils";
import {exportCapabilitiesForKind} from "@/lib/export-events";
import {capabilitiesForKind, capabilityHint} from "@/lib/file-capabilities";
import {useTheme} from "next-themes";
import {useToast} from "@/hooks/use-toast";
import {askExternalAi} from "@/components/ask-ai-button";
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip";
import {AMBIENT_TRACK_COUNT, toggleAmbient, useAmbientState,} from "@/lib/ambient";
import {loadCustomShortcuts, SHORTCUT_GROUPS,} from "@/lib/shortcuts";
import {useChromeLanguage} from "@/lib/i18n-react";
// the Window menu's named layout presets + cycler.
import {LAYOUT_PRESETS} from "@/lib/layout-presets";
import {UI_THEMES, uiThemeById} from "@/lib/ui-themes";
// the ONE shared Developer-Toolbox icon map (toolbox/toolbox-icons.tsx)
// — the Tools / Data menu items, the top-bar wrench button and the
// dialog itself all look icons up there, so a category (and the
// toolbox entity) can never show two different glyphs.
import {TOOLBOX_ICON as ToolboxIcon,} from "@/components/toolbox/toolbox-icons";

// the Converters category glyph — the Data ▸ Convert Formats… entry
// opens the Converters category, so it carries that category's icon.

/** Tooltip wrapper for menu items — a styled, fast-appearing tooltip
 * (250 ms) on hover, so EVERY option explains itself. Used across
 * menus (native title tooltips are kept
 * as the accessible fallback). */
function Tip({
                 tip,
                 side = "right",
                 children,
             }: {
    tip: string;
    side?: "top" | "right" | "bottom" | "left";
    children: React.ReactElement;
}) {
    return (
        <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side} sideOffset={4} className="max-w-[280px] text-xs leading-relaxed">
                {tip}
            </TooltipContent>
        </Tooltip>
    );
}

/** A single top-level menu in the bar (File / Edit / View / Run / Help). */
interface MenuBarProps {
    // ─── File menu ─────────────────────────────────────────────────
    onNewFolder?: () => void;
    onNewFile?: () => void;
    /** Create a ready-made example file (Examples menu) into the
     *  selected folder (or the first folder). Receives the example id
     *  from src/lib/examples.ts. */
    onCreateExample?: (exampleId: string) => void;
    onUploadZip?: () => void;
    /** File ▸ Open from GitHub URL… — shallow-imports a repo / gist
     *  into the workspace (the OpenFromUrlDialog). */
    onOpenFromUrl?: () => void;
    /** File ▸ Publish Snapshot Link — encodes the current workspace
     *  into a shareable URL hash that boots Praxis preloaded. */
    onPublishSnapshot?: () => void;
    onSave?: () => void;
    onSaveAll?: () => void;
    /** close every open editor tab — the workspace then
     *  renders as a solid blank area until another file is opened
     *  (VS Code's File → Close All Editors). */
    onCloseAllEditors?: () => void;
    onDownload?: () => void;
    onOpenSettings?: (tab?: string) => void;
    // Project switcher (moved here from the Explorer sidebar)
    projects?: { name: string; path: string; scriptCount: number }[];
    activeProject?: string;
    onSelectProject?: (projectPath: string) => void;
    onCreateProject?: () => void;
    /** Opens the FolderPickerDialog — browse the projects directory
     *  tree and open any folder in it as the active project. */
    onBrowseProjectFolder?: () => void;
    // ─── Edit menu ─────────────────────────────────────────────────
    onUndo?: () => void;
    onRedo?: () => void;
    onCut?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
    onFind?: () => void;
    onReplace?: () => void;
    onFindInFiles?: () => void;
    onFormat?: () => void;
    /** Edit ▸ Organize Imports — ruff's import-block pass (`--select I
     *  --fix`) over the live editor buffer (Python files only; the item
     *  mirrors Format Document's kind gating). */
    onOrganizeImports?: () => void;
    /** re-indent the current file to the configured
     *  style (Settings → Editor → Indentation) — the navbar entry of
     *  the Auto-indent action (also on the editor's + a file's right-click). */
    onAutoIndent?: () => void;
    // ─── View menu ─────────────────────────────────────────────────
    onToggleSidebar?: () => void;
    onToggleBottomPanel?: () => void;
    sidebarVisible?: boolean;
    bottomPanelOpen?: boolean;
    onIncreaseFontSize?: () => void;
    onDecreaseFontSize?: () => void;
    // reset (⌘0) — back to the default code font size.
    onResetFontSize?: () => void;
    onRefresh?: () => void;
    refreshing?: boolean;
    onOpenSearch?: () => void;
    // ─── Goto / IDE menu ───────────────────────────────────────────
    onOpenSymbolPalette?: () => void;
    onOpenLocalHistory?: () => void;
    onToggleDistractionFree?: () => void;
    distractionFree?: boolean;
    // ─── additions ────────────────────────────────────────
    /** View ▸ Fullscreen — toggles the BROWSER's fullscreen API (plain
     *  F11; ⇧F11 stays distraction-free mode). */
    onToggleFullscreen?: () => void;
    /** View ▸ Terminal panel — opens (or closes) the integrated
     *  terminal tab of the bottom panel (⌘`). */
    onToggleTerminalPanel?: () => void;
    /** True when the terminal tab is frontmost AND the bottom panel is
     *  open — drives the menu item's checkmark. */
    terminalPanelOpen?: boolean;
    /** Navigate ▸ Go to Symbol in Project (⌘T) — project-wide symbol
     *  search across every folder (not just the current file). */
    onOpenProjectSymbols?: () => void;
    /** Command palette (Ctrl+Shift+P) — the extra top-right quick-action
     *  button's handler; the button renders only when its switch flips
     *  on (Settings → Nav → "Top-right quick actions"). */
    onOpenCommandPalette?: () => void;
    /** The ACTIVE interface theme id (lib/ui-themes.ts) — drives the
     *  top-right theme dropdown's checkmark + label. */
    uiTheme?: string;
    /** Switch the interface theme (id from lib/ui-themes.ts) — also
     *  writes the uiTheme setting and flips next-themes' light/dark
     *  class by the theme's family. */
    onSetUiTheme?: (id: string) => void;
    codeFolding?: boolean;
    onToggleCodeFolding?: () => void;
    // ─── Run menu ──────────────────────────────────────────────────
    onRun?: () => void;
    onRunAll?: () => void;
    onStop?: () => void;
    onRunWithCoverage?: () => void;
    onDebug?: () => void;
    /** Run ▸ Run with Tutor View — a Python-Tutor-style step-through
     *  (stack + heap + narration) for the current script. */
    onRunTutorView?: () => void;
    /** Run ▸ Record & Replay… — the time-travel debugger: record an
     *  execution once, then scrub it backward/forward. */
    onRunTimeTravel?: () => void;
    /** Run ▸ Run on Multiple Pythons… — the interpreter matrix runner
     *  (side-by-side outputs + compatibility verdict). */
    onRunMultiPython?: () => void;
    /** Run ▸ Line & Memory Profile… — per-line timing heat + optional
     *  tracemalloc deltas painted into the editor gutter. */
    onRunLineProfile?: () => void;
    // run the current file in the persistent console.
    onRunInConsole?: () => void;
    // Run ▸ browser-notification quick control — the
    // current mode ("off" / "hidden" = only when the IDE tab is not
    // visible / "always") and the cycler. Fully configurable in
    // Settings → Python too (notify-on-failure, permission request).
    runNotifyMode?: "off" | "hidden" | "always";
    onCycleRunNotify?: () => void;
    /** Run ▸ Run queue… — the live executing-runs view. */
    onOpenRunQueue?: () => void;
    /** Run ▸ Scheduled runs… — the interval scheduler. */
    onOpenScheduler?: () => void;
    /** Help ▸ Shortcut trainer — browse + practice. */
    onOpenShortcutTrainer?: () => void;
    canRun?: boolean;
    canStop?: boolean;
    canRunAll?: boolean;
    // ─── AI menu ───────────────────────────────────────────────────
    onOpenAiChat?: () => void;
    onAiExplain?: () => void;
    onAiImprove?: () => void;
    /** External AI endpoints (Settings → AI) — when at least one is
     *  enabled, the AI menu's Explain / Improve items grow a submenu
     *  that can send the question to any of them (the integrated chat
     *  stays the first item). */
    aiEndpoints?: Array<{ name: string; url: string; enabled: boolean }>;
    /** The question text used when routing Explain to an external AI
     *  (built by the page from the current file's source). */
    aiExplainQuestion?: string;
    /** The question text used when routing Improve to an external AI. */
    aiImproveQuestion?: string;
    onAiGenerateTests?: () => void;
    generatingTests?: boolean;
    /** AI ▸ Agent Mode… — the multi-file AI edit planner dialog (step
     *  plan + per-file approvals + one multi-file undo group). The page
     *  passes the handler only while a folder is active; the dialog
     *  guards its own empty-folder case. */
    onOpenAgentMode?: () => void;
    // ─── Tools menu (was Header action buttons) ────────────────────
    onOpenSnippets?: () => void;
    onOpenHistory?: () => void;
    /** the Dependency Manager dialog — installed
     *  packages, outdated badges, upgrade/uninstall (dev-tool
     *  allowlist) + pin-to-requirements.txt. */
    onOpenDependencyManager?: () => void;
    /** Opens the project dictionary manager (.praxis/spell-ignore.json
     *  — add / remove / clear the spell-check ignore list). */
    onOpenProjectDictionary?: () => void;
    /** Tools ▸ Workbenches — the new workbench surfaces. */
    onOpenDuckdbWorkbench?: () => void;
    onOpenApiClient?: () => void;
    onOpenHexEditor?: () => void;
    onOpenAstExplorer?: () => void;
    onOpenBytecodeInspector?: () => void;
    onOpenDocstringStudio?: () => void;
    onOpenExtensions?: () => void;
    onOpenTaskRunner?: () => void;
    historyCount?: number;
    // Git section (inside Tools) — opens the Commit dialog so the user
    // can stage + commit modified files without leaving the keyboard.
    onOpenCommit?: () => void;
    // the commit-history browser (Git Log dialog).
    onOpenGitLog?: () => void;
    // the side-by-side file comparison dialog.
    onOpenCompareFiles?: () => void;
    // "Cancel compare" — closes every open comparison dialog
    // (files / clipboard / folder). Disabled (dimmed) when none is open.
    onCancelCompare?: () => void;
    compareOpen?: boolean;
    // Accessibility sub-menu
    onToggleHighContrast?: () => void;
    onToggleLargeText?: () => void;
    onIncreaseFontSizeA11y?: () => void;
    onDecreaseFontSizeA11y?: () => void;
    onToggleDyslexiaFriendly?: () => void;
    onToggleColorBlind?: () => void;
    onToggleScreenReader?: () => void;
    onToggleReduceMotion?: () => void;
    onToggleEnhancedFocus?: () => void;
    onToggleWrapTab?: () => void;
    onToggleAlwaysShowShortcuts?: () => void;
    onToggleStickyCursor?: () => void;
    onToggleShowWhitespace?: () => void;
    onToggleHighlightCurrentLine?: () => void;
    a11yState?: {
        highContrast?: boolean;
        screenReader?: boolean;
        reduceMotion?: boolean;
        largeText?: boolean;
        enhancedFocus?: boolean;
        dyslexiaFriendly?: boolean;
        colorBlind?: boolean;
        alwaysShowShortcuts?: boolean;
        stickyCursor?: boolean;
        wrapTab?: boolean;
        showWhitespace?: boolean;
        highlightCurrentLine?: boolean;
    };
    // ─── Help menu ─────────────────────────────────────────────────
    onShowShortcuts?: () => void;
    onOpenTutorial?: () => void;
    /** Help ▸ Install As App… — shows the browser's PWA install dialog.
     *  Only passed when the install offer is actually pending
     *  (Chromium-family browsers, not yet installed); the desktop
     *  launcher (`bun run desktop`) is the browser-independent path. */
    onInstallApp?: () => void;
    // ─── Brand ───────────────────────────────────────
    /** When true, the app logo renders at the LEFT of the menu bar
     * (no separate centered BrandHeader row — saves vertical
     * space). */
    showBrandLogo?: boolean;
    appName?: string;
    tagline?: string;
    // ─── AI chat sidebar toggle (right-edge button) ────────────────
    onToggleAiChat?: () => void;
    aiChatOpen?: boolean;
    // ─── Common ────────────────────────────────────────────────────
    // ─── Navigate / View / Edit / Tools extensions ────────
    /** Navigate ▸ Go to Line… — opens the jump-to-line dialog. */
    onGoToLine?: () => void;
    /** Navigate ▸ Recent Files… — opens the recent-files dialog. */
    onRecentFiles?: () => void;
    /** Navigate ▸ Back — go to the previously viewed file. */
    onNavBack?: () => void;
    /** Navigate ▸ Forward — redo a Back. */
    onNavForward?: () => void;
    /** True when the nav history has an earlier entry. */
    canNavBack?: boolean;
    /** True when the nav history has a later entry. */
    canNavForward?: boolean;
    /** View ▸ Word wrap — the codeWordWrap setting's live value. */
    codeWordWrap?: boolean;
    /** View ▸ Word wrap toggle. */
    onToggleCodeWordWrap?: () => void;
    /** View ▸ Minimap — the showMinimap setting's live value. */
    minimapEnabled?: boolean;
    /** View ▸ Minimap toggle. */
    onToggleMinimap?: () => void;
    /** View ▸ editor chrome toggles — line numbers /
     *  indent guides / sticky scroll / spell check (settings-driven,
     *  same pattern as word wrap + minimap). */
    lineNumbers?: boolean;
    onToggleLineNumbers?: () => void;
    indentGuides?: boolean;
    onToggleIndentGuides?: () => void;
    stickyScroll?: boolean;
    onToggleStickyScroll?: () => void;
    /** View ▸ typewriter scrolling — keep the caret
     *  vertically centered while typing. */
    typewriterScroll?: boolean;
    onToggleTypewriterScroll?: () => void;
    spellCheck?: boolean;
    onToggleSpellCheck?: () => void;
    /** View ▸ bottom panel position — classic IDE
     *  convenience (the setting also lives in Settings → Editor). */
    bottomTabsPosition?: "left" | "top";
    onToggleBottomTabsPosition?: () => void;
    /** Edit ▸ Lines & Case ▸ — one generic dispatcher the parent maps
     *  to the code viewer's imperative methods. */
    onEditorAction?: (action: EditorUtilityAction) => void;
    /** Tools ▸ Run all tests — pytest over the whole scripts root. */
    onRunAllTests?: () => void;
    /** Tools ▸ Export ▸ — reuse the output panel's export handlers. */
    onExportMd?: () => void;
    /** Tools ▸ Export ▸ — export as Jupyter notebook. */
    onExportIpynb?: () => void;
    /** Tools ▸ Export ▸ — export as standalone HTML. */
    onExportHtml?: () => void;
    /** Tools ▸ Export ▸ — plain-text bundle (source + output). */
    onExportTxt?: () => void;
    /** Tools ▸ Export ▸ — JSON bundle (script + output + metadata). */
    onExportJson?: () => void;
    /** Tools ▸ Export ▸ — PDF via the browser print dialog. */
    onExportPdf?: () => void;
    /** Tools ▸ Export ▸ — self-contained HTML session report
     *  (code + output + figures + notes). */
    onExportSessionReport?: () => void;
    /** Tools ▸ Export ▸ — LaTeX report (.tex). */
    onExportLatex?: () => void;
    /** Tools ▸ Export ▸ — reStructuredText report (.rst). */
    onExportRst?: () => void;
    /** Tools ▸ Export ▸ — the Markdown report on the clipboard. */
    onCopyAsMarkdown?: () => void;
    /** Tools ▸ Export ▸ — GitHub-ready repo zip (README +
     *  .gitignore + requirements.txt scaffold). */
    onExportGithubRepo?: () => void;
    /** File kind of the CURRENTLY open file — drives the Tools ▸ Export ▸
     * filtering.
     * Media / binary kinds keep only the binary-safe exports;
     * undefined (nothing open) keeps the full menu. */
    selectedFileKind?: import("@/lib/scripts").FileKind;
    /** Export ▸ "Compress current file to ZIP…" — opens the shared
     *  compress dialog (same-folder or any-destination storage). */
    onCompressFile?: () => void;
    /** Export ▸ "Compress current folder to ZIP…" — same dialog. */
    onCompressFolder?: () => void;
    /** Git ▸ — open the branch picker dialog. */
    onOpenBranchPicker?: () => void;
    /** Git ▸ — open the Git Diff bottom tab. */
    onOpenGitDiff?: () => void;
    /** Git ▸ Review Changes with AI… — scans the working diff
     *  hunk-by-hunk and leaves actionable inline comments. */
    onOpenAiReview?: () => void;
    /** Git ▸ Resolve in Merge Editor… — the three-way merge editor
     *  for the active file (auto-offered on conflicted files). */
    onOpenMergeEditor?: () => void;
    /** Git ▸ — dirty-file count badge on the menu. */
    gitDirtyCount?: number | null;
    /** Go ▸ — Go to file (⌘T / the project dialog). */
    onGoToFile?: () => void;
    /** Go ▸ — Bookmarks dialog. */
    onOpenBookmarks?: () => void;
    /** Terminal ▸ — clear the active terminal (menu twin of
     *  the panel's Clear button). */
    onTerminalClear?: () => void;
    // ─── Data / Window / Terminal / Bookmarks menus ───────
    /** Data ▸ Profile this file — turns the column-stats band on for
     *  the current data file (settings-driven, live). */
    onProfileCurrentFile?: () => void;
    /** True when the file open NOW is a CSV / TSV / spreadsheet (drives
     *  the Data menu's enablement). */
    dataFileOpen?: boolean;
    onOpenChartPreview?: () => void;
    onOpenTransformPipeline?: () => void;
    onOpenSqlWorkbench?: () => void;
    onOpenDevToolbox?: (tab?: string) => void;
    /** Collaborate menu — the Live Share-style session controls.
     *  collabActive drives the Share/End item pair + the peers badge. */
    collabActive?: boolean;
    collabPeers?: number;
    onCollabShareWorkspace?: () => void;
    onCollabCopyInvite?: () => void;
    onCollabEndSession?: () => void;
    onOpenSnippetManager?: () => void;
    onOpenJumpList?: () => void;
    // Screenshots (Edit menu submenu + the navbar camera icon)
    /** Open the Screenshot Studio with a capture already firing
     *  ("window" = the picked window / workspace region, "code" = the
     *  whole open file in one image, "selection" = just the selected
     *  lines). */
    onScreenshot?: (mode: "window" | "code" | "selection") => void;
    // Window menu
    /** id of the ACTIVE layout preset (null = custom layout). */
    layoutPresetId?: string | null;
    onApplyLayoutPreset?: (id: string) => void;
    onCycleLayoutPreset?: () => void;
    onResetLayout?: () => void;
    /** True when the editor split pane is open (Window menu check). */
    splitPaneOpen?: boolean;
    onToggleSplitPane?: () => void;
    // Terminal menu
    onTerminalCommand?: (
        cmd: "new-shell" | "new-python" | "clear" | "kill-active" | "kill-all" | "send-selection" | "focus"
    ) => void;
    terminalSessionCount?: number | null;
    // Bookmarks menu
    /** Jump entries (favorites + line bookmarks) with closures. */
    bookmarkEntries?: Array<{
        id: string;
        label: string;
        hint?: string;
        icon?: React.ReactNode;
        onJump?: () => void;
    }>;
    onAddLineBookmark?: () => void;
    // Navbar quick-action cluster
    /** Run the CURRENT file (or the pinned entry point) from the
     *  navbar Run button. */
    onNavbarRun?: () => void;
    /** The active run-config's name for the Run button's badge. */
    runConfigBadge?: string | null;
    /** Which quick-action buttons the menu bar's RIGHT edge shows
     *  (Settings → Nav → "Top-right quick actions"). Missing key =
     *  shown; false = hidden. */
    topRightQuickActions?: Record<string, boolean>;
    className?: string;
}

/** The Edit ▸ Lines & Case ▸ submenu actions.
 *: added splitLines + the surround-with family. */
export type EditorUtilityAction =
    | "toggleComment"
    | "duplicateLine"
    | "moveLineUp"
    | "moveLineDown"
    | "deleteLines"
    | "joinLines"
    | "splitLines"
    | "sortLines"
    | "uniqueLines"
    | "reverseLines"
    | "shuffleLines"
    | "selectAll"
    | "copyAsMarkdown"
    | "upper"
    | "lower"
    | "title"
    | "camel"
    | "pascal"
    | "snake"
    | "kebab"
    | "constant"
    | "trimTrailing"
    | "surroundQuotes"
    | "surroundBrackets"
    | "surroundBraces"
    | "surroundParens"
    | "changeAll"
    | "foldAll"
    | "unfoldAll";

/**
 * VSCode-style top menu bar with File / Edit / View / Run / Tools / Help
 * menus. The header action buttons (search, snippets, history, refresh,
 * accessibility, settings, theme) used to live in a separate Header
 * component; they're now collected into the Tools menu + the right
 * edge of the bar so there's a single, redundancy-free navigation row.
 *
 * Every menu item has a `title` (tooltip) so hovering shows a short
 * description. Each menu is a DropdownMenu; triggers are real
 * <button>s so Tab/Enter work, and the dropdowns support arrow-key
 * navigation via Radix.
 */
export function MenuBar({
                            onNewFolder,
                            onNewFile,
                            onCreateExample,
                            onUploadZip,
                            onOpenFromUrl,
                            onPublishSnapshot,
                            onSave,
                            onSaveAll,
                            onCloseAllEditors,
                            onDownload,
                            onOpenSettings,
                            projects,
                            activeProject,
                            onSelectProject,
                            onCreateProject,
                            onBrowseProjectFolder,
                            onUndo,
                            onRedo,
                            onCut,
                            onCopy,
                            onPaste,
                            onFind,
                            onReplace,
                            onFindInFiles,
                            onFormat,
                            onOrganizeImports,
                            onAutoIndent,
                            onToggleSidebar,
                            onToggleBottomPanel,
                            sidebarVisible,
                            bottomPanelOpen,
                            onIncreaseFontSize,
                            onDecreaseFontSize,
                            onResetFontSize,
                            onRefresh,
                            refreshing,
                            onOpenSearch,
                            onOpenSymbolPalette,
                            onOpenLocalHistory,
                            onToggleDistractionFree,
                            distractionFree,
                            onToggleFullscreen,
                            onToggleTerminalPanel,
                            terminalPanelOpen,
                            onOpenProjectSymbols,
                            onOpenCommandPalette,
                            onRun,
                            onRunAll,
                            onStop,
                            onRunWithCoverage,
                            onDebug,
                            onRunTutorView,
                            onRunTimeTravel,
                            onRunMultiPython,
                            onRunLineProfile,
                            onRunInConsole,
                            canRun,
                            canStop,
                            canRunAll,
                            onOpenAiChat,
                            onAiExplain,
                            onAiImprove,
                            aiEndpoints,
                            aiExplainQuestion,
                            aiImproveQuestion,
                            onAiGenerateTests,
                            generatingTests,
                            onOpenAgentMode,
                            onOpenSnippets,
                            onOpenHistory,
                            onOpenDependencyManager,
                            onOpenProjectDictionary,
                            onOpenDuckdbWorkbench,
                            onOpenApiClient,
                            onOpenHexEditor,
                            onOpenAstExplorer,
                            onOpenBytecodeInspector,
                            onOpenDocstringStudio,
                            onOpenExtensions,
                            onOpenTaskRunner,
                            historyCount,
                            onOpenCommit,
                            onOpenGitLog,
                            onOpenCompareFiles,
                            onCancelCompare,
                            compareOpen,
                            selectedFileKind,
                            onToggleHighContrast,
                            onToggleLargeText,
                            onIncreaseFontSizeA11y,
                            onDecreaseFontSizeA11y,
                            onToggleDyslexiaFriendly,
                            onToggleColorBlind,
                            onToggleScreenReader,
                            onToggleReduceMotion,
                            onToggleEnhancedFocus,
                            onToggleWrapTab,
                            onToggleAlwaysShowShortcuts,
                            onToggleStickyCursor,
                            onToggleShowWhitespace,
                            onToggleHighlightCurrentLine,
                            a11yState,
                            onShowShortcuts,
                            onOpenTutorial,
                            onInstallApp,
                            showBrandLogo = false,
                            appName = "Praxis",
                            tagline = "",
                            onToggleAiChat,
                            aiChatOpen,
                            // ─── additions ─────────────────────────────
                            onGoToLine,
                            onRecentFiles,
                            onNavBack,
                            onNavForward,
                            canNavBack = false,
                            canNavForward = false,
                            codeWordWrap = false,
                            onToggleCodeWordWrap,
                            minimapEnabled = false,
                            onToggleMinimap,
                            // editor chrome toggles.
                            lineNumbers = true,
                            onToggleLineNumbers,
                            indentGuides = false,
                            onToggleIndentGuides,
                            stickyScroll = false,
                            onToggleStickyScroll,
                            spellCheck = false,
                            onToggleSpellCheck,
                            // Code-folding joins the View menu (ruler config lives ONLY in
                            // Settings → Editor now ruler settings belong in
                            // the config, not the navbar).
                            codeFolding = false,
                            onToggleCodeFolding,
                            bottomTabsPosition = "left",
                            onToggleBottomTabsPosition,
                            onEditorAction,
                            onRunAllTests,
                            onExportMd,
                            onExportIpynb,
                            onExportHtml,
                            onExportTxt,
                            onExportJson,
                            onExportPdf,
                            // five more export shapes + the Git / Go / Terminal menus.
                            onExportSessionReport,
                            onExportLatex,
                            onExportRst,
                            onCopyAsMarkdown,
                            onExportGithubRepo,
                            onCompressFile,
                            onCompressFolder,
                            onOpenBranchPicker,
                            onOpenGitDiff,
                            onOpenAiReview,
                            onOpenMergeEditor,
                            gitDirtyCount,
                            onGoToFile,
                            onOpenBookmarks,
                            onTerminalClear,
                            // ─── ────────────────────────────────────────────────────
                            onProfileCurrentFile,
                            dataFileOpen,
                            onOpenChartPreview,
                            onOpenTransformPipeline,
                            onOpenSqlWorkbench,
                            onOpenDevToolbox,
                            collabActive,
                            collabPeers,
                            onCollabShareWorkspace,
                            onCollabCopyInvite,
                            onCollabEndSession,
                            onOpenSnippetManager,
                            onOpenJumpList,
                            onScreenshot,
                            layoutPresetId,
                            onApplyLayoutPreset,
                            onCycleLayoutPreset,
                            onResetLayout,
                            splitPaneOpen,
                            onToggleSplitPane,
                            onTerminalCommand,
                            terminalSessionCount,
                            bookmarkEntries,
                            onAddLineBookmark,
                            onNavbarRun,
                            runConfigBadge,
                            topRightQuickActions,
                            uiTheme,
                            onSetUiTheme,
                            typewriterScroll,
                            onToggleTypewriterScroll,
                            // Run ▸ Notify-on-finish quick toggle.
                            runNotifyMode = "off",
                            onCycleRunNotify,
                            // run queue + scheduled runs dialogs.
                            onOpenRunQueue,
                            onOpenScheduler,
                            // shortcut trainer.
                            onOpenShortcutTrainer,
                            className,
                        }: MenuBarProps) {

    const {resolvedTheme} = useTheme();
    const {toast} = useToast();
    /* Quick-action visibility (Settings → Nav → "Top-right quick
     *  actions"): missing key = shown, false = hidden — so an
     *  empty/default map keeps every button on the bar. */
    const qa = React.useMemo(
        () => (id: string) => topRightQuickActions?.[id] !== false,
        [topRightQuickActions]
    );
    /* The camera quick-action's PRIMARY click fires the DEFAULT screenshot
     *  kind (Settings → Capture → "Make Default" writes
     *  defaultCaptureMode); the small chevron next to it opens the mode
     * picker for one-off kinds. The listener re-reads on
     * praxis:settings-saved so a mid-session default change is honored
     * immediately — before this, the Make Default buttons wrote a value
     * nothing ever read (dead setting). */
    const [defaultShotMode, setDefaultShotMode] = React.useState<
        "window" | "code" | "selection"
    >("window");
    React.useEffect(() => {
        const readDefaultShotMode = () => {
            const m = loadSettings().defaultCaptureMode;
            setDefaultShotMode(m === "code" || m === "selection" ? m : "window");
        };
        readDefaultShotMode();
        window.addEventListener("praxis:settings-saved", readDefaultShotMode);
        return () => window.removeEventListener("praxis:settings-saved", readDefaultShotMode);
    }, []);
    /* The EXTRA quick actions (command palette / distraction-free /
* run queue / scheduler / go-to-file / bookmarks / dependency
* manager / jump list) are OPT-IN: they ride the SAME persisted
* map but their switches default to OFF, so a button RENDERS ONLY
* when the map holds an explicit true at its id. While OFF the
* button is completely HIDDEN from the navbar — its action stays reachable from the menus, and its
* switch lives in Settings → Nav → "Top-right quick actions"
* alongside the 13 established ones. */
    const qaExtra = React.useMemo(
        () => (id: string) => topRightQuickActions?.[id] === true,
        [topRightQuickActions]
    );
    /* The quick-action cluster's horizontal pan strip — the SAME
 * wheel / middle-click-drag / Shift+wheel panning the settings tab
 * strip and the section jump bar use (lib/middle-pan). With every
 * quick action toggled on, the cluster outgrows the bar's right
 * side; the strip then scrolls horizontally instead of pushing the
 * menus out or wrapping. */
    const quickActionsPanRef = useMiddleMousePan<HTMLDivElement>();
    // translated chrome (menu bar) — English fallback.
    const {t} = useChromeLanguage();
    // background-load the example library. `examples` is
    // null until the chunk lands; the Examples cascade below renders
    // then (optional chaining keeps the JSX null-safe).
    const examples = useExamples();
    const [mounted, setMounted] = React.useState(false);
    const [aboutOpen, setAboutOpen] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    const isDark = mounted && resolvedTheme === "dark";
    // The ACTIVE interface theme entry (label + swatches for the
    // dropdown trigger). The stored id arrives with the uiTheme prop
    // (page.tsx reads settings after mount — SSR and the first client
    // render agree on the Light default, so no hydration mismatch).
    const activeUiTheme = React.useMemo(() => uiThemeById(uiTheme), [uiTheme]);
    const enabledAiEndpoints = (aiEndpoints ?? []).filter((e) => e.enabled);

    /* Export ▸ filtering — the open file's kind decides which formats the Tools ▸
Export submenu offers. Nothing open → the full menu (each item's
own "Nothing to export" guard still speaks). */
    const exportCaps = exportCapabilitiesForKind(selectedFileKind);

    /* per-kind capability gating — Run / Format / AI / Data /
     navigation items are disabled (dimmed) when the OPEN file's kind
     can't use them, instead of failing at click-time. */
    const caps = capabilitiesForKind(selectedFileKind);
    const kindHint = capabilityHint(selectedFileKind);

    /* Ambient sounds — the SHARED engine (lib/ambient). The Focus menu
     drives it directly; it plays with or without a focus timer. The
     full-track selection UI lives in the Ambient MIXER panel
     (Focus ▸ Ambient mixer…) — the menu keeps only the quick master
     switch. */
    const ambient = useAmbientState();
    const handleAmbientToggle = () => {
        const ok = toggleAmbient();
        if (!ok) {
            toast({
                title: "Ambient sounds unavailable",
                description: "This browser blocked WebAudio.",
            });
        }
    };

    /** One AI-menu action (Explain / Improve): the integrated assistant
     *  plus the external endpoint choices. Rendered as a submenu
     *  whenever an external endpoint is enabled (restores the
     *  pre-sidebar ability to send these questions to Gemini / Claude /
     *  ChatGPT / custom); with none enabled it collapses back to the
     *  plain integrated item. */
    const renderAiAction = (
        kind: "explain" | "improve",
        icon: React.ReactNode,
        label: string,
        integratedTitle: string
    ) => {
        const onIntegrated = kind === "explain" ? onAiExplain : onAiImprove;
        const question =
            kind === "explain" ? aiExplainQuestion : aiImproveQuestion;
        if (enabledAiEndpoints.length === 0 || !question) {
            return (
                <MenubarItem
                    onClick={onIntegrated}
                    disabled={!onIntegrated}
                    className="gap-2 cursor-pointer"
                    title={integratedTitle}
                >
                    {icon}
                    <span className="flex-1">{label}</span>
                </MenubarItem>
            );
        }
        return (
            <MenubarSub>
                <MenubarSubTrigger
                    disabled={!onIntegrated}
                    className="gap-2 cursor-pointer"
                    title={`${integratedTitle} — or pick an external AI endpoint from the submenu`}
                >
                    {icon}
                    <span className="flex-1">{label}</span>
                </MenubarSubTrigger>
                <MenubarSubContent className="w-64">
                    <MenubarItem
                        onClick={onIntegrated}
                        disabled={!onIntegrated}
                        className="gap-2 cursor-pointer"
                        title={integratedTitle}
                    >
                        <Sparkles className="size-3.5 text-purple-500"/>
                        <span className="flex-1">Praxis AI (Built-In)</span>
                        <span className="text-[9px] text-muted-foreground">sidebar</span>
                    </MenubarItem>
                    <MenubarSeparator/>
                    <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        External AI Endpoints
                    </MenubarLabel>
                    {enabledAiEndpoints.map((ep) => (
                        <MenubarItem
                            key={ep.name}
                            onClick={() => void askExternalAi(question, ep, toast)}
                            className="gap-2 cursor-pointer"
                            title={`Copy the question to the clipboard and open ${ep.name} in a new tab`}
                        >
                            <ExternalLink className="size-3.5"/>
                            <span className="flex-1">Ask {ep.name}</span>
                            <span className="text-[9px] text-muted-foreground">copies</span>
                        </MenubarItem>
                    ))}
                    <MenubarSeparator/>
                    <MenubarItem
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(question);
                                toast({title: "Question copied to clipboard", variant: "success"});
                            } catch {
                                toast({title: "Copy failed", variant: "destructive"});
                            }
                        }}
                        className="gap-2 cursor-pointer"
                        title="Copy the question to the clipboard without opening anything"
                    >
                        <Copy className="size-3.5"/>
                        <span className="flex-1">Copy Question Only</span>
                    </MenubarItem>
                </MenubarSubContent>
            </MenubarSub>
        );
    };

    return (
        <div
            className={cn(
                "flex items-center gap-0.5 px-2 h-9 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 text-xs shrink-0",
                className
            )}
            aria-label="Application menu bar"
        >
            {/*
        ─── Menu bar ──────────────────────────────────────────────
        Wrapped in <Menubar> (Radix) so hovering a different trigger
        while one menu is open AUTOMATICALLY switches to that menu —
        the classic desktop menu-bar behavior (VSCode, macOS, native
        Windows apps). Previously each menu was a standalone
        DropdownMenu with manual hover-switch state; the Radix
        Menubar primitive handles this natively + correctly, so we
        removed the openMenu / openMenuRef / menuTriggerProps
        bookkeeping.
      */}
            <Menubar
                className="flex items-center gap-0.5 h-full shrink-0 bg-transparent border-0 shadow-none rounded-none p-0">
                {/* ─── brand logo merged INTO the navbar ─────────
The centered BrandHeader row above the menu bar is gone (it
reserved ~36px of vertical chrome on every screen for a logo
the user reads once). The logo now leads the navigation row
itself; hovering it reveals the app name + tagline, and the
document outline keeps its <h1> via the sr-only heading. */}
                {showBrandLogo && (
                    <>
                        <h1 className="sr-only">{appName}</h1>
                        <Tooltip delayDuration={250}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={`${appName}${tagline ? ` — ${tagline}` : ""}`}
                                    title={`${appName}${tagline ? ` — ${tagline}` : ""}`}
                                    className="mr-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 shrink-0"
                                >
                                    <img src="/logo.svg" alt="" className="size-6 rounded-md shadow-sm"
                                         aria-hidden="true"/>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="start" className="px-3 py-2 text-left">
                                <p className="text-xs font-semibold leading-tight">{appName}</p>
                                {tagline && <p className="text-[10px] opacity-80 leading-tight">{tagline}</p>}
                            </TooltipContent>
                        </Tooltip>
                        <span aria-hidden="true" className="w-px h-5 bg-border shrink-0 mr-1"/>
                    </>
                )}
                {/* ─── File menu ─────────────────────────────────────────── */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="File menu — new, save, download, settings">
                            {t("menuFile")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            New
                        </MenubarLabel>
                        <MenubarItem onClick={onNewFolder} disabled={!onNewFolder} className="gap-2 cursor-pointer"
                                     title="Create a new empty folder (File → New folder)">
                            <FolderPlus className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">New Folder…</span>
                        </MenubarItem>
                        <MenubarItem onClick={onNewFile} disabled={!onNewFile} className="gap-2 cursor-pointer"
                                     title="Create a new empty file in a folder (with default content per extension)">
                            <FilePlus className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">New File…</span>
                        </MenubarItem>
                        <MenubarItem onClick={onUploadZip} disabled={!onUploadZip} className="gap-2 cursor-pointer"
                                     title="Upload a .zip archive — extracts into a new project directory and switches to it">
                            <Upload className="size-3.5 text-cyan-500"/>
                            <span className="flex-1">Upload ZIP As New Project…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        {/* headers + dividers organize every section — "Open"
for project switching / import, "Save & download" for the
write side. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Open
                        </MenubarLabel>
                        {/* Project switcher — moved here from the Explorer sidebar.
Shows the active project name + a sub-menu of all projects
so the user can switch without diving into the sidebar. */}
                        <MenubarSub>
                            <MenubarSubTrigger className="gap-2 cursor-pointer" title="Switch the active project">
                                <Library className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Open Project</span>
                                <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">
                {activeProject
                    ? projects?.find((p) => p.path === activeProject)?.name ?? "Custom"
                    : "Default"}
              </span>
                            </MenubarSubTrigger>
                            <MenubarSubContent className="w-64">
                                <MenubarItem
                                    onClick={() => onSelectProject?.("")}
                                    className="gap-2 cursor-pointer"
                                    title="Switch to the default python_scripts/ project"
                                >
                                    <FolderOpen className="size-3.5 text-emerald-500"/>
                                    <span className="flex-1 truncate">Default (python_scripts/)</span>
                                    {!activeProject && <Check className="size-3.5 text-emerald-500"/>}
                                </MenubarItem>
                                {projects?.map((p) => (
                                    <MenubarItem
                                        key={p.path}
                                        onClick={() => onSelectProject?.(p.path)}
                                        className="gap-2 cursor-pointer"
                                        title={`Switch to "${p.name}" (${p.scriptCount} scripts)`}
                                    >
                                        <Library className="size-3.5 text-muted-foreground"/>
                                        <span className="flex-1 truncate">{p.name}</span>
                                        <span className="text-[9px] text-muted-foreground">({p.scriptCount})</span>
                                        {activeProject === p.path && <Check className="size-3.5 text-emerald-500"/>}
                                    </MenubarItem>
                                ))}
                                <MenubarSeparator/>
                                <MenubarItem
                                    onClick={onBrowseProjectFolder}
                                    disabled={!onBrowseProjectFolder}
                                    className="gap-2 cursor-pointer"
                                    title="Browse the filesystem (starting at the projects directory) and open any folder as the active project"
                                >
                                    <FolderSearch className="size-3.5 text-emerald-500"/>
                                    <span className="flex-1">Open Folder…</span>
                                </MenubarItem>
                            </MenubarSubContent>
                        </MenubarSub>
                        {/* "Create new project…" is a TOP-LEVEL File
menu item directly BELOW "Open project" — not nested
inside it. */}
                        <MenubarItem
                            onClick={onCreateProject}
                            className="gap-2 cursor-pointer"
                            title="Create a new empty project directory under the app root and switch to it"
                        >
                            <FolderPlus className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Create New Project…</span>
                        </MenubarItem>
                        {/* Shallow GitHub import — repo / tree-ref / subpath / gist;
              "reload from source" is offered later for imported
              folders (the .praxis/source.json sidecar). */}
                        <MenubarItem
                            onClick={onOpenFromUrl}
                            disabled={!onOpenFromUrl}
                            className="gap-2 cursor-pointer"
                            title="Import a GitHub repository, a subfolder or a gist into the workspace (shallow import — reload from source anytime)"
                        >
                            <Github className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Open from GitHub URL…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Save & Download
                        </MenubarLabel>
                        <MenubarItem onClick={onSave} disabled={!onSave} className="gap-2 cursor-pointer"
                                     title="Save the current file (⌘S)">
                            <Save className="size-3.5 text-emerald-500"/>
                            {/* translated label (i18n: saveButton) — English fallback. */}
                            <span className="flex-1">{t("saveButton")}</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘S</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onSaveAll} disabled={!onSaveAll} className="gap-2 cursor-pointer"
                                     title="Save all open editor tabs (⌘⌥S)">
                            <Save className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Save All</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⌥S</kbd>
                        </MenubarItem>
                        {/* VS Code's File → Close All Editors. Closes every
              tab; the workspace turns into a solid blank area until the
              next file is opened (⌘⇧T can still reopen the last one). */}
                        <MenubarItem
                            onClick={onCloseAllEditors}
                            disabled={!onCloseAllEditors}
                            className="gap-2 cursor-pointer"
                            title="Close every open editor tab — the workspace goes blank until you open another file"
                        >
                            <SquareX className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Close All Editors</span>
                        </MenubarItem>
                        <MenubarItem onClick={onDownload} disabled={!onDownload} className="gap-2 cursor-pointer"
                                     title="Download the current file to your computer">
                            <Download className="size-3.5 text-purple-500"/>
                            <span className="flex-1">Download Current File…</span>
                        </MenubarItem>
                        {/* Publish Snapshot — the whole workspace compressed into a
              URL hash; opening the link boots Praxis with these files
              preloaded (a shareable, offline "playground link"). */}
                        <MenubarItem
                            onClick={onPublishSnapshot}
                            disabled={!onPublishSnapshot}
                            className="gap-2 cursor-pointer"
                            title="Encode the current workspace into a shareable URL hash — opening the link restores these files into the workspace"
                        >
                            <Link2 className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Publish Snapshot Link…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem onClick={() => onOpenSettings?.()} disabled={!onOpenSettings}
                                     className="gap-2 cursor-pointer" title="Open the Settings dialog (⌘,)">
                            <SettingsIcon className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Settings…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘,</kbd>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Edit menu ─────────────────────────────────────────── */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Edit menu — undo, redo, cut, copy, paste, find, format">
                            {t("menuEdit")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-56">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Undo & Clipboard
                        </MenubarLabel>
                        {/* the editor clipboard/undo ops act on
the PYTHON editor's buffer — visibly disabled for every
other kind instead of silently no-op'ing (the “double check the navbar gating” request). */}
                        <MenubarItem onClick={onUndo} disabled={!onUndo || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Undo the last edit (⌘Z)" : "Undo targets the Python editor"}>
                            <Undo2 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Undo</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘Z</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onRedo} disabled={!onRedo || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Redo the last undone edit (⌘⇧Z)" : "Redo targets the Python editor"}>
                            <Redo2 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Redo</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧Z</kbd>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem onClick={onCut} disabled={!onCut || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Cut the selection (⌘X)" : "Cut targets the Python editor"}>
                            <Scissors className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Cut</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘X</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onCopy} disabled={!onCopy || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Copy the selection (⌘C)" : "Copy targets the Python editor"}>
                            <Copy className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Copy</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘C</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onPaste} disabled={!onPaste || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Paste the clipboard contents (⌘V)" : "Paste targets the Python editor"}>
                            <ClipboardPaste className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Paste</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘V</kbd>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Find & Replace
                        </MenubarLabel>
                        <MenubarItem onClick={onFind} disabled={!onFind || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Open the in-editor find bar (⌘F)" : "The in-editor find bar targets the Python editor"}>
                            <Search className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Find…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘F</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onReplace} disabled={!onReplace || selectedFileKind !== "python"}
                                     className="gap-2 cursor-pointer"
                                     title={selectedFileKind === "python" ? "Find and replace in the current file (⌘⌥F)" : "Find & replace targets the Python editor"}>
                            <Replace className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Replace…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⌥F</kbd>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem onClick={onFindInFiles} disabled={!onFindInFiles} className="gap-2 cursor-pointer"
                                     title="Search across every .py file in the project and replace across files (⌘⇧H)">
                            <FileSearch className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Find In Files…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧H</kbd>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Format & Lines
                        </MenubarLabel>
                        <MenubarItem onClick={onFormat} disabled={!onFormat || !caps.canFormat}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canFormat ? (selectedFileKind === "python" ? "Format the current file with black/ruff (⌘⇧F)" : selectedFileKind === "html" ? "Beautify the HTML file — valid in view and edit mode" : "Format the Markdown file — valid in view and edit mode") : "Formatting targets Python, Markdown and HTML files"}>
                            <AlignLeft className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Format Document</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧F</kbd>
                        </MenubarItem>
                        {/* organize imports — ruff's import-block pass, gated to Python
              files exactly like Format Document's kind gating (ruff
              only; no black fallback for import organization). */}
                        <MenubarItem
                            onClick={onOrganizeImports}
                            disabled={!onOrganizeImports || selectedFileKind !== "python"}
                            className="gap-2 cursor-pointer"
                            title={selectedFileKind === "python" ? "Sort, merge and dedupe the import block with ruff (--select I --fix)" : "Organize Imports targets Python files (ruff --select I --fix)"}
                        >
                            <ListOrdered className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Organize Imports</span>
                        </MenubarItem>
                        {/* auto-indent = re-indent to the CONFIGURED
              style (tabs/spaces + width) — unlike Format (black/ruff,
              needs an installed tool) this always works and only
              touches leading whitespace. */}
                        <MenubarItem onClick={onAutoIndent} disabled={!onAutoIndent || !caps.canFormat}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canFormat ? (selectedFileKind === "python" ? "Re-indent the current file to the configured indentation (Settings → Editor → Indentation)" : "Re-indent the Markdown / HTML file to the configured indentation — valid in view and edit mode") : "Re-indenting targets Python, Markdown and HTML files"}>
                            <IndentIncrease className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Auto-Indent File</span>
                        </MenubarItem>
                        {/* Lines & Case ▸ — the editor's line utilities
              (same actions as the editor right-click's Edit ▸). */}
                        <MenubarSub>
                            <MenubarSubTrigger className="gap-2 cursor-pointer"
                                               title="Comment, duplicate, move lines, convert case, trim whitespace, fold">
                                <AlignLeft className="size-3.5 text-sky-500"/>
                                <span className="flex-1">Lines &amp; Case</span>
                            </MenubarSubTrigger>
                            <MenubarSubContent className="w-56">
                                <MenubarItem onClick={() => onEditorAction?.("toggleComment")}
                                             disabled={!onEditorAction} className="gap-2 cursor-pointer"
                                             title="Toggle # comments on the selected lines (or the caret's line)">
                                    <Hash className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Toggle Comment</span>
                                    <kbd className="text-[9px] text-muted-foreground">⌘/</kbd>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("duplicateLine")}
                                             disabled={!onEditorAction} className="gap-2 cursor-pointer"
                                             title="Duplicate the current line (or every selected line)">
                                    <Copy className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Duplicate Line</span>
                                    <kbd className="text-[9px] text-muted-foreground">⇧⌥↓</kbd>
                                </MenubarItem>
                                <MenubarSeparator/>
                                <MenubarItem onClick={() => onEditorAction?.("moveLineUp")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Move the current line (or selection) up">
                                    <ChevronUp className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Move Line Up</span>
                                    <kbd className="text-[9px] text-muted-foreground">⌘⇧↑</kbd>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("moveLineDown")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Move the current line (or selection) down">
                                    <ChevronDown className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Move Line Down</span>
                                    <kbd className="text-[9px] text-muted-foreground">⌘⇧↓</kbd>
                                </MenubarItem>
                                {/* ── The line tools the editor's right-click Edit ▸ always
had — now in the navbar too. Same imperative methods,
same undoable buffer writes. ── */}
                                <MenubarSeparator/>
                                <MenubarItem onClick={() => onEditorAction?.("deleteLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Delete the caret's line — or every selected line">
                                    <SquareX className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Delete Line</span>
                                    <kbd className="text-[9px] text-muted-foreground">⌘⌫</kbd>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("joinLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Join the caret's line with the next (or join every selected line into one)">
                                    <Merge className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Join Lines</span>
                                </MenubarItem>
                                {/* the join twin + the surround-with family. */}
                                <MenubarItem onClick={() => onEditorAction?.("splitLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Split the selection (or the caret's line) at commas into one item per line">
                                    <FoldVertical className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Split Lines</span>
                                </MenubarItem>
                                <MenubarSub>
                                    <MenubarSubTrigger className="gap-2 cursor-pointer"
                                                       title="Wrap the selection (or the word at the caret) with delimiters">
                                        <Braces className="size-3.5 text-sky-500"/>
                                        <span className="flex-1">Surround With</span>
                                    </MenubarSubTrigger>
                                    <MenubarSubContent className="w-52">
                                        {([
                                            ["surroundQuotes", "\"quotes\""],
                                            ["surroundParens", "(parentheses)"],
                                            ["surroundBrackets", "[brackets]"],
                                            ["surroundBraces", "{braces}"],
                                        ] as const).map(([action, label]) => (
                                            <MenubarItem
                                                key={action}
                                                onClick={() => onEditorAction?.(action)}
                                                disabled={!onEditorAction}
                                                className="gap-2 cursor-pointer"
                                                title={`Wrap the selection in ${label}`}
                                            >
                                                <Braces className="size-3.5 text-muted-foreground"/>
                                                <span className="flex-1 font-mono">{label}</span>
                                            </MenubarItem>
                                        ))}
                                    </MenubarSubContent>
                                </MenubarSub>
                                <MenubarItem onClick={() => onEditorAction?.("sortLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Sort the selected lines alphabetically">
                                    <ArrowDownAZ className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Sort Selected Lines</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("uniqueLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Remove duplicate lines from the selection (first occurrence wins)">
                                    <CopyMinus className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Unique Lines</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("reverseLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Reverse the order of the selected lines">
                                    <ArrowUpDown className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Reverse Lines</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("shuffleLines")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Shuffle the selected lines into a random order (great for quiz/flashcard data)">
                                    <Shuffle className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Shuffle Lines</span>
                                </MenubarItem>
                                <MenubarSeparator/>
                                <MenubarItem onClick={() => onEditorAction?.("selectAll")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer" title="Select the entire buffer (Ctrl+A)">
                                    <TextSelect className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Select All</span>
                                    <kbd className="text-[9px] text-muted-foreground">⌘A</kbd>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("copyAsMarkdown")}
                                             disabled={!onEditorAction} className="gap-2 cursor-pointer"
                                             title="Copy the selected lines wrapped in a fenced Markdown code block — paste straight into a README or issue">
                                    <Braces className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Copy As Markdown Block</span>
                                </MenubarItem>
                                <MenubarSeparator/>
                                <MenubarItem onClick={() => onEditorAction?.("upper")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to UPPERCASE">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">UPPERCASE</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("lower")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to lowercase">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">lowercase</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("title")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to Title Case">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Title Case</span>
                                </MenubarItem>
                                {/* identifier-style case conversions (the
                  IntelliJ CamelCase plugin / Sublime Convert Case
                  family) — match the app's own naming-style engine. */}
                                <MenubarItem onClick={() => onEditorAction?.("camel")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to camelCase">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">camelCase</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("pascal")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to PascalCase">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">PascalCase</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("snake")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to snake_case">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">snake_case</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("kebab")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to kebab-case">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">kebab-case</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("constant")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Convert the selection (or word at the caret) to CONSTANT_CASE">
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">CONSTANT_CASE</span>
                                </MenubarItem>
                                <MenubarSeparator/>
                                <MenubarItem onClick={() => onEditorAction?.("trimTrailing")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Remove trailing whitespace from every line in the current file">
                                    <Eraser className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Trim Trailing Whitespace</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("foldAll")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Fold every def/class block in the current file (edit mode)">
                                    <FoldVertical className="size-3.5 text-sky-500"/>
                                    <span className="flex-1">Fold All Blocks</span>
                                </MenubarItem>
                                <MenubarItem onClick={() => onEditorAction?.("unfoldAll")} disabled={!onEditorAction}
                                             className="gap-2 cursor-pointer"
                                             title="Unfold every block in the current file (edit mode)">
                                    <UnfoldVertical className="size-3.5 text-sky-500"/>
                                    <span className="flex-1">Unfold All Blocks</span>
                                </MenubarItem>
                            </MenubarSubContent>
                        </MenubarSub>
                        {/* Screenshots ▸ — the screenshot trio (window / whole-file code /
              screen region) plus the studio. Each opens the Screenshot
              Studio with the screenshot already firing; the studio offers
              Save To File (project path), Download and Copy, at the
              configured storage DPI + file extension (Settings →
              Capture). Naming: the camera family says "Screenshot" —
              plain "Capture" stays with the per-run capture picker. */}
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Screenshots
                        </MenubarLabel>
                        <MenubarItem onClick={() => onScreenshot?.("window")} disabled={!onScreenshot}
                                     className="gap-2 cursor-pointer"
                                     title="Screenshot one frame of the picked window (falls back to the app's workspace region) — then Save To File / Download / Copy">
                            <Camera className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Screenshot: window…</span>
                        </MenubarItem>
                        <MenubarItem onClick={() => onScreenshot?.("code")} disabled={!onScreenshot}
                                     className="gap-2 cursor-pointer"
                                     title="Render the WHOLE open file into a single PNG — filename header, line numbers, syntax-tinted">
                            <ImageIcon className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Screenshot: code…</span>
                        </MenubarItem>
                        <MenubarItem onClick={() => onScreenshot?.("selection")} disabled={!onScreenshot}
                                     className="gap-2 cursor-pointer"
                                     title="Pick the screen, then drag a scissors-style rectangle over the frozen frame to snip exactly that region (falls back to the selected text lines)">
                            <MousePointerSquareDashed className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Screenshot: region…</span>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── View menu ─────────────────────────────────────────── */}
                {/* REORGANIZED. The menu had grown into a flat ~20-item
          list; it now reads in labeled groups — Layout (panels + zen /
          fullscreen), Navigate, an Editor ▸ submenu (every code-chrome
          toggle in one place), Zoom, and Refresh. Same items, same
          handlers, same shortcuts — only the grouping is new. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="View menu — panels, navigation, editor chrome, zoom, refresh">
                            {t("menuView")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-60">
                        {/* ── Layout ─────────────────────────────────────────────── */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Layout
                        </MenubarLabel>
                        <MenubarCheckboxItem
                            checked={!!sidebarVisible}
                            onCheckedChange={() => onToggleSidebar?.()}
                            disabled={!onToggleSidebar}
                            className="gap-2 cursor-pointer"
                            title={sidebarVisible ? "Hide the file-tree sidebar (⌘B)" : "Show the file-tree sidebar (⌘B)"}
                        >
                            <SidebarIcon className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Sidebar</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘B</kbd>
                        </MenubarCheckboxItem>
                        <MenubarCheckboxItem
                            checked={!!bottomPanelOpen}
                            onCheckedChange={() => onToggleBottomPanel?.()}
                            disabled={!onToggleBottomPanel}
                            className="gap-2 cursor-pointer"
                            title={bottomPanelOpen ? "Hide the bottom Output/Diagnostics/Notes panel (⌘J)" : "Show the bottom Output/Diagnostics/Notes panel (⌘J)"}
                        >
                            <PanelBottom className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Bottom Panel</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘J</kbd>
                        </MenubarCheckboxItem>
                        {/* integrated terminal panel toggle (⌘`). */}
                        <MenubarCheckboxItem
                            checked={!!terminalPanelOpen}
                            onCheckedChange={() => onToggleTerminalPanel?.()}
                            disabled={!onToggleTerminalPanel}
                            className="gap-2 cursor-pointer"
                            title={terminalPanelOpen ? "Hide the integrated terminal panel (⌘`)" : "Show the integrated terminal panel (⌘`) — a real shell / Python REPL in the bottom panel"}
                        >
                            <TerminalSquare className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Terminal Panel</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘`</kbd>
                        </MenubarCheckboxItem>
                        {/* Clear the terminal — moved here from the old Terminal
              menu (its other items duplicated the Run / Tools menus,
              which is eliminated). */}
                        <MenubarItem onClick={onTerminalClear} disabled={!onTerminalClear}
                                     className="gap-2 cursor-pointer"
                                     title="Clear the active terminal session's scrollback (the menu twin of the panel's trash button)">
                            <Eraser className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Clear Terminal</span>
                        </MenubarItem>
                        {/* AI chat toggle (was only the right-edge button). */}
                        <MenubarCheckboxItem
                            checked={!!aiChatOpen}
                            onCheckedChange={() => onToggleAiChat?.()}
                            disabled={!onToggleAiChat}
                            className="gap-2 cursor-pointer"
                            title={aiChatOpen ? "Hide the AI chat sidebar (⌘⇧L)" : "Show the AI chat sidebar (⌘⇧L)"}
                        >
                            <Sparkles className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">AI Chat Sidebar</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧L</kbd>
                        </MenubarCheckboxItem>
                        <MenubarCheckboxItem
                            checked={bottomTabsPosition === "top"}
                            onCheckedChange={() => onToggleBottomTabsPosition?.()}
                            disabled={!onToggleBottomTabsPosition}
                            className="gap-2 cursor-pointer"
                            title={bottomTabsPosition === "top" ? "Move the bottom panel tabs back to the left rail" : "Move the bottom panel tabs to a horizontal row on top of the panel"}
                        >
                            <PanelBottom className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Tabs On Top Of Bottom Panel</span>
                        </MenubarCheckboxItem>
                        <MenubarSeparator/>
                        <MenubarCheckboxItem
                            checked={!!distractionFree}
                            onCheckedChange={() => onToggleDistractionFree?.()}
                            disabled={!onToggleDistractionFree}
                            className="gap-2 cursor-pointer pl-2"
                            title={distractionFree ? "Exit distraction-free mode (Shift+F11)" : "Enter distraction-free mode (Shift+F11) — hides header, menu, sidebar, and bottom panel"}
                        >
                            <Maximize2 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Distraction-Free Mode</span>
                            <kbd className="text-[9px] text-muted-foreground">⇧F11</kbd>
                        </MenubarCheckboxItem>
                        {/* browser fullscreen (plain F11 — distinct from
              distraction-free ⇧F11, which is the app-level zen mode). */}
                        <MenubarItem
                            onClick={() => onToggleFullscreen?.()}
                            disabled={!onToggleFullscreen}
                            className="gap-2 cursor-pointer"
                            title="Toggle the browser's fullscreen mode (F11) — the whole page fills the screen"
                        >
                            <Expand className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Fullscreen</span>
                            <kbd className="text-[9px] text-muted-foreground">F11</kbd>
                        </MenubarItem>
                        {/* The old "Navigate" section was removed — its items
              duplicated the merged Run ▸ Navigation menu (Go to File
              ⌘K, Go to Symbol ⌘R); Local file history moved there
              too. One navigation surface, no repeats. */}
                        {/* ── Editor ▸ (all code-chrome toggles in one submenu) ──── */}
                        <MenubarSeparator/>
                        <MenubarSub>
                            <MenubarSubTrigger className="gap-2 cursor-pointer"
                                               title="Every editor-appearance toggle in one place — word wrap, minimap, line numbers, indent guides, sticky scroll, folding, ruler, whitespace, current-line highlight, spell check">
                                <Code2 className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Editor</span>
                            </MenubarSubTrigger>
                            <MenubarSubContent className="w-60">
                                {/* editor chrome toggles (settings-driven). */}
                                <MenubarCheckboxItem
                                    checked={!!codeWordWrap}
                                    onCheckedChange={() => onToggleCodeWordWrap?.()}
                                    disabled={!onToggleCodeWordWrap}
                                    className="gap-2 cursor-pointer"
                                    title={codeWordWrap ? "Turn code word wrap OFF — long lines get a horizontal scrollbar" : "Turn code word wrap ON — long lines wrap onto the next row"}
                                >
                                    <WrapText className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Word Wrap</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem
                                    checked={!!minimapEnabled}
                                    onCheckedChange={() => onToggleMinimap?.()}
                                    disabled={!onToggleMinimap}
                                    className="gap-2 cursor-pointer"
                                    title={minimapEnabled ? "Hide the minimap overview on the right of the code viewer" : "Show a scaled-down minimap overview beside the code"}
                                >
                                    <MapPin className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Minimap</span>
                                </MenubarCheckboxItem>
                                {/* the remaining editor chrome toggles —
                  previously only reachable via Settings → Editor. */}
                                <MenubarCheckboxItem
                                    checked={!!lineNumbers}
                                    onCheckedChange={() => onToggleLineNumbers?.()}
                                    disabled={!onToggleLineNumbers}
                                    className="gap-2 cursor-pointer"
                                    title={lineNumbers ? "Hide line numbers in the code viewer" : "Show line numbers in the code viewer"}
                                >
                                    <ListOrdered className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Line Numbers</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem
                                    checked={!!indentGuides}
                                    onCheckedChange={() => onToggleIndentGuides?.()}
                                    disabled={!onToggleIndentGuides}
                                    className="gap-2 cursor-pointer"
                                    title={indentGuides ? "Hide the thin vertical indent guide lines" : "Show thin vertical indent guide lines at each indent level"}
                                >
                                    <MoveHorizontal className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Indent Guides</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem
                                    checked={!!stickyScroll}
                                    onCheckedChange={() => onToggleStickyScroll?.()}
                                    disabled={!onToggleStickyScroll}
                                    className="gap-2 cursor-pointer"
                                    title={stickyScroll ? "Stop pinning the innermost def/class header at the top of the code pane while scrolling" : "Pin the innermost def/class header at the top of the code pane while scrolling (VS Code behavior)"}
                                >
                                    <Pin className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Sticky Scroll</span>
                                </MenubarCheckboxItem>
                                {/* typewriter scrolling — the caret stays
                  vertically centered while typing (writers' mode). */}
                                <MenubarCheckboxItem
                                    checked={!!typewriterScroll}
                                    onCheckedChange={() => onToggleTypewriterScroll?.()}
                                    disabled={!onToggleTypewriterScroll}
                                    className="gap-2 cursor-pointer"
                                    title={typewriterScroll ? "Stop centering the caret vertically while typing" : "Typewriter scrolling — keep the caret vertically centered while typing"}
                                >
                                    <Type className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Typewriter Scrolling</span>
                                </MenubarCheckboxItem>
                                {/* code folding joins the View menu. */}
                                <MenubarCheckboxItem
                                    checked={!!codeFolding}
                                    onCheckedChange={() => onToggleCodeFolding?.()}
                                    disabled={!onToggleCodeFolding}
                                    className="gap-2 cursor-pointer"
                                    title={codeFolding ? "Disable code folding (def / class blocks can no longer be collapsed)" : "Enable code folding — collapse def / class blocks with the fold chevrons"}
                                >
                                    <FoldVertical className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Code Folding</span>
                                </MenubarCheckboxItem>
                                {/* The ruler is not cyclable from here — its column AND
                  width live ONLY in Settings → Editor (ruler config
                  belongs in the config dialog, not the navbar). */}
                                {/* whitespace + current-line (formerly only
                  in the Accessibility submenu / Settings). */}
                                <MenubarCheckboxItem
                                    checked={!!a11yState?.showWhitespace}
                                    onCheckedChange={() => onToggleShowWhitespace?.()}
                                    disabled={!onToggleShowWhitespace}
                                    className="gap-2 cursor-pointer"
                                    title={a11yState?.showWhitespace ? "Hide whitespace markers (trailing spaces, tabs)" : "Render whitespace markers — trailing spaces and tabs become visible"}
                                >
                                    <Space className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Whitespace Characters</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem
                                    checked={!!a11yState?.highlightCurrentLine}
                                    onCheckedChange={() => onToggleHighlightCurrentLine?.()}
                                    disabled={!onToggleHighlightCurrentLine}
                                    className="gap-2 cursor-pointer"
                                    title={a11yState?.highlightCurrentLine ? "Stop highlighting the caret's line" : "Highlight the caret's line with a subtle background band"}
                                >
                                    <Highlighter className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Highlight Current Line</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem
                                    checked={!!spellCheck}
                                    onCheckedChange={() => onToggleSpellCheck?.()}
                                    disabled={!onToggleSpellCheck}
                                    className="gap-2 cursor-pointer"
                                    title={spellCheck ? "Disable spell check for markdown/text buffers" : "Show misspelled words in markdown/text buffers as info diagnostics with an Add-to-dictionary action"}
                                >
                                    <SpellCheck2 className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Spell Check</span>
                                </MenubarCheckboxItem>
                            </MenubarSubContent>
                        </MenubarSub>
                        {/* ── Zoom ────────────────────────────────────────────────── */}
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Zoom
                        </MenubarLabel>
                        <MenubarItem onClick={onIncreaseFontSize} disabled={!onIncreaseFontSize}
                                     className="gap-2 cursor-pointer" title="Increase the code viewer font size (⌘=)">
                            <ZoomIn className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Increase Code Font Size</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘=</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onDecreaseFontSize} disabled={!onDecreaseFontSize}
                                     className="gap-2 cursor-pointer" title="Decrease the code viewer font size (⌘-)">
                            <ZoomOut className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Decrease Code Font Size</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘-</kbd>
                        </MenubarItem>
                        {/* reset — ⌘0 / the same default Settings → Editor starts from. */}
                        <MenubarItem onClick={onResetFontSize} disabled={!onResetFontSize}
                                     className="gap-2 cursor-pointer"
                                     title="Reset the code font size to the default (⌘0)">
                            <RotateCcw className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Reset Code Font Size</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘0</kbd>
                        </MenubarItem>
                        {/* ── Project ─────────────────────────────────────────────── */}
                        <MenubarSeparator/>
                        <MenubarItem onClick={onRefresh} disabled={!onRefresh || refreshing}
                                     className="gap-2 cursor-pointer" title="Refresh the project from disk (⌘⇧R)">
                            <RefreshCw className={cn("size-3.5 text-muted-foreground", refreshing && "animate-spin")}/>
                            <span className="flex-1">Refresh Project</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧R</kbd>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Window menu ─────────────────────────────
          Named layout presets (Editor+Output / Editor+Terminal /
          Triple / Zen), per-panel visibility checks, split-pane toggle
          and reset — plus the navbar cycler's twin. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Window menu — layout presets, panel visibility, reset">
                            {t("menuWindow")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Layout Presets
                        </MenubarLabel>
                        {LAYOUT_PRESETS.map((preset) => (
                            <MenubarItem
                                key={preset.id}
                                onClick={() => onApplyLayoutPreset?.(preset.id)}
                                disabled={!onApplyLayoutPreset}
                                className="gap-2 cursor-pointer"
                                title={preset.description}
                            >
                                {layoutPresetId === preset.id ? (
                                    <Check className="size-3.5 text-emerald-500"/>
                                ) : (
                                    <LayoutGrid className="size-3.5 text-muted-foreground"/>
                                )}
                                <span className="flex-1">{preset.label}</span>
                            </MenubarItem>
                        ))}
                        <MenubarSeparator/>
                        <MenubarItem onClick={onCycleLayoutPreset} disabled={!onCycleLayoutPreset}
                                     className="gap-2 cursor-pointer"
                                     title="Step through the presets (same as the navbar layout button)">
                            <Shuffle className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Next Preset</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Panels
                        </MenubarLabel>
                        <MenubarCheckboxItem
                            checked={!!splitPaneOpen}
                            onCheckedChange={() => onToggleSplitPane?.()}
                            disabled={!onToggleSplitPane}
                            className="gap-2 cursor-pointer"
                            title="Toggle the editor split pane (side-by-side / stacked)"
                        >
                            <Columns2 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Editor Split Pane</span>
                        </MenubarCheckboxItem>
                        <MenubarCheckboxItem
                            checked={!!aiChatOpen}
                            onCheckedChange={() => onToggleAiChat?.()}
                            disabled={!onToggleAiChat}
                            className="gap-2 cursor-pointer"
                            title="Toggle the AI chat sidebar"
                        >
                            <Sparkles className="size-3.5 text-purple-500"/>
                            <span className="flex-1">AI Chat Sidebar</span>
                        </MenubarCheckboxItem>
                        <MenubarSeparator/>
                        <MenubarItem onClick={onToggleDistractionFree} disabled={!onToggleDistractionFree}
                                     className="gap-2 cursor-pointer"
                                     title="Distraction-free mode — just the editor (⇧F11)">
                            <Eye className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Zen / Distraction-Free</span>
                            <kbd className="text-[9px] text-muted-foreground">⇧F11</kbd>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem onClick={onResetLayout} disabled={!onResetLayout} className="gap-2 cursor-pointer"
                                     title="Back to the default layout: sidebar + editor + bottom output panel">
                            <RotateCcw className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Reset Layout</span>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Terminal menu ────────────────────────────
          Session management for the integrated terminal — new shell /
          Python sessions, clear / kill, send-selection, focus. The
          commands reach the panel via the praxis:terminal-command
          event. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Terminal menu — sessions, clear / kill, send selection">
                            {t("menuTerminal")}
                            {terminalSessionCount != null && terminalSessionCount > 0 && (
                                <span
                                    className="ml-1 rounded-full bg-muted px-1.5 text-[9px] tabular-nums">{terminalSessionCount}</span>
                            )}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Sessions
                        </MenubarLabel>
                        <MenubarItem onClick={() => onTerminalCommand?.("new-shell")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer"
                                     title="Start a new shell session in the project root">
                            <SquareTerminal className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">New Shell Session</span>
                        </MenubarItem>
                        <MenubarItem onClick={() => onTerminalCommand?.("new-python")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer" title="Start a new Python REPL session">
                            <TerminalSquare className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">New Python REPL Session</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Manage
                        </MenubarLabel>
                        <MenubarItem onClick={() => onTerminalCommand?.("clear")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer" title="Clear the active session's scrollback">
                            <Eraser className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Clear Active Session</span>
                        </MenubarItem>
                        <MenubarItem onClick={() => onTerminalCommand?.("kill-active")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer" title="Kill the active session">
                            <SquareX className="size-3.5 text-red-500"/>
                            <span className="flex-1">Kill Active Session</span>
                        </MenubarItem>
                        <MenubarItem onClick={() => onTerminalCommand?.("kill-all")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer text-red-600 dark:text-red-400 cursor-pointer"
                                     title="Kill every terminal session">
                            <SquareX className="size-3.5 text-red-500"/>
                            <span className="flex-1">Kill All Sessions</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem onClick={() => onTerminalCommand?.("send-selection")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer"
                                     title="Send the editor's current selection (or line) to the active terminal">
                            <ArrowRightLeft className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Send Selection To Terminal</span>
                        </MenubarItem>
                        <MenubarItem onClick={() => onTerminalCommand?.("focus")} disabled={!onTerminalCommand}
                                     className="gap-2 cursor-pointer" title="Focus the terminal input (⌘`)">
                            <TerminalSquare className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Focus Terminal</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘`</kbd>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Bookmarks menu ───────────────────────────
          One jump surface for the favorites (starred files) AND the
          editor line bookmarks, plus add/remove on the current line.
          The full management dialog stays in Go ▸ Bookmarks… */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Bookmarks — jump to favorites and editor line bookmarks">
                            {t("menuBookmarks")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64 max-h-[70vh] overflow-y-auto">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Jump To
                        </MenubarLabel>
                        {(bookmarkEntries ?? []).slice(0, 12).map((entry) => (
                            <MenubarItem
                                key={entry.id}
                                onClick={() => entry.onJump?.()}
                                className="gap-2 cursor-pointer"
                                title={entry.hint}
                            >
                                {entry.icon ?? <Bookmark className="size-3.5 text-amber-500"/>}
                                <span className="flex-1 truncate">{entry.label}</span>
                                {entry.hint &&
                                  <span className="text-[9px] text-muted-foreground shrink-0">{entry.hint}</span>}
                            </MenubarItem>
                        ))}
                        {(bookmarkEntries ?? []).length === 0 && (
                            <p className="px-3 py-2 text-[11px] text-muted-foreground">
                                No bookmarks yet — star files in the explorer or add line bookmarks from the editor.
                            </p>
                        )}
                        <MenubarSeparator/>
                        {/* "Bookmark this line" is gated by the file
              kind — line bookmarks only target the Python editor. */}
                        <MenubarItem
                            onClick={onAddLineBookmark}
                            disabled={!onAddLineBookmark || !caps.canBookmark}
                            className="gap-2 cursor-pointer"
                            title={caps.canBookmark ? "Toggle a bookmark on the editor's current line" : `Line bookmarks target Python files — ${kindHint}`}
                        >
                            <BookmarkPlus className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Bookmark This Line</span>
                        </MenubarItem>
                        <MenubarItem onClick={onOpenBookmarks} disabled={!onOpenBookmarks}
                                     className="gap-2 cursor-pointer" title="Open the full bookmarks management dialog">
                            <Bookmark className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">All Bookmarks…</span>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Run & Go menu (merged) ──────────────────────────────
The former separate Run and Go menus duplicated each other's
neighborhood (and View ▸ Navigate repeated both); they are ONE
menu now: Execution on top, Navigation below — every option
appears exactly once. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Run & Go menu — execute scripts, stop, debug, and navigate the project">
                            {t("menuRun")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Execution
                        </MenubarLabel>
                        <MenubarItem onClick={onRun} disabled={!canRun || !caps.canRun || !onRun}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canRun ? "Run the current file (⌘↵) — Python or any installed language runtime (JS / TS / MATLAB / R / shell / Java / C / C++). Output streams live via Server-Sent Events." : `Runs need a runnable file — ${kindHint}`}>
                            <Play className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Run Script</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘↵</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onStop} disabled={!canStop || !onStop} className="gap-2 cursor-pointer"
                                     title="Stop the running script (⌘.) — SIGTERM, then SIGKILL after 1.5s">
                            <Square className="size-3.5 text-red-500"/>
                            <span className="flex-1">Stop Running Script</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘.</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onRunAll} disabled={!canRunAll || !onRunAll}
                                     className="gap-2 cursor-pointer"
                                     title="Run every runnable file in the current folder sequentially — Python runs its full pipeline; js/ts/m/r/shell/java/c/cpp/ruby/php/go run through their own runtimes">
                            <Layers className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Run All In Folder</span>
                        </MenubarItem>
                        <MenubarItem onClick={onRunWithCoverage}
                                     disabled={!canRun || !caps.canRun || !onRunWithCoverage}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canRun ? "Run the current script with line-coverage tracing enabled" : `Coverage runs need a Python file — ${kindHint}`}>
                            <Crosshair className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Run With Coverage</span>
                        </MenubarItem>
                        {/* Console mode: the file runs in the persistent kernel, so
              imports/variables/figures survive every run. */}
                        <MenubarItem onClick={onRunInConsole}
                                     disabled={!canRun || !caps.canRunInConsole || !onRunInConsole}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canRunInConsole ? "Run the current script in the persistent Python console — state (imports, variables, figures) survives every run" : `The console runs Python files — ${kindHint}`}>
                            <SquareTerminal className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Run In Console…</span>
                        </MenubarItem>
                        <MenubarItem onClick={onDebug} disabled={!onDebug || !caps.canRun}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canRun ? "Switch to the Diagnostics tab and start pdb debugging" : `Debugging needs a Python file — ${kindHint}`}>
                            <Bug className="size-3.5 text-purple-500"/>
                            <span className="flex-1">Debug With Pdb…</span>
                        </MenubarItem>
                        {/* Tutor View — a recorded run scrubbed step by step, drawing
              the stack, the heap and the references (the learner twin of
              the debug tools). */}
                        <MenubarItem
                            onClick={onRunTutorView}
                            disabled={!onRunTutorView || !caps.canRun}
                            className="gap-2 cursor-pointer"
                            title="Record the run once, then step through it with the stack, the heap and a plain-language narration (recommended for Getting Started files)"
                        >
                            <GraduationCap className="size-3.5 text-violet-500"/>
                            <span className="flex-1">Run With Tutor View…</span>
                        </MenubarItem>
                        {/* Time-travel debugging — record once, then scrub the
              timeline backward/forward and inspect any variable at any
              point (watchpoint history + time breakpoints). */}
                        <MenubarItem
                            onClick={onRunTimeTravel}
                            disabled={!onRunTimeTravel || !caps.canRun}
                            className="gap-2 cursor-pointer"
                            title="Record an execution once, then scrub a timeline — step backward, inspect any variable at any point, watch what changed"
                        >
                            <History className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Record &amp; Replay…</span>
                        </MenubarItem>
                        {/* The interpreter matrix — one script, several Pythons,
              side-by-side outputs + an automatic compatibility verdict. */}
                        <MenubarItem
                            onClick={onRunMultiPython}
                            disabled={!onRunMultiPython || !caps.canRun}
                            className="gap-2 cursor-pointer"
                            title="Run the current script on several registered interpreters at once and compare outputs, exit codes and compatibility"
                        >
                            <Columns2 className="size-3.5 text-cyan-500"/>
                            <span className="flex-1">Run On Multiple Pythons…</span>
                        </MenubarItem>
                        {/* Line & memory profiler — per-line timing heat overlays in
              the gutter + tracemalloc deltas per function. */}
                        <MenubarItem
                            onClick={onRunLineProfile}
                            disabled={!onRunLineProfile || !caps.canRun}
                            className="gap-2 cursor-pointer"
                            title="Run the current script with per-line timing (gutter heat) and optional tracemalloc memory deltas"
                        >
                            <Gauge className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Line &amp; Memory Profile…</span>
                        </MenubarItem>
                        {/* live view of everything executing on the server. */}
                        <MenubarItem onClick={onOpenRunQueue} disabled={!onOpenRunQueue}
                                     className="gap-2 cursor-pointer"
                                     title="Live view of every run executing on the server — foreground and background, with per-run Stop">
                            <ListVideo className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Run Queue…</span>
                        </MenubarItem>
                        {/* interval scheduler for the current script. */}
                        <MenubarItem onClick={onOpenScheduler} disabled={!onOpenScheduler || !caps.canRun}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canRun ? "Re-run scripts on a fixed interval while a Praxis tab is open" : "Schedules run Python files"}>
                            <CalendarClock className="size-3.5 text-indigo-500"/>
                            <span className="flex-1">Scheduled Runs…</span>
                        </MenubarItem>
                        {/* Notification quick-toggle — cycles Off → When tab hidden →
              Always. The full config stays in Settings → Python. */}
                        <MenubarItem
                            onClick={onCycleRunNotify}
                            disabled={!onCycleRunNotify}
                            className="gap-2 cursor-pointer"
                            title={`Browser notification when a run finishes — currently: ${runNotifyMode === "off" ? "off" : runNotifyMode === "hidden" ? "only when the IDE tab is not visible" : "always"}. Click to cycle (Settings → Python has the full options).`}
                        >
                            {runNotifyMode === "off" || !runNotifyMode ? (
                                <BellOff className="size-3.5 text-muted-foreground"/>
                            ) : (
                                <Bell className="size-3.5 text-sky-500"/>
                            )}
                            <span
                                className="flex-1">Notify On Finish: {runNotifyMode === "off" || !runNotifyMode ? "Off" : runNotifyMode === "hidden" ? "When Tab Hidden" : "Always"}</span>
                        </MenubarItem>

                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Navigation
                        </MenubarLabel>
                        <MenubarItem onClick={onOpenSearch} disabled={!onOpenSearch} className="gap-2 cursor-pointer"
                                     title="Go to file — fuzzy-find any script by name (⌘K)">
                            <FileSearch className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Go To File…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘K</kbd>
                        </MenubarItem>
                        {/* The ⌘T "go to file" dialog (project-wide). */}
                        <MenubarItem onClick={onGoToFile} disabled={!onGoToFile} className="gap-2 cursor-pointer"
                                     title="Go to file — the project-wide file picker (⌘T)">
                            <FileCode2 className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Go To File (Project)…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘T</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onGoToLine} disabled={!onGoToLine || !caps.canGotoLine}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canGotoLine ? "Jump to a line number in the current file (⌘G)" : "Line jumps work in the Python editor"}>
                            <MapPin className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Go To Line…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘G</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onOpenSymbolPalette} disabled={!onOpenSymbolPalette || !caps.canGotoLine}
                                     className="gap-2 cursor-pointer"
                                     title={caps.canGotoLine ? "Jump to any function / class definition in the current file (⌘R)" : "Symbols come from Python files"}>
                            <FunctionSquare className="size-3.5 text-violet-500"/>
                            <span className="flex-1">Go To Symbol…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘R</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onOpenProjectSymbols} disabled={!onOpenProjectSymbols}
                                     className="gap-2 cursor-pointer"
                                     title="Search symbols across the WHOLE project (functions, classes, methods)">
                            <Layers className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Go To Symbol In Project…</span>
                        </MenubarItem>
                        {/* Back/forward + recent files — the navigation history. */}
                        <MenubarItem onClick={onNavBack} disabled={!onNavBack || !canNavBack}
                                     className="gap-2 cursor-pointer" title="Go back to the previously viewed file">
                            <ChevronLeft className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Back</span>
                            <kbd className="text-[9px] text-muted-foreground">⌃-</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onNavForward} disabled={!onNavForward || !canNavForward}
                                     className="gap-2 cursor-pointer" title="Redo a Back — return to the file you left">
                            <ChevronRight className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Forward</span>
                            <kbd className="text-[9px] text-muted-foreground">⌃⇧-</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onRecentFiles} disabled={!onRecentFiles} className="gap-2 cursor-pointer"
                                     title="Reopen a recently viewed file">
                            <Clock3 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Recent Files…</span>
                        </MenubarItem>
                        {/* Local file history — moved here from the old View ▸
              Navigate section (one navigation surface). */}
                        <MenubarItem onClick={onOpenLocalHistory} disabled={!onOpenLocalHistory}
                                     className="gap-2 cursor-pointer"
                                     title="Open the local file history panel — every save creates a snapshot you can roll back to">
                            <History className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Local File History…</span>
                        </MenubarItem>
                        {/* Bookmarks intentionally NOT repeated here — the Bookmarks
              menu (its own top-level tab) already owns that surface;
              duplicating it at the end of Run & Go read as a leftover. */}
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── AI menu ──────────────────────────────────────────── */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="AI menu — chat, explain, improve, generate tests">
                            {t("menuAi")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Chat
                        </MenubarLabel>
                        <MenubarItem
                            onClick={onOpenAiChat}
                            disabled={!onOpenAiChat}
                            className="gap-2 cursor-pointer"
                            title="Open the AI chat assistant sidebar (⌘⇧L) — streams responses from the chat provider configured in Settings → AI"
                        >
                            <Sparkles className="size-3.5 text-purple-500"/>
                            <span className="flex-1">Open AI Chat…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧L</kbd>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Code Actions
                        </MenubarLabel>
                        {renderAiAction(
                            "explain",
                            <Code2 className="size-3.5 text-emerald-500"/>,
                            "Explain Current File With AI",
                            "Ask the integrated AI to explain what the current script does, step by step"
                        )}
                        {renderAiAction(
                            "improve",
                            <Wand2 className="size-3.5 text-amber-500"/>,
                            "Improve Current File With AI",
                            "Ask the integrated AI to suggest readability, performance, and correctness improvements for the current script"
                        )}
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Developer Tools
                        </MenubarLabel>
                        <MenubarItem
                            onClick={onAiGenerateTests}
                            disabled={!onAiGenerateTests || generatingTests}
                            className="gap-2 cursor-pointer"
                            title={generatingTests ? "Generating tests… (disabled until completion)" : "Generate pytest tests for the current file with AI"}
                        >
                            {generatingTests ? (
                                <Loader2 className="size-3.5 text-cyan-500 animate-spin"/>
                            ) : (
                                <FlaskConical className="size-3.5 text-cyan-500"/>
                            )}
                            <span
                                className="flex-1">{generatingTests ? "Generating Tests…" : "Generate AI Tests…"}</span>
                        </MenubarItem>
                        {/* Agent Mode — the multi-file AI edit planner (a step plan +
              per-file approvals; every apply lands as ONE multi-file
              undo group). Placed after Generate AI Tests, before AI
              Settings; disabled while no folder is active (the handler
              prop is dropped) and the dialog guards its own case. */}
                        <MenubarItem
                            onClick={onOpenAgentMode}
                            disabled={!onOpenAgentMode}
                            className="gap-2 cursor-pointer"
                            title="Plan and apply multi-file AI edits with per-file approvals"
                        >
                            <Bot className="size-3.5 text-purple-500"/>
                            <span className="flex-1">Agent Mode…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem
                            onClick={() => onOpenSettings?.("ai")}
                            disabled={!onOpenSettings}
                            className="gap-2 cursor-pointer text-emerald-600"
                            title="Open the Settings dialog directly on the AI tab"
                        >
                            <SettingsIcon className="size-3.5"/>
                            <span className="flex-1">AI Settings…</span>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Data menu ────────────────────────────────
          The data tools finally get a discoverable home: profile the
          current file (column-stats band), chart preview, transform
          pipeline, the SQLite workbench and the format converters. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Data menu — profile, chart preview, transform pipeline, SQL workbench, converters">
                            {t("menuData")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Profile
                        </MenubarLabel>
                        <MenubarItem
                            onClick={onProfileCurrentFile}
                            disabled={!onProfileCurrentFile || !dataFileOpen}
                            className="gap-2 cursor-pointer"
                            title="Turn on the column-stats band for the open table — type, min/max/mean, unique and missing counts per column; the missing badge filters the rows"
                        >
                            <Sigma className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Profile This File</span>
                            <span className="text-[9px] text-muted-foreground">stats band</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
                            Explore & Transform
                        </MenubarLabel>
                        <MenubarItem
                            onClick={onOpenChartPreview}
                            disabled={!onOpenChartPreview || !dataFileOpen}
                            className="gap-2 cursor-pointer"
                            title="Pick X/Y columns of the current CSV and get an instant chart + a matplotlib snippet"
                        >
                            <BarChart3 className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Chart Preview…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenTransformPipeline}
                            disabled={!onOpenTransformPipeline || !dataFileOpen}
                            className="gap-2 cursor-pointer"
                            title="Chain filter / sort / select / rename / group-by / pivot / join steps over the current CSV with a live preview"
                        >
                            <Workflow className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Transform Pipeline…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenSqlWorkbench}
                            disabled={!onOpenSqlWorkbench}
                            className="gap-2 cursor-pointer"
                            title="Open the SQLite SQL workbench — pick a .db file, browse the schema, run read-only queries"
                        >
                            <DatabaseIcon className="size-3.5 text-indigo-500"/>
                            <span className="flex-1">SQL Workbench…</span>
                        </MenubarItem>
                        {/* The Convert / Developer Toolbox entries that used to close
              this menu were REMOVED — the toolbox lives in Tools ▸
              Developer toolbox… (one entry, one place); Data ▸ Convert
              Formats… just opened that same toolbox, so it duplicated it. */}
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Tools menu (was Header action buttons) ───────────── */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Tools menu — snippets, run history, accessibility, theme">
                            {t("menuTools")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        {/* quick lint/format on the CURRENT file — these
              dispatch the window events page.tsx already listens to
              (same handlers as the editor's ⌘⇧F / lint flows). */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Code Quality
                        </MenubarLabel>
                        <MenubarItem
                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:format-current"))}
                            disabled={!caps.canFormat}
                            className="gap-2 cursor-pointer"
                            title={caps.canFormat ? (selectedFileKind === "python" ? "Format the current file with black/ruff (⌘⇧F)" : "Format the Markdown / HTML file — valid in view and edit mode") : "Formatting targets Python, Markdown and HTML files"}
                        >
                            <Wand2 className="size-3.5 text-violet-500"/>
                            <span className="flex-1">Format Current File</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧F</kbd>
                        </MenubarItem>
                        <MenubarItem
                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:lint-current"))}
                            disabled={!caps.canLint}
                            className="gap-2 cursor-pointer"
                            title={caps.canLint ? "Lint the current file with ruff and show the issues in the Diagnostics tab" : "Linting targets Python files"}
                        >
                            <FileSearch className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Lint Current File</span>
                        </MenubarItem>
                        {/* pytest over the whole scripts root. */}
                        <MenubarItem onClick={onRunAllTests} disabled={!onRunAllTests} className="gap-2 cursor-pointer"
                                     title="Run pytest over every test in the project and show a structured report">
                            <FlaskConical className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Run All Tests…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        {/* Export ▸ — every format the current file (or a right-clicked
              one) can take, plus compression into a .zip. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Export & Share
                        </MenubarLabel>
                        {(onExportMd || onExportIpynb || onExportHtml) && (
                            <MenubarSub>
                                <MenubarSubTrigger className="gap-2 cursor-pointer"
                                                   title="Export the current script / its output">
                                    <FileOutput className="size-3.5 text-purple-500"/>
                                    <span className="flex-1">Export</span>
                                </MenubarSubTrigger>
                                <MenubarSubContent className="w-56">
                                    {onExportMd && exportCaps.has("md") && (
                                        <MenubarItem onClick={onExportMd} className="gap-2 cursor-pointer"
                                                     title="Export the current script + its latest output as Markdown">
                                            <FileText className="size-3.5 text-muted-foreground"/>
                                            <span className="flex-1">Markdown Report…</span>
                                        </MenubarItem>
                                    )}
                                    {onExportIpynb && exportCaps.has("ipynb") && (
                                        <MenubarItem onClick={onExportIpynb} className="gap-2 cursor-pointer"
                                                     title="Export the current script as a Jupyter notebook">
                                            <Braces className="size-3.5 text-amber-500"/>
                                            <span className="flex-1">Jupyter Notebook…</span>
                                        </MenubarItem>
                                    )}
                                    {onExportHtml && exportCaps.has("html") && (
                                        <MenubarItem onClick={onExportHtml} className="gap-2 cursor-pointer"
                                                     title="Export the current script + its output as a standalone HTML page">
                                            <Code2 className="size-3.5 text-sky-500"/>
                                            <span className="flex-1">Standalone HTML…</span>
                                        </MenubarItem>
                                    )}
                                    {/* three more export shapes. Plain text = source +
output in one.txt; JSON = a machine-readable bundle;
PDF = formatted print sheet via the browser's print
dialog (works offline, no server round-trip). */}
                                    {onExportTxt && exportCaps.has("txt") && (
                                        <MenubarItem onClick={onExportTxt} className="gap-2 cursor-pointer"
                                                     title="Export the current script + its output as a plain-text file">
                                            <FileText className="size-3.5 text-muted-foreground"/>
                                            <span className="flex-1">Plain Text…</span>
                                        </MenubarItem>
                                    )}
                                    {onExportJson && exportCaps.has("json") && (
                                        <MenubarItem onClick={onExportJson} className="gap-2 cursor-pointer"
                                                     title="Export the script, its output and metadata as a JSON bundle">
                                            <Braces className="size-3.5 text-emerald-500"/>
                                            <span className="flex-1">JSON Bundle…</span>
                                        </MenubarItem>
                                    )}
                                    {onExportPdf && exportCaps.has("pdf") && (
                                        <MenubarItem onClick={onExportPdf} className="gap-2 cursor-pointer"
                                                     title="Open a print-ready sheet (source + output) and bring up the browser's Save-as-PDF dialog">
                                            <FileOutput className="size-3.5 text-rose-500"/>
                                            <span className="flex-1">PDF (Print)…</span>
                                        </MenubarItem>
                                    )}
                                    {/* More export shapes: a self-contained session report,
                    LaTeX + RST for docs pipelines, clipboard Markdown,
                    and a GitHub-ready zip of the whole folder. */}
                                    <MenubarSeparator/>
                                    {onExportSessionReport && exportCaps.has("session") && (
                                        <MenubarItem onClick={onExportSessionReport} className="gap-2 cursor-pointer"
                                                     title="One styled HTML page with the code, its output, captured figures and your notes — the homework-submission format">
                                            <FileOutput className="size-3.5 text-emerald-500"/>
                                            <span className="flex-1">Session Report (HTML)…</span>
                                        </MenubarItem>
                                    )}
                                    {onExportLatex && exportCaps.has("latex") && (
                                        <MenubarItem onClick={onExportLatex} className="gap-2 cursor-pointer"
                                                     title="A pdflatex/Overleaf-ready .tex with the source and output as listings (round-trips into Praxis itself)">
                                            <FileCode className="size-3.5 text-sky-500"/>
                                            <span className="flex-1">LaTeX Report (.tex)…</span>
                                        </MenubarItem>
                                    )}
                                    {onExportRst && exportCaps.has("rst") && (
                                        <MenubarItem onClick={onExportRst} className="gap-2 cursor-pointer"
                                                     title="reStructuredText (.rst) — Sphinx / docs-tooling ready">
                                            <FileText className="size-3.5 text-amber-500"/>
                                            <span className="flex-1">reStructuredText (.rst)…</span>
                                        </MenubarItem>
                                    )}
                                    {onCopyAsMarkdown && exportCaps.has("copy-md") && (
                                        <MenubarItem onClick={onCopyAsMarkdown} className="gap-2 cursor-pointer"
                                                     title="The whole report (source + output + notes) as Markdown ON THE CLIPBOARD — paste into a PR, issue or chat">
                                            <Copy className="size-3.5 text-violet-500"/>
                                            <span className="flex-1">Copy As Markdown</span>
                                        </MenubarItem>
                                    )}
                                    {onExportGithubRepo && exportCaps.has("github") && (
                                        <MenubarItem onClick={onExportGithubRepo} className="gap-2 cursor-pointer"
                                                     title="The current folder as a repository-ready .zip — README.md, .gitignore and requirements.txt scaffolded in (existing files are never overwritten)">
                                            <Github className="size-3.5 text-muted-foreground"/>
                                            <span className="flex-1">GitHub-Ready Repo (.zip)…</span>
                                        </MenubarItem>
                                    )}
                                    <MenubarSeparator/>
                                    {onCompressFile && (
                                        <MenubarItem onClick={onCompressFile} className="gap-2 cursor-pointer"
                                                     title="Compress the current file into a .zip stored in the same folder or any location you pick">
                                            <Archive className="size-3.5 text-emerald-500"/>
                                            <span className="flex-1">Compress File To ZIP…</span>
                                        </MenubarItem>
                                    )}
                                    {onCompressFolder && (
                                        <MenubarItem onClick={onCompressFolder} className="gap-2 cursor-pointer"
                                                     title="Compress the current folder into a .zip stored next to it or in any location you pick">
                                            <Archive className="size-3.5 text-emerald-500"/>
                                            <span className="flex-1">Compress Folder To ZIP…</span>
                                        </MenubarItem>
                                    )}
                                </MenubarSubContent>
                            </MenubarSub>
                        )}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Utilities
                        </MenubarLabel>
                        <MenubarItem onClick={onOpenSnippets} disabled={!onOpenSnippets}
                                     className="gap-2 cursor-pointer"
                                     title="Open the snippets palette (Ctrl+/) — insert reusable code snippets">
                            <Terminal className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Snippets…</span>
                            <kbd className="text-[9px] text-muted-foreground">Ctrl+/</kbd>
                        </MenubarItem>
                        {/* the snippet MANAGER — full CRUD + import /
              export packs (the palette only inserts). */}
                        <MenubarItem onClick={onOpenSnippetManager} disabled={!onOpenSnippetManager}
                                     className="gap-2 cursor-pointer"
                                     title="Manage the snippet library — rename, edit, delete, import / export packs">
                            <Scissors className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Snippet Manager…</span>
                        </MenubarItem>
                        {/* the offline developer toolbox and the
              jump list (also in the navbar's right cluster). */}
                        <MenubarItem onClick={() => onOpenDevToolbox?.()} disabled={!onOpenDevToolbox}
                                     className="gap-2 cursor-pointer"
                                     title="Offline developer toolbox — converters, encoders, hashes, UUID, time, color, cron, regex, diff, escape, faker">
                            {/* the canonical toolbox glyph — same wrench as the top-bar
              button and the dialog title (toolbox-icons.tsx). */}
                            <ToolboxIcon className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Developer Toolbox…</span>
                        </MenubarItem>
                        <MenubarItem onClick={onOpenJumpList} disabled={!onOpenJumpList}
                                     className="gap-2 cursor-pointer"
                                     title="Jump — pinned tabs, favorites, recent files, folders and last runs in one overlay (⌘⇧J)">
                            <CornerDownLeft className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Jump To…</span>
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧J</kbd>
                        </MenubarItem>
                        <MenubarItem onClick={onOpenHistory} disabled={!onOpenHistory} className="gap-2 cursor-pointer"
                                     title="Open the run history drawer (⌘⇧H) — see past runs and re-open them">
                            <History className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Run History…</span>
                            {historyCount != null && historyCount > 0 && (
                                <span
                                    className="text-[9px] text-muted-foreground">{historyCount > 99 ? "99+" : historyCount}</span>
                            )}
                            <kbd className="text-[9px] text-muted-foreground">⌘⇧H</kbd>
                        </MenubarItem>
                        {/* the dependency manager — installed packages
              of the selected environment, outdated check, and a one-click
              pin to requirements.txt. */}
                        <MenubarItem
                            onClick={onOpenDependencyManager}
                            disabled={!onOpenDependencyManager}
                            className="gap-2 cursor-pointer"
                            title="Installed packages of the selected environment — check outdated, update or remove any package, install new ones, pin requirements.txt"
                        >
                            <Package className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Dependency Manager…</span>
                        </MenubarItem>
                        {/* the project dictionary manager — the words added via
              the spell popover's "Add to project dictionary";
              add / remove / clear them all here. */}
                        <MenubarItem
                            onClick={onOpenProjectDictionary}
                            disabled={!onOpenProjectDictionary}
                            className="gap-2 cursor-pointer"
                            title="Manage the project dictionary (.praxis/spell-ignore.json) — add, remove or clear the words spell-check skips"
                        >
                            <BookOpen className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Project Dictionary…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Workbenches
                        </MenubarLabel>
                        {/* The new workbench surfaces — full analytical / protocol /
              inspection tools, each with its own dedicated editor
              surface. */}
                        <MenubarItem
                            onClick={onOpenDuckdbWorkbench}
                            disabled={!onOpenDuckdbWorkbench}
                            className="gap-2 cursor-pointer"
                            title="SQL workbench over analytical files — query .parquet / .csv / .feather with full SQL (window functions, joins) and export the result grid"
                        >
                            <Database className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">DuckDB Workbench…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenApiClient}
                            disabled={!onOpenApiClient}
                            className="gap-2 cursor-pointer"
                            /* Round 3 — the command opens an UNTITLED in-memory draft
               (no folder needed, nothing written to disk until an
               explicit Save As); with a .http/.rest file already
               active it simply reports the open client. */
                            title="Postman-style REST client — opens an untitled in-memory .http draft (never writes to disk); Save As (Ctrl/Cmd+S) picks the destination. Fully active whenever a .http/.rest file is open"
                        >
                            <Globe className="size-3.5 text-sky-500"/>
                            <span className="flex-1">API Client (.http)…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenHexEditor}
                            disabled={!onOpenHexEditor}
                            className="gap-2 cursor-pointer"
                            title="Binary inspector — hex + ASCII columns, offset navigation, search, guarded in-place byte editing"
                        >
                            <Binary className="size-3.5 text-violet-500"/>
                            <span className="flex-1">Hex Editor…</span>
                        </MenubarItem>
                        {/* Python-only workbenches (AST Explorer / Bytecode Inspector /
             Docstring Studio) gate on the OPEN file being Python — the
             same per-kind discipline as the Run / Format / Data items
             above: a dimmed item with a hint beats a panel that opens
             empty for a non-Python file. */}
                        <MenubarItem
                            onClick={onOpenAstExplorer}
                            disabled={!onOpenAstExplorer || selectedFileKind !== "python"}
                            className="gap-2 cursor-pointer"
                            title="Side panel with the file's abstract syntax tree — collapsible nodes with line spans; click a node to highlight its exact source range (Python files)"
                        >
                            <ListTree className="size-3.5 text-cyan-500"/>
                            <span className="flex-1">AST Explorer…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenBytecodeInspector}
                            disabled={!onOpenBytecodeInspector || selectedFileKind !== "python"}
                            className="gap-2 cursor-pointer"
                            title="See what CPython actually executes — dis output aligned with the source, plus a diff mode after edits (Python files)"
                        >
                            <Cpu className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Bytecode Inspector…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenDocstringStudio}
                            disabled={!onOpenDocstringStudio || selectedFileKind !== "python"}
                            className="gap-2 cursor-pointer"
                            title="Generate or repair docstrings (Google / NumPy / Sphinx) with AI enrichment — plus a project-wide docstring coverage report (Python files)"
                        >
                            <BookOpen className="size-3.5 text-indigo-500"/>
                            <span className="flex-1">Docstring Studio…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenTaskRunner}
                            disabled={!onOpenTaskRunner}
                            className="gap-2 cursor-pointer"
                            title="Auto-detected npm scripts, Makefile / justfile targets and pyproject tasks — one-click run, pinned favorites, per-task output channels"
                        >
                            <ListChecks className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Task Runner Panel…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onOpenExtensions}
                            disabled={!onOpenExtensions}
                            className="gap-2 cursor-pointer"
                            title="Sandboxed mini-plugins with a permission-scoped API — commands, status-bar items, snippets; ships with first-party examples"
                        >
                            <Blocks className="size-3.5 text-fuchsia-500"/>
                            <span className="flex-1">Extensions…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        {/* the Git actions moved to their own top-level
              "Git" menu (a proper menu with branch / diff / dirty badge
              — they used to be buried here); Tools keeps the
              non-git utilities. */}
                        {/* Side-by-side comparison of any two files (kept in Tools
              too — it is a file utility, but belongs naturally here
              as well). */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Compare
                        </MenubarLabel>
                        <MenubarItem onClick={onOpenCompareFiles} disabled={!onOpenCompareFiles}
                                     className="gap-2 cursor-pointer"
                                     title="Compare any two files side by side (line diff with +/- markers)">
                            <Columns2 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Compare Two Files…</span>
                        </MenubarItem>
                        {/* explicit cancel - dims while no comparison is open. */}
                        <MenubarItem
                            onClick={onCancelCompare}
                            disabled={!onCancelCompare || !compareOpen}
                            className="gap-2 cursor-pointer"
                            title="Close every open comparison dialog (files / clipboard / folders)"
                        >
                            <XCircle className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Cancel Compare</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        {/* Accessibility sub-menu — moved here from the Header's ♿ dropdown. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Appearance & Access
                        </MenubarLabel>
                        <MenubarSub>
                            <MenubarSubTrigger className="gap-2 cursor-pointer"
                                               title="Accessibility options — high contrast, font size, screen reader, motion, etc.">
                                <Accessibility className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Accessibility</span>
                            </MenubarSubTrigger>
                            <MenubarSubContent className="w-72">
                                <MenubarLabel className="text-xs text-muted-foreground">Accessibility</MenubarLabel>
                                <MenubarCheckboxItem checked={!!a11yState?.highContrast}
                                                     onCheckedChange={() => onToggleHighContrast?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Toggle the high-contrast color theme">
                                    <Contrast className="size-3.5"/>
                                    <span className="flex-1">High-Contrast Mode</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.largeText}
                                                     onCheckedChange={() => onToggleLargeText?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Toggle 125% UI text size for readability">
                                    <ZoomIn className="size-3.5"/>
                                    <span className="flex-1">Large Text Mode (125%)</span>
                                </MenubarCheckboxItem>
                                <MenubarItem onClick={onIncreaseFontSizeA11y} className="gap-2 cursor-pointer"
                                             title="Bump the code viewer font size up by 1px">
                                    <ZoomIn className="size-3.5"/>
                                    <span className="flex-1">Increase Code Font Size</span>
                                </MenubarItem>
                                <MenubarItem onClick={onDecreaseFontSizeA11y} className="gap-2 cursor-pointer"
                                             title="Bump the code viewer font size down by 1px">
                                    <ZoomOut className="size-3.5"/>
                                    <span className="flex-1">Decrease Code Font Size</span>
                                </MenubarItem>
                                <MenubarCheckboxItem checked={!!a11yState?.dyslexiaFriendly}
                                                     onCheckedChange={() => onToggleDyslexiaFriendly?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Use a wider letter-spacing + line-height + Atkinson Hyperlegible font stack">
                                    <Type className="size-3.5"/>
                                    <span className="flex-1">Dyslexia-Friendly Mode</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.colorBlind}
                                                     onCheckedChange={() => onToggleColorBlind?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Swap red/green status indicators for blue/orange (deuteranopia/protanopia-friendly)">
                                    <PaletteIcon className="size-3.5"/>
                                    <span className="flex-1">Color-Blind Mode (Blue/Orange)</span>
                                </MenubarCheckboxItem>
                                <MenubarSeparator/>
                                <MenubarCheckboxItem checked={!!a11yState?.screenReader}
                                                     onCheckedChange={() => onToggleScreenReader?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Add extra ARIA labels + keyboard hints for screen-reader users">
                                    <Volume2 className="size-3.5"/>
                                    <span className="flex-1">Screen Reader Mode</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.reduceMotion}
                                                     onCheckedChange={() => onToggleReduceMotion?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Disable animations and transitions">
                                    <Zap className="size-3.5"/>
                                    <span className="flex-1">Reduce Motion</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.enhancedFocus}
                                                     onCheckedChange={() => onToggleEnhancedFocus?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Thicker focus rings for keyboard navigation">
                                    <Focus className="size-3.5"/>
                                    <span className="flex-1">Enhanced Focus Rings</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.wrapTab}
                                                     onCheckedChange={() => onToggleWrapTab?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Tab wraps from the last focusable element back to the first">
                                    <MoveHorizontal className="size-3.5"/>
                                    <span className="flex-1">Wrap Tab Navigation</span>
                                </MenubarCheckboxItem>
                                <MenubarSeparator/>
                                <MenubarCheckboxItem checked={!!a11yState?.alwaysShowShortcuts}
                                                     onCheckedChange={() => onToggleAlwaysShowShortcuts?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Show keyboard shortcut hints next to every menu item / button that has one">
                                    <Keyboard className="size-3.5"/>
                                    <span className="flex-1">Always Show Shortcut Hints</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.stickyCursor}
                                                     onCheckedChange={() => onToggleStickyCursor?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Keep a visible caret indicator on the active line even when not focused">
                                    <Crosshair className="size-3.5"/>
                                    <span className="flex-1">Sticky Cursor Indicator</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.highlightCurrentLine}
                                                     onCheckedChange={() => onToggleHighlightCurrentLine?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Draw a subtle background on the line under the mouse / caret">
                                    <Highlighter className="size-3.5"/>
                                    <span className="flex-1">Highlight Current Line</span>
                                </MenubarCheckboxItem>
                                <MenubarCheckboxItem checked={!!a11yState?.showWhitespace}
                                                     onCheckedChange={() => onToggleShowWhitespace?.()}
                                                     className="gap-2 cursor-pointer"
                                                     title="Surface trailing whitespace and tab/space differences in the code viewer">
                                    <Hash className="size-3.5"/>
                                    <span className="flex-1">Show Whitespace Characters</span>
                                </MenubarCheckboxItem>
                                <MenubarSeparator/>
                                <MenubarItem onClick={() => onOpenSettings?.()}
                                             className="gap-2 cursor-pointer text-emerald-600"
                                             title="Open the full Settings dialog (⌘,)">
                                    <SettingsIcon className="size-3.5"/>
                                    <span className="flex-1">Open Full Settings…</span>
                                </MenubarItem>
                            </MenubarSubContent>
                        </MenubarSub>
                        {/* Interface theme picker — a submenu listing every built-in
              theme (the navbar dropdown's twin). next-themes' class is
              driven by the theme's family inside onSetUiTheme. */}
                        <MenubarSeparator/>
                        <MenubarSub>
                            <MenubarSubTrigger className="gap-2 cursor-pointer"
                                               title="Pick the interface theme — Light, Dark, One Dark, Monokai, Dracula, Nord, Gruvbox, Solarized, Tokyo Night, Rosé Pine, Catppuccin, GitHub, Ayu, Kanagawa, Sepia, High Contrast…">
                                {isDark ? <Moon className="size-3.5 text-indigo-500"/> :
                                    <Sun className="size-3.5 text-amber-500"/>}
                                <span className="flex-1">Interface Theme</span>
                                <span
                                    className="text-[10px] text-muted-foreground truncate max-w-[100px]">{activeUiTheme.label}</span>
                            </MenubarSubTrigger>
                            <MenubarSubContent className="w-60">
                                {UI_THEMES.map((t) => (
                                    <MenubarItem
                                        key={t.id}
                                        onClick={() => onSetUiTheme?.(t.id)}
                                        className="gap-2 cursor-pointer"
                                        title={t.hint}
                                    >
                  <span
                      className="flex items-center justify-center size-4 rounded-sm border border-foreground/10 shrink-0"
                      style={{backgroundColor: t.swatch.bg}}
                      aria-hidden="true"
                  >
                    <span className="size-1.5 rounded-full" style={{backgroundColor: t.swatch.accent}}/>
                  </span>
                                        <span className="flex-1 truncate">{t.label}</span>
                                        {activeUiTheme.id === t.id && <Check className="size-3.5 text-emerald-500"/>}
                                    </MenubarItem>
                                ))}
                            </MenubarSubContent>
                        </MenubarSub>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Git menu — the dedicated version control tab ──
          Previously two items buried at the bottom of Tools; now a
          proper menu (VS Code / JetBrains parity) with the dirty-file
          count as a badge on the trigger itself. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Git menu — commit, history, branches, diffs">
                            {t("menuGit")}
                            {gitDirtyCount != null && gitDirtyCount > 0 && (
                                <span
                                    className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-medium">
                {gitDirtyCount > 99 ? "99+" : gitDirtyCount}
              </span>
                            )}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Repository
                        </MenubarLabel>
                        <MenubarItem onClick={onOpenCommit} disabled={!onOpenCommit} className="gap-2 cursor-pointer"
                                     title="Stage and commit modified files — opens the Commit dialog with a message + file checklist">
                            <GitCommitHorizontal className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Commit…</span>
                        </MenubarItem>
                        {/* the commit-history browser — list of commits,
              per-commit changed files + full patch. */}
                        <MenubarItem onClick={onOpenGitLog} disabled={!onOpenGitLog} className="gap-2 cursor-pointer"
                                     title="Browse the commit history — every commit's message, changed files and full diff">
                            <History className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Commit History…</span>
                        </MenubarItem>
                        {/* branch picker (was only reachable from the
              footer chip). */}
                        <MenubarItem onClick={onOpenBranchPicker} disabled={!onOpenBranchPicker}
                                     className="gap-2 cursor-pointer"
                                     title="List / create / checkout / delete branches">
                            <GitBranch className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Branches…</span>
                        </MenubarItem>
                        {/* The stash stack — push / list / pop / apply / drop with a
              diff preview (the dialog the branch picker and the diff
              panel's overflow menu also open). */}
                        <MenubarItem
                            onClick={() => window.dispatchEvent(new Event("praxis:git-stash-open"))}
                            className="gap-2 cursor-pointer"
                            title="Stash stack — push, pop, apply or drop stashes with a diff preview"
                        >
                            <Archive className="size-3.5 text-amber-500"/>
                            <span className="flex-1">Stashes…</span>
                        </MenubarItem>
                        {/* open the Git Diff bottom tab (was only
              reachable by clicking the tab itself). */}
                        <MenubarItem onClick={onOpenGitDiff} disabled={!onOpenGitDiff} className="gap-2 cursor-pointer"
                                     title="Open the Git Diff tab — side-by-side diff of every modified file">
                            <Columns2 className="size-3.5 text-violet-500"/>
                            <span className="flex-1">View Changes…</span>
                            {gitDirtyCount != null && gitDirtyCount > 0 && (
                                <span
                                    className="text-[9px] text-muted-foreground">{gitDirtyCount > 99 ? "99+" : gitDirtyCount} modified</span>
                            )}
                        </MenubarItem>
                        {/* AI review of the working changes — the diff piped
              hunk-by-hunk through the AI chat with one-click fixes. */}
                        <MenubarItem
                            onClick={onOpenAiReview}
                            disabled={!onOpenAiReview || (gitDirtyCount ?? 0) === 0}
                            className="gap-2 cursor-pointer"
                            title="Scan the working diff hunk-by-hunk and leave inline AI comments (bug risk, style, missing test) with one-click apply-fix"
                        >
                            <Sparkles className="size-3.5 text-violet-500"/>
                            <span className="flex-1">Review Changes With AI…</span>
                        </MenubarItem>
                        {/* The three-way merge editor — auto-offered on conflicted
              files; here for the current file on demand. */}
                        <MenubarItem
                            onClick={onOpenMergeEditor}
                            disabled={!onOpenMergeEditor}
                            className="gap-2 cursor-pointer"
                            title="Resolve this file's conflict markers in the three-way merge editor (Ours / Base / Theirs columns, per-chunk accept)"
                        >
                            <GitMerge className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Resolve In Merge Editor…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        {/* a header for the compare utility (it is a file
              diff action, not repository state — a divider alone did
              not signal the topic change). */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Compare
                        </MenubarLabel>
                        {/* side-by-side comparison of any two files
              (kept in Tools too — it is a file utility, but belongs
              naturally here as well). */}
                        <MenubarItem onClick={onOpenCompareFiles} disabled={!onOpenCompareFiles}
                                     className="gap-2 cursor-pointer"
                                     title="Compare any two files side by side (line diff with +/- markers)">
                            <Columns2 className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Compare Two Files…</span>
                        </MenubarItem>
                        {/* explicit cancel - dims while no comparison is open. */}
                        <MenubarItem
                            onClick={onCancelCompare}
                            disabled={!onCancelCompare || !compareOpen}
                            className="gap-2 cursor-pointer"
                            title="Close every open comparison dialog (files / clipboard / folders)"
                        >
                            <XCircle className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Cancel Compare</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem disabled className="text-[10px] text-muted-foreground">
                            {gitDirtyCount != null && gitDirtyCount > 0
                                ? `${gitDirtyCount} file${gitDirtyCount === 1 ? "" : "s"} with uncommitted changes`
                                : "Working tree clean"}
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Collaborate menu — Live Share-style session controls ──
A room-based presence + ops channel (SSE): guest cursors /
selections / presence avatars, follow mode and shared terminal
output. The session card itself (roster, invite link, guest
permission) lives in the CollabSession dialog; Settings →
Collaboration carries the display name / cursor color / guest
permission defaults. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium gap-1.5"
                                role="menuitem"
                                title="Collaborate menu — live share sessions, invite links, guest permissions">
                            <Users className="size-3.5 text-emerald-500"/>
                            {t("menuCollaborate")}
                            {collabActive && (
                                <span
                                    className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                                    {typeof collabPeers === "number" ? collabPeers : 0} peer{collabPeers === 1 ? "" : "s"}
              </span>
                            )}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Live session
                        </MenubarLabel>
                        <MenubarItem
                            onClick={onCollabShareWorkspace}
                            disabled={!onCollabShareWorkspace || !!collabActive}
                            className="gap-2 cursor-pointer"
                            title="Start a live session for this workspace — share the invite link and collaborate in real time (cursors, selections, follow mode)"
                        >
                            <Share2 className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Share Workspace…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onCollabCopyInvite}
                            disabled={!onCollabCopyInvite || !collabActive}
                            className="gap-2 cursor-pointer"
                            title="Copy the invite link for the active session to the clipboard"
                        >
                            <Link2 className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Copy Invite Link</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onCollabEndSession}
                            disabled={!onCollabEndSession || !collabActive}
                            className="gap-2 cursor-pointer"
                            title="End the live session and disconnect every guest"
                        >
                            <PhoneOff className="size-3.5 text-red-500"/>
                            <span className="flex-1">End Session</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem
                            onClick={() => onOpenSettings?.("collaboration")}
                            disabled={!onOpenSettings}
                            className="gap-2 cursor-pointer"
                            title="Display name, cursor color and guest permissions (read-only vs edit)"
                        >
                            <SettingsIcon className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Collaboration Settings…</span>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Focus menu — concentration, ambient sounds & statistics ──
Timer commands are dispatched as `praxis:focus-command` window
events handled by the <FocusSessions /> widget; ambient sounds
drive the SHARED engine (lib/ambient) directly — they play with
or without a timer. EVERY option carries a
styled tooltip (the Tip wrapper) plus a native title fallback. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Focus menu — concentration timers, ambient sounds, breaks and study statistics">
                            {t("menuFocus")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-64">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Arm A Session (Starts On Your Click)
                        </MenubarLabel>
                        <Tip
                            tip="The classic Pomodoro technique — 25 min focus, 5 min short breaks. ARMS the session: the clock waits for your Start click.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {
                                    detail: {
                                        command: "start",
                                        preset: "pomodoro"
                                    }
                                }))}
                                className="gap-2 cursor-pointer"
                                title="The classic Pomodoro technique — 25 min focus, 5 min short breaks. ARMS the session: the clock waits for your Start click."
                            >
                                <Brain className="size-3.5 text-emerald-500"/>
                                <span className="flex-1">Pomodoro 25/5</span>
                                <kbd className="text-[9px] text-muted-foreground">25m</kbd>
                            </MenubarItem>
                        </Tip>
                        <Tip
                            tip="The 52/17 rule (DeskTime productivity study) — 52 min focus, 17 min breaks. ARMS the session — press Start in the widget to count.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {
                                    detail: {
                                        command: "start",
                                        preset: "classic5217"
                                    }
                                }))}
                                className="gap-2 cursor-pointer"
                                title="The 52/17 rule (DeskTime productivity study) — 52 min focus, 17 min breaks. ARMS the session — press Start in the widget to count."
                            >
                                <TimerIcon className="size-3.5 text-sky-500"/>
                                <span className="flex-1">52 / 17 Rule</span>
                                <kbd className="text-[9px] text-muted-foreground">52m</kbd>
                            </MenubarItem>
                        </Tip>
                        <Tip
                            tip="One 90-minute ultradian deep-work cycle followed by a 20-minute recovery break. ARMS the session — press Start to count.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {
                                    detail: {
                                        command: "start",
                                        preset: "deepwork"
                                    }
                                }))}
                                className="gap-2 cursor-pointer"
                                title="One 90-minute ultradian deep-work cycle followed by a 20-minute recovery break. ARMS the session — press Start to count."
                            >
                                <Coffee className="size-3.5 text-violet-500"/>
                                <span className="flex-1">Deep Work 90</span>
                                <kbd className="text-[9px] text-muted-foreground">90m</kbd>
                            </MenubarItem>
                        </Tip>
                        <Tip
                            tip="Arm a session with your custom durations (Settings → Focus, or Focus settings… below) — the countdown waits for Start.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {
                                    detail: {
                                        command: "start",
                                        preset: "custom"
                                    }
                                }))}
                                className="gap-2 cursor-pointer"
                                title="Arm a session with your custom durations (set them in Focus settings… below) — the countdown waits for Start"
                            >
                                <SettingsIcon className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Custom Session</span>
                            </MenubarItem>
                        </Tip>
                        {/* The explicit START — nothing counts down until this (or the
              widget's Start button) is clicked. */}
                        <Tip tip="START the armed session's countdown — the timer never starts by itself.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "begin"}}))}
                                className="gap-2 cursor-pointer"
                                title="START the armed session's countdown — the timer never starts by itself"
                            >
                                <Play className="size-3.5 text-emerald-500"/>
                                <span className="flex-1">Start Countdown</span>
                            </MenubarItem>
                        </Tip>
                        <MenubarSeparator/>
                        {/* header for the live session control group (start /
            pause / skip / stop) — the armed presets above got a header,
            these runtime controls did not. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Session Control
                        </MenubarLabel>
                        <Tip
                            tip="Starts an armed session, pauses a running one, or resumes a held one — one smart button.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "pause-resume"}}))}
                                className="gap-2 cursor-pointer"
                                title="Starts an armed session, pauses a running one, or resumes a held one"
                            >
                                <PauseIcon className="size-3.5 text-amber-500"/>
                                <span className="flex-1">Start · Pause · Resume</span>
                            </MenubarItem>
                        </Tip>
                        <Tip
                            tip="Skip to the next phase — focus → break or break → focus. A skipped focus block does not count toward the statistics.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "skip"}}))}
                                className="gap-2 cursor-pointer"
                                title="Skip to the next phase — focus → break or break → focus"
                            >
                                <SkipForward className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Skip Phase</span>
                            </MenubarItem>
                        </Tip>
                        <Tip tip="Stop and reset the current session (zen mode lifts, the tab title restores).">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "stop"}}))}
                                className="gap-2 cursor-pointer"
                                title="Stop and reset the current session"
                            >
                                <Square className="size-3.5 text-red-500"/>
                                <span className="flex-1">Stop Session</span>
                            </MenubarItem>
                        </Tip>
                        <MenubarSeparator/>

                        {/* ── Ambient sounds — one quick master switch plus the mixer
              panel. The per-category track sublists were REMOVED: the
              mixer (below) contains all the sounds on one surface, so
              the navbar no longer duplicates it. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Ambient Sounds (No Timer Needed)
                        </MenubarLabel>
                        <Tip
                            tip="Turn the whole ambient mix on or off — fully independent of the focus timer. With nothing in the mix yet, a gentle rain starts by default.">
                            <MenubarCheckboxItem
                                checked={ambient.on}
                                onCheckedChange={handleAmbientToggle}
                                className="gap-2 cursor-pointer"
                                title="Turn the ambient mix on/off — plays with or without a timer"
                            >
                                {ambient.on ? <Volume2 className="size-3.5 text-emerald-500"/> :
                                    <VolumeX className="size-3.5 text-muted-foreground"/>}
                                <span
                                    className="flex-1">{ambient.on ? "Ambient Sounds On" : "Ambient Sounds Off"}</span>
                                {ambient.activeCount > 0 && (
                                    <span
                                        className="text-[9px] text-muted-foreground">{ambient.activeCount} in mix</span>
                                )}
                            </MenubarCheckboxItem>
                        </Tip>
                        <Tip
                            tip={`Open the Ambient Mixer — all ${AMBIENT_TRACK_COUNT} sounds on one draggable panel: toggle any combination, drag per-track volume sliders, set the master volume, or pick a one-click blend (Rainy café, Deep forest, …). No timer needed, and nothing else is blocked while it is open.`}>
                            <MenubarItem
                                onClick={() =>
                                    window.dispatchEvent(new CustomEvent("praxis:ambient-mixer"))
                                }
                                className="gap-2 cursor-pointer"
                                title={`Open the Ambient Mixer — mix any combination of the ${AMBIENT_TRACK_COUNT} sounds with per-track volume sliders (no timer needed)`}
                            >
                                <AudioWaveform className="size-3.5 text-emerald-500"/>
                                <span className="flex-1">Ambient Mixer…</span>
                                {ambient.activeCount > 0 && (
                                    <span className="text-[9px] text-muted-foreground">{ambient.activeCount} on</span>
                                )}
                            </MenubarItem>
                        </Tip>
                        <MenubarSeparator/>
                        {/* header for the widget / statistics group — was a
              bare divider after the ambient section. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Timer & Statistics
                        </MenubarLabel>
                        <Tip tip="Show the floating draggable timer — it stays on top of the IDE while you work.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "show"}}))}
                                className="gap-2 cursor-pointer"
                                title="Show the floating draggable timer (it stays on top of the IDE while you work)"
                            >
                                <Eye className="size-3.5 text-emerald-500"/>
                                <span className="flex-1">Show Floating Timer</span>
                            </MenubarItem>
                        </Tip>
                        <Tip tip="Hide the floating timer — sessions keep running in the background.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "hide"}}))}
                                className="gap-2 cursor-pointer"
                                title="Hide the floating timer (sessions keep running)"
                            >
                                <EyeOff className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Hide Floating Timer</span>
                            </MenubarItem>
                        </Tip>
                        <Tip
                            tip="Open the floating Focus widget on its settings page — focus/break durations, auto-chain, chime, zen mode and the daily goal.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "settings"}}))}
                                className="gap-2 cursor-pointer"
                                title="Focus / break durations, auto-start, chime and the working-on label (the ambient mixer has its own modal above)"
                            >
                                <SettingsIcon className="size-3.5 text-muted-foreground"/>
                                <span className="flex-1">Focus Settings…</span>
                            </MenubarItem>
                        </Tip>
                        <Tip tip="Today's focus blocks and minutes, day streak and all-time totals.">
                            <MenubarItem
                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:focus-command", {detail: {command: "stats"}}))}
                                className="gap-2 cursor-pointer"
                                title="Today's focus blocks and minutes, day streak and all-time totals"
                            >
                                <BarChart3 className="size-3.5 text-sky-500"/>
                                <span className="flex-1">Study Statistics…</span>
                            </MenubarItem>
                        </Tip>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Examples menu — ready-made files ( request) ──
          Creates complete, runnable example files into the selected
          folder (or the first folder). File names + identifiers honor
          Settings → Editor → Naming style; the same library powers the
          Explorer's right-click "New example…" submenu. */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Examples menu — create ready-to-run example files (Python, Markdown, text, …)">
                            {t("menuExamples")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-72">
                        {/* The example library — one submenu per language, cascading
              into category → subcategory → example. */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Browse By Language
                        </MenubarLabel>
                        {/* Nested language → (category) → subcategory → example
 (F2 + ). Subcategories are REAL SUBMENUS — divided
              from the beginning instead of one long flat list with tiny
              inline labels ("why not from the beginng div them; like
              yaml, u can grap the last examples into sub cats"). And
              single-category language groups (R, SQL, JSON, YAML, Shell)
              SKIP the redundant category level via exampleMenuNodes, so
              e.g. YAML lists CI / CD · Containers & services · …
              directly. Every leaf list is 3–28 items. */}
                        {examples?.exampleGroups().map((group) => (
                            <MenubarSub key={group.label}>
                                <MenubarSubTrigger
                                    className="gap-2 cursor-pointer"
                                    title={`Ready-made ${group.label} examples, grouped by category and subcategory`}
                                >
                                    <span className="flex-1 font-medium">{group.label}</span>
                                    <span className="text-[9px] text-muted-foreground">
                  {group.categories.reduce((n, c) => n + c.examples.length, 0)}
                </span>
                                </MenubarSubTrigger>
                                <MenubarSubContent className="w-60 max-h-[440px] overflow-y-auto">
                                    {examples?.exampleMenuNodes(group).map((node) => (
                                        <MenubarSub key={node.label}>
                                            <MenubarSubTrigger
                                                className="gap-2 cursor-pointer"
                                                title={
                                                    node.subcategories
                                                        ? `${node.count} ${node.label} examples, grouped by subcategory`
                                                        : `${node.count} ${node.label} examples`
                                                }
                                            >
                                                <span className="flex-1 truncate">{node.label}</span>
                                                <span className="text-[9px] text-muted-foreground">{node.count}</span>
                                            </MenubarSubTrigger>
                                            <MenubarSubContent className="w-56 max-h-[420px] overflow-y-auto">
                                                {node.subcategories
                                                    ? node.subcategories.map((sub) => (
                                                        <MenubarSub key={sub.label}>
                                                            <MenubarSubTrigger
                                                                className="gap-2 cursor-pointer"
                                                                title={`${sub.examples.length} ${sub.label} examples`}
                                                            >
                                                                <span className="flex-1 truncate">{sub.label}</span>
                                                                <span
                                                                    className="text-[9px] text-muted-foreground">{sub.examples.length}</span>
                                                            </MenubarSubTrigger>
                                                            <MenubarSubContent
                                                                className="w-56 max-h-[380px] overflow-y-auto">
                                                                {sub.examples.map((ex) => (
                                                                    <ExampleMenuItem key={ex.id} ex={ex}
                                                                                     onCreateExample={onCreateExample}/>
                                                                ))}
                                                            </MenubarSubContent>
                                                        </MenubarSub>
                                                    ))
                                                    : node.examples?.map((ex) => (
                                                        <ExampleMenuItem key={ex.id} ex={ex}
                                                                         onCreateExample={onCreateExample}/>
                                                    ))}
                                            </MenubarSubContent>
                                        </MenubarSub>
                                    ))}
                                </MenubarSubContent>
                            </MenubarSub>
                        ))}
                        <MenubarSeparator/>
                        <MenubarItem disabled className="text-[10px] text-muted-foreground">
                            Created in the selected folder · names follow your naming style
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* ─── Help menu ─────────────────────────────────────────── */}
                <MenubarMenu>
                    <MenubarTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium" role="menuitem"
                                title="Help menu — shortcuts, trainer, tutorial, install, about, GitHub">
                            {t("menuHelp")}
                        </Button>
                    </MenubarTrigger>
                    <MenubarContent align="start" className="w-56">
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Getting Started
                        </MenubarLabel>
                        <MenubarItem onClick={onShowShortcuts} disabled={!onShowShortcuts}
                                     className="gap-2 cursor-pointer"
                                     title="Open the keyboard shortcuts reference dialog">
                            <Keyboard className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">Keyboard Shortcuts…</span>
                        </MenubarItem>
                        {/* practice mode over the same registry. */}
                        <MenubarItem onClick={onOpenShortcutTrainer} disabled={!onOpenShortcutTrainer}
                                     className="gap-2 cursor-pointer"
                                     title="Browse + practice the keyboard shortcuts (press the combo, get instant feedback)">
                            <GraduationCap className="size-3.5 text-sky-500"/>
                            <span className="flex-1">Shortcut Trainer…</span>
                        </MenubarItem>
                        <MenubarItem onClick={onOpenTutorial} disabled={!onOpenTutorial}
                                     className="gap-2 cursor-pointer"
                                     title="Re-show the first-launch tutorial walkthrough (5 steps)">
                            <HelpCircle className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Show Tutorial…</span>
                        </MenubarItem>
                        <MenubarItem
                            onClick={onInstallApp}
                            disabled={!onInstallApp}
                            className="gap-2 cursor-pointer"
                            title="Install Praxis as a standalone app (own window, own taskbar entry, offline-capable). Needs a Chromium-family browser — for a desktop window on any browser use: bun run desktop"
                        >
                            <Download className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Install As App…</span>
                        </MenubarItem>
                        {/* "About me" — the author's profile, fetched
              from https://hossambalaha.github.io/ at build time of this
              dialog (content distilled into the AboutAuthorDialog
              component below). */}
                        <MenubarLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            About
                        </MenubarLabel>
                        <MenubarItem
                            onClick={() => setAboutOpen(true)}
                            className="gap-2 cursor-pointer"
                            title="About the author of Praxis — Hossam Magdy Balaha"
                        >
                            <UserRound className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">About The Author…</span>
                        </MenubarItem>
                        <MenubarSeparator/>
                        <MenubarItem
                            onClick={() => window.open("https://github.com/HossamBalaha/Praxis", "_blank", "noopener,noreferrer")}
                            className="gap-2 cursor-pointer"
                            title="Open the project's GitHub repository in a new tab"
                        >
                            <Github className="size-3.5 text-muted-foreground"/>
                            <span className="flex-1">View On GitHub</span>
                            <ExternalLink className="size-3 text-muted-foreground"/>
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

            </Menubar>

            {/* Spacer — pushes the right-side actions to the right edge. */}
            <div className="flex-1"/>

            {/* Right-side quick actions — the few things that earn a
          permanent slot in the bar (vs. being buried in a menu).
          These mirror VSCode's right-aligned toolbar: search, run
          history, refresh, settings, theme.

          The WHOLE cluster rides ONE horizontally-scrollable strip,
          and the strip is WIDTH-CAPPED at HALF the menu bar: with many
          quick actions toggled on, the buttons stay inside their own
          bounded pan strip (scrolling horizontally, panning with the
          wheel / middle-click drag / Shift+wheel) instead of claiming
          every leftover pixel up to the menus — the Menubar keeps its
          full width (shrink-0 below), the spacer absorbs the rest, and
          the cluster can never crowd or overflow onto the menu side
          of the bar. shrink + min-w-0 keep the strip the FIRST thing
          to yield when the window narrows. */}
            <div
                ref={quickActionsPanRef}
                className="flex h-full max-w-[50%] min-w-0 shrink flex-nowrap items-center gap-0.5 overflow-x-auto pb-0.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5"
                title="Scroll the quick actions left/right — wheel, middle-click drag, or Shift+wheel"
            >

                {/* the quick-action cluster — Run (with the
          active run-config badge + pinned entry point), Jump, the
          layout preset cycler and the terminal toggle. */}
                {onNavbarRun && qa("run") && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onNavbarRun}
                        disabled={!caps.canRun}
                        className={cn(
                            "h-7 gap-1.5 px-2 text-xs font-medium",
                            caps.canRun
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground opacity-60 cursor-not-allowed"
                        )}
                        aria-label="Run pinned entry point or the current file"
                        title={caps.canRun ? "Run the current file — or the pinned entry point when one is set (right-click a file ▸ Pin as run entry point)" : `Runs need a runnable file — ${kindHint}`}
                    >
                        <Play className="size-3.5"/>
                        <span className="hidden md:inline">Run</span>
                        {runConfigBadge && (
                            <span
                                className="hidden lg:inline rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground max-w-24 truncate">
              {runConfigBadge}
            </span>
                        )}
                    </Button>
                )}
                {onOpenJumpList && qa("jump") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenJumpList}
                        className="size-8 sm:size-7"
                        aria-label="Jump to anything (Ctrl+Shift+J)"
                        title="Jump to anything — pinned tabs, favorites, recents, last runs (Ctrl+Shift+J)"
                    >
                        <CornerDownLeft className="size-3.5"/>
                    </Button>
                )}
                {/* the Screenshot quick-action — a SPLIT button: the camera fires
          the DEFAULT kind (Settings → Capture → Make Default), the small
          chevron next to it opens the mode picker (window / whole-file
          code / region), with a check on the current default. The chosen
          capture opens the Screenshot Studio already firing; the studio
          handles Save To File / Download / Copy. */}
                {onScreenshot && qa("screenshot") && (
                    <div className="flex items-center" role="group"
                         aria-label="Screenshots — default kind plus mode picker">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 sm:size-7"
                            onClick={() => onScreenshot(defaultShotMode)}
                            aria-label={`Take the default screenshot (${defaultShotMode === "code" ? "whole open file" : defaultShotMode === "selection" ? "dragged region" : "window"})`}
                            title={`Screenshots — fires the default kind (${defaultShotMode}). Change it under Settings → Capture → Screenshot Capture; the chevron picks another kind once (Edit ▸ Screenshots too)`}
                        >
                            <Camera className="size-3.5 text-emerald-500"/>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 sm:size-7 w-6 sm:w-5 px-0"
                                    aria-label="Choose a screenshot kind"
                                    title="Pick the screenshot kind for this click — the check marks the camera button's default"
                                >
                                    <ChevronDown className="size-3 text-muted-foreground"/>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                                <DropdownMenuLabel
                                    className="text-xs text-muted-foreground">Screenshots</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onScreenshot("window")}
                                                  className="gap-2 cursor-pointer"
                                                  title="Screenshot the IDE's own workspace region (rasterized from the live DOM — no OS picker)">
                                    <Monitor className="size-3.5 text-sky-500"/>
                                    <span className="flex-1">Screenshot: window…</span>
                                    {defaultShotMode === "window" &&
                                      <Check className="size-3.5 text-emerald-500" aria-label="default kind"/>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onScreenshot("code")} className="gap-2 cursor-pointer"
                                                  title="Render the whole open file into a single PNG">
                                    <ImageIcon className="size-3.5 text-emerald-500"/>
                                    <span className="flex-1">Screenshot: code…</span>
                                    {defaultShotMode === "code" &&
                                      <Check className="size-3.5 text-emerald-500" aria-label="default kind"/>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onScreenshot("selection")}
                                                  className="gap-2 cursor-pointer"
                                                  title="Freeze the IDE, then snip just the dragged region — the capture stays inside the app">
                                    <MousePointerSquareDashed className="size-3.5 text-amber-500"/>
                                    <span className="flex-1">Screenshot: region…</span>
                                    {defaultShotMode === "selection" &&
                                      <Check className="size-3.5 text-emerald-500" aria-label="default kind"/>}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
                {/* the Developer-Toolbox quick-action — sits NEXT TO the
screenshot camera; same click as Tools ▸ Developer
Toolbox. Gated by the top-right quick-actions config. The
glyph comes from the shared map (toolbox-icons.tsx) so the
menu items and the dialog title show the SAME wrench. */}
                {onOpenDevToolbox && qa("toolbox") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenDevToolbox?.()}
                        className="size-8 sm:size-7"
                        aria-label="Open the Developer Toolbox"
                        title="Developer Toolbox — offline converters, encoders, hashes, generators, colors, network, time, reference, media studios (Tools ▸ Developer Toolbox too)"
                    >
                        <ToolboxIcon className="size-3.5 text-violet-500"/>
                    </Button>
                )}
                {onApplyLayoutPreset && qa("layout") && (
                    /* the layout button is a DROPDOWN — pick the
preset directly instead of cycling one-by-one. The old cycler stays
available in Window ▸ as "Step to next preset". */
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn("size-8 sm:size-7", layoutPresetId && "bg-muted")}
                                aria-label="Switch layout preset"
                                title={
                                    layoutPresetId
                                        ? `Layout: ${LAYOUT_PRESETS.find((p) => p.id === layoutPresetId)?.label ?? "custom"} — click to pick another`
                                        : "Pick a layout preset"
                                }
                            >
                                <LayoutGrid className="size-3.5"/>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Layout
                                Presets</DropdownMenuLabel>
                            {LAYOUT_PRESETS.map((preset) => (
                                <DropdownMenuItem
                                    key={preset.id}
                                    onClick={() => onApplyLayoutPreset?.(preset.id)}
                                    className="gap-2 cursor-pointer"
                                >
                                    <LayoutGrid
                                        className={cn("size-3.5", layoutPresetId === preset.id ? "text-emerald-500" : "text-muted-foreground")}/>
                                    <span className="flex-1">{preset.label}</span>
                                    {layoutPresetId === preset.id && (
                                        <span
                                            className="text-[9px] text-emerald-600 dark:text-emerald-400">active</span>
                                    )}
                                </DropdownMenuItem>
                            ))}
                            {onCycleLayoutPreset && (
                                <>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem onClick={onCycleLayoutPreset} className="gap-2 cursor-pointer">
                                        <RefreshCw className="size-3.5 text-muted-foreground"/>
                                        <span className="flex-1">Step To Next Preset</span>
                                    </DropdownMenuItem>
                                </>
                            )}
                            {onResetLayout && (
                                <DropdownMenuItem onClick={onResetLayout} className="gap-2 cursor-pointer">
                                    <Undo2 className="size-3.5 text-muted-foreground"/>
                                    <span className="flex-1">Reset Layout</span>
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                {onToggleTerminalPanel && qa("terminal") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleTerminalPanel}
                        aria-pressed={terminalPanelOpen}
                        className={cn("size-8 sm:size-7", terminalPanelOpen && "bg-muted")}
                        aria-label="Toggle the terminal panel (Ctrl+`)"
                        title="Toggle the terminal panel (Ctrl+`)"
                    >
                        <TerminalSquare className="size-3.5"/>
                    </Button>
                )}
                {/* ─── the EXTRA quick actions ─────────────────────────────────
More slots in the SAME cluster pattern (ghost icon
buttons, tooltip + aria-label). Unlike the 13 established
switches, these are OPT-IN: each rides the persisted
topRightQuickActions map (Settings → Nav → "Top-right quick
actions" — same storage, same mechanism) but its switch
defaults to OFF, so the button is completely HIDDEN from the
bar until its switch holds an explicit true (qaExtra). The
live button renders ONLY when enabled — no grey disabled
placeholders. Every action
stays reachable from the menus.
Terminal / run history / AI chat were suggested too but
already have established buttons above — these are the
genuinely new slots. */}
                {onOpenCommandPalette && qaExtra("palette") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenCommandPalette}
                        className="size-8 sm:size-7"
                        aria-label="Command palette"
                        title="Command palette — every action in one searchable list (Ctrl+Shift+P)"
                    >
                        <Command className="size-3.5"/>
                    </Button>
                )}
                {onToggleDistractionFree && qaExtra("distractionFree") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleDistractionFree}
                        aria-pressed={distractionFree}
                        className={cn("size-8 sm:size-7", distractionFree && "bg-muted")}
                        aria-label="Distraction-free mode"
                        title="Distraction-free mode — just the editor (Shift+F11)"
                    >
                        <Eye className="size-3.5"/>
                    </Button>
                )}
                {onOpenRunQueue && qaExtra("runQueue") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenRunQueue}
                        className="size-8 sm:size-7"
                        aria-label="Run queue"
                        title="Run queue — every run executing right now, with per-run Stop"
                    >
                        <ListVideo className="size-3.5"/>
                    </Button>
                )}
                {onOpenScheduler && qaExtra("scheduler") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenScheduler}
                        className="size-8 sm:size-7"
                        aria-label="Scheduled runs"
                        title="Scheduled runs — re-run scripts on a fixed interval"
                    >
                        <CalendarClock className="size-3.5"/>
                    </Button>
                )}
                {/* ── MORE opt-in quick actions — same
mechanism, same default-OFF, same Settings → Nav switches:
Go-to-file, Bookmarks, Dependency Manager, Jump list. Their
handlers already existed as menu actions; the bar just never
offered them. OFF = fully hidden (no disabled placeholder).
───────────────────────────── */}
                {onGoToFile && qaExtra("goToFile") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onGoToFile}
                        className="size-8 sm:size-7"
                        aria-label="Go to file"
                        title="Go to file (⌘T) — jump straight to any file in the project"
                    >
                        <FileSearch className="size-3.5"/>
                    </Button>
                )}
                {onOpenBookmarks && qaExtra("bookmarks") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenBookmarks}
                        className="size-8 sm:size-7"
                        aria-label="Bookmarks"
                        title="Bookmarks — favorites + line bookmarks, one click to jump"
                    >
                        <Bookmark className="size-3.5"/>
                    </Button>
                )}
                {onOpenDependencyManager && qaExtra("dependencyManager") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenDependencyManager}
                        className="size-8 sm:size-7"
                        aria-label="Dependency Manager"
                        title="Dependency Manager — browse / install / remove the environment's pip packages"
                    >
                        <Package className="size-3.5"/>
                    </Button>
                )}
                {onOpenJumpList && qaExtra("jumpList") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenJumpList}
                        className="size-8 sm:size-7"
                        aria-label="Jump list"
                        title="Jump list — symbols and outline places in the open file"
                    >
                        <MapPin className="size-3.5"/>
                    </Button>
                )}
                {/* ── MORE opt-in quick actions (all default-OFF, Settings → Nav
          → "Top-right quick actions" — same mechanism as the eight
          extras above: the button renders ONLY on an explicit true,
          OFF = fully hidden, and every action stays reachable from
          its menu). With all of these on, the pan strip above keeps
          the cluster one row that scrolls horizontally. */}
                {onOpenProjectSymbols && qaExtra("projectSymbols") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenProjectSymbols}
                        className="size-8 sm:size-7"
                        aria-label="Go to symbol in project"
                        title="Go to symbol in project — functions, classes, methods across every folder"
                    >
                        <Layers className="size-3.5 text-sky-500"/>
                    </Button>
                )}
                {onOpenSnippets && qaExtra("snippets") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenSnippets}
                        className="size-8 sm:size-7"
                        aria-label="Snippets"
                        title="Snippets palette (Ctrl+/) — insert reusable code snippets"
                    >
                        <Terminal className="size-3.5 text-muted-foreground"/>
                    </Button>
                )}
                {onOpenSnippetManager && qaExtra("snippetManager") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenSnippetManager}
                        className="size-8 sm:size-7"
                        aria-label="Snippet Manager"
                        title="Snippet Manager — rename, edit, delete, import / export snippet packs"
                    >
                        <Scissors className="size-3.5 text-emerald-500"/>
                    </Button>
                )}
                {onOpenLocalHistory && qaExtra("localHistory") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenLocalHistory}
                        className="size-8 sm:size-7"
                        aria-label="Local file history"
                        title="Local file history — every save creates a snapshot you can roll back to"
                    >
                        <FileClock className="size-3.5 text-amber-500"/>
                    </Button>
                )}
                {onOpenGitLog && qaExtra("gitLog") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenGitLog}
                        className="size-8 sm:size-7"
                        aria-label="Commit history"
                        title="Git commit history — messages, changed files and full diffs"
                    >
                        <History className="size-3.5 text-sky-500"/>
                    </Button>
                )}
                {onOpenGitDiff && qaExtra("gitDiff") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenGitDiff}
                        className="size-8 sm:size-7 relative"
                        aria-label="Git changes"
                        title="Git diff — side-by-side diff of every modified file"
                    >
                        <Columns2 className="size-3.5 text-violet-500"/>
                        {gitDirtyCount != null && gitDirtyCount > 0 && (
                            <span
                                className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-1 rounded-full bg-violet-500 text-white text-[9px] font-medium flex items-center justify-center">
              {gitDirtyCount > 99 ? "99+" : gitDirtyCount}
            </span>
                        )}
                    </Button>
                )}
                {onOpenChartPreview && qaExtra("chartPreview") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenChartPreview}
                        disabled={!dataFileOpen}
                        className="size-8 sm:size-7"
                        aria-label="Chart preview"
                        title={dataFileOpen ? "Chart preview — pick X/Y columns of the current CSV and get an instant chart" : "Chart preview opens when a CSV / TSV / spreadsheet file is active"}
                    >
                        <BarChart3 className="size-3.5 text-emerald-500"/>
                    </Button>
                )}
                {onOpenSqlWorkbench && qaExtra("sqlWorkbench") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenSqlWorkbench}
                        className="size-8 sm:size-7"
                        aria-label="SQLite workbench"
                        title="SQLite workbench — pick a .db file, browse the schema, run read-only queries"
                    >
                        <Database className="size-3.5 text-indigo-500"/>
                    </Button>
                )}
                {onToggleFullscreen && qaExtra("fullscreen") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleFullscreen}
                        className="size-8 sm:size-7"
                        aria-label="Toggle fullscreen"
                        title="Fullscreen (F11) — the browser's whole window"
                    >
                        <Maximize2 className="size-3.5 text-muted-foreground"/>
                    </Button>
                )}
                {onOpenShortcutTrainer && qaExtra("shortcutTrainer") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenShortcutTrainer}
                        className="size-8 sm:size-7"
                        aria-label="Shortcut trainer"
                        title="Shortcut trainer — browse + practice the keyboard shortcuts with instant feedback"
                    >
                        <GraduationCap className="size-3.5 text-sky-500"/>
                    </Button>
                )}
                {onShowShortcuts && qaExtra("shortcuts") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onShowShortcuts}
                        className="size-8 sm:size-7"
                        aria-label="Keyboard shortcuts"
                        title="Keyboard shortcuts — the full reference dialog"
                    >
                        <Keyboard className="size-3.5 text-muted-foreground"/>
                    </Button>
                )}
                <div className="w-px h-5 bg-border mx-0.5 shrink-0"/>

                {qa("search") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenSearch}
                        className="size-8 sm:size-7"
                        aria-label="Search scripts (Ctrl+K)"
                        title="Search scripts (Ctrl+K)"
                    >
                        <Search className="size-3.5"/>
                    </Button>
                )}
                {qa("ai") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleAiChat?.()}
                        aria-pressed={aiChatOpen}
                        aria-label="Toggle AI chat assistant"
                        title="Toggle AI chat assistant"
                        className={cn(
                            "size-8 sm:size-7 relative",
                            aiChatOpen && "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                        )}
                    >
                        <Sparkles className="size-3.5 text-purple-500"/>
                    </Button>
                )}
                {qa("history") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenHistory}
                        className="size-8 sm:size-7 relative"
                        aria-label="Run history (⌘⇧H)"
                        title="Run history (⌘⇧H)"
                    >
                        <History className="size-3.5"/>
                        {historyCount != null && historyCount > 0 && (
                            <span
                                className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-medium flex items-center justify-center">
              {historyCount > 99 ? "99+" : historyCount}
            </span>
                        )}
                    </Button>
                )}
                {qa("refresh") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onRefresh}
                        disabled={refreshing}
                        className="size-8 sm:size-7"
                        aria-label="Refresh project (⌘⇧R)"
                        title="Refresh project (⌘⇧R)"
                    >
                        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")}/>
                    </Button>
                )}
                {qa("settings") && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onOpenSettings?.()}
                        className="size-8 sm:size-7"
                        aria-label="Settings (⌘,)"
                        title="Settings (⌘,)"
                    >
                        <SettingsIcon className="size-3.5"/>
                    </Button>
                )}
                {qa("theme") && (
                    /* Interface-theme picker — a DROPDOWN now. One Light / Dark
ride next-themes; the rest set data-theme from
lib/ui-themes.ts. Rows show a 3-dot swatch + label; the
active theme carries the check. */
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 sm:h-7 gap-1.5 px-2 text-xs"
                                aria-label="Interface theme"
                                title={`Interface theme: ${activeUiTheme.label} — click to pick a theme`}
                            >
                                {isDark ? <Moon className="size-3.5 text-indigo-500"/> :
                                    <Sun className="size-3.5 text-amber-500"/>}
                                <span className="hidden md:inline truncate max-w-[92px]">{activeUiTheme.label}</span>
                                <ChevronDown className="size-3 text-muted-foreground"/>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60 max-h-[420px] overflow-y-auto">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Interface Theme
                            </DropdownMenuLabel>
                            {UI_THEMES.map((t) => (
                                <DropdownMenuItem
                                    key={t.id}
                                    onClick={() => onSetUiTheme?.(t.id)}
                                    className="gap-2 cursor-pointer"
                                    title={t.hint}
                                >
                                    {/* swatch — bg / panel / accent / fg dots, like the
                    code-theme picker's chips */}
                                    <span
                                        className="flex items-center justify-center size-4 rounded-sm border border-foreground/10 shrink-0"
                                        style={{backgroundColor: t.swatch.bg}}
                                        aria-hidden="true"
                                    >
                  <span className="size-1.5 rounded-full" style={{backgroundColor: t.swatch.accent}}/>
                </span>
                                    <span className="flex-1 truncate">{t.label}</span>
                                    {t.family === "dark" &&
                                      <Moon className="size-3 text-muted-foreground/70" aria-hidden="true"/>}
                                    {activeUiTheme.id === t.id && <Check className="size-3.5 text-emerald-500"/>}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Active-project indicator — a small chip on the right edge of
the menu bar so the user always sees which project is active. */}
                {qa("project") && (
                    <div
                        className="hidden md:flex items-center gap-1.5 px-2 h-7 rounded-md bg-muted/50 text-[10px] text-muted-foreground ml-1 shrink-0"
                        title={`Active project: ${activeProject ? projects?.find((p) => p.path === activeProject)?.name ?? "Custom" : "Default (python_scripts/)"}`}
                    >
                        <Library className="size-3 text-emerald-500"/>
                        <span className="truncate max-w-[160px] font-medium">
            {activeProject
                ? projects?.find((p) => p.path === activeProject)?.name ?? "Custom"
                : "Default"}
          </span>
                    </div>
                )}
            </div>
            {/* /quick-actions pan strip */}

            {/* the About-the-author dialog (Help → About the
          author…). Rendered here so it shares the MenuBar's state. */}
            <AboutAuthorDialog open={aboutOpen} onOpenChange={setAboutOpen}/>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  BrandHeader — slim logo-only brand row rendered above the MenuBar */

/* ------------------------------------------------------------------ */

interface BrandHeaderProps {
    appName: string;
    tagline: string;
    className?: string;
}

/**
 * A slim, centered brand row rendered ABOVE the MenuBar: just the
 * logo. The app name + tagline used to be stacked beneath the logo,
 * which cost ~50px of vertical space on every screen for information
 * the user reads once — they now appear in a floating tooltip when
 * the logo is hovered (or focused — which also covers touch: tapping
 * the logo focuses it and shows the tooltip).
 *
 * The app name stays in the accessibility tree via the sr-only <h1>
 * and the button's aria-label, so screen readers and the document
 * outline are unchanged.
 */
export function BrandHeader({appName, tagline, className}: BrandHeaderProps) {
    return (
        <div
            role="banner"
            aria-label={`${appName} — ${tagline}`}
            className={cn(
                "flex items-center justify-center py-1.5 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0",
                className
            )}
        >
            {/* Keep the document outline (h1 = app name) without spending
          any visual space. */}
            <h1 className="sr-only">{appName}</h1>
            <Tooltip delayDuration={250}>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${appName} — ${tagline}`}
                        title={`${appName} — ${tagline}`}
                        className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                        <div className="size-7 rounded-lg overflow-hidden shadow-sm shrink-0">
                            <img src="/logo.svg" alt="" className="size-full" aria-hidden="true"/>
                        </div>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="px-3 py-2 text-left">
                    <p className="text-xs font-semibold leading-tight">{appName}</p>
                    <p className="text-[10px] opacity-80 leading-tight">{tagline}</p>
                </TooltipContent>
            </Tooltip>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  ShortcutsDialog — keyboard shortcuts reference                     */

/* ------------------------------------------------------------------ */

interface ShortcutsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const SHORTCUT_GROUPS_LOCAL = SHORTCUT_GROUPS;

/**
 * A modal dialog showing every keyboard shortcut in the app. Opened
 * by Help → Keyboard Shortcuts… (replaces the old behavior of opening
 * the command palette, which was misleading).
 *
 * Custom bindings (saved from the Settings → Shortcuts tab) are read
 * from localStorage on open and displayed in place of the defaults;
 * a small "custom" badge marks rebound shortcuts.
 */
export function ShortcutsDialog({open, onOpenChange}: ShortcutsDialogProps) {
    const [customs, setCustoms] = React.useState<Record<string, string>>({});
    React.useEffect(() => {
        if (open) setCustoms(loadCustomShortcuts());
    }, [open]);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Keyboard className="size-4 text-emerald-500"/>
                        Keyboard Shortcuts
                    </DialogTitle>
                    <DialogDescription>
                        Every shortcut in Praxis. Modifier keys: ⌘ = Cmd (macOS) / Ctrl (Windows/Linux). ⇧ = Shift. ⌥ =
                        Alt/Option. ↵ = Enter. Rebind shortcuts in Settings → Shortcuts.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 py-2">
                    {SHORTCUT_GROUPS_LOCAL.map((g) => (
                        <div key={g.group} className="space-y-1.5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</h3>
                            <div className="space-y-1">
                                {g.items.map((it) => {
                                    const custom = customs[it.id];
                                    const keys = custom ?? it.keys;
                                    return (
                                        <div key={it.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground/80 flex items-center gap-1.5">
                        {it.action}
                          {custom && (
                              <span
                                  className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                            custom
                          </span>
                          )}
                      </span>
                                            <kbd
                                                className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 text-foreground shrink-0">{keys}</kbd>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  ExampleMenuItem — one example row in the Examples menu cascade     */
/* (extracted so the leaf item markup is written once */
/*  instead of duplicated per nesting level).                          */

/* ------------------------------------------------------------------ */

function ExampleMenuItem({
                             ex,
                             onCreateExample,
                         }: {
    ex: FileExample;
    onCreateExample?: (exampleId: string) => void;
}) {
    return (
        <MenubarItem
            onClick={() => onCreateExample?.(ex.id)}
            disabled={!onCreateExample}
            className="gap-2 cursor-pointer"
            title={`${ex.description} — created in the selected folder, styled per Settings → Editor → Naming style.`}
        >
            {ex.language === "python" ? (
                <FileCode2 className="size-3.5 text-emerald-500 shrink-0"/>
            ) : ex.language === "markdown" ? (
                <FileText className="size-3.5 text-sky-500 shrink-0"/>
            ) : ex.language === "text" ? (
                <FileText className="size-3.5 text-muted-foreground shrink-0"/>
            ) : ex.language === "r" ? (
                <FileCode2 className="size-3.5 text-blue-500 shrink-0"/>
            ) : ex.language === "sql" ? (
                <Database className="size-3.5 text-indigo-500 shrink-0"/>
            ) : ex.language === "shell" ? (
                <Terminal className="size-3.5 text-teal-600 shrink-0"/>
            ) : ex.language === "yaml" ? (
                <Braces className="size-3.5 text-amber-500 shrink-0"/>
            ) : ex.language === "matlab" ? (
                /* the MATLAB example family. */
                <SquareSigma className="size-3.5 text-orange-500 shrink-0"/>
            ) : ex.language === "web" ? (
                /* the web family — design vs development tint. */
                ex.category === "Web Design" ? (
                    <Palette className="size-3.5 text-fuchsia-500 shrink-0"/>
                ) : (
                    <CodeXml className="size-3.5 text-cyan-600 shrink-0"/>
                )
            ) : ex.extension === ".gitignore" ? (
                <FileMinus className="size-3.5 text-red-400 shrink-0"/>
            ) : ex.extension === ".csv" ? (
                <Table className="size-3.5 text-amber-500 shrink-0"/>
            ) : (
                <Braces className="size-3.5 text-muted-foreground shrink-0"/>
            )}
            <span className="flex-1 truncate">{ex.label}</span>
        </MenubarItem>
    );
}

/* ------------------------------------------------------------------ */
/* AboutAuthorDialog — "About me" */

/* ------------------------------------------------------------------ */

/**
 * The author's profile, opened from Help → "About The Author…".
 * Content distilled from https://hossambalaha.github.io/ (fetched
 * 2026-11): roles, education, research interests, selected highlights
 * and links. Kept as a static, self-contained dialog — no runtime
 * fetch — so it works offline and renders instantly.
 */
function AboutAuthorDialog({open, onOpenChange}: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const {toast} = useToast();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserRound className="size-4 text-emerald-500"/>
                        About The Author
                    </DialogTitle>
                    <DialogDescription>
                        The developer behind Praxis.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-1 text-sm">
                    <div className="flex items-start gap-3">
                        <div className="size-12 rounded-xl overflow-hidden border shadow-sm shrink-0">
                            <img src="/logo.svg" alt="" aria-hidden="true" className="size-full"/>
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-base leading-tight">Hossam Magdy Balaha</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Ph.D. Candidate &amp; Graduate Teaching Assistant
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Bioengineering, J.B. Speed School of Engineering, University of Louisville
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Assistant Lecturer, Computer Engineering &amp; Control Systems, Mansoura University
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <GraduationCap className="size-3.5"/>
                            Education
                        </h3>
                        <ul className="text-xs space-y-1 list-disc pl-4">
                            <li>Ph.D., Translational Bioengineering — University of Louisville (2022–present)</li>
                            <li>Graduate Certificate, AI in Medicine — University of Louisville (2024)</li>
                            <li>M.Sc., Computer Engineering &amp; Control Systems — Mansoura University (2020)</li>
                            <li>B.Sc., Computers &amp; Systems Engineering — Mansoura University (2016)</li>
                        </ul>
                    </div>

                    <div className="space-y-1.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Award className="size-3.5"/>
                            Selected highlights
                        </h3>
                        <ul className="text-xs space-y-1 list-disc pl-4">
                            <li>50+ peer-reviewed publications; 20+ first-authored in high-impact journals</li>
                            <li>US patent: AI-based cervical vertebral maturation assessment</li>
                            <li>Top 2% Scientists Globally (Stanford/Elsevier, 2025 &amp; 2026)</li>
                            <li>H-index 29 · 2,800+ citations · Top 0.47% in AI in Cancer Detection</li>
                            <li>Teaches BE 544 (AI in Digital Histopathology) and BE 645 (AI &amp; Radiomics)</li>
                        </ul>
                    </div>

                    <div className="space-y-1.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Research interests
                        </h3>
                        <p className="text-xs leading-relaxed">
                            Medical image analysis · Deep learning · Machine learning · Computer vision ·
                            Radiomics · Explainable AI · Digital image processing · Meta-heuristic optimization ·
                            Full-stack web development · IoT · Cloud computing · Embedded systems
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => window.open("https://hossambalaha.github.io/", "_blank", "noopener,noreferrer")}
                            title="Open the author's personal website in a new tab"
                        >
                            <Link2 className="size-3.5 text-emerald-500"/>
                            Website
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => window.open("https://github.com/hossambalaha", "_blank", "noopener,noreferrer")}
                            title="Open the author's GitHub profile in a new tab"
                        >
                            <Github className="size-3.5"/>
                            GitHub
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => window.open("https://scholar.google.com/", "_blank", "noopener,noreferrer")}
                            title="Open Google Scholar in a new tab"
                        >
                            <GraduationCap className="size-3.5 text-sky-500"/>
                            Scholar
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            title="Copy the author's email to the clipboard"
                            onClick={() => {
                                void navigator.clipboard
                                    .writeText("h3ossam@gmail.com")
                                    .then(() => toast({title: "Email copied", variant: "success"}));
                            }}
                        >
                            <Mail className="size-3.5 text-amber-500"/>
                            Email
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
