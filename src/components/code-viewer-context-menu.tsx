"use client";

import * as React from "react";
import {
    ArrowDownAZ,
    ArrowDownToLine,
    ArrowUpDown,
    Binary,
    Bookmark,
    BookOpen,
    Braces,
    ChevronDown,
    ChevronUp,
    ClipboardPaste,
    Code2,
    Columns2,
    Copy,
    CopyMinus,
    Delete,
    Download,
    Eraser,
    FilePlus2,
    FileText,
    FileType2,
    FlaskConical,
    FolderOpen,
    FoldVertical,
    FunctionSquare,
    Hash,
    History,
    IndentIncrease,
    ListTree,
    Merge,
    Minimize2,
    Network,
    Palette,
    Pencil,
    Play,
    Redo2,
    Regex,
    Save,
    Scissors,
    Search,
    Shuffle,
    Sparkles,
    SquarePlus,
    TextSelect,
    Type,
    Undo2,
    UnfoldVertical,
    Variable,
    Wand2,
} from "lucide-react";
import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {MenuGroups, MenuHeader} from "@/components/context-menu-groups";
import {blockCategories, type CodeBlockTemplate} from "@/lib/code-templates";
import {getIndentSettings, reindentPython} from "@/lib/indent";
import {loadSettings} from "@/lib/settings";
import type {CodeViewerProps} from "@/components/code-viewer-types";
import type {CaseKind} from "@/lib/editor-block-ops";

/**
 * The code viewer's right-click menus, extracted verbatim from
 * code-viewer.tsx (Phase 2b): the edit-mode menu (native clipboard +
 * undo/redo, the line utilities, Insert blocks, Convert Case, the AI
 * group) and the read-only view menu (Run, navigation, selection
 * actions, file utilities, appearance) — same JSX, same handlers,
 * threaded through explicit props so the compiler proves every
 * reference.
 */
export interface CodeViewerContextMenuProps {
    /** True while the editor surface is in edit mode (picks the menu). */
    editMode: boolean;
    /** True while the view-mode body is expanded past the Show-less cut. */
    expanded: boolean;
    /** True while an edit-mode save is in flight (disables Save/Cancel). */
    saving: boolean;
    /** True when the edit buffer has a live (or stashed) selection. */
    editHasSelection: boolean;
    /** True when the file renders as # %% notebook cells. */
    hasCells: boolean;
    /** True when the file is taller than the collapsed preview. */
    isCollapsible: boolean;
    /** The live edit-mode buffer. */
    editContent: string;
    /** The caret's 1-based line (edit mode; titles carry it). */
    caretLine: number;
    /** The selection stashed at right-click time (focus-steal safe). */
    menuSelection: { start: number; end: number } | null;
    /** File-type-aware Insert ▸ block templates. */
    insertBlocks: CodeBlockTemplate[];
    // ── props forwarded from CodeViewerProps (indexed = exact) ──────
    canOpenFolder: CodeViewerProps["canOpenFolder"];
    codeFolding: CodeViewerProps["codeFolding"];
    fileName: CodeViewerProps["fileName"];
    isOpeningFolder: CodeViewerProps["isOpeningFolder"];
    onAiPrompt: CodeViewerProps["onAiPrompt"];
    onGenerateTests: CodeViewerProps["onGenerateTests"];
    onOpenFolder: CodeViewerProps["onOpenFolder"];
    onRunFile: CodeViewerProps["onRunFile"];
    onRunSelection: CodeViewerProps["onRunSelection"];
    onSaveEdit: CodeViewerProps["onSaveEdit"];
    // ── refs owned by the viewer, read by menu handlers ─────────────
    codeBodyRef: React.RefObject<HTMLDivElement | null>;
    editContentRef: React.RefObject<string>;
    onRunSelectionRef: React.RefObject<((code: string) => void) | undefined>;
    savedSelectionRef: React.RefObject<{ start: number; end: number } | null>;
    swapLineDownRef: React.RefObject<() => void>;
    swapLineUpRef: React.RefObject<() => void>;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    // ── setters ─────────────────────────────────────────────────────
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    setMenuSelection: React.Dispatch<React.SetStateAction<{ start: number; end: number } | null>>;
    setShowThemePicker: React.Dispatch<React.SetStateAction<boolean>>;
    // ── shared editor-action callbacks (the same stable identities the
    //    imperative handle and keymap use) ───────────────────────────
    changeAllFn: () => void;
    commentToggleFn: () => void;
    convertCaseFn: (kind: CaseKind) => void;
    copyFilePathFn: () => void;
    copyFilePathWithLineFn: () => void;
    deleteLinesFn: () => void;
    duplicateLineFn: () => void;
    editContextCopy: () => void;
    editContextCut: () => void;
    editContextPaste: () => void;
    editContextRedo: () => void;
    editContextUndo: () => void;
    effectiveEditRange: () => { start: number; end: number } | null;
    foldAllFn: () => void;
    foldCurrentFn: () => void;
    formatDocumentFn: () => void;
    formatSelectionFn: () => void;
    getSelectedTextForAi: () => string;
    handleCancelEdit: () => void;
    handleCopy: () => void;
    handleCopyAsMarkdown: (text: string) => void;
    handleDownload: () => void;
    handleEditChange: (newContent: string) => void;
    handleExtractRefactor: (kind: "function" | "variable") => void;
    handleSaveEdit: (opts?: { keepEditMode?: boolean }) => void;
    handleStartEdit: () => void;
    insertBlockAtCaret: (template: string) => void;
    joinLinesFn: () => void;
    openFindBar: () => void;
    openInlineAi: () => void;
    reverseLinesFn: () => void;
    runSelectionFn: () => void;
    shuffleLinesFn: () => void;
    sortLinesFn: () => void;
    toggleBookmarkFn: () => void;
    trimTrailingFn: () => void;
    unfoldAllFn: () => void;
    uniqueLinesFn: () => void;
    viewAutoIndentFn: () => void;
}

