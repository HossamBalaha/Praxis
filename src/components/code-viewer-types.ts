import type {PythonSymbol} from "@/lib/python-symbols";
import type {IndentStyleName} from "@/lib/indent";

export interface Diagnostic {
    line: number;
    col?: number;
    severity: "error" | "warning" | "info";
    message: string;
}


/**
 * Imperative API exposed by CodeViewer via a ref. Lets the parent
 * (page.tsx) trigger save / find / format / undo / redo / cut / copy /
 * paste / replace from the menu bar without lifting all editor state
 * out of the component.
 */
export interface CodeViewerProps {
    fileName: string;
    code: string;
    folderName?: string;
    onOpenFolder?: () => void;
    isOpeningFolder?: boolean;
    canOpenFolder?: boolean;
    onDownload?: () => void;
    folderSlug?: string;
    fileSlug?: string;
    onRunCell?: (startLine: number, endLine: number) => void;
    aiEndpoints?: Array<{ name: string; url: string; enabled: boolean }>;
    codeSyntaxTheme?: string;
    onSaveEdit?: (
        content: string,
        /** Identity of the file the content belongs to. Lets the parent
         *  reject stale saves — a pending autosave timer captured file A's
         *  buffer and would otherwise write it into whichever file is
         *  selected when the timer fires . */
        identity?: { folderSlug?: string; fileSlug?: string }
    ) => Promise<void>;
    wordWrap?: boolean;
    collapsedByDefault?: boolean;
    showLineNumbers?: boolean;
    fontSize?: number;
    /** line-height multiplier (1.2–2.0, default 1.6). */
    lineHeight?: number;
    /** extra letter spacing in px (0 = font default). */
    letterSpacing?: number;
    /** rainbow brackets + pair guides overlay. */
    rainbowBrackets?: boolean;
    indentWidth?: number;
    insertSnippet?: { content: string; nonce: number } | null;
    /** Called after the viewer applies `insertSnippet` — the parent
     *  resets the signal to null. Without consumption the snippet state
     *  stayed armed forever and re-appended itself to every later file
     *  and every save . */
    onSnippetConsumed?: () => void;
    autoSaveDelayMs?: number;
    showSymbolOutline?: boolean;
    aiCompletionEnabled?: boolean;
    diagnostics?: Diagnostic[];
    gitDiffLines?: { added: number[]; removed: number[]; modified: number[] };
    /** Settings → Editor → git blame gutter (author + age per group). */
    showBlameGutter?: boolean;
    /** Executed-line coverage from the finished run ("Run with coverage…":
     *  the prelude's sys.settrace hook), already filtered by page.tsx to
     *  THIS file's entry. Mapped to the gutter — a thin emerald marker
     *  strip in view mode and a soft tint on the gutter numbers in edit
     *  mode (2). Undefined = normal run, no markers. */
    coverageLines?: readonly number[];
    onGenerateTests?: () => void;
    /** True while AI test generation is in flight — disables the Tests
     * button and shows a spinner so the user knows it's processing. */
    generatingTests?: boolean;
    /** Send a prompt to the integrated AI Chat sidebar. Used by the
     *  "Explain" and "Improve" buttons so they route through the
     *  integrated assistant instead of opening an external AI website. */
    onAiPrompt?: (text: string) => void;
    /** run the SELECTED lines (or the caret's current line
     *  when nothing is selected — PyCharm's Alt+Shift+E behavior) as a
     *  one-shot Python run. The parent routes it through /api/run's new
     *  `code` override so output streams to the panel like a normal run. */
    onRunSelection?: (code: string) => void;
    /** run the WHOLE file from the editor context menu
     *  (view mode). The parent passes its existing Run handler (the
     *  same one the toolbar's Run button uses) — keeps duration
     *  warnings, output-tab switching and history intact. */
    onRunFile?: () => void;
    // ─── debugger integration ─────────────────────────────
    /** Breakpoints for THIS file as 1-indexed, ascending line numbers.
     *  Rendered as red dots in the gutter's reserved left strip; clicks
     *  there toggle them (Python files only). SEMI-CONTROLLED: when the
     *  parent passes this prop and its CONTENTS change, the new list is
     *  adopted (the parent won the round); when the parent passes a
     *  stable array, gutter toggles keep updating the internal set —
     *  they notify through onBreakpointsChange AND the
     *  `praxis:breakpoints-changed` window event (detail: { folderSlug,
     *  fileSlug, breakpoints }), which the Diagnostics panel's debug tab
     *  consumes so gutter breakpoints feed debug runs with ZERO page
     *  wiring. Nothing is persisted by the viewer. */
    breakpoints?: number[];
    /** Fires with the FULL new ordered list on every gutter toggle. */
    onBreakpointsChange?: (lines: number[]) => void;
    /** The line the active pdb session is stopped at — rendered with a
     *  distinct "breakpoint hit" highlight (both modes). Also arrives
     *  with zero wiring through the `praxis:debug-stopped-line` event
     *  the Diagnostics panel emits; this explicit prop wins over the
     *  event when both are provided. */
    debugStoppedLine?: number | null;
    codeFolding?: boolean;
    showMinimap?: boolean;
    webWorkerHighlighting?: boolean;
    /** the configured Python interpreter (Settings →
     *  Python). The edit-mode live lint runs in THIS environment so the
     *  buffer zigzags match the disk lint's linter; an empty `linter:
     *  "none"` live result never replaces the visible disk diagnostics. */
    pythonInterpreter?: string;
    /** debounce for the AI completion fetch (Settings →
     *  AI). Previously hard-coded to 1000ms while the setting did nothing. */
    aiCompletionDebounceMs?: number;
    /** Highlight the line under the mouse cursor (Settings → Advanced). */
    highlightCurrentLine?: boolean;
    /** Symbol/docstring hover tooltips on Python lines in view mode
     *  (Settings → Editor). OFF by default. */
    hoverSymbolTooltips?: boolean;
    /** mypy-revealed types (from /api/typecheck's symbolTypes, relayed
     *  through praxis:type-symbols by the Diagnostics panel) — the view
     *  hover card shows `name: type` on the matching line. Empty/undefined
     *  when the typecheck tool hasn't run. */
    typeSymbols?: Array<{ line: number; name: string; type: string }> | null;
    /** Vim mode (Settings → Editor): modal editing in the edit-mode
     *  textarea — normal/insert/visual, counts, operators, registers,
     *  marks, macros and :commands. */
    vimMode?: boolean;
    /** mypy type-checking inlay hints (the power mode) — assignment /
     *  return type chips rendered after each line, same layer as the
     *  runtime-variable inlays. */
    typeInlays?: Array<{ line: number; col: number; endCol?: number; label: string; kind: "type" | "return" }>;
    /** Line-profiler heat: per-line microseconds from the last Line
     *  Profile run — rendered as a warm intensity strip in the gutter
     *  (view mode). */
    lineProfileHeat?: Record<string, number>;
    /** UNCOVERED lines from the last coverage run (the twin of
     *  coverageLines) — dim red gutter marks. */
    coverageUncovered?: readonly number[];
    /** Show whitespace characters (Settings → Advanced). */
    showWhitespace?: boolean;
    /** Max line length before a soft warning vertical-line marker appears
     *  in the code body (PEP 8's 79 / 99). 0 = disabled. */
    maxLineLengthHint?: number;
    /** Auto-save the edited file when the textarea loses focus (in
     *  addition to the existing autoSaveDelayMs debounce). */
    autoSaveOnBlur?: boolean;
    /** Sticky cursor indicator — renders a visible caret marker on the
     * active line even when the editor isn't focused. Useful for
     * screen-magnifier users tracking the current line. */
    stickyCursorIndicator?: boolean;
    /** Called when the caret position changes in edit mode. The parent
     *  uses this to display line:col in the footer. */
    onCursorPositionChange?: (line: number, col: number) => void;
    /** Called when the text selection changes in edit mode. The parent
     *  uses this to display "Sel N" in the footer's status bar. Receives
     *  the char count + line count of the current selection (0,0 when
     *  the caret is not a selection). */
    onSelectionChange?: (chars: number, lines: number) => void;
    /** Called when the dirty state changes — i.e., when the user starts
     * editing (true) or saves (false). The parent uses this to mark
     * the editor tab as dirty so close-tab can prompt for confirm. */
    onDirtyChange?: (dirty: boolean) => void;
    /** indentation STYLE (tabs vs spaces) — the Tab key,
     *  Enter auto-indent and Shift+Tab dedent all use the configured unit
     *  instead of hard-coded spaces. */
    indentStyle?: IndentStyleName;
    // ─── props ─────────────────────────────────────────────
    /** Sticky scroll — the innermost def/class header stays pinned at
     *  the top of the code pane while scrolling (view mode). */
    stickyScroll?: boolean;
    /** typewriter scrolling — keep the caret vertically
     *  centered while typing (edit mode). */
    typewriterScroll?: boolean;
    /** Indent guides — thin vertical lines at each indent level. */
    indentGuides?: boolean;
    /** Ruler column — a faint solid vertical guide at this column
     *  (0 = off). Distinct from maxLineLengthHint's warning marker. */
    rulerColumn?: number;
    /** Ruler line WIDTH in px (— configurable, 1–6). The
     *  position lives in rulerColumn; this styles the guide itself. */
    rulerLineWidth?: number;
    /** Tab expands snippets when the word before the caret matches a
     * trigger (built-ins + the /api/snippets library). */
    tabSnippetExpansion?: boolean;
    /** Profiling heatmap — per-function timings mapped onto def lines
     *  (from the Diagnostics panel's Profile tool). Rendered as a
     *  colored gutter bar + tooltip per entry. */
    timingOverlay?: Array<{ line: number; cumtime: number; tottime: number }> | null;
    /** Clear the timing heatmap (the chip's ✕ button). */
    onClearTiming?: () => void;
    /** show Code Lens chips (Run / Usages / Rename /
     *  Tests) above each top-level def/class in edit mode. */
    codeLens?: boolean;
    /** the last run's variables snapshot (Inspect
     *  variables). Assignment lines whose name matches show a runtime
     *  inlay hint (`: type = repr`). Null/empty hides the overlay. */
    runtimeVariables?: Array<{ name: string; type: string; repr: string }> | null;
}

