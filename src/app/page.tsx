"use client";

import * as React from "react";
import {cn} from "@/lib/utils";
import {useStableEvent} from "@/lib/use-stable-event";
import {rafThrottle} from "@/lib/raf-batch";
/* Phase 2 extraction — ALL split-pane geometry and transitions live in
 * the pure engine module (src/layout/split-pane-engine.ts): the pane
 * model, the gutter topology (gutter count === panes − 1, proven by
 * unit tests), the share math and every open/close/retarget/resize
 * transition. page.tsx holds the state and renders; the engine rules. */
import {
    applySplitPreset,
    closedSplitLayout,
    closeSplitPane as closeSplitPaneInEngine,
    dragSplitGutterFrom,
    healSplitLayout,
    nudgeSplitGutter,
    openSplitLayout,
    paneBasisPercent,
    restoreSplitLayout,
    retargetSplitPane as retargetSplitPaneInEngine,
    setSplitGroupVisible,
    setSplitGroupWidth,
    type SplitLayoutState,
    toggleSplitLayout,
} from "@/layout/split-pane-engine";
/* Phase 2 extraction — the tab-lifecycle RULES (surface detection,
 * draft naming, ⌘S routing, switch guards) are pure and unit-tested in
 * lib/tab-lifecycle.ts; the React wiring lives in
 * hooks/use-tab-lifecycle.ts, called below. */
import {
    nextActiveAfterClose,
    pushClosedTab,
    routeSaveIntent,
    shouldConfirmClose,
    shouldGuardTabSwitch,
} from "@/lib/tab-lifecycle";
import {useTabLifecycle} from "@/hooks/use-tab-lifecycle";
import {queueConsoleRun, queueDebugRun} from "@/lib/pending-console-run";
import {collabCodeFromUrl, loadCollabSettings, makeRoomCode, roomUrl} from "@/lib/collab-store";
import {clearSnapshotHash, decodeSnapshotHash, type SnapshotFile, snapshotUrl} from "@/lib/snapshot-link";
// the client-safe DataFileInfo mirror — the shape /api/folders lists
// per data file (nested entries carry dir/path/slug).
import type {DataFileInfo} from "@/lib/data-file-types";
import {getExtensionState, setDocumentProvider, startEnabled, subscribeExtensions} from "@/lib/extensions-registry";
import {
    Activity,
    Bookmark,
    BookmarkPlus,
    BookOpen,
    Braces,
    Bug,
    CaseSensitive,
    ChartLine,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    Columns2,
    CopyMinus,
    Crosshair,
    Database,
    Download,
    FileCode2,
    FilePlus2,
    FlaskConical,
    GitCompare,
    Globe,
    History,
    Layers,
    ListTodo,
    ListTree,
    Loader2,
    Minimize2,
    MoreVertical,
    Package,
    Palette,
    PanelBottomClose,
    PanelLeft,
    PanelTop,
    Play,
    RefreshCw,
    Search,
    Settings as SettingsIcon,
    Sparkles,
    Square,
    SquareTerminal,
    Star,
    StickyNote,
    Terminal,
    TerminalSquare,
    Trash2,
    Upload,
    Variable,
    Wrench,
    X,
    Zap,
} from "lucide-react";

import {Button} from "@/components/ui/button";
// type-only import from the dynamically-imported Tests
// panel — erased at compile time, so it adds nothing to the bundle.
import type {TestReportData} from "@/components/tests-panel";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {Badge} from "@/components/ui/badge";
import {Textarea} from "@/components/ui/textarea";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,} from "@/components/ui/sheet";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {FolderTree} from "@/components/folder-tree";
import {MenuBar, ShortcutsDialog} from "@/components/menu-bar";
import {FocusSessions} from "@/components/focus-timer";
import {FolderPickerDialog} from "@/components/folder-picker-dialog";
import {useTheme} from "next-themes";
import {CodeViewer, type CodeViewerHandle} from "@/components/code-viewer";
import {FileViewer} from "@/components/file-viewer";
/* Phase 2 — the split-view pane + the shared empty-state card moved to
 * their own files (the engine lives in src/layout/split-pane-engine.ts). */
import {SplitFilePane} from "@/components/split-file-pane";
import {EmptyState} from "@/components/empty-state";
import {
    BackgroundRunGroup,
    type CoverageMap,
    type Figure,
    OutputPanel,
    type RunResult,
    type VariableEntry,
} from "@/components/output-panel";
// which file kinds RUN (python + node/tsx/matlab/r/shell/
// java/c/cpp) and the runtime labels for toasts + hints.
import {isRunnableKind, runLanguageForFile, runLanguageForKind, RUNTIME_LABEL_BY_LANGUAGE} from "@/lib/run-languages";
// the shared formatter registry + engine — the explorer's right-click
// Format ▸ routes every language through the SAME code the editor uses.
import {formattableKindFor} from "@/lib/formattable-kinds";
import {formatAnySource} from "@/lib/format-any";
// capability routing for the format/auto-indent commands —
// every formattable kind (incl. ruby / php / go) reaches its formatter.
import {capabilitiesForKind} from "@/lib/file-capabilities";
// diff-view save-through + slug recovery (the save-from-diff 400 fix).
import {deslugifyClient, saveDiffFileWrite} from "@/lib/diff-file-save";
// symbol-path breadcrumbs above the editor (module > class > function).
import {BreadcrumbsBar} from "@/components/breadcrumbs-bar";
// VS Code-style Ctrl+Tab switcher overlay + its key state machine.
import {TabSwitcherOverlay, useTabSwitcherKeys} from "@/components/tab-switcher-overlay";
// console variable → grid viewer host (claims PRAXIS_OPEN_VARIABLE_GRID).
import {VariableGridDialogHost} from "@/components/variable-grid-dialog";
// template gallery picker + manifest (replaces the window.prompt flow).
import {TemplatePickerDialog} from "@/components/template-picker-dialog";
import {templateById} from "@/lib/templates-manifest";
import {renderTemplate} from "@/lib/code-templates";
import type {PythonSymbol} from "@/lib/python-symbols";
// the persistent cross-run figure gallery (Plots tab).
import {type PlotEntry, PlotsPanel} from "@/components/plots-panel";
import {trackRecentScript} from "@/components/search-dialog";
import dynamic from "next/dynamic";
import {type HistoryEntry, loadHistory, saveHistory,} from "@/components/run-history";
// the FolderReadme import was removed — README.md is a normal
// file now (rendered by the FileViewer like any other .md file).
import {DiagnosticsPanel} from "@/components/diagnostics-panel";
import {
    type EditorTab,
    EditorTabs,
    SPLIT_EDITOR_DOWN_EVENT,
    SPLIT_EDITOR_EVENT,
    type SplitEditorDetail,
    type SplitTarget
} from "@/components/editor-tabs";
import {type CommandAction} from "@/components/command-palette";
import {Tutorial} from "@/components/tutorial";
import {ApiTokenPrompt} from "@/lib/api-auth";
// Per-panel error boundaries — a crash in one region (plots, a
// sidebar, the editor) shows a reload card IN that region instead of
// blanking the whole IDE.
import {PanelErrorBoundary} from "@/components/error-boundary";
// Perf HUD instrumentation — render counts for the main surface + SSE
// throughput counters (Settings → Advanced → performance HUD).
import {noteRender, noteSseBytes} from "@/lib/perf-metrics";
// Perf HUD (Settings → Advanced) + the offline indicator + the test
// watch badge — all footer-level status surfaces.
import {PerfHud} from "@/components/perf-hud";
import {OfflineIndicator} from "@/components/offline-indicator";
import {TestStatusBadge} from "@/components/test-status-badge";
// The status-bar interpreter pill (Environment Sync): shows the active
// Python + the folder's pinned state, and auto-applies the pin once.
import {EnvInterpreterPill} from "@/components/env-interpreter-pill";
// Offline write queue — saves made offline replay in order on reconnect.
import {queueOfflineWrite} from "@/lib/offline-store";
// The side-by-side diff surface ("open in editor" for any diff).
import {DiffView} from "@/components/diff-view";
// F5-survival snapshot — tabs, split layout, dirty buffers, terminal +
// console session ids all persist across reloads.
import {
    loadWorkspaceSession,
    readBottomPanel,
    readSplitWidths,
    saveWorkspaceSession,
    withBottomPanel,
    withSplitWidths,
    type WorkspaceSession,
} from "@/lib/workspace-session";
// Project-path resolution for the AI chat's clickable path:line citations
// (praxis:open-file-line) — matches a "folder/file.py" reference against
// the live folder tree and returns the (folderSlug, fileSlug) addressing
// every editor route uses.
import {matchProjectFilePath} from "@/lib/ai-chat-utils";
// The anchored fix payload the AI review dialog hands its onApplyFix as
// the third argument (type-only — erased at compile time, so the dialog
// itself stays a dynamic chunk).
import type {AiReviewFixPayload} from "@/components/ai-review-dialog";
// RTL/LTR shell direction follows the language setting; the t()
// translator wires the bottom-panel tabs + the Run/Stop buttons
// (i18n tab*/runButton/stopButton anchors).
import {useChromeLanguage, useDocumentDirection} from "@/lib/i18n-react";
// ─── run configs, scheduler, run queue, shortcut trainer ──
import {RunConfigPopover} from "@/components/run-config-popover";
import {CapturePicker} from "@/components/capture-picker";
import {SchedulerDialog} from "@/components/scheduler-dialog";
import {RunQueueDialog} from "@/components/run-queue-dialog";
import {ShortcutTrainer} from "@/components/shortcut-trainer";
import type {ToolPreload} from "@/lib/toolbox-preload";
import {SqliteWorkbench} from "@/components/sqlite-workbench";
import {ChartPreview} from "@/components/chart-preview";
import {TransformPipeline} from "@/components/transform-pipeline";
import {SnippetManager} from "@/components/snippet-manager";
import {JumpList} from "@/components/jump-list";
import {FolderCompareDialog} from "@/components/folder-compare-dialog";
import {ScaffoldDialog} from "@/components/scaffold-dialog";
import {
    LAYOUT_PRESETS,
    type LayoutPresetId,
    type LayoutPresetTarget,
    loadLastPreset,
    nextPreset,
    saveLastPreset,
} from "@/lib/layout-presets";
import {getAiContextFile, getRunEntryPoint,} from "@/lib/workspace-files";
// FILE-OPEN SPEED: click-time prefetch — the HTTP request for the
// file's content starts at the CLICK (before the state updates), so
// the transfer overlaps with React's render instead of following it.
import {codeUrlFor, fileUrlFor, invalidatePrefetchedFile, prefetchFileContent, takePrefetched} from "@/lib/prefetch";
import {loadSchedules, nextDueAt, saveSchedules, type Schedule,} from "@/lib/scheduler";
import type {RunConfig} from "@/lib/run-configs";
import {useKeyboardShortcuts} from "@/hooks/use-keyboard-shortcuts";
import {usePwaInstall} from "@/hooks/use-pwa-install";
import {useToast} from "@/hooks/use-toast";
import {APP_NAME, APP_TAGLINE, SCRIPTS_DIR_NAME, STORAGE_PREFIX} from "@/lib/config";
import {
    DEFAULT_SETTINGS,
    formatRequestSettings,
    getActiveChatProvider,
    getNamingStyles,
    loadSettings,
    mergeProjectSettings,
    saveSettings,
    type Settings,
} from "@/lib/settings";
// the app-wide interface-theme registry (Light / Dark + the extended
// families) — applies data-theme + resolves the next-themes family.
import {applyUiTheme} from "@/lib/ui-themes";
// Client-safe AI helpers — the persisted chat Tuning knobs (sampling)
// are read at request time so test generation honors them too.
import {readPersistedSampling} from "@/lib/ai-shared";
// the example library loads as a lazy dynamic chunk
// (src/hooks/use-examples.ts); the handler below awaits it on demand.
import {loadExamples} from "@/hooks/use-examples";
import {getIndentSettings, isReindentableFile, reindent, reindentPython} from "@/lib/indent";
// the Explorer's HTML auto-format / auto-indent.
// external store for the Footer's live cursor/selection
// indicators — typing no longer re-renders the whole page.
import {footerStore} from "@/lib/footer-store";
import {cacheRun, getCachedRun,} from "@/lib/output-cache";
import {type EstimateResult, estimateRunDuration, formatDuration,} from "@/lib/estimate-runtime";
import {
    FOCUS_RUN_EVENT,
    notifyRunFinished,
    playRunChime,
    requestRunNotifyPermission,
    type RunNotifyInfo
} from "@/lib/run-notify";
// run-format — pure run-pipeline helpers: the timeout-vs-stop sniff
// (mirrored onto result.timedOut when the end event lands) and the
// run-all batch alert builder (batchRunNotifyInfo).
import {batchRunNotifyInfo, isTimeoutRun} from "@/lib/run-format";
import {FILE_EXPORT_EVENT, type FileExportDetail} from "@/lib/export-events";
import {requestCompress} from "@/components/compress-dialog";
// ─── toolbox & workbench dialogs ─────────────
// PERF: DevToolbox statically pulled ~5,000 toolbox lines into the
// main JS chunk; it is a dialog nobody needs on first paint, so it
// now loads on first open (its own async chunk).
const DevToolbox = dynamic(() => import("@/components/dev-toolbox").then((m) => m.DevToolbox), {ssr: false});
// NOTE: deslugify is defined inline here (instead of imported from
// "@/lib/scripts") because scripts.ts imports node:fs/promises which
// can't run in the browser. The slug encoding is base64url — we
// decode it with the browser-native atob instead of Node's Buffer.
function deslugify(slug: string): string {
    try {
        // base64url uses - and _ instead of + and /; convert back to
        // standard base64 before atob.
        const b64 = slug.replace(/-/g, "+").replace(/_/g, "/");
        return decodeURIComponent(escape(atob(b64)));
    } catch {
        return slug;
    }
}

/* ------------------------------------------------------------------ */
/*  Code-split heavy dialogs — only loaded when first opened.          */
/*  Each moves to its own JS chunk, shrinking the initial bundle.      */
/* ------------------------------------------------------------------ */
const SearchDialog = dynamic(
    () => import("@/components/search-dialog").then((m) => m.SearchDialog),
    {ssr: false}
);
const SettingsDialog = dynamic(
    () => import("@/components/settings-dialog").then((m) => m.SettingsDialog),
    {ssr: false}
);
const ScreenshotStudio = dynamic(
    () => import("@/components/screenshot-studio").then((m) => m.ScreenshotStudio),
    {ssr: false}
);
const DataFileBrowser = dynamic(
    () => import("@/components/data-file-browser").then((m) => m.DataFileBrowser),
    {ssr: false}
);
const SnippetPalette = dynamic(
    () => import("@/components/snippet-palette").then((m) => m.SnippetPalette),
    {ssr: false}
);
const CommandPalette = dynamic(
    () => import("@/components/command-palette").then((m) => m.CommandPalette),
    {ssr: false}
);
const RunHistory = dynamic(
    () => import("@/components/run-history").then((m) => m.RunHistory),
    {ssr: false}
);
const SymbolPalette = dynamic(() => import("@/components/symbol-palette").then((m) => m.SymbolPalette), {ssr: false});
const FindUsagesDialog = dynamic(() => import("@/components/ide-dialogs").then((m) => m.FindUsagesDialog), {ssr: false});
const RenamePreviewDialog = dynamic(() => import("@/components/rename-preview-dialog").then((m) => m.RenamePreviewDialog), {ssr: false});
const QuickFixesDialog = dynamic(() => import("@/components/ide-dialogs").then((m) => m.QuickFixesDialog), {ssr: false});
const ProjectSearchDialog = dynamic(() => import("@/components/project-search-dialog").then((m) => m.ProjectSearchDialog), {ssr: false});
const LocalHistoryPanel = dynamic(() => import("@/components/local-history").then((m) => m.LocalHistoryPanel), {ssr: false});
const GitDiffPanel = dynamic(() => import("@/components/git-diff-panel").then((m) => m.GitDiffPanel), {ssr: false});
const GitCommitDialog = dynamic(() => import("@/components/git-commit-dialog").then((m) => m.GitCommitDialog), {ssr: false});
const AiChatSidebar = dynamic(() => import("@/components/ai-chat-sidebar").then((m) => m.AiChatSidebar), {ssr: false});
// ─── components ───────────────────────────────────────────
const SymbolSearchDialog = dynamic(() => import("@/components/symbol-search-dialog").then((m) => m.SymbolSearchDialog), {ssr: false});
const TodoPanel = dynamic(() => import("@/components/todo-panel").then((m) => m.TodoPanel), {ssr: false});
const TestsPanel = dynamic(() => import("@/components/tests-panel").then((m) => m.TestsPanel), {ssr: false});
const TerminalPanel = dynamic(() => import("@/components/terminal-panel").then((m) => m.TerminalPanel), {ssr: false});
// ─── components ───────────────────────────────────────────
// ('s BreadcrumbBar was REMOVED — the toolbar above the editor
// already shows folder ▸ file, so the in-editor breadcrumb duplicated
// it. "it is already in the header; no redundancy needed".)
const WorkspaceWelcome = dynamic(() => import("@/components/workspace-welcome").then((m) => m.WorkspaceWelcome), {ssr: false});
const CompareClipboardDialog = dynamic(() => import("@/components/compare-clipboard-dialog").then((m) => m.CompareClipboardDialog), {ssr: false});
// side-by-side file comparison + the Git Log browser + the
// footer's branch picker popover.
const CompareFilesDialog = dynamic(() => import("@/components/compare-files-dialog").then((m) => m.CompareFilesDialog), {ssr: false});
const GitLogDialog = dynamic(() => import("@/components/git-log-dialog").then((m) => m.GitLogDialog), {ssr: false});
// the dependency manager (Tools ▸ Dependency manager…).
const DependencyManagerDialog = dynamic(() => import("@/components/dependency-manager-dialog").then((m) => m.DependencyManagerDialog), {ssr: false});
// the project dictionary manager (Tools ▸ Project dictionary…).
const ProjectDictionaryDialog = dynamic(() => import("@/components/project-dictionary-dialog").then((m) => m.ProjectDictionaryDialog), {ssr: false});
// The Ambient Mixer modal — one surface for mixing all 36 ambient
// sounds (no timer needed). Opened via the Focus menu / the focus
// widget / Settings → Focus, all through the praxis:ambient-mixer event.
const AmbientMixerDialog = dynamic(() => import("@/components/ambient-mixer-dialog").then((m) => m.AmbientMixerDialog), {ssr: false});
// The Compress-to-ZIP dialog — opened by the Explorer's right-click
// "Compress to ZIP…" items AND the navbar's Tools ▸ Export compress
// items, through the praxis:compress window event.
const CompressDialog = dynamic(() => import("@/components/compress-dialog").then((m) => m.CompressDialog), {ssr: false});
const GitBranchPicker = dynamic(() => import("@/components/git-branch-picker").then((m) => m.GitBranchPicker), {ssr: false});
// the persistent Python console (Console mode).
const ConsolePanel = dynamic(() => import("@/components/console-panel").then((m) => m.ConsolePanel), {ssr: false});
const AiTestPreviewDialog = dynamic(() => import("@/components/ai-test-preview-dialog").then((m) => m.AiTestPreviewDialog), {ssr: false});
// ── the new feature surfaces (all code-split, mounted on demand) ──
const AstExplorerPanel = dynamic(() => import("@/components/ast-explorer-panel").then((m) => m.AstExplorerPanel), {ssr: false});
const BytecodeInspector = dynamic(() => import("@/components/bytecode-inspector").then((m) => m.BytecodeInspector), {ssr: false});
const DocstringStudio = dynamic(() => import("@/components/docstring-studio").then((m) => m.DocstringStudio), {ssr: false});
const RefactorPalette = dynamic(() => import("@/components/refactor-palette").then((m) => m.RefactorPalette), {ssr: false});
const VariableExplorer = dynamic(() => import("@/components/variable-explorer").then((m) => m.VariableExplorer), {ssr: false});
const AsyncTaskPanel = dynamic(() => import("@/components/async-tasks-panel").then((m) => m.AsyncTaskPanel), {ssr: false});
const HypothesisWorkbench = dynamic(() => import("@/components/hypothesis-workbench").then((m) => m.HypothesisWorkbench), {ssr: false});
const TutorView = dynamic(() => import("@/components/tutor-view").then((m) => m.TutorView), {ssr: false});
const TimeTravelDebugger = dynamic(() => import("@/components/time-travel-debugger").then((m) => m.TimeTravelDebugger), {ssr: false});
const CollabSession = dynamic(() => import("@/components/collab-session").then((m) => m.CollabSession), {ssr: false});
const MergeEditor = dynamic(() => import("@/components/merge-editor").then((m) => m.MergeEditor), {ssr: false});
const DuckDBWorkbench = dynamic(() => import("@/components/duckdb-workbench").then((m) => m.DuckDBWorkbench), {ssr: false});
const ApiClientWorkbench = dynamic(() => import("@/components/api-client-workbench").then((m) => m.ApiClientWorkbench), {ssr: false});
const LivePreviewPanel = dynamic(() => import("@/components/live-preview-panel").then((m) => m.LivePreviewPanel), {ssr: false});
const AiReviewDialog = dynamic(() => import("@/components/ai-review-dialog").then((m) => m.AiReviewDialog), {ssr: false});
// Agent Mode — multi-file AI edits with a step plan + per-file
// approvals (AI ▸ Agent Mode…). Dialog-only chunk like the review
// dialog above it.
const AgentModeDialog = dynamic(() => import("@/components/agent-mode-dialog").then((m) => m.AgentModeDialog), {ssr: false});
const ExtensionsPanel = dynamic(() => import("@/components/extensions-panel").then((m) => m.ExtensionsPanel), {ssr: false});
const TasksPanelContent = dynamic(() => import("@/components/tasks-panel-content").then((m) => m.TasksPanelContent), {ssr: false});
const OpenFromUrlDialog = dynamic(() => import("@/components/open-from-url-dialog").then((m) => m.OpenFromUrlDialog), {ssr: false});
const MultiPythonRunner = dynamic(() => import("@/components/multi-python-runner").then((m) => m.MultiPythonRunner), {ssr: false});
const HexEditorHost = dynamic(() => import("@/components/hex-editor").then((m) => m.HexEditor), {ssr: false});

/* ------------------------------------------------------------------ */
/*  Types                                                              */

/* ------------------------------------------------------------------ */
/** — one demoted background run in the Output panel (a run
 *  that was still streaming when a newer run started). Its SSE reader
 *  keeps accumulating into `result` until the run ends. */
interface BackgroundRun {
    key: string;
    folderName: string;
    fileName: string;
    runId: string | null;
    result: RunResult;
    startedAt: number;
    /** composite folder/file slug — lets the Output panel find
     *  a still-streaming background run when its file is re-selected. */
    fileKey: string;
}

interface FileInfo {
    name: string;
    slug: string;
    size: number;
    description?: string;
    tags?: string[];
    mtime?: number;
    /** File kind — used by the file viewer to pick the right renderer.
     * now the REAL FileKind union from `@/lib/scripts`
     *  (the stale inline copy missed sql / r / shell / spreadsheet /
     *  log, which made `kind === "spreadsheet"` dead code here). */
    kind?: import("@/lib/scripts").FileKind;
    /** Lowercase extension including the dot, e.g. ".py", ".md", ".csv". */
    ext?: string;
    /** relative sub-folder path inside the folder ("" = root) —
     * mirrors FileInfo from `@/lib/scripts` (nested files).
     *  Used by the sub-scoped run-all / example-collision checks. */
    dir?: string;
    /** relative path incl. filename (POSIX separators). */
    path?: string;
}

interface Folder {
    name: string;
    slug: string;
    files: FileInfo[];
    /** The synthetic PROJECT-ROOT entry (root-level files ride it —
     *  used when resolving a repo-relative path with no folder
     *  segment, e.g. the git diff panel's rightFilePath). */
    isRoot?: boolean;
    /** the README body is no longer part of the
     *  /api/folders payload — only its presence + file name are. The
     *  body is fetched on demand from /api/folder-readme (see the
     *  folderReadme effect) when a folder is selected. */
    hasReadme?: boolean;
    readmeFile?: string;
    isEmpty?: boolean;
    tags?: string[];
    dataFiles?: DataFileInfo[];
}

interface CodeResponse {
    folder: string;
    file: string;
    size: number;
    content: string;
    language: string;
}

interface BatchResult {
    file: string;
    fileSlug: string;
    runId: string;
    ok: boolean;
    exitCode: number;
    durationMs: number;
    stdout: string;
    stderr: string;
    truncated: boolean;
    killed: boolean;
    /** True when THIS file died by the batch's hard timeout (not a user
     * stop) — /api/run-all now sends it on the per-file end payload
     * alongside the stderr marker line, so history/cache entries can
     * show "Timed out" instead of the misleading "Stopped". */
    timedOut?: boolean;
    figures: string[];
    figureUrls: { url: string; name: string }[];
    stdoutBytes: number;
    stderrBytes: number;
    interpreter?: string;
}

const LAST_SEL_KEY = `${STORAGE_PREFIX}.last-selection`;
// session-restore key, hoisted to module scope so the
// file-selection guard effect (declared long before the restore
// effect) can read the persisted Close-all state without a TDZ on a
// component-scope const.
const SESSION_KEY = `${STORAGE_PREFIX}.session`;

// menu-bar event nonces use a monotonic counter instead
// of Date.now. FolderTree deduplicates the cross-instance echo via
// this nonce, and two events dispatched in the same millisecond used to
// get identical timestamps — the dedupe swallowed the second event, so
// an immediate re-open of the same dialog (cancel → menu → same item)
// silently did nothing.
let menuEventNonceCounter = 0;

function nextMenuEventNonce(): number {
    return ++menuEventNonceCounter;
}

/* ------------------------------------------------------------------ */
/*  Export helpers                                                     */

/* ------------------------------------------------------------------ */

/** Deferred blob-URL release — revoking in the same tick as click()
 *  can abort the download on Firefox/Safari (the anchor hasn't read
 *  the blob yet). One shared helper, used by every export handler. */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Render a source file's CONTENT for text-style exports (txt / md /
 *  pdf / latex / rst). Structured data files deserve a readable
 *  rendering, not a raw byte dump:
 *   - .jsonl — each line is one JSON record; render every record as a
 *     readable `key: value` block (the Records.jsonl → .txt export
 *     used to ship raw JSON lines, which is not "the content handled
 *     correctly"). Nested objects/arrays stay JSON-encoded on their
 *     line so nothing is lost.
 *   - .json  — pretty-printed with 2-space indent.
 *  Anything else (code, markdown, plain text, csv…) passes through
 *  unchanged; a malformed JSONL/JSON file also falls back to raw. */
function formatExportSource(fileName: string, source: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) {
        const lines = source.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length === 0) return source;
        const records: unknown[] = [];
        for (const line of lines) {
            try {
                records.push(JSON.parse(line));
            } catch {
                return source; // not valid JSONL — keep the raw bytes
            }
        }
        const renderValue = (v: unknown): string => {
            if (v === null) return "null";
            if (typeof v === "string") return v;
            if (typeof v === "object") return JSON.stringify(v);
            return String(v);
        };
        const blocks = records.map((rec, i) => {
            if (rec === null || typeof rec !== "object") {
                return `record ${i + 1}: ${renderValue(rec)}`;
            }
            const entries = Object.entries(rec as Record<string, unknown>)
                .map(([k, v]) => `  ${k}: ${renderValue(v)}`)
                .join("\n");
            return `record ${i + 1}:\n${entries}`;
        });
        return blocks.join("\n\n");
    }
    if (lower.endsWith(".json")) {
        try {
            return JSON.stringify(JSON.parse(source), null, 2);
        } catch {
            return source;
        }
    }
    return source;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function Home() {
    noteRender("Page");
    const {toast} = useToast();
    // RTL/LTR shell direction follows the language setting.
    useDocumentDirection();
    // the translated chrome strings — the same hook the menu bar uses;
    // a Settings → Appearance → Language change re-renders Home with
    // the new dictionary (bottom tabs, Run/Stop buttons).
    const {t} = useChromeLanguage();
    const {setTheme, resolvedTheme} = useTheme();

    // --- Folder / file tree ---
    const [folders, setFolders] = React.useState<Folder[]>([]);
    const [foldersLoading, setFoldersLoading] = React.useState(true);
    const [foldersError, setFoldersError] = React.useState<string | null>(null);
    /* BOOT LOADER — the app loads its configuration at startup
   * (localStorage settings + layout + selection hydration, then the
   * project's .praxis/settings.json overrides). Until that finishes the
   * shell would paint with DEFAULT settings and visibly re-flip when the
   * real values land. A full-screen initial loader (logo + spinner,
   * rendered below) covers exactly that window and disappears the
   * moment the configuration is in. */
    const [booted, setBooted] = React.useState(false);

    // Initialize selection from URL params (shareable links) or localStorage.
    const [selectedFolderSlug, setSelectedFolderSlug] = React.useState<string>("");
    const [selectedFileSlug, setSelectedFileSlug] = React.useState<string>("");
    /* PERF (slow file open): the FolderTree is an ~8k-line component and
re-rendering it synchronously on every selection change blocked the
whole UI for seconds — the editor below waited behind the tree.
`useDeferredValue` alone still started the tree's heavy
re-render IMMEDIATELY after the urgent commit — and since one
component's render function is uninterruptible, a code fetch that
resolved during that 0.7-2 s window queued BEHIND it (a Python file
looked "loading" for seconds even though its content had arrived).
A short DEBOUNCE (~150 ms) fixes the sequencing: the urgent pass
mounts the editor, the /api/code fetch lands, the file is VISIBLE —
and only then does the tree re-render to move the row highlight.
Rapid clicking coalesces into one tree update too. */
    const [deferredSelectedFolderSlug, setDeferredSelectedFolderSlug] =
        React.useState<string>(selectedFolderSlug);
    const [deferredSelectedFileSlug, setDeferredSelectedFileSlug] =
        React.useState<string>(selectedFileSlug);
    React.useEffect(() => {
        if (
            deferredSelectedFolderSlug === selectedFolderSlug &&
            deferredSelectedFileSlug === selectedFileSlug
        ) {
            return;
        }
        const t = setTimeout(() => {
            React.startTransition(() => {
                setDeferredSelectedFolderSlug(selectedFolderSlug);
                setDeferredSelectedFileSlug(selectedFileSlug);
            });
        }, 150);
        return () => clearTimeout(t);
    }, [selectedFolderSlug, selectedFileSlug, deferredSelectedFolderSlug, deferredSelectedFileSlug]);
    /* PERF: shared, stable, NON-BLOCKING sidebar toggle. The layout flip
     (⌘B / View ▸ Toggle sidebar) is wrapped in startTransition so the
     click paints instantly and React re-renders the page shell
     concurrently instead of freezing input for the ~1 s the (dev-mode)
     monolithic page render takes. The FolderTree itself is memo'd and
     does not re-render at all for this flip. Defined early so every
     consumer (keyboard shortcuts, menu bar, collapse buttons) shares
     one stable identity. */
    const toggleSidebarVisible = React.useCallback(() => {
        React.startTransition(() => {
            setSidebarVisible((v) => !v);
        });
    }, []);

    // --- Code content ---
    const [code, setCode] = React.useState<CodeResponse | null>(null);
    const [codeLoading, setCodeLoading] = React.useState(false);

    // --- Run state ---
    const [runResult, setRunResult] = React.useState<RunResult | null>(null);
    const [isRunning, setIsRunning] = React.useState(false);
    const [currentRunId, setCurrentRunId] = React.useState<string | null>(null);
    const [previousRunResult, setPreviousRunResult] = React.useState<RunResult | null>(null);
    /* ─── coverage → editor gutter mapping ──────────────────────
   * When the finished run carried coverage data (a "Run with coverage…"
   * run: the prelude's sys.settrace hook), map the EXECUTED lines of
   * the RUN file onto the editor's gutter — view mode gets a thin
   * emerald marker strip, edit mode tints the gutter numbers. The
   * coverage map keys are file PATHS (the tracer's frame filenames);
   * match the entry for the file the editor shows by basename. Entries for other files stay in the
   * Output panel's Coverage tab; a normal (non-coverage) run clears
   * the markers by omitting the prop. */
    const coverageLinesForEditor = React.useMemo<readonly number[] | undefined>(() => {
        const cov = runResult?.coverage;
        if (!cov || !code?.file) return undefined;
        const base = `/${code.file}`;
        const key = Object.keys(cov).find((k) => k === code.file || k.endsWith(base));
        const lines = key ? cov[key] : undefined;
        return lines && lines.length > 0 ? lines : undefined;
    }, [runResult?.coverage, code?.file]);
    // UNCOVERED lines for the open file (the twin of
    // coverageLinesForEditor): all source lines minus the executed set
    // — rendered as dim red gutter marks (Test Coverage Visualization).
    const coverageUncoveredForEditor = React.useMemo<readonly number[] | undefined>(() => {
        const cov = runResult?.coverage;
        if (!cov || !code?.file || !code?.content) return undefined;
        const base = `/${code.file}`;
        const key = Object.keys(cov).find((k) => k === code.file || k.endsWith(base));
        const covered = key ? new Set(cov[key]) : undefined;
        if (!covered) return undefined;
        const total = code.content.split("\n").length;
        const out: number[] = [];
        for (let i = 1; i <= total; i++) if (!covered.has(i)) out.push(i);
        return out.length > 0 ? out : undefined;
    }, [runResult?.coverage, code?.file, code?.content]);
    // mypy type inlays (the type-check power mode) — the Diagnostics
    // panel's typecheck runs emit praxis:type-inlays with the response;
    // they ride the same rendering layer as the runtime inlays.
    const [typeInlays, setTypeInlays] = React.useState<Array<{
        line: number;
        col: number;
        endCol?: number;
        label: string;
        kind: "type" | "return"
    }> | undefined>(undefined);
    // mypy-revealed symbol types (relay of the typecheck tool's
    // symbolTypes) — the view-mode hover card shows `name: type`.
    const [typeSymbols, setTypeSymbols] = React.useState<Array<{
        line: number;
        name: string;
        type: string
    }> | undefined>(undefined);
    // Line-profile heat (Run ▸ Line & Memory Profile…) — per-line
    // microseconds for the open file's gutter strip.
    const [lineProfileHeat, setLineProfileHeat] = React.useState<Record<string, number> | undefined>(undefined);

    // Ref mirrors of the run flags so the watcher handler (which must
    // NOT re-subscribe when they change) can read them synchronously.
    // Used to defer Explorer refreshes while a script/batch is running
    //
    // will the folders be refreshed multiple times? why not one time at
    // the end?") — see the watcher effect + the flush effect below.
    const isRunningRef = React.useRef(false);
    React.useEffect(() => {
        isRunningRef.current = isRunning;
    }, [isRunning]);
    //
    // another py file; it should open its output while others are
    // running normally and not force me to wait for current execution
    // to get the output"): the Output panel now FOLLOWS THE SELECTION.
    // Every run session is keyed by its file; SSE updates repaint the
    // panel only while that file is the selected one, and switching to
    // a file with an ACTIVE session shows that session instantly (and
    // keeps streaming) — the other runs continue in the background.
    const selectedFileKeyRef = React.useRef("");
    React.useEffect(() => {
        selectedFileKeyRef.current =
            selectedFolderSlug && selectedFileSlug ? `${selectedFolderSlug}/${selectedFileSlug}` : "";
    }, [selectedFolderSlug, selectedFileSlug]);
    /** synchronous kind mirror — doRun reads the open file's
     *  kind without depending on it (its deps stay stable). Derived from
     *  the folders ref (selectedFile is declared much later). */
    const selectedFileKindRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        selectedFileKindRef.current =
            foldersRef.current
                .find((c) => c.slug === selectedFolderSlug)
                ?.files.find((f) => f.slug === selectedFileSlug)?.kind ?? null;
    }, [selectedFolderSlug, selectedFileSlug, folders]);

    // ─── parallel background runs ─────────────────────────
    // A second Run while one is still streaming no longer blocks: the
    // new run becomes the PRIMARY output and the still-streaming run is
    // DEMOTED to a background group in the Output panel (it keeps
    // accumulating + lands in the run history as usual). The SSE reader
    // of each run writes through a per-run "sink box" whose mode can be
    // flipped from primary→background at demotion time.
    const [backgroundRuns, setBackgroundRuns] = React.useState<BackgroundRun[]>([]);
    // ref mirror — the file-switch effect reads the streaming
    // background runs WITHOUT taking the state as a dependency (a
    // demoted run writes a new array per SSE chunk; that must never
    // re-trigger the code/output load effect).
    const backgroundRunsRef = React.useRef<BackgroundRun[]>([]);
    React.useEffect(() => {
        backgroundRunsRef.current = backgroundRuns;
    }, [backgroundRuns]);

    // ─── PER-FILE running state ─────────────────────────
    // A single global isRunning flag made EVERY file's Output tab show
    // “Running script…” while ANY run streamed
    // script… is displayed in the running file but why in other files?
    // running each file is separate than other”). Runs are keyed by
    // their file — this map mirrors the ACTIVE run sessions; the Output
    // panel, its Stop button and the interactive stdin row all derive
    // from the SELECTED file's entry. The global flag stays for the
    // menubar / tree / estimate guards.
    const [runningFileRuns, setRunningFileRuns] = React.useState<
        Record<string, { runId: string | null }>
    >({});
    const runningFileRunsRef = React.useRef<Record<string, { runId: string | null }>>({});
    React.useEffect(() => {
        runningFileRunsRef.current = runningFileRuns;
    }, [runningFileRuns]);
    const markFileRunStart = React.useCallback((fileKey: string) => {
        setRunningFileRuns((prev) => ({...prev, [fileKey]: {runId: null}}));
    }, []);
    const markFileRunId = React.useCallback((fileKey: string, runId: string) => {
        setRunningFileRuns((prev) => (prev[fileKey] ? {...prev, [fileKey]: {runId}} : prev));
    }, []);
    const markFileRunEnd = React.useCallback((fileKey: string) => {
        setRunningFileRuns((prev) => {
            if (!(fileKey in prev)) return prev;
            const next = {...prev};
            delete next[fileKey];
            return next;
        });
    }, []);
    // Derived, per-SELECTION: does the file the user is LOOKING at have
    // a live run, and which runId is streaming there?
    const selectedFileKeyStr =
        selectedFolderSlug && selectedFileSlug ? `${selectedFolderSlug}/${selectedFileSlug}` : "";
    const selectedRunEntry = selectedFileKeyStr ? runningFileRuns[selectedFileKeyStr] : undefined;
    const selectedFileRunning = !!selectedRunEntry;
    const selectedFileRunId = selectedRunEntry?.runId ?? null;

    // ─── language runtime statuses ─────────────────────────
    // GET /api/runtime-check once on mount (+ on demand from the
    // Settings panel). Missing runtimes turn the Run click into a
    // friendly install-hint toast instead of a raw spawn failure.
    const [runtimeStatuses, setRuntimeStatuses] = React.useState<Array<{
        id: string;
        label: string;
        languages: string[];
        ok: boolean;
        version: string;
        command: string;
        installHint: string;
    }> | null>(null);
    /** true while a (fresh) re-detection is in flight — the
     * Settings panel's "Check again" button shows its spinner + disables
     * (the "should show spinner when clicked to show it is
     * working"). Fresh mode drops the server-side 60 s cache first so
     * the click really re-probes instead of replaying cached data. */
    const [runtimeRefreshBusy, setRuntimeRefreshBusy] = React.useState(false);
    const refreshRuntimeStatuses = React.useCallback((opts?: { fresh?: boolean }) => {
        void (async () => {
            const fresh = opts?.fresh === true;
            if (fresh) setRuntimeRefreshBusy(true);
            try {
                const res = await fetch(
                    `/api/runtime-check${fresh ? "?fresh=1" : ""}`,
                    {cache: "no-store"}
                );
                if (!res.ok) return;
                const json = await res.json();
                if (Array.isArray(json.runtimes)) setRuntimeStatuses(json.runtimes);
            } catch { /* offline — Run falls back to the server's own hint */
            } finally {
                if (fresh) setRuntimeRefreshBusy(false);
            }
        })();
    }, []);
    React.useEffect(() => {
        refreshRuntimeStatuses();
    }, [refreshRuntimeStatuses]);
    const runtimeOkForLanguage = React.useCallback(
        (language: string) => {
            const list = runtimeStatuses;
            if (!list) return null; // unknown yet — let the server decide
            return list.some((rt) => rt.ok && rt.languages.includes(language));
        },
        [runtimeStatuses]
    );

    interface RunSinkBox {
        mode: "primary" | "background";
        key: string;
        /** Which file this run belongs to (`folderSlug/fileSlug`). */
        fileKey: string;
        /** Latest streamed result — the snapshot shown when the file is
         *  re-selected mid-run. */
        result?: RunResult;
        /** The server runId once the start event arrives. */
        runId?: string | null;
    }

    const runSinksRef = React.useRef(new Map<string, RunSinkBox>());
    const primarySinkKeyRef = React.useRef<string | null>(null);
    const primaryRunInfoRef = React.useRef<{
        folderName: string;
        fileName: string;
        startedAt: number;
    } | null>(null);
    const runResultRef = React.useRef<RunResult | null>(null);
    React.useEffect(() => {
        runResultRef.current = runResult;
    }, [runResult]);
    const currentRunIdRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        currentRunIdRef.current = currentRunId;
    }, [currentRunId]);
    // per-run AbortControllers — lets Stop break an
    // in-flight fetch that is stuck BEFORE the "start" SSE event (no
    // runId yet → the old Stop button didn't even render, and /api/stop
    // had nothing to kill: "keeps saying running and stop is not
    // working"). Keyed by the same sinkKey the sink boxes use.
    const runAbortControllersRef = React.useRef(new Map<string, AbortController>());
    // Set when the user presses Stop, so the fetch-abort catch shows
    // "Run stopped" instead of "Network error".
    const stopInitiatedRef = React.useRef(false);

    /** Demote the still-streaming PRIMARY run to a background group.
     *  Called at the start of every new run (doRun / handleRunCell) —
     *  flips the old reader's sink box and seeds its display entry from
     *  the current primary state so nothing flashes blank. */
    const demoteCurrentRun = React.useCallback(() => {
        const oldKey = primarySinkKeyRef.current;
        if (!oldKey) return;
        const box = runSinksRef.current.get(oldKey);
        if (!box || box.mode !== "primary") return;
        box.mode = "background";
        const info = primaryRunInfoRef.current;
        const snapshot = runResultRef.current ?? {
            ok: false,
            stdout: "",
            stderr: "",
            isStreaming: true,
            figures: [],
        };
        setBackgroundRuns((prev) => [
            ...prev,
            {
                key: oldKey,
                folderName: info?.folderName ?? "",
                fileName: info?.fileName ?? "",
                runId: currentRunIdRef.current,
                result: {...snapshot},
                startedAt: info?.startedAt ?? Date.now(),
                fileKey: box.fileKey,
            },
        ]);
    }, []);

    // --- stdin input box  ---
    const [stdinText, setStdinText] = React.useState("");
    const [showStdin, setShowStdin] = React.useState(false);

    // --- Open folder  loading state ---
    const [isOpeningFolder, setIsOpeningFolder] = React.useState(false);

    // --- Search dialog  ---
    const [searchOpen, setSearchOpen] = React.useState(false);

    // --- Run history  ---
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [history, setHistory] = React.useState<HistoryEntry[]>([]);

    // --- Run-all batch dialog  ---
    const [batchOpen, setBatchOpen] = React.useState(false);
    const [batchRunning, setBatchRunning] = React.useState(false);
    const [batchResults, setBatchResults] = React.useState<BatchResult[] | null>(null);
    const batchRunningRef = React.useRef(false);
    React.useEffect(() => {
        batchRunningRef.current = batchRunning;
    }, [batchRunning]);
    // Set when a watcher "changed" event arrives while a run was active;
    // the flush effect performs ONE silent refresh when the run ends.
    const pendingWatchRefreshRef = React.useRef(false);

    // --- Settings / dialog state ---
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    // Which tab the Settings dialog should open on (e.g. "ai" when opened
    // from the AI menu's "AI settings…" item; undefined keeps the last tab).
    const [settingsTab, setSettingsTab] = React.useState<string | null>(null);
    // Folder picker (File → Open project → Browse for folder…) — lets the
    // user navigate the projects directory and open any folder in it as
    // the active project, instead of only the auto-listed ones.
    const [folderPickerOpen, setFolderPickerOpen] = React.useState(false);
    const [snippetOpen, setSnippetOpen] = React.useState(false);
    const [dataFileBrowserOpen, setDataFileBrowserOpen] = React.useState(false);
    const [installDepsOpen, setInstallDepsOpen] = React.useState(false);
    const [installDepsLog, setInstallDepsLog] = React.useState<string>("");
    const [installDepsRunning, setInstallDepsRunning] = React.useState(false);
    const [showArgsEnv, setShowArgsEnv] = React.useState(false);
    const [argsText, setArgsText] = React.useState("");
    const [envText, setEnvText] = React.useState("");
    const [gitStatusEntries, setGitStatusEntries] = React.useState<
        Array<{ path: string; indexStatus: string; wtStatus: string }>
    >([]);
    const [gitStatusLoading, setGitStatusLoading] = React.useState(false);
    // Derived path→status map (the FolderTree + commit dialog consume
    // this shape). Derived from the entries so the Git Diff panel can
    // receive the full entries as props instead of firing its own
    // /api/git-status request .
    const gitStatusMap = React.useMemo(() => {
        const map: Record<string, string> = {};
        for (const e of gitStatusEntries) {
            map[e.path] = e.wtStatus !== " " ? e.wtStatus : e.indexStatus;
        }
        return map;
    }, [gitStatusEntries]);
    const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
    // Per-project settings overrides — loaded from
    // <project-root>/.praxis/settings.json. Merged over the global
    // (localStorage) settings to produce the effective `settings` state.
    // Re-fetched on mount and after every project switch.
    const [projectOverrides, setProjectOverrides] = React.useState<Partial<Settings>>({});

    // --- Explorer + run state ---
    const [favorites, setFavorites] = React.useState<Set<string>>(new Set());
    const [pinnedBaseline, setPinnedBaseline] = React.useState<RunResult | null>(null);
    const [sortMode, setSortMode] = React.useState<"alpha" | "mtime">("alpha");
    const [importing, setImporting] = React.useState(false);
    // Snippet-insertion signal — when the user picks a snippet from
    // the palette, we bump `nonce` and set `content`; the CodeViewer
    // watches this object and appends the snippet to its edit buffer.
    const [insertSnippet, setInsertSnippet] = React.useState<{ content: string; nonce: number } | null>(null);
    // ─── the new feature surfaces' open state ─────────────────────
    const [astExplorerOpen, setAstExplorerOpen] = React.useState(false);
    const [bytecodeOpen, setBytecodeOpen] = React.useState(false);
    const [docstringStudioOpen, setDocstringStudioOpen] = React.useState(false);
    const [refactorPaletteOpen, setRefactorPaletteOpen] = React.useState(false);
    // The transform the context menu NAMED when it opened the palette
    // ("inline_variable" / "organize_imports" / …) — feeds the palette's
    // initialTransform so per-transform entries land on their form.
    const [refactorPaletteTransform, setRefactorPaletteTransform] = React.useState<string | null>(null);
    const [hexEditorOpen, setHexEditorOpen] = React.useState(false);
    const [extensionsOpen, setExtensionsOpen] = React.useState(false);
    const [openFromUrlOpen, setOpenFromUrlOpen] = React.useState(false);
    const [multiPythonOpen, setMultiPythonOpen] = React.useState(false);
    const [duckdbTarget, setDuckdbTarget] = React.useState<{ fileSlug: string; fileName: string } | null>(null);
    const [duckdbTargetOpen, setDuckdbTargetOpen] = React.useState(false);
    const [aiReviewOpen, setAiReviewOpen] = React.useState(false);
    const [aiReviewDiff, setAiReviewDiff] = React.useState("");
    const [aiReviewApplying, setAiReviewApplying] = React.useState(false);
    // Agent Mode (AI ▸ Agent Mode…) — the multi-file AI edit planner.
    const [agentModeOpen, setAgentModeOpen] = React.useState(false);
    const [mergeTarget, setMergeTarget] = React.useState<{ fileName: string; content: string } | null>(null);
    // Live collaboration — the active room + the peer presence list.
    const [collabRoom, setCollabRoom] = React.useState<string | null>(null);
    const [collabPeers, setCollabPeers] = React.useState<Array<{
        id: string;
        name: string;
        color: string;
        file: string;
        line: number;
        col: number
    }>>([]);
    // The persistent console session id (for the Variable Explorer) —
    // mirrored from the workspace-session store while the panel is up.
    const [consoleSessionId, setConsoleSessionId] = React.useState<string | null>(null);
    // Conflict-marker auto-open bookkeeping (once per file per session)
    // + the Getting-Started tutor hint bookkeeping.
    const mergeAutoOpenRef = React.useRef<Set<string>>(new Set());
    const tutorHintRef = React.useRef<Set<string>>(new Set());
    // Run-duration warning dialog — shown before a run if the estimated
    // duration exceeds the `runDurationWarningThreshold` setting.
    const [durationWarning, setDurationWarning] = React.useState<EstimateResult | null>(null);
    const [pendingRunFn, setPendingRunFn] = React.useState<(() => void) | null>(null);
    // Run options: one-shot overrides for the next run.
    // (Sandbox mode was removed — see comment near the Run dropdown.)
    /* ─── per-run CAPTURE overrides ─────
  * The CapturePicker in the run-input strip below the editor tabs
  * (Settings → Editor → "Show the Capture picker"): what the NEXT
  * Python run captures. Undefined = follow Settings → Capture; a set
  * value applies ONLY to the next run and clears the moment the request
  * fires — one-off choices never leak into later runs.
  *
  * The REF is the source of truth for the run body (a setState in
  * the same tick as handleRun() must be readable immediately — the
  * "Run with coverage…" entries do exactly that). */
    interface CaptureOverride {
        inspectVariables?: boolean;
        captureDataframes?: boolean;
        traceCoverage?: boolean;
    }

    const [captureOverrideState, setCaptureOverrideState] = React.useState<CaptureOverride>({});
    const captureOverrideRef = React.useRef<CaptureOverride>({});
    const setCaptureOverride = React.useCallback((next: CaptureOverride) => {
        captureOverrideRef.current = next;
        setCaptureOverrideState(next);
    }, []);
    /** Set ONE capture flag for the next run (undefined = follow the
     *  Settings → Capture default). */
    const setCaptureFlag = React.useCallback(
        (key: keyof CaptureOverride, value: boolean | undefined) => {
            const next = {...captureOverrideRef.current};
            if (value === undefined) delete next[key];
            else next[key] = value;
            setCaptureOverride(next);
        },
        [setCaptureOverride]
    );
    /** back-compat setter for the coverage entry points
     *  (Run & Go ▸ Run with coverage…, the default coverage run mode,
     *  the tree's coverage item): writes the coverage bit of the
     *  per-run capture override — same behavior, one shared store. */
    const setTraceCoverageOverride = React.useCallback(
        (v: boolean) => setCaptureFlag("traceCoverage", v ? true : undefined),
        [setCaptureFlag]
    );
    // The Explorer's right-click "Run with coverage…" for a file that is
    // NOT the open one: the selection is set first, and this pending ref
    // lets the settle-effect below fire the coverage run once the file
    // lands.
    const pendingCoverageRunRef = React.useRef<{ folder: string; file: string } | null>(null);
    // Bottom-panel tab state — controlled so settings like
    // defaultBottomTab, autoSwitchToOutputOnRun, and
    // autoSwitchToDiagnosticsOnError can actually switch tabs.
    // Includes "gitdiff" for the side-by-side Git Diff tab, shown only
    // when the current file is a Python file AND there are uncommitted
    // git changes (see the TabsList below).
    // adds three file-kind-agnostic tabs: "todo" (TODO/FIXME
    // scan), "tests" (persistent test report) and "terminal" (the
    // integrated terminal) — the bottom panel now also stays visible
    // while a NON-Python file is open when one of them is selected.
    // "console" joined the switchable bottom tabs.
    // "plots" — the persistent cross-run figure gallery.
    // "background" — the dedicated Background Runs tab between
    // Output and Diagnostics (demoted parallel runs live there; Output
    // stays pure for the open file's run).
    const [bottomTab, setBottomTab] = React.useState<"output" | "background" | "diag" | "notes" | "gitdiff" | "todo" | "tests" | "terminal" | "console" | "plots" | "tasks" | "variables" | "preview" | "replay" | "tutor" | "async">("output");
    // The ConsolePanel persists its session id through the workspace
    // session store; the Variables and Async tabs read it whenever they
    // become active (and every 2s while active — cheap localStorage read).
    React.useEffect(() => {
        if (bottomTab !== "variables" && bottomTab !== "async") return;
        const read = () => {
            try {
                const s = loadWorkspaceSession();
                setConsoleSessionId((prev) => (prev === (s?.consoleSessionId ?? null) ? prev : s?.consoleSessionId ?? null));
            } catch { /* corrupted — keep null */
            }
        };
        read();
        const t = window.setInterval(read, 2000);
        return () => window.clearInterval(t);
    }, [bottomTab]);

    // deep-link token — bumped when the user clicks the
    // browser notification for a finished run; OutputPanel scrolls to
    // that run's output + flashes the panel body.
    const [focusRunToken, setFocusRunToken] = React.useState(0);
    // Bottom-panel visibility — toggled by the View → Toggle bottom panel
    // menu item (⌘J). When false, the entire bottom panel (Output /
    // Diagnostics / Notes tabs) is hidden so the code viewer gets the
    // full vertical space.
    //
    //  bottom panel") — the panel now starts COLLAPSED for every file
    // kind on every load (it is deliberately NOT persisted). Explicit
    // actions still open it: starting a run (autoSwitchToOutputOnRun),
    // opening the terminal / console / git diff, exiting a focus mode
    // that saved it open, clicking the collapsed rail's chevron, or
    // the notification deep-link below.
    const [bottomPanelOpen, setBottomPanelOpen] = React.useState(false);
    // refs mirroring the bottom-panel state for the ⌘` key
    // handler inside the long listener effect below (whose dependency
    // array intentionally stays minimal — refs keep it from going
    // stale without re-registering ten listeners on every tab switch).
    const bottomTabRef = React.useRef(bottomTab);
    const bottomPanelOpenRef = React.useRef(bottomPanelOpen);
    React.useEffect(() => {
        bottomTabRef.current = bottomTab;
    }, [bottomTab]);

    // ── Bottom-panel tab-strip overflow detection ─────────────────────
    // The strip can hold 16 tabs at once (Output, Background Runs,
    // Diagnostics, Notes, Git Diff, TODOs, Tests, Console, Plots,
    // Terminal, Tasks, Variables, Async, Replay, Tutor, Preview).
    // When they don't fit the rail / row the strip SCROLLS — but only
    // once it really overflows, so roomy screens keep the ordinary
    // non-scrolling strip. The strip measures itself: a ResizeObserver
    // catches container size changes, a MutationObserver catches tabs
    // appearing / disappearing (the visible set depends on file kind,
    // git state, runs, plots…), and the scroll listener keeps the edge
    // fades accurate while scrolling. The collapse / icon-toggle buttons
    // are SIBLINGS of the scroll region (below it in the rail, after it
    // in the top row), so they stay pinned right next to the visible
    // tab labels and never ride along with the scroll.
    const bottomTabsListRef = React.useRef<HTMLDivElement | null>(null);
    const [bottomTabsOverflow, setBottomTabsOverflow] = React.useState(false);
    const [bottomTabsEdge, setBottomTabsEdge] = React.useState({start: false, end: false});
    const bottomTabsVertical = settings.bottomTabsPosition === "left";

    const measureBottomTabs = React.useCallback(() => {
        const el = bottomTabsListRef.current;
        if (!el) return;
        const vertical = bottomTabsVertical;
        const overflow = vertical
            ? el.scrollHeight > el.clientHeight + 1
            : el.scrollWidth > el.clientWidth + 1;
        const start = vertical ? el.scrollTop > 1 : el.scrollLeft > 1;
        const end = vertical
            ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
            : el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setBottomTabsOverflow((prev) => (prev === overflow ? prev : overflow));
        setBottomTabsEdge((prev) =>
            prev.start === start && prev.end === end ? prev : {start, end}
        );
    }, [bottomTabsVertical]);

    React.useLayoutEffect(() => {
        const el = bottomTabsListRef.current;
        if (!el) return;
        const ro = new ResizeObserver(measureBottomTabs);
        ro.observe(el);
        // observe the header row too — when IT resizes (panel width /
        // height change) the overflow verdict can flip while the strip's
        // own box stays put.
        const host = el.parentElement;
        if (host) ro.observe(host);
        const mo = new MutationObserver(measureBottomTabs);
        mo.observe(el, {childList: true});
        // A vertical wheel over the HORIZONTAL strip scrolls it sideways
        // — a plain mouse wheel has no horizontal axis, so without this
        // the strip would be trackpad-only. Native listener so that
        // preventDefault is honored (React registers wheel as passive).
        const onWheel = (ev: WheelEvent) => {
            if (bottomTabsVertical) return; // the rail scrolls vertically natively
            if (ev.deltaX !== 0) return; // genuine horizontal input — let it through
            const delta = ev.deltaY;
            if (delta === 0) return;
            const atStart = el.scrollLeft <= 0 && delta < 0;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && delta > 0;
            if (atStart || atEnd) return; // hand the wheel back to the page at the ends
            ev.preventDefault();
            el.scrollLeft += delta;
        };
        el.addEventListener("wheel", onWheel, {passive: false});
        el.addEventListener("scroll", measureBottomTabs, {passive: true});
        measureBottomTabs();
        return () => {
            ro.disconnect();
            mo.disconnect();
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("scroll", measureBottomTabs);
        };
        // bottomTabsIconOnly changes every trigger's width (icon vs icon+
        // label) without touching the child list, so it re-measures too.
    }, [measureBottomTabs, bottomTabsVertical, settings.bottomTabsIconOnly, bottomPanelOpen]);

    // Switching to a tab that is scrolled out of view reveals it —
    // without this the active indicator could move somewhere the user
    // cannot see, and programmatic switches (auto-switch-to-output on
    // run, error deep-links) would look broken.
    React.useLayoutEffect(() => {
        const el = bottomTabsListRef.current;
        if (!el || !bottomTabsOverflow) return;
        const active = el.querySelector<HTMLElement>('[data-state="active"]');
        active?.scrollIntoView({behavior: "smooth", inline: "nearest", block: "nearest"});
    }, [bottomTab, bottomTabsOverflow, bottomPanelOpen]);

    // Edge fades — the scroll affordance. Masking (rather than gradient
    // overlays) means no color has to match the strip background and
    // nothing is ever drawn between the labels and the collapse button.
    const bottomTabsMask = React.useMemo(() => {
        const {start, end} = bottomTabsEdge;
        if (!start && !end) return "";
        if (bottomTabsVertical) {
            if (start && end) {
                return "linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)";
            }
            return start
                ? "linear-gradient(to bottom, transparent 0, black 12px)"
                : "linear-gradient(to top, transparent 0, black 12px)";
        }
        if (start && end) {
            return "linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)";
        }
        return start
            ? "linear-gradient(to right, transparent 0, black 12px)"
            : "linear-gradient(to left, transparent 0, black 12px)";
    }, [bottomTabsEdge, bottomTabsVertical]);

    // clicking the browser notification for a finished
    // run deep-links here — switch to the Output tab, re-open the bottom
    // panel if it was collapsed, and bump the token so OutputPanel
    // scrolls to that run's entry + flashes it.
    React.useEffect(() => {
        const onFocusRun = () => {
            setBottomTab("output");
            setBottomPanelOpen(true);
            setFocusRunToken((t) => t + 1);
        };
        window.addEventListener(FOCUS_RUN_EVENT, onFocusRun as EventListener);
        return () => window.removeEventListener(FOCUS_RUN_EVENT, onFocusRun as EventListener);
    }, []);
    React.useEffect(() => {
        bottomPanelOpenRef.current = bottomPanelOpen;
    }, [bottomPanelOpen]);
    // the Footer's cursor position + selection info now
    // live in the `footerStore` external store (src/lib/footer-store.ts)
    // instead of page state. They change on EVERY keystroke, and the old
    // state version re-rendered the entire 6,700-line page per character
    // typed — a major contributor to the "editing is very slow / lagging"
    // report. Only the small Footer chip that displays them subscribes.
    // semantics kept: the callbacks are only wired when
    // settings.showCursorPositionInFooter is on, and the store no-ops
    // when a value is unchanged.
    const handleCursorPositionChange = React.useCallback((line: number, col: number) => {
        footerStore.setCursor(line, col);
    }, []);
    const handleSelectionChange = React.useCallback((chars: number, lines: number) => {
        footerStore.setSelection(chars, lines);
    }, []);
    // Git branch + dirty-file count for the Footer's git chip.
    // gitStatusMap (per-file status) already exists; this is a separate
    // fetch of the repo-level branch + summary count.
    const [gitBranch, setGitBranch] = React.useState<string | null>(null);
    // Imperative ref to the CodeViewer — lets the menu bar trigger
    // save / find / format / undo / redo / cut / copy / paste / replace
    // without lifting all editor state out of the component.
    const codeViewerRef = React.useRef<CodeViewerHandle>(null);
    // Sidebar visibility — on mobile this controls the drawer overlay;
    // on desktop it controls whether the sidebar is shown at all (toggled
    // by View → Toggle sidebar / ⌘B). When false on desktop, the sidebar
    // is hidden and the main area takes the full width.
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const [sidebarVisible, setSidebarVisible] = React.useState(true);
    // Distraction-free mode (Shift+F11) — hides BrandHeader, MenuBar,
    // sidebar, and bottom panel so only the code viewer is visible.
    const [distractionFree, setDistractionFree] = React.useState(false);
    const preDfStateRef = React.useRef<{ sidebar: boolean; bottom: boolean } | null>(null);
    // Sidebar width + code/output split — persisted to localStorage so
    // the layout survives page reloads. Hydrated on mount.
    const LAYOUT_KEY = `${STORAGE_PREFIX}.layout`;
    // Default sidebar width 300px (was 240 — too narrow for long names).
    const [sidebarWidth, setSidebarWidth] = React.useState(300);
    const [codePanelHeight, setCodePanelHeight] = React.useState(55);
    /* ─── Split editor — ONE engine state (Phase 2) ──────────────────
   * The EditorTabs "Split"/"Split Down" buttons + Ctrl+\ dispatch the
   * `praxis:split-editor` events carrying the multi-selected tabs.
   * Each pane shows an INDEPENDENT file (not a mirror of the main
   * editor): one pane per selected tab, or — with nothing selected —
   * the most recent OTHER open tab (so a split never duplicates the
   * file that is already open). Panes can be switched to any open
   * file from their own header, and editing stays in the main pane so
   * the views can't fight over one save flow.
   *
   * ALL geometry and transitions live in the pure engine
   * (src/layout/split-pane-engine.ts — 60 unit tests, gutter count
   * proven === panes − 1). This component holds ONE state object and
   * the destructured aliases below keep the many read sites terse. */
    const [splitLayout, setSplitLayout] = React.useState<SplitLayoutState<SplitTarget>>(() =>
        closedSplitLayout<SplitTarget>()
    );
    const {
        open: splitPaneOpen,
        orientation: splitOrientation,
        panes: splitPanes,
        sizes: splitPaneSizes,
        groupWidthPercent: splitPaneWidthPercent,
    } = splitLayout;
    /* Self-healing guard: whenever the pane list changes through a path
   * that did not pair it with a sizes update (an older session snapshot,
   * a partial toggle), the engine rebuilds equal shares so every pane
   * keeps a sane flex-basis and every gutter keeps valid share math. */
    React.useEffect(() => {
        // healSplitLayout returns the SAME object when consistent, so this
        // never loops — it only fires a state change when a tear exists.
        setSplitLayout((prev) => healSplitLayout(prev));
    }, [splitLayout]);
    /** Swap the file ONE split pane shows (its header <select>). */
    const setSplitPaneTarget = React.useCallback((index: number, next: SplitTarget) => {
        // Thin adapter: user intent in, engine transition out.
        setSplitLayout((prev) => retargetSplitPaneInEngine(prev, index, next));
    }, []);
    /** Close ONE split pane (its header ×); the last close empties the group. */
    const closeSplitPane = React.useCallback((index: number) => {
        // The engine drops the share, rescales survivors to 100 and closes
        // the group on the last pane — safe under StrictMode double-runs.
        setSplitLayout((prev) => closeSplitPaneInEngine(prev, index));
    }, []);
    // Hydrate layout from localStorage on mount.
    React.useEffect(() => {
        try {
            const raw = window.localStorage.getItem(LAYOUT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as { sidebarWidth?: number; codePanelHeight?: number };
                if (typeof parsed.sidebarWidth === "number" && parsed.sidebarWidth >= 160 && parsed.sidebarWidth <= 480) {
                    setSidebarWidth(parsed.sidebarWidth);
                }
                if (typeof parsed.codePanelHeight === "number" && parsed.codePanelHeight >= 10 && parsed.codePanelHeight <= 90) {
                    setCodePanelHeight(parsed.codePanelHeight);
                }
            }
        } catch { /* ignore */
        }
    }, [LAYOUT_KEY]);
    // Persist layout on change (debounced via requestAnimationFrame so
    // we don't write on every mousemove during a drag).
    const layoutSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
        layoutSaveTimerRef.current = setTimeout(() => {
            try {
                window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({sidebarWidth, codePanelHeight}));
            } catch { /* ignore */
            }
        }, 500);
        return () => {
            if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
        };
    }, [sidebarWidth, codePanelHeight, LAYOUT_KEY]);
    // Multi-tab editing: array of open tabs + active tab ID.
    const [openTabs, setOpenTabs] = React.useState<EditorTab[]>([]);
    const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
    /* ─── Phase 2 — the tab lifecycle (untitled drafts, Save As routing,
   * dirty-state guards) lives in hooks/use-tab-lifecycle.ts over the
   * pure rules in lib/tab-lifecycle.ts. The hook call sits after
   * refreshFolders (its last dependency) below; this comment marks
   * where the old inline state used to be. */
    // Split-editor event wiring — declared HERE (after the tabs state)
    // because the fallback target reads the open tabs. Both handlers
    // are symmetric: open in your own orientation (switching from the
    // other one), close when already open in your own orientation AND
    // the request carries no explicit targets (a multi-file split
    // always re-targets instead of closing). The page owns WHICH file a
    // fallback split shows (editor-tab knowledge); the engine owns the
    // layout transition itself.
    React.useEffect(() => {
        const openSplit = (orientation: "right" | "down", detail?: SplitEditorDetail) => {
            const explicit = detail?.targets?.filter((t) => t.folderSlug && t.fileSlug) ?? [];
            // Toggle-close: same orientation, no explicit targets — the
            // engine's toggle clears panes and sizes in one step.
            if (splitPaneOpen && splitOrientation === orientation && explicit.length === 0) {
                setSplitLayout((prev) => toggleSplitLayout(prev, orientation, []));
                return;
            }
            let targets: SplitTarget[] = explicit;
            if (targets.length === 0) {
                // Fallback: the most recent OTHER open tab; mirror the open
                // file only when it is the sole tab.
                const others = openTabs.filter((t) => t.id !== activeTabId);
                const pick = others.length > 0 ? others[others.length - 1] : openTabs[0];
                if (pick) {
                    targets = [
                        {
                            folderSlug: pick.folderSlug,
                            fileSlug: pick.fileSlug,
                            fileName: pick.fileName,
                            folderName: pick.folderName,
                        },
                    ];
                }
            }
            // Nothing to show — leave the layout untouched.
            if (targets.length === 0) return;
            // The engine caps the group at MAX_SPLIT_PANES and hands every
            // pane an equal share so its gutter drags from a sane start.
            setSplitLayout((prev) => openSplitLayout(prev, orientation, targets));
        };
        const onSplit = (e: Event) => {
            openSplit("right", (e as CustomEvent).detail as SplitEditorDetail | undefined);
        };
        const onSplitDown = (e: Event) => {
            openSplit("down", (e as CustomEvent).detail as SplitEditorDetail | undefined);
        };
        window.addEventListener(SPLIT_EDITOR_EVENT, onSplit);
        window.addEventListener(SPLIT_EDITOR_DOWN_EVENT, onSplitDown);
        return () => {
            window.removeEventListener(SPLIT_EDITOR_EVENT, onSplit);
            window.removeEventListener(SPLIT_EDITOR_DOWN_EVENT, onSplitDown);
        };
    }, [splitPaneOpen, splitOrientation, openTabs, activeTabId]);
    // Recently-closed tabs for Ctrl+Shift+T .
    const [closedTabHistory, setClosedTabHistory] = React.useState<EditorTab[]>([]);
    // ─── WORKSPACE SESSION ────────────────────────────────────────
    // The tab list itself restores through the pre-existing SESSION_KEY
    // mechanism below (tabs + active + caret line). THIS store carries
    // the rest of the workspace across F5: the split-pane layout, dirty
    // buffers (with carets), and the live terminal / console session
    // ids (the panels read it on mount).
    const wsRef = React.useRef<WorkspaceSession | null>(null);
    if (wsRef.current === null) {
        wsRef.current = loadWorkspaceSession();
    }
    const restoredBuffersRef = React.useRef<Set<string>>(new Set());

    // ─── DIFF AS AN EDITOR TAB (F22) ───────────────────────────────
    // "Open in editor" for any diff: a side-by-side DiffView with
    // word-level intra-line highlighting, editable panes and
    // save-from-diff. Panels dispatch `praxis:open-diff` with the two
    // sides; the editor surface swaps to the diff until closed.
    const [diffView, setDiffView] = React.useState<
        | null
        | {
        title: string;
        leftLabel: string;
        leftContent: string;
        rightLabel: string;
        rightContent: string;
        /** When the right side is a real project file, saving from the
         *  diff writes through the normal save path. */
        rightFile?: { folderSlug: string; fileSlug: string; kind: string };
        nonce: number;
    }
    >(null);
    React.useEffect(() => {
        const onOpenDiff = (e: Event) => {
            const d = (e as CustomEvent).detail as {
                title?: string;
                leftLabel?: string;
                leftContent?: string;
                rightLabel?: string;
                rightContent?: string;
                rightFile?: { folderSlug: string; fileSlug: string; kind: string };
                /** Repo- / workspace-relative path of the right side (the git
                 *  diff panel sends it) — resolved below into rightFile so the
                 *  diff surface is editable + saveable. */
                rightFilePath?: string;
            };
            if (typeof d?.leftContent !== "string" || typeof d?.rightContent !== "string") return;
            const leftContent: string = d.leftContent;
            const rightContent: string = d.rightContent;
            let rightFile = d.rightFile;
            if (!rightFile && typeof d.rightFilePath === "string" && d.rightFilePath) {
                // "FolderName/sub/file.py" (or a root-level "file.py") → the
                // (folderSlug, fileSlug) pair. First segment = folder name/slug;
                // the rest = the folder-relative file path, matched against the
                // deslugified FileInfo slugs (they encode exactly that path).
                const slash = d.rightFilePath.indexOf("/");
                const folderKey = slash === -1 ? "" : d.rightFilePath.slice(0, slash);
                const relPath = slash === -1 ? d.rightFilePath : d.rightFilePath.slice(slash + 1);
                const all = foldersRef.current ?? [];
                for (const f of all) {
                    const folderMatch = slash === -1
                        ? Boolean(f.isRoot) // root-level file rides the PROJECT-ROOT entry
                        : f.name === folderKey || f.slug === folderKey;
                    if (!folderMatch) continue;
                    for (const fi of f.files ?? []) {
                        const fiRel = (() => {
                            try {
                                return deslugifyClient(fi.slug);
                            } catch {
                                return fi.name;
                            }
                        })();
                        if (fiRel === relPath || fi.name === relPath) {
                            rightFile = {folderSlug: f.slug, fileSlug: fi.slug, kind: fi.kind ?? "python"};
                            break;
                        }
                    }
                    if (rightFile) break;
                }
            }
            const nonce = Date.now();
            setDiffView({
                title: d.title ?? "Diff",
                leftLabel: d.leftLabel ?? "Left",
                leftContent,
                rightLabel: d.rightLabel ?? "Right",
                rightContent,
                rightFile,
                nonce,
            });
        };
        window.addEventListener("praxis:open-diff", onOpenDiff);
        return () => window.removeEventListener("praxis:open-diff", onOpenDiff);
    }, []);
    const closeDiffView = React.useCallback(() => setDiffView(null), []);
    ;
    // ── Dirty-buffer snapshot: pull the live editor state every 4 s and
    //    on tab switches; cleared when the buffer goes clean.
    // NOTE: consoleSessionId / terminalSessions are owned by the CONSOLE
    // and TERMINAL panels — they write the store directly, while this
    // page's wsRef cache can hold a stale null from mount time. The
    // store's save is last-writer-wins, so every page-level save must
    // re-read those volatile fields or it clobbers a live session id
    // (the Variables/Async tabs then lose their kernel attachment).
    const mergeVolatileSessionFields = (
        snap: WorkspaceSession
    ): WorkspaceSession => {
        let live: WorkspaceSession | null = null;
        try {
            live = loadWorkspaceSession();
        } catch {
            live = null;
        }
        return {
            ...snap,
            consoleSessionId: live?.consoleSessionId ?? null,
            terminalSessions: live?.terminalSessions ?? snap.terminalSessions ?? [],
        };
    };
    const captureDirtyBuffer = React.useCallback(() => {
        const snap = wsRef.current;
        if (!snap || !selectedFolderSlug || !selectedFileSlug) return;
        const key = `${selectedFolderSlug}/${selectedFileSlug}`;
        const state = codeViewerRef.current?.getEditState?.();
        const next = {...snap.dirtyBuffers};
        if (state && state.content !== null) {
            // scrollTop now round-trips too (it used to be captured by the
            // editor then dropped here — the F5 restore only re-scrolled via
            // the caret's goto-line, losing the exact viewport).
            next[key] = {
                content: state.content,
                caret: state.caret,
                scrollTop: state.scrollTop,
                savedAt: Date.now(),
            };
        } else {
            delete next[key];
        }
        wsRef.current = mergeVolatileSessionFields({...snap, dirtyBuffers: next});
        saveWorkspaceSession(wsRef.current, 400);
    }, [selectedFolderSlug, selectedFileSlug]);
    React.useEffect(() => {
        const t = setInterval(captureDirtyBuffer, 4000);
        return () => clearInterval(t);
    }, [captureDirtyBuffer]);
    React.useEffect(() => {
        // beforeunload: the workspace-session lib flushes its own pending
        // write; refresh the dirty buffer first so it lands in time.
        const onLeave = () => captureDirtyBuffer();
        window.addEventListener("beforeunload", onLeave);
        return () => window.removeEventListener("beforeunload", onLeave);
    }, [captureDirtyBuffer]);

    // ── Dirty-buffer RESTORE: when the freshly-loaded file has a stored
    //    unsaved buffer, feed it back into the editor (one shot per open).
    const fileKey = selectedFolderSlug && selectedFileSlug ? `${selectedFolderSlug}/${selectedFileSlug}` : null;
    const pendingRestore = fileKey && !restoredBuffersRef.current.has(fileKey)
        ? wsRef.current?.dirtyBuffers[fileKey] ?? null
        : null;
    React.useEffect(() => {
        if (!pendingRestore || !code) return;
        if (fileKey) restoredBuffersRef.current.add(fileKey);
        // Only for Python files (CodeViewer owns these buffers).
        const kind = foldersRef.current
            .find((c) => c.slug === selectedFolderSlug)
            ?.files.find((f) => f.slug === selectedFileSlug)?.kind;
        if (kind !== "python") return;
        if (pendingRestore.content === code.content) return;
        const t = setTimeout(() => {
            codeViewerRef.current?.restoreEditState?.({
                content: pendingRestore.content,
                caret: pendingRestore.caret,
                scrollTop: pendingRestore.scrollTop,
            });
        }, 120);
        return () => clearTimeout(t);
    }, [pendingRestore, code, fileKey, selectedFolderSlug, selectedFileSlug]);
    // Persist the split-pane layout into the workspace snapshot — plus
    // the bottom-panel state (open/tab/height) and the split-width ratios
    // (the same ratio drives a horizontal and a vertical split; both are
    // stored so flipping the orientation keeps each layout's last size).
    React.useEffect(() => {
        const snap = wsRef.current ?? {
            version: 1 as const,
            openTabs: [],
            activeTab: null,
            splitPane: null,
            dirtyBuffers: {},
            terminalSessions: [],
            consoleSessionId: null,
            savedAt: 0,
        };
        wsRef.current = mergeVolatileSessionFields(
            withBottomPanel(
                withSplitWidths(
                    {
                        ...snap,
                        splitPane: splitPaneOpen && splitPanes.length > 0
                            ? {
                                open: true,
                                orientation: splitOrientation,
                                targets: splitPanes.map((t) => ({
                                    folderSlug: t.folderSlug,
                                    fileSlug: t.fileSlug,
                                    fileName: t.fileName,
                                    folderName: t.folderName,
                                })),
                                /* Round 3 — persist the dragged per-pane shares so a reload
                   * lands the multi-pane layout at the same sizes. */
                                sizes: splitPaneSizes.length === splitPanes.length ? splitPaneSizes : undefined,
                            }
                            : {open: false, orientation: splitOrientation, targets: []},
                    },
                    {
                        horizontalRatio: splitPaneWidthPercent / 100,
                        verticalRatio: splitPaneWidthPercent / 100,
                        rightRailWidth: 400,
                    }
                ),
                {
                    open: bottomPanelOpen,
                    activeTab: bottomTab,
                    // the panel's share of the vertical split — the page stores
                    // the complementary code-pane ratio (see readBottomPanel).
                    height: 100 - codePanelHeight,
                }
            )
        );
        saveWorkspaceSession(wsRef.current, 700);
    }, [splitPaneOpen, splitOrientation, splitPanes, splitPaneSizes, splitPaneWidthPercent, bottomPanelOpen, bottomTab, codePanelHeight]);
    // Command palette: Ctrl+Shift+P.
    const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
    // Shortcuts dialog — opened by Help → Keyboard shortcuts… Shows a
    // real shortcuts table (not the command palette).
    const [shortcutsDialogOpen, setShortcutsDialogOpen] = React.useState(false);
    // ─── state ─────────────────────────────────────────────────
    // Go to Symbol in project (⌘T) dialog.
    const [symbolSearchOpen, setSymbolSearchOpen] = React.useState(false);
    // TODO panel rescan nonce — bumped after saves so the panel can
    // re-scan for TODO/FIXME markers.
    const [todoNonce, setTodoNonce] = React.useState(0);
    // Compare ▸ With clipboard… — the right-clicked file + clipboard text.
    const [compareClipboard, setCompareClipboard] = React.useState<
        { fileName: string; fileContent: string; clipboardText: string | null } | null
    >(null);
    // Compare two files dialog + its Explorer right-click
    // preselection (the left side); the Git Log dialog.
    const [compareFilesOpen, setCompareFilesOpen] = React.useState(false);
    const [compareFilesPreselect, setCompareFilesPreselect] = React.useState<
        { folderSlug: string; fileSlug: string } | null
    >(null);
    const [gitLogOpen, setGitLogOpen] = React.useState(false);
    // the Dependency Manager dialog.
    const [depManagerOpen, setDepManagerOpen] = React.useState(false);
    // the project-dictionary manager (Tools ▸ Project dictionary…).
    const [projectDictOpen, setProjectDictOpen] = React.useState(false);
    // New file from selection — code captured from the editor's
    // context menu, waiting for a name + target folder.
    const [newFileFromSel, setNewFileFromSel] = React.useState<
        { code: string; fileName: string; folderSlug: string; busy: boolean; error: string | null } | null
    >(null);
    // Profiling heatmap — per-line function timings for the CURRENT
    // file, produced by the Diagnostics panel's Profile tool and
    // rendered as a gutter heat overlay by the CodeViewer.
    const [timingOverlay, setTimingOverlay] = React.useState<
        Array<{ line: number; cumtime: number; tottime: number }> | null
    >(null);
    // Drag-drop overlay state .
    const [dragOver, setDragOver] = React.useState(false);
    // Auto-run watcher: connect to /api/watch SSE when enabled.
    const watchAbortRef = React.useRef<AbortController | null>(null);
    // Inline diagnostics  — lint/typecheck results for the CodeViewer.
    const [inlineDiagnostics, setInlineDiagnostics] = React.useState<
        Array<{ line: number; col?: number; severity: "error" | "warning" | "info"; message: string }>
    >([]);
    // Git diff lines  — for gutter markers in the CodeViewer.
    const [gitDiffLines, setGitDiffLines] = React.useState<{
        added: number[];
        removed: number[];
        modified: number[]
    } | undefined>(undefined);
    // lint generation counter. The manual
    // "re-lint" used to clear selectedFileSlug and restore it 50 ms later
    // — re-entering the code fetch and transiently persisting an empty
    // selection; and saves never re-linted at all (the effect's deps were
    // selection-only). Bump this nonce instead: the lint effect re-runs
    // without touching the selection.
    const [lintNonce, setLintNonce] = React.useState(0);

    // Screen-reader-mode live region. Whenever an action notification
    // fires (refresh complete, save done, etc.) we also write a short
    // string here. The string is rendered inside an aria-live="polite"
    // region above, so screen readers announce it without the user
    // having to look at the toast. We keep it separate from the toast
    // queue because the toast viewport is purely visual — we want a
    // dedicated, ARIA-friendly channel.
    const [lastActionAnnouncement, setLastActionAnnouncement] = React.useState("");

    // Tiny helper — calls the toast (if notifications are on)
    // AND updates the SR live region in one shot. Centralizes the
    // "announce this action" pattern so every call site stays in sync.
    // The variant colors the toast (success = green, warning = amber,
    // destructive = red, default = neutral)
    const announceAction = React.useCallback((opts: {
        title: string;
        description?: string;
        variant?: "default" | "success" | "warning" | "destructive";
    }) => {
        if (settings.actionNotifications) {
            toast({
                title: opts.title,
                description: opts.description,
                variant: opts.variant,
                // toastDuration: 0 means "sticky / manual dismiss" per the
                // setting's hint. The previous `|| undefined` coerced 0 to
                // undefined, which made Radix fall back to its 5s default —
                // so sticky mode silently didn't work. Pass Infinity for 0
                // so the toast stays until the user dismisses it.
                duration: settings.toastDuration === 0
                    ? Infinity
                    : (settings.toastDuration || undefined),
            });
        }
        // Always update the SR live region — screen-reader users want
        // announcements regardless of whether the visual toast is enabled.
        // Clear after 1.5s so identical repeat actions (e.g. "Saved" twice)
        // are re-announced — polite live regions skip identical content
        // if the text hasn't changed between announcements.
        const msg = opts.description
            ? `${opts.title}: ${opts.description}`
            : opts.title;
        setLastActionAnnouncement(msg);
        window.setTimeout(() => {
            setLastActionAnnouncement((prev) => (prev === msg ? "" : prev));
        }, 1500);
    }, [settings.actionNotifications, settings.toastDuration, toast]);

    // Multi-project support. `projects` is the list of
    // directories under the app root that contain Python files.
    // `activeProject` is the absolute path of the currently active
    // project (or the default python_scripts/ dir). `uploadingZip` is
    // true while a ZIP upload is in flight.
    const [projects, setProjects] = React.useState<{ name: string; path: string; scriptCount: number }[]>([]);
    const [activeProject, setActiveProject] = React.useState<string>("");
    const [uploadingZip, setUploadingZip] = React.useState(false);

    // Hydrate history + sortMode + favorites + settings from localStorage on mount.
    React.useEffect(() => {
        setHistory(loadHistory());
        setSettings(loadSettings());
        setSortMode(loadSettings().defaultSortMode ?? "alpha");
        try {
            const raw = window.localStorage.getItem(`${STORAGE_PREFIX}.favorites`);
            if (raw) setFavorites(new Set(JSON.parse(raw) as string[]));
        } catch { /* ignore */
        }
        // Configuration is in — drop the initial loader. (The project
        // settings fetch that follows only MERGES overrides on top; the
        // loader intentionally does not wait for it, so a slow project
        // file can never hold the whole shell hostage.)
        setBooted(true);
    }, []);

    // one-time favorites key migration. Favorites used to
    // be keyed by the BARE file slug, which leaked across folders — two
    // folders each containing `utils.py` shared one star. Keys are now
    // `folder/file`. Legacy bare keys are re-prefixed once the folders
    // list arrives (the mapping needs it): a slug that exists in exactly
    // ONE folder is prefixed with it; ambiguous or vanished keys are
    // kept as-is (they simply stop matching, so an ambiguous favorite may
    // need re-starring once — safer than guessing wrong).
    const favoritesMigratedRef = React.useRef(false);
    React.useEffect(() => {
        if (favoritesMigratedRef.current || folders.length === 0) return;
        favoritesMigratedRef.current = true;
        setFavorites((prev) => {
            if (![...prev].some((k) => !k.includes("/"))) return prev;
            const next = new Set<string>();
            for (const key of prev) {
                if (key.includes("/")) {
                    next.add(key);
                    continue;
                }
                const owners = folders.filter((c) =>
                    c.files.some((f) => f.slug === key)
                );
                next.add(owners.length === 1 ? `${owners[0].slug}/${key}` : key);
            }
            try {
                window.localStorage.setItem(
                    `${STORAGE_PREFIX}.favorites`,
                    JSON.stringify(Array.from(next))
                );
            } catch { /* ignore */
            }
            return next;
        });
    }, [folders]);

    // Re-load settings when the dialog closes (so the rest of the UI sees
    // the updated values). The effective settings are the global settings
    // merged with the active project overrides (map-shaped settings merge
    // PER KEY — see mergeProjectSettings).
    React.useEffect(() => {
        if (!settingsOpen) {
            const effective = mergeProjectSettings(loadSettings(), projectOverrides);
            setSettings(effective);
        }
    }, [settingsOpen, projectOverrides]);

    /* ─── Interface theme application ────────────────────────────
   * The stored `uiTheme` id (Settings → Editor → Interface theme /
   * the menu-bar theme dropdown) is applied to <html> whenever it
   * changes: applyUiTheme sets / clears the data-theme attribute and
   * returns the theme's FAMILY, which next-themes takes over as the
   * light/dark class so every dark:-styled chrome stays coherent.
   * Covers load-on-mount, dialog saves and the dropdown clicks. */
    React.useEffect(() => {
        const family = applyUiTheme(settings.uiTheme ?? "light");
        setTheme(family);
    }, [settings.uiTheme, setTheme]);

    /** Switch the interface theme from the menu-bar dropdown (or the
     * View ▸ Interface Theme submenu): persist the id, apply it to the
     * document, and flip next-themes to the family.
     *
     * PROJECT-SOURCE SYNC: the Settings dialog's Save mirrors the whole
     * draft — uiTheme included — into.praxis/settings.json, and every
     * settings reload merges those project overrides OVER localStorage.
     * A navbar pick that only wrote localStorage was therefore
     * reverted by the very next merge. The fix: when the project file
     * carries a uiTheme, the navbar pick ALSO writes the new id through
     * to the project file (and updates the local override state
     * optimistically), so both stores agree and no merge can revert
     * it. The event dispatch is DEFERRED until the write lands, so the
     * page's settings-saved listener (which re-merges projectOverrides)
     * never re-applies a stale override from an old closure. */
    const handleSetUiTheme = useStableEvent((id: string) => {
        const family = applyUiTheme(id);
        setTheme(family);
        setSettings((prev) => {
            const next = {...prev, uiTheme: id};
            saveSettings(next);
            return next;
        });
        const projectHasTheme = !!projectOverrides && "uiTheme" in projectOverrides;
        if (projectHasTheme) {
            // Keep the in-memory override in step immediately (the merge in
            // every listener then resolves to the picked theme).
            setProjectOverrides((prev) => (prev ? {...prev, uiTheme: id} : prev));
            const seed: Partial<Settings> = {...projectOverrides, uiTheme: id};
            delete seed.aiChatProviders;
            delete seed.aiChatProviderId;
            void (async () => {
                try {
                    const res = await fetch("/api/project-settings", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({settings: seed}),
                    });
                    const data = await res.json().catch(() => null);
                    if (res.ok && data?.ok) {
                        setProjectOverrides(seed as Partial<Settings>);
                    }
                } catch {
                    /* read-only project — localStorage keeps the pick */
                } finally {
                    window.dispatchEvent(new Event("praxis:settings-saved"));
                }
            })();
        } else {
            window.dispatchEvent(new Event("praxis:settings-saved"));
        }
    });
    const saveDiffViewRight = React.useCallback(
        async (content: string) => {
            const dv = diffView;
            if (!dv?.rightFile) return;
            // THE FIX for the permanent 400: /api/file-write's contract is
            // { folder, fileName, content } — the old body shipped `fileSlug`
            // in the fileName slot (a base64url slug), which the route always
            // rejected. saveDiffFileWrite + deslugifyClient (lib/diff-file-save)
            // keep the field names right, including nested files whose slug
            // decodes to their folder-relative path.
            try {
                const res = await saveDiffFileWrite(
                    dv.rightFile.folderSlug,
                    deslugifyClient(dv.rightFile.fileSlug),
                    content
                );
                toast({title: "Saved from diff", description: `${res.file} updated.`, variant: "success"});
                window.dispatchEvent(new CustomEvent("praxis:file-saved", {
                    detail: {folder: dv.rightFile.folderSlug, fileSlug: dv.rightFile.fileSlug},
                }));
            } catch (err) {
                toast({title: "Save from diff failed", description: (err as Error).message, variant: "destructive"});
                throw err;
            }
        },
        [diffView, toast]
    )

    // every
    // settings writer in the app (the dialog's Save, the profile
    // buttons via applyProfile, the menu toggles that already re-loaded
    // by hand) broadcasts `praxis:settings-saved` — the page now LISTENS
    // too, so the live `settings` state refreshes the moment a save
    // lands instead of waiting for the dialog to close. The components
    // that already listened (data-file-browser, image-toolbox) are
    // unchanged; this closes the loop for the app shell itself.
    React.useEffect(() => {
        const onSettingsSaved = () => {
            setSettings((prev) => {
                const effective = mergeProjectSettings(loadSettings(), projectOverrides);
                // Avoid a state churn when nothing actually changed.
                return JSON.stringify(effective) === JSON.stringify(prev) ? prev : effective;
            });
        };
        window.addEventListener("praxis:settings-saved", onSettingsSaved);
        return () => window.removeEventListener("praxis:settings-saved", onSettingsSaved);
    }, [projectOverrides]);

    // warn once at startup when no working Python exists.
    // Runs, lint, tests and the figure pipeline all need an
    // interpreter; the probe spawns `<interp> --version` server-side
    // (GET /api/python-check) so a PATH entry that doesn't actually
    // run is caught too. Gated on
    // the warnNoPython setting; once per session, never re-fired.
    const pythonWarnedRef = React.useRef(false);
    React.useEffect(() => {
        if (pythonWarnedRef.current) return;
        pythonWarnedRef.current = true;
        (async () => {
            try {
                // probe the CONFIGURED interpreter (Settings →
                // Python) when one is set — the warning must reflect the env the
                // user actually selected, not just the auto-detected default.
                const interp = loadSettings().pythonInterpreter || "";
                const res = await fetch(
                    `/api/python-check${interp ? `?interpreter=${encodeURIComponent(interp)}` : ""}`,
                    {cache: "no-store"}
                );
                if (!res.ok) return;
                const data = await res.json();
                if (data.ok === false && loadSettings().warnNoPython !== false) {
                    toast({
                        title: "Python not found",
                        description: `${data.error ?? "No working interpreter was detected."} Running, linting and tests need Python — install it from python.org and restart Praxis.`,
                        variant: "destructive",
                    });
                }
            } catch {
                /* probe failed — stay silent; the run button will surface errors */
            }
        })();
    }, [toast]);

    // Fetch the active project's settings.json (if any). Called on mount
    // and after every project switch (activeProject changes). On success,
    // updates `projectOverrides`; on failure (no file / network error),
    // clears them so the global settings stand alone.
    //
    // the load now NOTIFIES the user which source won —
    // ".praxis/settings.json found in the project folder → its values
    // override this browser's local settings" or "no project file →
    // the browser-local (localStorage) settings stand"
    // "the system should fetch the settings first in the folder and if
    // it exists it should load it and otherwise it should load the
    // local settings, but you need to notify the user"). One toast per
    // fetch (mount + every project switch), never re-fired on re-render.
    const settingsSourceNotifiedRef = React.useRef(false);
    /**:
     * projects the user has explicitly CLEARED project settings on (via
     * Settings -> "Clear project settings") are listed here so the
     * auto-seed below does not resurrect the file the user just deleted
     * on the next mount / project switch. Keyed by the active-project
     * path ("<default>" = the built-in project). */
    const clearedProjectSettingsRef = React.useRef<Set<string>>(new Set());

    /** Seed `<project-root>/.praxis/settings.json` with the browser's
     * CURRENT settings when the project has no file yet — the PyCharm
     * .idea-style "created by default, loaded from there" behavior. The
     * file is written once (the first time the project is opened); every
     * later open GETs it back as project overrides.
     *
     * Secrets never leave the browser: `aiChatProviders` (which can carry
     * bearer tokens in `apiKey`) and `aiChatProviderId` are stripped —
     * those always stay browser-local, because the project folder is
     * commonly committed to version control. Best-effort: on failure the
     * local settings simply keep applying and no file is created. */
    const seedProjectSettings = React.useCallback(async (): Promise<boolean> => {
        try {
            const current = loadSettings();
            const seed: Partial<Settings> = {...current};
            delete seed.aiChatProviders;
            delete seed.aiChatProviderId;
            // two attempts with a short pause — Windows AV / indexers
            // occasionally hold a freshly-created .praxis file long enough
            // for an EBUSY/EPERM to fail the first write (the "folder created
            // but nothing in it" sighting: mkdir landed, the file didn't).
            for (let attempt = 0; attempt < 2; attempt++) {
                const res = await fetch("/api/project-settings", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({settings: seed}),
                });
                if (res.ok) {
                    try {
                        const body = await res.json();
                        if (typeof body?.praxisDir === "string" && body.praxisDir) {
                            setSettingsSourceDir(body.praxisDir);
                        }
                    } catch { /* best-effort path naming */
                    }
                    return true;
                }
                if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
            }
            return false;
        } catch {
            return false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchProjectSettings = React.useCallback(async (seedIfMissing = true) => {
        try {
            // `seed=0` for deliberately-cleared projects so the
            // SERVER-side auto-seed (see the route's GET) never resurrects
            // the file the user just deleted.
            const res = await fetch(
                `/api/project-settings${seedIfMissing ? "" : "?seed=0"}`,
                {cache: "no-store"}
            );
            if (!res.ok) {
                setProjectOverrides({});
                const seeded = seedIfMissing ? await seedProjectSettings() : false;
                notifySettingsSource(false, undefined, seeded);
                if (seeded) await reloadSeededSettings();
                return;
            }
            const data = await res.json();
            if (data.ok && data.settings && typeof data.settings === "object") {
                setProjectOverrides(data.settings as Partial<Settings>);
                if (typeof data.praxisDir === "string" && data.praxisDir) {
                    setSettingsSourceDir(data.praxisDir);
                }
                // the SERVER seeded the file with defaults (the
                // "by all means" guarantee — see the route). The browser's own
                // settings are the copy the user actually wants in it, so the
                // client-side seed POST still runs and OVERWRITES the defaults;
                // the source toast then reads "created", not "loaded".
                if (data.seeded && seedIfMissing) {
                    const seeded = await seedProjectSettings();
                    notifySettingsSource(false, undefined, seeded);
                    if (typeof data.praxisDir === "string" && data.praxisDir) {
                        setSettingsSourceDir(data.praxisDir);
                    }
                    if (seeded) {
                        await reloadSeededSettings();
                        return;
                    }
                }
                notifySettingsSource(true, data.settings as Partial<Settings>, false, typeof data.praxisDir === "string" ? data.praxisDir : undefined);
            } else {
                setProjectOverrides({});
                // No .praxis/settings.json in this project yet -> create it by
                // default with the current settings (see seedProjectSettings).
                const seeded = seedIfMissing ? await seedProjectSettings() : false;
                notifySettingsSource(false, undefined, seeded);
                // the seed just landed — load it BACK so this very
                // session already treats .praxis/settings.json as the live
                // source (the "auto-loaded afterwards" ask), instead of only
                // the next reload.
                if (seeded) await reloadSeededSettings();
            }
        } catch {
            setProjectOverrides({});
            notifySettingsSource(false, undefined, false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** one follow-up GET after a successful seed — promotes the
     *  freshly written .praxis/settings.json to the live override source
     *  (badge flips to "project") without firing another source toast. */
    const reloadSeededSettings = React.useCallback(async () => {
        try {
            const again = await fetch("/api/project-settings", {cache: "no-store"});
            if (!again.ok) return;
            const data = await again.json();
            if (data.ok && data.settings && typeof data.settings === "object") {
                setProjectOverrides(data.settings as Partial<Settings>);
                setSettingsSource("project");
                if (typeof data.praxisDir === "string" && data.praxisDir) {
                    setSettingsSourceDir(data.praxisDir);
                }
            }
        } catch {
            /* stays browser-local this session — next open loads the file */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Toast the settings source once per fetch cycle (mount / project
     * switch). Fires only when the Toaster is mounted — the very first
     * render happens before it, and a lost toast here is harmless.
     * third case — the project file was missing and has just
     * been SEEDED, which gets its own "created" toast. */
    /**: the persistent SOURCE badge the Settings dialog shows —
     * "project" =.praxis/settings.json is live for this project,
     * "seeded" = it was just created from the browser settings,
     * "local" = browser-local only. The toasts stay (one per cycle);
     * this state answers the question every time the dialog opens. */
    const [settingsSource, setSettingsSource] = React.useState<"project" | "seeded" | "local">("local");
    /** Absolute on-disk path of the active project's `.praxis` folder —
     * named in every settings-source toast so "loaded from the project
     * folder" can never be ambiguous (the toast says WHERE it is).
     * Also shown by the Settings dialog's source badge. */
    const [settingsSourceDir, setSettingsSourceDir] = React.useState<string | null>(null);

    function notifySettingsSource(fromProject: boolean, overrides?: Partial<Settings>, seeded = false, praxisDir?: string) {
        // The persistent badge updates on EVERY call (the ref guard below
        // only dedupes the toasts).
        setSettingsSource(fromProject ? "project" : seeded ? "seeded" : "local");
        if (praxisDir) setSettingsSourceDir(praxisDir);
        if (settingsSourceNotifiedRef.current) return;
        settingsSourceNotifiedRef.current = true;
        if (fromProject) {
            const overrideCount = overrides ? Object.keys(overrides).length : 0;
            toast({
                title: "Project settings loaded from the project folder",
                description: `${overrideCount} setting${overrideCount === 1 ? "" : "s"} from ${praxisDir ?? "the project root"}/.praxis/settings.json override this browser's local preferences for the active project.`,
            });
        } else if (seeded) {
            toast({
                title: "Project settings file created",
                description: `No .praxis/settings.json existed in this project yet — one was just created with your current settings (AI chat provider keys stay browser-local) at ${praxisDir ?? "the project root"}/.praxis. This project now loads its settings from that file, PyCharm .idea-style.`,
            });
        } else {
            toast({
                title: "Using browser-local settings",
                description: "No .praxis/settings.json was found in the active project — your settings, configs and preferences load from this browser's local storage.",
            });
        }
    }

    // the duplicate mount effect was deleted. This effect
    // alone covers the mount case (activeProject starts as "") AND every
    // project switch — two sibling effects both firing on mount caused
    // the duplicated GET /api/project-settings pair 9 ms apart.
    // a project switch opens a NEW fetch cycle, so the
    // one-toast-per-cycle guard is re-armed only when activeProject
    // actually changes value (guards against StrictMode double effects).
    const lastSettingsProjectRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (lastSettingsProjectRef.current !== activeProject) {
            lastSettingsProjectRef.current = activeProject;
            settingsSourceNotifiedRef.current = false;
        }
        // never re-seed a project whose settings file the user
        // deliberately cleared (DELETE) — that clear is a statement, not an
        // invitation to recreate the file on the next switch back.
        const projectKey = activeProject || "<default>";
        void fetchProjectSettings(!clearedProjectSettingsRef.current.has(projectKey));
    }, [activeProject, fetchProjectSettings]);

    // wrapTabNavigation — when on, capture Tab / Shift+Tab at the document
    // level and wrap focus from the last focusable element back to the
    // first (and vice versa). The query selector matches the standard
    // focusable set: anchors with href, buttons:not([disabled]), inputs,
    // selects, textareas, and elements with tabindex >= 0. We exclude
    // elements with tabindex="-1" (programmatic focus only).
    React.useEffect(() => {
        if (!settings.wrapTabNavigation) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            // Find all focusable elements within the document body.
            const focusables = Array.from(
                document.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => {
                // Skip elements that are not visible (display:none / visibility:hidden).
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden") return false;
                return true;
            });
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey) {
                // Shift+Tab on the first focusable → wrap to the last.
                if (active === first || (active && !focusables.includes(active))) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab on the last focusable → wrap to the first.
                if (active === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [settings.wrapTabNavigation]);

    // Keep the <html> element's data-high-contrast attribute in sync with
    // the highContrastMode setting . The inline <head> script in
    // layout.tsx applies it pre-hydration to avoid a flash; this effect
    // keeps it correct after the user toggles the setting at runtime.
    React.useEffect(() => {
        if (settings.highContrastMode) {
            document.documentElement.setAttribute("data-high-contrast", "true");
        } else {
            document.documentElement.removeAttribute("data-high-contrast");
        }
    }, [settings.highContrastMode]);

    // Apply the four accessibility-effect settings
    // as data-* attributes on <html>. The actual visual effects are
    // implemented in globals.css and gated on these attributes. The
    // inline pre-hydration script in layout.tsx applies them before
    // first paint to avoid a flash; this effect keeps them in sync
    // whenever the user toggles the settings at runtime.
    React.useEffect(() => {
        const html = document.documentElement;
        const apply = (
            attr: string,
            on: boolean
        ) => {
            if (on) html.setAttribute(attr, "true");
            else html.removeAttribute(attr);
        };
        apply("data-reduce-motion", settings.reduceMotion);
        apply("data-screen-reader", settings.screenReaderMode);
        apply("data-large-text", settings.largeTextMode);
        apply("data-enhanced-focus", settings.enhancedFocusIndicators);
        // Extended accessibility modes.
        apply("data-dyslexia-friendly", settings.dyslexiaFriendlyMode);
        apply("data-color-blind", settings.colorBlindMode);
        apply("data-always-show-shortcuts", settings.alwaysShowShortcutHints);
        apply("data-sticky-cursor", settings.stickyCursorIndicator);
        apply("data-wrap-tab", settings.wrapTabNavigation);
        apply("data-highlight-current-line", settings.highlightCurrentLine);
        apply("data-show-whitespace", settings.showWhitespace);
    }, [
        settings.reduceMotion,
        settings.screenReaderMode,
        settings.largeTextMode,
        settings.enhancedFocusIndicators,
        settings.dyslexiaFriendlyMode,
        settings.colorBlindMode,
        settings.alwaysShowShortcutHints,
        settings.stickyCursorIndicator,
        settings.wrapTabNavigation,
        settings.highlightCurrentLine,
        settings.showWhitespace,
    ]);

    // Fetch git status once the folders payload settles + after every
    // folders refresh.
    const fetchGitStatus = React.useCallback(async () => {
        if (!settings.showGitStatus) {
            setGitStatusEntries([]);
            setGitBranch(null);
            return;
        }
        setGitStatusLoading(true);
        try {
            const res = await fetch("/api/git-status");
            const data = await res.json();
            if (data.ok && data.isRepo && Array.isArray(data.entries)) {
                // Store the full entries — the derived gitStatusMap, the dirty
                // count, and the Git Diff panel (via props) all flow from this
                // single fetch (the panel used to re-fetch the same
                // endpoint itself).
                setGitStatusEntries(data.entries);
                // Stash the branch name for the Footer's git chip.
                if (typeof data.branch === "string") {
                    setGitBranch(data.branch);
                } else {
                    setGitBranch(null);
                }
            } else {
                setGitStatusEntries([]);
                setGitBranch(null);
            }
        } catch {
            setGitStatusEntries([]);
            setGitBranch(null);
        } finally {
            setGitStatusLoading(false);
        }
    }, [settings.showGitStatus]);

    React.useEffect(() => {
        // `folders` is the initial empty placeholder on
        // mount and is replaced when refreshFolders resolves — the old
        // dependency setup made this effect fire on BOTH, spawning git
        // twice per page load. Skipping while a folders load is in flight
        // means one fetch when the first payload settles and one per later
        // watcher-driven refresh.
        if (foldersLoading) return;
        fetchGitStatus();
    }, [fetchGitStatus, folders, foldersLoading]);

    /* ---------------------------------------------------------------- */
    /*  URL <-> selection sync  + localStorage persistence     */
    /* ---------------------------------------------------------------- */
    // On first mount, restore selection from URL (preferred) or localStorage.
    // We read directly from window.location so this works even if
    // useSearchParams hasn't hydrated yet.
    React.useEffect(() => {
        const url = new URL(window.location.href);
        const urlFolder = url.searchParams.get("folder");
        const urlFile = url.searchParams.get("file");
        if (urlFolder) setSelectedFolderSlug(urlFolder);
        if (urlFile) setSelectedFileSlug(urlFile);
        if (!urlFolder && !urlFile) {
            // Try localStorage.
            try {
                const saved = window.localStorage.getItem(LAST_SEL_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved) as { folder?: string; file?: string };
                    if (parsed.folder) setSelectedFolderSlug(parsed.folder);
                    if (parsed.file) setSelectedFileSlug(parsed.file);
                }
            } catch { /* ignore */
            }
        }
    }, []);
    // Persist selection to localStorage whenever it changes.
    React.useEffect(() => {
        if (!selectedFolderSlug) return;
        try {
            window.localStorage.setItem(
                LAST_SEL_KEY,
                JSON.stringify({
                    folder: selectedFolderSlug,
                    file: selectedFileSlug,
                })
            );
        } catch { /* ignore */
        }
    }, [selectedFolderSlug, selectedFileSlug]);

    // When the selected file changes, reset the bottom-panel tab to the
    // user's configured default (Settings → Advanced → Default bottom
    // panel tab). Also clears the footer cursor/selection indicators
    // (via the external store — no page re-render) so the
    // Footer doesn't show a stale position from the previous file.
    React.useEffect(() => {
        setBottomTab(settings.defaultBottomTab);
        footerStore.clear();
    }, [selectedFileSlug, settings.defaultBottomTab]);

    // Push selection to URL. Uses window.history.replaceState (NOT
    // router.replace) so the URL bar updates for bookmarking WITHOUT
    // triggering a Next.js navigation. router.replace causes a server
    // round-trip to re-render the RSC payload for this 5000-line page
    // component, which takes 2+ seconds in dev mode on every file
    // switch. The URL params are only for bookmarkable URLs + initial
    // load (read once on mount via window.location) — they're NOT used
    // by any server component or useSearchParams hook, so skipping
    // the server round-trip is safe.
    React.useEffect(() => {
        if (!selectedFolderSlug && !selectedFileSlug) return;
        const params = new URLSearchParams();
        if (selectedFolderSlug) params.set("folder", selectedFolderSlug);
        if (selectedFileSlug) params.set("file", selectedFileSlug);
        const qs = params.toString();
        const newUrl = qs ? `/?${qs}` : "/";
        if (typeof window !== "undefined") {
            window.history.replaceState(null, "", newUrl);
        }
    }, [selectedFolderSlug, selectedFileSlug]);

    /* ---------------------------------------------------------------- */
    /*  Refresh folder tree                                            */
    /* ---------------------------------------------------------------- */
    // Reads the URL once so refreshFolders can honor it on the very first
    // load (before the URL→state effect has had a chance to run).
    const initialUrlRef = React.useRef<{ folder?: string; file?: string } | null>(null);
    if (initialUrlRef.current === null && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        initialUrlRef.current = {
            folder: url.searchParams.get("folder") ?? undefined,
            file: url.searchParams.get("file") ?? undefined,
        };
    }

    // Ref-stash for selectedFolderSlug so refreshFolders can read the
    // latest value without taking it as a dep (which would change its
    // identity on every selection change and re-fire the watcher + load
    // effects, causing a skeleton-flashing re-fetch loop). Declared
    // BEFORE refreshFolders so the callback can reference it.
    const selectedFolderSlugRef = React.useRef(selectedFolderSlug);
    React.useEffect(() => {
        selectedFolderSlugRef.current = selectedFolderSlug;
    }, [selectedFolderSlug]);

    // When the last watcher-driven (silent) refresh completed — used to
    // coalesce mutation-echo refreshes. See refreshFolders.
    const lastRefreshCompletedAtRef = React.useRef(0);

    // ─── "Editor blank" state ────────────────────────────
    // Set by Close-all-tabs: the user explicitly wants NO file open, so
    // the editor shows the blank placeholder instead of silently
    // re-selecting the folder's first file (the guard effect below used
    // to auto-open files[0] whenever selectedFileSlug was empty). Any
    // user-driven selection (tree click, tab click, example creation,
    // history/search jump) clears it. A ref mirror lets refreshFolders
    // read it without changing the callback's identity (which would
    // reconnect the watcher).
    const [editorBlank, setEditorBlank] = React.useState(false);
    const editorBlankRef = React.useRef(false);
    React.useEffect(() => {
        editorBlankRef.current = editorBlank;
    }, [editorBlank]);

    const refreshFolders = React.useCallback(async (opts?: { silent?: boolean }) => {
        // Coalesce bursts
        // calls of folder refreshing is made"). Every mutation handler
        // calls onRefresh explicitly, and the /api/watch-dir SSE then
        // fires for the SAME fs change ~800ms later — both hit this
        // function. A watcher-driven (silent) refresh that arrives right
        // after a completed one is skipped: one fetch, one toast.
        // Explicit refreshes always run (user intent / project switch).
        if (opts?.silent && Date.now() - lastRefreshCompletedAtRef.current < 1500) {
            return;
        }
        // Silent (watcher-driven) refreshes don't flash the skeleton —
        // the tree just updates in place.
        if (!opts?.silent) setFoldersLoading(true);
        setFoldersError(null);
        try {
            // ?hidden=1 when the explorer's show-hidden
            // toggle is on — dot-directories (.praxis) + dot-files surface.
            const hiddenSuffix = settings.explorerShowHidden ? "?hidden=1" : "";
            const res = await fetch(`/api/folders${hiddenSuffix}`, {cache: "no-store"});
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: { folders: Folder[] } = await res.json();
            setFolders(data.folders ?? []);

            // Action notifications: show a toast when
            // the refresh completes successfully — but ONLY for user-initiated
            // refreshes (View → Refresh, mutations). Watcher-driven background
            // refreshes (external edits, and the echo of a mutation) stay
            // silent so deleting one folder doesn't stack two identical
            // "Project refreshed" toasts. renamed from "Folders
            // refreshed" — the folders list is the active project's top-level
            // folders, so the generic wording is project/folder.
            if (!opts?.silent) {
                announceAction({
                    title: "Project refreshed",
                    description: `${data.folders?.length ?? 0} folders found`,
                });
            }

            // Resolve the "current" selection. Priority:
            //   1. selectedFolderSlug (state, possibly set by URL→state effect)
            //   2. initialUrlRef.current.folder (URL on first paint)
            //   3. first folder in the list
            //
            // Read selectedFolderSlug from a ref (not the closure) so this
            // callback's identity stays stable — the watcher effect + the
            // initial-load effect both depend on refreshFolders, so if its
            // identity changed on every selection change, those effects would
            // re-fire and cause a re-fetch loop (skeleton flashing).
            const urlFolder = initialUrlRef.current?.folder;
            const currentSlug = selectedFolderSlugRef.current;
            const effective =
                currentSlug ||
                (urlFolder && data.folders?.some((c) => c.slug === urlFolder)
                    ? urlFolder
                    : "");

            if (
                effective &&
                !data.folders?.some((c) => c.slug === effective)
            ) {
                // Current selection no longer exists — fall back to the first folder.
                setSelectedFolderSlug(data.folders[0]?.slug ?? "");
            } else if (!effective && data.folders.length > 0 && !editorBlankRef.current) {
                // No folder selected (initial load, or the user closed all
                // tabs): pick the first folder — but NOT when the editor is
                // deliberately blank (Close all), which would silently reopen
                // a file the user just closed.
                setSelectedFolderSlug(data.folders[0].slug);
            }
            // else: effective matches a folder — keep it.
        } catch (err) {
            setFoldersError((err as Error).message);
        } finally {
            setFoldersLoading(false);
            lastRefreshCompletedAtRef.current = Date.now();
        }
    }, [announceAction, settings.explorerShowHidden]);

    /* ─── Tab lifecycle (Phase 2) ─────────────────────────────────────
   * The untitled-draft machinery, the Save As picker and the draft GC
   * live in hooks/use-tab-lifecycle.ts; every decision inside them is
   * a pure rule from lib/tab-lifecycle.ts (unit-tested). The page
   * consumes the surface below and stays out of the lifecycle. */
    const {
        activeUntitledTab,
        draftTextFor,
        setDraftText,
        openApiClientDraft,
        openSaveAsPicker,
        confirmUntitledSave,
        untitledSaveDialog,
        setUntitledSaveDialog,
        untitledSaveFolder,
        setUntitledSaveFolder,
        untitledSaveName,
        setUntitledSaveName,
    } = useTabLifecycle({
        openTabs,
        activeTabId,
        closedTabHistory,
        folders,
        setOpenTabs,
        setActiveTabId,
        setSelectedFolderSlug,
        setSelectedFileSlug,
        setEditorBlank,
        refreshFolders,
        toast,
    });

    // the explorer's show-hidden toggle — flips the
    // setting (persisted + broadcast) and refetches with ?hidden=1.
    React.useEffect(() => {
        const onToggleHidden = () => {
            setSettings((prev) => {
                const next = {...prev, explorerShowHidden: !prev.explorerShowHidden};
                saveSettings(next);
                return next;
            });
            void refreshFolders();
        };
        window.addEventListener("praxis:toggle-hidden-files", onToggleHidden);
        return () => window.removeEventListener("praxis:toggle-hidden-files", onToggleHidden);
    }, [refreshFolders]);

    // run the initial load exactly
    // ONCE per real mount. Two independent things used to re-fire the
    // effect below: (a) React StrictMode double-invokes effects in dev;
    // (b) refreshFolders' identity changes when the localStorage-hydrated
    // settings replace the defaults (announceAction depends on
    // settings.actionNotifications + settings.toastDuration) — so one
    // app start / window refresh stacked TWO "Project refreshed" toasts
    // (and two /api/folders fetches). A ref guard suppresses both while
    // explicit refreshes (View → Refresh, mutations, project switches)
    // keep their own toasts.
    const initialFoldersLoadDoneRef = React.useRef(false);
    React.useEffect(() => {
        if (initialFoldersLoadDoneRef.current) return;
        initialFoldersLoadDoneRef.current = true;
        refreshFolders();
    }, [refreshFolders]);

    /* ---------------------------------------------------------------- */
    /*  Multi-project support                                            */
    /* ---------------------------------------------------------------- */
    /** Fetch the list of available projects + the currently active one
     *  from /api/projects. Called on mount and after switching / uploading. */
    const fetchProjects = React.useCallback(async () => {
        try {
            const res = await fetch("/api/projects", {cache: "no-store"});
            if (!res.ok) return;
            const data: {
                projects: { name: string; path: string; scriptCount: number }[];
                active: string;
            } = await res.json();
            setProjects(data.projects ?? []);
            if (data.active) setActiveProject(data.active);
        } catch {
            /* ignore — non-fatal */
        }
    }, []);

    React.useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    /** Clear every piece of editor state that belongs to the previous
     *  project after a switch (explicit select, create, or ZIP upload).
     *
     *  Without this, the editor kept showing the previous project's file
     *  after the server had already switched roots — and folder/file
     *  slugs are just base64(name), so identically named files collide
     *  across projects: a stale open tab (or the still-selected file)
     *  could load the NEW project's same-named file, and a save would
     *  write the old project's content into it. Also clears the run
     *  result, which the code-fetch effect's early-return path skipped. */
    const resetEditorForProjectSwitch = React.useCallback(() => {
        setSelectedFolderSlug("");
        setSelectedFileSlug("");
        setCode(null);
        setActiveTabId(null);
        setOpenTabs([]);
        setClosedTabHistory([]);
        setRunResult(null);
        setPreviousRunResult(null);
        // Drop stale ?folder=&file= params — otherwise a reload after the
        // switch would restore a selection that belongs to the PREVIOUS
        // project and resolve it against the new root (404 toast).
        try {
            window.history.replaceState(null, "", window.location.pathname);
        } catch { /* ignore */
        }
    }, []);

    /** Switch the active project. Pass an empty string to reset to the
     * default `python_scripts/` directory. After switching, the folder
     * tree is refreshed and the current selection is cleared. Returns
     * true when the switch succeeded — the FolderPickerDialog keeps the
     * user's browse position on failure (the error toast is shown here). */
    const handleSelectProject = React.useCallback(
        async (projectPath: string): Promise<boolean> => {
            try {
                const res = await fetch("/api/projects", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({path: projectPath}),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                setActiveProject(data.projectPath);
                // Clear the current selection (and any open tabs) so the new
                // project loads cleanly — tabs from the previous project would
                // resolve their slugs against the new root.
                resetEditorForProjectSwitch();
                // Refresh both lists in parallel.
                await Promise.all([fetchProjects(), refreshFolders()]);
                announceAction({
                    title: "Project switched",
                    description: data.projectName
                        ? `Now reading from "${data.projectName}".`
                        : "Switched to default project.",
                    variant: "success",
                });
                return true;
            } catch (err) {
                announceAction({
                    title: "Failed to switch project",
                    description: (err as Error).message,
                    variant: "destructive",
                });
                return false;
            }
        },
        [fetchProjects, refreshFolders, announceAction, resetEditorForProjectSwitch]
    );

    /** Called by FolderTree after /api/projects/create succeeds. The
     * server has ALREADY switched its active root to the new project —
     * the client must mirror that immediately: set activeProject (so the
     * menu bar / footer label, the dir watcher and the project-settings
     * fetch all follow) and clear the old project's editor state.
     *
     * This is the fix for "creating a new project works, but the
     * explorer does not go to it": the old handler only refreshed the
     * projects menu list and left every other piece of UI pointing at
     * the previous project. Note we do NOT call refreshFolders here
     *: FolderTree's own onRefresh right after this
     * callback is the single /api/folders fetch. */
    const handleProjectCreated = React.useCallback(
        async (projectPath: string, projectName: string) => {
            if (projectPath) setActiveProject(projectPath);
            resetEditorForProjectSwitch();
            // Refresh the projects list so the new project appears in the
            // File → Open project menu (the server lists registered created
            // projects even while they are empty).
            try {
                const res = await fetch("/api/projects", {cache: "no-store"});
                if (res.ok) {
                    const data: {
                        projects: { name: string; path: string; scriptCount: number }[];
                        active: string;
                    } = await res.json();
                    setProjects(data.projects ?? []);
                    if (data.active) setActiveProject(data.active);
                }
            } catch { /* ignore — non-fatal */
            }
            void projectName; // the tree already toasts "created and activated"
        },
        [resetEditorForProjectSwitch]
    );

    /** Upload a ZIP file as a new project. Unzips on the server, switches
     *  the active project to the new directory, and refreshes the UI.
     *  The server falls back to a pure-JS extractor when the system
     *  `unzip` binary isn't installed — see /api/upload-zip/route.ts. */
    const handleUploadZip = React.useCallback(
        async (file: File) => {
            if (!file.name.toLowerCase().endsWith(".zip")) {
                announceAction({
                    title: "Not a ZIP file",
                    description: "Please choose a .zip archive.",
                    variant: "warning",
                });
                return;
            }
            setUploadingZip(true);
            try {
                const projectName =
                    file.name.replace(/\.zip$/i, "") || `project-${Date.now()}`;
                const form = new FormData();
                form.append("file", file);
                form.append("projectName", projectName);
                const res = await fetch("/api/upload-zip", {
                    method: "POST",
                    body: form,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                // The new project is automatically active on the server — mirror
                // it in the client state directly (don't wait for fetchProjects'
                // `data.active` round-trip) and clear the previous project's
                // editor state (selection, tabs, run result).
                if (typeof data.path === "string" && data.path) {
                    setActiveProject(data.path);
                }
                resetEditorForProjectSwitch();
                await Promise.all([fetchProjects(), refreshFolders()]);
                // Surface whether the server used the system unzip or the
                // built-in fallback — useful if the user wants to know why
                // an exotic-format archive didn't extract.
                const note = data.extractor === "builtin"
                    ? `"${data.projectName}" created with ${data.scriptCount} Python script${data.scriptCount === 1 ? "" : "s"} (built-in extractor).`
                    : `"${data.projectName}" created with ${data.scriptCount} Python script${data.scriptCount === 1 ? "" : "s"}.`;
                announceAction({
                    title: "Project uploaded",
                    description: note,
                    variant: "success",
                });
            } catch (err) {
                announceAction({
                    title: "Upload failed",
                    description: (err as Error).message,
                    variant: "destructive",
                });
            } finally {
                setUploadingZip(false);
            }
        },
        [fetchProjects, refreshFolders, announceAction, resetEditorForProjectSwitch]
    );

    // Reset file selection when folder changes.
    React.useEffect(() => {
        if (editorBlank) return;
        if (!selectedFolderSlug) {
            setSelectedFileSlug("");
            return;
        }
        const folder = folders.find((c) => c.slug === selectedFolderSlug);
        if (!folder) return;

        // If the URL or localStorage has already pinned a file in this folder,
        // honor it.
        const urlFile = initialUrlRef.current?.file;
        if (
            !selectedFileSlug &&
            urlFile &&
            folder.files.some((f) => f.slug === urlFile)
        ) {
            setSelectedFileSlug(urlFile);
            return;
        }

        if (
            selectedFileSlug &&
            folder.files.some((f) => f.slug === selectedFileSlug)
        ) {
            return;
        }
        // while a saved session is still pending restoration,
        // do NOT fall back to auto-opening files[0] when that session is
        // EMPTY — an empty session is the persisted "Close all" state
        // (documented that a reload after Close all stays
        // blank). The restore effect below sets editorBlank for that
        // case, but it runs AFTER this guard in the same commit, so
        // without this check the auto-open won the race and the first
        // folder's first file popped back open on every reload. URL
        // deep links (handled above) and non-empty sessions are
        // unaffected; no saved session at all keeps the original
        // auto-open (first-launch lands on a real example).
        if (!sessionRestoredRef.current) {
            try {
                const raw = window.localStorage.getItem(SESSION_KEY);
                if (raw) {
                    const saved = JSON.parse(raw) as { tabs?: unknown[] };
                    if (!Array.isArray(saved.tabs) || saved.tabs.length === 0) return;
                }
            } catch {
                /* malformed session — ignore, fall through to auto-open */
            }
        }
        setSelectedFileSlug(folder.files[0]?.slug ?? "");
    }, [selectedFolderSlug, folders, selectedFileSlug, editorBlank]);

    // Build a slug → most-recent-run `ok` map for the FolderTree's
    // status dots (wires up `showLastRunStatusInDropdown`). History
    // entries store folder/file *display names* (not slugs), so we look
    // up each file's slug from the folders data. History is newest-first,
    // so the first match wins.
    // keys are the COMPOSITE `folder/file` slug — the
    // bare file slug collided across folders (two folders with a
    // same-named file shared one run-status dot).
    // PERF: the map's IDENTITY is keyed on a canonical content
    // string, not on the raw `history` array. trackRecentScript
    // reorders/rewrites history on EVERY Python file open, which used to
    // recompute the Map → new identity → the memo'd FolderTree re-rendered
    // (~0.5-1.3 s) on every click even though the visible content was
    // byte-identical. The sorted key is order-insensitive, so a reorder
    // alone no longer re-renders the tree.
    const lastRunStatusHistoryKey = React.useMemo(
        () =>
            history
                .map((h) => `${h.folder}/${h.file}:${h.ok ? 1 : 0}`)
                .sort()
                .join("|"),
        [history]
    );
    const lastRunStatusMap = React.useMemo(() => {
        const m = new Map<string, boolean>();
        if (!settings.showLastRunStatusInDropdown) return m;
        for (const ch of folders) {
            for (const f of ch.files) {
                const entry = history.find(
                    (h) => h.folder === ch.name && h.file === f.name
                );
                if (entry) m.set(`${ch.slug}/${f.slug}`, entry.ok);
            }
        }
        return m;
        // Identity-keyed on the canonical content string (see note above);
        // `history` itself is intentionally NOT a dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastRunStatusHistoryKey, folders, settings.showLastRunStatusInDropdown]);

    // Ref-stash for folders so the code-fetch effect can read the
    // latest folders without taking it as a dep (which would re-fire
    // on every folder refresh → duplicate /api/code fetches).
    const foldersRef = React.useRef(folders);
    React.useEffect(() => {
        foldersRef.current = folders;
    }, [folders]);

    /* ---------------------------------------------------------------- */
    /* — the universal dirty-switch guard (declared EARLY so */
    /*  every switch path below can call guardedSelectFile)            */
    /* ---------------------------------------------------------------- */
    /** Tab flag + name mirror (refs — read synchronously by every
     *  switch path at click time). */
    const activeTabInfoRef = React.useRef<{ dirty: boolean; fileName: string }>({dirty: false, fileName: ""});
    /**: a DIRECT page-level dirty
     * mirror fed by every viewer (CodeViewer / FileViewer / notebook /
     * markdown studio). The tab-based flag alone had a hole — beyond
     * the 10-tab cap `activeTabId` points at a tab that no longer
     * exists, setTabDirty no-ops, and the guard never fired. The ref
     * short-circuits all of that. */
    const viewerDirtyRef = React.useRef(false);
    React.useEffect(() => {
        const t = openTabs.find((x) => x.id === activeTabId);
        activeTabInfoRef.current = {dirty: !!t?.dirty, fileName: t?.fileName ?? ""};
    }, [openTabs, activeTabId]);
    const [pendingSwitchTab, setPendingSwitchTab] = React.useState<{
        id: string;
        toName: string;
        fromName: string;
        /** target picked from the FOLDER TREE
         *  (not an open tab) — the dirty guard covers the Explorer too. */
        tree?: { folderSlug: string; fileSlug: string };
    } | null>(null);

    /** An action to run once a GUARDED switch completes (the dialog's
     *  Save / Discard choice finishes it). */
    const pendingAfterSwitchRef = React.useRef<(() => void) | null>(null);
    /* ── CODE SKELETON GATE ──────────────────────────────────────────
   * Shared machinery for the code-shaped loading skeleton:
   *
   * • `beginCodeSkeleton()` starts a skeleton window for a NEW code
   *   load — it cancels any reveal timer still pending from the
   *   PREVIOUS load, stamps the min-window clock, bumps a load
   *   generation and raises `codeLoading`. Safe to call twice for the
   *   same load (click-time prime + effect-time start).
   *
   * • `revealCodeWhenReady(reveal)` holds the skeleton for a minimum
   *   window (the same pattern as the FileViewer's SKELETON_MIN_MS)
   *   before letting the content show — and is GENERATION-GUARDED:
   *   the old unguarded `setTimeout(() => setCodeLoading(false), …)`
   *   scheduled by file A's load could fire while file B's skeleton
   *   window was already open, blanking B's skeleton mid-load (the
   *   "sometimes no skeleton on first open" race — the stale reveal
   *   raced the user's next click). A reveal scheduled for generation
   *   N is a no-op once generation N+1 has begun, and beginning a new
   *   load also clears the pending timer outright. */
    const CODE_SKELETON_MIN_MS = 320;
    const codeSkeletonStartRef = React.useRef(0);
    const codeSkeletonGenRef = React.useRef(0);
    const codeSkeletonTimerRef = React.useRef<number | null>(null);
    /** The selection key whose content is currently committed in
     * `code` (set alongside every setCode in the fetch effect below).
     * Lets the pre-paint skeleton flip skip files whose content is
     * already on screen. */
    const codeForSelectionRef = React.useRef("");

    const cancelPendingCodeReveal = React.useCallback(() => {
        if (codeSkeletonTimerRef.current !== null) {
            window.clearTimeout(codeSkeletonTimerRef.current);
            codeSkeletonTimerRef.current = null;
        }
    }, []);

    const beginCodeSkeleton = React.useCallback(() => {
        // A new load invalidates the previous load's pending reveal —
        // it must never fire inside THIS skeleton window.
        cancelPendingCodeReveal();
        codeSkeletonStartRef.current = Date.now();
        codeSkeletonGenRef.current += 1;
        setCodeLoading(true);
    }, [cancelPendingCodeReveal]);

    const revealCodeWhenReady = React.useCallback(
        (reveal: () => void) => {
            const gen = codeSkeletonGenRef.current;
            const elapsed = Date.now() - (codeSkeletonStartRef.current || Date.now());
            const wait = Math.max(0, CODE_SKELETON_MIN_MS - elapsed);
            if (wait === 0) {
                reveal();
                return;
            }
            cancelPendingCodeReveal();
            codeSkeletonTimerRef.current = window.setTimeout(() => {
                codeSkeletonTimerRef.current = null;
                // A newer load began while we waited — this reveal is stale.
                if (codeSkeletonGenRef.current !== gen) return;
                reveal();
            }, wait);
        },
        [cancelPendingCodeReveal]
    );

    /** INSTANT PYTHON SKELETON — flip the loading flag IN THE SAME
     *  render as the selection change (not in the effect, which runs
     *  after a full page re-render — stale previous-file content would
     *  otherwise paint first, which read as "no skeleton on first
     *  open"). Shared by EVERY selection path (folder tree, editor
     * tabs, MRU switcher, session restore, deep links) so the
     * code-shaped skeleton always paints the very frame the selection
     * commits. Non-Python kinds skip it (their viewer owns its own
     * skeleton and clears codeLoading immediately anyway). */
    const primePythonSkeleton = React.useCallback((folderSlug: string, fileSlug: string) => {
        const kindOfTarget = foldersRef.current
            .find((c) => c.slug === folderSlug)
            ?.files.find((f) => f.slug === fileSlug)?.kind;
        const sameFile = selectedFileKeyRef.current === `${folderSlug}/${fileSlug}`;
        if (!sameFile && (!kindOfTarget || kindOfTarget === "python")) {
            beginCodeSkeleton();
        }
    }, [beginCodeSkeleton]);
    const guardedSelectFile = React.useCallback(
        (folderSlug: string, fileSlug: string, opts?: { afterSwitch?: () => void }) => {
            const sameFile =
                selectedFileKeyRef.current === `${folderSlug}/${fileSlug}`;
            const dirty = activeTabInfoRef.current.dirty || viewerDirtyRef.current;
            if (dirty && !sameFile) {
                const targetName =
                    foldersRef.current
                        .find((c) => c.slug === folderSlug)
                        ?.files.find((f) => f.slug === fileSlug)?.name ?? fileSlug;
                if (opts?.afterSwitch) pendingAfterSwitchRef.current = opts.afterSwitch;
                setPendingSwitchTab({
                    id: "",
                    toName: targetName,
                    fromName: activeTabInfoRef.current.fileName,
                    tree: {folderSlug, fileSlug},
                });
                return false;
            }
            // FILE-OPEN SPEED: prefetch at click time (deduped by the fetch
            // effects that run after the selection commits).
            prefetchFileContent(
                foldersRef.current
                    .find((c) => c.slug === folderSlug)
                    ?.files.find((f) => f.slug === fileSlug)?.kind,
                folderSlug,
                fileSlug
            );
            // INSTANT PYTHON SKELETON (see primePythonSkeleton) — flip the
            // loading flag in the same render as the selection change.
            primePythonSkeleton(folderSlug, fileSlug);
            setSelectedFolderSlug(folderSlug);
            setSelectedFileSlug(fileSlug);
            setEditorBlank(false);
            opts?.afterSwitch?.();
            return true;
        },
        []
    );


    // Fetch code when the file changes. Also auto-loads the cached run
    // result for this (folder, file) pair if the setting is enabled.
    // NOTE: this only fires for Python files. Non-Python files are
    // rendered by the FileViewer (which fetches its own content via
    // /api/file), so we skip the /api/code fetch entirely when the
    // selected file's kind is not "python" — this avoids a noisy 404
    // toast and an unnecessary round trip.
    //
    // ─── Client-side code cache (globalThis) ──────────────────────────
    // Caches the /api/code response keyed by (folder, file) so switching
    // back to a previously-opened file is instant (no server round-trip).
    // The cache is invalidated when the file is saved (handleSaveEdit
    // updates the cached content) or when the user clicks Refresh.
    const codeCacheRef = React.useRef<Map<string, CodeResponse> | null>(null);
    if (!codeCacheRef.current) {
        const g = globalThis as unknown as { __codeCache?: Map<string, CodeResponse> };
        if (!g.__codeCache) g.__codeCache = new Map();
        codeCacheRef.current = g.__codeCache;
    }
    // PERF + CORRECTNESS: the cache is now MTIME-VALIDATED. A parallel
    // map records the file's disk mtime at CACHE time; whenever the
    // folder listing refreshes (watcher, external edit, git checkout),
    // entries whose mtime moved are dropped — so revisiting a tab is
    // instant from cache, but a file that REALLY changed on disk always
    // refetches (the stale-cache-on-external-change hole).
    const codeMtimesRef = React.useRef<Map<string, number> | null>(null);
    if (!codeMtimesRef.current) {
        const g = globalThis as unknown as { __codeMtimes?: Map<string, number> };
        if (!g.__codeMtimes) g.__codeMtimes = new Map();
        codeMtimesRef.current = g.__codeMtimes;
    }
    // LRU CAP (the cache used to be an unbounded plain Map — every file
    // ever opened stayed resident). 240 entries ≈ a very large working
    // set; beyond it the LEAST-recently-USED entry evicts (with its
    // mtime twin), so memory stays flat no matter how many files are
    // browsed. Every write goes through cachePut so recency updates.
    const CODE_CACHE_MAX = 240;
    const cachePut = React.useCallback((key: string, value: CodeResponse) => {
        const cache = codeCacheRef.current;
        const mtimes = codeMtimesRef.current;
        if (!cache) return;
        if (cache.has(key)) cache.delete(key); // refresh recency
        cache.set(key, value);
        while (cache.size > CODE_CACHE_MAX) {
            const oldest = cache.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            cache.delete(oldest);
            mtimes?.delete(oldest);
        }
    }, []);
    const currentMtimeOf = React.useCallback(
        (folderSlug: string, fileSlug: string): number | undefined =>
            foldersRef.current
                .find((c) => c.slug === folderSlug)
                ?.files.find((f) => f.slug === fileSlug)
                ?.mtime,
        []
    );
    // Abort controller for the in-flight code fetch — cancels stale
    // fetches when the user switches files rapidly.
    const codeAbortRef = React.useRef<AbortController | null>(null);

    // WATCHER-DRIVEN CACHE SWEEP — every time the folder listing
    // refreshes (file watcher, manual Refresh, external edits), compare
    // every cached entry's recorded mtime with the fresh listing and
    // drop the ones that moved (or whose file vanished). Revisiting a
    // tab stays instant; changed-on-disk files always refetch.
    React.useEffect(() => {
        const mtimes = codeMtimesRef.current;
        const cache = codeCacheRef.current;
        if (!mtimes || !cache || mtimes.size === 0) return;
        let dropped = 0;
        for (const key of [...mtimes.keys()]) {
            const [folderSlug, fileSlug] = key.split("/");
            const live = foldersRef.current
                .find((c) => c.slug === folderSlug)
                ?.files.find((f) => f.slug === fileSlug);
            if (!live) {
                cache.delete(key);
                mtimes.delete(key);
                dropped++;
                continue;
            }
            const cachedAt = mtimes.get(key)!;
            if (cachedAt !== live.mtime) {
                cache.delete(key);
                mtimes.delete(key);
                dropped++;
            }
        }
        if (dropped > 0) {
            const g = globalThis as unknown as { __codePrefetch?: Map<string, unknown> };
            // Also drop the click-prefetch entry so the next open refetches.
            for (const key of [...(g.__codePrefetch?.keys() ?? [])]) {
                if (mtimes.has(key) === false && cache.has(key) === false && key.includes("/")) {
                    const [fs, fl] = key.split("/").slice(-2);
                    const live = foldersRef.current.find((c) => c.slug === fs)?.files.find((f) => f.slug === fl);
                    if (!live) g.__codePrefetch?.delete(key);
                }
            }
        }
    }, [folders]);

    // ── PRE-PAINT SKELETON FLIP (every selection path) ──────────
    // primePythonSkeleton covers the click-driven paths, but several
    // selection changes commit from EFFECTS (session restore, URL /
    // localStorage restore, tab-close neighbor activation, folder
    // auto-open). Those used to commit the new selection with
    // codeLoading still false — the first paint after the switch showed
    // the PREVIOUS file's code (or a blank editor) and the skeleton
    // only appeared a frame later, when the fetch effect below flipped
    // the flag AFTER paint ("sometimes no skeleton on first open of a
    // python file"). This LAYOUT effect flips it in the SAME commit —
    // before the browser paints — for any python-shaped target whose
    // content is not already on screen, and cancels any reveal timer
    // still pending from the previous load.
    React.useLayoutEffect(() => {
        if (!selectedFolderSlug || !selectedFileSlug) return;
        const key = `${selectedFolderSlug}/${selectedFileSlug}`;
        // Content already on screen for THIS file — nothing to load (a
        // re-select of the open file must not flash a skeleton over it).
        if (codeForSelectionRef.current === key && code != null) return;
        const kind = foldersRef.current
            .find((c) => c.slug === selectedFolderSlug)
            ?.files.find((f) => f.slug === selectedFileSlug)?.kind;
        // Python-shaped targets (or unknown kinds — folders not loaded
        // yet, e.g. a deep link) get the code-shaped skeleton; every
        // other kind is cleared immediately by the fetch effect below
        // (its FileViewer owns its own skeleton).
        if (kind && kind !== "python") return;
        beginCodeSkeleton();
        // `code` is read on purpose without being a dependency — the flip
        // only needs "is content for the NEW selection already on screen"
        // at the moment the selection changes, not on every content update.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolderSlug, selectedFileSlug, beginCodeSkeleton]);

    React.useEffect(() => {
        if (!selectedFolderSlug || !selectedFileSlug) {
            setCode(null);
            // no file open → no file to own the output panel
            // either — drop any orphaned result instead of showing the last
            // closed file's run under a file-less header.
            setRunResult(null);
            setPreviousRunResult(null);
            return;
        }
        // Find the file to check its kind. Use a ref to folders so this
        // effect doesn't re-fire when folders refreshes (which would
        // cause a duplicate /api/code fetch every time the watcher fires).
        const foldersNow = foldersRef.current;
        const file = foldersNow
            .find((c) => c.slug === selectedFolderSlug)
            ?.files.find((f) => f.slug === selectedFileSlug);
        if (file && file.kind && file.kind !== "python") {
            setCode(null);
            setCodeLoading(false);
            /* the per-file output switch lived below
         the Python-only /api/code fetch — this early return SKIPPED it
         for every non-Python file, so switching to a .java/.R/.m/.js
         file kept the PREVIOUS file's run result on screen, mislabeled
         under the new file's name. The same live-session / cached-run
         handover now runs here for every file kind. */
            const switchKey = `${selectedFolderSlug}/${selectedFileSlug}`;
            let liveSession: RunResult | null = null;
            for (const box of runSinksRef.current.values()) {
                if (box.fileKey === switchKey && box.result?.isStreaming) {
                    liveSession = {...box.result};
                }
            }
            if (!liveSession) {
                for (const b of backgroundRunsRef.current) {
                    if (b.fileKey === switchKey && b.result.isStreaming) {
                        liveSession = {...b.result};
                    }
                }
            }
            setRunResult(null);
            setPreviousRunResult(null);
            if (liveSession) {
                setRunResult(liveSession);
            } else if (settings.autoLoadCachedOutput) {
                const cachedRun = getCachedRun(selectedFolderSlug, selectedFileSlug);
                if (cachedRun) {
                    const ageSeconds = (Date.now() - cachedRun.cachedAt) / 1000;
                    const ttl = settings.cacheTtlSeconds;
                    if (ttl === 0 || ageSeconds < ttl) {
                        setRunResult({...cachedRun.result, cachedAt: cachedRun.cachedAt});
                    }
                }
            }
            return;
        }

        // Single cancellation flag for BOTH the code fetch and the cached
        // run-result load (the uncached branch used to return
        // its own cleanup early, which skipped the auto-load-cached-output
        // block entirely — the feature only worked on the second visit to
        // a file, and switching from a file with a live result to an
        // uncached file left the previous file's output on screen).
        let cancelled = false;

        // ── Client-side cache check ──────────────────────────────
        const cacheKey = `${selectedFolderSlug}/${selectedFileSlug}`;
        const cachedMtime = codeMtimesRef.current?.get(cacheKey);
        const liveMtime = currentMtimeOf(selectedFolderSlug, selectedFileSlug);
        const cacheFresh =
            cachedMtime === undefined || liveMtime === undefined || cachedMtime === liveMtime;
        const cached = cacheFresh ? codeCacheRef.current?.get(cacheKey) : undefined;
        if (cached) {
            // Content for this file is ALREADY on screen — a settings-driven
            // re-run of this effect must not flash the skeleton over it
            // (the content fetch itself is a no-op for content).
            if (codeForSelectionRef.current === cacheKey && code != null) {
                // fall through to the per-file output handover below
            } else {
                // Show the loading skeleton for the SAME minimum window as a
                // network fetch — the old synchronous setCode+setCodeLoading
                // made every re-open of an already-viewed .py file flip from
                // the previous file's code to this one with NO skeleton at all
                // (and mid-flip the two buffers' overlays could interleave).
                beginCodeSkeleton();
                revealCodeWhenReady(() => {
                    if (cancelled) return;
                    codeForSelectionRef.current = cacheKey;
                    setCode(cached);
                    setCodeLoading(false);
                });
            }
            // Still auto-load the cached run result below — but skip
            // the /api/code fetch entirely.
        } else {
            // Abort any in-flight fetch before starting a new one.
            if (codeAbortRef.current) {
                try {
                    codeAbortRef.current.abort();
                } catch { /* ignore */
                }
            }
            const controller = new AbortController();
            codeAbortRef.current = controller;

            // Start the skeleton window for THIS load (cancels any pending
            // reveal from the previous one and stamps the min-window clock).
            beginCodeSkeleton();
            const url = codeUrlFor(selectedFolderSlug, selectedFileSlug);
            // FILE-OPEN SPEED: reuse the promise the click handler's
            // prefetch started (identical URL) instead of issuing a second
            // request — the transfer already ran during the render.
            const respPromise =
                takePrefetched(url) ??
                fetch(url, {cache: "no-store", signal: controller.signal});
            respPromise
                .then((r) => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json() as Promise<CodeResponse>;
                })
                .then((data) => {
                    if (cancelled) return;
                    setCode(data);
                    // Remember WHICH selection this content belongs to — the
                    // pre-paint skeleton flip reads it to skip files whose
                    // content is already on screen.
                    codeForSelectionRef.current = cacheKey;
                    // Store in the client-side cache for instant re-access.
                    cachePut(cacheKey, data);
                    codeMtimesRef.current?.set(cacheKey, liveMtime ?? Date.now());
                    trackRecentScript(
                        selectedFolderSlug,
                        selectedFileSlug,
                        data.folder,
                        data.file
                    );
                    // ── THREE-WAY MERGE auto-open: a file whose content carries
                    // git conflict markers opens the merge editor automatically
                    // (once per file per session — the Ours/Base/Theirs columns
                    // resolve it, and "mark resolved" flows back to the buffer).
                    if (
                        typeof data.content === "string" &&
                        data.content.includes("<<<<<<<") &&
                        !mergeAutoOpenRef.current.has(cacheKey)
                    ) {
                        mergeAutoOpenRef.current.add(cacheKey);
                        setMergeTarget({fileName: data.file ?? "", content: data.content});
                    }
                    // ── Tutor-view suggestion: Getting Started files get a
                    // one-per-file hint that the visual step-through exists.
                    if (
                        settings.tutorViewSuggestions !== false &&
                        (data.folder ?? "").toLowerCase().includes("getting started") &&
                        !tutorHintRef.current.has(cacheKey)
                    ) {
                        tutorHintRef.current.add(cacheKey);
                        toast({
                            title: "Try the Tutor View",
                            description: `This is a Getting Started file — Run ▸ Run With Tutor View steps through it with the stack, heap and a narration.`,
                        });
                    }
                })
                .catch((err) => {
                    if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
                    toast({
                        title: "Failed to load code",
                        description: (err as Error).message,
                        variant: "destructive",
                    });
                })
                .finally(() => {
                    if (!cancelled) revealCodeWhenReady(() => setCodeLoading(false));
                });
        }

        // PER-FILE output. If the newly selected file has an
        // ACTIVE run session (a still-streaming primary OR a demoted
        // background run), the panel shows THAT session — live — while
        // every other run keeps streaming untouched. No waiting for the
        // "current execution" to finish.
        const switchKey = `${selectedFolderSlug}/${selectedFileSlug}`;
        let liveSession: RunResult | null = null;
        for (const box of runSinksRef.current.values()) {
            if (box.fileKey === switchKey && box.result?.isStreaming) {
                liveSession = {...box.result};
            }
        }
        if (!liveSession) {
            for (const b of backgroundRunsRef.current) {
                if (b.fileKey === switchKey && b.result.isStreaming) {
                    liveSession = {...b.result};
                }
            }
        }
        // Auto-load cached output (with timestamp) if enabled + present.
        // Always reached now — including the
        // first visit to an uncached file.
        setRunResult(null);
        setPreviousRunResult(null);
        if (liveSession) {
            setRunResult(liveSession);
        } else if (settings.autoLoadCachedOutput) {
            const cachedRun = getCachedRun(selectedFolderSlug, selectedFileSlug);
            if (cachedRun) {
                const ageSeconds = (Date.now() - cachedRun.cachedAt) / 1000;
                const ttl = settings.cacheTtlSeconds;
                if (ttl === 0 || ageSeconds < ttl) {
                    const figures = cachedRun.result.figures ?? [];
                    if (figures.length > 0) {
                        (async () => {
                            try {
                                const head = await fetch(figures[0].url, {method: "HEAD"});
                                if (!head.ok) {
                                    cachedRun.result.figures = [];
                                    cachedRun.result.dataframes = [];
                                }
                            } catch { /* keep figures */
                            }
                            if (!cancelled) {
                                setRunResult({...cachedRun.result, cachedAt: cachedRun.cachedAt});
                            }
                        })();
                    } else {
                        if (!cancelled) {
                            setRunResult({...cachedRun.result, cachedAt: cachedRun.cachedAt});
                        }
                    }
                }
            }
        }
        return () => {
            cancelled = true;
        };
    }, [selectedFolderSlug, selectedFileSlug, toast, settings.autoLoadCachedOutput, settings.cacheTtlSeconds]);

    /* the folderReadme state + /api/folder-readme fetch were
   *  REMOVED — README.md is listed as a normal file in the folder tree
   *  (kind "markdown") and renders in the FileViewer like any other
   *  .md file. No special folder-intro card above the code anymore. */

    /* ---------------------------------------------------------------- */
    /*  Derived (must be defined before handleRun, which references them) */
    /* ---------------------------------------------------------------- */
    const selectedFolder = folders.find((c) => c.slug === selectedFolderSlug);
    const selectedFile = selectedFolder?.files.find(
        (f) => f.slug === selectedFileSlug
    );
    // True when the selected file is a Python file (or when no kind is
    // set — backwards compat for older folder data). Used to gate the
    // Output/Diagnostics/Notes tabs (hidden for non-Python files).
    const isPythonFile = !selectedFile?.kind || selectedFile.kind === "python";
    // when a NON-Python file is selected while a Python-only
    // bottom tab (output / diag / tests) is active, fall back to the
    // Terminal tab. Notes / TODOs / Terminal — and Git Diff when the repo
    // is dirty — are file-kind-agnostic and stay available for any open
    // file — exactly that set for non-Python files.
    React.useEffect(() => {
        // The non-Python allow-list shrank to
        // Notes + Terminal — TODOs and Git Diff now also hand over when a
        // non-Python file is opened.
        // The hand-over goes to NOTES first (the tab
        // that actually matters for non-Python files), falling back to the
        // Terminal when script notes are disabled in Settings → Editor.
        // RUNNABLE non-Python files (js / ts / matlab / r /
        // shell / java / c / cpp) keep the OUTPUT tab — their runs stream
        // there exactly like Python's; only the python-ONLY tabs hand over.
        const runnable = isRunnableKind(selectedFile?.kind);
        // "background" (the Background Runs tab) is NEVER handed
        // over — demoted runs keep streaming regardless of which file is
        // open (that's the whole point of the tab).
        if (
            !isPythonFile &&
            !runnable &&
            ["output", "diag", "tests", "console", "plots", "variables", "replay", "tutor"].includes(bottomTab)
        ) {
            setBottomTab(settings.enableScriptNotes ? "notes" : "terminal");
        } else if (
            !isPythonFile &&
            runnable &&
            ["diag", "tests", "console", "plots", "variables", "replay", "tutor"].includes(bottomTab)
        ) {
            setBottomTab("output");
        }
    }, [isPythonFile, selectedFile?.kind, bottomTab, settings.enableScriptNotes]);
    /* ── AUTO-HIDE the output area for non-executable preview files
*. Nothing can EVER run for
* image / video / audio / pdf kinds, so the bottom panel would only
* waste editor space — it collapses itself the moment such a file
* opens (unless the TERMINAL is frontmost — an in-use terminal
* stays), and restores itself when the user switches back to an
* executable file. The restore only fires for panels THIS auto-hide
* collapsed (the autoHiddenOutputRef guard) — a panel the user
* closed by hand stays closed, and a panel the user re-opens by
* hand while a preview file is showing stays open (the effect only
* reacts to FILE switches, reading panel state through refs). */
    const autoHiddenOutputRef = React.useRef(false);
    React.useEffect(() => {
        const kind = selectedFile?.kind ?? "python";
        const previewOnly = kind === "image" || kind === "video" || kind === "audio" || kind === "pdf";
        if (previewOnly) {
            if (bottomPanelOpenRef.current && bottomTabRef.current !== "terminal") {
                setBottomPanelOpen(false);
                autoHiddenOutputRef.current = true;
            }
        } else if (autoHiddenOutputRef.current) {
            // Back on an executable / editable file — restore what the
            // auto-hide collapsed (never a user-closed panel). With the
            // panel now COLLAPSED BY DEFAULT, restoring means returning to
            // the collapsed default (the code viewer keeps the vertical
            // space); the user opens it explicitly when wanted.
            autoHiddenOutputRef.current = false;
            setBottomPanelOpen(false);
        }
    }, [selectedFile?.kind, selectedFileSlug]);
    /* ── ACTIVE-FILE GIT FOCUS — while the Git Diff tab is the ACTIVE bottom tab, every
* file selection dispatches `praxis:git-diff-active` with the
* open file's slugs; the panel resolves the repo-relative path
* (POST /api/git-command resolveActive) and focuses that entry
* (clean files show "no changes", untracked ones show the
* all-added diff). Dispatching only while the tab is VISIBLE keeps
* manual browsing of other entries intact while the tab is open —
* and the panel is force-mounted, so the listener is always live. */
    React.useEffect(() => {
        if (bottomTab !== "gitdiff" || !selectedFolderSlug || !selectedFileSlug) return;
        window.dispatchEvent(
            new CustomEvent("praxis:git-diff-active", {
                detail: {folderSlug: selectedFolderSlug, fileSlug: selectedFileSlug},
            })
        );
    }, [bottomTab, selectedFolderSlug, selectedFileSlug]);
    // true when EVERY editor tab is closed (Close all, or
    // closing the last tab one-by-one). The workspace then renders as a
    // SOLID BLANK area — no output panel, no folder README card, no
    // "No file selected" empty-state, no stdin/args panel: closing every
    // tab leaves a solid blank screen until another file opens (no
    // output, no Test Folder README, nothing). The sidebar / menu bar /
    // toolbar stay (IDE chrome); the moment a file is opened, editorBlank flips back to
    // false and the normal layout returns.
    // the formula no longer keys on `editorBlank` alone — it
    // is now "no open tab AND no selected file". The old form left a
    // fresh session (empty project, or first launch before any file is
    // picked) rendering the "No file selected" area WITH the Output
    // panel beneath it — the user saw the output view "appear out of
    // nowhere" while creating their first file. Any state with nothing
    // open now gets the guided welcome card instead, exactly like the
    // post-Close-all state. `editorBlank` itself is still used to stop
    // the auto-select effect from re-opening files[0] after Close-all.
    const workspaceBlank = openTabs.length === 0 && !selectedFileSlug;
    // Count of files with uncommitted git changes — drives the "●N"
    // badge in the Footer's git chip. Derived from gitStatusMap (which
    // only contains entries for modified/untracked files — clean files
    // aren't included), so the count is just the map's size.
    const gitDirtyCount = Object.keys(gitStatusMap).length;

    // Fall back to the Output tab when the Git Diff tab is no longer
    // available — i.e. after a commit (or any other action) clears all
    // uncommitted changes while the user is sitting on the gitdiff tab.
    // Without this, Radix Tabs would have a `value` with no matching
    // TabsContent (the Git Diff trigger + content are both gated on
    // gitDirtyCount > 0), which leaves the panel blank.
    // NOTE: declared after `gitDirtyCount` (above) to avoid TDZ — this
    // effect reads it, so the const must already be initialized.
    React.useEffect(() => {
        if (bottomTab === "gitdiff" && gitDirtyCount === 0) {
            setBottomTab("output");
        }
    }, [bottomTab, gitDirtyCount]);

    /* ---------------------------------------------------------------- */
    /* Plots — the persistent cross-run gallery */
    /* ---------------------------------------------------------------- */
    // Every matplotlib figure/animation that streams in from ANY run
    // (primary or split/background) is appended here and persisted to
    // localStorage (capped at 60, newest first). On restore the URLs are
    // HEAD-checked — run temp dirs are ephemeral, so dead entries are
    // dropped instead of rendering broken images (same pattern as the
    // run-history figure cache at the top of this file).
    // Declared BEFORE the run handlers — doRun/handleRunCell mirror
    // figures into the gallery via addPlot.
    const [plotGallery, setPlotGallery] = React.useState<PlotEntry[]>([]);
    const PLOTS_KEY = "praxis.plots";
    // One-time migration from the older key (state is preserved).
    const PLOTS_LEGACY_KEY = "praxis.plots.v1";
    const PLOTS_CAP = 60;
    React.useEffect(() => {
        void (async () => {
            try {
                let raw = window.localStorage.getItem(PLOTS_KEY);
                if (!raw) {
                    raw = window.localStorage.getItem(PLOTS_LEGACY_KEY);
                    if (raw) window.localStorage.setItem(PLOTS_KEY, raw);
                }
                if (!raw) return;
                const restored = JSON.parse(raw) as PlotEntry[];
                if (!Array.isArray(restored) || restored.length === 0) return;
                // Validate each URL with a HEAD request; keep only live ones.
                const alive: PlotEntry[] = [];
                for (const p of restored.slice(0, PLOTS_CAP)) {
                    try {
                        const res = await fetch(p.url, {method: "HEAD"});
                        if (res.ok) alive.push(p);
                    } catch { /* dead — drop */
                    }
                }
                setPlotGallery(alive);
                if (alive.length !== restored.length) {
                    window.localStorage.setItem(PLOTS_KEY, JSON.stringify(alive));
                }
            } catch { /* corrupted — start empty */
            }
        })();
    }, []);
    const addPlot = React.useCallback(
        (entry: { url: string; name: string; fileName: string; runId: string; interactiveUrl?: string }) => {
            const id = `${entry.runId}::${entry.name}`;
            setPlotGallery((prev) => {
                if (prev.some((p) => p.id === id)) return prev;
                const next = [
                    {
                        id,
                        url: entry.url,
                        name: entry.name,
                        fileName: entry.fileName,
                        runId: entry.runId,
                        capturedAt: Date.now(),
                        interactiveUrl: entry.interactiveUrl
                    },
                    ...prev,
                ].slice(0, PLOTS_CAP);
                try {
                    window.localStorage.setItem(PLOTS_KEY, JSON.stringify(next));
                } catch { /* storage */
                }
                return next;
            });
        },
        []
    );
    const removePlot = React.useCallback((id: string) => {
        setPlotGallery((prev) => {
            const next = prev.filter((p) => p.id !== id);
            try {
                window.localStorage.setItem(PLOTS_KEY, JSON.stringify(next));
            } catch { /* storage */
            }
            return next;
        });
    }, []);
    const clearPlots = React.useCallback(() => {
        setPlotGallery([]);
        try {
            window.localStorage.removeItem(PLOTS_KEY);
        } catch { /* storage */
        }
    }, []);

    /* ---------------------------------------------------------------- */
    /*  Run handler — SSE streaming  with stop  + stdin    */
    /* ---------------------------------------------------------------- */
    /** The actual run (SSE stream + state updates). Called either directly
     *  by handleRun (after the duration check passes) or by the warning
     *  dialog's "Proceed" button. */
        // ─── one-shot run overrides ────────────────────────────
        // Set by "Run with… interpreter" (explorer) or "Run Selection in
        // Python" (editor); doRun folds it into the /api/run body and clears
        // it. A ref (not state) so doRun's deps stay unchanged.
    const runOverrideRef = React.useRef<{ interpreter?: string; code?: string } | null>(null);

    const doRun = React.useCallback(async () => {
        if (!selectedFolderSlug || !selectedFileSlug) return;

        // the language for THIS file kind — python keeps the
        // full pipeline; every other runnable kind goes through the
        // runtime registry on the server.
        const runLanguage = runLanguageForKind(selectedFileKindRef.current) ?? "python";
        if (runLanguage !== "python") {
            const ok = runtimeOkForLanguage(runLanguage);
            if (ok === false) {
                const rt = runtimeStatuses?.find((r) => r.languages.includes(runLanguage));
                toast({
                    title: `${RUNTIME_LABEL_BY_LANGUAGE[runLanguage] ?? runLanguage} is not installed`,
                    description: rt?.installHint ?? `Install a ${RUNTIME_LABEL_BY_LANGUAGE[runLanguage] ?? runLanguage} runtime to run this file.`,
                    variant: "destructive",
                });
                return;
            }
            if (runLanguage === "matlab") {
                toast({
                    title: "MATLAB run starting",
                    description: "MATLAB batch mode can take 30 s or more to start — the run is not stuck. GNU Octave (when installed) starts in a second.",
                });
            }
        }

        // parallel runs: demote the still-streaming primary to
        // a background group (no-op when idle), and drop finished
        // background groups so each "run session" starts clean.
        if (isRunningRef.current) {
            demoteCurrentRun();
        } else {
            setBackgroundRuns([]);
        }

        // Move the previous result into the diff slot before starting fresh.
        if (runResult && !runResult.isStreaming) {
            setPreviousRunResult(runResult);
        }

        // The per-run sink box — flips to "background" if an even newer
        // run demotes THIS one while it streams.
        const sinkKey = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        // the sink is keyed to the FILE it runs — see the note
        // at selectedFileKeyRef.
        const sinkFileKey = `${selectedFolderSlug}/${selectedFileSlug}`;
        const sinkBox: RunSinkBox = {mode: "primary", key: sinkKey, fileKey: sinkFileKey};
        runSinksRef.current.set(sinkKey, sinkBox);
        // per-file running state — the Output panel of THIS file
        // (and only this file) shows the live “Running…” view.
        markFileRunStart(sinkFileKey);
        primarySinkKeyRef.current = sinkKey;
        primaryRunInfoRef.current = {
            folderName: selectedFolder?.name ?? "",
            fileName: selectedFile?.name ?? "",
            startedAt: Date.now(),
        };
        /* PERF: SSE-COALESCE — one setRunResult per stdout/stderr chunk
     * re-rendered the ENTIRE page per line of output (and churned
     * doRun/handleRun identities into the watcher effects). Streaming
     * chunks now land in a 120 ms coalescing window (the LAST chunk in
     * the window wins); terminal updates flush immediately so "done"
     * never lags. */
        let sinkPending: RunResult | null = null;
        let sinkTimer: number | null = null;
        const sinkApply = (r: RunResult) => {
            const isSelected = sinkBox.fileKey === selectedFileKeyRef.current;
            if (sinkBox.mode === "primary") {
                if (isSelected) setRunResult(r);
            } else {
                setBackgroundRuns((prev) =>
                    prev.map((b) => (b.key === sinkKey ? {...b, result: r} : b))
                );
                if (isSelected) setRunResult(r);
            }
        };
        const sinkUpdate = (r: RunResult) => {
            sinkBox.result = r;
            if (!r.isStreaming) {
                if (sinkTimer !== null) {
                    window.clearTimeout(sinkTimer);
                    sinkTimer = null;
                }
                sinkPending = null;
                sinkApply(r);
                return;
            }
            if (sinkTimer !== null) {
                sinkPending = r;
                return;
            }
            sinkApply(r);
            sinkTimer = window.setTimeout(() => {
                sinkTimer = null;
                const p = sinkPending;
                sinkPending = null;
                if (p) sinkApply(p);
            }, 120);
        };

        setIsRunning(true);
        if (sinkBox.fileKey === selectedFileKeyRef.current) {
            setRunResult({
                ok: false,
                stdout: "",
                stderr: "",
                isStreaming: true,
                figures: [],
            });
        }
        setCurrentRunId(null);

        const runStartedAt = Date.now();
        const accumulated: RunResult = {
            ok: false,
            stdout: "",
            stderr: "",
            figures: [],
            isStreaming: true,
        };

        try {
            // Parse args + env from the inputs.
            const args = argsText.trim()
                ? argsText.trim().split(/\s+/)
                : undefined;
            const env: Record<string, string> | undefined = envText.trim()
                ? Object.fromEntries(
                    envText
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((l) => {
                            const idx = l.indexOf("=");
                            return idx >= 0
                                ? [l.slice(0, idx).trim(), l.slice(idx + 1)]
                                : [l, ""];
                        })
                )
                : undefined;

            // abortable fetch — Stop can break a request that
            // is stuck before the start event (dev-mode route compilation,
            // hung proxy, server restart).
            const controller = new AbortController();
            runAbortControllersRef.current.set(sinkKey, controller);
            const res = await fetch("/api/run", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                signal: controller.signal,
                body: JSON.stringify({
                    folder: selectedFolderSlug,
                    file: selectedFileSlug,
                    // the language routing (python → the legacy
                    // pipeline; everything else → the runtime registry).
                    language: runLanguage,
                    stdin: stdinText || undefined,
                    args,
                    env,
                    // Python-only extras are skipped for other languages.
                    ...(runLanguage === "python" ? {
                        inspectVariables: captureOverrideRef.current.inspectVariables ?? settings.inspectVariables,
                        captureDataframes: captureOverrideRef.current.captureDataframes ?? settings.captureDataframes,
                        traceCoverage: captureOverrideRef.current.traceCoverage ?? settings.traceCoverage,
                        interpreter: settings.pythonInterpreter || undefined,
                    } : {}),
                    // Honor the runTimeoutSeconds + maxOutputBytes settings.
                    runTimeoutSeconds: settings.runTimeoutSeconds,
                    maxOutputBytes: settings.maxOutputBytes,
                    // keep stdin open so /api/run-input can
                    // answer input prompts live (Settings → Advanced → Run).
                    interactive: settings.interactiveStdin !== false,
                    // one-shot run overrides — {interpreter} from
                    // "Run with…" and {code} from "Run Selection". Cleared as
                    // soon as the body is serialized.
                    ...(runOverrideRef.current ?? {}),
                }),
            });
            runOverrideRef.current = null;

            // Reset one-shot overrides after the fetch fires.
            setCaptureOverride({});

            if (!res.ok || !res.body) {
                const text = await res.text().catch(() => "");
                throw new Error(`HTTP ${res.status}: ${text}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let runId: string | null = null;
            const figures: Figure[] = [];

            const flushEvent = (raw: string) => {
                if (!raw.startsWith("data: ")) return;
                try {
                    const evt = JSON.parse(raw.slice(6)) as {
                        type: string;
                        [k: string]: unknown;
                    };
                    if (evt.type === "start") {
                        runId = evt.runId as string;
                        sinkBox.runId = runId;
                        // the selected file's Stop button + stdin row
                        // need the runId as soon as it exists.
                        markFileRunId(sinkFileKey, runId);
                        if (sinkBox.mode === "primary") setCurrentRunId(runId);
                        else if (runId) {
                            setBackgroundRuns((prev) =>
                                prev.map((b) => (b.key === sinkKey ? {...b, runId} : b))
                            );
                        }
                        accumulated.interpreter = evt.interpreter as string;
                    } else if (evt.type === "stdout") {
                        accumulated.stdout += evt.text as string;
                        sinkUpdate({...accumulated, isStreaming: true});
                    } else if (evt.type === "stderr") {
                        accumulated.stderr += evt.text as string;
                        sinkUpdate({...accumulated, isStreaming: true});
                    } else if (evt.type === "figure") {
                        figures.push({
                            url: evt.url as string,
                            name: evt.name as string,
                            interactiveUrl: evt.interactiveUrl as string | undefined,
                        });
                        accumulated.figures = [...figures];
                        sinkUpdate({...accumulated, isStreaming: true});
                        // mirror the figure into the persistent
                        // Plots gallery (runs immediately — no need to wait for
                        // the run to finish; the card shows while it streams).
                        if (runId) {
                            addPlot({
                                url: evt.url as string,
                                name: evt.name as string,
                                fileName: selectedFile?.name ?? "script",
                                runId,
                                interactiveUrl: evt.interactiveUrl as string | undefined,
                            });
                        }
                    } else if (evt.type === "dataframe") {
                        const dfs = accumulated.dataframes ?? [];
                        dfs.push({
                            url: evt.url as string,
                            name: evt.name as string,
                            dfName: evt.dfName as string | undefined,
                            shape: evt.shape as number[] | undefined,
                            dtype: evt.dtype as string | undefined,
                        });
                        accumulated.dataframes = dfs;
                        sinkUpdate({...accumulated, isStreaming: true});
                    } else if (evt.type === "error") {
                        accumulated.error = evt.message as string;
                        accumulated.stderr += `\n${evt.message}\n`;
                        sinkUpdate({...accumulated, isStreaming: true});
                    } else if (evt.type === "end") {
                        accumulated.ok = !!evt.ok;
                        accumulated.exitCode = evt.exitCode as number;
                        accumulated.durationMs = evt.durationMs as number;
                        accumulated.truncated = !!evt.truncated;
                        accumulated.killed = !!evt.killed;
                        // (timeout flag): the server sends an explicit
                        // `timedOut` on the end event (api/run/route.ts) but the
                        // client NEVER copied it — detection relied solely on the
                        // stderr-marker sniff. Honor the flag FIRST, keep the sniff
                        // (isTimeoutRun) as the fallback for older/cached results
                        // where only the marker line exists. Output-panel's "Timed
                        // out" vs "Stopped" pill and the run history both read this.
                        accumulated.timedOut =
                            evt.timedOut === true ||
                            isTimeoutRun(accumulated.stderr, accumulated.error);
                        accumulated.isStreaming = false;
                        accumulated.figures = figures;
                        // Pull optional metadata from the end event.
                        // Note: for dataframes, prefer the SSE-emitted dataframe events
                        // (which carry `url`) over the end event's metadata array
                        // (which carries `html_file` instead). Only fall back to the
                        // end event's dataframes if no SSE events were captured.
                        accumulated.variables = (evt.variables as VariableEntry[] | undefined) ?? undefined;
                        accumulated.coverage = (evt.coverage as CoverageMap | undefined) ?? undefined;
                        if ((!accumulated.dataframes || accumulated.dataframes.length === 0) && evt.dataframes) {
                            accumulated.dataframes = (evt.dataframes as Array<{
                                html_file: string;
                                name: string;
                                shape: number[];
                                dtype: string;
                            }>).map((d) => ({
                                url: `/api/figure/${runId}/${encodeURIComponent(d.html_file)}`,
                                name: d.html_file,
                                dfName: d.name,
                                shape: d.shape,
                                dtype: d.dtype,
                            }));
                        }
                        accumulated.tests = (evt.tests as string[] | undefined) ?? undefined;
                        sinkUpdate({...accumulated});

                        // Cache the result so re-selecting the script shows its
                        // last output with a "cached · Xs ago" pill.
                        cacheRun({
                            folderSlug: selectedFolderSlug,
                            fileSlug: selectedFileSlug,
                            folderName: selectedFolder?.name ?? "",
                            fileName: selectedFile?.name ?? "",
                            result: accumulated,
                        });

                        // Push to history.
                        const entry: HistoryEntry = {
                            id: runId ?? `${Date.now()}-${Math.random()}`,
                            startedAt: runStartedAt,
                            folder: selectedFolder?.name ?? "",
                            file: selectedFile?.name ?? "",
                            // ── rerun context (the ▶ button / PRAXIS_RERUN_RUN read
                            // these; older entries without them fall back to the
                            // name lookup) ──
                            folderSlug: selectedFolderSlug,
                            fileSlug: selectedFileSlug,
                            interpreter: settings.pythonInterpreter || undefined,
                            args: argsText.trim() ? argsText.trim().split(/\s+/) : undefined,
                            ok: accumulated.ok,
                            exitCode: accumulated.exitCode ?? 0,
                            durationMs: accumulated.durationMs ?? 0,
                            stdout: accumulated.stdout,
                            stderr: accumulated.stderr,
                            figures: accumulated.figures,
                            truncated: !!accumulated.truncated,
                            killed: !!accumulated.killed,
                        };
                        setHistory((prev) => {
                            const next = [entry, ...prev].slice(0, settings.historyMaxEntries || 25);
                            saveHistory(next);
                            return next;
                        });

                        // browser notification when the run ends
                        // while the IDE tab is hidden (Settings → Run → “Notify when
                        // a run finishes”; respects runNotifyMode / runNotifyOnFailure).
                        // …plus the Web-Audio chime (Settings → Python,
                        // same gating, no browser permission needed).
                        const runAlertInfo: RunNotifyInfo = {
                            fileName: selectedFile?.name ?? "script",
                            folderName: selectedFolder?.name,
                            ok: accumulated.ok,
                            killed: !!accumulated.killed,
                            durationMs: accumulated.durationMs ?? 0,
                        };
                        notifyRunFinished(runAlertInfo);
                        playRunChime(runAlertInfo);

                        // Toast feedback.
                        if (accumulated.killed) {
                            toast({
                                title: "Run stopped",
                                description: `Killed after ${((accumulated.durationMs ?? 0) / 1000).toFixed(1)}s`,
                            });
                        } else if (accumulated.error && accumulated.exitCode === -1) {
                            toast({
                                title: "Could not start Python",
                                description: accumulated.error,
                                variant: "destructive",
                            });
                        } else if (!accumulated.ok) {
                            toast({
                                title: "Run failed",
                                description: `Exit code ${accumulated.exitCode ?? "?"}`,
                                variant: "destructive",
                            });
                        } else if (accumulated.stderr.trim()) {
                            toast({
                                title: "Ran with warnings",
                                description: figures.length
                                    ? `${figures.length} figure${figures.length === 1 ? "" : "s"} captured · see Figures tab`
                                    : "Script printed to stderr",
                            });
                        } else {
                            toast({
                                title: "Run complete",
                                description: figures.length
                                    ? `${(accumulated.durationMs ?? 0) / 1000}s · ${figures.length} figure${figures.length === 1 ? "" : "s"}`
                                    : `Finished in ${(accumulated.durationMs ?? 0) / 1000}s`,
                            });
                        }
                    }
                } catch {
                    /* ignore JSON parse errors on partial chunks */
                }
            };

            // Read SSE chunks. Lines are separated by \n\n (event boundary).
            // Within a chunk, lines start with "data: ".
            while (true) {
                const {done, value} = await reader.read();
                noteSseBytes(value?.byteLength ?? 0);
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";
                for (const part of parts) {
                    const lines = part.split("\n");
                    for (const line of lines) {
                        if (line.startsWith("data: ")) flushEvent(line);
                    }
                }
            }
        } catch (err) {
            // distinguish user-initiated aborts from genuine
            // network errors — the old catch showed "Network error" for a
            // plain Stop, and BLANKED the partial stdout by replacing the
            // result object instead of updating `accumulated`.
            const aborted = stopInitiatedRef.current || (err as Error).name === "AbortError";
            if (aborted) {
                accumulated.isStreaming = false;
                accumulated.killed = true;
                sinkUpdate({...accumulated});
            } else {
                accumulated.ok = false;
                accumulated.isStreaming = false;
                accumulated.stderr += `\nNetwork error: ${(err as Error).message}\n`;
                sinkUpdate({...accumulated});
                toast({
                    title: "Network error",
                    description: (err as Error).message,
                    variant: "destructive",
                });
            }
        } finally {
            runSinksRef.current.delete(sinkKey);
            runAbortControllersRef.current.delete(sinkKey);
            // this file's run session is over — its Output panel
            // flips to the finished view (other files were never affected).
            markFileRunEnd(sinkFileKey);
            if (sinkBox.mode === "primary") {
                primarySinkKeyRef.current = null;
                primaryRunInfoRef.current = null;
                // HEAL a run that ended without an "end" event —
                // stream broken by a server restart / dropped connection: the
                // Output panel used to show "Running…" forever while the Run
                // button state had already cleared
                // saying running scripts without completion").
                if (accumulated.isStreaming) {
                    accumulated.isStreaming = false;
                    if (stopInitiatedRef.current) {
                        accumulated.killed = true;
                    } else {
                        accumulated.stderr +=
                            "\n[praxis] The run stream ended without a completion event (the server may have restarted or the connection dropped).\n";
                    }
                    sinkUpdate({...accumulated});
                }
                setIsRunning(false);
                setCurrentRunId(null);
                stopInitiatedRef.current = false;
            }
        }
    }, [
        runtimeStatuses, runtimeOkForLanguage, toast,
        selectedFolderSlug,
        selectedFileSlug,
        stdinText,
        argsText,
        envText,
        settings,
        runResult,
        selectedFolder,
        selectedFile,
        toast,
        demoteCurrentRun,
        addPlot,
        markFileRunStart,
        markFileRunId,
        markFileRunEnd,
    ]);

    /** User-facing Run handler. Estimates the run duration from history
     * + static analysis; if the estimate exceeds the * `runDurationWarningThreshold` setting, shows a confirmation dialog
     * before actually running. Otherwise runs immediately. */
    const handleRun = React.useCallback(() => {
        if (!selectedFolderSlug || !selectedFileSlug) return;
        // Apply the default run mode (Settings → Advanced). This is
        // a one-shot pre-set: each click of the bare Run button starts
        // fresh, so the default is applied every time. The Run
        // options dropdown items still set their own one-shot overrides
        // which take precedence when explicitly chosen.
        if (settings.defaultRunMode === "coverage") setTraceCoverageOverride(true);
        // (Sandbox mode was removed — see comment near the Run dropdown.)
        // Auto-switch to the Output tab when a run starts (Settings →
        // Advanced). Done here (not inside doRun) so the switch happens
        // immediately on click rather than after the SSE stream connects.
        // the panel also OPENS (a.js /.ts /.m /.sh /.c run
        // on a closed panel used to stream invisibly — same fix applies to
        // Python: no more silent runs).
        if (settings.autoSwitchToOutputOnRun) {
            setBottomTab("output");
            setBottomPanelOpen(true);
        }
        const threshold = settings.runDurationWarningThreshold;
        if (threshold <= 0) {
            // Warning disabled — run immediately.
            void doRun();
            return;
        }
        // Build the estimate.
        const pastDurationsMs = history
            .filter((h) => h.folder === selectedFolder?.name && h.file === selectedFile?.name)
            .map((h) => h.durationMs);
        const estimate = estimateRunDuration({
            source: code?.content ?? "",
            pastDurationsMs,
        });
        if (estimate.estimatedMs > threshold * 1000) {
            // Show the warning dialog. The actual run is deferred to the
            // dialog's "Proceed" button.
            setDurationWarning(estimate);
            setPendingRunFn(() => () => {
                setDurationWarning(null);
                setPendingRunFn(null);
                void doRun();
            });
            return;
        }
        void doRun();
    }, [
        selectedFolderSlug,
        selectedFileSlug,
        selectedFolder,
        selectedFile,
        code,
        history,
        settings.runDurationWarningThreshold,
        settings.defaultRunMode,
        settings.autoSwitchToOutputOnRun,
        doRun,
    ]);

    /* ---------------------------------------------------------------- */
    /*  Run cell handler — runs only a line range of the current script */
    /* ---------------------------------------------------------------- */
    const handleRunCell = React.useCallback(
        async (startLine: number, endLine: number) => {
            if (!selectedFolderSlug || !selectedFileSlug) return;
            // parallel runs: a cell run while a whole-file run is
            // still streaming demotes it to a background group (same as doRun).
            if (isRunningRef.current) {
                demoteCurrentRun();
            } else {
                setBackgroundRuns([]);
            }
            const sinkKey = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            // per-file sink (see selectedFileKeyRef) — cell runs
            // follow the selection exactly like whole-file runs.
            const sinkFileKey = `${selectedFolderSlug}/${selectedFileSlug}`;
            const sinkBox: RunSinkBox = {mode: "primary", key: sinkKey, fileKey: sinkFileKey};
            runSinksRef.current.set(sinkKey, sinkBox);
            // per-file running state (see doRun).
            markFileRunStart(sinkFileKey);
            primarySinkKeyRef.current = sinkKey;
            primaryRunInfoRef.current = {
                folderName: selectedFolder?.name ?? "",
                fileName: selectedFile?.name ?? "",
                startedAt: Date.now(),
            };
            /* PERF: SSE-COALESCE (same as doRun's sink) — streaming chunks
       * batch into a 120 ms window instead of one page render per line. */
            let sinkPending: RunResult | null = null;
            let sinkTimer: number | null = null;
            const sinkApply = (r: RunResult) => {
                const isSelected = sinkBox.fileKey === selectedFileKeyRef.current;
                if (sinkBox.mode === "primary") {
                    if (isSelected) setRunResult(r);
                } else {
                    setBackgroundRuns((prev) =>
                        prev.map((b) => (b.key === sinkKey ? {...b, result: r} : b))
                    );
                    if (isSelected) setRunResult(r);
                }
            };
            const sinkUpdate = (r: RunResult) => {
                sinkBox.result = r;
                if (!r.isStreaming) {
                    if (sinkTimer !== null) {
                        window.clearTimeout(sinkTimer);
                        sinkTimer = null;
                    }
                    sinkPending = null;
                    sinkApply(r);
                    return;
                }
                if (sinkTimer !== null) {
                    sinkPending = r;
                    return;
                }
                sinkApply(r);
                sinkTimer = window.setTimeout(() => {
                    sinkTimer = null;
                    const p = sinkPending;
                    sinkPending = null;
                    if (p) sinkApply(p);
                }, 120);
            };
            setIsRunning(true);
            if (sinkBox.fileKey === selectedFileKeyRef.current) {
                setRunResult({
                    ok: false,
                    stdout: "",
                    stderr: "",
                    isStreaming: true,
                    figures: [],
                });
            }
            setCurrentRunId(null);
            const runStartedAt = Date.now();
            const accumulated: RunResult = {
                ok: false,
                stdout: "",
                stderr: "",
                figures: [],
                isStreaming: true,
            };
            try {
                // abortable cell-run fetch (same as doRun).
                const controller = new AbortController();
                runAbortControllersRef.current.set(sinkKey, controller);
                const res = await fetch("/api/run", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    signal: controller.signal,
                    body: JSON.stringify({
                        folder: selectedFolderSlug,
                        file: selectedFileSlug,
                        runCell: {start: startLine, end: endLine},
                        inspectVariables: captureOverrideRef.current.inspectVariables ?? settings.inspectVariables,
                        captureDataframes: captureOverrideRef.current.captureDataframes ?? settings.captureDataframes,
                        traceCoverage: captureOverrideRef.current.traceCoverage ?? settings.traceCoverage,
                        interpreter: settings.pythonInterpreter || undefined,
                        runTimeoutSeconds: settings.runTimeoutSeconds,
                        maxOutputBytes: settings.maxOutputBytes,
                    }),
                });
                if (!res.ok || !res.body) {
                    const text = await res.text().catch(() => "");
                    throw new Error(`HTTP ${res.status}: ${text}`);
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let runId: string | null = null;
                const figures: Figure[] = [];
                while (true) {
                    const {done, value} = await reader.read();
                    noteSseBytes(value?.byteLength ?? 0);
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() ?? "";
                    for (const part of parts) {
                        for (const line of part.split("\n")) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const evt = JSON.parse(line.slice(6)) as {
                                    type: string;
                                    [k: string]: unknown;
                                };
                                if (evt.type === "start") {
                                    runId = evt.runId as string;
                                    sinkBox.runId = runId;
                                    // per-file runId mirror (Stop + stdin row).
                                    markFileRunId(sinkFileKey, runId);
                                    if (sinkBox.mode === "primary") setCurrentRunId(runId);
                                    else if (runId) {
                                        setBackgroundRuns((prev) =>
                                            prev.map((b) => (b.key === sinkKey ? {...b, runId} : b))
                                        );
                                    }
                                } else if (evt.type === "stdout") {
                                    accumulated.stdout += evt.text as string;
                                    sinkUpdate({...accumulated, isStreaming: true});
                                } else if (evt.type === "stderr") {
                                    accumulated.stderr += evt.text as string;
                                    sinkUpdate({...accumulated, isStreaming: true});
                                } else if (evt.type === "figure") {
                                    figures.push({
                                        url: evt.url as string,
                                        name: evt.name as string,
                                    });
                                    accumulated.figures = [...figures];
                                    sinkUpdate({...accumulated, isStreaming: true});
                                    // mirror into the Plots gallery.
                                    if (runId) {
                                        addPlot({
                                            url: evt.url as string,
                                            name: evt.name as string,
                                            fileName: selectedFile?.name ?? "script",
                                            runId,
                                        });
                                    }
                                } else if (evt.type === "dataframe") {
                                    const dfs = accumulated.dataframes ?? [];
                                    dfs.push({
                                        url: evt.url as string,
                                        name: evt.name as string,
                                        dfName: evt.dfName as string | undefined,
                                        shape: evt.shape as number[] | undefined,
                                        dtype: evt.dtype as string | undefined,
                                    });
                                    accumulated.dataframes = dfs;
                                    sinkUpdate({...accumulated, isStreaming: true});
                                } else if (evt.type === "end") {
                                    accumulated.ok = !!evt.ok;
                                    accumulated.exitCode = evt.exitCode as number;
                                    accumulated.durationMs = evt.durationMs as number;
                                    // (timeout flag): mirror the primary-run end
                                    // handler — honor the end event's explicit timedOut
                                    // flag, with the stderr-marker sniff (isTimeoutRun) as
                                    // the backwards-compatible fallback.
                                    accumulated.timedOut =
                                        evt.timedOut === true ||
                                        isTimeoutRun(accumulated.stderr, accumulated.error);
                                    accumulated.isStreaming = false;
                                    accumulated.figures = figures;
                                    accumulated.variables = (evt.variables as VariableEntry[] | undefined) ?? undefined;
                                    accumulated.coverage = (evt.coverage as CoverageMap | undefined) ?? undefined;
                                    accumulated.tests = (evt.tests as string[] | undefined) ?? undefined;
                                    sinkUpdate({...accumulated});
                                    cacheRun({
                                        folderSlug: selectedFolderSlug,
                                        fileSlug: selectedFileSlug,
                                        folderName: selectedFolder?.name ?? "",
                                        fileName: selectedFile?.name ?? "",
                                        result: accumulated,
                                    });
                                    // Also push to run history.
                                    const entry: HistoryEntry = {
                                        id: runId ?? `${Date.now()}-${Math.random()}`,
                                        startedAt: runStartedAt,
                                        folder: selectedFolder?.name ?? "",
                                        file: selectedFile?.name ?? "",
                                        // ── rerun context (mirrors the primary-run entry
                                        // above) ──
                                        folderSlug: selectedFolderSlug,
                                        fileSlug: selectedFileSlug,
                                        interpreter: settings.pythonInterpreter || undefined,
                                        args: argsText.trim() ? argsText.trim().split(/\s+/) : undefined,
                                        ok: accumulated.ok,
                                        exitCode: accumulated.exitCode ?? 0,
                                        durationMs: accumulated.durationMs ?? 0,
                                        stdout: accumulated.stdout,
                                        stderr: accumulated.stderr,
                                        figures: accumulated.figures ?? [],
                                        truncated: !!accumulated.truncated,
                                        killed: !!accumulated.killed,
                                    };
                                    setHistory((prev) => {
                                        const next = [entry, ...prev].slice(0, settings.historyMaxEntries || 25);
                                        saveHistory(next);
                                        return next;
                                    });
                                    // browser notification for cell runs too.
                                    // chime for cell runs too.
                                    const cellAlertInfo: RunNotifyInfo = {
                                        fileName: `${selectedFile?.name ?? "script"} (L${startLine}–${endLine})`,
                                        folderName: selectedFolder?.name,
                                        ok: accumulated.ok,
                                        killed: !!accumulated.killed,
                                        durationMs: accumulated.durationMs ?? 0,
                                    };
                                    notifyRunFinished(cellAlertInfo);
                                    playRunChime(cellAlertInfo);
                                    if (accumulated.killed) {
                                        toast({title: "Cell run stopped"});
                                    } else if (!accumulated.ok) {
                                        toast({
                                            title: "Cell run failed",
                                            description: `Exit ${accumulated.exitCode}`,
                                            variant: "destructive",
                                        });
                                    } else {
                                        toast({
                                            title: "Cell run complete",
                                            description: `${((accumulated.durationMs ?? 0) / 1000).toFixed(1)}s · L${startLine}–${endLine}`,
                                        });
                                    }
                                }
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                }
            } catch (err) {
                // aborted (user Stop) vs genuine network error.
                const aborted = stopInitiatedRef.current || (err as Error).name === "AbortError";
                if (aborted) {
                    accumulated.isStreaming = false;
                    accumulated.killed = true;
                    sinkUpdate({...accumulated});
                } else {
                    accumulated.ok = false;
                    accumulated.isStreaming = false;
                    accumulated.stderr += `\nNetwork error: ${(err as Error).message}\n`;
                    sinkUpdate({...accumulated});
                    toast({
                        title: "Network error",
                        description: (err as Error).message,
                        variant: "destructive",
                    });
                }
            } finally {
                runSinksRef.current.delete(sinkKey);
                runAbortControllersRef.current.delete(sinkKey);
                // the cell run's file session is over.
                markFileRunEnd(sinkFileKey);
                if (sinkBox.mode === "primary") {
                    primarySinkKeyRef.current = null;
                    primaryRunInfoRef.current = null;
                    // heal a cell run whose stream ended without
                    // an "end" event — never leave "Running…" stuck on screen.
                    if (accumulated.isStreaming) {
                        accumulated.isStreaming = false;
                        if (stopInitiatedRef.current) {
                            accumulated.killed = true;
                        } else {
                            accumulated.stderr +=
                                "\n[praxis] The run stream ended without a completion event (the server may have restarted or the connection dropped).\n";
                        }
                        sinkUpdate({...accumulated});
                    }
                    setIsRunning(false);
                    setCurrentRunId(null);
                    stopInitiatedRef.current = false;
                }
            }
        },
        [
            selectedFolderSlug,
            selectedFileSlug,
            settings,
            selectedFolder,
            selectedFile,
            toast,
            demoteCurrentRun,
            markFileRunStart,
            markFileRunId,
            markFileRunEnd,
        ]
    );

    /* ---------------------------------------------------------------- */
    /*  Stop handler                                                 */
    /* ---------------------------------------------------------------- */
    const handleStop = React.useCallback(
        async (runId: string) => {
            // mark the intent so the abort path in doRun /
            // handleRunCell reports "stopped" instead of "network error".
            stopInitiatedRef.current = true;
            try {
                await fetch("/api/stop", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({runId}),
                });
                // The /api/run endpoint will emit a final "end" event with killed=true
                // when the child actually dies — we don't need to do anything else here.
            } catch (err) {
                toast({
                    title: "Stop failed",
                    description: (err as Error).message,
                    variant: "destructive",
                });
            }
            // if this is the PRIMARY run, ALSO abort its SSE
            // fetch so the UI recovers instantly — even when the server is
            // gone and the "end" event never arrives
            // not working"). Background runs keep their streams: their end
            // event arrives normally once /api/stop kills the child.
            if (currentRunIdRef.current === runId) {
                const primaryKey = primarySinkKeyRef.current;
                const c = primaryKey ? runAbortControllersRef.current.get(primaryKey) : null;
                try {
                    c?.abort();
                } catch { /* already aborted */
                }
                // Safety net: if nothing was in flight to abort, force-clear
                // the run state after a short grace period.
                setTimeout(() => {
                    if (stopInitiatedRef.current) {
                        stopInitiatedRef.current = false;
                        setIsRunning(false);
                        setCurrentRunId(null);
                    }
                }, 3000);
            }
        },
        [toast]
    );

    /** the Stop button's handler — works in EVERY run
     *  state: with a runId (kills via /api/stop) AND without one (the
     *  fetch is still stuck before the start event → abort it). The old
     *  button rendered only when `isRunning && currentRunId`, leaving a
     *  window where a run was visibly in flight but un-stoppable. */
    const handleStopPrimary = React.useCallback(() => {
        const rid = currentRunIdRef.current;
        if (rid) {
            void handleStop(rid);
            return;
        }
        // No runId yet — abort the in-flight primary fetch directly.
        stopInitiatedRef.current = true;
        const primaryKey = primarySinkKeyRef.current;
        const c = primaryKey ? runAbortControllersRef.current.get(primaryKey) : null;
        try {
            c?.abort();
        } catch { /* already aborted */
        }
        setTimeout(() => {
            if (stopInitiatedRef.current) {
                stopInitiatedRef.current = false;
                setIsRunning(false);
                setCurrentRunId(null);
            }
        }, 2500);
    }, [handleStop]);

    /** the Stop button stops the run shown in the OUTPUT
     *  panel — the one that belongs to the SELECTED file (the primary
     *  OR a demoted background session), not blindly the newest run. */
    const handleStopSelected = React.useCallback(() => {
        const key = selectedFileKeyRef.current;
        for (const box of runSinksRef.current.values()) {
            if (box.fileKey === key) {
                if (box.runId) {
                    void handleStop(box.runId);
                    return;
                }
                // Stuck before the start event — abort its fetch directly.
                stopInitiatedRef.current = true;
                const c = runAbortControllersRef.current.get(box.key);
                try {
                    c?.abort();
                } catch { /* already aborted */
                }
                return;
            }
        }
        handleStopPrimary();
    }, [handleStop, handleStopPrimary]);

    /* ---------------------------------------------------------------- */
    /*  Open folder                                                 */
    /* ---------------------------------------------------------------- */
    const handleOpenFolder = React.useCallback(async () => {
        if (!selectedFolderSlug || !selectedFileSlug) return;
        setIsOpeningFolder(true);
        try {
            const res = await fetch("/api/open-folder", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: selectedFolderSlug,
                    file: selectedFileSlug,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                announceAction({
                    title: "Could not open folder",
                    description: data.error ?? `HTTP ${res.status}`,
                    variant: "destructive",
                });
            } else {
                announceAction({
                    title: "Folder opened",
                    description: `Revealed in ${data.command ?? "file explorer"}`,
                    variant: "success",
                });
            }
        } catch (err) {
            announceAction({
                title: "Network error",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setIsOpeningFolder(false);
        }
    }, [selectedFolderSlug, selectedFileSlug, announceAction]);

    /* ---------------------------------------------------------------- */
    /*  Run-all-in-folder                                         */
    /* ---------------------------------------------------------------- */
    // ═══ navbar + editor wiring ═════════════════════════════

    // ─── Run Selection in Python (editor context menu + ⌘⇧↵) ────────
    // The viewer hands us the exact selected text; doRun sends it as
    // the `code` override so the run streams like a normal one.
    const handleRunSelection = React.useCallback(
        (selCode: string) => {
            if (!selectedFolderSlug || !selectedFileSlug) return;
            if (settings.autoSwitchToOutputOnRun) setBottomTab("output");
            runOverrideRef.current = {code: selCode};
            void doRun();
        },
        [selectedFolderSlug, selectedFileSlug, settings.autoSwitchToOutputOnRun, doRun]
    );

    // ─── Go to Line dialog (Navigate ▸) ──────────────────────────────
    const [gotoLineOpen, setGotoLineOpen] = React.useState(false);
    const [gotoLineValue, setGotoLineValue] = React.useState("");
    const handleGotoLineConfirm = React.useCallback(() => {
        const n = parseInt(gotoLineValue.trim(), 10);
        setGotoLineOpen(false);
        setGotoLineValue("");
        if (Number.isFinite(n) && n > 0) {
            codeViewerRef.current?.jumpToLine(n);
        }
    }, [gotoLineValue]);

    // ─── Recent Files dialog (Navigate ▸) ────────────────────────────
    const [recentFilesOpen, setRecentFilesOpen] = React.useState(false);
    const recentFilesList = React.useMemo(() => {
        const all: Array<{
            folderSlug: string;
            folderName: string;
            fileSlug: string;
            fileName: string;
            mtime: number
        }> = [];
        for (const c of folders) {
            for (const f of c.files) {
                if (f.mtime) {
                    all.push({
                        folderSlug: c.slug,
                        folderName: c.name,
                        fileSlug: f.slug,
                        fileName: f.name,
                        mtime: f.mtime
                    });
                }
            }
        }
        all.sort((a, b) => b.mtime - a.mtime);
        return all.slice(0, 15);
    }, [folders]);

    // ─── Editor Back/Forward navigation history ──────────────────────
    const navHistoryRef = React.useRef<{ stack: Array<{ folder: string; file: string }>; index: number }>({
        stack: [],
        index: -1,
    });
    const navSkipRef = React.useRef(false);
    const [navFlags, setNavFlags] = React.useState({back: false, forward: false});
    React.useEffect(() => {
        if (!selectedFolderSlug || !selectedFileSlug) return;
        if (navSkipRef.current) {
            navSkipRef.current = false;
            return;
        }
        const h = navHistoryRef.current;
        const top = h.stack[h.index];
        if (top && top.folder === selectedFolderSlug && top.file === selectedFileSlug) return;
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push({folder: selectedFolderSlug, file: selectedFileSlug});
        if (h.stack.length > 50) h.stack.shift();
        h.index = h.stack.length - 1;
        setNavFlags({back: h.index > 0, forward: false});

    }, [selectedFolderSlug, selectedFileSlug]);
    const handleNavBack = React.useCallback(() => {
        const h = navHistoryRef.current;
        if (h.index <= 0) return;
        h.index -= 1;
        const target = h.stack[h.index];
        // guarded switch (dirty files prompt first).
        guardedSelectFile(target.folder, target.file, {
            afterSwitch: () => {
                navSkipRef.current = true;
            },
        });
        setNavFlags({back: h.index > 0, forward: true});
    }, []);
    const handleNavForward = React.useCallback(() => {
        const h = navHistoryRef.current;
        if (h.index >= h.stack.length - 1) return;
        h.index += 1;
        const target = h.stack[h.index];
        // guarded switch (dirty files prompt first).
        guardedSelectFile(target.folder, target.file, {
            afterSwitch: () => {
                navSkipRef.current = true;
            },
        });
        setNavFlags({back: true, forward: h.index < h.stack.length - 1});
    }, []);

    // ─── Edit ▸ Lines & Case dispatcher (menu bar → viewer) ──────────
    const handleEditorUtilityAction = React.useCallback(
        (action: string) => {
            const v = codeViewerRef.current;
            if (!v) return;
            switch (action) {
                case "toggleComment":
                    v.toggleComment();
                    break;
                case "duplicateLine":
                    v.duplicateLine();
                    break;
                case "moveLineUp":
                    v.swapLineUp();
                    break;
                case "moveLineDown":
                    v.swapLineDown();
                    break;
                case "upper":
                    v.convertCase("upper");
                    break;
                case "lower":
                    v.convertCase("lower");
                    break;
                case "title":
                    v.convertCase("title");
                    break;
                // identifier-style case conversions.
                case "camel":
                    v.convertCase("camel");
                    break;
                case "pascal":
                    v.convertCase("pascal");
                    break;
                case "snake":
                    v.convertCase("snake");
                    break;
                case "kebab":
                    v.convertCase("kebab");
                    break;
                case "constant":
                    v.convertCase("constant");
                    break;
                case "trimTrailing":
                    v.trimTrailingWhitespace();
                    break;
                case "changeAll":
                    v.changeAllOccurrences();
                    break;
                case "foldAll":
                    v.foldAll();
                    break;
                case "unfoldAll":
                    v.unfoldAll();
                    break;
                // ─── The line tools the right-click menu always had — now in
                //     the navbar Edit ▸ Lines & Case too ("more options in
                //     edit/view"). All edit-mode only; they no-op in view mode
                //     exactly like the context-menu twins.
                case "deleteLines":
                    v.deleteLines();
                    break;
                case "joinLines":
                    v.joinLines();
                    break;
                // the Join twin + the surround-with family.
                case "splitLines":
                    v.splitLines();
                    break;
                case "surroundQuotes":
                    v.surroundSelection("quotes");
                    break;
                case "surroundParens":
                    v.surroundSelection("parens");
                    break;
                case "surroundBrackets":
                    v.surroundSelection("brackets");
                    break;
                case "surroundBraces":
                    v.surroundSelection("braces");
                    break;
                case "sortLines":
                    v.sortLines();
                    break;
                case "uniqueLines":
                    v.uniqueLines();
                    break;
                case "reverseLines":
                    v.reverseLines();
                    break;
                case "shuffleLines":
                    v.shuffleLines();
                    break;
                case "selectAll":
                    v.selectAllBuffer();
                    break;
                case "copyAsMarkdown":
                    void v.copySelectionAsMarkdown();
                    break;
            }
        },
        []
    );

    // ─── Run all tests (Tools ▸ + the Tests panel) ───────────────────
    // /api/test now REALLY exists (shipped a dialog
    // that fetched a route nobody implemented — it 404'd). The report
    // shape is the TestsPanel's TestReportData (imported as a type —
    // erased at build time, so the dynamic import stays dynamic).
    const [testAllReport, setTestAllReport] = React.useState<
        { loading: boolean; data: TestReportData | null } | null
    >(null);
    const handleRunAllTests = React.useCallback(async () => {
        // the report now lives in the persistent Tests panel —
        // surface it instead of the old ephemeral dialog.
        setBottomPanelOpen(true);
        setBottomTab("tests");
        setTestAllReport({loading: true, data: null});
        try {
            const res = await fetch("/api/test", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({interpreter: settings.pythonInterpreter || undefined}),
            });
            const data = await res.json();
            setTestAllReport({loading: false, data: res.ok ? data : {error: data.error ?? `HTTP ${res.status}`}});
        } catch (e) {
            setTestAllReport({loading: false, data: {error: e instanceof Error ? e.message : String(e)}});
        }
    }, [settings.pythonInterpreter]);

    // ─── "Run with… interpreter" (explorer → praxis:run-with) ────────
    // Same pending-ref + effect pattern as the tree's Run actions: set
    // the selection, then fire doRun once the fresh closure has landed.
    const pendingRunWithRef = React.useRef<{ interpreter?: string } | null>(null);
    React.useEffect(() => {
        const pending = pendingRunWithRef.current;
        if (!pending) return;
        if (!selectedFileSlug) return;
        pendingRunWithRef.current = null;
        runOverrideRef.current = pending;
        const t = setTimeout(() => handleRun(), 60);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFileSlug]);

    const handleRunAll = React.useCallback(async (sub?: string) => {
        if (!selectedFolderSlug || !selectedFolder) return;
        // with a `sub` scope only the scripts inside that nested
        // subfolder run (server-side filter); the confirm dialog reflects
        // the scoped count.
        // the count covers EVERY runnable language (python +
        // js/ts/matlab/r/shell/java/c/cpp/ruby/php/go) — the same shared
        // runLanguageForFile table the server-side batch filters with, so
        // the dialog never promises a different set than what runs.
        const scopedCount = sub
            ? selectedFolder.files.filter(
                (f) =>
                    runLanguageForFile(f.kind, f.name) !== undefined &&
                    ((f.dir ?? "") === sub || (f.dir ?? "").startsWith(sub + "/"))
            ).length
            : selectedFolder.files.filter((f) => runLanguageForFile(f.kind, f.name) !== undefined).length;
        const scopeLabel = sub ? `${selectedFolder.name}/${sub}` : selectedFolder.name;
        if (settings.confirmRunAll && !window.confirm(
            `Run all ${scopedCount} runnable file${scopedCount === 1 ? "" : "s"} in "${scopeLabel}"? (Python scripts run their full pipeline; other languages run through their own runtimes.)`
        )) return;
        setBatchOpen(true);
        setBatchRunning(true);
        setBatchResults(null);
        const batchStartedAt = Date.now();
        // /api/run-all now streams per-file results as
        // SSE (it used to return one JSON blob after the LAST file — 40.6 s
        // of blank waiting for a 20-script folder) and registers its
        // children with /api/stop. Results fill the batch dialog
        // progressively as each file finishes.
        try {
            const controller = new AbortController();
            const res = await fetch("/api/run-all", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: selectedFolderSlug, ...(sub ? {sub} : {}),
                    interpreter: settings.pythonInterpreter || undefined
                }),
                signal: controller.signal,
            });
            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            const collected: BatchResult[] = [];
            // Progressive fill: each file-end event appends to the dialog.
            setBatchResults([]);
            // Held in an object so the closure assignment is visible to the
            // code after the read loop (TS narrowing).
            const summary: {
                value: { passCount: number; failCount: number; stopped?: boolean; totalMs?: number } | null;
            } = {value: null};

            // Stream-level error (type:"error" SSE event). Stored instead of
            // thrown: the read loop's inner try/catch used to SWALLOW the
            // thrown error ("ignore malformed event"), so a mid-batch server
            // error was silently ignored and the UI reported success. After
            // the loop we surface it — AFTER pushing whatever per-file results
            // already arrived to the history, so partial batch results aren't
            // lost
            // for the files run earlier").
            let streamError: string | null = null;

            const handleEvent = (evt: Record<string, unknown>) => {
                if (evt.type === "file-end" && evt.result) {
                    const r = evt.result as unknown as BatchResult;
                    collected.push(r);
                    setBatchResults((prev) => [...(prev ?? []), r]);
                } else if (evt.type === "end") {
                    summary.value = {
                        passCount: (evt.passCount as number) ?? 0,
                        failCount: (evt.failCount as number) ?? 0,
                        stopped: (evt.stopped as boolean) ?? false,
                        // server-side total batch duration — feeds the completion
                        // notification/chime body ("Finished in Ns").
                        totalMs: (evt.totalMs as number) ?? undefined,
                    };
                } else if (evt.type === "error" && evt.message) {
                    streamError = String(evt.message);
                }
            };

            while (true) {
                const {done, value} = await reader.read();
                noteSseBytes(value?.byteLength ?? 0);
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";
                for (const part of parts) {
                    for (const line of part.split("\n")) {
                        if (!line.startsWith("data: ")) continue;
                        try {
                            handleEvent(JSON.parse(line.slice(6)));
                        } catch { /* ignore malformed event */
                        }
                    }
                }
            }

            // push each per-file result into the run history so the
            // user can revisit them later from the history drawer.
            // Timestamps are CUMULATIVE (batch start + the durations of every
            // earlier file), so the history drawer orders the batch's runs in
            // actual execution order — the old `batchStartedAt + durationMs`
            // gave later files nearly identical timestamps and muddled the
            // sequence of "the files run earlier".
            let cumulativeMs = 0;
            // HistoryEntry + the explicit timeout flag (the base interface
            // in run-history.tsx predates it; saveHistory persists unknown
            // fields as-is, and the drawer's display keeps working off the
            // killed + stderr-marker channels).
            const newEntries: Array<HistoryEntry & { timedOut?: boolean }> = collected.map(
                (r) => {
                    const startedAt = batchStartedAt + cumulativeMs;
                    cumulativeMs += r.durationMs;
                    // (timeout flag, mirrors the primary-run end
                    // handler): honor the per-file end payload's explicit timedOut
                    // flag, with the stderr-marker sniff (isTimeoutRun) as the
                    // fallback — the server now stamps BOTH for batch timeouts.
                    const fileTimedOut = r.timedOut === true || isTimeoutRun(r.stderr);
                    // cache EACH per-file result so clicking a file
                    // after "Run all" loads its latest output automatically (the
                    // "when running all in folder; and going to one of
                    // those py files, i don't see the output; the latest execution
                    // is not loaded automatically"). cacheRun feeds the same
                    // auto-load path a single run uses.
                    cacheRun({
                        folderSlug: selectedFolderSlug,
                        fileSlug: r.fileSlug,
                        folderName: selectedFolder.name,
                        fileName: r.file,
                        result: {
                            ok: r.ok,
                            exitCode: r.exitCode,
                            stdout: r.stdout,
                            stderr: r.stderr,
                            figures: r.figureUrls,
                            durationMs: r.durationMs,
                            truncated: r.truncated,
                            killed: r.killed,
                            timedOut: fileTimedOut,
                            isStreaming: false,
                        },
                    });
                    return {
                        id: r.runId,
                        startedAt,
                        folder: selectedFolder.name,
                        file: r.file,
                        ok: r.ok,
                        exitCode: r.exitCode,
                        durationMs: r.durationMs,
                        stdout: r.stdout,
                        stderr: r.stderr,
                        figures: r.figureUrls,
                        truncated: r.truncated,
                        killed: r.killed,
                        timedOut: fileTimedOut,
                    };
                }
            );
            setHistory((prev) => {
                const next = [...newEntries.reverse(), ...prev].slice(0, settings.historyMaxEntries || 25);
                saveHistory(next);
                return next;
            });

            // Surface a mid-stream server error AFTER the partial results
            // were preserved (see streamError above).
            if (streamError) {
                throw new Error(streamError);
            }

            // RUN-ALL BATCH ALERT — the batch completion path was
            // SILENT — notifyRunFinished / playRunChime fired only for primary
            // runs and notebook cells, while the batch showed just a toast).
            // The batch-complete moment is the `end` SSE event captured in
            // summary above; fire the same notification + chime the primary
            // path uses. Both self-gate on the settings (runNotifyMode
            // / visibility, runNotifyOnFailure, runNotifySound) exactly like
            // the primary path — no extra gating here. A skipped alert when
            // summary never arrived (stream cut before the end event) mirrors
            // the primary path's no-end-event behavior.
            if (summary.value) {
                const batchAlertInfo = batchRunNotifyInfo({
                    folderName: selectedFolder.name,
                    ...(sub ? {sub} : {}),
                    total: collected.length,
                    failCount: summary.value.failCount,
                    stopped: summary.value.stopped,
                    durationMs: summary.value.totalMs ?? Date.now() - batchStartedAt,
                });
                notifyRunFinished(batchAlertInfo);
                playRunChime(batchAlertInfo);
            }

            toast({
                title: summary.value?.stopped ? "Batch stopped" : "Batch complete",
                description: `${summary.value?.passCount ?? 0}/${collected.length} passed · ${newEntries.length} runs added to history`,
                variant: (summary.value?.failCount ?? 0) > 0 ? "destructive" : "success",
            });
        } catch (err) {
            toast({
                title: "Batch failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setBatchRunning(false);
        }
    }, [selectedFolderSlug, selectedFolder, toast, settings.confirmRunAll, settings.historyMaxEntries, runLanguageForFile]);

    /** Load a batch result into the main output panel. */
    const handleLoadBatchResult = React.useCallback(
        (r: BatchResult) => {
            // guarded switch — the file only changes after the
            // dirty guard clears; the result lands in the panel afterwards.
            const showResult = () => {
                // Set the run result so the output panel shows it.
                setRunResult({
                    ok: r.ok,
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    truncated: r.truncated,
                    killed: r.killed,
                    // per-file timeout flag (mirrors the primary end handler) —
                    // makes the panel's "Timed out" vs "Stopped" pill truthful for
                    // batch results opened from the dialog.
                    timedOut: r.timedOut === true || isTimeoutRun(r.stderr),
                    durationMs: r.durationMs,
                    interpreter: r.interpreter,
                    figures: r.figureUrls,
                    isStreaming: false,
                });
                setIsRunning(false);
                setBatchOpen(false);
                toast({
                    title: r.ok ? "Run loaded" : "Run failed",
                    description: `${r.file} · exit ${r.exitCode}`,
                    variant: r.ok ? "success" : "destructive",
                });
            };
            guardedSelectFile(selectedFolderSlug, r.fileSlug, {afterSwitch: showResult});
        },
        [toast, guardedSelectFile, selectedFolderSlug]
    );

    /* ---------------------------------------------------------------- */
    /* — code font zoom (⌘= / ⌘- / ⌘0 + Ctrl+wheel). The */
    /*  editor-tab shortcuts (⌘PageUp/Down + Alt+1…9) are wired after  */
    /* handleSelectTab is defined, below — see the second */
    /*  block.                                                          */
    /* ---------------------------------------------------------------- */
    const adjustCodeFontSize = React.useCallback((delta: number) => {
        setSettings((prev) => {
            const next = {...prev, codeFontSize: Math.min(20, Math.max(10, prev.codeFontSize + delta))};
            saveSettings(next);
            return next;
        });
    }, []);
    const resetCodeFontSize = React.useCallback(() => {
        setSettings((prev) => {
            if (prev.codeFontSize === DEFAULT_SETTINGS.codeFontSize) return prev;
            const next = {...prev, codeFontSize: DEFAULT_SETTINGS.codeFontSize};
            saveSettings(next);
            return next;
        });
    }, []);

    // Environment Sync pin restore — the footer's interpreter pill
    // reports the ACTIVE folder's pinned interpreter (.praxis/
    // interpreter.json) when it differs from the configured one; apply
    // it (persisted, once per folder) so reopening a folder restores
    // its exact environment.
    const handlePinnedInterpreter = React.useCallback((pinnedPath: string) => {
        setSettings((prev) => {
            if (prev.pythonInterpreter === pinnedPath) return prev;
            const next = {...prev, pythonInterpreter: pinnedPath};
            saveSettings(next);
            return next;
        });
    }, []);

    // Ctrl/Cmd+wheel zoom — a NATIVE non-passive listener (React's
    // synthetic onWheel is passive at the root, so preventDefault
    // there can't stop the browser's page zoom / pinch). Wheel deltas
    // are accumulated and each ±60 units applies one ±1 px step, so a
    // trackpad pinch or a mouse notch both feel like one step.
    React.useEffect(() => {
        let accumulated = 0;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            // Over a native scroll container (terminal / output scrollback)
            // ctrl+wheel has no app meaning either — zoom the code font.
            e.preventDefault();
            accumulated += e.deltaY;
            while (accumulated <= -60) {
                accumulated += 60;
                adjustCodeFontSize(1);
            }
            while (accumulated >= 60) {
                accumulated -= 60;
                adjustCodeFontSize(-1);
            }
        };
        window.addEventListener("wheel", onWheel, {passive: false});
        return () => window.removeEventListener("wheel", onWheel);
    }, [adjustCodeFontSize]);


    // ─── browser fullscreen (plain F11) ────────────────
    const toggleFullscreen = React.useCallback(() => {
        if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => undefined);
        } else {
            void document.documentElement.requestFullscreen().catch(() => undefined);
        }
    }, []);
    // ─── toggle the integrated terminal panel (⌘` / View ┄
    // Terminal) — shared by the keyboard shortcut and the menu item.
    const toggleTerminalPanel = React.useCallback(() => {
        if (bottomTabRef.current === "terminal" && bottomPanelOpenRef.current) {
            setBottomPanelOpen(false);
        } else {
            setBottomPanelOpen(true);
            setBottomTab("terminal");
        }
    }, []);
    // ─── open a file (optionally jumping to a line) ────
    /** Shared callback for the TODO panel, Tests panel, ⌘T dialog and
     *  the Compare dialog's row clicks. Same-file jumps go straight
     *  through the editor ref; cross-file jumps set the selection and
     *  give the code fetch a beat to land before scrolling. */
    const handleOpenFileAt = React.useCallback(
        (folderSlug: string, fileSlug: string, line?: number) => {
            if (!folderSlug || !fileSlug) return;
            setEditorBlank(false);
            if (folderSlug === selectedFolderSlug && fileSlug === selectedFileSlug) {
                if (typeof line === "number" && line > 0) {
                    codeViewerRef.current?.jumpToLine(line);
                }
                return;
            }
            // FILE-OPEN SPEED: kick off the content fetch NOW — the promise
            // is deduped by the /api/code effect that fires right after the
            // selection state commits, so the network round-trip overlaps
            // with the render instead of being appended to it.
            // guarded switch — history jumps prompt first.
            guardedSelectFile(folderSlug, fileSlug, {
                afterSwitch: () => {
                    if (typeof line === "number" && line > 0) {
                        setTimeout(() => codeViewerRef.current?.jumpToLine(line), 300);
                    }
                },
            });
        },
        [guardedSelectFile, selectedFolderSlug, selectedFileSlug]
    );
    // ─── profiling heatmap from the Diagnostics panel ───
    /** The Profile tool finished — map its cProfile rows onto the
     * CURRENT file's def lines (matched by file-name basename), so the
     * CodeViewer can render a per-function timing gutter overlay. */
    const handleProfileResult = React.useCallback(
        (
            lines: Array<{ ncalls: string; tottime: number; cumtime: number; location: string }> | undefined,
            currentFileName?: string
        ) => {
            if (!lines || lines.length === 0 || !currentFileName) {
                setTimingOverlay(null);
                return;
            }
            const escaped = currentFileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`${escaped}:(\\d+)\\(`);
            const overlay: Array<{ line: number; cumtime: number; tottime: number }> = [];
            for (const l of lines) {
                const m = re.exec(l.location);
                if (m) {
                    overlay.push({line: Number(m[1]), cumtime: l.cumtime, tottime: l.tottime});
                }
            }
            setTimingOverlay(overlay.length > 0 ? overlay : null);
        },
        []
    );
    // ─── Distraction-free mode (Shift+F11) ─────────────────────────
    const toggleDistractionFree = React.useCallback(() => {
        setDistractionFree((df) => {
            const next = !df;
            if (next) {
                preDfStateRef.current = {sidebar: sidebarVisible, bottom: bottomPanelOpen};
                setSidebarVisible(false);
                setBottomPanelOpen(false);
            } else {
                const s = preDfStateRef.current;
                if (s) {
                    setSidebarVisible(s.sidebar);
                    setBottomPanelOpen(s.bottom);
                } else {
                    setSidebarVisible(true);
                    setBottomPanelOpen(true);
                }
                preDfStateRef.current = null;
            }
            return next;
        });
    }, [sidebarVisible, bottomPanelOpen]);

    // ─── Symbol palette, go-to-decl, find-usages, rename, quickfixes ──
    const [symbolPaletteOpen, setSymbolPaletteOpen] = React.useState(false);
    const [usagesDialogOpen, setUsagesDialogOpen] = React.useState(false);
    const [usagesQuery, setUsagesQuery] = React.useState("");
    const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
    const [renameSymbol, setRenameSymbol] = React.useState("");
    const [quickFixesOpen, setQuickFixesOpen] = React.useState(false);
    // Project-wide Find-in-Files dialog — opened via Ctrl/Cmd+Shift+H
    // (the Edit → Find in files… menu item) or the Edit menu.
    const [projectSearchOpen, setProjectSearchOpen] = React.useState(false);
    // Template gallery picker (replaces the window.prompt flow) — the
    // searchable dialog + its busy flag while Create writes the file.
    const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false);
    const [templateCreating, setTemplateCreating] = React.useState(false);
    const [localHistoryOpen, setLocalHistoryOpen] = React.useState(false);
    // Commit dialog open state — opened from the Tools → Git → Commit…
    // menu item. On a successful commit, the dialog calls onCommitted
    // which re-runs fetchGitStatus — one fetch refreshes the dirty-file
    // list, the per-file gitStatusMap, AND the Git Diff panel (which now
    // receives the entries as props instead of re-fetching them itself).
    const [commitDialogOpen, setCommitDialogOpen] = React.useState(false);

    // AI chat sidebar — a right-side panel that streams completions from
    // /api/ai-chat (z-ai-web-dev-sdk). Toggled from the Sparkles button
    // in the menu bar's right-side actions, the AI menu, or ⌘⇧L.
    const [aiChatOpen, setAiChatOpen] = React.useState(false);

    // ─── zen mode (Focus sessions) ────────────────────────
    // The focus widget (focus-timer.tsx) broadcasts `praxis:zen`
    // { active: boolean } — active while a FOCUS phase is counting down
    // and zen mode is enabled in Focus settings. While active, the IDE
    // chrome (file-tree sidebar, bottom panel, AI chat) hides itself —
    // the editor alone fills the screen; pausing, stopping, or entering
    // a break restores the exact pre-zen layout. The saved state lives
    // in a ref (not state) so re-renders never clobber it, and the
    // restoration is idempotent — repeated `active:false` events are
    // ignored once zen is off.
    const zenSavedRef = React.useRef<{ sidebar: boolean; bottom: boolean; ai: boolean } | null>(null);
    React.useEffect(() => {
        const onZen = (e: Event) => {
            const detail = (e as CustomEvent).detail as { active?: boolean } | undefined;
            const active = detail?.active === true;
            if (active) {
                if (zenSavedRef.current == null) {
                    zenSavedRef.current = {
                        sidebar: sidebarVisible,
                        bottom: bottomPanelOpen,
                        ai: aiChatOpen,
                    };
                    setSidebarVisible(false);
                    setBottomPanelOpen(false);
                    setAiChatOpen(false);
                }
            } else if (zenSavedRef.current != null) {
                const saved = zenSavedRef.current;
                zenSavedRef.current = null;
                setSidebarVisible(saved.sidebar);
                setBottomPanelOpen(saved.bottom);
                setAiChatOpen(saved.ai);
            }
        };
        window.addEventListener("praxis:zen", onZen as EventListener);
        return () => window.removeEventListener("praxis:zen", onZen as EventListener);
    }, [sidebarVisible, bottomPanelOpen, aiChatOpen]);

    // ─── bookmarks ─────────────────────────────────────────────
    // Line bookmarks across the project, persisted to localStorage.
    // Toggle from the editor's context menu (the CodeViewer dispatches
    // `praxis:bookmark-toggle` with the caret's line) or the Go ▸
    // Bookmarks… dialog's Add button; jump from the dialog.
    interface CodeBookmark {
        id: string;
        folderSlug: string;
        fileSlug: string;
        fileName: string;
        line: number;
        createdAt: number;
        /** the line's text — shown in the navbar menu + dialog
         *  so a bookmark says WHAT it marks, not just where. */
        snippet?: string;
    }

    const [bookmarks, setBookmarks] = React.useState<CodeBookmark[]>([]);
    const [bookmarksOpen, setBookmarksOpen] = React.useState(false);

    // ─── workspace tool dialog state ───────────────────────
    /** Developer Toolbox (Tools ▸ / Data ▸ Convert). */
    const [toolboxOpen, setToolboxOpen] = React.useState(false);
    const [toolboxTab, setToolboxTab] = React.useState<string | undefined>(undefined);
    /* the file that was open in the viewer when the toolbox
   *  was opened from its view/edit UI (the praxis:open-toolbox
   *  event) — passed to DevToolbox and consumed by the media suites
   *  (image studio / image → text / video studio / PDF studio) so
   *  the tool opens with that file already loaded. */
    const [toolboxPreload, setToolboxPreload] = React.useState<ToolPreload | null>(null);
    /** SQLite workbench — target + open flag. */
    const [workbench, setWorkbench] = React.useState<{
        open: boolean;
        folderSlug: string;
        fileSlug: string;
        fileName: string;
    }>({open: false, folderSlug: "", fileSlug: "", fileName: ""});
    /** Chart preview / transform pipeline for the current data file. */
    const [chartOpen, setChartOpen] = React.useState(false);
    const [pipelineOpen, setPipelineOpen] = React.useState(false);
    /** Snippet manager, jump list, folder compare, scaffold. */
    const [snippetManagerOpen, setSnippetManagerOpen] = React.useState(false);
    const [jumpListOpen, setJumpListOpen] = React.useState(false);
    const [folderCompareOpen, setFolderCompareOpen] = React.useState(false);
    const [folderCompareSlug, setFolderCompareSlug] = React.useState<string | undefined>(undefined);
    const [scaffoldOpen, setScaffoldOpen] = React.useState(false);
    /** The active layout preset id (null = custom). */
    const [layoutPresetId, setLayoutPresetId] = React.useState<string | null>(null);
    /** Entry-point re-render nonce — bumping refreshes the navbar badge. */
    const [entryPointNonce, setEntryPointNonce] = React.useState(0);
    React.useEffect(() => {
        const onEntryChanged = () => setEntryPointNonce((n) => n + 1);
        window.addEventListener("praxis:entry-point-changed", onEntryChanged);
        return () => window.removeEventListener("praxis:entry-point-changed", onEntryChanged);
    }, []);
    /** the file added to AI context — its content is
     *  fetched on demand and rides along every chat message. */
    const [aiContext, setAiContext] = React.useState<{ fileName: string; content: string } | null>(null);
    // ─── tree-dispatched events → the dialogs ────────────────
    // folder-compare / scaffold / sql-workbench come from the explorer's
    // right-click "Workspace ▸" submenus.
    React.useEffect(() => {
        const onCompare = (e: Event) => {
            const detail = (e as CustomEvent).detail as { folderSlug?: string } | undefined;
            setFolderCompareSlug(detail?.folderSlug);
            setFolderCompareOpen(true);
        };
        const onScaffold = () => setScaffoldOpen(true);
        const onWorkbench = (e: Event) => {
            const detail = (e as CustomEvent).detail as
                | { folderSlug?: string; fileSlug?: string; fileName?: string }
                | undefined;
            if (detail?.folderSlug && detail.fileSlug && detail.fileName) {
                setWorkbench({
                    open: true,
                    folderSlug: detail.folderSlug,
                    fileSlug: detail.fileSlug,
                    fileName: detail.fileName,
                });
            }
        };
        window.addEventListener("praxis:folder-compare", onCompare);
        window.addEventListener("praxis:scaffold", onScaffold);
        window.addEventListener("praxis:sql-workbench", onWorkbench);
        return () => {
            window.removeEventListener("praxis:folder-compare", onCompare);
            window.removeEventListener("praxis:scaffold", onScaffold);
            window.removeEventListener("praxis:sql-workbench", onWorkbench);
        };
    }, []);
    React.useEffect(() => {
        let cancelled = false;
        const onContextChanged = () => {
            const ref = getAiContextFile();
            if (!ref) {
                setAiContext(null);
                return;
            }
            void (async () => {
                try {
                    const url = fileUrlFor(ref.folderSlug, ref.fileSlug);
                    const res = await fetch(url);
                    const json = await res.json();
                    if (!cancelled && res.ok && json.ok) {
                        setAiContext({fileName: ref.fileName, content: json.content as string});
                    }
                } catch {
                    /* context file unreadable — the chip just won't attach */
                }
            })();
        };
        onContextChanged();
        window.addEventListener("praxis:ai-context-changed", onContextChanged);
        return () => {
            cancelled = true;
            window.removeEventListener("praxis:ai-context-changed", onContextChanged);
        };
    }, []);
    /** Restore the last layout preset label on mount (the preset itself
     *  is re-applied only via the menu/cycler — restoring panels exactly
     *  would fight the session-restore feature). */
    React.useEffect(() => {
        const last = loadLastPreset() as LayoutPresetId | null;
        setLayoutPresetId(last);
    }, []);
    React.useEffect(() => {
        void (async () => {
            try {
                let raw = window.localStorage.getItem("praxis.bookmarks");
                if (!raw) {
                    raw = window.localStorage.getItem("praxis.bookmarks.v1");
                    if (raw) window.localStorage.setItem("praxis.bookmarks", raw);
                }
                if (raw) setBookmarks(JSON.parse(raw) as CodeBookmark[]);
            } catch { /* corrupted — start empty */
            }
        })();
    }, []);
    const saveBookmarks = React.useCallback((next: CodeBookmark[]) => {
        setBookmarks(next);
        try {
            window.localStorage.setItem("praxis.bookmarks", JSON.stringify(next));
        } catch { /* storage */
        }
    }, []);
    /** Toggle a bookmark at a line of the given file (or the CURRENT
     *  file when only the line arrives — the editor event path). */
    const toggleBookmark = React.useCallback(
        (line: number, folderSlug?: string, fileSlug?: string, fileName?: string) => {
            const fs = folderSlug ?? selectedFolderSlug;
            const fl = fileSlug ?? selectedFileSlug;
            const fn = fileName ?? selectedFile?.name;
            if (!fs || !fl || !fn) {
                toast({title: "Open a file first — bookmarks mark a line inside a file."});
                return;
            }
            // line bookmarks target Python files only — the
            // editor's line model, gutter marks and F2 navigation all live in
            // the Python CodeViewer. Non-py kinds get an explanatory toast
            // instead of a bookmark that can never be jumped to.
            const targetKind = foldersRef.current
                .find((c) => c.slug === fs)?.files.find((f) => f.slug === fl)?.kind;
            if (targetKind && targetKind !== "python") {
                toast({
                    title: "Bookmarks are for Python files",
                    description: `${fn} is a ${targetKind} file — line bookmarks live in the Python editor.`,
                });
                return;
            }
            // capture the line's text for a readable label.
            const snippet = (() => {
                const content = codeViewerRef.current?.getBuffer?.() ?? code?.content;
                if (typeof content !== "string") return undefined;
                const text = content.split("\n")[line - 1];
                return text ? text.trim().slice(0, 120) : undefined;
            })();
            setBookmarks((prev) => {
                const existing = prev.find((b) => b.folderSlug === fs && b.fileSlug === fl && b.line === line);
                const next = existing
                    ? prev.filter((b) => b !== existing)
                    : [
                        ...prev,
                        {
                            id: `${fs}/${fl}:${line}:${Date.now()}`,
                            folderSlug: fs,
                            fileSlug: fl,
                            fileName: fn,
                            line,
                            createdAt: Date.now(),
                            snippet
                        },
                    ];
                try {
                    window.localStorage.setItem("praxis.bookmarks", JSON.stringify(next));
                } catch { /* storage */
                }
                return next;
            });
        },
        [selectedFolderSlug, selectedFileSlug, selectedFile?.name, code?.content, toast]
    );
    // The editor's context-menu "Toggle bookmark" arrives as a window
    // event carrying the caret line.
    React.useEffect(() => {
        const onToggle = (e: Event) => {
            const detail = (e as CustomEvent).detail as { line?: number } | undefined;
            const line = detail?.line ?? footerStore.getCursor()?.line ?? 0;
            if (line > 0) toggleBookmark(line);
        };
        window.addEventListener("praxis:bookmark-toggle", onToggle as EventListener);
        return () => window.removeEventListener("praxis:bookmark-toggle", onToggle as EventListener);
    }, [toggleBookmark]);
    // Gutter / dialog jump helper (same-file jumps are instant).
    const jumpToBookmark = React.useCallback(
        (b: CodeBookmark) => {
            handleOpenFileAt(b.folderSlug, b.fileSlug, b.line);
            setBookmarksOpen(false);
        },
        [handleOpenFileAt]
    );

    // Pending prompt for the AI Chat sidebar — when the user clicks
    // "Explain" / "Improve" in the code viewer or the AI menu, we set
    // this with a fresh nonce. The sidebar's useEffect on `pendingPrompt`
    // opens the sidebar (via onOpenChange) and auto-sends the prompt.
    // Mirrors the `insertSnippet` nonce pattern in CodeViewer.
    const [aiPendingPrompt, setAiPendingPrompt] = React.useState<{ text: string; nonce: number } | null>(null);

    /** Send a prompt to the AI Chat sidebar. Opens the sidebar if it's
     *  closed, then dispatches the prompt. Used by the "Explain" and
     *  "Improve" buttons in the code viewer (which used to open external
     *  AI websites) and by the AI menu items. */
    const sendAiPrompt = React.useCallback((text: string) => {
        if (!text.trim()) return;
        setAiChatOpen(true);
        setAiPendingPrompt({text, nonce: Date.now()});
    }, []);

    /* ─── interactive stdin  ─────────────────────────── */
    /** Send a line to the RUNNING script's stdin (interactive runs).
     * the target is the SELECTED file's live run — the stdin
     * row belongs to the file the user is looking at, not blindly the
     * newest run (demoted background runs keep their own sessions; a
     * background run's prompts are answered by re-selecting its file). */
    const handleSendStdin = React.useCallback(async (text: string) => {
        const runId =
            runningFileRunsRef.current[selectedFileKeyRef.current]?.runId ??
            currentRunIdRef.current;
        if (!runId) throw new Error("no active run");
        const res = await fetch("/api/run-input", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({runId, text}),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `HTTP ${res.status}`);
        }
    }, []);
    const handleSendStdinEof = React.useCallback(async () => {
        const runId =
            runningFileRunsRef.current[selectedFileKeyRef.current]?.runId ??
            currentRunIdRef.current;
        if (!runId) throw new Error("no active run");
        await fetch("/api/run-input", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({runId, eof: true}),
        });
    }, []);

    /* ─── run configs  ───────────────────────────────── */
    /** Apply a saved run config to the Run toolbar fields. */
    const handleApplyRunConfig = React.useCallback((c: RunConfig) => {
        setArgsText(c.args ?? "");
        setEnvText(c.env ?? "");
        setStdinText(c.stdin ?? "");
        toast({
            title: `Applied run config "${c.name}"`,
            description: c.args ? `args: ${c.args}` : "args cleared",
        });

    }, [toast]);

    /* ─── run queue / scheduler / trainer dialog state ───── */
    const [runQueueOpen, setRunQueueOpen] = React.useState(false);
    const [schedulerOpen, setSchedulerOpen] = React.useState(false);
    const [trainerOpen, setTrainerOpen] = React.useState(false);
    const [schedules, setSchedules] = React.useState<Schedule[]>([]);
    const schedulesRef = React.useRef<Schedule[]>([]);
    React.useEffect(() => {
        schedulesRef.current = schedules;
    }, [schedules]);
    // Load persisted schedules once on mount.
    React.useEffect(() => {
        setSchedules(loadSchedules());
    }, []);
    const updateSchedules = React.useCallback((next: Schedule[]) => {
        setSchedules(next);
        saveSchedules(next);
    }, []);

    /* ─── the scheduler tick ──────────────────────────
   * Fires due schedules through the normal explorer run flow. Ticks
   * every 30 s while the tab is open (documented limitation — this is
   * not a server-side cron). */
    const scheduleTickRef = React.useRef(false);
    React.useEffect(() => {
        const tick = () => {
            if (scheduleTickRef.current) return; // a fired run is settling
            const now = Date.now();
            const due = schedulesRef.current.filter(
                (s) => s.enabled && now >= nextDueAt(s)
            );
            if (due.length === 0) return;
            const next = schedulesRef.current.map((s) =>
                due.some((d) => d.id === s.id) ? {...s, lastRunAt: now} : s
            );
            updateSchedules(next);
            scheduleTickRef.current = true;
            // Fire the FIRST due schedule (one per tick keeps the output
            // panel coherent); the rest catch up on later ticks.
            const s = due[0];
            toast({
                title: "Scheduled run firing",
                description: `${s.label} (every ${s.everyMinutes} min)`,
            });
            handleRunFileFromTreeRef.current?.(s.folderSlug, s.fileSlug);
            // Release the lock after a generous settle window.
            setTimeout(() => {
                scheduleTickRef.current = false;
            }, 5000);
        };
        const t = setInterval(tick, 30_000);
        return () => clearInterval(t);
    }, [updateSchedules, toast]);

    // ─── "Fix with AI" from the Diagnostics panel ───────
    const handleAiFixDiagnostic = React.useCallback(
        (diag: { line: number; col?: number; message: string; tool: string }) => {
            const content = code?.content ?? "";
            const from = Math.max(0, diag.line - 4);
            const snippet = content
                ? content.split("\n").slice(from, diag.line + 3).join("\n")
                : "";
            sendAiPrompt(
                `Fix this problem reported by ${diag.tool} in ${selectedFile?.name ?? "the current file"} at line ${diag.line}${diag.col ? `, column ${diag.col}` : ""}:\n\n${diag.message}\n\nContext (lines ${from + 1}–${diag.line + 3}):\n\n\`\`\`python\n${snippet}\n\`\`\`\n\nExplain the cause briefly, then give the corrected code for the affected lines.`
            );
        },
        [code?.content, selectedFile?.name, sendAiPrompt]
    );

    // ─── batch AI review of ALL diagnostics ────────
    //     One grouped prompt → one reviewable answer in the chat
    // (instead of N one-by-one "Fix with AI" passes). The answer's
    //     ```python blocks keep the "Apply to file" diff flow.
    const handleAiFixAll = React.useCallback(
        (diags: Array<{ line: number; col?: number; message: string; tool: string }>) => {
            if (diags.length === 0) return;
            const content = code?.content ?? "";
            const byTool = new Map<string, typeof diags>();
            for (const d of diags) {
                const list = byTool.get(d.tool) ?? [];
                list.push(d);
                byTool.set(d.tool, list);
            }
            const grouped = [...byTool.entries()]
                .map(([tool, list]) =>
                    `${tool} (${list.length}):\n` +
                    list
                        .slice(0, 40)
                        .map((d) => `  line ${d.line}${d.col ? `:${d.col}` : ""} — ${d.message}`)
                        .join("\n")
                )
                .join("\n\n");
            sendAiPrompt(
                `Review and fix ALL of these ${diags.length} problems in ${selectedFile?.name ?? "the current file"}.\n\n${grouped}\n\n${
                    content
                        ? `Full source:\n\n\`\`\`python\n${content.slice(0, 8000)}\n\`\`\`\n\n`
                        : ""
                }Give ONE corrected version of the complete file in a single \`\`\`python block (explain the non-obvious fixes in a short list before it).`
            );
        },
        [code?.content, selectedFile?.name, sendAiPrompt]
    );

    React.useEffect(() => {
        const onGotoSymbol = () => setSymbolPaletteOpen(true);
        const onGotoDecl = () => {
            const sym = codeViewerRef.current?.getSelectedSymbol() ?? "";
            if (!sym) return;
            void (async () => {
                try {
                    const [defRes, classRes] = await Promise.all([
                        fetch(`/api/full-text-search?q=${encodeURIComponent("def " + sym)}&limit=20`),
                        fetch(`/api/full-text-search?q=${encodeURIComponent("class " + sym)}&limit=20`),
                    ]);
                    const defData = await defRes.json();
                    const classData = await classRes.json();
                    const all = [...(defData.hits ?? []), ...(classData.hits ?? [])];
                    if (all.length === 0) return;
                    const first = all[0];
                    // guarded switch.
                    guardedSelectFile(first.folderSlug, first.fileSlug, {
                        afterSwitch: () => {
                            setTimeout(() => codeViewerRef.current?.jumpToLine(first.line), 300);
                        },
                    });
                } catch {
                }
            })();
        };
        // Code Lens chips pass the symbol in the event
        // detail; the menu items keep using the caret's symbol.
        const onFindUsages = (e: Event) => {
            const detailSym = (e as CustomEvent).detail?.symbol as string | undefined;
            const sym = detailSym ?? codeViewerRef.current?.getSelectedSymbol() ?? "";
            if (!sym) return;
            setUsagesQuery(sym);
            setUsagesDialogOpen(true);
        };
        const onRename = (e: Event) => {
            const detailSym = (e as CustomEvent).detail?.symbol as string | undefined;
            const sym = detailSym ?? codeViewerRef.current?.getSelectedSymbol() ?? "";
            if (!sym) return;
            setRenameSymbol(sym);
            setRenameDialogOpen(true);
        };
        const onQuickFixes = () => {
            const diags = codeViewerRef.current?.getDiagnostics() ?? [];
            if (diags.length === 0) return;
            setQuickFixesOpen(true);
        };
        // Tools ▸ "Format current file" routes by
        // kind — Python keeps the black/ruff editor path; Markdown / HTML
        // go through the FileViewer's formatter (view OR edit mode, same
        // praxis:file-viewer-format event the Edit menu uses).
        const onFormatCurrent = () => {
            // routes by CAPABILITY now — every formattable kind
            // (md / html / json / yaml / toml / css / sql / js / ts / matlab /
            // java / c / cpp / r / shell / ruby / php / go) reaches the
            // FileViewer's formatter from ⌘⇧F; only Python keeps its own
            // black/ruff editor path.
            if (selectedFileKind === "python") {
                void codeViewerRef.current?.format();
                return;
            }
            if (capabilitiesForKind(selectedFileKind).canFormat) {
                window.dispatchEvent(new CustomEvent("praxis:file-viewer-format", {detail: {mode: "format"}}));
                return;
            }
            toast({
                title: "Nothing to format",
                description: "Open a file with a formatter (.py, .md, .js, .css, .m …) first.",
            });
        };
        const onLintCurrent = () => {
            // bump the lint nonce — the old implementation
            // cleared selectedFileSlug and restored it 50 ms later, which
            // re-entered the whole code fetch, transiently persisted an empty
            // file slot in localStorage, and re-ran every selection-driven
            // effect just to trigger one lint.
            setLintNonce((n) => n + 1);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "F11") {
                e.preventDefault();
                toggleDistractionFree();
            }
            // Ctrl/Cmd+Shift+H — open the project-wide Find-in-Files dialog.
            // (Plain Cmd/Ctrl+H is bound to the run-history drawer via
            // useKeyboardShortcuts, so we only react when Shift is held.)
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.shiftKey && !e.altKey && (e.key === "h" || e.key === "H")) {
                e.preventDefault();
                setProjectSearchOpen(true);
            }
            // Ctrl/Cmd+Shift+J — the Jump list overlay
            // (pinned tabs / favorites / recents / last runs).
            if (mod && e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
                e.preventDefault();
                setJumpListOpen(true);
            }
            // Ctrl/Cmd + Minus / Ctrl/Cmd + Shift + Minus —
            // editor-history Back / Forward (VS Code's bindings for
            // workbench.action.navigateBack / navigateForward). The Navigate
            // menu already displayed "⌃-" as the Back hint, but no handler
            // existed — the hint was a lie. Gated on not-typing so pressing
            // "-" in a text field with Ctrl held by accident never triggers
            // navigation; preventDefault stops the browser's page-zoom-out.
            if (
                e.ctrlKey && !e.metaKey && !e.altKey &&
                (e.key === "-" || e.key === "_")
            ) {
                const t = e.target as HTMLElement | null;
                const typing =
                    !!t &&
                    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (!typing) {
                    e.preventDefault();
                    if (e.shiftKey) handleNavForward();
                    else handleNavBack();
                }
            }
            // Alt+Left / Alt+Right — the Back/Forward twins browsers and VS
            // Code both use for editor-history navigation (the Navigate menu
            // and Ctrl/Ctrl+Shift+Minus stay). Gated on not-typing so Alt+
            // arrows inside a text field keep their selection meaning.
            if (
                e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
                (e.key === "ArrowLeft" || e.key === "ArrowRight")
            ) {
                const t = e.target as HTMLElement | null;
                const typing =
                    !!t &&
                    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (!typing) {
                    e.preventDefault();
                    if (e.key === "ArrowLeft") handleNavBack();
                    else handleNavForward();
                }
            }
            // Ctrl/Cmd+R — open the Goto Symbol palette. This is a GLOBAL
            // handler (not dependent on the code viewer having focus) so it
            // works in read mode too. The code viewer's own onKeyDown also
            // handles Ctrl+R, but only when it has focus (edit mode).
            if (mod && !e.shiftKey && !e.altKey && (e.key === "r" || e.key === "R")) {
                // Don't interfere with browser reload if no file is selected.
                if (selectedFileSlug) {
                    e.preventDefault();
                    setSymbolPaletteOpen(true);
                }
            }
            // ─── ──────────────────────────────────────────────
            // Ctrl/Cmd+T — Go to Symbol in project (VS Code's "Go to Symbol
            // in Workspace"). Server-side search over every folder's
            // def/class/method via /api/project-symbols.
            if (mod && !e.shiftKey && !e.altKey && (e.key === "t" || e.key === "T")) {
                const t = e.target as HTMLElement | null;
                const typing =
                    !!t &&
                    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (!typing) {
                    e.preventDefault(); // ⌘T would otherwise open a browser tab
                    setSymbolSearchOpen(true);
                }
            }
            // Ctrl+Tab / Ctrl+Alt+Tab (and Cmd variants) — the MRU switcher
            // now opens the TabSwitcherOverlay (useTabSwitcherKeys owns the
            // whole key state machine: hold-to-cycle with the overlay list,
            // Enter / released modifier commits, Esc cancels, typing filters).
            // The old silent direct-cycler was REMOVED so the two paths can
            // never double-step. Browsers reserve plain Ctrl+Tab for their
            // own tab strip in a normal page — the overlay still opens under
            // the same conditions (fullscreen / PWA / forwarding browsers)
            // plus the always-available Ctrl+Alt+Tab twin.
            // Ctrl/Cmd+P — fuzzy OPEN FILE (VS Code's binding): the same
            // file picker the menu bar's Go to file (⌘T) opens. preventDefault
            // keeps the browser's Print dialog out of the way; skipped while
            // typing so Ctrl+P inside a text field stays harmless.
            if (mod && !e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P")) {
                const t = e.target as HTMLElement | null;
                const typing =
                    !!t &&
                    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (!typing) {
                    e.preventDefault();
                    setSearchOpen(true);
                }
            }
            // Ctrl/Cmd+Shift+O — Go to Symbol in the CURRENT file (VS Code's
            // binding; ⌘R stays as the alternative). The project-wide symbol
            // search keeps its own ⌘T.
            if (mod && e.shiftKey && !e.altKey && (e.key === "o" || e.key === "O")) {
                const t = e.target as HTMLElement | null;
                const typing =
                    !!t &&
                    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (!typing) {
                    if (selectedFileSlug) {
                        e.preventDefault();
                        setSymbolPaletteOpen(true);
                    }
                }
            }
            // Ctrl/Cmd+` — toggle the integrated Terminal panel (VS Code's
            // terminal binding). Hides the bottom panel when the Terminal
            // tab is already frontmost; re-opens + focuses it otherwise.
            if (mod && !e.shiftKey && !e.altKey && e.key === "`") {
                const t = e.target as HTMLElement | null;
                const typing =
                    !!t &&
                    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (!typing) {
                    e.preventDefault();
                    toggleTerminalPanel();
                }
            }
            // Plain F11 — browser fullscreen. (⇧F11 above is the app's
            // distraction-free mode.) preventDefault is best-effort: some
            // browsers reserve F11 for their own fullscreen.
            if (
                !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey &&
                e.key === "F11"
            ) {
                e.preventDefault();
                toggleFullscreen();
            }
        };
        // ─── listeners ────────────────────────────────────────
        const onGotoLineEvt = (e: Event) => {
            const line = (e as CustomEvent).detail?.line;
            if (typeof line === "number" && line > 0) {
                // Give the just-selected file a beat to load, then scroll.
                setTimeout(() => codeViewerRef.current?.jumpToLine(line), 250);
            }
        };
        // "praxis:open-file-line" — the AI chat sidebar's clickable path:line
        // citations. Unlike praxis:goto-line (current file only) this
        // RESOLVES the cited path against the live folder tree and opens
        // THAT file first, then jumps. foldersRef/selectedFileKeyRef are
        // refs so the closure never goes stale without re-registering.
        const onOpenFileLine = (e: Event) => {
            const d = (e as CustomEvent).detail as { path?: string; line?: number } | undefined;
            if (!d?.path || typeof d.line !== "number") return;
            // const so the narrowed number survives the setTimeout closure.
            const line: number = d.line;
            const m = matchProjectFilePath(d.path, foldersRef.current ?? []);
            if (!m) {
                toast({title: "Could not find that file", description: d.path});
                return;
            }
            if (selectedFileKeyRef.current === `${m.folderSlug}/${m.fileSlug}`) {
                codeViewerRef.current?.jumpToLine(line);
            } else {
                guardedSelectFile(m.folderSlug, m.fileSlug, {
                    afterSwitch: () => setTimeout(() => codeViewerRef.current?.jumpToLine(line), 250),
                });
            }
        };
        const onRunWith = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string; interpreter?: string } | undefined;
            if (!d?.folder || !d.file) return;
            if (isRunning || batchRunning) {
                toast({title: "A run is already in progress", variant: "warning"});
                return;
            }
            setEditorBlank(false);
            if (d.folder === selectedFolderSlug && d.file === selectedFileSlug) {
                runOverrideRef.current = d.interpreter ? {interpreter: d.interpreter} : null;
                handleRun();
                return;
            }
            // guarded switch — the run arms AFTER the user clears
            // the dirty guard.
            guardedSelectFile(d.folder, d.file, {
                afterSwitch: () => {
                    pendingRunWithRef.current = d.interpreter ? {interpreter: d.interpreter} : null;
                },
            });
        };
        const onOpenLocalHistory = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string } | undefined;
            if (!d?.folder || !d.file) return;
            // guarded switch.
            guardedSelectFile(d.folder, d.file, {
                afterSwitch: () => setLocalHistoryOpen(true),
            });
        };
        const onOpenGitDiff = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string } | undefined;
            if (!d?.folder || !d.file) return;
            // guarded switch.
            guardedSelectFile(d.folder, d.file, {
                afterSwitch: () => setBottomTab("gitdiff"),
            });
        };
        // ─── listeners ─────────────────────────────────────
        // Rerun from history (the entry's ▶ button and the PRAXIS_RERUN_RUN
        // window event — run-history dispatches both). Resolves the target
        // exactly like handleHistorySelect (recorded slugs first, then the
        // name lookup), replays the recorded args into the args input (the
        // only mutable run state doRun reads), and runs through the normal
        // handleRun path once the switch + the args state have settled —
        // handleRunRef is refreshed every render, so reading it inside the
        // timeout picks up the post-commit identity.
        const onRerunRun = (e: Event) => {
            const entry = (e as CustomEvent).detail as HistoryEntry | undefined;
            if (!entry) return;
            const ch = entry.folderSlug
                ? foldersRef.current.find((c) => c.slug === entry.folderSlug)
                : foldersRef.current.find((c) => c.name === entry.folder);
            const file = entry.fileSlug
                ? ch?.files.find((f) => f.slug === entry.fileSlug)
                : ch?.files.find((f) => f.name === entry.file);
            if (!ch || !file) {
                toast({
                    title: "Cannot re-run",
                    description: `${entry.folder}/${entry.file} is gone.`,
                    variant: "destructive",
                });
                return;
            }
            if (entry.args?.length) setArgsText(entry.args.join(" "));
            guardedSelectFile(ch.slug, file.slug, {
                afterSwitch: () => setTimeout(() => handleRunRef.current(), 80),
            });
        };
        // Peek-references cross-file jumps (⇧F12 popup rows in OTHER
        // files): the editor dispatches praxis:open-reference; the page
        // owns the guarded file-switch machinery, so the jump lands here
        // (same pattern as onOpenLocalHistory above).
        const onOpenReference = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string; line?: number } | undefined;
            if (!d?.folder || !d?.file) return;
            guardedSelectFile(d.folder, d.file, {
                afterSwitch: () => setTimeout(() => codeViewerRef.current?.jumpToLine(d.line ?? 1), 300),
            });
        };
        // "New file from selection…" — the editor's context menu captured
        // the selected code; open the naming dialog (rendered near the
        // other dialogs below).
        const onNewFileFromSel = (e: Event) => {
            const d = (e as CustomEvent).detail as { code?: string } | undefined;
            const selCode = typeof d?.code === "string" ? d.code : "";
            if (!selCode.trim()) return;
            setNewFileFromSel({
                code: selCode,
                fileName: "Snippet.py",
                folderSlug: selectedFolderSlug || "",
                busy: false,
                error: null,
            });
        };
        // "Compare ▸ With another file…" — opens the
        // side-by-side Compare two files dialog with the right-clicked
        // file preselected as the LEFT side.
        const onCompareFiles = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string } | undefined;
            const folder = d?.folder;
            const file = d?.file;
            if (!folder || !file) return;
            setCompareFilesPreselect({folderSlug: folder, fileSlug: file});
            setCompareFilesOpen(true);
        };
        // "Compare ▸ With clipboard…" — fetch the right-clicked file's
        // content (it may not be open in the editor) and pair it with the
        // current clipboard text.
        const onCompareClipboard = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string } | undefined;
            const folder = d?.folder;
            const file = d?.file;
            if (!folder || !file) return;
            void (async () => {
                try {
                    // raw-text /api/file (works for ANY file kind —
                    // the code route is .py-only).
                    const res = await fetch(
                        `/api/file?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`
                    );
                    if (!res.ok) return;
                    const content = await res.text();
                    let clip: string | null = null;
                    try {
                        clip = await navigator.clipboard.readText();
                    } catch {
                        clip = null; // permission denied / unsupported
                    }
                    setCompareClipboard({
                        fileName: d.file ?? "",
                        fileContent: content,
                        clipboardText: clip,
                    });
                } catch {
                    /* ignore */
                }
            })();
        };
        // "Open in Terminal" (Explorer right-click on a folder,
        //    subfolder or file) — the TerminalPanel (force-mounted) listens
        //    for the same event and cd's / starts a session; the page's job
        //    is just to reveal the Terminal tab of the bottom panel.
        const onTermCd = () => {
            setBottomPanelOpen(true);
            setBottomTab("terminal");
        };
        // "Run in Console" from the Explorer's file right-click —
        //    the tree fetches the file from disk and dispatches the SAME
        //    praxis:console-run event the menu-bar Run ▸ Run in console
        //    uses; the ConsolePanel runs it, the page reveals the tab.
        const onConsoleRun = () => {
            setBottomPanelOpen(true);
            setBottomTab("console");
        };
        // "Run Task…" from a task file's right-click (package.json /
        //    Makefile / justfile / pyproject.toml) — the page reveals the
        //    Tasks tab; the panel's own listener picks the file out of the
        //    event detail and runs its first task once the list loads.
        const onOpenTasks = () => {
            setBottomPanelOpen(true);
            setBottomTab("tasks");
        };
        // "Go to line…" from the editor's right-click — opens the
        //    same Navigate ▸ Go to line dialog the navbar button uses.
        const onGotoLineDialog = () => setGotoLineOpen(true);
        window.addEventListener("praxis:goto-line", onGotoLineEvt);
        window.addEventListener("praxis:open-file-line", onOpenFileLine);
        window.addEventListener("praxis:goto-line-dialog", onGotoLineDialog);
        window.addEventListener("praxis:run-with", onRunWith);
        window.addEventListener("praxis:open-local-history", onOpenLocalHistory);
        window.addEventListener("praxis:open-git-diff", onOpenGitDiff);
        window.addEventListener("praxis:goto-symbol", onGotoSymbol);
        window.addEventListener("praxis:goto-declaration", onGotoDecl);
        window.addEventListener("praxis:find-usages", onFindUsages);
        window.addEventListener("praxis:rename-symbol", onRename);
        window.addEventListener("praxis:show-quickfixes", onQuickFixes);
        window.addEventListener("praxis:format-current", onFormatCurrent);
        window.addEventListener("praxis:lint-current", onLintCurrent);
        window.addEventListener("praxis:new-file-from-selection", onNewFileFromSel);
        window.addEventListener("praxis:compare-clipboard", onCompareClipboard);
        window.addEventListener("praxis:compare-files", onCompareFiles);
        window.addEventListener("praxis:open-tasks", onOpenTasks);
        window.addEventListener("praxis:term-cd", onTermCd);
        window.addEventListener("praxis:console-run", onConsoleRun);
        window.addEventListener("PRAXIS_RERUN_RUN", onRerunRun);
        window.addEventListener("praxis:open-reference", onOpenReference);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("praxis:goto-line", onGotoLineEvt);
            window.removeEventListener("praxis:open-file-line", onOpenFileLine);
            window.removeEventListener("praxis:goto-line-dialog", onGotoLineDialog);
            window.removeEventListener("praxis:run-with", onRunWith);
            window.removeEventListener("praxis:open-local-history", onOpenLocalHistory);
            window.removeEventListener("praxis:open-git-diff", onOpenGitDiff);
            window.removeEventListener("praxis:goto-symbol", onGotoSymbol);
            window.removeEventListener("praxis:goto-declaration", onGotoDecl);
            window.removeEventListener("praxis:find-usages", onFindUsages);
            window.removeEventListener("praxis:rename-symbol", onRename);
            window.removeEventListener("praxis:show-quickfixes", onQuickFixes);
            window.removeEventListener("praxis:format-current", onFormatCurrent);
            window.removeEventListener("praxis:lint-current", onLintCurrent);
            window.removeEventListener("praxis:new-file-from-selection", onNewFileFromSel);
            window.removeEventListener("praxis:compare-clipboard", onCompareClipboard);
            window.removeEventListener("praxis:compare-files", onCompareFiles);
            window.removeEventListener("praxis:open-tasks", onOpenTasks);
            window.removeEventListener("praxis:term-cd", onTermCd);
            window.removeEventListener("praxis:console-run", onConsoleRun);
            window.removeEventListener("PRAXIS_RERUN_RUN", onRerunRun);
            window.removeEventListener("praxis:open-reference", onOpenReference);
            window.removeEventListener("keydown", onKey);
        };
    }, [toggleDistractionFree, toggleFullscreen, toggleTerminalPanel, selectedFileSlug, handleRun, isRunning, batchRunning, handleNavBack, handleNavForward]);

    /* ---------------------------------------------------------------- */
    /*  History interactions                                            */
    /* ---------------------------------------------------------------- */
    const handleHistorySelect = React.useCallback((entry: HistoryEntry) => {
        setHistoryOpen(false);
        // OPEN THE FILE
        // to show the output, why not opening the corresponding file
        // accordingly?"). History stores display names; resolve them to
        // slugs via the (ref-cached) folders list so the editor shows the
        // same file whose output is loaded below. When the folder/file no
        // longer exists, fall through silently — the output alone is still
        // useful.
        const ch = foldersRef.current.find((c) => c.name === entry.folder);
        const file = ch?.files.find((f) => f.name === entry.file);
        if (ch && file) {
            // guarded switch — the restored result loads after it.
            guardedSelectFile(ch.slug, file.slug);
        }
        // Restore the run result + figures from history (without re-running).
        setRunResult({
            ok: entry.ok,
            exitCode: entry.exitCode,
            stdout: entry.stdout,
            stderr: entry.stderr,
            figures: entry.figures,
            truncated: entry.truncated,
            killed: entry.killed,
            durationMs: entry.durationMs,
            isStreaming: false,
        });
        setIsRunning(false);
        toast({
            title: "Loaded from history",
            description: `${entry.file} · ${entry.folder}`,
            variant: "success",
        });
    }, [toast]);

    const handleHistoryClear = React.useCallback(() => {
        setHistory([]);
        saveHistory([]);
    }, []);

    /* ---------------------------------------------------------------- */
    /*  Export handlers                                                  */
    /*                                                                  */
    /*  Every handler accepts an OPTIONAL explicit target —             */
    /*  (folder, file, name) — so the Explorer's right-click Export ▸   */
    /*  submenu (which dispatches the praxis:export window event) can   */
    /*  export ANY file with the very same code path the navbar's      */
    /*  Tools ▸ Export uses. Without a target the CURRENT selection     */
    /*  exports, exactly as before. When the target IS the open file,   */
    /*  its latest run output, figures and notes join the report; for   */
    /*  any other file the source is read fresh from disk and the       */
    /*  run output is honestly omitted.                                 */

    /* ---------------------------------------------------------------- */

    /** The explicit export target passed by the Explorer's Export ▸
     *  submenu (praxis:export detail), or undefined for the navbar's
     *  "current file" behavior. */
    interface ExplicitExportTarget {
        folder?: string;
        file?: string;
        name?: string;
    }

    /** Resolve what an export should look at + whether the live editor
     *  buffer / runResult apply (only the OPEN file has those).
     *  `folderName` comes from the folders list for explicit targets. */
    const resolveExportTarget = React.useCallback(
        (t?: ExplicitExportTarget) => {
            const folderSlug = t?.folder ?? selectedFolderSlug;
            const fileSlug = t?.file ?? selectedFileSlug;
            const fileName = t?.name ?? selectedFile?.name;
            const isCurrent =
                !!folderSlug &&
                !!fileSlug &&
                folderSlug === selectedFolderSlug &&
                fileSlug === selectedFileSlug;
            const folderName = isCurrent
                ? (selectedFolder?.name ?? "")
                : (folders.find((f) => f.slug === folderSlug)?.name ?? folderSlug ?? "");
            const output = isCurrent ? runResult : null;
            return {folderSlug, fileSlug, fileName, isCurrent, folderName, output};
        },
        [selectedFolderSlug, selectedFileSlug, selectedFile, selectedFolder, folders, runResult]
    );

    /** Best-effort "current source": the live Python editor buffer when
     *  the target IS the open file, otherwise the file freshly read
     *  from disk (right-clicked files need not be open). Returns NULL
     *  when the file cannot be read as TEXT — binary kinds (images /
     *  media / pdf / sheets / parquet / sqlite) never had a source: the
     *  Code Viewer only mounts for .py, and the raw fallback refuses
     *  them — so every client-side export (TXT / JSON / PDF / Copy as
     *  Markdown / LaTeX / RST / session report) must STOP with a clear
     *  message instead of shipping an empty Source section with a
     *  success toast. */
    const getCurrentSource = React.useCallback(
        async (t?: ExplicitExportTarget): Promise<string | null> => {
            const {folderSlug, fileSlug, isCurrent} = resolveExportTarget(t);
            if (isCurrent) {
                const live = codeViewerRef.current?.getBuffer();
                if (typeof live === "string" && live.length > 0) return live;
                if (code?.content) return code.content;
            }
            if (!folderSlug || !fileSlug) return null;
            // 1. The Python route (only ever resolves .py).
            try {
                const res = await fetch(
                    `/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                );
                const data = await res.json();
                if (res.ok && typeof data.content === "string") return data.content;
            } catch { /* fall through */
            }
            // 2. RAW text fallback — works for EVERY text-ish file kind.
            //    Known text MIMEs pass as-is; octet-stream / unknown types
            //    (zig, dart, groovy…) are read and SNIFFED for NUL bytes,
            //    which any binary file produces when decoded as text — so
            //    real code exports while images / media / sheets stay out.
            try {
                const res = await fetch(
                    `/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                );
                if (res.ok) {
                    const mime = (res.headers.get("content-type") ?? "").toLowerCase();
                    const knownText =
                        mime.startsWith("text/") ||
                        /^application\/(json|xml|javascript|toml|yaml|sql|csv|tab-separated-values|x-[a-z+-]+)/.test(mime);
                    if (knownText || mime.includes("octet-stream") || mime === "") {
                        const text = await res.text();
                        if (text.length > 0 && !text.includes("\u0000")) return text;
                    }
                }
            } catch { /* fall through to null */
            }
            return null;
        },
        [resolveExportTarget, code?.content]
    );

    /** Shared helper — build the (title, body) sections every report
     *  format renders: source, stdout, stderr, notes. Each format then
     *  wraps them in its own markup (LaTeX, RST, HTML). Notes live in
     *  the ScriptNotes component's localStorage pocket — read straight
     *  from there (same key convention, no state plumbing needed). */
    const collectReportSections = React.useCallback(
        async (t?: ExplicitExportTarget): Promise<Array<{ title: string; body: string }> | null> => {
            const {folderSlug, fileSlug, output} = resolveExportTarget(t);
            const source = await getCurrentSource(t);
            if (source === null) return null;
            // Structured sources (.jsonl/.json) render READABLY instead of
            // dumping raw JSON bytes into the report body.
            const formatted = formatExportSource(
                t?.name ?? (fileSlug ? decodeURIComponent(fileSlug) : ""),
                source
            );
            let savedNotes = "";
            try {
                savedNotes =
                    window.localStorage.getItem(`praxis.notes.${folderSlug}.${fileSlug}`) ?? "";
            } catch { /* storage blocked — notes omitted */
            }
            const sections: Array<{ title: string; body: string }> = [
                {title: "Source", body: formatted},
            ];
            if (output?.stdout) sections.push({title: "stdout", body: output.stdout});
            if (output?.stderr) sections.push({title: "stderr", body: output.stderr});
            if (savedNotes.trim()) sections.push({title: "Notes", body: savedNotes});
            return sections;
        },
        [getCurrentSource, resolveExportTarget]
    );

    const handleExportMd = React.useCallback(async (t?: ExplicitExportTarget) => {
        // A run is OPTIONAL: the report carries whatever output exists and
        // exports the source alone otherwise. Only a missing FILE selection
        // blocks the export, and that case now says so.
        const {folderSlug, fileSlug, fileName, isCurrent, output} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            // Live buffer FIRST (same source of truth as the .txt/.json
            // exports — the server route used to re-read disk, so unsaved
            // editor edits silently vanished from md/ipynb/html exports).
            // Structured files (.jsonl/.json) also render readably.
            const liveSource = await getCurrentSource(t);
            const res = await fetch("/api/export/md", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    stdout: output?.stdout ?? "",
                    stderr: output?.stderr ?? "",
                    figures: output?.figures?.map((f) => f.name) ?? [],
                    runId: isCurrent ? currentRunId : undefined,
                    source:
                        liveSource !== null
                            ? formatExportSource(fileName, liveSource)
                            : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            downloadBlob(new Blob([data.markdown], {type: "text/markdown"}), data.filename ?? "export.md");
            announceAction({title: "Markdown exported", description: data.filename, variant: "success"});
        } catch (err) {
            announceAction({
                title: "Export failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    }, [resolveExportTarget, currentRunId, announceAction, getCurrentSource]);

    const handleExportIpynb = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, output, isCurrent} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            // Live buffer first (see the .md handler) — unsaved edits belong
            // in the exported notebook too.
            const liveSource = await getCurrentSource(t);
            const res = await fetch("/api/export/ipynb", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    stdout: output?.stdout ?? "",
                    stderr: output?.stderr ?? "",
                    figures: output?.figures ?? [],
                    // runId was never sent — the route requires
                    // it to resolve the run's figure FILES, so every exported
                    // notebook replaced each figure with a "[figure: …]" text
                    // cell instead of the base64 PNG. Same shape the HTML
                    // handler already sends.
                    runId: isCurrent ? currentRunId : undefined,
                    source: liveSource ?? undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            downloadBlob(
                new Blob([JSON.stringify(data.notebook, null, 1)], {type: "application/x-ipynb+json"}),
                data.filename ?? "export.ipynb"
            );
            announceAction({title: "Jupyter notebook exported", description: data.filename, variant: "success"});
        } catch (err) {
            announceAction({
                title: "Export failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    }, [resolveExportTarget, currentRunId, announceAction, getCurrentSource]);

    const handleExportHtml = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, isCurrent, output} = resolveExportTarget(t);
        // A run is OPTIONAL for the source-only export (same fix as the
        // Markdown handler): only a missing FILE blocks the export.
        if (!folderSlug || !fileSlug || !fileName) return;
        try {
            // Live buffer first (see the .md handler).
            const liveSource = await getCurrentSource(t);
            const res = await fetch("/api/export/html", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    stdout: output?.stdout ?? "",
                    stderr: output?.stderr ?? "",
                    figures: output?.figures?.map((f) => f.name),
                    runId: isCurrent ? currentRunId : undefined,
                    source:
                        liveSource !== null
                            ? formatExportSource(fileName, liveSource)
                            : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            downloadBlob(new Blob([data.html], {type: "text/html"}), data.filename ?? "export.html");
            announceAction({title: "HTML exported", description: data.filename, variant: "success"});
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, currentRunId, announceAction, getCurrentSource]);

    /** Tools ▸ Export ▸ Plain text — the script + its (optional) output
     *  as one .txt file. Client-side only: no server round-trip needed,
     *  the content comes from the live editor buffer. */
    const handleExportTxt = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, output} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            const source = await getCurrentSource(t);
            if (source === null) {
                announceAction({
                    title: "Nothing to export",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            // Structured files export READABLY: Records.jsonl → .txt renders
            // one `key: value` block per record instead of raw JSON lines;
            // .json pretty-prints. Code/markdown/plain text pass through.
            const rendered = formatExportSource(fileName, source);
            const parts = [
                `${fileName} — exported ${new Date().toLocaleString()}`,
                "=".repeat(60),
                "",
                "## Source",
                "",
                rendered,
            ];
            if (output) {
                parts.push("", "## stdout", "", output.stdout ?? "");
                if (output.stderr) parts.push("", "## stderr", "", output.stderr);
            }
            downloadBlob(new Blob([parts.join("\n")], {type: "text/plain"}), `${fileName.replace(/\.[^.]+$/, "")}.txt`);
            announceAction({title: "Plain text exported", description: `${fileName} → .txt`, variant: "success"});
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, getCurrentSource, announceAction]);

    /** Tools ▸ Export ▸ JSON bundle — a machine-readable record of the
     *  script, its output and metadata (nice for archival / grading). */
    const handleExportJson = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, folderName, output} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            const source = await getCurrentSource(t);
            if (source === null) {
                announceAction({
                    title: "Nothing to export",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            const bundle = {
                file: fileName,
                folder: folderName,
                exportedAt: new Date().toISOString(),
                // byteSize now counts actual BYTES (UTF-8), not
                // UTF-16 code units — non-ASCII sources mis-reported.
                byteSize: new TextEncoder().encode(source).length,
                source,
                // A .jsonl source additionally ships as a parsed records ARRAY
                // so the bundle is machine-readable end to end (the raw lines
                // stay in `source`; malformed lines are skipped individually).
                ...(fileName.toLowerCase().endsWith(".jsonl") || fileName.toLowerCase().endsWith(".ndjson")
                    ? {
                        records: source
                            .split("\n")
                            .map((l) => l.trim())
                            .filter(Boolean)
                            .map((l) => {
                                try {
                                    return JSON.parse(l);
                                } catch {
                                    return null;
                                }
                            })
                            .filter((r) => r !== null),
                    }
                    : {}),
                output: output
                    ? {
                        stdout: output.stdout ?? "",
                        stderr: output.stderr ?? "",
                        durationMs: output.durationMs ?? null,
                        figures: (output.figures ?? []).map((f) => f.name),
                    }
                    : null,
            };
            downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], {type: "application/json"}), `${fileName.replace(/\.[^.]+$/, "")}.json`);
            announceAction({title: "JSON bundle exported", description: `${fileName} → .json`, variant: "success"});
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, getCurrentSource, announceAction]);

    /** Tools ▸ Export ▸ PDF (print) — opens a print-ready window with the
     *  source + output and brings up the browser's Save-as-PDF dialog.
     *  Works fully offline; no PDF library needed. */
    const handleExportPdf = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, folderName, output} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            const source = await getCurrentSource(t);
            if (source === null) {
                announceAction({
                    title: "Nothing to export",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            const esc = (s: string) =>
                s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
            // Same readable rendering as the .txt export (jsonl records as
            // key: value blocks, .json pretty-printed).
            const rendered = formatExportSource(fileName, source);
            const html =
                `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fileName)}</title>` +
                `<style>` +
                `body{font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:24px;color:#111}` +
                `h1{font:600 16px/1.4 system-ui,sans-serif;margin:0 0 4px}` +
                `.meta{color:#666;font:11px system-ui,sans-serif;margin-bottom:16px;display:block}` +
                `h2{font:600 12px system-ui,sans-serif;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}` +
                `pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f7;border:1px solid #e4e4e4;border-radius:6px;padding:10px;font-size:11px}` +
                `@media print{body{margin:8mm}}` +
                `</style></head><body>` +
                `<h1>${esc(fileName)}</h1>` +
                `<div class="meta">${esc(folderName)} · exported ${new Date().toLocaleString()}</div>` +
                `<h2>Source</h2><pre>${esc(rendered)}</pre>` +
                (output
                    ? `<h2>stdout</h2><pre>${esc(output.stdout ?? "")}</pre>` +
                    (output.stderr ? `<h2>stderr</h2><pre>${esc(output.stderr)}</pre>` : "")
                    : "") +
                `</body></html>`;
            const win = window.open("", "_blank", "width=820,height=900");
            if (!win) {
                announceAction({
                    title: "Pop-up blocked",
                    description: "Allow pop-ups for this page, then try Export ▸ PDF again.",
                    variant: "destructive"
                });
                return;
            }
            win.document.write(html);
            win.document.close();
            // Give the sheet a beat to lay out before the print dialog.
            win.focus();
            setTimeout(() => win.print(), 350);
            announceAction({
                title: "Print sheet ready",
                description: "Choose \"Save as PDF\" in the print dialog.",
                variant: "success"
            });
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, getCurrentSource, announceAction]);

    /** 1. LaTeX report (.tex) — a document with lstlisting blocks; runs
     *  through pdflatex / Overleaf as-is (Praxis supports .tex files, so
     *  the export round-trips into the IDE itself). */
    const handleExportLatex = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            const sections = await collectReportSections(t);
            if (sections === null) {
                announceAction({
                    title: "Nothing to export",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            const texEsc = (s: string) =>
                s.replace(/\\/g, "\\textbackslash{}").replace(/[&$#_%{}]/g, (c) => `\\${c}`).replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
            const safeTitle = texEsc(fileName);
            const body = sections
                .map((s) => `\\section*{${texEsc(s.title)}}\n\\begin{lstlisting}[breaklines]\n${s.body.replace(/\n$/, "")}\n\\end{lstlisting}`)
                .join("\n\n");
            const tex =
                `% Generated by Praxis on ${new Date().toISOString()}\n` +
                `\\documentclass[11pt]{article}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{listings}\n\\usepackage{xcolor}\n` +
                `\\lstset{basicstyle=\\ttfamily\\small, breaklines=true, frame=single, backgroundcolor=\\color{gray!8}}\n` +
                `\\begin{document}\n\\begin{center}{\\LARGE \\bfseries ${safeTitle}}\\end{center}\n\n${body}\n\n\\end{document}\n`;
            const blob = new Blob([tex], {type: "application/x-tex"});
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${fileName.replace(/\.[^.]+$/, "")}.tex`;
            a.click();
            URL.revokeObjectURL(a.href);
            announceAction({
                title: "LaTeX exported",
                description: `${fileName} → .tex (pdflatex-ready)`,
                variant: "success"
            });
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, announceAction, collectReportSections]);

    /** 2. reStructuredText report (.rst) — Sphinx / docs tooling format. */
    const handleExportRst = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, folderName} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            const sections = await collectReportSections(t);
            if (sections === null) {
                announceAction({
                    title: "Nothing to export",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            const underline = (s: string, ch: string) => ch.repeat(Math.max(4, s.length));
            const parts = [
                fileName,
                underline(fileName, "="),
                "",
                `.. container:: metadata`,
                "",
                `   Exported from Praxis — ${folderName} — ${new Date().toLocaleString()}`,
                "",
            ];
            for (const s of sections) {
                parts.push(s.title, underline(s.title, "-"), "", ".. code-block:: none", "", ...s.body.split("\n").map((l) => `   ${l}`), "");
            }
            const blob = new Blob([parts.join("\n")], {type: "text/x-rst"});
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${fileName.replace(/\.[^.]+$/, "")}.rst`;
            a.click();
            URL.revokeObjectURL(a.href);
            announceAction({
                title: "reStructuredText exported",
                description: `${fileName} → .rst (Sphinx-ready)`,
                variant: "success"
            });
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, announceAction, collectReportSections]);

    /** 3. Session report (self-contained HTML) — code + output + notes +
     *  figure thumbnails in ONE styled page; the homework-submission
     *  format. Figures embed as <img> pointing at the figure API (they
     *  render while the server is up); the page also prints well. */
    const handleExportSessionReport = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, folderName, output} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({
                title: "Nothing to export",
                description: "Open a file first, then export it from the Tools menu.",
                variant: "destructive"
            });
            return;
        }
        try {
            const source = await getCurrentSource(t);
            if (source === null) {
                announceAction({
                    title: "Nothing to export",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            let savedNotes = "";
            try {
                savedNotes =
                    window.localStorage.getItem(`praxis.notes.${folderSlug}.${fileSlug}`) ?? "";
            } catch { /* storage blocked */
            }
            const esc = (s: string) =>
                s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
            const figures = output?.figures ?? [];
            // Figures embed as DATA URIS (fetched + base64) — the old
            // src="/api/figure/…" broke every image the moment Praxis wasn't
            // running, which defeated the point of a "self-contained" report.
            const figureSrcs = await Promise.all(
                figures.map(async (f) => {
                    try {
                        const res = await fetch(f.url);
                        if (!res.ok) return {url: f.url, name: f.name, ok: false as const};
                        const blob = await res.blob();
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = () => reject(reader.error);
                            reader.readAsDataURL(blob);
                        });
                        return {url: dataUrl, name: f.name, ok: true as const};
                    } catch {
                        return {url: f.url, name: f.name, ok: false as const};
                    }
                })
            );
            const figHtml = figureSrcs.length
                ? `<h2>Figures</h2><div class="figs">${figureSrcs
                    .map(
                        (f) =>
                            `<figure><img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy"/><figcaption>${esc(f.name)}${f.ok ? "" : " (image needs Praxis running)"}</figcaption></figure>`
                    )
                    .join("")}</div>`
                : "";
            const notesHtml = savedNotes.trim()
                ? `<h2>Notes</h2><pre class="notes">${esc(savedNotes)}</pre>`
                : "";
            const outHtml = output
                ? `<h2>stdout</h2><pre>${esc(output.stdout ?? "")}</pre>` +
                (output.stderr ? `<h2>stderr</h2><pre class="err">${esc(output.stderr)}</pre>` : "")
                : "";
            const html =
                `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
                `<title>Session report — ${esc(fileName)}</title><style>` +
                `:root{color-scheme:light}` +
                `body{font:14px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:40px 20px;background:#fafafa;color:#18181b}` +
                `.sheet{max-width:860px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:36px 44px;box-shadow:0 1px 3px rgba(0,0,0,.06)}` +
                `h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#52525b;margin:28px 0 10px;border-bottom:1px solid #e4e4e7;padding-bottom:6px}` +
                `.meta{color:#71717a;font-size:12px;margin-bottom:8px}` +
                `.badge{display:inline-block;background:#dcfce7;color:#166534;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;margin-right:6px}` +
                `pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f8;border:1px solid #e4e4e7;border-radius:8px;padding:14px;font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;overflow-x:auto}` +
                `pre.err{background:#fef2f2;border-color:#fecaca;color:#7f1d1d}` +
                `pre.notes{background:#fffbeb;border-color:#fde68a}` +
                `.figs{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}` +
                `figure{margin:0;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:10px;text-align:center}` +
                `figure img{max-width:100%;height:auto;border-radius:4px}` +
                `figcaption{font-size:11px;color:#71717a;margin-top:6px}` +
                `@media print{body{background:#fff;padding:0}.sheet{border:0;box-shadow:none;padding:0}}` +
                `</style></head><body><div class="sheet">` +
                `<h1>Session Report</h1>` +
                `<div class="meta">` +
                `<span class="badge">${esc(fileName)}</span>` +
                `<span class="badge">${esc(folderName)}</span>` +
                (output ? `<span class="badge">${((output.durationMs ?? 0) / 1000).toFixed(1)}s</span>` : "") +
                `generated ${new Date().toLocaleString()}</div>` +
                `<h2>Source</h2><pre>${esc(source)}</pre>` +
                outHtml + figHtml + notesHtml +
                `</div></body></html>`;
            const blob = new Blob([html], {type: "text/html"});
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${fileName.replace(/\.[^.]+$/, "")}-session-report.html`;
            a.click();
            URL.revokeObjectURL(a.href);
            announceAction({
                title: "Session report exported",
                description: "Code + output + figures + notes in one HTML page",
                variant: "success"
            });
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, announceAction, getCurrentSource]);

    /** 4. Copy as Markdown — the report on the CLIPBOARD (paste straight
     *  into a PR, an issue, or a chat). */
    const handleCopyAsMarkdown = React.useCallback(async (t?: ExplicitExportTarget) => {
        const {folderSlug, fileSlug, fileName, folderName} = resolveExportTarget(t);
        if (!folderSlug || !fileSlug || !fileName) {
            announceAction({title: "Nothing to copy", description: "Open a file first.", variant: "destructive"});
            return;
        }
        try {
            const sections = await collectReportSections(t);
            if (sections === null) {
                announceAction({
                    title: "Nothing to copy",
                    description: `${fileName} cannot be read as text (binary or missing) — use Download instead.`,
                    variant: "destructive"
                });
                return;
            }
            const parts = [
                `# ${fileName}`,
                "",
                `> Exported from Praxis — ${folderName} — ${new Date().toLocaleString()}`,
                "",
            ];
            for (const s of sections) {
                // Dynamic fence — a body that itself contains ``` would close
                // the block early.
                const runs = s.body.match(/`{3,}/g);
                const fence = "`".repeat(runs ? Math.max(3, ...runs.map((r) => r.length + 1)) : 3);
                parts.push(`## ${s.title}`, "", fence, s.body.replace(/\n$/, ""), fence, "");
            }
            const md = parts.join("\n");
            await navigator.clipboard.writeText(md);
            announceAction({
                title: "Markdown copied",
                description: `${md.length.toLocaleString()} characters on the clipboard`,
                variant: "success"
            });
        } catch (err) {
            announceAction({title: "Copy failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [resolveExportTarget, announceAction, collectReportSections]);

    /** 5. GitHub-ready repository (.zip) — the whole folder plus
     *  scaffold files the round-trip zip lacks: README.md, .gitignore,
     *  and requirements.txt (only the ones missing on disk are injected,
     *  and only when the folder has no git repo of its own). The
     *  explicit target lets the Explorer's folder/file right-click
     *  Export ▸ reuse the exact navbar flow. */
    const handleExportGithubRepo = React.useCallback(async (t?: ExplicitExportTarget) => {
        const folderSlug = t?.folder ?? selectedFolderSlug;
        const folderName = t?.folder
            ? (folders.find((f) => f.slug === t.folder)?.name ?? "")
            : (selectedFolder?.name ?? "");
        if (!folderSlug || !folderName) {
            announceAction({
                title: "No folder selected",
                description: "Open a folder in the explorer first.",
                variant: "destructive"
            });
            return;
        }
        try {
            const res = await fetch(`/api/folder-zip?folder=${encodeURIComponent(folderSlug)}&scaffold=github`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({error: `HTTP ${res.status}`}));
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${folderName.replace(/[^A-Za-z0-9 _\-.()]/g, "_")}-github.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
            announceAction({
                title: "GitHub-ready repo exported",
                description: `${folderName}.zip with README, .gitignore and requirements.txt`,
                variant: "success"
            });
        } catch (err) {
            announceAction({title: "Export failed", description: (err as Error).message, variant: "destructive"});
        }
    }, [folders, selectedFolderSlug, selectedFolder, announceAction]);

    /** The Explorer's right-click Export ▸ router — one window event
     *  (praxis:export) carrying the right-clicked file; each kind lands
     *  in the very handler the navbar's Tools ▸ Export button uses. */
    const routeFileExport = React.useCallback(
        (d: FileExportDetail) => {
            const t: ExplicitExportTarget = {folder: d.folder, file: d.file, name: d.name};
            switch (d.kind) {
                case "md":
                    return void handleExportMd(t);
                case "ipynb":
                    return void handleExportIpynb(t);
                case "html":
                    return void handleExportHtml(t);
                case "txt":
                    return void handleExportTxt(t);
                case "json":
                    return void handleExportJson(t);
                case "pdf":
                    return void handleExportPdf(t);
                case "session":
                    return void handleExportSessionReport(t);
                case "latex":
                    return void handleExportLatex(t);
                case "rst":
                    return void handleExportRst(t);
                case "copy-md":
                    return void handleCopyAsMarkdown(t);
                case "github":
                    return void handleExportGithubRepo({folder: d.folder});
            }
        },
        [handleExportMd, handleExportIpynb, handleExportHtml, handleExportTxt, handleExportJson, handleExportPdf, handleExportSessionReport, handleExportLatex, handleExportRst, handleCopyAsMarkdown, handleExportGithubRepo]
    );

    /** Navbar Tools ▸ Export ▸ "Compress … to ZIP…" — opens the shared
     *  compress dialog aimed at the CURRENT file / folder (the
     *  Explorer's right-click menus aim it at whatever was clicked). */
    const handleCompressCurrentFile = React.useCallback(() => {
        if (!selectedFolderSlug || !selectedFileSlug || !selectedFile) {
            announceAction({title: "Nothing to compress", description: "Open a file first.", variant: "destructive"});
            return;
        }
        requestCompress({kind: "file", folder: selectedFolderSlug, file: selectedFileSlug, name: selectedFile.name});
    }, [selectedFolderSlug, selectedFileSlug, selectedFile, announceAction]);

    const handleCompressCurrentFolder = React.useCallback(() => {
        if (!selectedFolderSlug || !selectedFolder) {
            announceAction({
                title: "Nothing selected",
                description: "Open a folder in the explorer first.",
                variant: "destructive"
            });
            return;
        }
        requestCompress({kind: "folder", folder: selectedFolderSlug, name: selectedFolder.name});
    }, [selectedFolderSlug, selectedFolder, announceAction]);

    /* ── Explorer-event wiring — the right-click Export ▸ router
        (praxis:export), "Run with coverage…" (praxis:run-coverage)
        and the post-compress tree refresh (praxis:refresh-folders). */
    React.useEffect(() => {
        const onFileExport = (e: Event) => {
            const d = (e as CustomEvent).detail as FileExportDetail | undefined;
            if (!d || !d.folder) return;
            routeFileExport(d);
        };
        const onRunCoverage = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string } | undefined;
            if (!d?.folder || !d?.file) return;
            if (d.folder === selectedFolderSlug && d.file === selectedFileSlug) {
                setTraceCoverageOverride(true);
                void doRun();
                return;
            }
            // Right-clicked another file: open it, let the settle-effect
            // below fire the coverage run once the selection lands.
            pendingCoverageRunRef.current = {folder: d.folder, file: d.file};
            handleOpenFileAt(d.folder, d.file);
        };
        const onRefreshFolders = () => void refreshFolders({silent: true});
        window.addEventListener(FILE_EXPORT_EVENT, onFileExport);
        window.addEventListener("praxis:run-coverage", onRunCoverage);
        window.addEventListener("praxis:refresh-folders", onRefreshFolders);
        return () => {
            window.removeEventListener(FILE_EXPORT_EVENT, onFileExport);
            window.removeEventListener("praxis:run-coverage", onRunCoverage);
            window.removeEventListener("praxis:refresh-folders", onRefreshFolders);
        };
    }, [routeFileExport, doRun, handleOpenFileAt, refreshFolders, selectedFolderSlug, selectedFileSlug]);

    /* Fires the armed coverage run once the right-clicked file's
     selection lands (see pendingCoverageRunRef above). */
    React.useEffect(() => {
        const pending = pendingCoverageRunRef.current;
        if (!pending) return;
        if (selectedFolderSlug === pending.folder && selectedFileSlug === pending.file) {
            pendingCoverageRunRef.current = null;
            setTraceCoverageOverride(true);
            void doRun();
        }
    }, [selectedFolderSlug, selectedFileSlug, doRun]);

    const handleInstallDeps = React.useCallback(async () => {
        if (!selectedFolderSlug) return;
        setInstallDepsOpen(true);
        setInstallDepsLog("");
        setInstallDepsRunning(true);
        try {
            const res = await fetch("/api/install-deps", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: selectedFolderSlug}),
            });
            if (!res.ok || !res.body) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `HTTP ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
                const {done, value} = await reader.read();
                noteSseBytes(value?.byteLength ?? 0);
                if (done) break;
                buf += decoder.decode(value, {stream: true});
                // Parse SSE lines.
                const parts = buf.split("\n\n");
                buf = parts.pop() ?? "";
                for (const part of parts) {
                    for (const line of part.split("\n")) {
                        if (!line.startsWith("data: ")) continue;
                        try {
                            const evt = JSON.parse(line.slice(6));
                            if (evt.type === "stdout" || evt.type === "stderr") {
                                setInstallDepsLog((prev) => prev + evt.text);
                            } else if (evt.type === "end") {
                                toast({
                                    title: evt.ok ? "Install complete" : "Install failed",
                                    description: `Exit ${evt.exitCode ?? "?"} · ${((evt.durationMs ?? 0) / 1000).toFixed(1)}s`,
                                    variant: evt.ok ? "default" : "destructive",
                                });
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                }
            }
        } catch (err) {
            setInstallDepsLog((prev) => prev + `\nError: ${(err as Error).message}\n`);
        } finally {
            setInstallDepsRunning(false);
        }
    }, [selectedFolderSlug, toast]);

    /* ---------------------------------------------------------------- */
    /*  Jupyter notebook import (drag-drop .ipynb → /api/import-ipynb)  */
    /* ---------------------------------------------------------------- */
    const handleImportNotebook = React.useCallback(
        async (file: File) => {
            if (!selectedFolderSlug) {
                toast({
                    title: "Select a folder first",
                    description: "Pick a folder to import the notebook into.",
                    variant: "destructive",
                });
                return;
            }
            if (!file.name.toLowerCase().endsWith(".ipynb")) {
                toast({
                    title: "Not a Jupyter notebook",
                    description: "Please drop a .ipynb file.",
                    variant: "destructive",
                });
                return;
            }
            setImporting(true);
            try {
                const text = await file.text();
                const notebook = JSON.parse(text);
                const res = await fetch("/api/import-ipynb", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: selectedFolderSlug,
                        notebook,
                        fileName: file.name,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                toast({
                    title: "Notebook imported",
                    description: `${data.file} added to ${selectedFolder?.name}`,
                });
                // Refresh folders to pick up the new .py file.
                refreshFolders();
            } catch (err) {
                toast({
                    title: "Import failed",
                    description: (err as Error).message,
                    variant: "destructive",
                });
            } finally {
                setImporting(false);
            }
        },
        [selectedFolderSlug, selectedFolder, toast, refreshFolders]
    );

    /* ---------------------------------------------------------------- */
    /*  Import .py file (drag-drop or file picker)                      */
    /* ---------------------------------------------------------------- */
    const handleImportPyFile = React.useCallback(
        async (file: File) => {
            if (!selectedFolderSlug) {
                toast({
                    title: "Select a folder first",
                    description: "Pick a folder to import the script into.",
                    variant: "destructive",
                });
                return;
            }
            setImporting(true);
            try {
                // Read the file content and POST it as form data to a new
                // endpoint that writes it into the folder folder.
                const folderName = selectedFolder?.name ?? "";
                if (!folderName) throw new Error("No folder selected");
                const text = await file.text();
                // Write via the import-ipynb endpoint's path logic — but for
                // .py files we just write the raw content directly.
                const res = await fetch("/api/import-py", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: selectedFolderSlug,
                        fileName: file.name,
                        content: text,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                toast({
                    title: "Script imported",
                    description: `${data.file} added to ${folderName}`,
                });
                refreshFolders();
            } catch (err) {
                toast({
                    title: "Import failed",
                    description: (err as Error).message,
                    variant: "destructive",
                });
            } finally {
                setImporting(false);
            }
        },
        [selectedFolderSlug, selectedFolder, toast, refreshFolders]
    );

    /** Mark a tab as dirty (has unsaved edit changes) or clean. Called
     * from CodeViewer's onSaveEdit handler — when the user starts
     * editing, we set dirty=true; when the save succeeds, dirty=false.
     * Declared here (before handleSaveEdit) so the save handler can
     * reference it without a use-before-declaration error.
     *
     * CRITICAL: We early-return if the dirty value didn't actually
     * change, returning the SAME array reference. This prevents an
     * infinite re-render loop: setOpenTabs(prev => prev.map(...))
     * always creates a new array even when no values change, which
     * triggers a re-render, which creates a new onDirtyChange callback
     * in page.tsx, which fires CodeViewer's dirty-state effect, which
     * calls setTabDirty again → loop → "Maximum update depth exceeded". */
    const setTabDirty = React.useCallback((tabId: string, dirty: boolean) => {
        setOpenTabs((prev) => {
            const tab = prev.find((t) => t.id === tabId);
            // No-op if the tab doesn't exist or the dirty value is the same.
            // Returning `prev` (same reference) tells React nothing changed.
            if (!tab || tab.dirty === dirty) return prev;
            return prev.map((t) => (t.id === tabId ? {...t, dirty} : t));
        });
    }, []);

    /* PERF: STABLE viewer-dirty reporter shared by CodeViewer and
   * FileViewer. The previous inline arrow got a new identity on every
   * page render (each SSE stdout chunk, toast, timer tick…), which
   * defeated both editors' React.memo and re-rendered the 390KB
   * editor subtree for every one of those. The identity now changes
   * only when the ACTIVE TAB changes. */
    const handleViewerDirtyChange = React.useCallback(
        (dirty: boolean) => {
            viewerDirtyRef.current = dirty;
            if (activeTabId) setTabDirty(activeTabId, dirty);
        },
        [activeTabId, setTabDirty]
    );

    /* PERF: memoized runtime-variables shape for CodeViewer — the old
   * inline .map() built a fresh array per render, defeating the
   * memoized editor on every page state change while a run had live
   * variables. */
    const runtimeVariablesForEditor = React.useMemo(
        () =>
            runResult?.variables && runResult.variables.length > 0
                ? runResult.variables.map((v) => ({name: v.name, type: v.type, repr: v.repr}))
                : null,
        [runResult?.variables]
    );
    /* PERF: stable data-files-browser opener for the OutputPanel prop. */
    const handleOpenDataFiles = React.useCallback(() => {
        setDataFileBrowserOpen(true);
    }, []);

    /* ---------------------------------------------------------------- */
    /*  Save code edit (inline edit → POST /api/import-py)              */
    /* ---------------------------------------------------------------- */
    const handleSaveEdit = React.useCallback(
        async (
            content: string,
            identity?: { folderSlug?: string; fileSlug?: string }
        ) => {
            if (!selectedFolderSlug || !selectedFile) return;
            // reject stale saves. A pending autosave timer
            // captured the previous file's buffer; if the user switched
            // files before it fired, writing here would overwrite the newly
            // selected file with the old file's content.
            if (
                identity &&
                (identity.folderSlug !== selectedFolderSlug ||
                    identity.fileSlug !== selectedFileSlug)
            ) {
                return;
            }
            let finalContent = content;
            try {
                // save-time hygiene — trim trailing whitespace
                // and normalize the final newline BEFORE black runs, so the
                // formatter (and the file on disk) never sees dirty endings.
                // Both are pure string ops (offline, instant), unlike black.
                if (settings.trimTrailingOnSave) {
                    finalContent = finalContent.replace(/[ \t]+(?=\r?\n)/g, "").replace(/[ \t]+$/, "");
                }
                if (settings.finalNewlineOnSave) {
                    finalContent = finalContent.replace(/\s*$/, "\n");
                }
                // Auto-format with black if enabled. Pass the user's edited
                // `content` to /api/format so black runs on the EDITED source,
                // not the on-disk (pre-edit) source. (Reading from disk here
                // would run black on the OLD content and the save flow would
                // then write that OLD-formatted content back to disk
                // — silently discarding the user's edits.)
                if (settings.autoFormatOnSave) {
                    // Organize imports FIRST (ruff `--select I --fix`) when the
                    // setting is on and the saved file is Python — the organized
                    // output then flows into the format pass below (organize,
                    // then format). An organize failure (ruff not installed,
                    // ruff error) only toasts; the save continues with the
                    // unmodified content.
                    let toFormat = content;
                    if (settings.organizeImportsOnSave && isPythonFile) {
                        try {
                            const orgRes = await fetch("/api/format", {
                                method: "POST",
                                headers: {"Content-Type": "application/json"},
                                body: JSON.stringify({
                                    folder: selectedFolderSlug,
                                    file: selectedFileSlug,
                                    content,
                                    interpreter: settings.pythonInterpreter || undefined,
                                    settings: formatRequestSettings(settings),
                                    mode: "organize",
                                }),
                            });
                            const orgData = (await orgRes.json().catch(() => null)) as
                                | { ok?: boolean; formatted?: string; error?: string }
                                | null;
                            if (orgRes.ok && orgData && orgData.ok !== false && typeof orgData.formatted === "string") {
                                toFormat = orgData.formatted;
                                finalContent = orgData.formatted;
                            } else if (!orgRes.ok) {
                                toast({
                                    title: "Organize imports failed",
                                    description: String(orgData?.error ?? `HTTP ${orgRes.status}`),
                                    variant: "destructive",
                                });
                            }
                        } catch {
                            // organize unreachable — the format pass below still
                            // runs on the unmodified content.
                        }
                    }
                    try {
                        const fmtRes = await fetch("/api/format", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({
                                folder: selectedFolderSlug,
                                file: selectedFileSlug,
                                content: toFormat,
                                interpreter: settings.pythonInterpreter || undefined,
                                // the live Formatting options (quote style,
                                // max blank lines, trim, line endings…) ride along —
                                // secrets stripped (formatRequestSettings).
                                settings: formatRequestSettings(settings),
                            }),
                        });
                        if (fmtRes.ok) {
                            const fmtData = await fmtRes.json();
                            if (fmtData.formatted) {
                                finalContent = fmtData.formatted;
                            }
                        }
                    } catch {
                        // Format failed — save the unformatted content.
                    }
                }
                // OFFLINE WRITES: a network-level failure while offline queues
                // the save for an ordered replay on reconnect.
                let res: Response;
                try {
                    res = await fetch("/api/import-py", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            folder: selectedFolderSlug,
                            fileName: selectedFile.name,
                            content: finalContent,
                        }),
                    });
                } catch (netErr) {
                    if (typeof navigator !== "undefined" && !navigator.onLine) {
                        const queued = queueOfflineWrite({
                            url: "/api/import-py",
                            method: "POST",
                            body: {
                                folder: selectedFolderSlug,
                                fileName: selectedFile.name,
                                content: finalContent,
                            },
                            label: `Save ${selectedFile.name}`,
                            fileKey: `${selectedFolderSlug}/${selectedFileSlug}`,
                        });
                        if (queued.ok) {
                            announceAction({
                                title: "Saved offline",
                                description: `${selectedFile.name} is queued (${queued.pending} pending) — it writes to disk when you reconnect.`,
                                variant: "warning",
                            });
                            window.dispatchEvent(new CustomEvent("praxis:file-saved", {
                                detail: {
                                    folder: selectedFolderSlug,
                                    fileSlug: selectedFileSlug,
                                    fileName: selectedFile.name,
                                    offline: true
                                },
                            }));
                            if (activeTabId) setTabDirty(activeTabId, false);
                            return;
                        }
                    }
                    throw netErr;
                }
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                // The watch-mode test runner (Tests ▸ Watch on save) listens
                // for this and reruns the affected suites.
                window.dispatchEvent(new CustomEvent("praxis:file-saved", {
                    detail: {folder: selectedFolderSlug, fileSlug: selectedFileSlug, fileName: selectedFile.name},
                }));
                // SAVE CORRECTNESS: drop any settled click-prefetch for this
                // file so the NEXT open re-fetches the just-written bytes
                // (same guard the non-Python save path carries).
                invalidatePrefetchedFile(selectedFolderSlug, selectedFileSlug);
                announceAction({
                    title: "Saved",
                    description: `${data.file} updated.`,
                    variant: "success",
                });
                // Update the code state so the viewer shows the new content.
                if (code) {
                    const updated = {...code, content: finalContent};
                    setCode(updated);
                    // Update the client-side code cache so re-opening this
                    // file shows the saved content (not the stale pre-save version).
                    const cacheKey = `${selectedFolderSlug}/${selectedFileSlug}`;
                    cachePut(cacheKey, updated);
                    codeMtimesRef.current?.set(cacheKey, currentMtimeOf(selectedFolderSlug, selectedFileSlug) ?? Date.now());
                }
                // re-lint (and refresh the git-diff gutter) now
                // that the on-disk content changed — inline diagnostics used to
                // keep showing the pre-save results until the next file switch.
                setLintNonce((n) => n + 1);
                // re-scan the TODO panel (markers may have changed).
                setTodoNonce((n) => n + 1);
                // Mark the active tab as clean (no unsaved changes).
                if (activeTabId) setTabDirty(activeTabId, false);
            } catch (err) {
                announceAction({
                    title: "Save failed",
                    description: (err as Error).message,
                    variant: "destructive",
                });
                throw err;
            }
        },
        [selectedFolderSlug, selectedFile, selectedFileSlug, code, announceAction, settings.autoFormatOnSave, settings.organizeImportsOnSave, settings.pythonInterpreter, settings.trimTrailingOnSave, settings.finalNewlineOnSave, isPythonFile, activeTabId, setTabDirty, toast]
    );

    /* ---------------------------------------------------------------- */
    /* Auto-indent the current file to the configured */
    /*  style (tabs/spaces + width). Also reachable from the editor's   */
    /*  right-click (buffer-local, undoable) and the Explorer's file    */
    /*  right-click (any file — see FolderTree's onAutoIndentFile).    */
    /* ---------------------------------------------------------------- */
    const handleAutoIndentFile = React.useCallback(async () => {
        // Auto-indent routes by kind — Markdown /
        // HTML re-indent through the FileViewer (view AND edit modes);
        // Python keeps the syntactic reindentPython engine.
        // TOML + JSON joined (toml-format / json-format).
        // YAML / CSS / SQL joined (misc-format). the
        // code families (code-format + matlab-format).
        if (
            selectedFile?.kind === "markdown" ||
            selectedFile?.kind === "html" ||
            selectedFile?.kind === "toml" ||
            capabilitiesForKind(selectedFile?.kind ?? null).canFormat
        ) {
            // every formattable non-Python kind re-indents through
            // the FileViewer (ruby / php / go joined via canFormat).
            window.dispatchEvent(new CustomEvent("praxis:file-viewer-format", {detail: {mode: "indent"}}));
            return;
        }
        if (!selectedFolderSlug || !selectedFile || !code?.content) {
            toast({
                title: "Open a file first",
                description: "Auto-indent works on the file open in the editor.",
                variant: "destructive"
            });
            return;
        }
        if (!isReindentableFile(selectedFile.name)) {
            toast({
                title: "Not a Python file",
                description: "Auto-indent only re-indents .py / .pyw files — other formats keep their authored layout.",
                variant: "destructive"
            });
            return;
        }
        // reindentPython recomputes each line's BLOCK
        // level from the Python structure (colon headers open blocks,
        // source levels close them), so extra manual indentation is
        // removed — the old autoIndent only converted units and kept
        // every level as-is
        // function/class and it keeps that while i configured only 2
        // spaces").
        const converted = reindentPython(code.content, getIndentSettings(settings));
        if (converted === code.content) {
            toast({title: "Already indented", description: "This file already matches your configured indentation."});
            return;
        }
        try {
            const res = await fetch("/api/import-py", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: selectedFolderSlug,
                    fileName: selectedFile.name,
                    content: converted,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            const updated = {...code, content: converted};
            setCode(updated);
            cachePut(`${selectedFolderSlug}/${selectedFileSlug}`, updated);
            codeMtimesRef.current?.set(`${selectedFolderSlug}/${selectedFileSlug}`, currentMtimeOf(selectedFolderSlug, selectedFileSlug) ?? Date.now());
            setLintNonce((n) => n + 1);
            announceAction({
                title: "Auto-indented",
                description: `${data.file} re-indented to ${settings.indentStyle === "tab" ? "tabs" : `${settings.editorIndentWidth} spaces`}.`,
                variant: "success",
            });
        } catch (err) {
            announceAction({
                title: "Auto-indent failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    }, [selectedFolderSlug, selectedFile, selectedFileSlug, code, settings, announceAction, toast]);

    /** auto-indent ANY folder file from
     *  the Explorer without opening it first — fetch, convert, write. */
    /** right-click a file → Format ▸ Auto-Format / Auto-Indent
     *  — the ONE generic tree-level handler for EVERY language (the
     *  five per-kind handlers — python auto-indent + the Markdown /
     *  HTML / TOML / JSON twins — merged, and extended to the whole
     *  formattable registry: YAML / CSS / SQL / JS / TS / MATLAB /
     *  Java / C / C++ / R / shell / Ruby / PHP / Go / Lua / Perl /
     *  Rust / Julia / Kotlin / Swift / PowerShell / Batch / Zig / Dart
     *  / Groovy / Scala / Elixir / Haskell / Erlang / Clojure / OCaml /
     *  F# / GraphQL now have the SAME explorer entries as the editor).
     *
     *  Python: "format" routes through /api/format (black / ruff with
     *  the built-in fallback — writes on disk); "indent" re-indents via
     *  the same syntactic engine the editor uses and writes back.
     *  Every other kind: fetch the raw text → lib/format-any's
     *  formatAnySource (the EXACT engine the viewer's edit + view modes
     *  use) → write back through the normal file-save path. */
    const handleFormatTreeFile = React.useCallback(
        async (
            folderSlug: string,
            fileSlug: string,
            mode: "format" | "indent",
            kind?: import("@/lib/scripts").FileKind
        ) => {
            const fileName = deslugify(fileSlug);
            try {
                const isPython = !kind || kind === "python";
                if (isPython) {
                    if (mode === "format") {
                        // black / ruff on disk (built-in fallback inside the route).
                        const fmtRes = await fetch("/api/format", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({
                                folder: folderSlug,
                                file: fileSlug,
                                interpreter: settings.pythonInterpreter || undefined,
                                settings: formatRequestSettings(settings),
                            }),
                        });
                        const fmtData = await fmtRes.json().catch(() => null);
                        if (!fmtRes.ok || !fmtData?.ok) {
                            throw new Error(fmtData?.error ?? `HTTP ${fmtRes.status}`);
                        }
                        if (fmtData.changed === false) {
                            toast({title: "Already formatted", description: `${fileName} needs no changes.`});
                            return;
                        }
                        // Refresh the open copy when the formatted file is showing.
                        if (folderSlug === selectedFolderSlug && fileSlug === selectedFileSlug && code) {
                            const updated = {...code, content: String(fmtData.formatted)};
                            setCode(updated);
                            cachePut(`${folderSlug}/${fileSlug}`, updated);
                            codeMtimesRef.current?.set(`${folderSlug}/${fileSlug}`, currentMtimeOf(folderSlug, fileSlug) ?? Date.now());
                            setLintNonce((n) => n + 1);
                        } else {
                            codeCacheRef.current?.delete(`${folderSlug}/${fileSlug}`);
                            codeMtimesRef.current?.delete(`${folderSlug}/${fileSlug}`);
                        }
                        announceAction({
                            title: "Python formatted",
                            description: `${fileName} — formatted on disk${fmtData.fallback === "builtin" ? " (built-in formatter — install black for the full engine)" : " with black / ruff"}.`,
                            variant: "success",
                        });
                        return;
                    }
                    // indent — the syntactic re-indent the editor uses.
                    const res = await fetch(`/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`, {cache: "no-store"});
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = (await res.json()) as CodeResponse;
                    if (!/\.pyw?$/i.test(data.file)) {
                        toast({
                            title: "Not a Python file",
                            description: "Auto-indent only re-indents .py / .pyw files.",
                            variant: "destructive"
                        });
                        return;
                    }
                    const converted = reindentPython(data.content, getIndentSettings(settings));
                    if (converted === data.content) {
                        toast({
                            title: "Already indented",
                            description: `${data.file} already matches your configured indentation.`
                        });
                        return;
                    }
                    const writeRes = await fetch("/api/import-py", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({folder: folderSlug, fileName: data.file, content: converted}),
                    });
                    const writeData = await writeRes.json();
                    if (!writeRes.ok) throw new Error(writeData.error ?? `HTTP ${writeRes.status}`);
                    if (folderSlug === selectedFolderSlug && fileSlug === selectedFileSlug && code) {
                        const updated = {...code, content: converted};
                        setCode(updated);
                        cachePut(`${folderSlug}/${fileSlug}`, updated);
                        codeMtimesRef.current?.set(`${folderSlug}/${fileSlug}`, currentMtimeOf(folderSlug, fileSlug) ?? Date.now());
                        setLintNonce((n) => n + 1);
                    } else {
                        codeCacheRef.current?.delete(`${folderSlug}/${fileSlug}`);
                        codeMtimesRef.current?.delete(`${folderSlug}/${fileSlug}`);
                    }
                    announceAction({
                        title: "Auto-indented",
                        description: `${data.file} re-indented to ${settings.indentStyle === "tab" ? "tabs" : `${settings.editorIndentWidth} spaces`}.`,
                        variant: "success"
                    });
                    return;
                }

                // Every OTHER formattable kind — the shared offline engine.
                const entry = formattableKindFor(kind);
                if (!entry) {
                    toast({
                        title: "No formatter for this file",
                        description: `${entry ?? kind} files have no Auto-format / Auto-indent engine.`,
                        variant: "destructive"
                    });
                    return;
                }
                const res = await fetch(`/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`, {cache: "no-store"});
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const converted = formatAnySource(kind!, mode, text, loadSettings());
                if (converted === text) {
                    toast({
                        title: mode === "format" ? "Already formatted" : "Already indented",
                        description: `${fileName} needs no changes.`
                    });
                    return;
                }
                const writeRes = await fetch("/api/file-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folder: folderSlug, fileName, content: converted}),
                });
                const writeData = await writeRes.json();
                if (!writeRes.ok) throw new Error(writeData.error ?? `HTTP ${writeRes.status}`);
                // Drop any cached copy so the next open shows the formatted file.
                codeCacheRef.current?.delete(`${folderSlug}/${fileSlug}`);
                codeMtimesRef.current?.delete(`${folderSlug}/${fileSlug}`);
                announceAction({
                    title: mode === "format" ? `${entry.label} formatted` : `${entry.label} re-indented`,
                    description: `${fileName} — the same engine the editor's view + edit modes use; code fences and raw regions were left untouched.`,
                    variant: "success",
                });
                refreshFolders();
            } catch (err) {
                announceAction({title: "Format failed", description: (err as Error).message, variant: "destructive"});
            }
        },
        [settings, selectedFolderSlug, selectedFileSlug, code, announceAction, toast, refreshFolders]
    );

    /* ---------------------------------------------------------------- */
    /*  Save non-Python file edit (FileViewer → /api/file-write)        */
    /* ---------------------------------------------------------------- */
    const handleSaveFileEdit = React.useCallback(
        async (
            content: string,
            identity?: { folderSlug?: string; fileSlug?: string }
        ) => {
            if (!selectedFolderSlug || !selectedFile) return;
            // same stale-save rejection as handleSaveEdit —
            // FileViewer's autosave timer captures the buffer at typing time.
            if (
                identity &&
                (identity.folderSlug !== selectedFolderSlug ||
                    identity.fileSlug !== selectedFileSlug)
            ) {
                return;
            }
            let finalContent = content;
            try {
                // AUTO-FORMAT non-Python kinds on save — honors the same
                // autoFormatOnSave setting the Python editor path uses.
                // /api/format now dispatches to REAL formatter binaries when
                // installed (prettier / gofmt / rubocop — probed with a short
                // timeout) and falls back to the built-in offline engines when
                // they are missing, so this is safe on every machine. The
                // EDITED buffer is what gets formatted, never the stale
                // on-disk copy (the Python branch's lesson).
                if (
                    settings.autoFormatOnSave &&
                    capabilitiesForKind(selectedFile.kind ?? null).canFormat
                ) {
                    try {
                        const fmtRes = await fetch("/api/format", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({
                                folder: selectedFolderSlug,
                                file: selectedFileSlug,
                                content,
                                settings: formatRequestSettings(settings),
                                // no interpreter needed for non-Python kinds
                            }),
                        });
                        if (fmtRes.ok) {
                            const fmtData = await fmtRes.json();
                            if (fmtData.formatted) finalContent = fmtData.formatted;
                        }
                    } catch {
                        // Format failed — save the unformatted content.
                    }
                }
                const writeBody = {
                    folder: selectedFolderSlug,
                    // NESTED files (the reorganized python_scripts groups files
                    // into sub-folders) must save into their SUB-DIRECTORY:
                    // selectedFile.name alone ("LessonNotebook.ipynb") wrote
                    // the save to the FOLDER ROOT — the edit silently landed
                    // in a NEW duplicate file while the real one stayed stale
                    // (spotted via the notebook save flow). The file's
                    // relative path (dir + name) is what the READ side
                    // (/api/file with the nested file slug) uses; the write
                    // side now rides the same path. Root files keep sending
                    // the bare name (identical behavior).
                    fileName: selectedFile.dir
                        ? `${selectedFile.dir}/${selectedFile.name}`
                        : selectedFile.name,
                    content: finalContent,
                };
                let res: Response;
                try {
                    res = await fetch("/api/file-write", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify(writeBody),
                    });
                } catch (netErr) {
                    // OFFLINE WRITES: queue for an ordered replay on reconnect.
                    if (typeof navigator !== "undefined" && !navigator.onLine) {
                        const queued = queueOfflineWrite({
                            url: "/api/file-write",
                            method: "POST",
                            body: writeBody,
                            label: `Save ${selectedFile.name}`,
                            fileKey: `${selectedFolderSlug}/${selectedFileSlug}`,
                        });
                        if (queued.ok) {
                            announceAction({
                                title: "Saved offline",
                                description: `${selectedFile.name} is queued (${queued.pending} pending) — it writes to disk when you reconnect.`,
                                variant: "warning",
                            });
                            window.dispatchEvent(new CustomEvent("praxis:file-saved", {
                                detail: {
                                    folder: selectedFolderSlug,
                                    fileSlug: selectedFileSlug,
                                    fileName: selectedFile.name,
                                    offline: true
                                },
                            }));
                            return;
                        }
                    }
                    throw netErr;
                }
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                window.dispatchEvent(new CustomEvent("praxis:file-saved", {
                    detail: {folder: selectedFolderSlug, fileSlug: selectedFileSlug, fileName: selectedFile.name},
                }));
                // SAVE CORRECTNESS: drop any settled click-prefetch for this
                // file so the NEXT open re-fetches the just-written bytes —
                // a reused pre-save response made “Save & switch” look like
                // it never saved (stale view, correct disk file).
                invalidatePrefetchedFile(selectedFolderSlug, selectedFileSlug);
                // re-scan the TODO panel (markdown saves may add or
                // remove TODO/FIXME markers).
                setTodoNonce((n) => n + 1);
                announceAction({
                    title: "Saved",
                    description: `${data.file} updated.`,
                    variant: "success",
                });
            } catch (err) {
                announceAction({
                    title: "Save failed",
                    description: (err as Error).message,
                    variant: "destructive",
                });
                throw err;
            }
        },
        [selectedFolderSlug, selectedFile, selectedFileSlug, announceAction, settings]
    );

    // ─── create a file from the editor's selected code ─────
    /** Fired by the "New file from selection…" dialog (the editor's
     *  right-click captured the selection into newFileFromSel.code). */
    const handleCreateFileFromSelection = React.useCallback(async () => {
        if (!newFileFromSel) return;
        const {code: selCode, fileName, folderSlug} = newFileFromSel;
        const trimmedName = fileName.trim();
        if (!trimmedName || !folderSlug) return;
        setNewFileFromSel((prev) => (prev ? {...prev, busy: true, error: null} : prev));
        try {
            const res = await fetch("/api/file-create", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    fileName: trimmedName.endsWith(".py") ? trimmedName : `${trimmedName}.py`,
                    content: selCode,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            announceAction({
                title: "File created",
                description: `${data.file ?? trimmedName} created.`,
                variant: "success",
            });
            setNewFileFromSel(null);
            setTodoNonce((n) => n + 1);
            refreshFolders();
            // Open the new file once the tree refresh lands (the route
            // returns the file's slug when it can compute one).
            if (typeof data.slug === "string" && data.slug) {
                const targetFolder = folderSlug;
                const targetSlug = data.slug;
                setTimeout(() => {
                    // guarded switch (auto-open after create).
                    guardedSelectFile(targetFolder, targetSlug);
                }, 400);
            }
        } catch (err) {
            setNewFileFromSel((prev) =>
                prev ? {...prev, busy: false, error: (err as Error).message} : prev
            );
        }
    }, [newFileFromSel, announceAction, refreshFolders]);

    /* ---------------------------------------------------------------- */
    /*  Create an example file (Examples menu / Explorer right-click)    */
    /* ---------------------------------------------------------------- */
    const handleCreateExample = React.useCallback(
        async (exampleId: string, folderSlug?: string, sub?: string) => {
            // the example library is code-split now — but an
            // example menu item can only be clicked once the module has
            // loaded, so this await resolves from the in-memory cache
            // instantly (and keeps the handler correct if reached early).
            const {exampleById, exampleFileName} = await loadExamples();
            const ex = exampleById(exampleId);
            if (!ex) return;
            const styles = getNamingStyles(loadSettings());
            // Target folder: the right-clicked one > the current selection >
            // the first folder in the project.
            const target =
                folderSlug || selectedFolderSlugRef.current || folders[0]?.slug;
            if (!target) {
                toast({
                    variant: "warning" as const,
                    title: "No folder to create the example in",
                    description:
                        "Create a folder first (Explorer → + → New folder), then try again.",
                });
                return;
            }
            // `sub` lands the example inside a NESTED subfolder —
            // the subfolder rows' "New example…" item (same menu as the main
            // folder). Collision check scopes to that subfolder's files.
            const targetFiles = sub
                ? (folders.find((c) => c.slug === target)?.files ?? []).filter(
                    (f) => (f.dir ?? "") === sub
                )
                : (folders.find((c) => c.slug === target)?.files ?? []);
            // Styled file name (Settings → Editor → Naming style applies to
            // the generated name too), with a numeric suffix on collision.
            const base = exampleFileName(ex, styles);
            let fileName = base;
            for (let attempt = 2; attempt <= 5; attempt++) {
                const exists = targetFiles.some((f) => f.name === fileName);
                if (!exists) break;
                const stem = base.replace(/\.[^.]+$/, "");
                const ext = base.slice(stem.length);
                fileName = `${stem} ${attempt}${ext}`;
            }
            try {
                // generated Python bodies are authored in the
                // canonical 4-space indent — reindent converts them to the
                // configured style (Settings → Editor → Indentation; default
                // 2 spaces). Non-Python files (Makefile tabs, semantic YAML)
                // keep their authored layout.
                const rendered = ex.build(styles);
                const content = isReindentableFile(fileName)
                    ? reindent(rendered, getIndentSettings(loadSettings()))
                    : rendered;
                const res = await fetch("/api/file-create", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: target,
                        ...(sub ? {sub} : {}),
                        fileName,
                        content,
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    toast({
                        variant: "destructive" as const,
                        title: data.error ?? "Failed to create the example",
                    });
                    return;
                }
                toast({
                    variant: "success" as const,
                    title: `Example created: ${data.name}`,
                    description: `Ready to run — created in "${data.folder}${sub ? "/" + sub : ""}".`,
                });
                // Refresh FIRST, then set the selection: setting it before the
                // refresh lands races the "reset file selection" guard effect,
                // which runs against the STALE folders list (the new file
                // isn't in it yet) and reverts the selection to files[0].
                await refreshFolders();
                setEditorBlank(false);
                // guarded switch (auto-open after create).
                guardedSelectFile(target, data.slug);
            } catch (e) {
                toast({
                    variant: "destructive" as const,
                    title: `Network error: ${e instanceof Error ? e.message : String(e)}`,
                });
            }
        },
        [folders, refreshFolders, toast]
    );

    /* ---------------------------------------------------------------- */
    /*  Save All — iterate open tabs and save each dirty one.            */
    /* ---------------------------------------------------------------- */
    const handleSaveAll = React.useCallback(async () => {
        // The CodeViewer owns its own edit state, so we can't directly
        // iterate the open tabs' edit content from here. Instead, we
        // trigger save on the active CodeViewer (which saves the current
        // file), and announce the action. A full multi-tab save would
        // require lifting editContent for every tab into page.tsx — out
        // of scope for this pass.
        if (codeViewerRef.current) {
            await codeViewerRef.current.save();
            announceAction({title: "Saved", description: "The current file has been saved.", variant: "success"});
        }
    }, [announceAction]);

    // ─── Rename symbol across the project ────────────────────────────
    const handleRenameSymbol = React.useCallback(async (oldName: string, newName: string) => {
        try {
            const searchRes = await fetch(`/api/full-text-search?q=${encodeURIComponent(oldName)}&limit=200`);
            const searchData = await searchRes.json();
            const hits: Array<{ folderSlug: string; fileSlug: string }> = searchData.hits ?? [];
            const files = new Map<string, { folderSlug: string; fileSlug: string }>();
            for (const h of hits) files.set(`${h.folderSlug}/${h.fileSlug}`, h);
            let changedFiles = 0;
            const re = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
            for (const {folderSlug, fileSlug} of files.values()) {
                const readRes = await fetch(`/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`);
                if (!readRes.ok) continue;
                // /api/file returns RAW bytes — read as text
                // (the old res.json silently broke renames on non-py files).
                const content: string = await readRes.text();
                const newContent = content.replace(re, newName);
                if (newContent === content) continue;
                const writeRes = await fetch("/api/file-write", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folder: folderSlug, fileName: deslugify(fileSlug), content: newContent}),
                });
                if (writeRes.ok) changedFiles++;
            }
            announceAction({
                title: `Renamed "${oldName}" → "${newName}"`,
                description: `Updated ${changedFiles} file${changedFiles === 1 ? "" : "s"}.`,
                variant: "success"
            });
            refreshFolders();
            if (selectedFolderSlug && selectedFileSlug) {
                setSelectedFileSlug("");
                setTimeout(() => setSelectedFileSlug(selectedFileSlug), 50);
            }
        } catch (e) {
            announceAction({
                title: "Rename failed",
                description: e instanceof Error ? e.message : String(e),
                variant: "destructive"
            });
        }
    }, [announceAction, refreshFolders, selectedFolderSlug, selectedFileSlug]);

    /* ---------------------------------------------------------------- */
    /*  Favorites toggle                                                */
    /* ---------------------------------------------------------------- */
    const toggleFavorite = React.useCallback(
        (fileSlug: string) => {
            setFavorites((prev) => {
                const next = new Set(prev);
                if (next.has(fileSlug)) next.delete(fileSlug);
                else next.add(fileSlug);
                try {
                    window.localStorage.setItem(
                        `${STORAGE_PREFIX}.favorites`,
                        JSON.stringify(Array.from(next))
                    );
                } catch { /* ignore */
                }
                return next;
            });
        },
        []
    );

    /* ---------------------------------------------------------------- */
    /*  Pin a run result as the diff baseline                           */
    /* ---------------------------------------------------------------- */
    const handlePinBaseline = React.useCallback(
        (result: RunResult | null) => {
            setPinnedBaseline(result);
            toast({
                title: result ? "Baseline pinned" : "Baseline cleared",
                description: result
                    ? "Future runs of any script will diff against this baseline."
                    : undefined,
            });
        },
        [toast]
    );

    /* ---------------------------------------------------------------- */
    /*  Multi-tab editing  + recently-closed                   */
    /* ---------------------------------------------------------------- */
    // When the selection changes, ensure a tab exists for it.
    React.useEffect(() => {
        if (!selectedFolderSlug || !selectedFileSlug || !selectedFolder) return;
        const tabId = `${selectedFolderSlug}/${selectedFileSlug}`;
        setOpenTabs((prev) => {
            if (prev.some((t) => t.id === tabId)) {
                // Tab already open — just activate it.
                return prev;
            }
            const newTab: EditorTab = {
                id: tabId,
                folderSlug: selectedFolderSlug,
                fileSlug: selectedFileSlug,
                fileName: selectedFile?.name ?? "",
                folderName: selectedFolder.name,
                dirty: false,
                runOk: null,
            };
            // cap raised 10 → 20 — beyond the cap, activeTabId
            // points at a non-existent tab and the dirty flag (and tab
            // click targeting) silently broke. 20 covers the heaviest
            // file-hunting sessions; the direct viewerDirtyRef mirror is
            // the real safety net.
            const next = [...prev, newTab].slice(-20);
            return next;
        });
        setActiveTabId(tabId);
        // a valid selection means a file is open — leave the
        // blank-workspace mode. This is the single choke point every
        // open-file path funnels through (sidebar click, ⌘K search, run
        // history, Recent Files, go-to-declaration, Back/Forward, …), so
        // none of them needs its own setEditorBlank(false).
        setEditorBlank(false);
    }, [selectedFolderSlug, selectedFileSlug, selectedFolder, selectedFile]);

    // ─── session restore ─────────────────────────────────
    // Persist the open tabs (+ active tab + caret line) whenever they
    // change, debounced 500 ms; restore them once after the folder
    // list first arrives. Deep links via URL params win over the saved
    // session (selectedFileSlug already set ⇒ skip). Close-all persists
    // an empty tab list, so a reload after Close all stays blank —
    // consistent with 's solid-blank workspace. (the
    // restore key SESSION_KEY now lives at module scope — the selection
    // guard effect reads it too.)
    const sessionRestoredRef = React.useRef(false);
    React.useEffect(() => {
        const t = setTimeout(() => {
            // never write the session before the restore pass has
            // run. On a reload, this 500 ms-debounced persist used to fire
            // while the folder list was still loading (dev compiles take
            // 1-3 s), persisting the pre-restore state — tabs: [] — over
            // the REAL saved session, so the restore that followed
            // read its own clobbered output and "session restore does not
            // work" / "reload reopens files[0]". Gating on the ref keeps the
            // first write after any load the RESTORED state (or a genuine
            // user action), never the transient empty one.
            if (!sessionRestoredRef.current) return;
            try {
                const cursor = footerStore.getCursor();
                window.localStorage.setItem(
                    SESSION_KEY,
                    JSON.stringify({
                        savedAt: Date.now(),
                        /* Round 3 — untitled drafts are IN-MEMORY ONLY: they never
             * ride the persisted session (the restore filter could not
             * resolve their empty slugs anyway, and a reload drops them
             * by design — the same lifecycle every major IDE gives
             * untitled buffers without extensions). */
                        tabs: openTabs
                            .filter((tab) => !tab.untitled)
                            .map((tab) => ({
                                folderSlug: tab.folderSlug,
                                fileSlug: tab.fileSlug,
                                fileName: tab.fileName,
                                folderName: tab.folderName,
                            })),
                        activeId: activeTabId,
                        caretLine: cursor?.line ?? null,
                    })
                );
            } catch {
                /* quota — ignore */
            }
        }, 500);
        return () => clearTimeout(t);
    }, [openTabs, activeTabId, SESSION_KEY]);
    React.useEffect(() => {
        if (sessionRestoredRef.current || folders.length === 0) return;
        sessionRestoredRef.current = true;
        if (!settings.sessionRestore) return;
        if (selectedFileSlug) return; // URL deep link already picked a file
        try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                tabs?: Array<{
                    folderSlug: string;
                    fileSlug: string;
                    fileName: string;
                    folderName: string;
                }>;
                activeId?: string | null;
                caretLine?: number | null;
            };
            const valid = (parsed.tabs ?? []).filter((t) =>
                folders.some(
                    (c) => c.slug === t.folderSlug && c.files.some((f) => f.slug === t.fileSlug)
                )
            );
            if (valid.length === 0) {
                // The saved session has no live tabs — this is the persisted
                // "Close all" state (documented that a reload after
                // Close all stays blank). Restore editorBlank so the auto-
                // select effect does NOT silently re-open files[0]: without
                // this, the guard effect ran with editorBlank=false and the
                // first folder's first file popped back open on every
                // reload, contradicting the blank-workspace behavior. (Also
                // covers "all saved tabs were deleted from disk" — the
                // welcome card is the right landing there too.)
                setEditorBlank(true);
                return;
            }
            const restored: EditorTab[] = valid.map((t) => ({
                id: `${t.folderSlug}/${t.fileSlug}`,
                folderSlug: t.folderSlug,
                fileSlug: t.fileSlug,
                fileName: t.fileName,
                folderName: t.folderName,
                dirty: false,
                runOk: null,
            }));
            setOpenTabs(restored);
            const active = parsed.activeId
                ? restored.find((t) => t.id === parsed.activeId)
                : restored[restored.length - 1];
            if (active) {
                setActiveTabId(active.id);
                setSelectedFolderSlug(active.folderSlug);
                setSelectedFileSlug(active.fileSlug);
                // Split-pane layout rides the workspace snapshot: restore
                // it together with the tabs, targets validated against the
                // fresh folder listing.
                try {
                    const snap = loadWorkspaceSession();
                    // Bottom-panel state + split sizes ride the same snapshot —
                    // a reload lands back on the same panel view at the same
                    // size (older snapshots lack the fields; the typed readers
                    // then return null and the page keeps its defaults).
                    const panel = readBottomPanel(snap);
                    if (panel) {
                        setBottomPanelOpen(panel.open);
                        setBottomTab(panel.activeTab as typeof bottomTab);
                        setCodePanelHeight(Math.round(100 - panel.height));
                    }
                    const widths = readSplitWidths(snap);
                    if (widths) {
                        // the same percent drives a horizontal and a vertical
                        // split — restore the one the persisted orientation used.
                        // The engine's setSplitGroupWidth clamps to the 10..90
                        // range the handle itself enforces.
                        setSplitLayout((prev) =>
                            setSplitGroupWidth(
                                prev,
                                Math.round(
                                    (snap?.splitPane?.orientation === "down" ? widths.verticalRatio : widths.horizontalRatio) * 100
                                )
                            )
                        );
                    }
                    if (snap?.splitPane?.open && snap.splitPane.targets.length > 0) {
                        const targets = snap.splitPane.targets
                            .map((t) => {
                                const file = folders
                                    .find((c) => c.slug === t.folderSlug)
                                    ?.files.find((f) => f.slug === t.fileSlug);
                                if (!file) return null;
                                return {
                                    folderSlug: t.folderSlug,
                                    fileSlug: t.fileSlug,
                                    fileName: file.name,
                                    folderName: folders.find((c) => c.slug === t.folderSlug)?.name ?? "",
                                } satisfies SplitTarget;
                            })
                            .filter((t): t is SplitTarget => !!t);
                        if (targets.length > 0) {
                            /* The dragged per-pane shares ride the snapshot; the
               * engine's restore trusts them only when well-formed
               * (aligned length, sum 100, floor respected) and falls
               * back to equal shares otherwise. Captured into locals
               * so the null guards above keep narrowing inside the
               * setState closure. */
                            const savedOrientation = snap.splitPane.orientation;
                            const savedSizes = snap.splitPane.sizes;
                            setSplitLayout((prev) =>
                                restoreSplitLayout(prev, savedOrientation, targets, savedSizes)
                            );
                        }
                    }
                } catch {
                    /* snapshot unreadable — single pane, fine */
                }
                if (typeof parsed.caretLine === "number" && parsed.caretLine > 1) {
                    // Give the code fetch time to land, then scroll the caret
                    // line into view (same pattern as praxis:goto-line).
                    setTimeout(() => {
                        window.dispatchEvent(
                            new CustomEvent("praxis:goto-line", {detail: {line: parsed.caretLine}})
                        );
                    }, 600);
                }
            }
        } catch {
            /* malformed — ignore */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folders, settings.sessionRestore, selectedFileSlug, SESSION_KEY]);

    // ─── live word/char counts for the Footer ────────────
    // Written into the footerStore external store so count updates
    // never re-render this page (same rationale as the cursor chip).
    React.useEffect(() => {
        const text = code?.content;
        if (typeof text !== "string") {
            footerStore.setCounts(null);
            return;
        }
        const words = (text.match(/\S+/g) ?? []).length;
        footerStore.setCounts({
            words,
            chars: text.length,
            readingMinutes: Math.max(1, Math.round(words / 200)),
        });
    }, [code?.content]);

    // ─── profiling heatmap is per-file — clear it whenever
    // the selection moves to a different file (or closes).
    React.useEffect(() => {
        setTimingOverlay(null);
    }, [selectedFolderSlug, selectedFileSlug]);

    // Update tab metadata when run result changes.
    React.useEffect(() => {
        if (!activeTabId || !runResult) return;
        setOpenTabs((prev) =>
            prev.map((t) =>
                t.id === activeTabId
                    ? {...t, runOk: runResult.isStreaming ? null : runResult.ok}
                    : t
            )
        );
    }, [runResult, activeTabId]);

    /** the kind of the OPEN file — drives the per-kind
     *  capability gating (Run button, run options, navbar items, the
     *  dirty-tab save path). Declared early: callbacks below depend on
     *  it. */
    const selectedFileKind = selectedFile?.kind ?? null;
    /** the language of the open file (drives the FileViewer's
     *  in-header Run control + the runtime status chip). */
    const viewerRunLanguage = runLanguageForKind(selectedFileKind);

    /** latched-open run inputs (stdin / args-env toggles)
     *  collapse when the open file is not runnable — the strip is
     *  python-only now, so a leftover toggle from a .py file must not
     *  survive the switch (belt + braces with the JSX gate). */
    React.useEffect(() => {
        // the stdin / args-env strip stays for every RUNNABLE
        // kind (js / ts / matlab / r / shell / java / c / cpp) — args and
        // env pass through to their runtimes exactly like Python's.
        if (selectedFileKind !== null && selectedFileKind !== "python" && !isRunnableKind(selectedFileKind)) {
            setShowStdin(false);
            setShowArgsEnv(false);
        }
    }, [selectedFileKind]);

    /** the actual tab switch (prefetch + selection update) —
     * split out of handleSelectTab so the dirty-guard dialog can
     * trigger it AFTER the user chose Save/Discard. */
    const performTabSwitch = React.useCallback(
        (id: string, opts?: { fromMruCycle?: boolean }) => {
            const tab = openTabs.find((t) => t.id === id);
            if (!tab) return;
            // MRU bookkeeping: a Ctrl+Tab cycle must NOT reorder the history
            // (otherwise repeated presses ping-pong between two tabs); every
            // OTHER activation promotes its tab to most-recently-used.
            mruCycleGuardRef.current = !!opts?.fromMruCycle;
            setActiveTabId(id);
            setEditorBlank(false);
            /* Round 3 — an UNTITLED draft has no disk file: no prefetch, no
       * skeleton, and the selection is CLEARED (both slugs empty) so no
       * stale selectedFile lingers behind the draft pane and the
       * selection-guard effect leaves the auto-open of files[0] off. */
            if (tab.untitled) {
                setSelectedFolderSlug("");
                setSelectedFileSlug("");
                return;
            }
            // FILE-OPEN SPEED: prefetch at click time — same dedupe as the
            // tree/file open paths.
            if (tab.folderSlug !== selectedFolderSlug || tab.fileSlug !== selectedFileSlug) {
                prefetchFileContent(
                    foldersRef.current
                        .find((c) => c.slug === tab.folderSlug)
                        ?.files.find((f) => f.slug === tab.fileSlug)?.kind,
                    tab.folderSlug,
                    tab.fileSlug
                );
            }
            // INSTANT PYTHON SKELETON — same-render flip on tab switches.
            primePythonSkeleton(tab.folderSlug, tab.fileSlug);
            setSelectedFolderSlug(tab.folderSlug);
            setSelectedFileSlug(tab.fileSlug);
        },
        [openTabs, selectedFolderSlug, selectedFileSlug, primePythonSkeleton]
    );

    // ─── Ctrl+Tab QUICK SWITCHER (MRU) ────────────────────────────────
    // Most-recently-used order of the open tabs, maintained on every
    // activation (guarded so Ctrl+Tab cycling itself doesn't reorder).
    const tabMruRef = React.useRef<string[]>([]);
    const mruCycleGuardRef = React.useRef(false);
    React.useEffect(() => {
        if (!activeTabId) return;
        if (mruCycleGuardRef.current) {
            mruCycleGuardRef.current = false;
            return; // the switch came from the cycler — keep the order
        }
        tabMruRef.current = [activeTabId, ...tabMruRef.current.filter((id) => id !== activeTabId)].slice(0, 30);
    }, [activeTabId]);
    React.useEffect(() => {
        // Drop closed tabs from the MRU list.
        const live = new Set(openTabs.map((t) => t.id));
        tabMruRef.current = tabMruRef.current.filter((id) => live.has(id));
    }, [openTabs]);

    // Live tab state + switcher for the window-level Ctrl+Tab handler
    // (declared ABOVE the tab block — refs bridge the declaration order
    // and keep the listener free of stale closures).
    const tabsStateRef = React.useRef({openTabs, activeTabId});
    React.useEffect(() => {
        tabsStateRef.current = {openTabs, activeTabId};
    }, [openTabs, activeTabId]);
    const performTabSwitchRef = React.useRef(performTabSwitch);
    React.useEffect(() => {
        performTabSwitchRef.current = performTabSwitch;
    }, [performTabSwitch]);

    // ── Ctrl+Tab switcher overlay ─────────────────────────────────
    // The key state machine (window-level, focus-trapped while open):
    // opening snapshots the MRU list, Tab / Shift+Tab / arrows move the
    // selection, Enter / click / releasing the modifier commits, Esc
    // cancels, and typing filters the list. Reading the tab state
    // through the refs above keeps every snapshot fresh without
    // re-registering listeners per tab switch.
    const tabSwitcher = useTabSwitcherKeys({
        getFiles: () => {
            const {openTabs, activeTabId} = tabsStateRef.current;
            const mru = tabMruRef.current.length
                ? tabMruRef.current
                : openTabs.map((t) => t.id);
            const byId = new Map(openTabs.map((t) => [t.id, t]));
            return mru
                .map((id) => byId.get(id))
                .filter((t): t is NonNullable<typeof t> => Boolean(t))
                .map((t) => ({id: t.id, label: t.fileName, dirty: t.dirty}));
        },
        getActiveId: () => tabsStateRef.current.activeTabId,
        commit: (file) => performTabSwitchRef.current(file.id, {fromMruCycle: true}),
    });

    /** — the dirty-tab guard: switching to another tab while
     * the CURRENT one has unsaved edits used to silently discard the
     * FileViewer's edit buffer (its state resets on file change). We
     * now ASK: Save & switch / Discard & switch / Stay. Mirrors the
     * confirmCloseUnsavedTab setting. */
    const handleSelectTab = React.useCallback(
        (id: string) => {
            if (id === activeTabId) return;
            const current = openTabs.find((t) => t.id === activeTabId);
            /* Phase 2 — the switch guard is the pure shouldGuardTabSwitch
       * rule: a dirty REAL tab guards, the viewer-dirty mirror guards,
       * and an untitled draft NEVER guards (its builder edits are
       * live-synced into the draft map, so leaving loses nothing; the
       * ⌘S Save As stays available whenever the user comes back). */
            if (shouldGuardTabSwitch(current, viewerDirtyRef.current)) {
                const tab = openTabs.find((t) => t.id === id);
                if (tab) setPendingSwitchTab({
                    id,
                    toName: tab.fileName,
                    fromName: current?.fileName ?? activeTabInfoRef.current.fileName
                });
                return; // ask first — performTabSwitch runs after the choice
            }
            performTabSwitch(id);
        },
        [openTabs, activeTabId, performTabSwitch]
    );

    /** Save the dirty ACTIVE tab, then switch. Python saves through the
     * CodeViewer ref; every other kind goes through the FileViewer's
     * own save path via a window-event round-trip
     * (praxis:file-viewer-save → praxis:file-viewer-saved).
     * The target can be a TAB or a TREE file — both go
     * through performPendingSwitch. */
    const performPendingSwitch = React.useCallback(
        (target: { id: string; tree?: { folderSlug: string; fileSlug: string } }) => {
            // run the afterSwitch hook saved with the guarded
            // selection (open a dialog / arm a pending run) once the user
            // chose Save / Discard.
            const after = pendingAfterSwitchRef.current;
            pendingAfterSwitchRef.current = null;
            after?.();
            if (target.tree) {
                // INSTANT PYTHON SKELETON — same-render flip on guarded
                // (tree) switches too.
                primePythonSkeleton(target.tree.folderSlug, target.tree.fileSlug);
                setSelectedFolderSlug(target.tree.folderSlug);
                setSelectedFileSlug(target.tree.fileSlug);
                setEditorBlank(false);
            } else {
                performTabSwitch(target.id);
            }
        },
        [performTabSwitch, primePythonSkeleton]
    );

    const saveAndSwitchTab = React.useCallback(
        async (target: { id: string; tree?: { folderSlug: string; fileSlug: string } }) => {
            try {
                if (selectedFileKind === "python") {
                    await codeViewerRef.current?.save();
                } else {
                    const saved = new Promise<void>((resolve) => {
                        const onSaved = () => {
                            window.removeEventListener("praxis:file-viewer-saved", onSaved);
                            resolve();
                        };
                        window.addEventListener("praxis:file-viewer-saved", onSaved);
                        // Belt-and-braces: never hang longer than 2.5 s.
                        window.setTimeout(() => {
                            window.removeEventListener("praxis:file-viewer-saved", onSaved);
                            resolve();
                        }, 2500);
                    });
                    window.dispatchEvent(new Event("praxis:file-viewer-save"));
                    await saved;
                }
            } finally {
                performPendingSwitch(target);
            }
        },
        [selectedFileKind, performPendingSwitch]
    );

    // ─── editor-tab keyboard navigation ────────────────────
    // Tab cycling / direct jumps — reuse handleSelectTab so switching
    // via keyboard behaves exactly like clicking the tab (opens the
    // file, updates selection, clears the blank state). Alt+9 jumps to
    // the LAST tab, matching every major browser.
    const handleNextTab = React.useCallback(() => {
        if (openTabs.length < 2 || !activeTabId) return;
        const idx = openTabs.findIndex((t) => t.id === activeTabId);
        handleSelectTab(openTabs[(idx + 1) % openTabs.length].id);
    }, [openTabs, activeTabId, handleSelectTab]);
    const handlePrevTab = React.useCallback(() => {
        if (openTabs.length < 2 || !activeTabId) return;
        const idx = openTabs.findIndex((t) => t.id === activeTabId);
        handleSelectTab(openTabs[(idx - 1 + openTabs.length) % openTabs.length].id);
    }, [openTabs, activeTabId, handleSelectTab]);
    const handleTabByIndex = React.useCallback((n: number) => {
        if (openTabs.length === 0) return;
        const idx = Math.min(n, openTabs.length) - 1; // Alt+9 = last tab
        const tab = openTabs[idx];
        if (tab && tab.id !== activeTabId) handleSelectTab(tab.id);
    }, [openTabs, activeTabId, handleSelectTab]);

    // ─── run the current file in the persistent console ───
    // Switches to the Console tab and queues the payload DURABLY
    // (lib/pending-console-run): the event alone was one-shot — on the
    // FIRST invocation the ConsolePanel was still unmounted (bottom
    // panel closed / lazy chunk loading), the event fired into the
    // void, and an EMPTY console opened. The store + the panel's
    // mount-time drain make the first click run as soon as it
    // appears. The LIVE edit buffer is sent, so unsaved edits run too.
    const handleRunInConsole = React.useCallback(() => {
        if (!selectedFileSlug) return;
        const src = codeViewerRef.current?.getBuffer() ?? code?.content ?? null;
        if (!src || !src.trim()) return;
        setBottomPanelOpen(true);
        setBottomTab("console");
        queueConsoleRun(src, selectedFile?.name);
    }, [selectedFileSlug, code, selectedFile]);

    /* ---------------------------------------------------------------- */
    /* Keyboard shortcuts  — lives AFTER handleSelectTab */
    /*  (and handleRun / handleStop / handleSaveAll above) so every     */
    /*  referenced callback is already initialized.                     */
    /* ---------------------------------------------------------------- */
    useKeyboardShortcuts({
        onOpenSearch: () => setSearchOpen(true),
        onOpenHistory: () => setHistoryOpen(true),
        onOpenSnippets: () => setSnippetOpen(true),
        onRun: handleRun,
        onOpenSettings: () => setSettingsOpen(true),
        // ⌘⇧T is intentionally NOT bound here — it's owned by the
        // reopen-closed-tab handler below. Theme toggle is menu-only.
        onToggleSidebar: () => {
            // Desktop uses sidebarVisible; mobile uses sidebarOpen (drawer).
            if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                toggleSidebarVisible();
            } else {
                setSidebarOpen((v) => !v);
            }
        },
        onToggleBottomPanel: () => setBottomPanelOpen((v) => !v),
        onToggleAiChat: () => setAiChatOpen((v) => !v),
        onRefresh: refreshFolders,
        // per-file output — the Stop button acts on the run
        // shown in the Output panel (the selected file's), and only shows
        // while THAT file is streaming.
        onStop: handleStopSelected,
        canStop: !!runResult?.isStreaming,
        onSave: () => saveActiveFile(),
        onSaveAll: () => void handleSaveAll(),
        onFormat: () => void codeViewerRef.current?.format(),
        onReplace: () => codeViewerRef.current?.openReplace(),
        // font zoom + tab switching.
        onZoomIn: () => adjustCodeFontSize(1),
        onZoomOut: () => adjustCodeFontSize(-1),
        onZoomReset: resetCodeFontSize,
        onNextTab: handleNextTab,
        onPrevTab: handlePrevTab,
        onTabByIndex: handleTabByIndex,
    });

    // Dirty-tab close confirmation — themed AlertDialog (replaces the
    // previous window.confirm which was unthemeable + blocked the JS
    // thread). When the user tries to close a tab with unsaved changes
    // AND confirmCloseUnsavedTab is on, we stash the pending close id
    // + open the dialog. Confirm → proceed with the close; Cancel →
    // keep the tab open.
    const [pendingCloseTab, setPendingCloseTab] = React.useState<{ id: string; fileName: string } | null>(null);

    const handleCloseTab = React.useCallback((id: string) => {
        setOpenTabs((prev) => {
            const idx = prev.findIndex((t) => t.id === id);
            if (idx === -1) return prev;
            const closed = prev[idx];
            /* Phase 2 — the close DECISIONS are pure rules (lib/
       * tab-lifecycle.ts): confirm-before-close, reopen-history push,
       * and which neighbour activates — shared with the confirm path
       * below so the two can never drift apart. */
            if (shouldConfirmClose(closed, settings.confirmCloseUnsavedTab)) {
                // Defer the dialog open so we're not calling setState during
                // the setOpenTabs updater (which would be a nested update).
                // The actual close is handled by confirmCloseTab below.
                setPendingCloseTab({id, fileName: closed.fileName});
                return prev;
            }
            // Push to the reopen history (newest-first, capped, deduped).
            setClosedTabHistory((h) => pushClosedTab(h, closed));
            const next = prev.filter((t) => t.id !== id);
            // If we closed the active tab, switch to the adjacent one.
            if (activeTabId === id) {
                const newActive = nextActiveAfterClose(prev, idx);
                if (newActive) {
                    setActiveTabId(newActive.id);
                    setSelectedFolderSlug(newActive.folderSlug);
                    setSelectedFileSlug(newActive.fileSlug);
                } else {
                    // Closed the LAST tab (one-by-one, not via Close all): show
                    // the blank "no file open" view. Only the tab bar used to
                    // empty; selectedFileSlug survived so the editor kept
                    // rendering the closed file.
                    // the run result is cleared too — the output
                    // panel used to keep showing the closed file's last run
                    // so the IDE never looked blank.
                    setActiveTabId(null);
                    setEditorBlank(true);
                    setSelectedFileSlug("");
                    setRunResult(null);
                    setPreviousRunResult(null);
                }
            }
            return next;
        });
    }, [activeTabId, settings.confirmCloseUnsavedTab]);

    // ── Vim :q — close the ACTIVE editor tab. The ex command bar's
    // executeCommand(":q") dispatches praxis:close-active-tab; routed
    // through the same handleCloseTab the tab bar's ✕ uses. The ref
    // keeps the listener subscription stable across tab churn.
    const closeActiveTabFn = React.useCallback(() => {
        if (activeTabId) handleCloseTab(activeTabId);
    }, [activeTabId, handleCloseTab]);
    const closeActiveTabRef = React.useRef(closeActiveTabFn);
    React.useEffect(() => {
        closeActiveTabRef.current = closeActiveTabFn;
    }, [closeActiveTabFn]);
    React.useEffect(() => {
        const onClose = () => closeActiveTabRef.current?.();
        window.addEventListener("praxis:close-active-tab", onClose);
        return () => window.removeEventListener("praxis:close-active-tab", onClose);
    }, []);

    /** Confirm the pending dirty-tab close — actually removes the tab
     *  from openTabs (without re-prompting). Same pure rules as the
     *  direct close path, so both behave identically. */
    const confirmCloseTab = React.useCallback(() => {
        if (!pendingCloseTab) return;
        const id = pendingCloseTab.id;
        setPendingCloseTab(null);
        setOpenTabs((prev) => {
            const idx = prev.findIndex((t) => t.id === id);
            if (idx === -1) return prev;
            const closed = prev[idx];
            setClosedTabHistory((h) => pushClosedTab(h, closed));
            const next = prev.filter((t) => t.id !== id);
            if (activeTabId === id) {
                const newActive = nextActiveAfterClose(prev, idx);
                if (newActive) {
                    setActiveTabId(newActive.id);
                    setSelectedFolderSlug(newActive.folderSlug);
                    setSelectedFileSlug(newActive.fileSlug);
                } else {
                    // Closed the LAST tab via the dirty-confirm path — same
                    // blank-view behavior as handleCloseTab above (M4:
                    // output panel blanked too).
                    setActiveTabId(null);
                    setEditorBlank(true);
                    setSelectedFileSlug("");
                    setRunResult(null);
                    setPreviousRunResult(null);
                }
            }
            return next;
        });
    }, [pendingCloseTab, activeTabId]);

    // (setTabDirty declared earlier, near handleSaveEdit.)

    // Reopen last closed tab .
    const handleReopenClosedTab = React.useCallback(() => {
        // read-first (the updater used to fire side effects,
        // which double-runs under StrictMode) + guarded switch.
        const tab = closedTabHistory[0];
        if (!tab) return;
        setClosedTabHistory((h) => h.slice(1));
        /* Round 3 — an untitled draft reopens from its RETAINED in-memory
     * text (guardedSelectFile cannot resolve empty slugs to a file).
     * The draft survived the close precisely for this path. */
        if (tab.untitled) {
            setOpenTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
            setActiveTabId(tab.id);
            setEditorBlank(false);
            setSelectedFolderSlug("");
            setSelectedFileSlug("");
            return;
        }
        guardedSelectFile(tab.folderSlug, tab.fileSlug);
    }, [closedTabHistory, guardedSelectFile]);

    /* — Close ALL editors (shared by the tab bar's Close all,
* the File menu's "Close all editors" item, and the command
* palette). After this the workspace renders as a SOLID BLANK area
* (see `workspaceBlank`): no output panel, no README card, no
* empty-state — until the user opens another file. VS Code's
* workbench.action.closeAllEditors equivalent. */
    const handleCloseAllEditors = React.useCallback(() => {
        // Stash the closed tabs into the closed-history (newest-first, so
        // ⌘⇧T reopens the most recently opened one first) so Close all is
        // not destructive — Reopen last closed tab still works after it.
        if (openTabs.length > 0) {
            setClosedTabHistory((h) => [...openTabs.slice().reverse(), ...h].slice(0, 10));
        }
        setOpenTabs([]);
        setActiveTabId(null);
        // Blank every piece of selection/run state (M4 +
        // reports): the selection guard at the top no longer auto-reopens
        // files[0] because editorBlank is true, and the run result is
        // cleared so the output panel doesn't keep showing the closed
        // file's output.
        setEditorBlank(true);
        setSelectedFileSlug("");
        setCode(null);
        setCodeLoading(false);
        setRunResult(null);
        setPreviousRunResult(null);
    }, [openTabs]);

    /* ---------------------------------------------------------------- */
    /*  Auto-run on file change                                     */
    /* ---------------------------------------------------------------- */
    // the server caps every /api/watch stream at 5 min
    // and then closes it. The old effect ended with the stream —
    // auto-rerun silently stopped working after 5 minutes of editing.
    // A generation counter now forces a reconnect (same pattern the
    // watch-dir effect uses below); the small backoff avoids hammering
    // a server that closes streams immediately.
    const [watchGeneration, setWatchGeneration] = React.useState(0);
    const watchReconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    /* PERF: the watcher effect used to depend on handleRun directly —
   * handleRun's identity changed on EVERY runResult update (each SSE
   * chunk), so the effect aborted + reconnected the /api/watch stream
   * per line of output while autoRunOnFileChange was on. The ref keeps
   * the effect's deps stable; the reader loop reads the latest handler. */
    const handleRunRef = React.useRef(handleRun);
    React.useEffect(() => {
        handleRunRef.current = handleRun;
    }, [handleRun]);
    React.useEffect(() => {
        // Cancel any existing watcher.
        if (watchAbortRef.current) {
            watchAbortRef.current.abort();
            watchAbortRef.current = null;
        }
        if (!settings.autoRunOnFileChange || !selectedFolderSlug || !selectedFileSlug) return;
        let reconnectScheduled = false;
        const scheduleReconnect = () => {
            if (reconnectScheduled) return;
            reconnectScheduled = true;
            watchReconnectTimerRef.current = setTimeout(() => {
                setWatchGeneration((g) => g + 1);
            }, 1500);
        };
        // Connect to /api/watch SSE.
        const controller = new AbortController();
        watchAbortRef.current = controller;
        (async () => {
            try {
                const res = await fetch("/api/watch", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folder: selectedFolderSlug, file: selectedFileSlug}),
                    signal: controller.signal,
                });
                if (!res.ok || !res.body) {
                    // Server hiccup — retry unless we're unmounting.
                    if (!controller.signal.aborted) scheduleReconnect();
                    return;
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const {done, value} = await reader.read();
                    noteSseBytes(value?.byteLength ?? 0);
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() ?? "";
                    for (const part of parts) {
                        for (const line of part.split("\n")) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const evt = JSON.parse(line.slice(6));
                                if (evt.type === "changed") {
                                    // File changed on disk — re-run (via the ref — see
                                    // the PERF note above).
                                    handleRunRef.current();
                                } else if (evt.type === "timeout") {
                                    // Server hit its 5-min cap — reconnect below.
                                }
                            } catch { /* ignore */
                            }
                        }
                    }
                }
                // Stream ended (timeout cap, proxy, or server restart) —
                // reconnect so auto-rerun keeps working indefinitely.
                if (!controller.signal.aborted) scheduleReconnect();
            } catch {
                /* aborted or network error — reconnect unless unmounting */
                if (!controller.signal.aborted) scheduleReconnect();
            }
        })();
        return () => {
            reconnectScheduled = true; // suppress the timer on unmount
            if (watchReconnectTimerRef.current) {
                clearTimeout(watchReconnectTimerRef.current);
                watchReconnectTimerRef.current = null;
            }
            if (controller) controller.abort();
        };
    }, [settings.autoRunOnFileChange, selectedFolderSlug, selectedFileSlug, watchGeneration]);

    /* ---------------------------------------------------------------- */
    /*  Run from the Explorer tree (F7 / F8)                            */
    /*  Right-click a FILE → "Run this file"; right-click a FOLDER →    */
    /*  "Run all scripts in this folder". Both first make the target    */
    /*  the active selection, then fire once the fresh closure has the  */
    /*  new slugs (a pending-ref + effect pair — calling handleRun      */
    /*  directly from the menu click would use the STALE closure).      */
    /* ---------------------------------------------------------------- */
    const pendingTreeRunRef = React.useRef<string | null>(null);
    // { folder | null, sub } — the sub-folder scope for a
    // pending tree run-all (null sub = whole folder).
    const pendingTreeRunAllRef = React.useRef<{ folder: string; sub?: string } | null>(null);

    // Run the pending tree file once the selection has landed on it.
    React.useEffect(() => {
        const target = pendingTreeRunRef.current;
        if (!target) return;
        if (target !== selectedFileSlug) return;
        pendingTreeRunRef.current = null;
        const t = setTimeout(() => handleRun(), 60);
        return () => clearTimeout(t);
    }, [selectedFileSlug, handleRun]);

    // Run-all the pending tree folder once it is the selected folder
    // and its folders data has resolved.
    React.useEffect(() => {
        const target = pendingTreeRunAllRef.current;
        if (!target) return;
        if (target.folder !== selectedFolderSlug || !selectedFolder) return;
        pendingTreeRunAllRef.current = null;
        const t = setTimeout(() => handleRunAll(target.sub), 60);
        return () => clearTimeout(t);
    }, [selectedFolderSlug, selectedFolder, handleRunAll]);

    /** Explorer right-click → Run this file (F8). Python files only —
     *  the tree only shows the item for those. */
    const handleRunFileFromTree = React.useCallback(
        (folderSlug: string, fileSlug: string) => {
            if (isRunning || batchRunning) {
                toast({title: "A run is already in progress", variant: "warning"});
                return;
            }
            setEditorBlank(false);
            if (folderSlug === selectedFolderSlug && fileSlug === selectedFileSlug) {
                // Already the open file — run immediately (fresh closure).
                handleRun();
                return;
            }
            // guarded switch — the pending tree run arms after
            // the dirty guard clears.
            guardedSelectFile(folderSlug, fileSlug, {
                afterSwitch: () => {
                    pendingTreeRunRef.current = fileSlug;
                },
            });
        },
        [isRunning, batchRunning, selectedFolderSlug, selectedFileSlug, handleRun, toast]
    );

    // keep a late-bound ref to the tree-run handler so
    // the scheduler tick (defined earlier) can fire scheduled scripts
    // without depending on the handler's identity (avoids re-creating
    // the interval on every closure change).
    const handleRunFileFromTreeRef = React.useRef(handleRunFileFromTree);
    React.useEffect(() => {
        handleRunFileFromTreeRef.current = handleRunFileFromTree;
    }, [handleRunFileFromTree]);

    /** Explorer right-click → Run all scripts in this folder (F7).
     * an optional `sub` scopes the batch to that NESTED
     *  subfolder (the subfolder rows' "Run all scripts" item — same
     *  menu as the main folder). */
    const handleRunAllFromTree = React.useCallback(
        (folderSlug: string, sub?: string) => {
            if (isRunning || batchRunning) {
                toast({title: "A run is already in progress", variant: "warning"});
                return;
            }
            setEditorBlank(false);
            if (folderSlug === selectedFolderSlug) {
                handleRunAll(sub);
                return;
            }
            // Switch folder; the selection guard picks the first file and
            // the pending effect fires handleRunAll once data resolves.
            setSelectedFolderSlug(folderSlug);
            setSelectedFileSlug("");
            pendingTreeRunAllRef.current = {folder: folderSlug, sub};
        },
        [isRunning, batchRunning, selectedFolderSlug, handleRunAll, toast]
    );

    /* ---------------------------------------------------------------- */
    /*  Directory watcher — auto-refresh the folder tree when the
      project folder changes externally (e.g., files added/removed
      via the OS file explorer or another editor).
      Always on; uses /api/watch-dir SSE. Debounced 800ms server-side
      so a burst of changes (e.g., git checkout) triggers ONE refresh. */
    /* ---------------------------------------------------------------- */
    const dirWatchAbortRef = React.useRef<AbortController | null>(null);
    // the server caps every watch-dir stream at 10
    // minutes and emits a "timeout" event. The old handler just aborted
    // the fetch — but an abort never re-runs this effect (no dependency
    // changed), so after ten minutes the Explorer auto-refresh was
    // permanently off until a page reload. A generation counter now
    // forces a reconnect; `activeProject` is also a dependency so the
    // watcher follows project switches (it used to keep watching the
    // previous project's directory).
    // this generation state + timer ref were HOISTED to
    // the auto-rerun watcher above (shared reconnect pattern) — the
    // declarations here were removed to avoid a duplicate identifier.
    // This effect keeps its OWN timer ref so the two reconnect loops
    // can never clobber each other's pending timer.
    const dirWatchReconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        // Cancel any existing watcher.
        if (dirWatchAbortRef.current) {
            dirWatchAbortRef.current.abort();
            dirWatchAbortRef.current = null;
        }
        // Connect to /api/watch-dir SSE.
        const controller = new AbortController();
        dirWatchAbortRef.current = controller;
        let reconnectScheduled = false;
        const scheduleReconnect = () => {
            if (reconnectScheduled) return;
            reconnectScheduled = true;
            // Small backoff so a server that closes the stream immediately
            // (e.g. the root doesn't exist yet) isn't hammered in a loop.
            dirWatchReconnectTimerRef.current = setTimeout(() => {
                dirWatchReconnectTimerRef.current = null;
                setWatchGeneration((g) => g + 1);
            }, 2000);
        };
        (async () => {
            try {
                const res = await fetch("/api/watch-dir", {
                    method: "POST",
                    signal: controller.signal,
                });
                if (!res.ok || !res.body) {
                    scheduleReconnect();
                    return;
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const {done, value} = await reader.read();
                    noteSseBytes(value?.byteLength ?? 0);
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() ?? "";
                    for (const part of parts) {
                        for (const line of part.split("\n")) {
                            if (!line.startsWith("data: ")) continue;
                            try {
                                const evt = JSON.parse(line.slice(6));
                                if (evt.type === "changed") {
                                    // The project folder changed — either externally
                                    // (edited in another editor) or as the fs echo of a
                                    // mutation we just performed ourselves. Refresh
                                    // SILENTLY: no "Project refreshed" toast (the
                                    // mutation already announced itself), and a refresh
                                    // arriving <1.5s after an explicit one is coalesced
                                    // away entirely (see refreshFolders).
                                    //
                                    // DEFERRED while a run is active
                                    // script that writes N files triggered N explorer
                                    // refreshes). Instead of refreshing per generated
                                    // file, set a pending flag; the flush effect below
                                    // performs exactly ONE refresh when the run ends.
                                    if (isRunningRef.current || batchRunningRef.current) {
                                        pendingWatchRefreshRef.current = true;
                                    } else {
                                        refreshFolders({silent: true});
                                    }
                                } else if (evt.type === "timeout") {
                                    // Server closed the stream after the max watch
                                    // time — schedule a fresh connection via the
                                    // generation counter.
                                    scheduleReconnect();
                                }
                            } catch { /* ignore */
                            }
                        }
                    }
                }
                // Stream ended without an explicit timeout event — reconnect
                // here too (proxy timeout, server restart, etc.).
                scheduleReconnect();
            } catch {
                // Aborting from the effect cleanup must NOT reconnect — the
                // next effect run owns the connection. A genuine network
                // error retries after the backoff.
                if (!controller.signal.aborted) scheduleReconnect();
            }
        })();
        return () => {
            controller.abort();
            if (dirWatchReconnectTimerRef.current) {
                clearTimeout(dirWatchReconnectTimerRef.current);
                dirWatchReconnectTimerRef.current = null;
            }
        };
    }, [refreshFolders, watchGeneration, activeProject]);

    // ─── Deferred watcher refresh flush (F6) ──────────────────────
    // When a run (single script or run-all batch) finishes, perform the
    // ONE coalesced Explorer refresh for any files the scripts wrote
    // during the run. A short delay lets the final writes settle and
    // batches with a single 60ms script still catch the flush.
    React.useEffect(() => {
        if (isRunning || batchRunning) return;
        if (!pendingWatchRefreshRef.current) return;
        pendingWatchRefreshRef.current = false;
        const t = setTimeout(() => {
            refreshFolders({silent: true});
        }, 600);
        return () => clearTimeout(t);
    }, [isRunning, batchRunning, refreshFolders]);

    /* ---------------------------------------------------------------- */
    /*  Drag-drop file upload                                      */
    /*  Accepts ANY file type — text or binary — into the currently-    */
    /*  selected folder. .ipynb is still special-cased (converted to   */
    /*  .py via /api/import-ipynb); everything else goes through        */
    /*  /api/files-import (utf-8 for text, base64 for binary).          */
    /* ---------------------------------------------------------------- */
    const handleDrop = React.useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        // dropping a TREE file onto the editor area opens
        // it (the custom praxis-files MIME distinguishes internal drags
        // from OS-file imports).
        const internalDrag = e.dataTransfer.getData("application/praxis-files");
        if (internalDrag && !e.dataTransfer.files.length) {
            try {
                const payload = JSON.parse(internalDrag) as Array<{
                    folderSlug?: string;
                    fileSlug?: string;
                }>;
                const first = payload[0];
                if (first?.folderSlug && first.fileSlug) {
                    treeSelectFile(first.folderSlug, first.fileSlug);
                    return;
                }
            } catch {
                /* malformed payload — fall through to the import path */
            }
        }
        if (!settings.dragDropUpload || !selectedFolderSlug) return;
        const files: File[] = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        // Separate .ipynb (special-cased) from generic file imports.
        const ipynbFiles = files.filter((f) => f.name.toLowerCase().endsWith(".ipynb"));
        const otherFiles = files.filter((f) => !f.name.toLowerCase().endsWith(".ipynb"));
        for (const file of ipynbFiles) {
            handleImportNotebook(file);
        }
        if (otherFiles.length === 0) return;
        // Detect binary vs text by extension. The list below covers the
        // common image/audio/video/office formats; everything else is
        // treated as utf-8 text.
        const BINARY_EXTS = new Set([
            ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".tif", ".tiff",
            ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a",
            ".mp4", ".avi", ".mov", ".mkv", ".webm",
            ".pdf",
            ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
            ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt",
            ".pickle", ".pkl", ".npy", ".npz", ".parquet", ".feather", ".h5", ".hdf5",
            ".db", ".sqlite", ".sqlite3",
        ]);
        const readFile = (file: File, asBase64: boolean): Promise<string> =>
            new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => {
                    const result = r.result;
                    if (asBase64) {
                        // result is "data:...;base64,XXXX" — strip the prefix.
                        const s = String(result ?? "");
                        const idx = s.indexOf(",");
                        resolve(idx >= 0 ? s.slice(idx + 1) : s);
                    } else {
                        resolve(String(result ?? ""));
                    }
                };
                r.onerror = () => reject(r.error ?? new Error("read failed"));
                if (asBase64) r.readAsDataURL(file);
                else r.readAsText(file);
            });
        const pending: Array<{ name: string; content: string; encoding?: "utf-8" | "base64" }> = [];
        for (const f of otherFiles) {
            // Skip empty entries that look like directories (no size, no ext).
            if (f.size === 0 && !f.name.includes(".")) continue;
            const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
            const isBinary = BINARY_EXTS.has(ext);
            try {
                const content = await readFile(f, isBinary);
                pending.push({
                    name: f.name,
                    content,
                    encoding: isBinary ? "base64" : "utf-8",
                });
            } catch (err) {
                announceAction({
                    title: "Drop failed",
                    description: `Could not read ${f.name}: ${(err as Error).message}`,
                    variant: "destructive",
                });
            }
        }
        if (pending.length === 0) return;
        // Dry-run import (overwrite:false) so we can detect conflicts and
        // show a toast. For simplicity in the page-level drop (no modal),
        // we skip on conflict and report it.
        try {
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: selectedFolderSlug,
                    files: pending,
                    overwrite: false,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                announceAction({
                    title: "Import failed",
                    description: data.error ?? "Unknown error",
                    variant: "destructive",
                });
                return;
            }
            const imported = data.imported?.length ?? 0;
            const skipped = data.skipped?.length ?? 0;
            announceAction({
                title: "Files imported",
                description: `${imported} imported${
                    skipped > 0 ? `, ${skipped} skipped (already exist)` : ""
                } into ${selectedFolder?.name ?? "folder"}.`,
                // Amber when some files were skipped, green otherwise.
                variant: skipped > 0 ? "warning" : "success",
            });
            refreshFolders();
        } catch (err) {
            announceAction({
                title: "Import failed",
                description: (err as Error).message,
                variant: "destructive",
            });
        }
    }, [settings.dragDropUpload, selectedFolderSlug, selectedFolder, handleImportNotebook, announceAction, refreshFolders]);

    /* ---------------------------------------------------------------- */
    /*  Export run as HTML                                         */
    /* ---------------------------------------------------------------- */

    /* ---------------------------------------------------------------- */
    /*  Command palette actions                                     */
    /* ---------------------------------------------------------------- */
    const commandActions: CommandAction[] = React.useMemo(() => {
        const actions: CommandAction[] = [];
        if (selectedFileSlug && !isRunning) {
            actions.push({
                id: "run", label: "Run current script", group: "Run",
                icon: <Play className="size-3.5"/>, action: handleRun, shortcut: "⌘↵",
            });
        }
        if (isRunning) {
            actions.push({
                id: "stop", label: "Stop running script", group: "Run",
                icon: <Square className="size-3.5"/>, action: handleStopPrimary,
            });
        }
        if (selectedFolderSlug && selectedFolder) {
            actions.push({
                id: "run-all", label: `Run all in ${selectedFolder.name}`, group: "Run",
                icon: <Layers className="size-3.5"/>, action: handleRunAll,
            });
        }
        actions.push({
            id: "search", label: "Search scripts", group: "File",
            icon: <Search className="size-3.5"/>, action: () => setSearchOpen(true), shortcut: "⌘K",
        });
        actions.push({
            id: "history", label: "Open run history", group: "File",
            icon: <History className="size-3.5"/>, action: () => setHistoryOpen(true), shortcut: "⌘⇧H",
        });
        actions.push({
            id: "snippets", label: "Open snippet palette", group: "File",
            icon: <Terminal className="size-3.5"/>, action: () => setSnippetOpen(true), shortcut: "⌘⇧S",
        });
        if (closedTabHistory.length > 0) {
            actions.push({
                id: "reopen-tab", label: "Reopen last closed tab", group: "File",
                icon: <RefreshCw className="size-3.5"/>, action: handleReopenClosedTab, shortcut: "⌘⇧T",
            });
        }
        // Close all editors — from the File menu / palette; the
        // workspace goes solid-blank until another file is opened.
        if (openTabs.length > 0) {
            actions.push({
                id: "close-all-editors", label: "Close all editors", group: "File",
                icon: <X className="size-3.5"/>, action: handleCloseAllEditors,
            });
        }
        actions.push({
            id: "toggle-sidebar", label: "Toggle file tree sidebar", group: "View",
            icon: <PanelLeft className="size-3.5"/>,
            // Desktop uses sidebarVisible; mobile uses sidebarOpen (drawer).
            // We check the viewport width and toggle the right one.
            action: () => {
                if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                    toggleSidebarVisible();
                } else {
                    setSidebarOpen((v) => !v);
                }
            },
        });
        // Editor actions (N3 — command palette integration with the
        // imperative CodeViewer API). All are no-ops when no file is open.
        if (selectedFileSlug) {
            actions.push({
                id: "save", label: "Save current file", group: "File",
                icon: <Download className="size-3.5"/>, action: () => saveActiveFile(), shortcut: "⌘S",
            });
            actions.push({
                id: "save-all", label: "Save all open tabs", group: "File",
                icon: <Download className="size-3.5"/>, action: () => void handleSaveAll(), shortcut: "⌘⌥S",
            });
            actions.push({
                id: "find", label: "Find in current file", group: "File",
                icon: <Search className="size-3.5"/>, action: () => codeViewerRef.current?.openFind(), shortcut: "⌘F",
            });
            actions.push({
                id: "replace",
                label: "Find and replace",
                group: "File",
                icon: <Search className="size-3.5"/>,
                action: () => codeViewerRef.current?.openReplace(),
                shortcut: "⌘⌥F",
            });
            actions.push({
                id: "format",
                label: "Format document (black/ruff)",
                group: "File",
                icon: <Wrench className="size-3.5"/>,
                action: () => void codeViewerRef.current?.format(),
                shortcut: "⌘⇧F",
            });
            // ── Compare entries (the same dialogs the right-click Compare ▸
            // group opens) — the palette route the feature spec asked for.
            actions.push({
                id: "compare-files", label: "Compare two files…", group: "File",
                icon: <Columns2 className="size-3.5"/>,
                action: () => {
                    // Preselect the current file as the LEFT side when one is open.
                    if (selectedFolderSlug && selectedFileSlug) {
                        setCompareFilesPreselect({folderSlug: selectedFolderSlug, fileSlug: selectedFileSlug});
                    }
                    setCompareFilesOpen(true);
                },
            });
            actions.push({
                id: "compare-clipboard", label: "Compare current file with clipboard", group: "File",
                icon: <CopyMinus className="size-3.5"/>,
                action: () => {
                    if (!selectedFolderSlug || !selectedFileSlug) return;
                    window.dispatchEvent(new CustomEvent("praxis:compare-clipboard", {
                        detail: {folder: selectedFolderSlug, file: selectedFileSlug},
                    }));
                },
            });
            // ── The inspect trio from the editor's right-click menu, in the
            // palette too (Python files).
            if (isPythonFile) {
                actions.push({
                    id: "ast-explorer", label: "Open AST Explorer", group: "Tools",
                    icon: <Braces className="size-3.5"/>, action: () => setAstExplorerOpen(true),
                });
                actions.push({
                    id: "bytecode", label: "Open Bytecode Inspector", group: "Tools",
                    icon: <Zap className="size-3.5"/>, action: () => setBytecodeOpen(true),
                });
                actions.push({
                    id: "hypothesis", label: "Generate property tests (Hypothesis)", group: "Tools",
                    icon: <FlaskConical className="size-3.5"/>,
                    action: () => window.dispatchEvent(new CustomEvent("praxis:open-hypothesis")),
                });
            }
        }
        actions.push({
            id: "toggle-theme", label: "Toggle light / dark theme", group: "View",
            icon: <Palette className="size-3.5"/>,
            action: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
        });
        actions.push({
            id: "settings", label: "Open settings", group: "View",
            icon: <SettingsIcon className="size-3.5"/>, action: () => setSettingsOpen(true), shortcut: "⌘,",
        });
        actions.push({
            id: "ai-chat", label: "Open AI chat assistant", group: "AI",
            icon: <Sparkles className="size-3.5"/>, action: () => setAiChatOpen((v) => !v), shortcut: "⌘⇧L",
        });
        if (runResult && !isRunning) {
            actions.push({
                id: "export-md", label: "Export as Markdown", group: "Tools",
                icon: <FileCode2 className="size-3.5"/>, action: handleExportMd,
            });
            actions.push({
                id: "export-ipynb", label: "Export as Jupyter notebook", group: "Tools",
                icon: <Download className="size-3.5"/>, action: handleExportIpynb,
            });
            actions.push({
                id: "export-html", label: "Export as standalone HTML", group: "Tools",
                icon: <Download className="size-3.5"/>, action: handleExportHtml,
            });
        }
        if (selectedFolderSlug && selectedFileSlug) {
            actions.push({
                id: "reveal", label: "Reveal current file in Explorer", group: "View",
                icon: <ListTree className="size-3.5"/>, action: () => {
                    // On desktop, dispatch the reveal-current event the
                    // FolderTree listens for (it scrolls the file into view).
                    // On mobile, open the drawer first so the sidebar is visible.
                    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                        setSidebarVisible(true);
                        window.dispatchEvent(new CustomEvent("praxis:reveal-current"));
                    } else {
                        setSidebarOpen(true);
                        // Also dispatch the reveal event after a short delay so
                        // the mobile FolderTree has time to mount.
                        setTimeout(() => window.dispatchEvent(new CustomEvent("praxis:reveal-current")), 100);
                    }
                },
            });
        }
        return actions;
    }, [
        selectedFileSlug, isRunning, currentRunId, selectedFolderSlug, selectedFolder,
        handleRun, handleStop, handleRunAll, handleReopenClosedTab, resolvedTheme, setTheme,
        openTabs.length, handleCloseAllEditors,
        runResult, handleExportMd, handleExportIpynb, handleExportHtml, closedTabHistory.length,
        toggleSidebarVisible,
    ]);

    // Add Ctrl+Shift+P (command palette) + Ctrl+Shift+T (reopen tab) to
    // the keyboard shortcuts.
    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod || !e.shiftKey) return;
            if (e.key === "P" || e.key === "p") {
                e.preventDefault();
                setCommandPaletteOpen(true);
            } else if (e.key === "T" || e.key === "t") {
                e.preventDefault();
                handleReopenClosedTab();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleReopenClosedTab]);

    /* ---------------------------------------------------------------- */
    /*  Inline diagnostics + git-diff gutter — fire in PARALLEL, 100ms   */
    /*  debounce after file selection so /api/code loads first.           */
    /*  AbortController kills stale fetches on rapid file switching.     */
    /* ---------------------------------------------------------------- */
    const lintAbortRef = React.useRef<AbortController | null>(null);
    const settingsRef = React.useRef(settings);
    React.useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    React.useEffect(() => {
        if (!selectedFolderSlug || !selectedFileSlug || !isPythonFile) {
            setInlineDiagnostics([]);
            setGitDiffLines(undefined);
            return;
        }
        const s = settingsRef.current;
        if (!s.inlineDiagnostics && !s.showGitDiffGutter) return;

        // Abort any in-flight lint/git-diff from a previous file selection.
        if (lintAbortRef.current) {
            try {
                lintAbortRef.current.abort();
            } catch { /* ignore */
            }
        }
        const controller = new AbortController();
        lintAbortRef.current = controller;

        const timer = setTimeout(() => {
            if (controller.signal.aborted) return;

            // ── Lint (parallel, if enabled) ─────────────────────────
            if (s.inlineDiagnostics) {
                fetch("/api/lint", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: selectedFolderSlug,
                        file: selectedFileSlug,
                        interpreter: s.pythonInterpreter || undefined,
                    }),
                    signal: controller.signal,
                })
                    .then((res) => res.ok ? res.json() : null)
                    .then((data) => {
                        if (!data || controller.signal.aborted) return;
                        const diags = (data.diagnostics ?? []).map((d: {
                            line: number;
                            col?: number;
                            severity?: string;
                            message: string
                        }) => ({
                            line: d.line,
                            col: d.col,
                            severity: (d.severity === "warning" ? "warning" : "error") as "error" | "warning",
                            message: d.message,
                        }));
                        setInlineDiagnostics(diags);
                    })
                    .catch((err) => {
                        if (err instanceof DOMException && err.name === "AbortError") return;
                    });
            } else {
                setInlineDiagnostics([]);
            }

            // ── Git-diff (parallel, if enabled) ──────────────────────
            if (s.showGitDiffGutter) {
                fetch(
                    `/api/git-diff?folder=${encodeURIComponent(selectedFolderSlug)}&file=${encodeURIComponent(selectedFileSlug)}`,
                    {signal: controller.signal}
                )
                    .then((res) => res.ok ? res.json() : null)
                    .then((data) => {
                        if (!data || controller.signal.aborted) return;
                        setGitDiffLines({
                            added: data.addedLines ?? [],
                            removed: data.removedLines ?? [],
                            modified: data.modifiedLines ?? [],
                        });
                    })
                    .catch((err) => {
                        if (err instanceof DOMException && err.name === "AbortError") return;
                    });
            } else {
                setGitDiffLines(undefined);
            }
        }, 100);

        return () => {
            clearTimeout(timer);
            try {
                controller.abort();
            } catch { /* ignore */
            }
        };
        // lintNonce re-triggers on manual re-lint AND after every save
        // (inline diagnostics used to never refresh after a
        // save because the deps were selection-only — the editor kept
        // showing the pre-save diagnostics until the next file switch).
    }, [selectedFolderSlug, selectedFileSlug, isPythonFile, lintNonce]);

    /* ---------------------------------------------------------------- */
    /*  AI test generation  — streams pytest tests from            */
    /*  /api/ai-generate-tests (SSE) and shows a live preview dialog     */
    /*  before writing the file to disk.                                 */
    /* ---------------------------------------------------------------- */
    const [generatingTests, setGeneratingTests] = React.useState(false);
    // Streaming preview dialog state.
    const [testPreviewOpen, setTestPreviewOpen] = React.useState(false);
    const [testPreviewFileName, setTestPreviewFileName] = React.useState<string | null>(null);
    const [testPreviewCode, setTestPreviewCode] = React.useState("");
    const [testPreviewError, setTestPreviewError] = React.useState<string | null>(null);
    const [testPreviewWriting, setTestPreviewWriting] = React.useState(false);
    // Abort controller for the in-flight test-gen stream — lets the user
    // cancel mid-stream via the preview dialog's Cancel button.
    const testGenAbortRef = React.useRef<AbortController | null>(null);

    /** Write the accumulated test code to disk via /api/import-py, then
     * open the new file as an editor tab. Called when the user clicks
     * "Write to disk" in the preview dialog. */
    const writeTestFile = React.useCallback(async () => {
        if (!selectedFolderSlug || !testPreviewFileName || !testPreviewCode.trim()) return;
        setTestPreviewWriting(true);
        try {
            const res = await fetch("/api/import-py", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: selectedFolderSlug,
                    fileName: testPreviewFileName,
                    content: testPreviewCode,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            announceAction({
                title: "Tests generated",
                description: `${testPreviewFileName} created with AI-generated tests. Opening as a new editor tab…`,
                variant: "success",
            });
            setTestPreviewOpen(false);
            await refreshFolders();
            // guarded switch (auto-open after generation).
            guardedSelectFile(selectedFolderSlug, data.slug);
        } catch (err) {
            announceAction({
                title: "Failed to write test file",
                description: (err as Error).message,
                variant: "destructive",
            });
        } finally {
            setTestPreviewWriting(false);
        }
    }, [selectedFolderSlug, testPreviewFileName, testPreviewCode, announceAction, refreshFolders]);

    /** Discard the preview + abort any in-flight stream. */
    const discardTestPreview = React.useCallback(() => {
        if (testGenAbortRef.current) {
            try {
                testGenAbortRef.current.abort();
            } catch { /* ignore */
            }
            testGenAbortRef.current = null;
        }
        setTestPreviewOpen(false);
        setTestPreviewCode("");
        setTestPreviewFileName(null);
        setTestPreviewError(null);
        setGeneratingTests(false);
    }, []);

    // optional explicit (folder, file, name) so the Explorer's
    // file right-click "AI > Generate tests for this file" can trigger a
    // generation WITHOUT the file being open first (the tree passes its
    // own slugs; the menu-bar Run > path keeps using the selection).
    const handleGenerateTests = React.useCallback(async (
        explicitFolder?: string,
        explicitFile?: string,
        explicitName?: string
    ) => {
        const folderSlug = explicitFolder ?? selectedFolderSlug;
        const fileSlug = explicitFile ?? selectedFileSlug;
        const fileName = explicitName ?? selectedFile?.name;
        if (!folderSlug || !fileSlug || generatingTests) return;
        // Reset preview state + open the dialog immediately so the user
        // sees feedback before the first token arrives.
        setGeneratingTests(true);
        setTestPreviewCode("");
        setTestPreviewError(null);
        setTestPreviewFileName(null);
        setTestPreviewOpen(true);
        announceAction({
            title: "Generating tests…",
            description: `AI is generating pytest tests for ${fileName ?? "this script"}. A preview will appear shortly.`,
        });

        const controller = new AbortController();
        testGenAbortRef.current = controller;

        try {
            // Route test generation through the selected chat
            // provider (Settings → AI — an OpenAI-compatible endpoint like
            // Ollama / LM Studio / vLLM / llama.cpp; the built-in Z.AI SDK
            // was removed). Read at request time so provider switches
            // apply to the next generation. No provider configured → the
            // request still sends (provider omitted) and the server answers
            // with the actionable "add a provider" message.
            const genProvider = getActiveChatProvider(loadSettings());
            // The chat Tuning popover's sampling knobs (temperature /
            // max_tokens / top_p) persist app-wide; read at request time and
            // forwarded so a "tune for long generations" change also governs
            // test generation (the route's sanitizeProvider validates +
            // clamps them; null/absent = provider defaults, nothing sent).
            const genSampling = readPersistedSampling();
            const res = await fetch("/api/ai-generate-tests", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug,
                    file: fileSlug,
                    interpreter: settings.pythonInterpreter || undefined,
                    ...(genProvider
                        ? {
                            provider: {
                                kind: genProvider.kind,
                                baseUrl: genProvider.baseUrl,
                                apiKey: genProvider.apiKey,
                                model: genProvider.model,
                                ...(genSampling ? {sampling: genSampling} : {}),
                            },
                        }
                        : {}),
                }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => "");
                throw new Error(errText || `Request failed with status ${res.status}`);
            }
            if (!res.body) throw new Error("The AI service returned no response stream.");

            // Parse the SSE stream. Same structure as the AI Chat sidebar:
            // `data: {json}\n\n` events, terminated by `data: [DONE]\n\n`.
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const applyEvent = (data: string): boolean => {
                if (data === "[DONE]") return true;
                let parsed: unknown;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    return false;
                }
                if (parsed && typeof parsed === "object" && "error" in parsed) {
                    const errMsg = (parsed as { error?: unknown }).error;
                    throw new Error(
                        typeof errMsg === "string" ? errMsg : "The AI service returned an error."
                    );
                }
                const p = parsed as { fileName?: string; delta?: string };
                if (typeof p?.fileName === "string") {
                    setTestPreviewFileName(p.fileName);
                }
                if (typeof p?.delta === "string" && p.delta) {
                    setTestPreviewCode((prev) => prev + p.delta);
                }
                return false;
            };

            while (true) {
                const {done, value} = await reader.read();
                noteSseBytes(value?.byteLength ?? 0);
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                let sepIdx: number;
                while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
                    const rawEvent = buffer.slice(0, sepIdx);
                    buffer = buffer.slice(sepIdx + 2);
                    if (!rawEvent) continue;
                    const lines = rawEvent.replace(/\r\n/g, "\n").split("\n");
                    const dataLines = lines
                        .filter((l) => l.startsWith("data:"))
                        .map((l) => l.slice(5).replace(/^ /, ""));
                    if (dataLines.length === 0) continue;
                    if (applyEvent(dataLines.join("\n"))) {
                        buffer = "";
                        break;
                    }
                }
            }
            // Flush trailing partial event.
            const tail = buffer.trim();
            if (tail) {
                const lines = tail.replace(/\r\n/g, "\n").split("\n");
                const dataLines = lines
                    .filter((l) => l.startsWith("data:"))
                    .map((l) => l.slice(5).replace(/^ /, ""));
                if (dataLines.length > 0) applyEvent(dataLines.join("\n"));
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                // User cancelled — don't surface as an error.
            } else {
                const msg = err instanceof Error ? err.message : "Unknown error during test generation.";
                setTestPreviewError(msg);
                announceAction({
                    title: "Test generation failed",
                    description: msg,
                    variant: "destructive",
                });
            }
        } finally {
            setGeneratingTests(false);
            testGenAbortRef.current = null;
        }
    }, [selectedFolderSlug, selectedFileSlug, generatingTests, selectedFile, settings.pythonInterpreter, announceAction]);

    /* ---------------------------------------------------------------- */
    /*  Derived                                                         */
    /* ---------------------------------------------------------------- */

    /* (slow sidebar / config open / file open): the FolderTree
     is an ~8k-line component. Every inline arrow prop below used to get
     a NEW identity on each page render, so ANY page-level state change
     (opening Settings, toggling the sidebar, a run tick) re-rendered
     the entire tree and everything under it — seconds of dev-mode
     jank per interaction. These stabilized callbacks + React.memo on
     the FolderTree itself keep the tree out of unrelated re-renders.
     The handlers that need live selection state use it as a dep — the
     tree re-renders on selection changes anyway (selected* are props). */
    /** the tree's select handler is memoized with
     *  an empty dep list (tree render perf) — it reads the active tab's
     *  dirty flag + name through this ref mirror instead. */

    /** the ONE guarded file-open path — every interactive
     *  switch surface (tree click, ⌘K palette, run history, go-to-def,
     *  recent files, data browser, back/forward, reveal, reopen-tab,
     *  auto-open-after-create…) funnels through here. If the open file
     *  is dirty (tab flag OR the direct viewerDirtyRef mirror), the
     *  Save / Discard dialog blocks the switch — enforced for ALL
     *  file kinds, notebooks included. Returns true when the switch
     *  went through. */
    const treeSelectFile = React.useCallback(
        (folderSlug: string, fileSlug: string) => {
            // both the keyboard navigation and the explorer click delegate
            // to the ONE guarded path (dirty guard enforced for all files).
            guardedSelectFile(folderSlug, fileSlug);
        },
        [guardedSelectFile]
    );
    const treeToggleSort = React.useCallback(
        () => setSortMode((m) => (m === "alpha" ? "mtime" : "alpha")),
        []
    );
    const treeOpenDataFileBrowser = React.useCallback(() => setDataFileBrowserOpen(true), []);
    const treeUploadZip = React.useCallback(
        () => document.getElementById("zip-upload-input")?.click(),
        []
    );
    const treeOpenFolderPicker = React.useCallback(() => setFolderPickerOpen(true), []);
    const treeFilesImported = React.useCallback(() => {
        // Folder tree was already refreshed inside FolderTree .
    }, []);
    const treeFileDeleted = React.useCallback(
        (folderSlug: string, deletedFileSlug: string) => {
            // If the deleted file was the active one, clear the selection so
            // the editor doesn't show stale content.
            if (deletedFileSlug === selectedFileSlug) {
                setSelectedFileSlug("");
                setActiveTabId(null);
            }
            // Also close any editor tab pointing to the deleted file.
            setOpenTabs((prev) => prev.filter((t) => t.fileSlug !== deletedFileSlug));
        },
        [selectedFileSlug]
    );
    const treeFileRenamed = React.useCallback(
        (folderSlug: string, oldSlug: string, newSlug: string) => {
            // If the renamed file was the active one, update the selection to
            // the new slug so the editor keeps showing it.
            if (oldSlug === selectedFileSlug) {
                setSelectedFileSlug(newSlug);
            }
            // Also update any open editor tab.
            setOpenTabs((prev) => prev.map((t) => (t.fileSlug === oldSlug ? {...t, fileSlug: newSlug} : t)));
        },
        [selectedFileSlug]
    );
    const treeOpenFolder = React.useCallback(() => {
        // Delegates to the existing handleOpenFolder which calls
        // /api/open-folder. The context-menu item already selected the file
        // before opening the menu, so it opens the right folder.
        void handleOpenFolder();
    }, [handleOpenFolder]);
    const treeDownloadFile = React.useCallback((folderSlug: string, fileSlug: string) => {
        // Direct download via the /api/download route.
        const url = `/api/download?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }, []);
    const treeCollapseSidebar = React.useCallback(() => setSidebarVisible(false), []);
    const treeFolderDeleted = React.useCallback(
        (folderSlug: string) => {
            // If the deleted folder was the active one, clear the selection.
            if (folderSlug === selectedFolderSlug) {
                setSelectedFolderSlug("");
                setSelectedFileSlug("");
                setActiveTabId(null);
            }
            // Close any editor tabs pointing to files in the deleted folder.
            setOpenTabs((prev) => prev.filter((t) => t.folderSlug !== folderSlug));
        },
        [selectedFolderSlug]
    );
    const treeFolderRenamed = React.useCallback(
        (oldSlug: string, _newName: string) => {
            // The slug changed — the old slug no longer resolves; re-select
            // under the new name.
            if (oldSlug === selectedFolderSlug) {
                setSelectedFolderSlug("");
                setSelectedFileSlug("");
                setActiveTabId(null);
            }
            // Close any editor tabs pointing to the renamed folder.
            setOpenTabs((prev) => prev.filter((t) => t.folderSlug !== oldSlug));
        },
        [selectedFolderSlug]
    );
    const treeFolderCreated = React.useCallback(() => {
        // Selection-only; FolderTree refreshed the tree .
    }, []);
    const treeFileCreated = React.useCallback(
        (folderSlug: string, fileSlug: string) => {
            // Auto-open the new file in the editor — guarded (a
            // dirty buffer in the open file prompts Save/Discard first).
            guardedSelectFile(folderSlug, fileSlug);
        },
        [guardedSelectFile]
    );
    const treeFileDuplicated = React.useCallback(() => {
        // Selection-only; FolderTree refreshed the tree .
    }, []);
    const treeFileMoved = React.useCallback(
        (oldFolderSlug: string, oldFileSlug: string, newFolderSlug: string, newFileSlug: string) => {
            // If the moved file was the active one, update the selection.
            if (oldFolderSlug === selectedFolderSlug && oldFileSlug === selectedFileSlug) {
                setSelectedFolderSlug(newFolderSlug);
                setSelectedFileSlug(newFileSlug);
            }
            // Update any open editor tab to point to the new location.
            setOpenTabs((prev) => prev.map((t) =>
                t.folderSlug === oldFolderSlug && t.fileSlug === oldFileSlug
                    ? {...t, folderSlug: newFolderSlug, fileSlug: newFileSlug}
                    : t
            ));
        },
        [selectedFolderSlug, selectedFileSlug]
    );
    const treeFileCopied = React.useCallback(() => {
        // Selection-only; FolderTree refreshed the tree .
    }, []);
    const treeGenerateTestsForFile = React.useCallback(
        (folderSlug: string, fileSlug: string, fileName: string) =>
            void handleGenerateTests(folderSlug, fileSlug, fileName),
        [handleGenerateTests]
    );
    const treeCreateExample = React.useCallback(
        (exampleId: string, folderSlug: string, sub?: string) =>
            void handleCreateExample(exampleId, folderSlug, sub),
        [handleCreateExample]
    );

    /* ---------------------------------------------------------------- */
    /* (cont.) — FolderTree urgent-pass renders. */
    /*                                                                  */
    /*  The tree is React.memo'd and receives DEFERRED selection props,  */
    /*  but a handful of its callback props were useCallback'd over     */
    /*  selection state (selectedFolderSlug/FileSlug, code, handlers    */
    /*  that themselves dep on selection): their identity changed on     */
    /*  EVERY file click, defeating the memo and re-rendering the 8k-   */
    /*  line tree (~0.5-1.3 s) in the URGENT pass — the exact blocker   */
    /*  behind "opening files takes a while". Routed through            */
    /*  useStableEvent: identity stays constant (memo holds, tree        */
    /*  renders only when folders/selection-deferred actually change),   */
    /*  behavior always reads the latest closure.                       */
    /* ---------------------------------------------------------------- */
    // the ONE generic right-click formatter (every language).
    const treeStFormatFile = useStableEvent(handleFormatTreeFile);
    const treeStRunFile = useStableEvent(handleRunFileFromTree);
    const treeStRunAllInFolder = useStableEvent(handleRunAllFromTree);
    const treeStGenerateTestsForFile = useStableEvent(treeGenerateTestsForFile);
    const treeStCreateExample = useStableEvent(treeCreateExample);
    const treeStFileDeleted = useStableEvent(treeFileDeleted);
    const treeStFileRenamed = useStableEvent(treeFileRenamed);
    const treeStFileMoved = useStableEvent(treeFileMoved);
    const treeStFolderDeleted = useStableEvent(treeFolderDeleted);
    const treeStFolderRenamed = useStableEvent(treeFolderRenamed);
    const treeStCollapseSidebar = useStableEvent(treeCollapseSidebar);
    const treeStFilesImported = useStableEvent(treeFilesImported);
    const treeStProjectCreated = useStableEvent(handleProjectCreated);
    const treeStOpenFolder = useStableEvent(treeOpenFolder);
    const treeStDownloadFile = useStableEvent(treeDownloadFile);
    const treeStSelectProject = useStableEvent(handleSelectProject);
    // PERF (CodeViewer memo): stable identity so the memo'd editor skips
    // re-renders on unrelated page state changes.
    const treeSnippetConsumed = React.useCallback(() => {
        // consume the snippet signal once applied — it
        // used to stay armed forever and re-append itself to every later
        // file / save.
        setInsertSnippet(null);
    }, []);

    /* ---------------------------------------------------------------- */
    /* — MenuBar performance (explorer/file-open lag). */
    /*                                                                  */
    /*  PROFILING showed a single file click re-renders the 2600-element */
    /*  MenuBar tree 3-4 times at ~900 ms per pass (3.2 s blocking long */
    /* task) — its ~70 inline-arrow props defeat any memoization and */
    /*  every selection change cascades through several state commits.  */
    /*                                                                  */
    /* Fix (three layers, all safe — no stale closures): */
    /*  1. Every function prop is routed through useStableEvent —       */
    /*     identity stable for the component lifetime, behavior always */
    /*     from the CURRENT render (the hook keeps a ref to the latest */
    /*     closure). Clicking Run a millisecond after switching files   */
    /*     runs the NEW file, not the old one.                          */
    /*  2. The MenuBar ELEMENT is useMemo'd on its value props only     */
    /*     (projects, toggles, enabled flags …) — when only the         */
    /*     selection changes, the element reference is identical and    */
    /*     React bails out of the whole MenuBar subtree.                */
    /*  3. The element is rendered through useDeferredValue: on an      */
    /*     urgent pass (file click) React shows the previous MenuBar    */
    /*     (instant — handlers are stable events, so still correct),    */
    /*     then re-renders it concurrently so menu enablement flags     */
    /*     (canRun, dirty count …) catch up a moment later. The main    */
    /*     thread stays free for the editor/file opening.               */
    /* ---------------------------------------------------------------- */
    const menuAutoIndent = useStableEvent(handleAutoIndentFile);
    const menuNewFolder = useStableEvent(
        () => window.dispatchEvent(new CustomEvent("praxis:new-folder", {detail: {nonce: nextMenuEventNonce()}}))
    );
    const menuNewFile = useStableEvent(
        () => window.dispatchEvent(new CustomEvent("praxis:new-file", {detail: {nonce: nextMenuEventNonce()}}))
    );
    const menuCreateExample = useStableEvent(
        (exampleId: string) => void handleCreateExample(exampleId)
    );
    const menuUploadZip = useStableEvent(
        () => document.getElementById("zip-upload-input")?.click()
    );
    // Save routing — the Python CodeViewer owns its own save path, but
    // non-Python files render in the FileViewer, which flushes its edit /
    // studio buffer on the praxis:file-viewer-save request (it only
    // writes when the buffer is dirty, then confirms with
    // praxis:file-viewer-saved). ⌘S / File ▸ Save now reach BOTH editors.
    const saveActiveFile = useStableEvent(() => {
        /* Phase 2 — the ROUTING decision is the pure routeSaveIntent rule
     * (lib/tab-lifecycle.ts): an untitled draft opens the Save As
     * picker (it has no disk file and no mounted editor); real files
     * route by kind — FileViewer event for non-Python, CodeViewer
     * ref for Python (a no-op when nothing is mounted). */
        const active = openTabs.find((t) => t.id === activeTabId) ?? null;
        const route = routeSaveIntent(active, selectedFileKindRef.current);
        if (route === "open-save-as" && active) {
            // Seed the picker through the lifecycle hook (folder + default name).
            openSaveAsPicker(active, selectedFolderSlug);
            return;
        }
        if (route === "file-viewer") {
            window.dispatchEvent(new Event("praxis:file-viewer-save"));
            return;
        }
        void codeViewerRef.current?.save();
    });
    const menuSave = useStableEvent(() => saveActiveFile());
    const menuSaveAll = useStableEvent(handleSaveAll);
    const menuCloseAllEditors = useStableEvent(handleCloseAllEditors);
    const menuDownload = useStableEvent(() => {
        if (!selectedFolderSlug || !selectedFileSlug) return;
        const url = `/api/download?folder=${encodeURIComponent(selectedFolderSlug)}&file=${encodeURIComponent(selectedFileSlug)}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
    });
    const menuOpenSettings = useStableEvent((tab?: string) => {
        // The AI menu's "AI settings…" item passes "ai" so the dialog
        // opens directly on the AI tab; other callers pass nothing and
        // the dialog keeps the last-visited tab.
        setSettingsTab(tab ?? null);
        setSettingsOpen(true);
    });
    const menuSelectProject = useStableEvent(handleSelectProject);
    const menuBrowseProjectFolder = useStableEvent(() => setFolderPickerOpen(true));
    const menuCreateProject = useStableEvent(
        () => window.dispatchEvent(new CustomEvent("praxis:create-project", {detail: {nonce: nextMenuEventNonce()}}))
    );
    const menuUndo = useStableEvent(() => codeViewerRef.current?.undo());
    const menuRedo = useStableEvent(() => codeViewerRef.current?.redo());
    const menuCut = useStableEvent(() => codeViewerRef.current?.cut());
    const menuCopy = useStableEvent(() => codeViewerRef.current?.copy());
    const menuPaste = useStableEvent(() => void codeViewerRef.current?.paste());
    const menuFind = useStableEvent(() => codeViewerRef.current?.openFind());
    const menuReplace = useStableEvent(() => codeViewerRef.current?.openReplace());
    const menuFindInFiles = useStableEvent(() => setProjectSearchOpen(true));
    const menuFormat = useStableEvent(() => {
        // Edit ▸ Format document routes by kind —
        // Markdown / HTML go to the FileViewer's formatter (valid in view
        // AND edit mode); Python keeps the black/ruff editor path.
        // TOML + JSON joined (lib/toml-format, lib/json-format).
        // YAML / CSS / SQL joined (lib/misc-format).
        // the code families joined (lib/code-format +
        // matlab-format): JavaScript / TypeScript / MATLAB / Java / C /
        // C++ / R / shell.
        if (
            selectedFileKind === "markdown" ||
            capabilitiesForKind(selectedFileKind).canFormat
        ) {
            // capability-routed — every formattable non-Python kind
            // (incl. ruby / php / go) reaches the FileViewer formatter.
            window.dispatchEvent(new CustomEvent("praxis:file-viewer-format", {detail: {mode: "format"}}));
            return;
        }
        void codeViewerRef.current?.format();
    });
    // Edit ▸ Organize Imports — ruff's import-block pass (`--select I
    // --fix`) over the LIVE editor buffer through the viewer handle (the
    // same route Format Document rides; Python only, the menu item gates).
    const menuOrganizeImports = useStableEvent(() => {
        void codeViewerRef.current?.organizeImports();
    });
    const menuToggleSidebar = useStableEvent(toggleSidebarVisible);
    const menuToggleBottomPanel = useStableEvent(() => setBottomPanelOpen((v) => !v));
    const menuIncreaseFontSize = useStableEvent(() => adjustCodeFontSize(1));
    const menuDecreaseFontSize = useStableEvent(() => adjustCodeFontSize(-1));
    const menuResetFontSize = useStableEvent(resetCodeFontSize);
    const menuRefresh = useStableEvent(refreshFolders);
    const menuOpenSearch = useStableEvent(() => setSearchOpen(true));
    // the command palette (Ctrl+Shift+P twin) — the extra top-right
    // quick-action button opens it (opt-in switch, Settings → Nav).
    const menuOpenCommandPalette = useStableEvent(() => setCommandPaletteOpen(true));
    const menuOpenSymbolPalette = useStableEvent(() => setSymbolPaletteOpen(true));
    const menuOpenLocalHistory = useStableEvent(() => setLocalHistoryOpen(true));
    const menuToggleDistractionFree = useStableEvent(toggleDistractionFree);
    const menuToggleFullscreen = useStableEvent(toggleFullscreen);
    const menuToggleTerminalPanel = useStableEvent(toggleTerminalPanel);
    const menuOpenProjectSymbols = useStableEvent(() => setSymbolSearchOpen(true));
    const menuRun = useStableEvent(handleRun);
    const menuStop = useStableEvent(handleStopPrimary);
    const menuRunAll = useStableEvent(handleRunAll);
    const menuRunWithCoverage = useStableEvent(() => {
        setTraceCoverageOverride(true);
        void handleRun();
    });
    const menuRunInConsole = useStableEvent(handleRunInConsole);
    // Run ▸ Debug with pdb — FIRST-RUN FIX: the old handler only flipped
    // the bottom tab; with the panel closed nothing opened, and when it
    // was open the Diagnostics panel still landed on its DEFAULT inner
    // tool (lint) instead of the debug one — the first invocation
    // showed an empty/irrelevant panel. Now the handler opens the panel,
    // switches to the Diagnostics tab AND queues a durable debug request
    // (lib/pending-console-run): the panel selects the Debug tool and
    // starts the pdb session, whether it was already mounted or just
    // mounted because of this click.
    const menuDebug = useStableEvent(() => {
        setBottomPanelOpen(true);
        setBottomTab("diag");
        queueDebugRun();
    });

    /* ─── NEW FEATURE SURFACE handlers ─────────────────────────── */

    // Python intelligence surfaces (AST / bytecode / docstrings /
    // refactoring) — open-on-demand dialogs for the ACTIVE python file.
    const menuOpenAstExplorer = useStableEvent(() => setAstExplorerOpen(true));
    const menuOpenBytecodeInspector = useStableEvent(() => setBytecodeOpen(true));
    const menuOpenDocstringStudio = useStableEvent(() => setDocstringStudioOpen(true));
    const menuOpenRefactorPalette = useStableEvent(() => setRefactorPaletteOpen(true));

    // Run modes that render in the bottom panel.
    const menuRunTutorView = useStableEvent(() => {
        setBottomPanelOpen(true);
        setBottomTab("tutor");
    });
    const menuRunTimeTravel = useStableEvent(() => {
        setBottomPanelOpen(true);
        setBottomTab("replay");
    });
    const menuRunMultiPython = useStableEvent(() => setMultiPythonOpen(true));
    // Run ▸ Line & Memory Profile… — records per-line timings (+ optional
    // tracemalloc per-function deltas) and paints the heat gutter.
    const menuRunLineProfile = useStableEvent(() => {
        if (!selectedFolderSlug || !selectedFileSlug) {
            toast({title: "Open a Python file first", description: "The line profiler runs the current script."});
            return;
        }
        void (async () => {
            try {
                const res = await fetch("/api/line-profile", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: selectedFolderSlug,
                        file: selectedFileSlug,
                        code: codeViewerRef.current?.getBuffer(),
                        mode: settings.profilerMode || "both",
                    }),
                });
                const data = await res.json() as {
                    ok?: boolean;
                    error?: string;
                    lines?: Record<string, number>;
                    slowest?: Array<{ line: number; us: number; text: string }>;
                    totalUs?: number;
                    memory?: Array<{ func: string; bytes: number; count: number }>;
                };
                if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                setLineProfileHeat(data.lines ?? undefined);
                const top = (data.slowest ?? []).slice(0, 3);
                toast({
                    title: "Line profile ready",
                    description: top.length > 0
                        ? `Slowest: ${top.map((t) => `L${t.line} (${(t.us / 1000).toFixed(2)} ms)`).join(" · ")} — the heat gutter marks them in the editor.`
                        : "No per-line timings were recorded.",
                });
                // tracemalloc deltas per function — computed by the API since
                // the beginning but never surfaced: now the top functions by
                // retained bytes ride their own toast so "memory" mode has a
                // real UI.
                const mem = (data.memory ?? []).filter((m) => m.bytes > 0).slice(0, 4);
                if (mem.length > 0) {
                    const fmtBytes = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;
                    toast({
                        title: "Memory deltas (tracemalloc)",
                        description: `${mem.map((m) => `${m.func} +${fmtBytes(m.bytes)}`).join(" · ")} — grouped per function.`,
                    });
                }
            } catch (err) {
                toast({title: "Line profile failed", description: (err as Error).message, variant: "destructive"});
            }
        })();
    });

    // Workbenches + platform panels.
    const menuOpenDuckdbWorkbench = useStableEvent(() => {
        const kind = selectedFile?.kind;
        const name = selectedFile?.name ?? "";
        if (kind && ["python"].includes(kind)) return; // .py never reaches here
        if (/\.(parquet|csv|feather)$/i.test(name) && selectedFolderSlug && selectedFileSlug) {
            setDuckdbTarget({fileSlug: selectedFileSlug, fileName: name});
        } else {
            setDuckdbTarget(null); // the workbench explains + lets you pick nothing
        }
        setDuckdbTargetOpen(true);
    });
    const menuOpenHexEditor = useStableEvent(() => setHexEditorOpen(true));
    /* Tools ▸ API Client — Round 3 rewrite, Phase 2 extraction. The old
   * command silently POSTed a `requests.http` file into the active
   * folder (an unrequested disk write). The lifecycle hook now opens
   * an UNTITLED, in-memory draft tab (Untitled-1.http, Untitled-2.http,
   * and so on) backed by the workbench — nothing touches the disk until
   * an explicit Save As. The availability gating is coherent:
   *   • a .http/.rest file (or draft) already active → the client IS
   *     the active surface — the command just says so (idempotent);
   *   • anything else active → the command is how you ENABLE the tool —
   *     it creates the draft tab, which immediately activates the
   *     client. No folder is required anymore. */
    const menuOpenApiClient = useStableEvent(() => openApiClientDraft());
    /* Round 3 / Phase 2 — confirm the Save As picker: the lifecycle hook
   * writes the draft to the chosen folder under the chosen name, then
   * SWAPS the untitled tab for a real file tab (same position, becomes
   * active, selection points at the new file) and drops the in-memory
   * draft. The rules (name normalization, tab swap, dedupe) are pure
   * and unit-tested in lib/tab-lifecycle.ts. */
    const handleConfirmUntitledSave = React.useCallback(async () => {
        // Thin adapter — all decisions live in the hook.
        await confirmUntitledSave();
    }, [confirmUntitledSave]);
    const menuOpenExtensions = useStableEvent(() => setExtensionsOpen(true));
    const menuOpenTaskRunner = useStableEvent(() => {
        setBottomPanelOpen(true);
        setBottomTab("tasks");
    });
    const menuOpenFromUrl = useStableEvent(() => setOpenFromUrlOpen(true));

    // File ▸ Open from GitHub URL — after the import lands, refresh the
    // folder listing and select the new folder.
    const handleGithubImported = useStableEvent((folderSlug: string, _fileCount?: number) => {
        void refreshFolders();
        toast({
            title: "GitHub import complete",
            description: `Imported into "${folderSlug}" — refresh the tree if it does not show yet.`
        });
    });

    // File ▸ Publish Snapshot — the ACTIVE folder's files encoded into
    // a shareable URL hash (capped; a toast explains on overflow).
    const menuPublishSnapshotRef = React.useRef<(() => void) | null>(null);
    const menuPublishSnapshot = useStableEvent(() => {
        void (async () => {
            const folder = foldersRef.current.find((c) => c.slug === selectedFolderSlug);
            if (!folder || folder.files.length === 0) {
                toast({
                    title: "Nothing to publish yet",
                    description: "Open a folder with files first — the snapshot encodes the active folder."
                });
                return;
            }
            const files: SnapshotFile[] = [];
            let failed: string | null = null;
            const cap = Math.min(folder.files.length, 120);
            for (let i = 0; i < cap && !failed; i++) {
                const f = folder.files[i];
                if (f.kind === "image" || f.kind === "video" || f.kind === "audio" || f.kind === "pdf" || f.kind === "spreadsheet" || f.kind === "sqlite") continue;
                try {
                    const res = await fetch(`/api/code?folder=${encodeURIComponent(folder.slug)}&file=${encodeURIComponent(f.slug)}`);
                    const data = await res.json() as { content?: string };
                    if (res.ok && typeof data.content === "string") files.push({path: f.name, content: data.content});
                } catch { /* skip unreadable file */
                }
            }
            const out = snapshotUrl(files, folder.name);
            if (typeof out === "object") {
                toast({title: "Snapshot too large to share", description: out.error, variant: "destructive"});
                return;
            }
            try {
                await navigator.clipboard.writeText(out);
                toast({
                    title: "Snapshot link copied",
                    description: `${files.length} file${files.length === 1 ? "" : "s"} — anyone opening the link gets this workspace preloaded.`
                });
            } catch {
                toast({
                    title: "Snapshot link ready",
                    description: "Clipboard blocked — the URL was printed to the console."
                });
                console.info(out);
            }
        })();
    });

    // Git ▸ Review Changes with AI — concatenates the working diff of
    // every modified file (bounded) into the review dialog.
    menuPublishSnapshotRef.current = menuPublishSnapshot;

    const menuOpenAiReview = useStableEvent(() => {
        void (async () => {
            try {
                const res = await fetch("/api/git-status");
                const status = await res.json() as {
                    isRepo?: boolean;
                    files?: Array<{ path: string; status: string }>
                };
                const changed = (status.files ?? []).slice(0, 12);
                if (!status.isRepo || changed.length === 0) {
                    toast({
                        title: "No changes to review",
                        description: "The working tree is clean — make an edit first."
                    });
                    return;
                }
                const parts: string[] = [];
                for (const f of changed) {
                    try {
                        const r = await fetch(`/api/git-diff-content?path=${encodeURIComponent(f.path)}&untracked=1`);
                        const d = await r.json() as { diff?: string };
                        if (d.diff && d.diff.trim()) parts.push(d.diff);
                    } catch { /* skip */
                    }
                }
                const diff = parts.join("\n");
                if (!diff.trim()) {
                    toast({
                        title: "No textual changes",
                        description: "Only binary or unstaged-unreadable files changed."
                    });
                    return;
                }
                setAiReviewDiff(diff);
                setAiReviewOpen(true);
            } catch (err) {
                toast({
                    title: "Could not collect the diff",
                    description: (err as Error).message,
                    variant: "destructive"
                });
            }
        })();
    });

    // Applying an AI review fix — the dialog anchors the hunk and hands
    // the whole spliced file content as the third argument:
    //  · anchored fix on the open file → replaceBuffer swaps the editor
    //    buffer in place (the deep-undo-preserving route the chat
    //    sidebar's "Apply to file" uses);
    //  · anchored fix on another file → guarded switch, then the same
    //    buffer swap once the viewer settled (same delayed-afterSwitch
    //    pattern the citation/goto-line jumps use);
    //  · legacy/drift payload (fullContent null / unresolved file) → the
    //    original append-at-EOF insert-snippet behavior + a warning
    //    toast (the dialog shows its inline "appended instead" note too).
    const handleAiReviewApply = useStableEvent(
        (hunkIndex: number, fixedCode: string, fix?: AiReviewFixPayload) => {
            setAiReviewApplying(true);
            try {
                if (fix && fix.fullContent != null && fix.folderSlug && fix.fileSlug) {
                    // const so the narrowed string survives the setTimeout closure.
                    const fullContent: string = fix.fullContent;
                    const sameFile =
                        selectedFileKeyRef.current === `${fix.folderSlug}/${fix.fileSlug}`;
                    if (sameFile) {
                        codeViewerRef.current?.replaceBuffer(fullContent);
                    } else {
                        guardedSelectFile(fix.folderSlug, fix.fileSlug, {
                            afterSwitch: () =>
                                setTimeout(() => codeViewerRef.current?.replaceBuffer(fullContent), 250),
                        });
                    }
                    toast({
                        title: `Fix for hunk #${hunkIndex + 1} applied in place`,
                        description: `${fix.fileName ?? "The file"} now holds the fixed hunk — review the buffer and save when it looks right (⌘Z undoes).`,
                    });
                    return;
                }
                setInsertSnippet({content: fixedCode, nonce: Date.now()});
                toast({
                    title: `Fix for hunk #${hunkIndex + 1} appended`,
                    description: "The hunk could not be anchored (the file changed since the review) — the fixed code was appended at the end instead.",
                });
            } finally {
                setAiReviewApplying(false);
            }
        }
    );

    // Git ▸ Resolve in Merge Editor — opens the three-way resolver for
    // the CURRENT file when it carries conflict markers.
    const menuOpenMergeEditor = useStableEvent(() => {
        const buf = codeViewerRef.current?.getBuffer() ?? code?.content ?? "";
        const name = selectedFile?.name ?? "";
        if (!buf || !name) {
            toast({
                title: "Open a file first",
                description: "The merge editor resolves the active file's conflict markers."
            });
            return;
        }
        if (!buf.includes("<<<<<<<")) {
            toast({
                title: "No conflict markers found",
                description: `"${name}" is clean — the merge editor opens automatically on conflicted files.`
            });
            return;
        }
        setMergeTarget({fileName: name, content: buf});
    });

    // Merge resolved — write the resolved content back through the
    // editor buffer + save pipeline.
    const handleMergeResolved = useStableEvent((resolved: string) => {
        setMergeTarget(null);
        setInsertSnippet({content: resolved, nonce: Date.now()});
        toast({
            title: "Merge applied",
            description: "The resolved content lands in the editor buffer — save it to mark the file resolved."
        });
    });

    // ── Live Collaboration ──
    const menuCollabShareWorkspace = useStableEvent(() => {
        const room = makeRoomCode();
        setCollabRoom(room);
        void (async () => {
            const url = roomUrl(room);
            try {
                await navigator.clipboard.writeText(url);
                toast({
                    title: "Live session started",
                    description: "The invite link is on your clipboard — send it to a collaborator on this machine/network."
                });
            } catch {
                toast({
                    title: "Live session started",
                    description: `Room ${room} — copy the invite link from the Collaborate menu.`
                });
            }
        })();
    });
    const menuCollabCopyInvite = useStableEvent(() => {
        if (!collabRoom) return;
        void (async () => {
            const url = roomUrl(collabRoom);
            try {
                await navigator.clipboard.writeText(url);
                toast({title: "Invite link copied"});
            } catch {
                toast({title: "Could not copy", description: url});
            }
        })();
    });
    const menuCollabEndSession = useStableEvent(() => {
        setCollabRoom(null);
        setCollabPeers([]);
        toast({title: "Session ended"});
    });

    // Deep link ?collab=<room> — join on load.
    React.useEffect(() => {
        const code = collabCodeFromUrl();
        if (code) setCollabRoom(code);
    }, []);

    // ── Peer presence + incoming peer buffers ──
    React.useEffect(() => {
        if (!collabRoom) return;
        const onPeerBuffer = (e: Event) => {
            const d = (e as CustomEvent).detail as { file: string; content: string } | undefined;
            if (!d) return;
            // Apply remote edits only for the OPEN file while the local
            // buffer is clean (a dirty local edit always wins — no silent
            // overwrite of the user's typing).
            const name = selectedFile?.name;
            if (!name || d.file !== name) return;
            if (viewerDirtyRef.current) return;
            setCode((prev) => (prev ? {...prev, content: d.content} : prev));
        };
        window.addEventListener("praxis:collab-peer-buffer", onPeerBuffer);
        return () => window.removeEventListener("praxis:collab-peer-buffer", onPeerBuffer);
    }, [collabRoom, selectedFile?.name]);

    // Broadcast the local cursor + selection while a session is live
    // (reads the footer store's live caret; 700 ms cadence — presence,
    // not a per-keystroke stream).
    React.useEffect(() => {
        if (!collabRoom || !selectedFile?.name) return;
        const t = window.setInterval(() => {
            const cur = footerStore.getCursor();
            window.dispatchEvent(
                new CustomEvent("praxis:collab-cursor", {
                    detail: {file: selectedFile.name, line: cur?.line ?? 1, col: cur?.col ?? 1},
                })
            );
        }, 700);
        return () => window.clearInterval(t);
    }, [collabRoom, selectedFile?.name]);

    // Broadcast the buffer to the room whenever a file is SAVED (the
    // saved content is the authoritative copy to share).
    React.useEffect(() => {
        const onSaved = () => {
            if (collabRoom && selectedFile?.name && codeViewerRef.current) {
                window.dispatchEvent(
                    new CustomEvent("praxis:collab-buffer", {
                        detail: {file: selectedFile.name, content: codeViewerRef.current.getBuffer()},
                    })
                );
            }
        };
        window.addEventListener("praxis:file-saved", onSaved);
        return () => window.removeEventListener("praxis:file-saved", onSaved);
    }, [collabRoom, selectedFile?.name]);

    // ── Snapshot-link boot — restore a #praxis= workspace on load ──
    React.useEffect(() => {
        const snap = decodeSnapshotHash();
        if (!snap || snap.files.length === 0) return;
        void (async () => {
            setImporting(true);
            try {
                // Create a fresh folder for the snapshot files, then open its
                // first file — the snapshot boots the IDE preloaded.
                const folderName = `${snap.name || "snapshot"}-restored`.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "snapshot";
                const res = await fetch("/api/folder-create", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({folderName}),
                });
                const data = await res.json() as { ok?: boolean; folder?: string; error?: string };
                if (!res.ok || !data.ok || !data.folder) throw new Error(data.error ?? `HTTP ${res.status}`);
                const folderSlug = data.folder;
                for (const f of snap.files.slice(0, 120)) {
                    try {
                        await fetch("/api/file-create", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({folder: folderSlug, fileName: f.path, content: f.content}),
                        });
                    } catch { /* skip unwritable entry */
                    }
                }
                clearSnapshotHash();
                void refreshFolders();
                toast({
                    title: "Snapshot restored",
                    description: `${snap.files.length} file(s) loaded into "${folderName}".`
                });
            } catch (err) {
                toast({title: "Snapshot restore failed", description: (err as Error).message, variant: "destructive"});
            } finally {
                setImporting(false);
            }
        })();
        // Run once on boot.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Extensions — boot the enabled built-ins and provide the document.
    //    (Status-bar items need no page-level mirror: the footer's
    //    ExtensionStatusChip reads the extensions store directly via
    //    useSyncExternalStore, so no page re-render rides extension
    //    events.) ──
    React.useEffect(() => {
        void startEnabled().then(() => {
            setDocumentProvider({
                getDocument: () => codeViewerRef.current?.getBuffer() ?? code?.content ?? "",
                getSelection: () => window.getSelection()?.toString() ?? "",
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ── Editor-driven dialog opens (context menu / hotkeys) ──
    React.useEffect(() => {
        // The context-menu dispatches carry detail.transform for the
        // per-transform entries (Organize Imports / Inline Variable / Move
        // Symbol / Change Signature / Loop ⇄ Comprehension) — honored now
        // instead of dropped: the palette opens straight on that form.
        const onPalette = (e: Event) => {
            const d = (e as CustomEvent).detail as { transform?: string } | undefined;
            setRefactorPaletteTransform(typeof d?.transform === "string" ? d.transform : null);
            setRefactorPaletteOpen(true);
        };
        const onDocstring = () => setDocstringStudioOpen(true);
        window.addEventListener("praxis:open-refactor-palette", onPalette);
        window.addEventListener("praxis:open-docstring-studio", onDocstring);
        return () => {
            window.removeEventListener("praxis:open-refactor-palette", onPalette);
            window.removeEventListener("praxis:open-docstring-studio", onDocstring);
        };
    }, []);
    // ── Inspect tools from the editor's right-click menu (Python) ──
    // AST Explorer… / Show Bytecode… / Generate Property Tests… — the
    // same dialogs the Tools menu opens, now reachable without leaving
    // the code.
    React.useEffect(() => {
        const onAst = () => setAstExplorerOpen(true);
        const onBytecode = () => setBytecodeOpen(true);
        const onHypothesis = () => {
            setBottomPanelOpen(true);
            setBottomTab("tests");
            // The TestsPanel listens for this and expands (and scrolls to)
            // its Property tests section.
            window.dispatchEvent(new Event("praxis:open-hypothesis"));
        };
        window.addEventListener("praxis:open-ast-explorer", onAst);
        window.addEventListener("praxis:open-bytecode", onBytecode);
        window.addEventListener("praxis:open-hypothesis", onHypothesis);
        return () => {
            window.removeEventListener("praxis:open-ast-explorer", onAst);
            window.removeEventListener("praxis:open-bytecode", onBytecode);
            window.removeEventListener("praxis:open-hypothesis", onHypothesis);
        };
    }, []);
    // ── Type-inlays relay: the Diagnostics panel's typecheck tool
    //    emits the mypy inlays; they flow into the CodeViewer prop. ──
    React.useEffect(() => {
        const onInlays = (e: Event) => {
            const d = (e as CustomEvent).detail as {
                inlays?: Array<{ line: number; col: number; endCol?: number; label: string; kind: "type" | "return" }>
            } | undefined;
            setTypeInlays(d?.inlays && d.inlays.length > 0 ? d.inlays : undefined);
        };
        const onTypeSymbols = (e: Event) => {
            const d = (e as CustomEvent).detail as {
                symbolTypes?: Array<{ line: number; name: string; type: string }>
            } | undefined;
            setTypeSymbols(d?.symbolTypes && d.symbolTypes.length > 0 ? d.symbolTypes : undefined);
        };
        window.addEventListener("praxis:type-inlays", onInlays);
        window.addEventListener("praxis:type-symbols", onTypeSymbols);
        return () => {
            window.removeEventListener("praxis:type-inlays", onInlays);
            window.removeEventListener("praxis:type-symbols", onTypeSymbols);
        };
    }, []);

    // ── Welcome-page cards — the same handlers as the File menu items.
    React.useEffect(() => {
        const onFromUrl = () => setOpenFromUrlOpen(true);
        const onPublish = () => menuPublishSnapshotRef.current?.();
        window.addEventListener("praxis:open-from-url", onFromUrl);
        window.addEventListener("praxis:publish-snapshot", onPublish);
        return () => {
            window.removeEventListener("praxis:open-from-url", onFromUrl);
            window.removeEventListener("praxis:publish-snapshot", onPublish);
        };
    }, []);

    // ── Merge editor — the Explorer's right-click "Resolve in Merge
    //    Editor…" fetches the file fresh and opens the three-way
    //    resolver for it.
    React.useEffect(() => {
        const onOpenMerge = (e: Event) => {
            const d = (e as CustomEvent).detail as { folder?: string; file?: string; fileName?: string } | undefined;
            if (!d?.folder || !d.file) return;
            void (async () => {
                try {
                    const res = await fetch(`/api/code?folder=${encodeURIComponent(d.folder!)}&file=${encodeURIComponent(d.file!)}`);
                    const data = await res.json() as { content?: string; file?: string; error?: string };
                    if (!res.ok || typeof data.content !== "string") throw new Error(data.error ?? `HTTP ${res.status}`);
                    if (!data.content.includes("<<<<<<<")) {
                        toast({
                            title: "No conflict markers found",
                            description: `"${d.fileName ?? data.file}" is clean.`
                        });
                        return;
                    }
                    setMergeTarget({fileName: d.fileName ?? data.file ?? "", content: data.content});
                } catch (err) {
                    toast({
                        title: "Could not read the file",
                        description: (err as Error).message,
                        variant: "destructive"
                    });
                }
            })();
        };
        window.addEventListener("praxis:open-merge-editor", onOpenMerge);
        return () => window.removeEventListener("praxis:open-merge-editor", onOpenMerge);
    }, []);

    // ── DuckDB auto-offer — the .parquet/.feather banner in the
    //    FileViewer dispatches praxis:open-duckdb with the file target.
    React.useEffect(() => {
        const onOpenDuckdb = (e: Event) => {
            const d = (e as CustomEvent).detail as { fileSlug?: string; fileName?: string } | undefined;
            if (d?.fileSlug && d.fileName) setDuckdbTarget({fileSlug: d.fileSlug, fileName: d.fileName});
            setDuckdbTargetOpen(true);
        };
        window.addEventListener("praxis:open-duckdb", onOpenDuckdb);
        return () => window.removeEventListener("praxis:open-duckdb", onOpenDuckdb);
    }, []);

    // Extension insertText — rides the same insert-signal the snippet
    // palette uses (appends at the caret in the editor buffer).
    React.useEffect(() => {
        const onInsert = (e: Event) => {
            const d = (e as CustomEvent).detail as { text?: string } | undefined;
            if (d && typeof d.text === "string") setInsertSnippet({content: d.text, nonce: Date.now()});
        };
        window.addEventListener("praxis:extension-insert-text", onInsert);
        return () => window.removeEventListener("praxis:extension-insert-text", onInsert);
    }, []);
    // Run ▸ Notify on finish — cycles the browser-
    // notification mode and requests Notification permission while
    // turning it ON (a menu click is a valid user gesture).
    const menuCycleRunNotify = useStableEvent(() => {
        const order: Array<Settings["runNotifyMode"]> = ["off", "hidden", "always"];
        const next = order[(order.indexOf(loadSettings().runNotifyMode) + 1) % order.length] ?? "off";
        setSettings((prev) => {
            const s = {...prev, runNotifyMode: next};
            saveSettings(s);
            return s;
        });
        if (next !== "off") void requestRunNotifyPermission();
    });
    const menuOpenRunQueue = useStableEvent(() => setRunQueueOpen(true));
    const menuOpenScheduler = useStableEvent(() => setSchedulerOpen(true));
    const menuOpenShortcutTrainer = useStableEvent(() => setTrainerOpen(true));
    const menuOpenAiChat = useStableEvent(() => setAiChatOpen((v) => !v));
    // AI submenu — the explain/improve question strings embed the CURRENT
    // code content; handlers re-read it at click time so the memo'd
    // element never ships a stale script to the AI.
    const menuAiExplain = useStableEvent(() => {
        if (!selectedFileSlug || !code?.content) return;
        void sendAiPrompt(
            `Explain what this Python script does, step by step:\n\n\`\`\`python\n${code.content.slice(0, 6000)}\n\`\`\``
        );
    });
    const menuAiImprove = useStableEvent(() => {
        if (!selectedFileSlug || !code?.content) return;
        void sendAiPrompt(
            `Improve this Python script for readability, performance, and correctness. Show the improved version and explain each change:\n\n\`\`\`python\n${code.content.slice(0, 6000)}\n\`\`\``
        );
    });
    const menuAiGenerateTests = useStableEvent(() => {
        if (!selectedFileSlug) return;
        void handleGenerateTests();
    });
    // AI ▸ Agent Mode… — opens the multi-file AI edit planner (the dialog
    // guards the no-folder case itself; the menu item is additionally
    // disabled while no folder is active).
    const menuOpenAgentMode = useStableEvent(() => setAgentModeOpen(true));
    const menuOpenSnippets = useStableEvent(() => setSnippetOpen(true));
    const menuOpenHistory = useStableEvent(() => setHistoryOpen(true));
    const menuOpenDependencyManager = useStableEvent(() => setDepManagerOpen(true));
    const menuOpenProjectDictionary = useStableEvent(() => setProjectDictOpen(true));
    /* The spell popover's own "Project dictionary…" item opens the SAME
   * manager from any wavy-underlined word (lib/spell-marks dispatches
   * the event — the dictionary is otherwise reachable under Tools ▸
   * Project dictionary…). */
    React.useEffect(() => {
        const onOpenDict = () => setProjectDictOpen(true);
        window.addEventListener("praxis:open-project-dictionary", onOpenDict);
        return () => window.removeEventListener("praxis:open-project-dictionary", onOpenDict);
    }, []);
    const menuOpenCommit = useStableEvent(() => setCommitDialogOpen(true));
    const menuOpenGitLog = useStableEvent(() => setGitLogOpen(true));
    const menuOpenCompareFiles = useStableEvent(() => setCompareFilesOpen(true));
    // Accessibility submenu toggles — all functional state updaters, but
    // routed through stable events for uniform identity. (Written as 12
    // direct hook calls rather than a shared factory so the hook order
    // stays obvious and eslint-plugin-react-hooks stays quiet.)
    const menuToggleHighContrast = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, highContrastMode: !prev.highContrastMode};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleLargeText = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, largeTextMode: !prev.largeTextMode};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleDyslexiaFriendly = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, dyslexiaFriendlyMode: !prev.dyslexiaFriendlyMode};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleColorBlind = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, colorBlindMode: !prev.colorBlindMode};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleScreenReader = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, screenReaderMode: !prev.screenReaderMode};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleReduceMotion = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, reduceMotion: !prev.reduceMotion};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleEnhancedFocus = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, enhancedFocusIndicators: !prev.enhancedFocusIndicators};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleWrapTab = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, wrapTabNavigation: !prev.wrapTabNavigation};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleAlwaysShowShortcuts = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, alwaysShowShortcutHints: !prev.alwaysShowShortcutHints};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleStickyCursor = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, stickyCursorIndicator: !prev.stickyCursorIndicator};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleShowWhitespace = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, showWhitespace: !prev.showWhitespace};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleHighlightCurrentLine = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, highlightCurrentLine: !prev.highlightCurrentLine};
            saveSettings(next);
            return next;
        });
    });
    const menuIncreaseFontSizeA11y = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, codeFontSize: Math.min(20, prev.codeFontSize + 1)};
            saveSettings(next);
            return next;
        });
    });
    const menuDecreaseFontSizeA11y = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, codeFontSize: Math.max(10, prev.codeFontSize - 1)};
            saveSettings(next);
            return next;
        });
    });
    const menuShowShortcuts = useStableEvent(() => setShortcutsDialogOpen(true));
    // PWA install offer — surfaced as Help ▸ Install As App… (only while the
    // browser's install prompt is actually pending). The desktop launcher
    // (bun run desktop) is the browser-independent alternative.
    const {canInstall: pwaCanInstall, promptInstall: pwaPromptInstall} = usePwaInstall();
    const menuInstallApp = useStableEvent(async () => {
        const accepted = await pwaPromptInstall();
        toast({
            title: accepted ? "Installing Praxis" : "Install skipped",
            description: accepted
                ? "The standalone app window opens when the browser finishes installing."
                : "You dismissed the install prompt — you can try again any time from Help.",
        });
    });
    const menuOpenTutorial = useStableEvent(() => {
        // Re-show the tutorial in-place. Also reset sidebarVisible and
        // bottomPanelOpen so the spotlight targets exist.
        setSidebarVisible(true);
        setBottomPanelOpen(true);
        window.dispatchEvent(new CustomEvent("praxis:show-tutorial"));
    });
    const menuToggleAiChat = useStableEvent(() => setAiChatOpen((v) => !v));
    const menuGoToLine = useStableEvent(() => setGotoLineOpen(true));
    const menuRecentFiles = useStableEvent(() => setRecentFilesOpen(true));
    const menuNavBack = useStableEvent(handleNavBack);
    const menuNavForward = useStableEvent(handleNavForward);
    const menuToggleCodeWordWrap = useStableEvent(() =>
        setSettings((prev) => ({...prev, codeWordWrap: !prev.codeWordWrap}))
    );
    const menuToggleMinimap = useStableEvent(() =>
        setSettings((prev) => ({...prev, showMinimap: !prev.showMinimap}))
    );
    const menuToggleLineNumbers = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, showLineNumbers: !prev.showLineNumbers};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleIndentGuides = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, indentGuides: !prev.indentGuides};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleStickyScroll = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, stickyScroll: !prev.stickyScroll};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleSpellCheck = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, spellCheck: !prev.spellCheck};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleCodeFolding = useStableEvent(() => {
        setSettings((prev) => {
            const next = {...prev, codeFolding: !prev.codeFolding};
            saveSettings(next);
            return next;
        });
    });
    const menuToggleBottomTabsPosition = useStableEvent(() => {
        setSettings((prev) => {
            const next: Settings = {...prev, bottomTabsPosition: prev.bottomTabsPosition === "top" ? "left" : "top"};
            saveSettings(next);
            return next;
        });
    });
    const menuEditorAction = useStableEvent(handleEditorUtilityAction);
    const menuRunAllTests = useStableEvent(handleRunAllTests);
    const menuExportMd = useStableEvent(handleExportMd);
    const menuExportIpynb = useStableEvent(handleExportIpynb);
    const menuExportHtml = useStableEvent(handleExportHtml);
    const menuExportTxt = useStableEvent(handleExportTxt);
    const menuExportJson = useStableEvent(handleExportJson);
    const menuExportPdf = useStableEvent(handleExportPdf);
    const menuExportSessionReport = useStableEvent(handleExportSessionReport);
    const menuExportLatex = useStableEvent(handleExportLatex);
    const menuExportRst = useStableEvent(handleExportRst);
    const menuCopyAsMarkdown = useStableEvent(handleCopyAsMarkdown);
    const menuExportGithubRepo = useStableEvent(handleExportGithubRepo);
    const menuCompressFile = useStableEvent(handleCompressCurrentFile);
    const menuCompressFolder = useStableEvent(handleCompressCurrentFolder);
    const menuOpenBranchPicker = useStableEvent(() =>
        window.dispatchEvent(new Event("praxis:git-branches-open"))
    );
    const menuOpenGitDiff = useStableEvent(() => {
        setBottomTab("gitdiff");
        setBottomPanelOpen(true);
    });
    const menuGoToFile = useStableEvent(() => setSearchOpen(true));
    const menuOpenBookmarks = useStableEvent(() => setBookmarksOpen(true));

    // ─── Handlers: toolbox / workbench / data dialogs ─────────
    const openDevToolbox = React.useCallback((tab?: string) => {
        setToolboxTab(tab);
        setToolboxOpen(true);
    }, []);

    // open the toolbox ON A SPECIFIC FILE — the viewer's
    // "Tools ▸" menus (image / video / audio / PDF view UIs) dispatch
    // praxis:open-toolbox { toolId, url, fileName, fileSlug,
    // folderSlug }; the requested tool opens with the file preloaded.
    React.useEffect(() => {
        const onOpenToolbox = (e: Event) => {
            const detail = (e as CustomEvent<ToolPreload & { toolId?: string }>).detail;
            if (!detail?.toolId) return;
            setToolboxTab(detail.toolId);
            setToolboxPreload({
                url: detail.url,
                fileName: detail.fileName,
                fileSlug: detail.fileSlug,
                folderSlug: detail.folderSlug,
            });
            setToolboxOpen(true);
        };
        window.addEventListener("praxis:open-toolbox", onOpenToolbox);
        return () => window.removeEventListener("praxis:open-toolbox", onOpenToolbox);
    }, []);

    /** Open the SQL workbench on a specific .db file (the FileViewer
     *  button + the explorer context menu both call this). */
    const openWorkbenchFor = React.useCallback(
        (folderSlug: string, fileSlug: string, fileName: string) => {
            setWorkbench({open: true, folderSlug, fileSlug, fileName});
        },
        []
    );

    /* PERF: stable wrapper for the FileViewer's onOpenWorkbench prop —
   *  the old inline arrow re-rendered the memoized viewer on every
   *  page state change. (Declared AFTER openWorkbenchFor — a TDZ
   *  error if it closes over it earlier in the file.) */
    const handleOpenWorkbenchForCurrent = React.useCallback(() => {
        const name = selectedFile?.name;
        if (name && selectedFileSlug) openWorkbenchFor(selectedFolderSlug, selectedFileSlug, name);
    }, [selectedFolderSlug, selectedFileSlug, selectedFile?.name, openWorkbenchFor]);

    /** Data ▸ SQL workbench — target the open .db file, else the first
     *  one in the project (with a toast when there is none). */
    const openWorkbenchPicker = React.useCallback(() => {
        const currentDb =
            selectedFile && /\.(db|sqlite3?|db3)$/i.test(selectedFile.name)
                ? {folderSlug: selectedFolderSlug, fileSlug: selectedFileSlug, fileName: selectedFile.name}
                : null;
        if (currentDb && currentDb.fileSlug) {
            openWorkbenchFor(currentDb.folderSlug, currentDb.fileSlug, currentDb.fileName);
            return;
        }
        for (const folder of folders) {
            const dbFile = folder.files.find((f) => /\.(db|sqlite3?|db3)$/i.test(f.name));
            if (dbFile) {
                openWorkbenchFor(folder.slug, dbFile.slug, dbFile.name);
                return;
            }
        }
        toast({title: "No SQLite database in the project", description: "Add a .db file to the project first."});
    }, [selectedFile, selectedFolderSlug, selectedFileSlug, folders, openWorkbenchFor, toast]);

    /** True when the CURRENT file is a CSV/TSV (chart + pipeline work on
     *  text tables; xlsx is edited through the grid). */
    const dataFileOpen =
        !!selectedFile &&
        (selectedFile.kind === "csv" ||
            selectedFile.kind === "spreadsheet" ||
            // databases count as data files for the Data menu.
            selectedFile.kind === "sqlite");

    const openChartForCurrent = React.useCallback(() => {
        if (!selectedFile || selectedFile.kind !== "csv" || !selectedFolderSlug || !selectedFileSlug) {
            toast({title: "Chart preview needs a CSV or TSV file open", variant: "destructive"});
            return;
        }
        setChartOpen(true);
    }, [selectedFile, selectedFolderSlug, selectedFileSlug, toast]);

    const openPipelineForCurrent = React.useCallback(() => {
        if (!selectedFile || selectedFile.kind !== "csv" || !selectedFolderSlug || !selectedFileSlug) {
            toast({title: "The transform pipeline needs a CSV or TSV file open", variant: "destructive"});
            return;
        }
        setPipelineOpen(true);
    }, [selectedFile, selectedFolderSlug, selectedFileSlug, toast]);

    /** Every OTHER csv/tsv in the same folder (the pipeline's join step). */
    const siblingCsvs = React.useMemo(() => {
        if (!selectedFolder) return [];
        return selectedFolder.files
            .filter((f) => f.kind === "csv" && f.slug !== selectedFileSlug)
            .map((f) => ({fileSlug: f.slug, fileName: f.name}));
    }, [selectedFolder, selectedFileSlug]);

    /** the other IMAGE files in the current folder, with
     *  ready /api/file URLs — feeds the image toolbox's compare. */
    const siblingImages = React.useMemo(() => {
        if (!selectedFolder || !selectedFolderSlug || selectedFile?.kind !== "image") return [];
        return selectedFolder.files
            .filter((f) => f.kind === "image" && f.slug !== selectedFileSlug)
            .map((f) => ({
                fileSlug: f.slug,
                fileName: f.name,
                src: fileUrlFor(selectedFolderSlug, f.slug),
            }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolder, selectedFolderSlug, selectedFileSlug, selectedFile?.kind]);

    /** Data ▸ Profile this file — flips the stats-band setting ON (and
     *  persists + broadcasts it so open tables restyle immediately). */
    const profileCurrentFile = React.useCallback(() => {
        const next = {...settings, dataTableStatsBand: true};
        setSettings(next);
        saveSettings(next);
        window.dispatchEvent(new Event("praxis:settings-saved"));
        toast({
            title: "Column statistics enabled",
            description: "Open (or re-open) a table — min/max/mean, unique and missing counts appear above it; the missing badge filters rows.",
            variant: "success",
        });
    }, [settings, toast]);

    // ─── layout presets ─────────────────────────────────
    const applyLayoutPreset = React.useCallback(
        (id: string) => {
            const preset = LAYOUT_PRESETS.find((p) => p.id === id);
            if (!preset) return;
            const target: LayoutPresetTarget = {
                sidebarVisible,
                bottomPanelOpen,
                bottomTab: bottomTab as string,
                splitPaneOpen,
                splitOrientation,
                aiChatOpen,
                distractionFree,
            };
            const next = preset.apply(target);
            setSidebarVisible(next.sidebarVisible);
            setBottomPanelOpen(next.bottomPanelOpen);
            setBottomTab(next.bottomTab as typeof bottomTab);
            // Presets force the split group's visibility + orientation but
            // never touch its panes — exactly the engine's applySplitPreset.
            setSplitLayout((prev) =>
                applySplitPreset(prev, {open: next.splitPaneOpen, orientation: next.splitOrientation})
            );
            setAiChatOpen(next.aiChatOpen);
            if (next.distractionFree !== distractionFree) setDistractionFree(next.distractionFree);
            setLayoutPresetId(id);
            saveLastPreset(id as typeof preset.id);
        },
        [sidebarVisible, bottomPanelOpen, bottomTab, splitPaneOpen, splitOrientation, aiChatOpen, distractionFree]
    );

    const cycleLayoutPreset = React.useCallback(() => {
        const preset = nextPreset((layoutPresetId as LayoutPresetId | null) ?? null);
        applyLayoutPreset(preset.id);
    }, [layoutPresetId, applyLayoutPreset]);

    const resetLayout = React.useCallback(() => {
        setSidebarVisible(true);
        // the new default is a COLLAPSED bottom panel — Reset
        // layout restores the app's defaults, not the old open panel.
        setBottomPanelOpen(false);
        setBottomTab("output");
        // Hide the split group without clearing it — the menu Split
        // toggle can still bring the previous panes back.
        setSplitLayout((prev) => setSplitGroupVisible(prev, false));
        setAiChatOpen(false);
        setDistractionFree(false);
        setLayoutPresetId(null);
        try {
            window.localStorage.removeItem("praxis.layout-preset");
        } catch { /* storage */
        }
    }, []);

    // ─── terminal commands → the TerminalPanel ──────────
    const terminalCommand = React.useCallback(
        (cmd: "new-shell" | "new-python" | "clear" | "kill-active" | "kill-all" | "send-selection" | "focus") => {
            setBottomPanelOpen(true);
            setBottomTab("terminal");
            if (cmd === "send-selection") {
                const text = codeViewerRef.current?.getSelectionText?.() ?? "";
                window.dispatchEvent(
                    new CustomEvent("praxis:terminal-command", {detail: {command: cmd, text}})
                );
            } else {
                window.dispatchEvent(new CustomEvent("praxis:terminal-command", {detail: {command: cmd}}));
            }
        },
        []
    );

    // ─── the Bookmarks menu entries ──────────────────────
    const bookmarkEntries = React.useMemo(() => {
        const entries: Array<{
            id: string;
            label: string;
            hint?: string;
            icon: React.ReactNode;
            onJump?: () => void
        }> = [];
        // Favorites (starred files) — key "folderSlug/fileSlug".
        // PROJECT SCOPING
        // contains items not in this project"): favorites and line
        // bookmarks live in the browser's localStorage and SURVIVE
        // project switches — an entry starred/bookmarked in another
        // project used to stay listed (jumping dead slugs). Entries are
        // now filtered to the ones that resolve inside the CURRENT
        // project's folder tree; foreign ones simply don't list.
        for (const key of [...favorites].slice(0, 6)) {
            const slash = key.indexOf("/");
            const folderSlug = slash > 0 ? key.slice(0, slash) : key;
            const fileSlug = slash > 0 ? key.slice(slash + 1) : "";
            if (!fileSlug) continue;
            const folder = folders.find((c) => c.slug === folderSlug);
            const file = folder?.files.find((f) => f.slug === fileSlug);
            if (!folder || !file) continue; // not in this project — don't list
            const folderName = folder.name;
            const fileName = file.name;
            entries.push({
                id: `fav-${key}`,
                label: fileName,
                hint: folderName,
                icon: <Star className="size-3.5 text-amber-400"/>,
                onJump: () => treeSelectFile(folderSlug, fileSlug),
            });
        }
        // Line bookmarks of the project. Same PROJECT filter as the
        // favorites above — a line bookmark set in another project does
        // not list here; the SNIPPET makes the entry recognizable
        // (“def train(…)”, not a bare name:line).
        for (const b of bookmarks.slice(0, 8)) {
            const inProject = folders
                .find((c) => c.slug === b.folderSlug)
                ?.files.some((f) => f.slug === b.fileSlug);
            if (!inProject) continue; // bookmarked in another project — skip
            entries.push({
                id: `bm-${b.id}`,
                label: `${b.fileName || deslugify(b.fileSlug)}:${b.line}`,
                hint: b.snippet ? b.snippet : "line bookmark",
                icon: <Bookmark className="size-3.5 text-emerald-500"/>,
                onJump: () => {
                    treeSelectFile(b.folderSlug, b.fileSlug);
                    setTimeout(() => codeViewerRef.current?.jumpToLine(b.line), 300);
                },
            });
        }
        return entries;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [favorites, bookmarks, folders, treeSelectFile]);

    const addLineBookmark = React.useCallback(() => {
        window.dispatchEvent(new Event("praxis:bookmark-toggle"));
    }, []);

    // ─── the navbar Run button (pinned entry point) ─────
    const navbarRun = React.useCallback(() => {
        const entry = getRunEntryPoint();
        if (entry && entry.folderSlug && entry.fileSlug && entry.folderSlug !== selectedFolderSlug) {
            // Jump to the pinned entry, then run it once the code loads.
            treeSelectFile(entry.folderSlug, entry.fileSlug);
            setPendingRunFn(() => () => {
                setPendingRunFn(null);
                // The selection state has committed; run through the normal path
                // after the file's content effect resolves.
                setTimeout(() => handleRun(), 350);
            });
            return;
        }
        handleRun();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolderSlug, handleRun, treeSelectFile, entryPointNonce]);

    const runBadge = React.useMemo(() => {
        void entryPointNonce;
        const entry = getRunEntryPoint();
        return entry ? entry.fileName : null;
    }, [entryPointNonce]);
    const menuTerminalClear = useStableEvent(() =>
        window.dispatchEvent(new Event("praxis:term-clear"))
    );

    // ─── stable-event handlers for the new menus ──────────────
    const menuOpenSnippetManager = useStableEvent(() => setSnippetManagerOpen(true));
    const menuOpenJumpList = useStableEvent(() => setJumpListOpen(true));

    // ─── Screenshots (Edit ▸ Screenshots + the navbar camera icon) ──
    /** The open file's text, reported up by the FileViewer (a ref, not
     *  state — the Screenshot Studio reads it on capture without any
     *  re-render churn). Python/code files flow through CodeViewer —
     *  the page already holds those in `code`, so the provider below
     *  unions both sources. */
    const viewerContentRef = React.useRef<{ content: string; fileName: string } | null>(null);
    const handleViewerContentKnown = useStableEvent(
        (info: { content: string; fileName: string }) => {
            viewerContentRef.current = info;
        }
    );
    const [screenshotStudioOpen, setScreenshotStudioOpen] = React.useState(false);
    const [screenshotPending, setScreenshotPending] = React.useState<"window" | "code" | "selection" | null>(null);
    const menuScreenshot = useStableEvent((mode: "window" | "code" | "selection") => {
        setScreenshotPending(mode);
        setScreenshotStudioOpen(true);
    });
    const menuScreenshotConsumed = useStableEvent(() => setScreenshotPending(null));
    /** CodeSpec for the studio: the CodeViewer path (python & friends —
     *  `code.content`) wins when live, else the FileViewer's reported
     *  text; language label derives from the open file's kind/extension. */
    const getScreenshotCodeSpec = useStableEvent(() => {
        if (code?.content) {
            return {
                content: code.content,
                fileName: code.file,
                languageLabel: selectedFile?.name?.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase(),
            };
        }
        const known = viewerContentRef.current;
        if (known && known.content) {
            return {
                content: known.content,
                fileName: known.fileName,
                languageLabel: known.fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase(),
            };
        }
        return null;
    });
    const menuToggleSplitPane = useStableEvent(() => {
        // The plain Split toggle — HIDES without clearing, so toggling
        // back restores the same panes (engine: setSplitGroupVisible);
        // showing an empty group renders the empty-split hint.
        setSplitLayout((prev) => setSplitGroupVisible(prev, !prev.open));
    });
    const menuTerminalCommand = useStableEvent(
        (cmd: "new-shell" | "new-python" | "clear" | "kill-active" | "kill-all" | "send-selection" | "focus") =>
            terminalCommand(cmd)
    );
    const menuToggleTypewriter = useStableEvent(() => {
        const next = {...settings, typewriterScroll: !settings.typewriterScroll};
        setSettings(next);
        saveSettings(next);
        window.dispatchEvent(new Event("praxis:settings-saved"));
        toast({
            title: next.typewriterScroll ? "Typewriter scrolling on" : "Typewriter scrolling off",
            description: next.typewriterScroll ? "The caret stays vertically centered while you type." : undefined,
        });
    });

    // The memoized MenuBar element — re-created ONLY when a value prop
    // the menus actually display changes (projects, toggles, enabled
    // flags, settings reflected in the menus). Selection-only changes
    // keep the previous element → React bails out → zero MenuBar cost.
    // Sequencing: like the FolderTree below, the element SWAP is
    // debounced ~120 ms and committed inside a transition — the urgent
    // pass after a click keeps showing the previous MenuBar (its handlers
    // are stable events, so every menu action is still up-to-date), and
    // the ~900 ms menu re-render only starts once the newly-clicked file
    // is already on screen. (A plain useDeferredValue started that render
    // immediately after the urgent commit and queued the editor mount
    // behind it whenever the code fetch resolved inside the window.)
    const menuBarElement = React.useMemo(
        () => (
            <MenuBar
                showBrandLogo
                appName={APP_NAME}
                tagline={APP_TAGLINE}
                onAutoIndent={menuAutoIndent}
                onNewFolder={menuNewFolder}
                onNewFile={menuNewFile}
                onCreateExample={menuCreateExample}
                onUploadZip={menuUploadZip}
                onOpenFromUrl={menuOpenFromUrl}
                onPublishSnapshot={menuPublishSnapshot}
                onSave={menuSave}
                onSaveAll={menuSaveAll}
                onCloseAllEditors={menuCloseAllEditors}
                onDownload={menuDownload}
                onOpenSettings={menuOpenSettings}
                projects={projects}
                activeProject={activeProject}
                onSelectProject={menuSelectProject}
                onBrowseProjectFolder={menuBrowseProjectFolder}
                onCreateProject={menuCreateProject}
                onUndo={menuUndo}
                onRedo={menuRedo}
                onCut={menuCut}
                onCopy={menuCopy}
                onPaste={menuPaste}
                onFind={menuFind}
                onReplace={menuReplace}
                onFindInFiles={menuFindInFiles}
                onFormat={menuFormat}
                // Edit ▸ Organize Imports (Python only — the item itself gates
                // on selectedFileKind; the viewer handle runs ruff --select I
                // --fix over the live buffer).
                onOrganizeImports={menuOrganizeImports}
                onToggleSidebar={menuToggleSidebar}
                sidebarVisible={sidebarVisible}
                onToggleBottomPanel={menuToggleBottomPanel}
                bottomPanelOpen={bottomPanelOpen}
                onIncreaseFontSize={menuIncreaseFontSize}
                onDecreaseFontSize={menuDecreaseFontSize}
                onResetFontSize={menuResetFontSize}
                onRefresh={menuRefresh}
                refreshing={foldersLoading}
                onOpenSearch={menuOpenSearch}
                onOpenCommandPalette={menuOpenCommandPalette}
                onOpenSymbolPalette={menuOpenSymbolPalette}
                onOpenLocalHistory={menuOpenLocalHistory}
                onToggleDistractionFree={menuToggleDistractionFree}
                distractionFree={distractionFree}
                onToggleFullscreen={menuToggleFullscreen}
                onToggleTerminalPanel={menuToggleTerminalPanel}
                terminalPanelOpen={bottomPanelOpen && bottomTab === "terminal"}
                onOpenProjectSymbols={menuOpenProjectSymbols}
                onRun={menuRun}
                onStop={menuStop}
                onRunAll={menuRunAll}
                onRunWithCoverage={menuRunWithCoverage}
                onRunTutorView={menuRunTutorView}
                onRunTimeTravel={menuRunTimeTravel}
                onRunMultiPython={menuRunMultiPython}
                onRunLineProfile={menuRunLineProfile}
                onRunInConsole={menuRunInConsole}
                onDebug={menuDebug}
                runNotifyMode={settings.runNotifyMode}
                onCycleRunNotify={menuCycleRunNotify}
                onOpenRunQueue={menuOpenRunQueue}
                onOpenScheduler={menuOpenScheduler}
                onOpenShortcutTrainer={menuOpenShortcutTrainer}
                // every RUNNABLE kind (python + js / ts / matlab /
                // r / shell / java / c / cpp through the runtime registry).
                canRun={!!selectedFileSlug && (selectedFileKind === "python" || isRunnableKind(selectedFileKind))}
                // Stop targets the SELECTED file's live run (its
                // session may still be waiting for its runId — the panel's stop
                // falls back to aborting the in-flight fetch).
                canStop={selectedFileRunning || (!!runResult?.isStreaming && !!currentRunId)}

                canRunAll={!!selectedFolder && !selectedFolder.isEmpty && !isRunning && !batchRunning}
                onOpenAiChat={menuOpenAiChat}
                aiEndpoints={settings.aiEndpoints}
                aiExplainQuestion={
                    selectedFileSlug && code?.content
                        ? `Explain what this Python script does, step by step:\n\n\`\`\`python\n${code.content.slice(0, 4000)}\n\`\`\``
                        : undefined
                }
                aiImproveQuestion={
                    selectedFileSlug && code?.content
                        ? `Improve this Python script for readability, performance, and correctness:\n\n\`\`\`python\n${code.content.slice(0, 4000)}\n\`\`\``
                        : undefined
                }
                onAiExplain={selectedFileSlug && code?.content ? menuAiExplain : undefined}
                onAiImprove={selectedFileSlug && code?.content ? menuAiImprove : undefined}
                onAiGenerateTests={selectedFileSlug ? menuAiGenerateTests : undefined}
                generatingTests={generatingTests}
                // AI ▸ Agent Mode… — the multi-file edit planner. Disabled while
                // no folder is active (selectedFolder rides the memo deps); the
                // dialog guards its own empty-folder case too.
                onOpenAgentMode={selectedFolder ? menuOpenAgentMode : undefined}
                onOpenSnippets={menuOpenSnippets}
                onOpenHistory={menuOpenHistory}
                onOpenDependencyManager={menuOpenDependencyManager}
                onOpenProjectDictionary={menuOpenProjectDictionary}
                onOpenDuckdbWorkbench={menuOpenDuckdbWorkbench}
                onOpenApiClient={menuOpenApiClient}
                onOpenHexEditor={menuOpenHexEditor}
                onOpenAstExplorer={menuOpenAstExplorer}
                onOpenBytecodeInspector={menuOpenBytecodeInspector}
                onOpenDocstringStudio={menuOpenDocstringStudio}
                onOpenExtensions={menuOpenExtensions}
                onOpenTaskRunner={menuOpenTaskRunner}
                historyCount={history.length}
                onOpenCommit={menuOpenCommit}
                onOpenGitLog={menuOpenGitLog}
                onOpenCompareFiles={menuOpenCompareFiles}
                onCancelCompare={() => {
                    // one command that closes every comparison surface.
                    setCompareFilesOpen(false);
                    setCompareFilesPreselect(null);
                    setCompareClipboard(null);
                    setFolderCompareOpen(false);
                    // the image toolbox keeps its own
                    // side-by-side state — broadcast the cancel so the second
                    // image hides too, without an extra manual click there.
                    window.dispatchEvent(new Event("praxis:cancel-compare"));
                }}
                compareOpen={compareFilesOpen || compareClipboard != null || folderCompareOpen}
                onToggleHighContrast={menuToggleHighContrast}
                onToggleLargeText={menuToggleLargeText}
                onIncreaseFontSizeA11y={menuIncreaseFontSizeA11y}
                onDecreaseFontSizeA11y={menuDecreaseFontSizeA11y}
                onToggleDyslexiaFriendly={menuToggleDyslexiaFriendly}
                onToggleColorBlind={menuToggleColorBlind}
                onToggleScreenReader={menuToggleScreenReader}
                onToggleReduceMotion={menuToggleReduceMotion}
                onToggleEnhancedFocus={menuToggleEnhancedFocus}
                onToggleWrapTab={menuToggleWrapTab}
                onToggleAlwaysShowShortcuts={menuToggleAlwaysShowShortcuts}
                onToggleStickyCursor={menuToggleStickyCursor}
                onToggleShowWhitespace={menuToggleShowWhitespace}
                onToggleHighlightCurrentLine={menuToggleHighlightCurrentLine}
                a11yState={{
                    highContrast: settings.highContrastMode,
                    screenReader: settings.screenReaderMode,
                    reduceMotion: settings.reduceMotion,
                    largeText: settings.largeTextMode,
                    enhancedFocus: settings.enhancedFocusIndicators,
                    dyslexiaFriendly: settings.dyslexiaFriendlyMode,
                    colorBlind: settings.colorBlindMode,
                    alwaysShowShortcuts: settings.alwaysShowShortcutHints,
                    stickyCursor: settings.stickyCursorIndicator,
                    wrapTab: settings.wrapTabNavigation,
                    showWhitespace: settings.showWhitespace,
                    highlightCurrentLine: settings.highlightCurrentLine,
                }}
                onShowShortcuts={menuShowShortcuts}
                onOpenTutorial={menuOpenTutorial}
                onInstallApp={pwaCanInstall ? menuInstallApp : undefined}
                onToggleAiChat={menuToggleAiChat}
                aiChatOpen={aiChatOpen}
                onGoToLine={menuGoToLine}
                onRecentFiles={menuRecentFiles}
                onNavBack={menuNavBack}
                onNavForward={menuNavForward}
                canNavBack={navFlags.back}
                canNavForward={navFlags.forward}
                codeWordWrap={settings.codeWordWrap}
                onToggleCodeWordWrap={menuToggleCodeWordWrap}
                minimapEnabled={settings.showMinimap}
                onToggleMinimap={menuToggleMinimap}
                lineNumbers={settings.showLineNumbers}
                onToggleLineNumbers={menuToggleLineNumbers}
                indentGuides={settings.indentGuides}
                onToggleIndentGuides={menuToggleIndentGuides}
                stickyScroll={settings.stickyScroll}
                onToggleStickyScroll={menuToggleStickyScroll}
                spellCheck={settings.spellCheck}
                onToggleSpellCheck={menuToggleSpellCheck}
                codeFolding={settings.codeFolding}
                onToggleCodeFolding={menuToggleCodeFolding}
                bottomTabsPosition={settings.bottomTabsPosition}
                onToggleBottomTabsPosition={menuToggleBottomTabsPosition}
                onEditorAction={menuEditorAction}
                onRunAllTests={menuRunAllTests}
                onExportMd={menuExportMd}
                onExportIpynb={menuExportIpynb}
                onExportHtml={menuExportHtml}
                onExportTxt={menuExportTxt}
                onExportJson={menuExportJson}
                onExportPdf={menuExportPdf}
                onExportSessionReport={menuExportSessionReport}
                onExportLatex={menuExportLatex}
                onExportRst={menuExportRst}
                onCopyAsMarkdown={menuCopyAsMarkdown}
                onExportGithubRepo={menuExportGithubRepo}
                // Export ▸ filtering — the open file's kind decides which formats
                // the Tools ▸ Export submenu offers (media keeps only the
                // binary-safe exports).
                selectedFileKind={selectedFile?.kind ?? undefined}
                onCompressFile={menuCompressFile}
                onCompressFolder={menuCompressFolder}
                onOpenBranchPicker={menuOpenBranchPicker}
                onOpenGitDiff={menuOpenGitDiff}
                onOpenAiReview={menuOpenAiReview}
                onOpenMergeEditor={menuOpenMergeEditor}
                gitDirtyCount={gitDirtyCount}
                onGoToFile={menuGoToFile}
                onOpenBookmarks={menuOpenBookmarks}
                onTerminalClear={menuTerminalClear}
                // ─── Data / Window / Terminal / Bookmarks menus ─────
                onProfileCurrentFile={profileCurrentFile}
                dataFileOpen={dataFileOpen}
                onOpenChartPreview={openChartForCurrent}
                onOpenTransformPipeline={openPipelineForCurrent}
                onOpenSqlWorkbench={openWorkbenchPicker}
                onOpenDevToolbox={openDevToolbox}
                collabActive={!!collabRoom}
                collabPeers={collabPeers.length}
                onCollabShareWorkspace={menuCollabShareWorkspace}
                onCollabCopyInvite={menuCollabCopyInvite}
                onCollabEndSession={menuCollabEndSession}
                onOpenSnippetManager={menuOpenSnippetManager}
                onOpenJumpList={menuOpenJumpList}
                onScreenshot={menuScreenshot}
                layoutPresetId={layoutPresetId}
                onApplyLayoutPreset={applyLayoutPreset}
                onCycleLayoutPreset={cycleLayoutPreset}
                onResetLayout={resetLayout}
                splitPaneOpen={splitPaneOpen}
                onToggleSplitPane={menuToggleSplitPane}
                onTerminalCommand={menuTerminalCommand}
                bookmarkEntries={bookmarkEntries}
                onAddLineBookmark={addLineBookmark}
                onNavbarRun={navbarRun}
                runConfigBadge={runBadge}
                /* which quick-action buttons the menu bar's right edge shows
         *  (Settings → Nav → "Top-right quick actions"). */
                topRightQuickActions={settings.topRightQuickActions}
                uiTheme={settings.uiTheme}
                onSetUiTheme={handleSetUiTheme}
                typewriterScroll={settings.typewriterScroll}
                onToggleTypewriterScroll={menuToggleTypewriter}
            />
        ),
        [
            // ── value props the menus DISPLAY (changes re-create the element;
            //    function props are stable events and never need to be here) ──
            projects,
            activeProject,
            sidebarVisible,
            bottomPanelOpen,
            foldersLoading,
            bottomTab,
            distractionFree,
            // the new menus' value props.
            dataFileOpen,
            layoutPresetId,
            splitPaneOpen,
            bookmarkEntries,
            runBadge,
            settings.typewriterScroll,
            settings.topRightQuickActions,
            settings.uiTheme,
            selectedFileSlug,
            selectedFolder,
            isRunning,
            batchRunning,
            currentRunId,
            generatingTests,
            history.length,
            gitDirtyCount,
            aiChatOpen,
            navFlags.back,
            navFlags.forward,
            code?.content,
            settings.runNotifyMode,
            settings.aiEndpoints,
            settings.codeWordWrap,
            settings.showMinimap,
            settings.showLineNumbers,
            settings.indentGuides,
            settings.stickyScroll,
            settings.spellCheck,
            settings.codeFolding,
            settings.bottomTabsPosition,
            settings.highContrastMode,
            settings.screenReaderMode,
            settings.reduceMotion,
            settings.largeTextMode,
            settings.enhancedFocusIndicators,
            settings.dyslexiaFriendlyMode,
            settings.colorBlindMode,
            settings.alwaysShowShortcutHints,
            settings.stickyCursorIndicator,
            settings.wrapTabNavigation,
            settings.showWhitespace,
            settings.highlightCurrentLine,
        ]
    );
    const [renderedMenuBar, setRenderedMenuBar] = React.useState<React.ReactNode>(menuBarElement);
    React.useEffect(() => {
        if (renderedMenuBar === menuBarElement) return;
        const t = setTimeout(() => {
            React.startTransition(() => {
                setRenderedMenuBar(menuBarElement);
            });
        }, 120);
        return () => clearTimeout(t);
    }, [menuBarElement, renderedMenuBar]);

    return (
        <div
            data-shot-app-shell="true"
            className="h-screen flex flex-col bg-gradient-to-b from-background to-muted/30 overflow-hidden"
            /* font-variant-ligatures is inherited, so setting it
         once on the app root covers every code surface (view + edit
         backdrop + textarea + whitespace overlay + minimap — they all
         inherit the same value, which keeps the edit-mode overlay
         alignment exact). ON = leave unset (browser default enables the
         JetBrains Mono `calt` programming ligatures: != → ≠, <= → ≤,
         >= → ≥, -> → →). OFF = "none" everywhere. */
            style={settings.codeLigatures ? undefined : {fontVariantLigatures: "none"}}
            onDragOver={(e) => {
                if (settings.dragDropUpload && e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                    setDragOver(true);
                }
            }}
            onDragLeave={(e) => {
                // Only hide if leaving the window (not entering a child).
                if (e.relatedTarget === null) setDragOver(false);
            }}
            onDrop={handleDrop}
        >
            {/* Screen-reader mode affordances: a skip-link that becomes
visible on focus, an always-on sr-only live region for
action announcements, and a small visual badge so sighted
users know why the UI looks different. All three are
no-ops unless `[data-screen-reader="true"]` is set on
<html> (which the screen-reader-mode toggle does). */}
            <a
                href="#main-content"
                className="sr-only-focusable"
                aria-label="Skip to main content"
            >
                Skip to main content
            </a>
            {/* The INITIAL LOADER — covers the shell until the configuration
          finishes loading (see the `booted` state up top): the logo, a
          spinner and one quiet line. Fixed + z over everything, gone in
          one fade once settings/layout/selection are hydrated. */}
            {!booted && (
                <div
                    className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background"
                    role="status"
                    aria-live="polite"
                    aria-label="Loading the application configuration"
                >
                    <img src="/logo.svg" alt="" aria-hidden="true" className="size-14 select-none" draggable={false}/>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-4 animate-spin text-emerald-500" aria-hidden="true"/>
                        Loading configuration…
                    </div>
                </div>
            )}
            {settings.screenReaderMode && (
                <button
                    type="button"
                    className="sr-badge"
                    aria-label="Screen reader mode is ON. Click to turn off."
                    title="Screen reader mode is ON — skip-link, aria-live region, and focus-visible tooltips are active. Click here (or use Tools → Accessibility → Screen reader mode) to toggle off."
                    onClick={() => setSettings((prev) => ({...prev, screenReaderMode: false}))}
                >
                    ♿ SR mode
                </button>
            )}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="sr-only-focusable"
                role="status"
            >
                {/* Action notifications are also routed here in addition to
the visible toast, so screen readers announce them even
when the user isn't looking at the toast viewport. */}
                {lastActionAnnouncement}
            </div>

            {/* the centered BrandHeader row is GONE — the
          logo now lives at the left of the MenuBar itself (passed via
          showBrandLogo / appName / tagline below), saving a full row of
          vertical chrome on every screen. Hidden entirely in
          distraction-free mode (Shift+F11), as before. */}

            {!distractionFree && renderedMenuBar}
            {/* ── Live Collaboration presence bar ──────────────────────
          Shown while a session is live: one avatar chip per peer
          (color + name + where they are), the room code, and the
          live/reconnecting dot. The CollabSession dialog (mounted
          below) owns the actual connection. */}
            {collabRoom && collabPeers.length > 0 && (
                <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1 text-[11px]">
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"/>
            live
          </span>
                    {collabPeers.slice(0, 8).map((p) => (
                        <span key={p.id}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-1.5 py-0.5"
                              title={`${p.name} — ${p.file} (line ${p.line})`}>
              <span className="size-1.5 rounded-full" style={{backgroundColor: p.color}}/>
              <span className="max-w-24 truncate">{p.name}</span>
              <span className="text-muted-foreground">{p.file}:{p.line}</span>
            </span>
                    ))}
                    {collabPeers.length > 8 &&
                      <span className="text-muted-foreground">+{collabPeers.length - 8} more</span>}
                    <span className="ml-auto text-muted-foreground">room {collabRoom}</span>
                </div>
            )}

            {/* the floating draggable focus/concentration timer —
          controlled entirely via praxis:focus-command events from the
          navbar's Focus menu; fully self-contained state. Mounted
          OUTSIDE the !distractionFree wrapper on purpose: hiding the
          menubar must not kill a running focus session — distraction
          -free mode is exactly when the timer earns its keep. */}
            <FocusSessions/>

            {distractionFree && (
                /* "Exit focus" now floats at the TOP-CENTER of
           the focus screen — the unused white space of the toolbar row.
           Previous spots (top-right, then top-left) either overlapped
           the Run cluster or cluttered the corner; the center is far
           from Run (right edge) and from the breadcrumb text (left).
           z-[60] keeps it above the sticky toolbar (z-30). */
                <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleDistractionFree}
                    className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] h-8 gap-1.5 text-xs shadow-lg bg-background/80 backdrop-blur"
                    title="Exit distraction-free mode (Shift+F11)"
                    aria-label="Exit distraction-free mode"
                >
                    <Minimize2 className="size-3.5"/>
                    <span className="hidden sm:inline">Exit focus</span>
                </Button>
            )}

            {/* VSCode-style layout: sidebar (file tree) + main area (toolbar +
resizable code/output split). The sidebar is visible on desktop
(lg+) when `sidebarVisible` is true (toggled by View → Toggle
sidebar / ⌘B); on mobile it's toggled by a hamburger button
and rendered as a drawer overlay (see below). The sidebar
width is user-resizable via a drag handle. */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar — desktop. Resizable width via a drag handle.
            The sidebar stays MOUNTED and is toggled with CSS (`hidden`
            when collapsed) instead of conditionally unmounting/remounting
            the whole FolderTree (an 8k-line component) on every ⌘B —
            unmounting costs seconds in dev mode and destroys the tree's
            expand/filter state. */}
                <div
                    data-tutorial="sidebar"
                    className={cn(
                        "shrink-0 overflow-hidden group/sidebar relative",
                        sidebarVisible ? "hidden lg:flex" : "hidden"
                    )}
                    style={{width: `${sidebarWidth}px`}}
                >
                    <div className="flex-1 overflow-hidden">
                        <PanelErrorBoundary label="Explorer">
                            <PanelErrorBoundary label="Explorer">
                                <FolderTree
                                    folders={folders}
                                    loading={foldersLoading}
                                    error={foldersError}
                                    selectedFolderSlug={deferredSelectedFolderSlug}
                                    selectedFileSlug={deferredSelectedFileSlug}
                                    onSelectFile={treeSelectFile}
                                    onRefresh={refreshFolders}
                                    favorites={favorites}
                                    onToggleFavorite={toggleFavorite}
                                    // Recent-files section visibility + count.
                                    showRecentFiles={settings.showRecentFiles}
                                    recentFilesCount={settings.recentFilesCount}
                                    // fresh-favorite highlight duration + the
                                    // selected Python env (folder Issues report / Install
                                    // ruff target the same interpreter).
                                    favHighlightSeconds={settings.favHighlightSeconds}
                                    pythonInterpreter={settings.pythonInterpreter}
                                    // Explorer right-click → Auto-indent.
                                    onFormatFile={treeStFormatFile}
                                    sortMode={sortMode}
                                    showHidden={settings.explorerShowHidden}
                                    onToggleSort={treeToggleSort}
                                    gitStatusMap={gitStatusMap}
                                    showFileSize={settings.showFileSizeInDropdown}
                                    showFolderSize={settings.showFolderSize}
                                    showTags={settings.explorerShowTags !== false}
                                    onDataFileBrowserOpen={treeOpenDataFileBrowser}
                                    showLastRunStatus={settings.showLastRunStatusInDropdown}
                                    lastRunStatus={lastRunStatusMap}
                                    projects={projects}
                                    activeProject={activeProject}
                                    onSelectProject={treeStSelectProject}
                                    onUploadZip={treeUploadZip}
                                    uploadingZip={uploadingZip}
                                    // "Open folder…" in the explorer's + dropdown —
                                    // same FolderPickerDialog as File → Open project →
                                    // Browse for folder…, now able to open any folder on the
                                    // machine as the active project.
                                    onOpenFolderPicker={treeOpenFolderPicker}
                                    onProjectCreated={treeStProjectCreated}
                                    onFilesImported={treeStFilesImported}
                                    onFileDeleted={treeStFileDeleted}
                                    onFileRenamed={treeStFileRenamed}
                                    onOpenFolder={treeStOpenFolder}
                                    onDownloadFile={treeStDownloadFile}
                                    onCollapse={treeStCollapseSidebar}
                                    onFolderDeleted={treeStFolderDeleted}
                                    onFolderRenamed={treeStFolderRenamed}
                                    // New file/folder ops — the child's mutation handlers
                                    // already call onRefresh themselves , so these
                                    // callbacks stay selection-only (the convention the code
                                    // already documents one line above at onFilesImported).
                                    onFolderCreated={treeFolderCreated}
                                    onFileCreated={treeFileCreated}
                                    onCreateExample={treeStCreateExample}
                                    onFileDuplicated={treeFileDuplicated}
                                    onFileMoved={treeStFileMoved}
                                    onFileCopied={treeFileCopied}
                                    // Explorer right-click Run actions (F7 / F8).
                                    onRunFile={treeStRunFile}
                                    onRunAllInFolder={treeStRunAllInFolder}
                                    onAiPrompt={sendAiPrompt}
                                    onGenerateTestsForFile={treeStGenerateTestsForFile}
                                />
                            </PanelErrorBoundary>
                        </PanelErrorBoundary>
                    </div>
                    {/* Drag handle for resizing the sidebar — pointer events
              (covers touch), separator semantics + keyboard arrows,
              blur/visibilitychange fallback so a drag interrupted by
              Alt+Tab doesn't leave the cursor stuck. */}
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize sidebar"
                        aria-valuenow={sidebarWidth}
                        aria-valuemin={160}
                        aria-valuemax={480}
                        tabIndex={0}
                        className="w-1 cursor-col-resize bg-border hover:bg-emerald-500/50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0) return;
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            const startX = e.clientX;
                            const startWidth = sidebarWidth;
                            // rAF-coalesced: pointermove fires far faster than the
                            // display refresh; without this every drag pixel
                            // re-rendered the entire page component.
                            const applyWidth = rafThrottle((w: number) => setSidebarWidth(w));
                            const onMove = (ev: PointerEvent) => {
                                const delta = ev.clientX - startX;
                                const newWidth = Math.max(160, Math.min(480, startWidth + delta));
                                applyWidth(newWidth);
                            };
                            const onUp = () => {
                                applyWidth.cancel();
                                window.removeEventListener("pointermove", onMove);
                                window.removeEventListener("pointerup", onUp);
                                document.body.style.cursor = "";
                                document.body.style.userSelect = "";
                                document.removeEventListener("visibilitychange", onUp);
                                window.removeEventListener("blur", onUp);
                            };
                            document.addEventListener("visibilitychange", onUp);
                            window.addEventListener("blur", onUp);
                            window.addEventListener("pointermove", onMove);
                            window.addEventListener("pointerup", onUp);
                            document.body.style.cursor = "col-resize";
                            document.body.style.userSelect = "none";
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "ArrowLeft") {
                                e.preventDefault();
                                setSidebarWidth((w) => Math.max(160, w - 16));
                            } else if (e.key === "ArrowRight") {
                                e.preventDefault();
                                setSidebarWidth((w) => Math.min(480, w + 16));
                            }
                        }}
                    />
                </div>
                {/* Collapsed sidebar rail — when `sidebarVisible` is false on
desktop, show a thin vertical bar with an expand button so
the user always has a visible way to bring the sidebar back
(VSCode-style activity bar). Hidden on mobile (mobile uses
the hamburger button in the main toolbar). */}
                {!sidebarVisible && (
                    <div className="hidden lg:flex shrink-0 w-7 border-r bg-card/60 flex-col items-center py-2 gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            onClick={() => setSidebarVisible(true)}
                            aria-label="Show file tree sidebar"
                            title="Show file tree sidebar (⌘B)"
                        >
                            <PanelLeft className="size-4"/>
                        </Button>
                    </div>
                )}

                {/* Main area — toolbar + resizable code/output split */}
                <div id="main-content" className="flex-1 flex flex-col overflow-hidden min-w-0" tabIndex={-1}>
                    {/* Toolbar — sticky so it stays pinned at the top of the main
area while the code body scrolls beneath it. The CodeViewer's
own header (with Open folder / Download / Copy / etc.) is
ALSO sticky at top-0 inside its own scroll container, so the
user always sees a contextual header — either this breadcrumb
toolbar (when scrolling the whole main area) or the
CodeViewer's action bar (when scrolling inside the code pane). */}
                    <div
                        className="flex items-center gap-2 px-3 py-2 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
                        {/* Mobile sidebar toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 lg:hidden shrink-0"
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open file tree"
                            title="Open file tree"
                        >
                            <PanelLeft className="size-4"/>
                        </Button>
                        {/* (Desktop "Show sidebar" affordance moved to the collapsed
                rail at the left edge — see the {!sidebarVisible && ...}
                block above the main area.) */}

                        {/* Breadcrumb — goes BLANK when every editor is
                closed, so no stale folder/file name lingers in the
                toolbar after "Close all" ("when closing all, the header
                should also be removed"). */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
                            <BookOpen className="size-3.5 shrink-0 text-emerald-500"/>
                            {workspaceBlank ? (
                                <span className="truncate text-muted-foreground/60 italic">
                  No file open
                </span>
                            ) : (
                                <>
                  <span className="truncate font-medium text-foreground/80">
                    {selectedFolder?.name ?? "—"}
                  </span>
                                    {selectedFile && (
                                        <>
                                            <ChevronRight className="size-3 text-muted-foreground/40 shrink-0"/>
                                            <span className="truncate font-mono text-[11px]">
                        {selectedFile.name}
                      </span>
                                            <span className="text-muted-foreground/40 shrink-0">·</span>
                                            <span className="shrink-0">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {/* stdin + args/env toggles only make sense
for RUNNABLE files — hidden entirely for non-runnable
kinds — dead controls are hidden entirely rather
than left as clickable buttons that feed a disabled Run.
Applies to EVERY runnable kind
(js / ts / matlab / r / shell / java / c / cpp) — their
args/env/stdin flow to the language runtime registry
exactly like Python's. */}
                        {isRunnableKind(selectedFileKind) && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowStdin((v) => !v)}
                                    className={`h-8 gap-1 text-xs shrink-0 ${showStdin || stdinText ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : ""}`}
                                    aria-label="Toggle stdin input"
                                    title="Toggle stdin input"
                                >
                                    <span className="text-xs font-mono">in</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowArgsEnv((v) => !v)}
                                    className={`h-8 gap-1 text-xs shrink-0 ${showArgsEnv || argsText || envText ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : ""}`}
                                    aria-label="Toggle args/env inputs"
                                    title="Toggle args/env inputs"
                                >
                                    <Terminal className="size-3.5"/>
                                </Button>
                                {/* ── MERGED INTO THE TOOLBAR. Both popover triggers now live HERE, next
to the stdin/args toggles and the Run split-button,
for EVERY runnable kind (py and non-py alike —
args/env/stdin pass through to all runtimes, so the
saved Configs apply to java/c/js/shell runs too; the
Run Capture picker stays Python-only because those
flags only affect the Python capture pipeline). The
strip below now opens ONLY for the actual input
fields (stdin / args / env), never for these two
popovers. */}
                                <RunConfigPopover
                                    folderSlug={selectedFolderSlug}
                                    fileSlug={selectedFileSlug}
                                    args={argsText}
                                    env={envText}
                                    stdin={stdinText}
                                    onApply={handleApplyRunConfig}
                                />
                                {settings.showPerRunFlags && selectedFileKind === "python" && (
                                    <CapturePicker
                                        defaults={{
                                            inspectVariables: settings.inspectVariables,
                                            captureDataframes: settings.captureDataframes,
                                            traceCoverage: settings.traceCoverage,
                                        }}
                                        overrides={captureOverrideState}
                                        setFlag={setCaptureFlag}
                                        reset={() => setCaptureOverride({})}
                                        makeDefault={(flags) => {
                                            setSettings((prev) => ({...prev, ...flags}));
                                            toast({
                                                title: "Run capture defaults updated",
                                                description: "Every plain Run now captures: " +
                                                    [
                                                        flags.inspectVariables ? "Vars" : null,
                                                        flags.captureDataframes ? "DataFrames" : null,
                                                        flags.traceCoverage ? "Coverage" : null,
                                                    ].filter(Boolean).join(" · "),
                                                variant: "success",
                                            });
                                        }}
                                    />
                                )}
                            </>
                        )}

                        {/* Run / Stop buttons + Run options dropdown —
                a run CAN start while another is still streaming (the
                still-streaming run demotes to a background group in the
                Output panel), so Stop and Run now coexist instead of
 swapping. the Stop button now renders
                whenever a run is in flight — even BEFORE the start
                event delivers a runId (previously it vanished exactly
                when a stuck run needed it). */}
                        {isRunning ? (
                            <Button
                                onClick={handleStopPrimary}
                                size="sm"
                                className="h-8 px-4 gap-1.5 bg-red-500 hover:bg-red-600 text-white shrink-0 rounded-r-none"
                                title="Stop the running script (SIGTERM → SIGKILL server-side; aborts the stream locally if the run is still starting)"
                            >
                                <span className="size-2.5 bg-current rounded-sm"/>
                                {/* translated label (i18n: stopButton) — English fallback. */}
                                {t("stopButton")}
                            </Button>
                        ) : null}
                        {/* the Run button + its options arrow are ONE
split button now. The gradient lives on the GROUP
CONTAINER so the color flows continuously across both
halves — previously each button restarted its own
emerald→cyan gradient (the arrow's emerald edge sat
flush against the Run button's cyan edge — a visible
seam) and the corner
radii disagreed (Run kept its right rounding while the
arrow squared its left edge). Both halves are now
transparent with a shared white divider; while a run is
in flight the whole group attaches to the red Stop
button (Stop squares its right edge, the group squares
its left). */}
                        {/* when the file is not runnable the whole
                group turns clearly GRAY (no gradient, muted colors) and
                the options dropdown is hidden — only the flat gray Run
                button remains, unmistakably disabled. */}
                        {/* The Run group shows for EVERY runnable kind —
python / javascript / typescript / matlab / r / shell /
java / c / c++ — the button routes through the language
runtime registry (node / tsx / MATLAB / Octave / Rscript
/ bash / java / gcc / g++). The python-only menu extras
(coverage / console / pdb) stay disabled for the other
languages; non-runnable kinds still hide it entirely. */}
                        {isRunnableKind(selectedFileKind) && (
                            <div
                                className={cn(
                                    "flex items-stretch shrink-0 rounded-md overflow-hidden",
                                    selectedFileSlug
                                        ? "bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white"
                                        : "bg-muted text-muted-foreground opacity-70 cursor-not-allowed",
                                    isRunning && "rounded-l-none border-l border-white/20"
                                )}
                            >
                                <Button
                                    data-tutorial="run-button"
                                    onClick={handleRun}
                                    disabled={!selectedFileSlug || !isRunnableKind(selectedFileKind)}
                                    size="sm"
                                    className="h-8 px-4 gap-1.5 rounded-none bg-transparent hover:bg-transparent text-current shadow-none"
                                    title={
                                        isRunnableKind(selectedFileKind)
                                            ? `Run the current ${RUNTIME_LABEL_BY_LANGUAGE[runLanguageForKind(selectedFileKind) ?? ""] ?? ""} file (⌘↵). Output streams live via Server-Sent Events — starting another run while one streams demotes it to a background group.`
                                            : "Run is enabled for runnable files only"
                                    }
                                >
                                    <Play className="size-3.5"/>
                                    {/* translated label (i18n: runButton) — English fallback. */}
                                    {t("runButton")}
                                </Button>
                                {selectedFileSlug && isRunnableKind(selectedFileKind) && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                disabled={!selectedFileSlug || !isRunnableKind(selectedFileKind)}
                                                size="sm"
                                                className="h-8 px-2 gap-0 rounded-none bg-transparent hover:bg-white/10 text-white shadow-none border-l border-white/25"
                                                aria-label="Run Options"
                                                title={isRunnableKind(selectedFileKind) ? "Run Options" : "Run options are enabled for runnable files"}
                                            >
                                                <ChevronDown className="size-3"/>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel className="text-xs text-muted-foreground">Run
                                                Options</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={handleRun}
                                                              disabled={!isRunnableKind(selectedFileKind)}>
                                                <Play className="size-3.5 text-emerald-500"/>
                                                Run Normally
                                                <kbd className="ml-auto text-[9px] text-muted-foreground">⌘↵</kbd>
                                            </DropdownMenuItem>
                                            {/* "Run in sandbox" was removed: the server-side
                        /api/run route never honored the `sandbox:true`
                        flag the UI was sending, so the option was
                        misleading. Re-add it once a real isolation
                        layer (firejail/bwrap/docker) is implemented. */}
                                            <DropdownMenuSeparator/>
                                            <DropdownMenuItem onClick={() => void handleRunAll()}
                                                              disabled={!selectedFolder || selectedFolder.isEmpty || batchRunning}>
                                                <Layers className="size-3.5 text-emerald-500"/>
                                                Run All In Folder
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => {
                                                setTraceCoverageOverride(true);
                                                handleRun();
                                            }} disabled={selectedFileKind !== "python"}>
                                                <Crosshair className="size-3.5 text-amber-500"/>
                                                Run With Coverage
                                            </DropdownMenuItem>
                                            {/* — Console mode: the file runs in the
                        persistent kernel (state survives every run). */}
                                            <DropdownMenuItem onClick={handleRunInConsole}
                                                              disabled={!selectedFileSlug || selectedFileKind !== "python"}>
                                                <SquareTerminal className="size-3.5 text-emerald-500"/>
                                                Run In Console
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => {
                                                    // "Debug with pdb" — open the bottom panel on
                                                    // the Diagnostics tab AND queue a durable debug
                                                    // request: the DiagnosticsPanel selects its
                                                    // Debug tool and starts the pdb session, on
                                                    // the FIRST invocation too (the old
                                                    // tab-only flip showed an empty panel until a
                                                    // second click).
                                                    setBottomPanelOpen(true);
                                                    setBottomTab("diag");
                                                    queueDebugRun();
                                                }}
                                                disabled={!selectedFileSlug || selectedFileKind !== "python"}
                                                title="Open the Diagnostics tab and start the pdb session (breakpoints, step, continue, variables)"
                                            >
                                                <Bug className="size-3.5 text-red-500"/>
                                                Debug With Pdb
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        )}

                        {/* More actions dropdown — replaces the overflowing row of
                action buttons with a single compact menu.
                Hidden for non-Python files like the Run group above —
                its items are all Python-run-centric
                (Run all / Install deps / Import .ipynb / templates). */}
                        {selectedFolder && selectedFileKind === "python" && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0"
                                        aria-label="More actions"
                                        title="More folder actions"
                                    >
                                        <MoreVertical className="size-4"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                                        Folder Actions
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                        onClick={() => void handleRunAll()}
                                        disabled={selectedFolder.isEmpty || isRunning || batchRunning}
                                    >
                                        <Layers className="size-3.5 text-emerald-500"/>
                                        Run all ({selectedFolder.files.length})
                                    </DropdownMenuItem>
                                    {selectedFolder.dataFiles && selectedFolder.dataFiles.length > 0 && (
                                        <DropdownMenuItem onClick={() => setDataFileBrowserOpen(true)}>
                                            <Database className="size-3.5"/>
                                            Browse {selectedFolder.dataFiles.length} data
                                            file{selectedFolder.dataFiles.length === 1 ? "" : "s"}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={handleInstallDeps}
                                        disabled={isRunning || installDepsRunning}
                                    >
                                        <Package className="size-3.5 text-emerald-500"/>
                                        Install Deps
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                                        Import
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                        onClick={() => document.getElementById("ipynb-import-input")?.click()}
                                        disabled={isRunning || importing || !selectedFolderSlug}
                                    >
                                        <Upload className="size-3.5 text-cyan-500"/>
                                        Import .ipynb
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => document.getElementById("py-import-input")?.click()}
                                        disabled={isRunning || importing || !selectedFolderSlug}
                                    >
                                        <Upload className="size-3.5 text-emerald-500"/>
                                        Import .py
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setTemplatePickerOpen(true)}
                                        disabled={isRunning || importing || !selectedFolderSlug}
                                    >
                                        <FileCode2 className="size-3.5 text-cyan-500"/>
                                        New From Template
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem
                                        onClick={async () => {
                                            if (!selectedFolderSlug) return;
                                            try {
                                                const res = await fetch("/api/export/folder-ipynb", {
                                                    method: "POST",
                                                    headers: {"Content-Type": "application/json"},
                                                    body: JSON.stringify({folder: selectedFolderSlug}),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error);
                                                const blob = new Blob([JSON.stringify(data.notebook, null, 1)], {
                                                    type: "application/x-ipynb+json",
                                                });
                                                const a = document.createElement("a");
                                                a.href = URL.createObjectURL(blob);
                                                a.download = data.filename ?? "folder.ipynb";
                                                a.click();
                                                URL.revokeObjectURL(a.href);
                                                toast({title: "Folder exported", description: data.filename});
                                            } catch (err) {
                                                toast({
                                                    title: "Export failed",
                                                    description: (err as Error).message,
                                                    variant: "destructive"
                                                });
                                            }
                                        }}
                                        disabled={!selectedFolderSlug || selectedFolder?.isEmpty}
                                    >
                                        <Download className="size-3.5 text-purple-500"/>
                                        Export folder .ipynb
                                    </DropdownMenuItem>
                                    {/* "Upload ZIP project" was removed from this menu — it
                      now lives ONLY in the Explorer's File menu
                      (folder-tree.tsx) so there's a single source of
                      truth for project switching / upload. Keeping the
                      separator + Project label out as well to avoid an
                      empty section header. */}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* Hidden file inputs for import (kept here so the dropdown
                items can trigger them by ID). */}
                        <input
                            type="file"
                            accept=".ipynb,application/json"
                            className="hidden"
                            id="ipynb-import-input"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleImportNotebook(f);
                                e.target.value = "";
                            }}
                            disabled={importing}
                        />
                        <input
                            type="file"
                            accept=".py"
                            className="hidden"
                            id="py-import-input"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleImportPyFile(f);
                                e.target.value = "";
                            }}
                            disabled={importing}
                        />
                        {/* ZIP upload input for the multi-project "Upload ZIP project"
                action. The same input is triggered by both the Header
                button and the More Actions dropdown item. */}
                        <input
                            type="file"
                            accept=".zip,application/zip,application/x-zip-compressed"
                            className="hidden"
                            id="zip-upload-input"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadZip(f);
                                e.target.value = "";
                            }}
                            disabled={uploadingZip}
                        />
                    </div>

                    {/* Multi-tab editor bar — wrapped in its own boundary so a
              render bug in the STRIP itself can't take the whole work
              area down (the strip is the last unwrapped region). */}
                    <PanelErrorBoundary label="Editor Tabs">
                        <EditorTabs
                            tabs={openTabs}
                            activeTabId={activeTabId}
                            onSelectTab={handleSelectTab}
                            onCloseTab={handleCloseTab}
                            onRevealInExplorer={(tab) => {
                                // guarded switch.
                                guardedSelectFile(tab.folderSlug, tab.fileSlug);
                                setSidebarVisible(true);
                                setTimeout(() => window.dispatchEvent(new CustomEvent("praxis:reveal-current")), 100);
                            }}
                            onCloseOthers={(keepId) => {
                                setOpenTabs((prev) => {
                                    // Select the kept tab so the editor shows the file the
                                    // user kept (previously the view could stay on a
                                    // different — now closed — file).
                                    const kept = prev.find((t) => t.id === keepId);
                                    if (kept) {
                                        setSelectedFolderSlug(kept.folderSlug);
                                        setSelectedFileSlug(kept.fileSlug);
                                    }
                                    return prev.filter((t) => t.id === keepId);
                                });
                                setActiveTabId(keepId);
                            }}
                            onCloseAll={handleCloseAllEditors}
                        />
                    </PanelErrorBoundary>

                    {/* stdin + args/env collapsible area (below toolbar).
 hidden while the workspace is blank (all editors
              closed) — "not anything" includes these run-input panels.
 the strip follows EVERY runnable kind (js / ts /
              matlab / r / shell / java / c / cpp) — args/env/stdin pass
              through to their runtimes exactly like Python's.
 MERGED-AWAY CONTROLS: the RunConfigPopover (Configs) and the
              CapturePicker (Run Capture) no longer live here — they
              moved up into the toolbar beside the Run button (see the
              toolbar comment), so this strip opens ONLY when an actual
              input field (stdin / args / env) is toggled on. A
              bare-"Configs" navbar row never appears anymore. */}
                    {(showStdin || showArgsEnv) && !workspaceBlank && isRunnableKind(selectedFileKind) && (
                        <div className="px-3 py-2 border-b bg-muted/20 space-y-2">
                            {showStdin && (
                                <div>
                                    <label
                                        htmlFor="stdin-input"
                                        className="text-[10px] font-medium text-muted-foreground mb-1 block"
                                    >
                                        Stdin — piped to the program&apos;s standard input (<code
                                        className="font-mono">input()</code> / <code
                                        className="font-mono">readline</code> / <code className="font-mono">scanf</code>)
                                    </label>
                                    <Textarea
                                        id="stdin-input"
                                        value={stdinText}
                                        onChange={(e) => setStdinText(e.target.value)}
                                        placeholder="One line per prompt — e.g. one per input() call…"
                                        className="font-mono text-xs h-16"
                                        onKeyDown={(e) => {
                                            // the global ⌘↵ shortcut is now
                                            // gated behind the isTyping guard, so the stdin box
                                            // carries its own local binding — ⌘↵ runs the
                                            // current script with this stdin (as documented).
                                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleRun();
                                            }
                                        }}
                                    />
                                </div>
                            )}
                            {showArgsEnv && (
                                <div className="grid sm:grid-cols-2 gap-2">
                                    <div>
                                        <Label htmlFor="args-input"
                                               className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                            <Terminal className="size-2.5"/>
                                            Args (command-line arguments)
                                        </Label>
                                        <Input
                                            id="args-input"
                                            value={argsText}
                                            onChange={(e) => setArgsText(e.target.value)}
                                            placeholder="--seed 42 --n 100"
                                            className="font-mono text-xs h-8"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="env-input"
                                               className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                            <Variable className="size-2.5"/>
                                            Env (KEY=value per line)
                                        </Label>
                                        <Textarea
                                            id="env-input"
                                            value={envText}
                                            onChange={(e) => setEnvText(e.target.value)}
                                            placeholder={"SEED=42\nDATA_DIR=./data"}
                                            className="font-mono text-xs h-8"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Vertical split: code (top) + output/diagnostics (bottom).
Uses CSS flexbox + a drag handle instead of
react-resizable-panels (which had overflow:hidden issues
that prevented scrolling).

GUIDED BLANK WORKSPACE: when every editor tab
is closed (workspaceBlank) the split is replaced by a
centered welcome card — shortcuts + a Show-Explorer CTA
(user: "a text in the middle or something in the middle
should be a great guidance"). The toolbar breadcrumb also
blanks (see above) so no stale file header remains.
Opening any file (sidebar click, ⌘K, Recent Files, ⌃⇧T,
Back/Forward…) flips editorBlank back to false and
restores the full layout. */}
                    {workspaceBlank ? (
                        <WorkspaceWelcome onShowExplorer={() => setSidebarVisible(true)}/>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0" data-screenshot-root>
                            {/* Code viewer pane — overflow-hidden (NOT overflow-auto)
so the CodeViewer's own body wrapper (inside
code-viewer.tsx) becomes the sole scroll container.
This is what makes the CodeViewer's header stay fixed
while only the code body scrolls — the VSCode pattern.
The CodeViewer fills this pane's height; its internal
flex column has header (shrink-0) + body (flex-1
overflow-auto) + footer (shrink-0). */}
                            <div
                                data-tutorial="code-viewer"
                                data-shot-pane="editor"
                                className={cn(
                                    "overflow-hidden p-3 flex flex-col",
                                    // When the bottom panel is open, the code pane is a
                                    // fixed-percentage child of the vertical split (shrink-0
                                    // so the drag handle + output panel get their share).
                                    // When the bottom panel is HIDDEN, the code pane becomes
                                    // flex-1 so it grows to fill ALL the remaining space
                                    // (minus the 28px collapsed-rail sibling) — same pattern
                                    // as the sidebar: hiding the chrome gives its space back
                                    // to the editor. the split now applies to ANY
                                    // open file (Notes/Terminal/TODOs work for non-Python
                                    // files too), not just Python.
                                    bottomPanelOpen ? "shrink-0" : "flex-1 min-h-0",
                                )}
                                style={{
                                    // Only set an explicit height when the bottom panel is
                                    // open (the percentage split). When hidden, flex-1 handles
                                    // sizing — setting height would conflict with flex-1.
                                    height: bottomPanelOpen ? `${codePanelHeight}%` : undefined,
                                    minHeight: "80px",
                                }}
                            >
                                {/* the folder-intro README card that used to
                  render here was REMOVED — README.md is a normal file in
                  the folder tree now and opens in the FileViewer like
                  any other .md file. */}
                                {/* ── Symbol-path breadcrumbs (module > class > function)
                  above the editor. The pane container is flex-col, so the
                  24px bar sits above the split row and the editor keeps
                  the rest. The caret feed comes from the external footer
                  store (see EditorBreadcrumbs at the file bottom) — the
                  page itself never re-renders on caret moves. */}
                                <EditorBreadcrumbs
                                    symbols={codeViewerRef.current?.getSymbols() ?? []}
                                    /* Round 3 — an untitled draft has no selectedFile, but the
                   breadcrumb should still name the active draft pane. */
                                    fileName={selectedFile?.name ?? activeUntitledTab?.fileName}
                                    fileId={selectedFileSlug ?? null}
                                    visible={settings.showBreadcrumbs !== false}
                                    onGotoLine={(line) => codeViewerRef.current?.jumpToLine(line)}
                                />
                                {/* Split-editor row (F3): when the second pane is open the
                  main content and a read-only reference view sit side by
                  side with a draggable vertical divider; otherwise the
                  single-column layout is unchanged. */}
                                <div
                                    className={cn(
                                        "flex-1 min-h-0",
                                        splitPaneOpen
                                            ? splitOrientation === "right"
                                                ? "flex flex-row"
                                                : "flex flex-col"
                                            : "flex flex-col"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "min-h-0 flex flex-col",
                                            splitPaneOpen ? "min-w-0 shrink-0" : "flex-1"
                                        )}
                                        style={
                                            splitPaneOpen
                                                ? splitOrientation === "right"
                                                    ? {width: `${splitPaneWidthPercent}%`}
                                                    : {height: `${splitPaneWidthPercent}%`}
                                                : undefined
                                        }
                                    >
                                        {activeUntitledTab ? (
                                            /* Round 3 — the UNTITLED API client draft pane: a full
                     workbench over an in-memory buffer. No disk file
                     backs this tab — the Save As… button (and ⌘S) open
                     the destination picker; edits live in the page-level
                     draft map, so switching tabs or closing is
                     lossless. */
                                            <PanelErrorBoundary label="API client draft">
                                                <div
                                                    className="flex h-full min-h-0 flex-col rounded-xl border overflow-hidden bg-card/60 shadow-sm">
                                                    {/* Draft header — name + in-memory badge + Save As. */}
                                                    <div
                                                        className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 shrink-0">
                                                        <Globe className="size-3.5 shrink-0 text-emerald-500"/>
                                                        <span
                                                            className="truncate text-xs font-medium">{activeUntitledTab.fileName}</span>
                                                        <span className="shrink-0 text-[10px] text-muted-foreground">in-memory draft — not on disk yet</span>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="ml-auto h-6 gap-1 px-2 text-[11px]"
                                                            onClick={() => {
                                                                // Seed the picker from the same defaults ⌘S uses.
                                                                openSaveAsPicker(activeUntitledTab, selectedFolderSlug);
                                                            }}
                                                            title="Pick a folder and file name for this draft (Ctrl/Cmd+S)"
                                                        >
                                                            Save As…
                                                        </Button>
                                                    </div>
                                                    {/* The workbench body scrolls independently of the pane. */}
                                                    <div className="min-h-0 flex-1 overflow-y-auto">
                                                        <ApiClientWorkbench
                                                            key={activeUntitledTab.id}
                                                            folderSlug=""
                                                            fileSlug=""
                                                            fileName={activeUntitledTab.fileName}
                                                            content={draftTextFor(activeUntitledTab.id)}
                                                            untitled
                                                            onSourceChange={(next) => {
                                                                // Live draft sync — no re-render, never lost.
                                                                setDraftText(activeUntitledTab.id, next);
                                                            }}
                                                            onSaved={() => {
                                                                // The workbench's Save As… button opens the picker
                                                                // seeded exactly like the header button and ⌘S.
                                                                openSaveAsPicker(activeUntitledTab, selectedFolderSlug);
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </PanelErrorBoundary>
                                        ) : diffView ? (
                                            /* DIFF AS AN EDITOR SURFACE (F22) — side-by-side
                     panes, word-level intra-line highlights, editable
                     right side + save-from-diff. */
                                            <div className="relative flex h-full min-h-0 flex-col">
                                                <div
                                                    className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
                                                    <GitCompare className="size-3.5 text-emerald-500"/>
                                                    <span
                                                        className="truncate text-xs font-medium">{diffView.title}</span>
                                                    <span className="text-[10px] text-muted-foreground">diff view</span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="ml-auto h-6 gap-1 px-2 text-[11px]"
                                                        onClick={closeDiffView}
                                                        title="Close the diff view and return to the editor (Escape)"
                                                    >
                                                        <X className="size-3"/> Close diff
                                                    </Button>
                                                </div>
                                                <div className="min-h-0 flex-1">
                                                    <DiffView
                                                        key={diffView.nonce}
                                                        title={diffView.title}
                                                        left={{
                                                            label: diffView.leftLabel,
                                                            content: diffView.leftContent,
                                                        }}
                                                        right={{
                                                            label: diffView.rightLabel,
                                                            content: diffView.rightContent,
                                                            editable: !!diffView.rightFile,
                                                            onSave: diffView.rightFile ? saveDiffViewRight : undefined,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ) : codeLoading ? (
                                            // Code-shaped skeleton — mimics the CodeViewer header
                                            // + a few code-line bars so the load transition feels
                                            // less jarring than a single gray rectangle.
                                            <div className="flex flex-col h-full">
                                                <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                                                    <Skeleton className="size-4 rounded"/>
                                                    <div className="flex-1 space-y-1">
                                                        <Skeleton className="h-3 w-32 rounded"/>
                                                        <Skeleton className="h-2 w-20 rounded"/>
                                                    </div>
                                                    <Skeleton className="h-7 w-16 rounded"/>
                                                    <Skeleton className="h-7 w-16 rounded"/>
                                                </div>
                                                <div className="flex-1 px-4 py-3 space-y-2 overflow-hidden">
                                                    {Array.from({length: 12}).map((_, i) => (
                                                        <div key={i} className="flex items-center gap-3">
                                                            <Skeleton className="h-3 w-6 rounded shrink-0"/>
                                                            <Skeleton
                                                                className="h-3 rounded"
                                                                style={{width: `${40 + Math.sin(i) * 30 + 30}%`}}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : selectedFile && selectedFile.kind && selectedFile.kind !== "python" ? (
                                            /* Non-Python file — render the FileViewer instead of
                     the CodeViewer. The FileViewer picks the right
                     renderer for the file's kind (markdown, text, json,
                     image, video, audio, pdf, etc.) and offers Edit +
                     Save for text-based kinds. */
                                            <PanelErrorBoundary label="File viewer">
                                                <PanelErrorBoundary label="File viewer">
                                                    <FileViewer
                                                        fileName={selectedFile.name}
                                                        fileKind={selectedFile.kind}
                                                        folderSlug={selectedFolderSlug}
                                                        fileSlug={selectedFileSlug}
                                                        codeSyntaxTheme={settings.codeSyntaxTheme}
                                                        onSaveEdit={handleSaveFileEdit}
                                                        autoSaveDelayMs={settings.autoSaveDelayMs}
                                                        formatSwitchDelayMs={settings.formatSwitchDelayMs}
                                                        lineHeight={settings.codeLineHeight}
                                                        letterSpacing={settings.codeLetterSpacing}
                                                        // the column ruler for every NON-Python code
                                                        // file — the same setting and the same guide the
                                                        // Python editor draws ("if codes are using the
                                                        // vertical ruler like python, why not displayed?").
                                                        rulerColumn={settings.rulerColumn}
                                                        rulerLineWidth={settings.rulerLineWidth}
                                                        mdPreviewWidth={settings.mdPreviewWidth}
                                                        // the FileViewer now reports its
                                                        // own unsaved-buffer state (edit mode + Markdown
                                                        // studio) — the tab/tree switch guard can ask
                                                        // Save / Discard before the buffer is dropped.
                                                        onDirtyChange={handleViewerDirtyChange}
                                                        // the viewer reports its loaded text up — the
                                                        // Screenshot Studio's code / selection screenshots
                                                        // render from it.
                                                        onContentKnown={handleViewerContentKnown}
                                                        // other images in the folder feed the
                                                        // toolbox's compare (side-by-side + blink).
                                                        siblingImages={siblingImages}
                                                        // the data-file toolbar buttons.
                                                        onOpenChart={openChartForCurrent}
                                                        onOpenTransform={openPipelineForCurrent}
                                                        onOpenWorkbench={handleOpenWorkbenchForCurrent}
                                                        /* the in-viewer Run control for every
                       runnable kind (java / r / .m / js / ts / ruby /
                       php / go …) + the runtime status chip with the
                       install hint when the interpreter is missing. */
                                                        onRun={handleRun}
                                                        /* Run selection — the same context-menu
                       group the Python editor offers, now mirrored for
                       every runnable non-Python kind (the run API
                       accepts a code override, so the selection runs
                       under node / Rscript / bash / ruby …). */
                                                        onRunSelection={handleRunSelection}
                                                        /* AI ▸ / Explain-Selection — the integrated
                       AI chat, same wiring the Python editor gets. */
                                                        onAiPrompt={sendAiPrompt}
                                                        /* Open containing folder — the File ▸ group's
                       row, same handler the Python editor's viewer
                       gets ("mirror the allowed menus … for the
                       python right clicks"). */
                                                        onOpenFolder={handleOpenFolder}
                                                        runStatus={
                                                            viewerRunLanguage && viewerRunLanguage !== "python"
                                                                ? runtimeStatuses?.find((rt) =>
                                                                rt.languages.includes(viewerRunLanguage)
                                                            ) ?? null
                                                                : null
                                                        }
                                                    />
                                                </PanelErrorBoundary>
                                            </PanelErrorBoundary>
                                        ) : code ? (
                                            <PanelErrorBoundary label="Editor">
                                                <CodeViewer
                                                    ref={codeViewerRef}
                                                    fileName={code.file}
                                                    code={code.content}
                                                    folderName={code.folder}
                                                    onOpenFolder={handleOpenFolder}
                                                    isOpeningFolder={isOpeningFolder}
                                                    canOpenFolder={!!selectedFileSlug}
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    onRunCell={handleRunCell}
                                                    // Run Selection in Python.
                                                    onRunSelection={handleRunSelection}
                                                    // whole-file Run from the editor's view-mode
                                                    // context menu — same handler as the toolbar button.
                                                    onRunFile={handleRun}
                                                    aiEndpoints={settings.aiEndpoints}
                                                    codeSyntaxTheme={settings.codeSyntaxTheme}
                                                    onSaveEdit={handleSaveEdit}
                                                    wordWrap={settings.codeWordWrap}
                                                    collapsedByDefault={settings.codeCollapsedByDefault}
                                                    showLineNumbers={settings.showLineNumbers}
                                                    fontSize={settings.codeFontSize}
                                                    lineHeight={settings.codeLineHeight}
                                                    letterSpacing={settings.codeLetterSpacing}
                                                    rainbowBrackets={settings.rainbowBrackets}
                                                    indentWidth={settings.editorIndentWidth}
                                                    indentStyle={settings.indentStyle}
                                                    insertSnippet={insertSnippet}
                                                    onSnippetConsumed={treeSnippetConsumed}
                                                    autoSaveDelayMs={settings.autoSaveDelayMs}
                                                    showSymbolOutline={settings.showSymbolOutline}
                                                    aiCompletionEnabled={settings.aiCompletionEnabled}
                                                    diagnostics={settings.inlineDiagnostics ? inlineDiagnostics : undefined}
                                                    gitDiffLines={settings.showGitDiffGutter ? gitDiffLines : undefined}
                                                    coverageLines={coverageLinesForEditor}
                                                    coverageUncovered={coverageUncoveredForEditor}
                                                    typeInlays={typeInlays}
                                                    typeSymbols={typeSymbols}
                                                    lineProfileHeat={lineProfileHeat}
                                                    vimMode={settings.vimMode}
                                                    onGenerateTests={handleGenerateTests}
                                                    generatingTests={generatingTests}
                                                    onAiPrompt={sendAiPrompt}
                                                    codeFolding={settings.codeFolding}
                                                    showMinimap={settings.showMinimap}
                                                    webWorkerHighlighting={settings.webWorkerHighlighting}
                                                    // the live edit-mode lint runs in
                                                    // the CONFIGURED interpreter; the AI completion
                                                    // debounce setting is actually consumed now.
                                                    pythonInterpreter={settings.pythonInterpreter}
                                                    aiCompletionDebounceMs={settings.aiCompletionDebounceMs}
                                                    highlightCurrentLine={settings.highlightCurrentLine}
                                                    hoverSymbolTooltips={settings.hoverSymbolTooltips}
                                                    showWhitespace={settings.showWhitespace}
                                                    maxLineLengthHint={settings.maxLineLengthHint}
                                                    autoSaveOnBlur={settings.autoSaveOnBlur}
                                                    stickyCursorIndicator={settings.stickyCursorIndicator}
                                                    // The cursor reporter is wired UNCONDITIONALLY now —
                                                    // it only writes the external footer store (no page
                                                    // setState, so no page re-render per keystroke), and
                                                    // the breadcrumbs bar + footer chip both consume it
                                                    // through useSyncExternalStore. The selection reporter
                                                    // stays gated on the footer setting (only the footer
                                                    // consumes it today).
                                                    onCursorPositionChange={handleCursorPositionChange}
                                                    onSelectionChange={
                                                        settings.showCursorPositionInFooter
                                                            ? handleSelectionChange
                                                            : undefined
                                                    }
                                                    onDirtyChange={handleViewerDirtyChange}
                                                    // ─── editor polish + profiling heatmap ──
                                                    stickyScroll={settings.stickyScroll}
                                                    // typewriter scrolling.
                                                    typewriterScroll={settings.typewriterScroll}
                                                    indentGuides={settings.indentGuides}
                                                    rulerColumn={settings.rulerColumn}
                                                    rulerLineWidth={settings.rulerLineWidth}
                                                    tabSnippetExpansion={settings.tabSnippetExpansion}
                                                    timingOverlay={timingOverlay}
                                                    onClearTiming={() => setTimingOverlay(null)}
                                                    codeLens={settings.codeLens}
                                                    runtimeVariables={runtimeVariablesForEditor}
                                                    // Inline git blame gutter — the Settings ▸ Editor
                                                    // toggle finally reaches the viewer itself (it used
                                                    // to write a setting nothing read).
                                                    showBlameGutter={settings.showBlameGutter}
                                                />
                                            </PanelErrorBoundary>
                                        ) : (
                                            <EmptyState
                                                icon={<FileCode2 className="size-7"/>}
                                                title="No file selected"
                                                description={
                                                    folders.length === 0
                                                        ? activeProject
                                                            ? `This project is empty — create a folder with the sidebar's + button or upload a ZIP.`
                                                            : `Drop folders into ${SCRIPTS_DIR_NAME}/ and click Refresh.`
                                                        : !sidebarVisible
                                                            ? "Open the sidebar (⌘B) and pick a folder and file."
                                                            : "Pick a folder and a file in the sidebar to see its source code."
                                                }
                                            />
                                        )}
                                    </div>

                                    {/* ─── Split pane (right) — read-only reference view ── */}
                                    {splitPaneOpen && (
                                        <>
                                            {/* Drag handle between the two panes — axis-aware
 (vertical bar for a right split,
                        horizontal bar for a down split). */}
                                            <div
                                                role="separator"
                                                aria-orientation={splitOrientation === "right" ? "vertical" : "horizontal"}
                                                aria-label="Resize editor panes"
                                                aria-valuenow={Math.round(splitPaneWidthPercent)}
                                                aria-valuemin={20}
                                                aria-valuemax={80}
                                                tabIndex={0}
                                                className={cn(
                                                    "bg-border hover:bg-emerald-500/50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                                                    splitOrientation === "right"
                                                        ? "w-1 cursor-col-resize"
                                                        : "h-1 cursor-row-resize"
                                                )}
                                                onPointerDown={(e) => {
                                                    if (e.pointerType === "mouse" && e.button !== 0) return;
                                                    e.preventDefault();
                                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                                    const container = (e.currentTarget as HTMLElement).parentElement;
                                                    if (!container) return;
                                                    const rect = container.getBoundingClientRect();
                                                    const startX = e.clientX;
                                                    const startY = e.clientY;
                                                    const startPercent = splitPaneWidthPercent;
                                                    // rAF-coalesced resize (one render per frame max);
                                                    // the engine's setSplitGroupWidth carries the clamp.
                                                    const applyPercent = rafThrottle((p: number) =>
                                                        setSplitLayout((prev) => setSplitGroupWidth(prev, p))
                                                    );
                                                    const onMove = (ev: PointerEvent) => {
                                                        if (splitOrientation === "right") {
                                                            const deltaPercent = ((ev.clientX - startX) / rect.width) * 100;
                                                            applyPercent(Math.max(20, Math.min(80, startPercent + deltaPercent)));
                                                        } else {
                                                            const deltaPercent = ((ev.clientY - startY) / rect.height) * 100;
                                                            applyPercent(Math.max(20, Math.min(80, startPercent + deltaPercent)));
                                                        }
                                                    };
                                                    const onUp = () => {
                                                        applyPercent.cancel();
                                                        window.removeEventListener("pointermove", onMove);
                                                        window.removeEventListener("pointerup", onUp);
                                                        document.body.style.cursor = "";
                                                        document.body.style.userSelect = "";
                                                    };
                                                    window.addEventListener("pointermove", onMove);
                                                    window.addEventListener("pointerup", onUp);
                                                    document.body.style.cursor = splitOrientation === "right" ? "col-resize" : "row-resize";
                                                    document.body.style.userSelect = "none";
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                                        e.preventDefault();
                                                        // This handle keeps the group between 20% and 80%.
                                                        setSplitLayout((prev) =>
                                                            setSplitGroupWidth(prev, Math.min(80, prev.groupWidthPercent + 2))
                                                        );
                                                    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                                        e.preventDefault();
                                                        setSplitLayout((prev) =>
                                                            setSplitGroupWidth(prev, Math.max(20, prev.groupWidthPercent - 2))
                                                        );
                                                    }
                                                }}
                                            />
                                            {/* The pane GROUP — one independent pane per split
                        target, laid out along the split axis (row for
                        right / column for down). Round 3: every pane's
                        flex-basis is its PERCENT share (splitPaneSizes)
                        and a FUNCTIONAL resize handle sits between EVERY
                        adjacent pair — the static 1px divider between
                        panes 2..n was decorative only, so 3+ pane splits
                        could not be resized past the first gutter. */}
                                            <div
                                                className={cn(
                                                    "flex-1 min-w-0 min-h-0 bg-muted/10",
                                                    splitOrientation === "right"
                                                        ? "border-l flex flex-row"
                                                        : "border-t flex flex-col"
                                                )}
                                            >
                                                {splitPanes.map((target, paneIndex) => (
                                                    <React.Fragment
                                                        key={`${target.folderSlug}/${target.fileSlug}/${paneIndex}`}>
                                                        {paneIndex > 0 && (
                                                            /* Round 3 — a REAL resize gutter between panes
                                `paneIndex` and `paneIndex + 1`: pointer-drag
                                (rAF-coalesced, clamped by the pure helper)
                                and arrow-key resizing with the same clamps,
                                the same affordances and ARIA contract the
                                FIRST handle (main pane ↔ group) exposes. */
                                                            <div
                                                                role="separator"
                                                                aria-orientation={splitOrientation === "right" ? "vertical" : "horizontal"}
                                                                aria-label={`Resize split panes ${paneIndex} and ${paneIndex + 1}`}
                                                                aria-valuenow={Math.round(splitPaneSizes[paneIndex - 1] ?? 0)}
                                                                aria-valuemin={10}
                                                                aria-valuemax={90}
                                                                tabIndex={0}
                                                                className={cn(
                                                                    "bg-border hover:bg-emerald-500/50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                                                                    splitOrientation === "right"
                                                                        ? "w-1 cursor-col-resize"
                                                                        : "h-1 cursor-row-resize"
                                                                )}
                                                                onPointerDown={(e) => {
                                                                    if (e.pointerType === "mouse" && e.button !== 0) return;
                                                                    e.preventDefault();
                                                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                                                    const group = (e.currentTarget as HTMLElement).parentElement;
                                                                    if (!group) return;
                                                                    const rect = group.getBoundingClientRect();
                                                                    const startX = e.clientX;
                                                                    const startY = e.clientY;
                                                                    const pairIndex = paneIndex - 1;
                                                                    /* The sizes AT THE DRAG START, frozen: every
                                 * pointermove recomputes the next array
                                 * from THIS fixed starting point (absolute
                                 * math — the same discipline the main↔group
                                 * handle uses). Applying the cumulative
                                 * delta through a (prev) => … updater
                                 * instead re-applied it on top of the last
                                 * applied frame EVERY frame — the shares
                                 * accelerated and slammed into the 10%
                                 * floor within one small drag. The engine's
                                 * dragSplitGutterFrom exists to encode
                                 * exactly this frozen-snapshot rule. */
                                                                    const startSizes = splitPaneSizes;
                                                                    // rAF-coalesced share update (one render per frame max).
                                                                    const applySizes = rafThrottle((deltaPercent: number) => {
                                                                        setSplitLayout((prev) =>
                                                                            dragSplitGutterFrom(prev, startSizes, pairIndex, deltaPercent)
                                                                        );
                                                                    });
                                                                    const onMove = (ev: PointerEvent) => {
                                                                        if (splitOrientation === "right") {
                                                                            applySizes(((ev.clientX - startX) / rect.width) * 100);
                                                                        } else {
                                                                            applySizes(((ev.clientY - startY) / rect.height) * 100);
                                                                        }
                                                                    };
                                                                    const onUp = () => {
                                                                        applySizes.cancel();
                                                                        window.removeEventListener("pointermove", onMove);
                                                                        window.removeEventListener("pointerup", onUp);
                                                                        document.body.style.cursor = "";
                                                                        document.body.style.userSelect = "";
                                                                    };
                                                                    window.addEventListener("pointermove", onMove);
                                                                    window.addEventListener("pointerup", onUp);
                                                                    document.body.style.cursor = splitOrientation === "right" ? "col-resize" : "row-resize";
                                                                    document.body.style.userSelect = "none";
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                                                        e.preventDefault();
                                                                        // Keyboard resize goes through the engine's
                                                                        // nudge (same clamps as the drag).
                                                                        setSplitLayout((prev) => nudgeSplitGutter(prev, paneIndex - 1, 2));
                                                                    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                                                        e.preventDefault();
                                                                        setSplitLayout((prev) => nudgeSplitGutter(prev, paneIndex - 1, -2));
                                                                    }
                                                                }}
                                                            />
                                                        )}
                                                        <SplitFilePane
                                                            target={target}
                                                            paneIndex={paneIndex}
                                                            /* This pane's percent share of the group, via
                                the engine — undefined only when the sizes
                            array briefly trails the pane list (the
                                self-healing effect then restores equal
                                flex-1 shares). */
                                                            basisPercent={paneBasisPercent(splitLayout, paneIndex)}
                                                            fileKind={
                                                                folders
                                                                    .find((f) => f.slug === target.folderSlug)
                                                                    ?.files.find((f) => f.slug === target.fileSlug)?.kind ?? "other"
                                                            }
                                                            openTabs={openTabs}
                                                            settings={settings}
                                                            inlineDiagnostics={settings.inlineDiagnostics ? inlineDiagnostics : undefined}
                                                            gitDiffLines={gitDiffLines}
                                                            siblingImages={siblingImages}
                                                            onChangeTarget={(next) => setSplitPaneTarget(paneIndex, next)}
                                                            onClose={() => closeSplitPane(paneIndex)}
                                                            onFocusMain={() => handleOpenFileAt(target.folderSlug, target.fileSlug)}
                                                        />
                                                    </React.Fragment>
                                                ))}
                                                {splitPanes.length === 0 && (
                                                    <div className="flex-1 min-h-0 flex flex-col">
                                                        <EmptyState
                                                            icon={<Columns2 className="size-7"/>}
                                                            title="Split view"
                                                            description="Multi-select editor tabs (Ctrl/Cmd+click) and press Split to open them side by side."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* the resize handle renders for ANY file kind
                while the bottom panel is open (the Notes / Terminal /
                TODOs tabs are file-kind-agnostic). Pointer events
                (covers touch), separator semantics + keyboard arrows,
                blur fallback. */}
                            {bottomPanelOpen && (
                                <div
                                    role="separator"
                                    aria-orientation="horizontal"
                                    aria-label="Resize code and output panels"
                                    aria-valuenow={Math.round(codePanelHeight)}
                                    aria-valuemin={10}
                                    aria-valuemax={90}
                                    tabIndex={0}
                                    className="h-1 cursor-row-resize bg-border hover:bg-emerald-500/50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                    onPointerDown={(e) => {
                                        if (e.pointerType === "mouse" && e.button !== 0) return;
                                        e.preventDefault();
                                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                        const container = e.currentTarget.parentElement;
                                        if (!container) return;
                                        const startY = e.clientY;
                                        const containerHeight = container.getBoundingClientRect().height;
                                        const startPercent = codePanelHeight;
                                        // rAF-coalesced resize (one render per frame max).
                                        const applyPercent = rafThrottle((p: number) => setCodePanelHeight(p));
                                        const onMove = (ev: PointerEvent) => {
                                            const delta = ev.clientY - startY;
                                            const deltaPercent = (delta / containerHeight) * 100;
                                            const newPercent = Math.max(10, Math.min(90, startPercent + deltaPercent));
                                            applyPercent(newPercent);
                                        };
                                        const onUp = () => {
                                            applyPercent.cancel();
                                            window.removeEventListener("pointermove", onMove);
                                            window.removeEventListener("pointerup", onUp);
                                            document.body.style.cursor = "";
                                            document.body.style.userSelect = "";
                                            document.removeEventListener("visibilitychange", onUp);
                                            window.removeEventListener("blur", onUp);
                                        };
                                        document.addEventListener("visibilitychange", onUp);
                                        window.addEventListener("blur", onUp);
                                        window.addEventListener("pointermove", onMove);
                                        window.addEventListener("pointerup", onUp);
                                        document.body.style.cursor = "row-resize";
                                        document.body.style.userSelect = "none";
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            setCodePanelHeight((p) => Math.min(90, p + 2));
                                        } else if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            setCodePanelHeight((p) => Math.max(10, p - 2));
                                        }
                                    }}
                                />
                            )}

                            {/* Output + Diagnostics + Notes pane.
HIDDEN entirely for non-Python files — no placeholder,
no info bar. The FileViewer takes the full code panel.
The region must not exist at all,
so for non-Python files we render nothing.

Also hidden when `bottomPanelOpen` is false (toggled by
View → Toggle bottom panel / ⌘J) so the code viewer gets
the full vertical space.

the panel stays visible for EVERY open file —
the kind-agnostic tabs (Notes / Git Diff / TODOs /
Terminal) are reachable from ANY file — the repo is the repo regardless of which
file is open). The per-kind TAB TRIGGERS below do their
own gating: Output joins Python + the runnable kinds,
Diagnostics / Tests / Console / Plots stay Python-only,
and Notes / Git Diff / TODOs / Terminal render for all.
The isPythonFile effect above falls back to the
Notes/Terminal tab automatically when a Python-only tab
was active on a non-Python file.

Tabs is CONTROLLED (value={bottomTab}) so settings like
defaultBottomTab, autoSwitchToOutputOnRun, and
autoSwitchToDiagnosticsOnError can actually switch tabs
programmatically (see handleRun, the file-change effect,
and DiagnosticsPanel's onError callback below). */}
                            {bottomPanelOpen && (
                                <Tabs
                                    data-tutorial="output-panel"
                                    data-shot-pane="bottom"
                                    value={bottomTab}
                                    onValueChange={(v) => setBottomTab(v as "output" | "background" | "diag" | "notes" | "gitdiff" | "todo" | "tests" | "terminal" | "console" | "plots")}
                                    className={cn(
                                        "flex-1 min-h-0",
                                        // configurable tab placement — the classic
                                        // top row, or a vertical rail on the LEFT (saves a full
                                        // row of vertical space; Settings → Editor → Bottom
                                        // panel tabs position).
                                        settings.bottomTabsPosition === "left" ? "flex flex-row" : "flex flex-col"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "flex items-center gap-1 px-2 py-1.5 bg-muted/30 shrink-0 min-w-0",
                                            settings.bottomTabsPosition === "left"
                                                ? cn(
                                                    "flex-col border-r",
                                                    // icon-only tabs need a much thinner
                                                    // vertical rail (and no horizontal padding).
                                                    settings.bottomTabsIconOnly ? "w-11 px-1" : "w-[104px]"
                                                )
                                                : "border-b"
                                        )}
                                    >
                                        <TabsList
                                            ref={bottomTabsListRef}
                                            className={cn(
                                                "bg-transparent p-0 h-auto gap-1 min-w-0 min-h-0",
                                                // OVERFLOW SAFETY (Round 4 — the "Background Runs
                                                // unclickable" bug): in the LEFT RAIL the list is a
                                                // vertical column, and the shadcn base class carries
                                                // justify-center — meant for horizontal pill rows.
                                                // Centering a 480px tab column inside a 181px rail
                                                // paints tabs ~150px ABOVE the rail (inside the
                                                // editor pane, where the editor intercepts their
                                                // clicks) and past the viewport bottom whenever the
                                                // overflow-y-auto below is not applied — which the
                                                // old gating (only when bottomTabsOverflow measured
                                                // true) made a state race on every tab insertion.
                                                // Two structural fixes, both unconditional in rail
                                                // mode: (1) justify-start — a rail is a list, not a
                                                // centered pill row; (2) overflow-y-auto ALWAYS —
                                                // the scrollbar is invisible anyway, so auto-clip
                                                // with no overflow is a no-op, and clipping can no
                                                // longer depend on the detector re-running. The top
                                                // row keeps the measured gating for its edge fades
                                                // only; auto-x is equally harmless there, so it is
                                                // unconditional too. bottomTabsOverflow now only
                                                // drives the fade masks.
                                                settings.bottomTabsPosition === "left"
                                                    ? "overflow-y-auto justify-start"
                                                    : "overflow-x-auto",
                                                "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                                                settings.bottomTabsPosition === "left" && "flex-col w-full items-stretch",
                                                // in the vertical rail the stretched
                                                // triggers CENTER their icon+label (the shadcn
                                                // TabsTrigger default) — but the labels read
                                                // better "indented to the left, not centered".
                                                // Force justify-start on the named triggers; the
                                                // icon-only variant keeps its centered square
                                                // (w-7 does not stretch, so this selector never
                                                // touches its look).
                                                settings.bottomTabsPosition === "left" && !settings.bottomTabsIconOnly && "[&>button]:justify-start"
                                            )}
                                            style={bottomTabsMask
                                                ? {maskImage: bottomTabsMask, WebkitMaskImage: bottomTabsMask}
                                                : undefined}
                                        >
                                            {/* with bottomTabsIconOnly the triggers show
ICONS ONLY (tooltips + aria-labels keep the names;
the running-dot / dirty-count badges stay) — icon-only
mode saves vertical space. Toggle here or in
Settings → Editor → Bottom panel tab labels. */}
                                            {/* Output is Python-only — hidden for
                      non-Python files ("if non py file is opened then the
                      output … should disappear automatically").
 RUNNABLE kinds keep it — their runs
                      stream into it through the language runtimes. */}
                                            {(isPythonFile || isRunnableKind(selectedFile?.kind)) && (
                                                <TabsTrigger
                                                    value="output"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Output"
                                                    title={settings.bottomTabsIconOnly ? "Output" : undefined}
                                                >
                                                    <Terminal className="size-3.5 shrink-0"/>
                                                    {/* translated label (i18n: tabOutput) — English fallback. */}
                                                    {!settings.bottomTabsIconOnly && <span>{t("tabOutput")}</span>}
                                                    {isRunning && (
                                                        <span
                                                            className="size-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                                                    )}
                                                </TabsTrigger>
                                            )}
                                            {/* ── the BACKGROUND RUNS tab (between Output
and Diagnostics). Appears whenever a demoted run exists
(the Plots / Git Diff gating pattern), carries the live
count, and pulses while any of them still streams. */}
                                            {backgroundRuns.length > 0 && (
                                                <TabsTrigger
                                                    value="background"
                                                    className={cn(
                                                        "relative text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label={`Background Runs (${backgroundRuns.length} demoted)`}
                                                    title={settings.bottomTabsIconOnly ? `Background runs (${backgroundRuns.length})` : "Runs demoted by a newer Run — they keep streaming here; Output stays pure for the open file"}
                                                >
                                                    <Layers className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Background Runs</span>}
                                                    <span className={cn(
                                                        "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-medium tabular-nums",
                                                        settings.bottomTabsIconOnly && "absolute -top-1 -right-1 min-w-4 h-4"
                                                    )}>
                      {backgroundRuns.length}
                    </span>
                                                    {backgroundRuns.some((b) => b.result?.isStreaming) && (
                                                        <span
                                                            className="size-1.5 rounded-full bg-amber-500 animate-pulse"/>
                                                    )}
                                                </TabsTrigger>
                                            )}
                                            {/* Diagnostics is Python-only (lint /
                      typecheck on .py files). */}
                                            {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                                                <TabsTrigger
                                                    value="diag"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Diagnostics"
                                                    title={settings.bottomTabsIconOnly ? "Diagnostics" : undefined}
                                                >
                                                    <Wrench className="size-3.5 shrink-0"/>
                                                    {/* translated label (i18n: tabDiag) — English fallback. */}
                                                    {!settings.bottomTabsIconOnly && <span>{t("tabDiag")}</span>}
                                                </TabsTrigger>
                                            )}
                                            {settings.enableScriptNotes && selectedFileSlug && (
                                                <TabsTrigger
                                                    value="notes"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Notes"
                                                    title={settings.bottomTabsIconOnly ? "Notes" : undefined}
                                                >
                                                    <StickyNote className="size-3.5 shrink-0"/>
                                                    {/* translated label (i18n: tabNotes) — English fallback. */}
                                                    {!settings.bottomTabsIconOnly && <span>{t("tabNotes")}</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* Git Diff tab — file-kind-agnostic (it
                      diffs the whole repo, which includes .md / .tex
                      edits); shown whenever there are uncommitted
 changes to browse. for non-Python files
                      the visible set is Notes + Terminal only, so the
                      Git Diff trigger joins the Python-only set. */}
                                            {/* Git Diff for EVERY open file — python or not (user:
"Git Diff / TODOs is appearing with py files only why?
i said non-py files also … specially the coding like
java c etc.") — the repo is the repo regardless of
which file is open, so the trigger follows
gitDirtyCount alone. */}
                                            {gitDirtyCount > 0 && (
                                                <TabsTrigger
                                                    value="gitdiff"
                                                    className={cn(
                                                        "relative text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label={`Git Diff (${gitDirtyCount} modified)`}
                                                    title="Side-by-side diff of every modified file"
                                                >
                                                    <GitCompare className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Git Diff</span>}
                                                    <span className={cn(
                                                        "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-medium",
                                                        settings.bottomTabsIconOnly && "absolute -top-1 -right-1 min-w-4 h-4"
                                                    )}>
                        {gitDirtyCount}
                      </span>
                                                </TabsTrigger>
                                            )}
                                            {/* ─── file-kind-agnostic tabs ──────────
                      TODO / Tests / Terminal render for ANY open file
                      (and the panel itself stays visible with them —
 see the wrapper condition above). for
                      non-Python files the visible set is exactly Notes
                      + Terminal ("only notes and terminal should be
                      active in non-py files"), so TODOs is Python-only
                      now too. */}
                                            {/* TODOs for EVERY open file — python or not (user:
"they are usable for non-py specially the coding
like java c etc.") — the scanner walks every text
kind (java / c / js / ts / shell / ruby …). */}
                                            <TabsTrigger
                                                value="todo"
                                                className={cn(
                                                    "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                    settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                )}
                                                aria-label="TODOs"
                                                title={settings.bottomTabsIconOnly ? "TODO / FIXME markers across the project" : undefined}
                                            >
                                                <ListTodo className="size-3.5 shrink-0"/>
                                                {/* translated label (i18n: tabTodos) — English fallback. */}
                                                {!settings.bottomTabsIconOnly && <span>{t("tabTodos")}</span>}
                                            </TabsTrigger>
                                            {/* Tests is Python-only — hidden for
                      non-Python files. */}
                                            {isPythonFile && (
                                                <TabsTrigger
                                                    value="tests"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Tests"
                                                    title={settings.bottomTabsIconOnly ? "Whole-project test report" : undefined}
                                                >
                                                    <FlaskConical className="size-3.5 shrink-0"/>
                                                    {/* translated label (i18n: tabTests) — English fallback. */}
                                                    {!settings.bottomTabsIconOnly && <span>{t("tabTests")}</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* — the persistent Python console (Console
                      mode): a Jupyter-style REPL whose namespace
                      survives every submission. Python-only (like
                      Output). */}
                                            {isPythonFile && (
                                                <TabsTrigger
                                                    value="console"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Console"
                                                    title={settings.bottomTabsIconOnly ? "Persistent Python console — state survives every submission" : undefined}
                                                >
                                                    <SquareTerminal className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Console</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* Plots: the persistent cross-run
                      figure gallery. Every matplotlib figure from any
                      run (primary or background) lands here and stays
                      across tab/file switches and reloads. The tab
                      appears once the gallery is non-empty (like the
                      Git Diff tab's dirty-count gating) and carries a
                      count badge so a new figure is noticeable. */}
                                            {isPythonFile && plotGallery.length > 0 && (
                                                <TabsTrigger
                                                    value="plots"
                                                    className={cn(
                                                        "relative text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label={`Plots (${plotGallery.length} captured)`}
                                                    title={settings.bottomTabsIconOnly ? "Captured figure gallery — zoom, export, delete" : undefined}
                                                >
                                                    <ChartLine className="size-3.5 shrink-0"/>
                                                    {/* translated label (i18n: tabPlots) — English fallback. */}
                                                    {!settings.bottomTabsIconOnly && <span>{t("tabPlots")}</span>}
                                                    <span className={cn(
                                                        "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-medium tabular-nums",
                                                        settings.bottomTabsIconOnly && "absolute -top-1 -right-1 min-w-4 h-4"
                                                    )}>
                      {plotGallery.length}
                    </span>
                                                </TabsTrigger>
                                            )}
                                            <TabsTrigger
                                                value="terminal"
                                                className={cn(
                                                    "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                    settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                )}
                                                aria-label="Terminal"
                                                title={settings.bottomTabsIconOnly ? "Integrated terminal (⌘`)" : undefined}
                                            >
                                                <TerminalSquare className="size-3.5 shrink-0"/>
                                                {/* translated label (i18n: tabTerminal) — English fallback. */}
                                                {!settings.bottomTabsIconOnly && <span>{t("tabTerminal")}</span>}
                                            </TabsTrigger>
                                            {/* ── Tasks (Task Runner) — npm scripts / Makefile /
                      justfile / pyproject targets, always available
                      while a folder is open. */}
                                            {selectedFolderSlug && (
                                                <TabsTrigger
                                                    value="tasks"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Tasks"
                                                    title={settings.bottomTabsIconOnly ? "Task runner — npm scripts, Makefile / justfile / pyproject targets" : undefined}
                                                >
                                                    <ListTodo className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Tasks</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* ── Variables — the kernel-attached live variable
                      explorer (Python only, like the Console). */}
                                            {isPythonFile && (
                                                <TabsTrigger
                                                    value="variables"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Variables"
                                                    title={settings.bottomTabsIconOnly ? "Live variable explorer — kernel namespace, drill-down, watch pins" : undefined}
                                                >
                                                    <Variable className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Variables</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* ── Async — the asyncio task inspector (Python files,
                      next to the debug controls: task tree, awaiting
                      chains, per-task stacks, swallowed-cancellation
                      highlight). */}
                                            {isPythonFile && (
                                                <TabsTrigger
                                                    value="async"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Async"
                                                    title={settings.bottomTabsIconOnly ? "Async task inspector — live asyncio task tree, await chains, per-task stacks" : undefined}
                                                >
                                                    <Activity className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Async</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* ── Replay — the time-travel debugger (Python). */}
                                            {isPythonFile && (
                                                <TabsTrigger
                                                    value="replay"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Record & Replay"
                                                    title={settings.bottomTabsIconOnly ? "Time-travel debugger — record once, scrub anywhere, watchpoint history" : undefined}
                                                >
                                                    <History className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Replay</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* ── Tutor — the memory-model step-through (Python). */}
                                            {isPythonFile && (
                                                <TabsTrigger
                                                    value="tutor"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Tutor View"
                                                    title={settings.bottomTabsIconOnly ? "Tutor view — stack + heap + narration per step" : undefined}
                                                >
                                                    <BookOpen className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Tutor</span>}
                                                </TabsTrigger>
                                            )}
                                            {/* ── Preview — the live web preview (any folder). */}
                                            {selectedFolderSlug && (
                                                <TabsTrigger
                                                    value="preview"
                                                    className={cn(
                                                        "text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm",
                                                        settings.bottomTabsIconOnly ? "h-7 w-7 px-0 justify-center flex-none" : "h-7 px-2.5 gap-1.5 flex-none"
                                                    )}
                                                    aria-label="Live Preview"
                                                    title={settings.bottomTabsIconOnly ? "Live web preview — hot reload, device presets, browser console" : undefined}
                                                >
                                                    <PanelTop className="size-3.5 shrink-0"/>
                                                    {!settings.bottomTabsIconOnly && <span>Preview</span>}
                                                </TabsTrigger>
                                            )}
                                        </TabsList>
                                        {/* NO spacer — the icon-toggle and the collapse button
                    sit right NEXT TO the tab labels (stacked beneath the
                    strip in the vertical rail, right after it in the top
                    row), both OUTSIDE the scroll region so they never
                    ride along with the scroll or drift to the far edge. */}
                                        {/* icon-only tab toggle — flips the persisted
                    bottomTabsIconOnly setting (also in Settings →
                    Editor). In the vertical rail it stacks under the
                    tabs; in the top row it sits by the collapse button. */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={cn("size-6 shrink-0", settings.bottomTabsPosition === "left" && "mt-1")}
                                            onClick={() => {
                                                setSettings((prev) => {
                                                    const next = {
                                                        ...prev,
                                                        bottomTabsIconOnly: !prev.bottomTabsIconOnly
                                                    };
                                                    saveSettings(next);
                                                    return next;
                                                });
                                            }}
                                            aria-pressed={settings.bottomTabsIconOnly}
                                            aria-label={settings.bottomTabsIconOnly ? "Show tab names (icon + name)" : "Show icons only (hide tab names)"}
                                            title={settings.bottomTabsIconOnly ? "Tab labels: icons only — click to show names too" : "Tab labels: icon + name — click for icons only (saves space)"}
                                        >
                                            <CaseSensitive
                                                className={cn("size-3.5", !settings.bottomTabsIconOnly && "text-emerald-500")}/>
                                        </Button>
                                        {/* Collapse-bottom-panel button — hides the Output /
                    Diagnostics / Notes panel so the code viewer gets
                    the full vertical space. The collapsed rail at the
                    bottom of the main area carries an expand button. */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 shrink-0"
                                            onClick={() => setBottomPanelOpen(false)}
                                            aria-label="Collapse bottom panel"
                                            title="Collapse bottom panel (⌘J) — click the rail at the bottom edge to expand"
                                        >
                                            <PanelBottomClose className="size-3.5"/>
                                        </Button>
                                    </div>

                                    {/* Output tab — always rendered (forceMount) so the
                  streaming SSE state survives tab switches. Hidden
                  via data-[state=inactive] when not selected.
 Python-only (matches the tab trigger).
 every RUNNABLE kind joins — JS / TS /
                  MATLAB / R / shell / Java / C / C++ runs stream into
                  this exact panel through their own runtimes. */}
                                    {(isPythonFile || isRunnableKind(selectedFile?.kind)) && (
                                        <TabsContent
                                            value="output"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 overflow-auto p-3 min-h-0 mt-0 outline-none"
                                        >
                                            <PanelErrorBoundary label="Output">
                                                <OutputPanel
                                                    tabsPosition={settings.bottomTabsPosition}
                                                    result={runResult}
                                                    /* the running view is PER-FILE — only the
file whose run is live shows "Running script…";
other files show their own cached/finished output. */
                                                    isRunning={selectedFileRunning}
                                                    fileName={selectedFile?.name}
                                                    runId={selectedFileRunId}
                                                    /* The panel's Stop button routes through the
                     selection-aware stopper (works pre-runId too). */
                                                    onStop={handleStopSelected}
                                                    previousResult={pinnedBaseline ?? previousRunResult}
                                                    onExportMd={handleExportMd}
                                                    onExportIpynb={handleExportIpynb}
                                                    onExportHtml={handleExportHtml}
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    onPinBaseline={handlePinBaseline}
                                                    isPinned={!!pinnedBaseline}
                                                    aiEndpoints={settings.aiEndpoints}
                                                    sourceCode={code?.content}
                                                    scriptFileName={selectedFile?.name}
                                                    coverageFailUnder={settings.coverageFailUnder ?? 0}
                                                    coverageBranch={settings.coverageBranch === true}
                                                    aiQuestionTemplate={settings.aiQuestionTemplate}
                                                    outputSearchEnabled={settings.outputSearchEnabled}
                                                    collapsibleOutput={settings.collapsibleOutput}
                                                    outputWordWrap={settings.outputWordWrap}
                                                    outputBufferLimit={settings.outputBufferLimit}
                                                    /* backgroundRuns / onDismissBackgroundRun /
onStopBackgroundRun are GONE — the demoted runs
render in the dedicated "Background Runs" tab
below, so this panel stays PURE for the open
file's run. */
                                                    focusRunToken={focusRunToken}
                                                    /* the interactive stdin row only makes sense
for runs whose stdin was kept OPEN — when the user
turned interactive stdin off (Settings → Advanced),
sending would just 409, so the row stays hidden. */
                                                    onSendStdin={settings.interactiveStdin !== false ? handleSendStdin : undefined}
                                                    onSendStdinEof={settings.interactiveStdin !== false ? handleSendStdinEof : undefined}
                                                    onExplainTraceback={sendAiPrompt}
                                                    /* run-hints bar: "missing: X.csv" lines in the run's own
                     output get the folder's data-files browser in one
                     click (the same dialog the Explorer's per-folder
                     "Browse data files" action opens). */
                                                    onOpenDataFiles={handleOpenDataFiles}
                                                />
                                            </PanelErrorBoundary>
                                        </TabsContent>
                                    )}

                                    {/* ── the BACKGROUND RUNS content tab ──────
                  Every demoted run (still-streaming or finished-but-
                  undismissed) as a BackgroundRunGroup, plus the
                  one-line explainer. This tab is file-kind-agnostic:
                  demoted runs keep streaming across file switches. */}
                                    {backgroundRuns.length > 0 && (
                                        <TabsContent
                                            value="background"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 overflow-auto p-3 min-h-0 mt-0 outline-none"
                                        >
                                            <div className="rounded-xl border bg-card/60 overflow-hidden">
                                                <div
                                                    className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-wrap">
                                                    <Layers className="size-4 shrink-0 text-amber-500"/>
                                                    <span className="text-sm font-medium text-foreground">Background Runs</span>
                                                    <span className="text-xs text-muted-foreground">
                      {backgroundRuns.filter((b) => b.result?.isStreaming).length > 0
                          ? `${backgroundRuns.filter((b) => b.result?.isStreaming).length} still streaming · `
                          : ""}
                                                        {backgroundRuns.length} total — started before the latest Run; Output stays pure for the open file
                    </span>
                                                    <span className="flex-1"/>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 gap-1.5 text-xs"
                                                        onClick={() => {
                                                            backgroundRuns
                                                                .filter((b) => b.result?.isStreaming && b.runId)
                                                                .forEach((b) => handleStop(b.runId as string));
                                                        }}
                                                        disabled={!backgroundRuns.some((b) => b.result?.isStreaming && b.runId)}
                                                        title="Stop every still-streaming background run"
                                                    >
                                                        <Square className="size-3.5"/> Stop All
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 gap-1.5 text-xs"
                                                        onClick={() => setBackgroundRuns([])}
                                                        title="Dismiss every background run group (the runs themselves stay in the Run history)"
                                                    >
                                                        <X className="size-3.5"/> Dismiss All
                                                    </Button>
                                                </div>
                                                <div className="p-3 space-y-1.5">
                                                    {backgroundRuns.map((b) => (
                                                        <BackgroundRunGroup
                                                            key={b.key}
                                                            run={b}
                                                            onDismiss={(key) =>
                                                                setBackgroundRuns((prev) => prev.filter((r) => r.key !== key))
                                                            }
                                                            onStop={(runId) => handleStop(runId)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </TabsContent>
                                    )}

                                    {/* Diagnostics content — Python-only. */}
                                    {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                                        <TabsContent
                                            value="diag"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 overflow-auto p-3 min-h-0 mt-0 outline-none"
                                        >
                                            <PanelErrorBoundary label="Diagnostics">
                                                <DiagnosticsPanel
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    fileName={selectedFile?.name ?? ""}
                                                    onError={() => {
                                                        // Auto-switch to the Diagnostics tab when a lint
                                                        // or typecheck finishes with errors (Settings →
                                                        // Advanced). Only fires when the setting is on.
                                                        if (settings.autoSwitchToDiagnosticsOnError) {
                                                            setBottomTab("diag");
                                                        }
                                                    }}
                                                    // "Fix with AI" per diagnostic row + the
                                                    // profiling heatmap feed.
                                                    onAiFix={handleAiFixDiagnostic}
                                                    onAiFixAll={handleAiFixAll}
                                                    onProfileResult={(lines) =>
                                                        handleProfileResult(lines, selectedFile?.name)
                                                    }
                                                />
                                            </PanelErrorBoundary>
                                        </TabsContent>
                                    )}
                                    {settings.enableScriptNotes && selectedFileSlug && (
                                        <TabsContent
                                            value="notes"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 overflow-auto p-3 min-h-0 mt-0 outline-none"
                                        >
                                            <ScriptNotes
                                                folderSlug={selectedFolderSlug}
                                                fileSlug={selectedFileSlug}
                                                fileName={selectedFile?.name ?? ""}
                                            />
                                        </TabsContent>
                                    )}
                                    {/* Git Diff tab content — side-by-side diff view of every
 modified file. file-kind-agnostic (same gate
                  as the tab trigger). forceMount so the panel's internal
                  state survives tab switches; hidden via
                  data-[state=inactive] when not selected. */}
                                    {gitDirtyCount > 0 && (
                                        <TabsContent
                                            value="gitdiff"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 min-h-0 mt-0 outline-none overflow-hidden p-2"
                                        >
                                            <PanelErrorBoundary label="Git diff">
                                                <GitDiffPanel
                                                    entries={gitStatusEntries}
                                                    loading={gitStatusLoading}
                                                    onRefresh={() => {
                                                        void fetchGitStatus();
                                                    }}
                                                    onCommitted={() => {
                                                        // Re-fetch git-status — updates gitStatusEntries
                                                        // (the panel's props), the derived gitStatusMap,
                                                        // the dirty count and the Footer's git chip in one
                                                        // request (this used to trigger a second
                                                        // fetch inside the panel as well).
                                                        void fetchGitStatus();
                                                    }}
                                                />
                                            </PanelErrorBoundary>
                                        </TabsContent>
                                    )}
                                    {/* ─── TODO / Terminal tab contents ────────
                  File-kind-agnostic — rendered regardless of the open
                  file's type (forceMount keeps the terminal session +
                  the scan results alive across tab switches). Tests is
                  Python-only (gated above). */}
                                    <TabsContent
                                        value="todo"
                                        forceMount
                                        className="data-[state=inactive]:hidden flex-1 min-h-0 mt-0 outline-none overflow-hidden"
                                    >
                                        <PanelErrorBoundary label="TODOs">
                                            <TodoPanel
                                                active={bottomTab === "todo"}
                                                refreshNonce={todoNonce}
                                                onOpenFile={(folder, file, line) =>
                                                    handleOpenFileAt(folder, file, line)
                                                }
                                            />
                                        </PanelErrorBoundary>
                                    </TabsContent>
                                    {isPythonFile && (
                                        <TabsContent
                                            value="tests"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 min-h-0 mt-0 outline-none overflow-hidden"
                                        >
                                            <PanelErrorBoundary label="Tests">
                                                <TestsPanel
                                                    report={testAllReport}
                                                    onRun={() => void handleRunAllTests()}
                                                    onRunWithCoverage={() => menuRunWithCoverage()}
                                                    onOpenFile={(folder, file, line) =>
                                                        handleOpenFileAt(folder, file, line)
                                                    }
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    fileName={selectedFile?.name}
                                                    code={codeViewerRef.current?.getBuffer() ?? code?.content}
                                                    hypothesisEnabled={settings.hypothesisEnabled !== false}
                                                    onInsertTest={(src) => {
                                                        setInsertSnippet({content: src, nonce: Date.now()});
                                                        toast({
                                                            title: "Test inserted",
                                                            description: "The generated test source landed in the editor buffer — save to write it."
                                                        });
                                                    }}
                                                />
                                            </PanelErrorBoundary>
                                        </TabsContent>
                                    )}
                                    {/* — the persistent Python console. forceMount
                  keeps the kernel session + scrollback alive across tab
                  switches. getActiveSource prefers the LIVE edit buffer
                  (unsaved edits included) via the CodeViewer handle. */}
                                    {isPythonFile && (
                                        <TabsContent
                                            value="console"
                                            forceMount
                                            className="data-[state=inactive]:hidden flex-1 min-h-0 mt-0 outline-none overflow-hidden"
                                        >
                                            <PanelErrorBoundary label="Console">
                                                <ConsolePanel
                                                    active={bottomTab === "console"}
                                                    getActiveSource={() => codeViewerRef.current?.getBuffer() ?? code?.content ?? null}
                                                    fileName={selectedFile?.name}
                                                    interpreter={settings.pythonInterpreter || undefined}
                                                    timeoutSeconds={settings.runTimeoutSeconds}
                                                />
                                            </PanelErrorBoundary>
                                        </TabsContent>
                                    )}
                                    {/* Plots: the persistent figure gallery.
                  forceMount would keep ALL captured <img> elements in
                  the DOM forever; this tab renders only when selected
                  (no forceMount) — cheap to re-enter, state lives in
                  page.tsx anyway. */}
                                    {isPythonFile && plotGallery.length > 0 && (
                                        <TabsContent
                                            value="plots"
                                            className="flex-1 min-h-0 mt-0 outline-none overflow-hidden"
                                        >
                                            <PanelErrorBoundary label="Plots">
                                                <PlotsPanel
                                                    plots={plotGallery}
                                                    active={bottomTab === "plots"}
                                                    onRemove={removePlot}
                                                    onClear={clearPlots}
                                                />
                                            </PanelErrorBoundary>
                                        </TabsContent>
                                    )}
                                    <TabsContent
                                        value="terminal"
                                        forceMount
                                        className="data-[state=inactive]:hidden flex-1 min-h-0 mt-0 outline-none overflow-hidden"
                                    >
                                        <PanelErrorBoundary label="Terminal">
                                            <TerminalPanel
                                                active={bottomTab === "terminal"}
                                            />
                                        </PanelErrorBoundary>
                                    </TabsContent>

                                    {/* ── Tasks (Task Runner) ── */}
                                    <TabsContent value="tasks"
                                                 className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                                        {selectedFolder && (
                                            <div className="h-full min-h-0 flex flex-col overflow-hidden">
                                                <TasksPanelContent
                                                    folderSlug={selectedFolder.slug}
                                                    folderName={selectedFolder.name}
                                                />
                                            </div>
                                        )}
                                    </TabsContent>
                                    {/* ── Variables (kernel-attached live explorer) ── */}
                                    <TabsContent value="variables"
                                                 className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
                                                 forceMount>
                                        {isPythonFile && selectedFolderSlug && selectedFileSlug ? (
                                            <div className="h-full min-h-0 flex flex-col overflow-hidden">
                                                <VariableExplorer
                                                    active={bottomTab === "variables"}
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    fileName={selectedFile?.name ?? ""}
                                                    consoleSessionId={consoleSessionId}
                                                    interpreter={settings.pythonInterpreter || undefined}
                                                />
                                            </div>
                                        ) : null}
                                    </TabsContent>
                                    {/* ── Async (asyncio task inspector — the kernel's live
                    task tree with awaiting chains and per-task stacks) ── */}
                                    <TabsContent value="async"
                                                 className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
                                                 forceMount>
                                        {isPythonFile ? (
                                            <div className="h-full min-h-0 flex flex-col overflow-hidden">
                                                <AsyncTaskPanel
                                                    active={bottomTab === "async"}
                                                    consoleSessionId={consoleSessionId}
                                                />
                                            </div>
                                        ) : null}
                                    </TabsContent>
                                    {/* ── Replay (time-travel debugger) ── */}
                                    <TabsContent value="replay"
                                                 className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
                                                 forceMount>
                                        {isPythonFile && selectedFolderSlug && selectedFileSlug ? (
                                            <div className="h-full min-h-0 flex flex-col overflow-hidden">
                                                <TimeTravelDebugger
                                                    active={bottomTab === "replay"}
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    fileName={selectedFile?.name ?? ""}
                                                    code={codeViewerRef.current?.getBuffer() ?? code?.content}
                                                    onGoToLine={(line) => codeViewerRef.current?.jumpToLine(line)}
                                                />
                                            </div>
                                        ) : null}
                                    </TabsContent>
                                    {/* ── Tutor (memory-model step-through) ── */}
                                    <TabsContent value="tutor"
                                                 className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
                                                 forceMount>
                                        {isPythonFile && selectedFolderSlug && selectedFileSlug ? (
                                            <div className="h-full min-h-0 flex flex-col overflow-hidden">
                                                <TutorView
                                                    active={bottomTab === "tutor"}
                                                    folderSlug={selectedFolderSlug}
                                                    fileSlug={selectedFileSlug}
                                                    fileName={selectedFile?.name ?? ""}
                                                    code={codeViewerRef.current?.getBuffer() ?? code?.content}
                                                    onGoToLine={(line) => codeViewerRef.current?.jumpToLine(line)}
                                                />
                                            </div>
                                        ) : null}
                                    </TabsContent>
                                    {/* ── Live web preview ── */}
                                    <TabsContent value="preview"
                                                 className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                                        {selectedFolderSlug ? (
                                            <div className="h-full min-h-0 flex flex-col overflow-hidden">
                                                <LivePreviewPanel
                                                    active={bottomTab === "preview"}
                                                    folderSlug={selectedFolderSlug}
                                                    entryFile={selectedFile?.name?.endsWith(".html") ? selectedFile.name : undefined}
                                                    fileName={selectedFile?.name}
                                                />
                                            </div>
                                        ) : null}
                                    </TabsContent></Tabs>
                            )}
                            {/* Collapsed bottom-panel rail — when the bottom panel is
hidden (View → Toggle bottom panel / ⌘J), show a thin
horizontal bar with an expand button. If a run has
produced output, also show a "N bytes hidden" hint so
the user knows where their output went. This replaces
the old amber banner — the rail is always visible
(even with no run) so the user always has a way to
bring the panel back. */}
                            {/* the collapsed rail renders for ANY file kind —
                it is the way back into the panel (Terminal / TODOs /
                Notes) for non-Python files too. */}
                            {!bottomPanelOpen && (
                                <div className="shrink-0 border-t bg-card/60 flex items-center gap-2 px-2 h-7 text-xs">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-5"
                                        onClick={() => setBottomPanelOpen(true)}
                                        aria-label="Show bottom panel"
                                        title="Show the Output / Diagnostics / Notes panel (⌘J)"
                                    >
                                        <ChevronDown className="size-3.5"/>
                                    </Button>
                                    <span className="text-[10px] text-muted-foreground truncate">
                  {runResult
                      ? `Output hidden — last run produced ${runResult.stdout.length + runResult.stderr.length} bytes.`
                      : "Output panel hidden."}
                </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar — mobile (slide-in Sheet). Built on the shadcn Sheet
            primitive (Radix Dialog) so it gets proper dialog semantics
            (role="dialog", aria-modal, focus trap, Escape-to-close,
            focus restoration) — the previous hand-rolled overlay had
            none of these. */}
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetContent
                        side="left"
                        className="lg:hidden w-64 sm:w-72 p-0 gap-0"
                        aria-describedby="mobile-sidebar-desc"
                    >
                        <SheetHeader className="sr-only">
                            <SheetTitle>File Tree</SheetTitle>
                            <SheetDescription id="mobile-sidebar-desc">
                                Browse folders and scripts. Click a file to open it.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="h-full">
                            <FolderTree
                                folders={folders}
                                loading={foldersLoading}
                                error={foldersError}
                                selectedFolderSlug={selectedFolderSlug}
                                selectedFileSlug={selectedFileSlug}
                                onSelectFile={(c, f) => {
                                    // guarded switch.
                                    guardedSelectFile(c, f, {afterSwitch: () => setSidebarOpen(false)});
                                }}
                                onRefresh={refreshFolders}
                                favorites={favorites}
                                onToggleFavorite={toggleFavorite}
                                showRecentFiles={settings.showRecentFiles}
                                recentFilesCount={settings.recentFilesCount}
                                favHighlightSeconds={settings.favHighlightSeconds}
                                pythonInterpreter={settings.pythonInterpreter}
                                onFormatFile={treeStFormatFile}
                                sortMode={sortMode}
                                showHidden={settings.explorerShowHidden}
                                onToggleSort={() => setSortMode((m) => (m === "alpha" ? "mtime" : "alpha"))}
                                gitStatusMap={gitStatusMap}
                                showFileSize={settings.showFileSizeInDropdown}
                                showFolderSize={settings.showFolderSize}
                                showTags={settings.explorerShowTags !== false}
                                onDataFileBrowserOpen={() => setDataFileBrowserOpen(true)}
                                showLastRunStatus={settings.showLastRunStatusInDropdown}
                                lastRunStatus={lastRunStatusMap}
                                projects={projects}
                                activeProject={activeProject}
                                onSelectProject={treeStSelectProject}
                                onUploadZip={() => document.getElementById("zip-upload-input")?.click()}
                                uploadingZip={uploadingZip}
                                onOpenFolderPicker={() => {
                                    setSidebarOpen(false);
                                    setFolderPickerOpen(true);
                                }}
                                onProjectCreated={treeStProjectCreated}
                                onFilesImported={(_folderSlug, _fileNames) => {
                                    // Folder tree refreshes itself; nothing extra to do.
                                }}
                                onFileDeleted={(_folderSlug, deletedFileSlug) => {
                                    if (deletedFileSlug === selectedFileSlug) {
                                        setSelectedFileSlug("");
                                        setActiveTabId(null);
                                    }
                                    setOpenTabs((prev) => prev.filter((t) => t.fileSlug !== deletedFileSlug));
                                }}
                                onFileRenamed={(_folderSlug, oldSlug, newSlug) => {
                                    if (oldSlug === selectedFileSlug) {
                                        setSelectedFileSlug(newSlug);
                                    }
                                    setOpenTabs((prev) => prev.map((t) => t.fileSlug === oldSlug ? {
                                        ...t,
                                        fileSlug: newSlug
                                    } : t));
                                }}
                                onOpenFolder={(_folderSlug, _fileSlug) => {
                                    handleOpenFolder();
                                }}
                                onDownloadFile={(folderSlug, fileSlug) => {
                                    const url = `/api/download?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`;
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = "";
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                }}
                                onFolderDeleted={(folderSlug) => {
                                    if (folderSlug === selectedFolderSlug) {
                                        setSelectedFolderSlug("");
                                        setSelectedFileSlug("");
                                        setActiveTabId(null);
                                    }
                                    setOpenTabs((prev) => prev.filter((t) => t.folderSlug !== folderSlug));
                                }}
                                onFolderRenamed={(oldSlug, _newName) => {
                                    if (oldSlug === selectedFolderSlug) {
                                        setSelectedFolderSlug("");
                                        setSelectedFileSlug("");
                                        setActiveTabId(null);
                                    }
                                    setOpenTabs((prev) => prev.filter((t) => t.folderSlug !== oldSlug));
                                }}
                                onFolderCreated={(_folderSlug, _folderName) => {
                                    // Selection-only; FolderTree refreshed the tree .
                                }}
                                onFileCreated={(folderSlug, fileSlug, _fileName) => {
                                    setSelectedFolderSlug(folderSlug);
                                    setSelectedFileSlug(fileSlug);
                                }}
                                onCreateExample={(exampleId, folderSlug, sub) => {
                                    void handleCreateExample(exampleId, folderSlug, sub);
                                }}
                                onFileDuplicated={(_folderSlug, _newSlug, _newName) => {
                                    // Selection-only; FolderTree refreshed the tree .
                                }}
                                onFileMoved={(oldFolderSlug, oldFileSlug, newFolderSlug, newFileSlug, _newName) => {
                                    if (oldFolderSlug === selectedFolderSlug && oldFileSlug === selectedFileSlug) {
                                        setSelectedFolderSlug(newFolderSlug);
                                        setSelectedFileSlug(newFileSlug);
                                    }
                                    setOpenTabs((prev) => prev.map((t) =>
                                        t.folderSlug === oldFolderSlug && t.fileSlug === oldFileSlug
                                            ? {...t, folderSlug: newFolderSlug, fileSlug: newFileSlug}
                                            : t
                                    ));
                                }}
                                onFileCopied={(_fromFolderSlug, _fromFileSlug, _toFolderSlug, _newSlug, _newName) => {
                                    // Selection-only; FolderTree refreshed the tree .
                                }}
                                // Explorer right-click Run actions (F7 / F8) — mobile drawer.
                                onRunFile={treeStRunFile}
                                onRunAllInFolder={treeStRunAllInFolder}
                                onAiPrompt={sendAiPrompt}
                                onGenerateTestsForFile={(folderSlug, fileSlug, fileName) =>
                                    void handleGenerateTests(folderSlug, fileSlug, fileName)}
                            />
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            <Footer
                showCursor={settings.showCursorPositionInFooter}
                showCounts={settings.showWordCountInFooter}
                folderName={selectedFolder?.name}
                fileName={selectedFile?.name}
                fileSize={selectedFile?.size}
                isPythonFile={isPythonFile}
                indentWidth={settings.editorIndentWidth}
                gitBranch={gitBranch}
                gitDirtyCount={gitDirtyCount}
                folderSlug={selectedFolderSlug}
                pythonInterpreter={settings.pythonInterpreter || null}
                onPinnedInterpreter={handlePinnedInterpreter}
                onOpenDependencyManager={() => setDepManagerOpen(true)}
                projectName={
                    activeProject
                        ? projects.find((p) => p.path === activeProject)?.name ?? "Custom"
                        : "Default"
                }
                running={isRunning}
                dirty={activeTabId ? (openTabs.find((t) => t.id === activeTabId)?.dirty ?? false) : false}
                onBranchChanged={() => {
                    // a branch switch can change the files on disk —
                    // refresh both the git status AND the tree (one coalesced
                    // refresh; the tree refresh also re-reads the open file).
                    void fetchGitStatus();
                    refreshFolders();
                }}
            />

            {/* Search dialog */}
            <SearchDialog
                open={searchOpen}
                onOpenChange={setSearchOpen}
                folders={folders}
                fullTextByDefault={settings.fullTextSearchByDefault}
                currentFolderSlug={selectedFolderSlug}
                currentFileSlug={selectedFileSlug}
                onSelect={(c, f) => {
                    // guarded switch.
                    guardedSelectFile(c, f);
                }}
                onRun={(c, f) => {
                    // Route through the tree-run helper: it makes the selection
                    // the active file and fires the run from a FRESH closure via
                    // the pending-ref effect. The previous inline
                    // `setTimeout(=> handleRun, 100)` captured the STALE
                    // handleRun (built before the selection change), so running
                    // from the search dialog actually ran the PREVIOUSLY
                    // selected file.
                    handleRunFileFromTree(c, f);
                }}
            />

            {/* ─── Bookmarks dialog (Run & Go ▸ Bookmarks…) ───────────
          Lists every line bookmark across the project; jump opens the
          file and scrolls to the line. Toggle bookmarks from the
          editor's context menu or the Add-current-line button. */}
            <Dialog open={bookmarksOpen} onOpenChange={setBookmarksOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bookmark className="size-4 text-amber-500"/>
                            Bookmarks
                        </DialogTitle>
                        <DialogDescription>
                            Line bookmarks across the project — toggle them from the editor's right-click menu.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => {
                                const cur = footerStore.getCursor();
                                if (cur && cur.line > 0 && selectedFileSlug && selectedFolderSlug) {
                                    toggleBookmark(cur.line);
                                } else {
                                    toast({title: "Put the caret on a line first (then Add, or right-click in the editor)."});
                                }
                            }}
                            disabled={!isPythonFile || !selectedFileSlug}
                            title={isPythonFile ? "Bookmark the current caret line of the open file" : "Line bookmarks target Python files only"}
                        >
                            <BookmarkPlus className="size-3.5"/>
                            Bookmark Current Line
                        </Button>
                        {bookmarks.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-xs text-red-600 dark:text-red-400"
                                onClick={() => saveBookmarks([])}
                                title="Remove every bookmark"
                            >
                                <Trash2 className="size-3.5"/>
                                Clear All
                            </Button>
                        )}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto -mx-1 px-1 space-y-1">
                        {bookmarks.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-8">
                                No bookmarks yet — right-click a line in the editor ▸ "Toggle bookmark".
                            </p>
                        ) : (
                            [...bookmarks]
                                .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.line - b.line)
                                .map((b) => (
                                    <div
                                        key={b.id}
                                        className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 hover:bg-accent/40 group"
                                    >
                                        <Bookmark className="size-3.5 text-amber-500 shrink-0 fill-amber-500/30"/>
                                        <button
                                            type="button"
                                            onClick={() => jumpToBookmark(b)}
                                            className="flex-1 min-w-0 text-left cursor-pointer"
                                            title={`Open ${b.fileName} at line ${b.line}`}
                                        >
                                            <span
                                                className="block truncate text-xs font-medium">{b.fileName || deslugify(b.fileSlug)}</span>
                                            <span
                                                className="block text-[10px] text-muted-foreground">line {b.line}</span>
                                            {b.snippet && (
                                                <span
                                                    className="block truncate text-[10px] font-mono text-muted-foreground/80">{b.snippet}</span>
                                            )}
                                        </button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-6 opacity-0 group-hover:opacity-100"
                                            onClick={() => saveBookmarks(bookmarks.filter((x) => x.id !== b.id))}
                                            aria-label={`Remove bookmark at ${b.fileName}:${b.line}`}
                                            title="Remove this bookmark"
                                        >
                                            <X className="size-3"/>
                                        </Button>
                                    </div>
                                ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Run history drawer */}
            <RunHistory
                entries={history}
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                onSelect={handleHistorySelect}
                onClear={handleHistoryClear}
                // The ▶ button's prop route — routes through the same listener
                // the PRAXIS_RERUN_RUN event takes (one implementation, two
                // entry points).
                onRerun={(entry) =>
                    window.dispatchEvent(new CustomEvent("PRAXIS_RERUN_RUN", {detail: entry}))
                }
            />

            {/* Console variable → grid viewer host — claims the
          PRAXIS_OPEN_VARIABLE_GRID event so the console panel skips its
          own fallback dialog and the sheet-grade grid opens here. */}
            <VariableGridDialogHost/>

            {/* Template gallery picker — the window.prompt flow's replacement:
          searchable grid + category chips + live file-name validation.
          Create renders the template with the user's naming styles and
          writes it through the same import/create routes. */}
            <TemplatePickerDialog
                open={templatePickerOpen}
                onOpenChange={setTemplatePickerOpen}
                folderFiles={selectedFolder?.files?.map((f) => f.name)}
                folderName={selectedFolder?.name}
                forFileName={selectedFile?.name}
                creating={templateCreating}
                onCreate={async ({templateId, fileName}) => {
                    const t = templateById(templateId);
                    if (!t) return;
                    setTemplateCreating(true);
                    try {
                        const {text} = renderTemplate(t.template, getNamingStyles(settings));
                        const isPython = fileName.toLowerCase().endsWith(".py");
                        const res = await fetch(isPython ? "/api/import-py" : "/api/file-create", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({folder: selectedFolderSlug, fileName, content: text}),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                        toast({
                            title: "File created",
                            description: `${data.file ?? data.name ?? fileName} from template "${t.name}"`,
                        });
                        setTemplatePickerOpen(false);
                        refreshFolders();
                    } catch (err) {
                        toast({title: "Failed", description: (err as Error).message, variant: "destructive"});
                    } finally {
                        setTemplateCreating(false);
                    }
                }}
            />

            {/* Run-all batch dialog */}
            <BatchDialog
                open={batchOpen}
                onOpenChange={setBatchOpen}
                running={batchRunning}
                results={batchResults}
                folderName={selectedFolder?.name}
                onJumpToFile={(fileName) => {
                    const file = selectedFolder?.files.find(
                        (f) => f.name === fileName
                    );
                    if (file) setSelectedFileSlug(file.slug);
                    setBatchOpen(false);
                }}
                onOpenResult={(r) => handleLoadBatchResult(r)}
            />

            {/* Settings dialog */}
            <SettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                currentFolderSlug={selectedFolderSlug}
                projectOverrides={projectOverrides}
                settingsSource={settingsSource}
                settingsSourceDir={settingsSourceDir}
                // the detected language runtimes + a re-check
                // button (Settings → Python → Other language runtimes).
                runtimeStatuses={runtimeStatuses ?? undefined}
                runtimeRefreshBusy={runtimeRefreshBusy}
                onRefreshRuntimes={() => refreshRuntimeStatuses({fresh: true})}
                /*
           the dialog's plain Save mirrors the draft into
           .praxis/settings.json — secrets stripped, best-effort, and
           the local override state + the source badge follow so the
           file is instantly the live source. */
                mirrorProjectSettings={async (settings) => {
                    const seed: Partial<Settings> = {...settings};
                    delete seed.aiChatProviders;
                    delete seed.aiChatProviderId;
                    try {
                        const res = await fetch("/api/project-settings", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({settings: seed}),
                        });
                        const data = await res.json().catch(() => null);
                        if (!res.ok || !data?.ok) return false;
                        setProjectOverrides(seed as Partial<Settings>);
                        setSettingsSource("project");
                        // A mirrored save is not a deliberate CLEAR — future
                        // mounts may re-seed if the file ever disappears again.
                        clearedProjectSettingsRef.current.delete(activeProject || "<default>");
                        return true;
                    } catch {
                        return false;
                    }
                }}
                onSaveProjectSettings={async (settings) => {
                    const res = await fetch("/api/project-settings", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({settings}),
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok || !data?.ok) {
                        throw new Error(
                            (data && (data.error || data.message)) ||
                            `Failed to save project settings (HTTP ${res.status})`
                        );
                    }
                    // Mirror the saved object into local state so the override
                    // badges appear immediately without a re-fetch.
                    setProjectOverrides(settings as Partial<Settings>);
                }}
                onResetProjectKey={async (key) => {
                    const next = {...projectOverrides};
                    delete next[key];
                    const res = await fetch("/api/project-settings", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({settings: next}),
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok || !data?.ok) {
                        throw new Error(
                            (data && (data.error || data.message)) ||
                            `Failed to reset project override (HTTP ${res.status})`
                        );
                    }
                    setProjectOverrides(next);
                }}
                onClearProjectSettings={async () => {
                    const res = await fetch("/api/project-settings", {method: "DELETE"});
                    if (!res.ok) {
                        throw new Error(`Failed to clear project settings (HTTP ${res.status})`);
                    }
                    setProjectOverrides({});
                    // remember the deliberate clear so the auto-seed on
                    // the next mount / project switch does not resurrect the file.
                    clearedProjectSettingsRef.current.add(activeProject || "<default>");
                }}
                initialTab={settingsTab ?? undefined}
            />

            {/* Screenshot Studio — Edit ▸ Screenshots + the navbar camera
          icon. Runs the pending capture on open, then offers Save To
          File (a project-relative path via /api/screenshot-save),
          Download and clipboard Copy. */}
            <ScreenshotStudio
                open={screenshotStudioOpen}
                onOpenChange={setScreenshotStudioOpen}
                pendingMode={screenshotPending}
                onPendingModeConsumed={menuScreenshotConsumed}
                getCodeSpec={getScreenshotCodeSpec}
            />

            {/* Folder picker — "Open folder…" in the explorer's + dropdown
 and File → Open project → Browse for folder…. it
          browses the WHOLE filesystem (start point = the projects
          directory) and can open any folder as the active project;
          validation happens in POST /api/projects */}
            <FolderPickerDialog
                open={folderPickerOpen}
                onOpenChange={setFolderPickerOpen}
                onSelect={handleSelectProject}
                activeProject={activeProject}
            />

            {/* Snippet palette (Ctrl+/) */}
            <SnippetPalette
                open={snippetOpen}
                onOpenChange={setSnippetOpen}
                onInsert={(content) => {
                    // Bump the nonce so the CodeViewer's effect re-fires even
                    // if the same snippet is inserted twice in a row.
                    setInsertSnippet({content, nonce: Date.now()});
                }}
            />

            {/* Data file browser */}
            <DataFileBrowser
                open={dataFileBrowserOpen}
                onOpenChange={setDataFileBrowserOpen}
                folderSlug={selectedFolderSlug}
                folderName={selectedFolder?.name ?? ""}
                dataFiles={selectedFolder?.dataFiles ?? []}
                onOpenInEditor={(entry) => {
                    // resolve by slug → path → bare name (nested data files
                    // carry a path-bearing slug; name is the root-level fallback).
                    const files = selectedFolder?.files ?? [];
                    const file =
                        (entry.slug ? files.find((f) => f.slug === entry.slug) : undefined) ??
                        (entry.path ? files.find((f) => f.path === entry.path) : undefined) ??
                        files.find((f) => f.name === entry.name);
                    if (file && selectedFolderSlug) {
                        setDataFileBrowserOpen(false);
                        treeSelectFile(selectedFolderSlug, file.slug);
                    }
                }}
            />

            {/* Command palette — Ctrl+Shift+P */}
            <CommandPalette
                open={commandPaletteOpen}
                onOpenChange={setCommandPaletteOpen}
                actions={commandActions}
            />

            {/* Keyboard shortcuts reference dialog — opened by Help →
          Keyboard shortcuts… (replaces the old behavior of opening
          the command palette, which was misleading). */}
            <ShortcutsDialog
                open={shortcutsDialogOpen}
                onOpenChange={setShortcutsDialogOpen}
            />

            <SymbolPalette
                open={symbolPaletteOpen}
                onOpenChange={setSymbolPaletteOpen}
                symbols={codeViewerRef.current?.getSymbols() ?? []}
                fileName={selectedFile?.name}
                onSelect={(sym) => codeViewerRef.current?.jumpToLine(sym.line)}
            />
            {/* Ctrl+Tab switcher overlay — the MRU list + fuzzy filter that
          replaced the silent cycler (see useTabSwitcherKeys above). */}
            <TabSwitcherOverlay {...tabSwitcher} />
            <FindUsagesDialog
                open={usagesDialogOpen}
                onOpenChange={setUsagesDialogOpen}
                symbol={usagesQuery}
                onJumpTo={(folderSlug, fileSlug, line) => {
                    // guarded switch.
                    guardedSelectFile(folderSlug, fileSlug, {
                        afterSwitch: () => {
                            setTimeout(() => codeViewerRef.current?.jumpToLine(line), 300);
                        },
                    });
                }}
            />
            <RenamePreviewDialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
                symbol={renameSymbol}
                onRename={handleRenameSymbol}
                onJumpTo={(folderSlug, fileSlug, line) => {
                    // Same guarded-switch + delayed-jump pattern the project
                    // search dialog uses (the preview rows behave like its
                    // results).
                    guardedSelectFile(folderSlug, fileSlug, {
                        afterSwitch: () => setTimeout(() => codeViewerRef.current?.jumpToLine(line), 300),
                    });
                }}
                onApplied={() => {
                    // Reload the OPEN editor tab after the rename's writes —
                    // the dialog already dispatches praxis:refresh-folders for
                    // the tree; this is the same reselect trick the legacy
                    // handler used (50 ms reselect picks the on-disk content).
                    if (selectedFolderSlug && selectedFileSlug) {
                        setSelectedFileSlug("");
                        setTimeout(() => setSelectedFileSlug(selectedFileSlug), 50);
                    }
                }}
            />
            <QuickFixesDialog
                open={quickFixesOpen}
                onOpenChange={setQuickFixesOpen}
                diagnostics={codeViewerRef.current?.getDiagnostics() ?? []}
            />
            <ProjectSearchDialog
                open={projectSearchOpen}
                onOpenChange={setProjectSearchOpen}
                folders={folders}
                onJumpTo={(folderSlug, fileSlug, line) => {
                    // guarded switch.
                    guardedSelectFile(folderSlug, fileSlug, {
                        afterSwitch: () => {
                            setProjectSearchOpen(false);
                            setTimeout(() => codeViewerRef.current?.jumpToLine(line), 300);
                        },
                    });
                }}
            />
            {/* ─── Go to Line dialog (Navigate ▸) ─────────────── */}
            <Dialog open={gotoLineOpen} onOpenChange={setGotoLineOpen}>
                <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                        <DialogTitle>Go To Line</DialogTitle>
                        <DialogDescription>
                            Jump to a line number in the current file
                            (1–{code?.content ? code.content.split("\n").length : 0}).
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleGotoLineConfirm();
                        }}
                    >
                        <Input
                            type="number"
                            min={1}
                            value={gotoLineValue}
                            onChange={(e) => setGotoLineValue(e.target.value)}
                            placeholder="Line number…"
                            autoFocus
                            className="flex-1 font-mono"
                        />
                        <Button type="submit" size="sm" disabled={!gotoLineValue.trim()}>
                            Go
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ─── Recent Files dialog (Navigate ▸) ────────────── */}
            <Dialog open={recentFilesOpen} onOpenChange={setRecentFilesOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Recent Files</DialogTitle>
                        <DialogDescription>
                            The 15 most recently modified files — click one to open it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[50vh] overflow-y-auto space-y-1">
                        {recentFilesList.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">No files yet.</p>
                        ) : (
                            recentFilesList.map((f) => (
                                <button
                                    key={`${f.folderSlug}/${f.fileSlug}`}
                                    type="button"
                                    className="w-full text-left rounded-md border bg-muted/30 hover:bg-muted/60 px-2.5 py-1.5 transition-colors"
                                    onClick={() => {
                                        // guarded switch.
                                        guardedSelectFile(f.folderSlug, f.fileSlug, {
                                            afterSwitch: () => setRecentFilesOpen(false),
                                        });
                                    }}
                                    title={`Open ${f.folderName}/${f.fileName}`}
                                >
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="font-medium truncate">{f.fileName}</span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(f.mtime).toLocaleString()}
                    </span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">{f.folderName}</div>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ─── dialogs ────────────────────────────────────────── */}

            {/* Go to Symbol in project (⌘T) */}
            <SymbolSearchDialog
                open={symbolSearchOpen}
                onOpenChange={setSymbolSearchOpen}
                onSelect={(folder, file, line) => handleOpenFileAt(folder, file, line)}
            />

            {/* Compare ▸ With clipboard… (Explorer file right-click) */}
            <CompareClipboardDialog
                open={compareClipboard != null}
                onOpenChange={(o) => {
                    if (!o) setCompareClipboard(null);
                }}
                fileName={compareClipboard?.fileName ?? ""}
                fileContent={compareClipboard?.fileContent ?? null}
                clipboardText={compareClipboard?.clipboardText ?? null}
            />

            {/* — Compare two files… (Tools menu + the Explorer's
          "Compare with another file…" right-click entry). The
          preselect (left side) only applies on the open that came WITH
          it — clearing it after applying stops a later manual open
          from the menu from re-forcing the old preselection. */}
            <CompareFilesDialog
                open={compareFilesOpen}
                onOpenChange={(o) => {
                    setCompareFilesOpen(o);
                    if (!o) setCompareFilesPreselect(null);
                }}
                folders={folders}
                initialLeft={compareFilesPreselect}
                currentFile={
                    selectedFolderSlug && selectedFileSlug
                        ? {folderSlug: selectedFolderSlug, fileSlug: selectedFileSlug}
                        : null
                }
            />

            {/* — the commit-history browser (Tools ▸ Git ▸
          Commit history…). */}
            <GitLogDialog
                open={gitLogOpen}
                onOpenChange={setGitLogOpen}
            />

            {/* The dependency manager (Tools ▸ Dependency
          manager…): installed packages, outdated check, upgrade /
          uninstall dev-tools, pin-to-requirements.txt. */}
            <DependencyManagerDialog
                open={depManagerOpen}
                onOpenChange={setDepManagerOpen}
                interpreter={settings.pythonInterpreter || undefined}
                folderSlug={selectedFolderSlug ?? undefined}
            />

            {/* The project dictionary manager (Tools ▸ Project dictionary…):
          the .praxis/spell-ignore.json words — add / remove / clear. */}
            <ProjectDictionaryDialog
                open={projectDictOpen}
                onOpenChange={setProjectDictOpen}
                praxisDir={settingsSourceDir}
            />

            {/* ─── The new feature surfaces (mounted once, opened on
             demand from their menus / panels) ─────────────────── */}

            {/* AST Explorer — Tools ▸ AST Explorer (python files). */}
            {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                <AstExplorerPanel
                    open={astExplorerOpen}
                    onOpenChange={setAstExplorerOpen}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile?.name ?? ""}
                    code={codeViewerRef.current?.getBuffer() ?? code?.content}
                />
            )}

            {/* Bytecode Inspector — Tools ▸ Bytecode Inspector (python). */}
            {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                <BytecodeInspector
                    open={bytecodeOpen}
                    onOpenChange={setBytecodeOpen}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile?.name ?? ""}
                    code={codeViewerRef.current?.getBuffer()}
                    savedCode={code?.content}
                />
            )}

            {/* Docstring Studio — Tools ▸ Docstring Studio (python). The AI
          enrichment rides the integrated chat's provider config. */}
            {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                <DocstringStudio
                    open={docstringStudioOpen}
                    onOpenChange={setDocstringStudioOpen}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile?.name ?? ""}
                    code={codeViewerRef.current?.getBuffer() ?? code?.content}
                    style={settings.docstringStyle}
                    onApplyDocstring={(next) => {
                        setInsertSnippet({content: next, nonce: Date.now()});
                        toast({
                            title: "Docstring applied",
                            description: "The updated source is in the editor buffer — save to write it."
                        });
                    }}
                    onEnrichWithAI={(funcName, signature) =>
                        // AI enrichment — a REAL one-shot request now: the prompt
                        // goes straight to /api/ai-chat with the active chat
                        // provider, the SSE stream is consumed to completion and
                        // the accumulated text resolves (Docstring Studio merges it
                        // into the editable preview). The old version only routed
                        // the prompt to the chat sidebar and resolved "" — the
                        // merge never happened.
                        (async () => {
                            const chatProvider = getActiveChatProvider(loadSettings());
                            const sampling = readPersistedSampling();
                            const controller = new AbortController();
                            try {
                                const res = await fetch("/api/ai-chat", {
                                    method: "POST",
                                    headers: {"Content-Type": "application/json"},
                                    body: JSON.stringify({
                                        messages: [
                                            {
                                                role: "user" as const,
                                                content: `Write concise argument descriptions for the Python function ${funcName} with this signature. Reply with one line per argument, "name: description" pairs only — no code block, no prose:\n\n${signature}\n`,
                                            },
                                        ],
                                        ...(chatProvider
                                            ? {
                                                provider: {
                                                    kind: chatProvider.kind,
                                                    baseUrl: chatProvider.baseUrl,
                                                    apiKey: chatProvider.apiKey,
                                                    model: chatProvider.model,
                                                    ...(sampling ? {sampling} : {}),
                                                },
                                            }
                                            : {}),
                                    }),
                                    signal: controller.signal,
                                });
                                if (!res.ok) {
                                    const errText = await res.text().catch(() => "");
                                    throw new Error(errText || `HTTP ${res.status}`);
                                }
                                if (!res.body) throw new Error("The AI service returned no response stream.");
                                const reader = res.body.getReader();
                                const decoder = new TextDecoder();
                                let sseBuffer = "";
                                let text = "";
                                const applyEvent = (data: string): boolean => {
                                    if (data === "[DONE]") return true;
                                    let parsed: unknown;
                                    try {
                                        parsed = JSON.parse(data);
                                    } catch {
                                        return false;
                                    }
                                    if (parsed && typeof parsed === "object" && "error" in parsed) {
                                        const errMsg = (parsed as { error?: unknown }).error;
                                        throw new Error(typeof errMsg === "string" ? errMsg : "The AI service returned an error.");
                                    }
                                    const delta: string =
                                        (parsed as { choices?: Array<{ delta?: { content?: string } }> })
                                            ?.choices?.[0]?.delta?.content ?? "";
                                    if (delta) text += delta;
                                    return false;
                                };
                                while (true) {
                                    const {done, value} = await reader.read();
                                    if (done) break;
                                    sseBuffer += decoder.decode(value, {stream: true});
                                    let sepIdx: number;
                                    while ((sepIdx = sseBuffer.indexOf("\n\n")) >= 0) {
                                        const rawEvent = sseBuffer.slice(0, sepIdx);
                                        sseBuffer = sseBuffer.slice(sepIdx + 2);
                                        if (!rawEvent) continue;
                                        const lines = rawEvent.replace(/\r\n/g, "\n").split("\n");
                                        const dataLines = lines
                                            .filter((l) => l.startsWith("data:"))
                                            .map((l) => l.slice(5).replace(/^ /, ""));
                                        if (dataLines.length === 0) continue;
                                        if (applyEvent(dataLines.join("\n"))) return text;
                                    }
                                }
                                return text;
                            } finally {
                                controller.abort(); // no-op when the stream is already done
                            }
                        })()
                    }
                />
            )}

            {/* Refactor palette — editor context menu + Ctrl+Shift+R. */}
            {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                <RefactorPalette
                    open={refactorPaletteOpen}
                    onOpenChange={setRefactorPaletteOpen}
                    initialTransform={refactorPaletteTransform}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile?.name ?? ""}
                    code={codeViewerRef.current?.getBuffer() ?? code?.content ?? ""}
                    selection={null}
                    onApply={(newCode, extraFiles, description) => {
                        setInsertSnippet({content: newCode, nonce: Date.now()});
                        if (extraFiles.length > 0) {
                            void (async () => {
                                for (const f of extraFiles) {
                                    try {
                                        await fetch("/api/file-create", {
                                            method: "POST",
                                            headers: {"Content-Type": "application/json"},
                                            body: JSON.stringify({
                                                folder: selectedFolderSlug,
                                                fileName: f.path,
                                                content: f.content
                                            }),
                                        });
                                    } catch { /* best effort */
                                    }
                                }
                                void refreshFolders();
                            })();
                        }
                        toast({
                            title: "Refactor applied",
                            description: description || "The refactored source is in the editor buffer — save to write it."
                        });
                    }}
                />
            )}

            {/* DuckDB Workbench — Tools menu + the .parquet auto-offer. */}
            <DuckDBWorkbench
                open={!!duckdbTargetOpen || !!duckdbTarget}
                onOpenChange={(o) => {
                    setDuckdbTargetOpen(o);
                    if (!o) setDuckdbTarget(null);
                }}
                folderSlug={selectedFolderSlug ?? ""}
                fileSlug={duckdbTarget?.fileSlug ?? ""}
                fileName={duckdbTarget?.fileName ?? ""}
            />

            {/* Hex Editor — Tools ▸ Hex Editor (any file; binaries also get
          it inline in the FileViewer). */}
            <Dialog open={hexEditorOpen && !!selectedFile} onOpenChange={setHexEditorOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
                    <DialogHeader className="px-6 pt-5 pb-2.5 shrink-0">
                        <DialogTitle>Hex Editor</DialogTitle>
                        <DialogDescription>Binary inspection for the open file — hex + ASCII, offset navigation, search,
                            guarded in-place editing.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
                        {selectedFolderSlug && selectedFileSlug ? (
                            <HexEditorHost
                                folderSlug={selectedFolderSlug}
                                fileSlug={selectedFileSlug}
                                fileName={selectedFile?.name ?? ""}
                                totalSize={selectedFile?.size}
                            />
                        ) : (
                            <p className="py-10 text-center text-xs text-muted-foreground">Open a file first.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Extensions panel — Tools ▸ Extensions. */}
            <ExtensionsPanel open={extensionsOpen} onOpenChange={setExtensionsOpen}/>

            {/* GitHub import — File ▸ Open from GitHub URL… */}
            <OpenFromUrlDialog
                open={openFromUrlOpen}
                onOpenChange={setOpenFromUrlOpen}
                onImported={(folderSlug, fileCount) => handleGithubImported(folderSlug, fileCount)}
            />

            {/* Python Version Matrix Runner — Run ▸ Run on Multiple Pythons… */}
            {isPythonFile && selectedFolderSlug && selectedFileSlug && (
                <MultiPythonRunner
                    open={multiPythonOpen}
                    onOpenChange={setMultiPythonOpen}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile?.name ?? ""}
                    code={codeViewerRef.current?.getBuffer() ?? code?.content}
                    defaultInterpreter={settings.pythonInterpreter || undefined}
                />
            )}

            {/* AI Code Review — Git ▸ Review Changes with AI. */}
            <AiReviewDialog
                open={aiReviewOpen}
                onOpenChange={setAiReviewOpen}
                fileName="working tree"
                diff={aiReviewDiff}
                onApplyFix={handleAiReviewApply}
            />

            {/* Agent Mode (AI ▸ Agent Mode…) — the multi-file AI edit
          planner: a step plan + per-file approvals, applied as ONE
          multi-file undo group. The dialog itself dispatches
          "praxis:refresh-folders" (the page's listener refreshes the
          tree); onApplied re-runs the same refresh for belt-and-braces
          and receives the applied/skipped summary. */}
            <AgentModeDialog
                open={agentModeOpen}
                onOpenChange={setAgentModeOpen}
                folder={selectedFolderSlug}
                onApplied={() => void refreshFolders({silent: true})}
            />

            {/* Three-way Merge Editor — Git ▸ Resolve in Merge Editor… +
          auto-offered on conflicted files. */}
            <MergeEditor
                open={!!mergeTarget}
                onOpenChange={(o) => {
                    if (!o) setMergeTarget(null);
                }}
                fileName={mergeTarget?.fileName ?? ""}
                content={mergeTarget?.content ?? ""}
                baseContent={undefined}
                oursLabel="ours (this workspace)"
                theirsLabel="theirs (incoming)"
                onResolved={handleMergeResolved}
            />

            {/* Live collaboration session — Collaborate ▸ Share Workspace.
          Mounts ONLY while a room is active (the EventSource lives
          inside). */}
            {collabRoom && (
                <CollabSession
                    open={!!collabRoom}
                    room={collabRoom}
                    onClose={() => {
                        setCollabRoom(null);
                        setCollabPeers([]);
                    }}
                    guestPermission={loadCollabSettings().guestPermission}
                    onPeerCursor={setCollabPeers}
                />
            )}

            {/* The Ambient Mixer panel (Focus ▸ Ambient mixer…). Mounts once;
          opens itself on the praxis:ambient-mixer window event. */}
            <AmbientMixerDialog/>
            {/* The Compress-to-ZIP dialog — mounts once; opens itself on the
          praxis:compress window event (Explorer right-clicks + navbar
          Tools ▸ Export compress items). */}
            <CompressDialog/>

            {/* New file from selection… (editor right-click on a selection) */}
            <Dialog
                open={newFileFromSel != null}
                onOpenChange={(o) => {
                    if (!o && !(newFileFromSel?.busy)) setNewFileFromSel(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FilePlus2 className="size-5"/>
                            New File From Selection
                        </DialogTitle>
                        <DialogDescription>
                            Creates a new Python file in the chosen folder containing the selected code.
                        </DialogDescription>
                    </DialogHeader>
                    {newFileFromSel && (
                        <div className="grid gap-3">
                            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="new-file-from-sel-name">File name</Label>
                                    <Input
                                        id="new-file-from-sel-name"
                                        value={newFileFromSel.fileName}
                                        autoFocus
                                        spellCheck={false}
                                        onChange={(e) =>
                                            setNewFileFromSel((prev) =>
                                                prev ? {...prev, fileName: e.target.value} : prev
                                            )
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !newFileFromSel.busy) {
                                                e.preventDefault();
                                                void handleCreateFileFromSelection();
                                            }
                                        }}
                                    />
                                </div>
                                <div className="grid gap-1.5 min-w-[160px]">
                                    <Label>Folder</Label>
                                    <Select
                                        value={newFileFromSel.folderSlug}
                                        onValueChange={(v) =>
                                            setNewFileFromSel((prev) =>
                                                prev ? {...prev, folderSlug: v} : prev
                                            )
                                        }
                                    >
                                        <SelectTrigger className="text-xs">
                                            <SelectValue placeholder="Pick a folder"/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {folders.map((c) => (
                                                <SelectItem key={c.slug} value={c.slug} className="text-xs">
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <pre
                                className="rounded-md border bg-muted/30 p-2 max-h-32 overflow-y-auto font-mono text-[10px] whitespace-pre-wrap break-words text-muted-foreground">
                {newFileFromSel.code.slice(0, 800)}
                                {newFileFromSel.code.length > 800 ? "\n…" : ""}
              </pre>
                            {newFileFromSel.error && (
                                <p className="text-xs text-red-600 dark:text-red-400">{newFileFromSel.error}</p>
                            )}
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setNewFileFromSel(null)}
                                    disabled={newFileFromSel.busy}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => void handleCreateFileFromSelection()}
                                    disabled={newFileFromSel.busy || !newFileFromSel.fileName.trim() || !newFileFromSel.folderSlug}
                                >
                                    {newFileFromSel.busy ? (
                                        <Loader2 className="size-4 animate-spin"/>
                                    ) : (
                                        <FilePlus2 className="size-4"/>
                                    )}
                                    Create File
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <LocalHistoryPanel
                open={localHistoryOpen}
                onOpenChange={setLocalHistoryOpen}
                folderSlug={selectedFolderSlug}
                fileSlug={selectedFileSlug}
                fileName={selectedFile?.name ?? ""}
                onRestore={() => {
                    if (selectedFolderSlug && selectedFileSlug) {
                        setSelectedFileSlug("");
                        setTimeout(() => setSelectedFileSlug(selectedFileSlug), 50);
                    }
                }}
            />
            {/* Git Commit dialog — opened from the Tools → Git → Commit…
          menu item. Lists every modified file (from gitStatusMap)
          with checkboxes (all checked by default) + a commit-message
          textarea. On success, fires onCommitted → re-fetches git-
          status (one request refreshes the map, the dirty count and
          the Git Diff panel's props). */}
            <GitCommitDialog
                open={commitDialogOpen}
                onOpenChange={setCommitDialogOpen}
                gitStatusMap={gitStatusMap}
                onCommitted={() => {
                    void fetchGitStatus();
                }}
            />

            {/* Drag-drop overlay */}
            {dragOver && (
                <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
                    <div className="absolute inset-0 bg-emerald-500/10"/>
                    <div
                        className="relative rounded-2xl border-2 border-dashed border-emerald-500 bg-background/90 px-12 py-8 text-center shadow-xl">
                        <Upload className="size-10 mx-auto text-emerald-500 mb-2"/>
                        <p className="text-sm font-medium">Drop files to import</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            any file type — into {selectedFolder?.name ?? "— select a folder first —"}
                        </p>
                    </div>
                </div>
            )}

            {/* Install deps log dialog */}
            <Dialog open={installDepsOpen} onOpenChange={setInstallDepsOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="size-4 text-emerald-500"/>
                            Installing dependencies
                            {installDepsRunning && (
                                <RefreshCw className="size-3.5 animate-spin text-cyan-500"/>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            Live <code className="font-mono">pip install</code> output for
                            the {selectedFolder?.name} folder.
                        </DialogDescription>
                    </DialogHeader>
                    <pre
                        className="font-mono text-xs bg-muted/40 rounded-md p-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words">
            {installDepsLog || "(waiting for output…)"}
          </pre>
                </DialogContent>
            </Dialog>

            {/* Round 3 — Save As destination picker for an untitled API client
          draft: nothing was written to open the draft, and nothing is
          written until this dialog confirms a folder + file name. */}
            <Dialog
                open={!!untitledSaveDialog}
                onOpenChange={(v) => {
                    // Closing the picker never saves — the draft stays in memory.
                    if (!v) {
                        setUntitledSaveDialog(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Globe className="size-4 text-emerald-500"/>
                            Save As…
                        </DialogTitle>
                        <DialogDescription>
                            Pick where <span className="font-mono">{untitledSaveDialog?.fileName}</span> should be
                            written. The draft stays in memory until you confirm.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {/* Destination folder — every open project folder is eligible. */}
                        <div>
                            <label htmlFor="untitled-save-folder" className="text-xs font-medium text-muted-foreground">
                                Folder
                            </label>
                            <Select value={untitledSaveFolder} onValueChange={setUntitledSaveFolder}>
                                <SelectTrigger id="untitled-save-folder" className="mt-1 w-full">
                                    <SelectValue placeholder="Pick a folder"/>
                                </SelectTrigger>
                                <SelectContent>
                                    {folders.map((f) => (
                                        <SelectItem key={f.slug} value={f.slug}>
                                            {f.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {/* Destination file name — auto-suffixed .http/.rest. */}
                        <div>
                            <label htmlFor="untitled-save-name" className="text-xs font-medium text-muted-foreground">
                                File name
                            </label>
                            <Input
                                id="untitled-save-name"
                                className="mt-1 w-full font-mono"
                                value={untitledSaveName}
                                onChange={(e) => setUntitledSaveName(e.target.value)}
                                placeholder="requests.http"
                                spellCheck={false}
                            />
                            <p className="mt-1 text-[10px] text-muted-foreground">
                                A missing .http / .rest suffix is added automatically.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUntitledSaveDialog(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleConfirmUntitledSave()}
                            disabled={!untitledSaveFolder || untitledSaveName.trim() === ""}
                        >
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Run-duration warning dialog — shown when the estimated runtime
exceeds the `runDurationWarningThreshold` setting. */}
            <AlertDialog
                open={durationWarning !== null}
                onOpenChange={(v) => {
                    if (!v) {
                        setDurationWarning(null);
                        setPendingRunFn(null);
                    }
                }}
            >
                <AlertDialogContent className="sm:max-w-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <CircleAlert className="size-5 text-amber-500"/>
                            This run may take a while
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>
                                    Praxis estimates this script will take{" "}
                                    <strong className="text-foreground">
                                        {durationWarning ? formatDuration(durationWarning.estimatedMs) : "—"}
                                    </strong>{" "}
                                    to run{" "}
                                    <span className="text-xs text-muted-foreground">
                    (confidence: {durationWarning?.confidence ?? "—"}).
                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {durationWarning?.reasoning}
                                </p>
                                {durationWarning && durationWarning.signals.length > 0 && (
                                    <ul className="text-xs space-y-1 mt-2 bg-muted/40 rounded-md p-2.5">
                                        {durationWarning.signals.map((s, i) => (
                                            <li key={i} className="flex items-center justify-between gap-2">
                                                <span className="text-foreground/80">{s.label}</span>
                                                <span className="font-mono text-muted-foreground">
                          +{formatDuration(s.contributionMs)}
                        </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    You can change the threshold in Settings → Python →
                                    Run-duration warning threshold.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingRunFn) pendingRunFn();
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                            Proceed With Run
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dirty-tab close confirmation — themed replacement for the
previous window.confirm. Opened when the user tries to
close a tab with unsaved changes AND confirmCloseUnsavedTab
is on. */}
            <AlertDialog
                open={!!pendingCloseTab}
                onOpenChange={(open) => {
                    if (!open) setPendingCloseTab(null);
                }}
            >
                <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                        <AlertDialogDescription>
                            &ldquo;{pendingCloseTab?.fileName}&rdquo; has unsaved
                            changes. Close anyway? Your edits will be lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmCloseTab}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Close Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* — the dirty-tab SWITCH guard: moving to another tab
          with unsaved edits asks Save & switch / Discard & switch /
          Stay (the FileViewer's buffer used to be dropped silently). */}
            <AlertDialog
                open={!!pendingSwitchTab}
                onOpenChange={(open) => {
                    if (!open) setPendingSwitchTab(null);
                }}
            >
                <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsaved changes
                            in &ldquo;{pendingSwitchTab?.fromName}&rdquo;</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are switching to &ldquo;{pendingSwitchTab?.toName}&rdquo; but the current
                            file has unsaved edits. Save them first, or discard and switch.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay In This Tab</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = pendingSwitchTab;
                                setPendingSwitchTab(null);
                                if (target) performPendingSwitch(target);
                            }}
                            //
                            // switch as it hurts eyes"): the destructive red read as
                            // an alarming error state. A muted outline now — still
                            // clearly the cautious choice next to the emerald Save,
                            // without the red glare.
                            className="bg-muted text-foreground hover:bg-muted/70 border border-border"
                        >
                            Discard &amp; switch
                        </AlertDialogAction>
                        <AlertDialogAction
                            onClick={() => {
                                const target = pendingSwitchTab;
                                setPendingSwitchTab(null);
                                if (target) void saveAndSwitchTab(target);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                            Save &amp; switch
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* First-launch tutorial overlay. Self-gated by a
          localStorage flag — renders nothing on subsequent visits. */}
            <Tutorial/>

            {/* API access-token prompt. Only appears when the
          server runs with PRAXIS_ACCESS_TOKEN set and an API call is
          rejected with 401 tokenRequired — see src/lib/api-auth.tsx
          and src/proxy.ts. */}
            <ApiTokenPrompt/>

            {/* run queue — live view of everything executing
          on the server (foreground + background), with per-run Stop. */}
            <RunQueueDialog
                open={runQueueOpen}
                onOpenChange={setRunQueueOpen}
                onStop={(runId) => handleStop(runId)}
            />

            {/* scheduled runs manager. */}
            <SchedulerDialog
                open={schedulerOpen}
                onOpenChange={setSchedulerOpen}
                schedules={schedules}
                onChange={updateSchedules}
                currentTarget={
                    selectedFolderSlug && selectedFileSlug && selectedFile
                        ? {
                            label: `${selectedFolder?.name ?? selectedFolderSlug}/${selectedFile.name}`,
                            folderSlug: selectedFolderSlug,
                            fileSlug: selectedFileSlug,
                        }
                        : null
                }
                onRunNow={(s) => handleRunFileFromTreeRef.current(s.folderSlug, s.fileSlug)}
            />

            {/* keyboard-shortcut trainer (browse + practice). */}
            <ShortcutTrainer open={trainerOpen} onOpenChange={setTrainerOpen}/>

            {/* ─── workspace tool dialogs ───────────────────────────── */}

            {/* Developer Toolbox — Convert / Encode / Hash / UUID / Time /
          Color / Cron / Regex / Diff / Escape / Faker. */}
            <DevToolbox open={toolboxOpen} onOpenChange={setToolboxOpen} initialTab={toolboxTab}
                        preload={toolboxPreload}/>
            {/* Performance HUD — Settings → Advanced → performance HUD. */}
            <PerfHud open={settings.showPerfHud}/>

            {/* SQLite SQL workbench. */}
            {workbench.open && (
                <SqliteWorkbench
                    open={workbench.open}
                    onOpenChange={(o) => setWorkbench((w) => ({...w, open: o}))}
                    folderSlug={workbench.folderSlug}
                    fileSlug={workbench.fileSlug}
                    fileName={workbench.fileName}
                />
            )}

            {/* Chart preview for the current CSV. */}
            {selectedFile && selectedFolderSlug && selectedFileSlug && (
                <ChartPreview
                    open={chartOpen}
                    onOpenChange={setChartOpen}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile.name}
                />
            )}

            {/* Transform pipeline for the current CSV. */}
            {selectedFile && selectedFolderSlug && selectedFileSlug && (
                <TransformPipeline
                    open={pipelineOpen}
                    onOpenChange={setPipelineOpen}
                    folderSlug={selectedFolderSlug}
                    fileSlug={selectedFileSlug}
                    fileName={selectedFile.name}
                    siblingCsvs={siblingCsvs}
                />
            )}

            {/* Snippet manager — CRUD + import / export packs. */}
            <SnippetManager open={snippetManagerOpen} onOpenChange={setSnippetManagerOpen}/>

            {/* Jump list — pinned tabs / favorites / recents / last runs. */}
            <JumpList
                open={jumpListOpen}
                onOpenChange={setJumpListOpen}
                recentFiles={recentFilesList}
                onOpenFile={treeSelectFile}
                onSelectFolder={(slug) => setSelectedFolderSlug(slug)}
                projectFolders={folders.map((f) => ({
                    slug: f.slug,
                    name: f.name,
                    files: f.files.map((x) => ({slug: x.slug, name: x.name}))
                }))}
            />

            {/* Folder compare + scaffold from blueprint. */}
            <FolderCompareDialog
                open={folderCompareOpen}
                onOpenChange={setFolderCompareOpen}
                folders={folders.map((c) => ({slug: c.slug, name: c.name}))}
                initialFolderSlug={folderCompareSlug}
            />
            <ScaffoldDialog
                open={scaffoldOpen}
                onOpenChange={setScaffoldOpen}
                folders={folders.map((c) => ({slug: c.slug, name: c.name}))}
                onDone={() => void refreshFolders()}
            />

            {/* AI chat sidebar — streams completions from /api/ai-chat
(z-ai-web-dev-sdk). Includes the current file's content as
context with each message and persists history to
localStorage under `${STORAGE_PREFIX}-ai-chat`. */}
            <PanelErrorBoundary label="AI chat">
                <AiChatSidebar
                    open={aiChatOpen}
                    onOpenChange={setAiChatOpen}
                    fileName={selectedFile?.name}
                    code={code?.content}
                    extraContext={aiContext}
                    folderName={selectedFolder?.name}
                    pendingPrompt={aiPendingPrompt}
                    systemPromptOverride={settings.aiChatSystemPrompt}
                    maxContextChars={settings.aiChatContextChars}
                    // "Apply to file" on the chat's python code blocks:
                    // the sidebar shows a before/after diff FIRST; this handler runs
                    // only after the user Accepts. replaceBuffer swaps the EDITOR
                    // buffer through the normal change path (dirty tracking +
                    // autosave engage; the file is only written on save).
                    onApplyCode={(newCode) => {
                        if (!selectedFileSlug) return;
                        codeViewerRef.current?.replaceBuffer(newCode);
                        toast({
                            title: "AI code applied to the editor",
                            description: "Review the buffer and save when you're happy — ⌘Z undoes.",
                        });
                    }}
                    onOpenSettings={menuOpenSettings}
                />
            </PanelErrorBoundary>

            {/* AI test generation preview — shows a live, streaming preview
of the generated pytest tests before writing them to disk.
The user can cancel mid-stream or discard without writing. */}
            <AiTestPreviewDialog
                open={testPreviewOpen}
                onOpenChange={setTestPreviewOpen}
                fileName={testPreviewFileName}
                testCode={testPreviewCode}
                streaming={generatingTests}
                error={testPreviewError}
                onWrite={writeTestFile}
                onDiscard={discardTestPreview}
                writing={testPreviewWriting}
            />
        </div>
    );
}


/* ------------------------------------------------------------------ */
/*  Script notes — per-script free-form notes stored in localStorage  */

/* ------------------------------------------------------------------ */
function ScriptNotes({
                         folderSlug,
                         fileSlug,
                         fileName,
                     }: {
    folderSlug: string;
    fileSlug: string;
    fileName: string;
}) {
    const [notes, setNotes] = React.useState("");
    const [mounted, setMounted] = React.useState(false);
    const key = `praxis.notes.${folderSlug}.${fileSlug}`;

    React.useEffect(() => {
        setMounted(true);
        try {
            setNotes(window.localStorage.getItem(key) ?? "");
        } catch { /* ignore */
        }
    }, [key]);

    const save = React.useCallback(
        (value: string) => {
            try {
                window.localStorage.setItem(key, value);
            } catch { /* ignore */
            }
        },
        [key]
    );

    if (!mounted) return null;

    return (
        <div className="rounded-xl border bg-card/40 backdrop-blur-sm shadow-sm mb-6 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                    <FileCode2 className="size-3.5 shrink-0 text-amber-500"/>
                    <span className="text-xs font-medium">Notes · {fileName}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
          {notes.length} chars · saved automatically
        </span>
            </div>
            <Textarea
                value={notes}
                onChange={(e) => {
                    setNotes(e.target.value);
                    save(e.target.value);
                }}
                placeholder="Write notes about this script…"
                className="font-mono text-xs h-20 border-0 rounded-none resize-y"
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Footer / Status bar                                                */
/* ------------------------------------------------------------------ */
/**
 * the live "Ln / Col" + "Sel N" footer indicators.
 *
 * This tiny component subscribes to the `footerStore` external store via
 * useSyncExternalStore. Every caret move (i.e. every keystroke) updates
 * the store — with the old page-level state that re-rendered the ENTIRE
 * IDE page per keystroke ("editing in the editor is very slow like
 * lagging"); now only this ~10-element chip re-renders.
 */

/**
 * Vim mode indicator — the status-bar chip showing NORMAL / INSERT /
 * VISUAL (+ pending keys + macro recording) while vim mode is on. The
 * CodeViewer pushes praxis:vim-state events; this chip re-renders on
 * them alone (never the page).
 */
/**
 * Extension status-bar items — the contributions registered by the
 * enabled sandboxed extensions (word count, clocks, ...). Reads the
 * extensions registry's external store directly so the page never
 * re-renders for it.
 */
function ExtensionStatusChip() {
    const state = React.useSyncExternalStore(subscribeExtensions, getExtensionState, getExtensionState);
    if (state.statusBar.length === 0) return null;
    return (
        <>
            {state.statusBar.slice(0, 4).map((item) => (
                <span
                    key={`${item.extId}:${item.id}`}
                    className="hidden md:inline shrink-0 rounded border bg-muted/40 px-1.5 text-[10px] text-muted-foreground"
                    title={item.tooltip ?? `Extension status item (${item.extId})`}
                >
          {item.text}
        </span>
            ))}
        </>
    );
}

function VimModeChip() {
    // Self-sufficient: the CodeViewer pushes praxis:vim-state events
    // only while vim mode is ON (payload null when it goes off), so the
    // chip needs no settings prop.
    const [state, setState] = React.useState<{
        mode: string;
        pending?: string;
        message?: string | null;
        recording?: string | null
    } | null>(null);
    React.useEffect(() => {
        const onState = (e: Event) => {
            const d = (e as CustomEvent).detail as {
                mode: string;
                pending?: string;
                message?: string | null;
                recording?: string | null
            } | null;
            setState(d);
        };
        window.addEventListener("praxis:vim-state", onState);
        return () => window.removeEventListener("praxis:vim-state", onState);
    }, []);
    if (!state) return null;
    const mode = state?.mode ?? "normal";
    return (
        <span
            className="hidden md:inline shrink-0 rounded border px-1.5 font-mono text-[10px] uppercase tracking-wide"
            style={{
                borderColor: mode === "insert" ? "rgba(16,185,129,0.4)" : mode === "visual" ? "rgba(59,130,246,0.4)" : "rgba(245,158,11,0.4)",
                color: mode === "insert" ? "#059669" : mode === "visual" ? "#2563eb" : "#b45309",
            }}
            title={`Vim mode — ${mode}${state?.recording ? ` · recording @${state.recording}` : ""}${state?.pending ? ` · pending: ${state.pending}` : ""}`}
        >
      {mode}
            {state?.pending ? ` ${state.pending}` : ""}
            {state?.recording ? " @rec" : ""}
    </span>
    );
}

function FooterCursorChip({show}: { show: boolean }) {
    const cursorPos = React.useSyncExternalStore(
        footerStore.subscribe,
        footerStore.getCursor,
        footerStore.getCursor
    );
    const selectionInfo = React.useSyncExternalStore(
        footerStore.subscribe,
        footerStore.getSelection,
        footerStore.getSelection
    );
    if (!show) return null;
    return (
        <>
            {cursorPos && (
                <span className="hidden md:inline font-mono tabular-nums shrink-0" title="Cursor position">
          Ln {cursorPos.line}, Col {cursorPos.col}
        </span>
            )}
            {selectionInfo && selectionInfo.chars > 0 && (
                <span
                    className="hidden lg:inline font-mono tabular-nums shrink-0 text-foreground/80"
                    title={`${selectionInfo.chars} characters selected across ${selectionInfo.lines} line${selectionInfo.lines === 1 ? "" : "s"}`}
                >
          Sel {selectionInfo.chars}
        </span>
            )}
        </>
    );
}

/**
 * the live "N words · M chars" footer chip — reads the
 * counts from the same external store, so content changes never
 * re-render the page either.
 */
function FooterCountsChip({show}: { show: boolean }) {
    const counts = React.useSyncExternalStore(
        footerStore.subscribe,
        footerStore.getCounts,
        footerStore.getCounts
    );
    if (!show || !counts) return null;
    return (
        <span
            className="hidden lg:inline font-mono tabular-nums shrink-0"
            title={`${counts.words.toLocaleString()} words · ${counts.chars.toLocaleString()} characters · ~${counts.readingMinutes} min read`}
        >
      {counts.words.toLocaleString()} words · {counts.chars.toLocaleString()} chars
    </span>
    );
}

/**
 * A VSCode-style status bar at the bottom of the screen.
 *
 * Always visible (regardless of `showCursorPositionInFooter` setting)
 * and shows a rich set of contextual information:
 *
 *   Left side:
 *     - Active project name (or "Default")
 *     - Active file path: "folder › file.py"
 *     - File size (e.g., "0.4 KB")
 *     - Cursor position: "Ln 1, Col 1"
 *     - Selection info: "2 chars selected" (when there is one)
 *
 *   Right side:
 *     - Line ending: "LF"
 *     - Encoding: "UTF-8"
 *     - Language mode: "Python"
 *     - Indentation: "Spaces: 4"
 *     - Git branch + dirty file count (when git is available)
 *     - Keyboard shortcuts hint
 *
 * The live cursor position + selection size are read from the
 * `footerStore` external store by the small `FooterCursorChip` below
 * ((U4)) — gated by `showCursorPositionInFooter` — so caret
 * moves no longer re-render the whole page.
 */
function Footer({
                    showCursor = false,
                    showCounts = false,
                    folderName,
                    fileName,
                    fileSize,
                    isPythonFile,
                    indentWidth,
                    gitBranch,
                    gitDirtyCount,
                    projectName,
                    running,
                    dirty,
                    folderSlug,
                    pythonInterpreter,
                    onPinnedInterpreter,
                    onOpenDependencyManager,
                    onBranchChanged,
                }: {
    showCursor?: boolean;
    /** show the live word/char counts chip. */
    showCounts?: boolean;
    folderName?: string;
    fileName?: string;
    fileSize?: number;
    isPythonFile?: boolean;
    indentWidth?: number;
    gitBranch?: string | null;
    gitDirtyCount?: number;
    projectName?: string;
    running?: boolean;
    dirty?: boolean;
    /** The active folder slug + configured interpreter — feed the
     *  EnvInterpreterPill (which also auto-applies the folder's pinned
     *  interpreter, once per folder). */
    folderSlug?: string | null;
    pythonInterpreter?: string | null;
    onPinnedInterpreter?: (pinnedPath: string) => void;
    onOpenDependencyManager?: () => void;
    /** fired after a branch switch/create — the page re-fetches
     *  git status AND refreshes the file tree (a branch swap can change
     *  the files on disk). */
    onBranchChanged?: () => void;
}) {
    // Format the file size human-readably (B / KB / MB).
    const sizeStr = (() => {
        if (fileSize == null) return "";
        if (fileSize < 1024) return `${fileSize} B`;
        if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
        return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
    })();

    const langMode = isPythonFile ? "Python" : fileName ? "Plain Text" : "";

    return (
        <footer
            className="shrink-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            role="contentinfo"
            aria-label="Status bar"
        >
            <div
                className="px-3 py-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground overflow-hidden">
                {/* ─── Left side: project, file, size, cursor pos ─────── */}
                <p className="flex items-center gap-2 min-w-0 truncate">
                    {/* Active project chip */}
                    <span
                        className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-foreground/80 font-medium shrink-0"
                        title={`Active project: ${projectName ?? "Default (python_scripts/)"}`}
                    >
            <code className="font-mono text-[9px]">{projectName ?? "Default"}</code>
          </span>

                    {/* File path: folder › file */}
                    {fileName && (
                        <span
                            className="hidden md:inline-flex items-center gap-1 min-w-0 truncate"
                            title={folderName ? `${folderName}/${fileName}` : fileName}
                        >
              {folderName && (
                  <>
                      <span className="truncate text-foreground/70">{folderName}</span>
                      <span className="text-muted-foreground/60">›</span>
                  </>
              )}
                            <span className="truncate text-foreground/90 font-medium">{fileName}</span>
                            {dirty && (
                                <span className="text-amber-500 ml-0.5" title="Unsaved Changes">●</span>
                            )}
            </span>
                    )}

                    {/* File size */}
                    {sizeStr && (
                        <span className="hidden lg:inline tabular-nums shrink-0" title="File size">
              {sizeStr}
            </span>
                    )}

                    {/* Cursor position + selection info — rendered
              by the tiny FooterCursorChip, which subscribes to the
              footerStore external store directly. Typing updates the
              chip WITHOUT re-rendering this page. */}
                    <VimModeChip/>
                    <ExtensionStatusChip/>
                    <OfflineIndicator/>
                    <TestStatusBadge/>
                    <FooterCursorChip show={showCursor}/>

                    {/* live word/char counts — same external-store
              pattern as the cursor chip. */}
                    <FooterCountsChip show={showCounts}/>

                    {/* Running indicator */}
                    {running && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 shrink-0"
                              title="A script is currently running">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"/>
              Running
            </span>
                    )}
                </p>

                {/* ─── Right side: interpreter pill, lang, indent, encoding, EOL, git ── */}
                <p className="flex flex-wrap items-center gap-2 justify-end shrink-0">
                    <EnvInterpreterPill
                        folderSlug={folderSlug}
                        pythonInterpreter={pythonInterpreter}
                        onPinnedInterpreter={onPinnedInterpreter}
                        onOpenDependencyManager={onOpenDependencyManager}
                    />
                    {langMode && (
                        <span className="hidden sm:inline shrink-0" title="Language mode">
              {langMode}
            </span>
                    )}
                    {indentWidth != null && (
                        <span className="hidden sm:inline shrink-0" title={`Indentation: ${indentWidth} spaces`}>
              Spaces: {indentWidth}
            </span>
                    )}
                    <span className="hidden md:inline shrink-0" title="Encoding">UTF-8</span>
                    <span className="hidden md:inline shrink-0" title="Line ending">LF</span>

                    {/* Git status chip — now a branch PICKER (click to
              switch / create branches) instead of a static label. */}
                    {gitBranch && (
                        <GitBranchPicker
                            current={gitBranch}
                            dirtyCount={gitDirtyCount ?? 0}
                            onBranchSwitched={onBranchChanged}
                        />
                    )}

                    {/* Keyboard shortcut hints */}
                    <span className="flex items-center gap-1 shrink-0">
            <kbd className="px-1 py-0.5 rounded bg-muted text-foreground/80 font-mono text-[9px]">⌘K</kbd>
            <span className="hidden sm:inline">search</span>
          </span>
                    <span className="hidden sm:flex items-center gap-1 shrink-0">
            <kbd className="px-1 py-0.5 rounded bg-muted text-foreground/80 font-mono text-[9px]">⌘↵</kbd>
            <span>run</span>
          </span>
                </p>
            </div>
        </footer>
    );
}

/* ------------------------------------------------------------------ */
/*  Run-all batch dialog                                         */

/* ------------------------------------------------------------------ */
function BatchDialog({
                         open,
                         onOpenChange,
                         running,
                         results,
                         folderName,
                         onJumpToFile,
                         onOpenResult,
                     }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    running: boolean;
    results: BatchResult[] | null;
    folderName?: string;
    onJumpToFile: (fileName: string) => void;
    onOpenResult?: (r: BatchResult) => void;
}) {
    const passCount = results?.filter((r) => r.ok).length ?? 0;
    const failCount = results ? results.length - passCount : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="size-4 text-emerald-500"/>
                        Run All In Folder
                        {folderName && (
                            <span className="text-sm font-normal text-muted-foreground">
                · {folderName}
              </span>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {/* the batch runs EVERY runnable language now —
                .py keeps its full pipeline; .js / .ts / .m / .R / .sh /
                .java / .c / .cpp / .rb / .php / .go run through their
                own runtimes. */}
                        Runs every runnable file in this
                        folder sequentially — Python with its full pipeline, other
                        languages through their own runtimes. Each is capped at 60&nbsp;s.
                        Click any row to open it in the main output panel.
                    </DialogDescription>
                </DialogHeader>

                {running ? (
                    <div className="py-10 flex flex-col items-center gap-3">
                        <RefreshCw className="size-6 animate-spin text-emerald-500"/>
                        <p className="text-sm text-muted-foreground">
                            Running all scripts in {folderName}…
                        </p>
                    </div>
                ) : results ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm">
                            <Badge variant="secondary" className="gap-1.5">
                                <FileCode2 className="size-3"/>
                                {results.length} total
                            </Badge>
                            <Badge
                                className="gap-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20">
                                {passCount} passed
                            </Badge>
                            {failCount > 0 && (
                                <Badge variant="destructive" className="gap-1.5">
                                    {failCount} failed
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs ml-auto"
                                onClick={() => {
                                    const csv = [
                                        "file,ok,exitCode,durationMs,stdoutBytes",
                                        ...results.map((r) =>
                                            `"${r.file}",${r.ok},${r.exitCode},${r.durationMs},${r.stdoutBytes}`
                                        ),
                                    ].join("\n");
                                    const blob = new Blob([csv], {type: "text/csv"});
                                    const a = document.createElement("a");
                                    a.href = URL.createObjectURL(blob);
                                    a.download = "run-all-results.csv";
                                    a.click();
                                    URL.revokeObjectURL(a.href);
                                }}
                                title="Export results as CSV"
                            >
                                <Download className="size-3"/>
                                CSV
                            </Button>
                        </div>
                        <ul className="max-h-[50vh] overflow-auto divide-y rounded-lg border">
                            {results.map((r) => (
                                <li key={r.file} className="flex items-stretch">
                                    <button
                                        onClick={() => onOpenResult ? onOpenResult(r) : onJumpToFile(r.file)}
                                        className="flex-1 text-left px-3 py-2.5 hover:bg-accent/40 transition-colors flex items-center gap-3 group"
                                    >
                                        {r.ok ? (
                                            <span className="size-2 rounded-full bg-emerald-500 shrink-0"/>
                                        ) : (
                                            <span className="size-2 rounded-full bg-red-500 shrink-0"/>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                {r.file}
                                            </p>
                                            {!r.ok && r.stderr && (
                                                <p className="text-xs text-red-500 dark:text-red-400 truncate font-mono">
                                                    {r.stderr.split("\n").filter(Boolean).slice(-1)[0]}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground text-right shrink-0">
                                            <div>{(r.durationMs / 1000).toFixed(2)}s</div>
                                            {r.figures.length > 0 && (
                                                <div className="text-emerald-500">
                                                    {r.figures.length} fig
                                                    {r.figures.length === 1 ? "" : "s"}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="py-6 text-sm text-muted-foreground text-center">
                        Preparing to run all scripts…
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ─── EditorBreadcrumbs ────────────────────────────────────────────
 * The slim symbol-path bar above the editor. It lives OUTSIDE Home so
 * the caret feed can subscribe to the external footer store directly
 * (useSyncExternalStore) — caret moves update this 24px bar and the
 * footer chip WITHOUT re-rendering the page tree (the same pattern
 * FooterCursorChip uses). */
function EditorBreadcrumbs({
                               symbols,
                               fileName,
                               fileId,
                               visible,
                               onGotoLine,
                           }: {
    symbols: PythonSymbol[];
    fileName?: string;
    fileId: string | null;
    visible: boolean;
    onGotoLine: (line: number) => void;
}) {
    const cursor = React.useSyncExternalStore(
        footerStore.subscribe,
        footerStore.getCursor,
        footerStore.getCursor
    );
    return (
        <BreadcrumbsBar
            symbols={symbols}
            caretLine={cursor?.line ?? null}
            fileName={fileName}
            fileId={fileId}
            onGotoLine={onGotoLine}
            visible={visible}
        />
    );
}