export function CodeViewerContextMenu(props: CodeViewerContextMenuProps) {
    const {
        editMode,
        expanded,
        saving,
        editHasSelection,
        hasCells,
        isCollapsible,
        editContent,
        caretLine,
        menuSelection,
        insertBlocks,
        canOpenFolder,
        codeFolding,
        fileName,
        isOpeningFolder,
        onAiPrompt,
        onGenerateTests,
        onOpenFolder,
        onRunFile,
        onRunSelection,
        onSaveEdit,
        codeBodyRef,
        editContentRef,
        onRunSelectionRef,
        savedSelectionRef,
        swapLineDownRef,
        swapLineUpRef,
        textareaRef,
        setExpanded,
        setMenuSelection,
        setShowThemePicker,
        changeAllFn,
        commentToggleFn,
        convertCaseFn,
        copyFilePathFn,
        copyFilePathWithLineFn,
        deleteLinesFn,
        duplicateLineFn,
        editContextCopy,
        editContextCut,
        editContextPaste,
        editContextRedo,
        editContextUndo,
        effectiveEditRange,
        foldAllFn,
        foldCurrentFn,
        formatDocumentFn,
        formatSelectionFn,
        getSelectedTextForAi,
        handleCancelEdit,
        handleCopy,
        handleCopyAsMarkdown,
        handleDownload,
        handleEditChange,
        handleExtractRefactor,
        handleSaveEdit,
        handleStartEdit,
        insertBlockAtCaret,
        joinLinesFn,
        openFindBar,
        openInlineAi,
        reverseLinesFn,
        runSelectionFn,
        shuffleLinesFn,
        sortLinesFn,
        toggleBookmarkFn,
        trimTrailingFn,
        unfoldAllFn,
        uniqueLinesFn,
        viewAutoIndentFn,
    } = props;
    return (
        <>
            {editMode ? (
                /* Edit-mode right-click menu: native clipboard/undo actions
                   (so replacing the browser's menu loses nothing) + the
                   file-type-aware "Insert block" submenu — the same items as
                   the toolbar's Insert dropdown. */
                <ContextMenuContent
                    className="w-64"
                    onCloseAutoFocus={(e) => {
                        // the menu is closing — hand focus and the
                        // selection back to the textarea so the native blue
                        // highlight returns the instant the menu disappears
                        // (Radix's focus trap is what blanked it on open).
                        e.preventDefault();
                        setMenuSelection(null);
                        const ta = textareaRef.current;
                        const stash = savedSelectionRef.current;
                        if (ta) {
                            ta.focus();
                            if (stash && stash.start !== stash.end) {
                                ta.setSelectionRange(
                                    Math.min(stash.start, editContentRef.current.length),
                                    Math.min(stash.end, editContentRef.current.length)
                                );
                            }
                        }
                        savedSelectionRef.current = null;
                    }}
                >
                    {/* The EDIT menu is data-driven: MenuGroups renders the
          canonical editor-edit order for python (navigate, file,
          format, run, runselection, refactor, edit, fold, ai,
          clipboard, insertblock) with the standardized fileName
          header — the Python VIEW mode layout is the master. */}
                    <MenuHeader name={fileName} title={fileName}/>
                    <MenuGroups
                        kind="python"
                        surface="editor-edit"
                        groups={{
                            // ── Navigate ▸ — find, jump, bookmark. ──
                            navigate: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Find, jump to a line or symbol, toggle a bookmark">
                                        <ArrowDownToLine className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Navigate</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem onClick={() => openFindBar()} className="gap-2 cursor-pointer"
                                                         title="Find in this file (Ctrl+F) — prefills with the current selection">
                                            <Search className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Find…</span>
                                            <span className="text-[10px] text-muted-foreground">Ctrl+F</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:goto-line-dialog"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the Go to line dialog and jump to a line number"
                                        >
                                            <ArrowDownToLine className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Go To Line…</span>
                                            <span className="text-[10px] text-muted-foreground">⌃G</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:goto-symbol"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the Goto Symbol palette — jump to a function, class, or block in this file (⌘R)"
                                        >
                                            <FunctionSquare className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Goto Symbol…</span>
                                            <span className="text-[10px] text-muted-foreground">⌘R</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={toggleBookmarkFn} className="gap-2 cursor-pointer"
                                                         title="Toggle a bookmark on the caret's line — list and jump via Run & Go ▸ Bookmarks…">
                                            <Bookmark className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Toggle Bookmark</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // File ▸ — save, mode switch, new-from-selection, split,
                            // containing folder.
                            file: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Save, switch modes, open in split view, open the containing folder">
                                        <Save className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span className="flex-1">File</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem onClick={() => void handleSaveEdit()} disabled={saving}
                                                         className="gap-2 cursor-pointer"
                                                         title="Save the edited file to disk">
                                            <Save className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">{saving ? "Saving…" : "Save"}</span>
                                            <span className="text-[10px] text-muted-foreground">Ctrl+S</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={handleCancelEdit} disabled={saving}
                                                         className="gap-2 cursor-pointer"
                                                         title="Discard edits and return to the read-only view">
                                            <BookOpen className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Switch To View Mode</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                // Stash-aware — the menu's focus steal can collapse
                                                // the live selection.
                                                const effective = effectiveEditRange();
                                                const sel = effective ? editContent.slice(effective.start, effective.end) : "";
                                                if (sel.trim()) {
                                                    window.dispatchEvent(
                                                        new CustomEvent("praxis:new-file-from-selection", {
                                                            detail: {code: sel},
                                                        })
                                                    );
                                                }
                                            }}
                                            disabled={!editHasSelection}
                                            className="gap-2 cursor-pointer"
                                            title={editHasSelection ? "Create a NEW .py file whose content is the selected code — asks for folder + name" : "Select some text first"}
                                        >
                                            <FilePlus2 className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">New File From Selection…</span>
                                        </ContextMenuItem>
                                        <ContextMenuSeparator/>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new Event("praxis:split-editor"))}
                                            className="gap-2 cursor-pointer"
                                            title="Show this file side-by-side in the read-only split pane (Ctrl+\\ toggles it back)"
                                        >
                                            <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Open In Split View</span>
                                        </ContextMenuItem>
                                        {/* ── Edit-mode parity with the view menu's File ▸ group (download / reveal / local history work the same while editing — history snapshots every save). */}
                                        <ContextMenuItem onClick={handleDownload} className="gap-2 cursor-pointer"
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
                                        {onOpenFolder && (
                                            <ContextMenuItem onClick={onOpenFolder}
                                                             disabled={!canOpenFolder || isOpeningFolder}
                                                             className="gap-2 cursor-pointer"
                                                             title="Open the containing folder in your OS file explorer">
                                                <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>
                                                <span className="flex-1">Open Containing Folder</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Format ▸ — Auto-indent, Format Document / Selection.
                            format: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Auto-indent, Format Document, Format Selection">
                                        <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Format</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => {
                                                const converted = reindentPython(editContent, getIndentSettings(loadSettings()));
                                                if (converted !== editContent) {
                                                    handleEditChange(converted);
                                                }
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Re-indent every line to its Python block level in the configured unit (Settings → Editor → Indentation) — removes stray extra indentation"
                                        >
                                            <IndentIncrease className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Auto-Indent File</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => void formatDocumentFn()}
                                                         className="gap-2 cursor-pointer"
                                                         title="Format the whole file with black/ruff (⌘⇧F)">
                                            <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                            <span className="flex-1">Format Document</span>
                                            <span className="text-[10px] text-muted-foreground">⌘⇧F</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => void formatSelectionFn()}
                                            disabled={!editHasSelection}
                                            className="gap-2 cursor-pointer"
                                            title={editHasSelection ? "Format ONLY the selected text (black/ruff) and splice it back in" : "Select some text first"}
                                        >
                                            <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                            <span className="flex-1">Format Selection</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Run ▸ — ONE runner submenu for the whole file AND the
                            // selection
                            // the py file edit?" — the old direct Run item + the Run ▸
                            // selection submenu both carried the label "Run"). Both
                            // entries now live in a SINGLE Run ▸ submenu.
                            run: () => onRunFile || onRunSelection ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Run the whole file or just the selection">
                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span className="flex-1">Run</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        {onRunFile && (
                                            <ContextMenuItem onClick={onRunFile} className="gap-2 cursor-pointer"
                                                             title="Run this whole file now — output streams to the panel below (same as the toolbar Run button)">
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Run File</span>
                                                <span className="text-[10px] text-muted-foreground">⌘↵</span>
                                            </ContextMenuItem>
                                        )}
                                        {onRunSelection && (
                                            <ContextMenuItem
                                                onClick={() => runSelectionFn()}
                                                className="gap-2 cursor-pointer"
                                                title={editHasSelection ? "Run the SELECTED lines in Python — output streams to the panel below (⌘⇧↵)" : "No selection — runs the caret's current LINE in Python (⌘⇧↵)"}
                                            >
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Run Selection In Python</span>
                                                <span className="text-[10px] text-muted-foreground">⌘⇧↵</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // Refactor ▸ — rename / definition / usages / extracts.
                            refactor: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Rename, jump to definition, find usages, change all occurrences">
                                        <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Refactor</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:rename-symbol"))}
                                            className="gap-2 cursor-pointer"
                                            title="Rename the symbol under the caret (word-boundary replace across the whole project)"
                                        >
                                            <Pencil className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Rename Symbol…</span>
                                            <span className="text-[10px] text-muted-foreground">⇧F6</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:goto-declaration"))}
                                            className="gap-2 cursor-pointer"
                                            title="Jump to the def/class of the symbol under the caret (searches the whole project)"
                                        >
                                            <FunctionSquare className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Go To Definition</span>
                                            <span className="text-[10px] text-muted-foreground">⌘⇧B</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:find-usages"))}
                                            className="gap-2 cursor-pointer"
                                            title="Find every occurrence of the symbol across the project"
                                        >
                                            <Regex className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Find Usages…</span>
                                            <span className="text-[10px] text-muted-foreground">⌥F7</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => changeAllFn()}
                                            className="gap-2 cursor-pointer"
                                            title="Select the word under the caret and open Find &amp; Replace prefilled with it — replace every occurrence in this file"
                                        >
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Change All Occurrences…</span>
                                        </ContextMenuItem>
                                        {/* <ContextMenuSeparator /> deterministic extract refactors — pure text transforms (lib/refactor.ts), no AI, no network. The selection becomes a new def/assignment and its old spot becomes a call/name reference. */}
                                        <ContextMenuItem
                                            onClick={() => handleExtractRefactor("function")}
                                            disabled={!editHasSelection && !savedSelectionRef.current}
                                            className="gap-2 cursor-pointer"
                                            title="Move the selected code into a new function def (deterministic, no AI) and replace it with a call"
                                        >
                                            <Scissors className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Extract Function…</span>
                                            <span className="text-[10px] text-muted-foreground">⌥⌘M</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => handleExtractRefactor("variable")}
                                            disabled={!editHasSelection && !savedSelectionRef.current}
                                            className="gap-2 cursor-pointer"
                                            title="Assign the selected expression to a new variable on the line above and replace it with the name"
                                        >
                                            <Variable className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Extract Variable…</span>
                                            <span className="text-[10px] text-muted-foreground">⌥⌘V</span>
                                        </ContextMenuItem>
                                        {/* Tier-2 refactors — the palette covers the AST
              rewrites (inline / move symbol / change signature /
              loop ⇄ comprehension / organize imports). */}
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="AST refactor toolkit — inline, move, change signature, comprehensions, imports">
                                                <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                <span className="flex-1">More Refactors…</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-60">
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Open the refactor palette (Ctrl+Shift+R) — every AST transform with a preview and apply"
                                                >
                                                    <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                    <span className="flex-1">Refactor Palette…</span>
                                                    <span className="text-[10px] text-muted-foreground">⌃⇧R</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette", {detail: {transform: "organize_imports"}}))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Group + sort imports (stdlib / third-party / local) and remove the unused ones"
                                                >
                                                    <ListTree className="size-3.5 text-cyan-500 shrink-0"/>
                                                    <span className="flex-1">Organize Imports</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette", {detail: {transform: "inline_variable"}}))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Inline the variable assignment at the caret (all usages replaced)"
                                                >
                                                    <Merge className="size-3.5 text-sky-500 shrink-0"/>
                                                    <span className="flex-1">Inline Variable…</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette", {detail: {transform: "move_symbol"}}))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Move the def/class under the caret to another module — imports rewritten everywhere"
                                                >
                                                    <FilePlus2 className="size-3.5 text-emerald-500 shrink-0"/>
                                                    <span className="flex-1">Move Symbol To Module…</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette", {detail: {transform: "change_signature"}}))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Add / remove / reorder parameters across every call site"
                                                >
                                                    <Columns2 className="size-3.5 text-amber-500 shrink-0"/>
                                                    <span className="flex-1">Change Signature…</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-refactor-palette", {detail: {transform: "loop_to_comprehension"}}))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Convert the for-loop at the caret into a comprehension (and back)"
                                                >
                                                    <ArrowDownAZ className="size-3.5 text-violet-500 shrink-0"/>
                                                    <span className="flex-1">Loop ⇄ Comprehension</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-docstring-studio"))}
                                                    className="gap-2 cursor-pointer"
                                                    title="Generate or repair the docstring for the def/class at the caret (Google / NumPy / Sphinx styles, AI enrichment)"
                                                >
                                                    <BookOpen className="size-3.5 text-indigo-500 shrink-0"/>
                                                    <span className="flex-1">Docstring Studio…</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Inspect ▸ — the Python inspection trio straight from the
                            // code: AST tree, bytecode disassembly, property tests.
                            inspect: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Inspect this file — the AST tree, the bytecode, property-based tests">
                                        <Network className="size-3.5 text-cyan-500 shrink-0"/>
                                        <span className="flex-1">Inspect</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-ast-explorer"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the AST Explorer — the file's syntax tree with clickable node-to-source highlights (Tools ▸ AST Explorer)"
                                        >
                                            <Network className="size-3.5 text-cyan-500 shrink-0"/>
                                            <span className="flex-1">AST Explorer…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-bytecode"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the Bytecode Inspector — dis output side-by-side with the source, with a bytecode diff mode (Tools ▸ Bytecode Inspector)"
                                        >
                                            <Binary className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Show Bytecode…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-hypothesis"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the Property tests workbench — scaffold @given strategies from this file's defs, run with shrink analysis (Tests panel ▸ Property tests)"
                                        >
                                            <FlaskConical className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Generate Property Tests…</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Edit ▸ (undo/redo, clipboard, line utilities).
                            edit: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Undo / redo, clipboard, comment, duplicate, move lines, convert case, trim whitespace">
                                        <Type className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Edit</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem onClick={editContextUndo} className="gap-2 cursor-pointer"
                                                         title="Undo the last edit">
                                            <Undo2 className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Undo</span>
                                            <span className="text-[10px] text-muted-foreground">Ctrl+Z</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={editContextRedo} className="gap-2 cursor-pointer"
                                                         title="Redo the last undone edit">
                                            <Redo2 className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Redo</span>
                                            <span className="text-[10px] text-muted-foreground">Ctrl+Y</span>
                                        </ContextMenuItem>
                                        <ContextMenuSeparator/>
                                        <ContextMenuItem onClick={editContextCut} className="gap-2 cursor-pointer"
                                                         title="Cut the selection">
                                            <Scissors className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Cut</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={editContextCopy} className="gap-2 cursor-pointer"
                                                         title="Copy the selection">
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                const range = menuSelection ?? savedSelectionRef.current;
                                                const text = range ? editContent.slice(range.start, range.end) : "";
                                                void handleCopyAsMarkdown(text);
                                            }}
                                            disabled={!editHasSelection}
                                            className="gap-2 cursor-pointer"
                                            title={editHasSelection ? "Copy the selected lines wrapped in a fenced Markdown code block (```python … ```) — paste straight into a README or issue" : "Select some text first"}
                                        >
                                            <Braces className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy As Markdown Block</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => void editContextPaste()}
                                                         className="gap-2 cursor-pointer"
                                                         title="Paste from the clipboard at the caret">
                                            <ClipboardPaste className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Paste</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => {
                                                const ta = textareaRef.current;
                                                if (ta) {
                                                    ta.focus();
                                                    ta.select();
                                                }
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Select the entire buffer (Ctrl+A)"
                                        >
                                            <TextSelect className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Select All</span>
                                            <span className="text-[10px] text-muted-foreground">Ctrl+A</span>
                                        </ContextMenuItem>
                                        {/* <ContextMenuSeparator /> ── Lines ▸ — the line utilities (one nested submenu keeps the Edit list short: no 25-row wall). ── */}
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Move / delete / join / sort the caret's or the selected lines">
                                                <ChevronDown className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">Lines</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem onClick={() => commentToggleFn()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Toggle # comments on the selected lines (or the caret's line)">
                                                    <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Toggle Comment</span>
                                                    <span className="text-[10px] text-muted-foreground">⌘/</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => duplicateLineFn()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Duplicate the current line (or every selected line)">
                                                    <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Duplicate Line</span>
                                                    <span className="text-[10px] text-muted-foreground">⇧⌥↓</span>
                                                </ContextMenuItem>
                                                <ContextMenuSeparator/>
                                                <ContextMenuItem onClick={() => swapLineUpRef.current()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Move the current line (or selection) up">
                                                    <ChevronUp className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Move Line Up</span>
                                                    <span className="text-[10px] text-muted-foreground">⌘⇧↑</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => swapLineDownRef.current()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Move the current line (or selection) down">
                                                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Move Line Down</span>
                                                    <span className="text-[10px] text-muted-foreground">⌘⇧↓</span>
                                                </ContextMenuItem>
                                                <ContextMenuSeparator/>
                                                <ContextMenuItem onClick={() => deleteLinesFn()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Delete the caret's line — or every selected line">
                                                    <Delete className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Delete Line</span>
                                                    <span className="text-[10px] text-muted-foreground">⌘⌫</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => joinLinesFn()}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Join the caret's line with the next (or join every selected line into one)">
                                                    <Merge className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Join Lines</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => sortLinesFn()}
                                                                 disabled={!editHasSelection}
                                                                 className="gap-2 cursor-pointer"
                                                                 title={editHasSelection ? "Sort the selected lines alphabetically" : "Select multiple lines first"}>
                                                    <ArrowDownAZ className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Sort Selected Lines</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => uniqueLinesFn()}
                                                                 disabled={!editHasSelection}
                                                                 className="gap-2 cursor-pointer"
                                                                 title={editHasSelection ? "Remove duplicate lines from the selection (first occurrence wins, blank lines kept)" : "Select multiple lines first"}>
                                                    <CopyMinus className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Unique Lines</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => reverseLinesFn()}
                                                                 disabled={!editHasSelection}
                                                                 className="gap-2 cursor-pointer"
                                                                 title={editHasSelection ? "Reverse the order of the selected lines" : "Select multiple lines first"}>
                                                    <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Reverse Lines</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => shuffleLinesFn()}
                                                                 disabled={!editHasSelection}
                                                                 className="gap-2 cursor-pointer"
                                                                 title={editHasSelection ? "Shuffle the selected lines into a random order (great for quiz/flashcard data)" : "Select multiple lines first"}>
                                                    <Shuffle className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Shuffle Lines</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                        {/* ── Convert Case ▸ — the eight case styles. ── */}
                                        <ContextMenuSub>
                                            <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                                   title="Convert the selection (or the word at the caret) to another case style">
                                                <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">Convert Case</span>
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="w-56">
                                                <ContextMenuItem onClick={() => convertCaseFn("upper")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to UPPERCASE">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">UPPERCASE</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("lower")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to lowercase">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">lowercase</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("title")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to Title Case">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">Title Case</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("camel")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to camelCase">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">camelCase</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("pascal")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to PascalCase">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">PascalCase</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("snake")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to snake_case">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">snake_case</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("kebab")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to kebab-case">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">kebab-case</span>
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => convertCaseFn("constant")}
                                                                 className="gap-2 cursor-pointer"
                                                                 title="Convert the selection (or word at the caret) to CONSTANT_CASE">
                                                    <Type className="size-3.5 text-muted-foreground shrink-0"/>
                                                    <span className="flex-1">CONSTANT_CASE</span>
                                                </ContextMenuItem>
                                            </ContextMenuSubContent>
                                        </ContextMenuSub>
                                        <ContextMenuSeparator/>
                                        <ContextMenuItem onClick={() => trimTrailingFn()}
                                                         className="gap-2 cursor-pointer"
                                                         title="Remove trailing whitespace from every line in the file">
                                            <Eraser className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Trim Trailing Whitespace</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Fold ▸ — fold / unfold blocks.
                            fold: () => codeFolding ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Fold or unfold code blocks">
                                        <FoldVertical className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Fold</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem onClick={() => foldCurrentFn()}
                                                         className="gap-2 cursor-pointer"
                                                         title="Fold (or unfold) the innermost def/class block containing the caret">
                                            <FoldVertical className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Fold Current Block</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => foldAllFn()} className="gap-2 cursor-pointer"
                                                         title="Fold every def/class block in the file">
                                            <FoldVertical className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Fold All</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => unfoldAllFn()} className="gap-2 cursor-pointer"
                                                         title="Unfold every block in the file">
                                            <UnfoldVertical className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Unfold All</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // AI ▸ (selection-aware).
                            ai: () => (onAiPrompt || onGenerateTests) ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Explain, improve, document, or test the selected code with the integrated AI">
                                        <Sparkles className="size-3.5 text-amber-500 shrink-0"/>
                                        <span className="flex-1">AI</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => openInlineAi()}
                                            className="gap-2 cursor-pointer"
                                            title="Open the inline Edit-with-AI card anchored at the selection — ask for a change, preview the answer, apply it over the selection with one Ctrl+Z undo step"
                                        >
                                            <Sparkles className="size-3.5 text-indigo-500 shrink-0"/>
                                            <span className="flex-1">Edit with AI…</span>
                                            <span className="text-[10px] text-muted-foreground">Ctrl+I</span>
                                        </ContextMenuItem>
                                        {onAiPrompt && (
                                            <ContextMenuItem
                                                onClick={() => onAiPrompt(`Explain this Python code${editHasSelection ? " (the selected part)" : ""} step by step:\n\n\`\`\`python\n${getSelectedTextForAi()}\n\`\`\`\n\nWhat does it do, and are there any bugs or edge cases I should know about?`)}
                                                className="gap-2 cursor-pointer"
                                                title="Send the selection (or the whole file) to the AI chat with an explain prompt"
                                            >
                                                <Sparkles className="size-3.5 text-amber-500 shrink-0"/>
                                                <span className="flex-1">Explain Selection</span>
                                            </ContextMenuItem>
                                        )}
                                        {onAiPrompt && (
                                            <ContextMenuItem
                                                onClick={() => onAiPrompt(`Improve this Python code${editHasSelection ? " (the selected part)" : ""}:\n\n\`\`\`python\n${getSelectedTextForAi()}\n\`\`\`\n\nRewrite it cleaner and more Pythonic. Keep the behavior identical; show only the improved code plus a short list of what changed.`)}
                                                className="gap-2 cursor-pointer"
                                                title="Ask the AI to rewrite the selection (or file) cleaner — same behavior"
                                            >
                                                <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                                <span className="flex-1">Improve Code</span>
                                            </ContextMenuItem>
                                        )}
                                        {onAiPrompt && (
                                            <ContextMenuItem
                                                onClick={() => onAiPrompt(`Simplify this Python code${editHasSelection ? " (the selected part)" : ""}:\n\n\`\`\`python\n${getSelectedTextForAi()}\n\`\`\`\n\nReduce its complexity while keeping the behavior EXACTLY the same: fewer branches, simpler expressions, no clever tricks. Show only the simplified code plus a one-line note per meaningful change.`)}
                                                className="gap-2 cursor-pointer"
                                                title="Ask the AI to reduce the code's complexity — same behavior, simpler logic"
                                            >
                                                <Minimize2 className="size-3.5 text-teal-500 shrink-0"/>
                                                <span className="flex-1">Simplify</span>
                                            </ContextMenuItem>
                                        )}
                                        {onAiPrompt && (
                                            <ContextMenuItem
                                                onClick={() => onAiPrompt(`Write a NumPy-style docstring for this code${editHasSelection ? " (the selected function)" : ""}:\n\n\`\`\`python\n${getSelectedTextForAi()}\n\`\`\`\n\nReturn ONLY the completed code with the docstring added.`)}
                                                className="gap-2 cursor-pointer"
                                                title="Ask the AI to add a docstring to the selection"
                                            >
                                                <FileText className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Generate Docstring</span>
                                            </ContextMenuItem>
                                        )}
                                        {onAiPrompt && (
                                            <ContextMenuItem
                                                onClick={() => onAiPrompt(`Add type hints to this Python code${editHasSelection ? " (the selected part)" : ""}:\n\n\`\`\`python\n${getSelectedTextForAi()}\n\`\`\`\n\nAnnotate parameters, return types and local variables where the types are unambiguous (infer from literals, operations and calls; skip Any). Keep the behavior EXACTLY the same. Return ONLY the fully annotated code.`)}
                                                className="gap-2 cursor-pointer"
                                                title="Ask the AI to annotate the selection (or file) with type hints — same behavior, inferred types only"
                                            >
                                                <Braces className="size-3.5 text-cyan-500 shrink-0"/>
                                                <span className="flex-1">Add Type Hints</span>
                                            </ContextMenuItem>
                                        )}
                                        {onGenerateTests && (
                                            <ContextMenuItem
                                                onClick={onGenerateTests}
                                                className="gap-2 cursor-pointer"
                                                title="Generate pytest test cases for this file (opens the test preview dialog)"
                                            >
                                                <FlaskConical className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Generate Tests</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // Clipboard ▸ — the file-level copy flavors (the
                            // separator before it is canonical).
                            clipboard: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Copy the file name, its absolute path, or the path with the caret's line">
                                        <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span className="flex-1">Clipboard</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem
                                            onClick={() => void navigator.clipboard.writeText(fileName.replace(/\.[^.]+$/, ""))}
                                            className="gap-2 cursor-pointer"
                                            title="Copy the file name without its path or extension — QuickSort.py → QuickSort"
                                        >
                                            <FileType2 className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy File Name</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => void copyFilePathFn()}
                                                         className="gap-2 cursor-pointer"
                                                         title="Copy this file's absolute filesystem path (server-side) to the clipboard">
                                            <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy File Path</span>
                                        </ContextMenuItem>
                                        {editMode && (
                                            <ContextMenuItem onClick={() => void copyFilePathWithLineFn()}
                                                             className="gap-2 cursor-pointer"
                                                             title={`Copy the absolute path plus the caret's line number — …:${caretLine}`}>
                                                <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">Copy Path With Line</span>
                                                <span className="text-[10px] text-muted-foreground">:{caretLine}</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Insert Block ▸ — the styled block inserts.
                            insertblock: () => insertBlocks.length > 0 ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Insert a styled code block at the cursor">
                                        <SquarePlus className="size-3.5 text-emerald-500"/>
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
                /* Read-only view menu (mirrors the edit-mode menu's
                   structure — also what the cell view and the large-file
                   fallback show now that the trigger covers the whole
                   viewport).
             grew from 6 items to a full menu — navigation
                   (Go to Line / Goto Symbol / Find), selection actions
                   (Copy selection / Copy all / Select all), file utilities
                   (Download / Reveal in Explorer / Local history / Open
                   containing folder / Copy file path) and the appearance
                   group (Code theme / Collapse). */
                <ContextMenuContent className="w-60">
                    {/* The VIEW menu is data-driven off the SAME spec — the
            Python view layout IS the master template. */}
                    <MenuHeader name={fileName} title={fileName}/>
                    <MenuGroups
                        kind="python"
                        surface="editor-view"
                        groups={{
                            // Run ▸ — ONE runner submenu (whole file + the view-mode
                            // selection), the double-Run fix mirroring the edit menu.
                            run: () => onRunFile || onRunSelection ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Run the whole file or the selected lines">
                                        <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                        <span className="flex-1">Run</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        {onRunFile && (
                                            <ContextMenuItem onClick={onRunFile} className="gap-2 cursor-pointer"
                                                             title="Run this whole file now — output streams to the panel below (same as the toolbar Run button)">
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Run File</span>
                                                <span className="text-[10px] text-muted-foreground">⌘↵</span>
                                            </ContextMenuItem>
                                        )}
                                        {onRunSelection && (
                                            <ContextMenuItem
                                                onClick={() => {
                                                    const sel = window.getSelection();
                                                    const text = sel ? sel.toString() : "";
                                                    if (text.trim()) onRunSelectionRef.current?.(text);
                                                }}
                                                className="gap-2 cursor-pointer"
                                                title="Run the SELECTED lines (the highlighted text) in Python — output streams to the panel below"
                                            >
                                                <Play className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Run Selection In Python</span>
                                                <span className="text-[10px] text-muted-foreground">⌘⇧↵</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // Edit File — the mode switch leads the view menu.
                            editfile: () => onSaveEdit ? (
                                <ContextMenuItem onClick={handleStartEdit} className="gap-2 cursor-pointer"
                                                 title="Switch to edit mode (inline textarea editor with the same theme)">
                                    <Pencil className="size-3.5 text-emerald-500 shrink-0"/>
                                    <span className="flex-1">Edit File</span>
                                    <span className="text-[10px] text-muted-foreground">E</span>
                                </ContextMenuItem>
                            ) : null,
                            // AI — the master template's top-level "Explain Selection
                            // With AI…" item, riding its canonical group now — joined
                            // by the INLINE "Edit with AI…" card opener (view mode:
                            // anchored at the caret line, browser selection as
                            // context; the card is draggable by its header).
                            ai: () => onAiPrompt ? (
                                <>
                                    <ContextMenuItem
                                        onClick={() => openInlineAi()}
                                        className="gap-2 cursor-pointer"
                                        title="Open the inline Edit-with-AI card at the caret line — ask about the selection, drag the card anywhere"
                                    >
                                        <Sparkles className="size-3.5 text-indigo-500 shrink-0"/>
                                        <span className="flex-1">Edit with AI…</span>
                                        <span className="text-[10px] text-muted-foreground">Ctrl+I</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => {
                                            const sel = window.getSelection();
                                            const text = sel ? sel.toString().trim() : "";
                                            if (text) onAiPrompt?.(text);
                                        }}
                                        className="gap-2 cursor-pointer"
                                        title="Send the selected lines to the AI chat sidebar with a request to explain them"
                                    >
                                        <Sparkles className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Explain Selection With AI…</span>
                                    </ContextMenuItem>
                                    <ContextMenuItem
                                        onClick={() => {
                                            const sel = window.getSelection();
                                            const text = sel ? sel.toString().trim() : "";
                                            if (text) {
                                                onAiPrompt?.(`Simplify this Python code:\n\n\`\`\`python\n${text}\n\`\`\`\n\nReduce its complexity while keeping the behavior EXACTLY the same: fewer branches, simpler expressions, no clever tricks. Show only the simplified code plus a one-line note per meaningful change.`);
                                            }
                                        }}
                                        className="gap-2 cursor-pointer"
                                        title="Ask the AI to reduce the selected lines' complexity — same behavior, simpler logic"
                                    >
                                        <Minimize2 className="size-3.5 text-teal-500 shrink-0"/>
                                        <span className="flex-1">Simplify Selection With AI…</span>
                                    </ContextMenuItem>
                                </>
                            ) : null,
                            // Navigate — the Python editor keeps its top-level Find…
                            // twin (the master layout) + the Navigate ▸ submenu.
                            navigate: () => (
                                <>
                                    <ContextMenuItem onClick={() => openFindBar()} className="gap-2 cursor-pointer"
                                                     title="Find in this file (Ctrl+F) — prefills with the current selection">
                                        <Search className="size-3.5 text-sky-500 shrink-0"/>
                                        <span className="flex-1">Find…</span>
                                        <span className="text-[10px] text-muted-foreground">Ctrl+F</span>
                                    </ContextMenuItem>
                                    <ContextMenuSub>
                                        <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                               title="Find, jump, bookmark, split view, and Select all">
                                            <ArrowDownToLine className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Navigate</span>
                                        </ContextMenuSubTrigger>
                                        <ContextMenuSubContent className="w-56">
                                            <ContextMenuItem onClick={() => openFindBar()}
                                                             className="gap-2 cursor-pointer"
                                                             title="Find in this file (Ctrl+F) — prefills with the current selection">
                                                <Search className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Find…</span>
                                                <span className="text-[10px] text-muted-foreground">Ctrl+F</span>
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:goto-line-dialog"))}
                                                className="gap-2 cursor-pointer"
                                                title="Open the Go to line dialog and jump to a line number"
                                            >
                                                <ArrowDownToLine className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Go To Line…</span>
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                onClick={() => window.dispatchEvent(new CustomEvent("praxis:goto-symbol"))}
                                                className="gap-2 cursor-pointer"
                                                title="Open the Goto Symbol palette — jump to a function, class, or block in this file (⌘R)"
                                            >
                                                <FunctionSquare className="size-3.5 text-emerald-500 shrink-0"/>
                                                <span className="flex-1">Goto Symbol…</span>
                                            </ContextMenuItem>
                                            {/* ── view-mode bookmark — toggles on the last caret line the editor reported. ── */}
                                            <ContextMenuItem onClick={toggleBookmarkFn} className="gap-2 cursor-pointer"
                                                             title="Toggle a bookmark on the current line — list and jump via Run & Go ▸ Bookmarks…">
                                                <Bookmark className="size-3.5 text-amber-500 shrink-0"/>
                                                <span className="flex-1">Toggle Bookmark</span>
                                            </ContextMenuItem>
                                            {/* ── split-view twin. ── */}
                                            <ContextMenuItem
                                                onClick={() => window.dispatchEvent(new Event("praxis:split-editor"))}
                                                className="gap-2 cursor-pointer"
                                                title="Show this file side-by-side in the read-only split pane (Ctrl+\\ toggles it back)"
                                            >
                                                <Columns2 className="size-3.5 text-sky-500 shrink-0"/>
                                                <span className="flex-1">Open In Split View</span>
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                onClick={() => {
                                                    const body = codeBodyRef.current;
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
                                                title="Select the whole code body (then Copy selection, or let Find prefill from it)"
                                            >
                                                <TextSelect className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span className="flex-1">Select All</span>
                                            </ContextMenuItem>
                                        </ContextMenuSubContent>
                                    </ContextMenuSub>
                                </>
                            ),
                            // Format ▸ — view-mode parity with the editor's Format
                            // submenu (both actions switch to the editor seeded with
                            // the result).
                            format: () => onSaveEdit ? (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Auto-indent, Format Document (both switch to the editor with the result — Ctrl+Z undoes)">
                                        <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Format</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => void formatDocumentFn()}
                                            className="gap-2 cursor-pointer"
                                            title="Format this file with black/ruff — switches to the editor seeded with the formatted text (⌘⇧F)"
                                        >
                                            <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                            <span className="flex-1">Format Document</span>
                                            <span className="text-[10px] text-muted-foreground">⌘⇧F</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => viewAutoIndentFn()}
                                            className="gap-2 cursor-pointer"
                                            title="Re-indent every line to its Python block level in the configured unit — switches to the editor with the re-indented text"
                                        >
                                            <IndentIncrease className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Auto-Indent File</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>
                            ) : null,
                            // runselection — FOLDED into the Run ▸ submenu above (the
                            // double-Run fix); this group intentionally renders nothing.
                            runselection: () => null,
                            // Refactor ▸ — the navigation-grade refactors work in
                            // view mode too (the symbol comes from the browser's
                            // text selection over the highlighted code).
                            refactor: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Rename, jump to definition, find usages">
                                        <Wand2 className="size-3.5 text-violet-500 shrink-0"/>
                                        <span className="flex-1">Refactor</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:rename-symbol"))}
                                            className="gap-2 cursor-pointer"
                                            title="Rename the selected symbol (word-boundary replace across the whole project)"
                                        >
                                            <Pencil className="size-3.5 text-sky-500 shrink-0"/>
                                            <span className="flex-1">Rename Symbol…</span>
                                            <span className="text-[10px] text-muted-foreground">⇧F6</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:goto-declaration"))}
                                            className="gap-2 cursor-pointer"
                                            title="Jump to the def/class of the selected symbol (searches the whole project)"
                                        >
                                            <FunctionSquare className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Go To Definition</span>
                                            <span className="text-[10px] text-muted-foreground">⌘⇧B</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:find-usages"))}
                                            className="gap-2 cursor-pointer"
                                            title="Find every occurrence of the selected symbol across the project"
                                        >
                                            <Regex className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Find Usages…</span>
                                            <span className="text-[10px] text-muted-foreground">⌥F7</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Inspect ▸ — the Python inspection trio works in view
                            // mode too (same dialogs the Tools menu opens).
                            inspect: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Inspect this file — the AST tree, the bytecode, property-based tests">
                                        <Network className="size-3.5 text-cyan-500 shrink-0"/>
                                        <span className="flex-1">Inspect</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-ast-explorer"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the AST Explorer — the file's syntax tree with clickable node-to-source highlights (Tools ▸ AST Explorer)"
                                        >
                                            <Network className="size-3.5 text-cyan-500 shrink-0"/>
                                            <span className="flex-1">AST Explorer…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-bytecode"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the Bytecode Inspector — dis output side-by-side with the source, with a bytecode diff mode (Tools ▸ Bytecode Inspector)"
                                        >
                                            <Binary className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">Show Bytecode…</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            onClick={() => window.dispatchEvent(new CustomEvent("praxis:open-hypothesis"))}
                                            className="gap-2 cursor-pointer"
                                            title="Open the Property tests workbench — scaffold @given strategies from this file's defs, run with shrink analysis (Tests panel ▸ Property tests)"
                                        >
                                            <FlaskConical className="size-3.5 text-amber-500 shrink-0"/>
                                            <span className="flex-1">Generate Property Tests…</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // Clipboard ▸ — Copy selection / Markdown block / all /
                            // file name / file path (the separator before it is the
                            // canonical one).
                            clipboard: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Copy the selection, a fenced Markdown block, the whole file, its name, or its absolute path">
                                        <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span className="flex-1">Clipboard</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem
                                            onClick={() => {
                                                const sel = window.getSelection();
                                                const text = sel ? sel.toString() : "";
                                                if (text) {
                                                    void navigator.clipboard.writeText(text);
                                                }
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Copy the text currently selected in the view (works on the highlighted code)"
                                        >
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy Selection</span>
                                        </ContextMenuItem>
                                        {/* selection → fenced Markdown block, and → AI chat. Both act on the live view-mode selection. */}
                                        <ContextMenuItem
                                            onClick={() => {
                                                const sel = window.getSelection();
                                                void handleCopyAsMarkdown(sel ? sel.toString() : "");
                                            }}
                                            className="gap-2 cursor-pointer"
                                            title="Copy the selected lines wrapped in a fenced Markdown code block (```python … ```) — paste straight into a README or issue"
                                        >
                                            <Braces className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy As Markdown Block</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={handleCopy} className="gap-2 cursor-pointer"
                                                         title="Copy the entire file contents to the clipboard">
                                            <Copy className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy All</span>
                                        </ContextMenuItem>
                                        {/* Copy file NAME (no path, no extension) — matches the tree's Clipboard ▸ additions. */}
                                        <ContextMenuItem
                                            onClick={() => void navigator.clipboard.writeText(fileName.replace(/\.[^.]+$/, ""))}
                                            className="gap-2 cursor-pointer"
                                            title="Copy the file name without its path or extension — QuickSort.py → QuickSort"
                                        >
                                            <FileType2 className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy File Name</span>
                                        </ContextMenuItem>
                                        <ContextMenuItem onClick={() => void copyFilePathFn()}
                                                         className="gap-2 cursor-pointer"
                                                         title="Copy this file's absolute filesystem path (server-side) to the clipboard">
                                            <Hash className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Copy File Path</span>
                                        </ContextMenuItem>
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // File ▸ — download, reveal, history, folder.
                            file: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Download, reveal in Explorer, local history, open the containing folder">
                                        <Download className="size-3.5 text-purple-500 shrink-0"/>
                                        <span className="flex-1">File</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-60">
                                        <ContextMenuItem onClick={handleDownload} className="gap-2 cursor-pointer"
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
                                        {/* View-mode twin of the editor's selection action — the DOM selection over the highlighted code becomes a new .py file. */}
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
                                            title="Create a NEW .py file whose content is the selected lines — asks for folder + name"
                                        >
                                            <FilePlus2 className="size-3.5 text-emerald-500 shrink-0"/>
                                            <span className="flex-1">New File From Selection…</span>
                                        </ContextMenuItem>
                                        {onOpenFolder && (
                                            <ContextMenuItem onClick={onOpenFolder}
                                                             disabled={!canOpenFolder || isOpeningFolder}
                                                             className="gap-2 cursor-pointer"
                                                             title="Open the containing folder in your OS file explorer">
                                                <FolderOpen className="size-3.5 text-cyan-500 shrink-0"/>
                                                <span className="flex-1">Open Containing Folder</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                            // View ▸ — theme + collapse.
                            view: () => (
                                <ContextMenuSub>
                                    <ContextMenuSubTrigger className="gap-2 cursor-pointer"
                                                           title="Code theme and collapse controls">
                                        <Palette className="size-3.5 text-muted-foreground shrink-0"/>
                                        <span className="flex-1">View</span>
                                    </ContextMenuSubTrigger>
                                    <ContextMenuSubContent className="w-56">
                                        <ContextMenuItem onClick={() => setShowThemePicker((v) => !v)}
                                                         className="gap-2 cursor-pointer"
                                                         title="Show or hide the code theme picker bar">
                                            <Palette className="size-3.5 text-muted-foreground shrink-0"/>
                                            <span className="flex-1">Code Theme…</span>
                                        </ContextMenuItem>
                                        {isCollapsible && !hasCells && !editMode && (
                                            <ContextMenuItem onClick={() => setExpanded((v) => !v)}
                                                             className="gap-2 cursor-pointer"
                                                             title={expanded ? "Show fewer lines (collapse)" : "Show the full code (expand)"}>
                                                <Code2 className="size-3.5 text-muted-foreground shrink-0"/>
                                                <span
                                                    className="flex-1">{expanded ? "Collapse Code" : "Expand Code"}</span>
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuSubContent>
                                </ContextMenuSub>),
                        }}
                    />
                </ContextMenuContent>
            )}
        </>
    );
}
