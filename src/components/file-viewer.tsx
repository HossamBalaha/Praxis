"use client";

import * as React from "react";
import dynamic from "next/dynamic";
// edit-menu line utilities + file group icons (parity with the Python editor).
// toolbar icons for the new viewers.
// spell check — SpellCheck icon for the marked-view banner.
import {
    ArrowDown,
    ArrowDownAZ,
    ArrowDownUp,
    ArrowUp,
    BarChart3,
    BookOpen,
    Braces,
    Check,
    ChevronDown,
    ChevronUp,
    CircleAlert,
    ClipboardPaste,
    Code2,
    Columns2,
    Copy,
    CopyPlus,
    Database,
    Download,
    Eraser,
    Eye,
    FilePlus2,
    FileText,
    FileType2,
    FileWarning,
    Filter,
    FlaskConical,
    FolderOpen,
    Hash,
    History,
    ListTree,
    Loader2,
    Lock,
    Merge,
    MessageSquare,
    Palette,
    Pencil,
    PencilLine,
    Play,
    Redo2,
    Regex,
    Save,
    Scissors,
    Search,
    ShieldCheck,
    Shuffle,
    Sparkles,
    SpellCheck,
    SquarePlus,
    Table2,
    TextSelect,
    Trash2,
    Type,
    Undo2,
    Wand2,
    Workflow,
    WrapText,
    X,
    ZoomIn,
    ZoomOut
} from "lucide-react";
// light Prism build — only json/yaml/toml are
// highlighted here; "text" passes language={undefined} so no grammar
// is needed.
import {SyntaxHighlighter} from "@/lib/highlighter";
// The SHARED 24-theme registry + praxis.code-theme key — the same
// list the Python editor's bar drives (lib/code-themes). The source
// view resolves through it too, so a pick in either bar restyles
// both viewers.
import {CODE_THEMES, codeBgFor, loadCodeTheme, resolveCodeThemeEntry, saveCodeTheme} from "@/lib/code-themes";
// math rendering for markdown files (README.md etc.) —
// $…$ inline and $$…$$ display blocks render via KaTeX, like
// Obsidian/GitHub. remark-math tokenizes, rehype-katex renders.
import {NotebookView} from "@/components/notebook-view";
import {DbFileViewer, SchemaDiagram, type TableInfo} from "@/components/sqlite-workbench";
// PERF: BUNDLE SPLIT — the per-kind studios/tools (archive, markdown
// studio, JSON inspector, CSV grid, image toolbox, media/audio/PDF)
// total ~7,200 lines that used to ship in the FIRST JS chunk even
// though a visitor typically opens none of them on load. Each is now
// a next/dynamic import loaded on FIRST RENDER of its file kind (the
// loading fallbacks are the kind-aware skeletons). isArchiveFileName
// is a tiny pure helper — importing it statically from the module
// would drag the whole component in, so it re-exports via a
// side-effect-free path below.
import {isArchiveFileName} from "@/lib/archive-match";
import {MinimapColumn} from "@/components/minimap-column";
//.xlsx /.xls /.parquet /
// .feather files open from the file tree into the same pandas-backed
// table the DataFileBrowser uses (/api/data-sheet).
import {CsvTableView, SheetDataView} from "@/components/data-file-browser";
// GitHub-grade markdown renderer — shared with notebook cells + chat.
import {MarkdownGithub} from "@/components/markdown-github";
// the ONE shared formatter engine + registry (edit / view / save /
// explorer right-click all route through it).
import {formatAnySource} from "@/lib/format-any";
// generic line utilities — Edit ▸ Lines parity with the Python editor.
import {
    commentTokenFor,
    deleteLines,
    duplicateLines,
    joinLines,
    moveLines,
    reorderLines,
    toggleComment,
    trimTrailingWhitespaceAll,
} from "@/lib/line-ops";
import {formattableKindFor} from "@/lib/formattable-kinds";
// the ONE data-driven right-click group renderer — both menus below
// route through it (lib/context-menu-spec.ts gates by file kind).
import {MenuGroups, MenuHeader} from "@/components/context-menu-groups";
import {capabilitiesForKind} from "@/lib/file-capabilities";
// one-click "pip install <module>" button — renders next to any
// ModuleNotFoundError surfaced by the config-validation banner.
import {missingModuleFrom, PipInstallButton} from "@/components/pip-install-button";
import {EnvEditor} from "@/components/env-editor";
import {LogViewer} from "@/components/log-viewer";
import {isFileLocked} from "@/lib/workspace-files";
import {getNamingStyles, interpreterQuery, loadSettings} from "@/lib/settings";
import {useTheme} from "next-themes";
import {useToast} from "@/hooks/use-toast";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
// FILE-OPEN SPEED: reuse the click-time prefetched promise (same URL)
// instead of issuing a duplicate /api/file request.
import {fileUrlFor, takePrefetched} from "@/lib/prefetch";
import type {FileKind} from "@/lib/scripts";
// the HTML toolbar's Format button.
// reindentHtml + the Markdown formatter feed
// the right-click Auto-format / Auto-indent items in BOTH view and
// edit modes; parseSqlSchema gives .sql files the graphical schema
// view; spell marks are shared with the studio + textarea overlay.
// the markdown PREVIEW outline rail (parseMarkdownOutline +
// the github-slugger anchor the heading components emit).
import {headingAnchor, parseMarkdownOutline} from "@/lib/markdown-outline";
// the shared whole-file hygiene passes (trim / blank-run
// collapse / line-ending normalization) — the SAME implementations the
// Python black path and the notebook cells run.
// the curly-family + shell formatters and the MATLAB one.
import {splitFrontMatter} from "@/lib/frontmatter";
import {parseSqlSchema} from "@/lib/sql-schema-parser";
// the shared formatter-kind registry (right-click Formatting menus).
// the ORM design + relations report generators for.sql files.
import {
    djangoModelsFromSchema,
    prismaSchemaFromSchema,
    relationsReportFromSchema,
    sqlalchemyModelsFromSchema,
} from "@/lib/sql-orm";
import {markSpellWords, replaceWordEverywhere, SpellWordSpan} from "@/lib/spell-marks";
import {SpellTextOverlay} from "@/components/spell-text-overlay";
// spell hardening the request sequence guard, the
// markup keyword skip-list, the tab-stop / soft-wrap geometry and the
// bracket-pair scanner live in pure (unit-tested) lib modules.
import {filterMarkupSpellIssues} from "@/lib/spell-skip";
import {findBracketPair, findOccurrences} from "@/lib/bracket-match";
import {pixelXOfColumn, visualPositionOf, wrapColumnCount, wrappedRowCount} from "@/lib/editor-geometry";
// the OFFLINE completion popup (the completion-provider mount): the
// pure keyword tables + document-word collector + matcher + caret
// prefix scanner from completion-provider.ts (unit-tested); the popup
// UI — keys, rendering, positioning — lives in the edit-mode
// textarea below. shouldOfferCompletion / completionSuffix are the
// popup's pure trigger + insertion helpers.
import {
    collectDocumentWords,
    type CompletionCandidate,
    completionSuffix,
    identifierPrefixBefore,
    keywordsForKind,
    matchCompletions,
    shouldOfferCompletion,
} from "@/lib/completion-provider";
// Ctrl/Cmd+D multi-caret selection — routed through the SAME
// rebindable binding the Python editor uses (Settings → Shortcuts).
import {matchesShortcut} from "@/lib/shortcuts";
// the edit-surface MINIMAP (plan) — the pure height / scroll / density
// math for the slim right-rail canvas next to the edit textarea.
// deep-undo pacing — snapshot the buffer every ~30 keystrokes
// (the decision itself is pure + unit-tested in lib/deep-undo.ts).
import {shouldSnapshotTyping} from "@/lib/deep-undo";
// the language-kinds table — drives the viewer's own Run
// affordance + the runtime status chip for runnable non-Python files.
import {runLanguageForKind, RUNTIME_LABEL_BY_LANGUAGE} from "@/lib/run-languages";
// the Tools ▸ menu on media files lists the toolbox
// registry without pulling the components (catalog only).
import {toolboxToolsForCategory} from "@/components/dev-toolbox";
import {getIndentSettings} from "@/lib/indent";
import {blockCategories, blocksForFile, renderTemplate, spliceTemplate,} from "@/lib/code-templates";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
// ArchiveTools (the zip/rar/7z/tar viewer, ~1,000 lines) loads on
// first render of an archive file — not in the initial chunk.
const ArchiveTools = dynamic(() => import("@/components/archive-tools").then((m) => m.ArchiveTools), {
    ssr: false,
    // kind-aware loading fallback: while the archive-tools chunk streams
    // in, the archive LISTING shape (toolbar stubs + entry rows) paints —
    // never a blank frame between the FileSkeleton hand-off and the
    // listing fetch.
    loading: () => <FileSkeleton fileKind="other" shape="archive"/>,
});
const ApiClientWorkbench = dynamic(() => import("@/components/api-client-workbench").then((m) => m.ApiClientWorkbench), {
    ssr: false,
    // kind-aware loading fallback: while the workbench chunk streams
    // in, the .http file paints the code-shaped request-list skeleton —
    // never a blank frame.
    loading: () => (
        <div className="p-4 space-y-2" aria-busy="true">
            <div className="rounded-md border p-3 space-y-2">
                {Array.from({length: 6}).map((_, i) => (
                    <div key={i} style={{paddingLeft: `${((i * 13) % 3) * 14}px`}}>
                        <div className="h-3 w-full rounded bg-muted animate-pulse"
                             style={{animationDelay: `${i * 70}ms`}}/>
                    </div>
                ))}
            </div>
        </div>
    ),
});
const HexEditor = dynamic(() => import("@/components/hex-editor").then((m) => m.HexEditor), {
    ssr: false,
    // hex-grid fallback (offset + byte columns) while the chunk streams.
    loading: () => <FileSkeleton fileKind="other" shape="hex"/>,
});
// the new kind-aware viewers — markdown studio
// (split editor + live preview), JSON inspector (tree + JSONPath), the
// .env form editor, the editable CSV/XLSX grid, the level-colored log
// viewer, the image toolbox (zoom/probe/compare/crop), media tooling
// (waveform / A-B loop / frame grab / trim) and the PDF toolkit
// (thumbnails / text search / extract / rotate).
const MarkdownStudio = dynamic(() => import("@/components/markdown-studio").then((m) => m.MarkdownStudio), {
    ssr: false,
    // document-shaped fallback while the studio chunk streams in on the
    // FIRST markdown Edit — the viewer's own fetch gate has already
    // cleared by then, so without this the pane went blank mid-handoff.
    loading: () => <FileSkeleton fileKind="markdown"/>,
});
// ```mermaid fenced blocks moved into MarkdownGithub (the GitHub-grade
// renderer owns fenced-code handling now — see markdown-github.tsx).
const JsonInspector = dynamic(() => import("@/components/json-inspector").then((m) => m.JsonInspector), {
    ssr: false,
    // code-shaped fallback while the JSON inspector chunk streams in.
    loading: () => <FileSkeleton fileKind="json"/>,
});

const CsvGridEditor = dynamic(() => import("@/components/csv-grid-editor").then((m) => m.CsvGridEditor), {
    ssr: false,
    // table-shaped fallback while the grid-editor chunk streams in.
    loading: () => <FileSkeleton fileKind="csv"/>,
});

const ImageToolbox = dynamic(() => import("@/components/image-toolbox").then((m) => m.ImageToolbox), {
    ssr: false,
    // image-block fallback (defense in depth — the viewer's own
    // full-cover overlay normally hides the chunk window).
    loading: () => <FileSkeleton fileKind="image"/>,
});
// the media-tools split — video files keep MediaTools
// (video-only now); audio files get the dedicated AudioTools player
// + the Audio studio toolbox category.
const MediaTools = dynamic(() => import("@/components/media-tools").then((m) => m.MediaTools), {
    ssr: false,
    // player-shaped fallback while the video-tools chunk streams in.
    loading: () => <FileSkeleton fileKind="video"/>,
});
const AudioTools = dynamic(() => import("@/components/audio-tools").then((m) => m.AudioTools), {
    ssr: false,
    // equalizer-bar fallback while the audio-tools chunk streams in.
    loading: () => <FileSkeleton fileKind="audio"/>,
});
const PdfTools = dynamic(() => import("@/components/pdf-tools").then((m) => m.PdfTools), {
    ssr: false,
    // page-card fallback while the pdf-tools chunk streams in.
    loading: () => <FileSkeleton fileKind="pdf"/>,
});

/**
 * FileViewer — a renderer for non-Python files selected from the
 * folder tree. Picks the right renderer based on the file's `kind`:
 *
 *   markdown → render as Markdown (toggleable to raw editor)
 *   text     → plain textarea viewer (read-only by default, Edit to write)
 *   json     → syntax-highlighted JSON viewer (Edit to write)
 *   yaml     → syntax-highlighted YAML viewer (Edit to write)
 *   toml     → syntax-highlighted TOML viewer (Edit to write)
 *   html     → render in a sandboxed iframe
 *   csv      → simple table viewer (the rich CSV table lives in DataFileBrowser)
 *   spreadsheet → pandas table viewer for xlsx/xls/parquet/feather
 *             (SheetDataView via /api/data-sheet — same as the
 *             DataFileBrowser preview, incl. workbook sheet tabs)
 *   image    → <img> with the file URL
 *   video    → <video controls>
 *   audio    → <audio controls>
 *   pdf      → <iframe> with the browser's PDF viewer
 *   ipynb    → notebook-rendered output (existing components handle this)
 *   other    → friendly "Unsupported file type" message
 *
 * The file's raw bytes are served by `/api/file?folder=X&file=Y`,
 * which sets the right Content-Type so the browser can render
 * images / videos / PDFs inline.
 *
 * For editable kinds (markdown, text, json, yaml, toml), the Edit
 * button switches to a textarea. The Save button PUTs the new
 * content to `/api/import-py` (which already handles arbitrary
 * text files — it just writes them to disk under the folder
 * folder). The save is debounced when `autoSaveDelayMs > 0`.
 */
/* The editable text/source kinds — ONE list (previously duplicated
   in the body switcher AND the main component; both now read this).
   It also gates the union bar (File ▾ / AI ▾ / theme / Find). */
const EDITABLE_TEXT_KINDS: readonly string[] = [
    "markdown", "text", "json", "yaml", "toml", "sql", "r", "shell", "log", "html",
    "css", "javascript", "typescript", "matlab", "java", "c", "cpp",
    "ruby", "php", "go",
    "lua", "perl", "rust", "julia", "kotlin", "swift",
    "powershell", "batch",
    "zig", "dart", "groovy", "scala", "elixir",
    "haskell", "erlang", "clojure", "ocaml", "fsharp", "graphql",
];

/* SESSION CONTENT CACHE (stale-while-revalidate) — re-opening a file
 * this viewer already loaded paints INSTANTLY from this map: no
 * skeleton, no SKELETON_MIN_MS hold (that gate exists so the FIRST
 * load's skeleton is readable — re-playing it on every tab switch
 * back was the reported "flicker"). A background no-store re-fetch
 * follows; if the disk copy changed (external edit, notebook save,
 * …), the fresh text replaces the cached paint in place. The mirror
 * effect below keeps entries coherent with every setContent path
 * (fetch, save, grid edit, .http serialization…). */
const fileContentCache = new Map<string, { content: string; truncated: boolean }>();
const FILE_CONTENT_CACHE_MAX = 32;

function rememberFileContent(url: string, content: string, truncated: boolean) {
    if (!url || !content) return;
    // re-insert at the end so eviction below drops the OLDEST entry.
    if (fileContentCache.has(url)) fileContentCache.delete(url);
    fileContentCache.set(url, {content, truncated});
    if (fileContentCache.size > FILE_CONTENT_CACHE_MAX) {
        const oldest = fileContentCache.keys().next().value;
        if (oldest !== undefined) fileContentCache.delete(oldest);
    }
}

interface FileViewerProps {
    fileName: string;
    fileKind: FileKind;
    folderSlug: string;
    fileSlug: string;
    /** Initial text content (fetched server-side for text files). */
    initialContent?: string;
    /** Called when the user edits and saves a text file. The identity
     * argument lets the parent reject a stale autosave that fired
     * after the user switched files. */
    onSaveEdit?: (
        content: string,
        identity?: { folderSlug?: string; fileSlug?: string }
    ) => Promise<void>;
    /** Auto-save debounce in ms (0 = manual save only). */
    autoSaveDelayMs?: number;
    /** View-mode Auto-format / Auto-indent: after switching to the
     *  editor, wait this many ms before applying the formatted text
     *  (Settings → Formatting; 0 = apply in the same render batch). */
    formatSwitchDelayMs?: number;
    /** Whether the file is being fetched. */
    loading?: boolean;
    /** line-height multiplier, matching the Python
     *  editor (1.2–2.0, default 1.6). */
    lineHeight?: number;
    /** extra letter spacing in px (0 = font default). */
    letterSpacing?: number;
    // ─── additions ────────────────────────────────────────
    /** Other images in the SAME folder — feeds the image toolbox's
     *  side-by-side / blink compare (page passes the folder's image
     *  files with ready URLs). */
    siblingImages?: Array<{ fileSlug: string; fileName: string; src: string }>;
    /** Open the Chart preview dialog for this CSV (Data ▸ Chart preview). */
    onOpenChart?: () => void;
    /** Open the Transform pipeline dialog for this CSV. */
    onOpenTransform?: () => void;
    /** Open the SQLite workbench (for .db files in "other" kind). */
    onOpenWorkbench?: () => void;
    /** report the unsaved-buffer state (edit mode
     *  or Markdown studio) so the page can ask Save / Discard before a
     *  tab or tree switch drops the buffer. */
    onDirtyChange?: (dirty: boolean) => void;
    /** report the open file's TEXT up to the page (the Screenshot
     *  Studio's Screenshot: code / Screenshot: selection render from
     *  it; also any future page-level feature that needs the content
     *  without re-fetching). Fires whenever the loaded content or file
     *  identity changes — not on every keystroke. */
    onContentKnown?: (info: { content: string; fileName: string }) => void;
    /** Run this file from the viewer header — wired for every
     *  runnable kind (java / r / .m / js / ts / ruby / php / go …), so
     *  the Run control lives WITH the file, not only in the top toolbar. */
    onRun?: () => void;
    /** Run the SELECTED text (or the caret's line) through the
     *  file's language runtime — the exact "Run selection" the Python
     *  editor's context menu offers, now mirrored for every runnable
     *  non-Python kind (the run API takes a code override, so the
     *  selection runs under node / Rscript / bash / ruby … the same
     *  way Python's does). */
    onRunSelection?: (code: string) => void;
    /** Send a prompt to the integrated AI chat — mirrors the Python
     *  editor's onAiPrompt wiring so the AI ▸ context-menu group shows
     * for every kind whose capabilities allow it. */
    onAiPrompt?: (text: string) => void;
    /** The app-level code-theme default (Settings ▸ Editor ▸ Code theme)
     *  — resolved through the SAME shared registry + praxis.code-theme
     *  key the Python editor uses (lib/code-themes). */
    codeSyntaxTheme?: string;
    /** the runtime status for the open file's language (from
     *  GET /api/runtime-check): ok=false renders the “not installed”
     *  chip whose tooltip carries the install hint. Null = unknown yet. */
    runStatus?: {
        label: string;
        ok: boolean;
        version: string;
        installHint: string;
    } | null;
    /** Column ruler — the same guide the Python editor draws
     *  (Settings → Editor → Column ruler): a faint vertical line at
     *  this column in BOTH the read and the edit view of every code
     *  file, 0 = off. */
    rulerColumn?: number;
    /** Ruler line WIDTH in px (1–6) — styles the guide above. */
    rulerLineWidth?: number;
    /** Markdown PREVIEW reading width (Settings ▸ Formatting ▸
     *  Markdown): sizes the rendered document's prose column; the ruler
     *  above draws over that column at its configured column. */
    mdPreviewWidth?: "narrow" | "medium" | "wide" | "full";
    /** Open the containing folder in the OS file explorer — the
     *  File ▸ group mirrors the Python editor's same row (page
     *  passes the same handleOpenFolder). */
    onOpenFolder?: () => void;
}

/* ================================================================== */
/* spell-check helpers (module level) */

/* ================================================================== */

/** can this file be validated by the real parser
 *  route? yaml / toml kinds + .ini / .cfg / .conf text files. */
function canValidateKind(kind: FileKind, fileName: string): boolean {
    if (kind === "yaml" || kind === "toml") return true;
    if (kind === "text") return /\.(ini|cfg|conf)$/i.test(fileName);
    return false;
}

/* ──────────────────────────────────────────────────────────────────
 * AUTO-PAIR maps — the opener→closer pairs the edit
 * textarea's keydown inserts (caret placed between), plus the set of
 * closers that TYPE OVER an identical next char (typing ")" when the
 * char right after the caret is already ")" just advances the caret).
 * Plain module-level tables so the keydown handler stays a cheap
 * lookup. ` is included — the JSON/YAML/shell kinds all quote with it.
 * ────────────────────────────────────────────────────────────────── */
const AUTO_PAIR_OPENERS: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
    "\"": "\"",
    "'": "'",
    "`": "`",
};
const AUTO_PAIR_CLOSERS = new Set([")", "]", "}", "\"", "'", "`"]);

/* ──────────────────────────────────────────────────────────────────
 * the PRISM language for a file kind.
 *
 * One map for every consumer in this file: the view-mode highlighter,
 * the new EDIT-mode backdrop (the textarea text turns transparent and
 * a Prism <pre> shines through), and fenced markdown code blocks.
 * `.ini/.cfg/.conf` text files map to the ini grammar (it was already
 * registered but never reachable — the view map fell to undefined for
 * the whole `text` kind).
 * ────────────────────────────────────────────────────────────────── */
export function prismLanguageFor(kind: FileKind, fileName: string): string | undefined {
    switch (kind) {
        case "json":
            return "json";
        case "yaml":
            return "yaml";
        case "toml":
            return "toml";
        case "sql":
            return "sql";
        case "css":
            return "css";
        case "r":
            return "r";
        case "javascript":
            return "javascript";
        case "typescript":
            return "typescript";
        case "matlab":
            return "matlab";
        case "java":
            return "java";
        case "c":
            return "c";
        case "cpp":
            return "cpp";
        case "shell":
            return "bash";
        // the remaining registry languages.
        case "ruby":
            return "ruby";
        case "php":
            return "php";
        case "go":
            return "go";
        // FIX
        // also some other languages"): html → "markup" and markdown →
        // "markdown" were MISSING from this map, so the view source / the
        // edit-mode backdrop fell through to NO grammar (plain gray) — the
        // "markup" grammar wasn't even registered in highlighter.ts.
        case "html":
            return "markup";
        case "markdown":
            return "markdown";
        // the six new registry languages.
        case "lua":
            return "lua";
        case "perl":
            return "perl";
        case "rust":
            return "rust";
        case "julia":
            return "julia";
        case "kotlin":
            return "kotlin";
        case "swift":
            return "swift";
        // the Windows-native scripting pair.
        case "powershell":
            return "powershell";
        case "batch":
            return "batch";
        case "zig":
            return "zig";
        case "dart":
            return "dart";
        case "groovy":
            return "groovy";
        case "scala":
            return "scala";
        case "elixir":
            return "elixir";
        case "haskell":
            return "haskell";
        case "erlang":
            return "erlang";
        case "clojure":
            return "clojure";
        case "ocaml":
            return "ocaml";
        case "fsharp":
            return "fsharp";
        case "graphql":
            return "graphql";
        case "text":
            //.diff /.patch highlight with the DIFF grammar
            // (registered) — +/- lines, hunk headers, file
            // headers all get their own colors.
            if (/\.(diff|patch)$/i.test(fileName)) return "diff";
            return /\.(ini|cfg|conf)$/i.test(fileName) ? "ini" : undefined;
        default:
            return undefined;
    }
}

/* ──────────────────────────────────────────────────────────────────
 * CodeViewSurface — the shared VIEW-mode overlay host.
 *
 * Wraps one syntax-highlighted <pre> (the rawText twin every code
 * kind renders, the Markdown Source view, the HTML source pane) and
 * draws TWO absolutely-positioned layers OVER the colors — never
 * replacing them (the old marked-twin swap made grammar kinds look
 * uncolored, so their zigzags only ever lived in edit mode):
 *
 *   1. the COLUMN RULER — the same guide the Python editor draws
 *      (Settings → Editor → Column ruler), now visible for every
 *      code file ("if codes are using the vertical ruler like
 *      python, why not displayed?");
 *   2. the SPELL ZIGZAGS — every misspelled word from /api/spell
 *      re-rendered as a transparent-text chip with the .spell-miss
 *      wavy underline at its exact (line, col), clickable for the
 *      add-to-dictionary / copy / dismiss popover — view-mode parity
 *      with the edit-mode textarea overlay.
 *
 * Both layers position from MEASURED DOM metrics (the highlighted
 * <pre>'s computed font/line-height/padding + the gutter width from
 * the first line-number span), so they follow zoom + letter spacing
 * without formulas drifting. Line/col math is only valid while lines
 * don't wrap — wrap=true suspends both layers (the marks would land
 * on the wrong row).
 * ────────────────────────────────────────────────────────────────── */

interface ViewMetrics {
    /** px from the pre's left edge to where the CODE TEXT starts (gutter). */
    codeLeft: number;
    /** px from the pre's top edge to the first line box. */
    codeTop: number;
    /** one line box height in px. */
    lineH: number;
    /** one monospace glyph advance in px. */
    charW: number;
    /** the pre's computed font-size — the overlay chips must render
     *  their words at the SAME size + family or the wavy underline
     *  covers only part of the misspelled word (default-font glyphs are
     *  narrower than the code mono font). */
    fontSize: string;
}

function CodeViewSurface({
                             children,
                             rulerColumn = 0,
                             rulerLineWidth = 1,
                             isDark,
                             spellIssues,
                             onIgnoreSpell,
                             onReplaceSpell,
                             onReplaceSpellOnce,
                             wrap = false,
                             /** The exact source text the <pre> renders — the chip row math
                              *  splits IT into wrap segments. Empty string is
                              *  tolerated (segment math falls back to one row per line). */
                             text = "",
                             /** re-measure whenever the rendered code changes shape. */
                             metricsKey,
                             /** Fill-below-last-line: when a
                              * background color is provided, the surface stretches to the
                              * scrollport's full height (minHeight 100%) and paints it — the
                              * code color continues past the last line instead of cutting off
                              * to the card color. Omitted (undefined) keeps the old
                              * content-height behavior. */
                             fillBg,
                         }: {
    children: React.ReactNode;
    rulerColumn?: number;
    rulerLineWidth?: number;
    isDark: boolean;
    spellIssues: Array<{ word: string; line: number; col: number }>;
    onIgnoreSpell: (word: string) => void;
    wrap?: boolean;
    text?: string;
    metricsKey: string;
    fillBg?: string;
    /** Replace-in-place for the spell popover's suggestion rows — swaps
     *  every occurrence of the misspelled word in the viewed buffer and
     *  saves. Omitted → the Replace button stays hidden in the popover. */
    onReplaceSpell?: (word: string, suggestion: string) => void;
    /** Replace-once — swaps ONLY the clicked occurrence (at its
     *  1-based line/col). Omitted → the popover's third button stays
     *  hidden. */
    onReplaceSpellOnce?: (word: string, suggestion: string, line: number, col: number) => void;
}): React.ReactElement {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const probeRef = React.useRef<HTMLSpanElement | null>(null);
    const [m, setM] = React.useState<ViewMetrics | null>(null);
    // Effective tab size + wrap column of the rendered <pre> (plans
    // 1e/1f) — measured in the same layout effect as the base metrics.
    const [viewTabSize, setViewTabSize] = React.useState(8);
    const [viewWrapCols, setViewWrapCols] = React.useState<number>(Infinity);

    React.useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const pre = host.querySelector("pre");
        if (!pre) return;
        const cs = window.getComputedStyle(pre);
        const fs = parseFloat(cs.fontSize) || 13;
        const lineH = parseFloat(cs.lineHeight) || fs * 1.5;
        const codeTop = parseFloat(cs.paddingTop) || 0;
        // Where the code TEXT starts: the first child span of <code> is
        // the line-number gutter chip (border-box right edge + its
        // margin-right) — but ONLY when it really is the gutter.
        // Gutter detection must NOT mistake a syntax TOKEN span for the
        // gutter chip: in the HTML split pane (and any renderer without
        // showLineNumbers) the first element child of <code> is the first
        // TOKEN of line 1 — measuring it as a "gutter" shifted every
        // spell chip right by that token's width (the "zigzag in
        // html is not in the correct place"). The gutter chip's text is
        // always a pure line NUMBER, tokens never are — that is the
        // discriminator. No gutter → the pre's own left padding.
        let codeLeft = parseFloat(cs.paddingLeft) || 0;
        const codeEl = pre.querySelector("code");
        const firstSpan = codeEl?.firstElementChild as HTMLElement | null;
        if (
            firstSpan &&
            firstSpan.tagName === "SPAN" &&
            /^\d+$/.test((firstSpan.textContent ?? "").trim())
        ) {
            const preRect = pre.getBoundingClientRect();
            const spanRect = firstSpan.getBoundingClientRect();
            if (spanRect.width > 0 && spanRect.right > preRect.left) {
                const mr = parseFloat(window.getComputedStyle(firstSpan).marginRight) || 0;
                codeLeft = spanRect.right - preRect.left + mr;
            }
        }
        // The glyph probe adopts the pre's EXACT computed font (family /
        // size / letter spacing — zoom included), then its measured
        // 100-glyph width / 100 is the per-char advance the code uses.
        let charW = fs * 0.6;
        if (probeRef.current) {
            const probe = probeRef.current;
            probe.style.fontFamily = cs.fontFamily;
            probe.style.fontSize = cs.fontSize;
            probe.style.letterSpacing = cs.letterSpacing;
            const w = probe.getBoundingClientRect().width;
            if (w > 0) charW = w / 100;
        }
        setM({codeLeft, codeTop, lineH, charW, fontSize: cs.fontSize});
        // Tab stops + the wrap column the tab size comes
        // from the pre's computed style; the wrap width is the pre's
        // content box minus the code-text left offset (the gutter lives
        // inside that width) — the same width the browser wraps at.
        const ts = parseFloat(cs.tabSize);
        if (Number.isFinite(ts) && ts > 0) setViewTabSize(ts);
        if (wrap) {
            const padR = parseFloat(cs.paddingRight) || 0;
            setViewWrapCols(wrapColumnCount(Math.max(0, pre.clientWidth - padR - codeLeft), charW));
        } else {
            setViewWrapCols(Infinity);
        }
    }, [metricsKey, wrap]);

    const rulerOn = rulerColumn > 0 && !wrap && !!m;
    return (
        <div
            className="relative"
            ref={hostRef}
            style={fillBg ? {minHeight: "100%", background: fillBg} : undefined}
        >
            {/* glyph probe — 100 'M's; the effect above adopts the pre's
          exact computed font so the measured advance matches. */}
            <span
                ref={probeRef}
                aria-hidden="true"
                style={{
                    position: "absolute", left: -9999, top: -9999, visibility: "hidden",
                    whiteSpace: "pre", pointerEvents: "none",
                    fontFamily: "var(--font-jb-mono), monospace",
                }}
            >
        {"M".repeat(100)}
      </span>
            {/* column ruler — the Python editor's guide, over the colors */}
            {rulerOn && (
                <div
                    aria-hidden="true"
                    className="absolute pointer-events-none top-0 bottom-0 z-[1]"
                    style={{
                        left: `${m.codeLeft + rulerColumn * m.charW}px`,
                        width: `${Math.max(1, Math.min(6, rulerLineWidth))}px`,
                        background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)",
                    }}
                />
            )}
            {/* spell zigzags — transparent-text chips at (line, col).
SEGMENT-AWARE: while the surface soft-wraps, the
chip math splits every logical line at the wrap column and
offsets onto the correct VISUAL row (the row-prefix table
below also shifts every later line for the rows its
predecessors consumed). TAB-AWARE: the x math
expands tabs to the pre's tab stops instead of assuming one
cell per char. */}
            {m && spellIssues.length > 0 && (() => {
                const lines = text ? text.split("\n") : [];
                // prefix[i] = extra visual rows contributed by lines[0..i).
                const prefix: number[] = new Array(lines.length).fill(0);
                if (wrap && Number.isFinite(viewWrapCols)) {
                    let extra = 0;
                    for (let i = 0; i < lines.length; i++) {
                        prefix[i] = extra;
                        extra += wrappedRowCount(lines[i] ?? "", viewTabSize, viewWrapCols) - 1;
                    }
                }
                return (
                    <div
                        aria-hidden={false}
                        className="absolute inset-0 z-[2] pointer-events-none select-none overflow-hidden"
                    >
                        {spellIssues.filter((iss) => iss.line >= 1 && iss.line <= lines.length).map((issue, i) => {
                            const lineText = lines[issue.line - 1] ?? "";
                            const pos = visualPositionOf(
                                lineText,
                                Math.max(0, issue.col - 1),
                                viewTabSize,
                                viewWrapCols
                            );
                            const extraRowsBefore = wrap ? prefix[issue.line - 1] ?? 0 : 0;
                            const rowOffset = wrap ? pos.row : 0;
                            return (
                                <span
                                    key={`${issue.word}-${issue.line}-${issue.col}-${i}`}
                                    style={{
                                        position: "absolute",
                                        top: `${m.codeTop + ((issue.line - 1) + extraRowsBefore + rowOffset) * m.lineH}px`,
                                        left: `${m.codeLeft + pixelXOfColumn(lineText, issue.col - 1, viewTabSize, m.charW)}px`,
                                        width: `${issue.word.length * m.charW}px`,
                                        height: `${m.lineH}px`,
                                        lineHeight: `${m.lineH}px`,
                                        fontFamily: "var(--font-jb-mono), monospace",
                                        fontSize: m.fontSize,
                                        color: "transparent",
                                        overflow: "hidden",
                                        whiteSpace: "pre",
                                        pointerEvents: "auto",
                                    }}
                                >
                  <SpellWordSpan
                      word={issue.word}
                      onIgnore={onIgnoreSpell}
                      onReplace={onReplaceSpell}
                      onReplaceOnce={
                          onReplaceSpellOnce
                              ? (w, s) => onReplaceSpellOnce!(w, s, issue.line, issue.col)
                              : undefined
                      }
                  />
                </span>
                            );
                        })}
                    </div>
                );
            })()}
            {children}
        </div>
    );
}

/** JSX / TSX sources highlight with the DEDICATED jsx/tsx
 *  grammars (tags + expressions both colored), not the base js/ts
 *  one — `kind` maps .jsx→javascript / .tsx→typescript, so the
 *  extension decides here. */
function jsxLanguageFor(kind: FileKind, fileName: string): string | undefined {
    if (/\.jsx$/i.test(fileName)) return "jsx";
    if (/\.tsx$/i.test(fileName)) return "tsx";
    return prismLanguageFor(kind, fileName);
}

/* fence-language helpers + collectMarkdownText moved to
 * components/markdown-github.tsx (shared renderer). */

/* escapeRegExp + markSpellWords moved to
 * lib/spell-marks.ts — shared with the Markdown studio and the
 * textarea spell overlay (spell-text-overlay.tsx). */

interface SpellIssue {
    word: string;
    line: number;
    col: number
}


/* ------------------------------------------------------------------ */
/* YAML front-matter metadata card */

/* ------------------------------------------------------------------ */

/** Compact key/value card for the `---\ntitle: …\n---` block — the
 *  replacement for the raw `---` lines that used to render as
 *  thematic breaks / a setext H2 OVERLAPPING the body. `not-prose`
 *  keeps the typography plugin from re-styling it; values render in
 *  a mono chip (they're raw YAML scalars like `html_document`). */
