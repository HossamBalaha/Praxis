"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {useTheme} from "next-themes";
import {AnimatePresence, motion} from "framer-motion";
import {STORAGE_PREFIX} from "@/lib/config";
import {
    ChevronDown,
    Code2,
    Download,
    FileCode2,
    FileText,
    Loader2,
    Pencil,
    Play,
    Sparkles,
    X,
    Zap,
} from "lucide-react";
// the viewer renders with the LIGHT Prism build
// (only the registered languages) instead of the full build that
// bundles every registered language — several hundred KB off the
// first load. Imported as SyntaxHighlighter so all call sites are
// unchanged.
import {SyntaxHighlighter} from "@/lib/highlighter";
// REAL worker tokenization — renders serialized Prism tokens through
// the identical span pipeline (see the highlight-worker header).
import {WorkerOrPlainHighlightBlock} from "@/components/worker-highlight";
import {MinimapColumn} from "@/components/minimap-column";
// Inline git blame gutter (Settings → Editor → git blame gutter).
import {BlameGutter} from "@/components/blame-gutter";
// Inline AI chat (Ctrl+I at a selection) — streams from /api/ai-chat
// and applies the answer straight into the buffer (undoable).
import {InlineAiChat} from "@/components/inline-ai-chat";
// Peek references (⇧F12) — the compact popup listing every project-wide
// reference for the word under the caret.
import {PeekReferencesPopup} from "@/components/peek-references-popup";
// Test watch-mode gutter marks (Tests panel ▸ Watch on save).
import {getWatchState, subscribeWatchState, type WatchTestSummary} from "@/lib/watch-tests";
import {takePendingInlineAi} from "@/lib/pending-console-run";
import {VimController, type VimState} from "@/lib/vim-mode";
// The LSP-grade completion pipeline (fuzzy + ranked + docs + imports).
import {ensureImport, pythonCompletions, pythonIdentifierPrefixBefore} from "@/lib/completion-provider";
// the ONE data-driven right-click group renderer — the edit and view
// menus below route through it (lib/context-menu-spec.ts is the gate).
// The shared 24-theme registry — ONE list + ONE persistence key
// (praxis.code-theme) for BOTH viewers: this Python editor AND every
// other language's viewer (file-viewer), so a theme picked from
// either bar restyles both.
import {CODE_THEMES, codeBgFor, loadCodeTheme, saveCodeTheme} from "@/lib/code-themes";
import {Button} from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {cn} from "@/lib/utils";
// Perf HUD (G23) — the editor reports its OWN render count so the
// HUD's "render counts" list has a live, end-to-end-proven row: one
// module-level Map write per render, ~zero cost, safe while the HUD is
// closed (the hub keeps counting and the next open reads it back).
import {reportPanelRender} from "@/lib/perf-metrics";
import {formatSymbol, parsePythonSymbols, type PythonSymbol} from "@/lib/python-symbols";
// Signature-help scanner + builtin table (extracted from this file in Phase 3).
import {resolveSignatureHelp, type SignatureHelpResult} from "@/lib/signature-help";
import {extractFunction, extractVariable} from "@/lib/refactor";
import {matchesShortcut} from "@/lib/shortcuts";
// ─── debugger gutter breakpoints + peek references (⇧F12) ────────
// wordAt / fetchReferences reuse the app's ONE references data
// machinery (/api/full-text-search); dispatchOpenReference hands
// cross-file popup clicks to page.tsx through a window event.
import {dispatchOpenReference, hitIsCurrentFile, type ReferenceHit, wordAt} from "@/lib/peek-references";
// ─── Pyright LSP sidecar (Phase 3) ────────────────────────────────
// usePyrightLsp owns the session (document sync, typed hovers, F12 /
// ⇧F12 / F2, live type diagnostics); the ruff live-lint it merges with
// lives in its own hook since the Phase 3 extraction; the actions lib
// keeps the LSP-first ladders out of this (budget-capped) file.
import {usePyrightLsp} from "@/hooks/use-pyright-lsp";
import {useLiveLintDiagnostics} from "@/hooks/use-live-lint-diagnostics";
import {mergeLspDiagnostics} from "@/lib/pyright-client";
import {gotoDefinitionViaLsp, referencesViaLsp} from "@/lib/editor-lsp-actions";
// ─── persisted code-folding (folds survive reload) ────────────────
import {restoreFoldKeys, saveFoldState} from "@/lib/fold-state";
// KaTeX math for # %% [markdown] cells ($…$ / $$…$$).
import {formatRequestSettings, getActiveChatProvider, getNamingStyles, loadSettings} from "@/lib/settings";
import {getIndentSettings, reindentPython} from "@/lib/indent";
import {applyFormatPostProcessors} from "@/lib/format-post";
// spell check the comment/string prose scanner, the
// HTML/CSS markup skip-list and the tab-stop / soft-wrap geometry all
// live in pure lib modules (unit-tested) so the overlay math here stays
// a thin adapter.
import {spellIssuesInPyProse} from "@/lib/spell-spans";
import {filterMarkupSpellIssues} from "@/lib/spell-skip";
// AI completion the Fill-In-Middle request derives its
// per-language prompt from the file's name — lib/ai.ts owns the map.
// readPersistedSampling threads the chat sidebar's Tuning knobs
// (temperature / max_tokens / top_p, persisted to localStorage) into
// completion requests too — see fetchAiSuggestion below.
import {completionLanguageFromFileName, readPersistedSampling} from "@/lib/ai-shared";
import {pixelXOfColumn, visualPositionOf, wrapColumnCount, wrappedRowCount} from "@/lib/editor-geometry";
import {replaceWordEverywhere, SpellWordSpan, WaveUnderline} from "@/lib/spell-marks";
import {useToast} from "@/hooks/use-toast";
import {blocksForFile, renderTemplate, spliceTemplate} from "@/lib/code-templates";
// ─── Phase 2b decomposition: the pure engines extracted from this
// component (all zero-React / zero-DOM, all unit-tested in their own
// suites) — the clip math, the overlay windowing/row mapping, the
// edit-mode block operations, find matching, fold-to-view, chunking,
// notebook cells, the rainbow-bracket scan, whitespace segmentation
// and breakpoint normalization. ─────────────────────────────────────
import {
    collapsedClipHeight,
    collapsedPreviewText,
    collapsedRowCount,
    isFileCollapsible,
    viewPadTrimFor
} from "@/lib/clip-math";
import {
    buildRawLineToViewRow,
    buildViewRowPrefix,
    gutterMinWidthOf as gutterMinWidth,
    lineTopOf,
    OVERLAY_WINDOW_MARGIN,
    overlayWindowChanged,
    overlayWindowFromScroll,
    viewRowTopOf as viewRowTopInEngine,
    windowedOverlayRange
} from "@/layout/code-overlay-engine";
import {
    centeredTextareaScrollTop,
    convertIdentifierCase,
    deleteLinesBlock,
    duplicateLinesBlock,
    joinLinesBlock,
    lineNumberAtOffset,
    lineTextAt,
    newlineCountBefore,
    replaceAllLiteral,
    reverseLines,
    runSelectionText,
    shuffleLines,
    sortLinesBlock,
    splitLinesBlock,
    surroundRange,
    togglePythonComments,
    transformLinesBlock,
    trimTrailingWhitespace,
    uniqueLines,
    wordRangeAround
} from "@/lib/editor-block-ops";
import {displayedRowsText, findMatchesIn, viewFindOccurrences} from "@/lib/find-occurrences";
import {buildFoldedView, buildFoldKeyMapper} from "@/lib/fold-view";
import {FULL_CHUNK_LINES, FULL_CHUNK_THRESHOLD, splitSafeChunks} from "@/lib/code-chunks";
import {parseCells} from "@/lib/notebook-cells";
import {scanRainbowMarks} from "@/lib/rainbow-brackets";
import {whitespaceMarksForLine} from "@/lib/whitespace-marks";
import {breakpointListKey, sanitizeBreakpointList, VIEW_GUTTER_BREAKPOINT_PX} from "@/lib/breakpoint-list";

// ─── Phase 2b decomposition: the memoized subcomponents + the props
// contract extracted into their own files (same JSX, zero behavior
// change — each file lists exactly what it needs). ────────────────
import {StickyScrollHeader} from "@/components/code-viewer-sticky-header";
import {CellCodeBlock, SimpleHighlightBlock} from "@/components/code-viewer-blocks";
import {ProgressiveCodeBody} from "@/components/code-viewer-progressive";
import {CodeViewerContextMenu} from "@/components/code-viewer-context-menu";
import {ViewHoverTooltip} from "@/components/view-hover-tooltip";
import {ViewSpellChips} from "@/components/view-spell-chips";
import {CodeViewerToolbar} from "@/components/code-viewer-toolbar";
import {CodeViewerEditGutters} from "@/components/code-viewer-edit-gutters";
import {CodeViewerFindBars} from "@/components/code-viewer-find-bars";
import type {CodeViewerHandle, CodeViewerProps, Diagnostic} from "@/components/code-viewer-types";
import {ContextMenu, ContextMenuTrigger} from "@/components/ui/context-menu";
// MarkdownGithub (react-markdown + remark/rehype plugins, ~a fifth
// of the editor's former static payload) loads ONLY when the cell
// view of a Python file actually renders a markdown cell — the
// plain-code paths never pay for it.
const MarkdownGithub = dynamic(() => import("@/components/markdown-github").then((m) => m.MarkdownGithub), {ssr: false});

// page.tsx imports the handle type from this module — keep the
// historical path working while the contract lives in its own file.
export type {CodeViewerProps, CodeViewerHandle} from "@/components/code-viewer-types";

const FOLD_SAVE_DEBOUNCE_MS = 400;

/** Client-side cap for the Fill-In-Middle `suffix` sent with AI
 * completion requests. Matches the route's own suffix budget
 * (lib/ai.ts tail-caps the PROMPT suffix at 2000 chars) — anything
 * larger would only be trimmed server-side and would bloat the wire
 * for a 5 MB body-limit route. */
const AI_COMPLETION_SUFFIX_CAP = 2000;

/** Hard cap on the number of lines rendered with syntax highlighting
 *  or in the edit-mode textarea. Files above this limit show a
 *  "file too large to display — download to view" fallback instead of
 *  freezing the tab by rendering tens of thousands of DOM nodes. */
const MAX_RENDER_LINES = 5000;

/** how long after the last keystroke the edit-mode
 *  backdrop stays in "hot" (plain-text) mode before Prism re-renders.
 *  150ms keeps up with normal typing rhythm — colors return on the
 *  natural micro-pauses between words. */
const EDIT_HIGHLIGHT_HOT_MS = 150;

/** above this many characters the edit-mode backdrop
 *  NEVER uses Prism — even a single paused re-highlight of a file this
 *  size takes seconds and freezes the tab (measured: 8–15 s at 146 KB;
 *  ~40 KB keeps the pause render under ~½ s on typical hardware).
 *  View mode is unaffected (it renders at most MAX_RENDER_LINES and
 *  only on load). */
const EDIT_PLAIN_MAX_CHARS = 40_000;

/* ── rainbow brackets + pair guides ──────────────────
 * A single pass over the visible source tracks bracket nesting depth;
 * each bracket glyph is tinted with the color of its depth (VS Code's
 * bracket-pair colorization) and every MULTI-LINE pair draws a faint
 * vertical guide '│' at the opening column through the lines it spans.
 * Rendered as a transparent <pre> overlay (the same proven technique
 * as the whitespace / indent-guide overlays): non-bracket text is
 * emitted transparent so the syntax highlighting underneath shows
 * through, and monospace keeps every glyph exactly on its column.
 * The SCAN lives in lib/rainbow-brackets.ts (pure, unit-tested); this
 * is the thin React adapter that turns marks into fragments. */

/** Build the overlay's per-line React fragments. Returns null when
 *  the source has no brackets (or exceeds the bracket budget). */
function buildRainbowOverlay(src: string): React.ReactNode[] | null {
    const marks = scanRainbowMarks(src);
    if (!marks) return null;
    const lines = src.split("\n");
    // Render each line: transparent runs between colored glyphs.
    const out: React.ReactNode[] = [];
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const frags: React.ReactNode[] = [];
        let last = 0;
        for (const [col, m] of marks[li]) {
            if (col > last) {
                frags.push(
                    <span key={`t${col}`} style={{color: "transparent"}}>
            {line.slice(last, col)}
          </span>
                );
            }
            frags.push(
                <span
                    key={`m${col}`}
                    style={{color: m.color, opacity: m.guide ? 0.4 : 1, fontWeight: m.guide ? 400 : 600}}
                >
          {m.ch}
        </span>
            );
            last = col + 1;
        }
        if (last < line.length) {
            frags.push(
                <span key="end" style={{color: "transparent"}}>
          {line.slice(last)}
        </span>
            );
        }
        out.push(
            <React.Fragment key={`rl${li}`}>
                {li > 0 && "\n"}
                {frags}
            </React.Fragment>
        );
    }
    return out;
}

// (the 24-theme list + load/save moved to lib/code-themes.ts — shared
// with file-viewer so both bars drive the same praxis.code-theme key)


/* PERF: the memoized Prism block — the single most expensive subtree in
 * the viewer. react-syntax-highlighter re-runs the FULL tokenize
 * (Prism.highlight over the whole file) + createElement for every token
 * + one line-number span per row on EVERY render; it is not memoized
 * itself. Any parent re-render used to rebuild it — most destructively
 * the sticky-scroll handler's per-scroll-frame setState, which made
 * long "show full code" files flicker and lag while scrolling.
 * Wrapping it in React.memo with value-stable props (code string,
 * theme object from the module-constant CODE_THEMES table, primitive
 * font metrics) means those parent renders now reconcile the block in
 * O(1) — Prism only runs when the code, theme or metrics actually
 * change. */
/* UNIFORM LINE-NUMBER GUTTER — the overlay alignment fix.
 * react-syntax-highlighter sizes each line-number span as
 * max(minWidth, natural) where natural = digits + padding. With a
 * fixed 2.5em minWidth, files past line 99 (3-digit numbers — and
 * again at 1000) grew the span by ~0.4em, shifting THOSE lines'
 * code right while the spell/squiggle overlays kept ONE measured
 * left offset — the zigzag "shifted a bit, not aligned to the words"
 * on every line ≥ 100. Sizing the minWidth from the WIDEST number
 * in the file keeps every row's code column identical, so one
 * measured offset is correct for the whole file. (The math lives in
 * layout/code-overlay-engine.ts — gutterMinWidthOf.) */

/* StickyScrollHeader — the sticky-scroll bar, ISOLATED on purpose.
 *
 * The bar owns its scroll listener + its pinned-symbol state: while
 * the user scrolls, symbol crossings re-render ONLY this one-button
 * component, never the 9k-line CodeViewer around it (the previous
 * design kept that state in the viewer — every crossing re-rendered
 * every overlay/chip/minimap: 250-860 ms long tasks, ~9 fps on a
 * 3.6k-line file). The listener is passive + rAF-throttled; the
 * innermost-block resolution is the same as before (deepest indent
 * among the def/class blocks containing the first visible line, and
 * only once that header line itself has scrolled out of view — the
 * VS Code behavior). */
/* It now serves BOTH surfaces: view mode (interactive — the whole
 * bar is a jump button, exactly as before) and EDIT mode (the
 * textarea surface). The edit-mode instance passes `interactive={false}`:
 * its bar is a pure pointer-events-none presentation div so it can
 * never intercept a click meant for the textarea, never steals focus
 * (a focused button would blur the textarea and trip autoSaveOnBlur),
 * and never disturbs the caret. Geometry comes in as props — view
 * mode feeds the measured gutter offset/row height, edit mode the
 * textarea's own metrics (16px top padding, fontSize × 1.6 rows) —
 * and the symbols prop is whichever parse applies (view: `symbols`,
 * edit: the useDeferredValue-deferred `editSymbols`, so a typing
 * burst re-pins headers only on the idle pass). */

/* ── Notebook cells ── every # %% cell used to render a BARE
 * (unmemoized) <SyntaxHighlighter>, so each viewer re-render
 * re-tokenized EVERY cell's source (the cell view is the whole file).
 * React.memo with a string-only prop set means a cell only
 * re-tokenizes when its own source (or the shared style props)
 * actually change — the same pattern SimpleHighlightBlock already
 * proves for chunked rendering. */

/* ── Progressive full-code rendering ──────────────────────────────────────
 * Files past FULL_CHUNK_THRESHOLD lines render in CHUNKS of
 * FULL_CHUNK_LINES, one chunk per animation frame: the first rows
 * paint immediately, a live "Rendering N of M lines" loader covers
 * the tail, and the long Prism tokenize is spread across frames
 * instead of freezing the tab for the whole file. Chunk boundaries
 * never fall inside a triple-quoted string (the seam would
 * mis-color the docstring on both sides) — the thresholds and the
 * splitter live in lib/code-chunks.ts (pure, unit-tested). */

/* ProgressiveCodeBody — the self-driving chunked renderer.
 *
 * Owns the mounted-chunk counter so mounting a chunk re-renders ONLY
 * this body. With the counter in CodeViewerInner, every chunk mount
 * rebuilt + reconciled the ENTIRE 9k-line viewer (all overlays, chips,
 * the minimap) — measured 1.3-1.8 s long tasks PER chunk on a
 * 3.6k-line file. The body renders just the chunk blocks (each one a
 * memoized SimpleHighlightBlock) plus the in-flow tail loader, and
 * reports the render frontier up via onFrontier at mount START and
 * mount END only — the parent re-renders twice per expansion, not
 * once per chunk.
 *
 * content-visibility: auto keeps offscreen chunks out of layout +
 * paint until they scroll near, so a fully mounted long file scrolls
 * without paying for rows far outside the viewport. */

/* PERF: React.memo — the parent page re-renders on every app-level
 * state change (settings dialog, sidebar toggle, run ticks…); the
 * editor is a 390KB component and must not re-render unless its own
 * props actually change. page.tsx keeps every callback prop
 * referentially stable for this to bite. */
const CodeViewerInner = React.forwardRef<CodeViewerHandle, CodeViewerProps>(function CodeViewer({
                                                                                                    fileName,
                                                                                                    code,
                                                                                                    folderName,
                                                                                                    onOpenFolder,
                                                                                                    isOpeningFolder = false,
                                                                                                    canOpenFolder = true,
                                                                                                    onDownload,
                                                                                                    folderSlug,
                                                                                                    fileSlug,
                                                                                                    onRunCell,
                                                                                                    aiEndpoints,
                                                                                                    codeSyntaxTheme,
                                                                                                    onSaveEdit,
                                                                                                    wordWrap = false,
                                                                                                    collapsedByDefault = true,
                                                                                                    showLineNumbers = true,
                                                                                                    fontSize: baseFontSize = 13,
                                                                                                    lineHeight = 1.6,
                                                                                                    letterSpacing = 0,
                                                                                                    rainbowBrackets = false,
                                                                                                    indentWidth = 4,
                                                                                                    insertSnippet,
                                                                                                    autoSaveDelayMs = 0,
                                                                                                    indentStyle = "spaces",
                                                                                                    // ─── props ─────────────────────────────────────────────
                                                                                                    stickyScroll = false,
                                                                                                    typewriterScroll = false,
                                                                                                    indentGuides = false,
                                                                                                    rulerColumn = 0,
                                                                                                    rulerLineWidth = 1,
                                                                                                    tabSnippetExpansion = false,
                                                                                                    timingOverlay = null,
                                                                                                    onClearTiming,
                                                                                                    codeLens = true,
                                                                                                    runtimeVariables = null,
                                                                                                    showSymbolOutline = false,
                                                                                                    aiCompletionEnabled = false,
                                                                                                    diagnostics,
                                                                                                    gitDiffLines,
                                                                                                    coverageLines,
                                                                                                    showBlameGutter = false,
                                                                                                    onGenerateTests,
                                                                                                    generatingTests = false,
                                                                                                    onAiPrompt,
                                                                                                    // Run Selection in Python (editor context menu + ⌘⇧↵).
                                                                                                    onRunSelection,
                                                                                                    onRunFile,
                                                                                                    // ─── debugger integration (gutter breakpoints + stopped line) ──
                                                                                                    breakpoints,
                                                                                                    onBreakpointsChange,
                                                                                                    debugStoppedLine,
                                                                                                    codeFolding = false,
                                                                                                    showMinimap = false,
                                                                                                    webWorkerHighlighting = true,
                                                                                                    // the CONFIGURED interpreter (Settings → Python) — the
                                                                                                    // edit-mode live lint MUST run in the same environment the disk lint
                                                                                                    // uses, otherwise an interpreter without ruff returns `linter: "none"`
                                                                                                    // and its EMPTY diagnostic list replaces the visible disk zigzags
                                                                                                    // (root cause of "the zigzag disappear from the edit mode").
                                                                                                    pythonInterpreter = "",
                                                                                                    // the AI-completion debounce was hard-coded to 1000ms
                                                                                                    // while the Settings → AI → "AI completion debounce (ms)" row did
                                                                                                    // nothing. Now actually wired.
                                                                                                    aiCompletionDebounceMs = 1000,
                                                                                                    highlightCurrentLine = true,
                                                                                                    hoverSymbolTooltips: hoverSymbolTooltipsSetting = false,
                                                                                                    typeSymbols,
                                                                                                    vimMode = false,
                                                                                                    typeInlays,
                                                                                                    lineProfileHeat,
                                                                                                    coverageUncovered,
                                                                                                    showWhitespace = false,
                                                                                                    maxLineLengthHint = 0,
                                                                                                    autoSaveOnBlur = false,
                                                                                                    stickyCursorIndicator = false,
                                                                                                    onCursorPositionChange,
                                                                                                    onSelectionChange,
                                                                                                    onDirtyChange,
                                                                                                    onSnippetConsumed
                                                                                                }, ref) {
    // Count THIS render into the Perf HUD's per-panel registry (see the
    // import note up top). Placed before every hook so it fires on every
    // render of the memoized viewer — file switches, keystrokes, settings
    // changes that reach the editor's props.
    reportPanelRender("Editor");
    const {resolvedTheme} = useTheme();
    const {toast: aiToast} = useToast();
    const [expanded, setExpanded] = React.useState(!collapsedByDefault);
    const [copied, setCopied] = React.useState(false);
    const [editMode, setEditMode] = React.useState(false);
    // IDE-styled replacement for window.confirm on the
    // unsaved-changes guards. The prompt used to be the browser's NATIVE
    // confirm box
    // IDE styling") — now it is the same AlertDialog the rest of the
    // app uses (Settings reset, delete confirms…). One dialog, three
    // callers: leaving edit mode, switching files, closing a dirty
    // buffer — `confirmEditGuard` returns a promise so callers keep
    // their linear flow.
    const [editGuard, setEditGuard] = React.useState<{
        title: string;
        description: string;
        confirmLabel: string;
        resolve: (ok: boolean) => void;
    } | null>(null);
    const confirmEditGuard = React.useCallback(
        (opts: { fromFile: string; toWhat: string; action: string }) =>
            new Promise<boolean>((resolve) => {
                setEditGuard({
                    title: "Unsaved Changes",
                    description: `You have unsaved changes in "${opts.fromFile}". ${opts.action} will discard them. Continue?`,
                    confirmLabel: opts.toWhat === "view mode" ? "Switch to view mode" : `Open "${opts.toWhat}"`,
                    resolve
                });
            }),
        []
    );
    const [saving, setSaving] = React.useState(false);
    // ─── edit-mode typing performance ──────────────────
    // Root cause of "writing is too slow in the edit mode like it is
    // lagging": the syntax-highlighted backdrop (react-syntax-highlighter
    // / Prism) re-tokenized and re-rendered the ENTIRE file on EVERY
    // keystroke — measured at 8–15 s per keystroke on a 146 KB file
    // (hundreds of thousands of React elements). Fix: while the user is
    // actively typing (within `EDIT_HIGHLIGHT_HOT_MS` of the last
    // keystroke) the backdrop is a plain <pre> (a single text node —
    // cheap), and Prism re-renders only after the pause. Files above
    // `EDIT_PLAIN_MAX_CHARS` never use Prism in edit mode at all (the
    // pause-render itself would freeze the UI for seconds).
    const [highlightHot, setHighlightHot] = React.useState(false);
    const highlightHotTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [localCodeTheme, setLocalCodeTheme] = React.useState<string>("follow");
    const [mounted, setMounted] = React.useState(false);
    const [showThemePicker, setShowThemePicker] = React.useState(false);
    // the theme-picker bar now closes when the user clicks (or
    // focuses) ANYWHERE outside it, or presses Esc — previously it only
    // toggled via the palette button / the right-click item, so clicking
    // elsewhere left it dangling open ("clicking outside the code theme
    // when is toggle on, should toggle off it"). Refs mark the two
    // legitimate surfaces: the bar itself and the toolbar toggle button
    // (excluded so clicking the toggle doesn't close-then-reopen).
    const themeBarRef = React.useRef<HTMLDivElement | null>(null);
    const themeToggleRef = React.useRef<HTMLButtonElement | null>(null);
    React.useEffect(() => {
        if (!showThemePicker) return;
        const isInside = (target: Node | null): boolean =>
            !!target &&
            (themeBarRef.current?.contains(target) === true || themeToggleRef.current?.contains(target) === true);
        const onPointerDown = (e: PointerEvent) => {
            if (!isInside(e.target as Node | null)) setShowThemePicker(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                // Don't swallow Esc when a nested surface (find bar, AI popup,
                // an open dropdown) should consume it first — only when the
                // theme bar is the topmost Esc target.
                const t = e.target as HTMLElement | null;
                const inInput = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
                if (inInput && !isInside(t)) return;
                setShowThemePicker(false);
            }
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown, true);
        };
    }, [showThemePicker]);
    const [showSymbolDropdown, setShowSymbolDropdown] = React.useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");
    const [aiSuggestion, setAiSuggestion] = React.useState<string | null>(null);
    // caret offset the current suggestion was fetched
    // FOR — drives the inline ghost-text overlay. Cleared together
    // with the suggestion (any caret activity already clears both via
    // scheduleAiCompletion).
    const [aiGhostCaret, setAiGhostCaret] = React.useState<number | null>(null);
    // active snippet tabstop session. After a snippet
    // with $1/$2/… placeholders expands, Tab jumps between the ranges
    // (in order, $0 last); any other edit or Esc ends the session.
    const [activeTabstops, setActiveTabstops] = React.useState<
        { ranges: Array<{ start: number; end: number }>; active: number } | null
    >(null);
    // True while an AI completion request is in flight (during the
    // debounce window AND the fetch). Drives the "AI thinking…" chip
    // so the user gets feedback before the popup appears.
    const [aiFetching, setAiFetching] = React.useState(false);
    // True when the suggestion popup should flip to the top of the
    // editor (because the caret is near the bottom and the popup would
    // obscure the line being edited).
    const [aiPopupFlipUp, setAiPopupFlipUp] = React.useState(false);

    // In-editor find bar state.
    const [showFind, setShowFind] = React.useState(false);
    // Replace bar — toggled on by Edit → Replace… (⌘⌥F) or by clicking
    // the expand arrow on the find bar. Edit mode only (replace is
    // meaningless in read mode).
    const [showReplace, setShowReplace] = React.useState(false);
    const [replaceText, setReplaceText] = React.useState("");
    const [findText, setFindText] = React.useState("");
    // Regex toggle — when on, the find query is treated as a regex
    // pattern (e.g., `def\s+\w+\(self`). When off, literal substring
    // matching (case-insensitive).
    const [useRegex, setUseRegex] = React.useState(false);
    const [currentMatch, setCurrentMatch] = React.useState(0);
    const [totalMatches, setTotalMatches] = React.useState(0);
    const findInputRef = React.useRef<HTMLInputElement>(null);

    /* ZOOM — the union bar: the same +/- cluster every other language's
  * viewer carries, now on the Python bar too ("add the zoom + and -
  * from other languages to that bar and in python"). Scales EVERY
  * fontSize consumer — the edit textarea, the view renderer, the
  * notebook cells — and the overlay metrics re-measure from the live
  * DOM (the measurement effect depends on fontSize). Persisted at
  * praxis.codeZoom; 60%–250% in the same 1.15× steps file-viewer's
  * per-kind zoom uses. */
    const [codeZoom, setCodeZoom] = React.useState<number>(() => {
        if (typeof window === "undefined") return 1;
        try {
            const v = parseFloat(window.localStorage.getItem("praxis.codeZoom") || "1");
            return Number.isFinite(v) && v >= 0.6 && v <= 2.5 ? v : 1;
        } catch {
            return 1;
        }
    });
    React.useEffect(() => {
        try {
            window.localStorage.setItem("praxis.codeZoom", String(codeZoom));
        } catch { /* private mode */
        }
    }, [codeZoom]);
    const fontSize = Math.round(baseFontSize * codeZoom * 100) / 100;

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [editContent, setEditContent] = React.useState("");
    const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    // ─── real undo/redo history ──────────────────────────────
    // The old code relied on the browser's native textarea undo stack,
    // but every STRUCTURED edit (Enter auto-indent, Tab, auto-pair,
    // Format Document, paste-via-menu, replace-all…) rewrote
    // textarea.value programmatically — and a programmatic value write
    // CLEARS the native undo transaction queue. After the first Enter,
    // Ctrl+Z did nothing
    // editor"). We now keep our own snapshot stack: every content change
    // pushes the PREVIOUS {content, selection} (typing bursts coalesce
    // into one entry), and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y walk it.
    interface UndoSnapshot {
        content: string;
        selStart: number;
        selEnd: number;
    }

    const undoStackRef = React.useRef<UndoSnapshot[]>([]);
    const redoStackRef = React.useRef<UndoSnapshot[]>([]);
    /** Suppresses snapshot pushes while an undo/redo itself rewrites the
     *  buffer (otherwise undoing would push the undone state again). */
    const undoSuspendRef = React.useRef(false);
    /** Timestamp of the last pushed snapshot — typing bursts within
     *  UNDO_COALESCE_MS merge into a single undo step. */
    const lastEditAtRef = React.useRef(0);
    /** The last NON-coalescible edit size — used to keep structural
     *  edits (newline, format, paste) as separate undo steps even when
     *  they happen right after typing. */
    const UNDO_COALESCE_MS = 600;
    const UNDO_STACK_MAX = 300;
    /** the selection as of the last right-click — the Radix
     * context menu moves focus to itself, which can visually clear the
     * textarea's blue selection highlight (and on WebKit clears
     * selectionStart/End entirely). Stashing it on contextmenu lets
     * "Run Selection in Python" / Cut / Copy use the selection the
     * user RIGHT-CLICKED ON. */
    const savedSelectionRef = React.useRef<{ start: number; end: number } | null>(null);
    // Ref-stash for handleCopyAsMarkdown (declared below the imperative
    // handle — the handle reads it through this ref so declaration order
    // never matters, same pattern as the other stashed methods).
    const handleCopyAsMarkdownRef = React.useRef<(text: string) => Promise<void>>(async () => {
    });
    /** while the context menu is OPEN, a phantom blue
     *  overlay paints the stashed range in the highlight backdrop (an
     *  unfocused textarea paints no selection). Cleared on menu close,
     *  where focus + the real selection are restored. */
    const [menuSelection, setMenuSelection] = React.useState<{ start: number; end: number } | null>(null);
    const clearUndoHistory = React.useCallback(() => {
        undoStackRef.current = [];
        redoStackRef.current = [];
        lastEditAtRef.current = 0;
    }, []);
    const aiDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const aiRequestSeqRef = React.useRef(0);
    // AbortController for the in-flight completion fetch — lets us
    // truly cancel stale requests (the seq counter only ignores their
    // results, but the requests themselves keep running server-side).
    const aiAbortRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        setLocalCodeTheme(loadCodeTheme());
        setMounted(true);
    }, []);

    const isDark = resolvedTheme === "dark";
    const effectiveThemeId = mounted && localCodeTheme !== "follow"
        ? localCodeTheme
        : (codeSyntaxTheme && codeSyntaxTheme !== "follow" ? codeSyntaxTheme : "follow");

    const themeEntry = CODE_THEMES.find((t) => t.id === effectiveThemeId) ??
        (isDark ? CODE_THEMES[1] : CODE_THEMES[2]);
    // codeBg — the "follow" entry's bg is a PLACEHOLDER grey (the
    // picker swatch), never a paintable surface: follow resolves by the
    // app's family (One Dark / One Light) through codeBgFor. Without
    // this, the editor + its fill-below-last-line painted #808080.
    const codeBg = codeBgFor(themeEntry, isDark);
    const rsStyle = themeEntry.rsStyle;

    // ─── live diagnostics (ruff + pyright) ───────────
    // The disk-based `diagnostics` prop goes STALE the moment the buffer
    // edits ("the zigzag is not updated but moves to the next line").
    // Since the Phase 3 extraction the machinery lives in TWO hooks:
    // useLiveLintDiagnostics re-lints the edit BUFFER (debounced 700 ms
    // through /api/lint's content mode — the ruff half), and usePyrightLsp
    // runs the Pyright sidecar session (typed hovers, F12/⇧F12/F2 and
    // the TYPE-error half). Both merge below; when pyright is not
    // installed every LSP surface degrades to the previous behavior.
    const liveDiagnostics = useLiveLintDiagnostics({
        editMode,
        diagnostics,
        folderSlug: folderSlug ?? "",
        fileSlug: fileSlug ?? "",
        editContent,
        pythonInterpreter
    });
    // The Pyright session — only for Python buffers with a file identity
    // (the same .py/.pyw test isPythonFile applies further down; declared
    // locally because the hook call precedes that binding).
    const lspIsPythonBuffer = !!folderSlug && !!fileSlug && /\.(py|pyw)$/i.test(fileName ?? "");
    const lsp = usePyrightLsp({
        enabled: lspIsPythonBuffer,
        folderSlug: folderSlug ?? "",
        fileSlug: fileSlug ?? "",
        content: editMode ? editContent : code,
        interpreter: pythonInterpreter,
    });
    // Ref mirror so the (identity-churning) session object never lands in
    // a dependency array — every callback below reads it fresh instead.
    const lspRef = React.useRef(lsp);
    lspRef.current = lsp;
    // The diagnostics the editor should SHOW right now: live buffer
    // results while editing, the disk-based prop otherwise — plus the
    // pyright type rows in BOTH modes (deduped by line + message).
    const shownDiagnostics = mergeLspDiagnostics(editMode ? (liveDiagnostics ?? diagnostics) : diagnostics, lsp.diagnostics);
    // Ref mirror so the imperative handle (recreated only when its own
    // deps change) can read the LIVE list instead of a stale closure.
    const liveDiagnosticsRef = React.useRef<Diagnostic[] | null>(null);
    React.useEffect(() => {
        liveDiagnosticsRef.current = liveDiagnostics;
    }, [liveDiagnostics]);

    // counts for the header chip (lines + zigzags).
    const diagCounts = React.useMemo(() => {
        const list = shownDiagnostics ?? [];
        const errors = list.filter((d) => d.severity === "error").length;
        const warnings = list.filter((d) => d.severity === "warning").length;
        return {total: list.length, errors, warnings};
    }, [shownDiagnostics]);

    // ─── spell check — COMMENTS AND STRINGS ONLY ──
    // The Python editor was the ONE kind with no spell marks. The
    // /api/spell results are gated by the comment/string scanner
    // (lib/spell-spans) so code identifiers never squiggle — only the
    // prose inside `# comments` and string literals does. In EDIT mode
    // the marks are the same wavy-underline divs the diagnostics use
    // (inside the squiggle wrapper, scroll-synced); in VIEW mode they
    // are the file-viewer's transparent-text chips (SpellWordSpan —
    // click for the add-to-dictionary popover).
    const [spellIssues, setSpellIssues] = React.useState<Array<{ word: string; line: number; col: number }>>([]);
    const [spellChecking, setSpellChecking] = React.useState(false);
    // Toggle lag fix the settings dialog's save broadcasts
    // `praxis:settings-saved`; the nonce below forces a re-read of
    // loadSettings().spellCheck on the NEXT render, so flipping the
    // toggle takes effect without a file switch or remount.
    const [spellSettingsNonce, setSpellSettingsNonce] = React.useState(0);
    React.useEffect(() => {
        const onSaved = () => setSpellSettingsNonce((n) => n + 1);
        window.addEventListener("praxis:settings-saved", onSaved);
        return () => window.removeEventListener("praxis:settings-saved", onSaved);
    }, []);
    const spellEnabled = React.useMemo(() => {
        void spellSettingsNonce; // the nonce is a re-read trigger only
        try {
            return !!loadSettings().spellCheck;
        } catch {
            return false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spellSettingsNonce, folderSlug, fileSlug]);

    // Sequence guard a monotonic request id — a response
    // whose id is not the latest is a STALE answer (the user kept
    // typing / switched files after it left) and must never touch the
    // state, otherwise old results flicker over the new ones.
    const spellSeqRef = React.useRef(0);
    const runSpellCheck = React.useCallback((text: string) => {
        const seq = ++spellSeqRef.current;
        if (!text.trim()) {
            setSpellIssues([]);
            setSpellChecking(false);
            return;
        }
        setSpellChecking(true);
        fetch("/api/spell", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "check", text, kind: "python", dict: loadSettings().spellLanguage})
        })
            .then((r) => r.json())
            .then((d: { misspelled?: Array<{ word: string; line: number; col: number }> }) => {
                if (spellSeqRef.current !== seq) return; // stale — drop it
                const raw = Array.isArray(d.misspelled) ? d.misspelled : [];
                // Two gates, both pure: keep only issues inside comment/string
                // spans (Python prose), then drop markup keywords.
                setSpellIssues(filterMarkupSpellIssues(spellIssuesInPyProse(raw, text)));
            })
            .catch(() => {
                if (spellSeqRef.current === seq) setSpellIssues([]);
            })
            .finally(() => {
                if (spellSeqRef.current === seq) setSpellChecking(false);
            });
    }, []);

    // Debounced re-check on the LIVE buffer — the edit text while
    // editing, the disk text otherwise. 500 ms matches the file viewer.
    React.useEffect(() => {
        if (!spellEnabled) {
            setSpellIssues([]);
            return;
        }
        const source = editMode ? editContent : code;
        const t = setTimeout(() => runSpellCheck(source), 500);
        return () => clearTimeout(t);
    }, [spellEnabled, editMode, editContent, code, runSpellCheck]);
    // File switch: drop the marks immediately (the debounce would let
    // the previous file's zigzags ride the new file for half a second).
    React.useEffect(() => {
        setSpellIssues([]);
    }, [folderSlug, fileSlug]);

    /** Add-to-dictionary + instant local clear (same flow the file
     * viewer's ignoreSpellWord uses — the popover lives in SpellWordSpan).
     *
     *  CTRL+Z UNDO: the add records a one-shot undo entry — the word,
     *  the pre-filter zigzag list and the buffer AT ADD TIME. The
     *  editor's Ctrl+Z handler consults it FIRST: while the buffer is
     *  unchanged since the add, Ctrl+Z removes the word from the
     *  project dictionary again and RESTORES the zigzag. Any text edit
     *  after the add makes the native undo stack win instead. */
    const dictUndoRef = React.useRef<{
        word: string;
        issues: Array<{ word: string; line: number; col: number }>;
        buffer: string;
    } | null>(null);
    const ignoreSpellWord = React.useCallback((word: string) => {
        dictUndoRef.current = {
            word,
            issues: spellIssues,
            buffer: editModeRef.current ? editContentRef.current : code
        };
        fetch("/api/spell", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "ignore", word})
        })
            .then(() => {
                setSpellIssues((prev) => prev.filter((i) => i.word.toLowerCase() !== word.toLowerCase()));
            })
            .catch(() => {
                dictUndoRef.current = null;
            });
    }, [spellIssues, code]);

    /** One-shot Ctrl+Z for a dictionary add — true when it consumed the
     *  key (word removed server-side + zigzag restored). False → the
     *  caller falls through to the native undo. */
    const undoDictionaryAdd = React.useCallback(() => {
        const entry = dictUndoRef.current;
        if (!entry) return false;
        const current = editModeRef.current ? editContentRef.current : code;
        if (current !== entry.buffer) {
            dictUndoRef.current = null; // stale — text was edited since
            return false;
        }
        dictUndoRef.current = null;
        fetch("/api/spell", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "remove", word: entry.word})
        })
            .then(() => {
                // Restore the exact zigzag list from before the add.
                setSpellIssues(entry.issues);
            })
            .catch(() => undefined);
        return true;
    }, [code]);

    /** Apply a spell replacement to the buffer and hand it to the
     *  editor. EDIT mode: an explicit undo snapshot of the current
     *  buffer is pushed (a bare setEditContent used to skip the undo
     *  stack, so Ctrl+Z after a spell replace silently did nothing),
     *  then the change flows through handleEditChange so autosave,
     *  diagnostics and the AI scheduler all see it. VIEW mode: the
     *  editor is ENTERED with the corrected buffer (the same
     *  switch-then-apply flow Format Document uses) — the original
     *  disk text sits on the undo stack, so Ctrl+Z reverts the replace
     *  and ⌘S persists it. */
    const applySpellReplacement = React.useCallback(
        (next: string, selStart: number) => {
            if (editModeRef.current) {
                const prev = editContentRef.current;
                const ta = textareaRef.current;
                undoStackRef.current.push({
                    content: prev,
                    selStart: ta ? ta.selectionStart : 0,
                    selEnd: ta ? ta.selectionEnd : 0
                });
                if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
                redoStackRef.current = [];
                undoSuspendRef.current = true;
                try {
                    handleEditChangeRef.current(next);
                } finally {
                    requestAnimationFrame(() => {
                        undoSuspendRef.current = false;
                        const t = textareaRef.current;
                        if (t) {
                            const at = Math.min(selStart, t.value.length);
                            t.setSelectionRange(at, at);
                        }
                    });
                }
                return;
            }
            // View mode → enter the editor with the corrected buffer, the
            // ORIGINAL on the undo stack (mirrors formatDocumentFn).
            const source = sourceRef.current ?? "";
            setEditContent(source);
            setEditMode(true);
            clearUndoHistory();
            undoStackRef.current.push({content: source, selStart: 0, selEnd: 0});
            if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
            redoStackRef.current = [];
            undoSuspendRef.current = true;
            try {
                handleEditChangeRef.current(next);
            } finally {
                requestAnimationFrame(() => {
                    undoSuspendRef.current = false;
                    const t = textareaRef.current;
                    if (t) {
                        const at = Math.min(selStart, t.value.length);
                        t.setSelectionRange(at, at);
                    }
                });
            }
            // The editor now holds the corrected buffer — re-check at once.
            spellRecheckNowRef.current?.();
        },
        [clearUndoHistory]
    );

    /** Replace-in-place (the suggestion popover's Replace button): swap
     *  EVERY word-boundary occurrence of the misspelling for the picked
     *  suggestion — capitalization preserved ("Helo" → "Hello"). From
     *  view mode this now SWITCHES TO EDIT MODE with the corrected
     *  buffer (Ctrl+Z undoes; ⌘S saves) instead of writing straight to
     *  disk. */
    const replaceSpellWord = React.useCallback(
        (word: string, suggestion: string) => {
            const source = editModeRef.current ? editContentRef.current : (sourceRef.current ?? "");
            if (!source) return;
            const next = replaceWordEverywhere(source, word, suggestion);
            if (next === source) return;
            applySpellReplacement(next, source.indexOf(word) >= 0 ? source.indexOf(word) + suggestion.length : 0);
            aiToast({
                title: editModeRef.current ? "Replaced" : "Replaced — edit mode",
                description: `Every “${word}” → “${suggestion}”${editModeRef.current ? "." : ". Ctrl+Z undoes; ⌘S saves."}`,
                variant: "success"
            });
        },
        [applySpellReplacement, aiToast]
    );

    /** Absolute character offset of a 1-based (line, col) inside
     *  `buf` — clamped to the buffer length. */
    const offsetOfLineCol = React.useCallback((buf: string, line: number, col: number): number => {
        if (line < 1) return Math.max(0, col - 1);
        const ls = buf.split("\n");
        if (line > ls.length) return buf.length;
        let off = 0;
        for (let i = 0; i < line - 1; i++) off += (ls[i] ?? "").length + 1;
        return Math.min(buf.length, off + Math.max(0, col - 1));
    }, []);

    /** Replace-in-PLACE (the suggestion popover's third button): swap
     *  ONLY the clicked occurrence of the misspelling — every other
     *  “word” in the buffer stays exactly as typed. Capitalization of
     *  the clicked occurrence is preserved. */
    const replaceSpellWordAt = React.useCallback(
        (word: string, suggestion: string, line: number, col: number) => {
            const source = editModeRef.current ? editContentRef.current : (sourceRef.current ?? "");
            if (!source) return;
            const start = offsetOfLineCol(source, line, col);
            // Guard: the buffer may have shifted since the check ran — only
            // replace when the flagged span really holds the misspelling.
            if (source.slice(start, start + word.length) !== word) {
                // Fall back to the everywhere-replace (still one undo step).
                replaceSpellWord(word, suggestion);
                return;
            }
            const cap = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
            const replacement = cap && suggestion ? suggestion[0].toUpperCase() + suggestion.slice(1) : suggestion;
            const next = source.slice(0, start) + replacement + source.slice(start + word.length);
            applySpellReplacement(next, start + replacement.length);
            aiToast({
                title: editModeRef.current ? "Replaced in place" : "Replaced in place — edit mode",
                description: `This “${word}” → “${replacement}”${editModeRef.current ? "." : ". Ctrl+Z undoes; ⌘S saves."}`,
                variant: "success"
            });
        },
        [offsetOfLineCol, replaceSpellWord, applySpellReplacement, aiToast]
    );

    /** Immediate re-check format-on-save / Format Document /
     *  auto-indent rewrite the buffer in one shot — the stale marks
     *  would otherwise persist for the 500 ms debounce. Reads the LIVE
     *  source through the refs so the callers keep empty deps arrays. */
    const spellRecheckNowRef = React.useRef<() => void>(() => {
    });
    React.useEffect(() => {
        spellRecheckNowRef.current = () => {
            if (!spellEnabled) return;
            runSpellCheck(editModeRef.current ? editContentRef.current : (sourceRef.current ?? ""));
        };
    }, [spellEnabled, runSpellCheck]);

    // hovered diagnostic tooltip (edit mode). The squiggle
    // overlay is pointer-events-none so it can never show a native title;
    // instead the textarea's own mousemove maps the caret cell to a
    // squiggle rect and we render a floating tooltip beside the cursor.
    const [hoveredDiag, setHoveredDiag] = React.useState<{ message: string; x: number; y: number } | null>(null);
    const hideHoveredDiag = React.useCallback(() => setHoveredDiag(null), []);

    const cells = React.useMemo(() => parseCells(code), [code]);
    const hasCells = cells.length > 1 || (cells.length === 1 && cells[0].startLine > 1);
    // PERF: memoized on `code` — a bare split re-allocated the whole
    // line array on EVERY render (including every edit-mode keystroke,
    // which re-renders this component through editContent), defeating
    // every downstream useMemo that lists `lines` in its deps (fresh
    // array identity → viewRowPrefix / wrapped-row recompute per key).
    const lines = React.useMemo(() => code.split("\n"), [code]);
    const symbols = React.useMemo<PythonSymbol[]>(() => parsePythonSymbols(code), [code]);


    // Code folding state — which symbol blocks are collapsed.
    // viewFindMatches now matches against the RENDERED rows
    // (visibleCode), so the fold filter has to be computed first.
    const [foldedSymbols, setFoldedSymbols] = React.useState<Set<number>>(new Set());

    // ─── fold memory (per-file persistence) ───────────────
    // Fold state used to survive FILE SWITCHES (it was keyed only by
    // symbol LINE, so folder B's lines folded like folder A's) and
    // never persisted. Now every file gets its own localStorage slot
    // (`praxis-folded.<folder>.<file>`), folds reload on open, and the
    // state resets when the file changes.
    const foldKey = React.useMemo(
        () =>
            folderSlug && fileSlug
                ? `${STORAGE_PREFIX}-folded.${folderSlug}.${fileSlug}`
                : null,
        [folderSlug, fileSlug]
    );
    React.useEffect(() => {
        // File changed (or first mount): reset, then re-apply this file's
        // saved folds. Saved entries are validated against the CURRENT
        // symbol lines so an edited file never folds phantom ranges.
        if (!foldKey) {
            setFoldedSymbols(new Set());
            return;
        }
        let saved: number[] = [];
        try {
            const raw = window.localStorage.getItem(foldKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
                    saved = parsed;
                }
            }
        } catch {
            /* malformed — start clean */
        }
        const validLines = new Set(symbols.map((s) => s.line));
        setFoldedSymbols(new Set(saved.filter((n) => validLines.has(n))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [foldKey]);
    React.useEffect(() => {
        if (!foldKey) return;
        try {
            window.localStorage.setItem(foldKey, JSON.stringify([...foldedSymbols]));
        } catch {
            /* quota — ignore */
        }
    }, [foldedSymbols, foldKey]);

    // ─── Tab snippet expansion ────────────────────────────
    // Built-in triggers + the /api/snippets library (loaded once
    // per mount; the palette's CRUD writes land on the next open).
    const [userSnippets, setUserSnippets] = React.useState<Record<string, string>>({});
    React.useEffect(() => {
        let cancelled = false;
        fetch("/api/snippets")
            .then((r) => r.json())
            .then((d: { snippets?: Array<{ name?: string; content?: string }> }) => {
                if (cancelled || !Array.isArray(d.snippets)) return;
                const map: Record<string, string> = {};
                for (const s of d.snippets) {
                    if (s?.name && typeof s.content === "string") {
                        map[s.name.toLowerCase()] = s.content;
                    }
                }
                setUserSnippets(map);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);
    /* ─── built-in Tab-expansion snippets ────────────────────
* Triggers typed immediately before pressing Tab. Merged UNDER the
* user's /api/snippets library (user snippets win on collision). */
    const BUILTIN_TAB_SNIPPETS: Record<string, string> = {
        def: "def functionName(args):\n    \"\"\"TODO: describe.\"\"\"\n    pass\n",
        class: "class ClassName:\n    \"\"\"TODO: describe.\"\"\"\n\n    def __init__(self):\n        pass\n",
        main: "if __name__ == \"__main__\":\n    main()\n",
        ifmain: "if __name__ == \"__main__\":\n    main()\n",
        try: "try:\n    ...\nexcept Exception as e:\n    print(f\"error: {e}\")\n",
        with: "with open(\"file.txt\", encoding=\"utf-8\") as f:\n    text = f.read()\n",
        dataclass: "from dataclasses import dataclass\n\n@dataclass\nclass Config:\n    name: str\n    value: float = 0.0\n",
        test: "def test_something():\n    assert True\n",
        plot: "import matplotlib.pyplot as plt\n\nfig, ax = plt.subplots()\nax.plot(x, y)\nplt.show()\n",
        todo: "# TODO: \n",
        fixme: "# FIXME: \n"
    };

    const snippetMap = React.useMemo(
        () => ({...BUILTIN_TAB_SNIPPETS, ...userSnippets}),
        [userSnippets]
    );

    // ─── # %% cells of the EDIT buffer (for Alt+Enter run-cell
    // in edit mode — routed through onRunSelection so the edited buffer,
    // not the on-disk copy, is what runs).
    const editCells = React.useMemo(
        () => (editMode ? parseCells(editContent) : []),

        [editMode, editContent]
    );

    // Build the code to show, optionally hiding folded blocks (the
    // fold-to-view math lives in lib/fold-view.ts — pure, unit-tested).
    const visibleCode = React.useMemo(
        () => buildFoldedView(code, symbols, foldedSymbols, codeFolding),
        [code, codeFolding, foldedSymbols, symbols]
    );

    // ─── Edit-mode code folding ─────────────────────────────────────
    // View-mode folding hides the folded lines from `visibleCode` (easy —
    // read-only rendering). A textarea can't collapse lines without
    // corrupting edits, so edit-mode folding is PRESENTATIONAL: the folded
    // block's body is covered by an opaque overlay box (click to expand)
    // and its line numbers dim. The underlying text is untouched — there is
    // no way to lose code.
    //
    // Fold KEY strategy (user-reported React error: "two children with
    // the same key `efold-else-else:`"): block statements like `else:`
    // and `try:` repeat within one file, so `type:name` is NOT unique —
    // folding one `else:` used to fold them all. Folds are keyed by
    // `type:name` when that name is unique among same-type symbols (so
    // a fold survives edits that shift lines above it), and
    // disambiguated with the line number when it repeats:
    // `else:else:#42`. The chevron's React key is the same string —
    // unique by construction.
    const [editFoldedKeys, setEditFoldedKeys] = React.useState<Set<string>>(new Set());
    // the symbol scan is deferred off the keystroke path —
    // parsePythonSymbols regex-scans every line (measurable on 1,000+ line
    // buffers) and the outline/fold data tolerates landing a beat late.
    // useDeferredValue keeps the textarea on the immediate value while
    // the derived work renders at lower priority.
    const deferredEditContent = React.useDeferredValue(editContent);
    const editSymbols = React.useMemo<PythonSymbol[]>(
        () => parsePythonSymbols(deferredEditContent),
        [deferredEditContent]
    );
    // signature help resolves the callee against the
    // EDIT buffer's symbols (the view-mode `symbols` parse lags).
    const editSymbolsRef = React.useRef<PythonSymbol[]>(editSymbols);
    React.useEffect(() => {
        editSymbolsRef.current = editSymbols;
    }, [editSymbols]);
    /** type:name combos that appear more than once — their folds get a
     * `#line` suffix so each occurrence folds independently. */
    const repeatedFoldNames = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of editSymbols) {
            const base = `${s.type}:${s.name}`;
            counts.set(base, (counts.get(base) ?? 0) + 1);
        }
        return new Set(
            [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k)
        );
    }, [editSymbols]);
    /** Stable, unique fold key for a symbol (see strategy note above). */
    const foldKeyOf = React.useCallback(
        (sym: PythonSymbol) =>
            repeatedFoldNames.has(`${sym.type}:${sym.name}`)
                ? `${sym.type}:${sym.name}#${sym.line}`
                : `${sym.type}:${sym.name}`,
        [repeatedFoldNames]
    );
    const foldedEditSymbols = React.useMemo(
        () => editSymbols.filter((s) => editFoldedKeys.has(foldKeyOf(s))),
        [editSymbols, editFoldedKeys, foldKeyOf]
    );
    /** Line numbers covered by a fold — used to dim the gutter numbers so
     *  the collapsed span reads as one hidden block. */
    const editFoldedLineNumbers = React.useMemo(() => {
        const set = new Set<number>();
        const total = editContent.split("\n").length;
        for (const sym of foldedEditSymbols) {
            for (let ln = sym.line + 1; ln <= Math.min(sym.endLine ?? sym.line, total); ln++) {
                set.add(ln);
            }
        }
        return set;
    }, [foldedEditSymbols, editContent]);
    // Folds are per-file — opening another file must not carry them over
    // (the same symbol name in a different file would inherit a stale
    // fold). Reset via the render-phase "adjust state when a prop
    // changes" pattern (rather than an effect, which would cascade an
    // extra render). Keyed on file identity, NOT on `code` (saving keeps
    // the folds, which is the desired behavior).
    const [foldFileKey, setFoldFileKey] = React.useState(`${folderSlug}/${fileSlug}`);
    if (foldFileKey !== `${folderSlug}/${fileSlug}`) {
        setFoldFileKey(`${folderSlug}/${fileSlug}`);
        setEditFoldedKeys(new Set());
    }
    const toggleEditFold = React.useCallback(
        (sym: PythonSymbol) => {
            const key = foldKeyOf(sym);
            // A user fold action — schedules the persisted fold state.
            foldMutatedRef.current = true;
            setEditFoldedKeys((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
        },
        [foldKeyOf]
    );
    /** Unfold any block the caret enters so typing never happens beneath
     * the overlay (the user would see their keystrokes "vanish"). Called
     * from the textarea's onSelect, which fires on every caret move. */
    const unfoldAroundCaret = React.useCallback(
        (line: number) => {
            setEditFoldedKeys((prev) => {
                if (prev.size === 0) return prev;
                let changed = false;
                const next = new Set(prev);
                for (const sym of editSymbols) {
                    const key = foldKeyOf(sym);
                    if (!next.has(key)) continue;
                    if (line > sym.line && line <= (sym.endLine ?? sym.line)) {
                        next.delete(key);
                        changed = true;
                    }
                }
                if (changed) {
                    // The caret entered a folded block — the auto-unfold is a
                    // user-caused fold change, so persist it too.
                    foldMutatedRef.current = true;
                    return next;
                }
                return prev;
            });
        },
        [editSymbols, foldKeyOf]
    );
    // ─── fold persistence (folds survive reload) ───────────────────────
    // Persisted per stable file id ("folderSlug/fileSlug") into
    // localStorage "praxis.fold-state" — an LRU-capped map (≤ 50 files,
    // lib/fold-state.ts). Three pieces:
    //   1. foldMutatedRef — only USER fold actions schedule writes, so
    //      the file-switch reset (which clears the set in render phase)
    //      and the restore effect below can never clobber the stored
    //      state with an incidental empty/loaded set.
    //   2. the save effect — debounced (FOLD_SAVE_DEBOUNCE_MS), latest
    //      value wins, snapshots what a pending write was for.
    //   3. the restore effect — runs on mount + every file switch and
    //      adopts the persisted key set (stale keys simply match no
    //      symbol and do nothing).
    const foldMutatedRef = React.useRef(false);
    const foldSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    /** The pending write's payload (file id + keys) — flushed by the
     *  unmount / file-switch cleanup when the debounce is still armed. */
    const foldPersistSnapRef = React.useRef<{ fileId: string; keys: string[] } | null>(null);
    React.useEffect(() => {
        if (!foldMutatedRef.current) return;
        foldMutatedRef.current = false;
        if (foldSaveTimerRef.current) clearTimeout(foldSaveTimerRef.current);
        const fileId = foldFileKey;
        const keys = [...editFoldedKeys];
        foldPersistSnapRef.current = {fileId, keys};
        foldSaveTimerRef.current = setTimeout(() => {
            foldSaveTimerRef.current = null;
            saveFoldState(fileId, keys);
            foldPersistSnapRef.current = null;
        }, FOLD_SAVE_DEBOUNCE_MS);
    }, [editFoldedKeys, foldFileKey]);
    // Restore on mount + every file switch. The render-phase reset above
    // clears stale folds instantly; this adopts the persisted set one
    // commit later (no fold ever "flashes" — empty → restored in the
    // same task, before paint of the second commit).
    React.useEffect(() => {
        const restored = restoreFoldKeys(foldFileKey);
        setEditFoldedKeys(restored.length > 0 ? new Set(restored) : new Set());
    }, [foldFileKey]);
    // Flush a still-pending debounced write when the file switches away
    // (or the viewer unmounts) so the last fold action isn't lost.
    React.useEffect(() => {
        return () => {
            if (foldSaveTimerRef.current) {
                clearTimeout(foldSaveTimerRef.current);
                foldSaveTimerRef.current = null;
                const snap = foldPersistSnapRef.current;
                if (snap) {
                    foldPersistSnapRef.current = null;
                    saveFoldState(snap.fileId, snap.keys);
                }
            }
        };
    }, [foldFileKey]);
    // ─── debugger gutter breakpoints ──────────────────────────────────
    // Clicking the gutter's reserved left strip toggles a red-dot
    // breakpoint (Python files only; see the gutter JSX for the x-offset
    // hit-test). The set is kept across file switches — mirroring the
    // Diagnostics panel's long-standing "breakpoints survive file
    // selection" behavior (line numbers are stable enough that users
    // expect the list to persist). Semi-controlled via the `breakpoints`
    // prop (contents-diff adoption — see the props comment).
    const isPythonFile = /\.(py|pyw)$/i.test(fileName);
    const [gutterBreakpoints, setGutterBreakpoints] = React.useState<number[]>(() =>
        sanitizeBreakpointList(breakpoints)
    );
    /** The last ADOPTED prop contents — a re-render with the same
     *  contents never re-adopts (that would fight internal toggles). */
    const breakpointSeedKeyRef = React.useRef(breakpointListKey(breakpoints));
    React.useEffect(() => {
        const propKey = breakpointListKey(breakpoints);
        if (propKey === breakpointSeedKeyRef.current) return;
        breakpointSeedKeyRef.current = propKey;
        if (propKey !== breakpointListKey(gutterBreakpoints)) {
            setGutterBreakpoints(sanitizeBreakpointList(breakpoints));
        }
    }, [breakpoints]); // eslint-disable-line react-hooks/exhaustive-deps
    /** The EFFECTIVE list — internal state (prop only seeds/steers). */
    const activeBreakpoints = gutterBreakpoints;
    const activeBreakpointsRef = React.useRef(activeBreakpoints);
    activeBreakpointsRef.current = activeBreakpoints;
    const onBreakpointsChangeRef = React.useRef(onBreakpointsChange);
    React.useEffect(() => {
        onBreakpointsChangeRef.current = onBreakpointsChange;
    }, [onBreakpointsChange]);
    const toggleBreakpointAt = React.useCallback(
        (line: number) => {
            if (!Number.isInteger(line) || line < 1) return;
            const cur = activeBreakpointsRef.current;
            const next = cur.includes(line)
                ? cur.filter((l) => l !== line)
                : [...cur, line].sort((a, b) => a - b);
            setGutterBreakpoints(next);
            onBreakpointsChangeRef.current?.(next);
            // The Diagnostics panel's debug tab listens for this (matching
            // on the file identity) — gutter dots drive debug runs with ZERO
            // page wiring.
            window.dispatchEvent(
                new CustomEvent("praxis:breakpoints-changed", {
                    detail: {
                        folderSlug: folderSlug ?? "",
                        fileSlug: fileSlug ?? "",
                        breakpoints: next
                    }
                })
            );
        },
        [folderSlug, fileSlug]
    );
    /** Panel-initiated pull: reply with the current set (mount / file
     *  switch handshake with the Diagnostics panel). */
    React.useEffect(() => {
        const onBreakpointsRequest = () => {
            window.dispatchEvent(
                new CustomEvent("praxis:breakpoints-changed", {
                    detail: {
                        folderSlug: folderSlug ?? "",
                        fileSlug: fileSlug ?? "",
                        breakpoints: activeBreakpointsRef.current
                    }
                })
            );
        };
        window.addEventListener("praxis:breakpoints-request", onBreakpointsRequest);
        return () => window.removeEventListener("praxis:breakpoints-request", onBreakpointsRequest);
    }, [folderSlug, fileSlug]);
    // ─── the debugger's stopped-line highlight ────────────────────────
    // Two feeds, explicit prop first, zero-wiring event second (the
    // Diagnostics panel emits praxis:debug-stopped-line with the file
    // identity; events for OTHER files are ignored, and line:null clears).
    const [stoppedLineEvent, setStoppedLineEvent] = React.useState<number | null>(null);
    React.useEffect(() => {
        const onDebugStopped = (e: Event) => {
            const d = (e as CustomEvent).detail as
                | { line?: number | null; folderSlug?: string; fileSlug?: string }
                | undefined;
            if (!d) return;
            // Identity gate: only markers for THIS file paint here. Events
            // without identity fields are applied leniently (the panel always
            // sends them; a future producer may not).
            if (
                (typeof d.folderSlug === "string" || typeof d.fileSlug === "string") &&
                (d.folderSlug !== folderSlug || d.fileSlug !== fileSlug)
            ) {
                return;
            }
            setStoppedLineEvent(
                typeof d.line === "number" && d.line >= 1 ? d.line : null
            );
        };
        window.addEventListener("praxis:debug-stopped-line", onDebugStopped);
        return () => window.removeEventListener("praxis:debug-stopped-line", onDebugStopped);
    }, [folderSlug, fileSlug]);
    // A stop highlight from file A must never paint file B — clear on
    // file switch (render-phase reset, same pattern as the fold keys).
    const [stoppedLineFileKey, setStoppedLineFileKey] = React.useState(`${folderSlug}/${fileSlug}`);
    if (stoppedLineFileKey !== `${folderSlug}/${fileSlug}`) {
        setStoppedLineFileKey(`${folderSlug}/${fileSlug}`);
        setStoppedLineEvent(null);
    }
    const stoppedLine =
        typeof debugStoppedLine === "number" && debugStoppedLine >= 1
            ? debugStoppedLine
            : stoppedLineEvent;
    // Edit-mode line metrics — must mirror the textarea exactly:
    // paddingTop 16px (1rem) and lineHeight 1.6 × fontSize. Same formula
    // the edit-mode squiggle overlay uses (see the squiggle block).
    const EDIT_LINE_HEIGHT = fontSize * 1.6;
    // the string the Tab key / Enter auto-indent inserts —
    // one literal tab or `indentWidth` spaces, per Settings → Editor →
    // Indentation.
    const indentUnit = indentStyle === "tab" ? "\t" : " ".repeat(Math.max(1, Math.min(8, indentWidth)));
    // Edit-mode soft-wrap column state — the textarea's wrap
    // width in COLUMNS (Infinity while unwrapped). The layout effect
    // near measuredCharWidth measures it; editRowPrefix below consumes.
    const [editWrapCols, setEditWrapCols] = React.useState<number>(Infinity);
    // ─── edit-mode soft-wrap geometry ─────────────
    // The textarea wraps at white-space: pre-wrap when wordWrap is on;
    // the spell underlines must land on the VISUAL row. wrapCols is
    // measured from the textarea's clientWidth ÷ the measured glyph
    // width (padding 1rem on both sides). The tab size is the textarea's
    // own CSS tab-size (indentWidth — see the style below).

    // ─── true multi-caret editing ────────────────────────────
    // Extra selections BEYOND the textarea's native one; the full caret
    // set is [native, ...extraCarets]. Ctrl+D pushes the current
    // selection in and moves the native one to the next occurrence of
    // the selected text; typing / Enter / Backspace / Delete / auto-pair
    // then apply at EVERY caret (per-caret document.execCommand, applied
    // descending so lower offsets stay valid — which also keeps the
    // browser's native undo stack working).
    const [extraCarets, setExtraCarets] = React.useState<
        Array<{ start: number; end: number }>
    >([]);
    const extraCaretsRef = React.useRef(extraCarets);
    React.useEffect(() => {
        extraCaretsRef.current = extraCarets;
    }, [extraCarets]);
    // Carets never survive a mode/file switch.
    React.useEffect(() => {
        if (!editMode) setExtraCarets([]);
    }, [editMode]);
    React.useEffect(() => {
        setExtraCarets([]);
    }, [folderSlug, fileSlug]);

    // ─── OFFLINE PYTHON COMPLETION POPUP (LSP-grade) ────────────────
    // Fuzzy+ranked candidates from the upgraded completion provider:
    // snippets → keywords → locals → builtins (with signature/doc
    // context) → auto-import modules → document words. Tab/Enter insert
    // the suffix; a module candidate also splices its import in.
    interface PyCompletionState {
        items: Array<{
            label: string;
            insertText?: string;
            detail?: string;
            documentation?: string;
            importModule?: string;
            matchSpans?: Array<{ start: number; end: number }>
        }>;
        active: number;
        prefix: string;
        caret: number;
        top: number;
        left: number;
    }

    const [pyCompletion, setPyCompletion] = React.useState<PyCompletionState | null>(null);
    const pyCompletionRef = React.useRef<PyCompletionState | null>(null);
    React.useEffect(() => {
        pyCompletionRef.current = pyCompletion;
    }, [pyCompletion]);
    const closePyCompletion = React.useCallback(() => setPyCompletion(null), []);
    const schedulePyCompletion = React.useCallback(() => {
        requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (!ta || !editModeRef.current) {
                setPyCompletion(null);
                return;
            }
            const caret = ta.selectionStart;
            const buf = editContentRef.current;
            if (caret !== ta.selectionEnd) {
                setPyCompletion(null);
                return;
            }
            const prefix = pythonIdentifierPrefixBefore(buf, caret);
            if (prefix.length < 1 || prefix.length > 40) {
                setPyCompletion(null);
                return;
            }
            const items = pythonCompletions(prefix, {
                source: buf,
                symbols: editSymbols,
                withSpans: true,
                limit: 9
            }).map((c) => ({
                label: c.label,
                insertText: c.insertText,
                detail: c.detail,
                documentation: c.documentation,
                importModule: c.importModule,
                matchSpans: c.matchSpans
            }));
            if (items.length === 0) {
                setPyCompletion(null);
                return;
            }
            // position: the caret's pixel cell (same metrics as the AI ghost).
            const before = buf.slice(0, caret);
            const line = before.split("\n").length;
            const col = caret - (before.lastIndexOf("\n") + 1);
            let cw = fontSize * 0.6;
            const probe = measureSpanRef.current;
            if (probe) {
                const w = probe.getBoundingClientRect().width;
                if (w > 0) cw = w / 100;
            }
            setPyCompletion({
                items,
                active: 0,
                prefix,
                caret,
                top: 16 + line * (fontSize * lineHeight),
                left: Math.max(8, col * cw + 8)
            });
        });
    }, [editSymbols, fontSize, lineHeight]);
    const acceptPyCompletion = React.useCallback((idx: number) => {
        const st = pyCompletionRef.current;
        const ta = textareaRef.current;
        if (!st || !ta || !editModeRef.current) return;
        const item = st.items[idx];
        if (!item) return;
        const caret = ta.selectionStart;
        const buf = editContentRef.current;
        // The buffer may have moved since the popup computed — verify the
        // prefix still sits right before the caret.
        if (buf.slice(caret - st.prefix.length, caret) !== st.prefix) {
            setPyCompletion(null);
            return;
        }
        const insert = (item.insertText ?? item.label).slice(st.prefix.length);
        let next = buf.slice(0, caret) + insert + buf.slice(caret);
        // Auto-import on accept: splice the module's import line in when
        // the symbol is not already bound.
        if (item.importModule) {
            const patched = ensureImport(next, item.importModule);
            if (patched) next = patched;
        }
        const prev = buf;
        undoStackRef.current.push({content: prev, selStart: caret, selEnd: caret});
        if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
        redoStackRef.current = [];
        undoSuspendRef.current = true;
        const insertOffset = item.importModule && next !== buf ? next.indexOf(insert, caret) : caret;
        try {
            handleEditChangeRef.current(next);
        } finally {
            requestAnimationFrame(() => {
                undoSuspendRef.current = false;
                const t = textareaRef.current;
                if (t) {
                    const at = (insertOffset === caret ? caret : insertOffset) + insert.length;
                    t.focus();
                    t.setSelectionRange(at, at);
                }
            });
        }
        setPyCompletion(null);
    }, []);
    // The popup never survives a mode/file switch.
    React.useEffect(() => {
        setPyCompletion(null);
    }, [editMode, folderSlug, fileSlug]);

    // ─── VIM MODE (Settings → Editor) ─────────────────────────────
    // A headless modal-editing engine (lib/vim-mode.ts) layered IN
    // FRONT of the textarea's own keymap: every keydown is offered to
    // the controller first — consumed keys are preventDefaulted; the
    // rest fall through to the editor's native handling (insert-mode
    // typing stays native by design, so every existing feature —
    // multi-caret, auto-pairs, snippets — keeps working under vim).
    const vimRef = React.useRef<VimController | null>(null);
    const [, setVimTick] = React.useState(0);
    const vimSaveRef = React.useRef<(() => void) | null>(null);
    // The ex command bar (":" in normal mode → :w / :q / :%s… / :set nu).
    // null = closed; a string = the live command being typed.
    const [vimCommand, setVimCommand] = React.useState<string | null>(null);
    const vimCommandInputRef = React.useRef<HTMLInputElement | null>(null);
    // Focus the bar the moment it opens (and keep the caret at the end).
    React.useEffect(() => {
        if (vimCommand !== null) {
            const el = vimCommandInputRef.current;
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        }
    }, [vimCommand === null]);
    const buildVimDoc = React.useCallback((): import("@/lib/vim-mode").VimDoc => ({
        getText: () => editContentRef.current,
        setText: (next: string) => {
            setEditContent(next);
            // Keep the textarea caret where the controller wants it (next
            // paint), and refresh the highlight backdrop through the normal
            // edit pipeline.
            requestAnimationFrame(() => {
                const ta = textareaRef.current;
                const c = vimRef.current?.getCursor();
                if (ta && c !== undefined) {
                    ta.selectionStart = ta.selectionEnd = Math.min(c, next.length);
                }
            });
        }
    }), []);
    React.useEffect(() => {
        if (!vimMode || !editMode) {
            vimRef.current = null;
            return;
        }
        const controller = new VimController(buildVimDoc(), {
            onSave: () => vimSaveRef.current?.(),
            // :q / :wq close the EDITOR TAB through the page (the ex command
            // bar's executeCommand calls this hook).
            onCloseRequested: () => {
                window.dispatchEvent(new Event("praxis:close-active-tab"));
            },
            tabWidth: indentWidth
        });
        vimRef.current = controller;
        setVimTick((t) => t + 1);
        return () => {
            vimRef.current = null;
        };
        // A new controller per (file, mode-entry): state resets between
        // files, matching the engine's per-buffer semantics.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vimMode, editMode, fileName, code, indentWidth, buildVimDoc]);
    // Push the mode/status line to the host (the page footer renders
    // it) whenever the controller state MEANINGFULLY changes — the last
    // payload is kept in a ref so unchanged states don't re-dispatch on
    // unrelated re-renders.
    const vimLastPushRef = React.useRef("");
    React.useEffect(() => {
        const state: VimState | null = vimMode && editMode ? vimRef.current?.getState() ?? null : null;
        const payload = state
            ? {
                mode: state.mode,
                pending: state.pending,
                message: state.message ?? null,
                recording: state.recording ?? null
            }
            : null;
        const key = payload ? `${payload.mode}|${payload.pending ?? ""}|${payload.recording ?? ""}` : "off";
        if (key !== vimLastPushRef.current) {
            vimLastPushRef.current = key;
            window.dispatchEvent(new CustomEvent("praxis:vim-state", {detail: payload}));
        }
    });

    // ─── INLINE AI CHAT (Ctrl+I at a selection) ────────────────────
    // A small chat widget anchored at the caret; the streamed answer's
    // first code block can be applied straight over the selection
    // through the undoable buffer path.
    const [inlineAi, setInlineAi] = React.useState<{
        open: boolean;
        anchor: { top: number; left: number } | null;
        sel: { start: number; end: number; text: string } | null;
        /** VIEW-mode-only selection text (context without an apply
         * target — the textarea does not exist there). */
        viewText?: string;
    }>({open: false, anchor: null, sel: null});
    /** lineTop as a stable ref so openInlineAi can read the latest
     * geometry without depending on it (keeps the callback identity
     * stable for the context-menu items). Assigned after the real
     * lineTop is defined below; the fallback formula covers the
     * pre-measurement window. */
    const lineTopRef = React.useRef((line: number) => 16 + (line - 1) * fontSize * 1.6);
    const openInlineAi = React.useCallback(() => {
        // VIEW mode: no textarea exists — capture the browser selection
        // (if any) for context, anchor at the caret line, and hand the
        // widget a selection-free session (Apply stays hidden until the
        // user is in edit mode; asking/explaining works everywhere).
        const ta = textareaRef.current;
        if (!ta) {
            const sel = window.getSelection();
            const text = sel && !sel.isCollapsed ? sel.toString() : "";
            const line = Math.max(1, Math.min(lines.length, caretLineRef.current || 1));
            // Bottom of the caret line = top of the next line (lineTopRef
            // carries the measured geometry — no direct state reads here,
            // the metrics are declared later in the component).
            const top = lineTopRef.current(Math.min(line + 1, lines.length + 1)) + 6;
            setInlineAi({
                open: true,
                anchor: {top, left: Math.max(8, measuredCodeLeftRef.current + 16)},
                sel: null,
                viewText: text
            });
            return;
        }
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = start === end ? "" : editContentRef.current.slice(start, end);
        // Anchor at the caret's pixel position inside the editor wrapper
        // (the same metrics the squiggle overlay uses).
        const before = editContentRef.current.slice(0, start);
        const line = before.split("\n").length;
        const col = start - (before.lastIndexOf("\n") + 1);
        const top = 16 + (line - 1) * EDIT_LINE_HEIGHT + EDIT_LINE_HEIGHT + 4;
        // charWidth is declared later in the component — measure lazily
        // from the probe span (it's mounted with the editor).
        let cw = fontSize * 0.6;
        const probe = measureSpanRef.current;
        if (probe) {
            const w = probe.getBoundingClientRect().width;
            if (w > 0) cw = w / 100;
        }
        const left = Math.max(8, col * cw + 8);
        setInlineAi({open: true, anchor: {top, left}, sel: start === end ? null : {start, end, text}});
    }, [fontSize, lines.length]);
    // ── REMOTE OPEN (Explorer ▸ AI ▸ "Edit with AI…") ──────────────
    // A file-level right-click queues a durable request (the page's
    // pending-console-run store) AFTER selecting the file: this
    // mount-time drain opens the card the moment the freshly-opened
    // file's viewer mounts; the window event below covers an
    // already-mounted viewer. One-shot on both paths.
    React.useEffect(() => {
        const onOpenInlineAi = () => {
            takePendingInlineAi();
            openInlineAi();
        };
        window.addEventListener("praxis:open-inline-ai", onOpenInlineAi);
        return () => window.removeEventListener("praxis:open-inline-ai", onOpenInlineAi);
    }, [openInlineAi]);
    React.useEffect(() => {
        if (!takePendingInlineAi()) return;
        openInlineAi();
        // Mount-time drain only — the listener effect covers the mounted
        // lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const applyInlineAi = React.useCallback((replacement: string) => {
        const st = inlineAi.sel;
        if (!st) return;
        const current = editContentRef.current;
        // Guard: the buffer may have changed while the widget was open.
        if (current.slice(st.start, st.end) !== st.text) {
            aiToast({
                title: "Selection changed",
                description: "The buffer was edited while the AI was answering — apply skipped.",
                variant: "warning"
            });
            return;
        }
        const next = current.slice(0, st.start) + replacement + current.slice(st.end);
        const prev = current;
        const ta = textareaRef.current;
        undoStackRef.current.push({
            content: prev,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0
        });
        if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
        redoStackRef.current = [];
        undoSuspendRef.current = true;
        try {
            handleEditChangeRef.current(next);
        } finally {
            requestAnimationFrame(() => {
                undoSuspendRef.current = false;
                const t = textareaRef.current;
                if (t) {
                    t.focus();
                    const at = Math.min(st.start + replacement.length, t.value.length);
                    t.setSelectionRange(at, at);
                }
            });
        }
        aiToast({title: "AI edit applied", description: "Ctrl+Z undoes.", variant: "success"});
    }, [inlineAi.sel, aiToast]);

    // ─── peek references (⇧F12) ─────────────────────────────────────────
    // The inline references popup anchored at the caret. Data comes from
    // the SAME /api/full-text-search machinery as ⌥F7 (Find Usages); the
    // popup component (components/peek-references-popup.tsx) owns the
    // fetch, the Esc/click-outside dismissal and the compact list.
    const [peekRefs, setPeekRefs] = React.useState<{
        open: boolean;
        symbol: string;
        anchor: { top: number; left: number };
        /** Semantic (LSP) hits — when set, the popup shows these verbatim
         *  and skips its full-text-search fetch. */
        hitsOverride?: ReferenceHit[];
    }>({open: false, symbol: "", anchor: {top: 0, left: 0}});

    /** Resolve the symbol the ⇧F12 / popup acts on: the edit-mode caret
     *  word; in view mode, the DOM selection (single line) or the word
     *  under the last-clicked cell. Returns "" when nothing is targeted
     *  (the trigger is then a no-op, matching ⌥F7's silent guard). */
    const resolveCaretSymbol = (): string => {
        if (editMode) {
            const target = wordAroundCaret();
            return target ? target.text : "";
        }
        const sel = typeof window !== "undefined" ? window.getSelection() : null;
        const text = sel && !sel.isCollapsed ? sel.toString() : "";
        if (text && !text.includes("\n") && text.length <= 120) return text.trim();
        const cell = lastViewClickRef.current;
        if (cell && cell.line >= 1 && cell.line <= lines.length) {
            return wordAt(lines[cell.line - 1] ?? "", cell.col);
        }
        return "";
    };

    /** Resolve the POSITION (1-based line/col) the LSP gestures act on:
     *  the edit-mode caret word's start; in view mode the last-clicked
     *  cell. Null → the caller runs its text-search fallback (the same
     *  contract resolveCaretSymbol gives the pre-LSP paths). */
    const resolveCaretPosition = (): { line: number; col: number } | null => {
        if (editMode) {
            const target = wordAroundCaret();
            if (!target) return null;
            const before = editContentRef.current.slice(0, target.start);
            return {line: before.split("\n").length, col: target.start - (before.lastIndexOf("\n") + 1) + 1};
        }
        const cell = lastViewClickRef.current;
        if (cell && cell.line >= 1 && cell.line <= lines.length) return {line: cell.line, col: cell.col};
        return null;
    };

    /** A popup row was clicked — same-file hits jump in place, others
     *  hand off to the page via praxis:open-reference (see
     *  lib/peek-references for the listener wiring). */
    const jumpToPeekReference = React.useCallback(
        (hit: ReferenceHit) => {
            if (hitIsCurrentFile(hit, {folderSlug, fileSlug})) {
                handleSymbolClickRef.current(hit.line);
            } else {
                dispatchOpenReference(hit);
            }
        },
        [folderSlug, fileSlug]
    );

    // ─── signature help while typing ────────────────────
    // When the caret sits inside a call's parentheses, a popup shows the
    // callee's parameter list with the CURRENT argument highlighted and
    // its docstring. Resolution order: the file's own defs (the last one
    // BEFORE the call line — respects redefinition), then a small
    // builtin table. Non-Python buffers never trigger it.
    /** The popup's data — the extracted scanner's result type. */
    type SigHelp = SignatureHelpResult;
    const [sigHelp, setSigHelp] = React.useState<SigHelp | null>(null);

    /** Recompute the signature popup for the CURRENT caret position.
     *  The scanner itself lives in lib/signature-help.ts (extracted in
     *  Phase 3 — pure string logic, unit-tested there); this wrapper
     *  only feeds it the buffer + the edit symbols and publishes the
     *  result. */
    const recomputeSigHelp = React.useCallback(
        (pos: number) => {
            if (!editModeRef.current) {
                setSigHelp(null);
                return;
            }
            // Python files only (this is a Python IDE, but .md buffers share
            // the same editor component).
            if (!fileName || !fileName.toLowerCase().endsWith(".py")) {
                setSigHelp(null);
                return;
            }
            // The extracted scanner: null → no popup.
            setSigHelp(resolveSignatureHelp(editContentRef.current, pos, editSymbolsRef.current));
        },
        [fileName]
    );

    // The popup follows content edits (typing) — recompute on every
    // editContent change while a call context might exist, cheaply
    // (string scan of the chars between the '(' and the caret only).
    React.useEffect(() => {
        if (!editMode) return;
        const ta = textareaRef.current;
        if (ta && document.activeElement === ta) {
            recomputeSigHelp(ta.selectionStart);
        } else {
            setSigHelp(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editContent, editMode]);

    // …and caret moves (arrow keys are not content changes).
    const lastSigPosRef = React.useRef(-1);
    const onSigCaretMove = React.useCallback(
        (pos: number) => {
            if (pos === lastSigPosRef.current) return;
            lastSigPosRef.current = pos;
            recomputeSigHelp(pos);
        },
        [recomputeSigHelp]
    );

    // Caret moves via keyup (arrows/home/end) — keydown already handles
    // structural keys; this pass only refreshes the popup. `editMode` is
    // a dep so the listener (re)attaches AFTER the textarea mounts — at
    // component mount the ref is still null in view mode.
    React.useEffect(() => {
        if (!editMode) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const onKeyUp = () => {
            onSigCaretMove(ta.selectionStart);
        };
        ta.addEventListener("keyup", onKeyUp);
        return () => ta.removeEventListener("keyup", onKeyUp);
    }, [onSigCaretMove, editMode]);

    // Dismiss on mode/file switch.
    React.useEffect(() => {
        if (!editMode) setSigHelp(null);
    }, [editMode]);
    React.useEffect(() => {
        setSigHelp(null);
    }, [folderSlug, fileSlug]);

    /** Apply an edit at every caret. `compute` returns, for the caret at
     *  [start,end) in the LIVE buffer (ta.value — lower carets have
     *  already been edited), the selection to replace + the text to
     *  insert + where the caret should land, or null to skip that caret.
     *  Returns true when at least one edit happened. */
    const applyToAllCarets = React.useCallback(
        (
            compute: (
                buf: string,
                start: number,
                end: number
            ) => { selStart: number; selEnd: number; text: string; finalCaret: number } | null
        ): boolean => {
            const ta = textareaRef.current;
            if (!ta || !editModeRef.current) return false;
            const carets = [
                {start: ta.selectionStart, end: ta.selectionEnd},
                ...extraCaretsRef.current,
            ]
                .filter((c) => c.end >= c.start)
                .sort((a, b) => a.start - b.start);
            if (carets.length === 0) return false;
            const finals: number[] = new Array(carets.length).fill(0);
            let any = false;
            for (let i = carets.length - 1; i >= 0; i--) {
                const buf = ta.value; // live DOM truth (earlier carets applied)
                const res = compute(buf, carets[i].start, carets[i].end);
                if (!res) {
                    finals[i] = carets[i].end;
                    continue;
                }
                any = true;
                ta.setSelectionRange(res.selStart, res.selEnd);
                document.execCommand("insertText", false, res.text);
                // This edit shifts every already-computed final position ABOVE
                // it (all later carets sit at higher offsets).
                const delta = res.text.length - (res.selEnd - res.selStart);
                for (let k = i + 1; k < carets.length; k++) finals[k] += delta;
                finals[i] = res.finalCaret;
            }
            if (!any) return false;
            // The native selection ended at the LAST edit (the lowest caret);
            // the rest become the new extra carets.
            setExtraCarets(
                finals.slice(1).map((p) => ({start: p, end: p}))
            );
            requestAnimationFrame(() => {
                ta.setSelectionRange(finals[0], finals[0]);
            });
            return true;
        },
        []
    );

    /** Quantized auto-indent string for a caret's line (same rules as the
     *  single-caret Enter: copy the line's leading whitespace, one extra
     *  unit after a colon-terminated header). */
    const enterIndentFor = React.useCallback(
        (buf: string, caret: number): string => {
            const lineStart = buf.lastIndexOf("\n", caret - 1) + 1;
            const lineText = buf.slice(lineStart, caret);
            const ws = /^[ \t]*/.exec(lineText)?.[0] ?? "";
            // Quantize the copied indent to whole configured units.
            let units = 0;
            let j = 0;
            while (j < ws.length) {
                if (ws[j] === "\t") {
                    units++;
                    j++;
                    continue;
                }
                let run = 0;
                while (j < ws.length && ws[j] === " ") {
                    run++;
                    j++;
                }
                units += Math.floor(run / Math.max(1, indentWidth));
            }
            // One extra level after a block header.
            if (/:\s*(#.*)?$/.test(lineText)) units += 1;
            return indentUnit.repeat(units);
        },
        [indentUnit, indentWidth]
    );

    /** Ctrl+D — stack the next occurrence onto the caret set. First
     *  press selects the word at the caret; each subsequent press pushes
     *  the current selection in as an extra caret and moves the native
     *  selection to the next (non-occupied) occurrence of that text. */
    const selectNextOccurrenceMulti = React.useCallback(() => {
        const ta = textareaRef.current;
        if (!ta || !editModeRef.current) return;
        const src = editContentRef.current;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (start === end) {
            // First Ctrl+D — select the word under the caret (Sublime).
            const wordChars = /[\w$]/;
            let s = start;
            while (s > 0 && wordChars.test(src[s - 1])) s--;
            let e2 = end;
            while (e2 < src.length && wordChars.test(src[e2])) e2++;
            if (s === e2) return;
            ta.setSelectionRange(s, e2);
            return;
        }
        const text = src.slice(start, end);
        if (!text || text.includes("\n")) return;
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
        // Scroll the new caret into view (same formula as applyMatch).
        const lineNumber = src.slice(0, idx).split("\n").length - 1;
        const lh = fontSizeRef.current * 1.6;
        ta.scrollTop = Math.max(0, lineNumber * lh - ta.clientHeight / 2);
    }, []);
    const EDIT_FOLD_GUTTER_PX = Math.max(20, fontSize * 1.5);
    // the edit-mode gutter used to re-split the whole
    // edit buffer TWICE per render (once for the line count, once for
    // the map) on every keystroke. Split once per editContent change.
    // Still needed by the squiggle overlay + fold covers (they slice the
    // diagnostic's / symbol's line out of the buffer).
    const editLines = React.useMemo(() => editContent.split("\n"), [editContent]);
    // Extra visual rows contributed by every edit line BEFORE index i
    // (null while unwrapped — the spell underlines use the plain
    // (line-1)×row formula then). One pass over the buffer, only while
    // wrapping is on AND spell marks exist.
    const editRowPrefix = React.useMemo(() => {
        if (!wordWrap || !Number.isFinite(editWrapCols) || spellIssues.length === 0) return null;
        const out: number[] = new Array(editLines.length).fill(0);
        let extra = 0;
        for (let i = 0; i < editLines.length; i++) {
            out[i] = extra;
            extra += wrappedRowCount(editLines[i], indentWidth, editWrapCols) - 1;
        }
        return out;
    }, [editLines, wordWrap, editWrapCols, indentWidth, spellIssues.length]);
    // the gutter ROWS now live in a memoized child
    // (EditLineGutterRows, module level) whose props are the line COUNT,
    // the caret LINE and the fold-set key — plain primitives that stay
    // constant while editing WITHIN a line. Previously EVERY keystroke
    // reconciled one <div> per line of the file (thousands of elements on
    // large files — a major contributor to the typing lag).
    const editLineCount = editLines.length;
    // Stable serialization of the folded-line set — the Set's identity
    // churns on every deferred symbol re-parse, which would break the
    // gutter memo bailout; the STRING is stable across those churns.
    const editFoldedKey = React.useMemo(
        () =>
            editFoldedLineNumbers.size === 0
                ? ""
                : [...editFoldedLineNumbers].sort((a, b) => a - b).join(","),
        [editFoldedLineNumbers]
    );
    // Coverage gutter: the executed-lines array is turned into the same
    // stable comma-joined KEY pattern as editFoldedKey above — the
    // memoized EditLineGutterRows child parses it into a Set and does not
    // reconcile on caret churn. Empty/undefined = no markers = empty key.
    const coverageKey = React.useMemo(
        () =>
            !coverageLines || coverageLines.length === 0
                ? ""
                : [...coverageLines].sort((a, b) => a - b).join(","),
        [coverageLines]
    );
    // should the edit-mode backdrop render as plain text?
    //  - permanently (huge buffer, or highlighting disabled in settings), or
    // - transiently (highlightHot — the user typed within the last 150ms).
    const editPlainPermanent =
        !webWorkerHighlighting || editContent.length > EDIT_PLAIN_MAX_CHARS;
    const editPlainBackdrop = editPlainPermanent || highlightHot;

    // ─── Bookmark state ─────────────────────────────────────────────
    // Bookmarks are per-file (identified by folderSlug + fileSlug)
    // and stored in a ref so toggling doesn't trigger a re-render. A
    // re-render nonce (setBookmarkNonce) is bumped on every change
    // so the gutter markers re-render. The effect resets the set
    // whenever the user opens a different file.
    const bookmarksRef = React.useRef<Set<number>>(new Set());
    const [, setBookmarkNonce] = React.useState(0);
    const bumpBookmarks = React.useCallback(() => setBookmarkNonce((n) => n + 1), []);
    React.useEffect(() => {
        bookmarksRef.current = new Set();
        bumpBookmarks();
    }, [folderSlug, fileSlug, bumpBookmarks]);

    // ─── Stable callback refs (avoid infinite re-render loops) ──────
    // The parent passes inline arrow functions for onDirtyChange and
    // onCursorPositionChange. These get a NEW reference every render,
    // so we can't put them in a useEffect/useCallback deps array
    // without causing infinite re-renders. We hold the latest value
    // in a ref instead. The pattern: a tiny effect keeps the ref in
    // sync; consumers read ref.current.
    const onDirtyChangeRef = React.useRef(onDirtyChange);
    React.useEffect(() => {
        onDirtyChangeRef.current = onDirtyChange;
    }, [onDirtyChange]);
    const onCursorPositionChangeRef = React.useRef(onCursorPositionChange);
    React.useEffect(() => {
        onCursorPositionChangeRef.current = onCursorPositionChange;
    }, [onCursorPositionChange]);
    const onSelectionChangeRef = React.useRef(onSelectionChange);
    React.useEffect(() => {
        onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);
    // Run Selection ref (same pattern — the imperative handle
    // stays stable while the prop can change).
    const onRunSelectionRef = React.useRef(onRunSelection);
    React.useEffect(() => {
        onRunSelectionRef.current = onRunSelection;
    }, [onRunSelection]);
    // whether the textarea currently has a NON-EMPTY selection
    // — drives the "Run Selection" / "Format Selection" menu-item
    // enablement. Only set on CHANGES so typing within a line never
    // re-renders (the value flips just twice per selection gesture).
    const [editHasSelection, setEditHasSelection] = React.useState(false);
    // ─── Refs for imperative methods ────────────────────────────────
    // Stash the latest caret line, diagnostics, symbols, font size,
    // and the handleSymbolClick callback so the imperative API exposed
    // via useImperativeHandle can read fresh values without re-creating
    // on every keystroke (same ref-stash pattern as above).
    const caretLineRef = React.useRef(1);
    // caretLine as STATE too (the ref alone never triggers
    // the re-render the gutter's current-line highlight needs). The state
    // only CHANGES when the caret moves to a DIFFERENT line — editing
    // within a line leaves it constant, so the memoized gutter (below)
    // skips re-rendering its N line-number rows on those keystrokes.
    const [caretLine, setCaretLine] = React.useState(1);
    // Single setter: ref for the imperative readers (bookmark toggles,
    // F2 navigation, the imperative API) + state for the gutter render.
    const noteCaretLine = React.useCallback((line: number) => {
        caretLineRef.current = line;
        setCaretLine((prev) => (prev === line ? prev : line));
    }, []);
    const diagnosticsRef = React.useRef<Diagnostic[]>(diagnostics ?? []);
    React.useEffect(() => {
        diagnosticsRef.current = diagnostics ?? [];
    }, [diagnostics]);
    const handleSymbolClickRef = React.useRef<(line: number) => void>(() => {
    });
    const symbolsRef = React.useRef<PythonSymbol[]>(symbols);
    React.useEffect(() => {
        symbolsRef.current = symbols;
    }, [symbols]);
    const fontSizeRef = React.useRef<number>(fontSize);
    React.useEffect(() => {
        fontSizeRef.current = fontSize;
    }, [fontSize]);
    // Ref-stash for the textarea onKeyDown methods. The textarea's
    // onKeyDown reads these refs so the handler stays stable across
    // re-renders. They're wired (assigned .current) after the
    // useImperativeHandle call below.
    const selectNextMatchRef = React.useRef<() => void>(() => {
    });
    const toggleBookmarkRef = React.useRef<() => void>(() => {
    });
    const nextBookmarkRef = React.useRef<() => void>(() => {
    });
    const prevBookmarkRef = React.useRef<() => void>(() => {
    });
    const swapLineUpRef = React.useRef<() => void>(() => {
    });
    const swapLineDownRef = React.useRef<() => void>(() => {
    });
    // Track previous dirty value so we only fire onDirtyChange when it
    // actually flips (prevents redundant setState calls in the parent).
    const prevDirtyRef = React.useRef(false);

    // ─── Edit-mode squiggle scroll sync ────────────────────────────
    // The textarea has min-h-[300px] max-h-[60vh] and scrolls
    // internally when content exceeds its height. The edit-mode
    // squiggle overlays are positioned absolutely in the scroll
    // container (the textarea's parent), so they DON'T move when the
    // textarea scrolls. To keep them aligned with the text, we track
    // the textarea's scrollTop and translate the squiggle wrapper by
    // -scrollTop. The wrapper ref is updated directly (no React state)
    // to avoid re-renders on every scroll tick.
    const editSquiggleWrapRef = React.useRef<HTMLDivElement | null>(null);
    // Line-number gutter ref (edit mode) — synced to the textarea's
    // scrollTop on scroll so the line numbers stay aligned with the text.
    const editLineGutterRef = React.useRef<HTMLDivElement | null>(null);
    // Syntax-highlight backdrop ref (edit mode) — synced to the textarea's
    // scroll on both axes so the highlighted code stays aligned with the
    // transparent textarea text on top.
    const editHighlightRef = React.useRef<HTMLDivElement | null>(null);
    const syncEditSquiggleScroll = React.useCallback(() => {
        const ta = textareaRef.current;
        const wrap = editSquiggleWrapRef.current;
        if (!ta || !wrap) return;
        wrap.style.transform = `translateY(${-ta.scrollTop}px)`;
    }, []);

    // ─── Line-height + char-width measurement ─────────────────────
    // The SyntaxHighlighter's actual rendered line height AND glyph
    // width can differ from the formula (fontSize * 1.6 / fontSize * 0.6).
    // We measure BOTH from the DOM after render, then use the measured
    // values for squiggle/chevron/current-line positioning. This fixes
    // the "squiggle on wrong column / wrong line" bug.
    const codeBodyRef = React.useRef<HTMLDivElement | null>(null);
    // The OUTER scroll container (the `overflow-auto` div that wraps the
    // code body). This is what ReadModeFindBar needs to call scrollTo on
    // — codeBodyRef points at the inner non-scrollable div, so scrollTo
    // on it is a no-op.
    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
    const measureSpanRef = React.useRef<HTMLSpanElement | null>(null);
    // ─── DYNAMIC COLLAPSE HEIGHT
    //     showing, the shown part should be fitting the height of the
    //     editor/viewer area automatically and the code should be
    //     dynamic according to grabbing the resizer between the output
    //     and editor") ─────────────────────────────────────────────
    // The collapsed ("Show less") preview used to cut at a FIXED 8
    // lines / 220px no matter how tall the viewer pane was. A
    // ResizeObserver on the scroll container now feeds the ACTUAL
    // viewport height, and `collapsedLineCount` (computed below, after
    // the measured metrics exist) derives how many rows FIT — dragging
    // the output/editor resizer (or resizing the window) re-derives it
    // live. 0 = not measured yet → the historical 8-line fallback.
    const [viewportHeight, setViewportHeight] = React.useState(0);
    React.useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // clientHeight (NOT contentRect.height): on platforms with
                // CLASSIC scrollbars (Windows) any visible scrollbar subtracts
                // from clientHeight but not necessarily from contentRect —
                // sizing the collapsed clip from contentRect could exceed the
                // real client box and leave a few px of scroll behind.
                const h = el.clientHeight || (entry.contentRect?.height ?? 0);
                setViewportHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
            }
        });
        ro.observe(el);
        setViewportHeight((prev) => (prev ? prev : el.clientHeight));
        return () => ro.disconnect();
    }, []);
    const [measuredLineHeight, setMeasuredLineHeight] = React.useState(fontSize * 1.6);
    const [measuredCodeTop, setMeasuredCodeTop] = React.useState(16);
    const [measuredCharWidth, setMeasuredCharWidth] = React.useState(fontSize * 0.6);
    // MEASURED left offset of the code text from the codeBodyRef's left
    // edge. This is the line-number gutter width + any SyntaxHighlighter
    // padding. We measure it (rather than using the formula fontSize*3.5)
    // because the actual rendered gutter width varies by font/browser and
    // can differ from the formula by 10-15%, causing squiggle horizontal
    // misalignment. See the layout effect below for the measurement.
    const [measuredCodeLeft, setMeasuredCodeLeft] = React.useState(0);
    // Mirror of measuredCodeLeft for the measure effect (the wrap-width
    // read happens after setMeasuredCodeLeft, so the state value is one
    // render stale — the ref is fresh within the same effect run).
    const measuredCodeLeftRef = React.useRef(0);
    React.useEffect(() => {
        measuredCodeLeftRef.current = measuredCodeLeft;
    }, [measuredCodeLeft]);

    // ─── DYNAMIC COLLAPSE GEOMETRY (see the viewportHeight tracker up
    //     by scrollContainerRef). How many rows fit the VISIBLE viewer
    //     height — never fewer than the historical 8-line preview, and
    //     only as many as FIT (no scroll for a pane that shows 30 rows).
    //     Derived from the MEASURED line height so font-size / line-height
    //     settings are honored; the ResizeObserver makes it follow the
    //     output↔editor resizer and window resizes live. Declared HERE
    //     (before the sticky-scroll effect and every later consumer) so
    //     the whole render path sees one value.
    const collapsedLineCount = React.useMemo(
        () => collapsedRowCount(viewportHeight, measuredLineHeight, measuredCodeTop),
        [viewportHeight, measuredLineHeight, measuredCodeTop]
    );
    /** Collapsed-state clip height in px — the measured top padding +
     * exactly collapsedLineCount rows + the bottom 1rem pad of the
     * <pre>, CLAMPED to the viewport height so the collapsed preview
     * never scrolls. Falls back to the old fixed 220px until measured. */
    const collapsedClipPx = React.useMemo(
        () => collapsedClipHeight(viewportHeight, measuredCodeTop, collapsedLineCount, measuredLineHeight),
        [viewportHeight, measuredCodeTop, collapsedLineCount, measuredLineHeight]
    );
    /** True when the file has MORE rows than the collapsed preview can
     *  fit — the state where Show-less must CLIP and the container must
     *  LOCK. The old `+ 2` slack left files that overflow by 1–2 lines
     *  unclipped AND unlocked: the container kept a 1–2-line vertical
     *  scroll sliver in Show-less mode — exactly the "code scrolls a
     *  bit above and a bit below" jank. Any overflow at all now clips
     *  (and the pill offers the expansion), so the collapsed preview
     *  NEVER has a vertical scroll. */
    const isCollapsible = isFileCollapsible(lines.length, collapsedLineCount);

    // ─── SHOW-FULL TINY-SCROLL TRIM ────────────────────────────
    // In EXPANDED view mode a file that overflows the viewport by only
    // a few px (bottom padding + a horizontal scrollbar eating height)
    // shows a vertical scrollbar whose whole travel is ~0.1 cm — pure
    // noise. We MEASURE that leftover after layout and, when it is
    // small enough to hide inside the <pre>'s 16px bottom padding,
    // trim exactly that many px so scrollHeight === clientHeight: no
    // sliver scrollbar, no visual change (the padding existed only for
    // breathing room). Larger overflows are REAL content — untouched.
    const [viewPadTrim, setViewPadTrim] = React.useState(0);
    React.useLayoutEffect(() => {
        const el = scrollContainerRef.current;
        if (!el || editMode || !expanded) return;
        const leftover = el.scrollHeight - el.clientHeight;
        const next = viewPadTrimFor(leftover);
        setViewPadTrim((prev) => (prev === next ? prev : next));
    }, [editMode, expanded, code, measuredLineHeight, viewportHeight, wordWrap, showLineNumbers, letterSpacing]);
    /** Effective bottom padding of the view-mode code <pre>. */
    const viewBottomPadPx = 16 - viewPadTrim;

    // ─── TEST WATCH GUTTER MARKS (Tests panel ▸ Watch on save) ─────
    // The watch runner publishes per-test pass/fail results; this file's
    // entries render as ✓/✕ chips in the right gutter (view mode).
    const [watchSummary, setWatchSummary] = React.useState<WatchTestSummary | null>(null);
    React.useEffect(() => {
        // The store notifies without a payload — re-read the snapshot.
        const sync = () => setWatchSummary(getWatchState().summary);
        sync();
        const unsub = subscribeWatchState(sync);
        return () => {
            unsub();
        };
    }, []);
    const watchMarks = React.useMemo(() => {
        if (!watchSummary?.perTest) return [];
        return watchSummary.perTest.filter(
            (t) => (t.fileSlug === fileSlug || t.file === fileName) && typeof t.line === "number" && t.line >= 1
        );
    }, [watchSummary, fileSlug, fileName]);

    // PERF: OVERLAY WINDOWING. The div-based view-mode overlays
    // (squiggles / spell chips / fold chevrons / gutters / find rects /
    // heatmap marks) used to render for EVERY line of the file — on a
    // 5,000-line file that's thousands of absolutely-positioned nodes
    // participating in every layout. We track the VISIBLE line window
    // (scrollTop → line range, ±40 lines of margin) and only nodes
    // inside it are mounted. Hysteresis (commit only when the window
    // moved ≥20 lines) + rAF throttling keep this to a couple of
    // re-renders per scroll GESTURE, never per scroll frame.
    const overlayWinRef = React.useRef({first: 1, last: 1 + OVERLAY_WINDOW_MARGIN * 2});
    const [overlayWindow, setOverlayWindow] = React.useState({first: 1, last: 1 + OVERLAY_WINDOW_MARGIN * 2});
    const overlayFirst = overlayWindow.first;
    const overlayLast = overlayWindow.last;
    React.useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        let raf = 0;
        const compute = () => {
            raf = 0;
            const rowH = measuredLineHeight || fontSize * lineHeight;
            const next = overlayWindowFromScroll(el.scrollTop, el.clientHeight, rowH, measuredCodeTop);
            if (!next) return;
            if (!overlayWindowChanged(next, overlayWinRef.current)) return;
            overlayWinRef.current = next;
            setOverlayWindow(next);
        };
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(compute);
        };
        el.addEventListener("scroll", onScroll, {passive: true});
        compute();
        return () => {
            el.removeEventListener("scroll", onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [measuredLineHeight, measuredCodeTop, fontSize, lineHeight]);

    // Collapsed-state scroll reset: even with overflow-hidden some
    // platforms keep a stale scrollTop from the expanded session, allow
    // a rubber-band nudge or a trackpad-momentum flick; zero it whenever
    // the collapsed preview is active — and keep zeroing on every scroll
    // event while collapsed — so the words and the overlays can never
    // drift apart and the Show-less preview NEVER scrolls.
    // The CELL VIEW is exempt here too: it renders at full height with
    // overflow-auto (no Show-less preview exists for notebook files),
    // and pinning its scrollTop to 0 would snap every scroll back to
    // the first cell.
    React.useEffect(() => {
        if (editMode || expanded || !isCollapsible || (hasCells && onRunCell)) return;
        const sc = scrollContainerRef.current;
        if (sc && sc.scrollTop !== 0) sc.scrollTop = 0;
        // Belt-and-braces: any scroll that sneaks through (rubber-band,
        // momentum, programmatic) is pinned straight back to 0.
        const pin = () => {
            if (scrollContainerRef.current && scrollContainerRef.current.scrollTop !== 0) {
                scrollContainerRef.current.scrollTop = 0;
            }
        };
        window.addEventListener("scroll", pin, true);
        return () => window.removeEventListener("scroll", pin, true);
    }, [editMode, expanded, isCollapsible, collapsedLineCount, collapsedClipPx, hasCells, onRunCell]);
    // PERF: the collapsed/expanded source TEXT, memoized — computing
    // split/slice/join over a whole file on every render (the sticky
    // bar used to re-render per scroll frame) is O(file) work per frame.
    const codeToShow = React.useMemo(
        () =>
            expanded || !isCollapsible
                ? visibleCode
                : collapsedPreviewText(visibleCode, collapsedLineCount),
        [expanded, isCollapsible, visibleCode, collapsedLineCount]
    );

    // PERF: rainbow-bracket overlays are MEMOIZED on content identity —
    // the render used to re-run buildRainbowOverlay (a full-buffer
    // split + char scan) on EVERY render / every edit-mode keystroke.
    // The edit-mode variant additionally rides useDeferredValue so a
    // fast typist never blocks a frame on the scan: React recomputes it
    // on the idle pass and the colors settle a beat behind the caret.
    // (deferredEditContent is declared above, next to editSymbols — the
    // symbol parser's deferred value is shared by the rainbow scan.)
    const rainbowViewNodes = React.useMemo(
        () => (rainbowBrackets && !wordWrap ? buildRainbowOverlay(codeToShow) : null),
        [rainbowBrackets, wordWrap, codeToShow]
    );
    const rainbowEditNodes = React.useMemo(
        () => (rainbowBrackets && !wordWrap ? buildRainbowOverlay(deferredEditContent) : null),
        [rainbowBrackets, wordWrap, deferredEditContent]
    );

    // PERF: the edit-mode inlay hints used to re-split the ENTIRE edit
    // buffer and regex-scan every line on EVERY render (each keystroke).
    // Memoized on (editContent, runtimeVariables, charWidth) — typing in
    // an unrelated line no longer re-derives the hint list.
    const inlayHints = React.useMemo(() => {
        // mypy TYPE inlays (Settings → Python → Type checking) — the same
        // rendering layer as the runtime-variable inlays: each mypy hint
        // lands right after the line's text.
        if ((!runtimeVariables || runtimeVariables.length === 0) && typeInlays && typeInlays.length > 0 && !wordWrap) {
            const editLinesArr = editContent.split("\n");
            const hints: Array<{ line: number; left: number; text: string; title: string }> = [];
            for (const inlay of typeInlays) {
                const ln = editLinesArr[inlay.line - 1];
                if (ln === undefined) continue;
                hints.push({
                    line: inlay.line,
                    left: Math.max(ln.trimEnd().length, (inlay.endCol ?? inlay.col) - 1) * measuredCharWidth + 6,
                    text: inlay.kind === "return" ? `« ${inlay.label}` : `: ${inlay.label}`,
                    title: `mypy: ${inlay.label}`
                });
                if (hints.length >= 120) break;
            }
            return hints.length > 0 ? hints : null;
        }
        if (!runtimeVariables || runtimeVariables.length === 0 || wordWrap) return null;
        const byName = new Map(runtimeVariables.map((v) => [v.name, v]));
        const editLinesArr = editContent.split("\n");
        const hints: Array<{ line: number; left: number; text: string; title: string }> = [];
        for (let i = 0; i < editLinesArr.length; i++) {
            const ln = editLinesArr[i];
            if (ln.includes("\t")) continue;
            const m = ln.match(/^(\s*)([A-Za-z_]\w*)\s*(?::[^=]+)?=/);
            if (!m) continue;
            const v = byName.get(m[2]);
            if (!v) continue;
            const repr = v.repr.length > 44 ? v.repr.slice(0, 41) + "…" : v.repr;
            hints.push({
                line: i + 1,
                left: (m[1].length + ln.trimEnd().length) * measuredCharWidth + 6,
                text: `: ${v.type} = ${repr}`,
                title: `${v.name}: ${v.type} = ${v.repr}`
            });
            if (hints.length >= 120) break; // cap for very long files
        }
        return hints.length > 0 ? hints : null;
    }, [runtimeVariables, editContent, wordWrap, measuredCharWidth, typeInlays]);

    // ── Progressive full-code rendering (see splitSafeChunks up top):
    // a long EXPANDED file (view mode, no cells) renders in per-frame
    // chunks with a live loader; the collapsed preview and short files
    // stay single-block.
    const chunkedFull = webWorkerHighlighting && !editMode && !hasCells
        ? (expanded || !isCollapsible) && lines.length > FULL_CHUNK_THRESHOLD
        : false;
    const fullChunks = React.useMemo(
        () => (chunkedFull ? splitSafeChunks(codeToShow.split("\n"), FULL_CHUNK_LINES) : null),
        [chunkedFull, codeToShow]
    );
    /** First 1-based DISPLAY row of every chunk (for line numbering and
     *  for gating overlay marks to the mounted frontier). */
    const fullChunkStartRows = React.useMemo(() => {
        if (!fullChunks) return null;
        const starts: number[] = [];
        let row = 1;
        for (const c of fullChunks) {
            starts.push(row);
            row += c.split("\n").length;
        }
        return starts;
    }, [fullChunks]);
    /* The progressive-render frontier — the first DISPLAY row whose chunk
   * is NOT on screen yet. ProgressiveCodeBody owns the per-chunk mount
   * state (so mounting a chunk re-renders ONLY that body, never this
   * 9k-line viewer) and reports the frontier up through onFrontier at
   * mount START (rows past chunk 1) and mount END (all rows) — overlay
   * marks for unmounted rows wait below `mountedRowLimit`. */
    const [mountedRowLimit, setMountedRowLimit] = React.useState<number>(Number.POSITIVE_INFINITY);
    React.useEffect(() => {
        // Reset whenever the chunked mode turns off (file switch, collapse,
        // edit mode) — no frontier gating outside progressive mounts.
        if (!fullChunks) setMountedRowLimit(Number.POSITIVE_INFINITY);
    }, [!!fullChunks]);

    // Edit-mode soft-wrap column the measuring effect — the
    // STATE it writes is declared up with the edit metrics (the
    // row-prefix memo below `editLines` reads it at render time).
    React.useLayoutEffect(() => {
        const ta = textareaRef.current;
        if (!ta || !editMode || !wordWrap) {
            setEditWrapCols(Infinity);
            return;
        }
        const cs = window.getComputedStyle(ta);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const usable = Math.max(0, ta.clientWidth - padL - padR);
        setEditWrapCols(wrapColumnCount(usable, measuredCharWidth));
    }, [editMode, wordWrap, fontSize, letterSpacing, measuredCharWidth]);
    // Effective tab size + wrap column of the VIEW-mode <pre>: measured
    // in the layout effect below. wrapCols is Infinity while wordWrap is
    // off (chips never offset rows then).
    const [viewTabSize, setViewTabSize] = React.useState(8);
    const [viewWrapCols, setViewWrapCols] = React.useState<number>(Infinity);
    // Edit-mode twin (the textarea's own wrap column): the STATE lives
    // with the view geometry; the measuring EFFECT sits below
    // measuredCharWidth's declaration (it divides by it).
    const [hoveredLine, setHoveredLine] = React.useState<number | null>(null);
    const [clickedLine, setClickedLine] = React.useState<number | null>(null);
    // the temporary "landed here" flash shown after a
    // jump (bookmark / outline / TODO click). { line, nonce, fading } —
    // the nonce re-triggers the fade timers, `fading` flips the CSS
    // opacity transition, and the whole overlay unmounts after ~1.6 s.
    const [jumpFlash, setJumpFlash] = React.useState<{
        line: number;
        nonce: number;
        fading: boolean;
    } | null>(null);

    // ─── sticky scroll (view mode) ────────────────────────
    // The pinned def/class header is rendered by StickyScrollHeader —
    // an ISOLATED child component with its OWN scroll listener + state.
    //
    // PERF: even though the old handler only called setState when the
    // pinned symbol CHANGED, that setState lived in THIS component —
    // crossing a def/class boundary while scrolling re-rendered the
    // entire 9k-line viewer (every overlay, every chip, the minimap):
    // measured 250-860 ms long tasks and ~9 fps on a 3.6k-line file
    // with sticky scroll on (41 fps with it off). The bar now owns its
    // state; a symbol crossing re-renders ONLY the bar's button.

    // Measure line height + top offset + char width + code left offset
    // after the SyntaxHighlighter renders. The hidden <span> in the JSX
    // below (measureSpanRef) is rendered with the same font-family / size
    // as the code body and contains exactly 100 'M' characters; we divide
    // its bounding-rect width by 100 to get a pixel-accurate per-char
    // width that matches the rendered monospace font (JetBrains Mono,
    // Geist Mono, or whatever fallback is in use).
    React.useLayoutEffect(() => {
        if (!codeBodyRef.current) return;
        const measure = () => {
            if (!codeBodyRef.current) return false;
            const containerRect = codeBodyRef.current.getBoundingClientRect();
            // Find the first line-number element inside the SyntaxHighlighter.
            const lineNumberEl = codeBodyRef.current.querySelector(
                ".linenumber, .react-syntax-highlighter-line-number, [data-line-number]"
            ) as HTMLElement | null;
            if (lineNumberEl) {
                const rect = lineNumberEl.getBoundingClientRect();
                setMeasuredLineHeight(rect.height || fontSize * 1.6);
                setMeasuredCodeTop(rect.top - containerRect.top);
                // MEASURE the code-text left offset: the right edge of the
                // line-number gutter (relative to codeBodyRef) is where the code
                // text starts. This accounts for the actual rendered gutter width
                // (which varies by font/browser) instead of relying on the
                // fontSize*3.5 formula that can be off by 10-15%. The gutter is
                // sized from the file's widest line number (gutterMinWidth), so
                // ONE measurement is correct for every row.
                setMeasuredCodeLeft(rect.right - containerRect.left);
                measuredCodeLeftRef.current = rect.right - containerRect.left;
                return true;
            }
            // Fallback: look at the first <span> inside a <code> element.
            const codeEl = codeBodyRef.current.querySelector("code");
            if (codeEl) {
                const firstSpan = codeEl.firstElementChild as HTMLElement | null;
                if (firstSpan) {
                    const rect = firstSpan.getBoundingClientRect();
                    if (rect.height > 0) {
                        setMeasuredLineHeight(rect.height);
                        setMeasuredCodeTop(rect.top - containerRect.top);
                        setMeasuredCodeLeft(rect.left - containerRect.left);
                        measuredCodeLeftRef.current = rect.left - containerRect.left;
                        return true;
                    }
                }
            }
            return false;
        };
        const measuredNow = measure();
        // WORKER-HIGHLIGHT LATE MEASUREMENT (the "zigzags shifted right"
        // fix): with Web Worker highlighting the FIRST render shows the
        // metrically-identical SKELETON, which contains NO line-number
        // elements and no <code> — the measurement above found nothing,
        // measuredCodeLeft stayed 0 and every overlay fell back to the
        // fontSize*3.5 formula (~11px off the real gutter on a 13px font —
        // squiggles and spell zigzags rendered visibly right of their
        // words). This effect's deps never change when the worker's real
        // <pre> lands, so the stale fallback stuck FOREVER. A
        // MutationObserver now re-runs the measurement the moment a real
        // line-number/code element appears, then disconnects.
        let observerCleanup: (() => void) | undefined;
        if (!measuredNow && typeof MutationObserver !== "undefined") {
            let raf = 0;
            const mo = new MutationObserver(() => {
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    if (measure()) {
                        mo.disconnect();
                        // The wrap-column probe below needs the fresh left offset.
                        const preLate = codeBodyRef.current?.querySelector("pre");
                        if (preLate && wordWrap) {
                            const csLate = window.getComputedStyle(preLate);
                            const padRLate = parseFloat(csLate.paddingRight) || 0;
                            const probeWLate = measureSpanRef.current
                                ? measureSpanRef.current.getBoundingClientRect().width / 100
                                : 0;
                            if (probeWLate > 0) {
                                setViewWrapCols(
                                    wrapColumnCount(
                                        Math.max(0, preLate.clientWidth - padRLate - measuredCodeLeftRef.current),
                                        probeWLate
                                    )
                                );
                            }
                        }
                    }
                });
            });
            mo.observe(codeBodyRef.current, {childList: true, subtree: true});
            // Safety: never keep the observer past this effect's lifetime.
            const t = window.setTimeout(() => mo.disconnect(), 10_000);
            observerCleanup = () => {
                mo.disconnect();
                window.clearTimeout(t);
                if (raf) cancelAnimationFrame(raf);
            };
        }
        // Measure char width from the dedicated probe span.
        if (measureSpanRef.current) {
            const w = measureSpanRef.current.getBoundingClientRect().width;
            if (w > 0) setMeasuredCharWidth(w / 100);
        }
        // Soft-wrap + tab-stop geometry the spell chips'
        // (line, col) → x/y math needs the wrap COLUMN and the effective
        // tab size of the rendered <pre>. Both come from the computed
        // style + clientWidth — the same width the browser wraps at.
        const pre = codeBodyRef.current.querySelector("pre");
        if (pre) {
            const cs = window.getComputedStyle(pre);
            const ts = parseFloat(cs.tabSize);
            if (Number.isFinite(ts) && ts > 0) setViewTabSize(ts);
            if (wordWrap) {
                // Usable text width = the pre's content box minus the
                // code-text left offset (the line-number gutter + left padding
                // already sit inside that width).
                const padR = parseFloat(cs.paddingRight) || 0;
                const probeW = measureSpanRef.current ? measureSpanRef.current.getBoundingClientRect().width / 100 : 0;
                if (probeW > 0) {
                    setViewWrapCols(
                        wrapColumnCount(
                            Math.max(0, pre.clientWidth - padR - measuredCodeLeftRef.current),
                            probeW
                        )
                    );
                }
            } else {
                setViewWrapCols(Infinity);
            }
        } else {
            setViewWrapCols(Infinity);
        }
        return observerCleanup;
    }, [code, fontSize, webWorkerHighlighting, expanded, codeFolding, wordWrap, showLineNumbers, letterSpacing]);

    // Compute the y position for a given line number using the MEASURED
    // values (not the formula). Falls back to the formula if measurement
    // hasn't happened yet.
    const lineTop = React.useCallback(
        (line: number) => lineTopOf(line, measuredLineHeight, measuredCodeTop),
        [measuredLineHeight, measuredCodeTop]
    );
    // Keep the openInlineAi geometry ref pointing at the latest
    // lineTop (see the INLINE AI CHAT block above).
    lineTopRef.current = lineTop;
    const lineHeightPx = measuredLineHeight;

    // ─── display-row mapping (VIEW mode) ────────────────────────────
    // The rendered rows are NOT the raw file lines: `visibleCode` drops
    // folded blocks (replacing each with one placeholder row) and the
    // collapsed preview cuts the file at collapsedLineCount (the rows
    // that FIT the viewer pane — see the dynamic-collapse geometry up
    // by the measured metrics). Overlays
    // that position by RAW line — spell chips, diagnostic squiggles,
    // gutter markers — therefore landed on rows that do not exist on
    // screen: with the default collapsed preview the chips for lines
    // 9+ floated in the WHITE SPACE below the 8 rendered rows (user
    // report: "before expanding the python content, zigzags appear in
    // the non-expanded which appear in the white space"). The map below
    // mirrors the visibleCode construction exactly, and viewRowTopOf()
    // returns the y of a line's DISPLAY row — or null when the line is
    // hidden under a fold or past the collapse cut, so callers skip the
    // mark instead of drawing it in the void.
    const collapsedView = isCollapsible && !expanded;
    /** Raw 1-based code line → 1-based row in visibleCode (0 = hidden under a fold). */
    const rawLineToViewRow = React.useMemo(
        () => buildRawLineToViewRow(code, symbols, foldedSymbols, codeFolding),
        [code, codeFolding, foldedSymbols, symbols]
    );
    /** y of a raw line's DISPLAY row, or null when the row is not rendered. */
    const viewRowTopOf = React.useCallback(
        (rawLine: number): number | null =>
            viewRowTopInEngine(rawLine, {
                rawLineToViewRow,
                collapsedView,
                collapsedLineCount,
                mountedRowLimit,
                rowHeight: measuredLineHeight,
                codeTop: measuredCodeTop
            }),
        [rawLineToViewRow, collapsedView, collapsedLineCount, mountedRowLimit, measuredLineHeight, measuredCodeTop]
    );

    // ─── segment-aware row prefix (VIEW mode,────────────
    // While the view soft-wraps, every logical line renders as several
    // visual rows and each FOLLOWING line shifts down by the extras.
    // prefix[i] = the extra rows contributed by lines[0..i) — a spell
    // chip on line N then lands at y = lineTop(N) + prefix[N-1]*rowH +
    // chipRow*rowH. Computed only while wrapping is on and marks exist.
    const viewRowPrefix = React.useMemo(
        () => buildViewRowPrefix(lines, wordWrap, viewWrapCols, viewTabSize, spellIssues.length > 0),
        [lines, wordWrap, viewWrapCols, viewTabSize, spellIssues.length]
    );

    // the line the mouse hovers for the FLOATING tooltip
    // (view mode) — diagnostics first, else the innermost symbol.
    // Kept separate from hoveredLine so the tooltip works even with
    // highlight-current-line off. Set by handleCodeMouseMove below.
    const [hoverTipLine, setHoverTipLine] = React.useState<number | null>(null);
    /** Settings gate: the symbol/docstring hover tooltip (view mode).
     *  OFF by default — a settings toggle (Settings → Advanced →
     *  Symbol hover tooltips) enables it. The floating card never
     *  intercepts pointer events, so dragging a selection always
     *  reaches the glyphs when it is on. */
    const hoverSymbolTooltips = hoverSymbolTooltipsSetting === true;
    const hoverTip = React.useMemo(() => {
        // No tooltip in edit mode, when the setting is off, or with no hovered line.
        if (editMode || !hoverSymbolTooltips || hoverTipLine === null) return null;
        // Diagnostics win over symbol info on the hovered line.
        const dg = (diagnostics || []).find((d) => d.line === hoverTipLine);
        if (dg) return {
            kind: "diag" as const,
            title: dg.message,
            body: undefined as string | undefined,
            line: hoverTipLine
        };
        // Pyright's typed hover comes next: the inferred signature +
        // docstring (a superset of the regex symbol card below; when the
        // sidecar is off or silent, lsp.hover is null and the card falls
        // through to the offline symbol scan).
        if (lsp.hover && lsp.hover.line === hoverTipLine) {
            return {kind: "lsp" as const, title: lsp.hover.title, body: lsp.hover.body, line: hoverTipLine};
        }
        // Find the innermost def/class containing the hovered line.
        let best: PythonSymbol | null = null;
        for (const s of symbols) {
            if (s.line <= hoverTipLine && (s.endLine ?? s.line) >= hoverTipLine) {
                if (!best || s.indent > best.indent) best = s;
            }
        }
        // No enclosing symbol means no tooltip.
        if (!best) return null;
        // The symbol card carries its signature and docstring.
        return {kind: "symbol" as const, title: formatSymbol(best), body: best.docstring, line: hoverTipLine};
        // NOTE: hoverSymbolTooltips is deliberately a dependency — without it,
        // toggling the setting OFF while a card was visible kept serving the
        // memoized (stale) tooltip until the mouse moved to another line.
        // lsp.hover joined with the Pyright integration: the typed card must
        // supersede (or clear) the AST-lite symbol card the moment a new LSP
        // answer lands, so it cannot be anything but a live dependency.
    }, [editMode, hoverSymbolTooltips, hoverTipLine, diagnostics, symbols, lsp.hover]);

    // Track which line the mouse is hovering over (for
    // highlight-current-line AND the view-mode hover tooltip).
    const handleCodeMouseMove = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (editMode || !codeBodyRef.current) return;
            const rect = codeBodyRef.current.getBoundingClientRect();
            const y = e.clientY - rect.top;
            // Account for scroll position inside the code body.
            const scrolledY = y + codeBodyRef.current.scrollTop;
            const line = Math.floor((scrolledY - measuredCodeTop) / measuredLineHeight) + 1;
            const inBounds = line >= 1 && line <= lines.length;
            if (highlightCurrentLine && inBounds) {
                setHoveredLine(line);
            } else if (!highlightCurrentLine && hoveredLine !== null) {
                setHoveredLine(null);
            }
            // The floating hover tooltip (diagnostics first, else the
            // innermost def/class containing the line). Rendered from
            // `hoveredLine` state, so it only re-renders when the line
            // changes — never per mouse pixel. Only tracked while the
            // tooltip (or the current-line highlight, which shares the
            // hover line state) is enabled.
            if (inBounds && (hoverSymbolTooltips || highlightCurrentLine)) {
                setHoverTipLine((prev) => (prev === line ? prev : line));
            } else if (hoverTipLine !== null) {
                setHoverTipLine(null);
            }
            // Pyright typed hover: resolve the hovered column from the mouse
            // X (the same probe-span char width the squiggles use) and ask
            // the sidecar — debounced + stale-dropped inside the session
            // hook, so a fast mouse never floods the server.
            if (inBounds && hoverSymbolTooltips && lspRef.current.status === "ready") {
                const probe = measureSpanRef.current;
                const charWidth = probe && probe.getBoundingClientRect().width > 0 ? probe.getBoundingClientRect().width / 100 : fontSize * 0.6;
                const col = Math.max(1, Math.round((e.clientX - rect.left - measuredCodeLeftRef.current) / charWidth) + 1);
                lspRef.current.requestHover(line, Math.min(col, (lines[line - 1] ?? "").length + 1));
            }
        },
        // `lines` (not lines.length): the LSP hover clamp reads the hovered
        // line's own text, and this is a plain DOM mousemove handler — the
        // identity churn on content edits is invisible.
        [editMode, fontSize, highlightCurrentLine, hoverSymbolTooltips, hoveredLine, hoverTipLine, measuredLineHeight, measuredCodeTop, lines]
    );
    const handleCodeMouseLeave = React.useCallback(() => {
        setHoveredLine(null);
        setHoverTipLine(null);
    }, []);
    // Clicking a line "pins" the highlight on it — useful for keyboard
    // users and screen-magnifier users who can't keep the mouse hovered.
    // ─── go-to-definition + breakpoint strip (VIEW mode) ───────────────
    // Two extra view-mode click gestures live here, hit-tested by
    // x-offset so they NEVER steal clicks from the existing gutter
    // elements:
    //   • Ctrl/Cmd+Click on a word → go-to-definition (the same
    //     praxis:goto-declaration event ⌘⇧B dispatches; page.tsx already
    //     listens). Only a plain modifier click — Alt+Click multi-cursor
    //     doesn't exist in view mode but Shift/Ctrl+drag selections keep
    //     their native behavior.
    //   • A click in the leftmost ~10px strip (only when a reserved
    //     gutter exists — codeFolding's chevron gutter or the blame
    //     column) toggles a breakpoint. Chevron BUTTONS cover the fold
    //     gutter on symbol lines and stop propagation, so they always
    //     keep their clicks; the blame rows have no click handlers.
    /** Last (line, col) clicked in VIEW mode — F12 / ⇧F12 resolve the
     *  word under the "caret" from it (view mode has no real caret). */
    const lastViewClickRef = React.useRef<{ line: number; col: number } | null>(null);
    /** Transient symbol stashed at Ctrl/Cmd+Click (view mode) so
     *  getSelectedSymbol — which the page's goto-declaration handler
     *  re-derives through the imperative ref — resolves the CLICKED word
     *  (a plain view-mode click collapses the DOM selection, so there is
     *  nothing else to read). Self-expires so it can't go stale. */
    const pendingGotoSymbolRef = React.useRef<string | null>(null);
    const setPendingGotoSymbol = React.useCallback((symbol: string) => {
        pendingGotoSymbolRef.current = symbol;
        window.setTimeout(() => {
            // Only clear OUR value — a newer click may have replaced it.
            if (pendingGotoSymbolRef.current === symbol) {
                pendingGotoSymbolRef.current = null;
            }
        }, 5000);
    }, []);
    /** Dispatch the go-to-definition action for a symbol, LSP-FIRST:
     *  when the sidecar resolves a semantic target the jump goes through
     *  the page's `praxis:open-reference` listener (the same guarded
     *  file-switch + line-jump path the peek popup rows use); external
     *  (stdlib/site-packages) definitions report themselves; otherwise
     *  the event falls back to the page's text-search handler. The
     *  detail.symbol payload lets the page skip re-deriving the word. */
    const dispatchGotoDefinition = React.useCallback(
        async (symbol: string, position?: { line: number; col: number } | null) => {
            if (!symbol) return;
            // Stash the symbol for getSelectedSymbol() (the fallback path).
            setPendingGotoSymbol(symbol);
            // The LSP-first ladder (returns true when fully handled).
            const handled = await gotoDefinitionViaLsp(
                lspRef.current.status === "ready" ? lspRef.current : null,
                position ?? null,
                {
                    // An in-project target: jump via the page's guarded switch.
                    onJump: (t) => dispatchOpenReference({
                        folder: t.folderSlug,
                        folderSlug: t.folderSlug,
                        file: t.fileSlug,
                        fileSlug: t.fileSlug,
                        line: t.line,
                        snippet: "",
                    }),
                    // An external definition: announce it (a text-search fallback
                    // here would only surface same-name red herrings).
                    onExternal: () => {
                        window.dispatchEvent(new CustomEvent("praxis:lsp-external-definition", {detail: {symbol}}));
                    },
                }
            );
            // Fully handled — no fallback.
            if (handled) return;
            // The pre-LSP path: the page's dual full-text-search handler.
            window.dispatchEvent(
                new CustomEvent("praxis:goto-declaration", {detail: {symbol}})
            );
        },
        [setPendingGotoSymbol]
    );
    /** Effective per-glyph width, measured lazily from the hidden probe
     *  span (the same source openInlineAi uses — needed here because
     *  `charWidth` is declared after this block and the deps array of a
     *  useCallback can't reference it before initialization). */
    const probeCharWidth = React.useCallback((): number => {
        const probe = measureSpanRef.current;
        if (probe) {
            const w = probe.getBoundingClientRect().width;
            if (w > 0) return w / 100;
        }
        return fontSize * 0.6;
    }, [fontSize]);

    /** Open the peek-references popup anchored just below the caret /
     *  last click, LSP-FIRST: semantic hits fill the popup directly
     *  (hitsOverride); the popup's own full-text-search fetch remains
     *  the fallback. Declared AFTER probeCharWidth (it calls it, and a
     *  useCallback body may only reference bindings already
     *  initialized above it in the component body). */
    const openPeekReferences = React.useCallback(async () => {
        const symbol = resolveCaretSymbol();
        if (!symbol) return;
        let top: number;
        let left: number;
        if (editMode) {
            const ta = textareaRef.current;
            const start = ta ? ta.selectionStart : 0;
            const before = editContentRef.current.slice(0, start);
            const line = before.split("\n").length;
            const col = start - (before.lastIndexOf("\n") + 1);
            top = 16 + (line - 1) * EDIT_LINE_HEIGHT + EDIT_LINE_HEIGHT + 4;
            left = Math.max(8, col * probeCharWidth() + 8);
        } else {
            const cell = lastViewClickRef.current;
            const line = cell ? cell.line : Math.max(1, Math.min(lines.length, caretLineRef.current || 1));
            const col = cell ? cell.col : 1;
            top = lineTopRef.current(line) + EDIT_LINE_HEIGHT + 4;
            left = Math.max(8, measuredCodeLeftRef.current + col * probeCharWidth());
        }
        // Keep the popup inside the visible editor area (the card clips).
        const visibleH = scrollContainerRef.current?.clientHeight ?? 600;
        top = Math.max(8, Math.min(top, Math.max(8, visibleH - 300)));
        left = Math.min(left, 480);
        // The LSP-first ladder: semantic references when the sidecar
        // answers, the popup's text-search fetch otherwise.
        const lspHits = await referencesViaLsp(
            lspRef.current.status === "ready" ? lspRef.current : null,
            resolveCaretPosition()
        );
        if (lspHits) {
            // Semantic hits — the popup shows these verbatim.
            setPeekRefs({open: true, symbol, anchor: {top, left}, hitsOverride: lspHits});
            return;
        }
        // The fallback — the popup fetches through /api/full-text-search.
        setPeekRefs({open: true, symbol, anchor: {top, left}});
        // Deliberately partial deps (the original pattern): every other
        // input is a stable ref (textareaRef, editContentRef,
        // lastViewClickRef, caretLineRef, lineTopRef, measuredCodeLeftRef,
        // scrollContainerRef, lspRef) or read fresh at call time
        // (resolveCaretSymbol, resolveCaretPosition), so the callback
        // stays valid without churning identity per render.
    }, [editMode, lines.length, probeCharWidth]); // eslint-disable-line react-hooks/exhaustive-deps
    const handleCodeClick = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!codeBodyRef.current) return;
            const rect = codeBodyRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const scrolledY = y + codeBodyRef.current.scrollTop;
            const line = Math.floor((scrolledY - measuredCodeTop) / measuredLineHeight) + 1;
            // ── Ctrl/Cmd+Click on a word → go-to-definition.
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
                if (line >= 1 && line <= lines.length) {
                    const codeLeft = measuredCodeLeftRef.current;
                    const col = Math.round((x - codeLeft) / probeCharWidth()) + 1;
                    const word = wordAt(lines[line - 1] ?? "", col);
                    if (word) {
                        // The click's own (line, col) rides along — the LSP ladder
                        // resolves THAT position; the fallback stays symbol-only.
                        void dispatchGotoDefinition(word, {line, col});
                        return;
                    }
                }
                return;
            }
            // ── Breakpoint strip click (the reserved left gutter zone).
            // Only when the viewer actually RESERVED a left strip — otherwise
            // the zone overlaps the line numbers themselves.
            if (
                isPythonFile &&
                x <= VIEW_GUTTER_BREAKPOINT_PX &&
                (codeFolding || showBlameGutter) &&
                line >= 1 &&
                line <= lines.length
            ) {
                toggleBreakpointAt(line);
                return;
            }
            if (line >= 1 && line <= lines.length) {
                // Stash the clicked cell so F12 / ⇧F12 (which fire at the root
                // wrapper, without mouse coordinates) resolve the same word.
                const col = Math.round((x - measuredCodeLeftRef.current) / probeCharWidth()) + 1;
                lastViewClickRef.current = {line, col};
                // clicking a rendered line in VIEW mode
                // moves the "caret" (caretLineRef) to that line, so the View
                // menu's "Toggle bookmark", the gutter markers and F2 /
                // Shift+F2 navigation act on the line the user actually clicked
                // — not a stale line left over from the last edit-mode caret or
                // jump. The footer's Ln readout updates too (col is unknown in
                // view mode → report 1). Previously this early-returned unless
                // highlightCurrentLine was on, so the caret silently stayed
                // wherever the last edit/jump left it.
                noteCaretLine(line);
                onCursorPositionChangeRef.current?.(line, 1);
                if (highlightCurrentLine) setClickedLine(line);
            }
        },
        // `lines` (not lines.length): the Ctrl+Click go-to-definition branch
        // resolves the clicked word from the clicked line's own text.
        [highlightCurrentLine, measuredLineHeight, measuredCodeTop, lines, noteCaretLine, isPythonFile, codeFolding, showBlameGutter, toggleBreakpointAt, dispatchGotoDefinition, probeCharWidth]
    );
    // Double-clicking a word selects THAT WORD (the browser's native
    // behavior), which is what users expect when they double-click a
    // keyword to copy it or to feed it to Ctrl+F. The previous custom
    // handler replaced the selection with the WHOLE line computed from
    // pixel math — which drifts to the wrong line when word-wrap is on
    // or blocks are folded, so "double-clicking a keyword selected
    // another keyword". We now only pin the line
    // highlight (same math the hover/click handlers use — consistent
    // with the rendered rows) and let the browser own the selection.
    // Triple-click still selects the line natively.
    const handleCodeDoubleClick = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (editMode) return; // textarea handles its own double-click
            if (!codeBodyRef.current) return;
            const rect = codeBodyRef.current.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const scrolledY = y + codeBodyRef.current.scrollTop;
            const line = Math.floor((scrolledY - measuredCodeTop) / measuredLineHeight) + 1;
            // Pin the highlight line (visible-row index — same space the
            // highlight overlay renders in). Guard the bounds; if the math
            // is off the selection is still native + correct.
            if (line >= 1 && line <= lines.length) setClickedLine(line);
        },
        [editMode, measuredLineHeight, measuredCodeTop, lines.length]
    );
    // The active highlight line: prefer the clicked (pinned) line; fall
    // back to the hovered line; null when neither is set.
    const activeHighlightLine = clickedLine ?? hoveredLine;

    // flash timers for the jump overlay — hold the bright
    // band ~150 ms, then fade over ~1.3 s and unmount. Keyed on the nonce
    // so a second jump restarts the sequence.
    const jumpFlashNonce = jumpFlash?.nonce ?? 0;
    React.useEffect(() => {
        if (jumpFlashNonce === 0) return;
        const t1 = window.setTimeout(
            () => setJumpFlash((f) => (f ? {...f, fading: true} : null)),
            150
        );
        const t2 = window.setTimeout(() => setJumpFlash(null), 1600);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [jumpFlashNonce]);

    // Save handler — reads from the textarea, not CodeMirror.
    // NOTE: uses onDirtyChangeRef.current (set in the effect below) so
    // the callback identity doesn't enter this memo's deps and cause
    // re-creation on every parent render.
    const handleSaveEdit = React.useCallback(async (opts?: { keepEditMode?: boolean }) => {
        if (!onSaveEdit) return;
        // cancel any pending autosave timer before
        // saving manually — otherwise the timer fires afterwards and issues
        // a second write of the same (or older) content.
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
        const contentToSave = editContent;
        setSaving(true);
        setAutoSaveStatus("saving");
        try {
            // Pass the file identity so the parent can reject this save if
            // the user already switched to a different file.
            await onSaveEdit(contentToSave, {folderSlug, fileSlug});
            if (!opts?.keepEditMode) setEditMode(false);
            setAutoSaveStatus("saved");
            // After a successful save, the content matches disk → not dirty.
            // Use the ref so we don't need onDirtyChange in the deps array.
            prevDirtyRef.current = false;
            onDirtyChangeRef.current?.(false);
            setTimeout(() => setAutoSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
            // Plan 1d — the save (with format-on-save enabled) rewrites the
            // buffer on the server; re-check IMMEDIATELY so the underlines
            // match the new text instead of holding stale marks for the
            // 500 ms debounce.
            spellRecheckNowRef.current?.();
        } catch {
            setAutoSaveStatus("idle");
        } finally {
            setSaving(false);
        }
    }, [onSaveEdit, editContent, folderSlug, fileSlug]);

    // Vim :w hook — the engine's executeCommand("w") calls it. Wired to the
    // real save path (the old controller only had a null hook, so ":w"
    // printed "no save hook" forever).
    React.useEffect(() => {
        vimSaveRef.current = () => {
            void handleSaveEdit();
        };
    }, [handleSaveEdit]);

    // Notify parent when dirty state changes — when editContent differs
    // from the on-disk code, the tab is dirty; when they match (or edit
    // mode is off), it's clean. Used to gate close-tab confirmation.
    //
    // CRITICAL: We use the ref-based pattern declared above (onDirtyChangeRef
    // + prevDirtyRef) so the effect doesn't depend on the callback's
    // identity. Without this, the parent's inline arrow creates a new
    // reference every render → effect fires → setTabDirty → re-render →
    // new callback → effect fires again → infinite loop → "Maximum update
    // depth exceeded" crash.
    React.useEffect(() => {
        const dirty = editMode && editContent !== code;
        if (dirty !== prevDirtyRef.current) {
            prevDirtyRef.current = dirty;
            onDirtyChangeRef.current?.(dirty);
        }
    }, [editMode, editContent, code]);

    // Edit content change handler with auto-save debounce.
    // scheduleAiCompletionRef is assigned below (after the
    // scheduleAiCompletion callback is defined) — we use a ref-stash so
    // handleEditChange can call it without a forward-reference.
    const scheduleAiCompletionRef = React.useRef<(ta: HTMLTextAreaElement | null) => void>(() => {
    });
    // ─── undo/redo over the snapshot stacks ───────────────────
    const undoFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        const ta = textareaRef.current;
        const current: UndoSnapshot = {
            content: editContentRef.current,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0
        };
        const snap = stack.pop()!;
        redoStackRef.current.push(current);
        undoSuspendRef.current = true;
        setEditContent(snap.content);
        // Direct state write — NOT handleEditChange — so the restore itself
        // never pushes an undo entry. Re-arm the normal path afterwards.
        requestAnimationFrame(() => {
            undoSuspendRef.current = false;
            const t = textareaRef.current;
            if (t) {
                t.focus();
                t.setSelectionRange(
                    Math.min(snap.selStart, snap.content.length),
                    Math.min(snap.selEnd, snap.content.length)
                );
            }
        });
    }, []);
    const redoFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const stack = redoStackRef.current;
        if (stack.length === 0) return;
        const ta = textareaRef.current;
        const current: UndoSnapshot = {
            content: editContentRef.current,
            selStart: ta ? ta.selectionStart : 0,
            selEnd: ta ? ta.selectionEnd : 0
        };
        const snap = stack.pop()!;
        undoStackRef.current.push(current);
        undoSuspendRef.current = true;
        setEditContent(snap.content);
        requestAnimationFrame(() => {
            undoSuspendRef.current = false;
            const t = textareaRef.current;
            if (t) {
                t.focus();
                t.setSelectionRange(
                    Math.min(snap.selStart, snap.content.length),
                    Math.min(snap.selEnd, snap.content.length)
                );
            }
        });
    }, []);
    // ref mirror so handleEditChange (stable identity)
    // can end the tabstop session on any real edit without depending
    // on the state value.
    const activeTabstopsRef = React.useRef<React.ComponentState>(null);
    React.useEffect(() => {
        activeTabstopsRef.current = activeTabstops;
    }, [activeTabstops]);


    const handleEditChange = React.useCallback((newContent: string) => {
        // a snippet-tabstop session only survives caret
        // moves; any CONTENT change (typing, paste, undo…) ends it — the
        // ranges are offsets into the old buffer and would drift.
        if (activeTabstopsRef.current) setActiveTabstops(null);
        // ─── push the PREVIOUS buffer onto the undo stack ────
        // Typing bursts (small deltas within UNDO_COALESCE_MS) coalesce
        // into one entry; structural edits (newline, format, paste,
        // replace) always start a fresh entry so one Ctrl+Z reverts them
        // as a unit.
        if (!undoSuspendRef.current) {
            const prev = editContentRef.current;
            const ta = textareaRef.current;
            const now = Date.now();
            const delta = Math.abs(newContent.length - prev.length);
            // Line-count change (Enter, paste-with-newlines, format…) always
            // starts a fresh undo entry — never coalesced into a typing burst.
            const lineCountChanged =
                newContent.split("\n").length !== prev.split("\n").length;
            const coalesce =
                now - lastEditAtRef.current < UNDO_COALESCE_MS &&
                delta <= 2 &&
                !lineCountChanged &&
                undoStackRef.current.length > 0;
            if (!coalesce) {
                undoStackRef.current.push({
                    content: prev,
                    selStart: ta ? ta.selectionStart : 0,
                    selEnd: ta ? ta.selectionEnd : 0
                });
                if (undoStackRef.current.length > UNDO_STACK_MAX) {
                    undoStackRef.current.shift();
                }
            }
            redoStackRef.current = [];
            lastEditAtRef.current = now;
        }
        setEditContent(newContent);
        // typing hot-window — swap the Prism backdrop for a
        // plain <pre> while the user is actively typing. setHighlightHot(true)
        // is a no-op re-render when already hot (React bails on same value).
        if (highlightHotTimerRef.current) clearTimeout(highlightHotTimerRef.current);
        if (newContent.length <= EDIT_PLAIN_MAX_CHARS) {
            setHighlightHot(true);
            highlightHotTimerRef.current = setTimeout(() => {
                highlightHotTimerRef.current = null;
                setHighlightHot(false);
            }, EDIT_HIGHLIGHT_HOT_MS);
        } else {
            // Huge buffer — plain backdrop permanently; no timer churn.
            setHighlightHot(false);
        }
        if (autoSaveDelayMs > 0 && onSaveEdit) {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = setTimeout(() => {
                autoSaveTimerRef.current = null;
                if (newContent !== code) {
                    setSaving(true);
                    setAutoSaveStatus("saving");
                    // capture the file identity at typing time and
                    // send it with the save — the parent rejects the write if the
                    // selection has moved to another file by the time the timer
                    // fires. (The old code also captured `onSaveEdit`, so a quick
                    // tab switch wrote file A's buffer into file B.)
                    onSaveEdit(newContent, {folderSlug, fileSlug}).then(() => {
                        setAutoSaveStatus("saved");
                        setTimeout(() => setAutoSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
                    }).catch(() => setAutoSaveStatus("idle")).finally(() => setSaving(false));
                }
            }, autoSaveDelayMs);
        }
        // Schedule an AI completion fetch (covers paste, IME, programmatic
        // edits — paths the textarea's onKeyUp handler misses). The
        // textareaRef may not have updated yet, so defer to next tick.
        requestAnimationFrame(() => {
            scheduleAiCompletionRef.current(textareaRef.current);
            // The offline Python completion popup tracks the caret too.
            schedulePyCompletion();
        });
    }, [autoSaveDelayMs, onSaveEdit, code, folderSlug, fileSlug]);

    /** deterministic Extract function / variable.
     *  Works on the current selection (or the menu's stashed one) in
     *  EDIT mode. Pure text transform — see lib/refactor.ts. */
    const handleExtractRefactor = React.useCallback(
        (kind: "function" | "variable") => {
            const ta = textareaRef.current;
            if (!ta) return;
            const sel =
                ta.selectionStart !== ta.selectionEnd
                    ? {start: ta.selectionStart, end: ta.selectionEnd}
                    : savedSelectionRef.current
                        ? {...savedSelectionRef.current}
                        : null;
            if (!sel || sel.end <= sel.start) {
                aiToast({
                    title: "Nothing selected",
                    description: `Select the code to extract into a ${kind} first.`,
                    variant: "warning"
                });
                return;
            }
            const fallback = kind === "function" ? "extracted" : "value";
            const name = window.prompt(
                kind === "function"
                    ? "Name for the extracted function:"
                    : "Name for the extracted variable:",
                fallback
            );
            if (name === null) return; // cancelled
            const result =
                kind === "function"
                    ? extractFunction(editContentRef.current, sel, name.trim())
                    : extractVariable(editContentRef.current, sel, name.trim());
            if (!result) {
                aiToast({
                    title: "Could not extract",
                    description: `"${name.trim()}" is not a valid Python identifier, or the selection is empty.`,
                    variant: "destructive"
                });
                return;
            }
            handleEditChange(result.source);
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.setSelectionRange(result.caret, result.caret);
                }
            });
        },
        [aiToast, handleEditChange]
    );

    // clear the hot timer on unmount / mode switch so it
    // can't flip the backdrop after the editor closed.
    React.useEffect(() => {
        return () => {
            if (highlightHotTimerRef.current) clearTimeout(highlightHotTimerRef.current);
        };
    }, []);
    React.useEffect(() => {
        if (!editMode && highlightHotTimerRef.current) {
            clearTimeout(highlightHotTimerRef.current);
            highlightHotTimerRef.current = null;
        }
    }, [editMode]);

    // Keep the scheduleAiCompletion ref in sync (assigned after the
    // callback is defined below).
    // (see scheduleAiCompletion definition further down)

    // Cleanup
    React.useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, []);

    // Reset on file change. If the user has unsaved edits in the
    // current file AND the parent provided an onDirtyChange callback
    // (so the tab is marked dirty), prompt before clearing — without
    // the guard, clicking another file in the sidebar would silently
    // discard the edits. We use a ref to track whether edits
    // are dirty so the effect doesn't need editContent/code in its deps
    // (which would re-prompt on every keystroke).
    const isDirtyRef = React.useRef(false);
    React.useEffect(() => {
        isDirtyRef.current = editMode && editContent !== code;
    }, [editMode, editContent, code]);

    React.useEffect(() => {
        // Only prompt when the file name actually changes (not on first
        // mount when fileName is initially set).
        if (prevFileNameRef.current === undefined) {
            prevFileNameRef.current = fileName;
        } else if (prevFileNameRef.current !== fileName) {
            // disarm any pending autosave timer BEFORE the
            // switch — the timer captured the previous file's buffer and
            // callback, and firing after the switch wrote file A's content
            // into file B.
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
            if (isDirtyRef.current) {
                // the IDE-styled AlertDialog replaces the
                // browser's native confirm box. The edit state is wiped ONLY
                // after the user confirms; cancelling keeps the buffer (the
                // parent already changed the selection, so — exactly like the
                // old behavior — the unsaved edits stay available until the
                // user explicitly re-enters and cancels edit mode).
                const prevName = prevFileNameRef.current;
                void confirmEditGuard({
                    fromFile: prevName,
                    toWhat: fileName,
                    action: `Switching to "${fileName}"`
                }).then((confirmed) => {
                    if (!confirmed) return;
                    prevFileNameRef.current = fileName;
                    setExpanded(!collapsedByDefault);
                    setEditMode(false);
                    setEditContent("");
                    clearUndoHistory();
                    savedSelectionRef.current = null;
                });
                return;
            }
            prevFileNameRef.current = fileName;
        }
        setEditMode(false);
        setEditContent("");
        // the undo history belongs to the previous file's buffer —
        // reset it with the rest of the edit state.
        clearUndoHistory();
        savedSelectionRef.current = null;
        // (FIX) Only re-apply the collapsed-by-default preference when a
        // DIFFERENT file opens (or on first mount). This effect ALSO
        // re-runs whenever the `collapsedByDefault` prop value changes
        // (settings re-merge / .praxis/settings.json project overrides
        // arriving after mount) — re-applying it then silently STOMPED a
        // manual "Show full code" toggle mid-session, which read as the
        // button being "reversed". The preference still applies to every
        // newly opened file.
        if (expandedForFileRef.current !== fileName) {
            expandedForFileRef.current = fileName;
            setExpanded(!collapsedByDefault);
        }
    }, [fileName, collapsedByDefault, clearUndoHistory, confirmEditGuard]);
    const prevFileNameRef = React.useRef<string | undefined>(undefined);
    /** Last file the collapsed-by-default preference was applied to. */
    const expandedForFileRef = React.useRef<string | undefined>(undefined);

    // Close the find bar whenever we leave edit mode.
    React.useEffect(() => {
        if (!editMode) {
            setShowFind(false);
            setShowReplace(false);
            setFindText("");
            setReplaceText("");
            setCurrentMatch(0);
            setTotalMatches(0);
        }
    }, [editMode]);

    // Compute find matches. Supports two modes:
    // - Literal: case-insensitive substring search (default)
    // - Regex: the query is a regex pattern; matches capture groups
    //   are used to determine the match span. Invalid regex → no matches.
    const findMatches = React.useMemo<Array<{ start: number; end: number }>>(
        () => findMatchesIn(editContent, findText, useRegex),
        [editContent, findText, useRegex]
    );

    // ─── View-mode find matches — OCCURRENCE-level (row + column),
    //     computed against the RENDERED text. The old ReadModeFindBar
    //     only matched LINES and never highlighted anything, which read
    //     as "the up/down arrows are not working to highlight the next
    // or previous occurrence" — gave every occurrence a
    //     marker and the arrows step through them.
    // the list is now matched against `visibleCode`
    //     (folds applied; truncated at the collapse cut when collapsed)
    //     and each hit records its DISPLAY ROW, not the raw file line.
    //     The old version matched the raw buffer, so with a folded block
    //     above the hit the highlight rect AND the scroll target landed
    //     BELOW the real position — and with the default collapsed
    //     preview (codeCollapsedByDefault) hits past the cut were
    //     counted but never rendered, which is exactly "the arrows work
    // but it does not scroll to the items below".
    //     Rows make the overlay, the counter and the scroll all agree.
    const viewFindMatches = React.useMemo<Array<{ row: number; start: number; end: number }>>(() => {
        if (editMode) return [];
        // Exactly what renderSimpleView renders: visibleCode, clipped to
        // the collapse cut when the viewer is in its collapsed preview
        // (the matching math lives in lib/find-occurrences.ts).
        const displayed = displayedRowsText(visibleCode, expanded, isCollapsible, collapsedLineCount);
        return viewFindOccurrences(displayed, findText);
        // NOTE: collapsedLineCount is deliberately absent (historical deps).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [findText, visibleCode, expanded, isCollapsible, editMode]);

    // keep the code EXPANDED while the find bar is open
    // in view mode. Files open in the collapsed preview (8 rows) by
    // default; matches further down could never be scrolled to because
    // those rows were not rendered. Expanding here (on open, on every
    // keystroke, on every arrow step) guarantees every counted match is
    // actually on screen and reachable by the scroll effect in
    // ReadModeFindBar. Closing the bar keeps the file expanded — the
    // user just used find to navigate, yanking the view back would be
    // hostile.
    React.useEffect(() => {
        if (showFind && !editMode && isCollapsible && !expanded) {
            setExpanded(true);
        }
    }, [showFind, editMode, isCollapsible, expanded]);

    // Sync totalMatches + clamp currentMatch whenever matches change.
    // in VIEW mode the match list is `viewFindMatches`
    // (occurrence-level — line + column — so several hits on one line
    // count separately, like a real editor), in edit mode it stays the
    // global-offset `findMatches` (drives the textarea selection).
    React.useEffect(() => {
        const n = editMode ? findMatches.length : viewFindMatches.length;
        setTotalMatches(n);
        setCurrentMatch((prev) => {
            if (n === 0) return 0;
            if (prev >= n) return 0;
            return prev;
        });
    }, [findMatches, viewFindMatches, editMode]);

    const applyMatch = React.useCallback((matchIdx: number) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const m = findMatches[matchIdx];
        if (!m) return;
        //
        // removed from the input box"): typing in the find input recomputes
        // findMatches → this effect fired → ta.focus yanked the caret out
        // of the find input on every keystroke. Only focus the textarea
        // when the caret is NOT inside the find/replace inputs (i.e. the
        // user clicked Next/Prev). The selection + scroll still update so
        // the match is visible either way.
        const active = document.activeElement;
        const findBarFocused =
            active === findInputRef.current || active === replaceInputRef.current;
        if (!findBarFocused) ta.focus();
        ta.setSelectionRange(m.start, m.end);
        // Scroll the match into view: estimate the line and center it.
        // The textarea uses `leading-[1.6]` (Tailwind = 1.6), so the
        // actual line height is fontSize * 1.6. The +16 is the textarea's
        // `padding: 1rem …` top inset — without it the target drifts one
        // line high on long files.
        const lineNumber = newlineCountBefore(editContent, m.start);

        const lineHeightPx = fontSize * 1.6;
        ta.scrollTop = centeredTextareaScrollTop(lineNumber, lineHeightPx, ta.clientHeight);
        // the textarea is min-height 100% of its wrapper —
        // when the wrapper (not the textarea) is the element that
        // overflows, ta.scrollTop is a no-op and the OUTER scroll container
        // (scrollContainerRef) is the one that has to move. Scroll it by the
        // caret's absolute Y inside the container's content, measured from
        // the two elements' bounding rects (robust to gutters/padding).
        const sc = scrollContainerRef.current;
        if (sc && ta.scrollHeight <= ta.clientHeight + 1) {
            const taRect = ta.getBoundingClientRect();
            const scRect = sc.getBoundingClientRect();
            const caretYInContent = sc.scrollTop + (taRect.top - scRect.top) + 16 + lineNumber * lineHeightPx;
            // Instant jump — same rationale as the view-mode find scroll.
            sc.scrollTo({
                top: Math.max(0, caretYInContent - sc.clientHeight / 2)
            });
        }
    }, [findMatches, editContent, fontSize, scrollContainerRef]);

    // When the current match index or matches change, select it in the textarea.
    React.useEffect(() => {
        if (!showFind || findMatches.length === 0) return;
        applyMatch(Math.min(currentMatch, findMatches.length - 1));
    }, [showFind, currentMatch, findMatches, applyMatch]);

    const handleFindNext = React.useCallback(() => {
        const n = editMode ? findMatches.length : viewFindMatches.length;
        if (n === 0) return;
        setCurrentMatch((prev) => (prev + 1) % n);
    }, [findMatches.length, viewFindMatches.length, editMode]);

    const handleFindPrev = React.useCallback(() => {
        const n = editMode ? findMatches.length : viewFindMatches.length;
        if (n === 0) return;
        setCurrentMatch((prev) => (prev - 1 + n) % n);
    }, [findMatches.length, viewFindMatches.length, editMode]);

    // ─── Replace handlers (edit mode only) ─────────────────────────
    // Replace the current match and advance to the next. Replace-all
    // replaces every match in one pass. Both call handleEditChange so
    // the textarea content stays in sync + auto-save fires if enabled.
    const replaceInputRef = React.useRef<HTMLInputElement>(null);

    const handleReplaceCurrent = React.useCallback(() => {
        if (findMatches.length === 0 || !findText) return;
        const m = findMatches[currentMatch];
        if (!m) return;
        const newContent = editContent.slice(0, m.start) + replaceText + editContent.slice(m.end);
        handleEditChange(newContent);
        // After replacing, the match indices shift by (replaceText.length - findText.length).
        // Easiest: re-derive matches on next render (findMatches is memoized
        // on editContent + findText, so it'll recompute). Advance to the
        // next match (or wrap).
        const delta = replaceText.length - findText.length;
        // Adjust all subsequent match offsets so the currentMatch pointer
        // still points at a valid match after the content change. We do
        // this by directly manipulating the memoized array is not possible,
        // so we just let the memo recompute and reset currentMatch to 0
        // if out of bounds (the clamp effect at line ~555 handles it).
        void delta; // delta is implicitly applied via the new editContent.
        setCurrentMatch((prev) => (prev + 1) % Math.max(1, findMatches.length));
    }, [findMatches, currentMatch, editContent, findText, replaceText, handleEditChange]);

    const handleReplaceAll = React.useCallback(() => {
        if (findMatches.length === 0 || !findText) return;
        // Split-and-join is the simplest correct approach for case-insensitive
        // replace. We use a global regex with escaped metacharacters so the
        // findText is treated as a literal.
        const newContent = replaceAllLiteral(editContent, findText, replaceText);
        if (newContent !== editContent) {
            handleEditChange(newContent);
        }
        setCurrentMatch(0);
    }, [findMatches, editContent, findText, replaceText, handleEditChange]);

    const openFindBar = React.useCallback(() => {
        // PREFILL: if a word/selection exists, seed the
        // find input with it — the VSCode Ctrl+F convention. In edit mode
        // the textarea's own selection is used; in read mode the DOM
        // selection (e.g. a double-clicked keyword — now word-level, see
        // handleCodeDoubleClick). The input's mount effect selects the
        // prefilled text so typing replaces it.
        let selected = "";
        if (editMode) {
            const ta = textareaRef.current;
            if (
                ta &&
                ta.selectionStart !== ta.selectionEnd &&
                // Ignore multi-line selections — pasting a paragraph into a
                // single-line find input is never what the user wants.
                !ta.value.slice(ta.selectionStart, ta.selectionEnd).includes("\n")
            ) {
                selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
            }
        } else {
            const domSel = window.getSelection?.()?.toString() ?? "";
            if (domSel && !domSel.includes("\n") && domSel.length <= 200) {
                selected = domSel;
            }
        }
        if (selected) setFindText(selected);
        setShowFind(true);
        // Opening via Find (not Replace) — collapse the replace row.
        setShowReplace(false);
        // Focus the input on the next tick so it's mounted. In read mode
        // the rendered input is the ReadModeFindBar's own — its mount
        // effect focuses it (findInputRef is null there, so this rAF is a
        // harmless no-op).
        requestAnimationFrame(() => {
            const el = findInputRef.current;
            if (el) {
                el.focus();
                // Select prefilled text so typing replaces it.
                el.select();
            }
        });
    }, [editMode]);

    // ─── Ref-stash for handleSaveEdit + handleEditChange ────────────
    // These two callbacks depend on `editContent` (which changes on
    // every keystroke). If we put them directly in the
    // useImperativeHandle deps array, the handle re-creates on every
    // keystroke. Instead we stash the latest version in refs and read
    // ref.current inside the imperative methods — same pattern already
    // used for onDirtyChange / onCursorPositionChange above.
    const handleSaveEditRef = React.useRef(handleSaveEdit);
    React.useEffect(() => {
        handleSaveEditRef.current = handleSaveEdit;
    }, [handleSaveEdit]);
    const handleEditChangeRef = React.useRef(handleEditChange);
    React.useEffect(() => {
        handleEditChangeRef.current = handleEditChange;
    }, [handleEditChange]);
    // Stash the current editContent + editMode + folder/file slugs so
    // the imperative methods read fresh values without entering the deps.
    const editContentRef = React.useRef(editContent);
    React.useEffect(() => {
        editContentRef.current = editContent;
    }, [editContent]);
    const editModeRef = React.useRef(editMode);
    React.useEffect(() => {
        editModeRef.current = editMode;
    }, [editMode]);
    // mirrors the on-disk `code` prop so handle methods can
    // read the view-mode content without entering their deps arrays.
    const sourceRef = React.useRef(code);
    React.useEffect(() => {
        sourceRef.current = code;
    }, [code]);
    // Sync the edit-mode squiggle overlay when edit mode toggles,
    // content changes (which may change the textarea's scrollHeight),
    // or diagnostics update. Uses a rAF to ensure the textarea has
    // re-rendered before we read scrollTop.
    React.useEffect(() => {
        if (!editMode) return;
        const raf = requestAnimationFrame(() => syncEditSquiggleScroll());
        return () => cancelAnimationFrame(raf);
    }, [editMode, editContent, diagnostics, fontSize, syncEditSquiggleScroll]);
    const onSaveEditRef = React.useRef(onSaveEdit);
    React.useEffect(() => {
        onSaveEditRef.current = onSaveEdit;
    }, [onSaveEdit]);
    const folderSlugRef = React.useRef(folderSlug);
    React.useEffect(() => {
        folderSlugRef.current = folderSlug;
    }, [folderSlug]);
    // the file's NAME (kept in a ref so the format
    // callbacks can gate the if/elif parentheses post-processor on
    // Python files without re-creating on every rename).
    const fileNameRef = React.useRef(fileName);
    React.useEffect(() => {
        fileNameRef.current = fileName;
    }, [fileName]);
    const fileSlugRef = React.useRef(fileSlug);
    React.useEffect(() => {
        fileSlugRef.current = fileSlug;
    }, [fileSlug]);
    // ─── Imperative API exposed to the parent via ref ───────────────
    // Lets the menu bar (File → Save, Edit → Find/Format/Cut/Copy/Paste/
    // Undo/Redo/Replace) trigger editor actions without lifting state.
    // All methods are no-ops when the editor is in read mode (except
    // save + openFind + openReplace, which work in both modes — save
    // by entering edit mode first if needed).
    //
    // Uses the ref-stash pattern (handleSaveEditRef, handleEditChangeRef,
    // editContentRef, editModeRef, etc.) so the handle doesn't re-create
    // on every keystroke — the deps array is just [openFindBar].
    // ─── shared editor-action callbacks ────────────────────
    // Stable useCallbacks (they only touch refs) shared by BOTH the
    // imperative handle (menu/parent calls) and the textarea keydown
    // handler — one implementation, two entry points.
    const commentToggleFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const edit = togglePythonComments(editContentRef.current, ta.selectionStart, ta.selectionEnd);
        if (!edit) return;
        handleEditChangeRef.current(edit.content);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(edit.selStart, edit.selEnd);
        });
    }, []);
    const duplicateLineFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const edit = duplicateLinesBlock(editContentRef.current, ta.selectionStart, ta.selectionEnd);
        handleEditChangeRef.current(edit.content);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(edit.selStart, edit.selEnd);
        });
    }, []);
    /** Word under the caret when nothing is selected (shared helper). */
    const wordAroundCaret = React.useCallback(() => {
        const ta = textareaRef.current;
        const src = editContentRef.current;
        if (!ta || !src) return null;
        return wordRangeAround(src, ta.selectionStart, ta.selectionEnd);
    }, []);
    /** the LIVE selection while the right-click menu is open.
     * Radix's focus steal collapses the textarea range (the
     *  run-selection bug), so selection-driven actions read the range
     * stashed at right-click time instead. Returns null when there is
     *  effectively no selection. */
    const effectiveEditRange = React.useCallback((): { start: number; end: number } | null => {
        const ta = textareaRef.current;
        if (!ta) return null;
        let start = ta.selectionStart;
        let end = ta.selectionEnd;
        if (start === end && savedSelectionRef.current && savedSelectionRef.current.start !== savedSelectionRef.current.end) {
            start = savedSelectionRef.current.start;
            end = savedSelectionRef.current.end;
        }
        return start !== end ? {start, end} : null;
    }, []);
    const convertCaseFn = React.useCallback(
        (kind: "upper" | "lower" | "title" | "camel" | "pascal" | "snake" | "kebab" | "constant") => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            const src = editContentRef.current;
            const target = wordAroundCaret();
            if (!target) return;
            // The identifier-style conversion table lives in
            // lib/editor-block-ops.ts (pure, unit-tested).
            const converted = convertIdentifierCase(target.text, kind);
            if (converted === null) return;
            handleEditChangeRef.current(src.slice(0, target.start) + converted + src.slice(target.end));
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(target.start, target.start + converted.length);
            });
        },
        [wordAroundCaret]
    );
    const trimTrailingFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const src = editContentRef.current;
        const trimmed = trimTrailingWhitespace(src);
        if (trimmed === src) return;
        handleEditChangeRef.current(trimmed);
    }, []);
    // ─── more line utilities (edit-mode right-click) ────────
    /** Delete the caret's line — or every selected line when the
     *  selection spans more than one. Cursor lands where the block was. */
    const deleteLinesFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const edit = deleteLinesBlock(editContentRef.current, ta.selectionStart, ta.selectionEnd);
        if (!edit) return;
        handleEditChangeRef.current(edit.content);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(edit.selStart, edit.selEnd);
        });
    }, []);
    /** Join the caret's line with the next one (single space between
     *  the trimmed halves); with a multi-line selection, join ALL of the
     *  selected lines into one. */
    const joinLinesFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const edit = joinLinesBlock(editContentRef.current, ta.selectionStart, ta.selectionEnd);
        if (!edit) return;
        handleEditChangeRef.current(edit.content);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(edit.selStart, edit.selEnd);
        });
    }, []);
    /** Split the selection (or the caret's line) at
     *  commas into one item per line — the Join twin. */
    const splitLinesFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const edit = splitLinesBlock(editContentRef.current, ta.selectionStart, ta.selectionEnd);
        if (!edit) return;
        handleEditChangeRef.current(edit.content);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(edit.selStart, edit.selEnd);
        });
    }, []);

    /** Surround the selection (or the word at the
     *  caret) with a delimiter pair. */
    const surroundSelectionFn = React.useCallback(
        (kind: "quotes" | "parens" | "brackets" | "braces") => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            const src = editContentRef.current;
            const effective = effectiveEditRange();
            if (!effective) return;
            // Word expansion + the delimiter pairs live in
            // lib/editor-block-ops.ts (pure, unit-tested).
            const edit = surroundRange(src, effective.start, effective.end, kind);
            if (!edit) return;
            handleEditChangeRef.current(edit.content);
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(edit.selStart, edit.selEnd);
            });
        },
        []
    );

    /** the LIVE selection text (empty when the caret is
     *  not a selection) — feeds “Send selection to terminal”. */
    const getSelectionTextFn = React.useCallback((): string => {
        const ta = textareaRef.current;
        if (!ta) return "";
        const src = editContentRef.current;
        const effective = effectiveEditRange();
        if (effective && effective.start !== effective.end) {
            return src.slice(effective.start, effective.end);
        }
        // Fallback: the caret's whole line (matches the Run Selection rule).
        const caret = effective?.start ?? ta.selectionStart;
        return lineTextAt(src, caret);
    }, []);

    /** Sort the selected lines alphabetically (case-insensitive).
     *  Multi-line selection required — the menu item is disabled
     *  otherwise. */
    const sortLinesFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const src = editContentRef.current;
        // Honor the right-click stash — the live range may be collapsed
        // by the menu's focus steal.
        const effective = effectiveEditRange();
        if (!effective) return;
        const edit = sortLinesBlock(src, effective.start, effective.end);
        if (!edit) return;
        handleEditChangeRef.current(edit.content);
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(edit.selStart, edit.selEnd);
        });
    }, [effectiveEditRange]);
    /* ── more selection utilities (edit-mode right-click) ──
     Unique (dedupe), reverse and shuffle the selected lines — the
     siblings Sort Selected Lines never had. All follow the same
     block-splice pattern. */
    const transformSelectedBlock = React.useCallback(
        (fn: (block: string[]) => string[]) => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            const src = editContentRef.current;
            const effective = effectiveEditRange();
            if (!effective) return;
            const edit = transformLinesBlock(src, effective.start, effective.end, fn);
            if (!edit) return;
            handleEditChangeRef.current(edit.content);
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(edit.selStart, edit.selEnd);
            });
        },
        [effectiveEditRange]
    );
    const uniqueLinesFn = React.useCallback(
        () => transformSelectedBlock(uniqueLines),
        [transformSelectedBlock]
    );
    const reverseLinesFn = React.useCallback(
        () => transformSelectedBlock(reverseLines),
        [transformSelectedBlock]
    );
    const shuffleLinesFn = React.useCallback(
        () => transformSelectedBlock((b) => shuffleLines(b)),
        [transformSelectedBlock]
    );
    /** toggle a bookmark on the caret's line — page.tsx owns
     *  the bookmark list and listens for `praxis:bookmark-toggle`. */
    const toggleBookmarkFn = React.useCallback(() => {
        const line = caretLineRef.current || 1;
        window.dispatchEvent(new CustomEvent("praxis:bookmark-toggle", {detail: {line}}));
    }, []);
    // "Copy path with line number" — VS Code's editor-context
    // classic (`abs/path/File.py:42`). Edit mode only (view mode has no
    // caret); the caret line comes from the synced ref.
    const copyFilePathWithLineFn = React.useCallback(async () => {
        const folder = folderSlugRef.current;
        const file = fileSlugRef.current;
        if (!folder || !file) {
            aiToast({title: "No file is open — nothing to copy."});
            return;
        }
        try {
            const res = await fetch(`/api/resolve-path?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`);
            const data = await res.json();
            if (!res.ok || !data.absPath) {
                aiToast({variant: "destructive", title: data.error ?? "Could not resolve path."});
                return;
            }
            const withLine = `${String(data.absPath)}:${caretLineRef.current}`;
            await navigator.clipboard.writeText(withLine);
            aiToast({title: "Copied path with line", description: withLine});
        } catch {
            aiToast({variant: "destructive", title: "Could not copy the path."});
        }
    }, [aiToast]);
    const copyFilePathFn = React.useCallback(async () => {
        const folder = folderSlugRef.current;
        const file = fileSlugRef.current;
        if (!folder || !file) {
            aiToast({title: "No file is open — nothing to copy."});
            return;
        }
        try {
            const res = await fetch(`/api/resolve-path?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`);
            const data = await res.json();
            if (!res.ok || !data.absPath) {
                aiToast({variant: "destructive", title: data.error ?? "Could not resolve path."});
                return;
            }
            await navigator.clipboard.writeText(String(data.absPath));
            aiToast({title: "Copied absolute path", description: String(data.absPath)});
        } catch {
            aiToast({variant: "destructive", title: "Could not copy the path."});
        }
    }, [aiToast]);
    const formatSelectionFn = React.useCallback(async () => {
        if (!editModeRef.current || !folderSlugRef.current || !fileSlugRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const src = editContentRef.current;
        // stash-aware selection (see effectiveEditRange) — the
        // live range may be collapsed while the menu is open.
        const effective = effectiveEditRange();
        if (!effective) return; // nothing selected — use Format Document
        const start = effective.start;
        const end = effective.end;
        const selected = src.slice(start, end);
        try {
            const res = await fetch("/api/format", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlugRef.current,
                    file: fileSlugRef.current,
                    content: selected,
                    mode: "string",
                    // the live Formatting options ride along (the
                    // server applies them; the client twin below matches).
                    settings: formatRequestSettings(loadSettings())
                })
            });
            const data = await res.json();
            // read `formatted` (the field the route actually sends;
            // the old `data.content` check made Format Selection a no-op).
            if (!res.ok || !data.ok) return;
            const raw = typeof data.formatted === "string" ? data.formatted : (typeof data.content === "string" ? data.content : null);
            if (raw == null) return;
            const formatted = applyFormatPostProcessors(raw, loadSettings(), fileNameRef.current);
            if (formatted === selected) return;
            handleEditChangeRef.current(src.slice(0, start) + formatted + src.slice(end));
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(start, start + formatted.length);
            });
        } catch { /* non-fatal */
        }
    }, []);
    const changeAllFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const target = wordAroundCaret();
        if (!target) return;
        ta.setSelectionRange(target.start, target.end);
        // Open Find & Replace prefilled with the word — the textarea-
        // adapted "Change All Occurrences" (replace-all in this file).
        openFindBar();
        setShowReplace(true);
        requestAnimationFrame(() => {
            if (findInputRef.current) {
                findInputRef.current.value = target.text;
                findInputRef.current.dispatchEvent(new Event("input", {bubbles: true}));
            }
        });
    }, [wordAroundCaret, openFindBar]);
    /** Fresh symbol list + fold keys (self-contained — no stale closures). */
    const computeFoldState = React.useCallback(() => {
        const syms = parsePythonSymbols(editContentRef.current);
        // The key mapper (type:name, line-disambiguated on repeats) lives
        // in lib/fold-view.ts — pure, unit-tested.
        return {syms, keyOf: buildFoldKeyMapper(syms)};
    }, []);
    const foldAllFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const {syms, keyOf} = computeFoldState();
        foldMutatedRef.current = true;
        setEditFoldedKeys(new Set(syms.map(keyOf)));
    }, [computeFoldState]);
    const unfoldAllFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        foldMutatedRef.current = true;
        setEditFoldedKeys(new Set());
    }, []);
    const foldCurrentFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const line = lineNumberAtOffset(editContentRef.current, ta.selectionStart);
        const {syms, keyOf} = computeFoldState();
        let best: PythonSymbol | null = null;
        for (const s of syms) {
            if (line >= s.line && line <= (s.endLine ?? s.line)) {
                if (!best || s.line > best.line) best = s;
            }
        }
        if (!best) return;
        const key = keyOf(best);
        foldMutatedRef.current = true;
        setEditFoldedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, [computeFoldState]);
    const runSelectionFn = React.useCallback(() => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const src = editContentRef.current;
        let start = ta.selectionStart;
        let end = ta.selectionEnd;
        // Opening the right-click context menu moves focus to the menu,
        // which can clear the textarea selection — when the LIVE selection
        // is collapsed, fall back to the selection stashed at right-click
        // so "Run Selection in Python" runs the text the user SELECTED.
        if (start === end && savedSelectionRef.current && savedSelectionRef.current.start !== savedSelectionRef.current.end) {
            start = savedSelectionRef.current.start;
            end = savedSelectionRef.current.end;
        }
        // The selection or the caret's line (PyCharm behavior), trimmed.
        const trimmed = runSelectionText(src, start, end);
        if (!trimmed) return;
        onRunSelectionRef.current?.(trimmed);
    }, []);

    /** Format Document (whole buffer) — shared by the menu and
     * the imperative handle. Mirrors the handle's original `format`.
     * two bug fixes + configurability —
     * • the response field is `formatted` (the old code read
     * `data.content`, which the route never sent, so Format Document
     * silently did NOTHING);
     * • the enabled post-processors from Settings → Editor →
     * Formatting are applied to the formatter output (auto
     * parentheses for if/elif conditions, final-newline…);
     * • failures now surface as an announcement instead of a silent
     * no-op (the route falls back to the built-in formatter when
     * black is missing, so real failures are rare). */
    const formatDocumentFn = React.useCallback(async () => {
        if (!folderSlugRef.current || !fileSlugRef.current) return;
        // VIEW mode: Format Document no longer silently no-ops — the click
        // SWITCHES TO THE EDITOR seeded with the formatted buffer (the
        // original goes on the undo stack first), exactly like the file
        // viewer's Auto-format: Ctrl+Z pops back, Save (⌘S) is the single
        // write path.
        const inEdit = editModeRef.current;
        const source = inEdit ? editContentRef.current : (sourceRef.current ?? "");
        try {
            const res = await fetch("/api/format", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlugRef.current,
                    file: fileSlugRef.current,
                    content: source,
                    mode: "string",
                    // The live Formatting options (quotes, blank lines, line
                    // endings…) — secrets stripped.
                    settings: formatRequestSettings(loadSettings())
                })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                window.dispatchEvent(new CustomEvent("praxis:announce", {
                    detail: {
                        title: "Format failed",
                        description: String(data.error ?? `HTTP ${res.status}`),
                        variant: "destructive"
                    }
                }));
                return;
            }
            const raw = typeof data.formatted === "string" ? data.formatted : (typeof data.content === "string" ? data.content : null);
            if (raw == null) return;
            // The ROUTE already ran the post passes on the server's copy of
            // the same settings — this client-side twin stays as a
            // belt-and-braces for any server that predates the settings
            // passthrough (identical options → identical output).
            const formatted = applyFormatPostProcessors(raw, loadSettings(), fileNameRef.current);
            if (inEdit) {
                if (formatted !== editContentRef.current) {
                    handleEditChangeRef.current(formatted);
                    // Plan 1d — the buffer changed shape in one shot; the spell
                    // underlines re-check now, not after the debounce.
                    spellRecheckNowRef.current?.();
                    if (data.fallback === "builtin") {
                        window.dispatchEvent(new CustomEvent("praxis:announce", {
                            detail: {
                                title: "Formatted (built-in)",
                                description: "black is not installed — used the built-in formatter. pip install black for full formatting."
                            }
                        }));
                    }
                }
                return;
            }
            // View mode → enter the editor with the formatted buffer.
            // the ORIGINAL disk text is pushed EXPLICITLY (with the
            // undo-suspend guard around the change call) — editContentRef
            // only syncs in an effect AFTER render, so handleEditChange's
            // own snapshot captured the STALE buffer (the previous file's
            // text or "") and Ctrl+Z after a view-mode Format Document
            // restored the WRONG content instead of the pre-format source.
            if (formatted !== source) {
                setEditContent(source);
                setEditMode(true);
                clearUndoHistory();
                undoStackRef.current.push({content: source, selStart: 0, selEnd: 0});
                if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
                redoStackRef.current = [];
                undoSuspendRef.current = true;
                try {
                    handleEditChangeRef.current(formatted);
                } finally {
                    requestAnimationFrame(() => {
                        undoSuspendRef.current = false;
                    });
                }
                // Plan 1d — same immediate re-check for the view→edit format
                // path (the editor now holds the formatted buffer).
                spellRecheckNowRef.current?.();
                window.dispatchEvent(new CustomEvent("praxis:announce", {
                    detail: {
                        title: "Formatted in the editor — Ctrl+Z undoes",
                        description: "Switched to edit mode with the formatted text — Save (⌘S / Ctrl+S) writes it to disk."
                    }
                }));
                if (data.fallback === "builtin") {
                    window.dispatchEvent(new CustomEvent("praxis:announce", {
                        detail: {
                            title: "Formatted (built-in)",
                            description: "black is not installed — used the built-in formatter. pip install black for full formatting."
                        }
                    }));
                }
            } else {
                window.dispatchEvent(new CustomEvent("praxis:announce", {
                    detail: {
                        title: "Already formatted",
                        description: `${fileNameRef.current ?? "The file"} needs no changes.`
                    }
                }));
            }
        } catch {
            window.dispatchEvent(new CustomEvent("praxis:announce", {
                detail: {
                    title: "Format failed",
                    description: "Could not reach the format service.",
                    variant: "destructive"
                }
            }));
        }
    }, []);
    /** Organize Imports — ruff's import-block pass (`ruff check
     *  --select I --fix`) over the LIVE buffer via POST /api/format with
     *  mode:"organize". Same shape as Format Document: edit mode swaps
     *  the buffer through handleEditChange (dirty tracking + undo both
     *  engage), view mode switches INTO the editor seeded with the
     *  organized text, the original on the undo stack. ruff only — there
     *  is no black fallback for import organization, so failures toast
     *  the route's error text verbatim (the 503 "ruff is not installed"
     *  body included). */
    const organizeImportsFn = React.useCallback(async () => {
        if (!folderSlugRef.current || !fileSlugRef.current) return;
        const inEdit = editModeRef.current;
        const source = inEdit ? editContentRef.current : (sourceRef.current ?? "");
        try {
            const res = await fetch("/api/format", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    folder: folderSlugRef.current,
                    file: fileSlugRef.current,
                    content: source,
                    mode: "organize"
                })
            });
            const data = (await res.json().catch(() => null)) as
                | { ok?: boolean; formatted?: string; changed?: boolean; error?: string }
                | null;
            if (!res.ok || !data?.ok) {
                aiToast({
                    title: "Organize imports failed",
                    description: String(data?.error ?? `HTTP ${res.status}`),
                    variant: "destructive"
                });
                return;
            }
            const organized = typeof data.formatted === "string" ? data.formatted : null;
            if (organized == null) return;
            if (organized === source) {
                aiToast({
                    title: "Imports already organized",
                    description: `${fileNameRef.current ?? "The file"} needs no import changes.`
                });
                return;
            }
            if (inEdit) {
                handleEditChangeRef.current(organized);
                spellRecheckNowRef.current?.();
                return;
            }
            // View mode → enter the editor with the organized buffer; the
            // ORIGINAL disk text goes on the undo stack explicitly (same
            // guard pattern formatDocumentFn uses so Ctrl+Z restores the
            // pre-organize source, not a stale buffer).
            setEditContent(source);
            setEditMode(true);
            clearUndoHistory();
            undoStackRef.current.push({content: source, selStart: 0, selEnd: 0});
            if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
            redoStackRef.current = [];
            undoSuspendRef.current = true;
            try {
                handleEditChangeRef.current(organized);
            } finally {
                requestAnimationFrame(() => {
                    undoSuspendRef.current = false;
                });
            }
            spellRecheckNowRef.current?.();
            aiToast({
                title: "Imports organized in the editor — Ctrl+Z undoes",
                description: "Switched to edit mode with the sorted/merged/deduped import block — Save (⌘S / Ctrl+S) writes it to disk."
            });
        } catch {
            aiToast({
                title: "Organize imports failed",
                description: "Could not reach the format service.",
                variant: "destructive"
            });
        }
    }, [aiToast]);
    /** Auto-indent — the offline twin of Format Document. In EDIT mode
     *  it re-indents the live buffer; in VIEW mode it uses the same
     *  switch-then-apply flow as formatDocumentFn (enter the editor
     *  seeded with the re-indented text, ORIGINAL on the undo stack), so
     *  the right-click menus offer the SAME pair in both modes. */
    const viewAutoIndentFn = React.useCallback(() => {
        const inEdit = editModeRef.current;
        const source = inEdit ? editContentRef.current : (sourceRef.current ?? "");
        const converted = reindentPython(source, getIndentSettings(loadSettings()));
        if (converted === source) {
            window.dispatchEvent(new CustomEvent("praxis:announce", {
                detail: {
                    title: "Already indented",
                    description: `${fileNameRef.current ?? "The file"} needs no changes.`
                }
            }));
            return;
        }
        if (inEdit) {
            handleEditChangeRef.current(converted);
            // Plan 1d — the re-indent moved every line; re-check now.
            spellRecheckNowRef.current?.();
            window.dispatchEvent(new CustomEvent("praxis:announce", {
                detail: {
                    title: "Re-indented (unsaved edit) — Ctrl+Z undoes",
                    description: "Save (⌘S) writes it to disk."
                }
            }));
            return;
        }
        // View mode → enter the editor with the re-indented buffer (the
        // original disk text goes on the undo stack first — same guards
        // as formatDocumentFn's view path).
        setEditContent(source);
        setEditMode(true);
        clearUndoHistory();
        undoStackRef.current.push({content: source, selStart: 0, selEnd: 0});
        if (undoStackRef.current.length > UNDO_STACK_MAX) undoStackRef.current.shift();
        redoStackRef.current = [];
        undoSuspendRef.current = true;
        try {
            handleEditChangeRef.current(converted);
        } finally {
            requestAnimationFrame(() => {
                undoSuspendRef.current = false;
            });
        }
        window.dispatchEvent(new CustomEvent("praxis:announce", {
            detail: {
                title: "Re-indented in the editor — Ctrl+Z undoes",
                description: "Switched to edit mode with the re-indented text — Save (⌘S / Ctrl+S) writes it to disk."
            }
        }));
    }, []);
    /** the text the AI submenu should work on — the selection
     *  when there is one, else the whole buffer (capped at ~4,000 chars
     *  so a chat prompt stays reasonable; the tail is the most relevant
     *  part of a long file). */
    const getSelectedTextForAi = React.useCallback(() => {
        const ta = textareaRef.current;
        const src = editContentRef.current ?? "";
        if (ta && ta.selectionStart !== ta.selectionEnd) {
            return src.slice(ta.selectionStart, ta.selectionEnd);
        }
        const CAP = 4000;
        if (src.length <= CAP) return src;
        return `…(first lines trimmed)…\n${src.slice(src.length - CAP)}`;
    }, []);

    React.useImperativeHandle(ref, () => ({
        save: async () => {
            if (!onSaveEditRef.current) return;
            if (!editModeRef.current) return;
            await handleSaveEditRef.current();
        },
        openFind: () => openFindBar(),
        openReplace: () => {
            // Open the find bar in replace mode (edit mode only). The find
            // bar's replace UI is toggled on when opened via openReplace.
            setShowFind(true);
            setShowReplace(true);
            requestAnimationFrame(() => findInputRef.current?.focus());
        },
        format: async () => formatDocumentFn(),
        organizeImports: async () => organizeImportsFn(),
        undo: () => {
            // the snapshot-stack undo (the native execCommand undo
            // was dead — programmatic value writes clear its history).
            undoFn();
        },
        redo: () => {
            redoFn();
        },
        cut: () => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            document.execCommand("cut");
        },
        copy: () => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            document.execCommand("copy");
        },
        paste: async () => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            // Try the modern Clipboard API first (returns a Promise); fall
            // back to execCommand for older browsers.
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const newContent = editContentRef.current.slice(0, start) + text + editContentRef.current.slice(end);
                    handleEditChangeRef.current(newContent);
                    requestAnimationFrame(() => {
                        ta.selectionStart = ta.selectionEnd = start + text.length;
                    });
                    return;
                }
            } catch { /* clipboard read blocked — fall through */
            }
            document.execCommand("paste");
        },
        isEditMode: () => editModeRef.current,
        jumpToLine: (line) => handleSymbolClickRef.current(line),
        getSymbols: () => symbolsRef.current,
        toggleBookmark: () => {
            const ln = caretLineRef.current;
            const set = bookmarksRef.current;
            if (set.has(ln)) set.delete(ln);
            else set.add(ln);
            bumpBookmarks();
        },
        nextBookmark: () => {
            const set = bookmarksRef.current;
            if (set.size === 0) return;
            const cur = caretLineRef.current;
            const sorted = Array.from(set).sort((a, b) => a - b);
            const next = sorted.find((ln) => ln > cur) ?? sorted[0];
            handleSymbolClickRef.current(next);
        },
        prevBookmark: () => {
            const set = bookmarksRef.current;
            if (set.size === 0) return;
            const cur = caretLineRef.current;
            const sorted = Array.from(set).sort((a, b) => a - b);
            const prev = sorted.filter((ln) => ln < cur).pop() ?? sorted[sorted.length - 1];
            handleSymbolClickRef.current(prev);
        },
        swapLineUp: () => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            const src = editContentRef.current;
            const selStart = ta.selectionStart;
            const selEnd = ta.selectionEnd;
            const lineStarts: number[] = [0];
            for (let i = 0; i < src.length; i++) {
                if (src[i] === "\n") lineStarts.push(i + 1);
            }
            const startLineIdx = src.slice(0, selStart).split("\n").length - 1;
            if (startLineIdx === 0) return; // no-op at first line
            const endLineIdx = src.slice(0, selEnd).split("\n").length - 1;
            const numLines = lineStarts.length;
            const blockStart = lineStarts[startLineIdx];
            // End of last line of the selection (excluding the trailing newline).
            const blockLineEnd = endLineIdx + 1 < numLines ? lineStarts[endLineIdx + 1] - 1 : src.length;
            const prevLineStart = lineStarts[startLineIdx - 1];
            const prevLineEnd = blockStart - 1; // exclude the newline before the block
            const blockText = src.slice(blockStart, blockLineEnd);
            const prevText = src.slice(prevLineStart, prevLineEnd);
            const newContent = src.slice(0, prevLineStart) + blockText + "\n" + prevText + src.slice(blockLineEnd);
            handleEditChangeRef.current(newContent);
            const shift = prevText.length + 1; // +1 for the inserted newline
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(Math.max(0, selStart - shift), Math.max(0, selEnd - shift));
            });
        },
        swapLineDown: () => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            const src = editContentRef.current;
            const selStart = ta.selectionStart;
            const selEnd = ta.selectionEnd;
            const lineStarts: number[] = [0];
            for (let i = 0; i < src.length; i++) {
                if (src[i] === "\n") lineStarts.push(i + 1);
            }
            const numLines = lineStarts.length;
            const startLineIdx = src.slice(0, selStart).split("\n").length - 1;
            const endLineIdx = src.slice(0, selEnd).split("\n").length - 1;
            if (endLineIdx >= numLines - 1) return; // no-op at last line
            const blockStart = lineStarts[startLineIdx];
            const blockLineEnd = lineStarts[endLineIdx + 1] - 1; // end of last line, excluding newline
            const nextLineStart = lineStarts[endLineIdx + 1];
            const nextLineEnd = endLineIdx + 2 < numLines ? lineStarts[endLineIdx + 2] - 1 : src.length;
            const blockText = src.slice(blockStart, blockLineEnd);
            const nextText = src.slice(nextLineStart, nextLineEnd);
            const newContent = src.slice(0, blockStart) + nextText + "\n" + blockText + src.slice(nextLineEnd);
            handleEditChangeRef.current(newContent);
            const shift = nextText.length + 1; // +1 for the inserted newline
            requestAnimationFrame(() => {
                ta.focus();
                ta.setSelectionRange(selStart + shift, selEnd + shift);
            });
        },
        selectNextMatch: () => {
            // Ctrl+D now STACKS carets (multi-caret editing) —
            // first press selects the word, each further press adds the next
            // occurrence. Behavior identical to the textarea keydown path.
            selectNextOccurrenceMulti();
        },
        // ─── debugger gutter breakpoints (imperative twins of the
        // gutter clicks — a11y + programmatic control).
        getBreakpoints: () => [...activeBreakpointsRef.current],
        toggleBreakpoint: (line) => toggleBreakpointAt(line),
        getDiagnostics: () => (editModeRef.current ? (liveDiagnosticsRef.current ?? diagnosticsRef.current) : diagnosticsRef.current),
        getSelectedSymbol: () => {
            // symbol rename now works in BOTH modes. Edit
            // mode reads the caret/selection off the textarea; view mode has
            // no textarea, so it falls back to the browser's text selection
            // over the rendered code (rename used to silently fail with
            // "no symbol" whenever it was invoked from view mode).
            if (editModeRef.current) {
                const ta = textareaRef.current;
                if (!ta) return "";
                const src = editContentRef.current;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                if (start !== end) return src.slice(start, end);
                // No selection — return the word under the caret.
                const wordChars = /[\w$]/;
                let s = start;
                while (s > 0 && wordChars.test(src[s - 1])) s--;
                let e = end;
                while (e < src.length && wordChars.test(src[e])) e++;
                return src.slice(s, e);
            }
            // View mode: the DOM selection over the highlighted code.
            // A Ctrl/Cmd+Click or F12 may have stashed the clicked word —
            // the page's goto-declaration handler re-derives the symbol
            // through THIS method right after the event, so it must see the
            // word the user actually targeted (a plain click collapses the
            // DOM selection and there is nothing else to read).
            const pending = pendingGotoSymbolRef.current;
            if (pending) return pending;
            const sel = typeof window !== "undefined" ? window.getSelection() : null;
            const text = sel ? sel.toString() : "";
            if (text && !text.includes("\n") && text.length <= 120) return text.trim();
            return "";
        },
        // The POSITION twin of getSelectedSymbol — the (1-based line, col)
        // the LSP gestures (F12 / ⇧F12 / F2, palette-driven too) should
        // ask the sidecar about. Reads the same sources as its symbol
        // sibling so both never disagree.
        getSelectedPosition: () => resolveCaretPosition(),
        // ─── editor context-menu actions ─────────────────────
        // All read their inputs from the stable refs (editModeRef /
        // editContentRef / textareaRef / handleEditChangeRef) so the handle
        // object never needs re-creating.
        toggleComment: () => commentToggleFn(),
        duplicateLine: () => duplicateLineFn(),
        convertCase: (kind) => convertCaseFn(kind),
        trimTrailingWhitespace: () => trimTrailingFn(),
        formatSelection: () => formatSelectionFn(),
        changeAllOccurrences: () => changeAllFn(),
        foldAll: () => foldAllFn(),
        unfoldAll: () => unfoldAllFn(),
        foldCurrentBlock: () => foldCurrentFn(),
        runSelection: () => runSelectionFn(),
        // ─── Line tools the navbar Edit menu also exposes (they existed
        // only in the right-click menu before — "more options in Edit").
        deleteLines: () => deleteLinesFn(),
        joinLines: () => joinLinesFn(),
        // the Join twin + the surround-with family + the
        // live selection accessor (Send-selection-to-terminal).
        splitLines: () => splitLinesFn(),
        surroundSelection: (kind) => surroundSelectionFn(kind),
        getSelectionText: () => getSelectionTextFn(),
        sortLines: () => sortLinesFn(),
        uniqueLines: () => uniqueLinesFn(),
        reverseLines: () => reverseLinesFn(),
        shuffleLines: () => shuffleLinesFn(),
        selectAllBuffer: () => {
            if (!editModeRef.current) return;
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            ta.select();
        },
        copySelectionAsMarkdown: () => {
            const ta = textareaRef.current;
            const src = editContentRef.current;
            const start = ta?.selectionStart ?? 0;
            const end = ta?.selectionEnd ?? 0;
            const text = start !== end ? src.slice(start, end) : "";
            return handleCopyAsMarkdownRef.current(text);
        },
        hasSelection: () => {
            const ta = textareaRef.current;
            return !!ta && ta.selectionStart !== ta.selectionEnd;
        },
        // live buffer accessor — edit mode's unsaved content when
        // editing, the loaded file content otherwise.
        getBuffer: () =>
            editModeRef.current ? editContentRef.current : sourceRef.current,
        // whole-buffer replacement (the AI-apply flow). Switches
        // to edit mode when needed, routes through handleEditChange (the
        // same path Format Document uses — dirty tracking + autosave both
        // engage), then parks the caret at the top so a huge diff doesn't
        // leave the viewport somewhere arbitrary.
        replaceBuffer: (content: string) => {
            if (!editModeRef.current) setEditMode(true);
            requestAnimationFrame(() => {
                handleEditChangeRef.current(content);
                const ta = textareaRef.current;
                if (ta) {
                    ta.focus();
                    ta.setSelectionRange(0, 0);
                    ta.scrollTop = 0;
                }
            });
        },
        // ── session-restore hooks (the workspace snapshot round-trips the
        //    unsaved buffer, caret and scroll across reloads).
        getEditState: () => {
            const ta = textareaRef.current;
            return {
                content:
                    editModeRef.current && editContentRef.current !== sourceRef.current
                        ? editContentRef.current
                        : null,
                caret: ta && editModeRef.current ? ta.selectionStart : 0,
                scrollTop: scrollContainerRef.current?.scrollTop ?? 0
            };
        },
        restoreEditState: (state) => {
            const source = sourceRef.current ?? "";
            if (!state.content || state.content === source) return;
            setEditContent(source);
            setEditMode(true);
            clearUndoHistory();
            undoStackRef.current.push({content: source, selStart: 0, selEnd: 0});
            redoStackRef.current = [];
            undoSuspendRef.current = true;
            try {
                handleEditChangeRef.current(state.content);
            } finally {
                requestAnimationFrame(() => {
                    undoSuspendRef.current = false;
                    const ta = textareaRef.current;
                    if (ta) {
                        ta.focus();
                        const at = Math.min(state.caret, ta.value.length);
                        ta.setSelectionRange(at, at);
                    }
                    if (state.scrollTop && scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = state.scrollTop;
                    }
                });
            }
        }
    }), [openFindBar, bumpBookmarks, commentToggleFn, duplicateLineFn, convertCaseFn, trimTrailingFn, formatSelectionFn, changeAllFn, foldAllFn, unfoldAllFn, foldCurrentFn, runSelectionFn, formatDocumentFn, undoFn, redoFn, deleteLinesFn, joinLinesFn, sortLinesFn, uniqueLinesFn, reverseLinesFn, shuffleLinesFn]);

    // ─── Ref-stash wiring for textarea onKeyDown methods ───────────
    // (the Markdown-copy stash lives right after handleCopyAsMarkdown's
    // declaration below — declaration order matters for the assignment)
    // The textarea's onKeyDown reads these refs (so the handler stays
    // stable across re-renders). The implementations mirror the ones
    // exposed via useImperativeHandle above — they share the same
    // underlying refs (editModeRef, editContentRef, etc.) so behavior
    // is identical. This is slightly redundant but keeps the textarea
    // handler stable (it doesn't need to depend on the imperative
    // methods, which would otherwise force the textarea to re-render
    // on every keystroke).
    selectNextMatchRef.current = () => {
        // stacks carets (same as the keydown + handle paths).
        selectNextOccurrenceMulti();
    };
    toggleBookmarkRef.current = () => {
        const ln = caretLineRef.current;
        const set = bookmarksRef.current;
        if (set.has(ln)) set.delete(ln);
        else set.add(ln);
        bumpBookmarks();
    };
    nextBookmarkRef.current = () => {
        const set = bookmarksRef.current;
        if (set.size === 0) return;
        const cur = caretLineRef.current;
        const sorted = Array.from(set).sort((a, b) => a - b);
        const next = sorted.find((ln) => ln > cur) ?? sorted[0];
        handleSymbolClickRef.current(next);
    };
    prevBookmarkRef.current = () => {
        const set = bookmarksRef.current;
        if (set.size === 0) return;
        const cur = caretLineRef.current;
        const sorted = Array.from(set).sort((a, b) => a - b);
        const prev = sorted.filter((ln) => ln < cur).pop() ?? sorted[sorted.length - 1];
        handleSymbolClickRef.current(prev);
    };
    swapLineUpRef.current = () => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const src = editContentRef.current;
        const selStart = ta.selectionStart;
        const selEnd = ta.selectionEnd;
        const lineStarts: number[] = [0];
        for (let i = 0; i < src.length; i++) {
            if (src[i] === "\n") lineStarts.push(i + 1);
        }
        const startLineIdx = src.slice(0, selStart).split("\n").length - 1;
        if (startLineIdx === 0) return;
        const endLineIdx = src.slice(0, selEnd).split("\n").length - 1;
        const numLines = lineStarts.length;
        const blockStart = lineStarts[startLineIdx];
        const blockLineEnd = endLineIdx + 1 < numLines ? lineStarts[endLineIdx + 1] - 1 : src.length;
        const prevLineStart = lineStarts[startLineIdx - 1];
        const prevLineEnd = blockStart - 1;
        const blockText = src.slice(blockStart, blockLineEnd);
        const prevText = src.slice(prevLineStart, prevLineEnd);
        const newContent = src.slice(0, prevLineStart) + blockText + "\n" + prevText + src.slice(blockLineEnd);
        handleEditChangeRef.current(newContent);
        const shift = prevText.length + 1;
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(Math.max(0, selStart - shift), Math.max(0, selEnd - shift));
        });
    };
    swapLineDownRef.current = () => {
        if (!editModeRef.current) return;
        const ta = textareaRef.current;
        if (!ta) return;
        const src = editContentRef.current;
        const selStart = ta.selectionStart;
        const selEnd = ta.selectionEnd;
        const lineStarts: number[] = [0];
        for (let i = 0; i < src.length; i++) {
            if (src[i] === "\n") lineStarts.push(i + 1);
        }
        const numLines = lineStarts.length;
        const startLineIdx = src.slice(0, selStart).split("\n").length - 1;
        const endLineIdx = src.slice(0, selEnd).split("\n").length - 1;
        if (endLineIdx >= numLines - 1) return;
        const blockStart = lineStarts[startLineIdx];
        const blockLineEnd = lineStarts[endLineIdx + 1] - 1;
        const nextLineStart = lineStarts[endLineIdx + 1];
        const nextLineEnd = endLineIdx + 2 < numLines ? lineStarts[endLineIdx + 2] - 1 : src.length;
        const blockText = src.slice(blockStart, blockLineEnd);
        const nextText = src.slice(nextLineStart, nextLineEnd);
        const newContent = src.slice(0, blockStart) + nextText + "\n" + blockText + src.slice(nextLineEnd);
        handleEditChangeRef.current(newContent);
        const shift = nextText.length + 1;
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(selStart + shift, selEnd + shift);
        });
    };

    // Insert snippet — append to textarea.
    // the signal is now CONSUMED. The nonce is recorded
    // in a ref and the parent is notified (onSnippetConsumed →
    // setInsertSnippet(null)), so the effect can no longer re-fire on
    // every later `code` change and re-append the stale snippet to
    // other files / every autosave cycle.
    const lastAppliedSnippetNonceRef = React.useRef(0);
    const onSnippetConsumedRef = React.useRef<(() => void) | undefined>(undefined);
    React.useEffect(() => {
        onSnippetConsumedRef.current = onSnippetConsumed;
    }, [onSnippetConsumed]);
    React.useEffect(() => {
        if (!insertSnippet || insertSnippet.nonce === 0) return;
        if (insertSnippet.nonce === lastAppliedSnippetNonceRef.current) return;
        lastAppliedSnippetNonceRef.current = insertSnippet.nonce;
        setEditMode(true);
        setEditContent((prev) => {
            const base = prev || code;
            const sep = base && !base.endsWith("\n") ? "\n\n" : "\n";
            return base + sep + insertSnippet.content + "\n";
        });
        // Consume the signal so it can never fire again.
        onSnippetConsumedRef.current?.();
    }, [insertSnippet, code]);

    // AI completion fetch. Uses an AbortController so stale requests
    // (triggered by rapid typing) are truly cancelled server-side, not
    // merely ignored on the client. Sets `aiFetching` so the UI can show
    // a "thinking…" chip during the round-trip.
    // Plan 3 — FIM wiring: an optional `suffixAfterCursor` (the text
    // AFTER the caret) rides the request as `suffix`, and the file's
    // language (completionLanguageFromFileName) rides it as `language`;
    // the route's Fill-In-Middle + per-language prompt assembly
    // (lib/ai.ts) consumes both. The suffix is only sent when non-empty
    // (empty caret-at-EOF keeps the legacy prefix-only shape).
    const fetchAiSuggestion = React.useCallback(async (codeBeforeCursor: string, cursorOffset: number, suffixAfterCursor?: string) => {
        const seq = ++aiRequestSeqRef.current;
        // Abort any in-flight request before starting a new one.
        if (aiAbortRef.current) {
            try {
                aiAbortRef.current.abort();
            } catch { /* ignore */
            }
        }
        const controller = new AbortController();
        aiAbortRef.current = controller;
        setAiFetching(true);
        try {
            // Route the completion through the selected chat provider
            // (Settings → AI → Chat model providers — Ollama / LM Studio /
            // vLLM / llama.cpp / any OpenAI-compatible endpoint). The
            // built-in Z.AI SDK default is gone; with no provider the route
            // returns the actionable setup message and the popup simply
            // doesn't appear. Read at request time so switching the provider
            // applies to the very next suggestion.
            const provider = getActiveChatProvider(loadSettings());
            // FIM suffix — capped client-side to the route's suffix budget
            // (lib/ai.ts tail-caps the prompt suffix at 2000 chars; sending
            // more would only be cut there and bloat the wire). The HEAD of
            // the suffix is kept — the code right after the caret is the
            // part the completion must fit against.
            const suffix =
                typeof suffixAfterCursor === "string" && suffixAfterCursor.length > 0
                    ? suffixAfterCursor.slice(0, AI_COMPLETION_SUFFIX_CAP)
                    : undefined;
            // Sampling knobs (chat sidebar's Tuning popover) — read at
            // REQUEST time so a knob change applies to the very next
            // suggestion. They ride the provider payload exactly like the
            // sidebar sends them: the route forwards `body.provider` to
            // sanitizeProvider, which validates + clamps `provider.sampling`
            // (sanitizeSampling) and createChatCompletion maps it onto the
            // upstream request body (temperature / max_tokens / top_p).
            // null (absent/corrupt/SSR) → omitted entirely → provider
            // defaults, byte-identical legacy body.
            const sampling = readPersistedSampling();
            const res = await fetch("/api/ai-completion", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    code: codeBeforeCursor,
                    cursorOffset,
                    ...(suffix !== undefined ? {suffix} : {}),
                    // per-language prompt (js / ts / R / shell / julia / matlab;
                    // unknown extensions default to python server-side).
                    language: completionLanguageFromFileName(fileNameRef.current),
                    // Send the provider payload whenever an endpoint is active OR
                    // sampling knobs are set; no provider → omitted → the server
                    // replies with the "add a provider" guidance and the fetch is
                    // a no-op for the user.
                    ...(provider
                        ? {
                            provider: {
                                kind: provider.kind,
                                baseUrl: provider.baseUrl,
                                apiKey: provider.apiKey,
                                model: provider.model,
                                ...(sampling ? {sampling} : {})
                            }
                        }
                        : {})
                }),
                signal: controller.signal
            });
            if (!res.ok) {
                if (seq === aiRequestSeqRef.current) {
                    setAiSuggestion(null);
                    setAiGhostCaret(null);
                }
                return;
            }
            const data = await res.json();
            if (seq !== aiRequestSeqRef.current) return;
            const text = (data.suggestion ?? "").trim();
            setAiSuggestion(text || null);
            // remember WHERE this suggestion belongs so the
            // ghost-text overlay can render it at the caret. `cursorOffset`
            // is the fetch's caret (the parameter of the outer closure).
            setAiGhostCaret(text ? cursorOffset : null);
        } catch (err) {
            // AbortError is expected when a newer request supersedes this
            // one — don't clear the suggestion in that case (the newer
            // request owns the result).
            if (err instanceof DOMException && err.name === "AbortError") return;
            if (seq === aiRequestSeqRef.current) {
                setAiSuggestion(null);
                setAiGhostCaret(null);
            }
        } finally {
            // Only clear the fetching flag if this request is still the
            // latest — otherwise a newer request is in flight and owns
            // the flag.
            if (seq === aiRequestSeqRef.current) {
                setAiFetching(false);
                aiAbortRef.current = null;
            }
        }
    }, []);

    /** Schedule a debounced AI completion fetch (1s after the last
     *  change). Called from the textarea's onChange (via
     *  handleEditChange), onKeyUp (non-nav keys), onClick, and onSelect
     *  so paste, click, IME, and programmatic edits all trigger it.
     *  Pass the current textarea so we can read the live caret position.
     *  Also computes whether the suggestion popup should flip above the
     *  caret (when the caret is in the bottom ~40% of the visible
     *  textarea area). */
    const scheduleAiCompletion = React.useCallback((ta: HTMLTextAreaElement | null) => {
        if (!aiCompletionEnabled || !ta) return;
        // Compute whether to flip the popup above. The popup is ~120px
        // tall; if the caret is within 160px of the bottom of the
        // visible textarea area, flip up so the popup doesn't obscure
        // the line being edited.
        const caretPos = ta.selectionStart;
        const textBefore = ta.value.slice(0, caretPos);
        const lineHeight = fontSize * 1.6;
        const caretLine = textBefore.split("\n").length - 1;
        const caretPixelY = caretLine * lineHeight - ta.scrollTop;
        const visibleHeight = ta.clientHeight;
        setAiPopupFlipUp(caretPixelY > visibleHeight - 160);
        setAiSuggestion(null);
        setAiGhostCaret(null);
        if (aiDebounceRef.current) {
            clearTimeout(aiDebounceRef.current);
            aiDebounceRef.current = null;
        }
        aiDebounceRef.current = setTimeout(() => {
            aiDebounceRef.current = null;
            const cursor = ta.selectionStart;
            const before = (ta.value ?? "").slice(0, cursor);
            if (!before.trim()) {
                setAiFetching(false);
                return;
            }
            // FIM — the text AFTER the caret rides along so the
            // model completes what fits BETWEEN the two blocks.
            void fetchAiSuggestion(before, cursor, (ta.value ?? "").slice(cursor));
        }, Math.max(0, aiCompletionDebounceMs));
    }, [aiCompletionEnabled, fontSize, fetchAiSuggestion, aiCompletionDebounceMs]);

    /** Manually trigger an AI completion fetch (skipping the 1s
     * debounce). Wired to the Alt+\ shortcut so the user can force a
     * suggestion on demand. */
    const triggerAiCompletionNow = React.useCallback(() => {
        if (!aiCompletionEnabled) return;
        const ta = textareaRef.current;
        if (!ta) return;
        if (aiDebounceRef.current) {
            clearTimeout(aiDebounceRef.current);
            aiDebounceRef.current = null;
        }
        const cursor = ta.selectionStart;
        const before = (ta.value ?? "").slice(0, cursor);
        if (!before.trim()) return;
        // FIM — the forced fetch carries the after-caret text too.
        void fetchAiSuggestion(before, cursor, (ta.value ?? "").slice(cursor));
    }, [aiCompletionEnabled, fetchAiSuggestion]);

    // Expose triggerAiCompletionNow via a ref-stash so the textarea's
    // onKeyDown can call it without entering the useCallback deps
    // (which would re-create the handler every render).
    const triggerAiCompletionNowRef = React.useRef(triggerAiCompletionNow);
    React.useEffect(() => {
        triggerAiCompletionNowRef.current = triggerAiCompletionNow;
    }, [triggerAiCompletionNow]);

    // Keep scheduleAiCompletionRef in sync so handleEditChange (defined
    // above) can call the latest scheduleAiCompletion without a forward
    // reference.
    React.useEffect(() => {
        scheduleAiCompletionRef.current = scheduleAiCompletion;
    }, [scheduleAiCompletion]);

    // Cleanup: clear the debounce timer + abort any in-flight fetch +
    // invalidate the seq counter when the component unmounts. Without
    // this, a debounce timer could fire after unmount and call
    // setAiSuggestion on a gone component (a wasted fetch + React 19
    // no-op warning).
    React.useEffect(() => {
        return () => {
            if (aiDebounceRef.current) {
                clearTimeout(aiDebounceRef.current);
                aiDebounceRef.current = null;
            }
            if (aiAbortRef.current) {
                try {
                    aiAbortRef.current.abort();
                } catch { /* ignore */
                }
                aiAbortRef.current = null;
            }
            aiRequestSeqRef.current++; // invalidate any in-flight response
        };
    }, []);

    const handleStartEdit = () => {
        // preserve the READING position when switching to
        // edit mode — the user clicked Edit while looking at a specific
        // line and previously landed at the top of the file. The read-mode
        // highlight (hover/click-pinned line) is the best signal of "the
        // line I was on"; when nothing was highlighted we keep the scroll
        // FRACTION instead (collapsed view → top, as before).
        const targetLine = activeHighlightLine;
        const sc = scrollContainerRef.current;
        const scrollable = sc && sc.scrollHeight > sc.clientHeight + 4;
        const prevRatio =
            scrollable && sc
                ? sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight)
                : 0;
        setEditContent(code);
        setEditMode(true);
        // entering edit mode starts a FRESH undo history for this
        // file (the previous session's stack is meaningless against a new
        // buffer).
        clearUndoHistory();
        savedSelectionRef.current = null;
        requestAnimationFrame(() => {
            const c = scrollContainerRef.current;
            if (!c) return;
            if (targetLine) {
                c.scrollTo({top: Math.max(0, 16 + (targetLine - 5) * (fontSize * 1.6))});
            } else if (prevRatio > 0 && c.scrollHeight > c.clientHeight + 4) {
                c.scrollTop = prevRatio * (c.scrollHeight - c.clientHeight);
            } else {
                c.scrollTop = 0;
            }
        });
    };
    /** Shared tail of handleCancelEdit — called once the user has
     * confirmed (or had nothing to lose). */
    const performLeaveEditMode = () => {
        setEditMode(false);
        setEditContent("");
        clearUndoHistory();
        savedSelectionRef.current = null;
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
    };
    const handleCancelEdit = () => {
        // leaving edit mode via the View button / context menu
        // used to DISCARD unsaved edits with no warning
        // edit to switch to view mode, it should ask if unsaved options are
        // found; because i made edits and it destroyed it"). Match the
        // file-switch guard: confirm before throwing the buffer away. (A
        // save — auto or manual — flips isDirtyRef back to false, so this
        // only prompts when there is really something to lose.)
        // the confirm is now the IDE-styled AlertDialog
        // instead of the browser's native window.confirm box (user
        // report: "the message should be styled with my IDE styling").
        if (isDirtyRef.current) {
            void confirmEditGuard({
                fromFile: fileName,
                toWhat: "view mode",
                action: "Switching to view mode"
            }).then((ok) => {
                if (ok) performLeaveEditMode();
            });
            return;
        }
        performLeaveEditMode();
    };

    // ─── Insert-block (edit mode) ────────────────────────────────────
    // The blocks available for THIS file type (python / markdown /
    // .gitignore / txt / json / yaml / toml / csv — see code-templates).
    const insertBlocks = React.useMemo(() => blocksForFile(fileName), [fileName]);

    /** Insert a rendered template at the caret (see spliceTemplate for
     *  the selection/blank-line/mid-line placement rules). After
     *  inserting, the caret lands at the template's $0 marker (or after
     *  the block) and the editor scrolls it into view. */
    const insertBlockAtCaret = React.useCallback((template: string) => {
        const ta = textareaRef.current;
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
            // Scroll the caret's line into view (the PARENT container scrolls
            // — the textarea is full-height).
            const line = newContent.slice(0, caretPos).split("\n").length;
            scrollContainerRef.current?.scrollTo({
                top: Math.max(0, 16 + (line - 5) * EDIT_LINE_HEIGHT),
                behavior: "smooth"
            });
        });
    }, [editMode, handleEditChange, EDIT_LINE_HEIGHT]);

    /** Edit-mode context-menu undo/redo — the snapshot stack
     *  (the deprecated execCommand path could not undo any structured
     *  edit — Enter / Tab / auto-pair / Format had wiped the native
     *  history, so the menu item and Ctrl+Z both did nothing). */
    const editContextUndo = React.useCallback(() => {
        undoFn();
    }, [undoFn]);
    const editContextRedo = React.useCallback(() => {
        redoFn();
    }, [redoFn]);
    const editContextCut = React.useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        document.execCommand("cut");
    }, []);
    const editContextCopy = React.useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        document.execCommand("copy");
    }, []);
    const editContextPaste = React.useCallback(async () => {
        const ta = textareaRef.current;
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
            /* clipboard permission denied — fall back to the native menu */
        }
    }, [handleEditChange]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
        }
    };

    // ─── "Copy as Markdown code block" ────────────────────
    // Wraps the given text in a fenced block (```python … ```) so it can
    // be pasted straight into a README, issue or chat message. The fence
    // language comes from the file extension (python for .py, plain for
    // everything else).
    const fenceLanguage = React.useMemo(() => {
        const ext = (fileName.split(".").pop() || "").toLowerCase();
        if (ext === "py" || ext === "pyw") return "python";
        if (ext === "js" || ext === "jsx" || ext === "ts" || ext === "tsx") return ext;
        if (ext === "json") return "json";
        if (ext === "md") return "markdown";
        if (ext === "sh" || ext === "bash") return "bash";
        if (ext === "r") return "r";
        if (ext === "sql") return "sql";
        return "";
    }, [fileName]);
    const handleCopyAsMarkdown = React.useCallback(async (text: string) => {
        const trimmed = text.replace(/\s+$/, "");
        if (!trimmed.trim()) return;
        const fenced = "```" + fenceLanguage + "\n" + trimmed + "\n```";
        try {
            await navigator.clipboard.writeText(fenced);
            aiToast({
                title: "Copied as a Markdown code block",
                description: `${trimmed.split("\n").length} lines fenced as ${fenceLanguage || "plain text"}.`
            });
        } catch {
            aiToast({variant: "destructive", title: "Clipboard access denied."});
        }
    }, [fenceLanguage, aiToast]);
    // Stash for the imperative handle's copySelectionAsMarkdown (the
    // handle object is created above this line, so it reads the ref).
    handleCopyAsMarkdownRef.current = handleCopyAsMarkdown;

    const handleDownload = async () => {
        if (onDownload) {
            onDownload();
            return;
        }
        if (!folderSlug || !fileSlug) return;
        const url = `/api/download?folder=${encodeURIComponent(folderSlug)}&file=${encodeURIComponent(fileSlug)}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    /** start the jump-flash AFTER the smooth
     * scroll lands instead of before it starts. The old order
     * (setJumpFlash → expand → scroll) burned the flash's 150 ms hold
     * and most of its 1.3 s fade while the smooth scroll was still in
     * flight — by the time the target line reached the viewport the
     * highlight had already faded. This helper prefers
     * the browser's `scrollend` event (fires exactly when a smooth
     * scroll stops) and always arms a fallback timer for browsers
     * without scrollend and for no-op scrolls (which never emit
     * scrollend). A sequence ref + cancel handle keep a superseded jump
     * from ever starting a stale flash. */
    const jumpSeqRef = React.useRef(0);
    const pendingFlashCancelRef = React.useRef<(() => void) | null>(null);
    const flashAfterScroll = (container: HTMLElement | null, line: number) => {
        // Cancel any flash a previous (superseded) jump is still waiting
        // to start, so only the LATEST jump ever highlights.
        pendingFlashCancelRef.current?.();
        const seq = ++jumpSeqRef.current;
        const supportsScrollEnd =
            typeof window !== "undefined" && "onscrollend" in window;
        let done = false;
        let fallback = 0;
        const fire = () => {
            if (done) return;
            done = true;
            if (fallback) window.clearTimeout(fallback);
            if (container) container.removeEventListener("scrollend", fire);
            pendingFlashCancelRef.current = null;
            if (jumpSeqRef.current === seq) {
                setJumpFlash({line, nonce: Date.now(), fading: false});
            }
        };
        const cancel = () => {
            if (done) return;
            done = true;
            if (fallback) window.clearTimeout(fallback);
            if (container) container.removeEventListener("scrollend", fire);
        };
        pendingFlashCancelRef.current = cancel;
        fallback = window.setTimeout(fire, supportsScrollEnd ? 600 : 300);
        if (supportsScrollEnd && container) {
            container.addEventListener("scrollend", fire);
        }
    };

    const handleSymbolClick = (line: number) => {
        setShowSymbolDropdown(false);
        // Track the caret line so bookmark toggles + keyboard navigation
        // (F2 / Shift+F2) operate on the line the user just jumped to.
        noteCaretLine(line);
        // the jump now EXPANDS first, then scrolls,
        // and starts the flash highlight only once the scroll has landed
        // (flashAfterScroll) — previously setJumpFlash ran BEFORE the
        // expand + smooth scroll, so the flash faded mid-flight. (
        // #2b: every jump — bookmark jump, outline click, TODO / Tests /
        // compare row, ⌘T dialog — flashes the target line so the eye
        // lands on it, in BOTH read and edit view.)
        if (!editMode) {
            if (isCollapsible && !expanded) setExpanded(true);
            // scroll the READ view's real scroll container. The
            // old code did `textareaRef.current?.parentElement` — but no
            // textarea exists in read mode, so the container was always null
            // and NOTHING scrolled
            // symbols in the editor view does not go to that line").
            // measuredCodeTop + measuredLineHeight are the same metrics the
            // squiggle/chevron overlays use, so the target line lands ~1/3
            // from the top — the same placement ReadModeFindBar uses.
            setTimeout(() => {
                const container = scrollContainerRef.current;
                if (!container) {
                    flashAfterScroll(null, line);
                    return;
                }
                const targetY = measuredCodeTop + (line - 1) * measuredLineHeight;
                const targetTop = Math.max(0, targetY - container.clientHeight / 3);
                // A no-op scroll (the line is already in view) never emits
                // `scrollend` — pass null so the flash uses the SHORT fallback
                // instead of waiting the full scrollend safety timeout.
                const willScroll = Math.abs(container.scrollTop - targetTop) > 1;
                container.scrollTo({
                    top: targetTop,
                    behavior: "smooth"
                });
                flashAfterScroll(willScroll ? container : null, line);
            }, 80);
        } else if (textareaRef.current) {
            // Edit mode: set the selection on the symbol's line, then scroll
            // the PARENT scroll container (the textarea is full-height inside
            // it — setting ta.scrollTop, as before, scrolled nothing).
            const ta = textareaRef.current;
            const src = editContent;
            const lineStarts: number[] = [0];
            for (let i = 0; i < src.length; i++) {
                if (src[i] === "\n") lineStarts.push(i + 1);
            }
            const start = lineStarts[Math.min(line - 1, lineStarts.length - 1)] ?? 0;
            const end = lineStarts[Math.min(line, lineStarts.length - 1)] ?? src.length;
            ta.focus();
            ta.setSelectionRange(start, end);
            scrollContainerRef.current?.scrollTo({
                top: Math.max(0, 16 + (line - 5) * (fontSize * 1.6)),
                behavior: "smooth"
            });
            flashAfterScroll(scrollContainerRef.current, line);
        }
    };
    // Wire the ref-stash so imperative methods (jumpToLine, nextBookmark,
    // prevBookmark) can invoke handleSymbolClick without entering the
    // useImperativeHandle deps array (which would re-create the handle
    // every render since handleSymbolClick closes over editMode, etc.).
    handleSymbolClickRef.current = handleSymbolClick;

    // Cell view rendering (read-only mode)
    const renderCellView = () => (
        <div className="divide-y">
            {cells.map((cell, i) => (
                <div key={i} className="relative">
                    <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-muted/30 border-b">
                        <div className="flex items-center gap-2 min-w-0 text-[10px] text-muted-foreground">
                            {cell.type === "markdown" ? <FileText className="size-3 text-cyan-500"/> :
                                <Code2 className="size-3 text-emerald-500"/>}
                            <span
                                className="font-mono">{cell.type === "markdown" ? "markdown" : "code"} · L{cell.startLine}–{cell.endLine}</span>
                            {cell.heading && <span className="truncate text-foreground/60">{cell.heading}</span>}
                        </div>
                        {cell.type === "code" && onRunCell && (
                            <Button variant="ghost" size="sm" onClick={() => onRunCell(cell.startLine, cell.endLine)}
                                    className="h-6 gap-1 text-[10px] px-2"
                                    title="Run only this code cell (lines {cell.startLine}–{cell.endLine})">
                                <Play className="size-3 text-emerald-500"/> Run cell
                            </Button>
                        )}
                    </div>
                    {cell.type === "markdown" ? (
                        <div className="px-4 py-3 max-w-none">
                            <MarkdownGithub>{cell.source.replace(/^\s*#\s?/gm, "")}</MarkdownGithub>
                        </div>
                    ) : (
                        <CellCodeBlock
                            source={cell.source}
                            rsStyle={rsStyle}
                            showLineNumbers={showLineNumbers}
                            startLine={cell.startLine}
                            wordWrap={wordWrap}
                            codeBg={codeBg}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            letterSpacing={letterSpacing}
                            isDark={isDark}
                            gutterMinWidth={gutterMinWidth(lines.length)}
                        />
                    )}
                </div>
            ))}
        </div>
    );

    // Code folding state — which symbol blocks are collapsed.
    // (Moved up to the symbols block above.)

    // Char width used to position folding chevrons and diagnostic
    // squiggles at the actual column. We MEASURE this from a hidden
    // probe span (see measureSpanRef below) so it matches the actual
    // rendered monospace font (JetBrains Mono / Geist Mono / fallback)
    // rather than the approximate `fontSize * 0.6` formula — which is
    // wrong by ~10-15% for most monospace fonts and caused squiggles
    // to drift to the wrong column on long lines.
    const charWidth = measuredCharWidth;
    // Left offset where code text actually starts (after the line-number
    // gutter). Matches the SyntaxHighlighter's lineNumberStyle.minWidth
    // (2.5em) + paddingRight (1em) = 3.5em total. Since 1em inside the
    // SyntaxHighlighter = its own font-size (set explicitly), 3.5em =
    // 3.5 * fontSize pixels — NOT 3.5 * charWidth (1em is font-size, not
    // char-width; for monospace fonts char-width ≈ 0.6 * font-size).
    const codeLeftOffset = showLineNumbers ? "3.5em" : "1rem";
    // Use the MEASURED code-text left offset (from the layout effect
    // above) instead of the formula fontSize*3.5. The formula can be
    // off by 10-15% because the actual rendered line-number gutter
    // width depends on the font/browser. The measured value is exact.
    // Falls back to the formula before the first measurement runs.
    const codeLeftOffsetPx = measuredCodeLeft > 0 ? measuredCodeLeft : (showLineNumbers ? fontSize * 3.5 : 0);

    // ─── indent guides (view mode) ──────────────────────
    // Derive the file's ACTUAL indent unit from its source (the most
    // common non-zero leading-whitespace width, tab=4) so guides land
    // where the nesting really starts — a 2-space file gets guides at
    // 2/4/6…, a 4-space file at 4/8/… Fallback 4.
    const indentUnitCols = React.useMemo(() => {
        let min = Infinity;
        for (const ln of code.split("\n")) {
            const t = ln.trim();
            if (!t || t.startsWith("#")) continue;
            const m = /^[ \t]*/.exec(ln)?.[0] ?? "";
            let sp = 0;
            for (const ch of m) sp += ch === "\t" ? 4 : 1;
            if (sp > 0 && sp < min) min = sp;
            if (min <= 2) break; // can't get smaller than the practical floor
        }
        return Number.isFinite(min) && min >= 2 && min <= 8 ? min : 4;
    }, [code]);

    // PERF: indent-guide overlay text memoized for the same reason —
    // scanning every line's leading whitespace per render is O(file).
    const guideOverlayText = React.useMemo(() => {
        if (!indentGuides) return null;
        const out: string[] = [];
        for (const ln of codeToShow.split("\n")) {
            let sp = 0;
            for (const ch of ln) {
                if (ch === " ") sp++;
                else if (ch === "\t") sp += 4;
                else break;
            }
            if (sp < indentUnitCols) {
                out.push("");
                continue;
            }
            const arr = new Array(sp).fill(" ");
            for (let k = 1; k * indentUnitCols <= sp; k++) {
                arr[k * indentUnitCols - 1] = "│";
            }
            out.push(arr.join(""));
        }
        return out.join("\n");
    }, [indentGuides, indentUnitCols, codeToShow]);

    // Syntax-highlighted view (read-only)
    const renderSimpleView = () => {
        const showMinimapHere = showMinimap && (expanded || !isCollapsible) && lines.length > 20;
        // ─── indent-guide overlay text lives in the memoized
        // `guideOverlayText` above (ONE transparent <pre> whose lines are
        // pure whitespace except '│' glyphs at each full indent-level
        // column; monospace means the glyphs land exactly on the code's
        // columns, and the cost is one text node per line — not N
        // absolutely-positioned divs).
        // Reserve a left gutter for the fold chevrons so they sit in their
        // own column instead of overlapping the line-number gutter.
        const foldGutterPx = codeFolding ? Math.max(20, fontSize * 1.5) : 0;
        // The whitespace overlay is absolutely positioned (inset-0) inside
        // the codeBodyRef div, which has paddingLeft = foldGutterPx. The
        // overlay's content starts at x=0 from the codeBodyRef's left
        // edge. But the SyntaxHighlighter (inside motion.div, which is
        // inside codeBodyRef) starts at x=foldGutterPx because of the
        // parent's paddingLeft. So the overlay's left padding must ALSO
        // include foldGutterPx to align with the code text.
        //
        // Total overlay left padding = foldGutterPx (parent gutter) +
        //   (showLineNumbers ? 3.5em: 0)  (SyntaxHighlighter's line-number gutter)
        const overlayLeftPx = foldGutterPx + (showLineNumbers ? fontSize * 3.5 : 0);
        const overlayLeftStr = `${overlayLeftPx}px`;
        return (
            <div
                ref={codeBodyRef}
                className="relative"
                style={{
                    paddingRight: showMinimapHere ? "80px" : "0",
                    // The blame gutter (xl and up only) overlays this reserved
                    // strip so the code column never shifts under it.
                    paddingLeft: `${foldGutterPx + (showBlameGutter ? 160 : 0)}px`,
                    /* FILL-BELOW-LAST-LINE:
minHeight 100% stretches this wrapper to the scrollport's
height for SHORT files, and the code theme's background
paints the whole stretched area — the color now continues
past the last line down to the bottom of the editor instead
of cutting off to the card color. Long files are unaffected
(content already exceeds 100%).

COLLAPSED ("Show less") CLIPPING: the clip lives HERE, on
the wrapper that owns BOTH the code and every absolutely-
positioned overlay (squiggles, spell chips, fold chevrons,
find rects, the minimap). Clipping only the inner code
container left the overlays unclipped — chips positioned
past the visible cut extended the scroll container's
scrollHeight, leaving a few px of vertical scroll in the
collapsed state; scrolling that sliver moved the words
under overlays that stayed glued to the screen. With the
wrapper itself capped, the overlays and the words share ONE
clip: zero leftover scroll, marks always glued to their
glyphs. Expanded keeps minHeight 100% (fill-below-last-line)
and no cap at all.

NO max-height transition (neither direction): animating the clip
made the rows visibly slide while the container shrank AND, mid-animation,
the clip's height could exceed the scrollport for a few frames — the
“Show less jiggle / code scrolls a bit above and below” + the
“zigzags stay fixed while the words move” mismatch. The collapse
and the expand are both INSTANT now: the clip, the overlays and the
scroll container land in their final geometry in one frame, so the
wavy underlines and the glyphs can never drift apart. */
                    minHeight: expanded ? "100%" : undefined,
                    maxHeight: !expanded && isCollapsible ? `${collapsedClipPx}px` : undefined,
                    overflow: !expanded && isCollapsible ? "hidden" : undefined,
                    background: codeBg
                }}
                onMouseMove={handleCodeMouseMove}
                onMouseLeave={handleCodeMouseLeave}
                onClick={handleCodeClick}
                onDoubleClick={handleCodeDoubleClick}
            >
                {/* Hidden char-width probe — 100 'M' glyphs in the same
            monospace font as the code body. We measure its bounding
            rect width and divide by 100 to get a pixel-accurate
            per-glyph width that matches the actual rendered font.
            This is what makes squiggle column positioning correct. */}
                <span
                    ref={measureSpanRef}
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        left: -9999,
                        top: -9999,
                        visibility: "hidden",
                        fontFamily: "var(--font-jb-mono), monospace",
                        fontSize: `${fontSize / 16}rem`,
                        // measure with the SAME letter spacing the
                        // code uses — spacing widens every glyph, so the measured
                        // char width must include it or the ruler/caret drift.
                        ...(letterSpacing ? {letterSpacing: `${letterSpacing}px`} : null),
                        whiteSpace: "pre",
                        pointerEvents: "none"
                    }}
                >{"M".repeat(100)}</span>
                {maxLineLengthHint > 0 && (
                    <div
                        aria-hidden="true"
                        className="absolute pointer-events-none top-0 bottom-0 z-0"
                        style={{
                            left: `${codeLeftOffsetPx + maxLineLengthHint * charWidth}px`,
                            width: "1px",
                            background: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
                            borderLeft: `1px dashed ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)"}`
                        }}
                    />
                )}
                {/* ─── column ruler (view mode) ─────────────────────
            A faint SOLID guide at the configured ruler column — softer
            than the maxLineLengthHint's dashed warning marker, and
            always present (line-length discipline at a glance).
            SUSPENDED while wordWrap is on — same semantics as the
            file-viewer's ruler (`rulerOn = rulerColumn > 0 && !wrap`):
            a soft-wrapped row's continuation starts back at x≈0, so a
            guide pinned to column N would lie about where the glyphs
            actually are. */}
                {rulerColumn > 0 && !wordWrap && (
                    <div
                        aria-hidden="true"
                        className="absolute pointer-events-none top-0 bottom-0 z-0"
                        style={{
                            left: `${codeLeftOffsetPx + rulerColumn * charWidth}px`,
                            width: `${Math.max(1, Math.min(6, rulerLineWidth))}px`,
                            background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)"
                        }}
                    />
                )}
                {/* ─── collapse/expand clip container (FIX) ────────────────
The previous implementation animated maxHeight with
framer-motion (`animate={{ maxHeight: expanded ? undefined: collapsedClipPx }}`). framer-motion treats a key whose
animate value becomes `undefined` as a REMOVED key and
falls back to the base target (null) — which is not
animatable for a px property, so the removal never
completes and the inline max-height stays stuck at the
collapsed clip (observed: 220px). Clicking "Show full code"
therefore left the full file trapped inside a tiny nested
scroller while the absolutely-positioned overlays (line
numbers, diagnostic squiggles, spell chips) kept painting
across ~16k px of empty white — a "white screen with
zigzags" — and the expand looked like a no-op
("reversed"). A plain conditional inline style is
deterministic: expanded → NO max-height cap at all
(undefined = no inline property), collapsed → the measured
clip. NO transition either (the outer wrapper's note):
an animated clip was the source of the Show-less jiggle —
mid-animation the container geometry disagreed with the
scrollport, so the scroll position bounced a few px and the
overlays drifted off their glyphs; the expand is already
instant, and the collapse is instant too now. */}
                <div
                    style={{
                        maxHeight: expanded ? undefined : collapsedClipPx,
                        overflow: expanded ? "visible" : "hidden",
                        minHeight: expanded ? "100%" : undefined,
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                    {webWorkerHighlighting ? (
                        fullChunks && fullChunkStartRows ? (
                            <ProgressiveCodeBody
                                chunks={fullChunks}
                                startRows={fullChunkStartRows}
                                totalLines={lines.length}
                                gutterDigits={String(lines.length).length}
                                showLineNumbers={showLineNumbers}
                                rsStyle={rsStyle}
                                wordWrap={wordWrap}
                                codeBg={codeBg}
                                fontSize={fontSize}
                                lineHeight={lineHeight}
                                letterSpacing={letterSpacing ? letterSpacing : 0}
                                isDark={isDark}
                                lineHeightPx={measuredLineHeight || fontSize * lineHeight}
                                onFrontier={setMountedRowLimit}
                                useWorkerHighlight
                            />
                        ) : (
                            /* Single-block path — the WHOLE file tokenizes in one
               main-thread Prism pass here; for anything but tiny
               buffers that is a visible freeze on file open. Route it
               through the worker too (with the identical main-thread
               block as fallback). */
                            /* clipOverflow={!expanded}: the collapsed ("Show less")
               preview must hold ZERO nested scroll containers — the
               shared wrapper clips both the words and the overlays,
               so they can never drift apart. */
                            <WorkerOrPlainHighlightBlock
                                useWorker
                                code={codeToShow}
                                language="python"
                                rsStyle={rsStyle}
                                showLineNumbers={showLineNumbers}
                                startingLineNumber={1}
                                wordWrap={wordWrap}
                                codeBg={codeBg}
                                fontSize={fontSize}
                                lineHeight={lineHeight}
                                letterSpacing={letterSpacing ? letterSpacing : 0}
                                isDark={isDark}
                                gutterDigits={String(Math.max(1, lines.length)).length}
                                bottomPadPx={viewPadTrim > 0 ? viewBottomPadPx : undefined}
                                clipOverflow={!expanded}
                                fallback={
                                    <SimpleHighlightBlock
                                        code={codeToShow}
                                        rsStyle={rsStyle}
                                        showLineNumbers={showLineNumbers}
                                        wordWrap={wordWrap}
                                        codeBg={codeBg}
                                        fontSize={fontSize}
                                        lineHeight={lineHeight}
                                        letterSpacing={letterSpacing ? letterSpacing : 0}
                                        isDark={isDark}
                                        gutterDigits={String(Math.max(1, lines.length)).length}
                                        bottomPadPx={viewPadTrim > 0 ? viewBottomPadPx : undefined}
                                        clipOverflow={!expanded}
                                    />
                                }
                            />
                        )
                    ) : (
                        /* overflow-hidden replaces overflow-x-auto in the collapsed
               preview: `overflow-x: auto` COMPUTES `overflow-y: auto`
               (CSS §11.1.1 — a non-visible axis forces the other to
               auto), which painted a nested VERTICAL scrollbar when the
               forced-8-row preview exceeded a short pane. Show-less mode
               must be unable to scroll on EITHER axis. */
                        <pre className={cn("m-0", !expanded ? "overflow-hidden" : "overflow-x-auto")} style={{
                            background: codeBg,
                            color: isDark ? "#abb2bf" : "#383a42",
                            fontSize: `${fontSize / 16}rem`,
                            lineHeight: String(lineHeight),
                            letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                            fontFamily: "var(--font-jb-mono), monospace",
                            minHeight: "100%",
                            flex: "1 1 auto",
                            padding: `1rem 1rem ${viewPadTrim > 0 ? viewBottomPadPx : 16}px 0`
                        }}>
              <code>{codeToShow}</code>
            </pre>
                    )}
                    {/* Whitespace overlay — when `showWhitespace` is on, render a
              transparent overlay <pre> aligned exactly over the code
              body. It contains the same code text, but every whitespace
              glyph is replaced with a visible marker (→ for tab, · for
              space, ¶ for end-of-line). Non-whitespace characters are
              colored transparent so the syntax highlighting underneath
              shows through.
              ALIGNMENT: The overlay's left padding MUST account for
              BOTH the parent's fold-gutter paddingLeft (foldGutterPx)
              AND the SyntaxHighlighter's line-number gutter (3.5em).
              See overlayLeftPx computation above. */}
                    {showWhitespace && (
                        <pre
                            aria-hidden="true"
                            /* The whitespace overlay is absolute inset-0 inside the shared
                 clip wrapper — its `overflow-x: auto` could still paint a
                 horizontal scrollbar (and a computed vertical one) over the
                 collapsed preview. Hidden in Show-less mode like the code
                 pre itself. */
                            className={cn("m-0 pointer-events-none absolute inset-0", !expanded ? "overflow-hidden" : "overflow-x-auto")}
                            style={{
                                margin: 0,
                                padding: `1rem 1rem 1rem ${overlayLeftStr}`,
                                fontSize: `${fontSize / 16}rem`,
                                lineHeight: String(lineHeight),
                                letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                fontFamily: "var(--font-jb-mono), monospace",
                                color: "transparent",
                                whiteSpace: "pre",
                                background: "transparent",
                                zIndex: 1
                            }}
                        >
{codeToShow.split("\n").map((ln, i) => {
    // The segmentation (leading/body/trailing runs) lives in
    // lib/whitespace-marks.ts — pure, unit-tested.
    const markerColor = isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.22)";
    const m = whitespaceMarksForLine(ln);
    const nodes: React.ReactNode[] = [];
    const markerSpan = (key: string, run: string) =>
        run.split("").map((ch, k) => (
            <span key={`${key}${k}`} style={{color: markerColor}}>{ch === "\t" ? "→" : "·"}</span>
        ));
    if (m.leading) nodes.push(...markerSpan(`l${i}-`, m.leading));
    nodes.push(<span key={`b${i}`}>{m.body}</span>);
    if (m.trailing) nodes.push(...markerSpan(`t${i}-`, m.trailing));
    // End-of-line marker (¶) — only on non-empty lines.
    if (m.hasEol) {
        nodes.push(<span key={`e${i}`} style={{color: markerColor}}>¶</span>);
    }
    return (
        <React.Fragment key={`ln${i}`}>
            {i > 0 && "\n"}
            {nodes}
        </React.Fragment>
    );
})}
            </pre>
                    )}
                    {/* ─── indent guides (view mode) ────────────────
              Transparent <pre> carrying '│' glyphs at each indent
              level; everything else is spaces (invisible). Left
              padding = the measured code-text offset so the glyphs
              line up with the actual columns. */}
                    {guideOverlayText && (
                        <pre
                            aria-hidden="true"
                            className="m-0 pointer-events-none absolute inset-0"
                            style={{
                                padding: `1rem 1rem 1rem ${codeLeftOffsetPx}px`,
                                fontSize: `${fontSize / 16}rem`,
                                lineHeight: String(lineHeight),
                                letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                fontFamily: "var(--font-jb-mono), monospace",
                                color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)",
                                whiteSpace: "pre",
                                background: "transparent",
                                zIndex: 1,
                                overflow: "hidden"
                            }}
                        >{guideOverlayText}</pre>
                    )}
                    {/* ─── rainbow brackets + pair guides ──────
              Same transparent-<pre> technique: non-bracket text is
              invisible, bracket glyphs tinted by nesting depth and
              multi-line pairs get a faint '│' guide at the opening
              column. Skipped with word wrap on (wrapped lines would
              misalign the column mapping). */}
                    {rainbowBrackets && !wordWrap && (() => {
                        const nodes = rainbowViewNodes;
                        // WINDOWED render (the one overlay that used to mount the
                        // WHOLE memoized set): only the fragments inside the visible
                        // ±40 line window mount; the hidden rows above collapse into
                        // newlines (position-preserving, near-zero DOM cost), so a
                        // 5,000-line file renders ~120 line fragments instead of
                        // 5,000 while scrolling.
                        if (!nodes) return null;
                        // The window/splicer math lives in
                        // layout/code-overlay-engine.ts — pure, unit-tested.
                        const range = windowedOverlayRange(overlayFirst, overlayLast, OVERLAY_WINDOW_MARGIN, nodes.length);
                        if (!range) return null;
                        const win = nodes.slice(range.firstIdx, range.lastIdx + 1);
                        const spacer = range.spacer;
                        return (
                            <pre
                                aria-hidden="true"
                                className="m-0 pointer-events-none absolute inset-0"
                                style={{
                                    padding: `1rem 1rem 1rem ${codeLeftOffsetPx}px`,
                                    fontSize: `${fontSize / 16}rem`,
                                    lineHeight: String(lineHeight),
                                    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                    fontFamily: "var(--font-jb-mono), monospace",
                                    color: "transparent",
                                    whiteSpace: "pre",
                                    background: "transparent",
                                    zIndex: 1,
                                    overflow: "hidden"
                                }}
                            >{spacer}{win}</pre>
                        );
                    })()}
                </div>

                {/* Current-line highlight — renders a subtle background on the
            line under the mouse cursor OR the last-clicked line (whichever
            is active). Uses the MEASURED line height (not the formula) so
            it lines up with the actual rendered text. Only shown when
            highlightCurrentLine is on AND there is an active line. */}
                {highlightCurrentLine && activeHighlightLine !== null && (
                    <div
                        className="current-line-highlight absolute pointer-events-none left-0 right-0 z-0"
                        style={{
                            top: `${lineTop(activeHighlightLine)}px`,
                            height: `${lineHeightPx}px`
                        }}
                    />
                )}

                {/* the jump flash — after a bookmark/outline/TODO
            jump the exact target line gets an amber band that holds
            briefly, then fades back to normal (~1.5 s total). Positioned
            with the same measured metrics as the current-line highlight
            so it lines up in read AND edit mode. */}
                {jumpFlash && (
                    <div
                        key={jumpFlash.nonce}
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute left-0 right-0 z-20 border-y border-amber-400/80",
                            "bg-amber-300/40 dark:bg-amber-400/30 transition-opacity duration-[1300ms] ease-out",
                            jumpFlash.fading ? "opacity-0" : "opacity-100"
                        )}
                        style={{
                            top: `${lineTop(jumpFlash.line)}px`,
                            height: `${lineHeightPx}px`
                        }}
                    />
                )}

                {/* Sticky cursor indicator — a thin vertical caret on the
active line that's visible even when the editor isn't
focused. Useful for screen-magnifier users tracking the
current line. The element carries the `sticky-cursor-line`
class so the user can restyle it via the existing CSS rule
in globals.css (the rule previously had nothing to style).
Same positioning logic as the current-line highlight. */}
                {stickyCursorIndicator && activeHighlightLine !== null && (
                    <div
                        className="sticky-cursor-line absolute pointer-events-none z-10"
                        style={{
                            top: `${lineTop(activeHighlightLine)}px`,
                            left: `${codeLeftOffsetPx}px`,
                            width: "2px",
                            height: `${lineHeightPx}px`,
                            background: "var(--accent, #10b981)",
                            opacity: 0.7
                        }}
                    />
                )}

                {/* ─── profiling heatmap (view mode) ───────────────
            Per-function timings from the Diagnostics panel's Profile
            tool, mapped onto def lines by the parent. A red intensity
            bar (opacity ∝ cumulative time share) sits at the left edge
            of each timed line with a hover tooltip; the chip at the
            top-right clears the overlay. */}
                {timingOverlay && timingOverlay.length > 0 && (
                    <>
                        {(() => {
                            const maxCum = Math.max(
                                0.000001,
                                ...timingOverlay.map((t) => t.cumtime)
                            );
                            return timingOverlay.filter((t) => t.line >= overlayFirst && t.line <= overlayLast).map((t, i) => {
                                const frac = Math.min(1, t.cumtime / maxCum);
                                return (
                                    <div
                                        key={`tmark-${t.line}-${i}`}
                                        className="absolute pointer-events-none z-20"
                                        style={{
                                            top: `${lineTop(t.line)}px`,
                                            left: 0,
                                            width: "4px",
                                            height: `${lineHeightPx}px`,
                                            background: `rgba(234, 88, 12, ${0.3 + frac * 0.6})`,
                                            borderRadius: 1
                                        }}
                                        title={`Profile: cumulative ${t.cumtime.toFixed(3)}s · own ${t.tottime.toFixed(3)}s (hottest function: ${maxCum.toFixed(3)}s)`}
                                    />
                                );
                            });
                        })()}
                        {onClearTiming && (
                            <button
                                type="button"
                                onClick={onClearTiming}
                                className="absolute top-1.5 right-2 z-30 inline-flex items-center gap-1 rounded-md border bg-popover/95 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm hover:bg-popover"
                                title="Clear the profiling heatmap from this file"
                            >
                                <Zap className="size-3 text-orange-500"/>
                                Timing heatmap
                                <X className="size-3 text-muted-foreground"/>
                            </button>
                        )}
                    </>
                )}

                {/* Inline git BLAME gutter — author + age per commit group,
            right where the code is READ (the Git Diff panel's blame
            mode used to be the only home for it). Rows position with
            the same measured metrics the squiggle overlays use. */}
                <BlameGutter
                    folderSlug={folderSlug ?? ""}
                    fileSlug={fileSlug ?? ""}
                    visible={showBlameGutter}
                    lineCount={lines.length}
                    lineHeightPx={measuredLineHeight || fontSize * lineHeight}
                    fontSize={fontSize}
                    isDark={isDark}
                    topOffsetPx={measuredCodeTop}
                />

                {/* Code folding chevrons — clickable markers placed in a
            dedicated gutter to the LEFT of the line numbers (so they
            never overlap the code text or the line numbers themselves).
            Each chevron is sized for a comfortable click target
            (≥16px) and shows a hover background so it's discoverable.
            Works for every block-level symbol: def, class, for, if,
            while, try, with. */}
                {codeFolding && symbols.filter((sym) => sym.line >= overlayFirst && sym.line <= overlayLast).map((sym) => {
                    const isFolded = foldedSymbols.has(sym.line);
                    const top = lineTop(sym.line);
                    return (
                        <button
                            type="button"
                            key={`fold-${sym.line}`}
                            aria-label={isFolded
                                ? `Expand ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`
                                : `Collapse ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`}
                            className="absolute pointer-events-auto z-20 flex items-center justify-center rounded-sm hover:bg-foreground/10 focus:bg-foreground/15 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                            style={{
                                top: `${top}px`,
                                // Place the chevron in its own dedicated gutter
                                // (the paddingLeft we added on the wrapper above).
                                left: 0,
                                width: `${foldGutterPx}px`,
                                height: `${lineHeightPx}px`,
                                color: isDark ? "#9ca3af" : "#4b5563",
                                fontSize: `${Math.max(11, fontSize * 0.9)}px`,
                                fontWeight: 700,
                                background: "transparent",
                                border: 0,
                                cursor: "pointer",
                                lineHeight: 1
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setFoldedSymbols((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sym.line)) next.delete(sym.line);
                                    else next.add(sym.line);
                                    return next;
                                });
                            }}
                            title={isFolded
                                ? `Expand ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`
                                : `Collapse ${formatSymbol(sym)} (lines ${sym.line}-${sym.endLine})`}
                        >
                            {isFolded ? "▸" : "▾"}
                        </button>
                    );
                })}

                {/* Git diff gutter — DISPLAY-ROW aware (white-space fix):
markers for lines past the collapse cut or under a fold are
skipped instead of drifting into the preview's white space. */}
                {gitDiffLines && (gitDiffLines.added.length > 0 || gitDiffLines.modified.length > 0 || gitDiffLines.removed.length > 0) && (
                    <div className="absolute left-0 top-4 bottom-0 w-1 pointer-events-none">
                        {gitDiffLines.added.filter((ln) => ln >= overlayFirst && ln <= overlayLast).map((ln) => {
                            const t = viewRowTopOf(ln);
                            return t === null ? null : <div key={`a${ln}`} className="absolute w-1 bg-emerald-500"
                                                            style={{top: `${t}px`, height: `${lineHeightPx}px`}}/>;
                        })}
                        {gitDiffLines.modified.filter((ln) => ln >= overlayFirst && ln <= overlayLast).map((ln) => {
                            const t = viewRowTopOf(ln);
                            return t === null ? null : <div key={`m${ln}`} className="absolute w-1 bg-amber-500"
                                                            style={{top: `${t}px`, height: `${lineHeightPx}px`}}/>;
                        })}
                        {gitDiffLines.removed.filter((ln) => ln >= overlayFirst - 1 && ln <= overlayLast + 1).map((ln) => {
                            const t = viewRowTopOf(Math.max(1, ln - 1));
                            return t === null ? null : <div key={`r${ln}`} className="absolute w-1 bg-red-500"
                                                            style={{top: `${t}px`, height: `${lineHeightPx}px`}}/>;
                        })}
                    </div>
                )}
                {/* Coverage gutter — thin emerald strip on each EXECUTED line of
            the last "Run with coverage…" run (page.tsx filters the map to
            this file). Same pattern as the git-diff strip above: the
            coverage twin for edit mode lives in EditLineGutterRows
            (tinted gutter numbers). Capped at 4,000 markers so a huge
            trace never paints thousands of absolutely-positioned
            divs; the Output panel's Coverage tab keeps the full list. */}
                {/* Line-profiler heat gutter — a warm intensity strip whose
            opacity scales with each line's share of the total time
            (view mode; from the Line Profile run). */}
                {lineProfileHeat && Object.keys(lineProfileHeat).length > 0 && (() => {
                    const entries = Object.entries(lineProfileHeat);
                    const maxUs = Math.max(...entries.map(([, us]) => us), 1);
                    return (
                        <div className="absolute left-0 top-4 bottom-0 w-1 pointer-events-none"
                             aria-label="Per-line timing heat from the last line profile">
                            {entries
                                .map(([lineStr, us]) => ({line: Number(lineStr), us}))
                                .filter((e) => Number.isFinite(e.line) && e.line >= overlayFirst && e.line <= overlayLast)
                                .slice(0, 4000)
                                .map((e) => {
                                    const t = viewRowTopOf(e.line);
                                    if (t === null) return null;
                                    const share = e.us / maxUs;
                                    return (
                                        <div
                                            key={`heat${e.line}`}
                                            className="absolute w-1"
                                            style={{
                                                top: `${t}px`,
                                                height: `${lineHeightPx}px`,
                                                backgroundColor: share > 0.66 ? "#f59e0b" : share > 0.33 ? "#fbbf24" : "#fde68a",
                                                opacity: 0.35 + share * 0.55
                                            }}
                                            title={`Line ${e.line} — ${(e.us / 1000).toFixed(2)} ms (${Math.round(share * 100)}% of the slowest line)`}
                                        />
                                    );
                                })}
                        </div>
                    );
                })()}
                {/* Uncovered lines from the last coverage run — the dim red
            twin of the emerald executed-line strip. */}
                {coverageUncovered && coverageUncovered.length > 0 && (
                    <div className="absolute left-2 top-4 bottom-0 w-1 pointer-events-none"
                         aria-label="Lines NOT executed in the last coverage run">
                        {coverageUncovered.filter((ln) => ln >= overlayFirst && ln <= overlayLast).slice(0, 4000).map((ln) => {
                            const t = viewRowTopOf(ln);
                            return t === null ? null : (
                                <div key={`uncov${ln}`} className="absolute w-1 bg-red-500/40"
                                     style={{top: `${t}px`, height: `${lineHeightPx}px`}}
                                     title={`Line ${ln} was NOT executed in the last coverage run`}/>
                            );
                        })}
                    </div>
                )}
                {coverageLines && coverageLines.length > 0 && (
                    <div className="absolute left-1 top-4 bottom-0 w-1 pointer-events-none"
                         aria-label="Executed lines from the last coverage run">
                        {coverageLines.filter((ln) => ln >= overlayFirst && ln <= overlayLast).slice(0, 4000).map((ln) => {
                            // DISPLAY-ROW aware (white-space fix) — executed lines
                            // beyond the collapsed preview cut draw nothing.
                            const t = viewRowTopOf(ln);
                            return t === null ? null : (
                                <div key={`cov${ln}`} className="absolute w-1 bg-emerald-500/60"
                                     style={{top: `${t}px`, height: `${lineHeightPx}px`}}
                                     title={`Line ${ln} executed in the last coverage run`}/>
                            );
                        })}
                    </div>
                )}
                {/* Bookmark gutter markers — amber ▶ glyphs pinned to the right
            edge of each bookmarked line. Clicking a marker jumps to the
            line; Ctrl+F2 (toggled in edit mode) removes it. Renders in
            both edit and read mode (read mode relies on the outer
            scroll container; edit mode relies on the textarea). */}
                {bookmarksRef.current.size > 0 && Array.from(bookmarksRef.current).filter((ln) => ln >= overlayFirst && ln <= overlayLast).map((ln) => {
                    // DISPLAY-ROW aware (white-space fix): a bookmark on a row
                    // not rendered (folded / past the preview cut) is skipped.
                    const t = viewRowTopOf(ln);
                    if (t === null) return null;
                    return (
                        <button
                            key={`bm${ln}`}
                            type="button"
                            onClick={() => handleSymbolClick(ln)}
                            className="absolute pointer-events-auto flex items-center justify-center text-amber-500 hover:text-amber-600 hover:scale-110 transition-transform"
                            style={{
                                top: `${t}px`,
                                right: showMinimapHere ? "90px" : "4px",
                                height: `${lineHeightPx}px`,
                                width: `${lineHeightPx}px`,
                                zIndex: 5
                            }}
                            title={`Bookmark on line ${ln} — click to jump, Ctrl+F2 to remove`}
                            aria-label={`Bookmark on line ${ln}`}
                        >
                            <span className="text-[10px] leading-none">▶</span>
                        </button>
                    );
                })}
                {/* Test watch marks — ✓ / ✕ per test in this file after a
            watched run (Tests panel ▸ Watch on save). DISPLAY-ROW
            aware like the bookmarks below. */}
                {watchMarks.length > 0 && watchMarks.map((t, i) => {
                    const top = viewRowTopOf(t.line as number);
                    if (top === null) return null;
                    const ok = t.status === "passed";
                    return (
                        <span
                            key={`wt-${i}`}
                            aria-hidden="true"
                            title={`${t.name} — ${ok ? "passed" : t.status} (watch run)`}
                            className="absolute pointer-events-none text-[10px] font-bold"
                            style={{
                                top: `${top}px`,
                                right: showMinimapHere ? "90px" : "18px",
                                height: `${lineHeightPx}px`,
                                lineHeight: `${lineHeightPx}px`,
                                color: ok ? "#10b981" : "#ef4444",
                                zIndex: 5
                            }}
                        >
              {ok ? "✓" : "✕"}
            </span>
                    );
                })}

                {/* Symbol hover tooltips — REBUILT as the floating hover card
            rendered from `hoverTip` (see handleCodeMouseMove). The old
            implementation was a full-width INVISIBLE strip per symbol
            with pointer-events:auto + a native title — those strips sat
            ON TOP of the code and swallowed mousedown/drag, which is
            why text could not be SELECTED in view mode ("can't select
            a part and right-click like in edit mode"). The strips are
            GONE; the tooltip now derives from the hovered LINE and its
            card is pointer-events-none, so every pixel of the code is
            selectable again. Diagnostics squiggles likewise became
            pointer-events-none (their messages feed the same card). */}
                {/* Inline diagnostics squigglies.
The squiggle is positioned at the diagnostic's `col` (when
given — ruff/mypy both report it) and sized to span only
the offending token on that line, NOT the whole row. When
`col` is missing we fall back to the first non-whitespace
run on the line. The width is computed from the actual
source text, so the wavy underline always lines up with
the syntax-highlighted glyphs underneath.

CRITICAL: the div is filled with the ACTUAL SOURCE TEXT
slice (from tokenStart to tokenEnd), not just a single
`&nbsp;`. text-decoration: underline wavy ONLY draws the
wavy line under actual text glyphs — an empty div with a
fixed width gets a wavy line that's only 1 char wide
(under the lone nbsp), which is the "tiny part at the
beginning of the word" bug. By filling the div with the
real token text (rendered transparent so it's invisible
on top of the syntax-highlighted code underneath), the
wavy underline spans the FULL token width. */}
                {diagnostics && diagnostics.filter((d) => d.line >= overlayFirst && d.line <= overlayLast).map((d, i) => {
                    // The source line the diagnostic is on (1-indexed).
                    const srcLine = lines[d.line - 1] ?? "";
                    // DISPLAY-ROW aware (the white-space-zigzag fix): a squiggle
                    // whose line is hidden under a fold or sits past the
                    // COLLAPSED preview cut is not rendered at all — it used to
                    // float in the white space below the preview rows.
                    const top = viewRowTopOf(d.line);
                    if (top === null) return null;
                    // Default span: first non-whitespace token → end of line
                    // (or first newline). Trim trailing whitespace.
                    let tokenStart = 0;
                    while (tokenStart < srcLine.length && /\s/.test(srcLine[tokenStart])) tokenStart++;
                    let tokenEnd = srcLine.length;
                    // If the diagnostic carries a column, anchor the squiggle
                    // there and span the rest of the IDENTIFIER (letters, digits,
                    // underscore — Python identifier rules). Previously this used
                    // "until whitespace" which incorrectly included trailing
                    // punctuation like `)` in `print(undefined_name)` or `` in
                    // `another_undefined_call`, making the squiggle overhang
                    // past the actual offending token. Restricting to identifier
                    // chars ensures the squiggle spans EXACTLY the offending name.
                    if (typeof d.col === "number" && d.col > 0) {
                        tokenStart = Math.min(Math.max(0, d.col - 1), srcLine.length);
                        tokenEnd = tokenStart;
                        // Extend only over identifier characters (letters, digits,
                        // underscore). Stops at `(`, `)`, `.`, `,`, `:`, `[`, `]`,
                        // quotes, operators, whitespace — so the squiggle spans
                        // exactly the offending identifier.
                        while (tokenEnd < srcLine.length && /[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                        // If that produced an empty span (col was on a non-identifier
                        // char like an operator or bracket), fall back to a 1-token
                        // forward scan: skip non-identifier chars, then consume the
                        // next identifier run.
                        if (tokenEnd <= tokenStart) {
                            tokenEnd = tokenStart;
                            while (tokenEnd < srcLine.length && !/[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                            while (tokenEnd < srcLine.length && /[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                        }
                    }
                    const spanChars = Math.max(1, tokenEnd - tokenStart);
                    const squiggleLeftPx = codeLeftOffsetPx + tokenStart * charWidth;
                    const squiggleWidthPx = spanChars * charWidth;
                    const color = d.severity === "error" ? "#ef4444" : d.severity === "warning" ? "#f59e0b" : "#3b82f6";
                    // The actual source text slice — rendered transparent so
                    // the syntax-highlighted code underneath shows through, but
                    // the wavy underline draws under EVERY character (giving
                    // us a full-width squiggle). We use a <span> with the text
                    // rather than padding the div with `&nbsp;` repeated N
                    // times because the actual text guarantees correct glyph
                    // widths (monospace assumption is fine for code, but using
                    // the real text is bulletproof).
                    const squiggleText = srcLine.slice(tokenStart, tokenEnd) || "\u00a0";
                    return (
                        <div
                            key={`d${i}`}
                            className="absolute pointer-events-none"
                            style={{
                                top: `${top}px`,
                                left: `${squiggleLeftPx}px`,
                                width: `${squiggleWidthPx}px`,
                                height: `${lineHeightPx}px`,
                                color: "transparent",
                                // Match the font metrics of the code underneath so
                                // each glyph in `squiggleText` lines up exactly with
                                // the corresponding glyph in the syntax highlighter.
                                fontFamily: "var(--font-jb-mono), monospace",
                                fontSize: `${fontSize}px`,
                                lineHeight: `${lineHeightPx}px`,
                                whiteSpace: "pre",
                                overflow: "hidden"
                            }}
                        >
                            <span aria-hidden="true">{squiggleText}</span>
                            {/* The wavy line — a real DOM child (lib/spell-marks →
                  WaveUnderline), painted with the element's layer so it
                  can never sit at a stale screen position while the
                  code scrolls. pointer-events-none on the wrapper keeps
                  the squiggle from blocking text SELECTION in view
                  mode — the diagnostic's message shows in the shared
                  floating hover card instead of a native title. */}
                            <WaveUnderline color={color}/>
                        </div>
                    );
                })}

                {/* The view-mode spell chips lives in view-spell-chips.tsx (Phase 2b extraction — same JSX, explicit props). */}
                <ViewSpellChips
                    editMode={editMode}
                    spellEnabled={spellEnabled}
                    spellIssues={spellIssues}
                    lines={lines}
                    overlayFirst={overlayFirst}
                    overlayLast={overlayLast}
                    viewRowTopOf={viewRowTopOf}
                    rawLineToViewRow={rawLineToViewRow}
                    viewTabSize={viewTabSize}
                    viewWrapCols={viewWrapCols}
                    viewRowPrefix={viewRowPrefix}
                    lineHeightPx={lineHeightPx}
                    codeLeftOffsetPx={codeLeftOffsetPx}
                    charWidth={charWidth}
                    fontSize={fontSize}
                    ignoreSpellWord={ignoreSpellWord}
                    replaceSpellWord={replaceSpellWord}
                    replaceSpellWordAt={replaceSpellWordAt}
                />
                {/* ─── find-match highlight overlay (view mode) ────
            One rounded rect per occurrence (viewFindMatches — computed
            against the RENDERED rows — see the symbols block), with the
            CURRENT occurrence rendered stronger so the find bar's ↑/↓
            arrows visibly step through the hits. Same metrics as the
            squiggles above, so the rects line up with the glyphs.
            pointer-events-none keeps the code clickable. */}
                {showFind && !editMode && viewFindMatches.length > 0 && viewFindMatches.filter((m) => m.row >= overlayFirst && m.row <= overlayLast).map((m, i) => (
                    <div
                        key={`fm${i}`}
                        aria-hidden="true"
                        className="absolute pointer-events-none rounded-[3px]"
                        style={{
                            // `row` is the DISPLAY row (folds + collapse cut
                            // applied) — rects stay glued to the glyphs.
                            top: `${lineTop(m.row)}px`,
                            left: `${codeLeftOffsetPx + m.start * charWidth}px`,
                            width: `${Math.max(2, (m.end - m.start) * charWidth)}px`,
                            height: `${lineHeightPx}px`,
                            background:
                                i === currentMatch ? "rgba(245, 158, 11, 0.45)" : "rgba(234, 179, 8, 0.22)",
                            boxShadow:
                                i === currentMatch ? "0 0 0 1px rgba(245, 158, 11, 0.8)" : undefined,
                            zIndex: i === currentMatch ? 2 : 1
                        }}
                    />
                ))}

                {/* The view-mode hover tooltip lives in view-hover-tooltip.tsx (Phase 2b extraction — same JSX, explicit props). */}
                <ViewHoverTooltip
                    hoverTip={hoverTip}
                    editMode={editMode}
                    viewRowTopOf={viewRowTopOf}
                    lineTop={lineTop}
                    lineHeightPx={lineHeightPx}
                    typeSymbols={typeSymbols}
                    codeLeftOffsetPx={codeLeftOffsetPx}
                />

                {/* Minimap — the SAME canvas rail the Markdown edit surface
            uses (shared component): density rows per line, a live
            viewport-indicator rectangle, and click/drag-to-scroll.
            The old 2px-font <pre> showed only the first 8,000
            characters with no viewport indicator and no interaction. */}
                {showMinimapHere && (
                    <MinimapColumn scrollRef={scrollContainerRef} text={codeToShow} dark={isDark}/>
                )}

                <AnimatePresence>
                    {!expanded && isCollapsible && (
                        <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                                    className="pointer-events-none absolute inset-x-0 bottom-0 h-20"
                                    style={{background: `linear-gradient(to top, ${codeBg}, ${codeBg}00)`}}/>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div
            className={cn(
                "rounded-xl border overflow-hidden bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow flex flex-col h-full relative",
                // `relative` — the find bars pin to the viewer
                // root (below the header) instead of scrolling away with the
                // code body.
                // The viewer is laid out as a column: header (shrink-0) +
                // body (flex-1 min-h-0 overflow-auto) + optional footer
                // (shrink-0). The parent pane in page.tsx is overflow-hidden
                // with a fixed height, so the body's overflow-auto is the
                // ONLY scroll container — the header pins naturally above it
                // without needing `position: sticky`. This is the VSCode
                // pattern: toolbar stays fixed while code scrolls inside.
            )}
            onKeyDown={(e) => {
                // ─── Symbol / refactoring shortcuts (handled at the outer
                //     wrapper so they fire in both edit and read mode). The
                //     target checks for TEXTAREA/INPUT prevent hijacking the
                //     browser's default Cmd+B (bookmarks) etc. when focus is
                //     elsewhere (e.g. on a button). ────────────────────────
                // ─── VIEW-MODE dictionary-add undo: no textarea exists there,
                //     so the viewer root owns Ctrl+Z — one-shot remove of the
                //     just-added dictionary word + zigzag restore. ─────────
                if (
                    !editMode &&
                    (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey &&
                    (e.key === "z" || e.key === "Z") &&
                    !(e.target instanceof HTMLTextAreaElement) &&
                    !(e.target instanceof HTMLInputElement)
                ) {
                    if (undoDictionaryAdd()) {
                        e.preventDefault();
                        return;
                    }
                }
                if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent("praxis:goto-symbol"));
                    return;
                }
                // ─── ⇧↵ — run the # %% cell containing the caret.
                //     VIEW mode only (edit mode is handled in the textarea's
                //     own onKeyDown, which fires first and runs the edited
                //     buffer; this guard also prevents a double run since the
                //     event bubbles up to this wrapper afterwards).
                if (!editMode && matchesShortcut(e.nativeEvent, "run.runCell") && /^\s*#\s*%%/m.test(code)) {
                    const line = caretLineRef.current;
                    const cell = cells.find((c) => c.type === "code" && line >= c.startLine && line <= c.endLine);
                    if (cell && onRunCell && cell.source.trim()) {
                        e.preventDefault();
                        onRunCell(cell.startLine, cell.endLine);
                        return;
                    }
                }
                const targetIsTexty =
                    e.target instanceof HTMLTextAreaElement ||
                    e.target instanceof HTMLInputElement;
                // ─── F12 / ⇧F12 — go-to-definition / peek references ──
                // ADDITIONAL bindings (⌘⇧B and ⌥F7 above keep working — both
                // routes dispatch the same window events / popup). Skipped only
                // for focused INPUT fields inside the viewer (the find bar) so
                // F12 doesn't hijack a field's own function-key handling; the
                // edit-mode TEXTAREA is the editor itself, so it qualifies.
                if (
                    !(e.target instanceof HTMLInputElement) &&
                    matchesShortcut(e.nativeEvent, "editor.gotoDef")
                ) {
                    e.preventDefault();
                    // LSP-first in BOTH modes: the semantic target wins; the
                    // fallback dispatches the page's text-search handler exactly
                    // like the old paths did (the async call is fire-and-forget
                    // so the keydown itself stays synchronous).
                    const symbol = resolveCaretSymbol();
                    if (symbol) {
                        void dispatchGotoDefinition(symbol, resolveCaretPosition());
                    } else if (editMode) {
                        // No caret word — let the page try getSelectedSymbol().
                        window.dispatchEvent(new CustomEvent("praxis:goto-declaration"));
                    }
                    return;
                }
                if (
                    !(e.target instanceof HTMLInputElement) &&
                    matchesShortcut(e.nativeEvent, "editor.findReferences")
                ) {
                    e.preventDefault();
                    void openPeekReferences();
                    return;
                }
                if (targetIsTexty) {
                    if (matchesShortcut(e.nativeEvent, "editor.gotoDeclaration")) {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent("praxis:goto-declaration"));
                        return;
                    }
                    // Rename: F2 (the VS Code binding) and the legacy Shift+F6,
                    // both LSP-aware — the caret position rides along in the
                    // event detail so the page can offer the semantic rename.
                    if ((e.key === "F2" && !e.ctrlKey && !e.altKey && !e.metaKey) || (e.shiftKey && e.key === "F6")) {
                        e.preventDefault();
                        const position = resolveCaretPosition();
                        window.dispatchEvent(
                            new CustomEvent("praxis:rename-symbol", {
                                detail: {
                                    ...(position ?? {}),
                                    symbol: resolveCaretSymbol() || undefined,
                                },
                            })
                        );
                        return;
                    }
                    if (e.altKey && e.key === "F7") {
                        e.preventDefault();
                        window.dispatchEvent(new CustomEvent("praxis:find-usages"));
                        return;
                    }
                }
                if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
                    // Find works in BOTH edit mode and read mode. In edit mode
                    // it opens the in-textarea find bar with prev/next + match
                    // counter. In read mode it opens a simpler search that
                    // scrolls to the first matching line.
                    e.preventDefault();
                    openFindBar();
                    return;
                }
                // ─── / Ctrl/Cmd+Home / Ctrl/Cmd+End ─
                //     Jump to the top/bottom of the file in BOTH modes (and
                //     extend the selection when Shift is held, like a real
                // editor). plain Home/End and Ctrl/⌘+ArrowUp/
                //     ArrowDown are handled too ("ctrl + end of ctrl + home
                //     etc") — and the scroll container is now focusable so
                //     these actually fire in view mode.
                if ((e.ctrlKey || e.metaKey) && (e.key === "Home" || e.key === "End")) {
                    e.preventDefault();
                    const toTop = e.key === "Home";
                    const c = scrollContainerRef.current;
                    if (c) c.scrollTo({top: toTop ? 0 : c.scrollHeight});
                    if (editMode) {
                        const ta = textareaRef.current;
                        if (ta) {
                            const target = toTop ? 0 : ta.value.length;
                            if (e.shiftKey) {
                                const anchor =
                                    ta.selectionDirection === "backward" ? ta.selectionEnd : ta.selectionStart;
                                ta.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target));
                            } else {
                                ta.setSelectionRange(target, target);
                            }
                            ta.focus();
                        }
                    }
                    return;
                }
                // Plain Home / End (no modifiers) — top / bottom of the file.
                if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "Home" || e.key === "End")) {
                    // Only hijack when the FOCUS is the viewport itself (not a
                    // textarea/input — those keep the browser's caret behavior).
                    if (e.target === scrollContainerRef.current) {
                        e.preventDefault();
                        const c = scrollContainerRef.current;
                        if (c) c.scrollTo({top: e.key === "Home" ? 0 : c.scrollHeight});
                        return;
                    }
                }
                // Ctrl/⌘+ArrowUp / ArrowDown — scroll ~12 lines without moving
                // the caret (handy in view mode; harmless over the textarea,
                // which keeps its own word-jump on plain Ctrl+Arrows).
                if (
                    (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
                    (e.key === "ArrowUp" || e.key === "ArrowDown") &&
                    e.target !== textareaRef.current
                ) {
                    e.preventDefault();
                    const c = scrollContainerRef.current;
                    if (c) {
                        const step = (e.key === "ArrowUp" ? -1 : 1) * (measuredLineHeight || fontSize * 1.6) * 12;
                        c.scrollTo({top: Math.max(0, c.scrollTop + step)});
                    }
                    return;
                }
                // ─── F2 / ⇧F2 / ⌘F2 also work in VIEW
                //     mode — previously they were wired to the edit textarea's
                //     onKeyDown only, so bookmark navigation silently did
                //     nothing while reading. The scroll container is focusable
                //     (tabIndex=0), so keys bubble here whenever the viewer has
                //     focus. The textarea handles them itself when it is the
                //     target (the bubbled event would otherwise double-toggle),
                //     and other text-entry targets are skipped too.
                if (
                    e.target !== textareaRef.current &&
                    !(e.target instanceof HTMLTextAreaElement) &&
                    !(e.target instanceof HTMLInputElement)
                ) {
                    // Ctrl/Cmd+F2 — toggle a bookmark on the caret's line (the
                    // view-mode "caret" is the last clicked / jumped-to line).
                    if (matchesShortcut(e.nativeEvent, "editor.toggleBookmark")) {
                        e.preventDefault();
                        toggleBookmarkRef.current();
                        return;
                    }
                    // F2 (no mods) — jump to the next bookmark.
                    if (
                        matchesShortcut(e.nativeEvent, "editor.nextBookmark") &&
                        !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey
                    ) {
                        e.preventDefault();
                        nextBookmarkRef.current();
                        return;
                    }
                    // Shift+F2 — jump to the previous bookmark.
                    if (matchesShortcut(e.nativeEvent, "editor.prevBookmark")) {
                        e.preventDefault();
                        prevBookmarkRef.current();
                        return;
                    }
                }
            }}
        >
            {/* Header — pinned at the top via flexbox (shrink-0). No
          `position: sticky` needed because the parent is now a flex
          column with the body as the only scroll container. `z-20`
          keeps it above the squiggle/chevron overlays inside the body. */}
            <div
                className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30 z-20 backdrop-blur supports-[backdrop-filter]:bg-muted/60 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <FileCode2 className="size-4 shrink-0 text-emerald-500"/>
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-foreground" title={fileName}>{fileName}</p>
                        {folderName && <p
                          className="text-xs truncate text-muted-foreground">{folderName}{hasCells && ` \u00b7 ${cells.length} cells`}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {/* The stats chip + grouped toolbar + View/Edit control lives in code-viewer-toolbar.tsx (Phase 2b extraction — same JSX, explicit props). */}
                    <CodeViewerToolbar
                        lines={lines}
                        diagCounts={diagCounts}
                        shownDiagnostics={shownDiagnostics}
                        handleSymbolClickRef={handleSymbolClickRef}
                        spellEnabled={spellEnabled}
                        spellChecking={spellChecking}
                        spellIssues={spellIssues}
                        onOpenFolder={onOpenFolder}
                        canOpenFolder={canOpenFolder}
                        isOpeningFolder={isOpeningFolder}
                        handleDownload={handleDownload}
                        handleCopy={handleCopy}
                        copied={copied}
                        onAiPrompt={onAiPrompt}
                        onGenerateTests={onGenerateTests}
                        generatingTests={generatingTests}
                        aiEndpoints={aiEndpoints}
                        aiToast={aiToast}
                        code={code}
                        aiCompletionEnabled={aiCompletionEnabled}
                        editMode={editMode}
                        themeToggleRef={themeToggleRef}
                        showThemePicker={showThemePicker}
                        setShowThemePicker={setShowThemePicker}
                        themeEntry={themeEntry}
                        showSymbolOutline={showSymbolOutline}
                        symbols={symbols}
                        showSymbolDropdown={showSymbolDropdown}
                        setShowSymbolDropdown={setShowSymbolDropdown}
                        handleSymbolClick={handleSymbolClick}
                        openFindBar={openFindBar}
                        onSaveEdit={onSaveEdit}
                        saving={saving}
                        handleCancelEdit={handleCancelEdit}
                        handleStartEdit={handleStartEdit}
                        codeZoom={codeZoom}
                        setCodeZoom={setCodeZoom}
                        editPlainPermanent={editPlainPermanent}
                        editContent={editContent}
                        EDIT_PLAIN_MAX_CHARS={EDIT_PLAIN_MAX_CHARS}
                        insertBlocks={insertBlocks}
                        insertBlockAtCaret={insertBlockAtCaret}
                        autoSaveDelayMs={autoSaveDelayMs ?? 0}
                        autoSaveStatus={autoSaveStatus}
                        handleSaveEdit={handleSaveEdit}
                    />
                </div>
            </div>

            {/* Theme picker bar — animates from height 0 when hidden.
 closes on outside click / Esc (see the effect near
          the showThemePicker state). */}
            <AnimatePresence>
                {showThemePicker && mounted && (
                    <motion.div ref={themeBarRef} initial={{height: 0, opacity: 0}}
                                animate={{height: "auto", opacity: 1}} exit={{height: 0, opacity: 0}}
                                className="overflow-hidden border-b bg-muted/30">
                        <div className="flex items-center gap-1.5 px-4 py-2 flex-wrap max-h-32 overflow-y-auto">
                            <span className="text-[10px] text-muted-foreground shrink-0 mr-1">Code theme:</span>
                            {CODE_THEMES.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setLocalCodeTheme(t.id);
                                        saveCodeTheme(t.id);
                                        window.dispatchEvent(new CustomEvent("praxis:settings-saved"));
                                    }}
                                    title={t.label}
                                    aria-pressed={effectiveThemeId === t.id}
                                    aria-label={t.label}
                                    className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all", effectiveThemeId === t.id ? "ring-2 ring-emerald-500" : "hover:ring-1 hover:ring-foreground/20")}
                                >
                                    <span className="size-4 rounded-sm border border-foreground/10 shrink-0"
                                          style={{backgroundColor: t.bg}}><span
                                        className="block size-1.5 rounded-full mt-0.5 ml-0.5"
                                        style={{backgroundColor: t.keyword}}/><span
                                        className="block size-1.5 rounded-full ml-0.5"
                                        style={{backgroundColor: t.str}}/></span>
                                    <span className="truncate max-w-[80px]">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* The pinned find bars lives in code-viewer-find-bars.tsx (Phase 2b extraction — same JSX, explicit props). */}
            <CodeViewerFindBars
                showFind={showFind}
                editMode={editMode}
                showReplace={showReplace}
                findText={findText}
                replaceText={replaceText}
                useRegex={useRegex}
                currentMatch={currentMatch}
                totalMatches={totalMatches}
                viewFindMatches={viewFindMatches}
                measuredLineHeight={measuredLineHeight}
                measuredCodeTop={measuredCodeTop}
                findInputRef={findInputRef}
                replaceInputRef={replaceInputRef}
                scrollContainerRef={scrollContainerRef}
                setShowFind={setShowFind}
                setShowReplace={setShowReplace}
                setFindText={setFindText}
                setReplaceText={setReplaceText}
                setUseRegex={setUseRegex}
                setCurrentMatch={setCurrentMatch}
                handleFindNext={handleFindNext}
                handleFindPrev={handleFindPrev}
                handleReplaceCurrent={handleReplaceCurrent}
                handleReplaceAll={handleReplaceAll}
            />

            {/* Code body — flex-1 + min-h-0 + overflow-auto makes this
          the ONLY scroll container in the CodeViewer. The header
          above (shrink-0) stays pinned; the footer below (shrink-0)
          also stays pinned. Only this body scrolls — exactly the
          VSCode "toolbar above scrolling code" pattern. */}
            {/* the scroll container is FOCUSABLE (tabIndex=0) so
the keyboard actually reaches it in VIEW mode — the
Ctrl+Home/End handler lives on the viewer root and only fires
when focus is INSIDE the viewer, but nothing in view mode was
focusable, so the browser kept the keys for the page. Clicking the code now focuses the viewport;
arrows / PageUp / PageDown / Home / End then scroll it natively
and Ctrl+Home/End jump to the file's top/bottom. */}
            {/* the editor context menu now wraps the WHOLE
          code viewport (the scroll container), not just the code
          content — right-clicking the white area below a short
          file (in view AND edit mode), the cell view, or the
          large-file fallback opens the editor's custom menu
          instead of the browser's native one. The menu body is
          chosen by mode after the trigger closes below. */}
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        ref={scrollContainerRef}
                        tabIndex={0}
                        role="region"
                        aria-label="Code viewport — click to focus, then Home/End/Ctrl+Home/Ctrl+End scroll the file"
                        /* COLLAPSED-STATE SCROLL LOCK: the "Show less" preview is
           sized by construction to fit the viewport, so there is
           nothing to scroll. Hard-locking overflow kills even the
           sub-pixel/platform leftovers (classic Windows scrollbars,
           fractional ResizeObserver rects, the 300ms collapse
           transition) that let the words move a few px under the
           absolutely-positioned zigzag chips — the
           "squiggle stays fixed while the words move" glitch.
           The lock now applies to EVERY collapsed view-mode file —
           including short files that fit entirely — because a
           1–3px leftover (bottom padding + subpixel rounding) in
           overflow-auto mode still painted the ~0.1 cm vertical
           scroll sliver the "show less scrolls a bit" report was
           about. Expanded / edit mode keep overflow-auto. The CELL
           VIEW is exempt: notebook files (hasCells) render every
           cell at full height and never show the Show-less preview,
           so locking them would clip the cells below the fold with
           NO way to scroll — the cell view keeps overflow-auto. */
                        className={cn(
                            "relative flex-1 min-h-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-500/40",
                            !editMode && !expanded && !(hasCells && onRunCell)
                                ? "overflow-hidden"
                                : "overflow-auto"
                        )}
                        style={
                            !editMode && !expanded
                                ? {overscrollBehavior: "contain"}
                                : undefined
                        }
                        onClick={() => {
                            // Focus the viewport on click in VIEW mode (in edit mode the
                            // textarea takes focus on click anyway).
                            if (!editMode) scrollContainerRef.current?.focus({preventScroll: true});
                        }}
                    >
                        {/* ─── sticky scroll header (view mode) ─────────────
            Rendered by StickyScrollHeader — an ISOLATED component
            with its own scroll listener + state, so the per-scroll
            pinned-symbol updates NEVER re-render the viewer itself
            (see the sticky-scroll note up top). Shows the INNERMOST
            def/class whose block contains the first visible line —
            but only once that header line itself has scrolled out of
            view (VS Code behavior). Click → jump to the definition. */}
                        <StickyScrollHeader
                            scrollRef={scrollContainerRef}
                            symbols={symbols}
                            active={stickyScroll && !editMode && (expanded || !isCollapsible)}
                            codeTop={measuredCodeTop}
                            rowH={measuredLineHeight}
                            codeBg={codeBg}
                            isDark={isDark}
                            fontSize={fontSize}
                            letterSpacing={letterSpacing}
                            onJump={(line) => handleSymbolClickRef.current?.(line)}
                        />
                        {/* ─── sticky scroll header (EDIT mode) ──────────────
            The same isolated bar, pinned over the textarea surface so
            long Python files keep the current enclosing def/class
            header visible while editing. Key differences from the view
            instance (all deliberate):
            • scroll container — the SAME scrollContainerRef: in edit
              mode the textarea grows to full content height (min-h 100
              %, no max-h) so the PARENT scroll container scrolls, which
              is exactly what this bar listens to.
            • geometry — the textarea's own metrics: 16px (1rem) top
              padding + fontSize×1.6 rows (EDIT_LINE_HEIGHT), the same
              formula every edit-mode overlay (squiggles, fold boxes,
              breakpoint bands) is positioned by.
            • symbols — editSymbols, the useDeferredValue-deferred parse
              of the buffer: a typing burst re-pins the header on the
              idle pass, never on the keystroke path.
            • interactive=false — pointer-events-none throughout: the
              bar never intercepts a click over the text area, never
              steals focus from the textarea (which would trip
              autoSaveOnBlur) and never disturbs the caret.
            • windowing — the bar itself only ever resolves the
              INNERMOST block around the FIRST VISIBLE LINE (rAF
              throttled, setState only when the pinned symbol
              changes, and isolated from the viewer's renders) — it
              mounts exactly one row of DOM for the visible region,
              never per-file overlays. */}
                        <StickyScrollHeader
                            scrollRef={scrollContainerRef}
                            symbols={editSymbols}
                            active={stickyScroll && editMode}
                            codeTop={16}
                            rowH={EDIT_LINE_HEIGHT}
                            codeBg={codeBg}
                            isDark={isDark}
                            fontSize={fontSize}
                            letterSpacing={letterSpacing}
                            interactive={false}
                        />
                        {/* Progressive-render PROGRESS CHIP — pinned to the scrollport's
            top-right (absolute inside the relative scroll container, so
            it stays on screen however far the tail is scrolled). The
            in-flow loader at the bottom of the mounted chunks only
            helps at the tail; this one is visible from the moment
            "Show full code" starts rendering a long file. */}
                        {fullChunks && fullChunkStartRows && fullChunkStartRows.length > 0 &&
                            (mountedRowLimit !== Number.POSITIVE_INFINITY) && (
                                <div className="pointer-events-none absolute right-4 top-2 z-40" role="status"
                                     aria-live="polite">
            <span
                className="flex items-center gap-2 rounded-full border bg-popover/95 px-3 py-1 text-xs font-medium text-popover-foreground shadow-md backdrop-blur-sm">
              <Loader2 className="size-3.5 animate-spin text-emerald-500"/>
              Rendering {Math.max(0, mountedRowLimit - 1).toLocaleString()} of{" "}
                {lines.length.toLocaleString()} lines…
            </span>
                                </div>
                            )}
                        {/* Large-file guard — files above MAX_RENDER_LINES would freeze
the tab by rendering tens of thousands of DOM nodes (gutter
divs + Prism spans + textarea content). Show a fallback with
a download button instead. The user can still edit via the
Edit button (which loads the file into the textarea, but
syntax highlighting stays off for performance). */}
                        {lines.length > MAX_RENDER_LINES && !editMode ? (
                            <div
                                className="h-full flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
                                <div
                                    className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                                    <FileCode2 className="size-6"/>
                                </div>
                                <h3 className="text-sm font-medium">Large file</h3>
                                <p className="text-xs text-muted-foreground max-w-sm">
                                    This file has {lines.length.toLocaleString()} lines.
                                    Rendering it with syntax highlighting would freeze the
                                    tab. Download it to view in your editor, or click Edit to
                                    load it in a plain textarea (no highlighting).
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={handleDownload}
                                            className="gap-1.5 text-xs">
                                        <Download className="size-3.5"/>
                                        Download
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleStartEdit}
                                            className="gap-1.5 text-xs">
                                        <Pencil className="size-3.5"/>
                                        Edit anyway
                                    </Button>
                                </div>
                            </div>
                        ) : editMode ? (
                            <div className="relative flex min-h-full" style={{minHeight: "100%"}}>
                                {/* The edit-mode fold/line/breakpoint gutters lives in code-viewer-edit-gutters.tsx (Phase 2b extraction — same JSX, explicit props). */}
                                <CodeViewerEditGutters
                                    codeFolding={codeFolding}
                                    editSymbols={editSymbols}
                                    editFoldedKeys={editFoldedKeys}
                                    foldKeyOf={foldKeyOf}
                                    toggleEditFold={toggleEditFold}
                                    isDark={isDark}
                                    fontSize={fontSize}
                                    lineHeight={lineHeight}
                                    EDIT_FOLD_GUTTER_PX={EDIT_FOLD_GUTTER_PX}
                                    EDIT_LINE_HEIGHT={EDIT_LINE_HEIGHT}
                                    editLineGutterRef={editLineGutterRef}
                                    editLineCount={editLineCount}
                                    isPythonFile={isPythonFile}
                                    toggleBreakpointAt={toggleBreakpointAt}
                                    caretLine={caretLine}
                                    editFoldedKey={editFoldedKey}
                                    coverageKey={coverageKey}
                                    overlayFirst={overlayFirst}
                                    overlayLast={overlayLast}
                                    vimMode={vimMode}
                                    vimRef={vimRef}
                                    activeBreakpoints={activeBreakpoints}
                                    stoppedLine={stoppedLine}
                                />
                                {/* ─── Textarea + syntax-highlight backdrop ──────────────
                The textarea grows to full content height (no max-h)
                so the PARENT scroll container handles scrolling —
                matching read-mode behavior. The Prism-highlighted
                <pre> sits behind the textarea (which has transparent
                text), so syntax colors show through. Both layers
                have identical font/padding/line-height for alignment. */}
                                <div className="relative flex-1 min-w-0">
                                    {/* ─── Syntax-highlighted backdrop (edit mode) ──────────
Uses the SAME SyntaxHighlighter + rsStyle as read
mode so the colors match EXACTLY. The textarea
(transparent text) sits on top so only the caret
is visible — the syntax colors show through.

while the user is TYPING (within
EDIT_HIGHLIGHT_HOT_MS of the last keystroke), for
buffers above EDIT_PLAIN_MAX_CHARS, or when syntax
highlighting is off (Settings → Advanced), the
backdrop is a PLAIN <pre> — re-tokenizing the whole
file through Prism on every keystroke measured
8–15s on a 146 KB file. The plain <pre> carries the
exact same font/padding/line-height metrics so the
caret and squiggles stay pixel-aligned; the colors
return ~150 ms after the typing pause. */}
                                    <div
                                        ref={editHighlightRef}
                                        aria-hidden="true"
                                        className="absolute inset-0 overflow-hidden pointer-events-none"
                                    >
                                        {editPlainBackdrop ? (
                                            <pre
                                                style={{
                                                    margin: 0,
                                                    background: codeBg,
                                                    color: isDark ? "#abb2bf" : "#383a42",
                                                    fontSize: `${fontSize / 16}rem`,
                                                    lineHeight: String(lineHeight),
                                                    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                                    padding: "1rem 1rem 1rem 0",
                                                    fontFamily: "var(--font-jb-mono), monospace",
                                                    minHeight: "100%",
                                                    height: "auto",
                                                    whiteSpace: wordWrap ? "pre-wrap" : "pre",
                                                    overflowWrap: wordWrap ? "break-word" : "normal",
                                                    tabSize: indentWidth
                                                } as React.CSSProperties}
                                            >{editContent}</pre>
                                        ) : (
                                            <SyntaxHighlighter
                                                language="python"
                                                style={rsStyle}
                                                showLineNumbers={false}
                                                wrapLongLines={wordWrap}
                                                customStyle={{
                                                    margin: 0,
                                                    background: codeBg,
                                                    fontSize: `${fontSize / 16}rem`,
                                                    lineHeight: String(lineHeight),
                                                    letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                                    padding: "1rem 1rem 1rem 0",
                                                    fontFamily: "var(--font-jb-mono), monospace",
                                                    minHeight: "100%",
                                                    height: "auto"
                                                }}
                                                codeTagProps={{style: {fontFamily: "var(--font-jb-mono), monospace"}}}
                                            >{editContent}</SyntaxHighlighter>
                                        )}
                                        {/* column ruler (Settings → Editor → "Column
                    ruler"). A hairline at column `rulerColumn` of the
                    text — it lives inside the backdrop wrapper so it
                    scrolls horizontally WITH the text (stays glued to
                    text column N), while spanning the visible height.
                    Solid line — distinct from the dashed PEP-8
                    max-line-length hint.
                    SUSPENDED while wordWrap is on — same semantics as
                    the view-mode ruler above and the file-viewer's
                    `rulerOn` gate: the wrapped textarea soft-wraps at
                    the container edge (continuation rows restart at
                    x≈0), so a hairline pinned to column N would lie
                    about the glyphs' real positions. */}
                                        {rulerColumn > 0 && !wordWrap && (
                                            <div
                                                aria-hidden="true"
                                                style={{
                                                    position: "absolute",
                                                    top: "1rem",
                                                    bottom: "1rem",
                                                    left: `${rulerColumn * charWidth}px`,
                                                    width: `${Math.max(1, Math.min(6, rulerLineWidth))}px`,
                                                    background: isDark ? "rgba(145,158,171,0.35)" : "rgba(120,128,140,0.35)"
                                                }}
                                            />
                                        )}
                                        {/* ─── inline ghost text (edit mode) ──
                    The AI completion rendered AT THE CARET instead of
                    in a corner popup: a transparent <pre> mirror of
                    the buffer with the suggestion injected at the
                    fetch caret (first line only; multi-line
                    suggestions keep the popup for the full text).
                    Shares the backdrop's exact metrics like the
                    rainbow overlay below it. Only when the caret was
                    at end-of-line when the suggestion arrived —
                    mid-line insertion would shift the mirror's
                    wrapping vs the textarea. */}
                                        {aiSuggestion && aiGhostCaret !== null && !wordWrap && (() => {
                                            const caret = Math.min(aiGhostCaret, editContent.length);
                                            const nextCh = editContent[caret];
                                            if (nextCh && nextCh !== "\n") return null;
                                            const before = editContent.slice(0, caret);
                                            const after = editContent.slice(caret);
                                            const firstLine = aiSuggestion.split("\n")[0];
                                            const more = aiSuggestion.includes("\n") ? " …" : "";
                                            return (
                                                <pre
                                                    aria-hidden="true"
                                                    style={{
                                                        margin: 0,
                                                        fontSize: `${fontSize / 16}rem`,
                                                        lineHeight: String(lineHeight),
                                                        letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                                        fontFamily: "var(--font-jb-mono), monospace",
                                                        whiteSpace: "pre",
                                                        background: "transparent",
                                                        padding: "1rem 1rem 1rem 0",
                                                        minHeight: "100%",
                                                        height: "auto",
                                                        pointerEvents: "none"
                                                    }}
                                                >
                      <span style={{color: "transparent"}}>{before}</span>
                      <span
                          style={{
                              color: isDark ? "rgba(165,180,252,0.72)" : "rgba(99,102,241,0.66)",
                              fontStyle: "italic"
                          }}
                      >
                        {firstLine}{more}
                      </span>
                      <span style={{color: "transparent"}}>{after}</span>
                    </pre>
                                            );
                                        })()}
                                        {/* ─── rainbow brackets (edit mode) ──
                    Same transparent-pre overlay, sharing the backdrop's
                    exact metrics (padding 1rem…0, no gutter here —
                    edit mode renders no line numbers). Sits BEHIND the
                    textarea whose text is transparent, so the colored
                    glyphs show through like the syntax colors do. It
                    re-scans editContent on every keystroke — the pass
                    is O(n) with a 4000-bracket cap, far cheaper than
                    Prism. Skipped while word wrap is on. */}
                                        {rainbowBrackets && !wordWrap && (() => {
                                            const nodes = rainbowEditNodes;
                                            // Windowed like the view-mode twin — only the visible
                                            // ±40 lines' fragments mount, with a newline spacer
                                            // keeping the rows aligned.
                                            if (!nodes) return null;
                                            // The window/splicer math lives in
                                            // layout/code-overlay-engine.ts — pure, unit-tested.
                                            const range = windowedOverlayRange(overlayFirst, overlayLast, OVERLAY_WINDOW_MARGIN, nodes.length);
                                            if (!range) return null;
                                            const win = nodes.slice(range.firstIdx, range.lastIdx + 1);
                                            const spacer = range.spacer;
                                            return (
                                                <pre
                                                    aria-hidden="true"
                                                    style={{
                                                        margin: 0,
                                                        fontSize: `${fontSize / 16}rem`,
                                                        lineHeight: String(lineHeight),
                                                        letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                                        fontFamily: "var(--font-jb-mono), monospace",
                                                        color: "transparent",
                                                        whiteSpace: "pre",
                                                        background: "transparent",
                                                        padding: "1rem 1rem 1rem 0",
                                                        minHeight: "100%",
                                                        height: "auto",
                                                        pointerEvents: "none"
                                                    }}
                                                >{spacer}{win}</pre>
                                            );
                                        })()}
                                    </div>
                                    {stoppedLine !== null && stoppedLine >= 1 && stoppedLine <= editLineCount && (
                                        /* ─── Breakpoint-hit band (edit mode) ────────────────
                    The pdb "stopped here" highlight — a red-tinted
                    band over the stopped line, layered BETWEEN the
                    syntax backdrop (below) and the transparent-text
                    textarea (above) so the glyphs stay readable.
                    DOM order delivers the stacking: backdrop → band
                    → textarea. */
                                        <div
                                            className="pointer-events-none absolute left-0 right-0 border-y border-red-500/70 bg-red-500/[0.13]"
                                            style={{
                                                top: `${16 + (stoppedLine - 1) * EDIT_LINE_HEIGHT}px`,
                                                height: `${EDIT_LINE_HEIGHT}px`
                                            }}
                                            aria-hidden="true"
                                        />
                                    )}
                                    <textarea
                                        ref={textareaRef}
                                        value={editContent}
                                        onChange={(e) => handleEditChange(e.target.value)}
                                        className="relative w-full font-mono text-[0.8125rem] leading-[1.6] border-0 outline-none resize-none"
                                        style={{
                                            background: "transparent",
                                            color: "transparent",
                                            caretColor: isDark ? "#abb2bf" : "#383a42",
                                            tabSize: indentWidth,
                                            fontFamily: "var(--font-jb-mono), monospace",
                                            fontSize: `${fontSize / 16}rem`,
                                            lineHeight: String(lineHeight),
                                            letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
                                            whiteSpace: wordWrap ? "pre-wrap" : "pre",
                                            overflowWrap: wordWrap ? "break-word" : "normal",
                                            padding: "1rem 1rem 1rem 0",
                                            minHeight: "100%"
                                        } as React.CSSProperties}
                                        spellCheck={false}
                                        autoFocus
                                        onMouseDown={(e) => {
                                            // Alt+Click — place an extra caret at the
                                            // clicked cell without disturbing the native one (the
                                            // classic VS Code / Sublime multi-cursor gesture). The
                                            // click→cell math mirrors the squiggle-hover code above
                                            // (1rem top padding, left padding 0, monospace charWidth).
                                            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                                const ta = e.currentTarget;
                                                const rect = ta.getBoundingClientRect();
                                                const x = e.clientX - rect.left + ta.scrollLeft;
                                                const y = e.clientY - rect.top + ta.scrollTop;
                                                const line = Math.max(0, Math.floor((y - 16) / EDIT_LINE_HEIGHT));
                                                const col = Math.max(0, Math.round(x / charWidth));
                                                const src = editContentRef.current;
                                                const lineStarts: number[] = [0];
                                                for (let i = 0; i < src.length; i++) {
                                                    if (src[i] === "\n") lineStarts.push(i + 1);
                                                }
                                                if (line >= lineStarts.length) return;
                                                const lineText = src.slice(lineStarts[line], lineStarts[line + 1] ?? src.length);
                                                const clampedCol = Math.min(col, lineText.replace(/\n$/, "").length);
                                                const pos = lineStarts[line] + clampedCol;
                                                e.preventDefault();
                                                setExtraCarets((prev) => [...prev, {start: pos, end: pos}]);
                                                // Flash the native caret there too so the placement is
                                                // visible — native stays the "active" caret.
                                                ta.setSelectionRange(pos, pos);
                                            }
                                        }}
                                        onClick={(e) => {
                                            // ── Ctrl/Cmd+Click on a word → go-to-definition ──
                                            // (Windows/Linux Ctrl, macOS Cmd). Guarded to a PLAIN
                                            // modifier click: no Alt (multi-cursor placement
                                            // above), no Shift, and a COLLAPSED selection — a
                                            // drag-select leaves selectionStart≠selectionEnd and
                                            // must keep its native meaning. Ctrl+D (next
                                            // occurrence) is a keyboard shortcut and never routes
                                            // through here. The browser has already placed the
                                            // caret at the clicked cell by the time onClick
                                            // fires, so wordAroundCaret() resolves the word under
                                            // it; the page's goto-declaration handler re-derives
                                            // the same word through getSelectedSymbol().
                                            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
                                                const ta = e.currentTarget;
                                                if (ta.selectionStart === ta.selectionEnd) {
                                                    const target = wordAroundCaret();
                                                    if (target?.text) {
                                                        e.preventDefault();
                                                        dispatchGotoDefinition(target.text);
                                                    }
                                                }
                                            }
                                            // Report caret position to parent for the Footer display,
                                            // and update caretLineRef so bookmark toggles + F2
                                            // navigation track the line the user just clicked into.
                                            // (Merged here from the former second onClick — a JSX
                                            // element can only carry one.)
                                            const ta = e.currentTarget;
                                            const before = ta.value.slice(0, ta.selectionStart);
                                            const line = before.split("\n").length;
                                            const col = before.length - before.lastIndexOf("\n");
                                            noteCaretLine(line);
                                            const cb = onCursorPositionChangeRef.current;
                                            if (cb) cb(line, col);
                                            // Also report selection info (chars + lines) for the
                                            // Footer's "Sel N" indicator.
                                            const selCb = onSelectionChangeRef.current;
                                            if (selCb) {
                                                const chars = ta.selectionEnd - ta.selectionStart;
                                                const lines = chars > 0 ? ta.value.slice(ta.selectionStart, ta.selectionEnd).split("\n").length : 0;
                                                selCb(chars, lines);
                                            }
                                            // Schedule an AI completion fetch — a click moves the
                                            // caret without firing onChange, so the suggestion
                                            // popup wouldn't refresh otherwise. (See H3.)
                                            scheduleAiCompletion(ta);
                                        }}
                                        onContextMenu={(e) => {
                                            // stash the selection BEFORE Radix's
                                            // trigger opens the menu and steals focus. Both the
                                            // visual phantom (menuSelection) and the functional
                                            // stash (savedSelectionRef) are set from the LIVE
                                            // range; right-clicking with no selection clears
                                            // both (so Run Selection falls back to the line).
                                            // also sync editHasSelection HERE — a
                                            // programmatic selection (or one made while the
                                            // textarea wasn't focused) never fired a "select"
                                            // event, so selection-aware items (Format Selection /
                                            // Sort Selected Lines / New file from selection)
                                            // would open the menu disabled despite the stash.
                                            const ta = e.currentTarget;
                                            if (ta.selectionStart !== ta.selectionEnd) {
                                                savedSelectionRef.current = {
                                                    start: ta.selectionStart,
                                                    end: ta.selectionEnd
                                                };
                                                setMenuSelection({start: ta.selectionStart, end: ta.selectionEnd});
                                                setEditHasSelection(true);
                                            } else {
                                                savedSelectionRef.current = null;
                                                setMenuSelection(null);
                                                setEditHasSelection(false);
                                            }
                                        }}
                                        onMouseMove={(e) => {
                                            // hover tooltip for edit-mode squiggles.
                                            // The squiggle overlay is pointer-events-none (it must
                                            // never block caret/selection events), so a native
                                            // `title` there can't fire. Instead we map the mouse
                                            // cell to (line, col) with the same metrics the
                                            // squiggles use, test it against every diagnostic's
                                            // span, and float a tooltip at the cursor when one
                                            // covers it.
                                            if (!shownDiagnostics || shownDiagnostics.length === 0) return;
                                            const ta = e.currentTarget;
                                            const rect = ta.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const y = e.clientY - rect.top;
                                            const line = Math.floor((y - 16) / EDIT_LINE_HEIGHT) + 1;
                                            const col = Math.round(x / charWidth) + 1;
                                            const hit = shownDiagnostics.find((d) => {
                                                if (d.line !== line) return false;
                                                const srcLine = (editLines[d.line - 1] ?? "");
                                                let start = 0;
                                                while (start < srcLine.length && /\s/.test(srcLine[start])) start++;
                                                let end = srcLine.length;
                                                if (typeof d.col === "number" && d.col > 0) {
                                                    start = Math.min(Math.max(0, d.col - 1), srcLine.length);
                                                    end = start;
                                                    while (end < srcLine.length && /[A-Za-z0-9_]/.test(srcLine[end])) end++;
                                                }
                                                return col >= start + 1 && col <= end + 1;
                                            });
                                            if (hit) {
                                                // PERF: a fresh {message,x,y} object per mousemove
                                                // pixel re-rendered the whole memo'd viewer while
                                                // hovering a squiggle. Quantize the follow-cursor
                                                // position to a 8px grid and bail out when nothing
                                                // meaningfully changed — the tooltip still tracks
                                                // the cursor, but the re-render rate drops from
                                                // per-pixel to per-8px.
                                                const qx = e.clientX - rect.left + 12;
                                                const qy = e.clientY - rect.top + 18;
                                                if (
                                                    !hoveredDiag ||
                                                    hoveredDiag.message !== hit.message ||
                                                    Math.abs(hoveredDiag.x - qx) >= 8 ||
                                                    Math.abs(hoveredDiag.y - qy) >= 8
                                                ) {
                                                    setHoveredDiag({message: hit.message, x: qx, y: qy});
                                                }
                                            } else if (hoveredDiag) {
                                                setHoveredDiag(null);
                                            }
                                        }}
                                        onMouseLeave={hideHoveredDiag}
                                        onScroll={(e) => {
                                            // Sync the line-number gutter and the syntax-highlight
                                            // backdrop with the textarea's scroll position (in case
                                            // the textarea still has internal scroll for very long
                                            // lines).
                                            const ta = e.currentTarget;
                                            if (editLineGutterRef.current) {
                                                editLineGutterRef.current.scrollTop = ta.scrollTop;
                                            }
                                            if (editHighlightRef.current) {
                                                editHighlightRef.current.scrollTop = ta.scrollTop;
                                                editHighlightRef.current.scrollLeft = ta.scrollLeft;
                                            }
                                            syncEditSquiggleScroll();
                                        }}
                                        onKeyDown={(e) => {
                                            // ─── IME composition guard ──────────────
                                            //     While a CJK IME composes text the browser still
                                            //     fires keydown for every candidate-stroke key; the
                                            //     auto-pair / multi-caret / shortcut paths below would
                                            //     corrupt the pre-edit string (and misfire ⌘⇧F-style
                                            //     actions on dead keys). Bail out and let the IME own
                                            //     the keystroke — the composed text lands via onChange.
                                            if (e.nativeEvent.isComposing) return;
                                            // ─── Ctrl/Cmd+Shift+R — the REFACTOR PALETTE ───────
                                            //     The palette (page-mounted dialog) covers the tier-2
                                            //     refactors: organize imports, inline, move symbol,
                                            //     change signature, loop ⇄ comprehension.
                                            if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "r" || e.key === "R")) {
                                                e.preventDefault();
                                                window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette"));
                                                return;
                                            }
                                            // ─── VIM MODE interception ───────────────────
                                            //     Offer every key to the modal engine FIRST. Consumed
                                            //     keys never reach the editor paths below; insert-mode
                                            //     typing returns unconsumed and stays native (the
                                            //     engine diffs the buffer on the Esc that exits insert).
                                            if (vimMode && vimRef.current && !e.ctrlKey && !e.metaKey) {
                                                // ":" in NORMAL mode opens the EX COMMAND BAR (:w / :q /
                                                // :%s/…/…/ / :set nu) — the engine's executeCommand runs
                                                // the entered line; Esc closes the bar.
                                                const vimNow = vimRef.current.getState();
                                                if (vimNow.mode === "normal" && e.key === ":") {
                                                    e.preventDefault();
                                                    setVimCommand(":");
                                                    setVimTick((t) => t + 1);
                                                    return;
                                                }
                                                const consumed = vimRef.current.handleKey({
                                                    key: e.key,
                                                    ctrl: e.ctrlKey
                                                });
                                                if (consumed) {
                                                    e.preventDefault();
                                                    setVimTick((t) => t + 1);
                                                    return;
                                                }
                                                if (e.key === "Escape") {
                                                    // vim's Esc is consumed by the engine when it exits
                                                    // insert/visual; an unconsumed Esc falls through to the
                                                    // editor's own meanings below.
                                                    e.preventDefault();
                                                    setVimTick((t) => t + 1);
                                                    return;
                                                }
                                            }
                                            // ─── Escape first dismisses the signature
                                            //     popup (when no extra carets are active) — the same
                                            //     key otherwise keeps its single-caret meanings.
                                            if (extraCarets.length === 0 && sigHelp && e.key === "Escape") {
                                                e.preventDefault();
                                                setSigHelp(null);
                                                return;
                                            }
                                            // ─── multi-caret interception ──────────────────
                                            //     While extra carets are active, plain typing /
                                            //     Enter / Backspace / Delete / auto-pair apply at
                                            //     EVERY caret via applyToAllCarets. Escape collapses
                                            //     back to the native caret; plain arrows do too
                                            //     (single-caret navigation). Runs BEFORE all other
                                            //     handlers so none of the single-caret paths fire.
                                            if (extraCarets.length > 0) {
                                                if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    setExtraCarets([]);
                                                    return;
                                                }
                                                if (
                                                    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key) &&
                                                    !e.ctrlKey && !e.metaKey && !e.altKey
                                                ) {
                                                    // Arrow navigation is single-caret — drop the extras.
                                                    setExtraCarets([]);
                                                    return; // let the native move proceed
                                                }
                                                const noMods = !e.ctrlKey && !e.metaKey && !e.altKey;
                                                if (noMods && e.key.length === 1) {
                                                    // Typing (shift allowed — uppercase/symbols). Auto-pair
                                                    // when the char is an opener (no shift, like the
                                                    // single-caret rules).
                                                    const PAIRS: Record<string, string> = {
                                                        "(": ")",
                                                        "[": "]",
                                                        "{": "}",
                                                        '"': '"',
                                                        "'": "'",
                                                        "`": "`"
                                                    };
                                                    const opener = !e.shiftKey && PAIRS[e.key];
                                                    const handled = applyToAllCarets((buf, s, en) => {
                                                        if (s !== en) {
                                                            // Wrap the selection in the pair (or replace it).
                                                            if (opener) {
                                                                return {
                                                                    selStart: s,
                                                                    selEnd: en,
                                                                    text: e.key + buf.slice(s, en) + PAIRS[e.key],
                                                                    finalCaret: s + 1
                                                                };
                                                            }
                                                            return {
                                                                selStart: s,
                                                                selEnd: en,
                                                                text: e.key,
                                                                finalCaret: s + 1
                                                            };
                                                        }
                                                        if (opener) {
                                                            // Don't pair quotes mid-word (apostrophes).
                                                            if ((e.key === '"' || e.key === "'") && s > 0 && /[a-zA-Z0-9_]/.test(buf[s - 1])) {
                                                                return {
                                                                    selStart: s,
                                                                    selEnd: s,
                                                                    text: e.key,
                                                                    finalCaret: s + 1
                                                                };
                                                            }
                                                            return {
                                                                selStart: s,
                                                                selEnd: s,
                                                                text: e.key + PAIRS[e.key],
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
                                                    const handled = applyToAllCarets((buf, s, en) => ({
                                                        selStart: s,
                                                        selEnd: en,
                                                        text: "\n" + enterIndentFor(buf, s),
                                                        finalCaret: s + 1 + enterIndentFor(buf, s).length
                                                    }));
                                                    if (handled) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                }
                                                if (noMods && (e.key === "Backspace" || e.key === "Delete")) {
                                                    const forward = e.key === "Delete";
                                                    const handled = applyToAllCarets((buf, s, en) => {
                                                        if (s !== en) {
                                                            return {selStart: s, selEnd: en, text: "", finalCaret: s};
                                                        }
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
                                            }

                                            // ─── undo/redo interception ─────────────────
                                            //     The native textarea undo is DEAD (programmatic
                                            //     value writes clear its history), and the global
                                            //     shortcut hook never handled edit.undo — so Ctrl+Z
                                            // did nothing. Intercept here and
                                            //     route to the snapshot stacks. Ctrl+Y works as redo
                                            //     too, even though the binding is ⌘⇧Z.
                                            // ── the offline PYTHON completion popup keys (↑/↓/Tab/
                                            //    Enter/Esc — IME-guarded like the file viewer's).
                                            if (pyCompletion && e.nativeEvent.isComposing === false) {
                                                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                                                    if (pyCompletion.items.length > 1) {
                                                        e.preventDefault();
                                                        const delta = e.key === "ArrowDown" ? 1 : -1;
                                                        setPyCompletion((p) =>
                                                            p
                                                                ? {
                                                                    ...p,
                                                                    active:
                                                                        ((p.active + delta) % p.items.length + p.items.length) %
                                                                        p.items.length
                                                                }
                                                                : p
                                                        );
                                                        return;
                                                    }
                                                } else if (e.key === "Tab" || e.key === "Enter") {
                                                    e.preventDefault();
                                                    acceptPyCompletion(pyCompletion.active);
                                                    return;
                                                } else if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    closePyCompletion();
                                                    return;
                                                }
                                            }
                                            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
                                                if (e.shiftKey || e.key === "y" || e.key === "Y") {
                                                    e.preventDefault();
                                                    redoFn();
                                                } else {
                                                    // Dictionary-add undo FIRST — if the last action was
                                                    // "Add to project dictionary" and no text was edited
                                                    // since, Ctrl+Z removes the word + returns the zigzag.
                                                    if (undoDictionaryAdd()) return;
                                                    e.preventDefault();
                                                    undoFn();
                                                }
                                                return;
                                            }
                                            // ─── Editor keyboard shortcuts ─────────────────────
                                            //     These fire BEFORE the Escape / Tab logic so they
                                            //     take priority. Each calls preventDefault + returns
                                            //     so the event doesn't fall through to the textarea's
                                            //     default handling (or to the outer wrapper).
                                            // every check now routes through
                                            //     matchesShortcut(e, id) — rebinding in Settings →
                                            //     Shortcuts takes effect immediately (previously
                                            //     these were hardcoded modifier checks).
                                            // ⌘⇧↵ — Run Selection in Python (new).
                                            if (matchesShortcut(e.nativeEvent, "editor.runSelection")) {
                                                e.preventDefault();
                                                const ta0 = e.currentTarget;
                                                const src0 = editContentRef.current;
                                                let codeToRun: string;
                                                if (ta0.selectionStart !== ta0.selectionEnd) {
                                                    codeToRun = src0.slice(ta0.selectionStart, ta0.selectionEnd);
                                                } else {
                                                    const lineIdx = src0.slice(0, ta0.selectionStart).split("\n").length - 1;
                                                    codeToRun = src0.split("\n")[lineIdx] ?? "";
                                                }
                                                const trimmed0 = codeToRun.trim();
                                                if (trimmed0) onRunSelectionRef.current?.(trimmed0);
                                                return;
                                            }
                                            // ⌘/ — toggle # comment on the selected lines (new).
                                            if (matchesShortcut(e.nativeEvent, "editor.toggleComment") && (e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "?")) {
                                                e.preventDefault();
                                                commentToggleFn();
                                                return;
                                            }
                                            // ⇧⌥↓ — duplicate the current line (new; ⇧⌥↑ mirrors in
                                            // VS Code but swap-up already owns ⌘⇧↑ — keep one key).
                                            if (matchesShortcut(e.nativeEvent, "editor.duplicateLine")) {
                                                e.preventDefault();
                                                duplicateLineFn();
                                                return;
                                            }
                                            // Alt+\ — manually trigger an AI completion fetch
                                            // (skipping the 1s debounce). Lets the editor request a
                                            // suggestion on demand instead of waiting for the
                                            // auto-trigger.
                                            if (matchesShortcut(e.nativeEvent, "ai.triggerCompletion")) {
                                                e.preventDefault();
                                                triggerAiCompletionNowRef.current();
                                                return;
                                            }
                                            // Ctrl/Cmd+I — inline AI chat anchored at the caret /
                                            // selection (streamed answer, Apply writes it in place).
                                            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "i" || e.key === "I")) {
                                                e.preventDefault();
                                                openInlineAi();
                                                return;
                                            }
                                            // Ctrl/Cmd+D — stack the next occurrence onto the caret
                                            // set (multi-caret; first press still selects the
                                            // word at the caret, Sublime-style).
                                            if (matchesShortcut(e.nativeEvent, "editor.selectNextOccurrence")) {
                                                e.preventDefault();
                                                selectNextOccurrenceMulti();
                                                return;
                                            }
                                            // Ctrl/Cmd+F2 — toggle bookmark on current line.
                                            if (matchesShortcut(e.nativeEvent, "editor.toggleBookmark")) {
                                                e.preventDefault();
                                                toggleBookmarkRef.current();
                                                return;
                                            }
                                            // F2 (no mods) — jump to next bookmark.
                                            if (matchesShortcut(e.nativeEvent, "editor.nextBookmark") && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                                                e.preventDefault();
                                                nextBookmarkRef.current();
                                                return;
                                            }
                                            // Shift+F2 — jump to previous bookmark.
                                            if (matchesShortcut(e.nativeEvent, "editor.prevBookmark")) {
                                                e.preventDefault();
                                                prevBookmarkRef.current();
                                                return;
                                            }
                                            // Ctrl/Cmd+Shift+ArrowUp — swap current line/selection up.
                                            if (matchesShortcut(e.nativeEvent, "editor.swapLineUp")) {
                                                e.preventDefault();
                                                swapLineUpRef.current();
                                                return;
                                            }
                                            // Ctrl/Cmd+Shift+ArrowDown — swap current line/selection down.
                                            if (matchesShortcut(e.nativeEvent, "editor.swapLineDown")) {
                                                e.preventDefault();
                                                swapLineDownRef.current();
                                                return;
                                            }
                                            // ─── ⇧↵ — run the # %% cell containing the
                                            //     caret, straight from the EDIT buffer (the edited,
                                            //     unsaved content — not the on-disk copy). Only
                                            //     intercepts when the buffer actually contains # %%
                                            //     markers; otherwise Shift+Enter keeps its default
                                            //     line-break behavior.
                                            if (matchesShortcut(e.nativeEvent, "run.runCell") && /^\s*#\s*%%/m.test(editContent)) {
                                                const ta1 = e.currentTarget;
                                                const caretLine = editContent.slice(0, ta1.selectionStart).split("\n").length;
                                                const cell = editCells.find((c) => c.type === "code" && caretLine >= c.startLine && caretLine <= c.endLine);
                                                if (cell && cell.source.trim()) {
                                                    e.preventDefault();
                                                    onRunSelectionRef.current?.(cell.source);
                                                    return;
                                                }
                                            }
                                            // Alt+Enter — open the quickfixes panel for the current line.
                                            if (matchesShortcut(e.nativeEvent, "editor.quickFix")) {
                                                e.preventDefault();
                                                window.dispatchEvent(new CustomEvent("praxis:show-quickfixes"));
                                                return;
                                            }
                                            // Escape dismisses an AI suggestion (and the find bar).
                                            if (e.key === "Escape") {
                                                if (aiSuggestion) {
                                                    e.preventDefault();
                                                    setAiSuggestion(null);
                                                    setAiGhostCaret(null);
                                                    return;
                                                }
                                                // Esc also ends a snippet-tabstop session.
                                                if (activeTabstopsRef.current) {
                                                    e.preventDefault();
                                                    setActiveTabstops(null);
                                                    return;
                                                }
                                                if (showFind) {
                                                    e.preventDefault();
                                                    setShowFind(false);
                                                    return;
                                                }
                                            }
                                            // ─── Auto-pair brackets / quotes / parentheses ───────
                                            //     Typing an opening bracket/quote auto-inserts the
                                            //     closing pair, placing the caret between them.
                                            //     Smart skip-over: typing the closing char when it's
                                            //     already the next char just moves the caret past it
                                            //     (so you don't end up with `)`).
                                            const PAIRS: Record<string, string> = {
                                                "(": ")",
                                                "[": "]",
                                                "{": "}",
                                                '"': '"',
                                                "'": "'",
                                                "`": "`"
                                            };
                                            const CLOSING = new Set([")", "]", "}", '"', "'", "`"]);
                                            if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && PAIRS[e.key]) {
                                                const ta = e.currentTarget;
                                                const start = ta.selectionStart;
                                                const end = ta.selectionEnd;
                                                // If there's a selection, wrap it in the pair.
                                                if (start !== end) {
                                                    e.preventDefault();
                                                    const selected = editContent.slice(start, end);
                                                    const open = e.key;
                                                    const close = PAIRS[open];
                                                    const newContent = editContent.slice(0, start) + open + selected + close + editContent.slice(end);
                                                    handleEditChange(newContent);
                                                    requestAnimationFrame(() => {
                                                        ta.selectionStart = start + 1;
                                                        ta.selectionEnd = end + 1;
                                                    });
                                                    return;
                                                }
                                                // For quotes, don't auto-pair if the previous char is a
                                                // word character (we're in the middle of a word, so the
                                                // quote is probably an apostrophe, not a string opener).
                                                if ((e.key === '"' || e.key === "'") && start > 0) {
                                                    const prevChar = editContent[start - 1];
                                                    if (/[a-zA-Z0-9_]/.test(prevChar)) {
                                                        // Don't auto-pair — let the character be typed normally.
                                                    } else {
                                                        e.preventDefault();
                                                        const open = e.key;
                                                        const close = PAIRS[open];
                                                        const newContent = editContent.slice(0, start) + open + close + editContent.slice(end);
                                                        handleEditChange(newContent);
                                                        requestAnimationFrame(() => {
                                                            ta.selectionStart = ta.selectionEnd = start + 1;
                                                        });
                                                        return;
                                                    }
                                                } else {
                                                    // Brackets: always auto-pair.
                                                    e.preventDefault();
                                                    const open = e.key;
                                                    const close = PAIRS[open];
                                                    const newContent = editContent.slice(0, start) + open + close + editContent.slice(end);
                                                    handleEditChange(newContent);
                                                    requestAnimationFrame(() => {
                                                        ta.selectionStart = ta.selectionEnd = start + 1;
                                                    });
                                                    return;
                                                }
                                            }
                                            // Smart skip-over: typing a closing char when it's the
                                            // next char just moves the caret past it.
                                            if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && CLOSING.has(e.key)) {
                                                const ta = e.currentTarget;
                                                const start = ta.selectionStart;
                                                const end = ta.selectionEnd;
                                                if (start === end && start < editContent.length && editContent[start] === e.key) {
                                                    e.preventDefault();
                                                    requestAnimationFrame(() => {
                                                        ta.selectionStart = ta.selectionEnd = start + 1;
                                                    });
                                                    return;
                                                }
                                            }
                                            // ─── Auto-indent on Enter ───────────────────────────
                                            //     Copy the current line's leading whitespace to the
                                            //     new line. After `:` (Python block start), add one
                                            //     extra indent level.
                                            // the extra level uses the CONFIGURED
                                            //     unit — a literal tab when Settings → Editor →
                                            //     Indentation is "Tab", spaces of the set width
                                            //     otherwise (was hard-coded spaces).
                                            // the copied indent is QUANTIZED to
                                            //     the configured grid first — measure the current
                                            //     line's leading whitespace in units of the configured
                                            //     width (a tab = one unit), floor it, and re-emit it
                                            //     as whole units. Off-grid indentation (e.g. 5 spaces
                                            //     with a 2-space config) no longer propagates; the
                                            //     new line always starts on the configured grid.
                                            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                                                e.preventDefault();
                                                const ta = e.currentTarget;
                                                const start = ta.selectionStart;
                                                const end = ta.selectionEnd;
                                                // Find the start of the current line.
                                                const before = editContent.slice(0, start);
                                                const lineStart = before.lastIndexOf("\n") + 1;
                                                const currentLine = editContent.slice(lineStart, start);
                                                // Extract leading whitespace and count whole configured
                                                // units in it (tab = 1 unit; spaces = run / indentWidth).
                                                const indentMatch = currentLine.match(/^[ \t]*/);
                                                const rawIndent = indentMatch ? indentMatch[0] : "";
                                                let units = 0;
                                                let i = 0;
                                                while (i < rawIndent.length) {
                                                    if (rawIndent[i] === "\t") {
                                                        units++;
                                                        i++;
                                                        continue;
                                                    }
                                                    let run = 0;
                                                    while (i < rawIndent.length && rawIndent[i] === " ") {
                                                        run++;
                                                        i++;
                                                    }
                                                    units += Math.floor(run / Math.max(1, indentUnit.length));
                                                }
                                                // Check if the line ends with `:` (Python block start) —
                                                // add one extra indent level (in the configured unit).
                                                const trimmedBefore = currentLine.trimEnd();
                                                if (trimmedBefore.endsWith(":")) {
                                                    units += 1;
                                                }
                                                const indent = indentUnit.repeat(units);
                                                const insert = "\n" + indent;
                                                const newContent = editContent.slice(0, start) + insert + editContent.slice(end);
                                                handleEditChange(newContent);
                                                requestAnimationFrame(() => {
                                                    ta.selectionStart = ta.selectionEnd = start + insert.length;
                                                });
                                                return;
                                            }
                                            // Tab key:
                                            //   1. If an AI suggestion is shown, accept it (insert
                                            //      the suggestion at the caret, then clear it).
                                            //   2. If there's a multi-line selection, indent/dedent
                                            //      each line in the selection (Smart Tab).
                                            //   3. Otherwise, insert `indentWidth` spaces.
                                            if (e.key === "Tab") {
                                                e.preventDefault();
                                                const ta = e.currentTarget;
                                                let start = ta.selectionStart;
                                                let end = ta.selectionEnd;
                                                // ─── snippet tabstop jump ───────────
                                                //     While a tabstop session is active, Tab selects
                                                //     the next placeholder ($1 → $2 → … → $0); after
                                                //     the last one the session ends and Tab behaves
                                                //     normally again.
                                                if (activeTabstops) {
                                                    const next = activeTabstops.active + 1;
                                                    if (next < activeTabstops.ranges.length) {
                                                        const r = activeTabstops.ranges[next];
                                                        setActiveTabstops({...activeTabstops, active: next});
                                                        requestAnimationFrame(() => {
                                                            ta.focus();
                                                            ta.setSelectionRange(r.start, r.end);
                                                        });
                                                        return;
                                                    }
                                                    setActiveTabstops(null);
                                                    return;
                                                }
                                                if (aiSuggestion) {
                                                    // Don't replace a selection with the suggestion —
                                                    // standard ghost-text behavior inserts at the caret.
                                                    // Collapse any selection to the caret first.
                                                    if (start !== end) {
                                                        start = Math.min(start, end);
                                                        end = start;
                                                        ta.selectionStart = ta.selectionEnd = start;
                                                    }
                                                    const insert = aiSuggestion;
                                                    const newContent = editContent.slice(0, start) + insert + editContent.slice(end);
                                                    handleEditChange(newContent);
                                                    setAiSuggestion(null);
                                                    setAiGhostCaret(null);
                                                    setActiveTabstops(null);
                                                    requestAnimationFrame(() => {
                                                        ta.selectionStart = ta.selectionEnd = start + insert.length;
                                                    });
                                                    return;
                                                }
                                                // ─── Tab expands a snippet ─────────────────
                                                //     When the word immediately before the caret is a
                                                // known snippet trigger (builtin table + the user's
                                                //     Snippets palette entries, lower-cased), Tab
                                                //     replaces the trigger word with the snippet body
                                                //     instead of inserting an indent. Only with NO
                                                //     selection (a selection keeps Smart Tab) and no
                                                //     Shift (Shift+Tab stays dedent).
                                                if (tabSnippetExpansion && !e.shiftKey && start === end) {
                                                    const beforeText = editContent.slice(0, start);
                                                    const lineStartOff = beforeText.lastIndexOf("\n") + 1;
                                                    const prefix = beforeText.slice(lineStartOff);
                                                    const m = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
                                                    const trigger = m?.[1];
                                                    const body = trigger ? snippetMap[trigger] : undefined;
                                                    if (trigger && body !== undefined) {
                                                        e.preventDefault();
                                                        const insertAt = start - trigger.length;
                                                        // snippets may carry VS Code-style
                                                        // tabstops — $1, $2, …, $0 (final caret) and
                                                        // ${n:default} placeholders. Parse them, insert the
                                                        // rendered body, select the first tabstop, and let
                                                        // the Tab handler above cycle the rest. Snippets
                                                        // without tabstops behave exactly as before.
                                                        const tabstops: Array<{ n: number; text: string }> = [];
                                                        const rendered = body.replace(
                                                            /\$(\d+)(?::([^$\n]*))?|\$\{(\d+):([^}]*)\}/g,
                                                            (_m, n1, def1, n2, def2) => {
                                                                const n = Number(n1 ?? n2 ?? 0);
                                                                const text = (def1 ?? def2 ?? "") as string;
                                                                tabstops.push({n, text});
                                                                return text;
                                                            }
                                                        );
                                                        const newContent = editContent.slice(0, insertAt) + rendered + editContent.slice(end);
                                                        handleEditChange(newContent);
                                                        if (tabstops.length > 0) {
                                                            // Ranges are computed in OCCURRENCE order (the
                                                            // order the regex matched them in the body), then
                                                            // REORDERED by tabstop number for the jump
                                                            // sequence ($0 last regardless of position —
                                                            // VS Code semantics).
                                                            let cursor = insertAt;
                                                            const occurrenceRanges = tabstops.map((t) => {
                                                                const r = {start: cursor, end: cursor + t.text.length};
                                                                cursor += t.text.length;
                                                                return r;
                                                            });
                                                            const jumpOrder = tabstops
                                                                .map((t, i) => ({i, n: t.n === 0 ? Infinity : t.n}))
                                                                .sort((a, b) => a.n - b.n)
                                                                .map((x) => x.i);
                                                            const ranges = jumpOrder.map((i) => occurrenceRanges[i]);
                                                            setActiveTabstops({ranges, active: 0});
                                                            requestAnimationFrame(() => {
                                                                ta.focus();
                                                                ta.setSelectionRange(ranges[0].start, ranges[0].end);
                                                            });
                                                        } else {
                                                            requestAnimationFrame(() => {
                                                                ta.selectionStart = ta.selectionEnd = insertAt + rendered.length;
                                                            });
                                                        }
                                                        return;
                                                    }
                                                }
                                                // Smart Tab: if there's a selection spanning multiple
                                                // lines (or a selection on a line), indent/dedent each
                                                // line in the selection.
                                                if (start !== end) {
                                                    const selectedText = editContent.slice(start, end);
                                                    // Check if the selection spans multiple lines.
                                                    const hasNewline = selectedText.includes("\n") ||
                                                        editContent.slice(0, start).lastIndexOf("\n") !== editContent.slice(0, end).lastIndexOf("\n");
                                                    if (hasNewline || e.shiftKey) {
                                                        // Find the start of the first selected line.
                                                        const before = editContent.slice(0, start);
                                                        const firstLineStart = before.lastIndexOf("\n") + 1;
                                                        // Get all the lines in the selection range.
                                                        const blockContent = editContent.slice(firstLineStart, end);
                                                        const lines = blockContent.split("\n");
                                                        if (e.shiftKey) {
                                                            // Dedent: remove up to one configured unit (a tab
                                                            // char OR up to indentWidth spaces) per line.
                                                            // was spaces-only — a tab-indented
                                                            // file couldn't be Shift-Tab'd at all.
                                                            const dedented = lines.map((ln) => {
                                                                if (ln.startsWith("\t")) return ln.slice(1);
                                                                let removed = 0;
                                                                let i = 0;
                                                                while (i < ln.length && i < indentWidth && ln[i] === " ") {
                                                                    removed++;
                                                                    i++;
                                                                }
                                                                return ln.slice(removed);
                                                            });
                                                            const newBlock = dedented.join("\n");
                                                            const newContent = editContent.slice(0, firstLineStart) + newBlock + editContent.slice(end);
                                                            handleEditChange(newContent);
                                                            const lengthDiff = newBlock.length - blockContent.length;
                                                            requestAnimationFrame(() => {
                                                                ta.selectionStart = firstLineStart;
                                                                ta.selectionEnd = end + lengthDiff;
                                                            });
                                                        } else {
                                                            // Indent: add one configured unit to each line.
                                                            const unit = indentUnit;
                                                            const indented = lines.map((ln) => unit + ln);
                                                            const newBlock = indented.join("\n");
                                                            const newContent = editContent.slice(0, firstLineStart) + newBlock + editContent.slice(end);
                                                            handleEditChange(newContent);
                                                            const lengthDiff = newBlock.length - blockContent.length;
                                                            requestAnimationFrame(() => {
                                                                ta.selectionStart = firstLineStart;
                                                                ta.selectionEnd = end + lengthDiff;
                                                            });
                                                        }
                                                        return;
                                                    }
                                                }
                                                // No selection (or single-line selection): insert one
                                                // configured indent unit (tab or spaces — ).
                                                const unit = indentUnit;
                                                const newContent = editContent.slice(0, start) + unit + editContent.slice(end);
                                                handleEditChange(newContent);
                                                requestAnimationFrame(() => {
                                                    ta.selectionStart = ta.selectionEnd = start + unit.length;
                                                });
                                            }
                                        }}
                                        onKeyUp={(e) => {
                                            // AI completion is now triggered from handleEditChange
                                            // (which fires on the textarea's onChange for every
                                            // content mutation, including paste + IME) and from
                                            // onClick (for caret-only moves). The legacy onKeyUp
                                            // trigger is kept only for keyboard typing that
                                            // doesn't change the content (e.g. releasing a modifier
                                            // after a paste) — but since handleEditChange already
                                            // covers all content changes, we no-op here.
                                            //
                                            // NOTE: there is deliberately NO
                                            // onKeyUpCapture handler on this textarea. It used to
                                            // duplicate the cursor/selection reporting that onSelect
                                            // already covers — two page-level state updates per
                                            // keystroke, each with a fresh object identity,
                                            // re-rendering the entire page tree per character typed.
                                            // onSelect fires on every caret move (typing, arrows,
                                            // Shift+select, drag-select), so the capture-phase
                                            // duplicate was pure overhead.
                                            void e;
                                        }}
                                        onSelect={(e) => {
                                            // Fires whenever the selection changes — including
                                            // keyboard-driven selections (Shift+arrows, Ctrl+A) and
                                            // drag-select. We use it (not just onClick) so drag-select
                                            // + kb-select both update the Footer's "Sel N" indicator
                                            // in real time. Also report the cursor position so the
                                            // Footer's "Ln / Col" stays in sync during mouse drag.
                                            // this is now the ONLY cursor/selection
                                            // reporter — the old onKeyUpCapture handler duplicated
                                            // this work on every keystroke.
                                            const ta = e.currentTarget;
                                            const selCb = onSelectionChangeRef.current;
                                            const hasSel = ta.selectionEnd !== ta.selectionStart;
                                            // while the right-click menu is OPEN, Radix's
                                            // focus steal can collapse the live selection — the
                                            // user's real range lives in savedSelectionRef (stashed
                                            // at right-click time). Don't let the collapse clobber
                                            // the selection-aware menu items' enablement; the range
                                            // is restored by onCloseAutoFocus anyway.
                                            const menuStashActive =
                                                !hasSel &&
                                                menuSelection !== null &&
                                                savedSelectionRef.current !== null &&
                                                savedSelectionRef.current.start !== savedSelectionRef.current.end;
                                            // menu enablement (Run/Format Selection).
                                            setEditHasSelection((prev) => (prev === hasSel || menuStashActive ? prev : hasSel));
                                            if (selCb && !menuStashActive) {
                                                const chars = ta.selectionEnd - ta.selectionStart;
                                                const lines = chars > 0 ? ta.value.slice(ta.selectionStart, ta.selectionEnd).split("\n").length : 0;
                                                selCb(chars, lines);
                                            }
                                            // Also report cursor position (line + col) for the
                                            // Footer's "Ln / Col" display.
                                            const before = ta.value.slice(0, ta.selectionStart);
                                            const line = before.split("\n").length;
                                            const col = before.length - before.lastIndexOf("\n");
                                            noteCaretLine(line);
                                            const cb = onCursorPositionChangeRef.current;
                                            if (cb) cb(line, col);
                                            // typewriter scrolling — keep the caret
                                            // vertically centered while typing / moving (off by
                                            // default; View menu toggle + Settings).
                                            if (typewriterScroll && ta.scrollHeight > ta.clientHeight) {
                                                const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || "20") || 20;
                                                const caretY = (line - 1) * lineHeight;
                                                const target = caretY - ta.clientHeight / 2;
                                                if (Math.abs(ta.scrollTop - target) > lineHeight * 0.75) {
                                                    ta.scrollTop = Math.max(0, target);
                                                }
                                            }
                                            // Edit-mode folding: auto-expand any block whose hidden
                                            // region the caret just entered — typing must never happen
                                            // beneath the fold overlay.
                                            unfoldAroundCaret(line);
                                        }}
                                        onBlur={() => {
                                            // Auto-save on blur (Settings → Advanced → autoSaveOnBlur).
                                            // Only saves if the edited content differs from the
                                            // original code AND onSaveEdit is provided.
                                            if (autoSaveOnBlur && onSaveEdit && editContent !== code) {
                                                void handleSaveEdit({keepEditMode: true});
                                            }
                                        }}
                                    />
                                    {/* ─── Folded-region overlays (edit mode) ───────────────────
                  A textarea cannot collapse lines without corrupting
                  the buffer, so a folded block's BODY (everything after
                  its def/class line) is covered by an opaque button that
                  says what's hidden. Click to expand. The text beneath
                  is untouched — folds are purely presentational, there
                  is no code path that can lose content. The caret auto-
                  expands a block it enters (see onSelect), so typing
                  can never happen beneath this overlay.

                  Positioned inside the code-area container (sibling of
                  the backdrop + textarea) so left:0 = the first code
                  column; vertical metrics mirror the textarea exactly
                  (16px top padding, 1.6 × fontSize line height). */}
                                    {codeFolding && foldedEditSymbols.length > 0 && (
                                        <div className="absolute inset-0 pointer-events-none" style={{zIndex: 6}}>
                                            {foldedEditSymbols.map((sym) => {
                                                const hidden = (sym.endLine ?? sym.line) - sym.line;
                                                if (hidden <= 0) return null;
                                                const top = 16 + sym.line * EDIT_LINE_HEIGHT;
                                                const height = hidden * EDIT_LINE_HEIGHT;
                                                const kind =
                                                    sym.type === "class" ? "class" :
                                                        sym.type === "function" || sym.type === "method" ? "def" :
                                                            sym.type === "loop" ? "loop" :
                                                                sym.type === "conditional" ? "if/elif" :
                                                                    sym.type === "try" ? "try" :
                                                                        sym.type === "with" ? "with" : "block";
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`efoldov-${foldKeyOf(sym)}`}
                                                        aria-label={`Expand ${formatSymbol(sym)} (lines ${sym.line + 1}-${sym.endLine})`}
                                                        className="absolute pointer-events-auto flex items-center gap-2 px-3 text-left rounded-sm hover:ring-1 hover:ring-foreground/25 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-shadow"
                                                        style={{
                                                            top: `${top}px`,
                                                            left: 0,
                                                            right: 0,
                                                            height: `${Math.max(height, EDIT_LINE_HEIGHT)}px`,
                                                            // Opaque code background — must fully cover the
                                                            // text underneath (theme bg colors are opaque).
                                                            background: codeBg,
                                                            borderTop: `1px dashed ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`,
                                                            borderBottom: `1px dashed ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`,
                                                            color: isDark ? "#9ca3af" : "#6b7280",
                                                            fontFamily: "var(--font-jb-mono), monospace",
                                                            fontSize: `${Math.max(11, fontSize * 0.85)}px`,
                                                            cursor: "pointer",
                                                            overflow: "hidden",
                                                            whiteSpace: "nowrap",
                                                            textOverflow: "ellipsis"
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleEditFold(sym);
                                                        }}
                                                        title={`Expand ${formatSymbol(sym)} (lines ${sym.line + 1}-${sym.endLine})`}
                                                    >
                                                        <span aria-hidden="true">▸</span>
                                                        <span className="truncate">
                          {kind}
                                                            {sym.name ? ` ${sym.name}` : ""} … {hidden}{" "}
                                                            {hidden === 1 ? "line" : "lines"} hidden — click to
                          expand
                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* ─── Code Lens chips (edit mode) ────
                  One chip per TOP-LEVEL def/class, pinned to the pane's
                  right edge at the symbol's line: ▶ Run · Usages ·
                  Rename (· Tests). Same vertical math as the fold
                  chevrons/covers (16px + (line-1)×1.6×fontSize).
                  Hover raises opacity; each action reuses the existing
                  wiring — onRunFile, the praxis:find-usages /
                  praxis:rename-symbol events (with the symbol in the
                  detail payload so they don't need a text selection),
                  and onGenerateTests. */}
                                    {codeLens && editSymbols.some((s) => (s.type === "function" || s.type === "class") && s.indent === 0) && (
                                        <div className="absolute inset-0 pointer-events-none" style={{zIndex: 7}}>
                                            {editSymbols
                                                .filter((s) => (s.type === "function" || s.type === "class") && s.indent === 0)
                                                .map((sym) => {
                                                    const top = 16 + (sym.line - 1) * EDIT_LINE_HEIGHT;
                                                    return (
                                                        <div
                                                            key={`lens-${sym.line}-${sym.name}`}
                                                            className="absolute pointer-events-auto flex items-center gap-0.5 rounded-md border bg-popover/90 backdrop-blur-sm px-1 shadow-sm transition-opacity"
                                                            style={{
                                                                top: `${Math.max(0, top - 1)}px`,
                                                                right: "10px",
                                                                opacity: 0.55,
                                                                fontSize: `${Math.max(9, fontSize * 0.72)}px`
                                                            }}
                                                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
                                                            aria-label={`Code lens for ${sym.name}`}
                                                        >
                                                            {onRunFile && (
                                                                <button
                                                                    type="button"
                                                                    className="px-1 rounded text-emerald-600 dark:text-emerald-400 hover:bg-foreground/10"
                                                                    title={`Run ${fileName} (⌘↵)`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onRunFile();
                                                                    }}
                                                                >
                                                                    ▶ Run
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="px-1 rounded text-sky-600 dark:text-sky-400 hover:bg-foreground/10"
                                                                title={`Find every occurrence of ${sym.name} across the project`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    window.dispatchEvent(
                                                                        new CustomEvent("praxis:find-usages", {
                                                                            detail: {symbol: sym.name}
                                                                        })
                                                                    );
                                                                }}
                                                            >
                                                                Usages
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="px-1 rounded text-violet-600 dark:text-violet-400 hover:bg-foreground/10"
                                                                title={`Rename ${sym.name} everywhere in the project`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    // The symbol's own line + name column ride
                                                                    // along so the page can offer the LSP
                                                                    // (semantic) rename for THIS definition.
                                                                    const symLine = lines[sym.line - 1] ?? "";
                                                                    window.dispatchEvent(
                                                                        new CustomEvent("praxis:rename-symbol", {
                                                                            detail: {
                                                                                symbol: sym.name,
                                                                                line: sym.line,
                                                                                col: Math.max(1, symLine.indexOf(sym.name) + 1),
                                                                            }
                                                                        })
                                                                    );
                                                                }}
                                                            >
                                                                Rename
                                                            </button>
                                                            {onGenerateTests && (
                                                                <button
                                                                    type="button"
                                                                    className="px-1 rounded text-amber-600 dark:text-amber-400 hover:bg-foreground/10"
                                                                    title="Generate pytest tests for this file (AI)"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onGenerateTests();
                                                                    }}
                                                                >
                                                                    Tests
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}

                                    {/* ─── runtime inlay hints (edit mode) ──
                  When the last run captured a variables snapshot
                  (Inspect variables), each assignment line whose name
                  is in the snapshot shows an inlay `: type = repr`
                  chip just past the line's text — live values where
                  you're reading the code. Skipped for tab-indented
                  lines (char math assumes spaces). */}
                                    {/* ─── OFFLINE PYTHON COMPLETION POPUP ────────────────────
              Fuzzy/ranked candidates with signature + doc context and
              auto-import on accept (Tab / Enter). */}
                                    {pyCompletion && pyCompletion.items.length > 0 && (
                                        <div
                                            role="listbox"
                                            aria-label="Python completions"
                                            className="absolute z-50 w-72 max-h-64 overflow-y-auto rounded-md border bg-popover/97 shadow-lg backdrop-blur text-xs py-1"
                                            style={{
                                                top: `${pyCompletion.top}px`,
                                                left: `${Math.min(pyCompletion.left, 9999)}px`
                                            }}
                                        >
                                            {pyCompletion.items.map((item, i) => (
                                                <button
                                                    key={`${item.label}-${i}`}
                                                    type="button"
                                                    role="option"
                                                    aria-selected={i === pyCompletion.active}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        acceptPyCompletion(i);
                                                    }}
                                                    onMouseEnter={() => setPyCompletion((p) => (p ? {
                                                        ...p,
                                                        active: i
                                                    } : p))}
                                                    className={cn(
                                                        "flex w-full items-center gap-2 px-2 py-1 text-left",
                                                        i === pyCompletion.active ? "bg-accent" : "hover:bg-accent/60"
                                                    )}
                                                >
                                                    <span className="font-mono shrink-0">{item.label}</span>
                                                    {item.importModule && (
                                                        <span
                                                            className="text-[9px] text-sky-600 dark:text-sky-400 shrink-0">auto-import</span>
                                                    )}
                                                    {item.detail && (
                                                        <span
                                                            className="ml-auto truncate text-[10px] text-muted-foreground max-w-[11rem]"
                                                            title={item.detail}>
                      {item.detail}
                    </span>
                                                    )}
                                                    {item.documentation && i === pyCompletion.active && (
                                                        <span className="sr-only">{item.documentation}</span>
                                                    )}
                                                </button>
                                            ))}
                                            {pyCompletion.items[pyCompletion.active]?.documentation && (
                                                <div
                                                    className="border-t px-2 py-1 text-[10px] text-muted-foreground max-h-16 overflow-y-auto">
                                                    {pyCompletion.items[pyCompletion.active].documentation}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {inlayHints && inlayHints.length > 0 && (() => {
                                        const hints = inlayHints;
                                        if (hints.length === 0) return null;
                                        return (
                                            <div className="absolute inset-0 pointer-events-none" style={{zIndex: 5}}>
                                                {hints.map((h) => (
                                                    <span
                                                        key={`inlay-${h.line}`}
                                                        className="absolute rounded px-1 select-none"
                                                        style={{
                                                            top: `${16 + (h.line - 1) * EDIT_LINE_HEIGHT}px`,
                                                            left: `${h.left}px`,
                                                            color: isDark ? "rgba(148,163,184,0.85)" : "rgba(71,85,105,0.9)",
                                                            background: isDark ? "rgba(30,41,59,0.55)" : "rgba(241,245,249,0.7)",
                                                            fontSize: `${Math.max(9, fontSize * 0.72)}px`,
                                                            fontFamily: "var(--font-jb-mono), monospace",
                                                            lineHeight: `${EDIT_LINE_HEIGHT}px`
                                                        }}
                                                        title={`After the last run: ${h.title} ( inlay hint — values refresh with each run)`}
                                                    >
                        {h.text}
                      </span>
                                                ))}
                                            </div>
                                        );
                                    })()}

                                    {/* ─── Edit-mode diagnostics squiggle overlay ─────────────
                  (Moved INSIDE the code-area container: it used to be a
                  sibling of the whole edit row, so its left origin sat at
                  the line-number gutter's edge and every squiggle was
                  offset left by the gutter width. Inside this container,
                  left:0 is the first code column, matching the textarea's
                  0px left padding.)

                  In read mode, squiggles are rendered inside
                  renderSimpleView() (positioned relative to the
                  SyntaxHighlighter's measured line metrics). In edit
                  mode, the textarea is a plain HTML element with its OWN
                  metrics (1rem top padding, leading-[1.6], same font as
                  read mode). Each squiggle div is filled with the actual
                  source-text slice (transparent color) so
                  text-decoration: underline wavy spans the full token
                  width. If the textarea ever scrolls internally, the
                  wrapper is translated by -scrollTop (see
                  syncEditSquiggleScroll).

 the wrapper is now ALWAYS mounted (the
                  squiggles inside remain conditional) so the
                  find-match highlight rects below can share it — the
                  rects make the find bar's ↑/↓ arrows visibly step
                  through matches even while the find INPUT keeps
                  keyboard focus (an unfocused textarea paints no
                  selection, which is why the arrows looked dead). */}
                                    <div
                                        ref={editSquiggleWrapRef}
                                        className="absolute pointer-events-none"
                                        style={{top: 0, left: 0, right: 0, bottom: 0, overflow: "visible", zIndex: 5}}
                                    >
                                        {/* phantom selection — painted while the
                  context menu is open so the selected range stays
                  visibly highlighted despite Radix stealing focus (an
                  unfocused textarea paints no selection). Same
                  geometry as the multi-caret rects: 16px top padding,
                  EDIT_LINE_HEIGHT rows, measured charWidth. */}
                                        {menuSelection && (() => {
                                            const EDIT_PADDING_TOP = 16;
                                            const lineStarts: number[] = [0];
                                            for (let i = 0; i < editContent.length; i++) {
                                                if (editContent[i] === "\n") lineStarts.push(i + 1);
                                            }
                                            const lineOf = (pos: number): number => {
                                                let lo = 0, hi = lineStarts.length - 1;
                                                while (lo < hi) {
                                                    const mid = (lo + hi + 1) >> 1;
                                                    if (lineStarts[mid] <= pos) lo = mid;
                                                    else hi = mid - 1;
                                                }
                                                return lo;
                                            };
                                            const rects: React.ReactNode[] = [];
                                            let pos = Math.max(0, Math.min(menuSelection.start, editContent.length));
                                            const selEnd = Math.max(0, Math.min(menuSelection.end, editContent.length));
                                            while (pos < selEnd) {
                                                const li = lineOf(pos);
                                                const lineEndIdx = li + 1 < lineStarts.length ? lineStarts[li + 1] - 1 : editContent.length;
                                                const segEnd = Math.min(selEnd, lineEndIdx + 1); // include the newline itself
                                                const colStart = pos - lineStarts[li];
                                                const colEnd = segEnd - lineStarts[li];
                                                rects.push(
                                                    <div
                                                        key={`phantom-sel-${li}`}
                                                        aria-hidden="true"
                                                        data-phantom-selection="true"
                                                        className="absolute rounded-[2px]"
                                                        style={{
                                                            top: `${EDIT_PADDING_TOP + li * EDIT_LINE_HEIGHT}px`,
                                                            left: `${colStart * charWidth}px`,
                                                            width: `${Math.max(2, (colEnd - colStart) * charWidth)}px`,
                                                            height: `${EDIT_LINE_HEIGHT}px`,
                                                            background: isDark ? "rgba(97,175,239,0.30)" : "rgba(53,132,226,0.25)",
                                                            zIndex: 4
                                                        }}
                                                    />
                                                );
                                                pos = segEnd;
                                            }
                                            return rects;
                                        })()}
                                        {/* ─── extra caret markers + selection rects
                  (multi-caret editing). Positioned with the same
                  metrics as the squiggles/find rects (16px top padding,
                  EDIT_LINE_HEIGHT rows, measured charWidth). The native
                  selection is painted by the browser itself — only the
                  EXTRA carets need painting here. */}
                                        {extraCarets.length > 0 && (() => {
                                            const EDIT_PADDING_TOP = 16;
                                            const lineStarts: number[] = [0];
                                            for (let i = 0; i < editContent.length; i++) {
                                                if (editContent[i] === "\n") lineStarts.push(i + 1);
                                            }
                                            const lineOf = (pos: number): number => {
                                                let lo = 0, hi = lineStarts.length - 1;
                                                while (lo < hi) {
                                                    const mid = (lo + hi + 1) >> 1;
                                                    if (lineStarts[mid] <= pos) lo = mid;
                                                    else hi = mid - 1;
                                                }
                                                return lo;
                                            };
                                            return extraCarets.map((c, i) => {
                                                const li = lineOf(c.start);
                                                const col = c.start - lineStarts[li];
                                                const top = EDIT_PADDING_TOP + li * EDIT_LINE_HEIGHT;
                                                const left = col * charWidth;
                                                return (
                                                    <React.Fragment key={`mc${i}`}>
                                                        {c.end > c.start && (
                                                            <div
                                                                aria-hidden="true"
                                                                data-multicaret="selection"
                                                                className="absolute rounded-[2px]"
                                                                style={{
                                                                    top: `${top}px`,
                                                                    left: `${left}px`,
                                                                    width: `${Math.max(2, (c.end - c.start) * charWidth)}px`,
                                                                    height: `${EDIT_LINE_HEIGHT}px`,
                                                                    background: isDark ? "rgba(97,175,239,0.30)" : "rgba(53,132,226,0.25)",
                                                                    zIndex: 4
                                                                }}
                                                            />
                                                        )}
                                                        <div
                                                            aria-hidden="true"
                                                            data-multicaret="caret"
                                                            className="absolute"
                                                            style={{
                                                                top: `${top}px`,
                                                                left: `${left}px`,
                                                                width: "2px",
                                                                height: `${EDIT_LINE_HEIGHT}px`,
                                                                background: isDark ? "#61afef" : "#3584e2",
                                                                zIndex: 6
                                                            }}
                                                        />
                                                    </React.Fragment>
                                                );
                                            });
                                        })()}
                                        {/* ─── the signature-help popup ────────────
Sits above the caret's line (never covers what the user
is typing into), left-aligned to the caret's column,
max-width clamped to the editor. The active argument is
bold + accent; the docstring rides underneath. */}
                                        {sigHelp && editMode && (() => {
                                            const EDIT_PADDING_TOP = 16;
                                            const top = EDIT_PADDING_TOP + (sigHelp.line - 1) * EDIT_LINE_HEIGHT;
                                            // If there is no room ABOVE (first lines), float BELOW
                                            // the caret's line instead — same rule as VS Code.
                                            const below = top < 48;
                                            const left = Math.max(8, (sigHelp.col - 1) * charWidth);
                                            const argList = sigHelp.args
                                                .split(",")
                                                .map((a) => a.trim())
                                                .filter(Boolean);
                                            // *args / **kwargs swallow everything beyond their spot.
                                            let active = sigHelp.activeArg;
                                            if (argList.length > 0) {
                                                const varIdx = argList.findIndex((a) => a.startsWith("*") && !a.startsWith("**"));
                                                if (varIdx !== -1 && active > varIdx) active = Math.min(active, varIdx);
                                            }
                                            return (
                                                <div
                                                    data-sig-help="popup"
                                                    className="absolute z-20 pointer-events-none select-none"
                                                    style={{
                                                        top: below ? `${top + EDIT_LINE_HEIGHT + 2}px` : `${Math.max(2, top - 2)}px`,
                                                        transform: below ? undefined : "translateY(-100%)",
                                                        left: `${left}px`,
                                                        maxWidth: "min(92%, 620px)"
                                                    }}
                                                >
                                                    <div
                                                        className="rounded-md border shadow-lg px-2.5 py-1.5 font-mono text-[11px] leading-relaxed"
                                                        style={{
                                                            background: isDark ? "rgba(40,44,52,0.97)" : "rgba(255,255,255,0.98)",
                                                            borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)",
                                                            color: isDark ? "#abb2bf" : "#383a42"
                                                        }}
                                                    >
                      <span className="whitespace-pre">
                        <span style={{color: isDark ? "#e5c07b" : "#a35300"}}>{sigHelp.name}</span>
                          {"("}
                          {argList.map((a, i) => (
                              <React.Fragment key={i}>
                                  {i > 0 && ", "}
                                  <span
                                      style={
                                          i === active
                                              ? {
                                                  fontWeight: 700,
                                                  color: isDark ? "#61afef" : "#3584e2",
                                                  textDecoration: "underline",
                                                  textDecorationStyle: "dotted"
                                              }
                                              : undefined
                                      }
                                  >
                              {a}
                            </span>
                              </React.Fragment>
                          ))}
                          {argList.length === 0 && sigHelp.args.trim() === "" ? "" : argList.length === 0 ? sigHelp.args : ""}
                          {")"}
                      </span>
                                                        {sigHelp.docstring && (
                                                            <span className="block text-[10px] opacity-70 truncate"
                                                                  style={{maxWidth: "560px"}}>
                          {sigHelp.docstring}
                        </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* squiggles now read `shownDiagnostics` —
                  the LIVE buffer lint while editing (the disk-based
                  prop went stale after every keystroke, which made the
                  zigzag "move to the next line" after a deletion). */}
                                        {shownDiagnostics && shownDiagnostics.length > 0 && (() => {
                                            const EDIT_PADDING_TOP = 16; // 1rem — matches the textarea
                                            const squiggles = shownDiagnostics.filter((d) => d.line >= overlayFirst && d.line <= overlayLast).map((d, i) => {
                                                // Only render squiggles for lines that exist in the
                                                // current edit content (the user might have deleted
                                                // lines since the lint ran). Stale line numbers → skip.
                                                if (d.line < 1 || d.line > editLines.length) return null;
                                                const srcLine = editLines[d.line - 1] ?? "";
                                                // Same token-boundary logic as read mode: extend over
                                                // identifier chars only (letters, digits, underscore),
                                                // stopping at punctuation/whitespace.
                                                let tokenStart = 0;
                                                while (tokenStart < srcLine.length && /\s/.test(srcLine[tokenStart])) tokenStart++;
                                                let tokenEnd = srcLine.length;
                                                if (typeof d.col === "number" && d.col > 0) {
                                                    tokenStart = Math.min(Math.max(0, d.col - 1), srcLine.length);
                                                    tokenEnd = tokenStart;
                                                    while (tokenEnd < srcLine.length && /[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                                                    if (tokenEnd <= tokenStart) {
                                                        tokenEnd = tokenStart;
                                                        while (tokenEnd < srcLine.length && !/[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                                                        while (tokenEnd < srcLine.length && /[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                                                    }
                                                } else {
                                                    // No col — extend only over the first identifier run.
                                                    tokenEnd = tokenStart;
                                                    while (tokenEnd < srcLine.length && /[A-Za-z0-9_]/.test(srcLine[tokenEnd])) tokenEnd++;
                                                }
                                                const spanChars = Math.max(1, tokenEnd - tokenStart);
                                                const squiggleText = srcLine.slice(tokenStart, tokenEnd) || "\u00a0";
                                                const top = EDIT_PADDING_TOP + (d.line - 1) * EDIT_LINE_HEIGHT;
                                                const left = tokenStart * charWidth;
                                                const width = spanChars * charWidth;
                                                const color = d.severity === "error" ? "#ef4444" : d.severity === "warning" ? "#f59e0b" : "#3b82f6";
                                                return (
                                                    <div
                                                        key={`ed-d${i}`}
                                                        className="absolute pointer-events-none"
                                                        style={{
                                                            top: `${top}px`,
                                                            left: `${left}px`,
                                                            width: `${width}px`,
                                                            height: `${EDIT_LINE_HEIGHT}px`,
                                                            color: "transparent",
                                                            fontFamily: "var(--font-jb-mono), monospace",
                                                            fontSize: `${fontSize}px`,
                                                            lineHeight: `${EDIT_LINE_HEIGHT}px`,
                                                            whiteSpace: "pre",
                                                            overflow: "hidden",
                                                            zIndex: 5
                                                        }}
                                                        title={d.message}
                                                        aria-hidden="true"
                                                    >
                                                        <span>{squiggleText}</span>
                                                        {/* Scroll-proof wavy line — a DOM child (the
                          wrapper is translateY'd by the textarea's
                          scrollTop; the child moves with it in every
                          paint path). */}
                                                        <WaveUnderline color={color}/>
                                                    </div>
                                                );
                                            });
                                            return <>{squiggles}</>;
                                        })()}
                                        {/* ─── spell underlines (EDIT mode,───────────
The comment/string misspellings as wavy underlines —
rendered as INTERACTIVE chips (SpellWordSpan): clicking a
misspelled word opens the SAME suggestion popover view mode
has — replace-everywhere / copy / replace-in-place — right in
the editor. The chips sit in the scroll-synced wrapper; the
x math is TAB-AWARE and the row math is WRAP-AWARE. The chip
covers exactly the misspelled word, so the textarea keeps
every other pointer event. */}
                                        {editMode && spellEnabled && spellIssues.length > 0 && (() => {
                                            const EDIT_PADDING_TOP = 16;
                                            const marks = spellIssues.filter((i) => i.line >= 1 && i.line <= editLines.length && i.line >= overlayFirst && i.line <= overlayLast).map((issue, i) => {
                                                const srcLine = editLines[issue.line - 1] ?? "";
                                                const pos = visualPositionOf(srcLine, Math.max(0, issue.col - 1), indentWidth, editWrapCols);
                                                const extraRowsBefore = editRowPrefix?.[issue.line - 1] ?? 0;
                                                const top = EDIT_PADDING_TOP + ((issue.line - 1) + extraRowsBefore + pos.row) * EDIT_LINE_HEIGHT;
                                                const left = pixelXOfColumn(srcLine, issue.col - 1, indentWidth, charWidth);
                                                const width = issue.word.length * charWidth;
                                                return (
                                                    <div
                                                        key={`espell-${issue.word}-${issue.line}-${issue.col}-${i}`}
                                                        className="absolute"
                                                        style={{
                                                            top: `${top}px`,
                                                            left: `${left}px`,
                                                            width: `${width}px`,
                                                            height: `${EDIT_LINE_HEIGHT}px`,
                                                            color: "transparent",
                                                            fontFamily: "var(--font-jb-mono), monospace",
                                                            fontSize: `${fontSize}px`,
                                                            lineHeight: `${EDIT_LINE_HEIGHT}px`,
                                                            whiteSpace: "pre",
                                                            overflow: "visible",
                                                            pointerEvents: "auto",
                                                            zIndex: 6
                                                        }}
                                                        title={`"${issue.word}" is misspelled — click for suggestions`}
                                                    >
                                                        <SpellWordSpan
                                                            word={issue.word}
                                                            onIgnore={ignoreSpellWord}
                                                            onReplace={replaceSpellWord}
                                                            onReplaceOnce={(w, s) => replaceSpellWordAt(w, s, issue.line, issue.col)}
                                                        />
                                                    </div>
                                                );
                                            });
                                            return <>{marks}</>;
                                        })()}
                                        {/* ─── find-match highlight rects (edit mode) ──
                  Same visual language as the view-mode overlay: every
                  match gets a soft amber tint, the current match a
                  stronger one + ring. Positioned with the textarea's own
                  metrics (16px top padding, EDIT_LINE_HEIGHT rows,
                  measured charWidth, 0px left padding), so the rects sit
                  exactly on the glyphs. Multi-line matches (only
                  possible in regex mode) are clipped to their first
                  line — the textarea selection still spans the whole
                  match. */}
                                        {showFind && editMode && findText.trim() && (() => {
                                            const EDIT_PADDING_TOP = 16;
                                            // Line-start offsets for editContent (recomputed per
                                            // render — cheap, one pass).
                                            const lineStarts: number[] = [0];
                                            for (let i = 0; i < editContent.length; i++) {
                                                if (editContent[i] === "\n") lineStarts.push(i + 1);
                                            }
                                            // Binary search: index of the last lineStart <= pos.
                                            const lineOf = (pos: number): number => {
                                                let lo = 0, hi = lineStarts.length - 1;
                                                while (lo < hi) {
                                                    const mid = (lo + hi + 1) >> 1;
                                                    if (lineStarts[mid] <= pos) lo = mid;
                                                    else hi = mid - 1;
                                                }
                                                return lo;
                                            };
                                            return findMatches.map((m, i) => {
                                                const li = lineOf(m.start);
                                                const lineStart = lineStarts[li];
                                                const lineEnd =
                                                    li + 1 < lineStarts.length ? lineStarts[li + 1] - 1 : editContent.length;
                                                // Clip multi-line matches to the first line.
                                                const end = Math.min(m.end, lineEnd);
                                                if (end <= m.start) return null;
                                                const col = m.start - lineStart;
                                                const isCurrent = i === currentMatch;
                                                return (
                                                    <div
                                                        key={`efm${i}`}
                                                        aria-hidden="true"
                                                        className="absolute pointer-events-none rounded-[3px]"
                                                        style={{
                                                            top: `${EDIT_PADDING_TOP + li * EDIT_LINE_HEIGHT}px`,
                                                            left: `${col * charWidth}px`,
                                                            width: `${Math.max(2, (end - m.start) * charWidth)}px`,
                                                            height: `${EDIT_LINE_HEIGHT}px`,
                                                            background: isCurrent ? "rgba(245, 158, 11, 0.42)" : "rgba(234, 179, 8, 0.20)",
                                                            boxShadow: isCurrent ? "0 0 0 1px rgba(245, 158, 11, 0.8)" : undefined,
                                                            zIndex: 4
                                                        }}
                                                    />
                                                );
                                            });
                                        })()}
                                    </div>
                                    {/* hover tooltip for the squiggle under the
                  mouse (edit mode). Mirrors the read-mode native title —
                  here it can't be native because the squiggle overlay is
                  pointer-events-none (see onMouseMove on the textarea). */}
                                    {hoveredDiag && (
                                        <div
                                            className="absolute z-30 max-w-md rounded-md border bg-popover text-popover-foreground shadow-lg px-2 py-1 text-[11px] pointer-events-none"
                                            style={{
                                                top: `${Math.max(2, hoveredDiag.y - 22)}px`,
                                                left: `${Math.min(hoveredDiag.x, 400)}px`
                                            }}
                                            role="tooltip"
                                        >
                                            {hoveredDiag.message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : hasCells && onRunCell ? (
                            renderCellView()
                        ) : (
                            renderSimpleView()
                        )}

                        {aiFetching && editMode && !aiSuggestion && (
                            <div className={cn(
                                "absolute left-2 z-30 max-w-md rounded-md border bg-popover text-popover-foreground shadow-lg px-2 py-1.5 flex items-center gap-1.5",
                                aiPopupFlipUp ? "top-2" : "bottom-2"
                            )}>
                                <Loader2 className="size-3 animate-spin text-purple-500"/>
                                <span className="text-[10px] text-muted-foreground">AI thinking…</span>
                            </div>
                        )}
                        {/* the popup only shows when the INLINE ghost
            text is NOT (multi-line suggestions, mid-line carets, or
            word-wrap mode) — showing both would be redundant. */}
                        {aiSuggestion && editMode && !(
                            aiGhostCaret !== null &&
                            !wordWrap &&
                            (aiGhostCaret >= editContent.length || editContent[aiGhostCaret] === "\n")
                        ) && (
                            <div className={cn(
                                "absolute left-2 z-30 max-w-md rounded-md border bg-popover text-popover-foreground shadow-lg p-2",
                                aiPopupFlipUp ? "top-2" : "bottom-2"
                            )}>
                                <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                                    <Sparkles className="size-2.5"/>AI suggestion <kbd
                                    className="px-1 rounded bg-muted text-[9px]">Tab</kbd> <kbd
                                    className="px-1 rounded bg-muted text-[9px]">Esc</kbd></div>
                                <pre
                                    className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{aiSuggestion}</pre>
                            </div>
                        )}

                        {/* BOTH find bars moved OUT of the scroll
container — they used to be `absolute` children of it, so
they scrolled away with the code. They now
anchor to the CodeViewer root, pinned just below the
header. ArrowUp / ArrowDown also cycle matches now. See the
render sites after the theme-picker bar. */}
                    </div>
                </ContextMenuTrigger>
                {/* The right-click menus live in code-viewer-context-menu.tsx
          (Phase 2b extraction — same JSX, explicit props). */}
                <CodeViewerContextMenu
                    editMode={editMode}
                    expanded={expanded}
                    saving={saving}
                    editHasSelection={editHasSelection}
                    hasCells={hasCells}
                    isCollapsible={isCollapsible}
                    editContent={editContent}
                    caretLine={caretLine}
                    menuSelection={menuSelection}
                    insertBlocks={insertBlocks}
                    canOpenFolder={canOpenFolder}
                    codeFolding={codeFolding}
                    fileName={fileName}
                    isOpeningFolder={isOpeningFolder}
                    onAiPrompt={onAiPrompt}
                    onGenerateTests={onGenerateTests}
                    onOpenFolder={onOpenFolder}
                    onRunFile={onRunFile}
                    onRunSelection={onRunSelection}
                    onSaveEdit={onSaveEdit}
                    codeBodyRef={codeBodyRef}
                    editContentRef={editContentRef}
                    onRunSelectionRef={onRunSelectionRef}
                    savedSelectionRef={savedSelectionRef}
                    swapLineDownRef={swapLineDownRef}
                    swapLineUpRef={swapLineUpRef}
                    textareaRef={textareaRef}
                    setExpanded={setExpanded}
                    setMenuSelection={setMenuSelection}
                    setShowThemePicker={setShowThemePicker}
                    changeAllFn={changeAllFn}
                    commentToggleFn={commentToggleFn}
                    convertCaseFn={convertCaseFn}
                    copyFilePathFn={copyFilePathFn}
                    copyFilePathWithLineFn={copyFilePathWithLineFn}
                    deleteLinesFn={deleteLinesFn}
                    duplicateLineFn={duplicateLineFn}
                    editContextCopy={editContextCopy}
                    editContextCut={editContextCut}
                    editContextPaste={editContextPaste}
                    editContextRedo={editContextRedo}
                    editContextUndo={editContextUndo}
                    effectiveEditRange={effectiveEditRange}
                    foldAllFn={foldAllFn}
                    foldCurrentFn={foldCurrentFn}
                    formatDocumentFn={formatDocumentFn}
                    formatSelectionFn={formatSelectionFn}
                    getSelectedTextForAi={getSelectedTextForAi}
                    handleCancelEdit={handleCancelEdit}
                    handleCopy={handleCopy}
                    handleCopyAsMarkdown={handleCopyAsMarkdown}
                    handleDownload={handleDownload}
                    handleEditChange={handleEditChange}
                    handleExtractRefactor={handleExtractRefactor}
                    handleSaveEdit={handleSaveEdit}
                    handleStartEdit={handleStartEdit}
                    insertBlockAtCaret={insertBlockAtCaret}
                    joinLinesFn={joinLinesFn}
                    openFindBar={openFindBar}
                    openInlineAi={openInlineAi}
                    reverseLinesFn={reverseLinesFn}
                    runSelectionFn={runSelectionFn}
                    shuffleLinesFn={shuffleLinesFn}
                    sortLinesFn={sortLinesFn}
                    toggleBookmarkFn={toggleBookmarkFn}
                    trimTrailingFn={trimTrailingFn}
                    unfoldAllFn={unfoldAllFn}
                    uniqueLinesFn={uniqueLinesFn}
                    viewAutoIndentFn={viewAutoIndentFn}
                />
            </ContextMenu>

            {/* ─── INLINE AI CHAT (Ctrl+I) — anchored at the caret ──
            Streams from /api/ai-chat; "Apply to selection" splices the
            answer's first code block over the selection through the
            undoable buffer path (Ctrl+Z reverts). */}
            <InlineAiChat
                open={inlineAi.open}
                anchor={inlineAi.anchor}
                fileName={fileName}
                selectedText={inlineAi.sel?.text ?? inlineAi.viewText ?? ""}
                fileContext={editMode ? editContent : code}
                onClose={() => setInlineAi((v) => ({...v, open: false}))}
                onApply={applyInlineAi}
                isDark={isDark}
            />

            {/* ─── PEEK REFERENCES (⇧F12) — anchored at the caret ──
            The compact references popup; the same data as ⌥F7 (Find
            Usages), one keypress closer. Same-file rows jump inside
            the viewer; cross-file rows dispatch praxis:open-reference
            (page.tsx's listener switches files and jumps). */}
            {peekRefs.open && (
                <PeekReferencesPopup
                    symbol={peekRefs.symbol}
                    anchor={peekRefs.anchor}
                    currentFile={{folderSlug, fileSlug}}
                    hitsOverride={peekRefs.hitsOverride}
                    onClose={() => setPeekRefs((v) => ({...v, open: false, hitsOverride: undefined}))}
                    onJump={jumpToPeekReference}
                />
            )}

            {/* ─── floating expand/collapse pill ─────────────
The expand/collapse toggle is an overlay pill pinned to the bottom-right
of the code body: zero reserved space, still one click. It
floats above the code with a translucent background, and the
bottom fade gradient already signals the collapsed state. */}
            {isCollapsible && !hasCells && !editMode && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpanded((v) => !v)}
                    className="absolute bottom-3 right-3 z-30 h-7 gap-1.5 text-[11px] rounded-full shadow-md bg-background/90 backdrop-blur px-3"
                    title={expanded ? "Show fewer lines (collapse)" : "Show the full code (expand)"}
                >
                    <Code2 className="size-3.5"/>{expanded ? "Show less" : "Show full code"}<ChevronDown
                    className={cn("size-3.5 transition-transform", expanded && "rotate-180")}/>
                </Button>
            )}

            {/* ─── VIM EX COMMAND BAR ────────────────────────────────────
          ":" in normal mode opens this single-line input at the bottom
          of the editor (the Vim look). Enter hands the line to the
          engine's executeCommand (:w saves, :q/:wq closes the tab,
          :%s/…/…/ substitutes, :set nu|rnu toggles the gutter numbers);
          Esc closes the bar. The bar owns focus while open, so typed
          characters never leak into the buffer. */}
            {vimCommand !== null && (
                <div
                    className="absolute inset-x-0 bottom-0 z-40 flex items-center border-t bg-background/95 backdrop-blur px-2 py-1"
                    role="region"
                    aria-label="Vim command line"
                >
                    <input
                        ref={vimCommandInputRef}
                        value={vimCommand}
                        onChange={(e) => setVimCommand(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                setVimCommand(null);
                                return;
                            }
                            if (e.key === "Enter") {
                                e.preventDefault();
                                const line = vimCommand;
                                setVimCommand(null);
                                const ok = vimRef.current?.executeCommand(line) ?? false;
                                if (!ok) {
                                    aiToast({
                                        title: "Unknown vim command",
                                        description: `${line || "(empty)"} — supported: :w · :q · :wq · :noh · :set nu|rnu · :%s/old/new/[g]`
                                    });
                                }
                                setVimTick((t) => t + 1);
                            }
                        }}
                        spellCheck={false}
                        autoComplete="off"
                        className="w-full bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground"
                        placeholder=":w write · :q quit · :%s/old/new/g · :set nu | rnu"
                        aria-label="Vim command line"
                    />
                </div>
            )}

            {/* the IDE-styled unsaved-changes confirm. This
          single dialog backs every editGuard promise (leaving edit
          mode, switching files) — same look as the rest of the app's
          AlertDialogs, replacing the browser's native confirm box. */}
            <AlertDialog
                open={!!editGuard}
                onOpenChange={(open) => {
                    if (!open) {
                        editGuard?.resolve(false);
                        setEditGuard(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{editGuard?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{editGuard?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            editGuard?.resolve(false);
                            setEditGuard(null);
                        }}>
                            Keep editing
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                editGuard?.resolve(true);
                                setEditGuard(null);
                            }}
                        >
                            {editGuard?.confirmLabel}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
});

export const CodeViewer = React.memo(CodeViewerInner);

/* ------------------------------------------------------------------ */
/*  ReadModeFindBar — find-in-read-mode                                */
/* ------------------------------------------------------------------ */

/**
 * A minimal find bar for read mode (when the code viewer is showing
 * the syntax-highlighted read-only view, not the textarea editor).
 *
 * Rework: the bar used to match only WHOLE LINES and never
 * highlighted anything — the arrows scrolled but nothing lit up, which
 * read as "the up/down arrows are not working to highlight the next
 * or previous occurrence". The match list (occurrence-level, with
 * line + column) and the current-match index now live in the PARENT,
 * which also renders one highlight rectangle per occurrence inside the
 * code body (see the find-match overlay in renderSimpleView). This
 * component is now purely the control strip: input, counter, prev /
 * next / close, Enter / Shift+Enter / ArrowUp / ArrowDown navigation.
 */
