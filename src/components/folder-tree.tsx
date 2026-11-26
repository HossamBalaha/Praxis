"use client";

import * as React from "react";
import {
    AlertTriangle,
    Archive,
    ArrowUp,
    ArrowUpDown,
    Atom,
    AtSign,
    Award,
    Binary,
    Bookmark,
    BookMarked,
    BookOpen,
    Box,
    Boxes,
    Braces,
    Briefcase,
    Bug,
    Calendar,
    Camera,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsDown,
    CircleAlert,
    ClipboardCopy,
    ClipboardPaste,
    Clock,
    Cloud,
    Code2,
    CodeXml,
    Coffee,
    Columns2,
    Compass,
    Copy,
    Cpu,
    Crosshair,
    Crown,
    Database,
    Database as DatabaseIcon,
    Download,
    Eye,
    EyeOff,
    File,
    FileArchive,
    FileCode,
    FileCode2,
    FileCog,
    FileImage,
    FileJson,
    FileMinus,
    FileOutput,
    FilePlus,
    FileQuestion,
    Files,
    FileSearch,
    FileSpreadsheet,
    FileTerminal,
    FileText,
    FileType,
    FileType2,
    FileWarning,
    Film,
    Flag,
    Flame,
    FlaskConical,
    Folder,
    FolderCode,
    FolderGit2,
    FolderInput,
    FolderOpen,
    FolderOpen as FolderOpenIcon,
    FolderPlus,
    FolderSearch,
    FolderTree as FolderTreeIcon,
    FoldVertical,
    Funnel,
    Gem,
    GitBranch,
    GitCompare,
    Github,
    GitMerge,
    Globe,
    Hammer,
    HardDrive,
    Hash,
    Heart,
    Image as ImageIcon2,
    Import,
    IndentIncrease,
    Info,
    Key,
    Layers,
    Leaf,
    Lightbulb,
    Link2,
    ListTree,
    Loader2,
    Lock,
    MessageCircleQuestion,
    Moon,
    Music,
    Package,
    Palette as PaletteIcon,
    Palette,
    PanelLeftClose,
    Paperclip,
    Pencil,
    Pin,
    Play,
    Plus,
    Puzzle,
    RefreshCw,
    Rocket,
    Rows2,
    Rows3,
    Save,
    Scissors,
    Search,
    Shield,
    Sigma,
    Sparkles,
    SquareSigma,
    SquareTerminal,
    Star,
    StarOff,
    Sun,
    Table,
    Tag,
    Target,
    Terminal,
    Trash2,
    UnfoldVertical,
    Upload,
    Wand2,
    Wrench,
    X,
    Zap,
} from "lucide-react";
import {cn} from "@/lib/utils";
import {STORAGE_PREFIX} from "@/lib/config";
import {SPLIT_EDITOR_DOWN_EVENT, SPLIT_EDITOR_EVENT, type SplitEditorDetail} from "@/components/editor-tabs";
import {
    exportCapabilitiesForKind,
    type ExportFileKind,
    FILE_EXPORT_EVENT,
    type FileExportDetail
} from "@/lib/export-events";
// which non-Python kinds can run (js / ts / matlab / r /
// shell / java / c / cpp through the runtime registry) — plus the
// extension-aware terminal command for Run In Terminal (drift fix:
// never python3 for a non-Python file).
import {isRunnableKind, runLanguageForFile, terminalRunCommandFor} from "@/lib/run-languages";
import {queueConsoleRun, queueInlineAi} from "@/lib/pending-console-run";
// language-aware wording (noun + markdown fence) for the AI ▸
// Explain / Review & Improve file prompts — see handleAiOnFile.
import {aiPromptNounFor} from "@/lib/ai-menu-lang";
// the canonical right-click group gating (menuGroupsForKind) —
// consumed by the ONE shared data-driven renderer below.
import {MenuGroups, MenuHeader} from "@/components/context-menu-groups";
// the shared formattable-kinds registry — drives the explorer's
// right-click Format ▸ submenu for EVERY language.
import {formattableKindFor} from "@/lib/formattable-kinds";
import {requestCompress} from "@/components/compress-dialog";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {ScrollArea, ScrollBar} from "@/components/ui/scroll-area";
import {Input} from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {useToast} from "@/hooks/use-toast";
// the Explorer header label's translator (i18n: explore).
import {useChromeLanguage} from "@/lib/i18n-react";
// the per-browser file power-op stores (run entry
// point, AI context attachment, read-only locks).
import {
    getAiContextFile,
    isFileLocked,
    isRunEntryPoint,
    setAiContextFile,
    setFileLocked,
    setRunEntryPoint,
} from "@/lib/workspace-files";
import type {FileExample} from "@/lib/examples";
// the ~5 MB example library is now a lazy dynamic chunk
// (src/hooks/use-examples.ts) — see the hook's header comment.
import {useExamples} from "@/hooks/use-examples";

export interface TreeFolder {
    name: string;
    slug: string;
    files: TreeFile[];
    /** True for the synthetic PROJECT-ROOT entry (files that sit
     * directly in python_scripts/ or the active project root — user
     * report: "if there are files in the main folder, they are not
     * displayed and only folders are displayed"). The slug is
     * slugify("."), which every route resolves to the scripts root
     * itself, so root files use the same open/save/run/export paths
     * as files inside real folders. */
    isRoot?: boolean;
    /** every SUBFOLDER path inside this folder
     *  (relative, POSIX separators, including EMPTY subfolders) —
     *  returned by /api/folders. The tree renders folder rows from
     *  this ∪ the files' own `dir` values so a just-created empty
     *  subfolder displays immediately. */
    dirs?: string[];
    /** hasReadme / readmeFile were REMOVED — README.md is
     *  listed as a normal file in `files` (kind "markdown"), so the
     *  folder-header README badge is gone too. The folder Properties
     *  dialog still reports a README via /api/folder-stats. */
    isEmpty?: boolean;
    tags?: string[];
    dataFiles?: { name: string; size: number; ext: string }[];
}

export interface TreeFile {
    name: string;
    slug: string;
    size: number;
    description?: string;
    tags?: string[];
    mtime?: number;
    /** File kind — drives the icon + the renderer (CodeViewer vs FileViewer). */
    kind?: import("@/lib/scripts").FileKind;
    /** Lowercase extension including the dot. */
    ext?: string;
    /** relative folder path INSIDE the folder ("" or
     *  undefined = folder root). The tree renders expandable folder rows
     * from these; the slug encodes the full relative path. */
    dir?: string;
    /** relative path incl. filename (equals `name` at the
     *  folder root). */
    path?: string;
}

interface FolderTreeProps {
    folders: TreeFolder[];
    loading: boolean;
    error: string | null;
    selectedFolderSlug: string;
    selectedFileSlug: string;
    onSelectFile: (folderSlug: string, fileSlug: string) => void;
    /** Refreshes the folder tree. Returns a promise when the caller
     *  is async — mutations that set a selection afterwards want to
     *  AWAIT the refresh first (see handleCreateFile) so the page's
     *  selection guard doesn't race the stale folders list. */
    onRefresh: () => void | Promise<void>;
    favorites: Set<string>;
    onToggleFavorite: (fileSlug: string) => void;
    sortMode: "alpha" | "mtime";
    onToggleSort: () => void;
    /** hidden dot-files/dot-directories are shown. */
    showHidden?: boolean;
    gitStatusMap?: Record<string, string>;
    showFileSize?: boolean;
    /** Show the total file size of all scripts in each folder next to
     *  the file count in the folder header . */
    showFolderSize?: boolean;
    /** Show the `#tag` chips (folder header badges + per-file chip)
     * parsed from `# tags:` comments. Defaults to ON; wired to the
     * Settings → Editor → "Show #tags in the explorer" toggle (user
     * request: "make it configurable to view or hide them"). */
    showTags?: boolean;
    onDataFileBrowserOpen?: () => void;
    /** Show a colored dot next to each file name indicating the most
     *  recent run's outcome (green=ok, red=fail) — wires up the
     *  `showLastRunStatusInDropdown` setting that used to live on the
     *  (now-removed) FileSelect component. */
    showLastRunStatus?: boolean;
    /** Map of file slug → most-recent-run `ok` value, used to render the
     *  status dot. Files not present in the map have no dot. */
    lastRunStatus?: Map<string, boolean>;
    // ─── Project / File menu ────────────────────────────────────────
    // The project switcher + ZIP upload used to live in the header.
    // They're now in the top MenuBar (File → Open project). The "+"
    // toolbar button in the sidebar still exposes "Upload ZIP as new
    // project…" for convenience. The "Create new project…" dialog is
    // triggered via the `praxis:create-project` window event.
    /** Available projects (top-level directories under the app root). */
    projects?: { name: string; path: string; scriptCount: number }[];
    /** The active project's absolute path (empty = default python_scripts/). */
    activeProject?: string;
    /** Called when the user selects a project from the MenuBar's File → Open project. */
    onSelectProject?: (projectPath: string) => void;
    /** Called when the user clicks "Upload ZIP…" in the "+" toolbar or MenuBar. */
    onUploadZip?: () => void;
    /** True while a ZIP upload is in flight — disables the menu item. */
    uploadingZip?: boolean;
    /** called when the user picks "Open folder…" in the "+"
     * toolbar dropdown — opens the FolderPickerDialog so a folder
     * anywhere on the machine can be opened as the active project
     *. */
    onOpenFolderPicker?: () => void;
    /** Called when the user creates a new empty project. */
    onProjectCreated?: (projectPath: string, projectName: string) => void;
    /** Called when files are dropped onto a folder row OR when the
     * user finishes the import-conflict dialog. The parent should
     * refresh its folder tree to show the new files. */
    onFilesImported?: (folderSlug: string, fileNames: string[]) => void;
    /** Called after a file is deleted via the right-click context menu.
     *  The parent should refresh its folder tree + clear the selection
     *  if the deleted file was the active one. */
    onFileDeleted?: (folderSlug: string, fileSlug: string) => void;
    /** Called after a file is renamed via the right-click context menu.
     *  The parent should refresh its folder tree + update the selection
     *  if the renamed file was the active one. */
    onFileRenamed?: (folderSlug: string, oldSlug: string, newSlug: string) => void;
    /** Called when the user clicks "Open containing folder" on a file's
     * context menu. The parent opens the OS file explorer at that
     * location via /api/open-folder. */
    onOpenFolder?: (folderSlug: string, fileSlug: string) => void;
    /** Called when the user clicks "Download" on a file's context menu.
     * The parent triggers the existing download flow. */
    onDownloadFile?: (folderSlug: string, fileSlug: string) => void;
    /** Called when the user clicks the collapse button in the sidebar
     * header. The parent should hide the sidebar so the collapsed rail
     * appears with an expand button. */
    onCollapse?: () => void;
    /** Called after a folder (folder) is deleted via the right-click
     *  context menu. The parent should refresh its folder tree + clear
     *  the selection if the deleted folder was the active one. */
    onFolderDeleted?: (folderSlug: string) => void;
    /** Called after a folder (folder) is renamed via the right-click
     *  context menu. The parent should refresh its folder tree + update
     *  the selection if the renamed folder was the active one. */
    onFolderRenamed?: (oldSlug: string, newName: string) => void;
    // ─── New file/folder ops (VSCode-like) ──────────────────────────
    /** Called after a new folder folder is created via the "New folder"
     *  toolbar button. The parent should refresh its folder tree. */
    onFolderCreated?: (folderSlug: string, folderName: string) => void;
    /** Called after a new file is created via the "New file" toolbar
     *  button. The parent should refresh its folder tree + optionally
     *  open the new file in the editor. */
    onFileCreated?: (folderSlug: string, fileSlug: string, fileName: string) => void;
    /** Called when the user picks an example from the "New example…"
     * context submenu — the parent creates the file in THIS folder
     * (right-click target) and refreshes. `sub` targets a
     * NESTED subfolder row. */
    onCreateExample?: (exampleId: string, folderSlug: string, sub?: string) => void;
    /** Called after a file is duplicated via the right-click context
     *  menu. The parent should refresh its folder tree. */
    onFileDuplicated?: (folderSlug: string, newSlug: string, newName: string) => void;
    /** Called after a file is moved (cut+paste) between folders via the
     *  right-click context menu. The parent should refresh + update the
     *  selection if the moved file was the active one. */
    onFileMoved?: (
        oldFolderSlug: string,
        oldFileSlug: string,
        newFolderSlug: string,
        newFileSlug: string,
        newName: string
    ) => void;
    /** Called after a file is copied (copy+paste) to another folder
     *  via the right-click context menu. The parent should refresh. */
    onFileCopied?: (
        fromFolderSlug: string,
        fromFileSlug: string,
        toFolderSlug: string,
        newFileSlug: string,
        newName: string
    ) => void;
    /** Called when the user right-clicks a FILE → "Run this file"
     * (F8). Python files only — the menu item is hidden for other
     * kinds. The parent makes the file active and runs it. */
    onRunFile?: (folderSlug: string, fileSlug: string) => void;
    /** Called when the user right-clicks a FOLDER → "Run all scripts
     * in this folder" (F7). The parent runs the folder batch.
     * `sub` scopes the batch to that NESTED subfolder. */
    onRunAllInFolder?: (folderSlug: string, sub?: string) => void;
    /** file right-click "AI ▸" actions — the tree fetches the
     *  file itself and hands a ready prompt to the page's AI chat
     *  (sendAiPrompt opens the sidebar). */
    onAiPrompt?: (text: string) => void;
    /** file right-click "AI ▸ Generate tests for this file" —
     *  works without the file being open (explicit slugs). */
    onGenerateTestsForFile?: (folderSlug: string, fileSlug: string, fileName: string) => void;
    // ─── Recent-files section config ────────────────
    /** Show the "Recent" (recently modified) section at the top of the
     *  explorer. Default true. */
    showRecentFiles?: boolean;
    /** How many entries the Recent section lists (1–20, default 5). */
    recentFilesCount?: number;
    /** how long (seconds) a freshly added favorite keeps its
     *  highlight (ring + bold name + pop) before reverting to a plain
     *  star. Default 10; 0 disables the highlight. Configurable in
     *  Settings → Editor → "New-favorite highlight (seconds)". */
    favHighlightSeconds?: number;
    /** the Python interpreter selected in Settings → Python —
     *  sent to /api/folder-lint so the Issues report runs in the SAME
     *  environment the "Install ruff" button installs into. Empty =
     *  auto-detect (server-side). */
    pythonInterpreter?: string;
    /** right-click a file → the Format ▸ submenu — ONE generic handler
     *  for EVERY formattable kind (python black/ruff + re-indent, and
     *  all 36 offline formatters via lib/format-any). mode is "format"
     *  or "indent". Replaces the five per-kind props (AutoIndent /
     *  Markdown / HTML / TOML / JSON) so the explorer menu is exactly
     *  as complete as the editor's — every language, same options. */
    onFormatFile?: (
        folderSlug: string,
        fileSlug: string,
        mode: "format" | "indent",
        kind?: import("@/lib/scripts").FileKind
    ) => void;
}

const TREE_EXPANDED_KEY = `${STORAGE_PREFIX}.tree-expanded`;

/**
 * Module-level Set of handled event nonces — used to deduplicate
 * `praxis:new-folder` / `praxis:new-file` / `praxis:create-project`
 * events across the multiple FolderTree instances (desktop + mobile
 * drawer) that page.tsx mounts. Without this, both instances would
 * open their dialogs in response to a single menu-bar click.
 *
 * Module-scope (not per-instance) so all instances share the same Set.
 * Entries are cleaned up after 1 second so the Set doesn't grow
 * unboundedly.
 */
const seenMenuEventNonces = new Set<number>();

/** Isomorphic layout effect for the virtualized tree — useLayoutEffect
 *  on the client (the spacer heights / row measurements must settle
 *  before paint or the window flashes empty), plain useEffect during
 *  SSR, where layout effects do nothing and warn. */
const useTreeLayoutEffect =
    typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** Format a byte count as a human-readable size string (B / K / M).
 *  Used by the per-folder file-size stat  and per-file size
 *  badges in the explorer. Returns "empty" for 0 bytes, "1 B" for
 *  sub-KB sizes, "1.0K" for KB, "1.0M" for MB. */
function formatSize(bytes: number): string {
    if (bytes <= 0) return "empty";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

/* ------------------------------------------------------------------ */
/* — file/folder count & size badges */

/* ------------------------------------------------------------------ */

/** ("put the number of the files and size in badges or
 *  something similar for the folders/files"): a small pill badge used
 *  across the tree rows — main folder headers, subfolder rows and file
 *  rows — so counts and sizes read as compact chips instead of loose
 *  right-aligned digits.
 *
 *  Two variants:
 *  - "count" (file/folder count): sky-tinted pill, always visible.
 *  - "size"  (byte size):         neutral muted pill, shown when the
 *                                 corresponding size setting is on.
 *  Both are tabular-nums so digits don't jitter on refresh. */
function TreeBadge({
                       children,
                       variant,
                       title,
                   }: {
    children: React.ReactNode;
    variant: "count" | "size";
    title?: string;
}) {
    return (
        <span
            title={title}
            className={cn(
                "inline-flex items-center justify-center rounded-full px-1.5 leading-[14px] text-[9px] font-medium tabular-nums shrink-0 whitespace-nowrap",
                variant === "count"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "bg-muted text-muted-foreground"
            )}
        >
      {children}
    </span>
    );
}

/** total byte size of every file inside a subfolder subtree
 *  (the direct files PLUS everything in deeper nested folders). */
function subtreeSize(files: TreeFile[], dirPath: string): number {
    return files
        .filter(
            (f) =>
                (f.dir ?? "") === dirPath ||
                (f.dir ?? "").startsWith(dirPath + "/")
        )
        .reduce((n, f) => n + f.size, 0);
}

/** JIT-safe static indent classes for the (now flattened / windowed)
 *  tree rows — Tailwind can't compile template-literal classes, so the
 *  depth → padding map stays a chain of literals. Indentation was
 *  ALWAYS explicit per row (never nested-DOM padding), so flattening
 *  the recursive render into a row list keeps it pixel-identical. */
function treeRowFilePadClass(depth: number): string {
    return depth <= 0
        ? "pl-7"
        : depth === 1
            ? "pl-[42px]"
            : depth === 2
                ? "pl-[56px]"
                : depth === 3
                    ? "pl-[70px]"
                    : "pl-[84px]";
}

function treeRowFolderPadClass(depth: number): string {
    return depth <= 0
        ? "pl-4"
        : depth === 1
            ? "pl-[30px]"
            : depth === 2
                ? "pl-[44px]"
                : depth === 3
                    ? "pl-[58px]"
                    : "pl-[72px]";
}

/** Pick the lucide icon for a file kind. Used by the file row so
 *  each kind is visually distinguishable in the tree. */
function fileKindIcon(kind?: TreeFile["kind"]) {
    switch (kind) {
        case "python":
            return FileCode2;
        case "markdown":
            return FileText;
        case "text":
            return FileText;
        case "json":
            return FileJson;
        case "yaml":
            return FileJson;
        case "toml":
            return FileJson;
        case "sql":
            return Database;
        // the web-dev + engineering code kinds.
        case "javascript":
            return FileCode2;
        case "typescript":
            return FileCode2;
        case "matlab":
            return FileCode2;
        case "java":
            return FileCode2;
        case "c":
            return FileCode2;
        case "cpp":
            return FileCode2;
        case "r":
            return FileCode2;
        case "shell":
            return Terminal;
        // +44: the remaining registry languages.
        case "ruby":
            return FileCode2;
        case "php":
            return FileCode2;
        case "go":
            return FileCode2;
        case "lua":
            return FileCode2;
        case "perl":
            return FileCode2;
        case "rust":
            return FileCode2;
        case "julia":
            return FileCode2;
        case "kotlin":
            return FileCode2;
        case "swift":
            return FileCode2;
        case "powershell":
            return Terminal;
        case "batch":
            return Terminal;
        case "zig":
            return FileCode2;
        case "dart":
            return FileCode2;
        case "groovy":
            return FileCode2;
        case "scala":
            return FileCode2;
        case "elixir":
            return FileCode2;
        case "haskell":
            return FileCode2;
        case "erlang":
            return FileCode2;
        case "clojure":
            return FileCode2;
        case "ocaml":
            return FileCode2;
        case "fsharp":
            return FileCode2;
        case "graphql":
            return FileCode2;
        case "css":
            return FileType;
        case "html":
            return FileType;
        case "csv":
            return FileText;
        case "spreadsheet":
            return FileSpreadsheet;
        case "image":
            return FileImage;
        case "video":
            return Film;
        case "audio":
            return Music;
        case "pdf":
            return FileType;
        case "ipynb":
            return FileCode2;
        default:
            return FileQuestion;
    }
}

/** Pick a tailwind color class for a file kind's icon. */
function fileKindColor(kind?: TreeFile["kind"]): string {
    switch (kind) {
        case "python":
            return "text-emerald-500";
        case "markdown":
            return "text-cyan-500";
        case "text":
            return "text-muted-foreground";
        case "json":
            return "text-amber-500";
        case "yaml":
            return "text-amber-500";
        case "toml":
            return "text-amber-500";
        case "sql":
            return "text-indigo-500";
        case "r":
            return "text-blue-500";
        // Colors: js yellow, ts sky, matlab orange, java rose,
        // c slate, cpp indigo — each distinct in the tree.
        case "javascript":
            return "text-yellow-500";
        case "typescript":
            return "text-sky-600";
        case "matlab":
            return "text-orange-500";
        case "java":
            return "text-rose-600";
        case "c":
            return "text-slate-500";
        case "cpp":
            return "text-indigo-500";
        case "shell":
            return "text-teal-600";
        // Colors: ruby rose, php indigo, go cyan.
        case "ruby":
            return "text-rose-500";
        case "php":
            return "text-indigo-400";
        case "go":
            return "text-cyan-600";
        // Colors: the six new registry languages — each distinct.
        case "lua":
            return "text-blue-600";
        case "perl":
            return "text-lime-600";
        case "rust":
            return "text-orange-600";
        case "julia":
            return "text-violet-600";
        case "kotlin":
            return "text-purple-600";
        case "swift":
            return "text-orange-500";
        case "powershell":
            return "text-sky-700";
        case "batch":
            return "text-muted-foreground";
        case "zig":
            return "text-amber-600";
        case "dart":
            return "text-cyan-600";
        case "groovy":
            return "text-emerald-600";
        case "scala":
            return "text-red-600";
        case "elixir":
            return "text-fuchsia-600";
        case "haskell":
            return "text-violet-600";
        case "erlang":
            return "text-red-600";
        case "clojure":
            return "text-emerald-600";
        case "ocaml":
            return "text-orange-600";
        case "fsharp":
            return "text-sky-600";
        case "graphql":
            return "text-pink-600";
        case "css":
            return "text-sky-500";
        case "html":
            return "text-orange-500";
        case "csv":
            return "text-sky-500";
        case "spreadsheet":
            return "text-emerald-500";
        case "image":
            return "text-purple-500";
        case "video":
            return "text-rose-500";
        case "audio":
            return "text-fuchsia-500";
        case "pdf":
            return "text-red-500";
        case "ipynb":
            return "text-orange-500";
        default:
            return "text-muted-foreground/50";
    }
}

/** Fuzzy match: returns true if every char in `query` appears in
 *  `target` in order (case-insensitive). e.g. "mdv" matches
 *  "Mean and Variance.py" (m→M, d→"anD", v→"Variance"). Empty query
 *  matches everything. */
function fuzzyMatch(query: string, target: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t.charCodeAt(ti) === q.charCodeAt(qi)) qi++;
    }
    return qi === q.length;
}

/** Return the indices in `target` that match the fuzzy `query`
 *  (case-insensitive, in-order). Used to highlight matched chars in
 *  the tree filter. Returns null if there's no match or no query. */
function fuzzyMatchIndices(query: string, target: string): number[] | null {
    if (!query) return null;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    const indices: number[] = [];
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t.charCodeAt(ti) === q.charCodeAt(qi)) {
            indices.push(ti);
            qi++;
        }
    }
    return qi === q.length ? indices : null;
}

/** — one example row in the "New example…" cascade (extracted
 *  so the leaf item markup is written once instead of duplicated per
 *  nesting level). Creates the file in the right-clicked folder. */
function TreeExampleItem({
                             ex,
                             folderSlug,
                             folderName,
                             sub,
                             onCreateExample,
                         }: {
    ex: FileExample;
    folderSlug: string;
    folderName: string;
    /** relative sub-folder path ("" / undefined = folder root). */
    sub?: string;
    onCreateExample: (exampleId: string, folderSlug: string, sub?: string) => void;
}) {
    return (
        <ContextMenuItem
            onClick={() => onCreateExample(ex.id, folderSlug, sub)}
            className="gap-2 cursor-pointer"
            title={`${ex.description} — created in "${folderName}${sub ? "/" + sub : ""}", styled per Settings → Editor → Naming style.`}
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
        </ContextMenuItem>
    );
}

/** Render `text` with the chars at the given indices highlighted.
 *  Used by the fuzzy filter to show which chars matched the query. */
function HighlightedText({
                             text,
                             indices,
                         }: {
    text: string;
    indices: number[] | null;
}) {
    if (!indices || indices.length === 0) return <>{text}</>;
    const set = new Set(indices);
    return (
        <>
            {Array.from(text).map((ch, i) =>
                set.has(i) ? (
                    <mark
                        key={i}
                        className="bg-amber-300/70 dark:bg-amber-500/30 text-foreground rounded-[2px]"
                    >
                        {ch}
                    </mark>
                ) : (
                    <React.Fragment key={i}>{ch}</React.Fragment>
                )
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* — module-level helpers */

/* ------------------------------------------------------------------ */

/** All case-insensitive substring occurrence indices (the
 *  folder-scoped find bubbles EVERY matching letter, unlike the global
 *  fuzzy filter which only marks one char per hit). */
function substringIndices(query: string, target: string): number[] | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const t = target.toLowerCase();
    const indices: number[] = [];
    let idx = t.indexOf(q);
    while (idx !== -1) {
        for (let i = 0; i < q.length; i++) indices.push(idx + i);
        idx = t.indexOf(q, idx + q.length);
    }
    return indices.length > 0 ? indices : null;
}

// ─── per-item icon + color customization (localStorage) ──────────

const APPEARANCE_KEY = `${STORAGE_PREFIX}.appearance`;
const FAV_NOTED_KEY = `${STORAGE_PREFIX}.fav-noted`;

/** One appearance override: a lucide icon id, an icon color and/or a
 * text color. the single `color` field is now split —
 *  `iconColor` tints ONLY the icon, `textColor` tints ONLY the name.
 *  A legacy `color` (legacy) still applies to BOTH, so
 *  existing customizations keep rendering exactly as before. */
interface AppearanceEntry {
    icon?: string;
    /** Legacy — applies to both the icon and the name. */
    color?: string;
    /** Icon-only tint (wins over `color` for the icon). */
    iconColor?: string;
    /** Text-only tint (wins over `color` for the name). */
    textColor?: string;
}

interface AppearanceMap {
    folders?: Record<string, AppearanceEntry>;
    files?: Record<string, AppearanceEntry>;
}

/** Effective icon color for an entry (iconColor → color → none). */
function appearanceIconColor(e: AppearanceEntry | undefined): string | undefined {
    return e?.iconColor ?? e?.color;
}

/** Effective text color for an entry (textColor → color → none). */
function appearanceTextColor(e: AppearanceEntry | undefined): string | undefined {
    return e?.textColor ?? e?.color;
}

function loadAppearance(): AppearanceMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(APPEARANCE_KEY);
        return raw ? (JSON.parse(raw) as AppearanceMap) : {};
    } catch {
        return {};
    }
}

/** localStorage write — the instant offline cache (unchanged behavior). */
function saveAppearanceLocal(map: AppearanceMap) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(map));
    } catch { /* quota */
    }
}

/* ─── Project-folder appearance sync ──────────────────────────────────────

Every save is DUAL-WRITTEN: localStorage (instant, offline) and
`.praxis/appearance.json` in the ACTIVE project folder (debounced
POST — the icon/color picker fires once per click, so batching
keeps the writes to one per burst). On load the project folder is
fetched FIRST; when it holds at least one customization it WINS
over localStorage and the user is notified; otherwise the local
browser settings stand (also notified). */

/** Debounced timer handle for the project-folder POST. */
let projectAppearanceSyncTimer: number | undefined;

/** Queue a debounced POST of the appearance map to the project folder. */
function queueProjectAppearanceSync(map: AppearanceMap): void {
    if (typeof window === "undefined") return;
    if (projectAppearanceSyncTimer) {
        window.clearTimeout(projectAppearanceSyncTimer);
    }
    projectAppearanceSyncTimer = window.setTimeout(() => {
        projectAppearanceSyncTimer = undefined;
        // Fire-and-forget: localStorage already holds the authoritative
        // instant copy; a failed POST (offline / read-only folder) must
        // never break the picker.
        void fetch("/api/project-appearance", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({appearance: map}),
        }).catch(() => { /* offline or unwritable project root */
        });
    }, 600);
}

/** Persist the appearance map BOTH locally and into the project folder. */
function saveAppearance(map: AppearanceMap) {
    saveAppearanceLocal(map);
    queueProjectAppearanceSync(map);
}

type LucideIconComponent = typeof BookOpen;

/** Folder icon choices for the "Icon & color" picker (
 * roughly doubled the list "add more icons"). */
const FOLDER_ICON_CHOICES: Array<{ id: string; label: string; Icon: LucideIconComponent }> = [
    {id: "book", label: "Book (default)", Icon: BookOpen},
    {id: "folder", label: "Folder", Icon: Folder},
    {id: "foldercode", label: "Folder code", Icon: FolderCode},
    {id: "folderopen", label: "Open folder", Icon: FolderOpenIcon},
    {id: "foldertree", label: "Folder tree", Icon: FolderTreeIcon},
    {id: "git2", label: "Git folder", Icon: FolderGit2},
    {id: "briefcase", label: "Briefcase", Icon: Briefcase},
    {id: "box", label: "Box", Icon: Box},
    {id: "package", label: "Package", Icon: Package},
    {id: "archive", label: "Archive", Icon: Archive},
    {id: "database", label: "Database", Icon: Database},
    {id: "flask", label: "Flask", Icon: FlaskConical},
    {id: "terminal", label: "Terminal", Icon: Terminal},
    {id: "git", label: "Git branch", Icon: GitBranch},
    {id: "layers", label: "Layers", Icon: Layers},
    {id: "coffee", label: "Coffee", Icon: Coffee},
    {id: "zap", label: "Lightning", Icon: Zap},
    {id: "rocket", label: "Rocket", Icon: Rocket},
    {id: "bug", label: "Bug", Icon: Bug},
    {id: "puzzle", label: "Puzzle", Icon: Puzzle},
    {id: "lightbulb", label: "Idea", Icon: Lightbulb},
    {id: "globe", label: "Globe", Icon: Globe},
    {id: "cpu", label: "CPU", Icon: Cpu},
    {id: "bookmark", label: "Bookmark", Icon: Bookmark},
    {id: "flag", label: "Flag", Icon: Flag},
    {id: "award", label: "Award", Icon: Award},
    {id: "leaf", label: "Leaf", Icon: Leaf},
    {id: "flame", label: "Flame", Icon: Flame},
    {id: "gem", label: "Gem", Icon: Gem},
    {id: "crown", label: "Crown", Icon: Crown},
    {id: "target", label: "Target", Icon: Target},
    {id: "compass", label: "Compass", Icon: Compass},
    {id: "camera", label: "Camera", Icon: Camera},
    {id: "atom", label: "Atom", Icon: Atom},
    {id: "cloud", label: "Cloud", Icon: Cloud},
    {id: "sun", label: "Sun", Icon: Sun},
    {id: "moon", label: "Moon", Icon: Moon},
    {id: "heart", label: "Heart", Icon: Heart},
    {id: "star", label: "Star", Icon: Star},
];

/** File icon choices for the "Icon & color" picker (
 * roughly doubled the list "add more icons"). */
const FILE_ICON_CHOICES: Array<{ id: string; label: string; Icon: LucideIconComponent }> = [
    {id: "code", label: "Code (by kind)", Icon: FileCode2},
    {id: "file", label: "File", Icon: File},
    {id: "text", label: "Text", Icon: FileText},
    {id: "json", label: "JSON", Icon: FileJson},
    {id: "braces", label: "Braces", Icon: Braces},
    {id: "codefile", label: "Code file", Icon: FileCode},
    {id: "config", label: "Config", Icon: FileCog},
    {id: "terminalfile", label: "Terminal script", Icon: FileTerminal},
    {id: "archivefile", label: "Archive file", Icon: FileArchive},
    {id: "table", label: "Table", Icon: Table},
    {id: "sheet", label: "Spreadsheet", Icon: FileSpreadsheet},
    {id: "image", label: "Image", Icon: ImageIcon2},
    {id: "camera", label: "Photo", Icon: Camera},
    {id: "music", label: "Music", Icon: Music},
    {id: "film", label: "Film", Icon: Film},
    {id: "database", label: "Database", Icon: Database},
    {id: "terminal", label: "Terminal", Icon: Terminal},
    {id: "binary", label: "Binary", Icon: Binary},
    {id: "sigma", label: "Math", Icon: Sigma},
    {id: "hash", label: "Hash", Icon: Hash},
    {id: "at", label: "At sign", Icon: AtSign},
    {id: "key", label: "Key", Icon: Key},
    {id: "lock", label: "Lock", Icon: Lock},
    {id: "shield", label: "Shield", Icon: Shield},
    {id: "hammer", label: "Hammer", Icon: Hammer},
    {id: "wrench", label: "Wrench", Icon: Wrench},
    {id: "bookmark", label: "Bookmark", Icon: Bookmark},
    {id: "bookmarked", label: "Bookmarked", Icon: BookMarked},
    {id: "paperclip", label: "Attachment", Icon: Paperclip},
    {id: "link", label: "Link", Icon: Link2},
    {id: "globe", label: "Globe", Icon: Globe},
    {id: "atom", label: "Atom", Icon: Atom},
    {id: "cloud", label: "Cloud", Icon: Cloud},
    {id: "sun", label: "Sun", Icon: Sun},
    {id: "moon", label: "Moon", Icon: Moon},
    {id: "rocket", label: "Rocket", Icon: Rocket},
    {id: "bug", label: "Bug", Icon: Bug},
    {id: "zap", label: "Lightning", Icon: Zap},
    {id: "heart", label: "Heart", Icon: Heart},
    {id: "star", label: "Star", Icon: Star},
];

const APPEARANCE_COLORS: Array<{ hex: string; label: string }> = [
    // Greens / teals
    {hex: "#10b981", label: "Emerald"},
    {hex: "#22c55e", label: "Green"},
    {hex: "#84cc16", label: "Lime"},
    {hex: "#14b8a6", label: "Teal"},
    {hex: "#06b6d4", label: "Cyan"},
    {hex: "#22d3ee", label: "Cyan light"},
    // Blues
    {hex: "#0ea5e9", label: "Sky"},
    {hex: "#3b82f6", label: "Blue"},
    {hex: "#6366f1", label: "Indigo"},
    // Purples / pinks
    {hex: "#8b5cf6", label: "Violet"},
    {hex: "#a855f7", label: "Purple"},
    {hex: "#d946ef", label: "Fuchsia"},
    {hex: "#ec4899", label: "Pink"},
    {hex: "#f43f5e", label: "Rose"},
    // Reds / oranges / yellows
    {hex: "#ef4444", label: "Red"},
    {hex: "#f97316", label: "Orange"},
    {hex: "#f59e0b", label: "Amber"},
    {hex: "#eab308", label: "Yellow"},
    {hex: "#facc15", label: "Yellow light"},
    // Browns / grays / neutrals (dark + light swatches for
    // light/dark-theme names respectively)
    {hex: "#92400e", label: "Brown"},
    {hex: "#78716c", label: "Stone"},
    {hex: "#64748b", label: "Slate"},
    {hex: "#9ca3af", label: "Gray"},
    {hex: "#0f172a", label: "Ink (near-black)"},
    {hex: "#e2e8f0", label: "Mist (near-white)"},
];

/** Resolve the custom icon component for an id (null = default). */
function appearanceIcon(id: string | undefined, choices: Array<{
    id: string;
    Icon: LucideIconComponent
}>): LucideIconComponent | null {
    if (!id) return null;
    return choices.find((c) => c.id === id)?.Icon ?? null;
}

// ─── "recently favorited" note timestamps ─────────────────────────

/** default highlight TTL for a freshly added favorite —
 *  10 seconds. The actual TTL comes from Settings → Editor →
 *  "New-favorite highlight (seconds)" (0 = no highlight at all). */
const DEFAULT_FAV_HIGHLIGHT_SECONDS = 10;

function loadFavNoted(ttlMs: number): Record<string, number> {
    if (typeof window === "undefined" || ttlMs <= 0) return {};
    try {
        const raw = window.localStorage.getItem(FAV_NOTED_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, number>;
        // Prune expired entries on load.
        const now = Date.now();
        const kept: Record<string, number> = {};
        for (const [k, ts] of Object.entries(parsed)) {
            if (now - ts < ttlMs) kept[k] = ts;
        }
        return kept;
    } catch {
        return {};
    }
}

function saveFavNoted(map: Record<string, number>) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(FAV_NOTED_KEY, JSON.stringify(map));
    } catch { /* quota */
    }
}


/** Format a modification time (ms since epoch) as a short relative
 *  time string ("2m ago", "1h ago", "3d ago"). Returns "—" for
 *  missing/invalid times. Used by the Recent section. */
function formatRelativeTime(ms: number): string {
    if (!ms || ms <= 0) return "—";
    const diff = Date.now() - ms;
    if (diff < 0) return "just now";
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk}w ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(day / 365)}y ago`;
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Explorer DETAILS table — auto-fit, ellipsis+tooltip, resizable     */
/*  columns (persisted), horizontal scrollbar as the LAST resort.      */
/*                                                                     */
/*  The old table was a plain `w-full` auto-layout <table> inside the  */
/*  ~300px sidebar: the whitespace-nowrap Type/Size/Modified columns   */
/*  forced minimum widths, the table silently overflowed its container */
/*  and everything past the right edge was INVISIBLY cut off (the      */
/*  "details table cut-off content" report). This component fixes it   */
/*  in four tiers, in order:                                           */
/*                                                                     */
/*   1. AUTO-FIT — every column's ideal width is measured from its     */
/*      actual content (canvas text metrics per column font), capped   */
/*      per column, and the leftover space is distributed              */
/*      proportionally so the table fills the sidebar exactly.         */
/*   2. ELLIPSIS + TOOLTIP — a cell whose content exceeds its column   */
/*      truncates with text-overflow: ellipsis, and its full value is  */
/*      always available in the native title tooltip on hover (the     */
/*      VS Code / GitHub standard).                                    */
/*   3. RESIZABLE — every column border is a drag handle; the user's   */
/*      widths are saved to localStorage and restored on the next      */
/*      visit. Double-click a handle to reset that column to auto.     */
/*   4. SCROLLBAR FALLBACK — only when the capped content still        */
/*      cannot fit (a very long name in a very narrow sidebar) does    */
/*      the container grow a subtle horizontal scrollbar; the table    */
/*      never silently clips anything again.                           */
/* ──────────────────────────────────────────────────────────────────── */

/** localStorage key for the user's saved column widths (overrides only). */
const EXPLORER_DETAILS_WIDTHS_KEY = "praxis.explorerDetailsColWidths";

/** One column of the details table. */
interface DetailsColumnSpec {
    /** Stable id — also the localStorage map key. */
    Id: "Name" | "Location" | "Type" | "Size" | "Modified";
    /** Header label. */
    Label: string;
    /** Sort mode this column toggles (null = not sortable). */
    SortMode: "alpha" | "mtime" | "size" | "type" | null;
    /** Header + cell text alignment. */
    Align: "left" | "right";
    /** Below this width the column is useless (sort arrow, padding…). */
    MinWidth: number;
    /** The column never exceeds this fraction of the container width. */
    MaxShare: number;
    /** Canvas font for measuring this column's CELL text. */
    MeasureFont: string;
    /** Extra fixed px beyond the measured text (icon, gaps, padding). */
    ExtraPx: number;
}

/** The five columns, in order. */
const DETAILS_COLUMNS: DetailsColumnSpec[] = [
    {
        Id: "Name",
        Label: "Name",
        SortMode: "alpha",
        Align: "left",
        MinWidth: 88,
        MaxShare: 0.42,
        MeasureFont: "12px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        ExtraPx: 38
    },
    {
        Id: "Location",
        Label: "Location",
        SortMode: null,
        Align: "left",
        MinWidth: 64,
        MaxShare: 0.30,
        MeasureFont: "10px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        ExtraPx: 18
    },
    {
        Id: "Type",
        Label: "Type",
        SortMode: "type",
        Align: "left",
        MinWidth: 44,
        MaxShare: 0.14,
        MeasureFont: "10px 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
        ExtraPx: 18
    },
    {
        Id: "Size",
        Label: "Size",
        SortMode: "size",
        Align: "right",
        MinWidth: 54,
        MaxShare: 0.14,
        MeasureFont: "12px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        ExtraPx: 18
    },
    {
        Id: "Modified",
        Label: "Modified",
        SortMode: "mtime",
        Align: "left",
        MinWidth: 74,
        MaxShare: 0.22,
        MeasureFont: "10px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        ExtraPx: 18
    },
];

/** Header font for the measure pass (semibold + uppercase tracking). */
const DETAILS_HEADER_FONT = "600 10px -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
/** Safety factor applied to measured text widths (font-metric uncertainty). */
const DETAILS_MEASURE_FUDGE = 1.08;

/** Measure one text with a canvas 2D context (created lazily, reused). */
let detailsMeasureCtx: CanvasRenderingContext2D | null = null;

function MeasureTextWidth(font: string, text: string): number {
    // Create the measuring canvas once per page.
    if (!detailsMeasureCtx) {
        const canvas = document.createElement("canvas");
        detailsMeasureCtx = canvas.getContext("2d");
    }
    // No canvas support — fall back to a rough character estimate.
    if (!detailsMeasureCtx) {
        return text.length * 7;
    }
    // Measure with the requested font.
    detailsMeasureCtx.font = font;
    return detailsMeasureCtx.measureText(text).width;
}

/** The natural (content-driven) width of one column, header included. */
function NaturalColumnWidth(
    column: DetailsColumnSpec,
    cellTexts: string[]
): number {
    // Measure the header label (uppercase + tracking ⇒ ×1.15 fudge).
    let widest = MeasureTextWidth(DETAILS_HEADER_FONT, column.Label.toUpperCase()) * 1.15 + 26;
    // Measure every cell's text, keeping the maximum.
    for (const text of cellTexts) {
        // Skip empty cells quickly.
        if (!text) {
            continue;
        }
        // Measure this cell's text with the column font + fudge.
        const w = MeasureTextWidth(column.MeasureFont, text) * DETAILS_MEASURE_FUDGE + column.ExtraPx;
        // Keep the widest so far.
        if (w > widest) {
            widest = w;
        }
    }
    // Clamp to the column's minimum.
    return Math.max(column.MinWidth, Math.ceil(widest));
}

/** The computed width map handed to the colgroup. */
type DetailsWidthMap = Record<DetailsColumnSpec["Id"], number>;

/** Merge natural widths + user overrides into the final column widths.
 *
 *  • overridden columns keep their saved px;
 *  • every other column gets its natural width, capped at MaxShare of
 *    the available width (past the cap the cell truncates — tier 2);
 *  • when the total is BELOW the available width the surplus is
 *    distributed proportionally so the table fills the container
 *    exactly (tier 1 — auto-fit);
 *  • when the total is ABOVE it (a very long name in a narrow sidebar)
 *    the widths stay as-is and the container scrolls (tier 4).
 */
function ComputeDetailsWidths(
    available: number,
    natural: DetailsWidthMap,
    overrides: Partial<DetailsWidthMap>
): DetailsWidthMap {
    // The result starts as a copy of the natural widths.
    const out: DetailsWidthMap = {...natural};
    // Apply the user's saved widths where present.
    for (const column of DETAILS_COLUMNS) {
        // Use the override when this column has one.
        if (overrides[column.Id] !== undefined) {
            out[column.Id] = overrides[column.Id] as number;
        }
    }
    // Cap every column at its share of the available width — but NEVER a
    // user override: the user dragged that border deliberately, so their
    // width wins (the pane's scrollbar shows up when it must — VS Code
    // behaves the same way; capping overrides back made the drag look
    // like a no-op).
    for (const column of DETAILS_COLUMNS) {
        // Only cap when the available width is positive.
        if (available > 0 && overrides[column.Id] === undefined) {
            // The per-column ceiling for this container.
            const cap = Math.max(column.MinWidth, available * column.MaxShare);
            // Squeeze the column down to the ceiling when it exceeds it.
            if (out[column.Id] > cap) {
                out[column.Id] = Math.round(cap);
            }
        }
        // Never let a width fall below the column's minimum.
        if (out[column.Id] < column.MinWidth) {
            out[column.Id] = column.MinWidth;
        }
    }
    // Sum the widths after capping.
    const total = DETAILS_COLUMNS.reduce((sum, column) => sum + out[column.Id], 0);
    // Distribute any surplus proportionally (fill the container exactly).
    if (available > 0 && total < available) {
        // The leftover space to hand out.
        const surplus = available - total;
        // Columns share the surplus proportionally to their current width.
        for (const column of DETAILS_COLUMNS) {
            // This column's share of the surplus.
            const share = Math.round((out[column.Id] / total) * surplus);
            // Add it to the column.
            out[column.Id] = out[column.Id] + share;
        }
        // Hand rounding remainders to the widest column so the fill is exact.
        const newTotal = DETAILS_COLUMNS.reduce((sum, column) => sum + out[column.Id], 0);
        // Compute what slipped through the rounding.
        const remainder = available - newTotal;
        // Give the remainder to the widest column.
        if (remainder !== 0) {
            // Find the widest column id.
            let widestId: DetailsColumnSpec["Id"] = "Name";
            // Track the widest width seen.
            let widestWidth = -1;
            // Scan the columns for the widest.
            for (const column of DETAILS_COLUMNS) {
                // Keep the wider column.
                if (out[column.Id] > widestWidth) {
                    widestWidth = out[column.Id];
                    widestId = column.Id;
                }
            }
            // Apply the remainder.
            out[widestId] = out[widestId] + remainder;
        }
    }
    // Done — the returned map sums to the available width when it fits.
    // Return the final width map.
    return out;
}

/** One row of the details table (the flat entry shape, narrowed). */
interface DetailsRowEntry {
    folderSlug: string;
    folderName: string;
    file: TreeFile;
    key: string;
}

/** Props for the details table component. */
interface ExplorerDetailsTableProps {
    /** Every visible file, pre-sorted (favorites first, then the effective sort). */
    entries: DetailsRowEntry[];
    /** The current selection. */
    selectedFolderSlug: string;
    selectedFileSlug: string;
    /** Keys of the ctrl/shift multi-selection. */
    multiSelectKeys: string[];
    /** Project appearance (per-key icon / color overrides). */
    appearance: AppearanceMap;
    /** The active sort column. */
    sortMode: "alpha" | "mtime" | "size" | "type";
    /** The active sort direction. */
    sortAsc: boolean;
    /** Change the sort (mode, direction). */
    onSort: (mode: "alpha" | "mtime" | "size" | "type", asc?: boolean) => void;
    /** Row click (the parent supplies the flat key list for shift ranges). */
    onRowClick: (event: React.MouseEvent, folderSlug: string, fileSlug: string) => void;
    /** The per-row context menu content. */
    renderContextMenu: (entry: DetailsRowEntry) => React.ReactNode;
}

/** The DETAILS explorer view: a five-column table with auto-fit column
 *  widths, ellipsis+tooltip truncation, drag-resizable columns persisted
 *  to localStorage, and a subtle horizontal scrollbar only as the last
 *  resort. See the block comment above DETAILS_COLUMNS for the tiers. */
function ExplorerDetailsTable({
                                  entries,
                                  selectedFolderSlug,
                                  selectedFileSlug,
                                  multiSelectKeys,
                                  appearance,
                                  sortMode,
                                  sortAsc,
                                  onSort,
                                  onRowClick,
                                  renderContextMenu,
                              }: ExplorerDetailsTableProps) {
    // The pane element ref (the bounded scroll box that hosts the table).
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    // Track the container width AND the bounded pane height with a
    // ResizeObserver (sidebar resizes live). The PANE is bounded to the
    // sidebar's visible area (measured against the Radix scroll viewport)
    // so the table scrolls INSIDE this pane on BOTH axes: the vertical
    // scroll, the sticky header AND the tier-4 horizontal scrollbar all
    // belong to ONE box — the header stays pinned at the pane's top edge
    // and the scrollbar stays pinned at its bottom edge, no matter how
    // many rows there are. (Without the bound, the table grew the whole
    // sidebar column to 4 000+ px, the sticky thead attached itself to a
    // never-scrolling ancestor, and the horizontal scrollbar sat 4 000 px
    // below the fold — invisible.)
    const [paneMetrics, setPaneMetrics] = React.useState<{ Width: number; MaxHeight: number }>({
        Width: 0,
        MaxHeight: 0
    });
    // Measure the pane's available width + height from the real scroll viewport.
    const MeasurePane = React.useCallback(() => {
        // Grab the pane element.
        const el = containerRef.current;
        // Nothing to measure yet.
        if (!el) {
            return;
        }
        // The pane's own width (minus its scrollbar allowance).
        const width = el.clientWidth;
        // Find the sidebar's real scroll viewport (the Radix ScrollArea).
        const viewport = el.closest("[data-radix-scroll-area-viewport], [data-slot=\"scroll-area-viewport\"]") as HTMLElement | null;
        // The bounded height for the pane.
        let maxHeight = 0;
        // Compute it when the viewport was found.
        if (viewport) {
            // The pane's top offset within the viewport's CONTENT.
            const topWithinContent = (el.getBoundingClientRect().top - viewport.getBoundingClientRect().top) + viewport.scrollTop;
            // The visible height remaining below that offset.
            maxHeight = viewport.clientHeight - topWithinContent - 8;
        }
        // Clamp to a sane minimum (a viewport far above the fold measures negative).
        if (maxHeight < 160) {
            maxHeight = 160;
        }
        // Commit the metrics when either value moved by ≥ 1px.
        setPaneMetrics((prev) => {
            // Round both to integers to avoid observer feedback loops.
            const next = {Width: Math.round(width), MaxHeight: Math.round(maxHeight)};
            // Keep the previous state when nothing changed.
            if (prev.Width === next.Width && prev.MaxHeight === next.MaxHeight) {
                return prev;
            }
            // Return the new metrics.
            return next;
        });
    }, []);
    React.useLayoutEffect(() => {
        // Grab the pane element.
        const el = containerRef.current;
        // Nothing to observe without it.
        if (!el) {
            return;
        }
        // Measure once immediately.
        MeasurePane();
        // Observe the pane (width changes) AND the viewport (height changes).
        const observer = new ResizeObserver(() => {
            // Re-measure on any resize.
            MeasurePane();
        });
        // Observe the pane itself.
        observer.observe(el);
        // Find and observe the sidebar's scroll viewport too.
        const viewport = el.closest("[data-radix-scroll-area-viewport], [data-slot=\"scroll-area-viewport\"]") as HTMLElement | null;
        // Observe it when present.
        if (viewport) {
            observer.observe(viewport);
        }
        // Stop observing on unmount.
        return () => {
            observer.disconnect();
        };
    }, [MeasurePane]);
    // The container width in a local variable for the width math below.
    const containerWidth = paneMetrics.Width;
    // The user's saved width overrides (loaded once on mount).
    const [overrides, setOverrides] = React.useState<Partial<DetailsWidthMap>>({});
    // Mirror of the overrides for side-effect-free persistence (state
    // updater functions must stay pure — StrictMode double-invokes them —
    // and React DEFERS updaters to the render phase, so a mirror write
    // inside setOverrides would not be visible to a SaveOverrides call
    // in the same event handler).
    const overridesRef = React.useRef<Partial<DetailsWidthMap>>({});
    // Keep the mirror in sync with every state change.
    const UpdateOverrides = React.useCallback((updater: (prev: Partial<DetailsWidthMap>) => Partial<DetailsWidthMap>) => {
        // Compute the next map SYNCHRONOUSLY from the mirror.
        const next = updater(overridesRef.current);
        // Store it in the mirror immediately (visible to same-tick readers).
        overridesRef.current = next;
        // Commit the same value to state (a plain value — pure and idempotent).
        setOverrides(next);
    }, []);
    // The column currently being dragged ({ id, startX, startWidth } or null).
    const [dragging, setDragging] = React.useState<{
        Id: DetailsColumnSpec["Id"];
        StartX: number;
        StartWidth: number
    } | null>(null);

    // Load the persisted overrides once on mount.
    React.useEffect(() => {
        // Nothing to do server-side.
        if (typeof window === "undefined") {
            return;
        }
        // Read the saved map defensively.
        try {
            // The raw JSON string.
            const raw = window.localStorage.getItem(EXPLORER_DETAILS_WIDTHS_KEY);
            // Keep it when it parses into an object.
            if (raw) {
                // Parse the stored overrides.
                const parsed = JSON.parse(raw) as Partial<DetailsWidthMap>;
                // Only keep numeric values for known column ids.
                const clean: Partial<DetailsWidthMap> = {};
                // Validate each column id.
                for (const column of DETAILS_COLUMNS) {
                    // Keep the value when it is a positive number.
                    if (typeof parsed[column.Id] === "number" && (parsed[column.Id] as number) > 0) {
                        clean[column.Id] = parsed[column.Id] as number;
                    }
                }
                // Commit the loaded overrides.
                setOverrides(clean);
                // Mirror the loaded overrides for persistence.
                overridesRef.current = clean;
            }
        } catch {
            /* a corrupt payload falls back to pure auto-fit */
        }
    }, []);

    // The natural (content-measured) widths, recomputed when the data changes.
    const naturalWidths = React.useMemo(() => {
        // The measured map being built.
        const map = {} as DetailsWidthMap;
        // Pre-render every column's cell texts once.
        const textsByColumn: Record<DetailsColumnSpec["Id"], string[]> = {
            Name: entries.map((entry) => entry.file.name),
            Location: entries.map((entry) => `${entry.folderName}${entry.file.dir ? ` › ${entry.file.dir}` : ""}`),
            Type: entries.map((entry) => (entry.file.ext ?? "—").replace(".", "")),
            Size: entries.map((entry) => formatSize(entry.file.size)),
            Modified: entries.map((entry) => formatRelativeTime(entry.file.mtime ?? 0)),
        };
        // Measure each column.
        for (const column of DETAILS_COLUMNS) {
            // Store this column's natural width.
            map[column.Id] = NaturalColumnWidth(column, textsByColumn[column.Id]);
        }
        // Return the natural map.
        return map;
        // The relative-time labels shift with the clock — refresh them on data changes only (close enough, they are re-measured on every entry change).
    }, [entries]);

    // The final widths: natural + overrides + caps + proportional fill.
    const widths = React.useMemo(() => {
        // Delegate to the pure merge function.
        return ComputeDetailsWidths(containerWidth, naturalWidths, overrides);
    }, [containerWidth, naturalWidths, overrides]);

    // The table's total width (drives the scrollbar + the exact fill).
    const totalWidth = React.useMemo(() => {
        // Sum the final column widths.
        return DETAILS_COLUMNS.reduce((sum, column) => sum + widths[column.Id], 0);
    }, [widths]);

    // Persist the overrides to localStorage.
    const SaveOverrides = React.useCallback((next: Partial<DetailsWidthMap>) => {
        // Write only when a window exists.
        if (typeof window !== "undefined") {
            // Serialize and store the map (an empty object clears it).
            try {
                window.localStorage.setItem(EXPLORER_DETAILS_WIDTHS_KEY, JSON.stringify(next));
            } catch {
                /* storage full or blocked — resizing still works this session */
            }
        }
    }, []);

    // Begin dragging a column border.
    const BeginColumnResize = React.useCallback(
        (event: React.PointerEvent, column: DetailsColumnSpec) => {
            // Only the primary button drags.
            if (event.button !== 0) {
                return;
            }
            // Prevent text selection while dragging.
            event.preventDefault();
            // Stop the click from re-sorting the column.
            event.stopPropagation();
            // Capture the pointer so the drag survives leaving the handle
            // (a failed capture — detached element, synthetic event — must
            // not abort the drag itself).
            try {
                (event.target as HTMLElement).setPointerCapture(event.pointerId);
            } catch {
                /* capture is an optimization, not a requirement */
            }
            // Record the drag start.
            setDragging({Id: column.Id, StartX: event.clientX, StartWidth: widths[column.Id]});
        },
        [widths]
    );

    // Move a column border while dragging.
    const MoveColumnResize = React.useCallback(
        (event: React.PointerEvent) => {
            // Ignore stray moves without an active drag.
            if (!dragging) {
                return;
            }
            // The drag distance since the start.
            const delta = event.clientX - dragging.StartX;
            // The tentative new width.
            const nextWidth = dragging.StartWidth + delta;
            // The column being dragged.
            const column = DETAILS_COLUMNS.find((c) => c.Id === dragging.Id);
            // Its minimum width.
            const min = column ? column.MinWidth : 40;
            // Clamp the width to a sane range.
            const clamped = Math.max(min, Math.min(Math.round(nextWidth), Math.max(containerWidth * 0.85, min)));
            // Update the override for this column only.
            UpdateOverrides((prev) => ({...prev, [dragging.Id]: clamped}));
        },
        [dragging, containerWidth, UpdateOverrides]
    );

    // Finish dragging a column border (persist).
    const EndColumnResize = React.useCallback(() => {
        // Nothing to do without an active drag.
        if (!dragging) {
            return;
        }
        // Persist the current overrides (from the mirror — no side effects
        // inside a state updater).
        SaveOverrides(overridesRef.current);
        // Clear the drag state.
        setDragging(null);
    }, [dragging, SaveOverrides]);

    // Reset one column to auto-fit (double-click on its handle).
    const ResetColumnResize = React.useCallback(
        (event: React.MouseEvent, column: DetailsColumnSpec) => {
            // Prevent the double-click from sorting.
            event.preventDefault();
            // Stop propagation to the header's sort handler.
            event.stopPropagation();
            // Drop this column's override.
            UpdateOverrides((prev) => {
                // The next map without this column.
                const next = {...prev};
                // Delete the override entry.
                delete next[column.Id];
                // Return the trimmed map.
                return next;
            });
            // Persist the trimmed map.
            SaveOverrides(overridesRef.current);
        },
        [SaveOverrides, UpdateOverrides]
    );

    // Resize via the keyboard (focus a handle, press ←/→).
    const HandleColumnKeyDown = React.useCallback(
        (event: React.KeyboardEvent, column: DetailsColumnSpec) => {
            // The per-keystroke step.
            const step = event.key === "ArrowLeft" ? -12 : event.key === "ArrowRight" ? 12 : 0;
            // Ignore other keys.
            if (step === 0) {
                return;
            }
            // Consume the key.
            event.preventDefault();
            // Stop propagation to the header's sort handler.
            event.stopPropagation();
            // Adjust the override by the step.
            UpdateOverrides((prev) => {
                // The current width (override or computed).
                const current = prev[column.Id] ?? widths[column.Id];
                // Clamp to the sane range.
                const clamped = Math.max(column.MinWidth, Math.round(current + step));
                // Return the next map with the adjusted column.
                return {...prev, [column.Id]: clamped};
            });
            // Persist it.
            SaveOverrides(overridesRef.current);
        },
        [widths, SaveOverrides, UpdateOverrides]
    );

    // The sticky table header (sortable labels + resize handles).
    const DetailsHeader = (column: DetailsColumnSpec) => {
        // Whether this column provides the active sort.
        const active = column.SortMode !== null && sortMode === column.SortMode;
        // Capture the narrowed sort mode for the closures below (TS cannot
        // narrow an object property inside a nested callback).
        const columnSortMode = column.SortMode;
        return (
            <th
                key={column.Id}
                className={cn(
                    "relative px-2 py-1.5 font-semibold whitespace-nowrap select-none",
                    column.Align === "right" ? "text-right" : "text-left",
                    columnSortMode && "cursor-pointer hover:text-foreground"
                )}
                // Sort on click (flip the direction when already active).
                onClick={
                    columnSortMode
                        ? () => {
                            // Flip the direction when sorting by this column already.
                            if (sortMode === columnSortMode) {
                                onSort(columnSortMode, !sortAsc);
                            } else {
                                // Otherwise switch to this column ascending.
                                onSort(columnSortMode);
                            }
                        }
                        : undefined
                }
                title={columnSortMode ? `Sort by ${column.Label.toLowerCase()} — click again to flip the direction` : undefined}
            >
        <span className="inline-flex items-center gap-1">
          {column.Label}
            {active &&
                (sortAsc ? (
                    <ChevronDown className="size-2.5 text-emerald-500 rotate-180"/>
                ) : (
                    <ChevronDown className="size-2.5 text-emerald-500"/>
                ))}
        </span>
                {/* The drag handle on the column's right border. */}
                <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize the ${column.Label} column — drag, or focus and press the arrow keys. Double-click resets it.`}
                    tabIndex={0}
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent hover:bg-emerald-500/40 active:bg-emerald-500/60 z-10"
                    onPointerDown={(event) => BeginColumnResize(event, column)}
                    onPointerMove={MoveColumnResize}
                    onPointerUp={EndColumnResize}
                    onPointerCancel={EndColumnResize}
                    onDoubleClick={(event) => ResetColumnResize(event, column)}
                    onKeyDown={(event) => HandleColumnKeyDown(event, column)}
                />
            </th>
        );
    };

    return (
        <div className="pb-4" data-testid="explorer-details">
            {/* THE PANE — one bounded scroll box for BOTH axes. TIER 4: the
          horizontal scrollbar lives here and only appears when the table
          is genuinely wider than the sidebar. The vertical scrollbar for
          the rows lives here too, and the sticky header below sticks to
          THIS box (top edge) — all three behaviors belong to one element. */}
            <div
                ref={containerRef}
                className="overflow-auto [scrollbar-width:thin]"
                style={{maxHeight: paneMetrics.MaxHeight || undefined}}
                data-total-width={totalWidth}
            >
                {/* TIER 1 + 2 — fixed layout with the computed widths: every column
            is exactly as wide as computed, and any overflow inside a cell
            turns into an ellipsis (never an invisible cut-off). */}
                <table
                    className="text-xs"
                    style={{tableLayout: "fixed", width: Math.max(totalWidth, containerWidth) || undefined}}
                >
                    <colgroup>
                        {DETAILS_COLUMNS.map((column) => (
                            <col key={column.Id} style={{width: widths[column.Id]}}/>
                        ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground bg-card/95 backdrop-blur border-b">
                        {DETAILS_COLUMNS.map((column) => DetailsHeader(column))}
                    </tr>
                    </thead>
                    <tbody>
                    {entries.map((entry) => {
                        // Destructure the entry.
                        const {folderSlug, file, key} = entry;
                        // Whether this row is the selected file.
                        const isSelected = selectedFolderSlug === folderSlug && selectedFileSlug === file.slug;
                        // Whether this row is part of the ctrl/shift selection.
                        const inMultiSelect = multiSelectKeys.includes(key);
                        // The per-file appearance override.
                        const fileAppearance = appearance.files?.[key];
                        // The custom icon (or null).
                        const CustomIcon = appearanceIcon(fileAppearance?.icon, FILE_ICON_CHOICES);
                        // The effective kind icon.
                        const KindIcon = CustomIcon ?? fileKindIcon(file.kind);
                        // The effective icon color.
                        const effIconColor = appearanceIconColor(fileAppearance);
                        // The effective text color.
                        const effTextColor = appearanceTextColor(fileAppearance);
                        // The location label (folder › dir).
                        const location = `${entry.folderName}${file.dir ? ` › ${file.dir}` : ""}`;
                        // The type label (extension without the dot).
                        const typeLabel = (file.ext ?? "—").replace(".", "");
                        // The size label.
                        const sizeLabel = formatSize(file.size);
                        // The modified label.
                        const modifiedLabel = formatRelativeTime(file.mtime ?? 0);
                        // The full modification date for the tooltip.
                        const modifiedFull = file.mtime ? new Date(file.mtime).toLocaleString() : null;
                        return (
                            <ContextMenu key={key}>
                                <ContextMenuTrigger asChild>
                                    <tr
                                        tabIndex={0}
                                        onClick={(e) => onRowClick(e, folderSlug, file.slug)}
                                        onMouseDown={(e) => {
                                            // Shift-range selection needs focus on the row itself.
                                            if (e.shiftKey) {
                                                e.preventDefault();
                                                e.currentTarget.focus();
                                            }
                                        }}
                                        className={cn(
                                            "cursor-pointer hover:bg-accent/40 transition-colors",
                                            isSelected && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                                            inMultiSelect && "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                        )}
                                        title={file.description ?? file.name}
                                    >
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <KindIcon
                                                    className={cn(
                                                        "size-3.5 shrink-0",
                                                        isSelected ? "text-emerald-500" : !effIconColor && fileKindColor(file.kind)
                                                    )}
                                                    style={effIconColor ? {color: effIconColor} : undefined}
                                                />
                                                <span
                                                    className="truncate"
                                                    style={effTextColor ? {color: effTextColor} : undefined}
                                                    title={file.name}
                                                >
                            {file.name}
                          </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 text-[10px] text-muted-foreground/80 truncate"
                                            title={location}>
                                            {location}
                                        </td>
                                        <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground truncate"
                                            title={typeLabel}>
                                            {typeLabel}
                                        </td>
                                        <td className="px-2 py-1 text-right tabular-nums truncate"
                                            title={`${file.size.toLocaleString()} bytes`}>
                                            {sizeLabel}
                                        </td>
                                        <td className="px-2 py-1 text-[10px] text-muted-foreground truncate"
                                            title={modifiedFull ?? undefined}>
                                            {modifiedLabel}
                                        </td>
                                    </tr>
                                </ContextMenuTrigger>
                                {renderContextMenu(entry)}
                            </ContextMenu>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** friendly labels for the "by kind" explorer view — one
 *  group per FileKind. Ordered by rough everyday importance when two
 *  groups tie on count. */
const KIND_GROUP_LABELS: Record<string, string> = {
    python: "Python scripts",
    markdown: "Markdown & docs",
    text: "Text & notes",
    log: "Log files",
    json: "JSON data",
    yaml: "YAML configs",
    toml: "TOML configs",
    sql: "SQL queries",
    r: "R scripts",
    shell: "Shell scripts",
    html: "HTML pages",
    csv: "CSV / TSV data",
    spreadsheet: "Spreadsheets",
    image: "Images",
    audio: "Audio",
    video: "Video",
    pdf: "PDF documents",
    ipynb: "Notebooks",
    other: "Other files",
};

/**
 * VSCode-style file-tree sidebar. Replaces the two dropdown selectors.
 *
 * Features:
 *   - Collapsible folder folders (remembered in localStorage).
 *   - Fuzzy filter by folder name or file name.
 *   - Favorites pinned to the top of each folder.
 *   - Git status badges (M / ? / etc.) next to file names.
 *   - Tags + file-size hints.
 *   - "Empty folder" badge for folders with no .py files.
 *   - Data-files button when a folder has non-Python files.
 *   - "Reveal in Explorer" button — collapses all other folders,
 *     expands the selected folder, and scrolls the current file
 *     into view.
 *
 * PERF: the component is wrapped in React.memo — the parent (page.tsx)
 * re-renders on EVERY app-level state change (settings dialog,
 * sidebar toggle, run ticks…), and this tree is ~8k lines of JSX.
 * With memo + the page's useCallback-stabilized callback props, the
 * tree now only re-renders when its own data/selection actually
 * changes. page.tsx keeps every prop referentially stable for this
 * to bite (see the tree* callbacks there).
 */
export const FolderTree = React.memo(function FolderTree({
                                                             folders,
                                                             loading,
                                                             error,
                                                             selectedFolderSlug,
                                                             selectedFileSlug,
                                                             onSelectFile,
                                                             onRefresh,
                                                             favorites,
                                                             onToggleFavorite,
                                                             sortMode,
                                                             onToggleSort,
                                                             showHidden,
                                                             gitStatusMap,
                                                             showFileSize,
                                                             showFolderSize,
                                                             showTags = true,
                                                             onDataFileBrowserOpen,
                                                             showLastRunStatus,
                                                             lastRunStatus,
                                                             projects,
                                                             activeProject,
                                                             onSelectProject,
                                                             onUploadZip,
                                                             uploadingZip,
                                                             onOpenFolderPicker,
                                                             onProjectCreated,
                                                             onFilesImported,
                                                             onFileDeleted,
                                                             onFileRenamed,
                                                             onOpenFolder,
                                                             onDownloadFile,
                                                             onCollapse,
                                                             onFolderDeleted,
                                                             onFolderRenamed,
                                                             // New file/folder ops
                                                             onFolderCreated,
                                                             onFileCreated,
                                                             onCreateExample,
                                                             onFileDuplicated,
                                                             onFileMoved,
                                                             onFileCopied,
                                                             // Explorer right-click Run actions (F7 / F8)
                                                             onRunFile,
                                                             onRunAllInFolder,
                                                             onAiPrompt,
                                                             onGenerateTestsForFile,
                                                             // additions
                                                             showRecentFiles = true,
                                                             recentFilesCount = 5,
                                                             favHighlightSeconds = DEFAULT_FAV_HIGHLIGHT_SECONDS,
                                                             pythonInterpreter = "",
                                                             onFormatFile,
                                                         }: FolderTreeProps) {
    const {toast} = useToast();
    // translated chrome — the sidebar header label (i18n: explore);
    // English fallback, re-renders on Settings → Appearance → Language.
    const {t} = useChromeLanguage();
    // background-load the example library (the two
    // "New example…" cascades below render once it lands — the
    // optional chaining keeps them null-safe until then).
    const examples = useExamples();
    const [filter, setFilter] = React.useState("");
    // ── explicit collapse override while a SEARCH is active ──
    // Both render sites below force folders open while a filter is
    // active (`|| !!filter || folderFilterActive`) so matches stay
    // visible. That also made the Collapse-all / Expand-all buttons
    // look DEAD during a search: clearing `expanded` changed nothing.
    // The override below lets an EXPLICIT Collapse-all win over the
    // filter auto-expansion (until the filter text changes again or
    // Expand-all is clicked).
    const [filterCollapseOverride, setFilterCollapseOverride] = React.useState(false);
    const filterRef = React.useRef(filter);
    React.useEffect(() => {
        // any NEW search text re-enables auto-expansion.
        if (filterRef.current !== filter) {
            filterRef.current = filter;
            setFilterCollapseOverride(false);
        }
    }, [filter]);
    // ─── multi-select — Ctrl/Cmd click toggles a file into
    // the selection, Shift click selects a RANGE from the anchor (same
    // folder), plain click opens the file and clears the selection. Keys
    // are `${folderSlug}/${fileSlug}`. The batch actions live in the
    // right-click menu (Delete / Copy / Cut / Favorite selected).
    const [multiSelect, setMultiSelect] = React.useState<string[]>([]);
    const multiAnchorRef = React.useRef<string | null>(null);
    //: the row that last held focus — keyboard ops (Del, Ctrl+C/X,
    // F2) apply to it (or the multi-selection when it's part of one).
    const focusKeyRef = React.useRef<string | null>(null);

    // ─── folder-scoped find ──────────────────────────
    // When active, ONE folder shows an inline filter box; its file list
    // is filtered to matches and EVERY matching letter is bubbled
    // (HighlightedText). ESC or × restores the full list.
    const [folderFilter, setFolderFilter] = React.useState<string | null>(null);
    const [folderFilterText, setFolderFilterText] = React.useState("");
    // TRUE while a search is active AND the user has not explicitly
    // collapsed — drives the auto-expansion of folders/subfolders so
    // matches stay visible (see the filterCollapseOverride note above).
    const filterAutoExpand =
        (!!filter.trim() || folderFilter !== null) && !filterCollapseOverride;
    const folderFilterInputRef = React.useRef<HTMLInputElement | null>(null);

    // ─── per-item icon + color overrides ─────────────
    // Project-folder-first load, with one source of truth:
    //   ▸ the ACTIVE project's .praxis/appearance.json is fetched
    //     first; when it holds at least one customization it WINS;
    //   ▸ when the project has NO customization yet but THIS BROWSER's
    //     localStorage does, the local map is MIGRATED into the project
    //     file (one POST) — the folder becomes the single source and
    //     every later browser/project sees the same customizations;
    //   ▸ only when NEITHER side has entries does the (empty) local map
    //     stand — no toast, nothing worth reporting.
    // Re-runs on every project switch (activeProject changes the
    // project folder the GET resolves against).
    const [appearance, setAppearance] = React.useState<AppearanceMap>({});
    const appearanceLoadedForRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        const projectKey = activeProject || "<default>";
        if (appearanceLoadedForRef.current === projectKey) return;
        appearanceLoadedForRef.current = projectKey;
        let cancelled = false;
        (async () => {
            let fromProject = false;
            let projectMap: AppearanceMap | null = null;
            try {
                const res = await fetch("/api/project-appearance", {cache: "no-store"});
                if (res.ok) {
                    const data = await res.json();
                    if (data.ok && data.appearance && typeof data.appearance === "object") {
                        const map = data.appearance as AppearanceMap;
                        const folderCount = map.folders ? Object.keys(map.folders).length : 0;
                        const fileCount = map.files ? Object.keys(map.files).length : 0;
                        if (folderCount + fileCount > 0) {
                            fromProject = true;
                            projectMap = map;
                        }
                    }
                }
            } catch { /* offline / route missing — local fallback below */
            }
            if (cancelled) return;
            const localMap = loadAppearance();
            const localFolderCount = localMap.folders ? Object.keys(localMap.folders).length : 0;
            const localFileCount = localMap.files ? Object.keys(localMap.files).length : 0;
            const localCount = localFolderCount + localFileCount;
            if (fromProject && projectMap) {
                // The project folder is the source of truth: mirror it into
                // localStorage so the offline cache stays identical.
                saveAppearanceLocal(projectMap);
                setAppearance(projectMap);
                const pf = projectMap.folders ? Object.keys(projectMap.folders).length : 0;
                const pfl = projectMap.files ? Object.keys(projectMap.files).length : 0;
                toast({
                    title: "Explorer appearance loaded from the project folder",
                    description: `${pf} folder and ${pfl} file customizations — read from .praxis/appearance.json (they override this browser's local settings).`,
                });
                return;
            }
            if (localCount > 0) {
                // MIGRATE the browser-local customizations into the project
                // folder — after this the project file is the single source
                // (the "why are BOTH localStorage and the project folder in
                // play?" fix: a project never stays half-migrated).
                try {
                    const posted = await fetch("/api/project-appearance", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({appearance: localMap}),
                    });
                    if (posted.ok) {
                        setAppearance(localMap);
                        toast({
                            title: "Explorer appearance migrated into the project folder",
                            description: `${localCount} customization(s) were copied from this browser's localStorage into .praxis/appearance.json — the project folder is now the single source for every browser and machine.`,
                            variant: "success",
                        });
                        return;
                    }
                } catch { /* offline — local map stands below */
                }
                if (cancelled) return;
                setAppearance(localMap);
                toast({
                    title: "Using this browser's local explorer appearance",
                    description: `${localCount} customizations were loaded from localStorage — the project folder could not be written, so they stay browser-local for now.`,
                });
                return;
            }
            setAppearance(localMap);
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProject]);
    const [appearanceTarget, setAppearanceTarget] = React.useState<{
        kind: "folder" | "file";
        key: string;
        folderSlug: string;
        fileSlug?: string;
        name: string;
        /** bulk mode — apply the picks to EVERY key (files
         *  only; the first key is the preview/reference). */
        bulkKeys?: string[];
    } | null>(null);

    // ─── recently-favorited notes ─────────────────────
    // the highlight TTL is now configurable in seconds
    // (favHighlightSeconds) — after it elapses the row reverts to a
    // plain star like every other favorite.
    const favTtlMs = Math.max(0, (favHighlightSeconds ?? DEFAULT_FAV_HIGHLIGHT_SECONDS) * 1000);
    const [favNoted, setFavNoted] = React.useState<Record<string, number>>({});
    React.useEffect(() => {
        setFavNoted(loadFavNoted(favTtlMs));
        // Re-prune when the configured duration changes.
    }, [favTtlMs]);
    const [, forceFavTick] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        // Re-render once a minute so expired "new" bubbles disappear even
        // without interaction (also refreshes the Recent section's relative
        // times).
        const t = setInterval(() => forceFavTick(), 60_000);
        return () => clearInterval(t);
    }, []);
    // while at least one fresh-favorite highlight is showing,
    // tick every SECOND so it reverts to the plain star right on time
    // (the old 10-minute TTL only needed the 60s tick).
    const anyFreshFav = React.useMemo(
        () => favTtlMs > 0 && Object.values(favNoted).some((ts) => Date.now() - ts < favTtlMs),
        [favNoted, favTtlMs]
    );
    React.useEffect(() => {
        if (!anyFreshFav) return;
        const t = setInterval(() => forceFavTick(), 1_000);
        return () => clearInterval(t);
    }, [anyFreshFav]);
    /** Toggle a favorite AND maintain the "recently added" note map.
     * keyed by the COMPOSITE `folder/file` slug —
     *  the old bare-file-slug keys leaked across folders (two folders
     *  each containing `utils.py` shared ONE star). Legacy keys are
     *  migrated once in page.tsx when the folders arrive. */
    const handleToggleFavorite = React.useCallback(
        (favKey: string) => {
            const willBeFavorite = !favorites.has(favKey);
            onToggleFavorite(favKey);
            setFavNoted((prev) => {
                const next = {...prev};
                if (willBeFavorite) next[favKey] = Date.now();
                else delete next[favKey];
                saveFavNoted(next);
                return next;
            });
        },
        [favorites, onToggleFavorite]
    );

    // ─── folder issues summary ────────────────────────
    const [folderLint, setFolderLint] = React.useState<{
        folderSlug: string;
        folderName: string;
        /** sub-folder scope when linting a nested row ("" = whole folder). */
        sub?: string;
        loading: boolean;
        data: {
            linter: string;
            files: Array<{ file: string; issues: Array<{ line: number; col: number; code: string; message: string }> }>;
            totals: { files: number; filesWithIssues: number; issues: number; byRule: Record<string, number> };
            generatedAt: number;
            hint?: string;
        } | null;
    } | null>(null);

    // ─── paste conflict (overwrite / skip) ────────────
    const [pasteConflict, setPasteConflict] = React.useState<{
        fileName: string;
        folderName: string;
        remaining: number;
        onResolve: (mode: "overwrite" | "skip" | "overwriteAll" | "skipAll" | "cancel") => void;
    } | null>(null);


    // Debounce the filter so rapid typing doesn't re-run the fuzzy match
    // on every keystroke. useDeferredValue lets the input update
    // immediately while the filtered list recomputes in a lower-priority
    // render — no input lag even with hundreds of scripts.
    const deferredFilter = React.useDeferredValue(filter);
    const [expanded, setExpanded] = React.useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const saved = window.localStorage.getItem(TREE_EXPANDED_KEY);
            if (saved) return new Set(JSON.parse(saved) as string[]);
        } catch { /* ignore */
        }
        return new Set();
    });

    // ─── explorer sort (Name / Modified / Size / Type + dir) ─
    // Extends the alpha/mtime `sortMode` prop with two more keys and a
    // direction toggle, persisted locally (the header's sort button keeps
    // toggling alpha/mtime as before). Declared BEFORE the sort memo so
    // the memo can consume the effective values.
    type ExplorerSortMode = "alpha" | "mtime" | "size" | "type";
    const TREE_SORT_KEY = `${STORAGE_PREFIX}.tree-sort`;
    const [explorerSort, setExplorerSort] = React.useState<{ mode: ExplorerSortMode; asc: boolean } | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = window.localStorage.getItem(TREE_SORT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as { mode?: string; asc?: boolean };
                if (parsed && (parsed.mode === "alpha" || parsed.mode === "mtime" || parsed.mode === "size" || parsed.mode === "type")) {
                    return {mode: parsed.mode, asc: parsed.asc !== false};
                }
            }
        } catch { /* ignore */
        }
        return null;
    });
    const handleSetExplorerSort = React.useCallback((mode: ExplorerSortMode, asc?: boolean) => {
        setExplorerSort((prev) => {
            const next = {mode, asc: asc ?? (prev ? prev.asc : mode === "alpha" || mode === "type")};
            try {
                window.localStorage.setItem(TREE_SORT_KEY, JSON.stringify(next));
            } catch { /* ignore */
            }
            return next;
        });
    }, []);
    /** Effective sort: local override wins; else the prop's alpha/mtime. */
    const effectiveSortMode: ExplorerSortMode = explorerSort?.mode ?? (sortMode === "mtime" ? "mtime" : "alpha");
    /** mtime/size default DESCENDING (newest/largest first) unless the
     * user explicitly toggled a direction; alpha/type default ascending. */
    const effectiveSortAsc =
        explorerSort?.asc ?? (effectiveSortMode === "alpha" || effectiveSortMode === "type");

    // ─── explorer VIEW MODE (tree | flat | kind | details) ──
    // The deferred view modes from the honest-gaps list: flat = one
    // list of every file with its location; kind = grouped by file
    // kind; details = sortable table (Name / Location / Type / Size /
    // Modified). Tree stays the default (and keeps every drag / drop /
    // subfolder / context power-op). Persisted alongside the sort.
    type ExplorerViewMode = "tree" | "flat" | "kind" | "details";
    const TREE_VIEW_KEY = `${STORAGE_PREFIX}.tree-view`;
    const [explorerView, setExplorerView] = React.useState<ExplorerViewMode>(() => {
        if (typeof window === "undefined") return "tree";
        const raw = window.localStorage.getItem(TREE_VIEW_KEY);
        return raw === "flat" || raw === "kind" || raw === "details" ? raw : "tree";
    });
    const handleSetExplorerView = React.useCallback((mode: ExplorerViewMode) => {
        setExplorerView(mode);
        try {
            window.localStorage.setItem(TREE_VIEW_KEY, mode);
        } catch { /* ignore */
        }
    }, []);

    // the per-folder file sort (favorites on top,
    // then mtime/alpha) is memoized keyed by (folders, favorites,
    // sortMode) instead of re-running `[...folder.files].sort(...)` for
    // EVERY folder on EVERY render — the tree re-renders on every page
    // state change (cursor moves, streaming tokens, …).
    // favorites are keyed `folder/file` so same-named
    // files in different folders no longer share one star.
    // sorts by the EFFECTIVE mode (alpha/mtime/size/type) and
    // direction from the Sort ▸ submenu.
    const sortedFilesByFolder = React.useMemo(() => {
        const map = new Map<string, Array<FolderTreeProps["folders"][number]["files"][number]>>();
        const dir = effectiveSortAsc ? 1 : -1;
        for (const folder of folders) {
            map.set(
                folder.slug,
                [...folder.files].sort((a, b) => {
                    const af = favorites.has(`${folder.slug}/${a.slug}`) ? 0 : 1;
                    const bf = favorites.has(`${folder.slug}/${b.slug}`) ? 0 : 1;
                    if (af !== bf) return af - bf;
                    if (effectiveSortMode === "mtime") {
                        return ((b.mtime ?? 0) - (a.mtime ?? 0)) * dir;
                    }
                    if (effectiveSortMode === "size") {
                        return ((b.size ?? 0) - (a.size ?? 0)) * dir;
                    }
                    if (effectiveSortMode === "type") {
                        // Group by extension, then name inside each group.
                        const ea = (a.ext ?? "").toLowerCase();
                        const eb = (b.ext ?? "").toLowerCase();
                        if (ea !== eb) return ea.localeCompare(eb, "en") * dir;
                    }
                    return a.name.localeCompare(b.name, "en", {sensitivity: "base"}) * dir;
                })
            );
        }
        return map;
    }, [folders, favorites, effectiveSortMode, effectiveSortAsc]);

    // Ref to the currently-selected file's DOM element, used by
    // "Reveal in Explorer" to scroll it into view.
    const selectedFileRef = React.useRef<HTMLDivElement | null>(null);

    // Auto-expand the selected folder ONLY when the selection actually
    // changes. Previously this effect also depended on `expanded`, which
    // meant collapsing the selected folder would immediately re-expand
    // it (the effect fired, saw the folder wasn't expanded, and
    // expanded it again). Now we only depend on the slug.
    const prevSlugRef = React.useRef<string>("");
    React.useEffect(() => {
        if (selectedFolderSlug && selectedFolderSlug !== prevSlugRef.current) {
            prevSlugRef.current = selectedFolderSlug;
            setExpanded((prev) => {
                if (prev.has(selectedFolderSlug)) return prev;
                const next = new Set(prev);
                next.add(selectedFolderSlug);
                try {
                    window.localStorage.setItem(
                        TREE_EXPANDED_KEY,
                        JSON.stringify(Array.from(next))
                    );
                } catch { /* ignore */
                }
                return next;
            });
            // when the SELECTED FILE lives in a subfolder, expand its
            // ANCESTOR chain too — a deep file arriving via recents /
            // favorites / session-restore used to open with its parents
            // collapsed (the tree looked like the file didn't exist).
            const host = folders.find((c) => c.slug === selectedFolderSlug);
            const fileDir = host?.files.find(
                (f) => f.slug === selectedFileSlug && (f.dir ?? "") !== ""
            )?.dir;
            if (fileDir) {
                setExpandedFolders((prev) => {
                    let changed = false;
                    const next = new Set(prev);
                    const segs = fileDir.split("/");
                    for (let i = 1; i <= segs.length; i++) {
                        const key = `${selectedFolderSlug}::${segs.slice(0, i).join("/")}`;
                        if (!next.has(key)) {
                            next.add(key);
                            changed = true;
                        }
                    }
                    if (!changed) return prev;
                    try {
                        window.localStorage.setItem(TREE_FOLDERS_EXPANDED_KEY, JSON.stringify(Array.from(next)));
                    } catch { /* ignore */
                    }
                    return next;
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFolderSlug, selectedFileSlug, folders]);

    const toggleFolder = (slug: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            try {
                window.localStorage.setItem(
                    TREE_EXPANDED_KEY,
                    JSON.stringify(Array.from(next))
                );
            } catch { /* ignore */
            }
            return next;
        });
    };

    /** Collapse every folder at once (toolbar / context menu) — also
     *  clears the SUBFOLDER expansion set (see
     *  handleCollapseAllFolders below; a thin alias so every call
     *  site stays valid). */
    const collapseAll = () => handleCollapseAllFolders();

    /** Expand every folder at once (toolbar / context menu) — also
     *  opens every NESTED subfolder (see
     *  handleExpandAllFolders below). */
    const expandAll = () => handleExpandAllFolders();

    /** "Reveal in Explorer" — collapse all other folders, expand the
     *  selected one, and scroll the current file into view.
     *
     *  Exposed via `revealCurrentRef` so external triggers (the command
     *  palette's "Reveal current file in Explorer" action, dispatched
     *  via the `praxis:reveal-current` window event) can call the same
     *  function the sidebar's 🎯 button uses. */
    const revealCurrentRef = React.useRef<(() => void) | null>(null);
    const revealCurrent = () => {
        if (!selectedFolderSlug) return;
        // Also expand the selected file's ANCESTOR chain — "reveal" must
        // work for deep files whose subfolders are collapsed (the flattened
        // row list only contains the file when every ancestor is open).
        const host = folders.find((c) => c.slug === selectedFolderSlug);
        const fileDir = host?.files.find(
            (f) => f.slug === selectedFileSlug && (f.dir ?? "") !== ""
        )?.dir;
        setExpanded(new Set([selectedFolderSlug]));
        try {
            window.localStorage.setItem(
                TREE_EXPANDED_KEY,
                JSON.stringify([selectedFolderSlug])
            );
        } catch { /* ignore */
        }
        if (fileDir) {
            setExpandedFolders((prev) => {
                const next = new Set(prev);
                const segs = fileDir.split("/");
                for (let i = 1; i <= segs.length; i++) {
                    next.add(`${selectedFolderSlug}::${segs.slice(0, i).join("/")}`);
                }
                try {
                    window.localStorage.setItem(TREE_FOLDERS_EXPANDED_KEY, JSON.stringify(Array.from(next)));
                } catch { /* ignore */
                }
                return next;
            });
        }
        // Scroll the file's row into view after the row list updates. The
        // row may live OUTSIDE the virtualized window, so its index is
        // computed in the flattened list and the viewport's scrollTop set
        // directly (scrollToVirtualRow); the old scrollIntoView stays as
        // the fallback for rows that are already mounted.
        const revealKey = `v:${selectedFolderSlug}/${selectedFileSlug}`;
        const attemptReveal = (allowFallback: boolean) => {
            if (scrollToVirtualRow(revealKey, "smooth")) return;
            if (allowFallback) {
                selectedFileRef.current?.scrollIntoView({behavior: "smooth", block: "center"});
            }
        };
        window.setTimeout(() => attemptReveal(true), 50);
        window.setTimeout(() => attemptReveal(false), 250);
    };
    // Keep revealCurrentRef in sync so the `praxis:reveal-current` event
    // listener (registered once on mount) always calls the latest version.
    revealCurrentRef.current = revealCurrent;

    // ─── Delete-file state ──────────────────────────────────────────
    // Right-click "Delete" on a file row → confirmation dialog →
    // POST /api/file-delete. The parent is notified via onFileDeleted so
    // it can clear the selection if the deleted file was active.
    const [deleteTarget, setDeleteTarget] = React.useState<{
        folder: string;
        folderName: string;
        file: string;
        fileName: string
    } | null>(null);
    const [deleting, setDeleting] = React.useState(false);

    const handleDeleteFile = React.useCallback(async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch("/api/file-delete", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: deleteTarget.folder, file: deleteTarget.file}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Delete failed"});
                return;
            }
            toast({variant: "success" as const, title: `Deleted "${deleteTarget.fileName}".`});
            onFileDeleted?.(deleteTarget.folder, deleteTarget.file);
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    }, [deleteTarget, onFileDeleted, onRefresh]);

    // ─── Rename-file state ──────────────────────────────────────────
    // Right-click "Rename…" on a file row → dialog with new name input
    // → POST /api/file-rename. The parent is notified via onFileRenamed
    // so it can update the selection if the renamed file was active.
    const [renameTarget, setRenameTarget] = React.useState<{
        folder: string;
        folderName: string;
        file: string;
        fileName: string
    } | null>(null);
    const [renameValue, setRenameValue] = React.useState("");
    const [renaming, setRenaming] = React.useState(false);

    const handleStartRename = React.useCallback((folder: string, folderName: string, file: string, fileName: string) => {
        setRenameTarget({folder, folderName, file, fileName});
        setRenameValue(fileName);
    }, []);

    const handleRenameFile = React.useCallback(async () => {
        if (!renameTarget) return;
        const newName = renameValue.trim();
        if (!newName || newName === renameTarget.fileName) {
            setRenameTarget(null);
            return;
        }
        setRenaming(true);
        try {
            const res = await fetch("/api/file-rename", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: renameTarget.folder, file: renameTarget.file, newName}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Rename failed"});
                return;
            }
            toast({variant: "success" as const, title: `Renamed to "${data.newName}".`});
            onFileRenamed?.(renameTarget.folder, data.oldSlug, data.newSlug);
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setRenaming(false);
            setRenameTarget(null);
        }
    }, [renameTarget, renameValue, onFileRenamed, onRefresh]);

    /** Copy the file's (or folder's) relative path to the clipboard.
     *  For files: `folder/file`. For folders (fileName=""): just `folder`. */
    const handleCopyPath = React.useCallback(async (folderName: string, fileName: string) => {
        const relPath = fileName ? `${folderName}/${fileName}` : folderName;
        try {
            await navigator.clipboard.writeText(relPath);
            toast({variant: "success" as const, title: `Copied path: ${relPath}`});
        } catch {
            toast({variant: "destructive" as const, title: "Clipboard access denied."});
        }
    }, []);

    // ═══ folder/file menu expansion ═════════════════════════
    // ─── "Copy absolute path" (VS Code explorer parity) ──────────────
    // The browser can't know the server's absolute layout — ask the
    // /api/resolve-path route (deslugified + traversal-checked server
    // side) and copy what it returns.
    const handleCopyAbsolutePath = React.useCallback(async (folderSlug: string, fileSlug?: string, sub?: string) => {
        try {
            const params = new URLSearchParams({folder: folderSlug});
            if (fileSlug) params.set("file", fileSlug);
            // nested subfolder absolute path ("" root = old call).
            if (sub) params.set("sub", sub);
            const res = await fetch(`/api/resolve-path?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || !data.absPath) {
                toast({variant: "destructive" as const, title: data.error ?? "Could not resolve path."});
                return;
            }
            await navigator.clipboard.writeText(String(data.absPath));
            toast({variant: "success" as const, title: "Copied absolute path", description: String(data.absPath)});
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }, []);

    // ─── "Open in Terminal" / "Run in Console" ──────────────
    /** Resolve a folder (+ optional nested sub) to its absolute path and
     *  hand it to the integrated terminal — the page reveals the Terminal
     *  tab, the TerminalPanel (force-mounted) either `cd`s the live shell
     *  session or starts one rooted there. Works from folder, subfolder
     *  and file rows (files pass their containing directory as `sub`). */
    const handleOpenInTerminal = React.useCallback(async (folderSlug: string, sub?: string) => {
        try {
            const params = new URLSearchParams({folder: folderSlug});
            if (sub) params.set("sub", sub);
            const res = await fetch(`/api/resolve-path?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || !data.absPath) {
                toast({variant: "destructive" as const, title: data.error ?? "Could not resolve path."});
                return;
            }
            window.dispatchEvent(new CustomEvent("praxis:term-cd", {detail: {cwd: String(data.absPath)}}));
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }, []);

    /** Fetch the file fresh from disk and run it in the persistent Python
     *  console (the same durable queue the menu-bar's Run ▸ Run in
     *  console uses — the page reveals the tab and the ConsolePanel
     *  executes the code; the STORE makes the FIRST run work too,
     *  before the panel has mounted). Python files only. */
    const handleRunInConsole = React.useCallback(async (folderSlug: string, fileSlug: string, fileName: string) => {
        try {
            const res = await fetch(`/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`);
            const data = await res.json();
            if (!res.ok || typeof data.content !== "string") {
                toast({variant: "destructive" as const, title: data.error ?? "Could not read the file."});
                return;
            }
            if (!data.content.trim()) {
                toast({title: `"${fileName}" is empty — nothing to run.`});
                return;
            }
            queueConsoleRun(data.content, fileName);
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }, []);

    /** "Debug with pdb…" — the file right-click twin of the navbar's
     *  Run ▸ Debug: resolve the containing directory, then dispatch
     *  praxis:term-cd with `python3 -m pdb <file>` so an INTERACTIVE
     *  pdb session starts inside the integrated terminal (b/n/s/c
     *  commands work because stdin is the live shell). */
    const handleDebugInTerminal = React.useCallback(async (folderSlug: string, sub: string | undefined, fileName: string) => {
        try {
            const params = new URLSearchParams({folder: folderSlug});
            if (sub) params.set("sub", sub);
            const res = await fetch(`/api/resolve-path?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || !data.absPath) {
                toast({variant: "destructive" as const, title: data.error ?? "Could not resolve path."});
                return;
            }
            window.dispatchEvent(
                new CustomEvent("praxis:term-cd", {
                    detail: {cwd: String(data.absPath), command: `python3 -m pdb "${fileName}"`},
                })
            );
            toast({
                title: "pdb session starting…",
                description: "b <line> sets a breakpoint · n steps · s steps in · c continues · q quits."
            });
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }, []);

    // ─── "Run in Terminal" / "AI ▸" file actions ───────────
    /** PyCharm-style "Run file in Terminal": resolve the containing
     *  directory, then dispatch praxis:term-cd with an optional
     *  `command` — the terminal cds there (or starts a shell rooted
     *  there) and executes the file in the shell session, so
     *  stdin/stdout are fully interactive.
     * the command is derived from the file's LANGUAGE
     *  (extension-aware, via terminalRunCommandFor) — it used to
     *  hard-code `python3 <file>` for every runnable kind, so a .js /
     *  .R / .sh / .c file dispatched a python3 command. */
    const handleRunInTerminal = React.useCallback(async (folderSlug: string, sub: string | undefined, fileName: string, kind?: string | null) => {
        try {
            const params = new URLSearchParams({folder: folderSlug});
            if (sub) params.set("sub", sub);
            const res = await fetch(`/api/resolve-path?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || !data.absPath) {
                toast({variant: "destructive" as const, title: data.error ?? "Could not resolve path."});
                return;
            }
            const language = runLanguageForFile(kind, fileName) ?? (/(\.pyw?)$/i.test(fileName) ? "python" : undefined);
            const command = terminalRunCommandFor(language, fileName);
            if (!command) {
                toast({variant: "destructive" as const, title: `No terminal runner is configured for "${fileName}".`});
                return;
            }
            window.dispatchEvent(
                new CustomEvent("praxis:term-cd", {
                    detail: {cwd: String(data.absPath), command},
                })
            );
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }, []);

    /** Fetch the file fresh from disk and hand it to the AI chat with an
     *  explain / improve prompt (the tree's equivalent of the editor's
     *  "Explain selection with AI" — works without opening the file). */
    const [aiBusyFile, setAiBusyFile] = React.useState<string | null>(null);
    const handleAiOnFile = React.useCallback(async (
        folderSlug: string,
        fileSlug: string,
        fileName: string,
        mode: "explain" | "improve",
        kind?: string | null
    ) => {
        if (!onAiPrompt) return;
        setAiBusyFile(fileName);
        try {
            const params = new URLSearchParams({folder: folderSlug, file: fileSlug});
            const res = await fetch(`/api/code?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || typeof data.content !== "string") {
                toast({variant: "destructive" as const, title: data.error ?? "Could not read the file."});
                return;
            }
            const source = data.content;
            // the AI group now renders for R / Shell / JS / C /
            // Ruby files too — derive the prompt noun + fence from the
            // file's language (kind/name aware) instead of hard-coding
            // "Python script" + a ```python fence for every file.
            const {label, fence} = aiPromptNounFor(kind, fileName);
            if (mode === "explain") {
                onAiPrompt(
                    `Explain the ${label} "${fileName}" — what it does, its key functions/classes, and anything worth knowing when running it:\n\n\`\`\`${fence}\n${source}\n\`\`\``
                );
            } else {
                onAiPrompt(
                    `Review and improve this ${label} "${fileName}" — point out bugs, style issues and clearer alternatives, then show the improved code:\n\n\`\`\`${fence}\n${source}\n\`\`\``
                );
            }
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setAiBusyFile(null);
        }
    }, [onAiPrompt]);

    // ─── "Reveal in OS explorer" (folder mode) ────────────────────────
    // POSTs /api/open-folder WITHOUT a file — the route change
    // reveals the folder directory itself. an optional
    // `sub` reveals a NESTED subfolder row (the route sanitizes it).
    const [revealingFolder, setRevealingFolder] = React.useState(false);
    const handleRevealFolder = React.useCallback(async (folderSlug: string, sub?: string) => {
        setRevealingFolder(true);
        try {
            const res = await fetch("/api/open-folder", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, sub}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Could not open the OS explorer."});
                return;
            }
            toast({variant: "success" as const, title: "Opened in OS explorer", description: String(data.path)});
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setRevealingFolder(false);
        }
    }, []);

    // ─── "Download folder as .zip" ────────────────────────────────────
    // Streams /api/folder-zip as a blob download (same pattern as the
    // issues-report markdown download).
    const [zippingFolder, setZippingFolder] = React.useState(false);
    const handleFolderZipDownload = React.useCallback(async (folderSlug: string, folderName: string, sub?: string) => {
        setZippingFolder(true);
        try {
            // `sub` zips only that nested subfolder.
            const zipQuery = sub
                ? `?folder=${encodeURIComponent(folderSlug)}&sub=${encodeURIComponent(sub)}`
                : `?folder=${encodeURIComponent(folderSlug)}`;
            const res = await fetch(`/api/folder-zip${zipQuery}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast({variant: "destructive" as const, title: data.error ?? `Download failed (HTTP ${res.status})`});
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(sub ? `${folderName}_${sub}` : folderName).replace(/[^A-Za-z0-9 _\-.()]/g, "_").replace(/\//g, "_")}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast({
                variant: "success" as const,
                title: `Downloading "${sub ? `${folderName}/${sub}` : folderName}.zip"…`
            });
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setZippingFolder(false);
        }
    }, []);

    // ─── Right-click "Export ▸" — FULL navbar parity ──────────────────
    // The file Export submenu offers EXACTLY the formats the navbar's
    // Tools ▸ Export offers (same labels, same handlers). The tree just
    // dispatches a praxis:export window event with the right-clicked
    // file as the explicit target; the page runs the very handler the
    // navbar uses. When the file is the OPEN one, its latest run output,
    // figures and notes join the export; otherwise the source is read
    // fresh from disk (no run required).
    const dispatchFileExport = React.useCallback((
        kind: ExportFileKind,
        folderSlug: string,
        fileSlug: string,
        fileName: string
    ) => {
        window.dispatchEvent(
            new CustomEvent<FileExportDetail>(FILE_EXPORT_EVENT, {
                detail: {kind, folder: folderSlug, file: fileSlug, name: fileName},
            })
        );
    }, []);

    // ─── Right-click "Export folder / subfolder as .ipynb" ──────────────────────
    // POSTs /api/export/folder-ipynb { folder, sub? } — the route scopes
    // to the subfolder and reads nested files from their real paths.
    const handleExportFolderNotebook = React.useCallback(async (folderSlug: string, folderName: string, sub?: string) => {
        try {
            const res = await fetch("/api/export/folder-ipynb", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, ...(sub ? {sub} : {})}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            const blob = new Blob([JSON.stringify(data.notebook, null, 1)], {type: "application/x-ipynb+json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = data.filename ?? `${folderName}.ipynb`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast({variant: "success" as const, title: `Exported ${data.filename ?? folderName + ".ipynb"}`});
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: "Export failed",
                description: e instanceof Error ? e.message : String(e)
            });
        }
    }, []);

    // ─── "Import .zip into this folder…" ──────────────────────────────
    // Hidden file input → POST /api/upload-zip with the `folder` field
    // (server change) → the archive extracts INTO this folder.
    const importZipInputRef = React.useRef<HTMLInputElement | null>(null);
    const [importZipTarget, setImportZipTarget] = React.useState<{
        slug: string;
        name: string;
        sub?: string
    } | null>(null);
    const [importingZip, setImportingZip] = React.useState(false);
    const handleImportZipClick = React.useCallback((folderSlug: string, folderName: string, sub?: string) => {
        setImportZipTarget({slug: folderSlug, name: folderName, sub});
        requestAnimationFrame(() => importZipInputRef.current?.click());
    }, []);
    const handleImportZipSelected = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const target = importZipTarget;
        if (!target) return;
        const zip = (e.target.files ?? [])[0];
        e.target.value = "";
        if (!zip) return;
        setImportingZip(true);
        try {
            const form = new FormData();
            form.set("file", zip);
            form.set("folder", target.slug);
            // nested destination ("" = the folder root).
            form.set("sub", target.sub ?? "");
            const res = await fetch("/api/upload-zip", {method: "POST", body: form});
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Import failed."});
                return;
            }
            const n = Array.isArray(data.importedFiles) ? data.importedFiles.length : 0;
            toast({
                variant: "success" as const,
                title: `Imported ${n} top-level item${n === 1 ? "" : "s"} into "${target.name}${target.sub ? "/" + target.sub : ""}".`,
                description: data.extractorNote ? String(data.extractorNote) : undefined,
            });
            onFilesImported?.(target.slug, Array.isArray(data.importedFiles) ? data.importedFiles : []);
            onRefresh();
        } catch (e2) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e2 instanceof Error ? e2.message : String(e2)}`
            });
        } finally {
            setImportingZip(false);
            setImportZipTarget(null);
        }
    }, [importZipTarget, onFilesImported, onRefresh]);

    // ─── "New from Template ▸" ────────────────────────────────────────
    // Lazily fetches /api/templates the first time the submenu opens.
    // Picking one pre-fills the existing New-file dialog (name + content).
    interface ScriptTemplate {
        id: string;
        name: string;
        description: string;
        content: string
    }

    const [templates, setTemplates] = React.useState<ScriptTemplate[] | null>(null);
    const templatesFetchedRef = React.useRef(false);
    const handleFetchTemplates = React.useCallback(async () => {
        if (templatesFetchedRef.current) return;
        templatesFetchedRef.current = true;
        try {
            const res = await fetch("/api/templates");
            const data = await res.json();
            if (res.ok && Array.isArray(data.templates)) setTemplates(data.templates);
        } catch { /* menu shows the retry item next open */
        }
    }, []);
    const [newFileContent, setNewFileContent] = React.useState<string | null>(null);
    const handleCreateFromTemplate = React.useCallback((t: ScriptTemplate, folderSlug: string, sub?: string) => {
        setNewFileFolder(folderSlug);
        // templates can be created inside a NESTED subfolder.
        setNewFileSub(sub ?? "");
        // suggest a PascalCase file name from the template's
        // display name ("Retry & error handling" -> "RetryErrorHandling")
        // so new scripts follow the house naming style out of the box.
        const pascalName = t.name
            .replace(/[^A-Za-z0-9]+/g, " ")
            .split(" ")
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join("");
        setNewFileName(pascalName);
        setNewFileContent(t.content);
        setShowNewFile(true);
    }, []);

    // ─── "Search in folder…" (scoped full-text) ───────────────────────
    // Server change: /api/full-text-search?folder=<slug>. A
    // dialog with query input + results; clicking a hit selects the file
    // and dispatches praxis:goto-line so the editor scrolls to the match.
    interface SearchHit {
        folder: string;
        folderSlug: string;
        file: string;
        fileSlug: string;
        line: number;
        snippet: string
    }

    const [folderSearch, setFolderSearch] = React.useState<{
        folderSlug: string;
        folderName: string;
        sub?: string
    } | null>(null);
    const [folderSearchQuery, setFolderSearchQuery] = React.useState("");
    const [folderSearchHits, setFolderSearchHits] = React.useState<SearchHit[] | null>(null);
    const [folderSearching, setFolderSearching] = React.useState(false);
    const handleRunFolderSearch = React.useCallback(async () => {
        if (!folderSearch) return;
        const q = folderSearchQuery.trim();
        if (!q) {
            setFolderSearchHits(null);
            return;
        }
        setFolderSearching(true);
        try {
            const params = new URLSearchParams({q, folder: folderSearch.folderSlug, limit: "100"});
            // scope to a nested subfolder when set.
            if (folderSearch.sub) params.set("sub", folderSearch.sub);
            const res = await fetch(`/api/full-text-search?${params.toString()}`);
            const data = await res.json();
            setFolderSearchHits(Array.isArray(data.hits) ? data.hits : []);
        } catch {
            setFolderSearchHits([]);
        } finally {
            setFolderSearching(false);
        }
    }, [folderSearch, folderSearchQuery]);
    const handleFolderSearchOpen = React.useCallback((folderSlug: string, folderName: string, sub?: string) => {
        setFolderSearch({folderSlug, folderName, sub});
        setFolderSearchHits(null);
        setFolderSearchQuery("");
        requestAnimationFrame(() => {
            // Focus the input once the dialog mounts.
            const el = document.getElementById("folder-search-input") as HTMLInputElement | null;
            el?.focus();
        });
    }, []);

    // ─── Collapse all / Expand all ────────────────────────────────────
    // BOTH the toolbar buttons and the right-click menu items route
    // through these TWO handlers: the toolbar versions
    // (collapseAll/expandAll below) only touch the TOP-LEVEL folder
    // set and leave every nested subfolder
    //  untouched. Collapse-all now clears the subfolder set TOO (so
    //  re-expanding a top-level folder doesn't resurrect previously
    //  expanded subfolders), and expand-all adds every nested path
    //  (including all ancestors) so a multi-level tree fully opens.
    const handleCollapseAllFolders = React.useCallback(() => {
        // an explicit collapse WINS over any active search's
        // auto-expansion (the buttons look dead otherwise).
        setFilterCollapseOverride(true);
        setExpanded(new Set());
        setExpandedFolders(() => {
            try {
                window.localStorage.setItem(TREE_FOLDERS_EXPANDED_KEY, JSON.stringify([]));
            } catch { /* ignore */
            }
            return new Set();
        });
        try {
            window.localStorage.setItem(TREE_EXPANDED_KEY, JSON.stringify([]));
        } catch { /* ignore */
        }
    }, []);
    const handleExpandAllFolders = React.useCallback(() => {
        // expanding all re-enables the search auto-expansion too.
        setFilterCollapseOverride(false);
        // "Expand all" opens SUBFOLDERS too — top-level slugs alone
        // would leave a multi-level tree with bare chevrons. The
        // subfolder set is read through the functional updater (its
        // state is declared further down the component — the deps array
        // must not touch it here).
        const all = new Set(folders.map((c) => c.slug));
        setExpanded(all);
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            for (const folder of folders) {
                for (const dir of folder.dirs ?? []) {
                    // include every ANCESTOR path too so intermediate rows open.
                    const segs = dir.split("/");
                    for (let i = 1; i <= segs.length; i++) {
                        next.add(`${folder.slug}::${segs.slice(0, i).join("/")}`);
                    }
                }
            }
            try {
                window.localStorage.setItem(TREE_FOLDERS_EXPANDED_KEY, JSON.stringify(Array.from(next)));
            } catch { /* ignore */
            }
            return next;
        });
        try {
            window.localStorage.setItem(TREE_EXPANDED_KEY, JSON.stringify(Array.from(all)));
        } catch { /* ignore */
        }
    }, [folders]);

    // (The explorer-sort state + effective mode/direction now live just
    // above the sort memo — see "explorer sort".)

    // ─── "Run pytest on this file" ────────────────────────────────────
    // POSTs /api/test {folder, file} and renders the structured report.
    interface TestReportEntry {
        name: string;
        status: string;
        durationMs?: number;
        message?: string
    }

    interface TestReport {
        ok: boolean;
        total: number;
        passed: number;
        failed: number;
        errors: number;
        skipped: number;
        durationMs: number;
        tests: TestReportEntry[];
        raw?: string
    }

    const [testTarget, setTestTarget] = React.useState<{
        folderSlug: string;
        fileSlug: string;
        fileName: string
    } | null>(null);
    const [testReport, setTestReport] = React.useState<TestReport | null>(null);
    const [testing, setTesting] = React.useState(false);
    const handleRunTestsOnFile = React.useCallback(async (folderSlug: string, fileSlug: string, fileName: string) => {
        setTestTarget({folderSlug, fileSlug, fileName});
        setTestReport(null);
        setTesting(true);
        try {
            const res = await fetch("/api/test", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, file: fileSlug, interpreter: pythonInterpreter || undefined}),
            });
            const data = await res.json();
            if (!res.ok) {
                setTestReport({
                    ok: false,
                    total: 0,
                    passed: 0,
                    failed: 0,
                    errors: 0,
                    skipped: 0,
                    durationMs: 0,
                    tests: [],
                    raw: data.error ?? `HTTP ${res.status}`
                });
                return;
            }
            setTestReport(data as TestReport);
        } catch (e) {
            setTestReport({
                ok: false,
                total: 0,
                passed: 0,
                failed: 0,
                errors: 0,
                skipped: 0,
                durationMs: 0,
                tests: [],
                raw: e instanceof Error ? e.message : String(e)
            });
        } finally {
            setTesting(false);
        }
    }, [pythonInterpreter]);

    // ─── "Run with… interpreter" ──────────────────────────────────────
    // Small dialog prefilled with the configured interpreter; confirming
    // dispatches praxis:run-with — page.tsx runs the file with the
    // override (doRun's one-shot interpreter).
    const [runWithTarget, setRunWithTarget] = React.useState<{
        folderSlug: string;
        fileSlug: string;
        fileName: string
    } | null>(null);
    const [runWithInterpreter, setRunWithInterpreter] = React.useState("");
    const handleRunWithConfirm = React.useCallback(() => {
        if (!runWithTarget) return;
        const interp = runWithInterpreter.trim();
        window.dispatchEvent(new CustomEvent("praxis:run-with", {
            detail: {folder: runWithTarget.folderSlug, file: runWithTarget.fileSlug, interpreter: interp || undefined},
        }));
        setRunWithTarget(null);
    }, [runWithTarget, runWithInterpreter]);

    // ─── "Move to… / Copy to…" ────────────────────────────────────────
    // Folder-picker dialog (the folder list) + the SAME file-move /
    // file-copy endpoints the clipboard paste uses. 409 → offered as an
    // overwrite toast (single file, so no batch dialog).
    const [moveCopyTarget, setMoveCopyTarget] = React.useState<{
        mode: "move" | "copy";
        folderSlug: string;
        fileSlug: string;
        fileName: string;
        toFolder: string;
        newName: string;
    } | null>(null);
    const [moveCopyBusy, setMoveCopyBusy] = React.useState(false);
    const handleMoveCopyConfirm = React.useCallback(async () => {
        if (!moveCopyTarget) return;
        const toFolder = moveCopyTarget.toFolder;
        if (!toFolder) {
            toast({variant: "destructive" as const, title: "Pick a destination folder first."});
            return;
        }
        if (moveCopyTarget.mode === "move" && toFolder === moveCopyTarget.folderSlug) {
            toast({variant: "destructive" as const, title: "Source and destination are the same folder."});
            return;
        }
        setMoveCopyBusy(true);
        try {
            const endpoint = moveCopyTarget.mode === "move" ? "/api/file-move" : "/api/file-copy";
            const body: Record<string, unknown> = {
                fromFolder: moveCopyTarget.folderSlug,
                file: moveCopyTarget.fileSlug,
                toFolder,
            };
            if (moveCopyTarget.newName.trim()) body.newName = moveCopyTarget.newName.trim();
            let res = await fetch(endpoint, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            if (res.status === 409) {
                // Destination already has a file with this name — offer one
                // overwrite (single-file flow; no batch state needed).
                const overwrite = window.confirm(`A file named "${moveCopyTarget.newName.trim() || moveCopyTarget.fileName}" already exists in the destination folder. Overwrite it?`);
                if (!overwrite) return;
                res = await fetch(endpoint, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({...body, overwrite: true}),
                });
            }
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({
                    variant: "destructive" as const,
                    title: data.error ?? `${moveCopyTarget.mode === "move" ? "Move" : "Copy"} failed (HTTP ${res.status})`
                });
                return;
            }
            toast({
                variant: "success" as const,
                title: `${moveCopyTarget.mode === "move" ? "Moved" : "Copied"} "${moveCopyTarget.newName.trim() || moveCopyTarget.fileName}".`,
            });
            if (moveCopyTarget.mode === "move") {
                onFileMoved?.(moveCopyTarget.folderSlug, moveCopyTarget.fileSlug, toFolder, data.newSlug, data.newName);
            } else {
                onFileCopied?.(moveCopyTarget.folderSlug, moveCopyTarget.fileSlug, toFolder, data.newSlug, data.newName);
            }
            onRefresh();
            setMoveCopyTarget(null);
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setMoveCopyBusy(false);
        }
    }, [moveCopyTarget, onFileCopied, onFileMoved, onRefresh]);

    // ─── "Compare with…" (Local History / git HEAD) ───────────────────
    // Both dispatch window events page.tsx already knows how to answer:
    // selecting the file, then opening the corresponding panel/tab.
    const handleCompareLocalHistory = React.useCallback((folderSlug: string, fileSlug: string) => {
        window.dispatchEvent(new CustomEvent("praxis:open-local-history", {
            detail: {
                folder: folderSlug,
                file: fileSlug
            }
        }));
    }, []);
    const handleCompareGitHead = React.useCallback((folderSlug: string, fileSlug: string) => {
        window.dispatchEvent(new CustomEvent("praxis:open-git-diff", {detail: {folder: folderSlug, file: fileSlug}}));
    }, []);

    // ─── File Properties dialog state ───────────────────────────────
    // Right-click "Properties" on a file row → opens a dialog showing
    // the file's metadata: name, size, type, extension, modification
    // time, relative path, description (from docstring), tags.
    interface FileProperties {
        folderSlug: string;
        folderName: string;
        fileSlug: string;
        fileName: string;
        size: number;
        mtime?: number;
        kind?: string;
        ext?: string;
        description?: string;
        tags?: string[];
    }

    const [propertiesTarget, setPropertiesTarget] = React.useState<FileProperties | null>(null);

    /** Format a byte count as a human-readable size string. */
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /** Format a modification time (ms since epoch) as a human-readable date. */
    const formatMtime = (mtime?: number): string => {
        if (!mtime) return "—";
        try {
            const d = new Date(mtime);
            return d.toLocaleString(undefined, {
                year: "numeric", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
            });
        } catch {
            return "—";
        }
    };

    // ─── Folder (folder) delete/rename/properties state ────────────
    // the targets carry an optional `sub` (relative
    // folder path inside the folder) so NESTED folders can be renamed /
    // deleted too — `sub` empty = the folder itself.
    const [folderDeleteTarget, setFolderDeleteTarget] = React.useState<{
        folder: string;
        folderName: string;
        sub?: string
    } | null>(null);
    const [deletingFolder, setDeletingFolder] = React.useState(false);

    const handleDeleteFolder = React.useCallback(async () => {
        if (!folderDeleteTarget) return;
        setDeletingFolder(true);
        try {
            const res = await fetch("/api/folder-delete", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderDeleteTarget.folder, sub: folderDeleteTarget.sub || undefined}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Delete failed"});
                return;
            }
            toast({
                variant: "success" as const,
                title: `Deleted folder "${folderDeleteTarget.sub ? folderDeleteTarget.sub.split("/").pop() : folderDeleteTarget.folderName}".`
            });
            onFolderDeleted?.(folderDeleteTarget.folder);
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setDeletingFolder(false);
            setFolderDeleteTarget(null);
        }
    }, [folderDeleteTarget, onFolderDeleted, onRefresh]);

    const [folderRenameTarget, setFolderRenameTarget] = React.useState<{
        folder: string;
        folderName: string;
        sub?: string
    } | null>(null);
    const [folderRenameValue, setFolderRenameValue] = React.useState("");
    const [renamingFolder, setRenamingFolder] = React.useState(false);

    const handleStartFolderRename = React.useCallback((folder: string, folderName: string, sub?: string) => {
        setFolderRenameTarget({folder, folderName, sub});
        setFolderRenameValue(sub ? sub.split("/").pop()! : folderName);
    }, []);

    const handleRenameFolder = React.useCallback(async () => {
        if (!folderRenameTarget) return;
        const newName = folderRenameValue.trim();
        const currentName = folderRenameTarget.sub ? folderRenameTarget.sub.split("/").pop()! : folderRenameTarget.folderName;
        if (!newName || newName === currentName) {
            setFolderRenameTarget(null);
            return;
        }
        setRenamingFolder(true);
        try {
            const res = await fetch("/api/folder-rename", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderRenameTarget.folder,
                    newName,
                    sub: folderRenameTarget.sub || undefined
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Rename failed"});
                return;
            }
            toast({variant: "success" as const, title: `Renamed to "${data.newName}".`});
            // Nested renames keep the folder slug — no selection change needed.
            if (!folderRenameTarget.sub) {
                onFolderRenamed?.(folderRenameTarget.folder, data.newName);
            }
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setRenamingFolder(false);
            setFolderRenameTarget(null);
        }
    }, [folderRenameTarget, folderRenameValue, onFolderRenamed, onRefresh]);

    /** Copy the folder name to the clipboard. */
    const handleCopyFolderName = React.useCallback(async (folderName: string) => {
        try {
            await navigator.clipboard.writeText(folderName);
            toast({variant: "success" as const, title: `Copied folder name: ${folderName}`});
        } catch {
            toast({variant: "destructive" as const, title: "Clipboard access denied."});
        }
    }, []);

    /** Copy the file name to the clipboard. */
    const handleCopyFileName = React.useCallback(async (fileName: string) => {
        try {
            await navigator.clipboard.writeText(fileName);
            toast({variant: "success" as const, title: `Copied file name: ${fileName}`});
        } catch {
            toast({variant: "destructive" as const, title: "Clipboard access denied."});
        }
    }, []);

    // ─── extra Clipboard ▸ entries for file rows ────────────
    /** Copy the file name WITHOUT its extension ("QuickSort.py" →
     *  "QuickSort") — handy for class/module names. */
    const handleCopyFileStem = React.useCallback(async (fileName: string) => {
        const fileStem = fileName.replace(/\.[^.]+$/, "");
        try {
            await navigator.clipboard.writeText(fileStem);
            toast({variant: "success" as const, title: `Copied name: ${fileStem}`});
        } catch {
            toast({variant: "destructive" as const, title: "Clipboard access denied."});
        }
    }, []);

    /** Copy the dotted import path of a python file ("QuickSort.py" in
     *  Algorithms/Sorting → "Algorithms.Sorting.QuickSort"). Folders whose
     *  names contain spaces can't be imported — the toast says so. */
    const handleCopyModulePath = React.useCallback(async (folderName: string, file: TreeFile) => {
        const fileStem = file.name.replace(/\.py$/i, "");
        const segments = [folderName, ...(file.dir ? file.dir.split("/") : []), fileStem];
        const modulePath = segments.join(".");
        const importable = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(modulePath);
        try {
            await navigator.clipboard.writeText(modulePath);
            toast({
                variant: "success" as const,
                title: `Copied module path: ${modulePath}`,
                description: importable ? "Ready to paste into an import statement." : "Heads-up: a path segment isn't a valid identifier, so this can't be imported directly.",
            });
        } catch {
            toast({variant: "destructive" as const, title: "Clipboard access denied."});
        }
    }, []);

    /** copy a ready import STATEMENT — "from
     *  Algorithms.Sorting import QuickSort" (or "import Algorithms…"
     *  when the module path itself is the thing to import). The
     *  module-path item above copies the dotted path; this one copies a
     *  line you can paste straight into code. */
    const handleCopyImportStatement = React.useCallback(async (folderName: string, file: TreeFile) => {
        const fileStem = file.name.replace(/\.py$/i, "");
        const segments = [folderName, ...(file.dir ? file.dir.split("/") : []), fileStem];
        const modulePath = segments.join(".");
        const importable = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(modulePath);
        const statement = importable
            ? `from ${segments.slice(0, -1).join(".")} import ${fileStem}`
            : `import ${modulePath}  # NOTE: a path segment isn't a valid identifier`;
        try {
            await navigator.clipboard.writeText(statement);
            toast({
                variant: "success" as const,
                title: "Copied import statement",
                description: statement.split(" # ")[0],
            });
        } catch {
            toast({variant: "destructive" as const, title: "Clipboard access denied."});
        }
    }, []);

    /** Fetch the file fresh from disk and copy its CONTENT to the
     *  clipboard — works even when the file isn't open in the editor. */
    const [copyingContents, setCopyingContents] = React.useState(false);
    const handleCopyFileContents = React.useCallback(async (folderSlug: string, fileSlug: string, fileName: string) => {
        setCopyingContents(true);
        try {
            const res = await fetch(`/api/code?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`);
            const data = await res.json();
            if (!res.ok || typeof data.content !== "string") {
                toast({variant: "destructive" as const, title: data.error ?? "Could not read the file."});
                return;
            }
            try {
                await navigator.clipboard.writeText(data.content);
                toast({
                    variant: "success" as const,
                    title: `Copied contents of ${fileName}`,
                    description: `${(data.content as string).length.toLocaleString()} characters on the clipboard.`,
                });
            } catch {
                toast({variant: "destructive" as const, title: "Clipboard access denied."});
            }
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setCopyingContents(false);
        }
    }, []);

    // ─── Enhanced file properties (with stats from /api/file-stats) ────
    interface FileStats {
        size: number;
        mtime: number;
        birthtime?: number | null;
        extension: string;
        lineCount: number;
        wordCount: number;
        charCount: number;
        sha256: string;
        isBinary: boolean;
    }

    const [fileStats, setFileStats] = React.useState<FileStats | null>(null);
    const [loadingFileStats, setLoadingFileStats] = React.useState(false);

    const fetchFileStats = React.useCallback(async (folderSlug: string, fileSlug: string) => {
        setLoadingFileStats(true);
        setFileStats(null);
        try {
            const res = await fetch("/api/file-stats", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, file: fileSlug}),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                // Guard against race: only update if the dialog is still
                // showing THIS file. Use the ref (not the state) so we read
                // the latest value at the time the fetch resolves, not the
                // stale value captured when the callback was created.
                const cur = propertiesTargetRef.current;
                if (cur?.folderSlug === folderSlug && cur?.fileSlug === fileSlug) {
                    setFileStats({
                        size: data.size,
                        mtime: data.mtime,
                        birthtime: data.birthtime,
                        extension: data.extension,
                        lineCount: data.lineCount,
                        wordCount: data.wordCount,
                        charCount: data.charCount,
                        sha256: data.sha256,
                        isBinary: data.isBinary,
                    });
                }
            }
        } catch { /* ignore */
        } finally {
            setLoadingFileStats(false);
        }
    }, []);

    // Refs to hold the LATEST target objects so the fetch callbacks
    // (which are memoized with [] deps) can read the current value at
    // the time the fetch resolves, avoiding stale-closure race conditions.
    const propertiesTargetRef = React.useRef(propertiesTarget);
    React.useEffect(() => {
        propertiesTargetRef.current = propertiesTarget;
    }, [propertiesTarget]);

    // ─── Folder properties (with stats from /api/folder-stats) ────────
    interface FolderStats {
        fileCount: number;
        pythonFileCount: number;
        dataFileCount: number;
        totalSize: number;
        mtime: number;
        birthtime?: number | null;
        hasReadme: boolean;
        readmeFile: string | null;
        largestFile: { name: string; size: number } | null;
        newestFile: { name: string; mtime: number } | null;
    }

    interface FolderPropertiesTarget {
        folderSlug: string;
        folderName: string;
        /** nested scope for subfolder rows ("" / undefined = folder root). */
        sub?: string;
        fileCount: number;
        isEmpty: boolean;
        tags: string[];
        hasReadme: boolean;
    }

    const [folderPropertiesTarget, setFolderPropertiesTarget] = React.useState<FolderPropertiesTarget | null>(null);
    const [folderStats, setFolderStats] = React.useState<FolderStats | null>(null);
    const [loadingFolderStats, setLoadingFolderStats] = React.useState(false);
    // Ref for race-guard: holds the latest folderPropertiesTarget so the
    // fetch callback (memoized with [] deps) can read the current value
    // at the time the fetch resolves.
    const folderPropertiesTargetRef = React.useRef(folderPropertiesTarget);
    React.useEffect(() => {
        folderPropertiesTargetRef.current = folderPropertiesTarget;
    }, [folderPropertiesTarget]);

    const fetchFolderStats = React.useCallback(async (folderSlug: string, sub?: string) => {
        setLoadingFolderStats(true);
        setFolderStats(null);
        try {
            const res = await fetch("/api/folder-stats", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                // `sub` stats a NESTED subfolder (recursive listing).
                body: JSON.stringify({folder: folderSlug, ...(sub ? {sub} : {})}),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                // Race guard: only update if the dialog is still showing THIS folder.
                const cur = folderPropertiesTargetRef.current;
                if (cur?.folderSlug === folderSlug && (cur.sub ?? "") === (sub ?? "")) {
                    setFolderStats({
                        fileCount: data.fileCount,
                        pythonFileCount: data.pythonFileCount,
                        dataFileCount: data.dataFileCount,
                        totalSize: data.totalSize,
                        mtime: data.mtime,
                        birthtime: data.birthtime,
                        hasReadme: data.hasReadme,
                        readmeFile: data.readmeFile,
                        largestFile: data.largestFile,
                        newestFile: data.newestFile,
                    });
                }
            }
        } catch { /* ignore */
        } finally {
            setLoadingFolderStats(false);
        }
    }, []);

    // ─── Create-project dialog state ──────────────────────────────────
    const [showCreateProject, setShowCreateProject] = React.useState(false);
    const [newProjectName, setNewProjectName] = React.useState("");
    const [creatingProject, setCreatingProject] = React.useState(false);
    /** WHERE the new project is created — an absolute parent
     *  directory ("" = the app's default projects root). Prefilled on
     *  dialog open; editable + browsable. */
    const [newProjectParent, setNewProjectParent] = React.useState("");
    const [projectBrowse, setProjectBrowse] = React.useState<{
        open: boolean;
        path: string;
        parent: string | null;
        dirs: Array<{ name: string; path: string }>;
        loading: boolean;
    } | null>(null);

    const handleCreateProject = React.useCallback(async () => {
        const name = newProjectName.trim();
        if (!name) return;
        setCreatingProject(true);
        try {
            const res = await fetch("/api/projects/create", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({name, parentDir: newProjectParent.trim() || undefined}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Failed to create project"});
                return;
            }
            toast({
                variant: "success" as const,
                title: `Project "${name}" created and activated.`,
                description: newProjectParent.trim() ? `Location: ${data.projectPath}` : undefined
            });
            setShowCreateProject(false);
            setNewProjectName("");
            setNewProjectParent("");
            setProjectBrowse(null);
            onProjectCreated?.(data.projectPath, data.projectName);
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setCreatingProject(false);
        }
    }, [newProjectName, newProjectParent, onProjectCreated, onRefresh]);

    /** prefill the location with the default projects root
     *  whenever the create-project dialog opens. */
    React.useEffect(() => {
        if (!showCreateProject) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/folder-list");
                const data = await res.json();
                if (!cancelled && typeof data?.startPath === "string") {
                    setNewProjectParent((cur) => cur || data.startPath);
                }
            } catch {
                /* keep empty = server default */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [showCreateProject]);

    /** browse to the parent directory for the new project
     *  (server-side directory listing via /api/folder-list). */
    const browseProjectParent = React.useCallback(async (target?: string) => {
        setProjectBrowse({open: true, path: "", parent: null, dirs: [], loading: true});
        try {
            const url = target ? `/api/folder-list?path=${encodeURIComponent(target)}` : "/api/folder-list";
            const res = await fetch(url);
            const data = await res.json();
            setProjectBrowse({
                open: true,
                path: data.path ?? "",
                parent: data.parent ?? null,
                dirs: (data.dirs ?? []) as Array<{ name: string; path: string }>,
                loading: false,
            });
        } catch {
            setProjectBrowse(null);
            toast({variant: "destructive" as const, title: "Could not browse that location."});
        }
    }, [toast]);

    // ─── New-folder / New-file dialog state ──────────────────────────
    // Toolbar "+" button → "New folder" creates a folder via
    // /api/folder-create; "New file…" creates an empty file inside a
    // chosen folder via /api/file-create (with sensible defaults per
    // extension: .py gets a coding declaration, .md gets an H1, etc.).
    const [showNewFolder, setShowNewFolder] = React.useState(false);
    const [newFolderName, setNewFolderName] = React.useState("");
    const [creatingFolder, setCreatingFolder] = React.useState(false);
    /** where the new folder goes — null = project root;
     *  else the parent folder slug + optional relative sub path inside
     *  it (set from the folder-row / folder context menus; the toolbar
     *  "+" keeps creating at the project root). */
    const [newFolderTarget, setNewFolderTarget] = React.useState<{
        folder: string;
        folderName: string;
        sub: string
    } | null>(null);
    const [showNewFile, setShowNewFile] = React.useState(false);
    const [newFileFolder, setNewFileFolder] = React.useState<string>("");
    /** relative sub path for the new file ("" = folder
     *  root). Prefilled when opened from a folder row's context menu. */
    const [newFileSub, setNewFileSub] = React.useState<string>("");
    const [newFileName, setNewFileName] = React.useState("");
    const [creatingFile, setCreatingFile] = React.useState(false);

    // nested-folder expansion state. Keys are
    // `folderSlug::dirPath`. Persisted like the folder set so reloads
    // restore the tree.
    const TREE_FOLDERS_EXPANDED_KEY = "praxis.tree.foldersExpanded";
    const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(() => {
        // window guard — the top-level `expanded` initializer has
        // one; without it this ran on the server too and only survived
        // via the ReferenceError the catch swallowed.
        if (typeof window === "undefined") return new Set<string>();
        try {
            const raw = window.localStorage.getItem(TREE_FOLDERS_EXPANDED_KEY);
            return new Set(raw ? (JSON.parse(raw) as string[]) : []);
        } catch {
            return new Set<string>();
        }
    });
    const toggleFolderExpanded = React.useCallback((key: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            try {
                window.localStorage.setItem(TREE_FOLDERS_EXPANDED_KEY, JSON.stringify(Array.from(next)));
            } catch { /* ignore */
            }
            return next;
        });
    }, []);
    const expandFolderPath = React.useCallback((folderSlug: string, dir: string) => {
        // Expand every ANCESTOR of dir too, so the new folder is visible.
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            const segs = dir.split("/");
            for (let i = 1; i <= segs.length; i++) {
                next.add(`${folderSlug}::${segs.slice(0, i).join("/")}`);
            }
            try {
                window.localStorage.setItem(TREE_FOLDERS_EXPANDED_KEY, JSON.stringify(Array.from(next)));
            } catch { /* ignore */
            }
            return next;
        });
    }, []);

    const handleCreateFolder = React.useCallback(async () => {
        const name = newFolderName.trim();
        if (!name) return;
        setCreatingFolder(true);
        try {
            const res = await fetch("/api/folder-create", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    name,
                    // nested creation — when a target is set the
                    // folder is created INSIDE that folder (+ optional sub path).
                    folder: newFolderTarget?.folder,
                    sub: newFolderTarget?.sub || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Failed to create folder"});
                return;
            }
            toast({
                variant: "success" as const,
                title: `Folder "${data.name}" created${newFolderTarget ? ` in "${newFolderTarget.folderName}${newFolderTarget.sub ? "/" + newFolderTarget.sub : ""}".` : "."}`,
            });
            setShowNewFolder(false);
            setNewFolderName("");
            if (newFolderTarget && data.dir) {
                // Auto-expand the new nested folder (and its ancestors) so the
                // user can drop files into it immediately.
                expandFolderPath(newFolderTarget.folder, data.dir);
            } else {
                // Root-level folder: auto-expand it in the folder set.
                setExpanded((prev) => {
                    const next = new Set(prev);
                    next.add(data.slug);
                    try {
                        window.localStorage.setItem(
                            TREE_EXPANDED_KEY,
                            JSON.stringify(Array.from(next))
                        );
                    } catch { /* ignore */
                    }
                    return next;
                });
            }
            onFolderCreated?.(data.slug, data.name);
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setCreatingFolder(false);
        }
    }, [newFolderName, newFolderTarget, expandFolderPath, onFolderCreated, onRefresh]);

    const handleCreateFile = React.useCallback(async () => {
        const folder = newFileFolder;
        const fileName = newFileName.trim();
        if (!folder || !fileName) return;
        setCreatingFile(true);
        try {
            const res = await fetch("/api/file-create", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                // when the dialog was opened via "New from Template ▸",
                // newFileContent carries the template's source — otherwise the
                // route's per-extension defaults apply as before.
                // `sub` lands the file in a nested folder.
                body: JSON.stringify({
                    folder,
                    fileName,
                    content: newFileContent ?? undefined,
                    sub: newFileSub || undefined
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Failed to create file"});
                return;
            }
            toast({variant: "success" as const, title: `File "${data.name}" created.`});
            setShowNewFile(false);
            setNewFileName("");
            setNewFileContent(null);
            setNewFileSub("");
            // Ensure the folder is expanded so the new file is visible.
            setExpanded((prev) => {
                const next = new Set(prev);
                next.add(folder);
                try {
                    window.localStorage.setItem(
                        TREE_EXPANDED_KEY,
                        JSON.stringify(Array.from(next))
                    );
                } catch { /* ignore */
                }
                return next;
            });
            // expand the target folder (and its ancestors)
            // when the file was created inside a nested folder.
            if (newFileSub) expandFolderPath(folder, newFileSub);
            // Refresh BEFORE notifying the parent to select the new file:
            // the page's selection guard runs against the folders list, so
            // setting the selection while the list is stale reverts it to
            // files[0] (fix — same race as handleCreateExample).
            await onRefresh();
            onFileCreated?.(folder, data.slug, data.name);
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setCreatingFile(false);
        }
    }, [newFileFolder, newFileName, newFileSub, newFileContent, expandFolderPath, onFileCreated, onRefresh]);

    // ─── Clipboard (cut / copy / paste) ──────────────────────────────
    // Holds the source file for the next paste. The mode ("cut"|"copy")
    // determines whether paste moves or copies the file. Persisted in
    // localStorage so it survives page reloads (matches VSCode, which
    // keeps clipboard state across windows).
    const CLIPBOARD_KEY = `${STORAGE_PREFIX}.file-clipboard`;

    /** the clipboard can now hold MULTIPLE files (the
     *  multi-select Copy/Cut fills `files`; the single-file actions set
     *  it to a one-element array for backward compatibility with the
     *  legacy single-file fields stored in localStorage). */
    interface ClipboardFileRef {
        folderSlug: string;
        folderName: string;
        fileSlug: string;
        fileName: string;
    }

    interface ClipboardEntry {
        mode: "cut" | "copy";
        folderSlug: string;
        folderName: string;
        fileSlug: string;
        fileName: string;
        files?: ClipboardFileRef[];
    }

    const [clipboard, setClipboard] = React.useState<ClipboardEntry | null>(null);
    const [pasting, setPasting] = React.useState(false);

    // Load clipboard from localStorage on mount.
    React.useEffect(() => {
        try {
            const raw = window.localStorage.getItem(CLIPBOARD_KEY);
            if (raw) setClipboard(JSON.parse(raw) as ClipboardEntry);
        } catch { /* ignore */
        }
    }, [CLIPBOARD_KEY]);

    // ─── Listen for menu-bar events ─────────────────────────────────
    // The MenuBar (in page.tsx) dispatches custom window events to open
    // the New Folder / New File / Create Project dialogs without lifting
    // state. This keeps FolderTree self-contained.
    //
    // IMPORTANT: page.tsx renders TWO FolderTree instances — one for
    // desktop (always-mounted) and one for the mobile drawer
    // (conditionally mounted). Both register listeners, so a single
    // `praxis:new-file` event would otherwise open the dialog TWICE.
    // We deduplicate via the module-level `seenMenuEventNonces` Set
    // (declared at the top of this file): the event carries a unique
    // `detail.nonce`, and only the FIRST listener that sees it acts;
    // the second is a no-op. The Set is cleaned up after 1 second.
    React.useEffect(() => {
        const handle = (nonce: number | undefined, action: () => void) => {
            if (nonce !== undefined) {
                if (seenMenuEventNonces.has(nonce)) return;
                seenMenuEventNonces.add(nonce);
                window.setTimeout(() => seenMenuEventNonces.delete(nonce), 1000);
            }
            action();
        };
        const openNewFolder = (e: Event) => {
            const nonce = (e as CustomEvent<{ nonce?: number }>).detail?.nonce;
            handle(nonce, () => {
                setNewFolderName("");
                setShowNewFolder(true);
            });
        };
        const openNewFile = (e: Event) => {
            const nonce = (e as CustomEvent<{ nonce?: number }>).detail?.nonce;
            handle(nonce, () => {
                setNewFileFolder(selectedFolderSlug || "");
                setNewFileSub("");
                setNewFileName("");
                setShowNewFile(true);
            });
        };
        const openCreateProject = (e: Event) => {
            const nonce = (e as CustomEvent<{ nonce?: number }>).detail?.nonce;
            handle(nonce, () => {
                setNewProjectName("");
                setShowCreateProject(true);
            });
        };
        const revealCurrent = () => {
            // Triggered by the command palette's "Reveal current file in
            // Explorer" action. Calls the same internal function as the
            // sidebar's 🎯 button.
            revealCurrentRef.current?.();
        };
        window.addEventListener("praxis:new-folder", openNewFolder);
        window.addEventListener("praxis:new-file", openNewFile);
        window.addEventListener("praxis:create-project", openCreateProject);
        window.addEventListener("praxis:reveal-current", revealCurrent);
        return () => {
            window.removeEventListener("praxis:new-folder", openNewFolder);
            window.removeEventListener("praxis:new-file", openNewFile);
            window.removeEventListener("praxis:create-project", openCreateProject);
            window.removeEventListener("praxis:reveal-current", revealCurrent);
        };
    }, [selectedFolderSlug]);

    const persistClipboard = React.useCallback((entry: ClipboardEntry | null) => {
        setClipboard(entry);
        try {
            if (entry) window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(entry));
            else window.localStorage.removeItem(CLIPBOARD_KEY);
        } catch { /* ignore */
        }
    }, [CLIPBOARD_KEY]);

    const handleCutFile = React.useCallback((folderSlug: string, folderName: string, fileSlug: string, fileName: string) => {
        persistClipboard({
            mode: "cut",
            folderSlug,
            folderName,
            fileSlug,
            fileName,
            files: [{folderSlug, folderName, fileSlug, fileName}]
        });
        toast({title: `Cut "${fileName}" — right-click a folder and pick Paste to move it.`});
    }, [persistClipboard]);

    const handleCopyFile = React.useCallback((folderSlug: string, folderName: string, fileSlug: string, fileName: string) => {
        persistClipboard({
            mode: "copy",
            folderSlug,
            folderName,
            fileSlug,
            fileName,
            files: [{folderSlug, folderName, fileSlug, fileName}]
        });
        toast({title: `Copied "${fileName}" — right-click a folder and pick Paste to copy it.`});
    }, [persistClipboard]);

    // ─── multi-file clipboard actions ──────────────────
    /** Resolve the CURRENT folder/file records for a set of multi-select
     *  keys — the selection may reference files that were renamed or
     *  deleted since; missing ones are dropped silently. */
    const resolveMultiFiles = React.useCallback(
        (keys: string[]): ClipboardFileRef[] => {
            const out: ClipboardFileRef[] = [];
            for (const key of keys) {
                const [folderSlug, fileSlug] = key.split("/");
                const folder = folders.find((c) => c.slug === folderSlug);
                const file = folder?.files.find((f) => f.slug === fileSlug);
                if (folder && file) {
                    out.push({folderSlug, folderName: folder.name, fileSlug, fileName: file.name});
                }
            }
            return out;
        },
        [folders]
    );

    const handleCutFiles = React.useCallback(
        (keys: string[]) => {
            const files = resolveMultiFiles(keys);
            if (files.length === 0) return;
            persistClipboard({
                mode: "cut",
                folderSlug: files[0].folderSlug,
                folderName: files[0].folderName,
                fileSlug: files[0].fileSlug,
                fileName: files[0].fileName,
                files,
            });
            setMultiSelect([]);
            toast({title: `Cut ${files.length} file${files.length === 1 ? "" : "s"} — right-click a folder and pick Paste to move them.`});
        },
        [resolveMultiFiles, persistClipboard]
    );

    const handleCopyFiles = React.useCallback(
        (keys: string[]) => {
            const files = resolveMultiFiles(keys);
            if (files.length === 0) return;
            persistClipboard({
                mode: "copy",
                folderSlug: files[0].folderSlug,
                folderName: files[0].folderName,
                fileSlug: files[0].fileSlug,
                fileName: files[0].fileName,
                files,
            });
            setMultiSelect([]);
            toast({title: `Copied ${files.length} file${files.length === 1 ? "" : "s"} — right-click a folder and pick Paste to copy them.`});
        },
        [resolveMultiFiles, persistClipboard]
    );

    // ─── drag-to-move handler lives after askPasteConflict
    // (it's in the useCallback deps — declared below). ──────────────────

    /** ask the user how to resolve a name collision —
     * Overwrite / Skip / (batch variants) / Cancel — via a dialog whose
     * buttons resolve the returned promise. */
    const askPasteConflict = React.useCallback(
        (fileName: string, folderName: string, remaining: number) =>
            new Promise<"overwrite" | "skip" | "overwriteAll" | "skipAll" | "cancel">((resolve) => {
                setPasteConflict({
                    fileName,
                    folderName,
                    remaining,
                    onResolve: (mode) => {
                        setPasteConflict(null);
                        resolve(mode);
                    },
                });
            }),
        []
    );

    // ─── drag-to-move ───────────────────────────────────────
    /** True while a drag-initiated multi-file move is in flight (keeps
     *  the op idempotent — a second drop during a move is ignored). */
    const [movingByDrag, setMovingByDrag] = React.useState(false);
    /** Move files dragged from the tree onto a folder header OR a nested
     *  subfolder row (VS Code Explorer behavior). One POST /api/file-move
     *  per file; a name collision reuses the paste-conflict dialog
     * (Overwrite / Skip / All / Cancel). the optional 4th arg
     *  is the relative SUB path of the drop target — dropping onto a
     *  subfolder row lands the files INSIDE it. Same-place drops (same
     *  folder AND same sub as the file's own directory) are filtered out
     *  first — that's a no-op, not an error. */
    const handleMoveFilesByDrag = React.useCallback(
        async (files: ClipboardFileRef[], targetFolderSlug: string, targetFolderName: string, targetSub?: string) => {
            const targetSubClean = targetSub?.trim() || "";
            // same-place drops are no-ops — a file already living in
            // the EXACT target directory (root⇠root or sub⇠same sub, decoded
            // from its lossless base64url slug) is filtered out; everything
            // else moves (including folder-root ⇢ subfolder and sibling-sub ⇢
            // sibling-sub moves inside ONE folder).
            const toMove = files.filter((f) => {
                if (f.folderSlug !== targetFolderSlug) return true;
                try {
                    const decoded = atob(f.fileSlug.replace(/-/g, "+").replace(/_/g, "/"));
                    const dir = decoded.includes("/") ? decoded.slice(0, decoded.lastIndexOf("/")) : "";
                    return dir !== targetSubClean;
                } catch {
                    return true;
                }
            });
            if (toMove.length === 0 || movingByDrag) return;
            setMovingByDrag(true);
            let moved = 0;
            let skipped = 0;
            let cancelled = false;
            let overwriteAll = false;
            let skipAll = false;
            try {
                for (let i = 0; i < toMove.length; i++) {
                    const f = toMove[i];
                    let res = await fetch("/api/file-move", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            fromFolder: f.folderSlug,
                            file: f.fileSlug,
                            toFolder: targetFolderSlug,
                            ...(targetSubClean ? {toSub: targetSubClean} : {}),
                            overwrite: overwriteAll,
                        }),
                    });
                    if (res.status === 409) {
                        if (skipAll) {
                            skipped++;
                            continue;
                        }
                        const remaining = toMove.length - i - 1;
                        const mode = await askPasteConflict(f.fileName, targetSubClean ? `${targetFolderName}/${targetSubClean}` : targetFolderName, remaining);
                        if (mode === "cancel") {
                            cancelled = true;
                            break;
                        }
                        if (mode === "overwriteAll") overwriteAll = true;
                        if (mode === "skipAll") skipAll = true;
                        if (mode === "skip" || mode === "skipAll") {
                            skipped++;
                            continue;
                        }
                        res = await fetch("/api/file-move", {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({
                                fromFolder: f.folderSlug,
                                file: f.fileSlug,
                                toFolder: targetFolderSlug,
                                ...(targetSubClean ? {toSub: targetSubClean} : {}),
                                overwrite: true,
                            }),
                        });
                    }
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        toast({
                            variant: "destructive" as const,
                            title: data.error ?? `Move failed (HTTP ${res.status})`
                        });
                        continue;
                    }
                    moved++;
                    onFileMoved?.(f.folderSlug, f.fileSlug, targetFolderSlug, data.newSlug, data.newName);
                }
                if (moved > 0) {
                    setMultiSelect([]);
                    toast({
                        variant: "success" as const,
                        title: `Moved ${moved} file${moved === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} skipped` : ""}`,
                        description: `Into "${targetFolderName}${targetSubClean ? "/" + targetSubClean : ""}".`,
                    });
                    onRefresh();
                } else if (!cancelled && skipped > 0) {
                    toast({title: `Nothing moved — ${skipped} file${skipped === 1 ? "" : "s"} skipped.`});
                } else if (cancelled) {
                    toast({title: "Move cancelled."});
                }
            } catch (e) {
                toast({
                    variant: "destructive" as const,
                    title: `Network error: ${e instanceof Error ? e.message : String(e)}`
                });
            } finally {
                setMovingByDrag(false);
            }
        },
        [movingByDrag, askPasteConflict, onFileMoved, onRefresh]
    );

    /* ─── drag a SUBFOLDER to another folder ────────────────
     The subfolder rows are now draggable (payload MIME
     `application/praxis-folder`); dropping one on a folder header or
     another subfolder row moves the WHOLE directory tree via the new
     /api/folder-move route. Guards here (cycle / same-place) are also
     enforced server-side — this is just the friendly early-out. */
    const [movingFolderByDrag, setMovingFolderByDrag] = React.useState(false);
    const handleMoveFolderByDrag = React.useCallback(
        async (payload: {
            folderSlug: string;
            dirPath: string
        }, targetFolderSlug: string, targetFolderName: string, targetSub?: string) => {
            const targetSubClean = targetSub?.trim() || "";
            // Same directory → no-op.
            if (payload.folderSlug === targetFolderSlug && payload.dirPath === targetSubClean) {
                toast({title: "Already there — nothing to move."});
                return;
            }
            // Dropping into itself or a descendant → cycle.
            if (payload.folderSlug === targetFolderSlug) {
                if (targetSubClean === payload.dirPath || targetSubClean.startsWith(payload.dirPath + "/")) {
                    toast({title: "A folder can't move into itself."});
                    return;
                }
            }
            if (movingFolderByDrag) return;
            setMovingFolderByDrag(true);
            try {
                const res = await fetch("/api/folder-move", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        fromFolder: payload.folderSlug,
                        dir: payload.dirPath,
                        toFolder: targetFolderSlug,
                        ...(targetSubClean ? {toSub: targetSubClean} : {}),
                    }),
                });
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    toast({variant: "destructive" as const, title: data.error ?? `Move failed (HTTP ${res.status})`});
                    return;
                }
                toast({
                    variant: "success" as const,
                    title: `Moved "${data.name}"`,
                    description: `Into "${targetFolderName}${targetSubClean ? "/" + targetSubClean : ""}".`,
                });
                onRefresh();
            } catch (e) {
                toast({
                    variant: "destructive" as const,
                    title: `Network error: ${e instanceof Error ? e.message : String(e)}`
                });
            } finally {
                setMovingFolderByDrag(false);
            }
        },
        [movingFolderByDrag, onRefresh, toast]
    );

    /** Paste the clipboard's file(s) into the target folder (
     * multi-aware + conflict-aware). If the clipboard mode is "cut",
     * files are MOVED (and the clipboard cleared); if "copy", files are
     * COPIED (and the clipboard kept so the user can paste again).
     * Name collisions open the overwrite/skip dialog — once per
     * file, with "all" variants that apply to the rest of the batch. */
    const handlePaste = React.useCallback(async (targetFolderSlug: string, targetFolderName: string, targetSub?: string) => {
        if (!clipboard) {
            toast({variant: "destructive" as const, title: "Nothing to paste — cut or copy a file first."});
            return;
        }
        const files: ClipboardFileRef[] =
            clipboard.files ?? [
                {
                    folderSlug: clipboard.folderSlug,
                    folderName: clipboard.folderName,
                    fileSlug: clipboard.fileSlug,
                    fileName: clipboard.fileName,
                },
            ];
        if (files.length === 0) return;
        // Same-folder cut is a no-op only when pasting into the folder ROOT
        // (pasting into a SUBFOLDER of the same folder is a real
        // move — the file slugs carry their relative paths).
        if (clipboard.mode === "cut" && !targetSub && files.every((f) => f.folderSlug === targetFolderSlug)) {
            toast({
                variant: "destructive" as const,
                title: "Source and target folder are the same — cut/paste within one folder is a no-op."
            });
            return;
        }
        const targetLabel = targetSub ? `${targetFolderName}/${targetSub}` : targetFolderName;
        setPasting(true);
        const endpoint = clipboard.mode === "cut" ? "/api/file-move" : "/api/file-copy";
        let overwriteAll = false;
        let skipAll = false;
        let moved = 0;
        let copied = 0;
        let skipped = 0;
        let cancelled = false;
        try {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (clipboard.mode === "cut" && !targetSub && f.folderSlug === targetFolderSlug) {
                    skipped++;
                    continue;
                }
                const overwrite = overwriteAll;
                let res = await fetch(endpoint, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        fromFolder: f.folderSlug,
                        file: f.fileSlug,
                        toFolder: targetFolderSlug,
                        ...(targetSub ? {toSub: targetSub} : {}),
                        overwrite,
                    }),
                });
                if (res.status === 409) {
                    if (skipAll) {
                        skipped++;
                        continue;
                    }
                    const remaining = files.length - i - 1;
                    const mode = await askPasteConflict(f.fileName, targetLabel, remaining);
                    if (mode === "cancel") {
                        cancelled = true;
                        break;
                    }
                    if (mode === "overwriteAll") overwriteAll = true;
                    if (mode === "skipAll") skipAll = true;
                    if (mode === "skip" || mode === "skipAll") {
                        skipped++;
                        continue;
                    }
                    res = await fetch(endpoint, {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            fromFolder: f.folderSlug,
                            file: f.fileSlug,
                            toFolder: targetFolderSlug,
                            ...(targetSub ? {toSub: targetSub} : {}),
                            overwrite: true,
                        }),
                    });
                }
                const data = await res.json();
                if (!res.ok || !data.ok) {
                    toast({variant: "destructive" as const, title: data.error ?? `Paste failed (HTTP ${res.status})`});
                    continue;
                }
                if (clipboard.mode === "cut") {
                    moved++;
                    onFileMoved?.(f.folderSlug, f.fileSlug, targetFolderSlug, data.newSlug, data.newName);
                } else {
                    copied++;
                    onFileCopied?.(f.folderSlug, f.fileSlug, targetFolderSlug, data.newSlug, data.newName);
                }
            }
            if (clipboard.mode === "cut" && moved > 0) {
                persistClipboard(null);
            }
            const acted = moved + copied;
            if (acted > 0) {
                toast({
                    variant: "success" as const,
                    title: `${clipboard.mode === "cut" ? "Moved" : "Copied"} ${acted} file${acted === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} skipped` : ""}`,
                    description: `Into "${targetLabel}".`,
                });
                onRefresh();
            } else if (!cancelled && skipped > 0) {
                toast({title: `Nothing pasted — ${skipped} file${skipped === 1 ? "" : "s"} skipped.`});
            } else if (cancelled) {
                toast({title: "Paste cancelled."});
            }
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setPasting(false);
        }
    }, [clipboard, onFileMoved, onFileCopied, onRefresh, persistClipboard, askPasteConflict]);

    /** Duplicate a file in-place via /api/file-duplicate. The new file
     *  gets the name `<stem> (N).<ext>` (auto-incremented). */
    const [duplicating, setDuplicating] = React.useState(false);
    const handleDuplicateFile = React.useCallback(async (folderSlug: string, fileSlug: string) => {
        setDuplicating(true);
        try {
            const res = await fetch("/api/file-duplicate", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderSlug, file: fileSlug}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Duplicate failed"});
                return;
            }
            toast({variant: "success" as const, title: `Duplicated as "${data.newName}".`});
            onFileDuplicated?.(folderSlug, data.newSlug, data.newName);
            onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setDuplicating(false);
        }
    }, [onFileDuplicated, onRefresh]);

    // ─── batch operations on the multi-selection ─────────
    const [multiDeleteTarget, setMultiDeleteTarget] = React.useState<{ count: number } | null>(null);
    const [multiDeleting, setMultiDeleting] = React.useState(false);

    /** Delete every file in the multi-selection (one /api/file-delete per
     *  file; failures are collected and reported in one toast). */
    const handleMultiDelete = React.useCallback(async () => {
        if (!multiDeleteTarget || multiSelect.length === 0) return;
        setMultiDeleting(true);
        const files = resolveMultiFiles(multiSelect);
        let deleted = 0;
        const failures: string[] = [];
        try {
            for (const f of files) {
                try {
                    const res = await fetch("/api/file-delete", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({folder: f.folderSlug, file: f.fileSlug}),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        failures.push(`${f.fileName}: ${data.error ?? `HTTP ${res.status}`}`);
                        continue;
                    }
                    deleted++;
                    onFileDeleted?.(f.folderSlug, f.fileSlug);
                } catch (e) {
                    failures.push(`${f.fileName}: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            if (deleted > 0) {
                toast({variant: "success" as const, title: `Deleted ${deleted} file${deleted === 1 ? "" : "s"}.`});
                await onRefresh();
            }
            if (failures.length > 0) {
                toast({
                    variant: "destructive" as const,
                    title: `${failures.length} deletion${failures.length === 1 ? "" : "s"} failed`,
                    description: failures.slice(0, 3).join(" · ")
                });
            }
        } finally {
            setMultiDeleting(false);
            setMultiDeleteTarget(null);
            setMultiSelect([]);
        }
    }, [multiDeleteTarget, multiSelect, resolveMultiFiles, onFileDeleted, onRefresh]);

    /** Toggle favorites for every file in the multi-selection (all to the
     *  majority state — favoriting when any is unfavored, clearing when
     * all are already favorites). composite keys. */
    const handleMultiFavorite = React.useCallback(() => {
        const files = resolveMultiFiles(multiSelect);
        if (files.length === 0) return;
        const keys = files.map((f) => `${f.folderSlug}/${f.fileSlug}`);
        const anyUnfavored = keys.some((k) => !favorites.has(k));
        for (let i = 0; i < files.length; i++) {
            if (anyUnfavored && !favorites.has(keys[i])) handleToggleFavorite(keys[i]);
            if (!anyUnfavored && favorites.has(keys[i])) handleToggleFavorite(keys[i]);
        }
        toast({title: anyUnfavored ? `Added ${files.length} file${files.length === 1 ? "" : "s"} to favorites.` : `Removed ${files.length} file${files.length === 1 ? "" : "s"} from favorites.`});
        setMultiSelect([]);
    }, [multiSelect, resolveMultiFiles, favorites, handleToggleFavorite]);

    // ─── batch ZIP of the multi-selection ─────────────────
    // The deferred "zip" from the bulk-ops list: one POST /api/batch-zip
    // archives every selected file (across folders) into ONE download
    // instead of downloading them one by one.
    const [zipBusy, setZipBusy] = React.useState(false);
    const handleZipSelected = React.useCallback(async () => {
        if (multiSelect.length === 0 || zipBusy) return;
        const files = resolveMultiFiles(multiSelect);
        if (files.length === 0) return;
        setZipBusy(true);
        try {
            const res = await fetch("/api/batch-zip", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    entries: files.map((f) => ({folder: f.folderSlug, file: f.fileSlug})),
                }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => null)) as { error?: string } | null;
                toast({
                    variant: "destructive" as const,
                    title: "Zip failed",
                    description: data?.error ?? `HTTP ${res.status}`,
                });
                return;
            }
            const blob = await res.blob();
            const zipped = Number(res.headers.get("X-Praxis-Entries") ?? files.length);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `praxis-selection-${zipped}-files.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
            toast({
                variant: "success" as const,
                title: `Zipped ${zipped} file${zipped === 1 ? "" : "s"}`,
                description: `${(blob.size / 1024).toFixed(0)} KB archive downloaded${zipped < files.length ? ` (${files.length - zipped} unreadable file(s) skipped).` : "."}`,
            });
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: "Zip failed",
                description: e instanceof Error ? e.message : String(e)
            });
        } finally {
            setZipBusy(false);
        }
    }, [multiSelect, resolveMultiFiles, zipBusy, toast]);

    /** remove EVERY favorite in a folder (context menu
     *  "Unfavorite all files" + the header's hover star-off button). Not
     *  destructive to files — only the favorites set — so no confirmation
     *  dialog; the toast reports how many were cleared and where. */
    const handleUnfavoriteAllInFolder = React.useCallback(
        (folderSlug: string, folderName: string, sub?: string) => {
            const folder = folders.find((c) => c.slug === folderSlug);
            if (!folder) return;
            // with `sub`, only the favorites INSIDE that nested
            // subfolder are cleared (exact dir or descendants).
            const keys = folder.files
                .filter((f) =>
                    !sub ||
                    (f.dir ?? "") === sub ||
                    (f.dir ?? "").startsWith(sub + "/")
                )
                .map((f) => `${folderSlug}/${f.slug}`)
                .filter((k) => favorites.has(k));
            if (keys.length === 0) return;
            for (const k of keys) handleToggleFavorite(k);
            toast({
                variant: "success" as const,
                title: `Removed ${keys.length} favorite${keys.length === 1 ? "" : "s"}.`,
                description: `Cleared every favorite in "${sub ? `${folderName}/${sub}` : folderName}".`,
            });
        },
        [folders, favorites, handleToggleFavorite, toast]
    );

    /** the file-row click handler with Ctrl/Cmd (toggle) +
     * Shift (range) modifiers — the "normal explorer" selection model.
     * two semantics fixed to match Windows/macOS
     * explorers (both were reported as "not working"):
     * • A PLAIN click now SETS the shift anchor (it used to null it) —
     * so click file A, then Shift+click file D ranges A–D.
     * • The FIRST Ctrl+click SEEDS the selection with the currently
     * selected file (it used to start empty) — so click A (it opens),
     * Ctrl+click B, Ctrl+click C → A,B,C all selected, and
     * "Delete selected (3)" deletes exactly what the user sees
     * highlighted in the editor + rows. */
    const handleFileRowClick = React.useCallback(
        (e: React.MouseEvent, folderSlug: string, fileSlug: string, sortedSlugs: string[], sortedKeys?: string[]) => {
            const key = `${folderSlug}/${fileSlug}`;
            if (e.ctrlKey || e.metaKey) {
                setMultiSelect((prev) => {
                    if (prev.length > 0) {
                        return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
                    }
                    // Seed: the currently selected file joins the new selection.
                    const selectedKey =
                        selectedFolderSlug && selectedFileSlug
                            ? `${selectedFolderSlug}/${selectedFileSlug}`
                            : null;
                    const base = selectedKey && selectedKey !== key ? [selectedKey] : [];
                    return [...base, key];
                });
                multiAnchorRef.current = key;
                return;
            }
            if (e.shiftKey && multiAnchorRef.current) {
                const anchorKey = multiAnchorRef.current;
                // the flat/kind/details views pass the FULL ordered
                // key list — Shift ranges work ACROSS folders there (the
                // anchor may sit in a different folder than the clicked row).
                if (
                    sortedKeys &&
                    sortedKeys.includes(key) &&
                    sortedKeys.includes(anchorKey)
                ) {
                    const a = sortedKeys.indexOf(anchorKey);
                    const b = sortedKeys.indexOf(key);
                    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
                    const range = sortedKeys.slice(lo, hi + 1);
                    setMultiSelect((prev) => [
                        ...prev.filter((k) => !sortedKeys.includes(k)),
                        ...range,
                    ]);
                    return;
                }
                if (anchorKey.startsWith(`${folderSlug}/`)) {
                    const anchorSlug = anchorKey.slice(folderSlug.length + 1);
                    const a = sortedSlugs.indexOf(anchorSlug);
                    const b = sortedSlugs.indexOf(fileSlug);
                    if (a >= 0 && b >= 0) {
                        const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
                        const range = sortedSlugs.slice(lo, hi + 1).map((s) => `${folderSlug}/${s}`);
                        setMultiSelect((prev) => [
                            ...prev.filter((k) => !k.startsWith(`${folderSlug}/`)),
                            ...range,
                        ]);
                        return;
                    }
                }
                // Fall through to a plain select when the anchor is unusable.
            }
            // PERF: bail out when the selection is already empty —
            // a fresh `[]` identity re-rendered the whole 8k-line tree
            // URGENTLY on every plain click (1.2-1.3 s blocking render — the
            // "file opens slowly" root cause). Returning the SAME array
            // reference lets React skip the re-render entirely.
            setMultiSelect((prev) => (prev.length === 0 ? prev : []));
            // the plain click becomes the NEW shift anchor (standard
            // explorer behavior — the anchor is wherever you last clicked).
            multiAnchorRef.current = key;
            onSelectFile(folderSlug, fileSlug);
        },
        [onSelectFile, selectedFolderSlug, selectedFileSlug]
    );

    /** explorer keyboard operations. Fired from the tree's
     *  scroll container when focus is on a row (or the container itself)
     *  and NOT inside an input/textarea: Delete deletes, Ctrl+C/X copy /
     *  cut, Ctrl+V pastes into the focused file's folder, F2 renames. */
    const handleTreeKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLElement>) => {
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
            ) {
                return; // typing somewhere — let the input own the keys
            }
            const focusKey = focusKeyRef.current;
            if (!focusKey) return;
            const [folderSlug, fileSlug] = focusKey.split("/");
            const folder = folders.find((c) => c.slug === folderSlug);
            const file = folder?.files.find((f) => f.slug === fileSlug);
            if (!folder || !file) return;
            const effectiveKeys =
                multiSelect.length > 1 && multiSelect.includes(focusKey) ? multiSelect : [focusKey];

            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                if (effectiveKeys.length > 1) setMultiDeleteTarget({count: effectiveKeys.length});
                else setDeleteTarget({
                    folder: folderSlug,
                    folderName: folder.name,
                    file: fileSlug,
                    fileName: file.name
                });
                return;
            }
            const mod = e.ctrlKey || e.metaKey;
            if (mod && (e.key === "c" || e.key === "C")) {
                e.preventDefault();
                if (effectiveKeys.length > 1) handleCopyFiles(effectiveKeys);
                else handleCopyFile(folderSlug, folder.name, fileSlug, file.name);
                return;
            }
            if (mod && (e.key === "x" || e.key === "X")) {
                e.preventDefault();
                if (effectiveKeys.length > 1) handleCutFiles(effectiveKeys);
                else handleCutFile(folderSlug, folder.name, fileSlug, file.name);
                return;
            }
            if (mod && (e.key === "v" || e.key === "V")) {
                e.preventDefault();
                void handlePaste(folderSlug, folder.name);
                return;
            }
            if (e.key === "F2") {
                e.preventDefault();
                handleStartRename(folderSlug, folder.name, fileSlug, file.name);
                return;
            }
        },
        [folders, multiSelect, handleCopyFiles, handleCopyFile, handleCutFiles, handleCutFile, handlePaste, handleStartRename]
    );

    // ─── folder issues summary fetch ────────────────────
    // sends the SELECTED interpreter (Settings → Python) so
    // the lint runs in the same env the "Install ruff" button targets.
    const handleFetchFolderLint = React.useCallback(async (folderSlug: string, folderName: string, sub?: string) => {
        const label = sub ? `${folderName}/${sub}` : folderName;
        setFolderLint({folderSlug, folderName: label, sub, loading: true, data: null});
        try {
            const res = await fetch("/api/folder-lint", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                // `sub` lints only that nested subfolder (server-side
                // scope added).
                body: JSON.stringify({
                    folder: folderSlug,
                    interpreter: pythonInterpreter || undefined, ...(sub ? {sub} : {})
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setFolderLint({folderSlug, folderName: label, sub, loading: false, data});
        } catch (e) {
            setFolderLint(null);
            toast({
                variant: "destructive" as const,
                title: "Issues report failed",
                description: e instanceof Error ? e.message : String(e)
            });
        }
    }, [pythonInterpreter]);

    // ─── "Install ruff" (shown when linter === "none") ───────
    // Installs ruff into the SELECTED environment via /api/pip-install,
    // then re-runs the folder lint so the report fills in immediately.
    const [installingPkg, setInstallingPkg] = React.useState<string | null>(null);
    const handleInstallRuff = React.useCallback(async () => {
        if (!folderLint || installingPkg) return;
        setInstallingPkg("ruff");
        try {
            const res = await fetch("/api/pip-install", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({package: "ruff", interpreter: pythonInterpreter || undefined}),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(
                    (typeof data.output === "string" && data.output.trim().slice(-400)) ||
                    data.error ||
                    `pip exited with code ${data.exitCode ?? "?"}`
                );
            }
            toast({
                variant: "success" as const,
                title: "ruff installed",
                description: `Installed into ${data.interpreter ?? "the selected environment"}. Re-checking the folder…`,
            });
            await handleFetchFolderLint(folderLint.folderSlug, folderLint.folderName, folderLint.sub);
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: "Install failed",
                description: e instanceof Error ? e.message : String(e)
            });
        } finally {
            setInstallingPkg(null);
        }
    }, [folderLint, installingPkg, pythonInterpreter, handleFetchFolderLint]);

    /** Build the markdown report for the issues summary dialog (used by
     * both Download and Save-in-folder). when no linter was
     *  available the header says so plainly instead of a bare
     *  "Linter: none". */
    const buildFolderLintMarkdown = React.useCallback(() => {
        if (!folderLint?.data) return "";
        const d = folderLint.data;
        const lines: string[] = [];
        lines.push(`# Issues Report — ${folderLint.folderName}`);
        lines.push("");
        if (d.linter === "none") {
            lines.push(`Generated: ${new Date(d.generatedAt).toLocaleString()} · No linter available — nothing was checked.`);
            if (d.hint) lines.push(d.hint);
            lines.push("");
            return lines.join("\n");
        }
        lines.push(`Generated: ${new Date(d.generatedAt).toLocaleString()} · Linter: ${d.linter}`);
        lines.push("");
        lines.push(`**${d.totals.issues} issue${d.totals.issues === 1 ? "" : "s"}** across ${d.totals.filesWithIssues} of ${d.totals.files} file${d.totals.files === 1 ? "" : "s"} (unused imports, unused variables, and other lint findings).`);
        lines.push("");
        const rules = Object.entries(d.totals.byRule).sort((a, b) => b[1] - a[1]);
        if (rules.length > 0) {
            lines.push("## By rule");
            lines.push("");
            lines.push("| Rule | Count |");
            lines.push("| --- | --- |");
            for (const [code, count] of rules) lines.push(`| ${code} | ${count} |`);
            lines.push("");
        }
        for (const f of d.files) {
            if (f.issues.length === 0) continue;
            lines.push(`## ${f.file}`);
            lines.push("");
            for (const i of f.issues) {
                lines.push(`- **L${i.line}:${i.col}** \`${i.code}\` — ${i.message}`);
            }
            lines.push("");
        }
        return lines.join("\n");
    }, [folderLint]);

    /** Download the issues report as a .md file. */
    const handleDownloadFolderLint = React.useCallback(() => {
        const md = buildFolderLintMarkdown();
        if (!md) return;
        const blob = new Blob([md], {type: "text/markdown;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `IssuesReport-${folderLint?.folderSlug ?? "folder"}.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, [buildFolderLintMarkdown, folderLint]);

    /** Save the issues report INTO the folder folder (IssuesReport.md). */
    const handleSaveFolderLint = React.useCallback(async () => {
        if (!folderLint) return;
        const md = buildFolderLintMarkdown();
        if (!md) return;
        try {
            const res = await fetch("/api/file-write", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({folder: folderLint.folderSlug, fileName: "IssuesReport.md", content: md}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            toast({
                variant: "success" as const,
                title: "Report saved",
                description: `IssuesReport.md written into "${folderLint.folderName}".`
            });
            await onRefresh();
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: "Could not save report",
                description: e instanceof Error ? e.message : String(e)
            });
        }
    }, [folderLint, buildFolderLintMarkdown, onRefresh]);

    // ─── Upload-files-into-specific-folder ───────────────────────────
    // Used by the folder Properties dialog's "Upload files" button.
    // Opens a hidden <input type=file multiple>, reads each file, and
    // POSTs to /api/files-import with the appropriate encoding (utf-8
    // for text, base64 for binary).
    const uploadFilesInputRef = React.useRef<HTMLInputElement | null>(null);
    const [uploadTargetFolder, setUploadTargetFolder] = React.useState<{
        slug: string;
        name: string;
        sub?: string
    } | null>(null);
    const [uploadingFiles, setUploadingFiles] = React.useState(false);

    const handleUploadFilesClick = React.useCallback((folderSlug: string, folderName: string, sub?: string) => {
        setUploadTargetFolder({slug: folderSlug, name: folderName, sub});
        // Trigger the hidden file input on the next tick.
        requestAnimationFrame(() => {
            uploadFilesInputRef.current?.click();
        });
    }, []);

    const handleUploadFilesSelected = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const target = uploadTargetFolder;
        if (!target) return;
        const files: File[] = Array.from(e.target.files ?? []);
        // Clear the input so the same file can be picked again later.
        e.target.value = "";
        if (files.length === 0) return;
        // Same binary-detection list as page.tsx's handleDrop.
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
        for (const f of files) {
            if (f.size === 0 && !f.name.includes(".")) continue;
            const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
            const isBinary = BINARY_EXTS.has(ext);
            try {
                const content = await readFile(f, isBinary);
                pending.push({name: f.name, content, encoding: isBinary ? "base64" : "utf-8"});
            } catch (err) {
                toast({
                    variant: "destructive" as const,
                    title: `Could not read ${f.name}: ${err instanceof Error ? err.message : String(err)}`
                });
            }
        }
        if (pending.length === 0) return;
        setUploadingFiles(true);
        try {
            const targetLabel = target.sub ? `${target.name}/${target.sub}` : target.name;
            // Dry-run first to discover conflicts.
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                // `sub` uploads into a NESTED subfolder.
                body: JSON.stringify({
                    folder: target.slug, ...(target.sub ? {sub: target.sub} : {}),
                    files: pending,
                    overwrite: false
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Upload failed"});
                return;
            }
            const imported = data.imported?.length ?? 0;
            const skipped = data.skipped?.length ?? 0;
            if (skipped > 0) {
                // Re-run with overwrite:true for the skipped files — but only
                // if the user confirms. For simplicity, we ask via window.confirm
                // (the user already initiated the upload intentionally).
                const ok = window.confirm(
                    `${skipped} file(s) already exist in "${targetLabel}". Overwrite them?`
                );
                if (ok) {
                    // Re-import the skipped files with overwrite:true.
                    const skippedNames = new Set(data.skipped.map((s: { name: string }) => s.name));
                    const toOverwrite = pending.filter((p) => skippedNames.has(p.name));
                    await fetch("/api/files-import", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            folder: target.slug, ...(target.sub ? {sub: target.sub} : {}),
                            files: toOverwrite,
                            overwrite: true
                        }),
                    });
                    toast({
                        variant: "warning" as const,
                        title: `Uploaded ${pending.length} file(s) into "${targetLabel}" (${skipped} overwritten).`
                    });
                } else {
                    toast({
                        variant: "warning" as const,
                        title: `Uploaded ${imported} new file(s); skipped ${skipped} existing.`
                    });
                }
            } else {
                toast({variant: "success" as const, title: `Uploaded ${imported} file(s) into "${targetLabel}".`});
            }
            onFilesImported?.(target.slug, pending.map((p) => p.name));
            onRefresh();
        } catch (err) {
            toast({
                variant: "destructive" as const,
                title: `Upload failed: ${err instanceof Error ? err.message : String(err)}`
            });
        } finally {
            setUploadingFiles(false);
            setUploadTargetFolder(null);
        }
    }, [uploadTargetFolder, onFilesImported, onRefresh]);

    // ─── Drag-and-drop file import state ─────────────────────────────
    // The folder row that the user is currently dragging files over
    // (highlighted with a drop-zone style).
    const [dragOverFolder, setDragOverFolder] = React.useState<string | null>(null);

    // Pending import — set when files are dropped. We do an initial
    // dry-run import with overwrite:false to discover which files already
    // exist on disk. If any conflicts are found, we show the conflict
    // dialog (overwrite / overwrite all / skip / skip all). Otherwise we
    // import everything immediately.
    interface PendingFile {
        name: string;
        content: string;
        encoding?: "utf-8" | "base64";
    }

    interface ConflictResult {
        imported: Array<{ name: string; slug: string; path: string; overwritten: boolean }>;
        skipped: Array<{ name: string; reason: string }>;
    }

    const [pendingImport, setPendingImport] = React.useState<{
        folderSlug: string;
        folderName: string;
        sub?: string;
        files: PendingFile[]
    } | null>(null);
    const [conflictResult, setConflictResult] = React.useState<ConflictResult | null>(null);
    const [importing, setImporting] = React.useState(false);

    /** Read a File object as text (utf-8). */
    const readFileAsText = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result ?? ""));
            r.onerror = () => reject(r.error ?? new Error("read failed"));
            r.readAsText(file);
        });

    /** Read a File as base64 (without the data: prefix). Used for binary
     * files (images, PDFs,.xlsx, etc.) so they survive JSON transport. */
    const readFileAsBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => {
                const s = String(r.result ?? "");
                const idx = s.indexOf(",");
                resolve(idx >= 0 ? s.slice(idx + 1) : s);
            };
            r.onerror = () => reject(r.error ?? new Error("read failed"));
            r.readAsDataURL(file);
        });

    // Binary file extensions — same list as page.tsx's handleDrop.
    // Used to decide whether to read a dropped file as text or base64.
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

    /** Handle files dropped onto a folder header OR a nested subfolder row
     * (the 4th arg is the subfolder's relative path — the
     *  import lands inside it via /api/files-import's `sub` field). */
    const handleDropOnFolder = React.useCallback(async (folderSlug: string, folderName: string, fileList: FileList | File[], targetSub?: string) => {
        const subClean = targetSub?.trim() || "";
        const targetLabel = subClean ? `${folderName}/${subClean}` : folderName;
        const files = Array.from(fileList);
        if (files.length === 0) return;
        // Read each file — base64 for binary, utf-8 for text. This lets
        // the user drop ANY file type (images, CSVs, PDFs, etc.) into a
        // folder, not just .py / .ipynb.
        const pending: PendingFile[] = [];
        for (const f of files) {
            // Skip directories (their type is empty AND they have no size).
            // The DataTransferItemList may include folders; FileReader would
            // read them as empty so we filter by size > 0 OR by extension.
            if (f.size === 0 && !f.name.includes(".")) continue;
            try {
                const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
                const isBinary = BINARY_EXTS.has(ext);
                const content = isBinary ? await readFileAsBase64(f) : await readFileAsText(f);
                pending.push({name: f.name, content, encoding: isBinary ? "base64" : "utf-8"} as PendingFile);
            } catch (e) {
                toast({
                    variant: "destructive" as const,
                    title: `Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`
                });
            }
        }
        if (pending.length === 0) return;
        // Initial dry-run import (overwrite:false) — we'll discover which
        // files already exist on disk.
        setImporting(true);
        try {
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlug, ...(subClean ? {sub: subClean} : {}),
                    files: pending,
                    overwrite: false
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Import failed"});
                return;
            }
            const result = data as ConflictResult;
            const wasModalOpen = !!pendingImport;
            const isSwitchingFolders = wasModalOpen && pendingImport!.folderSlug !== folderSlug;
            // If everything was imported (no conflicts), we're done. Also
            // CLOSE any pre-existing conflict modal (the new drop replaced
            // the previous pending import).
            if (result.skipped.length === 0) {
                toast({
                    variant: "success" as const,
                    title: `Imported ${result.imported.length} file${result.imported.length === 1 ? "" : "s"} into ${targetLabel}.`
                });
                onFilesImported?.(folderSlug, result.imported.map((f) => f.name));
                onRefresh();
                if (wasModalOpen) {
                    // The previous drop's modal is no longer relevant — close it.
                    setPendingImport(null);
                    setConflictResult(null);
                }
                return;
            }
            // Conflicts found — show the dialog so the user can choose.
            // If there's already a pending import (dialog open from a
            // previous drop on a different folder), REPLACE it — the
            // dialog updates dynamically to show the new target folder
            // and the new conflict list.
            if (isSwitchingFolders) {
                toast({
                    variant: "warning" as const,
                    title: `Switched to "${targetLabel}" — ${result.skipped.length} conflict${result.skipped.length === 1 ? "" : "s"} found.`
                });
            }
            setPendingImport({folderSlug, folderName, sub: subClean || undefined, files: pending});
            setConflictResult(result);
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setImporting(false);
        }
    }, [onFilesImported, onRefresh, pendingImport]);

    /** Re-import with overwrite=true for the chosen files. */
    const resolveConflicts = React.useCallback(async (mode: "overwrite_all" | "skip_all") => {
        if (!pendingImport) return;
        if (mode === "skip_all") {
            // Just keep the files that were already imported in the dry-run.
            const imported = conflictResult?.imported ?? [];
            const skipped = conflictResult?.skipped ?? [];
            toast({
                variant: "warning" as const,
                title: `Imported ${imported.length} new file${imported.length === 1 ? "" : "s"}; skipped ${skipped.length} existing file${skipped.length === 1 ? "" : "s"}.`
            });
            onFilesImported?.(pendingImport.folderSlug, imported.map((f) => f.name));
            onRefresh();
            setPendingImport(null);
            setConflictResult(null);
            return;
        }
        // overwrite_all — re-call the API with overwrite=true for all files.
        setImporting(true);
        try {
            const res = await fetch("/api/files-import", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: pendingImport.folderSlug,
                    ...(pendingImport.sub ? {sub: pendingImport.sub} : {}),
                    files: pendingImport.files,
                    overwrite: true,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                toast({variant: "destructive" as const, title: data.error ?? "Import failed"});
                return;
            }
            const result = data as ConflictResult;
            toast({
                variant: "success" as const,
                title: `Imported ${result.imported.length} file${result.imported.length === 1 ? "" : "s"} into ${pendingImport.folderName}${pendingImport.sub ? "/" + pendingImport.sub : ""}.`
            });
            onFilesImported?.(pendingImport.folderSlug, result.imported.map((f) => f.name));
            onRefresh();
            setPendingImport(null);
            setConflictResult(null);
        } catch (e) {
            toast({
                variant: "destructive" as const,
                title: `Network error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            setImporting(false);
        }
    }, [pendingImport, conflictResult, onFilesImported, onRefresh]);

    // ─── Recently modified section ───────────────────────────────────
    // The 5 most-recently-modified files across ALL folders, shown in
    // a collapsible "Recent" section at the top of the tree. Clicking a
    // recent file selects it (calls onSelectFile). Hidden while a filter
    // is active so search results stay clean.
    const [recentCollapsed, setRecentCollapsed] = React.useState(false);
    const recentFiles = React.useMemo(() => {
        const all: Array<{ folderSlug: string; folderName: string; file: TreeFile }> = [];
        for (const c of folders) {
            for (const f of c.files) {
                if (f.mtime) all.push({folderSlug: c.slug, folderName: c.name, file: f});
            }
        }
        all.sort((a, b) => (b.file.mtime ?? 0) - (a.file.mtime ?? 0));
        // the count is configurable (Settings → Editor →
        // Recent files count, clamped 1–20).
        const count = Math.max(1, Math.min(20, recentFilesCount || 5));
        return all.slice(0, count);
    }, [folders, recentFilesCount]);

    // Filter folders + files by the search query (fuzzy match on names
    // so "mdv" matches "Mean and Variance.py"; substring on description
    // + tags since those are explicit keywords, not free text). Uses
    // the deferred filter so rapid typing doesn't block the input.
    const filtered = React.useMemo(() => {
        const q = deferredFilter.trim().toLowerCase();
        if (!q) return folders;
        return folders
            .map((c) => {
                const folderMatches = fuzzyMatch(q, c.name);
                const matchingFiles = c.files.filter(
                    (f) =>
                        fuzzyMatch(q, f.name) ||
                        (f.description ?? "").toLowerCase().includes(q) ||
                        (f.tags ?? []).some((t) => t.includes(q))
                );
                if (folderMatches || matchingFiles.length > 0) {
                    return {...c, files: folderMatches ? c.files : matchingFiles};
                }
                return null;
            })
            .filter(Boolean) as TreeFolder[];
    }, [folders, deferredFilter]);

    // ───
    // project dir should be on the same level of the folders and not in
    // a new folder named with the same project like python_scripts") ──
    // The synthetic PROJECT-ROOT entry no longer renders as a folder
    // row: its FILES surface at the TOP LEVEL of the tree, directly
    // alongside the real folders (VS Code-style: folders first, then
    // the root-level files group). Root-level affordances (New file,
    // New folder, Refresh, Reveal) stay available on the explorer's
    // blank-area right-click menu.
    const treeOrder = React.useMemo(() => {
        const roots = filtered.filter((f) => f.isRoot);
        const rest = filtered.filter((f) => !f.isRoot);
        return [...rest, ...roots];
    }, [filtered]);

    // ─── alternate explorer views (flat / kind / details) ──
    // ONE ordered entry list shared by all three modes: every file in
    // the (filtered) project, sorted by the EFFECTIVE explorer sort with
    // favorites still pinned first — so the flat views respect the same
    // Sort ▸ submenu the tree uses.
    interface FlatEntry {
        folderSlug: string;
        folderName: string;
        file: TreeFile;
        key: string;
    }

    const flatEntries = React.useMemo(() => {
        const out: FlatEntry[] = [];
        for (const folder of filtered) {
            for (const file of sortedFilesByFolder.get(folder.slug) ?? []) {
                out.push({
                    folderSlug: folder.slug,
                    folderName: folder.name,
                    file,
                    key: `${folder.slug}/${file.slug}`,
                });
            }
        }
        const dir = effectiveSortAsc ? 1 : -1;
        out.sort((a, b) => {
            const fa = favorites.has(a.key) ? 0 : 1;
            const fb = favorites.has(b.key) ? 0 : 1;
            if (fa !== fb) return fa - fb;
            if (effectiveSortMode === "mtime") {
                return ((b.file.mtime ?? 0) - (a.file.mtime ?? 0)) * dir;
            }
            if (effectiveSortMode === "size") {
                return ((b.file.size ?? 0) - (a.file.size ?? 0)) * dir;
            }
            if (effectiveSortMode === "type") {
                const ea = (a.file.ext ?? "").toLowerCase();
                const eb = (b.file.ext ?? "").toLowerCase();
                if (ea !== eb) return ea.localeCompare(eb, "en") * dir;
            }
            return a.file.name.localeCompare(b.file.name, "en", {sensitivity: "base"}) * dir;
        });
        return out;
    }, [filtered, sortedFilesByFolder, effectiveSortMode, effectiveSortAsc, favorites]);
    /** Ordered composite keys of the flat list — Shift ranges in the
     *  alternate views span the WHOLE visible list (across folders). */
    const flatEntryKeys = React.useMemo(() => flatEntries.map((e) => e.key), [flatEntries]);
    /** Kind view: bucket the flat entries by FileKind, biggest group first. */
    const kindGroups = React.useMemo(() => {
        if (explorerView !== "kind") return [] as Array<[string, FlatEntry[]]>;
        const groups = new Map<string, FlatEntry[]>();
        for (const e of flatEntries) {
            const k = e.file.kind ?? "other";
            const bucket = groups.get(k);
            if (bucket) bucket.push(e);
            else groups.set(k, [e]);
        }
        return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    }, [explorerView, flatEntries]);

    // ─── TREE VIRTUALIZATION (D17) ────────────────────────────────────
    //
    // The tree used to mount EVERY visible row (folder headers, nested
    // subfolder rows, file rows) at once — with big projects (hundreds
    // of files + deep nesting) that's thousands of rows participating
    // in layout on every render. It is now FLATTENED into one ordered
    // row list and rendered WINDOWED between two spacer divs: only the
    // rows intersecting [scrollTop − overscan, scrollTop + viewport +
    // overscan] are mounted. Design notes:
    //   • the flatten useMemo depends ONLY on structural state (folders,
    //     the two expansion sets, filter text, sort) — never on hover or
    //     selection churn, so it doesn't re-run on mouse moves / clicks;
    //   • the row markup is unchanged (context menus, drag-drop, inline
    //     folder filter, badges, marks, tooltips); indentation stays the
    //     explicit depth-aware padding classes — the DOM was never
    //     nested for styling, so flattening is visually identical;
    //   • row heights are MEASURED (data-vrow) with per-kind estimates
    //     for never-mounted rows, so variable-height rows (the
    //     folder-filter input, tag rows, the root data chip) window
    //     correctly too;
    //   • the mounted range lives in state with hysteresis (overscan), so
    //     scrolling doesn't re-render per frame — only when the window
    //     actually crosses the overscan boundary;
    //   • when the row list changes (expand / collapse / watcher refresh
    //     / filter edits) the viewport is re-anchored to the row that sat
    //     at its top edge, so collapsing a folder far above doesn't jump
    //     the view (and the browser clamps collapses at the bottom).
    type VirtualTreeRowKind = "folder" | "filter" | "rootdata" | "tags" | "subfolder" | "file";

    interface VirtualTreeRow {
        /** stable row key — `f:` folder header, `ff:` folder-filter box,
         *  `rd:` root data chip, `tg:` folder tags, `d:` nested subfolder,
         *  `v:` file. */
        key: string;
        kind: VirtualTreeRowKind;
        folder: TreeFolder;
        /** the FILTER-AWARE file list this folder displays (one shared
         *  array reference per folder — the folder-scoped find filters it). */
        folderFiles: TreeFile[];
        /** ordered slugs of that list — Shift-range multi-select. */
        folderFileSlugs: string[];
        /** the folder-scoped find is open on this folder (it forces the
         *  folder open so matches stay visible). */
        folderFilterActive: boolean;
        /** top-level folder expanded state (folder rows). */
        isExpanded?: boolean;
        /** total (unfiltered) file count — the folder-filter counter. */
        folderFileTotal?: number;
        /** relative sub path (subfolder rows). */
        dirPath?: string;
        /** nesting depth (0 = directly inside the folder). */
        depth?: number;
        /** nested subfolder expanded state (subfolder rows). */
        isOpen?: boolean;
        /** the file record (file rows). */
        file?: TreeFile;
        /** the row belongs to the synthetic PROJECT-ROOT entry — its
         *  children render shifted −12px (the old -ml-3 wrapper, now
         *  inlined per row since the wrapper div is gone). */
        rootShift?: boolean;
    }

    /** Estimated row heights before first measurement (px). The uniform
     *  rows (folder / subfolder / file) are exact — py-1 (8px) + a 16px
     *  line box; the variable rows (filter input, tags, root data chip)
     *  get corrected by the measurement pass as soon as they mount. */
    const VIRTUAL_ROW_ESTIMATE: Record<VirtualTreeRowKind, number> = {
        folder: 24,
        filter: 33,
        rootdata: 23,
        tags: 20,
        subfolder: 24,
        file: 24,
    };
    /** Rows mounted beyond each viewport edge (~10 rows) — the
     *  hysteresis that keeps the scroll listener from re-rendering on
     *  every scroll frame. */
    const VIRTUAL_OVERSCAN_PX = 240;

    /** The flattened list of every VISIBLE tree row, in document order.
     *  Purely structural — see the deps array; row CONTENT (favorites,
     *  multi-select, git letters, appearance…) is read by the row
     *  renderer at render time and never re-flattens the list. */
    const treeRows = React.useMemo(() => {
        const rows: VirtualTreeRow[] = [];
        for (const folder of treeOrder) {
            // a folder-scoped find forces the folder open while its filter
            // box is showing.
            const folderFilterActive = folderFilter === folder.slug;
            const isExpanded =
                expanded.has(folder.slug) || filterAutoExpand || folderFilterActive;
            // the files this folder DISPLAYS — the folder filter keeps only
            // name matches (with bubbling).
            const allFiles = sortedFilesByFolder.get(folder.slug) ?? [];
            const folderFiles =
                folderFilterActive && folderFilterText.trim()
                    ? allFiles.filter((f) =>
                        f.name.toLowerCase().includes(folderFilterText.trim().toLowerCase())
                    )
                    : allFiles;
            const folderFileSlugs = folderFiles.map((f) => f.slug);
            const base = {
                folder,
                folderFiles,
                folderFileSlugs,
                folderFilterActive,
            };
            // the synthetic PROJECT-ROOT entry renders NO folder header —
            // its children render directly at the top level.
            if (!folder.isRoot) {
                rows.push({
                    ...base,
                    key: `f:${folder.slug}`,
                    kind: "folder",
                    isExpanded,
                });
                // the folder-scoped find input sits right under the header.
                if (folderFilterActive) {
                    rows.push({
                        ...base,
                        key: `ff:${folder.slug}`,
                        kind: "filter",
                        folderFileTotal: allFiles.length,
                    });
                }
            }
            // the root entry's files render WITHOUT an expansion gate —
            // they are always-visible top-level rows.
            if (isExpanded || folder.isRoot) {
                const rootShift = !!folder.isRoot;
                // root-level DATA files affordance (the root entry skips the
                // folder header that carried the database chip).
                if (rootShift && folder.dataFiles && folder.dataFiles.length > 0) {
                    rows.push({...base, key: `rd:${folder.slug}`, kind: "rootdata"});
                }
                if (showTags && folder.tags && folder.tags.length > 0) {
                    rows.push({...base, key: `tg:${folder.slug}`, kind: "tags", rootShift});
                }
                // The dir paths present in this folder (sorted so folders read
                // alphabetically at every level) — union of the FILES' dirs
                // with the folder's own `dirs` listing (which includes EMPTY
                // subfolders, so a just-created subfolder renders immediately).
                const dirPaths = [
                    ...new Set([
                        ...(folder.dirs ?? []),
                        ...folderFiles
                            .filter((f) => !!f.dir)
                            .map((f) => f.dir as string),
                    ]),
                ].sort((a, b) => a.localeCompare(b, "en", {sensitivity: "base"}));
                // Immediate children of `parent` ("" = folder root).
                const childDirsOf = (parent: string) =>
                    dirPaths.filter((p) =>
                        parent
                            ? p.startsWith(parent + "/") &&
                            !p.slice(parent.length + 1).includes("/")
                            : !p.includes("/")
                    );
                const walkDir = (dirPath: string, depth: number) => {
                    const folderKey = `${folder.slug}::${dirPath}`;
                    // Force open while a global / folder filter is active so
                    // matches stay visible — unless the user explicitly
                    // collapsed all (the override).
                    const isOpen =
                        expandedFolders.has(folderKey) || filterAutoExpand || folderFilterActive;
                    rows.push({
                        ...base,
                        key: `d:${folder.slug}::${dirPath}`,
                        kind: "subfolder",
                        dirPath,
                        depth,
                        isOpen,
                        rootShift,
                    });
                    if (isOpen) {
                        for (const child of childDirsOf(dirPath)) walkDir(child, depth + 1);
                        for (const f of folderFiles) {
                            if (f.dir === dirPath) {
                                rows.push({
                                    ...base,
                                    key: `v:${folder.slug}/${f.slug}`,
                                    kind: "file",
                                    file: f,
                                    depth: depth + 1,
                                    rootShift,
                                });
                            }
                        }
                    }
                };
                // Folders first (alphabetical), then root files — mirrors how
                // explorers group directories.
                for (const p of childDirsOf("")) walkDir(p, 0);
                for (const f of folderFiles) {
                    if (!f.dir) {
                        rows.push({
                            ...base,
                            key: `v:${folder.slug}/${f.slug}`,
                            kind: "file",
                            file: f,
                            depth: 0,
                            rootShift,
                        });
                    }
                }
            }
        }
        return rows;
    }, [
        treeOrder,
        expanded,
        expandedFolders,
        filterAutoExpand,
        folderFilter,
        folderFilterText,
        sortedFilesByFolder,
        showTags,
    ]);

    /** measured row heights (key → px) — replaces the per-kind estimate
     *  for every row that has been mounted at least once. */
    const [rowHeights, setRowHeights] = React.useState<Record<string, number>>({});
    const rowHeightsRef = React.useRef<Record<string, number>>({});
    /** y-offset of every row + the total content height (host-relative). */
    const rowPositions = React.useMemo(() => {
        const n = treeRows.length;
        const starts = new Float64Array(n);
        const heights = new Float64Array(n);
        let y = 0;
        for (let i = 0; i < n; i++) {
            const r = treeRows[i];
            const h = rowHeights[r.key] ?? VIRTUAL_ROW_ESTIMATE[r.kind];
            heights[i] = h;
            starts[i] = y;
            y += h;
        }
        return {starts, heights, total: y};
    }, [treeRows, rowHeights]);

    /** the mounted window [start, end) — STATE with hysteresis: the
     *  scroll listener only moves it when the overscan is crossed. */
    const [vRange, setVRange] = React.useState<{ start: number; end: number }>({
        start: 0,
        end: 40,
    });
    /** the radix viewport (the element that actually scrolls), the rows
     *  host (where the windowed rows + spacers render) and a rendered
     *  descendant used to LOOK UP the viewport (it isn't ref-addressable
     *  through the shadcn ScrollArea wrapper). */
    const treeViewportRef = React.useRef<HTMLDivElement | null>(null);
    const treeViewportAnchorRef = React.useRef<HTMLDivElement | null>(null);
    const treeHostRef = React.useRef<HTMLDivElement | null>(null);
    /** latest treeRows / rowPositions for the stable callbacks below. */
    const treeRowsRef = React.useRef(treeRows);
    const rowPositionsRef = React.useRef(rowPositions);
    treeRowsRef.current = treeRows;
    rowPositionsRef.current = rowPositions;
    /** y-offset of the rows host INSIDE the scroll content (the Recent
     *  section and the banners render above it) — converts between the
     *  viewport's scrollTop and the host-relative row positions. */
    const treeHostOffsetRef = React.useRef(0);

    const recomputeVirtualRange = React.useCallback(() => {
        const vp = treeViewportRef.current;
        if (!vp) return;
        const rows = treeRowsRef.current;
        const n = rows.length;
        const {starts, heights} = rowPositionsRef.current;
        if (n === 0) {
            setVRange((prev) =>
                prev.start === 0 && prev.end === 0 ? prev : {start: 0, end: 0}
            );
            return;
        }
        const rel = vp.scrollTop - treeHostOffsetRef.current;
        const top = rel - VIRTUAL_OVERSCAN_PX;
        const bottom = rel + vp.clientHeight + VIRTUAL_OVERSCAN_PX;
        // first row whose bottom edge is past `top` (binary search)
        let lo = 0;
        let hi = n;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid] + heights[mid] <= top) lo = mid + 1;
            else hi = mid;
        }
        const start = lo;
        // first row whose top edge is at/after `bottom` (binary search)
        lo = start;
        hi = n;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid] < bottom) lo = mid + 1;
            else hi = mid;
        }
        const end = Math.max(start + 1, lo);
        setVRange((prev) =>
            prev.start === start && prev.end === end ? prev : {start, end}
        );
    }, []);
    const recomputeVirtualRangeRef = React.useRef(recomputeVirtualRange);
    recomputeVirtualRangeRef.current = recomputeVirtualRange;

    /** Scroll a row (by key) into view, centered — used by "Reveal in
     *  Explorer"; the row may be outside the mounted window, so the
     *  browser's scrollIntoView can't reach it. Returns false when no
     *  such row exists (e.g. before the expansion state lands). */
    const scrollToVirtualRow = React.useCallback(
        (key: string, behavior: ScrollBehavior = "auto") => {
            const vp = treeViewportRef.current;
            if (!vp) return false;
            const idx = treeRowsRef.current.findIndex((r) => r.key === key);
            if (idx < 0) return false;
            const {starts, heights} = rowPositionsRef.current;
            const target = Math.max(
                0,
                starts[idx] - Math.max(0, (vp.clientHeight - heights[idx]) / 2)
            );
            try {
                vp.scrollTo({top: treeHostOffsetRef.current + target, behavior});
            } catch {
                vp.scrollTop = treeHostOffsetRef.current + target;
            }
            return true;
        },
        []
    );

    // Wire the passive scroll listener + viewport-size observer once.
    useTreeLayoutEffect(() => {
        const anchor = treeViewportAnchorRef.current;
        const vp = (
            anchor?.closest("[data-radix-scroll-area-viewport]") ??
            anchor?.closest('[data-slot="scroll-area-viewport"]')
        ) as HTMLDivElement | null;
        if (!vp) return;
        treeViewportRef.current = vp;
        const onScroll = () => recomputeVirtualRangeRef.current();
        vp.addEventListener("scroll", onScroll, {passive: true});
        const ro = new ResizeObserver(() => recomputeVirtualRangeRef.current());
        ro.observe(vp);
        recomputeVirtualRangeRef.current();
        return () => {
            vp.removeEventListener("scroll", onScroll);
            ro.disconnect();
        };
    }, []);

    // Measure the mounted rows (data-vrow) and keep the height cache in
    // sync — estimates are replaced by real heights, which also keeps
    // the spacers (and therefore the scrollbar) honest. Runs after every
    // commit; only writes state when a height actually changed.
    useTreeLayoutEffect(() => {
        const host = treeHostRef.current;
        if (!host) return;
        const cache = rowHeightsRef.current;
        const patch: Record<string, number> = {};
        let changed = false;
        const mounted = new Set<string>();
        host.querySelectorAll<HTMLElement>("[data-vrow]").forEach((el) => {
            const key = el.dataset.vrow;
            if (!key) return;
            mounted.add(key);
            const h = el.getBoundingClientRect().height;
            const prev = cache[key];
            if (prev === undefined || Math.abs(prev - h) > 0.5) {
                patch[key] = h;
                changed = true;
            }
        });
        // A focused row that left the mounted window unmounted — clear the
        // keyboard-op focus key so Delete / Ctrl+C / F2 can't act on a row
        // the user can no longer see.
        const fk = focusKeyRef.current;
        if (fk && !mounted.has(`v:${fk}`)) focusKeyRef.current = null;
        if (changed) {
            rowHeightsRef.current = {...cache, ...patch};
            setRowHeights(rowHeightsRef.current);
        }
    });

    // Where the rows host sits in the scroll content — recomputed every
    // commit alongside the row measurements (the Recent section and the
    // banners above it can change height). A MOVE of the host (view
    // switch back to tree, Recent collapse, banners appearing) invalidates
    // the scrollTop → row-index math, so the window is recomputed too.
    useTreeLayoutEffect(() => {
        const host = treeHostRef.current;
        const vp = treeViewportRef.current;
        if (!host || !vp) return;
        const offset =
            host.getBoundingClientRect().top - vp.getBoundingClientRect().top + vp.scrollTop;
        if (Math.abs(offset - treeHostOffsetRef.current) > 0.5) {
            treeHostOffsetRef.current = offset;
            recomputeVirtualRangeRef.current();
        }
    });

    // Re-anchor on row-list changes (expand / collapse / watcher refresh
    // / filter edits): keep the row that sat at the viewport's top edge
    // at the same visual offset, so removing rows ABOVE the viewport
    // (collapsing a distant folder) doesn't jump the view. Also prunes
    // height-cache entries for rows that no longer exist.
    const prevVirtualRowsRef = React.useRef<{
        rows: VirtualTreeRow[];
        starts: Float64Array;
        offset: number;
    } | null>(null);
    useTreeLayoutEffect(() => {
        const prev = prevVirtualRowsRef.current;
        prevVirtualRowsRef.current = {
            rows: treeRows,
            starts: rowPositions.starts,
            offset: treeHostOffsetRef.current,
        };
        if (!prev || prev.rows === treeRows) return;
        // prune stale height entries
        const cache = rowHeightsRef.current;
        const live = new Set(treeRows.map((r) => r.key));
        let stale = false;
        for (const k of Object.keys(cache)) {
            if (!live.has(k)) {
                stale = true;
                break;
            }
        }
        if (stale) {
            const nextCache: Record<string, number> = {};
            for (const [k, v] of Object.entries(cache)) {
                if (live.has(k)) nextCache[k] = v;
            }
            rowHeightsRef.current = nextCache;
            setRowHeights(nextCache);
        }
        const vp = treeViewportRef.current;
        if (!vp || !treeHostRef.current) return;
        const scrollTop = vp.scrollTop;
        if (scrollTop <= 0) return;
        const rel = scrollTop - prev.offset;
        const prevRows = prev.rows;
        const prevStarts = prev.starts;
        if (prevRows.length === 0) return;
        // the row at the viewport's top edge (the last one starting above it)
        let lo = 0;
        let hi = prevRows.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (prevStarts[mid] < rel) lo = mid + 1;
            else hi = mid;
        }
        const ai = Math.max(0, lo - 1);
        const anchorKey = prevRows[ai]?.key;
        if (!anchorKey) return;
        const ni = treeRows.findIndex((r) => r.key === anchorKey);
        if (ni < 0) return; // anchor vanished — let the browser clamp
        const target =
            treeHostOffsetRef.current + rowPositions.starts[ni] + (rel - prevStarts[ai]);
        if (target >= 0 && Math.abs(target - scrollTop) > 0.5) vp.scrollTop = target;
    });

    // Keep the mounted window in sync with row-list / height changes
    // (indices shift when rows are inserted or removed above).
    useTreeLayoutEffect(() => {
        recomputeVirtualRangeRef.current();
    }, [treeRows, rowPositions]);

    /** right-click menu for alternate-view rows — the SAME
     *  batch ops the tree offers (incl. the new Zip / Icon & color
     *  bulk actions) plus the core single-file actions. */
    /* ──────────────────────────────────────────────────────────── */
    /*  renderFileContextMenu — THE ONE file right-click menu, shared  */
    /*  by the TREE rows and the FLAT / kind rows (same files, same    */
    /*  options, same order — the canonical explorer order). A group   */
    /*  renders only when it is allowed for the file's kind; the       */
    /*  surviving groups keep the canonical relative order, so every   */
    /*  language shows the same menu minus exactly what does not       */
    /*  apply to it.                                                   */
    /* ──────────────────────────────────────────────────────────── */
    const renderFileContextMenu = (folderSlug: string, folderName: string, file: TreeFile, fileKey: string) => {
        const isFav = favorites.has(fileKey);
        const inMulti = multiSelect.includes(fileKey) && multiSelect.length > 1;
        const fileExportCaps = exportCapabilitiesForKind(file.kind);
        return (
            <ContextMenuContent className="w-60">
                <MenuHeader
                    name={inMulti ? `${multiSelect.length} files selected` : file.name}
                    title={file.name}
                />
                {/* batch actions — shown when the
                                  right-clicked file is part of a
                                  multi-selection (Ctrl/Shift click).
                                  GROUPED into submenus (the same
                                  structure in the tree AND the flat
                                  views — a long flat wall of 8 rows
                                  reads badly). */}
                {inMulti && (
                    <>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                   title="Favorite or restyle every selected file at once">
                                <FolderInput className="size-3.5 text-emerald-500 shrink-0"/>
                                <span className="flex-1">Organize Selected</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                <ContextMenuItem
                                    onClick={handleMultiFavorite}
                                    className="gap-2 cursor-pointer"
                                    title="Toggle favorites for every selected file"
                                >
                                    <Star className="size-3.5 shrink-0 text-amber-400"/>
                                    <span>Favorite Selected ({multiSelect.length})</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => {
                                        const first = multiSelect[0];
                                        setAppearanceTarget({
                                            kind: "file",
                                            key: first,
                                            folderSlug: first.split("/")[0],
                                            name: `${multiSelect.length} selected files`,
                                            bulkKeys: [...multiSelect],
                                        });
                                    }}
                                    className="gap-2 cursor-pointer"
                                    title="Pick ONE icon / icon color / text color and apply it to every selected file"
                                >
                                    <PaletteIcon className="size-3.5 text-fuchsia-500 shrink-0"/>
                                    <span>Icon &amp; Color Selected ({multiSelect.length})…</span>
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                   title="Copy / cut / zip the selection — then right-click a folder and pick Paste">
                                <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                <span className="flex-1">Clipboard</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                <ContextMenuItem
                                    onClick={() => handleCopyFiles(multiSelect)}
                                    className="gap-2 cursor-pointer"
                                    title="Copy every selected file — then right-click a folder and pick Paste"
                                >
                                    <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                    <span>Copy Selected ({multiSelect.length})</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => handleCutFiles(multiSelect)}
                                    className="gap-2 cursor-pointer"
                                    title="Move every selected file — then right-click a folder and pick Paste"
                                >
                                    <Scissors className="size-3.5 text-sky-500 shrink-0"/>
                                    <span>Cut Selected ({multiSelect.length})</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => void handleZipSelected()}
                                    disabled={zipBusy}
                                    className="gap-2 cursor-pointer"
                                    title="Zip every selected file into ONE archive and download it"
                                >
                                    <FileArchive className="size-3.5 text-amber-500 shrink-0"/>
                                    <span>Zip Selected ({multiSelect.length})…</span>
                                    {zipBusy && <Loader2 className="size-3 animate-spin ml-auto"/>}
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger
                                className="gap-2 cursor-pointer"
                                title="Open every selected file in its own split editor pane"
                            >
                                <Columns2 className="size-3.5 text-emerald-500 shrink-0"/>
                                <span className="flex-1">Split Selected</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                <ContextMenuItem
                                    onClick={() => {
                                        window.dispatchEvent(
                                            new CustomEvent(SPLIT_EDITOR_EVENT, {
                                                detail: {
                                                    orientation: "right",
                                                    targets: resolveMultiFiles(multiSelect),
                                                } satisfies SplitEditorDetail,
                                            })
                                        );
                                        setMultiSelect([]);
                                    }}
                                    className="gap-2 cursor-pointer"
                                    title={`One side-by-side pane per selected file (${multiSelect.length})`}
                                >
                                    <Columns2 className="size-3.5 text-emerald-500 shrink-0"/>
                                    <span>Split {multiSelect.length} right</span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => {
                                        window.dispatchEvent(
                                            new CustomEvent(SPLIT_EDITOR_DOWN_EVENT, {
                                                detail: {
                                                    orientation: "down",
                                                    targets: resolveMultiFiles(multiSelect),
                                                } satisfies SplitEditorDetail,
                                            })
                                        );
                                        setMultiSelect([]);
                                    }}
                                    className="gap-2 cursor-pointer"
                                    title={`One stacked pane per selected file (${multiSelect.length})`}
                                >
                                    <Rows2 className="size-3.5 text-emerald-500 shrink-0"/>
                                    <span>Split {multiSelect.length} down</span>
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSub>
                            <ContextMenuSubTrigger
                                className="gap-2 cursor-pointer"
                                title="Move every selected file into a folder of your choice"
                            >
                                <FolderInput className="size-3.5 text-emerald-500 shrink-0"/>
                                <span className="flex-1">Move Selected To…</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                                {folders
                                    .filter((dest) => !multiSelect.every((k) => k.startsWith(`${dest.slug}/`)))
                                    .map((dest) => (
                                        <ContextMenuItem
                                            key={dest.slug}
                                            onClick={() => {
                                                void handleMoveFilesByDrag(
                                                    resolveMultiFiles(multiSelect),
                                                    dest.slug,
                                                    dest.name
                                                );
                                                setMultiSelect([]);
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title={`Move the ${multiSelect.length} selected file(s) into "${dest.name}"`}
                                        >
                                            <BookOpen className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1 truncate">{dest.name}</span>
                                        </ContextMenuItem>
                                    ))}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuItem
                            onClick={() => setMultiDeleteTarget({count: multiSelect.length})}
                            className="gap-2 cursor-pointer text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-500/10"
                            title="Delete every selected file permanently (cannot be undone)"
                        >
                            <Trash2 className="size-3.5 shrink-0"/>
                            <span>Delete Selected ({multiSelect.length})…</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                            onClick={() => setMultiSelect([])}
                            className="gap-2 cursor-pointer"
                            title="Clear the multi-selection"
                        >
                            <X className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Clear Selection</span>
                        </ContextMenuItem>
                        <ContextMenuSeparator/>
                    </>
                )}
                {/* when a MULTI-selection is active
ONLY the batch actions above show — the
single-file items (Run, AI, Compare,
Rename, Properties…) are hidden until
the selection is cleared (the request: "only right click options
allowed for multiple files should
appear"). */}
                {!(inMulti) && (
                    <MenuGroups
                        kind={file.kind}
                        surface="explorer"
                        groups={{
                            // Open ▸ — open in the editor / split view /
                            // terminal (VS Code's file menu shape).
                            open: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Open this file — in the editor, side-by-side in the split pane, or with the terminal cd'd into its containing folder">
                                        <FilePlus className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span className="flex-1">Open</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem onClick={() => onSelectFile(folderSlug, file.slug)}
                                                         className="gap-2 cursor-pointer"
                                                         title="Open this file in the editor (same as left-click)">
                                            <FilePlus className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span>Open</span>
                                        </ContextMenuItem>
                                        {/* Open in split view — select the file
                                      (which swaps the main editor) and toggle the
                                      read-only split pane (the same
                                      praxis:split-editor event the EditorTabs
                                      Split button / Ctrl+\\ dispatch). */}
                                        <ContextMenuItem
                                            onClick={() => {
                                                onSelectFile(folderSlug, file.slug);
                                                window.dispatchEvent(new Event("praxis:split-editor"));
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Open this file, then show it side-by-side in the read-only split pane (Ctrl+\\ toggles it back)"
                                        >
                                            <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                            <span>Open In Split View</span>
                                        </ContextMenuItem>
                                        {/* Open in Terminal — cd the integrated
                                      terminal into this file's containing
                                      directory (subfolder-aware). */}
                                        <ContextMenuItem
                                            onClick={() => void handleOpenInTerminal(folderSlug, file.dir || undefined)}
                                            className="gap-2 cursor-pointer"
                                            title={`Open the integrated terminal in "${folderName}${file.dir ? "/" + file.dir : ""}" — this file's containing directory`}
                                        >
                                            <Terminal className="size-3.5 text-teal-500 shrink-0"/>
                                            <span>Open in Terminal</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Run ▸ — every way to execute this file,
                            // ONE submenu; the runtime gate (python +
                            // RUN_LANGUAGE_BY_KIND) lives in
                            // menuGroupsForKind now.
                            run: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger
                                        className="gap-2 cursor-pointer"
                                        title={file.kind === "python" || !file.kind ? "Every way to execute this file — run it, run it in the console or the terminal, pick an interpreter, or pytest it" : "Run this file through its language runtime (node / tsx / MATLAB / Octave / Rscript / bash / java / gcc / g++) — the Output panel streams it live"}
                                    >
                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span className="flex-1">Run</span>
                                        <span className="ml-auto text-[10px] text-muted-foreground">⌘↵</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        {onRunFile && (
                                            <ContextMenuItem
                                                onClick={() => onRunFile(folderSlug, file.slug)}
                                                className="gap-2 cursor-pointer"
                                                title="Open this file and run it now (⌘↵ behavior) — output streams to the panel below"
                                            >
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span>Run</span>
                                                <span className="ml-auto text-[10px] text-muted-foreground">⌘↵</span>
                                            </ContextMenuItem>
                                        )}
                                        {(!file.kind || file.kind === "python") && (
                                            <ContextMenuItem
                                                onClick={() => void handleRunInConsole(folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Run this file in the persistent Python console (bottom panel) — no need to open it first"
                                            >
                                                <SquareTerminal className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span>Run In Console</span>
                                            </ContextMenuItem>
                                        )}
                                        <ContextMenuItem
                                            onClick={() => void handleRunInTerminal(folderSlug, file.dir || undefined, file.name, file.kind)}
                                            className="gap-2 cursor-pointer"
                                            title="Execute this file inside the integrated terminal with its OWN interpreter (node / Rscript / bash / ruby / gcc / …) — interactive stdin/stdout, exactly like a real shell run"
                                        >
                                            <Terminal className="size-3.5 text-teal-500 shrink-0"/>
                                            <span>Run In Terminal</span>
                                        </ContextMenuItem>
                                        {/* Run Task… — task definition files (package.json /
                                        Makefile / justfile / pyproject.toml): opens the
                                        Tasks tab and runs the file's first task in a
                                        streaming output channel. */}
                                        {/^(package\.json|makefile|justfile|pyproject\.toml)$/i.test(file.name) && (
                                            <ContextMenuItem
                                                onClick={() =>
                                                    window.dispatchEvent(
                                                        new CustomEvent("praxis:open-tasks", {
                                                            detail: {folder: folderSlug, file: file.name},
                                                        })
                                                    )
                                                }
                                                className="gap-2 cursor-pointer"
                                                title={`Open the Tasks panel and run this file's first task — every task it defines is listed there with its own Run button`}
                                            >
                                                <Play className="size-3.5 text-violet-500 shrink-0"/>
                                                <span>Run Task…</span>
                                            </ContextMenuItem>
                                        )}
                                        {(!file.kind || file.kind === "python") && (
                                            <ContextMenuItem
                                                onClick={() =>
                                                    window.dispatchEvent(
                                                        new CustomEvent("praxis:run-coverage", {
                                                            detail: {folder: folderSlug, file: file.slug},
                                                        })
                                                    )
                                                }
                                                className="gap-2 cursor-pointer"
                                                title="Open this file and run it with line-coverage tracing — the Diagnostics panel shows the per-line heatmap afterwards"
                                            >
                                                <Crosshair className="size-3.5 text-amber-500 shrink-0"/>
                                                <span>Run With Coverage…</span>
                                            </ContextMenuItem>
                                        )}
                                        {(!file.kind || file.kind === "python") && (
                                            <ContextMenuItem
                                                onClick={() => void handleDebugInTerminal(folderSlug, file.dir || undefined, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Start an interactive pdb session on this file inside the integrated terminal — breakpoints with b, step with n/s, continue with c"
                                            >
                                                <Bug className="size-3.5 text-purple-500 shrink-0"/>
                                                <span>Debug With pdb…</span>
                                            </ContextMenuItem>
                                        )}
                                        <ContextMenuSeparator/>
                                        {/* Run With… (the interpreter picker) + Run pytest are
                                        PYTHON-pipeline actions — they
                                        used to render for every runnable
                                        kind (node / Rscript / bash…) where
                                        they cannot work. Every language's
                                        Run ▸ now keeps the SAME order,
                                        minus exactly what does not
                                        apply (see lib/context-menu-spec). */}
                                        {(!file.kind || file.kind === "python") && (
                                            <ContextMenuItem
                                                onClick={() => {
                                                    setRunWithTarget({
                                                        folderSlug: folderSlug,
                                                        fileSlug: file.slug,
                                                        fileName: file.name
                                                    });
                                                    setRunWithInterpreter(pythonInterpreter || "");
                                                }}
                                                className="gap-2 cursor-pointer"
                                                title="Run this file with a specific Python interpreter (one-shot override of Settings → Python)"
                                            >
                                                <Play className="size-3.5 text-sky-500 shrink-0"/>
                                                <span>Run With…</span>
                                            </ContextMenuItem>
                                        )}
                                        {(!file.kind || file.kind === "python") && (
                                            <ContextMenuItem
                                                onClick={() => void handleRunTestsOnFile(folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Run pytest on just this file and show a structured pass/fail report"
                                            >
                                                <FlaskConical className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span>Run pytest On File…</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ),
                            // Organize ▸ — rename / new siblings /
                            // duplicate / favorite.
                            organize: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Rename this file, or create a new file / subfolder next to it">
                                        <Pencil className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Organize</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem
                                            onClick={() => handleStartRename(folderSlug, folderName, file.slug, file.name)}
                                            className="gap-2 cursor-pointer"
                                            title="Rename this file (stays in the same folder)">
                                            <Pencil className="size-3.5 text-sky-500 shrink-0"/>
                                            <span>Rename…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                setNewFileFolder(folderSlug);
                                                setNewFileSub(file.dir || "");
                                                setNewFileName("");
                                                setNewFileContent(null);
                                                setShowNewFile(true);
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title={`Create a new file next to "${file.name}" (inside the same ${file.dir ? `subfolder "${file.dir}"` : "folder"})`}
                                        >
                                            <FilePlus className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span>New File Here…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                setNewFolderTarget({
                                                    folder: folderSlug,
                                                    folderName: folderName,
                                                    sub: file.dir || ""
                                                });
                                                setNewFolderName("");
                                                setShowNewFolder(true);
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title={`Create a new SUBFOLDER next to "${file.name}" (inside the same ${file.dir ? `subfolder "${file.dir}"` : "folder"})`}
                                        >
                                            <FolderPlus className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span>New Subfolder Here…</span>
                                        </ContextMenuItem>
                                        <ContextMenuSeparator/>
                                        <ContextMenuItem
                                            onClick={() => void handleDuplicateFile(folderSlug, file.slug)}
                                            disabled={duplicating}
                                            className="gap-2 cursor-pointer"
                                            title="Create a copy of this file in the same folder (named '<stem> (1).<ext>')"
                                        >
                                            <Files className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span>Duplicate</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => handleToggleFavorite(fileKey)}
                                                         className="gap-2 cursor-pointer"
                                                         title={isFav ? `Remove "${file.name}" from favorites` : `Add "${file.name}" to favorites`}>
                                            <Star
                                                className={cn("size-3.5 shrink-0", isFav ? "text-amber-400 fill-amber-400" : "text-muted-foreground")}/>
                                            <span>{isFav ? "Remove From Favorites" : "Add To Favorites"}</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Format ▸ — the kind gate (formattable ||
                            // python) lives in menuGroupsForKind;
                            // this renderer only checks the prop.
                            format: () => onFormatFile ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Auto-format / re-indent this file on disk — without opening it (undoable from the editor's local history)">
                                        <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Format</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        {(!file.kind || file.kind === "python") ? (
                                            <>
                                                <ContextMenuItem
                                                    onClick={() => onFormatFile(folderSlug, file.slug, "format", file.kind)}
                                                    className="gap-2 cursor-pointer"
                                                    title="Format this Python file on disk through black / ruff (the same engine as Edit ▸ Format document) — the built-in fallback runs when neither is installed"
                                                >
                                                    <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                    <span className="flex-1">Auto-Format (black / ruff)</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => onFormatFile(folderSlug, file.slug, "indent", file.kind)}
                                                    className="gap-2 cursor-pointer"
                                                    title="Re-indent this file to the configured indentation (Settings → Editor → Indentation) without opening it"
                                                >
                                                    <IndentIncrease className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Auto-Indent</span>
                                                </ContextMenuItem>
                                            </>
                                        ) : (() => {
                                            const entry = formattableKindFor(file.kind);
                                            if (!entry) return null;
                                            return (
                                                <>
                                                    <ContextMenuItem
                                                        onClick={() => onFormatFile(folderSlug, file.slug, "format", file.kind)}
                                                        className="gap-2 cursor-pointer"
                                                        title={entry.formatTitle}
                                                    >
                                                        <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                        <span className="flex-1">Auto-Format {entry.label}</span>
                                                    </ContextMenuItem>
                                                    {entry.hasIndentTwin !== false && (
                                                        <ContextMenuItem
                                                            onClick={() => onFormatFile(folderSlug, file.slug, "indent", file.kind)}
                                                            className="gap-2 cursor-pointer"
                                                            title={entry.indentTitle ?? "Re-indent to the configured indentation — line content untouched"}
                                                        >
                                                            <IndentIncrease className="size-3.5 text-sky-500 shrink-0"/>
                                                            <span className="flex-1">Auto-Indent {entry.label}</span>
                                                        </ContextMenuItem>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // Workspace ▸ — pin / AI context /
                            // snapshot / lock / SQL workbench.
                            workspace: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Pin, AI context, snapshots, read-only lock">
                                        <Pin className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span className="flex-1">Workspace</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-64">
                                        <ContextMenuItem
                                            onClick={() => {
                                                const pinned = isRunEntryPoint(folderSlug, file.slug);
                                                setRunEntryPoint(
                                                    pinned
                                                        ? null
                                                        : {
                                                            folderSlug: folderSlug,
                                                            fileSlug: file.slug,
                                                            fileName: file.name
                                                        }
                                                );
                                                toast({
                                                    title: pinned ? "Run entry point cleared" : `Pinned "${file.name}" as the run entry point`,
                                                    description: pinned ? "The navbar Run button runs the open file again." : "The navbar Run button now targets this file (right-click again to clear).",
                                                    variant: "success",
                                                });
                                            }}
                                            disabled={!file.kind || (file.kind !== "python" && !isRunnableKind(file.kind))}
                                            className="gap-2 cursor-pointer"
                                            title={
                                                !file.kind || file.kind === "python" || isRunnableKind(file.kind)
                                                    ? "Make the navbar Run button target this file — regardless of which file is open"
                                                    : "Run entry points target runnable files (Python / js / ts / R / shell / …)"
                                            }
                                        >
                                            <Pin
                                                className={cn("size-3.5 shrink-0", isRunEntryPoint(folderSlug, file.slug) ? "text-emerald-500" : "text-muted-foreground")}/>
                                            <span
                                                className="flex-1">{isRunEntryPoint(folderSlug, file.slug) ? "Unpin Run Entry Point" : "Pin As Run Entry Point"}</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                const current = getAiContextFile();
                                                const attached =
                                                    current?.folderSlug === folderSlug && current?.fileSlug === file.slug;
                                                setAiContextFile(
                                                    attached
                                                        ? null
                                                        : {
                                                            folderSlug: folderSlug,
                                                            fileSlug: file.slug,
                                                            fileName: file.name
                                                        }
                                                );
                                                toast({
                                                    title: attached ? "Removed from AI context" : `Added "${file.name}" to AI context`,
                                                    description: attached ? undefined : "Its content rides along every chat message (see the chat's context chip).",
                                                    variant: "success",
                                                });
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Attach this file to every AI chat message — the chat sidebar shows it as attached context"
                                        >
                                            <Sparkles className="size-3.5 text-violet-500 shrink-0"/>
                                            <span className="flex-1">Add File To AI Context</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                const label = window.prompt("Label this snapshot:", "checkpoint") ?? "";
                                                if (!label.trim()) return;
                                                void (async () => {
                                                    try {
                                                        const url = `/api/file?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(file.slug)}`;
                                                        const res = await fetch(url);
                                                        // /api/file returns RAW bytes —
                                                        // read as text (res.json threw on every
                                                        // non-JSON file).
                                                        const body = await res.text();
                                                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                                        const saveRes = await fetch("/api/local-history/save", {
                                                            method: "POST",
                                                            headers: {"Content-Type": "application/json"},
                                                            body: JSON.stringify({
                                                                folder: folderSlug,
                                                                file: file.slug,
                                                                content: body,
                                                                label: label.trim(),
                                                            }),
                                                        });
                                                        if (!saveRes.ok) throw new Error(`HTTP ${saveRes.status}`);
                                                        toast({
                                                            title: `Snapshot "${label.trim()}" saved`,
                                                            description: "Find it under Local file history → labeled entries.",
                                                            variant: "success"
                                                        });
                                                    } catch (err) {
                                                        toast({
                                                            title: "Snapshot failed",
                                                            description: (err as Error).message,
                                                            variant: "destructive"
                                                        });
                                                    }
                                                })();
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Save a labeled copy of the file's current content to the Local file history"
                                        >
                                            <Camera className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Save Labeled Snapshot Now…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                const lockedNow = isFileLocked(folderSlug, file.slug);
                                                setFileLocked(
                                                    {folderSlug: folderSlug, fileSlug: file.slug, fileName: file.name},
                                                    !lockedNow
                                                );
                                                toast({
                                                    title: lockedNow ? `"${file.name}" unlocked` : `"${file.name}" locked read-only`,
                                                    description: lockedNow ? "Editing is available again." : "The viewer hides Edit until unlocked from this menu.",
                                                    variant: "success",
                                                });
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Lock this file read-only — the viewer's Edit affordances disappear until you unlock it here"
                                        >
                                            <Lock
                                                className={cn("size-3.5 shrink-0", isFileLocked(folderSlug, file.slug) ? "text-amber-500" : "text-muted-foreground")}/>
                                            <span
                                                className="flex-1">{isFileLocked(folderSlug, file.slug) ? "Unlock (Allow Edits)" : "Lock Read-Only"}</span>
                                        </ContextMenuItem>
                                        {/\.(db|sqlite3?|db3)$/i.test(file.name) && (
                                            <ContextMenuItem
                                                onClick={() =>
                                                    window.dispatchEvent(
                                                        new CustomEvent("praxis:sql-workbench", {
                                                            detail: {
                                                                folderSlug: folderSlug,
                                                                fileSlug: file.slug,
                                                                fileName: file.name
                                                            },
                                                        })
                                                    )
                                                }
                                                className="gap-2 cursor-pointer"
                                                title="Open the SQLite SQL workbench — schema tree, read-only queries, saved queries"
                                            >
                                                <DatabaseIcon className="size-3.5 text-indigo-500 shrink-0"/>
                                                <span className="flex-1">Open SQL Workbench…</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // AI ▸ — the KIND gate (canAiCode) comes
                            // from menuGroupsForKind's "ai" group, so
                            // Explorer and both editor surfaces now
                            // agree; only the prop check lives here.
                            ai: () => onAiPrompt ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Explain, review or test this file with the AI assistant">
                                        <Sparkles className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">AI</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => {
                                                // Open the file in the editor, then
                                                // open the draggable inline
                                                // "Edit with AI — <file>" card on it
                                                // (durable queue: works on the
                                                // FIRST open too, before the
                                                // viewer mounts).
                                                onSelectFile(folderSlug, file.slug);
                                                queueInlineAi();
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Open this file in the editor and show the draggable Edit-with-AI card (Ctrl+I)"
                                        >
                                            <Sparkles className="size-3.5 text-violet-500 shrink-0"/>
                                            <span>Edit With AI…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => void handleAiOnFile(folderSlug, file.slug, file.name, "explain", file.kind)}
                                            disabled={aiBusyFile === file.name}
                                            className="gap-2 cursor-pointer"
                                            title="Open the AI chat with this file and a walk-through prompt"
                                        >
                                            <MessageCircleQuestion className="size-3.5 text-violet-500 shrink-0"/>
                                            <span>{aiBusyFile === file.name ? "Reading…" : "Explain This File With AI…"}</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => void handleAiOnFile(folderSlug, file.slug, file.name, "improve", file.kind)}
                                            disabled={aiBusyFile === file.name}
                                            className="gap-2 cursor-pointer"
                                            title="Ask the AI to review this file for bugs and style, and to propose improvements"
                                        >
                                            <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                            <span>Review &amp; Improve With AI…</span>
                                        </ContextMenuItem>
                                        {onGenerateTestsForFile && (!file.kind || file.kind === "python") && (
                                            <ContextMenuItem
                                                onClick={() => onGenerateTestsForFile(folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Generate a pytest suite for this file (live preview, then written next to it)"
                                            >
                                                <FlaskConical className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span>Generate Tests For This File…</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // Clipboard ▸ — copy flavors / cut /
                            // compare-with-clipboard moved to the
                            // Compare group.
                            clipboard: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Cut / copy the file, its name, or its path">
                                        <Scissors className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Clipboard</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem onClick={() => void handleCopyFileName(file.name)}
                                                         className="gap-2 cursor-pointer"
                                                         title="Copy just the file name (without the folder path) to the clipboard">
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Copy File Name</span>
                                        </ContextMenuItem>
                                        {/* stem + module path + whole
                                      contents — three clipboard shapes the
                                      tree never offered before.
 + the ready-to-paste import
                                      line (VS Code / PyCharm parity). */}
                                        <ContextMenuItem onClick={() => void handleCopyFileStem(file.name)}
                                                         className="gap-2 cursor-pointer"
                                                         title="Copy the file name WITHOUT its extension — QuickSort.py → QuickSort">
                                            <FileType2 className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Copy Name (No Extension)</span>
                                        </ContextMenuItem>
                                        {(!file.kind || file.kind === "python") && (
                                            <>
                                                <ContextMenuItem
                                                    onClick={() => void handleCopyModulePath(folderName, file)}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy the dotted import path — Algorithms.Sorting.QuickSort">
                                                    <Braces className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span>Copy As Module Path</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => void handleCopyImportStatement(folderName, file)}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy a ready import line — from Algorithms.Sorting import QuickSort">
                                                    <Import className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span>Copy As Import Statement</span>
                                                </ContextMenuItem>
                                            </>
                                        )}
                                        <ContextMenuItem onClick={() => void handleCopyPath(folderName, file.name)}
                                                         className="gap-2 cursor-pointer"
                                                         title="Copy the file's relative path (folder/file) to the clipboard">
                                            <ClipboardCopy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Copy Path</span>
                                        </ContextMenuItem>
                                        {/* absolute path (VS Code parity). */}
                                        <ContextMenuItem
                                            onClick={() => void handleCopyAbsolutePath(folderSlug, file.slug)}
                                            className="gap-2 cursor-pointer"
                                            title="Copy the file's absolute filesystem path (server-side) to the clipboard">
                                            <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Copy Absolute Path</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => void handleCopyFileContents(folderSlug, file.slug, file.name)}
                                            className="gap-2 cursor-pointer"
                                            title="Fetch the file fresh from disk and copy its full text to the clipboard"
                                            disabled={copyingContents}>
                                            {copyingContents ? <Loader2
                                                    className="size-3.5 animate-spin text-muted-foreground shrink-0"/> :
                                                <FileText className="size-3.5 text-muted-foreground shrink-0"/>}
                                            <span>{copyingContents ? "Copying…" : "Copy File Contents"}</span>
                                        </ContextMenuItem>
                                        <ContextMenuSeparator/>
                                        <ContextMenuItem
                                            onClick={() => handleCutFile(folderSlug, folderName, file.slug, file.name)}
                                            className="gap-2 cursor-pointer"
                                            title="Cut this file — then right-click a folder and pick Paste to move it"
                                        >
                                            <Scissors className="size-3.5 text-sky-500 shrink-0"/>
                                            <span>Cut</span>
                                            <span className="ml-auto text-[10px] text-muted-foreground">⌘X</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => handleCopyFile(folderSlug, folderName, file.slug, file.name)}
                                            className="gap-2 cursor-pointer"
                                            title="Copy this file — then right-click a folder and pick Paste to copy it"
                                        >
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Copy</span>
                                            <span className="ml-auto text-[10px] text-muted-foreground">⌘C</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Appearance ▸ — icon & color (the same
                            // place on files AND folders).
                            appearance: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Icon & color — pick a custom icon, icon color and text color for this file">
                                        <PaletteIcon className="size-3.5 text-fuchsia-500 shrink-0"/>
                                        <span className="flex-1">Appearance</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        {/* per-file icon + color. */}
                                        <ContextMenuItem
                                            onClick={() =>
                                                setAppearanceTarget({
                                                    kind: "file",
                                                    key: `${folderSlug}/${file.slug}`,
                                                    folderSlug: folderSlug,
                                                    fileSlug: file.slug,
                                                    name: file.name,
                                                })
                                            }
                                            className="gap-2 cursor-pointer"
                                            title="Pick this file's icon and its color (applies to the icon and the name)"
                                        >
                                            <PaletteIcon className="size-3.5 text-fuchsia-500 shrink-0"/>
                                            <span>Icon &amp; Color…</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Send ▸ — download / open containing
                            // folder.
                            send: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Download the file or reveal it in your OS file explorer">
                                        <Download className="size-3.5 text-purple-500 shrink-0"/>
                                        <span className="flex-1">Send</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => onDownloadFile?.(folderSlug, file.slug)}
                                            disabled={!onDownloadFile}
                                            className="gap-2 cursor-pointer"
                                            title="Download this file to your computer"
                                        >
                                            <Download className="size-3.5 text-purple-500 shrink-0"/>
                                            <span>Download</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => onOpenFolder?.(folderSlug, file.slug)}
                                            disabled={!onOpenFolder}
                                            className="gap-2 cursor-pointer"
                                            title="Open the containing folder in your OS file explorer"
                                        >
                                            <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>
                                            <span>Open Containing Folder</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Export ▸ — kind-filtered export flavors
                            // (the navbar's Tools ▸ Export list aimed
                            // at THIS file).
                            export: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Export this file — the formats its type supports: Jupyter notebook, Markdown, HTML, plain text, JSON, PDF, session report, LaTeX, RST, clipboard Markdown, a GitHub-ready zip, or a compressed .zip">
                                        <FileCode2 className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Export</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-64">
                                        {fileExportCaps.has("md") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("md", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export this file + its latest output as a Markdown (.md) report"
                                            >
                                                <FileText className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span>Markdown Report…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("ipynb") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("ipynb", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export this file as a Jupyter notebook (.ipynb) — # %% markers split it into cells, and Markdown blocks become markdown cells"
                                            >
                                                <Braces className="size-3.5 text-amber-500 shrink-0"/>
                                                <span>Jupyter Notebook…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("html") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("html", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export this file + its output as a self-contained styled HTML page (.html)"
                                            >
                                                <Code2 className="size-3.5 text-sky-500 shrink-0"/>
                                                <span>Standalone HTML…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("txt") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("txt", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export this file + its (optional) output as one plain-text (.txt) file"
                                            >
                                                <FileText className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span>Plain Text…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("json") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("json", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export a machine-readable JSON bundle (.json) of this file, its output and metadata"
                                            >
                                                <Braces className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span>JSON Bundle…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("pdf") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("pdf", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Open a print-ready sheet and bring up the browser's Save-as-PDF dialog"
                                            >
                                                <FileOutput className="size-3.5 text-rose-500 shrink-0"/>
                                                <span>PDF (Print)…</span>
                                            </ContextMenuItem>
                                        )}
                                        {(fileExportCaps.has("session") || fileExportCaps.has("latex") || fileExportCaps.has("rst") || fileExportCaps.has("copy-md")) && (
                                            <ContextMenuSeparator/>
                                        )}
                                        {fileExportCaps.has("session") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("session", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="One styled HTML page with this file's code, output, figures and notes — the homework-submission format"
                                            >
                                                <FileOutput className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span>Session Report (HTML)…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("latex") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("latex", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export this file as a pdflatex-ready LaTeX report (.tex)"
                                            >
                                                <FileCode className="size-3.5 text-sky-500 shrink-0"/>
                                                <span>LaTeX Report (.tex)…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("rst") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("rst", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Export this file as reStructuredText (.rst) — Sphinx / docs tooling format"
                                            >
                                                <FileText className="size-3.5 text-amber-500 shrink-0"/>
                                                <span>reStructuredText (.rst)…</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("copy-md") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("copy-md", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="Copy this file + its output as Markdown straight to the clipboard"
                                            >
                                                <Copy className="size-3.5 text-violet-500 shrink-0"/>
                                                <span>Copy As Markdown</span>
                                            </ContextMenuItem>
                                        )}
                                        {fileExportCaps.has("github") && (
                                            <ContextMenuItem
                                                onClick={() => dispatchFileExport("github", folderSlug, file.slug, file.name)}
                                                className="gap-2 cursor-pointer"
                                                title="The folder containing this file as a repository-ready .zip — README.md, .gitignore and requirements.txt scaffolded in (existing files are never overwritten)"
                                            >
                                                <Github className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span>GitHub-Ready Repo (.zip)…</span>
                                            </ContextMenuItem>
                                        )}
                                        <ContextMenuSeparator/>
                                        <ContextMenuItem
                                            onClick={() => requestCompress({
                                                kind: "file",
                                                folder: folderSlug,
                                                file: file.slug,
                                                name: file.name
                                            })}
                                            className="gap-2 cursor-pointer"
                                            title="Compress this file into a .zip stored in the same folder or any location you pick"
                                        >
                                            <Archive className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span>Compress To ZIP…</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Compare — with clipboard / another file
                            // (moved here from the Clipboard submenu —
                            // drift fix: compare actions live in ONE
                            // group) + local history / git HEAD. The
                            // group's position in this object literal
                            // does not matter: MenuGroups renders it in
                            // the CANONICAL explorer order.
                            compare: () => (
                                <>
                                    {/* Three-way merge editor — offered for
                                      files carrying git conflict
                                      markers (auto-detected by the page
                                      on open; this is the manual
                                      entry). */}
                                    <ContextMenuItem
                                        onClick={() =>
                                            window.dispatchEvent(
                                                new CustomEvent("praxis:open-merge-editor", {
                                                    detail: {folder: folderSlug, file: file.slug, fileName: file.name},
                                                })
                                            )
                                        }
                                        className="gap-2 cursor-pointer"
                                        title="Open the three-way merge editor (Ours / Base / Theirs columns) when this file carries conflict markers"
                                    >
                                        <GitMerge className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span>Resolve In Merge Editor…</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() =>
                                            window.dispatchEvent(
                                                new CustomEvent("praxis:compare-clipboard", {
                                                    detail: {folder: folderSlug, file: file.slug},
                                                })
                                            )
                                        }
                                        className="gap-2 cursor-pointer"
                                        title="Diff this file against the text currently on your clipboard — opens the Compare with clipboard dialog"
                                    >
                                        <GitCompare className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span>Compare With Clipboard…</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() =>
                                            window.dispatchEvent(
                                                new CustomEvent("praxis:compare-files", {
                                                    detail: {folder: folderSlug, file: file.slug},
                                                })
                                            )
                                        }
                                        className="gap-2 cursor-pointer"
                                        title="Pick any second file and diff the two side by side — opens the Compare two files dialog"
                                    >
                                        <Columns2 className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span>Compare With Another File…</span>
                                    </ContextMenuItem>
                                    <ContextMenuSub>
                                        <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                               title="Compare this file with a Local History snapshot or the git HEAD version">
                                            <GitBranch className="size-3.5 text-teal-500 shrink-0"/>
                                            <span className="flex-1">Compare</span>
                                        </ContextMenuSubTrigger>
                                        <ContextMenuSubContent className="w-60">
                                            <ContextMenuItem
                                                onClick={() => handleCompareLocalHistory(folderSlug, file.slug)}
                                                className="gap-2 cursor-pointer"
                                                title="Open this file in the Local History panel — every save created a snapshot you can diff and roll back to"
                                            >
                                                <Clock className="size-3.5 text-amber-500 shrink-0"/>
                                                <span>With Local History…</span>
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                onClick={() => handleCompareGitHead(folderSlug, file.slug)}
                                                className="gap-2 cursor-pointer"
                                                title="Open the Git Diff panel on this file — your uncommitted changes vs the last commit"
                                            >
                                                <GitBranch className="size-3.5 text-teal-500 shrink-0"/>
                                                <span>With git HEAD…</span>
                                            </ContextMenuItem>
                                        </ContextMenuSubContent>
                                    </ContextMenuSub>
                                </>
                            ),
                            // Move / Copy ▸ — destination picker.
                            movecopy: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Move or copy this file to another folder (with optional rename)">
                                        <FolderOpen className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Move / Copy</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => setMoveCopyTarget({
                                                mode: "move",
                                                folderSlug: folderSlug,
                                                fileSlug: file.slug,
                                                fileName: file.name,
                                                toFolder: "",
                                                newName: ""
                                            })}
                                            className="gap-2 cursor-pointer"
                                            title="Pick a destination folder — the file moves there (cut+paste in one step)"
                                        >
                                            <Scissors className="size-3.5 text-sky-500 shrink-0"/>
                                            <span>Move To…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => setMoveCopyTarget({
                                                mode: "copy",
                                                folderSlug: folderSlug,
                                                fileSlug: file.slug,
                                                fileName: file.name,
                                                toFolder: "",
                                                newName: ""
                                            })}
                                            className="gap-2 cursor-pointer"
                                            title="Pick a destination folder — a copy is created there (the original stays)"
                                        >
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Copy To…</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Delete — the destructive tail (the
                            // separator before it is canonical.
                            delete: () => (
                                <ContextMenuItem
                                    onClick={() => setDeleteTarget({
                                        folder: folderSlug,
                                        folderName: folderName,
                                        file: file.slug,
                                        fileName: file.name
                                    })}
                                    className="gap-2 cursor-pointer text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-500/10"
                                    title="Delete this file permanently (cannot be undone)"
                                >
                                    <Trash2 className="size-3.5 shrink-0"/>
                                    <span>Delete…</span>
                                </ContextMenuItem>),
                            // Properties — metadata + stats.
                            properties: () => (
                                <ContextMenuItem
                                    onClick={() => {
                                        setPropertiesTarget({
                                            folderSlug: folderSlug,
                                            folderName: folderName,
                                            fileSlug: file.slug,
                                            fileName: file.name,
                                            size: file.size,
                                            mtime: file.mtime,
                                            kind: file.kind,
                                            ext: file.ext,
                                            description: file.description,
                                            tags: file.tags,
                                        });
                                        // Fetch detailed stats (line/word/char
                                        // count, sha256, binary detection,
                                        // birthtime) from the server.
                                        void fetchFileStats(folderSlug, file.slug);
                                    }}
                                    className="gap-2 cursor-pointer"
                                    title="Show file metadata: size, type, modification date, path, line/word/char count, hash, description, tags"
                                >
                                    <Info className="size-3.5 text-muted-foreground shrink-0"/>
                                    <span>Properties</span>
                                </ContextMenuItem>),
                        }}
                    />
                )}
            </ContextMenuContent>
        );
    };


    /* ──────────────────────────────────────────────────────────── */
    /*  renderFolderMenu — THE ONE folder right-click menu, shared    */
    /*  by the ROOT folder rows and the NESTED subfolder rows. The    */
    /*  590-line nested copy is gone: every action already accepted    */
    /*  an optional `sub` parameter (the server routes sanitize it),  */
    /*  so one body serves both — `sub === undefined` means the       */
    /*  folder root itself.                                            */
    /* ──────────────────────────────────────────────────────────── */
    const renderFolderMenu = (opts: {
        folderSlug: string;
        folderName: string;
        /** nested subfolder path ("a/b") — undefined for the folder ROOT row */
        sub?: string;
        /** header label: the folder name, or "folder/a/b" for nested */
        label: string;
        /** files this row counts (root: the whole folder; nested: the dir-scoped subset) */
        scopedFiles: TreeFile[];
        /** true for the synthetic PROJECT-ROOT row (Rename/ZIP/Delete hidden) */
        isRootFolder?: boolean;
        /** folder tags (root rows carry them; nested rows pass none) */
        tags?: string[];
    }) => {
        const {folderSlug, folderName, sub, label, scopedFiles, isRootFolder, tags} = opts;
        return (
            <ContextMenuContent className="w-60">
                <MenuHeader name={label} title={label}/>
                {/* ── Top-level daily actions ───────────────────── */}
                {onRunAllInFolder && (() => {
                    // the batch count covers EVERY runnable
                    // language (python + js/ts/m/r/shell/java/c/cpp/
                    // ruby/php/go) — same table as the server filter.
                    const runCount = scopedFiles.filter(
                        (f) => runLanguageForFile(f.kind, f.name) !== undefined
                    ).length;
                    return runCount > 0 ? (
                        <ContextMenuItem
                            onClick={() => onRunAllInFolder(folderSlug, sub)}
                            className="gap-2 cursor-pointer"
                            title={`Run all ${runCount} runnable file${runCount === 1 ? "" : "s"} in "${label}" sequentially and add each result to the run history (Python runs its full pipeline; other languages run through their own runtimes)`}
                        >
                            <Play className="size-3.5 text-emerald-500 shrink-0"/>
                            <span>Run All Scripts ({runCount})</span>
                        </ContextMenuItem>
                    ) : null;
                })()}
                {/* The top-level "New file here…" /
"New subfolder here…" rows moved INTO the
Create ▸ submenu below ("New file here…" was
already duplicated there; "New subfolder
here…" joins it — nested-folder
creation). The top level keeps only Run-all,
Paste, Rename and Open in Terminal. */}
                <ContextMenuItem
                    onClick={() => void handlePaste(folderSlug, folderName, sub)}
                    disabled={!clipboard || pasting}
                    className="gap-2 cursor-pointer"
                    title={
                        clipboard
                            ? `${clipboard.mode === "cut" ? "Move" : "Copy"} ${clipboard.files && clipboard.files.length > 1 ? `${clipboard.files.length} files` : `"${clipboard.fileName}"`} from "${clipboard.folderName}" into this folder`
                            : "Nothing to paste — cut or copy a file first"
                    }
                >
                    <ClipboardPaste className="size-3.5 text-sky-500 shrink-0"/>
                    <span>
                        Paste{clipboard ? ` (${clipboard.mode === "cut" ? "move" : "copy"})` : ""}
                      </span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleStartFolderRename(folderSlug, folderName, sub)}
                                 className="gap-2 cursor-pointer" title="Rename this folder (all files inside stay)">
                    <Pencil className="size-3.5 text-sky-500 shrink-0"/>
                    <span>Rename…</span>
                </ContextMenuItem>
                {/* Open in Terminal — resolve this folder's
                        absolute path and cd the integrated terminal
                        there (starts a shell session if none is live). */}
                <ContextMenuItem
                    onClick={() => void handleOpenInTerminal(folderSlug, sub)}
                    className="gap-2 cursor-pointer"
                    title={`Open the integrated terminal inside "${folderName}" (cd there; a new shell session starts if none is live)`}
                >
                    <Terminal className="size-3.5 text-teal-500 shrink-0"/>
                    <span>Open in Terminal</span>
                </ContextMenuItem>
                {/* ── Create ▸ ─────────────────────────────────── */}
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                           title="New files, examples, templates, and imports into this folder">
                        <FolderPlus className="size-3.5 text-emerald-500 shrink-0"/>
                        <span className="flex-1">Create</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                        <ContextMenuItem
                            onClick={() => {
                                setNewFileFolder(folderSlug);
                                setNewFileName("");
                                setNewFileContent(null);
                                setShowNewFile(true);
                            }}
                            className="gap-2 cursor-pointer"
                            title="Create a new empty file in this folder"
                        >
                            <FilePlus className="size-3.5 text-emerald-500 shrink-0"/>
                            <span>New File Here…</span>
                        </ContextMenuItem>
                        {/* moved from the menu's top level (see
the comment above) — nested folder creation at
the folder root, so folders can be created
inside folders. */}
                        <ContextMenuItem
                            onClick={() => {
                                setNewFolderTarget({folder: folderSlug, folderName, sub: sub ?? ""});
                                setNewFolderName("");
                                setShowNewFolder(true);
                            }}
                            className="gap-2 cursor-pointer"
                            title="Create a subfolder inside this folder (folders can nest further)"
                        >
                            <FolderPlus className="size-3.5 text-emerald-500 shrink-0"/>
                            <span>New Subfolder Here…</span>
                        </ContextMenuItem>
                        {onCreateExample && (
                            <ContextMenuSub>
                                <ContextMenuSubTrigger
                                    className="gap-2 cursor-pointer"
                                    title="Create a ready-made example file in this folder"
                                >
                                    <Sparkles className="size-3.5 text-amber-500 shrink-0"/>
                                    <span className="flex-1">New Example…</span>
                                </ContextMenuSubTrigger>
                                {/* Nested language → (category) → subcategory →
 example (F2 + ). Subcategories are
                                REAL SUBMENUS — divided from the beginning
                                instead of one flat list with inline labels
                                ("why not from the beginng div them; like
                                yaml, u can grap the last examples into sub
                                cats"). Single-category language groups (R,
                                SQL, JSON, YAML, Shell) skip the redundant
                                category level via exampleMenuNodes — YAML
                                lists CI / CD · Containers & services · …
                                directly. Panels narrow with depth so the
                                cascade fits narrower windows. */}
                                <ContextMenuSubContent className="w-60 max-h-[460px] overflow-y-auto">
                                    {examples?.exampleGroups().map((group) => (
                                        <ContextMenuSub key={group.label}>
                                            <ContextMenuSubTrigger
                                                className="gap-2 cursor-pointer"
                                                title={`Ready-made ${group.label} examples, grouped by category and subcategory`}
                                            >
                                                <span className="flex-1 font-medium">{group.label}</span>
                                                <span className="text-[9px] text-muted-foreground">
                                      {group.categories.reduce((n, c) => n + c.examples.length, 0)}
                                    </span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56 max-h-[420px] overflow-y-auto">
                                                {examples?.exampleMenuNodes(group).map((node) => (
                                                    <ContextMenuSub key={node.label}>
                                                        <ContextMenuSubTrigger
                                                            className="gap-2 cursor-pointer"
                                                            title={
                                                                node.subcategories
                                                                    ? `${node.count} ${node.label} examples, grouped by subcategory`
                                                                    : `${node.count} ${node.label} examples`
                                                            }
                                                        >
                                                            <span className="flex-1 truncate">{node.label}</span>
                                                            <span
                                                                className="text-[9px] text-muted-foreground">{node.count}</span>
                                                        </ContextMenuSubTrigger>
                                                        <ContextMenuSubContent
                                                            className="w-56 max-h-[400px] overflow-y-auto">
                                                            {node.subcategories
                                                                ? node.subcategories.map((sub2) => (
                                                                    <ContextMenuSub key={sub2.label}>
                                                                        <ContextMenuSubTrigger
                                                                            className="gap-2 cursor-pointer"
                                                                            title={`${sub2.examples.length} ${sub2.label} examples`}
                                                                        >
                                                                            <span
                                                                                className="flex-1 truncate">{sub2.label}</span>
                                                                            <span
                                                                                className="text-[9px] text-muted-foreground">{sub2.examples.length}</span>
                                                                        </ContextMenuSubTrigger>
                                                                        <ContextMenuSubContent
                                                                            className="w-56 max-h-[380px] overflow-y-auto">
                                                                            {sub2.examples.map((ex) => (
                                                                                <TreeExampleItem
                                                                                    key={ex.id}
                                                                                    ex={ex}
                                                                                    folderSlug={folderSlug}
                                                                                    folderName={folderName}
                                                                                    sub={sub}
                                                                                    onCreateExample={onCreateExample}
                                                                                />
                                                                            ))}
                                                                        </ContextMenuSubContent>
                                                                    </ContextMenuSub>
                                                                ))
                                                                : node.examples?.map((ex) => (
                                                                    <TreeExampleItem
                                                                        key={ex.id}
                                                                        ex={ex}
                                                                        folderSlug={folderSlug}
                                                                        folderName={folderName}
                                                                        onCreateExample={onCreateExample}
                                                                    />
                                                                ))}
                                                        </ContextMenuSubContent>
                                                    </ContextMenuSub>
                                                ))}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ))}
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                        )}
                        {/* "New from Template ▸" — the shipped
                            script templates from /api/templates. */}
                        <ContextMenuSub>
                            <ContextMenuSubTrigger
                                className="gap-2 cursor-pointer"
                                title="Create a file in this folder from a shipped template"
                                onMouseEnter={() => void handleFetchTemplates()}
                            >
                                <FileCode className="size-3.5 text-sky-500 shrink-0"/>
                                <span className="flex-1">New From Template…</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-60 max-h-[380px] overflow-y-auto">
                                {templates == null ? (
                                    <ContextMenuItem disabled className="gap-2">
                                        <Loader2 className="size-3.5 animate-spin shrink-0"/>
                                        <span>Loading Templates…</span>
                                    </ContextMenuItem>
                                ) : templates.length === 0 ? (
                                    <ContextMenuItem disabled>
                                        <span>No Templates Available.</span>
                                    </ContextMenuItem>
                                ) : (
                                    templates.map((t) => (
                                        <ContextMenuItem
                                            key={t.id}
                                            onClick={() => handleCreateFromTemplate(t, folderSlug, sub)}
                                            className="gap-2 cursor-pointer"
                                            title={t.description}
                                        >
                                            <FileCode className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1 truncate">{t.name}</span>
                                        </ContextMenuItem>
                                    ))
                                )}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator/>
                        <ContextMenuItem
                            onClick={() => handleUploadFilesClick(folderSlug, folderName, sub)}
                            disabled={uploadingFiles}
                            className="gap-2 cursor-pointer"
                            title="Upload one or more files from your computer into this folder"
                        >
                            <Upload className="size-3.5 text-cyan-500 shrink-0"/>
                            <span>Upload Files Here…</span>
                        </ContextMenuItem>
                        {/* import a.zip archive INTO this
                            folder (targeted upload-zip). */}
                        <ContextMenuItem
                            onClick={() => handleImportZipClick(folderSlug, folderName, sub)}
                            disabled={importingZip}
                            className="gap-2 cursor-pointer"
                            title="Extract a .zip archive's contents into this folder"
                        >
                            {importingZip ? <Loader2 className="size-3.5 animate-spin shrink-0"/> :
                                <Archive className="size-3.5 text-amber-500 shrink-0"/>}
                            <span>{importingZip ? "Importing…" : "Import .zip Here…"}</span>
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                {/* ── Clipboard ▸ ──────────────────────────────── */}
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                           title="Paste into this folder, or copy its name / path">
                        <Scissors className="size-3.5 text-sky-500 shrink-0"/>
                        <span className="flex-1">Clipboard</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                        <ContextMenuItem
                            onClick={() => void handlePaste(folderSlug, folderName, sub)}
                            disabled={!clipboard || pasting}
                            className="gap-2 cursor-pointer"
                            title={
                                clipboard
                                    ? `${clipboard.mode === "cut" ? "Move" : "Copy"} ${clipboard.files && clipboard.files.length > 1 ? `${clipboard.files.length} files` : `"${clipboard.fileName}"`} from "${clipboard.folderName}" into this folder`
                                    : "Nothing to paste — cut or copy a file first"
                            }
                        >
                            <ClipboardPaste className="size-3.5 text-sky-500 shrink-0"/>
                            <span>
                            Paste{clipboard ? ` (${clipboard.mode === "cut" ? "move" : "copy"}: ${clipboard.files && clipboard.files.length > 1 ? `${clipboard.files.length} files` : clipboard.fileName})` : ""}
                          </span>
                        </ContextMenuItem>
                        <ContextMenuSeparator/>
                        <ContextMenuItem onClick={() => void handleCopyFolderName(folderName)}
                                         className="gap-2 cursor-pointer" title="Copy the folder name to the clipboard">
                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Copy Folder Name</span>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => void handleCopyPath(folderName, "")}
                                         className="gap-2 cursor-pointer"
                                         title="Copy the folder's relative path to the clipboard">
                            <ClipboardCopy className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Copy Path</span>
                        </ContextMenuItem>
                        {/* absolute path via /api/resolve-path. */}
                        <ContextMenuItem onClick={() => void handleCopyAbsolutePath(folderSlug)}
                                         className="gap-2 cursor-pointer"
                                         title="Copy the folder's absolute filesystem path (server-side) to the clipboard">
                            <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Copy Absolute Path</span>
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                {/* ── Organize ▸ ───────────────────────────────── */}
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                           title="Find, rename, unfavorite, collapse/expand">
                        <Files className="size-3.5 text-emerald-500 shrink-0"/>
                        <span className="flex-1">Organize</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                        {/* Quick filter (bubbles matching letters inline). */}
                        <ContextMenuItem
                            onClick={() => {
                                setFolderFilter(folderSlug);
                                setFolderFilterText("");
                                setExpanded((prev) => {
                                    const next = new Set(prev);
                                    next.add(folderSlug);
                                    return next;
                                });
                                requestAnimationFrame(() => folderFilterInputRef.current?.focus());
                            }}
                            className="gap-2 cursor-pointer"
                            title="Quick-filter this folder's files by name — bubbles the matching letters (Esc restores)"
                        >
                            <Funnel className="size-3.5 text-emerald-500 shrink-0"/>
                            <span>Find In Folder…</span>
                        </ContextMenuItem>
                        {/* scoped FULL-TEXT search with
                            file:line result jumps. */}
                        <ContextMenuItem
                            onClick={() => handleFolderSearchOpen(folderSlug, folderName)}
                            className="gap-2 cursor-pointer"
                            title="Full-text search across this folder's files — results jump to the matching file and line"
                        >
                            <FileSearch className="size-3.5 text-sky-500 shrink-0"/>
                            <span>Search In Folder…</span>
                        </ContextMenuItem>
                        {/* Rename — NEVER offered on the synthetic
                            PROJECT-ROOT entry: renaming the project root
                            (python_scripts/ or the active project) would
                            orphan every path. */}
                        {!isRootFolder && (
                            <ContextMenuItem onClick={() => handleStartFolderRename(folderSlug, folderName, sub)}
                                             className="gap-2 cursor-pointer"
                                             title="Rename this folder (all files inside stay)">
                                <Pencil className="size-3.5 text-sky-500 shrink-0"/>
                                <span>Rename…</span>
                            </ContextMenuItem>
                        )}
                        {/* Unfavorite every file in this folder at once
                            (lives ONLY here per the decision). */}
                        {(() => {
                            const favCount = scopedFiles.filter((f) =>
                                favorites.has(`${folderSlug}/${f.slug}`)
                            ).length;
                            return (
                                <ContextMenuItem
                                    onClick={() => handleUnfavoriteAllInFolder(folderSlug, folderName)}
                                    disabled={favCount === 0}
                                    className="gap-2 cursor-pointer"
                                    title={
                                        favCount > 0
                                            ? `Remove all ${favCount} favorite${favCount === 1 ? "" : "s"} from "${folderName}" — files themselves are untouched`
                                            : "No favorites in this folder yet — star files to pin them to the top"
                                    }
                                >
                                    <StarOff className="size-3.5 text-amber-500 shrink-0"/>
                                    <span>Unfavorite All Files{favCount > 0 ? ` (${favCount})` : ""}</span>
                                </ContextMenuItem>
                            );
                        })()}
                        <ContextMenuSeparator/>
                        {/* tree-wide collapse/expand. */}
                        <ContextMenuItem onClick={handleCollapseAllFolders} className="gap-2 cursor-pointer"
                                         title="Collapse every folder in the explorer">
                            <FoldVertical className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Collapse All Folders</span>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={handleExpandAllFolders} className="gap-2 cursor-pointer"
                                         title="Expand every folder in the explorer">
                            <UnfoldVertical className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Expand All Folders</span>
                        </ContextMenuItem>
                        {/* refresh the tree without leaving the
                            row — same onRefresh the blank-area menu uses. */}
                        <ContextMenuSeparator/>
                        <ContextMenuItem onClick={() => void onRefresh()} className="gap-2 cursor-pointer"
                                         title="Re-read this folder from disk (new, deleted or renamed files appear immediately)">
                            <RefreshCw className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Refresh Tree</span>
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                {/* ── Appearance ▸ ─────────────────────────────── */}
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer" title="Icon & color, sorting">
                        <PaletteIcon className="size-3.5 text-fuchsia-500 shrink-0"/>
                        <span className="flex-1">Appearance</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                        <ContextMenuItem
                            onClick={() =>
                                setAppearanceTarget({
                                    kind: "folder",
                                    key: folderSlug,
                                    folderSlug: folderSlug,
                                    name: folderName,
                                })
                            }
                            className="gap-2 cursor-pointer"
                            title="Pick this folder's icon and its color (applies to the icon and the name)"
                        >
                            <PaletteIcon className="size-3.5 text-fuchsia-500 shrink-0"/>
                            <span>Icon &amp; Color…</span>
                        </ContextMenuItem>
                        {/* Sort by ▸ (Name / Modified / Size /
                            Type + direction). */}
                        <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                   title="How files inside folders are ordered in the explorer">
                                <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0"/>
                                <span className="flex-1">Sort By</span>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-56">
                                {([
                                    {mode: "alpha", label: "Name", icon: Hash, hint: "Alphabetical"},
                                    {mode: "mtime", label: "Modified", icon: Clock, hint: "Newest or oldest first"},
                                    {mode: "size", label: "Size", icon: HardDrive, hint: "Largest or smallest first"},
                                    {mode: "type", label: "Type", icon: FileType2, hint: "Grouped by extension"},
                                ] as const).map(({mode, label, icon: IconCmp, hint}) => (
                                    <ContextMenuItem
                                        key={mode}
                                        onClick={() => handleSetExplorerSort(mode)}
                                        className="gap-2 cursor-pointer"
                                        title={`${hint} — click, then pick the direction`}
                                    >
                                        <IconCmp className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span className="flex-1">{label}</span>
                                        {effectiveSortMode === mode &&
                                          <Check className="size-3.5 text-emerald-500 shrink-0"/>}
                                    </ContextMenuItem>
                                ))}
                                <ContextMenuSeparator/>
                                <ContextMenuItem
                                    onClick={() => handleSetExplorerSort(effectiveSortMode, true)}
                                    className="gap-2 cursor-pointer"
                                    title={effectiveSortMode === "mtime" ? "Oldest first" : effectiveSortMode === "size" ? "Smallest first" : "A → Z"}
                                >
                                    <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0"/>
                                    <span className="flex-1">Ascending</span>
                                    {effectiveSortAsc && <Check className="size-3.5 text-emerald-500 shrink-0"/>}
                                </ContextMenuItem>
                                <ContextMenuItem
                                    onClick={() => handleSetExplorerSort(effectiveSortMode, false)}
                                    className="gap-2 cursor-pointer"
                                    title={effectiveSortMode === "mtime" ? "Newest first" : effectiveSortMode === "size" ? "Largest first" : "Z → A"}
                                >
                                    <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0 rotate-180"/>
                                    <span className="flex-1">Descending</span>
                                    {!effectiveSortAsc && <Check className="size-3.5 text-emerald-500 shrink-0"/>}
                                </ContextMenuItem>
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                {/* ── Reveal + Export ▸ — the folder twin of the
                        navbar's Tools ▸ Export (same options, aimed at
                        this folder). ── */}
                <ContextMenuItem
                    onClick={() => void handleRevealFolder(folderSlug)}
                    disabled={revealingFolder}
                    className="gap-2 cursor-pointer"
                    title="Open this folder in your OS file explorer (Explorer / Finder / file manager)"
                >
                    {revealingFolder ? <Loader2 className="size-3.5 animate-spin shrink-0"/> :
                        <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>}
                    <span>{revealingFolder ? "Opening…" : "Reveal In OS Explorer"}</span>
                </ContextMenuItem>
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                           title="Export or compress this folder — .zip download, one combined notebook, a GitHub-ready repo zip, or a .zip stored in the same folder / any location">
                        <Download className="size-3.5 text-purple-500 shrink-0"/>
                        <span className="flex-1">Export</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-64">
                        {/* The folder-level ZIP exports are hidden for the
                            synthetic PROJECT-ROOT entry — their archive
                            entry names and download filenames are built
                            from the folder NAME, and "." would produce
                            "./…" entries and a "..zip" download. The
                            combined NOTEBOOK export stays: it reads the
                            root's .py files and names the download after
                            the real directory (folderName). */}
                        {!isRootFolder && (
                            <ContextMenuItem
                                onClick={() => void handleFolderZipDownload(folderSlug, folderName, sub)}
                                disabled={zippingFolder}
                                className="gap-2 cursor-pointer"
                                title="Download the whole folder (all files, recursively) as a .zip archive"
                            >
                                {zippingFolder ? <Loader2 className="size-3.5 animate-spin shrink-0"/> :
                                    <Package className="size-3.5 text-purple-500 shrink-0"/>}
                                <span>{zippingFolder ? "Zipping…" : "Download Folder As .zip"}</span>
                            </ContextMenuItem>
                        )}
                        {/* Export the folder's scripts as ONE notebook —
                            the tree twin of Tools ▸ Export ▸ folder notebook
                            (the route now reads nested-subfolder files
                            from their real paths). */}
                        <ContextMenuItem
                            onClick={() => void handleExportFolderNotebook(folderSlug, folderName)}
                            className="gap-2 cursor-pointer"
                            title={`Combine every .py file in "${folderName}" (and its subfolders) into one Jupyter notebook — each script becomes a section of # %% cells`}
                        >
                            <FileCode2 className="size-3.5 text-orange-500 shrink-0"/>
                            <span>Export Folder As .ipynb</span>
                        </ContextMenuItem>
                        <ContextMenuSeparator/>
                        {!isRootFolder && (
                            <ContextMenuItem
                                onClick={() =>
                                    window.dispatchEvent(
                                        new CustomEvent(FILE_EXPORT_EVENT, {
                                            detail: {
                                                kind: "github" as ExportFileKind,
                                                folder: folderSlug,
                                                name: folderName
                                            },
                                        })
                                    )
                                }
                                className="gap-2 cursor-pointer"
                                title="This folder as a repository-ready .zip — README.md, .gitignore and requirements.txt scaffolded in (existing files are never overwritten)"
                            >
                                <Github className="size-3.5 text-muted-foreground shrink-0"/>
                                <span>GitHub-Ready Repo (.zip)…</span>
                            </ContextMenuItem>
                        )}
                        {!isRootFolder && (
                            <ContextMenuItem
                                onClick={() => requestCompress({kind: "folder", folder: folderSlug, name: folderName})}
                                className="gap-2 cursor-pointer"
                                title="Compress this folder into a .zip stored next to it, or in any location you pick"
                            >
                                <Archive className="size-3.5 text-emerald-500 shrink-0"/>
                                <span>Compress To ZIP…</span>
                            </ContextMenuItem>
                        )}
                    </ContextMenuSubContent>
                </ContextMenuSub>
                {/* ── Diagnostics ▸ ────────────────────────────── */}
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer" title="Lint summary and folder metadata">
                        <FileWarning className="size-3.5 text-amber-500 shrink-0"/>
                        <span className="flex-1">Diagnostics</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                        <ContextMenuItem
                            onClick={() => void handleFetchFolderLint(folderSlug, folderName, sub)}
                            className="gap-2 cursor-pointer"
                            title="Lint every Python file in this folder and summarize the issues (unused imports, unused vars, …) — download or save the report"
                        >
                            <FileWarning className="size-3.5 text-amber-500 shrink-0"/>
                            <span>Issues Summary…</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                            onClick={() => {
                                setFolderPropertiesTarget({
                                    folderSlug: folderSlug,
                                    folderName: folderName,
                                    fileCount: scopedFiles.length,
                                    isEmpty: scopedFiles.length === 0,
                                    tags: tags ?? [],
                                    // hasReadme comes from the
                                    // /api/folder-stats fetch below (the tree
                                    // no longer carries the flag — README.md
                                    // is a normal file).
                                    hasReadme: false,
                                });
                                void fetchFolderStats(folderSlug);
                            }}
                            className="gap-2 cursor-pointer"
                            title="Show folder metadata: file count, total size, modification date, largest file, newest file"
                        >
                            <Info className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Properties</span>
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 cursor-pointer" title=": open, compare, scaffold, tree">
                        <FolderOpen className="size-3.5 text-emerald-500 shrink-0"/>
                        <span className="flex-1">Workspace</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                        {/* Open as workspace root — resolves
                            the folder's absolute path (via /api/resolve-path)
                            and switches the active project to it. */}
                        {!isRootFolder && (
                            <ContextMenuItem
                                onClick={() => {
                                    void (async () => {
                                        try {
                                            const res = await fetch(
                                                `/api/resolve-path?folder=${encodeURIComponent(folderSlug)}`
                                            );
                                            const data = await res.json();
                                            if (!res.ok || !data.path) throw new Error(data.error ?? "path resolve failed");
                                            const switchRes = await fetch("/api/projects", {
                                                method: "POST",
                                                headers: {"Content-Type": "application/json"},
                                                body: JSON.stringify({path: data.path}),
                                            });
                                            const switched = await switchRes.json();
                                            if (!switchRes.ok) throw new Error(switched.error ?? "switch failed");
                                            window.dispatchEvent(new CustomEvent("praxis:project-switched", {detail: {path: switched.projectPath}}));
                                            onRefresh?.();
                                        } catch (err) {
                                            toast({
                                                title: "Could not open as workspace root",
                                                description: (err as Error).message,
                                                variant: "destructive"
                                            });
                                        }
                                    })();
                                }}
                                className="gap-2 cursor-pointer"
                                title="Make this folder the active project root — the explorer switches to it"
                            >
                                <FolderOpen className="size-3.5 text-emerald-500 shrink-0"/>
                                <span>Open As Workspace Root…</span>
                            </ContextMenuItem>
                        )}
                        {/* compare with another folder. */}
                        <ContextMenuItem
                            onClick={() =>
                                window.dispatchEvent(
                                    new CustomEvent("praxis:folder-compare", {detail: {folderSlug: folderSlug}})
                                )
                            }
                            className="gap-2 cursor-pointer"
                            title="Diff this folder against another one — same / modified / only-in-A / only-in-B, by relative path"
                        >
                            <GitCompare className="size-3.5 text-sky-500 shrink-0"/>
                            <span>Compare With Another Folder…</span>
                        </ContextMenuItem>
                        {/* ASCII tree to the clipboard. */}
                        <ContextMenuItem
                            onClick={() => {
                                const lines: string[] = [`${folderName}/`];
                                const walk = (name: string, files: Array<{ name: string }>, depth: number) => {
                                    const pad = "  ".repeat(depth);
                                    for (const f of files) lines.push(`${pad}${f.name}`);
                                };
                                walk(folderName, scopedFiles, 1);
                                const text = lines.join("\n");
                                void navigator.clipboard.writeText(text).then(() =>
                                    toast({
                                        title: `Folder tree copied (${scopedFiles.length} files)`,
                                        variant: "success"
                                    })
                                );
                            }}
                            className="gap-2 cursor-pointer"
                            title="Copy this folder's file list as an indented text tree"
                        >
                            <ListTree className="size-3.5 text-muted-foreground shrink-0"/>
                            <span>Copy Folder Tree (Text)</span>
                        </ContextMenuItem>
                        {/* scaffold a mini-project blueprint
                            inside this folder. */}
                        <ContextMenuItem
                            onClick={() =>
                                window.dispatchEvent(
                                    new CustomEvent("praxis:scaffold", {detail: {folderSlug, sub}})
                                )
                            }
                            className="gap-2 cursor-pointer"
                            title="Create a ready-made mini-project (Data analysis / Package skeleton / ML experiment / Report bundle) inside this folder"
                        >
                            <Sparkles className="size-3.5 text-emerald-500 shrink-0"/>
                            <span>Scaffold From Blueprint…</span>
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator/>
                {/* Delete — NEVER offered on the project root (it IS
                        the whole project). */}
                {!isRootFolder && (
                    <ContextMenuItem
                        onClick={() => setFolderDeleteTarget({folder: folderSlug, folderName, sub})}
                        className="gap-2 cursor-pointer text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-500/10"
                        title="Delete this folder and ALL files inside it (cannot be undone)"
                    >
                        <Trash2 className="size-3.5 shrink-0"/>
                        <span>Delete…</span>
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        );
    };

    /** the flat / kind rows render the SAME shared file menu. */
    const renderAltContextMenu = (entry: FlatEntry) =>
        renderFileContextMenu(entry.folderSlug, entry.folderName, entry.file, entry.key);

    /** one list row for the flat / kind views — icon, favorite
     *  star, name, location chip (folder › subfolder) + the same
     *  metadata cluster (git letter, tag, size) the tree rows show.
     *  NOTE: drag-to-move stays a TREE-mode affordance — these rows are
     *  for browsing + multi-select + batch ops. */
    const renderAltRow = (entry: FlatEntry) => {
        const {folderSlug, file, key} = entry;
        const isSelected = selectedFolderSlug === folderSlug && selectedFileSlug === file.slug;
        const inMultiSelect = multiSelect.includes(key);
        const fileAppearance = appearance.files?.[key];
        const CustomIcon = appearanceIcon(fileAppearance?.icon, FILE_ICON_CHOICES);
        const KindIcon = CustomIcon ?? fileKindIcon(file.kind);
        const effIconColor = appearanceIconColor(fileAppearance);
        const effTextColor = appearanceTextColor(fileAppearance);
        const isFav = favorites.has(key);
        const location = `${entry.folderName}${file.dir ? ` › ${file.dir}` : ""}`;
        const gitStatus = gitStatusMap?.[`${entry.folderName}/${file.name}`];
        return (
            <ContextMenu key={key}>
                <ContextMenuTrigger asChild>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleFileRowClick(e, folderSlug, file.slug, [], flatEntryKeys)}
                        onMouseDown={(e) => {
                            if (e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.focus();
                            }
                        }}
                        onFocus={() => {
                            focusKeyRef.current = key;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectFile(folderSlug, file.slug);
                            }
                        }}
                        className={cn(
                            "w-full flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs hover:bg-accent/40 transition-colors group cursor-pointer",
                            isSelected && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                            inMultiSelect && "ring-1 ring-inset ring-sky-500/70 bg-sky-500/10"
                        )}
                        title={file.description ?? file.name}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(key);
                            }}
                            className="shrink-0 p-0 hover:scale-110 transition-transform"
                            aria-label={isFav ? "Unfavorite" : "Add to favorites"}
                            title={isFav ? `Remove "${file.name}" from favorites` : `Add "${file.name}" to favorites`}
                        >
                            <Star
                                className={cn(
                                    "size-3",
                                    isFav ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30 hover:text-muted-foreground"
                                )}
                            />
                        </button>
                        <KindIcon
                            className={cn("size-3.5 shrink-0", isSelected ? "text-emerald-500" : !effIconColor && fileKindColor(file.kind))}
                            style={effIconColor ? {color: effIconColor} : undefined}
                        />
                        <span
                            className="truncate text-left"
                            style={effTextColor ? {color: effTextColor} : undefined}
                            title={file.name}
                        >
              {filter.trim() ? (
                  <HighlightedText text={file.name} indices={fuzzyMatchIndices(filter.trim(), file.name)}/>
              ) : (
                  file.name
              )}
            </span>
                        <span className="ml-auto shrink-0 max-w-[45%] truncate text-[10px] text-muted-foreground/80"
                              title={location}>
              {location}
            </span>
                        {showLastRunStatus && lastRunStatus?.has(key) && (
                            <span
                                className={cn("size-1.5 rounded-full shrink-0", lastRunStatus.get(key) ? "bg-emerald-500" : "bg-red-500")}
                                title={lastRunStatus.get(key) ? "Last run: OK" : "Last run: failed"}
                            />
                        )}
                        {gitStatus && gitStatus !== " " && (
                            <span
                                className={cn(
                                    "text-[9px] shrink-0 font-mono w-3 text-center",
                                    gitStatus === "M" ? "text-amber-500" : gitStatus === "?" ? "text-cyan-500" : "text-red-500"
                                )}
                            >
                {gitStatus}
              </span>
                        )}
                        {showFileSize && (
                            <TreeBadge variant="size" title={`${file.size.toLocaleString()} bytes`}>
                                {formatSize(file.size)}
                            </TreeBadge>
                        )}
                    </div>
                </ContextMenuTrigger>
                {renderAltContextMenu(entry)}
            </ContextMenu>
        );
    };

    /** the alternate view bodies, swapped in for the folder
     *  tree when explorerView ≠ "tree". */
    const renderAltViews = () => {
        if (flatEntries.length === 0) {
            return (
                <p className="px-3 py-6 text-xs text-muted-foreground italic">
                    No files match the current filter.
                </p>
            );
        }
        if (explorerView === "details") {
            // The DETAILS view now renders ExplorerDetailsTable — the
            // tiered fix for the "content cut off on the right side of the
            // screen" report: auto-fit column widths measured from the real
            // content, ellipsis + native tooltip for whatever still
            // overflows its column, drag-resizable borders persisted in
            // localStorage, and a subtle horizontal scrollbar only when even
            // the capped table cannot fit the sidebar. (The old plain
            // w-full auto-layout table overflowed invisibly.)
            return (
                <ExplorerDetailsTable
                    entries={flatEntries}
                    selectedFolderSlug={selectedFolderSlug}
                    selectedFileSlug={selectedFileSlug}
                    multiSelectKeys={multiSelect}
                    appearance={appearance}
                    sortMode={effectiveSortMode}
                    sortAsc={effectiveSortAsc}
                    onSort={handleSetExplorerSort}
                    onRowClick={(event, folderSlug, fileSlug) => handleFileRowClick(event, folderSlug, fileSlug, [], flatEntryKeys)}
                    renderContextMenu={renderAltContextMenu}
                />
            );
        }
        if (explorerView === "kind") {
            return (
                <div className="pb-4" data-testid="explorer-kind">
                    {kindGroups.map(([kind, entries]) => {
                        const GroupIcon = fileKindIcon(kind as TreeFile["kind"]);
                        const label = KIND_GROUP_LABELS[kind] ?? kind;
                        return (
                            <div key={kind} data-testid={`explorer-kind-${kind}`}>
                                <div
                                    className="sticky top-0 z-10 flex items-center gap-1.5 px-2 py-1 bg-card/95 backdrop-blur border-b text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <GroupIcon className="size-3 shrink-0"/>
                                    <span className="truncate">{label}</span>
                                    <span
                                        className="ml-auto font-normal normal-case tabular-nums">{entries.length}</span>
                                </div>
                                {entries.map((e) => renderAltRow(e))}
                            </div>
                        );
                    })}
                </div>
            );
        }
        // Flat view — ONE list, each row annotated with its location.
        return (
            <div className="pb-4" data-testid="explorer-flat">
                {flatEntries.map((e) => renderAltRow(e))}
            </div>
        );
    };

    /** One flattened, windowed TREE row — folder header / folder-filter
     *  box / root data chip / folder tags / nested subfolder row / file
     *  row. The markup is exactly what the old recursive render
     *  produced (context menus, drag-drop handlers, badges, marks,
     *  tooltips, aria attributes), with three mechanical changes:
     *   • each row carries data-vrow (the virtualizer's height probe);
     *   • rows of the synthetic PROJECT-ROOT entry inline the old
     *     wrapper's -ml-3 shift (marginLeft: -12; the root data chip
     *     folds its old ml-7 into marginLeft: 16) since the wrapper div
     *     is gone;
     *   • the React key comes from the windowed map (row.key), so the
     *     inner elements no longer need keys.
     *  Everything else — handlers, order of children, class names — is
     *  preserved verbatim. */
    const renderVirtualRow = (row: VirtualTreeRow) => {
        const folder = row.folder;
        const isSelectedFolder = folder.slug === selectedFolderSlug;
        switch (row.kind) {
            case "folder": {
                // the folder's custom icon + color (if any). The synthetic
                // PROJECT-ROOT entry (isRoot) defaults to a drive glyph so it
                // reads as "the project itself", not as just another folder.
                const folderAppearance = appearance.folders?.[folder.slug];
                const FolderIconComponent =
                    appearanceIcon(folderAppearance?.icon, FOLDER_ICON_CHOICES) ??
                    (folder.isRoot ? HardDrive : BookOpen);
                return (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            {/* Folder header — a <div> with role=button (NOT a
                  <button>) because it contains a data-files <button>
                  child. Nested buttons cause hydration errors. */}
                            <div
                                data-vrow={row.key}
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleFolder(folder.slug)}
                                // Shift+click on the folder header must not extend the
                                // browser's text selection either — same
                                // preventDefault-on-mousedown guard as the file rows.
                                onMouseDown={(e) => {
                                    if (e.shiftKey) {
                                        e.preventDefault();
                                        e.currentTarget.focus();
                                    }
                                }}
                                // focus hygiene — focusing a folder header clears the
                                // file-row focus key so Delete / F2 / Ctrl+C can't
                                // silently act on the previously focused FILE row
                                // while the focus is on the folder.
                                onFocus={() => {
                                    focusKeyRef.current = null;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        toggleFolder(folder.slug);
                                    }
                                }}
                                onDragOver={(e) => {
                                    // Allow drop — must call preventDefault or the
                                    // browser will navigate to the dropped file.
                                    e.preventDefault();
                                    if (dragOverFolder !== folder.slug) {
                                        setDragOverFolder(folder.slug);
                                    }
                                }}
                                onDragLeave={(e) => {
                                    // Only clear if we're leaving the folder row itself
                                    // (not entering a child element). relatedTarget is
                                    // the element entering; if it's null we left the row.
                                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                        if (dragOverFolder === folder.slug) setDragOverFolder(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOverFolder(null);
                                    // SUBFOLDER drags first — a folder row dragged from
                                    // the tree moves its whole directory here via
                                    // /api/folder-move (its custom MIME type distinguishes
                                    // it from file drags and OS imports).
                                    const folderDrag = e.dataTransfer?.getData("application/praxis-folder");
                                    if (folderDrag) {
                                        try {
                                            const payload = JSON.parse(folderDrag) as {
                                                folderSlug?: string;
                                                dirPath?: string
                                            };
                                            if (payload.folderSlug && payload.dirPath) {
                                                void handleMoveFolderByDrag(
                                                    {folderSlug: payload.folderSlug, dirPath: payload.dirPath},
                                                    folder.slug,
                                                    folder.name
                                                );
                                                return;
                                            }
                                        } catch {
                                            /* malformed payload — fall through */
                                        }
                                    }
                                    // internal drag next — files dragged from the tree
                                    // itself MOVE to this folder (VS Code Explorer
                                    // behavior). The custom MIME type is what
                                    // distinguishes them from OS-file imports.
                                    const dragData = e.dataTransfer?.getData("application/praxis-files");
                                    if (dragData) {
                                        try {
                                            const files = JSON.parse(dragData) as ClipboardFileRef[];
                                            if (Array.isArray(files) && files.length > 0) {
                                                void handleMoveFilesByDrag(files, folder.slug, folder.name);
                                                return;
                                            }
                                        } catch {
                                            /* malformed payload — fall through to import */
                                        }
                                    }
                                    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                                        void handleDropOnFolder(folder.slug, folder.name, e.dataTransfer.files);
                                    }
                                }}
                                title={`Click to expand/collapse. Drag files from your computer and drop here to import them into "${folder.name}" — drag a file OR a subfolder from another folder here to MOVE it.`}
                                className={cn(
                                    "w-full flex items-center gap-1 pl-2 py-1 text-xs hover:bg-accent/40 transition-colors group cursor-pointer",
                                    isSelectedFolder && "bg-accent/20",
                                    dragOverFolder === folder.slug && "ring-2 ring-emerald-500 ring-inset bg-emerald-500/5"
                                )}
                            >
                                {row.isExpanded ? (
                                    <ChevronDown className="size-3 text-muted-foreground shrink-0"/>
                                ) : (
                                    <ChevronRight className="size-3 text-muted-foreground shrink-0"/>
                                )}
                                <FolderIconComponent
                                    className="size-3.5 shrink-0"
                                    style={appearanceIconColor(folderAppearance) ? {color: appearanceIconColor(folderAppearance)} : undefined}
                                />
                                {/* per-folder find toggle — reveals the inline filter
                    box below this header. */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (row.folderFilterActive) {
                                            setFolderFilter(null);
                                            setFolderFilterText("");
                                        } else {
                                            setFolderFilter(folder.slug);
                                            setFolderFilterText("");
                                            requestAnimationFrame(() => folderFilterInputRef.current?.focus());
                                        }
                                    }}
                                    aria-label={row.folderFilterActive ? "Close folder filter" : "Filter files in this folder"}
                                    title={row.folderFilterActive ? "Close the folder filter (Esc)" : "Find in this folder — filters the files and bubbles the matching letters"}
                                    className={cn(
                                        "size-4 rounded-sm shrink-0 flex items-center justify-center transition-opacity cursor-pointer",
                                        row.folderFilterActive
                                            ? "text-emerald-500 opacity-100"
                                            : "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    )}
                                >
                                    <Funnel className="size-3"/>
                                </button>
                                {/* Filename in its own overflow-hidden container so the
                    text physically CANNOT extend under the badge. The
                    badge is OUTSIDE this container (a sibling), so
                    there's zero overlap. No sticky/z-index needed —
                    shrink-0 keeps the badge at the right edge. */}
                                <div className="min-w-0 flex-1 overflow-hidden">
                  <span
                      className="truncate block text-left font-medium"
                      style={appearanceTextColor(folderAppearance) ? {color: appearanceTextColor(folderAppearance)} : undefined}
                      title={folder.name}
                  >
                    {filter.trim() ? (
                        <HighlightedText
                            text={folder.name}
                            indices={fuzzyMatchIndices(filter.trim(), folder.name)}
                        />
                    ) : (
                        folder.name
                    )}
                  </span>
                                </div>
                                {/* Right-aligned folder metadata cluster — shrink-0
                    keeps it at the right edge. It's a SEPARATE sibling
                    from the filename container, so no text can appear
                    beneath it. Background matches the row's state for
                    seamless selection highlight. */}
                                <div className={cn(
                                    "shrink-0 flex items-center gap-1.5 pl-2 pr-1.5 bg-card",
                                    isSelectedFolder && "bg-accent/20",
                                    "group-hover:bg-accent/40",
                                    dragOverFolder === folder.slug && "bg-emerald-500/5",
                                )}>
                                    {/* the data-files button sits BEFORE the count/size
                      pills so the size badge stays the RIGHTMOST
                      element — all rows' badges share one right-edge
                      column. */}
                                    {folder.dataFiles && folder.dataFiles.length > 0 && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onDataFileBrowserOpen) {
                                                    // select the first file from the SORTED list
                                                    // (what the user sees at the top of the open
                                                    // folder) — the raw folder.files[0] order used
                                                    // to call onSelectFile with "" on empty
                                                    // (data-only) folders.
                                                    const first =
                                                        row.folderFiles[0] ??
                                                        (sortedFilesByFolder.get(folder.slug) ?? [])[0];
                                                    if (first) onSelectFile(folder.slug, first.slug);
                                                    onDataFileBrowserOpen();
                                                }
                                            }}
                                            className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                                            title={`${folder.dataFiles.length} data files in this folder`}
                                        >
                                            <Database className="size-3"/>
                                        </button>
                                    )}
                                    {folder.isEmpty ? (
                                        <span className="text-[9px] text-amber-500 shrink-0 w-6 text-right">empty</span>
                                    ) : (
                                        /* file count as a sky pill badge. */
                                        <TreeBadge
                                            variant="count"
                                            title={`${folder.files.length} file${folder.files.length === 1 ? "" : "s"} in ${folder.name}`}
                                        >
                                            {folder.files.length}
                                        </TreeBadge>
                                    )}
                                    {showFolderSize && !folder.isEmpty && (
                                        /* total folder size as a muted pill badge. */
                                        <TreeBadge
                                            variant="size"
                                            title={`${folder.files.reduce((n, f) => n + f.size, 0).toLocaleString()} bytes total`}
                                        >
                                            {formatSize(folder.files.reduce((n, f) => n + f.size, 0))}
                                        </TreeBadge>
                                    )}
                                    {/* the "README" badge was removed — README.md is a
                      normal file in the tree now, so a badge would
                      state the obvious. */}
                                </div>
                            </div>
                        </ContextMenuTrigger>
                        {/* Folder context menu — (hybrid submenus). Mirrors the
                FILE menu's structure: daily actions stay top-level
                (Run all, New file, Paste, Rename, Delete); everything
                else nests into labeled sublists (Create ▸ / Clipboard ▸
                / Organize ▸ / Appearance ▸ / Send ▸ / Diagnostics ▸) so
                the menu never grows into one long flat list. */}
                        {renderFolderMenu({
                            folderSlug: folder.slug,
                            folderName: folder.name,
                            sub: undefined,
                            label: folder.name,
                            scopedFiles: folder.files,
                            isRootFolder: !!folder.isRoot,
                            tags: folder.tags,
                        })}
                    </ContextMenu>
                );
            }
            case "filter": {
                // folder-scoped find input — shown under the folder header
                // while active. Filtering keeps only matching files; ESC or ×
                // restores the full list.
                return (
                    <div
                        data-vrow={row.key}
                        className="flex items-center gap-1 pl-7 pr-2 py-1 border-b bg-emerald-500/5"
                    >
                        <Search className="size-3 text-muted-foreground shrink-0"/>
                        <input
                            ref={folderFilterInputRef}
                            type="text"
                            value={folderFilterText}
                            onChange={(e) => setFolderFilterText(e.target.value)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    setFolderFilter(null);
                                    setFolderFilterText("");
                                }
                            }}
                            placeholder={`Find in "${folder.name}"…`}
                            className="h-6 flex-1 bg-transparent text-xs outline-none px-1"
                            spellCheck={false}
                        />
                        <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
              {folderFilterText.trim() ? `${row.folderFiles.length}/${row.folderFileTotal}` : ""}
            </span>
                        <button
                            type="button"
                            onClick={() => {
                                setFolderFilter(null);
                                setFolderFilterText("");
                            }}
                            aria-label="Close folder filter"
                            title="Close (Esc) — all files return"
                            className="size-4 rounded-sm flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                            <X className="size-3"/>
                        </button>
                    </div>
                );
            }
            case "rootdata": {
                // root-level DATA files affordance — the folder header (which
                // carried the database chip) is skipped for the root entry, so
                // a slim row keeps the Data File Browser one click away.
                // (marginLeft: 16 = the old ml-7 (28px) inside the removed
                // -ml-3 wrapper.)
                const dataFiles = folder.dataFiles;
                if (!dataFiles || dataFiles.length === 0) return null;
                return (
                    <button
                        type="button"
                        data-vrow={row.key}
                        onClick={() => {
                            if (onDataFileBrowserOpen) {
                                const first =
                                    row.folderFiles[0] ??
                                    (sortedFilesByFolder.get(folder.slug) ?? [])[0];
                                if (first) onSelectFile(folder.slug, first.slug);
                                onDataFileBrowserOpen();
                            }
                        }}
                        className="flex items-center gap-1 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                        style={{marginLeft: 16}}
                        title={`${dataFiles.length} data file${dataFiles.length === 1 ? "" : "s"} in the project root — open the Data File Browser`}
                    >
                        <Database className="size-3"/>
                        <span>
              {dataFiles.length} data file{dataFiles.length === 1 ? "" : "s"} in the project root
            </span>
                    </button>
                );
            }
            case "tags": {
                // Folder tags — hidden via Settings → Editor → "Show #tags in
                // the explorer".
                const tags = folder.tags;
                if (!tags || tags.length === 0) return null;
                return (
                    <div
                        data-vrow={row.key}
                        className="flex flex-wrap gap-1 px-6 py-0.5"
                        style={row.rootShift ? {marginLeft: -12} : undefined}
                    >
                        {tags.slice(0, 6).map((tag) => (
                            <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[9px] px-1 py-0"
                            >
                                #{tag}
                            </Badge>
                        ))}
                    </div>
                );
            }
            case "subfolder": {
                // ─── nested folder row ───────
                const dirPath = row.dirPath;
                if (dirPath === undefined) return null;
                const depth = row.depth ?? 0;
                const name = dirPath.split("/").pop() ?? dirPath;
                const folderKey = `${folder.slug}::${dirPath}`;
                // (subfolder icon/color): subfolders resolve the SAME per-item
                // appearance overrides the main folders use — keyed on the
                // composite `<folder-slug>::<dirPath>` so every nesting level is
                // independently customizable.
                const subAppearance = appearance.folders?.[folderKey];
                const SubfolderIconComponent =
                    appearanceIcon(subAppearance?.icon, FOLDER_ICON_CHOICES) ?? Folder;
                const subIconColor = appearanceIconColor(subAppearance);
                const subTextColor = appearanceTextColor(subAppearance);
                const directFiles = row.folderFiles.filter((f) => f.dir === dirPath);
                const descendantCount = row.folderFiles.filter(
                    (f) => (f.dir ?? "").startsWith(dirPath + "/")
                ).length;
                return (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <div
                                data-vrow={row.key}
                                style={row.rootShift ? {marginLeft: -12} : undefined}
                                role="button"
                                tabIndex={0}
                                aria-expanded={row.isOpen}
                                onClick={() => toggleFolderExpanded(folderKey)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        toggleFolderExpanded(folderKey);
                                    }
                                }}
                                // drag-and-drop works on SUBFOLDER rows too — same
                                // handlers as the main folder header. Internal drags
                                // (files dragged from the tree) MOVE the files into this
                                // subfolder; OS files dropped here are IMPORTED into it.
                                // the row is also a drag SOURCE — dragging THIS subfolder
                                // onto a folder header / another subfolder moves the
                                // whole directory.
                                draggable
                                onDragStart={(e) => {
                                    try {
                                        e.dataTransfer.setData(
                                            "application/praxis-folder",
                                            JSON.stringify({folderSlug: folder.slug, dirPath: dirPath})
                                        );
                                        // Plain-text fallback: the human-readable path.
                                        e.dataTransfer.setData(
                                            "text/plain",
                                            `${folder.name}/${dirPath}`
                                        );
                                    } catch {
                                        /* Safari quirk guards */
                                    }
                                    e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                    // Allow drop — preventDefault or the browser navigates
                                    // to the dropped file.
                                    e.preventDefault();
                                    if (dragOverFolder !== folderKey) {
                                        setDragOverFolder(folderKey);
                                    }
                                }}
                                onDragLeave={(e) => {
                                    // Only clear when leaving the row itself (not moving
                                    // between its children).
                                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                        if (dragOverFolder === folderKey) setDragOverFolder(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOverFolder(null);
                                    // SUBFOLDER drags first — dropping one folder row onto
                                    // another nests it inside this subfolder.
                                    const folderDrag = e.dataTransfer?.getData("application/praxis-folder");
                                    if (folderDrag) {
                                        try {
                                            const payload = JSON.parse(folderDrag) as {
                                                folderSlug?: string;
                                                dirPath?: string
                                            };
                                            if (payload.folderSlug && payload.dirPath) {
                                                void handleMoveFolderByDrag(
                                                    {folderSlug: payload.folderSlug, dirPath: payload.dirPath},
                                                    folder.slug,
                                                    folder.name,
                                                    dirPath
                                                );
                                                return;
                                            }
                                        } catch {
                                            /* malformed payload — fall through */
                                        }
                                    }
                                    // Internal drag next — the custom MIME type
                                    // distinguishes tree drags from OS-file imports.
                                    const dragData = e.dataTransfer?.getData("application/praxis-files");
                                    if (dragData) {
                                        try {
                                            const files = JSON.parse(dragData) as ClipboardFileRef[];
                                            if (Array.isArray(files) && files.length > 0) {
                                                void handleMoveFilesByDrag(files, folder.slug, folder.name, dirPath);
                                                return;
                                            }
                                        } catch {
                                            /* malformed payload — fall through */
                                        }
                                    }
                                    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                                        void handleDropOnFolder(folder.slug, folder.name, e.dataTransfer.files, dirPath);
                                    }
                                }}
                                className={cn(
                                    "w-full flex items-center gap-1.5 py-1 text-xs font-medium hover:bg-accent/40 transition-colors cursor-pointer select-none text-foreground/90",
                                    treeRowFolderPadClass(depth),
                                    dragOverFolder === folderKey && "ring-2 ring-emerald-500 ring-inset bg-emerald-500/5"
                                )}
                                title={`${folder.name}/${dirPath} — ${directFiles.length + descendantCount} file${directFiles.length + descendantCount === 1 ? "" : "s"}. Drag files from your computer and drop here to import them into "${name}" — drag a file from another folder here to MOVE it — or DRAG THIS ROW onto another folder/subfolder to move the whole subfolder.`}
                            >
                <span
                    className={cn(
                        "shrink-0 inline-flex transition-transform duration-150 text-muted-foreground",
                        row.isOpen && "rotate-90"
                    )}
                    aria-hidden
                >
                  <ChevronRight className="size-3"/>
                </span>
                                <SubfolderIconComponent
                                    className={cn(
                                        "size-3.5 shrink-0",
                                        !subIconColor && "text-sky-500/90"
                                    )}
                                    style={subIconColor ? {color: subIconColor} : undefined}
                                />
                                <span
                                    className="truncate text-left"
                                    style={subTextColor ? {color: subTextColor} : undefined}
                                >
                  {name}
                </span>
                                {/* count + size badges for subfolders too — count covers
                    direct + nested files, size totals the whole
                    subtree. */}
                                <span className="ml-auto shrink-0 flex items-center gap-1 pr-1.5">
                  <TreeBadge
                      variant="count"
                      title={`${directFiles.length + descendantCount} file${directFiles.length + descendantCount === 1 ? "" : "s"} inside ${folder.name}/${dirPath}`}
                  >
                    {directFiles.length + descendantCount}
                  </TreeBadge>
                                    {showFolderSize && (
                                        <TreeBadge
                                            variant="size"
                                            title={`${subtreeSize(row.folderFiles, dirPath).toLocaleString()} bytes inside ${folder.name}/${dirPath}`}
                                        >
                                            {formatSize(subtreeSize(row.folderFiles, dirPath))}
                                        </TreeBadge>
                                    )}
                </span>
                            </div>
                        </ContextMenuTrigger>
                        {/* the nested row renders the SAME shared folder menu —
                every action scoped to this NESTED path (the server
                routes accept the `sub` parameter). */}
                        {renderFolderMenu({
                            folderSlug: folder.slug,
                            folderName: folder.name,
                            sub: dirPath,
                            label: `${folder.name}/${dirPath}`,
                            scopedFiles: row.folderFiles.filter(
                                (f) => (f.dir ?? "") === dirPath || (f.dir ?? "").startsWith(dirPath + "/")
                            ),
                            isRootFolder: false,
                        })}
                    </ContextMenu>
                );
            }
            case "file": {
                const file = row.file;
                if (!file) return null;
                const depth = row.depth ?? 0;
                const isSelected =
                    isSelectedFolder && file.slug === selectedFileSlug;
                // favorites are keyed by the COMPOSITE `folder/file` — compute
                // it first.
                const fileKey = `${folder.slug}/${file.slug}`;
                const isFav = favorites.has(fileKey);
                // multi-select membership + visual.
                const inMultiSelect = multiSelect.includes(fileKey);
                // freshly-added favorite — keeps its highlight for the
                // CONFIGURED number of seconds (favTtlMs), then reverts to a
                // plain star (no "new" word, just the ring + a bold name + a
                // one-shot pop).
                const favNotedAt = favNoted[fileKey];
                const isFreshFav =
                    isFav &&
                    favTtlMs > 0 &&
                    typeof favNotedAt === "number" &&
                    Date.now() - favNotedAt < favTtlMs;
                // per-file icon + color override.
                const fileAppearance = appearance.files?.[fileKey];
                const CustomIcon = appearanceIcon(
                    fileAppearance?.icon,
                    FILE_ICON_CHOICES
                );
                const gitKey = `${folder.name}/${file.name}`;
                const gitStatus = gitStatusMap?.[gitKey];
                return (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            {/* File row — a <div> with role=button (NOT a <button>)
                  because it contains a favorite-star <button> child.
                  Nested buttons cause hydration errors. */}
                            <div
                                data-vrow={row.key}
                                style={row.rootShift ? {marginLeft: -12} : undefined}
                                ref={isSelected ? selectedFileRef : undefined}
                                role="button"
                                tabIndex={0}
                                // Ctrl/Cmd click toggles the multi-selection, Shift
                                // click ranges, plain click opens. Focus is tracked for
                                // the keyboard ops (Del / Ctrl+C/X/V / F2).
                                onClick={(e) =>
                                    handleFileRowClick(e, folder.slug, file.slug, row.folderFileSlugs)
                                }
                                // Shift+click range-select — the BROWSER's default
                                // mousedown behavior extends the text selection from the
                                // anchor to the clicked row (the whole sidebar lights up
                                // blue). preventDefault on MOUSEDOWN (not click — by
                                // click time the selection is already made) kills it; we
                                // restore focus manually because preventDefault also
                                // suppresses the native focus move.
                                onMouseDown={(e) => {
                                    if (e.shiftKey) {
                                        e.preventDefault();
                                        e.currentTarget.focus();
                                    }
                                }}
                                onFocus={() => {
                                    focusKeyRef.current = `${folder.slug}/${file.slug}`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onSelectFile(folder.slug, file.slug);
                                    }
                                }}
                                // drag-to-move — drag this row onto another folder's
                                // header to MOVE it there (onto its own folder = no-op).
                                // When the dragged row is part of a multi-selection, the
                                // WHOLE selection moves. The payload rides a custom MIME
                                // type so the folder drop handler can tell internal
                                // drags apart from OS-file imports (which still work).
                                draggable
                                onDragStart={(e) => {
                                    const dragKey = `${folder.slug}/${file.slug}`;
                                    const files =
                                        multiSelect.length > 1 && multiSelect.includes(dragKey)
                                            ? resolveMultiFiles(multiSelect)
                                            : [
                                                {
                                                    folderSlug: folder.slug,
                                                    folderName: folder.name,
                                                    fileSlug: file.slug,
                                                    fileName: file.name,
                                                },
                                            ];
                                    try {
                                        e.dataTransfer.setData(
                                            "application/praxis-files",
                                            JSON.stringify(files)
                                        );
                                        // Plain-text fallback so dropping outside the tree
                                        // (or into a text field) still yields the file
                                        // name(s).
                                        e.dataTransfer.setData(
                                            "text/plain",
                                            files.map((f) => f.fileName).join(", ")
                                        );
                                    } catch {
                                        /* Safari quirk guards */
                                    }
                                    e.dataTransfer.effectAllowed = "move";
                                }}
                                className={cn(
                                    "w-full flex items-center gap-1.5 py-1 text-xs hover:bg-accent/40 transition-colors group cursor-pointer",
                                    // depth-aware indent — files inside nested folders
                                    // shift right by their folder depth (root files keep
                                    // pl-7).
                                    treeRowFilePadClass(depth),
                                    isSelected && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                                    inMultiSelect &&
                                    "ring-1 ring-inset ring-sky-500/70 bg-sky-500/10"
                                )}
                                title={file.description ?? file.name}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleFavorite(fileKey);
                                    }}
                                    className={cn(
                                        "shrink-0 p-0 hover:scale-110 transition-transform",
                                        // freshly-added favorite is easy to spot at its new
                                        // top position (kept per user request — "the circle
                                        // is good").
                                        isFreshFav && "rounded-full ring-2 ring-amber-400/70"
                                    )}
                                    aria-label={isFav ? "Unfavorite" : "Add to favorites"}
                                    title={isFav ? `Remove "${file.name}" from favorites` : `Add "${file.name}" to favorites`}
                                >
                                    <Star
                                        className={cn(
                                            "size-3",
                                            isFav
                                                ? "text-amber-400 fill-amber-400"
                                                : "text-muted-foreground/30 hover:text-muted-foreground",
                                            // one-shot pop animation when the favorite is
                                            // added (single bounce, not a permanent wiggle —
                                            // see .fav-pop in globals.css; disabled under
                                            // prefers-reduced-motion).
                                            isFreshFav && "fav-pop"
                                        )}
                                    />
                                </button>
                                {/* File-kind icon — each kind has its own lucide icon +
                    color so the user can tell at a glance what kind of
                    file it is. A custom icon + color override wins when
                    set. */}
                                {(() => {
                                    const KindIcon = CustomIcon ?? fileKindIcon(file.kind);
                                    // icon color and text color are separate overrides now
                                    // (iconColor / textColor; the legacy single `color`
                                    // still tints both).
                                    const effIconColor = appearanceIconColor(fileAppearance);
                                    return (
                                        <KindIcon
                                            className={cn(
                                                "size-3.5 shrink-0",
                                                isSelected ? "text-emerald-500" : !effIconColor && fileKindColor(file.kind)
                                            )}
                                            style={effIconColor ? {color: effIconColor} : undefined}
                                        />
                                    );
                                })()}
                                {/* Filename in its own overflow-hidden container so the
                    text physically CANNOT extend under the badge. The
                    badge is OUTSIDE this container (a sibling), so
                    there's zero overlap. */}
                                <div className="min-w-0 flex-1 overflow-hidden">
                  <span
                      className={cn(
                          "truncate block text-left",
                          // the fresh favorite's name is bold until the
                          // highlight expires.
                          isFreshFav && "font-semibold"
                      )}
                      style={appearanceTextColor(fileAppearance) ? {color: appearanceTextColor(fileAppearance)} : undefined}
                      title={file.name}
                  >
                    {filter.trim() ? (
                        <HighlightedText
                            text={file.name}
                            indices={fuzzyMatchIndices(filter.trim(), file.name)}
                        />
                    ) : row.folderFilterActive && folderFilterText.trim() ? (
                        <HighlightedText
                            text={file.name}
                            indices={substringIndices(folderFilterText, file.name)}
                        />
                    ) : (
                        file.name
                    )}
                  </span>
                                </div>
                                {/* Right-aligned metadata cluster — shrink-0 keeps it at
                    the right edge. Separate sibling from the filename
                    container = zero overlap. Background matches the
                    row's state. */}
                                <div className={cn(
                                    "shrink-0 flex items-center gap-1.5 pl-2 pr-1.5 bg-card",
                                    isSelected && "bg-emerald-500/10",
                                    "group-hover:bg-accent/40",
                                )}>
                                    {showLastRunStatus && lastRunStatus?.has(fileKey) && (
                                        <span
                                            className={cn(
                                                "size-1.5 rounded-full shrink-0",
                                                lastRunStatus.get(fileKey)
                                                    ? "bg-emerald-500"
                                                    : "bg-red-500"
                                            )}
                                            title={
                                                lastRunStatus.get(fileKey)
                                                    ? "Last run: OK"
                                                    : "Last run: failed"
                                            }
                                            aria-label={
                                                lastRunStatus.get(fileKey)
                                                    ? "Last run succeeded"
                                                    : "Last run failed"
                                            }
                                        />
                                    )}
                                    {gitStatus && gitStatus !== " " && (
                                        <span
                                            className={cn(
                                                "text-[9px] shrink-0 font-mono w-3 text-center",
                                                gitStatus === "M"
                                                    ? "text-amber-500"
                                                    : gitStatus === "?"
                                                        ? "text-cyan-500"
                                                        : "text-red-500"
                                            )}
                                        >
                      {gitStatus}
                    </span>
                                    )}
                                    {showTags && file.tags && file.tags.length > 0 && (
                                        <span
                                            className="text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0 max-w-[60px] truncate">
                      #{file.tags[0]}
                    </span>
                                    )}
                                    {showFileSize && (
                                        /* per-file size as a muted pill badge (was loose
                       right-aligned digits). */
                                        <TreeBadge
                                            variant="size"
                                            title={`${file.size.toLocaleString()} bytes`}
                                        >
                                            {formatSize(file.size)}
                                        </TreeBadge>
                                    )}
                                </div>
                            </div>
                        </ContextMenuTrigger>
                        {/* Right-click context menu — VSCode/PyCharm style. Items:
                Open, Rename, Copy path, Download, Open containing
                folder, Toggle favorite, Delete. Delete uses a
                confirmation dialog (set deleteTarget) rather than
                window.confirm so the UI matches the rest of the app. */}
                        {renderFileContextMenu(folder.slug, folder.name, file, fileKey)}
                    </ContextMenu>
                );
            }
        }
    };

    // Virtualized-tree window math (clamped against the live row count so
    // a stale range — rows collapsed above while scrolled — can never
    // index past the end; the layout effects above re-sync it).
    const treeRowCount = treeRows.length;
    const treeWinStart = Math.max(0, Math.min(vRange.start, treeRowCount));
    const treeWinEnd = Math.max(treeWinStart, Math.min(vRange.end, treeRowCount));
    const treeTopPad =
        treeWinStart < treeRowCount
            ? rowPositions.starts[treeWinStart]
            : rowPositions.total;
    const treeBottomPad = Math.max(
        0,
        rowPositions.total -
        (treeWinEnd > treeWinStart
            ? rowPositions.starts[treeWinEnd - 1] + rowPositions.heights[treeWinEnd - 1]
            : treeTopPad)
    );

    return (
        <div className="flex flex-col h-full min-h-0 bg-card/40 border-r overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-1 px-3 py-2.5 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <BookOpen className="size-3.5 text-emerald-500 shrink-0"/>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
 {/* translated label (i18n: explore) — English fallback. */}
                        {t("explore")}
          </span>
                </div>
                <div className="flex items-center gap-0.5">
                    {/* Collapse-sidebar button — hides the sidebar so the user
gets the full width for the code. The collapsed rail at
the left edge of the main area carries an expand button. */}
                    {onCollapse && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            onClick={onCollapse}
                            aria-label="Collapse sidebar"
                            title="Collapse sidebar (⌘B) — click the rail at the left edge to expand"
                        >
                            <PanelLeftClose className="size-3.5"/>
                        </Button>
                    )}
                </div>
            </div>

            {/* Search filter */}
            <div className="px-2 py-2 border-b shrink-0">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground"/>
                    <Input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter folders & scripts…"
                        className="h-7 pl-7 pr-2 text-xs"
                    />
                </div>
            </div>

            {/* Option buttons — toolbar row below the search filter */}
            <div className="flex items-center gap-0.5 px-2 py-1 border-b shrink-0">
                {/* "+" toolbar button — New Folder / New File dropdown.
              Mirrors VSCode's Explorer "+" button. The dropdown shows
              both options plus quick access to upload-ZIP. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            title="New folder / New file"
                            aria-label="New folder or file"
                        >
                            <Plus className="size-3.5"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            New
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => {
                                setNewFolderName("");
                                setShowNewFolder(true);
                            }}
                            className="gap-2"
                            title="Create a new empty folder"
                        >
                            <FolderPlus className="size-3.5 text-emerald-500 shrink-0"/>
                            <span className="flex-1">New Folder…</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                // Default to the currently-selected folder if any.
                                setNewFileFolder(selectedFolderSlug || "");
                                setNewFileSub("");
                                setNewFileName("");
                                setShowNewFile(true);
                            }}
                            className="gap-2"
                            title="Create a new empty file in a folder"
                        >
                            <FilePlus className="size-3.5 text-emerald-500 shrink-0"/>
                            <span className="flex-1">New File…</span>
                        </DropdownMenuItem>
                        {onUploadZip && (
                            <>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem
                                    onClick={onUploadZip}
                                    disabled={uploadingZip}
                                    className="gap-2"
                                    title="Upload a .zip archive as a new project"
                                >
                                    <Upload className="size-3.5 text-cyan-500 shrink-0"/>
                                    <span className="flex-1">Upload ZIP As New Project…</span>
                                    {uploadingZip && <RefreshCw className="size-3 animate-spin"/>}
                                </DropdownMenuItem>
                            </>
                        )}
                        {/* "Open folder…" — the +
dropdown also offers opening a selected folder
(anywhere on the machine) as the active project. Same
dialog as File → Open project → Browse for folder… */}
                        {onOpenFolderPicker && (
                            <>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem
                                    onClick={onOpenFolderPicker}
                                    className="gap-2"
                                    title="Browse the filesystem and open any folder as the active project"
                                >
                                    <FolderSearch className="size-3.5 text-emerald-500 shrink-0"/>
                                    <span className="flex-1">Open Folder…</span>
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* Project switcher was moved to the top MenuBar (File →
              Open project). The "+" toolbar button below this comment
              is the only "new" entry point kept in the sidebar. */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={revealCurrent}
                    disabled={!selectedFolderSlug}
                    title="Reveal current file in Explorer (collapse others, scroll to it)"
                >
                    <Crosshair className="size-3"/>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={onToggleSort}
                    title={
                        sortMode === "alpha"
                            ? "Sorting alphabetically. Click to sort by modification time."
                            : "Sorting by modification time. Click to sort alphabetically."
                    }
                >
                    <ArrowUpDown className="size-3"/>
                </Button>
                {/* explorer VIEW MODE — tree / flat list / grouped
              by kind / details table. The active mode persists and the
              icon reflects it. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label="Explorer view mode"
                            title={`Explorer view: ${explorerView === "tree" ? "tree" : explorerView === "flat" ? "flat list" : explorerView === "kind" ? "grouped by file kind" : "details table"}. Click to switch — tree / flat / by kind / details.`}
                        >
                            {explorerView === "tree" ? (
                                <ListTree className="size-3"/>
                            ) : explorerView === "flat" ? (
                                <Rows3 className="size-3"/>
                            ) : explorerView === "kind" ? (
                                <Boxes className="size-3"/>
                            ) : (
                                <Table className="size-3"/>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuLabel className="text-[10px]">Explorer View</DropdownMenuLabel>
                        <DropdownMenuSeparator/>
                        {(
                            [
                                {
                                    mode: "tree",
                                    label: "Tree",
                                    icon: ListTree,
                                    hint: "Folders, subfolders and files (default)"
                                },
                                {
                                    mode: "flat",
                                    label: "Flat list",
                                    icon: Rows3,
                                    hint: "Every file in one list, annotated with its location"
                                },
                                {
                                    mode: "kind",
                                    label: "By file kind",
                                    icon: Boxes,
                                    hint: "Grouped by type — Python, Markdown, data, media…"
                                },
                                {
                                    mode: "details",
                                    label: "Details table",
                                    icon: Table,
                                    hint: "Sortable Name / Location / Type / Size / Modified columns"
                                },
                            ] as const
                        ).map((opt) => (
                            <DropdownMenuItem
                                key={opt.mode}
                                onClick={() => handleSetExplorerView(opt.mode)}
                                className="gap-2 cursor-pointer"
                                title={opt.hint}
                            >
                                <opt.icon className="size-3.5 shrink-0 text-muted-foreground"/>
                                <span className="flex-1">{opt.label}</span>
                                {explorerView === opt.mode && <Check className="size-3.5 shrink-0 text-emerald-500"/>}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* show-hidden toggle — surfaces dot-directories
              (.praxis with the project settings) and dot-files. */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => window.dispatchEvent(new Event("praxis:toggle-hidden-files"))}
                    title={
                        showHidden
                            ? "Hidden files are SHOWN (incl. .praxis). Click to hide dot-files again."
                            : "Show hidden files — dot-directories like .praxis (the project settings) and dot-files"
                    }
                    aria-pressed={showHidden}
                >
                    {showHidden ? <EyeOff className="size-3"/> : <Eye className="size-3"/>}
                </Button>
                {/* Collapse / expand all folder folders. */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={collapseAll}
                    disabled={folders.length === 0}
                    title="Collapse all folders"
                    aria-label="Collapse all folders"
                >
                    <FoldVertical className="size-3"/>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={expandAll}
                    disabled={folders.length === 0}
                    title="Expand all folders"
                    aria-label="Expand all folders"
                >
                    <UnfoldVertical className="size-3"/>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={onRefresh}
                    disabled={loading}
                    title="Refresh project"
                >
                    <RefreshCw className={cn("size-3", loading && "animate-spin")}/>
                </Button>
            </div>

            {/* Tree — ScrollArea with min-h-0 so it actually scrolls instead
of growing to fit content. The Radix inner wrapper defaults to
`display: table; min-width: 100%` which lets it grow beyond
the viewport width (causing horizontal scroll). We override it
to `display: block` so the content stays at the viewport width
filenames truncate with "..." and the size/count badges stay
fixed at the right edge via shrink-0. */}
            <ScrollArea
                className="flex-1 min-h-0 folder-tree-scroll"
                // keyboard file operations (Delete, Ctrl+C/X/V,
                // F2) fire here when a row (or the tree itself) holds focus.
                onKeyDown={handleTreeKeyDown}
            >
                {/* FLEX CHAIN — the old fix relied on
`min-h-full` (percentage min-height), which resolves to 0
against the auto-height Radix wrappers, so the blank area
below the last folder was NOT part of the context-menu
trigger and right-clicking it showed the browser menu.
Instead: the viewport's inner wrapper becomes a flex COLUMN
with min-height 100% (resolves against the viewport's
definite height), every container below stretches with
flex-1 — no percentages anywhere. */}
                <style>{`[data-radix-scroll-area-viewport] > div { display: flex !important; flex-direction: column !important; width: 100% !important; min-height: 100% !important; }`}</style>
                {/* treeViewportAnchorRef — a rendered descendant INSIDE the radix
            viewport; the virtualizer walks up from it (closest) to find
            the scrolling element, since the viewport isn't
            ref-addressable through the shadcn ScrollArea wrapper.
            overflow-x-CLIP (not hidden): `hidden` made this div a
            COMPUTED scroll container (a clipped axis forces the other
            axis to auto), which hijacked the details table's sticky
            thead — the header stuck to THIS never-scrolling box while
            the real scroller (the Radix viewport) scrolled past it, so
            the header floated away / content hid under the menubar.
            `clip` clips the same overflow WITHOUT creating a scroll
            container, so the thead sticks to the real viewport. */}
                <div ref={treeViewportAnchorRef} className="py-1 w-full overflow-x-clip flex-1 flex flex-col">
                    {error && (
                        <div className="px-3 py-2 text-xs text-destructive flex items-center gap-1.5">
                            <CircleAlert className="size-3.5"/>
                            {error}
                        </div>
                    )}
                    {loading && folders.length === 0 && (
                        // Skeleton — 4 shimmering rows matching the folder row
                        // height, instead of a plain text label. Feels less janky
                        // on slow connections than a sudden reflow when the tree
                        // appears.
                        <div className="px-2 py-2 space-y-1">
                            {Array.from({length: 4}).map((_, i) => (
                                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                                    <div className="size-3.5 rounded bg-muted-foreground/20 animate-pulse shrink-0"/>
                                    <div className="h-3 rounded bg-muted-foreground/20 animate-pulse"
                                         style={{width: `${60 + i * 10}%`}}/>
                                </div>
                            ))}
                        </div>
                    )}
                    {!loading && folders.length === 0 && !error && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center space-y-2">
                            <p>
                                {activeProject ? (
                                    <>
                                        This project is empty. Create a folder with the{" "}
                                        <strong className="font-medium text-foreground">+</strong>{" "}
                                        button above, drop files anywhere in the sidebar, or
                                        upload a ZIP.
                                    </>
                                ) : (
                                    <>
                                        No folders found. Drop folders into{" "}
                                        <code className="font-mono">python_scripts/</code>.
                                    </>
                                )}
                            </p>
                            <div className="flex items-center justify-center gap-1.5">
                                {onUploadZip && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1.5 text-[11px]"
                                        onClick={onUploadZip}
                                        disabled={uploadingZip}
                                        title="Upload a .zip archive — extracts into a new project directory"
                                    >
                                        {uploadingZip ? <Loader2 className="size-3 animate-spin"/> :
                                            <Upload className="size-3"/>}
                                        Upload ZIP
                                    </Button>
                                )}
                                {onRefresh && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1.5 text-[11px]"
                                        onClick={onRefresh}
                                        title="Refresh the project"
                                    >
                                        <RefreshCw className="size-3"/>
                                        Refresh
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    {filtered.length === 0 && filter && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            No matches for &ldquo;{filter}&rdquo;.
                        </div>
                    )}
                    {/* Recently modified — the N most-recently-modified files
 across all folders (count configurable via
              Settings → Editor, the whole section toggleable).
 the divider moved BELOW the section (border-b) so
              the Recent block is separated from the folder list by a
              line — the old border-t put the line ABOVE it, leaving the
              folders underneath visually glued to Recent.
              Collapsible. Hidden while a filter is active so the
              search results stay clean. */}
                    {showRecentFiles !== false && recentFiles.length > 0 && !filter.trim() && (
                        <div className="mb-2 pb-1 border-b">
                            <button
                                type="button"
                                onClick={() => setRecentCollapsed((v) => !v)}
                                className="w-full flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/40 transition-colors"
                                title={recentCollapsed ? "Expand Recent section" : "Collapse Recent section"}
                                aria-expanded={!recentCollapsed}
                            >
                                {recentCollapsed ? (
                                    <ChevronRight className="size-3 shrink-0"/>
                                ) : (
                                    <ChevronDown className="size-3 shrink-0"/>
                                )}
                                <Clock className="size-3 shrink-0"/>
                                <span>Recent</span>
                                <span
                                    className="ml-auto normal-case font-normal tracking-normal text-muted-foreground/70">
                  {recentFiles.length}
                </span>
                            </button>
                            {!recentCollapsed && (
                                <div>
                                    {recentFiles.map((r) => {
                                        const isSelected =
                                            r.folderSlug === selectedFolderSlug &&
                                            r.file.slug === selectedFileSlug;
                                        // the Recent rows now respect the
                                        // per-file icon + color overrides ("Icon & color…") —
                                        // they used to fall back to the kind defaults, so a
                                        // customized file showed its default look here.
                                        const rKey = `${r.folderSlug}/${r.file.slug}`;
                                        const rApp = appearance.files?.[rKey];
                                        const KindIcon =
                                            appearanceIcon(rApp?.icon, FILE_ICON_CHOICES) ??
                                            fileKindIcon(r.file.kind);
                                        const rIconColor = appearanceIconColor(rApp);
                                        // The Recent rows mount the SAME
                                        // ContextMenu + renderFileContextMenu the tree file rows
                                        // use (Open, Rename, Copy path, Download, Export ▸,
                                        // Toggle favorite, Delete…), so a Recent row behaves
                                        // exactly like its twin in the tree and right-clicking
                                        // opens the IDE's file menu, not the browser's.
                                        return (
                                            <ContextMenu key={`recent:${r.folderSlug}:${r.file.slug}`}>
                                                <ContextMenuTrigger asChild>
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => onSelectFile(r.folderSlug, r.file.slug)}
                                                        // same Shift+click text-selection
                                                        // guard as the file rows.
                                                        onMouseDown={(e) => {
                                                            if (e.shiftKey) {
                                                                e.preventDefault();
                                                                e.currentTarget.focus();
                                                            }
                                                        }}
                                                        // focus hygiene — a focused
                                                        // Recent row must NOT let Delete/F2 act on the
                                                        // last-focused file row (focusKeyRef is cleared
                                                        // so handleTreeKeyDown no-ops).
                                                        onFocus={() => {
                                                            focusKeyRef.current = null;
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                onSelectFile(r.folderSlug, r.file.slug);
                                                            }
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-1.5 pl-6 py-1 text-xs hover:bg-accent/40 transition-colors cursor-pointer",
                                                            isSelected && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                        )}
                                                        title={`${r.file.name} — ${r.folderName}`}
                                                    >
                                                        <KindIcon
                                                            className={cn(
                                                                "size-3.5 shrink-0",
                                                                isSelected && !rIconColor ? "text-emerald-500" : !rIconColor && fileKindColor(r.file.kind)
                                                            )}
                                                            style={rIconColor ? {color: rIconColor} : undefined}
                                                        />
                                                        <div className="min-w-0 flex-1 flex flex-col leading-tight">
                          <span
                              className="truncate text-xs"
                              style={appearanceTextColor(rApp) ? {color: appearanceTextColor(rApp)} : undefined}
                              title={r.file.name}
                          >
                            {r.file.name}
                          </span>
                                                            <span className="truncate text-[9px] text-muted-foreground">
                            {r.folderName}
                          </span>
                                                        </div>
                                                        <span
                                                            className="shrink-0 pr-1.5 text-[9px] text-muted-foreground tabular-nums">
                          {formatRelativeTime(r.file.mtime ?? 0)}
                        </span>
                                                    </div>
                                                </ContextMenuTrigger>
                                                {renderFileContextMenu(r.folderSlug, r.folderName, r.file, rKey)}
                                            </ContextMenu>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    {/* the folder list area (INCLUDING the empty
space below the last folder — min-h-full stretches the
trigger to the bottom) is a context-menu trigger, so
right-clicking the explorer's blank bottom area finally
shows the IDE's folder actions instead of the browser's
default menu. */}
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            {/* flex-1 inside the flex column above — stretches to cover
 the blank area under the last folder. */}
                            <div className="flex-1 flex flex-col">
                                {/* the TREE renders only in tree mode — flat / kind / details
              swap in the alternate view bodies below.
              VIRTUALIZED (D17): the flattened row list (treeRows — see
              the virtualization block above) mounts ONLY the rows
              intersecting the scroll window plus a ~240px overscan; the
              top/bottom spacers carry the hidden rows' height so the
              scrollbar, the blank-area context menu and drag-drop
              hit-testing behave exactly as they did when every visible
              row was in the DOM. */}
                                {explorerView === "tree" && treeRows.length > 0 && (
                                    <div ref={treeHostRef}>
                                        <div style={{height: treeTopPad}} aria-hidden="true"/>
                                        {treeRows.slice(treeWinStart, treeWinEnd).map((vRow) => (
                                            <React.Fragment key={vRow.key}>{renderVirtualRow(vRow)}</React.Fragment>
                                        ))}
                                        <div style={{height: treeBottomPad}} aria-hidden="true"/>
                                    </div>
                                )}
                                {/* alternate view bodies — flat / kind /
              details replace the folder tree (the Recent block and
              this blank-area context menu stay shared). */}
                                {explorerView !== "tree" && renderAltViews()}
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56">
                            <ContextMenuLabel className="text-[10px] text-muted-foreground">
                                Explorer
                            </ContextMenuLabel>
                            <ContextMenuSeparator/>
                            {/* ── New ▸ — folder / root file creation. ── */}
                            <ContextMenuSub>
                                <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                       title="Create a new folder or a file in the project root">
                                    <FolderPlus className="size-3.5 text-emerald-500 shrink-0"/>
                                    <span className="flex-1">New</span>
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="w-56">
                                    <ContextMenuItem
                                        onClick={() => {
                                            setNewFolderTarget(null);
                                            setNewFolderName("");
                                            setShowNewFolder(true);
                                        }}
                                        className="gap-2 cursor-pointer"
                                        title="Create a new top-level folder in this project"
                                    >
                                        <FolderPlus className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span>New Folder…</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => {
                                            // The project ROOT is the synthetic first entry — a
                                            // blank-area "New file" creates at the same top level
                                            // the folders live on.
                                            const first = filtered[0];
                                            if (first) {
                                                setNewFileFolder(first.slug);
                                                setNewFileSub("");
                                                setNewFileName("");
                                                setNewFileContent(null);
                                                setShowNewFile(true);
                                            }
                                        }}
                                        disabled={filtered.length === 0}
                                        className="gap-2 cursor-pointer"
                                        title="Create a new file in the PROJECT ROOT — the same top level as the folders"
                                    >
                                        <FilePlus className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span>New File In Project Root…</span>
                                    </ContextMenuItem>
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                            {/* ── Project ▸ — reveal / import / refresh. ── */}
                            <ContextMenuSub>
                                <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                       title="Reveal, import a ZIP project, or re-scan">
                                    <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>
                                    <span className="flex-1">Project</span>
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="w-60">
                                    {(() => {
                                        const root = folders.find((f) => f.isRoot);
                                        if (!root) return null;
                                        return (
                                            <ContextMenuItem
                                                onClick={() => void handleRevealFolder(root.slug)}
                                                disabled={revealingFolder}
                                                className="gap-2 cursor-pointer"
                                                title="Open the project root folder in your OS file explorer"
                                            >
                                                {revealingFolder ?
                                                    <Loader2 className="size-3.5 animate-spin shrink-0"/> :
                                                    <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>}
                                                <span>{revealingFolder ? "Opening…" : "Reveal Project Folder"}</span>
                                            </ContextMenuItem>
                                        );
                                    })()}
                                    {onUploadZip && (
                                        <ContextMenuItem
                                            onClick={onUploadZip}
                                            className="gap-2 cursor-pointer"
                                            title="Upload a .zip archive — extracts into a new project directory and switches to it"
                                        >
                                            <Upload className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Upload ZIP As Project…</span>
                                        </ContextMenuItem>
                                    )}
                                    {onRefresh && (
                                        <ContextMenuItem
                                            onClick={onRefresh}
                                            className="gap-2 cursor-pointer"
                                            title="Re-scan the project folder"
                                        >
                                            <RefreshCw className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span>Refresh</span>
                                        </ContextMenuItem>
                                    )}
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                            {/* ── Collapse ▸ — subfolders / everything. ── */}
                            <ContextMenuSub>
                                <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                       title="Collapse subfolders or every folder in the tree">
                                    <ChevronsDown className="size-3.5 text-muted-foreground shrink-0"/>
                                    <span className="flex-1">Collapse</span>
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="w-56">
                                    <ContextMenuItem
                                        onClick={() => {
                                            setExpandedFolders(new Set());
                                            try {
                                                window.localStorage.setItem("praxis.tree.foldersExpanded", "[]");
                                            } catch { /* ignore */
                                            }
                                        }}
                                        className="gap-2 cursor-pointer"
                                        title="Collapse every expanded subfolder in the tree"
                                    >
                                        <ChevronDown className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span>Collapse Subfolders</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => {
                                            setExpandedFolders(new Set());
                                            setExpanded(new Set());
                                            try {
                                                window.localStorage.setItem("praxis.tree.foldersExpanded", "[]");
                                                window.localStorage.setItem(TREE_EXPANDED_KEY, "[]");
                                            } catch { /* ignore */
                                            }
                                        }}
                                        className="gap-2 cursor-pointer"
                                        title="Collapse every top-level folder AND every subfolder in the tree"
                                    >
                                        <ChevronsDown className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span>Collapse All Folders</span>
                                    </ContextMenuItem>
                                </ContextMenuSubContent>
                            </ContextMenuSub>
                        </ContextMenuContent>
                    </ContextMenu>
                </div>
                {/* Horizontal scrollbar — renders when any file name is
            wider than the sidebar (e.g. long capstone names). */}
                <ScrollBar orientation="horizontal"/>
            </ScrollArea>

            {/* Footer — total counts */}
            <div
                className="px-3 py-1.5 border-t bg-muted/20 text-[10px] text-muted-foreground flex items-center justify-between shrink-0">
        <span>
          {folders.length} folder{folders.length === 1 ? "" : "s"}
        </span>
                <span>
          {folders.reduce((n, c) => n + c.files.length, 0)} script
                    {folders.reduce((n, c) => n + c.files.length, 0) === 1 ? "" : "s"}
        </span>
            </div>

            {/* ─── Create-project dialog ────────────────────────────────────
Shown when the user picks "Create new empty project…" from the
File menu. Prompts for a name, validates it client-side, then
calls /api/projects/create which makes the directory and
switches the active project to it. */}
            <Dialog open={showCreateProject} onOpenChange={(o) => {
                setShowCreateProject(o);
                if (!o) setNewProjectName("");
            }}>
                {/* widened to sm:max-w-lg; every long row
            (location input + Browse…, path preview, footer) now
            wraps/shrinks so nothing overflows the dialog width. */}
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderPlus className="size-4 text-emerald-500"/>
                            Create New Empty Project
                        </DialogTitle>
                        <DialogDescription>
                            Creates a new project directory — pick its NAME and its LOCATION (the default is the app's
                            projects folder; Browse… picks anywhere on disk) — and switches the active project to it.
                            The directory must not already exist.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="new-project-name">
                            Project name
                        </label>
                        <Input
                            id="new-project-name"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="my-new-project"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !creatingProject && newProjectName.trim()) {
                                    e.preventDefault();
                                    void handleCreateProject();
                                }
                            }}
                            className="font-mono text-sm"
                            disabled={creatingProject}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Allowed: letters, digits, spaces, underscores, hyphens. 1–64 chars. Reserved names
                            (node_modules, src, public, etc.) are rejected.
                        </p>
                        {/* WHERE to create the project — prefilled with the
                default projects root, editable, with a server-side
                directory browser. */}
                        <label className="text-xs font-medium text-muted-foreground" htmlFor="new-project-location">
                            Location (parent folder)
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Input
                                id="new-project-location"
                                value={newProjectParent}
                                onChange={(e) => setNewProjectParent(e.target.value)}
                                placeholder="/path/to/projects (default: the app's projects folder)"
                                className="font-mono text-xs min-w-[200px] flex-1"
                                disabled={creatingProject}
                                spellCheck={false}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 shrink-0 gap-1.5 text-xs"
                                onClick={() => void browseProjectParent(newProjectParent.trim() || undefined)}
                                disabled={creatingProject}
                                title="Browse the filesystem for the parent folder"
                            >
                                <FolderSearch className="size-3.5"/> Browse…
                            </Button>
                        </div>
                        {newProjectParent.trim() && (
                            <p className="text-[10px] text-muted-foreground"
                               title={`${newProjectParent.trim()}/${newProjectName.trim() || "<name>"}`}>
                                The project will be created at{" "}
                                <span
                                    className="break-all font-mono">{newProjectParent.trim()}/{newProjectName.trim() || "<name>"}</span>
                            </p>
                        )}
                        {/* Directory browser */}
                        {projectBrowse?.open && (
                            <div className="rounded-md border max-h-56 overflow-y-auto">
                                <div
                                    className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30 sticky top-0">
                  <span className="text-[10px] font-mono truncate flex-1" title={projectBrowse.path}>
                    {projectBrowse.path || "…"}
                  </span>
                                    {projectBrowse.parent && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-1.5 text-[10px] gap-1 shrink-0"
                                            onClick={() => void browseProjectParent(projectBrowse.parent ?? undefined)}
                                            title="Up one level"
                                        >
                                            <ArrowUp className="size-3"/> Up
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] shrink-0"
                                        onClick={() => {
                                            setNewProjectParent(projectBrowse.path);
                                            setProjectBrowse(null);
                                        }}
                                        title="Create the project in this folder"
                                    >
                                        Choose This Folder
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1.5 text-[10px] shrink-0"
                                        onClick={() => setProjectBrowse(null)}
                                        title="Close the browser"
                                    >
                                        <X className="size-3"/>
                                    </Button>
                                </div>
                                {projectBrowse.loading ? (
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground p-2">
                                        <Loader2 className="size-3 animate-spin"/> Reading…
                                    </div>
                                ) : projectBrowse.dirs.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground p-2">No sub-folders here.</p>
                                ) : (
                                    projectBrowse.dirs.map((d) => (
                                        <button
                                            key={d.path}
                                            type="button"
                                            className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-left hover:bg-muted/60"
                                            onClick={() => void browseProjectParent(d.path)}
                                            title={d.path}
                                        >
                                            <BookOpen className="size-3 text-emerald-500 shrink-0"/>
                                            <span className="truncate">{d.name}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 flex-wrap">
                        <Button variant="ghost" onClick={() => {
                            setShowCreateProject(false);
                            setNewProjectName("");
                            setNewProjectParent("");
                            setProjectBrowse(null);
                        }} disabled={creatingProject} className="sm:mr-auto">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateProject}
                            disabled={creatingProject || !newProjectName.trim()}
                            className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                            {creatingProject ? (
                                <>
                                    <RefreshCw className="size-3.5 animate-spin"/>
                                    Creating…
                                </>
                            ) : (
                                <>
                                    <FolderPlus className="size-3.5"/>
                                    Create Project
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── File-import conflict dialog ──────────────────────────────
Shown when the user drops files onto a folder row AND some
of those files already exist on disk. The dialog lists the
conflicts and offers four choices:
Overwrite all: replace every conflicting file
Skip all: keep the existing files, import only the new ones
Cancel: abort the whole import (the dry-run's
non-conflicting files ARE already on disk)
Non-conflicting files were already imported in the dry-run;
they're listed under "Will be imported" so the user sees them. */}
            <Dialog
                open={!!pendingImport && !!conflictResult}
                onOpenChange={(o) => {
                    if (!o) {
                        setPendingImport(null);
                        setConflictResult(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="size-4 text-amber-500"/>
                            File Conflicts
                        </DialogTitle>
                        <DialogDescription>
                            {conflictResult?.skipped.length ?? 0} file{(conflictResult?.skipped.length ?? 0) === 1 ? "" : "s"} already
                            exist{(conflictResult?.skipped.length ?? 0) === 1 ? "s" : ""} in {pendingImport?.folderName ?? "this folder"}.
                            Choose how to resolve.
                        </DialogDescription>
                    </DialogHeader>
                    {/* Live drop-target indicator: when the modal is open and the
user drags files over a DIFFERENT folder, show a banner
indicating that releasing the drop will switch the modal
to that folder. This addresses the user's complaint that
"moving to another folder by mouse; the modal is not
updated" — now the modal visibly reflects the new target
as soon as the user drops (and the banner tells them
ahead of time what will happen). */}
                    {dragOverFolder && pendingImport && dragOverFolder !== pendingImport.folderSlug && (
                        <div
                            className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-300 flex items-center gap-2">
                            <Upload className="size-3.5 shrink-0"/>
                            <span>
                Drop here to switch the import target to{" "}
                                <code className="font-mono font-semibold">
                  {folders.find((c) => c.slug === dragOverFolder)?.name ?? dragOverFolder}
                </code>
                . The current pending import will be replaced.
              </span>
                        </div>
                    )}
                    {/* Files in this pending import — show which folder they're
going into so the user can verify before resolving. */}
                    <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
                        Target: <code
                        className="font-mono text-foreground">{pendingImport?.folderName}</code> · {pendingImport?.files.length ?? 0} file(s)
                    </div>
                    <div className="space-y-3 max-h-[50vh] overflow-auto">
                        {/* New files — already imported in the dry-run. */}
                        {(conflictResult?.imported.length ?? 0) > 0 && (
                            <div>
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                                    <Check className="size-3 text-emerald-500"/>
                                    Will be imported ({conflictResult?.imported.length})
                                </p>
                                <ul className="space-y-0.5 text-xs font-mono">
                                    {conflictResult?.imported.map((f) => (
                                        <li key={f.path} className="flex items-center gap-1.5 text-foreground/80">
                                            <FilePlus className="size-3 text-emerald-500 shrink-0"/>
                                            <span className="truncate">{f.name}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {/* Conflicting files — exist on disk, need user choice. */}
                        <div>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                                <AlertTriangle className="size-3 text-amber-500"/>
                                Already exist ({conflictResult?.skipped.length})
                            </p>
                            <ul className="space-y-0.5 text-xs font-mono">
                                {conflictResult?.skipped.map((f) => (
                                    <li key={f.name} className="flex items-center gap-1.5 text-foreground/80">
                                        <AlertTriangle className="size-3 text-amber-500 shrink-0"/>
                                        <span className="truncate">{f.name}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 flex-wrap">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setPendingImport(null);
                                setConflictResult(null);
                            }}
                            disabled={importing}
                            title="Abort the import. Files already imported in the dry-run stay on disk."
                        >
                            <X className="size-3.5"/>
                            Cancel
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => void resolveConflicts("skip_all")}
                            disabled={importing}
                            title="Keep the existing files on disk. New files (above) are still imported."
                        >
                            Skip All
                        </Button>
                        <Button
                            onClick={() => void resolveConflicts("overwrite_all")}
                            disabled={importing}
                            className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                            title="Replace every existing file with the dropped version. New files are also imported."
                        >
                            {importing ? <RefreshCw className="size-3.5 animate-spin"/> :
                                <AlertTriangle className="size-3.5"/>}
                            Overwrite All
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Delete-file confirmation dialog ────────────────────────
Shown when the user right-clicks a file and picks "Delete…".
Confirms the irreversible action before calling
/api/file-delete. */}
            <Dialog open={!!deleteTarget} onOpenChange={(o) => {
                if (!o) setDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Trash2 className="size-4 text-red-500"/>
                            Delete File?
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete <code
                            className="font-mono text-foreground">{deleteTarget?.fileName}</code> from <code
                            className="font-mono text-foreground">{deleteTarget?.folderName}</code>. This action cannot
                            be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDeleteFile}
                            disabled={deleting}
                            className="gap-1.5 bg-red-500 hover:bg-red-600 text-white"
                            title="Permanently delete this file"
                        >
                            {deleting ? <RefreshCw className="size-3.5 animate-spin"/> : <Trash2 className="size-3.5"/>}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── multi-delete confirm dialog ─────────────── */}
            <Dialog open={!!multiDeleteTarget} onOpenChange={(o) => {
                if (!o) {
                    setMultiDeleteTarget(null);
                    setMultiSelect([]);
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Trash2 className="size-4 text-red-500"/>
                            Delete {multiDeleteTarget?.count} Files?
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete the {multiDeleteTarget?.count} selected files. This action
                            cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => {
                            setMultiDeleteTarget(null);
                            setMultiSelect([]);
                        }} disabled={multiDeleting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleMultiDelete()}
                            disabled={multiDeleting}
                            className="gap-1.5 bg-red-500 hover:bg-red-600 text-white"
                            title="Permanently delete every selected file"
                        >
                            {multiDeleting ? <RefreshCw className="size-3.5 animate-spin"/> :
                                <Trash2 className="size-3.5"/>}
                            Delete all
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── paste conflict dialog ─────────────────────
          A file with the same name already exists in the target folder:
          Overwrite (this file) / Overwrite all (rest of the batch) /
          Skip / Skip all / Cancel. */}
            <Dialog open={!!pasteConflict} onOpenChange={(o) => {
                if (!o) pasteConflict?.onResolve("cancel");
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CircleAlert className="size-4 text-amber-500"/>
                            File Already Exists
                        </DialogTitle>
                        <DialogDescription>
                            <code className="font-mono text-foreground">{pasteConflict?.fileName}</code> already exists
                            in{" "}
                            <code className="font-mono text-foreground">{pasteConflict?.folderName}</code>.
                            Overwrite it, or skip this file?
                            {pasteConflict && pasteConflict.remaining > 0 && (
                                <> {pasteConflict.remaining} more file{pasteConflict.remaining === 1 ? "" : "s"} follow
                                    in this paste.</>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 flex-wrap sm:flex-wrap">
                        <Button variant="ghost" onClick={() => pasteConflict?.onResolve("cancel")}>
                            Cancel Paste
                        </Button>
                        <Button variant="outline" onClick={() => pasteConflict?.onResolve("skip")}>
                            Skip
                        </Button>
                        {pasteConflict && pasteConflict.remaining > 0 && (
                            <Button variant="outline" onClick={() => pasteConflict?.onResolve("skipAll")}>
                                Skip All
                            </Button>
                        )}
                        <Button onClick={() => pasteConflict?.onResolve("overwrite")}
                                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
                            Overwrite
                        </Button>
                        {pasteConflict && pasteConflict.remaining > 0 && (
                            <Button onClick={() => pasteConflict?.onResolve("overwriteAll")}
                                    className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
                                Overwrite All
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── icon & color picker dialog ────────────────
Sets a custom lucide icon, icon color and/or text color for
one folder or one file. icon color and text color
are now SEPARATE sections, the palette grew to
26 swatches + an any-hex custom picker, and the icon lists
roughly doubled. the dialog was sm:max-w-md
and everything stacked vertically, so the 40 icons + two
26-swatch rows overflowed and forced an inner vertical
scrollbar. Now sm:max-w-2xl,
a 10-across icon grid, and the two color sections side by
side — the whole picker fits without scrolling on normal
screens (max-h/overflow kept as a small-viewport fallback).
Persisted in localStorage under praxis.appearance (legacy
single-color entries keep tinting both). */}
            <Dialog open={!!appearanceTarget} onOpenChange={(o) => {
                if (!o) setAppearanceTarget(null);
            }}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PaletteIcon className="size-4 text-fuchsia-500"/>
                            Icon &amp; Color
                        </DialogTitle>
                        <DialogDescription>
                            {(() => {
                                const bulk = appearanceTarget?.bulkKeys;
                                if (bulk && bulk.length > 0) {
                                    return (
                                        <>
                                            Pick ONE icon, icon color and text color and apply them to
                                            all {bulk.length} selected files
                                            (each field optional — clear means default). The first selected file
                                            previews the picks.
                                        </>
                                    );
                                }
                                return (
                                    <>
                                        Customize how <code
                                        className="font-mono text-foreground">{appearanceTarget?.name}</code> appears in
                                        the explorer — pick an icon, an icon color and a text color (each optional).
                                        Resets to the default look when everything is cleared.
                                    </>
                                );
                            })()}
                        </DialogDescription>
                    </DialogHeader>
                    {appearanceTarget && (() => {
                        const isFolder = appearanceTarget.kind === "folder";
                        const choices = isFolder ? FOLDER_ICON_CHOICES : FILE_ICON_CHOICES;
                        // bulk mode — the picks apply to EVERY key; the
                        // FIRST key's current entry is the display/reference state
                        // (its "already set" value decides whether a click sets or
                        // clears, exactly like the single-item toggle).
                        const applyKeys = appearanceTarget.bulkKeys ?? [appearanceTarget.key];
                        const current = isFolder
                            ? appearance.folders?.[applyKeys[0]]
                            : appearance.files?.[applyKeys[0]];
                        const PreviewIcon = appearanceIcon(current?.icon, choices) ?? (isFolder ? BookOpen : fileKindIcon(undefined));
                        const effIcon = appearanceIconColor(current);
                        const effText = appearanceTextColor(current);
                        /** helper — write one field of the entry and prune
                         * it entirely when nothing is set anymore. in
                         *  bulk mode the same mutation lands on EVERY selected
                         *  key (each keeps its own entry; the value is decided from
                         *  the reference entry above so the click's set/clear is
                         *  deterministic for the whole batch). */
                        const patchEntry = (mutate: (entry: AppearanceEntry) => void) => {
                            setAppearance((prev) => {
                                const next: AppearanceMap = JSON.parse(JSON.stringify(prev));
                                const bucket = isFolder ? (next.folders ?? {}) : (next.files ?? {});
                                for (const k of applyKeys) {
                                    const entry: AppearanceEntry = {...(bucket[k] ?? {})};
                                    mutate(entry);
                                    if (
                                        entry.icon === undefined &&
                                        entry.color === undefined &&
                                        entry.iconColor === undefined &&
                                        entry.textColor === undefined
                                    ) {
                                        delete bucket[k];
                                    } else {
                                        bucket[k] = entry;
                                    }
                                }
                                if (isFolder) next.folders = bucket;
                                else next.files = bucket;
                                saveAppearance(next);
                                return next;
                            });
                        };
                        /** One swatch row: palette + custom color picker + clear. */
                        const colorSection = (
                            field: "iconColor" | "textColor",
                            heading: string,
                            activeValue: string | undefined
                        ) => (
                            <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-2">
                                    {heading}
                                    {activeValue && (
                                        <span
                                            className="font-mono normal-case tracking-normal text-[10px] text-muted-foreground/80">{activeValue}</span>
                                    )}
                                </h4>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                    {APPEARANCE_COLORS.map((c) => (
                                        <button
                                            key={`${field}-${c.hex}`}
                                            type="button"
                                            onClick={() => patchEntry((entry) => {
                                                entry[field] = current?.[field] === c.hex ? undefined : c.hex;
                                            })}
                                            title={`${c.label} (${c.hex}) — click again to clear`}
                                            aria-label={`${heading}: ${c.label}`}
                                            aria-pressed={activeValue === c.hex}
                                            className={cn(
                                                "size-6 rounded-full border shadow-sm transition-transform hover:scale-110",
                                                activeValue === c.hex && "ring-2 ring-offset-2 ring-offset-background"
                                            )}
                                            style={{
                                                backgroundColor: c.hex,
                                                ["--tw-ring-color" as string]: c.hex
                                            } as React.CSSProperties}
                                        />
                                    ))}
                                    {/* Custom any-hex picker — the native color input covers every
color the 26 swatches miss. */}
                                    <label
                                        className={cn(
                                            "size-6 rounded-full border shadow-sm cursor-pointer overflow-hidden transition-transform hover:scale-110 inline-flex items-center justify-center bg-muted/40 text-muted-foreground",
                                            activeValue && !APPEARANCE_COLORS.some((c) => c.hex === activeValue) && "ring-2 ring-offset-2 ring-offset-background"
                                        )}
                                        title="Custom color — pick any hex value"
                                        aria-label={`${heading}: custom color`}
                                    >
                                        <Plus className="size-3 pointer-events-none"/>
                                        <input
                                            type="color"
                                            value={activeValue && /^#[0-9a-fA-F]{6}$/.test(activeValue) ? activeValue : "#71717a"}
                                            onChange={(e) => patchEntry((entry) => {
                                                entry[field] = e.target.value;
                                            })}
                                            className="sr-only"
                                        />
                                    </label>
                                    {activeValue && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-[10px] text-muted-foreground"
                                            onClick={() => patchEntry((entry) => {
                                                entry[field] = undefined;
                                            })}
                                            title="Clear this color (back to default)"
                                        >
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                        return (
                            <div className="space-y-4 py-1">
                                <div
                                    className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/30">
                                    <PreviewIcon className="size-4 shrink-0"
                                                 style={effIcon ? {color: effIcon} : undefined}/>
                                    <span className="truncate" style={effText ? {color: effText} : undefined}>
                    {appearanceTarget.name}
                  </span>
                                    {applyKeys.length > 1 && (
                                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                                            ×{applyKeys.length}
                                        </Badge>
                                    )}
                                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">preview</span>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Icon</h4>
                                    {/* 10 columns in the wider dialog — the
                      40-icon list now takes 4 rows instead of 5×8. */}
                                    <div className="grid grid-cols-10 gap-1.5">
                                        {choices.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => patchEntry((entry) => {
                                                    // Clicking the current icon clears it (default).
                                                    // the reference is the first selected
                                                    // entry — the whole batch flips together.
                                                    entry.icon = current?.icon === c.id ? undefined : c.id;
                                                })}
                                                title={c.label}
                                                aria-label={c.label}
                                                aria-pressed={current?.icon === c.id}
                                                className={cn(
                                                    "flex items-center justify-center rounded-md border h-9 transition-colors",
                                                    current?.icon === c.id
                                                        ? "ring-2 ring-fuchsia-500 border-transparent"
                                                        : "hover:bg-accent/40"
                                                )}
                                            >
                                                <c.Icon className="size-4"/>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* the two color pickers sit SIDE BY SIDE
                    in the wider dialog (each ~half width) — cuts ~80px of
                    stacked height so the dialog needs no inner scrollbar. */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-4 items-start">
                                    {colorSection("iconColor", "Icon color", current?.iconColor)}
                                    {colorSection("textColor", "Text color", current?.textColor)}
                                </div>
                            </div>
                        );
                    })()}
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (!appearanceTarget) return;
                                setAppearance((prev) => {
                                    const next: AppearanceMap = JSON.parse(JSON.stringify(prev));
                                    // bulk mode resets EVERY selected key.
                                    const applyKeys = appearanceTarget.bulkKeys ?? [appearanceTarget.key];
                                    if (appearanceTarget.kind === "folder") {
                                        for (const k of applyKeys) delete next.folders?.[k];
                                    } else {
                                        for (const k of applyKeys) delete next.files?.[k];
                                    }
                                    saveAppearance(next);
                                    return next;
                                });
                            }}
                            title="Clear the icon and both colors for this item"
                        >
                            Reset To Default
                        </Button>
                        <Button onClick={() => setAppearanceTarget(null)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── folder issues summary dialog ──────────────
          Aggregate lint report for every Python file in a folder, with
          per-rule totals and per-file issue lists. Download as .md or
          save IssuesReport.md INTO the folder. */}
            <Dialog open={!!folderLint} onOpenChange={(o) => {
                if (!o) setFolderLint(null);
            }}>
                <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileWarning className="size-4 text-amber-500"/>
                            Issues Summary — {folderLint?.folderName}
                        </DialogTitle>
                        <DialogDescription>
                            {/* "linter: none" confused users ("is none means
bad thing?"). It is NOT a verdict on the code — it
means no linter is installed in the selected
environment, so nothing was checked. Say exactly that,
and only show "(linter: …)" when one actually ran. */}
                            {folderLint?.data?.linter === "none"
                                ? "No linter is installed in the selected Python environment, so the folder was not checked — this is not a problem with your files. Install ruff below to enable issue reports."
                                : folderLint?.data
                                    ? `Unused imports, unused variables and other lint findings across the folder's Python files (linter: ${folderLint.data.linter}).`
                                    : "Unused imports, unused variables and other lint findings across the folder's Python files."}
                        </DialogDescription>
                    </DialogHeader>
                    {folderLint?.loading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                            <Loader2 className="size-4 animate-spin"/>
                            Linting every Python file in the folder…
                        </div>
                    )}
                    {/* when no linter ran, show a friendly notice + the
              Install button INSTEAD of a wall of zeroes. */}
                    {folderLint?.data?.linter === "none" && (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-2">
                            <p className="text-xs text-foreground/80 flex items-start gap-2">
                                <FileWarning className="size-3.5 text-amber-500 shrink-0 mt-0.5"/>
                                <span>
                  {folderLint.data.hint ?? "Install ruff to generate issue reports."}{" "}
                                    <span className="text-muted-foreground">
                    Runs <code className="font-mono">pip install ruff</code> in the
                    environment selected in Settings → Python
                                        {pythonInterpreter ? "" : " (currently auto-detected)"}.
                  </span>
                </span>
                            </p>
                            <Button
                                onClick={() => void handleInstallRuff()}
                                disabled={!!installingPkg}
                                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                                title="Install ruff into the selected Python environment (pip install ruff)"
                            >
                                {installingPkg ? (
                                    <Loader2 className="size-3.5 animate-spin"/>
                                ) : (
                                    <Package className="size-3.5"/>
                                )}
                                {installingPkg ? "Installing ruff…" : "Install ruff"}
                            </Button>
                        </div>
                    )}
                    {folderLint?.data && folderLint.data.linter !== "none" && (
                        <div className="space-y-3">
                            {folderLint.data.hint && (
                                <p className="text-xs text-muted-foreground">{folderLint.data.hint}</p>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="border rounded-md px-3 py-2 text-center">
                                    <p className="text-lg font-semibold tabular-nums">{folderLint.data.totals.issues}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">issues</p>
                                </div>
                                <div className="border rounded-md px-3 py-2 text-center">
                                    <p className="text-lg font-semibold tabular-nums">{folderLint.data.totals.filesWithIssues}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">files
                                        affected</p>
                                </div>
                                <div className="border rounded-md px-3 py-2 text-center">
                                    <p className="text-lg font-semibold tabular-nums">{folderLint.data.totals.files}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">files
                                        checked</p>
                                </div>
                            </div>
                            {Object.keys(folderLint.data.totals.byRule).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(folderLint.data.totals.byRule)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([code, count]) => (
                                            <Badge key={code} variant="secondary"
                                                   className="text-[10px] font-mono gap-1">
                                                {code}
                                                <span className="text-muted-foreground">×{count}</span>
                                            </Badge>
                                        ))}
                                </div>
                            )}
                            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                                {folderLint.data.files
                                    .filter((f) => f.issues.length > 0)
                                    .map((f) => (
                                        <div key={f.file} className="px-3 py-2">
                                            <p className="text-xs font-mono font-medium truncate"
                                               title={f.file}>{f.file}</p>
                                            <ul className="mt-1 space-y-0.5">
                                                {f.issues.slice(0, 12).map((i, idx) => (
                                                    <li key={idx}
                                                        className="text-[11px] text-muted-foreground flex gap-1.5">
                                                        <span className="font-mono shrink-0">L{i.line}:{i.col}</span>
                                                        <span
                                                            className="font-mono shrink-0 text-amber-600 dark:text-amber-400">{i.code}</span>
                                                        <span className="truncate" title={i.message}>{i.message}</span>
                                                    </li>
                                                ))}
                                                {f.issues.length > 12 && (
                                                    <li className="text-[11px] text-muted-foreground italic">+{f.issues.length - 12} more…</li>
                                                )}
                                            </ul>
                                        </div>
                                    ))}
                                {folderLint.data.totals.issues === 0 && (
                                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                                        No issues found — the folder is clean. 🎉
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setFolderLint(null)}>Close</Button>
                        <Button
                            variant="outline"
                            onClick={handleDownloadFolderLint}
                            disabled={!folderLint?.data}
                            className="gap-1.5"
                            title="Download the report as a Markdown file"
                        >
                            <Download className="size-3.5"/>
                            Download .md
                        </Button>
                        <Button
                            onClick={() => void handleSaveFolderLint()}
                            disabled={!folderLint?.data}
                            className="gap-1.5"
                            title="Save IssuesReport.md inside this folder"
                        >
                            <Save className="size-3.5"/>
                            Save In Folder
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Rename-file dialog ─────────────────────────────────────
Shown when the user right-clicks a file and picks "Rename…".
Pre-fills the current name; the user edits it and presses
Enter (or clicks Rename) to call /api/file-rename. */}
            <Dialog open={!!renameTarget} onOpenChange={(o) => {
                if (!o) setRenameTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="size-4 text-sky-500"/>
                            Rename File
                        </DialogTitle>
                        <DialogDescription>
                            Enter a new name for <code
                            className="font-mono text-foreground">{renameTarget?.fileName}</code> in <code
                            className="font-mono text-foreground">{renameTarget?.folderName}</code>. The file stays in
                            the same folder.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !renaming && renameValue.trim()) {
                                    e.preventDefault();
                                    void handleRenameFile();
                                }
                            }}
                            className="font-mono text-sm"
                            disabled={renaming}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Must be a valid filename (1–200 chars, end with an extension). A file with this name must
                            not already exist in the same folder.
                        </p>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setRenameTarget(null)} disabled={renaming}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRenameFile}
                            disabled={renaming || !renameValue.trim() || renameValue.trim() === renameTarget?.fileName}
                            className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white"
                            title="Rename the file"
                        >
                            {renaming ? <RefreshCw className="size-3.5 animate-spin"/> : <Pencil className="size-3.5"/>}
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── File Properties dialog ────────────────────────────────
          Shows the file's metadata: name, size, type, extension,
          modification time, relative path, description (from
          docstring), tags. Read-only — for editing, use Rename /
          Delete / the inline editor. */}
            <Dialog open={!!propertiesTarget} onOpenChange={(o) => {
                if (!o) setPropertiesTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="size-4 text-muted-foreground"/>
                            File Properties
                        </DialogTitle>
                        <DialogDescription>
                            Metadata for <code
                            className="font-mono text-foreground">{propertiesTarget?.fileName}</code> in <code
                            className="font-mono text-foreground">{propertiesTarget?.folderName}</code>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5 py-2 text-xs">
                        {/* Name */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</div>
                                <div className="font-mono text-foreground break-all">{propertiesTarget?.fileName}</div>
                            </div>
                        </div>
                        {/* Size */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <HardDrive className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Size</div>
                                <div className="font-mono text-foreground tabular-nums">
                                    {formatFileSize(propertiesTarget?.size ?? 0)}
                                    <span
                                        className="text-muted-foreground ml-2">({(propertiesTarget?.size ?? 0).toLocaleString()} bytes)</span>
                                </div>
                            </div>
                        </div>
                        {/* Type + Extension */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <Tag className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</div>
                                <div className="text-foreground capitalize">
                                    {propertiesTarget?.kind ?? "unknown"}
                                    <span
                                        className="text-muted-foreground ml-2 font-mono">{propertiesTarget?.ext ?? ""}</span>
                                </div>
                            </div>
                        </div>
                        {/* Modified */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <Calendar className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Modified
                                </div>
                                <div
                                    className="font-mono text-foreground tabular-nums">{formatMtime(propertiesTarget?.mtime)}</div>
                            </div>
                        </div>
                        {/* Path */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <FolderOpen className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Path</div>
                                <div
                                    className="font-mono text-foreground break-all">{propertiesTarget?.folderName}/{propertiesTarget?.fileName}</div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 text-[10px] shrink-0"
                                title="Copy the file's relative path to the clipboard"
                                onClick={() => void handleCopyPath(propertiesTarget?.folderName ?? "", propertiesTarget?.fileName ?? "")}
                            >
                                <ClipboardCopy className="size-3"/>
                                Copy
                            </Button>
                        </div>
                        {/* Description (from docstring) */}
                        {propertiesTarget?.description && (
                            <div className="flex items-start gap-3 py-1.5 border-b">
                                <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                <div className="min-w-0 flex-1">
                                    <div
                                        className="text-[10px] uppercase tracking-wide text-muted-foreground">Description
                                    </div>
                                    <div className="text-foreground/80">{propertiesTarget.description}</div>
                                </div>
                            </div>
                        )}
                        {/* Tags */}
                        {propertiesTarget?.tags && propertiesTarget.tags.length > 0 && (
                            <div className="flex items-start gap-3 py-1.5">
                                <Tag className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tags
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {propertiesTarget.tags.map((t) => (
                                            <Badge key={t} variant="secondary"
                                                   className="text-[10px] font-mono">#{t}</Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Enhanced stats from /api/file-stats — fetched on dialog open. */}
                        {loadingFileStats && (
                            <div className="flex items-center gap-2 py-2 text-[10px] text-muted-foreground">
                                <RefreshCw className="size-3 animate-spin"/>
                                Loading detailed stats…
                            </div>
                        )}
                        {fileStats && !loadingFileStats && (
                            <>
                                {fileStats.birthtime != null && (
                                    <div className="flex items-start gap-3 py-1.5 border-b">
                                        <Clock className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className="text-[10px] uppercase tracking-wide text-muted-foreground">Created
                                            </div>
                                            <div
                                                className="font-mono text-foreground tabular-nums">{formatMtime(fileStats.birthtime)}</div>
                                        </div>
                                    </div>
                                )}
                                {!fileStats.isBinary && (
                                    <>
                                        <div className="flex items-start gap-3 py-1.5 border-b">
                                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                            <div className="min-w-0 flex-1">
                                                <div
                                                    className="text-[10px] uppercase tracking-wide text-muted-foreground">Lines
                                                </div>
                                                <div
                                                    className="font-mono text-foreground tabular-nums">{fileStats.lineCount.toLocaleString()}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 py-1.5 border-b">
                                            <FileSearch className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                            <div className="min-w-0 flex-1">
                                                <div
                                                    className="text-[10px] uppercase tracking-wide text-muted-foreground">Words
                                                    / Chars
                                                </div>
                                                <div className="font-mono text-foreground tabular-nums">
                                                    {fileStats.wordCount.toLocaleString()} <span
                                                    className="text-muted-foreground">/</span> {fileStats.charCount.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {fileStats.isBinary && (
                                    <div className="flex items-start gap-3 py-1.5 border-b">
                                        <FileType2 className="size-3.5 text-amber-500 shrink-0 mt-0.5"/>
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className="text-[10px] uppercase tracking-wide text-muted-foreground">Encoding
                                            </div>
                                            <div className="text-foreground">Binary file (text stats unavailable)</div>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-start gap-3 py-1.5">
                                    <Hash className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                    <div className="min-w-0 flex-1">
                                        <div
                                            className="text-[10px] uppercase tracking-wide text-muted-foreground">SHA-256
                                            (first 16)
                                        </div>
                                        <div
                                            className="font-mono text-foreground text-[10px] break-all">{fileStats.sha256}</div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 gap-1 text-[10px] shrink-0"
                                        title="Copy the hash to the clipboard"
                                        onClick={() => void navigator.clipboard.writeText(fileStats.sha256).then(() => toast({title: "Hash copied"}))}
                                    >
                                        <Copy className="size-3"/>
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPropertiesTarget(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Folder Delete confirmation dialog ───────────────────── */}
            <Dialog open={!!folderDeleteTarget} onOpenChange={(o) => {
                if (!o) setFolderDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Trash2 className="size-4 text-red-500"/>
                            Delete folder?
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete <code
                            className="font-mono text-foreground">{folderDeleteTarget?.sub ? `${folderDeleteTarget.folderName}/${folderDeleteTarget.sub}` : folderDeleteTarget?.folderName}</code> and
                            ALL files inside it. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setFolderDeleteTarget(null)} disabled={deletingFolder}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDeleteFolder}
                            disabled={deletingFolder}
                            className="gap-1.5 bg-red-500 hover:bg-red-600 text-white"
                            title="Permanently delete this folder and all its contents"
                        >
                            {deletingFolder ? <RefreshCw className="size-3.5 animate-spin"/> :
                                <Trash2 className="size-3.5"/>}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Folder Rename dialog ─────────────────────────────────── */}
            <Dialog open={!!folderRenameTarget} onOpenChange={(o) => {
                if (!o) setFolderRenameTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="size-4 text-sky-500"/>
                            Rename Folder
                        </DialogTitle>
                        <DialogDescription>
                            Enter a new name for <code
                            className="font-mono text-foreground">{folderRenameTarget?.sub ? `${folderRenameTarget.folderName}/${folderRenameTarget.sub}` : folderRenameTarget?.folderName}</code>.
                            All files inside stay.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Input
                            value={folderRenameValue}
                            onChange={(e) => setFolderRenameValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !renamingFolder && folderRenameValue.trim()) {
                                    e.preventDefault();
                                    void handleRenameFolder();
                                }
                            }}
                            className="font-mono text-sm"
                            disabled={renamingFolder}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Must be 1–64 chars, letters/digits/spaces/underscores/hyphens. A folder with this name must
                            not already exist.
                        </p>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setFolderRenameTarget(null)} disabled={renamingFolder}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRenameFolder}
                            disabled={renamingFolder || !folderRenameValue.trim() || folderRenameValue.trim() === (folderRenameTarget?.sub ? folderRenameTarget.sub.split("/").pop() : folderRenameTarget?.folderName)}
                            className="gap-1.5 bg-sky-500 hover:bg-sky-600 text-white"
                            title="Rename the folder"
                        >
                            {renamingFolder ? <RefreshCw className="size-3.5 animate-spin"/> :
                                <Pencil className="size-3.5"/>}
                            Rename
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Folder Properties dialog ──────────────────────────────
          Shows the folder's metadata: name, file count, total size,
          modification/creation time, README presence, largest file,
          newest file, tags. Read-only. */}
            <Dialog open={!!folderPropertiesTarget} onOpenChange={(o) => {
                if (!o) setFolderPropertiesTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="size-4 text-muted-foreground"/>
                            Folder Properties
                        </DialogTitle>
                        <DialogDescription>
                            Metadata for <code
                            className="font-mono text-foreground">{folderPropertiesTarget?.folderName}</code>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5 py-2 text-xs">
                        {/* Name */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <Folder className="size-3.5 text-emerald-500 shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</div>
                                <div
                                    className="font-mono text-foreground break-all">{folderPropertiesTarget?.folderName}</div>
                            </div>
                        </div>
                        {/* File count (from in-memory data — instant) */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Files
                                    (in-memory)
                                </div>
                                <div className="font-mono text-foreground tabular-nums">
                                    {folderPropertiesTarget?.fileCount ?? 0}
                                    {folderPropertiesTarget?.isEmpty &&
                                      <span className="text-amber-500 ml-2">(empty folder)</span>}
                                </div>
                            </div>
                        </div>
                        {/* README */}
                        <div className="flex items-start gap-3 py-1.5 border-b">
                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">README</div>
                                <div className="text-foreground">
                                    {folderPropertiesTarget?.hasReadme ? "Yes" : "No"}
                                </div>
                            </div>
                        </div>
                        {/* Tags (in-memory) */}
                        {folderPropertiesTarget && folderPropertiesTarget.tags.length > 0 && (
                            <div className="flex items-start gap-3 py-1.5 border-b">
                                <Tag className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tags
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {folderPropertiesTarget.tags.map((t) => (
                                            <Badge key={t} variant="secondary"
                                                   className="text-[10px] font-mono">#{t}</Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Enhanced stats from /api/folder-stats */}
                        {loadingFolderStats && (
                            <div className="flex items-center gap-2 py-2 text-[10px] text-muted-foreground">
                                <RefreshCw className="size-3 animate-spin"/>
                                Loading detailed stats…
                            </div>
                        )}
                        {folderStats && !loadingFolderStats && (
                            <>
                                <div className="flex items-start gap-3 py-1.5 border-b">
                                    <HardDrive className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total
                                            size
                                        </div>
                                        <div className="font-mono text-foreground tabular-nums">
                                            {formatFileSize(folderStats.totalSize)}
                                            <span
                                                className="text-muted-foreground ml-2">({folderStats.totalSize.toLocaleString()} bytes)</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 py-1.5 border-b">
                                    <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">File
                                            breakdown
                                        </div>
                                        <div className="font-mono text-foreground tabular-nums">
                                            {folderStats.pythonFileCount} Python
                                            <span className="text-muted-foreground mx-1">·</span>
                                            {folderStats.dataFileCount} data
                                            <span className="text-muted-foreground mx-1">·</span>
                                            {folderStats.fileCount} total
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 py-1.5 border-b">
                                    <Calendar className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                    <div className="min-w-0 flex-1">
                                        <div
                                            className="text-[10px] uppercase tracking-wide text-muted-foreground">Modified
                                        </div>
                                        <div
                                            className="font-mono text-foreground tabular-nums">{formatMtime(folderStats.mtime)}</div>
                                    </div>
                                </div>
                                {folderStats.birthtime != null && (
                                    <div className="flex items-start gap-3 py-1.5 border-b">
                                        <Clock className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className="text-[10px] uppercase tracking-wide text-muted-foreground">Created
                                            </div>
                                            <div
                                                className="font-mono text-foreground tabular-nums">{formatMtime(folderStats.birthtime)}</div>
                                        </div>
                                    </div>
                                )}
                                {folderStats.largestFile && (
                                    <div className="flex items-start gap-3 py-1.5 border-b">
                                        <HardDrive className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className="text-[10px] uppercase tracking-wide text-muted-foreground">Largest
                                                file
                                            </div>
                                            <div className="font-mono text-foreground break-all">
                                                {folderStats.largestFile.name}
                                                <span
                                                    className="text-muted-foreground ml-2">({formatFileSize(folderStats.largestFile.size)})</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {folderStats.newestFile && (
                                    <div className="flex items-start gap-3 py-1.5">
                                        <Clock className="size-3.5 text-muted-foreground shrink-0 mt-0.5"/>
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className="text-[10px] uppercase tracking-wide text-muted-foreground">Newest
                                                file
                                            </div>
                                            <div className="font-mono text-foreground break-all">
                                                {folderStats.newestFile.name}
                                                <span
                                                    className="text-muted-foreground ml-2">({formatMtime(folderStats.newestFile.mtime)})</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setFolderPropertiesTarget(null)}>
                            Close
                        </Button>
                        {/* "Upload files" button — opens the OS file picker and
                uploads the chosen files into THIS folder (text or
                binary). Mirrors the "Upload files here…" context-menu
                item but is accessible from the Properties dialog too. */}
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (!folderPropertiesTarget) return;
                                handleUploadFilesClick(folderPropertiesTarget.folderSlug, folderPropertiesTarget.folderName);
                            }}
                            disabled={uploadingFiles}
                            className="gap-1.5"
                            title="Upload one or more files from your computer into this folder"
                        >
                            {uploadingFiles ? <RefreshCw className="size-3.5 animate-spin"/> :
                                <Upload className="size-3.5 text-cyan-500"/>}
                            Upload files
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── New-folder dialog ───────────────────────────────────────
Shown when the user clicks "New folder…" from the "+" toolbar
dropdown. Prompts for a name, validates it, then calls
/api/folder-create which makes the directory. */}
            <Dialog open={showNewFolder} onOpenChange={(o) => {
                setShowNewFolder(o);
                if (!o) {
                    setNewFolderName("");
                    setNewFolderTarget(null);
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderPlus className="size-4 text-emerald-500"/>
                            New Folder
                        </DialogTitle>
                        <DialogDescription>
                            {newFolderTarget
                                ? `Creates a new subfolder inside "${newFolderTarget.folderName}${newFolderTarget.sub ? "/" + newFolderTarget.sub : ""}". Folders can nest further.`
                                : "Creates a new empty folder folder under the active project. The folder must not already exist."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {newFolderTarget && (
                            <div
                                className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground">
                                <Folder className="size-3.5 shrink-0 text-sky-500/80"/>
                                <span className="truncate">
                  {newFolderTarget.folderName}
                                    {newFolderTarget.sub ? `/${newFolderTarget.sub}` : ""}/
                </span>
                            </div>
                        )}
                        <Input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="my-new-folder"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !creatingFolder && newFolderName.trim()) {
                                    e.preventDefault();
                                    void handleCreateFolder();
                                }
                            }}
                            className="font-mono text-sm"
                            disabled={creatingFolder}
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Allowed: letters, digits, spaces, underscores, hyphens. 1–64 chars.
                        </p>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => {
                            setShowNewFolder(false);
                            setNewFolderName("");
                            setNewFolderTarget(null);
                        }} disabled={creatingFolder}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateFolder}
                            disabled={creatingFolder || !newFolderName.trim()}
                            className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                            {creatingFolder ? (
                                <>
                                    <RefreshCw className="size-3.5 animate-spin"/>
                                    Creating…
                                </>
                            ) : (
                                <>
                                    <FolderPlus className="size-3.5"/>
                                    Create Folder
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── New-file dialog ─────────────────────────────────────────
Shown when the user clicks "New file…" from the "+" toolbar
dropdown OR "New file here…" from a folder's context menu.
Prompts for a target folder + filename, then calls
/api/file-create which writes sensible default content based
on the extension (.py → coding declaration,.md → H1, etc.). */}
            <Dialog open={showNewFile} onOpenChange={(o) => {
                setShowNewFile(o);
                if (!o) {
                    setNewFileName("");
                    setNewFileFolder("");
                    setNewFileContent(null);
                    setNewFileSub("");
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FilePlus className="size-4 text-emerald-500"/>
                            New File
                        </DialogTitle>
                        <DialogDescription>
                            {newFileContent != null
                                ? "Started from a template — its content will be written into the new file."
                                : newFileSub
                                    ? `Created inside the subfolder "${newFileSub}" of the chosen folder.`
                                    : "Creates a new empty file in the chosen folder. Default content is added based on the extension."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {newFileSub && (
                            <div
                                className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono text-muted-foreground">
                                <Folder className="size-3.5 shrink-0 text-sky-500/80"/>
                                <span className="truncate">
                  {folders.find((c) => c.slug === newFileFolder)?.name ?? "…"}/{newFileSub}/
                </span>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-file-folder">
                                Folder
                            </label>
                            <select
                                id="new-file-folder"
                                value={newFileFolder}
                                onChange={(e) => {
                                    setNewFileFolder(e.target.value);
                                    if (e.target.value !== newFileFolder) setNewFileSub("");
                                }}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                disabled={creatingFile}
                            >
                                <option value="">— Select a folder —</option>
                                {folders.map((c) => (
                                    <option key={c.slug} value={c.slug}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-file-name">
                                File name
                            </label>
                            <Input
                                id="new-file-name"
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                placeholder="new_script.py"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !creatingFile && newFileName.trim() && newFileFolder) {
                                        e.preventDefault();
                                        void handleCreateFile();
                                    }
                                }}
                                className="font-mono text-sm"
                                disabled={creatingFile}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Allowed: letters, digits, spaces, underscores, hyphens, parens, dots. Must end with an
                                extension (.py, .txt, .md, .json, .csv, …).
                            </p>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => {
                            setShowNewFile(false);
                            setNewFileName("");
                            setNewFileFolder("");
                            setNewFileSub("");
                        }} disabled={creatingFile}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateFile}
                            disabled={creatingFile || !newFileName.trim() || !newFileFolder}
                            className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                            {creatingFile ? (
                                <>
                                    <RefreshCw className="size-3.5 animate-spin"/>
                                    Creating…
                                </>
                            ) : (
                                <>
                                    <FilePlus className="size-3.5"/>
                                    Create File
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Hidden file-input for "Upload files here…" ──────────────
          Multiple files, no accept filter (we accept any type and
          detect binary vs text by extension). The input is re-used
          across folder uploads; the target folder is tracked in
          `uploadTargetFolder` state. */}
            <input
                ref={uploadFilesInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void handleUploadFilesSelected(e)}
            />

            {/* ─── hidden input for "Import.zip here…" ──────── */}
            <input
                ref={importZipInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => void handleImportZipSelected(e)}
            />

            {/* ─── "Search in folder…" dialog ───────────────────
          Scoped full-text search (/api/full-text-search?folder=…).
          Clicking a hit selects the file and dispatches
          praxis:goto-line so the editor scrolls to the match. */}
            <Dialog
                open={folderSearch != null}
                onOpenChange={(o) => {
                    if (!o) setFolderSearch(null);
                }}
            >
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileSearch className="size-4 text-sky-500"/>
                            Search In &ldquo;{folderSearch?.folderName ?? ""}&rdquo;
                        </DialogTitle>
                        <DialogDescription>
                            Full-text search across every file in this folder. Click a result to open the file at that
                            line.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleRunFolderSearch();
                        }}
                    >
                        <Input
                            id="folder-search-input"
                            value={folderSearchQuery}
                            onChange={(e) => setFolderSearchQuery(e.target.value)}
                            placeholder="Search text…"
                            autoFocus
                            className="flex-1"
                        />
                        <Button type="submit" size="sm" disabled={folderSearching || !folderSearchQuery.trim()}>
                            {folderSearching ? <Loader2 className="size-3.5 animate-spin"/> :
                                <Search className="size-3.5"/>}
                            Search
                        </Button>
                    </form>
                    <div className="max-h-[50vh] overflow-y-auto space-y-1.5">
                        {folderSearchHits == null ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">
                                {folderSearching ? "Searching…" : "Type a query and press Search (or Enter)."}
                            </p>
                        ) : folderSearchHits.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">
                                No matches in this folder.
                            </p>
                        ) : (
                            folderSearchHits.map((hit, i) => (
                                <button
                                    key={`${hit.fileSlug}-${hit.line}-${i}`}
                                    type="button"
                                    className="w-full text-left rounded-md border bg-muted/30 hover:bg-muted/60 px-2.5 py-1.5 transition-colors"
                                    onClick={() => {
                                        onSelectFile(hit.folderSlug, hit.fileSlug);
                                        window.dispatchEvent(new CustomEvent("praxis:goto-line", {detail: {line: hit.line}}));
                                        setFolderSearch(null);
                                    }}
                                    title={`Open ${hit.file} at line ${hit.line}`}
                                >
                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <FileSearch className="size-3 shrink-0"/>
                                        <span className="font-medium text-foreground truncate">{hit.file}</span>
                                        <span className="shrink-0">line {hit.line}</span>
                                    </div>
                                    <pre
                                        className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-words text-muted-foreground max-h-16 overflow-hidden">
                    {hit.snippet}
                  </pre>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ─── "Move to… / Copy to…" dialog ───────────────── */}
            <Dialog
                open={moveCopyTarget != null}
                onOpenChange={(o) => {
                    if (!o && !moveCopyBusy) setMoveCopyTarget(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {moveCopyTarget?.mode === "move" ? <Scissors className="size-4 text-sky-500"/> :
                                <Copy className="size-4 text-muted-foreground"/>}
                            {moveCopyTarget?.mode === "move" ? "Move file to…" : "Copy file to…"}
                        </DialogTitle>
                        <DialogDescription>
                            {moveCopyTarget
                                ? `${moveCopyTarget.mode === "move" ? "Moves" : "Copies"} "${moveCopyTarget.fileName}" out of its current folder. Optionally rename it at the destination.`
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor="movecopy-dest">
                                Destination folder
                            </label>
                            <select
                                id="movecopy-dest"
                                value={moveCopyTarget?.toFolder ?? ""}
                                onChange={(e) => setMoveCopyTarget((prev) => (prev ? {
                                    ...prev,
                                    toFolder: e.target.value
                                } : prev))}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                disabled={moveCopyBusy}
                            >
                                <option value="">— Select a folder —</option>
                                {folders.map((c) => (
                                    <option
                                        key={c.slug}
                                        value={c.slug}
                                        disabled={moveCopyTarget?.mode === "move" && c.slug === moveCopyTarget.folderSlug}
                                    >
                                        {c.name}
                                        {moveCopyTarget?.mode === "move" && c.slug === moveCopyTarget.folderSlug ? " (source)" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor="movecopy-name">
                                New name (optional)
                            </label>
                            <Input
                                id="movecopy-name"
                                value={moveCopyTarget?.newName ?? ""}
                                onChange={(e) => setMoveCopyTarget((prev) => (prev ? {
                                    ...prev,
                                    newName: e.target.value
                                } : prev))}
                                placeholder={moveCopyTarget?.fileName ?? "same name"}
                                disabled={moveCopyBusy}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setMoveCopyTarget(null)}
                                disabled={moveCopyBusy}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => void handleMoveCopyConfirm()}
                            disabled={moveCopyBusy || !moveCopyTarget?.toFolder}
                        >
                            {moveCopyBusy ? <Loader2 className="size-3.5 animate-spin"/> : null}
                            {moveCopyTarget?.mode === "move" ? "Move" : "Copy"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── pytest report dialog ───────────────────────── */}
            <Dialog
                open={testTarget != null}
                onOpenChange={(o) => {
                    if (!o && !testing) {
                        setTestTarget(null);
                        setTestReport(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FlaskConical className="size-4 text-emerald-500"/>
                            Pytest — {testTarget?.fileName ?? ""}
                        </DialogTitle>
                        <DialogDescription>
                            Structured test report for this file.
                        </DialogDescription>
                    </DialogHeader>
                    {testing ? (
                        <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin"/>
                            Running pytest…
                        </div>
                    ) : testReport ? (
                        <div className="space-y-3">
                            <div className="grid grid-cols-5 gap-1.5 text-center">
                                {[
                                    {label: "Total", value: testReport.total, cls: "text-foreground"},
                                    {
                                        label: "Passed",
                                        value: testReport.passed,
                                        cls: "text-emerald-600 dark:text-emerald-400"
                                    },
                                    {label: "Failed", value: testReport.failed, cls: "text-red-600 dark:text-red-400"},
                                    {
                                        label: "Errors",
                                        value: testReport.errors,
                                        cls: "text-orange-600 dark:text-orange-400"
                                    },
                                    {label: "Skipped", value: testReport.skipped, cls: "text-muted-foreground"},
                                ].map((s) => (
                                    <div key={s.label} className="rounded-md border bg-muted/30 py-1.5">
                                        <div className={`text-lg font-semibold tabular-nums ${s.cls}`}>{s.value}</div>
                                        <div
                                            className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                            {testReport.durationMs > 0 && (
                                <p className="text-[11px] text-muted-foreground text-center">
                                    Finished in {(testReport.durationMs / 1000).toFixed(2)}s
                                </p>
                            )}
                            {testReport.tests.length > 0 ? (
                                <div className="max-h-[40vh] overflow-y-auto space-y-1">
                                    {testReport.tests.map((t, i) => (
                                        <div
                                            key={`${t.name}-${i}`}
                                            className="rounded-md border px-2.5 py-1.5 flex items-start gap-2"
                                            title={t.message}
                                        >
                                            {t.status === "passed" ? (
                                                <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5"/>
                                            ) : (
                                                <CircleAlert className="size-3.5 text-red-500 shrink-0 mt-0.5"/>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-mono truncate">{t.name}</div>
                                                {t.message && (
                                                    <pre
                                                        className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-words text-muted-foreground max-h-24 overflow-y-auto">
                            {t.message}
                          </pre>
                                                )}
                                            </div>
                                            {typeof t.durationMs === "number" && (
                                                <span
                                                    className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {t.durationMs}ms
                        </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {testReport.raw
                                        ? String(testReport.raw).slice(0, 600)
                                        : "No tests were discovered in this file."}
                                </p>
                            )}
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => {
                            setTestTarget(null);
                            setTestReport(null);
                        }}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── "Run with… interpreter" dialog ─────────────── */}
            <Dialog
                open={runWithTarget != null}
                onOpenChange={(o) => {
                    if (!o) setRunWithTarget(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Play className="size-4 text-emerald-500"/>
                            Run &ldquo;{runWithTarget?.fileName ?? ""}&rdquo; with…
                        </DialogTitle>
                        <DialogDescription>
                            A one-shot Python interpreter for this run (overrides Settings → Python). Leave empty for
                            auto-detection.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={runWithInterpreter}
                        onChange={(e) => setRunWithInterpreter(e.target.value)}
                        placeholder="python3 / /usr/bin/python3 / C:\\Python312\\python.exe"
                        autoFocus
                        spellCheck={false}
                    />
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRunWithTarget(null)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleRunWithConfirm}>
                            <Play className="size-3.5"/>
                            Run
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
});