function FrontMatterCard({
                             entries,
                             text,
                         }: {
    entries?: import("@/lib/frontmatter").FrontMatterEntry[] | null;
    text?: string;
}) {
    const list =
        entries !== undefined
            ? entries
            : text !== undefined
                ? splitFrontMatter(text).entries
                : null;
    if (!list || list.length === 0) return null;
    return (
        <div
            className="not-prose mb-5 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
            aria-label="Front matter"
        >
            <div
                className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <FileText className="size-3"/> Front matter
            </div>
            <dl className="grid gap-x-4 gap-y-1" style={{gridTemplateColumns: "max-content 1fr"}}>
                {list.map((e) => (
                    <React.Fragment key={`${e.key}-${e.value}`}>
                        <dt className="text-muted-foreground whitespace-nowrap after:content-[':']">{e.key}</dt>
                        <dd className="truncate font-mono" title={e.value}>
                            {e.value === "" ? <span className="italic text-muted-foreground">empty</span> : e.value}
                        </dd>
                    </React.Fragment>
                ))}
            </dl>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Kind-aware loading skeleton                                        */

/* ------------------------------------------------------------------ */

/** A single pulsing bar — plus the shimmer sweep: the
 * gradient travels left→right on top of the opacity pulse so the
 * loading state is visibly moving. */
function Skel({className, style}: { className?: string; style?: React.CSSProperties }) {
    return <div aria-hidden="true" className={cn("rounded bg-muted animate-pulse praxis-shimmer", className)}
                style={style}/>;
}

/** The archive-listing skeleton body — toolbar stubs, a header row
 *  and entry rows shaped like the ArchiveTools card that is about to
 *  fill it. Shared by FileSkeleton's archive branch, the
 *  ArchiveTools dynamic-import fallback and the archive reveal-stage
 *  overlay, so every archive loading surface has the SAME shape. */
function ArchiveListingSkeleton() {
    return (
        <div className="rounded-md border overflow-hidden w-full max-w-2xl">
            {/* toolbar stubs */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-emerald-500/10">
                <Skel className="h-5 w-20 rounded-sm"/>
                <Skel className="h-5 w-24 rounded-sm" style={{animationDelay: "60ms"}}/>
                <Skel className="h-5 w-16 rounded-sm" style={{animationDelay: "120ms"}}/>
                <div className="flex-1"/>
                <Skel className="h-5 w-28 rounded-sm" style={{animationDelay: "180ms"}}/>
            </div>
            {/* header row */}
            <div className="flex gap-3 px-3 py-2 border-b text-[11px]">
                <Skel className="h-3 flex-[3]"/>
                <Skel className="h-3 flex-1" style={{animationDelay: "40ms"}}/>
                <Skel className="h-3 flex-1" style={{animationDelay: "80ms"}}/>
                <Skel className="h-3 w-10" style={{animationDelay: "120ms"}}/>
            </div>
            {/* entry rows */}
            {Array.from({length: 9}).map((_, r) => (
                <div key={r} className="flex gap-3 px-3 py-1.5 border-b last:border-b-0 items-center">
                    <Skel className="h-3.5 flex-[3] bg-muted/70" style={{animationDelay: `${r * 55}ms`}}/>
                    <Skel className="h-3 flex-1 bg-muted/70" style={{animationDelay: `${r * 55 + 30}ms`}}/>
                    <Skel className="h-3 flex-1 bg-muted/70" style={{animationDelay: `${r * 55 + 60}ms`}}/>
                    <Skel className="h-3 w-10 bg-muted/70" style={{animationDelay: `${r * 55 + 90}ms`}}/>
                </div>
            ))}
        </div>
    );
}

/** Kind-aware skeleton — mimics the SHAPE of the content that is
 * about to land (table / document / code / media / page), so the
 * layout doesn't jump when the real content replaces it.
 * `fileName` is optional (the dynamic-import fallbacks below pass only
 * a kind/shape); the caption then falls back to a kind word.
 * `shape` lets a caller request the ARCHIVE or HEX skeleton explicitly
 * (the archive branch otherwise keys off the file NAME — the fallbacks
 * don't know it).
 * Widths and delays are deterministic per index — no re-randomizing
 * flicker between renders.
 * SKELETON-ONLY: the
 * caption is a pulsing text line, NOT a spinner — every surface
 * below renders pure skeleton shapes. */
function FileSkeleton({fileKind, fileName, shape}: {
    fileKind: FileKind;
    fileName?: string;
    shape?: "archive" | "hex"
}) {
    const skeletonLabel = fileName || (shape === "archive" ? "archive" : shape === "hex" ? "binary file" : fileKind);
    const caption = (
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <span>Loading {skeletonLabel}…</span>
            <span className="uppercase tracking-wider text-[10px]">{shape === "archive" ? "archive" : fileKind}</span>
        </div>
    );

    // ── Table-shaped kinds: CSV / TSV / spreadsheet ──────────────────
    if (fileKind === "csv" || fileKind === "spreadsheet") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <div className="border rounded-md overflow-hidden">
                    <div className="flex gap-2 px-3 py-2 border-b bg-emerald-500/10">
                        {Array.from({length: 6}).map((_, c) => (
                            <Skel key={c} className="h-3 flex-1" style={{animationDelay: `${c * 70}ms`}}/>
                        ))}
                    </div>
                    {Array.from({length: 8}).map((_, r) => (
                        <div key={r} className="flex gap-2 px-3 py-2 border-b last:border-b-0">
                            {Array.from({length: 6}).map((_, c) => (
                                <Skel
                                    key={c}
                                    className="h-3 flex-1 bg-muted/70"
                                    style={{animationDelay: `${(r * 6 + c) * 60}ms`}}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Document-shaped kinds: markdown ───────────────────────────────
    if (fileKind === "markdown") {
        return (
            <div className="px-6 py-4 max-w-none space-y-4" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <Skel className="h-7 w-2/5"/> {/* title */}
                <Skel className="h-3 w-3/5"/> {/* subtitle */}
                <div className="space-y-2 pt-2">
                    {["w-full", "w-full", "w-11/12", "w-full", "w-4/5"].map((w, i) => (
                        <Skel key={i} className={cn("h-3", w)}/>
                    ))}
                </div>
                <Skel className="h-5 w-1/3"/> {/* section heading */}
                <div className="space-y-2">
                    {["w-full", "w-11/12", "w-full"].map((w, i) => (
                        <Skel key={i} className={cn("h-3", w)}/>
                    ))}
                </div>
                <Skel className="h-24 w-full rounded-md"/> {/* code/image block */}
            </div>
        );
    }

    // ── Code-shaped kinds — every code language gets the code-shaped
    // skeleton (header bar + indented line rows), .http included so the
    // API workbench paints over a request-list-shaped placeholder.
    if (["json", "yaml", "toml", "sql", "r", "shell", "html", "css", "log", "http", "python", "javascript", "typescript", "text",
        "matlab", "java", "c", "cpp", "ruby", "php", "go", "lua", "perl", "rust", "julia", "kotlin", "swift",
        "powershell", "batch", "zig", "dart", "groovy", "scala", "elixir", "haskell", "erlang", "clojure", "ocaml", "fsharp", "graphql"].includes(fileKind)) {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <div className="rounded-md border p-3 space-y-2">
                    {Array.from({length: 10}).map((_, i) => {
                        const indent = ((i * 13) % 4) * 14; // 0/14/28/42 px — stable
                        return (
                            <div key={i} style={{paddingLeft: `${indent}px`}}>
                                <Skel className="h-3"
                                      style={{width: `${38 + ((i * 37) % 50)}%`, animationDelay: `${i * 55}ms`}}/>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Media kinds ───────────────────────────────────────────────────
    if (fileKind === "image") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <Skel className="h-64 w-full max-w-lg mx-auto rounded-lg"/>
            </div>
        );
    }
    if (fileKind === "video") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                {/* Player-shaped skeleton — frame + a pulsing progress strip,
            no spinner: the bars carry the "loading" signal. */}
                <div className="relative h-56 w-full max-w-2xl mx-auto overflow-hidden rounded-lg bg-muted">
                    <Skel className="absolute inset-0"/>
                    <div className="absolute inset-x-3 bottom-3 space-y-1.5">
                        <Skel className="h-1.5 w-full rounded-full"/>
                        <div className="flex items-center gap-2">
                            <Skel className="size-2.5 rounded-full"/>
                            <Skel className="h-2 w-16"/>
                            <Skel className="ml-auto h-2 w-10"/>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (fileKind === "audio") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <div className="flex items-end gap-1 h-16 max-w-md mx-auto py-4">
                    {Array.from({length: 24}).map((_, i) => (
                        <Skel
                            key={i}
                            className="flex-1"
                            style={{height: `${20 + ((i * 29) % 60)}%`, animationDelay: `${i * 45}ms`}}
                        />
                    ))}
                </div>
            </div>
        );
    }
    if (fileKind === "pdf") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <div className="max-w-2xl mx-auto rounded-md border bg-background p-6 space-y-2 shadow-sm">
                    <Skel className="h-5 w-1/2 mb-4"/>
                    {Array.from({length: 9}).map((_, i) => (
                        <Skel key={i} className="h-3"
                              style={{width: `${58 + ((i * 41) % 36)}%`, animationDelay: `${i * 55}ms`}}/>
                    ))}
                </div>
            </div>
        );
    }

    // ── Notebook-shaped: ipynb  ───────────────────────────
    if (fileKind === "ipynb") {
        return (
            <div className="p-4 space-y-3" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                {/* Two cell cards — prompt band (In [n] + type chip) + source
            lines + a collapsed output strip, like the real notebook. */}
                {Array.from({length: 2}).map((_, c) => (
                    <div key={c} className="rounded-md border overflow-hidden">
                        <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/30">
                            <Skel className="h-2.5 w-8 rounded-sm bg-orange-500/20"/>
                            <Skel className="h-2.5 w-12 rounded-sm"/>
                            <Skel className="ml-auto size-2.5 rounded-sm"/>
                        </div>
                        <div className="p-3 space-y-2">
                            {Array.from({length: 3}).map((_, i) => (
                                <Skel key={i} className="h-3" style={{
                                    width: `${52 + ((i * 31 + c * 17) % 40)}%`,
                                    animationDelay: `${(c * 3 + i) * 65}ms`
                                }}/>
                            ))}
                        </div>
                        <div className="px-3 py-2 border-t bg-muted/20 flex items-center gap-2">
                            <Skel className="size-2.5 rounded-full bg-emerald-500/20"/>
                            <Skel className="h-2 w-14"/>
                            <Skel className="ml-auto h-2 w-10"/>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // ── Database-shaped: sqlite  ─────────────────────────
    if (fileKind === "sqlite") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <div className="grid md:grid-cols-[180px_1fr] gap-2">
                    {/* Schema rail: table nodes with column stubs */}
                    <div className="rounded-md border p-3 space-y-3">
                        {Array.from({length: 3}).map((_, t) => (
                            <div key={t} className="space-y-1.5">
                                <Skel className="h-4 w-24 rounded-sm" style={{animationDelay: `${t * 90}ms`}}/>
                                {Array.from({length: 4}).map((_, c) => (
                                    <Skel key={c} className="h-2.5"
                                          style={{width: `${70 + ((t * 5 + c * 23) % 28)}%`}}/>
                                ))}
                            </div>
                        ))}
                    </div>
                    {/* Rows card */}
                    <div className="rounded-md border overflow-hidden">
                        <div className="flex gap-2 px-3 py-2 border-b bg-emerald-500/10">
                            {Array.from({length: 4}).map((_, c) => (
                                <Skel key={c} className="h-3 flex-1" style={{animationDelay: `${c * 70}ms`}}/>
                            ))}
                        </div>
                        {Array.from({length: 7}).map((_, r) => (
                            <div key={r} className="flex gap-2 px-3 py-2 border-b last:border-b-0">
                                {Array.from({length: 4}).map((_, c) => (
                                    <Skel key={c} className="h-3 flex-1 bg-muted/70"
                                          style={{animationDelay: `${(r * 4 + c) * 55}ms`}}/>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── Archive-shaped: zip / rar / 7z / tar / gz … ────────
    // A file-listing table (name / size / packed bars) with a toolbar
    // stub — the shape ArchiveTools is about to fill in. The kind-aware
    // skeleton for archives used to fall through to the generic text
    // bars, and the ungated loading state meant even those never
    // visibly painted. The body lives in ArchiveListingSkeleton so the
    // dynamic-import fallback and the reveal-stage overlay reuse the
    // exact same shape.
    if (shape === "archive" || isArchiveFileName(fileName || "")) {
        return (
            <div className="p-4 space-y-2 w-full" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <ArchiveListingSkeleton/>
            </div>
        );
    }

    // ── Hex-shaped: unknown binaries (.bin / .dat / .exe …) ──
    // offset column + byte cells + an ASCII strip — the shape the
    // HexEditor is about to fill in (every "other" kind lands there).
    if (shape === "hex" || fileKind === "other") {
        return (
            <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
                {caption}
                <div className="rounded-md border p-3 space-y-1.5">
                    {Array.from({length: 10}).map((_, r) => (
                        <div key={r} className="flex gap-2 items-center overflow-hidden">
                            <Skel className="h-3 w-14 shrink-0" style={{animationDelay: `${r * 55}ms`}}/>
                            {Array.from({length: 8}).map((_, b) => (
                                <Skel key={b} className="h-3 w-8 shrink-0"
                                      style={{animationDelay: `${(r * 8 + b) * 30}ms`}}/>
                            ))}
                            <Skel className="h-3 flex-1 min-w-10" style={{animationDelay: `${r * 55 + 40}ms`}}/>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Default / other (unknown): text lines ──────────────────────────
    return (
        <div className="p-4 space-y-2" aria-busy="true" aria-label={`Loading ${skeletonLabel}…`}>
            {caption}
            {Array.from({length: 8}).map((_, i) => (
                <Skel key={i} className="h-3" style={{width: `${60 + ((i * 37) % 35)}%`}}/>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Media / archive reveal stage                                       */

/* ------------------------------------------------------------------ */

/** Full-cover loading overlay + fade-in reveal for the media kinds
 *  (image / video / audio / pdf) AND the archive viewer. The overlay
 *  (a kind-shaped skeleton, centered on both axes on an opaque
 *  backdrop) stays until the tool CONFIRMS its first meaningful
 *  render — an <img> load/decode event, the <video>'s first frame,
 *  the archive listing array — so the skeleton only disappears when
 *  content is actually on screen.
 *
 *  ERROR GUARANTEE: a failed load shows an error card, never an
 *  eternal skeleton. Image/video report through their own onError
 *  props (their galleries contain OTHER <img>/<video> elements whose
 *  failure must not error the whole viewer); the <audio> player is
 *  covered by a CAPTURE-phase error listener here — media `error`
 *  events do not bubble, but they DO traverse ancestors in the
 *  capture phase. (The PDF iframe fires onLoad even for an error
 *  response, so its reveal is inherently safe.) */
function MediaStage({
                        kind,
                        fileName,
                        ready,
                        error,
                        onMediaError,
                        skeleton,
                        children,
                    }: {
    kind: "image" | "video" | "audio" | "pdf" | "archive";
    fileName: string;
    ready: boolean;
    error?: string | null;
    onMediaError?: (message: string) => void;
    skeleton: React.ReactNode;
    children: React.ReactNode;
}) {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const host = hostRef.current;
        if (!host || !onMediaError) return;
        const onErr = (e: Event) => {
            const t = e.target as HTMLElement | null;
            if (!t || t.tagName !== "AUDIO") return;
            onMediaError(`Could not load ${fileName} — the browser reported a media error (missing file or unsupported format).`);
        };
        host.addEventListener("error", onErr, true);
        return () => host.removeEventListener("error", onErr, true);
    }, [onMediaError, fileName]);
    return (
        <div ref={hostRef} className="relative flex flex-col h-full" aria-busy={!ready && !error}>
            {!ready && !error && (
                /* the skeleton fully COVERS the viewer (both axes centered)
           on an opaque backdrop; the tool stays visually hidden until
           its content is confirmed on screen. */
                <div className="absolute inset-0 z-10 bg-background flex flex-col items-center justify-center gap-3">
                    {skeleton}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                        <span>Loading {fileName}…</span>
                        <span className="uppercase tracking-wider text-[10px]">{kind}</span>
                    </div>
                </div>
            )}
            {error ? (
                <div className="flex flex-1 items-center justify-center p-6">
                    <div
                        className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 max-w-md space-y-1 text-xs text-destructive"
                        role="alert">
                        <p className="font-medium flex items-center gap-1.5"><FileWarning
                            className="size-3.5 shrink-0"/> {error}</p>
                        <p className="text-muted-foreground">Check that the file exists and its format is supported,
                            then reopen it from the explorer.</p>
                    </div>
                </div>
            ) : (
                <div
                    className={cn(
                        "flex flex-col flex-1 min-h-0 transition-opacity duration-300",
                        ready ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden={!ready}
                >
                    {children}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* the.sql graphical schema view */

/* ------------------------------------------------------------------ */

/** ER diagram for.sql DDL — reuses the SQLite workbench's
 * SchemaDiagram (zoom +.svg export) with the raw SQL one tab away.
 * CREATE TABLE / FOREIGN KEY statements are parsed client-side by
 * lib/sql-schema-parser (no server round-trip).
 * two new tabs — RELATIONS (the textual twin of the
 * diagram's connections) and ORM MODELS (generated SQLAlchemy 2.0
 * declarative classes with ForeignKey columns + relationship
 * pairs — the ORM design view). */
function SqlSchemaView({
                           schema,
                           rawView,
                           fileName,
                           fontScale = 1,
                       }: {
    schema: ReturnType<typeof parseSqlSchema>;
    rawView: React.ReactNode;
    fileName: string;
    /** The viewer toolbar's zoom multiplier — scales the diagram /
     *  relations / ORM surfaces the same way the SQL Source tab scales
     *  its code (13 × zoom px), so every tab reads at one size. */
    fontScale?: number;
}) {
    const [tab, setTab] = React.useState<"diagram" | "relations" | "orm" | "keys" | "source">("diagram");
    const [focused, setFocused] = React.useState<string | null>(null);
    // the ORM tab grew a
    // FLAVOR selector — SQLAlchemy 2.0 (as before), Django models, or a
    // Prisma schema, all generated from the same parsed DDL.
    const [ormFlavor, setOrmFlavor] = React.useState<"sqlalchemy" | "django" | "prisma">("sqlalchemy");
    const {toast} = useToast();
    const tables = schema.tables as TableInfo[];
    const relations = tables.reduce((n, t) => n + (t.fks?.length ?? 0), 0);
    const ormCode = React.useMemo(
        () =>
            ormFlavor === "django"
                ? djangoModelsFromSchema(schema.tables)
                : ormFlavor === "prisma"
                    ? prismaSchemaFromSchema(schema.tables)
                    : sqlalchemyModelsFromSchema(schema.tables),
        [schema, ormFlavor]
    );
    const relationsText = React.useMemo(() => relationsReportFromSchema(schema.tables), [schema]);
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
                <div className="flex overflow-hidden rounded-md border text-xs" role="tablist"
                     aria-label="SQL view mode">
                    {(["diagram", "relations", "orm", "keys", "source"] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={tab === t}
                            onClick={() => setTab(t)}
                            className={cn(
                                "px-3 py-1.5 transition-colors",
                                tab === t ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium" : "text-muted-foreground hover:bg-muted/60"
                            )}
                        >
                            {t === "diagram"
                                ? "Schema Diagram"
                                : t === "relations"
                                    ? "Relations"
                                    : t === "orm"
                                        ? "ORM Models"
                                        : t === "keys"
                                            ? "Keys & Columns"
                                            : "SQL Source"}
                        </button>
                    ))}
                </div>
                {/* copy the generated ORM models / relations report.
 the ORM tab also carries the FLAVOR selector
            (SQLAlchemy / Django / Prisma) — each generates from the same
            parsed DDL. */}
                {(tab === "orm" || tab === "relations") && (
                    <>
                        {tab === "orm" && (
                            <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5"
                                 role="group" aria-label="ORM flavor">
                                {(["sqlalchemy", "django", "prisma"] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setOrmFlavor(f)}
                                        aria-pressed={ormFlavor === f}
                                        title={f === "sqlalchemy" ? "SQLAlchemy 2.0 declarative models" : f === "django" ? "Django models with ForeignKey + Meta.db_table" : "Prisma schema with @relation pairs"}
                                        className={cn(
                                            "h-6 rounded px-2 text-[11px] font-medium transition-colors",
                                            ormFlavor === f
                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                        )}
                                    >
                                        {f === "sqlalchemy" ? "SQLAlchemy" : f === "django" ? "Django" : "Prisma"}
                                    </button>
                                ))}
                            </div>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => {
                                void navigator.clipboard?.writeText(tab === "orm" ? ormCode : relationsText).then(() =>
                                    toast({
                                        title: tab === "orm" ? "ORM models copied" : "Relations copied",
                                        variant: "success"
                                    })
                                );
                            }}
                            title={tab === "orm" ? `Copy the generated ${ormFlavor === "django" ? "Django" : ormFlavor === "prisma" ? "Prisma" : "SQLAlchemy"} output` : "Copy the relations report"}
                        >
                            <Copy className="size-3"/> Copy
                        </Button>
                    </>
                )}
                <span className="text-[11px] text-muted-foreground" title={fileName}>
          {tables.length} table{tables.length === 1 ? "" : "s"} · {relations} relation{relations === 1 ? "" : "s"}
                    {schema.skipped.length > 0 && ` · ${schema.skipped.length} non-table statement${schema.skipped.length === 1 ? "" : "s"} not shown`}
        </span>
                {focused && (
                    <span
                        className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            {focused}
          </span>
                )}
            </div>
            {tab === "source" ? (
                <div className="min-h-0 flex-1 overflow-auto">{rawView}</div>
            ) : (
                <div
                    className="min-h-0 flex-1 overflow-auto"
                    style={{zoom: fontScale === 1 ? undefined : fontScale}}
                >
                    {tab === "diagram" ? (
                        <SchemaDiagram tables={tables} onPickTable={setFocused}/>
                    ) : tab === "relations" ? (
                        <pre className="p-4 font-mono text-xs whitespace-pre-wrap" aria-label="Foreign key relations">
            {relationsText}
          </pre>
                    ) : tab === "orm" ? (
                        <div className="space-y-2 p-3">
                            <p className="text-[11px] text-muted-foreground">
                                {ormFlavor === "django"
                                    ? "Django models generated from this file's CREATE TABLE / FOREIGN KEY statements — one model per table, ForeignKey fields with on_delete, Meta.db_table preserved (managed = False: the tables already exist). Copy into an app's models.py."
                                    : ormFlavor === "prisma"
                                        ? "Prisma schema generated from the same DDL — models with @@map to the real table names, @relation pairs for every foreign key. Copy into schema.prisma and adjust the datasource provider."
                                        : "SQLAlchemy 2.0 declarative models generated from this file's CREATE TABLE / FOREIGN KEY statements — one class per table, ForeignKey() columns and paired relationship()s. Copy into a models.py and adjust nullability to taste."}
                            </p>
                            <pre className="rounded-md border bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap"
                                 aria-label={`Generated ${ormFlavor} output`}>
              {ormCode}
            </pre>
                        </div>
                    ) : tab === "keys" ? (
                        /* Keys & columns — the per-table inventory the
             diagram renders graphically, as scannable cards. */
                        <div className="space-y-3 p-3">
                            {tables.map((t) => {
                                const fks = t.fks ?? [];
                                return (
                                    <div key={t.name} className="rounded-md border overflow-hidden">
                                        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                                            <span className="font-mono text-[13px] font-semibold">{t.name}</span>
                                            <span className="text-[10px] text-muted-foreground">
                      {t.columns.length} column{t.columns.length === 1 ? "" : "s"}
                                                {fks.length > 0 ? ` · ${fks.length} FK${fks.length === 1 ? "" : "s"}` : ""}
                    </span>
                                            <span className="ml-auto text-[10px] text-muted-foreground">
                      PK: {t.columns.filter((c) => c.pk).map((c) => c.name).join(", ") || "—"}
                    </span>
                                        </div>
                                        <table className="w-full text-left text-[13px]">
                                            <tbody>
                                            {t.columns.map((c) => {
                                                const fk = fks.find((f) => f.from === c.name);
                                                return (
                                                    <tr key={c.name}
                                                        className="border-b last:border-b-0 hover:bg-muted/30">
                                                        <td className="px-3 py-1 font-mono">
                                                            {c.name}
                                                            {c.pk && <span
                                                              className="ml-1.5 rounded bg-amber-500/15 px-1 text-[9px] text-amber-600 dark:text-amber-400">PK</span>}
                                                            {fk && <span
                                                              className="ml-1.5 rounded bg-sky-500/15 px-1 text-[9px] text-sky-600 dark:text-sky-400">FK</span>}
                                                        </td>
                                                        <td className="px-3 py-1 font-mono text-muted-foreground">{c.type}</td>
                                                        <td className="px-3 py-1 text-muted-foreground">
                                                            {fk ? `→ ${fk.table}.${fk.to}` : ""}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

/* PERF: React.memo — the parent page re-renders on every app-level
 * state change; keep the viewer out of unrelated re-renders. All props
 * are stable on the page side (useCallback / state values). */
const FileViewerInner = ({
                             fileName,
                             fileKind,
                             folderSlug,
                             fileSlug,
                             initialContent = "",
                             onSaveEdit,
                             autoSaveDelayMs = 0,
                             formatSwitchDelayMs = 10,
                             loading = false,
                             lineHeight = 1.6,
                             letterSpacing = 0,
                             siblingImages,
                             onOpenChart,
                             onOpenTransform,
                             onOpenWorkbench,
                             onDirtyChange,
                             onContentKnown,
                             onRun,
                             onRunSelection,
                             onAiPrompt,
                             runStatus,
                             codeSyntaxTheme,
                             rulerColumn = 0,
                             rulerLineWidth = 1,
                             mdPreviewWidth = "medium",
                             onOpenFolder,
                         }: FileViewerProps): React.ReactElement => {
    // KaTeX loads lazily after mount (own async chunk).
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === "dark";
    /* Shared code theme (lib/code-themes) — the SAME 24-theme registry
  * and the SAME praxis.code-theme key the Python editor's bar uses,
  * so a pick in either viewer restyles both (the unification
  * request). The settings-saved listener keeps it LIVE: python's
  * picker dispatches the event after saveCodeTheme — and so does
  * ours (symmetry). */
    const [srcThemeId, setSrcThemeId] = React.useState("follow");
    const [srcThemeMounted, setSrcThemeMounted] = React.useState(false);
    React.useEffect(() => {
        setSrcThemeId(loadCodeTheme());
        setSrcThemeMounted(true);
        const reread = () => setSrcThemeId(loadCodeTheme());
        window.addEventListener("praxis:settings-saved", reread);
        return () => window.removeEventListener("praxis:settings-saved", reread);
    }, []);
    const srcThemeEntry = resolveCodeThemeEntry({
        mounted: srcThemeMounted,
        localId: srcThemeId,
        settingsTheme: codeSyntaxTheme,
        isDark
    });
    // the paintable code background — the "follow" entry's bg is the
    // picker's grey PLACEHOLDER; follow resolves by family (One Dark /
    // One Light) through codeBgFor (same rule the Python editor uses).
    const srcCodeBg = codeBgFor(srcThemeEntry, isDark);
    const srcRsStyle = srcThemeEntry.rsStyle;
    // the read-mode context menu's "Copy all" confirmation.
    const {toast} = useToast();

    // Build the file URL once. The URL is stable per (folder, file) pair.
    // Built via the shared helper so it byte-matches the URL the click
    // handler's prefetch starts.
    const fileUrl = React.useMemo(() => {
        if (!folderSlug || !fileSlug) return "";
        return fileUrlFor(folderSlug, fileSlug);
    }, [folderSlug, fileSlug]);

    // For text-based kinds, fetch the content via the same /api/file
    // endpoint (which returns text/* with charset=utf-8).
    const [content, setContent] = React.useState(initialContent);
    /* the `content` state can be
   *  STALE for a frame or two after a file switch — the new fetch is
   *  still in flight while the OLD file's text sits in state. The
   *  Markdown-studio seed used to grab that stale text (a .sql file's
   *  content showed up inside the studio of the NEXT markdown file —
   *  the "overlapping / wrong content" reports). This ref records the
   *  fileUrl the CURRENT content belongs to; seeding only happens
   *  when they match. */
    const contentForUrlRef = React.useRef("");
    const [contentTruncated, setContentTruncated] = React.useState(false);
    const [editMode, setEditMode] = React.useState(false);
    /* the consolidated HTML toolbar — ONE place for
   * every HTML option instead of controls scattered around the view.
   * `htmlLayout` is the mode (Preview | Split | Source) used by BOTH
   * read and edit mode; `htmlWrap` toggles source wrapping; Format
   * runs lib/html-format.ts (beautify with verbatim raw regions).
   * The old footer "Show/Hide preview" button is gone. */
    const [htmlLayout, setHtmlLayout] = React.useState<"preview" | "split" | "source">(() => {
        // Plan 2b — the HTML layout + wrap now persist with the SAME key
        // pattern the other editor prefs use (`praxis.<pref>`, the
        // mdViewMode / mdSourceWrap family). Previously both reset on
        // every file switch / reload — flipping wrap on one HTML file
        // then opening another silently lost the choice.
        try {
            const saved = window.localStorage.getItem("praxis.htmlLayout");
            if (saved === "preview" || saved === "split" || saved === "source") return saved;
        } catch { /* ignore */
        }
        return "split";
    });
    React.useEffect(() => {
        try {
            window.localStorage.setItem("praxis.htmlLayout", htmlLayout);
        } catch { /* ignore */
        }
    }, [htmlLayout]);
    const [htmlWrap, setHtmlWrap] = React.useState(() => {
        try {
            return window.localStorage.getItem("praxis.htmlWrap") === "on";
        } catch {
            return false;
        }
    });
    React.useEffect(() => {
        try {
            window.localStorage.setItem("praxis.htmlWrap", htmlWrap ? "on" : "off");
        } catch { /* ignore */
        }
    }, [htmlWrap]);
    const [editContent, setEditContent] = React.useState("");

    // ─── EDIT-MODE SYNTAX COLORING for non-Python files ────
    // The Python editor always had a Prism backdrop behind its
    // transparent-text textarea; the FileViewer edit mode was a bare
    // textarea — “no coloring for non-py files in view AND edit modes”.
    // A Prism (or plain, while typing) backdrop now renders behind the
    // textarea for every kind with a registered grammar. Re-tokenizing
    // on every keystroke is the perf trap CodeViewer avoids, so while
    // the user is TYPING (or for buffers past 40 K chars) the backdrop
    // is a plain <pre> with identical metrics; the colors return ~160 ms
    // after the typing pause.
    const editPrismLanguage = jsxLanguageFor(fileKind, fileName);
    const [editHighlightCold, setEditHighlightCold] = React.useState(true);
    React.useEffect(() => {
        if (!editMode) return;
        setEditHighlightCold(false);
        const t = setTimeout(() => setEditHighlightCold(true), 160);
        return () => clearTimeout(t);
    }, [editMode, editContent]);
    const editBackdropActive = editMode && editPrismLanguage !== undefined;
    const editBackdropPlain = !editHighlightCold || editContent.length > 40_000;

    // AUTO-GROW the edit textarea so the BACKDROP (and the
    // spell overlay) extend to the full content height and the outer
    // scroll container scrolls — the textarea must never scroll
    // internally or the layers drift apart. `field-sizing: content`
    // handles it natively (Chrome/Edge 123+); older engines get the JS
    // fallback that fits the height to scrollHeight on every change.
    const fieldSizingSupported = React.useMemo(() => {
        if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
        try {
            return CSS.supports("field-sizing", "content");
        } catch {
            return false;
        }
    }, []);
    React.useEffect(() => {
        if (!editMode || fieldSizingSupported) return;
        const ta = editTextareaRef.current;
        if (!ta) return;
        const fit = () => {
            ta.style.height = "auto";
            ta.style.height = `${ta.scrollHeight}px`;
        };
        fit();
    }, [editMode, editContent, htmlWrap, fieldSizingSupported]);
    const [saving, setSaving] = React.useState(false);
    const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");
    const [fetchError, setFetchError] = React.useState<string | null>(null);
    const [contentLoading, setContentLoading] = React.useState(true);
    // Media kinds keep their skeleton until the element fires onLoad /
    // onCanPlay / onLoadedData — the fetch effect clears contentLoading
    // immediately for them (nothing to fetch as text).
    const [mediaLoaded, setMediaLoaded] = React.useState(false);
    /** A confirmed media load FAILURE (missing file / unsupported
     *  format) — replaces the skeleton overlay with an error card so a
     *  broken media file never shows an eternal skeleton. Cleared on
     *  every file switch. */
    const [mediaError, setMediaError] = React.useState<string | null>(null);
    /** ARCHIVES: the reveal state for the zip/rar/7z/tar/gz branch —
     *  a SET of already-revealed file URLs, not a boolean. The reveal
     *  flag is DERIVED from it (archiveReady = set.has(fileUrl)), so a
     *  file switch can never WIPE a reveal that already committed.
     *
     *  WHY NOT A BOOLEAN: ArchiveTools fires onReady from a CHILD
     *  effect, and React runs child effects BEFORE the parent's
     *  file-switch reset effect. With a boolean, the reset
     *  (setArchiveReady(false)) ran AFTER the child's immediate reveal
     *  (setArchiveReady(true)) and wiped it — and since neither the
     *  singleStream flag nor the onReady identity changed again, no
     *  further reveal ever fired: the eternal "Loading Notes.md.xz…"
     *  overlay (any archive re-open, and any first open after another
     *  file had been open longer than the skeleton min-window — the
     *  stale-clock immediate-reveal path). A derived set needs no reset
     *  at all, which removes the race entirely. */
    const [archiveRevealedUrls, setArchiveRevealedUrls] = React.useState<Set<string>>(() => new Set());
    // The archive overlay is up until the CURRENT file's URL is in the revealed set.
    const archiveReady = archiveRevealedUrls.has(fileUrl);
    // the notebook view reports its own dirty
    // state upward (its per-cell edits never touched editContent, so
    // the tab/tree switch guard never fired for .ipynb).
    const [nbDirty, setNbDirty] = React.useState(false);
    // .env form-editor dirtiness (EnvEditor's onDirtyChange) — feeds
    // the dirty-report effect so the guard covers .env edits too.
    const [envDirty, setEnvDirty] = React.useState(false);
    // the .env form's ACTIVITY gate (single source for the dirty gate
    // + the save-request flush below). `locked` is declared later in the
    // component, so it is checked where the form renders; when the form
    // is gone the effect below resets the flag.
    const envFormActive =
        fileKind === "text" && fileName.toLowerCase().endsWith(".env") && !!onSaveEdit;
    const nbDirtyRef = React.useRef(false);
    React.useEffect(() => {
        nbDirtyRef.current = nbDirty;
    }, [nbDirty]);
    /* — MINIMUM SKELETON DISPLAY: the click-time prefetch
* (FILE-OPEN SPEED) usually resolves before the viewer even mounts,
* so the kind-aware skeleton flashed for a single frame and the
* user "never saw it" (their report). Every reveal — the text fetch
* completing, or the media element firing onLoad / onCanPlay /
* onLoadedData — is held for the remainder of SKELETON_MIN_MS, so
* the per-type skeleton (with the shimmer sweep) is always VISIBLE
* and MOVING for at least this long. 420ms: short enough to never
* feel slow, long enough to read the shape. */
    const SKELETON_MIN_MS = 420;
    const skeletonStartRef = React.useRef(0);
    /** The URL the skeleton clock was last stamped for. */
    const skeletonStampedUrlRef = React.useRef<string | null>(null);
    // STAMP THE CLOCK DURING RENDER on every file switch. Child effects
    // (ArchiveTools' onReady) run BEFORE the parent's effects, so an
    // effect-phase stamp was always too late for the first child
    // measurement: the clock still held the PREVIOUS file's stamp, the
    // elapsed time already exceeded SKELETON_MIN_MS, and the reveal
    // fired synchronously inside the child-effect phase — the exact
    // window the parent's reset then wiped (the archive stuck-loading
    // race). Stamping during render guarantees every child measures a
    // FRESH clock, so the reveal always lands on the deferred timer,
    // safely after all effects of the commit.
    if (fileUrl !== skeletonStampedUrlRef.current) {
        skeletonStampedUrlRef.current = fileUrl;
        skeletonStartRef.current = Date.now();
    }
    const revealWhenReady = React.useCallback((reveal: () => void) => {
        // Measure the elapsed skeleton time against the stamped clock.
        const elapsed = Date.now() - (skeletonStartRef.current || Date.now());
        // Hold the skeleton for the remainder of the minimum window.
        const wait = SKELETON_MIN_MS - elapsed;
        // Reveal immediately when the window has already elapsed.
        if (wait <= 0) {
            reveal();
            return;
        }
        // Otherwise defer the reveal to the end of the window.
        window.setTimeout(() => reveal(), wait);
    }, []);
    /** Reveal a media/archive surface. The FIRST load of a given URL
     *  holds its kind-aware skeleton for the SKELETON_MIN_MS window;
     *  a RE-open of an already-revealed URL reveals the instant its
     *  content confirms — no min-window re-play, so switching tabs
     *  back into a loaded file never flickers a skeleton at the user
     *  (the media bytes come from the browser HTTP cache; the archive
     *  listing re-reads but paints the moment it lands). */
    const revealedUrlsRef = React.useRef<Set<string>>(new Set());
    const revealSurface = React.useCallback(
        (reveal: () => void) => {
            if (revealedUrlsRef.current.has(fileUrl)) {
                reveal();
                return;
            }
            revealedUrlsRef.current.add(fileUrl);
            revealWhenReady(reveal);
        },
        [fileUrl, revealWhenReady]
    );
    /** Stable archive reveal — ArchiveTools' onReady effects key on this
     *  identity, so it must not churn on every render. Adds the CURRENT
     *  file's URL to the revealed set (a no-op when already revealed). */
    const revealArchive = React.useCallback(() => {
        revealSurface(() => {
            setArchiveRevealedUrls((prev) => {
                // Keep the previous Set object when the URL is already revealed.
                if (prev.has(fileUrl)) {
                    return prev;
                }
                // Copy the set and add the current URL otherwise.
                const next = new Set(prev);
                next.add(fileUrl);
                return next;
            });
        });
    }, [revealSurface, fileUrl]);
    /** ARCHIVE SAFETY REVEAL: if the reveal has not landed within 10 s
     *  (a hung lazy chunk, a dead fetch, a swallowed exception in
     *  ArchiveTools), reveal anyway — an eternal skeleton is never an
     *  acceptable surface, and whatever rendered underneath (an error
     *  boundary card, a partial listing) is strictly more useful than a
     *  motionless "Loading…" overlay. The timer re-arms per file and
     *  cancels the moment the real reveal commits. */
    React.useEffect(() => {
        // Skip entirely once the current archive is already revealed.
        if (archiveReady) {
            return;
        }
        // Arm the 10 s fallback reveal for this file.
        const safetyTimer = window.setTimeout(() => {
            // Mark the URL revealed regardless of what ArchiveTools reported.
            setArchiveRevealedUrls((prev) => {
                // Keep the set object when the URL is already present.
                if (prev.has(fileUrl)) {
                    return prev;
                }
                // Copy the set and add the current URL otherwise.
                const next = new Set(prev);
                next.add(fileUrl);
                return next;
            });
        }, 10_000);
        // Cancel the fallback when the real reveal lands or the file switches.
        return () => {
            window.clearTimeout(safetyTimer);
        };
    }, [archiveReady, fileUrl]);
    /** MEDIA SAFETY REVEAL — the same net for the media kinds (image /
     *  video / audio / pdf): their reveal rides on browser media events
     *  (onLoad / onCanPlay / iframe onLoad). A race between a cached
     *  fast-firing event and the file-switch state reset (observed once
     *  with a small cached .wav during a mid-navigation reload) could
     *  leave mediaLoaded false with no further event ever coming — an
     *  eternal "Loading…" bar. After 10 s the overlay drops whatever
     *  happened; the element underneath is loaded media or its own
     *  error state by then. Errors (mediaError) cancel the net — the
     *  error card replaces the overlay through its own path. */
    const mediaKindsForSafety =
        fileKind === "image" || fileKind === "video" || fileKind === "audio" || fileKind === "pdf";
    React.useEffect(() => {
        // Only the media kinds need the net.
        if (!mediaKindsForSafety) {
            return;
        }
        // Nothing to do once the media is revealed.
        if (mediaLoaded) {
            return;
        }
        // Nothing to do when the error card already owns the surface.
        if (mediaError) {
            return;
        }
        // Arm the 10 s fallback reveal.
        const mediaSafetyTimer = window.setTimeout(() => {
            // Drop the overlay unconditionally.
            setMediaLoaded(true);
        }, 10_000);
        // Cancel the fallback when the real reveal, an error, or a file switch lands.
        return () => {
            window.clearTimeout(mediaSafetyTimer);
        };
    }, [mediaKindsForSafety, mediaLoaded, mediaError, fileUrl]);
    const autoSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Pending view-mode format/indent apply — the switch-then-apply
     *  pause (Settings → Formatting, default 10 ms). Cleared on file
     *  switch + unmount so a slow configured delay can never land the
     *  formatted text in the WRONG file. */
    const pendingFormatTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const editTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    // ─── in-file Find & Replace bar (Navigate > Find... / Ctrl+F) ──
    //    The non-Python twin of the Python editor's find bar: matches
    //    over the EDIT buffer when editing, over the rendered view via
    // the browser's find when reading. Plan 3b upgrades it to the
    //    full Find & Replace: case-sensitive (Aa), whole-word (|w|),
    //    regex (.*), replace-next, replace-ALL with a confirm-count
    //    step — the Python editor's bar keeps its own twin.
    const [findOpen, setFindOpen] = React.useState(false);
    const [findQuery, setFindQuery] = React.useState("");
    const [findIndex, setFindIndex] = React.useState(0);
    const findInputRef = React.useRef<HTMLInputElement | null>(null);
    // The modifier toggles. Defaults keep the ORIGINAL
    // behavior: case-insensitive, substring, literal.
    const [findCaseSensitive, setFindCaseSensitive] = React.useState(false);
    const [findWholeWord, setFindWholeWord] = React.useState(false);
    const [findRegex, setFindRegex] = React.useState(false);
    const [replaceOpen, setReplaceOpen] = React.useState(false);
    const [replaceQuery, setReplaceQuery] = React.useState("");
    /** Pending replace-ALL confirmation — the count to confirm
     *  destructive bulk edits ask first). Null = no dialog. */
    const [confirmReplaceAllCount, setConfirmReplaceAllCount] = React.useState<number | null>(null);
    const replaceInputRef = React.useRef<HTMLInputElement | null>(null);

    const openFindBar = React.useCallback(() => {
        setFindOpen(true);
        // prefill from the live selection (the Python editor does the same)
        const sel = editMode ? null : window.getSelection();
        const ta = editTextareaRef.current;
        let prefill = "";
        if (editMode && ta && ta.selectionStart !== ta.selectionEnd) {
            prefill = editContent.slice(ta.selectionStart, ta.selectionEnd);
        } else if (sel && sel.toString().trim()) {
            prefill = sel.toString();
        }
        if (prefill.trim()) setFindQuery(prefill.slice(0, 120));
        requestAnimationFrame(() => findInputRef.current?.focus());
    }, [editMode, editContent]);

    const findMatchesRef = React.useRef<number[]>([]);
    /** The compiled matcher — literal / case / whole-word / regex aware.
     *  Returns the match OFFSETS against the active text (edit buffer
     *  while editing, disk text otherwise; the replace actions only
     *  operate in edit mode like the Python editor's). */
    const computeFindMatches = React.useCallback((): number[] => {
        const q = findQuery;
        if (!q) return [];
        const hay = editMode ? editContent : content;
        if (typeof hay !== "string") return [];
        const out: number[] = [];
        if (findRegex) {
            // Regex mode: the pattern must compile; a broken one yields no
            // matches (the bar shows 0 — no throw mid-typing).
            try {
                const flags = findCaseSensitive ? "g" : "gi";
                const re = new RegExp(q, flags);
                let m: RegExpExecArray | null;
                while ((m = re.exec(hay)) !== null && out.length < 9999) {
                    out.push(m.index);
                    if (m[0].length === 0) re.lastIndex++; // zero-width — advance
                }
            } catch {
                return [];
            }
            return out;
        }
        const wordish = /^[A-Za-z0-9_]+$/.test(q);
        const needle = findCaseSensitive ? q : q.toLowerCase();
        const lower = findCaseSensitive ? hay : hay.toLowerCase();
        let i = lower.indexOf(needle);
        while (i !== -1 && out.length < 9999) {
            if (findWholeWord && wordish) {
                const beforeOk = i === 0 || !/[A-Za-z0-9_]/.test(hay[i - 1]);
                const afterOk = i + needle.length >= hay.length || !/[A-Za-z0-9_]/.test(hay[i + needle.length]);
                if (beforeOk && afterOk) out.push(i);
            } else {
                out.push(i);
            }
            i = lower.indexOf(needle, i + Math.max(1, needle.length));
        }
        return out;
    }, [editMode, editContent, content, findQuery, findCaseSensitive, findWholeWord, findRegex]);

    /** PERF NIT: the bar used to call computeFindMatches()
     *  TWICE per render — once for the "N matches" count and once per
     *  disabled check — a full buffer scan duplicated on every keystroke
     *  while the bar was open. The list is now memoized ONCE (keyed on
     *  exactly the matcher's own inputs: the active buffer, the query
     *  and the three modifiers) and reused for the count label, the
     *  Replace buttons' enablement and the navigation clicks. */
    const findMatchList = React.useMemo(() => computeFindMatches(), [computeFindMatches]);

    /** The length of the match at `start` — regex matches vary, the
     *  literal modes all use the query length. */
    const matchLengthAt = React.useCallback(
        (start: number): number => {
            if (!findRegex) return findQuery.length;
            try {
                const m = new RegExp(findQuery, findCaseSensitive ? "" : "i").exec(
                    (editMode ? editContent : content).slice(start)
                );
                return m ? m[0].length : findQuery.length;
            } catch {
                return findQuery.length;
            }
        },
        [findRegex, findQuery, findCaseSensitive, editMode, editContent, content]
    );

    const gotoFindMatch = React.useCallback((idx: number) => {
        const matches = findMatchesRef.current;
        if (matches.length === 0) return;
        const wrapped = ((idx % matches.length) + matches.length) % matches.length;
        setFindIndex(wrapped);
        const start = matches[wrapped];
        const end = start + matchLengthAt(start);
        if (editMode) {
            const ta = editTextareaRef.current;
            if (ta) {
                ta.focus();
                ta.setSelectionRange(start, end);
                // scroll the match into view: approximate by scrolling the
                // container to the match's line.
                const line = (editContent.slice(0, start).match(/\n/g) ?? []).length;
                ta.scrollTop = Math.max(0, line * 21 - 80);
            }
        } else {
            // view mode — let the browser find + highlight it
            const w = window as unknown as { find?: (q: string) => boolean };
            if (typeof w.find === "function") w.find(findQuery);
        }
    }, [editMode, editContent, findQuery, matchLengthAt]);

    const onFindKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setFindOpen(false);
        } else if (e.key === "Enter") {
            e.preventDefault();
            findMatchesRef.current = computeFindMatches();
            gotoFindMatch(e.shiftKey ? findIndex - 1 : findIndex + 1);
        }
    }, [computeFindMatches, gotoFindMatch, findIndex]);

    // ─── Replace actions, edit mode only — view mode keeps
    // Mirror layers over the edit textarea: the Prism/plain backdrop and
    // the spell overlay. Both are absolute inset-0 with overflow-hidden —
    // they must follow the textarea's scrollTop/scrollLeft or the colors
    // AND the wavy underlines drift to the wrong lines (edit / format /
    // indent passes move the scroll position without a user scroll).
    const editBackdropRef = React.useRef<HTMLDivElement | null>(null);
    const editSpellOverlayRef = React.useRef<HTMLDivElement | null>(null);
    /** the passive highlight layer (selection occurrences + bracket
     *  pair + extra carets) — same positioning pattern as the spell
     *  overlay, scroll-synced with the other mirrors below. */
    const editOccLayerRef = React.useRef<HTMLDivElement | null>(null);
    /** the column-ruler layer — the Python editor's guide, drawn over
     *  the edit textarea's Prism backdrop and scroll-synced with it. */
    const editRulerLayerRef = React.useRef<HTMLDivElement | null>(null);
    /** measured per-glyph advance of the edit textarea's fixed 13px
     * mono font — the ruler's left offset derives from it. */
    const editProbeRef = React.useRef<HTMLSpanElement | null>(null);
    const [editCharWidth, setEditCharWidth] = React.useState(7.8);
    React.useLayoutEffect(() => {
        if (!editMode) return;
        if (editProbeRef.current) {
            const w = editProbeRef.current.getBoundingClientRect().width;
            if (w > 0) setEditCharWidth(w / 100);
        }
    }, [editMode, fileKind]);
    const syncEditMirrorScroll = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        // The ruler layer joins the mirrors — a horizontally scrolled
        // buffer must drag the column guide left with the text, or the
        // ruler points at the wrong column. (The occurrence/bracket/
        // multi-caret layer joins for the same reason.)
        for (const layer of [editBackdropRef.current, editSpellOverlayRef.current, editRulerLayerRef.current, editOccLayerRef.current]) {
            if (layer) {
                layer.scrollTop = ta.scrollTop;
                layer.scrollLeft = ta.scrollLeft;
            }
        }
    }, []);
    // Re-align the mirror layers right after every buffer rewrite —
    // typing, Auto-format, Auto-indent, undo/redo and the view-mode
    // switch-then-apply flow can all move the caret / scroll position
    // without firing a user scroll event first.
    React.useEffect(() => {
        const raf = requestAnimationFrame(() => syncEditMirrorScroll());
        return () => cancelAnimationFrame(raf);
    }, [editContent, editMode, syncEditMirrorScroll]);
    // seeds the Markdown studio buffer per file —
    // the studio textarea is driven by editContent, so it must be
    // populated from disk the first time studio opens.
    const studioSeedRef = React.useRef<string | null>(null);
    // ─── undo/redo for PROGRAMMATIC buffer rewrites ─────────
    // The viewer's editor is a plain textarea — a programmatic value
    // write (Auto-format / Auto-indent replacing the buffer) destroys
    // the browser's native undo history, so Ctrl+Z was dead after a
    // format ("activate CTRL+Z with auto format and auto indent also").
    // Every formatting push snapshots {content, selStart, selEnd}
    // here; Ctrl+Z pops one (falling through to the NATIVE undo once the
    // stack is empty, so typing undo keeps working). Snapshot pushes
    // ONLY happen for programmatic rewrites — native typing keeps its
    // own browser stack.
    interface FmtUndoSnapshot {
        content: string;
        selStart: number;
        selEnd: number;
    }

    const fmtUndoRef = React.useRef<FmtUndoSnapshot[]>([]);
    const fmtRedoRef = React.useRef<FmtUndoSnapshot[]>([]);
    /** Ref-stash for the plan-1d immediate spell re-check — handleSave
     * (declared above the spell block) calls it without a forward
     * reference; the spell section assigns the live callback below. */
    const spellRecheckRef = React.useRef<(text: string) => void>(() => {
    });
    /** Mirror of editContent (the ref survives into callbacks without
     *  re-creating them — the pop helpers below run long after render). */
    const editContentRef = React.useRef("");
    editContentRef.current = editContent;
    /** Push a programmatic-rewrite snapshot. `override` lets the
     *  VIEW-mode format path snapshot the file's ORIGINAL disk text —
     *  the live editContentRef still holds the PREVIOUS file's buffer
     *  (often ""), so Ctrl+Z after a view-mode Auto-format would have
     *  popped back to an EMPTY buffer instead of the pre-format text. */
    const pushFmtUndo = React.useCallback((override?: string) => {
        const ta = editTextareaRef.current;
        fmtUndoRef.current.push({
            content: override !== undefined ? override : editContentRef.current,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0,
        });
        // Deep undo widened the ring to 100 entries — the
        // periodic TYPING snapshots below ride the same stack, so a long
        // editing session keeps a deeper past (oldest still drops first).
        if (fmtUndoRef.current.length > 100) fmtUndoRef.current.shift();
        fmtRedoRef.current = [];
    }, []);

    /* ─── DEEP UNDO typing snapshots ─────────────────────
   * The fmt stack used to hold ONLY programmatic rewrites, so Ctrl+Z
   * after 200 keystrokes of plain typing could only fall back to the
   * browser's native (char-granular) undo — fine, but there was no way
   * to jump back to ~30-keystroke checkpoints. The edit textarea's
   * onChange counts keystrokes here; every ~30th (and blur) pushes a
   * snapshot of the CURRENT buffer into the SAME ring, deduped so a
   * no-op blur never grows the stack. Ctrl+Z order is unchanged: fmt
   * stack first, native typing undo after. */
    const keystrokesSinceSnapshotRef = React.useRef(0);
    const pushTypingSnapshot = React.useCallback(() => {
        const top = fmtUndoRef.current[fmtUndoRef.current.length - 1];
        if (top && top.content === editContentRef.current) return; // dedupe
        pushFmtUndo();
    }, [pushFmtUndo]);
    /** Count one user keystroke (called from the edit textarea's
     * onChange) — snapshot + reset exactly on the pacing cadence. */
    const countTypingKeystroke = React.useCallback(() => {
        keystrokesSinceSnapshotRef.current += 1;
        if (shouldSnapshotTyping(keystrokesSinceSnapshotRef.current)) {
            keystrokesSinceSnapshotRef.current = 0;
            pushTypingSnapshot();
        }
    }, [pushTypingSnapshot]);
    // (popFmtUndo / popFmtRedo live right after handleEditChange —
    //  they need it in their closure.)

    // ─── State: studio / grid / zoom / lock / validation ────
    /** MARKDOWN REDESIGN — a coherent two-level mode model:
     *    ▸ the FILE-level View | Edit control drives everything (like
     *      every other kind): View = the rendered Preview (or the
     *      read-only Source toggle), Edit = the Markdown STUDIO (the
     *      split editor + live preview + outline).
     *  mdViewMode is the VIEW-side sub-mode — "preview" (rendered
     *  prose) or "source" (highlighted raw markdown, read-only). A
     *  legacy stored "studio" value maps to "preview" (that surface
     *  is now the Edit side). Sticks across files in localStorage
     *  ("praxis.mdViewMode") like the HTML layout modes. */
    const [mdViewMode, setMdViewMode] = React.useState<"preview" | "source">(() => {
        try {
            const saved = window.localStorage.getItem("praxis.mdViewMode");
            if (saved === "preview" || saved === "source") return saved;
        } catch { /* ignore */
        }
        return "preview";
    });
    React.useEffect(() => {
        try {
            window.localStorage.setItem("praxis.mdViewMode", mdViewMode);
        } catch { /* ignore */
        }
    }, [mdViewMode]);
    /** The SOURCE mode's OWN word-wrap toggle (persisted like the mode
     *  itself). It used to borrow the HTML layout's `htmlWrap` state —
     *  toggling wrap on an HTML file silently flipped the Markdown
     *  source view too; the two kinds have nothing to do with each
     *  other, so the mode gets an independent, remembered choice. */
    const [mdSourceWrap, setMdSourceWrap] = React.useState(() => {
        try {
            return window.localStorage.getItem("praxis.mdSourceWrap") === "on";
        } catch {
            return false;
        }
    });
    React.useEffect(() => {
        try {
            window.localStorage.setItem("praxis.mdSourceWrap", mdSourceWrap ? "on" : "off");
        } catch { /* ignore */
        }
    }, [mdSourceWrap]);
    /** The STUDIO mode flag — for Markdown the EDIT mode IS the studio
     *  (the split editor + live preview). Every legacy guard (dirty
     *  checks, spell buffer, studio seeding) keeps reading it. */
    const mdStudio = fileKind === "markdown" && editMode;
    /** Editable grid mode for CSV / TSV / xlsx / parquet / feather. */
    const [gridEdit, setGridEdit] = React.useState(false);
    /** the classic PREVIEW outline rail —
     *  the scroll container ref + the active-heading tracker (hoisted
     *  here because hooks may not live inside the render branches). */
    const mdPreviewScrollRef = React.useRef<HTMLDivElement | null>(null);
    const [mdActiveHeading, setMdActiveHeading] = React.useState(-1);
    /* PERF: cached heading offsetTops for the preview's outline
   * scroll-spy — measured once per content/layout change (the effect
   * near the spell-recheck hook), so scrolling NEVER re-queries the
   * DOM per heading (a huge markdown document janked for hundreds of
   * ms per scroll frame doing exactly that). */
    const mdHeadingTopsRef = React.useRef<number[]>([]);
    const mdScrollRafRef = React.useRef<number | null>(null);
    /** Sheet data for the grid when the file is a binary spreadsheet
     *  (lazily fetched from /api/data-sheet on first grid toggle). */
    const [sheetForGrid, setSheetForGrid] = React.useState<{
        columns: string[];
        rows: unknown[][];
        totalRows?: number;
        totalCols?: number;
        sheets?: string[];
        sheet?: string;
    } | null>(null);
    const [sheetForGridError, setSheetForGridError] = React.useState<string | null>(null);
    // the missing reader package behind sheetForGridError (pandas /
    // openpyxl / pyarrow) — drives the card's Install-and-retry button.
    const [sheetMissingPkg, setSheetMissingPkg] = React.useState<string | null>(null);
    /** Per-kind zoom (persisted per FileKind in localStorage). */
    const [zoom, setZoom] = React.useState(1);
    /** Read-only lock (folder-tree "Lock read-only" per file). */
    const [locked, setLocked] = React.useState(false);
    /** Config validation results (yaml / toml / ini). */
    const [validation, setValidation] = React.useState<
        | { busy: boolean; issues: Array<{ message: string; line: number | null }> | null }
        | null
    >(null);

    // Fetch text content when the file changes.
    React.useEffect(() => {
        if (!fileUrl) return;
        // STAMP THE SKELETON CLOCK HERE — at the moment this file's
        // loading state begins. The old stamp lived only in the
        // reset-edit-state effect BELOW (which runs AFTER this one on a
        // file switch), so revealWhenReady measured against the PREVIOUS
        // file's stamp: elapsed was already past SKELETON_MIN_MS and the
        // reveal fired instantly — the kind-aware skeleton never painted
        // on any switch after the first (the "sometimes the skeleton is
        // not loading" report; archives compressed files were the most
        // visible because their listing is prefetched and instant).
        skeletonStartRef.current = Date.now();
        // Only fetch for text-renderable kinds (kept in sync with the
        // render-path and Edit-button lists below).
        const textKinds: FileKind[] = ["markdown", "text", "json", "yaml", "toml", "sql", "r", "shell", "html", "css", "csv", "ipynb", "log", "http",
            "javascript", "typescript", "matlab", "java", "c", "cpp",
            "ruby", "php", "go",
            "lua", "perl", "rust", "julia", "kotlin", "swift",
            "powershell", "batch",
            "zig", "dart", "groovy", "scala", "elixir",
            "haskell", "erlang", "clojure", "ocaml", "fsharp", "graphql"];
        if (!textKinds.includes(fileKind)) {
            // Non-text kinds (images / audio / video / PDF / ARCHIVES /
            // sqlite / spreadsheets / binaries…) used to clear the skeleton
            // state synchronously for everything except archives, so those
            // kinds never showed the kind-aware FileSkeleton. Media kinds
            // hold their own skeleton until their <img>/<video>/<pdf> onLoad
            // fires; ARCHIVES hold it while the ArchiveTools listing spins
            // up. SPREADSHEETS, SQLITE databases and unknown binary files
            // now hold it for the same minimum window too, and their child
            // components continue with their own loading state (the sheet's
            // table-shaped skeleton / the database schema skeleton) — every
            // file kind paints a skeleton, and it is only removed once the
            // content is actually loaded.
            const isMedia =
                fileKind === "image" || fileKind === "video" || fileKind === "audio" || fileKind === "pdf";
            const holdsOwnSkeleton =
                isArchiveFileName(fileName || "") || isMedia;
            if (holdsOwnSkeleton) {
                setContentLoading(true);
                revealWhenReady(() => setContentLoading(false));
            } else if (fileKind === "spreadsheet" || fileKind === "sqlite" || fileKind === "other") {
                // Sheets / databases / unknown binaries: hold the kind-aware
                // skeleton for the minimum window, then hand over to the
                // component's own loading state (which clears only on a
                // successful read — or its error card).
                setContentLoading(true);
                revealWhenReady(() => setContentLoading(false));
            } else {
                setContentLoading(false);
            }
            return;
        }
        let cancelled = false;
        setContentLoading(true);
        setFetchError(null);
        setContentTruncated(false);
        // invalidate the content→file mapping while the new
        // text is in flight (see contentForUrlRef above).
        contentForUrlRef.current = "";
        (async () => {
            // CACHE HIT (stale-while-revalidate): a file this viewer
            // already loaded this session paints INSTANTLY — no skeleton,
            // no min-window hold (that gate exists so the FIRST load's
            // skeleton is readable, not to re-play it on every tab switch
            // back — the reported "skeleton flicker on already-loaded
            // files"). A background no-store re-fetch follows; if the disk
            // copy changed (external edit, notebook save…), the fresh text
            // replaces the cached paint in place.
            const cached = fileContentCache.get(fileUrl);
            if (cached) {
                setContent(cached.content);
                setContentTruncated(cached.truncated);
                contentForUrlRef.current = fileUrl;
                setContentLoading(false);
                try {
                    const res = await (takePrefetched(fileUrl) ?? fetch(fileUrl, {cache: "no-store"}));
                    if (!res.ok || cancelled) return;
                    const text = await res.text();
                    if (cancelled || text === cached.content) return;
                    if (text.length > 1_000_000) {
                        setContent(text.slice(0, 1_000_000) + "\n…(truncated)");
                        setContentTruncated(true);
                    } else {
                        setContent(text);
                        setContentTruncated(false);
                    }
                    contentForUrlRef.current = fileUrl;
                } catch {
                    /* offline / fetch failure — the cached paint stands */
                }
                return;
            }
            try {
                // FILE-OPEN SPEED: if the click handler prefetched this URL,
                // await that in-flight promise — no duplicate request. The
                // fallback passes cache:"no-store" so the browser HTTP cache
                // can never hand back a PRE-SAVE copy of an edited text file
                // (the server also sends no-store for text kinds now — this
                // is the belt to that braces).
                const res = await (takePrefetched(fileUrl) ?? fetch(fileUrl, {cache: "no-store"}));
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                if (cancelled) return;
                // Cap at 1 MB to avoid blowing up the DOM.
                if (text.length > 1_000_000) {
                    setContent(text.slice(0, 1_000_000) + "\n…(truncated)");
                    setContentTruncated(true);
                } else {
                    setContent(text);
                }
                contentForUrlRef.current = fileUrl;
                // hold the skeleton for its minimum display window
                // (the prefetch makes the fetch resolve almost instantly —
                // without this gate the user never sees the skeleton).
                revealWhenReady(() => setContentLoading(false));
            } catch (err) {
                if (!cancelled) {
                    setFetchError((err as Error).message);
                    revealWhenReady(() => setContentLoading(false));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fileUrl, fileKind, revealWhenReady]);

    // CACHE COHERENCE MIRROR — every settled `content` that belongs to
    // the CURRENT file (the fetch above, a save, the CSV grid editor,
    // the .http serializer…) refreshes the session cache entry for this
    // URL, so the instant re-open path can never serve a pre-save copy.
    // The contentForUrlRef guard blocks the STALE frame during a file
    // switch (the old file's text while the new fetch is in flight).
    React.useEffect(() => {
        if (!fileUrl || !content) return;
        if (contentForUrlRef.current !== fileUrl) return;
        rememberFileContent(fileUrl, content, contentTruncated);
    }, [fileUrl, content, contentTruncated]);

    // report the loaded content up to the page — the Screenshot
    // Studio's Screenshot: code / Screenshot: selection render from it.
    // Only fires on settled loads (not on every keystroke — the edit-mode
    // buffer stays local until saved; a capture of an UNSAVED edit
    // falls back to the last saved content, which is what the disk
    // holds anyway). Keeps a stable identity: the page stores it in a
    // ref, so no re-render churn.
    React.useEffect(() => {
        if (!contentLoading && !fetchError && content) {
            onContentKnown?.({content, fileName});
        } else if (!contentLoading && !content) {
            onContentKnown?.({content: "", fileName});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content, fileName, contentLoading, fetchError]);

    // Reset edit state when the file changes.
    React.useEffect(() => {
        // stamp the skeleton clock — the minimum-display gate
        // below measures from THIS moment.
        skeletonStartRef.current = Date.now();
        // disarm any pending autosave timer before the
        // switch — the timer captured the previous file's buffer and
        // would write it into the newly selected file after it fired.
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        // same disarm for the pending view-mode format apply —
        // the formatted text belongs to the file it was computed from.
        if (pendingFormatTimer.current) {
            clearTimeout(pendingFormatTimer.current);
            pendingFormatTimer.current = null;
        }
        setEditMode(false);
        setEditContent("");
        // the studio buffer re-seeds for the next file.
        studioSeedRef.current = null;
        setSaveStatus("idle");
        setMediaLoaded(false);
        setMediaError(null);
        // NOTE: the archive reveal is NOT reset here — it is DERIVED from
        // archiveRevealedUrls (a per-URL set), so wiping it on file switch
        // is both unnecessary and racy (the old boolean reset ran AFTER
        // the child's onReady reveal and permanently re-hid the archive
        // viewer — the "Loading Notes.md.xz… forever" bug).
        // reset the new per-file modes + zoom (per KIND) + lock.
        setGridEdit(false);
        setSheetForGrid(null);
        setSheetForGridError(null);
        setValidation(null);
        // the markdown view mode is a PERSISTED preference — no
        // per-file reset (the old effect forced studio on every markdown
        // open, discarding a saved Preview/Source choice).
        try {
            const raw = window.localStorage.getItem("praxis.zoomByKind");
            const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
            setZoom(typeof map[fileKind] === "number" ? map[fileKind] : 1);
        } catch {
            setZoom(1);
        }
        setLocked(isFileLocked(folderSlug, fileSlug));
    }, [fileSlug, fileName, fileKind, folderSlug]);

    // seed the Markdown studio (edit-mode) buffer from disk
    // the first time the studio opens for this file — the studio textarea
    // is driven by editContent, so it must be populated from disk when
    // the Edit side opens (startEdit also seeds synchronously; this
    // effect is the backstop for programmatic entries such as
    // view-mode Auto-format).
    React.useEffect(() => {
        // only seed from content that BELONGS to this file —
        // during a file switch the state still holds the PREVIOUS file's
        // text for a moment (see contentForUrlRef). The editContent === ""
        // guard keeps the backstop from CLOBBERING a buffer that a
        // programmatic entry (view-mode Auto-format) already seeded.
        if (
            fileKind === "markdown" &&
            mdStudio &&
            studioSeedRef.current !== fileUrl &&
            contentForUrlRef.current === fileUrl &&
            content &&
            editContent === ""
        ) {
            studioSeedRef.current = fileUrl;
            setEditContent(content);
        }
    }, [fileKind, mdStudio, fileUrl, content, editContent]);

    // report the unsaved-buffer state (edit mode
    // or the Markdown studio) upward — the page asks Save / Discard
    // before a tab or tree switch drops the buffer.
    // notebooks join the guard — their edits live
    // in the NotebookView's own state, reported through nbDirty.
    React.useEffect(() => {
        if (!envFormActive) setEnvDirty(false);
        const dirty =
            (editContent !== "" &&
                editContent !== content &&
                (editMode || (fileKind === "markdown" && mdStudio))) ||
            (fileKind === "ipynb" && nbDirty) ||
            // .env form edits (EnvEditor) — the pairs live in the editor's
            // own state, invisible to the editContent comparison above; the
            // user's "editing.env and going to another place … ignores the
            // edits" report. envDirty mirrors EnvEditor's flag upward.
            envFormActive && envDirty;
        onDirtyChange?.(dirty);
    }, [editContent, content, editMode, fileKind, mdStudio, nbDirty, envFormActive, envDirty, onDirtyChange]);

    // Locks can change from the explorer while this file is open.
    React.useEffect(() => {
        const recheck = () => setLocked(isFileLocked(folderSlug, fileSlug));
        window.addEventListener("praxis:locked-files-changed", recheck);
        return () => window.removeEventListener("praxis:locked-files-changed", recheck);
    }, [folderSlug, fileSlug]);

    /** Persist the zoom multiplier for THIS file kind (per-kind zoom
     *  memory: CSV at 13px, markdown at 16px — remembered). */
    const applyZoom = React.useCallback(
        (next: number) => {
            setZoom(next);
            try {
                const raw = window.localStorage.getItem("praxis.zoomByKind");
                const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
                map[fileKind] = next;
                window.localStorage.setItem("praxis.zoomByKind", JSON.stringify(map));
            } catch {
                /* quota — ignore */
            }
        },
        [fileKind]
    );

    /** Config validation (yaml / toml / ini) — POST /api/validate-config
     *  and list the issues with jump-to-line (enters edit mode). */
    const runValidation = React.useCallback(async () => {
        const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
        const format = ext === "yaml" || ext === "yml" ? "yaml" : ext === "toml" ? "toml" : "ini";
        const source = editMode ? editContent : content;
        setValidation({busy: true, issues: null});
        try {
            const res = await fetch("/api/validate-config", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({content: source, format}),
            });
            const json = await res.json();
            setValidation({busy: false, issues: json.issues ?? []});
        } catch (err) {
            setValidation({busy: false, issues: [{message: (err as Error).message, line: null}]});
        }
    }, [content, editContent, editMode, fileName]);

    // ─── the formatter CORE (pure, synchronous) ────────────
    // Extracted from runFormatter so THREE flows share one implementation:
    //   ▸ the right-click / menubar Auto-format + Auto-indent actions;
    //   ▸ the new AUTO-FORMAT-ON-SAVE pass for non-Python files (the
    //     python path black-formats in page.tsx; css/ts/js/md/… now get
    //     the same treatment here — Settings → Formatting → per-language
    //     "format on save");
    //   ▸ the notebook cells (same settings keys, separate light wiring).
    // Reads the live settings (formatLangIndent / formatIndentWidth /
    // per-kind toggles) exactly like the old inline version.
    const formatSource = React.useCallback(
        (mode: "format" | "indent", source: string): string => {
            // Gate on the shared FORMATTABLE_KINDS registry, then run the ONE
            // engine (lib/format-any) — the explorer's right-click Format ▸
            // and the viewer's edit + view + save paths all share it, so a
            // language formats identically everywhere.
            if (!formattableKindFor(fileKind)) return source;
            return formatAnySource(fileKind, mode, source, loadSettings());
        },
        [fileKind]
    );

    /** AUTO-FORMAT-ON-SAVE for non-Python files — the offline
     *  formatter + the save-time hygiene passes, applied to the buffer
     *  before it is written (Settings → Formatting: global switch +
     *  per-language overrides; trim-trailing / final-newline apply for
     *  every kind, mirroring the Python save path). Failures fall back to
     *  the raw buffer — a formatter bug must never eat an edit. */
    const autoFormatForSave = React.useCallback(
        (src: string): string => {
            const s = loadSettings();
            const langAuto = s.formatLangAutoSave?.[fileKind] === true || s.formatAutoSaveAll === true;
            let out = src;
            if (s.trimTrailingOnSave) {
                out = out.replace(/[ \t]+(?=\r?\n)/g, "").replace(/[ \t]+$/, "");
            }
            if (langAuto) {
                try {
                    const formatted = formatSource("format", out);
                    if (typeof formatted === "string" && formatted.length > 0) out = formatted;
                } catch {
                    /* keep the unformatted buffer */
                }
            }
            if (s.finalNewlineOnSave) {
                out = out.replace(/\s*$/, "\n");
            }
            return out;
        },
        [fileKind, formatSource]
    );

    // Auto-save debounce.
    const handleEditChange = React.useCallback((newContent: string) => {
        setEditContent(newContent);
        if (autoSaveDelayMs > 0 && onSaveEdit) {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = setTimeout(() => {
                autoSaveTimer.current = null;
                if (newContent !== content) {
                    setSaving(true);
                    setSaveStatus("saving");
                    // pass the file identity captured at typing
                    // time so the parent can reject the write if the selection
                    // has already moved on. the write passes through the
                    // auto-format-on-save hook (per-language, Settings →
                    // Formatting) so autosaves land formatted too.
                    const toWrite = autoFormatForSave(newContent);
                    onSaveEdit(toWrite, {folderSlug, fileSlug}).then(() => {
                        setSaveStatus("saved");
                        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
                    }).catch(() => setSaveStatus("idle")).finally(() => setSaving(false));
                }
            }, autoSaveDelayMs);
        }
    }, [autoSaveDelayMs, onSaveEdit, content, folderSlug, fileSlug, autoFormatForSave]);

    // ── the undo/redo POPS (declared after handleEditChange —
    //    they rewrite the buffer through it and restore the selection).
    //     the read-only story; the Python editor gates the same way).
    //     Every replacement is a programmatic buffer rewrite, so each
    //     one snapshots the pre-edit buffer onto the fmt-undo stack
    //     (Ctrl+Z pops straight back).
    /** Replace the CURRENT match (the one the bar selected last). */
    const handleReplaceNext = React.useCallback(() => {
        if (!editMode) return;
        const matches = findMatchesRef.current.length > 0 ? findMatchesRef.current : computeFindMatches();
        if (matches.length === 0) return;
        const wrapped = ((findIndex % matches.length) + matches.length) % matches.length;
        const start = matches[wrapped];
        const len = matchLengthAt(start);
        pushFmtUndo();
        const next =
            editContent.slice(0, start) +
            replaceQuery +
            editContent.slice(start + len);
        handleEditChange(next);
        // Re-match against the NEW buffer and keep the caret on the
        // FOLLOWING occurrence (VS Code behavior).
        const ta = editTextareaRef.current;
        const seek = start + replaceQuery.length;
        findMatchesRef.current = computeFindMatches();
        const upcoming = findMatchesRef.current.filter((o) => o >= seek);
        const nextIdx = upcoming.length > 0 ? findMatchesRef.current.indexOf(upcoming[0]) : 0;
        setFindIndex(nextIdx);
        if (ta && findMatchesRef.current.length > 0) {
            const ns = findMatchesRef.current[nextIdx];
            const nel = ns + (findRegex ? matchLengthAt(ns) : findQuery.length);
            requestAnimationFrame(() => ta.setSelectionRange(ns, Math.min(nel, next.length)));
        }
    }, [editMode, findIndex, computeFindMatches, matchLengthAt, replaceQuery, editContent, pushFmtUndo, handleEditChange, findRegex, findQuery]);

    /** Replace ALL — guarded by the confirm-count dialog (the plan's
     * "confirm count dialog"); the confirmed count is what runs. */
    const handleReplaceAll = React.useCallback(() => {
        if (!editMode || confirmReplaceAllCount == null) return;
        const matches = findMatchesRef.current.length > 0 ? findMatchesRef.current : computeFindMatches();
        if (matches.length === 0) {
            setConfirmReplaceAllCount(null);
            return;
        }
        // Descending order keeps every earlier offset valid.
        pushFmtUndo();
        let next = editContent;
        for (let k = matches.length - 1; k >= 0; k--) {
            const start = matches[k];
            const len = matchLengthAt(start);
            next = next.slice(0, start) + replaceQuery + next.slice(start + len);
        }
        handleEditChange(next);
        setConfirmReplaceAllCount(null);
        setFindIndex(0);
        findMatchesRef.current = [];
    }, [editMode, confirmReplaceAllCount, computeFindMatches, matchLengthAt, replaceQuery, editContent, pushFmtUndo, handleEditChange]);


    const popFmtUndo = React.useCallback(() => {
        const snap = fmtUndoRef.current.pop();
        if (!snap) return false;
        const ta = editTextareaRef.current;
        // The CURRENT buffer becomes the redo target.
        fmtRedoRef.current.push({
            content: editContentRef.current,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0,
        });
        handleEditChange(snap.content);
        requestAnimationFrame(() => {
            const t = editTextareaRef.current;
            if (t) t.setSelectionRange(snap.selStart, snap.selEnd);
        });
        return true;
    }, [handleEditChange]);
    const popFmtRedo = React.useCallback(() => {
        const snap = fmtRedoRef.current.pop();
        if (!snap) return false;
        const ta = editTextareaRef.current;
        fmtUndoRef.current.push({
            content: editContentRef.current,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0,
        });
        handleEditChange(snap.content);
        requestAnimationFrame(() => {
            const t = editTextareaRef.current;
            if (t) t.setSelectionRange(snap.selStart, snap.selEnd);
        });
        return true;
    }, [handleEditChange]);

    /* ────────────────────────────────────────────────────────────────
* for the edit-mode textarea (all in one block so
* the single-caret pipeline above stays untouched):
*
* · the OFFLINE COMPLETION POPUP — completion-provider.ts (the
* keyword tables + collectDocumentWords + matchCompletions +
* identifierPrefixBefore) was imported by NO component. After a
* ~180 ms typing pause the identifier prefix at the caret is
* matched against keywords + document words; the popup renders
* BELOW the caret line. ↑/↓ move the active item, Tab / Enter
* insert the suffix after the typed prefix, Esc / blur / a
* collapsed prefix / a kind change close it.
*
* · the BRACKET-PAIR + SELECTION-OCCURRENCE highlights —
* findBracketPair / findOccurrences were imported but never
* called. Both now feed a passive pointer-events-none layer
* over the Prism backdrop (same positioning pattern as the
* spell overlay / the find rects, tab-aware pixelXOfColumn).
*
* · a PRAGMATIC MULTI-CURSOR port — the Python editor's
* extraCarets subset: Ctrl/Cmd+D stacks the next occurrence of
* the selection (up to 24 carets); typing / Enter / Backspace /
* Delete / auto-pair / auto-indent / Tab apply at EVERY caret
* via applyToAllCarets (last-caret-first, offsets re-shifted
* by each edit's delta); Esc collapses.
*
* Everything here no-ops unless its own state is non-default (no
* popup open, no extra carets stacked) — zero behavior change for
* the existing single-caret input pipeline.
* ──────────────────────────────────────────────────────────────── */

    // ── live-selection tracking — feeds the occurrence / bracket /
    //    extra-caret overlays + the completion trigger (recomputed via
    //    onSelect / onKeyUp / onClick; the setter bails when unchanged
    //    so plain typing never re-renders for this).
    const [editSel, setEditSel] = React.useState({start: 0, end: 0});
    const noteEditSelection = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        setEditSel((prev) =>
            prev.start === ta.selectionStart && prev.end === ta.selectionEnd
                ? prev
                : {start: ta.selectionStart, end: ta.selectionEnd}
        );
    }, []);

    // ── IME composition guard — e.nativeEvent.isComposing alone misses
    //    the window between compositionstart and the first keydown (and
    //    Safari fires the committing Enter with isComposing=false), so
    //    the popup + overlays read THIS ref, set from the composition
    //    events themselves. While true: no popup, no bracket scans.
    const composingRef = React.useRef(false);

    // ── the completion popup state (null = closed). ──
    interface CompletionPopupState {
        /** The identifier prefix the caret produced (already in the buffer). */
        prefix: string;
        /** Caret offset the popup was computed for. */
        caret: number;
        /** Ranked candidates (capped at COMPLETION_MAX_ITEMS). */
        items: CompletionCandidate[];
        /** Active item index for ↑/↓ + aria-activedescendant. */
        active: number;
    }

    const [completion, setCompletion] = React.useState<CompletionPopupState | null>(null);
    const completionListRef = React.useRef<HTMLDivElement | null>(null);
    /** The just-ACCEPTED candidate — the popup stays closed while the
     * caret's prefix equals it (accept → no instant re-open; typing
     * past it offers again normally). */
    const completionAcceptedRef = React.useRef<string | null>(null);
    /** Stable id prefix for the listbox ↔ option linkage (useId survives
     * the split view mounting two FileViewers). */
    const completionDomId = React.useId();
    /** Blur closes the popup on a short delay so item CLICKS (which
     *  preventDefault on mousedown, keeping focus) land first. */
    const completionBlurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const COMPLETION_DEBOUNCE_MS = 180;
    const COMPLETION_MAX_ITEMS = 12;
    /** Document-word collection is skipped past this size (keywords only)
     *  — collectDocumentWords caps its OUTPUT, but the regex still walks
     *  the whole buffer. */
    const COMPLETION_DOC_SCAN_MAX_CHARS = 200_000;

    /** The popup trigger: recompute ~180 ms after the last input / caret
     * move. Only fires in EDIT mode, never mid-composition, never for
     * a selection, and only for a 1+ char identifier prefix (the
     * matcher's own 3-char gate then filters the candidates). Soft-wrap
     * mode suspends it — the caret→pixel math is logical-line based. */
    React.useEffect(() => {
        if (!editMode || htmlWrap) {
            setCompletion(null);
            return;
        }
        if (composingRef.current) return; // mid-IME — no popup churn
        const timer = setTimeout(() => {
            const ta = editTextareaRef.current;
            if (!ta || composingRef.current || document.activeElement !== ta) {
                setCompletion(null);
                return;
            }
            const caret = ta.selectionStart;
            if (caret !== ta.selectionEnd) {
                setCompletion(null); // a selection, not typing
                return;
            }
            const prefix = identifierPrefixBefore(editContent, caret);
            if (!shouldOfferCompletion(prefix, {composing: false, editMode: true})) {
                setCompletion(null);
                return;
            }
            // Accepting a candidate keeps the popup closed until the prefix
            // moves past the accepted word (typing continues → offers again).
            if (completionAcceptedRef.current !== null) {
                if (completionAcceptedRef.current === prefix) {
                    completionAcceptedRef.current = null;
                    setCompletion(null);
                    return;
                }
                completionAcceptedRef.current = null;
            }
            const docWords =
                editContent.length <= COMPLETION_DOC_SCAN_MAX_CHARS
                    ? collectDocumentWords(editContent)
                    : [];
            const items = matchCompletions(
                prefix,
                docWords,
                keywordsForKind(fileKind),
                COMPLETION_MAX_ITEMS
            );
            setCompletion((prev) => {
                if (items.length === 0) return null;
                if (
                    prev &&
                    prev.caret === caret &&
                    prev.prefix === prefix &&
                    prev.items.length === items.length &&
                    prev.items.every((it, i) => it.label === items[i].label && it.source === items[i].source)
                ) {
                    return prev; // unchanged — skip the re-render
                }
                return {prefix, caret, items, active: 0};
            });
        }, COMPLETION_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // editSel: caret moves re-run the trigger; fileKind: closes on kind change.
    }, [editMode, htmlWrap, editContent, editSel, fileKind]);

    /** Insert the picked candidate: the SUFFIX after the typed prefix
     * goes in at the caret. document.execCommand("insertText") keeps the
     * browser's native undo stack alive (like the cut/copy/paste menu
     * actions); the programmatic-write fallback snapshots like every
     * other edit here. */
    const insertCompletion = React.useCallback(
        (item: CompletionCandidate) => {
            const ta = editTextareaRef.current;
            const c = completion;
            setCompletion(null);
            if (!ta || !c) return;
            const suffix = completionSuffix(item.label, c.prefix);
            if (!suffix) return;
            completionAcceptedRef.current = item.label;
            ta.focus();
            let ok = false;
            try {
                ok = document.execCommand("insertText", false, suffix);
            } catch {
                ok = false;
            }
            if (!ok) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                pushFmtUndo();
                handleEditChange(editContent.slice(0, start) + suffix + editContent.slice(end));
                requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = start + suffix.length;
                });
            }
        },
        [completion, editContent, pushFmtUndo, handleEditChange]
    );

    // Keep the popup's ACTIVE item scrolled into view when ↑/↓ wraps.
    React.useEffect(() => {
        if (!completion) return;
        const el = completionListRef.current?.querySelector('[aria-selected="true"]');
        (el as HTMLElement | null)?.scrollIntoView?.({block: "nearest"});
    }, [completion]);

    // ── pragmatic multi-cursor state (empty = single normal caret). ──
    const MAX_MULTI_CARETS = 24; // native + extras combined
    const [extraCarets, setExtraCarets] = React.useState<Array<{ start: number; end: number }>>([]);
    const extraCaretsRef = React.useRef(extraCarets);
    React.useEffect(() => {
        extraCaretsRef.current = extraCarets;
    }, [extraCarets]);
    // Carets never survive a mode / file switch.
    React.useEffect(() => {
        if (!editMode) setExtraCarets([]);
    }, [editMode]);
    React.useEffect(() => {
        setExtraCarets([]);
        setCompletion(null);
    }, [folderSlug, fileSlug]);
    /** Set during an applyToAllCarets mutation so the effect below can
     *  tell ITS buffer change from every other one (format, find-replace,
     *  undo, insert-block … — those invalidate the stacked offsets). */
    const multiCaretEditRef = React.useRef(false);
    React.useEffect(() => {
        if (multiCaretEditRef.current) {
            multiCaretEditRef.current = false;
            return;
        }
        // A buffer change NOT from the multi-caret pipeline moves the
        // text under the stacked carets — collapse to the native caret.
        setExtraCarets((prev) => (prev.length > 0 ? [] : prev));
    }, [editContent]);

    /** Auto-indent string for a caret's line — the SAME rules the
     *  single-caret Enter branch below applies (copy the line's leading
     *  whitespace; a YAML "key:" line opens one more level). */
    const enterIndentFor = React.useCallback(
        (buf: string, caret: number): string => {
            const lineStart = buf.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
            const currentLine = buf.slice(lineStart, caret);
            let indent = /^[ \t]*/.exec(currentLine)?.[0] ?? "";
            const s = getIndentSettings(loadSettings());
            const unit = s.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, s.width)));
            if (fileKind === "yaml" && currentLine.trimEnd().endsWith(":")) indent += unit;
            return indent;
        },
        [fileKind]
    );

    /** Apply an edit at EVERY caret (native + extras). Ported from the
     *  Python editor's applyToAllCarets pattern, adapted to this
     *  editor's programmatic-write pipeline: edits apply LAST-caret-
     *  first (string surgery on a working buffer) so earlier offsets
     *  stay valid, and after each applied edit the remaining carets'
     *  final positions are re-shifted by that edit's delta. ONE fmt-undo
     *  snapshot covers the whole mutation — Ctrl+Z pops the batch.
     *  Returns false when fewer than two carets are active, so the
     *  single-caret paths keep handling everything else. */
    const applyToAllCarets = React.useCallback(
        (
            compute: (
                buf: string,
                start: number,
                end: number
            ) => { selStart: number; selEnd: number; text: string; finalCaret: number } | null
        ): boolean => {
            const ta = editTextareaRef.current;
            if (!ta || !editMode) return false;
            const carets = [
                {start: ta.selectionStart, end: ta.selectionEnd},
                ...extraCaretsRef.current,
            ]
                .filter((c) => c.end >= c.start)
                .sort((a, b) => a.start - b.start);
            if (carets.length < 2) return false;
            const pristine = editContentRef.current;
            const finals: number[] = new Array(carets.length).fill(0);
            let any = false;
            let buf = pristine;
            for (let i = carets.length - 1; i >= 0; i--) {
                const res = compute(buf, carets[i].start, carets[i].end);
                if (!res) {
                    finals[i] = carets[i].end;
                    continue;
                }
                any = true;
                buf = buf.slice(0, res.selStart) + res.text + buf.slice(res.selEnd);
                const delta = res.text.length - (res.selEnd - res.selStart);
                // Later (lower-offset) edits shift every already-computed
                // final position above them.
                for (let k = i + 1; k < carets.length; k++) finals[k] += delta;
                finals[i] = res.finalCaret;
            }
            if (!any) return false;
            // Snapshot the PRE-mutation buffer (the ref still holds it — only
            // the local `buf` was mutated) — one Ctrl+Z pops the whole batch.
            pushFmtUndo();
            multiCaretEditRef.current = true; // own the editContent effect
            handleEditChange(buf);
            // The native selection ends at the LAST edit (the lowest caret);
            // the rest become the new extra carets.
            setExtraCarets(finals.slice(1).map((p) => ({start: p, end: p})));
            requestAnimationFrame(() => {
                const t = editTextareaRef.current;
                if (!t) return;
                t.setSelectionRange(finals[0], finals[0]);
                noteEditSelection();
            });
            return true;
        },
        [editMode, pushFmtUndo, handleEditChange, noteEditSelection]
    );

    /** Ctrl/Cmd+D — stack the NEXT exact-match occurrence of the
     * selection onto the caret set (first press on a bare caret selects
     * the word under it, Sublime-style). Caps at MAX_MULTI_CARETS total;
     * the cap toast tells the user Esc collapses. */
    const selectNextOccurrenceMulti = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta || !editMode) return;
        const src = editContentRef.current;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (start === end) {
            // First Ctrl+D — select the word under the caret.
            const wordChars = /[\w$]/;
            let s = start;
            while (s > 0 && wordChars.test(src[s - 1])) s--;
            let e2 = end;
            while (e2 < src.length && wordChars.test(src[e2])) e2++;
            if (s === e2) return;
            ta.setSelectionRange(s, e2);
            noteEditSelection();
            return;
        }
        const text = src.slice(start, end);
        if (!text || text.includes("\n")) return;
        if (extraCaretsRef.current.length + 1 >= MAX_MULTI_CARETS) {
            toast({
                title: `Multi-caret cap reached (${MAX_MULTI_CARETS})`,
                description: "Press Escape to collapse back to a single caret.",
                variant: "destructive",
            });
            return;
        }
        // Occurrences already claimed by a caret (native or extra).
        const ranges = [{start, end}, ...extraCaretsRef.current];
        const occupied = (s: number): boolean =>
            ranges.some((r) => s < r.end && s + text.length > r.start);
        let idx = src.indexOf(text, end);
        while (idx !== -1 && occupied(idx)) idx = src.indexOf(text, idx + text.length);
        if (idx === -1) {
            // Wrap around, skipping occupied ones.
            idx = src.indexOf(text, 0);
            while (idx !== -1 && occupied(idx)) idx = src.indexOf(text, idx + text.length);
        }
        if (idx === -1) return; // every occurrence already has a caret
        setExtraCarets((prev) => [...prev, {start, end}]);
        ta.setSelectionRange(idx, idx + text.length);
        noteEditSelection();
    }, [editMode, noteEditSelection, toast]);

    // ── the passive edit-mode overlay rects: selection-occurrence
    //    highlights + the bracket-pair match + the extra carets. ONE
    //    memo keyed on the buffer, the live selection, the caret stack
    //    and the measured char width — findOccurrences caps at 500 hits
    //    internally; BOTH scanners are skipped past 200 K chars (huge
    //    files never pay for the sweep) and soft wrap suspends the
    //    layer (logical-line rect math only).
    const EDIT_TAB_SIZE = 8; // the textarea sets no tab-size → browser default
    const EDIT_LINE_H = 21.125; // 13px font × 1.625 line-height (backdrop metrics)
    const EDIT_SCAN_MAX_CHARS = 200_000;

    interface EditOverlayRect {
        top: number;
        left: number;
        width: number;
        kind: "occurrence" | "bracket" | "mc-sel" | "mc-caret";
    }

    const editOverlayRects = React.useMemo(() => {
        if (!editMode || htmlWrap) return null;
        const selStart = editSel.start;
        const selEnd = editSel.end;
        const selLen = selEnd - selStart;
        const scanOk = editContent.length <= EDIT_SCAN_MAX_CHARS;
        // Selection-occurrence highlight: a word-ish, single-line, ≤64-char
        // token (findOccurrences itself decides whole-word vs substring).
        let occ: number[] = [];
        if (scanOk && selLen > 0 && selLen <= 64) {
            const needle = editContent.slice(selStart, selEnd);
            if (!needle.includes("\n") && /^[A-Za-z0-9_$-]+$/.test(needle)) {
                occ = findOccurrences(editContent, needle);
            }
        }
        // Bracket-pair match: caret adjacent to — or a selection covering
        // an edge of — one of () [] {}.
        let pair: { openOffset: number; closeOffset: number } | null = null;
        if (scanOk) {
            pair = findBracketPair(editContent, selStart);
            if (!pair && selLen > 0) pair = findBracketPair(editContent, selEnd);
        }
        const hasExtraCarets = extraCarets.length > 0;
        if (occ.length === 0 && !pair && !hasExtraCarets) return null;
        // Geometry: one pass for the line starts, binary search for the
        // line, tab-aware pixel math for the column.
        const lineStarts: number[] = [0];
        for (let i = 0; i < editContent.length; i++) {
            if (editContent[i] === "\n") lineStarts.push(i + 1);
        }
        const lines = editContent.split("\n");
        const lineOf = (pos: number): number => {
            let lo = 0;
            let hi = lineStarts.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (lineStarts[mid] <= pos) lo = mid;
                else hi = mid - 1;
            }
            return lo;
        };
        const rectAt = (start: number, len: number): { top: number; left: number; width: number } => {
            const li = lineOf(start);
            const col = start - lineStarts[li];
            return {
                top: 16 + li * EDIT_LINE_H, // p-4 padding + line × line-height
                left: 16 + pixelXOfColumn(lines[li] ?? "", col, EDIT_TAB_SIZE, editCharWidth),
                width: Math.max(2, len * editCharWidth),
            };
        };
        const rects: EditOverlayRect[] = [];
        for (const off of occ) rects.push({...rectAt(off, selLen), kind: "occurrence"});
        if (pair) {
            // BOTH ends of the pair get the distinct bracket tint.
            rects.push({...rectAt(pair.openOffset, 1), kind: "bracket"});
            rects.push({...rectAt(pair.closeOffset, 1), kind: "bracket"});
        }
        for (const c of extraCarets) {
            if (c.end > c.start) rects.push({...rectAt(c.start, c.end - c.start), kind: "mc-sel"});
            rects.push({...rectAt(c.start, 1), kind: "mc-caret", width: 2});
        }
        return rects;
    }, [editMode, htmlWrap, editContent, editSel, extraCarets, editCharWidth]);

    const handleSave = React.useCallback(async (): Promise<boolean> => {
        if (!onSaveEdit) return false;
        // manual save cancels the pending autosave
        // timer first so the same content is never written twice.
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
        setSaving(true);
        setSaveStatus("saving");
        try {
            // the write passes through the auto-format-on-save
            // hook (per-language or global — Settings → Formatting); the
            // formatted text becomes both the disk file and the view.
            const toWrite = autoFormatForSave(editContent);
            await onSaveEdit(toWrite, {folderSlug, fileSlug});
            setEditMode(false);
            setSaveStatus("saved");
            setContent(toWrite);
            // the write may have run the auto-format-on-save pass;
            // re-check the text that is now the view immediately. (Ref, not
            // the callback: handleSave is declared ABOVE the spell block.)
            spellRecheckRef.current?.(toWrite);
            setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
            return true;
        } catch {
            // LOUD failure — a silent catch here made a failed write look
            // like a completed save (the buffer reset, nothing landed on
            // disk). The toast tells the user the edit is still unsaved.
            toast({
                title: "Save failed",
                description: `“${fileName}” was NOT written — check the folder permissions and try again.`,
                variant: "destructive",
            });
            setSaveStatus("idle");
            return false;
        } finally {
            setSaving(false);
        }
    }, [onSaveEdit, editContent, folderSlug, fileSlug, autoFormatForSave, fileName, toast]);

    // the dirty-tab guard's save round-trip: the page asks
    // the open viewer to flush its edit buffer
    // (praxis:file-viewer-save) and waits for the confirmation event
    // (praxis:file-viewer-saved) before switching tabs. When no edit is
    // open the confirmation fires immediately (nothing to flush).
    // the flush now covers the Markdown STUDIO
    // buffer too (previously only editMode), and .ipynb files — the
    // notebook view is asked to save via praxis:notebook-save and
    // confirms with praxis:notebook-saved.
    React.useEffect(() => {
        const onSaveRequest = () => {
            void (async () => {
                try {
                    const studioDirty =
                        fileKind === "markdown" && mdStudio && editContent !== "" && editContent !== content;
                    // Flush whenever the buffer would be reported DIRTY (the
                    // exact condition onDirtyChange uses below) — keying on
                    // `editMode` alone left a race where a dirty buffer with
                    // editMode already false was dropped without a save.
                    const dirtyBuffer = editContent !== "" && editContent !== content && (editMode || studioDirty);
                    if (dirtyBuffer) {
                        await handleSave();
                    } else if (envFormActive && envDirty) {
                        // .env form edits live in the EnvEditor's own state — ask
                        // IT to flush (praxis:env-save → praxis:env-saved) instead
                        // of writing the stale textarea buffer.
                        await new Promise<void>((resolve) => {
                            const onEnvSaved = () => {
                                window.removeEventListener("praxis:env-saved", onEnvSaved);
                                resolve();
                            };
                            window.addEventListener("praxis:env-saved", onEnvSaved);
                            // Belt-and-braces: never hang longer than 2.5 s.
                            window.setTimeout(() => {
                                window.removeEventListener("praxis:env-saved", onEnvSaved);
                                resolve();
                            }, 2500);
                            window.dispatchEvent(new Event("praxis:env-save"));
                        });
                    } else if (fileKind === "ipynb" && nbDirtyRef.current) {
                        await new Promise<void>((resolve) => {
                            const onNotebookSaved = () => {
                                window.removeEventListener("praxis:notebook-saved", onNotebookSaved);
                                resolve();
                            };
                            window.addEventListener("praxis:notebook-saved", onNotebookSaved);
                            // Belt-and-braces: never hang longer than 2.5 s.
                            window.setTimeout(() => {
                                window.removeEventListener("praxis:notebook-saved", onNotebookSaved);
                                resolve();
                            }, 2500);
                            window.dispatchEvent(new Event("praxis:notebook-save"));
                        });
                    }
                } finally {
                    window.dispatchEvent(new Event("praxis:file-viewer-saved"));
                }
            })();
        };
        window.addEventListener("praxis:file-viewer-save", onSaveRequest);
        return () => window.removeEventListener("praxis:file-viewer-save", onSaveRequest);
    }, [editMode, handleSave, fileKind, mdStudio, editContent, content, envFormActive, envDirty]);

    // ─── spell check (read mode, markdown + text) ─────────
    // Server-side checking against the 240k-word English dictionary
    // (POST /api/spell). Misspelled words render with a wavy red
    // underline in the markdown view; clicking one adds it to the
    // project dictionary (.praxis/spell-ignore.json) and clears every
    // occurrence immediately.
    const [spellIssues, setSpellIssues] = React.useState<SpellIssue[]>([]);
    const [spellChecking, setSpellChecking] = React.useState(false);
    // Toggle lag fix `praxis:settings-saved` (fired by the
    // settings dialog AND the page's settings writes) re-reads the
    // spell toggle on the next render — flipping it used to wait for a
    // file switch because the memo only keyed on folder/file.
    const [spellSettingsNonce, setSpellSettingsNonce] = React.useState(0);
    React.useEffect(() => {
        const onSaved = () => setSpellSettingsNonce((n) => n + 1);
        window.addEventListener("praxis:settings-saved", onSaved);
        return () => window.removeEventListener("praxis:settings-saved", onSaved);
    }, []);
    const spellEnabled = React.useMemo(() => {
        void spellSettingsNonce; // re-read trigger only
        try {
            return !!loadSettings().spellCheck;
        } catch {
            return false;
        }
        // Re-read the setting every time the file switches — the settings
        // dialog write is picked up on the next file open without a
        // component remount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spellSettingsNonce, folderSlug, fileSlug]);
    // the count is now backed by VISIBLE wavy
    // underlines everywhere — read view (markdown/text renderers + the
    // studio preview), edit view (textarea overlay — see
    // spell-text-overlay.tsx) and the studio source editor.
    //
    // every TEXT-ish kind is spell-checkable now — json /
    // yaml / toml / sql / r / shell / log join markdown / text, and the
    // full language registry (js / ts / matlab / java / c / cpp / ruby /
    // php / go / lua / perl / rust / julia / kotlin / swift / powershell /
    // batch / zig / dart / groovy / scala / elixir / haskell / erlang /
    // clojure / ocaml / fsharp / graphql) gets the SAME view-mode wavy
    // underlines ("some languages have no zigzags spell checking in the
    // view mode") — the tokenizer already skips identifiers (digits /
    // camelCase / acronyms), so comments and prose carry the marks.
    // HTML is checkable in BOTH read (source/split) and edit modes.
    const spellCheckable =
        fileKind === "markdown" ||
        fileKind === "text" ||
        fileKind === "log" ||
        fileKind === "json" ||
        fileKind === "yaml" ||
        fileKind === "toml" ||
        fileKind === "sql" ||
        fileKind === "r" ||
        fileKind === "shell" ||
        fileKind === "css" ||
        fileKind === "html" ||
        fileKind === "javascript" ||
        fileKind === "typescript" ||
        fileKind === "matlab" ||
        fileKind === "java" ||
        fileKind === "c" ||
        fileKind === "cpp" ||
        fileKind === "ruby" ||
        fileKind === "php" ||
        fileKind === "go" ||
        fileKind === "lua" ||
        fileKind === "perl" ||
        fileKind === "rust" ||
        fileKind === "julia" ||
        fileKind === "kotlin" ||
        fileKind === "swift" ||
        fileKind === "powershell" ||
        fileKind === "batch" ||
        fileKind === "zig" ||
        fileKind === "dart" ||
        fileKind === "groovy" ||
        fileKind === "scala" ||
        fileKind === "elixir" ||
        fileKind === "haskell" ||
        fileKind === "erlang" ||
        fileKind === "clojure" ||
        fileKind === "ocaml" ||
        fileKind === "fsharp" ||
        fileKind === "graphql";

    // Plan 1c — the monotonic spell-request sequence (see runSpellCheck).
    const spellSeqRef = React.useRef(0);
    const runSpellCheck = React.useCallback((text: string, kind: string) => {
        if (!text.trim()) {
            setSpellIssues([]);
            setSpellChecking(false);
            return;
        }
        // Sequence guard monotonic request id — a response that
        // is not the LATEST request's answer is stale (the user kept
        // typing / switched files after it left) and must never overwrite
        // newer results or clog the "Checking…" spinner.
        const seq = ++spellSeqRef.current;
        setSpellChecking(true);
        fetch("/api/spell", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "check", text, kind, dict: loadSettings().spellLanguage}),
        })
            .then((r) => r.json())
            .then((d: { misspelled?: SpellIssue[] }) => {
                if (spellSeqRef.current !== seq) return; // stale — drop it
                const raw = Array.isArray(d.misspelled) ? d.misspelled : [];
                // Markup skip-list HTML tag/attribute names and CSS
                // property/value keywords are vocabulary, not English — they
                // never count as misspellings.
                setSpellIssues(filterMarkupSpellIssues(raw));
            })
            .catch(() => {
                if (spellSeqRef.current === seq) setSpellIssues([]);
            })
            .finally(() => {
                if (spellSeqRef.current === seq) setSpellChecking(false);
            });
    }, []);

    /** Plan 1d — IMMEDIATE re-check after a one-shot buffer rewrite
     * (Auto-format / Auto-indent / save-with-autoformat): the 500 ms
     * debounce would keep the stale marks visible over the new text. */
    const spellRecheckAfter = React.useCallback(
        (text: string) => {
            if (!spellEnabled || !spellCheckable || !text) return;
            runSpellCheck(text, fileKind);
        },
        [spellEnabled, spellCheckable, runSpellCheck, fileKind]
    );
    // The ref handleSave reads (see its comment).
    React.useEffect(() => {
        spellRecheckRef.current = spellRecheckAfter;
    }, [spellRecheckAfter]);

    /* PERF: measure the markdown preview's heading positions ONCE per
   * content/layout change (deferred one frame so the preview has
   * painted) into mdHeadingTopsRef — the scroll-spy then runs over
   * plain numbers instead of re-querying every heading per scroll. */
    React.useEffect(() => {
        if (fileKind !== "markdown") return;
        const measure = () => {
            const el = mdPreviewScrollRef.current;
            if (!el) return;
            const {body: mdBody} = splitFrontMatter(content);
            const heads = parseMarkdownOutline(mdBody);
            mdHeadingTopsRef.current = heads.map((h) => {
                const t = el.querySelector(`#${CSS.escape(headingAnchor(h.text))}`);
                return t instanceof HTMLElement ? t.offsetTop : Number.POSITIVE_INFINITY;
            });
        };
        const raf = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(raf);
    }, [content, fileKind, zoom, mdPreviewWidth, rulerColumn, lineHeight, letterSpacing]);
    // Never leak a pending scroll-spy frame.
    React.useEffect(() => () => {
        if (mdScrollRafRef.current !== null) cancelAnimationFrame(mdScrollRafRef.current);
    }, []);
    /* FILE SWITCH: drop the zigzags IMMEDIATELY. The 500 ms debounce + in-flight request would otherwise
* let the PREVIOUS file's wavy underlines ride the new file's text
* for half a second — the "bad transition". Mirrors the Python
* editor's own file-switch clear (code-viewer.tsx); the sequence
* guard in runSpellCheck also drops any in-flight stale answer. */
    React.useEffect(() => {
        setSpellIssues([]);
        setSpellChecking(false);
        spellSeqRef.current += 1; // invalidate any in-flight response
    }, [folderSlug, fileSlug]);

    /** Probe + measured per-glyph advance for the MARKED plain-text
     *  view's column ruler — the ruler joins the view that
     *  replaces the highlighted twin when spell issues exist). */
    const markedProbeRef = React.useRef<HTMLSpanElement | null>(null);
    const [markedCharWidth, setMarkedCharWidth] = React.useState(0);
    React.useLayoutEffect(() => {
        if (!markedProbeRef.current) return;
        const w = markedProbeRef.current.getBoundingClientRect().width;
        if (w > 0) setMarkedCharWidth(w / 100);
    }, [zoom, spellIssues.length]);

    React.useEffect(() => {
        if (!spellEnabled || !spellCheckable) {
            setSpellIssues([]);
            return;
        }
        // in edit mode (or the Markdown studio, whose
        // buffer lives in editContent) the checker runs on the BUFFER —
        // the wavy underlines follow typing (500 ms debounce) instead of
        // the stale disk text.
        const liveBuffer = (editMode || (fileKind === "markdown" && mdStudio)) && editContent !== "";
        const source = liveBuffer ? editContent : content;
        const t = setTimeout(() => runSpellCheck(source, fileKind), 500);
        return () => clearTimeout(t);
    }, [spellEnabled, spellCheckable, content, editContent, fileKind, editMode, mdStudio, runSpellCheck]);

    /** Unique misspelled word forms — drives the inline marking. */
    const spellWordSet = React.useMemo(
        () => new Set(spellIssues.map((i) => i.word)),
        [spellIssues]
    );

    /** The undo entry behind ignoreSpellWord / undoDictionaryAdd. */
    const dictUndoRef = React.useRef<{
        word: string;
        issues: Array<{ word: string; line: number; col: number }>;
        buffer: string
    } | null>(null);

    const ignoreSpellWord = React.useCallback((word: string) => {
        // One-shot Ctrl+Z undo entry — see undoDictionaryAdd below (the
        // same flow the Python editor uses: Ctrl+Z right after the add
        // removes the word and returns the zigzag, while the buffer is
        // still unchanged).
        dictUndoRef.current = {
            word,
            issues: spellIssues,
            buffer: editMode ? editContent : content,
        };
        fetch("/api/spell", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "ignore", word}),
        })
            .then(() => {
                // Instant feedback: drop every occurrence of the word now; the
                // next full check re-syncs against the server's list anyway.
                setSpellIssues((prev) =>
                    prev.filter((i) => i.word.toLowerCase() !== word.toLowerCase())
                );
            })
            .catch(() => {
                dictUndoRef.current = null;
            });
    }, [spellIssues, editMode, editContent, content]);

    /** One-shot Ctrl+Z for a dictionary add (view + edit mode). True →
     *  the key was consumed (word removed, zigzag restored). */
    const undoDictionaryAdd = React.useCallback(() => {
        const entry = dictUndoRef.current;
        if (!entry) return false;
        const current = editMode ? editContent : content;
        if (current !== entry.buffer) {
            dictUndoRef.current = null; // stale — text was edited since
            return false;
        }
        dictUndoRef.current = null;
        fetch("/api/spell", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "remove", word: entry.word}),
        })
            .then(() => {
                setSpellIssues(entry.issues);
            })
            .catch(() => undefined);
        return true;
    }, [editMode, editContent, content]);

    /** Shared spell-replacement applier. EDIT mode: pushFmtUndo FIRST
     *  (a bare setEditContent used to skip the fmt-undo stack, so
     *  Ctrl+Z after a spell replace did nothing), then the change
     *  flows through handleEditChange so autosave sees it. VIEW mode:
     *  ENTER the editor with the corrected buffer (the same
     *  switch-then-apply flow view-mode Auto-format uses) — the
     *  original disk text is the undo snapshot, Ctrl+Z reverts and ⌘S
     *  saves. */
    const applySpellReplacement = React.useCallback(
        (next: string, selStart: number) => {
            if (editMode) {
                pushFmtUndo();
                handleEditChange(next);
                requestAnimationFrame(() => {
                    const ta = editTextareaRef.current;
                    if (ta) {
                        const at = Math.min(selStart, ta.value.length);
                        ta.setSelectionRange(at, at);
                    }
                });
                return;
            }
            setEditContent(content);
            pushFmtUndo(content);
            setEditMode(true);
            handleEditChange(next);
            requestAnimationFrame(() => {
                const ta = editTextareaRef.current;
                if (ta) {
                    const at = Math.min(selStart, ta.value.length);
                    ta.setSelectionRange(at, at);
                }
            });
            spellRecheckRef.current?.(next);
        },
        [editMode, content, handleEditChange, pushFmtUndo]
    );

    /** Replace-in-place (the suggestion popover's Replace button): swap
     *  every word-boundary occurrence of the misspelling for the picked
     *  suggestion — capitalization preserved. From view mode this now
     *  SWITCHES TO EDIT MODE with the corrected buffer (Ctrl+Z undoes;
     *  ⌘S saves) instead of writing straight to disk. */
    const replaceSpellWord = React.useCallback(
        (word: string, suggestion: string) => {
            const source = editMode ? editContent : content;
            const next = replaceWordEverywhere(source, word, suggestion);
            if (next === source) return;
            const at = source.indexOf(word);
            applySpellReplacement(next, at >= 0 ? at + suggestion.length : 0);
            toast({
                title: editMode ? "Replaced" : "Replaced — edit mode",
                description: `Every “${word}” → “${suggestion}”${editMode ? "." : ". Ctrl+Z undoes; ⌘S saves."}`,
                variant: "success",
            });
        },
        [editMode, editContent, content, applySpellReplacement, toast]
    );

    /** Absolute character offset of a 1-based (line, col) in `buf`. */
    const offsetOfLineCol = React.useCallback((buf: string, line: number, col: number): number => {
        if (line < 1) return Math.max(0, col - 1);
        const ls = buf.split("\n");
        if (line > ls.length) return buf.length;
        let off = 0;
        for (let i = 0; i < line - 1; i++) off += (ls[i] ?? "").length + 1;
        return Math.min(buf.length, off + Math.max(0, col - 1));
    }, []);

    /** Replace-in-PLACE (the popover's third button): swap ONLY the
     *  clicked occurrence — every other misspelling stays as typed. */
    const replaceSpellWordAt = React.useCallback(
        (word: string, suggestion: string, line: number, col: number) => {
            const source = editMode ? editContent : content;
            const start = offsetOfLineCol(source, line, col);
            if (source.slice(start, start + word.length) !== word) {
                replaceSpellWord(word, suggestion);
                return;
            }
            const cap = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
            const replacement = cap && suggestion ? suggestion[0].toUpperCase() + suggestion.slice(1) : suggestion;
            const next = source.slice(0, start) + replacement + source.slice(start + word.length);
            applySpellReplacement(next, start + replacement.length);
            toast({
                title: editMode ? "Replaced in place" : "Replaced in place — edit mode",
                description: `This “${word}” → “${replacement}”${editMode ? "." : ". Ctrl+Z undoes; ⌘S saves."}`,
                variant: "success",
            });
        },
        [editMode, editContent, content, offsetOfLineCol, replaceSpellWord, applySpellReplacement, toast]
    );

    /** The STUDIO twin of replaceSpellWord: the markdown studio's buffer
     *  lives in editContent (empty string until the first edit), so the
     *  replacement reads THAT and flows back through the studio's own
     *  onChange — a normal, undoable edit that rides the usual autosave
     *  / dirty-guard plumbing instead of a raw disk write. */
    const replaceStudioSpellWord = React.useCallback(
        (word: string, suggestion: string) => {
            const current = editContent !== "" ? editContent : content;
            const next = replaceWordEverywhere(current, word, suggestion);
            if (next === current) return;
            pushFmtUndo(current);
            handleEditChange(next);
            toast({title: "Replaced", description: `Every “${word}” → “${suggestion}”.`, variant: "success"});
        },
        [editContent, content, handleEditChange, pushFmtUndo, toast]
    );

    /* VIEW-mode spell issues — the input every CodeViewSurface
   * (rawText / markdown source / html source) renders as wavy
   * underlines over the highlighted view. Defined at component scope
   * so ALL the renderBody branches share it. */
    const viewSpellIssues =
        spellEnabled && spellCheckable && !editMode ? spellIssues : [];

    /* ── Right-click parity gating (mirrors the Python editor's menu
   * groups for the kinds THIS viewer renders — see
   * lib/context-menu-spec.ts). canAiCode covers every code language
   * (JS / TS / MATLAB / R / shell / Ruby / Go / GraphQL …); the
   * text-ish kinds keep the Python-gated story (no AI code tools).
   * The AI ▸ group + the Explain-Selection row use it. */
    const aiCodeKind = capabilitiesForKind(fileKind).canAiCode;
    /** The text the AI prompt should carry — the edit-mode selection
     * when there is one (else the whole buffer), the view-mode browser
     * selection when there is one (else the whole file). Same shape the
     * Python editor's getSelectedTextForAi uses. */
    const getSelectionForAi = React.useCallback((): string => {
        if (editMode) {
            const ta = editTextareaRef.current;
            if (ta && ta.selectionStart !== ta.selectionEnd) {
                return editContent.slice(ta.selectionStart, ta.selectionEnd);
            }
            return editContent;
        }
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        return text || content;
    }, [editMode, editContent, content]);
    /** The code the Run-selection context item should carry — the
     * textarea selection in edit mode, the caret's line when nothing is
     * selected (the Python editor's exact fallback), the browser
     * selection in view mode. */
    const getSelectionForRun = React.useCallback((): string => {
        if (editMode) {
            const ta = editTextareaRef.current;
            if (ta) {
                if (ta.selectionStart !== ta.selectionEnd) {
                    return editContent.slice(ta.selectionStart, ta.selectionEnd);
                }
                const lineIdx = editContent.slice(0, ta.selectionStart).split("\n").length - 1;
                return editContent.split("\n")[lineIdx] ?? "";
            }
            return editContent;
        }
        const sel = window.getSelection();
        return sel ? sel.toString() : "";
    }, [editMode, editContent]);

    /* ── text-like gating for the view-mode Clipboard ▸ copy rows
* (Copy All / Copy Selection / Copy As Markdown Block). These used
* to be hardcoded to nine kinds — every other text file (HTML /
* CSS / JS / TS / MATLAB / Java / C / C++ / Ruby / PHP / Go / Lua /
* Perl / Rust / Julia / Kotlin / Swift / PowerShell / Batch / Zig /
* Dart / Groovy / Scala / Elixir / Haskell / Erlang / Clojure /
* OCaml / F# / GraphQL) showed NO copy rows at all — the * "I traced some options in right click of python and I see they
* can be valid for other languages however I did not find them".
* canEdit covers every kind with a text representation. */
    const textLikeKind = capabilitiesForKind(fileKind).canEdit;

    /** The identifier under the caret / selection — feeds the Refactor ▸
     *  entries (Rename Symbol… / Find Usages…). The dialogs themselves
     * are language-blind (project-wide word-boundary search + replace),
     * so every code kind mirrors the Python editor's rows. */
    const getSelectedSymbol = React.useCallback((): string => {
        if (editMode) {
            const ta = editTextareaRef.current;
            if (ta) {
                if (ta.selectionStart !== ta.selectionEnd) {
                    const word = editContent.slice(ta.selectionStart, ta.selectionEnd).trim();
                    return word ? word.split(/\s+/)[0] : "";
                }
                const before = editContent.slice(0, ta.selectionStart);
                const after = editContent.slice(ta.selectionStart);
                const m = /([A-Za-z_$][\w$]*)$/.exec(before);
                const n = /^([A-Za-z_$][\w$]*)/.exec(after);
                if (m && n) return m[1] + n[1];
                if (m) return m[1];
                if (n) return n[1];
            }
            return "";
        }
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        return text ? text.split(/\s+/)[0] : "";
    }, [editMode, editContent]);

    /* Markdown component overrides moved to MarkdownGithub
   *  (components/markdown-github.tsx) — GitHub-grade tables, inline
   *  code chips, alerts + the wavy spell marks are all rendered there
   *  for the classic preview AND the studio preview. */

    /* The old standalone header spellChip was FOLDED into the union
   *  bar's stats chip (unionStatsChip — "N Ln · M misspelled words",
   *  the Python editor's exact chip design) during the single-bar
   *  unification. */

    // ─── Insert-block (edit mode) ──────────────────────────────────
    // Same feature as the CodeViewer's, for non-Python files: the
    // available blocks depend on the file name (markdown / gitignore /
    // txt / json / yaml / toml / csv — see code-templates).
    const insertBlocks = React.useMemo(() => blocksForFile(fileName), [fileName]);

    /**.sql DDL → tables/relations for the
     *  graphical schema view (same ER diagram as the SQLite workbench). */
    const sqlSchema = React.useMemo(
        () => (fileKind === "sql" ? parseSqlSchema(content) : null),
        [fileKind, content]
    );
    const insertBlockAtCaret = React.useCallback((template: string) => {
        const ta = editTextareaRef.current;
        if (!ta || !editMode) return;
        const styles = getNamingStyles(loadSettings());
        const rendered = renderTemplate(template, styles);
        const {newContent, caretPos} = spliceTemplate(
            ta.value,
            ta.selectionStart,
            ta.selectionEnd,
            rendered
        );
        handleEditChange(newContent);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(caretPos, caretPos);
        });
    }, [editMode, handleEditChange]);

    /** Native clipboard/undo actions for the edit-mode context menu.
     * Undo checks the FORMAT undo stack first — right after an
     *  Auto-format / Auto-indent the native stack is empty, so the menu
     *  item used to no-op (same class of bug as the dead Ctrl+Z). */
    const editContextUndo = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        ta.focus();
        if (fmtUndoRef.current.length > 0) {
            popFmtUndo();
            return;
        }
        document.execCommand("undo");
    }, [popFmtUndo]);
    const editContextRedo = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        ta.focus();
        if (fmtRedoRef.current.length > 0) {
            popFmtRedo();
            return;
        }
        document.execCommand("redo");
    }, [popFmtRedo]);
    const editContextCut = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        ta.focus();
        document.execCommand("cut");
    }, []);
    const editContextCopy = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        ta.focus();
        document.execCommand("copy");
    }, []);
    const editContextPaste = React.useCallback(async () => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        ta.focus();
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const newContent = ta.value.slice(0, start) + text + ta.value.slice(end);
                handleEditChange(newContent);
                requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = start + text.length;
                });
            }
        } catch {
            /* clipboard permission denied */
        }
    }, [handleEditChange]);

    // ─── more edit-menu options (other-IDE parity) ──────────
    /** Select the whole buffer (Ctrl+A without leaving the menu open). */
    const editContextSelectAll = React.useCallback(() => {
        const ta = editTextareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.select();
    }, []);

    /** Run a generic LINE operation (lib/line-ops) on the textarea's
     *  selection — the same utilities the Python editor's Edit ▸
     *  Lines submenu has (toggle comment / duplicate / move / delete /
     *  join / sort / unique / reverse / shuffle / trim), so every
     *  language's editor menu is option-for-option identical. */
    const runLineOp = React.useCallback(
        (op: "comment" | "duplicate" | "up" | "down" | "delete" | "join" | "sort" | "unique" | "reverse" | "shuffle" | "trim") => {
            const ta = editTextareaRef.current;
            if (!ta) return;
            const sel = {start: ta.selectionStart, end: ta.selectionEnd};
            const src = ta.value;
            let result: { text: string; start: number; end: number } | null = null;
            if (op === "trim") {
                const t = trimTrailingWhitespaceAll(src);
                if (t !== src) {
                    handleEditChange(t);
                    requestAnimationFrame(() => {
                        ta.focus();
                        ta.setSelectionRange(Math.min(sel.start, t.length), Math.min(sel.end, t.length));
                    });
                }
                return;
            }
            if (op === "comment") {
                const token = commentTokenFor(fileKind);
                if (!token) {
                    toast({
                        title: "No line comments",
                        description: `${fileKind} files have no line-comment syntax to toggle.`,
                        variant: "destructive"
                    });
                    return;
                }
                result = toggleComment(src, sel, token);
            } else if (op === "duplicate") result = duplicateLines(src, sel);
            else if (op === "up") result = moveLines(src, sel, -1);
            else if (op === "down") result = moveLines(src, sel, 1);
            else if (op === "delete") result = deleteLines(src, sel);
            else if (op === "join") result = joinLines(src, sel);
            else result = reorderLines(src, sel, op);
            if (!result || result.text === src) return;
            handleEditChange(result.text);
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(result!.start, result!.end);
            });
        },
        [fileKind, handleEditChange, toast]
    );

    /** Convert the selection (or the word at the caret) to a chosen case
     *  style — UPPER / lower / Title / camelCase / PascalCase /
     *  snake_case / kebab-case / CONSTANT_CASE. Mirrors the CodeViewer's
     *  convertCaseFn so both editors feel identical. */
    const editContextCase = React.useCallback(
        (
            kind:
                | "upper"
                | "lower"
                | "title"
                | "camel"
                | "pascal"
                | "snake"
                | "kebab"
                | "constant"
        ) => {
            const ta = editTextareaRef.current;
            if (!ta) return;
            const src = ta.value;
            // Selection, or the word around the caret.
            let start = ta.selectionStart;
            let end = ta.selectionEnd;
            if (start === end) {
                const wordChars = /[\w$]/;
                while (start > 0 && wordChars.test(src[start - 1])) start--;
                while (end < src.length && wordChars.test(src[end])) end++;
                if (start === end) return;
            }
            const text = src.slice(start, end);
            let converted: string;
            if (kind === "upper") converted = text.toUpperCase();
            else if (kind === "lower") converted = text.toLowerCase();
            else if (
                kind === "camel" ||
                kind === "pascal" ||
                kind === "snake" ||
                kind === "kebab" ||
                kind === "constant"
            ) {
                const words = text
                    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
                    .split(/[\s_\-.]+/)
                    .filter(Boolean);
                if (words.length === 0) return;
                if (kind === "snake") converted = words.join("_").toLowerCase();
                else if (kind === "kebab") converted = words.join("-").toLowerCase();
                else if (kind === "constant") converted = words.join("_").toUpperCase();
                else if (kind === "pascal")
                    converted = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
                else
                    converted = words
                        .map((w, i) =>
                            i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                        )
                        .join("");
            } else {
                converted = text.replace(/\p{L}[\p{L}\p{Nd}_]*/gu, (w) =>
                    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                );
            }
            if (converted === text) return;
            handleEditChange(src.slice(0, start) + converted + src.slice(end));
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(start, start + converted.length);
            });
        },
        [handleEditChange]
    );

    // Cleanup the auto-save timer.
    React.useEffect(() => {
        return () => {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
            if (pendingFormatTimer.current) clearTimeout(pendingFormatTimer.current);
            if (completionBlurTimer.current) clearTimeout(completionBlurTimer.current);
        };
    }, []);

    // ─── Renderers ──────────────────────────────────────────────────
    const startEdit = () => {
        setEditContent(content);
        setEditMode(true);
    };
    const cancelEdit = () => {
        setEditMode(false);
        setEditContent("");
        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
            autoSaveTimer.current = null;
        }
    };

    const downloadFile = () => {
        if (!fileUrl) return;
        const a = document.createElement("a");
        a.href = fileUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    // ─── Auto-format / Auto-indent for every
    // formattable kind — valid in BOTH modes. Edit mode: applies to the
    // current buffer (undoable, saved like any edit). View mode: formats
    // the disk text and writes it back through onSaveEdit, then refreshes
    // the view. Reachable from the right-click menus (view AND edit) and
    // the menubar's Edit ▸ items (via the praxis:file-viewer-format
    // window event). the per-language routing lives in the
    // shared formatSource core (see above) — this is just the I/O shell.
    //
    // indent also when applied during the view mode; or simply onces
    // clicked, switch to the edit mode and apply that"): VIEW mode no
    // longer writes to disk directly — the click SEEDS THE EDITOR with
    // the formatted text (a snapshot of the pre-format buffer goes on
    // the undo stack first), so Ctrl+Z pops straight back and Save
    // (⌘S / autosave) is the single write path. The studio buffer stays
    // in sync (markdown seed-on-switch already reads the new content).
    const runFormatter = React.useCallback(
        async (mode: "format" | "indent") => {
            if (locked) return;
            if (editMode) {
                const out = formatSource(mode, editContent);
                if (out === editContent) {
                    toast({title: mode === "format" ? "Already formatted" : "Already indented", description: fileName});
                    return;
                }
                // snapshot the pre-format buffer — Ctrl+Z now pops
                // back to it (programmatic value writes kill the browser's
                // native undo stack, which is why format undo was dead).
                pushFmtUndo();
                handleEditChange(out);
                // Plan 1d — the buffer changed shape in one shot; the wavy
                // underlines re-check NOW, not after the debounce.
                spellRecheckAfter(out);
                toast({
                    title: mode === "format" ? "Formatted (unsaved edit) — Ctrl+Z undoes" : "Re-indented (unsaved edit) — Ctrl+Z undoes",
                    description: "Save (⌘S) or keep editing — the buffer holds the formatted text.",
                    variant: "success"
                });
                return;
            }
            const out = formatSource(mode, content);
            if (out === content) {
                toast({
                    title: mode === "format" ? "Already formatted" : "Already indented",
                    description: `${fileName} needs no changes.`
                });
                return;
            }
            // VIEW mode → switch to the EDITOR with the formatted
            // text loaded (see the comment above). Files the viewer cannot
            // save keep the old disk-write escape hatch so the action never
            // no-ops silently. For MARKDOWN the editor is the STUDIO — the
            // formatted text lands in its buffer.
            if (onSaveEdit) {
                // Seed the buffer FIRST, then snapshot the ORIGINAL disk text
                // via the pushFmtUndo override — the live editContentRef still
                // holds the previous file's buffer (often ""), so a plain
                // pushFmtUndo here would have made Ctrl+Z pop back to an
                // EMPTY buffer instead of the pre-format text.
                setEditContent(content);
                pushFmtUndo(content);
                setEditMode(true);
                // the switch-then-wait-then-apply ordering (user
                // request): the editor MOUNTS first, the formatted text lands
                // after the configured pause (Settings → Formatting, default
                // 10 ms — long enough to render the mounted editor as a
                // distinct frame, short enough to feel instant). A pending
                // timer is dropped if the user switches files mid-wait (the
                // file-change effect clears pendingFormatTimerRef) so a slow
                // configured delay can never write the formatted text into
                // the NEXT file's buffer.
                if (formatSwitchDelayMs > 0) {
                    if (pendingFormatTimer.current) clearTimeout(pendingFormatTimer.current);
                    pendingFormatTimer.current = setTimeout(() => {
                        pendingFormatTimer.current = null;
                        handleEditChange(out);
                        spellRecheckAfter(out);
                    }, formatSwitchDelayMs);
                } else {
                    handleEditChange(out);
                    spellRecheckAfter(out);
                }
                toast({
                    title: mode === "format" ? "Formatted in the editor — Ctrl+Z undoes" : "Re-indented in the editor — Ctrl+Z undoes",
                    description:
                        fileKind === "markdown"
                            ? "Switched to the studio with the formatted text — Save (⌘S) writes it to disk."
                            : "Switched to edit mode with the formatted text — Save (⌘S) writes it to disk.",
                    variant: "success",
                });
                return;
            }
            toast({
                title: "Cannot format",
                description: "This file cannot be edited or saved from the viewer.",
                variant: "destructive"
            });
        },
        [locked, fileKind, editMode, editContent, content, fileName, onSaveEdit, folderSlug, fileSlug, handleEditChange, toast, formatSource, pushFmtUndo, formatSwitchDelayMs, spellRecheckAfter]
    );

    // Menubar Edit ▸ “Format document” / “Auto-indent file” routes here
    // for the open Markdown / HTML file (Python keeps its own editor
    // path; other kinds are disabled in the menubar).
    React.useEffect(() => {
        const onFormatRequest = (e: Event) => {
            const mode = (e as CustomEvent<{ mode?: "format" | "indent" }>).detail?.mode ?? "format";
            void runFormatter(mode);
        };
        window.addEventListener("praxis:file-viewer-format", onFormatRequest);
        return () => window.removeEventListener("praxis:file-viewer-format", onFormatRequest);
    }, [runFormatter]);

    // Header — common to every kind. Sticky so it stays visible when
    // the body scrolls (matches the CodeViewer's sticky header).
    const renderHeader = (extraActions?: React.ReactNode) => (
        <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
            <div className="flex items-center gap-2 min-w-0">
                <FileWarning className="size-4 shrink-0 text-cyan-500"/>
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-foreground" title={fileName}>{fileName}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{fileKind} file</p>
                </div>
            </div>
            <div className="flex items-center gap-1.5">
                {extraActions}
                <Button variant="ghost" size="sm" onClick={downloadFile} className="h-8 gap-1.5 text-xs"
                        aria-label="Download File" title="Download File">
                    <Download className="size-3.5"/><span className="hidden sm:inline">Download</span>
                </Button>
            </div>
        </div>
    );

    // Body — kind-specific.
    const renderBody = () => {
        // Skeleton loading — KIND-AWARE: the placeholder mimics the shape
        // of the content that's about to land (table / document / code /
        // media / page) so the transition feels natural and the layout
        // doesn't jump when the real content arrives.
        // ARCHIVES are exempt from this gate: their branch mounts
        // ArchiveTools IMMEDIATELY (chunk download + listing fetch start
        // behind the branch's OWN full-cover skeleton overlay — the
        // MediaStage below), and the overlay clears only when the listing
        // is parsed. Gating here would keep ArchiveTools unmounted behind
        // a timer — the old "skeleton vanishes, chunk still streaming,
        // blank pane" bug.
        if (loading || (contentLoading && !isArchiveFileName(fileName))) {
            // every skeleton is VERTICALLY centered
            // in the viewer pane — previously the placeholder sat at the top
            // of a tall scroll container, which read as "nothing is
            // happening". Media kinds (image/video/audio/pdf below) center
            // on BOTH axes inside their own overlays.
            return (
                <div className="h-full min-h-[320px] flex flex-col items-center justify-center py-6">
                    <FileSkeleton fileKind={fileKind} fileName={fileName}/>
                </div>
            );
        }
        if (fetchError) {
            return (
                <div className="px-4 py-8 text-xs text-destructive">
                    Could not load file: {fetchError}
                </div>
            );
        }

        // Editable text kinds. HTML joined the editable set —
        // view mode keeps the sandboxed iframe preview; edit mode gives
        // the textarea + a live-preview split (below).
        const editableKind = EDITABLE_TEXT_KINDS.includes(fileKind);
        if (editableKind) {
            // Edit mode.
            if (editMode) {
                // MARKDOWN — the EDIT side is the STUDIO (split editor +
                // live preview + outline). It renders here, BEFORE the
                // generic textarea path, so markdown never falls through to
                // the plain editor.
                if (fileKind === "markdown" && onSaveEdit && !locked) {
                    return (
                        <MarkdownStudio
                            content={editContent !== "" ? editContent : content}
                            onChange={handleEditChange}
                            fontScale={zoom}
                            spellWords={spellWordSet}
                            onIgnoreSpell={ignoreSpellWord}
                            onReplaceSpell={replaceStudioSpellWord}
                            onUndo={() => {
                                if (fmtUndoRef.current.length === 0) return false;
                                popFmtUndo();
                                return true;
                            }}
                            onRedo={() => {
                                if (fmtRedoRef.current.length === 0) return false;
                                popFmtRedo();
                                return true;
                            }}
                            onFormat={() => void runFormatter("format")}
                            renderPreview={(text) => (
                                <div
                                    className={cn(
                                        // the configurable reading column (Settings ▸
                                        // Formatting ▸ Markdown) — same rule as the classic
                                        // preview so the studio side reads identically.
                                        mdPreviewWidth === "full"
                                            ? "max-w-full"
                                            : mdPreviewWidth === "wide"
                                                ? "max-w-[56rem] mx-auto"
                                                : mdPreviewWidth === "narrow"
                                                    ? "max-w-[42rem] mx-auto"
                                                    : "max-w-[48rem] mx-auto"
                                    )}
                                >
                                    {/* front matter renders as a metadata card in
                      the studio preview too (not a wall of --- that
                      overlaps the body). */}
                                    <FrontMatterCard text={text}/>
                                    {/* GitHub-grade rendering (tables, inline-code chips,
alerts, task lists) with the live spell marks. */}
                                    <MarkdownGithub
                                        spellWords={spellWordSet.size > 0 ? spellWordSet : undefined}
                                        onIgnoreSpell={spellWordSet.size > 0 ? ignoreSpellWord : undefined}
                                        onReplaceSpell={replaceStudioSpellWord}
                                    >
                                        {splitFrontMatter(text).body}
                                    </MarkdownGithub>
                                </div>
                            )}
                        />
                    );
                }
                // the ContextMenu wrappers moved OUT to the body
                // wrapper in the final return — the trigger now covers the
                // whole body (incl. the white area below a short file), and
                // the menu body is chosen by mode there. This div just fills
                // the scroll area so the textarea grows to the viewport
                // height (min 400px) with the save footer pinned below.
                return (
                    <div
                        className={cn(
                            "relative flex flex-col min-h-full",
                            fileKind === "html" && htmlLayout === "split" && "lg:grid lg:grid-cols-2",
                            fileKind === "html" && htmlLayout === "preview" && "grid place-items-center bg-muted/20"
                        )}
                        style={{minHeight: "100%"}}
                    >
                        {/* the spell overlay mirrors the
                textarea's metrics — misspelled words get the wavy
                underline INSIDE the editor (read view already had
                them), clickable to add to the dictionary. */}
                        <div
                            className={cn(
                                "relative flex flex-col flex-1 min-h-[400px]",
                                fileKind === "html" && htmlLayout === "split" && "lg:border-r border-border"
                            )}
                        >
                            <div className="flex min-h-0 flex-1">
                                {/* ── the LINE-NUMBER GUTTER (edit mode) — the
                    "spacing and line numbering" design for TOML /
                    JSON / YAML / SQL / every code kind: one number per
                    buffer line, the same font + line-height + top
                    padding as the textarea, its own muted background +
                    hairline border, dedicated paddings on BOTH sides
                    (the number never hugs the code column). Hidden on
                    <sm screens and for wrapping modes (numbers count
                    LOGICAL lines). */}
                                {!htmlWrap && (
                                    <div
                                        aria-hidden="true"
                                        className="hidden md:block shrink-0 select-none border-r bg-muted/20 text-right overflow-hidden"
                                        style={{
                                            fontFamily: "var(--font-jb-mono), monospace",
                                            fontSize: "13px",
                                            lineHeight: "1.625",
                                            padding: "1rem 0.5rem 1rem 0.75rem",
                                            minWidth: `${Math.max(2, String(editContent ? editContent.split("\n").length : 1).length) + 1}em`,
                                            color: isDark ? "#4b5563" : "#9ca3af",
                                        }}
                                    >
                                        {Array.from({length: editContent ? editContent.split("\n").length : 1}, (_, i) => (
                                            <div key={i}>{i + 1}</div>
                                        ))}
                                    </div>
                                )}
                                <div className="relative min-w-0 flex-1">
                                    {/* ── the COLUMN RULER (edit mode) — the same guide the
                  Python editor draws, positioned at 16 px (the p-4
                  left padding) + column × measured char width, in a
                  scroll-synced layer so a horizontally scrolled
                  buffer drags it with the text. */}
                                    {rulerColumn > 0 && (
                                        <div
                                            ref={editRulerLayerRef}
                                            aria-hidden="true"
                                            className="absolute inset-0 overflow-hidden pointer-events-none z-[1]"
                                        >
                  <span
                      ref={editProbeRef}
                      aria-hidden="true"
                      style={{
                          position: "absolute", left: -9999, top: -9999, visibility: "hidden",
                          whiteSpace: "pre", pointerEvents: "none",
                          fontFamily: "var(--font-jb-mono), monospace", fontSize: "13px",
                      }}
                  >
                    {"M".repeat(100)}
                  </span>
                                            <div
                                                style={{
                                                    position: "absolute", top: 0, bottom: 0,
                                                    left: `${16 + rulerColumn * editCharWidth}px`,
                                                    width: `${Math.max(1, Math.min(6, rulerLineWidth))}px`,
                                                    background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)",
                                                }}
                                            />
                                        </div>
                                    )}
                                    {/* ── the syntax-highlighted BACKDROP (edit mode) ──
                  The textarea above it turns its text transparent, so the
                  Prism colors shine through with pixel-identical metrics
                  (same font / 13px / 1.625 line-height / 1rem padding).
                  While typing (or past 40 K chars) the backdrop is a plain
                  <pre> — re-tokenizing per keystroke was the CodeViewer's
                  “writing is too slow” trap; the colors return ~160 ms
                  after the pause. Kinds with no grammar (plain text / log)
                  keep the normal opaque textarea. */}
                                    {editBackdropActive && (
                                        <div
                                            ref={editBackdropRef}
                                            aria-hidden="true"
                                            className="absolute inset-0 overflow-hidden pointer-events-none"
                                        >
                                            {editBackdropPlain ? (
                                                <pre
                                                    style={{
                                                        margin: 0,
                                                        background: "transparent",
                                                        color: isDark ? "#abb2bf" : "#383a42",
                                                        fontSize: "13px",
                                                        lineHeight: "1.625",
                                                        padding: "1rem",
                                                        fontFamily: "var(--font-jb-mono), monospace",
                                                        minHeight: "100%",
                                                        height: "auto",
                                                        whiteSpace: htmlWrap ? "pre-wrap" : "pre",
                                                        overflowWrap: htmlWrap ? "anywhere" : "normal",
                                                    } as React.CSSProperties}
                                                >{editContent}</pre>
                                            ) : (
                                                <SyntaxHighlighter
                                                    language={editPrismLanguage}
                                                    style={srcRsStyle}
                                                    showLineNumbers={false}
                                                    wrapLongLines={htmlWrap}
                                                    customStyle={{
                                                        margin: 0,
                                                        background: "transparent",
                                                        fontSize: "13px",
                                                        lineHeight: "1.625",
                                                        padding: "1rem",
                                                        fontFamily: "var(--font-jb-mono), monospace",
                                                        minHeight: "100%",
                                                        height: "auto",
                                                    }}
                                                    codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                                                >{editContent}</SyntaxHighlighter>
                                            )}
                                        </div>
                                    )}
                                    <textarea
                                        ref={editTextareaRef}
                                        value={editContent}
                                        onChange={(e) => {
                                            // DEEP UNDO — count the keystroke BEFORE the
                                            // buffer swap so a pacing snapshot captures the PRE-swap
                                            // text (editContentRef.current still holds it here).
                                            countTypingKeystroke();
                                            handleEditChange(e.target.value);
                                        }}
                                        onScroll={syncEditMirrorScroll}
                                        // selection tracking for the occurrence / bracket / extra-caret
                                        // overlays + the completion trigger (bails when unchanged).
                                        onSelect={noteEditSelection}
                                        onKeyUp={noteEditSelection}
                                        onClick={noteEditSelection}
                                        // the IME composition guard — composingRef spans the whole
                                        // composition session (the keydown isComposing flag alone
                                        // misses its start); the completion popup closes the
                                        // instant one begins so it never floats over the
                                        // pre-edit string.
                                        onCompositionStart={() => {
                                            composingRef.current = true;
                                            setCompletion(null);
                                        }}
                                        onCompositionEnd={() => {
                                            composingRef.current = false;
                                        }}
                                        onFocus={() => {
                                            if (completionBlurTimer.current) {
                                                clearTimeout(completionBlurTimer.current);
                                                completionBlurTimer.current = null;
                                            }
                                        }}
                                        onBlur={() => {
                                            // DEEP UNDO — leaving the editor checkpoints
                                            // the current buffer too (deduped in pushTypingSnapshot;
                                            // the pacing counter resets so the next editing burst
                                            // counts from zero).
                                            keystrokesSinceSnapshotRef.current = 0;
                                            pushTypingSnapshot();
                                            // the completion popup closes on a SHORT delay so item
                                            // clicks (mousedown-preventDefault keeps focus) land.
                                            if (completionBlurTimer.current) clearTimeout(completionBlurTimer.current);
                                            completionBlurTimer.current = setTimeout(() => setCompletion(null), 120);
                                        }}
                                        onKeyDown={(e) => {
                                            // ─── undo/redo for PROGRAMMATIC rewrites ────
                                            //    Auto-format / Auto-indent replaced the buffer in one
                                            //    value write (native undo dead). Our snapshot stack
                                            //    serves Ctrl+Z first; once empty the event falls
                                            //    through to the browser's native typing undo.
                                            if (
                                                (e.ctrlKey || e.metaKey) &&
                                                !e.altKey &&
                                                (e.key === "z" || e.key === "Z")
                                            ) {
                                                // Dictionary-add undo FIRST — if the last action was
                                                // "Add to project dictionary" and no text was edited
                                                // since, Ctrl+Z removes the word + returns the zigzag.
                                                if (!e.shiftKey && undoDictionaryAdd()) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                if (fmtUndoRef.current.length > 0) {
                                                    e.preventDefault();
                                                    if (e.shiftKey) {
                                                        popFmtRedo();
                                                    } else {
                                                        popFmtUndo();
                                                    }
                                                }
                                                return;
                                            }
                                            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "y" || e.key === "Y")) {
                                                if (fmtRedoRef.current.length > 0) {
                                                    e.preventDefault();
                                                    popFmtRedo();
                                                }
                                                return;
                                            }
                                            // ─── the offline COMPLETION POPUP keys ──────
                                            //     While the popup is open ↑/↓ move the active
                                            // item, Tab / Enter insert the suffix after the
                                            // typed prefix (Enter must NOT newline while an
                                            //     item is active), Esc closes. Every branch is
                                            //     IME-guarded — the committing Enter of a
                                            //     composition must fall through to the IME.
                                            if (completion && e.nativeEvent.isComposing === false) {
                                                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                                    if (completion.items.length > 1) {
                                                        e.preventDefault();
                                                        const delta = e.key === "ArrowDown" ? 1 : -1;
                                                        setCompletion((p) =>
                                                            p
                                                                ? {
                                                                    ...p,
                                                                    active:
                                                                        ((p.active + delta) % p.items.length + p.items.length) %
                                                                        p.items.length,
                                                                }
                                                                : p
                                                        );
                                                        return;
                                                    }
                                                } else if (e.key === "Tab" || e.key === "Enter") {
                                                    e.preventDefault();
                                                    insertCompletion(completion.items[completion.active]);
                                                    return;
                                                } else if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    setCompletion(null);
                                                    return;
                                                }
                                            }
                                            // ─── MULTI-CURSOR interception (Ctrl/Cmd+D stacked carets) ──
                                            //     While extra carets are active, plain typing /
                                            //     Enter / Backspace / Delete / Tab apply at EVERY
                                            //     caret via applyToAllCarets; Escape and plain
                                            //     arrows collapse back to the native caret. Runs
                                            //     BEFORE the single-caret paths so they never fire
                                            //     alongside — and IME-guarded like the rest.
                                            if (extraCarets.length > 0 && e.nativeEvent.isComposing === false) {
                                                if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    setExtraCarets([]);
                                                    return;
                                                }
                                                if (
                                                    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key) &&
                                                    !e.ctrlKey && !e.metaKey && !e.altKey
                                                ) {
                                                    // navigation is single-caret — drop the extras and
                                                    // let the native move proceed.
                                                    setExtraCarets([]);
                                                    return;
                                                }
                                                const noMods = !e.ctrlKey && !e.metaKey && !e.altKey;
                                                if (noMods && e.key.length === 1) {
                                                    // Typing (shift allowed — uppercase / symbols);
                                                    // openers auto-pair at every caret (same table the
                                                    // single-caret branch uses).
                                                    const opener = !e.shiftKey ? AUTO_PAIR_OPENERS[e.key] : undefined;
                                                    const handled = applyToAllCarets((buf, s, en) => {
                                                        if (s !== en) {
                                                            // replace the selection (auto-pair wraps it)
                                                            return opener !== undefined
                                                                ? {
                                                                    selStart: s,
                                                                    selEnd: en,
                                                                    text: e.key + buf.slice(s, en) + opener,
                                                                    finalCaret: s + 1
                                                                }
                                                                : {
                                                                    selStart: s,
                                                                    selEnd: en,
                                                                    text: e.key,
                                                                    finalCaret: s + 1
                                                                };
                                                        }
                                                        if (opener !== undefined) {
                                                            return {
                                                                selStart: s,
                                                                selEnd: s,
                                                                text: e.key + opener,
                                                                finalCaret: s + 1
                                                            };
                                                        }
                                                        return {
                                                            selStart: s,
                                                            selEnd: en,
                                                            text: e.key,
                                                            finalCaret: s + 1
                                                        };
                                                    });
                                                    if (handled) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                }
                                                if (noMods && !e.shiftKey && e.key === "Enter") {
                                                    const handled = applyToAllCarets((buf, s, en) => {
                                                        const indent = enterIndentFor(buf, s);
                                                        return {
                                                            selStart: s,
                                                            selEnd: en,
                                                            text: "\n" + indent,
                                                            finalCaret: s + 1 + indent.length
                                                        };
                                                    });
                                                    if (handled) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                }
                                                if (noMods && (e.key === "Backspace" || e.key === "Delete")) {
                                                    const forward = e.key === "Delete";
                                                    const handled = applyToAllCarets((buf, s, en) => {
                                                        if (s !== en) return {
                                                            selStart: s,
                                                            selEnd: en,
                                                            text: "",
                                                            finalCaret: s
                                                        };
                                                        if (forward) {
                                                            if (s >= buf.length) return null;
                                                            return {
                                                                selStart: s,
                                                                selEnd: s + 1,
                                                                text: "",
                                                                finalCaret: s
                                                            };
                                                        }
                                                        if (s === 0) return null;
                                                        return {
                                                            selStart: s - 1,
                                                            selEnd: s,
                                                            text: "",
                                                            finalCaret: s - 1
                                                        };
                                                    });
                                                    if (handled) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                }
                                                if (noMods && !e.shiftKey && e.key === "Tab") {
                                                    // one indent unit at every caret (Shift+Tab stays
                                                    // single-caret: the stack collapses below and the
                                                    // normal dedent branch runs).
                                                    const s = getIndentSettings(loadSettings());
                                                    const unit = s.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, s.width)));
                                                    const handled = applyToAllCarets((_buf, s2, en) => ({
                                                        selStart: s2,
                                                        selEnd: en,
                                                        text: unit,
                                                        finalCaret: s2 + unit.length,
                                                    }));
                                                    if (handled) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                }
                                                if (noMods && e.shiftKey && e.key === "Tab") {
                                                    // Shift+Tab dedent stays single-caret — collapse
                                                    // first, then fall through to the branch below.
                                                    setExtraCarets([]);
                                                }
                                            }
                                            // ─── Ctrl/Cmd+D — stack the next occurrence onto the caret set
                                            //     (multi-cursor; first press selects the word at
                                            //     the caret, Sublime-style). Routed through the
                                            //     rebindable editor.selectNextOccurrence binding —
                                            //     the same one the Python editor uses.
                                            if (
                                                (e.ctrlKey || e.metaKey) &&
                                                matchesShortcut(e.nativeEvent, "editor.selectNextOccurrence") &&
                                                e.nativeEvent.isComposing === false
                                            ) {
                                                e.preventDefault();
                                                setCompletion(null);
                                                selectNextOccurrenceMulti();
                                                return;
                                            }
                                            // ─── AUTO-PAIR + type-over-closer ──
                                            //     Typing an opener (( [ { " ' `) with NO modifiers
                                            //     inserts the pair and parks the caret between them;
                                            //     with a SELECTION it wraps the selection instead.
                                            //     Typing a closer that is ALREADY the next char just
                                            //     moves the caret over it (never doubling it).
                                            //     The type-over check runs BEFORE the opener branch —
                                            //     the quote chars ( " ' `) are BOTH opener and closer,
                                            //     so after an auto-paired "…"| the closing quote must
                                            //     step OVER its partner, not spawn a fresh pair.
                                            //     isComposing guards the IME path — a composition
                                            //     update must not insert stray pairs (the same guard
                                            //     the Python editor uses).
                                            if (
                                                !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
                                                e.key.length === 1 &&
                                                !e.nativeEvent.isComposing
                                            ) {
                                                const ta = e.currentTarget;
                                                const start = ta.selectionStart;
                                                const end = ta.selectionEnd;
                                                if (
                                                    AUTO_PAIR_CLOSERS.has(e.key) &&
                                                    start === end &&
                                                    editContent.slice(start, start + 1) === e.key
                                                ) {
                                                    // type-over: the closer is already right after the
                                                    // caret — advance instead of inserting a second one.
                                                    e.preventDefault();
                                                    ta.setSelectionRange(start + 1, start + 1);
                                                    return;
                                                }
                                                const closer = AUTO_PAIR_OPENERS[e.key];
                                                if (closer !== undefined) {
                                                    e.preventDefault();
                                                    if (start !== end) {
                                                        // selection → wrap [sel] in the pair, keep it selected.
                                                        const selected = editContent.slice(start, end);
                                                        handleEditChange(
                                                            editContent.slice(0, start) + e.key + selected + closer + editContent.slice(end)
                                                        );
                                                        requestAnimationFrame(() => ta.setSelectionRange(start + 1, end + 1));
                                                    } else {
                                                        // bare caret → insert the pair, caret between them.
                                                        handleEditChange(
                                                            editContent.slice(0, start) + e.key + closer + editContent.slice(end)
                                                        );
                                                        requestAnimationFrame(() => {
                                                            ta.selectionStart = ta.selectionEnd = start + 1;
                                                        });
                                                    }
                                                    return;
                                                }
                                            }
                                            // ─── auto-indent + Tab for non-Python files ──
                                            //     The Python editor (CodeViewer) has had Enter
                                            //     auto-indent and Tab/Shift+Tab indent-dedent all
                                            //     along, but THIS editor (markdown / text / json /
                                            //     yaml / toml / sql / r / shell) was a bare textarea
                                            //     — "auto indent for files is not working". Enter
                                            //     now copies the current line's leading whitespace
                                            //     (YAML mapping lines "key:" additionally open one
                                            //     level, the YAML convention); Tab inserts the
                                            //     configured indent unit (Settings → Editor →
                                            //     Indentation) and Shift+Tab dedents a selection.
                                            if (
                                                e.key === "Enter" &&
                                                !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
                                            ) {
                                                // IME guard: the Enter that COMMITS a CJK
                                                //     IME candidate fires keydown BEFORE the
                                                //     composition ends — splice "\n"+indent into the
                                                //     pre-edit string otherwise. Bail out and let the
                                                //     IME own the keystroke (the composed text lands
                                                //     via onChange).
                                                if (e.nativeEvent.isComposing) return;
                                                e.preventDefault();
                                                const ta = e.currentTarget;
                                                const start = ta.selectionStart;
                                                const end = ta.selectionEnd;
                                                const before = editContent.slice(0, start);
                                                const lineStart = before.lastIndexOf("\n") + 1;
                                                const currentLine = editContent.slice(lineStart, start);
                                                const indentMatch = currentLine.match(/^[ \t]*/);
                                                let indent = indentMatch ? indentMatch[0] : "";
                                                const s = getIndentSettings(loadSettings());
                                                const unit = s.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, s.width)));
                                                // YAML: "key:" opens a nested block — indent one level.
                                                if (fileKind === "yaml" && currentLine.trimEnd().endsWith(":")) {
                                                    indent += unit;
                                                }
                                                const insert = "\n" + indent;
                                                const newContent = editContent.slice(0, start) + insert + editContent.slice(end);
                                                handleEditChange(newContent);
                                                requestAnimationFrame(() => {
                                                    ta.selectionStart = ta.selectionEnd = start + insert.length;
                                                });
                                                return;
                                            }
                                            if (e.key === "Tab") {
                                                // IME guard: the same pre-edit corruption risk the
                                                //     Enter branch has — Tab during composition must
                                                //     reach the IME (candidates navigation), never
                                                //     indent the buffer under it.
                                                if (e.nativeEvent.isComposing) return;
                                                e.preventDefault();
                                                const ta = e.currentTarget;
                                                const start = ta.selectionStart;
                                                const end = ta.selectionEnd;
                                                const s = getIndentSettings(loadSettings());
                                                const unit = s.style === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, s.width)));
                                                // Multi-line selection (or Shift+Tab): indent /
                                                // dedent every line in the block, like the Python
                                                // editor's Smart Tab.
                                                const selected = editContent.slice(start, end);
                                                const hasNewline =
                                                    selected.includes("\n") ||
                                                    editContent.slice(0, start).lastIndexOf("\n") !==
                                                    editContent.slice(0, end).lastIndexOf("\n");
                                                if (hasNewline || e.shiftKey) {
                                                    const firstLineStart = editContent.slice(0, start).lastIndexOf("\n") + 1;
                                                    const block = editContent.slice(firstLineStart, end);
                                                    const blockLines = block.split("\n");
                                                    const changed = e.shiftKey
                                                        ? blockLines.map((ln) => {
                                                            if (ln.startsWith("\t")) return ln.slice(1);
                                                            let removed = 0;
                                                            let i = 0;
                                                            while (i < ln.length && ln[i] === " " && removed < unit.length) {
                                                                removed++;
                                                                i++;
                                                            }
                                                            return ln.slice(removed);
                                                        })
                                                        : blockLines.map((ln) => unit + ln);
                                                    const newBlock = changed.join("\n");
                                                    handleEditChange(
                                                        editContent.slice(0, firstLineStart) + newBlock + editContent.slice(end)
                                                    );
                                                    const lengthDiff = newBlock.length - block.length;
                                                    requestAnimationFrame(() => {
                                                        ta.selectionStart = firstLineStart;
                                                        ta.selectionEnd = end + lengthDiff;
                                                    });
                                                    return;
                                                }
                                                // Caret (or single-line selection): insert one unit.
                                                const newContent = editContent.slice(0, start) + unit + editContent.slice(end);
                                                handleEditChange(newContent);
                                                requestAnimationFrame(() => {
                                                    ta.selectionStart = ta.selectionEnd = start + unit.length;
                                                });
                                                return;
                                            }
                                        }}
                                        className={cn(
                                            "relative w-full flex-1 min-h-[400px] p-4 font-mono text-[0.8125rem] leading-relaxed border-0 outline-none resize-none",
                                            // over the Prism backdrop the textarea's own
                                            // text is TRANSPARENT (the backdrop supplies the colors);
                                            // kinds with no grammar keep the normal opaque text.
                                            editBackdropActive ? "bg-transparent text-transparent" : "bg-background text-foreground"
                                        )}
                                        style={{
                                            fontFamily: "var(--font-jb-mono), monospace",
                                            fontSize: "13px",
                                            lineHeight: "1.625",
                                            whiteSpace: htmlWrap ? "pre-wrap" : "pre",
                                            overflowWrap: htmlWrap ? "anywhere" : "normal",
                                            // the caret stays visible over the transparent
                                            // text; field-sizing auto-grows the textarea (see the
                                            // state block) so the backdrop never drifts.
                                            caretColor: isDark ? "#abb2bf" : "#383a42",
                                            ...(fieldSizingSupported ? {fieldSizing: "content" as const} : {}),
                                        } as React.CSSProperties}
                                        spellCheck={false}
                                        autoFocus
                                    />
                                    {spellCheckable && (
                                        <SpellTextOverlay
                                            text={editContent}
                                            words={spellWordSet}
                                            onIgnore={ignoreSpellWord}
                                            onReplace={replaceSpellWord}
                                            onReplaceOnce={(w, s) => {
                                                // The overlay marks words positionally — find the
                                                // first occurrence in the LIVE buffer (the mark the
                                                // user clicked is the visible one; word-boundary
                                                // replace-once keeps every other misspelling).
                                                const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
                                                const hit = re.exec(editContent);
                                                if (!hit) {
                                                    replaceSpellWord(w, s);
                                                    return;
                                                }
                                                const before = editContent.slice(0, hit.index);
                                                const line = before.split("\n").length;
                                                const col = hit.index - (before.lastIndexOf("\n") + 1) + 1;
                                                replaceSpellWordAt(w, s, line, col);
                                            }}
                                            overlayRef={editSpellOverlayRef}
                                            className="p-4 font-mono text-[0.8125rem] leading-relaxed text-transparent"
                                            style={{
                                                fontFamily: "var(--font-jb-mono), monospace",
                                                fontSize: "13px",
                                                whiteSpace: htmlWrap ? "pre-wrap" : "pre",
                                                overflowWrap: htmlWrap ? "anywhere" : "normal",
                                            }}
                                        />
                                    )}
                                    {/* ── the passive highlight layer mount) — the
                bracket-match + selection-occurrence wiring the audit
                found dead. One absolutely-positioned, pointer-events-
                none, scroll-synced layer (the spell overlay's exact
                positioning pattern): tab-aware pixelXOfColumn for the
                left offset, (line × 21.125px) + the p-4 padding for
                the top. Occurrences paint as subtle primary rects;
                BOTH ends of the matched bracket pair get the distinct
                orange tint; extra carets (Ctrl/Cmd+D) render as 2px
                primary bars with their selection rects. Never
                intercepts pointer events; soft-wrap suspends it. */}
                                    {editOverlayRects && editOverlayRects.length > 0 && (
                                        <div
                                            ref={editOccLayerRef}
                                            aria-hidden="true"
                                            className="absolute inset-0 overflow-hidden pointer-events-none z-[2]"
                                        >
                                            {editOverlayRects.map((r, i) => (
                                                <div
                                                    key={`ovl${i}`}
                                                    data-overlay-kind={r.kind}
                                                    className={cn(
                                                        "absolute rounded-[2px]",
                                                        r.kind === "occurrence" && "bg-primary/15 border border-primary/30",
                                                        r.kind === "bracket" && "bg-orange-500/20",
                                                        r.kind === "mc-sel" && "bg-primary/20",
                                                        r.kind === "mc-caret" && "bg-primary"
                                                    )}
                                                    style={{
                                                        top: `${r.top}px`,
                                                        left: `${r.left}px`,
                                                        width: `${r.width}px`,
                                                        height: `${EDIT_LINE_H}px`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {/* ── the offline COMPLETION POPUP mount) — rendered
                BELOW the caret's line (16px padding + one line box +
                2px gap; left from the same tab-aware column math),
                above the textarea (z-20) and pointer-events-auto so
                item clicks land. role=listbox / role=option /
                aria-selected + the aria-activedescendant linkage make
                the active item readable while focus stays in the
                textarea. */}
                                    {completion && completion.items.length > 0 && (() => {
                                        const before = editContent.slice(0, completion.caret);
                                        const lastNl = before.lastIndexOf("\n");
                                        const lineStart = lastNl + 1;
                                        const nextNl = editContent.indexOf("\n", lineStart);
                                        const lineText = editContent.slice(
                                            lineStart,
                                            nextNl === -1 ? editContent.length : nextNl
                                        );
                                        const caretLine = before.split("\n").length - 1;
                                        const col = completion.caret - lineStart;
                                        const top = 16 + (caretLine + 1) * EDIT_LINE_H + 2;
                                        const left = Math.max(
                                            0,
                                            16 + pixelXOfColumn(lineText, col, EDIT_TAB_SIZE, editCharWidth)
                                        );
                                        return (
                                            <div
                                                ref={completionListRef}
                                                role="listbox"
                                                aria-label="Completions"
                                                id={`${completionDomId}-listbox`}
                                                aria-activedescendant={`${completionDomId}-opt-${completion.active}`}
                                                className="absolute z-20 pointer-events-auto max-h-[40vh] overflow-y-auto w-64 rounded-md border bg-popover text-popover-foreground shadow-lg text-xs py-1"
                                                style={{top: `${top}px`, left: `${left}px`}}
                                            >
                                                {completion.items.map((item, i) => (
                                                    <div
                                                        key={item.label}
                                                        id={`${completionDomId}-opt-${i}`}
                                                        role="option"
                                                        aria-selected={i === completion.active}
                                                        className={cn(
                                                            "flex items-center justify-between gap-2 px-2 py-1 cursor-pointer font-mono",
                                                            i === completion.active && "bg-accent text-accent-foreground"
                                                        )}
                                                        onMouseDown={(e) => {
                                                            // preventDefault keeps the textarea's focus
                                                            // (no blur-close race) before the insert.
                                                            e.preventDefault();
                                                            insertCompletion(item);
                                                        }}
                                                    >
                                                        <span className="truncate">{item.label}</span>
                                                        <span
                                                            className={cn(
                                                                "shrink-0 text-[9px] uppercase tracking-wide",
                                                                item.source === "keyword"
                                                                    ? "text-muted-foreground"
                                                                    : "text-emerald-600 dark:text-emerald-400"
                                                            )}
                                                        >
                        {item.source}
                      </span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                        {/* the live preview honors the consolidated
                toolbar mode — Split (right half, mirrors every
                keystroke) or Preview (the whole pane). */}
                        {fileKind === "html" && (htmlLayout === "split" || htmlLayout === "preview") && (
                            <iframe
                                srcDoc={editContent}
                                title={`${fileName} — live preview`}
                                sandbox="allow-same-origin"
                                className={cn(
                                    "bg-white",
                                    htmlLayout === "split" ? "w-full h-full min-h-[400px] flex-1" : "w-full h-full max-w-4xl min-h-[480px] rounded-md border shadow-sm"
                                )}
                                style={{border: htmlLayout === "split" ? 0 : undefined}}
                            />
                        )}
                    </div>
                );
            }
            // Read mode — kind-specific renderer.
            // markdown STUDIO mode — split editor + live
            // preview with synced scrolling + outline (replaces the
            // render-or-textarea toggle when enabled; the header's View /
            // Studio / Edit buttons switch modes).
            // config validation banner — sits ABOVE the
            // highlighted source for yaml/toml/ini files once the Validate
            // toolbar button ran; issue lines are clickable (jump = open
            // edit mode with the caret on that line).
            const validateBanner = validation ? (
                <div className="px-3 py-2 border-b text-xs space-y-1">
                    {validation.busy && <p className="text-muted-foreground">Validating…</p>}
                    {validation.issues && validation.issues.length === 0 && (
                        <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck
                                className="size-3.5"/> Valid {fileKind === "yaml" ? "YAML" : fileKind === "toml" ? "TOML" : "INI"} —
                            no issues found.
                        </p>
                    )}
                    {validation.issues && validation.issues.length > 0 && (
                        <>
                            <p className="font-medium text-amber-600 dark:text-amber-400">
                                {validation.issues.length} issue(s):
                            </p>
                            <ul className="space-y-0.5">
                                {validation.issues.map((iss, i) => {
                                    // A missing Python module (e.g. the TOML validator
                                    // needing `toml` on Python < 3.11) gets a one-click
                                    // pip install button right next to the error — after
                                    // the install, validation re-runs automatically.
                                    const missing = missingModuleFrom(iss.message);
                                    return (
                                        <li key={i} className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                className="text-left text-red-600 dark:text-red-400 hover:underline"
                                                title={iss.line ? `Jump to line ${iss.line}` : undefined}
                                                onClick={() => {
                                                    if (iss.line) {
                                                        setEditContent(content);
                                                        setEditMode(true);
                                                        requestAnimationFrame(() => {
                                                            const ta = editTextareaRef.current;
                                                            if (!ta) return;
                                                            const lines = content.split("\n");
                                                            const pos = lines.slice(0, iss.line! - 1).join("\n").length + (iss.line! > 1 ? 1 : 0);
                                                            ta.focus();
                                                            ta.setSelectionRange(pos, Math.min(ta.value.length, pos + (lines[iss.line! - 1]?.length ?? 0)));
                                                        });
                                                    }
                                                }}
                                            >
                                                {iss.line ? `Line ${iss.line}: ` : ""}{iss.message}
                                            </button>
                                            {missing && (
                                                <PipInstallButton
                                                    module={missing}
                                                    onInstalled={() => {
                                                        // The parser the validator shells out to is
                                                        // now available — check the file again.
                                                        void runValidation();
                                                    }}
                                                />
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            ) : null;
            /* The spell-marked twin of rawText — rendered INSTEAD of the
         highlighted view for kinds that have NO syntax grammar (plain
         text / log), so the wavy underlines stay visible there.
         Grammar-bearing kinds (html / json / yaml / toml / sql / r /
         shell …) ALWAYS keep their syntax colors in view mode —
         replacing the highlighted source with a flat marked div made
         HTML and friends look uncolored; their spell marks live in
         edit mode (the textarea overlay) and the header chip's count.
         The banner explains where the marks are; clicking a marked
         word adds it to the project dictionary. */
            const spellMarkedKind =
                jsxLanguageFor(fileKind, fileName) === undefined &&
                ["text", "log"].includes(fileKind) &&
                spellWordSet.size > 0;
            const spellMarkedView = spellMarkedKind ? (
                <React.Fragment>
                    {validateBanner}
                    <div
                        className="px-3 py-1.5 border-b bg-amber-500/10 text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <SpellCheck className="size-3 text-red-500 shrink-0"/>
                        <span className="flex-1">Spell marks visible — click a wavy-underlined word to add it to the project dictionary.</span>
                        <span
                            className="shrink-0 font-medium text-red-600 dark:text-red-400">{spellIssues.length} misspelled</span>
                    </div>
                    <div className="relative">
                        {/* ─── column ruler — the SAME guide the code
              surfaces draw, now on the plain-text marked view too
              (Markdown's Source view and every code kind already had
              it; this surface used to DROP the ruler whenever spell
              issues replaced the highlighted twin). The width probe
              mirrors the marked view's own mono font/size. */}
                        <span
                            ref={markedProbeRef}
                            aria-hidden="true"
                            style={{
                                position: "absolute", left: -9999, top: -9999, visibility: "hidden",
                                whiteSpace: "pre", pointerEvents: "none",
                                fontFamily: "var(--font-jb-mono), monospace",
                                fontSize: `${13 * zoom}px`,
                            }}
                        >
            {"M".repeat(100)}
          </span>
                        {rulerColumn > 0 && (
                            <div
                                aria-hidden="true"
                                className="absolute top-0 bottom-0 pointer-events-none z-[1]"
                                style={{
                                    left: `${16 + rulerColumn * (markedCharWidth > 0 ? markedCharWidth : 7.8 * zoom)}px`,
                                    width: `${Math.max(1, Math.min(6, rulerLineWidth))}px`,
                                    background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)",
                                }}
                            />
                        )}
                        <div
                            className="px-4 py-3 whitespace-pre-wrap break-words font-mono"
                            style={{
                                fontSize: `${13 * zoom}px`,
                                lineHeight: "1.6",
                                fontFamily: "var(--font-jb-mono), monospace",
                            }}
                        >
                            {markSpellWords(content, spellWordSet, ignoreSpellWord, replaceSpellWord)}
                        </div>
                    </div>
                </React.Fragment>
            ) : null;
            if (fileKind === "markdown") {
                // SOURCE mode — the syntax-highlighted raw Markdown
                // (read-only) as a DESIGNED surface, not a bare dumped <pre>:
                //   ▸ its own header strip (file stats + line count) so the
                //     three file-level modes read as one family;
                //   ▸ a proper line-number GUTTER — the digit count sizes the
                //     column (a 4-digit file no longer squeezes into 2.5em),
                //     the gutter gets its own background + hairline border
                //     and the code column its own left padding (the old
                //     "1# Heading" number-hugging-the-code design is gone);
                //   ▸ its OWN word-wrap toggle (the mode used to borrow the
                //     HTML layout's wrap state — toggling wrap on an HTML file
                //     flipped the Markdown source too);
                //   ▸ an "Edit Source" affordance IN the panel (opens the
                //     studio — the file's editing surface).
                // The rendered Preview stays the default.
                if (mdViewMode === "source") {
                    const srcLines = content ? content.split("\n").length : 1;
                    const srcDigits = Math.max(1, String(srcLines).length);
                    return (
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
                <span
                    className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                  <Code2 className="size-3"/> Source
                </span>
                                <span className="hidden md:inline text-[10px] text-muted-foreground"
                                      title="Source document statistics">
                  {srcLines.toLocaleString()} lines · {content.length.toLocaleString()} chars
                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto h-6 px-2 text-[11px]"
                                    onClick={() => setMdSourceWrap((v) => !v)}
                                    title="Wrap long source lines (no horizontal scrolling)"
                                    aria-pressed={mdSourceWrap}
                                >
                                    <WrapText className={cn("size-3.5", mdSourceWrap && "text-emerald-500")}/>
                                    <span className="hidden sm:inline">{mdSourceWrap ? "Wrap On" : "Wrap Off"}</span>
                                </Button>
                                {onSaveEdit && !locked && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 gap-1 px-2 text-[11px]"
                                        onClick={startEdit}
                                        title="Open the Markdown studio — split editor + live preview (Esc / View returns here)"
                                        aria-label="Open the Markdown studio"
                                    >
                                        <Pencil className="size-3.5 text-emerald-500"/>
                                        Edit Source
                                    </Button>
                                )}
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto">
                                {spellMarkedView ?? (
                                    <CodeViewSurface
                                        rulerColumn={rulerColumn}
                                        rulerLineWidth={rulerLineWidth}
                                        isDark={isDark}
                                        spellIssues={viewSpellIssues}
                                        onIgnoreSpell={ignoreSpellWord}
                                        onReplaceSpell={replaceSpellWord}
                                        onReplaceSpellOnce={(w, s, l, c) => replaceSpellWordAt(w, s, l, c)}
                                        wrap={mdSourceWrap}
                                        text={content}
                                        metricsKey={`md-src-${zoom}-${content.length}-${spellIssues.length}-${mdSourceWrap}`}
                                        fillBg={srcCodeBg}
                                    >
                                        <SyntaxHighlighter
                                            language="markdown"
                                            style={srcRsStyle}
                                            showLineNumbers
                                            wrapLongLines={mdSourceWrap}
                                            customStyle={{
                                                // the code-theme picker's selected palette (unified with the Python editor).
                                                margin: 0, background: srcCodeBg,
                                                fontSize: `${13 * zoom}px`,
                                                padding: "0.75rem 0.75rem 0.75rem 0",
                                                fontFamily: "var(--font-jb-mono), monospace",
                                            }}
                                            lineNumberStyle={{
                                                minWidth: `${srcDigits + 1.5}em`,
                                                paddingLeft: "0.5em", paddingRight: "0.75em",
                                                borderRight: `1px solid ${isDark ? "#3e4451" : "#e5e7eb"}`,
                                                marginRight: "0.75em",
                                                background: isDark ? "#21252b" : "#f3f4f6",
                                                color: isDark ? "#4b5563" : "#9ca3af",
                                                userSelect: "none", textAlign: "right",
                                            }}
                                            codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                                        >{content}</SyntaxHighlighter>
                                    </CodeViewSurface>
                                )}
                            </div>
                        </div>
                    );
                }
                // the leading YAML front-matter block (--- title:...
                // ---) used to be fed RAW into ReactMarkdown — it rendered as
                // thematic breaks + a setext H2 that OVERLAPPED the body (the
                // user's classic-view report). It now splits off into a
                // metadata card and the BODY renders alone.
                //
                // (the markdown redesign, "redesign how to
                // handle the md files, class view, studio, etc."): the classic
                // PREVIEW mode is no longer the "plain" mode — it now carries
                // the studio's two marquee affordances so all three modes read
                // as ONE designed surface:
                //   ▸ a right-side OUTLINE rail (click → scroll to the heading,
                //     active-heading tracking as the document scrolls);
                //   ▸ the live document STAT line (words · chars · headings ·
                //     reading time) at the top of the rail.
                // Narrow viewports hide the rail (the studio does the same);
                // the prose column and front-matter card are unchanged.
                const {entries, body} = splitFrontMatter(content);
                const outline = parseMarkdownOutline(body);
                const stats = {
                    words: body.trim() ? body.trim().split(/\s+/).length : 0,
                    chars: body.length,
                    readingTime: Math.max(1, Math.ceil((body.trim() ? body.trim().split(/\s+/).length : 0) / 220)),
                };
                /* PERF: rAF-throttled scroll-spy over the CACHED heading tops
          (measured in the layout effect near mdHeadingTopsRef) — one
          pass over a plain number array per frame, a setState only
          when the active heading actually changes, and zero DOM
          queries while scrolling. */
                const onMdPreviewScroll = () => {
                    if (mdScrollRafRef.current !== null) return;
                    mdScrollRafRef.current = requestAnimationFrame(() => {
                        mdScrollRafRef.current = null;
                        const el = mdPreviewScrollRef.current;
                        if (!el) return;
                        const tops = mdHeadingTopsRef.current;
                        if (tops.length === 0) return;
                        let active = -1;
                        for (let i = 0; i < tops.length; i++) {
                            if (tops[i] <= el.scrollTop + 12) active = i;
                        }
                        setMdActiveHeading((prev) => (prev === active ? prev : active));
                    });
                };
                // The preview reading column WIDTH
                // preview the content is wrapping at specific width/chars — is
                // that in the settings?") — driven by Settings ▸ Formatting ▸
                // Markdown ▸ Preview reading width. The RULER also draws over
                // the preview now (the same guide + master switch the code
                // views use — "Formatting Tab and Ruler does not appear in the
                // md preview"), pinned at the configured column via the prose
                // font's ch unit so it tracks font-size/zoom.
                //
                // WRAP RULE
                // wrapping of the content according to the rules … it wraps
                // AFTER the ruler — does it follow another thing?"): when the
                // column ruler is ON, the prose column is clamped to exactly
                // the RULER column (rulerColumn ch) so the text wraps AT the
                // guide — the same rule the code editor follows — instead of
                // at the rem-based reading width. The reading-width presets
                // apply only when the ruler is off (0).
                const mdPreviewWidthClass =
                    rulerColumn > 0
                        ? "max-w-[unset]"
                        : mdPreviewWidth === "narrow" ? "max-w-[42rem]"
                            : mdPreviewWidth === "wide" ? "max-w-[56rem]"
                                : mdPreviewWidth === "full" ? "max-w-full"
                                    : "max-w-[48rem]";
                const mdProseStyle: React.CSSProperties =
                    rulerColumn > 0 ? {maxWidth: `${rulerColumn}ch`} : {};
                return (
                    <div className="flex h-full min-h-0">
                        <div
                            ref={mdPreviewScrollRef}
                            onScroll={onMdPreviewScroll}
                            className="min-w-0 flex-1 overflow-y-auto px-6 py-4"
                            data-testid="markdown-preview-scroll"
                        >
                            <div className={cn("relative", mdPreviewWidthClass)} style={mdProseStyle}>
                                {rulerColumn > 0 && (
                                    <div
                                        aria-hidden="true"
                                        className="pointer-events-none absolute top-0 bottom-0"
                                        style={{
                                            left: `${rulerColumn}ch`,
                                            width: `${Math.max(1, Math.min(6, rulerLineWidth))}px`,
                                            background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)",
                                        }}
                                    />
                                )}
                                <FrontMatterCard entries={entries}/>
                                <MarkdownGithub
                                    spellWords={spellWordSet.size > 0 ? spellWordSet : undefined}
                                    onIgnoreSpell={spellWordSet.size > 0 ? ignoreSpellWord : undefined}
                                    onReplaceSpell={replaceSpellWord}
                                >
                                    {body}
                                </MarkdownGithub>
                            </div>
                        </div>
                        {outline.length > 0 && (
                            <aside
                                aria-label="Document outline"
                                className="hidden lg:flex w-60 shrink-0 flex-col border-l bg-muted/10"
                            >
                                <p className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/20">
                                    <ListTree className="size-3"/> Outline
                                    <span
                                        className="ml-auto rounded-full bg-muted px-1.5 text-[9px] tabular-nums">{outline.length}</span>
                                </p>
                                <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                                    {outline.map((h, i) => (
                                        <li key={`${h.line}-${h.text}`}>
                                            <button
                                                type="button"
                                                className={cn(
                                                    "relative w-full text-left text-[11px] rounded px-1.5 py-1 truncate hover:bg-muted/60 transition",
                                                    mdActiveHeading === i && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                                                    h.level > 1 && "opacity-90"
                                                )}
                                                style={{paddingLeft: `${(h.level - 1) * 10 + 6}px`}}
                                                title={h.text}
                                                onClick={() => {
                                                    const scroller = mdPreviewScrollRef.current;
                                                    if (!scroller) return;
                                                    const target = scroller.querySelector(`#${CSS.escape(headingAnchor(h.text))}`);
                                                    if (target instanceof HTMLElement) {
                                                        scroller.scrollTo({
                                                            top: target.offsetTop - 12,
                                                            behavior: "smooth"
                                                        });
                                                    }
                                                }}
                                            >
                                                {mdActiveHeading === i && (
                                                    <span aria-hidden
                                                          className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-500"/>
                                                )}
                                                {h.text}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <p className="px-3 py-1.5 border-t text-[10px] text-muted-foreground tabular-nums"
                                   title="Live document statistics">
                                    {stats.words.toLocaleString()} words · {stats.chars.toLocaleString()} chars ·
                                    ~{stats.readingTime} min read
                                </p>
                            </aside>
                        )}
                    </div>
                );
            }
            // json/yaml/toml/sql/r/shell/text/log → syntax-highlighted view.
            //.log gets the dedicated level-colored log
            // viewer (filter + virtualization + optional follow).
            if (fileKind === "log") {
                return (
                    <LogViewer
                        content={content}
                        contentTruncated={contentTruncated}
                        fontScale={zoom}
                        spellWords={spellWordSet.size > 0 ? spellWordSet : undefined}
                        onIgnoreSpell={spellWordSet.size > 0 ? ignoreSpellWord : undefined}
                        refetch={async () => {
                            try {
                                const bust = fileUrl.includes("?") ? "&_=" : "?_=";
                                const res = await fetch(`${fileUrl}${bust}${Date.now()}`);
                                if (!res.ok) return null;
                                return await res.text();
                            } catch {
                                return null;
                            }
                        }}
                    />
                );
            }
            //.env files get the two-column form editor with
            // masked secrets (other text kinds keep the classic flow).
            if (fileKind === "text" && fileName.toLowerCase().endsWith(".env") && onSaveEdit && !locked) {
                return (
                    <EnvEditor
                        content={content}
                        onDirtyChange={setEnvDirty}
                        onSave={(next) => {
                            setSaving(true);
                            onSaveEdit(next, {folderSlug, fileSlug})
                                .then(() => setContent(next))
                                .catch(() => undefined)
                                .finally(() => setSaving(false));
                        }}
                    />
                );
            }
            // FIX + EXTENSION: text-ish files showed the
            // red COUNT chip but never the wavy underlines — the marks only
            // ran inside the MARKDOWN renderer (markdownComponents).
            // spellMarkedView (defined just before rawText) is the marked
            // plain twin of the highlighted view: when the checker has
            // issues for a text / yaml / toml / sql / r / shell / json / html
            // file, the MARKED view renders in its place (no issues / spell
            // off → the normal highlighted view, unchanged).
            // the view-mode language map is the SHARED
            // prismLanguageFor (also used by the edit backdrop + fences) —
            // ruby / php / go joined, and .ini/.cfg/.conf text files finally
            // map to the registered ini grammar instead of no color at all.
            // jsxLanguageFor also routes.jsx/.tsx sources to the
            // dedicated grammars and .diff/.patch to the diff grammar.
            const language = jsxLanguageFor(fileKind, fileName);

            const canValidate = canValidateKind(fileKind, fileName);
            void canValidate;
            // Line-number GUTTER redesign (the "spacing and line numbering
            // in toml files is not correct" fix): the column is sized by
            // the file's DIGIT COUNT (2.5em squeezed 4-digit files into a
            // cramped overlap), the gutter gets its own muted background +
            // hairline border and dedicated paddings on BOTH sides — the
            // number never hugs the code column, long files stay aligned,
            // and every text kind (TOML / YAML / JSON / SQL / shell…) gets
            // the same clean design.
            const viewLineCount = content ? content.split("\n").length : 1;
            const viewDigits = Math.max(2, String(viewLineCount).length);
            /* VIEW-MODE ZIGZAGS + RULER for every grammar kind: the marked
       * plain twin (spellMarkedView) only ever covered text/log — the
       * grammar-bearing kinds kept the highlighted view and lost the
       * underlines ("some languages have no zigzags spell checking in
       * the view mode"). CodeViewSurface keeps the colors AND draws
       * the wavy marks + the column ruler over them, positioned from
       * measured DOM metrics. The positions re-derive from
       * spellIssues on every re-check (500 ms debounce after edits /
       * auto-indent / auto-format swaps the buffer), so the zigzags
       * track the formatted text automatically. */
            const rawText = (
                <React.Fragment>
                    {validateBanner}
                    <CodeViewSurface
                        rulerColumn={rulerColumn}
                        rulerLineWidth={rulerLineWidth}
                        isDark={isDark}
                        spellIssues={viewSpellIssues}
                        onIgnoreSpell={ignoreSpellWord}
                        onReplaceSpell={replaceSpellWord}
                        onReplaceSpellOnce={(w, s, l, c) => replaceSpellWordAt(w, s, l, c)}
                        wrap={false}
                        text={content}
                        metricsKey={`${fileKind}-${zoom}-${lineHeight}-${letterSpacing}-${content.length}-${spellIssues.length}`}
                        fillBg={srcCodeBg}
                    >
                        <SyntaxHighlighter
                            language={language}
                            style={srcRsStyle}
                            showLineNumbers
                            wrapLongLines={false}
                            customStyle={{
                                /* the background now follows the SELECTED code theme
                (srcThemeEntry — the union-bar picker) instead of the
                hardcoded One Dark/Light pair, matching the Python
                editor's behavior; fillBg on CodeViewSurface continues
                the color below the last line. */
                                margin: 0, background: srcCodeBg,
                                fontSize: `${13 * zoom}px`, lineHeight: String(lineHeight),
                                ...(letterSpacing ? {letterSpacing: `${letterSpacing}px`} : null),
                                padding: "0.75rem 0.75rem 0.75rem 0",
                                fontFamily: "var(--font-jb-mono), monospace",
                            }}
                            lineNumberStyle={{
                                minWidth: `${viewDigits + 1.5}em`,
                                paddingLeft: "0.5em", paddingRight: "0.75em",
                                borderRight: `1px solid ${isDark ? "#3e4451" : "#e5e7eb"}`,
                                marginRight: "0.75em",
                                background: isDark ? "#21252b" : "#f3f4f6",
                                color: isDark ? "#4b5563" : "#9ca3af",
                                userSelect: "none", textAlign: "right",
                            }}
                            codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                        >{content}</SyntaxHighlighter>
                    </CodeViewSurface>
                </React.Fragment>
            );
            // JSON inspector — tree ⇄ text, live validation
            // with jump-to-line, format / minify, JSONPath query box.
            if (fileKind === "json") {
                return (
                    <JsonInspector
                        content={content}
                        contentTruncated={contentTruncated}
                        rawView={spellMarkedView ?? rawText}
                        fontScale={zoom}
                        onRewrite={(text) => {
                            if (!onSaveEdit) return;
                            setSaving(true);
                            onSaveEdit(text, {folderSlug, fileSlug})
                                .then(() => setContent(text))
                                .catch(() => undefined)
                                .finally(() => setSaving(false));
                        }}
                    />
                );
            }
            /* HTML read mode — the consolidated toolbar drives
READ mode too. Preview = the sandboxed iframe in NON-edit
mode (the read view previously fell
through to rawText and the old iframe branch was UNREACHABLE
dead code). Source = syntax-highlighted markup; Split = source
beside the live preview. Must sit BEFORE the `return rawText`
fall-through of the editable kinds. */
            if (fileKind === "html") {
                // spell marks render in the Source / Split source
                // pane too (the marked twin replaces the highlighter while
                // issues exist). The Preview iframe keeps rendering normally —
                // styles inside a sandboxed iframe can't carry the marks.
                if (htmlLayout === "source") {
                    const htmlDigits = Math.max(2, String(content ? content.split("\n").length : 1).length);
                    return spellMarkedView ?? (
                        <CodeViewSurface
                            rulerColumn={rulerColumn}
                            rulerLineWidth={rulerLineWidth}
                            isDark={isDark}
                            spellIssues={viewSpellIssues}
                            onIgnoreSpell={ignoreSpellWord}
                            onReplaceSpell={replaceSpellWord}
                            onReplaceSpellOnce={(w, s, l, c) => replaceSpellWordAt(w, s, l, c)}
                            wrap={htmlWrap}
                            text={content}
                            metricsKey={`html-src-${zoom}-${content.length}-${spellIssues.length}-${htmlWrap}`}
                            fillBg={srcCodeBg}
                        >
                            <SyntaxHighlighter
                                language="markup"
                                style={srcRsStyle}
                                showLineNumbers
                                wrapLongLines={htmlWrap}
                                customStyle={{
                                    margin: 0, background: srcCodeBg,
                                    fontSize: `${13 * zoom}px`,
                                    padding: "0.75rem 0.75rem 0.75rem 0",
                                    fontFamily: "var(--font-jb-mono), monospace",
                                }}
                                lineNumberStyle={{
                                    minWidth: `${htmlDigits + 1.5}em`,
                                    paddingLeft: "0.5em", paddingRight: "0.75em",
                                    borderRight: `1px solid ${isDark ? "#3e4451" : "#e5e7eb"}`,
                                    marginRight: "0.75em",
                                    background: isDark ? "#21252b" : "#f3f4f6",
                                    color: isDark ? "#4b5563" : "#9ca3af",
                                    userSelect: "none", textAlign: "right",
                                }}
                                codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                            >{content}</SyntaxHighlighter>
                        </CodeViewSurface>
                    );
                }
                if (htmlLayout === "split") {
                    return (
                        <div className="lg:grid lg:grid-cols-2 h-full min-h-[400px]">
                            <div className="lg:border-r border-border overflow-auto">
                                {spellMarkedView ?? (
                                    <CodeViewSurface
                                        rulerColumn={rulerColumn}
                                        rulerLineWidth={rulerLineWidth}
                                        isDark={isDark}
                                        spellIssues={htmlWrap ? [] : viewSpellIssues}
                                        onIgnoreSpell={ignoreSpellWord}
                                        onReplaceSpell={replaceSpellWord}
                                        onReplaceSpellOnce={(w, s, l, c) => replaceSpellWordAt(w, s, l, c)}
                                        wrap={htmlWrap}
                                        text={content}
                                        metricsKey={`html-split-${zoom}-${content.length}-${htmlWrap}`}
                                        fillBg={srcCodeBg}
                                    >
                                        <SyntaxHighlighter
                                            language="markup"
                                            style={srcRsStyle}
                                            wrapLongLines={htmlWrap}
                                            customStyle={{
                                                margin: 0, background: srcCodeBg,
                                                fontSize: `${13 * zoom}px`,
                                                padding: "0.75rem 0.75rem",
                                                fontFamily: "var(--font-jb-mono), monospace",
                                            }}
                                            codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                                        >{content}</SyntaxHighlighter>
                                    </CodeViewSurface>
                                )}
                            </div>
                            <iframe
                                srcDoc={content}
                                title={fileName}
                                sandbox="allow-same-origin"
                                className="w-full h-full min-h-[400px] bg-white"
                                style={{border: 0}}
                            />
                        </div>
                    );
                }
                return (
                    <iframe
                        srcDoc={content}
                        title={fileName}
                        sandbox="allow-same-origin"
                        className="w-full h-full min-h-[400px] bg-white"
                        style={{border: 0}}
                    />
                );
            }
            /*.sql files get the graphical schema view —
CREATE TABLE / FOREIGN KEY statements
parsed client-side into the same ER diagram the SQLite
workbench renders (zoom +.svg export), with the highlighted
DDL one tab away. Files without any CREATE TABLE keep the
plain highlighted view. */
            if (fileKind === "sql" && sqlSchema && sqlSchema.tables.length > 0) {
                return <SqlSchemaView schema={sqlSchema} rawView={spellMarkedView ?? rawText} fileName={fileName}
                                      fontScale={zoom}/>;
            }
            return spellMarkedView ?? rawText;
        }


        // CSV / TSV — (rich preview). The old viewer split rows
        // on a bare comma (no quoted-field handling, no sorting, no
        // pagination, everything crammed into one endless <table>). Now
        // the SAME sortable + paginated table the DataFileBrowser uses
        // renders it: proper quoted-CSV parsing, sticky header, "View
        // raw" fallback, page-size 50. The content is already fetched
        // client-side, so the preview appears with zero extra latency —
        // no Python spawn, unlike .xlsx/.parquet.
        if (fileKind === "csv") {
            // the editable GRID — full spreadsheet editing
            // (type in cells, add/remove rows & columns, undo) with text
            // saves through the normal file-write path.
            if (gridEdit && onSaveEdit && !locked) {
                return (
                    <CsvGridEditor
                        text={content}
                        fileName={fileName}
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        onSaveText={(next) => {
                            setSaving(true);
                            onSaveEdit(next, {folderSlug, fileSlug})
                                .then(() => setContent(next))
                                .catch(() => undefined)
                                .finally(() => setSaving(false));
                        }}
                        fontScale={zoom}
                    />
                );
            }
            return (
                <div className="p-4">
                    <CsvTableView text={content} truncated={contentTruncated} fontScale={zoom}/>
                </div>
            );
        }

        // Spreadsheet (.xlsx /.xls /.parquet /.feather) —
        // (unsupported-file-type fix). The browser cannot parse these
        // natively, so the table is read server-side by /api/data-sheet
        // (fixed pandas reader) through the SAME SheetDataView the
        // DataFileBrowser uses — sortable columns, pagination and, for
        // workbooks, a sheet-tab selector. `fileSlug` addresses NESTED
        // spreadsheets too (the slug encodes the relative path).
        if (fileKind === "spreadsheet") {
            // grid edit for binary spreadsheets too — the
            // sheet is read once via /api/data-sheet when the mode opens,
            // edited in the browser, and saved through /api/data-sheet-write
            // (pandas; a pre-save local-history snapshot is taken there).
            if (gridEdit && !locked) {
                if (sheetForGridError) {
                    return (
                        <div className="p-6 text-xs text-destructive space-y-2">
                            <p>Could not load the sheet for editing: {sheetForGridError}</p>
                            {sheetMissingPkg && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* installs into the CONFIGURED env, then re-runs the
                      grid-edit fetch above (the error state is cleared so
                      the effect re-fires — the view refreshes itself). */}
                                    <PipInstallButton
                                        module={sheetMissingPkg}
                                        label={`Install ${sheetMissingPkg} & retry`}
                                        onInstalled={() => {
                                            setSheetForGridError(null);
                                            setSheetMissingPkg(null);
                                            setSheetRetryNonce((n) => n + 1);
                                        }}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                            setSheetForGridError(null);
                                            setSheetMissingPkg(null);
                                            setSheetRetryNonce((n) => n + 1);
                                        }}
                                        title="Re-read the sheet right now — the grid shows its loading line while it re-reads"
                                    >
                                        Retry
                                    </Button>
                                </div>
                            )}
                            <Button variant="outline" size="sm" className="h-7 text-xs"
                                    onClick={() => setGridEdit(false)}>
                                Back To The Table View
                            </Button>
                        </div>
                    );
                }
                if (sheetForGrid) {
                    // The sheet is KEPT after save (the grid keeps showing the
                    // data — onSaved used to null it, which recomputed the
                    // editor's `initial` from an undefined sheet and WIPED the
                    // grid to empty right after a successful save). The sheet
                    // resets on file change as always.
                    return (
                        <CsvGridEditor
                            sheet={sheetForGrid}
                            fileName={fileName}
                            folderSlug={folderSlug}
                            fileSlug={fileSlug}
                            fontScale={zoom}
                        />
                    );
                }
                return (
                    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin"/> Reading {fileName} for editing…
                    </div>
                );
            }
            return (
                <div className="p-4 space-y-3">
                    {/* DuckDB auto-offer — analytical files (parquet / feather)
              get a one-click jump into the SQL workbench, where full
              SQL (window functions, joins) runs straight over the
              file. */}
                    {/\.(parquet|feather)$/i.test(fileName) && (
                        <div
                            className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                            <Database className="size-3.5 shrink-0 text-emerald-500"/>
                            <span className="flex-1 text-muted-foreground">
                Analytical file — query it with full SQL (joins, window functions) in the DuckDB workbench.
              </span>
                            <Button
                                size="sm"
                                className="h-7 gap-1.5 text-xs shrink-0"
                                onClick={() => {
                                    window.dispatchEvent(
                                        new CustomEvent("praxis:open-duckdb", {
                                            detail: {fileSlug, fileName},
                                        })
                                    );
                                }}
                                title="Open this file in the DuckDB workbench — SQL over parquet/csv/feather with a result grid and export"
                            >
                                <Database className="size-3.5"/> DuckDB Workbench
                            </Button>
                        </div>
                    )}
                    <SheetDataView
                        folderSlug={folderSlug}
                        name={fileName}
                        fileSlug={fileSlug || undefined}
                        title={fileName}
                        fontScale={zoom}
                    />
                </div>
            );
        }

        // Image — skeleton until the <img> bitmap is DECODED (the
        // toolbox gates onLoaded on the img.decode() promise, not just
        // onLoad — the click-time prefetch warms the HTTP cache, so this
        // is usually instant on re-opens). the ImageToolbox adds
        // cursor-anchored wheel zoom / pan / rotate, the pixel probe,
        // compare (side-by-side + blink) and crop-to-PNG around the same
        // image. A load failure surfaces as an error card (onError),
        // never an eternal skeleton.
        if (fileKind === "image") {
            return (
                <MediaStage
                    kind="image"
                    fileName={fileName}
                    ready={mediaLoaded}
                    error={mediaError}
                    onMediaError={setMediaError}
                    skeleton={<Skel className="h-64 w-full max-w-lg rounded-lg"/>}
                >
                    <ImageToolbox
                        src={fileUrl}
                        fileName={fileName}
                        siblings={siblingImages ?? []}
                        onLoaded={() => revealSurface(() => setMediaLoaded(true))}
                        onError={() =>
                            setMediaError(`Could not load ${fileName} — the browser could not fetch or decode the image (missing file or unsupported format).`)
                        }
                        controlledZoom={zoom}
                        onZoomChange={(z) => applyZoom(z)}
                    />
                </MediaStage>
            );
        }

        // Video — skeleton until the first frame decodes.
        // MediaTools adds playback speed, frame stepping, grab-frame → PNG
        // and the trim/export dialog (ffmpeg, best-effort).
        if (fileKind === "video") {
            return (
                <MediaStage
                    kind="video"
                    fileName={fileName}
                    ready={mediaLoaded}
                    error={mediaError}
                    onMediaError={setMediaError}
                    skeleton={
                        <div className="relative w-full max-w-2xl aspect-video overflow-hidden rounded-lg bg-muted/90">
                            <Skel className="absolute inset-0"/>
                            <div className="absolute inset-x-3 bottom-3 space-y-1.5">
                                <Skel className="h-1.5 w-full rounded-full"/>
                                <div className="flex items-center gap-2">
                                    <Skel className="size-2.5 rounded-full"/>
                                    <Skel className="h-2 w-16"/>
                                    <Skel className="ml-auto h-2 w-10"/>
                                </div>
                            </div>
                        </div>
                    }
                >
                    <MediaTools
                        src={fileUrl}
                        fileName={fileName}
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        onLoaded={() => revealSurface(() => setMediaLoaded(true))}
                        onError={() =>
                            setMediaError(`Could not load ${fileName} — the browser could not fetch or decode the video (missing file or unsupported codec).`)
                        }
                    />
                </MediaStage>
            );
        }

        // Audio — skeleton bars until playback is possible.
        // the audio player is its own component (audio-tools.tsx) — the
        // waveform-centric transport with the A–B loop, level meter and
        // decoded channel/sample-rate footer, split from the video tools.
        // Load failures reach the MediaStage error card through the
        // CAPTURE-phase error listener (audio-tools is shared and reports
        // no onError prop; media error events traverse ancestors on the
        // capture path even though they never bubble).
        if (fileKind === "audio") {
            return (
                <MediaStage
                    kind="audio"
                    fileName={fileName}
                    ready={mediaLoaded}
                    error={mediaError}
                    onMediaError={setMediaError}
                    skeleton={
                        <div className="w-full max-w-md px-4">
                            <div className="flex items-end justify-center gap-1 h-20">
                                {Array.from({length: 24}).map((_, i) => (
                                    <Skel
                                        key={i}
                                        className="flex-1"
                                        style={{height: `${20 + ((i * 29) % 60)}%`, animationDelay: `${i * 45}ms`}}
                                    />
                                ))}
                            </div>
                        </div>
                    }
                >
                    <AudioTools
                        src={fileUrl}
                        fileName={fileName}
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        onLoaded={() => revealSurface(() => setMediaLoaded(true))}
                    />
                </MediaStage>
            );
        }

        // PDF — document-page skeleton until the iframe loads.
        //: the PdfTools wrapper adds the thumbnail sidebar + jump,
        // in-document text search, extract-to-clipboard and rotate-view
        // (capabilities probed per machine — poppler, best-effort).
        // (An iframe fires onLoad even for an error response, so the
        // reveal can never hang on a broken PDF.)
        if (fileKind === "pdf") {
            return (
                <MediaStage
                    kind="pdf"
                    fileName={fileName}
                    ready={mediaLoaded}
                    error={mediaError}
                    onMediaError={setMediaError}
                    skeleton={
                        <div className="w-full max-w-2xl rounded-md border bg-background p-6 space-y-2 shadow-sm">
                            <Skel className="h-5 w-1/2 mb-4"/>
                            {Array.from({length: 9}).map((_, i) => (
                                <Skel key={i} className="h-3"
                                      style={{width: `${58 + ((i * 41) % 36)}%`, animationDelay: `${i * 55}ms`}}/>
                            ))}
                        </div>
                    }
                >
                    <PdfTools
                        src={fileUrl}
                        fileName={fileName}
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        onLoaded={() => revealSurface(() => setMediaLoaded(true))}
                    />
                </MediaStage>
            );
        }

        // ipynb — the EDITABLE notebook view. Per-cell
        // edit (inline textarea), per-cell Run (isolated /api/run with the
        // cell's source — the file on disk is untouched), whole-notebook
        // Save through the normal file-save flow. Falls back to raw JSON
        // when the document doesn't parse.
        if (fileKind === "ipynb") {
            try {
                JSON.parse(content);
                return (
                    <NotebookView
                        content={content}
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        onSaveEdit={onSaveEdit}
                        // the notebook reports its own dirty
                        // state upward — per-cell edits used to never reach the
                        // tab/tree switch guard (the “Unsaved changes” popup never
                        // fired for .ipynb).
                        onDirtyChange={setNbDirty}
                    />
                );
            } catch {
                return (
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{content}</pre>
                );
            }
        }

        // ── .http / .rest — the REST API client workbench ──────────────
        // A Postman-style request builder over the file's requests:
        // method/URL/headers/body editor, {{variable}} environments, a
        // response pane with status/time/size + JSON inspector, history
        // and collections. Edits serialize back to the .http source.
        if (fileKind === "http" || /\.(http|rest)$/i.test(fileName)) {
            return (
                <div className="flex flex-col h-full min-h-0">
                    <ApiClientWorkbench
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        fileName={fileName}
                        content={content}
                        onSaved={(next) => {
                            void (async () => {
                                try {
                                    if (onSaveEdit) {
                                        await onSaveEdit(next, {folderSlug, fileSlug});
                                    } else {
                                        await fetch("/api/file-write", {
                                            method: "POST",
                                            headers: {"Content-Type": "application/json"},
                                            body: JSON.stringify({folder: folderSlug, fileName, content: next}),
                                        });
                                    }
                                    setContent(next);
                                    toast({title: "Saved", description: `${fileName} updated.`, variant: "success"});
                                } catch (err) {
                                    toast({
                                        title: "Save failed",
                                        description: (err as Error).message,
                                        variant: "destructive"
                                    });
                                }
                            })();
                        }}
                    />
                </div>
            );
        }

        // sqlite —.db/.sqlite files open a schema overview card
        // (table cards, row counts, PK/FK markers) with a one-click jump
        // into the SQL workbench (schema diagram + read-only queries).
        // Replaces the old "Unsupported file type" card for databases.
        if (fileKind === "sqlite") {
            return (
                <DbFileViewer
                    folderSlug={folderSlug}
                    fileSlug={fileSlug}
                    fileName={fileName}
                    onOpenWorkbench={onOpenWorkbench ?? undefined}
                    fontScale={zoom}
                />
            );
        }

        // Compressed archives — .zip / .tar / .tar.gz / .tgz / .gz / .rar /
        // .7z get a real viewer card (entry listing + extract options /
        // decompress). The branch mounts ArchiveTools IMMEDIATELY behind a
        // full-cover archive-shaped skeleton overlay (MediaStage) — the
        // lazy chunk download AND the /api/archive listing fetch run
        // behind it — and the overlay clears only when the component
        // reports ready (the listing array parsed, an error, or its
        // unsupported / decompress card). Before this, the generic gate
        // cleared contentLoading on a fixed timer: the skeleton vanished
        // while the chunk was still streaming and the pane went blank
        // (the "no skeleton for archives" report), and nothing verified
        // the listing before revealing.
        if (isArchiveFileName(fileName)) {
            return (
                <MediaStage
                    kind="archive"
                    fileName={fileName}
                    ready={archiveReady}
                    skeleton={<ArchiveListingSkeleton/>}
                >
                    <ArchiveTools
                        fileName={fileName}
                        folderSlug={folderSlug}
                        fileSlug={fileSlug}
                        onReady={revealArchive}
                    />
                </MediaStage>
            );
        }

        // ── Binary / unknown — the HEX EDITOR ─────────────────────────
        // .bin / .dat / .dll / .exe and every other unknown kind open in
        // the binary inspector (hex + ASCII columns, offset navigation,
        // search, guarded in-place byte editing) instead of the old raw
        // "Unsupported file type" card. The download affordance moves
        // into the toolbar (it was always there too).
        return (
            <div className="flex flex-col h-full min-h-0">
                <HexEditor
                    folderSlug={folderSlug}
                    fileSlug={fileSlug}
                    fileName={fileName}
                />
            </div>
        );
    };

    // Fetch the sheet data when grid edit opens on a binary spreadsheet.
    // `sheetRetryNonce` — bumped by the card's Install-&-retry / Retry
    // buttons (clearing the error state re-runs this effect, and the
    // nonce rides the URL as a cache-buster so the re-read never gets
    // the STALE "missing package" response from the browser HTTP cache;
    // the NEXT missing package is reported in place, no page refresh).
    const [sheetRetryNonce, setSheetRetryNonce] = React.useState(0);
    React.useEffect(() => {
        if (!gridEdit || fileKind !== "spreadsheet" || sheetForGrid || sheetForGridError) return;
        let cancelled = false;
        void (async () => {
            try {
                const url = `/api/data-sheet?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}${interpreterQuery()}&_r=${sheetRetryNonce}`;
                const res = await fetch(url, {cache: "no-store"});
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json.ok) {
                    setSheetForGridError(json.error ?? `HTTP ${res.status}`);
                    setSheetMissingPkg(
                        typeof json.missing === "string"
                            ? json.missing
                            : /missing the "([A-Za-z0-9_.-]+)" package/.exec(String(json.error ?? ""))?.[1] ?? null
                    );
                } else {
                    // Keep the FULL workbook shape (totalRows/totalCols/sheets) —
                    // the grid editor needs it to refuse a save that would
                    // replace a bigger workbook / multi-sheet file with the
                    // truncated preview grid.
                    setSheetForGrid({
                        columns: json.columns ?? [],
                        rows: json.rows ?? [],
                        totalRows: typeof json.totalRows === "number" ? json.totalRows : undefined,
                        totalCols: typeof json.totalCols === "number" ? json.totalCols : undefined,
                        sheets: Array.isArray(json.sheets) ? json.sheets : undefined,
                        sheet: typeof json.sheet === "string" ? json.sheet : undefined,
                    });
                    setSheetMissingPkg(null);
                }
            } catch (err) {
                if (!cancelled) setSheetForGridError((err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [gridEdit, fileKind, folderSlug, fileSlug, sheetForGrid, sheetForGridError, sheetRetryNonce]);

    // Edit button only shown for editable kinds (html too —
    // its view mode is the sandboxed iframe preview).
    // this second list had drifted from the render-path
    // list above — ruby / php / go and ALL SIX
    // registry languages were missing, so those files VIEWED fine but
    // never offered the Edit button. Both lists now match exactly.
    const editableKind = EDITABLE_TEXT_KINDS.includes(fileKind);

    // ─── toolbar actions ────────────────────────────────────
    /** Per-kind zoom cluster (persisted per FileKind — “CSV at 13px,
     * markdown at 16px — remembered”). RESTYLED into the SAME bordered
     * segmented control the Python editor's zoom uses —
     * − / level / + in one rounded-md border group.
     *
     * MEDIA KINDS (image / video / audio / pdf / unknown binaries) hide
     * the cluster entirely — their surfaces carry their own zoom / fit
     * controls (the image toolbox, the pdf viewer), so a dead font-zoom
     * control that never changed anything is gone. */
    const zoomableKind =
        fileKind !== "image" &&
        fileKind !== "video" &&
        fileKind !== "audio" &&
        fileKind !== "pdf" &&
        fileKind !== "other";
    const zoomActions = zoomableKind ? (
        <div className="flex items-center rounded-md border overflow-hidden h-8 shrink-0" role="group"
             aria-label="Viewer zoom">
            <button
                type="button"
                onClick={() => applyZoom(Math.max(0.6, Math.round((zoom / 1.15) * 100) / 100))}
                className="flex items-center justify-center w-8 h-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Zoom out (min 60%) — scales this file kind's view and edit modes alike"
                aria-label="Zoom out"
            >
                <ZoomOut className="size-3.5"/>
            </button>
            <span className="text-[10px] font-mono w-10 text-center text-muted-foreground tabular-nums select-none"
                  title="Zoom level for this file kind (persisted per kind)">
        {Math.round(zoom * 100)}%
      </span>
            <button
                type="button"
                onClick={() => applyZoom(Math.min(2.5, Math.round((zoom * 1.15) * 100) / 100))}
                className="flex items-center justify-center w-8 h-full border-l text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Zoom in (max 250%) — scales this file kind's view and edit modes alike"
                aria-label="Zoom in"
            >
                <ZoomIn className="size-3.5"/>
            </button>
        </div>
    ) : null;

    /** The lock chip replaces every editing affordance when the file is
     *  locked read-only (explorer “Lock read-only”). */
    /** The open file's FORMATTABLE-KIND entry — drives the view-mode
     *  right-click "Formatting ▸" submenu (auto-hides when the kind has
     *  no formatter — no empty submenus) and the edit-mode gate. */
    const fmtKindEntry = formattableKindFor(fileKind);
    const lockChip = locked ? (
        <span
            className="inline-flex items-center gap-1 h-8 px-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs"
            title="This file is locked read-only — unlock it from the explorer's right-click menu"
        >
      <Lock className="size-3.5"/> Locked
    </span>
    ) : null;

    /** Database files get a direct SQL
     *  workbench button (kind "sqlite", or legacy "other" .db regex). */
    const dbActions =
        (fileKind === "sqlite" || (fileKind === "other" && /\.(db|sqlite3?|db3)$/i.test(fileName))) && onOpenWorkbench ? (
            <Button variant="ghost" size="sm" onClick={onOpenWorkbench} className="h-8 gap-1.5 text-xs"
                    title="Open the SQLite SQL workbench (read-only queries, schema tree, saved queries)">
                <Braces className="size-3.5"/><span className="hidden sm:inline">SQL Workbench</span>
            </Button>
        ) : null;

    /* the CONSOLIDATED HTML toolbar — every HTML option
   * in ONE cluster (mode: Preview | Split | Source; word-wrap; and
   * in edit mode a beautify). Works in BOTH read and edit mode; the
   * mode drives the render branches above. Download stays in the
   * shared header (every kind has it). */
    const htmlActions = fileKind === "html" ? (
        <React.Fragment>
      <span className="hidden md:inline-flex items-center rounded-md border bg-muted/40 text-[10px] leading-none"
            role="group" aria-label="HTML view mode">
        {([
            ["preview", "Preview", Eye, "The rendered page in a sandboxed iframe"],
            ["split", "Split", Columns2, "Source beside the live preview"],
            ["source", "Source", Code2, "Syntax-highlighted markup (view-source)"],
        ] as const).map(([mode, label, Icon, title]) => (
            <button
                key={mode}
                type="button"
                onClick={() => setHtmlLayout(mode)}
                title={title}
                aria-pressed={htmlLayout === mode}
                className={cn(
                    "inline-flex items-center gap-1 px-2 h-8 text-xs first:rounded-l-md last:rounded-r-md",
                    htmlLayout === mode
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                )}
            >
                <Icon className="size-3.5"/>
                <span className="hidden lg:inline">{label}</span>
            </button>
        ))}
      </span>
            <Button
                variant={htmlWrap ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setHtmlWrap((v) => !v)}
                title="Wrap long source lines (no horizontal scrolling)"
                aria-label="Toggle word wrap"
            >
                <WrapText className="size-3.5"/>
            </Button>
            {editMode && !locked && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => {
                        // Snapshot the pre-format buffer so Ctrl+Z pops back to it
                        // (a programmatic value write kills the native undo stack).
                        const out = formatAnySource("html", "format", editContent, loadSettings());
                        if (out !== editContent) {
                            pushFmtUndo();
                            handleEditChange(out);
                        }
                    }}
                    title="Beautify the markup — one line per block element, inline content merged, script/pre contents untouched (Ctrl+Z undoes)"
                >
                    <Wand2 className="size-3.5 text-emerald-500"/>
                    <span className="hidden sm:inline">Format</span>
                </Button>
            )}
        </React.Fragment>
    ) : null;

    /** Data-file actions: chart preview + transform pipeline (CSV/TSV
     *  text tables) and the editable-grid toggle (csv + spreadsheets). */
    const dataActions = (
        <React.Fragment>
            {fileKind === "csv" && onOpenChart && (
                <Button variant="ghost" size="sm" onClick={onOpenChart} className="h-8 gap-1.5 text-xs"
                        title="Chart preview — pick X/Y columns, get an instant chart + a matplotlib snippet">
                    <BarChart3 className="size-3.5"/><span className="hidden sm:inline">Chart</span>
                </Button>
            )}
            {fileKind === "csv" && onOpenTransform && (
                <Button variant="ghost" size="sm" onClick={onOpenTransform} className="h-8 gap-1.5 text-xs"
                        title="Transform pipeline — chain filter / sort / group / pivot / join steps with a live preview">
                    <Workflow className="size-3.5"/><span className="hidden sm:inline">Transform</span>
                </Button>
            )}
            {(fileKind === "csv" || fileKind === "spreadsheet") && onSaveEdit && !locked && (
                <Button
                    variant={gridEdit ? "default" : "ghost"}
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => {
                        if (!gridEdit && fileKind === "spreadsheet") {
                            setSheetForGrid(null);
                            setSheetForGridError(null);
                        }
                        setGridEdit((g) => !g);
                    }}
                    title="Edit as a grid — type in cells, add/remove rows & columns, undo, save back"
                >
                    <Table2 className="size-3.5"/><span
                    className="hidden sm:inline">{gridEdit ? "Table view" : "Edit grid"}</span>
                </Button>
            )}
        </React.Fragment>
    );

    /** Config validation (yaml / toml / ini). */
    const validateAction = canValidateKind(fileKind, fileName) ? (
        <Button variant="ghost" size="sm" onClick={() => void runValidation()} disabled={validation?.busy}
                className="h-8 gap-1.5 text-xs"
                title="Validate this file with the real parser (PyYAML / tomllib / configparser) — issues jump to their line">
            {validation?.busy ? <Loader2 className="size-3.5 animate-spin"/> : <ShieldCheck className="size-3.5"/>}
            <span className="hidden sm:inline">Validate</span>
        </Button>
    ) : null;

    /** MARKDOWN VIEW-SIDE sub-mode toggle — Preview (rendered) |
     *  Source (highlighted raw, read-only). The Edit side (the studio)
     *  is reached through the file-level View | Edit control like every
     *  other kind. The body remounts per mode (the keyed fragment in
     *  the final return) so no layout transition artifacts survive a
     *  switch. */
    const mdBodyScrollRef = React.useRef<HTMLDivElement | null>(null);
    const mdModeButton = (mode: "preview" | "source", icon: React.ReactNode, label: string, title: string) => (
        <button
            type="button"
            onClick={() => {
                setMdViewMode(mode);
                requestAnimationFrame(() => {
                    mdBodyScrollRef.current?.scrollTo({top: 0});
                });
            }}
            title={title}
            aria-pressed={mdViewMode === mode}
            className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors",
                mdViewMode === mode
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
        >
            {icon} {label}
        </button>
    );
    const mdModeActions =
        fileKind === "markdown" && !editMode ? (
            <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5" role="group"
                 aria-label="Markdown view mode">
                {mdModeButton("preview", <Eye
                    className="size-3.5"/>, "Preview", "Rendered view — prose, front-matter card, highlighted code fences, mermaid diagrams")}
                {mdModeButton("source", <Code2
                    className="size-3.5"/>, "Source", "Syntax-highlighted Markdown source (read-only) — Edit opens the studio")}
            </div>
        ) : null;

    /* ── the Tools ▸ menu for MEDIA files ──────────────────
The Developer-toolbox suites (20-30 image
tools, the video suite, the PDF suite) are LINKED when the
file is open in the view/edit UIs. Every applicable tool is one
click away and OPENS WITH THIS FILE PRELOADED (the
praxis:open-toolbox event + the toolbox preload context). */
    const openToolboxTool = React.useCallback(
        (toolId: string) => {
            if (!fileUrl) return;
            window.dispatchEvent(
                new CustomEvent("praxis:open-toolbox", {
                    detail: {toolId, url: fileUrl, fileName, fileSlug, folderSlug},
                })
            );
        },
        [fileUrl, fileName, fileSlug, folderSlug]
    );
    const toolMenuFor = (category: string, subtitle?: string) => (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 cursor-pointer"
                                    title={subtitle ?? `Every ${category} tool — the file you have open is preloaded automatically`}>
                <Wand2 className="size-3.5 text-emerald-500 shrink-0"/>
                <span className="flex-1">{category}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
          {toolboxToolsForCategory(category).length}
        </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[60vh] overflow-y-auto w-56">
                {toolboxToolsForCategory(category).map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => openToolboxTool(t.id)} className="gap-2 cursor-pointer"
                                      title={`Open "${t.label}" with ${fileName} preloaded`}>
                        <Wand2 className="size-3 shrink-0 text-muted-foreground"/>
                        <span className="flex-1">{t.label}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
    const mediaToolCategories: string[] =
        fileKind === "image"
            ? ["Image Studio", "Image → Text"]
            : fileKind === "video"
                ? ["Video Studio"]
                : fileKind === "audio"
                    ? ["Audio Studio"]
                    : fileKind === "pdf"
                        ? ["PDF Studio"]
                        : [];
    /* audio files link to the dedicated Audio studio
     (its own toolbox category — trim / fade / gain / normalize /
     speed / WAV convert / waveform PNG / metadata / data URL), no
     longer to a whitelisted subset of the Video studio. */
    const mediaToolActions =
        mediaToolCategories.length > 0 && fileUrl ? (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        title="Open the Developer-toolbox tools for this file — the current file is preloaded automatically"
                    >
                        <Wand2 className="size-3.5 text-emerald-500"/>
                        <span className="hidden sm:inline">Tools</span>
                        <ChevronDown className="size-3"/>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                        {fileKind === "image" ? "Image Tools" : fileKind === "video" ? "Video Tools" : fileKind === "audio" ? "Audio Tools" : "PDF Tools"} — {fileName}
                    </DropdownMenuLabel>
                    {mediaToolCategories.map((cat) => toolMenuFor(cat))}
                    <DropdownMenuSeparator/>
                    <DropdownMenuItem
                        onClick={() => {
                            const firstCat = mediaToolCategories[0];
                            const first = toolboxToolsForCategory(firstCat)[0];
                            if (first) openToolboxTool(first.id);
                        }}
                        className="gap-2 cursor-pointer"
                        title="Open the Developer Toolbox dialog (all 80+ offline tools)"
                    >
                        <Wand2 className="size-3.5 text-emerald-500"/>
                        <span className="flex-1">Open Full Developer Toolbox…</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ) : null;

    /** The save-status badge — a SOLID, fully opaque chip (no /alpha
     *  tints, no backdrop reliance) so it reads clearly on every theme.
     *  Shared by the edit-mode header cluster and the Markdown studio
     *  header cluster (it used to live in a translucent bottom bar that
     *  read as washed-out). */
    const editStatusChip = (
        <span
            role="status"
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                saveStatus === "saving"
                    ? "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-sky-950"
                    : saveStatus === "saved"
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
                        : "border-amber-600 bg-amber-500 text-amber-950 dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950 shadow-sm"
            )}
            title={
                saveStatus === "idle" || saveStatus === undefined
                    ? "The buffer has changes that are NOT on disk yet — Save (⌘S / Ctrl+S) or the Save button writes it"
                    : undefined
            }
        >
      <span
          aria-hidden
          className={cn(
              "size-1.5 rounded-full",
              saveStatus === "saving"
                  ? "bg-white/90 animate-pulse"
                  : saveStatus === "saved"
                      ? "bg-white/90"
                      : "bg-amber-950 dark:bg-amber-950"
          )}
      />
            {saveStatus === "saving"
                ? "Saving to disk…"
                : saveStatus === "saved"
                    ? "Saved to disk"
                    : "Unsaved edits"}
    </span>
    );

    /** Edit-mode header cluster: Insert ▾ + the status badge + Cancel +
     *  Save — the SAME controls that used to sit in the sticky bottom
     *  bar, now in the top toolbar next to the View/Edit toggle like
     *  the Python editor's Save/Cancel. */
    const editSaveActions = editableKind && editMode && onSaveEdit && !locked ? (
        <React.Fragment>
            {insertBlocks.length > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            title="Insert a block at the cursor — heading, table, code fence, ignore preset… (also on right-click)"
                        >
                            <SquarePlus className="size-3.5 text-emerald-500"/>
                            <span className="hidden sm:inline">Insert</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 max-h-[420px] overflow-y-auto">
                        {blockCategories(insertBlocks).map((cat) => (
                            <React.Fragment key={cat}>
                                <DropdownMenuLabel
                                    className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {cat}
                                </DropdownMenuLabel>
                                {insertBlocks
                                    .filter((b) => b.category === cat)
                                    .map((b) => (
                                        <DropdownMenuItem
                                            key={b.id}
                                            onClick={() => insertBlockAtCaret(b.template)}
                                            className="gap-2 cursor-pointer"
                                            title={b.description}
                                        >
                                            <span className="flex-1 truncate">{b.label}</span>
                                        </DropdownMenuItem>
                                    ))}
                            </React.Fragment>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {editStatusChip}
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving} className="h-8 gap-1.5 text-xs"
                    title="Discard edits and return to read-only view">
                <X className="size-3.5"/><span>Cancel</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving}
                    className="h-8 gap-1.5 text-xs text-emerald-600" title="Save the edited file to disk (⌘S / Ctrl+S)">
                {saving ? <Loader2 className="size-3.5 animate-spin"/> :
                    <Save className="size-3.5"/>}<span>{saving ? "Saving…" : "Save"}</span>
            </Button>
        </React.Fragment>
    ) : null;

    /* ── the RUN affordance inside the viewer header ──────
The Run control used to exist only in the TOP toolbar; a.java /.R /.m /.js file opened in the FileViewer with no visible run
button anywhere near it (the “why is the run button hidden
from java, r, m, etc. files?”). The header now carries its own
Run button for every runnable kind, plus a RUNTIME STATUS chip:
green = the interpreter was detected (tooltip: its version),
amber = NOT installed (tooltip: the install hint — “ensure
MATLAB / R is installed in the OS first and tell the user”). */
    const headerRunLanguage = runLanguageForKind(fileKind);
    const headerRunChip =
        headerRunLanguage && headerRunLanguage !== "python" && runStatus ? (
            <span
                className={cn(
                    "h-8 inline-flex items-center gap-1.5 rounded-md border px-2 text-[10px] font-medium",
                    runStatus.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                )}
                title={
                    runStatus.ok
                        ? `${runStatus.label} detected${runStatus.version ? ` — ${runStatus.version}` : ""}`
                        : runStatus.installHint || `${runStatus.label} is not installed`
                }
            >
        {runStatus.ok ? (
            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true"/>
        ) : (
            <CircleAlert className="size-3 shrink-0" aria-hidden="true"/>
        )}
                <span className="hidden sm:inline max-w-[130px] truncate">
          {runStatus.ok ? runStatus.label : "not installed"}
        </span>
      </span>
        ) : null;
    const headerRunActions =
        headerRunLanguage && onRun ? (
            <React.Fragment>
                <Button
                    variant="default"
                    size="sm"
                    onClick={onRun}
                    className="h-8 gap-1.5 text-xs font-medium"
                    title={`Run this ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage} file — the output streams into the Output panel below`}
                >
                    <Play className="size-3.5"/>
                    <span className="hidden sm:inline">Run</span>
                </Button>
                {headerRunChip}
            </React.Fragment>
        ) : null;

    /* ─── UNION BAR (the Python bar's design, mirrored here) ─────
  * "unify the following bar for other languages": [stats chip —
  * N Ln + the misspelled count] / File ▾ / AI ▾ / the code-theme
  * picker / Find — then the segmented View|Edit control and the
  * per-kind zoom close the row in the SAME order the Python bar
  * ends: [stats · File AI theme Find View|Edit zoom]. The union is
  * identical across every runnable thing (c / .m / java / js / r …)
  * — one bar design everywhere. Symbols stays Python-only for now —
  * no per-language outline parser exists here yet ("remove only the
  * options that are not allowed/fitting"). */
    const [unionCopied, setUnionCopied] = React.useState(false);
    const unionSource = React.useMemo(() => (editMode ? editContent : content) || "", [editMode, editContent, content]);
    /* ── the unified STATS chip — the Python bar's "N Ln · M
* misspelled words" counts mirrored 1:1 for every runnable /
* editable kind. It REPLACES the old
* standalone spellChip; the tooltip keeps the full spell-check
* listing (hover positions / ignore hints). */
    const unionLineCount = React.useMemo(
        () => (unionSource ? unionSource.split("\n").length : 0),
        [unionSource]
    );
    const unionSpellActive = spellEnabled && spellCheckable && (spellChecking || spellIssues.length > 0);
    const unionStatsChip = editableKind ? (
        <span
            className="flex items-center gap-1.5 h-7 px-2 rounded-md border bg-background/60 text-[10px] text-muted-foreground shrink-0 tabular-nums"
            title={
                `${unionLineCount.toLocaleString()} lines` +
                (spellEnabled && spellCheckable
                    ? spellChecking
                        ? " · spell check running…"
                        : ` · ${spellIssues.length} misspelled word${spellIssues.length === 1 ? "" : "s"}`
                    : "")
            }
        >
      <span>{unionLineCount.toLocaleString()} Ln</span>
            {unionSpellActive && (
                <span
                    className="flex items-center gap-0.5 rounded px-1 tabular-nums"
                    title={
                        spellChecking
                            ? "Spell check running…"
                            : `Spell check: ${spellIssues.length} misspelled word${spellIssues.length === 1 ? "" : "s"}.\nClick a wavy-underlined word in the text to add it to the project dictionary.\n\n${spellIssues
                                .slice(0, 12)
                                .map((i) => `L${i.line}:C${i.col}  ${i.word}`)
                                .join("\n")}${spellIssues.length > 12 ? `\n… +${spellIssues.length - 12} more` : ""}`
                    }
                >
          <span className="size-1.5 rounded-full bg-red-500"/>
                    {spellChecking ? "…" : spellIssues.length}
                    <span className="sr-only">misspelled words</span>
        </span>
            )}
    </span>
    ) : null;
    const handleUnionDownload = React.useCallback(() => {
        try {
            // IN VIEW MODE download the REAL file from the server — the
            // client `content` state is capped at 1 MB + "…(truncated)", so
            // building the blob from it shipped a truncated file for any
            // large text file. EDIT mode still exports the live (possibly
            // unsaved) textarea buffer, which is the whole point there.
            if (!editMode && folderSlug && fileSlug) {
                const a = document.createElement("a");
                a.href = fileUrlFor(folderSlug, fileSlug);
                a.download = fileName || "file.txt";
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                const blob = new Blob([unionSource], {type: "text/plain;charset=utf-8"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName || "file.txt";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            }
            toast?.({title: "Download started", description: `${fileName} → your computer`});
        } catch {
            toast?.({title: "Download failed", variant: "destructive"});
        }
    }, [editMode, folderSlug, fileSlug, unionSource, fileName, toast]);
    const handleUnionCopyAll = React.useCallback(async () => {
        try {
            await navigator.clipboard.writeText(unionSource);
            setUnionCopied(true);
            setTimeout(() => setUnionCopied(false), 1600);
        } catch {
            toast?.({title: "Copy failed", variant: "destructive"});
        }
    }, [unionSource, toast]);
    const srcUnionBar = editableKind ? (
        <>
            {/* the stats chip leads the union bar exactly like the Python
          bar's "N Ln · M misspelled" chip (same border/h-7/[10px]
          look, same order). */}
            {unionStatsChip}
            {/* File ▾ — Open Folder (if wired) / Download / Copy All — the
          same trio as the Python bar's File dropdown. */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                            title="File actions — open containing folder, download, copy">
                        <FolderOpen className="size-3.5"/>
                        <span className="hidden sm:inline">File</span>
                        <ChevronDown className="size-3"/>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {onOpenFolder && (
                        <DropdownMenuItem onClick={onOpenFolder} className="gap-2 cursor-pointer"
                                          title="Open the containing folder in your OS file explorer">
                            <FolderOpen className="size-3.5 text-cyan-500"/>
                            <span className="flex-1">Open Folder</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleUnionDownload} className="gap-2 cursor-pointer"
                                      title="Download this file to your computer">
                        <Download className="size-3.5 text-purple-500"/>
                        <span className="flex-1">Download</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleUnionCopyAll} className="gap-2 cursor-pointer"
                                      title="Copy the entire file contents to the clipboard">
                        {unionCopied ? <Check className="size-3.5 text-emerald-500"/> : <Copy className="size-3.5"/>}
                        <span className="flex-1">{unionCopied ? "Copied!" : "Copy All"}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {/* AI ▾ — Explain / Improve, through the same onAiPrompt wiring
          the right-click AI group uses (gated to kinds that can). */}
            {onAiPrompt && aiCodeKind && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                                title="AI actions — explain or improve this file">
                            <Sparkles className="size-3.5 text-emerald-500"/>
                            <span className="hidden sm:inline">AI</span>
                            <ChevronDown className="size-3"/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem
                            onClick={() => onAiPrompt(`Explain what this ${fileKind} file does, step by step:\n\n\`\`\`\n${unionSource.slice(0, 6000)}\n\`\`\``)}
                            className="gap-2 cursor-pointer"
                            title="Ask the integrated AI assistant to explain this file"
                        >
                            <Sparkles className="size-3.5 text-emerald-500"/>
                            <span className="flex-1">Explain</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => onAiPrompt(`Improve this ${fileKind} file — readability, performance, correctness. Return the full improved file plus a short list of the changes:\n\n\`\`\`\n${unionSource.slice(0, 6000)}\n\`\`\``)}
                            className="gap-2 cursor-pointer"
                            title="Ask the integrated AI assistant for an improved version"
                        >
                            <Wand2 className="size-3.5 text-purple-500"/>
                            <span className="flex-1">Improve</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {/* theme — the SHARED 24-theme picker (same praxis.code-theme
          key as the Python bar; a pick restyles both viewers). */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
                            title={`Code theme: ${srcThemeEntry.label} — the same picker the Python bar has (shared praxis.code-theme)`}
                            aria-label="Code theme">
                        <Palette className="size-3.5"/>
                        <span className="hidden sm:inline truncate max-w-[80px]">{srcThemeEntry.label}</span>
                        <ChevronDown className="size-3"/>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
                    <div className="px-3 py-2 border-b text-[10px] uppercase tracking-wide text-muted-foreground">Code
                        theme — shared with the Python editor
                    </div>
                    {CODE_THEMES.map((t) => (
                        <DropdownMenuItem
                            key={t.id}
                            onClick={() => {
                                setSrcThemeId(t.id);
                                saveCodeTheme(t.id);
                                window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
                            }}
                            className="gap-2 cursor-pointer"
                            aria-pressed={srcThemeEntry.id === t.id}
                            title={t.label}
                        >
                            <span className="size-4 rounded-sm border border-foreground/10 shrink-0"
                                  style={{backgroundColor: t.bg}}><span
                                className="block size-1.5 rounded-full mt-0.5 ml-0.5"
                                style={{backgroundColor: t.keyword}}/><span
                                className="block size-1.5 rounded-full ml-0.5" style={{backgroundColor: t.str}}/></span>
                            <span className="flex-1 truncate">{t.label}</span>
                            {srcThemeEntry.id === t.id && <Check className="size-3.5 text-emerald-500"/>}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            {/* Find — opens the in-file Find & Replace bar (the Ctrl+F
          twin; python's bar has the same direct button). */}
            <Button variant="ghost" size="sm" onClick={() => openFindBar()} className="h-8 gap-1.5 text-xs"
                    title="Find in this file (Ctrl+F) — the in-file find bar">
                <Search className="size-3.5"/>
                <span className="hidden sm:inline">Find</span>
            </Button>
        </>
    ) : null;

    const editActions = (
        <React.Fragment>
            {lockChip}
            {dbActions}
            {htmlActions}
            {dataActions}
            {validateAction}
            {mdModeActions}
            {/* the in-viewer Run control + runtime status chip. */}
            {headerRunActions}
            {/* the Tools ▸ menu for image / video / audio / pdf
          files — the toolbox suites linked INTO the view/edit UIs. */}
            {mediaToolActions}
            {/* ── THE UNIFIED BAR: [stats · File AI theme Find] — identical
cluster, identical order to the Python editor's toolbar. The
spellChip folded INTO the stats chip (N Ln · M misspelled),
so it still shows in BOTH modes and for locked files. */}
            {srcUnionBar}
            {/* ── View / Edit segmented control — the SAME design the Python
editor's toolbar uses: both modes
visible, the ACTIVE one highlighted; clicking View while
editing = discard edits → read-only view. */}
            {editableKind && onSaveEdit && !locked ? (
                <div
                    role="group"
                    aria-label="Viewer mode"
                    className="flex items-center rounded-md border overflow-hidden h-8 shrink-0"
                >
                    <button
                        type="button"
                        onClick={() => {
                            if (editMode) cancelEdit();
                        }}
                        disabled={!editMode || saving}
                        aria-pressed={!editMode}
                        title={editMode ? "Discard edits and return to the read-only view" : "Read-only view (renders markdown / syntax-highlighted)"}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 h-full text-xs transition-colors",
                            !editMode
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                    >
                        <BookOpen className="size-3.5"/>
                        <span className="hidden sm:inline">View</span>
                    </button>
                    <button
                        type="button"
                        onClick={startEdit}
                        disabled={editMode || saving}
                        aria-pressed={editMode}
                        title={fileKind === "markdown" ? "Open the Markdown studio — split editor + live preview" : "Switch to edit mode (inline editor for this file type)"}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 h-full text-xs transition-colors border-l",
                            editMode
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                    >
                        <Pencil className="size-3.5"/>
                        <span className="hidden sm:inline">Edit</span>
                    </button>
                </div>
            ) : null}
            {/* zoom — the union bar's closer in the Python editor's exact
          bordered-segment style. */}
            {zoomActions}
            {/* Edit-mode header cluster: Insert + status badge + Cancel +
          Save — AFTER the union bar + zoom exactly where the Python
          editor keeps its Save/Cancel cluster. */}
            {editSaveActions}
        </React.Fragment>
    );

    return (
        <div
            className={cn(
                // the card now FILLS the code pane (flex column +
                // flex-1) and the body wrapper below is the scroll container —
                // previously the card sized to its content inside an
                // overflow-hidden pane, so long non-Python files were CLIPPED
                // with no way to scroll.
                "rounded-xl border overflow-hidden bg-card/60 backdrop-blur-sm shadow-sm flex flex-col flex-1 min-h-0"
            )}
            onKeyDown={(e) => {
                // VIEW-MODE dictionary-add undo — no textarea is focused while
                // reading, so the card root owns Ctrl+Z: one-shot remove of the
                // just-added dictionary word + zigzag restore (mirrors the
                // Python editor's view-mode handler).
                if (
                    !editMode &&
                    (e.ctrlKey || e.metaKey) &&
                    !e.altKey &&
                    !e.shiftKey &&
                    (e.key === "z" || e.key === "Z") &&
                    !(e.target instanceof HTMLTextAreaElement) &&
                    !(e.target instanceof HTMLInputElement)
                ) {
                    if (undoDictionaryAdd()) {
                        e.preventDefault();
                        return;
                    }
                }
            }}
        >
            {renderHeader(editActions)}
            {/* the in-file Find & Replace bar (Navigate > Find... / Ctrl+F).
Plan 3b: Replace field + Aa (case) / |w| (whole word) /.*
(regex) toggles + Replace-next / Replace-ALL with the
confirm-count step. The ORIGINAL keyboard behavior stays:
Enter/Shift+Enter step matches, Escape closes. */}
            {findOpen && (
                <div className="border-b bg-muted/40">
                    <div className="flex items-center gap-1.5 px-3 py-1.5">
                        <Search className="size-3.5 text-muted-foreground shrink-0"/>
                        <input
                            ref={findInputRef}
                            type="text"
                            value={findQuery}
                            onChange={(e) => {
                                setFindQuery(e.target.value);
                                setFindIndex(0);
                                findMatchesRef.current = [];
                                setConfirmReplaceAllCount(null);
                            }}
                            onKeyDown={onFindKeyDown}
                            placeholder={findRegex ? `Find (regex) in ${fileName}…` : `Find in ${fileName}...`}
                            className="flex-1 h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                            aria-label="Find in file"
                        />
                        {/* Aa — case-sensitive toggle */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("size-7 p-0 text-[10px] font-bold", findCaseSensitive && "bg-emerald-500/15 text-emerald-600")}
                            onClick={() => {
                                setFindCaseSensitive((v) => !v);
                                findMatchesRef.current = [];
                            }}
                            title={findCaseSensitive ? "Case-sensitive ON — click for case-insensitive" : "Match case (Aa) — click to make searches case-sensitive"}
                            aria-pressed={findCaseSensitive}
                            aria-label="Toggle case sensitivity"
                        >
                            Aa
                        </Button>
                        {/* |w| — whole-word toggle */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("size-7 p-0 text-[10px] font-mono font-bold", findWholeWord && "bg-emerald-500/15 text-emerald-600")}
                            onClick={() => {
                                setFindWholeWord((v) => !v);
                                findMatchesRef.current = [];
                            }}
                            title={findWholeWord ? "Whole-word ON — click for substring matches" : "Whole word (|w|) — click to match whole words only"}
                            aria-pressed={findWholeWord}
                            aria-label="Toggle whole-word matching"
                        >
                            |w|
                        </Button>
                        {/* .* — regex toggle */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("size-7 p-0 text-[10px] font-mono font-bold", findRegex && "bg-emerald-500/15 text-emerald-600")}
                            onClick={() => {
                                setFindRegex((v) => !v);
                                findMatchesRef.current = [];
                            }}
                            title={findRegex ? "Regex mode ON — click for literal matching" : "Regex (.*?) — click to switch to regex matching"}
                            aria-pressed={findRegex}
                            aria-label="Toggle regex matching"
                        >
                            .*
                        </Button>
                        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
              {findQuery ? `${findMatchList.length} match${findMatchList.length === 1 ? "" : "es"}` : ""}
            </span>
                        <Button variant="ghost" size="sm" className="size-7 p-0" title="Previous match (Shift+Enter)"
                                onClick={() => {
                                    findMatchesRef.current = findMatchList;
                                    gotoFindMatch(findIndex - 1);
                                }}>
                            <ChevronUp className="size-3.5"/>
                        </Button>
                        <Button variant="ghost" size="sm" className="size-7 p-0" title="Next match (Enter)"
                                onClick={() => {
                                    findMatchesRef.current = findMatchList;
                                    gotoFindMatch(findIndex + 1);
                                }}>
                            <ChevronDown className="size-3.5"/>
                        </Button>
                        {/* Replace row expander (edit mode only — the Python editor's bar gates the same way). */}
                        {editMode && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="size-7 p-0"
                                onClick={() => {
                                    setReplaceOpen((v) => !v);
                                    requestAnimationFrame(() => (replaceOpen ? findInputRef.current?.focus() : replaceInputRef.current?.focus()));
                                }}
                                title={replaceOpen ? "Hide replace" : "Show replace"}
                                aria-label={replaceOpen ? "Hide replace" : "Show replace"}
                            >
                                <ChevronDown
                                    className={cn("size-3.5 transition-transform", replaceOpen && "rotate-180")}/>
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" className="size-7 p-0" title="Close (Escape)"
                                onClick={() => setFindOpen(false)}>
                            <X className="size-3.5"/>
                        </Button>
                    </div>
                    {editMode && replaceOpen && (
                        <div className="flex items-center gap-1.5 px-3 pb-1.5 border-t">
                            <input
                                ref={replaceInputRef}
                                type="text"
                                value={replaceQuery}
                                onChange={(e) => setReplaceQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                        e.preventDefault();
                                        setFindOpen(false);
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (e.shiftKey) {
                                            // Shift+Enter — arm the replace-ALL confirm.
                                            findMatchesRef.current = findMatchList;
                                            setConfirmReplaceAllCount(findMatchList.length);
                                        } else {
                                            handleReplaceNext();
                                        }
                                    }
                                }}
                                placeholder={findRegex ? "Replace (regex — $1 groups work)" : "Replace with"}
                                aria-label="Replace with"
                                className="flex-1 h-7 rounded-md border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={handleReplaceNext}
                                disabled={!findQuery || findMatchList.length === 0}
                                title="Replace the current match (Enter) — Ctrl+Z undoes"
                            >
                                Replace
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => {
                                    findMatchesRef.current = findMatchList;
                                    setConfirmReplaceAllCount(findMatchList.length);
                                }}
                                disabled={!findQuery || findMatchList.length === 0}
                                title="Replace ALL matches (Shift+Enter) — asks for the count first, Ctrl+Z undoes"
                            >
                                All
                            </Button>
                        </div>
                    )}
                    {/* the replace-ALL confirm step — the count is
              shown before the destructive bulk edit runs. */}
                    {confirmReplaceAllCount != null && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-amber-500/10 text-[11px]">
              <span className="flex-1 text-amber-700 dark:text-amber-400">
                Replace all {confirmReplaceAllCount} occurrence{confirmReplaceAllCount === 1 ? "" : "s"}
                  {findRegex ? " (regex)" : ""} of {findQuery ? `"${findQuery}"` : "—"} with
                  {replaceQuery ? ` "${replaceQuery}"` : " (nothing)"}?
              </span>
                            <Button
                                variant="default"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={handleReplaceAll}
                                disabled={confirmReplaceAllCount === 0}
                                title="Run the replacement"
                            >
                                Replace all
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => setConfirmReplaceAllCount(null)}
                                title="Cancel"
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </div>
            )}
            {/* the context menu wraps the WHOLE body (the scroll
container), not just the rendered content — right-clicking
the white area below a short file opens the file viewer's
custom menu in BOTH view and edit modes instead of the
browser's native one. The menu body is chosen by mode after
the trigger closes.

MINIMAP (plan): the ContextMenu root renders no DOM wrapper,
so the row div below is the new body flex-row — the scroll
container keeps its flex-1 sizing and the MINIMAP rail (a
sibling OUTSIDE the trigger, so right-clicks on a navigation
affordance keep the browser's native menu) renders for the
plain textarea edit surface (markdown's Edit side is the
studio, which owns its own scrolling — no rail there). */}
            <div className="relative flex min-h-0 flex-1">
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div ref={mdBodyScrollRef} data-file-viewer-body
                             className="relative flex-1 min-h-0 overflow-auto">
                            {/* keyed remount per markdown mode — the classic
                view and the studio never share a layout transition (the
                source of the "initially overlapping in the middle area
                between view and code" switch report). Non-markdown
                kinds keep the plain body. */}
                            {fileKind === "markdown" ? (
                                <React.Fragment key={mdViewMode}>
                                    {renderBody()}
                                </React.Fragment>
                            ) : (
                                renderBody()
                            )}
                        </div>
                    </ContextMenuTrigger>
                    {editMode ? (
                        /* Edit-mode right-click menu: native clipboard/undo actions
(so replacing the browser's menu loses nothing) + the
file-type-aware "Insert block" submenu. rendered
unconditionally now — previously it appeared only when
insertBlocks existed, leaving a native menu otherwise.: the
Auto-format / Auto-indent twins and the case TRANSFORM
submenu collapsed into ONE "Format & transform ▸"
submenu — top level keeps only the standard editing
actions + Insert block. */
                        <ContextMenuContent className="w-64">
                            {/* The EDIT menu is data-driven: MenuGroups renders the
                canonical editor-edit order for this file's kind with
                the standardized fileName header (the Python VIEW mode
                layout is the master). */}
                            <MenuHeader name={fileName} title={fileName}/>
                            <MenuGroups
                                kind={fileKind}
                                surface="editor-edit"
                                groups={{
                                    // Navigate ▸ — Find (in-file), split view, reveal.
                                    navigate: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Open this file side-by-side, or reveal it in the Explorer">
                                                <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Navigate</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem onClick={() => openFindBar()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Find in this file (Ctrl+F) — the in-file find bar, prefilled with the current selection">
                                                    <Search className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Find…</span>
                                                    <span className="text-[10px] text-muted-foreground">Ctrl+F</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new Event("praxis:split-editor"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Show this file side-by-side in the read-only split pane (Ctrl+\\ toggles it back)"
                                                >
                                                    <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Open In Split View</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:reveal-current"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Reveal this file in the Explorer's file tree (expands its folder and highlights the row)"
                                                >
                                                    <ListTree className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">Reveal In Explorer</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // File ▸ — save / mode switch / download / history /
                                    // containing folder.
                                    file: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Save, switch modes, download, or open the containing folder">
                                                <Save className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">File</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem onClick={() => void handleSave()} disabled={saving}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Save the edited file to disk">
                                                    <Save className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">{saving ? "Saving…" : "Save"}</span>
                                                    <span className="text-[10px] text-muted-foreground">Ctrl+S</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={cancelEdit} disabled={saving}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Discard edits and return to the read-only view">
                                                    <BookOpen className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Switch To View Mode</span>
                                                </ContextMenuItem>
                                                {/* New File From Selection — the Python editor's File ▸ row, mirrored: the selection becomes a NEW file's content (the parent's praxis:new-file-from-selection dialog works for every kind). */}
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const code = getSelectionForRun();
                                                        if (code.trim()) {
                                                            window.dispatchEvent(
                                                                new CustomEvent("praxis:new-file-from-selection", {
                                                                    detail: {code},
                                                                })
                                                            );
                                                        }
                                                    }}
                                                    disabled={!(() => {
                                                        const ta = editTextareaRef.current;
                                                        return !!ta && ta.selectionStart !== ta.selectionEnd;
                                                    })()}
                                                    className="gap-2 cursor-pointer"
                                                    title={
                                                        editTextareaRef.current && editTextareaRef.current.selectionStart !== editTextareaRef.current.selectionEnd
                                                            ? "Create a NEW file whose content is the selected code — asks for folder + name"
                                                            : "Select some text first"
                                                    }
                                                >
                                                    <FilePlus2 className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">New File From Selection…</span>
                                                </ContextMenuItem>
                                                <ContextMenuSeparator/>
                                                <ContextMenuItem onClick={downloadFile} className="gap-2 cursor-pointer"
                                                                 title="Download this file to your computer">
                                                    <Download className="size-3.5 text-purple-500 shrink-0"/>
                                                    <span className="flex-1">Download</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-local-history"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Open the local file history panel — every save created a snapshot you can diff and roll back to"
                                                >
                                                    <History className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Local File History…</span>
                                                </ContextMenuItem>
                                                {onOpenFolder && (
                                                    <ContextMenuItem onClick={onOpenFolder}
                                                                     className="gap-2 cursor-pointer"
                                                                     title="Open the containing folder in your OS file explorer">
                                                        <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>
                                                        <span className="flex-1">Open Containing Folder</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // Format ▸ — the Auto-format / Auto-indent twins (the
                                    // kind gate lives in menuGroupsForKind).
                                    format: () => fmtKindEntry && !locked ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Auto-format / Auto-indent this buffer — all undoable with Ctrl+Z">
                                                <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                <span className="flex-1">Format</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem onClick={() => void runFormatter("format")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title={`Auto-format this ${fmtKindEntry.label} buffer — code fences, raw regions, comments and strings stay untouched`}>
                                                    <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                    <span className="flex-1">Auto-Format {fmtKindEntry.label}</span>
                                                </ContextMenuItem>
                                                {fmtKindEntry.hasIndentTwin !== false && (
                                                    <ContextMenuItem onClick={() => void runFormatter("indent")}
                                                                     className="gap-2 cursor-pointer"
                                                                     title="Re-indent to the configured indentation (Settings → Formatting → per-language indent width) — line content untouched. Auto-format and Auto-indent are undoable with Ctrl+Z">
                                                        <ListTree className="size-3.5 text-sky-500 shrink-0"/>
                                                        <span className="flex-1">Auto-Indent {fmtKindEntry.label}</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // Run ▸ — the EDIT-mode runner group in the canonical slot
                                    // (right after Format ▸): the selection (or the caret's
                                    // line) through the file's own runtime, plus the
                                    // save-and-run whole-file entry.
                                    run: () => headerRunLanguage && headerRunLanguage !== "python" && (onRun || onRunSelection) ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger
                                                className="gap-2 cursor-pointer"
                                                title={`Run the selection (or the caret's line) in ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage}, or run the whole file`}
                                            >
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Run</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                {onRunSelection && (
                                                    <ContextMenuItem
                                                        onClick={() => {
                                                            const code = getSelectionForRun();
                                                            if (code.trim()) onRunSelection(code);
                                                        }}
                                                        className="gap-2 cursor-pointer"
                                                        title={`Run the SELECTED lines (or the caret's line) in ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage} — output streams to the panel below`}
                                                    >
                                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                        <span
                                                            className="flex-1">Run Selection In {RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage}</span>
                                                    </ContextMenuItem>
                                                )}
                                                {onRun && (
                                                    <ContextMenuItem
                                                        onClick={() => {
                                                            void (async () => {
                                                                const saved = await handleSave();
                                                                // Only run when the buffer actually reached the
                                                                // disk — a failed save must not execute stale code.
                                                                if (saved) onRun();
                                                            })();
                                                        }}
                                                        disabled={saving}
                                                        className="gap-2 cursor-pointer"
                                                        title={`Save the buffer and run this ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage} file — the output streams into the Output panel below`}
                                                    >
                                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                        <span className="flex-1">Run This File</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // Refactor ▸ — the language-blind project refactors.
                                    refactor: () => aiCodeKind ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Rename the selected symbol or find its usages across the project">
                                                <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                <span className="flex-1">Refactor</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const symbol = getSelectedSymbol();
                                                        if (symbol) window.dispatchEvent(new CustomEvent("praxis:rename-symbol", {detail: {symbol}}));
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Rename the symbol under the caret / selection (word-boundary replace across the whole project)"
                                                >
                                                    <PencilLine className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Rename Symbol…</span>
                                                    <span className="text-[10px] text-muted-foreground">⇧F6</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const symbol = getSelectedSymbol();
                                                        if (symbol) window.dispatchEvent(new CustomEvent("praxis:find-usages", {detail: {symbol}}));
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Find every occurrence of the selected symbol across the project"
                                                >
                                                    <Regex className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Find Usages…</span>
                                                    <span className="text-[10px] text-muted-foreground">⌥F7</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // Edit ▸ — undo/redo, clipboard, line utilities,
                                    // case conversion, trim.
                                    edit: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Undo / redo, clipboard, comment, duplicate, move lines, convert case, trim whitespace">
                                                <Type className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Edit</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem onClick={editContextUndo}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Undo the last edit (format passes included)">
                                                    <Undo2 className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Undo</span>
                                                    <span className="text-[10px] text-muted-foreground">Ctrl+Z</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={editContextRedo}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Redo the last undone edit">
                                                    <Redo2 className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Redo</span>
                                                    <span className="text-[10px] text-muted-foreground">Ctrl+Y</span>
                                                </ContextMenuItem>
                                                <ContextMenuSeparator/>
                                                <ContextMenuItem onClick={editContextCut}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Cut the selection">
                                                    <Scissors className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Cut</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={editContextCopy}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Copy the selection">
                                                    <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy</span>
                                                </ContextMenuItem>
                                                {/* Copy As Markdown Block — the Python editor's Edit ▸ row, mirrored for every kind (the selection wraps in a fenced block with this file's language). */}
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const code = getSelectionForRun();
                                                        if (!code.trim()) return;
                                                        const ext = (fileName.split(".").pop() || "").toLowerCase();
                                                        const fenceLanguage =
                                                            ext === "md" ? "markdown" : ext === "sh" ? "bash" : ext === "py" ? "python" : ext === "m" ? "matlab" : ext;
                                                        void navigator.clipboard?.writeText("```" + fenceLanguage + "\n" + code.replace(/\s+$/, "") + "\n```");
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy the selection wrapped in a fenced Markdown code block — paste straight into a README or issue"
                                                >
                                                    <Braces className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy As Markdown Block</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => void editContextPaste()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Paste from the clipboard at the caret">
                                                    <ClipboardPaste
                                                        className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Paste</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={editContextSelectAll}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Select the entire file contents">
                                                    <TextSelect className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Select All</span>
                                                    <span className="text-[10px] text-muted-foreground">Ctrl+A</span>
                                                </ContextMenuItem>
                                                <ContextMenuSeparator/>
                                                <ContextMenuSub>
                                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                           title="Comment, duplicate, move, delete, join or reorder the selected lines">
                                                        <ListTree className="size-3.5 text-sky-500 shrink-0"/>
                                                        <span className="flex-1">Lines</span>
                                                    </ContextMenuSubTrigger>
                                                    <ContextMenuSubContent className="w-56">
                                                        <ContextMenuItem onClick={() => runLineOp("comment")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Toggle the line comment on the selected lines (…the Python editor's Toggle comment)">
                                                            <MessageSquare
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Toggle Comment</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("duplicate")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Duplicate the selected lines">
                                                            <CopyPlus
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Duplicate Line</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuSeparator/>
                                                        <ContextMenuItem onClick={() => runLineOp("up")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Move the selected lines up">
                                                            <ArrowUp
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Move Line Up</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("down")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Move the selected lines down">
                                                            <ArrowDown
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Move Line Down</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuSeparator/>
                                                        <ContextMenuItem onClick={() => runLineOp("delete")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Delete the selected lines">
                                                            <Trash2
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Delete Line</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("join")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Join the selected lines into one">
                                                            <Merge className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Join Lines</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("sort")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Sort the selected lines alphabetically">
                                                            <ArrowDownAZ
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Sort Selected Lines</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("unique")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Remove duplicate lines from the selection (first occurrence wins, blank lines kept)">
                                                            <Filter
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Unique Lines</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("reverse")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Reverse the order of the selected lines">
                                                            <ArrowDownUp
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Reverse Lines</span>
                                                        </ContextMenuItem>
                                                        <ContextMenuItem onClick={() => runLineOp("shuffle")}
                                                                         className="gap-2 cursor-pointer"
                                                                         title="Shuffle the selected lines into a random order">
                                                            <Shuffle
                                                                className="size-3.5 text-muted-foreground shrink-0"/>
                                                            <span className="flex-1">Shuffle Lines</span>
                                                        </ContextMenuItem>
                                                    </ContextMenuSubContent>
                                                </ContextMenuSub>
                                                <ContextMenuSub>
                                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                           title="Convert the selection (or word at the caret) to another case style">
                                                        <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                        <span className="flex-1">Convert Case</span>
                                                    </ContextMenuSubTrigger>
                                                    <ContextMenuSubContent className="w-56">
                                                        {(
                                                            [
                                                                ["upper", "UPPERCASE"],
                                                                ["lower", "lowercase"],
                                                                ["title", "Title Case"],
                                                                ["camel", "camelCase"],
                                                                ["pascal", "PascalCase"],
                                                                ["snake", "snake_case"],
                                                                ["kebab", "kebab-case"],
                                                                ["constant", "CONSTANT_CASE"],
                                                            ] as const
                                                        ).map(([kind, label]) => (
                                                            <ContextMenuItem
                                                                key={kind}
                                                                onClick={() => editContextCase(kind)}
                                                                className="gap-2 cursor-pointer"
                                                                title={`Convert the selection (or word at the caret) to ${label}`}
                                                            >
                                                                <Type
                                                                    className="size-3.5 text-muted-foreground shrink-0"/>
                                                                <span className="flex-1">{label}</span>
                                                            </ContextMenuItem>
                                                        ))}
                                                    </ContextMenuSubContent>
                                                </ContextMenuSub>
                                                <ContextMenuSeparator/>
                                                <ContextMenuItem onClick={() => runLineOp("trim")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Remove trailing whitespace from every line in the file">
                                                    <Eraser className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Trim Trailing Whitespace</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // AI ▸ — Explain / Improve / Docstring (the kind gate is
                                    // the spec's canAiCode — R and Shell now qualify too).
                                    ai: () => aiCodeKind && onAiPrompt ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger
                                                className="gap-2 cursor-pointer"
                                                title="Explain, improve, or document the selected code with the integrated AI"
                                            >
                                                <Sparkles className="size-3.5 text-amber-500 shrink-0"/>
                                                <span className="flex-1">AI</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem
                                                    onClick={() =>
                                                        onAiPrompt(
                                                            `Explain this ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage ?? ""] ?? fileKind} code step by step:\n\n\`\`\`\n${getSelectionForAi().slice(0, 6000)}\n\`\`\`\n\nWhat does it do, and are there any bugs or edge cases I should know about?`
                                                        )
                                                    }
                                                    className="gap-2 cursor-pointer"
                                                    title="Send the selection (or the whole buffer) to the AI chat with an explain prompt"
                                                >
                                                    <Sparkles className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Explain Selection</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() =>
                                                        onAiPrompt(
                                                            `Improve this ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage ?? ""] ?? fileKind} code:\n\n\`\`\`\n${getSelectionForAi().slice(0, 6000)}\n\`\`\`\n\nRewrite it cleaner and more idiomatic. Keep the behavior identical; show only the improved code plus a short list of what changed.`
                                                        )
                                                    }
                                                    className="gap-2 cursor-pointer"
                                                    title="Ask the AI to rewrite the selection (or buffer) cleaner — same behavior"
                                                >
                                                    <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                    <span className="flex-1">Improve Code</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() =>
                                                        onAiPrompt(
                                                            `Write a documentation comment block for this code:\n\n\`\`\`\n${getSelectionForAi().slice(0, 6000)}\n\`\`\`\n\nReturn ONLY the completed code with the documentation added, in the language's own comment style.`
                                                        )
                                                    }
                                                    className="gap-2 cursor-pointer"
                                                    title="Ask the AI to add a documentation block to the selection"
                                                >
                                                    <FileText className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Generate Documentation</span>
                                                </ContextMenuItem>
                                                {/* Generate Tests — the Python editor's 4th AI ▸ row, mirrored: the chat writes a test suite in THIS language. */}
                                                <ContextMenuItem
                                                    onClick={() =>
                                                        onAiPrompt(
                                                            `Write a focused test suite for this ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage ?? ""] ?? fileKind} code:\n\n\`\`\`\n${getSelectionForAi().slice(0, 6000)}\n\`\`\`\n\nGive a runnable test file (the language's standard test runner) covering the happy path, edge cases and error handling — no explanations, just the file plus a one-line run command.`
                                                        )
                                                    }
                                                    className="gap-2 cursor-pointer"
                                                    title="Ask the AI to write a test suite for the selection (or the whole buffer)"
                                                >
                                                    <FlaskConical className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">Generate Tests</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // Clipboard ▸ — the file-level copy flavors (the
                                    // separator before it is canonical).
                                    clipboard: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Copy the file name or its absolute path">
                                                <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">Clipboard</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem
                                                    onClick={() => void navigator.clipboard.writeText(fileName.replace(/\.[^.]+$/, ""))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy the file name without its path or extension — data.csv → data"
                                                >
                                                    <FileType2 className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy File Name</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        void (async () => {
                                                            try {
                                                                const res = await fetch(
                                                                    `/api/resolve-path?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                                                                );
                                                                const data = await res.json();
                                                                if (res.ok && data.absPath) await navigator.clipboard.writeText(String(data.absPath));
                                                            } catch {
                                                                /* ignore */
                                                            }
                                                        })();
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy this file's absolute filesystem path (server-side) to the clipboard"
                                                >
                                                    <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy File Path</span>
                                                </ContextMenuItem>
                                                {/* Copy Path With Line — the Python editor's Clipboard ▸ row (path + :caretLine), mirrored from the textarea's caret. */}
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        void (async () => {
                                                            try {
                                                                const res = await fetch(
                                                                    `/api/resolve-path?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                                                                );
                                                                const data = await res.json();
                                                                if (!res.ok || !data.absPath) return;
                                                                const ta = editTextareaRef.current;
                                                                const line = ta
                                                                    ? editContent.slice(0, ta.selectionStart).split("\n").length
                                                                    : 1;
                                                                await navigator.clipboard.writeText(`${String(data.absPath)}:${line}`);
                                                            } catch {
                                                                /* ignore */
                                                            }
                                                        })();
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy the absolute path plus the caret's line number — path:line, the jump-to-source format"
                                                >
                                                    <FileType2 className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy Path With Line</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // Insert Block ▸ — the styled block inserts.
                                    insertblock: () => insertBlocks.length > 0 ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Insert a styled block at the cursor">
                                                <SquarePlus className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Insert Block</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60 max-h-[420px] overflow-y-auto">
                                                {blockCategories(insertBlocks).map((cat) => (
                                                    <React.Fragment key={cat}>
                                                        <ContextMenuLabel
                                                            className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                            {cat}
                                                        </ContextMenuLabel>
                                                        {insertBlocks
                                                            .filter((b) => b.category === cat)
                                                            .map((b) => (
                                                                <ContextMenuItem
                                                                    key={b.id}
                                                                    onClick={() => insertBlockAtCaret(b.template)}
                                                                    className="gap-2 cursor-pointer"
                                                                    title={b.description}
                                                                >
                                                                    <span className="flex-1 truncate">{b.label}</span>
                                                                </ContextMenuItem>
                                                            ))}
                                                    </React.Fragment>
                                                ))}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                }}
                            />
                        </ContextMenuContent>
                    ) : (
                        /* Read-mode right-click menu — view mode previously
had NO custom menu at all (every right-click was the
browser's native one). Mirrors the CodeViewer's view menu.: the
twelve top-level rows collapsed into SIX — Edit file, Open
in split view, then every formatter twin under ONE
Formatting ▸ submenu and every copy flavor under ONE
Clipboard ▸ submenu (the five Copy rows used to sprawl at
the top level), plus Reveal + Download. */
                        <ContextMenuContent className="w-60">
                            {/* The VIEW menu is data-driven off the SAME spec — the
                Python view layout is the master template. */}
                            <MenuHeader name={fileName} title={fileName}/>
                            <MenuGroups
                                kind={fileKind}
                                surface="editor-view"
                                groups={{
                                    // Run ▸ — ONE runner submenu (the double-Run fix: the old
                                    // direct Run item + the separate Run ▸ selection submenu
                                    // both showed "Run"). Whole-file + the view-mode selection.
                                    run: () => headerRunLanguage && headerRunLanguage !== "python" && (onRun || onRunSelection) ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger
                                                className="gap-2 cursor-pointer"
                                                title={`Run the whole file or the selected lines in ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage}`}
                                            >
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Run</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                {onRun && (
                                                    <ContextMenuItem
                                                        onClick={onRun}
                                                        className="gap-2 cursor-pointer"
                                                        title={`Run this ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage} file — the output streams into the Output panel below (same as the header Run button)`}
                                                    >
                                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                        <span className="flex-1">Run File</span>
                                                    </ContextMenuItem>
                                                )}
                                                {onRunSelection && (
                                                    <ContextMenuItem
                                                        onClick={() => {
                                                            const sel = window.getSelection();
                                                            const text = sel ? sel.toString() : "";
                                                            if (text.trim()) onRunSelection(text);
                                                        }}
                                                        className="gap-2 cursor-pointer"
                                                        title={`Run the SELECTED lines (the highlighted text) in ${RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage} — output streams to the panel below`}
                                                    >
                                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                        <span
                                                            className="flex-1">Run Selection In {RUNTIME_LABEL_BY_LANGUAGE[headerRunLanguage] ?? headerRunLanguage}</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // Edit File — the mode switch.
                                    editfile: () => editableKind && onSaveEdit ? (
                                        <ContextMenuItem onClick={startEdit} className="gap-2 cursor-pointer"
                                                         title="Switch to edit mode (inline textarea editor for this file type)">
                                            <Pencil className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Edit File</span>
                                        </ContextMenuItem>
                                    ) : null,
                                    // AI — the master template's "Explain Selection With AI…".
                                    ai: () => aiCodeKind && onAiPrompt ? (
                                        <ContextMenuItem
                                            onClick={() => {
                                                const sel = window.getSelection();
                                                const text = sel ? sel.toString().trim() : "";
                                                if (text) onAiPrompt(`Explain this selected code step by step:\n\n\`\`\`\n${text.slice(0, 6000)}\n\`\`\`\n\nWhat does it do, and are there any bugs or edge cases I should know about?`);
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Send the selected lines to the AI chat sidebar with a request to explain them"
                                        >
                                            <Sparkles className="size-3.5 text-violet-500 shrink-0"/>
                                            <span className="flex-1">Explain Selection With AI…</span>
                                        </ContextMenuItem>
                                    ) : null,
                                    // Navigate ▸ — Find (drift fix: non-Python parity) +
                                    // split view + select all.
                                    navigate: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Open this file side-by-side, or select the whole rendered body">
                                                <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Navigate</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new Event("praxis:split-editor"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Show this file side-by-side in the read-only split pane (Ctrl+\\ toggles it back)"
                                                >
                                                    <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Open In Split View</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => openFindBar()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Find in this file (Ctrl+F) — the in-file find bar / the browser find, prefilled with the current selection">
                                                    <Search className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Find…</span>
                                                    <span className="text-[10px] text-muted-foreground">Ctrl+F</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        // Select the rendered body: the closest scrollable
                                                        // container above this menu's portal host is the
                                                        // viewer body (works for every kind's renderer).
                                                        const menu = document.querySelector("[data-radix-popper-content-wrapper] [role=menu]") ?? document.activeElement;
                                                        const root = (menu as HTMLElement | null)?.closest("[data-file-viewer-body]") ?? mdBodyScrollRef.current;
                                                        const body = (root as HTMLElement | null) ?? mdBodyScrollRef.current;
                                                        if (!body) return;
                                                        const range = document.createRange();
                                                        range.selectNodeContents(body);
                                                        const sel = window.getSelection();
                                                        if (sel) {
                                                            sel.removeAllRanges();
                                                            sel.addRange(range);
                                                        }
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Select the whole rendered body (then Copy, or let the browser find prefill from it)"
                                                >
                                                    <TextSelect className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Select All</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // Format ▸ — the SAME twins edit mode offers.
                                    format: () => fmtKindEntry && onSaveEdit && !locked && !fetchError ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Auto-format / Auto-indent this file — the exact engines edit mode uses (undoable, and in view mode it switches to the editor with the formatted buffer)">
                                                <Wand2 className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Format</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem onClick={() => void runFormatter("format")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title={fmtKindEntry.formatTitle}>
                                                    <Wand2 className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">Auto-Format {fmtKindEntry.label}</span>
                                                </ContextMenuItem>
                                                {fmtKindEntry.hasIndentTwin !== false && (
                                                    <ContextMenuItem onClick={() => void runFormatter("indent")}
                                                                     className="gap-2 cursor-pointer"
                                                                     title={fmtKindEntry.indentTitle ?? "Re-indent to the configured indentation — line content untouched"}>
                                                        <ListTree className="size-3.5 text-sky-500 shrink-0"/>
                                                        <span className="flex-1">Auto-Indent {fmtKindEntry.label}</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // runselection — FOLDED into the Run ▸ submenu above (the
                                    // double-Run fix); this group intentionally renders nothing.
                                    runselection: () => null,
                                    // Refactor ▸ — the language-blind project refactors.
                                    refactor: () => aiCodeKind ? (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Rename the selected symbol or find its usages across the project">
                                                <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                <span className="flex-1">Refactor</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const symbol = getSelectedSymbol();
                                                        if (symbol) window.dispatchEvent(new CustomEvent("praxis:rename-symbol", {detail: {symbol}}));
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Rename the selected symbol (word-boundary replace across the whole project)"
                                                >
                                                    <PencilLine className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Rename Symbol…</span>
                                                    <span className="text-[10px] text-muted-foreground">⇧F6</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const symbol = getSelectedSymbol();
                                                        if (symbol) window.dispatchEvent(new CustomEvent("praxis:find-usages", {detail: {symbol}}));
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Find every occurrence of the selected symbol across the project"
                                                >
                                                    <Regex className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Find Usages…</span>
                                                    <span className="text-[10px] text-muted-foreground">⌥F7</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    ) : null,
                                    // Clipboard ▸ — the copy flavors (the separator before
                                    // it is the canonical one).
                                    clipboard: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Copy the contents, the selection, a fenced Markdown block, the file name, or the absolute path">
                                                <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">Clipboard</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                {textLikeKind && !fetchError && (
                                                    <ContextMenuItem
                                                        onClick={() => {
                                                            void navigator.clipboard?.writeText(content).then(() => {
                                                                toast({
                                                                    title: "Copied",
                                                                    description: `${fileName} — ${content.length.toLocaleString()} characters`
                                                                });
                                                            });
                                                        }}
                                                        className="gap-2 cursor-pointer"
                                                        title="Copy the entire file contents to the clipboard"
                                                    >
                                                        <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                                        <span className="flex-1">Copy All</span>
                                                    </ContextMenuItem>
                                                )}
                                                {textLikeKind && !fetchError && (
                                                    <ContextMenuItem
                                                        onClick={() => {
                                                            const sel = window.getSelection();
                                                            const text = sel ? sel.toString() : "";
                                                            if (text) {
                                                                void navigator.clipboard?.writeText(text);
                                                            }
                                                        }}
                                                        className="gap-2 cursor-pointer"
                                                        title="Copy the text currently selected in the view"
                                                    >
                                                        <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                                        <span className="flex-1">Copy Selection</span>
                                                    </ContextMenuItem>
                                                )}
                                                {textLikeKind && !fetchError && (
                                                    <ContextMenuItem
                                                        onClick={() => {
                                                            const sel = window.getSelection();
                                                            const text = sel ? sel.toString().replace(/\s+$/, "") : "";
                                                            if (!text.trim()) return;
                                                            const ext = (fileName.split(".").pop() || "").toLowerCase();
                                                            const fenceLanguage =
                                                                ext === "json" || ext === "yaml" || ext === "toml" || ext === "sql" || ext === "r" || ext === "csv" || ext === "sh" || ext === "md"
                                                                    ? ext === "md" ? "markdown" : ext === "sh" ? "bash" : ext
                                                                    : "";
                                                            const fenced = "```" + fenceLanguage + "\n" + text + "\n```";
                                                            void navigator.clipboard?.writeText(fenced).then(() => {
                                                                toast({
                                                                    title: "Copied as a Markdown code block",
                                                                    description: `${text.split("\n").length} lines fenced as ${fenceLanguage || "plain text"}.`
                                                                });
                                                            });
                                                        }}
                                                        className="gap-2 cursor-pointer"
                                                        title="Copy the selected lines wrapped in a fenced Markdown code block — paste straight into a README or issue"
                                                    >
                                                        <Braces className="size-3.5 text-muted-foreground shrink-0"/>
                                                        <span className="flex-1">Copy As Markdown Block</span>
                                                    </ContextMenuItem>
                                                )}
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        void navigator.clipboard.writeText(fileName.replace(/\.[^.]+$/, "")).then(() => {
                                                            toast({
                                                                title: "Copied file name",
                                                                description: fileName.replace(/\.[^.]+$/, "")
                                                            });
                                                        });
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy the file name without its path or extension — data.csv → data"
                                                >
                                                    <FileType2 className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy File Name</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        void (async () => {
                                                            try {
                                                                const res = await fetch(
                                                                    `/api/resolve-path?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`
                                                                );
                                                                const data = await res.json();
                                                                if (!res.ok || !data.absPath) {
                                                                    toast({
                                                                        variant: "destructive",
                                                                        title: data.error ?? "Could not resolve path."
                                                                    });
                                                                    return;
                                                                }
                                                                await navigator.clipboard.writeText(String(data.absPath));
                                                                toast({
                                                                    title: "Copied absolute path",
                                                                    description: String(data.absPath)
                                                                });
                                                            } catch {
                                                                toast({
                                                                    variant: "destructive",
                                                                    title: "Could not copy the path."
                                                                });
                                                            }
                                                        })();
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Copy this file's absolute filesystem path (server-side) to the clipboard"
                                                >
                                                    <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Copy File Path</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // File ▸ — download / reveal / history.
                                    file: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Download, reveal in Explorer, local history">
                                                <Download className="size-3.5 text-purple-500 shrink-0"/>
                                                <span className="flex-1">File</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem onClick={downloadFile} className="gap-2 cursor-pointer"
                                                                 title="Download this file to your computer">
                                                    <Download className="size-3.5 text-purple-500 shrink-0"/>
                                                    <span className="flex-1">Download</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:reveal-current"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Reveal this file in the Explorer's file tree (expands its folder and highlights the row)"
                                                >
                                                    <ListTree className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">Reveal In Explorer</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-local-history"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Open the local file history panel — every save created a snapshot you can diff and roll back to"
                                                >
                                                    <History className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Local File History…</span>
                                                </ContextMenuItem>
                                                {/* New File From Selection — view-mode twin of the Python editor's File ▸ row: the browser selection becomes a new file's content. */}
                                                <ContextMenuItem
                                                    onClick={() => {
                                                        const sel = window.getSelection();
                                                        const text = sel ? sel.toString().trim() : "";
                                                        if (text) {
                                                            window.dispatchEvent(
                                                                new CustomEvent("praxis:new-file-from-selection", {
                                                                    detail: {code: text},
                                                                })
                                                            );
                                                        }
                                                    }}
                                                    className="gap-2 cursor-pointer"
                                                    title="Create a NEW file whose content is the selected lines — asks for folder + name"
                                                >
                                                    <FilePlus2 className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">New File From Selection…</span>
                                                </ContextMenuItem>
                                                {onOpenFolder && (
                                                    <ContextMenuItem onClick={onOpenFolder}
                                                                     className="gap-2 cursor-pointer"
                                                                     title="Open the containing folder in your OS file explorer">
                                                        <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>
                                                        <span className="flex-1">Open Containing Folder</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                    // View ▸ — the closing group: zoom and wrap controls.
                                    view: () => (
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Zoom and wrap controls for this view">
                                                <Eye className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">View</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem
                                                    onClick={() => applyZoom(Math.min(fileKind === "image" ? 8 : 3, zoom * (fileKind === "image" ? 1.25 : 1.15)))}
                                                    className="gap-2 cursor-pointer"
                                                    title={fileKind === "image" ? "Zoom the image in (25% per step, remembered)" : "Zoom the view in (15% per step, remembered per file kind)"}
                                                >
                                                    <ZoomIn className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Zoom In</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => applyZoom(Math.max(fileKind === "image" ? 0.1 : 0.5, zoom / (fileKind === "image" ? 1.25 : 1.15)))}
                                                    className="gap-2 cursor-pointer"
                                                    title={fileKind === "image" ? "Zoom the image out (25% per step, remembered)" : "Zoom the view out (15% per step, remembered per file kind)"}
                                                >
                                                    <ZoomOut className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Zoom Out</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => applyZoom(1)}
                                                    className="gap-2 cursor-pointer"
                                                    title={fileKind === "image" ? "Reset the image zoom to fit (100%)" : "Reset the view zoom to 100%"}
                                                >
                                                    <Eye className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Reset Zoom</span>
                                                </ContextMenuItem>
                                                {(fileKind === "html" || fileKind === "markdown") && (
                                                    <ContextMenuItem
                                                        onClick={() =>
                                                            fileKind === "html" ? setHtmlWrap((v) => !v) : setMdSourceWrap((v) => !v)
                                                        }
                                                        className="gap-2 cursor-pointer"
                                                        title="Wrap long source lines (no horizontal scrolling) — the same toggle the source toolbar has"
                                                    >
                                                        <WrapText className="size-3.5 text-muted-foreground shrink-0"/>
                                                        <span className="flex-1">Toggle Wrap</span>
                                                    </ContextMenuItem>
                                                )}
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>),
                                }}
                            />
                        </ContextMenuContent>
                    )}
                </ContextMenu>
                {/* the MINIMAP rail (plan) — only the plain-textarea edit
surface; MarkdownStudio owns its own scrolling. Renders
nothing while the body's scroll container is not
scrollable (the component itself decides + hides). */}
                {editMode && fileKind !== "markdown" && (
                    <MinimapColumn scrollRef={mdBodyScrollRef} text={editContent} dark={isDark}/>
                )}
            </div>
        </div>
    );
};

/* The edit-surface minimap now lives in components/minimap-column.tsx
 * (shared with the Python editor's view mode — code-viewer.tsx). */
export const FileViewer = React.memo(FileViewerInner);