export interface CodeViewerHandle {
    /** Save the current edit content (calls onSaveEdit). No-op if not in
     *  edit mode OR if there's nothing to save. */
    save: () => Promise<void>;
    /** Open the find bar (works in both edit and read mode). */
    openFind: () => void;
    /** Run black/ruff format on the current edit content via /api/format,
     *  then replace the textarea content with the formatted result.
     *  No-op if not in edit mode. */
    format: () => Promise<void>;
    /** Run ruff's organize-imports pass (`--select I --fix`) on the
     *  current content via /api/format mode:"organize", then splice the
     *  organized result back through the same replace mechanism format
     *  uses. Python only; ruff required (no fallback) — failures toast
     *  the route's error text. */
    organizeImports: () => Promise<void>;
    /** Trigger the textarea's native undo (no-op if not in edit mode). */
    undo: () => void;
    /** Trigger the textarea's native redo (no-op if not in edit mode). */
    redo: () => void;
    /** Trigger the textarea's native cut (no-op if not in edit mode). */
    cut: () => void;
    /** Trigger the textarea's native copy (no-op if not in edit mode). */
    copy: () => void;
    /** Trigger the textarea's native paste (no-op if not in edit mode). */
    paste: () => void;
    /** Open the find bar with the Replace UI expanded (edit mode only). */
    openReplace: () => void;
    /** Returns true if the editor is currently in edit mode. */
    isEditMode: () => boolean;
    /** Jump to a 1-indexed line number. Works in both edit and read mode. */
    jumpToLine: (line: number) => void;
    /** Returns the parsed Python symbols for the currently displayed source. */
    getSymbols: () => PythonSymbol[];
    /** Toggle a bookmark on the current caret line. */
    toggleBookmark: () => void;
    /** Jump to next bookmark (wraps). */
    nextBookmark: () => void;
    /** Jump to previous bookmark (wraps). */
    prevBookmark: () => void;
    /** Swap current line/selection with the line above. Edit mode only. */
    swapLineUp: () => void;
    /** Swap current line/selection with the line below. Edit mode only. */
    swapLineDown: () => void;
    /** Select next occurrence of current word (Sublime Ctrl+D). Edit mode only. */
    selectNextMatch: () => void;
    /** Returns the diagnostics currently shown in the editor. */
    getDiagnostics: () => Diagnostic[];
    /** Returns the currently selected text, or the word under the caret. */
    getSelectedSymbol: () => string;
    /** Returns the (1-based line, col) the LSP gestures should ask the
     *  Pyright sidecar about — the position twin of getSelectedSymbol
     *  (null when nothing is targeted). */
    getSelectedPosition: () => { line: number; col: number } | null;
    // ─── debugger gutter breakpoints ────────────────────
    /** The viewer's current breakpoint set (1-indexed, ascending). The
     *  page reads this when launching a debug run — or subscribes to
     *  onBreakpointsChange / the praxis:breakpoints-changed event. */
    getBreakpoints: () => number[];
    /** Toggle a breakpoint on a 1-indexed line (the imperative twin of
     *  the gutter click — used for a11y / programmatic control). */
    toggleBreakpoint: (line: number) => void;
    // ─── editor context-menu actions ───────────────────
    /** Toggle # comments on the selected lines (or the caret's line). */
    toggleComment: () => void;
    /** Duplicate the current line (or every selected line). */
    duplicateLine: () => void;
    /** Convert the selection (or the word under the caret) to a case. */
    convertCase: (
        kind: "upper" | "lower" | "title" | "camel" | "pascal" | "snake" | "kebab" | "constant"
    ) => void;
    /** Remove trailing whitespace from every line of the buffer. */
    trimTrailingWhitespace: () => void;
    /** Format ONLY the current selection (black/ruff via /api/format,
     *  in-memory) and splice the result back. */
    formatSelection: () => Promise<void>;
    /** Select the word under the caret and open Find-and-Replace prefilled
     *  with it — the textarea-adapted "Change All Occurrences". */
    changeAllOccurrences: () => void;
    /** Fold every block-level symbol in the file (edit mode). */
    foldAll: () => void;
    /** Unfold every block (edit mode). */
    unfoldAll: () => void;
    /** Fold the innermost block containing the caret (edit mode). */
    foldCurrentBlock: () => void;
    /** Run the selection (or the caret's line) in Python via
     *  onRunSelection — PyCharm's "Execute Selection in Console". */
    runSelection: () => void;
    /** True when the textarea has a non-empty selection. */
    hasSelection: () => boolean;
    /** Delete the caret's line — or every selected line (edit mode). */
    deleteLines: () => void;
    /** Join the caret's line with the next, or all selected lines (edit mode). */
    joinLines: () => void;
    /** split the selection / caret line at commas. */
    splitLines: () => void;
    /** surround the selection (or word at the caret)
     *  with a delimiter pair. */
    surroundSelection: (kind: "quotes" | "parens" | "brackets" | "braces") => void;
    /** the live selection text (or the caret's line)
     *  — feeds Send-selection-to-terminal. */
    getSelectionText: () => string;
    /** Sort the selected lines alphabetically (edit mode). */
    sortLines: () => void;
    /** Remove duplicate lines from the selection (edit mode). */
    uniqueLines: () => void;
    /** Reverse the order of the selected lines (edit mode). */
    reverseLines: () => void;
    /** Shuffle the selected lines into a random order (edit mode). */
    shuffleLines: () => void;
    /** Focus the textarea and select the whole buffer (edit mode). */
    selectAllBuffer: () => void;
    /** Copy the current selection as a fenced Markdown code block. */
    copySelectionAsMarkdown: () => Promise<void>;
    /** the LIVE buffer — the edit-mode textarea's content when
     *  editing, the on-disk content otherwise. Used by the Console's
     *  "Run file" (unsaved edits included) and the AI-apply flow. */
    getBuffer: () => string;
    /** replace the whole buffer with new content (the AI
     * "Apply" flow after the user accepts a diff). Edit mode only —
     * switches to edit mode first when needed. Undoable via ⌘Z. */
    replaceBuffer: (content: string) => void;
    /* ─── session-restore hooks ───────────────────
     * The workspace snapshot pulls the unsaved buffer + caret + scroll
     * every few seconds and on beforeunload; on reload the parent feeds
     * the snapshot back through the restoredDirty prop and these getters
     * keep it fresh while the tab stays open. */
    /** The live editor state for the session snapshot: unsaved content
     *  (null when clean), caret offset, and the view scrollTop. */
    getEditState: () => { content: string | null; caret: number; scrollTop: number };
    /** Restore an unsaved buffer: enters edit mode with the given
     *  content, marks the tab dirty, restores the caret + scroll. */
    restoreEditState: (state: { content: string; caret: number; scrollTop?: number }) => void;
}
